'use strict';

const fs = require('fs');
const path = require('path');

const { commandExists } = require('../utils/command-exists.cjs');

const commandAvailabilityCache = new Map();

function isCommandAvailable(binary) {
  if (binary === 'node') return true;

  if (!commandAvailabilityCache.has(binary)) {
    commandAvailabilityCache.set(binary, commandExists(binary));
  }

  return commandAvailabilityCache.get(binary);
}

function readPackageJSON(repoPath) {
  const packagePath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packagePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function getPackageCommandInfo(command) {
  const trimmed = String(command || '').trim();
  const npmRunMatch = trimmed.match(/^npm\s+run\s+([A-Za-z0-9:_-]+)(?:\s|$)/);
  if (npmRunMatch) {
    return { packageManager: 'npm', script: npmRunMatch[1] };
  }

  const npmAuditMatch = trimmed.match(/^npm\s+audit(?:\s|$)/);
  if (npmAuditMatch) {
    return { packageManager: 'npm', builtIn: 'audit' };
  }

  const pnpmMatch = trimmed.match(/^pnpm\s+(?:run\s+)?([A-Za-z0-9:_-]+)(?:\s|$)/);
  if (pnpmMatch) {
    const commandName = pnpmMatch[1];
    if (commandName === 'audit') {
      return { packageManager: 'pnpm', builtIn: 'audit' };
    }
    return { packageManager: 'pnpm', script: commandName };
  }

  return null;
}

function getPackageCommandSkipReason(command, repoPath, runPackageCommands) {
  const commandInfo = getPackageCommandInfo(command);
  if (!commandInfo) return null;

  const manifest = readPackageJSON(repoPath);
  if (!manifest) {
    return 'package.json not found';
  }

  if (commandInfo.script && !manifest.scripts?.[commandInfo.script]) {
    return `package script "${commandInfo.script}" not found`;
  }

  if (!runPackageCommands) {
    return 'package command execution disabled';
  }

  return null;
}

module.exports = {
  getPackageCommandInfo,
  getPackageCommandSkipReason,
  isCommandAvailable,
  readPackageJSON,
};
