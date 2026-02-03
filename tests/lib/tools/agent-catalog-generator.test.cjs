'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('generate-agent-catalog CLI', () => {
  it('creates agent-catalog.json from registry', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-catalog-'));
    const registryPath = path.join(tmpDir, 'agent-registry.json');
    const outputPath = path.join(tmpDir, 'agent-catalog.json');

    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          agents: {
            developer: {
              id: 'developer',
              displayName: 'Developer Agent',
              capabilities: [
                {
                  name: 'implementation',
                  description: 'Build features',
                  tags: ['implement'],
                  examples: ['Implement login'],
                },
              ],
              metadata: { version: '1.2.3' },
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [
        '.claude/tools/cli/generate-agent-catalog.cjs',
        '--registry',
        registryPath,
        '--output',
        outputPath,
      ],
      {
        cwd: path.resolve(__dirname, '..', '..', '..'),
        encoding: 'utf8',
      }
    );

    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.existsSync(outputPath), 'agent-catalog.json should exist');

    const catalog = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.strictEqual(catalog.version, '1.0');
    assert.ok(Array.isArray(catalog.agents));
    assert.strictEqual(catalog.agents[0].id, 'developer');
    assert.strictEqual(catalog.agents[0].skills[0].id, 'implementation');
  });
});
