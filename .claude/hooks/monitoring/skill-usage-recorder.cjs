#!/usr/bin/env node
/**
 * PostToolUse hook: records Skill tool invocations to skill-usage.jsonl
 * F8 wire-in. Off-by-default; enable with AGENT_EVOLUTION_ENABLED=1.
 * Fail-open (never blocks tool calls).
 *
 * Registration: settings.json PostToolUse (matcher: Skill)
 * Overhead target: <5ms per invocation.
 */
'use strict';

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function main() {
  const start = Date.now();
  try {
    if (process.env.AGENT_EVOLUTION_ENABLED !== '1') {
      process.exit(0);
    }

    const { parseHookInputAsync, getToolName, getToolInput } = require(
      path.join(PROJECT_ROOT, '.claude/lib/utils/hook-input.cjs')
    );

    const input = await parseHookInputAsync();
    if (!input) process.exit(0);

    if (getToolName(input) !== 'Skill') process.exit(0);

    const toolInput = getToolInput(input) || {};
    const skillName = toolInput.skill || toolInput.skill_name || null;
    if (!skillName) process.exit(0);

    const { SkillUsageTracker } = require(
      path.join(PROJECT_ROOT, '.claude/lib/evolution/skill-usage-tracker.cjs')
    );
    const tracker = new SkillUsageTracker();
    const durationMs = Date.now() - start;
    tracker.recordInvocation(skillName, { success: true, durationMs });
  } catch (_err) {
    // Fail-open: never block tool chain on telemetry errors
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { main };
