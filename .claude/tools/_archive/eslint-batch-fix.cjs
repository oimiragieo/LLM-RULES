#!/usr/bin/env node
/**
 * ESLint Batch Fix Script
 *
 * Fixes common ESLint errors by parsing ESLint output and making targeted fixes:
 * 1. Caught errors not used: catch (e) -> catch (_e) (only when ESLint reports it)
 * 2. hasOwnProperty: obj.hasOwnProperty('key') -> Object.hasOwn(obj, 'key')
 *
 * Usage:
 *   node .claude/tools/cli/eslint-batch-fix.cjs [--dry-run] [--pattern caught|hasown|all]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DRY_RUN = process.argv.includes('--dry-run');
const PATTERN = process.argv.find(arg => arg.startsWith('--pattern='))?.split('=')[1] || 'all';

// Stats
const stats = {
  filesProcessed: 0,
  caughtErrorsFixed: 0,
  hasOwnPropertyFixed: 0,
  errors: [],
};

/**
 * Parse ESLint output to find specific errors to fix
 * Returns: { file: string, line: number, column: number, varName: string, type: 'caught'|'hasown' }[]
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

      // Match caught error: "'e' is defined but never used. Allowed unused caught errors must match /^_/u"
      const caughtMatch = line.match(
        /^\s*(\d+):(\d+)\s+error\s+'(\w+)' is defined but never used.*caught errors/
      );
      if (caughtMatch && (PATTERN === 'all' || PATTERN === 'caught')) {
        fixes.push({
          file: currentFile,
          line: parseInt(caughtMatch[1], 10),
          column: parseInt(caughtMatch[2], 10),
          varName: caughtMatch[3],
          type: 'caught',
        });
        continue;
      }

      // Match hasOwnProperty: "Do not access Object.prototype method 'hasOwnProperty'"
      const hasOwnMatch = line.match(
        /^\s*(\d+):(\d+)\s+error\s+Do not access Object.prototype method 'hasOwnProperty'/
      );
      if (hasOwnMatch && (PATTERN === 'all' || PATTERN === 'hasown')) {
        fixes.push({
          file: currentFile,
          line: parseInt(hasOwnMatch[1], 10),
          column: parseInt(hasOwnMatch[2], 10),
          varName: null,
          type: 'hasown',
        });
        continue;
      }
    }

    return fixes;
  } catch (err) {
    console.error('Error parsing ESLint output:', err.message);
    return [];
  }
}

/**
 * Fix a specific caught error on a line
 */
function fixCaughtError(content, lineNum, varName) {
  const lines = content.split('\n');
  const lineIdx = lineNum - 1;

  if (lineIdx >= lines.length) return { content, fixed: false };

  const line = lines[lineIdx];

  // Pattern: catch (varName)
  const pattern = new RegExp(`catch\\s*\\(\\s*${varName}\\s*\\)`);
  if (pattern.test(line)) {
    lines[lineIdx] = line.replace(pattern, `catch (_${varName})`);
    return { content: lines.join('\n'), fixed: true };
  }

  return { content, fixed: false };
}

/**
 * Fix hasOwnProperty on a specific line
 */
function fixHasOwnProperty(content, lineNum, column) {
  const lines = content.split('\n');
  const lineIdx = lineNum - 1;

  if (lineIdx >= lines.length) return { content, fixed: false };

  const line = lines[lineIdx];

  // Find hasOwnProperty call at or near the column
  // Pattern: identifier.hasOwnProperty(arg)
  const pattern = /(\w+)\.hasOwnProperty\(([^)]+)\)/g;
  let match;
  let newLine = line;
  let fixed = false;

  while ((match = pattern.exec(line)) !== null) {
    // Check if this match is at or near the reported column
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (column >= matchStart && column <= matchEnd + 10) {
      const [, obj, arg] = match;
      newLine = newLine.replace(match[0], `Object.hasOwn(${obj}, ${arg})`);
      fixed = true;
      break;
    }
  }

  if (fixed) {
    lines[lineIdx] = newLine;
    return { content: lines.join('\n'), fixed: true };
  }

  return { content, fixed: false };
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

      // Sort fixes by line number (descending) to avoid line number shifts
      fileFixes.sort((a, b) => b.line - a.line);

      for (const fix of fileFixes) {
        let result;

        if (fix.type === 'caught') {
          result = fixCaughtError(content, fix.line, fix.varName);
          if (result.fixed) stats.caughtErrorsFixed++;
        } else if (fix.type === 'hasown') {
          result = fixHasOwnProperty(content, fix.line, fix.column);
          if (result.fixed) stats.hasOwnPropertyFixed++;
        }

        if (result && result.fixed) {
          content = result.content;
          fileModified = true;
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
  console.log('ESLint Batch Fix Script (Targeted)');
  console.log('===================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Pattern: ${PATTERN}`);
  console.log('');

  console.log('Parsing ESLint output for specific errors...');
  const fixes = parseEslintOutput();
  console.log(`Found ${fixes.length} fixable errors`);
  console.log(`  - Caught errors: ${fixes.filter(f => f.type === 'caught').length}`);
  console.log(`  - hasOwnProperty: ${fixes.filter(f => f.type === 'hasown').length}`);
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
  console.log(`  Caught errors fixed: ${stats.caughtErrorsFixed}`);
  console.log(`  hasOwnProperty fixed: ${stats.hasOwnPropertyFixed}`);

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
