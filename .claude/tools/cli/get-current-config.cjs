#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { buildContextModePrompt } = require('../../lib/spawn/prompt-factory.cjs');
const { getManifest } = require('../../lib/tools/tool-set.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const CURRENT_CONTEXT_PATH = path.join(RUNTIME_DIR, 'current-context.json');
const CURRENT_MODES_PATH = path.join(RUNTIME_DIR, 'current-modes.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { __error: err.message };
  }
}

function resolveSources() {
  const contextFile = readJson(CURRENT_CONTEXT_PATH);
  const modesFile = readJson(CURRENT_MODES_PATH);

  let contextName = null;
  let contextSource = 'default';
  let modeNames = [];
  let modeSource = 'default';

  if (contextFile && !contextFile.__error && typeof contextFile.context === 'string') {
    const trimmed = contextFile.context.trim();
    if (trimmed) {
      contextName = trimmed;
      contextSource = 'file:current-context';
    }
  }

  if (contextFile && !contextFile.__error && Array.isArray(contextFile.modes)) {
    modeNames = contextFile.modes.map(mode => String(mode).trim()).filter(Boolean);
    if (modeNames.length > 0) {
      modeSource = 'file:current-context';
    }
  }

  if (modeNames.length === 0 && modesFile && !modesFile.__error && Array.isArray(modesFile.modes)) {
    modeNames = modesFile.modes.map(mode => String(mode).trim()).filter(Boolean);
    if (modeNames.length > 0) {
      modeSource = 'file:current-modes';
    }
  }

  if (!contextName) {
    const envContext = process.env.AGENT_STUDIO_CONTEXT;
    if (envContext && envContext.trim()) {
      contextName = envContext.trim();
      contextSource = 'env';
    }
  }

  if (modeNames.length === 0) {
    const envModes = process.env.AGENT_STUDIO_MODES;
    if (envModes && envModes.trim()) {
      modeNames = envModes
        .split(',')
        .map(mode => mode.trim())
        .filter(Boolean);
      if (modeNames.length > 0) {
        modeSource = 'env';
      }
    }
  }

  return {
    contextName,
    contextSource,
    modeNames,
    modeSource,
    contextFile,
    modesFile,
  };
}

function getCoreToolNames() {
  const manifest = getManifest();
  const core = manifest.tools && manifest.tools.core ? manifest.tools.core : [];
  return core.map(tool => tool.name);
}

function runGetCurrentConfig(options = {}) {
  const role = options.role || process.env.AGENT_STUDIO_CONFIG_ROLE || 'developer';
  const overrideContext = typeof options.contextName === 'string' ? options.contextName : null;
  const overrideModes = Array.isArray(options.modeNames) ? options.modeNames : null;

  const resolved = resolveSources();
  const contextName = overrideContext !== null ? overrideContext : resolved.contextName;
  const modeNames = overrideModes !== null ? overrideModes : resolved.modeNames;
  const contextSource = overrideContext !== null ? 'override' : resolved.contextSource;
  const modeSource = overrideModes !== null ? 'override' : resolved.modeSource;

  const contextMode = buildContextModePrompt({
    role,
    contextName: contextName || null,
    modeNames: modeNames || [],
  });

  const activeTools = contextMode.activeToolNames || [];
  const coreTools = getCoreToolNames();
  const activeSet = new Set(activeTools);
  const inactiveTools = coreTools.filter(tool => !activeSet.has(tool));

  const result = {
    contextName: contextName || null,
    modeNames: modeNames || [],
    contextSource,
    modeSource,
    activeTools,
    inactiveTools,
  };

  if (options.quiet) {
    return result;
  }

  console.log('Current context: ' + (result.contextName || '(none)'));
  console.log('Context source: ' + result.contextSource);
  console.log('Current modes: ' + (result.modeNames.length > 0 ? result.modeNames.join(', ') : '(none)'));
  console.log('Mode source: ' + result.modeSource);
  console.log('Active tools: ' + (result.activeTools.join(', ') || '(none)'));
  console.log('Inactive tools: ' + (result.inactiveTools.join(', ') || '(none)'));

  return result;
}

if (require.main === module) {
  try {
    runGetCurrentConfig();
  } catch (err) {
    console.error('[get-current-config] Failed: ' + err.message);
    process.exit(1);
  }
}

module.exports = {
  runGetCurrentConfig,
};
