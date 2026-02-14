/**
 * ast-grep wrapper - Structural code search using AST patterns
 *
 * Wraps the ast-grep CLI for programmatic access to structural code search.
 * Uses child_process.spawn for calling the `ast-grep` (or `sg`) binary.
 *
 * @module code-indexing/ast-grep-wrapper
 * @see {@link .claude/docs/PHASE_2_HYBRID_SEARCH_DESIGN.md}
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

// Language mapping from Phase 1 names to ast-grep names
const LANGUAGE_MAP = {
  // Phase 1 names -> ast-grep names
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  py: 'python',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'c-sharp',
  cs: 'c-sharp',
  ruby: 'ruby',
  rb: 'ruby',
  kotlin: 'kotlin',
  kt: 'kotlin',
  swift: 'swift',
};

// File extension to language mapping
const EXTENSION_TO_LANGUAGE = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'c-sharp',
  '.rb': 'ruby',
  '.kt': 'kotlin',
  '.swift': 'swift',
};

/**
 * ast-grep wrapper for structural code search
 * @class AstGrepSearch
 */
class AstGrepSearch {
  /**
   * Initialize ast-grep wrapper
   * @param {Object} options - Configuration
   * @param {string} options.binPath - Path to ast-grep binary (default: 'ast-grep')
   * @param {string} options.projectRoot - Project root directory
   * @param {number} options.timeout - Search timeout in ms (default: 30000)
   */
  constructor(options = {}) {
    this.binPath = options.binPath || 'ast-grep';
    this.projectRoot = options.projectRoot || process.cwd();
    this.timeout = options.timeout || 30000;
  }

  /**
   * Check if ast-grep binary is available
   * @returns {Promise<boolean>} True if ast-grep is installed and working
   */
  async isAvailable() {
    return new Promise(resolve => {
      const proc = spawn(this.binPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      proc.on('error', () => resolve(false));
      proc.on('close', code => resolve(code === 0));

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Get ast-grep version
   * @returns {Promise<string>} Version string (e.g., '0.35.0')
   */
  async getVersion() {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => {
        stdout += data.toString();
      });
      proc.stderr.on('data', data => {
        stderr += data.toString();
      });

      proc.on('error', err => {
        reject(new Error(`ast-grep binary not found: ${err.message}`));
      });

      proc.on('close', code => {
        if (code === 0) {
          // Try to extract version number from output
          const match = stdout.match(/ast-grep (\d+\.\d+\.\d+)/);
          if (match) {
            resolve(match[1]);
          } else {
            // Return full output if no version match
            resolve(stdout.trim());
          }
        } else {
          reject(new Error(`ast-grep version check failed: ${stderr || 'Unknown error'}`));
        }
      });
    });
  }

  /**
   * Search for code matching an AST pattern
   * @param {string} pattern - ast-grep pattern (e.g., 'function $NAME($ARGS) { $BODY }')
   * @param {string} language - Programming language (js, ts, py, go, rs)
   * @param {Object} options - Search options
   * @param {string[]} options.include - Glob patterns to include
   * @param {string[]} options.exclude - Glob patterns to exclude
   * @param {number} options.maxResults - Maximum results (default: 100)
   * @returns {Promise<AstGrepResult[]>} Matching code locations
   */
  async search(pattern, language, options = {}) {
    // Validate inputs
    if (!pattern || typeof pattern !== 'string') {
      throw new Error('Pattern must be a non-empty string');
    }
    if (!language || typeof language !== 'string') {
      throw new Error('Language must be a non-empty string');
    }

    // Check if binary is available
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('ast-grep binary not available. Install with: npm install -g @ast-grep/cli');
    }

    // Map language name
    const mappedLang = this.mapLanguage(language);

    // Build command arguments
    const args = ['-p', pattern, '--lang', mappedLang, '--json'];

    // Add include patterns
    if (options.include && options.include.length > 0) {
      for (const glob of options.include) {
        args.push('--globs', glob);
      }
    }

    // Add exclude patterns
    if (options.exclude && options.exclude.length > 0) {
      for (const glob of options.exclude) {
        args.push('--globs', `!${glob}`);
      }
    }

    // Add project root as the search path
    args.push(this.projectRoot);

    // Execute ast-grep
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => {
        stdout += data.toString();
      });
      proc.stderr.on('data', data => {
        stderr += data.toString();
      });

      proc.on('error', err => {
        reject(new Error(`ast-grep execution failed: ${err.message}`));
      });

      // Timeout handling
      const timeoutId = setTimeout(() => {
        proc.kill();
        reject(new Error(`ast-grep search timed out after ${this.timeout}ms`));
      }, this.timeout);

      proc.on('close', code => {
        clearTimeout(timeoutId);

        // ast-grep returns 0 if matches found, 1 if no matches (not an error)
        if (code === 0 || code === 1) {
          try {
            const results = JSON.parse(stdout || '[]');
            resolve(this._formatResults(results, options.maxResults));
          } catch (e) {
            reject(new Error(`Failed to parse ast-grep output: ${e.message}`));
          }
        } else {
          reject(new Error(`ast-grep failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Refine semantic search results with structural patterns
   * @param {SemanticResult[]} semanticResults - Results from Phase 1 search
   * @param {string} pattern - ast-grep pattern to filter by
   * @param {string} language - Programming language
   * @returns {Promise<HybridResult[]>} Results with structural scores
   */
  async refine(semanticResults, pattern, language) {
    // Handle empty input
    if (!semanticResults || semanticResults.length === 0) {
      return [];
    }

    // Extract unique file paths from semantic results
    const filePaths = [...new Set(semanticResults.map(r => r.filePath))];

    // Search with pattern in those files only
    const structuralResults = await this.search(pattern, language, {
      include: filePaths.map(f => {
        // Convert absolute path to relative for glob matching
        return path.relative(this.projectRoot, f);
      }),
    });

    // Create lookup map for structural matches
    const structuralMap = new Map();
    for (const sr of structuralResults) {
      const key = `${sr.filePath}:${sr.lineStart}-${sr.lineEnd}`;
      structuralMap.set(key, sr);
    }

    // Enhance semantic results with structural scores
    return semanticResults.map(semResult => {
      // Check for exact line range match
      const exactKey = `${semResult.filePath}:${semResult.lineRange[0]}-${semResult.lineRange[1]}`;
      const exactMatch = structuralMap.get(exactKey);

      if (exactMatch) {
        return {
          ...semResult,
          structuralScore: 1.0,
          structuralMatch: exactMatch,
        };
      }

      // Check for overlapping line ranges
      let overlaps = false;
      for (const [_, strResult] of structuralMap) {
        if (strResult.filePath === semResult.filePath) {
          if (this._rangesOverlap(semResult.lineRange, [strResult.lineStart, strResult.lineEnd])) {
            overlaps = true;
            break;
          }
        }
      }

      return {
        ...semResult,
        structuralScore: overlaps ? 0.5 : 0.0,
        structuralMatch: null,
      };
    });
  }

  /**
   * Map Phase 1 language names to ast-grep language names
   * @param {string} lang - Language name
   * @returns {string} Mapped language name
   */
  mapLanguage(lang) {
    return LANGUAGE_MAP[lang.toLowerCase()] || lang.toLowerCase();
  }

  /**
   * Detect language from file path
   * @param {string} filePath - File path
   * @returns {string|null} Detected language or null
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] || null;
  }

  /**
   * Format ast-grep results to consistent structure
   * @private
   */
  _formatResults(results, maxResults = 100) {
    return results.slice(0, maxResults).map(r => ({
      filePath: r.file,
      lineStart: r.range.start.line + 1, // ast-grep uses 0-indexed lines
      lineEnd: r.range.end.line + 1,
      colStart: r.range.start.column,
      colEnd: r.range.end.column,
      code: r.text,
      matches: r.metaVariables || {},
      language: (r.language || 'unknown').toLowerCase(),
    }));
  }

  /**
   * Check if two line ranges overlap
   * @private
   */
  _rangesOverlap(range1, range2) {
    return range1[0] <= range2[1] && range1[1] >= range2[0];
  }
}

module.exports = { AstGrepSearch };
