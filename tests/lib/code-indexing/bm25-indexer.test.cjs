/**
 * BM25 Indexer Tests
 *
 * Tests for BM25 sparse search indexing (TF-IDF scoring).
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BM25Indexer } = require('../../../.claude/lib/code-indexing/bm25-indexer.cjs');

// Constructor tests
test('BM25Indexer - constructor - should create instance with default parameters', () => {
  const indexer = new BM25Indexer();
  assert.ok(indexer);
  assert.equal(indexer.k1, 1.5);
  assert.equal(indexer.b, 0.75);
});

test('BM25Indexer - constructor - should accept custom k1 and b parameters', () => {
  const indexer = new BM25Indexer({ k1: 2.0, b: 0.5 });
  assert.equal(indexer.k1, 2.0);
  assert.equal(indexer.b, 0.5);
});

// Tokenization tests
test('BM25Indexer - tokenization - should tokenize text into words', () => {
  const indexer = new BM25Indexer();
  const tokens = indexer._tokenize('function authenticate(user, password) { return true; }');
  assert.ok(tokens.includes('function'));
  assert.ok(tokens.includes('authenticate'));
  assert.ok(tokens.includes('user'));
  assert.ok(tokens.includes('password'));
  assert.ok(tokens.includes('return'));
  assert.ok(tokens.includes('true'));
});

test('BM25Indexer - tokenization - should filter stop words', () => {
  const indexer = new BM25Indexer();
  const tokens = indexer._tokenize('the quick brown fox jumps over the lazy dog');
  assert.ok(!tokens.includes('the'));
  assert.ok(tokens.includes('quick'));
  assert.ok(tokens.includes('brown'));
  assert.ok(tokens.includes('fox'));
});

test('BM25Indexer - tokenization - should convert to lowercase', () => {
  const indexer = new BM25Indexer();
  const tokens = indexer._tokenize('AuthenticationService validates USER credentials');
  assert.ok(tokens.includes('authenticationservice'));
  assert.ok(tokens.includes('validates'));
  assert.ok(tokens.includes('user'));
});

test('BM25Indexer - tokenization - should handle punctuation and special characters', () => {
  const indexer = new BM25Indexer();
  const tokens = indexer._tokenize('function() { return user.name; }');
  assert.ok(tokens.includes('function'));
  assert.ok(tokens.includes('return'));
  assert.ok(tokens.includes('user'));
  assert.ok(tokens.includes('name'));
});

// Add documents tests
test('BM25Indexer - addDocuments - should add documents to the index', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'authenticate user with password' },
    { id: '2', text: 'validate user credentials' },
    { id: '3', text: 'authorize user access to resource' },
  ];

  indexer.addDocuments(docs);

  assert.equal(indexer.documents.length, 3);
  assert.ok(indexer.avgDocLength > 0);
});

test('BM25Indexer - addDocuments - should calculate IDF scores', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'authenticate user password' },
    { id: '2', text: 'validate user credentials' },
    { id: '3', text: 'authorize user resource' },
  ];

  indexer.addDocuments(docs);

  // "user" appears in all 3 docs, should have lower IDF
  // "password" appears in 1 doc, should have higher IDF
  assert.ok(indexer.idf['user'] !== undefined);
  assert.ok(indexer.idf['password'] !== undefined);
  assert.ok(indexer.idf['password'] > indexer.idf['user']);
});

test('BM25Indexer - addDocuments - should handle empty documents array', () => {
  const indexer = new BM25Indexer();
  assert.doesNotThrow(() => indexer.addDocuments([]));
  assert.equal(indexer.documents.length, 0);
});

// Search tests
test('BM25Indexer - search - should return results ranked by relevance', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'function authenticate(user, password) validates credentials and returns token' },
    { id: '2', text: 'class AuthService handles user authentication and authorization' },
    { id: '3', text: 'const validatePassword checks password strength requirements' },
    { id: '4', text: 'async login(username, password) calls authenticate with credentials' },
    { id: '5', text: 'export default UserService manages user data and profiles' },
  ];
  indexer.addDocuments(docs);

  const results = indexer.search('authenticate password', 10);

  assert.ok(results.length > 0);
  assert.ok(results[0].id);
  assert.ok(typeof results[0].score === 'number');

  // Results should be sorted by score (descending)
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i-1].score >= results[i].score);
  }
});

test('BM25Indexer - search - should find exact matches with high scores', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'function authenticate(user, password) validates credentials and returns token' },
    { id: '2', text: 'class AuthService handles user authentication and authorization' },
    { id: '3', text: 'const validatePassword checks password strength requirements' },
    { id: '4', text: 'async login(username, password) calls authenticate with credentials' },
    { id: '5', text: 'export default UserService manages user data and profiles' },
  ];
  indexer.addDocuments(docs);

  const results = indexer.search('authenticate', 10);

  // Doc 1 and 4 contain "authenticate" (doc 2 has "authentication", which is different token)
  assert.ok(results.length >= 2);
  assert.ok(results[0].score > 0);
});

test('BM25Indexer - search - should respect limit parameter', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'user data' },
    { id: '2', text: 'user profile' },
    { id: '3', text: 'user settings' },
    { id: '4', text: 'user preferences' },
  ];
  indexer.addDocuments(docs);

  const results = indexer.search('user', 2);
  assert.ok(results.length <= 2);
});

test('BM25Indexer - search - should return empty array for query with no matches', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'authenticate user' },
    { id: '2', text: 'validate password' },
  ];
  indexer.addDocuments(docs);

  const results = indexer.search('nonexistentword12345', 10);
  assert.deepEqual(results, []);
});

test('BM25Indexer - search - should handle empty query', () => {
  const indexer = new BM25Indexer();
  const docs = [{ id: '1', text: 'test' }];
  indexer.addDocuments(docs);

  const results = indexer.search('', 10);
  assert.deepEqual(results, []);
});

// Serialization tests
test('BM25Indexer - serialization - should serialize to JSON', () => {
  const indexer = new BM25Indexer();
  const docs = [
    { id: '1', text: 'authenticate user' },
    { id: '2', text: 'validate password' },
  ];
  indexer.addDocuments(docs);

  const json = indexer.toJSON();

  assert.ok(json.documents);
  assert.ok(json.idf);
  assert.ok(typeof json.avgDocLength === 'number');
  assert.ok(typeof json.k1 === 'number');
  assert.ok(typeof json.b === 'number');
  assert.equal(json.documents.length, 2);
});

test('BM25Indexer - serialization - should deserialize from JSON', () => {
  const indexer1 = new BM25Indexer();
  const docs = [
    { id: '1', text: 'authenticate user' },
    { id: '2', text: 'validate password' },
  ];
  indexer1.addDocuments(docs);

  const json = indexer1.toJSON();
  const indexer2 = BM25Indexer.fromJSON(json);

  assert.equal(indexer2.documents.length, 2);
  assert.equal(indexer2.avgDocLength, indexer1.avgDocLength);
  assert.equal(indexer2.k1, indexer1.k1);
  assert.equal(indexer2.b, indexer1.b);

  // Should produce same search results
  const results1 = indexer1.search('authenticate', 10);
  const results2 = indexer2.search('authenticate', 10);
  assert.equal(results2.length, results1.length);
  assert.equal(results2[0].id, results1[0].id);
});

// BM25 algorithm tests
test('BM25Indexer - scoring - should calculate correct BM25 scores', () => {
  const indexer = new BM25Indexer({ k1: 1.5, b: 0.75 });
  const docs = [
    { id: '1', text: 'cat cat cat' },
    { id: '2', text: 'cat dog' },
    { id: '3', text: 'dog dog dog dog' },
  ];
  indexer.addDocuments(docs);

  const results = indexer.search('cat', 10);

  // Doc 1 has highest term frequency for "cat", should score highest
  assert.equal(results[0].id, '1');
  assert.ok(results[0].score > results[1].score);
});

test('BM25Indexer - scoring - should penalize longer documents (b parameter effect)', () => {
  const indexer = new BM25Indexer({ k1: 1.5, b: 0.75 });
  const docs = [
    { id: 'short', text: 'authenticate' },
    { id: 'long', text: 'authenticate function validates user credentials and returns authentication token after successful validation' },
  ];
  indexer.addDocuments(docs);

  const results = indexer.search('authenticate', 10);

  // Shorter document should score higher (same term frequency, shorter length)
  const shortDoc = results.find(r => r.id === 'short');
  const longDoc = results.find(r => r.id === 'long');
  assert.ok(shortDoc.score > longDoc.score);
});
