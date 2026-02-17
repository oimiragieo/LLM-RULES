'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { scoreAgents } = require('../../../.claude/hooks/routing/user-prompt-unified.core.cjs');

test('Code Review Routing Optimization', async (t) => {
  const mockAgents = [
    { name: 'code-reviewer', description: 'Reviews code for quality and bugs', priority: 'medium' },
    { name: 'architect', description: 'Designs system architecture and topology', priority: 'high' },
    { name: 'developer', description: 'Implements features and fixes bugs', priority: 'medium' }
  ];

  await t.test('should prioritize code-reviewer over architect for a pure code review prompt', () => {
    const prompt = 'Please review my recent changes in the login controller for any potential bugs.';
    const classification = { intent: 'code_review', defaultAgent: 'code-reviewer' };
    
    const { candidates } = scoreAgents(prompt, mockAgents, classification);
    
    assert.strictEqual(candidates[0].agent.name, 'code-reviewer');
    // Ensure only one candidate is returned if the gap is high enough
    assert.strictEqual(candidates.length, 1);
  });

  await t.test('should still include architect if architecture signals are present', () => {
    const prompt = 'Review the code but also check if the new database schema fits the system architecture.';
    const classification = { intent: 'code_review', defaultAgent: 'code-reviewer' };
    
    const { candidates } = scoreAgents(prompt, mockAgents, classification);
    
    assert.strictEqual(candidates.some(c => c.agent.name === 'code-reviewer'), true);
    assert.strictEqual(candidates.some(c => c.agent.name === 'architect'), true);
  });
});
