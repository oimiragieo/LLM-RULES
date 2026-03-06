'use strict';

const path = require('path');

/**
 * Pre-execute hook for lsp-navigator.
 * Validates that LSP operation inputs are safe before execution.
 *
 * Validates:
 *   - filePath must be an absolute path (not relative)
 *   - line must be a positive integer (>= 1, LSP is 1-based)
 *   - character must be a positive integer (>= 1, LSP is 1-based)
 *   - operation must be one of the 9 supported LSP operations
 */

const VALID_OPERATIONS = new Set([
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
]);

function isAbsolutePath(p) {
  if (typeof p !== 'string') return false;
  // Cross-platform: handle both Unix and Windows absolute paths
  return path.isAbsolute(p);
}

function isPositiveInteger(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

function preExecute(input = {}) {
  const errors = [];

  if (input.operation !== undefined && !VALID_OPERATIONS.has(input.operation)) {
    errors.push(
      `Invalid operation "${input.operation}". Must be one of: ${[...VALID_OPERATIONS].join(', ')}`
    );
  }

  if (input.filePath !== undefined && !isAbsolutePath(input.filePath)) {
    errors.push(
      `filePath must be an absolute path. Got: "${input.filePath}". ` +
        'Use absolute paths to avoid wrong-file resolution (Iron Law 1).'
    );
  }

  if (input.line !== undefined && !isPositiveInteger(input.line)) {
    errors.push(
      `line must be a positive integer >= 1 (LSP is 1-based). Got: ${JSON.stringify(input.line)}. ` +
        '0-based offsets cause off-by-one navigation errors (Iron Law 2).'
    );
  }

  if (input.character !== undefined && !isPositiveInteger(input.character)) {
    errors.push(
      `character must be a positive integer >= 1 (LSP is 1-based). Got: ${JSON.stringify(input.character)}. ` +
        '0-based offsets cause off-by-one navigation errors (Iron Law 2).'
    );
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[lsp-navigator pre-execute] Validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n`
    );
    process.exit(2);
  }

  return { continue: true };
}

module.exports = { preExecute };
