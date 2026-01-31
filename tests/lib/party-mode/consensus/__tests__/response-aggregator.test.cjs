/**
 * Response Aggregator Tests
 * Tests response aggregation, key point extraction, agreement/disagreement identification
 */

const assert = require('node:assert');
const { describe, it, before } = require('node:test');

describe('Response Aggregator', () => {
  let aggregateResponses, extractKeyPoints, identifyAgreements, identifyDisagreements;

  before(async () => {
    const module = await import('../response-aggregator.cjs');
    aggregateResponses = module.aggregateResponses;
    extractKeyPoints = module.extractKeyPoints;
    identifyAgreements = module.identifyAgreements;
    identifyDisagreements = module.identifyDisagreements;
  });

  describe('extractKeyPoints', () => {
    it('should extract decisions from response', () => {
      const response = {
        content:
          'I recommend using PostgreSQL for this project. We should avoid MongoDB due to scalability concerns.',
        agentId: 'agent_abc123_1234567890',
        agentType: 'database-architect',
      };

      const keyPoints = extractKeyPoints(response);

      assert.ok(keyPoints.decisions.length > 0, 'Should extract decisions');
      assert.ok(
        keyPoints.decisions.some(d => d.includes('PostgreSQL')),
        'Should extract PostgreSQL decision'
      );
    });

    it('should extract concerns from response', () => {
      const response = {
        content:
          'However, I am concerned about the complexity of the authentication flow. This might introduce security risks.',
        agentId: 'agent_xyz789_1234567890',
        agentType: 'security-architect',
      };

      const keyPoints = extractKeyPoints(response);

      assert.ok(keyPoints.concerns.length > 0, 'Should extract concerns');
      assert.ok(
        keyPoints.concerns.some(c => c.includes('security')),
        'Should extract security concern'
      );
    });

    it('should extract action items from response', () => {
      const response = {
        content:
          'We need to write integration tests for the API. Also, update the documentation with the new endpoints.',
        agentId: 'agent_def456_1234567890',
        agentType: 'developer',
      };

      const keyPoints = extractKeyPoints(response);

      assert.ok(keyPoints.actionItems.length > 0, 'Should extract action items');
      assert.ok(
        keyPoints.actionItems.some(a => a.includes('tests')),
        'Should extract test action item'
      );
    });
  });

  describe('identifyAgreements', () => {
    it('should find common themes across responses', () => {
      const responses = [
        {
          agentId: 'agent_abc123_1234567890',
          agentType: 'developer',
          content: 'I agree we should use TypeScript for type safety.',
        },
        {
          agentId: 'agent_def456_1234567890',
          agentType: 'architect',
          content: 'TypeScript is the right choice here for better maintainability.',
        },
        {
          agentId: 'agent_ghi789_1234567890',
          agentType: 'qa',
          content: 'Yes, TypeScript will help catch bugs during development.',
        },
      ];

      const agreements = identifyAgreements(responses);

      assert.ok(agreements.length > 0, 'Should find agreements');
      const tsAgreement = agreements.find(a => a.theme.toLowerCase().includes('typescript'));
      assert.ok(tsAgreement, 'Should identify TypeScript agreement');
      assert.strictEqual(tsAgreement.agentIds.length, 3, 'Should include all 3 agents');
      assert.ok(
        tsAgreement.confidence >= 0.8,
        'Should have high confidence for unanimous agreement'
      );
    });

    it('should detect partial agreement (2 out of 3)', () => {
      const responses = [
        {
          agentId: 'agent_abc123_1234567890',
          agentType: 'developer',
          content: 'We should implement caching for performance.',
        },
        {
          agentId: 'agent_def456_1234567890',
          agentType: 'architect',
          content: 'Caching is a good idea to reduce database load. I support this.',
        },
        {
          agentId: 'agent_ghi789_1234567890',
          agentType: 'security-architect',
          content: 'I have concerns about the authentication approach.',
        },
      ];

      const agreements = identifyAgreements(responses);

      const cachingAgreement = agreements.find(a => a.theme.toLowerCase().includes('cach'));
      assert.ok(cachingAgreement, 'Should identify caching agreement');
      assert.strictEqual(cachingAgreement.agentIds.length, 2, 'Should include 2 agents');
      assert.ok(
        cachingAgreement.confidence >= 0.5 && cachingAgreement.confidence < 0.8,
        'Should have moderate confidence for partial agreement'
      );
    });
  });

  describe('identifyDisagreements', () => {
    it('should detect conflicting recommendations', () => {
      const responses = [
        {
          agentId: 'agent_abc123_1234567890',
          agentType: 'database-architect',
          content: 'I strongly recommend PostgreSQL for this use case due to its ACID compliance.',
        },
        {
          agentId: 'agent_def456_1234567890',
          agentType: 'developer',
          content: 'I disagree. MongoDB is better here because we need flexible schemas.',
        },
      ];

      const disagreements = identifyDisagreements(responses);

      assert.ok(disagreements.length > 0, 'Should detect disagreements');
      const dbDisagreement = disagreements.find(d => d.topic.toLowerCase().includes('database'));
      assert.ok(dbDisagreement, 'Should identify database disagreement');
      assert.strictEqual(dbDisagreement.positions.length, 2, 'Should have 2 positions');
    });

    it('should capture agent stances in disagreement', () => {
      const responses = [
        {
          agentId: 'agent_abc123_1234567890',
          agentType: 'security-architect',
          content: 'We must use JWT tokens for authentication. Session cookies are outdated.',
        },
        {
          agentId: 'agent_def456_1234567890',
          agentType: 'developer',
          content: 'I prefer session cookies for their simplicity and security.',
        },
      ];

      const disagreements = identifyDisagreements(responses);

      const authDisagreement = disagreements[0];
      assert.strictEqual(authDisagreement.positions.length, 2, 'Should have 2 positions');
      assert.ok(
        authDisagreement.positions.some(p => p.agentId === 'agent_abc123_1234567890'),
        'Should include security-architect position'
      );
      assert.ok(
        authDisagreement.positions.some(p => p.stance.includes('JWT')),
        'Should capture JWT stance'
      );
      assert.ok(
        authDisagreement.positions.some(p => p.stance.includes('session')),
        'Should capture session stance'
      );
    });
  });

  describe('aggregateResponses', () => {
    it('should aggregate responses from 3 agents', () => {
      const agentResponses = [
        {
          agentId: 'agent_abc123_1234567890',
          agentType: 'developer',
          response: 'I recommend using TypeScript and implementing comprehensive tests.',
          timestamp: Date.now(),
        },
        {
          agentId: 'agent_def456_1234567890',
          agentType: 'architect',
          response: 'TypeScript is a good choice. However, we need to consider the migration cost.',
          timestamp: Date.now(),
        },
        {
          agentId: 'agent_ghi789_1234567890',
          agentType: 'qa',
          response: 'I agree with TypeScript. Let me write the test plan.',
          timestamp: Date.now(),
        },
      ];

      const aggregated = aggregateResponses('session_123', 1, agentResponses);

      assert.strictEqual(aggregated.sessionId, 'session_123');
      assert.strictEqual(aggregated.round, 1);
      assert.ok(aggregated.agreements.length > 0, 'Should identify agreements');
      assert.ok(aggregated.summary, 'Should generate summary');
    });

    it('should include disagreements when detected', () => {
      const agentResponses = [
        {
          agentId: 'agent_abc123_1234567890',
          agentType: 'database-architect',
          response: 'PostgreSQL is the best choice for ACID compliance.',
          timestamp: Date.now(),
        },
        {
          agentId: 'agent_def456_1234567890',
          agentType: 'developer',
          response: 'I disagree. MongoDB offers better flexibility.',
          timestamp: Date.now(),
        },
      ];

      const aggregated = aggregateResponses('session_456', 2, agentResponses);

      assert.ok(aggregated.disagreements.length > 0, 'Should identify disagreements');
      assert.ok(
        aggregated.summary.includes('disagree') || aggregated.summary.includes('conflict'),
        'Summary should mention disagreement'
      );
    });
  });
});
