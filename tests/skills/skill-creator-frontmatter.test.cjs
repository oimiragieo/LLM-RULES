'use strict';

/**
 * Tests for v3.1.0 SA: skill-creator emits optional frontmatter block
 *
 * Test 1: New skill created via skill-creator has optional frontmatter block present
 * Test 2: Resulting SKILL.md validates against skill-definition.schema.json
 * Test 3: Backward compat — existing skills without frontmatter still validate
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'skill-definition.schema.json');
const TEMPLATES_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'skills',
  'skill-creator',
  'scripts',
  'create-templates.cjs'
);

const templates = require(TEMPLATES_PATH);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lightweight YAML frontmatter parser (no external deps, no complex regex)
// ---------------------------------------------------------------------------

/** Strip inline YAML comment from a value string. */
function stripComment(val) {
  return val.replace(/\s+#.*$/, '').trim();
}

/** Coerce a scalar string to boolean / number / string. */
function coerceScalar(raw) {
  const v = stripComment(raw).replace(/^['"]|['"]$/g, '');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  if (/^\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

/** Parse an inline YAML array "[a, b, c]" into a JS array. */
function parseInlineArray(val) {
  const inner = val.replace(/^\[|\]$/g, '').trim();
  return inner ? inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')) : [];
}

/**
 * Consume nested sub-list items indented at `indent` spaces under a parent key.
 * Returns { subList, consumed } — caller advances `i` by `consumed`.
 */
function consumeSubList(lines, startIdx, indent) {
  const pat = new RegExp(`^ {${indent}}- (.*)`);
  const subList = [];
  let consumed = 0;
  while (startIdx + consumed + 1 < lines.length) {
    const sub = lines[startIdx + consumed + 1];
    if (/^ {2,}#/.test(sub)) {
      consumed++;
      continue;
    }
    const m = sub.match(pat);
    if (m) {
      subList.push(m[1].trim());
      consumed++;
    } else break;
  }
  return { subList, consumed };
}

/**
 * Parse the YAML frontmatter from a SKILL.md string.
 * Returns the parsed object (handles two levels of nesting, inline comments).
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'Expected YAML frontmatter delimited by ---');
  const lines = match[1].split('\n');
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*#/.test(line)) {
      i++;
      continue;
    } // skip comment lines

    const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
    if (!topMatch) {
      i++;
      continue;
    }

    const key = topMatch[1];
    const rawVal = topMatch[2].trim();

    if (rawVal !== '') {
      // Inline value (scalar or inline array)
      if (rawVal.startsWith('[')) result[key] = parseInlineArray(rawVal);
      else result[key] = coerceScalar(rawVal);
      i++;
      continue;
    }

    // Empty value — collect indented children (object or list)
    const nested = {};
    const nestedList = [];
    let isObject = false;
    let isList = false;

    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^ {2,}#/.test(next)) {
        i++;
        continue;
      }
      const objMatch = next.match(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
      const listMatch = next.match(/^ {2}- (.*)/);

      if (objMatch) {
        isObject = true;
        const nKey = objMatch[1];
        const nVal = stripComment(objMatch[2]).trim();
        if (nVal === '') {
          // nested list under this object key (indented at 4 spaces)
          const { subList, consumed } = consumeSubList(lines, i + 1, 4);
          nested[nKey] = subList;
          i += consumed;
        } else {
          nested[nKey] = coerceScalar(nVal);
        }
        i++;
      } else if (listMatch) {
        isList = true;
        nestedList.push(listMatch[1].trim());
        i++;
      } else {
        break;
      }
    }

    if (isObject) result[key] = nested;
    else if (isList) result[key] = nestedList;
    else result[key] = '';
    i++;
  }

  return result;
}

/**
 * Validate a frontmatter object against the skill-definition schema
 * using the ajv-free approach: structural property checks only.
 * (No ajv dependency — mirrors the existing test patterns in this repo.)
 */
function validateAgainstSchema(frontmatterObj) {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  // required fields
  for (const req of schema.required || []) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(frontmatterObj, req),
      `Required field "${req}" missing from frontmatter`
    );
  }

  // name pattern
  if (frontmatterObj.name) {
    assert.match(
      frontmatterObj.name,
      /^[a-z][a-z0-9-]*$/,
      `name "${frontmatterObj.name}" does not match pattern ^[a-z][a-z0-9-]*$`
    );
  }

  // description minLength
  if (frontmatterObj.description) {
    assert.ok(
      frontmatterObj.description.length >= 10,
      `description must be >= 10 chars, got ${frontmatterObj.description.length}`
    );
  }

  // model enum
  if (frontmatterObj.model !== undefined) {
    const validModels = schema.properties.model.enum;
    assert.ok(
      validModels.includes(frontmatterObj.model),
      `model "${frontmatterObj.model}" is not in ${JSON.stringify(validModels)}`
    );
  }

  // frontmatter block — if present, validate its sub-properties
  if (frontmatterObj.frontmatter !== undefined) {
    assert.ok(
      typeof frontmatterObj.frontmatter === 'object' && frontmatterObj.frontmatter !== null,
      'frontmatter must be an object'
    );
    const fm = frontmatterObj.frontmatter;
    const fmSchema = schema.properties.frontmatter;

    // triggers
    if (fm.triggers !== undefined) {
      assert.ok(Array.isArray(fm.triggers), 'frontmatter.triggers must be an array');
      for (const t of fm.triggers) {
        assert.equal(typeof t, 'string', 'Each trigger must be a string');
      }
    }

    // token_budget
    if (fm.token_budget !== undefined) {
      assert.ok(typeof fm.token_budget === 'number', 'frontmatter.token_budget must be a number');
      assert.ok(
        fm.token_budget >= fmSchema.properties.token_budget.minimum,
        `frontmatter.token_budget must be >= ${fmSchema.properties.token_budget.minimum}`
      );
    }

    // output_schema_ref
    if (fm.output_schema_ref !== undefined) {
      assert.equal(
        typeof fm.output_schema_ref,
        'string',
        'frontmatter.output_schema_ref must be a string'
      );
    }

    // requires_skills
    if (fm.requires_skills !== undefined) {
      assert.ok(Array.isArray(fm.requires_skills), 'frontmatter.requires_skills must be an array');
      for (const s of fm.requires_skills) {
        assert.equal(typeof s, 'string', 'Each requires_skills entry must be a string');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test 1: New skill created via generateSkillContent has frontmatter block
// ---------------------------------------------------------------------------

test('generateSkillContent emits optional frontmatter block with triggers and token_budget', () => {
  const content = templates.generateSkillContent({
    name: 'test-new-skill',
    description: 'A test skill for verifying frontmatter block emission in v3.1.0.',
    version: '1.0.0',
  });

  // The raw YAML frontmatter section should contain a frontmatter: key
  assert.match(content, /\nfrontmatter:\n/, 'frontmatter: key must be present in SKILL.md YAML');
  assert.match(content, /triggers:\n/, 'triggers list must be present under frontmatter');
  assert.match(content, /token_budget:/, 'token_budget must be present under frontmatter');
});

test('generateSkillContent frontmatter.triggers contains the skill name as first trigger', () => {
  const content = templates.generateSkillContent({
    name: 'my-example-skill',
    description: 'Demonstrates that triggers default to the skill name.',
    version: '1.0.0',
  });

  // The trigger should be the skill name
  assert.match(
    content,
    /triggers:\s*\n\s+- my-example-skill/,
    'First trigger should default to skill name'
  );
});

test('generateSkillContent token_budget defaults to 10000', () => {
  const content = templates.generateSkillContent({
    name: 'budget-test-skill',
    description: 'Verifies the default token_budget value is set correctly.',
  });

  assert.match(content, /token_budget: 10000/, 'Default token_budget must be 10000');
});

// ---------------------------------------------------------------------------
// Test 2: Generated SKILL.md validates against skill-definition.schema.json
// ---------------------------------------------------------------------------

test('generated SKILL.md frontmatter validates against skill-definition.schema.json', () => {
  const content = templates.generateSkillContent({
    name: 'schema-validated-skill',
    description: 'A skill generated by skill-creator to verify schema compliance in v3.1.0.',
    version: '1.0.0',
    model: 'sonnet',
  });

  const frontmatterObj = parseFrontmatter(content);

  // Must not throw
  validateAgainstSchema(frontmatterObj);

  // Explicit frontmatter sub-field checks
  assert.ok(
    frontmatterObj.frontmatter,
    'frontmatter property must be present after schema validation'
  );
  assert.ok(
    Array.isArray(frontmatterObj.frontmatter.triggers),
    'frontmatter.triggers must be an array'
  );
  assert.ok(
    frontmatterObj.frontmatter.token_budget >= 1000,
    'frontmatter.token_budget must satisfy schema minimum of 1000'
  );
});

// ---------------------------------------------------------------------------
// Test 3: Backward compat — existing skills without frontmatter still valid
// ---------------------------------------------------------------------------

test('skill-definition schema validates existing SKILL.md files that lack frontmatter block', () => {
  // Minimal valid frontmatter without a frontmatter block — as all pre-v3.1.0 skills look
  const legacyContent = `---
name: legacy-skill
description: A legacy skill created before v3.1.0 that has no frontmatter block.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write]
agents: [developer]
category: "Specialized Patterns"
tags: [legacy, test]
---

# Legacy Skill

## Purpose
This skill existed before v3.1.0 and has no frontmatter block.
`;

  // Parse the frontmatter — should not contain a frontmatter key
  const frontmatterObj = parseFrontmatter(legacyContent);
  assert.equal(
    frontmatterObj.frontmatter,
    undefined,
    'Legacy skills must not have a frontmatter key'
  );

  // Schema validation must still pass (frontmatter is not in required[])
  validateAgainstSchema(frontmatterObj);
});

test('existing builtin skill files without frontmatter block still pass schema validation', () => {
  // Read a real existing skill that was created before v3.1.0 (no frontmatter block)
  // skill-updater is a good candidate — it predates v3.1.0
  const skillUpdaterPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'skills',
    'skill-updater',
    'SKILL.md'
  );

  if (!fs.existsSync(skillUpdaterPath)) {
    // If not present in this environment, skip gracefully
    return;
  }

  const content = fs.readFileSync(skillUpdaterPath, 'utf8');
  const frontmatterObj = parseFrontmatter(content);

  // skill-updater should not have frontmatter block (predates SA)
  // But even if it does, schema validation must pass either way
  validateAgainstSchema(frontmatterObj);
});

test('skill-creator SKILL.md documents the v3.1.0 frontmatter block in Template Reference', () => {
  const skillCreatorDoc = fs.readFileSync(
    path.join(PROJECT_ROOT, '.claude', 'skills', 'skill-creator', 'SKILL.md'),
    'utf8'
  );

  assert.match(
    skillCreatorDoc,
    /frontmatter:/,
    'skill-creator SKILL.md Template Reference must include frontmatter: key'
  );
  assert.match(
    skillCreatorDoc,
    /triggers:/,
    'skill-creator SKILL.md Template Reference must include triggers: key'
  );
  assert.match(
    skillCreatorDoc,
    /token_budget:/,
    'skill-creator SKILL.md Template Reference must include token_budget: key'
  );
  assert.match(
    skillCreatorDoc,
    /v3\.1\.0/,
    'skill-creator SKILL.md must reference v3.1.0 in the frontmatter section'
  );
});
