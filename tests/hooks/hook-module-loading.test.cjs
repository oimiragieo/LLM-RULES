'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('Hook Module Loading (MODULE_NOT_FOUND fixes)', () => {
  // =========================================================================
  // Fix 1: error-tracker.cjs (library module)
  // =========================================================================
  describe('error-tracker.cjs (Fix 1)', () => {
    it('should load without MODULE_NOT_FOUND error', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'error-tracker.cjs'
      );
      // This will throw MODULE_NOT_FOUND if file is missing
      const mod = require(modulePath);
      assert.ok(mod, 'Module should export something');
    });

    it('should export preToolUse function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'error-tracker.cjs'
      );
      const mod = require(modulePath);
      assert.equal(typeof mod.preToolUse, 'function', 'error-tracker must export preToolUse');
    });

    it('should export postToolUse function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'error-tracker.cjs'
      );
      const mod = require(modulePath);
      assert.equal(typeof mod.postToolUse, 'function', 'error-tracker must export postToolUse');
    });

    it('error-tracker-hook.cjs wrapper should load without error', () => {
      const wrapperPath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'error-tracker-hook.cjs'
      );
      // Wrapper requires error-tracker.cjs internally (line 20)
      const mod = require(wrapperPath);
      assert.ok(mod, 'Wrapper should load');
    });
  });

  // =========================================================================
  // Fix 2: metrics-collector.cjs (library module)
  // =========================================================================
  describe('metrics-collector.cjs (Fix 2)', () => {
    it('should load without MODULE_NOT_FOUND error', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'metrics-collector.cjs'
      );
      const mod = require(modulePath);
      assert.ok(mod, 'Module should export something');
    });

    it('should export preToolUse function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'metrics-collector.cjs'
      );
      const mod = require(modulePath);
      assert.equal(typeof mod.preToolUse, 'function', 'metrics-collector must export preToolUse');
    });

    it('should export postToolUse function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'metrics-collector.cjs'
      );
      const mod = require(modulePath);
      assert.equal(typeof mod.postToolUse, 'function', 'metrics-collector must export postToolUse');
    });

    it('should export sessionStart function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'metrics-collector.cjs'
      );
      const mod = require(modulePath);
      assert.equal(
        typeof mod.sessionStart,
        'function',
        'metrics-collector must export sessionStart'
      );
    });

    it('should export sessionEnd function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'metrics-collector.cjs'
      );
      const mod = require(modulePath);
      assert.equal(typeof mod.sessionEnd, 'function', 'metrics-collector must export sessionEnd');
    });

    it('metrics-collector-hook.cjs wrapper should load without error', () => {
      const wrapperPath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'monitoring',
        'metrics-collector-hook.cjs'
      );
      // Wrapper requires metrics-collector.cjs internally (line 28)
      const mod = require(wrapperPath);
      assert.ok(mod, 'Wrapper should load');
    });
  });

  // =========================================================================
  // Fix 3: router-state.cjs require path in user-prompt-unified.cjs
  // =========================================================================
  describe('user-prompt-unified.cjs router-state import (Fix 3)', () => {
    it('should load without MODULE_NOT_FOUND error', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'routing',
        'user-prompt-unified.cjs'
      );
      // This will throw MODULE_NOT_FOUND if router-state require is broken
      const mod = require(modulePath);
      assert.ok(mod, 'Module should export something');
    });

    it('should export checkRouterModeReset function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'routing',
        'user-prompt-unified.cjs'
      );
      const mod = require(modulePath);
      assert.equal(
        typeof mod.checkRouterModeReset,
        'function',
        'user-prompt-unified must export checkRouterModeReset'
      );
    });

    it('should export runAllChecks function', () => {
      const modulePath = path.join(
        PROJECT_ROOT,
        '.claude',
        'hooks',
        'routing',
        'user-prompt-unified.cjs'
      );
      const mod = require(modulePath);
      assert.equal(
        typeof mod.runAllChecks,
        'function',
        'user-prompt-unified must export runAllChecks'
      );
    });
  });
});
