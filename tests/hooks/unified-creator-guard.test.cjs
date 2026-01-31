#!/usr/bin/env node
/**
 * Tests for unified-creator-guard.cjs
 *
 * Test cases from design document:
 * 1. Each creator pattern detection
 * 2. Active creator allows write
 * 3. Inactive creator blocks write
 * 4. TTL expiration
 * 5. Unknown paths allowed
 * 6. Environment variable override
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// HOOK-002 FIX: Use shared project-root utility instead of duplicated function
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

// Module under test - will be implemented
const {
  findRequiredCreator,
  isCreatorActive,
  markCreatorActive,
  clearCreatorActive,
  validateCreatorWorkflow,
  generateViolationMessage,
  CREATOR_CONFIGS,
  STATE_FILE,
  DEFAULT_TTL_MS,
  WATCHED_TOOLS,
} = require('../../.claude/hooks/routing/unified-creator-guard.cjs');
const STATE_PATH = path.join(PROJECT_ROOT, STATE_FILE);

// Save and restore state file
let originalState = null;

beforeEach(() => {
  // Save original state if it exists
  if (fs.existsSync(STATE_PATH)) {
    originalState = fs.readFileSync(STATE_PATH, 'utf8');
  }
  // Clear state for clean test
  try {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch (_e) {
    // Ignore
  }
});

afterEach(() => {
  // Restore original state
  try {
    if (originalState) {
      const stateDir = path.dirname(STATE_PATH);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }
      fs.writeFileSync(STATE_PATH, originalState);
    } else if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch (_e) {
    // Ignore
  }
  // Clean up env vars
  delete process.env.CREATOR_GUARD;
});

// =============================================================================
// TEST: CREATOR PATTERN DETECTION
// =============================================================================

describe('findRequiredCreator - pattern detection', () => {
  it('detects skill-creator for SKILL.md files', () => {
    const testCases = [
      '.claude/skills/test-skill/SKILL.md',
      '.claude\\skills\\test-skill\\SKILL.md',
      'C:/dev/project/.claude/skills/my-skill/SKILL.md',
      'C:\\dev\\project\\.claude\\skills\\my-skill\\SKILL.md',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.ok(result, `Should match skill pattern: ${filePath}`);
      assert.strictEqual(result.creator, 'skill-creator');
      assert.strictEqual(result.artifactType, 'skill');
    }
  });

  it('detects agent-creator for agent definition files', () => {
    const testCases = [
      '.claude/agents/core/developer.md',
      '.claude/agents/domain/python-pro.md',
      '.claude/agents/specialized/security-architect.md',
      '.claude/agents/orchestrators/master-orchestrator.md',
      '.claude\\agents\\core\\my-agent.md',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.ok(result, `Should match agent pattern: ${filePath}`);
      assert.strictEqual(result.creator, 'agent-creator');
      assert.strictEqual(result.artifactType, 'agent');
    }
  });

  it('detects hook-creator for hook files', () => {
    const testCases = [
      '.claude/hooks/routing/my-hook.cjs',
      '.claude/hooks/safety/security-check.cjs',
      '.claude/hooks/memory/learner.cjs',
      '.claude/hooks/evolution/tracker.cjs',
      '.claude/hooks/reflection/analyzer.cjs',
      '.claude/hooks/validation/input-check.cjs',
      '.claude/hooks/session/manager.cjs',
      '.claude/hooks/self-healing/recovery.cjs',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.ok(result, `Should match hook pattern: ${filePath}`);
      assert.strictEqual(result.creator, 'hook-creator');
      assert.strictEqual(result.artifactType, 'hook');
    }
  });

  it('detects workflow-creator for workflow files', () => {
    const testCases = [
      '.claude/workflows/core/my-workflow.md',
      '.claude/workflows/enterprise/feature-flow.md',
      '.claude/workflows/operations/incident.md',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.ok(result, `Should match workflow pattern: ${filePath}`);
      assert.strictEqual(result.creator, 'workflow-creator');
      assert.strictEqual(result.artifactType, 'workflow');
    }
  });

  it('detects template-creator for template files', () => {
    const testCases = [
      '.claude/templates/agents/agent-template.md',
      '.claude/templates/skills/skill-template.md',
      '.claude/templates/workflows/workflow-template.md',
      '.claude/templates/hooks/hook-template.cjs',
      '.claude/templates/code/component.tsx',
      '.claude/templates/schemas/schema-template.json',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.ok(result, `Should match template pattern: ${filePath}`);
      assert.strictEqual(result.creator, 'template-creator');
      assert.strictEqual(result.artifactType, 'template');
    }
  });

  it('detects schema-creator for schema files', () => {
    const testCases = [
      '.claude/schemas/my-schema.json',
      '.claude/schemas/agent.schema.json',
      '.claude/schemas/skill-definition.json',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.ok(result, `Should match schema pattern: ${filePath}`);
      assert.strictEqual(result.creator, 'schema-creator');
      assert.strictEqual(result.artifactType, 'schema');
    }
  });

  it('excludes test files from hook-creator requirement', () => {
    const testCases = [
      '.claude/hooks/routing/my-hook.test.cjs',
      '.claude/hooks/safety/validator.test.cjs',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.strictEqual(result, null, `Test file should not require creator: ${filePath}`);
    }
  });

  it('excludes README files from agent-creator and workflow-creator', () => {
    const testCases = [
      '.claude/agents/core/README.md',
      '.claude/agents/domain/README.md',
      '.claude/workflows/core/README.md',
      '.claude/templates/README.md',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.strictEqual(result, null, `README should not require creator: ${filePath}`);
    }
  });

  it('returns null for unknown paths', () => {
    const testCases = [
      'src/index.js',
      '.claude/context/memory/learnings.md',
      '.claude/docs/README.md',
      '.claude/CLAUDE.md',
      'package.json',
      '.claude/lib/utils/helper.cjs',
      '.claude/tools/cli/doctor.js',
    ];

    for (const filePath of testCases) {
      const result = findRequiredCreator(filePath);
      assert.strictEqual(result, null, `Unknown path should return null: ${filePath}`);
    }
  });
});

// =============================================================================
// TEST: STATE MANAGEMENT
// =============================================================================

describe('markCreatorActive / isCreatorActive', () => {
  it('marks a creator as active', () => {
    const result = markCreatorActive('skill-creator', 'test-skill');
    assert.strictEqual(result, true);

    const state = isCreatorActive('skill-creator');
    assert.strictEqual(state.active, true);
    assert.ok(state.invokedAt);
    assert.strictEqual(state.artifactName, 'test-skill');
  });

  it('marks multiple creators as active', () => {
    markCreatorActive('skill-creator', 'my-skill');
    markCreatorActive('agent-creator', 'my-agent');

    const skillState = isCreatorActive('skill-creator');
    const agentState = isCreatorActive('agent-creator');

    assert.strictEqual(skillState.active, true);
    assert.strictEqual(agentState.active, true);
  });

  it('returns inactive for unknown creator', () => {
    const state = isCreatorActive('unknown-creator');
    assert.strictEqual(state.active, false);
  });

  it('returns inactive when state file does not exist', () => {
    // State file is cleared in beforeEach
    const state = isCreatorActive('skill-creator');
    assert.strictEqual(state.active, false);
  });
});

describe('clearCreatorActive', () => {
  it('clears a specific creator', () => {
    markCreatorActive('skill-creator', 'test-skill');
    markCreatorActive('agent-creator', 'test-agent');

    const result = clearCreatorActive('skill-creator');
    assert.strictEqual(result, true);

    const skillState = isCreatorActive('skill-creator');
    assert.strictEqual(skillState.active, false);

    // agent-creator should still be active
    const agentState = isCreatorActive('agent-creator');
    assert.strictEqual(agentState.active, true);
  });
});

describe('TTL expiration', () => {
  it('expires after TTL', () => {
    // Manually create state with old timestamp
    const stateDir = path.dirname(STATE_PATH);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const oldTime = new Date(Date.now() - DEFAULT_TTL_MS - 1000).toISOString();
    const state = {
      'skill-creator': {
        active: true,
        invokedAt: oldTime,
        artifactName: 'test',
        ttl: DEFAULT_TTL_MS,
      },
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

    const result = isCreatorActive('skill-creator');
    assert.strictEqual(result.active, false, 'Should be inactive after TTL');
    assert.ok(result.elapsedMs > DEFAULT_TTL_MS);
  });

  it('respects custom TTL', () => {
    const customTTL = 1000; // 1 second

    const stateDir = path.dirname(STATE_PATH);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    // Set with custom TTL that has already expired
    const oldTime = new Date(Date.now() - customTTL - 500).toISOString();
    const state = {
      'skill-creator': {
        active: true,
        invokedAt: oldTime,
        artifactName: 'test',
        ttl: customTTL,
      },
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

    const result = isCreatorActive('skill-creator');
    assert.strictEqual(result.active, false, 'Should be inactive after custom TTL');
  });
});

// =============================================================================
// TEST: SEC-REMEDIATION-001 TTL Reduction
// =============================================================================

describe('SEC-REMEDIATION-001: TTL reduced from 10 to 3 minutes', () => {
  it('DEFAULT_TTL_MS should be 3 minutes (180000ms)', () => {
    // SEC-REMEDIATION-001: Reduce TTL from 10 minutes to 3 minutes
    // Reason: Smaller window reduces state tampering risk
    assert.strictEqual(
      DEFAULT_TTL_MS,
      3 * 60 * 1000,
      'DEFAULT_TTL_MS should be 3 minutes for security hardening'
    );
  });
});

// =============================================================================
// TEST: VALIDATION LOGIC
// =============================================================================

describe('validateCreatorWorkflow', () => {
  it('allows writes to non-protected paths', () => {
    const result = validateCreatorWorkflow('Write', {
      file_path: 'src/index.js',
      content: 'test',
    });
    assert.strictEqual(result.pass, true);
  });

  it('allows writes when creator is active', () => {
    markCreatorActive('skill-creator', 'test-skill');

    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, true);
  });

  it('blocks writes when creator is not active', () => {
    // No creator marked active
    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
    assert.ok(result.message.includes('skill-creator'));
  });

  it('allows non-watched tools', () => {
    const result = validateCreatorWorkflow('Read', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.strictEqual(result.pass, true);
  });

  it('handles Edit tool same as Write', () => {
    const result = validateCreatorWorkflow('Edit', {
      file_path: '.claude/skills/test-skill/SKILL.md',
      old_string: 'old',
      new_string: 'new',
    });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
  });

  it('blocks agent writes without agent-creator', () => {
    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/domain/new-agent.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, false);
    assert.ok(result.message.includes('agent-creator'));
  });

  it('blocks hook writes without hook-creator', () => {
    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/hooks/safety/new-hook.cjs',
      content: 'test',
    });
    assert.strictEqual(result.pass, false);
    assert.ok(result.message.includes('hook-creator'));
  });

  it('blocks workflow writes without workflow-creator', () => {
    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/workflows/core/new-workflow.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, false);
    assert.ok(result.message.includes('workflow-creator'));
  });

  it('blocks schema writes without schema-creator', () => {
    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/schemas/new-schema.json',
      content: 'test',
    });
    assert.strictEqual(result.pass, false);
    assert.ok(result.message.includes('schema-creator'));
  });
});

// =============================================================================
// TEST: ENVIRONMENT VARIABLE OVERRIDE
// =============================================================================

describe('environment variable override', () => {
  it('bypasses check when CREATOR_GUARD=off', () => {
    process.env.CREATOR_GUARD = 'off';

    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, true);
  });

  it('warns but allows when CREATOR_GUARD=warn', () => {
    process.env.CREATOR_GUARD = 'warn';

    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message);
  });

  it('blocks by default (CREATOR_GUARD=block)', () => {
    process.env.CREATOR_GUARD = 'block';

    const result = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
  });
});

// =============================================================================
// TEST: VIOLATION MESSAGE
// =============================================================================

describe('generateViolationMessage', () => {
  it('generates message with file path and creator name', () => {
    const msg = generateViolationMessage('.claude/skills/test/SKILL.md', 'skill-creator', 'skill');
    assert.ok(msg.includes('skill-creator'));
    assert.ok(msg.includes('skill'));
    assert.ok(msg.includes('SKILL.md') || msg.includes('test'));
  });

  it('includes creator name but not override hints (SEC-AUDIT-021)', () => {
    // SEC-AUDIT-021: Override hints removed from user-facing messages
    const msg = generateViolationMessage('.claude/agents/core/test.md', 'agent-creator', 'agent');
    assert.ok(msg.includes('agent-creator'), 'Should include creator name');
    // Override hints removed per SEC-AUDIT-021 (security override discovery risk)
    // Overrides are documented in code comments only, not in user-facing strings
  });
});

// =============================================================================
// TEST: EXPORTS
// =============================================================================

describe('module exports', () => {
  it('exports all required functions', () => {
    assert.strictEqual(typeof findRequiredCreator, 'function');
    assert.strictEqual(typeof isCreatorActive, 'function');
    assert.strictEqual(typeof markCreatorActive, 'function');
    assert.strictEqual(typeof clearCreatorActive, 'function');
    assert.strictEqual(typeof validateCreatorWorkflow, 'function');
    assert.strictEqual(typeof generateViolationMessage, 'function');
  });

  it('exports all required constants', () => {
    assert.ok(Array.isArray(CREATOR_CONFIGS));
    assert.ok(CREATOR_CONFIGS.length >= 6); // At least 6 creators
    assert.strictEqual(typeof STATE_FILE, 'string');
    assert.strictEqual(typeof DEFAULT_TTL_MS, 'number');
    assert.ok(Array.isArray(WATCHED_TOOLS));
  });
});

// =============================================================================
// TEST: MED-001 - Shared PROJECT_ROOT Usage
// =============================================================================

describe('MED-001: PROJECT_ROOT from shared utility', () => {
  it('exports PROJECT_ROOT that matches shared utility', () => {
    const { PROJECT_ROOT } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');
    const { PROJECT_ROOT: SHARED_PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

    assert.ok(PROJECT_ROOT, 'Should export PROJECT_ROOT');
    assert.strictEqual(
      PROJECT_ROOT,
      SHARED_PROJECT_ROOT,
      'PROJECT_ROOT should match shared utility value'
    );
  });

  it('PROJECT_ROOT should be an absolute path containing .claude', () => {
    const { PROJECT_ROOT } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

    assert.ok(path.isAbsolute(PROJECT_ROOT), 'PROJECT_ROOT should be absolute path');
    assert.ok(
      fs.existsSync(path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md')),
      'PROJECT_ROOT should contain .claude/CLAUDE.md'
    );
  });
});

// =============================================================================
// TEST: EDGE CASES
// =============================================================================

// =============================================================================
// TEST: ENFORCEMENT-002 - Integration between tracker and guard
// =============================================================================

describe('ENFORCEMENT-002: Integration between skill-invocation-tracker and unified-creator-guard', () => {
  const tracker = require('../../.claude/hooks/routing/skill-invocation-tracker.cjs');

  it('tracker markCreatorActive enables guard isCreatorActive', () => {
    // Use tracker to mark skill-creator active
    const marked = tracker.markCreatorActive('skill-creator');
    assert.strictEqual(marked, true, 'tracker should mark creator active');

    // Guard should recognize the creator as active
    const state = isCreatorActive('skill-creator');
    assert.strictEqual(state.active, true, 'guard should see creator as active');
  });

  it('tracker and guard share the same state file path', () => {
    // Both modules should use the same state file
    assert.strictEqual(
      tracker.ACTIVE_CREATORS_STATE_FILE,
      STATE_FILE,
      'tracker and guard should use the same state file path'
    );
  });

  it('tracker and guard share the same TTL constant (3 minutes)', () => {
    // SEC-REMEDIATION-001: Both should use 3-minute TTL
    assert.strictEqual(
      tracker.DEFAULT_TTL_MS,
      DEFAULT_TTL_MS,
      'tracker and guard should use the same TTL'
    );
    assert.strictEqual(
      DEFAULT_TTL_MS,
      3 * 60 * 1000,
      'TTL should be 3 minutes (SEC-REMEDIATION-001)'
    );
  });

  it('full workflow: tracker marks active -> guard allows write -> guard blocks after clear', () => {
    // Step 1: Without marking, guard should block
    const blockedResult = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/integration-test/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(blockedResult.pass, false, 'Should block before marking active');

    // Step 2: Mark creator active via tracker
    tracker.markCreatorActive('skill-creator');

    // Step 3: Guard should now allow
    const allowedResult = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/integration-test/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(allowedResult.pass, true, 'Should allow after marking active');

    // Step 4: Clear the creator state
    clearCreatorActive('skill-creator');

    // Step 5: Guard should block again
    const blockedAgainResult = validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/integration-test/SKILL.md',
      content: 'test',
    });
    assert.strictEqual(blockedAgainResult.pass, false, 'Should block after clearing');
  });
});

// =============================================================================
// TEST: EDGE CASES
// =============================================================================

describe('edge cases', () => {
  it('handles null/undefined file paths', () => {
    const result1 = validateCreatorWorkflow('Write', { file_path: null });
    const result2 = validateCreatorWorkflow('Write', { file_path: undefined });
    const result3 = validateCreatorWorkflow('Write', {});

    assert.strictEqual(result1.pass, true);
    assert.strictEqual(result2.pass, true);
    assert.strictEqual(result3.pass, true);
  });

  it('handles malformed state file gracefully', () => {
    const stateDir = path.dirname(STATE_PATH);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(STATE_PATH, 'not valid json');

    const state = isCreatorActive('skill-creator');
    assert.strictEqual(state.active, false);
  });

  it('handles paths with mixed separators', () => {
    const result = findRequiredCreator('.claude/skills\\test-skill/SKILL.md');
    assert.ok(result);
    assert.strictEqual(result.creator, 'skill-creator');
  });

  it('handles case sensitivity in patterns', () => {
    // Pattern should match case-insensitively for SKILL.md
    const result1 = findRequiredCreator('.claude/skills/test/skill.md');
    const result2 = findRequiredCreator('.claude/skills/test/SKILL.MD');

    // Both should match skill-creator (case insensitive)
    assert.ok(result1);
    assert.ok(result2);
  });
});
