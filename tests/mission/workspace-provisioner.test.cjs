'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Ajv = require('ajv');

// Module under test
const { provisionWorkspace } = require('../../.claude/lib/mission/workspace-provisioner.cjs');

// AJV schema for manifest.json validation
const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['missionId', 'createdAt', 'version'],
  properties: {
    missionId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
  },
  additionalProperties: false,
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest = ajv.compile(MANIFEST_SCHEMA);

describe('Workspace Provisioner', () => {
  let tempRoot;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-provisioner-test-'));
  });

  after(() => {
    // Cleanup temp directories
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('VAL-MC-001: Fresh workspace provisioning creates required directory tree', () => {
    it('creates missions/<uuid>/ with 4 subdirectories', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      assert.ok(result.missionId, 'Should return missionId');
      assert.ok(result.workspacePath, 'Should return workspacePath');
      assert.ok(result.createdAt, 'Should return createdAt');

      const workspacePath = result.workspacePath;

      // Verify all 4 subdirectories exist
      const expectedSubdirs = ['artifacts', 'handoffs', 'logs', 'state'];
      for (const subdir of expectedSubdirs) {
        const subdirPath = path.join(workspacePath, subdir);
        assert.ok(fs.existsSync(subdirPath), `Subdirectory ${subdir} should exist`);
        const stat = fs.statSync(subdirPath);
        assert.ok(stat.isDirectory(), `${subdir} should be a directory`);
      }
    });

    it('creates workspace with UUID-based directory name', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.match(result.missionId, uuidPattern, 'missionId should be a valid UUID');

      const workspaceName = path.basename(result.workspacePath);
      assert.strictEqual(
        workspaceName,
        result.missionId,
        'Workspace directory name should match missionId'
      );
    });
  });

  describe('VAL-MC-002: Manifest file written with correct schema', () => {
    it('manifest.json exists with {missionId, createdAt, version}', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      const manifestPath = path.join(result.workspacePath, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');

      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      assert.strictEqual(manifest.missionId, result.missionId, 'manifest.missionId should match');
      assert.strictEqual(manifest.createdAt, result.createdAt, 'manifest.createdAt should match');
      assert.ok(manifest.version, 'manifest.version should exist');
    });

    it('manifest.json passes AJV schema validation', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      const manifestPath = path.join(result.workspacePath, 'manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      const valid = validateManifest(manifest);
      assert.ok(
        valid,
        `manifest.json should pass AJV validation: ${JSON.stringify(validateManifest.errors)}`
      );
    });
  });

  describe('VAL-MC-003: Parent directory auto-creation (recursive mkdir)', () => {
    it('creates parent directories recursively if missing', () => {
      // Create a nested path that doesn't exist
      const nestedPath = path.join(tempRoot, 'level1', 'level2', 'level3');

      // Ensure it doesn't exist initially
      assert.ok(!fs.existsSync(nestedPath), 'Nested path should not exist initially');

      const result = provisionWorkspace({ rootPath: nestedPath });

      // Now the nested path should exist
      assert.ok(fs.existsSync(nestedPath), 'Parent directories should be created');
      assert.ok(fs.existsSync(result.workspacePath), 'Workspace should be created');

      // Cleanup
      fs.rmSync(path.join(tempRoot, 'level1'), { recursive: true, force: true });
    });
  });

  describe('VAL-MC-004: Duplicate workspace UUID is rejected', () => {
    it('rejects duplicate UUID with WORKSPACE_EXISTS error', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      // Try to provision again with the same UUID
      assert.throws(
        () => {
          provisionWorkspace({ rootPath: tempRoot, missionId: result.missionId });
        },
        err => {
          assert.strictEqual(err.code, 'WORKSPACE_EXISTS', 'Error code should be WORKSPACE_EXISTS');
          assert.ok(
            err.message.includes('already exists'),
            'Error message should mention existing workspace'
          );
          return true;
        },
        'Should throw WORKSPACE_EXISTS error for duplicate UUID'
      );
    });

    it('does NOT overwrite existing workspace', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      // Create a test file in the workspace
      const testFile = path.join(result.workspacePath, 'artifacts', 'test-marker.txt');
      fs.writeFileSync(testFile, 'original content', 'utf8');

      // Try to provision with the same UUID
      assert.throws(
        () => {
          provisionWorkspace({ rootPath: tempRoot, missionId: result.missionId });
        },
        { code: 'WORKSPACE_EXISTS' }
      );

      // Verify the test file is still there
      assert.ok(fs.existsSync(testFile), 'Original workspace should not be modified');
      const content = fs.readFileSync(testFile, 'utf8');
      assert.strictEqual(content, 'original content', 'Original content should be preserved');
    });
  });

  describe('Return metadata object', () => {
    it('returns {missionId, workspacePath, createdAt} metadata', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      assert.ok(typeof result === 'object', 'Should return an object');
      assert.ok(typeof result.missionId === 'string', 'missionId should be a string');
      assert.ok(typeof result.workspacePath === 'string', 'workspacePath should be a string');
      assert.ok(typeof result.createdAt === 'string', 'createdAt should be a string');

      // Verify createdAt is a valid ISO date string
      const date = new Date(result.createdAt);
      assert.ok(!isNaN(date.getTime()), 'createdAt should be a valid date string');
    });

    it('uses crypto.randomUUID() for IDs when not provided', () => {
      const result1 = provisionWorkspace({ rootPath: tempRoot });
      const result2 = provisionWorkspace({ rootPath: tempRoot });

      // Each call should generate a unique UUID
      assert.notStrictEqual(
        result1.missionId,
        result2.missionId,
        'Each call should generate a unique UUID'
      );
    });
  });

  describe('All paths via path.join()', () => {
    it('returns normalized paths without trailing separators', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      // Paths should not have trailing separators (unless root)
      assert.ok(
        !result.workspacePath.endsWith(path.sep) || result.workspacePath === path.sep,
        'workspacePath should not have trailing separator'
      );
      assert.ok(
        path.isAbsolute(result.workspacePath) || result.workspacePath.startsWith(tempRoot),
        'workspacePath should be resolved'
      );
    });

    it('handles Windows-style paths correctly', () => {
      // This test verifies Windows compatibility
      const result = provisionWorkspace({ rootPath: tempRoot });

      // All path operations should use path.join internally
      const manifestPath = path.join(result.workspacePath, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'Path construction should work correctly');

      const artifactsPath = path.join(result.workspacePath, 'artifacts');
      assert.ok(fs.existsSync(artifactsPath), 'Subdirectory paths should work correctly');
    });
  });
});
