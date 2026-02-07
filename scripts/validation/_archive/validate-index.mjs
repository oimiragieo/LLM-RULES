#!/usr/bin/env node
/**
 * Rule Index Path Validation Script
 *
 * Validates that all paths in rule-index.json actually exist on disk.
 * Prevents broken references after directory renames or rule additions.
 *
 * Usage:
 *   node scripts/validate-index.mjs
 *
 * Exit codes:
 *   0: All paths valid
 *   1: One or more paths missing
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveConfigPath } from '../../.claude/lib/utils/context-path-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

// Use resolver for path resolution (supports both old and new paths)
const RULE_INDEX_PATH = resolveConfigPath('rule-index.json', { read: true });

function validateIndex() {
  console.log('Validating rule-index.json paths...\n');

  if (!existsSync(RULE_INDEX_PATH)) {
    console.error('❌ rule-index.json not found at:', RULE_INDEX_PATH);
    console.error('   Run pnpm index-rules to generate the index first.');
    return false;
  }

  let index;
  try {
    const content = readFileSync(RULE_INDEX_PATH, 'utf-8');
    index = JSON.parse(content);
  } catch (error) {
    console.error('❌ Failed to parse rule-index.json:', error.message);
    return false;
  }

  if (!index.rules || !Array.isArray(index.rules)) {
    console.error('❌ rule-index.json missing or invalid "rules" array');
    return false;
  }

  let missingCount = 0;
  let checkedCount = 0;
  const missingPaths = [];

  // Check all rule paths
  for (const rule of index.rules) {
    if (!rule.path) {
      continue;
    }

    checkedCount++;
    const rulePath = resolve(ROOT, rule.path);

    if (!existsSync(rulePath)) {
      missingCount++;
      missingPaths.push(rule.path);

      if (missingPaths.length <= 10) {
        console.error(`❌ Missing: ${rule.path}`);
      }
    }
  }

  // Summary
  console.log(`\nChecked ${checkedCount} rule paths`);

  if (missingCount === 0) {
    console.log('✅ All rule paths are valid!');
    return true;
  } else {
    console.error(`\n❌ Found ${missingCount} missing path(s)`);
    if (missingPaths.length > 10) {
      console.error(`   (showing first 10, ${missingPaths.length - 10} more...)`);
    }
    console.error('\n💡 Run pnpm index-rules to regenerate the index with correct paths.');
    return false;
  }
}

// Run validation
try {
  const isValid = validateIndex();
  process.exit(isValid ? 0 : 1);
} catch (error) {
  console.error('Fatal error during validation:', error.message);
  console.error(error.stack);
  process.exit(2);
}
