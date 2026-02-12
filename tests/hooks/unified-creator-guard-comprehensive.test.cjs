#!/usr/bin/env node
/**
 * Comprehensive tests for unified-creator-guard.cjs
 * Tests Gate 4 enforcement for all 6 creator artifact types
 *
 * Test coverage:
 * - Gate 4: Creator output path protection
 * - All 6 artifact types (skills, agents, hooks, workflows, templates, schemas)
 * - Enforcement modes (block, warn, off)
 * - Edit vs Write tool distinction
 * - Existing file vs new file distinction
 * - Creator state TTL validation
 * - Schema validation (Step 7)
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Import hook functions
const creatorGuard = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
);

// Cleanup state between tests
function cleanupState() {
  const stateFile = path.join(PROJECT_ROOT, creatorGuard.STATE_FILE);
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }
}

describe('unified-creator-guard.cjs - Gate 4: Skill Artifact Protection', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should block direct write to new SKILL.md', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /CREATOR GUARD VIOLATION/);
    assert.match(result.message, /skill-creator/);
  });

  it('should allow write to SKILL.md when creator active', () => {
    creatorGuard.markCreatorActive('skill-creator', 'test-skill');

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.equal(result.pass, true);
  });

  it('should allow Edit to existing SKILL.md without creator', () => {
    const result = creatorGuard.validateCreatorWorkflow('Edit', {
      file_path: '.claude/skills/existing-skill/SKILL.md',
    });
    assert.equal(result.pass, true);
  });

  it('should block write after creator TTL expires', () => {
    const statePath = path.join(PROJECT_ROOT, creatorGuard.STATE_FILE);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          'skill-creator': {
            active: true,
            invokedAt: new Date(Date.now() - 1000).toISOString(),
            ttl: 100,
            artifactName: 'test-skill',
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.equal(result.pass, false);
  });
});

describe('unified-creator-guard.cjs - Gate 4: Agent Artifact Protection', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should block direct write to new agent file', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/domain/python-expert.md',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /agent-creator/);
  });

  it('should block write to core agent', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/core/new-developer.md',
    });
    assert.equal(result.pass, false);
  });

  it('should block write to specialized agent', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/specialized/database-expert.md',
    });
    assert.equal(result.pass, false);
  });

  it('should block write to orchestrator agent', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/orchestrators/feature-orchestrator.md',
    });
    assert.equal(result.pass, false);
  });

  it('should allow write when agent-creator active', () => {
    creatorGuard.markCreatorActive('agent-creator', 'python-expert');

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/domain/python-expert.md',
    });
    assert.equal(result.pass, true);
  });

  it('should NOT block README.md in agents directory', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/agents/README.md',
    });
    assert.equal(result.pass, true);
  });
});

describe('unified-creator-guard.cjs - Gate 4: Hook Artifact Protection', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should block direct write to new hook', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/hooks/routing/new-guard.cjs',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /hook-creator/);
  });

  it('should block write to safety hook', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/hooks/safety/validation-hook.cjs',
    });
    assert.equal(result.pass, false);
  });

  it('should NOT block test files', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/hooks/routing/test-hook.test.cjs',
    });
    assert.equal(result.pass, true);
  });

  it('should allow write when hook-creator active', () => {
    creatorGuard.markCreatorActive('hook-creator', 'new-guard');

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/hooks/routing/new-guard.cjs',
    });
    assert.equal(result.pass, true);
  });
});

describe('unified-creator-guard.cjs - Gate 4: Workflow Artifact Protection', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should block direct write to new workflow', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/workflows/core/new-workflow.md',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /workflow-creator/);
  });

  it('should block write to enterprise workflow', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/workflows/enterprise/feature-workflow.md',
    });
    assert.equal(result.pass, false);
  });

  it('should allow write when workflow-creator active', () => {
    creatorGuard.markCreatorActive('workflow-creator', 'new-workflow');

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/workflows/core/new-workflow.md',
    });
    assert.equal(result.pass, true);
  });

  it('should NOT block README.md in workflows directory', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/workflows/README.md',
    });
    assert.equal(result.pass, true);
  });
});

describe('unified-creator-guard.cjs - Gate 4: Template Artifact Protection', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should block direct write to new template', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/templates/spawn/new-template.md',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /template-creator/);
  });

  it('should allow write when template-creator active', () => {
    creatorGuard.markCreatorActive('template-creator', 'new-template');

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/templates/spawn/new-template.md',
    });
    assert.equal(result.pass, true);
  });

  it('should NOT block archived templates', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/templates/_archive/old-template.md',
    });
    assert.equal(result.pass, true);
  });
});

describe('unified-creator-guard.cjs - Gate 4: Schema Artifact Protection', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should block direct write to new schema', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/schemas/new-artifact.schema.json',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /schema-creator/);
  });

  it('should block write to schema without .schema suffix', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/schemas/config.json',
    });
    assert.equal(result.pass, false);
  });

  it('should allow write when schema-creator active', () => {
    creatorGuard.markCreatorActive('schema-creator', 'new-artifact');

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/schemas/new-artifact.schema.json',
    });
    assert.equal(result.pass, true);
  });
});

describe('unified-creator-guard.cjs - Enforcement Modes', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_GUARD;
  });

  it('should respect CREATOR_GUARD=warn', () => {
    process.env.CREATOR_GUARD = 'warn';

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
    assert.match(result.message, /CREATOR GUARD VIOLATION/);
  });

  it('should respect CREATOR_GUARD=off', () => {
    process.env.CREATOR_GUARD = 'off';

    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, undefined);
  });

  it('should respect CREATOR_GUARD=block (default)', () => {
    const result = creatorGuard.validateCreatorWorkflow('Write', {
      file_path: '.claude/skills/test-skill/SKILL.md',
    });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
  });
});

describe('unified-creator-guard.cjs - Helper Functions', () => {
  afterEach(() => {
    cleanupState();
  });

  it('should find required creator for skill path', () => {
    const required = creatorGuard.findRequiredCreator('.claude/skills/test/SKILL.md');
    assert.ok(required);
    assert.equal(required.creator, 'skill-creator');
    assert.equal(required.artifactType, 'skill');
  });

  it('should find required creator for agent path', () => {
    const required = creatorGuard.findRequiredCreator('.claude/agents/core/planner.md');
    assert.ok(required);
    assert.equal(required.creator, 'agent-creator');
    assert.equal(required.artifactType, 'agent');
  });

  it('should find required creator for hook path', () => {
    const required = creatorGuard.findRequiredCreator('.claude/hooks/routing/guard.cjs');
    assert.ok(required);
    assert.equal(required.creator, 'hook-creator');
    assert.equal(required.artifactType, 'hook');
  });

  it('should return null for non-protected path', () => {
    const required = creatorGuard.findRequiredCreator('src/app.js');
    assert.equal(required, null);
  });

  it('should check creator active state', () => {
    creatorGuard.markCreatorActive('skill-creator', 'test-skill');

    const state = creatorGuard.isCreatorActive('skill-creator');
    assert.equal(state.active, true);
    assert.ok(state.invokedAt);
    assert.equal(state.artifactName, 'test-skill');
  });

  it('should clear creator active state', () => {
    creatorGuard.markCreatorActive('skill-creator', 'test-skill');
    creatorGuard.clearCreatorActive('skill-creator');

    const state = creatorGuard.isCreatorActive('skill-creator');
    assert.equal(state.active, false);
  });
});

describe('unified-creator-guard.cjs - Schema Validation (Step 7)', () => {
  afterEach(() => {
    cleanupState();
  });

  it('should validate skill content', () => {
    const validSkill = JSON.stringify({ name: 'test-skill', description: 'Test skill' });
    const result = creatorGuard.validateArtifactContent('skill', validSkill);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should detect missing required field in skill', () => {
    const invalidSkill = JSON.stringify({ description: 'Missing name' });
    const result = creatorGuard.validateArtifactContent('skill', invalidSkill);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('should skip validation for non-JSON content', () => {
    const markdownContent = '# Skill\n\nThis is markdown.';
    const result = creatorGuard.validateArtifactContent('skill', markdownContent);
    assert.equal(result.valid, true);
  });

  it('should skip validation for artifact types without schema', () => {
    const result = creatorGuard.validateArtifactContent('template', '<template>');
    assert.equal(result.valid, true);
  });
});

describe('unified-creator-guard.cjs - TTL Bounds Validation (HIGH-002)', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CREATOR_STATE_TTL_MS;
  });

  it('should enforce minimum TTL of 30 seconds', () => {
    process.env.CREATOR_STATE_TTL_MS = '1000'; // 1 second (too short)
    delete require.cache[
      require.resolve(
        path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
      )
    ];
    const guard = require(
      path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
    );

    // DEFAULT_TTL_MS should be clamped to MIN_TTL_MS (30000)
    assert.ok(guard.DEFAULT_TTL_MS >= 30000);
  });

  it('should enforce maximum TTL of 10 minutes', () => {
    process.env.CREATOR_STATE_TTL_MS = '3600000'; // 1 hour (too long)
    delete require.cache[
      require.resolve(
        path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
      )
    ];
    const guard = require(
      path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
    );

    // DEFAULT_TTL_MS should be clamped to MAX_TTL_MS (600000)
    assert.ok(guard.DEFAULT_TTL_MS <= 600000);
  });

  it('should use default TTL for invalid values', () => {
    process.env.CREATOR_STATE_TTL_MS = 'invalid';
    delete require.cache[
      require.resolve(
        path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
      )
    ];
    const guard = require(
      path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'unified-creator-guard.cjs')
    );

    // Should fall back to 3 minutes (180000ms)
    assert.equal(guard.DEFAULT_TTL_MS, 180000);
  });
});
