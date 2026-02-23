#!/usr/bin/env node
/**
 * Validate Latest Integration Artifacts
 * Validates schema files and integration artifacts
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../lib/utils/safe-json.cjs');

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
      safeParseJSON(content, file);
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
  log('🔍 Validating Latest Integration Artifacts\n');

  const schemasValid = validateSchemaFiles();

  if (jsonOutput) {
    // JSON mode: return actual validation results
    const schemasDir = resolve(rootDir, '.claude/schemas');
    const schemaFiles = existsSync(schemasDir)
      ? readdirSync(schemasDir).filter(f => f.endsWith('.json'))
      : [];

    console.log(
      JSON.stringify(
        {
          success: schemasValid,
          totalSchemas: schemaFiles.length,
          validSchemas: schemasValid ? schemaFiles.length : 0,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    process.exit(schemasValid ? 0 : 1);
    return;
  }

  if (schemasValid) {
    log('\n✅ All integration artifacts validated successfully!');
    process.exit(0);
  } else {
    log('\n❌ Some integration artifacts failed validation');
    process.exit(1);
  }
}

main();
