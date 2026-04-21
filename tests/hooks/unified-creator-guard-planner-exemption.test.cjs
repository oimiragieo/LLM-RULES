/**
 * Tests for unified-creator-guard.cjs - Planner plan-file creation (v2.3.0 S1)
 *
 * Investigation finding (2026-04-20): The guard ALREADY permits planner agents
 * to create plan files under .claude/context/plans/ because that path is NOT
 * registered in CREATOR_CONFIGS. findRequiredCreator() returns null for plan
 * paths and validateCreatorWorkflow() short-circuits with { pass: true }.
 *
 * These tests LOCK IN that current behavior as a regression guard, so any
 * future change that adds `.claude/context/plans/` to CREATOR_CONFIGS must
 * consciously re-open this exemption decision.
 *
 * Behaviors asserted:
 *  1. Creating a NEW plan file at .claude/context/plans/ is allowed (any agent).
 *     This is currently permissive because plans are unprotected. If plans
 *     later become a protected artifact type, the planner MUST retain the
 *     ability to create them.
 *  2. Editing an existing plan file is allowed for the same reason.
 *     (The "edit existing" branch in the guard is reached only after a path
 *     is identified as protected; since plans aren't, this is trivially true.)
 *  3. findRequiredCreator() returns null for plan paths — proving they are
 *     outside the protected artifact set.
 *  4. The guard still BLOCKS writes to other protected creator paths (agent,
 *     hook, skill) regardless of planner context — proving the plan exemption
 *     is scoped to plan paths only and does not leak to other artifacts.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  findRequiredCreator,
  validateCreatorWorkflow,
  PROJECT_ROOT,
} = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

const STATE_FILE_PATH = path.join(PROJECT_ROOT, '.claude/context/runtime/active-creators.json');
const PLANS_DIR = path.join(PROJECT_ROOT, '.claude/context/plans');

describe('unified-creator-guard - Planner plan-file exemption (v2.3.0 S1)', () => {
  beforeEach(() => {
    // Ensure clean creator state — no active creator tokens leaking in
    if (fs.existsSync(STATE_FILE_PATH)) {
      fs.unlinkSync(STATE_FILE_PATH);
    }
    // Ensure plans dir exists for fileExists branch tests
    if (!fs.existsSync(PLANS_DIR)) {
      fs.mkdirSync(PLANS_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(STATE_FILE_PATH)) {
      fs.unlinkSync(STATE_FILE_PATH);
    }
  });

  describe('Plan path classification', () => {
    it('returns null for plan paths — plans are NOT a protected artifact type', () => {
      const planPath = '.claude/context/plans/my-new-topic-plan-2026-04-20.md';
      const required = findRequiredCreator(planPath);
      assert.strictEqual(
        required,
        null,
        'Plan files must NOT require a creator; guard should ignore them entirely'
      );
    });

    it('returns null for absolute plan paths', () => {
      const absolutePlanPath = path.join(
        PROJECT_ROOT,
        '.claude/context/plans/another-plan-2026-04-20.md'
      );
      const required = findRequiredCreator(absolutePlanPath);
      assert.strictEqual(required, null, 'Absolute plan paths must also be unprotected');
    });

    it('returns null for nested subdirectories under plans/', () => {
      const nestedPath = '.claude/context/plans/v2.3.0/slice-01-plan-2026-04-20.md';
      const required = findRequiredCreator(nestedPath);
      assert.strictEqual(required, null, 'Nested plan paths must also be unprotected');
    });
  });

  describe('Test 1: creating NEW plan file is allowed', () => {
    it('Write to a new plan file passes guard validation', () => {
      const newPlanPath = `.claude/context/plans/fresh-topic-plan-2026-04-20-${Date.now()}.md`;
      // Sanity: make sure it truly does not exist yet
      const absolutePath = path.join(PROJECT_ROOT, newPlanPath);
      assert.strictEqual(
        fs.existsSync(absolutePath),
        false,
        'Test precondition: new plan path must not exist'
      );

      const toolInput = {
        file_path: newPlanPath,
        content: '# Fresh topic plan\n\n- [ ] step one\n',
      };

      const result = validateCreatorWorkflow('Write', toolInput);

      assert.strictEqual(
        result.pass,
        true,
        'Creating a NEW plan file must be allowed (plans are unprotected)'
      );
    });
  });

  describe('Test 2 (reframed): creating a plan file stays allowed regardless of caller', () => {
    // NOTE: The guard has no concept of subagent_type. What it sees is tool name
    // + file path. The "non-planner creates plan" case is behaviorally identical
    // to "planner creates plan" — both are allowed because the path is unprotected.
    // This test documents that the exemption is PATH-based, not AGENT-based.
    it('Write from any caller to a new plan file passes guard validation', () => {
      const newPlanPath = `.claude/context/plans/anyone-plan-2026-04-20-${Date.now()}.md`;
      const toolInput = {
        file_path: newPlanPath,
        content: '# Plan\n',
      };
      const result = validateCreatorWorkflow('Write', toolInput);
      assert.strictEqual(
        result.pass,
        true,
        'The guard matches on path, not agent identity; plans are unprotected for everyone'
      );
    });
  });

  describe('Test 3: editing existing plan file is allowed', () => {
    it('Edit to an existing plan file passes guard validation', () => {
      // Create a real plan file to ensure fs.existsSync branch is exercised
      const existingPlanPath = path.join(PLANS_DIR, `existing-plan-2026-04-20-${Date.now()}.md`);
      fs.writeFileSync(existingPlanPath, '# Existing plan\n', 'utf8');

      try {
        const relativePath = path.relative(PROJECT_ROOT, existingPlanPath).replace(/\\/g, '/');
        const toolInput = {
          file_path: relativePath,
          old_string: '# Existing plan',
          new_string: '# Existing plan (updated)',
        };
        const result = validateCreatorWorkflow('Edit', toolInput);
        assert.strictEqual(
          result.pass,
          true,
          'Editing an existing plan file must be allowed (plans are unprotected)'
        );
      } finally {
        if (fs.existsSync(existingPlanPath)) fs.unlinkSync(existingPlanPath);
      }
    });
  });

  describe('Test 4: plan exemption does NOT leak to other protected artifacts', () => {
    it('Write to a NEW agent file is still blocked (no active agent-creator)', () => {
      const newAgentPath = `.claude/agents/specialized/fake-agent-${Date.now()}.md`;
      const toolInput = {
        file_path: newAgentPath,
        content: '---\nname: fake-agent\n---\nBody',
      };
      const result = validateCreatorWorkflow('Write', toolInput);
      assert.strictEqual(
        result.pass,
        false,
        'Writes to protected agent paths must still be blocked without the creator token'
      );
      assert.strictEqual(result.result, 'block');
    });

    it('Write to a NEW hook file is still blocked (no active hook-creator)', () => {
      const newHookPath = `.claude/hooks/routing/fake-hook-${Date.now()}.cjs`;
      const toolInput = {
        file_path: newHookPath,
        content: '// fake hook',
      };
      const result = validateCreatorWorkflow('Write', toolInput);
      assert.strictEqual(
        result.pass,
        false,
        'Writes to protected hook paths must still be blocked without the creator token'
      );
      assert.strictEqual(result.result, 'block');
    });

    it('Write to a NEW SKILL.md is still blocked (no active skill-creator)', () => {
      const newSkillPath = `.claude/skills/fake-skill-${Date.now()}/SKILL.md`;
      const toolInput = {
        file_path: newSkillPath,
        content: '---\nname: fake-skill\n---\n',
      };
      const result = validateCreatorWorkflow('Write', toolInput);
      assert.strictEqual(
        result.pass,
        false,
        'Writes to protected skill paths must still be blocked without the creator token'
      );
      assert.strictEqual(result.result, 'block');
    });
  });
});
