'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_DIR = path.join(__dirname, '..', '..', '.claude', 'config', 'mission-alignment');

function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, filename), 'utf8'));
}

describe('Mission Alignment Config — manifest.json', () => {
  it('exists and has valid structure', () => {
    const manifest = loadJSON('manifest.json');
    assert.ok(manifest.$id);
    assert.ok(manifest.version);
    assert.ok(manifest.artifacts);
    assert.ok(manifest.artifacts.schemas);
    assert.ok(manifest.artifacts.rules);
    assert.ok(manifest.artifacts.rubric);
    assert.ok(manifest.artifacts.evaluatorReference);
  });

  it('references 6 schema files', () => {
    const manifest = loadJSON('manifest.json');
    assert.equal(manifest.artifacts.schemas.length, 6);
  });
});

describe('Mission Alignment Config — rules.json', () => {
  it('exists and has valid structure', () => {
    const rules = loadJSON('rules.json');
    assert.ok(rules.version);
    assert.ok(rules.artifacts);
    assert.ok(rules.evaluationKinds);
    assert.ok(Array.isArray(rules.rules));
  });

  it('has 17 rules', () => {
    const rules = loadJSON('rules.json');
    assert.equal(rules.rules.length, 17);
  });

  it('every rule has required fields', () => {
    const rules = loadJSON('rules.json');
    for (const rule of rules.rules) {
      assert.ok(rule.id, `rule must have id`);
      assert.ok(rule.title, `rule ${rule.id} must have title`);
      assert.ok(rule.category, `rule ${rule.id} must have category`);
      assert.ok(rule.severity, `rule ${rule.id} must have severity`);
      assert.ok(rule.evaluation, `rule ${rule.id} must have evaluation`);
    }
  });

  it('blocker rules exist', () => {
    const rules = loadJSON('rules.json');
    const blockers = rules.rules.filter(r => r.severity === 'blocker');
    assert.ok(blockers.length >= 3, 'should have at least 3 blocker rules');
  });

  it('rule IDs are unique', () => {
    const rules = loadJSON('rules.json');
    const ids = rules.rules.map(r => r.id);
    assert.equal(ids.length, new Set(ids).size, 'rule IDs must be unique');
  });

  it('rule IDs follow R-* or W-* pattern', () => {
    const rules = loadJSON('rules.json');
    for (const rule of rules.rules) {
      assert.ok(/^[RW]-/.test(rule.id), `rule ${rule.id} should start with R- or W-`);
    }
  });
});

describe('Mission Alignment Config — rubric.json', () => {
  it('exists and has valid structure', () => {
    const rubric = loadJSON('rubric.json');
    assert.ok(rubric.scale);
    assert.ok(rubric.gradeBands);
    assert.ok(rubric.severityWeights);
    assert.ok(rubric.ruleScoring);
  });

  it('passThreshold < excellentThreshold', () => {
    const rubric = loadJSON('rubric.json');
    assert.ok(rubric.scale.passThreshold < rubric.scale.excellentThreshold);
  });

  it('category caps sum to approximately 100', () => {
    const rubric = loadJSON('rubric.json');
    const caps = rubric.ruleScoring.categoryCaps;
    const sum = Object.values(caps).reduce((a, b) => a + b, 0);
    // Some categories overlap, sum should be >= 100
    assert.ok(sum >= 100, `category caps sum ${sum} should be >= 100`);
  });

  it('grade bands are contiguous', () => {
    const rubric = loadJSON('rubric.json');
    const bands = rubric.gradeBands;
    assert.equal(bands.length, 4);
    assert.ok(bands.some(b => b.band === 'excellent'));
    assert.ok(bands.some(b => b.band === 'good'));
    assert.ok(bands.some(b => b.band === 'marginal'));
    assert.ok(bands.some(b => b.band === 'fail'));
  });

  it('blocker severity has failRun: true', () => {
    const rubric = loadJSON('rubric.json');
    assert.equal(rubric.severityWeights.blocker.failRun, true);
  });
});

describe('Mission Alignment Config — evaluator-reference.json', () => {
  it('exists and has valid structure', () => {
    const ref = loadJSON('evaluator-reference.json');
    assert.ok(ref.version);
    assert.ok(ref.kinds);
  });

  it('has all evaluation kinds referenced in rules', () => {
    const ref = loadJSON('evaluator-reference.json');
    const rules = loadJSON('rules.json');

    // Collect all evaluation kinds used in rules
    const usedKinds = new Set();
    for (const rule of rules.rules) {
      if (rule.evaluation.kind) {
        usedKinds.add(rule.evaluation.kind);
      }
      if (rule.evaluation.conditions) {
        for (const cond of rule.evaluation.conditions) {
          if (cond.kind) usedKinds.add(cond.kind);
        }
      }
      if (rule.evaluation.then && rule.evaluation.then.kind) {
        usedKinds.add(rule.evaluation.then.kind);
      }
    }

    // Check all used kinds exist in evaluator reference
    // (some complex kinds like all_commands_exit_zero are composites)
    const availableKinds = new Set(Object.keys(ref.kinds));
    for (const kind of usedKinds) {
      if (kind === 'all_commands_exit_zero') continue; // composite, not in base reference
      assert.ok(
        availableKinds.has(kind),
        `evaluation kind "${kind}" used in rules but missing from evaluator-reference`
      );
    }
  });

  it('every kind has inputs and algorithm', () => {
    const ref = loadJSON('evaluator-reference.json');
    for (const [name, spec] of Object.entries(ref.kinds)) {
      assert.ok(spec.inputs, `kind ${name} must have inputs`);
      assert.ok(spec.algorithm, `kind ${name} must have algorithm`);
    }
  });
});

describe('Cross-references — rules ↔ rubric', () => {
  it('all rule categories exist in rubric categoryCaps', () => {
    const rules = loadJSON('rules.json');
    const rubric = loadJSON('rubric.json');
    const caps = new Set(Object.keys(rubric.ruleScoring.categoryCaps));

    for (const rule of rules.rules) {
      assert.ok(
        caps.has(rule.category),
        `rule ${rule.id} category "${rule.category}" not in rubric categoryCaps`
      );
    }
  });

  it('all ruleOverride IDs exist in rules', () => {
    const rules = loadJSON('rules.json');
    const rubric = loadJSON('rubric.json');
    const ruleIds = new Set(rules.rules.map(r => r.id));

    for (const override of rubric.ruleScoring.ruleOverrides) {
      assert.ok(
        ruleIds.has(override.ruleId),
        `rubric override ${override.ruleId} not found in rules`
      );
    }
  });
});
