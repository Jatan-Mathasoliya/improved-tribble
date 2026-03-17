-- Migration 007: Add bulk resume import staging tables

CREATE TABLE IF NOT EXISTS resume_import_batches (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'queued',
  file_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  ready_count INTEGER NOT NULL DEFAULT 0,
  needs_review_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_import_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES resume_import_batches(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  original_filename TEXT NOT NULL,
  gcs_path TEXT,
  content_hash TEXT,
  extracted_text TEXT,
  extraction_method TEXT NOT NULL DEFAULT 'failed',
  parsed_name TEXT,
  parsed_email TEXT,
  parsed_phone TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_reason TEXT,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  source_metadata JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS resume_import_batches_org_job_idx
  ON resume_import_batches(organization_id, job_id);
CREATE INDEX IF NOT EXISTS resume_import_batches_uploader_idx
  ON resume_import_batches(uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS resume_import_batches_status_idx
  ON resume_import_batches(status);

CREATE INDEX IF NOT EXISTS resume_import_items_batch_idx
  ON resume_import_items(batch_id);
CREATE INDEX IF NOT EXISTS resume_import_items_status_attempt_idx
  ON resume_import_items(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS resume_import_items_batch_status_idx
  ON resume_import_items(batch_id, status);
CREATE INDEX IF NOT EXISTS resume_import_items_job_email_idx
  ON resume_import_items(job_id, parsed_email);
CREATE INDEX IF NOT EXISTS resume_import_items_content_hash_idx
  ON resume_import_items(batch_id, content_hash);
CREATE INDEX IF NOT EXISTS resume_import_items_application_idx
  ON resume_import_items(application_id);
CREATE UNIQUE INDEX IF NOT EXISTS resume_import_items_batch_content_hash_unique
  ON resume_import_items(batch_id, content_hash)
  WHERE content_hash IS NOT NULL;
