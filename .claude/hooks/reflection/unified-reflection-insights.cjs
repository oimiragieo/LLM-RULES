'use strict';

const fs = require('fs');
const path = require('path');

function createDefaultInsights() {
  return {
    summary: 'Session ended',
    tasks_completed: [],
    files_modified: [],
    discoveries: [],
    patterns_found: [],
    gotchas_encountered: [],
    decisions_made: [],
    next_steps: [],
  };
}

/**
 * Gather session insights for persistence.
 *
 * Note: hook input is already read/parsed via parseHookInputAsync(), so stdin is
 * not reliably available here. We primarily use structured fields on the input
 * (if provided) and fall back to `.claude/context/memory/active_context.md`.
 *
 * @param {string} projectRoot
 * @param {object} [input] - SessionEnd hook input (optional)
 * @returns {object} Normalized insights object
 */
function gatherSessionInsights(projectRoot, input = null) {
  if (input && typeof input === 'object') {
    const hasStructured =
      input.summary ||
      input.tasks_completed ||
      input.files_modified ||
      input.discoveries ||
      input.patterns_found ||
      input.gotchas_encountered ||
      input.decisions_made ||
      input.next_steps;

    if (hasStructured) {
      return {
        summary: input.summary || 'Session ended',
        tasks_completed: input.tasks_completed || [],
        files_modified: input.files_modified || [],
        discoveries: input.discoveries || [],
        patterns_found: input.patterns_found || [],
        gotchas_encountered: input.gotchas_encountered || [],
        decisions_made: input.decisions_made || [],
        next_steps: input.next_steps || [],
      };
    }
  }

  const activeContextPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'memory',
    'active_context.md'
  );

  if (!fs.existsSync(activeContextPath)) {
    return createDefaultInsights();
  }

  try {
    const content = fs.readFileSync(activeContextPath, 'utf8');
    return parseSessionInsightsFromMarkdown(content);
  } catch (_e) {
    return createDefaultInsights();
  }
}

/**
 * Best-effort markdown parser for active_context.md -> session insights.
 * @param {string} content
 * @returns {object}
 */
function parseSessionInsightsFromMarkdown(content) {
  const insights = {
    summary: 'Session ended',
    tasks_completed: [],
    discoveries: [],
    files_modified: [],
    patterns_found: [],
    gotchas_encountered: [],
    decisions_made: [],
    next_steps: [],
  };

  const lines = String(content || '').split('\n');
  let currentSection = null;

  const normalizeSection = headerLine => {
    const h = headerLine.toLowerCase();
    if (/(^|\b)(tasks?|completed)(\b|$)/.test(h)) return 'tasks';
    if (/(^|\b)(discover|discoveries|learning|learnings|insights)(\b|$)/.test(h)) {
      return 'discoveries';
    }
    if (/(^|\b)(files?|modified|changed)(\b|$)/.test(h)) return 'files';
    if (/(^|\b)(patterns?|solutions?|approaches)(\b|$)/.test(h)) return 'patterns';
    if (/(^|\b)(gotchas?|pitfalls?|warnings?|cautions)(\b|$)/.test(h)) return 'gotchas';
    if (/(^|\b)(decisions?|adrs?)(\b|$)/.test(h)) return 'decisions';
    if (/(^|\b)(next|steps?|todo)(\b|$)/.test(h)) return 'next_steps';
    return null;
  };

  const pushItem = (section, item) => {
    if (!item) return;
    if (section === 'tasks') insights.tasks_completed.push(item);
    if (section === 'discoveries') insights.discoveries.push(item);
    if (section === 'files') insights.files_modified.push(item);
    if (section === 'patterns') insights.patterns_found.push(item);
    if (section === 'gotchas') insights.gotchas_encountered.push(item);
    if (section === 'decisions') insights.decisions_made.push(item);
    if (section === 'next_steps') insights.next_steps.push(item);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const headerMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headerMatch) {
      currentSection = normalizeSection(headerMatch[1]);
      continue;
    }

    if (
      !currentSection &&
      trimmed &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('*') &&
      !/^\d+\.\s+/.test(trimmed)
    ) {
      if (!insights.summary || insights.summary === 'Session ended') {
        insights.summary = trimmed;
      }
      continue;
    }

    if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\.\s+/.test(trimmed)) {
      const item = trimmed
        .replace(/^[-*]\s*/, '')
        .replace(/^\d+\.\s*/, '')
        .trim();
      pushItem(currentSection, item);
    }
  }

  return insights;
}

module.exports = {
  gatherSessionInsights,
  parseSessionInsightsFromMarkdown,
};
