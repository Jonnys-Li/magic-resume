CREATE TABLE IF NOT EXISTS interview_history (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  job_title TEXT,
  company TEXT,
  resume_name TEXT,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interview_history_client_time
  ON interview_history (client_id, created_at DESC);
