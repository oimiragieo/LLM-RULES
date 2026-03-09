-- Migration 001: Initial Schema
-- Agent Studio shared SQLite database
-- Tables: message_queue, file_memory, episodic_memory

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Message queue for async Telegram worker pool
CREATE TABLE IF NOT EXISTS message_queue (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  text TEXT NOT NULL,
  attachments TEXT DEFAULT '[]',  -- JSON array
  timestamp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|claimed|completed|failed|dead_letter
  worker_pid INTEGER,
  claimed_at INTEGER,
  heartbeat_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mq_status_ts ON message_queue(status, timestamp);
CREATE INDEX IF NOT EXISTS idx_mq_claimed ON message_queue(status, heartbeat_at) WHERE status='claimed';

-- File memory: ingested documents/media
CREATE TABLE IF NOT EXISTS file_memory (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,         -- original filename or URL
  mime_type TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,    -- SHA-256 of raw file (dedup gate)
  size_bytes INTEGER NOT NULL,
  importance_score REAL NOT NULL DEFAULT 0.0,  -- 0.0-1.0; only indexed in LanceDB if > 0.5
  summary TEXT,
  entities TEXT DEFAULT '[]',   -- JSON array of extracted entities
  clean_text TEXT,              -- sanitized extracted text
  vision_embedded INTEGER NOT NULL DEFAULT 0,  -- 1 if vision API was called
  indexed_at INTEGER NOT NULL,
  expires_at INTEGER            -- NULL = indefinite retention
);
CREATE INDEX IF NOT EXISTS idx_fm_hash ON file_memory(hash);
CREATE INDEX IF NOT EXISTS idx_fm_importance ON file_memory(importance_score);

-- Episodic memory: agent conversations, session notes, decisions
CREATE TABLE IF NOT EXISTS episodic_memory (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_type TEXT,
  content TEXT NOT NULL,
  importance_score REAL NOT NULL DEFAULT 0.5,
  tags TEXT DEFAULT '[]',       -- JSON array
  created_at INTEGER NOT NULL
  -- NO expires_at -- episodic memory is indefinite
);
CREATE INDEX IF NOT EXISTS idx_em_session ON episodic_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_em_importance ON episodic_memory(importance_score);
