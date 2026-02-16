#!/usr/bin/env node
'use strict';

const DEFAULT_SKILL_SECTION_MODE = 'full';
const BANNER_LINE = '+======================================================================+';

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

### Finding Capabilities
For a full skill list: Read .claude/context/artifacts/catalogs/skill-catalog.md
For skill search: Look for skills matching your task domain
For new skills: Domain experts (language-specific agents) have domain-focused skills
`;
}

function buildInjectedSections(sections) {
  return `\n\n${sections.toolsSection}\n\n${sections.skillsSection}\n\n${sections.discoverySection}\n\n`;
}

function locateInjectionWindow(basePrompt) {
  const projectContextMatch = basePrompt.match(/## PROJECT CONTEXT/i);
  const instructionsMatch = basePrompt.match(/## Instructions/i);

  const firstBannerIndex = basePrompt.indexOf(BANNER_LINE);
  let lastWarningBoxEnd = firstBannerIndex;
  if (firstBannerIndex !== -1) {
    const secondBanner = basePrompt.indexOf(BANNER_LINE, firstBannerIndex + 1);
    if (secondBanner !== -1) {
      lastWarningBoxEnd = secondBanner + BANNER_LINE.length;
    }
  }

  if (projectContextMatch) {
    return {
      beforeContent: basePrompt.slice(0, projectContextMatch.index),
      afterContent: basePrompt.slice(projectContextMatch.index),
    };
  }
  if (instructionsMatch) {
    return {
      beforeContent: basePrompt.slice(0, instructionsMatch.index),
      afterContent: basePrompt.slice(instructionsMatch.index),
    };
  }
  if (lastWarningBoxEnd > 0) {
    return {
      beforeContent: basePrompt.slice(0, lastWarningBoxEnd),
      afterContent: basePrompt.slice(lastWarningBoxEnd),
    };
  }
  return { beforeContent: basePrompt, afterContent: '' };
}

function injectMemorySection(enhanced, memorySection) {
  if (!memorySection || enhanced.includes('## Memory Context (Auto-Loaded)')) {
    return enhanced;
  }

  const header = '## Memory Protocol';
  const idx = enhanced.toLowerCase().indexOf(header.toLowerCase());
  if (idx !== -1) {
    const afterHeaderIdx = enhanced.indexOf('\n', idx);
    const nextHeadingIdx = enhanced.indexOf('\n## ', afterHeaderIdx === -1 ? idx : afterHeaderIdx);
    if (nextHeadingIdx !== -1) {
      return (
        enhanced.slice(0, nextHeadingIdx) +
        `\n\n${memorySection}\n` +
        enhanced.slice(nextHeadingIdx)
      );
    }
  }
  return `${enhanced}\n\n${memorySection}\n`;
}

function injectBehaviourSection(enhanced, behaviourSection) {
  if (!behaviourSection || enhanced.includes('## Dynamic behaviour rules')) {
    return enhanced;
  }

  const marker = '## Memory Context (Auto-Loaded)';
  if (enhanced.includes(marker)) {
    const nextHeaderIdx = enhanced.indexOf('\n## ', enhanced.indexOf(marker) + marker.length);
    if (nextHeaderIdx !== -1) {
      return (
        enhanced.slice(0, nextHeaderIdx) +
        `\n\n${behaviourSection}\n` +
        enhanced.slice(nextHeaderIdx)
      );
    }
  }

  return `${enhanced}\n\n${behaviourSection}\n`;
}

function injectSections(basePrompt, sections) {
  if (!basePrompt) {
    const parts = [sections.toolsSection, sections.skillsSection, sections.discoverySection];
    if (sections.memorySection) parts.push(sections.memorySection);
    if (sections.behaviourSection) parts.push(sections.behaviourSection);
    return parts.filter(Boolean).join('\n\n');
  }

  const { beforeContent, afterContent } = locateInjectionWindow(basePrompt);
  let enhanced = beforeContent + buildInjectedSections(sections) + afterContent;
  enhanced = injectMemorySection(enhanced, sections.memorySection);
  enhanced = injectBehaviourSection(enhanced, sections.behaviourSection);
  return enhanced;
}

module.exports = {
  normalizeSkillSectionMode,
  buildToolsSection,
  buildSkillsSection,
  buildDiscoverySection,
  injectSections,
};
