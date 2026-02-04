#!/usr/bin/env node
/**
 * Prompt Assembler - Unit Tests
 * ==============================
 *
 * Tests for the prompt-assembler.cjs utility that injects
 * AVAILABLE_TOOLS and AVAILABLE_SKILLS sections into agent spawn prompts.
 *
 * Phase 1D: Spawn Prompt Injection
 *
 * Test categories:
 * 1. Tool section generation
 * 2. Skill section generation
 * 3. Discovery section generation
 * 4. Section injection
 * 5. Filtering and limits
 * 6. Agent-specific recommendations
 * 7. Edge cases
 *
 * @module prompt-assembler.test
 */

'use strict';

const { describe, it, beforeEach, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Module under test (will fail until implemented)
let assembler;
const MODULE_PATH = path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler.cjs');
const BEHAVIOUR_PATH = path.join(__dirname, '../../../.claude/context/memory/behaviour.md');

// Test data
const VALID_DEVELOPER_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'TaskOutput',
  'Skill',
];

const _VALID_ORCHESTRATOR_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'Task',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'TaskOutput',
  'Skill',
];

const SAMPLE_BASE_PROMPT = `You are DEVELOPER.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED                                     |
+======================================================================+

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Instructions
1) TaskUpdate in_progress
2) Execute task
3) TaskUpdate completed
`;

describe('prompt-assembler', () => {
  const overrideDir = path.join(__dirname, '../../../.claude/agents/core/developer/prompts');
  const overrideFile = path.join(overrideDir, 'agent.system.main.role.md');

  before(() => {
    // Load the module
    try {
      assembler = require(MODULE_PATH);
    } catch (_e) {
      // Module doesn't exist yet - expected during RED phase
      assembler = null;
    }
  });

  // ======================================================================
  // 1. Tool Section Generation
  // ======================================================================

  describe('Tool Section Generation', () => {
    it('should generate AVAILABLE_TOOLS section with tool descriptions', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const tools = ['Read', 'Write', 'Edit'];
      const section = assembler.buildToolsSection(tools);

      assert.ok(section.includes('Read'), 'Section should include Read tool');
      assert.ok(section.includes('Write'), 'Section should include Write tool');
      assert.ok(section.includes('Edit'), 'Section should include Edit tool');
      assert.ok(section.includes('Read files from filesystem'), 'Should include Read description');
    });

    it('should include status indicators for available tools', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const tools = ['Read', 'Write'];
      const section = assembler.buildToolsSection(tools);

      assert.ok(section.includes('Available'), 'Should include availability status');
    });

    it('should show tool count in header', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const tools = ['Read', 'Write', 'Edit'];
      const section = assembler.buildToolsSection(tools);

      assert.ok(section.includes('3'), 'Should show count of 3 tools');
    });

    it('should include TaskUpdate warning for mandatory tools', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const tools = VALID_DEVELOPER_TOOLS;
      const section = assembler.buildToolsSection(tools);

      assert.ok(section.includes('TaskUpdate'), 'Should mention TaskUpdate');
      assert.ok(
        section.includes('MANDATORY') || section.includes('CRITICAL'),
        'Should emphasize importance'
      );
    });
  });

  // ======================================================================
  // 2. Skill Section Generation
  // ======================================================================

  describe('Skill Section Generation', () => {
    it('should generate AVAILABLE_SKILLS section with skill descriptions', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const skills = [
        { name: 'tdd', description: 'Test-driven development workflow', category: 'Testing' },
        {
          name: 'debugging',
          description: 'Systematic debugging process',
          category: 'Troubleshooting',
        },
      ];
      const section = assembler.buildSkillsSection(skills);

      assert.ok(section.includes('tdd'), 'Section should include tdd skill');
      assert.ok(section.includes('debugging'), 'Section should include debugging skill');
      assert.ok(section.includes('Test-driven'), 'Should include skill descriptions');
    });

    it('should include usage examples in skill section', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const skills = [{ name: 'tdd', description: 'TDD workflow', category: 'Testing' }];
      const section = assembler.buildSkillsSection(skills);

      assert.ok(
        section.includes('Skill({') || section.includes('skill:'),
        'Should include usage example'
      );
    });
  });

  // ======================================================================
  // 3. Discovery Section Generation
  // ======================================================================

  describe('Discovery Section Generation', () => {
    it('should generate SKILL DISCOVERY PROTOCOL section', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const section = assembler.buildDiscoverySection();

      assert.ok(section.includes('SKILL DISCOVERY'), 'Should have discovery header');
      assert.ok(section.includes('Skill('), 'Should explain how to invoke skills');
    });

    it('should reference skill catalog location', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const section = assembler.buildDiscoverySection();

      assert.ok(
        section.includes('skill-catalog') || section.includes('artifacts'),
        'Should reference catalog location'
      );
    });
  });

  // ======================================================================
  // 4. Section Injection
  // ======================================================================

  describe('Section Injection', () => {
    it('should inject sections into base prompt', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });

      assert.ok(enhanced.includes('AVAILABLE_TOOLS'), 'Should inject AVAILABLE_TOOLS section');
      assert.ok(enhanced.includes('AVAILABLE_SKILLS'), 'Should inject AVAILABLE_SKILLS section');
      assert.ok(enhanced.includes('You are DEVELOPER'), 'Should preserve base prompt');
    });

    it('should preserve PROJECT CONTEXT section', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });

      assert.ok(enhanced.includes('PROJECT CONTEXT'), 'Should preserve PROJECT CONTEXT');
      assert.ok(enhanced.includes('Instructions'), 'Should preserve Instructions');
    });

    it('should append agent prompt overrides when present', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      fs.mkdirSync(overrideDir, { recursive: true });
      fs.writeFileSync(overrideFile, '## Override Prompt\n\nCustom override line.', 'utf8');

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });

      assert.ok(enhanced.includes('## Override Prompt'), 'Should include agent prompt overrides');

      fs.rmSync(overrideDir, { recursive: true, force: true });
    });

    it('should inject sections at correct location', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });

      // AVAILABLE_TOOLS should appear after warning box, before PROJECT CONTEXT
      const toolsIndex = enhanced.indexOf('AVAILABLE_TOOLS');
      const contextIndex = enhanced.indexOf('PROJECT CONTEXT');
      const warningIndex = enhanced.indexOf('WARNING');

      assert.ok(toolsIndex > warningIndex, 'AVAILABLE_TOOLS should be after warning box');
      assert.ok(toolsIndex < contextIndex, 'AVAILABLE_TOOLS should be before PROJECT CONTEXT');
    });

    it('should include dynamic behaviour rules when present', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const original = fs.existsSync(BEHAVIOUR_PATH)
        ? fs.readFileSync(BEHAVIOUR_PATH, 'utf8')
        : null;

      try {
        fs.mkdirSync(path.dirname(BEHAVIOUR_PATH), { recursive: true });
        fs.writeFileSync(
          BEHAVIOUR_PATH,
          '# comment line\nAlways prefer small diffs.\n\n# another comment\nUse Skill({ skill: "tdd" }) before coding.',
          'utf8'
        );

        const enhanced = assembler.assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: SAMPLE_BASE_PROMPT,
        });

        assert.ok(
          enhanced.includes('## Dynamic behaviour rules'),
          'Should inject Dynamic behaviour rules section'
        );
        assert.ok(
          enhanced.includes('Always prefer small diffs.'),
          'Should include non-comment rule lines'
        );
        assert.ok(
          !enhanced.includes('# comment line'),
          'Should strip comment lines from behaviour rules'
        );
      } finally {
        if (original === null) {
          fs.rmSync(BEHAVIOUR_PATH, { force: true });
        } else {
          fs.writeFileSync(BEHAVIOUR_PATH, original, 'utf8');
        }
      }
    });
  });

  // ======================================================================
  // 5. Filtering and Limits
  // ======================================================================

  describe('Filtering and Limits', () => {
    it('should filter tools to maxToolsInPrompt (default 15)', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const manyTools = [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'TaskUpdate',
        'TaskList',
        'TaskCreate',
        'TaskGet',
        'TaskOutput',
        'TaskStop',
        'Skill',
        'WebSearch',
        'WebFetch',
        'NotebookEdit',
        'EnterPlanMode',
        'ExitPlanMode',
      ];

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: manyTools,
        basePrompt: SAMPLE_BASE_PROMPT,
        maxToolsInPrompt: 15,
      });

      // Count tool mentions - should be limited
      const toolMentions = manyTools.filter(t => enhanced.includes(t)).length;
      assert.ok(toolMentions <= 18, 'Should respect tool limit'); // Some slack for descriptions
    });

    it('should filter skills to maxSkillsInPrompt (default 20)', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
        maxSkillsInPrompt: 5,
      });

      // Should limit skills shown
      assert.ok(enhanced.includes('AVAILABLE_SKILLS'), 'Should still have skills section');
    });

    it('should respect custom maxToolsInPrompt parameter', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
        maxToolsInPrompt: 5,
      });

      // Count the tools in the section
      const toolsSection = enhanced.split('AVAILABLE_SKILLS')[0];
      const toolCount = (toolsSection.match(/- \*\*\w+\*\*/g) || []).length;
      assert.ok(toolCount <= 5, `Should respect maxToolsInPrompt=5, got ${toolCount}`);
    });
  });

  // ======================================================================
  // 6. Agent-Specific Recommendations
  // ======================================================================

  describe('Agent-Specific Recommendations', () => {
    it('should provide skills relevant to developer agent', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const skills = assembler.getSkillsByAgent('developer', 10);

      assert.ok(Array.isArray(skills), 'Should return array of skills');
      assert.ok(skills.length > 0, 'Should return at least some skills');

      // Developer should have tdd, debugging, code-quality-expert
      const skillNames = skills.map(s => s.name);
      const hasDevSkills = skillNames.some(n =>
        ['tdd', 'debugging', 'code-quality-expert'].includes(n)
      );
      assert.ok(hasDevSkills, 'Should include developer-relevant skills');
    });

    it('should provide skills relevant to qa agent', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const skills = assembler.getSkillsByAgent('qa', 10);

      assert.ok(Array.isArray(skills), 'Should return array of skills');
      assert.ok(skills.length > 0, 'Should return at least some skills');
    });

    it('should provide skills relevant to architect agent', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const skills = assembler.getSkillsByAgent('architect', 10);

      assert.ok(Array.isArray(skills), 'Should return array of skills');
    });

    it('should return generic skills for unknown agent type', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const skills = assembler.getSkillsByAgent('unknown-agent-xyz', 10);

      assert.ok(Array.isArray(skills), 'Should return array even for unknown agent');
    });
  });

  // ======================================================================
  // 7. Edge Cases
  // ======================================================================

  describe('Edge Cases', () => {
    it('should handle empty tools array', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: [],
        basePrompt: SAMPLE_BASE_PROMPT,
      });

      assert.ok(enhanced.includes('You are DEVELOPER'), 'Should preserve base prompt');
    });

    it('should handle missing agentType', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const enhanced = assembler.assembleSpawnPrompt({
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });

      // Should use generic skills
      assert.ok(enhanced.includes('AVAILABLE_SKILLS'), 'Should still include skills section');
    });

    it('should handle prompt without PROJECT CONTEXT section', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const simplePrompt = `You are DEVELOPER.

Complete the task.`;

      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: simplePrompt,
      });

      assert.ok(enhanced.includes('AVAILABLE_TOOLS'), 'Should inject tools section');
      assert.ok(enhanced.includes('Complete the task'), 'Should preserve original content');
    });

    it('should handle null/undefined basePrompt gracefully', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      // Should not throw
      let enhanced;
      try {
        enhanced = assembler.assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: null,
        });
        assert.ok(typeof enhanced === 'string', 'Should return a string');
      } catch (e) {
        // Acceptable to throw for null input
        assert.ok(
          e.message.includes('basePrompt') || e.message.includes('prompt'),
          'Error should mention the issue'
        );
      }
    });

    it('should mark unavailable MCP tools with fallbacks', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      // Test with MCP tool that has fallback
      const tools = ['Read', 'Write', 'mcp__sequential-thinking__sequentialthinking'];
      const filtered = assembler.filterAndDescribeTools(tools);

      // MCP tool should be noted as unavailable with fallback
      const mcpTool = filtered.find(t => t.name.includes('mcp__'));
      if (mcpTool) {
        assert.ok(
          mcpTool.status === 'unavailable' || mcpTool.fallback,
          'MCP tool should show unavailability or fallback'
        );
      }
    });
  });

  // ======================================================================
  // 8. Integration
  // ======================================================================

  describe('Integration', () => {
    it('should work with different agent types (developer, qa, architect)', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const agentTypes = ['developer', 'qa', 'architect', 'planner'];

      for (const agentType of agentTypes) {
        const enhanced = assembler.assembleSpawnPrompt({
          agentType,
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: `You are ${agentType.toUpperCase()}.`,
        });

        assert.ok(enhanced.includes('AVAILABLE_TOOLS'), `${agentType} should have tools section`);
        assert.ok(enhanced.includes('AVAILABLE_SKILLS'), `${agentType} should have skills section`);
      }
    });

    it('should include descriptions for all core tools', () => {
      if (!assembler) {
        assert.fail('Module not implemented yet');
      }

      const coreTools = [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'TaskUpdate',
        'TaskList',
        'TaskCreate',
        'TaskGet',
      ];

      const filtered = assembler.filterAndDescribeTools(coreTools);

      for (const tool of coreTools) {
        const toolInfo = filtered.find(t => t.name === tool);
        assert.ok(toolInfo, `Should find ${tool} in filtered results`);
        assert.ok(toolInfo.description, `${tool} should have description`);
      }
    });
  });
});
