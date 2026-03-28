'use strict';

const DOMAIN_SUB_ROUTERS = Object.freeze([
  'domain-router-web-frontend',
  'domain-router-backend',
  'domain-router-mobile',
  'domain-router-ai-ml',
  'domain-router-infra',
  'domain-router-security',
  'domain-router-arch-data',
  'domain-router-product',
  'domain-router-niche',
]);

const SUB_ROUTER_CONFIG = Object.freeze({
  'domain-router-web-frontend': Object.freeze({
    domain: 'web-frontend',
    defaultAgent: 'frontend-pro',
    rules: Object.freeze([
      { agent: 'nextjs-pro', signals: ['next.js', 'nextjs', 'app router', 'server component', 'rsc', 'vercel'] },
      { agent: 'angular-pro', signals: ['angular', 'ngrx', 'rxjs', 'standalone component'] },
      { agent: 'sveltekit-expert', signals: ['sveltekit', 'svelte', 'load function'] },
      { agent: 'wordpress-master', signals: ['wordpress', 'woocommerce', 'gutenberg', 'wp-admin'] },
      { agent: 'frontend-pro', signals: ['react', 'vue', 'tailwind', 'css', 'html'] },
    ]),
  }),
  'domain-router-backend': Object.freeze({
    domain: 'backend-languages',
    defaultAgent: 'typescript-pro',
    rules: Object.freeze([
      { agent: 'fastapi-pro', signals: ['fastapi', 'pydantic', 'starlette', 'asgi'] },
      { agent: 'django-developer', signals: ['django', 'drf', 'manage.py', 'urls.py'] },
      { agent: 'spring-boot-pro', signals: ['spring boot', '@springbootapplication', 'application.yml', 'spring mvc'] },
      { agent: 'nodejs-pro', signals: ['nestjs', 'express', 'node.js', 'nodejs', 'node ', 'package.json'] },
      { agent: 'rails-pro', signals: ['rails', 'activerecord', 'gemfile'] },
      { agent: 'php-pro', signals: ['laravel', 'symfony', 'composer', 'php'] },
      { agent: 'python-pro', signals: ['python', 'pytest', 'poetry', 'pip', '.py'] },
      { agent: 'typescript-pro', signals: ['typescript', 'tsconfig', 'decorator', '.ts'] },
      { agent: 'golang-pro', signals: ['golang', 'go ', 'go.mod', 'goroutine'] },
      { agent: 'rust-pro', signals: ['rust', 'cargo', 'lifetimes', 'ownership'] },
      { agent: 'java-pro', signals: ['java', 'maven', 'gradle', 'jvm'] },
      { agent: 'kotlin-pro', signals: ['ktor', 'coroutines', 'kotlin'] },
      { agent: 'dotnet-pro', signals: ['asp.net', '.net', 'c#', '.csproj', 'dotnet'] },
      { agent: 'swift-pro', signals: ['server-side swift', 'package.swift', 'swift'] },
    ]),
  }),
  'domain-router-mobile': Object.freeze({
    domain: 'mobile-desktop',
    defaultAgent: 'expo-mobile-developer',
    rules: Object.freeze([
      { agent: 'ios-pro', signals: ['swiftui', 'xcode', 'ios', 'iphone', 'ipad'] },
      { agent: 'android-pro', signals: ['jetpack compose', 'android', 'gradle', 'adb', 'androidx'] },
      { agent: 'expo-mobile-developer', signals: ['react native', 'expo'] },
      { agent: 'tauri-desktop-developer', signals: ['tauri', 'desktop app', 'desktop shell'] },
      { agent: 'mobile-ux-reviewer', signals: ['mobile ux', 'usability', 'hig', 'mobile accessibility', 'design critique'] },
    ]),
  }),
  'domain-router-ai-ml': Object.freeze({
    domain: 'ai-ml',
    defaultAgent: 'ai-ml-specialist',
    rules: Object.freeze([
      { agent: 'llm-architect', signals: ['rag', 'langchain', 'llamaindex', 'retrieval', 'vector store', 'inference pipeline'] },
      { agent: 'prompt-engineer', signals: ['few-shot', 'few shot', 'system prompt', 'prompt optimization', 'prompt tuning'] },
      { agent: 'data-engineer', signals: ['etl', 'data warehouse', 'dbt', 'stream processing', 'feature pipeline'] },
      { agent: 'data-scientist', signals: ['pandas', 'statistics', 'visualization', 'regression analysis', 'hypothesis test'] },
      { agent: 'ml-researcher', signals: ['research paper', 'ablation', 'novel architecture', 'experiment design'] },
      { agent: 'mlops-engineer', signals: ['mlflow', 'model registry', 'deploy model', 'serving', 'model monitoring'] },
      { agent: 'nlp-engineer', signals: ['named entity recognition', 'ner', 'tokenization', 'sentiment analysis', 'nlp'] },
      { agent: 'mcp-developer', signals: ['model context protocol', 'mcp server', 'mcp client', 'mcp'] },
      { agent: 'multi-llm-consultant', signals: ['compare llms', 'llm council', 'model comparison', 'choose the best model'] },
      { agent: 'model-benchmarker-agent', signals: ['benchmark', 'eval harness', 'evaluate model', 'model benchmark'] },
      { agent: 'ai-ml-specialist', signals: ['pytorch', 'tensorflow', 'fine-tune', 'train model', 'machine learning', 'deep learning'] },
    ]),
  }),
  'domain-router-infra': Object.freeze({
    domain: 'infra-devops',
    defaultAgent: 'devops',
    rules: Object.freeze([
      { agent: 'incident-responder', signals: ['pagerduty', 'incident', 'outage', 'sev1', 'mitigation'] },
      { agent: 'sre-engineer', signals: ['slo', 'sli', 'error budget', 'reliability', 'capacity planning'] },
      { agent: 'kubernetes-specialist', signals: ['kubernetes', 'k8s', 'helm', 'argocd', 'kubectl', 'cluster'] },
      { agent: 'terraform-engineer', signals: ['terraform', 'iac module', '.tf', 'terraform plan'] },
      { agent: 'terragrunt-pro', signals: ['terragrunt'] },
      { agent: 'azure-infra-pro', signals: ['azure', 'aks', 'bicep'] },
      { agent: 'windows-infra-pro', signals: ['windows server', 'powershell remoting', 'active directory'] },
      { agent: 'm365-admin', signals: ['microsoft 365', 'm365', 'exchange online', 'sharepoint'] },
      { agent: 'devops-troubleshooter', signals: ['troubleshoot production', 'debug deployment', 'pipeline failure', 'broken deploy'] },
      { agent: 'devops', signals: ['ci/cd', 'docker', 'container', 'release automation'] },
    ]),
  }),
  'domain-router-security': Object.freeze({
    domain: 'security-quality',
    defaultAgent: 'security-architect',
    rules: Object.freeze([
      { agent: 'penetration-tester', signals: ['xss', 'sql injection', 'penetration test', 'auth bypass', 'owasp'] },
      { agent: 'chaos-engineer', signals: ['chaos engineering', 'failure injection', 'game day', 'resilience test'] },
      { agent: 'reverse-engineer', signals: ['reverse engineer', 'decompile', 'binary analysis', 'firmware'] },
      { agent: 'advanced-debugging', signals: ['race condition', 'heap dump', 'segfault', 'thread dump', 'root cause'] },
      { agent: 'performance-engineer', signals: ['load test', 'profiling', 'latency', 'throughput', 'performance'] },
      { agent: 'accessibility-tester', signals: ['wcag', 'screen reader', 'keyboard navigation', 'color contrast', 'a11y'] },
      { agent: 'compliance-checker', signals: ['gdpr', 'soc 2', 'hipaa', 'regulatory', 'compliance'] },
      { agent: 'security-architect', signals: ['threat model', 'security architecture', 'secure design'] },
    ]),
  }),
  'domain-router-arch-data': Object.freeze({
    domain: 'architecture-data',
    defaultAgent: 'api-designer',
    rules: Object.freeze([
      { agent: 'graphql-pro', signals: ['graphql', 'apollo', 'federation', 'schema stitching'] },
      { agent: 'microservices-architect', signals: ['microservices', 'service mesh', 'bounded context', 'event sourcing', 'cqrs'] },
      { agent: 'postgres-pro', signals: ['postgres', 'postgresql', 'vacuum', 'index bloat'] },
      { agent: 'sql-pro', signals: ['sql query', 'query plan', 'join optimization', 'window function'] },
      { agent: 'database-architect', signals: ['database schema', 'data model', 'er diagram', 'schema design'] },
      { agent: 'c4-context', signals: ['c4 context', 'system context diagram'] },
      { agent: 'c4-container', signals: ['c4 container', 'container diagram'] },
      { agent: 'c4-component', signals: ['c4 component', 'component diagram'] },
      { agent: 'c4-code', signals: ['c4 code', 'code diagram'] },
      { agent: 'iot-engineer', signals: ['iot', 'mqtt', 'edge device', 'telemetry gateway'] },
      { agent: 'api-designer', signals: ['openapi', 'rest', 'grpc', 'endpoint design'] },
    ]),
  }),
  'domain-router-product': Object.freeze({
    domain: 'product-business',
    defaultAgent: 'pm-coordinator',
    rules: Object.freeze([
      { agent: 'ux-researcher', signals: ['user interview', 'usability study', 'research synthesis', 'persona'] },
      { agent: 'marketing-strategist', signals: ['growth campaign', 'marketing funnel', 'go to market', 'content strategy'] },
      { agent: 'brand-guardian', signals: ['brand voice', 'brand guideline', 'tone consistency'] },
      { agent: 'feedback-synthesizer', signals: ['feedback analysis', 'voice of customer', 'survey synthesis'] },
      { agent: 'legal-advisor', signals: ['contract review', 'terms of service', 'privacy policy', 'licensing'] },
      { agent: 'quant-analyst', signals: ['pricing model', 'risk model', 'forecasting', 'quant'] },
      { agent: 'aso-specialist', signals: ['app store optimization', 'aso', 'app listing'] },
      { agent: 'voice-replicator-agent', signals: ['voice replication', 'match voice', 'style transfer'] },
      { agent: 'forum-monitor-agent', signals: ['community moderation', 'forum monitoring', 'discord sentiment'] },
      { agent: 'post-analyzer-agent', signals: ['social post analysis', 'content performance', 'post engagement'] },
      { agent: 'technical-program-manager', signals: ['raid log', 'cross-functional dependency', 'milestone tracking', 'program management'] },
      { agent: 'business-analyst', signals: ['stakeholder requirement', 'business case', 'process mapping'] },
      { agent: 'product-manager', signals: ['product strategy', 'roadmap strategy', 'positioning'] },
      { agent: 'pm', signals: ['prd', 'user story', 'acceptance criteria', 'backlog'] },
      { agent: 'pm-coordinator', signals: ['sprint planning', 'kanban', 'agile delivery', 'project coordination'] },
    ]),
  }),
  'domain-router-niche': Object.freeze({
    domain: 'specialized-niche',
    defaultAgent: 'scientific-research-expert',
    rules: Object.freeze([
      { agent: 'web3-blockchain-expert', signals: ['solidity', 'web3', 'blockchain', 'defi', 'smart contract'] },
      { agent: 'gamedev-pro', signals: ['unity', 'unreal', 'godot', 'game loop', 'game physics'] },
      { agent: 'medical-research-triage', signals: ['clinical', 'symptom', 'drug interaction', 'medical literature'] },
      { agent: 'legacy-modernizer', signals: ['legacy code', 'strangler fig', 'modernization', 'monolith upgrade'] },
      { agent: 'app-generator-agent', signals: ['scaffold app', 'generate app', 'bootstrap app', 'prototype app'] },
      { agent: 'context-manager', signals: ['context window', 'session memory', 'context management'] },
      { agent: 'scientific-research-expert', signals: ['genomics', 'simulation', 'academic', 'research workflow'] },
    ]),
  }),
});

function normalizeAgentId(agentId) {
  return String(agentId || '')
    .trim()
    .toLowerCase();
}

function normalizePrompt(prompt) {
  return String(prompt || '').toLowerCase();
}

function isHierarchicalRoutingEnabled() {
  return String(process.env.HIERARCHICAL_ROUTING || 'off').trim().toLowerCase() === 'on';
}

function isDomainSubRouterName(agentId) {
  return DOMAIN_SUB_ROUTERS.includes(normalizeAgentId(agentId));
}

function getHookAgentId(hookInput = {}, toolInput = {}) {
  return normalizeAgentId(
    hookInput?.agent_id ||
      hookInput?.agentId ||
      hookInput?.current_agent ||
      hookInput?.currentAgent ||
      toolInput?.current_agent ||
      toolInput?.currentAgent ||
      process.env.CLAUDE_AGENT_ID
  );
}

function getRequestedAgentId(toolInput = {}) {
  return normalizeAgentId(toolInput?.subagent_type || toolInput?.agent_type);
}

function getHierarchicalTaskContext(hookInput = {}, toolInput = {}) {
  const currentAgent = getHookAgentId(hookInput, toolInput);
  const targetAgent = getRequestedAgentId(toolInput);
  const currentIsSubRouter = isDomainSubRouterName(currentAgent);
  const targetIsSubRouter = isDomainSubRouterName(targetAgent);

  return {
    currentAgent,
    targetAgent,
    currentIsSubRouter,
    targetIsSubRouter,
    allowSubRouterToSpecialist:
      isHierarchicalRoutingEnabled() && currentIsSubRouter && Boolean(targetAgent) && !targetIsSubRouter,
  };
}

function validateHierarchicalTaskContext(hookInput = {}, toolInput = {}) {
  const context = getHierarchicalTaskContext(hookInput, toolInput);
  if (!isHierarchicalRoutingEnabled() || !context.currentIsSubRouter) {
    return { pass: true, context };
  }

  if (context.targetIsSubRouter) {
    return {
      pass: false,
      result: 'block',
      message:
        `[HIERARCHICAL ROUTING] Circular sub-router dispatch blocked. ` +
        `${context.currentAgent} must delegate directly to a specialist, not ${context.targetAgent}.`,
      context,
    };
  }

  return { pass: true, context };
}

function getSubRouterConfig(subRouterName) {
  const normalized = normalizeAgentId(subRouterName);
  const config = SUB_ROUTER_CONFIG[normalized];
  if (!config) {
    throw new Error(`Unknown sub-router: ${subRouterName}`);
  }
  return config;
}

function countSignalMatches(promptLower, signals = []) {
  return signals.reduce((count, signal) => {
    const normalizedSignal = String(signal || '').toLowerCase();
    return normalizedSignal && promptLower.includes(normalizedSignal) ? count + 1 : count;
  }, 0);
}

function selectSubRouterAgent(subRouterName, prompt) {
  const config = getSubRouterConfig(subRouterName);
  const originalPrompt = String(prompt || '');
  const promptLower = normalizePrompt(originalPrompt);

  let bestRule = null;
  let bestScore = 0;

  for (const rule of config.rules) {
    const matches = countSignalMatches(promptLower, rule.signals);
    if (matches === 0) continue;

    const longestSignal = Math.max(
      ...rule.signals.map(signal => String(signal || '').trim().length),
      0
    );
    const score = matches * 100 + longestSignal;
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  const selectedAgent = bestRule?.agent || config.defaultAgent;
  return {
    subRouter: normalizeAgentId(subRouterName),
    domain: config.domain,
    agent: selectedAgent,
    defaulted: !bestRule,
    originalPrompt,
  };
}

function buildSubRouterTaskPayload(subRouterName, prompt) {
  const selection = selectSubRouterAgent(subRouterName, prompt);
  return {
    subagent_type: selection.agent,
    description: selection.originalPrompt,
    prompt: selection.originalPrompt,
  };
}

function getFlatRoutingFallbackAgent(prompt) {
  const { classifyIntent } = require('./intent-classifier.cjs');
  const classification = classifyIntent(prompt);
  return classification.defaultAgent || 'developer';
}

function resolveHierarchicalDispatch({ subRouterName, prompt, executor } = {}) {
  const originalPrompt = String(prompt || '');
  try {
    const selection = selectSubRouterAgent(subRouterName, originalPrompt);
    if (typeof executor === 'function') {
      executor(selection);
    }
    return {
      route: 'hierarchical',
      subRouter: selection.subRouter,
      domain: selection.domain,
      agent: selection.agent,
      defaulted: selection.defaulted,
      originalPrompt,
    };
  } catch (error) {
    return {
      route: 'flat-fallback',
      subRouter: normalizeAgentId(subRouterName),
      agent: getFlatRoutingFallbackAgent(originalPrompt),
      fallbackReason: error?.message || 'sub-router dispatch failed',
      originalPrompt,
    };
  }
}

module.exports = {
  DOMAIN_SUB_ROUTERS,
  SUB_ROUTER_CONFIG,
  isHierarchicalRoutingEnabled,
  isDomainSubRouterName,
  getHookAgentId,
  getRequestedAgentId,
  getHierarchicalTaskContext,
  validateHierarchicalTaskContext,
  getSubRouterConfig,
  selectSubRouterAgent,
  buildSubRouterTaskPayload,
  getFlatRoutingFallbackAgent,
  resolveHierarchicalDispatch,
};
