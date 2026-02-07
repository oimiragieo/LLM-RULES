/**
 * Script Import Validation Test
 *
 * Prevents phantom imports in scripts (imports that reference non-existent files).
 * Regression guard for GAP-1 (validate-index.mjs broken import after Tools Overhaul).
 *
 * Pattern: After any module relocation, this test catches broken import paths.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Extract import/require paths from a script file
 */
function extractImportPaths(filePath, content) {
  const imports = [];

  // Match ES6 imports: import { foo } from './path' or import './path'
  const importRegex = /import\s+(?:{[^}]+}\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push({
      path: match[1],
      line: content.substring(0, match.index).split('\n').length,
      type: 'import'
    });
  }

  // Match CommonJS requires: require('./path')
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push({
      path: match[1],
      line: content.substring(0, match.index).split('\n').length,
      type: 'require'
    });
  }

  return imports;
}

/**
 * Resolve import path relative to the script file
 */
function resolveImportPath(scriptPath, importPath) {
  // Skip node built-ins and npm packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null; // Not a file import
  }

  const scriptDir = path.dirname(scriptPath);
  let resolved = path.resolve(scriptDir, importPath);

  // Try common extensions if not specified
  const extensions = ['', '.mjs', '.cjs', '.js', '.json'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Check if it's a directory with index file
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const indexName of ['index.mjs', 'index.cjs', 'index.js']) {
      const indexPath = path.join(resolved, indexName);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
  }

  return resolved; // Return as-is if not found (will be reported as phantom)
}

/**
 * Recursively find all script files
 */
function findScripts(dir, scripts = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip archived scripts
    if (entry.name === '_archive') {
      continue;
    }

    if (entry.isDirectory()) {
      findScripts(fullPath, scripts);
    } else if (entry.isFile() && /\.(mjs|cjs|js)$/.test(entry.name)) {
      scripts.push(fullPath);
    }
  }

  return scripts;
}

test('scripts should not have phantom imports', () => {
  const scriptsDir = path.join(PROJECT_ROOT, 'scripts');
  const claudeScriptsDir = path.join(PROJECT_ROOT, '.claude', 'scripts');

  const allScripts = [
    ...findScripts(scriptsDir),
    ...findScripts(claudeScriptsDir)
  ];

  assert.ok(allScripts.length > 0, 'Should find at least one script file');

  const phantomImports = [];

  for (const scriptPath of allScripts) {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    const imports = extractImportPaths(scriptPath, content);

    for (const imp of imports) {
      const resolved = resolveImportPath(scriptPath, imp.path);

      // Skip npm packages and node built-ins
      if (resolved === null) {
        continue;
      }

      if (!fs.existsSync(resolved)) {
        const relativeScript = path.relative(PROJECT_ROOT, scriptPath);
        const relativeImport = path.relative(PROJECT_ROOT, resolved);

        phantomImports.push({
          script: relativeScript,
          line: imp.line,
          importPath: imp.path,
          resolved: relativeImport,
          type: imp.type
        });
      }
    }
  }

  if (phantomImports.length > 0) {
    const errorMessage = [
      `Found ${phantomImports.length} phantom import(s):`,
      '',
      ...phantomImports.map(p =>
        `  ${p.script}:${p.line}\n    ${p.type} "${p.importPath}"\n    → ${p.resolved} (NOT FOUND)`
      )
    ].join('\n');

    assert.fail(errorMessage);
  }
});
