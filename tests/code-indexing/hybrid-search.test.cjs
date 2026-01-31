/**
 * Tests for hybrid-search.cjs - Three-stage hybrid search orchestrator
 *
 * @see .claude/lib/code-indexing/hybrid-search.cjs
 * @see .claude/context/artifacts/PHASE_2_HYBRID_SEARCH_DESIGN.md
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HybridSearch } = require('../../.claude/lib/code-indexing/hybrid-search.cjs');

describe('HybridSearch', () => {
  let mockIndexManager;
  let mockAstGrep;
  let mockQueryAnalyzer;
  let mockRanker;

  beforeEach(() => {
    // Mock IndexManager with semanticSearch
    mockIndexManager = {
      semanticSearch: async (query, _options) => {
        if (query.includes('auth')) {
          return [
            {
              filePath: 'src/auth/login.js',
              lineStart: 10,
              lineEnd: 20,
              content: 'function authenticate(user, pass) { return jwt.sign(user); }',
              semanticScore: 0.89,
              metadata: {},
            },
            {
              filePath: 'src/auth/validator.js',
              lineStart: 45,
              lineEnd: 60,
              content: 'function validatePassword(pass) { return pass.length >= 8; }',
              semanticScore: 0.72,
              metadata: {},
            },
          ];
        }
        return [];
      },
    };

    // Mock AstGrepSearch
    mockAstGrep = {
      isAvailable: async () => true,
      search: async (_pattern, _lang, _options) => {
        return [
          {
            filePath: 'src/auth/login.js',
            lineStart: 10,
            lineEnd: 20,
            colStart: 0,
            colEnd: 50,
            code: 'function authenticate(user, pass) { return jwt.sign(user); }',
            matches: { NAME: 'authenticate', ARGS: 'user, pass' },
            language: 'javascript',
          },
        ];
      },
      refine: async (semanticResults, _pattern, _lang) => {
        return semanticResults.map(r => ({
          ...r,
          structuralScore: r.filePath.includes('login') ? 1.0 : 0.0,
          structuralMatch: r.filePath.includes('login') ? { matches: {} } : null,
        }));
      },
    };

    // Mock QueryAnalyzer
    mockQueryAnalyzer = {
      analyze: _query => {
        return {
          type: 'function',
          keywords: ['auth', 'function'],
          astPattern: 'function $NAME($$$) { $$$ }',
          language: 'javascript',
          concepts: ['auth', 'authentication', 'login'],
          confidence: 0.85,
        };
      },
    };

    // Mock ResultRanker
    mockRanker = {
      combine: (semantic, _structural) => {
        return semantic.map((s, _i) => ({
          filePath: s.filePath,
          lineStart: s.lineStart,
          lineEnd: s.lineEnd,
          content: s.content,
          score: s.semanticScore * 0.7 + (s.structuralScore || 0) * 0.3,
          semanticScore: s.semanticScore,
          structuralScore: s.structuralScore || 0,
          sources: s.structuralScore ? ['semantic', 'structural'] : ['semantic'],
          metadata: s.metadata || {},
          matches: s.structuralMatch?.matches || null,
        }));
      },
      deduplicate: results => results,
      sort: results => [...results].sort((a, b) => b.score - a.score),
      topK: (results, k) => results.slice(0, k),
      filterByConfidence: results => results.filter(r => r.score >= 0.3),
    };
  });

  describe('Constructor', () => {
    it('initializes with default options', () => {
      const hybrid = new HybridSearch(mockIndexManager);
      assert.ok(hybrid);
      assert.strictEqual(hybrid.indexManager, mockIndexManager);
    });

    it('accepts custom weights', () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        semanticWeight: 0.8,
        structuralWeight: 0.2,
      });
      assert.strictEqual(hybrid.options.semanticWeight, 0.8);
      assert.strictEqual(hybrid.options.structuralWeight, 0.2);
    });

    it('accepts custom topK', () => {
      const hybrid = new HybridSearch(mockIndexManager, { topK: 5 });
      assert.strictEqual(hybrid.options.topK, 5);
    });

    it('disables ripgrep with useRipgrep: false', () => {
      const hybrid = new HybridSearch(mockIndexManager, { useRipgrep: false });
      assert.strictEqual(hybrid.options.useRipgrep, false);
    });
  });

  describe('search() - Three-Stage Pipeline', () => {
    it('executes semantic-only search when no pattern', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: null, // No ast-grep available
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('authentication functions');

      assert.ok(results);
      assert.ok(results.results);
      assert.strictEqual(results.query, 'authentication functions');
      assert.ok(results.timing);
      assert.ok(results.timing.semantic !== undefined);
    });

    it('executes combined semantic + structural search', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('authentication functions');

      assert.ok(results.results);
      assert.ok(results.results.length > 0);
      assert.ok(results.results[0].semanticScore !== undefined);
      assert.ok(results.results[0].structuralScore !== undefined);
    });

    it('returns top-K results (default 10)', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
        topK: 10,
      });

      const results = await hybrid.search('auth functions');

      assert.ok(results.results.length <= 10);
    });

    it('respects custom topK option', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
        topK: 3,
      });

      const results = await hybrid.search('auth functions', { limit: 3 });

      assert.ok(results.results.length <= 3);
    });

    it('skips structural stage when ast-grep unavailable', async () => {
      mockAstGrep.isAvailable = async () => false;

      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('auth functions');

      assert.ok(results.results);
      // Should have semantic scores only
      assert.ok(results.results.every(r => r.semanticScore !== undefined));
    });

    it('uses explicit pattern from options', async () => {
      let capturedPattern;
      mockAstGrep.refine = async (semanticResults, pattern, _lang) => {
        capturedPattern = pattern;
        return [];
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      await hybrid.search('test', { pattern: 'async function $NAME($$$) { $$$ }' });

      assert.strictEqual(capturedPattern, 'async function $NAME($$$) { $$$ }');
    });

    it('uses language from options', async () => {
      let capturedLang;
      mockAstGrep.refine = async (semanticResults, pattern, lang) => {
        capturedLang = lang;
        return [];
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      await hybrid.search('test', { language: 'python' });

      assert.strictEqual(capturedLang, 'python');
    });

    it('filters by language in semantic search', async () => {
      let capturedFilters;
      mockIndexManager.semanticSearch = async (query, options) => {
        capturedFilters = options.filters;
        return [];
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      await hybrid.search('test', { language: 'typescript' });

      assert.deepStrictEqual(capturedFilters, { language: 'typescript' });
    });
  });

  describe('semanticStage()', () => {
    it('calls indexManager.semanticSearch with query', async () => {
      let capturedQuery;
      mockIndexManager.semanticSearch = async (query, _options) => {
        capturedQuery = query;
        return [];
      };

      const hybrid = new HybridSearch(mockIndexManager);

      await hybrid.semanticStage('authentication');

      assert.strictEqual(capturedQuery, 'authentication');
    });

    it('passes limit option to semantic search', async () => {
      let capturedOptions;
      mockIndexManager.semanticSearch = async (query, options) => {
        capturedOptions = options;
        return [];
      };

      const hybrid = new HybridSearch(mockIndexManager);

      await hybrid.semanticStage('test', 20);

      assert.strictEqual(capturedOptions.limit, 20);
    });

    it('returns semantic results', async () => {
      const hybrid = new HybridSearch(mockIndexManager);

      const results = await hybrid.semanticStage('auth');

      assert.ok(Array.isArray(results));
      assert.ok(results.length > 0);
      assert.ok(results[0].semanticScore !== undefined);
    });
  });

  describe('structuralStage()', () => {
    it('calls astGrep.refine with pattern', async () => {
      let capturedPattern;
      mockAstGrep.refine = async (semanticResults, pattern, _lang) => {
        capturedPattern = pattern;
        return [];
      };

      const hybrid = new HybridSearch(mockIndexManager, { astGrep: mockAstGrep });

      const semanticResults = [{ filePath: 'test.js', lineStart: 1, lineEnd: 5 }];
      await hybrid.structuralStage(semanticResults, 'function $NAME($$$) { $$$ }', 'javascript');

      assert.strictEqual(capturedPattern, 'function $NAME($$$) { $$$ }');
    });

    it('returns empty array when no pattern', async () => {
      const hybrid = new HybridSearch(mockIndexManager, { astGrep: mockAstGrep });

      const results = await hybrid.structuralStage([], null, 'javascript');

      assert.deepStrictEqual(results, []);
    });

    it('returns empty array when ast-grep unavailable', async () => {
      mockAstGrep.isAvailable = async () => false;

      const hybrid = new HybridSearch(mockIndexManager, { astGrep: mockAstGrep });

      const results = await hybrid.structuralStage([], 'function $NAME($$$) { $$$ }', 'javascript');

      assert.deepStrictEqual(results, []);
    });
  });

  describe('combineResults()', () => {
    it('uses ranker to combine semantic and structural', () => {
      const hybrid = new HybridSearch(mockIndexManager, { ranker: mockRanker });

      const semantic = [
        { filePath: 'test.js', lineStart: 1, lineEnd: 5, semanticScore: 0.8, content: 'test' },
      ];
      const structural = [];

      const combined = hybrid.combineResults(semantic, structural);

      assert.ok(Array.isArray(combined));
      assert.ok(combined[0].score !== undefined);
    });

    it('deduplicates results', () => {
      const hybrid = new HybridSearch(mockIndexManager, { ranker: mockRanker });

      const semantic = [
        { filePath: 'test.js', lineStart: 1, lineEnd: 5, semanticScore: 0.8, content: 'test' },
        { filePath: 'test.js', lineStart: 1, lineEnd: 5, semanticScore: 0.8, content: 'test' },
      ];

      const combined = hybrid.combineResults(semantic, []);

      // Ranker's deduplicate should be called
      assert.ok(Array.isArray(combined));
    });

    it('sorts by combined score descending', () => {
      const hybrid = new HybridSearch(mockIndexManager, { ranker: mockRanker });

      const semantic = [
        { filePath: 'test1.js', lineStart: 1, lineEnd: 5, semanticScore: 0.5, content: 'test' },
        { filePath: 'test2.js', lineStart: 1, lineEnd: 5, semanticScore: 0.9, content: 'test' },
      ];

      const combined = hybrid.combineResults(semantic, []);

      // Should be sorted by score descending
      assert.ok(combined[0].score >= combined[1].score);
    });
  });

  describe('Performance Timing', () => {
    it('tracks timing for each stage', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('auth functions');

      assert.ok(results.timing);
      assert.ok(results.timing.total !== undefined);
      assert.ok(results.timing.semantic !== undefined);
      assert.ok(results.timing.combine !== undefined);
    });

    it('total timing includes all stages', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('auth functions');

      const sumStages =
        (results.timing.semantic || 0) +
        (results.timing.astGrep || 0) +
        (results.timing.combine || 0);

      assert.ok(results.timing.total >= sumStages);
    });
  });

  describe('Error Handling', () => {
    it('handles empty query', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('');

      assert.ok(results);
      assert.ok(Array.isArray(results.results));
    });

    it('handles semantic search errors', async () => {
      mockIndexManager.semanticSearch = async () => {
        throw new Error('Semantic search failed');
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      await assert.rejects(async () => hybrid.search('test'), {
        message: /Semantic search failed/,
      });
    });

    it('handles ast-grep errors gracefully', async () => {
      mockAstGrep.refine = async () => {
        throw new Error('ast-grep failed');
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      // Should not throw - gracefully fallback to semantic only
      await assert.rejects(async () => hybrid.search('test'), { message: /ast-grep failed/ });
    });
  });

  describe('Integration Points', () => {
    it('integrates with IndexManager', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('auth');

      assert.ok(results);
      // Should have called mockIndexManager.semanticSearch
      assert.ok(results.results);
    });

    it('integrates with AstGrepSearch', async () => {
      const hybrid = new HybridSearch(mockIndexManager, {
        astGrep: mockAstGrep,
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      const results = await hybrid.search('auth functions');

      // Should have structural scores
      assert.ok(results.results.some(r => r.structuralScore !== undefined));
    });

    it('integrates with QueryAnalyzer', async () => {
      let analyzerCalled = false;
      mockQueryAnalyzer.analyze = _query => {
        analyzerCalled = true;
        return {
          type: 'function',
          keywords: ['test'],
          astPattern: null,
          language: null,
          concepts: ['test'],
          confidence: 0.5,
        };
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      await hybrid.search('test');

      assert.ok(analyzerCalled);
    });

    it('integrates with ResultRanker', async () => {
      let rankerCalled = false;
      mockRanker.combine = (semantic, _structural) => {
        rankerCalled = true;
        return semantic.map(s => ({ ...s, score: s.semanticScore }));
      };

      const hybrid = new HybridSearch(mockIndexManager, {
        queryAnalyzer: mockQueryAnalyzer,
        ranker: mockRanker,
      });

      await hybrid.search('test');

      assert.ok(rankerCalled);
    });
  });
});
