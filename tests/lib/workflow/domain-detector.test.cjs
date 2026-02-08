/**
 * Tests for domain-detector.cjs utility
 * Task #38 (Deliverable 2)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const modulePath = path.join(PROJECT_ROOT, '.claude', 'lib', 'workflow', 'domain-detector.cjs');

describe('domain-detector', () => {
  let detectDomains;

  // Load module before each test
  function loadModule() {
    delete require.cache[require.resolve(modulePath)];
    const module = require(modulePath);
    detectDomains = module.detectDomains;
  }

  it('should detect security domain signals', () => {
    loadModule();
    const result = detectDomains('Implement authentication and authorization with JWT tokens');

    assert.ok(result.domains.includes('security'));
    assert.strictEqual(result.primaryDomain, 'security');
    assert.ok(result.confidence > 0);
  });

  it('should detect database domain signals', () => {
    loadModule();
    const result = detectDomains('Design the database schema with migrations');

    assert.ok(result.domains.includes('database'));
    assert.strictEqual(result.primaryDomain, 'database');
    assert.ok(result.confidence > 0);
  });

  it('should detect frontend domain signals', () => {
    loadModule();
    const result = detectDomains('Build a React component with responsive CSS');

    assert.ok(result.domains.includes('frontend'));
    assert.strictEqual(result.primaryDomain, 'frontend');
    assert.ok(result.confidence > 0);
  });

  it('should detect backend domain signals', () => {
    loadModule();
    const result = detectDomains('Create a REST API endpoint with validation');

    assert.ok(result.domains.includes('backend'));
    assert.strictEqual(result.primaryDomain, 'backend');
    assert.ok(result.confidence > 0);
  });

  it('should detect devops domain signals', () => {
    loadModule();
    const result = detectDomains('Set up CI/CD pipeline with Docker deployment');

    assert.ok(result.domains.includes('devops'));
    assert.strictEqual(result.primaryDomain, 'devops');
    assert.ok(result.confidence > 0);
  });

  it('should detect testing domain signals', () => {
    loadModule();
    const result = detectDomains('Add unit tests and integration tests with coverage');

    assert.ok(result.domains.includes('testing'));
    assert.strictEqual(result.primaryDomain, 'testing');
    assert.ok(result.confidence > 0);
  });

  it('should detect documentation domain signals', () => {
    loadModule();
    const result = detectDomains('Write API documentation and user guide with examples');

    assert.ok(result.domains.includes('documentation'));
    assert.strictEqual(result.primaryDomain, 'documentation');
    assert.ok(result.confidence > 0);
  });

  it('should detect performance domain signals', () => {
    loadModule();
    const result = detectDomains('Optimize query performance and reduce memory usage');

    assert.ok(result.domains.includes('performance'));
    assert.strictEqual(result.primaryDomain, 'performance');
    assert.ok(result.confidence > 0);
  });

  it('should detect multiple domains and rank by score', () => {
    loadModule();
    const result = detectDomains('Build a secure REST API with database schema and tests');

    // Should detect backend, security, database, testing
    assert.ok(result.domains.length > 1);
    assert.ok(result.domains.includes('backend'));
    assert.ok(result.domains.includes('security'));
    assert.ok(result.primaryDomain !== null);
  });

  it('should return low confidence for generic text', () => {
    loadModule();
    const result = detectDomains('Please help me with this task');

    // May detect some domain but confidence should be low
    assert.ok(result.confidence < 0.5);
  });

  it('should handle empty input', () => {
    loadModule();
    const result = detectDomains('');

    assert.deepStrictEqual(result.domains, []);
    assert.strictEqual(result.primaryDomain, null);
    assert.strictEqual(result.confidence, 0);
  });

  it('should calculate confidence based on signal density', () => {
    loadModule();
    const strongSignal = detectDomains(
      'authentication authorization credentials security vulnerability OWASP JWT tokens'
    );
    const weakSignal = detectDomains('update the code');

    assert.ok(strongSignal.confidence > weakSignal.confidence);
  });

  it('should detect mobile domain signals', () => {
    loadModule();
    const result = detectDomains('Build iOS app with Swift and Android app with Kotlin');

    assert.ok(result.domains.includes('mobile'));
    assert.strictEqual(result.primaryDomain, 'mobile');
  });

  it('should detect ai-ml domain signals', () => {
    loadModule();
    const result = detectDomains('Train machine learning model with neural network');

    assert.ok(result.domains.includes('ai-ml'));
    assert.strictEqual(result.primaryDomain, 'ai-ml');
  });

  it('should return highest scoring domain as primary', () => {
    loadModule();
    // Security has many high-weight keywords
    const result = detectDomains(
      'authentication authorization vulnerability OWASP security credentials'
    );

    assert.strictEqual(result.primaryDomain, 'security');
    // Security should have highest score
    assert.ok(result.confidence > 0.5);
  });
});
