-- Migration 004: Add application_graph_sync_jobs table
-- Tracks async resume sync jobs from VantaHire to ActiveKG

CREATE TABLE IF NOT EXISTS application_graph_sync_jobs (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  organization_id INTEGER REFERENCES organizations(id),
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  effective_recruiter_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_error TEXT,
  activekg_tenant_id TEXT NOT NULL,
  activekg_parent_node_id TEXT,
  chunk_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS app_graph_sync_status_next_attempt_idx ON application_graph_sync_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS app_graph_sync_org_idx ON application_graph_sync_jobs(organization_id);
CREATE INDEX IF NOT EXISTS app_graph_sync_recruiter_idx ON application_graph_sync_jobs(effective_recruiter_id);
