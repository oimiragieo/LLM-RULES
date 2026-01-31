/**
 * Query Analyzer - Convert natural language queries to ast-grep patterns
 *
 * Analyzes user queries to determine search strategy and generate patterns
 * for hybrid semantic + structural search.
 *
 * @module code-indexing/query-analyzer
 * @see {@link .claude/context/artifacts/PHASE_2_HYBRID_SEARCH_DESIGN.md}
 */

'use strict';

// Common stop words to filter out
const STOP_WORDS = new Set([
  'find', 'search', 'get', 'show', 'list', 'all', 'any', 'the', 'a', 'an',
  'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'of', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'that',
  'this', 'these', 'those', 'what', 'which', 'where', 'when', 'how', 'why'
]);

// Query type keywords
const FUNCTION_KEYWORDS = ['function', 'functions', 'func', 'method', 'methods'];
const CLASS_KEYWORDS = ['class', 'classes', 'interface', 'interfaces'];
const SECURITY_KEYWORDS = ['sql', 'xss', 'injection', 'vulnerability', 'vulnerabilities', 'security'];
const PERFORMANCE_KEYWORDS = ['performance', 'bottleneck', 'bottlenecks', 'slow', 'optimization'];

// Synonym expansion map
const SYNONYMS = {
  'auth': ['authentication', 'login', 'signin', 'authorize'],
  'db': ['database', 'data', 'storage'],
  'config': ['configuration', 'settings', 'options'],
  'util': ['utility', 'helper', 'utils', 'helpers'],
  'error': ['exception', 'failure', 'errors'],
  'test': ['spec', 'tests', 'testing'],
  'doc': ['documentation', 'docs', 'comment', 'comments']
};

// Language detection patterns
const LANGUAGE_PATTERNS = {
  'javascript': /\b(javascript|js)\b/i,
  'typescript': /\b(typescript|ts)\b/i,
  'python': /\b(python|py)\b/i,
  'go': /\b(go|golang)\b/i,
  'rust': /\b(rust|rs)\b/i,
  'java': /\b(java)\b/i
};

// AST pattern templates by language
const PATTERNS = {
  javascript: {
    function: 'function $NAME($$$) { $$$ }',
    asyncFunction: 'async function $NAME($$$) { $$$ }',
    arrowFunction: 'const $NAME = ($$$) => $BODY',
    class: 'class $NAME { $$$ }',
    sqlInjection: '$DB.query($SQL)',
    xss: '$ELEM.innerHTML = $DATA',
    eval: 'eval($$$)'
  },
  typescript: {
    function: 'function $NAME($$$): $TYPE { $$$ }',
    asyncFunction: 'async function $NAME($$$): $TYPE { $$$ }',
    arrowFunction: 'const $NAME = ($$$): $TYPE => $BODY',
    class: 'class $NAME { $$$ }',
    sqlInjection: '$DB.query($SQL)',
    xss: '$ELEM.innerHTML = $DATA',
    eval: 'eval($$$)'
  },
  python: {
    function: 'def $NAME($$$): $$$',
    asyncFunction: 'async def $NAME($$$): $$$',
    class: 'class $NAME: $$$',
    sqlInjection: '$DB.execute($SQL)',
    eval: 'eval($$$)'
  },
  go: {
    function: 'func $NAME($$$) $RETURN { $$$ }',
    struct: 'type $NAME struct { $$$ }'
  },
  rust: {
    function: 'fn $NAME($$$) -> $TYPE { $$$ }',
    asyncFunction: 'async fn $NAME($$$) -> $TYPE { $$$ }',
    struct: 'struct $NAME { $$$ }'
  }
};

/**
 * Query analyzer for hybrid search
 * @class QueryAnalyzer
 */
class QueryAnalyzer {
  /**
   * Analyze a query to determine search strategy
   * @param {string} query - User query
   * @returns {QueryAnalysis} Analysis result
   */
  analyze(query) {
    if (!query || typeof query !== 'string') {
      return this._emptyAnalysis();
    }

    const normalized = query.toLowerCase().trim();
    const keywords = this.extractKeywords(query);
    const type = this._detectType(normalized, keywords);
    const language = this._detectLanguage(query);
    const concepts = this._expandConcepts(keywords);
    const astPattern = this.generatePattern(query, language || 'javascript');
    const confidence = this._calculateConfidence(type, keywords, astPattern);

    return {
      type,
      keywords,
      astPattern,
      language,
      concepts,
      confidence
    };
  }

  /**
   * Extract keywords for ripgrep pre-filtering
   * @param {string} query - User query
   * @returns {string[]} Keywords for ripgrep
   */
  extractKeywords(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    // Split on whitespace and punctuation, preserving original case
    const words = query
      .split(/[\s.,;:!?(){}[\]<>]+/)
      .filter(word => word.length > 0);

    // Remove stop words (case-insensitive comparison)
    const filtered = words.filter(word => !STOP_WORDS.has(word.toLowerCase()));

    // Remove duplicates
    return [...new Set(filtered)];
  }

  /**
   * Generate ast-grep pattern from query
   * @param {string} query - User query
   * @param {string} language - Target language
   * @returns {string|null} Generated pattern or null
   */
  generatePattern(query, language) {
    if (!query || typeof query !== 'string') {
      return null;
    }

    const normalized = query.toLowerCase().trim();
    const lang = language || 'javascript';
    const templates = PATTERNS[lang] || PATTERNS.javascript;

    // Check for async function
    if (normalized.includes('async') && (normalized.includes('function') || normalized.includes('func'))) {
      return templates.asyncFunction || templates.function;
    }

    // Check for function
    if (FUNCTION_KEYWORDS.some(kw => normalized.includes(kw))) {
      return templates.function;
    }

    // Check for class
    if (CLASS_KEYWORDS.some(kw => normalized.includes(kw))) {
      return templates.class;
    }

    // Check for security patterns
    if (normalized.includes('sql') && normalized.includes('injection')) {
      return templates.sqlInjection || null;
    }

    if (normalized.includes('xss')) {
      return templates.xss || null;
    }

    if (normalized.includes('eval')) {
      return templates.eval || null;
    }

    // No structural pattern found - semantic search only
    return null;
  }

  /**
   * Detect query type
   * @private
   */
  _detectType(normalized, _keywords) {
    // Check for function queries
    if (FUNCTION_KEYWORDS.some(kw => normalized.includes(kw))) {
      return 'function';
    }

    // Check for class queries
    if (CLASS_KEYWORDS.some(kw => normalized.includes(kw))) {
      return 'class';
    }

    // Check for security queries
    if (SECURITY_KEYWORDS.some(kw => normalized.includes(kw))) {
      return 'security';
    }

    // Check for performance queries
    if (PERFORMANCE_KEYWORDS.some(kw => normalized.includes(kw))) {
      return 'performance';
    }

    // Default to semantic
    return 'semantic';
  }

  /**
   * Detect language from query
   * @private
   */
  _detectLanguage(query) {
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
      if (pattern.test(query)) {
        return lang;
      }
    }
    return null;
  }

  /**
   * Expand concepts with synonyms
   * @private
   */
  _expandConcepts(keywords) {
    const concepts = new Set(keywords);

    for (const keyword of keywords) {
      const synonyms = SYNONYMS[keyword];
      if (synonyms) {
        synonyms.forEach(syn => concepts.add(syn));
      }
    }

    return Array.from(concepts);
  }

  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(type, keywords, astPattern) {
    let confidence = 0.5; // Base confidence

    // High confidence for specific patterns
    if (astPattern !== null) {
      confidence += 0.3;
    }

    // Boost confidence for specific types
    if (type === 'function' || type === 'class') {
      confidence += 0.1;
    }

    // Reduce confidence for vague queries (very few or too many keywords)
    if (keywords.length === 0) {
      confidence -= 0.5;
    } else if (keywords.length === 1) {
      confidence -= 0.2;
    } else if (keywords.length > 20) {
      confidence -= 0.2;
    } else if (keywords.length >= 2 && keywords.length <= 10) {
      // Boost confidence for moderate number of keywords
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Return empty analysis for invalid input
   * @private
   */
  _emptyAnalysis() {
    return {
      type: 'semantic',
      keywords: [],
      astPattern: null,
      language: null,
      concepts: [],
      confidence: 0.0
    };
  }
}

module.exports = { QueryAnalyzer };
