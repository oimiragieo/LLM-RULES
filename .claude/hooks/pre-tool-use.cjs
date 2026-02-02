/**
 * Pre-Tool-Use Hook Aggregator
 * ============================
 *
 * This hook serves as the main entry point for pre-tool-use events.
 * It orchestrates sub-hooks including:
 * 1. spawn-prompt-assembler (Memory Injection)
 * 2. security-pre-tool (Safety)
 * 3. router-enforcer (Protocol)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');

// Define hooks to run
const HOOKS = [
  path.join(__dirname, 'routing', 'spawn-prompt-assembler.cjs'),
  // Add other hooks here as needed
];

function main() {
  // Pass through stdin
  const input = fs.readFileSync(0, 'utf-8');

  for (const hook of HOOKS) {
    // Run hook synchronously
    const proc = spawnSync(process.execPath, [hook], {
      input,
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['pipe', 'inherit', 'inherit'], // pipe stdin, inherit stdout/stderr
    });

    if (proc.status !== 0) {
      console.error(`[PreToolUse] Hook failed: ${hook}`);
      process.exit(proc.status);
    }
  }
}

if (require.main === module) {
  main();
}
