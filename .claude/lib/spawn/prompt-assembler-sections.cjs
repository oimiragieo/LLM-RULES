#!/usr/bin/env node
'use strict';

const DEFAULT_SKILL_SECTION_MODE = 'full';
const _BANNER_LINE = '+======================================================================+';

function normalizeSkillSectionMode(mode) {
  const value = String(mode || DEFAULT_SKILL_SECTION_MODE)
    .trim()
    .toLowerCase();
  if (value === 'names-only' || value === 'names_only' || value === 'compact') {
    return 'names_only';
  }
  return 'full';
}

function buildToolsSection(tools) {
  const describedTools = Array.isArray(tools) ? tools : [];
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

  section +=
    '\n**CRITICAL/MANDATORY:** Call TaskUpdate({ taskId, status: "in_progress" }) when starting work.\n';
  section += 'Call TaskUpdate({ taskId, status: "completed" }) when done.\n';
  section +=
    'Before editing an existing file (especially `.claude/context/reports/*`), Read it first; if it does not exist, create it with Write.\n';
  section +=
    'Use Write/Edit for file creation or updates; do not use Bash redirection (`>`, `>>`, `tee`) for artifacts.\n';

  return section;
}

function buildSkillsSection(skills, options = {}) {
  const mode = normalizeSkillSectionMode(options.skillSectionMode);
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

function buildDiscoverySection() {
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
};
