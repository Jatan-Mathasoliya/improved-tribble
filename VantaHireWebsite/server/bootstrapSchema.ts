import { db } from './db';
import { sql } from 'drizzle-orm';

export async function ensureAtsSchema(): Promise<void> {
  console.log('🔧 Ensuring ATS schema exists...');
  const lockId = Number(process.env.DB_MIGRATION_LOCK_ID || '72499101');

  await db.transaction(async (db: any) => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(${lockId});`);

    // Create base tables first (from schema.ts)
    console.log('  Creating base tables (users, jobs, applications, etc.)...');

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        role TEXT NOT NULL DEFAULT 'candidate'
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        location TEXT,
        message TEXT NOT NULL,
        submitted_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        skills TEXT[],
        deadline DATE,
        posted_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'pending',
        review_comments TEXT,
        expires_at TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        slug TEXT,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      bio TEXT,
      skills TEXT[],
      linkedin TEXT,
      location TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      resume_url TEXT NOT NULL,
      resume_filename TEXT,
      cover_letter TEXT,
      status TEXT DEFAULT 'submitted' NOT NULL,
      notes TEXT,
      last_viewed_at TIMESTAMP,
      downloaded_at TIMESTAMP,
      applied_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      current_stage INTEGER,
      interview_date TIMESTAMP,
      interview_time TEXT,
      interview_location TEXT,
      interview_notes TEXT,
      recruiter_notes TEXT[],
      rating INTEGER,
      tags TEXT[],
      stage_changed_at TIMESTAMP,
      stage_changed_by INTEGER,
      submitted_by_recruiter BOOLEAN DEFAULT FALSE,
      created_by_user_id INTEGER REFERENCES users(id),
      source TEXT DEFAULT 'public_apply',
      source_metadata JSONB
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_analytics (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      views INTEGER NOT NULL DEFAULT 0,
      apply_clicks INTEGER NOT NULL DEFAULT 0,
      conversion_rate NUMERIC(5, 2) DEFAULT 0.00,
      ai_score_cache INTEGER,
      ai_model_version TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Create ATS tables if they do not exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      is_default BOOLEAN DEFAULT FALSE,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      template_type TEXT NOT NULL,
      created_by INTEGER,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_stage_history (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      from_stage INTEGER,
      to_stage INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      notes TEXT,
      changed_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_audit_log (
      id SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
      template_id INTEGER,
      template_type TEXT,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT NOW() NOT NULL,
      sent_by INTEGER,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      preview_url TEXT
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS automation_settings (
      id SERIAL PRIMARY KEY,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value BOOLEAN NOT NULL DEFAULT TRUE,
      description TEXT,
      updated_by INTEGER,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS consultants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      experience TEXT NOT NULL,
      linkedin_url TEXT,
      domains TEXT NOT NULL,
      description TEXT,
      photo_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Add ATS columns to applications table if missing
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_stage INTEGER;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_date TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_time TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_location TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_notes TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS recruiter_notes TEXT[];`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS rating INTEGER;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS tags TEXT[];`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS stage_changed_by INTEGER;`);

  // Phase 5: Add userId column for robust candidate authorization (binds applications to user accounts)
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);`);

  // Add resumeFilename column for proper file download headers
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_filename TEXT;`);

  // Add recruiter metadata columns for "Add Candidate" feature
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS submitted_by_recruiter BOOLEAN DEFAULT FALSE;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'public_apply';`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS source_metadata JSONB;`);

  // Phase 5: Create performance indexes for hotspot queries
  // Jobs table indexes (status, postedBy, isActive for filtering)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS jobs_posted_by_idx ON jobs(posted_by);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS jobs_is_active_idx ON jobs(is_active);`);

  // Applications table indexes (userId for auth, status for filtering)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);`);

  // Functional index for case-insensitive duplicate detection (recruiter-add)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS applications_job_email_idx ON applications(job_id, LOWER(email));`);

  // Fix jobs table: pending jobs should not be active by default
  await db.execute(sql`ALTER TABLE jobs ALTER COLUMN is_active SET DEFAULT FALSE;`);

  // Clean up existing data: pending jobs should not be active
  await db.execute(sql`UPDATE jobs SET is_active = FALSE WHERE status = 'pending' AND is_active = TRUE;`);

  // Phase 2 (SEO): Add slug and updatedAt columns for SEO-friendly URLs
  console.log('  Adding SEO columns to jobs table...');
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS slug TEXT;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW() NOT NULL;`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS jobs_slug_idx ON jobs(slug);`);

  // Phase 7 (Job Lifecycle): Add deactivation/reactivation tracking columns
  console.log('  Adding job lifecycle tracking columns...');
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reactivation_count INTEGER DEFAULT 0 NOT NULL;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS warning_email_sent BOOLEAN DEFAULT FALSE NOT NULL;`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS jobs_deactivated_at_idx ON jobs(deactivated_at);`);

  // Backfill deactivatedAt for existing inactive jobs
  console.log('  Backfilling deactivation timestamps for existing inactive jobs...');
  await db.execute(sql`
    UPDATE jobs
    SET deactivated_at = updated_at,
        deactivation_reason = 'manual'
    WHERE is_active = FALSE
      AND deactivated_at IS NULL
      AND status IN ('approved', 'declined');
  `);

  // Phase 7 (Job Audit): Create audit log table for compliance and debugging
  console.log('  Creating job audit log table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_audit_log (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      performed_by INTEGER NOT NULL REFERENCES users(id),
      reason TEXT,
      metadata JSONB,
      timestamp TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_audit_log_job_id_idx ON job_audit_log(job_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_audit_log_timestamp_idx ON job_audit_log(timestamp);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_audit_log_action_idx ON job_audit_log(action);`);

  // Forms Feature: Create forms tables in dependency order
  console.log('  Creating forms tables...');

  // 1. forms table (no dependencies)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS forms (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // 2. form_fields table (depends on forms)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS form_fields (
      id SERIAL PRIMARY KEY,
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT FALSE,
      options TEXT,
      "order" INTEGER NOT NULL
    );
  `);

  // 3. form_invitations table (depends on forms, applications)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS form_invitations (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      form_id INTEGER NOT NULL REFERENCES forms(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_by INTEGER NOT NULL REFERENCES users(id),
      sent_at TIMESTAMP,
      viewed_at TIMESTAMP,
      answered_at TIMESTAMP,
      field_snapshot TEXT NOT NULL,
      custom_message TEXT,
      reminder_sent_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // 4. form_responses table (depends on form_invitations, applications)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS form_responses (
      id SERIAL PRIMARY KEY,
      invitation_id INTEGER NOT NULL REFERENCES form_invitations(id) ON DELETE CASCADE UNIQUE,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      submitted_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // 5. form_response_answers table (depends on form_responses, form_fields)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS form_response_answers (
      id SERIAL PRIMARY KEY,
      response_id INTEGER NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES form_fields(id),
      value TEXT,
      file_url TEXT
    );
  `);

  // Forms Feature: Create indexes
  console.log('  Creating forms indexes...');
  await db.execute(sql`CREATE INDEX IF NOT EXISTS forms_created_by_idx ON forms(created_by);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS forms_is_published_idx ON forms(is_published);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_fields_form_id_order_idx ON form_fields(form_id, "order");`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_invitations_token_idx ON form_invitations(token);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_invitations_app_status_idx ON form_invitations(application_id, status);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_invitations_created_at_idx ON form_invitations(created_at);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_invitations_form_id_idx ON form_invitations(form_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_responses_application_id_idx ON form_responses(application_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_response_answers_response_id_idx ON form_response_answers(response_id);`);

  // Forms Feature: Create partial unique index for active invitations (prevents duplicates)
  console.log('  Creating partial unique index for active form invitations...');
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS form_invitations_active_unique
    ON form_invitations (application_id, form_id)
    WHERE status IN ('pending', 'sent', 'viewed');
  `);

  // External Invites Feature: Add columns to form_invitations for external candidate invites
  console.log('  Adding external invite columns to form_invitations...');
  // Make application_id nullable (external invites have no application yet)
  await db.execute(sql`ALTER TABLE form_invitations ALTER COLUMN application_id DROP NOT NULL;`);
  // Add email column for external candidate
  await db.execute(sql`ALTER TABLE form_invitations ADD COLUMN IF NOT EXISTS email TEXT;`);
  // Add candidate_name column for external candidate
  await db.execute(sql`ALTER TABLE form_invitations ADD COLUMN IF NOT EXISTS candidate_name TEXT;`);
  // Add job_id column for optional job association
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'form_invitations' AND column_name = 'job_id'
      ) THEN
        ALTER TABLE form_invitations ADD COLUMN job_id INTEGER REFERENCES jobs(id);
        CREATE INDEX IF NOT EXISTS form_invitations_job_id_idx ON form_invitations(job_id);
      END IF;
    END $$;
  `);
  // Create index for external invite lookups by email
  await db.execute(sql`CREATE INDEX IF NOT EXISTS form_invitations_email_idx ON form_invitations(email);`);

  // Talent Pool Feature: Create talent_pool table for managing external candidates
  console.log('  Creating talent_pool table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS talent_pool (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'external_form',
      form_response_id INTEGER REFERENCES form_responses(id),
      notes TEXT,
      resume_url TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Talent Pool: Create indexes
  console.log('  Creating talent_pool indexes...');
  await db.execute(sql`CREATE INDEX IF NOT EXISTS talent_pool_recruiter_id_idx ON talent_pool(recruiter_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS talent_pool_email_idx ON talent_pool(email);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS talent_pool_source_idx ON talent_pool(source);`);

  // Talent Pool: Create unique index for email per recruiter
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS talent_pool_recruiter_email_unique
    ON talent_pool(recruiter_id, LOWER(email));
  `);

  // AI Matching Feature: Add columns to existing tables
  console.log('  Adding AI matching columns to existing tables...');

  // Users table: AI feature tracking
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_content_free_used BOOLEAN DEFAULT FALSE;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_onboarded_at TIMESTAMP;`);

  // Users table: Profile completion tracking
  console.log('  Adding profile completion columns to users table...');
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_prompt_snooze_until TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMP;`);

  // Jobs table: JD digest caching
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_digest JSONB;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_digest_version INTEGER DEFAULT 1;`);

  // Applications table: AI fit scoring
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_fit_score INTEGER;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_fit_label TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_fit_reasons JSONB;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_model_version TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_computed_at TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_stale_reason TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_digest_version_used INTEGER;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_summary TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_summary_version INTEGER DEFAULT 1;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_suggested_action_reason TEXT;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_summary_computed_at TIMESTAMP;`);
  await db.execute(sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_id INTEGER;`);

  // AI Matching Feature: Create new tables
  console.log('  Creating AI matching tables...');

  // Candidate resumes table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS candidate_resumes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      gcs_path TEXT NOT NULL,
      extracted_text TEXT,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // User AI usage tracking table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_ai_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      tokens_in INTEGER NOT NULL,
      tokens_out INTEGER NOT NULL,
      cost_usd DECIMAL(10, 8) NOT NULL,
      computed_at TIMESTAMP DEFAULT NOW() NOT NULL,
      metadata JSONB
    );
  `);

  // AI Matching Feature: Create indexes
  console.log('  Creating AI matching indexes...');
  await db.execute(sql`CREATE INDEX IF NOT EXISTS candidate_resumes_user_id_idx ON candidate_resumes(user_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_ai_usage_user_id_idx ON user_ai_usage(user_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_ai_usage_kind_idx ON user_ai_usage(kind);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_ai_usage_computed_at_idx ON user_ai_usage(computed_at);`);

  // AI Matching Feature: Create partial unique index for default resume
  console.log('  Creating partial unique index for default resume per user...');
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS candidate_resumes_unique_default_per_user
    ON candidate_resumes(user_id)
    WHERE is_default = true;
  `);

  // AI Matching Feature: Create trigger to enforce max 3 resumes per user
  console.log('  Creating trigger to enforce max 3 resumes per user...');
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION check_resume_limit()
    RETURNS TRIGGER AS $$
    BEGIN
      IF (SELECT COUNT(*) FROM candidate_resumes WHERE user_id = NEW.user_id) >= 3 THEN
        RAISE EXCEPTION 'Maximum 3 resumes allowed per user';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'enforce_resume_limit'
      ) THEN
        CREATE TRIGGER enforce_resume_limit
        BEFORE INSERT ON candidate_resumes
        FOR EACH ROW EXECUTE FUNCTION check_resume_limit();
      END IF;
    END $$;
  `);

  // AI Matching Feature: Add foreign key constraint for resume_id in applications
  console.log('  Adding foreign key constraint for resume_id in applications...');
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'applications_resume_id_fkey'
      ) THEN
        ALTER TABLE applications
        ADD CONSTRAINT applications_resume_id_fkey
        FOREIGN KEY (resume_id) REFERENCES candidate_resumes(id);
      END IF;
    END $$;
  `);

  // ATS: Application feedback (hiring manager feedback)
  console.log('  Creating application_feedback table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_feedback (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      overall_score INTEGER NOT NULL,
      recommendation TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS application_feedback_application_id_idx ON application_feedback(application_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS application_feedback_author_id_idx ON application_feedback(author_id);
  `);

  // Consulting/Agency Feature: Clients
  console.log('  Creating clients table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      primary_contact_name TEXT,
      primary_contact_email TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS clients_created_by_idx ON clients(created_by);
  `);

  // Consulting/Agency Feature: Client Shortlists
  console.log('  Creating client_shortlists table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_shortlists (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      title TEXT,
      message TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      expires_at TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_shortlists_client_id_idx ON client_shortlists(client_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_shortlists_job_id_idx ON client_shortlists(job_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_shortlists_token_idx ON client_shortlists(token);
  `);

  // Consulting/Agency Feature: Client Shortlist Items
  console.log('  Creating client_shortlist_items table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_shortlist_items (
      id SERIAL PRIMARY KEY,
      shortlist_id INTEGER NOT NULL REFERENCES client_shortlists(id) ON DELETE CASCADE,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_shortlist_items_shortlist_id_idx ON client_shortlist_items(shortlist_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_shortlist_items_application_id_idx ON client_shortlist_items(application_id);
  `);

  // Consulting/Agency Feature: Client Feedback
  console.log('  Creating client_feedback table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_feedback (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      shortlist_id INTEGER REFERENCES client_shortlists(id) ON DELETE SET NULL,
      recommendation TEXT NOT NULL,
      notes TEXT,
      rating INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_feedback_application_id_idx ON client_feedback(application_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_feedback_client_id_idx ON client_feedback(client_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS client_feedback_shortlist_id_idx ON client_feedback(shortlist_id);
  `);

  // ATS: Add hiring_manager_id column to jobs table
  console.log('  Adding hiring_manager_id column to jobs table...');
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'hiring_manager_id'
      ) THEN
        ALTER TABLE jobs ADD COLUMN hiring_manager_id INTEGER REFERENCES users(id);
        CREATE INDEX IF NOT EXISTS jobs_hiring_manager_idx ON jobs(hiring_manager_id);
      END IF;
    END $$;
  `);

  // Consulting/Agency Feature: Add clientId column to jobs table
  console.log('  Adding client_id column to jobs table...');
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'client_id'
      ) THEN
        ALTER TABLE jobs ADD COLUMN client_id INTEGER REFERENCES clients(id);
        CREATE INDEX IF NOT EXISTS jobs_client_id_idx ON jobs(client_id);
      END IF;
    END $$;
  `);

  // Migration: Rename admin role to super_admin (idempotent)
  console.log('  Migrating admin role to super_admin...');
  await db.execute(sql`
    UPDATE users SET role = 'super_admin' WHERE role = 'admin';
  `);

  // Migration: Update admin username to email format for login compatibility
  console.log('  Updating admin username to email format...');
  await db.execute(sql`
    UPDATE users SET username = 'admin@vantahire.local'
    WHERE username = 'admin' AND role = 'super_admin';
  `);

  // Operations Command Center: Add rejection_reason column to applications
  console.log('  Adding rejection_reason column to applications table...');
  await db.execute(sql`
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS applications_rejection_reason_idx ON applications(rejection_reason);
  `);

  // WhatsApp consent: Add whatsapp_consent column to applications
  console.log('  Adding whatsapp_consent column to applications table...');
  await db.execute(sql`
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  // Operations Command Center: Create automation_events table for tracking automation activity
  console.log('  Creating automation_events table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS automation_events (
      id SERIAL PRIMARY KEY,
      automation_key TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      metadata JSONB,
      triggered_at TIMESTAMP DEFAULT NOW() NOT NULL,
      triggered_by INTEGER REFERENCES users(id)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS automation_events_key_idx ON automation_events(automation_key);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS automation_events_target_type_idx ON automation_events(target_type);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS automation_events_triggered_at_idx ON automation_events(triggered_at);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS automation_events_outcome_idx ON automation_events(outcome);
  `);

  // Seed default automation settings if they don't exist
  console.log('  Seeding default automation settings...');
  const defaultSettings = [
    { key: 'auto_send_application_received', description: 'Automatically send confirmation when a candidate submits an application' },
    { key: 'auto_send_status_update', description: 'Notify candidates when their application moves to a new stage' },
    { key: 'auto_send_interview_invite', description: 'Automatically send interview invitations when scheduled' },
    { key: 'auto_send_offer_letter', description: 'Send offer email when candidate reaches Offer stage' },
    { key: 'auto_send_rejection', description: 'Send rejection email when candidate is rejected' },
    { key: 'notify_recruiter_new_application', description: 'Email recruiters when a new application is submitted for their job' },
    { key: 'reminder_interview_upcoming', description: 'Send reminder emails before scheduled interviews' },
  ];

  for (const setting of defaultSettings) {
    await db.execute(sql`
      INSERT INTO automation_settings (setting_key, setting_value, description)
      VALUES (${setting.key}, false, ${setting.description})
      ON CONFLICT (setting_key) DO NOTHING
    `);
  }

  // Email Verification: Add verification columns to users table
  console.log('  Adding email verification columns to users table...');
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;`);

  // Password Reset: Add password reset columns to users table
  console.log('  Adding password reset columns to users table...');
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;`);

  // Recruiter Profiles: Add profile columns to user_profiles table
  console.log('  Adding recruiter profile columns to user_profiles table...');
  await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;`);
  await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS company TEXT;`);
  await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone TEXT;`);
  await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;`);
  await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;`);

  // URL Security: Add publicId column for non-enumerable recruiter URLs
  console.log('  Adding publicId column to user_profiles table...');
  await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS public_id TEXT;`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_public_id_idx ON user_profiles(public_id);`);

  // WhatsApp Integration: Create WhatsApp templates table
  console.log('  Creating whatsapp_templates table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      meta_template_name TEXT NOT NULL UNIQUE,
      meta_template_id TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      template_type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'UTILITY',
      body_template TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // WhatsApp Integration: Create indexes for whatsapp_templates
  console.log('  Creating whatsapp_templates indexes...');
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS whatsapp_templates_type_idx ON whatsapp_templates(template_type);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS whatsapp_templates_status_idx ON whatsapp_templates(status);
  `);

  // WhatsApp Integration: Create WhatsApp audit log table
  console.log('  Creating whatsapp_audit_log table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS whatsapp_audit_log (
      id SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES whatsapp_templates(id),
      template_type TEXT,
      recipient_phone TEXT NOT NULL,
      message_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_code TEXT,
      error_message TEXT,
      template_variables JSONB,
      sent_at TIMESTAMP DEFAULT NOW() NOT NULL,
      delivered_at TIMESTAMP,
      read_at TIMESTAMP,
      sent_by INTEGER REFERENCES users(id)
    );
  `);

  // WhatsApp Integration: Create indexes for whatsapp_audit_log
  console.log('  Creating whatsapp_audit_log indexes...');
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS whatsapp_audit_log_application_id_idx ON whatsapp_audit_log(application_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS whatsapp_audit_log_status_idx ON whatsapp_audit_log(status);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS whatsapp_audit_log_message_id_idx ON whatsapp_audit_log(message_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS whatsapp_audit_log_sent_at_idx ON whatsapp_audit_log(sent_at);
  `);

  // Hiring Manager Invitations: Create table for inviting hiring managers
  console.log('  Creating hiring_manager_invitations table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS hiring_manager_invitations (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      token TEXT NOT NULL,
      invited_by INTEGER NOT NULL REFERENCES users(id),
      inviter_name TEXT,
      expires_at TIMESTAMP NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      accepted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Hiring Manager Invitations: Create indexes
  console.log('  Creating hiring_manager_invitations indexes...');
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hm_invitations_email_idx ON hiring_manager_invitations(email);`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS hm_invitations_token_idx ON hiring_manager_invitations(token);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hm_invitations_invited_by_idx ON hiring_manager_invitations(invited_by);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hm_invitations_status_idx ON hiring_manager_invitations(status);`);

  // Job Recruiters: Many-to-many table for co-recruiters on jobs
  console.log('  Creating job_recruiters table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_recruiters (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_by INTEGER REFERENCES users(id),
      added_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Job Recruiters: Create indexes
  console.log('  Creating job_recruiters indexes...');
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS job_recruiter_unique_idx ON job_recruiters(job_id, recruiter_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_recruiters_job_idx ON job_recruiters(job_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_recruiters_recruiter_idx ON job_recruiters(recruiter_id);`);

  // Co-Recruiter Invitations: Invite recruiters to collaborate on jobs
  console.log('  Creating co_recruiter_invitations table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS co_recruiter_invitations (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      invited_by INTEGER NOT NULL REFERENCES users(id),
      inviter_name TEXT,
      job_title TEXT,
      expires_at TIMESTAMP NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      accepted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Co-Recruiter Invitations: Create indexes
  console.log('  Creating co_recruiter_invitations indexes...');
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS co_recruiter_invite_token_idx ON co_recruiter_invitations(token);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS co_recruiter_invite_job_email_idx ON co_recruiter_invitations(job_id, email);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS co_recruiter_invite_status_idx ON co_recruiter_invitations(status);`);

  // AI Fit Jobs: Async job processing for AI fit scoring
  console.log('  Creating ai_fit_jobs table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_fit_jobs (
      id SERIAL PRIMARY KEY,
      bull_job_id TEXT NOT NULL,
      queue_name TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      application_id INTEGER REFERENCES applications(id),
      application_ids INTEGER[],
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      processed_count INTEGER DEFAULT 0,
      total_count INTEGER,
      result JSONB,
      error TEXT,
      error_code TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    );
  `);

  // AI Fit Jobs: Create indexes
  console.log('  Creating ai_fit_jobs indexes...');
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ai_fit_jobs_bull_job_id_idx ON ai_fit_jobs(bull_job_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_fit_jobs_user_status_idx ON ai_fit_jobs(user_id, status);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_fit_jobs_application_id_idx ON ai_fit_jobs(application_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_fit_jobs_created_at_idx ON ai_fit_jobs(created_at);`);

  // Client Shortlists: Add missing columns for existing tables
  console.log('  Adding missing columns to client_shortlists table...');
  await db.execute(sql`ALTER TABLE client_shortlists ADD COLUMN IF NOT EXISTS title TEXT;`);
  await db.execute(sql`ALTER TABLE client_shortlists ADD COLUMN IF NOT EXISTS message TEXT;`);

  // Structured Job Requirements: Add salary, skills, education, experience columns
  console.log('  Adding structured job requirement columns to jobs table...');
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min INTEGER;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max INTEGER;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_period TEXT;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS good_to_have_skills TEXT[];`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS education_requirement TEXT;`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS experience_years INTEGER;`);

  });

  console.log('✅ ATS schema ready');
}
