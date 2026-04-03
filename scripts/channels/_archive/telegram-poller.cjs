#!/usr/bin/env node
'use strict';

/**
 * telegram-poller.cjs — Standalone Telegram monitor
 *
 * Polls Telegram API directly (no MCP, no Claude for polling).
 * Only invokes `claude -p` when a message actually arrives.
 * This avoids: MCP subprocess conflicts, 107k context loading on empty polls,
 * API rate limit burn on empty checks.
 *
 * Runs as a hidden background process launched by telegram-start.cjs.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = process.env.TELEGRAM_POLLER_ROOT || process.cwd();
const LOG_FILE = path.join(ROOT, '.claude', 'context', 'runtime', 'telegram-headless.log');

function log(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
}

// Load .env
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// Load allowed users
function loadAllowed() {
  const allowed = new Set();
  // From .env
  const envUsers = (process.env.TELEGRAM_ALLOWED_USERS || '').trim();
  if (envUsers) envUsers.split(',').forEach(id => allowed.add(id.trim()));
  const ownerId = (process.env.TELEGRAM_OWNER_ID || '').trim();
  if (ownerId) allowed.add(ownerId);
  // From access.json
  const accessPath = path.join(os.homedir(), '.claude', 'channels', 'telegram', 'access.json');
  try {
    const data = JSON.parse(fs.readFileSync(accessPath, 'utf8'));
    (data.allowFrom || []).forEach(id => allowed.add(String(id)));
  } catch {}
  return allowed;
}

// Telegram API call
function telegramApi(token, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Get Claude response for a message
function getClaudeResponse(text, chatId) {
  const authToken = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
  const prompt = `A Telegram user sent this message: "${text.replace(/"/g, '\\"')}". Write a helpful, concise response (under 500 chars). Just the response text, nothing else.`;
  try {
    const env = { ...process.env };
    if (authToken) env.ANTHROPIC_API_KEY = authToken;
    const result = execSync(
      `claude -p "${prompt.replace(/"/g, '\\"')}" --dangerously-skip-permissions --model sonnet --max-turns 1 --bare`,
      { cwd: ROOT, encoding: 'utf8', timeout: 60000, env, windowsHide: true }
    ).trim();
    return result || 'Sorry, I could not generate a response.';
  } catch (err) {
    log(`Claude error: ${err.message}`);
    return 'Sorry, I encountered an error processing your message.';
  }
}

// Main polling loop
async function main() {
  loadEnv();
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) { log('No TELEGRAM_BOT_TOKEN'); process.exit(1); }

  const allowed = loadAllowed();
  const allowAll = (process.env.TELEGRAM_ALLOW_ALL || '').trim().toLowerCase() === 'true';
  let lastUpdateId = 0;

  log(`Poller started. Allowed users: ${[...allowed].join(', ') || '(none - set TELEGRAM_ALLOWED_USERS)'}${allowAll ? ' [ALLOW_ALL]' : ''}`);

  // Drop any competing getUpdates connections by calling getUpdates with timeout=0
  // This terminates other long-polling connections to the same bot token.
  try {
    await telegramApi(token, 'getUpdates?timeout=0');
    log('Cleared competing connections');
  } catch {}

  while (true) {
    try {
      const data = await telegramApi(token, `getUpdates?offset=${lastUpdateId}&timeout=30`);
      if (!data.ok || !data.result) {
        log(`getUpdates error: ${JSON.stringify(data).slice(0, 200)}`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      for (const update of data.result) {
        lastUpdateId = update.update_id + 1;
        if (!update.message) continue;

        const senderId = String(update.message.from?.id || '');
        const senderUsername = update.message.from?.username || '';
        if (!allowAll && !allowed.has(senderId) && !allowed.has(senderUsername)) continue;

        const text = update.message.text || '';
        if (!text) continue;

        const chatId = String(update.message.chat?.id || '');
        const messageId = update.message.message_id;
        const user = senderUsername || senderId;

        log(`Message from ${user}: ${text.slice(0, 100)}`);

        // Get Claude's response (only calls claude -p when there's an actual message)
        const response = getClaudeResponse(text, chatId);
        log(`Reply to ${user}: ${response.slice(0, 100)}`);

        // Send reply
        await telegramApi(token, 'sendMessage', {
          chat_id: chatId,
          text: response,
          reply_parameters: { message_id: messageId },
        });
      }
    } catch (err) {
      log(`Poll error: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(err => { log(`Fatal: ${err.message}`); process.exit(1); });
