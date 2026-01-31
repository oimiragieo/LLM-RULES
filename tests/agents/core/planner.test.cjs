#!/usr/bin/env node
/**
 * Test: Commit Checkpoint Pattern (Enhancement #9)
 *
 * Tests that planner agent includes commit checkpoints for multi-file projects (>10 files)
 *
 * RED phase: Tests will FAIL until enhancement implemented
 */

const { strict: assert } = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Enhancement #9: Commit Checkpoint Pattern\n');

const plannerPath = path.join(__dirname, 'planner.md');

// Test 1: planner.md exists
console.log('Test 1: planner.md agent file exists');
try {
  assert.ok(fs.existsSync(plannerPath), 'planner.md should exist');
  console.log('  ✓ planner.md exists');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 2: Commit checkpoint pattern documented
console.log('\nTest 2: Commit checkpoint pattern documented');
try {
  const content = fs.readFileSync(plannerPath, 'utf-8');

  assert.ok(
    content.toLowerCase().includes('commit checkpoint') ||
      content.toLowerCase().includes('commit-checkpoint'),
    'Should document commit checkpoint pattern'
  );

  console.log('  ✓ Commit checkpoint pattern documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 3: 10+ files threshold documented
console.log('\nTest 3: 10+ files threshold for checkpoint');
try {
  const content = fs.readFileSync(plannerPath, 'utf-8');

  assert.ok(
    content.includes('10') && content.toLowerCase().includes('file'),
    'Should document 10+ files threshold'
  );

  console.log('  ✓ 10+ files threshold documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 4: Phase 3 Integration checkpoint location
console.log('\nTest 4: Checkpoint at Phase 3 (Integration)');
try {
  const content = fs.readFileSync(plannerPath, 'utf-8');

  // Check for Phase 3 reference
  assert.ok(
    content.includes('Phase 3') || content.includes('Phase 3'),
    'Should reference Phase 3 (Integration phase)'
  );

  console.log('  ✓ Phase 3 Integration checkpoint location documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 5: Rationale for checkpoint (prevent lost work)
console.log('\nTest 5: Checkpoint rationale documented');
try {
  const content = fs.readFileSync(plannerPath, 'utf-8');

  assert.ok(
    content.toLowerCase().includes('lost work') ||
      content.toLowerCase().includes('rollback') ||
      content.toLowerCase().includes('recovery') ||
      content.toLowerCase().includes('prevent'),
    'Should document rationale (prevent lost work / enable rollback)'
  );

  console.log('  ✓ Checkpoint rationale documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✅ All tests passed for Enhancement #9');
console.log('✅ Commit checkpoint pattern validated');
