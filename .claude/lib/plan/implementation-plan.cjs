'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { validatePathWithinProject, PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const FILENAME = 'implementation_plan.json';

function resolvePlanPath(planDir) {
  if (!planDir || typeof planDir !== 'string') return null;
  const result = validatePathWithinProject(planDir, PROJECT_ROOT);
  if (!result.safe) return null;
  return path.join(result.resolvedPath, FILENAME);
}

function load(planDir) {
  const filePath = resolvePlanPath(planDir);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return safeParseJSON(raw, null, null, null);
  } catch (_e) {
    return null;
  }
}

function save(planDir, plan) {
  const filePath = resolvePlanPath(planDir);
  if (!filePath) return false;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWriteJSONSync(filePath, plan);
    return true;
  } catch (_e) {
    return false;
  }
}

function createMinimal(featureName) {
  return {
    feature: featureName || 'Unnamed',
    phases: [],
    subtasks: [],
    qa_signoff: null,
    status: 'backlog',
    planStatus: 'pending',
  };
}

module.exports = { load, save, createMinimal };
