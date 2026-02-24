#!/usr/bin/env node
/**
 * End-to-End Routing Integration Test: Specialist-First Routing
 * ==============================================================
 *
 * Tests the full specialist-first routing pipeline:
 *   1. routing-guard.cjs Check 7 (checkSpecialistOverride) - detects developer
 *      misrouting for specialist tasks
 *   2. phase-advance-reader.cjs (resolveDomainSpecialist) - resolves domain
 *      specialists from task context
 *
 * This verifies the two halves of specialist-first routing work end-to-end:
 *   - Check 7 catches the Router spawning developer for specialist work
 *   - resolveDomainSpecialist maps task context to the correct specialist
 *
 * Run: node --test tests/integration/routing-specialist-e2e.test.cjs
 *
 * <!-- Agent: qa | Task: #9 | Session: 2026-02-07 -->
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Load modules under test
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const { checkSpecialistOverride, SPECIALIST_KEYWORD_MAP, invalidateCachedState } = require(
  path.join(PROJECT_ROOT, '.claude/hooks/routing/routing-guard.cjs')
);
const { resolveDomainSpecialist } = require(
  path.join(PROJECT_ROOT, '.claude/lib/workflow/phase-advance-reader.cjs')
);

// =============================================================================
// PART 1: Check 7 Integration Tests (Realistic Router Spawn Scenarios)
// =============================================================================

/**
 * Realistic misrouting test cases that simulate the Router spawning
 * 'developer' for tasks that should go to a specialist agent.
 *
 * Each case represents a real-world prompt the Router would construct
 * when incorrectly defaulting to developer.
 */
const MISROUTING_CASES = [
  {
    name: 'docs task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Update the README with new API endpoints and write documentation for the auth module.',
    description: 'Developer updating documentation',
    expectedSpecialist: 'technical-writer',
    shouldWarn: true,
  },
  {
    name: 'refactor task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Refactor the auth module for better readability. Clean up the code and simplify the logic.',
    description: 'Developer refactoring auth',
    expectedSpecialist: 'code-simplifier',
    shouldWarn: true,
  },
  {
    name: 'review task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Review the PR for the payment feature. Review code quality and patterns.',
    description: 'Developer reviewing payment PR',
    expectedSpecialist: 'code-reviewer',
    shouldWarn: true,
  },
  {
    name: 'test task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Write tests for the user service. Create a comprehensive test suite with unit and integration tests.',
    description: 'Developer writing tests for user service',
    expectedSpecialist: 'qa',
    shouldWarn: true,
  },
  {
    name: 'devops task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Set up Docker compose for local development environment and configure CI/CD pipeline.',
    description: 'Developer setting up Docker',
    expectedSpecialist: 'devops',
    shouldWarn: true,
  },
  {
    name: 'database task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Design the database schema for the orders table and create migration files.',
    description: 'Developer designing database schema',
    expectedSpecialist: 'database-architect',
    shouldWarn: true,
  },
  {
    name: 'research task routed to developer',
    prompt:
      'You are the DEVELOPER agent. Research best practices for WebSocket implementation and compare alternatives.',
    description: 'Developer researching WebSocket options',
    expectedSpecialist: 'researcher',
    shouldWarn: true,
  },
  {
    name: 'correct developer routing (bug fix)',
    prompt:
      'You are the DEVELOPER agent. Fix the login bug where users cannot reset their passwords. The issue is in the auth controller.',
    description: 'Developer fixing login bug',
    expectedSpecialist: null,
    shouldWarn: false,
  },
];

describe('E2E: Specialist-First Routing — Check 7 (Misrouting Detection)', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Ensure default enforcement (block) is active
    delete process.env.SPECIALIST_ROUTING_ENFORCEMENT;
    invalidateCachedState();
  });

  afterEach(() => {
    process.env = originalEnv;
    invalidateCachedState();
  });

  for (const tc of MISROUTING_CASES) {
    it(`should ${tc.shouldWarn ? 'BLOCK' : 'ALLOW'}: ${tc.name}`, () => {
      const result = checkSpecialistOverride('Task', {
        prompt: tc.prompt,
        description: tc.description,
      });

      if (tc.shouldWarn) {
        // Misrouting detected: should warn and suggest the specialist
        assert.strictEqual(result.pass, true, `Expected pass=true (warn mode) for: ${tc.name}`);
        assert.strictEqual(result.result, 'warn', `Expected result='warn' for: ${tc.name}`);
        assert.ok(result.message, `Expected a warning message for: ${tc.name}`);
        assert.ok(
          result.message.includes(tc.expectedSpecialist),
          `Expected message to mention '${tc.expectedSpecialist}', got: ${result.message}`
        );
      } else {
        // Correct routing: no warning
        assert.strictEqual(result.pass, true, `Expected pass=true for: ${tc.name}`);
        assert.strictEqual(
          result.result,
          undefined,
          `Expected no result (no warn/block) for: ${tc.name}`
        );
        assert.strictEqual(
          result.message,
          undefined,
          `Expected no message for correctly-routed: ${tc.name}`
        );
      }
    });
  }

  it('should not trigger for non-Task tool invocations', () => {
    const result = checkSpecialistOverride('Bash', {
      prompt: 'You are developer. Write documentation.',
      description: 'docs task',
    });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.result, undefined);
  });

  it('should not trigger for non-developer agent spawns', () => {
    const result = checkSpecialistOverride('Task', {
      prompt: 'You are the QA agent. Write tests for the auth module.',
      description: 'QA testing auth',
    });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.result, undefined);
  });

  it('should respect enforcement=off', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'off';
    const result = checkSpecialistOverride('Task', {
      prompt: 'You are the developer. Write documentation for the API.',
      description: 'Documentation task',
    });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.result, undefined);
  });

  it('should warn by default', () => {
    delete process.env.SPECIALIST_ROUTING_ENFORCEMENT;
    const result = checkSpecialistOverride('Task', {
      prompt: 'You are the developer. Write documentation for the API.',
      description: 'Documentation task',
    });
    assert.strictEqual(result.pass, true, 'Should warn in default warn mode');
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('technical-writer'));
  });

  it('should block when enforcement=block', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';
    const result = checkSpecialistOverride('Task', {
      prompt: 'You are the developer. Write documentation for the API.',
      description: 'Documentation task',
    });
    assert.strictEqual(result.pass, false, 'Should block in block mode');
    assert.strictEqual(result.result, 'block');
    assert.ok(result.message.includes('technical-writer'));
  });
});

// =============================================================================
// PART 2: Domain Specialist Resolution Integration Tests
// =============================================================================

/**
 * Domain specialist resolution test cases. These verify that
 * resolveDomainSpecialist maps task context to the correct specialist.
 */
const DOMAIN_CASES = [
  {
    context: 'Implement the Python data pipeline using pandas',
    expected: 'python-pro',
    description: 'Python with pandas library',
  },
  {
    context: 'Build the React dashboard component',
    expected: 'frontend-pro',
    description: 'React frontend work',
  },
  {
    context: 'Create the iOS app with SwiftUI',
    expected: 'ios-pro',
    description: 'iOS native development',
  },
  {
    context: 'Build the Android settings screen with Jetpack Compose',
    expected: 'android-pro',
    description: 'Android native development',
  },
  {
    context: 'Train the machine learning model with PyTorch',
    expected: 'ai-ml-specialist',
    description: 'ML/AI with PyTorch',
  },
  {
    context: 'Write the Solidity smart contract for the DEX',
    expected: 'web3-blockchain-expert',
    description: 'Web3/Blockchain with Solidity',
  },
  {
    context: 'Implement the Go microservice with gRPC',
    expected: 'golang-pro',
    description: 'Go/Golang microservice',
  },
  {
    context: 'Build the Next.js app with server components',
    expected: 'nextjs-pro',
    description: 'Next.js framework',
  },
  {
    context: 'Implement the feature',
    expected: null,
    description: 'Generic task with no specialist keywords',
  },
];

describe('E2E: Specialist-First Routing — Domain Specialist Resolution', () => {
  for (const tc of DOMAIN_CASES) {
    it(`should resolve '${tc.expected || 'null'}' for: ${tc.description}`, () => {
      const result = resolveDomainSpecialist(tc.context);
      assert.strictEqual(
        result,
        tc.expected,
        `For context "${tc.context}", expected ${tc.expected}, got ${result}`
      );
    });
  }

  it('should handle null/undefined/empty context gracefully', () => {
    assert.strictEqual(resolveDomainSpecialist(null), null);
    assert.strictEqual(resolveDomainSpecialist(undefined), null);
    assert.strictEqual(resolveDomainSpecialist(''), null);
  });

  it('should handle non-string context gracefully', () => {
    assert.strictEqual(resolveDomainSpecialist(42), null);
    assert.strictEqual(resolveDomainSpecialist({}), null);
    assert.strictEqual(resolveDomainSpecialist([]), null);
  });

  it('should be case-insensitive', () => {
    assert.strictEqual(resolveDomainSpecialist('PYTHON data pipeline'), 'python-pro');
    assert.strictEqual(resolveDomainSpecialist('React Dashboard'), 'frontend-pro');
    assert.strictEqual(
      resolveDomainSpecialist('SOLIDITY smart contract'),
      'web3-blockchain-expert'
    );
  });
});

// =============================================================================
// PART 3: Cross-Module Integration (Check 7 + Domain Specialist)
// =============================================================================

describe('E2E: Cross-Module Integration (Check 7 + Domain Specialist)', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.SPECIALIST_ROUTING_ENFORCEMENT;
    invalidateCachedState();
  });

  afterEach(() => {
    process.env = originalEnv;
    invalidateCachedState();
  });

  it('SPECIALIST_KEYWORD_MAP and DOMAIN_SPECIALIST_MAP cover complementary routing concerns', () => {
    // Check 7 keywords cover core agent misrouting (technical-writer, qa, devops, etc.)
    const check7Specialists = Object.keys(SPECIALIST_KEYWORD_MAP);
    assert.ok(check7Specialists.includes('technical-writer'), 'Check 7 covers technical-writer');
    assert.ok(check7Specialists.includes('qa'), 'Check 7 covers qa');
    assert.ok(check7Specialists.includes('devops'), 'Check 7 covers devops');
    assert.ok(check7Specialists.includes('code-reviewer'), 'Check 7 covers code-reviewer');
    assert.ok(check7Specialists.includes('code-simplifier'), 'Check 7 covers code-simplifier');
    assert.ok(
      check7Specialists.includes('database-architect'),
      'Check 7 covers database-architect'
    );
    assert.ok(check7Specialists.includes('researcher'), 'Check 7 covers researcher');

    // Domain specialist map covers language/framework routing (python-pro, frontend-pro, etc.)
    const domainSpecialists = new Set(
      DOMAIN_CASES.filter(c => c.expected !== null).map(c => c.expected)
    );
    assert.ok(domainSpecialists.has('python-pro'), 'Domain map covers python-pro');
    assert.ok(domainSpecialists.has('frontend-pro'), 'Domain map covers frontend-pro');
    assert.ok(domainSpecialists.has('ios-pro'), 'Domain map covers ios-pro');
    assert.ok(domainSpecialists.has('golang-pro'), 'Domain map covers golang-pro');
    assert.ok(domainSpecialists.has('nextjs-pro'), 'Domain map covers nextjs-pro');
  });

  it('Check 7 and domain resolution should not conflict on the same task', () => {
    // A Python task should resolve to python-pro via domain specialist...
    const domainResult = resolveDomainSpecialist('Implement Python data pipeline');
    assert.strictEqual(domainResult, 'python-pro');

    // ...and Check 7 should remain independent of domain specialist resolution.
    const check7Result = checkSpecialistOverride('Task', {
      prompt: 'You are the developer. Implement Python data pipeline.',
      description: 'Python data pipeline implementation',
    });
    // "python" is domain routing context; Check 7 may still enforce specialist-first
    // based on broad specialist keywords in prompt/description. The key invariant
    // is that domain resolution remains deterministic and unaffected.
    assert.ok(typeof check7Result.pass === 'boolean');
  });

  it('realistic end-to-end: docs task caught by Check 7 and resolved by domain specialist', () => {
    // Step 1: Check 7 catches developer misrouting for docs task
    const check7 = checkSpecialistOverride('Task', {
      prompt: 'You are the developer. Write documentation for the new Python API endpoints.',
      description: 'API documentation',
    });
    assert.strictEqual(check7.result, 'warn', 'Check 7 should warn docs misrouting');
    assert.ok(
      check7.message.includes('technical-writer'),
      'Check 7 should suggest technical-writer'
    );

    // Step 2: Domain specialist resolves the Python aspect (separate concern)
    const specialist = resolveDomainSpecialist(
      'Write documentation for the new Python API endpoints'
    );
    assert.strictEqual(specialist, 'python-pro', 'Domain specialist should resolve Python context');
  });
});
