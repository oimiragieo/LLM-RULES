'use strict';

const path = require('path');

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

const BLACKLISTED_TOOLS = ['Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'WebSearch', 'TaskOutput'];

const ROUTER_BASH_WHITELIST = [
  /^git\s+status(\s+-s|\s+--short)?$/,
  /^git\s+log\s+--oneline\s+-\d{1,2}$/,
  /^git\s+diff\s+--name-only$/,
  /^git\s+branch$/,
];

const WHITELISTED_TOOLS = ['TaskUpdate', 'TaskList', 'TaskGet', 'Read', 'AskUserQuestion'];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
const IMPLEMENTATION_AGENTS = ['developer', 'qa', 'devops'];

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
  WHITELISTED_TOOLS,
  WRITE_TOOLS,
  IMPLEMENTATION_AGENTS,
  SPECIALIST_KEYWORD_MAP,
  isAlwaysAllowedWrite,
  isPlannerSpawn,
  isSecuritySpawn,
  isImplementationAgentSpawn,
  isWhitelistedBashCommand,
  extractTaskIdFromPrompt,
};
