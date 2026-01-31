const { describe, it, _before, _after } = require('node:test');
const assert = require('node:assert');
const _crypto = require('crypto');
const path = require('path');

// Module under test
const agentIdentity = require('../../../.claude/lib/agent-identity.cjs');

describe('Agent Identity Manager', () => {
  describe('generateAgentId', () => {
    it('should generate unique agent IDs with consistent format', () => {
      const agentType = 'developer';
      const spawnTime = Date.now();
      const sessionId = 'sess_abc123';

      const agentId = agentIdentity.generateAgentId(agentType, spawnTime, sessionId);

      // Format: "agent_<8-char-prefix>_<timestamp>"
      assert.match(agentId, /^agent_[a-f0-9]{8}_\d+$/);
    });

    it('should generate different IDs for different agents', () => {
      const spawnTime = Date.now();
      const sessionId = 'sess_abc123';

      const id1 = agentIdentity.generateAgentId('developer', spawnTime, sessionId);
      const id2 = agentIdentity.generateAgentId('architect', spawnTime, sessionId);

      assert.notStrictEqual(id1, id2);
    });

    it('should generate different IDs for different spawn times', () => {
      const agentType = 'developer';
      const sessionId = 'sess_abc123';

      const id1 = agentIdentity.generateAgentId(agentType, Date.now(), sessionId);
      const id2 = agentIdentity.generateAgentId(agentType, Date.now() + 1000, sessionId);

      assert.notStrictEqual(id1, id2);
    });

    it('should include random salt for collision resistance', () => {
      const agentType = 'developer';
      const spawnTime = Date.now();
      const sessionId = 'sess_abc123';

      const id1 = agentIdentity.generateAgentId(agentType, spawnTime, sessionId);
      const id2 = agentIdentity.generateAgentId(agentType, spawnTime, sessionId);

      // Same inputs should generate different IDs due to salt
      assert.notStrictEqual(id1, id2);
    });
  });

  describe('verifyAgentIdentity', () => {
    it('should validate agent ID format', () => {
      const validId = 'agent_abc12345_1706543210123';
      const result = agentIdentity.verifyAgentIdentity(validId, 'developer', 'sess_abc');

      assert.ok(result.valid);
      assert.strictEqual(result.agentType, 'developer');
      assert.strictEqual(typeof result.timestamp, 'number');
    });

    it('should reject invalid agent ID format', () => {
      const invalidId = 'invalid_id_format';
      const result = agentIdentity.verifyAgentIdentity(invalidId, 'developer', 'sess_abc');

      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    it('should reject agent ID with wrong prefix', () => {
      const wrongPrefixId = 'user_abc12345_1706543210123';
      const result = agentIdentity.verifyAgentIdentity(wrongPrefixId, 'developer', 'sess_abc');

      assert.strictEqual(result.valid, false);
      assert.match(result.error, /Invalid agent ID format/i);
    });
  });

  describe('getAgentMetadata', () => {
    it('should extract agent type from ID', () => {
      // Must generate ID first to populate metadata store
      const agentId = agentIdentity.generateAgentId('developer', Date.now(), 'sess_abc');
      const metadata = agentIdentity.getAgentMetadata(agentId);

      assert.strictEqual(metadata.type, 'developer');
      assert.strictEqual(typeof metadata.spawnedAt, 'number');
    });

    it('should extract spawn timestamp from ID', () => {
      const spawnTime = Date.now();
      const agentId = agentIdentity.generateAgentId('developer', spawnTime, 'sess_abc');
      const metadata = agentIdentity.getAgentMetadata(agentId);

      assert.strictEqual(metadata.spawnedAt, spawnTime);
    });

    it('should extract session ID from ID', () => {
      const sessionId = 'sess_xyz789';
      const agentId = agentIdentity.generateAgentId('developer', Date.now(), sessionId);
      const metadata = agentIdentity.getAgentMetadata(agentId);

      assert.strictEqual(metadata.sessionId, sessionId);
    });

    it('should return null for invalid agent ID', () => {
      const invalidId = 'invalid_id';
      const metadata = agentIdentity.getAgentMetadata(invalidId);

      assert.strictEqual(metadata, null);
    });
  });

  describe('Performance', () => {
    it('should generate agent ID in less than 1ms', () => {
      const start = process.hrtime.bigint();
      agentIdentity.generateAgentId('developer', Date.now(), 'sess_abc');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 1, `Generation took ${durationMs}ms (target: <1ms)`);
    });

    it('should verify agent identity in less than 1ms', () => {
      const agentId = 'agent_abc12345_1706543210123';
      const start = process.hrtime.bigint();
      agentIdentity.verifyAgentIdentity(agentId, 'developer', 'sess_abc');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 1, `Verification took ${durationMs}ms (target: <1ms)`);
    });
  });

  describe('Collision Resistance', () => {
    it('should generate 1000 unique agent IDs', () => {
      const ids = new Set();
      const agentType = 'developer';
      const sessionId = 'sess_abc123';

      for (let i = 0; i < 1000; i++) {
        const id = agentIdentity.generateAgentId(agentType, Date.now() + i, sessionId);
        ids.add(id);
      }

      assert.strictEqual(ids.size, 1000, 'All IDs should be unique');
    });
  });
});
