/**
 * Code Parser - tree-sitter wrapper for multi-language parsing
 *
 * @module code-indexing/code-parser
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

// tree-sitter is a native module; in some environments (e.g. Node ABI mismatch)
// it may fail to load. Keep the code-indexing stack fail-open so tests and
// non-AST features can still run.
let _Parser = null;
let _TREE_SITTER_LOAD_ERROR = null;
try {
  _Parser = require('tree-sitter');
} catch (err) {
  _TREE_SITTER_LOAD_ERROR = err;
}
const fs = require('fs').promises;
const path = require('path');

// Language to grammar mapping
const LANGUAGE_GRAMMARS = {
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  tsx: 'tree-sitter-typescript/tsx',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
};

// File extension to language mapping
const EXTENSION_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
};

class CodeParser {
  constructor(options = {}) {
    this.options = options;
    this.grammars = new Map();
    this.parsers = new Map();
    this._Parser = _Parser;
    this._treeSitterLoadError = _TREE_SITTER_LOAD_ERROR;
  }

  /**
   * Detect language from file extension
   * @param {string} filePath - Path to source file
   * @returns {string|null} Language identifier or null if unsupported
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] || null;
  }

  /**
   * Check if a language is supported
   * @param {string} language - Language identifier
   * @returns {boolean}
   */
  isSupported(language) {
    return language in LANGUAGE_GRAMMARS;
  }

  /**
   * Get list of supported languages
   * @returns {string[]}
   */
  getSupportedLanguages() {
    return Object.keys(LANGUAGE_GRAMMARS);
  }

  /**
   * Get supported file extensions
   * @returns {string[]}
   */
  getSupportedExtensions() {
    return Object.keys(EXTENSION_MAP);
  }

  _loadGrammar(language) {
    if (this.grammars.has(language)) return this.grammars.get(language);
    const grammarName = LANGUAGE_GRAMMARS[language];
    if (!grammarName) return null;
    try {
      const mod = require(grammarName);
      let grammar = mod;
      if (grammarName === 'tree-sitter-typescript') {
        grammar = mod.typescript;
      }
      if (grammarName === 'tree-sitter-typescript/tsx') {
        grammar = mod.tsx;
      }
      this.grammars.set(language, grammar);
      return grammar;
    } catch (_e) {
      this.grammars.set(language, null);
      return null;
    }
  }

  _getParser(language) {
    if (!this._Parser) return null;
    if (this.parsers.has(language)) return this.parsers.get(language);
    const grammar = this._loadGrammar(language);
    if (!grammar) {
      this.parsers.set(language, null);
      return null;
    }
    const parser = new this._Parser();
    parser.setLanguage(grammar);
    this.parsers.set(language, parser);
    return parser;
  }

  parse(content, language) {
    if (!language || !this.isSupported(language)) return null;
    const parser = this._getParser(language);
    if (!parser) return null;
    const tree = parser.parse(content);
    return { content, language, rootNode: tree.rootNode };
  }
}

module.exports = { CodeParser, LANGUAGE_GRAMMARS, EXTENSION_MAP };
