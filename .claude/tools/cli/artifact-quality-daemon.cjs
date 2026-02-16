#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('node:fs');
const path = require('node:path');
const lockfile = require('proper-lockfile');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');
const { runGate } = require('./validate-artifact-regression-gate.cjs');
const {
  getRuntimePaths,
  readRemediationState,
} = require('../../lib/quality/artifact-quality-runtime.cjs');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const SYSTEM_REMEDIATION_KEY = 'system:artifact-regression-gate';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return {
    mode: String(options.mode || 'once')
      .trim()
      .toLowerCase(),
    projectRoot:
      typeof options['project-root'] === 'string'
        ? path.resolve(options['project-root'])
        : process.cwd(),
    intervalMs: Number(
      options['interval-ms'] ||
        process.env.ARTIFACT_QUALITY_DAEMON_INTERVAL_MS ||
        DEFAULT_INTERVAL_MS
    ),
    json: options.json === true || options.json === 'true',
  };
}

function getDaemonPaths(projectRoot) {
  const runtime = getRuntimePaths(projectRoot);
  return {
    ...runtime,
    statePath: path.join(runtime.runtimeDir, 'artifact-quality-daemon-state.json'),
    lockPath: path.join(runtime.runtimeDir, 'artifact-quality-daemon.lock'),
  };
}

function ensureRuntimeDir(paths) {
  if (!fs.existsSync(paths.runtimeDir)) {
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
  }
  if (!fs.existsSync(paths.lockPath)) {
    fs.writeFileSync(paths.lockPath, '', 'utf8');
  }
}

function writeState(paths, patch) {
  const prev = fs.existsSync(paths.statePath)
    ? safeParseJSON(fs.readFileSync(paths.statePath, 'utf8'))
    : {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(paths.statePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

function getState(paths) {
  if (!fs.existsSync(paths.statePath)) return null;
  return safeParseJSON(fs.readFileSync(paths.statePath, 'utf8'));
}

function maybeWriteSystemRemediation(paths, gate) {
  const remediationState = readRemediationState(paths.remediationPath);
  const existing = remediationState.get(SYSTEM_REMEDIATION_KEY);
  const now = new Date().toISOString();

  if (!gate.ok) {
    if (!existing || existing.status !== 'open') {
      appendJsonl(
        paths.remediationPath,
        {
          timestamp: now,
          action: 'open',
          status: 'open',
          artifactKey: SYSTEM_REMEDIATION_KEY,
          artifactType: 'workflow',
          artifactName: 'artifact-regression-gate',
          artifactPath: '.claude/tools/cli/validate-artifact-regression-gate.cjs',
          severity: 'high',
          overallScore: null,
          source: 'artifact-quality-daemon',
          notes: gate.failures.slice(0, 5).join(' | ') || 'Regression gate failed',
        },
        { maxLines: 20000 }
      );
      return { opened: true, resolved: false };
    }
    return { opened: false, resolved: false };
  }

  if (existing && existing.status === 'open') {
    appendJsonl(
      paths.remediationPath,
      {
        timestamp: now,
        action: 'resolve',
        status: 'resolved',
        artifactKey: SYSTEM_REMEDIATION_KEY,
        artifactType: 'workflow',
        artifactName: 'artifact-regression-gate',
        artifactPath: '.claude/tools/cli/validate-artifact-regression-gate.cjs',
        severity: existing.severity || 'high',
        overallScore: null,
        source: 'artifact-quality-daemon',
        notes: 'Auto-resolved: regression gate healthy',
      },
      { maxLines: 20000 }
    );
    return { opened: false, resolved: true };
  }

  return { opened: false, resolved: false };
}

function runCycle(options, paths) {
  const gate = runGate({ projectRoot: options.projectRoot });
  const remediation = maybeWriteSystemRemediation(paths, gate);
  const state = writeState(paths, {
    mode: options.mode,
    pid: process.pid,
    heartbeatAt: new Date().toISOString(),
    lastCycleAt: new Date().toISOString(),
    lastCycleOk: gate.ok,
    artifactsTracked: gate.artifactsTracked,
    ledgerEntries: gate.ledgerEntries,
    failures: gate.failures.slice(0, 20),
    remediationOpened: remediation.opened,
    remediationResolved: remediation.resolved,
  });
  return { gate, remediation, state };
}

async function runOnce(options) {
  const paths = getDaemonPaths(options.projectRoot);
  ensureRuntimeDir(paths);
  const result = runCycle(options, paths);
  return { paths, ...result };
}

async function runDaemon(options) {
  const paths = getDaemonPaths(options.projectRoot);
  ensureRuntimeDir(paths);

  writeState(paths, {
    mode: 'daemon',
    status: 'starting',
    pid: process.pid,
    intervalMs: options.intervalMs,
    startedAt: new Date().toISOString(),
  });

  let release = null;
  try {
    release = await lockfile.lock(paths.lockPath, {
      stale: Math.max(options.intervalMs * 2, 30000),
      retries: 0,
      realpath: false,
      update: Math.max(Math.floor(options.intervalMs / 2), 5000),
    });
  } catch (_err) {
    writeState(paths, {
      mode: 'daemon',
      status: 'blocked',
      blockedReason: 'lock_already_held',
    });
    throw new Error('artifact-quality-daemon already running (lock held)');
  }

  let stopped = false;
  const stop = async signal => {
    if (stopped) return;
    stopped = true;
    writeState(paths, {
      mode: 'daemon',
      status: 'stopping',
      stopSignal: signal || null,
    });
    if (release) {
      try {
        await release();
      } catch (_e) {
        // best effort
      }
    }
    writeState(paths, {
      mode: 'daemon',
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    });
    process.exit(0);
  };

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  writeState(paths, {
    mode: 'daemon',
    status: 'running',
    intervalMs: options.intervalMs,
  });

  while (!stopped) {
    runCycle({ ...options, mode: 'daemon' }, paths);
    await new Promise(resolve => setTimeout(resolve, options.intervalMs));
  }
}

function formatOutput(result, asJson) {
  if (asJson) return JSON.stringify(result, null, 2);
  if (result && result.state && result.gate) {
    return [
      `artifact-quality-daemon cycle: ${result.gate.ok ? 'OK' : 'FAIL'}`,
      `- artifactsTracked: ${result.gate.artifactsTracked}`,
      `- ledgerEntries: ${result.gate.ledgerEntries}`,
      `- failures: ${result.gate.failures.length}`,
      `- remediationOpened: ${result.remediation.opened}`,
      `- remediationResolved: ${result.remediation.resolved}`,
      `- state: ${result.state.status || result.state.mode || 'unknown'}`,
    ].join('\n');
  }
  return 'artifact-quality-daemon status unavailable';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 1000) {
    throw new Error('interval-ms must be >= 1000');
  }

  if (options.mode === 'status') {
    const paths = getDaemonPaths(options.projectRoot);
    ensureRuntimeDir(paths);
    const state = getState(paths);
    const result = {
      ok: true,
      mode: 'status',
      projectRoot: options.projectRoot,
      state,
      paths,
    };
    console.log(formatOutput(result, options.json));
    return;
  }

  if (options.mode === 'once') {
    const result = await runOnce(options);
    console.log(formatOutput(result, options.json));
    return;
  }

  if (options.mode === 'daemon') {
    await runDaemon(options);
    return;
  }

  throw new Error(`Unknown mode: ${options.mode}`);
}

const wrappedMain = wrapCLITool(main, 'artifact-quality-daemon');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  getDaemonPaths,
  runOnce,
  runCycle,
  formatOutput,
};
