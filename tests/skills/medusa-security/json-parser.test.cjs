'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Load fixture
const validJson = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'sample-json.json'), 'utf-8'));

// Module under test
const { parseMedusaJson, groupBySeverity, filterByCategory } = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'skills',
    'medusa-security',
    'scripts',
    'json-parser.cjs'
  )
);

describe('json-parser', () => {
  describe('parseMedusaJson', () => {
    test('S7: returns array of findings with correct length', () => {
      const result = parseMedusaJson(validJson);
      assert.ok(Array.isArray(result), 'result should be an array');
      assert.strictEqual(result.length, 3, 'should have 3 findings');

      // Each finding should have standard fields
      for (const finding of result) {
        assert.ok(finding.severity, 'finding should have severity');
        assert.ok(finding.ruleId, 'finding should have ruleId');
        assert.ok(finding.message, 'finding should have message');
        assert.ok(finding.file, 'finding should have file');
        assert.ok(typeof finding.line === 'number', 'finding should have numeric line');
      }
    });
  });

  describe('groupBySeverity', () => {
    test('S8: groups findings by severity level', () => {
      const findings = parseMedusaJson(validJson);
      const grouped = groupBySeverity(findings);

      assert.ok(Array.isArray(grouped.CRITICAL), 'should have CRITICAL array');
      assert.ok(Array.isArray(grouped.HIGH), 'should have HIGH array');
      assert.ok(Array.isArray(grouped.MEDIUM), 'should have MEDIUM array');
      assert.ok(Array.isArray(grouped.LOW), 'should have LOW array');

      assert.strictEqual(grouped.CRITICAL.length, 1, 'should have 1 CRITICAL finding');
      assert.strictEqual(grouped.HIGH.length, 1, 'should have 1 HIGH finding');
      assert.strictEqual(grouped.MEDIUM.length, 1, 'should have 1 MEDIUM finding');
      assert.strictEqual(grouped.LOW.length, 0, 'should have 0 LOW findings');
    });
  });

  describe('filterByCategory', () => {
    test('S9: filters findings by category', () => {
      const findings = parseMedusaJson(validJson);
      const aiFindings = filterByCategory(findings, 'ai_security');

      assert.ok(Array.isArray(aiFindings), 'result should be an array');
      assert.strictEqual(aiFindings.length, 2, 'should have 2 ai_security findings');
      assert.ok(
        aiFindings.every(f => f.category === 'ai_security'),
        'all findings should be ai_security category'
      );

      const secretFindings = filterByCategory(findings, 'secrets');
      assert.strictEqual(secretFindings.length, 1, 'should have 1 secrets finding');
    });
  });
});
