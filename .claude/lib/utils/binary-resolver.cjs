'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function dedupePush(list, value) {
  if (!value || typeof value !== 'string') return;
  if (!list.includes(value)) list.push(value);
}

function getScoopShimDirs() {
  const dirs = [];
  if (process.platform !== 'win32') return dirs;

  const scoopShims = process.env.SCOOP_SHIMS;
  if (scoopShims) dedupePush(dirs, scoopShims);

  const scoopRoot = process.env.SCOOP;
  if (scoopRoot) dedupePush(dirs, path.join(scoopRoot, 'shims'));

  const userProfile = process.env.USERPROFILE || process.env.HOME;
  if (userProfile) dedupePush(dirs, path.join(userProfile, 'scoop', 'shims'));

  return dirs;
}

function getNodeBinDir(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') return null;
  return path.join(projectRoot, 'node_modules', '.bin');
}

function buildToolCandidates(toolNames, options = {}) {
  const candidates = [];
  const names = Array.isArray(toolNames) ? toolNames : [toolNames];
  const projectRoot = options.projectRoot || process.cwd();
  const preferredPath = options.preferredPath;
  const nodeBinDir = getNodeBinDir(projectRoot);

  dedupePush(candidates, preferredPath);
  if (Array.isArray(options.extraCandidates)) {
    for (const candidate of options.extraCandidates) dedupePush(candidates, candidate);
  }

  if (nodeBinDir) {
    for (const name of names) {
      if (!name) continue;
      if (process.platform === 'win32') {
        dedupePush(candidates, path.join(nodeBinDir, `${name}.cmd`));
        dedupePush(candidates, path.join(nodeBinDir, `${name}.exe`));
      }
      dedupePush(candidates, path.join(nodeBinDir, name));
    }
  }

  if (process.platform === 'win32') {
    const scoopDirs = getScoopShimDirs();
    for (const dir of scoopDirs) {
      for (const name of names) {
        if (!name) continue;
        dedupePush(candidates, path.join(dir, `${name}.exe`));
        dedupePush(candidates, path.join(dir, `${name}.cmd`));
        dedupePush(candidates, path.join(dir, `${name}.bat`));
        dedupePush(candidates, path.join(dir, name));
      }
    }
  }

  for (const name of names) dedupePush(candidates, name);
  return candidates;
}

function looksLikePath(bin) {
  if (!bin) return false;
  return bin.includes('/') || bin.includes('\\') || /^[A-Za-z]:\\/.test(bin);
}

function isBinaryUsable(binPath, versionArgs = ['--version'], timeoutMs = 1500) {
  if (!binPath || typeof binPath !== 'string') return false;
  if (looksLikePath(binPath) && !fs.existsSync(binPath)) return false;

  const result = spawnSync(binPath, versionArgs, {
    encoding: 'utf8',
    stdio: 'ignore',
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });

  return !result.error && result.status === 0;
}

function resolveFirstAvailableBinary(candidates, options = {}) {
  const versionArgs = options.versionArgs || ['--version'];
  const timeoutMs = options.timeoutMs || 1500;
  for (const candidate of candidates || []) {
    if (isBinaryUsable(candidate, versionArgs, timeoutMs)) return candidate;
  }
  return null;
}

function resolveToolBinary(toolNames, options = {}) {
  const candidates = buildToolCandidates(toolNames, options);
  return resolveFirstAvailableBinary(candidates, options);
}

function resolveRipgrepBinary(options = {}) {
  const names = ['rg'];
  const preferred = options.preferredPath || process.env.RG_BIN || options.vscodeRgPath;
  return resolveToolBinary(names, {
    ...options,
    preferredPath: preferred,
    extraCandidates: [
      options.vscodeRgPath,
      path.join(
        options.projectRoot || process.cwd(),
        'bin',
        process.platform === 'win32' ? 'rg.exe' : 'rg'
      ),
    ],
  });
}

function resolveAstGrepBinary(options = {}) {
  const preferred = options.preferredPath || process.env.AST_GREP_BIN;
  return resolveToolBinary(['ast-grep', 'sg'], {
    ...options,
    preferredPath: preferred,
  });
}

module.exports = {
  buildToolCandidates,
  isBinaryUsable,
  resolveFirstAvailableBinary,
  resolveToolBinary,
  resolveRipgrepBinary,
  resolveAstGrepBinary,
};
