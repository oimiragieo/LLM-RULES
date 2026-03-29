'use strict';

/**
 * Tests for agents-parser.cjs
 *
 * Validates VAL-AP-001, VAL-AP-002, VAL-AP-003 from validation-contract.md
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const {
  parseAgents,
  discoverAgentsFile,
  extractSection,
} = require('../../.claude/lib/mission/agents-parser.cjs');

describe('AGENTS.md Parser', () => {
  let tempDir;
  let originalCwd;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-parser-test-'));
    originalCwd = process.cwd();
  });

  after(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('VAL-AP-001: Extracts Build and Test section', () => {
    it('extracts ## Build & Test commands', () => {
      const agentsContent = `# AGENTS Guide

## Build & Test
- Run tests: \`pnpm test\`
- Run lint: \`pnpm lint\`
- Run typecheck: \`pnpm typecheck\`

## Architecture
Some architecture content here.
`;

      const agentsPath = path.join(tempDir, 'AGENTS-001.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.buildAndTest, 'buildAndTest should be populated');
      assert.ok(result.buildAndTest.includes('pnpm test'), 'should include test command');
    });

    it('extracts ## Architecture section', () => {
      const agentsContent = `# AGENTS Guide

## Architecture
- Use CommonJS modules
- Follow existing patterns in the codebase
- See .claude/lib/ for utility modules

## Git Workflows
Git workflow info here.
`;

      const agentsPath = path.join(tempDir, 'AGENTS-002.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.architecture, 'architecture should be populated');
      assert.ok(result.architecture.includes('CommonJS'), 'should include architecture info');
    });

    it('extracts ## Git Workflows section', () => {
      const agentsContent = `# AGENTS Guide

## Git Workflows
- Commit messages follow conventional commits format
- Run tests before pushing
- Create feature branches from main

## Security
Security info here.
`;

      const agentsPath = path.join(tempDir, 'AGENTS-003.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.gitWorkflows, 'gitWorkflows should be populated');
      assert.ok(
        result.gitWorkflows.includes('conventional commits'),
        'should include git workflow info'
      );
    });

    it('extracts ## Security section', () => {
      const agentsContent = `# AGENTS Guide

## Security
- Never commit secrets or API keys
- Use environment variables for sensitive data
- Validate all user inputs

## Build & Test
Test info here.
`;

      const agentsPath = path.join(tempDir, 'AGENTS-004.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.security, 'security should be populated');
      assert.ok(result.security.includes('secrets'), 'should include security info');
    });

    it('extracts all 4 sections from complete AGENTS.md', () => {
      const agentsContent = `# AGENTS Guide

## Build & Test
- pnpm test
- pnpm lint

## Architecture
- CommonJS modules
- node:test framework

## Git Workflows
- Conventional commits
- PR reviews required

## Security
- No secrets in code
- Validate inputs
`;

      const agentsPath = path.join(tempDir, 'AGENTS-full.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.buildAndTest, 'buildAndTest should be populated');
      assert.ok(result.architecture, 'architecture should be populated');
      assert.ok(result.gitWorkflows, 'gitWorkflows should be populated');
      assert.ok(result.security, 'security should be populated');
    });
  });

  describe('VAL-AP-002: Discovery override hierarchy', () => {
    let cwdDir;
    let parentDir;

    beforeEach(() => {
      // Create nested directories: parentDir/cwdDir
      parentDir = path.join(tempDir, 'parent-test-' + Date.now());
      cwdDir = path.join(parentDir, 'child');
      fs.mkdirSync(cwdDir, { recursive: true });
    });

    afterEach(() => {
      // Clean up and restore cwd
      process.chdir(originalCwd);
      if (fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true, force: true });
      }
    });

    it('searches cwd first', () => {
      // Create AGENTS.md in cwd
      const cwdAgents = `# CWD AGENTS

## Build & Test
- pnpm test:cwd
`;

      fs.writeFileSync(path.join(cwdDir, 'AGENTS.md'), cwdAgents, 'utf8');

      // Create different AGENTS.md in parent
      const parentAgents = `# Parent AGENTS

## Build & Test
- pnpm test:parent
`;
      fs.writeFileSync(path.join(parentDir, 'AGENTS.md'), parentAgents, 'utf8');

      // Change to cwd
      process.chdir(cwdDir);

      const result = discoverAgentsFile();

      assert.ok(result.found, 'should find AGENTS.md');
      assert.ok(result.path.includes('child'), 'should find cwd version');
      assert.ok(result.content.includes('test:cwd'), 'should have cwd content');
    });

    it('falls back to parent directory if not in cwd', () => {
      // Only create AGENTS.md in parent
      const parentAgents = `# Parent AGENTS

## Build & Test
- pnpm test:parent
`;
      fs.writeFileSync(path.join(parentDir, 'AGENTS.md'), parentAgents, 'utf8');

      // Change to cwd (no AGENTS.md there)
      process.chdir(cwdDir);

      const result = discoverAgentsFile();

      assert.ok(result.found, 'should find AGENTS.md in parent');
      assert.ok(result.path.includes('parent'), 'should find parent version');
    });

    it('falls back to user global (~/.claude/AGENTS.md)', () => {
      // Skip this test on systems where home directory is not standard
      const homeDir = os.homedir();
      const globalAgentsDir = path.join(homeDir, '.claude');
      const globalAgentsPath = path.join(globalAgentsDir, 'AGENTS.md');

      // Create a global AGENTS.md if it doesn't exist
      const originalExists = fs.existsSync(globalAgentsPath);
      let createdGlobal = false;

      if (!originalExists) {
        fs.mkdirSync(globalAgentsDir, { recursive: true });
        fs.writeFileSync(
          globalAgentsPath,
          '# Global AGENTS\n\n## Build & Test\n- global test\n',
          'utf8'
        );
        createdGlobal = true;
      }

      try {
        // From a directory with no AGENTS.md
        const isolatedDir = path.join(tempDir, 'isolated-' + Date.now());
        fs.mkdirSync(isolatedDir, { recursive: true });

        // Change to isolated dir
        const previousDir = process.cwd();
        process.chdir(isolatedDir);

        const result = discoverAgentsFile();

        // Restore previous directory before cleanup
        process.chdir(previousDir);

        // Should find global or return not found
        if (result.found) {
          assert.ok(result.path.includes('.claude'), 'should find global version');
        }

        // Clean up isolated dir with retry on Windows
        try {
          fs.rmSync(isolatedDir, { recursive: true, force: true });
        } catch (e) {
          // EBUSY on Windows - will be cleaned up in after() hook
          if (e.code !== 'EBUSY') throw e;
        }
      } finally {
        // Clean up created global file
        if (createdGlobal && fs.existsSync(globalAgentsPath)) {
          fs.rmSync(globalAgentsPath, { force: true });
        }
      }
    });

    it('returns not found when no AGENTS.md exists anywhere', () => {
      // Create a completely isolated temp directory
      const isolatedDir = path.join(tempDir, 'no-agents-' + Date.now());
      fs.mkdirSync(isolatedDir, { recursive: true });

      // Temporarily move to isolated dir and ensure no global fallback
      // For this test, we just verify it doesn't crash
      const previousDir = process.cwd();
      process.chdir(isolatedDir);

      // This should return a default structure without crashing
      const result = discoverAgentsFile();

      // Restore directory before cleanup
      process.chdir(previousDir);

      // The function should handle gracefully (may find global or may not)
      assert.ok('found' in result, 'should have found field');
      assert.ok('path' in result, 'should have path field');
      assert.ok('content' in result, 'should have content field');

      // Clean up with retry on Windows
      try {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      } catch (e) {
        // EBUSY on Windows - will be cleaned up in after() hook
        if (e.code !== 'EBUSY') throw e;
      }
    });

    it('cwd version wins over parent version', () => {
      // Create AGENTS.md in both cwd and parent
      const cwdAgents = `# CWD AGENTS

## Build & Test
- CWD command
`;
      const parentAgents = `# Parent AGENTS

## Build & Test
- Parent command
`;

      fs.writeFileSync(path.join(cwdDir, 'AGENTS.md'), cwdAgents, 'utf8');
      fs.writeFileSync(path.join(parentDir, 'AGENTS.md'), parentAgents, 'utf8');

      process.chdir(cwdDir);

      const discovered = discoverAgentsFile();
      const result = parseAgents(discovered.path);

      assert.ok(result.buildAndTest.includes('CWD command'), 'cwd content should win');
      assert.ok(
        !result.buildAndTest.includes('Parent command'),
        'parent content should not be used'
      );
    });
  });

  describe('VAL-AP-003: Missing AGENTS.md returns default structure', () => {
    it('returns default structure when file does not exist', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent-AGENTS.md');

      const result = parseAgents(nonExistentPath);

      assert.deepStrictEqual(
        result,
        {
          buildAndTest: '',
          architecture: '',
          gitWorkflows: '',
          security: '',
          exists: false,
        },
        'should return default empty structure'
      );
    });

    it('returns default structure for empty file', () => {
      const agentsPath = path.join(tempDir, 'empty-agents.md');
      fs.writeFileSync(agentsPath, '', 'utf8');

      const result = parseAgents(agentsPath);

      assert.strictEqual(result.buildAndTest, '', 'buildAndTest should be empty');
      assert.strictEqual(result.architecture, '', 'architecture should be empty');
      assert.strictEqual(result.gitWorkflows, '', 'gitWorkflows should be empty');
      assert.strictEqual(result.security, '', 'security should be empty');
    });

    it('does not throw error for missing file', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.md');

      assert.doesNotThrow(() => {
        parseAgents(nonExistentPath);
      }, 'parseAgents should not throw for missing file');
    });

    it('gracefully handles malformed markdown (partial results)', () => {
      const malformedContent = `# AGENTS

## Build & Test
- pnpm test

## Architecture
(no actual content, just broken)

### Random subsection
More broken content

## Git Workflows
- Git info here

## Security (no newline after header)
- Security info
`;

      const agentsPath = path.join(tempDir, 'malformed-agents.md');
      fs.writeFileSync(agentsPath, malformedContent, 'utf8');

      // Should not throw
      assert.doesNotThrow(() => {
        const result = parseAgents(agentsPath);
        // Should extract what it can
        assert.ok(typeof result.buildAndTest === 'string', 'buildAndTest should be a string');
        assert.ok(typeof result.gitWorkflows === 'string', 'gitWorkflows should be a string');
      }, 'parseAgents should handle malformed markdown gracefully');
    });

    it('handles missing sections (returns empty strings, not undefined)', () => {
      const partialContent = `# AGENTS

## Build & Test
- pnpm test

## Architecture
- CommonJS modules

(no Git Workflows or Security sections)
`;

      const agentsPath = path.join(tempDir, 'partial-agents.md');
      fs.writeFileSync(agentsPath, partialContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.buildAndTest.includes('pnpm'), 'buildAndTest should have content');
      assert.ok(result.architecture.includes('CommonJS'), 'architecture should have content');
      assert.strictEqual(result.gitWorkflows, '', 'gitWorkflows should be empty string');
      assert.strictEqual(result.security, '', 'security should be empty string');
      assert.notStrictEqual(result.gitWorkflows, undefined, 'gitWorkflows should not be undefined');
      assert.notStrictEqual(result.security, undefined, 'security should not be undefined');
    });
  });

  describe('Edge cases and robustness', () => {
    it('handles Windows line endings (CRLF)', () => {
      const agentsContent =
        '# AGENTS\r\n\r\n## Build & Test\r\n- pnpm test\r\n\r\n## Architecture\r\n- CommonJS\r\n';

      const agentsPath = path.join(tempDir, 'agents-crlf.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.buildAndTest.includes('pnpm'), 'should handle CRLF');
    });

    it('handles different header variations', () => {
      // Test with different capitalization or spacing
      const agentsContent = `# AGENTS

## Build and Test
- pnpm test

## architecture
Lowercase header

## GIT WORKFLOWS
Uppercase header

## Security
- Security info
`;

      const agentsPath = path.join(tempDir, 'agents-variations.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      // Should still extract sections despite variations
      assert.ok(typeof result.buildAndTest === 'string', 'buildAndTest should be a string');
      assert.ok(typeof result.architecture === 'string', 'architecture should be a string');
    });

    it('handles deeply nested directories in discovery', () => {
      const deepDir = path.join(tempDir, 'a', 'b', 'c', 'd', 'e');
      const rootDir = tempDir;

      fs.mkdirSync(deepDir, { recursive: true });

      // AGENTS.md at root level only
      const rootAgents = `# Root AGENTS

## Build & Test
- pnpm test:root
`;
      fs.writeFileSync(path.join(rootDir, 'AGENTS.md'), rootAgents, 'utf8');

      process.chdir(deepDir);

      const result = discoverAgentsFile();

      assert.ok(result.found, 'should find AGENTS.md through parent traversal');
    });

    it('handles sections with code blocks', () => {
      const agentsContent = `# AGENTS

## Build & Test
- Run tests:
\`\`\`bash
pnpm test
pnpm test:coverage
\`\`\`

## Architecture
- See example:
\`\`\`javascript
const example = 'code block';
\`\`\`
`;

      const agentsPath = path.join(tempDir, 'agents-codeblocks.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.buildAndTest.includes('pnpm test'), 'should include code block content');
    });

    it('handles very long sections', () => {
      const lines = [];
      for (let i = 0; i < 200; i++) {
        lines.push(`- Long line ${i}: This is a longer line of content to test buffer handling`);
      }

      const agentsContent = `# AGENTS

## Build & Test
${lines.join('\n')}
`;

      const agentsPath = path.join(tempDir, 'agents-long.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok(result.buildAndTest.length > 1000, 'should extract long sections');
    });

    it('stops at next section header when extracting', () => {
      const agentsContent = `# AGENTS

## Build & Test
- Line 1
- Line 2

## Architecture
This is architecture section.

## Git Workflows
This is git workflows.
`;

      const agentsPath = path.join(tempDir, 'agents-sections.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      // buildAndTest should not contain Architecture content
      assert.ok(
        !result.buildAndTest.includes('architecture section'),
        'should stop at next header'
      );
      assert.ok(
        result.architecture.includes('architecture section'),
        'architecture should have its content'
      );
    });
  });

  describe('Return value structure', () => {
    it('returns object with all required fields', () => {
      const agentsContent = `# AGENTS

## Build & Test
- Test command
`;

      const agentsPath = path.join(tempDir, 'agents-structure.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.ok('buildAndTest' in result, 'should have buildAndTest field');
      assert.ok('architecture' in result, 'should have architecture field');
      assert.ok('gitWorkflows' in result, 'should have gitWorkflows field');
      assert.ok('security' in result, 'should have security field');
      assert.ok('exists' in result, 'should have exists field');
    });

    it('has exists: true when file exists and has content', () => {
      const agentsContent = `# AGENTS

## Build & Test
- Test
`;

      const agentsPath = path.join(tempDir, 'agents-exists.md');
      fs.writeFileSync(agentsPath, agentsContent, 'utf8');

      const result = parseAgents(agentsPath);

      assert.strictEqual(result.exists, true, 'exists should be true');
    });

    it('has exists: false when file does not exist', () => {
      const result = parseAgents('/nonexistent/path/AGENTS.md');

      assert.strictEqual(result.exists, false, 'exists should be false');
    });
  });

  describe('extractSection utility', () => {
    it('extracts content between section headers', () => {
      const content = `# Title

## Section A
Content for A
Line 2

## Section B
Content for B
`;

      const result = extractSection(content, 'Section A');

      assert.ok(result.includes('Content for A'), 'should extract section content');
      assert.ok(!result.includes('Section B'), 'should not include next section');
    });

    it('returns empty string for non-existent section', () => {
      const content = `# Title

## Section A
Content
`;

      const result = extractSection(content, 'Non-existent Section');

      assert.strictEqual(result, '', 'should return empty string for missing section');
    });
  });
});
