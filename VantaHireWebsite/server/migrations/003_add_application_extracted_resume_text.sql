ALTER TABLE applications
ADD COLUMN IF NOT EXISTS extracted_resume_text TEXT;
