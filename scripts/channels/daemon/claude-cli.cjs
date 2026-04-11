/**
 * claude-cli.cjs — Safe Claude CLI wrapper for the channel daemon
 *
 * Always pipes the prompt via stdin (using `-p` as the last flag with no value)
 * to avoid Windows cmd.exe argument quoting issues where spawnSync with
 * shell:true silently truncates arguments containing spaces.
 *
 * All daemon modules should use this instead of raw execSync/spawnSync.
 *
 * ## Security Rationale — shell: true (M-01)
 *
 * Both claudeSync() and _claudeAsyncImpl() use shell: true when spawning
 * 'claude'. This is required on Windows because the Claude Code CLI is
 * installed as a .cmd wrapper (claude.cmd) in the PATH. Node.js cannot
 * resolve .cmd files without shell: true on Windows — the spawn call would
 * fail with ENOENT.
 *
 * Shell injection risk is mitigated because:
 *   1. The command is the literal string 'claude' — no user-controlled data.
 *   2. All arguments are an internal-only array built from vetted config values.
 *   3. The prompt (the only user-controlled content) is passed via stdin, not
 *      as a shell argument. stdin bypasses shell parsing entirely.
 *   4. ANTHROPIC_API_KEY is deleted from env before spawning.
 *
 * Converting to shell: false would require a platform-specific .cmd resolver
 * and the execFile/spawn API does not support .cmd wrappers on Windows without
 * calling cmd.exe /c explicitly, which reintroduces shell parsing.
 *
 * Audit reference: M-01 (security hardening review 2026-04-10)
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
    const result = spawnSync('claude', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      env,
      windowsHide: true,
      // shell: true required for Windows .cmd wrapper resolution (claude.cmd);
      // all args are internal-only; prompt is piped via stdin, not args.
      shell: true,
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
  return _claudeAsyncImpl(prompt, opts, require('child_process').spawn);
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

  const child = spawnFn('claude', args, {
    cwd,
    env,
    windowsHide: true,
    // shell: true required for Windows .cmd wrapper resolution (claude.cmd);
    // all args are internal-only; prompt is piped via stdin, not args.
    shell: true,
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

module.exports = { claudeSync, claudeAsync, _claudeAsyncImpl, nodeSync, TASK_WORKSPACE };
