'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  tokenize,
  splitSentences,
  computeVocabulary,
  findSignaturePhrases,
  analyzeSentenceStructure,
  analyzeTone,
  analyzeFormatting,
} = require('../../.claude/tools/cli/style-profiler.cjs');

describe('style-profiler', () => {
  describe('tokenize', () => {
    it('should lowercase and split text into words', () => {
      const tokens = tokenize('Hello World Foo Bar');
      assert.deepStrictEqual(tokens, ['hello', 'world', 'foo', 'bar']);
    });

    it('should strip punctuation', () => {
      const tokens = tokenize('Hello, world! How are you?');
      assert.ok(tokens.includes('hello'));
      assert.ok(tokens.includes('world'));
      assert.ok(!tokens.some(t => t.includes(',')));
    });

    it('should filter single-character tokens', () => {
      const tokens = tokenize('I a am good');
      assert.ok(!tokens.includes('i'));
      assert.ok(!tokens.includes('a'));
      assert.ok(tokens.includes('am'));
      assert.ok(tokens.includes('good'));
    });
  });

  describe('splitSentences', () => {
    it('should split on sentence-ending punctuation', () => {
      const sentences = splitSentences('Hello world. How are you? I am fine!');
      assert.strictEqual(sentences.length, 3);
    });

    it('should handle empty input', () => {
      const sentences = splitSentences('');
      assert.strictEqual(sentences.length, 0);
    });

    it('should handle single sentence', () => {
      const sentences = splitSentences('Just one sentence here.');
      assert.strictEqual(sentences.length, 1);
    });
  });

  describe('computeVocabulary', () => {
    it('should exclude stop words from top vocabulary', () => {
      const words = ['the', 'the', 'the', 'algorithm', 'algorithm', 'pattern', 'is', 'a'];
      const vocab = computeVocabulary(words);
      assert.ok(vocab.topWords.includes('algorithm'));
      assert.ok(vocab.topWords.includes('pattern'));
      assert.ok(!vocab.topWords.includes('the'));
      assert.ok(!vocab.topWords.includes('is'));
    });

    it('should compute type-token ratio', () => {
      const words = ['hello', 'hello', 'world', 'world', 'foo'];
      const vocab = computeVocabulary(words);
      // 3 unique / 5 total = 0.6
      assert.strictEqual(vocab.typeTokenRatio, 0.6);
    });

    it('should return top 50 max', () => {
      const words = [];
      for (let i = 0; i < 100; i++) {
        words.push(`word${i}`);
      }
      const vocab = computeVocabulary(words);
      assert.ok(vocab.topWords.length <= 50);
    });
  });

  describe('findSignaturePhrases', () => {
    it('should find bigrams appearing 3+ times', () => {
      const words = [
        'key',
        'insight',
        'foo',
        'bar',
        'key',
        'insight',
        'baz',
        'key',
        'insight',
        'qux',
      ];
      const phrases = findSignaturePhrases(words);
      assert.ok(phrases.includes('key insight'));
    });

    it('should return empty for no repeated bigrams', () => {
      const words = ['each', 'word', 'is', 'unique', 'here'];
      const phrases = findSignaturePhrases(words);
      assert.strictEqual(phrases.length, 0);
    });
  });

  describe('analyzeSentenceStructure', () => {
    it('should compute average sentence length', () => {
      const sentences = [
        'This is a short sentence.',
        'This is another short one.',
        'And here is yet another sentence with more words in it.',
      ];
      const result = analyzeSentenceStructure(sentences);
      assert.ok(result.avgLength > 0);
      assert.ok(typeof result.avgLength === 'number');
    });

    it('should detect question frequency', () => {
      const sentences = [
        'This is a statement.',
        'Is this a question?',
        'Another statement here.',
        'What about this one?',
      ];
      const result = analyzeSentenceStructure(sentences);
      assert.strictEqual(result.questionFrequency, 0.5);
    });

    it('should handle empty input', () => {
      const result = analyzeSentenceStructure([]);
      assert.strictEqual(result.avgLength, 0);
    });
  });

  describe('analyzeTone', () => {
    it('should detect casual tone from contractions', () => {
      const text = "I'm sure you can't believe it. Don't worry, it's fine. We're going to be okay.";
      const sentences = splitSentences(text);
      const tone = analyzeTone(text, sentences);
      // High contraction rate should push formality toward casual (higher number)
      assert.ok(tone.formality >= 3.0, `Expected formality >= 3.0, got ${tone.formality}`);
    });

    it('should detect hedged directness', () => {
      const text =
        'Maybe this could perhaps work. It seems somewhat possible. Possibly it might be okay.';
      const sentences = splitSentences(text);
      const tone = analyzeTone(text, sentences);
      // Lots of hedge words should push directness lower
      assert.ok(tone.directness < 4.0, `Expected directness < 4.0, got ${tone.directness}`);
    });

    it('should return values within 1.0 to 5.0 range', () => {
      const text = 'Hello world. This is a test.';
      const sentences = splitSentences(text);
      const tone = analyzeTone(text, sentences);
      for (const [key, value] of Object.entries(tone)) {
        assert.ok(value >= 1.0 && value <= 5.0, `${key} out of range: ${value}`);
      }
    });
  });

  describe('analyzeFormatting', () => {
    it('should detect heading depth', () => {
      const text =
        '# Heading 1\n\nSome text.\n\n## Heading 2\n\nMore text.\n\n### Heading 3\n\nEven more.';
      const fmt = analyzeFormatting(text);
      assert.strictEqual(fmt.headingDepth, 3);
    });

    it('should count list items', () => {
      const text =
        'Intro paragraph here with some words.\n\n- item one\n- item two\n- item three\n\nMore text after the list.';
      const fmt = analyzeFormatting(text);
      assert.ok(fmt.listFrequencyPer1000 > 0);
    });

    it('should handle text with no formatting', () => {
      const text = 'Just a plain paragraph with no special formatting at all.';
      const fmt = analyzeFormatting(text);
      assert.strictEqual(fmt.headingDepth, 0);
      assert.strictEqual(fmt.listFrequencyPer1000, 0);
    });
  });

  describe('CLI integration', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'style-profiler-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should exit 0 with --help', () => {
      const { execSync } = require('child_process');
      const result = execSync('node .claude/tools/cli/style-profiler.cjs --help', {
        encoding: 'utf-8',
        cwd: path.resolve(__dirname, '../..'),
      });
      assert.ok(result.includes('Usage:'));
    });

    it('should produce a valid JSON profile from a sample file', () => {
      const { execSync } = require('child_process');
      const samplePath = path.join(tmpDir, 'sample.txt');
      const outputPath = path.join(tmpDir, 'profile.json');

      fs.writeFileSync(
        samplePath,
        [
          'The quick brown fox jumped over the lazy dog. It was a fine afternoon.',
          'Software engineering requires careful attention to detail and systematic thinking.',
          'Every algorithm has trade-offs between time complexity and space complexity.',
          'Testing is not optional. You must test before shipping. Always test your code.',
          'Documentation matters because future readers need context to understand decisions.',
        ].join(' ')
      );

      execSync(`node .claude/tools/cli/style-profiler.cjs "${samplePath}" -o "${outputPath}"`, {
        encoding: 'utf-8',
        cwd: path.resolve(__dirname, '../..'),
      });

      assert.ok(fs.existsSync(outputPath), 'Profile file should exist');

      const profile = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      assert.strictEqual(profile.version, '1.0.0');
      assert.strictEqual(profile.sampleCount, 1);
      assert.ok(profile.totalWords > 0);
      assert.ok(Array.isArray(profile.vocabulary.topWords));
      assert.ok(profile.vocabulary.topWords.length > 0);
      assert.ok(typeof profile.sentenceStructure.avgLength === 'number');
      assert.ok(typeof profile.tone.formality === 'number');
      assert.ok(typeof profile.formatting.headingDepth === 'number');
    });
  });
});
