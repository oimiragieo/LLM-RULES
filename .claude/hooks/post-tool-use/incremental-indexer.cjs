#!/usr/bin/env node
/**
 * Incremental Indexer Hook - Post-Edit
 * 
 * Background embedding of changed files.
 * Queues files for embedding, processes in batches.
 * 
 * Non-blocking: Returns immediately, processes in background.
 */

'use strict';

const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');
const { parseHookInputAsync, getToolName, getToolInput } = require('../../lib/utils/hook-input.cjs');
const path = require('path');

// Global queue shared across hook invocations
const globalQueue = new Set();
let isProcessing = false;

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }
    
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);
    
    // Only care about file writes
    if (!['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
      process.exit(0);
    }
    
    const filePath = toolInput?.file_path || toolInput?.target_file;
    if (!filePath) {
      process.exit(0);
    }
    
    // Skip non-source files
    if (!isSourceFile(filePath)) {
      process.exit(0);
    }
    
    // Skip node_modules, .git, etc.
    if (isExcluded(filePath)) {
      process.exit(0);
    }
    
    // Add to queue
    globalQueue.add(filePath);
    
    // Don't wait for processing - exit immediately
    // Background processing happens after hook returns
    setImmediate(() => processQueue());
    
    process.exit(0);
  } catch (err) {
    // Silent fail - indexing is best-effort
    console.error('[incremental-indexer] Error:', err.message);
    process.exit(0);
  }
}

function isSourceFile(filePath) {
  return /\.(js|ts|jsx|tsx|cjs|mjs|py|go|rs|java|cs|cpp|c|h|hpp|rb|php)$/i.test(filePath);
}

function isExcluded(filePath) {
  const excluded = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.claude',
    '.tmp',
    '.next',
    'coverage',
  ];
  
  const normalized = filePath.replace(/\\/g, '/');
  return excluded.some(e => normalized.includes(e));
}

async function processQueue() {
  if (isProcessing || globalQueue.size === 0) {
    return;
  }
  
  isProcessing = true;
  
  try {
    const indexer = new HybridLazyIndexer({
      embeddingEnabled: process.env.HYBRID_EMBEDDINGS !== 'off',
    });
    
    // Process up to 5 files at a time
    const batch = Array.from(globalQueue).slice(0, 5);
    
    for (const filePath of batch) {
      globalQueue.delete(filePath);
      
      try {
        await indexer.incrementalUpdate(filePath);
        console.error(`[incremental-indexer] Indexed: ${filePath}`);
      } catch (err) {
        console.error(`[incremental-indexer] Failed ${filePath}:`, err.message);
      }
      
      // Small delay between files to not block
      await sleep(100);
    }
  } catch (err) {
    console.error('[incremental-indexer] Queue error:', err.message);
  } finally {
    isProcessing = false;
    
    // Process more if queue has items
    if (globalQueue.size > 0) {
      setImmediate(() => processQueue());
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  main();
}

module.exports = { main, globalQueue, isSourceFile, isExcluded };
