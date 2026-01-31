#!/usr/bin/env node
/**
 * Test: Hybrid Validation Extension (Enhancement #10)
 *
 * Tests that code-reviewer, security-architect, and architect agents
 * integrate checklist-generator skill for IEEE + contextual validation
 *
 * RED phase: Tests will FAIL until enhancement implemented
 */

const { strict: assert } = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Enhancement #10: Hybrid Validation Extension\n');

const agents = [
  { name: 'code-reviewer', path: path.join(__dirname, 'specialized/code-reviewer.md') },
  { name: 'security-architect', path: path.join(__dirname, 'specialized/security-architect.md') },
  { name: 'architect', path: path.join(__dirname, 'core/architect.md') },
];

// Test 1: All 3 agents exist
console.log('Test 1: All 3 target agents exist');
try {
  agents.forEach(agent => {
    assert.ok(fs.existsSync(agent.path), `${agent.name} should exist`);
  });
  console.log('  ✓ code-reviewer, security-architect, architect exist');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 2: Each agent invokes checklist-generator skill
console.log('\nTest 2: Each agent invokes checklist-generator skill');
try {
  agents.forEach(agent => {
    const content = fs.readFileSync(agent.path, 'utf-8');
    assert.ok(
      content.includes('checklist-generator') ||
        content.includes('Skill({ skill: "checklist-generator" })'),
      `${agent.name} should invoke checklist-generator skill`
    );
  });
  console.log('  ✓ All 3 agents invoke checklist-generator');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 3: 80/20 split documented (IEEE vs contextual)
console.log('\nTest 3: 80/20 split ratio documented');
try {
  agents.forEach(agent => {
    const content = fs.readFileSync(agent.path, 'utf-8');
    assert.ok(
      (content.includes('80') && content.includes('20')) ||
        content.includes('80-90%') ||
        content.includes('10-20%'),
      `${agent.name} should document 80/20 split`
    );
  });
  console.log('  ✓ All agents document 80/20 split (IEEE/contextual)');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 4: [AI-GENERATED] prefix for contextual items
console.log('\nTest 4: [AI-GENERATED] prefix documented');
try {
  agents.forEach(agent => {
    const content = fs.readFileSync(agent.path, 'utf-8');
    assert.ok(
      content.includes('[AI-GENERATED]'),
      `${agent.name} should reference [AI-GENERATED] prefix`
    );
  });
  console.log('  ✓ All agents reference [AI-GENERATED] prefix');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 5: IEEE 1028 reference
console.log('\nTest 5: IEEE 1028 standards referenced');
try {
  agents.forEach(agent => {
    const content = fs.readFileSync(agent.path, 'utf-8');
    assert.ok(
      content.includes('IEEE 1028') || content.includes('IEEE-1028'),
      `${agent.name} should reference IEEE 1028`
    );
  });
  console.log('  ✓ All agents reference IEEE 1028 standards');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✅ All tests passed for Enhancement #10');
console.log('✅ Hybrid validation extended to 3 agents');
