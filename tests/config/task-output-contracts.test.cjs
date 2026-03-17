const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('task-output-contracts', () => {
  const contractsPath = path.join(process.cwd(), '.claude/config/task-output-contracts.json');

  it('contracts file exists and is valid JSON', () => {
    assert.ok(fs.existsSync(contractsPath), 'task-output-contracts.json must exist');
    const content = fs.readFileSync(contractsPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(parsed.contracts, 'Must have contracts object');
    assert.ok(parsed.version, 'Must have version');
  });

  it('has contracts for all required task types', () => {
    const content = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
    const requiredTypes = [
      'implementation',
      'review',
      'planning',
      'research',
      'documentation',
      'testing',
      'security-review',
    ];
    for (const type of requiredTypes) {
      assert.ok(content.contracts[type], `Must have contract for ${type}`);
    }
  });

  it('each contract has required fields', () => {
    const content = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
    for (const [type, contract] of Object.entries(content.contracts)) {
      assert.ok(
        Array.isArray(contract.requiredMetadata),
        `${type} must have requiredMetadata array`
      );
      assert.ok(
        typeof contract.minSummaryLength === 'number',
        `${type} must have minSummaryLength number`
      );
      assert.ok(contract.requiredMetadata.includes('summary'), `${type} must require summary`);
    }
  });
});
