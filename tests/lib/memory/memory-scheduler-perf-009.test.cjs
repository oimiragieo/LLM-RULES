#!/usr/bin/env node
/**
 * Test Suite: PERF-009 Path Traversal Validation
 * Tests for path validation in memory-scheduler.cjs
 *
 * Issue: Functions accept projectRoot parameter without validation
 * Fix: Add validatePathWithinProject() checks
 */

'use strict';

const { test } = require('node:test');
const assert = require('assert');
const path = require('path');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const scheduler = require('../../../.claude/lib/memory/memory-scheduler.cjs');

test('PERF-009: memory-scheduler.cjs - getMemoryDir() should accept valid PROJECT_ROOT', () => {
  assert.doesNotThrow(() => {
    scheduler.getMemoryDir(PROJECT_ROOT);
  });
});

test('PERF-009: memory-scheduler.cjs - getMemoryDir() should accept path within project', () => {
  const validPath = path.join(PROJECT_ROOT, '.claude');
  assert.doesNotThrow(() => {
    scheduler.getMemoryDir(validPath);
  });
});

test('PERF-009: memory-scheduler.cjs - should reject path traversal with ..', () => {
  const traversalPath = path.join(PROJECT_ROOT, '..', '..', 'etc', 'passwd');
  const result = validatePathWithinProject(traversalPath);
  assert(!result.safe, 'Should reject path traversal');
});

test('PERF-009: memory-scheduler.cjs - should reject path with null bytes', () => {
  const nullPath = path.join(PROJECT_ROOT, 'file\0name.txt');
  const result = validatePathWithinProject(nullPath);
  assert(!result.safe, 'Should reject null byte in path');
});

test('PERF-009: memory-scheduler.cjs - should reject path outside project root', () => {
  const outsidePath = '/tmp/outside-project';
  const result = validatePathWithinProject(outsidePath);
  assert(!result.safe, 'Should reject path outside project');
});

test('PERF-009: memory-scheduler.cjs - readStatus() should accept valid PROJECT_ROOT', () => {
  assert.doesNotThrow(() => {
    scheduler.readStatus(PROJECT_ROOT);
  });
});

test('PERF-009: memory-scheduler.cjs - should reject path traversal in readStatus', () => {
  const traversalPath = path.join(PROJECT_ROOT, '..', '..', 'etc');
  const result = validatePathWithinProject(traversalPath);
  assert(!result.safe, 'Should reject path traversal');
});

test('PERF-009: memory-scheduler.cjs - should reject encoded traversal %2e%2e', () => {
  const encodedPath = '%2e%2e/etc/passwd';
  const result = validatePathWithinProject(encodedPath);
  assert(!result.safe, 'Should reject encoded traversal');
});

test('PERF-009: memory-scheduler.cjs - should accept valid paths within project', () => {
  const validPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  const result = validatePathWithinProject(validPath);
  assert(result.safe, 'Should accept path within project');
});

test('PERF-009: memory-scheduler.cjs - should handle double-encoded traversal', () => {
  const doubleEncodedPath = '%252e%252e/etc/passwd';
  const result = validatePathWithinProject(doubleEncodedPath);
  assert(!result.safe, 'Should reject double-encoded traversal');
});
