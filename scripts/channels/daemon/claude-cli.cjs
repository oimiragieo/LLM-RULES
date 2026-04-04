/**
 * claude-cli.cjs — Safe Claude CLI wrapper for the channel daemon
 *
 * Uses spawnSync with array arguments to avoid shell injection (SEC-011).
 * For prompts exceeding Windows cmd.exe 8191-char limit, writes to a temp
 * file and pipes via stdin.
 *
 * All daemon modules should use this instead of execSync with string interpolation.
 */
'use strict';

const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Windows cmd.exe has 8191 char limit. Leave headroom for the command + flags.
const WIN_CMD_LIMIT = 7000;

/**
 * Run `claude -p <prompt>` safely with array arguments.
 * For long prompts on Windows, writes prompt to a temp file and pipes via stdin.
 *
 * @param {string} prompt - The prompt text (no escaping needed)
 * @param {Object} [opts]
 * @param {string} [opts.model='sonnet'] - Model name (haiku/sonnet/opus)
 * @param {number} [opts.maxTurns=3] - Max conversation turns
 * @param {string} [opts.cwd] - Working directory
 * @param {number} [opts.timeout=120000] - Timeout in ms
 * @param {Object} [opts.env] - Additional env vars (ANTHROPIC_API_KEY is always removed)
 * @returns {string} Trimmed stdout
 */
function claudeSync(prompt, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  delete env.ANTHROPIC_API_KEY;

  const model = opts.model || 'sonnet';
  const maxTurns = String(opts.maxTurns || 3);
  const cwd = opts.cwd || process.cwd();
  const timeout = opts.timeout || 120000;

  // On Windows with long prompts, use stdin piping to avoid cmd.exe 8191 char limit
  if (process.platform === 'win32' && prompt.length > WIN_CMD_LIMIT) {
    return _claudeSyncViaStdin(prompt, { model, maxTurns, cwd, timeout, env });
  }

  const args = [
    '-p',
    prompt,
    '--dangerously-skip-permissions',
    '--model',
    model,
    '--max-turns',
    maxTurns,
  ];

  const result = spawnSync('claude', args, {
    cwd,
    encoding: 'utf8',
    timeout,
    env,
    windowsHide: true,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) throw result.error;
  return (result.stdout || '').trim();
}

/**
 * Long-prompt fallback: write prompt to temp file, pass path via -p flag with @file syntax,
 * or pipe via stdin. Uses temp file approach for reliability on Windows.
 */
function _claudeSyncViaStdin(prompt, { model, maxTurns, cwd, timeout, env }) {
  const tmpDir = path.join(os.tmpdir(), 'daemon-claude');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `prompt-${Date.now()}-${process.pid}.txt`);

  try {
    fs.writeFileSync(tmpFile, prompt, 'utf8');

    // Use stdin piping: write prompt to stdin of claude process
    const args = [
      '-p',
      '-',
      '--dangerously-skip-permissions',
      '--model',
      model,
      '--max-turns',
      maxTurns,
    ];

    const result = spawnSync('claude', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      env,
      windowsHide: true,
      shell: true,
      input: prompt,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error) throw result.error;
    return (result.stdout || '').trim();
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignored */
    }
  }
}

/**
 * Run a Node.js script safely with execFileSync (no shell).
 *
 * @param {string} scriptPath - Path to the .cjs script
 * @param {Object} [opts]
 * @param {number} [opts.timeout=30000] - Timeout in ms
 * @returns {string} Trimmed stdout
 */
function nodeSync(scriptPath, opts = {}) {
  return execFileSync('node', [scriptPath], {
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

module.exports = { claudeSync, nodeSync };
