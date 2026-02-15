'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const generatorPath = path.join(PROJECT_ROOT, '.claude/lib/tools/agent-registry-generator.cjs');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude/agents');

function withGenerator(callback) {
  if (!fs.existsSync(generatorPath)) {
    console.log('Skipping: Generator not yet implemented');
    return;
  }

  callback(require(generatorPath));
}

describe('Agent registry generator edge cases', () => {
  it('should handle agent without frontmatter gracefully', () => {
    withGenerator(({ parseAgentFrontmatter }) => {
      const content = '# Agent without frontmatter\n\nJust content here.';
      const result = parseAgentFrontmatter(content);
      assert.strictEqual(result, null);
    });
  });

  it('should handle malformed YAML gracefully', () => {
    withGenerator(({ parseAgentFrontmatter }) => {
      const content = '---\ninvalid: yaml: here: bad\n---\n\nContent';
      const result = parseAgentFrontmatter(content);
      assert.strictEqual(result, null);
    });
  });

  it('should infer domain from agent skills', () => {
    withGenerator(({ inferDomain }) => {
      const agentDef = { skills: ['tdd', 'debugging'] };
      const domain = inferDomain(agentDef, 'test-agent', 'core');
      assert.strictEqual(domain, 'code');
    });
  });

  it('should infer domain from agent id', () => {
    withGenerator(({ inferDomain }) => {
      const domain = inferDomain({}, 'security-architect', 'specialized');
      assert.strictEqual(domain, 'security');
    });
  });

  it('should fallback to category-based domain', () => {
    withGenerator(({ inferDomain }) => {
      const domain = inferDomain({}, 'unknown-agent', 'orchestrator');
      assert.strictEqual(domain, 'orchestration');
    });
  });

  it('should extract phrases from agent id', () => {
    withGenerator(({ extractTriggerPhrases }) => {
      const phrases = extractTriggerPhrases({}, 'code-reviewer');
      assert.ok(phrases.includes('code'));
      assert.ok(phrases.includes('reviewer'));
    });
  });

  it('should extract action words from description', () => {
    withGenerator(({ extractTriggerPhrases }) => {
      const phrases = extractTriggerPhrases(
        { description: 'This agent can implement features and debug issues' },
        'developer'
      );

      assert.ok(phrases.includes('implement'));
      assert.ok(phrases.includes('debug'));
    });
  });

  it('should extract examples and tags from frontmatter', () => {
    withGenerator(({ extractExamplesAndTags }) => {
      const result = extractExamplesAndTags(
        {
          examples: ['Review this API', 'Design a schema'],
          tags: ['review', 'schema'],
          skills: ['tdd'],
        },
        ['code review'],
        ['tdd']
      );

      assert.ok(result.examples.includes('Review this API'));
      assert.ok(result.tags.includes('review'));
      assert.ok(result.tags.includes('tdd'));
    });
  });

  it('should validate generated registry against schema', async () => {
    if (!fs.existsSync(generatorPath)) {
      console.log('Skipping: Generator not yet implemented');
      return;
    }

    const { AgentRegistryGenerator } = require(generatorPath);
    const generator = new AgentRegistryGenerator();
    const registry = await generator.generate(AGENTS_DIR);
    const validation = generator.validate(registry);
    assert.strictEqual(
      validation.valid,
      true,
      `Validation failed: ${JSON.stringify(validation.errors)}`
    );
  });
});
