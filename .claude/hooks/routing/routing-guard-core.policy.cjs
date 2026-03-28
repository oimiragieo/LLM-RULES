'use strict';

const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const {
  DOMAIN_SUB_ROUTERS,
  isDomainSubRouterName,
  isHierarchicalRoutingEnabled,
} = require('../../lib/routing/sub-router-selection.cjs');

const ALL_WATCHED_TOOLS = [
  'Glob',
  'Grep',
  'WebSearch',
  'Bash',
  'TaskOutput',
  'Edit',
  'Write',
  'NotebookEdit',
  'Task',
  'TaskCreate',
];

const BLACKLISTED_TOOLS = [
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebSearch',
  'TaskOutput',
];

const ROUTER_BASH_WHITELIST = [
  /^git\s+status(\s+-s|\s+--short)?$/,
  /^git\s+log\s+--oneline\s+-\d{1,2}$/,
  /^git\s+diff\s+--name-only$/,
  /^git\s+branch$/,
  /^echo\s+'[^']*'\s*>>\s*\.claude\/context\/runtime\/session-gap-log\.jsonl$/,
];

const ROUTER_READ_WHITELIST = [
  /^\.claude\/agents\/.+\.md$/,
  /^\.claude\/workflows\/core\/router-decision\.md$/,
  /^\.claude\/docs\/[^/]+\.md$/,
  /^\.claude\/context\/artifacts\/catalogs\/[^/]+$/,
  /^\.claude\/context\/agent-registry\.json$/,
  /^\.claude\/context\/memory\/[^/]+\.md$/,
  /^\.claude\/context\/runtime\/reflection-[^/]+\.txt$/,
  /^\.claude\/context\/runtime\/reflection-spawn-request\.json$/,
  /^\.claude\/context\/runtime\/integration-queue\.jsonl$/,
  /^\.claude\/context\/runtime\/heartbeat-reminder\.txt$/,
  /^\.claude\/context\/runtime\/pipeline-obligations-reminder\.txt$/,
];

const WHITELISTED_TOOLS = ['TaskUpdate', 'TaskList', 'TaskGet', 'Read', 'AskUserQuestion'];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
const IMPLEMENTATION_AGENTS = ['developer', 'qa', 'devops'];
const HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT = [
  'devops',
  'devops-troubleshooter',
  'chaos-engineer',
];

const SPECIALIST_KEYWORD_MAP = {
  'technical-writer': [
    'write documentation',
    'update documentation',
    'update docs',
    'update readme',
    'write docs',
    'api documentation',
    'create docs',
    'document the api',
    'generate documentation',
    'fix documentation',
    'review documentation',
  ],
  'code-simplifier': [
    'refactor for clarity',
    'clean up code',
    'simplify code',
    'reduce complexity',
    'code cleanup',
    'improve readability',
    'simplify the',
    'refactor the',
    'clean up the',
  ],
  'code-reviewer': [
    'review code',
    'code review',
    'pr review',
    'review the pr',
    'review the implementation',
    'audit code',
    'review pull request',
  ],
  qa: [
    'write tests',
    'run tests',
    'test strategy',
    'test coverage',
    'test suite',
    'qa validation',
    'add tests',
    'fix tests',
    'run the tests',
    'test plan',
  ],
  devops: [
    'set up docker',
    'configure ci',
    'deploy to production',
    'deploy to staging',
    'set up deployment',
    'kubernetes config',
    'pipeline config',
    'ci/cd pipeline',
    'infrastructure setup',
    'helm chart',
  ],
  'database-architect': [
    'database schema',
    'schema migration',
    'database migration',
    'query optimization',
    'data model design',
    'create migration',
    'optimize queries',
  ],
  researcher: [
    'research',
    'research options',
    'investigate options',
    'compare alternatives',
    'fact-find',
    'research best practices',
    'explore approaches',
  ],
  'devops-troubleshooter': [
    'debug production',
    'troubleshoot the',
    'diagnose issue',
    'investigate outage',
  ],
  'incident-responder': [
    'production incident',
    'handle outage',
    'incident response',
    'production outage',
    'sre practices',
    'on-call handoff',
    'handle the incident',
    'incident affecting',
  ],
  architect: [
    'design the architecture',
    'system design',
    'architectural decision',
    'choose tech stack',
    'design the system',
    'architecture review',
    'system architecture',
    'migrating to microservices',
  ],
  'security-architect': [
    'security review',
    'threat model',
    'security audit',
    'vulnerability assessment',
    'penetration test',
    'owasp review',
    'audit of the',
    'security of the',
  ],
  pm: [
    'user stories',
    'product requirements',
    'feature roadmap',
    'sprint planning',
    'product backlog',
    'acceptance criteria',
    'write user stories',
    'product requirements for',
  ],
  planner: [
    'break down this',
    'task breakdown',
    'break down the',
    'decompose this',
    'split this into',
    'plan the implementation',
  ],
  'mobile-ux-reviewer': [
    'ux review',
    'accessibility audit',
    'usability review',
    'mobile ux',
    'hig compliance',
    'design critique',
    'ux review of',
    'accessibility of',
  ],
  'c4-context': [
    'c4 context diagram',
    'system context diagram',
    'c4 system context',
    'context diagram for',
  ],
  'c4-container': [
    'c4 container diagram',
    'container architecture',
    'c4 deployment',
    'deployment architecture',
  ],
  'c4-component': [
    'c4 component diagram',
    'component architecture',
    'component boundaries',
    'component diagram for',
  ],
  'c4-code': [
    'c4 code diagram',
    'code-level architecture',
    'c4 code documentation',
    'code documentation for',
  ],
  'data-engineer': [
    'data pipeline',
    'etl pipeline',
    'data transformation',
    'data validation pipeline',
    'analytics pipeline',
    'data infrastructure',
    'build the data pipeline',
  ],
  'ai-ml-specialist': [
    'train model',
    'machine learning model',
    'deep learning',
    'model deployment',
    'mlops pipeline',
    'fine-tune model',
    'train the',
    'recommendation model',
  ],
  'web3-blockchain-expert': [
    'smart contract',
    'solidity contract',
    'defi protocol',
    'blockchain integration',
    'token contract',
    'web3 integration',
    'write the solidity',
  ],
  'scientific-research-expert': [
    'genomic analysis',
    'computational biology',
    'scientific workflow',
    'cheminformatics analysis',
    'research methodology',
    'scientific computing',
    'genomic analysis workflow',
    'variant calling',
  ],
  'gamedev-pro': [
    'game development',
    'game physics',
    'game mechanics',
    'unity project',
    'unreal engine project',
    'godot project',
    'game physics for',
  ],
  'reverse-engineer': [
    'reverse engineer',
    'reverse engineering',
    'decompile the',
    'analyze the legacy',
    'understand the legacy',
    'reverse engineer the legacy',
  ],
  'agent-creator': [
    'create agent',
    'create an agent',
    'new agent',
    'add agent',
    'build agent',
    'make agent',
    'restore agent',
    'create agents',
    'create multiple agents',
    'batch create agents',
  ],
  'skill-creator': [
    'create skill',
    'create a skill',
    'new skill',
    'add skill',
    'build skill',
    'restore skill',
    'create skills',
  ],
  'hook-creator': [
    'create hook',
    'create a hook',
    'new hook',
    'add hook',
    'build hook',
    'create hooks',
  ],
  'workflow-creator': [
    'create workflow',
    'create a workflow',
    'new workflow',
    'add workflow',
    'create workflows',
  ],
  'template-creator': ['create template', 'create a template', 'new template', 'add template'],
  'schema-creator': ['create schema', 'create a schema', 'new schema', 'add schema'],
};

const PLANNER_PATTERNS = {
  prompt: ['you are planner', 'you are the planner', 'as planner'],
  description: ['planner'],
};

const SECURITY_PATTERNS = {
  prompt: ['you are security', 'you are the security', 'security-architect', 'security architect'],
  description: ['security'],
};

const ARCHITECT_PATTERNS = {
  prompt: ['you are architect', 'you are the architect'],
};

const ALWAYS_ALLOWED_WRITE_PATTERNS = [
  /\.claude[/\\]context[/\\]runtime[/\\]/,
  /\.claude[/\\]context[/\\]memory[/\\]/,
  /\.gitkeep$/,
];

function isAlwaysAllowedWrite(filePath) {
  if (!filePath) return false;
  const normalizedPath = path.normalize(filePath);
  return ALWAYS_ALLOWED_WRITE_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

function isPlannerSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();

  for (const pattern of PLANNER_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true;
  }
  for (const pattern of PLANNER_PATTERNS.description) {
    if (description.includes(pattern)) return true;
  }
  return false;
}

function isSecuritySpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();

  for (const pattern of SECURITY_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true;
  }
  for (const pattern of SECURITY_PATTERNS.description) {
    if (description.includes(pattern)) return true;
  }
  return false;
}

function isArchitectSpawn(toolInput = {}) {
  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  if (subagentType === 'architect') {
    return true;
  }

  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const combined = `${prompt} ${description}`;
  if (combined.includes('security-architect') || combined.includes('database-architect')) {
    return false;
  }

  for (const pattern of ARCHITECT_PATTERNS.prompt) {
    if (prompt.includes(pattern)) return true;
  }
  return false;
}

function isCodeSimplifierSpawn(toolInput = {}) {
  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  if (subagentType === 'code-simplifier') {
    return true;
  }

  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const combined = `${prompt} ${description}`;
  return (
    combined.includes('you are code-simplifier') ||
    combined.includes('you are the code-simplifier') ||
    combined.includes('you are code simplifier') ||
    combined.includes('you are the code simplifier') ||
    combined.includes('code-simplifier')
  );
}

function extractSpawnAgentType(toolInput = {}) {
  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  if (subagentType) {
    return subagentType;
  }

  const prompt = (toolInput.prompt || '').toLowerCase();
  const match = prompt.match(/\byou are (?:the )?([a-z0-9-]+)/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return '';
}

function isHighRiskSpecialistSpawn(toolInput = {}) {
  const agentType = extractSpawnAgentType(toolInput);
  return HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT.includes(agentType);
}

function isImplementationAgentSpawn(toolInput) {
  const prompt = (toolInput.prompt || '').toLowerCase();
  return IMPLEMENTATION_AGENTS.some(
    agent => prompt.includes(`you are ${agent}`) || prompt.includes(`you are the ${agent}`)
  );
}

function isWhitelistedBashCommand(command) {
  if (!command || typeof command !== 'string') {
    return false;
  }
  const trimmed = command.trim();
  return ROUTER_BASH_WHITELIST.some(pattern => pattern.test(trimmed));
}

function normalizeRouterReadPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  const trimmed = filePath.trim();
  if (!trimmed) {
    return '';
  }

  let normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (path.isAbsolute(trimmed)) {
    const relativePath = path.relative(PROJECT_ROOT, trimmed);
    if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      normalized = relativePath.replace(/\\/g, '/');
    }
  }

  return normalized.replace(/^\/+/, '');
}

function isWhitelistedRouterReadPath(filePath) {
  const normalizedPath = normalizeRouterReadPath(filePath);
  if (!normalizedPath) {
    return false;
  }
  return ROUTER_READ_WHITELIST.some(pattern => pattern.test(normalizedPath));
}

function extractTaskIdFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return null;
  }
  const match = prompt.match(/Task ID:\s*([a-zA-Z0-9-]+)/i);
  return match ? match[1] : null;
}

module.exports = {
  ALL_WATCHED_TOOLS,
  BLACKLISTED_TOOLS,
  ROUTER_BASH_WHITELIST,
  ROUTER_READ_WHITELIST,
  DOMAIN_SUB_ROUTERS,
  WHITELISTED_TOOLS,
  WRITE_TOOLS,
  IMPLEMENTATION_AGENTS,
  HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT,
  SPECIALIST_KEYWORD_MAP,
  isAlwaysAllowedWrite,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  extractSpawnAgentType,
  isHighRiskSpecialistSpawn,
  isImplementationAgentSpawn,
  isWhitelistedBashCommand,
  isWhitelistedRouterReadPath,
  isDomainSubRouterName,
  isHierarchicalRoutingEnabled,
  extractTaskIdFromPrompt,
};
