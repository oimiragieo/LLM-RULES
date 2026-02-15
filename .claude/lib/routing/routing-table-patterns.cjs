'use strict';

const ROUTING_PREFIX_PATTERNS = [
  { pattern: 'reactjs', agent: 'frontend-pro' },
  { pattern: 'nextjs', agent: 'nextjs-pro' },
  { pattern: 'nodejs', agent: 'nodejs-pro' },
  { pattern: 'sveltekit', agent: 'sveltekit-expert' },
  { pattern: 'vuejs', agent: 'frontend-pro' },
  { pattern: 'fastapi', agent: 'fastapi-pro' },
];

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
  pm: [{ pattern: /^(prd|product\s*req|user\s*stor|backlog|sprint|prioriti)/i, priority: 3 }],
};

module.exports = { ROUTING_PREFIX_PATTERNS, ROUTING_PATTERNS };
