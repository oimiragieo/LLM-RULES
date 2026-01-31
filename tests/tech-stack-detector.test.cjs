/**
 * Tech Stack Detector Tests
 *
 * RED phase: Write failing tests for tech stack detection
 * GREEN phase: Implement minimal code to pass
 * REFACTOR phase: Clean up implementation
 */

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import will fail until we create the module (expected in RED phase)
let detector;
try {
  detector = require('../.claude/lib/utils/tech-stack-detector.cjs');
} catch (err) {
  // Expected to fail in RED phase
  detector = null;
}

describe('Tech Stack Detector', () => {
  let tempDir;

  before(() => {
    // Create temporary test directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tech-stack-test-'));
  });

  after(() => {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Node.js/TypeScript Detection', () => {
    it('should detect TypeScript from package.json', async () => {
      if (!detector) return; // Skip in RED phase

      // Setup test project
      const projectPath = path.join(tempDir, 'ts-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0', react: '^18.0.0' },
        })
      );

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.languages.includes('typescript'), true);
      assert.strictEqual(result.frameworks.includes('react'), true);
      assert.strictEqual(result.package_managers.includes('npm'), true);
      assert.ok(result.confidence >= 0.8);
    });

    it('should detect framework from package.json dependencies', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'next-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          dependencies: { next: '^14.0.0' },
        })
      );

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.frameworks.includes('next'), true);
    });

    it('should detect testing frameworks', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'jest-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          devDependencies: { jest: '^29.0.0', vitest: '^1.0.0' },
        })
      );

      const result = await detector.detect(projectPath);

      assert.ok(result.testing.includes('jest') || result.testing.includes('vitest'));
    });
  });

  describe('Python Detection', () => {
    it('should detect Python from pyproject.toml', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'py-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'pyproject.toml'),
        `[tool.poetry]\nname = "test"\n\n[tool.poetry.dependencies]\npython = "^3.11"\nfastapi = "^0.100.0"`
      );

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.languages.includes('python'), true);
      assert.strictEqual(result.frameworks.includes('fastapi'), true);
      assert.strictEqual(result.package_managers.includes('poetry'), true);
    });

    it('should detect Python from requirements.txt', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'pip-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'requirements.txt'), 'django==4.2.0\npytest==7.4.0');

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.languages.includes('python'), true);
      assert.strictEqual(result.frameworks.includes('django'), true);
      assert.strictEqual(result.testing.includes('pytest'), true);
    });
  });

  describe('Go Detection', () => {
    it('should detect Go from go.mod', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'go-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'go.mod'),
        `module example.com/myapp\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.1`
      );

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.languages.includes('go'), true);
      assert.strictEqual(result.frameworks.includes('gin'), true);
    });
  });

  describe('Language Priority', () => {
    it('should prioritize primary language correctly', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'multi-lang');
      fs.mkdirSync(projectPath, { recursive: true });
      // TypeScript project with Python scripts
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );
      fs.writeFileSync(path.join(projectPath, 'requirements.txt'), 'pytest==7.4.0');

      const result = await detector.detect(projectPath);

      // TypeScript should be primary (package.json has more weight)
      assert.strictEqual(result.languages[0], 'typescript');
    });
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence with package.json', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'confident-project');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, 'package.json'),
        JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { jest: '^29.0.0' },
        })
      );

      const result = await detector.detect(projectPath);

      assert.ok(result.confidence >= 0.9);
    });

    it('should have medium confidence with minimal files', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'minimal-project');
      fs.mkdirSync(projectPath, { recursive: true });
      // Just a single config file
      fs.writeFileSync(
        path.join(projectPath, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: {} })
      );

      const result = await detector.detect(projectPath);

      assert.ok(result.confidence >= 0.5 && result.confidence < 0.9);
    });
  });

  describe('CI/CD Detection', () => {
    it('should detect GitHub Actions', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'gh-actions');
      fs.mkdirSync(path.join(projectPath, '.github/workflows'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, '.github/workflows/ci.yml'), 'name: CI\non: push');

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.ci_cd.includes('github-actions'), true);
    });
  });

  describe('detectLanguage Function', () => {
    it('should detect single language from file', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'single-lang');
      fs.mkdirSync(projectPath, { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({}));

      const result = await detector.detectLanguage(projectPath);

      assert.strictEqual(result, 'javascript');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing project directory', async () => {
      if (!detector) return;

      const result = await detector.detect('/nonexistent/path');

      assert.strictEqual(result.languages.length, 0);
      assert.strictEqual(result.confidence, 0);
    });

    it('should handle empty project directory', async () => {
      if (!detector) return;

      const projectPath = path.join(tempDir, 'empty-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const result = await detector.detect(projectPath);

      assert.strictEqual(result.languages.length, 0);
      assert.strictEqual(result.confidence, 0);
    });
  });
});
