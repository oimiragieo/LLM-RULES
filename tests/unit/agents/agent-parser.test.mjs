/**
 * Unit tests for Agent Parser with Identity Validation
 * Task #46 (P1-7.2): Update agent definition schema
 *
 * Tests identity parsing and JSON Schema validation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test will fail initially since module doesn't exist
let AgentParser;

describe('Agent Parser - Identity Parsing', () => {
  let testDir;

  beforeEach(() => {
    // Create unique test directory
    testDir = path.join(__dirname, `test-agent-parser-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should parse agent YAML frontmatter without identity', async () => {
    const agentContent = `---
name: test-agent
description: Test agent without identity
model: sonnet
---

# Test Agent`;

    const agentPath = path.join(testDir, 'test-agent.md');
    fs.writeFileSync(agentPath, agentContent, 'utf8');

    // Import module (will fail initially)
    const { AgentParser: Parser } = await import('../../../.claude/lib/agents/agent-parser.cjs');
    AgentParser = Parser;
    const parser = new AgentParser();

    const result = parser.parseAgentFile(agentPath);

    assert.ok(result, 'Should return result');
    assert.equal(result.name, 'test-agent');
    assert.equal(result.description, 'Test agent without identity');
    assert.equal(result.model, 'sonnet');
    assert.equal(result.identity, undefined, 'Should not have identity field');
  });

  it('should parse agent YAML frontmatter with identity', async () => {
    const agentContent = `---
name: developer
description: TDD-focused implementer
model: sonnet
identity:
  role: Senior Software Engineer
  goal: Write clean, tested, efficient code following TDD principles
  backstory: You've spent 15 years mastering software craftsmanship.
  personality:
    traits: [thorough, pragmatic, quality-focused]
    communication_style: direct
    risk_tolerance: low
    decision_making: data-driven
  motto: No code without a failing test
---

# Developer Agent`;

    const agentPath = path.join(testDir, 'developer.md');
    fs.writeFileSync(agentPath, agentContent, 'utf8');

    const parser = new AgentParser();
    const result = parser.parseAgentFile(agentPath);

    assert.ok(result.identity, 'Should have identity field');
    assert.equal(result.identity.role, 'Senior Software Engineer');
    assert.equal(
      result.identity.goal,
      'Write clean, tested, efficient code following TDD principles'
    );
    assert.ok(result.identity.backstory.includes('15 years'));
    assert.ok(Array.isArray(result.identity.personality.traits));
    assert.equal(result.identity.personality.communication_style, 'direct');
    assert.equal(result.identity.motto, 'No code without a failing test');
  });

  it('should validate identity against JSON Schema when present', async () => {
    const agentContent = `---
name: invalid-agent
description: Agent with invalid identity
model: sonnet
identity:
  role: Senior Software Engineer
  goal: Write code
  backstory: Expert developer
---

# Invalid Agent`;

    const agentPath = path.join(testDir, 'invalid-agent.md');
    fs.writeFileSync(agentPath, agentContent, 'utf8');

    const parser = new AgentParser();

    assert.throws(
      () => parser.parseAgentFile(agentPath),
      /identity validation failed/i,
      'Should throw validation error for short goal'
    );
  });

  it('should reject identity with role too short', async () => {
    const agentContent = `---
name: bad-agent
description: Agent with too short role
model: sonnet
identity:
  role: Dev
  goal: Write clean code efficiently
  backstory: You have experience with development
---

# Bad Agent`;

    const agentPath = path.join(testDir, 'bad-agent.md');
    fs.writeFileSync(agentPath, agentContent, 'utf8');

    const parser = new AgentParser();

    assert.throws(
      () => parser.parseAgentFile(agentPath),
      /(must NOT have fewer than|should NOT be shorter than) 5 characters/i,
      'Should reject role shorter than 5 characters'
    );
  });

  it('should reject identity with invalid personality trait', async () => {
    const agentContent = `---
name: bad-traits-agent
description: Agent with invalid personality trait
model: sonnet
identity:
  role: Senior Engineer
  goal: Build reliable software systems
  backstory: You have extensive development experience
  personality:
    traits: [super-fast, amazing]
---

# Bad Traits Agent`;

    const agentPath = path.join(testDir, 'bad-traits.md');
    fs.writeFileSync(agentPath, agentContent, 'utf8');

    const parser = new AgentParser();

    assert.throws(
      () => parser.parseAgentFile(agentPath),
      /should be equal to one of the allowed values/i,
      'Should reject invalid personality traits'
    );
  });

  it('should accept valid identity with all fields', async () => {
    const agentContent = `---
name: complete-agent
description: Agent with complete identity
model: sonnet
identity:
  role: Strategic Project Manager
  goal: Create robust implementation plans that any developer can follow
  backstory: You're a veteran project manager who has planned and executed dozens of complex software initiatives.
  personality:
    traits: [methodical, detail-oriented, collaborative]
    communication_style: diplomatic
    risk_tolerance: medium
    decision_making: systematic
  motto: Plan twice, code once
---

# Complete Agent`;

    const agentPath = path.join(testDir, 'complete-agent.md');
    fs.writeFileSync(agentPath, agentContent, 'utf8');

    const parser = new AgentParser();
    const result = parser.parseAgentFile(agentPath);

    assert.ok(result.identity, 'Should have identity');
    assert.equal(result.identity.role, 'Strategic Project Manager');
    assert.ok(result.identity.goal.includes('implementation plans'));
    assert.equal(result.identity.personality.traits.length, 3);
    assert.equal(result.identity.motto, 'Plan twice, code once');
  });
});

describe('Agent Parser - Validation Methods', () => {
  let testDir;

  beforeEach(() => {
    testDir = path.join(__dirname, `test-agent-parser-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should have validateIdentity method', async () => {
    const { AgentParser: Parser } = await import('../../../.claude/lib/agents/agent-parser.cjs');
    const parser = new Parser();

    const validIdentity = {
      role: 'Senior Engineer',
      goal: 'Build reliable software',
      backstory: 'You have extensive experience in software development',
    };

    const result = parser.validateIdentity(validIdentity);
    assert.ok(result.valid, 'Should validate correct identity');
    assert.equal(result.errors, undefined, 'Should have no errors');
  });

  it('should return validation errors for invalid identity', async () => {
    const { AgentParser: Parser } = await import('../../../.claude/lib/agents/agent-parser.cjs');
    const parser = new Parser();

    const invalidIdentity = {
      role: 'X', // Too short
      goal: 'Code', // Too short
      backstory: 'Dev', // Too short
    };

    const result = parser.validateIdentity(invalidIdentity);
    assert.equal(result.valid, false, 'Should be invalid');
    assert.ok(Array.isArray(result.errors), 'Should have errors array');
    assert.ok(result.errors.length > 0, 'Should have validation errors');
  });
});
