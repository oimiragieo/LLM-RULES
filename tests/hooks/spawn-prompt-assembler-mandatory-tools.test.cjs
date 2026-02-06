#!/usr/bin/env node
/**
 * Test Suite: Mandatory Tools Enforcement
 * ========================================
 *
 * Validates that:
 * 1. All agents in agent-config.json have mandatory tools (TaskUpdate, Skill)
 * 2. tool-manifest.json defines mandatoryTools validation rules
 * 3. spawn-prompt-assembler.cjs has defensive fallback for mandatory tools
 * 4. All config JSON files are syntactically valid
 *
 * Task ID: fix-tool-param-004
 */

'use strict';

const { describe, test, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// =============================================================================
// Configuration
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const AGENT_CONFIG_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'agent-config.json');
const TOOL_MANIFEST_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'tool-manifest.json');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'spawn-prompt-assembler.cjs'
);

const MANDATORY_TOOLS = ['TaskUpdate', 'Skill'];

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Safely parse JSON file, returning null if parse fails
 * @param {string} filePath - Path to JSON file
 * @returns {object|null} Parsed JSON or null
 */
function safeParseJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return null;
  }
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to file
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_e) {
    return false;
  }
}

// =============================================================================
// TEST SUITE 1: Validate agent-config.json has mandatory tools
// =============================================================================

describe('TEST SUITE 1: agent-config.json mandatory tools', () => {
  let config = null;

  before(() => {
    config = safeParseJson(AGENT_CONFIG_PATH);
  });

  test('should have valid agent-config.json file', () => {
    assert.ok(
      fileExists(AGENT_CONFIG_PATH),
      `agent-config.json should exist at ${AGENT_CONFIG_PATH}`
    );
    assert.ok(config !== null, 'agent-config.json should be valid JSON');
  });

  test('should have agents object defined', () => {
    assert.ok(config, 'Config should be loaded');
    assert.ok(config.agents, 'Config should have agents property');
    assert.strictEqual(typeof config.agents, 'object', 'agents should be an object');
  });

  test('should have TaskUpdate in all agents tools array', () => {
    assert.ok(config && config.agents, 'Config with agents should be loaded');
    const agents = config.agents || {};

    for (const [agentName, agentConfig] of Object.entries(agents)) {
      const tools = agentConfig.tools || [];
      assert.ok(Array.isArray(tools), `Agent "${agentName}" tools should be an array`);
      assert.ok(
        tools.includes('TaskUpdate'),
        `Agent "${agentName}" must have TaskUpdate in tools array. Found: [${tools.join(', ')}]`
      );
    }
  });

  test('should have Skill in all agents tools array', () => {
    assert.ok(config && config.agents, 'Config with agents should be loaded');
    const agents = config.agents || {};

    for (const [agentName, agentConfig] of Object.entries(agents)) {
      const tools = agentConfig.tools || [];
      assert.ok(Array.isArray(tools), `Agent "${agentName}" tools should be an array`);
      assert.ok(
        tools.includes('Skill'),
        `Agent "${agentName}" must have Skill in tools array. Found: [${tools.join(', ')}]`
      );
    }
  });

  test('should have all mandatory tools for each agent', () => {
    assert.ok(config && config.agents, 'Config with agents should be loaded');
    const agents = config.agents || {};

    for (const [agentName, agentConfig] of Object.entries(agents)) {
      const tools = agentConfig.tools || [];

      for (const mandatoryTool of MANDATORY_TOOLS) {
        assert.ok(
          tools.includes(mandatoryTool),
          `Agent "${agentName}" must have ${mandatoryTool}. Found: [${tools.join(', ')}]`
        );
      }
    }
  });

  test('read-only agents (code-reviewer, researcher) should still have mandatory tools', () => {
    assert.ok(config && config.agents, 'Config with agents should be loaded');

    // Specifically check read-only-like agents
    const readOnlyAgents = ['code-reviewer', 'researcher'];

    for (const agentName of readOnlyAgents) {
      if (config.agents[agentName]) {
        const tools = config.agents[agentName].tools || [];

        for (const mandatoryTool of MANDATORY_TOOLS) {
          assert.ok(
            tools.includes(mandatoryTool),
            `Read-only agent "${agentName}" must still have ${mandatoryTool}. Found: [${tools.join(', ')}]`
          );
        }
      }
    }
  });
});

// =============================================================================
// TEST SUITE 2: Validate tool-manifest.json structure
// =============================================================================

describe('TEST SUITE 2: tool-manifest.json mandatory tools definition', () => {
  let manifest = null;

  before(() => {
    manifest = safeParseJson(TOOL_MANIFEST_PATH);
  });

  test('should have valid tool-manifest.json file', () => {
    assert.ok(
      fileExists(TOOL_MANIFEST_PATH),
      `tool-manifest.json should exist at ${TOOL_MANIFEST_PATH}`
    );
    assert.ok(manifest !== null, 'tool-manifest.json should be valid JSON');
  });

  test('should have validation object', () => {
    assert.ok(manifest, 'Manifest should be loaded');
    assert.ok(manifest.validation, 'Manifest should have validation property');
    assert.strictEqual(typeof manifest.validation, 'object', 'validation should be an object');
  });

  test('should have mandatoryTools array in validation', () => {
    assert.ok(manifest && manifest.validation, 'Manifest with validation should be loaded');
    assert.ok(manifest.validation.mandatoryTools, 'validation should have mandatoryTools property');
    assert.ok(
      Array.isArray(manifest.validation.mandatoryTools),
      'mandatoryTools should be an array'
    );
  });

  test('should have TaskUpdate in mandatoryTools', () => {
    assert.ok(
      manifest && manifest.validation && Array.isArray(manifest.validation.mandatoryTools),
      'mandatoryTools array should exist'
    );
    assert.ok(
      manifest.validation.mandatoryTools.includes('TaskUpdate'),
      `mandatoryTools should include TaskUpdate. Found: [${manifest.validation.mandatoryTools.join(', ')}]`
    );
  });

  test('should have Skill in mandatoryTools', () => {
    assert.ok(
      manifest && manifest.validation && Array.isArray(manifest.validation.mandatoryTools),
      'mandatoryTools array should exist'
    );
    assert.ok(
      manifest.validation.mandatoryTools.includes('Skill'),
      `mandatoryTools should include Skill. Found: [${manifest.validation.mandatoryTools.join(', ')}]`
    );
  });

  test('should have all MANDATORY_TOOLS defined in manifest', () => {
    assert.ok(
      manifest && manifest.validation && Array.isArray(manifest.validation.mandatoryTools),
      'mandatoryTools array should exist'
    );

    for (const tool of MANDATORY_TOOLS) {
      assert.ok(
        manifest.validation.mandatoryTools.includes(tool),
        `mandatoryTools should include ${tool}`
      );
    }
  });

  test('should have blockOnMissingMandatory flag', () => {
    assert.ok(manifest && manifest.validation, 'Manifest with validation should be loaded');
    assert.strictEqual(
      manifest.validation.blockOnMissingMandatory,
      true,
      'blockOnMissingMandatory should be true to enforce mandatory tools'
    );
  });

  test('mandatoryTools should mark TaskUpdate as mandatory in core tools', () => {
    assert.ok(
      manifest && manifest.tools && Array.isArray(manifest.tools.core),
      'Core tools should exist'
    );

    const taskUpdateTool = manifest.tools.core.find(t => t.name === 'TaskUpdate');
    assert.ok(taskUpdateTool, 'TaskUpdate should exist in core tools');
    assert.strictEqual(
      taskUpdateTool.mandatory,
      true,
      'TaskUpdate should have mandatory: true in core tools definition'
    );
  });

  test('mandatoryTools should mark Skill as mandatory in core tools', () => {
    assert.ok(
      manifest && manifest.tools && Array.isArray(manifest.tools.core),
      'Core tools should exist'
    );

    const skillTool = manifest.tools.core.find(t => t.name === 'Skill');
    assert.ok(skillTool, 'Skill should exist in core tools');
    assert.strictEqual(
      skillTool.mandatory,
      true,
      'Skill should have mandatory: true in core tools definition'
    );
  });
});

// =============================================================================
// TEST SUITE 3: Validate enrichAllowedTools defensive fallback
// =============================================================================

describe('TEST SUITE 3: spawn-prompt-assembler.cjs defensive fallback', () => {
  let hookCode = null;

  before(() => {
    try {
      hookCode = fs.readFileSync(HOOK_PATH, 'utf8');
    } catch (_e) {
      hookCode = null;
    }
  });

  test('should have spawn-prompt-assembler.cjs file', () => {
    assert.ok(fileExists(HOOK_PATH), `spawn-prompt-assembler.cjs should exist at ${HOOK_PATH}`);
    assert.ok(hookCode !== null && hookCode.length > 0, 'Hook file should have content');
  });

  test('should have enrichAllowedTools function defined', () => {
    assert.ok(hookCode, 'Hook code should be loaded');
    assert.ok(
      hookCode.includes('function enrichAllowedTools') || hookCode.includes('enrichAllowedTools ='),
      'Hook should define enrichAllowedTools function'
    );
  });

  test('should have defensive fallback for mandatory tools (TaskUpdate, Skill)', () => {
    assert.ok(hookCode, 'Hook code should be loaded');

    // Check for the defensive fallback pattern: || ['TaskUpdate', 'Skill']
    // This ensures that if manifest is missing mandatoryTools, we still have fallback
    const hasFallbackPattern =
      hookCode.includes("['TaskUpdate', 'Skill']") ||
      hookCode.includes('["TaskUpdate", "Skill"]') ||
      hookCode.includes('mandatoryTools') ||
      // Also check for alternative patterns that achieve the same defensive behavior
      (hookCode.includes('TaskUpdate') &&
        hookCode.includes('Skill') &&
        hookCode.includes('mandatory'));

    assert.ok(
      hasFallbackPattern,
      'Hook should have defensive fallback ensuring TaskUpdate and Skill are included'
    );
  });

  test('should export enrichAllowedTools function', () => {
    assert.ok(hookCode, 'Hook code should be loaded');
    assert.ok(
      hookCode.includes('module.exports') && hookCode.includes('enrichAllowedTools'),
      'Hook should export enrichAllowedTools function'
    );
  });

  test('should handle missing registry gracefully', () => {
    assert.ok(hookCode, 'Hook code should be loaded');

    // Check for graceful handling of missing registry
    const hasGracefulHandling =
      hookCode.includes('loadAgentRegistry') ||
      (hookCode.includes('try') && hookCode.includes('catch')) ||
      hookCode.includes('|| {}') ||
      hookCode.includes('?? {}');

    assert.ok(hasGracefulHandling, 'Hook should handle missing registry gracefully');
  });

  test('should have getDefaultTools import or function for fallback tools', () => {
    assert.ok(hookCode, 'Hook code should be loaded');

    // Check for getDefaultTools which provides fallback tool lists
    const hasDefaultToolsHandling =
      hookCode.includes('getDefaultTools') ||
      hookCode.includes('defaultTools') ||
      hookCode.includes('MANDATORY_TOOLS');

    assert.ok(hasDefaultToolsHandling, 'Hook should have mechanism to get default/fallback tools');
  });
});

// =============================================================================
// TEST SUITE 4: Validate JSON syntax
// =============================================================================

describe('TEST SUITE 4: JSON file validity', () => {
  test('agent-config.json should be valid JSON', () => {
    assert.ok(fileExists(AGENT_CONFIG_PATH), 'agent-config.json should exist');

    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, 'utf8')),
      'agent-config.json should be valid JSON'
    );
  });

  test('tool-manifest.json should be valid JSON', () => {
    assert.ok(fileExists(TOOL_MANIFEST_PATH), 'tool-manifest.json should exist');

    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(TOOL_MANIFEST_PATH, 'utf8')),
      'tool-manifest.json should be valid JSON'
    );
  });

  test('settings.json should be valid JSON', () => {
    assert.ok(fileExists(SETTINGS_PATH), 'settings.json should exist');

    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')),
      'settings.json should be valid JSON'
    );
  });

  test('agent-config.json should have required structure', () => {
    const config = safeParseJson(AGENT_CONFIG_PATH);
    assert.ok(config, 'Config should parse');
    assert.ok(config.agents, 'Config should have agents property');
    assert.ok(config.version, 'Config should have version property');
  });

  test('tool-manifest.json should have required structure', () => {
    const manifest = safeParseJson(TOOL_MANIFEST_PATH);
    assert.ok(manifest, 'Manifest should parse');
    assert.ok(manifest.version, 'Manifest should have version property');
    assert.ok(manifest.tools, 'Manifest should have tools property');
    assert.ok(manifest.validation, 'Manifest should have validation property');
  });
});

// =============================================================================
// TEST SUITE 5: Integration - End-to-End Mandatory Tools Enforcement
// =============================================================================

describe('TEST SUITE 5: Integration - mandatory tools enforcement chain', () => {
  let config = null;
  let manifest = null;

  before(() => {
    config = safeParseJson(AGENT_CONFIG_PATH);
    manifest = safeParseJson(TOOL_MANIFEST_PATH);
  });

  test('agent-config and tool-manifest should agree on mandatory tools', () => {
    assert.ok(config && manifest, 'Both config and manifest should be loaded');

    const manifestMandatory = manifest.validation?.mandatoryTools || [];

    // Verify every agent has all manifest-defined mandatory tools
    const agents = config.agents || {};
    for (const [agentName, agentConfig] of Object.entries(agents)) {
      const tools = agentConfig.tools || [];

      for (const mandatoryTool of manifestMandatory) {
        assert.ok(
          tools.includes(mandatoryTool),
          `Agent "${agentName}" should have manifest-defined mandatory tool ${mandatoryTool}`
        );
      }
    }
  });

  test('all toolsets in tool-manifest should include mandatory tools', () => {
    assert.ok(manifest, 'Manifest should be loaded');

    const toolsets = manifest.tools?.toolsets || {};
    const mandatoryTools = manifest.validation?.mandatoryTools || [];

    // Check each toolset includes mandatory tools
    // Note: ROUTER toolset may be an exception as it's special
    for (const [toolsetName, tools] of Object.entries(toolsets)) {
      if (toolsetName === 'ROUTER') continue; // Router has special restrictions

      for (const mandatoryTool of mandatoryTools) {
        assert.ok(
          tools.includes(mandatoryTool),
          `Toolset "${toolsetName}" should include mandatory tool ${mandatoryTool}. Found: [${tools.join(', ')}]`
        );
      }
    }
  });

  test('validation.agentDefaults should all have mandatory tools', () => {
    assert.ok(manifest, 'Manifest should be loaded');

    const agentDefaults = manifest.validation?.agentDefaults || {};
    const mandatoryTools = manifest.validation?.mandatoryTools || [];

    for (const [agentName, agentDefault] of Object.entries(agentDefaults)) {
      const tools = agentDefault.tools || [];

      for (const mandatoryTool of mandatoryTools) {
        assert.ok(
          tools.includes(mandatoryTool),
          `Agent default "${agentName}" should have mandatory tool ${mandatoryTool}. Found: [${tools.join(', ')}]`
        );
      }
    }
  });
});

// =============================================================================
// Summary
// =============================================================================

console.log('\n=== Mandatory Tools Enforcement Test Suite ===');
console.log(`PROJECT_ROOT: ${PROJECT_ROOT}`);
console.log(`MANDATORY_TOOLS: [${MANDATORY_TOOLS.join(', ')}]`);
console.log('Files tested:');
console.log(`  - agent-config.json: ${AGENT_CONFIG_PATH}`);
console.log(`  - tool-manifest.json: ${TOOL_MANIFEST_PATH}`);
console.log(`  - settings.json: ${SETTINGS_PATH}`);
console.log(`  - spawn-prompt-assembler.cjs: ${HOOK_PATH}`);
console.log('\nRunning tests...\n');
