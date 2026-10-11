-- =============================================================================
-- 007_learn.sql — Learn module (mastery-based daily missions for the kids)
-- =============================================================================
--
-- RLS rationale: this is a family-only app with four accounts (two parents,
-- two children). A parent routinely runs a child's session from the parent's
-- own account (one adult, two kids, alternating turns), so rows are NOT scoped
-- to auth.uid(). Every authenticated family member may read and write every
-- learn_* row. Anonymous access is still blocked because the policies are
-- granted TO authenticated only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- learners: one row per child. `settings` is a JSON blob the parent view edits:
--   { dailyMinutes, blocks: {math, reading, brain}, targetGrade: {math, reading, reasoning}, rewardRate }
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
-- learn_skill_progress: mastery state per (learner, skill). `window` keeps the
-- last 10 results as booleans; the engine (src/lib/learn/mastery.ts) owns the
-- rules. Rows are created lazily the first time a skill is practiced.
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
  window jsonb NOT NULL DEFAULT '[]'::jsonb,
  interval_days int NOT NULL DEFAULT 0,
  next_review_at timestamptz,
  last_practiced_at timestamptz,
  mastered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- learn_attempts: every answered question (for the parent report + coach).
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
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- learn_sessions: one row per learner per calendar day. `blocks` stores the
-- planned mission for the day (so it stays stable as progress changes) plus
-- per-block completion stats.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  date date NOT NULL,
  minutes int NOT NULL DEFAULT 0,
  xp int NOT NULL DEFAULT 0,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, date)
);

-- ---------------------------------------------------------------------------
-- learn_rewards: the XP ledger. Total XP for a learner = sum(delta).
-- Also used for workshop XP and parent bonuses / redemptions (negative delta).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text NOT NULL DEFAULT '',
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
  created_at timestamptz NOT NULL DEFAULT now()
);

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

-- Permissive policies for every signed-in family member (see rationale above).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'learners', 'learn_skill_progress', 'learn_attempts',
    'learn_sessions', 'learn_rewards', 'learn_coach_messages'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Family can select %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can insert %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can update %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can delete %1$s" ON %1$I', t);
    EXECUTE format('CREATE POLICY "Family can select %1$s" ON %1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Family can insert %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Family can update %1$s" ON %1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Family can delete %1$s" ON %1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Seed the two learners -------------------------------------------------------
INSERT INTO learners (slug, name, grade, settings) VALUES
  (
    'cole', 'Cole', 3,
    '{"dailyMinutes": 30, "blocks": {"math": 12, "reading": 12, "brain": 6}, "targetGrade": {"math": 4, "reading": 4, "reasoning": 3}, "rewardRate": 100}'::jsonb
  ),
  (
    'lily', 'Lily', 1,
    '{"dailyMinutes": 30, "blocks": {"math": 12, "reading": 12, "brain": 6}, "targetGrade": {"math": 2, "reading": 2, "reasoning": 1}, "rewardRate": 100}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;
