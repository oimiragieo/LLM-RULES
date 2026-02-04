#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { error: `Manifest not found: ${manifestPath}` };
  }
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return { data };
  } catch (err) {
    return { error: `Failed to parse manifest: ${err.message}` };
  }
}

function runSkillTriggeringSmoke(options = {}) {
  const promptsDir = options.promptsDir || path.join(__dirname, 'prompts');
  const manifestPath = options.manifestPath || path.join(promptsDir, 'manifest.json');
  const errors = [];

  const { data, error } = loadManifest(manifestPath);
  if (error) {
    errors.push(error);
    return { ok: false, errors };
  }

  if (!data || !Array.isArray(data.prompts)) {
    errors.push('Manifest missing prompts array');
    return { ok: false, errors };
  }

  for (const entry of data.prompts) {
    if (!entry || typeof entry.file !== 'string') {
      errors.push('Manifest entry missing file');
      continue;
    }
    const promptPath = path.join(promptsDir, entry.file);
    if (!fs.existsSync(promptPath)) {
      errors.push(`Missing prompt file: ${entry.file}`);
      continue;
    }
    const content = fs.readFileSync(promptPath, 'utf8');
    if (!content.trim()) {
      errors.push(`Empty prompt file: ${entry.file}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  const result = runSkillTriggeringSmoke();
  if (!result.ok) {
    for (const err of result.errors) {
      console.error(err);
    }
    process.exit(1);
  }
  console.log('Skill-triggering prompt files and manifest OK');
  process.exit(0);
}

module.exports = { runSkillTriggeringSmoke };
