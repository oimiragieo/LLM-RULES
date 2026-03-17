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

  // PHASE 28: Deep Ecosystem Evolution Auto-Trigger
  // If AGENTS.md is missing, this is the first time Agent Studio is running in this repository.
  // We MUST schedule the 'init' skill to run immediately at Step 0 of the router to build the
  // localized ecosystem capability map (AGENTS.md).
  const agentsMdPath = path.join(projectRoot, '.claude', 'AGENTS.md');
  const isFirstRun = !fs.existsSync(agentsMdPath);

  let initialSpawnRequest = '[]\n';
  let initialReminder = 'No pending reflection requests.\n';

  if (isFirstRun) {
    const initPayload = [
      {
        id: 'bootstrap-init',
        status: 'pending',
        subagent_type: 'init',
        description: 'Initialize ecosystem for new codebase',
        prompt:
          'Run the init skill to generate the localized ecosystem capability map (AGENTS.md) and identify any missing skills or agents for this specific codebase.',
        source: {
          trigger: 'missing_agents_md',
          timestamp: new Date().toISOString(),
          taskId: 'bootstrap-init-task',
          context: 'user-prompt-orchestrator',
          priority: 'high',
        },
      },
    ];
    initialSpawnRequest = `${JSON.stringify(initPayload, null, 2)}\n`;
    initialReminder = `Step 0.1: Ecosystem bootstrap required. Read .claude/context/runtime/reflection-spawn-request.json and spawn the 'init' skill.\n`;
  }

  // Prevent noisy "Read file does not exist" errors before routing hooks have
  // had a chance to create advisory placeholders.
  ensureFileIfMissing(path.join(runtimeDir, 'reflection-spawn-request.json'), initialSpawnRequest);
  ensureFileIfMissing(path.join(runtimeDir, 'reflection-reminder.txt'), initialReminder);

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
    stderrLog(`bootstrap target read/creation failed: ${err.message}`);
  }

  for (const hookPath of HOOK_ORDER) {
    const result = runChildHook(hookPath, stdinData);

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    // Child process execution failure (not hook block) -> fail-open.
    if (result.error) {
      const errMsg = result.error.message || '';
      stderrLog(`child execution failed for ${hookPath}: ${errMsg}`);

      // AUTO-RECOVERY: If the upstream Claude Code binary caches a stale absolute path
      // because a worktree was deleted mid-session, all subsequent hooks will throw
      // MODULE_NOT_FOUND. We MUST trap this and force the agent to /clear.
      if (errMsg.includes('MODULE_NOT_FOUND') && errMsg.includes('.claude')) {
        try {
          const reminderPath = path.join(
            PROJECT_ROOT,
            '.claude',
            'context',
            'runtime',
            'reflection-reminder.txt'
          );
          const recoveryPayload = `[CRITICAL SYSTEM FAULT] Your current working directory (CWD) was corrupted or deleted (likely a stale worktree). The Claude Code runtime has permanently cached broken absolute paths, causing all hooks to throw MODULE_NOT_FOUND. You MUST immediately execute the \`/clear\` command to reset your session context and restore a healthy CWD.\n`;
          fs.writeFileSync(reminderPath, recoveryPayload, 'utf8');
          stderrLog('Auto-recovery triggered: injected CWD corruption reset payload');
        } catch (recoverErr) {
          stderrLog(`Auto-recovery write failed: ${recoverErr.message}`);
        }
      }
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
