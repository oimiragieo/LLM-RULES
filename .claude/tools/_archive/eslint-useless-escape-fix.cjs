#!/usr/bin/env node
/**
 * ESLint Useless Escape Fix Script
 *
 * Fixes no-useless-escape errors by parsing ESLint output and making targeted fixes:
 * 1. \/ in character classes -> /  (forward slash doesn't need escaping in [])
 * 2. \& -> &  (ampersand doesn't need escaping)
 * 3. \- at end of character class -> - (hyphen at end doesn't need escaping)
 * 4. \" inside strings -> " or use template literals
 * 5. \, -> , (comma doesn't need escaping)
 *
 * Usage:
 *   node .claude/tools/cli/eslint-useless-escape-fix.cjs [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DRY_RUN = process.argv.includes('--dry-run');

// Stats
const stats = {
  filesProcessed: 0,
  forwardSlashFixed: 0,
  ampersandFixed: 0,
  hyphenFixed: 0,
  quoteFixed: 0,
  commaFixed: 0,
  otherFixed: 0,
  errors: [],
};

/**
 * Parse ESLint output to find useless escape errors
 */
function parseEslintOutput() {
  try {
    const output = execSync('pnpm lint 2>&1 || true', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      maxBuffer: 50 * 1024 * 1024,
    });

    const fixes = [];
    const lines = output.split('\n');
    let currentFile = null;

    for (const line of lines) {
      // Match file paths (Windows format: C:\path\file.js)
      const fileMatch = line.match(/^([A-Z]:\\[^\s]+\.(cjs|mjs|js))$/i);
      if (fileMatch) {
        currentFile = fileMatch[1];
        continue;
      }

      if (!currentFile) continue;

      // Match useless escape: "Unnecessary escape character: \X"
      const escapeMatch = line.match(
        /^\s*(\d+):(\d+)\s+error\s+Unnecessary escape character: \\(.)/
      );
      if (escapeMatch) {
        fixes.push({
          file: currentFile,
          line: parseInt(escapeMatch[1], 10),
          column: parseInt(escapeMatch[2], 10),
          char: escapeMatch[3],
        });
      }
    }

    return fixes;
  } catch (err) {
    console.error('Error parsing ESLint output:', err.message);
    return [];
  }
}

/**
 * Fix a single useless escape at specific position
 */
function fixUselessEscape(content, lineNum, column, char) {
  const lines = content.split('\n');
  const lineIdx = lineNum - 1;

  if (lineIdx >= lines.length) return { content, fixed: false };

  const line = lines[lineIdx];
  const colIdx = column - 1;

  // Verify there's a backslash at the expected position
  if (line[colIdx] !== '\\') {
    // Try to find the backslash near the position
    for (let offset = -2; offset <= 2; offset++) {
      if (line[colIdx + offset] === '\\' && line[colIdx + offset + 1] === char) {
        // Found it, update the column
        const newLine = line.slice(0, colIdx + offset) + line.slice(colIdx + offset + 1);
        lines[lineIdx] = newLine;
        return { content: lines.join('\n'), fixed: true };
      }
    }
    return { content, fixed: false };
  }

  // Verify the next character matches
  if (line[colIdx + 1] !== char) {
    return { content, fixed: false };
  }

  // Remove the backslash
  const newLine = line.slice(0, colIdx) + line.slice(colIdx + 1);
  lines[lineIdx] = newLine;

  return { content: lines.join('\n'), fixed: true };
}

/**
 * Process all fixes grouped by file
 */
function processFixes(fixes) {
  // Group fixes by file
  const fileGroups = new Map();
  for (const fix of fixes) {
    if (!fileGroups.has(fix.file)) {
      fileGroups.set(fix.file, []);
    }
    fileGroups.get(fix.file).push(fix);
  }

  // Process each file
  for (const [filePath, fileFixes] of fileGroups) {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      let fileModified = false;

      // Sort fixes by line number and column (descending) to avoid position shifts
      fileFixes.sort((a, b) => {
        if (b.line !== a.line) return b.line - a.line;
        return b.column - a.column;
      });

      for (const fix of fileFixes) {
        const result = fixUselessEscape(content, fix.line, fix.column, fix.char);

        if (result.fixed) {
          content = result.content;
          fileModified = true;

          // Track stats by character type
          switch (fix.char) {
            case '/':
              stats.forwardSlashFixed++;
              break;
            case '&':
              stats.ampersandFixed++;
              break;
            case '-':
              stats.hyphenFixed++;
              break;
            case '"':
              stats.quoteFixed++;
              break;
            case ',':
              stats.commaFixed++;
              break;
            default:
              stats.otherFixed++;
          }
        }
      }

      if (fileModified) {
        if (!DRY_RUN) {
          fs.writeFileSync(filePath, content);
        }
        stats.filesProcessed++;
        const relativePath = path.relative(PROJECT_ROOT, filePath);
        console.log(`  ${DRY_RUN ? '[DRY]' : '[FIX]'} ${relativePath}`);
      }
    } catch (err) {
      stats.errors.push({ file: filePath, error: err.message });
    }
  }
}

/**
 * Main entry point
 */
function main() {
  console.log('ESLint Useless Escape Fix Script');
  console.log('=================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  console.log('Parsing ESLint output for useless escape errors...');
  const fixes = parseEslintOutput();
  console.log(`Found ${fixes.length} useless escape errors`);

  // Count by character type
  const byChar = {};
  for (const fix of fixes) {
    byChar[fix.char] = (byChar[fix.char] || 0) + 1;
  }
  for (const [char, count] of Object.entries(byChar)) {
    console.log(`  - \\${char}: ${count}`);
  }
  console.log('');

  if (fixes.length === 0) {
    console.log('No fixes to apply.');
    return;
  }

  console.log('Applying fixes...');
  processFixes(fixes);

  console.log('');
  console.log('Summary:');
  console.log(`  Files processed: ${stats.filesProcessed}`);
  console.log(`  Forward slash (\\/) fixed: ${stats.forwardSlashFixed}`);
  console.log(`  Ampersand (\\&) fixed: ${stats.ampersandFixed}`);
  console.log(`  Hyphen (\\-) fixed: ${stats.hyphenFixed}`);
  console.log(`  Quote (\\") fixed: ${stats.quoteFixed}`);
  console.log(`  Comma (\\,) fixed: ${stats.commaFixed}`);
  console.log(`  Other fixed: ${stats.otherFixed}`);

  if (stats.errors.length > 0) {
    console.log(`  Errors: ${stats.errors.length}`);
    for (const err of stats.errors) {
      console.log(`    - ${err.file}: ${err.error}`);
    }
  }

  if (DRY_RUN) {
    console.log('');
    console.log('This was a dry run. Run without --dry-run to apply fixes.');
  }
}

main();
