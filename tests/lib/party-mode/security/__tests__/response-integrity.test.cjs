const { describe, it } = require('node:test');
const assert = require('node:assert');

// Module under test
const responseIntegrity = require('../../../.claude/lib/response-integrity.cjs');

describe('Response Integrity Validator', () => {
  describe('initializeChain', () => {
    it('should create genesis block for response chain', () => {
      const sessionId = 'sess_abc123';
      const genesis = responseIntegrity.initializeChain(sessionId);

      assert.strictEqual(genesis.sessionId, sessionId);
      assert.ok(genesis.genesisHash);
      assert.ok(genesis.timestamp);
      assert.match(genesis.genesisHash, /^[a-f0-9]{16}$/); // 16 hex chars
    });

    it('should generate unique genesis hashes for different sessions', () => {
      const genesis1 = responseIntegrity.initializeChain('sess_abc');
      const genesis2 = responseIntegrity.initializeChain('sess_xyz');

      assert.notStrictEqual(genesis1.genesisHash, genesis2.genesisHash);
    });
  });

  describe('appendResponse', () => {
    it('should append response to hash chain', () => {
      const agentId = 'agent_abc12345_1706543210123';
      const response = { content: 'Test response content' };
      const previousHash = '0'; // Genesis

      const result = responseIntegrity.appendResponse(agentId, response, previousHash);

      assert.ok(result.responseHash);
      assert.strictEqual(result.agentId, agentId);
      assert.ok(result.timestamp);
      assert.strictEqual(result.previousHash, previousHash);
    });

    it('should generate different hashes for different responses', () => {
      const agentId = 'agent_abc12345_1706543210123';
      const previousHash = '0';

      const result1 = responseIntegrity.appendResponse(
        agentId,
        { content: 'Response 1' },
        previousHash
      );
      const result2 = responseIntegrity.appendResponse(
        agentId,
        { content: 'Response 2' },
        previousHash
      );

      assert.notStrictEqual(result1.responseHash, result2.responseHash);
    });

    it('should chain responses via previousHash', () => {
      const agentId1 = 'agent_abc12345_1706543210123';
      const agentId2 = 'agent_def67890_1706543220456';

      const response1 = responseIntegrity.appendResponse(
        agentId1,
        { content: 'First response' },
        '0'
      );
      const response2 = responseIntegrity.appendResponse(
        agentId2,
        { content: 'Second response' },
        response1.responseHash
      );

      assert.strictEqual(response2.previousHash, response1.responseHash);
      assert.notStrictEqual(response2.responseHash, response1.responseHash);
    });
  });

  describe('verifyChain', () => {
    it('should validate intact response chain', () => {
      const _chain = [
        {
          agentId: 'agent_abc_123',
          content: 'Response 1',
          hash: 'abc123',
          previousHash: '0',
          timestamp: new Date().toISOString(),
        },
        {
          agentId: 'agent_def_456',
          content: 'Response 2',
          hash: 'def456',
          previousHash: 'abc123',
          timestamp: new Date().toISOString(),
        },
      ];

      // Build proper chain
      const response1 = responseIntegrity.appendResponse(
        'agent_abc_123',
        { content: 'Response 1' },
        '0'
      );
      const response2 = responseIntegrity.appendResponse(
        'agent_def_456',
        { content: 'Response 2' },
        response1.responseHash
      );
      const validChain = [response1, response2];

      const result = responseIntegrity.verifyChain(validChain);

      assert.ok(result.valid);
      assert.strictEqual(result.brokenAtIndex, null);
    });

    it('should detect tampered response content', () => {
      // Build chain
      const response1 = responseIntegrity.appendResponse(
        'agent_abc_123',
        { content: 'Original response' },
        '0'
      );
      const response2 = responseIntegrity.appendResponse(
        'agent_def_456',
        { content: 'Second response' },
        response1.responseHash
      );

      // Tamper with first response
      const tamperedChain = [
        { ...response1, content: 'Tampered content' }, // Modified content but same hash
        response2,
      ];

      const result = responseIntegrity.verifyChain(tamperedChain);

      assert.strictEqual(result.valid, false);
      assert.ok(result.brokenAtIndex !== null);
    });

    it('should detect broken chain links', () => {
      const response1 = responseIntegrity.appendResponse(
        'agent_abc_123',
        { content: 'Response 1' },
        '0'
      );
      const response2 = responseIntegrity.appendResponse(
        'agent_def_456',
        { content: 'Response 2' },
        response1.responseHash
      );
      const response3 = responseIntegrity.appendResponse(
        'agent_ghi_789',
        { content: 'Response 3' },
        response2.responseHash
      );

      // Break chain by skipping response2
      const brokenChain = [response1, response3];

      const result = responseIntegrity.verifyChain(brokenChain);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.brokenAtIndex, 1); // Breaks at response3
    });
  });

  describe('detectTampering', () => {
    it('should detect no tampering when hash matches', () => {
      const response = { content: 'Test response' };
      const result = responseIntegrity.appendResponse('agent_abc_123', response, '0');

      // Pass the full result object with all fields for proper hash calculation
      const detection = responseIntegrity.detectTampering(result.responseHash, result);

      assert.strictEqual(detection.tampered, false);
      assert.strictEqual(detection.expectedHash, result.responseHash);
    });

    it('should detect tampering when content modified', () => {
      const originalResponse = { content: 'Original content' };
      const result = responseIntegrity.appendResponse('agent_abc_123', originalResponse, '0');

      const modifiedResponse = { content: 'Modified content' };
      const detection = responseIntegrity.detectTampering(result.responseHash, modifiedResponse);

      assert.strictEqual(detection.tampered, true);
      assert.notStrictEqual(detection.actualHash, detection.expectedHash);
    });
  });

  describe('Performance', () => {
    it('should append response in less than 2ms', () => {
      const agentId = 'agent_abc12345_1706543210123';
      const response = { content: 'Performance test response' };
      const previousHash = '0';

      const start = process.hrtime.bigint();
      responseIntegrity.appendResponse(agentId, response, previousHash);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 2, `Append took ${durationMs}ms (target: <2ms)`);
    });

    it('should verify chain of 10 responses in less than 10ms', () => {
      // Build chain of 10 responses
      const chain = [];
      let previousHash = '0';

      for (let i = 0; i < 10; i++) {
        const response = responseIntegrity.appendResponse(
          `agent_${i}`,
          { content: `Response ${i}` },
          previousHash
        );
        chain.push(response);
        previousHash = response.responseHash;
      }

      const start = process.hrtime.bigint();
      responseIntegrity.verifyChain(chain);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 10, `Verification took ${durationMs}ms (target: <10ms)`);
    });
  });
});
