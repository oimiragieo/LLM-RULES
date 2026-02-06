#!/usr/bin/env node
/**
 * Hybrid Search CLI - ripgrep + Embeddings
 *
 * Usage:
 *   hybrid-search "authentication logic"       # Search code
 *   hybrid-search --structure                  # Show project structure
 *   hybrid-search --file "src/auth.ts" 10 20   # Get file content
 */

'use strict';

const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');

const chalk = {
  blue: text => `\x1b[34m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  gray: text => `\x1b[90m${text}\x1b[0m`,
  bold: text => `\x1b[1m${text}\x1b[0m`,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const indexer = new HybridLazyIndexer({
    embeddingEnabled: process.env.HYBRID_EMBEDDINGS !== 'off',
  });

  if (command === '--structure' || command === '-s') {
    // Show project structure
    console.log(chalk.blue('\n📁 Project Structure\n'));
    const structure = await indexer.analyzeStructure();

    console.log(chalk.bold('Directory Tree:'));
    console.log(structure.tree);

    console.log(chalk.bold('\nEntry Points (Exports):'));
    structure.entryPoints.slice(0, 10).forEach(ep => {
      console.log(`  ${chalk.green(ep.file)}:${ep.line} ${ep.code.slice(0, 60)}`);
    });

    console.log(chalk.bold('\nTop Dependencies:'));
    structure.dependencies.slice(0, 10).forEach(([dep, count]) => {
      console.log(`  ${chalk.yellow(dep)} (${count} imports)`);
    });

    console.log(chalk.bold('\nMermaid Diagram:'));
    console.log(chalk.gray('```mermaid'));
    console.log(structure.diagram);
    console.log(chalk.gray('```'));
  } else if (command === '--file' || command === '-f') {
    // Get file content
    const [filePath, start, end] = args.slice(1);
    const content = await indexer.getFileContent(
      filePath,
      parseInt(start) || 0,
      parseInt(end) || 50
    );

    if (content) {
      console.log(chalk.blue(`\n📄 ${filePath} (lines ${content.lineStart}-${content.lineEnd})\n`));
      console.log(content.content);
    } else {
      console.error(chalk.bold('\n❌ File not found or unreadable\n'));
      process.exit(1);
    }
  } else if (command) {
    // Search
    const query = args.join(' ');
    const startTime = Date.now();

    console.log(chalk.blue(`\n🔍 Searching: "${query}"\n`));

    const results = await indexer.search(query, { limit: 20 });

    if (results.length === 0) {
      console.log(chalk.yellow('No results found.\n'));
      process.exit(0);
    }

    results.forEach((result, i) => {
      const score = (result.totalScore * 100).toFixed(1);
      const type = result.type === 'hybrid' ? '⚡' : result.type === 'semantic' ? '🧠' : '📝';

      console.log(`${type} ${chalk.bold(`${i + 1}. ${result.file}`)} ${chalk.gray(`(${score}%)`)}`);

      if (result.textMatches && result.textMatches.length > 0) {
        result.textMatches.slice(0, 3).forEach(m => {
          console.log(chalk.gray(`   ${m.line}: ${m.text.slice(0, 80)}`));
        });
      }
      console.log();
    });

    console.log(chalk.green(`Found ${results.length} results in ${Date.now() - startTime}ms\n`));
  } else {
    // Help
    console.log(`
Hybrid Search - Fast ripgrep + Semantic Embeddings

Usage:
  hybrid-search "query"              # Search codebase
  hybrid-search --structure          # Show project structure
  hybrid-search --file path 10 20    # Get file content (lines 10-20)

Environment:
  HYBRID_EMBEDDINGS=off              # Disable semantic search (text only)
  
Examples:
  hybrid-search "authentication"
  hybrid-search "export class User"
  hybrid-search --structure
  hybrid-search --file src/auth.ts 1 50
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
