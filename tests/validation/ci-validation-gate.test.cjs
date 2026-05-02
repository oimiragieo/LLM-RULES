/**
 * @file tests/validation/ci-validation-gate.test.cjs
 * @description TDD tests for CI validation gate (4-layer artifact validation)
 *
 * Test Coverage:
 * - Layer 1: File existence validation
 * - Layer 2: Forward reference resolution
 * - Layer 3: Backward reference checks (orphan detection)
 * - Layer 4: Semantic validation (frontmatter, structure)
 * - CLI runner integration
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Import the validation layers (will fail until implemented)
const {
  validateExistence,
  validateForwardRefs,
  validateBackwardRefs,
  validateSemantic,
  runAllLayers,
} = require('../../.claude/lib/validation/ci-gate-layers.cjs');

describe('CI Validation Gate', () => {
  describe('Layer 1: File Existence', () => {
    test('detects missing agent files referenced in agent-registry.json', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const registryPath = path.join(tempDir, 'agent-registry.json');

      // Create registry with nonexistent agent path
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          agents: [
            {
              type: 'test-agent',
              path: path.join(tempDir, 'agents/nonexistent.md'),
            },
          ],
        })
      );

      const result = await validateExistence(tempDir, { registryPath });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.layer === 'existence' && e.reason.includes('missing')));

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('passes when all referenced files exist', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const agentPath = path.join(tempDir, 'agents/test-agent.md');
      const registryPath = path.join(tempDir, 'agent-registry.json');

      // Create agent file
      fs.mkdirSync(path.join(tempDir, 'agents'), { recursive: true });
      fs.writeFileSync(agentPath, '# Test Agent');

      // Create registry pointing to existing file
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          agents: [
            {
              type: 'test-agent',
              path: agentPath,
            },
          ],
        })
      );

      const result = await validateExistence(tempDir, { registryPath });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('Layer 2: Forward References', () => {
    test('detects agent referencing non-existent skill', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const agentPath = path.join(tempDir, 'agents/test-agent.md');

      fs.mkdirSync(path.join(tempDir, 'agents'), { recursive: true });
      fs.writeFileSync(
        agentPath,
        `---
name: test-agent
skills:
  - nonexistent-skill
---
# Test Agent`
      );

      const result = await validateForwardRefs(tempDir, {
        agents: [agentPath],
        skillsDir: path.join(tempDir, 'skills'),
      });

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some(e => e.layer === 'forward-ref' && e.target.includes('nonexistent-skill'))
      );

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('detects hook referencing non-existent module', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const settingsPath = path.join(tempDir, 'settings.json');

      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            'pre-tool-use': [{ path: path.join(tempDir, 'hooks/deleted-hook.cjs') }],
          },
        })
      );

      const result = await validateForwardRefs(tempDir, { settingsPath });

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some(e => e.layer === 'forward-ref' && e.target.includes('deleted-hook.cjs'))
      );

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('passes when all forward references resolve', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const agentPath = path.join(tempDir, 'agents/test-agent.md');
      const skillPath = path.join(tempDir, 'skills/test-skill/SKILL.md');

      // Create skill
      fs.mkdirSync(path.join(tempDir, 'skills/test-skill'), { recursive: true });
      fs.writeFileSync(skillPath, '# Test Skill');

      // Create agent referencing valid skill
      fs.mkdirSync(path.join(tempDir, 'agents'), { recursive: true });
      fs.writeFileSync(
        agentPath,
        `---
name: test-agent
skills:
  - test-skill
---
# Test Agent`
      );

      const result = await validateForwardRefs(tempDir, {
        agents: [agentPath],
        skillsDir: path.join(tempDir, 'skills'),
      });

      assert.strictEqual(result.valid, true);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('Layer 3: Backward References', () => {
    test('detects orphaned skills (no agent references them)', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const skillPath = path.join(tempDir, 'skills/orphan-skill/SKILL.md');
      const agentPath = path.join(tempDir, 'agents/test-agent.md');

      // Create orphaned skill
      fs.mkdirSync(path.join(tempDir, 'skills/orphan-skill'), { recursive: true });
      fs.writeFileSync(skillPath, '# Orphan Skill');

      // Create agent that doesn't reference the skill
      fs.mkdirSync(path.join(tempDir, 'agents'), { recursive: true });
      fs.writeFileSync(
        agentPath,
        `---
name: test-agent
skills: []
---
# Test Agent`
      );

      const result = await validateBackwardRefs(tempDir, {
        agents: [agentPath],
        skillsDir: path.join(tempDir, 'skills'),
      });

      assert.ok(result.warnings.length > 0);
      assert.ok(
        result.warnings.some(w => w.layer === 'backward-ref' && w.reason.includes('orphaned'))
      );

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('does not warn for hooks registered in settings', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const hookPath = path.join(tempDir, 'hooks/registered-hook.cjs');
      const settingsPath = path.join(tempDir, 'settings.json');

      // Create hook file
      fs.mkdirSync(path.join(tempDir, 'hooks'), { recursive: true });
      fs.writeFileSync(hookPath, 'module.exports = {};');

      // Register hook in settings
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            'pre-tool-use': [{ path: hookPath }],
          },
        })
      );

      const result = await validateBackwardRefs(tempDir, {
        settingsPath,
        hooksDir: path.join(tempDir, 'hooks'),
      });

      assert.deepStrictEqual(result.warnings, []);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('detects unregistered hook files when hooksDir is explicitly checked', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const hookPath = path.join(tempDir, 'hooks/unregistered-hook.cjs');
      const settingsPath = path.join(tempDir, 'settings.json');

      fs.mkdirSync(path.join(tempDir, 'hooks'), { recursive: true });
      fs.writeFileSync(hookPath, 'module.exports = {};');
      fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));

      const result = await validateBackwardRefs(tempDir, {
        settingsPath,
        hooksDir: path.join(tempDir, 'hooks'),
      });

      assert.ok(
        result.warnings.some(w => w.layer === 'backward-ref' && w.reason === 'unregistered')
      );

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('does not warn for user-invocable or archived skills', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const skillsDir = path.join(tempDir, 'skills');
      const skillPath = path.join(skillsDir, 'user-command/SKILL.md');
      const archivedSkillPath = path.join(skillsDir, '_archive/SKILL.md');

      fs.mkdirSync(path.dirname(skillPath), { recursive: true });
      fs.mkdirSync(path.dirname(archivedSkillPath), { recursive: true });
      fs.writeFileSync(
        skillPath,
        `---
name: user-command
user_invocable: true
trigger: when user asks for command
---
# User Command`
      );
      fs.writeFileSync(archivedSkillPath, '# Archive');

      const result = await validateBackwardRefs(tempDir, { skillsDir });

      assert.deepStrictEqual(result.warnings, []);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('Layer 4: Semantic Validation', () => {
    test('detects agent without required frontmatter fields', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const agentPath = path.join(tempDir, 'agents/bad-agent.md');

      fs.mkdirSync(path.join(tempDir, 'agents'), { recursive: true });
      // Missing 'name:' field
      fs.writeFileSync(
        agentPath,
        `---
model: opus
---
# Bad Agent`
      );

      const result = await validateSemantic(tempDir, { agents: [agentPath] });

      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors.some(e => e.layer === 'semantic' && e.reason.includes('frontmatter'))
      );

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('detects skill without SKILL.md', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const skillDir = path.join(tempDir, 'skills/bad-skill');

      // Create skill directory without SKILL.md
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'README.md'), '# Bad Skill');

      const result = await validateSemantic(tempDir, {
        skillsDir: path.join(tempDir, 'skills'),
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.layer === 'semantic' && e.reason.includes('SKILL.md')));

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('reports combined results from all layers', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));

      // Create multiple issues across layers
      const agentPath = path.join(tempDir, 'agents/bad-agent.md');
      fs.mkdirSync(path.join(tempDir, 'agents'), { recursive: true });
      fs.writeFileSync(
        agentPath,
        `---
model: opus
skills:
  - nonexistent-skill
---
# Bad Agent`
      );

      const result = await runAllLayers(tempDir, {
        agents: [agentPath],
        skillsDir: path.join(tempDir, 'skills'),
      });

      // Should have errors from multiple layers
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 1);

      // Check that different layers are represented
      const layers = [...new Set(result.errors.map(e => e.layer))];
      assert.ok(layers.length > 1);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('CLI Runner', () => {
    test('exits 0 on valid project', () => {
      const cliPath = path.join(PROJECT_ROOT, 'scripts/validation/ci-validation-gate.cjs');

      // This test assumes a valid project state
      // If project has validation errors, this test will fail (expected)
      execFileSync(process.execPath, [cliPath], {
        cwd: PROJECT_ROOT,
        stdio: 'ignore',
      });
      assert.ok(true);
    });

    test('exits 1 on validation failures', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-gate-test-'));
      const registryPath = path.join(tempDir, 'agent-registry.json');

      // Create invalid registry
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          agents: [
            {
              type: 'missing-agent',
              path: path.join(tempDir, 'agents/missing.md'),
            },
          ],
        })
      );

      const cliPath = path.join(PROJECT_ROOT, 'scripts/validation/ci-validation-gate.cjs');

      try {
        execFileSync(
          process.execPath,
          [cliPath, '--project-root', tempDir, '--registry', registryPath],
          {
            stdio: 'ignore',
          }
        );
        // If no error thrown, test should fail
        assert.fail('Expected CLI to exit with code 1');
      } catch (error) {
        assert.strictEqual(error.status, 1);
      }

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    test('outputs JSON when --json flag is passed', () => {
      const cliPath = path.join(PROJECT_ROOT, 'scripts/validation/ci-validation-gate.cjs');

      const output = execFileSync(process.execPath, [cliPath, '--json'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
      });

      // Should be valid JSON
      const parsed = JSON.parse(output);

      assert.ok(Object.prototype.hasOwnProperty.call(parsed, 'valid'));
      assert.ok(Array.isArray(parsed.errors));
      assert.ok(Array.isArray(parsed.warnings));

      // Cleanup not needed (no temp files)
    });
  });
});
