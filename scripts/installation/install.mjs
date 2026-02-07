#!/usr/bin/env node
/**
 * Agent Studio Installer Script
 *
 * Copies agent bundles (.claude/, .cursor/, .factory/) to target project
 * and validates configuration.
 *
 * Usage:
 *   node scripts/install.mjs [target-directory] [--force] [--install-deps] [--skip-validation]
 *
 * Options:
 *   --force              Overwrite existing bundles
 *   --install-deps       Run 'pnpm install' after copying bundles
 *   --skip-validation    Skip configuration validation
 *
 * If target-directory is not provided, uses current directory.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

// Bundles to copy
const bundles = ['.claude', '.cursor', '.factory'];

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    targetDir: null,
    force: false,
    installDeps: false,
    skipValidation: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') {
      parsed.force = true;
    } else if (args[i] === '--install-deps') {
      parsed.installDeps = true;
    } else if (args[i] === '--skip-validation') {
      parsed.skipValidation = true;
    } else if (!args[i].startsWith('--') && !parsed.targetDir) {
      parsed.targetDir = args[i];
    }
  }

  return parsed;
}

function copyDirectory(src, dest, force = false) {
  if (!existsSync(src)) {
    console.error(`Error: Source directory does not exist: ${src}`);
    return false;
  }

  try {
    // Remove destination if it exists and force is enabled
    if (force && existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }

    mkdirSync(dest, { recursive: true });

    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDirectory(srcPath, destPath, force);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }

    return true;
  } catch (error) {
    console.error(`Error copying ${src} to ${dest}:`, error.message);
    return false;
  }
}

function main() {
  const args = parseArgs();
  const targetDir = args.targetDir ? resolve(args.targetDir) : process.cwd();

  // SECURITY FIX (MEDIUM-001): Validate target directory for path traversal
  // Detect path traversal attempts with ".."
  if (targetDir.includes('..')) {
    console.error('Error: Target directory cannot contain ".." (path traversal detected)');
    console.error(`Provided: ${args.targetDir}`);
    console.error(`Resolved: ${targetDir}`);
    process.exit(1);
  }

  // Warn if target is outside current working directory (unless --force is used)
  const cwd = process.cwd();
  const isOutsideCwd = !targetDir.startsWith(cwd);
  if (isOutsideCwd && !args.force) {
    console.error(`Error: Target directory is outside current working directory`);
    console.error(`Current: ${cwd}`);
    console.error(`Target: ${targetDir}`);
    console.error('Use --force to confirm installation to external directory');
    process.exit(1);
  }

  console.log('Agent Studio Installer');
  console.log('='.repeat(60));
  console.log(`Target directory: ${targetDir}`);
  if (args.force) console.log('Mode: Force (will overwrite existing bundles)');
  if (args.installDeps) console.log('Mode: Will install dependencies after copying');
  if (args.skipValidation) console.log('Mode: Will skip validation');
  console.log('');

  // Check if target directory exists
  if (!existsSync(targetDir)) {
    console.error(`Error: Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  // Copy bundles
  console.log('Copying agent bundles...\n');
  let successCount = 0;
  const failures = [];

  for (const bundle of bundles) {
    const srcPath = join(rootDir, bundle);
    const destPath = join(targetDir, bundle);

    if (!existsSync(srcPath)) {
      console.warn(`+ Bundle not found: ${bundle} (skipping)`);
      continue;
    }

    if (existsSync(destPath) && !args.force) {
      console.warn(`+ ${bundle}/ already exists in target directory`);
      console.log(`   Skipping ${bundle}/ (use --force to overwrite)`);
      continue;
    }

    if (existsSync(destPath) && args.force) {
      console.log(`* Overwriting existing ${bundle}/...`);
    } else {
      console.log(`* Copying ${bundle}/...`);
    }

    if (copyDirectory(srcPath, destPath, args.force)) {
      console.log(`+ ${bundle}/ copied successfully\n`);
      successCount++;
    } else {
      console.log(`- Failed to copy ${bundle}/\n`);
      failures.push(bundle);
    }
  }

  if (successCount === 0 && failures.length === 0) {
    console.error('No bundles were copied (all skipped or not found). Exiting.');
    process.exit(1);
  }

  if (failures.length > 0) {
    console.warn(`\nWarning: ${failures.length} bundle(s) failed to copy: ${failures.join(', ')}`);
  }

  // Copy validation script to target directory
  const validationScriptSrc = join(rootDir, 'scripts', 'validate-config.mjs');
  const validationScriptDest = join(targetDir, 'scripts', 'validate-config.mjs');

  if (existsSync(validationScriptSrc)) {
    try {
      mkdirSync(join(targetDir, 'scripts'), { recursive: true });
      copyFileSync(validationScriptSrc, validationScriptDest);
      console.log('+ Validation script copied\n');
    } catch (error) {
      console.warn('+ Could not copy validation script:', error.message);
    }
  }

  // Install dependencies if requested
  if (args.installDeps) {
    console.log('Installing dependencies...\n');
    try {
      execSync('pnpm install', {
        stdio: 'inherit',
        cwd: targetDir,
      });
      console.log('\n+ Dependencies installed successfully');
    } catch (_error) {
      console.warn('\n+ Warning: Dependency installation failed');
      console.warn('   Run manually: cd ' + targetDir + ' && pnpm install');
    }
  }

  // Run config validation unless skipped
  if (!args.skipValidation) {
    console.log('\nValidating configuration...\n');
    try {
      if (existsSync(validationScriptDest)) {
        execSync('node scripts/validate-config.mjs', {
          stdio: 'inherit',
          cwd: targetDir,
        });
        console.log('\n+ Configuration validation passed');
      } else {
        console.warn('+ Validation script not found, skipping validation');
        console.warn('   Run manually: node scripts/validate-config.mjs');
      }
    } catch (_error) {
      console.warn('\n+ Configuration validation found issues (see above)');
      console.warn('   You may need to fix these before using the agents');
    }
  } else {
    console.log('\n+ Skipping validation (--skip-validation flag set)');
  }

  // Print next steps
  console.log('\n' + '='.repeat(60));
  console.log('Installation Complete!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Restart your IDE/editor to load the new agents');
  console.log('2. For Claude Code: Restart Claude Desktop');
  console.log('3. For Cursor: Restart Cursor IDE');
  console.log('4. For Factory: Restart Factory Droid');
  console.log('\n5. Verify installation:');
  console.log(`   cd ${targetDir}`);
  console.log('   node scripts/validate-config.mjs');
  console.log('\n6. (Optional) Set up MCP servers:');
  console.log('   See .claude/docs/setup-guides/ for platform-specific setup');
  console.log('\n7. (Optional) Enable hooks:');
  console.log('   See .claude/hooks/README.md for hook configuration');
  console.log('\nFor more information, see:');
  console.log('- README.md - Project overview');
  console.log('- AGENTS.md - Agent documentation');
  console.log('- .claude/CLAUDE.md - Claude Code setup');
  console.log('- .cursor/README.md - Cursor IDE setup');
  console.log('- .factory/AGENTS.md - Factory Droid setup');
}

main();
