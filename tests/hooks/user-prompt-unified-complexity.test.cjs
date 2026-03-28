#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { detectPlanningRequirement } = require(
  path.join(process.cwd(), '.claude', 'hooks', 'routing', 'user-prompt-unified.core.cjs')
);

describe('detectPlanningRequirement multi-signal analysis', () => {
  it('keeps typo fixes in auth modules low complexity', () => {
    const result = detectPlanningRequirement('fix typo in auth module');

    assert.ok(['trivial', 'low'].includes(result.complexity));
    assert.equal(result.requiresArchitectReview, false);
    assert.equal(result.requiresSecurityReview, false);
  });

  it('does not escalate README rewrites to epic', () => {
    const result = detectPlanningRequirement('rewrite the README');

    assert.notEqual(result.complexity, 'epic');
    assert.equal(result.requiresArchitectReview, false);
  });

  it('treats OAuth2/JWT/RBAC implementation as high complexity', () => {
    const result = detectPlanningRequirement('implement OAuth2 with JWT and RBAC');

    assert.ok(['high', 'epic'].includes(result.complexity));
    assert.equal(result.requiresArchitectReview, true);
    assert.equal(result.requiresSecurityReview, true);
    assert.equal(result.stateUpdates.requiresPlannerFirst, true);
  });
});
