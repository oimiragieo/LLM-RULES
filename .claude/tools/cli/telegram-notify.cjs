'use strict';

/**
 * telegram-notify.cjs — Wave 5: Proactive notification module for Telegram.
 *
 * Standalone module that sends proactive notifications to the owner chat.
 * No polling, no queue — fire-and-forget push notifications.
 *
 * Exports: notifyTaskComplete, notifyTimeout, notifyPendingReflections,
 *          notifyStale, notify
 *
 * CLI: node .claude/tools/cli/telegram-notify.cjs "message here"
 *
 * Exits silently if TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_CHAT_ID are not set.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ── Bootstrap ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Load .env (first-wins — don't overwrite existing env)
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
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch (_) {
  /* ignore */
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

// ── HTTP helper ───────────────────────────────────────────────────────────────

/**
 * POST JSON to a URL and return the parsed response.
 * Uses the same pattern as telegram-poll.cjs.
 */
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
          const isValid = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
          resolve(isValid ? parsed : { ok: false });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── MarkdownV2 helpers ────────────────────────────────────────────────────────

/**
 * Escape all 18 special characters required by Telegram MarkdownV2.
 * Backslash must be escaped first to avoid double-escaping.
 */
function escapeMarkdownV2(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\\]/g, '\\\\').replace(/[_*[\]()~`>#+\-=|{}.!]/g, c => '\\' + c);
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * Send a message to a chat. Falls back to plain text if MarkdownV2 fails.
 * Returns the Telegram API response object.
 */
async function sendMessage(chatId, text, useMarkdown = false) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const safeText = text.slice(0, 4096);
  try {
    const body = { chat_id: chatId, text: safeText };
    if (useMarkdown) body.parse_mode = 'MarkdownV2';
    const result = await httpsPost(url, body);
    if (!result.ok && useMarkdown) {
      // MarkdownV2 parse failed — retry as plain text (fail-open)
      return await httpsPost(url, { chat_id: chatId, text: safeText });
    }
    return result;
  } catch (e) {
    process.stderr.write(`telegram-notify sendMessage error: ${e.message}\n`);
    return { ok: false };
  }
}

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the module is configured and ready to send.
 * Callers must check this before attempting sends.
 */
function isConfigured() {
  return Boolean(TOKEN && OWNER_CHAT_ID);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generic notification — sends raw message to owner chat.
 * @param {string} message
 * @returns {Promise<object>} Telegram API response, or { ok: false } if not configured
 */
async function notify(message) {
  if (!isConfigured()) return { ok: false };
  return sendMessage(OWNER_CHAT_ID, message, false);
}

/**
 * Notify owner that a task completed.
 * @param {string|number} taskId
 * @param {string} summary
 */
async function notifyTaskComplete(taskId, summary) {
  if (!isConfigured()) return { ok: false };
  const escapedId = escapeMarkdownV2(String(taskId));
  const escapedSummary = escapeMarkdownV2(String(summary));
  const text = `✅ *Task \\#${escapedId} completed:* ${escapedSummary}`;
  return sendMessage(OWNER_CHAT_ID, text, true);
}

/**
 * Notify owner that a task timed out.
 * @param {string|number} taskId
 * @param {string} agent  — agent type that was running
 */
async function notifyTimeout(taskId, agent) {
  if (!isConfigured()) return { ok: false };
  const escapedId = escapeMarkdownV2(String(taskId));
  const escapedAgent = escapeMarkdownV2(String(agent));
  const text = `⏱ *Task \\#${escapedId} timed out* \\(agent: ${escapedAgent}\\)`;
  return sendMessage(OWNER_CHAT_ID, text, true);
}

/**
 * Notify owner about pending reflections awaiting processing.
 * @param {number} count
 */
async function notifyPendingReflections(count) {
  if (!isConfigured()) return { ok: false };
  const n = escapeMarkdownV2(String(count));
  const text = `🪞 *${n} pending reflection${count === 1 ? '' : 's'} awaiting processing*`;
  return sendMessage(OWNER_CHAT_ID, text, true);
}

/**
 * Notify owner about a stale plan.
 * @param {string} planName
 * @param {number} daysSince
 */
async function notifyStale(planName, daysSince) {
  if (!isConfigured()) return { ok: false };
  const escapedName = escapeMarkdownV2(String(planName));
  const escapedDays = escapeMarkdownV2(String(daysSince));
  const text = `⚠️ *Stale plan:* ${escapedName} \\(${escapedDays} day${daysSince === 1 ? '' : 's'}\\)`;
  return sendMessage(OWNER_CHAT_ID, text, true);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  notify,
  notifyTaskComplete,
  notifyTimeout,
  notifyPendingReflections,
  notifyStale,
  // Exposed for testing
  _internals: { isConfigured, escapeMarkdownV2, sendMessage },
};

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (require.main === module) {
  const message = process.argv.slice(2).join(' ').trim();
  if (!message) {
    process.stderr.write('Usage: node telegram-notify.cjs "message here"\n');
    process.exit(1);
  }
  if (!isConfigured()) {
    // Silent exit — env vars not set
    process.exit(0);
  }
  notify(message)
    .then(result => {
      if (!result.ok) {
        process.stderr.write(`telegram-notify: send failed\n`);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(e => {
      process.stderr.write(`telegram-notify fatal: ${e.message}\n`);
      process.exit(0); // fail-open
    });
}
