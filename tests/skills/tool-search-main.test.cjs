#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const toolSearch = require('../../.claude/skills/tool-search/scripts/main.cjs');

test('tool-search returns manifest-based ranked results', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-search-main-'));
  const claudeDir = path.join(tmp, '.claude');
  const configDir = path.join(claudeDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# temp\n', 'utf8');
  fs.writeFileSync(
    path.join(configDir, 'tool-manifest.json'),
    JSON.stringify(
      {
        tools: {
          core: [
            { name: 'Read', description: 'Read files' },
            { name: 'TaskUpdate', description: 'Update task status' },
          ],
          mcp: [
            {
              name: 'create_pull_request',
              server: 'github',
              description: 'Create GitHub pull request',
            },
          ],
        },
      },
      null,
      2
    ),
    'utf8'
  );

  const result = toolSearch.main({
    projectRoot: tmp,
    query: 'github pull request',
    limit: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.returned, 1);
  assert.equal(result.results[0].name, 'create_pull_request');
  assert.match(result.results[0].category, /mcp:github/);
});
