#!/usr/bin/env node
'use strict';

/**
 * session-budget-watchdog.cjs
 *
 * UserPromptSubmit hook — reads budget-tracker.json and injects advisory,
 * strong-warning, or critical messages at 3-tier token thresholds.
 *
 * 3-tier threshold model:
 *   - 140K tokens: advisory (encourage planning for handoff)
 *   - 160K tokens: strong warning (recommend handoff soon)
 *   - 180K tokens: critical (handoff now)
 *
 * Sentinel files in .claude/context/runtime/ prevent repeated firing
 * per tier per session.
 *
 * Fail-open: any error results in { allow: true } with no message.
 */

const fs = require('fs');
const path = require('path');

const THRESHOLDS = [
  {
    tier: 180,
    level: 'critical',
    message: tokens =>
      `CRITICAL [${tokens.toLocaleString()} / ~180K tokens]: Context is near the hard limit. ` +
      `Run \`/session-handoff\` NOW to preserve session state and spawn a fresh session. ` +
      `Continuing without a handoff risks losing work when the context window is exhausted.`,
  },
  {
    tier: 160,
    level: 'strong',
    message: tokens =>
      `WARNING [${tokens.toLocaleString()} / ~160K tokens]: Context is approaching the critical threshold. ` +
      `Plan to initiate a session handoff soon. ` +
      `Run \`/session-handoff\` before the next complex task to ensure continuity.`,
  },
  {
    tier: 140,
    level: 'advisory',
    message: tokens =>
      `ADVISORY [${tokens.toLocaleString()} / ~140K tokens]: Context window is 70% full. ` +
      `Consider running \`/session-handoff\` after completing the current task. ` +
      `This is an early warning — handoff is not urgent yet.`,
  },
];

function run() {
  try {
    // Determine project root (cwd when hook runs)
    const projectRoot = process.cwd();
    const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');

    // Read session ID
    let sessionId = 'unknown';
    const sessionIdPath = path.join(runtimeDir, 'session-id.json');
    if (fs.existsSync(sessionIdPath)) {
      try {
        const raw = fs.readFileSync(sessionIdPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.sessionId === 'string') {
          sessionId = parsed.sessionId;
        }
      } catch (_e) {
        // keep default 'unknown'
      }
    }

    // Read budget-tracker.json
    const budgetPath = path.join(runtimeDir, 'budget-tracker.json');
    if (!fs.existsSync(budgetPath)) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    let budgetData;
    try {
      const raw = fs.readFileSync(budgetPath, 'utf8');
      budgetData = JSON.parse(raw);
    } catch (_e) {
      // Malformed JSON — fail open
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    if (!budgetData || typeof budgetData !== 'object') {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    // Look up current session entry
    const sessionEntry = budgetData[sessionId];
    if (!sessionEntry || typeof sessionEntry.totalTokens !== 'number') {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const totalTokens = sessionEntry.totalTokens;

    // Find the highest tier that applies (THRESHOLDS is ordered highest-to-lowest)
    const applicableTier = THRESHOLDS.find(t => totalTokens >= t.tier * 1000);

    if (!applicableTier) {
      // Below all thresholds — allow with no message
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    // Check if sentinel already exists for this specific tier
    const sentinelPath = path.join(
      runtimeDir,
      `session-handoff-reminder-${applicableTier.tier}K.txt`
    );

    if (fs.existsSync(sentinelPath)) {
      // Already fired for this exact tier — do not re-fire
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    // Write sentinel to prevent re-firing for this tier
    try {
      fs.writeFileSync(
        sentinelPath,
        `Fired at ${new Date().toISOString()} (${totalTokens} tokens)`,
        'utf8'
      );
    } catch (_e) {
      // Non-fatal — still fire the message even if sentinel write fails
    }

    const message = applicableTier.message(totalTokens);
    console.log(JSON.stringify({ allow: true, message }));
  } catch (_err) {
    // Fail-open: advisory hook must not block workflow
    console.log(JSON.stringify({ allow: true }));
  }
}

run();
