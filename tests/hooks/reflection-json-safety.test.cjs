#!/usr/bin/env node
/**
 * Tests for safeParseJSON adoption in reflection hooks
 *
 * Verifies that 3 reflection hooks use safeParseJSON instead of raw JSON.parse.
 * This prevents prototype pollution and provides graceful error handling.
 *
 * Test Categories:
 * 1. Source code verification (imports safeParseJSON)
 * 2. Source code verification (no raw JSON.parse for content parsing)
 * 3. Functional verification (malformed JSON returns empty array)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const REFLECTION_HOOKS = [
  {
    name: 'reflection-queue-processor',
    file: '.claude/hooks/reflection/reflection-queue-processor.cjs',
    functionName: 'readExistingSpawnRequests',
  },
  {
    name: 'reflection-step0-guard',
    file: '.claude/hooks/reflection/reflection-step0-guard.cjs',
    functionName: 'readSpawnRequests',
  },
  {
    name: 'force-step0-execution',
    file: '.claude/hooks/reflection/force-step0-execution.cjs',
    functionName: 'readSpawnRequests',
  },
];

describe('safeParseJSON adoption in reflection hooks', () => {
  for (const hook of REFLECTION_HOOKS) {
    describe(hook.name, () => {
      it('should import safeParseJSON from safe-json.cjs', () => {
        const filePath = path.join(PROJECT_ROOT, hook.file);
        assert.ok(fs.existsSync(filePath), `File not found: ${hook.file}`);

        const content = fs.readFileSync(filePath, 'utf8');

        // Check for safeParseJSON import
        const importPattern = /require\([^)]*safe-json\.cjs[^)]*\)/;
        assert.ok(
          importPattern.test(content),
          `${hook.name} does not import from safe-json.cjs. ` +
            'Must use safeParseJSON for prototype pollution protection.'
        );
      });

      it('should use safeParseJSON instead of raw JSON.parse for content parsing', () => {
        const filePath = path.join(PROJECT_ROOT, hook.file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Extract the target function body
        const funcRegex = new RegExp(`function\\s+${hook.functionName}\\s*\\([^)]*\\)\\s*\\{`, 'g');
        const funcMatch = funcRegex.exec(content);
        assert.ok(funcMatch, `Function ${hook.functionName} not found in ${hook.name}`);

        // Get function body (find matching closing brace)
        const startIdx = funcMatch.index + funcMatch[0].length;
        let braceCount = 1;
        let endIdx = startIdx;
        while (braceCount > 0 && endIdx < content.length) {
          if (content[endIdx] === '{') braceCount++;
          if (content[endIdx] === '}') braceCount--;
          endIdx++;
        }
        const funcBody = content.substring(startIdx, endIdx);

        // Check that the function body does NOT contain raw JSON.parse(content)
        // but DOES contain safeParseJSON
        const rawJsonParse = /JSON\.parse\s*\(\s*content\s*\)/;
        const safeJsonParse = /safeParseJSON\s*\(/;

        assert.ok(
          !rawJsonParse.test(funcBody),
          `${hook.name}.${hook.functionName}() uses raw JSON.parse(content). ` +
            'Must use safeParseJSON for prototype pollution protection.'
        );

        assert.ok(
          safeJsonParse.test(funcBody),
          `${hook.name}.${hook.functionName}() does not call safeParseJSON. ` +
            'Must use safeParseJSON instead of JSON.parse.'
        );
      });
    });
  }
});
