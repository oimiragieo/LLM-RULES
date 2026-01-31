/**
 * Code Styleguides Tests (TDD Red Phase)
 * SPEC-006: Code Styleguide Templates Integration
 * Tests MUST fail before implementation
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STYLEGUIDES_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'code-styleguides'
);

describe('Code Styleguides - Structure', () => {
  it('should have code-styleguides directory', () => {
    assert.ok(fs.existsSync(STYLEGUIDES_DIR), 'code-styleguides directory should exist');
  });

  it('should have README.md', () => {
    const readmePath = path.join(STYLEGUIDES_DIR, 'README.md');
    assert.ok(fs.existsSync(readmePath), 'README.md should exist');
  });

  it('should have general.md', () => {
    const generalPath = path.join(STYLEGUIDES_DIR, 'general.md');
    assert.ok(fs.existsSync(generalPath), 'general.md should exist');
  });

  it('should have all 8 language guides', () => {
    const languages = ['python', 'javascript', 'typescript', 'go', 'dart', 'csharp', 'html-css'];
    languages.forEach(lang => {
      const guidePath = path.join(STYLEGUIDES_DIR, `${lang}.md`);
      assert.ok(fs.existsSync(guidePath), `${lang}.md should exist`);
    });
  });
});

describe('Code Styleguides - Content Quality', () => {
  const requiredSections = [
    '## Language-Specific Rules',
    '## Style Conventions',
    '## Best Practices',
    '## Common Patterns',
    '## Tools & Enforcement',
    '## Quick Reference',
  ];

  const languages = ['python', 'javascript', 'typescript', 'go', 'dart', 'csharp', 'html-css'];

  languages.forEach(lang => {
    it(`${lang}.md should have all required sections`, () => {
      const guidePath = path.join(STYLEGUIDES_DIR, `${lang}.md`);
      const content = fs.readFileSync(guidePath, 'utf8');

      requiredSections.forEach(section => {
        assert.ok(content.includes(section), `${lang}.md should have section: ${section}`);
      });
    });

    it(`${lang}.md should be at least 100 lines`, () => {
      const guidePath = path.join(STYLEGUIDES_DIR, `${lang}.md`);
      const content = fs.readFileSync(guidePath, 'utf8');
      const lines = content.split('\n').length;
      assert.ok(lines >= 100, `${lang}.md should have at least 100 lines, found ${lines}`);
    });

    it(`${lang}.md should have code examples`, () => {
      const guidePath = path.join(STYLEGUIDES_DIR, `${lang}.md`);
      const content = fs.readFileSync(guidePath, 'utf8');
      assert.ok(content.includes('```'), `${lang}.md should have code examples`);
    });
  });
});

describe('Code Styleguides - General Guide Content', () => {
  const requiredPrinciples = [
    'DRY',
    'SOLID',
    'Code readability',
    'Testing',
    'Documentation',
    'Git commit',
    'Code review',
    'Security',
    'Performance',
    'Accessibility',
  ];

  it('general.md should have all universal principles', () => {
    const generalPath = path.join(STYLEGUIDES_DIR, 'general.md');
    const content = fs.readFileSync(generalPath, 'utf8');

    requiredPrinciples.forEach(principle => {
      assert.ok(
        content.toLowerCase().includes(principle.toLowerCase()),
        `general.md should mention ${principle}`
      );
    });
  });

  it('general.md should have at least 100 lines', () => {
    const generalPath = path.join(STYLEGUIDES_DIR, 'general.md');
    const content = fs.readFileSync(generalPath, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines >= 100, `general.md should have at least 100 lines, found ${lines}`);
  });
});

describe('Code Styleguides - README Content', () => {
  it('README should describe purpose', () => {
    const readmePath = path.join(STYLEGUIDES_DIR, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(content.includes('Code Styleguides'), 'README should describe purpose');
  });

  it('README should have language support matrix', () => {
    const readmePath = path.join(STYLEGUIDES_DIR, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(
      content.includes('Languages Supported') || content.includes('| Language'),
      'README should have language matrix'
    );
  });

  it('README should have maintenance info', () => {
    const readmePath = path.join(STYLEGUIDES_DIR, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(
      content.includes('Maintenance') || content.includes('Update'),
      'README should have maintenance info'
    );
  });

  it('README should have usage instructions', () => {
    const readmePath = path.join(STYLEGUIDES_DIR, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(
      content.includes('How to Use') || content.includes('Usage'),
      'README should have usage instructions'
    );
  });
});

describe('Code Styleguides - Markdown Syntax', () => {
  const allFiles = [
    'README.md',
    'general.md',
    'python.md',
    'javascript.md',
    'typescript.md',
    'go.md',
    'dart.md',
    'csharp.md',
    'html-css.md',
  ];

  allFiles.forEach(file => {
    it(`${file} should have valid markdown syntax`, () => {
      const filePath = path.join(STYLEGUIDES_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for balanced code blocks
      const codeBlockCount = (content.match(/```/g) || []).length;
      assert.ok(
        codeBlockCount % 2 === 0,
        `${file} should have balanced code blocks (found ${codeBlockCount} backtick triplets)`
      );

      // Check for proper heading hierarchy (# at start of line)
      const headings = content.match(/^#+\s+.+$/gm) || [];
      assert.ok(headings.length > 0, `${file} should have at least one heading`);
    });

    it(`${file} should not have broken links`, () => {
      const filePath = path.join(STYLEGUIDES_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for markdown links with empty URLs
      const brokenLinks = content.match(/\[.+\]\(\s*\)/g);
      assert.ok(
        !brokenLinks || brokenLinks.length === 0,
        `${file} should not have broken links: ${brokenLinks}`
      );
    });
  });
});

describe('Code Styleguides - Performance', () => {
  it('should load all guides in <100ms', () => {
    const start = Date.now();

    const files = [
      'README.md',
      'general.md',
      'python.md',
      'javascript.md',
      'typescript.md',
      'go.md',
      'dart.md',
      'csharp.md',
      'html-css.md',
    ];

    files.forEach(file => {
      const filePath = path.join(STYLEGUIDES_DIR, file);
      fs.readFileSync(filePath, 'utf8');
    });

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `Loading all guides should take <100ms, took ${elapsed}ms`);
  });
});
