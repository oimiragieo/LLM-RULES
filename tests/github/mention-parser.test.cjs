'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { MentionParser } = require('../../.claude/lib/github/mention-parser.cjs');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MentionParser', () => {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('instantiates without arguments', () => {
      assert.doesNotThrow(() => new MentionParser());
    });
  });

  // -------------------------------------------------------------------------
  // parse — empty / no mentions
  // -------------------------------------------------------------------------
  describe('parse (empty / no mentions)', () => {
    it('returns empty array for empty string', () => {
      const parser = new MentionParser();
      assert.deepEqual(parser.parse(''), []);
    });

    it('returns empty array for null', () => {
      const parser = new MentionParser();
      assert.deepEqual(parser.parse(null), []);
    });

    it('returns empty array for undefined', () => {
      const parser = new MentionParser();
      assert.deepEqual(parser.parse(undefined), []);
    });

    it('returns empty array when no @agent-studio mention present', () => {
      const parser = new MentionParser();
      assert.deepEqual(parser.parse('Hello world, please review this PR'), []);
    });

    it('does not match other agent mentions', () => {
      const parser = new MentionParser();
      assert.deepEqual(parser.parse('@some-other-agent do something'), []);
    });
  });

  // -------------------------------------------------------------------------
  // parse — single mention
  // -------------------------------------------------------------------------
  describe('parse (single mention)', () => {
    it('returns array with one entry for a single @agent-studio mention', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio please review this PR');
      assert.equal(results.length, 1);
    });

    it('mention field is @agent-studio', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio please review this PR');
      assert.equal(results[0].mention, '@agent-studio');
    });

    it('extracts instruction text following the mention', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio please review this PR');
      assert.equal(results[0].instruction, 'please review this PR');
    });

    it('returns position 0 when mention is at start of text', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio please review');
      assert.equal(results[0].position, 0);
    });

    it('returns correct position when mention is in the middle of text', () => {
      const parser = new MentionParser();
      const body = 'Hello @agent-studio please review';
      const results = parser.parse(body);
      assert.equal(results[0].position, body.indexOf('@agent-studio'));
    });

    it('returns correct position when mention is preceded by newline', () => {
      const parser = new MentionParser();
      const body = 'Some text\n@agent-studio do something';
      const results = parser.parse(body);
      assert.equal(results[0].position, 10);
    });

    it('returns empty instruction when mention is at end of text', () => {
      const parser = new MentionParser();
      const results = parser.parse('Please review @agent-studio');
      assert.equal(results[0].instruction, '');
    });

    it('returns empty instruction when mention is the entire text', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio');
      assert.equal(results[0].instruction, '');
      assert.equal(results[0].position, 0);
    });

    it('trims leading and trailing whitespace from instruction', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio   lots of spaces   ');
      assert.equal(results[0].instruction, 'lots of spaces');
    });

    it('handles mention on its own line', () => {
      const parser = new MentionParser();
      const body = 'Some text\n@agent-studio\nplease review this';
      const results = parser.parse(body);
      assert.equal(results.length, 1);
      assert.equal(results[0].instruction, 'please review this');
    });

    it('position field is a number', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio hello');
      assert.equal(typeof results[0].position, 'number');
    });

    it('instruction field is a string', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio hello');
      assert.equal(typeof results[0].instruction, 'string');
    });
  });

  // -------------------------------------------------------------------------
  // parse — multiple mentions
  // -------------------------------------------------------------------------
  describe('parse (multiple mentions)', () => {
    it('returns two entries for two @agent-studio mentions', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio do X @agent-studio do Y');
      assert.equal(results.length, 2);
    });

    it('extracts correct instruction for each mention', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio do X @agent-studio do Y');
      assert.equal(results[0].instruction, 'do X');
      assert.equal(results[1].instruction, 'do Y');
    });

    it('returns correct positions for multiple mentions', () => {
      const parser = new MentionParser();
      const body = '@agent-studio do X @agent-studio do Y';
      const results = parser.parse(body);
      assert.equal(results[0].position, 0);
      // Second @agent-studio starts after "do X "
      const secondPos = body.indexOf('@agent-studio', 1);
      assert.equal(results[1].position, secondPos);
    });

    it('all mention fields are @agent-studio', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio hello @agent-studio world');
      for (const r of results) {
        assert.equal(r.mention, '@agent-studio');
      }
    });

    it('handles three mentions correctly', () => {
      const parser = new MentionParser();
      const results = parser.parse('@agent-studio A @agent-studio B @agent-studio C');
      assert.equal(results.length, 3);
      assert.equal(results[0].instruction, 'A');
      assert.equal(results[1].instruction, 'B');
      assert.equal(results[2].instruction, 'C');
    });

    it('handles mentions on separate lines', () => {
      const parser = new MentionParser();
      const body = '@agent-studio do task one\n@agent-studio do task two';
      const results = parser.parse(body);
      assert.equal(results.length, 2);
      assert.equal(results[0].instruction, 'do task one');
      assert.equal(results[1].instruction, 'do task two');
    });
  });

  // -------------------------------------------------------------------------
  // parse — code block handling
  // -------------------------------------------------------------------------
  describe('parse (code block handling)', () => {
    it('ignores @agent-studio mention inside fenced code block', () => {
      const parser = new MentionParser();
      const body = '```\n@agent-studio inside code\n```';
      const results = parser.parse(body);
      assert.equal(results.length, 0);
    });

    it('ignores @agent-studio inside code block with language specifier', () => {
      const parser = new MentionParser();
      const body = '```js\n@agent-studio in js code\n```';
      const results = parser.parse(body);
      assert.equal(results.length, 0);
    });

    it('parses mention before a code block, ignores mention inside it', () => {
      const parser = new MentionParser();
      const body = '@agent-studio real mention\n```\n@agent-studio ignored\n```';
      const results = parser.parse(body);
      assert.equal(results.length, 1);
      assert.equal(results[0].mention, '@agent-studio');
    });

    it('parses mention after a code block but ignores one inside it', () => {
      const parser = new MentionParser();
      const body = '```\n@agent-studio ignored\n```\n@agent-studio real';
      const results = parser.parse(body);
      assert.equal(results.length, 1);
      assert.equal(results[0].instruction, 'real');
    });

    it('instruction text can include code block content after the mention', () => {
      const parser = new MentionParser();
      const body = '@agent-studio review:\n```js\nconst x = 1;\n```\ndone';
      const results = parser.parse(body);
      assert.equal(results.length, 1);
      assert.ok(results[0].instruction.includes('review:'), 'instruction should contain review:');
    });

    it('handles two real mentions with a code block in between', () => {
      const parser = new MentionParser();
      const body = '@agent-studio do X\n```\n@agent-studio ignored\n```\n@agent-studio do Y';
      const results = parser.parse(body);
      assert.equal(results.length, 2);
      assert.ok(results[0].instruction.startsWith('do X'), 'first instruction starts with do X');
      assert.equal(results[1].instruction, 'do Y');
    });

    it('does not emit events for code-block-only content', () => {
      const parser = new MentionParser();
      const body = 'No mentions here\n```\n@agent-studio in code only\n```\nEnd.';
      const results = parser.parse(body);
      assert.equal(results.length, 0);
    });
  });
});
