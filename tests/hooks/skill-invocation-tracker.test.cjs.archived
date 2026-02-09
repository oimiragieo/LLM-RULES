#!/usr/bin/env node
/**
 * Tests for skill-invocation-tracker.cjs
 *
 * Run with: node --test .claude/hooks/routing/skill-invocation-tracker.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Import the module under test
const tracker = require('../../.claude/hooks/routing/skill-invocation-tracker.cjs');

describe('skill-invocation-tracker.cjs', () => {
  const testStateFile = path.join(tracker.PROJECT_ROOT, tracker.ACTIVE_CREATORS_STATE_FILE);
  const testStateDir = path.dirname(testStateFile);
  let originalState = null;

  beforeEach(() => {
    // Save original state if exists
    if (fs.existsSync(testStateFile)) {
      originalState = fs.readFileSync(testStateFile, 'utf8');
    }
    // Clean up for test isolation
    if (fs.existsSync(testStateFile)) {
      fs.unlinkSync(testStateFile);
    }
  });

  afterEach(() => {
    // Restore original state
    try {
      if (originalState) {
        fs.writeFileSync(testStateFile, originalState);
      } else if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
      }
    } catch (_e) {
      // Ignore
    }
    originalState = null;
  });

  describe('extractSkillName()', () => {
    it('should extract skill name from skill parameter', () => {
      const result = tracker.extractSkillName({ skill: 'skill-creator' });
      assert.strictEqual(result, 'skill-creator');
    });

    it('should extract skill name from name parameter', () => {
      const result = tracker.extractSkillName({ name: 'tdd' });
      assert.strictEqual(result, 'tdd');
    });

    it('should prefer skill over name', () => {
      const result = tracker.extractSkillName({ skill: 'skill-creator', name: 'other' });
      assert.strictEqual(result, 'skill-creator');
    });

    it('should return null for empty input', () => {
      assert.strictEqual(tracker.extractSkillName({}), null);
      assert.strictEqual(tracker.extractSkillName(null), null);
      assert.strictEqual(tracker.extractSkillName(undefined), null);
    });
  });

  describe('markCreatorActive()', () => {
    it('should create state file with correct structure for skill-creator', () => {
      const result = tracker.markCreatorActive('skill-creator');
      assert.strictEqual(result, true);
      assert.strictEqual(fs.existsSync(testStateFile), true);

      const state = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
      assert.ok(state['skill-creator']);
      assert.strictEqual(state['skill-creator'].active, true);
      assert.ok(state['skill-creator'].invokedAt);
      assert.strictEqual(state['skill-creator'].ttl, tracker.DEFAULT_TTL_MS);
    });

    it('should create state file with correct structure for agent-creator', () => {
      const result = tracker.markCreatorActive('agent-creator');
      assert.strictEqual(result, true);

      const state = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
      assert.ok(state['agent-creator']);
      assert.strictEqual(state['agent-creator'].active, true);
    });

    it('should preserve existing creators when marking new one active', () => {
      // Mark skill-creator active first
      tracker.markCreatorActive('skill-creator');

      // Then mark agent-creator active
      tracker.markCreatorActive('agent-creator');

      const state = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
      assert.ok(state['skill-creator']);
      assert.ok(state['agent-creator']);
      assert.strictEqual(state['skill-creator'].active, true);
      assert.strictEqual(state['agent-creator'].active, true);
    });

    it('should create runtime directory if it does not exist', () => {
      // Remove the state file if it exists
      if (fs.existsSync(testStateFile)) {
        fs.unlinkSync(testStateFile);
      }

      const result = tracker.markCreatorActive('skill-creator');
      assert.strictEqual(result, true);
      assert.strictEqual(fs.existsSync(testStateDir), true);
    });

    it('should include artifactName as null in state', () => {
      tracker.markCreatorActive('skill-creator');
      const state = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
      assert.strictEqual(state['skill-creator'].artifactName, null);
    });

    it('should set TTL to DEFAULT_TTL_MS', () => {
      tracker.markCreatorActive('hook-creator');
      const state = JSON.parse(fs.readFileSync(testStateFile, 'utf8'));
      assert.strictEqual(state['hook-creator'].ttl, tracker.DEFAULT_TTL_MS);
    });
  });

  describe('TRACKED_CREATOR_SKILLS constant', () => {
    it('should include skill-creator', () => {
      assert.ok(tracker.TRACKED_CREATOR_SKILLS.includes('skill-creator'));
    });

    it('should include agent-creator', () => {
      assert.ok(tracker.TRACKED_CREATOR_SKILLS.includes('agent-creator'));
    });

    it('should include hook-creator', () => {
      assert.ok(tracker.TRACKED_CREATOR_SKILLS.includes('hook-creator'));
    });

    it('should include workflow-creator', () => {
      assert.ok(tracker.TRACKED_CREATOR_SKILLS.includes('workflow-creator'));
    });

    it('should include template-creator', () => {
      assert.ok(tracker.TRACKED_CREATOR_SKILLS.includes('template-creator'));
    });

    it('should include schema-creator', () => {
      assert.ok(tracker.TRACKED_CREATOR_SKILLS.includes('schema-creator'));
    });

    it('should have exactly 6 tracked creators', () => {
      assert.strictEqual(tracker.TRACKED_CREATOR_SKILLS.length, 6);
    });
  });

  describe('ACTIVE_CREATORS_STATE_FILE constant', () => {
    it('should point to runtime directory', () => {
      assert.ok(tracker.ACTIVE_CREATORS_STATE_FILE.includes('runtime'));
      assert.ok(tracker.ACTIVE_CREATORS_STATE_FILE.includes('active-creators.json'));
    });
  });

  describe('DEFAULT_TTL_MS constant', () => {
    it('should be 3 minutes in milliseconds (SEC-REMEDIATION-001)', () => {
      // SEC-REMEDIATION-001: Reduced from 10 to 3 minutes for security hardening
      assert.strictEqual(tracker.DEFAULT_TTL_MS, 3 * 60 * 1000);
    });
  });
});
