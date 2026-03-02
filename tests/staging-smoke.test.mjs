#!/usr/bin/env node
/**
 * Staging Smoke Tests
 *
 * Minimal smoke tests that verify the agent-studio framework can load its
 * core configuration files in a staging environment context. These tests are
 * intentionally lightweight — they verify structural integrity, not agent
 * behavior. Full behavioral tests live in tests/integration/.
 *
 * Run with: pnpm test:staging:smoke
 * Or with staging env: AGENT_STUDIO_ENV=staging pnpm test:staging:smoke
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const CLAUDE_DIR = join(PROJECT_ROOT, '.claude');

test('staging-smoke: core framework directories exist', () => {
  const required = [
    join(CLAUDE_DIR, 'agents'),
    join(CLAUDE_DIR, 'skills'),
    join(CLAUDE_DIR, 'hooks'),
    join(CLAUDE_DIR, 'context'),
    join(CLAUDE_DIR, 'docs'),
  ];
  for (const dir of required) {
    assert.ok(existsSync(dir), `Required directory must exist: ${dir}`);
  }
});

test('staging-smoke: CLAUDE.md router entry point exists and is non-empty', () => {
  const claudeMd = join(CLAUDE_DIR, 'CLAUDE.md');
  assert.ok(existsSync(claudeMd), 'CLAUDE.md must exist');
  const content = readFileSync(claudeMd, 'utf-8');
  assert.ok(content.length > 100, 'CLAUDE.md must be non-trivially populated');
  assert.ok(content.includes('ROUTER'), 'CLAUDE.md must contain ROUTER directive');
});

test('staging-smoke: settings.json exists and is valid JSON', () => {
  const settingsPath = join(CLAUDE_DIR, 'settings.json');
  assert.ok(existsSync(settingsPath), 'settings.json must exist');
  let settings;
  assert.doesNotThrow(() => {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }, 'settings.json must be valid JSON');
  assert.ok(settings && typeof settings === 'object', 'settings.json must be an object');
});

test('staging-smoke: config.yaml exists', () => {
  const configPath = join(CLAUDE_DIR, 'config.yaml');
  assert.ok(existsSync(configPath), 'config.yaml must exist');
  const content = readFileSync(configPath, 'utf-8');
  assert.ok(content.length > 0, 'config.yaml must be non-empty');
});

test('staging-smoke: agent-registry.json exists and contains agents', () => {
  const registryPath = join(CLAUDE_DIR, 'context', 'agent-registry.json');
  assert.ok(existsSync(registryPath), 'agent-registry.json must exist');
  let registry;
  assert.doesNotThrow(() => {
    registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  }, 'agent-registry.json must be valid JSON');
  // Registry uses an agents object (key-value map), not an array
  assert.ok(
    registry.agents && typeof registry.agents === 'object',
    'agent-registry.json must have an agents field'
  );
  assert.ok(
    Object.keys(registry.agents).length > 0,
    'agent-registry.json must contain at least one agent'
  );
});

test('staging-smoke: skill-catalog.md exists', () => {
  const catalogPath = join(CLAUDE_DIR, 'docs', 'skill-catalog.md');
  assert.ok(existsSync(catalogPath), 'skill-catalog.md must exist');
  const content = readFileSync(catalogPath, 'utf-8');
  assert.ok(content.length > 100, 'skill-catalog.md must be non-trivially populated');
});

test('staging-smoke: memory tier directories exist', () => {
  const memoryBase = join(CLAUDE_DIR, 'context', 'memory');
  const tiers = ['stm', 'mtm', 'ltm'];
  for (const tier of tiers) {
    const tierPath = join(memoryBase, tier);
    assert.ok(existsSync(tierPath), `Memory tier directory must exist: ${tierPath}`);
  }
});

test('staging-smoke: AGENT_STUDIO_ENV is recognized when set', () => {
  const env = process.env.AGENT_STUDIO_ENV;
  // If the env var is set, it must be one of the recognized values
  if (env !== undefined) {
    const valid = ['development', 'staging', 'production', 'test'];
    assert.ok(
      valid.includes(env),
      `AGENT_STUDIO_ENV="${env}" must be one of: ${valid.join(', ')}`
    );
  }
  // If not set, that is fine — defaults to development
});
