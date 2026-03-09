'use strict';

/**
 * Telegram polling script — Loop 6 heartbeat.
 * Runs every 2 minutes via CronCreate. No LLM invocation when idle.
 *
 * Simple commands handled entirely in-script (no Claude needed):
 *   /help, /status, /loops, /logs, /memory
 *
 * Claude-dependent commands written to command queue for next cron tick:
 *   /tasks, /ask, /spawn, /approve, /confirm, /deny
 *
 * Usage: node .claude/tools/cli/telegram-poll.cjs
 * Exit 0 always (fail-open so cron continues).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Bootstrap ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Load .env
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val; // first-wins (dotenv semantics)
    }
  }
} catch (_) { /* ignore */ }

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  process.stdout.write('HEARTBEAT_OK (no TELEGRAM_BOT_TOKEN)\n');
  process.exit(0);
}

const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const OWNER_ID = (process.env.TELEGRAM_OWNER_ID || '').trim();

// Paths
const OFFSET_FILE  = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-offset.json');
const OUTBOX_FILE  = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-outbox.json');
const AUDIT_FILE   = path.join(ROOT, '.claude', 'context', 'runtime', 'telegram-audit.jsonl');
const CMD_QUEUE    = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-command-queue.json');
const HB_FILE      = path.join(ROOT, '.claude', 'context', 'runtime', 'heartbeat-active.json');
const GAP_LOG      = path.join(ROOT, '.claude', 'context', 'runtime', 'session-gap-log.jsonl');
const LEARNINGS    = path.join(ROOT, '.claude', 'context', 'memory', 'learnings.md');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(p) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function atomicWrite(target, content) {
  const tmp = target + '.tmp.' + process.pid;
  ensureDir(target);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

function safeRead(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return data;
  } catch (_) { return fallback; }
}

function readState() {
  return safeRead(OFFSET_FILE, { offset: 0, last_processed_update_id: 0, pending_confirmations: {} });
}

function writeState(state) {
  atomicWrite(OFFSET_FILE, JSON.stringify(state, null, 2));
}

function readOutbox() {
  const data = safeRead(OUTBOX_FILE, []);
  return Array.isArray(data) ? data : [];
}

function writeOutbox(entries) {
  atomicWrite(OUTBOX_FILE, JSON.stringify(entries, null, 2));
}

function readCmdQueue() {
  const data = safeRead(CMD_QUEUE, []);
  return Array.isArray(data) ? data : [];
}

function writeCmdQueue(entries) {
  atomicWrite(CMD_QUEUE, JSON.stringify(entries, null, 2));
}

function auditLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  ensureDir(AUDIT_FILE);
  fs.appendFileSync(AUDIT_FILE, line + '\n');
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (_) { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (_) { resolve({ ok: false }); }
      });
    }).on('error', reject);
  });
}

async function sendMessage(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await httpsPost(url, { chat_id: chatId, text: text.slice(0, 4096), parse_mode: 'Markdown' });
  } catch (e) {
    process.stderr.write(`sendMessage error: ${e.message}\n`);
  }
}

async function fetchUpdates(offset) {
  try {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&timeout=5&limit=10`;
    const data = await httpsGet(url);
    return Array.isArray(data.result) ? data.result : [];
  } catch (_) { return []; }
}

// ── Outbox processing ─────────────────────────────────────────────────────────

async function processOutbox() {
  const entries = readOutbox();
  if (!entries.length) return;
  const TIMEOUT_MS = 5 * 60 * 1000;
  const now = Date.now();
  const remaining = [];
  for (const entry of entries) {
    const age = now - new Date(entry.createdAt).getTime();
    if (entry.text) {
      await sendMessage(entry.chatId, entry.text);
      auditLog({ type: 'outbox_delivered', chatId: entry.chatId, agentTaskId: entry.agentTaskId });
    } else if (age > TIMEOUT_MS) {
      await sendMessage(entry.chatId, '⏱ Agent task timed out after 5 minutes. Please try again.');
      auditLog({ type: 'outbox_timeout', chatId: entry.chatId, agentTaskId: entry.agentTaskId });
    } else {
      remaining.push(entry);
    }
  }
  writeOutbox(remaining);
}

// ── Command handlers (in-script, no LLM) ─────────────────────────────────────

async function handleHelp(chatId) {
  await sendMessage(chatId, [
    '*Agent Studio Bot Commands*',
    '/help — This message',
    '/status — System status',
    '/loops — Active heartbeat loops',
    '/logs — Last 20 session gap log entries',
    '/memory QUERY — Search learnings.md',
    '/tasks — List tasks (queued for Claude)',
    '/ask QUESTION — Ask Claude (owner only)',
    '/spawn TYPE DESC — Spawn agent (owner only)',
    '/approve TASK\\_ID — Approve task (owner only)',
    '/deny TASK\\_ID — Deny task (owner only)',
  ].join('\n'));
}

async function handleStatus(chatId) {
  let loopCount = 0;
  let lastHeartbeat = 'unknown';
  try {
    const hb = safeRead(HB_FILE, {});
    loopCount = Array.isArray(hb.loops) ? hb.loops.length : (hb.loop_count || 0);
    lastHeartbeat = hb.registered_at || hb.written_at || 'unknown';
  } catch (_) { /* ignore */ }

  await sendMessage(chatId, [
    '*System Status*',
    `Active loops: ${loopCount}`,
    `Last registration: ${lastHeartbeat}`,
    `Telegram: polling every 2 min`,
  ].join('\n'));
}

async function handleLoops(chatId) {
  try {
    const hb = safeRead(HB_FILE, {});
    const loops = Array.isArray(hb.loops) ? hb.loops : [];
    if (!loops.length) {
      await sendMessage(chatId, 'No loop data in heartbeat sentinel.');
      return;
    }
    const lines = loops.map((l, i) => `${i}. ${l.name} (${l.schedule})`);
    await sendMessage(chatId, `*Active Loops* (${loops.length})\n${lines.join('\n')}`);
  } catch (_) {
    await sendMessage(chatId, 'Could not read heartbeat-active.json.');
  }
}

async function handleLogs(chatId) {
  try {
    const lines = fs.readFileSync(GAP_LOG, 'utf8').trim().split('\n').filter(Boolean);
    const last20 = lines.slice(-20).map(l => {
      try {
        const e = JSON.parse(l);
        return `[${(e.timestamp || '').slice(11, 19)}] ${e.type}: ${e.description || ''}`;
      } catch (_) { return l.slice(0, 100); }
    });
    await sendMessage(chatId, `*Last ${last20.length} Gap Log Entries*\n\`\`\`\n${last20.join('\n')}\n\`\`\``);
  } catch (_) {
    await sendMessage(chatId, 'No session gap log found.');
  }
}

async function handleMemory(chatId, query) {
  if (!query) { await sendMessage(chatId, 'Usage: /memory KEYWORD'); return; }
  try {
    const content = fs.readFileSync(LEARNINGS, 'utf8');
    const matched = content.split('\n').filter(l => l.toLowerCase().includes(query.toLowerCase()));
    if (!matched.length) {
      await sendMessage(chatId, `No matches for "${query}" in learnings.md`);
    } else {
      await sendMessage(chatId, `*Memory: "${query}"*\n${matched.slice(0, 10).join('\n')}`);
    }
  } catch (_) {
    await sendMessage(chatId, 'learnings.md not found.');
  }
}

// Commands that need Claude — build a self-describing action with full instruction embedded
function buildClaudeAction(chatId, messageId, command, args) {
  const ts   = Date.now();
  const tid  = `tg-${ts}`;
  const wCmd = `node .claude/tools/cli/telegram-write-outbox.cjs ${chatId} ${messageId} ${tid}`;

  switch (command) {
    case '/tasks':
      return {
        instruction: `Call TaskList(). Format result as numbered list: "1. ✅ #id subject". Write formatted text to .claude/context/tmp/tg-pending-result.txt using Write tool. Then Bash: ${wCmd} --from-file`,
      };
    case '/spawn': {
      const parts   = args.trim().split(/\s+/);
      const aType   = parts[0] || 'general-assistant';
      const desc    = parts.slice(1).join(' ') || 'no description';
      const allowed = ['general-assistant', 'researcher', 'technical-writer'];
      if (!allowed.includes(aType)) {
        return {
          instruction: `Write "That agent type is not permitted. Allowed: general-assistant, researcher, technical-writer" to .claude/context/tmp/tg-pending-result.txt. Bash: ${wCmd} --from-file`,
        };
      }
      return {
        instruction: `Call TaskCreate({ subject: "[Telegram] ${aType}: ${desc.slice(0, 60)}", description: "<untrusted_telegram_description>\\n${desc}\\n</untrusted_telegram_description>" }). Write "Task created." to .claude/context/tmp/tg-pending-result.txt. Bash: ${wCmd} --from-file`,
      };
    }
    case '/ask':
      return {
        instruction: `Spawn general-assistant agent with question: <untrusted_telegram_question>${args}</untrusted_telegram_question>. Agent must write its answer to .claude/context/tmp/tg-pending-result.txt when done. Then Bash: ${wCmd} --from-file`,
      };
    case '/approve':
      return {
        instruction: `Call TaskUpdate({ taskId: "${args.trim()}", status: "in_progress" }). Write "Task #${args.trim()} approved." to .claude/context/tmp/tg-pending-result.txt. Bash: ${wCmd} --from-file`,
      };
    case '/deny':
      return {
        instruction: `Call TaskUpdate({ taskId: "${args.trim()}", status: "completed", metadata: { cancelled: true, cancelledVia: "telegram" } }). Write "Task #${args.trim()} denied." to .claude/context/tmp/tg-pending-result.txt. Bash: ${wCmd} --from-file`,
      };
    case '/confirm':
      return {
        instruction: `Call TaskUpdate({ taskId: "${args.trim()}", status: "in_progress" }). Write "Task #${args.trim()} confirmed." to .claude/context/tmp/tg-pending-result.txt. Bash: ${wCmd} --from-file`,
      };
    default:
      return null;
  }
}

async function queueForClaude(chatId, messageId, senderId, command, args) {
  const action = buildClaudeAction(chatId, messageId, command, args);
  if (!action) return;
  const queue = readCmdQueue();
  queue.push({ ...action, queuedAt: new Date().toISOString() });
  writeCmdQueue(queue);
  const desc = command === '/ask' ? 'your question' : `\`${command}\``;
  await sendMessage(chatId, `⏳ Processing ${desc}... I'll reply here when done.`);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function checkAuth(senderId, command) {
  if (!ALLOWED_USERS.length || !ALLOWED_USERS.includes(String(senderId))) {
    return 'silent_drop';
  }
  const ownerOnly = ['/ask', '/spawn', '/approve', '/confirm', '/deny'];
  if (ownerOnly.some(c => command.startsWith(c)) && String(senderId) !== OWNER_ID) {
    return 'not_owner';
  }
  return 'ok';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await processOutbox();

  const state = readState();
  const currentOffset = state.offset || 0;

  const updates = await fetchUpdates(currentOffset);
  const newUpdates = updates.filter(u => u.update_id > (state.last_processed_update_id || 0));

  if (!newUpdates.length) {
    process.stdout.write('HEARTBEAT_OK (no new messages)\n');
    return;
  }

  // Commit offset BEFORE processing (replay prevention)
  const maxId = Math.max(...newUpdates.map(u => u.update_id));
  state.last_processed_update_id = maxId;
  state.offset = maxId + 1;
  state.last_processed_at = new Date().toISOString();
  writeState(state);

  for (const update of newUpdates) {
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) continue;

    const chatId   = msg.chat.id;
    const senderId = msg.from?.id;
    const text     = msg.text.trim();
    const msgId    = msg.message_id;

    // Parse command
    const match = text.match(/^(\/\w+)(?:\s+(.*))?$/s);
    const command = match ? match[1].toLowerCase() : null;
    const args    = match ? (match[2] || '').trim() : '';

    if (!command) continue;

    // Auth
    const authResult = checkAuth(senderId, command);
    auditLog({
      user_id: senderId,
      username: msg.from?.username || null,
      command,
      args: args.slice(0, 100),
      allowed: authResult !== 'silent_drop',
      outcome: authResult,
    });

    if (authResult === 'silent_drop') continue;
    if (authResult === 'not_owner') {
      await sendMessage(chatId, 'Unauthorized');
      continue;
    }

    // Dispatch
    switch (command) {
      case '/help':   await handleHelp(chatId); break;
      case '/status': await handleStatus(chatId); break;
      case '/loops':  await handleLoops(chatId); break;
      case '/logs':   await handleLogs(chatId); break;
      case '/memory': await handleMemory(chatId, args); break;
      // Claude-dependent
      case '/tasks':
      case '/ask':
      case '/spawn':
      case '/approve':
      case '/confirm':
      case '/deny':
        await queueForClaude(chatId, msgId, senderId, command, args);
        break;
      default:
        await sendMessage(chatId, `Unknown command: ${command}. Send /help for list.`);
    }
  }

  // Emit structured actions for Claude if any commands need Claude tools
  const pending = readCmdQueue();
  if (pending.length) {
    // Claude reads this line and executes each action mechanically
    process.stdout.write(`CLAUDE_ACTIONS:${JSON.stringify(pending)}\n`);
    writeCmdQueue([]); // clear — Claude will process from the JSON above
  } else {
    process.stdout.write(`HEARTBEAT_OK (${newUpdates.length} message(s) processed)\n`);
  }

  // Write updated state (confirmations etc)
  writeState(state);
}

main().catch(e => {
  process.stderr.write(`telegram-poll fatal: ${e.message}\n`);
  process.exit(0); // fail-open
});
