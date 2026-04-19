-- Migration 003: dispatched_features tracking table
-- MEv1 B2 (CWE-362) — defense-in-depth dedupe so the same feature.id cannot be
-- enqueued twice while in_flight even if StateMutex is bypassed.
-- Source: .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B2)

CREATE TABLE IF NOT EXISTS dispatched_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  in_flight_status TEXT NOT NULL DEFAULT 'in_flight', -- 'in_flight'|'completed'|'failed'
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  worker_message_id TEXT
);

-- Partial UNIQUE: a feature_id can only have ONE in-flight row at a time, but
-- can have many completed/failed rows (history). SQLite supports partial
-- indexes with a WHERE clause.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatched_features_in_flight
  ON dispatched_features(feature_id) WHERE in_flight_status = 'in_flight';

CREATE INDEX IF NOT EXISTS idx_dispatched_features_status
  ON dispatched_features(in_flight_status, created_at);
