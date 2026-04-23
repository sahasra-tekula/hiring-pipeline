DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status') THEN
    CREATE TYPE application_status AS ENUM ('ACTIVE', 'WAITLIST', 'EXITED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acknowledgement_state') THEN
    CREATE TYPE acknowledgement_state AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACKNOWLEDGED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_actor_type') THEN
    CREATE TYPE audit_actor_type AS ENUM ('SYSTEM', 'APPLICANT', 'ADMIN', 'API');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  active_capacity INTEGER NOT NULL CHECK (active_capacity > 0),
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0 AND active_count <= active_capacity),
  waitlist_sequence BIGINT NOT NULL DEFAULT 0 CHECK (waitlist_sequence >= 0),
  ack_window_seconds INTEGER NOT NULL DEFAULT 86400 CHECK (ack_window_seconds >= 60),
  decay_cooldown_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (decay_cooldown_seconds >= 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applicants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  status application_status NOT NULL,
  ack_state acknowledgement_state NOT NULL DEFAULT 'NOT_REQUIRED',
  queue_token BIGINT,
  waitlist_entered_at TIMESTAMPTZ,
  waitlist_eligible_at TIMESTAMPTZ,
  last_promoted_at TIMESTAMPTZ,
  ack_deadline_at TIMESTAMPTZ,
  waitlist_penalty_count INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_penalty_count >= 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  exit_reason TEXT,
  version BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT applications_job_applicant_unique UNIQUE (job_id, applicant_id),
  CONSTRAINT applications_waitlist_shape CHECK (
    (
      status = 'WAITLIST'
      AND queue_token IS NOT NULL
      AND waitlist_entered_at IS NOT NULL
      AND waitlist_eligible_at IS NOT NULL
      AND exited_at IS NULL
    )
    OR (
      status <> 'WAITLIST'
      AND queue_token IS NULL
      AND waitlist_entered_at IS NULL
      AND waitlist_eligible_at IS NULL
    )
  ),
  CONSTRAINT applications_pending_ack_shape CHECK (
    (ack_state = 'PENDING' AND status = 'ACTIVE' AND ack_deadline_at IS NOT NULL)
    OR (ack_state <> 'PENDING' AND ack_deadline_at IS NULL)
  ),
  CONSTRAINT applications_exited_shape CHECK (
    (status = 'EXITED' AND exited_at IS NOT NULL)
    OR (status <> 'EXITED' AND exited_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS application_events (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type audit_actor_type NOT NULL,
  actor_id TEXT,
  reason TEXT,
  from_status application_status,
  to_status application_status,
  from_ack_state acknowledgement_state,
  to_ack_state acknowledgement_state,
  from_queue_token BIGINT,
  to_queue_token BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_underfilled
  ON jobs (active_count, active_capacity, updated_at);

CREATE INDEX IF NOT EXISTS idx_applications_job_status
  ON applications (job_id, status);

CREATE INDEX IF NOT EXISTS idx_applications_waitlist_order
  ON applications (job_id, status, waitlist_eligible_at, queue_token, id)
  WHERE status = 'WAITLIST';

CREATE INDEX IF NOT EXISTS idx_applications_pending_ack
  ON applications (job_id, ack_deadline_at, id)
  WHERE status = 'ACTIVE' AND ack_state = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_applications_applicant
  ON applications (applicant_id, job_id);

CREATE INDEX IF NOT EXISTS idx_application_events_job_time
  ON application_events (job_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_application_events_application_time
  ON application_events (application_id, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_set_updated_at ON jobs;
CREATE TRIGGER trg_jobs_set_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_applicants_set_updated_at ON applicants;
CREATE TRIGGER trg_applicants_set_updated_at
BEFORE UPDATE ON applicants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_applications_set_updated_at ON applications;
CREATE TRIGGER trg_applications_set_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
