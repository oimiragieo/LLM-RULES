'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function readLegacyMemoryArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = safeParseJSON(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function readLegacySummary(projectRoot = PROJECT_ROOT, maxChars = 3600) {
  try {
    const legacyPath = path.join(projectRoot, '.claude', 'context', 'memory', 'learnings.md');
    if (!fs.existsSync(legacyPath)) return '';
    const summary = fs.readFileSync(legacyPath, 'utf8');
    return String(summary || '')
      .slice(-maxChars)
      .trim();
  } catch (_err) {
    return '';
  }
}

function loadLegacyFileBackedMemory(projectRoot = PROJECT_ROOT, maxChars = 3600) {
  const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
  return {
    gotchas: readLegacyMemoryArray(path.join(memoryDir, 'gotchas.json')),
    patterns: readLegacyMemoryArray(path.join(memoryDir, 'patterns.json')),
    decisions: readLegacyMemoryArray(path.join(memoryDir, 'decisions.json')),
    discoveries: readLegacyMemoryArray(path.join(memoryDir, 'discoveries.json')),
    recent_sessions: readLegacyMemoryArray(path.join(memoryDir, 'recent_sessions.json')),
    legacy_summary: readLegacySummary(projectRoot, maxChars),
  };
}

module.exports = {
  loadLegacyFileBackedMemory,
};
