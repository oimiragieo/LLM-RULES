#!/usr/bin/env node
/**
 * Router Enforcer Hook
 *
 * Runs on UserPromptSubmit to:
 * 1. Parse hook input from Claude Code
 * 2. Analyze user prompt for routing recommendations
 * 3. Suggest appropriate agents based on intent
 *
 * Exit codes:
 * - 0: Allow (with optional suggestions printed)
 * - Non-zero: Block (not used currently, enforcement is advisory)
 */

const fs = require('fs');
const path = require('path');
const routerState = require('./router-state.cjs');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { parseHookInputSync } = require('../../lib/utils/hook-input.cjs');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

// BUG-NEW-006 FIX: Add module-level cache with TTL to prevent race conditions
let agentCache = null;
let agentCacheTime = 0;
const AGENT_CACHE_TTL = 300000; // 5 minutes

/**
 * Routing Table - Mirrors CLAUDE.md Section 3 Agent Routing Table
 * This provides intent-to-agent mapping for deterministic routing.
 * Keep in sync with CLAUDE.md routing table!
 */
const ROUTING_TABLE = {
  // Core request types to agent mapping
  bug: 'developer',
  coding: 'developer',
  feature: 'developer',
  test: 'qa',
  testing: 'qa',
  qa: 'qa',
  documentation: 'technical-writer',
  docs: 'technical-writer',
  security: 'security-architect',
  architecture: 'architect',
  design: 'architect',
  plan: 'planner',
  planning: 'planner',
  devops: 'devops',
  infrastructure: 'devops',
  incident: 'incident-responder',
  outage: 'incident-responder',
  debugging: 'devops-troubleshooter',
  troubleshoot: 'devops-troubleshooter',
  review: 'code-reviewer',
  pr: 'code-reviewer',
  simplify: 'code-simplifier',
  refactor: 'code-simplifier',
  cleanup: 'code-simplifier',
  clean: 'code-simplifier',
  clarity: 'code-simplifier',
  // Domain specialists
  python: 'python-pro',
  rust: 'rust-pro',
  go: 'golang-pro',
  golang: 'golang-pro',
  typescript: 'typescript-pro',
  fastapi: 'fastapi-pro',
  // C4 architecture
  c4: 'c4-context',
  context_diagram: 'c4-context',
  container_diagram: 'c4-container',
  component_diagram: 'c4-component',
  code_diagram: 'c4-code',
  // Web3/Blockchain
  web3: 'web3-blockchain-expert',
  blockchain: 'web3-blockchain-expert',
  solidity: 'web3-blockchain-expert',
  smartcontract: 'web3-blockchain-expert',
  defi: 'web3-blockchain-expert',
  ethereum: 'web3-blockchain-expert',
  nft: 'web3-blockchain-expert',
  // Frontend/Web
  frontend: 'frontend-pro',
  react: 'frontend-pro',
  vue: 'frontend-pro',
  css: 'frontend-pro',
  html: 'frontend-pro',
  ui: 'frontend-pro',
  web: 'frontend-pro',
  // Node.js Backend
  nodejs: 'nodejs-pro',
  node: 'nodejs-pro',
  express: 'nodejs-pro',
  nestjs: 'nodejs-pro',
  // Java
  java: 'java-pro',
  spring: 'java-pro',
  springboot: 'java-pro',
  maven: 'java-pro',
  gradle: 'java-pro',
  // PHP
  php: 'php-pro',
  laravel: 'php-pro',
  symfony: 'php-pro',
  wordpress: 'php-pro',
  // iOS
  ios: 'ios-pro',
  swift: 'ios-pro',
  xcode: 'ios-pro',
  apple: 'ios-pro',
  // Android
  android: 'android-pro',
  kotlin: 'android-pro',
  // Next.js
  nextjs: 'nextjs-pro',
  next: 'nextjs-pro',
  vercel: 'nextjs-pro',
  appserver: 'nextjs-pro',
  // SvelteKit
  svelte: 'sveltekit-expert',
  sveltekit: 'sveltekit-expert',
  // Tauri
  tauri: 'tauri-desktop-developer',
  desktop: 'tauri-desktop-developer',
  // Expo/React Native
  expo: 'expo-mobile-developer',
  reactnative: 'expo-mobile-developer',
  mobile: 'expo-mobile-developer',
  // Data Engineering
  data: 'data-engineer',
  etl: 'data-engineer',
  pipeline: 'data-engineer',
  dataengineering: 'data-engineer',
  // Database
  database: 'database-architect',
  schema: 'database-architect',
  sql: 'database-architect',
  postgres: 'database-architect',
  postgresql: 'database-architect',
  mysql: 'database-architect',
  // GraphQL
  graphql: 'graphql-pro',
  apollo: 'graphql-pro',
  federation: 'graphql-pro',
  // Mobile UX
  mobileui: 'mobile-ux-reviewer',
  appux: 'mobile-ux-reviewer',
  mobiledesign: 'mobile-ux-reviewer',
  // Scientific
  scientific: 'scientific-research-expert',
  academic: 'scientific-research-expert',
  // Research & fact-finding
  investigate: 'researcher',
  factcheck: 'researcher',
  lookup: 'researcher',
  // AI/ML
  ai: 'ai-ml-specialist',
  ml: 'ai-ml-specialist',
  machinelearning: 'ai-ml-specialist',
  deeplearning: 'ai-ml-specialist',
  neural: 'ai-ml-specialist',
  // Game Development
  game: 'gamedev-pro',
  gamedev: 'gamedev-pro',
  unity: 'gamedev-pro',
  unreal: 'gamedev-pro',
  godot: 'gamedev-pro',
  // Orchestration
  orchestrate: 'master-orchestrator',
  coordinate: 'master-orchestrator',
  multiagent: 'master-orchestrator',
  // Swarm
  swarm: 'swarm-coordinator',
  parallel: 'swarm-coordinator',
  coordination: 'swarm-coordinator',
  // Evolution
  evolve: 'evolution-orchestrator',
  evolution: 'evolution-orchestrator',
  selfimprove: 'evolution-orchestrator',
  // Context Compression
  compress: 'context-compressor',
  context: 'context-compressor',
  summarize: 'context-compressor',
  token: 'context-compressor',
  // Context-Driven
  conductor: 'conductor-validator',
  cdd: 'conductor-validator',
  // Reverse Engineering
  reverseengineer: 'reverse-engineer',
  decompile: 'reverse-engineer',
  binary: 'reverse-engineer',
  // Incident Response
  oncall: 'incident-responder',
  pagerduty: 'incident-responder',
};

/**
 * Get preferred agent for a detected intent
 * Returns agent name from ROUTING_TABLE or null if no match
 */
function _getPreferredAgent(intent) {
  return ROUTING_TABLE[intent] || null;
}

// parseHookInput removed - now using parseHookInputSync from shared hook-input.cjs
// PERF-006/PERF-007: Eliminated ~10 lines of duplicated parsing code

/**
 * Load agent metadata from frontmatter
 * BUG-NEW-006 FIX: Uses TTL-based caching to prevent race conditions
 */
function loadAgents() {
  // Check cache first
  const now = Date.now();
  if (agentCache && now - agentCacheTime < AGENT_CACHE_TTL) {
    return agentCache;
  }

  const agents = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const frontmatter = parseFrontmatter(content);
          if (frontmatter && frontmatter.name) {
            agents.push({
              name: frontmatter.name,
              description: frontmatter.description || '',
              skills: frontmatter.skills || [],
              priority: frontmatter.priority || 'medium',
              path: path.relative(PROJECT_ROOT, fullPath),
            });
          }
        } catch (_e) {
          // Skip invalid files
        }
      }
    }
  }

  scanDir(AGENTS_DIR);

  // Update cache
  agentCache = agents;
  agentCacheTime = now;

  return agents;
}

/**
 * Parse YAML frontmatter
 * BUG-NEW-007 FIX: Add size limit to prevent regex DoS
 */
function parseFrontmatter(content) {
  // BUG-NEW-007 FIX: Size limit to prevent regex DoS on large files
  if (!content || content.length > 50000) return null;

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};

  const lines = yaml.split('\n');
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    if (line.match(/^[a-z_]+:/i)) {
      const colonIndex = line.indexOf(':');
      currentKey = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else if (value.startsWith('[')) {
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim());
        inArray = false;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    } else if (inArray && line.match(/^\s+-\s/)) {
      result[currentKey].push(line.replace(/^\s+-\s/, '').trim());
    }
  }

  return result;
}

/**
 * Detect if multi-agent planning is needed
 * Also classifies complexity and saves it to router-state
 *
 * Complexity Levels:
 *   - trivial: Greetings, simple questions, meta commands
 *   - low: Single-file fixes, typos, minor changes
 *   - medium: Multi-file changes, new components, features
 *   - high: Architecture, security, multi-agent tasks
 *   - epic: Major refactors, new systems, cross-cutting concerns
 */
function detectPlanningRequirement(prompt) {
  const promptLower = prompt.toLowerCase();

  // Keywords for trivial requests (greetings, questions)
  const trivialKeywords = [
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'what is',
    'what are',
    'can you explain',
    'help me understand',
    'what does',
    'where is',
    'when did',
    'who is',
    'why does',
    'thanks',
    'thank you',
    'bye',
    'goodbye',
  ];

  // Keywords for low complexity (single-file, minor changes)
  const lowKeywords = [
    'typo',
    'fix typo',
    'rename',
    'update text',
    'change text',
    'fix bug',
    'small fix',
    'minor fix',
    'quick fix',
    'update config',
    'change config',
    'modify config',
  ];

  // Keywords that indicate multi-agent planning is needed
  const complexPlanningKeywords = [
    'review',
    'integrate',
    'integration',
    'migrate',
    'migration',
    'new feature',
    'implement',
    'add',
    'create',
    'codebase',
    'external',
    'third-party',
    'api',
    'auth',
    'authentication',
    'authorization',
    'security',
    'database',
    'schema',
    'migration',
    'architecture',
    'refactor',
    'redesign',
    'plan',
    'proposal',
    'rfc',
    'design',
    'investigate',
    'analyze',
    'debug',
    'troubleshoot',
    'enforcement',
    'hook',
    'guard',
    'protocol',
    'violation',
    'diagnose',
    'root cause',
    'why.*not working',
    'broken',
    // Workflow-related keywords that indicate multi-step coordination
    'workflow',
    'orchestrat',
    'multi-step',
    'multi-file',
    'across',
    'coordinate',
    'sequence',
    'phase',
    'end-to-end',
    'e2e',
    'full-stack',
    'cross-cutting',
    'systematic',
    'comprehensive',
    'overhaul',
    'restructure',
    'planning',
    'design doc',
    'specification',
    'requirements',
  ];

  // Keywords that indicate security review is mandatory
  const securityMandatoryKeywords = [
    'auth',
    'authentication',
    'authorization',
    'login',
    'password',
    'token',
    'jwt',
    'oauth',
    'security',
    'permission',
    'role',
    'encrypt',
    'credential',
    'secret',
    'api key',
    'payment',
    'financial',
  ];

  // Keywords that indicate architect review is needed
  const architectKeywords = [
    'integrate',
    'integration',
    'api',
    'database',
    'schema',
    'refactor',
    'architecture',
    'pattern',
    'structure',
    'scale',
    'migrate',
    'migration',
    'external',
    'codebase',
  ];

  // Keywords for epic complexity (major undertakings)
  const epicKeywords = [
    'rewrite',
    'rebuild',
    'major refactor',
    'new system',
    'microservice',
    'monolith',
    'platform',
    'framework',
    'multi-tenant',
    'multi-region',
    'distributed',
    'audit',
    'comprehensive review',
    'all hooks',
    'all agents',
    'all workflows',
    'all skills',
    'framework',
    'system-wide',
    'entire codebase',
    'everything',
  ];

  // Multi-scope patterns that MUST trigger EPIC complexity
  // These patterns indicate requests spanning multiple framework domains
  const multiScopePatterns = [
    /\ball\b.*\b(review|audit|check|validate)/i,
    /\b(review|audit|check)\b.*\ball\b/i,
    /multiple.*(agent|review|audit)/i,
    /(agents|workflows|hooks|skills|schemas).*and.*(agents|workflows|hooks|skills|schemas)/i,
    /etc\./i, // Enumeration indicator (e.g., "hooks, commands, etc.")
    /deep dive.*everything/i,
    /\ball\s+other\s+items/i, // "all other items"
    /\beverything\b.*\b(review|audit|check)/i,
    /\b(review|audit|check)\b.*\beverything\b/i,
  ];

  // Domain keywords for multi-domain detection
  const domainKeywords = [
    'router',
    'workflow',
    'hook',
    'skill',
    'agent',
    'schema',
    'memory',
    'command',
    'template',
    'config',
    'context',
  ];

  // Count matches
  const trivialMatches = trivialKeywords.filter(k => promptLower.includes(k)).length;
  const lowMatches = lowKeywords.filter(k => promptLower.includes(k)).length;
  const complexMatches = complexPlanningKeywords.filter(k => promptLower.includes(k)).length;
  const securityMatches = securityMandatoryKeywords.filter(k => promptLower.includes(k)).length;
  const architectMatches = architectKeywords.filter(k => promptLower.includes(k)).length;
  const epicMatches = epicKeywords.filter(k => promptLower.includes(k)).length;

  // Check multi-scope patterns (any match = EPIC)
  const multiScopeMatch = multiScopePatterns.some(pattern => pattern.test(prompt));

  // Count domain keyword matches for multi-domain detection
  const domainMatches = domainKeywords.filter(k => promptLower.includes(k)).length;

  // Word count analysis for verbose multi-scope requests
  const wordCount = prompt.split(/\s+/).length;

  // Determine complexity level
  let complexity = 'trivial'; // Default to trivial
  let requiresArchitectReview = false;
  let requiresSecurityReview = false;

  // EPIC complexity triggers (checked first, highest priority)
  // 1. Explicit multi-scope pattern match
  // 2. Multiple domains mentioned (4+)
  // 3. High word count combined with complex keywords
  // 4. Original epic keywords
  if (
    multiScopeMatch ||
    domainMatches >= 4 ||
    (wordCount > 30 && complexMatches >= 1) ||
    epicMatches >= 1 ||
    (architectMatches >= 2 && complexMatches >= 3)
  ) {
    complexity = 'epic';
    requiresArchitectReview = true;
  }
  // High complexity: architecture, security, multi-agent
  else if (complexMatches >= 2 || securityMatches >= 1 || architectMatches >= 2) {
    complexity = 'high';
    requiresArchitectReview = architectMatches >= 1 || complexMatches >= 2;
  }
  // Medium complexity: multi-file changes, features
  else if (complexMatches >= 1 || architectMatches >= 1) {
    complexity = 'medium';
  }
  // Low complexity: single-file fixes, minor changes
  else if (lowMatches >= 1 || (prompt.length > 20 && trivialMatches === 0)) {
    complexity = 'low';
  }
  // Trivial: greetings, questions (default, or explicit match)
  // Already set to 'trivial' by default

  // Security flag
  if (securityMatches >= 1) {
    requiresSecurityReview = true;
  }

  // Investigation patterns always require PLANNER
  const investigationPatterns = [
    /investigat.*why/i,
    /why.*not.*working/i,
    /debug.*enforcement/i,
    /fix.*hook/i,
    /router.*broken/i,
    /enforcement.*fail/i,
  ];
  if (investigationPatterns.some(p => p.test(prompt))) {
    complexity = 'high';
  }

  // Save complexity to router-state
  routerState.setComplexity(complexity);
  if (requiresSecurityReview) {
    routerState.setSecurityRequired(true);
  }

  return {
    complexity,
    requiresArchitectReview,
    requiresSecurityReview,
    multiAgentRequired: requiresArchitectReview || requiresSecurityReview,
  };
}

/**
 * Intent keywords for all 41 agents
 * Source: Research reports in .claude/context/artifacts/research-reports/agent-keywords-*.md
 *
 * Categories:
 * - Core Agents (8): architect, context_compressor, developer, planner, pm, qa, router, documentation
 * - Domain Languages (6): python, rust, golang, typescript, java, php
 * - Domain Frameworks (8): fastapi, nextjs, sveltekit, nodejs, expo, tauri, ios, graphql
 * - Domain Other (3): frontend, data_engineer, mobile_ux
 * - Specialized (12): c4_code, c4_component, c4_container, c4_context, code_reviewer,
 *                     conductor_validator, database_architect, devops, devops_troubleshooter,
 *                     incident_responder, reverse_engineer, security_architect
 * - Orchestrators (3): master_orchestrator, swarm_coordinator, evolution_orchestrator
 */
const intentKeywords = {
  // === CORE AGENTS (8) ===
  architect: [
    'architect',
    'system design',
    'system architecture',
    'architecture blueprint',
    'technical architecture',
    'technology selection',
    'tech stack',
    'platform selection',
    'scalability',
    'scaling strategy',
    'design patterns',
    'architectural patterns',
    'microservices',
    'monolith',
    'adr',
    'architecture decision record',
    'technical decision',
    'component interaction',
    'api design',
    'non-functional requirements',
    'cloud architecture',
    'infrastructure design',
    'data modeling',
    'technical strategy',
    'resilience',
    'availability',
    'reliability',
    'trade-offs',
  ],
  context_compressor: [
    'compress',
    'context compression',
    'summarize',
    'summarization',
    'summary',
    'token reduction',
    'token savings',
    'token optimization',
    'prune',
    'pruning',
    'context window',
    'context limits',
    'context overflow',
    'memory compression',
    'condense',
    'extract key',
    'key points',
    'reduce context',
    'distill',
  ],
  developer: [
    'code',
    'implement',
    'implementation',
    'fix bug',
    'debug',
    'debugging',
    'bugfix',
    'refactor',
    'refactoring',
    'tdd',
    'test-driven',
    'red-green-refactor',
    'write code',
    'write function',
    'write class',
    'unit test',
    'failing test',
    'commit',
    'push',
    'merge',
    'branch',
    'feature implementation',
    'error',
    'exception',
    'clean code',
    'code quality',
    'syntax error',
    'runtime error',
    'logic error',
  ],
  planner: [
    'plan',
    'planning',
    'create plan',
    'project plan',
    'breakdown',
    'break down',
    'decompose',
    'wbs',
    'work breakdown',
    'phases',
    'milestones',
    'steps',
    'stages',
    'dependencies',
    'sequence',
    'scope',
    'requirements',
    'goals',
    'objectives',
    'epic',
    'user story',
    'estimate',
    'timeline',
    'schedule',
    'ambiguous',
    'complex request',
    'roadmap',
    'prioritize',
    'deliverables',
    'success criteria',
  ],
  pm: [
    'product backlog',
    'backlog',
    'backlog grooming',
    'user story',
    'acceptance criteria',
    'sprint planning',
    'sprint goal',
    'sprint review',
    'prioritization',
    'rice',
    'moscow',
    'stakeholder',
    'product roadmap',
    'product vision',
    'okr',
    'objectives',
    'key results',
    'velocity',
    'story points',
    'burndown',
    'feature request',
    'agile',
    'scrum',
    'kanban',
    'customer',
    'user needs',
    'user feedback',
    'kpi',
    'metrics',
  ],
  qa: [
    'test',
    'testing',
    'test suite',
    'test coverage',
    'quality assurance',
    'qa',
    'regression',
    'regression testing',
    'edge case',
    'boundary condition',
    'corner case',
    'test plan',
    'test case',
    'test scenario',
    'automation',
    'automated testing',
    'e2e',
    'end-to-end',
    'integration testing',
    'performance testing',
    'load testing',
    'stress testing',
    'validation',
    'verification',
    'acceptance testing',
    'defect',
  ],
  router: [
    'route',
    'routing',
    'orchestrate',
    'orchestration',
    'dispatch',
    'delegate',
    'multi-agent',
    'agent coordination',
    'spawn agent',
    'subagent',
    'task distribution',
    'workflow',
    'pipeline',
    'context management',
    'which agent',
  ],
  documentation: [
    'document',
    'docs',
    'documentation',
    'readme',
    'readme.md',
    'write guide',
    'api doc',
    'api docs',
    'api documentation',
    'jsdoc',
    'typedoc',
    'docstring',
    'markdown',
    'md file',
    'technical writing',
    'user guide',
    'developer guide',
    'reference',
    'reference doc',
    'tutorial',
    'how-to',
    'howto',
    'getting started',
    'changelog',
    'release notes',
    'wiki',
    'specification',
    'spec',
    'openapi',
    'swagger',
    'postman',
    'docusaurus',
    'mkdocs',
    'sphinx',
    'write doc',
    'update doc',
    'create doc',
    'generate docs',
    'document this',
    'explain',
    'describe',
    'guide',
    'manual',
  ],

  // === DOMAIN LANGUAGE AGENTS (6) ===
  python: [
    'python',
    'py',
    '.py',
    'django',
    'flask',
    'pandas',
    'numpy',
    'scipy',
    'pip',
    'poetry',
    'pipenv',
    'uv',
    'pytest',
    'unittest',
    'asyncio',
    'virtualenv',
    'venv',
    'conda',
    'pyproject.toml',
    'requirements.txt',
    'type hints',
    'mypy',
    'pydantic',
    'dataclasses',
    'sqlalchemy',
    'celery',
    'jupyter',
    'notebook',
    'machine learning',
    'tensorflow',
    'pytorch',
  ],
  rust: [
    'rust',
    'rustlang',
    '.rs',
    'cargo',
    'crates.io',
    'crate',
    'tokio',
    'async-std',
    'ownership',
    'borrowing',
    'lifetimes',
    'rustc',
    'rustup',
    'cargo.toml',
    'memory safety',
    'zero-cost',
    'futures',
    'traits',
    'generics',
    'macros',
    'unsafe',
    'ffi',
    'wasm',
    'webassembly',
    'actix',
    'axum',
    'rocket',
    'serde',
  ],
  golang: [
    'go',
    'golang',
    '.go',
    'go.mod',
    'go.sum',
    'goroutine',
    'goroutines',
    'channel',
    'channels',
    'gin',
    'echo',
    'fiber',
    'go mod',
    'go get',
    'gofmt',
    'concurrency',
    'interface',
    'struct',
    'defer',
    'panic',
    'recover',
    'grpc',
    'protobuf',
    'net/http',
    'go test',
    'testify',
  ],
  typescript: [
    'typescript',
    'ts',
    '.ts',
    '.tsx',
    'type',
    'interface',
    'generics',
    'npm',
    'yarn',
    'pnpm',
    'bun',
    'tsconfig',
    'jest',
    'vitest',
    'eslint',
    'prettier',
    'tsc',
    'ts-node',
    'type safety',
    'type inference',
    'union types',
    'utility types',
    'decorators',
    'enum',
    'strict mode',
  ],
  java: [
    'java',
    '.java',
    'jdk',
    'jre',
    'spring',
    'spring boot',
    'springboot',
    'maven',
    'gradle',
    'jpa',
    'hibernate',
    'pom.xml',
    'build.gradle',
    'junit',
    'mockito',
    'jar',
    'war',
    'enterprise',
    'jakarta',
    'beans',
    'dependency injection',
    'annotations',
    '@autowired',
    '@component',
    'jdbc',
    'servlet',
    'streams',
    'lambda',
    'optional',
  ],
  php: [
    'php',
    '.php',
    'php8',
    'laravel',
    'symfony',
    'composer',
    'composer.json',
    'eloquent',
    'doctrine',
    'blade',
    'twig',
    'artisan',
    'phpunit',
    'pest',
    'psr',
    'psr-4',
    'autoloading',
    'namespace',
    'middleware',
    'migration',
    'seeder',
    'factory',
    'queue',
    'wordpress',
    'drupal',
  ],

  // === DOMAIN FRAMEWORK AGENTS (8) ===
  fastapi: [
    'fastapi',
    'pydantic',
    'async api',
    'python api',
    'starlette',
    'uvicorn',
    'openapi',
    'swagger',
    'dependency injection',
    'async python',
    'basemodel',
    'field validation',
    'path operations',
    'background tasks',
    'oauth2 python',
    'pydantic v2',
    'gunicorn',
    'hypercorn',
    'testclient',
  ],
  nextjs: [
    'next.js',
    'nextjs',
    'app router',
    'server components',
    'react ssr',
    'server actions',
    'use server',
    'rsc',
    'pages router',
    'vercel',
    'server rendering',
    'streaming',
    'suspense',
    'metadata',
    'isr',
    'static generation',
    'ssg',
    'ssr',
    'incremental static regeneration',
  ],
  sveltekit: [
    'svelte',
    'sveltekit',
    'svelte 5',
    'runes',
    '$state',
    '$derived',
    '$effect',
    '$props',
    '$bindable',
    'svelte reactivity',
    'fine-grained reactivity',
    '.svelte',
    '+page.svelte',
    '+layout.svelte',
    'svelte stores',
    'form actions',
    'load functions',
    'svelte adapter',
  ],
  nodejs: [
    'node.js',
    'nodejs',
    'express',
    'expressjs',
    'nestjs',
    'nest.js',
    'koa',
    'node backend',
    'node api',
    'express middleware',
    'nest modules',
    'node microservices',
    'node rest api',
    'express routing',
    'nest controllers',
    'fastify',
    'socket.io',
    'passport.js',
    'node websocket',
  ],
  expo: [
    'expo',
    'react native',
    'expo sdk',
    'mobile app',
    'cross-platform mobile',
    'expo router',
    'eas build',
    'expo go',
    'native modules',
    'expo config',
    'ios android app',
    'mobile development',
    'push notifications',
    'deep linking',
    'expo camera',
    'mobile navigation',
    'nativewind',
    'metro bundler',
  ],
  tauri: [
    'tauri',
    'desktop app',
    'rust desktop',
    'cross-platform desktop',
    'tauri 2',
    'tauri commands',
    'tauri plugins',
    'webview app',
    'electron alternative',
    'lightweight desktop',
    'secure desktop app',
    'system tray',
    'auto updater',
    'tauri ipc',
    'tauri.conf.json',
  ],
  ios: [
    'ios',
    'iphone',
    'ipad',
    'swift',
    'swiftui',
    'uikit',
    'xcode',
    'cocoapods',
    'spm',
    'swift package manager',
    'apple',
    'app store',
    'testflight',
    'core data',
    'combine',
    'async await swift',
    'storyboard',
    'interface builder',
    'auto layout',
    'watchos',
    'tvos',
    'visionos',
    'arkit',
    'realitykit',
    'metal',
    'spritekit',
    'healthkit',
    'homekit',
    'cloudkit',
    'push notification apns',
    'widget',
    'app clip',
    'app intent',
    'siri',
    'shortcuts',
    'ios app',
    'swift concurrency',
    'swift async',
    'swiftdata',
    'iphone app',
    'ios development',
    'apple watch',
    'ios ui',
    'swiftui views',
    'ios navigation',
    'app store connect',
    'apple development',
    'xcode project',
    'xcworkspace',
    'xcodeproj',
  ],
  android: [
    'android',
    'kotlin',
    'java android',
    'android studio',
    'gradle',
    'jetpack',
    'jetpack compose',
    'compose',
    'material design',
    'material3',
    'room database',
    'retrofit',
    'okhttp',
    'coroutines',
    'flow',
    'viewmodel',
    'livedata',
    'navigation component',
    'hilt',
    'dagger',
    'play store',
    'google play',
    'firebase',
    'fcm',
    'crashlytics',
    'work manager',
    'broadcast receiver',
    'content provider',
    'intent',
    'activity',
    'fragment',
    'service',
    'notification channel',
    'aab',
    'apk',
    'android app',
    'android development',
    'android sdk',
    'ndk',
    'android ui',
    'android navigation',
    'android lifecycle',
    'data binding',
    'view binding',
    'databinding',
    'viewbinding',
    'android testing',
    'espresso',
    'robolectric',
    'android emulator',
  ],
  graphql: [
    'graphql',
    'gql',
    'graphql api',
    'graphql schema',
    'apollo',
    'apollo server',
    'apollo client',
    'graphql server',
    'schema',
    'resolver',
    'resolvers',
    'mutation',
    'mutations',
    'subscription',
    'subscriptions',
    'query',
    'type definition',
    'graphql types',
    'sdl',
    'federation',
    'supergraph',
    'subgraph',
    'graphql n+1',
    'graphql pagination',
    'graphql auth',
    'api gateway graphql',
    'graphql federation',
    'dataloader',
    'relay',
    'urql',
    'mercurius',
    'prisma',
    'hasura',
    'graphql-codegen',
    'introspection',
    'fragment',
    'directive',
    'scalar',
    'enum type',
  ],

  // === DOMAIN OTHER AGENTS (3) ===
  frontend: [
    'frontend',
    'front-end',
    'react',
    'vue',
    'component',
    'css',
    'tailwind',
    'ui',
    'user interface',
    'styling',
    'shadcn',
    'radix',
    'headless ui',
    'chakra',
    'material ui',
    'mui',
    'ant design',
    'zustand',
    'redux',
    'responsive',
    'layout',
    'a11y',
    'accessibility',
    'wcag',
    'storybook',
  ],
  data_engineer: [
    'etl',
    'elt',
    'data pipeline',
    'data warehouse',
    'data lake',
    'data lakehouse',
    'batch processing',
    'stream processing',
    'data transformation',
    'data ingestion',
    'airflow',
    'prefect',
    'dagster',
    'luigi',
    'temporal',
    'dag',
    'dbt',
    'data modeling',
    'star schema',
    'snowflake schema',
    'great expectations',
    'data quality',
    'data validation',
    'spark',
    'pyspark',
  ],
  mobile_ux: [
    'ux review',
    'ui review',
    'mobile ux',
    'usability',
    'user experience',
    'heuristic evaluation',
    'hig',
    'human interface guidelines',
    'material design',
    'accessibility audit',
    'voiceover',
    'talkback',
    'touch targets',
    'mobile accessibility',
    'app design',
    'user testing',
    'design feedback',
  ],

  // === VERCEL SKILLS (5) ===
  react_performance: [
    'react performance',
    'next.js optimization',
    'nextjs optimization',
    'bundle size',
    'code review',
    'performance',
    'waterfalls',
    're-render',
    'render optimization',
    'server-side rendering',
    'client-side optimization',
    'lazy loading',
    'code splitting',
    'tree shaking',
    'image optimization',
    'prefetching',
    'hydration',
    'ssr performance',
    'csr performance',
    'lighthouse',
    'core web vitals',
    'lcp',
    'fcp',
    'cls',
    'fid',
  ],
  react_native: [
    'react native',
    'expo',
    'mobile',
    'ios',
    'android',
    'list performance',
    'flatlist',
    'animation',
    'native module',
    'mobile optimization',
    'mobile performance',
    'gesture',
    'navigation',
    'hermes',
    'metro',
    'fast refresh',
    'reanimated',
    'react native performance',
  ],
  composition_patterns: [
    'boolean prop',
    'compound component',
    'composition',
    'component library',
    'component architecture',
    'component pattern',
    'design system',
    'react 19',
    'react patterns',
    'render props',
    'higher-order component',
    'hoc',
    'children prop',
    'context api',
    'hooks pattern',
  ],
  web_design: [
    'accessibility',
    'audit',
    'wcag',
    'aria',
    'ux',
    'ui review',
    'design review',
    'dark mode',
    'typography',
    'form design',
    'color contrast',
    'focus management',
    'semantic html',
    'keyboard navigation',
    'screen reader',
    'a11y',
    'responsive design',
    'mobile-first',
  ],
  vercel_deploy: [
    'deploy',
    'vercel',
    'production',
    'deployment',
    'push live',
    'go live',
    'release',
    'cicd',
    'ci-cd',
    'deployment automation',
    'vercel deploy',
    'next.js deploy',
    'edge functions',
    'serverless',
    'preview deployment',
    'production deployment',
  ],

  // === SPECIALIZED AGENTS (12) ===
  c4_code: [
    'c4 code',
    'code level',
    'code diagram',
    'code documentation',
    'function signatures',
    'class diagram',
    'code structure',
    'code analysis',
    'code elements',
    'module documentation',
    'code organization',
  ],
  c4_component: [
    'c4 component',
    'component level',
    'component diagram',
    'component architecture',
    'logical grouping',
    'component boundaries',
    'component synthesis',
    'interface definition',
    'component relationships',
    'component design',
  ],
  c4_container: [
    'c4 container',
    'container level',
    'container diagram',
    'deployment architecture',
    'runtime containers',
    'deployment units',
    'deployment mapping',
    'container synthesis',
    'container interfaces',
    'infrastructure correlation',
  ],
  c4_context: [
    'c4 context',
    'system context',
    'context diagram',
    'high-level architecture',
    'system overview',
    'stakeholder view',
    'user journeys',
    'persona identification',
    'external dependencies',
    'system features',
    'big picture',
  ],
  code_reviewer: [
    'code review',
    'pr review',
    'pull request review',
    'review code',
    'review pr',
    'implementation review',
    'code feedback',
    'spec compliance',
    'merge approval',
    'review my pr',
    'check my code',
    'ready to merge',
    'review changes',
  ],
  code_simplifier: [
    'simplify',
    'simplify code',
    'simplify this',
    'make clearer',
    'make simpler',
    'clean up',
    'clean up code',
    'clean up this',
    'cleanup',
    'improve readability',
    'reduce complexity',
    'remove redundancy',
    'consolidate',
    'eliminate duplication',
    'refactor for clarity',
    'code cleanup',
    'too complex',
    'hard to understand',
    'confusing',
    'messy code',
    'overcomplicated',
    'nested',
    'unclear naming',
    'long function',
    'long method',
    'code smell',
    'reduce nesting',
  ],
  conductor_validator: [
    'conductor',
    'cdd',
    'context-driven development',
    'project validation',
    'artifact validation',
    'setup validation',
    'content validation',
    'track validation',
    'consistency validation',
    'verify artifacts',
  ],
  database_architect: [
    'database',
    'schema',
    'data model',
    'database design',
    'schema design',
    'query optimization',
    'migration',
    'erd',
    'entity relationship',
    'normalize',
    'indexes',
    'foreign keys',
    'constraints',
    'sql',
    'nosql',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'data warehouse architect',
  ],
  devops: [
    'devops',
    'ci/cd',
    'cicd',
    'pipeline',
    'deployment',
    'infrastructure',
    'containerization',
    'kubernetes',
    'k8s',
    'docker',
    'terraform',
    'pulumi',
    'github actions',
    'gitlab ci',
    'jenkins',
    'iac',
    'infrastructure as code',
    'prometheus',
    'grafana',
    'monitoring',
    'observability',
    'argocd',
    'flux',
  ],
  devops_troubleshooter: [
    'debug',
    'troubleshoot',
    'investigate',
    'system issue',
    'performance problem',
    'production problem',
    'incident debug',
    'analyze logs',
    'trace requests',
    'root cause analysis',
    'rca',
    'kubernetes debugging',
    'container issues',
    'pods crashing',
    'oomkilled',
    'connection timeout',
    'network issues',
  ],
  incident_responder: [
    'incident',
    'outage',
    'production down',
    'sre',
    'site reliability',
    'on-call',
    'service degraded',
    'system down',
    'incident response',
    'war room',
    'severity',
    'postmortem',
    'escalation',
    'sla violation',
    'p0',
    'p1',
    'sev1',
    'sev2',
    'pagerduty',
    'opsgenie',
    'mttr',
    'mttd',
    'error budget',
    'slo',
    'sli',
  ],
  reverse_engineer: [
    'reverse engineer',
    'binary analysis',
    'disassembly',
    'decompile',
    'malware analysis',
    'ctf',
    'security research',
    'vulnerability research',
    'analyze binary',
    'disassemble',
    'extract strings',
    'exploit analysis',
    'ida pro',
    'ghidra',
    'binary ninja',
    'radare2',
    'frida',
    'firmware analysis',
  ],
  security_architect: [
    'security',
    'security review',
    'security architecture',
    'threat model',
    'vulnerability',
    'compliance',
    'authentication',
    'authorization',
    'encryption',
    'stride',
    'owasp',
    'soc2',
    'hipaa',
    'gdpr',
    'pci-dss',
    'penetration testing',
    'zero trust',
    'defense-in-depth',
    'least privilege',
    'security assessment',
  ],

  // === ORCHESTRATOR AGENTS (3) ===
  master_orchestrator: [
    'orchestrate project',
    'manage project',
    'project lifecycle',
    'coordinate team',
    'oversee',
    'project plan',
    'milestone',
    'phase',
    'delegate',
    'spawn agents',
    'quality gate',
    'sign off',
    'status update',
    'end-to-end',
    'full project',
  ],
  swarm_coordinator: [
    'swarm',
    'multi-agent',
    'parallel agents',
    'consensus',
    'voting',
    'brainstorm',
    'hierarchical',
    'mesh',
    'distributed',
    'task distribution',
    'load balancing',
    'result aggregation',
    'byzantine',
    'coordination',
    'synchronization',
  ],
  evolution_orchestrator: [
    'create agent',
    'create skill',
    'new agent',
    'evolve',
    'capability gap',
    'no matching agent',
    'add workflow',
    'add hook',
    'new capability',
    'self-improvement',
    'artifact lifecycle',
    'extend capabilities',
  ],

  // === GAME DEVELOPMENT INTENT (routes to developer) ===
  gamedev: [
    'game',
    'game development',
    'gamedev',
    'game engine',
    'unity',
    'unreal',
    'godot',
    'pygame',
    'phaser',
    'pixi',
    'three.js',
    'babylon',
    'sprite',
    'animation',
    'physics engine',
    'collision detection',
    'game loop',
    'fps',
    'frame rate',
    'multiplayer',
    'netcode',
    'game design',
    'level design',
    'procedural generation',
    'pathfinding',
    'a-star',
    'game ai',
    'npc',
    'player controller',
    'input handling',
    'shader',
    'graphics',
    'rendering',
    '2d game',
    '3d game',
    'vr',
    'ar',
    'game asset',
    'tilemap',
    'sprite sheet',
    'game state',
    'save system',
  ],

  // === AI/ML INTENT (routes to python-pro with ai-ml-expert skill) ===
  ai_ml: [
    'ai',
    'artificial intelligence',
    'machine learning',
    'ml',
    'deep learning',
    'neural network',
    'model training',
    'inference',
    'prediction',
    'classification',
    'regression',
    'clustering',
    'nlp',
    'natural language',
    'computer vision',
    'cv',
    'transformer',
    'llm',
    'large language model',
    'embedding',
    'vector',
    'rag',
    'retrieval augmented',
    'fine-tuning',
    'huggingface',
    'pytorch',
    'tensorflow',
    'keras',
    'scikit-learn',
    'sklearn',
    'xgboost',
    'lightgbm',
    'catboost',
    'feature engineering',
    'hyperparameter',
    'cross-validation',
    'overfitting',
    'underfitting',
    'regularization',
  ],

  // === DATA SCIENCE INTENT (routes to data-engineer) ===
  data_science: [
    'data science',
    'data analysis',
    'analytics',
    'etl',
    'data pipeline',
    'data warehouse',
    'data lake',
    'big data',
    'spark',
    'hadoop',
    'data cleaning',
    'data wrangling',
    'exploratory analysis',
    'eda',
    'visualization',
    'dashboard',
    'reporting',
    'metrics',
    'kpi',
    'a/b testing',
    'experimentation',
    'hypothesis testing',
    'statistics',
  ],

  // === SCIENTIFIC INTENT (routes to python-pro with scientific-skills) ===
  scientific: [
    'scientific',
    'science',
    'research',
    'laboratory',
    'lab',
    'chemistry',
    'chemical',
    'molecule',
    'compound',
    'rdkit',
    'cheminformatics',
    'biology',
    'bioinformatics',
    'genomics',
    'gene',
    'protein',
    'dna',
    'rna',
    'scanpy',
    'single-cell',
    'rna-seq',
    'sequence',
    'sequencing',
    'drug discovery',
    'pharma',
    'pharmaceutical',
    'clinical',
    'medical',
    'literature review',
    'pubmed',
    'hypothesis',
    'scientific writing',
    'pandas',
    'matplotlib',
    'seaborn',
    'plotly',
    'visualization',
    'statistics',
    'statistical analysis',
    'dataset',
    'experiment',
    'physics',
    'astronomy',
    'quantum',
    'materials science',
    'biopython',
    'chembl',
    'uniprot',
    'pdb',
    'pubchem',
    'deepchem',
    'pytorch-lightning',
    'transformers',
    'scikit-learn',
    'mass spectrometry',
    'metabolomics',
    'proteomics',
    'transcriptomics',
    'clinical trials',
    'fda',
    'iso 13485',
    'regulatory',
    'opentrons',
    'benchling',
    'lamindb',
    'anndata',
  ],

  // === RESEARCHER INTENT (general research and fact-finding) ===
  researcher: [
    'investigate',
    'find out',
    'look up',
    'fact-check',
    'gather information',
    'web search',
    'external sources',
    'best practices',
    'industry standards',
    'analyze options',
    'compare',
    'verify',
    'validate',
    'research before',
    'pre-creation research',
    'what are the best',
    'how does X work',
    'is this the standard',
    'find information about',
    'documentation gathering',
    'competitive analysis',
    // Browser automation research keywords
    'browser test',
    'web automation',
    'scrape',
    'extract from page',
    'read page',
    'fill form',
    'data extraction',
    'web scraping',
    // Academic/arxiv research keywords
    'arxiv',
    'academic paper',
    'academic papers',
    'research paper',
    'research papers',
    'scientific paper',
    'scientific papers',
    'preprint',
    'preprints',
    'publication trends',
    'citation',
    'citations',
    'bibtex',
  ],

  // === WEB3/BLOCKCHAIN INTENT (routes to web3-blockchain-expert) ===
  web3: [
    'web3',
    'blockchain',
    'smart contract',
    'smartcontract',
    'solidity',
    'ethereum',
    'defi',
    'decentralized finance',
    'dapp',
    'decentralized app',
    'nft',
    'erc-20',
    'erc-721',
    'erc-1155',
    'erc20',
    'erc721',
    'erc1155',
    'hardhat',
    'foundry',
    'truffle',
    'ganache',
    'anvil',
    'forge',
    'openzeppelin',
    'reentrancy',
    'gas optimization',
    'gas fee',
    'metamask',
    'web3.js',
    'ethers.js',
    'viem',
    'wagmi',
    'polygon',
    'arbitrum',
    'optimism',
    'base',
    'layer 2',
    'l2',
    'rollup',
    'uniswap',
    'aave',
    'compound',
    'lending protocol',
    'amm',
    'staking',
    'yield farming',
    'liquidity pool',
    'lp token',
    'flash loan',
    'oracle',
    'chainlink',
    'price feed',
    'proxy contract',
    'upgradeable',
    'diamond pattern',
    'uups',
    'vyper',
    'cairo',
    'starknet',
    'slither',
    'mythril',
    'echidna',
    'token',
    'tokenomics',
    'governance',
    'dao',
    'multisig',
    'mev',
    'front-running',
    'sandwich attack',
    'audit',
    'security audit',
    'wallet',
    'private key',
    'transaction',
    'gas limit',
    'gwei',
  ],

  // === LEGACY INTENTS (for backward compatibility) ===
  bug: ['bug', 'fix', 'error', 'issue', 'broken', 'crash', 'fail'],
  feature: ['add', 'create', 'implement', 'new feature', 'build'],
  test: ['test', 'spec', 'coverage', 'unit test', 'e2e', 'integration'],
  security: ['security', 'vulnerability', 'auth', 'permission', 'xss', 'injection'],
  architecture: ['architect', 'design', 'refactor', 'structure', 'pattern'],
  incident: ['incident', 'outage', 'alert', 'urgent', 'emergency', 'down'],
  plan: ['plan', 'design', 'proposal', 'rfc', 'spec'],
  integration: ['review', 'integrate', 'codebase', 'migrate', 'import', 'pull'],
};

/**
 * Intent-to-Agent mapping for deterministic routing
 * Maps detected intent keys to agent names
 */
const INTENT_TO_AGENT = {
  // Core agents
  architect: 'architect',
  context_compressor: 'context-compressor',
  developer: 'developer',
  planner: 'planner',
  pm: 'pm',
  qa: 'qa',
  router: 'router',
  documentation: 'technical-writer',

  // Domain languages
  python: 'python-pro',
  rust: 'rust-pro',
  golang: 'golang-pro',
  typescript: 'typescript-pro',
  java: 'java-pro',
  php: 'php-pro',

  // Domain frameworks
  fastapi: 'fastapi-pro',
  nextjs: 'nextjs-pro',
  sveltekit: 'sveltekit-expert',
  nodejs: 'nodejs-pro',
  expo: 'expo-mobile-developer',
  tauri: 'tauri-desktop-developer',
  ios: 'ios-pro',
  android: 'android-pro', // Native Android/Kotlin development specialist
  graphql: 'graphql-pro',

  // Domain other
  frontend: 'frontend-pro',
  data_engineer: 'data-engineer',
  mobile_ux: 'mobile-ux-reviewer',

  // Vercel skills (5 skills integrated from Vercel)
  react_performance: 'frontend-pro', // Uses react-best-practices-vercel skill
  react_native: 'expo-mobile-developer', // Uses react-native-skills-vercel skill
  composition_patterns: 'frontend-pro', // Uses composition-patterns-vercel skill
  web_design: 'frontend-pro', // Uses web-design-guidelines-vercel skill
  vercel_deploy: 'devops', // Uses vercel-deploy-claimable skill

  // Specialized
  c4_code: 'c4-code',
  c4_component: 'c4-component',
  c4_container: 'c4-container',
  c4_context: 'c4-context',
  code_reviewer: 'code-reviewer',
  code_simplifier: 'code-simplifier',
  conductor_validator: 'conductor-validator',
  database_architect: 'database-architect',
  devops: 'devops',
  devops_troubleshooter: 'devops-troubleshooter',
  incident_responder: 'incident-responder',
  reverse_engineer: 'reverse-engineer',
  researcher: 'researcher',
  security_architect: 'security-architect',

  // Orchestrators
  master_orchestrator: 'master-orchestrator',
  swarm_coordinator: 'swarm-coordinator',
  evolution_orchestrator: 'evolution-orchestrator',

  // Scientific intent (dedicated agent with 139 scientific sub-skills)
  scientific: 'scientific-research-expert',

  // AI/ML intent (dedicated agent for deep learning, MLOps, model deployment)
  ai_ml: 'ai-ml-specialist',

  // Data Science intent (routes to data-engineer)
  data_science: 'data-engineer',

  // Game development intent (routes to gamedev-pro)
  gamedev: 'gamedev-pro',

  // Web3/Blockchain intent (routes to web3-blockchain-expert)
  web3: 'web3-blockchain-expert',

  // Legacy intents (map to most appropriate agent)
  bug: 'developer',
  feature: 'developer',
  test: 'qa',
  security: 'security-architect',
  architecture: 'architect',
  incident: 'incident-responder',
  plan: 'planner',
  integration: 'developer',
};

/**
 * Disambiguation rules for overlapping keywords
 * When multiple agents score similarly, these rules help break ties
 *
 * Format: { keyword: [{ condition: [contextKeywords], prefer: agentName, deprioritize: agentName }] }
 */
const DISAMBIGUATION_RULES = {
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
  // "async" could be python, rust, or typescript
  async: [
    {
      condition: ['python', 'asyncio', 'fastapi', 'django', 'flask'],
      prefer: 'python-pro',
      deprioritize: 'typescript-pro',
    },
    {
      condition: ['rust', 'tokio', 'cargo', 'ownership'],
      prefer: 'rust-pro',
      deprioritize: 'typescript-pro',
    },
    {
      condition: ['typescript', 'javascript', 'promise', 'await', 'node'],
      prefer: 'typescript-pro',
      deprioritize: 'python-pro',
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
  // "react" could be frontend-pro (web) or expo-mobile-developer (mobile)
  react: [
    {
      condition: ['mobile', 'native', 'ios', 'android', 'expo', 'flatlist'],
      prefer: 'expo-mobile-developer',
      deprioritize: 'frontend-pro',
    },
    {
      condition: ['web', 'browser', 'next', 'performance', 'bundle'],
      prefer: 'frontend-pro',
      deprioritize: 'expo-mobile-developer',
    },
  ],
  // "component" could be composition-patterns or frontend-pro performance
  'component-pattern': [
    {
      condition: ['boolean', 'compound', 'pattern', 'architecture'],
      prefer: 'composition-patterns-vercel', // Skill routing hint
      deprioritize: 'react-best-practices-vercel',
    },
    {
      condition: ['performance', 'optimize', 're-render'],
      prefer: 'react-best-practices-vercel', // Skill routing hint
      deprioritize: 'composition-patterns-vercel',
    },
  ],
  // "design" could be web-design (accessibility) or frontend-pro (performance)
  'design-guidelines': [
    {
      condition: ['accessibility', 'wcag', 'aria', 'contrast'],
      prefer: 'web-design-guidelines-vercel', // Skill routing hint
      deprioritize: 'react-best-practices-vercel',
    },
    {
      condition: ['performance', 'speed', 'optimization'],
      prefer: 'react-best-practices-vercel', // Skill routing hint
      deprioritize: 'web-design-guidelines-vercel',
    },
  ],
};

/**
 * Apply disambiguation rules to adjust agent scores
 * @param {string} promptLower - lowercase user prompt
 * @param {Array} candidates - array of {agent, score} objects
 * @returns {Array} - adjusted candidates array
 */
function applyDisambiguation(promptLower, candidates) {
  // Find which disambiguation keywords are in the prompt
  for (const [keyword, rules] of Object.entries(DISAMBIGUATION_RULES)) {
    if (!promptLower.includes(keyword)) continue;

    // Check each rule for this keyword
    for (const rule of rules) {
      const hasCondition = rule.condition.some(c => promptLower.includes(c));
      if (!hasCondition) continue;

      // Apply score adjustments
      for (const candidate of candidates) {
        if (candidate.agent.name === rule.prefer) {
          candidate.score += 3; // Boost preferred agent
          candidate.disambiguated = true;
        } else if (candidate.agent.name === rule.deprioritize) {
          candidate.score -= 1; // Slight penalty for deprioritized
          candidate.disambiguated = true;
        }
      }
    }
  }

  // Re-sort after disambiguation
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Score agents against user prompt using comprehensive intent detection
 */
function scoreAgents(prompt, agents) {
  const promptLower = prompt.toLowerCase();
  const scores = [];

  // Detect all matching intents with their scores
  const intentScores = {};
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    const matchCount = keywords.filter(k => promptLower.includes(k)).length;
    if (matchCount > 0) {
      intentScores[intent] = matchCount;
    }
  }

  // Find primary intent (highest scoring)
  let detectedIntent = 'general';
  let maxIntentScore = 0;
  for (const [intent, score] of Object.entries(intentScores)) {
    if (score > maxIntentScore) {
      maxIntentScore = score;
      detectedIntent = intent;
    }
  }

  // Get preferred agent for the detected intent
  const preferredAgentName = INTENT_TO_AGENT[detectedIntent] || null;

  // Score each agent
  for (const agent of agents) {
    let score = 0;
    const agentDesc = (agent.description + ' ' + agent.name).toLowerCase();
    const _agentName = agent.name.toLowerCase();

    // Match by description keywords
    const promptWords = promptLower.split(/\s+/);
    for (const word of promptWords) {
      if (word.length > 3 && agentDesc.includes(word)) {
        score += 1;
      }
    }

    // Direct intent-to-agent match (highest priority - +5 boost)
    if (preferredAgentName && agent.name === preferredAgentName) {
      score += 5;
    }

    // Secondary intent matches (check all detected intents)
    for (const [intent, intentScore] of Object.entries(intentScores)) {
      const mappedAgent = INTENT_TO_AGENT[intent];
      if (mappedAgent && agent.name === mappedAgent && intent !== detectedIntent) {
        // Secondary matches get smaller boost scaled by their score
        score += Math.min(3, intentScore);
      }
    }

    // Domain-specific routing boosts for high-confidence matches
    // These ensure domain experts are preferred for their specific technologies
    const domainBoosts = {
      // Languages (python-pro for general Python development)
      'python-pro': [
        'python',
        '.py',
        'django',
        'flask',
        'pytest',
        'pip',
        'poetry',
        'pandas',
        'numpy',
        'asyncio',
        'pydantic',
        'sqlalchemy',
        'celery',
        'virtualenv',
        'venv',
        'conda',
        'pyproject.toml',
        'requirements.txt',
        'type hints',
        'mypy',
        'dataclasses',
      ],
      'rust-pro': ['rust', '.rs', 'cargo', 'tokio', 'ownership', 'borrowing'],
      'golang-pro': ['golang', '.go', 'goroutine', 'go mod', 'gin', 'echo'],
      'typescript-pro': ['typescript', '.ts', '.tsx', 'tsconfig', 'tsc'],
      'java-pro': ['java', '.java', 'spring boot', 'maven', 'gradle', 'jpa'],
      'php-pro': ['php', '.php', 'laravel', 'symfony', 'composer', 'eloquent'],
      // Frameworks
      'fastapi-pro': ['fastapi', 'pydantic', 'uvicorn', 'starlette'],
      'nextjs-pro': ['nextjs', 'next.js', 'app router', 'server components'],
      'sveltekit-expert': ['svelte', 'sveltekit', 'runes', '$state', '$derived'],
      'nodejs-pro': ['node.js', 'nodejs', 'express', 'nestjs'],
      'expo-mobile-developer': ['expo', 'react native', 'eas build'],
      'tauri-desktop-developer': ['tauri', 'desktop app', 'electron alternative'],
      'ios-pro': ['ios', 'swift', 'swiftui', 'xcode', 'uikit'],
      'android-pro': [
        'android',
        'kotlin',
        'jetpack',
        'jetpack compose',
        'compose',
        'material design',
        'material3',
        'room',
        'hilt',
        'dagger',
        'viewmodel',
        'stateflow',
        'android studio',
        'gradle',
        'play store',
        'firebase android',
        'coroutines',
        'kotlin flow',
      ],
      'graphql-pro': [
        'graphql',
        'gql',
        'apollo',
        'apollo server',
        'apollo client',
        'resolver',
        'mutation',
        'subscription',
        'federation',
        'supergraph',
        'subgraph',
        'hasura',
        'relay',
        'urql',
        'graphql-codegen',
        'introspection',
        'fragment',
        'directive',
      ],
      // Domain other
      'frontend-pro': ['react', 'vue', 'tailwind', 'shadcn', 'component'],
      'data-engineer': [
        'etl',
        'data pipeline',
        'airflow',
        'dbt',
        'data warehouse',
        // Data Science keywords
        'data science',
        'data analysis',
        'analytics',
        'big data',
        'spark',
        'hadoop',
        'data cleaning',
        'data wrangling',
        'exploratory analysis',
        'eda',
        'visualization',
        'dashboard',
        'reporting',
        'a/b testing',
        'experimentation',
      ],
      'mobile-ux-reviewer': ['ux review', 'mobile ux', 'heuristic evaluation'],
      // Scientific research expert (dedicated agent for computational biology, cheminformatics)
      'scientific-research-expert': [
        'scientific',
        'science',
        'research',
        'laboratory',
        'lab',
        'chemistry',
        'chemical',
        'molecule',
        'compound',
        'rdkit',
        'cheminformatics',
        'biology',
        'bioinformatics',
        'genomics',
        'gene',
        'protein',
        'dna',
        'rna',
        'scanpy',
        'single-cell',
        'rna-seq',
        'sequence',
        'sequencing',
        'drug discovery',
        'pharma',
        'pharmaceutical',
        'clinical',
        'medical',
        'literature review',
        'pubmed',
        'hypothesis',
        'scientific writing',
        'biopython',
        'chembl',
        'uniprot',
        'pdb',
        'pubchem',
        'mass spectrometry',
        'metabolomics',
        'proteomics',
        'transcriptomics',
        'clinical trials',
        'fda',
        'regulatory',
        'prisma',
        'systematic review',
        'opentrons',
        'benchling',
        'lamindb',
        'anndata',
        'deepchem',
      ],
      // AI/ML specialist (dedicated agent for ML/DL, MLOps, model deployment)
      'ai-ml-specialist': [
        'machine learning',
        'deep learning',
        'neural network',
        'model training',
        'tensorflow',
        'pytorch',
        'keras',
        'scikit-learn',
        'sklearn',
        'huggingface',
        'transformer',
        'llm',
        'embedding',
        'fine-tuning',
        'xgboost',
        'lightgbm',
        'catboost',
        'feature engineering',
        'classification',
        'regression',
        'clustering',
        'nlp',
        'computer vision',
        'mlops',
        'mlflow',
        'weights and biases',
        'wandb',
        'experiment tracking',
        'model serving',
        'torchserve',
        'kserve',
        'bentoml',
        'inference',
        'hyperparameter',
        'cross-validation',
        'overfitting',
        'regularization',
        'onnx',
        'tensorrt',
        'quantization',
        'model optimization',
        'distributed training',
        'gpu training',
        'cuda',
        'data augmentation',
      ],
      // Game development
      'gamedev-pro': [
        'game',
        'game development',
        'gamedev',
        'game engine',
        'unity',
        'unreal',
        'godot',
        'ecs',
        'entity component system',
        'game loop',
        'game physics',
        'shader',
        'sprite',
        'collision',
        'physics engine',
        'multiplayer',
        'netcode',
        'game ai',
        'pathfinding',
        'behavior tree',
        'game state',
        'level design',
        'procedural generation',
        'fps',
        'frame rate',
        'gpu',
        'rendering',
      ],
      // Specialized
      'security-architect': ['security', 'threat model', 'owasp', 'vulnerability', 'stride'],
      'incident-responder': ['incident', 'outage', 'sre', 'on-call', 'postmortem'],
      devops: ['kubernetes', 'docker', 'ci/cd', 'terraform', 'pipeline'],
      'devops-troubleshooter': ['troubleshoot', 'debug', 'logs', 'rca', 'investigate'],
      'database-architect': ['database', 'schema', 'migration', 'query optimization'],
      'code-reviewer': ['code review', 'pr review', 'pull request', 'merge approval'],
      'code-simplifier': ['simplify', 'clean up', 'refactor for clarity', 'reduce complexity'],
      'technical-writer': [
        'documentation',
        'docs',
        'readme',
        'readme.md',
        'guide',
        'tutorial',
        'api documentation',
        'jsdoc',
        'typedoc',
        'markdown',
        'md file',
        'technical writing',
        'user guide',
        'developer guide',
        'getting started',
        'changelog',
        'release notes',
        'openapi',
        'swagger',
        'docusaurus',
        'mkdocs',
        'sphinx',
        'generate docs',
        'document this',
        'write doc',
      ],
      // Web3/Blockchain
      'web3-blockchain-expert': [
        'web3',
        'blockchain',
        'smart contract',
        'solidity',
        'ethereum',
        'defi',
        'nft',
        'erc-20',
        'erc-721',
        'hardhat',
        'foundry',
        'openzeppelin',
        'reentrancy',
        'gas optimization',
        'metamask',
        'polygon',
        'arbitrum',
        'optimism',
        'uniswap',
        'aave',
        'staking',
        'flash loan',
        'chainlink',
        'proxy contract',
        'upgradeable',
        'vyper',
        'cairo',
        'slither',
        'mythril',
        'tokenomics',
        'dao',
      ],
    };

    // Apply domain-specific boosts
    const agentBoostKeywords = domainBoosts[agent.name];
    if (agentBoostKeywords) {
      const boostMatches = agentBoostKeywords.filter(k => promptLower.includes(k)).length;
      if (boostMatches > 0) {
        score += Math.min(4, boostMatches * 2); // Up to +4 for domain matches
      }
    }

    // Priority boost
    if (agent.priority === 'high') score += 1;

    scores.push({ agent, score, intent: detectedIntent });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Apply disambiguation rules when top agents have close scores
  let candidates = scores.slice(0, 5); // Get top 5 for disambiguation
  if (candidates.length >= 2 && candidates[0].score - candidates[1].score < 3) {
    // Close scores - apply disambiguation
    candidates = applyDisambiguation(promptLower, candidates);
  }

  return { candidates: candidates.slice(0, 3), intent: detectedIntent };
}

/**
 * Main execution
 */
function main() {
  // PERF-006/PERF-007: Use shared hook-input.cjs utility
  const hookInput = parseHookInputSync();

  // Get the user prompt
  let userPrompt = '';
  if (hookInput && hookInput.prompt) {
    userPrompt = hookInput.prompt;
  } else if (hookInput && hookInput.message) {
    userPrompt = hookInput.message;
  }

  // Skip routing suggestions for very short prompts or meta commands
  if (!userPrompt || userPrompt.length < 10) {
    process.exit(0);
  }

  // Skip for slash commands (handled by skill system)
  if (userPrompt.trim().startsWith('/')) {
    process.exit(0);
  }

  // Load agents and score
  const agents = loadAgents();
  if (agents.length === 0) {
    // No agents found, skip routing
    process.exit(0);
  }

  const { candidates, intent } = scoreAgents(userPrompt, agents);
  const planningReq = detectPlanningRequirement(userPrompt);

  // Only show routing info if we have a clear recommendation
  if (candidates.length > 0 && candidates[0].score > 2) {
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│ 🔀 ROUTER ANALYSIS                              │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log(`│ Intent: ${intent.padEnd(39)} │`);
    console.log(`│ Complexity: ${planningReq.complexity.padEnd(36)} │`);
    console.log('│ Recommended agents:                             │');
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const c = candidates[i];
      if (c.score > 0) {
        const line = `│  ${i + 1}. ${c.agent.name} (score: ${c.score})`.padEnd(50) + '│';
        console.log(line);
      }
    }

    // Show multi-agent planning requirements
    if (planningReq.multiAgentRequired) {
      console.log('├─────────────────────────────────────────────────┤');
      console.log('│ ⚠️  MULTI-AGENT PLANNING REQUIRED               │');
      if (planningReq.requiresArchitectReview) {
        console.log('│  → Architect review: REQUIRED                   │');
      }
      if (planningReq.requiresSecurityReview) {
        console.log('│  → Security review: REQUIRED                    │');
      }
      console.log('│                                                 │');
      console.log('│ Phases: Explore → Plan → Review → Consolidate  │');
    }

    console.log('│                                                 │');
    console.log('│ Use Task tool to spawn: ' + candidates[0].agent.name.padEnd(24) + '│');
    console.log('└─────────────────────────────────────────────────┘\n');
  }

  // Always allow (advisory mode)
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
