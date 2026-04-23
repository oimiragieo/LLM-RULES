'use strict';

// Agent: general-purpose | Task: #SD | Session: 2026-04-20
// Tests for validatePlanSectionOrder, isPlanFile, and enforcePlanSectionOrder
// exported from pre-completion-validation.cjs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

const { validatePlanSectionOrder, isPlanFile, enforcePlanSectionOrder, CANONICAL_PLAN_SECTIONS } =
  hook;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a temp plan file and return its path.
 * Caller is responsible for cleanup.
 */
function writeTempPlan(content, name = 'test-plan.md') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return { filePath, dir };
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    void _;
  }
}

// ---------------------------------------------------------------------------
// CANONICAL_PLAN_SECTIONS constant
// ---------------------------------------------------------------------------

test('CANONICAL_PLAN_SECTIONS exports exactly 6 sections', () => {
  assert.equal(CANONICAL_PLAN_SECTIONS.length, 6);
});

test('CANONICAL_PLAN_SECTIONS has correct ordering', () => {
  assert.deepEqual(CANONICAL_PLAN_SECTIONS, [
    '## Problem',
    '## Decision',
    '## Scope',
    '## Risks',
    '## Steps',
    '## Done Criteria',
  ]);
});

// ---------------------------------------------------------------------------
// isPlanFile
// ---------------------------------------------------------------------------

test('isPlanFile returns true for .md in .claude/context/plans/', () => {
  assert.equal(isPlanFile('/project/.claude/context/plans/my-plan.md'), true);
});

test('isPlanFile returns true for Windows-style path', () => {
  assert.equal(isPlanFile('C:\\project\\.claude\\context\\plans\\my-plan.md'), true);
});

test('isPlanFile returns false for non-.md file in plans/', () => {
  assert.equal(isPlanFile('/project/.claude/context/plans/my-plan.json'), false);
});

test('isPlanFile returns false for .md file outside plans/', () => {
  assert.equal(isPlanFile('/project/docs/my-plan.md'), false);
});

test('isPlanFile returns false for null', () => {
  assert.equal(isPlanFile(null), false);
});

test('isPlanFile returns false for empty string', () => {
  assert.equal(isPlanFile(''), false);
});

// ---------------------------------------------------------------------------
// validatePlanSectionOrder — passing cases
// ---------------------------------------------------------------------------

test('validatePlanSectionOrder passes for a plan with all 6 sections in order', () => {
  const content = [
    '# My Plan',
    '',
    '## Problem',
    'The problem statement.',
    '',
    '## Decision',
    'The decision made.',
    '',
    '## Scope',
    'What is in scope.',
    '',
    '## Risks',
    'Known risks.',
    '',
    '## Steps',
    '- [ ] Step 1',
    '',
    '## Done Criteria',
    'Acceptance criteria.',
  ].join('\n');

  const { filePath, dir } = writeTempPlan(content);
  try {
    const result = validatePlanSectionOrder(filePath);
    assert.equal(result.passed, true, 'Should pass for correct plan');
    assert.equal(result.missing.length, 0);
    assert.equal(result.outOfOrder.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('validatePlanSectionOrder passes for a non-existent file (fail-open)', () => {
  const result = validatePlanSectionOrder('/does/not/exist/plan.md');
  assert.equal(result.passed, true, 'Should fail-open for missing file');
});

// ---------------------------------------------------------------------------
// validatePlanSectionOrder — missing section cases
// ---------------------------------------------------------------------------

test('validatePlanSectionOrder detects missing ## Problem section', () => {
  const content = [
    '## Decision',
    'The decision.',
    '## Scope',
    'Scope.',
    '## Risks',
    'Risks.',
    '## Steps',
    '- [ ] step',
    '## Done Criteria',
    'Criteria.',
  ].join('\n');

  const { filePath, dir } = writeTempPlan(content);
  try {
    const result = validatePlanSectionOrder(filePath);
    assert.equal(result.passed, false);
    assert.ok(result.missing.includes('## Problem'), 'Should flag missing ## Problem');
  } finally {
    cleanup(dir);
  }
});

test('validatePlanSectionOrder detects missing ## Done Criteria section', () => {
  const content = [
    '## Problem',
    'Problem.',
    '## Decision',
    'Decision.',
    '## Scope',
    'Scope.',
    '## Risks',
    'Risks.',
    '## Steps',
    '- [ ] step',
  ].join('\n');

  const { filePath, dir } = writeTempPlan(content);
  try {
    const result = validatePlanSectionOrder(filePath);
    assert.equal(result.passed, false);
    assert.ok(result.missing.includes('## Done Criteria'), 'Should flag missing ## Done Criteria');
  } finally {
    cleanup(dir);
  }
});

test('validatePlanSectionOrder detects multiple missing sections', () => {
  const content = ['## Problem', 'Problem.', '## Steps', '- [ ] step'].join('\n');

  const { filePath, dir } = writeTempPlan(content);
  try {
    const result = validatePlanSectionOrder(filePath);
    assert.equal(result.passed, false);
    assert.ok(result.missing.length >= 3, 'Should flag at least 3 missing sections');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// validatePlanSectionOrder — out-of-order cases
// ---------------------------------------------------------------------------

test('validatePlanSectionOrder detects out-of-order sections (Decision before Problem)', () => {
  const content = [
    '## Decision',
    'Decision first.',
    '## Problem',
    'Problem second.',
    '## Scope',
    'Scope.',
    '## Risks',
    'Risks.',
    '## Steps',
    '- [ ] step',
    '## Done Criteria',
    'Criteria.',
  ].join('\n');

  const { filePath, dir } = writeTempPlan(content);
  try {
    const result = validatePlanSectionOrder(filePath);
    assert.equal(result.passed, false);
    assert.ok(result.outOfOrder.length > 0, 'Should flag out-of-order section');
  } finally {
    cleanup(dir);
  }
});

test('validatePlanSectionOrder detects Done Criteria placed before Steps', () => {
  const content = [
    '## Problem',
    'Problem.',
    '## Decision',
    'Decision.',
    '## Scope',
    'Scope.',
    '## Risks',
    'Risks.',
    '## Done Criteria',
    'Criteria placed early.',
    '## Steps',
    '- [ ] step',
  ].join('\n');

  const { filePath, dir } = writeTempPlan(content);
  try {
    const result = validatePlanSectionOrder(filePath);
    assert.equal(result.passed, false);
    assert.ok(result.outOfOrder.length > 0, 'Done Criteria before Steps should be out-of-order');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// enforcePlanSectionOrder — env flag behaviour
// ---------------------------------------------------------------------------

test('enforcePlanSectionOrder does not throw on empty filesModified', () => {
  // Should be a no-op silently
  assert.doesNotThrow(() => {
    enforcePlanSectionOrder([]);
  });
});

test('enforcePlanSectionOrder does not throw on non-plan files', () => {
  assert.doesNotThrow(() => {
    enforcePlanSectionOrder([
      '/project/src/foo.ts',
      '/project/.claude/context/plans/plan.json', // json, not md
    ]);
  });
});

test('enforcePlanSectionOrder with PLAN_SECTION_ORDER_STRICT=off does not write to stderr for bad plan', async () => {
  const content = ['## Problem', 'Only one section.'].join('\n');
  const { filePath, dir } = writeTempPlan(content);

  const origEnv = process.env.PLAN_SECTION_ORDER_STRICT;
  process.env.PLAN_SECTION_ORDER_STRICT = 'off';

  // Capture stderr
  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = chunk => {
    stderrChunks.push(chunk);
    return true;
  };

  try {
    enforcePlanSectionOrder([filePath]);
    const stderrOutput = stderrChunks.join('');
    // When off, the function returns immediately — nothing about plan section order should appear
    assert.ok(
      !stderrOutput.includes('PLAN SECTION ORDER'),
      'Should not emit plan section warning when PLAN_SECTION_ORDER_STRICT=off'
    );
  } finally {
    process.stderr.write = origWrite;
    if (origEnv === undefined) {
      delete process.env.PLAN_SECTION_ORDER_STRICT;
    } else {
      process.env.PLAN_SECTION_ORDER_STRICT = origEnv;
    }
    cleanup(dir);
  }
});

test('enforcePlanSectionOrder with PLAN_SECTION_ORDER_STRICT=warn emits stderr warning for bad plan', () => {
  const content = ['## Problem', 'Only one section.'].join('\n');

  // Write to a path that isPlanFile will recognize
  const plansDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-context-plans-'));
  const filePath = path.join(plansDir, 'my-plan.md');
  fs.writeFileSync(filePath, content, 'utf8');

  // We need a path that isPlanFile recognizes (checks for '/.claude/context/plans/' in path).
  fs.writeFileSync(filePath, content, 'utf8');

  const origEnv = process.env.PLAN_SECTION_ORDER_STRICT;
  process.env.PLAN_SECTION_ORDER_STRICT = 'warn';

  // We need a path that isPlanFile recognizes. Create a nested temp structure.
  const nestedDir = path.join(
    os.tmpdir(),
    `plan-test-${Date.now()}`,
    '.claude',
    'context',
    'plans'
  );
  fs.mkdirSync(nestedDir, { recursive: true });
  const nestedPlanFile = path.join(nestedDir, 'bad-plan.md');
  fs.writeFileSync(nestedPlanFile, content, 'utf8');

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = chunk => {
    stderrChunks.push(chunk);
    return true;
  };

  try {
    enforcePlanSectionOrder([nestedPlanFile]);
    const stderrOutput = stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('PLAN SECTION ORDER WARNING'),
      `Should emit plan section warning for bad plan. Got: ${stderrOutput}`
    );
  } finally {
    process.stderr.write = origWrite;
    if (origEnv === undefined) {
      delete process.env.PLAN_SECTION_ORDER_STRICT;
    } else {
      process.env.PLAN_SECTION_ORDER_STRICT = origEnv;
    }
    try {
      fs.rmSync(path.join(os.tmpdir(), `plan-test-${Date.now() - 1}`), {
        recursive: true,
        force: true,
      });
    } catch (_) {
      void _;
    }
    cleanup(plansDir);
    try {
      fs.rmSync(nestedDir, { recursive: true, force: true });
    } catch (_) {
      void _;
    }
  }
});

test('enforcePlanSectionOrder does NOT emit warning for valid plan', () => {
  const content = [
    '## Problem',
    'Problem statement.',
    '## Decision',
    'Decision made.',
    '## Scope',
    'Scope defined.',
    '## Risks',
    'Risks identified.',
    '## Steps',
    '- [ ] Do thing',
    '## Done Criteria',
    'Criteria defined.',
  ].join('\n');

  const nestedDir = path.join(
    os.tmpdir(),
    `plan-test-valid-${Date.now()}`,
    '.claude',
    'context',
    'plans'
  );
  fs.mkdirSync(nestedDir, { recursive: true });
  const planFile = path.join(nestedDir, 'good-plan.md');
  fs.writeFileSync(planFile, content, 'utf8');

  const origEnv = process.env.PLAN_SECTION_ORDER_STRICT;
  process.env.PLAN_SECTION_ORDER_STRICT = 'warn';

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = chunk => {
    stderrChunks.push(chunk);
    return true;
  };

  try {
    enforcePlanSectionOrder([planFile]);
    const stderrOutput = stderrChunks.join('');
    assert.ok(
      !stderrOutput.includes('PLAN SECTION ORDER WARNING'),
      'Should NOT emit warning for a correctly-ordered plan'
    );
  } finally {
    process.stderr.write = origWrite;
    if (origEnv === undefined) {
      delete process.env.PLAN_SECTION_ORDER_STRICT;
    } else {
      process.env.PLAN_SECTION_ORDER_STRICT = origEnv;
    }
    try {
      fs.rmSync(nestedDir, { recursive: true, force: true });
    } catch (_) {
      void _;
    }
  }
});
