'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRequiredToolsUnionForAgent,
  getSkillEntryVariants,
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
