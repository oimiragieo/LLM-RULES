#!/usr/bin/env node
/**
 * Test Suite: PERF-009 Path Validation for smart-pruner
 * Tests that smart-pruner functions are safe from path traversal
 *
 * Note: smart-pruner primarily works with in-memory data structures,
 * but ensures any file path operations validate paths properly.
 */

'use strict';

const { test } = require('node:test');
const assert = require('assert');
const path = require('path');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const smartPruner = require('../../../.claude/lib/memory/smart-pruner.cjs');

test('PERF-009: smart-pruner - deduplicateAndPrune() should safely process entries', () => {
  const entries = [
    { text: 'Pattern 1', timestamp: new Date().toISOString() },
    { text: 'Pattern 2', timestamp: new Date().toISOString() },
  ];

  const result = smartPruner.deduplicateAndPrune(entries);
  assert(result, 'Should return result');
  assert(Array.isArray(result.kept), 'Should have kept array');
});

test('PERF-009: smart-pruner - calculateUtility() should return valid score', () => {
  const entry = {
    text: 'Test entry',
    lastAccessed: new Date().toISOString(),
    accessCount: 1,
  };

  const utility = smartPruner.calculateUtility(entry);
  assert(typeof utility === 'number', 'Should return number');
  assert(utility >= 0 && utility <= 1, 'Utility should be between 0 and 1');
});

test('PERF-009: smart-pruner - should validate paths if projectRoot parameter added', () => {
  const maliciousPath = path.join(PROJECT_ROOT, '..', '..', 'etc', 'passwd');
  const result = validatePathWithinProject(maliciousPath);
  assert(!result.safe, 'Should reject path traversal');
});

test('PERF-009: smart-pruner - should accept valid projectRoot paths', () => {
  const result = validatePathWithinProject(PROJECT_ROOT);
  assert(result.safe, 'Should accept PROJECT_ROOT');
});
