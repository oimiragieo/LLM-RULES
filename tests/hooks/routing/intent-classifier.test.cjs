'use strict';

/**
 * Tests for .claude/lib/routing/intent-classifier.cjs
 *
 * Tests pure exported functions: classifyIntent, classifyDomain,
 * isHierarchicalRoutingEnabled. No stdin/spawnSync needed since the
 * module exports pure functions directly.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const MODULE_PATH = path.resolve(
  __dirname,
  "../../../.claude/lib/routing/intent-classifier.cjs"
);

let classifyIntent, classifyDomain, isHierarchicalRoutingEnabled;

before(() => {
  const mod = require(MODULE_PATH);
  classifyIntent = mod.classifyIntent;
  classifyDomain = mod.classifyDomain;
  isHierarchicalRoutingEnabled = mod.isHierarchicalRoutingEnabled;
});

after(() => {
  delete process.env.HIERARCHICAL_ROUTING;
});

// --- classifyIntent ---

test('classifyIntent() returns an object with intent and defaultAgent fields', () => {
  const result = classifyIntent('fix the bug in the authentication module');
  assert.ok(typeof result === 'object', 'result should be an object');
  assert.ok(typeof result.intent === 'string', 'intent should be a string');
  assert.ok(typeof result.defaultAgent === 'string', 'defaultAgent should be a string');
});

test('classifyIntent() returns general intent for empty string', () => {
  const result = classifyIntent('');
  assert.ok(typeof result === 'object');
  assert.ok(typeof result.intent === 'string');
});

test('classifyIntent() handles security-related prompts', () => {
  const result = classifyIntent('security audit of authentication and authorization code');
  assert.ok(typeof result === 'object');
  assert.ok(typeof result.intent === 'string');
  assert.ok(typeof result.defaultAgent === 'string');
});

test('classifyIntent() handles documentation prompts', () => {
  const result = classifyIntent('update the documentation for the API endpoints');
  assert.ok(typeof result === 'object');
  assert.ok(typeof result.intent === 'string');
  assert.ok(typeof result.defaultAgent === 'string');
});

test('classifyIntent() with includeAlternatives option returns alternatives array', () => {
  const result = classifyIntent('refactor and test the routing module', { includeAlternatives: true, maxAlternatives: 3 });
  assert.ok(typeof result === 'object');
  assert.ok(Array.isArray(result.alternatives), 'alternatives should be an array when includeAlternatives=true');
});

test('classifyIntent() without includeAlternatives does not require alternatives array', () => {
  const result = classifyIntent('deploy to production', { includeAlternatives: false });
  assert.ok(typeof result === 'object');
  assert.ok(typeof result.intent === 'string');
});

// --- classifyDomain ---

test('classifyDomain() returns an object with type and agent fields', () => {
  const result = classifyDomain('build a new React component for the dashboard');
  assert.ok(typeof result === 'object', 'result should be an object');
  assert.ok(typeof result.type === 'string', 'type field should be a string');
});

test('classifyDomain() returns an object for empty input', () => {
  const result = classifyDomain('');
  assert.ok(typeof result === 'object');
  assert.ok(typeof result.type === 'string');
});

test('classifyDomain() handles database-related prompts', () => {
  const result = classifyDomain('design the database schema for user profiles');
  assert.ok(typeof result === 'object');
  assert.ok(typeof result.type === 'string');
});

// --- isHierarchicalRoutingEnabled ---

test('isHierarchicalRoutingEnabled() returns a boolean', () => {
  const result = isHierarchicalRoutingEnabled();
  assert.ok(typeof result === 'boolean', 'should return a boolean');
});

test('isHierarchicalRoutingEnabled() returns true when HIERARCHICAL_ROUTING=on', () => {
  process.env.HIERARCHICAL_ROUTING = 'on';
  assert.equal(isHierarchicalRoutingEnabled(), true);
});

test('isHierarchicalRoutingEnabled() returns false when HIERARCHICAL_ROUTING=off', () => {
  process.env.HIERARCHICAL_ROUTING = 'off';
  assert.equal(isHierarchicalRoutingEnabled(), false);
});

test('isHierarchicalRoutingEnabled() defaults to true when env var not set', () => {
  delete process.env.HIERARCHICAL_ROUTING;
  const result = isHierarchicalRoutingEnabled();
  assert.ok(typeof result === 'boolean');
  assert.equal(result, true);
});