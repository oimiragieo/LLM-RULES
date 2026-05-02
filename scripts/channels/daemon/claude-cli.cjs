/**
 * claude-cli.cjs — Safe Claude CLI wrapper for the channel daemon
 *
 * Always pipes the prompt via stdin (using `-p` as the last flag with no value)
 * to avoid Windows cmd.exe argument quoting issues where shell dispatch can
 * silently truncate arguments containing spaces.
 *
 * All daemon modules should use this instead of raw execSync/spawnSync.
 *
 * ## Security Rationale — Windows command shims (M-01)
 *
 * Windows installs the Claude Code CLI as a .cmd wrapper (claude.cmd). Node.js
 * cannot execute command shims directly with child_process shell mode disabled,
 * so production calls explicitly dispatch through cmd.exe /c while keeping
 * child_process shell:false. Non-Windows platforms spawn claude directly.
 *
 * Shell injection risk is mitigated because:
 *   1. The command is the literal string 'claude' or a configured binary path.
 *   2. Windows cmd arguments are validated before command-line construction.
 *   3. The prompt (the only user-controlled content) is passed via stdin, not
 *      as a shell argument. stdin bypasses shell parsing entirely.
 *   4. ANTHROPIC_API_KEY is deleted from env before spawning.
 *
 * Audit reference: M-01 (security hardening review 2026-04-10)
 */
'use strict';

const childProcess = require('child_process');
const { spawnSync, execFileSync } = childProcess;
const fs = require('fs');
const path = require('path');
const os = require('os');

// Workspace directory for headless task execution — outside agent-studio tree
// to avoid loading the router CLAUDE.md which blocks tool usage.
const TASK_WORKSPACE = path.join(os.homedir(), '.claude', 'channels', 'workspace');
const WINDOWS_CMD_EXTENSIONS = new Set(['', '.cmd', '.bat']);

function quoteWindowsCmdArg(value) {
  const arg = String(value);
  if (!/^[a-zA-Z0-9._:=/\\\- ]+$/.test(arg)) {
    throw new Error(`Unsafe Claude CLI argument for cmd.exe dispatch: ${arg}`);
  }
  return `"${arg}"`;
}

function buildClaudeSpawnSpec(
  claudeBinary = 'claude',
  spawnArgs = [],
  platform = process.platform
) {
  if (platform !== 'win32') {
    return { command: claudeBinary, args: spawnArgs };
  }

  const extension = path.extname(claudeBinary).toLowerCase();
  if (!WINDOWS_CMD_EXTENSIONS.has(extension)) {
    return { command: claudeBinary, args: spawnArgs };
  }

  const commandLine = [claudeBinary, ...spawnArgs].map(quoteWindowsCmdArg).join(' ');
  return {
    command: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
  };
}

function shouldUseRealSpawnSpec(spawnFn) {
  return spawnFn === childProcess.spawn;
}

/**
 * Run claude with the prompt piped via stdin.
 *
 * On Windows, shell-based spawn can split arguments on spaces,
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
  const cwd = opts.useWorkspace ? TASK_WORKSPACE : opts.cwd || process.cwd();
  const timeout = opts.timeout || 120000;

  // Ensure workspace exists
  if (opts.useWorkspace) {
    fs.mkdirSync(TASK_WORKSPACE, { recursive: true });
  }

  // Build args — `-p` must be LAST (no value) so stdin is read as the prompt
  const args = ['--dangerously-skip-permissions', '--model', model, '--max-turns', maxTurns];

  // When using workspace isolation, add the project dir for file access
  if (opts.useWorkspace && opts.projectRoot) {
    args.push('--add-dir', opts.projectRoot);
  }

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
    const spawnSpec = buildClaudeSpawnSpec('claude', args);
    const result = spawnSync(spawnSpec.command, spawnSpec.args, {
      cwd,
      encoding: 'utf8',
      timeout,
      env,
      windowsHide: true,
      shell: false,
      input: prompt,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error) throw result.error;
    return (result.stdout || '').trim();
  } finally {
    if (tmpSysFile) {
      try {
        fs.unlinkSync(tmpSysFile);
      } catch {
        /* ignored */
      }
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

/**
 * Async (non-blocking) Claude CLI wrapper.
 *
 * Uses `spawn` instead of `spawnSync` so the Node.js event loop stays free
 * while the Claude process runs. Returns a handle with `{ child, promise, cancel }`.
 *
 * @param {string} prompt - The prompt text
 * @param {Object} [opts] - Same options as claudeSync
 * @returns {{ child: ChildProcess, promise: Promise<string>, cancel: Function }}
 */
function claudeAsync(prompt, opts = {}) {
  return _claudeAsyncImpl(prompt, opts, childProcess.spawn);
}

/**
 * Internal implementation — accepts spawn function for testability.
 * @private
 */
function _claudeAsyncImpl(prompt, opts, spawnFn) {
  const { spawn: _unused, ...restEnv } = { ...process.env, ...(opts.env || {}) };
  const env = { ...restEnv };
  delete env.ANTHROPIC_API_KEY;

  const model = opts.model || 'sonnet';
  const maxTurns = String(opts.maxTurns || 3);
  const cwd = opts.useWorkspace ? TASK_WORKSPACE : opts.cwd || process.cwd();
  const timeout = opts.timeout || 300000;

  // Ensure workspace exists
  if (opts.useWorkspace) {
    fs.mkdirSync(TASK_WORKSPACE, { recursive: true });
  }

  // Build args
  const args = ['--dangerously-skip-permissions', '--model', model, '--max-turns', maxTurns];

  if (opts.useWorkspace && opts.projectRoot) {
    args.push('--add-dir', opts.projectRoot);
  }

  // Handle system prompt append
  let tmpSysFile = null;
  if (opts.appendSystemPromptFile) {
    args.push('--append-system-prompt-file', opts.appendSystemPromptFile);
  } else if (opts.appendSystemPrompt) {
    const tmpDir = path.join(os.tmpdir(), 'daemon-claude');
    fs.mkdirSync(tmpDir, { recursive: true });
    tmpSysFile = path.join(tmpDir, `sys-${Date.now()}-${process.pid}.txt`);
    fs.writeFileSync(tmpSysFile, opts.appendSystemPrompt, 'utf8');
    args.push('--append-system-prompt-file', tmpSysFile);
  }

  // -p must be last — stdin is read as the prompt
  args.push('-p');

  const spawnSpec = shouldUseRealSpawnSpec(spawnFn)
    ? buildClaudeSpawnSpec('claude', args)
    : { command: 'claude', args };

  const child = spawnFn(spawnSpec.command, spawnSpec.args, {
    cwd,
    env,
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let cancelled = false;
  let timedOut = false;
  let timeoutTimer = null;

  if (child.stdout)
    child.stdout.on('data', data => {
      stdout += data;
    });
  if (child.stderr)
    child.stderr.on('data', data => {
      stderr += data;
    });

  // Write prompt to stdin
  if (child.stdin) {
    child.stdin.write(prompt);
    child.stdin.end();
  }

  const promise = new Promise((resolve, reject) => {
    // Timeout handler
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      if (child.kill) child.kill('SIGTERM');
      reject(new Error(`Timeout: claude process exceeded ${timeout}ms`));
    }, timeout);

    child.on('close', code => {
      clearTimeout(timeoutTimer);
      // Clean up temp file
      if (tmpSysFile) {
        try {
          fs.unlinkSync(tmpSysFile);
        } catch {
          /* ignored */
        }
      }
      if (cancelled) {
        reject(new Error('Task cancelled'));
        return;
      }
      if (timedOut) return; // already rejected
      if (code === 0 || code === null) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `claude exited with code ${code}`));
      }
    });

    child.on('error', err => {
      clearTimeout(timeoutTimer);
      if (tmpSysFile) {
        try {
          fs.unlinkSync(tmpSysFile);
        } catch {
          /* ignored */
        }
      }
      reject(err);
    });
  });

  const cancel = () => {
    cancelled = true;
    clearTimeout(timeoutTimer);
    if (child.kill) child.kill('SIGTERM');
  };

  return { child, promise, cancel };
}

module.exports = {
  claudeSync,
  claudeAsync,
  _claudeAsyncImpl,
  nodeSync,
  buildClaudeSpawnSpec,
  TASK_WORKSPACE,
};
