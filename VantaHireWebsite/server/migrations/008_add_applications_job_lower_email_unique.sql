-- Migration 008: enforce case-insensitive application uniqueness per job

CREATE UNIQUE INDEX IF NOT EXISTS applications_job_lower_email_unique
  ON applications(job_id, LOWER(email));
