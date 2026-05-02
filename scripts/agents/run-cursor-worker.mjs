import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MODEL_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER_SCRIPT = path.join(__dirname, 'run-cursor-worker.sh');

function realpathSync(p) {
  const fn = fs.realpathSync.native || fs.realpathSync;
  return fn(p);
}

function assertSafeModel(model) {
  if (typeof model !== 'string' || model.length === 0 || !MODEL_SAFE.test(model)) {
    throw new Error(
      `Invalid model name: use only alphanumeric, dot, dash, underscore, colon, slash (got ${JSON.stringify(model)})`
    );
  }
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  let prompt = null;
  let model = 'auto';
  let workspace = process.cwd();
  let dryRun = false;
  let json = false;
  let force = false;
  let trust = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--prompt') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error('Missing value for --prompt <path>');
      }
      prompt = args[++i];
      continue;
    }
    if (a === '--model') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error('Missing value for --model <name>');
      }
      model = args[++i];
      continue;
    }
    if (a === '--workspace') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error('Missing value for --workspace <path>');
      }
      workspace = path.resolve(args[++i]);
      continue;
    }
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--trust') {
      trust = true;
      continue;
    }
    if (a === '--no-trust') {
      trust = false;
      continue;
    }
    if (a === '--no-force') {
      force = false;
      continue;
    }
    if (a === '--force') {
      force = true;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  if (!prompt) {
    throw new Error('Missing required --prompt <path>');
  }
  assertSafeModel(model);

  return { prompt, model, workspace, dryRun, json, force, trust };
}

export function resolvePromptPath(promptPath, cwd) {
  const absCwd = realpathSync(path.resolve(cwd));
  const joined = path.resolve(absCwd, promptPath);
  let realJoined;
  try {
    realJoined = realpathSync(joined);
  } catch {
    throw new Error(`Prompt path does not exist: ${joined}`);
  }
  const st = fs.statSync(realJoined);
  if (!st.isFile()) {
    throw new Error(`Prompt path must be a file, not a directory: ${realJoined}`);
  }
  const rel = path.relative(absCwd, realJoined);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Prompt path resolves outside workspace: ${realJoined}`);
  }
  return realJoined;
}

export function toWslPath(winPath) {
  const s = String(winPath).trim().replace(/\//g, '\\');
  const m = /^([a-zA-Z]):\\(.*)$/.exec(s) || /^([a-zA-Z]):$/.exec(s);
  if (!m) {
    throw new Error(`toWslPath: expected Windows path with drive letter: ${winPath}`);
  }
  const drive = m[1].toLowerCase();
  const tail =
    m[2] !== undefined && m[2].length > 0 ? m[2].split(/\\+/).filter(Boolean).join('/') : '';
  return tail ? `/mnt/${drive}/${tail}` : `/mnt/${drive}`;
}

/**
 * Map a resolved host path to a Linux path string inside WSL (Windows drive paths or /mnt/...).
 * @param {string} absHostPath
 * @returns {string}
 */
function hostPathToWslLinuxPath(absHostPath) {
  const n = path.normalize(absHostPath);
  const forward = n.replace(/\\/g, '/');
  if (/^\/mnt\/[a-z]\//i.test(forward)) {
    return forward;
  }
  if (/^[a-zA-Z]:[\\/]/.test(n) || /^[a-zA-Z]:$/.test(n)) {
    return toWslPath(n);
  }
  return forward;
}

function buildBashScript(model, trust, force, wsWsl, prWsl) {
  assertSafeModel(model);
  const runnerWsl = hostPathToWslLinuxPath(realpathSync(RUNNER_SCRIPT));
  const args = ['bash', runnerWsl, '--model', model];
  if (trust) {
    args.push('--trust');
  }
  if (force) {
    args.push('--force');
  }
  args.push(wsWsl, prWsl);
  return args;
}

function prepareCursorWorkerInvocation(options) {
  const model = options.model ?? 'auto';
  const trust = Boolean(options.trust);
  const force = Boolean(options.force);
  assertSafeModel(model);
  const resolvedWorkspace = realpathSync(path.resolve(options.workspaceWinPath));
  const resolvedPrompt = resolvePromptPath(options.promptWinPath, resolvedWorkspace);
  const wsWsl = hostPathToWslLinuxPath(resolvedWorkspace);
  const prWsl = hostPathToWslLinuxPath(resolvedPrompt);
  const args = buildBashScript(model, trust, force, wsWsl, prWsl);
  return {
    invocation: { command: 'wsl', args },
    resolvedPrompt,
    resolvedWorkspace,
    model,
    trust,
    force,
  };
}

export function buildCursorAgentInvocation(options) {
  return prepareCursorWorkerInvocation(options).invocation;
}

export async function runCursorWorker(options) {
  const dryRun = Boolean(options.dryRun);
  const json = Boolean(options.json);

  if (!options.promptPath) {
    throw new Error('Missing promptPath (required)');
  }

  const prepared = prepareCursorWorkerInvocation({
    workspaceWinPath: options.workspace ?? process.cwd(),
    promptWinPath: options.promptPath,
    model: options.model ?? 'auto',
    trust: Boolean(options.trust),
    force: Boolean(options.force),
  });
  const { invocation, resolvedPrompt, resolvedWorkspace, model, trust, force } = prepared;

  if (dryRun) {
    return {
      invocation,
      resolvedPrompt,
      resolvedWorkspace,
      model,
      trust,
      force,
      json,
    };
  }

  const spawnOpts = json
    ? { encoding: 'utf8', shell: false, windowsHide: true, cwd: resolvedWorkspace }
    : { stdio: 'inherit', shell: false, windowsHide: true, cwd: resolvedWorkspace };

  const spawn = options.spawnSyncImpl ?? spawnSync;
  const result = spawn(invocation.command, invocation.args, spawnOpts);
  const spawnError = result.error
    ? {
        code: result.error.code ?? 'SPAWN_ERROR',
        message: result.error.message ?? String(result.error),
      }
    : null;
  const exitCode = spawnError ? 1 : (result.status ?? 1);

  if (json) {
    return {
      invocation,
      resolvedPrompt,
      resolvedWorkspace,
      model,
      trust,
      force,
      exitCode,
      signal: result.signal,
      spawnError,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  if (exitCode !== 0) {
    const detail = spawnError ? `: ${spawnError.message}` : '';
    const err = new Error(`cursor-agent exited with code ${exitCode}${detail}`);
    err.exitCode = exitCode;
    err.invocation = invocation;
    err.spawnError = spawnError;
    throw err;
  }

  return {
    invocation,
    resolvedPrompt,
    resolvedWorkspace,
    model,
    force,
    trust,
    exitCode,
  };
}

async function main() {
  try {
    const parsed = parseArgs(process.argv);
    const result = await runCursorWorker({
      promptPath: parsed.prompt,
      workspace: parsed.workspace,
      model: parsed.model,
      trust: parsed.trust,
      force: parsed.force,
      dryRun: parsed.dryRun,
      json: parsed.json,
    });

    if (parsed.dryRun) {
      if (parsed.json) {
        console.log(JSON.stringify({ ...result, dryRun: true }));
      } else {
        const { invocation } = result;
        console.log(
          `${invocation.command} ${invocation.args.map(a => JSON.stringify(a)).join(' ')}`
        );
      }
      process.exit(0);
      return;
    }

    if (parsed.json) {
      console.log(JSON.stringify(result));
    }

    process.exit(result.exitCode === 0 ? 0 : result.exitCode);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }
}

const invokedAsMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedAsMain) {
  main();
}
