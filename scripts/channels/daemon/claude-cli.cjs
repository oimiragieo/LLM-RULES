/**
 * claude-cli.cjs — Safe Claude CLI wrapper for the channel daemon
 *
 * Uses spawnSync with array arguments to avoid shell injection (SEC-011).
 * All daemon modules should use this instead of execSync with string interpolation.
 */
'use strict';

const { spawnSync, execFileSync } = require('child_process');

/**
 * Run `claude -p <prompt>` safely with array arguments.
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
  const args = [
    '-p',
    prompt,
    '--dangerously-skip-permissions',
    '--model',
    opts.model || 'sonnet',
    '--max-turns',
    String(opts.maxTurns || 3),
  ];

  const env = { ...process.env, ...(opts.env || {}) };
  delete env.ANTHROPIC_API_KEY;

  const result = spawnSync('claude', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: opts.timeout || 120000,
    env,
    windowsHide: true,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) throw result.error;
  return (result.stdout || '').trim();
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
