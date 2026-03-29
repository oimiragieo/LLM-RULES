'use strict';

/**
 * Tests for mission-parser.cjs
 *
 * Validates VAL-MP-001, VAL-MP-002, VAL-MP-003 from validation-contract.md
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const {
  parseMission,
  injectMissionContext,
} = require('../../.claude/lib/mission/mission-parser.cjs');

describe('Mission Parser', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-parser-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('VAL-MP-001: Extracts objectives from mission.md', () => {
    it('extracts ## Objectives bullet points as array', () => {
      const missionContent = `# Mission Title

## Objectives
- Build a mission engine for multi-agent orchestration
- Create workspace provisioning for isolated environments
- Implement state machine for feature lifecycle

## Anti-Goals
- Do not modify existing routing system

## Architectural Decisions
- Use CommonJS for all modules
`;

      const missionPath = path.join(tempDir, 'mission-001.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.ok(Array.isArray(result.objectives), 'objectives should be an array');
      assert.strictEqual(result.objectives.length, 3, 'should extract 3 objectives');
      assert.ok(
        result.objectives[0].includes('Build a mission engine'),
        'First objective should contain expected text'
      );
    });

    it('extracts ## Anti-Goals section', () => {
      const missionContent = `# Mission Title

## Objectives
- First objective

## Anti-Goals
- Do not modify routing system
- Avoid scope creep

## Architectural Decisions
- Use AJV for validation
`;

      const missionPath = path.join(tempDir, 'mission-002.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.ok(Array.isArray(result.antiGoals), 'antiGoals should be an array');
      assert.strictEqual(result.antiGoals.length, 2, 'should extract 2 anti-goals');
    });

    it('extracts ## Architectural Decisions section', () => {
      const missionContent = `# Mission Title

## Objectives
- First objective

## Architectural Decisions
- Use CommonJS modules (.cjs)
- Use node:test for testing
- Use AJV for JSON schema validation
`;

      const missionPath = path.join(tempDir, 'mission-003.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.ok(
        Array.isArray(result.architecturalDecisions),
        'architecturalDecisions should be an array'
      );
      assert.strictEqual(result.architecturalDecisions.length, 3, 'should extract 3 decisions');
    });

    it('returns rawContent field with original file content', () => {
      const missionContent = `# Mission Title

## Objectives
- First objective
`;

      const missionPath = path.join(tempDir, 'mission-004.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.strictEqual(result.rawContent, missionContent, 'rawContent should match file content');
    });

    it('handles nested bullet points (indented under main bullets)', () => {
      const missionContent = `# Mission Title

## Objectives
- Build mission engine
  - Workspace provisioning
  - State machine
- Create validation system
`;

      const missionPath = path.join(tempDir, 'mission-005.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      // Should capture the main bullets and sub-bullets
      assert.ok(result.objectives.length >= 2, 'should capture main objectives');
    });
  });

  describe('VAL-MP-002: Missing sections return empty arrays', () => {
    it('returns empty arrays when sections are missing', () => {
      const missionContent = `# Mission Title

This mission has no structured sections.

Just some freeform text.
`;

      const missionPath = path.join(tempDir, 'mission-empty-001.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.ok(Array.isArray(result.objectives), 'objectives should be an array');
      assert.ok(Array.isArray(result.antiGoals), 'antiGoals should be an array');
      assert.ok(
        Array.isArray(result.architecturalDecisions),
        'architecturalDecisions should be an array'
      );

      assert.strictEqual(result.objectives.length, 0, 'objectives should be empty');
      assert.strictEqual(result.antiGoals.length, 0, 'antiGoals should be empty');
      assert.strictEqual(
        result.architecturalDecisions.length,
        0,
        'architecturalDecisions should be empty'
      );
    });

    it('returns empty arrays for file with no content', () => {
      const missionContent = '';

      const missionPath = path.join(tempDir, 'mission-empty-002.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.strictEqual(result.objectives.length, 0, 'objectives should be empty for empty file');
      assert.strictEqual(result.antiGoals.length, 0, 'antiGoals should be empty for empty file');
      assert.strictEqual(
        result.architecturalDecisions.length,
        0,
        'decisions should be empty for empty file'
      );
      assert.strictEqual(result.rawContent, '', 'rawContent should be empty string');
    });

    it('returns default structure for non-existent file', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.md');

      const result = parseMission(nonExistentPath);

      assert.ok(Array.isArray(result.objectives), 'objectives should be an array');
      assert.strictEqual(result.objectives.length, 0, 'objectives should be empty');
      assert.strictEqual(result.antiGoals.length, 0, 'antiGoals should be empty');
      assert.strictEqual(result.architecturalDecisions.length, 0, 'decisions should be empty');
      assert.strictEqual(result.rawContent, '', 'rawContent should be empty string');
    });

    it('does NOT throw errors for missing sections', () => {
      const missionContent = `# Mission Title

Only objectives here.

## Objectives
- Single objective
`;

      const missionPath = path.join(tempDir, 'mission-partial.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      // Should not throw
      assert.doesNotThrow(() => {
        const result = parseMission(missionPath);
        assert.strictEqual(result.objectives.length, 1);
        assert.strictEqual(result.antiGoals.length, 0);
        assert.strictEqual(result.architecturalDecisions.length, 0);
      }, 'parseMission should not throw for missing sections');
    });

    it('handles partial sections gracefully', () => {
      const missionContent = `# Mission Title

## Objectives
- Obj 1

## Anti-Goals
(no actual bullets here, just text)

## Architectural Decisions
- Decision 1
`;

      const missionPath = path.join(tempDir, 'mission-partial-bullets.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      // Should not crash, should extract what it can
      assert.ok(Array.isArray(result.objectives), 'objectives should be an array');
      assert.ok(Array.isArray(result.antiGoals), 'antiGoals should be an array');
    });
  });

  describe('VAL-MP-003: Context injection into worker prompts', () => {
    it('appends ## Mission Context section with objectives', () => {
      const originalPrompt = 'You are a worker. Complete your assigned task.';

      const parsed = {
        objectives: [
          'Build mission engine for multi-agent orchestration',
          'Create workspace provisioning for isolated environments',
        ],
        antiGoals: [],
        architecturalDecisions: [],
        rawContent: '',
      };

      const result = injectMissionContext(originalPrompt, parsed);

      assert.ok(result.includes('## Mission Context'), 'should include Mission Context section');
      assert.ok(result.includes('Build mission engine'), 'should include first objective');
      assert.ok(
        result.includes('Create workspace provisioning'),
        'should include second objective'
      );
    });

    it('preserves original prompt content', () => {
      const originalPrompt = 'You are a worker. Complete your assigned task.';

      const parsed = {
        objectives: ['Objective 1'],
        antiGoals: [],
        architecturalDecisions: [],
        rawContent: '',
      };

      const result = injectMissionContext(originalPrompt, parsed);

      assert.ok(result.startsWith(originalPrompt), 'should preserve original prompt');
    });

    it('handles empty objectives gracefully', () => {
      const originalPrompt = 'You are a worker.';

      const parsed = {
        objectives: [],
        antiGoals: [],
        architecturalDecisions: [],
        rawContent: '',
      };

      const result = injectMissionContext(originalPrompt, parsed);

      // Should still add a section header, maybe with a warning
      assert.ok(result.includes('## Mission Context'), 'should still add Mission Context section');
    });

    it('includes anti-goals in context when present', () => {
      const originalPrompt = 'You are a worker.';

      const parsed = {
        objectives: ['Objective 1'],
        antiGoals: ['Do not modify existing routing'],
        architecturalDecisions: [],
        rawContent: '',
      };

      const result = injectMissionContext(originalPrompt, parsed);

      assert.ok(
        result.includes('Anti-Goals') || result.includes('anti-goals'),
        'should mention anti-goals'
      );
      assert.ok(
        result.includes('Do not modify existing routing'),
        'should include anti-goal content'
      );
    });

    it('includes architectural decisions in context when present', () => {
      const originalPrompt = 'You are a worker.';

      const parsed = {
        objectives: ['Objective 1'],
        antiGoals: [],
        architecturalDecisions: ['Use CommonJS modules', 'Use AJV for validation'],
        rawContent: '',
      };

      const result = injectMissionContext(originalPrompt, parsed);

      assert.ok(
        result.includes('Architectural Decisions') || result.includes('architectural decisions'),
        'should mention architectural decisions'
      );
      assert.ok(result.includes('Use CommonJS'), 'should include decision content');
    });
  });

  describe('Edge cases and robustness', () => {
    it('handles different header levels (## vs ###)', () => {
      const missionContent = `# Mission Title

## Objectives
- Obj 1

### Extra Details
Some nested section

## Anti-Goals
- Anti-goal 1
`;

      const missionPath = path.join(tempDir, 'mission-headers.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.strictEqual(result.objectives.length, 1, 'should extract objectives');
      assert.strictEqual(result.antiGoals.length, 1, 'should extract anti-goals');
    });

    it('handles Windows line endings (CRLF)', () => {
      const missionContent = '# Mission Title\r\n\r\n## Objectives\r\n- Obj 1\r\n- Obj 2\r\n';

      const missionPath = path.join(tempDir, 'mission-crlf.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.strictEqual(result.objectives.length, 2, 'should handle CRLF correctly');
    });

    it('handles malformed markdown gracefully (no crash)', () => {
      const missionContent = `# Mission Title

## Objectives
- Not closed bullet
  - Nested but weird
## Anti-Goals (no newline)
- Anti-goal without proper spacing
### Random section
`;

      const missionPath = path.join(tempDir, 'mission-malformed.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      // Should not throw
      assert.doesNotThrow(() => {
        parseMission(missionPath);
      }, 'parseMission should not crash on malformed markdown');
    });

    it('handles very long content', () => {
      const objectives = [];
      for (let i = 0; i < 100; i++) {
        objectives.push(
          `- Objective ${i}: A longer objective text that might exceed typical buffer sizes`
        );
      }

      const missionContent = `# Mission Title

## Objectives
${objectives.join('\n')}
`;

      const missionPath = path.join(tempDir, 'mission-long.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.ok(
        result.objectives.length >= 90,
        'should extract most/all objectives from long file'
      );
    });

    it('handles mixed content with code blocks', () => {
      const missionContent = `# Mission Title

## Objectives
- Build the mission engine
- See code below for reference

\`\`\`javascript
// This code block should not be parsed as objectives
const foo = 'bar';
\`\`\`

## Anti-Goals
- Do not break existing tests
`;

      const missionPath = path.join(tempDir, 'mission-code.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      // Should extract objectives but not the code block
      assert.ok(result.objectives.length >= 2, 'should extract objectives');
      assert.ok(
        !result.objectives.some(o => o.includes('const foo')),
        'should not include code block content as objectives'
      );
    });
  });

  describe('Return value structure', () => {
    it('returns object with all required fields', () => {
      const missionContent = `# Mission

## Objectives
- Obj 1
`;

      const missionPath = path.join(tempDir, 'mission-structure.md');
      fs.writeFileSync(missionPath, missionContent, 'utf8');

      const result = parseMission(missionPath);

      assert.ok('objectives' in result, 'should have objectives field');
      assert.ok('antiGoals' in result, 'should have antiGoals field');
      assert.ok('architecturalDecisions' in result, 'should have architecturalDecisions field');
      assert.ok('rawContent' in result, 'should have rawContent field');
    });

    it('returns default structure for completely empty file', () => {
      const missionPath = path.join(tempDir, 'empty-mission.md');
      fs.writeFileSync(missionPath, '', 'utf8');

      const result = parseMission(missionPath);

      assert.deepStrictEqual(
        result,
        {
          objectives: [],
          antiGoals: [],
          architecturalDecisions: [],
          rawContent: '',
        },
        'should return default structure for empty file'
      );
    });
  });
});
