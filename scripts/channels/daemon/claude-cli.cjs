/**
 * claude-cli.cjs — Safe Claude CLI wrapper for the channel daemon
 *
 * Always pipes the prompt via stdin (using `-p` as the last flag with no value)
 * to avoid Windows cmd.exe argument quoting issues where spawnSync with
 * shell:true silently truncates arguments containing spaces.
 *
 * All daemon modules should use this instead of raw execSync/spawnSync.
 */
'use strict';

const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Workspace directory for headless task execution — outside agent-studio tree
// to avoid loading the router CLAUDE.md which blocks tool usage.
const TASK_WORKSPACE = path.join(os.homedir(), '.claude', 'channels', 'workspace');

/**
 * Run claude with the prompt piped via stdin.
 *
 * On Windows, spawnSync with shell:true silently splits arguments on spaces,
 * so `-p "multi word prompt"` only passes the first word. Using `-p` as the
 * last flag (no value) with `input: prompt` via stdin avoids this entirely.
 *
 * @param {string} prompt - The prompt text
 * @param {Object} [opts]
 * @param {string} [opts.model='sonnet'] - Model name (haiku/sonnet/opus)
 * @param {number} [opts.maxTurns=3] - Max conversation turns
 * @param {string} [opts.cwd] - Working directory (default: project root)
 * @param {number} [opts.timeout=120000] - Timeout in ms
 * @param {Object} [opts.env] - Additional env vars (ANTHROPIC_API_KEY is always removed)
 * @param {string} [opts.appendSystemPrompt] - Text appended to the default system prompt
 * @param {string} [opts.appendSystemPromptFile] - File path appended to the default system prompt
 * @param {boolean} [opts.useWorkspace=false] - Run from TASK_WORKSPACE to avoid CLAUDE.md
 * @returns {string} Trimmed stdout
 */
function claudeSync(prompt, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  delete env.ANTHROPIC_API_KEY;

  const model = opts.model || 'sonnet';
  const maxTurns = String(opts.maxTurns || 3);
  const cwd = opts.useWorkspace ? TASK_WORKSPACE : (opts.cwd || process.cwd());
  const timeout = opts.timeout || 120000;

  // Ensure workspace exists
  if (opts.useWorkspace) {
    fs.mkdirSync(TASK_WORKSPACE, { recursive: true });
  }

  // Build args — `-p` must be LAST (no value) so stdin is read as the prompt
  const args = [
    '--dangerously-skip-permissions',
    '--model', model,
    '--max-turns', maxTurns,
  ];

  // Handle system prompt append
  let tmpSysFile = null;
  if (opts.appendSystemPromptFile) {
    args.push('--append-system-prompt-file', opts.appendSystemPromptFile);
  } else if (opts.appendSystemPrompt) {
    // Write inline system prompt to temp file (avoids shell quoting issues)
    const tmpDir = path.join(os.tmpdir(), 'daemon-claude');
    fs.mkdirSync(tmpDir, { recursive: true });
    tmpSysFile = path.join(tmpDir, `sys-${Date.now()}-${process.pid}.txt`);
    fs.writeFileSync(tmpSysFile, opts.appendSystemPrompt, 'utf8');
    args.push('--append-system-prompt-file', tmpSysFile);
  }

  // -p MUST be last — stdin is read as the prompt
  args.push('-p');

  try {
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
    if (tmpSysFile) {
      try { fs.unlinkSync(tmpSysFile); } catch { /* ignored */ }
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

module.exports = { claudeSync, nodeSync, TASK_WORKSPACE };
