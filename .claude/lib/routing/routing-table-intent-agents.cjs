'use strict';

const INTENT_TO_AGENT = {
  // Core agents
  architect: 'architect',
  context_compressor: 'context-compressor',
  developer: 'developer',
  planner: 'planner',
  pm: 'pm',
  technical_program_manager: 'technical-program-manager',
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
  'artifact-integrator': 'artifact-integrator',
  external_integration: 'artifact-integrator',
  artifact_integrator: 'artifact-integrator',
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

  // Assimilate intent (codebase extraction, benchmarking - uses assimilate skill)
  assimilate: 'evolution-orchestrator',

  // Artifact Integration (routes to artifact-integrator for analysis)
  'artifact-integration': 'artifact-integrator',

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
  powershell_expert: 'powershell-expert',
  'powershell-expert': 'powershell-expert',

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

module.exports = { INTENT_TO_AGENT };
