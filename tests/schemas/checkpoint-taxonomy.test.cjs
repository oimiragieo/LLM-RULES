'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('checkpoint-taxonomy schema', () => {
  const schemaPath = path.resolve(
    __dirname,
    '..',
    '..',
    '.claude',
    'schemas',
    'checkpoint-taxonomy.schema.json'
  );

  test('schema file should exist', () => {
    assert.ok(fs.existsSync(schemaPath));
  });

  test('schema should have checkpoint_id, type, wave, timestamp, gate_passed', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties.checkpoint_id);
    assert.ok(schema.properties.type);
    assert.ok(schema.properties.wave);
    assert.ok(schema.properties.timestamp);
    assert.ok(schema.properties.gate_passed);
  });

  test('type enum should include wave_complete, phase_gate, quality_gate', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const types = schema.properties.type.enum;
    assert.ok(types.includes('wave_complete'));
    assert.ok(types.includes('phase_gate'));
    assert.ok(types.includes('quality_gate'));
  });

  test('checkpoint_id should require CP- prefix', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties.checkpoint_id.pattern.includes('CP-'));
  });
});
