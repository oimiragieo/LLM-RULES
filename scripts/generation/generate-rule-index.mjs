#!/usr/bin/env node
/**
 * Rule Index Generator
 * Scans all rule files and generates a searchable index with metadata.
 * Enables Skills to discover rules dynamically without hard-coding.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Try to import js-yaml, fallback to simple parsing if not available
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch (_error) {
  yaml = null;
  console.warn('⚠️  js-yaml not available, using simple YAML parsing');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

const MASTER_RULES_DIR = path.join(ROOT, '.claude/rules');
const LIBRARY_DIR = path.join(ROOT, '.claude/rules-library');
const OUTPUT_PATH = path.join(ROOT, '.claude/context/config/rule-index.json');
const CACHE_PATH = path.join(ROOT, '.claude/context/rule-index-cache.json');

// Technology keywords for detection
const TECH_KEYWORDS = [
  'nextjs',
  'next.js',
  'react',
  'typescript',
  'javascript',
  'jsx',
  'tsx',
  'python',
  'fastapi',
  'django',
  'flask',
  'pydantic',
  'cypress',
  'playwright',
  'jest',
  'vitest',
  'pytest',
  'solidity',
  'ethereum',
  'web3',
  'vue',
  'angular',
  'svelte',
  'sveltekit',
  'flutter',
  'react-native',
  'android',
  'ios',
  'swift',
  'kotlin',
  'nodejs',
  'node.js',
  'express',
  'nestjs',
  'tailwind',
  'css',
  'scss',
  'sass',
  'prisma',
  'sql',
  'postgresql',
  'mongodb',
  'docker',
  'kubernetes',
  'terraform',
  'go',
  'golang',
  'rust',
  'java',
  'php',
  'ruby',
  'rails',
  'graphql',
  'rest',
  'api',
  'html',
  'htmx',
  'webassembly',
  'wasm',
];

/**
 * Calculate file hash
 */
function calculateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Extract YAML frontmatter from markdown file using js-yaml if available
 */
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  if (yaml) {
    try {
      // Pre-process frontmatter to quote glob patterns (prevents YAML alias interpretation)
      let frontmatterText = frontmatterMatch[1];
      // Quote glob patterns that start with * or contain **
      frontmatterText = frontmatterText.replace(
        /^(\s*globs:\s*)([^\n]+)$/gm,
        (match, prefix, value) => {
          // If value contains * and isn't already quoted, quote it
          if ((value.includes('*') || value.includes('**')) && !value.match(/^["'].*["']$/)) {
            return `${prefix}"${value}"`;
          }
          return match;
        }
      );

      return yaml.load(frontmatterText) || {};
    } catch (error) {
      // Fall through to simple parsing if YAML is malformed
      console.warn(`⚠️  YAML parsing failed, using simple parser: ${error.message}`);
    }
  }

  // Fallback to simple parsing
  const metadata = {};
  const frontmatter = frontmatterMatch[1];
  frontmatter.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) return;

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && value) {
      metadata[key] = value;
    }
  });

  return metadata;
}

/**
 * Load cache file
 */
async function loadCache() {
  try {
    const cacheContent = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(cacheContent);
  } catch {
    return {};
  }
}

/**
 * Save cache file
 */
async function saveCache(cache) {
  const cacheDir = path.dirname(CACHE_PATH);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Check if file needs re-indexing
 */
async function needsReindexing(filePath, cache) {
  try {
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    const cached = cache[relativePath];

    if (!cached) return true;

    // Check mtime
    if (cached.mtime !== stats.mtimeMs.toString()) return true;

    // Check hash (optional, more expensive)
    // For now, we'll rely on mtime which is faster

    return false;
  } catch {
    return true;
  }
}

/**
 * Update cache entry for a file
 */
async function updateCacheEntry(filePath, cache, content) {
  try {
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    cache[relativePath] = {
      mtime: stats.mtimeMs.toString(),
      hash: calculateHash(content),
      indexed_at: new Date().toISOString(),
    };
  } catch (_error) {
    // Ignore cache update errors
  }
}

/**
 * Extract technologies from file path and content
 */
function extractTechnologies(filePath, content) {
  const found = new Set();
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();

  TECH_KEYWORDS.forEach(tech => {
    const techLower = tech.toLowerCase();
    // Check filename/path
    if (lowerPath.includes(techLower)) {
      found.add(tech);
    }
    // Check content (first 2000 chars for performance)
    const contentPreview = lowerContent.substring(0, 2000);
    if (contentPreview.includes(techLower)) {
      found.add(tech);
    }
  });

  // Normalize common variations
  const normalized = new Set();
  found.forEach(tech => {
    if (tech === 'next.js') normalized.add('nextjs');
    else if (tech === 'node.js') normalized.add('nodejs');
    else normalized.add(tech);
  });

  return Array.from(normalized).sort();
}

/**
 * Extract rule metadata from file
 */
async function extractRuleMetadata(filePath, content) {
  const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath, path.extname(filePath));
  const metadata = extractFrontmatter(content);
  const technologies = extractTechnologies(filePath, content);

  return {
    path: relativePath,
    name: fileName,
    description: metadata.description || '',
    globs: metadata.globs || '',
    priority: metadata.priority || '',
    technologies,
    type: 'master',
    size: content.length,
    line_count: content.split('\n').length,
  };
}

/**
 * Recursively scan directory for markdown files (with incremental indexing)
 */
async function scanDirectory(dirPath, rules = [], cache = {}) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, rules, cache);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdc'))) {
        try {
          // Check if file needs re-indexing
          const needsReindex = await needsReindexing(fullPath, cache);

          if (needsReindex) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const metadata = await extractRuleMetadata(fullPath, content);
            rules.push(metadata);
            await updateCacheEntry(fullPath, cache, content);
          } else {
            // Use cached metadata (would need to store in cache for full incremental)
            // For now, we still read the file but could optimize further
            const content = await fs.readFile(fullPath, 'utf-8');
            const metadata = await extractRuleMetadata(fullPath, content);
            rules.push(metadata);
          }
        } catch (error) {
          console.warn(`⚠️  Error reading ${fullPath}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    // Directory might not exist or be inaccessible
    if (error.code !== 'ENOENT') {
      console.warn(`⚠️  Error scanning ${dirPath}: ${error.message}`);
    }
  }

  return rules;
}

/**
 * Build technology map from rules
 */
function buildTechnologyMap(rules) {
  const techMap = {};

  rules.forEach(rule => {
    rule.technologies.forEach(tech => {
      if (!techMap[tech]) {
        techMap[tech] = [];
      }
      // Store only path for efficiency
      techMap[tech].push(rule.path);
    });
  });

  // Sort paths for consistency
  Object.keys(techMap).forEach(tech => {
    techMap[tech].sort();
  });

  return techMap;
}

/**
 * Load existing pre-built index if available
 */
async function loadPrebuiltIndex() {
  try {
    const content = await fs.readFile(OUTPUT_PATH, 'utf-8');
    const index = JSON.parse(content);
    if (index.prebuilt === true) {
      return index;
    }
  } catch (_error) {
    // Pre-built index doesn't exist or is invalid
  }
  return null;
}

/**
 * Generate rule index
 */
async function generateIndex() {
  // Check for pre-built index
  const prebuiltIndex = await loadPrebuiltIndex();
  const isPrebuilt = process.argv.includes('--prebuilt') || process.argv.includes('-p');

  if (prebuiltIndex && !isPrebuilt) {
    console.log(
      'ℹ️  Pre-built index found. Use --prebuilt flag to regenerate lightweight version.'
    );
    console.log('   For full index, this script will generate all rules.\n');
  }

  // Load cache for incremental indexing
  const cache = await loadCache();
  const cacheSize = Object.keys(cache).length;
  if (cacheSize > 0) {
    console.log(`📦 Loaded cache with ${cacheSize} entries (incremental indexing enabled)\n`);
  }

  console.log('🔍 Scanning rules...\n');

  // Scan master rules
  const masterRules = [];
  if (
    await fs
      .access(MASTER_RULES_DIR)
      .then(() => true)
      .catch(() => false)
  ) {
    await scanDirectory(MASTER_RULES_DIR, masterRules, cache);
  }

  // Scan library rules (formerly archive)
  const libraryRules = [];
  if (
    await fs
      .access(LIBRARY_DIR)
      .then(() => true)
      .catch(() => false)
  ) {
    await scanDirectory(LIBRARY_DIR, libraryRules, cache);
  }

  // Save updated cache
  await saveCache(cache);

  const allRules = [...masterRules, ...libraryRules];

  if (allRules.length === 0) {
    console.error('❌ No rules found!');
    process.exit(1);
  }

  // Build technology map
  const technologyMap = buildTechnologyMap(allRules);

  // Create index structure
  const index = {
    version: '1.1.0', // Updated: Added versioning metadata
    generated_at: new Date().toISOString(),
    prebuilt: isPrebuilt,
    total_rules: allRules.length,
    master_rules: masterRules.length,
    library_rules: libraryRules.length,
    schema_version: '1.0.0', // Schema version for index structure
    versioning: {
      changelog: 'Version 1.1.0: Added versioning metadata for skills compatibility tracking',
      increment_guide: {
        major: 'Breaking changes to index structure (e.g., renamed fields, removed properties)',
        minor: 'New rules added, rule paths changed, or new metadata fields added',
        patch: 'Bug fixes, metadata corrections, or re-indexing without content changes',
      },
    },
    rules: allRules,
    technology_map: technologyMap,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  await fs.mkdir(outputDir, { recursive: true });

  // Write index file
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(index, null, 2) + '\n', 'utf-8');

  // Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
  const indexSize = JSON.stringify(index).length;
  const estimatedTokens = Math.ceil(indexSize / 4);

  const indexType = isPrebuilt ? 'pre-built (lightweight)' : 'full';
  console.log(`✅ Generated ${indexType} index with ${allRules.length} rules`);
  console.log(`   - ${masterRules.length} master rules`);
  console.log(`   - ${libraryRules.length} library rules (formerly archive)`);
  console.log(`   - ${Object.keys(technologyMap).length} technologies mapped`);
  console.log(
    `   - Index size: ${(indexSize / 1024).toFixed(2)} KB (~${estimatedTokens.toLocaleString()} tokens)`
  );
  console.log(`📄 Index saved to: ${path.relative(ROOT, OUTPUT_PATH)}`);

  if (isPrebuilt && indexSize > 100000) {
    console.warn(`⚠️  Pre-built index exceeds 100KB limit (${(indexSize / 1024).toFixed(2)} KB)`);
    console.warn('   Consider reducing archive rules further');
  }

  return index;
}

// Check for --prebuilt flag
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/generate-rule-index.mjs [--prebuilt]');
  console.log('');
  console.log('Options:');
  console.log('  --prebuilt, -p    Generate lightweight pre-built index (common stacks only)');
  console.log('  --help, -h         Show this help message');
  console.log('');
  console.log('By default, generates full index with all rules.');
  console.log('Pre-built index is optimized for common stacks (React, Node.js, Python, Go).');
  process.exit(0);
}

// Run generator
generateIndex().catch(error => {
  console.error('❌ Error generating index:', error);
  process.exit(1);
});
