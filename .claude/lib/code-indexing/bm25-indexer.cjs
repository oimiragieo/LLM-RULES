/**
 * BM25 Sparse Indexer - Fast lexical search using BM25 algorithm
 *
 * @module code-indexing/bm25-indexer
 * @see {@link https://en.wikipedia.org/wiki/Okapi_BM25}
 */

'use strict';

/**
 * Stop words to filter from tokenization (common English words with low information content)
 */
const STOP_WORDS = new Set([
  'the',
  'is',
  'a',
  'an',
  'and',
  'or',
  'to',
  'for',
  'in',
  'on',
  'at',
  'by',
  'of',
  'with',
  'from',
  'as',
  'be',
  'was',
  'are',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'can',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'they',
  'them',
  'their',
]);

/**
 * BM25 Indexer for sparse lexical search
 *
 * Uses TF-IDF weighting with BM25 scoring function:
 * score(D,Q) = Σ IDF(qi) · f(qi,D) · (k1+1) / (f(qi,D) + k1 · (1-b + b·|D|/avgdl))
 *
 * Where:
 * - D = document
 * - Q = query
 * - qi = query term i
 * - f(qi,D) = term frequency of qi in D
 * - |D| = document length (in words)
 * - avgdl = average document length
 * - k1 = term frequency saturation parameter (default 1.5)
 * - b = length normalization parameter (default 0.75)
 * - IDF(qi) = log((N - df(qi) + 0.5) / (df(qi) + 0.5))
 * - N = total number of documents
 * - df(qi) = document frequency of qi
 */
class BM25Indexer {
  /**
   * Create BM25 indexer
   * @param {Object} options - Configuration options
   * @param {number} [options.k1=1.5] - Term frequency saturation parameter
   * @param {number} [options.b=0.75] - Length normalization parameter
   */
  constructor(options = {}) {
    this.k1 = options.k1 ?? 1.5;
    this.b = options.b ?? 0.75;

    // Index state
    this.documents = []; // Array of { id, text, tokens, length, termFreqs }
    this.idf = {}; // IDF scores: { term: idfScore }
    this.avgDocLength = 0; // Average document length
    this.N = 0; // Total document count
    this._idfDirty = true; // Flag to track if IDF needs recalculation
  }

  /**
   * Tokenize text into words (lowercase, punctuation removed, stop words filtered)
   * @param {string} text - Text to tokenize
   * @returns {string[]} Array of tokens
   * @private
   */
  _tokenize(text) {
    // Convert to lowercase and split on non-alphanumeric
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 0);

    // Filter stop words
    return words.filter(word => !STOP_WORDS.has(word));
  }

  /**
   * Calculate term frequency map for a document
   * @param {string[]} tokens - Document tokens
   * @returns {Object} Map of term to frequency: { term: count }
   * @private
   */
  _calculateTermFreqs(tokens) {
    const freqs = {};
    for (const token of tokens) {
      freqs[token] = (freqs[token] || 0) + 1;
    }
    return freqs;
  }

  /**
   * Calculate IDF scores for all terms in the corpus
   * IDF(term) = log((N - df + 0.5) / (df + 0.5))
   * @private
   */
  _calculateIDF() {
    const df = {}; // Document frequency: { term: count of docs containing term }

    // Count document frequency for each term
    for (const doc of this.documents) {
      const uniqueTerms = Object.keys(doc.termFreqs);
      for (const term of uniqueTerms) {
        df[term] = (df[term] || 0) + 1;
      }
    }

    // Calculate IDF for each term
    this.idf = {};
    for (const term in df) {
      const numerator = this.N - df[term] + 0.5;
      const denominator = df[term] + 0.5;
      this.idf[term] = Math.log(numerator / denominator + 1); // +1 to avoid log(0)
    }
  }

  /**
   * Ensure IDF scores are up-to-date (lazy calculation)
   * Only calculates if _idfDirty flag is true
   * @private
   */
  _ensureIDF() {
    if (this._idfDirty) {
      this._calculateIDF();
      this._idfDirty = false;
    }
  }

  /**
   * Add documents to the index
   * @param {Array<{id: string, text: string}>} docs - Documents to add
   */
  addDocuments(docs) {
    if (!Array.isArray(docs) || docs.length === 0) {
      return;
    }

    // Process each document
    for (const doc of docs) {
      const tokens = this._tokenize(doc.text);
      const termFreqs = this._calculateTermFreqs(tokens);

      this.documents.push({
        id: doc.id,
        length: tokens.length,
        termFreqs,
      });
    }

    // Update corpus statistics
    this.N = this.documents.length;
    const totalLength = this.documents.reduce((sum, doc) => sum + doc.length, 0);
    this.avgDocLength = this.N > 0 ? totalLength / this.N : 0;

    // Mark IDF as dirty instead of recalculating immediately
    this._idfDirty = true;
  }

  /**
   * Remove a document from the index
   * @param {string} id - ID of the document to remove
   * @returns {boolean} True if document was removed
   */
  removeDocument(id) {
    const initialLen = this.documents.length;
    this.documents = this.documents.filter(doc => doc.id !== id);

    if (this.documents.length !== initialLen) {
      this._idfDirty = true;
      this.N = this.documents.length;
      // Recalculate avg length
      const totalLength = this.documents.reduce((sum, doc) => sum + doc.length, 0);
      this.avgDocLength = this.N > 0 ? totalLength / this.N : 0;
      return true;
    }
    return false;
  }

  /**
   * Update a document in the index
   * @param {string} id - Document ID
   * @param {string} text - New document text
   */
  updateDocument(id, text) {
    this.removeDocument(id);
    this.addDocuments([{ id, text }]);
  }

  /**
   * Optimize the index by compacting memory and forcing IDF recalculation
   */
  optimize() {
    this._calculateIDF();
    this._idfDirty = false;
    // Suggest garbage collection for the documents array if it's large
    // (In Node.js this is automatic, but we ensure we're not holding references)
  }

  /**
   * Calculate BM25 score for a document given a query
   * @param {Object} doc - Document object
   * @param {string[]} queryTokens - Query tokens
   * @returns {number} BM25 score
   * @private
   */
  _calculateBM25Score(doc, queryTokens) {
    let score = 0;

    for (const term of queryTokens) {
      const idf = this.idf[term] || 0;
      if (idf === 0) continue; // Term not in corpus

      const termFreq = doc.termFreqs[term] || 0;
      if (termFreq === 0) continue; // Term not in document

      // BM25 formula
      const numerator = termFreq * (this.k1 + 1);
      const denominator =
        termFreq + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength));

      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * Search for documents matching query
   * @param {string} query - Search query
   * @param {number} [limit=100] - Maximum number of results to return
   * @returns {Array<{id: string, score: number}>} Results sorted by relevance (descending)
   */
  search(query, limit = 100) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return [];
    }

    // Ensure IDF is calculated before searching
    this._ensureIDF();

    const queryTokens = this._tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    // Score all documents
    const results = [];
    for (const doc of this.documents) {
      const score = this._calculateBM25Score(doc, queryTokens);
      if (score > 0) {
        results.push({ id: doc.id, score });
      }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Serialize index to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    // Ensure IDF is calculated before serializing
    this._ensureIDF();

    return {
      k1: this.k1,
      b: this.b,
      documents: this.documents,
      idf: this.idf,
      avgDocLength: this.avgDocLength,
      N: this.N,
    };
  }

  /**
   * Deserialize index from JSON
   * @param {Object} json - JSON representation
   * @returns {BM25Indexer} Restored indexer instance
   */
  static fromJSON(json) {
    const indexer = new BM25Indexer({ k1: json.k1, b: json.b });
    indexer.documents = json.documents;
    indexer.idf = json.idf;
    indexer.avgDocLength = json.avgDocLength;
    indexer.N = json.N;
    indexer._idfDirty = false; // IDF already calculated in serialized data
    return indexer;
  }
}

module.exports = { BM25Indexer };
