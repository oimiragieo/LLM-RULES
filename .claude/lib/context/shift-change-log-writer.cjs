const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const SCHEMA_VERSION = '1.0.0';

function validateHandoverLog(data) {
  const schemaPath = path.join(process.cwd(), '.claude/schemas/shift-change-log.schema.json');
  if (!fs.existsSync(schemaPath)) {
    throw new Error('Schema file not found at ' + schemaPath);
  }

  const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(schema);

  if (!validate(data)) {
    throw new Error(`Validation failed: ${ajv.errorsText(validate.errors)}`);
  }

  return true;
}

function writeHandoverLog(data, outputDir = path.join(process.cwd(), '.claude/context/runtime')) {
  // 1. Set Defaults
  const logData = {
    ...data,
    schemaVersion: data.schemaVersion || SCHEMA_VERSION,
    handoffId: data.handoffId || crypto.randomUUID(),
    timestamp: data.timestamp || new Date().toISOString(),
    status: 'READY',
  };

  // 2. Validate against schema
  validateHandoverLog(logData);

  // 3. Ensure dir exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const finalPath = path.join(outputDir, 'shift-change-log.json');
  const tmpPath = finalPath + '.tmp';

  // 4. Atomic write
  // We write to .tmp with READY status, then rename.
  fs.writeFileSync(tmpPath, JSON.stringify(logData, null, 2), 'utf8');
  fs.renameSync(tmpPath, finalPath);

  return logData;
}

module.exports = {
  writeHandoverLog,
  validateHandoverLog,
  SCHEMA_VERSION,
};
