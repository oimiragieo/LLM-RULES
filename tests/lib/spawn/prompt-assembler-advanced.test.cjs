'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');

let assembler;
const MODULE_PATH = path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler.cjs');

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

describe('prompt-assembler advanced behavior', () => {
  before(() => {
    try {
      assembler = require(MODULE_PATH);
    } catch (_e) {
      assembler = null;
    }
  });

  describe('Edge Cases', () => {
    it('should handle empty tools array', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: [],
        basePrompt: SAMPLE_BASE_PROMPT,
      });
      assert.ok(enhanced.includes('You are DEVELOPER'));
    });

    it('should handle missing agentType', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const enhanced = assembler.assembleSpawnPrompt({
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });
      assert.ok(enhanced.includes('AVAILABLE_SKILLS'));
    });

    it('should handle prompt without PROJECT CONTEXT section', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const enhanced = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: `You are DEVELOPER.\n\nComplete the task.`,
      });
      assert.ok(enhanced.includes('AVAILABLE_TOOLS'));
      assert.ok(enhanced.includes('Complete the task'));
    });

    it('should handle null/undefined basePrompt gracefully', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      try {
        const enhanced = assembler.assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: null,
        });
        assert.ok(typeof enhanced === 'string');
      } catch (e) {
        assert.ok(e.message.includes('basePrompt') || e.message.includes('prompt'));
      }
    });

    it('should mark unavailable MCP tools with fallbacks', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const filtered = assembler.filterAndDescribeTools([
        'Read',
        'Write',
        'mcp__sequential-thinking__sequentialthinking',
      ]);
      const mcpTool = filtered.find(t => t.name.includes('mcp__'));
      if (mcpTool) {
        assert.ok(mcpTool.status === 'unavailable' || mcpTool.fallback);
      }
    });

    it('should cap oversized memory context sections to protect token budget', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const oversized = 'X'.repeat(5000);
      const section = assembler.formatMemorySection({
        gotchas: [oversized, oversized, oversized, oversized],
        patterns: [oversized],
        decisions: [oversized],
        discoveries: [{ path: '.claude/a.md', description: oversized }],
        recent_sessions: [{ session_number: 1, summary: oversized }],
      });
      assert.ok(section.length <= 3500, `Section too large: ${section.length}`);
      assert.ok(!section.includes('\n\n\n\n'));
    });
  });

  describe('RAG Memory at Spawn', () => {
    it('formatRagMemorySection should return empty string for empty input', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      assert.equal(assembler.formatRagMemorySection([]), '');
    });

    it('formatRagMemorySection should render task-relevant memory bullets', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const section = assembler.formatRagMemorySection([
        { content: 'Use lock files for concurrent writes', similarity: 0.91 },
        { content: 'Call TaskUpdate before and after work', similarity: 0.88 },
      ]);
      assert.ok(section.includes('### Task-Relevant Memory (RAG)'));
      assert.ok(section.includes('Use lock files for concurrent writes'));
      assert.ok(section.includes('Call TaskUpdate before and after work'));
      assert.match(section, /\[rag:[a-f0-9]{8}\]/);
    });

    it('formatMemorySection should include mem evidence ids for injected facts', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const section = assembler.formatMemorySection({ gotchas: ['Avoid stale lock files'] });
      assert.ok(section.includes('## Memory Context (Auto-Loaded)'));
      assert.match(section, /\[mem:[a-f0-9]{8}\]/);
    });

    it('formatMemorySection should include actionable reflection learnings when available', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const section = assembler.formatMemorySection({
        reflection_actionables: ['Fix recurring summary metadata omissions in TaskUpdate'],
      });
      assert.ok(section.includes('### Reflection Learnings (Actionable)'));
      assert.ok(section.includes('Fix recurring summary metadata omissions in TaskUpdate'));
    });

    it('formatRagMemorySection should enforce max item cap', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const section = assembler.formatRagMemorySection(
        [{ content: 'One' }, { content: 'Two' }, { content: 'Three' }, { content: 'Four' }],
        { maxItems: 2 }
      );
      const bulletCount = (section.match(/^- /gm) || []).length;
      assert.equal(bulletCount, 2);
      assert.ok(section.includes('One'));
      assert.ok(section.includes('Two'));
      assert.ok(!section.includes('Three'));
    });

    it('assembleSpawnPromptAsync should match sync behavior when memoryQuery is omitted', async () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const syncPrompt = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });
      const asyncPrompt = await assembler.assembleSpawnPromptAsync({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
      });
      assert.equal(asyncPrompt, syncPrompt);
    });

    it('assembleSpawnPromptAsync should include RAG subsection when memory query has matches', async () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const enhanced = await assembler.assembleSpawnPromptAsync({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
        memoryQuery: 'routing guardrails',
        searchMemoryFn: async () => [
          { content: 'Route security-heavy tasks to security-architect first', similarity: 0.95 },
          { content: 'Use TaskList preflight before Task spawns', similarity: 0.9 },
        ],
      });
      assert.ok(enhanced.includes('## Memory Context (Auto-Loaded)'));
      assert.ok(enhanced.includes('### Task-Relevant Memory (RAG)'));
    });

    it('assembleSpawnPromptAsync should retry with adaptive fallback threshold when first pass is empty', async () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const originalThreshold = process.env.RAG_AT_SPAWN_THRESHOLD;
      const originalFallback = process.env.RAG_AT_SPAWN_ADAPTIVE_FALLBACK;
      process.env.RAG_AT_SPAWN_THRESHOLD = 'not-a-number';
      process.env.RAG_AT_SPAWN_ADAPTIVE_FALLBACK = 'on';
      const calls = [];
      try {
        const enhanced = await assembler.assembleSpawnPromptAsync({
          agentType: 'developer',
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: SAMPLE_BASE_PROMPT,
          memoryQuery: 'taskupdate routing memory',
          searchMemoryFn: async (_query, options) => {
            calls.push(options);
            if (calls.length === 1) return [];
            return [{ content: 'Fallback recovered relevant memory snippet', similarity: 0.34 }];
          },
        });
        assert.equal(calls.length, 2);
        assert.ok(!Object.prototype.hasOwnProperty.call(calls[0], 'threshold'));
        assert.equal(calls[1].threshold, 0.25);
        assert.ok(enhanced.includes('### Task-Relevant Memory (RAG)'));
      } finally {
        if (typeof originalThreshold === 'undefined') delete process.env.RAG_AT_SPAWN_THRESHOLD;
        else process.env.RAG_AT_SPAWN_THRESHOLD = originalThreshold;
        if (typeof originalFallback === 'undefined') {
          delete process.env.RAG_AT_SPAWN_ADAPTIVE_FALLBACK;
        } else {
          process.env.RAG_AT_SPAWN_ADAPTIVE_FALLBACK = originalFallback;
        }
      }
    });

    it('assembleSpawnPromptAsync should not run adaptive fallback when explicit threshold is provided', async () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const calls = [];
      const enhanced = await assembler.assembleSpawnPromptAsync({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
        memoryQuery: 'taskupdate routing memory',
        ragThreshold: 0.5,
        searchMemoryFn: async (_query, options) => {
          calls.push(options);
          return [];
        },
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].threshold, 0.5);
      assert.ok(!enhanced.includes('### Task-Relevant Memory (RAG)'));
    });

    it('assembleSpawnPromptAsync should fail open when memory search throws', async () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const enhanced = await assembler.assembleSpawnPromptAsync({
        agentType: 'developer',
        allowedTools: VALID_DEVELOPER_TOOLS,
        basePrompt: SAMPLE_BASE_PROMPT,
        memoryQuery: 'task updates',
        searchMemoryFn: async () => {
          throw new Error('search unavailable');
        },
      });
      assert.ok(enhanced.includes('## Memory Context (Auto-Loaded)'));
      assert.ok(!enhanced.includes('### Task-Relevant Memory (RAG)'));
    });

    it('assembleSpawnPromptAsync should honor RAG_AT_SPAWN=off kill switch', async () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const original = process.env.RAG_AT_SPAWN;
      process.env.RAG_AT_SPAWN = 'off';
      try {
        const enhanced = await assembler.assembleSpawnPromptAsync({
          agentType: 'developer',
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: SAMPLE_BASE_PROMPT,
          memoryQuery: 'should be ignored',
          searchMemoryFn: async () => [{ content: 'should not appear' }],
        });
        assert.ok(enhanced.includes('## Memory Context (Auto-Loaded)'));
        assert.ok(!enhanced.includes('### Task-Relevant Memory (RAG)'));
      } finally {
        if (typeof original === 'undefined') delete process.env.RAG_AT_SPAWN;
        else process.env.RAG_AT_SPAWN = original;
      }
    });
  });

  describe('Integration', () => {
    it('should work with different agent types (developer, qa, architect)', () => {
      if (!assembler) assert.fail('Module not implemented yet');
      const agentTypes = ['developer', 'qa', 'architect', 'planner'];
      for (const agentType of agentTypes) {
        const enhanced = assembler.assembleSpawnPrompt({
          agentType,
          allowedTools: VALID_DEVELOPER_TOOLS,
          basePrompt: `You are ${agentType.toUpperCase()}.`,
        });
        assert.ok(enhanced.includes('AVAILABLE_TOOLS'));
        assert.ok(enhanced.includes('AVAILABLE_SKILLS'));
      }
    });

    it('should include descriptions for all core tools', () => {
      if (!assembler) assert.fail('Module not implemented yet');
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
