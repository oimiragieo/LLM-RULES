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

function fixBashPrefixErrors(content) {
  let modified = content;

  // Fix Bash() function calls - remove @ from paths inside Bash("...")
  // Pattern: Bash("... @.claude/... ")
  modified = modified.replace(/Bash\("([^"]*)@\.claude\//g, 'Bash("$1.claude/');

  // Fix bash code blocks - remove @ from commands
  // Pattern: cat @.claude/ or grep @.claude/ or node @.claude/
  // Match lines with common bash commands that have @.claude/
  modified = modified.replace(
    /(cat|grep|ls|find|rm|mkdir|cp|mv|node|npm|yarn|chmod|chown)\s+@\.claude\//g,
    '$1 .claude/'
  );

  // Fix command examples with pipes and redirects
  // Pattern: command @.claude/path | other
  modified = modified.replace(/(\|.*)@\.claude\//g, '$1.claude/');

  // Fix backtick command substitution in strings
  // Pattern: `@.claude/ in backticks
  modified = modified.replace(/`@\.claude\//g, '`.claude/');

  // Fix $() command substitution
  // Pattern: $(@.claude/...)
  modified = modified.replace(/\$\(@\.claude\//g, '$(.claude/');

  // Fix ||, &&, and other operators
  // Pattern: || grep '@.claude/
  modified = modified.replace(/(\|\||&&|;)\s*'@\.claude\//g, "$1 '.claude/");
  modified = modified.replace(/(\|\||&&|;)\s*"@\.claude\//g, '$1 ".claude/');

  return modified;
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    content = fixBashPrefixErrors(content);

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');

      // Count how many fixes were made
      const bashPatterns = (originalContent.match(/Bash\("([^"]*)@\.claude\//g) || []).length;
      const cmdPatterns = (
        originalContent.match(/(cat|grep|ls|node|npm|yarn)\s+@\.claude\//g) || []
      ).length;
      const totalFixes = bashPatterns + cmdPatterns;

      return { filePath, changed: true, fixes: totalFixes };
    }

    return { filePath, changed: false, fixes: 0 };
  } catch (error) {
    return { filePath, changed: false, error: error.message, fixes: 0 };
  }
}

function main() {
  console.log('🔧 Fixing bash command prefix errors...\n');

  const agentFiles = walkDir(agentsDir);
  console.log(`Found ${agentFiles.length} agent files to check\n`);

  let totalChanged = 0;
  let totalFixes = 0;
  const results = [];

  for (const file of agentFiles) {
    const result = processFile(file);
    results.push(result);

    if (result.changed) {
      totalChanged++;
      totalFixes += result.fixes;
      const relPath = path.relative(agentsDir, file);
      console.log(`✅ ${relPath}: Fixed ${result.fixes} bash command(s)`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Files corrected: ${totalChanged}/${agentFiles.length}`);
  console.log(`  Bash errors fixed: ${totalFixes}`);

  if (totalChanged > 0) {
    console.log(`\n✨ Bash command errors corrected!`);
    console.log(`\nReminder:`);
    console.log(`  ✅ Use: @ prefix in markdown documentation text`);
    console.log(`  ✅ Use: @ prefix in context_files array`);
    console.log(`  ❌ Do NOT use: @ prefix in bash commands/examples`);
  } else {
    console.log(`\n✨ No bash errors found!`);
  }
}

main();
