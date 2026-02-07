/**
 * Test: phase-models.json consistency with config.yaml
 *
 * Purpose: Ensures phase-models.json model assignments match config.yaml agent models.
 * This prevents the P1 bug where phase-based model resolution yields different models
 * than agent-type-based resolution (Pipeline #10, Task #107).
 *
 * Pattern: TDD regression test for config drift prevention
 */

const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const yaml = require('js-yaml');

const PROJECT_ROOT = resolve(__dirname, '../..');

// Helper: Normalize model name to shorthand
function normalizeModel(model) {
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model;
}

// Read config files
const phaseModelsPath = resolve(PROJECT_ROOT, '.claude/config/phase-models.json');
const phaseModelsContent = readFileSync(phaseModelsPath, 'utf8');
const phaseModels = JSON.parse(phaseModelsContent);

const configYamlPath = resolve(PROJECT_ROOT, '.claude/config.yaml');
const configYamlContent = readFileSync(configYamlPath, 'utf8');
const configYaml = yaml.load(configYamlContent);

test('planning phase model matches planner agent model', () => {
  const planningPhaseModel = phaseModels.phaseModels.planning;
  const plannerAgentModel = configYaml.agents.planner.model;

  const normalizedPhase = normalizeModel(planningPhaseModel);
  const normalizedAgent = normalizeModel(plannerAgentModel);

  assert.strictEqual(
    normalizedPhase,
    normalizedAgent,
    `Planning phase model "${planningPhaseModel}" should match planner agent model "${plannerAgentModel}"`
  );
});

test('qa phase model matches qa agent model', () => {
  const qaPhaseModel = phaseModels.phaseModels.qa;
  const qaAgentModel = configYaml.agents.qa.model;

  const normalizedPhase = normalizeModel(qaPhaseModel);
  const normalizedAgent = normalizeModel(qaAgentModel);

  assert.strictEqual(
    normalizedPhase,
    normalizedAgent,
    `QA phase model "${qaPhaseModel}" should match qa agent model "${qaAgentModel}"`
  );
});

test('coding phase model matches developer agent model', () => {
  const codingPhaseModel = phaseModels.phaseModels.coding;
  const developerAgentModel = configYaml.agents.developer.model;

  const normalizedPhase = normalizeModel(codingPhaseModel);
  const normalizedAgent = normalizeModel(developerAgentModel);

  assert.strictEqual(
    normalizedPhase,
    normalizedAgent,
    `Coding phase model "${codingPhaseModel}" should match developer agent model "${developerAgentModel}"`
  );
});

test('spec phase model is reasonable (sonnet or opus)', () => {
  const specPhaseModel = phaseModels.phaseModels.spec;

  // Spec gathering should use sonnet or opus (not haiku)
  assert.ok(
    ['sonnet', 'opus'].includes(specPhaseModel),
    `Spec phase model should be sonnet or opus, got "${specPhaseModel}"`
  );
});

test('phase-models.json has schema reference', () => {
  assert.ok(phaseModels.$schema, 'phase-models.json should have $schema field');
  assert.ok(
    phaseModels.$schema.includes('phase-models.schema.json'),
    '$schema should reference phase-models.schema.json'
  );
});

test('all phaseModels keys are valid', () => {
  const validPhases = ['spec', 'planning', 'coding', 'qa'];
  const actualPhases = Object.keys(phaseModels.phaseModels);

  actualPhases.forEach(phase => {
    assert.ok(
      validPhases.includes(phase),
      `Invalid phase "${phase}" in phaseModels`
    );
  });
});

test('all phaseThinking keys match phaseModels keys', () => {
  const modelKeys = Object.keys(phaseModels.phaseModels).sort();
  const thinkingKeys = Object.keys(phaseModels.phaseThinking).sort();

  assert.deepStrictEqual(
    thinkingKeys,
    modelKeys,
    'phaseThinking keys should match phaseModels keys'
  );
});
