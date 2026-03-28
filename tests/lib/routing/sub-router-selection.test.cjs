#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSubRouterTaskPayload,
  resolveHierarchicalDispatch,
  selectSubRouterAgent,
  validateHierarchicalTaskContext,
} = require('../../../.claude/lib/routing/sub-router-selection.cjs');

const CANONICAL_CASES = [
  ['domain-router-web-frontend', 'Build a React dashboard component with Tailwind CSS.', 'frontend-pro'],
  ['domain-router-web-frontend', 'Migrate our Next.js app router page to use server components.', 'nextjs-pro'],
  ['domain-router-web-frontend', 'Fix our Angular standalone component and NgRx selector wiring.', 'angular-pro'],
  ['domain-router-web-frontend', 'Debug the SvelteKit load function for this route.', 'sveltekit-expert'],
  ['domain-router-web-frontend', 'Customize the WordPress Gutenberg block for our marketing site.', 'wordpress-master'],

  ['domain-router-backend', 'Implement a FastAPI service with Pydantic request validation.', 'fastapi-pro'],
  ['domain-router-backend', 'Fix the Django REST Framework viewset and manage.py command.', 'django-developer'],
  ['domain-router-backend', 'Add a Spring Boot controller and application.yml profile.', 'spring-boot-pro'],
  ['domain-router-backend', 'Refactor our NestJS module and Express middleware chain.', 'nodejs-pro'],
  ['domain-router-backend', 'Optimize this Rust service that uses Cargo workspaces.', 'rust-pro'],

  ['domain-router-mobile', 'Build an iOS SwiftUI settings screen in Xcode.', 'ios-pro'],
  ['domain-router-mobile', 'Fix the Android Jetpack Compose navigation graph.', 'android-pro'],
  ['domain-router-mobile', 'Add a new Expo React Native onboarding flow.', 'expo-mobile-developer'],

  ['domain-router-ai-ml', 'Design a RAG pipeline with LangChain and a vector store.', 'llm-architect'],
  ['domain-router-ai-ml', 'Optimize our few-shot system prompt for better answers.', 'prompt-engineer'],
  ['domain-router-ai-ml', 'Deploy the model with MLflow and a model registry.', 'mlops-engineer'],
  ['domain-router-ai-ml', 'Improve named entity recognition and tokenization for this NLP pipeline.', 'nlp-engineer'],

  ['domain-router-infra', 'Debug our Kubernetes Helm release in the cluster.', 'kubernetes-specialist'],
  ['domain-router-infra', 'Refactor the Terraform IaC module for this environment.', 'terraform-engineer'],
  ['domain-router-infra', 'Handle the PagerDuty outage mitigation plan for this service.', 'incident-responder'],

  ['domain-router-security', 'Run an OWASP penetration test for XSS and SQL injection.', 'penetration-tester'],
  ['domain-router-security', 'Profile latency regressions with a load test.', 'performance-engineer'],

  ['domain-router-arch-data', 'Design a GraphQL federation boundary for this API.', 'graphql-pro'],
  ['domain-router-product', 'Synthesize the user interview findings into research insights.', 'ux-researcher'],
  ['domain-router-niche', 'Audit the Solidity smart contract for this DeFi protocol.', 'web3-blockchain-expert'],
];

const AMBIGUOUS_CASES = [
  ['domain-router-web-frontend', 'Need help with a frontend feature.', 'frontend-pro'],
  ['domain-router-backend', 'Need help with a backend service.', 'typescript-pro'],
  ['domain-router-mobile', 'Need help with a mobile app feature.', 'expo-mobile-developer'],
  ['domain-router-ai-ml', 'Need help with an ML model.', 'ai-ml-specialist'],
  ['domain-router-infra', 'Need help with deployment automation.', 'devops'],
  ['domain-router-security', 'Need help with a security review.', 'security-architect'],
  ['domain-router-arch-data', 'Need help designing an API.', 'api-designer'],
  ['domain-router-product', 'Need help with product planning.', 'pm-coordinator'],
  ['domain-router-niche', 'Need help with a scientific prototype.', 'scientific-research-expert'],
];

describe('sub-router specialist selection', () => {
  for (const [subRouter, prompt, expectedAgent] of CANONICAL_CASES) {
    it(`${subRouter} selects ${expectedAgent} for canonical prompt`, () => {
      const result = selectSubRouterAgent(subRouter, prompt);

      assert.equal(result.agent, expectedAgent);
      assert.equal(result.defaulted, false);
      assert.equal(result.originalPrompt, prompt);
    });
  }

  for (const [subRouter, prompt, expectedAgent] of AMBIGUOUS_CASES) {
    it(`${subRouter} falls back to ${expectedAgent} for ambiguous prompt`, () => {
      const result = selectSubRouterAgent(subRouter, prompt);

      assert.equal(result.agent, expectedAgent);
      assert.equal(result.defaulted, true);
    });
  }

  it('buildSubRouterTaskPayload preserves the original prompt verbatim', () => {
    const prompt = '  Build a FastAPI service with audit logging.  ';
    const payload = buildSubRouterTaskPayload('domain-router-backend', prompt);

    assert.equal(payload.subagent_type, 'fastapi-pro');
    assert.equal(payload.description, prompt);
    assert.equal(payload.prompt, prompt);
  });

  it('resolveHierarchicalDispatch falls back to flat routing on sub-router failure', () => {
    const prompt = 'Implement a FastAPI service with Pydantic request validation.';
    const result = resolveHierarchicalDispatch({
      subRouterName: 'domain-router-backend',
      prompt,
      executor: () => {
        throw new Error('sub-router timeout');
      },
    });

    assert.equal(result.route, 'flat-fallback');
    assert.equal(result.agent, 'fastapi-pro');
    assert.equal(result.originalPrompt, prompt);
    assert.match(result.fallbackReason, /timeout/i);
  });

  it('validateHierarchicalTaskContext blocks sub-router to sub-router dispatch', () => {
    const previous = process.env.HIERARCHICAL_ROUTING;
    process.env.HIERARCHICAL_ROUTING = 'on';
    const result = validateHierarchicalTaskContext(
      { agent_id: 'domain-router-backend' },
      { subagent_type: 'domain-router-ai-ml' }
    );

    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /Circular sub-router dispatch blocked/i);

    if (previous === undefined) {
      delete process.env.HIERARCHICAL_ROUTING;
    } else {
      process.env.HIERARCHICAL_ROUTING = previous;
    }
  });
});
