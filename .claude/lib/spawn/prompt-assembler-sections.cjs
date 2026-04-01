#!/usr/bin/env node
'use strict';

const DEFAULT_SKILL_SECTION_MODE = 'full';

// ============================================================
// Memoization state — keyed by JSON.stringify of inputs
// ============================================================

/** @type {Map<string,string>} */
const _toolsSectionCache = new Map();
/** @type {Map<string,string>} */
const _skillsSectionCache = new Map();
/** @type {string|null} */
let _discoveryCache = null;

/** Internal build-count tracking (for testing / observability) */
let _buildCounts = { toolsSection: 0, skillsSection: 0, discoverySection: 0 };

/**
 * Clear all memoized section caches and reset build counters.
 * Call this after compaction or whenever the underlying data changes.
 */
function _clearSectionCache() {
  _toolsSectionCache.clear();
  _skillsSectionCache.clear();
  _discoveryCache = null;
  _buildCounts = { toolsSection: 0, skillsSection: 0, discoverySection: 0 };
}

/**
 * Return a snapshot of the build counts since last cache clear.
 * Useful in tests to verify memoization hit/miss behaviour.
 * @returns {{ toolsSection: number, skillsSection: number, discoverySection: number }}
 */
function _getSectionBuildCounts() {
  return { ..._buildCounts };
}

function normalizeSkillSectionMode(mode) {
  const value = String(mode || DEFAULT_SKILL_SECTION_MODE)
    .trim()
    .toLowerCase();
  if (value === 'names-only' || value === 'names_only' || value === 'compact') {
    return 'names_only';
  }
  return 'full';
}

function _computeToolsSection(describedTools) {
  const totalTools = describedTools.length;
  const availableCount = describedTools.filter(t => t.status === 'available').length;

  let section = `## AVAILABLE_TOOLS (${availableCount}/${totalTools} tools available)\n\n`;
  section += 'Tools your agent can use directly:\n\n';

  for (const tool of describedTools) {
    const statusIcon =
      tool.status === 'available'
        ? 'Available'
        : tool.status === 'unavailable'
          ? 'Unavailable'
          : 'Unknown';
    section += `- **${tool.name}**: ${tool.description}\n`;
    section += `  Status: ${statusIcon}\n`;

    if (tool.status === 'unavailable' && tool.fallback) {
      section += `  Fallback: ${tool.fallback}\n`;
    }
  }

  // === AGENT ROLE CLARITY ===
  section += '\n## YOU ARE A SPAWNED AGENT (NOT the Router)\n\n';
  section +=
    'You are a **spawned subagent**, not the Router. You CAN and SHOULD use tools like Write, Edit, Bash, Grep, Glob directly to complete your work. ';
  section += 'You MUST use TaskUpdate to report your progress.\n\n';

  // === TASKUPDATE CONTRACT (required fields) ===
  section += '## TASKUPDATE CONTRACT (MANDATORY)\n\n';
  section +=
    '**STEP 1 — FIRST action:** `TaskUpdate({ taskId: "YOUR-ID", status: "in_progress" })`\n\n';
  section += '**STEP 2 — Do your work.**\n\n';
  section +=
    '**STEP 3 — LAST action (after all work is verified):**\n```\nTaskUpdate({\n  taskId: "YOUR-ID",\n  status: "completed",\n  metadata: {\n    summary: "What was accomplished (>50 chars required)",\n    filesModified: ["path/to/file1", "path/to/file2"],\n    completedAt: new Date().toISOString()\n  }\n})\n```\n';
  section +=
    '**WARNING:** The `taskupdate-contract-validator.cjs` hook enforces that `metadata.summary`, `metadata.filesModified`, and `metadata.completedAt` are present on completion. Missing fields will be BLOCKED.\n\n';

  // === TASKLIST-FIRST ENFORCEMENT ===
  section += '## TASKLIST-FIRST PROTOCOL\n\n';
  section +=
    'Before using `TaskCreate`, you **MUST** call `TaskList()` first. This is enforced by hooks and will **block you** if skipped.\n\n';

  // === GENERAL TOOL GUIDANCE ===
  section +=
    'Before editing an existing file (especially `.claude/context/reports/*`), Read it first; if it does not exist, create it with Write.\n';
  section +=
    'Use Write/Edit for file creation or updates; do not use Bash redirection (`>`, `>>`, `tee`) for artifacts.\n';

  return section;
}

function buildToolsSection(tools) {
  const describedTools = Array.isArray(tools) ? tools : [];
  const cacheKey = JSON.stringify(describedTools);
  if (_toolsSectionCache.has(cacheKey)) {
    return _toolsSectionCache.get(cacheKey);
  }
  _buildCounts.toolsSection++;
  const result = _computeToolsSection(describedTools);
  _toolsSectionCache.set(cacheKey, result);
  return result;
}

function _computeSkillsSection(skills, mode) {
  let section = '## AVAILABLE_SKILLS\n\n';
  section +=
    mode === 'names_only'
      ? 'Available skills matched to your agent (names-only mode):\n\n'
      : 'Available skills matched to your agent:\n\n';

  for (const skill of skills) {
    section += `- **${skill.name}**`;
    if (mode !== 'names_only') {
      section += `: ${skill.description}`;
    }
    if (skill.category) {
      section += ` (${skill.category})`;
    }
    section += '\n';
    if (mode !== 'names_only' && skill.requiredTools?.length > 0) {
      section += `  Required Tools: ${skill.requiredTools.join(', ')}\n`;
    }
    if (mode !== 'names_only') {
      section += `  Usage: Skill({ skill: '${skill.name}' })\n`;
    }
    section += '\n';
  }

  if (mode === 'names_only') {
    section += "Invoke any listed skill with: Skill({ skill: '<skill-name>' })\n";
  }

  return section;
}

function buildSkillsSection(skills, options = {}) {
  const mode = normalizeSkillSectionMode(options.skillSectionMode);
  const cacheKey = JSON.stringify({ skills, mode });
  if (_skillsSectionCache.has(cacheKey)) {
    return _skillsSectionCache.get(cacheKey);
  }
  _buildCounts.skillsSection++;
  const result = _computeSkillsSection(skills, mode);
  _skillsSectionCache.set(cacheKey, result);
  return result;
}

function _computeDiscoverySection() {
  return `## SKILL DISCOVERY PROTOCOL

To use a skill, invoke via Skill() tool:

### Example Usage
\`\`\`javascript
Skill({ skill: 'tdd' });        // Invoke TDD workflow
Skill({ skill: 'debugging' });  // Invoke debugging skill
\`\`\`

### Fast Search Defaults (Use These First)
- Prefer ripgrep: \`rg -n "needle" path/\`
- If \`rg\` is unavailable (common on Windows), use PowerShell fallback:
  \`Get-ChildItem -Recurse -File | Select-String -Pattern "needle"\`
- List files quickly: \`rg --files\` (instead of slow directory walks)
- Windows-safe counting example:
  \`(Get-ChildItem tests -Recurse -File -Include *.test.cjs,*.test.mjs,*.test.js,*.test.ts | Measure-Object).Count\`
- When you need AST-aware search/refactors, prefer hybrid search:
  \`node .claude/tools/cli/index-codebase.cjs search "query"\`
  (uses semantic index + structural refinement via ast-grep when available)
- For change awareness: \`git status --porcelain\` and \`git diff\`
- Avoid brittle shell one-liners like \`dir ... | find /c\`, \`ls ... | wc -l\`, or commands that start with \`/c\`.
- For GitHub content fetches via Bash, fail fast and never mask upstream errors:
  \`set -euo pipefail; gh api repos/OWNER/REPO/contents/PATH --jq '.content' | base64 -d\`
  If \`gh api\` fails (404/401/etc.), stop and handle the error before continuing.
- GitHub repo traversal rule: list directories first and only fetch discovered paths (do not guess deep file paths).
- If \`gh api\` is unavailable (auth not configured, permission denied, or repeated HTTP errors), fallback to git:
  \`git clone --depth 1 https://github.com/OWNER/REPO.git <temp-dir>\`
  Enumerate files locally and read from the clone; do not continue speculative API path probing.

### Finding Capabilities
For a full skill list: Read .claude/docs/skill-catalog.md
For skill search: Look for skills matching your task domain
For new skills: Domain experts (language-specific agents) have domain-focused skills
`;
}

function buildDiscoverySection() {
  if (_discoveryCache !== null) {
    return _discoveryCache;
  }
  _buildCounts.discoverySection++;
  _discoveryCache = _computeDiscoverySection();
  return _discoveryCache;
}

function injectSections(basePrompt, sections) {
  const parts = [];

  // STATIC HIERARCHY TOP (Highest cache hit rate)
  if (sections.toolsSection) parts.push(sections.toolsSection);
  if (sections.skillsSection) parts.push(sections.skillsSection);
  if (sections.discoverySection) parts.push(sections.discoverySection);

  // SEMI-STATIC RAG (Medium tier)
  if (sections.memorySection) parts.push(sections.memorySection);

  // PROJECT CONTEXT (after memory, before behaviour)
  if (sections.projectContextSection) parts.push(sections.projectContextSection);

  // SEMI-STATIC CONSTITUTION/BEHAVIOUR
  if (sections.behaviourSection) parts.push(sections.behaviourSection);

  // STABLE SAFETY/PROTOCOL SECTIONS (injected before volatile basePrompt to extend cacheable region)
  if (sections.safetySection) parts.push(sections.safetySection);
  if (sections.protocolSection) parts.push(sections.protocolSection);
  if (sections.tokenSection) parts.push(sections.tokenSection);

  // DYNAMIC/VOLATILE (Bottom tier - user query, task IDs, warnings)
  if (basePrompt) parts.push(basePrompt);

  return parts.filter(p => typeof p === 'string' && p.trim().length > 0).join('\n\n');
}

module.exports = {
  normalizeSkillSectionMode,
  buildToolsSection,
  buildSkillsSection,
  buildDiscoverySection,
  injectSections,
  _clearSectionCache,
  _getSectionBuildCounts,
};
