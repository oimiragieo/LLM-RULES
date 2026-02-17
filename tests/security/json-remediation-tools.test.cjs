'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TARGET_TOOLS = [
  '.claude/tools/cli/doctor.mjs',
  '.claude/tools/chrome-browser/chrome-browser.cjs',
  '.claude/tools/analysis/project-analyzer/analyzer.mjs',
  '.claude/tools/analysis/ecosystem-assessor/assess-ecosystem.mjs',
  '.claude/tools/analysis/ecosystem-assessor/hook-assessor.mjs',
  '.claude/tools/analysis/ecosystem-assessor/mcp-discoverer.mjs',
  '.claude/tools/visualization/diagram-generator/scripts/generate.mjs',
  '.claude/tools/run-agent-framework-integration-headless.mjs',
  '.claude/tools/analysis/repo-rag/scripts/search-formatters.mjs',
  '.claude/tools/validate-latest-integration-artifacts.mjs',
];

test('Tool files must use safeParseJSON or have justification for raw JSON.parse', () => {
  for (const relativePath of TARGET_TOOLS) {
    const filePath = path.join(process.cwd(), relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    
    // For doctor.mjs, we expect it to import safeParseJSON or use a safe wrapper
    // Since it's a doctor/validation tool, some raw parsing might be okay for internal config,
    // but safeParseJSON is preferred for user-provided or external data.
    
    // Initial check: just flag if they use raw JSON.parse
    const usesRawParse = /\bJSON\.parse\s*\(/.test(source);
    assert.strictEqual(usesRawParse, false, `${relativePath} should use safeParseJSON from .claude/lib/utils/safe-json.cjs`);
  }
});
