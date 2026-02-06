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
});
