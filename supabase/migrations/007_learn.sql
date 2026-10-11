-- =============================================================================
-- 007_learn.sql — Learn module (mastery-based daily missions for the kids)
-- =============================================================================
--
-- Runs top to bottom on a fresh database and is idempotent (re-runnable on a
-- database where an earlier draft of this file was applied).
--
-- RLS rationale: this is a family-only app with four accounts (two parents,
-- two children). A parent routinely runs a child's session from the parent's
-- own account (one adult, two kids, alternating turns), so rows are NOT scoped
-- to auth.uid() for reading. Writes are tightened instead:
--   * learn_attempts / learn_rewards / learn_coach_messages are an append-only
--     ledger: INSERT only, and the row must carry recorded_by = auth.uid().
--     Clients send a client-generated uuid in client_id and upsert with
--     "ignore duplicates", so a retried write never double-counts.
--   * learn_skill_progress / learn_sessions are state: INSERT + UPDATE for any
--     signed-in family member, never DELETE.
--   * learners (settings) may only be changed by a parent (learn_is_parent()).
-- Anonymous access is blocked because every policy is granted TO authenticated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- learn_is_parent(): true when the JWT email belongs to a parent account.
-- Email prefixes peter@ / nicole@ or the two known Gmail addresses.
-- (008 may re-declare this with CREATE OR REPLACE and the same body.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION learn_is_parent() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) LIKE 'peter@%'
      OR lower(coalesce(auth.jwt() ->> 'email', '')) LIKE 'nicole@%'
      OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('pete.henderson@gmail.com', 'nicole.stein78@gmail.com');
$$;

-- ---------------------------------------------------------------------------
-- learners: one row per child. `settings` is a JSON blob the parent view edits:
--   { dailyMinutes, blocks: {math, reading, brain}, weekend: {math, reading, brain},
--     targetGrade: {math, reading, reasoning}, rewardRate, stopBy ("20:30"),
--     pausedUntil (YYYY-MM-DD | null), vacations [{from,to}],
--     theme: {currency, levels}, autoSpeak }
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  grade int NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- learn_skill_progress: mastery state per (learner, skill). `recent_results` keeps the
-- last 10 window-eligible results as booleans (only INDEPENDENT correct answers
-- enter as true); the engine (src/lib/learn/mastery.ts) owns the rules.
-- Rows are created lazily the first time a skill is practiced.
--   review_misses: consecutive failed 4-item review sets (2 → back to learning)
--   needs_help:    set by the stuck rule (3 independent misses in a row)
--   help_note:     the prompt the child was stuck on (parent sees it with parentTip)
--   test_out:      mastered via a 5/5 pretest rather than practice
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_skill_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  skill_id text NOT NULL,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('locked', 'ready', 'learning', 'mastered')),
  attempts int NOT NULL DEFAULT 0,
  correct int NOT NULL DEFAULT 0,
  streak int NOT NULL DEFAULT 0,
  recent_results jsonb NOT NULL DEFAULT '[]'::jsonb, -- last 10 window-eligible results ("window" is reserved in PostgreSQL)
  interval_days int NOT NULL DEFAULT 0,
  next_review_at timestamptz,
  last_practiced_at timestamptz,
  mastered_at timestamptz,
  review_misses int NOT NULL DEFAULT 0,
  needs_help boolean NOT NULL DEFAULT false,
  help_note text,
  test_out boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- learn_attempts: every answered question (for the parent report + coach).
-- Append-only. `question` stores {type, generator?, prompt, answer, options?,
-- level?} — NEVER svg markup (the client strips display.svg before writing).
--   seed:        the generator seed (hash of slug|skill|mode|date|n) so an item
--                can be regenerated for the report
--   hint_used:   the child saw the hint before this answer
--   help_level:  independent | hint (correct after a hint / retry) | taught
--                (parent tapped "I helped")
--   client_id:   client-generated uuid; duplicate writes are ignored
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  skill_id text NOT NULL,
  mode text NOT NULL DEFAULT 'learn',
  question jsonb,
  answer text,
  correct boolean NOT NULL,
  ms int,
  seed bigint, -- unsigned 32-bit hash; exceeds int4
  hint_used boolean NOT NULL DEFAULT false,
  help_level text NOT NULL DEFAULT 'independent'
    CHECK (help_level IN ('independent', 'hint', 'taught')),
  recorded_by uuid DEFAULT auth.uid(),
  client_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- learn_sessions: one row per learner per calendar day (family timezone).
-- `blocks` stores the planned mission for the day (so it stays stable as
-- progress changes) plus per-block completion stats.
--   status: planned → partial → done; skipped / vacation days carry no debt
--           (missed days are simply not planned again).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  date date NOT NULL,
  minutes int NOT NULL DEFAULT 0,
  xp int NOT NULL DEFAULT 0,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'partial', 'done', 'skipped', 'vacation')),
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, date)
);

-- ---------------------------------------------------------------------------
-- learn_rewards: the XP ledger (append-only). Total XP = sum(delta).
-- Also used for workshop XP and parent bonuses / redemptions (negative delta).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text NOT NULL DEFAULT '',
  recorded_by uuid DEFAULT auth.uid(),
  client_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- learn_coach_messages: transcript of the optional AI coach (parent-visible).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  context jsonb,
  recorded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade path for databases where an earlier draft of 007 was applied -------
-- (no-ops on a fresh database; every ADD COLUMN matches the definitions above)
ALTER TABLE learn_skill_progress ADD COLUMN IF NOT EXISTS review_misses int NOT NULL DEFAULT 0;
ALTER TABLE learn_skill_progress ADD COLUMN IF NOT EXISTS needs_help boolean NOT NULL DEFAULT false;
ALTER TABLE learn_skill_progress ADD COLUMN IF NOT EXISTS help_note text;
ALTER TABLE learn_skill_progress ADD COLUMN IF NOT EXISTS test_out boolean NOT NULL DEFAULT false;

ALTER TABLE learn_attempts ADD COLUMN IF NOT EXISTS seed bigint;
ALTER TABLE learn_attempts ADD COLUMN IF NOT EXISTS hint_used boolean NOT NULL DEFAULT false;
ALTER TABLE learn_attempts ADD COLUMN IF NOT EXISTS help_level text NOT NULL DEFAULT 'independent';
ALTER TABLE learn_attempts ADD COLUMN IF NOT EXISTS recorded_by uuid DEFAULT auth.uid();
ALTER TABLE learn_attempts ADD COLUMN IF NOT EXISTS client_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_attempts_help_level_check') THEN
    ALTER TABLE learn_attempts ADD CONSTRAINT learn_attempts_help_level_check
      CHECK (help_level IN ('independent', 'hint', 'taught'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_attempts_client_id_key') THEN
    ALTER TABLE learn_attempts ADD CONSTRAINT learn_attempts_client_id_key UNIQUE (client_id);
  END IF;
END $$;

ALTER TABLE learn_sessions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned';
ALTER TABLE learn_sessions ADD COLUMN IF NOT EXISTS skip_reason text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_sessions_status_check') THEN
    ALTER TABLE learn_sessions ADD CONSTRAINT learn_sessions_status_check
      CHECK (status IN ('planned', 'partial', 'done', 'skipped', 'vacation'));
  END IF;
END $$;

ALTER TABLE learn_rewards ADD COLUMN IF NOT EXISTS recorded_by uuid DEFAULT auth.uid();
ALTER TABLE learn_rewards ADD COLUMN IF NOT EXISTS client_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_rewards_client_id_key') THEN
    ALTER TABLE learn_rewards ADD CONSTRAINT learn_rewards_client_id_key UNIQUE (client_id);
  END IF;
END $$;

ALTER TABLE learn_coach_messages ADD COLUMN IF NOT EXISTS recorded_by uuid DEFAULT auth.uid();

-- Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS learn_skill_progress_learner_skill_idx
  ON learn_skill_progress (learner_id, skill_id);
CREATE INDEX IF NOT EXISTS learn_attempts_learner_created_idx
  ON learn_attempts (learner_id, created_at);
CREATE INDEX IF NOT EXISTS learn_attempts_learner_skill_idx
  ON learn_attempts (learner_id, skill_id);
CREATE INDEX IF NOT EXISTS learn_sessions_learner_date_idx
  ON learn_sessions (learner_id, date);
CREATE INDEX IF NOT EXISTS learn_rewards_learner_created_idx
  ON learn_rewards (learner_id, created_at);
CREATE INDEX IF NOT EXISTS learn_coach_messages_learner_created_idx
  ON learn_coach_messages (learner_id, created_at);

-- RLS -----------------------------------------------------------------------
ALTER TABLE learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_skill_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_coach_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  -- Drop the blanket policies from the earlier draft (and our own, so this block re-runs cleanly).
  FOREACH t IN ARRAY ARRAY[
    'learners', 'learn_skill_progress', 'learn_attempts',
    'learn_sessions', 'learn_rewards', 'learn_coach_messages'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Family can select %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can insert %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can update %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can delete %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Parents can update %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Recorder can insert %1$s" ON %1$I', t);
    -- SELECT is family-wide on every learn table.
    EXECUTE format('CREATE POLICY "Family can select %1$s" ON %1$I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;

  -- Append-only ledgers: the row must be stamped with the writer's own uid.
  FOREACH t IN ARRAY ARRAY['learn_attempts', 'learn_rewards', 'learn_coach_messages'] LOOP
    EXECUTE format(
      'CREATE POLICY "Recorder can insert %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid())',
      t
    );
  END LOOP;

  -- Mutable state: any family member may insert/update; nobody deletes.
  FOREACH t IN ARRAY ARRAY['learn_skill_progress', 'learn_sessions'] LOOP
    EXECUTE format('CREATE POLICY "Family can insert %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Family can update %1$s" ON %1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;

  -- learners: settings are parent-only.
  EXECUTE 'CREATE POLICY "Parents can update learners" ON learners FOR UPDATE TO authenticated USING (learn_is_parent()) WITH CHECK (learn_is_parent())';
END $$;

-- Seed the two learners -------------------------------------------------------
INSERT INTO learners (slug, name, grade, settings) VALUES
  (
    'cole', 'Cole', 3,
    '{"dailyMinutes": 30, "blocks": {"math": 12, "reading": 12, "brain": 6}, "weekend": {"math": 30, "reading": 30, "brain": 45}, "targetGrade": {"math": 5, "reading": 4, "reasoning": 3}, "rewardRate": 100, "stopBy": "20:30", "pausedUntil": null, "vacations": [], "theme": {"currency": "Lightning Bucks", "levels": "baseball"}, "autoSpeak": false}'::jsonb
  ),
  (
    'lily', 'Lily', 1,
    '{"dailyMinutes": 30, "blocks": {"math": 12, "reading": 12, "brain": 6}, "weekend": {"math": 30, "reading": 30, "brain": 45}, "targetGrade": {"math": 2, "reading": 2, "reasoning": 1}, "rewardRate": 100, "stopBy": "20:30", "pausedUntil": null, "vacations": [], "theme": {"currency": "Sparkle Points", "levels": "ballet"}, "autoSpeak": true}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;
