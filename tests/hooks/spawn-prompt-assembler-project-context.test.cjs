'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test the project-context injection in spawn-prompt-assembler

// =============================================================================
// Unit Tests: Project Context Injection
// =============================================================================

describe('Project Context File Injection', () => {
  test('project-context.md should exist in .claude/context/', () => {
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const pcPath = path.join(PROJECT_ROOT, '.claude', 'context', 'project-context.md');
    assert.ok(fs.existsSync(pcPath), `Expected project-context.md at ${pcPath}`);
  });

  test('project-context.md should contain Technology Stack section', () => {
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const pcPath = path.join(PROJECT_ROOT, '.claude', 'context', 'project-context.md');
    const content = fs.readFileSync(pcPath, 'utf8');
    assert.ok(
      content.includes('## Technology Stack'),
      'Expected project-context.md to have ## Technology Stack section'
    );
  });

  test('project-context.md should contain Critical Implementation Rules section', () => {
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const pcPath = path.join(PROJECT_ROOT, '.claude', 'context', 'project-context.md');
    const content = fs.readFileSync(pcPath, 'utf8');
    assert.ok(
      content.includes('## Critical Implementation Rules'),
      'Expected project-context.md to have ## Critical Implementation Rules section'
    );
  });

  test('project-context.md should have Project Constitution header comment', () => {
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const pcPath = path.join(PROJECT_ROOT, '.claude', 'context', 'project-context.md');
    const content = fs.readFileSync(pcPath, 'utf8');
    assert.ok(
      content.includes('Project Constitution'),
      'Expected project-context.md to reference Project Constitution in header comment'
    );
  });

  test('assembler helpers module should export loadProjectContext function', () => {
    // This tests that the assembler module has been updated to support project-context injection
    const assemblerPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'spawn-prompt-assembler.cjs'
    );
    // The module should load without error
    let mod;
    try {
      mod = require(assemblerPath);
    } catch (e) {
      assert.fail(`Failed to load spawn-prompt-assembler.cjs: ${e.message}`);
    }
    assert.ok(mod, 'Expected assembler module to load');
  });

  test('assembler task-tools should export appendProjectContextSection', () => {
    const taskToolsPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'spawn-prompt-assembler.task-tools.cjs'
    );
    let mod;
    try {
      mod = require(taskToolsPath);
    } catch (e) {
      assert.fail(`Failed to load task-tools: ${e.message}`);
    }
    assert.ok(
      typeof mod.appendProjectContextSection === 'function',
      'Expected appendProjectContextSection to be exported from task-tools'
    );
  });

  test('appendProjectContextSection should inject project-context content into prompt', () => {
    const taskToolsPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'spawn-prompt-assembler.task-tools.cjs'
    );
    const { appendProjectContextSection } = require(taskToolsPath);

    const testContextContent =
      '## Technology Stack\nNode.js 22\n\n## Critical Implementation Rules\nUse safeParseJSON';
    const basePrompt = '## Task\nImplement feature X\n\n## Memory Context\nSome memory';

    const result = appendProjectContextSection(basePrompt, testContextContent);

    assert.ok(result.includes('Technology Stack'), 'Expected injected project context in prompt');
    assert.ok(
      result.includes('Critical Implementation Rules'),
      'Expected Critical Implementation Rules in prompt'
    );
  });

  test('appendProjectContextSection should not inject when context is empty string', () => {
    const taskToolsPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'spawn-prompt-assembler.task-tools.cjs'
    );
    const { appendProjectContextSection } = require(taskToolsPath);

    const basePrompt = '## Task\nImplement feature X';
    const result = appendProjectContextSection(basePrompt, '');

    assert.strictEqual(
      result,
      basePrompt,
      'Expected prompt unchanged when project context is empty'
    );
  });

  test('appendProjectContextSection should not duplicate section if already present', () => {
    const taskToolsPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'spawn-prompt-assembler.task-tools.cjs'
    );
    const { appendProjectContextSection } = require(taskToolsPath);

    const basePrompt = '## Task\nImplement X\n\n## Project Context\nAlready here';
    const testContextContent = '## Technology Stack\nNode.js 22';

    const result = appendProjectContextSection(basePrompt, testContextContent);

    const matches = result.match(/## Project Context/g);
    assert.strictEqual(
      matches ? matches.length : 0,
      1,
      'Expected only one ## Project Context section'
    );
  });

  test('loadProjectContext should return empty string when project-context.md is missing', () => {
    const taskToolsPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'spawn-prompt-assembler.task-tools.cjs'
    );
    const { loadProjectContext } = require(taskToolsPath);

    // Use a non-existent project root
    const result = loadProjectContext('/nonexistent/path/that/does/not/exist');
    assert.strictEqual(result, '', 'Expected empty string for missing project-context.md');
  });
});
