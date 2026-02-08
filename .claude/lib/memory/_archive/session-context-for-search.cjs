'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const memoryTiers = require('./memory-tiers.cjs');

function formatRecentMessages(sessionData, maxMessages) {
  if (Array.isArray(sessionData?.recent_messages) && sessionData.recent_messages.length > 0) {
    return sessionData.recent_messages
      .map(entry => {
        if (!entry || typeof entry !== 'object') return '';
        const role = entry.role || 'unknown';
        const content = entry.content || '';
        return `[${role}]: ${content}`;
      })
      .filter(Boolean)
      .slice(-maxMessages);
  }

  const parts = [];
  if (sessionData?.summary) {
    parts.push(`Summary: ${sessionData.summary}`);
  }
  if (Array.isArray(sessionData?.decisions_made) && sessionData.decisions_made.length > 0) {
    parts.push(`Decisions: ${sessionData.decisions_made.join('; ')}`);
  }
  if (Array.isArray(sessionData?.patterns_found) && sessionData.patterns_found.length > 0) {
    parts.push(`Patterns: ${sessionData.patterns_found.join('; ')}`);
  }
  if (
    Array.isArray(sessionData?.gotchas_encountered) &&
    sessionData.gotchas_encountered.length > 0
  ) {
    parts.push(`Gotchas: ${sessionData.gotchas_encountered.join('; ')}`);
  }

  return parts.filter(Boolean).slice(-maxMessages);
}

function scoreSummary(text, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return 0;
  const haystack = String(text || '').toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function readSummaryFiles(projectRoot) {
  const mtmDir = memoryTiers.getTierPath('MTM', projectRoot);
  if (!fs.existsSync(mtmDir)) return [];
  return fs
    .readdirSync(mtmDir)
    .filter(name => name.endsWith('.summary.md'))
    .map(name => {
      const filePath = path.join(mtmDir, name);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const stat = fs.statSync(filePath);
        return {
          path: filePath,
          content: content.trim(),
          mtimeMs: stat.mtimeMs || 0,
        };
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function readArchiveSummaries(projectRoot) {
  const mtmDir = memoryTiers.getTierPath('MTM', projectRoot);
  if (!fs.existsSync(mtmDir)) return [];
  const entries = fs.readdirSync(mtmDir, { withFileTypes: true });
  return entries
    .filter(ent => ent.isDirectory() && /^archive_\d+$/.test(ent.name))
    .map(ent => {
      const name = ent.name;
      const overviewPath = path.join(mtmDir, name, '.overview.md');
      if (!fs.existsSync(overviewPath)) return null;
      try {
        const content = fs.readFileSync(overviewPath, 'utf8');
        const stat = fs.statSync(overviewPath);
        return {
          path: overviewPath,
          content: content.trim(),
          mtimeMs: stat.mtimeMs || 0,
        };
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function getContextForSearch(query, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const maxArchives = Number.isFinite(options.maxArchives) ? options.maxArchives : 3;
  const maxMessages = Number.isFinite(options.maxMessages) ? options.maxMessages : 20;

  const stmEntry = memoryTiers.readSTMEntry(projectRoot);
  let recentMessages = [];
  if (stmEntry) {
    recentMessages = formatRecentMessages(stmEntry, maxMessages);
  } else {
    const mtmSessions = memoryTiers.getMTMSessions(projectRoot);
    const latest = mtmSessions.length > 0 ? mtmSessions[mtmSessions.length - 1] : null;
    recentMessages = latest ? formatRecentMessages(latest, maxMessages) : [];
  }

  const summaries = [...readArchiveSummaries(projectRoot), ...readSummaryFiles(projectRoot)]
    .map(summary => ({
      ...summary,
      score: scoreSummary(summary.content, query),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.mtimeMs - a.mtimeMs;
    })
    .slice(0, maxArchives)
    .map(summary => summary.content)
    .filter(Boolean);

  return {
    summaries,
    recentMessages,
  };
}

module.exports = {
  getContextForSearch,
  formatRecentMessages,
  scoreSummary,
};
