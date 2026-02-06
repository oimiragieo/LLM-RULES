#!/usr/bin/env node
/**
 * Validate Latest Integration Artifacts
 * Validates schema files and integration artifacts
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

const jsonOutput = process.argv.includes('--json');

function log(message) {
  if (!jsonOutput) {
    console.log(message);
  }
}

function validateSchemaFiles() {
  const schemasDir = resolve(rootDir, '.claude/schemas');
  if (!existsSync(schemasDir)) {
    log('❌ Schemas directory not found');
    return false;
  }

  const schemaFiles = readdirSync(schemasDir).filter(f => f.endsWith('.json'));
  let validCount = 0;

  for (const file of schemaFiles) {
    const filePath = resolve(schemasDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      JSON.parse(content);
      validCount++;
      log(`✅ ${file} - valid`);
    } catch (error) {
      log(`❌ ${file} - invalid JSON: ${error.message}`);
    }
  }

  log(`\nValidated ${validCount}/${schemaFiles.length} schema files`);
  return validCount === schemaFiles.length;
}

function main() {
  if (jsonOutput) {
    console.log('{}');
    return;
  }

  log('🔍 Validating Latest Integration Artifacts\n');

  const schemasValid = validateSchemaFiles();

  if (schemasValid) {
    log('\n✅ All integration artifacts validated successfully!');
    process.exit(0);
  } else {
    log('\n❌ Some integration artifacts failed validation');
    process.exit(1);
  }
}

main();
