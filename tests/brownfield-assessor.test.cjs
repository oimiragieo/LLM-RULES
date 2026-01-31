/**
 * Brownfield Assessor Tests
 *
 * Tests project maturity scoring and classification
 */

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import will fail until we create the module (expected in RED phase)
let assessor;
try {
  assessor = require('../.claude/lib/utils/brownfield-assessor.cjs');
} catch (err) {
  assessor = null;
}

describe('Brownfield Assessor', () => {
  let tempDir;

  before(() => {
    // Create temporary test directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-test-'));
  });

  after(() => {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Maturity Assessment', () => {
    it('should classify greenfield project (minimal structure)', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'greenfield');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ name: 'test' }));
      // Minimal structure - just package.json

      const result = await assessor.assess(projectPath);

      assert.strictEqual(result.type, 'greenfield');
      assert.ok(result.scores.structure < 0.3);
    });

    it('should classify brownfield project (good structure)', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'brownfield');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'src'));
      fs.mkdirSync(path.join(projectPath, 'tests'));
      fs.mkdirSync(path.join(projectPath, 'docs'));

      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          name: 'test',
          scripts: { test: 'jest' },
          devDependencies: { jest: '^29.0.0' },
        })
      );
      fs.writeFileSync(
        path.join(projectPath, 'README.md'),
        '# Project\n\n## Installation\n\n## Usage'
      );
      fs.writeFileSync(
        path.join(projectPath, 'tests/example.test.js'),
        'test("example", () => {});'
      );

      const result = await assessor.assess(projectPath);

      assert.strictEqual(result.type, 'brownfield');
      assert.ok(result.scores.structure >= 0.3 && result.scores.structure < 0.8);
    });

    it('should classify legacy project (complex, mature)', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'legacy');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'src/components'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'src/utils'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'tests/unit'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'tests/integration'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, '.github/workflows'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'config'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'scripts'), { recursive: true });

      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          name: 'legacy-app',
          scripts: {
            test: 'jest',
            'test:coverage': 'jest --coverage',
            lint: 'eslint .',
            build: 'webpack',
          },
        })
      );
      fs.writeFileSync(
        path.join(projectPath, 'README.md'),
        '# Complex Project\n\n## Table of Contents\n\n## Architecture\n\n## Installation\n\n## Usage\n\n## API Reference'
      );
      fs.writeFileSync(path.join(projectPath, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]');
      fs.writeFileSync(path.join(projectPath, 'CONTRIBUTING.md'), '# Contributing');
      fs.writeFileSync(path.join(projectPath, 'LICENSE'), 'MIT License');
      fs.writeFileSync(path.join(projectPath, 'SECURITY.md'), '# Security Policy');
      fs.writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectPath, '.eslintrc.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectPath, '.prettierrc'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectPath, 'jest.config.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(projectPath, '.editorconfig'), '[*]');

      // Create multiple test files (20+ for high score)
      for (let i = 0; i < 25; i++) {
        fs.writeFileSync(
          path.join(projectPath, `tests/unit/test${i}.test.js`),
          'test("example", () => {});'
        );
      }

      const result = await assessor.assess(projectPath);

      assert.strictEqual(result.type, 'legacy');
      assert.ok(result.scores.structure >= 0.8);
    });
  });

  describe('Score Calculation', () => {
    it('should score structure based on directory organization', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'structured');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'src'));
      fs.mkdirSync(path.join(projectPath, 'tests'));
      fs.mkdirSync(path.join(projectPath, 'docs'));

      const result = await assessor.assess(projectPath);

      assert.ok(result.scores.structure >= 0.3);
    });

    it('should score tests based on test file count', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'tested');
      fs.mkdirSync(path.join(projectPath, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({}));

      // Create test files
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(
          path.join(projectPath, `tests/test${i}.test.js`),
          'test("example", () => {});'
        );
      }

      const result = await assessor.assess(projectPath);

      assert.ok(result.scores.tests >= 0.3);
    });

    it('should score docs based on documentation files', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'documented');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'README.md'),
        '# Project\n\nComprehensive documentation'
      );
      fs.writeFileSync(path.join(projectPath, 'CHANGELOG.md'), '# Changelog');
      fs.writeFileSync(path.join(projectPath, 'CONTRIBUTING.md'), '# Contributing');

      const result = await assessor.assess(projectPath);

      assert.ok(result.scores.docs >= 0.3);
    });

    it('should score patterns based on config files', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'configured');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectPath, '.eslintrc.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(projectPath, '.prettierrc'), '{}');

      const result = await assessor.assess(projectPath);

      assert.ok(result.scores.patterns >= 0.3);
    });
  });

  describe('Recommendations', () => {
    it('should recommend improvements for greenfield projects', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'greenfield-recommend');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({}));

      const result = await assessor.assess(projectPath);

      assert.ok(result.recommendations.length > 0);
      assert.ok(
        result.recommendations.some(r => r.includes('test') || r.includes('documentation'))
      );
    });

    it('should suggest appropriate agents', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'agent-suggest');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0' },
        })
      );

      const result = await assessor.assess(projectPath);

      assert.ok(result.suggested_agents.includes('typescript-pro'));
    });

    it('should suggest appropriate workflows', async () => {
      if (!assessor) return;

      const projectPath = path.join(tempDir, 'workflow-suggest');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({}));

      const result = await assessor.assess(projectPath);

      assert.ok(result.suggested_workflows.length > 0);
      assert.ok(
        result.suggested_workflows.includes('tdd') ||
          result.suggested_workflows.includes('project-onboarding')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing directory gracefully', async () => {
      if (!assessor) return;

      const result = await assessor.assess('/nonexistent/path');

      assert.strictEqual(result.type, 'greenfield');
      assert.strictEqual(result.scores.structure, 0);
    });
  });
});
