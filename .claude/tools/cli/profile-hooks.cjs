#!/usr/bin/env node
/**
 * Hook Performance Profiler
 * =========================
 *
 * Profiles hook execution latency to identify performance bottlenecks.
 *
 * Usage:
 *   node .claude/tools/cli/profile-hooks.js [OPTIONS]
 *
 * Options:
 *   --iterations N   Number of iterations per hook (default: 50)
 *   --hooks PATTERN  Glob pattern to filter hooks (default: all)
 *   --output FILE    Output report file (default: stdout)
 *   --json           Output as JSON instead of markdown
 *   --warm           Include warmup iterations (default: true)
 *
 * Output:
 *   Reports P50, P90, P95, P99 latencies for each hook in milliseconds.
 *
 * Example:
 *   node .claude/tools/cli/profile-hooks.js --iterations 100 --output report.md
 *
 * @module profile-hooks
 */

'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOKS_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks');

/**
 * Key hooks to profile - these are the most frequently called hooks
 * based on settings.json configuration
 */
const KEY_HOOKS = [
  // PreToolUse(Task) - called on every Task spawn
  {
    name: 'pre-task-unified.cjs',
    path: 'routing/pre-task-unified.cjs',
    trigger: 'PreToolUse(Task)',
    input: {
      tool_name: 'Task',
      tool_input: {
        prompt: 'You are DEVELOPER...',
        description: 'Developer fixing bug',
      },
    },
  },
  // PreToolUse(Bash) - routing-guard for Bash
  {
    name: 'routing-guard.cjs (Bash)',
    path: 'routing/routing-guard.cjs',
    trigger: 'PreToolUse(Bash)',
    input: {
      tool_name: 'Bash',
      tool_input: {
        command: 'git status -s',
      },
    },
  },
  // PreToolUse(Edit) - routing-guard for Edit
  {
    name: 'routing-guard.cjs (Edit)',
    path: 'routing/routing-guard.cjs',
    trigger: 'PreToolUse(Edit)',
    input: {
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(
          PROJECT_ROOT,
          '.claude',
          'context',
          'runtime',
          'profile-hooks-test.js'
        ),
        old_string: 'foo',
        new_string: 'bar',
      },
    },
  },
  // PreToolUse(Edit) - file-placement-guard
  {
    name: 'file-placement-guard.cjs',
    path: 'safety/file-placement-guard.cjs',
    trigger: 'PreToolUse(Edit)',
    input: {
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(PROJECT_ROOT, '.claude', 'hooks', 'test.cjs'),
      },
    },
  },
  // PreToolUse(Bash) - bash-command-validator
  {
    name: 'bash-command-validator.cjs',
    path: 'safety/bash-command-validator.cjs',
    trigger: 'PreToolUse(Bash)',
    input: {
      tool_name: 'Bash',
      tool_input: {
        command: 'npm test',
      },
    },
  },
  // PostToolUse(Task) - post-task-unified
  {
    name: 'post-task-unified.cjs',
    path: 'routing/post-task-unified.cjs',
    trigger: 'PostToolUse(Task)',
    input: {
      tool_name: 'Task',
      tool_input: {
        prompt: 'You are DEVELOPER...',
      },
      tool_output: 'Task completed',
    },
  },
  // UserPromptSubmit - user-prompt-unified
  {
    name: 'user-prompt-unified.cjs',
    path: 'routing/user-prompt-unified.cjs',
    trigger: 'UserPromptSubmit',
    input: {
      prompt: 'Fix the bug in auth.js',
    },
  },
  // Self-healing hooks archived — anomaly-detector and loop-prevention
  // moved to _archive/ (C-6 audit fix). loop-state-manager.cjs remains active.
];

// =============================================================================
// PROFILING FUNCTIONS
// =============================================================================

/**
 * Execute a hook with input and measure execution time
 *
 * @param {string} hookPath - Path to hook file
 * @param {Object} input - Hook input JSON
 * @returns {Promise<{latencyMs: number, exitCode: number, stdout: string, stderr: string}>}
 */
async function executeHook(hookPath, input) {
  const fullPath = path.join(HOOKS_DIR, hookPath);

  return new Promise(resolve => {
    const startTime = process.hrtime.bigint();

    const child = spawn('node', [fullPath], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      env: {
        ...process.env,
        // Disable enforcement for profiling (we just want latency)
        ROUTER_WRITE_GUARD: 'off',
        PLANNER_FIRST_ENFORCEMENT: 'off',
        SECURITY_REVIEW_ENFORCEMENT: 'off',
        ROUTER_SELF_CHECK: 'off',
        ROUTER_BASH_GUARD: 'off',
        FILE_PLACEMENT_GUARD: 'off',
        TDD_CHECK_ENFORCEMENT: 'off',
        // Prevent actual blocking
        HOOK_FAIL_OPEN: 'true',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    // Write input to stdin
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    child.on('close', exitCode => {
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1_000_000; // Convert to ms

      resolve({
        latencyMs,
        exitCode: exitCode || 0,
        stdout,
        stderr,
      });
    });

    child.on('error', err => {
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1_000_000;

      resolve({
        latencyMs,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
      });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1_000_000;

      resolve({
        latencyMs,
        exitCode: -2,
        stdout,
        stderr: 'Timeout after 5000ms',
      });
    }, 5000);
  });
}

/**
 * Calculate percentiles from latency array
 *
 * @param {number[]} latencies - Array of latency values in ms
 * @returns {{ p50: number, p90: number, p95: number, p99: number, min: number, max: number, mean: number }}
 */
function calculatePercentiles(latencies) {
  if (latencies.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;

  const percentile = p => {
    const index = Math.ceil((p / 100) * n) - 1;
    return sorted[Math.max(0, Math.min(index, n - 1))];
  };

  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    min: sorted[0],
    max: sorted[n - 1],
    mean: sum / n,
  };
}

/**
 * Profile a single hook with multiple iterations
 *
 * @param {Object} hookConfig - Hook configuration
 * @param {number} iterations - Number of iterations
 * @param {boolean} warm - Include warmup iterations
 * @returns {Promise<Object>} Profiling results
 */
async function profileHook(hookConfig, iterations, warm = true) {
  const latencies = [];
  const warmupIterations = warm ? Math.min(5, iterations) : 0;

  // Warmup iterations (not counted)
  for (let i = 0; i < warmupIterations; i++) {
    await executeHook(hookConfig.path, hookConfig.input);
  }

  // Actual profiling iterations
  for (let i = 0; i < iterations; i++) {
    const result = await executeHook(hookConfig.path, hookConfig.input);
    if (result.exitCode !== -2) {
      // Exclude timeouts
      latencies.push(result.latencyMs);
    }
  }

  const stats = calculatePercentiles(latencies);

  return {
    name: hookConfig.name,
    path: hookConfig.path,
    trigger: hookConfig.trigger,
    iterations: latencies.length,
    ...stats,
  };
}

/**
 * Profile all key hooks
 *
 * @param {Object} options - Profiling options
 * @returns {Promise<Object[]>} Array of profiling results
 */
async function profileAllHooks(options = {}) {
  const { iterations = 50, warm = true, hooks: hookFilter } = options;
  const results = [];

  let hooksToProfile = KEY_HOOKS;

  // Filter hooks if pattern provided
  if (hookFilter) {
    hooksToProfile = KEY_HOOKS.filter(
      h => h.name.includes(hookFilter) || h.path.includes(hookFilter)
    );
  }

  console.error(`Profiling ${hooksToProfile.length} hooks with ${iterations} iterations each...`);
  console.error('');

  for (const hookConfig of hooksToProfile) {
    console.error(`  Profiling: ${hookConfig.name}...`);
    const result = await profileHook(hookConfig, iterations, warm);
    results.push(result);
  }

  return results;
}

// =============================================================================
// REPORTING FUNCTIONS
// =============================================================================

/**
 * Generate markdown report from profiling results
 *
 * @param {Object[]} results - Profiling results
 * @returns {string} Markdown report
 */
function generateMarkdownReport(results) {
  const timestamp = new Date().toISOString();

  let report = `# Hook Latency Profiling Report

**Generated**: ${timestamp}
**Iterations**: ${results[0]?.iterations || 'N/A'} per hook

## Summary

| Hook | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Mean (ms) |
|------|----------|----------|----------|----------|-----------|
`;

  // Sort by P95 descending (worst performers first)
  const sorted = [...results].sort((a, b) => b.p95 - a.p95);

  for (const r of sorted) {
    report += `| ${r.name} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.max.toFixed(2)} | ${r.mean.toFixed(2)} |\n`;
  }

  report += `
## Detailed Results

`;

  for (const r of sorted) {
    report += `### ${r.name}

- **File**: \`.claude/hooks/${r.path}\`
- **Trigger**: ${r.trigger}
- **Iterations**: ${r.iterations}

| Metric | Value (ms) |
|--------|------------|
| P50 | ${r.p50.toFixed(2)} |
| P90 | ${r.p90.toFixed(2)} |
| P95 | ${r.p95.toFixed(2)} |
| P99 | ${r.p99.toFixed(2)} |
| Min | ${r.min.toFixed(2)} |
| Max | ${r.max.toFixed(2)} |
| Mean | ${r.mean.toFixed(2)} |

`;
  }

  report += `## Analysis

### Performance Thresholds

- **Good**: P95 < 50ms
- **Acceptable**: P95 < 100ms
- **Needs Optimization**: P95 >= 100ms

### Hooks Needing Optimization

`;

  const needsOptimization = sorted.filter(r => r.p95 >= 100);
  if (needsOptimization.length === 0) {
    report += 'None - all hooks meet the P95 < 100ms threshold.\n';
  } else {
    for (const r of needsOptimization) {
      report += `- **${r.name}**: P95 = ${r.p95.toFixed(2)}ms\n`;
    }
  }

  report += `
### Recommendations

1. **State File Caching**: Hooks reading router-state.json should use state-cache.cjs
2. **Shared Utilities**: Use hook-input.cjs instead of duplicating parsing logic
3. **Consolidation**: Related hooks should be consolidated (see pre-task-unified.cjs pattern)
4. **Lazy Loading**: Avoid requiring modules that aren't needed for the current code path

`;

  return report;
}

/**
 * Generate JSON report from profiling results
 *
 * @param {Object[]} results - Profiling results
 * @returns {string} JSON report
 */
function generateJSONReport(results) {
  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      hooks: results,
      summary: {
        totalHooks: results.length,
        avgP95: results.reduce((a, r) => a + r.p95, 0) / results.length,
        maxP95: Math.max(...results.map(r => r.p95)),
        hooksOver100ms: results.filter(r => r.p95 >= 100).length,
      },
    },
    null,
    2
  );
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    iterations: 50,
    hooks: null,
    output: null,
    json: false,
    warm: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--iterations':
        options.iterations = parseInt(args[++i], 10) || 50;
        break;
      case '--hooks':
        options.hooks = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--json':
        options.json = true;
        break;
      case '--warm':
        options.warm = args[++i] !== 'false';
        break;
      case '--help':
        console.log(`
Hook Performance Profiler

Usage:
  node .claude/tools/cli/profile-hooks.js [OPTIONS]

Options:
  --iterations N   Number of iterations per hook (default: 50)
  --hooks PATTERN  Filter hooks by name/path pattern
  --output FILE    Output report to file (default: stdout)
  --json           Output as JSON instead of markdown
  --warm           Include warmup iterations (default: true)
  --help           Show this help message
`);
        process.exit(0);
    }
  }

  // Run profiling
  const results = await profileAllHooks(options);

  // Generate report
  const report = options.json ? generateJSONReport(results) : generateMarkdownReport(results);

  // Output report
  if (options.output) {
    const outputPath = path.isAbsolute(options.output)
      ? options.output
      : path.join(PROJECT_ROOT, options.output);

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, report);
    console.error(`Report written to: ${outputPath}`);
  } else {
    console.log(report);
  }
}

const wrappedMain = wrapCLITool(main, 'profile-hooks');

if (require.main === module) {
  wrappedMain();
}
