const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join('.claude', 'config', 'required-status-checks.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

test('required-status-checks config exists', () => {
  assert.equal(fs.existsSync(configPath), true);
});

test('required-status-checks config has valid shape', () => {
  const config = readConfig();
  assert.equal(typeof config, 'object');
  assert.equal(Number.isInteger(config.version), true);
  assert.equal(typeof config.owner, 'string');
  assert.equal(Array.isArray(config.required_checks), true);
  assert.equal(config.required_checks.length > 0, true);
});

test('required-status-checks entries are unique non-empty strings', () => {
  const { required_checks: checks } = readConfig();
  const seen = new Set();
  for (const check of checks) {
    assert.equal(typeof check, 'string');
    assert.equal(check.trim().length > 0, true);
    assert.equal(seen.has(check), false, `duplicate check: ${check}`);
    seen.add(check);
  }
});

test('required-status-checks config includes governance baseline gates', () => {
  const { required_checks: checks } = readConfig();
  const required = [
    'memory-ci',
    'memory-mvp-gate',
    'nightly-strict-gate',
    'creator-ecosystem-validation',
    'validate-commands',
    'validate-skills',
  ];
  for (const check of required) {
    assert.equal(checks.includes(check), true, `missing required check: ${check}`);
  }
});
