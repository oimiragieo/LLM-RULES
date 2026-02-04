'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const CONTEXTS_DIR = path.join(PROJECT_ROOT, '.claude', 'config', 'contexts');
const MODES_DIR = path.join(PROJECT_ROOT, '.claude', 'config', 'modes');

function isPathLike(value) {
  return value.includes(path.sep) || value.endsWith('.yml') || value.endsWith('.yaml');
}

function resolveConfigPath(baseDir, nameOrPath) {
  if (!nameOrPath) return null;
  if (isPathLike(nameOrPath)) {
    return path.isAbsolute(nameOrPath) ? nameOrPath : path.resolve(PROJECT_ROOT, nameOrPath);
  }
  const basePath = path.join(baseDir, nameOrPath);
  const ymlPath = `${basePath}.yml`;
  const yamlPath = `${basePath}.yaml`;
  if (fs.existsSync(ymlPath)) return ymlPath;
  if (fs.existsSync(yamlPath)) return yamlPath;
  return ymlPath;
}

function validateDefinition(definition, label) {
  if (!definition || typeof definition !== 'object') {
    console.warn(`[context-mode] Invalid ${label}: not an object`);
    return false;
  }
  if (typeof definition.name !== 'string' || !definition.name.trim()) {
    console.warn(`[context-mode] Invalid ${label}: missing name`);
    return false;
  }
  if (typeof definition.prompt !== 'string' || !definition.prompt.trim()) {
    console.warn(`[context-mode] Invalid ${label}: missing prompt`);
    return false;
  }
  return true;
}

function loadDefinition(baseDir, nameOrPath, label) {
  const resolvedPath = resolveConfigPath(baseDir, nameOrPath);
  if (!resolvedPath) return null;
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[context-mode] ${label} not found: ${resolvedPath}`);
    return null;
  }
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = yaml.load(raw);
    if (!validateDefinition(parsed, label)) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[context-mode] Failed to load ${label}: ${err.message}`);
    return null;
  }
}

function loadContext(nameOrPath) {
  return loadDefinition(CONTEXTS_DIR, nameOrPath, 'context');
}

function loadMode(nameOrPath) {
  return loadDefinition(MODES_DIR, nameOrPath, 'mode');
}

function loadModes(namesOrPaths) {
  if (!Array.isArray(namesOrPaths)) return [];
  return namesOrPaths.map(loadMode).filter(Boolean);
}

function listNames(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map(file => file.replace(/\.ya?ml$/, ''));
}

function listContextNames() {
  return listNames(CONTEXTS_DIR);
}

function listModeNames() {
  return listNames(MODES_DIR);
}

module.exports = {
  loadContext,
  loadMode,
  loadModes,
  listContextNames,
  listModeNames,
};
