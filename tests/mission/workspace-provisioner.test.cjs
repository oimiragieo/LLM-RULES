'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const {
  provisionWorkspace,
  WORKSPACE_VERSION,
  REQUIRED_SUBDIRS,
} = require('../../.claude/lib/mission/workspace-provisioner.cjs');

describe('Workspace Provisioner', () => {
  let tempRoot;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-provisioner-test-'));
  });

  after(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('VAL-MC-001: Fresh workspace creates required directory tree', () => {
    it('creates missions/<uuid>/ with all subdirectories', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });

      assert.ok(result.missionId, 'Should return missionId');
      assert.ok(result.workspacePath, 'Should return workspacePath');
      assert.ok(result.createdAt, 'Should return createdAt');

      for (const subdir of REQUIRED_SUBDIRS) {
        const subdirPath = path.join(result.workspacePath, subdir);
        assert.ok(fs.existsSync(subdirPath), `Subdirectory ${subdir} should exist`);
        assert.ok(fs.statSync(subdirPath).isDirectory(), `${subdir} should be a directory`);
      }
    });

    it('creates workspace with UUID-based directory name', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.match(result.missionId, uuidPattern, 'missionId should be a valid UUID');
      assert.strictEqual(path.basename(result.workspacePath), result.missionId);
    });
  });

  describe('VAL-MC-002: Manifest file written with correct schema', () => {
    it('manifest.json exists with {missionId, createdAt, version}', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const manifestPath = path.join(result.workspacePath, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.strictEqual(manifest.missionId, result.missionId);
      assert.strictEqual(manifest.createdAt, result.createdAt);
      assert.strictEqual(manifest.version, WORKSPACE_VERSION);
    });
  });

  describe('VAL-MC-003: Parent directory auto-creation', () => {
    it('creates parent directories recursively if missing', () => {
      const nestedPath = path.join(tempRoot, 'nested', 'deep', 'path');
      assert.ok(!fs.existsSync(nestedPath));

      const result = provisionWorkspace({ rootPath: nestedPath });
      assert.ok(fs.existsSync(result.workspacePath));

      fs.rmSync(path.join(tempRoot, 'nested'), { recursive: true, force: true });
    });
  });

  describe('VAL-MC-004: Duplicate workspace UUID is rejected', () => {
    it('rejects duplicate UUID with WORKSPACE_EXISTS error', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      assert.throws(
        () => provisionWorkspace({ rootPath: tempRoot, missionId: result.missionId }),
        err => {
          assert.strictEqual(err.code, 'WORKSPACE_EXISTS');
          return true;
        }
      );
    });
  });

  describe('VAL-MC-005: features.json scaffolded with empty array', () => {
    it('creates features.json with { features: [] }', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const featuresPath = path.join(result.workspacePath, 'features.json');
      assert.ok(fs.existsSync(featuresPath), 'features.json should exist');

      const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
      assert.deepStrictEqual(features, { features: [] });
    });
  });

  describe('VAL-MC-006: state.json has correct initial shape', () => {
    it('creates state.json with all required fields', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const statePath = path.join(result.workspacePath, 'state.json');
      assert.ok(fs.existsSync(statePath), 'state.json should exist');

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.missionId, result.missionId);
      assert.strictEqual(state.baseSessionId, result.missionId);
      assert.strictEqual(state.state, 'pending');
      assert.strictEqual(state.currentFeatureId, null);
      assert.strictEqual(state.currentWorkerSessionId, null);
      assert.deepStrictEqual(state.workerSessionIds, []);
      assert.strictEqual(state.completedFeatures, 0);
      assert.strictEqual(state.totalFeatures, 0);
      assert.deepStrictEqual(state.milestonesWithValidationPlanned, []);
      assert.ok(state.createdAt);
      assert.ok(state.updatedAt);
    });
  });

  describe('VAL-MC-007: validation-state.json has empty assertions', () => {
    it('creates validation-state.json with { assertions: {} }', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const valPath = path.join(result.workspacePath, 'validation-state.json');
      assert.ok(fs.existsSync(valPath));

      const valState = JSON.parse(fs.readFileSync(valPath, 'utf8'));
      assert.deepStrictEqual(valState, { assertions: {} });
    });
  });

  describe('VAL-MC-008: Template files created', () => {
    it('creates mission.md with provenance header', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const content = fs.readFileSync(path.join(result.workspacePath, 'mission.md'), 'utf8');
      assert.ok(content.includes('<!-- Agent: workspace-provisioner'));
      assert.ok(content.includes('## Objectives'));
      assert.ok(content.includes('## Milestones'));
    });

    it('creates AGENTS.md with guidelines template', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const content = fs.readFileSync(path.join(result.workspacePath, 'AGENTS.md'), 'utf8');
      assert.ok(content.includes('<!-- Agent: workspace-provisioner'));
      assert.ok(content.includes('## Mission Boundaries'));
      assert.ok(content.includes('## Coding Conventions'));
    });

    it('creates validation-contract.md with template', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const content = fs.readFileSync(
        path.join(result.workspacePath, 'validation-contract.md'),
        'utf8'
      );
      assert.ok(content.includes('# Validation Contract'));
      assert.ok(content.includes('VAL-AREA-NNN'));
    });
  });

  describe('VAL-MC-009: workingDirectory parameter flows correctly', () => {
    it('writes workingDirectory to state.json and working_directory.txt', () => {
      const wd = 'C:\\dev\\projects\\my-project';
      const result = provisionWorkspace({ rootPath: tempRoot, workingDirectory: wd });

      const state = JSON.parse(
        fs.readFileSync(path.join(result.workspacePath, 'state.json'), 'utf8')
      );
      assert.strictEqual(state.workingDirectory, wd);

      const wdTxt = fs.readFileSync(
        path.join(result.workspacePath, 'working_directory.txt'),
        'utf8'
      );
      assert.strictEqual(wdTxt, wd);
    });

    it('defaults workingDirectory to empty string when not provided', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const state = JSON.parse(
        fs.readFileSync(path.join(result.workspacePath, 'state.json'), 'utf8')
      );
      assert.strictEqual(state.workingDirectory, '');
    });
  });

  describe('VAL-MC-010: progress_log.jsonl exists and is empty', () => {
    it('creates empty progress_log.jsonl', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      const logPath = path.join(result.workspacePath, 'progress_log.jsonl');
      assert.ok(fs.existsSync(logPath));
      assert.strictEqual(fs.readFileSync(logPath, 'utf8'), '');
    });
  });

  describe('VAL-MC-011: evidence and verdicts directories exist', () => {
    it('creates evidence/ and verdicts/ directories', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      assert.ok(fs.statSync(path.join(result.workspacePath, 'evidence')).isDirectory());
      assert.ok(fs.statSync(path.join(result.workspacePath, 'verdicts')).isDirectory());
    });
  });

  describe('Return metadata', () => {
    it('returns {missionId, workspacePath, createdAt}', () => {
      const result = provisionWorkspace({ rootPath: tempRoot });
      assert.ok(typeof result.missionId === 'string');
      assert.ok(typeof result.workspacePath === 'string');
      assert.ok(!isNaN(new Date(result.createdAt).getTime()));
    });

    it('generates unique UUIDs on each call', () => {
      const r1 = provisionWorkspace({ rootPath: tempRoot });
      const r2 = provisionWorkspace({ rootPath: tempRoot });
      assert.notStrictEqual(r1.missionId, r2.missionId);
    });
  });
});
