#!/usr/bin/env node
/**
 * Dependency Verification Script
 *
 * Checks that critical native dependencies are properly installed.
 * Run this before indexing or using semantic search.
 *
 * Usage: node scripts/verify-dependencies.mjs [--fix]
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

const checks = {
  sharp: { critical: true, fix: 'pnpm rebuild sharp' },
  transformers: { critical: true, fix: 'pnpm install' },
  lancedb: { critical: true, fix: 'pnpm install' },
  fastembed: { critical: false, fix: 'pnpm add fastembed' },
  ripgrep: { critical: false, fix: 'pnpm install @vscode/ripgrep' },
  astgrep: { critical: false, fix: 'npm install -g @ast-grep/cli' },
};

async function checkSharp() {
  try {
    const sharp = await import('sharp');
    // Try to create a simple image to verify it works
    const img = sharp.default({
      create: { width: 1, height: 1, channels: 3, background: 'black' },
    });
    await img.raw().toBuffer();
    return { ok: true, version: sharp.default.versions.sharp };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function checkTransformers() {
  try {
    // Dynamic import for ESM module
    const transformers = await import('@xenova/transformers');
    return { ok: true, available: typeof transformers.pipeline === 'function' };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function checkLanceDB() {
  try {
    // Try to import the module - dynamic import for ESM compatibility
    const lancedb = await import('@lancedb/lancedb');
    // Verify it's actually usable by checking for expected exports
    if (lancedb && (lancedb.connect || lancedb.default)) {
      return { ok: true, note: 'Module loads successfully' };
    }
    return { ok: false, error: 'Module loaded but missing expected exports' };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function checkFastembed() {
  try {
    const fastembed = await import('fastembed');
    return { ok: true, models: Object.keys(fastembed.EmbeddingModel || {}) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function checkRipgrep() {
  try {
    const { rgPath } = await import('@vscode/ripgrep');
    if (!fs.existsSync(rgPath)) {
      return { ok: false, error: `Binary not found at ${rgPath}` };
    }
    // Try to run it
    execFileSync(rgPath, ['--version'], { stdio: 'ignore', shell: false });
    return { ok: true, path: rgPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function checkAstgrep() {
  try {
    execFileSync('ast-grep', ['--version'], { stdio: 'ignore', shell: false });
    return { ok: true };
  } catch {
    // Check if installed locally
    try {
      const astGrepPath = path.join(process.cwd(), 'node_modules/.bin/ast-grep');
      if (fs.existsSync(astGrepPath)) {
        return { ok: true, path: astGrepPath, note: 'Local installation' };
      }
    } catch {
      /* ignore */
    }
    return { ok: false, error: 'ast-grep not found in PATH' };
  }
}

async function runChecks() {
  log('\n📦 Agent Studio Dependency Verification\n', BLUE);
  log('='.repeat(50));

  const results = [];
  let criticalFailures = 0;

  // Check Sharp
  log('\n🔍 Checking sharp (image processing)...', BLUE);
  const sharpResult = await checkSharp();
  if (sharpResult.ok) {
    log(`  ✅ sharp v${sharpResult.version} working correctly`, GREEN);
  } else {
    log(`  ❌ sharp FAILED: ${sharpResult.error}`, RED);
    log(`  💡 Fix: ${checks.sharp.fix}`, YELLOW);
    criticalFailures++;
  }
  results.push({ name: 'sharp', ...sharpResult });

  // Check Transformers
  log('\n🔍 Checking @xenova/transformers (embeddings)...', BLUE);
  const transformersResult = await checkTransformers();
  if (transformersResult.ok) {
    log('  ✅ @xenova/transformers available', GREEN);
  } else {
    log(`  ❌ @xenova/transformers FAILED: ${transformersResult.error}`, RED);
    log(`  💡 Fix: ${checks.transformers.fix}`, YELLOW);
    criticalFailures++;
  }
  results.push({ name: 'transformers', ...transformersResult });

  // Check LanceDB
  log('\n🔍 Checking @lancedb/lancedb (vector database)...', BLUE);
  const lancedbResult = await checkLanceDB();
  if (lancedbResult.ok) {
    log('  ✅ @lancedb/lancedb available', GREEN);
  } else {
    log(`  ❌ @lancedb/lancedb FAILED: ${lancedbResult.error}`, RED);
    log(`  💡 Fix: ${checks.lancedb.fix}`, YELLOW);
    criticalFailures++;
  }
  results.push({ name: 'lancedb', ...lancedbResult });

  // Check FastEmbed (optional)
  log('\n🔍 Checking fastembed (fast embeddings - optional)...', BLUE);
  const fastembedResult = await checkFastembed();
  if (fastembedResult.ok) {
    log(`  ✅ fastembed available (${fastembedResult.models.length} models)`, GREEN);
  } else {
    log(`  ⚠️  fastembed not available: ${fastembedResult.error}`, YELLOW);
    log(`  💡 Optional fix: ${checks.fastembed.fix}`, YELLOW);
  }
  results.push({ name: 'fastembed', ...fastembedResult, optional: true });

  // Check Ripgrep
  log('\n🔍 Checking ripgrep (fast search)...', BLUE);
  const ripgrepResult = await checkRipgrep();
  if (ripgrepResult.ok) {
    log(`  ✅ ripgrep available at ${ripgrepResult.path}`, GREEN);
  } else {
    log(`  ⚠️  ripgrep not available: ${ripgrepResult.error}`, YELLOW);
    log(`  💡 Optional fix: ${checks.ripgrep.fix}`, YELLOW);
  }
  results.push({ name: 'ripgrep', ...ripgrepResult, optional: true });

  // Check AstGrep
  log('\n🔍 Checking ast-grep (structural search)...', BLUE);
  const astgrepResult = await checkAstgrep();
  if (astgrepResult.ok) {
    log(`  ✅ ast-grep available${astgrepResult.note ? ` (${astgrepResult.note})` : ''}`, GREEN);
  } else {
    log(`  ⚠️  ast-grep not available: ${astgrepResult.error}`, YELLOW);
    log(`  💡 Optional fix: ${checks.astgrep.fix}`, YELLOW);
  }
  results.push({ name: 'astgrep', ...astgrepResult, optional: true });

  // Check system resources
  log('\n🔍 Checking system resources...', BLUE);
  const os = await import('os');
  const totalMemGB = os.default.totalmem() / 1024 / 1024 / 1024;
  const freeMemGB = os.default.freemem() / 1024 / 1024 / 1024;
  const cpus = os.default.cpus().length;

  log(`  ℹ️  CPUs: ${cpus} cores`, BLUE);
  log(`  ℹ️  Total RAM: ${totalMemGB.toFixed(1)} GB`, BLUE);
  log(`  ℹ️  Free RAM: ${freeMemGB.toFixed(1)} GB`, BLUE);

  if (totalMemGB < 8) {
    log(`  ⚠️  Low memory: ${totalMemGB.toFixed(1)}GB (recommend 8GB+ for indexing)`, YELLOW);
  }

  // Summary
  log('\n' + '='.repeat(50));
  if (criticalFailures === 0) {
    log('\n✅ All critical dependencies available!', GREEN);
    log('   You can run: pnpm run code:index:reindex', GREEN);
  } else {
    log(`\n❌ ${criticalFailures} critical dependency(s) missing`, RED);
    log('   Semantic search will NOT work without these.', RED);

    if (process.argv.includes('--fix')) {
      log('\n🔧 Attempting automatic fixes...', BLUE);
      // Could implement auto-fix logic here
    }

    process.exit(1);
  }

  // Write report
  const reportPath = '.claude/context/artifacts/dependency-report.json';
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          results,
          system: {
            cpus,
            totalMemoryGB: totalMemGB,
            freeMemoryGB: freeMemGB,
            platform: os.default.platform(),
          },
        },
        null,
        2
      )
    );
    log(`\n📄 Report saved to ${reportPath}`, BLUE);
  } catch (_e) {
    // Ignore write errors
  }
}

runChecks().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
