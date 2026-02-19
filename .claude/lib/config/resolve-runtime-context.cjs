'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const CURRENT_CONTEXT_PATH = path.join(RUNTIME_DIR, 'current-context.json');
const CURRENT_MODES_PATH = path.join(RUNTIME_DIR, 'current-modes.json');

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return safeParseJSON(raw, null, null, null);
  } catch (err) {
    console.warn(`[context-mode] Failed to read ${filePath}: ${err.message}`);
    return null;
  }
}

function normalizeModes(value) {
  if (!Array.isArray(value)) return [];
  return value.map(mode => String(mode).trim()).filter(Boolean);
}

function getCurrentContextName() {
  const contextData = readJsonFile(CURRENT_CONTEXT_PATH);
  if (contextData && typeof contextData.context === 'string' && contextData.context.trim()) {
    return contextData.context.trim();
  }

  const envContext = process.env.AGENT_STUDIO_CONTEXT;
  if (envContext && envContext.trim()) {
    return envContext.trim();
  }

  return null;
}

function getCurrentModeNames() {
  const contextData = readJsonFile(CURRENT_CONTEXT_PATH);
  if (contextData && Array.isArray(contextData.modes)) {
    return normalizeModes(contextData.modes);
  }

  const modesData = readJsonFile(CURRENT_MODES_PATH);
  if (modesData && Array.isArray(modesData.modes)) {
    return normalizeModes(modesData.modes);
  }

  const envModes = process.env.AGENT_STUDIO_MODES;
  if (envModes && envModes.trim()) {
    return envModes
      .split(',')
      .map(mode => mode.trim())
      .filter(Boolean);
  }

  return [];
}

module.exports = {
  getCurrentContextName,
  getCurrentModeNames,
};
