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

async function main() {
  const perfStart = performance.now();
  let hookInput = null;

  try {
    hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    const t0 = performance.now();
    // 1. Routing Guard
    const rgResult = runRoutingGuard(toolName, toolInput, hookInput);
    const t1 = performance.now();
    if (!rgResult.pass) {
      console.log(formatResult(rgResult.result, rgResult.message));
      process.exit(2);
    }

    // 2. Unified Creator Guard
    const creatorResult = validateCreatorWorkflow(toolName, toolInput);
    const t2 = performance.now();
    if (!creatorResult.pass) {
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

    // Success - pass through the original input (or modified if any hook supported transformation)
    process.stdout.write(JSON.stringify(hookInput));
    process.exit(0);
  } catch (err) {
    // Fail-open by default: unexpected exceptions should not block ALL writes.
    // Set HOOK_FAIL_CLOSED=true to revert to blocking behavior.
    console.error(`[write-pretool-bundle] Unexpected error (fail-open): ${err.message}`);
    if (process.env.HOOK_FAIL_CLOSED === 'true') {
      process.exit(2);
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
