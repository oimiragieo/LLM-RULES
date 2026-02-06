#!/usr/bin/env node
/**
 * Tests for preset integration in spawn-prompt-assembler.cjs
 *
 * Tests the preset loading and injection mechanism that adds preset
 * skill invocation hints to spawned agent prompts when a preset is active.
 */

'use strict';

const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const _PRESETS_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'presets.json');
const ROUTER_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');

// Import functions under test - these will fail until we implement them
let loadPresets, getActivePreset, appendPresetSection;
try {
  const funcs = require(path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'spawn-prompt-assembler.cjs'));
  loadPresets = funcs.loadPresets;
  getActivePreset = funcs.getActivePreset;
  appendPresetSection = funcs.appendPresetSection;
} catch (_e) {
  // Functions don't exist yet - that's expected in RED phase
}

test('Preset Loading - should load presets from presets.json', () => {
  if (!loadPresets) {
    assert.fail('loadPresets function not exported yet');
  }
  const presets = loadPresets();
  assert.ok(presets, 'Presets should be loaded');
  assert.ok(presets.presets, 'Presets should have "presets" property');
  assert.ok(presets.presets['planning-heavy'], 'Should have planning-heavy preset');
  assert.strictEqual(presets.presets['planning-heavy'].agentId, 'planner');
  assert.ok(Array.isArray(presets.presets['planning-heavy'].enabledSkills));
});

test('Preset Loading - should cache presets after first load', () => {
  if (!loadPresets) {
    assert.fail('loadPresets function not exported yet');
  }
  const presets1 = loadPresets();
  const presets2 = loadPresets();
  assert.strictEqual(presets1, presets2, 'Should return cached instance');
});

test('Active Preset Resolution - should detect preset from AGENT_PRESET env var', () => {
  if (!getActivePreset) {
    assert.fail('getActivePreset function not exported yet');
  }

  // Clean up
  if (fs.existsSync(ROUTER_STATE_PATH)) {
    fs.unlinkSync(ROUTER_STATE_PATH);
  }
  const oldEnv = process.env.AGENT_PRESET;

  try {
    process.env.AGENT_PRESET = 'planning-heavy';
    const preset = getActivePreset();
    assert.strictEqual(preset, 'planning-heavy', 'Should return preset from env var');
  } finally {
    if (oldEnv !== undefined) {
      process.env.AGENT_PRESET = oldEnv;
    } else {
      delete process.env.AGENT_PRESET;
    }
  }
});

test('Active Preset Resolution - should detect preset from router-state.json', () => {
  if (!getActivePreset) {
    assert.fail('getActivePreset function not exported yet');
  }

  const oldEnv = process.env.AGENT_PRESET;
  delete process.env.AGENT_PRESET;

  try {
    // Write router state with preset
    const runtimeDir = path.dirname(ROUTER_STATE_PATH);
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }
    fs.writeFileSync(ROUTER_STATE_PATH, JSON.stringify({ preset: 'developer' }), 'utf8');

    const preset = getActivePreset();
    assert.strictEqual(preset, 'developer', 'Should return preset from router-state.json');
  } finally {
    if (fs.existsSync(ROUTER_STATE_PATH)) {
      fs.unlinkSync(ROUTER_STATE_PATH);
    }
    if (oldEnv !== undefined) {
      process.env.AGENT_PRESET = oldEnv;
    }
  }
});

test('Active Preset Resolution - should prefer env var over router-state.json', () => {
  if (!getActivePreset) {
    assert.fail('getActivePreset function not exported yet');
  }

  const oldEnv = process.env.AGENT_PRESET;

  try {
    process.env.AGENT_PRESET = 'planning-heavy';
    const runtimeDir = path.dirname(ROUTER_STATE_PATH);
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }
    fs.writeFileSync(ROUTER_STATE_PATH, JSON.stringify({ preset: 'developer' }), 'utf8');

    const preset = getActivePreset();
    assert.strictEqual(preset, 'planning-heavy', 'Env var should take precedence');
  } finally {
    if (fs.existsSync(ROUTER_STATE_PATH)) {
      fs.unlinkSync(ROUTER_STATE_PATH);
    }
    if (oldEnv !== undefined) {
      process.env.AGENT_PRESET = oldEnv;
    } else {
      delete process.env.AGENT_PRESET;
    }
  }
});

test('Active Preset Resolution - should return null when no preset is active', () => {
  if (!getActivePreset) {
    assert.fail('getActivePreset function not exported yet');
  }

  const oldEnv = process.env.AGENT_PRESET;
  delete process.env.AGENT_PRESET;

  try {
    if (fs.existsSync(ROUTER_STATE_PATH)) {
      fs.unlinkSync(ROUTER_STATE_PATH);
    }

    const preset = getActivePreset();
    assert.strictEqual(preset, null, 'Should return null when no preset active');
  } finally {
    if (oldEnv !== undefined) {
      process.env.AGENT_PRESET = oldEnv;
    }
  }
});

test('Preset Section Injection - should append preset section when agent matches preset', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const presets = {
    presets: {
      'planning-heavy': {
        agentId: 'planner',
        enabledSkills: ['planning-with-files', 'task-breakdown', 'writing-plans'],
        ruleSnippetPath: null,
      },
    },
  };

  const basePrompt = 'You are PLANNER\n\n## AVAILABLE_TOOLS\n\n## AVAILABLE_SKILLS\n\n## SKILL DISCOVERY PROTOCOL';
  const result = appendPresetSection(basePrompt, 'planner', 'planning-heavy', presets);

  assert.ok(result.includes('## Active Preset: planning-heavy'), 'Should include preset header');
  assert.ok(result.includes('planning-with-files'), 'Should include first skill');
  assert.ok(result.includes('task-breakdown'), 'Should include second skill');
  assert.ok(result.includes('writing-plans'), 'Should include third skill');
});

test('Preset Section Injection - should not append section when agent does not match preset', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const presets = {
    presets: {
      'planning-heavy': {
        agentId: 'planner',
        enabledSkills: ['planning-with-files', 'task-breakdown', 'writing-plans'],
        ruleSnippetPath: null,
      },
    },
  };

  const basePrompt = 'You are DEVELOPER\n\n## AVAILABLE_TOOLS';
  const result = appendPresetSection(basePrompt, 'developer', 'planning-heavy', presets);

  assert.strictEqual(result, basePrompt, 'Should return unchanged prompt');
  assert.ok(!result.includes('Active Preset'), 'Should not add preset section');
});

test('Preset Section Injection - should not append section when no preset is active', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const presets = {
    presets: {
      'planning-heavy': {
        agentId: 'planner',
        enabledSkills: ['planning-with-files', 'task-breakdown', 'writing-plans'],
        ruleSnippetPath: null,
      },
    },
  };

  const basePrompt = 'You are PLANNER\n\n## AVAILABLE_TOOLS';
  const result = appendPresetSection(basePrompt, 'planner', null, presets);

  assert.strictEqual(result, basePrompt, 'Should return unchanged prompt');
});

test('Preset Section Injection - should not append section when preset not found', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const presets = {
    presets: {
      'planning-heavy': {
        agentId: 'planner',
        enabledSkills: ['planning-with-files', 'task-breakdown', 'writing-plans'],
        ruleSnippetPath: null,
      },
    },
  };

  const basePrompt = 'You are PLANNER\n\n## AVAILABLE_TOOLS';
  const result = appendPresetSection(basePrompt, 'planner', 'nonexistent', presets);

  assert.strictEqual(result, basePrompt, 'Should return unchanged prompt');
});

test('Preset Section Injection - should not duplicate preset section', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const presets = {
    presets: {
      'planning-heavy': {
        agentId: 'planner',
        enabledSkills: ['planning-with-files', 'task-breakdown', 'writing-plans'],
        ruleSnippetPath: null,
      },
    },
  };

  const basePrompt = 'You are PLANNER\n\n## Active Preset: planning-heavy\n\n## AVAILABLE_TOOLS';
  const result = appendPresetSection(basePrompt, 'planner', 'planning-heavy', presets);

  assert.strictEqual(result, basePrompt, 'Should not add duplicate preset section');
});

test('Preset Section Injection - should insert preset section before SKILL DISCOVERY PROTOCOL', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const presets = {
    presets: {
      'planning-heavy': {
        agentId: 'planner',
        enabledSkills: ['planning-with-files', 'task-breakdown', 'writing-plans'],
        ruleSnippetPath: null,
      },
    },
  };

  const basePrompt = 'You are PLANNER\n\n## AVAILABLE_TOOLS\n\n## SKILL DISCOVERY PROTOCOL\n\nContent here';
  const result = appendPresetSection(basePrompt, 'planner', 'planning-heavy', presets);

  const presetIndex = result.indexOf('## Active Preset');
  const skillProtocolIndex = result.indexOf('## SKILL DISCOVERY PROTOCOL');
  assert.ok(presetIndex < skillProtocolIndex, 'Preset section should come before SKILL DISCOVERY PROTOCOL');
});

test('Preset Section Injection - should handle empty enabledSkills array gracefully', () => {
  if (!appendPresetSection) {
    assert.fail('appendPresetSection function not exported yet');
  }

  const emptyPresets = {
    presets: {
      'empty-preset': {
        agentId: 'planner',
        enabledSkills: [],
        ruleSnippetPath: null,
      },
    },
  };
  const basePrompt = 'You are PLANNER\n\n## AVAILABLE_TOOLS';
  const result = appendPresetSection(basePrompt, 'planner', 'empty-preset', emptyPresets);

  // Should skip injection when no skills to add
  assert.strictEqual(result, basePrompt, 'Should skip injection for empty skills');
});
