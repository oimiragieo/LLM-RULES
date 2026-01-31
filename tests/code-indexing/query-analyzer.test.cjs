/**
 * Query Analyzer Tests
 *
 * Tests for converting natural language queries into ast-grep patterns
 * and semantic queries for hybrid search.
 *
 * @see .claude/lib/code-indexing/query-analyzer.cjs
 * @see .claude/context/artifacts/PHASE_2_HYBRID_SEARCH_DESIGN.md
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { QueryAnalyzer } = require('../../.claude/lib/code-indexing/query-analyzer.cjs');

describe('QueryAnalyzer', () => {
  describe('Query Type Detection', () => {
    test('detects "function" query type', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find function login');

      assert.equal(result.type, 'function');
      assert.ok(result.keywords.includes('login'));
      assert.ok(result.astPattern.includes('function'));
    });

    test('detects "class" query type', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find class UserModel');

      assert.equal(result.type, 'class');
      assert.ok(result.keywords.includes('UserModel'));
      assert.ok(result.astPattern.includes('class'));
    });

    test('detects "security" query type (SQL injection)', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find SQL injection vulnerabilities');

      assert.equal(result.type, 'security');
      assert.ok(result.keywords.includes('SQL'));
      assert.ok(result.astPattern.includes('query') || result.astPattern.includes('$SQL'));
    });

    test('detects "security" query type (XSS)', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find XSS vulnerabilities');

      assert.equal(result.type, 'security');
      assert.ok(result.keywords.includes('XSS'));
      assert.ok(result.astPattern.includes('innerHTML'));
    });

    test('detects "performance" query type', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find performance bottlenecks');

      assert.equal(result.type, 'performance');
      assert.ok(result.keywords.includes('performance'));
    });

    test('handles empty query', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('');

      assert.equal(result.type, 'semantic');
      assert.deepEqual(result.keywords, []);
      assert.equal(result.astPattern, null);
    });

    test('handles multi-word queries', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('async authentication handler functions');

      assert.equal(result.type, 'function');
      assert.ok(result.keywords.includes('authentication'));
      assert.ok(result.keywords.includes('handler'));
      assert.ok(result.astPattern.includes('async'));
    });
  });

  describe('Pattern Generation', () => {
    test('generates function pattern for JavaScript', () => {
      const analyzer = new QueryAnalyzer();
      const pattern = analyzer.generatePattern('find function login', 'javascript');

      assert.ok(pattern.includes('function'));
      assert.ok(pattern.includes('$'));
    });

    test('generates async function pattern', () => {
      const analyzer = new QueryAnalyzer();
      const pattern = analyzer.generatePattern('find async function', 'typescript');

      assert.ok(pattern.includes('async'));
      assert.ok(pattern.includes('function'));
    });

    test('generates class pattern', () => {
      const analyzer = new QueryAnalyzer();
      const pattern = analyzer.generatePattern('find class', 'javascript');

      assert.ok(pattern.includes('class'));
      assert.ok(pattern.includes('$'));
    });

    test('generates SQL injection pattern', () => {
      const analyzer = new QueryAnalyzer();
      const pattern = analyzer.generatePattern('find SQL injection', 'javascript');

      assert.ok(pattern.includes('query') || pattern.includes('$SQL'));
    });

    test('generates XSS pattern', () => {
      const analyzer = new QueryAnalyzer();
      const pattern = analyzer.generatePattern('find XSS vulnerabilities', 'javascript');

      assert.ok(pattern.includes('innerHTML'));
    });

    test('returns null for semantic-only queries', () => {
      const analyzer = new QueryAnalyzer();
      const pattern = analyzer.generatePattern('authentication logic', 'javascript');

      assert.equal(pattern, null);
    });
  });

  describe('Keyword Extraction', () => {
    test('extracts keywords from query', () => {
      const analyzer = new QueryAnalyzer();
      const keywords = analyzer.extractKeywords('find authentication login functions');

      assert.ok(keywords.includes('authentication'));
      assert.ok(keywords.includes('login'));
      assert.ok(keywords.includes('functions'));
    });

    test('removes common stop words', () => {
      const analyzer = new QueryAnalyzer();
      const keywords = analyzer.extractKeywords('find the authentication and login');

      assert.ok(!keywords.includes('find'));
      assert.ok(!keywords.includes('the'));
      assert.ok(!keywords.includes('and'));
      assert.ok(keywords.includes('authentication'));
      assert.ok(keywords.includes('login'));
    });

    test('handles empty query', () => {
      const analyzer = new QueryAnalyzer();
      const keywords = analyzer.extractKeywords('');

      assert.deepEqual(keywords, []);
    });
  });

  describe('Synonym Expansion', () => {
    test('expands "auth" to "authentication, login, signin"', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find auth functions');

      assert.ok(
        result.concepts.includes('authentication') ||
        result.concepts.includes('login') ||
        result.concepts.includes('signin')
      );
    });

    test('expands "db" to "database"', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find db queries');

      assert.ok(result.concepts.includes('database'));
    });
  });

  describe('Language Detection', () => {
    test('detects JavaScript from query', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find JavaScript functions');

      assert.equal(result.language, 'javascript');
    });

    test('detects TypeScript from query', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find TypeScript classes');

      assert.equal(result.language, 'typescript');
    });

    test('detects Python from query', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find Python functions');

      assert.equal(result.language, 'python');
    });

    test('defaults to null if no language mentioned', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find authentication functions');

      assert.equal(result.language, null);
    });
  });

  describe('Confidence Scoring', () => {
    test('returns high confidence for specific patterns', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find function login');

      assert.ok(result.confidence >= 0.8);
    });

    test('returns low confidence for vague queries', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find code');

      assert.ok(result.confidence < 0.5);
    });

    test('returns medium confidence for semantic queries', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('authentication logic');

      assert.ok(result.confidence >= 0.5 && result.confidence < 0.8);
    });
  });

  describe('Edge Cases', () => {
    test('handles code snippet queries', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('function login(user, pass) { }');

      assert.equal(result.type, 'function');
      assert.ok(result.astPattern !== null);
    });

    test('handles very long queries', () => {
      const analyzer = new QueryAnalyzer();
      const longQuery = 'find async authentication handler functions that validate user credentials using bcrypt and return JWT tokens'.repeat(5);
      const result = analyzer.analyze(longQuery);

      assert.ok(result.type !== undefined);
      assert.ok(result.keywords.length > 0);
    });

    test('handles queries with special characters', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('find $NAME functions with @decorator');

      assert.ok(result.keywords.length > 0);
    });

    test('handles mixed case queries', () => {
      const analyzer = new QueryAnalyzer();
      const result = analyzer.analyze('FIND Class UserModel');

      assert.equal(result.type, 'class');
    });
  });
});
