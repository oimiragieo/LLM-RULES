#!/usr/bin/env node
/**
 * Cache-Break Detector Tests
 * ==========================
 *
 * Verifies:
 * 1. Changed tools triggers cache-break event with changedSections=['toolsSection'] (VAL-PC-006)
 * 2. Identical consecutive calls produce zero cache-break events (VAL-PC-007)
 * 3. Multiple sections changing are all listed in changedSections
 * 4. First call establishes baseline without emitting any event
 *
 * @module cache-break-detector.test
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const DETECTOR_MODULE_PATH = require.resolve(
  path.join(__dirname, '../../../.claude/lib/spawn/cache-break-detector.cjs')
);

// ======================================================================
// Helpers
// ======================================================================

/**
 * Run a callback with a completely fresh instance of cache-break-detector.cjs.
 * Each invocation gets its own module instance with _previousHashes = null.
 *
 * @template T
 * @param {(detector: object) => T} fn
 * @returns {T}
 */
function withFreshDetector(fn) {
  delete require.cache[DETECTOR_MODULE_PATH];
  try {
    const detector = require(DETECTOR_MODULE_PATH);
    return fn(detector);
  } finally {
    delete require.cache[DETECTOR_MODULE_PATH];
  }
}

/**
 * Build a canonical set of sections for testing.
 * Each section is a simple string value; callers can override individual keys.
 *
 * @param {Partial<Object>} [overrides]
 * @returns {Object}
 */
function makeSections(overrides) {
  return {
    toolsSection: '## AVAILABLE_TOOLS\n- Read\n- Write\n',
    skillsSection: '## AVAILABLE_SKILLS\n- tdd\n',
    discoverySection: '## SKILL DISCOVERY PROTOCOL\n...',
    memorySection: '## MEMORY\nNo entries.',
    behaviourSection: '## BEHAVIOUR\nDefault rules.',
    basePrompt: 'You are a developer agent.',
    ...overrides,
  };
}

/**
 * Create a mock record function that collects recorded events.
 * @returns {{ fn: Function, events: Array }}
 */
function makeMockRecord() {
  const events = [];
  return {
    fn: event => events.push(event),
    events,
  };
}

// ======================================================================
// 1. First call establishes baseline — no event emitted (VAL-PC-006)
// ======================================================================

describe('First call establishes baseline without emitting an event', () => {
  it('no cache-break event on first call', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const sections = makeSections();

      detector.detectCacheBreak(sections, mock.fn);

      assert.strictEqual(
        mock.events.length,
        0,
        'First call must not emit any event — it only establishes the hash baseline'
      );
    });
  });

  it('returns without error on first call (fail-open)', () => {
    withFreshDetector(detector => {
      // Passing empty sections should not throw.
      assert.doesNotThrow(() => detector.detectCacheBreak({}, () => {}));
    });
  });
});

// ======================================================================
// 2. Identical consecutive calls produce zero events (VAL-PC-007)
// ======================================================================

describe('Identical consecutive calls produce zero cache-break events (VAL-PC-007)', () => {
  it('two identical calls emit no event', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const sections = makeSections();

      // First call — baseline
      detector.detectCacheBreak(sections, mock.fn);
      assert.strictEqual(mock.events.length, 0, 'No event on first (baseline) call');

      // Second call — identical content
      detector.detectCacheBreak(sections, mock.fn);
      assert.strictEqual(mock.events.length, 0, 'No event when sections are unchanged');
    });
  });

  it('ten identical calls emit zero events', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const sections = makeSections();

      for (let i = 0; i < 10; i++) {
        detector.detectCacheBreak(sections, mock.fn);
      }

      assert.strictEqual(mock.events.length, 0, 'Zero events across 10 identical calls');
    });
  });

  it('structurally equal but different object references produce no event', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();

      // First call
      detector.detectCacheBreak(makeSections(), mock.fn);
      // Second call — new object, same content
      detector.detectCacheBreak(makeSections(), mock.fn);

      assert.strictEqual(
        mock.events.length,
        0,
        'Different object references with identical content must not trigger event'
      );
    });
  });
});

// ======================================================================
// 3. Changed tools triggers event with changedSections=['toolsSection'] (VAL-PC-006)
// ======================================================================

describe('Changed tools section triggers cache-break event (VAL-PC-006)', () => {
  it('changing toolsSection emits event with changedSections=[toolsSection]', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();

      // First call — baseline
      detector.detectCacheBreak(makeSections({ toolsSection: '## TOOLS v1\n' }), mock.fn);
      assert.strictEqual(mock.events.length, 0, 'No event on baseline call');

      // Second call — toolsSection changed
      detector.detectCacheBreak(makeSections({ toolsSection: '## TOOLS v2 — updated\n' }), mock.fn);

      assert.strictEqual(mock.events.length, 1, 'Exactly one cache-break event emitted');
      const ev = mock.events[0];
      assert.strictEqual(ev.event, 'cache-break', 'Event type must be cache-break');
      assert.deepStrictEqual(
        ev.changedSections,
        ['toolsSection'],
        'changedSections must contain only toolsSection'
      );
    });
  });

  it('event includes a timestamp string', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      detector.detectCacheBreak(makeSections({ toolsSection: 'v1' }), mock.fn);
      detector.detectCacheBreak(makeSections({ toolsSection: 'v2' }), mock.fn);

      assert.strictEqual(mock.events.length, 1);
      const ev = mock.events[0];
      assert.ok(typeof ev.timestamp === 'string', 'timestamp must be a string');
      assert.ok(ev.timestamp.length > 0, 'timestamp must be non-empty');
    });
  });

  it('event includes component=prompt-assembler', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      detector.detectCacheBreak(makeSections({ toolsSection: 'v1' }), mock.fn);
      detector.detectCacheBreak(makeSections({ toolsSection: 'v2' }), mock.fn);

      assert.strictEqual(mock.events.length, 1);
      assert.strictEqual(mock.events[0].component, 'prompt-assembler');
    });
  });

  it('only changed section is listed — other sections remain stable', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const base = makeSections();

      // Baseline
      detector.detectCacheBreak(base, mock.fn);
      // Only toolsSection differs
      detector.detectCacheBreak({ ...base, toolsSection: 'changed-tools' }, mock.fn);

      assert.strictEqual(mock.events.length, 1);
      const { changedSections } = mock.events[0];
      assert.ok(
        changedSections.includes('toolsSection'),
        'toolsSection must be in changedSections'
      );
      assert.strictEqual(changedSections.length, 1, 'Only toolsSection should be listed');
    });
  });
});

// ======================================================================
// 4. Multiple sections changing — all listed in changedSections
// ======================================================================

describe('Multiple sections changing — all listed in changedSections', () => {
  it('two changed sections are both listed', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const base = makeSections();

      // Baseline
      detector.detectCacheBreak(base, mock.fn);

      // Both toolsSection and skillsSection change
      detector.detectCacheBreak(
        {
          ...base,
          toolsSection: 'tools-changed',
          skillsSection: 'skills-changed',
        },
        mock.fn
      );

      assert.strictEqual(mock.events.length, 1, 'One event for two changed sections');
      const { changedSections } = mock.events[0];
      assert.ok(
        changedSections.includes('toolsSection'),
        'toolsSection must be in changedSections'
      );
      assert.ok(
        changedSections.includes('skillsSection'),
        'skillsSection must be in changedSections'
      );
      assert.strictEqual(changedSections.length, 2, 'Exactly 2 changed sections');
    });
  });

  it('all six sections changing are all listed', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();

      // Baseline
      detector.detectCacheBreak(makeSections(), mock.fn);

      // All sections differ
      detector.detectCacheBreak(
        {
          toolsSection: 'tools-new',
          skillsSection: 'skills-new',
          discoverySection: 'discovery-new',
          memorySection: 'memory-new',
          behaviourSection: 'behaviour-new',
          basePrompt: 'base-new',
        },
        mock.fn
      );

      assert.strictEqual(mock.events.length, 1);
      const { changedSections } = mock.events[0];
      const EXPECTED = [
        'toolsSection',
        'skillsSection',
        'discoverySection',
        'memorySection',
        'behaviourSection',
        'basePrompt',
      ];
      for (const section of EXPECTED) {
        assert.ok(changedSections.includes(section), `${section} must appear in changedSections`);
      }
      assert.strictEqual(changedSections.length, EXPECTED.length, 'All 6 sections must be listed');
    });
  });

  it('only changed sections listed — unchanged sections omitted', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const base = makeSections();

      // Baseline
      detector.detectCacheBreak(base, mock.fn);

      // Only memorySection and behaviourSection change
      detector.detectCacheBreak(
        { ...base, memorySection: 'memory-updated', behaviourSection: 'behaviour-updated' },
        mock.fn
      );

      assert.strictEqual(mock.events.length, 1);
      const { changedSections } = mock.events[0];
      assert.ok(changedSections.includes('memorySection'), 'memorySection must be listed');
      assert.ok(changedSections.includes('behaviourSection'), 'behaviourSection must be listed');
      assert.ok(!changedSections.includes('toolsSection'), 'toolsSection must NOT be listed');
      assert.ok(!changedSections.includes('basePrompt'), 'basePrompt must NOT be listed');
      assert.strictEqual(changedSections.length, 2, 'Only 2 sections changed');
    });
  });
});

// ======================================================================
// 5. Subsequent change detection after stable call
// ======================================================================

describe('Subsequent change detection after stable periods', () => {
  it('detects change after a run of identical calls', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const base = makeSections();

      // Baseline + 3 identical calls
      for (let i = 0; i < 4; i++) {
        detector.detectCacheBreak(base, mock.fn);
      }
      assert.strictEqual(mock.events.length, 0, 'No events during stable phase');

      // Now change one section
      detector.detectCacheBreak({ ...base, basePrompt: 'updated-prompt' }, mock.fn);
      assert.strictEqual(mock.events.length, 1, 'Event after change');
      assert.deepStrictEqual(mock.events[0].changedSections, ['basePrompt']);
    });
  });

  it('hashes advance each call so comparisons are against most recent state', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const v1 = makeSections({ toolsSection: 'tools-v1' });
      const v2 = makeSections({ toolsSection: 'tools-v2' });

      // Baseline with v1
      detector.detectCacheBreak(v1, mock.fn);
      // Change to v2 → event
      detector.detectCacheBreak(v2, mock.fn);
      assert.strictEqual(mock.events.length, 1, 'Event on v1→v2 change');

      // Call again with v2 — should be stable now (previous = v2)
      detector.detectCacheBreak(v2, mock.fn);
      assert.strictEqual(mock.events.length, 1, 'No new event on stable v2 call');

      // Revert to v1 — new event
      detector.detectCacheBreak(v1, mock.fn);
      assert.strictEqual(mock.events.length, 2, 'New event on v2→v1 revert');
    });
  });
});

// ======================================================================
// 6. _resetHashes() clears state
// ======================================================================

describe('_resetHashes() resets module-level state', () => {
  it('_resetHashes() causes next call to re-establish baseline (no event)', () => {
    withFreshDetector(detector => {
      const mock = makeMockRecord();
      const base = makeSections();
      const changed = makeSections({ toolsSection: 'tools-changed' });

      // Baseline
      detector.detectCacheBreak(base, mock.fn);
      // Change → event
      detector.detectCacheBreak(changed, mock.fn);
      assert.strictEqual(mock.events.length, 1, 'Event before reset');

      // Reset
      detector._resetHashes();

      // Next call must re-establish baseline without event
      detector.detectCacheBreak(changed, mock.fn);
      assert.strictEqual(
        mock.events.length,
        1,
        'No new event after _resetHashes() — next call is baseline'
      );
    });
  });
});

// ======================================================================
// Cleanup: evict cached modules.
// ======================================================================
after(() => {
  delete require.cache[DETECTOR_MODULE_PATH];
});
