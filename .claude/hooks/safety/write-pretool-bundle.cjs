#!/usr/bin/env node
/**
 * Unified Write PreToolUse Hook Bundle (PERF-001)
 * Consolidates 8 hooks for Edit|Write|NotebookEdit into a single in-process execution.
 * Target Latency: <100ms
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { parseHookInputAsync, getToolName, getToolInput, formatResult, auditLog } =
  libRequire('utils/hook-input.cjs');

// In-process hook modules
const { runAllChecks: runRoutingGuard } = require('../routing/routing-guard-core.impl.cjs');
const { validateCreatorWorkflow } = require('../routing/unified-creator-guard.cjs');
const { validateAgentContent, isAgentFile, shouldEnforceForWrite } = libRequire(
  'agents/agent-template-contract.cjs'
);
const { getIncomingContent } = require('../validation/agent-template-contract-validator.cjs');
const { CHECKS: preWriteChecks } = require('./unified-pre-write-hook.cjs');
const evolutionGuard = require('../evolution/evolution-state-guard.cjs');
const researchEnforcement = require('../evolution/research-enforcement.cjs');
const qualityGate = require('../evolution/quality-gate-validator.cjs');
const adaptiveGate = require('../session/adaptive-quality-gate.cjs');

function formatHookError(err) {
  if (!err) return 'Unknown hook failure (no error object)';
  const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : null;
  if (message) return message;
  const text = String(err).trim();
  return text || 'Unknown hook failure (empty error message)';
}

async function main() {
  const perfStart = performance.now();
  const emitPerf = stage => {
    const duration = performance.now() - perfStart;
    if (process.env.DEBUG_HOOKS === 'true' || duration > 100) {
      auditLog('write-pretool-bundle', 'perf_metrics', {
        durationMs: Number(duration.toFixed(2)),
        stage,
      });
    }
  };
  let hookInput = null;

  try {
    hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    // Reflection-agent runtime queue drain (Step 0 IRON LAW).
    // reflection-agent is permitted to write to EXACTLY two runtime paths:
    //   - .claude/context/runtime/reflection-spawn-request.json
    //   - .claude/context/runtime/reflection-reminder.txt
    // Any other path in runtime/ is blocked even for reflection-agent.
    // All other agents are blocked from these two paths unconditionally
    // (they must NOT bypass this check via the general sub-agent bypass below).
    const _agentId = process.env.CLAUDE_AGENT_ID;
    const _rawPath =
      (hookInput &&
        hookInput.tool_input &&
        (hookInput.tool_input.file_path || hookInput.tool_input.path)) ||
      '';
    const _normPath = _rawPath.split('\\').join('/');
    const REFLECTION_ALLOWED_PATHS = [
      '.claude/context/runtime/reflection-spawn-request.json',
      '.claude/context/runtime/reflection-reminder.txt',
    ];
    const _isReflectionPath = REFLECTION_ALLOWED_PATHS.some(p => _normPath.endsWith(p));
    const _isRuntimePath = _normPath.includes('.claude/context/runtime/');
    if (_isReflectionPath) {
      // Only reflection-agent (via env CLAUDE_AGENT_ID) may write these paths.
      if (_agentId === 'reflection-agent') {
        process.exit(0);
      }
      // Everyone else — including router — is blocked.
      console.log(
        JSON.stringify({
          result: 'block',
          message:
            '[REFLECTION-RUNTIME-GUARD] Only reflection-agent may write to reflection runtime queue paths.',
        })
      );
      process.exit(2);
    }
    // reflection-agent is restricted to the two allowed paths; block any other runtime/ write.
    if (_agentId === 'reflection-agent' && _isRuntimePath) {
      console.log(
        JSON.stringify({
          result: 'block',
          message:
            '[REFLECTION-RUNTIME-GUARD] reflection-agent may only write reflection-spawn-request.json or reflection-reminder.txt in runtime/.',
        })
      );
      process.exit(2);
    }

    // Sub-agent bypass: non-router sub-agents skip all write safety checks.
    // Matches the precedent in router-tool-lockdown.cjs:171-177 and
    // routing-guard-core.helpers.cjs:29-33 — task_id in hookInput is a
    // definitive signal that a subagent is executing this tool call.
    const hookTaskId = hookInput && (hookInput.task_id || hookInput.taskId);
    if ((_agentId && _agentId !== 'router') || hookTaskId) {
      process.exit(0);
    }

    // Path whitelist: report/plan/artifact/tmp/log paths are always allowed.
    // These are append-only outputs with no security surface; all agents write to them.
    // Needed because subagent hookInput carries only  (no task_id, no CLAUDE_AGENT_ID),
    // so the bypass above never triggers for legitimate subagent output writes.
    const SAFE_WRITE_PREFIXES = [
      '.claude/context/reports/',
      '.claude/context/artifacts/',
      '.claude/context/plans/',
      '.claude/context/tmp/',
      '.claude/context/logs/',
      '.claude/context/memory/',
      '.claude/context/metrics/',
    ];
    const writePath =
      (getToolInput(hookInput) &&
        (getToolInput(hookInput).file_path || getToolInput(hookInput).path)) ||
      '';
    const normalizedWritePath = writePath.split('\\').join('/');
    const relWritePath = normalizedWritePath.includes('.claude/context/')
      ? normalizedWritePath.slice(normalizedWritePath.indexOf('.claude/context/'))
      : normalizedWritePath;
    if (SAFE_WRITE_PREFIXES.some(prefix => relWritePath.startsWith(prefix))) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    const t0 = performance.now();
    // 1. Routing Guard
    const rgResult = runRoutingGuard(toolName, toolInput, hookInput);
    const t1 = performance.now();
    if (!rgResult.pass) {
      emitPerf('routingGuard_block');
      console.log(formatResult(rgResult.result, rgResult.message));
      process.exit(2);
    }

    // 2. Unified Creator Guard
    const creatorResult = validateCreatorWorkflow(toolName, toolInput);
    const t2 = performance.now();
    if (!creatorResult.pass) {
      emitPerf('creatorGuard_block');
      console.log(formatResult(creatorResult.result, creatorResult.message));
      process.exit(2);
    }

    // 3. Agent Template Contract
    const absPath = path.resolve(PROJECT_ROOT, toolInput.file_path || toolInput.path || '');
    if (isAgentFile(absPath)) {
      const existingContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null;
      const incomingContent = getIncomingContent(toolName, toolInput, existingContent);
      if (shouldEnforceForWrite({ filePath: absPath, incomingContent, existingContent })) {
        const validation = validateAgentContent(incomingContent, { requireMarker: true });
        if (!validation.valid) {
          const msg = `[AGENT-TEMPLATE-CONTRACT] ${validation.errors.join(' | ')}`;
          emitPerf('agentContract_block');
          console.log(formatResult('block', msg));
          process.exit(2);
        }
      }
    }
    const t3 = performance.now();

    // 4. Unified Pre-Write Hook (11 checks)
    for (const check of preWriteChecks) {
      const result = await check.run(toolName, toolInput, hookInput);
      if (!result.pass) {
        emitPerf('preWrite_block');
        console.log(formatResult(result.result, result.message));
        process.exit(2);
      }
    }
    const t4 = performance.now();

    // 5. Evolution State Guard
    const targetState = evolutionGuard.extractTargetState(toolInput);
    if (targetState) {
      const state = evolutionGuard.getEvolutionState();
      if (!evolutionGuard.isValidTransition(state?.state || 'idle', targetState)) {
        emitPerf('evolutionGuard_block');
        console.log(formatResult('block', `Invalid evolution state transition: ${targetState}`));
        process.exit(2);
      }
    }
    const t5 = performance.now();

    // 6. Research Enforcement
    const filePath = toolInput.file_path || toolInput.path || '';
    if (researchEnforcement.isArtifactPath(filePath)) {
      const state = researchEnforcement.getEvolutionState();
      const research = researchEnforcement.checkResearchComplete(state);
      if (!research.complete) {
        emitPerf('research_block');
        console.log(formatResult('block', 'Research phase incomplete.'));
        process.exit(2);
      }
    }
    const t6 = performance.now();

    // 7. Quality Gate (Verify Phase)
    const artifactType = qualityGate.detectArtifactType(filePath);
    if (artifactType) {
      const state = qualityGate.getEvolutionState();
      if (qualityGate.isInVerifyPhase(state)) {
        const content = toolInput.content || toolInput.new_string || '';
        const validation = qualityGate.validateQuality(content, artifactType);
        if (!validation.valid) {
          emitPerf('qualityGate_block');
          console.log(formatResult('block', 'Quality gate failed.'));
          process.exit(2);
        }
      }
    }
    const t7 = performance.now();

    // 8. Adaptive Quality Gate (informational side-effects)
    try {
      let counter = adaptiveGate.readCounter();
      counter.count += 1;
      const thresholds = adaptiveGate.determineThresholds();
      counter = adaptiveGate.checkThresholds(counter.count, thresholds, counter);
      adaptiveGate.writeCounter(counter);
    } catch (_e) {
      /* ignore informational failures */
    }
    const t8 = performance.now();

    // Final Performance Check
    const duration = performance.now() - perfStart;
    if (process.env.DEBUG_HOOKS === 'true' || duration > 100) {
      auditLog('write-pretool-bundle', 'perf_metrics', {
        durationMs: Number(duration.toFixed(2)),
        checks: {
          routingGuard: Number((t1 - t0).toFixed(2)),
          creatorGuard: Number((t2 - t1).toFixed(2)),
          agentContract: Number((t3 - t2).toFixed(2)),
          preWrite: Number((t4 - t3).toFixed(2)),
          evolutionGuard: Number((t5 - t4).toFixed(2)),
          researchEnf: Number((t6 - t5).toFixed(2)),
          qualityGate: Number((t7 - t6).toFixed(2)),
          adaptiveGate: Number((t8 - t7).toFixed(2)),
          startup: Number((t0 - perfStart).toFixed(2)),
        },
      });
    }

    // Success: no payload passthrough needed for this bundle. Emitting large tool_input
    // can cause host-side JSON truncation during PreToolUse parsing.
    process.exit(0);
  } catch (err) {
    emitPerf('exception');
    // Fail-CLOSED by default for write safety hooks: unexpected exceptions block writes.
    // Set WRITE_HOOK_FAIL_OPEN=true to revert to permissive behavior (NOT recommended).
    const errorMessage = formatHookError(err);
    console.error(`[write-pretool-bundle] Unexpected error (fail-closed): ${errorMessage}`);
    if (process.env.WRITE_HOOK_FAIL_OPEN === 'true') {
      process.exit(0);
    }
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}
