'use strict';

const INTENT_KEYWORDS = {
  // === HIGH PRIORITY INTENTS ===
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
  'artifact-integrator': [
    'artifact-integrator',
    'artifact-integration',
    'external-resource-integration',
    'repo-ingestion',
    'github-repo-integration',
    'skill-mapping',
    'integrate repo',
    'github.com/',
    'https://',
    'repository',
    'repo',
  ],

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
  technical_program_manager: [
    'technical program manager',
    'tpm',
    'program plan',
    'cross-team dependency',
    'dependency management',
    'milestone tracking',
    'raid log',
    'delivery governance',
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
  code_reviewer: [
    'code review',
    'pr review',
    'pull request',
    'review code',
    'bug hunt',
    'find bugs',
    'scan for issues',
    'code audit',
  ],
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
    'vulnerability search',
    'security audit',
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

  // === ASSIMILATE INTENT (routes to evolution-orchestrator for codebase extraction) ===
  assimilate: [
    'assimilate',
    'extract from codebase',
    'deep dive codebase',
    'benchmark against',
    'compare frameworks',
    'adopt best ideas',
    'pull features',
    'learn from codebase',
    'codebase analysis',
    'extract patterns',
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
  'powershell-expert': [
    'powershell-expert',
    'powershell',
    'expert',
    'scripting',
    'automation',
    'module development',
    'cross platform',
    'pwsh',
  ],
  'qa-guardian': ['qa-guardian', 'qa', 'guardian', 'quality', 'gate', 'agent'],
  'contract-check': ['contract-check', 'contract', 'check', 'agent'],
  'bool-action': ['bool-action', 'bool', 'action', 'boolean', 'mode'],
  'repo-onboarder': [
    'repo-onboarder',
    'repo',
    'onboarder',
    'repository',
    'integration',
    'orchestrator',
  ],
  'reflection-agent': ['reflection-agent', 'reflection', 'agent'],
  'enterprise-skill-test-1771395136358': [
    'enterprise-skill-test-1771395136358',
    'enterprise',
    'skill',
    'test',
    '1771395136358',
    'scaffold',
    'validation',
    'coverage',
    'reliability',
    'checks',
  ],
  tdd: ['tdd'],
};

module.exports = { INTENT_KEYWORDS };
