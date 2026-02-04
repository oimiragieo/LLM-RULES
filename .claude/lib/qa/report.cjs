'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { validatePathWithinProject, PROJECT_ROOT } = require('../utils/project-root.cjs');

const HISTORY_FILENAME = 'qa_iteration_history.json';

function resolveHistoryPath(planDir) {
  if (!planDir || typeof planDir !== 'string') return null;
  const result = validatePathWithinProject(planDir, PROJECT_ROOT);
  if (!result.safe) return null;
  return path.join(result.resolvedPath, HISTORY_FILENAME);
}

function getIterationHistory(planDir) {
  const filePath = resolveHistoryPath(planDir);
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function recordIteration(planDir, verdict, issuesSummary) {
  const filePath = resolveHistoryPath(planDir);
  if (!filePath) return false;
  const history = getIterationHistory(planDir);
  const iteration = history.length + 1;
  const entry = {
    iteration,
    timestamp: new Date().toISOString(),
    verdict: verdict || 'unknown',
    issues_summary: Array.isArray(issuesSummary) ? issuesSummary : [],
  };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWriteJSONSync(filePath, [...history, entry]);
    return true;
  } catch (_e) {
    return false;
  }
}

function countIssues(history) {
  const counts = new Map();
  for (const entry of history) {
    const issues = Array.isArray(entry?.issues_summary) ? entry.issues_summary : [];
    for (const issue of issues) {
      const key = String(issue || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function hasRecurringIssues(planDir, threshold = 3) {
  const history = getIterationHistory(planDir);
  const counts = countIssues(history);
  for (const count of counts.values()) {
    if (count >= threshold) return true;
  }
  return false;
}

function getRecurringIssueSummary(planDir, threshold = 2) {
  const history = getIterationHistory(planDir);
  const counts = countIssues(history);
  const summary = [];
  for (const [issue, count] of counts.entries()) {
    if (count >= threshold) summary.push({ issue, count });
  }
  summary.sort((a, b) => b.count - a.count);
  return summary;
}

function escalateToHuman(planDir, reason) {
  if (!planDir || typeof planDir !== 'string') return null;
  const result = validatePathWithinProject(planDir, PROJECT_ROOT);
  if (!result.safe) return null;
  const filePath = path.join(result.resolvedPath, 'escalate.md');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = [
      '# QA Escalation',
      '',
      `Timestamp: ${new Date().toISOString()}`,
      `Reason: ${reason || 'Recurring QA failures'}`,
      '',
    ].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  recordIteration,
  getIterationHistory,
  hasRecurringIssues,
  getRecurringIssueSummary,
  escalateToHuman,
};
