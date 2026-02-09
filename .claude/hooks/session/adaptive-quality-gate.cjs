#!/usr/bin/env node
'use strict';

/**
 * Hook: adaptive-quality-gate.cjs
 * Event: PreToolUse (Edit|Write) — non-blocking, always exit 0
 * Purpose: Count edits, suggest quality checkpoints at adaptive thresholds
 *
 * Enforcement: Non-blocking (always passes through)
 * Thresholds adapt based on correction rate from session metrics
 *
 * High correction rate (>25%): first=3, second=6, repeat=6
 * Low correction rate (<5%): first=10, second=20, repeat=20
 * Default: first=5, second=10, repeat=10
 */

const fs = require('fs');
const path = require('path');

const RUNTIME_DIR = path.join(__dirname, '..', '..', 'context', 'runtime');
const COUNTER_FILE = path.join(RUNTIME_DIR, 'edit-counter.json');
const METRICS_FILE = path.join(RUNTIME_DIR, 'session-metrics.json');

/**
 * Read counter from file (default: { count: 0 })
 */
function readCounter() {
  try {
    if (!fs.existsSync(COUNTER_FILE)) {
      return { count: 0, firstThresholdHit: false, secondThresholdHit: false };
    }
    const data = fs.readFileSync(COUNTER_FILE, 'utf8');
    return JSON.parse(data);
  } catch (_err) {
    // Malformed file - reset to default
    return { count: 0, firstThresholdHit: false, secondThresholdHit: false };
  }
}

/**
 * Write counter to file atomically
 */
function writeCounter(counter) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const tmpPath = `${COUNTER_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(counter, null, 2), 'utf8');
    fs.renameSync(tmpPath, COUNTER_FILE);
  } catch (_err) {
    // Fail-open: if write fails, continue without error
  }
}

/**
 * Determine thresholds based on correction rate from session metrics
 */
function determineThresholds() {
  try {
    if (!fs.existsSync(METRICS_FILE)) {
      // No metrics file - use default thresholds
      return { first: 5, second: 10, repeat: 10 };
    }

    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    const corrections = metrics.corrections_count || 0;
    const prompts = metrics.prompt_count || 1; // avoid division by zero

    const correctionRate = corrections / prompts;

    // High correction rate (>25%): lower thresholds (more aggressive)
    if (correctionRate > 0.25) {
      return { first: 3, second: 6, repeat: 6 };
    }

    // Low correction rate (<5%): higher thresholds (less aggressive)
    if (correctionRate < 0.05) {
      return { first: 10, second: 20, repeat: 20 };
    }

    // Default thresholds
    return { first: 5, second: 10, repeat: 10 };
  } catch (_err) {
    // Fail-open: if metrics read fails, use default
    return { first: 5, second: 10, repeat: 10 };
  }
}

/**
 * Check if current count hits a threshold and emit warning to stderr
 */
function checkThresholds(count, thresholds, counter) {
  // First threshold
  if (count === thresholds.first && !counter.firstThresholdHit) {
    console.error(`[Quality Gate] ${count} edits made. Consider running: pnpm lint:fix && pnpm format`);
    return { ...counter, firstThresholdHit: true };
  }

  // Second threshold
  if (count === thresholds.second && !counter.secondThresholdHit) {
    console.error(`[Quality Gate] ${count} edits made. Strongly recommend running: pnpm lint:fix && pnpm format && pnpm test`);
    return { ...counter, secondThresholdHit: true };
  }

  // Repeat threshold (after second, at intervals of repeat)
  if (count > thresholds.second && (count - thresholds.second) % thresholds.repeat === 0) {
    console.error(`[Quality Gate] ${count} edits since last checkpoint. Run quality checks: pnpm lint:fix && pnpm format && pnpm test`);
  }

  return counter;
}

/**
 * Main hook logic
 */
function main() {
  try {
    // Read stdin
    let input = '';
    const stdinBuffer = fs.readFileSync(0, 'utf8');
    input = stdinBuffer;

    // Parse input JSON
    const hookInput = JSON.parse(input);

    // Read counter
    let counter = readCounter();

    // Increment count
    counter.count += 1;
    counter.lastUpdated = new Date().toISOString();

    // Determine thresholds based on correction rate
    const thresholds = determineThresholds();

    // Check thresholds and emit warnings
    counter = checkThresholds(counter.count, thresholds, counter);

    // Write updated counter
    writeCounter(counter);

    // ALWAYS output original input to stdout (passthrough)
    console.log(JSON.stringify(hookInput));

    // ALWAYS exit 0 (non-blocking)
    process.exit(0);
  } catch (_err) {
    // Fail-open: on any error, attempt to passthrough stdin
    try {
      const stdinBuffer = fs.readFileSync(0, 'utf8');
      console.log(stdinBuffer);
    } catch (_innerErr) {
      // Last resort: output empty JSON to prevent pipeline break
      console.log('{}');
    }
    process.exit(0);
  }
}

// Run main if executed directly
if (require.main === module) {
  main();
}

module.exports = { readCounter, writeCounter, determineThresholds, checkThresholds };
