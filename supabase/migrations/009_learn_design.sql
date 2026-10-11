-- =============================================================================
-- 009_learn_design.sql — Learn module: align with the final program design
-- =============================================================================
--
-- Idempotent (safe to re-run, including on a database where an earlier draft
-- of this file was applied) and additive: 007 / 008 are never edited because
-- they may already be applied in production. Run order is 007 → 008 → 009;
-- re-running 007 or 008 on its own puts their looser policies and the old
-- learn_is_parent() back, so always re-run 009 after them.
--
--   0. learn_is_parent()  exactly the four parent logins (no domain wildcards).
--      learn_can_write() a parent, or the child whose learners.email is the login.
--   1. learners.settings  merge the design defaults where a key is missing:
--                         theme.ladder / theme.timeBack / theme.screen (Appendix A)
--                         and lightWeeks (Dec 21 - Jan 1 off, Feb 15-26 review-only).
--                         Existing values always win.
--   2. learn_notes.kind   adds 'pony' (Lily names a pony for each mastered skill).
--   3. reward store       UNIQUE (learner_id, title); the XP-priced 008 seed items
--                         are deactivated; the design §4 point-priced items added.
--   4. currency           input points are learn_rewards rows with reason 'pt:…'.
--                         A trigger stamps created_at with the server clock and
--                         enforces the rules at write time, race-free (per-learner
--                         advisory lock): known kinds only, each row at most the
--                         kind's value, bonus / book / workshop from a parent only,
--                         pt:block ≤ 3 a day, pt:ontime and pt:bonus ≤ 1 a day,
--                         ≤ 25 points per Mon-Sun week (America/New_York).
--   5. redemptions        parent-only, client_id (retry-safe insert), priced_in
--                         ('points' | 'xp' for the retired XP store), and a trigger
--                         that prices the row from the item, stamps created_at and
--                         refuses it when the balance (points earned − points
--                         redemptions) is short. No timestamp is compared.
--   6. write policies     every learn ledger / state table: INSERT and UPDATE need
--                         learn_can_write(learner_id), so one child's login cannot
--                         write the other child's rows. SELECT stays family-wide.
--   7. finished book      learn_notes.client_id and learn_log_finished_book(): the
--                         note and the pt:book row in one transaction, keyed by one
--                         action id, so a retry never logs or pays twice.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Who is a parent, who may write a learner's rows
-- ---------------------------------------------------------------------------
-- The email claim comes from the signed Supabase JWT. Exact addresses only:
-- a prefix match would make peter@any-domain a parent.
CREATE OR REPLACE FUNCTION learn_is_parent()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    lower(auth.jwt() ->> 'email') IN (
      'peter@henderson.family',
      'nicole@henderson.family',
      'pete.henderson@gmail.com',
      'nicole.stein78@gmail.com'
    ),
    false
  );
$$;

-- A parent may write any learner's rows (one adult runs both kids); a child's
-- login only the learner row whose email is that login.
CREATE OR REPLACE FUNCTION learn_can_write(p_learner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT learn_is_parent() OR EXISTS (
    SELECT 1
    FROM public.learners l
    WHERE l.id = p_learner
      AND l.email IS NOT NULL
      AND lower(l.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. learners.settings: theme keys and light weeks, only where missing
-- ---------------------------------------------------------------------------
UPDATE learners l
SET settings = jsonb_set(
  CASE WHEN jsonb_typeof(l.settings) = 'object' THEN l.settings ELSE '{}'::jsonb END,
  '{theme}',
  d.theme || CASE WHEN jsonb_typeof(l.settings -> 'theme') = 'object' THEN l.settings -> 'theme' ELSE '{}'::jsonb END,
  true
)
FROM (VALUES
  ('cole', '{"ladder": ["Rookie Ball", "Single-A", "Double-A", "Triple-A", "Lightning 9U Blue", "All-Star"], "timeBack": "Done by 7:45 = catch in the yard", "screen": "diamond"}'::jsonb),
  ('lily', '{"ladder": ["Barre", "Centre", "Across the Floor", "Recital", "Prima"], "timeBack": "Done by 7:45 = dance party before bath", "screen": "tutu"}'::jsonb)
) AS d(slug, theme)
WHERE l.slug = d.slug
  AND NOT (
    jsonb_typeof(l.settings -> 'theme') = 'object'
    AND (l.settings -> 'theme') ?& ARRAY['ladder', 'timeBack', 'screen']
  );

UPDATE learners
SET settings = (CASE WHEN jsonb_typeof(settings) = 'object' THEN settings ELSE '{}'::jsonb END)
  || jsonb_build_object('lightWeeks', '[{"from": "2026-12-21", "to": "2027-01-01", "mode": "off"}, {"from": "2027-02-15", "to": "2027-02-26", "mode": "review-only"}]'::jsonb)
WHERE jsonb_typeof(settings) IS DISTINCT FROM 'object' OR NOT (settings ? 'lightWeeks');

-- ---------------------------------------------------------------------------
-- 2. learn_notes.kind: + 'pony'
-- ---------------------------------------------------------------------------
ALTER TABLE learn_notes DROP CONSTRAINT IF EXISTS learn_notes_kind_check;
ALTER TABLE learn_notes ADD CONSTRAINT learn_notes_kind_check
  CHECK (kind IN ('book', 'homework', 'together', 'read-aloud', 'fluency', 'other', 'pony'));

-- ---------------------------------------------------------------------------
-- 3. Reward store: unique titles, retire the XP-priced seed, add the design §4 store
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_reward_items_learner_title_key') THEN
    -- A parent may have added the same title twice: number the extras so the constraint can be added.
    UPDATE learn_reward_items r
    SET title = r.title || ' (' || d.rn || ')'
    FROM (
      SELECT id, row_number() OVER (PARTITION BY learner_id, title ORDER BY created_at, id) AS rn
      FROM learn_reward_items
    ) d
    WHERE r.id = d.id AND d.rn > 1;
    ALTER TABLE learn_reward_items ADD CONSTRAINT learn_reward_items_learner_title_key UNIQUE (learner_id, title);
  END IF;
END $$;

UPDATE learn_reward_items
SET active = false
WHERE active
  AND title IN (
    'Extra 15 min catch in the yard', 'Pick Friday pizza toppings', 'Stay up 15 min later (Fri/Sat)', 'Baseball card pack',
    'Dance party song pick', 'Extra bedtime story', 'Paint nails with Mom', 'Pony ride day fund'
  );

INSERT INTO learn_reward_items (learner_id, title, cost)
SELECT l.id, s.title, s.cost
FROM learners l
JOIN (VALUES
  ('cole', 'Choose Saturday breakfast', 10),
  ('cole', 'Pick the weekend workshop', 15),
  ('cole', 'Pick the family game', 15),
  ('cole', '20 minutes of catch with Dad', 20),
  ('cole', 'Manager for a night (run Lily''s rotation)', 12),
  ('cole', '$5 pack of baseball cards', 40),
  ('lily', 'Choose the bedtime book', 5),
  ('lily', 'Pick the weekend workshop', 15),
  ('lily', 'Dance party with Mom before bath', 20),
  ('lily', 'Teacher for a night (read to Cole)', 12),
  ('lily', 'Family ballet show with costume', 25),
  ('lily', '$5 pony figure or sticker set', 40)
) AS s(slug, title, cost) ON s.slug = l.slug
ON CONFLICT (learner_id, title) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. Input points: server-stamped, parent-gated, capped at write time
-- ---------------------------------------------------------------------------
-- Requests from the app run as the 'authenticated' role. The SQL editor
-- (postgres) and service_role are trusted the same way RLS trusts them: they
-- skip the parent check and keep the created_at they send (imports, fixes),
-- but the per-kind and cap rules apply to everyone.
CREATE OR REPLACE FUNCTION learn_points_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tz constant text := 'America/New_York';
  from_app constant boolean := current_user IN ('authenticated', 'anon');
  local_at timestamp;
  week_start timestamptz;
  day_start timestamptz;
  pt_kind text;
  kind_max int;
  week_total int;
  day_total int;
BEGIN
  -- The ledger is dated by the server: a client-sent created_at could move a
  -- row into an empty day or week and slip past the caps.
  IF from_app OR NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  IF NEW.reason IS NULL OR NEW.reason NOT LIKE 'pt:%' THEN
    RETURN NEW; -- an XP row (level ladder only)
  END IF;

  -- RLS runs after this trigger; say no first, so a cap-skip can never hide a
  -- write for a learner this login may not write.
  IF from_app AND NOT learn_can_write(NEW.learner_id) THEN
    RAISE EXCEPTION 'this login cannot write points for that learner' USING ERRCODE = '42501';
  END IF;

  pt_kind := split_part(NEW.reason, ':', 2);
  -- Design §4 point values; anything else is not a point kind.
  kind_max := CASE pt_kind
    WHEN 'block' THEN 1
    WHEN 'ontime' THEN 1
    WHEN 'review' THEN 1
    WHEN 'book' THEN 2
    WHEN 'workshop' THEN 3
    WHEN 'bonus' THEN 1
  END;
  IF kind_max IS NULL THEN
    RETURN NULL; -- unknown kind: the row is skipped
  END IF;
  IF NEW.delta IS NULL OR NEW.delta <= 0 THEN
    RETURN NULL; -- points are never deducted
  END IF;
  -- Book, workshop and the surprise bonus are awarded by a parent (design §4).
  IF pt_kind IN ('bonus', 'book', 'workshop') AND from_app AND NOT learn_is_parent() THEN
    RAISE EXCEPTION 'only a parent can award % points', pt_kind USING ERRCODE = '42501';
  END IF;
  -- A retried write (same client_id) is left to ON CONFLICT DO NOTHING.
  IF NEW.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM learn_rewards WHERE client_id = NEW.client_id) THEN
    RETURN NEW;
  END IF;

  NEW.delta := least(NEW.delta, kind_max);

  PERFORM pg_advisory_xact_lock(hashtext('learn_points:' || NEW.learner_id::text));

  local_at := NEW.created_at AT TIME ZONE tz;
  week_start := date_trunc('week', local_at) AT TIME ZONE tz; -- Monday 00:00 family time
  day_start := date_trunc('day', local_at) AT TIME ZONE tz;

  SELECT coalesce(sum(greatest(delta, 0)), 0) INTO week_total
  FROM learn_rewards
  WHERE learner_id = NEW.learner_id AND reason LIKE 'pt:%' AND created_at >= week_start;

  SELECT coalesce(sum(greatest(delta, 0)), 0) INTO day_total
  FROM learn_rewards
  WHERE learner_id = NEW.learner_id AND reason LIKE 'pt:%' AND split_part(reason, ':', 2) = pt_kind AND created_at >= day_start;

  IF pt_kind = 'block' THEN
    NEW.delta := least(NEW.delta, 3 - day_total);
  ELSIF pt_kind IN ('ontime', 'bonus') THEN
    NEW.delta := least(NEW.delta, 1 - day_total);
  END IF;
  NEW.delta := least(NEW.delta, 25 - week_total);

  IF NEW.delta <= 0 THEN
    RETURN NULL; -- cap reached: the row is skipped (the client sees no row come back)
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS learn_rewards_points_guard ON learn_rewards;
CREATE TRIGGER learn_rewards_points_guard
  BEFORE INSERT ON learn_rewards
  FOR EACH ROW EXECUTE FUNCTION learn_points_guard();

-- ---------------------------------------------------------------------------
-- 5. Redemptions: parent-only, retry-safe, priced from the item, refused when short
-- ---------------------------------------------------------------------------
ALTER TABLE learn_redemptions ADD COLUMN IF NOT EXISTS client_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_redemptions_client_id_key') THEN
    ALTER TABLE learn_redemptions ADD CONSTRAINT learn_redemptions_client_id_key UNIQUE (client_id);
  END IF;
END $$;

-- priced_in: which store a redemption was paid from. Rows of the retired
-- XP-priced store were paid with a negative 'redeem:<item>' XP row and never
-- count against points. Classifying existing rows once here means the balance
-- never depends on comparing timestamps. Legacy = no client_id (the points
-- store always sends one) and either the matching 'redeem:' XP row exists or no
-- point had been earned yet. Only rows still NULL are touched, so a re-run is a no-op.
ALTER TABLE learn_redemptions ADD COLUMN IF NOT EXISTS priced_in text;
UPDATE learn_redemptions d
SET priced_in = CASE
  WHEN d.client_id IS NULL AND (
    EXISTS (SELECT 1 FROM learn_rewards r WHERE r.learner_id = d.learner_id AND r.reason = 'redeem:' || d.item_id::text)
    OR NOT EXISTS (SELECT 1 FROM learn_rewards r WHERE r.learner_id = d.learner_id AND r.reason LIKE 'pt:%' AND r.created_at <= d.created_at)
  ) THEN 'xp'
  ELSE 'points'
END
WHERE d.priced_in IS NULL;
ALTER TABLE learn_redemptions ALTER COLUMN priced_in SET DEFAULT 'points';
ALTER TABLE learn_redemptions ALTER COLUMN priced_in SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_redemptions_priced_in_check') THEN
    ALTER TABLE learn_redemptions ADD CONSTRAINT learn_redemptions_priced_in_check CHECK (priced_in IN ('points', 'xp'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS learn_redemptions_learner_priced_idx ON learn_redemptions (learner_id, priced_in);

CREATE OR REPLACE FUNCTION learn_redemption_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  from_app constant boolean := current_user IN ('authenticated', 'anon');
  item_cost int;
  earned int;
  spent int;
BEGIN
  IF from_app OR NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  -- Every new redemption is paid in points (the XP store is retired).
  NEW.priced_in := 'points';

  -- A parent approves and records the redemption (design §4); a child's login cannot.
  IF from_app AND NOT learn_is_parent() THEN
    RAISE EXCEPTION 'only a parent can redeem rewards' USING ERRCODE = '42501';
  END IF;

  -- A retried redemption (same client_id) is a no-op, never a second charge.
  IF NEW.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM learn_redemptions WHERE client_id = NEW.client_id) THEN
    RETURN NULL;
  END IF;

  SELECT cost INTO item_cost FROM learn_reward_items WHERE id = NEW.item_id AND learner_id = NEW.learner_id AND active;
  IF item_cost IS NULL THEN
    RAISE EXCEPTION 'reward item is not in this learner''s store' USING ERRCODE = 'P0001';
  END IF;
  NEW.cost := item_cost;

  PERFORM pg_advisory_xact_lock(hashtext('learn_points:' || NEW.learner_id::text));

  SELECT coalesce(sum(greatest(delta, 0)), 0) INTO earned
  FROM learn_rewards
  WHERE learner_id = NEW.learner_id AND reason LIKE 'pt:%';

  SELECT coalesce(sum(cost), 0) INTO spent
  FROM learn_redemptions
  WHERE learner_id = NEW.learner_id AND priced_in = 'points';

  IF NEW.cost > earned - spent THEN
    RAISE EXCEPTION 'not enough points for this reward' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS learn_redemptions_guard ON learn_redemptions;
CREATE TRIGGER learn_redemptions_guard
  BEFORE INSERT ON learn_redemptions
  FOR EACH ROW EXECUTE FUNCTION learn_redemption_guard();

-- ---------------------------------------------------------------------------
-- 6. Write policies: a child's login writes only its own learner's rows
-- ---------------------------------------------------------------------------
-- Replaces the 007 / 008 INSERT and UPDATE policies (dropped by name, so the
-- block re-runs cleanly). SELECT policies are unchanged (family-wide).
DO $$
DECLARE
  t text;
BEGIN
  -- Old names (007 / 008) and the names used here.
  FOREACH t IN ARRAY ARRAY[
    'learn_attempts', 'learn_rewards', 'learn_coach_messages', 'learn_skill_progress',
    'learn_sessions', 'learn_notes', 'learn_redemptions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Recorder can insert %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can insert %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Family can update %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Writer can insert %1$s" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Writer can update %1$s" ON %1$I', t);
  END LOOP;

  -- Append-only ledgers: stamped with the writer's own uid, for a learner the writer may write.
  FOREACH t IN ARRAY ARRAY['learn_attempts', 'learn_rewards', 'learn_coach_messages', 'learn_notes'] LOOP
    EXECUTE format(
      'CREATE POLICY "Writer can insert %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid() AND learn_can_write(learner_id))',
      t
    );
  END LOOP;

  -- Mutable state: insert and update, never delete.
  FOREACH t IN ARRAY ARRAY['learn_skill_progress', 'learn_sessions'] LOOP
    EXECUTE format('CREATE POLICY "Writer can insert %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (learn_can_write(learner_id))', t);
    EXECUTE format(
      'CREATE POLICY "Writer can update %1$s" ON %1$I FOR UPDATE TO authenticated USING (learn_can_write(learner_id)) WITH CHECK (learn_can_write(learner_id))',
      t
    );
  END LOOP;

  -- Redemptions: a parent records them (the trigger says so first, with a clearer message).
  EXECUTE 'CREATE POLICY "Writer can insert learn_redemptions" ON learn_redemptions FOR INSERT TO authenticated WITH CHECK (redeemed_by = auth.uid() AND learn_is_parent() AND learn_can_write(learner_id))';
END $$;

-- ---------------------------------------------------------------------------
-- 7. Finished book: note + pt:book in one transaction, keyed by one action id
-- ---------------------------------------------------------------------------
ALTER TABLE learn_notes ADD COLUMN IF NOT EXISTS client_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_notes_client_id_key') THEN
    ALTER TABLE learn_notes ADD CONSTRAINT learn_notes_client_id_key UNIQUE (client_id);
  END IF;
END $$;

-- Runs as the caller (RLS and both triggers apply): a child's login gets
-- 'only a parent can award book points' and nothing is written. The note's
-- client_id is the action id and the point row's is derived from it, so a
-- retry with the same action id returns the first result instead of writing
-- again. When the weekly cap is full the note is still logged with 0 points.
CREATE OR REPLACE FUNCTION learn_log_finished_book(p_learner_id uuid, p_date date, p_title text, p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  pt_client uuid;
  note_row learn_notes;
  pts int;
  title text := left(btrim(coalesce(p_title, '')), 200);
BEGIN
  IF p_learner_id IS NULL OR p_date IS NULL OR p_action_id IS NULL THEN
    RAISE EXCEPTION 'learner, date and action id are required' USING ERRCODE = '22004';
  END IF;
  pt_client := md5('learn-book-points:' || p_action_id::text)::uuid;

  SELECT * INTO note_row FROM learn_notes WHERE client_id = p_action_id;
  IF FOUND THEN
    IF note_row.learner_id <> p_learner_id THEN
      RAISE EXCEPTION 'action id already used for another learner' USING ERRCODE = '23505';
    END IF;
    SELECT delta INTO pts FROM learn_rewards WHERE client_id = pt_client;
    RETURN jsonb_build_object('note', to_jsonb(note_row), 'points', coalesce(pts, 0), 'replayed', true);
  END IF;

  INSERT INTO learn_rewards (learner_id, delta, reason, client_id)
  VALUES (p_learner_id, 2, 'pt:book', pt_client)
  ON CONFLICT (client_id) DO NOTHING
  RETURNING delta INTO pts;

  -- 'Finished:' is BOOK_FINISHED_PREFIX in src/lib/learn/stats.ts (the report counts finished books by it).
  INSERT INTO learn_notes (learner_id, date, kind, subject, text, minutes, client_id)
  VALUES (p_learner_id, p_date, 'book', 'reading', 'Finished: ' || coalesce(nullif(title, ''), 'a book'), 0, p_action_id)
  ON CONFLICT (client_id) DO NOTHING
  RETURNING * INTO note_row;
  IF NOT FOUND THEN
    -- A concurrent call with the same action id won the race: report its result.
    SELECT * INTO note_row FROM learn_notes WHERE client_id = p_action_id;
    SELECT delta INTO pts FROM learn_rewards WHERE client_id = pt_client;
    RETURN jsonb_build_object('note', to_jsonb(note_row), 'points', coalesce(pts, 0), 'replayed', true);
  END IF;

  RETURN jsonb_build_object('note', to_jsonb(note_row), 'points', coalesce(pts, 0), 'replayed', false);
END $$;

REVOKE ALL ON FUNCTION learn_log_finished_book(uuid, date, text, uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION learn_log_finished_book(uuid, date, text, uuid) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION learn_log_finished_book(uuid, date, text, uuid) TO authenticated';
  END IF;
END $$;

-- Let PostgREST see the new function and columns right away.
NOTIFY pgrst, 'reload schema';
