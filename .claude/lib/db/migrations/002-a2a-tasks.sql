-- Migration 002: A2A Task State Persistence
-- Stores A2A task state across server restarts.
-- Status values mirror TaskStateMachine states: submitted|working|input-required|completed|failed|canceled

CREATE TABLE IF NOT EXISTS a2a_tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'submitted',
  params TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_a2a_status ON a2a_tasks(status);
