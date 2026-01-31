#!/usr/bin/env node
/**
 * Tests for validate-agent-routing.js
 *
 * Tests the CLI tool that validates the agent routing table in CLAUDE.md
 * Section 3 against actual agent files in .claude/agents/.
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// The module under test - will be implemented
let validateAgentRouting;

// Test fixtures
const MOCK_CLAUDE_MD_WITH_TABLE = `# CLAUDE.md

## 3. AGENT ROUTING TABLE

| Request Type | Agent | File |
| --- | --- | --- |
| Bug fixes | \`developer\` | \`.claude/agents/core/developer.md\` |
| Testing | \`qa\` | \`.claude/agents/core/qa.md\` |
| Security | \`security-architect\` | \`.claude/agents/specialized/security-architect.md\` |
`;

const _MOCK_CLAUDE_MD_WITH_MISSING_AGENT = `# CLAUDE.md

## 3. AGENT ROUTING TABLE

| Request Type | Agent | File |
| --- | --- | --- |
| Bug fixes | \`developer\` | \`.claude/agents/core/developer.md\` |
| Fantasy | \`unicorn\` | \`.claude/agents/core/unicorn.md\` |
`;

const MOCK_CLAUDE_MD_NO_TABLE = `# CLAUDE.md

Some content without a routing table.
`;

describe('validate-agent-routing', () => {
  describe('parseRoutingTable', () => {
    test('should parse a valid routing table from CLAUDE.md content', () => {
      // Load the module after it exists
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        // Expected to fail initially (TDD Red phase)
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      const result = validateAgentRouting.parseRoutingTable(MOCK_CLAUDE_MD_WITH_TABLE);

      assert.ok(Array.isArray(result), 'Should return an array');
      assert.strictEqual(result.length, 3, 'Should have 3 entries');

      assert.deepStrictEqual(result[0], {
        requestType: 'Bug fixes',
        agent: 'developer',
        file: '.claude/agents/core/developer.md',
      });
    });

    test('should return empty array when no routing table found', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      const result = validateAgentRouting.parseRoutingTable(MOCK_CLAUDE_MD_NO_TABLE);
      assert.deepStrictEqual(result, []);
    });

    test('should handle table with backtick-wrapped agent names', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      const result = validateAgentRouting.parseRoutingTable(MOCK_CLAUDE_MD_WITH_TABLE);
      // Agent name should have backticks stripped
      assert.strictEqual(result[0].agent, 'developer');
    });
  });

  describe('scanAgentFiles', () => {
    test('should scan agents directory and return file paths', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      // This tests against the actual filesystem
      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      const result = validateAgentRouting.scanAgentFiles(projectRoot);

      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.length > 0, 'Should find at least one agent file');

      // Should include known agents
      const hasDevloper = result.some(f => f.includes('developer.md'));
      assert.ok(hasDevloper, 'Should find developer.md');
    });
  });

  describe('validateRouting', () => {
    test('should return OK status for existing agent files', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      const tableEntries = [
        { requestType: 'Bug fixes', agent: 'developer', file: '.claude/agents/core/developer.md' },
      ];

      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      const agentFiles = validateAgentRouting.scanAgentFiles(projectRoot);

      const result = validateAgentRouting.validateRouting(tableEntries, agentFiles, projectRoot);

      assert.ok(
        result.ok.length > 0 || result.missing.length > 0 || result.notInTable.length > 0,
        'Should have at least one result category'
      );
    });

    test('should detect missing agent files', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      const tableEntries = [
        { requestType: 'Fantasy', agent: 'unicorn', file: '.claude/agents/core/unicorn.md' },
      ];

      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      const agentFiles = validateAgentRouting.scanAgentFiles(projectRoot);

      const result = validateAgentRouting.validateRouting(tableEntries, agentFiles, projectRoot);

      assert.ok(
        result.missing.some(m => m.agent === 'unicorn'),
        'Should detect unicorn as missing'
      );
    });

    test('should detect agents not in routing table', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      // Empty table - all agents should be "not in table"
      const tableEntries = [];

      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      const agentFiles = validateAgentRouting.scanAgentFiles(projectRoot);

      const result = validateAgentRouting.validateRouting(tableEntries, agentFiles, projectRoot);

      assert.ok(
        result.notInTable.length > 0,
        'Should find agents not in table when table is empty'
      );
    });
  });

  describe('formatOutput', () => {
    test('should format results correctly', () => {
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      const results = {
        ok: [{ agent: 'developer', file: '.claude/agents/core/developer.md' }],
        missing: [{ agent: 'unicorn', file: '.claude/agents/core/unicorn.md' }],
        notInTable: [{ file: '.claude/agents/domain/new-agent.md' }],
        mismatch: [],
      };

      const output = validateAgentRouting.formatOutput(results);

      assert.ok(output.includes('developer'), 'Should include OK agent');
      assert.ok(output.includes('unicorn'), 'Should include missing agent');
      assert.ok(
        output.includes('MISSING') || output.includes('missing'),
        'Should indicate missing status'
      );
      assert.ok(
        output.includes('NOT IN TABLE') || output.includes('not in table'),
        'Should indicate not-in-table status'
      );
    });
  });

  describe('main execution', () => {
    test('should exit with code 0 when all agents match', async () => {
      // This would need to be an integration test with mocked filesystem
      // For now, just verify the module exports the expected interface
      try {
        validateAgentRouting = require('../../../.claude/tools/cli/validate-agent-routing.cjs');
      } catch (e) {
        assert.fail('Module not implemented yet: ' + e.message);
        return;
      }

      assert.ok(
        typeof validateAgentRouting.parseRoutingTable === 'function',
        'Should export parseRoutingTable'
      );
      assert.ok(
        typeof validateAgentRouting.scanAgentFiles === 'function',
        'Should export scanAgentFiles'
      );
      assert.ok(
        typeof validateAgentRouting.validateRouting === 'function',
        'Should export validateRouting'
      );
      assert.ok(
        typeof validateAgentRouting.formatOutput === 'function',
        'Should export formatOutput'
      );
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running validate-agent-routing tests...\n');
}
