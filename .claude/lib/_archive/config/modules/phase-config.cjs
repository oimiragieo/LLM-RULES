'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { normalizeModel } = require('../utils/agent-config-reader.cjs');
const { getThinkingBudget } = require('../agents/agent-config.cjs');

const CONFIG_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'phase-models.json');

const DEFAULTS = {
  phaseModels: {
    spec: 'sonnet',
    planning: 'sonnet',
    coding: 'sonnet',
    qa: 'sonnet',
  },
  phaseThinking: {
    spec: 'medium',
    planning: 'high',
    coding: 'medium',
    qa: 'high',
  },
};

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      _cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return _cache;
    }
  } catch (_e) {
    // ignore and fall back to defaults
  }
  _cache = { version: '1.0.0', ...DEFAULTS };
  return _cache;
}

function getPhaseModel(phase) {
  const cfg = load();
  const phaseModels = cfg.phaseModels || DEFAULTS.phaseModels;
  const key = (phase || '').toString().trim().toLowerCase();
  const model = phaseModels[key] || DEFAULTS.phaseModels[key] || 'sonnet';
  return normalizeModel(model);
}

function getPhaseThinking(phase) {
  const cfg = load();
  const phaseThinking = cfg.phaseThinking || DEFAULTS.phaseThinking;
  const key = (phase || '').toString().trim().toLowerCase();
  return phaseThinking[key] || DEFAULTS.phaseThinking[key] || 'medium';
}

function getPhaseThinkingBudget(phase) {
  return getThinkingBudget(getPhaseThinking(phase));
}

function clearCache() {
  _cache = null;
}

module.exports = {
  getPhaseModel,
  getPhaseThinking,
  getPhaseThinkingBudget,
  clearCache,
};
