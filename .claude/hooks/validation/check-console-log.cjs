#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

function getCandidateFiles() {
  const override = process.env.CONSOLE_LOG_CHECK_FILES;
  if (override) {
    return override
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  const gitDirResult = spawnSync('git', ['rev-parse', '--git-dir'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (gitDirResult.status !== 0 || gitDirResult.error) {
    return [];
  }

  const diffResult = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (diffResult.status !== 0 || diffResult.error) {
    return [];
  }
  return diffResult.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function filterScriptFiles(files) {
  return files.filter(file => /\.(ts|tsx|js|jsx)$/.test(file));
}

function resolveFilePath(file) {
  if (path.isAbsolute(file)) return file;
  return path.join(PROJECT_ROOT, file);
}

function scanForConsoleLogs(files) {
  let hasConsole = false;

  for (const file of files) {
    const filePath = resolveFilePath(file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('console.log')) {
        console.error(`[Hook] WARNING: console.log found in ${file}`);
        hasConsole = true;
      }
    } catch (_err) {
      // ignore unreadable files
    }
  }

  if (hasConsole) {
    console.error('[Hook] Remove console.log statements before committing');
  }
}

function main() {
  const files = filterScriptFiles(getCandidateFiles());
  scanForConsoleLogs(files);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  getCandidateFiles,
  filterScriptFiles,
  scanForConsoleLogs,
};
