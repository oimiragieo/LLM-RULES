/**
 * claude-cli.cjs — Safe Claude CLI wrapper for the channel daemon
 *
 * Uses spawnSync with array arguments to avoid shell injection (SEC-011).
 * For prompts exceeding Windows cmd.exe 8191-char limit, pipes via stdin.
 * Supports --append-system-prompt to override router CLAUDE.md for headless tasks.
 *
 * All daemon modules should use this instead of execSync with string interpolation.
 */
'use strict';

const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Windows cmd.exe has 8191 char limit. Leave generous headroom for
// the claude command, flags, shell quoting overhead, and env vars.
const WIN_CMD_LIMIT = 5000;

/**
 * Build the args array for claude CLI.
 */
function _buildArgs(prompt, { model, maxTurns, appendSystemPrompt, appendSystemPromptFile }) {
  const args = [
    '-p',
    prompt,
    '--dangerously-skip-permissions',
    '--model',
    model,
    '--max-turns',
    maxTurns,
  ];

  if (appendSystemPromptFile) {
    args.push('--append-system-prompt-file', appendSystemPromptFile);
  } else if (appendSystemPrompt) {
    args.push('--append-system-prompt', appendSystemPrompt);
  }

  return args;
}

/**
 * Run `claude -p <prompt>` safely with array arguments.
 * For long prompts on Windows, pipes via stdin.
 *
 * @param {string} prompt - The prompt text (no escaping needed)
 * @param {Object} [opts]
 * @param {string} [opts.model='sonnet'] - Model name (haiku/sonnet/opus)
 * @param {number} [opts.maxTurns=3] - Max conversation turns
 * @param {string} [opts.cwd] - Working directory
 * @param {number} [opts.timeout=120000] - Timeout in ms
 * @param {Object} [opts.env] - Additional env vars (ANTHROPIC_API_KEY is always removed)
 * @param {string} [opts.appendSystemPrompt] - Text appended to the default system prompt
 * @param {string} [opts.appendSystemPromptFile] - File path appended to the default system prompt
 * @returns {string} Trimmed stdout
 */
function claudeSync(prompt, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  delete env.ANTHROPIC_API_KEY;

  const model = opts.model || 'sonnet';
  const maxTurns = String(opts.maxTurns || 3);
  const cwd = opts.cwd || process.cwd();
  const timeout = opts.timeout || 120000;
  const appendSystemPrompt = opts.appendSystemPrompt || '';
  const appendSystemPromptFile = opts.appendSystemPromptFile || '';

  const argOpts = { model, maxTurns, appendSystemPrompt, appendSystemPromptFile };

  // On Windows with long prompts, use stdin piping to avoid cmd.exe 8191 char limit
  const totalLen = prompt.length + appendSystemPrompt.length;
  if (process.platform === 'win32' && totalLen > WIN_CMD_LIMIT) {
    return _claudeSyncViaFile(prompt, { ...argOpts, cwd, timeout, env });
  }

  const args = _buildArgs(prompt, argOpts);

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
 * Long-prompt fallback: write prompt to temp file and pass via
 * --append-system-prompt-file. Uses a short placeholder for -p
 * and puts the real prompt in a file to avoid cmd.exe limits.
 */
function _claudeSyncViaFile(
  prompt,
  { model, maxTurns, appendSystemPrompt, appendSystemPromptFile, cwd, timeout, env }
) {
  const tmpDir = path.join(os.tmpdir(), 'daemon-claude');
  fs.mkdirSync(tmpDir, { recursive: true });
  const ts = Date.now();
  const tmpPromptFile = path.join(tmpDir, `prompt-${ts}-${process.pid}.txt`);
  const tmpSysFile = path.join(tmpDir, `sys-${ts}-${process.pid}.txt`);

  try {
    // Write prompt to temp file — combined with system prompt if inline
    const promptContent = appendSystemPrompt
      ? `${appendSystemPrompt}\n\n---\n\nUser request:\n${prompt}`
      : prompt;
    fs.writeFileSync(tmpPromptFile, promptContent, 'utf8');

    const args = [
      '-p',
      'Follow the instructions in the appended system prompt file.',
      '--dangerously-skip-permissions',
      '--model',
      model,
      '--max-turns',
      maxTurns,
      '--append-system-prompt-file',
      appendSystemPromptFile || tmpPromptFile,
    ];

    // If we have both a file-based system prompt AND a long user prompt,
    // combine them into a single temp file
    if (appendSystemPromptFile && prompt.length > WIN_CMD_LIMIT) {
      const sysContent = fs.existsSync(appendSystemPromptFile)
        ? fs.readFileSync(appendSystemPromptFile, 'utf8')
        : '';
      fs.writeFileSync(tmpSysFile, `${sysContent}\n\n---\n\nUser request:\n${prompt}`, 'utf8');
      args[args.length - 1] = tmpSysFile;
    }

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
  } finally {
    try { fs.unlinkSync(tmpPromptFile); } catch { /* ignored */ }
    try {
      fs.unlinkSync(tmpSysFile);
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
