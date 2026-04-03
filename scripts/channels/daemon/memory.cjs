/**
 * memory.cjs — KAIROS-style 3-tier memory system for the channel daemon
 *
 * Tier 1: Chat History (short-term) — raw recent messages per chat
 *   → Auto-compacts when it exceeds MAX_MESSAGES, summarizing old messages
 *   → Like KAIROS's conversation context
 *
 * Tier 2: Session Memory (medium-term) — structured scratchpad per chat
 *   → Updated periodically via Claude summarization
 *   → Like KAIROS's SessionMemory markdown template
 *
 * Tier 3: User Profile (long-term) — facts about each user that persist forever
 *   → Extracted during dream consolidation
 *   → Like KAIROS's auto-memory with 4-type taxonomy
 *
 * All tiers persisted to disk. Survives daemon restarts.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_MESSAGES_PER_CHAT = 30;
const MAX_CONTEXT_CHARS = 6000;
const COMPACT_THRESHOLD = 20;
const DREAM_INTERVAL_MS = 3600000; // 1 hour
const SESSION_ROT_THRESHOLD = 5; // After N compactions, auto-rotate session
const MAX_SUMMARY_LENGTH = 3000;

class DaemonMemory {
  constructor(storageDir, rendererConfig) {
    this.storageDir = storageDir;
    this.rendererConfig = rendererConfig;

    // Tier 1: Chat history (recent messages)
    this.historyPath = path.join(storageDir, 'chat-history.json');
    this.chats = new Map();

    // Tier 2: Session summaries (structured per-chat scratchpad)
    this.summaryPath = path.join(storageDir, 'chat-summaries.json');
    this.summaries = new Map();

    // Tier 3: User profiles (long-term facts)
    this.profilePath = path.join(storageDir, 'user-profiles.json');
    this.profiles = new Map();

    // Dream state
    this.lastDream = 0;
    this.messagesSinceDream = 0;

    // Session rotation tracking (per chat)
    this.compactionCounts = new Map(); // chatId → number of compactions

    this._load();
  }

  // ── Tier 1: Chat History ─────────────────────────────────────────────────

  addMessage(chatId, role, text, user = '') {
    if (!this.chats.has(chatId)) this.chats.set(chatId, []);
    const history = this.chats.get(chatId);

    history.push({
      role,
      user,
      text: text.slice(0, 2000),
      timestamp: new Date().toISOString(),
    });

    this.messagesSinceDream++;

    // Auto-compact when history gets too long
    if (history.length > COMPACT_THRESHOLD) {
      this._compactChat(chatId);
    }

    // Trim hard cap
    while (history.length > MAX_MESSAGES_PER_CHAT) history.shift();
    this._saveHistory();
  }

  getContext(chatId) {
    const parts = [];

    // Tier 3: User profile (always included — long-term facts)
    const profile = this.profiles.get(chatId);
    if (profile && profile.facts.length > 0) {
      parts.push('Known facts about this user:\n' + profile.facts.map(f => `- ${f}`).join('\n'));
    }

    // Tier 2: Session summary (structured context)
    const summary = this.summaries.get(chatId);
    if (summary) {
      parts.push('Conversation summary:\n' + summary);
    }

    // Tier 1: Recent messages (freshest context)
    const history = this.chats.get(chatId) || [];
    if (history.length > 0) {
      let recent = '';
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        const line = msg.role === 'user' ? `[${msg.user}]: ${msg.text}` : `[You]: ${msg.text}`;
        if (recent.length + line.length > MAX_CONTEXT_CHARS - parts.join('\n').length) break;
        recent = line + '\n' + recent;
      }
      if (recent) parts.push('Recent messages:\n' + recent.trim());
    }

    return parts.join('\n\n');
  }

  // ── Tier 2: Compaction (summarize old messages) ──────────────────────────

  _compactChat(chatId) {
    const history = this.chats.get(chatId);
    if (!history || history.length < COMPACT_THRESHOLD) return;

    // Track compaction count for session rotation
    const count = (this.compactionCounts.get(chatId) || 0) + 1;
    this.compactionCounts.set(chatId, count);

    // Session rotation: after N compactions, the summaries are stale soup.
    // Wipe summaries and start fresh — but keep Tier 3 profile facts.
    // The user never notices because their profile (name, preferences) persists.
    if (count >= SESSION_ROT_THRESHOLD) {
      this.summaries.delete(chatId);
      this.compactionCounts.set(chatId, 0);
      history.length = 0; // Clear all history
      this._saveHistory();
      this._saveSummaries();
      return; // Fresh session — profile facts carry over automatically
    }

    // Normal compaction: summarize older half
    const cutoff = Math.floor(history.length / 2);
    const oldMessages = history.slice(0, cutoff);

    const transcript = oldMessages
      .map(m => `${m.role === 'user' ? m.user : 'Assistant'}: ${m.text}`)
      .join('\n')
      .slice(0, 4000);

    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const summary = execSync(
        `claude -p "Summarize this conversation in 2-3 sentences, noting key topics, decisions, and any facts about the user: ${transcript.replace(/"/g, '\\"').replace(/\n/g, ' ')}" --dangerously-skip-permissions --model haiku --max-turns 1`,
        {
          encoding: 'utf8',
          timeout: 30000,
          env,
          windowsHide: true,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      // Update Tier 2 summary (cap total length to prevent rot)
      const existing = this.summaries.get(chatId) || '';
      this.summaries.set(chatId, (existing + '\n' + summary).trim().slice(-MAX_SUMMARY_LENGTH));
      this._saveSummaries();

      // Remove compacted messages from Tier 1
      history.splice(0, cutoff);
      this._saveHistory();
    } catch {
      history.splice(0, cutoff);
      this._saveHistory();
    }
  }

  // ── Tier 3: Dream Consolidation ──────────────────────────────────────────

  shouldDream() {
    const elapsed = Date.now() - this.lastDream;
    return elapsed > DREAM_INTERVAL_MS && this.messagesSinceDream >= 5;
  }

  /**
   * Dream consolidation — KAIROS-style 4-phase memory synthesis.
   *
   * Phase 1 (Orient): Review existing profiles and summaries
   * Phase 2 (Gather): Extract new signal from recent conversations
   * Phase 3 (Consolidate): Merge new facts, update summaries, resolve conflicts
   * Phase 4 (Prune): Remove stale/contradicted facts, keep profiles tight
   *
   * @param {boolean} force — skip the shouldDream gate
   * @returns {string|null} — result message or null if skipped
   */
  dream(force = false) {
    if (!force && !this.shouldDream()) return null;

    // Gather all context across all chats
    const allContext = [];
    const existingProfiles = [];
    for (const [chatId, history] of this.chats) {
      const summary = this.summaries.get(chatId) || '';
      const profile = this.profiles.get(chatId);
      const recent = history
        .slice(-15)
        .map(m => `${m.role === 'user' ? m.user : 'Assistant'}: ${m.text}`)
        .join('\n');

      allContext.push(`Chat ${chatId}:\nRecent messages:\n${recent}`);
      if (summary) allContext.push(`Previous summary: ${summary}`);
      if (profile && profile.facts.length > 0) {
        existingProfiles.push(`Chat ${chatId} known facts: ${profile.facts.join('; ')}`);
      }
    }

    if (allContext.length === 0) return null;

    const context = allContext.join('\n---\n').slice(0, 5000);
    const existing = existingProfiles.join('\n').slice(0, 1500);

    // Build a simple flat prompt — avoid JSON in the command line to prevent shell escaping issues
    const dreamPrompt = [
      'Extract durable facts about users from these chat conversations.',
      'Return ONLY a JSON array. Format: [{"chatId":"CHAT_ID_HERE","facts":["fact 1","fact 2"]}]',
      'Focus on: user name, role, projects, preferences, technical expertise, corrections.',
      'Only genuinely useful permanent facts. Not conversation details.',
      existing ? `\nExisting facts to keep if still valid:\n${existing}` : '',
      `\nConversations:\n${context}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Escape for shell — replace problematic chars
    const safePrompt = dreamPrompt
      .replace(/"/g, "'") // Replace double quotes with single
      .replace(/\n/g, ' ') // Flatten newlines
      .replace(/\\/g, '') // Remove backslashes
      .slice(0, 6000);

    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const result = execSync(
        `claude -p "${safePrompt}" --dangerously-skip-permissions --model sonnet --max-turns 1`,
        {
          encoding: 'utf8',
          timeout: 90000,
          env,
          windowsHide: true,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        let factsAdded = 0;
        let factsPruned = 0;

        for (const { chatId, facts, pruned } of extracted) {
          if (!chatId || !Array.isArray(facts)) continue;
          const existing = this.profiles.get(chatId) || { facts: [], lastDream: '' };

          // Phase 4: Prune — remove stale facts
          if (Array.isArray(pruned)) {
            const prunedSet = new Set(pruned.map(f => f.toLowerCase()));
            const before = existing.facts.length;
            existing.facts = existing.facts.filter(f => !prunedSet.has(f.toLowerCase()));
            factsPruned += before - existing.facts.length;
          }

          // Phase 3: Consolidate — merge new facts
          const allFacts = new Set(existing.facts);
          for (const fact of facts) {
            if (!allFacts.has(fact)) {
              allFacts.add(fact);
              factsAdded++;
            }
          }

          existing.facts = [...allFacts].slice(0, 50);
          existing.lastDream = new Date().toISOString();
          this.profiles.set(chatId, existing);
        }
        this._saveProfiles();

        this.lastDream = Date.now();
        this.messagesSinceDream = 0;

        return `Dream complete: ${factsAdded} facts added, ${factsPruned} pruned across ${extracted.length} chat(s)`;
      }

      this.lastDream = Date.now();
      this.messagesSinceDream = 0;
      return 'Dream complete (no structured output extracted)';
    } catch (err) {
      this.lastDream = Date.now();
      return `Dream failed: ${err.message?.slice(0, 100)}`;
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getChatIds() {
    return [...this.chats.keys()];
  }

  getProfile(chatId) {
    return this.profiles.get(chatId) || { facts: [] };
  }

  getStats() {
    return {
      chats: this.chats.size,
      totalMessages: [...this.chats.values()].reduce((n, h) => n + h.length, 0),
      profiles: this.profiles.size,
      messagesSinceDream: this.messagesSinceDream,
      lastDream: this.lastDream ? new Date(this.lastDream).toISOString() : 'never',
    };
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  _load() {
    try {
      if (fs.existsSync(this.historyPath))
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(this.historyPath, 'utf8'))))
          this.chats.set(k, v);
    } catch {}
    try {
      if (fs.existsSync(this.summaryPath))
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(this.summaryPath, 'utf8'))))
          this.summaries.set(k, v);
    } catch {}
    try {
      if (fs.existsSync(this.profilePath))
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(this.profilePath, 'utf8'))))
          this.profiles.set(k, v);
    } catch {}
  }

  _saveHistory() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.chats) obj[k] = v;
      fs.writeFileSync(this.historyPath, JSON.stringify(obj), 'utf8');
    } catch {}
  }

  _saveSummaries() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.summaries) obj[k] = v;
      fs.writeFileSync(this.summaryPath, JSON.stringify(obj), 'utf8');
    } catch {}
  }

  _saveProfiles() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.profiles) obj[k] = v;
      fs.writeFileSync(this.profilePath, JSON.stringify(obj), 'utf8');
    } catch {}
  }
}

module.exports = { DaemonMemory, DREAM_INTERVAL_MS };
