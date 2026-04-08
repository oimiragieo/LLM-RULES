// Agent: developer | Task: mission-audit-index | Session: 2026-04-07
'use strict';

/**
 * Mission Audit Index
 *
 * Unified audit trail for mission events. Creates audit-index.jsonl inside
 * mission bundles, providing a single query surface for all mission activity.
 *
 * Every significant event (feature start/complete, handoff received, evidence
 * captured, assertion status change, grading result) gets one entry with
 * correlationId, missionId, featureId, timestamp, eventType, artifactPath.
 *
 * Query functions allow retrieving the full audit trail for any feature.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Event types for the audit index.
 */
const AUDIT_EVENT_TYPES = {
  FEATURE_SELECTED: 'feature_selected',
  FEATURE_STARTED: 'feature_started',
  FEATURE_COMPLETED: 'feature_completed',
  FEATURE_FAILED: 'feature_failed',
  HANDOFF_RECEIVED: 'handoff_received',
  EVIDENCE_CAPTURED: 'evidence_captured',
  ASSERTION_UPDATED: 'assertion_updated',
  MILESTONE_TRIGGERED: 'milestone_triggered',
  VALIDATORS_INJECTED: 'validators_injected',
  GRADING_COMPLETED: 'grading_completed',
  MISSION_STARTED: 'mission_started',
  MISSION_COMPLETED: 'mission_completed',
  MISSION_PAUSED: 'mission_paused',
};

/**
 * Create an audit index writer bound to a mission directory.
 *
 * @param {string} missionDir - Path to mission bundle directory
 * @param {string} [missionId] - Mission identifier
 * @returns {object} Audit index writer and query functions
 */
function createAuditIndex(missionDir, missionId) {
  const indexPath = path.join(missionDir, 'audit-index.jsonl');

  /**
   * Append an event to the audit index.
   * @param {object} event
   */
  function emit(event) {
    const entry = {
      correlationId: event.correlationId || crypto.randomUUID(),
      missionId: missionId || event.missionId || null,
      featureId: event.featureId || null,
      timestamp: event.timestamp || new Date().toISOString(),
      eventType: event.eventType,
      artifactPath: event.artifactPath || null,
      metadata: event.metadata || {},
    };

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(indexPath, line, 'utf8');
    return entry;
  }

  // ------ Convenience emitters ------

  function emitFeatureSelected(featureId, workerSessionId) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.FEATURE_SELECTED,
      featureId,
      metadata: { workerSessionId },
    });
  }

  function emitFeatureStarted(featureId, workerSessionId) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.FEATURE_STARTED,
      featureId,
      metadata: { workerSessionId },
    });
  }

  function emitFeatureCompleted(featureId, commitId) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.FEATURE_COMPLETED,
      featureId,
      metadata: { commitId },
    });
  }

  function emitFeatureFailed(featureId, reason) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.FEATURE_FAILED,
      featureId,
      metadata: { reason },
    });
  }

  function emitHandoffReceived(featureId, handoffPath, successState) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.HANDOFF_RECEIVED,
      featureId,
      artifactPath: handoffPath,
      metadata: { successState },
    });
  }

  function emitEvidenceCaptured(featureId, assertionId, evidencePath) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.EVIDENCE_CAPTURED,
      featureId,
      artifactPath: evidencePath,
      metadata: { assertionId },
    });
  }

  function emitAssertionUpdated(featureId, assertionId, newStatus) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.ASSERTION_UPDATED,
      featureId,
      metadata: { assertionId, status: newStatus },
    });
  }

  function emitMilestoneTriggered(milestone) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.MILESTONE_TRIGGERED,
      metadata: { milestone },
    });
  }

  function emitValidatorsInjected(milestone, scrutinyId, userTestingId) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.VALIDATORS_INJECTED,
      metadata: { milestone, scrutinyId, userTestingId },
    });
  }

  function emitGradingCompleted(featureId, score, gradeBand, passed) {
    return emit({
      eventType: AUDIT_EVENT_TYPES.GRADING_COMPLETED,
      featureId,
      metadata: { score, gradeBand, passed },
    });
  }

  // ------ Query functions ------

  /**
   * Read all audit entries, optionally filtering.
   * @param {object} [filter]
   * @param {string} [filter.featureId]
   * @param {string} [filter.eventType]
   * @returns {object[]}
   */
  function query(filter = {}) {
    if (!fs.existsSync(indexPath)) return [];

    const lines = fs.readFileSync(indexPath, 'utf8').trim().split('\n').filter(Boolean);
    let entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    if (filter.featureId) {
      entries = entries.filter(e => e.featureId === filter.featureId);
    }
    if (filter.eventType) {
      entries = entries.filter(e => e.eventType === filter.eventType);
    }

    return entries;
  }

  /**
   * Get the full audit trail for a specific feature.
   * @param {string} featureId
   * @returns {object[]} Ordered events for this feature
   */
  function getAuditTrail(featureId) {
    return query({ featureId }).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }

  /**
   * Get summary statistics for the audit index.
   * @returns {object}
   */
  function getSummary() {
    const entries = query();
    const byType = {};
    const byFeature = {};

    for (const e of entries) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
      if (e.featureId) {
        byFeature[e.featureId] = (byFeature[e.featureId] || 0) + 1;
      }
    }

    return {
      totalEvents: entries.length,
      eventsByType: byType,
      featuresTracked: Object.keys(byFeature).length,
    };
  }

  return {
    emit,
    emitFeatureSelected,
    emitFeatureStarted,
    emitFeatureCompleted,
    emitFeatureFailed,
    emitHandoffReceived,
    emitEvidenceCaptured,
    emitAssertionUpdated,
    emitMilestoneTriggered,
    emitValidatorsInjected,
    emitGradingCompleted,
    query,
    getAuditTrail,
    getSummary,
    AUDIT_EVENT_TYPES,
    indexPath,
  };
}

module.exports = { createAuditIndex, AUDIT_EVENT_TYPES };
