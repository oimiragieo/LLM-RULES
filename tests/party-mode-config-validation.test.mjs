import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const PROJECT_ROOT = process.cwd();

describe('Party Mode Configuration', () => {
  it('should have feature flag enabled', () => {
    const configPath = path.join(PROJECT_ROOT, '.claude', 'config.yaml');
    const config = yaml.load(fs.readFileSync(configPath, 'utf-8'));

    assert.strictEqual(config.features.partyMode.enabled, true, 'Party Mode should be enabled');
    assert.strictEqual(
      config.features.partyMode.maxAgents,
      4,
      'maxAgents should be 4 (SEC-PM-005)'
    );
    assert.strictEqual(
      config.features.partyMode.maxRounds,
      10,
      'maxRounds should be 10 (SEC-PM-005)'
    );
    assert.strictEqual(
      config.features.partyMode.contextWarning,
      100000,
      'contextWarning should be 100000'
    );
    assert.strictEqual(
      config.features.partyMode.contextLimit,
      150000,
      'contextLimit should be 150000'
    );
  });

  it('should have all 3 default teams', () => {
    const teamsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'teams');
    const teams = ['code-review.csv', 'secure-implementation.csv', 'architecture-decision.csv'];

    for (const team of teams) {
      const teamPath = path.join(teamsDir, team);
      assert.ok(fs.existsSync(teamPath), `Team ${team} should exist`);

      const content = fs.readFileSync(teamPath, 'utf-8');
      assert.ok(
        content.includes('agent_type,role,priority,tools,model'),
        `Team ${team} should have header`
      );
      const lines = content.trim().split('\n');
      assert.ok(
        lines.length >= 2 && lines.length <= 5,
        `Team ${team} should have 1-4 agents (has ${lines.length - 1})`
      );
    }
  });

  it('should have valid CSV format', () => {
    const teamsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'teams');
    const teams = ['code-review.csv', 'secure-implementation.csv', 'architecture-decision.csv'];

    // Helper function to parse CSV lines (handles quoted strings)
    function parseCSVLine(line) {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }

      values.push(current.trim());
      return values;
    }

    for (const team of teams) {
      const teamPath = path.join(teamsDir, team);
      const content = fs.readFileSync(teamPath, 'utf-8');
      const lines = content.trim().split('\n');

      // Check header has 5 fields
      const header = parseCSVLine(lines[0]);
      assert.strictEqual(header.length, 5, `Team ${team} header should have 5 fields`);

      // Check each agent row has 5 fields
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        assert.strictEqual(
          fields.length,
          5,
          `Team ${team} line ${i + 1} should have 5 fields (has ${fields.length})`
        );
      }
    }
  });

  it('should have valid agent types', () => {
    const teamsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'teams');
    const teams = ['code-review.csv', 'secure-implementation.csv', 'architecture-decision.csv'];
    const validAgents = ['developer', 'code-reviewer', 'security-architect', 'qa', 'architect'];

    // Helper function to parse CSV lines (handles quoted strings)
    function parseCSVLine(line) {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    }

    for (const team of teams) {
      const teamPath = path.join(teamsDir, team);
      const content = fs.readFileSync(teamPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        const agentType = fields[0];
        assert.ok(
          validAgents.includes(agentType),
          `Team ${team} line ${i + 1}: invalid agent_type "${agentType}"`
        );
      }
    }
  });

  it('should have valid roles', () => {
    const teamsDir = path.join(PROJECT_ROOT, '.claude', 'teams');
    const teams = ['code-review.csv', 'secure-implementation.csv', 'architecture-decision.csv'];
    const validRoles = ['implementer', 'reviewer', 'validator', 'coordinator'];

    // Helper function to parse CSV lines (handles quoted strings)
    function parseCSVLine(line) {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    }

    for (const team of teams) {
      const teamPath = path.join(teamsDir, team);
      const content = fs.readFileSync(teamPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        const role = fields[1];
        assert.ok(validRoles.includes(role), `Team ${team} line ${i + 1}: invalid role "${role}"`);
      }
    }
  });

  it('should have valid models', () => {
    const teamsDir = path.join(PROJECT_ROOT, '.claude', 'teams');
    const teams = ['code-review.csv', 'secure-implementation.csv', 'architecture-decision.csv'];
    const validModels = ['haiku', 'sonnet', 'opus'];

    // Helper function to parse CSV lines (handles quoted strings)
    function parseCSVLine(line) {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    }

    for (const team of teams) {
      const teamPath = path.join(teamsDir, team);
      const content = fs.readFileSync(teamPath, 'utf-8');
      const lines = content.trim().split('\n');

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        const model = fields[4];
        assert.ok(
          validModels.includes(model),
          `Team ${team} line ${i + 1}: invalid model "${model}"`
        );
      }
    }
  });
});
