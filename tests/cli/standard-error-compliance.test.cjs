'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOL_SAMPLES = [
  {
    name: 'cleanup-transient-artifacts',
    file: '.claude/tools/cli/cleanup-transient-artifacts.cjs',
  },
  { name: 'open-findings-summary', file: '.claude/tools/cli/open-findings-summary.cjs' },
  { name: 'runtime-health-snapshot', file: '.claude/tools/cli/runtime-health-snapshot.cjs' },
  { name: 'trace-query', file: '.claude/tools/cli/trace-query.cjs' },
  { name: 'generate-tool-manifest', file: '.claude/tools/cli/generate-tool-manifest.cjs' },
  { name: 'hybrid-search', file: '.claude/tools/cli/hybrid-search.cjs' },
];

describe('CLI standard error compliance', () => {
  test('sampled tools emit standardized wrapper errors', () => {
    for (const tool of TOOL_SAMPLES) {
      const toolPath = path.join(process.cwd(), tool.file);
      const result = spawnSync(process.execPath, [toolPath], {
        env: {
          ...process.env,
          TRIGGER_WRAPPER_ERROR: 'true',
        },
        encoding: 'utf8',
      });

      const output = `${result.stdout || ''}${result.stderr || ''}`;
      assert.equal(result.status, 1, `${tool.name} should exit with code 1`);
      assert.match(
        output,
        new RegExp(`❌ Error \\[${tool.name}\\]:`),
        `${tool.name} should use standardized wrapper error format`
      );
    }
  });
});
