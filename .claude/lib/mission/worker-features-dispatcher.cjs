#!/usr/bin/env node
'use strict';

/**
 * Worker-to-Features Dispatcher
 *
 * Bridges the features.json state machine to the existing SQLite worker pool.
 *
 * Responsibilities:
 * - Reads features.json and finds next pending feature with all preconditions met
 * - Selects by array index (lower = higher priority)
 * - Enqueues to SQLite queue via existing enqueueMessage()
 * - Returns {dispatched:true, featureId} or {dispatched:false, reason}
 * - Respects budget enforcement via acquireWorkerSlot()
 *
 * Enqueued payload contains:
 * - featureId: string
 * - skillName: string
 * - personaContext: { missionObjectives, featureDescription, expectedBehavior, verificationSteps }
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadFeatures } = require('./features-state-machine.cjs');
const { parseMission } = require('./mission-parser.cjs');
const { enqueueMessage } = require('../db/queue-operations.cjs');

// ---------------------------------------------------------------------------
// MEv1 B3 — SKILL_ALLOWLIST + skillName validation (CWE-78)
// ---------------------------------------------------------------------------
// Rationale: feature.skillName flowed unvalidated into worker dispatch enqueue.
// A malicious skillName like "../../etc/passwd" or "tdd; rm -rf /" could later
// reach a spawn() or path.join() and cause path traversal / command injection.
//
// Defense-in-depth:
//   1. Hard regex `^[a-z0-9][a-z0-9_-]*$` blocks every shell metachar and path
//      separator before any consumer sees the string.
//   2. SKILL_ALLOWLIST (loaded from skill-allowlist.json) gates which vetted
//      skills can be dispatched at all.
//
// Source: .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B3)
// ---------------------------------------------------------------------------

const SKILL_NAME_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
const ALLOWLIST_PATH = path.join(__dirname, 'skill-allowlist.json');

let SKILL_ALLOWLIST = [];
try {
  const raw = fs.readFileSync(ALLOWLIST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed.allowlist)) {
    SKILL_ALLOWLIST = parsed.allowlist.filter(
      s => typeof s === 'string' && SKILL_NAME_REGEX.test(s)
    );
  }
} catch (_err) {
  // Empty allowlist => deny all dispatches; surfaced via test + logs at first
  // dispatch attempt. Better to fail closed than open.
  SKILL_ALLOWLIST = [];
}
const SKILL_ALLOWLIST_SET = new Set(SKILL_ALLOWLIST);

/**
 * Validate a skillName against the regex and the SKILL_ALLOWLIST.
 *
 * @param {string} skillName
 * @throws {Error} with `code: 'SKILL_NAME_INVALID'` on regex mismatch,
 *                  or `code: 'SKILL_NOT_ALLOWLISTED'` on allowlist miss.
 */
/**
 * MEv1 M-F7 — Skill resolution via proposer/effector pattern.
 *
 * Per ADR 2026-04-19 (F7 archived for GATE 4 violation):
 *   "Roadmap: proposer-only refactor routing through skill-creator as effector."
 *
 * Resolves an allowlisted skillName by checking known skill/agent locations.
 * If absent, returns a `proposerRequest` payload addressed to skill-creator
 * — the dispatcher does NOT directly write SKILL.md (that would re-violate
 * GATE 4). The orchestrator/router consumes proposerRequest and dispatches
 * skill-creator as the effector.
 *
 * Defense-in-depth: every path.join uses path.basename(skillName) even though
 * B3 already blocks separators in the regex.
 *
 * @param {string} skillName - already validated by validateSkillName
 * @param {object} [opts]
 * @param {string} [opts.cwd] - root for skill lookup (default: process.cwd())
 * @returns {{ found: boolean, location?: string, proposerRequest?: object }}
 */
function resolveSkillViaCreator(skillName, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const safeName = path.basename(skillName);
  const candidates = [
    path.join(cwd, '.claude', 'skills', safeName, 'SKILL.md'),
    path.join(cwd, '.claude', 'agents', 'domain', safeName + '.md'),
    path.join(cwd, '.claude', 'agents', 'core', safeName + '.md'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return { found: true, location: candidate };
      }
    } catch (_err) {
      // continue
    }
  }
  return {
    found: false,
    proposerRequest: {
      effector: 'skill-creator',
      targetSkill: safeName,
      reason: 'skill_missing_at_dispatch_time',
      adr: '2026-04-19/F7-archived',
      candidatesChecked: candidates,
    },
  };
}

function validateSkillName(skillName) {
  if (typeof skillName !== 'string' || !SKILL_NAME_REGEX.test(skillName)) {
    const err = new Error(
      `Invalid skillName: ${JSON.stringify(skillName)}. Must match ${SKILL_NAME_REGEX} (lowercase, kebab-case, no path separators or shell metachars).`
    );
    err.code = 'SKILL_NAME_INVALID';
    err.details = { skillName };
    throw err;
  }
  if (!SKILL_ALLOWLIST_SET.has(skillName)) {
    const err = new Error(
      `Skill "${skillName}" is not in SKILL_ALLOWLIST. Update .claude/lib/mission/skill-allowlist.json after security review to permit dispatch.`
    );
    err.code = 'SKILL_NOT_ALLOWLISTED';
    err.details = { skillName };
    throw err;
  }
}

/**
 * Dispatch the next eligible feature to the worker pool.
 *
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db - SQLite database
 * @param {import('../workers/budget-enforcement.cjs').BudgetEnforcementService} opts.budget - Budget enforcement service
 * @param {string} opts.featuresPath - Path to features.json
 * @param {string} opts.missionPath - Path to mission.md
 * @param {string} [opts.chatId] - Chat ID for the message (default: 'mission-engine')
 * @param {number} [opts.estimatedTokens] - Estimated tokens for budget check (default: 1000)
 * @returns {{ dispatched: boolean, featureId?: string, reason?: string, retryAfterMs?: number }}
 */
function dispatchFeature({
  db,
  budget,
  featuresPath,
  missionPath,
  chatId,
  estimatedTokens,
  validateSkills,
  cwd,
}) {
  // Normalize paths
  const normalizedFeaturesPath = path.normalize(featuresPath);
  const normalizedMissionPath = path.normalize(missionPath);

  // Load features.json (this validates and checks for circular dependencies)
  let machine;
  try {
    machine = loadFeatures(normalizedFeaturesPath);
  } catch (err) {
    return {
      dispatched: false,
      reason: 'features_load_error',
      error: err.message,
    };
  }

  // Get eligible features (pending with met preconditions)
  const eligibleFeatures = machine.getEligibleFeatures();

  // No eligible features
  if (eligibleFeatures.length === 0) {
    return {
      dispatched: false,
      reason: 'no_eligible_features',
    };
  }

  // Select the first eligible feature (lowest array index = highest priority)
  const feature = eligibleFeatures[0];

  // MEv1 B3 — SKILL_ALLOWLIST + regex gate. Enforced for ALL dispatches.
  // Defense-in-depth: this fires BEFORE budget acquisition and BEFORE enqueue,
  // so a malicious skillName never touches the worker pool.
  try {
    validateSkillName(feature.skillName);
  } catch (err) {
    if (err.code === 'SKILL_NAME_INVALID') {
      return {
        dispatched: false,
        reason: 'skill_name_invalid',
        featureId: feature.id,
        skillName: feature.skillName,
        error: err.message,
      };
    }
    if (err.code === 'SKILL_NOT_ALLOWLISTED') {
      return {
        dispatched: false,
        reason: 'skill_not_allowlisted',
        featureId: feature.id,
        skillName: feature.skillName,
        error: err.message,
      };
    }
    throw err;
  }

  // MEv1 M-F7 — Skill resolution via proposer/effector pattern.
  // Per ADR 2026-04-19, dispatcher MUST NOT directly write SKILL.md (F7
  // archived for GATE 4 violation). When validateSkills is on and the skill
  // is missing, we surface a proposerRequest addressed to skill-creator
  // instead of failing silently or attempting in-line creation.
  if (validateSkills && feature.skillName) {
    const resolution = resolveSkillViaCreator(feature.skillName, { cwd });
    if (!resolution.found) {
      return {
        dispatched: false,
        reason: 'skill_proposed',
        featureId: feature.id,
        skillName: feature.skillName,
        proposerRequest: resolution.proposerRequest,
      };
    }
  }

  // Check budget before dispatching
  const slot = budget.acquireWorkerSlot(estimatedTokens || 1000);
  if (!slot.allowed) {
    return {
      dispatched: false,
      reason: 'budget_exhausted',
      retryAfterMs: slot.retryAfterMs,
    };
  }

  // Build persona context
  const missionData = parseMission(normalizedMissionPath);
  const personaContext = {
    missionObjectives: missionData.objectives || [],
    featureDescription: feature.description || '',
    expectedBehavior: feature.expectedBehavior || [],
    verificationSteps: feature.verificationSteps || [],
    preconditions: feature.preconditions || [],
    fulfills: feature.fulfills || [],
  };

  // Build enqueue payload
  const payload = {
    featureId: feature.id,
    skillName: feature.skillName || 'unknown',
    personaContext,
  };

  // Enqueue to SQLite worker pool
  try {
    enqueueMessage(db, {
      chatId: chatId || 'mission-engine',
      text: JSON.stringify(payload),
      attachments: [],
    });

    // Release the budget slot after successful enqueue
    // Note: In the real dispatcher, the slot is passed to the worker
    // For our purposes, we release it since the message is now in the queue
    slot.release();

    return {
      dispatched: true,
      featureId: feature.id,
    };
  } catch (err) {
    // Release the slot on error
    slot.release();

    return {
      dispatched: false,
      reason: 'enqueue_error',
      error: err.message,
    };
  }
}

/**
 * Get all features eligible for dispatch.
 * Useful for debugging or status checks.
 *
 * @param {string} featuresPath - Path to features.json
 * @returns {{ eligible: Array, blocked: Array, completed: Array }}
 */
function getDispatchStatus(featuresPath) {
  const normalizedPath = path.normalize(featuresPath);

  let machine;
  try {
    machine = loadFeatures(normalizedPath);
  } catch (err) {
    return {
      error: err.message,
      eligible: [],
      blocked: [],
      completed: [],
    };
  }

  const features = machine.getAllFeatures();
  const eligible = machine.getEligibleFeatures();

  const blocked = features.filter(f => {
    if (f.status !== 'pending') return false;
    const precond = machine.checkPreconditions(f.id);
    return !precond.met;
  });

  const completed = features.filter(f => f.status === 'completed');

  return {
    eligible: eligible.map(f => ({ id: f.id, skillName: f.skillName })),
    blocked: blocked.map(f => {
      const precond = machine.checkPreconditions(f.id);
      return {
        id: f.id,
        unmetDeps: precond.unmetDeps,
      };
    }),
    completed: completed.map(f => ({ id: f.id })),
  };
}

module.exports = {
  dispatchFeature,
  getDispatchStatus,
  validateSkillName,
  resolveSkillViaCreator,
  SKILL_NAME_REGEX,
  SKILL_ALLOWLIST,
};
