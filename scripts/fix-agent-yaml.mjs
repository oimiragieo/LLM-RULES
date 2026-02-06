#!/usr/bin/env node
/**
 * Fix Agent YAML Frontmatter
 * 
 * Fixes two issues:
 * 1. Unquoted @-prefixed paths in YAML lists (invalid YAML syntax)
 * 2. Missing 'name' field in frontmatter
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AGENTS_DIR = join(__dirname, '..', '.claude', 'agents');

// Statistics
const stats = {
  filesProcessed: 0,
  yamlFixes: 0,
  nameFieldAdds: 0,
  errors: [],
};

/**
 * Recursively find all .md files in directory
 */
function findMarkdownFiles(dir, files = []) {
  const items = readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      findMarkdownFiles(path, files);
    } else if (item.isFile() && item.name.endsWith('.md')) {
      files.push(path);
    }
  }
  
  return files;
}

/**
 * Extract frontmatter from markdown content
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  
  return {
    raw: match[0],
    yaml: match[1],
    endIndex: match[0].length,
  };
}

/**
 * Fix unquoted @-prefixed paths in YAML
 * Converts: - @.claude/context/memory/learnings.md
 * To:      - "@.claude/context/memory/learnings.md"
 */
function fixYamlSyntax(yaml) {
  let fixed = yaml;
  let fixes = 0;
  
  // Match lines with unquoted @ paths: "  - @.claude/..."
  // The @ character at start of value is reserved in YAML and needs quoting
  const unquotedAtPath = /^(\s+- )(@[\w./-]+)$/gm;
  
  fixed = fixed.replace(unquotedAtPath, (match, prefix, path) => {
    fixes++;
    return `${prefix}"${path}"`;
  });
  
  return { yaml: fixed, fixes };
}

/**
 * Add missing name field to frontmatter
 */
function addMissingNameField(yaml, filename) {
  // Check if name field already exists
  if (/^name:/m.test(yaml)) {
    return { yaml, added: false };
  }
  
  // Extract name from filename
  const name = filename
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()); // Title case
  
  // Add name field after the first line (which should be the opening ---)
  const lines = yaml.split('\n');
  lines.splice(1, 0, `name: ${name}`);
  
  return { yaml: lines.join('\n'), added: true };
}

/**
 * Process a single agent file
 */
function processFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const frontmatter = extractFrontmatter(content);
  
  if (!frontmatter) {
    stats.errors.push({ file: filePath, error: 'No frontmatter found' });
    return;
  }
  
  let newYaml = frontmatter.yaml;
  let yamlFixes = 0;
  let nameAdded = false;
  let modified = false;
  
  // Fix 1: YAML syntax (unquoted @ paths)
  const yamlResult = fixYamlSyntax(newYaml);
  if (yamlResult.fixes > 0) {
    newYaml = yamlResult.yaml;
    yamlFixes = yamlResult.fixes;
    modified = true;
  }
  
  // Fix 2: Missing name field
  const filename = filePath.split(/[/\\]/).pop();
  const nameResult = addMissingNameField(newYaml, filename);
  if (nameResult.added) {
    newYaml = nameResult.yaml;
    nameAdded = true;
    modified = true;
  }
  
  // Write back if modified
  if (modified) {
    const newFrontmatter = `---\n${newYaml}\n---`;
    const newContent = content.replace(frontmatter.raw, newFrontmatter);
    writeFileSync(filePath, newContent, 'utf-8');
    
    stats.yamlFixes += yamlFixes;
    if (nameAdded) stats.nameFieldAdds++;
    
    console.log(`✅ Fixed: ${filename}`);
    if (yamlFixes > 0) console.log(`   - ${yamlFixes} YAML syntax fixes`);
    if (nameAdded) console.log(`   - Added 'name' field`);
  } else {
    console.log(`⏭️  Skipped: ${filename} (no issues)`);
  }
  
  stats.filesProcessed++;
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Agent YAML Fixer\n');
  console.log(`Scanning: ${AGENTS_DIR}\n`);
  
  try {
    const files = findMarkdownFiles(AGENTS_DIR);
    console.log(`Found ${files.length} agent files\n`);
    
    for (const file of files) {
      try {
        processFile(file);
      } catch (err) {
        stats.errors.push({ file, error: err.message });
        console.error(`❌ Error processing ${file}: ${err.message}`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Files processed: ${stats.filesProcessed}`);
    console.log(`   YAML fixes: ${stats.yamlFixes}`);
    console.log(`   Name fields added: ${stats.nameFieldAdds}`);
    console.log(`   Errors: ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      for (const err of stats.errors) {
        console.log(`   - ${err.file}: ${err.error}`);
      }
    }
    
    console.log('\n✨ Done!\n');
    
  } catch (err) {
    console.error(`❌ Fatal error: ${err.message}`);
    process.exit(1);
  }
}

main();
