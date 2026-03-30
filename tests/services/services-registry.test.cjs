'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const { ServicesRegistry } = require('../../.claude/lib/services/services-registry.cjs');

describe('Services Registry', () => {
  let tempDir;
  let servicesPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'services-registry-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    servicesPath = path.join(tempDir, 'services.yaml');
  });

  afterEach(() => {
    if (fs.existsSync(servicesPath)) {
      fs.rmSync(servicesPath, { force: true });
    }
  });

  function writeServices(content) {
    fs.writeFileSync(servicesPath, content, 'utf8');
  }

  describe('VAL-SY-001: Valid services.yaml passes schema validation', () => {
    it('valid YAML with canonical commands passes AJV validation', () => {
      writeServices(`
commands:
  install: pnpm install
  test: pnpm test
  lint: pnpm lint
  build: pnpm build
  validate: pnpm validate
  typecheck: pnpm typecheck
  benchmark: pnpm benchmark

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true, 'YAML should be valid');
      assert.strictEqual(result.exists, true, 'File should exist');
      assert.ok(result.errors === null || result.errors.length === 0, 'No errors');
    });

    it('valid YAML with services passes validation', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  api:
    start: node server.js
    stop: lsof -ti :3000 | xargs kill
    healthcheck: curl -sf http://localhost:3000/health
    port: 3000
    depends_on: []
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.exists, true);
    });

    it('valid YAML with optional extra commands', () => {
      writeServices(`
commands:
  install: pnpm install
  test: pnpm test
  lint: pnpm lint
  custom: npm run custom-script
  deploy: npm run deploy

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true);
      assert.ok(result.commands.custom, 'Extra command should be parsed');
      assert.ok(result.commands.deploy, 'Extra command should be parsed');
    });

    it('valid YAML with minimum service fields (start and port)', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  minimal:
    start: node minimal.js
    port: 4000
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true);
      assert.ok(result.services.minimal, 'Service should be parsed');
    });
  });

  describe('VAL-SY-002: Missing services.yaml returns structured fallback', () => {
    it('missing file returns {exists:false, commands:{}, services:{}}', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.yaml');
      const registry = new ServicesRegistry(nonExistentPath);
      const result = registry.load();

      assert.strictEqual(result.exists, false, 'exists should be false');
      assert.deepStrictEqual(result.commands, {}, 'commands should be empty object');
      assert.deepStrictEqual(result.services, {}, 'services should be empty object');
      assert.strictEqual(result.valid, undefined, 'valid should be undefined for fallback');
    });

    it('missing file does not throw exception', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.yaml');
      const registry = new ServicesRegistry(nonExistentPath);

      assert.doesNotThrow(() => {
        registry.load();
      });
    });
  });

  describe('Malformed YAML handling', () => {
    it('malformed YAML returns {valid:false, errors:[]}', () => {
      writeServices(`
commands:
  install: pnpm install
  test: [unclosed bracket
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, false, 'valid should be false');
      assert.ok(Array.isArray(result.errors), 'errors should be an array');
      assert.ok(result.errors.length > 0, 'errors should have at least one error');
    });

    it('malformed YAML does not throw exception', () => {
      writeServices(`
invalid: yaml: content: [
`);

      const registry = new ServicesRegistry(servicesPath);

      assert.doesNotThrow(() => {
        registry.load();
      });
    });
  });

  describe('VAL-SY-003: Command resolution to actual command string', () => {
    it('resolveCommand(name) returns correct command string', () => {
      writeServices(`
commands:
  install: pnpm install
  test: pnpm test --filter=core

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const testCmd = registry.resolveCommand('test');
      assert.strictEqual(testCmd, 'pnpm test --filter=core', 'Should return exact command string');
    });

    it('resolveCommand returns undefined for unknown command', () => {
      writeServices(`
commands:
  test: pnpm test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const unknownCmd = registry.resolveCommand('unknown-command');
      assert.strictEqual(unknownCmd, undefined, 'Should return undefined for unknown command');
    });

    it('resolveCommand returns undefined when file missing', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.yaml');
      const registry = new ServicesRegistry(nonExistentPath);
      registry.load();

      const cmd = registry.resolveCommand('test');
      assert.strictEqual(cmd, undefined, 'Should return undefined when file missing');
    });
  });

  describe('Language-specific overrides', () => {
    it('resolveCommand(name, {language}) supports language-specific overrides', () => {
      writeServices(`
commands:
  test:
    default: pnpm test
    python: pytest
    rust: cargo test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const defaultCmd = registry.resolveCommand('test');
      const pythonCmd = registry.resolveCommand('test', { language: 'python' });
      const rustCmd = registry.resolveCommand('test', { language: 'rust' });

      assert.strictEqual(defaultCmd, 'pnpm test', 'Default should work');
      assert.strictEqual(pythonCmd, 'pytest', 'Python override should work');
      assert.strictEqual(rustCmd, 'cargo test', 'Rust override should work');
    });

    it('language override falls back to string command if not object', () => {
      writeServices(`
commands:
  test: pnpm test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const cmd = registry.resolveCommand('test', { language: 'python' });
      assert.strictEqual(cmd, 'pnpm test', 'Should fall back to default string command');
    });

    it('unknown language falls back to default', () => {
      writeServices(`
commands:
  test:
    default: pnpm test
    python: pytest

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const goCmd = registry.resolveCommand('test', { language: 'go' });
      assert.strictEqual(goCmd, 'pnpm test', 'Should fall back to default for unknown language');
    });
  });

  describe('VAL-SY-004: Port conflict detection', () => {
    it('detectConflicts() finds port collisions between services', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  api:
    start: node api.js
    port: 3000
  web:
    start: node web.js
    port: 3000
  db:
    start: node db.js
    port: 5432
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const conflicts = registry.detectConflicts();

      assert.ok(Array.isArray(conflicts), 'Should return array');
      assert.strictEqual(conflicts.length, 1, 'Should find one conflict');
      assert.strictEqual(conflicts[0].port, 3000, 'Should report conflicting port');
      assert.ok(conflicts[0].services.includes('api'), 'Should list api as conflicting');
      assert.ok(conflicts[0].services.includes('web'), 'Should list web as conflicting');
    });

    it('no conflicts returns empty array', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  api:
    start: node api.js
    port: 3000
  db:
    start: node db.js
    port: 5432
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const conflicts = registry.detectConflicts();

      assert.deepStrictEqual(conflicts, [], 'Should return empty array when no conflicts');
    });

    it('no services returns empty array', () => {
      writeServices(`
commands:
  test: pnpm test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const conflicts = registry.detectConflicts();

      assert.deepStrictEqual(conflicts, []);
    });

    it('missing file returns empty conflicts array', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.yaml');
      const registry = new ServicesRegistry(nonExistentPath);
      registry.load();

      const conflicts = registry.detectConflicts();

      assert.deepStrictEqual(conflicts, [], 'Missing file should return empty conflicts');
    });
  });

  describe('VAL-SY-005: Compound command binary validation', () => {
    it('compound command with && splits and validates each binary', () => {
      writeServices(`
commands:
  build: pip install && cargo build

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      // On Windows, 'pip' and 'cargo' should be checked
      // We're testing that the validation runs without error
      const result = registry.validateCommandBinaries('build');

      assert.ok(Array.isArray(result), 'Should return array of validation results');
      assert.strictEqual(result.length, 2, 'Should have 2 binary checks for compound command');

      // Each result should have binary, exists, and resolved fields
      for (const check of result) {
        assert.ok('binary' in check, 'Should have binary field');
        assert.ok('exists' in check, 'Should have exists field');
      }
    });

    it('compound command with || splits correctly', () => {
      writeServices(`
commands:
  check: npm test || yarn test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const result = registry.validateCommandBinaries('check');

      assert.strictEqual(result.length, 2, 'Should split on ||');
    });

    it('compound command with ; splits correctly', () => {
      writeServices(`
commands:
  multi: echo first ; echo second

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const result = registry.validateCommandBinaries('multi');

      assert.strictEqual(result.length, 2, 'Should split on ;');
    });

    it('single command returns single binary validation', () => {
      writeServices(`
commands:
  test: pnpm test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const result = registry.validateCommandBinaries('test');

      assert.strictEqual(result.length, 1, 'Single command should have 1 binary');
      assert.strictEqual(result[0].binary, 'pnpm', 'Should extract correct binary');
    });

    it('unknown command returns empty array', () => {
      writeServices(`
commands:
  test: pnpm test

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      const result = registry.validateCommandBinaries('nonexistent');

      assert.deepStrictEqual(result, [], 'Unknown command should return empty array');
    });

    it('skips complex shell commands gracefully', () => {
      writeServices(`
commands:
  complex: node -e "console.log('test')"

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      registry.load();

      // Should not throw
      const result = registry.validateCommandBinaries('complex');
      assert.ok(Array.isArray(result), 'Should return array even for complex commands');
    });
  });

  describe('Service validation', () => {
    it('service requires start field minimum', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  incomplete:
    port: 3000
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      // Service without 'start' should fail validation
      assert.strictEqual(result.valid, false, 'Service without start should be invalid');
      assert.ok(
        result.errors.some(e => e.includes('start')),
        'Error should mention start field'
      );
    });

    it('service requires port field minimum', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  incomplete:
    start: node server.js
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, false, 'Service without port should be invalid');
      assert.ok(
        result.errors.some(e => e.includes('port')),
        'Error should mention port field'
      );
    });

    it('service with optional stop and healthcheck is valid', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  full:
    start: node server.js
    stop: lsof -ti :3000 | xargs kill
    healthcheck: curl -sf http://localhost:3000/health
    port: 3000
    depends_on: []
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true, 'Full service definition should be valid');
    });

    it('service with depends_on array is valid', () => {
      writeServices(`
commands:
  test: pnpm test

services:
  api:
    start: node api.js
    port: 3000
    depends_on: [db]
  db:
    start: node db.js
    port: 5432
    depends_on: []
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true);
    });
  });

  describe('Edge cases', () => {
    it('empty commands object is valid', () => {
      writeServices(`
commands: {}

services: {}
`);

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.valid, true, 'Empty commands should be valid');
    });

    it('empty file is handled gracefully', () => {
      writeServices('');

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      // Empty file is valid YAML (empty object)
      assert.strictEqual(result.exists, true);
      assert.ok(result.valid !== false, 'Should not have validation errors');
    });

    it('whitespace-only file is handled', () => {
      writeServices('   \n\n   ');

      const registry = new ServicesRegistry(servicesPath);
      const result = registry.load();

      assert.strictEqual(result.exists, true);
    });
  });
});
