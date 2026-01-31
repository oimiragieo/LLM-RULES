const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs/promises');
const path = require('path');

// Module under test
const sessionAudit = require('../../../.claude/lib/session-audit.cjs');

const TEST_LOG_PATH = path.join(__dirname, '.test-audit.jsonl');

describe('Session Audit Logger', () => {
  before(async () => {
    // Clean up any existing test log
    try {
      await fs.unlink(TEST_LOG_PATH);
    } catch (_err) {
      // Ignore if file doesn't exist
    }
  });

  after(async () => {
    // Clean up test log
    try {
      await fs.unlink(TEST_LOG_PATH);
    } catch (_err) {
      // Ignore cleanup errors
    }
  });

  describe('logAgentSpawn', () => {
    it('should log agent spawn event', async () => {
      const sessionId = 'sess_test_spawn';
      const agentId = 'agent_abc12345_1706543210123';
      const agentType = 'developer';
      const context = { userMessage: 'Test message' };

      await sessionAudit.logAgentSpawn(sessionId, agentId, agentType, context, TEST_LOG_PATH);

      // Read log and verify entry
      const logContent = await fs.readFile(TEST_LOG_PATH, 'utf-8');
      const lines = logContent.trim().split('\n');

      assert.strictEqual(lines.length, 1);

      const entry = JSON.parse(lines[0]);
      assert.strictEqual(entry.sessionId, sessionId);
      assert.strictEqual(entry.event, 'SPAWN');
      assert.strictEqual(entry.agentId, agentId);
      assert.strictEqual(entry.agentType, agentType);
      assert.ok(entry.timestamp);
      assert.ok(entry.contextHash);
    });
  });

  describe('logAgentResponse', () => {
    it('should log agent response event', async () => {
      const sessionId = 'sess_test_response';
      const agentId = 'agent_def67890_1706543220456';
      const responseHash = 'abc123def456';

      await sessionAudit.logAgentResponse(sessionId, agentId, responseHash, TEST_LOG_PATH);

      // Read log
      const logContent = await fs.readFile(TEST_LOG_PATH, 'utf-8');
      const lines = logContent.trim().split('\n');

      // Find the response entry (skip spawn entry from previous test)
      const responseEntry = lines.map(line => JSON.parse(line)).find(e => e.event === 'RESPONSE');

      assert.ok(responseEntry);
      assert.strictEqual(responseEntry.sessionId, sessionId);
      assert.strictEqual(responseEntry.event, 'RESPONSE');
      assert.strictEqual(responseEntry.agentId, agentId);
      assert.strictEqual(responseEntry.responseHash, responseHash);
    });
  });

  describe('logAgentComplete', () => {
    it('should log agent completion event', async () => {
      const sessionId = 'sess_test_complete';
      const agentId = 'agent_ghi01234_1706543230789';
      const status = 'success';

      await sessionAudit.logAgentComplete(sessionId, agentId, status, TEST_LOG_PATH);

      // Read log
      const logContent = await fs.readFile(TEST_LOG_PATH, 'utf-8');
      const lines = logContent.trim().split('\n');

      // Find the complete entry
      const completeEntry = lines.map(line => JSON.parse(line)).find(e => e.event === 'COMPLETE');

      assert.ok(completeEntry);
      assert.strictEqual(completeEntry.sessionId, sessionId);
      assert.strictEqual(completeEntry.event, 'COMPLETE');
      assert.strictEqual(completeEntry.agentId, agentId);
      assert.strictEqual(completeEntry.status, status);
    });
  });

  describe('getSessionAudit', () => {
    it('should retrieve all audit entries for session', async () => {
      const sessionId = 'sess_test_retrieve';

      // Log multiple events
      await sessionAudit.logAgentSpawn(sessionId, 'agent_1', 'developer', {}, TEST_LOG_PATH);
      await sessionAudit.logAgentResponse(sessionId, 'agent_1', 'hash_1', TEST_LOG_PATH);
      await sessionAudit.logAgentComplete(sessionId, 'agent_1', 'success', TEST_LOG_PATH);

      // Retrieve audit
      const audit = await sessionAudit.getSessionAudit(sessionId, TEST_LOG_PATH);

      assert.strictEqual(audit.length, 3);
      assert.strictEqual(audit[0].event, 'SPAWN');
      assert.strictEqual(audit[1].event, 'RESPONSE');
      assert.strictEqual(audit[2].event, 'COMPLETE');
    });

    it('should return empty array for non-existent session', async () => {
      const audit = await sessionAudit.getSessionAudit('sess_nonexistent', TEST_LOG_PATH);
      assert.strictEqual(audit.length, 0);
    });
  });

  describe('verifyAuditIntegrity', () => {
    it('should verify append-only property', async () => {
      const sessionId = 'sess_test_integrity';

      // Log events
      await sessionAudit.logAgentSpawn(sessionId, 'agent_1', 'developer', {}, TEST_LOG_PATH);
      await sessionAudit.logAgentResponse(sessionId, 'agent_1', 'hash_1', TEST_LOG_PATH);

      const result = await sessionAudit.verifyAuditIntegrity(sessionId, TEST_LOG_PATH);

      assert.ok(result.intact);
      assert.strictEqual(result.issues.length, 0);
    });

    it('should detect missing session ID', async () => {
      const result = await sessionAudit.verifyAuditIntegrity('sess_missing', TEST_LOG_PATH);

      assert.ok(result.intact); // No entries = intact
      assert.strictEqual(result.issues.length, 0);
    });
  });

  describe('JSONL Format', () => {
    it('should write one JSON object per line', async () => {
      const sessionId = 'sess_test_format';

      await sessionAudit.logAgentSpawn(sessionId, 'agent_1', 'developer', {}, TEST_LOG_PATH);
      await sessionAudit.logAgentSpawn(sessionId, 'agent_2', 'architect', {}, TEST_LOG_PATH);

      const logContent = await fs.readFile(TEST_LOG_PATH, 'utf-8');
      const lines = logContent.trim().split('\n');

      // Each line should be valid JSON
      for (const line of lines) {
        const entry = JSON.parse(line); // Will throw if invalid JSON
        assert.ok(entry.timestamp);
        assert.ok(entry.sessionId);
        assert.ok(entry.event);
      }
    });
  });

  describe('Performance', () => {
    it('should write audit log entry in less than 2ms', async () => {
      const sessionId = 'sess_test_perf';
      const agentId = 'agent_perf_test';

      const start = process.hrtime.bigint();
      await sessionAudit.logAgentSpawn(sessionId, agentId, 'developer', {}, TEST_LOG_PATH);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 2, `Log write took ${durationMs}ms (target: <2ms)`);
    });

    it('should retrieve 100 audit entries in less than 50ms', async () => {
      const sessionId = 'sess_test_perf_retrieve';

      // Write 100 entries
      for (let i = 0; i < 100; i++) {
        await sessionAudit.logAgentSpawn(sessionId, `agent_${i}`, 'developer', {}, TEST_LOG_PATH);
      }

      // Retrieve
      const start = process.hrtime.bigint();
      const audit = await sessionAudit.getSessionAudit(sessionId, TEST_LOG_PATH);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(audit.length >= 100);
      assert.ok(durationMs < 50, `Retrieval took ${durationMs}ms (target: <50ms)`);
    });
  });
});
