'use strict';

const { ROUTING_TABLE } = require('./routing-table-core-map.cjs');

const CORE_DIRECT_ROUTE_AGENTS = Object.freeze([
  'developer',
  'planner',
  'architect',
  'qa',
  'general-assistant',
  'code-reviewer',
  'code-simplifier',
  'technical-writer',
  'researcher',
  'context-compressor',
]);

const META_ORCHESTRATION_AGENTS = Object.freeze([
  'master-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
  'evolution-orchestrator',
  'heartbeat-orchestrator',
  'loop-operator',
  'artifact-integrator',
  'reflection-agent',
  'memory-manager',
  'task-manager',
  'cron-scheduler-agent',
  'telegram-channel-agent',
  'ecosystem-auditor',
  'conductor-validator',
  'claude-md-auditor',
  'channel-responder',
]);

const PRESERVED_DIRECT_ROUTE_AGENTS = Object.freeze([
  ...CORE_DIRECT_ROUTE_AGENTS,
  ...META_ORCHESTRATION_AGENTS,
]);

const DOMAIN_ROUTERS = Object.freeze({
  'web-frontend': 'domain-router-web-frontend',
  'backend-languages': 'domain-router-backend',
  'mobile-desktop': 'domain-router-mobile',
  'ai-ml': 'domain-router-ai-ml',
  'infra-devops': 'domain-router-infra',
  'security-quality': 'domain-router-security',
  'architecture-data': 'domain-router-arch-data',
  'product-business': 'domain-router-product',
  'specialized-niche': 'domain-router-niche',
});

const DIRECT_AGENT_ALIASES = Object.freeze({
  developer: 'developer',
  planner: 'planner',
  architect: 'architect',
  qa: 'qa',
  'general-assistant': 'general-assistant',
  'code-reviewer': 'code-reviewer',
  'code-simplifier': 'code-simplifier',
  'technical-writer': 'technical-writer',
  researcher: 'researcher',
  'context-compressor': 'context-compressor',
  'artifact-integrator': 'artifact-integrator',
  'master-orchestrator': 'master-orchestrator',
  'swarm-coordinator': 'swarm-coordinator',
  'party-orchestrator': 'party-orchestrator',
  'memory-manager': 'memory-manager',
  'conductor-validator': 'conductor-validator',
  'evolution-orchestrator': 'master-orchestrator',
  'heartbeat-orchestrator': 'master-orchestrator',
  'loop-operator': 'master-orchestrator',
  'reflection-agent': 'memory-manager',
  'task-manager': 'planner',
  'cron-scheduler-agent': 'cron-scheduler-agent',
  'telegram-channel-agent': 'telegram-channel-agent',
  'ecosystem-auditor': 'conductor-validator',
  'claude-md-auditor': 'conductor-validator',
  'channel-responder': 'general-assistant',
});

const AGENT_TO_DOMAIN = Object.freeze({
  'frontend-pro': 'web-frontend',
  'nextjs-pro': 'web-frontend',
  'angular-pro': 'web-frontend',
  'sveltekit-expert': 'web-frontend',
  'wordpress-master': 'web-frontend',

  'python-pro': 'backend-languages',
  'typescript-pro': 'backend-languages',
  'golang-pro': 'backend-languages',
  'rust-pro': 'backend-languages',
  'java-pro': 'backend-languages',
  'kotlin-pro': 'backend-languages',
  'php-pro': 'backend-languages',
  'dotnet-pro': 'backend-languages',
  'swift-pro': 'backend-languages',
  'nodejs-pro': 'backend-languages',
  'rails-pro': 'backend-languages',
  'spring-boot-pro': 'backend-languages',
  'django-developer': 'backend-languages',
  'fastapi-pro': 'backend-languages',

  'ios-pro': 'mobile-desktop',
  'android-pro': 'mobile-desktop',
  'expo-mobile-developer': 'mobile-desktop',
  'tauri-desktop-developer': 'mobile-desktop',
  'mobile-ux-reviewer': 'mobile-desktop',

  'ai-ml-specialist': 'ai-ml',
  'llm-architect': 'ai-ml',
  'data-engineer': 'ai-ml',
  'data-scientist': 'ai-ml',
  'ml-researcher': 'ai-ml',
  'mlops-engineer': 'ai-ml',
  'nlp-engineer': 'ai-ml',
  'prompt-engineer': 'ai-ml',
  'mcp-developer': 'ai-ml',
  'multi-llm-consultant': 'ai-ml',
  'model-benchmarker-agent': 'ai-ml',

  devops: 'infra-devops',
  'devops-troubleshooter': 'infra-devops',
  'kubernetes-specialist': 'infra-devops',
  'terraform-engineer': 'infra-devops',
  'terragrunt-pro': 'infra-devops',
  'azure-infra-pro': 'infra-devops',
  'windows-infra-pro': 'infra-devops',
  'sre-engineer': 'infra-devops',
  'incident-responder': 'infra-devops',
  'm365-admin': 'infra-devops',

  'security-architect': 'security-quality',
  'penetration-tester': 'security-quality',
  'chaos-engineer': 'security-quality',
  'reverse-engineer': 'security-quality',
  'advanced-debugging': 'security-quality',
  'performance-engineer': 'security-quality',
  'accessibility-tester': 'security-quality',
  'compliance-checker': 'security-quality',

  'api-designer': 'architecture-data',
  'graphql-pro': 'architecture-data',
  'microservices-architect': 'architecture-data',
  'database-architect': 'architecture-data',
  'sql-pro': 'architecture-data',
  'postgres-pro': 'architecture-data',
  'c4-context': 'architecture-data',
  'c4-container': 'architecture-data',
  'c4-component': 'architecture-data',
  'c4-code': 'architecture-data',
  'iot-engineer': 'architecture-data',

  pm: 'product-business',
  'pm-coordinator': 'product-business',
  'product-manager': 'product-business',
  'business-analyst': 'product-business',
  'technical-program-manager': 'product-business',
  'marketing-strategist': 'product-business',
  'ux-researcher': 'product-business',
  'brand-guardian': 'product-business',
  'feedback-synthesizer': 'product-business',
  'legal-advisor': 'product-business',
  'quant-analyst': 'product-business',
  'aso-specialist': 'product-business',
  'voice-replicator-agent': 'product-business',
  'forum-monitor-agent': 'product-business',
  'post-analyzer-agent': 'product-business',

  'web3-blockchain-expert': 'specialized-niche',
  'gamedev-pro': 'specialized-niche',
  'medical-research-triage': 'specialized-niche',
  'scientific-research-expert': 'specialized-niche',
  'legacy-modernizer': 'specialized-niche',
  'app-generator-agent': 'specialized-niche',
  'context-manager': 'specialized-niche',
});

function getHierarchicalEntryForAgent(agentId) {
  const directAgent = DIRECT_AGENT_ALIASES[agentId];
  if (directAgent) {
    return { type: 'direct', agent: directAgent };
  }

  const domain = AGENT_TO_DOMAIN[agentId];
  if (domain) {
    return {
      type: 'domain',
      domain,
      router: DOMAIN_ROUTERS[domain],
    };
  }

  throw new Error(`Missing hierarchical routing mapping for agent: ${agentId}`);
}

function buildDomainRoutingTable(flatRoutingTable = ROUTING_TABLE) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(flatRoutingTable).map(([keyword, agentId]) => [
        keyword,
        getHierarchicalEntryForAgent(agentId),
      ])
    )
  );
}

const DOMAIN_ROUTING_TABLE = buildDomainRoutingTable();
const UNIQUE_ROUTING_TARGETS = Object.freeze(
  [...new Set(Object.values(DOMAIN_ROUTING_TABLE).map(entry => entry.agent || entry.router))].sort()
);

function isPreservedDirectRouteAgent(agentId) {
  return PRESERVED_DIRECT_ROUTE_AGENTS.includes(
    String(agentId || '')
      .trim()
      .toLowerCase()
  );
}

module.exports = {
  DOMAIN_ROUTING_TABLE,
  DOMAIN_ROUTERS,
  CORE_DIRECT_ROUTE_AGENTS,
  META_ORCHESTRATION_AGENTS,
  PRESERVED_DIRECT_ROUTE_AGENTS,
  DIRECT_AGENT_ALIASES,
  AGENT_TO_DOMAIN,
  UNIQUE_ROUTING_TARGETS,
  buildDomainRoutingTable,
  getHierarchicalEntryForAgent,
  isPreservedDirectRouteAgent,
};
