ALTER TABLE applications ADD COLUMN IF NOT EXISTS hm_review_requested_at TIMESTAMP;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS hm_review_requested_by INTEGER REFERENCES users(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS hm_review_note TEXT;

CREATE INDEX IF NOT EXISTS applications_hm_review_requested_at_idx
  ON applications(hm_review_requested_at);
