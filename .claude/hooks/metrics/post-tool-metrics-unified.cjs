#!/usr/bin/env node
/**
 * Unified PostToolUse Hook (Wildcard Consolidation)
 *
 * Consolidates 3 PostToolUse hooks with empty matcher ("") into a single file for reduced I/O:
 * 1. metrics-collector-hook.cjs - Collects tool execution metrics
 * 2. error-tracker-hook.cjs - Tracks tool errors and failures
 * 3. anomaly-detector.cjs - Detects system anomalies (token explosion, duration spikes, etc.)
 *
 * Performance: Reduces 3 processes to 1, shares hook input parsing across checks.
 *
 * Exit codes:
 * - 0: Always (all checks are advisory, never block)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

// Resolve paths for reliable module loading
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

// Helper for lib requires
function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

// Import shared utilities
const { parseHookInputAsync, getToolName, getToolInput, getToolOutput } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));
const { appendJsonl } = libRequire(path.join('utils', 'jsonl-utils.cjs'));

// Import monitoring modules (library-style, not CLI wrappers)
const metricsCollector = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'monitoring', 'metrics-collector.cjs')
);
const errorTracker = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'monitoring', 'error-tracker.cjs')
);

// Helpers extracted to separate modules to keep line count manageable
const findingsSnapshotHelpers = require('./findings-snapshot-helpers.cjs');
const { shouldRecordFindingsSnapshot, recordPeriodicFindingsSnapshot } = findingsSnapshotHelpers;

// =============================================================================
// Check 1: Metrics Collector (from metrics-collector-hook.cjs)
// =============================================================================

function collectMetrics(hookInput, startedAt) {
  try {
    const tool = getToolName(hookInput) || 'unknown';
    const params = getToolInput(hookInput) || {};
    const output = getToolOutput(hookInput);

    const result =
      output && typeof output === 'object' && !Array.isArray(output) ? output : { output };

    const context = {
      sessionId: hookInput.session_id,
      _metricsStartTime: startedAt,
    };

    metricsCollector.postToolUse(tool, params, result, context);

    return { collected: true };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:metrics] Error:', err.message);
    }
    return { collected: false, error: err.message };
  }
}

// =============================================================================
// Check 2: Error Tracker (from error-tracker-hook.cjs)
// =============================================================================

function coerceError(toolOutput) {
  if (!toolOutput) return null;

  // Structured output: { error: { message, name, stack? } }
  if (toolOutput && typeof toolOutput === 'object' && toolOutput.error) {
    const e = toolOutput.error;
    const message =
      (e && typeof e === 'object' && typeof e.message === 'string' && e.message) ||
      (typeof e === 'string' && e) ||
      'Unknown error';
    const err = new Error(message);
    if (e && typeof e === 'object') {
      if (typeof e.name === 'string') err.name = e.name;
      if (typeof e.stack === 'string') err.stack = e.stack;
    }
    return err;
  }

  // String output: heuristic
  if (typeof toolOutput === 'string') {
    const firstLine = toolOutput.split('\n')[0] || '';
    const looksLikeError =
      firstLine.startsWith('Error:') ||
      firstLine.startsWith('[ERROR]') ||
      firstLine.startsWith('ERROR:') ||
      firstLine.includes('Unhandled error') ||
      firstLine.includes('Unhandled exception');
    if (!looksLikeError) return null;
    return new Error(firstLine.slice(0, 500));
  }

  return null;
}

function trackErrors(hookInput) {
  try {
    const tool = getToolName(hookInput) || 'unknown';
    const params = getToolInput(hookInput) || {};
    const toolOutput = getToolOutput(hookInput);

    const err = coerceError(toolOutput);
    errorTracker.postToolUse(tool, params, { error: err }, { sessionId: hookInput.session_id });

    return { tracked: true };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:errors] Error:', err.message);
    }
    return { tracked: false, error: err.message };
  }
}

// =============================================================================
// Check 3: Anomaly Detector (from anomaly-detector.cjs)
// =============================================================================

// Paths
let STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'anomaly-state.json'
);
let ANOMALY_LOG = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'self-healing',
  'anomaly-log.jsonl'
);
const ANOMALY_LOG_MAX_LINES = Number(process.env.ANOMALY_LOG_MAX_LINES || 2000);

// History limits
const MAX_TOKEN_HISTORY = 100;
const MAX_DURATION_HISTORY = 100;
const MAX_PROMPT_PATTERNS = 50;

// Resource thresholds
const HEAP_WARNING_THRESHOLD = 0.8; // 80%
const HEAP_CRITICAL_THRESHOLD = 0.9; // 90%

function isEnabled() {
  return process.env.ANOMALY_DETECTION_ENABLED !== 'false';
}

function getThresholds() {
  return {
    tokenMultiplier: parseFloat(process.env.ANOMALY_TOKEN_MULTIPLIER || '2'),
    durationMultiplier: parseFloat(process.env.ANOMALY_DURATION_MULTIPLIER || '3'),
    failureCount: parseInt(process.env.ANOMALY_FAILURE_COUNT || '3', 10),
    patternRepetitions: parseInt(process.env.ANOMALY_PATTERN_REPS || '2', 10),
  };
}

function createDefaultState() {
  return {
    tokenHistory: [],
    durationHistory: [],
    failureTracking: {},
    promptPatterns: [],
    lastUpdated: new Date().toISOString(),
  };
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      const state = safeParseJSON(content, 'anomaly-state');
      return {
        ...createDefaultState(),
        ...state,
      };
    }
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:anomaly] Error loading state:', e.message);
    }
  }
  return createDefaultState();
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    state.lastUpdated = new Date().toISOString();
    atomicWriteJSONSync(STATE_FILE, state);
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:anomaly] Error saving state:', e.message);
    }
  }
}

function calculateAverage(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function hashPrompt(prompt) {
  const normalized = prompt.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

function detectTokenExplosion(current, average, multiplier) {
  const result = {
    type: 'token_explosion',
    detected: false,
    current,
    average,
    threshold: multiplier,
    ratio: 0,
  };

  if (average === 0 || average === null || average === undefined) {
    return result;
  }

  result.ratio = current / average;
  result.detected = result.ratio > multiplier;

  return result;
}

function detectDurationSpike(current, average, multiplier) {
  const result = {
    type: 'duration_spike',
    detected: false,
    current,
    average,
    threshold: multiplier,
    ratio: 0,
  };

  if (average === 0 || average === null || average === undefined) {
    return result;
  }

  result.ratio = current / average;
  result.detected = result.ratio > multiplier;

  return result;
}

function detectRepeatedFailures(tool, state, threshold) {
  const result = {
    type: 'repeated_failures',
    detected: false,
    tool,
    count: 0,
    threshold,
  };

  const tracking = state.failureTracking || {};
  if (tracking[tool]) {
    result.count = tracking[tool].count || 0;
    result.lastFailed = tracking[tool].lastFailed;
    result.errors = tracking[tool].errors || [];
    result.detected = result.count >= threshold;
  }

  return result;
}

function detectLoopRisk(prompt, state, threshold) {
  const result = {
    type: 'infinite_loop_risk',
    detected: false,
    repetitions: 0,
    threshold,
  };

  const hash = hashPrompt(prompt);
  const patterns = state.promptPatterns || [];

  const existingPattern = patterns.find(p => p.hash === hash);
  if (existingPattern) {
    result.repetitions = existingPattern.count;
    result.detected = result.repetitions >= threshold;
  }

  return result;
}

function detectResourceExhaustion(metrics) {
  const result = {
    type: 'resource_exhaustion',
    detected: false,
    warning: false,
    metrics: {},
  };

  const memMetrics = metrics || process.memoryUsage();

  const heapUsedRatio = memMetrics.heapUsed / memMetrics.heapTotal;

  result.metrics = {
    heapUsed: memMetrics.heapUsed,
    heapTotal: memMetrics.heapTotal,
    heapUsedRatio: heapUsedRatio,
    external: memMetrics.external,
  };

  if (heapUsedRatio >= HEAP_CRITICAL_THRESHOLD) {
    result.detected = true;
  } else if (heapUsedRatio >= HEAP_WARNING_THRESHOLD) {
    result.warning = true;
  }

  return result;
}

function logAnomaly(anomaly) {
  try {
    const dir = path.dirname(ANOMALY_LOG);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const entry = {
      ...anomaly,
      timestamp: new Date().toISOString(),
    };

    appendJsonl(ANOMALY_LOG, entry, { maxLines: ANOMALY_LOG_MAX_LINES });

    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:anomaly] Logged anomaly:', anomaly.type);
    }
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:anomaly] Error logging anomaly:', e.message);
    }
  }
}

function recordFailure(tool, error, state) {
  if (!state.failureTracking) {
    state.failureTracking = {};
  }

  if (!state.failureTracking[tool]) {
    state.failureTracking[tool] = {
      count: 0,
      errors: [],
      lastFailed: null,
    };
  }

  state.failureTracking[tool].count++;
  state.failureTracking[tool].lastFailed = new Date().toISOString();

  state.failureTracking[tool].errors = [
    ...(state.failureTracking[tool].errors || []).slice(-4),
    error,
  ];
}

function recordTokenUsage(tokens, state) {
  if (!state.tokenHistory) {
    state.tokenHistory = [];
  }

  state.tokenHistory.push(tokens);

  if (state.tokenHistory.length > MAX_TOKEN_HISTORY) {
    state.tokenHistory = state.tokenHistory.slice(-MAX_TOKEN_HISTORY);
  }
}

function recordDuration(duration, state) {
  if (!state.durationHistory) {
    state.durationHistory = [];
  }

  state.durationHistory.push(duration);

  if (state.durationHistory.length > MAX_DURATION_HISTORY) {
    state.durationHistory = state.durationHistory.slice(-MAX_DURATION_HISTORY);
  }
}

function recordPromptPattern(prompt, state) {
  if (!state.promptPatterns) {
    state.promptPatterns = [];
  }

  const hash = hashPrompt(prompt);
  const existing = state.promptPatterns.find(p => p.hash === hash);

  if (existing) {
    existing.count++;
    existing.lastSeen = new Date().toISOString();
  } else {
    state.promptPatterns.push({
      hash,
      count: 1,
      lastSeen: new Date().toISOString(),
    });
  }

  if (state.promptPatterns.length > MAX_PROMPT_PATTERNS) {
    state.promptPatterns.sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
    state.promptPatterns = state.promptPatterns.slice(0, MAX_PROMPT_PATTERNS);
  }
}

function clearFailures(tool, state) {
  if (state.failureTracking && state.failureTracking[tool]) {
    delete state.failureTracking[tool];
  }
}

function detectAnomalies(hookInput) {
  try {
    if (!isEnabled()) {
      return { detected: false, reason: 'disabled' };
    }

    const state = loadState();
    const thresholds = getThresholds();
    const anomalies = [];

    // Extract data from hook input
    const tokenCount = hookInput.tokens || hookInput.token_count || null;
    const duration = hookInput.duration || hookInput.execution_time || null;
    const tool = getToolName(hookInput);
    const toolError = hookInput.error || null;
    const toolSuccess = hookInput.success !== false && !toolError;
    const prompt = hookInput.prompt || hookInput.user_message || null;

    // 1. Check for token explosion
    if (tokenCount !== null) {
      const avgTokens = calculateAverage(state.tokenHistory);
      const tokenResult = detectTokenExplosion(tokenCount, avgTokens, thresholds.tokenMultiplier);
      if (tokenResult.detected) {
        anomalies.push(tokenResult);
      }
      recordTokenUsage(tokenCount, state);
    }

    // 2. Check for duration spike
    if (duration !== null) {
      const avgDuration = calculateAverage(state.durationHistory);
      const durationResult = detectDurationSpike(
        duration,
        avgDuration,
        thresholds.durationMultiplier
      );
      if (durationResult.detected) {
        anomalies.push(durationResult);
      }
      recordDuration(duration, state);
    }

    // 3. Track tool failures
    if (tool) {
      if (!toolSuccess && toolError) {
        recordFailure(tool, toolError, state);
        const failureResult = detectRepeatedFailures(tool, state, thresholds.failureCount);
        if (failureResult.detected) {
          anomalies.push(failureResult);
        }
      } else if (toolSuccess) {
        clearFailures(tool, state);
      }
    }

    // 4. Check for loop risk
    if (prompt) {
      const loopResult = detectLoopRisk(prompt, state, thresholds.patternRepetitions);
      if (loopResult.detected) {
        anomalies.push(loopResult);
      }
      recordPromptPattern(prompt, state);
    }

    // 5. Check resource exhaustion
    const resourceResult = detectResourceExhaustion(null);
    if (resourceResult.detected || resourceResult.warning) {
      anomalies.push(resourceResult);
    }

    // Log all detected anomalies
    for (const anomaly of anomalies) {
      logAnomaly(anomaly);
    }

    // Save updated state
    saveState(state);

    return { detected: true, anomalies };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified:anomaly] Error:', err.message);
    }
    return { detected: false, error: err.message };
  }
}

// =============================================================================
// Combined Runner
// =============================================================================

async function main() {
  const startedAt = Date.now();
  const perfStart = performance.now();

  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    // Run all checks (all are best-effort, never block)
    collectMetrics(hookInput, startedAt);
    trackErrors(hookInput);
    detectAnomalies(hookInput);
    recordPeriodicFindingsSnapshot();

    // Search telemetry: log broad Grep usage instead of built-in search skills
    if (getToolName(hookInput) === 'Grep') {
      const toolInput = getToolInput(hookInput) || {};
      if (detectSearchLikeGrep(toolInput)) {
        recordSearchTelemetry(toolInput);
      }
    }

    const perfDuration = performance.now() - perfStart;
    if (process.env.DEBUG_HOOKS === 'true' || perfDuration > 100) {
      process.stderr.write(
        JSON.stringify({
          hook: 'post-tool-metrics-unified',
          event: 'perf_metrics',
          durationMs: Number(perfDuration.toFixed(2)),
          timestamp: new Date().toISOString(),
        }) + '\n'
      );
    }

    process.exit(0);
  } catch (err) {
    // Monitoring must never block tool use
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-tool-unified] Error:', err.message);
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

const searchTelemetry = require('./search-telemetry-helpers.cjs');
const { detectSearchLikeGrep, recordSearchTelemetry } = searchTelemetry;

module.exports = {
  collectMetrics,
  trackErrors,
  detectAnomalies,
  shouldRecordFindingsSnapshot,
  recordPeriodicFindingsSnapshot,
  get FINDINGS_SNAPSHOT_STATE_FILE() {
    return findingsSnapshotHelpers.FINDINGS_SNAPSHOT_STATE_FILE;
  },
  get SEARCH_TELEMETRY_LOG() {
    return searchTelemetry.SEARCH_TELEMETRY_LOG;
  },
  get FINDINGS_SNAPSHOT_LOG() {
    return searchTelemetry.SEARCH_TELEMETRY_LOG;
  },
  detectSearchLikeGrep,
  recordSearchTelemetry,
  main,
  setStateFile: f => {
    STATE_FILE = f;
  },
  setAnomalyLog: f => {
    ANOMALY_LOG = f;
  },
  setFindingsSnapshotStateFile: f => {
    findingsSnapshotHelpers.setFindingsSnapshotStateFile(f);
  },
  setSearchTelemetryLog: f => {
    searchTelemetry.setSearchTelemetryLog(f);
  },
};
