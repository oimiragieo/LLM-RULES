#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  INVARIANTS,
  checkInvariant,
  checkAll,
  getInvariantsByCategory,
  getInvariantIds,
} = require('../../.claude/lib/diagnostics/static-invariants.cjs');

describe('static-invariants (F3)', () => {
  it('has invariants defined', () => {
    assert.ok(INVARIANTS.length >= 10);
  });

  it('all invariants have required fields', () => {
    for (const inv of INVARIANTS) {
      assert.ok(inv.id, `Missing id`);
      assert.ok(inv.category, `${inv.id} missing category`);
      assert.ok(inv.description, `${inv.id} missing description`);
      assert.ok(inv.source, `${inv.id} missing source`);
      assert.ok(typeof inv.check === 'function', `${inv.id} missing check function`);
    }
  });

  it('INV-R02 passes when not developer', () => {
    const result = checkInvariant('INV-R02', { agentType: 'qa' });
    assert.equal(result.valid, true);
  });

  it('INV-R02 fails when developer has specialist available', () => {
    const result = checkInvariant('INV-R02', {
      agentType: 'developer',
      specialistAvailable: 'technical-writer',
    });
    assert.equal(result.valid, false);
    assert.ok(result.message.includes('technical-writer'));
  });

  it('INV-T01 blocks banned tools for router', () => {
    const result = checkInvariant('INV-T01', { toolName: 'Edit' });
    assert.equal(result.valid, false);
  });

  it('INV-T01 allows non-banned tools', () => {
    const result = checkInvariant('INV-T01', { toolName: 'Read' });
    assert.equal(result.valid, true);
  });

  it('INV-C01 blocks direct writes to creator paths', () => {
    const result = checkInvariant('INV-C01', {
      filePath: '.claude/skills/tdd/SKILL.md',
      viaCreatorSkill: false,
    });
    assert.equal(result.valid, false);
  });

  it('INV-C01 allows writes via creator skill', () => {
    const result = checkInvariant('INV-C01', {
      filePath: '.claude/skills/tdd/SKILL.md',
      viaCreatorSkill: true,
    });
    assert.equal(result.valid, true);
  });

  it('checkAll returns pass/fail counts', () => {
    const result = checkAll({});
    assert.ok(result.total === INVARIANTS.length);
    assert.ok(result.passed.length + result.failed.length === result.total);
  });

  it('getInvariantsByCategory filters correctly', () => {
    const routing = getInvariantsByCategory('routing');
    assert.ok(routing.length >= 3);
    assert.ok(routing.every(i => i.category === 'routing'));
  });

  it('getInvariantIds returns all IDs', () => {
    const ids = getInvariantIds();
    assert.equal(ids.length, INVARIANTS.length);
  });

  it('handles unknown invariant ID', () => {
    const result = checkInvariant('INV-UNKNOWN', {});
    assert.equal(result.valid, false);
    assert.ok(result.message.includes('Unknown'));
  });
});
