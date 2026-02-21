'use strict';

/**
 * Canonical memory system paths.
 *
 * Single source of truth for all DB and vector-store locations so that
 * hooks, CLI tools, and library code can never drift apart.
 *
 * Import pattern (adjust relative depth as needed):
 *   const { MEMORY_DB_PATH, LANCEDB_DIR } = require('<rel>/lib/memory/memory-paths.cjs');
 */

const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/** Canonical SQLite entity database */
const MEMORY_DB_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'memory.db');

/** Canonical LanceDB vector-store directory */
const LANCEDB_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'lancedb');

/** Root directory for all core memory markdown/JSON files */
const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');

module.exports = { MEMORY_DB_PATH, LANCEDB_DIR, MEMORY_DIR };
