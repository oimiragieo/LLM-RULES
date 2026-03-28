#!/usr/bin/env node
'use strict';

/**
 * hook-perf-benchmark.cjs — Measures PostToolUse hook chain latency
 *
 * Runs each registered PostToolUse hook with a mock payload and measures execution time.
 * Reports per-hook latency and total chain latency.
 * Flags any hook >50ms or total chain >100ms.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const SETTINGS_PATH = path.resolve(__dirname, '..', '..', 'settings.json');

function getPostToolUseHooks() {
  try {
    const settings = safeParseJSON(fs.readFileSync(SETTINGS_PATH, 'utf8'), {});
    const hooks = settings.hooks || {};
    const postHooks = hooks.PostToolUse || [];
    const result = [];
    for (const entry of postHooks) {
      const hookList = entry.hooks || [];
      for (const h of hookList) {
        if (h.type === 'command' && h.command) {
          result.push({
            matcher: entry.matcher || '*',
            command: h.command,
          });
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

function benchmarkHook(hookCommand) {
  const mockInput = JSON.stringify({
    tool_name: 'TaskUpdate',
    tool_input: { taskId: 'benchmark-test', status: 'completed' },
    tool_output: '{}',
  });

  // Parse command into program + args for shell:false safety
  const parts = hookCommand.split(/\s+/);
  const program = parts[0];
  const args = parts.slice(1);

  const start = process.hrtime.bigint();
  try {
    spawnSync(program, args, {
      input: mockInput,
      timeout: 5000,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Hook may fail on mock input — we're measuring latency, not correctness
  }
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000; // ms
}

function main() {
  console.log('=== Hook Performance Benchmark ===\n');

  const hooks = getPostToolUseHooks();

  if (hooks.length === 0) {
    console.log('No PostToolUse hooks registered in settings.json');
    return;
  }

  console.log(`Found ${hooks.length} PostToolUse hook(s):\n`);

  let totalMs = 0;
  const results = [];

  for (const hook of hooks) {
    const ms = benchmarkHook(hook.command);
    totalMs += ms;
    const status = ms > 50 ? 'SLOW' : 'OK';
    results.push({ matcher: hook.matcher, command: hook.command, ms, status });
    console.log(`  [${status}] ${hook.matcher}: ${ms.toFixed(1)}ms — ${hook.command}`);
  }

  console.log(`\nTotal chain latency: ${totalMs.toFixed(1)}ms`);
  console.log(`Budget: 100ms`);
  console.log(`Status: ${totalMs > 100 ? 'OVER BUDGET' : 'WITHIN BUDGET'}`);

  if (totalMs > 100) {
    console.log('\nSlow hooks:');
    for (const r of results.filter(r => r.status === 'SLOW')) {
      console.log(`  - ${r.matcher}: ${r.ms.toFixed(1)}ms`);
    }
  }
}

main();
