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
const { claudeSync } = require('./claude-cli.cjs');

const MAX_MESSAGES_PER_CHAT = 30;
const MAX_CONTEXT_CHARS = 6000;
const COMPACT_THRESHOLD = 20;
const DREAM_INTERVAL_MS = 3600000; // 1 hour
const SESSION_ROT_THRESHOLD = 5; // After N compactions, auto-rotate session
const MAX_SUMMARY_LENGTH = 3000;

/**
 * Atomic file write — write to temp file then rename.
 * Prevents data corruption from crashes mid-write.
 */
function atomicWriteSync(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

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

    // Daemon metadata (persisted across restarts)
    this.metadataPath = path.join(storageDir, 'daemon-metadata.json');
    this.lastDream = 0;
    this.messagesSinceDream = 0;
    this.compactionCounts = new Map();

    // Named sessions for /title + /resume
    this.namedSessionsPath = path.join(storageDir, 'named-sessions.json');
    this.namedSessions = new Map();

    // Per-user usage tracking
    this.usagePath = path.join(storageDir, 'usage.json');
    this.usage = new Map(); // chatId → { dates: { 'YYYY-MM-DD': { tokens, cost, messages, models: {} } } }

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
        const line =
          msg.role === 'user'
            ? `[${msg.user}]: ${msg.text}`
            : msg.role === 'system'
              ? `[System]: ${msg.text}`
              : `[You]: ${msg.text}`;
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
      this._saveMetadata();
      return; // Fresh session — profile facts carry over automatically
    }

    // Normal compaction: summarize older half
    const cutoff = Math.floor(history.length / 2);
    const oldMessages = history.slice(0, cutoff);

    const transcript = oldMessages
      .map(m => {
        if (m.role === 'user') return `${m.user}: ${m.text}`;
        if (m.role === 'system') return `[System]: ${m.text}`;
        return `Assistant: ${m.text}`;
      })
      .join('\n')
      .slice(0, 4000);

    try {
      const compactPrompt = [
        'Summarize this conversation into these sections (omit empty ones, keep each section to 1-2 lines):',
        '# Topic: (what is being discussed)',
        '# Current State: (what is actively happening, pending items)',
        '# Key Facts: (important decisions, facts about the user)',
        '# Errors & Corrections: (what went wrong, what the user corrected)',
        '# Learnings: (what worked, what to avoid)',
        'Conversation:',
        transcript,
      ].join('\n');

      const summary = claudeSync(compactPrompt, {
        model: 'haiku',
        maxTurns: 1,
        timeout: 30000,
      });

      // Update Tier 2 summary — replace old summary with new combined one.
      // If combined text exceeds budget, keep only the latest summary (ACC-style full replacement).
      const existing = this.summaries.get(chatId) || '';
      const combined = (existing + '\n---\n' + summary).trim();
      this.summaries.set(
        chatId,
        combined.length > MAX_SUMMARY_LENGTH
          ? summary.trim().slice(0, MAX_SUMMARY_LENGTH)
          : combined
      );
      this._saveSummaries();

      // Remove compacted messages from Tier 1
      history.splice(0, cutoff);
      this._saveHistory();
      this._saveMetadata();
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
  // eslint-disable-next-line complexity
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
      `Return ONLY a JSON array. Use EXACT chatId values from below. Format: [{"chatId":"<exact chatId>","facts":["fact 1","fact 2"]}]`,
      `Valid chatIds: ${[...this.chats.keys()].join(', ')}`,
      'Focus on: user name, role, projects, preferences, technical expertise, corrections.',
      'Only genuinely useful permanent facts. Not conversation details.',
      existing ? `\nExisting facts to keep if still valid:\n${existing}` : '',
      `\nConversations:\n${context}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = claudeSync(dreamPrompt, {
        model: 'sonnet',
        maxTurns: 1,
        timeout: 90000,
      });

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
            // eslint-disable-next-line max-depth
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
        this._saveMetadata();

        return `Dream complete: ${factsAdded} facts added, ${factsPruned} pruned across ${extracted.length} chat(s)`;
      }

      this.lastDream = Date.now();
      this.messagesSinceDream = 0;
      this._saveMetadata();
      return 'Dream complete (no structured output extracted)';
    } catch (err) {
      this.lastDream = Date.now();
      this._saveMetadata();
      return `Dream failed: ${err.message?.slice(0, 100)}`;
    }
  }

  // ── Usage Tracking ──────────────────────────────────────────────────────

  trackUsage(chatId, model, estimatedTokens) {
    const today = new Date().toISOString().split('T')[0];
    const costRates = { haiku: 0.8, sonnet: 3.0, opus: 15.0 };
    const rate = costRates[model] || 3.0;
    const cost = (estimatedTokens / 1_000_000) * rate;

    if (!this.usage.has(chatId)) this.usage.set(chatId, { dates: {} });
    const user = this.usage.get(chatId);
    if (!user.dates[today]) user.dates[today] = { tokens: 0, cost: 0, messages: 0, models: {} };
    const day = user.dates[today];
    day.tokens += estimatedTokens;
    day.cost += cost;
    day.messages += 1;
    day.models[model] = (day.models[model] || 0) + 1;
    this._saveUsage();
  }

  getUsage(chatId) {
    const data = this.usage.get(chatId);
    if (!data) return { today: null, week: null, month: null };

    const today = new Date().toISOString().split('T')[0];
    const todayStats = data.dates[today] || null;

    // Aggregate week + month
    const now = Date.now();
    let weekTokens = 0,
      weekCost = 0,
      weekMsgs = 0;
    let monthTokens = 0,
      monthCost = 0,
      monthMsgs = 0;
    for (const [date, stats] of Object.entries(data.dates)) {
      const age = now - new Date(date).getTime();
      if (age < 7 * 86400000) {
        weekTokens += stats.tokens;
        weekCost += stats.cost;
        weekMsgs += stats.messages;
      }
      if (age < 30 * 86400000) {
        monthTokens += stats.tokens;
        monthCost += stats.cost;
        monthMsgs += stats.messages;
      }
    }

    return {
      today: todayStats,
      week: { tokens: weekTokens, cost: weekCost, messages: weekMsgs },
      month: { tokens: monthTokens, cost: monthCost, messages: monthMsgs },
    };
  }

  _saveUsage() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.usage) obj[k] = v;
      atomicWriteSync(this.usagePath, JSON.stringify(obj));
    } catch {
      /* ignored */
    }
  }

  // ── Named Sessions ───────────────────────────────────────────────────────

  saveNamedSession(chatId, name) {
    const history = this.chats.get(chatId) || [];
    const summary = this.summaries.get(chatId) || '';
    this.namedSessions.set(name, {
      chatId,
      history: history.slice(-20), // Keep last 20 messages
      summary,
      savedAt: new Date().toISOString(),
    });
    this._saveNamedSessions();
  }

  loadNamedSession(chatId, name) {
    const session = this.namedSessions.get(name);
    if (!session) return false;
    this.chats.set(chatId, [...session.history]);
    this.summaries.set(chatId, session.summary);
    this._saveHistory();
    this._saveSummaries();
    return true;
  }

  listNamedSessions() {
    return [...this.namedSessions.entries()].map(([name, s]) => ({
      name,
      savedAt: s.savedAt,
      messageCount: s.history.length,
    }));
  }

  _saveNamedSessions() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.namedSessions) obj[k] = v;
      atomicWriteSync(this.namedSessionsPath, JSON.stringify(obj));
    } catch {
      /* ignored */
    }
  }

  // ── Daily Activity Log ────────────────────────────────────────────────────

  appendDailyLog(chatId, user, text, response) {
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const logDir = path.join(this.storageDir, 'logs', dateStr.slice(0, 4), dateStr.slice(5, 7));
      fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, `${dateStr}.md`);
      const ts = now.toISOString().slice(11, 19); // HH:MM:SS
      const entry = `\n### ${ts} — ${user} (${chatId})\n**User:** ${text.slice(0, 200)}\n**Assistant:** ${response.slice(0, 200)}\n`;
      fs.appendFileSync(logFile, entry, 'utf8');
    } catch {
      /* ignored */
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

  _loadJsonFile(filePath, mapTarget) {
    if (!fs.existsSync(filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [k, v] of Object.entries(data)) mapTarget.set(k, v);
    } catch (err) {
      console.error(`[memory] Corrupt or unreadable file: ${filePath} — ${err.message}`);
    }
  }

  _load() {
    this._loadJsonFile(this.historyPath, this.chats);
    this._loadJsonFile(this.summaryPath, this.summaries);
    this._loadJsonFile(this.profilePath, this.profiles);
    this._loadJsonFile(this.namedSessionsPath, this.namedSessions);
    this._loadJsonFile(this.usagePath, this.usage);

    // Restore daemon metadata (dream state, compaction counts)
    try {
      if (fs.existsSync(this.metadataPath)) {
        const meta = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
        this.lastDream = meta.lastDream || 0;
        this.messagesSinceDream = meta.messagesSinceDream || 0;
        if (meta.compactionCounts) {
          for (const [k, v] of Object.entries(meta.compactionCounts)) {
            this.compactionCounts.set(k, v);
          }
        }
      }
    } catch (err) {
      console.error(`[memory] Corrupt metadata: ${err.message}`);
    }
  }

  _saveHistory() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.chats) obj[k] = v;
      atomicWriteSync(this.historyPath, JSON.stringify(obj));
    } catch {
      /* ignored */
    }
  }

  _saveSummaries() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.summaries) obj[k] = v;
      atomicWriteSync(this.summaryPath, JSON.stringify(obj));
    } catch {
      /* ignored */
    }
  }

  _saveProfiles() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.profiles) obj[k] = v;
      atomicWriteSync(this.profilePath, JSON.stringify(obj));
    } catch {
      /* ignored */
    }
  }

  _saveMetadata() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const compactionObj = {};
      for (const [k, v] of this.compactionCounts) compactionObj[k] = v;
      atomicWriteSync(
        this.metadataPath,
        JSON.stringify({
          lastDream: this.lastDream,
          messagesSinceDream: this.messagesSinceDream,
          compactionCounts: compactionObj,
        })
      );
    } catch {
      /* ignored */
    }
  }
}

module.exports = { DaemonMemory, DREAM_INTERVAL_MS };
