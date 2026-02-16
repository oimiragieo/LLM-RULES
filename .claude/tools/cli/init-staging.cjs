#!/usr/bin/env node
/**
 * Staging Environment Initialization
 *
 * Creates staging directory structure and seeds test data.
 * Run this script to set up a staging environment for testing.
 *
 * Usage:
 *   AGENT_STUDIO_ENV=staging node .claude/tools/cli/init-staging.cjs
 *
 * @module init-staging
 */

const fs = require('fs').promises;
const path = require('path');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { getEnvironment } = require('../../lib/utils/environment.cjs');
const { getProjectRoot } = require('../../lib/utils/config-loader.cjs');

/**
 * Create directory if it doesn't exist
 * @param {string} dirPath - Absolute path to directory
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`✓ Created: ${dirPath}`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Copy file with error handling
 * @param {string} src - Source file path
 * @param {string} dest - Destination file path
 */
async function copyFile(src, dest) {
  try {
    await fs.copyFile(src, dest);
  } catch (error) {
    console.warn(`⚠ Failed to copy ${src}: ${error.message}`);
  }
}

/**
 * Count files in directory recursively
 * @param {string} dirPath - Directory to count
 * @returns {Promise<number>} File count
 */
async function countFiles(dirPath) {
  let count = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += await countFiles(fullPath);
      } else {
        count++;
      }
    }
  } catch (_error) {
    // Directory doesn't exist or not accessible
    return 0;
  }
  return count;
}

/**
 * Copy directory recursively
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @returns {Promise<number>} Number of files copied
 */
async function copyDir(src, dest) {
  let filesCopied = 0;

  try {
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        filesCopied += await copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
        filesCopied++;
      }
    }
  } catch (error) {
    console.warn(`⚠ Failed to copy directory ${src}: ${error.message}`);
  }

  return filesCopied;
}

/**
 * Initialize staging environment
 * @param {Object} options - Initialization options
 * @param {boolean} options.force - Force initialization even if environment not set
 */
async function initStaging(options = {}) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       Agent-Studio Staging Environment Initialization          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check environment (allow --force flag to override)
  const env = getEnvironment();
  if (env !== 'staging' && !options.force) {
    console.error(`❌ Error: AGENT_STUDIO_ENV must be set to "staging"`);
    console.error(`   Current environment: ${env}`);
    console.error(`   Run: export AGENT_STUDIO_ENV=staging`);
    console.error(`   Or use --force flag to initialize anyway`);
    process.exit(1);
  }

  if (options.force && env !== 'staging') {
    console.warn(`⚠ Warning: Forcing staging initialization in ${env} environment`);
    console.warn('   Staging directories will be created but may not be used automatically\n');
  }

  console.log(`Environment: ${env}\n`);

  const projectRoot = getProjectRoot();
  const stagingRoot = path.join(projectRoot, '.claude', 'staging');

  // Step 1: Create staging directories
  console.log('Step 1: Creating staging directories...');
  const directories = [
    path.join(stagingRoot, 'knowledge'),
    path.join(stagingRoot, 'metrics'),
    path.join(stagingRoot, 'memory'),
    path.join(stagingRoot, 'agents'),
    path.join(stagingRoot, 'sessions'),
    path.join(stagingRoot, 'context'),
    path.join(stagingRoot, 'context', 'artifacts'),
  ];

  for (const dir of directories) {
    await ensureDir(dir);
  }

  console.log('');

  // Step 2: Seed test data
  console.log('Step 2: Seeding test data...\n');

  // Copy Knowledge Base index
  const kbIndexSrc = path.join(projectRoot, '.claude', 'knowledge', 'knowledge-base-index.csv');
  const kbIndexDest = path.join(stagingRoot, 'knowledge', 'knowledge-base-index.csv');
  try {
    await copyFile(kbIndexSrc, kbIndexDest);
    const fileStats = await fs.stat(kbIndexDest);
    console.log(`✓ Copied KB index (${fileStats.size} bytes)`);
  } catch (error) {
    console.warn(`⚠ Could not copy KB index: ${error.message}`);
  }

  // Copy memory templates
  const memoryTemplates = {
    'learnings.md': '# Learnings (Staging)\n\nTest data for staging environment.\n',
    'decisions.md': '# Decisions (Staging)\n\nTest ADRs for staging environment.\n',
    'issues.md': '# Issues (Staging)\n\nTest issues for staging environment.\n',
  };

  for (const [filename, content] of Object.entries(memoryTemplates)) {
    const filePath = path.join(stagingRoot, 'memory', filename);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`✓ Created: ${filename}`);
  }

  // Create empty log files
  const logFiles = [
    path.join(stagingRoot, 'metrics', 'hooks.jsonl'),
    path.join(stagingRoot, 'metrics', 'agents.jsonl'),
    path.join(stagingRoot, 'metrics', 'errors.jsonl'),
    path.join(stagingRoot, 'metrics', 'llm-usage.log'),
    path.join(stagingRoot, 'sessions', 'session-log.jsonl'),
  ];

  for (const logFile of logFiles) {
    await fs.writeFile(logFile, '', 'utf8');
    console.log(`✓ Created: ${path.basename(logFile)}`);
  }

  // Create evolution state
  const evolutionState = {
    currentPhase: null,
    researchEntries: [],
    history: [],
    patterns: [],
    suggestionsQueue: [],
  };
  const evolutionStatePath = path.join(stagingRoot, 'context', 'evolution-state.json');
  await fs.writeFile(evolutionStatePath, JSON.stringify(evolutionState, null, 2), 'utf8');
  console.log('✓ Created: evolution-state.json');

  console.log('');

  // Step 3: Summary
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                   Staging Environment Ready!                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('✓ Directory structure created');
  console.log('✓ Test data seeded');
  console.log('✓ Log files initialized\n');

  console.log('Next steps:');
  console.log('  1. Run smoke tests: npm run test:staging:smoke');
  console.log('  2. Run full test suite: AGENT_STUDIO_ENV=staging npm test');
  console.log('  3. Check monitoring: node .claude/tools/cli/monitor-dashboard.js --env staging\n');

  // Count artifacts in staging
  const kbCount = await countFiles(path.join(stagingRoot, 'knowledge'));
  console.log(`Staging KB artifacts: ${kbCount}`);
}

// Run if executed directly
async function cliMain() {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  await initStaging({ force });
}

const wrappedMain = wrapCLITool(cliMain, 'init-staging');

if (require.main === module) {
  wrappedMain();
}

module.exports = { initStaging, copyDir };
