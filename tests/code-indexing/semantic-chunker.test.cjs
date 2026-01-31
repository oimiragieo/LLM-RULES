/**
 * Semantic Chunker Tests - TDD Approach
 */

'use strict';

const { test, suite } = require('node:test');
const assert = require('node:assert');
const {
  SemanticChunker,
  CHUNK_TYPES,
} = require('../../.claude/lib/code-indexing/semantic-chunker.cjs');

suite('SemanticChunker', () => {
  suite('Constructor and Defaults', () => {
    test('creates instance with default options', () => {
      const chunker = new SemanticChunker();
      assert.ok(chunker);
      assert.strictEqual(chunker.options.minTokens, 50);
      assert.strictEqual(chunker.options.maxTokens, 2048);
      assert.strictEqual(chunker.options.targetTokens, 512);
    });

    test('accepts custom options', () => {
      const custom = new SemanticChunker({ minTokens: 100 });
      assert.strictEqual(custom.options.minTokens, 100);
    });
  });

  suite('Token Counting (38.2)', () => {
    test('estimates tokens for simple text', () => {
      const chunker = new SemanticChunker();
      const text = 'function hello() { return 42; }';
      const tokens = chunker.estimateTokens(text);
      assert.ok(tokens > 0);
      assert.ok(tokens < text.length); // Should be roughly chars / 4
    });

    test('handles empty text', () => {
      const chunker = new SemanticChunker();
      assert.strictEqual(chunker.estimateTokens(''), 0);
      assert.strictEqual(chunker.estimateTokens(null), 0);
    });

    test('validates chunk size', () => {
      const chunker = new SemanticChunker();
      const valid = chunker.validateChunkSize('function hello() { return 42; }');
      assert.ok('tokens' in valid);
      assert.ok('tooSmall' in valid);
      assert.ok('tooLarge' in valid);
      assert.ok('valid' in valid);
    });

    test('detects chunks that are too small', () => {
      const chunker = new SemanticChunker();
      const result = chunker.validateChunkSize('x');
      assert.strictEqual(result.tooSmall, true);
      assert.strictEqual(result.valid, false);
    });

    test('detects chunks that are too large', () => {
      const chunker = new SemanticChunker();
      const largeCode = 'x'.repeat(10000);
      const result = chunker.validateChunkSize(largeCode);
      assert.strictEqual(result.tooLarge, true);
      assert.strictEqual(result.valid, false);
    });
  });

  suite('Chunk ID Generation (38.3)', () => {
    test('generates unique chunk ID', () => {
      const chunker = new SemanticChunker();
      const id1 = chunker.generateChunkId('/path/file.js', 10, 'function foo() {}');
      assert.match(id1, /^chunk_[a-f0-9]{16}$/);
    });

    test('generates same ID for same inputs', () => {
      const chunker = new SemanticChunker();
      const id1 = chunker.generateChunkId('/path/file.js', 10, 'function foo() {}');
      const id2 = chunker.generateChunkId('/path/file.js', 10, 'function foo() {}');
      assert.strictEqual(id1, id2);
    });

    test('generates different ID for different inputs', () => {
      const chunker = new SemanticChunker();
      const id1 = chunker.generateChunkId('/path/file.js', 10, 'function foo() {}');
      const id2 = chunker.generateChunkId('/path/file.js', 11, 'function foo() {}');
      assert.notStrictEqual(id1, id2);
    });
  });

  suite('Node Type Mapping (38.4)', () => {
    test('maps JavaScript node types', () => {
      const chunker = new SemanticChunker();
      assert.strictEqual(
        chunker.getChunkType('function_declaration', 'javascript'),
        CHUNK_TYPES.FUNCTION
      );
      assert.strictEqual(
        chunker.getChunkType('class_declaration', 'javascript'),
        CHUNK_TYPES.CLASS
      );
      assert.strictEqual(
        chunker.getChunkType('method_definition', 'javascript'),
        CHUNK_TYPES.METHOD
      );
    });

    test('maps TypeScript node types', () => {
      const chunker = new SemanticChunker();
      assert.strictEqual(
        chunker.getChunkType('interface_declaration', 'typescript'),
        CHUNK_TYPES.INTERFACE
      );
      assert.strictEqual(
        chunker.getChunkType('type_alias_declaration', 'typescript'),
        CHUNK_TYPES.TYPE
      );
    });

    test('maps Python node types', () => {
      const chunker = new SemanticChunker();
      assert.strictEqual(
        chunker.getChunkType('function_definition', 'python'),
        CHUNK_TYPES.FUNCTION
      );
      assert.strictEqual(chunker.getChunkType('class_definition', 'python'), CHUNK_TYPES.CLASS);
    });

    test('returns OTHER for unknown types', () => {
      const chunker = new SemanticChunker();
      assert.strictEqual(chunker.getChunkType('unknown_type', 'javascript'), CHUNK_TYPES.OTHER);
    });
  });

  suite('Name Extraction (38.5)', () => {
    test('extracts name from mock node with identifier', () => {
      const chunker = new SemanticChunker();
      const mockNode = {
        type: 'function_declaration',
        children: [
          { type: 'keyword', text: 'function' },
          { type: 'identifier', text: 'myFunction' },
        ],
      };
      assert.strictEqual(chunker.extractName(mockNode, 'javascript'), 'myFunction');
    });

    test('returns null when no name found', () => {
      const chunker = new SemanticChunker();
      const mockNode = {
        type: 'expression_statement',
        children: [],
      };
      assert.strictEqual(chunker.extractName(mockNode, 'javascript'), null);
    });

    test('extracts signature from node', () => {
      const chunker = new SemanticChunker();
      const content = `function myFunction(a, b) {
  return a + b;
}`;
      const mockNode = {
        startPosition: { row: 0, column: 0 },
        text: content,
      };
      const signature = chunker.extractSignature(mockNode, content);
      assert.ok(signature.includes('function myFunction'));
      assert.ok(signature.length <= 200);
    });
  });

  suite.skip('Main chunk() Method (38.6)', () => {
    test('chunks simple function', () => {
      const chunker = new SemanticChunker();
      const parseResult = {
        content: 'function hello() {\n  return "world";\n}',
        language: 'javascript',
        rootNode: {
          children: [
            {
              type: 'function_declaration',
              text: 'function hello() {\n  return "world";\n}',
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 2, column: 1 },
              children: [
                { type: 'function', text: 'function' },
                { type: 'identifier', text: 'hello' },
              ],
            },
          ],
        },
      };

      const chunks = chunker.chunk(parseResult, 'test.js');
      assert.ok(Array.isArray(chunks));
      assert.ok(chunks.length > 0);
      assert.strictEqual(chunks[0].type, CHUNK_TYPES.FUNCTION);
      assert.strictEqual(chunks[0].filePath, 'test.js');
    });

    test('skips chunks below minTokens', () => {
      const chunker = new SemanticChunker();
      const parseResult = {
        content: 'x',
        language: 'javascript',
        rootNode: {
          children: [
            {
              type: 'variable_declaration',
              text: 'x',
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 0, column: 1 },
              children: [],
            },
          ],
        },
      };

      const chunks = chunker.chunk(parseResult, 'test.js');
      assert.strictEqual(chunks.length, 0); // Too small, filtered out
    });

    test('handles multiple top-level functions', () => {
      const chunker = new SemanticChunker();
      const content = 'function foo() { return 1; }\nfunction bar() { return 2; }';
      const parseResult = {
        content,
        language: 'javascript',
        rootNode: {
          children: [
            {
              type: 'function_declaration',
              text: 'function foo() { return 1; }',
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 0, column: 28 },
              children: [
                { type: 'function', text: 'function' },
                { type: 'identifier', text: 'foo' },
              ],
            },
            {
              type: 'function_declaration',
              text: 'function bar() { return 2; }',
              startPosition: { row: 1, column: 0 },
              endPosition: { row: 1, column: 28 },
              children: [
                { type: 'function', text: 'function' },
                { type: 'identifier', text: 'bar' },
              ],
            },
          ],
        },
      };

      const chunks = chunker.chunk(parseResult, 'test.js');
      assert.ok(chunks.length >= 2);
    });
  });

  suite.skip('Create Chunk (38.6 helper)', () => {
    test('creates chunk with required fields', () => {
      const chunker = new SemanticChunker();
      const content = 'function test() { return 42; }';
      const mockNode = {
        type: 'function_declaration',
        text: content,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: content.length },
        children: [
          { type: 'function', text: 'function' },
          { type: 'identifier', text: 'test' },
        ],
      };

      const chunk = chunker.createChunk(
        mockNode,
        CHUNK_TYPES.FUNCTION,
        'javascript',
        'test.js',
        content
      );
      assert.ok(chunk.id);
      assert.strictEqual(chunk.type, CHUNK_TYPES.FUNCTION);
      assert.strictEqual(chunk.language, 'javascript');
      assert.strictEqual(chunk.filePath, 'test.js');
      assert.ok(chunk.tokenCount > 0);
      assert.strictEqual(chunk.lineStart, 1);
      assert.strictEqual(chunk.lineEnd, 1);
      assert.ok(chunk.content);
    });
  });

  suite.skip('Class Chunking (38.7)', () => {
    test('chunks class into header and methods', () => {
      const chunker = new SemanticChunker();
      const content = `class Calculator {
  constructor() {
    this.value = 0;
  }

  add(x) {
    this.value += x;
    return this.value;
  }

  subtract(x) {
    this.value -= x;
    return this.value;
  }
}`;
      const mockClassNode = {
        type: 'class_declaration',
        text: content,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 13, column: 1 },
        children: [
          { type: 'class', text: 'class' },
          { type: 'identifier', text: 'Calculator' },
          {
            type: 'class_body',
            children: [
              {
                type: 'method_definition',
                text: '  constructor() {\n    this.value = 0;\n  }',
                startPosition: { row: 1, column: 2 },
                endPosition: { row: 3, column: 3 },
                children: [{ type: 'property_identifier', text: 'constructor' }],
              },
              {
                type: 'method_definition',
                text: '  add(x) {\n    this.value += x;\n    return this.value;\n  }',
                startPosition: { row: 5, column: 2 },
                endPosition: { row: 8, column: 3 },
                children: [{ type: 'property_identifier', text: 'add' }],
              },
              {
                type: 'method_definition',
                text: '  subtract(x) {\n    this.value -= x;\n    return this.value;\n  }',
                startPosition: { row: 10, column: 2 },
                endPosition: { row: 13, column: 3 },
                children: [{ type: 'property_identifier', text: 'subtract' }],
              },
            ],
          },
        ],
      };

      const chunks = chunker.chunkClass(mockClassNode, 'javascript', 'Calculator.js', content);
      assert.ok(Array.isArray(chunks));
      assert.ok(chunks.length > 0);
      // Should have class header + methods
      assert.ok(chunks.some(c => c.name === 'Calculator'));
      assert.ok(chunks.some(c => c.name === 'add' || c.content.includes('add')));
    });
  });

  suite.skip('Large Chunk Splitting (38.8)', () => {
    test('splits large chunk into overlapping parts', () => {
      const chunker = new SemanticChunker({ maxTokens: 100, targetTokens: 50, overlapTokens: 10 });
      const largeContent = 'x'.repeat(600); // ~150 tokens
      const largeChunk = {
        id: 'chunk_test123',
        content: largeContent,
        type: CHUNK_TYPES.FUNCTION,
        language: 'javascript',
        filePath: 'large.js',
        lineStart: 1,
        lineEnd: 10,
        tokenCount: 150,
        name: 'largeFunc',
        signature: 'function largeFunc()',
        parentChunk: null,
      };

      const chunks = chunker.splitLargeChunk(largeChunk);
      assert.ok(Array.isArray(chunks));
      assert.ok(chunks.length > 1); // Should split into multiple parts
      chunks.forEach((chunk, _idx) => {
        assert.ok(chunk.id.includes('part'));
        assert.strictEqual(chunk.type, CHUNK_TYPES.FUNCTION);
        assert.strictEqual(chunk.language, 'javascript');
        assert.strictEqual(chunk.filePath, 'large.js');
        assert.ok(chunk.tokenCount > 0);
      });
      // First part should have signature
      assert.strictEqual(chunks[0].signature, 'function largeFunc()');
      // Other parts should not
      if (chunks.length > 1) {
        assert.strictEqual(chunks[1].signature, null);
      }
    });

    test('returns single chunk if already within limits', () => {
      const chunker = new SemanticChunker({ maxTokens: 500 });
      const smallChunk = {
        id: 'chunk_test456',
        content: 'function small() { return 1; }',
        type: CHUNK_TYPES.FUNCTION,
        language: 'javascript',
        filePath: 'small.js',
        lineStart: 1,
        lineEnd: 1,
        tokenCount: 10,
        name: 'small',
        signature: 'function small()',
        parentChunk: null,
      };

      const chunks = chunker.splitLargeChunk(smallChunk);
      assert.ok(Array.isArray(chunks));
      // Should still return array, but content may be split
      assert.ok(chunks.length >= 1);
    });
  });
});
