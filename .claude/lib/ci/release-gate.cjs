'use strict';

const fs = require('fs');

const { computeSemverBump } = require('../artifacts/semver-diff.cjs');

function isDocFile(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return (
    normalized.endsWith('.md') ||
    normalized.startsWith('.claude/docs/') ||
    normalized === 'README.md' ||
    normalized === 'CHANGELOG.md'
  );
}

function hasBreakingChangeMarker(commitMessage) {
  const message = String(commitMessage || '');
  const lines = message.split(/\r?\n/);
  const header = lines[0] || '';
  return /!:/u.test(header) || /BREAKING CHANGE:/u.test(message);
}

function resolveRequiredBump(options) {
  if (options.oldPath && options.newPath) {
    const oldContent = fs.readFileSync(options.oldPath, 'utf8');
    const newContent = fs.readFileSync(options.newPath, 'utf8');
    return computeSemverBump(oldContent, newContent, options.artifactType || 'agent');
  }

  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles : [];
  if (changedFiles.length > 0 && changedFiles.every(isDocFile)) {
    return 'patch';
  }

  return 'minor';
}

function evaluateReleaseGate(options = {}) {
  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles : [];
  const docsOnly = changedFiles.length > 0 && changedFiles.every(isDocFile);
  const requiredBump = resolveRequiredBump(options);
  const failures = [];

  if (requiredBump === 'major') {
    if (!hasBreakingChangeMarker(options.commitMessage)) {
      failures.push('Major release requires BREAKING CHANGE signaling in the commit message.');
    }
    if (!options.migrationGuidePath || !fs.existsSync(options.migrationGuidePath)) {
      failures.push('Major release requires a migration guide.');
    }
  }

  return {
    docsOnly,
    requiredBump,
    failures,
    ok: failures.length === 0,
  };
}

module.exports = {
  evaluateReleaseGate,
  hasBreakingChangeMarker,
  isDocFile,
};
