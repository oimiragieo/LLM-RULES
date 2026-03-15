'use strict';

/**
 * Telegram polling script — Loop 6 heartbeat.
 * Runs every 2 minutes via CronCreate. No LLM invocation when idle.
 *
 * Simple commands handled entirely in-script (no Claude needed):
 *   /help, /status, /loops, /logs, /memory
 *
 * Claude-dependent commands invoked INLINE (direct claude -p call):
 *   /ask <text>       — invoke Claude with text, send response back
 *   <free-form text>  — route free-form messages to Claude
 *
 * Other Claude-dependent commands queued for background processing:
 *   /tasks, /research, /skill, /agent, /workflow,
 *   /spawn, /approve, /confirm, /deny
 *
 * Usage: node .claude/tools/cli/telegram-poll.cjs
 * Exit 0 always (fail-open so cron continues).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { sanitizeCreatorName, buildClaudeAction } = require('./telegram-command-router.cjs');

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
} catch (_) {
  /* ignore */
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  process.stdout.write('HEARTBEAT_OK (no TELEGRAM_BOT_TOKEN)\n');
  process.exit(0);
}

const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const OWNER_ID = (process.env.TELEGRAM_OWNER_ID || '').trim();

// Paths
const OFFSET_FILE = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-offset.json');
const OUTBOX_FILE = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-outbox.json');
const AUDIT_FILE = path.join(ROOT, '.claude', 'context', 'runtime', 'telegram-audit.jsonl');
const CMD_QUEUE = path.join(ROOT, '.claude', 'context', 'tmp', 'telegram-command-queue.json');
const HB_FILE = path.join(ROOT, '.claude', 'context', 'runtime', 'heartbeat-active.json');
const GAP_LOG = path.join(ROOT, '.claude', 'context', 'runtime', 'session-gap-log.jsonl');
const LEARNINGS = path.join(ROOT, '.claude', 'context', 'memory', 'learnings.md');
const CRON_ACTIONS_QUEUE = path.join(
  ROOT,
  '.claude',
  'context',
  'runtime',
  'cron-actions-queue.jsonl'
);

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
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    // Use safeParseJSON for prototype-pollution protection on untrusted content.
    // safeParseJSON returns Object.create(null) on parse failure (not the fallback type).
    // We recover by checking the result matches the expected fallback type.
    const result = safeParseJSON(raw);
    const expectedType = Array.isArray(fallback) ? 'array' : typeof fallback;
    if (expectedType === 'array' && !Array.isArray(result)) return fallback;
    if (expectedType === 'object' && (typeof result !== 'object' || Array.isArray(result)))
      return fallback;
    return result;
  } catch (_) {
    return fallback;
  }
}

function readState() {
  return safeRead(OFFSET_FILE, {
    offset: 0,
    last_processed_update_id: 0,
    pending_confirmations: {},
  });
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

// ── Claude invocation ────────────────────────────────────────────────────────

/**
 * Invoke Claude headlessly via `cmd.exe /c claude -p <prompt>`.
 * Uses cmd.exe wrapper because the npm-installed `claude` is a .cmd script
 * that cannot be spawned directly with shell:false on Windows.
 * CLAUDECODE env var is unset to prevent the nested-session guard from blocking.
 *
 * @param {string} prompt - The prompt to send to Claude
 * @param {number} [timeoutMs=90000] - Timeout in milliseconds
 * @returns {string} - Claude's response text
 * @throws {Error} - If Claude exits non-zero or times out
 */
function invokeClaude(prompt, timeoutMs) {
  const timeout = timeoutMs || 90000;
  const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';

  // On Windows, npm-installed CLI scripts are .cmd files — must run via cmd.exe
  // shell: false is required to prevent shell injection (security rule)
  const result = spawnSync('cmd.exe', ['/c', claudePath, '-p', prompt, '--output-format', 'text'], {
    encoding: 'utf8',
    timeout,
    shell: false,
    env: Object.assign({}, process.env, {
      CLAUDECODE: '', // unset nested-session guard
    }),
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const errSnippet = (result.stderr || '').slice(0, 300);
    throw new Error(`claude exited ${result.status}: ${errSnippet}`);
  }
  return (result.stdout || '').trim();
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      res => {
        let buf = '';
        res.on('data', c => {
          buf += c;
        });
        res.on('end', () => {
          const parsed = safeParseJSON(buf);
          // safeParseJSON returns Object.create(null) on parse failure
          const isValid =
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            Object.getPrototypeOf(parsed) !== null;
          resolve(isValid ? parsed : { ok: false });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https
      .get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
        let buf = '';
        res.on('data', c => {
          buf += c;
        });
        res.on('end', () => {
          const parsed = safeParseJSON(buf);
          // safeParseJSON returns Object.create(null) on parse failure
          const isValid =
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            Object.getPrototypeOf(parsed) !== null;
          resolve(isValid ? parsed : { ok: false });
        });
      })
      .on('error', reject);
  });
}

async function sendMessage(chatId, text, useMarkdown = false) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const safeText = text.slice(0, 4096);
  try {
    const body = { chat_id: chatId, text: safeText };
    if (useMarkdown) body.parse_mode = 'Markdown';
    const result = await httpsPost(url, body);
    if (!result.ok && useMarkdown) {
      // Markdown parse failed — retry as plain text
      await httpsPost(url, { chat_id: chatId, text: safeText });
    }
  } catch (e) {
    process.stderr.write(`sendMessage error: ${e.message}\n`);
  }
}

async function fetchUpdates(offset) {
  try {
    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&timeout=5&limit=10`;
    const data = await httpsGet(url);
    return Array.isArray(data.result) ? data.result : [];
  } catch (_) {
    return [];
  }
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
  await sendMessage(
    chatId,
    [
      '*Agent Studio Bot Commands*',
      '/help — This message',
      '/status — System status',
      '/loops — Active heartbeat loops',
      '/logs — Last 20 session gap log entries',
      '/memory QUERY — Search learnings.md',
      '/tasks — List tasks (queued for Claude)',
      '/ask QUESTION — Ask Claude (owner only)',
      '/research TOPIC — Deep research via researcher agent (owner only)',
      '/skill NAME DESC — Create a new skill (owner only, Gate 4)',
      '/agent NAME DESC — Create a new agent (owner only, Gate 4)',
      '/workflow NAME DESC — Create a new workflow (owner only, Gate 4)',
      '/spawn TYPE DESC — Spawn agent (owner only)',
      '/approve TASK\\_ID — Approve task (owner only)',
      '/deny TASK\\_ID — Deny task (owner only)',
    ].join('\n'),
    true
  );
}

async function handleStatus(chatId) {
  let loopCount = 0;
  let lastHeartbeat = 'unknown';
  try {
    const hb = safeRead(HB_FILE, {});
    loopCount = Array.isArray(hb.loops) ? hb.loops.length : hb.loop_count || 0;
    lastHeartbeat = hb.registered_at || hb.written_at || 'unknown';
  } catch (_) {
    /* ignore */
  }

  await sendMessage(
    chatId,
    [
      '*System Status*',
      `Active loops: ${loopCount}`,
      `Last registration: ${lastHeartbeat}`,
      `Telegram: polling every 2 min`,
    ].join('\n'),
    true
  );
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
    await sendMessage(chatId, `*Active Loops* (${loops.length})\n${lines.join('\n')}`, true);
  } catch (_) {
    await sendMessage(chatId, 'Could not read heartbeat-active.json.');
  }
}

async function handleLogs(chatId) {
  try {
    const lines = fs.readFileSync(GAP_LOG, 'utf8').trim().split('\n').filter(Boolean);
    const last20 = lines.slice(-20).map(l => {
      const e = safeParseJSON(l);
      // safeParseJSON returns Object.create(null) on failure; fall back to raw line
      if (e && typeof e.type !== 'undefined') {
        return `[${(e.timestamp || '').slice(11, 19)}] ${e.type}: ${e.description || ''}`;
      }
      return l.slice(0, 100);
    });
    await sendMessage(chatId, `Last ${last20.length} gap log entries:\n${last20.join('\n')}`);
  } catch (_) {
    await sendMessage(chatId, 'No session gap log found.');
  }
}

async function handleMemory(chatId, query) {
  if (!query) {
    await sendMessage(chatId, 'Usage: /memory KEYWORD');
    return;
  }
  try {
    const content = fs.readFileSync(LEARNINGS, 'utf8');
    const matched = content.split('\n').filter(l => l.toLowerCase().includes(query.toLowerCase()));
    if (!matched.length) {
      await sendMessage(chatId, `No matches for "${query}" in learnings.md`);
    } else {
      await sendMessage(chatId, `Memory: "${query}"\n${matched.slice(0, 10).join('\n')}`);
    }
  } catch (_) {
    await sendMessage(chatId, 'learnings.md not found.');
  }
}

/**
 * Send a "typing..." chat action to Telegram (fire-and-forget, non-blocking).
 * Shows the user that the bot is working before Claude responds.
 */
function sendTyping(chatId) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendChatAction`;
  httpsPost(url, { chat_id: chatId, action: 'typing' }).catch(() => {});
}

/**
 * Invoke Claude inline for /ask <text> and free-form messages.
 * Sends "typing" indicator, calls claude -p, then sends chunked response.
 * Falls back to an error message if Claude invocation fails.
 */
async function handleAsk(chatId, text) {
  sendTyping(chatId);
  try {
    const response = await new Promise((resolve, reject) => {
      // Run synchronously but in a setImmediate to allow the typing action to fire first
      setImmediate(() => {
        try {
          const result = invokeClaude(text, 90000);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });

    const reply = response || '(no response)';
    // Chunk at 4000 chars to stay well under Telegram's 4096 char limit
    for (let i = 0; i < reply.length; i += 4000) {
      const chunk = reply.slice(i, i + 4000);
      try {
        await sendMessage(chatId, chunk, true);
      } catch (_mdErr) {
        // Markdown parse failed — retry as plain text
        await sendMessage(chatId, chunk, false);
      }
    }
    auditLog({
      type: 'claude_response',
      chatId,
      promptLength: text.length,
      responseLength: reply.length,
    });
  } catch (err) {
    process.stderr.write(`handleAsk error: ${err.message}\n`);
    auditLog({ type: 'claude_error', chatId, error: err.message });
    await sendMessage(
      chatId,
      `Sorry, I could not process your request. Error: ${err.message.slice(0, 200)}`
    );
  }
}

async function queueForClaude(chatId, messageId, command, args) {
  const action = await buildClaudeAction(chatId, messageId, command, args, sendMessage);
  if (!action) return; // null means already handled (e.g. invalid name replied inline)
  const queue = readCmdQueue();
  queue.push({ ...action, queuedAt: new Date().toISOString() });
  writeCmdQueue(queue);
  const desc = command === '/ask' || command === '/research' ? 'your request' : `\`${command}\``;
  await sendMessage(chatId, `⏳ Processing ${desc}... I'll reply here when done.`);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function checkAuth(senderId, command) {
  if (!ALLOWED_USERS.length || !ALLOWED_USERS.includes(String(senderId))) {
    return 'silent_drop';
  }
  const ownerOnly = [
    '/ask',
    '/research',
    '/skill',
    '/agent',
    '/workflow',
    '/spawn',
    '/approve',
    '/confirm',
    '/deny',
  ];
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

    const chatId = msg.chat.id;
    const senderId = msg.from?.id;
    const text = msg.text.trim();
    const msgId = msg.message_id;

    // Parse command
    const match = text.match(/^(\/\w+)(?:\s+(.*))?$/s);
    const command = match ? match[1].toLowerCase() : null;
    const args = match ? (match[2] || '').trim() : '';

    // Auth check happens before command validation so non-commands from
    // authorized users get a helpful reply instead of silent drop.
    const authResult = checkAuth(senderId, command || '/unknown');
    auditLog({
      user_id: senderId,
      username: msg.from?.username || null,
      command: command || '(no-command)',
      args: args.slice(0, 100),
      allowed: authResult !== 'silent_drop',
      outcome: authResult,
    });

    if (authResult === 'silent_drop') continue;
    if (authResult === 'not_owner') {
      await sendMessage(chatId, 'Unauthorized');
      continue;
    }

    if (!command) {
      // Free-form message — route to Claude inline
      await handleAsk(chatId, text);
      continue;
    }

    // Dispatch
    switch (command) {
      case '/help':
        await handleHelp(chatId);
        break;
      case '/status':
        await handleStatus(chatId);
        break;
      case '/loops':
        await handleLoops(chatId);
        break;
      case '/logs':
        await handleLogs(chatId);
        break;
      case '/memory':
        await handleMemory(chatId, args);
        break;
      // Inline Claude invocation — no queue, responds immediately
      case '/ask':
        await handleAsk(chatId, args || text);
        break;
      // Queued commands (background processing via cron-actions-queue.jsonl)
      case '/tasks':
      case '/research':
      case '/skill':
      case '/agent':
      case '/workflow':
      case '/spawn':
      case '/approve':
      case '/confirm':
      case '/deny':
        await queueForClaude(chatId, msgId, command, args);
        break;
      default:
        // Unknown slash command — try routing to Claude as a free-form query
        await handleAsk(chatId, text);
    }
  }

  flushActionQueue(newUpdates.length);

  // Write updated state (confirmations etc)
  writeState(state);
}

// Flush pending Claude actions to durable JSONL queue (instead of inline stdout emit)
function flushActionQueue(processedCount) {
  const pending = readCmdQueue();
  if (pending.length) {
    ensureDir(CRON_ACTIONS_QUEUE);
    for (const action of pending) {
      const line = JSON.stringify({
        ...action,
        queuedAt: action.queuedAt || new Date().toISOString(),
      });
      fs.appendFileSync(CRON_ACTIONS_QUEUE, line + '\n');
    }
    writeCmdQueue([]); // clear after persisting to queue file
    process.stdout.write(`QUEUED_ACTIONS: ${pending.length}\n`);
  } else {
    process.stdout.write(`HEARTBEAT_OK (${processedCount} message(s) processed)\n`);
  }
}

// ── Test exports (only when loaded as module, not via direct execution) ──────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeCreatorName,
    buildClaudeAction,
    checkAuth,
    // Expose for integration tests
    _internals: { readState, writeState, readCmdQueue, writeCmdQueue, readOutbox, writeOutbox },
  };
}

// Only run main() when executed directly (not when required for testing)
if (require.main === module) {
  main().catch(e => {
    process.stderr.write(`telegram-poll fatal: ${e.message}\n`);
    process.exit(0); // fail-open
  });
}
