#!/usr/bin/env node
/**
 * Context Path Resolver
 *
 * Centralized path resolution for context files with backward compatibility.
 * Enforces canonical paths for writes, falls back to old paths for reads.
 *
 * Resolver Contract:
 * - Writes ALWAYS go to canonical paths
 * - Reads fall back to old paths if canonical doesn't exist
 * - When both exist, prefer canonical (new) path
 * - On mismatch, warn and use canonical (auto-migrate on write)
 *
 * Usage:
 *   import { resolveConfigPath, resolveRuntimePath, resolveArtifactPath } from './context-path-resolver.mjs';
 */

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../../..');

// Canonical paths
const CANONICAL_PATHS = {
  config: join(ROOT, '.claude/context/config'),
  runtime: join(ROOT, '.claude/context/runtime'),
  artifacts: join(ROOT, '.claude/context/artifacts'),
};

// Legacy paths (for backward compatibility)
const LEGACY_PATHS = {
  config: join(ROOT, '.claude/context'),
  runtime: join(ROOT, '.claude/context'),
  artifacts: join(ROOT, '.claude/context/artifacts'), // Artifacts stay in same location
};

/**
 * Get file modification time, or 0 if file doesn't exist
 */
function getMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function looksLikeDirectorySubpath(subpath) {
  const normalized = String(subpath ?? '').replace(/\\/g, '/');
  if (!normalized) return false;
  const lastSegment = normalized.split('/').filter(Boolean).pop();
  if (!lastSegment) return false;
  return !lastSegment.includes('.');
}

/**
 * Check if both old and new paths exist, return precedence decision
 */
export function checkPathPrecedence(oldPath, newPath) {
  const oldExists = existsSync(oldPath);
  const newExists = existsSync(newPath);

  if (!oldExists && !newExists) {
    return { exists: false, prefer: 'new' };
  }

  if (oldExists && !newExists) {
    return { exists: true, prefer: 'old', shouldMigrate: true };
  }

  if (!oldExists && newExists) {
    return { exists: true, prefer: 'new' };
  }

  // Both exist - prefer canonical (new)
  const oldMtime = getMtime(oldPath);
  const newMtime = getMtime(newPath);

  if (newMtime >= oldMtime) {
    return { exists: true, prefer: 'new', bothExist: true };
  } else {
    return { exists: true, prefer: 'new', bothExist: true, newer: 'old', shouldWarn: true };
  }
}

/**
 * Resolve config file path
 * @param {string} filename - Config file name (e.g., 'cuj-registry.json')
 * @param {object} options - Options { read?: boolean, write?: boolean }
 * @returns {string} Resolved path
 */
export function resolveConfigPath(filename, options = {}) {
  // Validate options: must specify either read or write, not both
  const isRead = options.read === true;
  if (isRead && options.write === true) {
    throw new Error('resolveConfigPath: cannot set both read and write');
  }
  const isWrite = options.write === true || (!isRead && !options.read); // Default to write if neither specified

  const canonicalPath = join(CANONICAL_PATHS.config, filename);
  const legacyPath = join(LEGACY_PATHS.config, filename);

  // Check if we should skip directory creation (for --no-side-effects mode)
  const skipDirCreation =
    process.env.SKIP_WORKFLOW_EXECUTION === 'true' ||
    process.env.NO_SIDE_EFFECTS === 'true' ||
    process.argv.includes('--no-side-effects') ||
    process.argv.includes('--ci') ||
    process.argv.includes('--dry-run');

  if (isWrite && !skipDirCreation) {
    // Write: always use canonical
    // Ensure directory exists (unless in read-only mode)
    mkdirSync(dirname(canonicalPath), { recursive: true });
    return canonicalPath;
  }

  if (isWrite && skipDirCreation) {
    // Write mode but in read-only: return canonical path without creating dir
    return canonicalPath;
  }

  // Read: fall back to legacy if canonical doesn't exist
  if (existsSync(canonicalPath)) {
    return canonicalPath;
  }

  if (existsSync(legacyPath)) {
    // Warn if both exist (shouldn't happen for config, but handle gracefully)
    const precedence = checkPathPrecedence(legacyPath, canonicalPath);
    if (precedence.shouldWarn) {
      console.warn(`⚠️  Both old and new paths exist for ${filename}. Using canonical path.`);
    }
    return legacyPath;
  }

  // Neither exists - return canonical for writes
  return canonicalPath;
}

/**
 * Resolve runtime file/directory path
 * @param {string} subpath - Runtime subpath (e.g., 'analytics/cuj-performance.json' or 'runs/')
 * @param {object} options - Options { read?: boolean, write?: boolean }
 * @returns {string} Resolved path
 */
export function resolveRuntimePath(subpath, options = {}) {
  // Validate options: must specify either read or write, not both
  const isRead = options.read === true;
  if (isRead && options.write === true) {
    throw new Error('resolveRuntimePath: cannot set both read and write');
  }
  const isWrite = options.write === true || (!isRead && !options.read); // Default to write if neither specified

  const canonicalPath = join(CANONICAL_PATHS.runtime, subpath);
  const legacyPath = join(LEGACY_PATHS.runtime, subpath);

  // Check if we should skip directory creation (for --no-side-effects mode)
  const skipDirCreation =
    process.env.SKIP_WORKFLOW_EXECUTION === 'true' ||
    process.env.NO_SIDE_EFFECTS === 'true' ||
    process.argv.includes('--no-side-effects') ||
    process.argv.includes('--ci') ||
    process.argv.includes('--dry-run');

  if (isWrite && !skipDirCreation) {
    // Write: always use canonical
    // Ensure directory exists (unless in read-only mode)
    const dirToCreate = looksLikeDirectorySubpath(subpath) ? canonicalPath : dirname(canonicalPath);
    mkdirSync(dirToCreate, { recursive: true });
    return canonicalPath;
  }

  if (isWrite && skipDirCreation) {
    // Write mode but in read-only: return canonical path without creating dir
    return canonicalPath;
  }

  // Read: fall back to legacy if canonical doesn't exist
  if (existsSync(canonicalPath)) {
    return canonicalPath;
  }

  if (existsSync(legacyPath)) {
    const precedence = checkPathPrecedence(legacyPath, canonicalPath);
    if (precedence.shouldWarn) {
      console.warn(`⚠️  Both old and new paths exist for ${subpath}. Using canonical path.`);
    }
    return legacyPath;
  }

  // Neither exists - return canonical for writes
  return canonicalPath;
}

/**
 * Resolve artifact file path
 * @param {object} options - Options { kind: 'generated'|'reference', filename: string }
 * @returns {string} Resolved path
 */
export function resolveArtifactPath({ kind = 'generated', filename }) {
  if (kind === 'reference') {
    const path = join(CANONICAL_PATHS.artifacts, 'reference', filename);
    mkdirSync(dirname(path), { recursive: true });
    return path;
  }

  // Generated artifacts
  const path = join(CANONICAL_PATHS.artifacts, 'generated', filename);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/**
 * Get canonical path for a type
 * @param {string} type - 'config', 'runtime', or 'artifacts'
 * @param {...string} parts - Path parts
 * @returns {string} Canonical path
 */
export function getCanonicalPath(type, ...parts) {
  const base = CANONICAL_PATHS[type];
  if (!base) {
    throw new Error(`Unknown path type: ${type}`);
  }
  return join(base, ...parts);
}

/**
 * Idempotent migration helper
 * @param {string} oldPath - Old file path
 * @param {string} newPath - New (canonical) file path
 * @param {object} options - Options { mergePolicy: 'prefer-newer'|'append'|'overwrite' }
 * @returns {boolean} True if migration occurred
 */
export function migrateIfNeeded(oldPath, newPath, options = { mergePolicy: 'prefer-newer' }) {
  const oldExists = existsSync(oldPath);
  const newExists = existsSync(newPath);

  if (!oldExists) {
    return false; // Nothing to migrate
  }

  if (newExists) {
    // Both exist - check timestamps
    const oldMtime = getMtime(oldPath);
    const newMtime = getMtime(newPath);

    if (newMtime >= oldMtime) {
      // New is newer or same - skip migration
      return false;
    }

    // Old is newer - merge based on policy
    if (options.mergePolicy === 'prefer-newer') {
      // For JSON files, merge arrays and prefer newer values
      try {
        const oldData = JSON.parse(readFileSync(oldPath, 'utf8'));
        const newData = JSON.parse(readFileSync(newPath, 'utf8'));

        // Merge: prefer newer values, append arrays
        const merged = { ...newData };
        for (const [key, value] of Object.entries(oldData)) {
          if (Array.isArray(value) && Array.isArray(merged[key])) {
            // Append unique items
            merged[key] = [...new Set([...merged[key], ...value])];
          } else if (!(key in merged)) {
            merged[key] = value;
          }
        }

        writeFileSync(newPath, JSON.stringify(merged, null, 2));
        return true;
      } catch (error) {
        console.warn(`⚠️  Could not merge ${oldPath} into ${newPath}:`, error.message);
        return false;
      }
    } else if (options.mergePolicy === 'append') {
      // Append old to new (for log files, etc.)
      const oldContent = readFileSync(oldPath, 'utf8');
      const newContent = newExists ? readFileSync(newPath, 'utf8') : '';
      writeFileSync(newPath, newContent + oldContent);
      return true;
    } else {
      // overwrite - use old (newer) data
      const oldContent = readFileSync(oldPath, 'utf8');
      writeFileSync(newPath, oldContent);
      return true;
    }
  }

  // New doesn't exist - migrate
  mkdirSync(dirname(newPath), { recursive: true });
  const content = readFileSync(oldPath);
  writeFileSync(newPath, content);
  return true;
}

// Export for testing
export { CANONICAL_PATHS, LEGACY_PATHS };
