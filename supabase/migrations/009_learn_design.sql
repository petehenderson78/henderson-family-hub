-- =============================================================================
-- 009_learn_design.sql — Learn module: align with the final program design
-- =============================================================================
--
-- Idempotent (safe to re-run) and additive: 007 / 008 are never edited because
-- they may already be applied in production.
--
--   1. learners.settings  merge the design defaults where a key is missing:
--                         theme.ladder / theme.timeBack / theme.screen (Appendix A)
--                         and lightWeeks (Dec 21 - Jan 1 off, Feb 15-26 review-only).
--                         Existing values always win.
--   2. learn_notes.kind   adds 'pony' (Lily names a pony for each mastered skill).
--   3. reward store       UNIQUE (learner_id, title); the XP-priced 008 seed items
--                         are deactivated; the design §4 point-priced items added.
--   4. currency           input points are learn_rewards rows with reason 'pt:…'.
--                         A trigger enforces the caps at write time, race-free
--                         (per-learner advisory lock): pt:block ≤ 3 a day,
--                         pt:ontime and pt:bonus ≤ 1 a day, ≤ 25 points per
--                         Mon-Sun week (America/New_York), never negative.
--   5. redemptions        client_id (retry-safe insert) and a trigger that prices
--                         the row from the item and refuses it when the points
--                         balance (points earned − points-era redemptions) is short.
--                         Redemptions no longer write a negative learn_rewards row.
-- =============================================================================

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
-- 4. Input points: caps enforced at write time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION learn_points_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tz constant text := 'America/New_York';
  local_at timestamp;
  week_start timestamptz;
  day_start timestamptz;
  pt_kind text;
  week_total int;
  day_total int;
BEGIN
  IF NEW.reason IS NULL OR NEW.reason NOT LIKE 'pt:%' THEN
    RETURN NEW;
  END IF;
  IF NEW.delta IS NULL OR NEW.delta <= 0 THEN
    RETURN NULL; -- points are never deducted
  END IF;
  -- A retried write (same client_id) is left to ON CONFLICT DO NOTHING.
  IF NEW.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM learn_rewards WHERE client_id = NEW.client_id) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('learn_points:' || NEW.learner_id::text));

  local_at := coalesce(NEW.created_at, now()) AT TIME ZONE tz;
  week_start := date_trunc('week', local_at) AT TIME ZONE tz; -- Monday 00:00 family time
  day_start := date_trunc('day', local_at) AT TIME ZONE tz;
  pt_kind := split_part(NEW.reason, ':', 2);
  -- The surprise bonus is granted by a parent only (design: parent-granted, at most once a day).
  IF pt_kind = 'bonus' AND NOT learn_is_parent() THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(delta), 0) INTO week_total
  FROM learn_rewards
  WHERE learner_id = NEW.learner_id AND reason LIKE 'pt:%' AND created_at >= week_start;

  SELECT coalesce(sum(delta), 0) INTO day_total
  FROM learn_rewards
  WHERE learner_id = NEW.learner_id AND reason LIKE 'pt:%' AND split_part(reason, ':', 2) = pt_kind AND created_at >= day_start;

  IF pt_kind = 'block' THEN
    NEW.delta := least(NEW.delta, 3 - day_total);
  ELSIF pt_kind IN ('ontime', 'bonus') THEN
    NEW.delta := least(NEW.delta, 1 - day_total);
  END IF;
  NEW.delta := least(NEW.delta, 25 - week_total);

  IF NEW.delta <= 0 THEN
    RETURN NULL; -- cap reached: the row is silently skipped
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS learn_rewards_points_guard ON learn_rewards;
CREATE TRIGGER learn_rewards_points_guard
  BEFORE INSERT ON learn_rewards
  FOR EACH ROW EXECUTE FUNCTION learn_points_guard();

-- ---------------------------------------------------------------------------
-- 5. Redemptions: retry-safe, priced from the item, refused when points are short
-- ---------------------------------------------------------------------------
ALTER TABLE learn_redemptions ADD COLUMN IF NOT EXISTS client_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learn_redemptions_client_id_key') THEN
    ALTER TABLE learn_redemptions ADD CONSTRAINT learn_redemptions_client_id_key UNIQUE (client_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION learn_redemption_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item_cost int;
  first_pt timestamptz;
  earned int;
  spent int;
BEGIN
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

  SELECT min(created_at), coalesce(sum(delta), 0) INTO first_pt, earned
  FROM learn_rewards
  WHERE learner_id = NEW.learner_id AND reason LIKE 'pt:%';

  -- Redemptions from before the first point row belong to the retired XP-priced store.
  SELECT coalesce(sum(cost), 0) INTO spent
  FROM learn_redemptions
  WHERE learner_id = NEW.learner_id AND first_pt IS NOT NULL AND created_at >= first_pt;

  IF NEW.cost > earned - spent THEN
    RAISE EXCEPTION 'not enough points for this reward' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS learn_redemptions_guard ON learn_redemptions;
CREATE TRIGGER learn_redemptions_guard
  BEFORE INSERT ON learn_redemptions
  FOR EACH ROW EXECUTE FUNCTION learn_redemption_guard();
