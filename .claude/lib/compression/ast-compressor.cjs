'use strict';

/**
 * AST-Based Context Compression
 *
 * Compresses JavaScript/TypeScript code by extracting structure
 * and stripping implementation details. Three compression levels:
 *   - SIGNATURES: function/class signatures only
 *   - STRUCTURE: file outline with exports
 *   - SUMMARY: minimal one-line-per-export summaries
 *
 * Uses regex-based extraction (not full AST) for speed and
 * zero-dependency operation.
 *
 * @module ast-compressor
 */

const CompressionLevel = Object.freeze({
  SIGNATURES: 'signatures',
  STRUCTURE: 'structure',
  SUMMARY: 'summary',
});

/**
 * Extract function signature from code, stripping the body.
 *
 * @param {string} code - function source code
 * @param {{ preserveJsdoc?: boolean }} [opts]
 * @returns {string} compressed representation
 */
function compressFunction(code, opts = {}) {
  const lines = code.split('\n');
  const parts = [];

  // Extract JSDoc if present
  if (opts.preserveJsdoc) {
    let inJsdoc = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('/**')) inJsdoc = true;
      if (inJsdoc) parts.push(line);
      if (trimmed.includes('*/')) {
        inJsdoc = false;
      }
    }
  }

  // Extract signature line(s)
  // Match: async? function name(params)
  const funcMatch = code.match(/(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
  if (funcMatch) {
    const async = funcMatch[1] ? 'async ' : '';
    parts.push(`${async}function ${funcMatch[2]}(${funcMatch[3]}) { /* ... */ }`);
    return parts.join('\n');
  }

  // Match: const name = (params) =>
  const arrowMatch = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/);
  if (arrowMatch) {
    const async = arrowMatch[2] ? 'async ' : '';
    parts.push(`const ${arrowMatch[1]} = ${async}(${arrowMatch[3]}) => { /* ... */ }`);
    return parts.join('\n');
  }

  // Fallback: first line
  parts.push(lines[0] + ' { /* ... */ }');
  return parts.join('\n');
}

/**
 * Extract class structure, stripping method bodies.
 *
 * @param {string} code - class source code
 * @returns {string} compressed representation
 */
function compressClass(code) {
  // Extract class declaration
  const classMatch = code.match(/class\s+(\w+)(\s+extends\s+(\w+))?\s*\{/);
  if (!classMatch) return code.split('\n')[0];

  const className = classMatch[1];
  const extendsStr = classMatch[3] ? ` extends ${classMatch[3]}` : '';

  // Extract method signatures
  const methodRegex = /(async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/g;
  const methods = [];
  let match;
  while ((match = methodRegex.exec(code)) !== null) {
    // Skip the class declaration itself
    if (match[2] === className && !match[0].includes('constructor')) continue;
    const async = match[1] ? 'async ' : '';
    methods.push(`  ${async}${match[2]}(${match[3]})`);
  }

  const parts = [`class ${className}${extendsStr} {`];
  for (const m of methods) {
    parts.push(m);
  }
  parts.push('}');
  return parts.join('\n');
}

/**
 * Compress a full module at the specified level.
 *
 * @param {string} code - full module source
 * @param {{ level?: string }} [opts]
 * @returns {string} compressed representation
 */
function compressModule(code, opts = {}) {
  const level = opts.level || CompressionLevel.SIGNATURES;

  if (!code || code.trim().length === 0) return '';

  const lines = code.split('\n');

  // Extract requires/imports
  const requires = [];
  const functions = [];
  const classes = [];
  const exports = [];

  // Simple line-by-line extraction
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Requires
    if (line.match(/^(?:const|let|var)\s+.*=\s*require\(/)) {
      requires.push(line);
      continue;
    }

    // Functions
    const funcMatch = line.match(/(async\s+)?function\s+(\w+)\s*\(/);
    if (funcMatch) {
      // Find the end of the function (brace counting)
      const funcCode = extractBlock(lines, i);
      functions.push({ name: funcMatch[2], code: funcCode, async: Boolean(funcMatch[1]) });
      continue;
    }

    // Arrow functions
    const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(async\s*)?\(/);
    if (arrowMatch && line.includes('=>')) {
      functions.push({ name: arrowMatch[1], code: line, async: Boolean(arrowMatch[2]) });
      continue;
    }

    // Classes
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      const classCode = extractBlock(lines, i);
      classes.push({ name: classMatch[1], code: classCode });
      continue;
    }

    // Exports
    if (line.match(/module\.exports/)) {
      exports.push(line);
    }
  }

  const parts = [];

  if (level === CompressionLevel.SUMMARY) {
    // Minimal: just names
    if (functions.length > 0) {
      parts.push('Functions: ' + functions.map(f => f.name).join(', '));
    }
    if (classes.length > 0) {
      parts.push('Classes: ' + classes.map(c => c.name).join(', '));
    }
    if (exports.length > 0) {
      parts.push(exports[0]);
    }
    return parts.join('\n');
  }

  if (level === CompressionLevel.STRUCTURE) {
    // Outline with requires
    if (requires.length > 0) {
      parts.push(...requires);
      parts.push('');
    }
    for (const cls of classes) {
      parts.push(compressClass(cls.code));
      parts.push('');
    }
    for (const fn of functions) {
      const async = fn.async ? 'async ' : '';
      parts.push(`${async}function ${fn.name}(...)`);
    }
    if (exports.length > 0) {
      parts.push('');
      parts.push(exports[0]);
    }
    return parts.join('\n');
  }

  // SIGNATURES (default): full signatures
  if (requires.length > 0) {
    parts.push(...requires);
    parts.push('');
  }
  for (const cls of classes) {
    parts.push(compressClass(cls.code));
    parts.push('');
  }
  for (const fn of functions) {
    parts.push(compressFunction(fn.code));
    parts.push('');
  }
  if (exports.length > 0) {
    parts.push(exports[0]);
  }

  return parts.join('\n').trim();
}

/**
 * Extract a brace-delimited block starting at lineIndex.
 * @param {string[]} lines
 * @param {number} startIdx
 * @returns {string}
 */
function extractBlock(lines, startIdx) {
  let depth = 0;
  let started = false;
  const blockLines = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    blockLines.push(line);

    for (const ch of line) {
      if (ch === '{') {
        depth++;
        started = true;
      }
      if (ch === '}') depth--;
    }

    if (started && depth === 0) break;
  }

  return blockLines.join('\n');
}

module.exports = {
  compressFunction,
  compressClass,
  compressModule,
  CompressionLevel,
};
