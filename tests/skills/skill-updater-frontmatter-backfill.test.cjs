#!/usr/bin/env node
'use strict';

/**
 * Tests for skill-updater v3.1.0 frontmatter backfill capability.
 * Covers:
 *   Test 1 — skill WITHOUT frontmatter block → updater proposes sensible defaults
 *   Test 2 — skill WITH frontmatter block → updater leaves it alone (no overwrite)
 *   Test 3 — backfill apply produces schema-valid output
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const {
  backfillFrontmatter,
  applyFrontmatterBackfill,
  parseFrontmatter,
  hasFrontmatterBlock,
  tokenizeDescription,
} = require(
  path.join(PROJECT_ROOT, '.claude', 'skills', 'skill-updater', 'scripts', 'main.cjs')
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temp skill directory + SKILL.md, run fn, then clean up.
 */
function withTempSkill(skillName, content, fn) {
  const skillDir = path.join(PROJECT_ROOT, '.claude', 'skills', skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');
  const relPath = `.claude/skills/${skillName}/SKILL.md`;
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillPath, content, 'utf8');
  try {
    return fn(relPath, skillPath);
  } finally {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

function makeSkillContent({ name = 'test-skill', description = '', withFrontmatterBlock = false } = {}) {
  const attrs = ['---', `name: ${name}`, `description: '${description}'`, 'version: 1.0.0'];
  if (withFrontmatterBlock) {
    attrs.push('frontmatter:');
    attrs.push('  triggers:');
    attrs.push('    - existing trigger');
    attrs.push('  token_budget: 5000');
    attrs.push('  requires_skills: []');
  }
  attrs.push('---');
  attrs.push('');
  attrs.push(`# ${name}`);
  attrs.push('');
  attrs.push('Body text here.');
  return attrs.join('\n');
}

// ---------------------------------------------------------------------------
// Test 1: skill WITHOUT frontmatter block → updater proposes sensible defaults
// ---------------------------------------------------------------------------

test('backfillFrontmatter proposes defaults for skill missing frontmatter block', () => {
  const desc = 'Research-backed skill refresh workflow for updating existing skills with TDD checkpoints.';
  const skillName = `tmp-bf-no-block-${Date.now()}`;

  withTempSkill(skillName, makeSkillContent({ name: skillName, description: desc }), (relPath) => {
    const result = backfillFrontmatter(relPath);

    assert.equal(result.action, 'proposed', `Expected "proposed" but got "${result.action}": ${result.message}`);
    assert.ok(result.proposed, 'proposed object should be present');

    // triggers derived from description keywords
    assert.ok(Array.isArray(result.proposed.triggers), 'triggers must be an array');
    assert.ok(result.proposed.triggers.length > 0, 'triggers must have at least one entry');
    // all triggers must be strings
    for (const t of result.proposed.triggers) {
      assert.equal(typeof t, 'string', `trigger "${t}" must be a string`);
    }

    // token_budget defaults to 10000
    assert.equal(result.proposed.token_budget, 10000, 'default token_budget must be 10000');

    // requires_skills defaults to []
    assert.ok(Array.isArray(result.proposed.requires_skills), 'requires_skills must be an array');
    assert.equal(result.proposed.requires_skills.length, 0, 'default requires_skills must be empty');

    assert.match(result.message, /proposed/i);
  });
});

test('backfillFrontmatter respects token_budget override', () => {
  const skillName = `tmp-bf-override-${Date.now()}`;
  withTempSkill(skillName, makeSkillContent({ name: skillName, description: 'some skill description' }), (relPath) => {
    const result = backfillFrontmatter(relPath, { token_budget: 20000, requires_skills: ['tdd'] });

    assert.equal(result.action, 'proposed');
    assert.equal(result.proposed.token_budget, 20000, 'overridden token_budget must be 20000');
    assert.deepEqual(result.proposed.requires_skills, ['tdd']);
  });
});

// ---------------------------------------------------------------------------
// Test 2: skill WITH frontmatter block → updater leaves it alone (no overwrite)
// ---------------------------------------------------------------------------

test('backfillFrontmatter returns already_present for skill that already has frontmatter block', () => {
  const skillName = `tmp-bf-has-block-${Date.now()}`;

  withTempSkill(
    skillName,
    makeSkillContent({ name: skillName, description: 'existing skill', withFrontmatterBlock: true }),
    (relPath, absolutePath) => {
      const originalContent = fs.readFileSync(absolutePath, 'utf8');
      const result = backfillFrontmatter(relPath);

      assert.equal(
        result.action,
        'already_present',
        `Expected "already_present" but got "${result.action}": ${result.message}`
      );
      assert.match(result.message, /already has/i);

      // File must be unchanged
      const afterContent = fs.readFileSync(absolutePath, 'utf8');
      assert.equal(afterContent, originalContent, 'File must not be modified when frontmatter block already present');
    }
  );
});

test('applyFrontmatterBackfill refuses to overwrite existing frontmatter block', () => {
  const skillName = `tmp-bf-refuse-${Date.now()}`;

  withTempSkill(
    skillName,
    makeSkillContent({ name: skillName, description: 'has block', withFrontmatterBlock: true }),
    (relPath, absolutePath) => {
      const originalContent = fs.readFileSync(absolutePath, 'utf8');
      const result = applyFrontmatterBackfill(relPath, {
        triggers: ['override attempt'],
        token_budget: 9999,
        requires_skills: [],
      });

      assert.equal(result.ok, false, 'apply must fail when frontmatter block already present');
      assert.match(result.message, /already present|refusing/i);

      // File must be unchanged
      const afterContent = fs.readFileSync(absolutePath, 'utf8');
      assert.equal(afterContent, originalContent, 'File must not be modified when block already present');
    }
  );
});

// ---------------------------------------------------------------------------
// Test 3: backfill apply produces schema-valid output
// ---------------------------------------------------------------------------

test('applyFrontmatterBackfill writes a schema-valid frontmatter block', () => {
  const skillName = `tmp-bf-apply-${Date.now()}`;
  const desc = 'Hybrid semantic BM25 search over the codebase for discovery and navigation.';

  withTempSkill(skillName, makeSkillContent({ name: skillName, description: desc }), (relPath, absolutePath) => {
    // Step 1: propose
    const proposal = backfillFrontmatter(relPath);
    assert.equal(proposal.action, 'proposed');

    // Step 2: apply (simulates agent confirming)
    const applyResult = applyFrontmatterBackfill(relPath, proposal.proposed);
    assert.equal(applyResult.ok, true, `apply failed: ${applyResult.message}`);

    // Step 3: read back and validate structure
    const updatedContent = fs.readFileSync(absolutePath, 'utf8');
    const parsed = parseFrontmatter(updatedContent);
    assert.ok(parsed, 'Updated file must have parseable frontmatter');
    assert.ok(hasFrontmatterBlock(parsed.attributes), 'Updated frontmatter must contain frontmatter block');

    const fm = parsed.attributes.frontmatter;

    // triggers must be non-empty string array
    assert.ok(Array.isArray(fm.triggers), 'triggers must be array');
    assert.ok(fm.triggers.length > 0, 'triggers must not be empty');
    for (const t of fm.triggers) {
      assert.equal(typeof t, 'string', `trigger "${t}" must be string`);
    }

    // token_budget must be integer >= 1000
    assert.equal(typeof fm.token_budget, 'number', 'token_budget must be number');
    assert.ok(fm.token_budget >= 1000, `token_budget ${fm.token_budget} must be >= 1000`);

    // requires_skills must be array
    assert.ok(Array.isArray(fm.requires_skills), 'requires_skills must be array');

    // only allowed keys per schema (additionalProperties: false)
    const allowedKeys = new Set(['triggers', 'output_schema_ref', 'token_budget', 'requires_skills']);
    for (const key of Object.keys(fm)) {
      assert.ok(allowedKeys.has(key), `unknown frontmatter key "${key}" violates additionalProperties:false`);
    }

    // body must be preserved intact
    assert.match(updatedContent, /# .+\n\nBody text here\./s, 'Markdown body must be preserved after backfill');
  });
});

test('applyFrontmatterBackfill is idempotent — second call returns ok:false without file change', () => {
  const skillName = `tmp-bf-idem-${Date.now()}`;

  withTempSkill(skillName, makeSkillContent({ name: skillName, description: 'idempotency check skill' }), (relPath, absolutePath) => {
    const proposal = backfillFrontmatter(relPath);
    assert.equal(proposal.action, 'proposed');

    // First apply
    const first = applyFrontmatterBackfill(relPath, proposal.proposed);
    assert.equal(first.ok, true);

    const afterFirst = fs.readFileSync(absolutePath, 'utf8');

    // Second apply must fail (already present)
    const second = applyFrontmatterBackfill(relPath, proposal.proposed);
    assert.equal(second.ok, false, 'second apply must fail when block already written');

    const afterSecond = fs.readFileSync(absolutePath, 'utf8');
    assert.equal(afterSecond, afterFirst, 'file must not change on second apply attempt');
  });
});

// ---------------------------------------------------------------------------
// Test 4: tokenizeDescription unit tests
// ---------------------------------------------------------------------------

test('tokenizeDescription extracts meaningful keywords from a description', () => {
  const tokens = tokenizeDescription(
    'Research-backed skill refresh workflow for updating existing skills with TDD checkpoints.'
  );
  assert.ok(Array.isArray(tokens), 'tokens must be array');
  assert.ok(tokens.length > 0, 'must extract at least one token');
  // all must be strings
  for (const t of tokens) assert.equal(typeof t, 'string');
  // stop words must be filtered
  assert.ok(!tokens.includes('for'), '"for" is a stop word and must be filtered');
  assert.ok(!tokens.includes('with'), '"with" is a stop word and must be filtered');
  // length cap
  assert.ok(tokens.length <= 8, 'must return at most 8 tokens');
});

test('tokenizeDescription returns skill name as fallback for empty description', () => {
  const tokens = tokenizeDescription('');
  assert.ok(Array.isArray(tokens));
  // empty description → empty array (caller provides name as fallback)
  assert.equal(tokens.length, 0, 'empty description yields empty array (caller adds name fallback)');
});

test('backfillFrontmatter uses skill name as trigger when description is empty', () => {
  const skillName = `tmp-bf-nodesc-${Date.now()}`;

  withTempSkill(
    skillName,
    ['---', `name: ${skillName}`, "description: ''", '---', '', '# Body'].join('\n'),
    (relPath) => {
      const result = backfillFrontmatter(relPath);
      assert.equal(result.action, 'proposed');
      assert.ok(result.proposed.triggers.length > 0, 'must have at least one trigger even with empty description');
      assert.ok(
        result.proposed.triggers.includes(skillName),
        `skill name "${skillName}" must be used as fallback trigger`
      );
    }
  );
});

test('backfillFrontmatter returns error for non-existent skill file', () => {
  const result = backfillFrontmatter('.claude/skills/does-not-exist-xyz/SKILL.md');
  assert.equal(result.action, 'error');
  assert.match(result.message, /not found/i);
});
