'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runQuickStatus } = require('../../../.claude/scripts/quick-status.cjs');

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

test('runQuickStatus reports ok with valid inputs', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-quick-status-'));
  const routingTablePath = path.join(tmpRoot, 'routing-table.cjs');
  fs.writeFileSync(routingTablePath, 'module.exports = {};');

  writeJson(path.join(tmpRoot, '.claude', 'config', 'capability-routing.json'), {
    capabilityMap: {},
    defaultAgents: {},
  });
  writeJson(path.join(tmpRoot, '.claude', 'config', 'routing-prototypes.json'), {
    prototypes: {},
    dimensions: 384,
  });

  const result = runQuickStatus({ projectRoot: tmpRoot, routingTablePath });
  assert.equal(result.ok, true);
  assert.equal(
    result.results.some(entry => entry.status.startsWith('INVALID')),
    false
  );
});

test('runQuickStatus fails on invalid required JSON', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-quick-status-'));
  const routingTablePath = path.join(tmpRoot, 'routing-table.cjs');
  fs.writeFileSync(routingTablePath, 'module.exports = {};');

  fs.mkdirSync(path.join(tmpRoot, '.claude', 'config'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, '.claude', 'config', 'capability-routing.json'), '{bad json');
  writeJson(path.join(tmpRoot, '.claude', 'config', 'routing-prototypes.json'), {
    prototypes: {},
    dimensions: 384,
  });

  const result = runQuickStatus({ projectRoot: tmpRoot, routingTablePath });
  assert.equal(result.ok, false);
});
