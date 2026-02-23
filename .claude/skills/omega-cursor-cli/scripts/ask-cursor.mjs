#!/usr/bin/env node
/**
 * Headless Cursor Agent CLI wrapper.
 * Usage:
 *   node ask-cursor.mjs "your prompt" [--model MODEL] [--json] [--yolo] [--trust] [--timeout-ms N]
 *   echo "prompt" | node ask-cursor.mjs [--model MODEL] [--json] [--yolo] [--trust] [--timeout-ms N]
 */
import { spawn } from 'child_process';
import path from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { assertNonEmptyPrompt, parseCliArgs } from './parse-args.mjs';

const USAGE =
  'Usage: node ask-cursor.mjs "prompt" [--model MODEL] [--json] [--yolo] [--trust] [--timeout-ms N]\n' +
  '       echo "prompt" | node ask-cursor.mjs [options]   (prompt from stdin)\n' +
  'Notes: --json maps to --output-format json; --yolo maps to --force (auto-approve all);\n' +
  '       --trust trusts the workspace without prompting (headless only);\n' +
  '       --sandbox is a deprecated alias for --yolo.\n' +
  'Exit codes: 0 success, 1 error, 124 timeout';
const MAX_STDIN_BYTES_DEFAULT = 50 * 1024 * 1024;
const MAX_STDIN_BYTES = Number.parseInt(process.env.ASK_CURSOR_MAX_STDIN_BYTES, 10);
const EFFECTIVE_MAX_STDIN_BYTES =
  Number.isInteger(MAX_STDIN_BYTES) && MAX_STDIN_BYTES > 0
    ? MAX_STDIN_BYTES
    : MAX_STDIN_BYTES_DEFAULT;

export function buildCursorArgs({ prompt, model, outputJson, yolo, trust, approveMcps }) {
  const cliArgs = ['--print', '--output-format', outputJson ? 'json' : 'text'];
  if (yolo) cliArgs.push('--yolo');
  if (trust) cliArgs.push('--trust');
  if (approveMcps) cliArgs.push('--approve-mcps');
  if (model) cliArgs.push('--model', model);
  cliArgs.push(prompt.trim());
  return cliArgs;
}

/**
 * Escape percent signs in an argument that will be passed through cmd.exe.
 * cmd.exe expands %VAR% even inside double-quoted arguments, so % must be
 * doubled to %% to be passed literally to the target process.
 */
function escapeCmdExeArg(s) {
  return s.replace(/%/g, '%%');
}

export function getExecutables(cliArgs, isWin) {
  if (isWin) {
    // Escape the prompt (last arg) so cmd.exe does not expand %VAR% references.
    const safeCmdArgs = [...cliArgs.slice(0, -1), escapeCmdExeArg(cliArgs[cliArgs.length - 1])];
    const configuredCursorAgentCmd = process.env.CURSOR_AGENT_CMD_PATH;
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    const derivedCursorAgentCmd = localAppData
      ? path.win32.join(localAppData, 'cursor-agent', 'cursor-agent.cmd')
      : userProfile
        ? path.win32.join(userProfile, 'AppData', 'Local', 'cursor-agent', 'cursor-agent.cmd')
        : null;
    const fallbackCursorAgentCmd =
      configuredCursorAgentCmd && configuredCursorAgentCmd.trim()
        ? configuredCursorAgentCmd.trim()
        : derivedCursorAgentCmd;
    const fallbackCandidate = fallbackCursorAgentCmd
      ? [
          {
            executable: 'cmd.exe',
            args: ['/d', '/s', '/c', fallbackCursorAgentCmd, ...safeCmdArgs],
            notFoundPattern: /not recognized as an internal or external command/i,
          },
        ]
      : [];
    return [
      {
        executable: 'cmd.exe',
        args: ['/d', '/s', '/c', 'agent', ...safeCmdArgs],
        notFoundPattern: /not recognized as an internal or external command/i,
      },
      {
        executable: 'cmd.exe',
        args: ['/d', '/s', '/c', 'cursor-agent', ...safeCmdArgs],
        notFoundPattern: /not recognized as an internal or external command/i,
      },
      ...fallbackCandidate,
      {
        executable: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npx', '-y', '@cursor/agent', ...safeCmdArgs],
        notFoundPattern: /not recognized as an internal or external command/i,
      },
    ];
  }
  return [
    { executable: 'agent', args: cliArgs },
    { executable: 'cursor-agent', args: cliArgs },
    { executable: 'npx', args: ['-y', '@cursor/agent', ...cliArgs] },
  ];
}

function runCandidate(candidate, runOptions, timeoutMs) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(candidate.executable, candidate.args, runOptions);
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'EINVAL')) {
        resolve({ enoent: true });
        return;
      }
      resolve({
        code: 1,
        stdout: '',
        stderr: `Failed to start ${candidate.executable}: ${err && err.message ? err.message : String(err)}`,
        timedOut: false,
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;
    let killPromise = null;
    let settled = false;

    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === 'win32') {
          killPromise = new Promise((done) => {
            if (!proc.pid) {
              done();
              return;
            }
            const killer = spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
              stdio: 'ignore',
            });
            killer.on('error', () => done());
            killer.on('close', () => done());
          });
        } else {
          proc.kill('SIGKILL');
        }
      }, timeoutMs);
    }

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (err && err.code === 'ENOENT') {
        finish({ enoent: true });
        return;
      }
      finish({
        code: 1,
        stdout,
        stderr:
          (stderr ? stderr + '\n' : '') + `Failed to run ${candidate.executable}: ${err.message}`,
        timedOut,
      });
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (killPromise) {
        killPromise.finally(() => {
          finish({ code: code ?? 1, stdout, stderr, timedOut });
        });
        return;
      }
      finish({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

async function runWithFallback(candidates, runOptions, timeoutMs) {
  for (const candidate of candidates) {
    const result = await runCandidate(candidate, runOptions, timeoutMs);
    if (result.enoent) continue;
    const combined = [result.stderr, result.stdout].filter(Boolean).join('\n');
    if (
      result.code !== 0 &&
      candidate.notFoundPattern &&
      candidate.notFoundPattern.test(combined)
    ) {
      continue;
    }
    return result;
  }
  return { code: 1, stdout: '', stderr: 'Cursor Agent CLI not found on PATH.', timedOut: false };
}

function printFailure(stderr, stdout, timedOut) {
  const combined = [stderr, stdout].filter(Boolean).join('\n').trim();
  if (timedOut) {
    const msg =
      'Cursor request timed out. Try a shorter prompt or set a larger timeout with --timeout-ms.';
    console.error(combined ? `${msg}\n\nPartial Output:\n${combined}` : msg);
    return;
  }
  console.error(combined);
  const hint =
    combined.toLowerCase().includes('not found') ||
    combined.toLowerCase().includes('command not found')
      ? '\nHint: Is Cursor Agent CLI installed and authenticated? Run: node .claude/skills/omega-cursor-cli/scripts/verify-setup.mjs'
      : '';
  if (hint) console.error(hint);
}

async function run(promptText, opts) {
  try {
    assertNonEmptyPrompt(promptText);
  } catch {
    console.error(USAGE);
    process.exit(1);
  }

  const cliArgs = buildCursorArgs({
    prompt: promptText,
    model: opts.model,
    outputJson: opts.outputJson,
    yolo: opts.yolo,
    trust: opts.trust,
    approveMcps: opts.approveMcps,
  });
  const runOptions = {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  };
  const candidates = getExecutables(cliArgs, process.platform === 'win32');
  const result = await runWithFallback(candidates, runOptions, opts.timeoutMs);

  if (result.code !== 0) {
    printFailure(result.stderr, result.stdout, result.timedOut);
    process.exit(result.timedOut ? 124 : (result.code ?? 1));
  }

  process.stdout.write(result.stdout);
}

export function isEntryPoint() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    console.error(USAGE);
    process.exit(1);
  }

  if (opts.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (opts.prompt) {
    await run(opts.prompt, opts);
    return;
  }

  const rl = createInterface({ input: process.stdin });
  const lines = [];
  let stdinBytes = 0;
  let stdinLimitExceeded = false;
  // lines.join('\n') always uses a 1-byte newline regardless of platform.
  const newlineBytes = 1;
  rl.on('line', (line) => {
    if (stdinLimitExceeded) return;
    const separatorBytes = lines.length > 0 ? newlineBytes : 0;
    const nextBytes = stdinBytes + separatorBytes + Buffer.byteLength(line, 'utf8');
    if (nextBytes > EFFECTIVE_MAX_STDIN_BYTES) {
      stdinLimitExceeded = true;
      rl.close();
      return;
    }
    stdinBytes = nextBytes;
    lines.push(line);
  });
  rl.on('close', async () => {
    if (stdinLimitExceeded) {
      console.error(
        `Input from stdin exceeds ${(EFFECTIVE_MAX_STDIN_BYTES / (1024 * 1024)).toFixed(1)} MB limit. Provide a shorter prompt.`
      );
      // Use exitCode rather than process.exit() so buffered stderr is flushed
      // before the process terminates naturally.
      process.exitCode = 1;
      return;
    }
    await run(lines.join('\n'), opts);
  });
}

if (isEntryPoint()) {
  await main();
}
