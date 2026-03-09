#!/usr/bin/env node
'use strict';

/**
 * UserPromptSubmit orchestrator
 *
 * Runs UserPromptSubmit hooks in a deterministic order to avoid race/ordering
 * issues from multiple parallel command hooks.
 *
 * Policy:
 * - Side-effect hooks should not emit stdout on allow path.
 * - If any child blocks (non-zero exit), forward its stdout block payload and exit non-zero.
 * - On child execution errors, fail-open and continue to next hook.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const HOOK_ORDER = [
  // NOTE: force-step0-execution.cjs is NOT listed here because it already runs
  // as a direct hook in settings.json (UserPromptSubmit index 0). Including it
  // here would cause double execution per user prompt.
  '.claude/hooks/session/state-reset.cjs',
  // Router identity reminder fires before routing analysis so the reminder
  // is visible to Claude before any routing enforcement runs.
  // Skips silently for subagent sessions (detects task_id: task-N prefix).
  // Toggle off: ROUTER_IDENTITY_REMINDER=off
  '.claude/hooks/routing/router-identity-reminder.cjs',
  '.claude/hooks/routing/user-prompt-unified.cjs',
  '.claude/hooks/session/drift-detector.cjs',
  '.claude/hooks/session/vector-db-warmstart.cjs',
];

function ensureFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function ensureBootstrapReadTargets(projectRoot = PROJECT_ROOT) {
  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
  const metricsDir = path.join(projectRoot, '.claude', 'context', 'metrics');

  // Prevent noisy "Read file does not exist" errors before routing hooks have
  // had a chance to create advisory placeholders.
  ensureFileIfMissing(path.join(runtimeDir, 'reflection-spawn-request.json'), '[]\n');
  ensureFileIfMissing(
    path.join(runtimeDir, 'reflection-reminder.txt'),
    'No pending reflection requests.\n'
  );
  ensureFileIfMissing(
    path.join(memoryDir, 'open-findings.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), findings: [] }, null, 2)}\n`
  );
  ensureFileIfMissing(path.join(memoryDir, 'learnings.md'), '# Learnings\n\n');
  ensureFileIfMissing(path.join(memoryDir, 'decisions.md'), '# Decisions\n\n');
  ensureFileIfMissing(path.join(memoryDir, 'issues.md'), '# Issues\n\n');
  ensureFileIfMissing(path.join(memoryDir, 'active_context.md'), '# Active Context\n\n');
  ensureFileIfMissing(path.join(metricsDir, 'open-findings-trend.jsonl'), '');
}

function stderrLog(message) {
  process.stderr.write(`[user-prompt-orchestrator] ${message}\n`);
}

function runChildHook(hookPath, stdinData) {
  const absPath = path.isAbsolute(hookPath) ? hookPath : path.join(PROJECT_ROOT, hookPath);
  return cp.spawnSync(process.execPath, [absPath], {
    input: stdinData,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    windowsHide: true,
  });
}

function main() {
  let stdinData = '';
  try {
    stdinData = fs.readFileSync(0, 'utf8');
  } catch (_err) {
    // No input available; nothing to orchestrate.
    process.exit(0);
    return;
  }
  if (!stdinData.trim()) {
    process.exit(0);
    return;
  }

  try {
    ensureBootstrapReadTargets();
  } catch (err) {
    stderrLog(`bootstrap read target creation failed: ${err.message}`);
  }

  for (const hookPath of HOOK_ORDER) {
    const result = runChildHook(hookPath, stdinData);

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    // Child process execution failure (not hook block) -> fail-open.
    if (result.error) {
      stderrLog(`child execution failed for ${hookPath}: ${result.error.message}`);
      continue;
    }

    // Non-zero means block/failure. Forward child output and stop.
    if ((result.status ?? 0) !== 0) {
      const payload = (result.stdout || '').trim();
      if (payload.length > 0) {
        process.stdout.write(payload.endsWith('\n') ? payload : payload + '\n');
      } else {
        process.stdout.write(
          JSON.stringify({
            block: true,
            message: `Blocked by ${hookPath} (non-zero exit code ${result.status})`,
          }) + '\n'
        );
      }
      process.exit(result.status || 1);
      return;
    }
  }

  // All hooks allowed.
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { HOOK_ORDER, runChildHook, ensureBootstrapReadTargets };
