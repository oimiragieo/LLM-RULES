'use strict';
/**
 * telegram-claude-bridge.cjs
 *
 * Handles headless Claude invocation from the Telegram polling loop.
 * Extracted from telegram-poll.cjs to keep that file under the 500-line limit.
 *
 * Exports:
 *   resolveClaude(env)                      → string (full path to claude binary)
 *   invokeClaude(bin, prompt, timeoutMs)    → string (Claude response)
 *   sendTyping(token, chatId, httpsPost)    → void   (fire-and-forget)
 *   handleAsk(ctx, chatId, text)            → Promise<void>
 *
 * ctx = { bin, token, httpsPost, sendMessage, auditLog }
 */

const { spawnSync } = require('child_process');

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
 * Handle /ask and free-form messages: invoke Claude inline and send response.
 *
 * @param {{ bin: string, token: string, httpsPost: Function, sendMessage: Function, auditLog: Function }} ctx
 * @param {number|string} chatId
 * @param {string} text  - User's message text
 */
async function handleAsk(ctx, chatId, text) {
  const { bin, token, httpsPost, sendMessage, auditLog } = ctx;
  sendTyping(token, chatId, httpsPost);
  try {
    const response = await new Promise((resolve, reject) => {
      // setImmediate lets the typing indicator fire before blocking on Claude
      setImmediate(() => {
        try {
          resolve(invokeClaude(bin, text, 90000));
        } catch (err) {
          reject(err);
        }
      });
    });
    const reply = response || '(no response)';
    // Chunk at 4000 chars — Telegram hard limit is 4096
    for (let i = 0; i < reply.length; i += 4000) {
      const chunk = reply.slice(i, i + 4000);
      try {
        await sendMessage(chatId, chunk, true);
      } catch (_) {
        await sendMessage(chatId, chunk, false);
      } // Markdown fallback
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

module.exports = { resolveClaude, invokeClaude, sendTyping, handleAsk };
