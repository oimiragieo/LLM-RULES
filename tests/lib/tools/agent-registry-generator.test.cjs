'use strict';

/**
 * Agent Registry Generator Tests
 * Phase 3A: Agent Capability Card Schema & Generator
 *
 * TDD: Write tests first, then implementation.
 */

const { describe, it, beforeEach, afterEach, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Project root for consistent paths
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude/schemas/agent-capability-card.schema.json');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude/agents');
const _REGISTRY_OUTPUT = path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');

// Will be loaded after schema exists
let Ajv, addFormats;

before(() => {
  // Load AJV for schema validation
  Ajv = require('ajv');
  addFormats = require('ajv-formats');
});

describe('Agent Capability Card Schema', () => {
  let ajv;
  let schema;
  let validate;

  beforeEach(() => {
    // Load schema fresh each test
    if (fs.existsSync(SCHEMA_PATH)) {
      schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
      ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      validate = ajv.compile(schema);
    }
  });

  describe('Schema File', () => {
    it('schema file should exist at expected path', () => {
      assert.ok(fs.existsSync(SCHEMA_PATH), `Schema file should exist at ${SCHEMA_PATH}`);
    });

    it('schema should be valid JSON', () => {
      assert.doesNotThrow(() => {
        JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
      });
    });

    it('schema should have $schema property with draft-07', () => {
      assert.ok(schema.$schema, 'Schema should have $schema property');
      assert.ok(schema.$schema.includes('draft-07'), 'Schema should use JSON Schema draft-07');
    });

    it('schema should have title and description', () => {
      assert.ok(schema.title, 'Schema should have title');
      assert.ok(schema.description, 'Schema should have description');
    });
  });

  describe('Required Fields Validation', () => {
    it('should require id field', () => {
      const invalid = { capabilities: [], health: { status: 'healthy' } };
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Should fail without id');
    });

    it('should require capabilities field', () => {
      const invalid = { id: 'developer', health: { status: 'healthy' } };
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Should fail without capabilities');
    });

    it('should require health field', () => {
      const invalid = { id: 'developer', capabilities: [] };
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Should fail without health');
    });
  });

  describe('ID Pattern Validation', () => {
    it('should validate lowercase kebab-case id pattern', () => {
      const valid = createValidCard({ id: 'developer' });
      assert.strictEqual(validate(valid), true, 'developer should be valid');
    });

    it('should validate id with numbers', () => {
      const valid = createValidCard({ id: 'c4-context' });
      assert.strictEqual(validate(valid), true, 'c4-context should be valid');
    });

    it('should reject uppercase id', () => {
      const invalid = createValidCard({ id: 'Developer' });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Uppercase ID should be rejected');
    });

    it('should reject id starting with number', () => {
      const invalid = createValidCard({ id: '4developer' });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'ID starting with number should be rejected');
    });

    it('should reject id with spaces', () => {
      const invalid = createValidCard({ id: 'my developer' });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'ID with spaces should be rejected');
    });
  });

  describe('Category Enum Validation', () => {
    const validCategories = ['core', 'specialized', 'domain', 'orchestrator'];

    for (const category of validCategories) {
      it(`should accept category "${category}"`, () => {
        const valid = createValidCard({ category });
        assert.strictEqual(validate(valid), true, `Category ${category} should be valid`);
      });
    }

    it('should reject invalid category', () => {
      const invalid = createValidCard({ category: 'invalid-category' });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Invalid category should be rejected');
    });
  });

  describe('Health Status Validation', () => {
    const validStatuses = ['healthy', 'degraded', 'unavailable'];

    for (const status of validStatuses) {
      it(`should accept health status "${status}"`, () => {
        const valid = createValidCard({ health: { status } });
        assert.strictEqual(validate(valid), true, `Status ${status} should be valid`);
      });
    }

    it('should reject invalid health status', () => {
      const invalid = createValidCard({ health: { status: 'broken' } });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Invalid health status should be rejected');
    });
  });

  describe('Capabilities Array Validation', () => {
    it('should require at least one capability', () => {
      const invalid = createValidCard({ capabilities: [] });
      // Empty capabilities should still have minItems: 1
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Empty capabilities should be rejected');
    });

    it('should validate capability domain enum', () => {
      const validDomains = [
        'code',
        'testing',
        'security',
        'devops',
        'research',
        'documentation',
        'architecture',
        'database',
        'frontend',
        'backend',
        'mobile',
        'ai-ml',
        'blockchain',
        'orchestration',
        'planning',
      ];

      for (const domain of validDomains) {
        const valid = createValidCard({
          capabilities: [
            {
              name: 'test-cap',
              domain,
              description: 'Test capability',
            },
          ],
        });
        assert.strictEqual(validate(valid), true, `Domain ${domain} should be valid`);
      }
    });

    it('should reject invalid capability domain', () => {
      const invalid = createValidCard({
        capabilities: [
          {
            name: 'test-cap',
            domain: 'invalid-domain',
            description: 'Test capability',
          },
        ],
      });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Invalid capability domain should be rejected');
    });
  });

  describe('Constraints Validation', () => {
    it('should accept valid maxConcurrentTasks', () => {
      const valid = createValidCard({
        constraints: { maxConcurrentTasks: 5 },
      });
      assert.strictEqual(validate(valid), true, 'Valid maxConcurrentTasks should pass');
    });

    it('should reject maxConcurrentTasks less than 1', () => {
      const invalid = createValidCard({
        constraints: { maxConcurrentTasks: 0 },
      });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'maxConcurrentTasks < 1 should be rejected');
    });

    it('should validate preferredModel enum', () => {
      for (const model of ['haiku', 'sonnet', 'opus']) {
        const valid = createValidCard({
          constraints: { preferredModel: model },
        });
        assert.strictEqual(validate(valid), true, `Model ${model} should be valid`);
      }
    });
  });

  describe('Metadata Validation', () => {
    it('should accept valid metadata', () => {
      const valid = createValidCard({
        metadata: {
          version: '1.0.0',
          createdAt: '2026-01-31T12:00:00.000Z',
          author: 'anthropic',
        },
      });
      assert.strictEqual(validate(valid), true, 'Valid metadata should pass');
    });

    it('should validate version pattern', () => {
      const invalid = createValidCard({
        metadata: {
          version: 'v1.0', // Invalid - missing patch version
        },
      });
      const result = validate(invalid);
      assert.strictEqual(result, false, 'Invalid version pattern should be rejected');
    });
  });
});

describe('AgentRegistryGenerator', () => {
  let generator;
  let AgentRegistryGenerator;

  before(() => {
    // Load generator module after schema is created
    const generatorPath = path.join(PROJECT_ROOT, '.claude/lib/tools/agent-registry-generator.cjs');
    if (fs.existsSync(generatorPath)) {
      const module = require(generatorPath);
      AgentRegistryGenerator = module.AgentRegistryGenerator;
    }
  });

  beforeEach(() => {
    if (AgentRegistryGenerator) {
      generator = new AgentRegistryGenerator();
    }
  });

  describe('Agent Scanning', () => {
    it('should find agents in all category directories', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      assert.ok(agents.size > 0, 'Should find at least one agent');
    });

    it('should find agents in core directory', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      const coreAgents = [...agents.values()].filter(a => a.category === 'core');
      assert.ok(coreAgents.length > 0, 'Should find at least one core agent');
    });

    it('should find agents in specialized directory', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      const specializedAgents = [...agents.values()].filter(a => a.category === 'specialized');
      assert.ok(specializedAgents.length > 0, 'Should find at least one specialized agent');
    });

    it('should find agents in domain directory', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      const domainAgents = [...agents.values()].filter(a => a.category === 'domain');
      assert.ok(domainAgents.length > 0, 'Should find at least one domain agent');
    });

    it('should find agents in orchestrators directory', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      const orchestratorAgents = [...agents.values()].filter(a => a.category === 'orchestrator');
      assert.ok(orchestratorAgents.length > 0, 'Should find at least one orchestrator agent');
    });

    it('should skip README.md files', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      const readmeAgent = agents.get('README');
      assert.strictEqual(readmeAgent, undefined, 'Should not include README files');
    });
  });

  describe('Capability Card Generation', () => {
    it('should generate valid capability card for developer agent', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const agents = await generator.scanAgents(AGENTS_DIR);
      const developerInfo = agents.get('developer');
      assert.ok(developerInfo, 'Developer agent should exist');

      const { generateCapabilityCard } = require(
        path.join(PROJECT_ROOT, '.claude/lib/tools/agent-registry-generator.cjs')
      );
      const card = generateCapabilityCard(
        developerInfo.definition,
        'developer',
        developerInfo.category,
        developerInfo.filePath
      );

      assert.strictEqual(card.id, 'developer');
      assert.strictEqual(card.category, 'core');
      assert.ok(card.capabilities.length > 0);
      assert.ok(card.health);
      assert.strictEqual(card.health.status, 'healthy');
    });

    it('should generate displayName from agent id', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { generateCapabilityCard } = require(
        path.join(PROJECT_ROOT, '.claude/lib/tools/agent-registry-generator.cjs')
      );
      const card = generateCapabilityCard(
        { description: 'Test agent' },
        'code-reviewer',
        'specialized',
        '.claude/agents/specialized/code-reviewer.md'
      );

      assert.strictEqual(card.displayName, 'Code Reviewer');
    });

    it('should use agent name from definition if available', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { generateCapabilityCard } = require(
        path.join(PROJECT_ROOT, '.claude/lib/tools/agent-registry-generator.cjs')
      );
      const card = generateCapabilityCard(
        { name: 'Custom Name', description: 'Test agent' },
        'code-reviewer',
        'specialized',
        '.claude/agents/specialized/code-reviewer.md'
      );

      assert.strictEqual(card.displayName, 'Custom Name');
    });
  });

  describe('Index Building', () => {
    it('should build byCapability index', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      assert.ok(registry.index.byCapability, 'byCapability index should exist');
      assert.ok(
        Object.keys(registry.index.byCapability).length > 0,
        'byCapability should have entries'
      );
    });

    it('should build byDomain index', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      assert.ok(registry.index.byDomain, 'byDomain index should exist');
      assert.ok(Object.keys(registry.index.byDomain).length > 0, 'byDomain should have entries');
    });

    it('should build byCategory index', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      assert.ok(registry.index.byCategory, 'byCategory index should exist');

      // Should have all 4 categories
      assert.ok(registry.index.byCategory.core, 'Should have core category');
      assert.ok(registry.index.byCategory.specialized, 'Should have specialized category');
      assert.ok(registry.index.byCategory.domain, 'Should have domain category');
      assert.ok(registry.index.byCategory.orchestrator, 'Should have orchestrator category');
    });
  });

  describe('Health Summary', () => {
    it('should populate health arrays', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      assert.ok(Array.isArray(registry.health.healthy), 'healthy should be an array');
      assert.ok(Array.isArray(registry.health.degraded), 'degraded should be an array');
      assert.ok(Array.isArray(registry.health.unavailable), 'unavailable should be an array');
    });

    it('should have all agents in healthy array initially', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      const totalAgents = Object.keys(registry.agents).length;
      assert.strictEqual(
        registry.health.healthy.length,
        totalAgents,
        'All agents should be healthy initially'
      );
    });
  });

  describe('Registry Generation', () => {
    it('should generate registry with correct structure', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);

      assert.ok(registry.version, 'Registry should have version');
      assert.ok(registry.generatedAt, 'Registry should have generatedAt');
      assert.ok(registry.metadata, 'Registry should have metadata');
      assert.ok(registry.agents, 'Registry should have agents');
      assert.ok(registry.index, 'Registry should have index');
      assert.ok(registry.health, 'Registry should have health');
    });

    it('should count agents correctly in metadata', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      const agentCount = Object.keys(registry.agents).length;

      assert.strictEqual(registry.metadata.totalAgents, agentCount);
      assert.strictEqual(registry.metadata.healthyAgents, agentCount);
      assert.strictEqual(registry.metadata.degradedAgents, 0);
      assert.strictEqual(registry.metadata.unavailableAgents, 0);
    });

    it('should find at least 40 agents', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      const agentCount = Object.keys(registry.agents).length;

      assert.ok(agentCount >= 40, `Expected at least 40 agents, got ${agentCount}`);
    });
  });

  describe('Schema Validation', () => {
    it('should validate generated registry against schema', async () => {
      if (!generator) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const registry = await generator.generate(AGENTS_DIR);
      const validation = generator.validate(registry);

      assert.strictEqual(
        validation.valid,
        true,
        `Validation failed: ${JSON.stringify(validation.errors)}`
      );
    });
  });
});

describe('Edge Cases', () => {
  describe('Missing Agent Frontmatter', () => {
    it('should handle agent without frontmatter gracefully', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { parseAgentFrontmatter } = require(generatorPath);
      const content = '# Agent without frontmatter\n\nJust content here.';
      const result = parseAgentFrontmatter(content);

      assert.strictEqual(result, null, 'Should return null for missing frontmatter');
    });
  });

  describe('Invalid YAML Frontmatter', () => {
    it('should handle malformed YAML gracefully', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { parseAgentFrontmatter } = require(generatorPath);
      const content = '---\ninvalid: yaml: here: bad\n---\n\nContent';
      const result = parseAgentFrontmatter(content);

      // Should not throw, return null instead
      assert.strictEqual(result, null, 'Should return null for invalid YAML');
    });
  });

  describe('Domain Inference', () => {
    it('should infer domain from agent skills', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { inferDomain } = require(generatorPath);
      const agentDef = { skills: ['tdd', 'debugging'] };
      const domain = inferDomain(agentDef, 'test-agent', 'core');

      assert.strictEqual(domain, 'code', 'TDD skill should infer code domain');
    });

    it('should infer domain from agent id', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { inferDomain } = require(generatorPath);
      const domain = inferDomain({}, 'security-architect', 'specialized');

      assert.strictEqual(domain, 'security', 'security-architect should infer security domain');
    });

    it('should fallback to category-based domain', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { inferDomain } = require(generatorPath);
      const domain = inferDomain({}, 'unknown-agent', 'orchestrator');

      assert.strictEqual(
        domain,
        'orchestration',
        'orchestrator category should infer orchestration domain'
      );
    });
  });

  describe('Trigger Phrase Extraction', () => {
    it('should extract phrases from agent id', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { extractTriggerPhrases } = require(generatorPath);
      const phrases = extractTriggerPhrases({}, 'code-reviewer');

      assert.ok(phrases.includes('code'), 'Should extract code from id');
      assert.ok(phrases.includes('reviewer'), 'Should extract reviewer from id');
    });

    it('should extract action words from description', () => {
      const generatorPath = path.join(
        PROJECT_ROOT,
        '.claude/lib/tools/agent-registry-generator.cjs'
      );
      if (!fs.existsSync(generatorPath)) {
        console.log('Skipping: Generator not yet implemented');
        return;
      }

      const { extractTriggerPhrases } = require(generatorPath);
      const phrases = extractTriggerPhrases(
        {
          description: 'This agent can implement features and debug issues',
        },
        'developer'
      );

      assert.ok(phrases.includes('implement'), 'Should extract implement');
      assert.ok(phrases.includes('debug'), 'Should extract debug');
    });
  });
});

// Helper function to create a valid capability card for testing
function createValidCard(overrides = {}) {
  const base = {
    id: 'test-agent',
    displayName: 'Test Agent',
    category: 'core',
    filePath: '.claude/agents/core/test-agent.md',
    capabilities: [
      {
        name: 'testing',
        domain: 'testing',
        description: 'Test capability for validation',
        triggerPhrases: ['test'],
        requiredTools: ['Read'],
        skills: [],
      },
    ],
    constraints: {
      maxConcurrentTasks: 5,
      preferredModel: 'sonnet',
    },
    health: {
      status: 'healthy',
      consecutiveFailures: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 1.0,
      lastUpdate: '2026-01-31T12:00:00.000Z',
      isolatedAt: null,
      isolationReason: null,
    },
    metadata: {
      version: '1.0.0',
      createdAt: '2026-01-31T12:00:00.000Z',
      updatedAt: '2026-01-31T12:00:00.000Z',
    },
  };

  // Deep merge overrides
  const result = JSON.parse(JSON.stringify(base));

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = { ...result[key], ...value };
    } else {
      result[key] = value;
    }
  }

  return result;
}
