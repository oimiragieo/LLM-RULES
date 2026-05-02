#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { ROUTING_TABLE } = require('../../../.claude/lib/routing/routing-table-core-map.cjs');
const {
  DOMAIN_ROUTING_TABLE,
  UNIQUE_ROUTING_TARGETS,
} = require('../../../.claude/lib/routing/routing-table-hierarchical.cjs');
const {
  classifyDomain,
  getHierarchicalRoutingMode,
} = require('../../../.claude/lib/routing/intent-classifier.cjs');

const MAX_UNIQUE_ROUTING_TARGETS = 27;

describe('hierarchical routing table', () => {
  it('covers every keyword from the flat routing table', () => {
    const flatKeywords = Object.keys(ROUTING_TABLE).sort();
    const hierarchicalKeywords = Object.keys(DOMAIN_ROUTING_TABLE).sort();

    assert.deepStrictEqual(hierarchicalKeywords, flatKeywords);
  });

  it('keeps routing targets within the configured cap', () => {
    assert.ok(
      UNIQUE_ROUTING_TARGETS.length <= MAX_UNIQUE_ROUTING_TARGETS,
      `expected <= ${MAX_UNIQUE_ROUTING_TARGETS} unique targets, got ${UNIQUE_ROUTING_TARGETS.length}`
    );
  });

  it('classifies frontend prompts to a domain router', () => {
    const result = classifyDomain('Build a React component with Tailwind styling.');

    assert.deepStrictEqual(result, {
      type: 'domain',
      domain: 'web-frontend',
      router: 'domain-router-web-frontend',
      source: 'hierarchical_table',
      keyword: 'react',
    });
  });

  it('keeps direct specialist routes for review prompts', () => {
    const result = classifyDomain('Please review this pull request for regressions.');

    assert.strictEqual(result.type, 'direct');
    assert.strictEqual(result.agent, 'code-reviewer');
  });
});

describe('hierarchical routing feature flag mode', () => {
  it('defaults HIERARCHICAL_ROUTING to on when unset', () => {
    const previous = process.env.HIERARCHICAL_ROUTING;
    delete process.env.HIERARCHICAL_ROUTING;

    assert.strictEqual(getHierarchicalRoutingMode(), 'on');

    if (previous === undefined) {
      delete process.env.HIERARCHICAL_ROUTING;
    } else {
      process.env.HIERARCHICAL_ROUTING = previous;
    }
  });

  it('returns on when HIERARCHICAL_ROUTING=on', () => {
    const previous = process.env.HIERARCHICAL_ROUTING;
    process.env.HIERARCHICAL_ROUTING = 'on';

    assert.strictEqual(getHierarchicalRoutingMode(), 'on');

    if (previous === undefined) {
      delete process.env.HIERARCHICAL_ROUTING;
    } else {
      process.env.HIERARCHICAL_ROUTING = previous;
    }
  });
});
