#!/usr/bin/env node
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

/**
 * Embedding Generator CLI Tool
 *
 * Generates embeddings for existing memory files and stores them in LanceDB.
 * Supports chunking by markdown sections and handles archived files.
 *
 * Usage:
 *   node generate-embeddings.cjs [options]
 *
 * Options:
 *   --source <path>     Source directory containing memory files (default: .claude/context/memory)
 *   --file <path>       Single file to process (absolute or relative to project root)
 *   --batch-size <num>  Batch size for embedding generation (default: 100)
 *   --reindex           Drop existing LanceDB table before embedding
 *   --dry-run           Preview what would be processed without actually generating embeddings
 *
 * Related: Task #24 (P1-1.2)
 * Spec: .claude/context/artifacts/specs/memory-system-enhancement-spec.md Section 6.2
 */

const fs = require('fs');
const path = require('path');
const { MemoryVectorStore } = require('../../lib/memory/lancedb-client.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

/**
 * Chunk markdown content by section headers (##)
 *
 * @param {string} content - Markdown content
 * @param {string} filePath - Source file path (for line number tracking)
 * @returns {Array<{section: string, content: string, line: number}>}
 */
function chunkByHeaders(content, _filePath) {
  const lines = content.split('\n');
  const chunks = [];
  let currentSection = null;
  let currentContent = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Detect section headers (## Header or ### Header)
    if (line.match(/^##\s+(.+)$/)) {
      // Save previous section if exists
      if (currentSection) {
        chunks.push({
          section: currentSection,
          content: currentContent.join('\n').trim(),
          line: startLine,
        });
      }

      // Start new section
      currentSection = line.replace(/^##\s+/, '').trim();
      currentContent = [];
      startLine = lineNumber;
    } else {
      // Add content to current section
      if (currentSection) {
        currentContent.push(line);
      }
    }
  }

  // Save last section
  if (currentSection && currentContent.length > 0) {
    chunks.push({
      section: currentSection,
      content: currentContent.join('\n').trim(),
      line: startLine,
    });
  }

  return chunks;
}

function loadJsonEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed = [];
  try {
    parsed = safeParseJSON(raw);
  } catch (_e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(entry => {
      if (typeof entry === 'string') {
        return { text: entry, content: null, timestamp: null };
      }
      if (entry && typeof entry === 'object') {
        return {
          text: entry.text || entry.title || entry.name || '',
          content: entry.content || null,
          timestamp: entry.timestamp || null,
        };
      }
      return null;
    })
    .filter(entry => entry && entry.text);
}

/**
 * Extract metadata from markdown file
 *
 * @param {string} filePath - Path to file (relative to memory directory)
 * @param {string} section - Section name
 * @param {number} line - Line number
 * @returns {Object} Metadata object
 */
function extractMetadata(filePath, section, line) {
  const basename = path.basename(filePath, '.md');
  const today = new Date().toISOString().split('T')[0];

  // Determine type from file name
  let type = 'unknown';
  if (basename.includes('learning')) {
    type = 'learning';
  } else if (basename.includes('decision')) {
    type = 'decision';
  } else if (basename.includes('issue')) {
    type = 'issue';
  }

  return {
    filePath: basename + '.md',
    section,
    line,
    type,
    timestamp: today,
  };
}

function extractJsonMetadata(filePath) {
  const basename = path.basename(filePath, '.json');
  return {
    filePath: basename + '.json',
    section: basename,
    line: null,
    type: basename === 'patterns' ? 'pattern' : basename === 'gotchas' ? 'issue' : 'memory',
    timestamp: new Date().toISOString().split('T')[0],
  };
}

/**
 * Find all memory files (including archived)
 *
 * @param {string} sourceDir - Source directory
 * @returns {Array<string>} List of file paths
 */
function findMemoryFiles(sourceDir) {
  const files = [];

  // Main memory files
  const mainFiles = ['learnings.md', 'decisions.md', 'issues.md', 'patterns.json', 'gotchas.json'];
  for (const file of mainFiles) {
    const fullPath = path.join(sourceDir, file);
    if (fs.existsSync(fullPath)) {
      files.push(fullPath);
    }
  }

  // Archived files
  const archiveDir = path.join(sourceDir, 'archive');
  if (fs.existsSync(archiveDir)) {
    const yearMonths = fs.readdirSync(archiveDir);
    for (const yearMonth of yearMonths) {
      const yearMonthPath = path.join(archiveDir, yearMonth);
      if (fs.statSync(yearMonthPath).isDirectory()) {
        const archivedFiles = fs.readdirSync(yearMonthPath);
        for (const file of archivedFiles) {
          if (file.endsWith('.md')) {
            files.push(path.join(yearMonthPath, file));
          }
        }
      }
    }
  }

  return files;
}

/**
 * Process a single memory file
 *
 * @param {string} filePath - Path to file
 * @param {Object} options - Processing options
 * @param {MemoryVectorStore} vectorStore - Vector store instance
 * @returns {Promise<number>} Number of chunks processed
 */
async function processFile(filePath, options, vectorStore) {
  const ext = path.extname(filePath).toLowerCase();
  const isJson = ext === '.json';
  const chunks = isJson
    ? loadJsonEntries(filePath)
    : chunkByHeaders(fs.readFileSync(filePath, 'utf8'), filePath);

  if (options.dryRun) {
    console.log(
      `  [DRY RUN] Would process ${chunks.length} chunks from ${path.basename(filePath)}`
    );
    return chunks.length;
  }

  // Generate embeddings for each chunk and upsert into LanceDB
  const docs = chunks.map((chunk, index) => {
    const metadata = isJson
      ? extractJsonMetadata(filePath)
      : extractMetadata(filePath, chunk.section, chunk.line);
    const documentId = isJson
      ? `${metadata.filePath}-${index + 1}`
      : `${metadata.filePath}-${chunk.line}`;
    const documentText = isJson
      ? `${chunk.text}${chunk.content ? `\n\n${chunk.content}` : ''}`
      : `${chunk.section}\n\n${chunk.content}`;
    const docMeta = {
      ...metadata,
      source: metadata.filePath,
    };
    return { id: documentId, text: documentText, metadata: docMeta };
  });

  await vectorStore.upsertDocuments(docs);

  console.log(`  Processed ${chunks.length} chunks from ${path.basename(filePath)}`);
  return chunks.length;
}

async function reindexIfNeeded(vectorStore, options) {
  if (!options?.reindex) return false;
  if (!vectorStore || typeof vectorStore.dropTable !== 'function') {
    throw new Error('LanceDB table drop is unavailable');
  }
  await vectorStore.dropTable();
  return true;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    sourceDir: '.claude/context/memory',
    batchSize: 100,
    dryRun: false,
    file: null,
    reindex: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && i + 1 < args.length) {
      options.sourceDir = args[i + 1];
      i++;
    } else if (args[i] === '--batch-size' && i + 1 < args.length) {
      options.batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--reindex') {
      options.reindex = true;
    } else if (args[i] === '--file' && i + 1 < args.length) {
      options.file = args[i + 1];
      i++;
    }
  }

  // Resolve source directory
  const PROJECT_ROOT = path.resolve(__dirname, '../../..');
  const sourceDir = path.resolve(PROJECT_ROOT, options.sourceDir);

  console.log('Embedding Generator');
  console.log('==================');
  console.log(`Source directory: ${sourceDir}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  if (options.reindex) {
    console.log('Reindex: enabled (existing table will be dropped)');
  }
  console.log('');

  // Find files
  let files = [];
  if (options.file) {
    const filePath = path.isAbsolute(options.file)
      ? options.file
      : path.resolve(PROJECT_ROOT, options.file);
    files = [filePath];
  } else {
    files = findMemoryFiles(sourceDir);
  }
  console.log(`Found ${files.length} memory files to process`);
  console.log('');

  if (options.dryRun) {
    // Dry run - just show what would be processed
    for (const file of files) {
      await processFile(file, options, null);
    }
    console.log('');
    console.log('[DRY RUN] No embeddings were actually generated');
    return;
  }

  // Initialize vector store
  console.log('Initializing LanceDB...');
  const vectorStore = new MemoryVectorStore({
    persistDirectory: path.join(PROJECT_ROOT, '.claude/context/data/lancedb'),
    collectionName: process.env.LANCEDB_TABLE || 'agent_memory',
  });

  // Check if available
  const available = await vectorStore.isAvailable();
  if (!available) {
    console.error('ERROR: LanceDB is not available');
    process.exit(1);
  }

  console.log('LanceDB initialized successfully');
  if (options.reindex) {
    console.log(`Dropping table: ${vectorStore.config.collectionName}`);
    await reindexIfNeeded(vectorStore, options);
  }
  console.log('');

  // Process files
  let totalChunks = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!['.md', '.json'].includes(ext)) {
      console.log(`  Skipping unsupported file: ${path.basename(file)}`);
      continue;
    }
    try {
      totalChunks += await processFile(file, options, vectorStore);
    } catch (error) {
      if (String(error?.message || '').includes('embedding dimension mismatch')) {
        console.error('ERROR: Embedding dimension mismatch detected.');
        console.error('Run with --reindex to rebuild the LanceDB table.');
      }
      throw error;
    }
  }

  console.log('');
  console.log('✅ Embedding generation complete');
  console.log(`   Total chunks processed: ${totalChunks}`);
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Estimated cost: $0.01 (one-time)`);
}

// Export for testing
module.exports = {
  chunkByHeaders,
  extractMetadata,
  findMemoryFiles,
  processFile,
  reindexIfNeeded,
};

const wrappedMain = wrapCLITool(main, 'generate-embeddings');

if (require.main === module) {
  wrappedMain();
}
