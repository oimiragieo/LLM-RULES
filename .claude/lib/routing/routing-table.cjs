'use strict';
/**
 * Routing Table (Shared)
 * ======================
 *
 * Single source of truth for intent keywords, routing mappings,
 * and disambiguation rules. Consumers: router-enforcer, routing-guard,
 * and any CLI or validation tools.
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
  // LLM Architecture
  llm: 'llm-architect',
  rag: 'llm-architect',
  langchain: 'llm-architect',
  llamaindex: 'llm-architect',
  embedding: 'llm-architect',
  tokenization: 'llm-architect',
  promptengineering: 'llm-architect',
  // Prompt Engineering
  prompt: 'prompt-engineer',
  systemprompt: 'prompt-engineer',
  fewshot: 'prompt-engineer',
  // MCP
  mcp: 'mcp-developer',
  mcpserver: 'mcp-developer',
  mcpclient: 'mcp-developer',
  modelcontextprotocol: 'mcp-developer',
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
  // API Design
  'api-design': 'api-designer',
  openapi: 'api-designer',
  'rest-design': 'api-designer',
  'graphql-schema': 'api-designer',
  'grpc-proto': 'api-designer',
  'api-versioning': 'api-designer',
  'api-contract': 'api-designer',
  'endpoint-design': 'api-designer',
  'resource-modeling': 'api-designer',
  'api-documentation': 'api-designer',
  // Microservices Architecture
  'service-mesh': 'microservices-architect',
  istio: 'microservices-architect',
  linkerd: 'microservices-architect',
  'event-driven': 'microservices-architect',
  saga: 'microservices-architect',
  cqrs: 'microservices-architect',
  'event-sourcing': 'microservices-architect',
  'service-decomposition': 'microservices-architect',
  'bounded-context': 'microservices-architect',
  'domain-driven': 'microservices-architect',
  'distributed-system': 'microservices-architect',
  // SRE
  slo: 'sre-engineer',
  sli: 'sre-engineer',
  sla: 'sre-engineer',
  'error-budget': 'sre-engineer',
  'production-readiness': 'sre-engineer',
  'capacity-planning': 'sre-engineer',
  toil: 'sre-engineer',
  runbook: 'sre-engineer',
  // Performance Engineering
  profiling: 'performance-engineer',
  'load-test': 'performance-engineer',
  benchmark: 'performance-engineer',
  bottleneck: 'performance-engineer',
  'core-web-vitals': 'performance-engineer',
  'bundle-size': 'performance-engineer',
  'memory-leak': 'performance-engineer',
  // Penetration Testing
  pentest: 'penetration-tester',
  'penetration-test': 'penetration-tester',
  'security-test': 'penetration-tester',
  'vulnerability-scan': 'penetration-tester',
  'owasp-test': 'penetration-tester',
  'ethical-hack': 'penetration-tester',
  exploit: 'penetration-tester',
  'xss-test': 'penetration-tester',
  'sql-injection-test': 'penetration-tester',
  'auth-bypass': 'penetration-tester',
  // Accessibility Testing
  wcag: 'accessibility-tester',
  a11y: 'accessibility-tester',
  'screen-reader': 'accessibility-tester',
  'keyboard-navigation': 'accessibility-tester',
  'color-contrast': 'accessibility-tester',
  'focus-management': 'accessibility-tester',
  'alt-text': 'accessibility-tester',
  'semantic-html': 'accessibility-tester',
  // Chaos Engineering
  'chaos-engineering': 'chaos-engineer',
  'failure-injection': 'chaos-engineer',
  'resilience-test': 'chaos-engineer',
  'circuit-breaker-test': 'chaos-engineer',
  'game-day': 'chaos-engineer',
  'blast-radius': 'chaos-engineer',
  'steady-state': 'chaos-engineer',
  'fault-tolerance': 'chaos-engineer',
};

// Prefix/pattern routing for short-form tech tokens or frameworks
const ROUTING_PREFIX_PATTERNS = [
  { pattern: 'reactjs', agent: 'frontend-pro' },
  { pattern: 'nextjs', agent: 'nextjs-pro' },
  { pattern: 'nodejs', agent: 'nodejs-pro' },
  { pattern: 'sveltekit', agent: 'sveltekit-expert' },
  { pattern: 'vuejs', agent: 'frontend-pro' },
  { pattern: 'fastapi', agent: 'fastapi-pro' },
];

/**
 * Pattern-based routing: regex + priority. Higher priority wins.
 * Used when keyword/prefix matching does not resolve intent.
 */
const ROUTING_PATTERNS = {
  developer: [
    { pattern: /^(implement|code|build|develop|create|fix|add)\b/i, priority: 10 },
    { pattern: /\b(bug|fix|debug|patch|error|exception)\b/i, priority: 9 },
  ],
  qa: [
    { pattern: /^(test|testing|qa|validate|coverage)\b/i, priority: 10 },
    { pattern: /\b(tdd|test-driven|e2e|regression)\b/i, priority: 8 },
  ],
  architect: [
    { pattern: /^(design|architecture|system\s+design|refactor)\b/i, priority: 10 },
    { pattern: /\b(microservice|scalab|pattern|adr)\b/i, priority: 9 },
  ],
  planner: [{ pattern: /^(plan|planning|break\s*down|roadmap)\b/i, priority: 10 }],
  'security-architect': [{ pattern: /^(security|audit|vulnerability|owasp)\b/i, priority: 10 }],
  'technical-writer': [{ pattern: /^(document|docs|readme|guide|tutorial)\b/i, priority: 10 }],
  devops: [{ pattern: /^(deploy|ci\/cd|pipeline|kubernetes|docker)\b/i, priority: 10 }],
  'incident-responder': [
    { pattern: /\b(incident|outage|emergency|production\s+down)\b/i, priority: 10 },
  ],
  'code-reviewer': [{ pattern: /^(review|pr\s+review|code\s+review)\b/i, priority: 10 }],
};

const INTENT_KEYWORDS = {
  // === CORE AGENTS (8) ===
  architect: [
    'architect',
    'system design',
    'architecture',
    'scalability',
    'microservices',
    'monolith',
    'adr',
    'resilience',
  ],
  context_compressor: ['compress', 'context compression', 'summarize', 'token reduction', 'prune'],
  developer: ['code', 'implement', 'fix bug', 'debug', 'refactor', 'tdd', 'test-driven', 'commit'],
  planner: [
    'plan',
    'planning',
    'breakdown',
    'decompose',
    'phases',
    'milestones',
    'dependencies',
    'scope',
    'roadmap',
  ],
  pm: [
    'backlog',
    'user story',
    'sprint',
    'prioritization',
    'product roadmap',
    'okr',
    'agile',
    'scrum',
    'kanban',
  ],
  qa: ['test', 'testing', 'qa', 'regression', 'e2e', 'edge case', 'test coverage', 'validation'],
  router: ['route', 'routing', 'orchestrate', 'dispatch', 'multi-agent', 'spawn agent'],
  documentation: [
    'document',
    'docs',
    'readme',
    'api doc',
    'jsdoc',
    'markdown',
    'technical writing',
    'tutorial',
    'changelog',
    'openapi',
    'swagger',
  ],

  // === DOMAIN LANGUAGE AGENTS (6) ===
  python: ['python', 'django', 'flask', 'pandas', 'numpy', 'pytest', 'asyncio', 'pydantic'],
  rust: ['rust', 'cargo', 'tokio', 'ownership', 'borrowing', 'lifetimes', 'wasm'],
  golang: ['golang', 'goroutine', 'channel', 'gin', 'grpc', 'protobuf'],
  typescript: ['typescript', 'npm', 'tsconfig', 'jest', 'vitest', 'eslint'],
  java: ['java', 'jdk', 'spring', 'spring boot', 'maven', 'gradle', 'hibernate', 'junit'],
  php: ['php', 'laravel', 'symfony', 'composer', 'eloquent', 'blade', 'phpunit', 'wordpress'],

  // === DOMAIN FRAMEWORK AGENTS (8) ===
  fastapi: ['fastapi', 'pydantic', 'starlette', 'uvicorn'],
  nextjs: ['next.js', 'nextjs', 'app router', 'server components', 'server actions', 'vercel'],
  sveltekit: ['svelte', 'sveltekit', 'svelte 5', 'runes', '$state', '$derived', '$effect'],
  nodejs: ['node.js', 'nodejs', 'express', 'nestjs', 'koa', 'fastify', 'socket.io'],
  expo: ['expo', 'react native', 'expo sdk', 'expo router', 'eas build'],
  tauri: ['tauri', 'desktop app', 'rust desktop', 'tauri 2', 'electron alternative'],
  ios: ['ios', 'swift', 'swiftui', 'xcode', 'cocoapods', 'spm', 'app store', 'core data'],
  android: [
    'android',
    'kotlin',
    'android studio',
    'jetpack compose',
    'room',
    'retrofit',
    'firebase',
  ],
  graphql: ['graphql', 'gql', 'apollo', 'resolver', 'mutation', 'subscription', 'federation'],

  // === DOMAIN OTHER AGENTS (3) ===
  frontend: ['frontend', 'react', 'vue', 'css', 'tailwind', 'ui', 'responsive', 'a11y'],
  data_engineer: ['etl', 'elt', 'data pipeline', 'data warehouse', 'airflow', 'dbt', 'spark'],
  mobile_ux: [
    'ux review',
    'ui review',
    'mobile ux',
    'usability',
    'heuristic evaluation',
    'accessibility audit',
  ],

  // === VERCEL SKILLS (5) ===
  react_performance: [
    'react performance',
    'next.js optimization',
    'bundle size',
    're-render',
    'lazy loading',
    'core web vitals',
  ],
  react_native: ['react native', 'flatlist', 'hermes', 'reanimated'],
  composition_patterns: [
    'compound component',
    'composition',
    'component library',
    'design system',
    'react patterns',
  ],
  web_design: ['wcag', 'aria', 'ux', 'dark mode', 'responsive design'],
  vercel_deploy: ['deploy', 'vercel', 'cicd', 'edge functions', 'serverless'],

  // === SPECIALIZED AGENTS (12) ===
  c4_code: ['c4 code', 'code level', 'code diagram', 'class diagram'],
  c4_component: ['c4 component', 'component level', 'component diagram', 'component architecture'],
  c4_container: ['c4 container', 'container level', 'container diagram', 'deployment architecture'],
  c4_context: ['c4 context', 'system context', 'context diagram', 'high-level architecture'],
  code_reviewer: ['code review', 'pr review', 'pull request', 'review code'],
  code_simplifier: [
    'simplify',
    'clean up',
    'reduce complexity',
    'refactor for clarity',
    'code smell',
  ],
  conductor_validator: ['conductor', 'cdd', 'context-driven development', 'artifact validation'],
  database_architect: [
    'database',
    'schema',
    'data model',
    'query optimization',
    'migration',
    'erd',
    'sql',
    'postgresql',
  ],
  devops: [
    'devops',
    'ci/cd',
    'pipeline',
    'kubernetes',
    'k8s',
    'docker',
    'terraform',
    'github actions',
    'iac',
  ],
  devops_troubleshooter: [
    'troubleshoot',
    'root cause analysis',
    'rca',
    'kubernetes debugging',
    'pods crashing',
    'oomkilled',
    'connection timeout',
  ],
  incident_responder: [
    'incident',
    'outage',
    'production down',
    'on-call',
    'postmortem',
    'pagerduty',
    'slo',
  ],
  reverse_engineer: [
    'reverse engineer',
    'binary analysis',
    'disassembly',
    'decompile',
    'malware analysis',
    'ghidra',
    'ida pro',
  ],
  security_architect: [
    'security',
    'security review',
    'threat model',
    'vulnerability',
    'authentication',
    'encryption',
    'owasp',
    'zero trust',
  ],

  // === ORCHESTRATOR AGENTS (3) ===
  master_orchestrator: [
    'orchestrate project',
    'coordinate team',
    'project lifecycle',
    'milestone',
    'phase',
    'quality gate',
  ],
  swarm_coordinator: [
    'swarm',
    'multi-agent',
    'parallel agents',
    'consensus',
    'distributed',
    'coordination',
  ],
  evolution_orchestrator: [
    'create agent',
    'create skill',
    'evolve',
    'capability gap',
    'self-improvement',
    'extend capabilities',
  ],

  // === GAME DEVELOPMENT ===
  gamedev: [
    'game',
    'gamedev',
    'unity',
    'unreal',
    'godot',
    'game engine',
    'physics',
    'collision',
    'shader',
  ],

  // === LLM ARCHITECT ===
  llm_architect: [
    'llm architecture',
    'rag pipeline',
    'langchain',
    'llamaindex',
    'vector database',
    'embedding',
    'token optimization',
  ],

  // === PROMPT ENGINEER ===
  prompt_engineer: [
    'prompt engineering',
    'system prompt',
    'few-shot',
    'chain of thought',
    'cot',
    'prompt template',
  ],

  // === MCP DEVELOPER ===
  mcp_developer: ['mcp', 'model context protocol', 'mcp server', 'mcp client', 'mcp tool'],

  // === API DESIGNER ===
  api_designer: [
    'api design',
    'openapi',
    'rest design',
    'graphql schema',
    'grpc proto',
    'api versioning',
    'api contract',
  ],

  // === MICROSERVICES ARCHITECT ===
  microservices_architect: [
    'microservices',
    'service mesh',
    'istio',
    'event driven',
    'saga',
    'cqrs',
    'event sourcing',
  ],

  // === SRE ENGINEER ===
  sre_engineer: ['sre', 'site reliability', 'slo', 'sli', 'sla', 'error budget', 'toil', 'runbook'],

  // === PERFORMANCE ENGINEER ===
  performance_engineer: [
    'profiling',
    'load test',
    'benchmark',
    'bottleneck',
    'core web vitals',
    'bundle size',
    'memory leak',
  ],

  // === PENETRATION TESTER ===
  penetration_tester: [
    'pentest',
    'penetration test',
    'security test',
    'vulnerability scan',
    'exploit',
    'xss test',
    'sql injection test',
  ],

  // === ACCESSIBILITY TESTER ===
  accessibility_tester: [
    'accessibility',
    'wcag',
    'a11y',
    'screen reader',
    'aria',
    'keyboard navigation',
    'color contrast',
  ],

  // === CHAOS ENGINEER ===
  chaos_engineer: [
    'chaos',
    'chaos engineering',
    'failure injection',
    'resilience test',
    'game day',
    'fault tolerance',
  ],

  // === AI/ML ===
  ai_ml: [
    'ai',
    'machine learning',
    'ml',
    'deep learning',
    'neural network',
    'pytorch',
    'tensorflow',
    'huggingface',
    'nlp',
  ],

  // === DATA SCIENCE (routes to data-engineer) ===
  data_science: [
    'data science',
    'data analysis',
    'analytics',
    'etl',
    'spark',
    'visualization',
    'a/b testing',
  ],

  // === SCIENTIFIC ===
  scientific: [
    'scientific',
    'research',
    'chemistry',
    'biology',
    'bioinformatics',
    'genomics',
    'rdkit',
    'biopython',
    'pubmed',
  ],

  // === RESEARCHER ===
  researcher: [
    'investigate',
    'research',
    'fact-check',
    'web search',
    'best practices',
    'arxiv',
    'academic paper',
    'preprint',
  ],

  // === ARTIFACT INTEGRATION ===
  'artifact-integration': [
    'integrate artifact',
    'orphan artifact',
    'artifact graph',
    'integration health',
  ],

  // === WEB3/BLOCKCHAIN ===
  web3: [
    'web3',
    'blockchain',
    'smart contract',
    'solidity',
    'ethereum',
    'defi',
    'nft',
    'hardhat',
    'foundry',
  ],
};

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

  // Artifact Integration (routes to architect for integration analysis)
  'artifact-integration': 'architect',

  // Scientific intent (dedicated agent with 139 scientific sub-skills)
  scientific: 'scientific-research-expert',

  // LLM Architecture intent (LLM system design, RAG pipelines, model serving)
  llm_architect: 'llm-architect',

  // Prompt Engineering intent (prompt optimization, few-shot design, token reduction)
  prompt_engineer: 'prompt-engineer',

  // MCP Developer intent (Model Context Protocol server/client implementation)
  mcp_developer: 'mcp-developer',

  // AI/ML intent (dedicated agent for deep learning, MLOps, model deployment)
  ai_ml: 'ai-ml-specialist',

  // API Design intent (OpenAPI, REST, gRPC, GraphQL schemas)
  api_designer: 'api-designer',

  // Microservices Architecture intent (service mesh, event-driven, distributed systems)
  microservices_architect: 'microservices-architect',

  // SRE intent (SLO/SLI/SLA, error budgets, production readiness)
  sre_engineer: 'sre-engineer',

  // Performance Engineering intent (profiling, load testing, bottlenecks)
  performance_engineer: 'performance-engineer',

  // Penetration Testing intent (security testing, vulnerability scanning, OWASP testing)
  penetration_tester: 'penetration-tester',

  // Accessibility Testing intent (WCAG, a11y, screen reader testing)
  accessibility_tester: 'accessibility-tester',

  // Chaos Engineering intent (failure injection, resilience testing)
  chaos_engineer: 'chaos-engineer',

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
};

/**
 * Get preferred agent for a detected intent.
 * Resolves from ROUTING_TABLE (keyword -> agent) then INTENT_TO_AGENT (intent key -> agent).
 * @param {string} intent
 * @returns {string|null}
 */
function getPreferredAgent(intent) {
  return ROUTING_TABLE[intent] ?? INTENT_TO_AGENT[intent] ?? null;
}

module.exports = {
  ROUTING_TABLE,
  ROUTING_PREFIX_PATTERNS,
  ROUTING_PATTERNS,
  INTENT_KEYWORDS,
  INTENT_TO_AGENT,
  DISAMBIGUATION_RULES,
  getPreferredAgent,
};
