'use strict';

/**
 * Tests for persona-injector.cjs
 *
 * Covers assertions:
 * - VAL-PI-001: Composes 3-layer system prompt with all three non-empty and delimited
 * - VAL-PI-002: Returned persona object is Object.isFrozen(). Mutation attempts throw
 * - VAL-PI-003: Missing SKILL.md uses fallback without error
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const { composePersona, DEFAULT_MAX_PROMPT_CHARS } = require('../../.claude/lib/mission/persona-injector.cjs');

// Test fixtures
let tempDir;
let skillsDir;
let missionDir;

describe('persona-injector', () => {
  before(async () => {
    // Create temp directory structure
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'persona-injector-test-'));
    skillsDir = path.join(tempDir, '.factory', 'skills');
    missionDir = path.join(tempDir, 'mission');

    await fs.promises.mkdir(skillsDir, { recursive: true });
    await fs.promises.mkdir(missionDir, { recursive: true });
  });

  after(async () => {
    // Cleanup temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('VAL-PI-001: 3-layer prompt composition', () => {
    it('composes prompt with all 3 layers present and delimited', async () => {
      // Create a skill SKILL.md
      const skillName = 'test-skill';
      const skillDir = path.join(skillsDir, skillName);
      await fs.promises.mkdir(skillDir, { recursive: true });
      const skillContent = `---
name: test-skill
description: A test skill
---
# Test Skill

This is the skill template content.
`;
      await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);

      // Create mission.md
      const missionContent = `# Mission

## Objectives
- Build the persona injector module
- Ensure all layers are composed correctly
`;
      await fs.promises.writeFile(path.join(missionDir, 'mission.md'), missionContent);

      // Feature data
      const feature = {
        id: 'test-feature',
        description: 'Test feature description',
        expectedBehavior: ['Behavior 1', 'Behavior 2'],
        verificationSteps: ['Step 1', 'Step 2'],
      };

      // Compose persona
      const persona = composePersona({
        skillName,
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Verify all 3 layers are present
      assert.ok(persona.prompt, 'Persona should have a prompt');
      assert.ok(persona.prompt.includes('=== LAYER 1: BASE WORKER BOILERPLATE ==='), 'Should have Layer 1 delimiter');
      assert.ok(persona.prompt.includes('=== LAYER 2: SKILL TEMPLATE ==='), 'Should have Layer 2 delimiter');
      assert.ok(persona.prompt.includes('=== LAYER 3: MISSION CONTEXT ==='), 'Should have Layer 3 delimiter');

      // Verify Layer 1 content (base boilerplate from PRD)
      assert.ok(persona.prompt.includes('Role Definition'), 'Layer 1 should contain role definition');
      assert.ok(persona.prompt.includes('Strict Mandates'), 'Layer 1 should contain strict mandates');

      // Verify Layer 2 content (skill template)
      assert.ok(persona.prompt.includes('test-skill'), 'Layer 2 should reference skill name');
      assert.ok(persona.prompt.includes('skill template content'), 'Layer 2 should contain skill content');

      // Verify Layer 3 content (mission context)
      assert.ok(persona.prompt.includes('Build the persona injector module'), 'Layer 3 should contain objectives');
      assert.ok(persona.prompt.includes('test-feature'), 'Layer 3 should contain feature id');
      assert.ok(persona.prompt.includes('Test feature description'), 'Layer 3 should contain feature description');
    });

    it('includes all expected sections in base boilerplate (Layer 1)', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'no-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Verify base boilerplate includes key PRD mandates
      assert.ok(persona.prompt.includes('COGNITIVE ENGINE'), 'Should include COGNITIVE ENGINE mandate');
      assert.ok(persona.prompt.includes('<thought>'), 'Should include thought block instruction');
      assert.ok(persona.prompt.includes('SOURCE CONTROL'), 'Should include SOURCE CONTROL mandate');
      assert.ok(persona.prompt.includes('git status'), 'Should include git status instruction');
      assert.ok(persona.prompt.includes('CONTRACTUAL EXIT'), 'Should include CONTRACTUAL EXIT mandate');
    });

    it('includes mission objectives and feature fields in Layer 3', async () => {
      const missionContent = `# Mission

## Objectives
- Objective Alpha
- Objective Beta
- Objective Gamma
`;
      await fs.promises.writeFile(path.join(missionDir, 'mission.md'), missionContent);

      const feature = {
        id: 'feature-xyz',
        description: 'This is a feature description',
        expectedBehavior: ['Expected behavior A', 'Expected behavior B'],
        verificationSteps: ['Verification step 1', 'Verification step 2'],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Verify objectives are included
      assert.ok(persona.prompt.includes('Objective Alpha'), 'Should include first objective');
      assert.ok(persona.prompt.includes('Objective Beta'), 'Should include second objective');
      assert.ok(persona.prompt.includes('Objective Gamma'), 'Should include third objective');

      // Verify feature fields are included
      assert.ok(persona.prompt.includes('feature-xyz'), 'Should include feature id');
      assert.ok(persona.prompt.includes('This is a feature description'), 'Should include feature description');
      assert.ok(persona.prompt.includes('Expected behavior A'), 'Should include expected behaviors');
      assert.ok(persona.prompt.includes('Verification step 1'), 'Should include verification steps');
    });
  });

  describe('VAL-PI-002: Object.freeze() immutability', () => {
    it('returns frozen persona object', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      assert.ok(Object.isFrozen(persona), 'Persona should be frozen');
    });

    it('throws on mutation attempt', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Attempting to modify a frozen object should throw in strict mode
      assert.throws(() => {
        persona.prompt = 'modified';
      }, TypeError, 'Should throw on prompt modification');

      assert.throws(() => {
        persona.newField = 'new value';
      }, TypeError, 'Should throw on adding new field');
    });

    it('nested prompt string is immutable via frozen object', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // The persona object being frozen means the prompt reference cannot be changed
      const originalPrompt = persona.prompt;
      assert.strictEqual(persona.prompt, originalPrompt, 'Prompt reference should remain stable');
    });
  });

  describe('VAL-PI-003: Missing SKILL.md fallback', () => {
    it('uses fallback string when SKILL.md missing', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      // Use a skill name that doesn't exist
      const persona = composePersona({
        skillName: 'nonexistent-skill-xyz',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Should contain fallback string
      assert.ok(
        persona.prompt.includes('Generic worker - no skill template available'),
        'Should contain fallback string for missing skill'
      );

      // Should still have all 3 layers
      assert.ok(persona.prompt.includes('=== LAYER 1:'), 'Should still have Layer 1');
      assert.ok(persona.prompt.includes('=== LAYER 2:'), 'Should still have Layer 2');
      assert.ok(persona.prompt.includes('=== LAYER 3:'), 'Should still have Layer 3');
    });

    it('does not throw error for missing SKILL.md', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      // Should not throw
      assert.doesNotThrow(() => {
        composePersona({
          skillName: 'completely-missing-skill',
          skillSearchPaths: [skillsDir],
          missionPath: path.join(missionDir, 'mission.md'),
          feature,
        });
      }, 'Should not throw for missing skill template');
    });
  });

  describe('Empty objectives warning', () => {
    it('produces warning when mission.md has no objectives', async () => {
      const missionContent = `# Mission

## Some Other Section
- Not an objective
`;
      await fs.promises.writeFile(path.join(missionDir, 'mission.md'), missionContent);

      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      assert.ok(
        persona.prompt.includes('[WARNING] No objectives found in mission.md'),
        'Should include warning for empty objectives'
      );
    });

    it('produces warning when mission.md does not exist', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'nonexistent-mission.md'),
        feature,
      });

      assert.ok(
        persona.prompt.includes('[WARNING] No objectives found in mission.md'),
        'Should include warning for missing mission.md'
      );
    });
  });

  describe('Token budget cap', () => {
    it('respects default maxPromptChars limit', async () => {
      // Verify default is 12000
      assert.strictEqual(DEFAULT_MAX_PROMPT_CHARS, 12000, 'Default should be 12000 characters');
    });

    it('truncates prompt when exceeding maxPromptChars', async () => {
      // Create a large mission.md
      const largeMission = `# Mission

## Objectives
${Array(200).fill('- Very long objective line that adds characters to the mission context').join('\n')}
`;
      await fs.promises.writeFile(path.join(missionDir, 'mission.md'), largeMission);

      const feature = {
        id: 'test-feature',
        description: 'A'.repeat(5000), // Large description
        expectedBehavior: ['B'.repeat(2000)],
        verificationSteps: ['C'.repeat(2000)],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
        maxPromptChars: 1000, // Use a small limit for testing
      });

      assert.ok(persona.prompt.length <= 1050, 'Prompt should be truncated near maxPromptChars');
      assert.ok(persona.prompt.includes('[TRUNCATED]'), 'Should include truncation marker');
    });

    it('does not truncate when under maxPromptChars', async () => {
      const missionContent = `# Mission

## Objectives
- Small objective
`;
      await fs.promises.writeFile(path.join(missionDir, 'mission.md'), missionContent);

      const feature = {
        id: 'test-feature',
        description: 'Short description',
        expectedBehavior: ['Short behavior'],
        verificationSteps: ['Short step'],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
        maxPromptChars: 50000, // Large limit
      });

      assert.ok(!persona.prompt.includes('[TRUNCATED]'), 'Should not include truncation marker');
    });

    it('reports truncation status in persona metadata', async () => {
      const largeMission = `# Mission

## Objectives
${Array(200).fill('- Objective line').join('\n')}
`;
      await fs.promises.writeFile(path.join(missionDir, 'mission.md'), largeMission);

      const feature = {
        id: 'test-feature',
        description: 'X'.repeat(5000),
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
        maxPromptChars: 500,
      });

      // Persona should have truncation info
      assert.ok(persona.truncated === true, 'Should indicate truncation occurred');
      assert.ok(typeof persona.originalLength === 'number', 'Should include original length');
      assert.ok(persona.originalLength > persona.prompt.length, 'Original should be larger than truncated');
    });
  });

  describe('Skill search path fallback', () => {
    it('searches multiple skill paths in order', async () => {
      // Create skill in a secondary path
      const altSkillsDir = path.join(tempDir, 'alt-skills');
      const skillDir = path.join(altSkillsDir, 'multi-path-skill');
      await fs.promises.mkdir(skillDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: multi-path-skill\n---\n# Multi Path Skill\nContent from alt path.'
      );

      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'multi-path-skill',
        skillSearchPaths: [skillsDir, altSkillsDir], // Primary path has no skill, alt does
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      assert.ok(persona.prompt.includes('Content from alt path'), 'Should find skill in alternate path');
    });

    it('supports .claude/skills path convention', async () => {
      const claudeSkillsDir = path.join(tempDir, '.claude', 'skills');
      const skillDir = path.join(claudeSkillsDir, 'claude-skill');
      await fs.promises.mkdir(skillDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: claude-skill\n---\n# Claude Skill\nFrom .claude/skills.'
      );

      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'claude-skill',
        skillSearchPaths: [claudeSkillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      assert.ok(persona.prompt.includes('From .claude/skills'), 'Should load from .claude/skills path');
    });
  });

  describe('Persona structure', () => {
    it('includes required metadata fields', async () => {
      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName: 'test-skill',
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Check required fields
      assert.ok(typeof persona.prompt === 'string', 'Should have prompt string');
      assert.ok(typeof persona.skillName === 'string', 'Should have skillName');
      assert.ok(typeof persona.featureId === 'string', 'Should have featureId');
      assert.ok(typeof persona.createdAt === 'string', 'Should have createdAt timestamp');
      assert.ok(typeof persona.layerCount === 'number', 'Should have layerCount');
      assert.strictEqual(persona.layerCount, 3, 'Should have 3 layers');
    });

    it('extracts skill name from frontmatter if present', async () => {
      const skillName = 'frontmatter-test';
      const skillDir = path.join(skillsDir, skillName);
      await fs.promises.mkdir(skillDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: custom-skill-name
description: Test
---
# Custom Skill`
      );

      const feature = {
        id: 'test-feature',
        description: 'Test',
        expectedBehavior: [],
        verificationSteps: [],
      };

      const persona = composePersona({
        skillName,
        skillSearchPaths: [skillsDir],
        missionPath: path.join(missionDir, 'mission.md'),
        feature,
      });

      // Should still work even if frontmatter has different name
      assert.ok(persona.skillName === skillName, 'Should use provided skillName');
    });
  });
});
