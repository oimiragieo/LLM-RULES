#!/usr/bin/env node
'use strict';

/**
 * File Watcher Daemon Entry Point
 * ===============================
 * Triggers the continuous file watcher to populate the `message_queue`
 * with `FILE_INGEST` events for Always-On memory.
 */

const path = require('path');
const { startWatcher } = require('../../lib/memory/ingestion/file-watcher.cjs');

const rootDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : process.cwd();

console.log(`[File Watcher] Initializing background watcher for: ${rootDir}`);
startWatcher(rootDir);

// Keep the process alive indefinitely
setInterval(() => {}, 1000 * 60 * 60);
