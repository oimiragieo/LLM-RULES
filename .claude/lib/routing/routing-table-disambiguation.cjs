'use strict';

const DISAMBIGUATION_RULES = {
  // "llm" could be llm-architect (architecture) or ai-ml-specialist (training)
  llm: [
    {
      condition: ['architecture', 'pipeline', 'rag', 'serving', 'design', 'system'],
      prefer: 'llm-architect',
      deprioritize: 'ai-ml-specialist',
    },
    {
      condition: ['training', 'fine-tune', 'dataset', 'pytorch', 'tensorflow'],
      prefer: 'ai-ml-specialist',
      deprioritize: 'llm-architect',
    },
  ],
  // "design" could be architect (system design) or planner (design plan)
  design: [
    {
      condition: ['system', 'architecture', 'scalab', 'pattern', 'microservice'],
      prefer: 'architect',
      deprioritize: 'planner',
    },
    {
      condition: ['plan', 'breakdown', 'phases', 'milestone', 'scope'],
      prefer: 'planner',
      deprioritize: 'architect',
    },
    {
      condition: ['ui', 'ux', 'component', 'visual', 'interface'],
      prefer: 'frontend-pro',
      deprioritize: 'architect',
    },
  ],
  // "test" could be qa (testing) or developer (TDD)
  test: [
    {
      condition: ['tdd', 'test-driven', 'red-green', 'failing test'],
      prefer: 'developer',
      deprioritize: 'qa',
    },
    {
      condition: ['regression', 'coverage', 'e2e', 'test suite', 'test plan'],
      prefer: 'qa',
      deprioritize: 'developer',
    },
  ],
  // "refactor" could be developer (code) or architect (architecture)
  refactor: [
    {
      condition: ['architecture', 'restructure', 'pattern', 'microservice', 'monolith'],
      prefer: 'architect',
      deprioritize: 'developer',
    },
    {
      condition: ['code', 'function', 'class', 'method', 'clean'],
      prefer: 'developer',
      deprioritize: 'architect',
    },
  ],
  // "api" could be many different frameworks
  api: [
    {
      condition: ['fastapi', 'pydantic', 'python', 'starlette'],
      prefer: 'fastapi-pro',
      deprioritize: 'nodejs-pro',
    },
    {
      condition: ['graphql', 'apollo', 'resolver', 'mutation'],
      prefer: 'graphql-pro',
      deprioritize: 'fastapi-pro',
    },
    {
      condition: ['node', 'express', 'nestjs', 'typescript'],
      prefer: 'nodejs-pro',
      deprioritize: 'fastapi-pro',
    },
    {
      condition: ['rest', 'openapi', 'swagger'],
      prefer: 'fastapi-pro',
      deprioritize: 'graphql-pro',
    },
  ],
  // "migration" could be database, data engineering, or devops
  migration: [
    {
      condition: ['database', 'schema', 'sql', 'table', 'column', 'index'],
      prefer: 'database-architect',
      deprioritize: 'data-engineer',
    },
    {
      condition: ['data', 'etl', 'pipeline', 'warehouse', 'dbt'],
      prefer: 'data-engineer',
      deprioritize: 'database-architect',
    },
    {
      condition: ['kubernetes', 'cloud', 'infrastructure', 'terraform'],
      prefer: 'devops',
      deprioritize: 'database-architect',
    },
  ],
  // "mobile" could be expo, ios, android-pro, or mobile-ux-reviewer
  mobile: [
    {
      condition: ['expo', 'react native', 'cross-platform'],
      prefer: 'expo-mobile-developer',
      deprioritize: 'ios-pro',
    },
    {
      condition: ['ios', 'swift', 'swiftui', 'xcode', 'apple'],
      prefer: 'ios-pro',
      deprioritize: 'expo-mobile-developer',
    },
    {
      condition: ['android', 'kotlin', 'jetpack', 'compose', 'gradle'],
      prefer: 'android-pro',
      deprioritize: 'expo-mobile-developer',
    },
    {
      condition: ['ux', 'review', 'usability', 'heuristic', 'accessibility'],
      prefer: 'mobile-ux-reviewer',
      deprioritize: 'expo-mobile-developer',
    },
  ],
  // "component" could be frontend or c4-component
  component: [
    {
      condition: ['c4', 'diagram', 'architecture'],
      prefer: 'c4-component',
      deprioritize: 'frontend-pro',
    },
    {
      condition: ['react', 'vue', 'svelte', 'ui', 'tailwind'],
      prefer: 'frontend-pro',
      deprioritize: 'c4-component',
    },
  ],
  // "debug" could be developer or devops-troubleshooter
  debug: [
    {
      condition: ['code', 'function', 'test', 'bug', 'exception'],
      prefer: 'developer',
      deprioritize: 'devops-troubleshooter',
    },
    {
      condition: ['production', 'logs', 'kubernetes', 'pod', 'container', 'system'],
      prefer: 'devops-troubleshooter',
      deprioritize: 'developer',
    },
  ],
  // "review" could be code-reviewer or mobile-ux-reviewer
  review: [
    {
      condition: ['pr', 'pull request', 'code', 'merge', 'implementation'],
      prefer: 'code-reviewer',
      deprioritize: 'mobile-ux-reviewer',
    },
    {
      condition: ['ux', 'ui', 'mobile', 'usability', 'design'],
      prefer: 'mobile-ux-reviewer',
      deprioritize: 'code-reviewer',
    },
    {
      condition: ['security', 'threat', 'vulnerability', 'compliance'],
      prefer: 'security-architect',
      deprioritize: 'code-reviewer',
    },
  ],
  // "database" could be database-architect or data-engineer
  database: [
    {
      condition: ['schema', 'table', 'index', 'query optimization', 'normalize'],
      prefer: 'database-architect',
      deprioritize: 'data-engineer',
    },
    {
      condition: ['etl', 'pipeline', 'warehouse', 'bigquery', 'snowflake'],
      prefer: 'data-engineer',
      deprioritize: 'database-architect',
    },
  ],
  // "performance" could be performance-engineer (optimization/profiling/load-test) or developer (general development)
  performance: [
    {
      condition: ['optimization', 'profiling', 'load-test', 'benchmark', 'bottleneck', 'latency'],
      prefer: 'performance-engineer',
      deprioritize: 'developer',
    },
    {
      condition: ['code', 'implement', 'feature', 'bug'],
      prefer: 'developer',
      deprioritize: 'performance-engineer',
    },
  ],
  // "accessibility" could be accessibility-tester (testing/audit/wcag) or frontend-pro (frontend implementation)
  accessibility: [
    {
      condition: ['testing', 'audit', 'wcag', 'screen-reader', 'compliance'],
      prefer: 'accessibility-tester',
      deprioritize: 'frontend-pro',
    },
    {
      condition: ['implement', 'frontend', 'component', 'ui', 'react'],
      prefer: 'frontend-pro',
      deprioritize: 'accessibility-tester',
    },
  ],
  // "researcher" could be researcher (general) or artifact-integrator (onboarding)
  researcher: [
    {
      condition: [
        'github',
        'repo',
        'repository',
        'integrate',
        'onboard',
        'ingest',
        'github.com',
        'https://',
      ],
      prefer: 'artifact-integrator',
      deprioritize: 'researcher',
    },
    {
      condition: ['fact-check', 'best practice', 'technology comparison', 'arxiv'],
      prefer: 'researcher',
      deprioritize: 'artifact-integrator',
    },
  ],
  // "swarm" can map to party mode orchestration when explicitly requested.
  swarm_coordinator: [
    {
      condition: ['party mode', 'consensus voting', 'agent debate'],
      prefer: 'party-orchestrator',
      deprioritize: 'swarm-coordinator',
    },
  ],
};

module.exports = { DISAMBIGUATION_RULES };
