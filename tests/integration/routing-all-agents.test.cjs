/**
 * Comprehensive 49-Agent Routing Test
 * ===================================
 *
 * Tests SPECIALIST_KEYWORD_MAP and DOMAIN_SPECIALIST_MAP coverage for ALL 49 agents.
 *
 * Test Categories:
 * 1. Specialist misrouting detection (Check 7) - ~40 agents
 * 2. Domain specialist resolution (phase-advance-reader) - ~25 agents
 * 3. Correct developer routing (no false positives) - ~5 agents
 */

const assert = require('assert');
const { test, beforeEach, afterEach } = require('node:test');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Load routing-guard module (Check 7 specialist keyword map)
const { checkSpecialistOverride, invalidateCachedState } = require(
  path.join(PROJECT_ROOT, '.claude/hooks/routing/routing-guard.cjs')
);

// Load phase-advance-reader module (domain specialist resolution)
const { resolveDomainSpecialist } = require(
  path.join(PROJECT_ROOT, '.claude/lib/workflow/phase-advance-reader.cjs')
);

// ====================================================================================
// Suite 1: Specialist Misrouting Detection (Check 7)
// ====================================================================================

test('Check 7: Specialist misrouting detection for all 49 agents', async (t) => {
  beforeEach(() => invalidateCachedState());
  afterEach(() => invalidateCachedState());

  const misroutingTests = [
    // Core agents (non-developer)
    { name: 'architect', prompt: 'You are the DEVELOPER agent. Design the system architecture for migrating to microservices.', expectedAgent: 'architect' },
    { name: 'planner', prompt: 'You are the DEVELOPER agent. Break down this epic into tasks.', expectedAgent: 'planner' },
    { name: 'pm', prompt: 'You are the DEVELOPER agent. Write user stories for the new checkout flow.', expectedAgent: 'pm' },

    // Review agents
    { name: 'code-reviewer', prompt: 'You are the DEVELOPER agent. Review the PR for auth changes.', expectedAgent: 'code-reviewer' },
    { name: 'code-simplifier', prompt: 'You are the DEVELOPER agent. Refactor the auth module for clarity.', expectedAgent: 'code-simplifier' },
    { name: 'security-architect', prompt: 'You are the DEVELOPER agent. Conduct a security audit of the payment flow.', expectedAgent: 'security-architect' },

    // Infrastructure agents
    { name: 'devops', prompt: 'You are the DEVELOPER agent. Deploy to production and set up the CI pipeline.', expectedAgent: 'devops' },
    { name: 'database-architect', prompt: 'You are the DEVELOPER agent. Design the database schema for the new module.', expectedAgent: 'database-architect' },
    { name: 'devops-troubleshooter', prompt: 'You are the DEVELOPER agent. Troubleshoot the API gateway performance issue.', expectedAgent: 'devops-troubleshooter' },
    { name: 'incident-responder', prompt: 'You are the DEVELOPER agent. Handle the production incident affecting checkout.', expectedAgent: 'incident-responder' },

    // Documentation/UX agents
    { name: 'technical-writer', prompt: 'You are the DEVELOPER agent. Update the API documentation for v2 endpoints.', expectedAgent: 'technical-writer' },
    { name: 'mobile-ux-reviewer', prompt: 'You are the DEVELOPER agent. Conduct a UX review of the mobile onboarding flow.', expectedAgent: 'mobile-ux-reviewer' },

    // Testing/QA
    { name: 'qa', prompt: 'You are the DEVELOPER agent. Write tests for the authentication module.', expectedAgent: 'qa' },

    // Research/Investigation
    { name: 'researcher', prompt: 'You are the DEVELOPER agent. Research options for state management libraries.', expectedAgent: 'researcher' },
    { name: 'reverse-engineer', prompt: 'You are the DEVELOPER agent. Reverse engineer the legacy authentication system.', expectedAgent: 'reverse-engineer' },

    // C4 diagram agents
    { name: 'c4-context', prompt: 'You are the DEVELOPER agent. Create a C4 context diagram for the microservices system.', expectedAgent: 'c4-context' },
    { name: 'c4-container', prompt: 'You are the DEVELOPER agent. Generate a C4 container diagram showing deployment architecture.', expectedAgent: 'c4-container' },
    { name: 'c4-component', prompt: 'You are the DEVELOPER agent. Create a C4 component diagram for the auth service.', expectedAgent: 'c4-component' },
    { name: 'c4-code', prompt: 'You are the DEVELOPER agent. Generate C4 code documentation for the API module.', expectedAgent: 'c4-code' },

    // Domain specialists (tested via Check 7 if they have specialist keywords)
    { name: 'data-engineer', prompt: 'You are the DEVELOPER agent. Build the data pipeline for analytics ingestion.', expectedAgent: 'data-engineer' },
    { name: 'ai-ml-specialist', prompt: 'You are the DEVELOPER agent. Train the recommendation model using PyTorch.', expectedAgent: 'ai-ml-specialist' },
    { name: 'web3-blockchain-expert', prompt: 'You are the DEVELOPER agent. Write the Solidity smart contract for token staking.', expectedAgent: 'web3-blockchain-expert' },
    { name: 'scientific-research-expert', prompt: 'You are the DEVELOPER agent. Implement the genomic analysis workflow for variant calling.', expectedAgent: 'scientific-research-expert' },
    { name: 'gamedev-pro', prompt: 'You are the DEVELOPER agent. Implement game physics for the Unity project.', expectedAgent: 'gamedev-pro' },
  ];

  for (const { name, prompt, expectedAgent } of misroutingTests) {
    await t.test(`Check 7: ${name} misrouting detection`, () => {
      const result = checkSpecialistOverride('Task', { prompt });

      assert.ok(result.message, `Expected warning for ${name} misrouting, but got none`);
      assert.ok(
        result.message.includes(expectedAgent) || result.message.toLowerCase().includes(name),
        `Expected warning to mention ${expectedAgent} or ${name}, but got: ${result.message}`
      );
    });
  }

  // Correct developer routing (should NOT warn)
  const correctDeveloperTests = [
    { name: 'bug fix', prompt: 'You are the DEVELOPER agent. Fix the null pointer in getUser().' },
    { name: 'feature implementation', prompt: 'You are the DEVELOPER agent. Implement the caching layer for API responses.' },
    { name: 'code implementation', prompt: 'You are the DEVELOPER agent. Implement the payment service using async/await patterns.' },
  ];

  for (const { name, prompt } of correctDeveloperTests) {
    await t.test(`Check 7: Developer routing correct - ${name}`, () => {
      const result = checkSpecialistOverride('Task', { prompt });
      assert.strictEqual(result.message, undefined, `Developer routing for "${name}" should not warn, but got: ${result.message}`);
    });
  }
});

// ====================================================================================
// Suite 2: Domain Specialist Resolution (phase-advance-reader)
// ====================================================================================

test('Domain specialist resolution for all technology specialists', async (t) => {
  const domainTests = [
    // Language specialists
    { context: 'Build a Python async data pipeline with asyncio', expected: 'python-pro' },
    { context: 'Create a Django REST API for user management', expected: 'python-pro' },
    { context: 'Build a FastAPI microservice with Pydantic', expected: 'fastapi-pro' },
    { context: 'Implement a TypeScript module with strict types', expected: 'typescript-pro' },
    { context: 'Create a Golang gRPC service with protobuf', expected: 'golang-pro' },
    { context: 'Build a Rust async runtime with Tokio', expected: 'rust-pro' },
    { context: 'Implement a Java Spring Boot application', expected: 'java-pro' },
    { context: 'Create a PHP Laravel API endpoint', expected: 'php-pro' },
    { context: 'Build a Node.js Express REST API', expected: 'nodejs-pro' },
    { context: 'Implement a NestJS microservice', expected: 'nodejs-pro' },

    // Framework specialists
    { context: 'Create a Next.js app with server components', expected: 'nextjs-pro' },
    { context: 'Build a React component with hooks', expected: 'frontend-pro' },
    { context: 'Implement a Vue 3 composition API component', expected: 'frontend-pro' },
    { context: 'Create a SvelteKit route with SSR', expected: 'sveltekit-expert' },
    { context: 'Build a GraphQL schema with resolvers', expected: 'graphql-pro' },

    // Mobile/Desktop specialists
    { context: 'Create an iOS SwiftUI view', expected: 'ios-pro' },
    { context: 'Build an Android Kotlin viewmodel', expected: 'android-pro' },
    { context: 'Implement a React Native Expo app', expected: 'expo-mobile-developer' },
    { context: 'Create a Tauri desktop application', expected: 'tauri-desktop-developer' },

    // Domain specialists
    { context: 'Train a PyTorch machine learning model', expected: 'ai-ml-specialist' },
    { context: 'Build an ETL data pipeline with Apache Spark', expected: 'data-engineer' },
    { context: 'Write a Solidity smart contract for DeFi', expected: 'web3-blockchain-expert' },
    { context: 'Implement a Unity game physics system', expected: 'gamedev-pro' },
    { context: 'Build a genomics analysis workflow', expected: 'scientific-research-expert' },

    // Edge cases
    { context: null, expected: null },
    { context: '', expected: null },
    { context: 'Generic implementation task', expected: null },
  ];

  for (const { context, expected } of domainTests) {
    await t.test(`Domain specialist: ${context?.slice(0, 40) || 'null/empty'}`, () => {
      const resolved = resolveDomainSpecialist(context);
      assert.strictEqual(resolved, expected, `Expected ${expected}, got ${resolved} for context: ${context}`);
    });
  }
});

// ====================================================================================
// Suite 3: Cross-Module Integration
// ====================================================================================

test('Cross-module integration: Check 7 and domain specialist coverage', async (t) => {
  await t.test('Check 7 and domain specialist cover complementary sets', () => {
    // Check 7 should catch core agent misrouting (qa, devops, technical-writer, etc.)
    // Domain specialist should resolve language/framework specialists (python-pro, frontend-pro, etc.)
    // Together they should cover most of the 49 agents

    const check7Result = checkSpecialistOverride('Task', { prompt: 'You are the DEVELOPER agent. Write tests for auth.' });
    const domainSpecialist = resolveDomainSpecialist('Build a Python API');

    assert.ok(check7Result.message, 'Check 7 should catch QA misrouting');
    assert.strictEqual(domainSpecialist, 'python-pro', 'Domain specialist should resolve python-pro');
  });

  await t.test('No conflicts between Check 7 and domain specialist', () => {
    // Verify that both can coexist without conflict
    const pythonPrompt = 'You are the DEVELOPER agent. Build a Python FastAPI service and write tests for it.';

    const check7Result = checkSpecialistOverride('Task', { prompt: pythonPrompt });
    const domainSpecialist = resolveDomainSpecialist(pythonPrompt);

    // This prompt should trigger both:
    // - Check 7 warns about QA (write tests)
    // - Domain specialist resolves to fastapi-pro (FastAPI)

    assert.ok(check7Result.message, 'Check 7 should warn about tests keyword');
    assert.strictEqual(domainSpecialist, 'fastapi-pro', 'Domain specialist should resolve fastapi-pro');
  });
});
