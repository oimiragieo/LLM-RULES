#!/usr/bin/env node
/**
 * Test: Security Control Registry (Enhancement #8)
 *
 * Tests the security controls catalog structure, OWASP mappings,
 * integrity checks, and SEC-REGISTRY-001/002 controls
 *
 * RED phase: Tests will FAIL until enhancement implemented
 */

const { strict: assert } = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Enhancement #8: Security Control Registry\n');

const catalogPath = path.join(__dirname, 'security-controls-catalog.md');

// Test 1: Catalog file exists
console.log('Test 1: Security controls catalog exists');
try {
  assert.ok(fs.existsSync(catalogPath), 'Catalog file should exist');
  console.log('  ✓ security-controls-catalog.md exists');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 2: Catalog has 4+ controls
console.log('\nTest 2: Catalog contains 4+ security controls');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  const controls = [
    'SEC-001', // Token Whitelist
    'SEC-002', // Path Validation
    'SEC-003', // Input Sanitization
    'SEC-004', // Transparency Markers
  ];

  controls.forEach(controlId => {
    assert.ok(content.includes(controlId), `Should have ${controlId}`);
  });

  console.log('  ✓ All 4 mandatory controls present (SEC-001/002/003/004)');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 3: OWASP mappings present
console.log('\nTest 3: OWASP Top 10 mappings documented');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  const owaspCategories = [
    'A03', // Injection
    'A01', // Broken Access Control (for path validation)
    'A04', // Insecure Design (for transparency)
  ];

  owaspCategories.forEach(category => {
    assert.ok(content.includes(category), `Should have OWASP ${category} mapping`);
  });

  console.log('  ✓ OWASP mappings present (A03, A01, A04)');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 4: SEC-REGISTRY-001 documented (read-only at runtime)
console.log('\nTest 4: SEC-REGISTRY-001 (read-only enforcement) documented');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  assert.ok(content.includes('SEC-REGISTRY-001'), 'Should document SEC-REGISTRY-001');
  assert.ok(
    content.toLowerCase().includes('read-only') || content.toLowerCase().includes('read only'),
    'Should describe read-only enforcement'
  );

  console.log('  ✓ SEC-REGISTRY-001 (read-only runtime) documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 5: SEC-REGISTRY-002 documented (security-architect review required)
console.log('\nTest 5: SEC-REGISTRY-002 (security review) documented');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  assert.ok(content.includes('SEC-REGISTRY-002'), 'Should document SEC-REGISTRY-002');
  assert.ok(
    content.toLowerCase().includes('security-architect') ||
      content.toLowerCase().includes('security review'),
    'Should describe security-architect review requirement'
  );

  console.log('  ✓ SEC-REGISTRY-002 (security review) documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 6: Implementation examples present
console.log('\nTest 6: Implementation code examples provided');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  // Each control should have implementation example
  assert.ok(
    content.includes('```javascript') || content.includes('```js'),
    'Should have JavaScript implementation examples'
  );

  // Check for function definitions (implementation code)
  assert.ok(
    content.includes('function') || content.includes('=>'),
    'Should have function implementations'
  );

  console.log('  ✓ Implementation examples present');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 7: Test cases documented
console.log('\nTest 7: Test cases for each control');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  assert.ok(
    content.toLowerCase().includes('test') || content.toLowerCase().includes('validation'),
    'Should document test cases'
  );

  // At least one example of input/expected output
  assert.ok(
    content.includes('input:') ||
      content.includes('Input:') ||
      content.includes('expect') ||
      content.includes('Expect'),
    'Should have test input/expected output examples'
  );

  console.log('  ✓ Test cases documented');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 8: Location references (where control is used)
console.log('\nTest 8: Location references for each control');
try {
  const content = fs.readFileSync(catalogPath, 'utf-8');

  // Check for file references
  assert.ok(
    content.includes('.claude/') ||
      content.includes('template-renderer') ||
      content.includes('checklist-generator'),
    'Should reference file locations where controls are implemented'
  );

  console.log('  ✓ Location references present');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✅ All tests passed for Enhancement #8');
console.log('✅ Security Control Registry validated');
