#!/usr/bin/env node
/**
 * Tests for error-pattern-detector.cjs
 * Phase 4.2 of error logging integration
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Tests for error-pattern-detector.cjs
describe('error-pattern-detector', () => {
  let detector;

  beforeEach(() => {
    // Clear module cache for fresh imports
    delete require.cache[require.resolve('./error-pattern-detector.cjs')];
    detector = require('../../.claude/lib/error-pattern-detector.cjs');
  });

  describe('detectRepeatedErrors', () => {
    it('should detect errors occurring more than threshold times', () => {
      const errors = [
        { errorId: 'ERR-001', message: 'npm test failed', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-002', message: 'npm test failed', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-003', message: 'npm test failed', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-004', message: 'npm test failed', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-005', message: 'different error', category: 'TOOL_FAILURE' },
      ];

      const repeated = detector.detectRepeatedErrors(errors, 3);

      assert.strictEqual(repeated.length, 1);
      assert.strictEqual(repeated[0].message, 'npm test failed');
      assert.strictEqual(repeated[0].count, 4);
    });

    it('should not flag errors below threshold', () => {
      const errors = [
        { errorId: 'ERR-001', message: 'error A', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-002', message: 'error A', category: 'TOOL_FAILURE' },
        { errorId: 'ERR-003', message: 'error B', category: 'TOOL_FAILURE' },
      ];

      const repeated = detector.detectRepeatedErrors(errors, 3);

      assert.strictEqual(repeated.length, 0);
    });

    it('should use default threshold of 3', () => {
      const errors = [
        { errorId: 'ERR-001', message: 'repeated error', category: 'HOOK_FAILURE' },
        { errorId: 'ERR-002', message: 'repeated error', category: 'HOOK_FAILURE' },
        { errorId: 'ERR-003', message: 'repeated error', category: 'HOOK_FAILURE' },
      ];

      const repeated = detector.detectRepeatedErrors(errors);

      assert.strictEqual(repeated.length, 1);
    });
  });

  describe('detectCascades', () => {
    it('should detect error chains within temporal window', () => {
      const now = Date.now();
      const errors = [
        {
          errorId: 'ERR-001',
          timestamp: new Date(now).toISOString(),
          category: 'MEMORY_ERROR',
          severity: 'CRITICAL',
        },
        {
          errorId: 'ERR-002',
          timestamp: new Date(now + 1000).toISOString(),
          category: 'EXECUTION_ERROR',
          severity: 'HIGH',
          correlation: { parentErrorId: 'ERR-001' },
        },
        {
          errorId: 'ERR-003',
          timestamp: new Date(now + 2000).toISOString(),
          category: 'TOOL_FAILURE',
          severity: 'MEDIUM',
          correlation: { parentErrorId: 'ERR-002' },
        },
      ];

      const cascades = detector.detectCascades(errors);

      assert.strictEqual(cascades.length, 1);
      assert.strictEqual(cascades[0].rootErrorId, 'ERR-001');
      assert.ok(cascades[0].childErrorIds.includes('ERR-002'));
      assert.ok(cascades[0].childErrorIds.includes('ERR-003'));
    });

    it('should detect cascades via temporal proximity', () => {
      const now = Date.now();
      const errors = [
        {
          errorId: 'ERR-001',
          timestamp: new Date(now).toISOString(),
          category: 'HOOK_FAILURE',
          severity: 'CRITICAL',
          context: { taskId: '42' },
        },
        {
          errorId: 'ERR-002',
          timestamp: new Date(now + 2000).toISOString(),
          category: 'TOOL_FAILURE',
          severity: 'HIGH',
          context: { taskId: '42' },
        },
      ];

      const cascades = detector.detectCascades(errors);

      assert.strictEqual(cascades.length, 1);
    });

    it('should not detect cascade for unrelated errors', () => {
      const now = Date.now();
      const errors = [
        {
          errorId: 'ERR-001',
          timestamp: new Date(now).toISOString(),
          category: 'TOOL_FAILURE',
          severity: 'LOW',
          context: { taskId: '42' },
        },
        {
          errorId: 'ERR-002',
          timestamp: new Date(now + 60000).toISOString(), // 60 seconds later
          category: 'VALIDATION_ERROR',
          severity: 'LOW',
          context: { taskId: '99' }, // different task
        },
      ];

      const cascades = detector.detectCascades(errors);

      assert.strictEqual(cascades.length, 0);
    });
  });

  describe('detectPatterns', () => {
    it('should detect all pattern types', () => {
      const now = Date.now();
      const errors = [
        {
          errorId: 'ERR-001',
          timestamp: new Date(now).toISOString(),
          message: 'npm test failed',
          category: 'TOOL_FAILURE',
          severity: 'MEDIUM',
          context: { agentName: 'developer' },
        },
        {
          errorId: 'ERR-002',
          timestamp: new Date(now).toISOString(),
          message: 'npm test failed',
          category: 'TOOL_FAILURE',
          severity: 'MEDIUM',
          context: { agentName: 'developer' },
        },
        {
          errorId: 'ERR-003',
          timestamp: new Date(now).toISOString(),
          message: 'npm test failed',
          category: 'TOOL_FAILURE',
          severity: 'MEDIUM',
          context: { agentName: 'developer' },
        },
        {
          errorId: 'ERR-004',
          timestamp: new Date(now).toISOString(),
          message: 'npm test failed',
          category: 'TOOL_FAILURE',
          severity: 'MEDIUM',
          context: { agentName: 'developer' },
        },
      ];

      const patterns = detector.detectPatterns(errors);

      assert.ok(patterns.repeatedErrors.length > 0);
    });
  });

  describe('scoreAgentHealth', () => {
    it('should return good health for agent with few errors', () => {
      const errors = [
        { context: { agentName: 'developer' }, severity: 'LOW' },
        { context: { agentName: 'developer' }, severity: 'LOW' },
      ];

      const score = detector.scoreAgentHealth('developer', errors);

      assert.ok(score >= 80);
    });

    it('should return poor health for agent with many errors', () => {
      const errors = Array(10)
        .fill(null)
        .map((_, i) => ({
          errorId: `ERR-${i}`,
          context: { agentName: 'buggy-agent' },
          severity: 'HIGH',
        }));

      const score = detector.scoreAgentHealth('buggy-agent', errors);

      assert.ok(score < 50);
    });

    it('should return 100 for agent with no errors', () => {
      const errors = [{ context: { agentName: 'other-agent' }, severity: 'LOW' }];

      const score = detector.scoreAgentHealth('good-agent', errors);

      assert.strictEqual(score, 100);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations for repeated errors', () => {
      const patterns = {
        repeatedErrors: [{ message: 'npm test failed', count: 5, category: 'TOOL_FAILURE' }],
        cascades: [],
        agentIssues: [],
        hookFailures: [],
        toolFailures: [],
        severityEscalations: [],
      };

      const recommendations = detector.generateRecommendations(patterns);

      assert.ok(recommendations.length > 0);
      assert.ok(recommendations[0].issue.includes('repeated'));
    });

    it('should generate recommendations for agent issues', () => {
      const patterns = {
        repeatedErrors: [],
        cascades: [],
        agentIssues: [{ agentName: 'developer', errorCount: 10 }],
        hookFailures: [],
        toolFailures: [],
        severityEscalations: [],
      };

      const recommendations = detector.generateRecommendations(patterns);

      assert.ok(recommendations.length > 0);
      assert.ok(recommendations[0].issue.includes('developer'));
    });

    it('should generate recommendations for cascades', () => {
      const patterns = {
        repeatedErrors: [],
        cascades: [{ rootErrorId: 'ERR-001', childErrorIds: ['ERR-002', 'ERR-003'] }],
        agentIssues: [],
        hookFailures: [],
        toolFailures: [],
        severityEscalations: [],
      };

      const recommendations = detector.generateRecommendations(patterns);

      assert.ok(recommendations.length > 0);
      assert.ok(recommendations[0].issue.includes('cascade'));
    });

    it('should return empty array for no patterns', () => {
      const patterns = {
        repeatedErrors: [],
        cascades: [],
        agentIssues: [],
        hookFailures: [],
        toolFailures: [],
        severityEscalations: [],
      };

      const recommendations = detector.generateRecommendations(patterns);

      assert.strictEqual(recommendations.length, 0);
    });
  });

  describe('detectHookFailures', () => {
    it('should detect hooks failing multiple times', () => {
      const errors = [
        { source: { location: 'routing-guard.cjs' }, category: 'HOOK_FAILURE' },
        { source: { location: 'routing-guard.cjs' }, category: 'HOOK_FAILURE' },
        { source: { location: 'routing-guard.cjs' }, category: 'HOOK_FAILURE' },
        { source: { location: 'other-hook.cjs' }, category: 'HOOK_FAILURE' },
      ];

      const hookFailures = detector.detectHookFailures(errors, 2);

      assert.strictEqual(hookFailures.length, 1);
      assert.strictEqual(hookFailures[0].hookName, 'routing-guard.cjs');
      assert.strictEqual(hookFailures[0].count, 3);
    });
  });

  describe('detectToolFailures', () => {
    it('should detect tools failing multiple times', () => {
      const errors = [
        { context: { toolName: 'Bash' }, category: 'TOOL_FAILURE' },
        { context: { toolName: 'Bash' }, category: 'TOOL_FAILURE' },
        { context: { toolName: 'Bash' }, category: 'TOOL_FAILURE' },
        { context: { toolName: 'Bash' }, category: 'TOOL_FAILURE' },
        { context: { toolName: 'Bash' }, category: 'TOOL_FAILURE' },
        { context: { toolName: 'Bash' }, category: 'TOOL_FAILURE' },
        { context: { toolName: 'Write' }, category: 'TOOL_FAILURE' },
      ];

      const toolFailures = detector.detectToolFailures(errors, 5);

      assert.strictEqual(toolFailures.length, 1);
      assert.strictEqual(toolFailures[0].toolName, 'Bash');
      assert.strictEqual(toolFailures[0].count, 6);
    });
  });

  describe('detectAgentIssues', () => {
    it('should detect agents with many errors', () => {
      const errors = Array(6)
        .fill(null)
        .map((_, i) => ({
          errorId: `ERR-${i}`,
          context: { agentName: 'problematic-agent' },
        }));

      const agentIssues = detector.detectAgentIssues(errors, 5);

      assert.strictEqual(agentIssues.length, 1);
      assert.strictEqual(agentIssues[0].agentName, 'problematic-agent');
      assert.strictEqual(agentIssues[0].errorCount, 6);
    });
  });
});
