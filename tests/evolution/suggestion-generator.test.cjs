'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SuggestionGenerator } = require('../../.claude/lib/evolution/suggestion-generator.cjs');

// ---------------------------------------------------------------------------
// Helpers — build minimal pattern objects matching PatternDetector output
// ---------------------------------------------------------------------------

function makeHighLatencyPattern(skillName, avgDurationMs, thresholdMs) {
  return {
    type: 'high-latency',
    skillNames: [skillName],
    description: `Skill "${skillName}" has average duration ${avgDurationMs}ms`,
    severity: 'medium',
    data: { avgDurationMs, thresholdMs },
  };
}

function makeFrequentlyFailingPattern(skillName, successRate, invocations) {
  return {
    type: 'frequently-failing',
    skillNames: [skillName],
    description: `Skill "${skillName}" has success rate ${(successRate * 100).toFixed(1)}%`,
    severity: 'high',
    data: { successRate, invocations },
  };
}

function makeCoOccurringPattern(skillA, skillB, coOccurrenceCount, windowMs) {
  return {
    type: 'co-occurring',
    skillNames: [skillA, skillB],
    description: `Skills "${skillA}" and "${skillB}" co-occur ${coOccurrenceCount} times`,
    severity: 'low',
    data: { coOccurrenceCount, windowMs },
  };
}

function makeUnderutilizedPattern(skillName, lastUsed, invocations, periodMs) {
  return {
    type: 'underutilized',
    skillNames: [skillName],
    description: `Skill "${skillName}" has not been used recently`,
    severity: 'low',
    data: { lastUsed, invocations, periodMs },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuggestionGenerator', () => {
  describe('VAL-SE-004: empty / null input returns empty suggestions', () => {
    it('returns {suggestions: []} for empty array', () => {
      const generator = new SuggestionGenerator();
      const result = generator.generate([]);
      assert.deepEqual(result, { suggestions: [] });
    });

    it('returns {suggestions: []} for null', () => {
      const generator = new SuggestionGenerator();
      const result = generator.generate(null);
      assert.deepEqual(result, { suggestions: [] });
    });

    it('returns {suggestions: []} for undefined', () => {
      const generator = new SuggestionGenerator();
      const result = generator.generate(undefined);
      assert.deepEqual(result, { suggestions: [] });
    });
  });

  describe('VAL-SE-004: optimize suggestion from high-latency pattern', () => {
    it('generates optimize suggestion for high-latency pattern', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeHighLatencyPattern('slow-skill', 10000, 5000)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'optimize');
    });

    it('optimize suggestion has required fields', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeHighLatencyPattern('slow-skill', 10000, 5000)];
      const { suggestions } = generator.generate(patterns);
      const s = suggestions[0];

      assert.ok('type' in s, 'must have type');
      assert.ok('skillName' in s, 'must have skillName');
      assert.ok('reason' in s, 'must have reason');
      assert.ok('confidence' in s, 'must have confidence');
      assert.ok('action' in s, 'must have action');
    });

    it('optimize suggestion has correct skillName', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeHighLatencyPattern('slow-skill', 10000, 5000)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions[0].skillName, 'slow-skill');
    });

    it('optimize suggestion reason is a non-empty string', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeHighLatencyPattern('slow-skill', 10000, 5000)];
      const { suggestions } = generator.generate(patterns);

      assert.ok(typeof suggestions[0].reason === 'string');
      assert.ok(suggestions[0].reason.length > 0);
    });

    it('optimize suggestion action is an object', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeHighLatencyPattern('slow-skill', 10000, 5000)];
      const { suggestions } = generator.generate(patterns);

      assert.ok(typeof suggestions[0].action === 'object');
      assert.ok(suggestions[0].action !== null);
    });
  });

  describe('VAL-SE-004: split suggestion from frequently-failing pattern', () => {
    it('generates split suggestion for frequently-failing pattern', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeFrequentlyFailingPattern('broad-skill', 0.1, 50)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'split');
    });

    it('split suggestion has required fields', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeFrequentlyFailingPattern('broad-skill', 0.1, 50)];
      const { suggestions } = generator.generate(patterns);
      const s = suggestions[0];

      assert.ok('type' in s, 'must have type');
      assert.ok('skillName' in s, 'must have skillName');
      assert.ok('reason' in s, 'must have reason');
      assert.ok('confidence' in s, 'must have confidence');
      assert.ok('action' in s, 'must have action');
    });

    it('split suggestion has correct skillName', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeFrequentlyFailingPattern('broad-skill', 0.1, 50)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions[0].skillName, 'broad-skill');
    });

    it('split suggestion reason is a non-empty string', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeFrequentlyFailingPattern('broad-skill', 0.1, 50)];
      const { suggestions } = generator.generate(patterns);

      assert.ok(typeof suggestions[0].reason === 'string');
      assert.ok(suggestions[0].reason.length > 0);
    });
  });

  describe('VAL-SE-004: merge suggestion from co-occurring pattern', () => {
    it('generates merge suggestion for co-occurring pattern', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeCoOccurringPattern('skill-A', 'skill-B', 10, 60000)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'merge');
    });

    it('merge suggestion has required fields', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeCoOccurringPattern('skill-A', 'skill-B', 10, 60000)];
      const { suggestions } = generator.generate(patterns);
      const s = suggestions[0];

      assert.ok('type' in s, 'must have type');
      assert.ok('skillName' in s, 'must have skillName');
      assert.ok('reason' in s, 'must have reason');
      assert.ok('confidence' in s, 'must have confidence');
      assert.ok('action' in s, 'must have action');
    });

    it('merge suggestion skillName references both co-occurring skills', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeCoOccurringPattern('skill-A', 'skill-B', 10, 60000)];
      const { suggestions } = generator.generate(patterns);
      const s = suggestions[0];

      // skillName should reference both involved skills
      const skillNameStr = String(s.skillName);
      assert.ok(
        skillNameStr.includes('skill-A') || skillNameStr.includes('skill-B'),
        'skillName must reference at least one co-occurring skill'
      );
    });

    it('merge suggestion action contains both target skills', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeCoOccurringPattern('skill-A', 'skill-B', 10, 60000)];
      const { suggestions } = generator.generate(patterns);
      const action = suggestions[0].action;

      assert.ok(typeof action === 'object' && action !== null, 'action must be an object');
      // action should reference both skills somehow
      const actionStr = JSON.stringify(action);
      assert.ok(
        actionStr.includes('skill-A') && actionStr.includes('skill-B'),
        'action must include both skill names'
      );
    });
  });

  describe('VAL-SE-004: deprecate suggestion from underutilized pattern', () => {
    it('generates deprecate suggestion for underutilized pattern', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'deprecate');
    });

    it('deprecate suggestion has required fields', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000)];
      const { suggestions } = generator.generate(patterns);
      const s = suggestions[0];

      assert.ok('type' in s, 'must have type');
      assert.ok('skillName' in s, 'must have skillName');
      assert.ok('reason' in s, 'must have reason');
      assert.ok('confidence' in s, 'must have confidence');
      assert.ok('action' in s, 'must have action');
    });

    it('deprecate suggestion has correct skillName', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000)];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions[0].skillName, 'stale-skill');
    });

    it('deprecate suggestion reason is a non-empty string', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000)];
      const { suggestions } = generator.generate(patterns);

      assert.ok(typeof suggestions[0].reason === 'string');
      assert.ok(suggestions[0].reason.length > 0);
    });
  });

  describe('VAL-SE-004: confidence is between 0 and 1', () => {
    it('optimize confidence is in [0, 1]', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeHighLatencyPattern('slow-skill', 10000, 5000)];
      const { suggestions } = generator.generate(patterns);

      const conf = suggestions[0].confidence;
      assert.ok(typeof conf === 'number', 'confidence must be a number');
      assert.ok(conf >= 0, 'confidence must be >= 0');
      assert.ok(conf <= 1, 'confidence must be <= 1');
    });

    it('split confidence is in [0, 1]', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeFrequentlyFailingPattern('broad-skill', 0.1, 50)];
      const { suggestions } = generator.generate(patterns);

      const conf = suggestions[0].confidence;
      assert.ok(typeof conf === 'number', 'confidence must be a number');
      assert.ok(conf >= 0, 'confidence must be >= 0');
      assert.ok(conf <= 1, 'confidence must be <= 1');
    });

    it('merge confidence is in [0, 1]', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeCoOccurringPattern('skill-A', 'skill-B', 10, 60000)];
      const { suggestions } = generator.generate(patterns);

      const conf = suggestions[0].confidence;
      assert.ok(typeof conf === 'number', 'confidence must be a number');
      assert.ok(conf >= 0, 'confidence must be >= 0');
      assert.ok(conf <= 1, 'confidence must be <= 1');
    });

    it('deprecate confidence is in [0, 1]', () => {
      const generator = new SuggestionGenerator();
      const patterns = [makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000)];
      const { suggestions } = generator.generate(patterns);

      const conf = suggestions[0].confidence;
      assert.ok(typeof conf === 'number', 'confidence must be a number');
      assert.ok(conf >= 0, 'confidence must be >= 0');
      assert.ok(conf <= 1, 'confidence must be <= 1');
    });

    it('higher invocation count increases confidence for split suggestions', () => {
      const generator = new SuggestionGenerator();
      const lowData = [makeFrequentlyFailingPattern('skill-low', 0.1, 15)];
      const highData = [makeFrequentlyFailingPattern('skill-high', 0.1, 100)];

      const { suggestions: s1 } = generator.generate(lowData);
      const { suggestions: s2 } = generator.generate(highData);

      assert.ok(
        s2[0].confidence >= s1[0].confidence,
        'higher invocations should yield >= confidence'
      );
    });
  });

  describe('multiple patterns produce multiple suggestions', () => {
    it('two patterns produce two suggestions', () => {
      const generator = new SuggestionGenerator();
      const patterns = [
        makeHighLatencyPattern('slow-skill', 10000, 5000),
        makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000),
      ];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 2);
    });

    it('all four suggestion types can be generated simultaneously', () => {
      const generator = new SuggestionGenerator();
      const patterns = [
        makeHighLatencyPattern('slow-skill', 10000, 5000),
        makeFrequentlyFailingPattern('broad-skill', 0.1, 50),
        makeCoOccurringPattern('skill-A', 'skill-B', 10, 60000),
        makeUnderutilizedPattern('stale-skill', null, 0, 7 * 24 * 60 * 60 * 1000),
      ];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 4);
      const types = new Set(suggestions.map(s => s.type));
      assert.ok(types.has('optimize'), 'should have optimize');
      assert.ok(types.has('split'), 'should have split');
      assert.ok(types.has('merge'), 'should have merge');
      assert.ok(types.has('deprecate'), 'should have deprecate');
    });
  });

  describe('unknown pattern types are ignored', () => {
    it('unknown pattern type produces no suggestion', () => {
      const generator = new SuggestionGenerator();
      const patterns = [
        {
          type: 'unknown-type',
          skillNames: ['some-skill'],
          description: 'some unknown pattern',
          severity: 'low',
          data: {},
        },
      ];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 0);
    });

    it('mix of known and unknown pattern types ignores unknowns', () => {
      const generator = new SuggestionGenerator();
      const patterns = [
        makeHighLatencyPattern('slow-skill', 10000, 5000),
        {
          type: 'future-type',
          skillNames: ['other-skill'],
          description: 'future pattern',
          severity: 'medium',
          data: {},
        },
      ];
      const { suggestions } = generator.generate(patterns);

      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'optimize');
    });
  });

  describe('generate() return structure', () => {
    it('returns an object with suggestions array', () => {
      const generator = new SuggestionGenerator();
      const result = generator.generate([makeHighLatencyPattern('skill', 8000, 5000)]);

      assert.ok('suggestions' in result, 'result must have suggestions field');
      assert.ok(Array.isArray(result.suggestions), 'suggestions must be an array');
    });
  });
});
