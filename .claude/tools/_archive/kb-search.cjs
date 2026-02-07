#!/usr/bin/env node

/**
 * Knowledge Base Search CLI
 *
 * Usage:
 *   node kb-search.js "testing"
 *   node kb-search.js --domain skill
 *   node kb-search.js --tags "testing,quality"
 *   node kb-search.js --stats
 */

const kb = require('../../lib/utils/knowledge-base-reader.cjs');

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
Knowledge Base Search CLI

Usage:
  node kb-search.js "keyword"              # Search by keyword
  node kb-search.js --domain <domain>      # Filter by domain (skill/agent/workflow)
  node kb-search.js --tags <tag1,tag2>     # Filter by tags (AND logic)
  node kb-search.js --get <name>           # Get artifact by name
  node kb-search.js --stats                # Show statistics
  node kb-search.js --list                 # List all artifacts

Examples:
  node kb-search.js "testing"
  node kb-search.js --domain skill
  node kb-search.js --tags "security,testing"
  node kb-search.js --get tdd
  `);
  process.exit(0);
}

// Parse command
const command = args[0];

if (command === '--stats') {
  // Show statistics
  const stats = kb.stats();
  console.log('\n=== Knowledge Base Statistics ===\n');
  console.log(`Total Artifacts: ${stats.total}`);
  console.log('\nBy Domain:');
  Object.entries(stats.byDomain).forEach(([domain, count]) => {
    console.log(`  ${domain}: ${count}`);
  });
  console.log('\nBy Complexity:');
  Object.entries(stats.byComplexity).forEach(([complexity, count]) => {
    console.log(`  ${complexity}: ${count}`);
  });
  console.log('');
} else if (command === '--list') {
  // List all artifacts
  const results = kb.listAll();
  console.log(`\n=== All Artifacts (${results.length}) ===\n`);
  results.slice(0, 20).forEach(artifact => {
    console.log(`- ${artifact.name} (${artifact.domain})`);
  });
  if (results.length > 20) {
    console.log(`\n... and ${results.length - 20} more`);
  }
  console.log('');
} else if (command === '--domain') {
  // Filter by domain
  const domain = args[1];
  if (!domain) {
    console.error('Error: --domain requires a domain name');
    process.exit(1);
  }
  const results = kb.filterByDomain(domain);
  console.log(`\n=== Found ${results.length} ${domain} artifacts ===\n`);
  results.slice(0, 10).forEach(artifact => {
    console.log(`${artifact.name}: ${artifact.description.substring(0, 80)}...`);
  });
  if (results.length > 10) {
    console.log(`\n... and ${results.length - 10} more`);
  }
  console.log('');
} else if (command === '--tags') {
  // Filter by tags
  const tagsArg = args[1];
  if (!tagsArg) {
    console.error('Error: --tags requires comma-separated tags');
    process.exit(1);
  }
  const tags = tagsArg.split(',').map(t => t.trim());
  const results = kb.filterByTags(tags);
  console.log(`\n=== Found ${results.length} artifacts matching tags: ${tags.join(', ')} ===\n`);
  results.slice(0, 10).forEach(artifact => {
    console.log(`${artifact.name}: ${artifact.description.substring(0, 80)}...`);
  });
  if (results.length > 10) {
    console.log(`\n... and ${results.length - 10} more`);
  }
  console.log('');
} else if (command === '--get') {
  // Get by name
  const name = args[1];
  if (!name) {
    console.error('Error: --get requires an artifact name');
    process.exit(1);
  }
  const result = kb.get(name);
  if (result) {
    console.log('\n=== Artifact Found ===\n');
    console.log(`Name: ${result.name}`);
    console.log(`Domain: ${result.domain}`);
    console.log(`Path: ${result.path}`);
    console.log(`Description: ${result.description}`);
    console.log(`Complexity: ${result.complexity}`);
    console.log(`Use Cases: ${result.use_cases}`);
    console.log(`Tools: ${result.tools}`);
    console.log(`Deprecated: ${result.deprecated}`);
    if (result.alias) {
      console.log(`Alias: ${result.alias}`);
    }
    console.log('');
  } else {
    console.log(`\nArtifact '${name}' not found\n`);
  }
} else {
  // Search by keyword
  const keyword = command;
  const results = kb.search(keyword);
  console.log(`\n=== Found ${results.length} matches for "${keyword}" ===\n`);
  results.slice(0, 10).forEach(artifact => {
    console.log(
      `${artifact.name} (${artifact.domain}): ${artifact.description.substring(0, 80)}...`
    );
  });
  if (results.length > 10) {
    console.log(`\n... and ${results.length - 10} more`);
  }
  console.log('');
}
