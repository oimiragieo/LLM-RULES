#!/usr/bin/env node
'use strict';

/**
 * de-sloppify CLI
 * Scans JavaScript/TypeScript files for code slop: unused imports, console.logs, commented-out code.
 *
 * Usage:
 *   node main.cjs --action find-unused-imports --files "file1.js,file2.ts"
 *   node main.cjs --action find-console-logs --files "file1.js,file2.ts"
 *   node main.cjs --action find-commented-code --files "file1.js,file2.ts"
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const action = args.action;
const filesArg = args.files || '';

if (!action) {
  process.stderr.write('[de-sloppify] --action is required\n');
  process.exit(1);
}

if (!filesArg || filesArg === true) {
  process.stderr.write('[de-sloppify] --files is required (comma-separated paths)\n');
  process.exit(1);
}

const filePaths = String(filesArg)
  .split(',')
  .map(f => f.trim())
  .filter(Boolean);

if (filePaths.length === 0) {
  process.stderr.write('[de-sloppify] No files provided\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    process.stderr.write(`[de-sloppify] Cannot read file: ${filePath}: ${err.message}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Action: find-unused-imports
// Heuristic approach: find import statements, then check if the imported
// identifier appears anywhere else in the file (beyond the import line).
// ---------------------------------------------------------------------------

function parseNamedImports(namedGroup) {
  const result = [];
  namedGroup.split(',').forEach(name => {
    const trimmed = name
      .trim()
      .split(/\s+as\s+/)
      .pop()
      .trim();
    if (trimmed && /^\w+$/.test(trimmed)) {
      result.push(trimmed);
    }
  });
  return result;
}

function extractNamedAndDefault(match, identifiers) {
  const namedGroup = match[1] || match[2] || '';
  parseNamedImports(namedGroup).forEach(id => identifiers.push(id));
  // Also grab default if present (pattern 4: import Default, { Named })
  if (match[1] && !namedGroup.includes(match[1])) {
    identifiers.push(match[1]);
  }
}

function findUnusedImports(filePaths) {
  const findings = [];

  for (const filePath of filePaths) {
    const content = readFile(filePath);
    if (content === null) continue;

    const lines = content.split('\n');

    // Match ES6 default imports: import Foo from '...'
    // Match ES6 named imports: import { Foo, Bar } from '...'
    // Match ES6 namespace imports: import * as Foo from '...'
    // Match CommonJS: const Foo = require('...')  /  const { Foo } = require('...')
    const importPatterns = [
      // import DefaultExport from '...'
      /^import\s+(\w+)\s+from\s+['"][^'"]+['"]/,
      // import { Named1, Named2 } from '...'
      /^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/,
      // import * as Namespace from '...'
      /^import\s+\*\s+as\s+(\w+)\s+from\s+['"][^'"]+['"]/,
      // import DefaultExport, { Named } from '...'
      /^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"][^'"]+['"]/,
      // const Foo = require('...')
      /^(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(/,
      // const { Foo, Bar } = require('...')
      /^(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(/,
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // Skip non-import lines quickly
      if (!line.startsWith('import ') && !line.match(/^(?:const|let|var)\s+\S+\s*=\s*require/)) {
        continue;
      }

      // Extract identifiers from this import line
      const identifiers = [];

      for (const pattern of importPatterns) {
        const match = line.match(pattern);
        if (!match) continue;

        // Named imports pattern
        if (pattern.source.includes('\\{([^}]+)\\}')) {
          extractNamedAndDefault(match, identifiers);
        } else if (match[1]) {
          identifiers.push(match[1]);
        }
        break; // first matching pattern wins
      }

      // Check each identifier: does it appear anywhere in the file outside this line?
      for (const ident of identifiers) {
        if (!ident || ident.length < 2) continue;

        // Search the file content excluding the import line itself
        const contentWithoutImport = lines.filter((_, i) => i !== lineNum).join('\n');

        // Word-boundary search for the identifier
        const usagePattern = new RegExp(`\\b${ident}\\b`);
        if (!usagePattern.test(contentWithoutImport)) {
          findings.push({
            file: filePath,
            line: lineNum + 1,
            import: ident,
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Action: find-console-logs
// Finds console.log, console.warn, console.debug, console.info, console.error
// (but NOT console.error inside catch blocks — see SKILL.md what-not-to-clean)
// ---------------------------------------------------------------------------

function findConsoleLogs(filePaths) {
  const findings = [];

  // console methods to flag
  const consoleMethods = [
    'log',
    'warn',
    'debug',
    'info',
    'trace',
    'dir',
    'table',
    'time',
    'timeEnd',
  ];
  // console.error is special — skip if inside catch block
  const catchSafePattern = /\bcatch\s*\(/;

  for (const filePath of filePaths) {
    const content = readFile(filePath);
    if (content === null) continue;

    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // Skip commented lines (these are caught by find-commented-code instead)
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const method of consoleMethods) {
        const pattern = new RegExp(`\\bconsole\\.${method}\\s*\\(`);
        if (pattern.test(line)) {
          findings.push({
            file: filePath,
            line: lineNum + 1,
            statement: trimmed.slice(0, 120),
          });
          break; // Only report line once even if multiple console calls
        }
      }

      // console.error — only flag if NOT in catch context (look at surrounding lines)
      if (/\bconsole\.error\s*\(/.test(line)) {
        // Look back up to 3 lines for a catch block
        const lookback = Math.max(0, lineNum - 3);
        const context = lines.slice(lookback, lineNum + 1).join('\n');
        if (!catchSafePattern.test(context)) {
          findings.push({
            file: filePath,
            line: lineNum + 1,
            statement: trimmed.slice(0, 120),
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Action: find-commented-code
// Heuristic: lines commented out with // that look like code (not doc/prose).
// Skips JSDoc blocks, section comments, TODO-with-ticket, it.skip, etc.
// ---------------------------------------------------------------------------

function isCodeLine(text) {
  // Indicators this looks like commented-out code rather than a prose comment
  const codeIndicators = [
    /^\s*\/\/\s*(const|let|var|function|return|if|else|for|while|switch|import|export|class|throw|new|await|async)\b/,
    /^\s*\/\/\s*\w+\s*\(/, // function call: // foo()
    /^\s*\/\/\s*\w+\s*=\s*/, // assignment: // foo =
    /^\s*\/\/\s*\w+\.\w+/, // member access: // foo.bar
    /^\s*\/\/\s*[{}[\]]/, // brackets: // { or // }
    /^\s*\/\/\s*<\w+/, // JSX: // <Component
    /^\s*\/\/\s*\w+\s*\+=\s*/, // compound assignment: // x +=
    /^\s*\/\/\s*await\s/, // await expression
    /^\s*\/\/\s*require\s*\(/, // require call
    /^\s*\/\/\s*console\./, // console call
  ];

  // NOT code — preserve these
  const preservePatterns = [
    /^\s*\/\/\s*(TODO|FIXME|HACK|NOTE|WARN|DEPRECATED|BREAKING)[::\s]/i, // context comments
    /^\s*\/\/\s*[A-Z]{2,}[-:\s]/, // UPPERCASE labels: DR-1: , ADR-076:
    /^\s*\/\/\s*Copyright/, // license headers
    /^\s*\/\/\s*@/, // JSDoc inline: // @param
    /^\s*\/\/\s*it\.skip/, // disabled tests
    /^\s*\/\/\s*describe\.skip/, // disabled test suite
    /^\s*\/\/\s*eslint-/, // eslint directives
    /^\s*\/\/\s*prettier-/, // prettier directives
    /^\s*\/\/\s*noinspection/, // IDE hints
    /^\s*\/\/\s*[A-Z]/, // Sentences starting with uppercase (likely prose)
  ];

  for (const p of preservePatterns) {
    if (p.test(text)) return false;
  }

  for (const p of codeIndicators) {
    if (p.test(text)) return true;
  }

  return false;
}

function findCommentedCode(filePaths) {
  const findings = [];

  for (const filePath of filePaths) {
    const content = readFile(filePath);
    if (content === null) continue;

    const lines = content.split('\n');
    let inJsDocBlock = false;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // Track JSDoc/block comment boundaries
      if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
        inJsDocBlock = true;
      }
      if (inJsDocBlock) {
        if (trimmed.endsWith('*/') || trimmed === '*/') {
          inJsDocBlock = false;
        }
        continue; // Skip block comment contents
      }

      if (isCodeLine(line)) {
        findings.push({
          file: filePath,
          line: lineNum + 1,
          content: trimmed.slice(0, 120),
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

try {
  let result;

  switch (action) {
    case 'find-unused-imports':
      result = findUnusedImports(filePaths);
      break;
    case 'find-console-logs':
      result = findConsoleLogs(filePaths);
      break;
    case 'find-commented-code':
      result = findCommentedCode(filePaths);
      break;
    default:
      process.stderr.write(`[de-sloppify] Unknown action: ${action}\n`);
      process.exit(1);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`[de-sloppify] Unexpected error: ${err.message}\n`);
  process.exit(1);
}
