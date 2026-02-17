'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Module under test
const {
  formatFinding,
  mapToOwaspAgentic,
  mapToOwaspTop10,
  generateMarkdownReport,
  generateSummary,
  mapToRemediation,
} = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'skills',
    'medusa-security',
    'scripts',
    'finding-formatter.cjs'
  )
);

const SAMPLE_FINDINGS = [
  {
    ruleId: 'MEDUSA-PI-001',
    severity: 'CRITICAL',
    category: 'prompt_injection',
    message: 'Direct prompt injection: unsanitized user input concatenated into LLM prompt',
    file: 'src/llm/chat.js',
    line: 42,
    column: 5,
  },
  {
    ruleId: 'MEDUSA-MCP-101',
    severity: 'MEDIUM',
    category: 'mcp_security',
    message: 'MCP tool description contains hidden XML instructions',
    file: 'mcp-server/tools.json',
    line: 15,
    column: 1,
  },
  {
    ruleId: 'MEDUSA-SEC-001',
    severity: 'HIGH',
    category: 'secrets',
    message: 'Hardcoded API key: sk-proj-ABC123...',
    file: 'config/settings.js',
    line: 8,
    column: 15,
    cweId: 798,
  },
];

describe('finding-formatter', () => {
  describe('formatFinding', () => {
    test('S21: returns string with severity badge, location, description', () => {
      const result = formatFinding(SAMPLE_FINDINGS[0]);
      assert.ok(typeof result === 'string', 'should return a string');
      assert.ok(result.includes('CRITICAL'), 'should include severity');
      assert.ok(result.includes('src/llm/chat.js'), 'should include file path');
      assert.ok(result.includes('42'), 'should include line number');
      assert.ok(result.includes('prompt injection'), 'should include description context');
    });
  });

  describe('mapToOwaspAgentic', () => {
    test('S22: maps AI findings to OWASP Agentic AI categories', () => {
      const piMapping = mapToOwaspAgentic(SAMPLE_FINDINGS[0]);
      assert.ok(piMapping.id, 'should have OWASP id');
      assert.ok(piMapping.id.startsWith('ASI'), 'should start with ASI prefix');
      assert.ok(piMapping.name, 'should have OWASP name');

      const mcpMapping = mapToOwaspAgentic(SAMPLE_FINDINGS[1]);
      assert.ok(mcpMapping.id, 'should have OWASP id for MCP finding');
      assert.ok(mcpMapping.id.startsWith('ASI'), 'should start with ASI prefix');
    });
  });

  describe('mapToOwaspTop10', () => {
    test('S23: maps traditional findings to OWASP Top 10', () => {
      const secretMapping = mapToOwaspTop10(SAMPLE_FINDINGS[2]);
      assert.ok(secretMapping.id, 'should have OWASP id');
      assert.ok(secretMapping.id.startsWith('A'), 'should start with A prefix');
      assert.ok(secretMapping.name, 'should have OWASP name');

      // Secrets -> A02 Cryptographic Failures
      assert.strictEqual(secretMapping.id, 'A02');
    });
  });

  describe('generateMarkdownReport', () => {
    test('S24: returns valid markdown with tables and sections', () => {
      const report = generateMarkdownReport(SAMPLE_FINDINGS);
      assert.ok(typeof report === 'string', 'should return a string');
      assert.ok(report.includes('# '), 'should have markdown heading');
      assert.ok(report.includes('CRITICAL'), 'should include severity levels');
      assert.ok(report.includes('src/llm/chat.js'), 'should include file paths');
      assert.ok(report.includes('|'), 'should include table formatting');
    });
  });

  describe('generateSummary', () => {
    test('S25: returns summary with counts and score', () => {
      const summary = generateSummary(SAMPLE_FINDINGS);
      assert.strictEqual(summary.total, 3);
      assert.strictEqual(summary.critical, 1);
      assert.strictEqual(summary.high, 1);
      assert.strictEqual(summary.medium, 1);
      assert.strictEqual(summary.low, 0);
      assert.ok(typeof summary.securityScore === 'number', 'securityScore should be a number');
      assert.ok(
        summary.securityScore >= 0 && summary.securityScore <= 100,
        'score should be 0-100'
      );
    });
  });

  describe('mapToRemediation', () => {
    test('S26: maps finding to agent-studio skill/agent reference', () => {
      const remediation = mapToRemediation(SAMPLE_FINDINGS[0]);
      assert.ok(remediation.skill || remediation.agent, 'should reference a skill or agent');
      assert.ok(remediation.description, 'should have description');

      const secretRemediation = mapToRemediation(SAMPLE_FINDINGS[2]);
      assert.ok(
        secretRemediation.skill || secretRemediation.agent,
        'should reference a skill or agent for secrets'
      );
    });
  });
});
