#!/usr/bin/env node
/**
 * Pre-Built Rule Index Generator
 * Generates a lightweight rule-index.json with common stacks for drop-in reliability.
 * This ensures rule-selector works out-of-the-box without requiring pnpm index-rules.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Try to import js-yaml, fallback to simple parsing if not available
let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch (_error) {
  yaml = null;
  console.warn('⚠️  js-yaml not available, using simple YAML parsing');
}

import { resolveConfigPath } from '../../.claude/lib/utils/context-path-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

const MASTER_RULES_DIR = path.join(ROOT, '.claude/rules');
const LIBRARY_DIR = path.join(ROOT, '.claude/rules-library');
const OUTPUT_PATH = resolveConfigPath('rule-index.json', { read: false });
const MAX_SIZE_BYTES = 100000; // 100KB limit

// Common stack technologies to include
const COMMON_STACKS = {
  react: ['react', 'nextjs', 'next.js', 'typescript', 'javascript', 'jsx', 'tsx'],
  nodejs: ['nodejs', 'node.js', 'express', 'nestjs'],
  python: ['python', 'fastapi', 'django', 'flask', 'pydantic'],
  go: ['go', 'golang'],
};

// All technologies to match
const COMMON_TECH_KEYWORDS = [
  ...COMMON_STACKS.react,
  ...COMMON_STACKS.nodejs,
  ...COMMON_STACKS.python,
  ...COMMON_STACKS.go,
  'tailwind',
  'css',
  'api',
  'rest',
  'graphql',
];

/**
 * Extract YAML frontmatter from markdown file using js-yaml
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
    } catch (_error) {
      // Fall through to simple parsing
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
 * Extract technologies from file path and content
 */
function extractTechnologies(filePath, content) {
  const found = new Set();
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();

  COMMON_TECH_KEYWORDS.forEach(tech => {
    const techLower = tech.toLowerCase();
    if (lowerPath.includes(techLower) || lowerContent.substring(0, 2000).includes(techLower)) {
      found.add(tech);
    }
  });

  // Normalize
  const normalized = new Set();
  found.forEach(tech => {
    if (tech === 'next.js') normalized.add('nextjs');
    else if (tech === 'node.js') normalized.add('nodejs');
    else normalized.add(tech);
  });

  return Array.from(normalized).sort();
}

/**
 * Check if rule matches common stacks
 */
function matchesCommonStack(technologies) {
  const techSet = new Set(technologies.map(t => t.toLowerCase()));

  // Check if matches any common stack
  for (const stack of Object.values(COMMON_STACKS)) {
    const stackSet = new Set(stack.map(t => t.toLowerCase()));
    const intersection = [...techSet].filter(t => stackSet.has(t));
    if (intersection.length >= 2) {
      // At least 2 technologies from a stack
      return true;
    }
  }

  return false;
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
 * Recursively scan directory for markdown files
 */
async function scanDirectory(dirPath, rules = [], includeAll = false) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, rules, includeAll);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdc'))) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const metadata = await extractRuleMetadata(fullPath, content);

          // Include all master rules, filter library rules by common stacks
          if (includeAll || matchesCommonStack(metadata.technologies, fullPath)) {
            rules.push(metadata);
          }
        } catch (error) {
          console.warn(`⚠️  Error reading ${fullPath}: ${error.message}`);
        }
      }
    }
  } catch (error) {
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
      techMap[tech].push(rule.path);
    });
  });

  Object.keys(techMap).forEach(tech => {
    techMap[tech].sort();
  });

  return techMap;
}

/**
 * Generate lightweight pre-built index
 */
async function generatePrebuiltIndex() {
  console.log('🔍 Generating lightweight pre-built rule index...\n');

  // Always include all master rules
  const masterRules = [];
  if (
    await fs
      .access(MASTER_RULES_DIR)
      .then(() => true)
      .catch(() => false)
  ) {
    await scanDirectory(MASTER_RULES_DIR, masterRules, true);
  }

  // Filter library rules to common stacks only
  const libraryRules = [];
  if (
    await fs
      .access(LIBRARY_DIR)
      .then(() => true)
      .catch(() => false)
  ) {
    await scanDirectory(LIBRARY_DIR, libraryRules, false);
  }

  const allRules = [...masterRules, ...libraryRules];

  if (allRules.length === 0) {
    console.error('❌ No rules found!');
    process.exit(1);
  }

  // Build technology map
  const technologyMap = buildTechnologyMap(allRules);

  // Create index structure
  const index = {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    prebuilt: true,
    total_rules: allRules.length,
    master_rules: masterRules.length,
    library_rules: libraryRules.length,
    rules: allRules,
    technology_map: technologyMap,
  };

  // Check size
  const indexJson = JSON.stringify(index, null, 2);
  const indexSize = indexJson.length;

  if (indexSize > MAX_SIZE_BYTES) {
    console.warn(`⚠️  Index size (${indexSize} bytes) exceeds limit (${MAX_SIZE_BYTES} bytes)`);
    console.warn('   Consider reducing library rules further');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  await fs.mkdir(outputDir, { recursive: true });

  // Write index file
  await fs.writeFile(OUTPUT_PATH, indexJson, 'utf-8');

  const estimatedTokens = Math.ceil(indexSize / 4);

  console.log(`✅ Generated pre-built index with ${allRules.length} rules`);
  console.log(`   - ${masterRules.length} master rules (all included)`);
  console.log(`   - ${libraryRules.length} library rules (common stacks only, formerly archive)`);
  console.log(`   - ${Object.keys(technologyMap).length} technologies mapped`);
  console.log(
    `   - Index size: ${(indexSize / 1024).toFixed(2)} KB (~${estimatedTokens.toLocaleString()} tokens)`
  );
  console.log(`📄 Pre-built index saved to: ${path.relative(ROOT, OUTPUT_PATH)}`);

  return index;
}

// Run generator
generatePrebuiltIndex().catch(error => {
  console.error('❌ Error generating pre-built index:', error);
  process.exit(1);
});
