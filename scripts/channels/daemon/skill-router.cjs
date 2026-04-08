/**
 * skill-router.cjs — Lightweight coding task classifier for the channel daemon
 *
 * Maps user request keywords to agent types and default verification steps.
 * Subset of .claude/lib/routing/routing-table-core-map.cjs optimized for
 * Telegram-initiated coding tasks.
 */
'use strict';

// Keyword → agent type mapping (ordered by specificity)
const CODING_PATTERNS = [
  { pattern: /\b(tests?|spec|coverage|assert|jest|mocha|pytest)\b/i, agentType: 'qa' },
  { pattern: /\b(review|code review|pr review|pull request)\b/i, agentType: 'code-reviewer' },
  { pattern: /\b(refactor|simplify|clean\s?up|deduplicate)\b/i, agentType: 'code-simplifier' },
  { pattern: /\b(doc|readme|changelog|jsdoc|comment)\b/i, agentType: 'technical-writer' },
  {
    pattern: /\b(deploy|docker|ci|cd|pipeline|github actions|k8s|kubernetes)\b/i,
    agentType: 'devops',
  },
  {
    pattern: /\b(schema|migration|sql|database|table|index|query)\b/i,
    agentType: 'database-architect',
  },
  { pattern: /\b(security|auth|jwt|oauth|xss|csrf|injection)\b/i, agentType: 'security-architect' },
  {
    pattern: /\b(react|vue|svelte|angular|css|tailwind|component|ui|frontend)\b/i,
    agentType: 'frontend-pro',
  },
  { pattern: /\b(python|django|flask|fastapi)\b/i, agentType: 'python-pro' },
  { pattern: /\b(rust|cargo|crate)\b/i, agentType: 'rust-pro' },
  { pattern: /\b(go|golang|goroutine)\b/i, agentType: 'golang-pro' },
  { pattern: /\b(typescript|ts|type\s?script)\b/i, agentType: 'typescript-pro' },
  { pattern: /\b(node|express|nestjs|npm|pnpm)\b/i, agentType: 'nodejs-pro' },
  { pattern: /\b(api|endpoint|rest|graphql|grpc)\b/i, agentType: 'api-designer' },
  { pattern: /\b(architect|design|system design|scalab)\b/i, agentType: 'architect' },
  { pattern: /\b(plan|break down|roadmap|scope)\b/i, agentType: 'planner' },
];

// Non-coding patterns — skip mission executor for these
const NON_CODING_PATTERNS = [
  /\b(search|find|look up|what is|who is|explain|tell me|how does)\b/i,
  /\b(news|trending|weather|stock|price)\b/i,
  /\b(translate|summarize|rewrite|rephrase)\b/i,
  /\b(hello|hi|hey|thanks|bye|good morning)\b/i,
];

// Coding action verbs that indicate implementation work
const CODING_VERBS = [
  /\b(fix|implement|add|create|build|write|update|modify|change|remove|delete|refactor)\b/i,
  /\b(debug|patch|wire|integrate|migrate|upgrade|port|convert)\b/i,
  /\b(set up|scaffold|bootstrap|initialize|configure)\b/i,
];

// Default verification steps per agent type
const VERIFICATION_DEFAULTS = {
  developer: ['pnpm lint:fix', 'pnpm test'],
  qa: ['pnpm test', 'pnpm test:framework'],
  'code-reviewer': [],
  'code-simplifier': ['pnpm lint:fix', 'pnpm test'],
  'technical-writer': ['pnpm lint:md'],
  devops: ['pnpm validate'],
  'database-architect': ['pnpm test'],
  'security-architect': ['pnpm lint:fix', 'pnpm test'],
  'frontend-pro': ['pnpm lint:fix', 'pnpm test'],
  'python-pro': ['python -m pytest'],
  'rust-pro': ['cargo test --workspace', 'cargo clippy --workspace -- -D warnings'],
  'golang-pro': ['go test ./...'],
  'typescript-pro': ['pnpm lint:fix', 'pnpm test'],
  'nodejs-pro': ['pnpm lint:fix', 'pnpm test'],
  'api-designer': ['pnpm lint:fix', 'pnpm test'],
  architect: [],
  planner: [],
};

/**
 * Classify a task description as coding or non-coding.
 *
 * @param {string} text - Task description from user
 * @returns {{ isCoding: boolean, agentType: string, confidence: string }}
 */
function classify(text) {
  if (!text || typeof text !== 'string') {
    return { isCoding: false, agentType: 'general-assistant', confidence: 'none' };
  }

  // Check non-coding patterns first
  for (const pattern of NON_CODING_PATTERNS) {
    if (pattern.test(text) && !CODING_VERBS.some(v => v.test(text))) {
      return { isCoding: false, agentType: 'general-assistant', confidence: 'high' };
    }
  }

  // Check coding patterns
  for (const { pattern, agentType } of CODING_PATTERNS) {
    if (pattern.test(text)) {
      return { isCoding: true, agentType, confidence: 'high' };
    }
  }

  // Check coding verbs (weaker signal — defaults to developer)
  for (const verb of CODING_VERBS) {
    if (verb.test(text)) {
      return { isCoding: true, agentType: 'developer', confidence: 'medium' };
    }
  }

  // Default: not coding
  return { isCoding: false, agentType: 'general-assistant', confidence: 'low' };
}

/**
 * Get default verification steps for an agent type.
 *
 * @param {string} agentType - Agent type from classify()
 * @returns {string[]}
 */
function getVerificationSteps(agentType) {
  return VERIFICATION_DEFAULTS[agentType] || VERIFICATION_DEFAULTS.developer;
}

module.exports = {
  classify,
  getVerificationSteps,
  CODING_PATTERNS,
  CODING_VERBS,
  NON_CODING_PATTERNS,
  VERIFICATION_DEFAULTS,
};
