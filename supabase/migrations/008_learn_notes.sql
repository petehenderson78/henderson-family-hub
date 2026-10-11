-- =============================================================================
-- 008_learn_notes.sql — Learn module: notes log, reward store, parent gating
-- =============================================================================
--
-- Adds
--   learners.email            login email (kids: cole@/lily@henderson.family)
--   learn_notes               parent-logged book work, school homework, Together
--                             cards, read-alouds, fluency checks (INSERT-only)
--   learn_reward_items        the reward store (parents manage)
--   learn_redemptions         a kid spending points (INSERT-only; the matching
--                             negative learn_rewards row keeps the XP ledger as
--                             the single source of truth)
--   learn_is_parent()         SQL helper used by RLS: true for the two parent
--                             logins (peter@…, nicole@… or their gmail addresses)
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- learners.email
-- ---------------------------------------------------------------------------
ALTER TABLE learners ADD COLUMN IF NOT EXISTS email text;
UPDATE learners SET email = slug || '@henderson.family' WHERE email IS NULL;

-- ---------------------------------------------------------------------------
-- learn_is_parent(): parent logins by email. STABLE so RLS can inline it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION learn_is_parent()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    lower(auth.jwt() ->> 'email') LIKE 'peter@%'
    OR lower(auth.jwt() ->> 'email') LIKE 'nicole@%'
    OR lower(auth.jwt() ->> 'email') IN ('pete.henderson@gmail.com', 'nicole.stein78@gmail.com'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- learn_notes: the parent-led evidence log. One row per logged thing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  date date NOT NULL,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('book', 'homework', 'together', 'read-aloud', 'fluency', 'other')),
  subject text,
  text text,
  minutes int NOT NULL DEFAULT 0,
  score int,
  total int,
  standards text[] NOT NULL DEFAULT '{}',
  recorded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- learn_reward_items: the store. Parents add / toggle; kids only read.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_reward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  title text NOT NULL,
  cost int NOT NULL CHECK (cost > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- learn_redemptions: one row per redeemed reward (plus a -cost learn_rewards row).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learn_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES learn_reward_items(id) ON DELETE RESTRICT,
  cost int NOT NULL CHECK (cost > 0),
  redeemed_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS learn_notes_learner_date_idx ON learn_notes (learner_id, date);
CREATE INDEX IF NOT EXISTS learn_reward_items_learner_idx ON learn_reward_items (learner_id, active);
CREATE INDEX IF NOT EXISTS learn_redemptions_learner_created_idx ON learn_redemptions (learner_id, created_at);

-- RLS -----------------------------------------------------------------------
ALTER TABLE learn_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_reward_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- learn_notes: everyone in the family reads; anyone signed in logs under their own uid; no edits.
  DROP POLICY IF EXISTS "Family can select learn_notes" ON learn_notes;
  DROP POLICY IF EXISTS "Family can insert learn_notes" ON learn_notes;
  DROP POLICY IF EXISTS "Family can update learn_notes" ON learn_notes;
  DROP POLICY IF EXISTS "Family can delete learn_notes" ON learn_notes;
  CREATE POLICY "Family can select learn_notes" ON learn_notes
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Family can insert learn_notes" ON learn_notes
    FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid());

  -- learn_redemptions: same shape (INSERT-only, stamped with the redeemer).
  DROP POLICY IF EXISTS "Family can select learn_redemptions" ON learn_redemptions;
  DROP POLICY IF EXISTS "Family can insert learn_redemptions" ON learn_redemptions;
  DROP POLICY IF EXISTS "Family can update learn_redemptions" ON learn_redemptions;
  DROP POLICY IF EXISTS "Family can delete learn_redemptions" ON learn_redemptions;
  CREATE POLICY "Family can select learn_redemptions" ON learn_redemptions
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Family can insert learn_redemptions" ON learn_redemptions
    FOR INSERT TO authenticated WITH CHECK (redeemed_by = auth.uid());

  -- learn_reward_items: family reads; only parents manage.
  DROP POLICY IF EXISTS "Family can select learn_reward_items" ON learn_reward_items;
  DROP POLICY IF EXISTS "Parents can insert learn_reward_items" ON learn_reward_items;
  DROP POLICY IF EXISTS "Parents can update learn_reward_items" ON learn_reward_items;
  DROP POLICY IF EXISTS "Parents can delete learn_reward_items" ON learn_reward_items;
  CREATE POLICY "Family can select learn_reward_items" ON learn_reward_items
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Parents can insert learn_reward_items" ON learn_reward_items
    FOR INSERT TO authenticated WITH CHECK (learn_is_parent());
  CREATE POLICY "Parents can update learn_reward_items" ON learn_reward_items
    FOR UPDATE TO authenticated USING (learn_is_parent()) WITH CHECK (learn_is_parent());
  CREATE POLICY "Parents can delete learn_reward_items" ON learn_reward_items
    FOR DELETE TO authenticated USING (learn_is_parent());
END $$;

-- Seed the reward store (4 items per child; skipped when the title already exists) --
INSERT INTO learn_reward_items (learner_id, title, cost)
SELECT l.id, s.title, s.cost
FROM learners l
JOIN (VALUES
  ('cole', 'Extra 15 min catch in the yard', 200),
  ('cole', 'Pick Friday pizza toppings', 300),
  ('cole', 'Stay up 15 min later (Fri/Sat)', 400),
  ('cole', 'Baseball card pack', 800),
  ('lily', 'Dance party song pick', 200),
  ('lily', 'Extra bedtime story', 250),
  ('lily', 'Paint nails with Mom', 400),
  ('lily', 'Pony ride day fund', 1000)
) AS s(slug, title, cost) ON s.slug = l.slug
WHERE NOT EXISTS (
  SELECT 1 FROM learn_reward_items r WHERE r.learner_id = l.id AND r.title = s.title
);
