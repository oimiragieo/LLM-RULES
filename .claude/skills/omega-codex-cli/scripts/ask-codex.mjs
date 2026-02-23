#!/usr/bin/env node
/**
 * Headless Codex CLI wrapper.
 * Usage:
 *   node ask-codex.mjs "your prompt" [--model MODEL] [--json] [--sandbox] [--timeout-ms N]
 *   echo "prompt" | node ask-codex.mjs [--model MODEL] [--json] [--sandbox] [--timeout-ms N]
 */
import { spawn } from 'child_process';
import path from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { assertNonEmptyPrompt, parseCliArgs } from './parse-args.mjs';

const USAGE =
  'Usage: node ask-codex.mjs "prompt" [--model MODEL] [--json] [--sandbox] [--timeout-ms N]\n' +
  'Notes: --json forwards codex JSONL events to stdout; --sandbox maps to codex --sandbox workspace-write.\n' +
  'Exit codes: 0 success, 1 error, 124 timeout';
const MAX_STDIN_BYTES_DEFAULT = 50 * 1024 * 1024;
const MAX_STDIN_BYTES = Number.parseInt(process.env.ASK_CODEX_MAX_STDIN_BYTES, 10);
const EFFECTIVE_MAX_STDIN_BYTES =
  Number.isInteger(MAX_STDIN_BYTES) && MAX_STDIN_BYTES > 0
    ? MAX_STDIN_BYTES
    : MAX_STDIN_BYTES_DEFAULT;

export function buildCodexArgs({ prompt, model, outputJson, sandbox }) {
  const cliArgs = ['exec', prompt.trim(), '--skip-git-repo-check'];
  if (sandbox) cliArgs.push('--sandbox', 'workspace-write');
  if (model) cliArgs.push('--model', model);
  if (outputJson) cliArgs.push('--json');
  return cliArgs;
}

export function getExecutables(cliArgs, isWin) {
  if (isWin) {
    return [
      {
        executable: 'cmd.exe',
        args: ['/d', '/s', '/c', 'codex', ...cliArgs],
        notFoundPattern: /not recognized as an internal or external command/i,
      },
      {
        executable: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npx', '-y', '@openai/codex', ...cliArgs],
        notFoundPattern: /not recognized as an internal or external command/i,
      },
    ];
  }
  return [
    { executable: 'codex', args: cliArgs },
    { executable: 'npx', args: ['-y', '@openai/codex', ...cliArgs] },
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
  return { code: 1, stdout: '', stderr: 'Codex CLI not found on PATH.', timedOut: false };
}

function printFailure(stderr, stdout, timedOut) {
  const combined = [stderr, stdout].filter(Boolean).join('\n').trim();
  if (timedOut) {
    const msg =
      'Codex request timed out. Try a shorter prompt or set a larger timeout with --timeout-ms.';
    console.error(combined ? `${msg}\n\nPartial Output:\n${combined}` : msg);
    return;
  }
  console.error(combined);
  const hint =
    combined.toLowerCase().includes('not found') ||
    combined.toLowerCase().includes('command not found')
      ? '\nHint: Is the Codex CLI installed and authenticated? Run: node .claude/skills/omega-codex-cli/scripts/verify-setup.mjs'
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

  const cliArgs = buildCodexArgs({
    prompt: promptText,
    model: opts.model,
    outputJson: opts.outputJson,
    sandbox: opts.sandbox,
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
  const newlineBytes = process.platform === 'win32' ? 2 : 1;
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
      process.exit(1);
      return;
    }
    await run(lines.join('\n'), opts);
  });
}

if (isEntryPoint()) {
  await main();
}
