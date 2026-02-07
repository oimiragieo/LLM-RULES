#!/usr/bin/env node
// .claude/tools/cli/migrate-memory.cjs
// Memory migration CLI tool - Migrates learnings.md, decisions.md, issues.md to SQLite

const path = require('path');
const fs = require('fs');
const { EntityExtractor } = require('../../lib/memory/entity-extractor.cjs');

// Project root (3 levels up from this file)
const projectRoot = path.resolve(__dirname, '../../../');
const memoryDir = path.join(projectRoot, '.claude/context/memory');
const dbPath = path.join(projectRoot, '.claude/data/memory.db');

/**
 * Migrate memory files to SQLite database
 *
 * @param {Object} options - Migration options
 * @param {boolean} options.dryRun - Preview without saving
 * @returns {Promise<Object>} Migration results
 */
async function migrateMemory(options = {}) {
  const { dryRun = false } = options;

  console.log('Memory Migration Tool');
  console.log('=====================\n');

  if (dryRun) {
    console.log('[DRY RUN MODE] Preview only - no changes will be saved\n');
  }

  // Initialize EntityExtractor
  const extractor = new EntityExtractor(dbPath);

  // Memory files to migrate
  const memoryFiles = ['learnings.md', 'decisions.md', 'issues.md'];

  let totalEntities = 0;
  let totalRelationships = 0;
  const results = {
    files: [],
    entities: 0,
    relationships: 0,
    dryRun,
  };

  for (const fileName of memoryFiles) {
    const filePath = path.join(memoryDir, fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping ${fileName} (file not found)`);
      continue;
    }

    console.log(`Migrating ${fileName}...`);

    try {
      // Extract entities and relationships
      const { entities, relationships } = await extractor.extractFromFile(filePath);

      console.log(`  ✓ Extracted ${entities.length} entities`);
      console.log(`  ✓ Extracted ${relationships.length} relationships`);

      if (!dryRun) {
        // Store entities in database
        await extractor.storeEntities(entities);
        await extractor.storeRelationships(relationships);

        console.log(`  ✓ Stored entities and relationships in database`);
      }

      totalEntities += entities.length;
      totalRelationships += relationships.length;

      results.files.push({
        name: fileName,
        entities: entities.length,
        relationships: relationships.length,
      });
    } catch (error) {
      console.error(`  ✗ Error migrating ${fileName}:`, error.message);
      results.files.push({
        name: fileName,
        error: error.message,
      });
    }

    console.log('');
  }

  // Summary
  console.log('Migration Summary');
  console.log('=================');
  console.log(`Files processed: ${results.files.length}`);
  console.log(`Entities extracted: ${totalEntities}`);
  console.log(`Relationships extracted: ${totalRelationships}`);

  if (dryRun) {
    console.log('\n[DRY RUN] No changes were saved to the database.');
    console.log('Run without --dry-run to perform actual migration.');
  } else {
    console.log(
      `\nMigrated ${totalEntities} entities and ${totalRelationships} relationships to SQLite.`
    );
  }

  results.entities = totalEntities;
  results.relationships = totalRelationships;

  // Close database connection
  extractor.close();

  return results;
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node migrate-memory.cjs [options]

Migrate memory files (learnings.md, decisions.md, issues.md) to SQLite database.

Options:
  --dry-run    Preview migration without saving to database
  --help, -h   Show this help message

Examples:
  node migrate-memory.cjs              # Perform migration
  node migrate-memory.cjs --dry-run    # Preview migration

Database: ${dbPath}
Memory files: ${memoryDir}/*.md
    `);
    process.exit(0);
  }

  // Parse options
  const dryRun = args.includes('--dry-run');

  try {
    await migrateMemory({ dryRun });
    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for testing
module.exports = { migrateMemory };
