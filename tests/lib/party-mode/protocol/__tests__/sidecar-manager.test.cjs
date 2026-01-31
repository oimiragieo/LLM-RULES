/**
 * Sidecar Memory Manager Tests (TDD - RED phase)
 *
 * Tests for sidecar memory management (SEC-PM-006).
 * Each agent has isolated memory directory (sidecar).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs/promises');
const path = require('path');

describe('Sidecar Manager (SEC-PM-006)', () => {
  let sidecarManager;
  const TEST_SESSION_ID = 'test_session_001';
  const STAGING_PATH = path.join(process.cwd(), '.claude', 'staging', 'agents');

  before(async () => {
    // Will fail until we create sidecar-manager.cjs
    sidecarManager = require('../../../.claude/lib/sidecar-manager.cjs');
  });

  after(async () => {
    // Clean up test sidecars
    try {
      await fs.rm(path.join(STAGING_PATH, TEST_SESSION_ID), { recursive: true, force: true });
    } catch (_err) {
      // Ignore cleanup errors
    }
  });

  describe('createSidecar', () => {
    it('should create sidecar directory for agent', async () => {
      const result = await sidecarManager.createSidecar(TEST_SESSION_ID, 'agent_001', 'developer');

      assert.strictEqual(result.initialized, true);
      assert.ok(result.sidecarPath);
      assert.ok(result.sidecarPath.includes(TEST_SESSION_ID));
      assert.ok(result.sidecarPath.includes('agent_001'));

      // Verify directory exists
      const stats = await fs.stat(result.sidecarPath);
      assert.ok(stats.isDirectory());
    });

    it('should create default files in sidecar', async () => {
      const result = await sidecarManager.createSidecar(TEST_SESSION_ID, 'agent_002', 'architect');

      // Check for default files
      const discoveryPath = path.join(result.sidecarPath, 'discoveries.json');
      const keyFilesPath = path.join(result.sidecarPath, 'keyFiles.json');
      const notesPath = path.join(result.sidecarPath, 'notes.txt');

      const discoveryExists = await fs
        .access(discoveryPath)
        .then(() => true)
        .catch(() => false);
      const keyFilesExists = await fs
        .access(keyFilesPath)
        .then(() => true)
        .catch(() => false);
      const notesExists = await fs
        .access(notesPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(discoveryExists, 'discoveries.json should exist');
      assert.ok(keyFilesExists, 'keyFiles.json should exist');
      assert.ok(notesExists, 'notes.txt should exist');
    });

    it('should complete sidecar creation in <50ms (performance)', async () => {
      const start = process.hrtime.bigint();
      await sidecarManager.createSidecar(TEST_SESSION_ID, 'agent_perf', 'developer');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(
        durationMs < 50,
        `Sidecar creation took ${durationMs.toFixed(2)}ms (target: <50ms)`
      );
    });
  });

  describe('writeSidecar', () => {
    it('should write key-value to agent sidecar', async () => {
      const sessionId = 'write_test_session';
      await sidecarManager.createSidecar(sessionId, 'agent_003', 'developer');

      const result = await sidecarManager.writeSidecar(
        sessionId,
        'agent_003',
        'testKey',
        'testValue'
      );

      assert.strictEqual(result.written, true);
      assert.ok(result.path);
    });

    it('should fail if agent tries to write to non-existent sidecar', async () => {
      const result = await sidecarManager.writeSidecar('fake_session', 'agent_999', 'key', 'value');

      assert.strictEqual(result.written, false);
      assert.ok(result.error);
    });

    it('should complete write in <5ms (performance)', async () => {
      const sessionId = 'perf_write_session';
      await sidecarManager.createSidecar(sessionId, 'agent_004', 'developer');

      const start = process.hrtime.bigint();
      await sidecarManager.writeSidecar(sessionId, 'agent_004', 'perfKey', 'perfValue');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 5, `Sidecar write took ${durationMs.toFixed(2)}ms (target: <5ms)`);
    });
  });

  describe('readSidecar', () => {
    it('should read key-value from agent sidecar', async () => {
      const sessionId = 'read_test_session';
      await sidecarManager.createSidecar(sessionId, 'agent_005', 'developer');
      await sidecarManager.writeSidecar(sessionId, 'agent_005', 'myKey', 'myValue');

      const result = await sidecarManager.readSidecar(sessionId, 'agent_005', 'myKey');

      assert.strictEqual(result.value, 'myValue');
      assert.ok(result.timestamp);
    });

    it('should return null for non-existent key', async () => {
      const sessionId = 'read_test_session_2';
      await sidecarManager.createSidecar(sessionId, 'agent_006', 'developer');

      const result = await sidecarManager.readSidecar(sessionId, 'agent_006', 'nonExistentKey');

      assert.strictEqual(result.value, null);
    });

    it('should complete read in <10ms (performance)', async () => {
      const sessionId = 'perf_read_session';
      await sidecarManager.createSidecar(sessionId, 'agent_007', 'developer');
      await sidecarManager.writeSidecar(sessionId, 'agent_007', 'key', 'value');

      const start = process.hrtime.bigint();
      await sidecarManager.readSidecar(sessionId, 'agent_007', 'key');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 10, `Sidecar read took ${durationMs.toFixed(2)}ms (target: <10ms)`);
    });
  });

  describe('listSidecarKeys', () => {
    it('should list all keys in agent sidecar', async () => {
      const sessionId = 'list_test_session';
      await sidecarManager.createSidecar(sessionId, 'agent_008', 'developer');
      await sidecarManager.writeSidecar(sessionId, 'agent_008', 'key1', 'value1');
      await sidecarManager.writeSidecar(sessionId, 'agent_008', 'key2', 'value2');

      const keys = await sidecarManager.listSidecarKeys(sessionId, 'agent_008');

      assert.ok(Array.isArray(keys));
      assert.ok(keys.includes('key1'));
      assert.ok(keys.includes('key2'));
    });

    it('should return empty array for empty sidecar', async () => {
      const sessionId = 'list_empty_session';
      await sidecarManager.createSidecar(sessionId, 'agent_009', 'developer');

      const keys = await sidecarManager.listSidecarKeys(sessionId, 'agent_009');

      assert.ok(Array.isArray(keys));
      assert.strictEqual(keys.length, 0);
    });
  });

  describe('validateSidecarAccess', () => {
    it('should allow agent to access own sidecar', () => {
      const result = sidecarManager.validateSidecarAccess('agent_001', 'agent_001');

      assert.strictEqual(result.allowed, true);
    });

    it('should block agent from accessing other agent sidecar', () => {
      const result = sidecarManager.validateSidecarAccess('agent_001', 'agent_002');

      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason);
      assert.match(result.reason, /not allowed/i);
    });
  });

  describe('SEC-PM-006 Penetration Tests', () => {
    it('PEN-005: Should prevent sidecar reconnaissance (agent reads another sidecar)', async () => {
      const sessionId = 'pen_005_session';
      await sidecarManager.createSidecar(sessionId, 'agent_security', 'security-architect');
      await sidecarManager.writeSidecar(
        sessionId,
        'agent_security',
        'threatModel',
        'CONFIDENTIAL DATA'
      );

      // Developer agent tries to read security-architect's sidecar
      const result = await sidecarManager.readSidecar(sessionId, 'agent_developer', 'threatModel');

      // Should fail (non-existent sidecar or access denied)
      assert.strictEqual(result.value, null);
    });

    it('PEN-006: Should prevent sidecar poisoning (agent writes to another sidecar)', async () => {
      const sessionId = 'pen_006_session';
      await sidecarManager.createSidecar(sessionId, 'agent_target', 'architect');

      // Malicious agent tries to write to target's sidecar
      const result = await sidecarManager.writeSidecar(
        sessionId,
        'agent_malicious',
        'poisonKey',
        'MALICIOUS DATA'
      );

      // Should fail (write to non-existent sidecar)
      assert.strictEqual(result.written, false);
    });

    it('PEN-009: Should prevent path traversal in sidecar operations', async () => {
      const sessionId = 'pen_009_session';
      await sidecarManager.createSidecar(sessionId, 'agent_attacker', 'developer');

      // Try path traversal attack
      const result = await sidecarManager.writeSidecar(
        sessionId,
        'agent_attacker',
        '../../../etc/passwd',
        'attack'
      );

      // Should fail (path validation)
      assert.strictEqual(result.written, false);
      assert.match(result.error, /path/i);
    });
  });
});
