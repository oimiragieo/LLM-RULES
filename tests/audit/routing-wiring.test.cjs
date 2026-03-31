'use strict';

/**
 * routing-wiring.test.cjs
 *
 * Verifies that the flat routing system is correctly wired:
 *
 *   1. All 119 agents in agent-config.json appear in flat routing tables
 *      (routing-table-core-map.cjs or routing-table-intent-agents.cjs).
 *      Note: domain-router-* agents are meta-routing agents used only in
 *      hierarchical mode and are therefore exempt from this requirement.
 *
 *   2. Previously misrouted keywords now map to the correct agents:
 *        wordpress    -> wordpress-master  (not php-pro)
 *        kotlin       -> kotlin-pro        (not android-pro)
 *        spring       -> spring-boot-pro   (not java-pro)
 *        springboot   -> spring-boot-pro   (not java-pro)
 *        sql          -> sql-pro           (not database-architect)
 *        postgres     -> postgres-pro      (not database-architect)
 *        postgresql   -> postgres-pro      (not database-architect)
 *
 *   3. data_science intent in routing-table-intent-agents.cjs routes to
 *      data-scientist (not data-engineer).
 *
 *   4. All model values in agent-config.json are valid (no embedded quotes).
 *
 * VAL-PA-004: Flat routing covers all agents
 * VAL-PA-005: Misrouted keywords fixed
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ─── Project root resolution ──────────────────────────────────────────────────

function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.claude', 'settings.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate project root from: ' + start);
}

const PROJECT_ROOT = findProjectRoot(__dirname);

// ─── Load routing tables ──────────────────────────────────────────────────────

const CORE_MAP_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'routing-table-core-map.cjs'
);
const INTENT_AGENTS_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'routing-table-intent-agents.cjs'
);
const AGENT_CONFIG_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'agent-config.json');
const MODEL_REGISTRY_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'model-registry.cjs'
);

/**
 * Domain-router agents are meta-routing agents used only in hierarchical mode.
 * They dispatch to sub-domain agents and do not require their own flat routing
 * keywords.
 */
const DOMAIN_ROUTER_PREFIX = 'domain-router-';

describe('routing-wiring: flat routing coverage', () => {
  /** @type {string[]} */
  let allAgentIds;
  /** @type {Set<string>} */
  let coreMapTargets;
  /** @type {Set<string>} */
  let intentAgentTargets;
  /** @type {Set<string>} */
  let flatRoutingTargets;
  /** @type {Record<string, string>} */
  let coreMap;
  /** @type {Record<string, string>} */
  let intentMap;
  /** @type {object} */
  let agentConfig;

  before(() => {
    // Load agent-config.json
    const raw = fs.readFileSync(AGENT_CONFIG_PATH, 'utf8');
    agentConfig = JSON.parse(raw);
    allAgentIds = Object.keys(agentConfig.agents);

    // Load routing tables
    const coreMapModule = require(CORE_MAP_PATH);
    coreMap = coreMapModule.ROUTING_TABLE;

    const intentModule = require(INTENT_AGENTS_PATH);
    intentMap = intentModule.INTENT_TO_AGENT;

    // Build the set of all agents reachable via flat routing
    coreMapTargets = new Set(Object.values(coreMap));
    intentAgentTargets = new Set(Object.values(intentMap));
    flatRoutingTargets = new Set([...coreMapTargets, ...intentAgentTargets]);
  });

  it('agent-config.json has exactly 119 agents', () => {
    assert.strictEqual(
      allAgentIds.length,
      119,
      `Expected 119 agents but found ${allAgentIds.length}: ${allAgentIds.join(', ')}`
    );
  });

  it('all non-domain-router agents appear in flat routing tables', () => {
    const nonRouterAgents = allAgentIds.filter(id => !id.startsWith(DOMAIN_ROUTER_PREFIX));
    const missing = nonRouterAgents.filter(id => !flatRoutingTargets.has(id));

    assert.strictEqual(
      missing.length,
      0,
      `The following agents are missing from flat routing tables:\n  ${missing.join('\n  ')}`
    );
  });

  it('all 9 domain-router agents exist in agent-config.json (meta-agents exempt from flat routing)', () => {
    const domainRouters = allAgentIds.filter(id => id.startsWith(DOMAIN_ROUTER_PREFIX));
    assert.strictEqual(
      domainRouters.length,
      9,
      `Expected 9 domain-router agents, found ${domainRouters.length}: ${domainRouters.join(', ')}`
    );
  });

  it('routing-table-core-map.cjs is loadable and exports ROUTING_TABLE', () => {
    assert.ok(coreMap, 'ROUTING_TABLE should be defined');
    assert.ok(typeof coreMap === 'object', 'ROUTING_TABLE should be an object');
    assert.ok(Object.keys(coreMap).length > 0, 'ROUTING_TABLE should have entries');
  });

  it('routing-table-intent-agents.cjs is loadable and exports INTENT_TO_AGENT', () => {
    assert.ok(intentMap, 'INTENT_TO_AGENT should be defined');
    assert.ok(typeof intentMap === 'object', 'INTENT_TO_AGENT should be an object');
    assert.ok(Object.keys(intentMap).length > 0, 'INTENT_TO_AGENT should have entries');
  });
});

describe('routing-wiring: misrouted keywords fixed', () => {
  /** @type {Record<string, string>} */
  let coreMap;
  /** @type {Record<string, string>} */
  let intentMap;

  before(() => {
    const coreMapModule = require(CORE_MAP_PATH);
    coreMap = coreMapModule.ROUTING_TABLE;

    const intentModule = require(INTENT_AGENTS_PATH);
    intentMap = intentModule.INTENT_TO_AGENT;
  });

  it('wordpress routes to wordpress-master (not php-pro)', () => {
    assert.strictEqual(
      coreMap['wordpress'],
      'wordpress-master',
      `wordpress should route to wordpress-master, got: ${coreMap['wordpress']}`
    );
  });

  it('kotlin routes to kotlin-pro (not android-pro)', () => {
    assert.strictEqual(
      coreMap['kotlin'],
      'kotlin-pro',
      `kotlin should route to kotlin-pro, got: ${coreMap['kotlin']}`
    );
  });

  it('spring routes to spring-boot-pro (not java-pro)', () => {
    assert.strictEqual(
      coreMap['spring'],
      'spring-boot-pro',
      `spring should route to spring-boot-pro, got: ${coreMap['spring']}`
    );
  });

  it('springboot routes to spring-boot-pro (not java-pro)', () => {
    assert.strictEqual(
      coreMap['springboot'],
      'spring-boot-pro',
      `springboot should route to spring-boot-pro, got: ${coreMap['springboot']}`
    );
  });

  it('sql routes to sql-pro (not database-architect)', () => {
    assert.strictEqual(
      coreMap['sql'],
      'sql-pro',
      `sql should route to sql-pro, got: ${coreMap['sql']}`
    );
  });

  it('postgres routes to postgres-pro (not database-architect)', () => {
    assert.strictEqual(
      coreMap['postgres'],
      'postgres-pro',
      `postgres should route to postgres-pro, got: ${coreMap['postgres']}`
    );
  });

  it('postgresql routes to postgres-pro (not database-architect)', () => {
    assert.strictEqual(
      coreMap['postgresql'],
      'postgres-pro',
      `postgresql should route to postgres-pro, got: ${coreMap['postgresql']}`
    );
  });

  it('data_science intent routes to data-scientist (not data-engineer)', () => {
    assert.strictEqual(
      intentMap['data_science'],
      'data-scientist',
      `data_science intent should route to data-scientist, got: ${intentMap['data_science']}`
    );
  });
});

describe('routing-wiring: newly wired agents have keywords', () => {
  /** @type {Set<string>} */
  let flatRoutingTargets;

  before(() => {
    const { ROUTING_TABLE: coreMap } = require(CORE_MAP_PATH);
    const { INTENT_TO_AGENT: intentMap } = require(INTENT_AGENTS_PATH);
    flatRoutingTargets = new Set([...Object.values(coreMap), ...Object.values(intentMap)]);
  });

  const newlyWiredAgents = [
    'channel-responder',
    'angular-pro',
    'app-generator-agent',
    'azure-infra-pro',
    'business-analyst',
    'context-manager',
    'data-scientist',
    'django-developer',
    'dotnet-pro',
    'forum-monitor-agent',
    'iot-engineer',
    'kotlin-pro',
    'legacy-modernizer',
    'legal-advisor',
    'm365-admin',
    'ml-researcher',
    'mlops-engineer',
    'model-benchmarker-agent',
    'nlp-engineer',
    'post-analyzer-agent',
    'postgres-pro',
    'product-manager',
    'quant-analyst',
    'rails-pro',
    'spring-boot-pro',
    'sql-pro',
    'swift-pro',
    'terraform-engineer',
    'terragrunt-pro',
    'voice-replicator-agent',
    'windows-infra-pro',
    'wordpress-master',
  ];

  for (const agentId of newlyWiredAgents) {
    it(`${agentId} is reachable via flat routing`, () => {
      assert.ok(
        flatRoutingTargets.has(agentId),
        `Agent "${agentId}" is not reachable via any flat routing keyword`
      );
    });
  }
});

describe('routing-wiring: agent-config model values are valid', () => {
  /** @type {object} */
  let agentConfig;
  /** @type {Set<string>} */
  let validModelIds;

  before(() => {
    const raw = fs.readFileSync(AGENT_CONFIG_PATH, 'utf8');
    agentConfig = JSON.parse(raw);

    // Load known valid model IDs and shorthands from model registry
    const { ModelRegistry } = require(MODEL_REGISTRY_PATH);
    const registry = new ModelRegistry();
    validModelIds = new Set();
    for (const model of registry.listModels()) {
      validModelIds.add(model.id);
      validModelIds.add(model.shorthand);
    }
  });

  it('claude-md-auditor has a valid model identifier (no embedded quotes)', () => {
    const auditorConfig = agentConfig.agents['claude-md-auditor'];
    assert.ok(auditorConfig, 'claude-md-auditor must exist in agent-config.json');
    const modelValue = auditorConfig.model;
    assert.ok(typeof modelValue === 'string', `model must be a string, got: ${typeof modelValue}`);
    assert.ok(
      !modelValue.includes("'"),
      `model value must not contain embedded single quotes, got: "${modelValue}"`
    );
  });

  it('claude-md-auditor model is a recognized model identifier', () => {
    const auditorConfig = agentConfig.agents['claude-md-auditor'];
    const modelValue = auditorConfig.model;
    assert.ok(
      validModelIds.has(modelValue),
      `model value "${modelValue}" is not a recognized model ID or shorthand.\n` +
        `Valid values: ${[...validModelIds].join(', ')}`
    );
  });

  it('no agent has a model value with embedded quotes', () => {
    const invalid = [];
    for (const [agentId, config] of Object.entries(agentConfig.agents)) {
      if (config.model && typeof config.model === 'string' && config.model.includes("'")) {
        invalid.push(`${agentId}: "${config.model}"`);
      }
    }
    assert.strictEqual(
      invalid.length,
      0,
      `The following agents have invalid model values with embedded quotes:\n  ${invalid.join('\n  ')}`
    );
  });

  it('all agent model values are non-empty strings', () => {
    const invalid = [];
    for (const [agentId, config] of Object.entries(agentConfig.agents)) {
      if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
        invalid.push(agentId);
      }
    }
    assert.strictEqual(
      invalid.length,
      0,
      `The following agents have empty or missing model values:\n  ${invalid.join('\n  ')}`
    );
  });
});
