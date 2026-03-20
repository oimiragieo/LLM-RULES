const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Integration test: verify constitution is actually added to assembled prompts
const {
  loadConstitutionContext,
  appendConstitutionSection,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

describe('Constitution Integration - End-to-End', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

  test('should integrate constitution into a real assembled prompt', () => {
    // Simulate a typical assembled prompt structure
    const assembledPrompt = `+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: 123                                                  |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: ${PROJECT_ROOT}

## Your Assigned Task
Task ID: 123
Subject: Implement feature X

## AVAILABLE_TOOLS
Read, Write, Edit, Bash, TaskUpdate, Skill

## AVAILABLE_SKILLS
tdd, debugging, git-expert

## SKILL DISCOVERY PROTOCOL
Use Skill() tool to invoke skills.

## Memory Context (Auto-Loaded)
Recent session data...
`;

    // Load constitution context
    const constitutionContext = loadConstitutionContext(PROJECT_ROOT);

    // Append constitution section
    const result = appendConstitutionSection(assembledPrompt, constitutionContext);

    // Verify constitution section is present
    assert.ok(
      result.includes('## Agent Constitution'),
      'Expected Agent Constitution section in assembled prompt'
    );

    // Verify it's placed before Memory Context
    const constitutionIdx = result.indexOf('## Agent Constitution');
    const memoryIdx = result.indexOf('## Memory Context');
    assert.ok(constitutionIdx !== -1, 'Expected constitution section to exist');
    assert.ok(memoryIdx !== -1, 'Expected memory section to exist');
    assert.ok(constitutionIdx < memoryIdx, 'Expected constitution section before Memory Context');

    // Verify content is present
    assert.ok(
      result.includes('Router-First Architecture'),
      'Expected constitution principles in output'
    );
    assert.ok(result.includes('Router Behaviour'), 'Expected behaviour section in output');
  });

  test('should have constitution context loaded from real files', () => {
    const context = loadConstitutionContext(PROJECT_ROOT);

    // Verify real content is loaded
    assert.ok(context.constitution.length > 0, 'Expected constitution content to be loaded');
    assert.ok(context.behaviour.length > 0, 'Expected behaviour content to be loaded');

    // Verify it contains expected headers
    assert.ok(context.constitution.includes('# Constitution'), 'Expected constitution header');
    assert.ok(context.behaviour.includes('# Behaviour'), 'Expected behaviour header');

    // Verify key principles are present
    assert.ok(context.constitution.includes('Core Principles'), 'Expected Core Principles section');
    assert.ok(context.behaviour.includes('Router Behaviour'), 'Expected Router Behaviour section');
    assert.ok(context.behaviour.includes('Agent Behaviour'), 'Expected Agent Behaviour section');
  });

  test('should not break existing prompt sections', () => {
    const originalPrompt = `## AVAILABLE_TOOLS
Read, Write

## Memory Context (Auto-Loaded)
Memory data

## SKILL DISCOVERY PROTOCOL
Skill info`;

    const context = loadConstitutionContext(PROJECT_ROOT);
    const result = appendConstitutionSection(originalPrompt, context);

    // Verify all original sections are still present
    assert.ok(result.includes('## AVAILABLE_TOOLS'), 'Expected AVAILABLE_TOOLS preserved');
    assert.ok(result.includes('## Memory Context'), 'Expected Memory Context preserved');
    assert.ok(
      result.includes('## SKILL DISCOVERY PROTOCOL'),
      'Expected SKILL DISCOVERY PROTOCOL preserved'
    );

    // Verify constitution was added
    assert.ok(result.includes('## Agent Constitution'), 'Expected constitution added');
  });

  test('dedupes behaviour when ## Dynamic behaviour rules already present (production path)', () => {
    const uniqueToken = 'UNIQUE_BEHAV_RULE_TOKEN_FOR_DEDUPE_TEST';
    const assembledPrompt = `## AVAILABLE_TOOLS
Read

## Memory Context (Auto-Loaded)
mem body

## Dynamic behaviour rules

${uniqueToken}

## Task tail
`;

    const constitutionContext = {
      constitution: '# Constitution\n\nConstOnlyBodyForDedupe',
      behaviour: `${uniqueToken} extra behaviour noise that would be clipped if duplicated`,
    };

    const result = appendConstitutionSection(assembledPrompt, constitutionContext);

    assert.ok(result.includes('## Dynamic behaviour rules'), 'Dynamic behaviour section preserved');
    assert.ok(
      result.includes(uniqueToken),
      'Behaviour body still appears under Dynamic behaviour rules'
    );

    const acIdx = result.indexOf('## Agent Constitution');
    const memIdx = result.indexOf('## Memory Context (Auto-Loaded)');
    assert.ok(acIdx !== -1 && memIdx !== -1, 'Expected constitution and memory markers');
    assert.ok(acIdx < memIdx, 'Agent Constitution before Memory Context');

    const agentConstSlice = result.slice(acIdx, memIdx);
    assert.ok(
      agentConstSlice.includes('ConstOnlyBodyForDedupe'),
      'Agent Constitution should include constitution text'
    );
    assert.ok(
      !agentConstSlice.includes(uniqueToken),
      'Agent Constitution must not repeat behaviour body when Dynamic behaviour rules exists'
    );

    const matches = result.match(
      new RegExp(uniqueToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    );
    assert.strictEqual(
      matches ? matches.length : 0,
      1,
      'Unique behaviour token should appear exactly once in full prompt'
    );
  });
});
