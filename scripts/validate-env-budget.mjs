'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_EXAMPLE = path.join(PROJECT_ROOT, '.env.example');

// Threshold for "Essential" variables
const MAX_VARS = 250;

function main() {
  let hasError = false;

  if (!fs.existsSync(ENV_EXAMPLE)) {
    console.error('.env.example not found');
    process.exit(1);
  }

  const content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
  const lines = content.split('\n');
  const vars = lines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=')[0]);

  console.log(`Found ${vars.length} variables in .env.example`);

  if (vars.length > MAX_VARS) {
    console.error(`❌ Too many environment variables: ${vars.length} > ${MAX_VARS}`);
    hasError = true;
  }

  // Check for .env.minimal
  const MINIMAL_PATH = path.join(PROJECT_ROOT, '.env.minimal');
  if (!fs.existsSync(MINIMAL_PATH)) {
    console.error('❌ .env.minimal not found. Please create it.');
    process.exit(1);
  }

  const minimalContent = fs.readFileSync(MINIMAL_PATH, 'utf8');
  const minimalVars = minimalContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=')[0]);

  console.log(`Found ${minimalVars.length} variables in .env.minimal`);
  if (minimalVars.length > 30) {
    console.error(`❌ .env.minimal should be minimal! Found ${minimalVars.length} vars.`);
    hasError = true;
  }

  if (hasError) {
    process.exit(1);
  }

  console.log('✅ Environment configuration validated.');
}

main();
