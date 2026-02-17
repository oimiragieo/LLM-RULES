'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEMAS_DIR = path.join(PROJECT_ROOT, '.claude', 'schemas');

const ajv = new Ajv({ allErrors: false, strict: false });
const validators = new Map();

function loadSchema(schemaFile) {
  try {
    const schemaPath = path.join(SCHEMAS_DIR, schemaFile);
    const raw = fs.readFileSync(schemaPath, 'utf8');
    return safeParseJSON(raw, null);
  } catch (_err) {
    return null;
  }
}

function getValidator(key, schemaFile) {
  if (validators.has(key)) return validators.get(key);
  const schema = loadSchema(schemaFile);
  if (!schema) {
    const passthrough = () => true;
    validators.set(key, passthrough);
    return passthrough;
  }
  try {
    const compiled = ajv.compile(schema);
    validators.set(key, compiled);
    return compiled;
  } catch (_err) {
    const passthrough = () => true;
    validators.set(key, passthrough);
    return passthrough;
  }
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return null;
    return safeParseJSON(content, null);
  } catch (_err) {
    return null;
  }
}

function readRouterStateFile(filePath, defaults) {
  const fallback = defaults && typeof defaults === 'object' ? { ...defaults } : {};
  const parsed = readJsonFile(filePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }

  const validate = getValidator('router-state', 'router-state.schema.json');
  if (validate(parsed)) {
    return { ...fallback, ...parsed };
  }

  // Accept legacy/minimal snapshots by validating merged defaults + parsed payload.
  const merged = { ...fallback, ...parsed };
  if (validate(merged)) {
    return merged;
  }

  return fallback;
}

function readWorkflowStateFile(filePath, fallback = null) {
  const parsed = readJsonFile(filePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }

  const validate = getValidator('workflow-state', 'workflow-state.schema.json');
  if (!validate(parsed)) {
    return fallback;
  }

  return parsed;
}

function readPhaseAdvanceFile(filePath, fallback = null) {
  const parsed = readJsonFile(filePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }

  const validate = getValidator('phase-advance', 'phase-advance.schema.json');
  if (!validate(parsed)) {
    return fallback;
  }

  return parsed;
}

module.exports = {
  readRouterStateFile,
  readWorkflowStateFile,
  readPhaseAdvanceFile,
};
