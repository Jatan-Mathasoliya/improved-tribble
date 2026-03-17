-- 006: Recruiter feedback events + platform discovery consent
-- Idempotent: safe to run multiple times.

-- Feedback events table
CREATE TABLE IF NOT EXISTS recruiter_feedback_events (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  signal_candidate_id TEXT NOT NULL,
  action TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,

  rank_at_time INTEGER,
  fit_score_at_time INTEGER,
  source_type_at_time TEXT,
  match_tier_at_time TEXT,
  location_match_at_time TEXT,

  role_family TEXT,
  location_country_code TEXT,
  seniority_band TEXT,

  synced_to_signal_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS rfb_event_id_idx ON recruiter_feedback_events(event_id);
CREATE INDEX IF NOT EXISTS rfb_org_job_idx ON recruiter_feedback_events(organization_id, job_id);
CREATE INDEX IF NOT EXISTS rfb_candidate_idx ON recruiter_feedback_events(signal_candidate_id);
CREATE INDEX IF NOT EXISTS rfb_action_idx ON recruiter_feedback_events(action);
CREATE INDEX IF NOT EXISTS rfb_unsynced_idx ON recruiter_feedback_events(synced_to_signal_at);

-- Platform discovery consent fields on applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS platform_discovery_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS consent_captured_at TIMESTAMP;
