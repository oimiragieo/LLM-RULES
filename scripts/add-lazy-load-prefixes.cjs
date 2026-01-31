#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const agentsDir = path.join(__dirname, '..', '.claude', 'agents');

function walkDir(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function addLazyLoadPrefixes(content) {
  // Split into lines to process context-aware
  const lines = content.split('\n');
  const updatedLines = [];
  let inCodeBlock = false;
  let _inFrontmatter = false;
  let frontmatterDashes = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Track frontmatter (YAML between ---)
    if (line === '---') {
      frontmatterDashes++;
      if (frontmatterDashes <= 2) {
        _inFrontmatter = frontmatterDashes === 1;
      }
    }

    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      updatedLines.push(line);
      continue;
    }

    // Don't process inside code blocks
    if (inCodeBlock) {
      updatedLines.push(line);
      continue;
    }

    // Process Bash() function calls - remove @ if present
    if (line.includes('Bash(')) {
      line = line.replace(/Bash\("([^"]*)@\.claude\//g, 'Bash("$1.claude/');
      updatedLines.push(line);
      continue;
    }

    // Process context_files array - ensure @ is present
    if (line.includes('context_files:')) {
      updatedLines.push(line);
      // Next lines are the context file list
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('  - ')) {
        let contextLine = lines[j];
        // Add @ if not already present
        if (contextLine.includes('.claude/') && !contextLine.includes('@.claude/')) {
          contextLine = contextLine.replace(/\.claude\//g, '@.claude/');
        }
        updatedLines.push(contextLine);
        j++;
      }
      i = j - 1;
      continue;
    }

    // For regular markdown lines: add @ to `.claude/` paths
    // But skip if it looks like a command (cat, grep, node, npm, etc.)
    if (
      line.includes('.claude/') &&
      !line.match(/^\s*(cat|grep|ls|find|rm|mkdir|cp|mv|node|npm|yarn|chmod|chown)\s/)
    ) {
      // Check if it's not already prefixed
      if (!line.includes('@.claude/')) {
        // Replace `.claude/` with `@.claude/` but only in non-code contexts
        // Avoid replacing inside inline code if possible, but be pragmatic
        line = line.replace(/([^@]|^)\.claude\//g, '$1@.claude/');
      }
    }

    updatedLines.push(line);
  }

  return updatedLines.join('\n');
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    content = addLazyLoadPrefixes(content);

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      const pathCount = (content.match(/@\.claude\//g) || []).length;
      return { filePath, changed: true, count: pathCount };
    }

    return { filePath, changed: false, count: 0 };
  } catch (error) {
    return { filePath, changed: false, error: error.message };
  }
}

function main() {
  console.log('🔄 Adding lazy-load @prefixes to agent files (smart mode)...\n');

  const agentFiles = walkDir(agentsDir);
  console.log(`Found ${agentFiles.length} agent files to process\n`);

  let totalChanged = 0;
  let totalPaths = 0;
  const results = [];

  for (const file of agentFiles) {
    const result = processFile(file);
    results.push(result);

    if (result.changed) {
      totalChanged++;
      totalPaths += result.count;
      const relPath = path.relative(agentsDir, file);
      console.log(`✅ ${relPath}: ${result.count} @ prefixes present`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Files processed: ${totalChanged}/${agentFiles.length}`);
  console.log(`  @ prefixes in files: ${totalPaths}`);

  if (totalChanged > 0) {
    console.log(`\n✨ Lazy-load optimization complete!`);
    console.log(`\nRules Applied:`);
    console.log(`  ✅ Markdown documentation: @.claude/...`);
    console.log(`  ✅ context_files array: @.claude/...`);
    console.log(`  ❌ Bash() calls: .claude/... (NO @)`);
    console.log(`  ❌ Code examples: .claude/... (NO @)`);
  } else {
    console.log(`\n✨ All files already optimized or no paths found.`);
  }
}

main();
