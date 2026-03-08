'use strict';

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { getEnforcementMode } = libRequire(path.join('utils', 'hook-input.cjs'));

const DEFAULT_EVOLUTION_BUDGET = 3;
const DEFAULT_COOLDOWN_MS = 300000;
const DEFAULT_DEPTH_LIMIT = 5;
const DEFAULT_PATTERN_THRESHOLD = 3;
const DEFAULT_PATTERN_WINDOW_MS = 30 * 60 * 1000;

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

const IMPLEMENTATION_AGENTS = ['developer', 'qa', 'devops'];
const HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT = [
  'devops',
  'devops-troubleshooter',
  'chaos-engineer',
];

const EVOLUTION_TRIGGERS = [
  'agent-creator',
  'skill-creator',
  'workflow-creator',
  'hook-creator',
  'template-creator',
  'schema-creator',
  'create new agent',
  'create new skill',
  'create new workflow',
  'create new hook',
];

const EVOLUTION_TYPES = {
  agent: ['agent-creator', 'create new agent', 'create agent'],
  skill: ['skill-creator', 'create new skill', 'create skill'],
  workflow: ['workflow-creator', 'create new workflow', 'create workflow'],
  hook: ['hook-creator', 'create new hook', 'create hook'],
  template: ['template-creator', 'create new template', 'create template'],
  schema: ['schema-creator', 'create new schema', 'create schema'],
};

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

function extractTaskDescription(toolInput) {
  if (!toolInput) return 'agent task';

  if (toolInput.description) return toolInput.description;
  if (toolInput.prompt) {
    const firstLine = toolInput.prompt.split('\n')[0];
    return firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
  }
  if (toolInput.subagent_type) return `${toolInput.subagent_type} agent`;

  return 'agent task';
}

function extractAgentType(prompt, description, toolInput = null) {
  if (toolInput && toolInput.subagent_type) {
    return toolInput.subagent_type.toLowerCase();
  }

  const combined = `${prompt} ${description}`.toLowerCase();
  const agentTypes = [
    'evolution-orchestrator',
    'master-orchestrator',
    'party-orchestrator',
    'swarm-coordinator',
    'tauri-desktop-developer',
    'expo-mobile-developer',
    'devops-troubleshooter',
    'security-architect',
    'incident-responder',
    'reverse-engineer',
    'database-architect',
    'conductor-validator',
    'code-simplifier',
    'code-reviewer',
    'technical-writer',
    'reflection-agent',
    'context-compressor',
    'ai-ml-specialist',
    'mobile-ux-reviewer',
    'scientific-research',
    'web3-blockchain',
    'android',
    'data-engineer',
    'fastapi',
    'frontend',
    'gamedev',
    'golang',
    'graphql',
    'ios',
    'java',
    'nextjs',
    'nodejs',
    'php',
    'python',
    'rust',
    'sveltekit',
    'typescript',
    'c4-component',
    'c4-container',
    'c4-context',
    'c4-code',
    'researcher',
    'devops',
    'architect',
    'developer',
    'planner',
    'router',
    'pm',
    'qa',
  ];

  for (const type of agentTypes) {
    if (combined.includes(type)) {
      return type;
    }
  }

  const youAreMatch = combined.match(/you are (?:the )?(\w+(?:-\w+)*)/i);
  if (youAreMatch) {
    return youAreMatch[1].toLowerCase();
  }

  return 'unknown';
}

function isEvolutionTrigger(prompt) {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  return EVOLUTION_TRIGGERS.some(t => lower.includes(t.toLowerCase()));
}

function detectEvolutionType(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  for (const [type, patterns] of Object.entries(EVOLUTION_TYPES)) {
    if (patterns.some(p => lower.includes(p))) {
      return type;
    }
  }
  return null;
}

function getDepthLimit() {
  const envDepth = process.env.LOOP_DEPTH_LIMIT;
  if (envDepth) {
    const parsed = parseInt(envDepth, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_DEPTH_LIMIT;
}

function getPatternThreshold() {
  const envThreshold = process.env.LOOP_PATTERN_THRESHOLD;
  if (envThreshold) {
    const parsed = parseInt(envThreshold, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PATTERN_THRESHOLD;
}

function getPatternWindowMs() {
  const envWindowMs = process.env.LOOP_PATTERN_WINDOW_MS;
  if (envWindowMs) {
    const parsed = parseInt(envWindowMs, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PATTERN_WINDOW_MS;
}

function parseIsoToMs(value) {
  if (!value || typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEvolutionBudget() {
  const envBudget = process.env.LOOP_EVOLUTION_BUDGET;
  if (envBudget) {
    const parsed = parseInt(envBudget, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_EVOLUTION_BUDGET;
}

function getCooldownMs() {
  const envCooldown = process.env.LOOP_COOLDOWN_MS;
  if (envCooldown) {
    const parsed = parseInt(envCooldown, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_COOLDOWN_MS;
}

function extractTaskIdFromTaskInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const rawTaskId = toolInput.task_id ?? toolInput.taskId ?? toolInput.id ?? null;
  return rawTaskId != null ? String(rawTaskId) : null;
}

function parseAllowedFilesFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return [];
  const allowed = new Set();

  const directLine = prompt.match(/^\s*ALLOWED_FILES\s*:\s*(.+)$/im);
  if (directLine && directLine[1]) {
    for (const token of directLine[1].split(/[,;]/)) {
      const normalized = String(token || '')
        .trim()
        .replace(/^['"`]|['"`]$/g, '');
      if (normalized) allowed.add(normalized);
    }
  }

  const allowlistSection = prompt.match(
    /##\s*FILE ALLOWLIST[\s\S]{0,2000}?(?=\n##\s+|\n\+={10,100}\+|$)/i
  );
  if (allowlistSection && allowlistSection[0]) {
    const lines = allowlistSection[0].split(/\r?\n/);
    for (const line of lines) {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (!bullet || !bullet[1]) continue;
      const normalized = bullet[1].trim().replace(/^['"`]|['"`]$/g, '');
      if (normalized) allowed.add(normalized);
    }
  }

  return Array.from(allowed);
}

function parseBooleanDirective(prompt, key) {
  if (!prompt || typeof prompt !== 'string') return null;
  const re = new RegExp(`^\\s*${key}\\s*:\\s*(true|false)\\s*$`, 'im');
  const match = prompt.match(re);
  if (!match) return null;
  return match[1].toLowerCase() === 'true';
}

function extractGuardrailPolicy(toolInput) {
  const prompt = toolInput?.prompt || '';
  const inlineAllowed = Array.isArray(toolInput?.allowed_files)
    ? toolInput.allowed_files.map(v => String(v).trim()).filter(Boolean)
    : [];
  const promptAllowed = parseAllowedFilesFromPrompt(prompt);
  const allowedFiles = Array.from(new Set([...inlineAllowed, ...promptAllowed]));

  const explicitAllowGitCommit =
    typeof toolInput?.allow_git_commit === 'boolean'
      ? toolInput.allow_git_commit
      : parseBooleanDirective(prompt, 'ALLOW_GIT_COMMIT');

  return {
    allowedFiles,
    allowGitCommit: explicitAllowGitCommit === true,
  };
}

function hasResumeDirective(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  if (toolInput.resume === true || toolInput.resumeId || toolInput.resume_id) return true;
  const combined = `${toolInput.description || ''}\n${toolInput.prompt || ''}`.toLowerCase();
  if (!combined) return false;
  return /\bresum(?:e|ing)\b/.test(combined);
}

function hasMultiWaveDirective(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const combined = `${toolInput.description || ''}\n${toolInput.prompt || ''}`.toLowerCase();
  if (!combined) return false;
  const matches = combined.match(/\b(?:tier|phase|wave)\s*\d+\b/g) || [];
  return new Set(matches).size >= 2;
}

function checkSpawnRoleGuardrails(toolInput) {
  const resumeMode = getEnforcementMode('TASK_RESUME_ENFORCEMENT', 'block');
  const allowResumeOverride = String(process.env.TASK_ALLOW_AGENT_RESUME || '').toLowerCase();
  if (resumeMode !== 'off' && hasResumeDirective(toolInput) && allowResumeOverride !== 'true') {
    const message =
      '[SPAWN-GUARDRAIL] Resume-style spawn detected. Spawn a fresh agent instead of resume.';
    if (resumeMode === 'block') {
      return { pass: false, result: 'block', message };
    }
    return { pass: true, warnings: [message] };
  }

  const singlePurposeMode = getEnforcementMode('TASK_SINGLE_PURPOSE_ENFORCEMENT', 'block');
  if (singlePurposeMode !== 'off' && hasMultiWaveDirective(toolInput)) {
    const message =
      '[SPAWN-GUARDRAIL] Multi-wave task detected in one spawn prompt. Use one focused objective per agent task.';
    if (singlePurposeMode === 'block') {
      return { pass: false, result: 'block', message };
    }
    return { pass: true, warnings: [message] };
  }

  return { pass: true };
}

/**
 * Returns true when the prompt signals update/refresh intent (not creation intent).
 * Used to bypass creator-specialist cooldowns and routing blocks for updater spawns.
 * Checks for -updater suffix or update/updating + artifact word in the same sentence.
 */
function hasUpdateIntent(prompt) {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  return (
    /-updater\b/.test(lower) ||
    lower
      .split(/[.!?\n]+/)
      .some(
        sentence =>
          /\bupdat/.test(sentence) &&
          /\b(?:skill|agent|hook|workflow|template|schema)\b/.test(sentence)
      )
  );
}

module.exports = {
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  ARCHITECT_PATTERNS,
  IMPLEMENTATION_AGENTS,
  HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  extractSpawnAgentType,
  isHighRiskSpecialistSpawn,
  isImplementationAgentSpawn,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  hasUpdateIntent,
  getDepthLimit,
  getPatternThreshold,
  getPatternWindowMs,
  parseIsoToMs,
  getEvolutionBudget,
  getCooldownMs,
  extractTaskIdFromTaskInput,
  parseAllowedFilesFromPrompt,
  extractGuardrailPolicy,
  hasResumeDirective,
  hasMultiWaveDirective,
  checkSpawnRoleGuardrails,
};
