#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseFrontmatter,
  validateAgentFile,
} = require('../../../.claude/lib/agents/agent-template-contract.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ORCHESTRATORS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents', 'orchestrators');

const ROUTERS = [
  {
    file: 'domain-router-web-frontend.md',
    name: 'domain-router-web-frontend',
    defaultAgent: 'frontend-pro',
    agents: ['frontend-pro', 'nextjs-pro', 'angular-pro', 'sveltekit-expert', 'wordpress-master'],
  },
  {
    file: 'domain-router-backend.md',
    name: 'domain-router-backend',
    defaultAgent: 'typescript-pro',
    agents: [
      'python-pro',
      'typescript-pro',
      'golang-pro',
      'rust-pro',
      'java-pro',
      'kotlin-pro',
      'php-pro',
      'dotnet-pro',
      'swift-pro',
      'nodejs-pro',
      'rails-pro',
      'spring-boot-pro',
      'django-developer',
      'fastapi-pro',
    ],
    disambiguationChecks: [
      /FastAPI.*`fastapi-pro`/i,
      /Django.*`django-developer`/i,
      /Spring.*`spring-boot-pro`/i,
      /(TypeScript.*Node|Node.*TypeScript).*`nodejs-pro`/i,
    ],
  },
  {
    file: 'domain-router-mobile.md',
    name: 'domain-router-mobile',
    defaultAgent: 'expo-mobile-developer',
    agents: [
      'ios-pro',
      'android-pro',
      'expo-mobile-developer',
      'tauri-desktop-developer',
      'mobile-ux-reviewer',
    ],
  },
  {
    file: 'domain-router-ai-ml.md',
    name: 'domain-router-ai-ml',
    defaultAgent: 'ai-ml-specialist',
    agents: [
      'ai-ml-specialist',
      'llm-architect',
      'data-engineer',
      'data-scientist',
      'ml-researcher',
      'mlops-engineer',
      'nlp-engineer',
      'prompt-engineer',
      'mcp-developer',
      'multi-llm-consultant',
      'model-benchmarker-agent',
    ],
    disambiguationChecks: [
      /(LLM.*architecture|architecture.*LLM|pipeline).*`llm-architect`/i,
      /(LLM.*prompt|prompt.*LLM|optimize).*`prompt-engineer`/i,
      /(Data.*pipeline|ETL).*`data-engineer`/i,
      /(Data.*analysis|statistics).*`data-scientist`/i,
    ],
  },
  {
    file: 'domain-router-infra.md',
    name: 'domain-router-infra',
    defaultAgent: 'devops',
    agents: [
      'devops',
      'devops-troubleshooter',
      'kubernetes-specialist',
      'terraform-engineer',
      'terragrunt-pro',
      'azure-infra-pro',
      'windows-infra-pro',
      'sre-engineer',
      'incident-responder',
      'm365-admin',
    ],
  },
  {
    file: 'domain-router-security.md',
    name: 'domain-router-security',
    defaultAgent: 'security-architect',
    agents: [
      'security-architect',
      'penetration-tester',
      'chaos-engineer',
      'reverse-engineer',
      'advanced-debugging',
      'performance-engineer',
      'accessibility-tester',
      'compliance-checker',
    ],
  },
  {
    file: 'domain-router-arch-data.md',
    name: 'domain-router-arch-data',
    defaultAgent: 'api-designer',
    agents: [
      'api-designer',
      'graphql-pro',
      'microservices-architect',
      'database-architect',
      'sql-pro',
      'postgres-pro',
      'c4-context',
      'c4-container',
      'c4-component',
      'c4-code',
      'iot-engineer',
    ],
  },
  {
    file: 'domain-router-product.md',
    name: 'domain-router-product',
    defaultAgent: 'pm-coordinator',
    agents: [
      'pm',
      'pm-coordinator',
      'product-manager',
      'business-analyst',
      'technical-program-manager',
      'marketing-strategist',
      'ux-researcher',
      'brand-guardian',
      'feedback-synthesizer',
      'legal-advisor',
      'quant-analyst',
      'aso-specialist',
      'voice-replicator-agent',
      'forum-monitor-agent',
      'post-analyzer-agent',
    ],
  },
  {
    file: 'domain-router-niche.md',
    name: 'domain-router-niche',
    defaultAgent: 'scientific-research-expert',
    agents: [
      'web3-blockchain-expert',
      'gamedev-pro',
      'medical-research-triage',
      'scientific-research-expert',
      'legacy-modernizer',
      'app-generator-agent',
      'context-manager',
    ],
  },
];

function readRouter(router) {
  const filePath = path.join(ORCHESTRATORS_DIR, router.file);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    filePath,
    content,
    frontmatter: parseFrontmatter(content),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(content, heading) {
  const escapedHeading = escapeRegExp(heading);
  const match = content.match(new RegExp(`${escapedHeading}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match ? match[1].trim() : '';
}

describe('sub-router agent definitions', () => {
  it('creates exactly 9 domain-router agent files', () => {
    const files = fs
      .readdirSync(ORCHESTRATORS_DIR)
      .filter(name => /^domain-router-.*\.md$/.test(name))
      .sort();

    assert.deepStrictEqual(files, ROUTERS.map(router => router.file).sort());
  });

  for (const router of ROUTERS) {
    it(`${router.name} exists and is non-empty`, () => {
      const filePath = path.join(ORCHESTRATORS_DIR, router.file);
      assert.equal(fs.existsSync(filePath), true, `Missing ${router.file}`);
      assert.ok(fs.readFileSync(filePath, 'utf8').trim().length > 0, `${router.file} is empty`);
    });

    it(`${router.name} has valid YAML frontmatter and Task-enabled tools`, () => {
      const { filePath, frontmatter } = readRouter(router);
      const validation = validateAgentFile(filePath);

      assert.equal(validation.valid, true, validation.errors.join('\n'));
      assert.ok(frontmatter, 'frontmatter should parse');
      assert.equal(frontmatter.name, router.name);
      assert.equal(frontmatter.version, '1.0.0');
      assert.ok(typeof frontmatter.description === 'string' && frontmatter.description.length > 0);
      assert.equal(frontmatter.model, 'haiku');
      assert.ok(Array.isArray(frontmatter.tools), 'tools should be an array');
      assert.ok(frontmatter.tools.includes('Task'), 'Task tool must be present');
      assert.ok(Array.isArray(frontmatter.skills), 'skills should be an array');
      assert.ok(
        frontmatter.skills.includes('task-management-protocol'),
        'task-management-protocol skill must be present'
      );
    });

    it(`${router.name} includes its full domain roster`, () => {
      const { content } = readRouter(router);

      for (const agent of router.agents) {
        assert.match(
          content,
          new RegExp(`\\\`${escapeRegExp(agent)}\\\``),
          `Expected ${router.file} to reference ${agent}`
        );
      }

      const rosterMentions = router.agents.filter(agent =>
        new RegExp(`\\\`${escapeRegExp(agent)}\\\``).test(content)
      );
      assert.equal(rosterMentions.length, router.agents.length);
    });

    it(`${router.name} declares a default gateway and disambiguation rules`, () => {
      const { content } = readRouter(router);
      const defaultSection = extractSection(content, '## Default Gateway Agent');
      const disambiguationSection = extractSection(content, '## Disambiguation Rules');
      const bulletCount = (disambiguationSection.match(/^\s*-\s+/gm) || []).length;

      assert.match(defaultSection, new RegExp(`\\\`${escapeRegExp(router.defaultAgent)}\\\``));
      assert.ok(disambiguationSection.length > 0, 'disambiguation section should not be empty');
      assert.ok(bulletCount >= 3, 'disambiguation section should include at least 3 rules');

      for (const check of router.disambiguationChecks || []) {
        assert.match(disambiguationSection, check);
      }
    });
  }
});
