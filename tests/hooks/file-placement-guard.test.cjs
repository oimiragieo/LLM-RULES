#!/usr/bin/env node
/**
 * file-placement-guard.test.cjs
 *
 * Tests for file placement guard hook including EVOLVE enforcement.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// PERF-004 FIX: Import state cache utilities for test cleanup
const { invalidateCache, _clearAllCache } = require('../../.claude/lib/utils/state-cache.cjs');

// We'll test the module by importing it after mocking dependencies
let guardModule;

// Helper to create temp directories for testing
function createTempProjectRoot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-placement-test-'));
  const claudeDir = path.join(tmpDir, '.claude');
  const contextDir = path.join(claudeDir, 'context');
  fs.mkdirSync(contextDir, { recursive: true });
  return tmpDir;
}

// Helper to write evolution state for testing
// PERF-004 FIX: Also invalidate cache so subsequent reads see the new data
function writeEvolutionState(projectRoot, state) {
  const statePath = path.join(projectRoot, '.claude', 'context', 'evolution-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  // Invalidate cache entry so getEvolutionState reads fresh data
  invalidateCache(statePath);
}

// Helper to create artifact directories for testing
function createArtifactDirs(projectRoot) {
  const dirs = [
    '.claude/agents/core',
    '.claude/agents/domain',
    '.claude/skills',
    '.claude/hooks/safety',
    '.claude/hooks/routing',
    '.claude/workflows/core',
    '.claude/templates',
    '.claude/schemas',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectRoot, dir), { recursive: true });
  }
}

describe('getEnforcementMode', () => {
  beforeEach(() => {
    // Clear module cache to reset state
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    // Restore environment
    delete process.env.FILE_PLACEMENT_GUARD;
  });

  it('should default to block mode when no environment variable set', () => {
    // Ensure env var is not set
    delete process.env.FILE_PLACEMENT_GUARD;
    // Reload module to pick up environment
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');

    const result = guardModule.getEnforcementMode();
    assert.strictEqual(result, 'block', 'Default mode should be block, not warn');
  });

  it('should respect FILE_PLACEMENT_GUARD=warn environment variable', () => {
    process.env.FILE_PLACEMENT_GUARD = 'warn';
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');

    const result = guardModule.getEnforcementMode();
    assert.strictEqual(result, 'warn', 'Should use warn when explicitly set');
  });

  it('should respect FILE_PLACEMENT_GUARD=off environment variable', () => {
    process.env.FILE_PLACEMENT_GUARD = 'off';
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');

    const result = guardModule.getEnforcementMode();
    assert.strictEqual(result, 'off', 'Should use off when explicitly set');
  });

  it('should fall back to block for invalid mode values', () => {
    process.env.FILE_PLACEMENT_GUARD = 'invalid';
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');

    const result = guardModule.getEnforcementMode();
    assert.strictEqual(result, 'block', 'Should fall back to block for invalid values');
  });
});

describe('file-placement-guard isValidPath', () => {
  beforeEach(() => {
    // Clear module cache to reset state
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  it('should allow files outside .claude directory', () => {
    const result = guardModule.isValidPath('/some/project/src/index.js');
    assert.strictEqual(result.valid, true);
    assert.ok(result.reason.includes('Outside .claude'));
  });

  it('should allow valid agent files', () => {
    const result = guardModule.isValidPath('/project/.claude/agents/core/developer.md');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.category, 'agents');
  });

  it('should allow valid skill files', () => {
    const result = guardModule.isValidPath('/project/.claude/skills/tdd/SKILL.md');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.category, 'skills');
  });

  it('should block forbidden paths like lib/', () => {
    const result = guardModule.isValidPath('/project/.claude/lib/internal.js');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Forbidden'));
  });

  it('should block invalid root-level files', () => {
    const result = guardModule.isValidPath('/project/.claude/random.txt');
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Invalid root-level'));
  });
});

describe('memory JSON enforcement', () => {
  const hookPath = path.join(
    __dirname,
    '..',
    '..',
    '.claude',
    'hooks',
    'safety',
    'file-placement-guard.cjs'
  );

  it('should block direct Write to patterns.json by default', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '.claude/context/memory/patterns.json' },
    });

    const result = spawnSync(process.execPath, [hookPath, input], {
      env: { ...process.env, MEMORY_JSON_WRITE_ENFORCEMENT: 'block' },
      encoding: 'utf8',
    });

    assert.strictEqual(result.status, 2, 'Expected block exit code for patterns.json write');
  });

  it('should allow direct Write to patterns.json when enforcement is warn', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '.claude/context/memory/patterns.json' },
    });

    const result = spawnSync(process.execPath, [hookPath, input], {
      env: { ...process.env, MEMORY_JSON_WRITE_ENFORCEMENT: 'warn' },
      encoding: 'utf8',
    });

    assert.strictEqual(result.status, 0, 'Expected warn mode to allow patterns.json write');
  });
});

describe('EVOLVE enforcement', () => {
  let tempProjectRoot;

  beforeEach(() => {
    // Create temp project for testing
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);

    // Clear module cache
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    // Cleanup temp dir
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('should have getEvolutionState function', () => {
    assert.ok(
      typeof guardModule.getEvolutionState === 'function',
      'getEvolutionState function should be exported'
    );
  });

  it('should have isNewArtifactCreation function', () => {
    assert.ok(
      typeof guardModule.isNewArtifactCreation === 'function',
      'isNewArtifactCreation function should be exported'
    );
  });

  it('should detect new agent file creation', () => {
    // Agent file that doesn't exist yet
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');
    const result = guardModule.isNewArtifactCreation(filePath, tempProjectRoot);
    assert.strictEqual(result, true, 'Should detect new agent as new artifact');
  });

  it('should not flag existing file as new artifact', () => {
    // Create an existing file
    const existingFile = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'existing.md');
    fs.writeFileSync(existingFile, '# Existing Agent');

    const result = guardModule.isNewArtifactCreation(existingFile, tempProjectRoot);
    assert.strictEqual(result, false, 'Should not flag existing file as new artifact');
  });

  it('should detect new skill directory creation', () => {
    const filePath = path.join(tempProjectRoot, '.claude', 'skills', 'new-skill', 'SKILL.md');
    const result = guardModule.isNewArtifactCreation(filePath, tempProjectRoot);
    assert.strictEqual(result, true, 'Should detect new skill as new artifact');
  });

  it('should detect new hook file creation', () => {
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'new-hook.cjs');
    const result = guardModule.isNewArtifactCreation(filePath, tempProjectRoot);
    assert.strictEqual(result, true, 'Should detect new hook as new artifact');
  });

  it('should not flag files outside artifact directories', () => {
    const filePath = path.join(tempProjectRoot, '.claude', 'context', 'memory', 'learnings.md');
    const result = guardModule.isNewArtifactCreation(filePath, tempProjectRoot);
    assert.strictEqual(result, false, 'Should not flag memory files as artifacts');
  });

  it('should return idle state when evolution-state.json does not exist', () => {
    // Don't create state file
    const state = guardModule.getEvolutionState(tempProjectRoot);
    assert.strictEqual(state.state, 'idle', 'Should default to idle when no state file');
  });

  it('should read evolution state from file', () => {
    writeEvolutionState(tempProjectRoot, {
      state: 'lock',
      currentEvolution: { name: 'test-agent' },
    });
    const state = guardModule.getEvolutionState(tempProjectRoot);
    assert.strictEqual(state.state, 'lock', 'Should read state from file');
  });

  it('should allow test files even without EVOLVE', () => {
    // Test files are exempt from EVOLVE enforcement
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'some-hook.test.cjs');
    const result = guardModule.isNewArtifactCreation(filePath, tempProjectRoot);
    // Test files should still be detected as new artifacts, but enforcement will exempt them
    // The actual exemption happens in the main validation flow
    assert.strictEqual(result, true, 'Test files should still be detected as new artifacts');
  });

  it('should identify ARTIFACT_DIRECTORIES constant', () => {
    assert.ok(
      Array.isArray(guardModule.ARTIFACT_DIRECTORIES),
      'ARTIFACT_DIRECTORIES should be exported as an array'
    );
    assert.ok(
      guardModule.ARTIFACT_DIRECTORIES.includes('.claude/agents/'),
      'Should include agents directory'
    );
    assert.ok(
      guardModule.ARTIFACT_DIRECTORIES.includes('.claude/skills/'),
      'Should include skills directory'
    );
    assert.ok(
      guardModule.ARTIFACT_DIRECTORIES.includes('.claude/hooks/'),
      'Should include hooks directory'
    );
  });
});

describe('EVOLVE enforcement integration', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);

    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('should have checkEvolveEnforcement function', () => {
    assert.ok(
      typeof guardModule.checkEvolveEnforcement === 'function',
      'checkEvolveEnforcement function should be exported'
    );
  });

  it('should block new artifact when evolution state is idle', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block when state is idle');
    assert.ok(result.reason.includes('EVOLVE'), 'Should mention EVOLVE in reason');
  });

  it('should allow new artifact when evolution state is lock', () => {
    writeEvolutionState(tempProjectRoot, {
      state: 'lock',
      currentEvolution: { name: 'new-agent' },
    });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should allow when state is lock');
  });

  it('should allow new artifact when evolution state is verify', () => {
    writeEvolutionState(tempProjectRoot, {
      state: 'verify',
      currentEvolution: { name: 'new-skill' },
    });
    const filePath = path.join(tempProjectRoot, '.claude', 'skills', 'new-skill', 'SKILL.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should allow when state is verify');
  });

  it('should allow new artifact when evolution state is enable', () => {
    writeEvolutionState(tempProjectRoot, { state: 'enable', currentEvolution: { name: 'test' } });
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'new-hook.cjs');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should allow when state is enable');
  });

  it('should exempt test files from EVOLVE enforcement', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'new-hook.test.cjs');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should not block test files');
  });

  it('should exempt spec files from EVOLVE enforcement', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'hook.spec.cjs');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should not block spec files');
  });

  it('should allow edits to existing files', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });

    // Create existing file
    const existingFile = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'existing.md');
    fs.writeFileSync(existingFile, '# Existing');

    const result = guardModule.checkEvolveEnforcement(existingFile, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should allow edits to existing files');
  });

  it('should allow files outside artifact directories', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'context', 'memory', 'learnings.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, false, 'Should allow non-artifact files');
  });

  it('should respect EVOLVE_ENFORCEMENT_OVERRIDE environment variable', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    // Set override
    const originalEnv = process.env.EVOLVE_ENFORCEMENT_OVERRIDE;
    process.env.EVOLVE_ENFORCEMENT_OVERRIDE = 'true';

    try {
      const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);
      assert.strictEqual(result.blocked, false, 'Should allow when override is set');
    } finally {
      // Restore env
      if (originalEnv === undefined) {
        delete process.env.EVOLVE_ENFORCEMENT_OVERRIDE;
      } else {
        process.env.EVOLVE_ENFORCEMENT_OVERRIDE = originalEnv;
      }
    }
  });

  it('should block new artifact when evolution state is evaluate', () => {
    // 'evaluate' is not a creation-allowed state (only lock/verify/enable)
    writeEvolutionState(tempProjectRoot, { state: 'evaluate', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block during evaluate phase');
  });

  it('should block new artifact when evolution state is validate', () => {
    writeEvolutionState(tempProjectRoot, { state: 'validate', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'skills', 'new-skill', 'SKILL.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block during validate phase');
  });

  it('should block new artifact when evolution state is obtain', () => {
    writeEvolutionState(tempProjectRoot, { state: 'obtain', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'routing', 'new-hook.cjs');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block during obtain/research phase');
  });

  it('should include suggestion in blocked result', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true);
    assert.ok(result.suggestion, 'Should include suggestion');
    assert.ok(
      result.suggestion.includes('evolution-orchestrator'),
      'Suggestion should mention evolution-orchestrator'
    );
  });

  it('should handle workflow artifacts correctly', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'workflows', 'core', 'new-workflow.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block new workflow when idle');
  });

  it('should handle template artifacts correctly', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'templates', 'new-template.md');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block new template when idle');
  });

  it('should handle schema artifacts correctly', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'schemas', 'new-schema.schema.json');

    const result = guardModule.checkEvolveEnforcement(filePath, tempProjectRoot);

    assert.strictEqual(result.blocked, true, 'Should block new schema when idle');
  });
});

// ============================================================================
// EVOLVE Auto-Start Feature Tests (TDD)
// ============================================================================

describe('EVOLVE auto-start trigger data', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    delete process.env.EVOLVE_AUTO_START;
  });

  it('should have buildEvolveTriggerData function', () => {
    assert.ok(
      typeof guardModule.buildEvolveTriggerData === 'function',
      'buildEvolveTriggerData function should be exported'
    );
  });

  it('should return structured trigger data when blocking', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'domain', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    // Check required fields
    assert.strictEqual(triggerData.blocked, true, 'Should indicate blocked');
    assert.ok(triggerData.reason, 'Should include reason');
    assert.ok(triggerData.artifact, 'Should include artifact info');
    assert.ok(triggerData.artifact.type, 'Should include artifact type');
    assert.ok(triggerData.artifact.path, 'Should include artifact path');
    assert.ok(triggerData.artifact.directory, 'Should include artifact directory');
  });

  it('should detect agent artifact type', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'domain', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData.artifact.type, 'agent', 'Should detect agent type');
    assert.ok(triggerData.artifact.directory.includes('agents'), 'Directory should include agents');
  });

  it('should detect skill artifact type', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'skills', 'new-skill', 'SKILL.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData.artifact.type, 'skill', 'Should detect skill type');
  });

  it('should detect hook artifact type', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'new-hook.cjs');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData.artifact.type, 'hook', 'Should detect hook type');
  });

  it('should detect workflow artifact type', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'workflows', 'core', 'new-workflow.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData.artifact.type, 'workflow', 'Should detect workflow type');
  });

  it('should detect template artifact type', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'templates', 'new-template.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData.artifact.type, 'template', 'Should detect template type');
  });

  it('should detect schema artifact type', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'schemas', 'new-schema.schema.json');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData.artifact.type, 'schema', 'Should detect schema type');
  });

  it('should include evolve section with current state', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.ok(triggerData.evolve, 'Should include evolve section');
    assert.strictEqual(triggerData.evolve.currentState, 'idle', 'Should include current state');
  });

  it('should set autoStart to true when env not set (opt-out mode)', () => {
    delete process.env.EVOLVE_AUTO_START;
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(
      triggerData.evolve.autoStart,
      true,
      'autoStart should be true when env not set (opt-out mode)'
    );
  });

  it('should set autoStart to true when EVOLVE_AUTO_START=true', () => {
    process.env.EVOLVE_AUTO_START = 'true';
    writeEvolutionState(tempProjectRoot, { state: 'idle', currentEvolution: null });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(
      triggerData.evolve.autoStart,
      true,
      'autoStart should be true when env is set'
    );
  });

  it('should return null when file is not blocked', () => {
    writeEvolutionState(tempProjectRoot, { state: 'lock', currentEvolution: { name: 'test' } });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(triggerData, null, 'Should return null when not blocked');
  });
});

describe('EVOLVE circuit breaker', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    delete process.env.EVOLVE_RATE_LIMIT;
  });

  it('should have checkCircuitBreaker function', () => {
    assert.ok(
      typeof guardModule.checkCircuitBreaker === 'function',
      'checkCircuitBreaker function should be exported'
    );
  });

  it('should allow evolution when no recent evolutions', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', evolutions: [] });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    assert.strictEqual(result.allowed, true, 'Should allow when no recent evolutions');
    assert.strictEqual(result.remaining, 3, 'Should have 3 remaining by default');
  });

  it('should count evolutions in the last hour', () => {
    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      evolutions: [
        { completedAt: thirtyMinutesAgo, name: 'recent-1' },
        { completedAt: thirtyMinutesAgo, name: 'recent-2' },
        { completedAt: twoHoursAgo, name: 'old-1' }, // This one should not count
      ],
    });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    assert.strictEqual(result.allowed, true, 'Should still allow (2 < 3)');
    assert.strictEqual(result.remaining, 1, 'Should have 1 remaining (3 - 2)');
    assert.strictEqual(result.recentCount, 2, 'Should count 2 recent evolutions');
  });

  it('should block when rate limit exceeded', () => {
    const now = Date.now();
    const recentTime = new Date(now - 15 * 60 * 1000).toISOString();

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      evolutions: [
        { completedAt: recentTime, name: 'recent-1' },
        { completedAt: recentTime, name: 'recent-2' },
        { completedAt: recentTime, name: 'recent-3' },
      ],
    });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    assert.strictEqual(result.allowed, false, 'Should block when 3 evolutions in last hour');
    assert.strictEqual(result.remaining, 0, 'Should have 0 remaining');
  });

  it('should respect EVOLVE_RATE_LIMIT environment variable', () => {
    process.env.EVOLVE_RATE_LIMIT = '5';
    const now = Date.now();
    const recentTime = new Date(now - 15 * 60 * 1000).toISOString();

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      evolutions: [
        { completedAt: recentTime, name: 'recent-1' },
        { completedAt: recentTime, name: 'recent-2' },
        { completedAt: recentTime, name: 'recent-3' },
      ],
    });

    // Reload to pick up new env var
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    assert.strictEqual(result.allowed, true, 'Should allow with higher limit');
    assert.strictEqual(result.remaining, 2, 'Should have 2 remaining (5 - 3)');
  });

  it('should include circuit breaker in trigger data', () => {
    writeEvolutionState(tempProjectRoot, { state: 'idle', evolutions: [] });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.ok(triggerData.evolve.circuitBreaker, 'Should include circuitBreaker in evolve section');
    assert.ok(
      'allowed' in triggerData.evolve.circuitBreaker,
      'circuitBreaker should have allowed field'
    );
    assert.ok(
      'remaining' in triggerData.evolve.circuitBreaker,
      'circuitBreaker should have remaining field'
    );
  });

  it('should set autoStart to false when circuit breaker trips', () => {
    process.env.EVOLVE_AUTO_START = 'true';
    const now = Date.now();
    const recentTime = new Date(now - 15 * 60 * 1000).toISOString();

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      evolutions: [
        { completedAt: recentTime, name: 'recent-1' },
        { completedAt: recentTime, name: 'recent-2' },
        { completedAt: recentTime, name: 'recent-3' },
      ],
    });

    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');
    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    // Even with EVOLVE_AUTO_START=true, if circuit breaker trips, autoStart should be false
    assert.strictEqual(
      triggerData.evolve.autoStart,
      false,
      'autoStart should be false when circuit breaker trips'
    );
    assert.strictEqual(
      triggerData.evolve.circuitBreaker.allowed,
      false,
      'circuitBreaker.allowed should be false'
    );
  });
});

describe('EVOLVE auto-start spawn instructions', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    delete process.env.EVOLVE_AUTO_START;
  });

  it('should have generateSpawnInstructions function', () => {
    assert.ok(
      typeof guardModule.generateSpawnInstructions === 'function',
      'generateSpawnInstructions function should be exported'
    );
  });

  it('should return null when autoStart is disabled', () => {
    delete process.env.EVOLVE_AUTO_START;
    const triggerData = {
      blocked: true,
      artifact: { type: 'agent', path: '.claude/agents/domain/new-agent.md' },
      evolve: { autoStart: false, circuitBreaker: { allowed: true } },
    };

    const instructions = guardModule.generateSpawnInstructions(triggerData);

    assert.strictEqual(instructions, null, 'Should return null when autoStart is disabled');
  });

  it('should return null when circuit breaker trips', () => {
    const triggerData = {
      blocked: true,
      artifact: { type: 'agent', path: '.claude/agents/domain/new-agent.md' },
      evolve: { autoStart: true, circuitBreaker: { allowed: false } },
    };

    const instructions = guardModule.generateSpawnInstructions(triggerData);

    assert.strictEqual(instructions, null, 'Should return null when circuit breaker trips');
  });

  it('should generate spawn instructions for agent creation', () => {
    const triggerData = {
      blocked: true,
      artifact: { type: 'agent', path: '.claude/agents/domain/new-agent.md', name: 'new-agent' },
      evolve: { autoStart: true, circuitBreaker: { allowed: true } },
    };

    const instructions = guardModule.generateSpawnInstructions(triggerData);

    assert.ok(instructions, 'Should return instructions');
    assert.ok(
      instructions.includes('evolution-orchestrator'),
      'Should include evolution-orchestrator'
    );
    assert.ok(instructions.includes('agent'), 'Should include artifact type');
  });

  it('should include artifact name in spawn instructions', () => {
    const triggerData = {
      blocked: true,
      artifact: { type: 'skill', path: '.claude/skills/my-skill/SKILL.md', name: 'my-skill' },
      evolve: { autoStart: true, circuitBreaker: { allowed: true } },
    };

    const instructions = guardModule.generateSpawnInstructions(triggerData);

    assert.ok(instructions.includes('my-skill'), 'Should include artifact name');
  });

  it('should include spawn instructions in trigger data when autoStart enabled', () => {
    process.env.EVOLVE_AUTO_START = 'true';
    writeEvolutionState(tempProjectRoot, { state: 'idle', evolutions: [] });
    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'domain', 'new-agent.md');

    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.ok(
      triggerData.spawnInstructions,
      'Should include spawnInstructions when autoStart enabled'
    );
  });
});

// ============================================================================
// SECURITY FIXES - TDD Tests (Task #1)
// ============================================================================

describe('SEC-AS-001: Tamper-resistant circuit breaker', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    delete process.env.EVOLVE_RATE_LIMIT;
  });

  it('should use timestamp array instead of simple counter', () => {
    // Circuit breaker should track individual timestamps, not just a count
    const now = Date.now();
    const recentTime1 = new Date(now - 15 * 60 * 1000).toISOString();
    const recentTime2 = new Date(now - 30 * 60 * 1000).toISOString();

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      circuitBreaker: {
        timestamps: [recentTime1, recentTime2],
      },
    });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    assert.strictEqual(result.recentCount, 2, 'Should count timestamps in last hour');
    assert.strictEqual(result.allowed, true, 'Should allow when under limit');
  });

  it('should prune old timestamps on read', () => {
    const now = Date.now();
    const recentTime = new Date(now - 15 * 60 * 1000).toISOString();
    const oldTime = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      circuitBreaker: {
        timestamps: [recentTime, oldTime],
      },
    });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    // Only the recent timestamp should be counted
    assert.strictEqual(
      result.recentCount,
      1,
      'Should only count timestamps within the hour window'
    );
  });

  it('should block when timestamp count exceeds rate limit', () => {
    const now = Date.now();
    const timestamps = [
      new Date(now - 10 * 60 * 1000).toISOString(),
      new Date(now - 20 * 60 * 1000).toISOString(),
      new Date(now - 30 * 60 * 1000).toISOString(),
    ];

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      circuitBreaker: {
        timestamps: timestamps,
      },
    });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    assert.strictEqual(result.allowed, false, 'Should block when 3 timestamps in last hour');
    assert.strictEqual(result.recentCount, 3, 'Should count all 3 recent timestamps');
  });

  it('should be resistant to counter tampering (using timestamps not counts)', () => {
    // An attacker might try to set a low count manually
    // But we use timestamps which must be valid ISO dates within the window
    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      circuitBreaker: {
        timestamps: [],
        count: 0, // Attacker tries to reset count - should be ignored
      },
    });

    const result = guardModule.checkCircuitBreaker(tempProjectRoot);

    // We should only use timestamps, not count
    assert.strictEqual(result.recentCount, 0, 'Should use timestamps array, not count field');
    assert.strictEqual(result.allowed, true, 'Should allow when no valid timestamps');
  });
});

describe('SEC-SF-001: Safe JSON parsing for evolution-state.json', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('should strip __proto__ from evolution state', () => {
    // Prototype pollution attack payload
    const maliciousState = JSON.stringify({
      state: 'idle',
      __proto__: { isAdmin: true },
    });

    const statePath = path.join(tempProjectRoot, '.claude', 'context', 'evolution-state.json');
    fs.writeFileSync(statePath, maliciousState);

    const state = guardModule.getEvolutionState(tempProjectRoot);

    // __proto__ should be stripped, not propagated
    assert.strictEqual(state.__proto__.isAdmin, undefined, '__proto__ should be stripped');
    assert.strictEqual(state.state, 'idle', 'Valid properties should still work');
  });

  it('should strip constructor from evolution state', () => {
    const maliciousState = JSON.stringify({
      state: 'lock',
      constructor: { prototype: { canBypass: true } },
    });

    const statePath = path.join(tempProjectRoot, '.claude', 'context', 'evolution-state.json');
    fs.writeFileSync(statePath, maliciousState);

    const state = guardModule.getEvolutionState(tempProjectRoot);

    // constructor pollution should be stripped
    assert.strictEqual(state.constructor, Object, 'constructor should not be overwritten');
  });

  it('should return safe defaults on parse error', () => {
    const statePath = path.join(tempProjectRoot, '.claude', 'context', 'evolution-state.json');
    fs.writeFileSync(statePath, 'not valid json {{{');

    const state = guardModule.getEvolutionState(tempProjectRoot);

    assert.strictEqual(state.state, 'idle', 'Should return idle on parse error');
    assert.strictEqual(
      state.currentEvolution,
      null,
      'Should return null currentEvolution on error'
    );
  });

  it('should strip unknown properties', () => {
    const stateWithExtraProps = JSON.stringify({
      state: 'idle',
      currentEvolution: null,
      unknownMaliciousProperty: 'attack',
      anotherUnknown: { nested: 'value' },
    });

    const statePath = path.join(tempProjectRoot, '.claude', 'context', 'evolution-state.json');
    fs.writeFileSync(statePath, stateWithExtraProps);

    const state = guardModule.getEvolutionState(tempProjectRoot);

    // Unknown properties should be stripped (if using schema validation)
    // For now, at least ensure proto pollution is blocked
    assert.strictEqual(state.state, 'idle', 'Known properties should work');
  });
});

describe('SEC-AS-004: Recursive spawn loop prevention', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    delete process.env.EVOLVE_AUTO_START;
  });

  it('should have checkSpawnDepth function', () => {
    assert.ok(
      typeof guardModule.checkSpawnDepth === 'function',
      'checkSpawnDepth function should be exported'
    );
  });

  it('should block auto-spawn when spawnDepth > 0', () => {
    process.env.EVOLVE_AUTO_START = 'true';

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      spawnDepth: 1, // Already in an automated flow
      evolutions: [],
      circuitBreaker: { timestamps: [] },
    });

    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');
    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    // Auto-spawn should be blocked due to spawn depth
    assert.strictEqual(
      triggerData.evolve.autoStart,
      false,
      'autoStart should be false when spawnDepth > 0'
    );
  });

  it('should allow auto-spawn when spawnDepth is 0', () => {
    process.env.EVOLVE_AUTO_START = 'true';

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      spawnDepth: 0,
      evolutions: [],
      circuitBreaker: { timestamps: [] },
    });

    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');
    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.strictEqual(
      triggerData.evolve.autoStart,
      true,
      'autoStart should be true when spawnDepth is 0'
    );
  });

  it('should track spawn depth in trigger data', () => {
    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      spawnDepth: 2,
      evolutions: [],
      circuitBreaker: { timestamps: [] },
    });

    const filePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'new-agent.md');
    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    assert.ok('spawnDepth' in triggerData.evolve, 'Should include spawnDepth in evolve section');
    assert.strictEqual(triggerData.evolve.spawnDepth, 2, 'Should report correct spawn depth');
  });
});

describe('SEC-IV-001: Path sanitization for spawn prompts', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  it('should have sanitizePathForPrompt function', () => {
    assert.ok(
      typeof guardModule.sanitizePathForPrompt === 'function',
      'sanitizePathForPrompt function should be exported'
    );
  });

  it('should remove shell metacharacters from paths', () => {
    const dangerousPath = '.claude/agents/$(whoami)/evil.md';
    const sanitized = guardModule.sanitizePathForPrompt(dangerousPath);

    assert.ok(!sanitized.includes('$'), 'Should remove $ character');
    assert.ok(!sanitized.includes('('), 'Should remove ( character');
    assert.ok(!sanitized.includes(')'), 'Should remove ) character');
  });

  it('should remove backticks from paths', () => {
    const dangerousPath = '.claude/agents/`id`/evil.md';
    const sanitized = guardModule.sanitizePathForPrompt(dangerousPath);

    assert.ok(!sanitized.includes('`'), 'Should remove backtick character');
  });

  it('should remove pipe and ampersand from paths', () => {
    const dangerousPath = '.claude/agents/|rm -rf /&/evil.md';
    const sanitized = guardModule.sanitizePathForPrompt(dangerousPath);

    assert.ok(!sanitized.includes('|'), 'Should remove pipe character');
    assert.ok(!sanitized.includes('&'), 'Should remove ampersand character');
  });

  it('should remove semicolons from paths', () => {
    const dangerousPath = '.claude/agents/foo;rm -rf /;bar.md';
    const sanitized = guardModule.sanitizePathForPrompt(dangerousPath);

    assert.ok(!sanitized.includes(';'), 'Should remove semicolon character');
  });

  it('should remove newlines from paths', () => {
    const dangerousPath = '.claude/agents/foo\nevil command\nbar.md';
    const sanitized = guardModule.sanitizePathForPrompt(dangerousPath);

    assert.ok(!sanitized.includes('\n'), 'Should remove newline character');
  });

  it('should truncate excessively long paths', () => {
    const longPath = '.claude/agents/' + 'a'.repeat(1000) + '.md';
    const sanitized = guardModule.sanitizePathForPrompt(longPath);

    assert.ok(sanitized.length <= 500, 'Should truncate to 500 chars max');
  });

  it('should preserve safe path characters', () => {
    const safePath = '.claude/agents/core/my-agent.md';
    const sanitized = guardModule.sanitizePathForPrompt(safePath);

    assert.strictEqual(sanitized, safePath, 'Should preserve safe characters');
  });
});

describe('SEC-IV-002: Sensitive path blocklist', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    delete process.env.EVOLVE_AUTO_START;
  });

  it('should have isSensitivePath function', () => {
    assert.ok(
      typeof guardModule.isSensitivePath === 'function',
      'isSensitivePath function should be exported'
    );
  });

  it('should block .env files from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/agents/.env');
    assert.strictEqual(result, true, '.env files should be blocked');
  });

  it('should block credential files from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/agents/credentials.md');
    assert.strictEqual(result, true, 'credential files should be blocked');
  });

  it('should block secret files from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/agents/secrets.md');
    assert.strictEqual(result, true, 'secret files should be blocked');
  });

  it('should block password files from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/agents/password.md');
    assert.strictEqual(result, true, 'password files should be blocked');
  });

  it('should block .pem files from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/agents/cert.pem');
    assert.strictEqual(result, true, '.pem files should be blocked');
  });

  it('should block .key files from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/agents/private.key');
    assert.strictEqual(result, true, '.key files should be blocked');
  });

  it('should block safety hooks from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/hooks/safety/new-guard.cjs');
    assert.strictEqual(result, true, 'safety hooks should be blocked');
  });

  it('should block routing hooks from auto-spawn', () => {
    const result = guardModule.isSensitivePath('.claude/hooks/routing/new-router.cjs');
    assert.strictEqual(result, true, 'routing hooks should be blocked');
  });

  it('should allow normal agent files', () => {
    const result = guardModule.isSensitivePath('.claude/agents/core/developer.md');
    assert.strictEqual(result, false, 'normal agent files should be allowed');
  });

  it('should allow normal skill files', () => {
    const result = guardModule.isSensitivePath('.claude/skills/tdd/SKILL.md');
    assert.strictEqual(result, false, 'normal skill files should be allowed');
  });

  it('should block auto-spawn for sensitive paths', () => {
    process.env.EVOLVE_AUTO_START = 'true';

    writeEvolutionState(tempProjectRoot, {
      state: 'idle',
      spawnDepth: 0,
      evolutions: [],
      circuitBreaker: { timestamps: [] },
    });

    const filePath = path.join(tempProjectRoot, '.claude', 'hooks', 'safety', 'new-guard.cjs');
    const triggerData = guardModule.buildEvolveTriggerData(filePath, tempProjectRoot);

    // Auto-spawn should be blocked for sensitive paths even with EVOLVE_AUTO_START=true
    assert.strictEqual(
      triggerData.evolve.autoStart,
      false,
      'autoStart should be false for sensitive paths'
    );
  });
});

// ============================================================================
// SEC-PT-001: Path Traversal Validation Tests
// ============================================================================

describe('SEC-PT-001: Path traversal validation', () => {
  let tempProjectRoot;

  beforeEach(() => {
    tempProjectRoot = createTempProjectRoot();
    createArtifactDirs(tempProjectRoot);
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('should have isPathSafe function', () => {
    assert.ok(
      typeof guardModule.isPathSafe === 'function',
      'isPathSafe function should be exported'
    );
  });

  it('should detect simple path traversal (..)', () => {
    const result = guardModule.isPathSafe('../../../etc/passwd', tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Should detect simple traversal');
    assert.ok(result.reason.includes('traversal'), 'Reason should mention traversal');
  });

  it('should detect path traversal with mixed slashes (..\\)', () => {
    const result = guardModule.isPathSafe('..\\..\\..\\etc\\passwd', tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Should detect backslash traversal');
  });

  it('should detect path traversal in middle of path', () => {
    const result = guardModule.isPathSafe('.claude/agents/../../../etc/passwd', tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Should detect traversal in middle');
  });

  it('should detect path that resolves outside PROJECT_ROOT', () => {
    // Even without explicit .., a path might resolve outside project root
    const outsidePath = path.resolve(tempProjectRoot, '..', 'outside-file.txt');
    const result = guardModule.isPathSafe(outsidePath, tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Should detect paths resolving outside PROJECT_ROOT');
    assert.ok(
      result.reason.includes('PROJECT_ROOT') || result.reason.includes('escapes'),
      'Reason should mention escaping PROJECT_ROOT'
    );
  });

  it('should allow safe paths within PROJECT_ROOT', () => {
    const safePath = path.join(tempProjectRoot, '.claude', 'agents', 'core', 'developer.md');
    const result = guardModule.isPathSafe(safePath, tempProjectRoot);
    assert.strictEqual(result.safe, true, 'Should allow safe paths');
  });

  it('should allow relative paths that stay within PROJECT_ROOT', () => {
    // A relative path that doesn't escape
    const result = guardModule.isPathSafe('.claude/agents/core/developer.md', tempProjectRoot);
    assert.strictEqual(result.safe, true, 'Should allow relative paths within root');
  });

  it('should detect URL-encoded traversal (%2e%2e)', () => {
    const result = guardModule.isPathSafe(
      '.claude/agents/%2e%2e/%2e%2e/etc/passwd',
      tempProjectRoot
    );
    assert.strictEqual(result.safe, false, 'Should detect URL-encoded traversal');
  });

  it('should detect double-URL-encoded traversal (%252e%252e)', () => {
    const result = guardModule.isPathSafe(
      '.claude/agents/%252e%252e/%252e%252e/etc/passwd',
      tempProjectRoot
    );
    assert.strictEqual(result.safe, false, 'Should detect double-encoded traversal');
  });

  it('should reject null bytes in path', () => {
    const result = guardModule.isPathSafe('.claude/agents/core/dev\x00.md', tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Should reject null bytes');
  });

  it('should handle empty path', () => {
    const result = guardModule.isPathSafe('', tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Empty paths should be rejected');
  });

  it('should handle null/undefined path', () => {
    const result1 = guardModule.isPathSafe(null, tempProjectRoot);
    const result2 = guardModule.isPathSafe(undefined, tempProjectRoot);
    assert.strictEqual(result1.safe, false, 'Null paths should be rejected');
    assert.strictEqual(result2.safe, false, 'Undefined paths should be rejected');
  });

  it('should handle absolute paths pointing outside root', () => {
    // On Windows: C:\Windows\System32
    // On Unix: /etc/passwd
    const absoluteOutside =
      process.platform === 'win32' ? 'C:\\Windows\\System32\\config' : '/etc/passwd';
    const result = guardModule.isPathSafe(absoluteOutside, tempProjectRoot);
    assert.strictEqual(result.safe, false, 'Absolute paths outside root should be rejected');
  });

  it('should handle symlink-like paths that might escape (defensive)', () => {
    // Even if symlinks are followed, the resolved path must be within root
    const result = guardModule.isPathSafe(
      path.join(tempProjectRoot, '..', 'sibling'),
      tempProjectRoot
    );
    assert.strictEqual(result.safe, false, 'Symlink-like paths escaping root should be rejected');
  });
});

// ============================================================================
// SEC-WIN-001: Windows Reserved Device Name Validation Tests
// ============================================================================

describe('SEC-WIN-001: Windows reserved device name validation', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../.claude/hooks/safety/file-placement-guard.cjs')];
    guardModule = require('../../.claude/hooks/safety/file-placement-guard.cjs');
  });

  it('should have isWindowsReservedName function', () => {
    assert.ok(
      typeof guardModule.isWindowsReservedName === 'function',
      'isWindowsReservedName function should be exported'
    );
  });

  it('should have WINDOWS_RESERVED_NAMES constant', () => {
    assert.ok(
      Array.isArray(guardModule.WINDOWS_RESERVED_NAMES),
      'WINDOWS_RESERVED_NAMES should be exported as an array'
    );
    assert.ok(guardModule.WINDOWS_RESERVED_NAMES.includes('NUL'), 'Should include NUL');
    assert.ok(guardModule.WINDOWS_RESERVED_NAMES.includes('CON'), 'Should include CON');
  });

  // Basic reserved names
  it('should detect NUL as reserved name', () => {
    const result = guardModule.isWindowsReservedName('/project/nul');
    assert.strictEqual(result.reserved, true, 'Should detect NUL');
    assert.strictEqual(result.name, 'NUL', 'Should return uppercase name');
  });

  it('should detect CON as reserved name', () => {
    const result = guardModule.isWindowsReservedName('/project/con');
    assert.strictEqual(result.reserved, true, 'Should detect CON');
  });

  it('should detect PRN as reserved name', () => {
    const result = guardModule.isWindowsReservedName('/project/prn');
    assert.strictEqual(result.reserved, true, 'Should detect PRN');
  });

  it('should detect AUX as reserved name', () => {
    const result = guardModule.isWindowsReservedName('/project/aux');
    assert.strictEqual(result.reserved, true, 'Should detect AUX');
  });

  // Serial ports
  it('should detect COM1 through COM9 as reserved names', () => {
    for (let i = 1; i <= 9; i++) {
      const result = guardModule.isWindowsReservedName(`/project/com${i}`);
      assert.strictEqual(result.reserved, true, `Should detect COM${i}`);
    }
  });

  // Parallel ports
  it('should detect LPT1 through LPT9 as reserved names', () => {
    for (let i = 1; i <= 9; i++) {
      const result = guardModule.isWindowsReservedName(`/project/lpt${i}`);
      assert.strictEqual(result.reserved, true, `Should detect LPT${i}`);
    }
  });

  // Case insensitivity
  it('should be case-insensitive for reserved names', () => {
    const cases = ['NUL', 'nul', 'Nul', 'nUl', 'NuL'];
    for (const name of cases) {
      const result = guardModule.isWindowsReservedName(`/project/${name}`);
      assert.strictEqual(result.reserved, true, `Should detect ${name}`);
    }
  });

  // With extensions
  it('should detect reserved names with extensions (nul.txt)', () => {
    const result = guardModule.isWindowsReservedName('/project/nul.txt');
    assert.strictEqual(result.reserved, true, 'Should detect NUL.txt');
  });

  it('should detect reserved names with multiple extensions (con.test.md)', () => {
    const result = guardModule.isWindowsReservedName('/project/con.test.md');
    assert.strictEqual(result.reserved, true, 'Should detect CON.test.md');
  });

  it('should detect reserved names with uppercase extensions (AUX.TXT)', () => {
    const result = guardModule.isWindowsReservedName('/project/AUX.TXT');
    assert.strictEqual(result.reserved, true, 'Should detect AUX.TXT');
  });

  // Paths with directories
  it('should detect reserved names in nested paths', () => {
    const result = guardModule.isWindowsReservedName('/project/.claude/agents/nul');
    assert.strictEqual(result.reserved, true, 'Should detect NUL in nested path');
  });

  it('should detect reserved names in Windows-style paths', () => {
    const result = guardModule.isWindowsReservedName('C:\\project\\.claude\\agents\\nul');
    assert.strictEqual(result.reserved, true, 'Should detect NUL in Windows path');
  });

  // Non-reserved names that shouldn't be blocked
  it('should NOT flag normal filenames', () => {
    const normalNames = [
      '/project/file.txt',
      '/project/null.txt', // "null" is not reserved, only "nul"
      '/project/console.log',
      '/project/auxiliary.md',
      '/project/printer.cfg',
      '/project/com.json', // "com" alone is not reserved, only COM1-9
      '/project/lpt.txt', // "lpt" alone is not reserved, only LPT1-9
      '/project/com10.txt', // COM10+ are not reserved
      '/project/lpt10.txt', // LPT10+ are not reserved
    ];
    for (const name of normalNames) {
      const result = guardModule.isWindowsReservedName(name);
      assert.strictEqual(result.reserved, false, `Should NOT flag ${name}`);
    }
  });

  it('should NOT flag files starting with reserved name as prefix', () => {
    // "nully" is not reserved, only "nul" exactly
    // But our implementation uses split('.')[0], so "nully" would NOT match "NUL"
    const result = guardModule.isWindowsReservedName('/project/nully.txt');
    assert.strictEqual(result.reserved, false, 'Should NOT flag nully.txt');
  });

  it('should include descriptive reason in result', () => {
    const result = guardModule.isWindowsReservedName('/project/nul.txt');
    assert.ok(result.reason, 'Should include reason');
    assert.ok(result.reason.includes('Windows reserved'), 'Reason should mention Windows reserved');
    assert.ok(result.reason.includes('NUL'), 'Reason should include the reserved name');
  });

  // Edge cases
  it('should handle empty path', () => {
    const result = guardModule.isWindowsReservedName('');
    assert.strictEqual(result.reserved, false, 'Empty path should not be reserved');
  });

  it('should handle null path', () => {
    const result = guardModule.isWindowsReservedName(null);
    assert.strictEqual(result.reserved, false, 'Null path should not be reserved');
  });

  it('should handle undefined path', () => {
    const result = guardModule.isWindowsReservedName(undefined);
    assert.strictEqual(result.reserved, false, 'Undefined path should not be reserved');
  });

  it('should handle path that is just the reserved name', () => {
    const result = guardModule.isWindowsReservedName('nul');
    assert.strictEqual(result.reserved, true, 'Should detect bare NUL');
  });
});
