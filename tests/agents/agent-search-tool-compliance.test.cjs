'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const MATRIX_PATH = path.join(ROOT, '.claude/config/agent-skill-matrix.json');
const MATRIX_PATH_ALT = path.join(ROOT, '.claude/context/config/agent-skill-matrix.json');
const REGISTRY_PATH = path.join(ROOT, '.claude/context/agent-registry.json');

const ALL_SEARCH = [
  'ripgrep',
  'code-semantic-search',
  'code-structural-search',
  'token-saver-context-compression',
];
const RG_TS = ['ripgrep', 'token-saver-context-compression'];
const SEMANTIC_STRUCTURAL = ['code-semantic-search', 'code-structural-search'];

// Phase 1: Core + high-impact (all 4 search skills)
const PHASE1 = [
  'developer',
  'qa',
  'architect',
  'planner',
  'context-compressor',
  'technical-writer',
  'code-reviewer',
  'code-simplifier',
  'devops',
  'devops-troubleshooter',
  'security-architect',
  'database-architect',
  'incident-responder',
];

// Phase 2: Domain code-focused (all 4 search skills)
const P2_DOMAIN_CODE = [
  'python-pro',
  'rust-pro',
  'golang-pro',
  'typescript-pro',
  'fastapi-pro',
  'frontend-pro',
  'nodejs-pro',
  'java-pro',
  'nextjs-pro',
  'php-pro',
  'sveltekit-expert',
  'tauri-desktop-developer',
  'expo-mobile-developer',
  'data-engineer',
  'graphql-pro',
  'ios-pro',
  'android-pro',
  'mcp-developer',
  'gamedev-pro',
  'web3-blockchain-expert',
  'api-designer',
  'ai-ml-specialist',
];

// Phase 2: Domain non-code (ripgrep + token-saver only)
const P2_DOMAIN_NONCODE = [
  'mobile-ux-reviewer',
  'scientific-research-expert',
  'multi-llm-consultant',
  'medical-research-triage',
  'pm-coordinator',
  'kubernetes-specialist',
  'llm-architect',
  'microservices-architect',
  'prompt-engineer',
];

// Phase 2: Specialized code-focused (all 4 search skills)
const P2_SPEC_CODE = [
  'advanced-debugging',
  'penetration-tester',
  'performance-engineer',
  'sre-engineer',
  'chaos-engineer',
  'accessibility-tester',
  'conductor-validator',
  'reverse-engineer',
];

// Phase 2: Specialized non-code (ripgrep + token-saver only)
const P2_SPEC_NONCODE = ['c4-context', 'c4-container', 'c4-component', 'c4-code', 'researcher'];

// Phase 3: Orchestrators (ripgrep only)
const P3_ORCH = [
  'master-orchestrator',
  'swarm-coordinator',
  'evolution-orchestrator',
  'party-orchestrator',
  'artifact-integrator',
];

// Load matrix (try canonical path first, fallback to alt)
const matrixPath = fs.existsSync(MATRIX_PATH) ? MATRIX_PATH : MATRIX_PATH_ALT;
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

function getAlways(agentName) {
  for (const cat of Object.values(matrix.agents)) {
    if (cat[agentName]) return cat[agentName].always || [];
  }
  return [];
}

function getRegistrySkills(agentName) {
  const entry = (registry.agents || {})[agentName];
  if (!entry) return new Set();
  const cap0 = (entry.capabilities || [])[0] || {};
  return new Set([
    ...(entry.skills || []),
    ...(entry.alwaysSkills || []),
    ...(entry.primarySkills || []),
    ...(entry.secondarySkills || []),
    ...(cap0.skills || []),
  ]);
}

function testHasSkills(agents, required, label) {
  describe(`${label} - has required skills`, () => {
    for (const name of agents) {
      const always = getAlways(name);
      for (const skill of required) {
        it(`${name} has ${skill}`, () => {
          assert.ok(
            always.includes(skill),
            `Missing '${skill}' in always. Found: [${always.join(', ')}]`
          );
        });
      }
    }
  });
}

function testExcludesSkills(agents, excluded, label) {
  describe(`${label} - excludes non-applicable skills`, () => {
    for (const name of agents) {
      const always = getAlways(name);
      for (const skill of excluded) {
        it(`${name} does NOT have ${skill}`, () => {
          assert.ok(!always.includes(skill), `Should not have '${skill}' in always`);
        });
      }
    }
  });
}

function testRegistrySkills(agents, required, label) {
  describe(`${label} - registry propagation`, () => {
    for (const name of agents) {
      const skills = getRegistrySkills(name);
      for (const skill of required) {
        it(`${name} has ${skill} in registry`, () => {
          assert.ok(skills.has(skill), `Missing '${skill}' in registry`);
        });
      }
    }
  });
}

describe('Phase 1 Agent Search Compliance', () => {
  testHasSkills(PHASE1, ALL_SEARCH, 'Phase 1');
  testRegistrySkills(PHASE1, ALL_SEARCH, 'Phase 1');
});

describe('Phase 2 Domain Code-Focused', () => {
  testHasSkills(P2_DOMAIN_CODE, ALL_SEARCH, 'Domain code');
  testRegistrySkills(P2_DOMAIN_CODE, ALL_SEARCH, 'Domain code');
});

describe('Phase 2 Domain Non-Code', () => {
  testHasSkills(P2_DOMAIN_NONCODE, RG_TS, 'Domain non-code');
  testExcludesSkills(P2_DOMAIN_NONCODE, SEMANTIC_STRUCTURAL, 'Domain non-code');
});

describe('Phase 2 Specialized Code-Focused', () => {
  testHasSkills(P2_SPEC_CODE, ALL_SEARCH, 'Specialized code');
  testRegistrySkills(P2_SPEC_CODE, ALL_SEARCH, 'Specialized code');
});

describe('Phase 2 Specialized Non-Code', () => {
  testHasSkills(P2_SPEC_NONCODE, RG_TS, 'Specialized non-code');
  testExcludesSkills(P2_SPEC_NONCODE, SEMANTIC_STRUCTURAL, 'Specialized non-code');
});

describe('Phase 3 Orchestrators', () => {
  testHasSkills(P3_ORCH, RG_TS, 'Orchestrators');
  testExcludesSkills(
    P3_ORCH,
    ['code-semantic-search', 'code-structural-search'],
    'Orchestrators'
  );
});

describe('Registry propagation Phase 2/3', () => {
  testRegistrySkills(P2_DOMAIN_NONCODE, RG_TS, 'Domain non-code');
  testRegistrySkills(P2_SPEC_NONCODE, RG_TS, 'Specialized non-code');
  testRegistrySkills(P3_ORCH, RG_TS, 'Orchestrators');
});
