#!/usr/bin/env node
/**
 * Agent Schema Enhancements — Tests
 * ===================================
 *
 * Tests for the three new fields added to agent-definition.schema.json:
 *   (1) disallowedTools — array of strings, filter from prompt assembly
 *   (2) mcpServers     — array of strings (maxItems:20), scope MCP section
 *   (3) fork_eligible  — boolean, default false
 *
 * Fulfills: VAL-AE-001, VAL-AE-002, VAL-AE-003, VAL-AE-004, VAL-AE-005
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const DATA_MODULE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'spawn',
  'prompt-assembler-data.cjs'
);
const SCHEMA_VALIDATOR_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'utils',
  'schema-validator.cjs'
);
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'agent-definition.schema.json');

// Minimal valid agent content (>= 100 chars as required by schema)
const VALID_CONTENT =
  '# Test Agent\n\n' +
  'This is a test agent for schema validation. It verifies the new schema fields.\n\n' +
  'Additional content to meet the minimum length requirement of one hundred characters.';

// Base valid frontmatter (name and description are required)
const VALID_FRONTMATTER = {
  name: 'test-agent',
  description:
    'A test agent for validating new schema fields including mcpServers and fork_eligible.',
};

describe('agent-schema-enhancements', () => {
  let data;
  let validateData;

  before(() => {
    data = require(DATA_MODULE_PATH);
    validateData = require(SCHEMA_VALIDATOR_PATH).validateData;
    data.clearCaches();
  });

  // ============================================================
  // 1. disallowedTools filtering (VAL-AE-001)
  // ============================================================
  describe('disallowedTools filtering (VAL-AE-001)', () => {
    it('excludes disallowed tools from the described tools list', () => {
      const result = data.filterAndDescribeTools(['Bash', 'Write', 'Read'], {
        disallowedTools: ['Bash', 'Write'],
      });
      const names = result.map(t => t.name);
      assert.ok(!names.includes('Bash'), 'Bash should be excluded');
      assert.ok(!names.includes('Write'), 'Write should be excluded');
      assert.ok(names.includes('Read'), 'Read should be present');
    });

    it('includes all tools when disallowedTools is empty', () => {
      const result = data.filterAndDescribeTools(['Bash', 'Read'], {
        disallowedTools: [],
      });
      const names = result.map(t => t.name);
      assert.ok(names.includes('Bash'), 'Bash should be present');
      assert.ok(names.includes('Read'), 'Read should be present');
    });

    it('includes all tools when options are not provided', () => {
      const result = data.filterAndDescribeTools(['Bash', 'Read']);
      const names = result.map(t => t.name);
      assert.ok(names.includes('Bash'), 'Bash should be present');
      assert.ok(names.includes('Read'), 'Read should be present');
    });

    it('does not filter tools absent from allowedTools', () => {
      // Bash is in disallowedTools but NOT in allowedTools — no effect, no warning
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      let result;
      try {
        result = data.filterAndDescribeTools(['Read'], {
          disallowedTools: ['Bash'],
        });
      } finally {
        console.warn = originalWarn;
      }
      const names = result.map(t => t.name);
      assert.ok(names.includes('Read'), 'Read should be present');
      assert.strictEqual(warnings.length, 0, 'No warning when there is no conflict');
    });
  });

  // ============================================================
  // 2. disallowedTools conflict: warn and exclude (VAL-AE-002)
  // ============================================================
  describe('disallowedTools conflict resolution (VAL-AE-002)', () => {
    it('logs a warning when a tool is in both tools and disallowedTools', () => {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      try {
        data.filterAndDescribeTools(['Bash', 'Read'], {
          disallowedTools: ['Bash'],
        });
      } finally {
        console.warn = originalWarn;
      }
      assert.ok(warnings.length > 0, 'Should log at least one warning');
      assert.ok(warnings[0].includes('Bash'), 'Warning should name the conflicting tool');
      assert.ok(
        warnings[0].toLowerCase().includes('disallowedtools'),
        'Warning should mention disallowedTools'
      );
    });

    it('excludes the conflicting tool (disallowedTools wins)', () => {
      const result = data.filterAndDescribeTools(['Bash', 'Read', 'Write'], {
        disallowedTools: ['Bash'],
      });
      const names = result.map(t => t.name);
      assert.ok(!names.includes('Bash'), 'Bash excluded — disallowedTools wins');
      assert.ok(names.includes('Read'), 'Read should remain');
      assert.ok(names.includes('Write'), 'Write should remain');
    });

    it('logs one warning per conflicting tool', () => {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      try {
        data.filterAndDescribeTools(['Bash', 'Write', 'Read'], {
          disallowedTools: ['Bash', 'Write'],
        });
      } finally {
        console.warn = originalWarn;
      }
      assert.strictEqual(warnings.length, 2, 'One warning per conflicting tool');
    });

    it('excluded conflicting tools are absent from described result', () => {
      const result = data.filterAndDescribeTools(['Bash', 'Write', 'Read'], {
        disallowedTools: ['Bash', 'Write'],
      });
      const names = result.map(t => t.name);
      assert.strictEqual(names.length, 1, 'Only Read should remain');
      assert.ok(names.includes('Read'), 'Read should be present');
    });
  });

  // ============================================================
  // 3. mcpServers schema validation (VAL-AE-003)
  // ============================================================
  describe('mcpServers schema validation (VAL-AE-003)', () => {
    it('accepts valid mcpServers as array of strings', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, mcpServers: ['Exa', 'Ref'] },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'Array of strings should pass');
    });

    it('accepts an empty mcpServers array', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, mcpServers: [] },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'Empty array should pass');
    });

    it('accepts agent definition without mcpServers (optional field)', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'mcpServers is optional');
    });

    it('rejects mcpServers with non-string items', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, mcpServers: ['Exa', 123] },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      if (!result.skipped) {
        assert.strictEqual(result.valid, false, 'Non-string items should fail');
        assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'Should have errors');
      }
    });

    it('rejects mcpServers with more than 20 items', () => {
      const agentDef = {
        frontmatter: {
          ...VALID_FRONTMATTER,
          mcpServers: Array.from({ length: 21 }, (_, i) => `server-${i}`),
        },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      if (!result.skipped) {
        assert.strictEqual(result.valid, false, 'More than 20 items should fail');
      }
    });

    it('accepts exactly 20 mcpServers items (boundary)', () => {
      const agentDef = {
        frontmatter: {
          ...VALID_FRONTMATTER,
          mcpServers: Array.from({ length: 20 }, (_, i) => `server-${i}`),
        },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'Exactly 20 items is valid');
    });
  });

  // ============================================================
  // 4. mcpServers scoping in prompt (VAL-AE-004)
  // ============================================================
  describe('mcpServers scoping (VAL-AE-004)', () => {
    it('includes only MCP tools from scoped servers', () => {
      const result = data.filterAndDescribeTools(
        ['Read', 'mcp__Exa__web_search_exa', 'mcp__Ref__ref_search_documentation'],
        { mcpServers: ['Exa'] }
      );
      const names = result.map(t => t.name);
      assert.ok(names.includes('Read'), 'Core tool Read should be present');
      assert.ok(
        names.includes('mcp__Exa__web_search_exa'),
        'Exa MCP tool should be included (in scope)'
      );
      assert.ok(
        !names.includes('mcp__Ref__ref_search_documentation'),
        'Ref MCP tool should be excluded (not in mcpServers)'
      );
    });

    it('includes all MCP tools when mcpServers is not specified', () => {
      const result = data.filterAndDescribeTools([
        'Read',
        'mcp__Exa__web_search_exa',
        'mcp__Ref__ref_search_documentation',
      ]);
      const names = result.map(t => t.name);
      assert.ok(names.includes('mcp__Exa__web_search_exa'), 'Exa tool should be present');
      assert.ok(names.includes('mcp__Ref__ref_search_documentation'), 'Ref tool should be present');
    });

    it('excludes all MCP tools when mcpServers is an empty array', () => {
      const result = data.filterAndDescribeTools(
        ['Read', 'mcp__Exa__web_search_exa', 'mcp__Ref__ref_search_documentation'],
        { mcpServers: [] }
      );
      const names = result.map(t => t.name);
      assert.ok(names.includes('Read'), 'Core tool Read should be present');
      assert.ok(
        !names.includes('mcp__Exa__web_search_exa'),
        'Exa tool excluded (not in empty scope)'
      );
      assert.ok(
        !names.includes('mcp__Ref__ref_search_documentation'),
        'Ref tool excluded (not in empty scope)'
      );
    });

    it('includes tools from multiple scoped servers', () => {
      const result = data.filterAndDescribeTools(
        ['Read', 'mcp__Exa__web_search_exa', 'mcp__Ref__ref_search_documentation'],
        { mcpServers: ['Exa', 'Ref'] }
      );
      const names = result.map(t => t.name);
      assert.ok(names.includes('mcp__Exa__web_search_exa'), 'Exa tool should be present');
      assert.ok(names.includes('mcp__Ref__ref_search_documentation'), 'Ref tool should be present');
    });

    it('does not affect core (non-MCP) tools regardless of mcpServers', () => {
      const result = data.filterAndDescribeTools(['Read', 'Write', 'Bash'], {
        mcpServers: ['Exa'],
      });
      const names = result.map(t => t.name);
      assert.ok(names.includes('Read'), 'Read should be present');
      assert.ok(names.includes('Write'), 'Write should be present');
      assert.ok(names.includes('Bash'), 'Bash should be present');
    });
  });

  // ============================================================
  // 5. fork_eligible validation (VAL-AE-005)
  // ============================================================
  describe('fork_eligible schema validation (VAL-AE-005)', () => {
    it('accepts fork_eligible: true', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, fork_eligible: true },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'fork_eligible: true should pass');
    });

    it('accepts fork_eligible: false', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, fork_eligible: false },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'fork_eligible: false should pass');
    });

    it('accepts omitted fork_eligible (defaults to false per schema)', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.strictEqual(result.valid, true, 'Omitted fork_eligible should pass');
    });

    it('rejects fork_eligible: "yes" (non-boolean string)', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, fork_eligible: 'yes' },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      if (!result.skipped) {
        assert.strictEqual(result.valid, false, 'String "yes" should fail');
        assert.ok(
          result.errors.some(e => e.path.includes('fork_eligible')),
          'Error should reference fork_eligible field'
        );
      }
    });

    it('rejects fork_eligible: 1 (number instead of boolean)', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, fork_eligible: 1 },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      if (!result.skipped) {
        assert.strictEqual(result.valid, false, 'Number 1 should fail');
      }
    });

    it('rejects fork_eligible: null', () => {
      const agentDef = {
        frontmatter: { ...VALID_FRONTMATTER, fork_eligible: null },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      if (!result.skipped) {
        assert.strictEqual(result.valid, false, 'null should fail');
      }
    });
  });

  // ============================================================
  // 6. Round-trip: create agent → validate → assemble → verify
  // ============================================================
  describe('round-trip: all new fields without data loss', () => {
    it('validates an agent definition with all three new fields', () => {
      const agentDef = {
        frontmatter: {
          ...VALID_FRONTMATTER,
          tools: ['Read', 'Write', 'Bash'],
          disallowedTools: ['Bash'],
          mcpServers: ['Exa', 'Ref'],
          fork_eligible: true,
        },
        content: VALID_CONTENT,
      };
      const result = validateData(agentDef, SCHEMA_PATH);
      assert.ok(
        result.valid || result.skipped,
        `Agent with all new fields should validate (valid=${result.valid}, skipped=${result.skipped})`
      );
    });

    it('assembles tools excluding disallowedTools', () => {
      const tools = ['Read', 'Write', 'Bash'];
      const disallowedTools = ['Bash'];
      const result = data.filterAndDescribeTools(tools, { disallowedTools });
      const names = result.map(t => t.name);
      assert.ok(!names.includes('Bash'), 'Bash excluded by disallowedTools');
      assert.ok(names.includes('Read'), 'Read should be present');
      assert.ok(names.includes('Write'), 'Write should be present');
    });

    it('assembles tools with MCP server scoping', () => {
      const tools = ['Read', 'mcp__Exa__web_search_exa', 'mcp__Ref__ref_search_documentation'];
      const mcpServers = ['Exa'];
      const result = data.filterAndDescribeTools(tools, { mcpServers });
      const names = result.map(t => t.name);
      assert.ok(names.includes('Read'), 'Core tool preserved');
      assert.ok(names.includes('mcp__Exa__web_search_exa'), 'In-scope MCP tool present');
      assert.ok(
        !names.includes('mcp__Ref__ref_search_documentation'),
        'Out-of-scope MCP tool excluded'
      );
    });

    it('all new fields round-trip without mutation', () => {
      const originalDisallowedTools = ['Write'];
      const originalMcpServers = ['Exa'];
      const frontmatter = {
        ...VALID_FRONTMATTER,
        tools: ['Read', 'Write'],
        disallowedTools: originalDisallowedTools,
        mcpServers: originalMcpServers,
        fork_eligible: true,
      };
      const agentDef = { frontmatter, content: VALID_CONTENT };

      // Validate
      const validationResult = validateData(agentDef, SCHEMA_PATH);
      assert.ok(
        validationResult.valid || validationResult.skipped,
        'Agent should validate (or skip if Ajv unavailable)'
      );

      // Fields preserved before assembly
      assert.deepStrictEqual(agentDef.frontmatter.disallowedTools, ['Write']);
      assert.deepStrictEqual(agentDef.frontmatter.mcpServers, ['Exa']);
      assert.strictEqual(agentDef.frontmatter.fork_eligible, true);

      // Assemble: filter tools using the agent's new fields
      const described = data.filterAndDescribeTools(agentDef.frontmatter.tools, {
        disallowedTools: agentDef.frontmatter.disallowedTools,
        mcpServers: agentDef.frontmatter.mcpServers,
      });

      const names = described.map(t => t.name);
      assert.ok(names.includes('Read'), 'Read should be present after assembly');
      assert.ok(!names.includes('Write'), 'Write excluded by disallowedTools');

      // Fields not mutated after assembly
      assert.deepStrictEqual(agentDef.frontmatter.disallowedTools, ['Write']);
      assert.deepStrictEqual(agentDef.frontmatter.mcpServers, ['Exa']);
      assert.strictEqual(agentDef.frontmatter.fork_eligible, true);
    });
  });
});
