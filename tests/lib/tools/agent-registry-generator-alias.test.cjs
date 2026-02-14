'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRequiredToolsUnionForAgent,
  getAssignedSkillsForAgent,
  getSkillEntryVariants,
  generateCapabilityCard,
} = require('../../../.claude/lib/tools/agent-registry-generator.cjs');

test('getSkillEntryVariants resolves canonical and nested creator names', () => {
  const canonical = getSkillEntryVariants('command-creator');
  assert.ok(canonical.includes('command-creator'));
  assert.ok(canonical.includes('creators/command-creator'));

  const nested = getSkillEntryVariants('creators/rule-creator');
  assert.ok(nested.includes('creators/rule-creator'));
  assert.ok(nested.includes('rule-creator'));
});

test('getRequiredToolsUnionForAgent resolves matrix canonical names against nested skill index entries', () => {
  const matrix = {
    agents: {
      orchestrator: {
        'evolution-orchestrator': {
          primary: ['command-creator', 'rule-creator', 'tool-creator'],
          secondary: [],
          always: [],
          contextual: {},
        },
      },
    },
  };

  const skillIndex = {
    skills: {
      'creators/command-creator': { requiredTools: ['Task', 'Write'] },
      'creators/rule-creator': { requiredTools: ['Read', 'Edit'] },
      'creators/tool-creator': { requiredTools: ['Bash'] },
    },
  };

  const tools = getRequiredToolsUnionForAgent('evolution-orchestrator', matrix, skillIndex);
  assert.ok(tools.includes('Task'));
  assert.ok(tools.includes('Write'));
  assert.ok(tools.includes('Read'));
  assert.ok(tools.includes('Edit'));
  assert.ok(tools.includes('Bash'));
});

test('getRequiredToolsUnionForAgent resolves matrix nested names against canonical skill index entries', () => {
  const matrix = {
    agents: {
      orchestrator: {
        'evolution-orchestrator': {
          primary: ['creators/command-creator', 'creators/rule-creator'],
          secondary: [],
          always: [],
          contextual: {},
        },
      },
    },
  };

  const skillIndex = {
    skills: {
      'command-creator': { requiredTools: ['Task', 'Skill'] },
      'rule-creator': { requiredTools: ['Read'] },
    },
  };

  const tools = getRequiredToolsUnionForAgent('evolution-orchestrator', matrix, skillIndex);
  assert.ok(tools.includes('Task'));
  assert.ok(tools.includes('Skill'));
  assert.ok(tools.includes('Read'));
});

test('getAssignedSkillsForAgent resolves aliases and keeps frontmatter skills first', () => {
  const matrix = {
    agents: {
      orchestrator: {
        'evolution-orchestrator': {
          primary: ['command-creator', 'creators/rule-creator'],
          secondary: [],
          always: [],
          contextual: {},
        },
      },
    },
  };

  const skillIndex = {
    skills: {
      'creators/command-creator': { requiredTools: ['Task'] },
      'rule-creator': { requiredTools: ['Read'] },
      'artifact-integrator': { requiredTools: ['Task'] },
    },
  };

  const assigned = getAssignedSkillsForAgent(
    'evolution-orchestrator',
    matrix,
    skillIndex,
    ['artifact-integrator']
  );

  assert.deepEqual(assigned.slice(0, 3), [
    'artifact-integrator',
    'creators/command-creator',
    'rule-creator',
  ]);
});

test('generateCapabilityCard uses provided assignedSkills over frontmatter skills', () => {
  const card = generateCapabilityCard(
    { name: 'test-agent', description: 'desc', skills: ['old-skill'] },
    'test-agent',
    'core',
    '.claude/agents/core/test-agent.md',
    ['Read'],
    ['new-skill-a', 'new-skill-b']
  );

  const skills = card.capabilities[0].skills;
  assert.ok(skills.includes('new-skill-a'));
  assert.ok(skills.includes('new-skill-b'));
  assert.equal(skills.includes('old-skill'), false);
});