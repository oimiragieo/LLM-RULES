#!/usr/bin/env node
/**
 * System Registration Handler Tests
 * ==================================
 *
 * Tests for the SystemRegistrationHandler module that automates
 * registration of artifacts in system files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  SystemRegistrationHandler,
} = require('../../../.claude/lib/integration/system-registration-handler.cjs');

// =============================================================================
// Test Framework
// =============================================================================

const testQueue = [];

function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  testQueue.push({ name, fn });
}

async function runTestQueue() {
  let passed = 0;
  let failed = 0;

  for (const test of testQueue) {
    try {
      await test.fn();
      console.log(`    \x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`    \x1b[31m✗\x1b[0m ${test.name}`);
      console.log(`      Error: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${expected}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string to contain "${expected}"`);
        }
      }
    },
    toMatch(regex) {
      if (!regex.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${regex}`);
      }
    },
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_DIR = path.join(process.cwd(), '.claude', 'lib', '_test-fixtures');

function setupTestFixtures() {
  // Create test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // Create mock CLAUDE.md
  const mockClaudeMd = `# CLAUDE.md

## 3. AGENT ROUTING TABLE

| Request Type | Agent | File |
|--------------|-------|------|
| Bug fixes | developer | .claude/agents/core/developer.md |
| Testing | qa | .claude/agents/core/qa.md |

## 8.5 WORKFLOW ENHANCEMENT SKILLS

| Skill | When to Use |
|-------|-------------|
| tdd | Testing workflows |
`;

  fs.writeFileSync(path.join(TEST_DIR, 'CLAUDE.md'), mockClaudeMd);

  // Create mock settings.json
  const mockSettings = {
    hooks: [
      {
        matcher: 'PreToolUse',
        path: '.claude/hooks/safety/test-hook.cjs',
      },
    ],
  };
  fs.writeFileSync(path.join(TEST_DIR, 'settings.json'), JSON.stringify(mockSettings, null, 2));

  // Create mock skill-catalog.md
  const mockCatalog = `# Skill Catalog

## Core Skills

| Skill | Description |
|-------|-------------|
| tdd | Test-Driven Development |
`;
  fs.writeFileSync(path.join(TEST_DIR, 'skill-catalog.md'), mockCatalog);

  // Create mock router-enforcer.cjs
  const mockRouter = `const intentKeywords = {
  developer: ['fix', 'bug'],
  qa: ['test', 'testing'],
};

const INTENT_TO_AGENT = {
  developer: 'developer',
  qa: 'qa',
};

module.exports = { intentKeywords, INTENT_TO_AGENT };
`;
  fs.writeFileSync(path.join(TEST_DIR, 'router-enforcer.cjs'), mockRouter);

  // Create backups directory
  const backupsDir = path.join(TEST_DIR, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

function cleanupTestFixtures() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('SystemRegistrationHandler', () => {
  // Setup before all tests
  setupTestFixtures();

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const handler = new SystemRegistrationHandler({ testMode: true, basePath: TEST_DIR });
      expect(handler).toBeTruthy();
    });

    it('should accept custom paths', () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        claudeMdPath: path.join(TEST_DIR, 'CLAUDE.md'),
      });
      expect(handler.options.claudeMdPath).toBe(path.join(TEST_DIR, 'CLAUDE.md'));
    });
  });

  describe('registerAgent()', () => {
    it('should register a new agent in CLAUDE.md', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const agentDef = {
        name: 'test-agent',
        requestType: 'Test requests',
        filePath: '.claude/agents/test/test-agent.md',
      };

      const result = await handler.registerAgent(agentDef);
      expect(result.success).toBe(true);

      // Verify the file was updated
      const content = fs.readFileSync(path.join(TEST_DIR, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('test-agent');
    });

    it('should create backup before modification', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const agentDef = {
        name: 'backup-test-agent',
        requestType: 'Backup test',
        filePath: '.claude/agents/test/backup-test.md',
      };

      const result = await handler.registerAgent(agentDef);
      expect(result.backupCreated).toBe(true);
    });
  });

  describe('registerSkill()', () => {
    it('should register a new skill in skill-catalog.md', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const skillDef = {
        name: 'test-skill',
        description: 'A test skill',
        category: 'testing',
      };

      const result = await handler.registerSkill(skillDef);
      expect(result.success).toBe(true);

      // Verify the file was updated
      const content = fs.readFileSync(path.join(TEST_DIR, 'skill-catalog.md'), 'utf-8');
      expect(content).toContain('test-skill');
    });

    it('should also register skill in CLAUDE.md', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const skillDef = {
        name: 'claude-md-skill',
        description: 'Skill for CLAUDE.md test',
        category: 'testing',
        registerInClaudeMd: true,
      };

      const result = await handler.registerSkill(skillDef);
      expect(result.registrations).toContain('skill-catalog');
    });
  });

  describe('registerHook()', () => {
    it('should register a new hook in settings.json', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const hookDef = {
        name: 'test-hook',
        matcher: 'PreToolUse',
        toolFilter: 'Edit',
        path: '.claude/hooks/safety/test-hook.cjs',
      };

      const result = await handler.registerHook(hookDef);
      expect(result.success).toBe(true);

      // Verify the file was updated
      const content = fs.readFileSync(path.join(TEST_DIR, 'settings.json'), 'utf-8');
      const settings = JSON.parse(content);
      const found = settings.hooks.some(h => h.path && h.path.includes('test-hook'));
      expect(found).toBe(true);
    });
  });

  describe('registerWorkflow()', () => {
    it('should register a new workflow in CLAUDE.md', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const workflowDef = {
        name: 'Test Workflow',
        path: '.claude/workflows/test/test-workflow.md',
        purpose: 'Testing workflow registration',
      };

      const result = await handler.registerWorkflow(workflowDef);
      expect(result.success).toBe(true);
    });
  });

  describe('deregister()', () => {
    it('should remove an artifact registration', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      // First register
      await handler.registerAgent({
        name: 'remove-me-agent',
        requestType: 'To be removed',
        filePath: '.claude/agents/test/remove-me.md',
      });

      // Then deregister
      const result = await handler.deregister('agent', 'remove-me-agent');
      expect(result.success).toBe(true);
    });
  });

  describe('verifyRegistration()', () => {
    it('should verify an artifact is registered', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      // Register first
      await handler.registerAgent({
        name: 'verify-me-agent',
        requestType: 'To be verified',
        filePath: '.claude/agents/test/verify-me.md',
      });

      const result = await handler.verifyRegistration('agent', 'verify-me-agent');
      expect(result.registered).toBe(true);
    });

    it('should return false for unregistered artifacts', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      const result = await handler.verifyRegistration('agent', 'nonexistent-agent');
      expect(result.registered).toBe(false);
    });
  });

  describe('updateRegistration()', () => {
    it('should update an existing registration', async () => {
      const handler = new SystemRegistrationHandler({
        testMode: true,
        basePath: TEST_DIR,
        backupDir: path.join(TEST_DIR, 'backups'),
      });

      // Register first
      await handler.registerAgent({
        name: 'update-me-agent',
        requestType: 'Original description',
        filePath: '.claude/agents/test/update-me.md',
      });

      // Update
      const result = await handler.updateRegistration('agent', 'update-me-agent', {
        requestType: 'Updated description',
      });

      expect(result.success).toBe(true);
    });
  });

  // Cleanup after all tests
  describe('cleanup', () => {
    it('should clean up test fixtures', () => {
      cleanupTestFixtures();
      expect(fs.existsSync(TEST_DIR)).toBe(false);
    });
  });
});

// =============================================================================
// Run Tests
// =============================================================================

console.log('\n  SystemRegistrationHandler Tests');
runTestQueue();
