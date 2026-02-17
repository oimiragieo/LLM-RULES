'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Load fixtures
const validSarif = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'sample-sarif.json'), 'utf-8')
);
const emptySarif = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'empty-sarif.json'), 'utf-8')
);
const malformedSarif = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'malformed-sarif.json'), 'utf-8')
);

// Module under test
const { parseSarif, mapSarifLevel, categorizeRuleId } = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'skills',
    'medusa-security',
    'scripts',
    'sarif-parser.cjs'
  )
);

describe('sarif-parser', () => {
  describe('parseSarif', () => {
    test('S1: returns array of findings with correct length from valid SARIF', () => {
      const result = parseSarif(validSarif);
      assert.ok(Array.isArray(result), 'result should be an array');
      assert.strictEqual(result.length, 3, 'should have 3 findings');
    });

    test('S2: maps SARIF level to severity correctly', () => {
      const result = parseSarif(validSarif);

      // error -> CRITICAL or HIGH (for medusa, error with PI/SEC rules = CRITICAL for PI, HIGH for others)
      // The first finding (MEDUSA-PI-001) level=error
      // The second finding (MEDUSA-MCP-101) level=warning
      // The third finding (MEDUSA-SEC-001) level=error
      const severities = result.map(f => f.severity);
      assert.ok(
        severities.every(s => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(s)),
        `all severities should be valid enums, got: ${severities}`
      );

      // error maps to CRITICAL or HIGH, warning maps to MEDIUM
      assert.strictEqual(result[1].severity, 'MEDIUM', 'warning level should map to MEDIUM');
      assert.ok(
        ['CRITICAL', 'HIGH'].includes(result[0].severity),
        'error level should map to CRITICAL or HIGH'
      );
      assert.ok(
        ['CRITICAL', 'HIGH'].includes(result[2].severity),
        'error level should map to CRITICAL or HIGH'
      );
    });

    test('S3: extracts file, line, column from SARIF locations', () => {
      const result = parseSarif(validSarif);

      assert.strictEqual(result[0].file, 'src/llm/chat.js');
      assert.strictEqual(result[0].line, 42);
      assert.strictEqual(result[0].column, 5);

      assert.strictEqual(result[1].file, 'mcp-server/tools.json');
      assert.strictEqual(result[1].line, 15);
      assert.strictEqual(result[1].column, 1);

      assert.strictEqual(result[2].file, 'config/settings.js');
      assert.strictEqual(result[2].line, 8);
      assert.strictEqual(result[2].column, 15);
    });

    test('S4: maps ruleId to human-readable category', () => {
      const result = parseSarif(validSarif);

      assert.strictEqual(result[0].category, 'prompt_injection');
      assert.strictEqual(result[1].category, 'mcp_security');
      assert.strictEqual(result[2].category, 'secrets');
    });

    test('S5: returns empty array for SARIF with zero results', () => {
      const result = parseSarif(emptySarif);
      assert.ok(Array.isArray(result), 'result should be an array');
      assert.strictEqual(result.length, 0, 'should have 0 findings');
    });

    test('S6: returns error object for malformed SARIF (no crash)', () => {
      const result = parseSarif(malformedSarif);
      assert.ok(result.error, 'should have an error property');
      assert.ok(Array.isArray(result.findings), 'should have a findings array');
      assert.strictEqual(result.findings.length, 0, 'findings should be empty');
    });
  });

  describe('mapSarifLevel', () => {
    test('maps error to CRITICAL or HIGH', () => {
      const result = mapSarifLevel('error');
      assert.ok(['CRITICAL', 'HIGH'].includes(result), `expected CRITICAL or HIGH, got ${result}`);
    });

    test('maps warning to MEDIUM', () => {
      assert.strictEqual(mapSarifLevel('warning'), 'MEDIUM');
    });

    test('maps note to LOW', () => {
      assert.strictEqual(mapSarifLevel('note'), 'LOW');
    });

    test('maps unknown level to MEDIUM as fallback', () => {
      assert.strictEqual(mapSarifLevel('unknown'), 'MEDIUM');
    });
  });

  describe('categorizeRuleId', () => {
    test('maps PI rules to prompt_injection', () => {
      assert.strictEqual(categorizeRuleId('MEDUSA-PI-001'), 'prompt_injection');
    });

    test('maps MCP rules to mcp_security', () => {
      assert.strictEqual(categorizeRuleId('MEDUSA-MCP-101'), 'mcp_security');
    });

    test('maps SEC rules to secrets', () => {
      assert.strictEqual(categorizeRuleId('MEDUSA-SEC-001'), 'secrets');
    });

    test('maps unknown rules to general', () => {
      assert.strictEqual(categorizeRuleId('MEDUSA-XYZ-001'), 'general');
    });
  });
});
