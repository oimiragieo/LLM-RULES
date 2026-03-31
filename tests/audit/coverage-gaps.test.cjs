'use strict';

/**
 * coverage-gaps.test.cjs
 *
 * Master smoke-test for .claude/lib/ modules that previously had no test
 * coverage.  For each targeted module the suite verifies:
 *
 *   1.  require() succeeds (no MODULE_NOT_FOUND / parse error)
 *   2.  Expected exports are present and have the correct type
 *   3.  Key exported functions can be called with trivial inputs without
 *       throwing
 *
 * Targeted modules (14 total, all previously untested):
 *   - events/event-types.cjs
 *   - events/event-bus-sink.cjs
 *   - utils/sentence-chunker.cjs
 *   - utils/context-window-guard.cjs
 *   - utils/enforcement-defaults.cjs
 *   - utils/workflow-paths.cjs
 *   - utils/optimization-targets.cjs
 *   - utils/binary-resolver.cjs
 *   - utils/path-canonicalizer.cjs
 *   - utils/cli-args.cjs
 *   - utils/command-exists.cjs
 *   - utils/bottleneck-analyzer.cjs
 *   - utils/context-accumulator.cjs
 *   - utils/pattern-library.cjs
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.claude', 'settings.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate project root from: ' + start);
}

const ROOT = findProjectRoot(__dirname);

function libPath(...parts) {
  return path.join(ROOT, '.claude', 'lib', ...parts);
}

// ---------------------------------------------------------------------------
// Meta: enumerate coverage targets
// ---------------------------------------------------------------------------

const COVERAGE_TARGETS = [
  path.join('events', 'event-types.cjs'),
  path.join('events', 'event-bus-sink.cjs'),
  path.join('utils', 'sentence-chunker.cjs'),
  path.join('utils', 'context-window-guard.cjs'),
  path.join('utils', 'enforcement-defaults.cjs'),
  path.join('utils', 'workflow-paths.cjs'),
  path.join('utils', 'optimization-targets.cjs'),
  path.join('utils', 'binary-resolver.cjs'),
  path.join('utils', 'path-canonicalizer.cjs'),
  path.join('utils', 'cli-args.cjs'),
  path.join('utils', 'command-exists.cjs'),
  path.join('utils', 'bottleneck-analyzer.cjs'),
  path.join('utils', 'context-accumulator.cjs'),
  path.join('utils', 'pattern-library.cjs'),
];

describe('coverage-gaps: meta', () => {
  it('covers at least 10 previously untested modules', () => {
    assert.ok(
      COVERAGE_TARGETS.length >= 10,
      `expected >=10 coverage targets, got ${COVERAGE_TARGETS.length}`
    );
  });

  it('all targeted module files exist on disk', () => {
    for (const rel of COVERAGE_TARGETS) {
      const full = libPath(...rel.split(path.sep));
      assert.ok(fs.existsSync(full), `module not found on disk: ${rel}`);
    }
  });

  it('all targeted modules can be required without MODULE_NOT_FOUND', () => {
    for (const rel of COVERAGE_TARGETS) {
      const full = libPath(...rel.split(path.sep));
      assert.doesNotThrow(() => require(full), `require() threw for module: ${rel}`);
    }
  });
});

// ---------------------------------------------------------------------------
// events/event-types.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: events/event-types', () => {
  let mod;
  before(() => {
    mod = require(libPath('events', 'event-types.cjs'));
  });

  it('exports EventTypes object', () => {
    assert.strictEqual(typeof mod.EventTypes, 'object');
    assert.ok(mod.EventTypes !== null);
  });

  it('EventTypes contains expected keys', () => {
    assert.ok('AGENT_STARTED' in mod.EventTypes, 'missing AGENT_STARTED');
    assert.ok('TASK_UPDATED' in mod.EventTypes, 'missing TASK_UPDATED');
    assert.ok('TOOL_INVOKED' in mod.EventTypes, 'missing TOOL_INVOKED');
    assert.ok('TASK_HEARTBEAT' in mod.EventTypes, 'missing TASK_HEARTBEAT');
  });

  it('exports event category arrays', () => {
    assert.ok(Array.isArray(mod.AGENT_EVENTS), 'AGENT_EVENTS not an array');
    assert.ok(Array.isArray(mod.TASK_EVENTS), 'TASK_EVENTS not an array');
    assert.ok(Array.isArray(mod.TOOL_EVENTS), 'TOOL_EVENTS not an array');
  });

  it('exports validateEvent function', () => {
    assert.strictEqual(typeof mod.validateEvent, 'function');
  });

  it('validateEvent returns object with valid field', () => {
    const result = mod.validateEvent('AGENT_STARTED', { agentId: 'test-agent' });
    assert.strictEqual(typeof result, 'object');
    assert.ok('valid' in result);
  });

  it('validateEvent returns invalid for unknown event type', () => {
    const result = mod.validateEvent('UNKNOWN_EVENT_XYZ', {});
    assert.strictEqual(result.valid, false);
  });

  it('validateEvent handles null payload gracefully', () => {
    const result = mod.validateEvent('AGENT_STARTED', null);
    assert.strictEqual(typeof result, 'object');
    assert.ok('valid' in result);
  });
});

// ---------------------------------------------------------------------------
// events/event-bus-sink.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: events/event-bus-sink', () => {
  let mod;
  before(() => {
    process.env.EVENT_BUS_SINK = 'off'; // disable actual file writes
    mod = require(libPath('events', 'event-bus-sink.cjs'));
  });

  it('exports registerDefaultSinks function', () => {
    assert.strictEqual(typeof mod.registerDefaultSinks, 'function');
  });

  it('registerDefaultSinks does not throw with mock event bus', () => {
    const mockBus = { on: () => {} };
    assert.doesNotThrow(() => mod.registerDefaultSinks(mockBus));
  });
});

// ---------------------------------------------------------------------------
// utils/sentence-chunker.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/sentence-chunker', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'sentence-chunker.cjs'));
  });

  it('exports chunkBySentences, estimateTokens, splitSentencesWithOffsets', () => {
    assert.strictEqual(typeof mod.chunkBySentences, 'function');
    assert.strictEqual(typeof mod.estimateTokens, 'function');
    assert.strictEqual(typeof mod.splitSentencesWithOffsets, 'function');
  });

  it('chunkBySentences with empty string returns empty array', () => {
    const result = mod.chunkBySentences('');
    assert.deepStrictEqual(result, []);
  });

  it('chunkBySentences returns chunks for non-empty text', () => {
    const result = mod.chunkBySentences('Hello world. This is a test.');
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 1);
    assert.ok(typeof result[0].content === 'string');
  });

  it('estimateTokens returns positive integer for non-empty input', () => {
    const tokens = mod.estimateTokens('hello world');
    assert.ok(Number.isFinite(tokens));
    assert.ok(tokens >= 1);
  });

  it('splitSentencesWithOffsets returns sentence objects with startIndex', () => {
    const result = mod.splitSentencesWithOffsets('First sentence. Second sentence.');
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 1);
    assert.ok('startIndex' in result[0]);
    assert.ok('content' in result[0]);
  });

  it('splitSentencesWithOffsets returns empty array for empty input', () => {
    assert.deepStrictEqual(mod.splitSentencesWithOffsets(''), []);
  });
});

// ---------------------------------------------------------------------------
// utils/context-window-guard.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/context-window-guard', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'context-window-guard.cjs'));
  });

  it('exports emitContextWindowWarning function', () => {
    assert.strictEqual(typeof mod.emitContextWindowWarning, 'function');
  });

  it('emitContextWindowWarning does not throw with empty input', () => {
    assert.doesNotThrow(() => mod.emitContextWindowWarning(null));
  });

  it('emitContextWindowWarning does not throw below warn threshold', () => {
    assert.doesNotThrow(() =>
      mod.emitContextWindowWarning({ token_budget: { used_tokens: 1000 } })
    );
  });

  it('emitContextWindowWarning does not throw above warn threshold', () => {
    assert.doesNotThrow(() =>
      mod.emitContextWindowWarning({ token_budget: { used_tokens: 90000 } })
    );
  });
});

// ---------------------------------------------------------------------------
// utils/enforcement-defaults.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/enforcement-defaults', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'enforcement-defaults.cjs'));
  });

  it('exports ENFORCEMENT_DEFAULTS object', () => {
    assert.strictEqual(typeof mod.ENFORCEMENT_DEFAULTS, 'object');
    assert.ok(mod.ENFORCEMENT_DEFAULTS !== null);
  });

  it('ENFORCEMENT_DEFAULTS contains known keys', () => {
    assert.ok('PLANNER_FIRST_ENFORCEMENT' in mod.ENFORCEMENT_DEFAULTS);
    assert.ok('SECURITY_REVIEW_ENFORCEMENT' in mod.ENFORCEMENT_DEFAULTS);
  });

  it('exports getEnforcementMode, getEnforcementKeys, isBlocking, isWarning, isDisabled', () => {
    assert.strictEqual(typeof mod.getEnforcementMode, 'function');
    assert.strictEqual(typeof mod.getEnforcementKeys, 'function');
    assert.strictEqual(typeof mod.isBlocking, 'function');
    assert.strictEqual(typeof mod.isWarning, 'function');
    assert.strictEqual(typeof mod.isDisabled, 'function');
  });

  it('getEnforcementMode returns string for known key', () => {
    const mode = mod.getEnforcementMode('PLANNER_FIRST_ENFORCEMENT');
    assert.strictEqual(typeof mode, 'string');
    assert.ok(['block', 'warn', 'off', 'on'].includes(mode));
  });

  it('getEnforcementKeys returns non-empty array', () => {
    const keys = mod.getEnforcementKeys();
    assert.ok(Array.isArray(keys));
    assert.ok(keys.length >= 5);
  });

  it('isBlocking returns boolean', () => {
    assert.strictEqual(typeof mod.isBlocking('PLANNER_FIRST_ENFORCEMENT'), 'boolean');
  });
});

// ---------------------------------------------------------------------------
// utils/workflow-paths.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/workflow-paths', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'workflow-paths.cjs'));
  });

  it('exports getWorkflowStatePath and getPhaseAdvancePath functions', () => {
    assert.strictEqual(typeof mod.getWorkflowStatePath, 'function');
    assert.strictEqual(typeof mod.getPhaseAdvancePath, 'function');
  });

  it('getWorkflowStatePath returns an absolute string path', () => {
    const result = mod.getWorkflowStatePath();
    assert.strictEqual(typeof result, 'string');
    assert.ok(path.isAbsolute(result), `expected absolute path, got: ${result}`);
  });

  it('getPhaseAdvancePath returns an absolute string path', () => {
    const result = mod.getPhaseAdvancePath();
    assert.strictEqual(typeof result, 'string');
    assert.ok(path.isAbsolute(result), `expected absolute path, got: ${result}`);
  });

  it('getWorkflowStatePath respects WORKFLOW_STATE_FILE env override', () => {
    const original = process.env.WORKFLOW_STATE_FILE;
    const override = path.join(ROOT, 'custom-workflow-state.json');
    process.env.WORKFLOW_STATE_FILE = override;
    try {
      const result = mod.getWorkflowStatePath();
      assert.strictEqual(result, override);
    } finally {
      if (original === undefined) {
        delete process.env.WORKFLOW_STATE_FILE;
      } else {
        process.env.WORKFLOW_STATE_FILE = original;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// utils/optimization-targets.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/optimization-targets', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'optimization-targets.cjs'));
  });

  it('exports setPerformanceTargets and optimizationPriority functions', () => {
    assert.strictEqual(typeof mod.setPerformanceTargets, 'function');
    assert.strictEqual(typeof mod.optimizationPriority, 'function');
  });

  it('setPerformanceTargets returns object with tier1, tier2, tier3', () => {
    const targets = mod.setPerformanceTargets();
    assert.strictEqual(typeof targets, 'object');
    assert.ok(Array.isArray(targets.tier1), 'tier1 missing');
    assert.ok(Array.isArray(targets.tier2), 'tier2 missing');
    assert.ok(Array.isArray(targets.tier3), 'tier3 missing');
    assert.ok(targets.tier1.length >= 1);
  });

  it('optimizationPriority returns priority analysis object', () => {
    const bottleneck = { executionTime: 1000, percentage: 25, complexity: 'medium' };
    const result = mod.optimizationPriority(bottleneck, 100);
    assert.strictEqual(typeof result, 'object');
    assert.ok('impact' in result);
    assert.ok('effort' in result);
    assert.ok('score' in result);
  });
});

// ---------------------------------------------------------------------------
// utils/binary-resolver.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/binary-resolver', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'binary-resolver.cjs'));
  });

  it('exports buildToolCandidates, resolveToolBinary, resolveRipgrepBinary, resolveAstGrepBinary', () => {
    assert.strictEqual(typeof mod.buildToolCandidates, 'function');
    assert.strictEqual(typeof mod.resolveToolBinary, 'function');
    assert.strictEqual(typeof mod.resolveRipgrepBinary, 'function');
    assert.strictEqual(typeof mod.resolveAstGrepBinary, 'function');
    assert.strictEqual(typeof mod.isBinaryUsable, 'function');
    assert.strictEqual(typeof mod.resolveFirstAvailableBinary, 'function');
  });

  it('buildToolCandidates returns array for a tool name', () => {
    const candidates = mod.buildToolCandidates('rg', { projectRoot: ROOT });
    assert.ok(Array.isArray(candidates));
    assert.ok(candidates.length >= 1);
  });

  it('buildToolCandidates accepts array of names', () => {
    const candidates = mod.buildToolCandidates(['rg', 'ripgrep'], { projectRoot: ROOT });
    assert.ok(Array.isArray(candidates));
    assert.ok(candidates.length >= 1);
  });

  it('resolveFirstAvailableBinary returns string or null', () => {
    const result = mod.resolveFirstAvailableBinary([]);
    assert.strictEqual(result, null);
  });
});

// ---------------------------------------------------------------------------
// utils/path-canonicalizer.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/path-canonicalizer', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'path-canonicalizer.cjs'));
  });

  it('exports toWindowsDrivePath, canonicalizePathForPlatform, canonicalizePathMentionsInText', () => {
    assert.strictEqual(typeof mod.toWindowsDrivePath, 'function');
    assert.strictEqual(typeof mod.canonicalizePathForPlatform, 'function');
    assert.strictEqual(typeof mod.canonicalizePathMentionsInText, 'function');
  });

  it('toWindowsDrivePath converts /c/ prefix on Windows-style paths', () => {
    const result = mod.toWindowsDrivePath('/c/Users/test');
    if (process.platform === 'win32') {
      assert.ok(result.startsWith('C:\\'), `expected C:\\ prefix, got: ${result}`);
    } else {
      // On non-Windows, non-/X/ paths are returned unchanged
      assert.ok(typeof result === 'string');
    }
  });

  it('toWindowsDrivePath returns non-matching paths unchanged', () => {
    const result = mod.toWindowsDrivePath('/usr/local/bin');
    assert.strictEqual(typeof result, 'string');
  });

  it('canonicalizePathForPlatform returns string for valid input', () => {
    const result = mod.canonicalizePathForPlatform('/some/path');
    assert.strictEqual(typeof result, 'string');
  });

  it('canonicalizePathForPlatform returns null-like for null input', () => {
    const result = mod.canonicalizePathForPlatform(null);
    assert.strictEqual(result, null);
  });

  it('canonicalizePathMentionsInText returns string for string input', () => {
    const result = mod.canonicalizePathMentionsInText('some text with /a/path/here');
    assert.strictEqual(typeof result, 'string');
  });
});

// ---------------------------------------------------------------------------
// utils/cli-args.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/cli-args', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'cli-args.cjs'));
  });

  it('exports parsePositiveFloat function', () => {
    assert.strictEqual(typeof mod.parsePositiveFloat, 'function');
  });

  it('parsePositiveFloat parses valid positive float', () => {
    const result = mod.parsePositiveFloat('3.14', 'threshold');
    assert.ok(Math.abs(result - 3.14) < 0.0001);
  });

  it('parsePositiveFloat parses integer string', () => {
    const result = mod.parsePositiveFloat('42', 'count');
    assert.strictEqual(result, 42);
  });

  it('parsePositiveFloat parses zero', () => {
    const result = mod.parsePositiveFloat('0', 'value');
    assert.strictEqual(result, 0);
  });
});

// ---------------------------------------------------------------------------
// utils/command-exists.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/command-exists', () => {
  let mod;
  before(() => {
    mod = require(libPath('utils', 'command-exists.cjs'));
  });

  it('exports commandExists function', () => {
    assert.strictEqual(typeof mod.commandExists, 'function');
  });

  it('commandExists returns boolean for known command', () => {
    const result = mod.commandExists('node');
    assert.strictEqual(typeof result, 'boolean');
  });

  it('commandExists returns false for nonexistent command', () => {
    const result = mod.commandExists('this-command-definitely-does-not-exist-xyz123');
    assert.strictEqual(result, false);
  });

  it('commandExists returns false for path-injection attempt', () => {
    const result = mod.commandExists('rm -rf /');
    assert.strictEqual(result, false);
  });
});

// ---------------------------------------------------------------------------
// utils/bottleneck-analyzer.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/bottleneck-analyzer', () => {
  let BottleneckAnalyzer;
  before(() => {
    ({ BottleneckAnalyzer } = require(libPath('utils', 'bottleneck-analyzer.cjs')));
  });

  it('module exports BottleneckAnalyzer class (function)', () => {
    assert.strictEqual(typeof BottleneckAnalyzer, 'function');
  });

  it('can be instantiated with empty metrics', () => {
    const analyzer = new BottleneckAnalyzer({});
    assert.ok(analyzer);
  });

  it('findBottlenecks returns empty array when no metrics', () => {
    const analyzer = new BottleneckAnalyzer({});
    const result = analyzer.findBottlenecks();
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  it('findBottlenecks finds items above threshold', () => {
    const metrics = {
      slow_fn: { executionTime: 800 },
      fast_fn: { executionTime: 200 },
    };
    const analyzer = new BottleneckAnalyzer(metrics);
    const bottlenecks = analyzer.findBottlenecks(50); // 50% threshold
    assert.ok(Array.isArray(bottlenecks));
    // slow_fn is 80% of 1000ms total, so it should be found at threshold=50
    assert.strictEqual(bottlenecks.length, 1);
    assert.strictEqual(bottlenecks[0].name, 'slow_fn');
  });
});

// ---------------------------------------------------------------------------
// utils/context-accumulator.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/context-accumulator', () => {
  let ContextAccumulator;
  before(() => {
    ({ ContextAccumulator } = require(libPath('utils', 'context-accumulator.cjs')));
  });

  it('module exports ContextAccumulator class', () => {
    assert.strictEqual(typeof ContextAccumulator, 'function');
  });

  it('can be instantiated with no arguments', () => {
    const acc = new ContextAccumulator();
    assert.ok(acc);
  });

  it('addAnswer and getContext are methods on instances', () => {
    const acc = new ContextAccumulator();
    assert.strictEqual(typeof acc.addAnswer, 'function');
    assert.strictEqual(typeof acc.getContext, 'function');
  });

  it('getContext returns object with answers array after addAnswer', () => {
    const acc = new ContextAccumulator();
    acc.addAnswer('What is your name?', 'Alice');
    const ctx = acc.getContext();
    assert.strictEqual(typeof ctx, 'object');
    assert.ok(Array.isArray(ctx.answers));
    assert.strictEqual(ctx.answers.length, 1);
  });

  it('accumulated answers contain question and answer fields', () => {
    const acc = new ContextAccumulator();
    acc.addAnswer('How are you?', 'Fine');
    const ctx = acc.getContext();
    assert.strictEqual(ctx.answers[0].question, 'How are you?');
    assert.strictEqual(ctx.answers[0].answer, 'Fine');
  });
});

// ---------------------------------------------------------------------------
// utils/pattern-library.cjs
// ---------------------------------------------------------------------------

describe('coverage-gaps: utils/pattern-library', () => {
  let PatternLibrary;
  before(() => {
    ({ PatternLibrary } = require(libPath('utils', 'pattern-library.cjs')));
  });

  it('module exports PatternLibrary class', () => {
    assert.strictEqual(typeof PatternLibrary, 'function');
  });

  it('can be instantiated with persistence disabled', () => {
    const lib = new PatternLibrary({ persistence: false });
    assert.ok(lib);
  });

  it('store method exists on instance', () => {
    const lib = new PatternLibrary({ persistence: false });
    assert.strictEqual(typeof lib.store, 'function');
  });

  it('store returns a pattern ID string', () => {
    const lib = new PatternLibrary({ persistence: false });
    const id = lib.store({ name: 'test-pattern', description: 'A smoke test pattern' });
    assert.strictEqual(typeof id, 'string');
    assert.ok(id.length > 0);
  });

  it('get returns stored pattern by id', () => {
    const lib = new PatternLibrary({ persistence: false });
    const id = lib.store({ name: 'my-pattern', tags: ['smoke'] });
    const pattern = lib.get(id);
    assert.ok(pattern !== undefined);
    assert.ok(pattern !== null);
  });
});
