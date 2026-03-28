'use strict';
/**
 * telegram-claude-bridge.cjs
 *
 * Handles headless Claude invocation from the Telegram polling loop.
 * Extracted from telegram-poll.cjs to keep that file under the 500-line limit.
 *
 * Exports:
 *   resolveClaude(env)                                    → string (full path to claude binary)
 *   invokeClaude(bin, prompt, timeoutMs)                  → string (Claude response, synchronous)
 *   invokeClaudeAsync(bin, prompt, chatId, outboxPath)    → void   (async, writes to outbox on completion)
 *   sendTyping(token, chatId, httpsPost)                  → void   (fire-and-forget)
 *   handleAsk(ctx, chatId, text)                          → Promise<void>
 *
 * ctx = { bin, token, httpsPost, sendMessage, auditLog, outboxPath }
 */

const { spawnSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

/**
 * Resolve the claude CLI binary path once at startup.
 * Priority: CLAUDE_CLI_PATH env → where/which → bare 'claude' fallback.
 * Needed because non-interactive cron shells may lack npm's bin in PATH.
 *
 * @param {NodeJS.ProcessEnv} env - process.env (or override for tests)
 * @returns {string} resolved path to claude binary
 */
function resolveClaude(env) {
  const explicit = (env.CLAUDE_CLI_PATH || '').trim();
  if (explicit) return explicit;
  const isWin = process.platform === 'win32';
  const r = spawnSync(isWin ? 'cmd.exe' : 'which', isWin ? ['/c', 'where', 'claude'] : ['claude'], {
    encoding: 'utf8',
    timeout: 5000,
    shell: false,
  });
  return r.status === 0 && r.stdout ? r.stdout.trim().split('\n')[0].trim() : 'claude';
}

/**
 * Invoke Claude headlessly via `claude -p <prompt>`.
 *
 * On Windows, claude is an npm `.cmd` script that must be run via cmd.exe
 * with shell:false (prevents shell injection — security rule).
 * CLAUDECODE is unset to prevent the nested-session guard from blocking.
 *
 * @param {string} bin       - Full path or name of claude binary (from resolveClaude)
 * @param {string} prompt    - Prompt text to send
 * @param {number} timeoutMs - Timeout in ms (default 90000)
 * @returns {string} Claude's stdout response (trimmed)
 * @throws {Error} on non-zero exit or spawn error
 */
function invokeClaude(bin, prompt, timeoutMs) {
  const timeout = timeoutMs || 90000;
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'cmd.exe' : bin;
  const args = isWin
    ? ['/c', bin, '-p', prompt, '--output-format', 'text']
    : ['-p', prompt, '--output-format', 'text'];
  const result = spawnSync(exe, args, {
    encoding: 'utf8',
    timeout,
    shell: false,
    env: Object.assign({}, process.env, { CLAUDECODE: '' }),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`claude exited ${result.status}: ${(result.stderr || '').slice(0, 300)}`);
  }
  return (result.stdout || '').trim();
}

/**
 * Invoke Claude headlessly using async child_process.spawn.
 *
 * Fires the process in the background and writes the response to an outbox
 * JSON file once Claude exits. The polling loop's processOutbox() will pick
 * it up on the next tick and deliver it to the user.
 *
 * Wave 3: Accepts optional editMessageId. When present, the outbox entry
 * includes editMessageId so processOutbox() can edit the ACK in-place rather
 * than sending a new message. Also runs a typing indicator loop every 4s.
 *
 * On Windows, claude is an npm `.cmd` script that must be run via cmd.exe
 * with shell:false (prevents shell injection — security rule).
 * CLAUDECODE is unset to prevent the nested-session guard from blocking.
 *
 * @param {string} bin           - Full path or name of claude binary (from resolveClaude)
 * @param {string} prompt        - Prompt text to send
 * @param {number|string} chatId - Telegram chat ID (for outbox entry)
 * @param {string} outboxPath    - Absolute path to telegram-outbox.json
 * @param {object} [opts]        - Optional config
 * @param {number} [opts.editMessageId]  - message_id of the ACK to edit in-place
 * @param {string} [opts.token]          - Telegram bot token (for typing indicator)
 * @param {Function} [opts.httpsPost]    - httpsPost function (for typing indicator)
 */
function invokeClaudeAsync(bin, prompt, chatId, outboxPath, opts) {
  const fs = require('fs');
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'cmd.exe' : bin;
  const args = isWin
    ? ['/c', bin, '-p', prompt, '--output-format', 'text']
    : ['-p', prompt, '--output-format', 'text'];

  const child = require('child_process').spawn(exe, args, {
    shell: false,
    env: Object.assign({}, process.env, { CLAUDECODE: '' }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Wave 3: typing indicator loop — fire every 4s while Claude is working
  const editMessageId = opts && opts.editMessageId ? opts.editMessageId : null;
  const token = opts && opts.token ? opts.token : null;
  const httpsPost = opts && opts.httpsPost ? opts.httpsPost : null;
  let typingInterval = null;
  if (token && httpsPost) {
    typingInterval = setInterval(() => {
      httpsPost(`https://api.telegram.org/bot${token}/sendChatAction`, {
        chat_id: chatId,
        action: 'typing',
      }).catch(() => {});
    }, 4000);
  }

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => {
    stdout += d;
  });
  child.stderr.on('data', d => {
    stderr += d;
  });

  // Kill after 120s to prevent zombie processes
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
  }, 120000);

  child.on('close', code => {
    clearTimeout(timer);
    if (typingInterval) clearInterval(typingInterval);
    const response = stdout.trim() || `(Claude exited ${code}: ${stderr.slice(0, 200)})`;
    // Append to outbox atomically so next poll tick delivers the response
    const outbox = [];
    try {
      const existing = fs.readFileSync(outboxPath, 'utf8');
      const parsed = safeParseJSON(existing, []);
      if (Array.isArray(parsed)) outbox.push(...parsed);
    } catch (_) {
      // outbox may not exist yet — that is fine
    }
    const entry = { chatId, text: response, createdAt: new Date().toISOString() };
    // Wave 3: include editMessageId so processOutbox() edits in-place
    if (editMessageId) entry.editMessageId = editMessageId;
    outbox.push(entry);
    const tmp = outboxPath + '.tmp.' + process.pid;
    // Ensure the directory exists before writing
    const path = require('path');
    const dir = path.dirname(outboxPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(outbox, null, 2));
    fs.renameSync(tmp, outboxPath);
  });

  child.on('error', err => {
    clearTimeout(timer);
    if (typingInterval) clearInterval(typingInterval);
    process.stderr.write(`invokeClaudeAsync spawn error: ${err.message}\n`);
    // Write error to outbox so the user is not left waiting forever
    try {
      const fs2 = require('fs');
      const outbox = [];
      try {
        const existing = fs2.readFileSync(outboxPath, 'utf8');
        const parsed = safeParseJSON(existing, []);
        if (Array.isArray(parsed)) outbox.push(...parsed);
      } catch (readErr) {
        process.stderr.write(`invokeClaudeAsync outbox read error: ${readErr.message}\n`);
      }
      const errorEntry = {
        chatId,
        text: `(Error starting Claude: ${err.message.slice(0, 200)})`,
        createdAt: new Date().toISOString(),
      };
      if (editMessageId) errorEntry.editMessageId = editMessageId;
      outbox.push(errorEntry);
      const tmp = outboxPath + '.tmp.' + process.pid;
      fs2.writeFileSync(tmp, JSON.stringify(outbox, null, 2));
      fs2.renameSync(tmp, outboxPath);
    } catch (writeErr) {
      process.stderr.write(`invokeClaudeAsync outbox write error: ${writeErr.message}\n`);
    }
  });
}

/**
 * Send a "typing..." chat action to Telegram (fire-and-forget).
 * Shows the user the bot is working before Claude responds.
 */
function sendTyping(token, chatId, httpsPost) {
  httpsPost(`https://api.telegram.org/bot${token}/sendChatAction`, {
    chat_id: chatId,
    action: 'typing',
  }).catch(() => {});
}

/**
 * Handle /ask and free-form messages using the async worker pattern.
 *
 * Instead of blocking on Claude synchronously (which caused 2-minute cron
 * timeouts and stalled the entire polling loop), this function fires
 * invokeClaudeAsync and returns immediately. Claude's response is written
 * to the outbox file; processOutbox() delivers it on the next poll tick.
 *
 * Wave 3: Sends "Processing..." ACK, captures message_id, and passes it to
 * invokeClaudeAsync so processOutbox() can edit the ACK in-place rather than
 * sending a second message. Also starts a typing indicator loop while Claude runs.
 *
 * @param {{ bin: string, token: string, httpsPost: Function, sendMessage: Function, auditLog: Function, outboxPath: string }} ctx
 * @param {number|string} chatId
 * @param {string} text  - User's message text
 */
async function handleAsk(ctx, chatId, text) {
  const { bin, token, httpsPost, sendMessage, auditLog, outboxPath } = ctx;

  const path = require('path');
  // Resolve outbox path: use ctx.outboxPath if provided, else derive from __dirname
  const resolvedOutboxPath =
    outboxPath ||
    path.join(
      path.resolve(__dirname, '..', '..', '..'),
      '.claude',
      'context',
      'tmp',
      'telegram-outbox.json'
    );

  // Wave 3: send ACK and capture message_id for in-place editing
  let editMessageId = null;
  try {
    const ackResult = await sendMessage(
      chatId,
      "\u23f3 Processing your request\u2026 I'll reply when ready."
    );
    // Telegram returns { ok: true, result: { message_id: N, ... } }
    if (ackResult && ackResult.ok && ackResult.result && ackResult.result.message_id) {
      editMessageId = ackResult.result.message_id;
    }
  } catch (_) {
    // sendMessage failure is non-fatal — proceed without edit capability
  }

  // Fire Claude async — typing indicator runs inside invokeClaudeAsync every 4s
  invokeClaudeAsync(bin, text, chatId, resolvedOutboxPath, {
    editMessageId,
    token,
    httpsPost,
  });

  auditLog({ type: 'ask_queued', chatId, promptLength: text.length, editMessageId });
}

module.exports = { resolveClaude, invokeClaude, invokeClaudeAsync, sendTyping, handleAsk };
