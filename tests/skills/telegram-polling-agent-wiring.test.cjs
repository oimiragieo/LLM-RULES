'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

/**
 * Read all agent .md files under .claude/agents/
 * Returns array of { filePath, content }
 */
function readAllAgentFiles() {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md') && entry.name !== 'CLAUDE.md') {
        results.push({ filePath: full, content: fs.readFileSync(full, 'utf8') });
      }
    }
  }
  walk(AGENTS_DIR);
  return results;
}

/**
 * Parse the skills: array from YAML frontmatter of an agent file.
 * Returns array of skill names.
 */
function parseSkillsFromFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  // Find skills: block
  const skillsStart = fm.indexOf('\nskills:');
  if (skillsStart === -1) return [];
  const afterSkills = fm.slice(skillsStart + 8); // skip '\nskills:'
  const lines = afterSkills.split('\n');
  const skills = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      skills.push(trimmed.slice(2).trim());
    } else if (trimmed && !trimmed.startsWith('-')) {
      // End of skills block (another key)
      break;
    }
  }
  return skills;
}

describe('telegram-polling skill agent wiring', () => {
  test('SKILL.md exists for telegram-polling', () => {
    const skillPath = path.join(PROJECT_ROOT, '.claude', 'skills', 'telegram-polling', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), 'telegram-polling SKILL.md must exist at .claude/skills/telegram-polling/SKILL.md');
  });

  test('at least one agent file under .claude/agents/ lists telegram-polling in its skills: frontmatter', () => {
    const agentFiles = readAllAgentFiles();
    const agentsWithSkill = agentFiles.filter(({ content }) => {
      const skills = parseSkillsFromFrontmatter(content);
      return skills.includes('telegram-polling');
    });
    assert.ok(
      agentsWithSkill.length >= 1,
      `Expected at least 1 agent to list telegram-polling in skills:, found 0. ` +
      `Check .claude/agents/ frontmatter.`
    );
  });

  test('artifact-integrator specifically lists telegram-polling in skills:', () => {
    const agentPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'agents',
      'orchestrators',
      'artifact-integrator.md'
    );
    assert.ok(
      fs.existsSync(agentPath),
      'artifact-integrator.md must exist at .claude/agents/orchestrators/artifact-integrator.md'
    );
    const content = fs.readFileSync(agentPath, 'utf8');
    const skills = parseSkillsFromFrontmatter(content);
    assert.ok(
      skills.includes('telegram-polling'),
      `artifact-integrator.md skills: array must include 'telegram-polling'. ` +
      `Current skills: ${skills.join(', ')}`
    );
  });

  test('artifact-integrator retains its original skills (no skills removed)', () => {
    const agentPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'agents',
      'orchestrators',
      'artifact-integrator.md'
    );
    const content = fs.readFileSync(agentPath, 'utf8');
    const skills = parseSkillsFromFrontmatter(content);
    const requiredOriginalSkills = [
      'artifact-integrator',
      'code-semantic-search',
      'context-compressor',
      'ripgrep',
      'verification-before-completion',
    ];
    for (const skill of requiredOriginalSkills) {
      assert.ok(
        skills.includes(skill),
        `artifact-integrator.md must retain original skill '${skill}'. ` +
        `Current skills: ${skills.join(', ')}`
      );
    }
  });
});
