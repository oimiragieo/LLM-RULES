#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const CONTRACT_MARKER = '<!-- agent-template-contract:v1 -->';
const REQUIRED_HEADINGS = ['## Token Saver Invocation Rule'];
const REQUIRED_SKILLS_BASE = ['task-management-protocol'];
const REQUIRED_SKILLS_SEARCH_HEAVY = [
  'ripgrep',
  'code-semantic-search',
  'token-saver-context-compression',
];
const SEARCH_HEAVY_PATTERNS = [/code-semantic-search/, /ripgrep/, /pnpm search:code/];

function isAgentFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutDrive = normalized.replace(/^[A-Za-z]:/, '');
  return (
    /(?:^|\/)\.claude\/agents\/.+\.md$/i.test(withoutDrive) && !/README\.md$/i.test(withoutDrive)
  );
}

function parseFrontmatter(content) {
  if (typeof content !== 'string') return null;
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]) || null;
  } catch {
    return null;
  }
}

function normalizeSkills(frontmatter) {
  if (!frontmatter || frontmatter.skills == null) return [];
  if (Array.isArray(frontmatter.skills)) return frontmatter.skills.filter(Boolean);
  if (typeof frontmatter.skills === 'string') {
    try {
      const parsed = yaml.load(frontmatter.skills);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isSearchHeavyAgent(content, frontmatter) {
  const skills = normalizeSkills(frontmatter);
  if (skills.some(skill => REQUIRED_SKILLS_SEARCH_HEAVY.includes(skill))) return true;
  return SEARCH_HEAVY_PATTERNS.some(pattern => pattern.test(content));
}

function validateAgentContent(content, { requireMarker = true } = {}) {
  const errors = [];
  const warnings = [];

  if (typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, errors: ['Agent content is empty'], warnings, metadata: null };
  }

  const hasMarker = content.includes(CONTRACT_MARKER);
  if (requireMarker && !hasMarker) {
    errors.push(`Missing contract marker: ${CONTRACT_MARKER}`);
  }

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter || typeof frontmatter !== 'object') {
    errors.push('Missing or invalid YAML frontmatter');
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: { hasMarker, isSearchHeavy: false, skills: [] },
    };
  }

  const skills = normalizeSkills(frontmatter);
  for (const skill of REQUIRED_SKILLS_BASE) {
    if (!skills.includes(skill)) {
      errors.push(`Missing required skill: ${skill}`);
    }
  }

  const searchHeavy = isSearchHeavyAgent(content, frontmatter);
  if (searchHeavy) {
    for (const skill of REQUIRED_SKILLS_SEARCH_HEAVY) {
      if (!skills.includes(skill)) {
        errors.push(`Search-heavy agent missing required skill: ${skill}`);
      }
    }
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!content.includes(heading)) {
      errors.push(`Missing required heading: ${heading}`);
    }
  }

  if (!/Use `Skill\(\{ skill: 'token-saver-context-compression' \}\)`/.test(content)) {
    warnings.push(
      'Token Saver Invocation Rule does not include explicit Skill() invocation example'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      hasMarker,
      isSearchHeavy: searchHeavy,
      skills,
    },
  };
}

function validateAgentFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`], warnings: [], metadata: null };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return validateAgentContent(content, options);
}

function shouldEnforceForWrite({ filePath, incomingContent, existingContent }) {
  if (!isAgentFile(filePath)) return false;
  const existingHasMarker =
    typeof existingContent === 'string' && existingContent.includes(CONTRACT_MARKER);
  const incomingHasMarker =
    typeof incomingContent === 'string' && incomingContent.includes(CONTRACT_MARKER);

  // Enforce for new files always; enforce for managed files on updates; allow legacy edits to proceed.
  const exists = typeof existingContent === 'string';
  if (!exists) return true;
  return existingHasMarker || incomingHasMarker;
}

function ensureDirectory(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function renderAgentTemplate({
  name,
  description,
  model = 'sonnet',
  temperature = 0.3,
  tools = [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
    'Skill',
  ],
  skills = [
    'task-management-protocol',
    'ripgrep',
    'code-semantic-search',
    'token-saver-context-compression',
    'verification-before-completion',
  ],
}) {
  return `---
name: ${name}
version: 1.0.0
description: ${description}
model: ${model}
temperature: ${temperature}
context_strategy: lazy_load
maxTurns: 18
permissionMode: default
priority: high
tools:
  [${tools.join(', ')}]
skills:
${skills.map(skill => `  - ${skill}`).join('\n')}
context_files:
  - '@.claude/context/memory/learnings.md'
---
${CONTRACT_MARKER}

# ${name} Agent

## Core Persona

Identity: Specialist agent for ${name}
Style: Direct, evidence-first
Goal: Deliver correct outcomes with search-grounded context.

## Workflow

1. Load relevant skills via Skill().
2. Search before implementing: prefer \`pnpm search:code\`.
3. Keep updates synchronized with TaskUpdate protocol.
4. Validate outputs before completion.

## Token Saver Invocation Rule

Use \`Skill({ skill: 'token-saver-context-compression' })\` only when context pressure is high and normal search+read would over-expand tokens.

Invoke token-saver when ANY of these conditions hold:
- You need to synthesize across many search hits (typically 10+ candidates).
- Retrieved snippets/logs are too large to keep directly in working context.
- You are preparing evidence-heavy handoff/review output and need compact grounding.

Do NOT invoke token-saver for normal small tasks (few files, short snippets); use regular hybrid search + direct reads instead.

## Memory Protocol

Before starting:
\`cat .claude/context/memory/learnings.md\`

After completing:
- Record key learnings/decisions/issues to memory files.
`;
}

function scanAgentFiles(rootDir) {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name.toLowerCase() !== 'readme.md'
      ) {
        out.push(full);
      }
    }
  }
  walk(rootDir);
  return out;
}

module.exports = {
  CONTRACT_MARKER,
  REQUIRED_HEADINGS,
  REQUIRED_SKILLS_BASE,
  REQUIRED_SKILLS_SEARCH_HEAVY,
  isAgentFile,
  parseFrontmatter,
  isSearchHeavyAgent,
  validateAgentContent,
  validateAgentFile,
  shouldEnforceForWrite,
  ensureDirectory,
  renderAgentTemplate,
  scanAgentFiles,
};
