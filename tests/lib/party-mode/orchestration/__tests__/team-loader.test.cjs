/**
 * Team Loader Tests
 *
 * Tests for loading, validating, and listing team definitions from CSV files.
 *
 * RED phase: These tests MUST fail initially (module doesn't exist yet).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs/promises');
const path = require('path');

const PROJECT_ROOT = path.dirname(
  path.dirname(path.dirname(path.dirname(path.dirname(__dirname))))
);
const TEAMS_DIR = path.join(PROJECT_ROOT, '.claude', 'teams');
const TEST_TEAM_PATH = path.join(TEAMS_DIR, 'test-team-loader.csv');

// Import module under test (will fail initially - expected for RED phase)
const {
  loadTeam,
  validateTeamDefinition,
  getTeamList,
} = require('../../../.claude/lib/team-loader.cjs');

describe('Team Loader', () => {
  // Setup: Create test team CSV
  before(async () => {
    // Ensure teams directory exists
    await fs.mkdir(TEAMS_DIR, { recursive: true });

    // Create test team CSV
    const testTeamCsv = `agent_type,role,priority,tools,model
developer,implementer,1,"Read,Write,Edit,Bash",sonnet
security-architect,reviewer,2,"Read,Grep,Glob",opus
qa,validator,3,"Bash",haiku`;

    await fs.writeFile(TEST_TEAM_PATH, testTeamCsv, 'utf-8');
  });

  // Cleanup: Remove test team CSV
  after(async () => {
    try {
      await fs.unlink(TEST_TEAM_PATH);
    } catch (_err) {
      // Ignore if file doesn't exist
    }
  });

  describe('loadTeam', () => {
    it('should load valid team definition from CSV', async () => {
      const team = await loadTeam('test-team-loader');

      assert.ok(team, 'Team should be loaded');
      assert.strictEqual(team.teamName, 'test-team-loader');
      assert.ok(Array.isArray(team.agents), 'Team should have agents array');
      assert.strictEqual(team.agents.length, 3, 'Team should have 3 agents');
    });

    it('should parse agent fields correctly', async () => {
      const team = await loadTeam('test-team-loader');
      const developer = team.agents.find(a => a.agent_type === 'developer');

      assert.ok(developer, 'Developer agent should exist');
      assert.strictEqual(developer.role, 'implementer');
      assert.strictEqual(developer.priority, 1);
      assert.deepStrictEqual(developer.tools, ['Read', 'Write', 'Edit', 'Bash']);
      assert.strictEqual(developer.model, 'sonnet');
    });

    it('should throw error for non-existent team', async () => {
      await assert.rejects(
        async () => await loadTeam('nonexistent-team'),
        /Team.*not found/,
        'Should throw error for missing team'
      );
    });
  });

  describe('validateTeamDefinition', () => {
    it('should validate team with correct structure', () => {
      const validTeam = {
        teamName: 'test-team',
        agents: [
          {
            agent_type: 'developer',
            role: 'implementer',
            priority: 1,
            tools: ['Read', 'Write'],
            model: 'sonnet',
          },
        ],
      };

      const result = validateTeamDefinition(validTeam);

      assert.ok(result.valid, 'Valid team should pass validation');
      assert.strictEqual(result.errors.length, 0, 'Valid team should have no errors');
    });

    it('should reject team with more than 4 agents', () => {
      const oversizedTeam = {
        teamName: 'oversized-team',
        agents: [
          {
            agent_type: 'developer',
            role: 'implementer',
            priority: 1,
            tools: ['Read'],
            model: 'sonnet',
          },
          {
            agent_type: 'architect',
            role: 'designer',
            priority: 2,
            tools: ['Read'],
            model: 'sonnet',
          },
          { agent_type: 'qa', role: 'validator', priority: 3, tools: ['Bash'], model: 'haiku' },
          {
            agent_type: 'security-architect',
            role: 'reviewer',
            priority: 4,
            tools: ['Read'],
            model: 'opus',
          },
          { agent_type: 'pm', role: 'coordinator', priority: 5, tools: ['Read'], model: 'sonnet' },
        ],
      };

      const result = validateTeamDefinition(oversizedTeam);

      assert.strictEqual(result.valid, false, 'Oversized team should fail validation');
      assert.ok(
        result.errors.some(e => e.includes('4 agents')),
        'Error should mention 4 agent limit'
      );
    });

    it('should reject agent with invalid role', () => {
      const invalidRoleTeam = {
        teamName: 'invalid-role-team',
        agents: [
          {
            agent_type: 'developer',
            role: 'invalid-role',
            priority: 1,
            tools: ['Read'],
            model: 'sonnet',
          },
        ],
      };

      const result = validateTeamDefinition(invalidRoleTeam);

      assert.strictEqual(result.valid, false, 'Invalid role should fail validation');
      assert.ok(
        result.errors.some(e => e.includes('role')),
        'Error should mention invalid role'
      );
    });

    it('should reject agent with invalid model', () => {
      const invalidModelTeam = {
        teamName: 'invalid-model-team',
        agents: [
          {
            agent_type: 'developer',
            role: 'implementer',
            priority: 1,
            tools: ['Read'],
            model: 'invalid-model',
          },
        ],
      };

      const result = validateTeamDefinition(invalidModelTeam);

      assert.strictEqual(result.valid, false, 'Invalid model should fail validation');
      assert.ok(
        result.errors.some(e => e.includes('model')),
        'Error should mention invalid model'
      );
    });

    it('should reject agent with missing required fields', () => {
      const missingFieldsTeam = {
        teamName: 'missing-fields-team',
        agents: [
          { agent_type: 'developer', role: 'implementer' }, // Missing priority, tools, model
        ],
      };

      const result = validateTeamDefinition(missingFieldsTeam);

      assert.strictEqual(result.valid, false, 'Missing fields should fail validation');
      assert.ok(result.errors.length > 0, 'Should have validation errors');
    });
  });

  describe('getTeamList', () => {
    it('should list all available teams', async () => {
      const teams = await getTeamList();

      assert.ok(Array.isArray(teams), 'Should return array');
      assert.ok(teams.includes('test-team-loader'), 'Should include test team');
    });

    it('should exclude non-CSV files', async () => {
      // Create non-CSV file
      const nonCsvPath = path.join(TEAMS_DIR, 'not-a-team.txt');
      await fs.writeFile(nonCsvPath, 'Not a CSV file', 'utf-8');

      const teams = await getTeamList();

      assert.ok(!teams.includes('not-a-team'), 'Should not include non-CSV files');

      // Cleanup
      await fs.unlink(nonCsvPath);
    });
  });
});
