#!/usr/bin/env node
/**
 * LanceDB Version Compaction Tool
 *
 * Safely removes old LanceDB version manifests and orphaned data files.
 * Keeps the latest N versions (default: 3) for rollback safety.
 *
 * Usage: node compact-lancedb.cjs [--keep=N] [--dry-run]
 *
 * @see https://lancedb.github.io/lancedb/guides/storage/#versioning
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const keepVersions = parseInt(args.find(a => a.startsWith('--keep='))?.split('=')[1] || '3', 10);
const dryRun = args.includes('--dry-run');

// Paths
const projectRoot = path.resolve(__dirname, '../../..');
const lancedbPath = path.join(
  projectRoot,
  '.claude',
  'context',
  'data',
  'lancedb',
  'code_index.lance'
);
const versionsPath = path.join(lancedbPath, '_versions');
const dataPath = path.join(lancedbPath, 'data');
const transactionsPath = path.join(lancedbPath, '_transactions');

// Validate paths
if (!fs.existsSync(versionsPath)) {
  console.error(`Error: Versions directory not found: ${versionsPath}`);
  process.exit(1);
}

console.log(`LanceDB Compaction Tool`);
console.log(`======================\n`);
console.log(`LanceDB path: ${lancedbPath}`);
console.log(`Keep latest: ${keepVersions} versions`);
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will delete files)'}\n`);

// Step 1: List all version manifests
const manifestFiles = fs
  .readdirSync(versionsPath)
  .filter(f => f.endsWith('.manifest'))
  .map(f => {
    const versionNum = parseInt(f.replace('.manifest', ''), 10);
    return { file: f, version: versionNum, path: path.join(versionsPath, f) };
  })
  .sort((a, b) => a.version - b.version);

if (manifestFiles.length === 0) {
  console.log('No manifest files found. Nothing to clean up.');
  process.exit(0);
}

console.log(
  `Found ${manifestFiles.length} version manifests (${manifestFiles[0].version} - ${manifestFiles[manifestFiles.length - 1].version})`
);

// Step 2: Identify versions to delete
const latestVersion = manifestFiles[manifestFiles.length - 1].version;
const keepFromVersion = Math.max(1, latestVersion - keepVersions + 1);
const manifestsToDelete = manifestFiles.filter(m => m.version < keepFromVersion);
const manifestsToKeep = manifestFiles.filter(m => m.version >= keepFromVersion);

console.log(
  `\nVersions to KEEP: ${manifestsToKeep.map(m => m.version).join(', ')} (${manifestsToKeep.length} files)`
);
console.log(
  `Versions to DELETE: ${manifestsToDelete.map(m => m.version).join(', ')} (${manifestsToDelete.length} files)`
);

if (manifestsToDelete.length === 0) {
  console.log('\nNo old versions to clean up.');
  process.exit(0);
}

// Step 3: Conservative approach - keep ALL data files
// LanceDB manifest format uses complex encoding for filenames (prefix can be 0, 1, or 8)
// Parsing this reliably is difficult, and since this is BM25-only mode (index can be rebuilt),
// we'll take the safe approach: only delete manifests and transactions, keep all data files.
console.log(
  `\nData files: Keeping ALL (cannot reliably identify orphaned files from binary manifests)`
);

const orphanedDataFiles = []; // Don't delete any data files
if (fs.existsSync(dataPath)) {
  const allDataFiles = fs.readdirSync(dataPath).filter(f => f.endsWith('.lance'));
  console.log(`Total data files: ${allDataFiles.length}, Orphaned: 0 (conservative mode)`);
}

// Step 5: Find orphaned transaction files
let orphanedTransactions = [];
if (fs.existsSync(transactionsPath)) {
  const allTransactions = fs.readdirSync(transactionsPath).filter(f => f.endsWith('.txn'));
  const keepTransactionVersions = new Set(manifestsToKeep.map(m => m.version));
  orphanedTransactions = allTransactions.filter(f => {
    const txnVersion = parseInt(f.split('-')[0], 10);
    return !keepTransactionVersions.has(txnVersion);
  });
  console.log(
    `Total transaction files: ${allTransactions.length}, Orphaned: ${orphanedTransactions.length}`
  );
}

// Step 6: Calculate disk savings
const getFileSize = filePath => {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
};

const manifestsSize = manifestsToDelete.reduce((sum, m) => sum + getFileSize(m.path), 0);
const dataSize = orphanedDataFiles.reduce((sum, f) => sum + getFileSize(path.join(dataPath, f)), 0);
const txnSize = orphanedTransactions.reduce(
  (sum, f) => sum + getFileSize(path.join(transactionsPath, f)),
  0
);
const totalSize = manifestsSize + dataSize + txnSize;

console.log(`\nDisk space to reclaim:`);
console.log(`  Manifests: ${(manifestsSize / 1024).toFixed(2)} KB`);
console.log(`  Data files: ${(dataSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`  Transactions: ${(txnSize / 1024).toFixed(2)} KB`);
console.log(`  TOTAL: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

// Step 7: Delete files (or dry-run)
if (dryRun) {
  console.log(`\n[DRY RUN] Would delete:`);
  console.log(`  ${manifestsToDelete.length} version manifests`);
  console.log(`  ${orphanedDataFiles.length} data files`);
  console.log(`  ${orphanedTransactions.length} transaction files`);
  console.log(`\nRun without --dry-run to actually delete files.`);
  process.exit(0);
}

// Actual deletion
console.log(`\nDeleting files...`);
const deleted = { manifests: 0, data: 0, transactions: 0 };

for (const manifest of manifestsToDelete) {
  try {
    fs.unlinkSync(manifest.path);
    deleted.manifests++;
  } catch (err) {
    console.error(`Failed to delete ${manifest.file}: ${err.message}`);
  }
}

for (const dataFile of orphanedDataFiles) {
  try {
    fs.unlinkSync(path.join(dataPath, dataFile));
    deleted.data++;
  } catch (err) {
    console.error(`Failed to delete ${dataFile}: ${err.message}`);
  }
}

for (const txnFile of orphanedTransactions) {
  try {
    fs.unlinkSync(path.join(transactionsPath, txnFile));
    deleted.transactions++;
  } catch (err) {
    console.error(`Failed to delete ${txnFile}: ${err.message}`);
  }
}

console.log(`\nDeleted:`);
console.log(`  ${deleted.manifests}/${manifestsToDelete.length} version manifests`);
console.log(`  ${deleted.data}/${orphanedDataFiles.length} data files`);
console.log(`  ${deleted.transactions}/${orphanedTransactions.length} transaction files`);
console.log(`\nCleanup complete. Disk space saved: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
