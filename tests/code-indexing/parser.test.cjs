/**
 * CodeParser Tests
 *
 * @module tests/code-indexing/parser
 */

'use strict';

const { test, suite } = require('node:test');
const assert = require('node:assert/strict');
const {
  CodeParser,
  LANGUAGE_GRAMMARS,
  EXTENSION_MAP,
} = require('../../.claude/lib/code-indexing/code-parser.cjs');

suite('CodeParser', () => {
  suite('37.1: Class skeleton', () => {
    test('should instantiate without errors', () => {
      const parser = new CodeParser();
      assert.ok(parser instanceof CodeParser);
    });

    test('should accept options object', () => {
      const options = { test: true };
      const parser = new CodeParser(options);
      assert.deepStrictEqual(parser.options, options);
    });

    test('should export constants', () => {
      assert.ok(LANGUAGE_GRAMMARS);
      assert.ok(EXTENSION_MAP);
      assert.strictEqual(typeof LANGUAGE_GRAMMARS, 'object');
      assert.strictEqual(typeof EXTENSION_MAP, 'object');
    });
  });

  suite('37.2: Language detection', () => {
    test('should detect JavaScript from .js extension', () => {
      const parser = new CodeParser();
      assert.strictEqual(parser.detectLanguage('test.js'), 'javascript');
    });

    test('should detect TypeScript from .ts extension', () => {
      const parser = new CodeParser();
      assert.strictEqual(parser.detectLanguage('test.ts'), 'typescript');
    });

    test('should detect Python from .py extension', () => {
      const parser = new CodeParser();
      assert.strictEqual(parser.detectLanguage('test.py'), 'python');
    });

    test('should return null for unsupported extensions', () => {
      const parser = new CodeParser();
      assert.strictEqual(parser.detectLanguage('test.xyz'), null);
    });

    test('should report JavaScript as supported', () => {
      const parser = new CodeParser();
      assert.strictEqual(parser.isSupported('javascript'), true);
    });

    test('should return supported languages list', () => {
      const parser = new CodeParser();
      const languages = parser.getSupportedLanguages();
      assert.ok(Array.isArray(languages));
      assert.ok(languages.includes('javascript'));
      assert.ok(languages.includes('python'));
    });

    test('should return supported extensions list', () => {
      const parser = new CodeParser();
      const extensions = parser.getSupportedExtensions();
      assert.ok(Array.isArray(extensions));
      assert.ok(extensions.includes('.js'));
      assert.ok(extensions.includes('.py'));
    });
  });
});
