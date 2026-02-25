#!/usr/bin/env node
/**
 * Code Indexing CLI Tool
 *
 * Commands:
 *   index [path]    - Index source code directory
 *   search <query>  - Search indexed code
 *   status          - Show index statistics
 *   clear           - Clear the index
 *
 * @module tools/cli/index-codebase
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Default to BM25-only mode to avoid async pipeline OOM
// Override with LANCEDB_EMBEDDING_MODE=transformers or LANCEDB_EMBEDDING_MODE=fastembed for dense vectors
if (!process.env.LANCEDB_EMBEDDING_MODE) {
  process.env.LANCEDB_EMBEDDING_MODE = 'off';
}

const { Command } = require('commander');
const cliProgress = require('cli-progress');
const fs = require('fs').promises;
const path = require('path');
const { IndexManager } = require('../../lib/code-indexing/index-manager.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

// Chalk 5.x is ESM-only, so we use a simple fallback for CommonJS
const chalk = {
  blue: text => `\x1b[34m${text}\x1b[0m`,
  cyan: text => `\x1b[36m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  red: text => `\x1b[31m${text}\x1b[0m`,
  gray: text => `\x1b[90m${text}\x1b[0m`,
  bold: text => `\x1b[1m${text}\x1b[0m`,
};
chalk.green.bold = text => chalk.bold(chalk.green(text));
chalk.blue.bold = text => chalk.bold(chalk.blue(text));

// Create CLI program
const program = new Command();

program.name('index-codebase').description('Code indexing and semantic search').version('1.0.0');

/**
 * Index command - Index source code directory
 */
program
  .command('index [projectPath]')
  .description('Index source code directory')
  .option('--config <path>', 'Path to config file')
  .option('--source <dir>', 'Source directory to index (default: cwd)')
  .action(async (projectPath, options) => {
    try {
      const targetPath = projectPath || options.source || process.cwd();
      console.log(chalk.blue(`Indexing: ${targetPath}`));

      // Progress bars
      const multibar = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          format: '{stage} [{bar}] {percentage}% | {value}/{total}',
        },
        cliProgress.Presets.shades_classic
      );

      const scanBar = multibar.create(100, 0, { stage: chalk.cyan('✓ Scanning files...  ') });
      const parseBar = multibar.create(100, 0, { stage: chalk.cyan('✓ Parsing...         ') });
      const chunkBar = multibar.create(100, 0, { stage: chalk.cyan('✓ Chunking...        ') });
      const embedBar = multibar.create(100, 0, { stage: chalk.cyan('✓ Embedding...       ') });
      const indexBar = multibar.create(100, 0, { stage: chalk.cyan('✓ Indexing...        ') });

      // Load config
      const configPath =
        options.config || path.join(targetPath, '.claude', 'config', 'code-index-config.json');
      let config = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        config = safeParseJSON(configContent);
      } catch (_err) {
        // Use defaults if config not found
      }

      // Create index manager with config (let defaults handle memory-safe values)
      const managerOpts = { projectRoot: targetPath };
      if (config.indexing?.concurrency) managerOpts.concurrency = config.indexing.concurrency;
      if (config.indexing?.batchSize) managerOpts.batchSize = config.indexing.batchSize;
      if (config.indexing?.maxFileSize) managerOpts.maxFileSize = config.indexing.maxFileSize;
      if (config.indexing?.excludePatterns)
        managerOpts.excludePatterns = config.indexing.excludePatterns;
      if (config.indexing?.chunkFlushSize)
        managerOpts.chunkFlushSize = config.indexing.chunkFlushSize;
      if (config.indexing?.embedBatchSize)
        managerOpts.embedBatchSize = config.indexing.embedBatchSize;
      const manager = new IndexManager(managerOpts);

      // Index directory
      const result = await manager.indexDirectory(targetPath, {
        onProgress: (phase, current, total) => {
          const _percent = Math.floor((current / total) * 100);
          if (phase === 'scan') {
            scanBar.setTotal(total);
            scanBar.update(current);
          } else if (phase === 'parse') {
            parseBar.setTotal(total);
            parseBar.update(current);
          } else if (phase === 'chunk') {
            chunkBar.setTotal(total);
            chunkBar.update(current);
          } else if (phase === 'embed') {
            embedBar.setTotal(total);
            embedBar.update(current);
          } else if (phase === 'index') {
            indexBar.setTotal(total);
            indexBar.update(current);
          }
        },
      });

      // Complete progress bars
      scanBar.update(scanBar.getTotal());
      parseBar.update(parseBar.getTotal());
      chunkBar.update(chunkBar.getTotal());
      embedBar.update(embedBar.getTotal());
      indexBar.update(indexBar.getTotal());

      multibar.stop();

      // Print summary
      console.log('');
      console.log(chalk.green.bold('✓ Index complete:'));
      console.log(`  Files: ${result.filesIndexed}`);
      console.log(`  Chunks: ${result.chunksCreated}`);
      console.log(`  Embeddings: ${result.embeddingsGenerated}`);
      console.log(`  Time: ${Math.floor(result.timeMs / 1000)} seconds`);

      await manager.close();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error indexing:'), error.message);
      process.exit(1);
    }
  });

/**
 * Search command - Search indexed code
 */
program
  .command('search <query>')
  .description('Search indexed code semantically')
  .option('--topK <number>', 'Number of results to return', '10')
  .option('--threshold <number>', 'Similarity threshold (0-1)', '0.5')
  .action(async (query, options) => {
    try {
      const topK = parseInt(options.topK, 10);
      const threshold = parseFloat(options.threshold);

      // Load index manager
      const manager = new IndexManager({ projectRoot: process.cwd() });

      // Search (limit is passed as option)
      const results = await manager.semanticSearch(query, { limit: topK, minScore: threshold });

      if (results.length === 0) {
        console.log(chalk.yellow('No results found'));
        await manager.close();
        process.exit(0);
        return;
      }

      console.log(chalk.green(`Found ${results.length} results:\n`));

      results.forEach((result, index) => {
        const [lineStart, lineEnd] = result.lineRange;
        console.log(
          chalk.bold(
            `${index + 1}. ${result.type} - ${result.filePath}:${lineStart}-${lineEnd} (${Math.round(result.similarity * 100)}% match)`
          )
        );

        // Show snippet (first 150 chars)
        if (result.code) {
          const snippet = result.code.substring(0, 150).trim();
          console.log(chalk.gray(`   ${snippet}${result.code.length > 150 ? '...' : ''}`));
        }
        console.log('');
      });
      await manager.close();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error searching:'), error.message);
      process.exit(1);
    }
  });

/**
 * Hybrid Search command - Combined semantic + structural search
 */
program
  .command('hybrid-search <query>')
  .description('Search code using hybrid search (semantic + structural)')
  .option('-f, --file <path>', 'File path to search in', '.')
  .option('-l, --lang <language>', 'Programming language', 'js')
  .option('--semantic-only', 'Use semantic search only')
  .option('--structural-only', 'Use structural search only')
  .option('--topK <number>', 'Number of results to return', '10')
  .action(async (query, options) => {
    try {
      const startTime = Date.now();

      // Lazy-load hybrid search components
      const { HybridSearch } = require('../../lib/code-indexing/hybrid-search.cjs');
      const { AstGrepSearch } = require('../../lib/code-indexing/ast-grep-wrapper.cjs');

      const topK = parseInt(options.topK, 10);
      const filePath = options.file || process.cwd();
      const language = options.lang;

      // Show search mode
      console.log(chalk.blue.bold('Hybrid Search:'));
      if (options.semanticOnly) {
        console.log(chalk.gray('Mode: Semantic only'));
      } else if (options.structuralOnly) {
        console.log(chalk.gray('Mode: Structural only'));
      } else {
        console.log(chalk.gray('Mode: Hybrid (semantic + structural)'));
      }

      if (language) {
        console.log(chalk.gray(`Language: ${language}`));
      }
      console.log('');

      // Create index manager
      const manager = new IndexManager({ projectRoot: filePath });

      // Initialize hybrid search
      const astGrep = new AstGrepSearch();
      const hybridSearch = new HybridSearch(manager, { astGrep });

      // Execute search
      const searchOptions = { limit: topK, language };

      let results;
      if (options.semanticOnly) {
        // Semantic-only mode
        console.log(chalk.cyan('→ Semantic stage...'));
        results = await hybridSearch.semanticStage(query, topK, language);
        results = results.map(r => ({ ...r, score: r.similarity }));
      } else if (options.structuralOnly) {
        // Structural-only mode (requires pattern)
        console.log(chalk.cyan('→ Structural stage...'));
        const { QueryAnalyzer } = require('../../lib/code-indexing/query-analyzer.cjs');
        const analyzer = new QueryAnalyzer();
        const analysis = analyzer.analyze(query);

        if (!analysis.astPattern) {
          console.log(
            chalk.yellow('Warning: No structural pattern detected, falling back to semantic search')
          );
          results = await hybridSearch.semanticStage(query, topK, language);
          results = results.map(r => ({ ...r, score: r.similarity }));
        } else {
          // Get semantic results first for structural refinement
          const semanticResults = await manager.semanticSearch(query, { limit: topK * 2 });
          results = await hybridSearch.structuralStage(
            semanticResults,
            analysis.astPattern,
            language
          );
        }
      } else {
        // Full hybrid search
        console.log(chalk.cyan('→ Stage 1: Semantic search...'));
        console.log(chalk.cyan('→ Stage 2: Structural refinement...'));
        console.log(chalk.cyan('→ Stage 3: Combining results...'));

        const searchResult = await hybridSearch.search(query, searchOptions);
        results = searchResult.results;

        // Show timing breakdown
        console.log('');
        console.log(chalk.blue('Timing:'));
        if (searchResult.timing) {
          if (searchResult.timing.semantic) {
            console.log(chalk.gray(`  Semantic: ${searchResult.timing.semantic}ms`));
          }
          if (searchResult.timing.astGrep) {
            console.log(chalk.gray(`  Structural: ${searchResult.timing.astGrep}ms`));
          }
          if (searchResult.timing.combine) {
            console.log(chalk.gray(`  Combine: ${searchResult.timing.combine}ms`));
          }
          console.log(
            chalk.gray(`  Total: ${searchResult.timing.total || Date.now() - startTime}ms`)
          );
        }
      }

      console.log('');

      // Display results
      if (!results || results.length === 0) {
        console.log(chalk.yellow('No results found'));
        await manager.close();
        process.exit(0);
        return;
      }

      console.log(chalk.green.bold(`Results: ${results.length} matches\n`));

      results.forEach((result, index) => {
        const score = result.score || result.similarity || result.structuralScore || 0;
        const scorePercent = Math.round(score * 100);

        const lineRange = result.lineRange || [result.line || 1, result.line || 1];
        const [lineStart, lineEnd] = lineRange;
        const filePath = result.filePath || result.file || 'unknown';
        const type = result.type || 'code';

        console.log(
          chalk.bold(
            `${index + 1}. ${type} - ${filePath}:${lineStart}-${lineEnd} (${scorePercent}% score)`
          )
        );

        // Show code snippet
        if (result.code || result.text) {
          const snippet = (result.code || result.text).substring(0, 150).trim();
          console.log(
            chalk.gray(`   ${snippet}${(result.code || result.text).length > 150 ? '...' : ''}`)
          );
        }
        console.log('');
      });
      await manager.close();
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error in hybrid search:'), error.message);
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

/**
 * Status command - Show index statistics
 */
program
  .command('status')
  .description('Show index statistics')
  .action(async () => {
    try {
      const metadataPath = path.join(process.cwd(), '.claude/context/code-index/metadata.json');

      // Check if index exists
      const exists = await fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        console.log(chalk.yellow('No index found. Run "index" command first.'));
        return;
      }

      // Load metadata
      const metadata = safeParseJSON(await fs.readFile(metadataPath, 'utf8'));

      console.log(chalk.blue.bold('Index Status:'));
      console.log(`  Created: ${new Date(metadata.timestamp).toLocaleString()}`);
      console.log(`  Files: ${metadata.stats.files}`);
      console.log(`  Chunks: ${metadata.stats.chunks}`);

      // Calculate size
      const statsFile = await fs.stat(metadataPath);
      const sizeMB = (statsFile.size / (1024 * 1024)).toFixed(2);
      console.log(`  Size: ${sizeMB} MB`);

      // Show language breakdown
      if (metadata.stats.byLanguage) {
        console.log(
          `  Languages: ${Object.entries(metadata.stats.byLanguage)
            .map(([lang, count]) => `${lang} (${count})`)
            .join(', ')}`
        );
      }

      // Check hybrid search availability
      try {
        const { AstGrepSearch } = require('../../lib/code-indexing/ast-grep-wrapper.cjs');
        const astGrep = new AstGrepSearch();
        const available = await astGrep.isAvailable();
        console.log(`\nHybrid Search:`);
        console.log(`  Semantic: ${chalk.green('✓ Available')}`);
        console.log(
          `  Structural (ast-grep): ${available ? chalk.green('✓ Available') : chalk.yellow('○ Not available')}`
        );
        if (available) {
          const version = await astGrep.getVersion();
          console.log(`  ast-grep version: ${version}`);
        }
      } catch (_error) {
        console.log(`\nHybrid Search: ${chalk.yellow('○ Partially available (semantic only)')}`);
      }
      // The original code had a malformed block here, removing it and adding the requested exit.
      // if (isTerminal) {
      //  console.log(chalk.cyan('File Index Checkpoint:'));
      //  console.log(JSON.stringify(stats.files, null, 2));
      // }

      // The status command does not create an IndexManager, so manager.close() is not applicable.
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error getting status:'), error.message);
      process.exit(1);
    }
  });

/**
 * Clear command - Clear the index
 */
program
  .command('clear')
  .description('Clear the index')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async options => {
    try {
      const indexDir = path.join(process.cwd(), '.claude/context/code-index');

      // Check if index exists
      const exists = await fs
        .access(indexDir)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        console.log(chalk.yellow('No index found.'));
        return;
      }

      if (!options.confirm) {
        console.log(chalk.yellow('Warning: This will delete the entire index.'));
        console.log(chalk.yellow('Run with --confirm to proceed.'));
        return;
      }

      // Delete index
      await fs.rm(indexDir, { recursive: true, force: true });
      console.log(chalk.green('✓ Index cleared'));
    } catch (error) {
      console.error(chalk.red('Error clearing index:'), error.message);
      process.exit(1);
    }
  });

async function main() {
  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }

  return { ok: true };
}

const wrappedMain = wrapCLITool(main, 'index-codebase');

if (require.main === module) {
  wrappedMain();
}
