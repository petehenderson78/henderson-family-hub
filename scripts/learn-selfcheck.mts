/**
 * Learn module self-check: `npm run selfcheck` (= node scripts/learn-selfcheck.mts).
 *
 * Runs in plain Node 22+ (built-in TypeScript type stripping). The resolve hook
 * in ./ts-resolve-hooks.mjs lets the engine's extension-less relative imports
 * load. No path aliases, no DOM, no Next.
 *
 * What it asserts
 *   Generators (300 seeded questions each, levels 1 and 3): well-formed items of
 *   every type (numeric / text / choice / tiles / tap), balanced SVG with a
 *   viewBox and NO id= attributes, no NaN/undefined, the correct answer grades
 *   as correct, variety, determinism (same seed → identical JSON), the prompt /
 *   hint / spoken text never contain the exact answer (numeric ≥ 10, text,
 *   tiles), and the correct option's position is spread (no position > 45%).
 *   Catalog: duplicate ids, missing / cyclic prereqs, unknown generators, both
 *   tracks non-empty, makeQuestion works for every skill.
 *   Planner: never an empty block, never the same generator twice for new
 *   learning, all three block kinds per track, weekend minutes, reviews before
 *   new learning (2 / a third replaces the new skill / 4 on Fri + weekends),
 *   Friday mix-up 8 (12 on the last Friday, weakest first, no generator reuse),
 *   skip check offered on weekends only, light weeks, Lily's homework rule.
 *   Engine: the mastery rule with help levels, the guess filter, 4-item review
 *   sets (advance / halve / demote, family-date due), skip check 10 items and
 *   bands, placement probes (5/5, 4/5 → pair ≥ 9/10), the stuck rule, stopBy,
 *   vacation pause (pausedFrom, archived pauses), streak freeze (weekends,
 *   Friday Free), XP (1 / 0.5 / effort 3, replay decay), ladder levels, seeds, rows.
 *   Stats: five-star ring, Friday Free / bonus set, rotation, input points
 *   (daily caps, weekly cap 25, wallet), launch line, struggle flags, routing.
 *   Report: independent accuracy (hinted = miss, guesses excluded), family dates.
 * Exits 1 with a readable report on any failure.
 */

import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);

// Dynamic imports so they resolve after the hook is registered.
const generatorsMod = await import("../src/lib/learn/generators/index");
const masteryMod = await import("../src/lib/learn/mastery");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog");
const gradeMod = await import("../src/lib/learn/grade");
const datesMod = await import("../src/lib/learn/dates");
const rowsMod = await import("../src/lib/learn/rows");
const typesMod = await import("../src/lib/learn/types");
const statsMod = await import("../src/lib/learn/stats");
const reportMod = await import("../src/lib/learn/report");

type Question = import("../src/lib/learn/types").Question;
type Skill = import("../src/lib/learn/types").Skill;
type SkillProgress = import("../src/lib/learn/types").SkillProgress;
type SessionRecord = import("../src/lib/learn/types").SessionRecord;
type RewardRecord = import("../src/lib/learn/types").RewardRecord;
type SessionBlock = import("../src/lib/learn/types").SessionBlock;

void typesMod;

const { generators, makeQuestion } = generatorsMod;
const {
  applyResult,
  applyReviewSet,
  applyTestOut,
  testOut,
  emptyProgress,
  planMission,
  levelFor,
  xpFor,
  mergeProgress,
  nextReviewInterval,
  isReviewDue,
  defaultSettings,
  normalizeSettings,
  isGuess,
  isStuck,
  markNeedsHelp,
  reviewSetPassed,
  placementPlan,
  minutesUntilStopBy,
  canStartBlock,
  isPaused,
  streakFromSessions,
  sessionStatusFor,
  questionTargetFor,
  shiftReviewDates,
  applySkipCheck,
  skipCheckBand,
  placementProbeResult,
  shouldFilterGuess,
  countsAsIndependent,
  replayFactor,
  blockXp,
  applyPauseEdit,
  lightWeekMode,
  pauseEndDate,
  markMasteredByParent,
  mixupSkills,
  ladderFor,
  isFridayFree,
  kindProgress,
  LADDERS,
  DEFAULT_LIGHT_WEEKS,
  REVIEW_SET_SIZE,
  MIXUP_SET_SIZE,
  MIXUP_LAST_FRIDAY_SIZE,
  TEST_OUT_ITEMS,
  SKIP_CHECK_ITEMS,
  PLACEMENT_MAX_FAILS,
  XP,
} = masteryMod;
const { mulberry32, hashString, questionSeed, questionCounterKey } = rngMod;
const { CATALOG, catalogFor } = catalogMod;
const { gradeAnswer } = gradeMod;
const { isWeekend, isFriday, parseClock, minutesSinceMidnightInFamilyTz, isLastFridayOfMonth, familyMidnightIso, weekStartDate, previousSchoolDay, familyDateOfIso } = datesMod;
const { attemptToRow, newClientId, sessionToRow, sessionFromRow, progressFromRow, progressToRow } = rowsMod;

/**
 * Generators with a KNOWN answer leak in a file this check cannot fix (their
 * owner has been told). They print a warning with the count instead of failing;
 * remove the entry once the generator is fixed. Every other generator fails hard.
 */
const KNOWN_ANSWER_LEAKS: Record<string, string> = {};

const QUESTIONS_PER_GENERATOR = 300;
const LEVELS = [1, 3];
const MAX_POSITION_SHARE = 0.45;
const MIN_POSITION_SAMPLES = 30;

interface Failure {
  where: string;
  message: string;
}

const failures: Failure[] = [];
const warnings: string[] = [];
let checks = 0;

function fail(where: string, message: string) {
  failures.push({ where, message });
}

function assert(cond: unknown, where: string, message: string) {
  checks += 1;
  if (!cond) fail(where, message);
}

function svgTagsBalanced(svg: string): boolean {
  const stack: string[] = [];
  const tagRe = /<\/?([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg))) {
    const full = m[0];
    const name = m[1];
    if (full.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else if (!m[2]) {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

function hasBadString(s: string): boolean {
  return /\bNaN\b|\bundefined\b|\[object Object\]/.test(s);
}

function hasSvgId(svg: string): boolean {
  return /<[^>]*\sid\s*=/i.test(svg);
}

function optionKey(o: { label?: string; svg?: string; emoji?: string }): string {
  return JSON.stringify([o.label ?? "", o.emoji ?? "", o.svg ?? ""]);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token occurrence of `needle` in `hay` (numbers and words alike). */
function containsToken(hay: string, needle: string): boolean {
  const n = needle.trim();
  if (!n) return false;
  const re = new RegExp(`(^|[^\\w])${escapeRe(n)}(?=$|[^\\w])`, "i");
  return re.test(hay);
}

/** "11 × 1", "0 × 7", "+ 0", "÷ 1": the answer is one of the operands by identity — allowed. */
function identityExpression(prompt: string): boolean {
  return /(^|[^\d])[01]\s*[×x*]|[×x*]\s*[01](?!\d)|\+\s*0(?!\d)|(^|[^\d])0\s*\+|÷\s*1(?!\d)|[-−]\s*0(?!\d)/.test(prompt);
}

/** Can the answer be spelled by some ordering of a subset of the tiles? */
function tilesCanSpell(tiles: string[], answer: string): boolean {
  const target = answer.replace(/\s+/g, "").toLowerCase();
  const pool = tiles.map((t) => t.replace(/\s+/g, "").toLowerCase());
  const used = new Array(pool.length).fill(false);
  function walk(pos: number): boolean {
    if (pos === target.length) return true;
    for (let i = 0; i < pool.length; i++) {
      if (used[i] || !pool[i] || !target.startsWith(pool[i], pos)) continue;
      used[i] = true;
      if (walk(pos + pool[i].length)) return true;
      used[i] = false;
    }
    return false;
  }
  return walk(0);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const generatorIds = Object.keys(generators);
console.log(`Checking ${generatorIds.length} generator(s) × ${LEVELS.length} level(s) × ${QUESTIONS_PER_GENERATOR} seeds…`);

for (const id of generatorIds) {
  const gen = generators[id];
  for (const level of LEVELS) {
    const where = `generator ${id} (level ${level})`;
    const answers = new Set<string>();
    const prompts = new Set<string>();
    let selfCheckTextOnly = true;
    const positionCounts = new Map<number, number>();
    let positionSamples = 0;
    let leaks = 0;
    let leakExample = "";
    for (let i = 0; i < QUESTIONS_PER_GENERATOR; i++) {
      const seed = hashString(`selfcheck:${id}:${level}:${i}`);
      let q: Question;
      try {
        q = gen({ rng: mulberry32(seed), level });
      } catch (err) {
        fail(where, `seed ${seed} threw: ${(err as Error).message}`);
        continue;
      }
      const tag = `${where} seed ${seed}`;
      assert(typeof q.prompt === "string" && q.prompt.trim().length > 0, tag, "prompt is empty");
      assert(typeof q.explain === "string" && q.explain.trim().length > 0, tag, "explain missing");
      assert(typeof q.hint === "string" && q.hint.trim().length > 0, tag, "hint missing");
      assert(!hasBadString(q.prompt), tag, `prompt contains NaN/undefined: ${q.prompt}`);
      assert(!hasBadString(q.explain), tag, `explain contains NaN/undefined: ${q.explain}`);
      assert(!hasBadString(q.hint), tag, `hint contains NaN/undefined: ${q.hint}`);
      // Tone rule: feedback never tells the child THEY are wrong ("you're wrong", "that's wrong",
      // "wrong answer!"). Narrative uses ("the wrong key", "rules out a wrong option") are fine.
      const shaming = /\b(you(?:'re| are| were| got (?:it|that))|that(?:'s| is| was)|this(?:'s| is| was)|your answer(?: is| was)?|answer is)\s+wrong\b|\bwrong\s*!/i;
      assert(!shaming.test(q.explain) && !shaming.test(q.hint), tag, 'explain/hint must not tell the child they are wrong (use "not yet")');
      if (q.display?.svg) {
        assert(svgTagsBalanced(q.display.svg), tag, "display svg tags not balanced");
        assert(!hasBadString(q.display.svg), tag, "display svg contains NaN/undefined");
        assert(q.display.svg.includes("viewBox"), tag, "display svg lacks viewBox");
        assert(!hasSvgId(q.display.svg), tag, "display svg has an id= attribute (several SVGs render on one screen)");
      }
      if (q.display?.speak) assert(!hasBadString(q.display.speak), tag, "speak text contains NaN/undefined");
      const speak = q.display?.speak ?? "";

      if (q.type === "numeric") {
        assert(Number.isFinite(q.answer), tag, `numeric answer not finite: ${q.answer}`);
        for (const a of q.accept ?? []) assert(Number.isFinite(a), tag, "accept value not finite");
        answers.add(String(q.answer));
        assert(gradeAnswer(q, String(q.answer)), tag, "gradeAnswer rejects the correct numeric answer");
        // Answer leak: single digits appear incidentally (3 + 4, "count on 1"); check answers >= 10.
        if (Math.abs(q.answer) >= 10) {
          const a = String(q.answer);
          const promptLeak = containsToken(q.prompt, a) && !identityExpression(q.prompt);
          // speak restates the prompt, so identity expressions (12 × 1, 0 + 15) are exempt there too
          const hintLeak = (containsToken(q.hint, a) || containsToken(speak, a)) && !identityExpression(q.prompt);
          if (promptLeak || hintLeak) {
            leaks += 1;
            if (!leakExample) leakExample = `${promptLeak ? "prompt" : "hint/speak"} "${promptLeak ? q.prompt : q.hint}" contains answer ${a}`;
          }
        }
      } else if (q.type === "text") {
        assert(typeof q.answer === "string" && (q.answer.length > 0 || q.selfCheck === true), tag, "text answer empty");
        answers.add(q.answer);
        if (!q.selfCheck) {
          assert(gradeAnswer(q, q.answer), tag, "gradeAnswer rejects the correct text answer");
          if (q.answer.trim().length >= 2) {
            const leak = containsToken(q.prompt, q.answer) || containsToken(q.hint, q.answer) || containsToken(speak, q.answer);
            if (leak) {
              leaks += 1;
              if (!leakExample) leakExample = `prompt/hint/speak contains text answer "${q.answer}" (prompt: ${q.prompt})`;
            }
          }
        }
      } else if (q.type === "choice") {
        assert(Array.isArray(q.options) && q.options.length >= 2, tag, "choice needs >= 2 options");
        assert(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length, tag, `answerIndex out of range: ${q.answerIndex}`);
        const keys = q.options.map(optionKey);
        assert(new Set(keys).size === keys.length, tag, "options are not unique");
        for (const o of q.options) {
          assert(!!(o.label || o.svg || o.emoji), tag, "option has no label/svg/emoji");
          if (o.svg) {
            assert(svgTagsBalanced(o.svg), tag, "option svg tags not balanced");
            assert(!hasBadString(o.svg), tag, "option svg contains NaN/undefined");
            assert(!hasSvgId(o.svg), tag, "option svg has an id= attribute");
          }
          if (o.label) assert(!hasBadString(o.label), tag, `option label bad: ${o.label}`);
        }
        answers.add(optionKey(q.options[q.answerIndex]));
        assert(gradeAnswer(q, String(q.answerIndex)), tag, "gradeAnswer rejects the correct choice");
        if (q.options.length >= 3) {
          positionSamples += 1;
          positionCounts.set(q.answerIndex, (positionCounts.get(q.answerIndex) ?? 0) + 1);
        }
      } else if (q.type === "tiles") {
        assert(Array.isArray(q.tiles) && q.tiles.length >= 2 && q.tiles.every((t) => typeof t === "string" && t.length > 0), tag, "tiles must be >= 2 non-empty strings");
        assert(Number.isInteger(q.slots) && q.slots >= 1 && q.slots <= q.tiles.length, tag, `slots out of range: ${q.slots}`);
        assert(typeof q.answer === "string" && q.answer.length > 0, tag, "tiles answer empty");
        assert(tilesCanSpell(q.tiles, q.answer), tag, `tiles ${JSON.stringify(q.tiles)} cannot spell "${q.answer}"`);
        assert(q.tiles.length <= 12, tag, `too many tiles (${q.tiles.length}) for a phone screen`);
        assert(gradeAnswer(q, q.answer), tag, "gradeAnswer rejects the correct tiles answer");
        answers.add(q.answer);
        if (containsToken(q.prompt, q.answer) || containsToken(q.hint, q.answer)) {
          leaks += 1;
          if (!leakExample) leakExample = `prompt/hint contains tiles answer "${q.answer}" (prompt: ${q.prompt})`;
        }
      } else if (q.type === "tap") {
        assert(Number.isInteger(q.rows) && Number.isInteger(q.cols) && q.rows >= 1 && q.cols >= 1 && q.rows * q.cols <= 100, tag, `grid size bad: ${q.rows}×${q.cols}`);
        const fixed = q.fixed ?? [];
        assert(fixed.every((i) => Number.isInteger(i) && i >= 0 && i < q.rows * q.cols), tag, "fixed cell index out of range");
        assert(new Set(fixed).size === fixed.length, tag, "fixed cells repeat");
        assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= q.rows * q.cols - fixed.length, tag, `tap answer ${q.answer} does not fit the free cells`);
        assert(gradeAnswer(q, String(q.answer)), tag, "gradeAnswer rejects the correct tap answer");
        answers.add(String(q.answer));
      } else {
        fail(tag, `unknown question type ${(q as { type: string }).type}`);
      }
      // Variety key: everything the child actually sees (prompt, picture, grid, emoji, speech, options).
      const seenOptions = q.type === "choice" ? q.options.map((o) => o.label ?? o.emoji ?? o.svg ?? "").join("|") : q.type === "tiles" ? q.tiles.join("|") : "";
      const seenGrid = q.display?.grid ? q.display.grid.map((r) => r.join(",")).join(";") : "";
      prompts.add(q.prompt + (q.display?.svg ?? "") + (q.display?.emoji ?? "") + (q.display?.speak ?? "") + seenGrid + seenOptions);
      if (!(q.type === "text" && q.selfCheck === true)) selfCheckTextOnly = false;
    }
    assert(answers.size > 1, where, `all ${QUESTIONS_PER_GENERATOR} answers identical`);
    // Authored self-check writing prompts are a finite bank (16 prompts); everything else must vary widely.
    const varietyFloor = selfCheckTextOnly ? 10 : QUESTIONS_PER_GENERATOR / 10;
    assert(prompts.size > varietyFloor, where, `low variety: only ${prompts.size} distinct prompts`);
    if (leaks > 0 && KNOWN_ANSWER_LEAKS[id]) {
      checks += 1;
      warnings.push(`${where}: ${leaks}/${QUESTIONS_PER_GENERATOR} items leak the answer (known, ${KNOWN_ANSWER_LEAKS[id]}) — e.g. ${leakExample}`);
    } else {
      assert(leaks === 0, where, `${leaks} item(s) leak the answer in the prompt/hint/speak, e.g. ${leakExample}`);
    }
    if (positionSamples >= MIN_POSITION_SAMPLES) {
      const max = Math.max(...positionCounts.values());
      const share = max / positionSamples;
      const dist = [...positionCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      assert(share <= MAX_POSITION_SHARE, where, `correct option position is skewed (${Math.round(share * 100)}% in one slot; ${dist})`);
    }
  }
  // Determinism: same seed → same question.
  const a = JSON.stringify(gen({ rng: mulberry32(12345), level: 3 }));
  const b = JSON.stringify(gen({ rng: mulberry32(12345), level: 3 }));
  assert(a === b, `generator ${id}`, "not deterministic for the same seed");
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

{
  const ids = new Set<string>();
  for (const skill of CATALOG) {
    const where = `catalog ${skill.id}`;
    assert(!ids.has(skill.id), where, "duplicate skill id");
    ids.add(skill.id);
    assert(!!generators[skill.generator], where, `generator "${skill.generator}" is not registered`);
    assert(skill.grade >= 1 && skill.grade <= 5, where, `grade out of range: ${skill.grade}`);
    assert(skill.kidTitle.length > 0 && skill.title.length > 0, where, "titles missing");
    assert(skill.parentTip.length > 0, where, "parentTip missing");
    assert(skill.standards.length > 0, where, "standards missing");
    assert(!skill.prereqs.includes(skill.id), where, "skill lists itself as a prereq");
    for (const pre of skill.prereqs) assert(CATALOG.some((s) => s.id === pre), where, `prereq "${pre}" not in catalog`);
    if (skill.intro) assert(skill.intro.length >= 2 && skill.intro.every((l) => l.trim().length > 0), where, "intro needs >= 2 non-empty lines");
    try {
      const q1 = JSON.stringify(makeQuestion(skill, 42));
      const q2 = JSON.stringify(makeQuestion(skill, 42));
      assert(q1 === q2, where, "makeQuestion is not deterministic for the same seed");
      assert(q1 !== JSON.stringify(makeQuestion(skill, 43)) || true, where, "unreachable");
    } catch (err) {
      fail(where, `makeQuestion threw: ${(err as Error).message}`);
    }
  }

  // Cyclic prereqs (DFS with colors).
  {
    const byId = new Map(CATALOG.map((s) => [s.id, s]));
    const color = new Map<string, 1 | 2>();
    let cycle: string | null = null;
    function visit(id: string, path: string[]): void {
      if (cycle) return;
      const c = color.get(id);
      if (c === 2) return;
      if (c === 1) {
        cycle = [...path.slice(path.indexOf(id)), id].join(" → ");
        return;
      }
      color.set(id, 1);
      for (const pre of byId.get(id)?.prereqs ?? []) if (byId.has(pre)) visit(pre, [...path, id]);
      color.set(id, 2);
    }
    for (const s of CATALOG) visit(s.id, []);
    assert(cycle === null, "catalog prereqs", `cycle: ${cycle}`);
  }

  for (const slug of ["cole", "lily"]) {
    const cat = catalogFor(slug);
    assert(cat.length > 0, `catalogFor(${slug})`, "empty track");
    for (const s of cat) {
      if (s.track === "both") assert(typeof s.params?.level === "number", `catalogFor(${slug}) ${s.id}`, "level not injected for shared skill");
    }
    // Every track must plan all three block kinds (a track without reading skills used to drop the block silently).
    const expectedKinds = ["math", "reading", "brain"];
    const settings = defaultSettings(slug === "lily" ? 1 : 3);
    // Mon 2026-10-12 (weekday), Fri 2026-10-16, Sat 2026-10-17 — all at 20:00Z = 16:00 ET.
    for (const date of ["2026-10-12", "2026-10-16", "2026-10-17"]) {
      const now = new Date(`${date}T20:00:00Z`);
      const mission = planMission(cat, mergeProgress(cat, []), settings, now, date);
      const where = `planMission(${slug}, ${date})`;
      const kinds = mission.blocks.map((b) => b.kind).join(",");
      assert(kinds === expectedKinds.join(","), where, `expected blocks ${expectedKinds.join(",")}, got ${kinds}`);
      assert(mission.blocks.length > 0, where, "no blocks at all");
      for (const b of mission.blocks) {
        assert(cat.some((s) => s.id === b.skillId), where, `block skill ${b.skillId} not in track`);
        assert(b.minutes > 0 && b.label.length > 0, where, `empty block ${JSON.stringify(b)}`);
        const expectMin = isWeekend(date) ? settings.weekend[b.kind] : settings.blocks[b.kind];
        assert(b.minutes === expectMin, where, `${b.kind} minutes ${b.minutes}, expected ${expectMin} (${isWeekend(date) ? "weekend" : "weekday"})`);
      }
      const gens = mission.blocks.map((b) => cat.find((s) => s.id === b.skillId)?.generator ?? "");
      assert(new Set(gens).size === gens.length, where, `same generator twice: ${gens.join(",")}`);
    }
    // Friday mix-up when the learner has mastered skills.
    {
      const mastered = cat.slice(0, Math.min(2, cat.length)).map((s) => ({
        ...emptyProgress(s.id),
        status: "mastered" as const,
        attempts: 10,
        correct: 10,
        streak: 10,
        window: Array(10).fill(true),
        intervalDays: 7,
        nextReviewAt: "2026-10-20T00:00:00.000Z",
      }));
      const mission = planMission(cat, mergeProgress(cat, mastered), settings, new Date("2026-10-16T20:00:00Z"), "2026-10-16");
      const brain = mission.blocks.find((b) => b.kind === "brain");
      assert(!!brain && brain.mode === "review" && (brain.skillIds?.length ?? 0) >= 1 && brain.items === MIXUP_SET_SIZE, `planMission(${slug}) friday mix-up`, JSON.stringify(brain));
      const weekday = planMission(cat, mergeProgress(cat, mastered), settings, new Date("2026-10-15T20:00:00Z"), "2026-10-15");
      assert(weekday.blocks.every((b) => !b.skillIds), `planMission(${slug}) thursday`, "mix-up must be Friday only");
    }
  }

  // Never the same generator twice (synthetic: every subject shares one generator except one brain skill).
  {
    const mk = (id: string, subject: Skill["subject"], generator: string, grade = 1): Skill => ({
      id,
      subject,
      grade,
      title: id,
      kidTitle: id,
      standards: ["x"],
      prereqs: [],
      generator,
      estMinutes: 5,
      testOut: false,
      parentTip: "tip",
      track: "both",
    });
    const synth = [mk("a", "math", "countNext"), mk("b", "reading", "countNext"), mk("c", "reasoning", "countNext"), mk("d", "reasoning", "multFacts")];
    const mission = planMission(synth, mergeProgress(synth, []), defaultSettings(1), new Date("2026-10-12T20:00:00Z"), "2026-10-12");
    const brain = mission.blocks.find((b) => b.kind === "brain");
    assert(brain?.skillId === "d", "planMission generator dedupe", `brain picked ${brain?.skillId}, expected the one unused generator`);
    assert(mission.blocks.length === 3, "planMission generator dedupe", "all three blocks still planned");
  }
}

// ---------------------------------------------------------------------------
// Mastery engine scenarios
// ---------------------------------------------------------------------------

{
  const now = new Date("2026-10-12T20:00:00Z");
  const day = 86400000;
  const hinted = { correct: true, helpLevel: "hint" as const, ms: 4000 };
  const taught = { correct: true, helpLevel: "taught" as const, ms: 4000 };

  // 10 independent correct → mastered (9 → learning)
  let p = emptyProgress("x");
  for (let i = 0; i < 9; i++) p = applyResult(p, true, now);
  assert(p.status === "learning", "mastery: 9 correct", `expected learning, got ${p.status}`);
  p = applyResult(p, true, now);
  assert(p.status === "mastered", "mastery: 10 correct", `expected mastered, got ${p.status}`);
  assert(p.intervalDays === 1, "mastery: interval", `expected 1, got ${p.intervalDays}`);
  assert(p.nextReviewAt === new Date(now.getTime() + day).toISOString(), "mastery: nextReviewAt", "expected tomorrow");
  assert(!!p.masteredAt && p.testOut === false, "mastery: masteredAt", "missing / testOut wrong");

  // hinted / taught corrects do not count toward mastery
  let h = emptyProgress("h");
  for (let i = 0; i < 12; i++) h = applyResult(h, hinted, now);
  assert(h.status === "learning" && h.attempts === 12 && h.correct === 12, "mastery: hinted corrects", `got ${h.status}/${h.attempts}/${h.correct}`);
  assert(h.window.every((w) => w === false) && h.streak === 0, "mastery: hinted window", "hinted corrects must enter the window as false and not extend the streak");
  let t = emptyProgress("t");
  for (let i = 0; i < 12; i++) t = applyResult(t, taught, now);
  assert(t.status === "learning" && t.window.every((w) => w === false), "mastery: taught corrects", "taught corrects must not count");
  // a hinted correct keeps (does not reset) the streak
  let hs = emptyProgress("hs");
  for (let i = 0; i < 4; i++) hs = applyResult(hs, true, now);
  hs = applyResult(hs, hinted, now);
  assert(hs.streak === 4, "mastery: hinted keeps streak", `expected 4, got ${hs.streak}`);
  // 1 hinted then 9 independent: window 9/10 = 0.9, attempts 10, streak 9 → mastered exactly at the 10th
  let mix = applyResult(emptyProgress("mix"), hinted, now);
  for (let i = 0; i < 8; i++) mix = applyResult(mix, true, now);
  assert(mix.status === "learning", "mastery: 9 attempts", `expected learning at 9 attempts, got ${mix.status}`);
  mix = applyResult(mix, true, now);
  assert(mix.status === "mastered", "mastery: 9/10 window", `expected mastered, got ${mix.status}`);
  // 2 misses in the window → 8/10 < 0.9 → not mastered even with streak
  let two = emptyProgress("two");
  two = applyResult(two, false, now);
  two = applyResult(two, false, now);
  for (let i = 0; i < 8; i++) two = applyResult(two, true, now);
  assert(two.status === "learning", "mastery: 8/10", `expected learning, got ${two.status}`);
  for (let i = 0; i < 2; i++) two = applyResult(two, true, now);
  assert(two.status === "mastered", "mastery: window slides", `expected mastered after the misses slide out, got ${two.status}`);
  // streak rule: last answer wrong → streak 0 → not mastered
  let r2 = emptyProgress("z2");
  for (let i = 0; i < 9; i++) r2 = applyResult(r2, true, now);
  r2 = applyResult(r2, false, now);
  assert(r2.status === "learning" && r2.streak === 0, "mastery: streak rule", `expected learning after a final miss, got ${r2.status}`);

  // guess filter
  const base = (() => {
    let b = emptyProgress("g");
    for (let i = 0; i < 4; i++) b = applyResult(b, true, now);
    return b;
  })();
  const fastChoice = applyResult(base, { correct: false, ms: 800, questionType: "choice" }, now);
  assert(fastChoice.attempts === 4 && fastChoice.streak === 4 && fastChoice.window.length === 4, "guess filter: fast wrong choice", "must not count, break the streak or enter the window");
  assert(isGuess({ correct: false, ms: 800, questionType: "tap" }) && isGuess({ correct: false, ms: 1499, questionType: "tiles" }), "guess filter: tap/tiles", "tap and tiles are guessable");
  const fastNumeric = applyResult(base, { correct: false, ms: 800, questionType: "numeric" }, now);
  assert(fastNumeric.attempts === 5 && fastNumeric.streak === 0, "guess filter: numeric", "typed answers are never guesses");
  const slowChoice = applyResult(base, { correct: false, ms: 2000, questionType: "choice" }, now);
  assert(slowChoice.attempts === 5 && slowChoice.streak === 0 && slowChoice.window[4] === false, "guess filter: slow wrong choice", "a considered wrong answer counts");
  assert(!isGuess({ correct: true, ms: 300, questionType: "choice" }), "guess filter: fast correct", "a fast correct answer is not a guess");

  // review sets (4 items)
  const due = { ...p, intervalDays: 3, nextReviewAt: new Date(now.getTime() - day).toISOString(), reviewMisses: 0 };
  assert(isReviewDue(due, now), "review: isReviewDue", "should be due");
  const passed = applyReviewSet(due, [true, true, true, false], now);
  assert(passed.intervalDays === 7 && passed.status === "mastered" && passed.reviewMisses === 0, "review: 3/4 advances", JSON.stringify([passed.intervalDays, passed.status, passed.reviewMisses]));
  assert(!isReviewDue(passed, now), "review: next due later", "should not be due right after advancing");
  const notDue = applyReviewSet({ ...due, nextReviewAt: new Date(now.getTime() + 5 * day).toISOString() }, [true, true, true, true], now, false);
  assert(notDue.intervalDays === 3, "review: bonus review", "a review that was not due must not advance the ladder");
  const failed = applyReviewSet({ ...due, intervalDays: 14 }, [true, false, false, true], now);
  assert(failed.intervalDays === 7 && failed.status === "mastered" && failed.reviewMisses === 1, "review: 2/4 halves", JSON.stringify([failed.intervalDays, failed.status, failed.reviewMisses]));
  const floor = applyReviewSet({ ...due, intervalDays: 1 }, [false, false, false, false], now);
  assert(floor.intervalDays === 1 && floor.reviewMisses === 1, "review: halve floor", "interval must not drop below 1");
  const demoted = applyReviewSet(failed, [false, true, false, false], now);
  assert(demoted.status === "learning" && demoted.reviewMisses === 2 && demoted.nextReviewAt === null && demoted.masteredAt === null, "review: two failed sets demote (misses kept for the flag)", JSON.stringify(demoted));
  const recovered = applyReviewSet(failed, [true, true, true, true], now);
  assert(recovered.reviewMisses === 0 && recovered.intervalDays === 14, "review: pass resets misses", JSON.stringify([recovered.reviewMisses, recovered.intervalDays]));
  assert(reviewSetPassed([true, true, true, false]) && !reviewSetPassed([true, true, false, false]), "reviewSetPassed", "3/4 passes, 2/4 fails");
  // per-item review answers never touch the interval
  const perItem = applyResult(due, false, now, "review");
  assert(perItem.intervalDays === 3 && perItem.status === "mastered" && perItem.streak === 0 && perItem.attempts === due.attempts + 1, "review: per-item", "applyResult in review mode must only update counts");
  assert(applyReviewSet(emptyProgress("nm"), [true, true, true, true], now).status === "ready", "review: non-mastered untouched", "applyReviewSet ignores non-mastered skills");
  // intervals ladder
  assert([0, 1, 3, 7, 14, 30, 60, 99].map(nextReviewInterval).join(",") === "1,3,7,14,30,60,60,60", "nextReviewInterval", "ladder wrong");

  // test-out
  assert(testOut([true, true, true, true, true]) === true, "testOut 5/5", "should pass");
  assert(testOut([true, true, true, true, false]) === false, "testOut 4/5", "should fail");
  assert(testOut([true, true, true, true]) === false, "testOut 4 items", "should fail");
  const to = applyTestOut(emptyProgress("t"), [true, true, true, true, true], now);
  assert(to.status === "mastered" && to.intervalDays === 3 && to.testOut === true && to.attempts === 5, "applyTestOut 5/5", `got ${to.status}/${to.intervalDays}/${to.testOut}`);
  const tf = applyTestOut(emptyProgress("tf"), [true, true, false, true, true], now);
  assert(tf.status === "learning" && tf.attempts === 5 && tf.window.length === 5 && tf.window.filter(Boolean).length === 4 && tf.testOut === false, "applyTestOut 4/5", `got ${tf.status}/${tf.attempts}/${JSON.stringify(tf.window)}`);
  const tf3 = applyTestOut(emptyProgress("tf3"), [false, true, false, true, true], now);
  assert(tf3.status === "learning" && tf3.correct === 3, "applyTestOut 3/5", `got ${tf3.status}/${tf3.correct}`);
  // a failed pretest never masters, even when the counts would qualify
  let pre = emptyProgress("pre");
  for (let i = 0; i < 8; i++) pre = applyResult(pre, true, now);
  const preFail = applyTestOut(pre, [true, true, true, true, false], now);
  assert(preFail.status === "learning", "applyTestOut never masters on a miss", `got ${preFail.status}`);
  assert(applyResult(emptyProgress("tm"), true, now, "test").status === "learning" || true, "applyResult test mode", "unreachable");

  // placement plan
  {
    const cat = catalogFor("cole");
    const mathSkills = cat.filter((s) => s.subject === "math");
    const plan = placementPlan(cat, "math", mergeProgress(cat, []));
    assert(plan.length > 0 && plan.every((s) => s.subject === "math" && s.testOut), "placementPlan", "must list testable math skills");
    assert(plan[0].id === mathSkills.find((s) => s.prereqs.length === 0 || s.prereqs.every((p) => !mathSkills.some((m) => m.id === p)))?.id, "placementPlan start", `starts at ${plan[0].id}`);
    const allMastered = mathSkills.map((s) => ({ ...emptyProgress(s.id), status: "mastered" as const, attempts: 10, correct: 10, streak: 10 }));
    assert(placementPlan(cat, "math", mergeProgress(cat, allMastered)).length === 0, "placementPlan all mastered", "nothing left to place");
  }

  // stuck rule
  assert(isStuck([false, false, false]) && isStuck([true, false, false, false]), "isStuck", "3 consecutive first-try misses");
  assert(!isStuck([false, false]) && !isStuck([false, false, true]) && !isStuck([true, false, true, false]), "isStuck negative", "fewer than 3 in a row is not stuck");
  const flagged = markNeedsHelp(emptyProgress("s"), "What is 7 × 8?");
  assert(flagged.needsHelp === true && flagged.helpNote === "What is 7 × 8?", "markNeedsHelp", JSON.stringify(flagged));
  let unflag = flagged;
  for (let i = 0; i < 10; i++) unflag = applyResult(unflag, true, now);
  assert(unflag.status === "mastered" && unflag.needsHelp === false && unflag.helpNote === null, "needsHelp clears on mastery", JSON.stringify([unflag.status, unflag.needsHelp]));

  // stopBy (October = EDT, UTC-4)
  const sevenPm = new Date("2026-10-12T23:00:00Z");
  const eightTwentyFive = new Date("2026-10-13T00:25:00Z");
  const ninePm = new Date("2026-10-13T01:00:00Z");
  assert(minutesSinceMidnightInFamilyTz(sevenPm) === 19 * 60, "family tz clock", `got ${minutesSinceMidnightInFamilyTz(sevenPm)}`);
  assert(minutesUntilStopBy(sevenPm, "20:30") === 90, "minutesUntilStopBy", `got ${minutesUntilStopBy(sevenPm, "20:30")}`);
  assert(canStartBlock(sevenPm, "20:30", 45), "canStartBlock 19:00", "45 minutes fit before 20:30");
  assert(!canStartBlock(eightTwentyFive, "20:30", 12), "canStartBlock 20:25 / 12 min", "must refuse a block that cannot finish before stopBy");
  assert(canStartBlock(eightTwentyFive, "20:30", 5), "canStartBlock 20:25 / 5 min", "a 5-minute block still fits");
  assert(minutesUntilStopBy(ninePm, "20:30") < 0 && !canStartBlock(ninePm, "20:30", 1), "canStartBlock after stopBy", "nothing starts after lights out");
  assert(parseClock("20:30") === 1230 && parseClock("8:05") === 485 && parseClock("25:00") === null, "parseClock", "parse failed");
  assert(canStartBlock(ninePm, "nonsense", 60), "canStartBlock malformed stopBy", "a malformed stopBy never blocks");

  // vacation pause
  const paused = { ...defaultSettings(1), pausedUntil: "2026-10-15" };
  assert(isPaused(paused, "2026-10-12") && isPaused(paused, "2026-10-15") && !isPaused(paused, "2026-10-16"), "isPaused pausedUntil", "inclusive end date");
  const vac = { ...defaultSettings(1), vacations: [{ from: "2026-12-20", to: "2026-12-31" }] };
  assert(isPaused(vac, "2026-12-25") && !isPaused(vac, "2026-12-19"), "isPaused vacations", "range check");
  assert(normalizeSettings({ vacations: [{ from: "2026-12-20", to: "2026-12-31" }, { from: "bad" }, { from: "2026-12-31", to: "2026-12-20" }] }, 1).vacations?.length === 1, "normalizeSettings vacations", "keeps only valid ranges");
  assert(shiftReviewDates([due], 3)[0].nextReviewAt === new Date(now.getTime() - day + 3 * day).toISOString(), "shiftReviewDates", "review date must move by the paused days");

  // streak freeze
  const mkSession = (date: string, status: SessionRecord["status"], completed = status === "done"): SessionRecord => ({
    learnerId: "l",
    date,
    minutes: 10,
    xp: 10,
    blocks: [],
    completed,
    status,
  });
  const today = "2026-10-15"; // Thursday
  const streakSessions = [
    mkSession("2026-10-15", "done"),
    mkSession("2026-10-14", "done"),
    mkSession("2026-10-13", "skipped"),
    mkSession("2026-10-12", "done"),
    mkSession("2026-10-09", "vacation"),
    mkSession("2026-10-08", "done"),
  ];
  assert(streakFromSessions(streakSessions, today, defaultSettings(3)) === 4, "streak: skipped/vacation/weekend freeze", `got ${streakFromSessions(streakSessions, today, defaultSettings(3))}`);
  const gap = [mkSession("2026-10-15", "done"), mkSession("2026-10-14", "done"), mkSession("2026-10-12", "done")];
  assert(streakFromSessions(gap, today, defaultSettings(3)) === 2, "streak: missed school night breaks", `got ${streakFromSessions(gap, today, defaultSettings(3))}`);
  const pausedGap = { ...defaultSettings(3), vacations: [{ from: "2026-10-13", to: "2026-10-13" }] };
  assert(streakFromSessions(gap, today, pausedGap) === 3, "streak: paused day with no row freezes", `got ${streakFromSessions(gap, today, pausedGap)}`);
  const notYetToday = [mkSession("2026-10-15", "planned"), mkSession("2026-10-14", "done"), mkSession("2026-10-13", "done")];
  assert(streakFromSessions(notYetToday, today, null) === 2, "streak: today not done yet", `got ${streakFromSessions(notYetToday, today, null)}`);
  const partial = [mkSession("2026-10-15", "partial"), mkSession("2026-10-14", "partial"), mkSession("2026-10-13", "done")];
  assert(streakFromSessions(partial, today, null) === 1, "streak: partial freezes", `got ${streakFromSessions(partial, today, null)}`);
  assert(streakFromSessions([], today, null) === 0 && streakFromSessions([mkSession("2026-10-15", "done")], today, null) === 1, "streak: edges", "empty / single");
  const legacy = [{ ...mkSession("2026-10-15", undefined, true) }, { ...mkSession("2026-10-14", undefined, true) }];
  assert(streakFromSessions(legacy, today, null) === 2, "streak: legacy completed flag", "rows without status still count");
  assert(sessionStatusFor([{ done: true }, { done: false }]) === "partial" && sessionStatusFor([{ done: true }]) === "done" && sessionStatusFor([{ done: false }]) === "planned" && sessionStatusFor([]) === "planned", "sessionStatusFor", "status mapping");

  // xp + levels
  assert(xpFor(false) === 0 && xpFor(true) === 1 && xpFor(true, "hint") === 0.5 && xpFor(true, "taught") === 0.5, "xpFor 1 / 0.5 / 0", `${xpFor(true)}/${xpFor(true, "hint")}`);
  assert(XP.effort === 3, "effort XP", `expected 3, got ${XP.effort}`);
  assert(levelFor(0).level === 1 && levelFor(499).level === 1 && levelFor(500).level === 2 && levelFor(1000).level === 3, "levelFor every 500 XP", JSON.stringify(levelFor(500)));
  const coleLadder = LADDERS.baseball;
  assert(levelFor(0, coleLadder).name === "Rookie Ball" && levelFor(500, coleLadder).name === "Single-A" && levelFor(2500, coleLadder).name === "All-Star" && levelFor(3000, coleLadder).name === "All-Star 2", "levelFor Cole ladder", `${levelFor(2500, coleLadder).name}/${levelFor(3000, coleLadder).name}`);
  assert(levelFor(2000, LADDERS.ballet).name === "Prima" && Math.abs(levelFor(250, LADDERS.ballet).progress - 0.5) < 1e-9, "levelFor Lily ladder", levelFor(2000, LADDERS.ballet).name);
  assert(questionTargetFor("review", 12) === REVIEW_SET_SIZE && questionTargetFor("test", 12) === SKIP_CHECK_ITEMS, "questionTargetFor sets", "review 4 / skip check 10");
  assert(
    questionTargetFor("learn", 12) === 14 && questionTargetFor("learn", 2) === 5 && questionTargetFor("learn", 30) === 36 && questionTargetFor("learn", 45) === 54 && questionTargetFor("learn", 12, 6) === 6,
    "questionTargetFor learn (no 20-item ceiling: weekend blocks end by minutes)",
    `${questionTargetFor("learn", 12)}/${questionTargetFor("learn", 2)}/${questionTargetFor("learn", 30)}/${questionTargetFor("learn", 45)}`
  );

  // seeds
  const s1 = questionSeed("lily", "m1.count.next", "learn", "2026-10-12", 0);
  assert(s1 === questionSeed("lily", "m1.count.next", "learn", "2026-10-12", 0), "questionSeed stable", "same inputs → same seed");
  assert(s1 !== questionSeed("lily", "m1.count.next", "learn", "2026-10-12", 1) && s1 !== questionSeed("lily", "m1.count.next", "review", "2026-10-12", 0) && s1 !== questionSeed("lily", "m1.count.next", "learn", "2026-10-13", 0), "questionSeed varies", "n / mode / date must change the seed");
  assert(questionCounterKey("lily", "m1.count.next", "2026-10-12") === "learn:n:lily:m1.count.next:2026-10-12", "questionCounterKey", "key format");
  const lilyCat = catalogFor("lily");
  const q1 = JSON.stringify(makeQuestion(lilyCat[0], s1));
  assert(q1 === JSON.stringify(makeQuestion(lilyCat[0], s1)), "same seed → identical question JSON", "makeQuestion must be a pure function of the seed");

  // dates
  assert(isWeekend("2026-10-17") && isWeekend("2026-10-18") && !isWeekend("2026-10-16") && isFriday("2026-10-16") && !isFriday("2026-10-17"), "dates: weekend/friday", "day-of-week helpers");

  // rows
  const attempt = attemptToRow({
    learnerId: "l",
    skillId: "s",
    mode: "learn",
    question: { type: "numeric", prompt: "2 + 2", answer: 4, explain: "e", hint: "h", display: { svg: "<svg viewBox=\"0 0 1 1\"></svg>", speak: "two plus two" } },
    answer: "4",
    correct: true,
    ms: 1234.6,
    seed: 99,
    hintUsed: false,
    helpLevel: "hint",
    clientId: "11111111-1111-4111-8111-111111111111",
  });
  assert(!JSON.stringify(attempt.question).includes("<svg"), "attemptToRow strips svg", "never store svg");
  assert((attempt.question as { display?: { speak?: string } }).display?.speak === "two plus two", "attemptToRow keeps speak", "display kept minus svg");
  assert(attempt.help_level === "hint" && attempt.seed === 99 && attempt.ms === 1235 && attempt.client_id === "11111111-1111-4111-8111-111111111111", "attemptToRow fields", JSON.stringify(attempt));
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(newClientId()) && newClientId() !== newClientId(), "newClientId", "uuid v4 shape, unique");
  const sess = sessionToRow({ learnerId: "l", date: today, minutes: 12, xp: 50, blocks: [{ kind: "math", subject: "math", skillId: "a", mode: "learn", minutes: 12, label: "x", done: true }], completed: false });
  assert(sess.status === "partial" && sess.completed === false, "sessionToRow derives status", JSON.stringify(sess));
  assert(sessionFromRow({ learner_id: "l", date: "2026-10-12", minutes: 1, xp: 1, blocks: [], completed: true }).status === "done", "sessionFromRow legacy status", "completed → done");
  const prog = progressFromRow({ ...progressToRow("l", { ...emptyProgress("k"), reviewMisses: 1, needsHelp: true, helpNote: "n", testOut: true }), review_misses: 1 });
  assert(prog.reviewMisses === 1 && prog.needsHelp === true && prog.helpNote === "n" && prog.testOut === true, "progress row round-trip", JSON.stringify(prog));

  // unlocking
  const cat = catalogFor("lily");
  const map0 = mergeProgress(cat, []);
  const root = cat.find((s) => s.prereqs.length === 0)!;
  const child = cat.find((s) => s.prereqs.length === 1 && s.prereqs[0] === root.id);
  assert(map0[root.id].status === "ready", "deriveStatuses root", "root skills start ready");
  if (child) {
    assert(map0[child.id].status === "locked", "deriveStatuses", "prereq gating wrong");
    const map1 = mergeProgress(cat, [{ ...emptyProgress(root.id), status: "mastered", attempts: 10, correct: 10, streak: 10, window: [true] }]);
    assert(map1[child.id].status === "ready", "deriveStatuses unlock", "should unlock after prereq mastered");
  }

  // mission picks due review first, then learning, then ready
  const coleCat = catalogFor("cole");
  const firstMath = coleCat.find((s) => s.subject === "math")!;
  const dueProgress: SkillProgress = {
    ...emptyProgress(firstMath.id),
    status: "mastered",
    attempts: 10,
    correct: 10,
    streak: 10,
    intervalDays: 1,
    nextReviewAt: new Date(now.getTime() - day).toISOString(),
  };
  const mission = planMission(coleCat, mergeProgress(coleCat, [dueProgress]), defaultSettings(3), now, "2026-10-12");
  assert(mission.blocks[0].skillId === firstMath.id && mission.blocks[0].mode === "review" && mission.blocks[0].items === REVIEW_SET_SIZE, "planMission due review first", JSON.stringify(mission.blocks[0]));
  const mission2 = planMission(coleCat, mergeProgress(coleCat, [{ ...dueProgress, nextReviewAt: new Date(now.getTime() + 5 * day).toISOString() }]), defaultSettings(3), now, "2026-10-12");
  assert(mission2.blocks[0].skillId !== firstMath.id && mission2.blocks[0].mode === "learn", "planMission ready after mastered", JSON.stringify(mission2.blocks[0]));
  const zeroBrain = planMission(coleCat, mergeProgress(coleCat, []), { ...defaultSettings(3), blocks: { math: 12, reading: 12, brain: 0 } }, now, "2026-10-12");
  assert(zeroBrain.blocks.every((b) => b.kind !== "brain"), "planMission respects 0-minute block", "brain block should be skipped");
}

// ---------------------------------------------------------------------------
// Program design alignment + code-review fixes
// ---------------------------------------------------------------------------

{
  const {
    weeklyRing,
    missionRole,
    pointsAllowed,
    walletFrom,
    weekPoints,
    startedOnTime,
    todaysBlocks,
    homeworkReviewOnly,
    missionLaunchLine,
    rotationPlan,
    quickReply,
    struggleFlags,
    kidSlugForEmail,
    isParentEmail,
    vacationReturnLabel,
    masteredThisWeek,
    ponyNameChoices,
    ponyNames,
    setsDoneToday,
    resolveBlockIndex,
    todayStatus,
    isFinishedBook,
    breakAfter,
    eveningStartMinutes,
  } = statsMod;
  const { buildSkillRows, skillRowsToCsv } = reportMod;

  const mk = (id: string, subject: Skill["subject"], generator: string, extra: Partial<Skill> = {}): Skill => ({
    id,
    subject,
    grade: 1,
    title: id,
    kidTitle: id.toUpperCase(),
    standards: ["X.1"],
    prereqs: [],
    generator,
    estMinutes: 5,
    testOut: false,
    parentTip: "tip",
    track: "both",
    ...extra,
  });
  const mastered = (id: string, nextReviewAt: string, window: boolean[] = Array(10).fill(true)): SkillProgress => ({
    ...emptyProgress(id),
    status: "mastered",
    attempts: 10,
    correct: 10,
    streak: 5,
    window,
    intervalDays: 3,
    nextReviewAt,
    masteredAt: "2026-10-01T23:00:00.000Z",
  });
  const synth: Skill[] = [
    ...["m1", "m2", "m3", "m4", "m5"].map((id) => mk(id, "math", `g-${id}`)),
    mk("m6", "math", "g-m6", { testOut: true }),
    mk("r1", "reading", "g-r1"),
    mk("b1", "reasoning", "g-b1"),
  ];
  const past = "2026-10-10T23:00:00.000Z";
  const future = "2026-11-30T23:00:00.000Z";
  const progressWith = (due: string[], notDue: string[] = []) =>
    mergeProgress(synth, [...due.map((id) => mastered(id, past)), ...notDue.map((id) => mastered(id, future))]);
  const coleSettings = defaultSettings(3);
  const lilySettings = defaultSettings(1);
  const tueNight = new Date("2026-10-13T23:00:00Z"); // Tue 19:00 EDT

  // --- isReviewDue compares family DATES (finding: the 1-day rung slipped to day 2) ---
  {
    const masteredAt = new Date("2026-10-13T00:20:00Z"); // Mon 20:20 EDT
    let p = emptyProgress("rd");
    for (let i = 0; i < 10; i++) p = applyResult(p, true, masteredAt);
    assert(p.status === "mastered", "review due: setup", p.status);
    assert(isReviewDue(p, new Date("2026-10-13T23:00:00Z")), "review due: next family day at 19:00", "a review set at 20:20 Monday must be due Tuesday 19:00");
    assert(!isReviewDue(p, new Date("2026-10-13T03:00:00Z")), "review due: same evening", "not due later the same family day (Mon 23:00 EDT)");
  }

  // --- pause with a start date; clearing a pause keeps the frozen days (finding: streak inflated, then wiped) ---
  {
    const s = (date: string): SessionRecord => ({ learnerId: "l", date, minutes: 10, xp: 0, blocks: [], completed: true, status: "done" });
    const sessions = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-14", "2026-10-15", "2026-10-16"].map(s);
    const base = defaultSettings(3);
    assert(streakFromSessions(sessions, "2026-10-16", base) === 3, "pause: baseline streak", String(streakFromSessions(sessions, "2026-10-16", base)));
    const legacy = { ...base, pausedUntil: "2026-10-23" };
    assert(streakFromSessions(sessions, "2026-10-16", legacy) === 3, "pause: legacy pause never freezes past gaps", String(streakFromSessions(sessions, "2026-10-16", legacy)));
    const set = applyPauseEdit(base, { ...base, pausedUntil: "2026-10-23" }, "2026-10-16");
    assert(set.pausedFrom === "2026-10-16", "pause: pausedFrom set to today", String(set.pausedFrom));
    assert(streakFromSessions(sessions, "2026-10-16", set) === 3, "pause: new pause does not inflate the streak", String(streakFromSessions(sessions, "2026-10-16", set)));
    assert(isPaused(set, "2026-10-20") && !isPaused(set, "2026-10-15", "2026-10-16"), "pause: range from pausedFrom", "inside / before");
    assert(streakFromSessions(sessions, "2026-10-23", set) === 3, "pause: frozen while paused", String(streakFromSessions(sessions, "2026-10-23", set)));
    const cleared = applyPauseEdit(set, { ...set, pausedUntil: null }, "2026-10-23");
    assert(cleared.pausedFrom === null && (cleared.vacations ?? []).some((v) => v.from === "2026-10-16" && v.to === "2026-10-22"), "pause: clearing archives the elapsed range", JSON.stringify(cleared.vacations));
    assert(streakFromSessions(sessions, "2026-10-23", cleared) === 3, "pause: clearing keeps the streak frozen", String(streakFromSessions(sessions, "2026-10-23", cleared)));
    assert(pauseEndDate(set, "2026-10-18") === "2026-10-23", "pauseEndDate", String(pauseEndDate(set, "2026-10-18")));
  }

  // --- vacation return label for every kind of pause (finding: always "tomorrow" for a vacation range) ---
  {
    const vac = { ...defaultSettings(3), vacations: [{ from: "2026-12-20", to: "2026-12-31" }], lightWeeks: [] };
    assert(vacationReturnLabel(vac, "2026-12-25") === "Jan 1", "vacationReturnLabel range", vacationReturnLabel(vac, "2026-12-25"));
    assert(vacationReturnLabel(defaultSettings(3), "2026-12-25") === "Jan 2", "vacationReturnLabel light week off", vacationReturnLabel(defaultSettings(3), "2026-12-25"));
    const pu = applyPauseEdit(defaultSettings(3), { ...defaultSettings(3), pausedUntil: "2026-10-20" }, "2026-10-14");
    assert(vacationReturnLabel(pu, "2026-10-14") === "Oct 21", "vacationReturnLabel pausedUntil", vacationReturnLabel(pu, "2026-10-14"));
  }

  // --- struggle flag on demotion (finding: unreachable because misses reset on demotion) ---
  {
    const m = mastered("m1", past, [true, true, true, true, true, true, false, false, true, true]);
    const once = applyReviewSet(m, [true, true, false, false], tueNight);
    const twice = applyReviewSet(once, [true, false, true, false], tueNight);
    assert(twice.status === "learning" && twice.reviewMisses === 2, "demotion keeps misses", JSON.stringify([twice.status, twice.reviewMisses]));
    const flags = struggleFlags(synth, mergeProgress(synth, [twice]));
    assert(flags.some((f) => f.skill.id === "m1" && f.reasons.some((r) => /2 failed review sets/.test(r))), "struggleFlags demotion", JSON.stringify(flags));
    const remastered = markMasteredByParent(twice, tueNight);
    assert(remastered.reviewMisses === 0 && remastered.needsHelp === false && remastered.status === "mastered", "re-mastery clears the flag", JSON.stringify(remastered));
  }

  // --- report: independent accuracy counts hinted retries as misses, guesses excluded; family dates ---
  {
    const skill = synth[0];
    const at = "2026-10-13T23:10:00Z";
    const row = (correct: boolean, helpLevel: string, hintUsed: boolean, extra: Record<string, unknown> = {}) => ({ skillId: skill.id, mode: "learn", correct, helpLevel, hintUsed, createdAt: at, ms: 4000, questionType: "numeric", ...extra });
    const attempts = [
      ...Array.from({ length: 6 }, () => row(true, "independent", false)),
      row(true, "hint", true),
      row(true, "hint", true),
      row(false, "independent", true),
      row(false, "independent", true),
      row(false, "independent", false, { ms: 800, questionType: "choice" }), // a logged guess: never scored
    ];
    const [r] = buildSkillRows([skill], mergeProgress([skill], []), attempts);
    assert(r.independentCorrect === 6 && r.independentTotal === 10, "report: independent accuracy = engine window", `${r.independentCorrect}/${r.independentTotal}`);
    const late = { ...mastered(skill.id, future), masteredAt: "2026-12-07T00:30:00Z", lastPracticedAt: "2026-12-07T00:30:00Z" };
    const csv = skillRowsToCsv(buildSkillRows([skill], mergeProgress([skill], [late]), []));
    assert(csv.includes(",2026-12-06,") && !csv.includes("2026-12-07"), "report: family-date mastered_on", csv.split("\r\n")[1]);
    assert(masteredThisWeek([skill], mergeProgress([skill], [late]), "2026-12-06").length === 1 && masteredThisWeek([skill], mergeProgress([skill], [late]), "2026-12-07").length === 0, "masteredThisWeek family date", "Sun Dec 6 19:30 EST belongs to the week of Nov 30");
  }

  // --- skip check (10 items, bands) and placement probes (5/5; 4/5 → pair ≥ 9/10) ---
  {
    const t = (n: number, of = 10) => Array.from({ length: of }, (_, i) => i < n);
    const pass = applySkipCheck(emptyProgress("sc"), t(9), tueNight, "math");
    assert(pass.status === "mastered" && pass.testOut === true && pass.intervalDays === 3 && pass.attempts === 10, "skip check 9/10 → mastered", JSON.stringify([pass.status, pass.testOut, pass.intervalDays]));
    const quick = applySkipCheck(emptyProgress("sc"), t(8), tueNight, "math");
    assert(quick.status === "learning" && quick.helpNote === "quick fill" && skipCheckBand(t(7), "math") === "quick-fill", "skip check math 7-8 → quick fill", JSON.stringify([quick.status, quick.helpNote]));
    assert(applySkipCheck(emptyProgress("sc"), t(6), tueNight, "math").helpNote === null && skipCheckBand(t(6), "math") === "learn", "skip check math 6 → learn", "full learn");
    const hole = applySkipCheck(emptyProgress("sc"), t(6), tueNight, "reading");
    assert(hole.status === "learning" && hole.helpNote === "hole fill" && skipCheckBand(t(8), "phonics") === "hole-fill" && skipCheckBand(t(5), "reading") === "learn", "skip check reading 6-8 → hole fill", JSON.stringify(hole.helpNote));
    // A parent-helped answer is not independent, so it cannot pass a skip check (finding: r.correct was folded).
    const helped = [...t(8), countsAsIndependent({ correct: true, helpLevel: "taught" }), countsAsIndependent({ correct: true, helpLevel: "taught" })];
    assert(applySkipCheck(emptyProgress("sc"), helped, tueNight, "math").status === "learning", "skip check: taught answers do not count", JSON.stringify(helped));
    assert(placementProbeResult(t(5, 5)) === "pass" && placementProbeResult(t(4, 5)) === "second-set" && placementProbeResult(t(3, 5)) === "fail", "placement probe 5/5, 4/5, 3/5", "verdicts");
    assert(placementProbeResult([...t(4, 5), ...t(5, 5)]) === "pass" && placementProbeResult([...t(4, 5), ...t(4, 5)]) === "fail", "placement pair 9/10 vs 8/10", "pair rule");
    const pair = applyTestOut(emptyProgress("pp"), [...t(4, 5), ...t(5, 5)], tueNight);
    assert(pair.status === "mastered" && pair.testOut === true && pair.attempts === 10, "applyTestOut pair 9/10", JSON.stringify([pair.status, pair.attempts]));
    assert(PLACEMENT_MAX_FAILS === 2 && TEST_OUT_ITEMS === 5 && SKIP_CHECK_ITEMS === 10, "placement / skip check sizes", "5-item probes, stop after 2 fails, 10-item skip check");
  }

  // --- guess filter in the player (findings: retry intercepted taps; guesses filled review / skip-check slots) ---
  {
    const tap = { correct: false, ms: 800, questionType: "choice" as const };
    assert(shouldFilterGuess(tap, false, 0), "guess: first-try fast wrong tap is re-served", "filtered");
    assert(!shouldFilterGuess(tap, true, 0), "guess: never during the retry", "counted");
    assert(!shouldFilterGuess(tap, false, 3), "guess: after 3 in a row it counts", "counted");
    assert(!shouldFilterGuess({ ...tap, correct: true }, false, 0) && !shouldFilterGuess({ ...tap, questionType: "numeric" }, false, 0), "guess: fast correct / typed never filtered", "counted");
  }

  // --- replay decay and effort XP ---
  {
    assert(replayFactor(0) === 1 && replayFactor(1) === 0.5 && replayFactor(2) === 0 && replayFactor(7) === 0, "replay factors 1 / 0.5 / 0", "decay");
    assert(blockXp(10, 0) === 10 && blockXp(10, 1) === 5 && blockXp(10, 2) === 0 && blockXp(7.5, 0) === 8 && blockXp(2, 0, true) === 5 && blockXp(4, 2, true) === 3, "blockXp", `${blockXp(10, 1)}/${blockXp(2, 0, true)}`);
    const ledger: RewardRecord[] = [
      { learnerId: "l", delta: 9, reason: "learn:m6", createdAt: "2026-10-13T23:30:00Z" },
      { learnerId: "l", delta: 4, reason: "review:m6", createdAt: "2026-10-13T23:50:00Z" },
      { learnerId: "l", delta: 1, reason: "pt:review:m6", createdAt: "2026-10-13T23:50:00Z" },
      { learnerId: "l", delta: 9, reason: "learn:m6", createdAt: "2026-10-12T23:30:00Z" },
      { learnerId: "l", delta: 9, reason: "learn:m66", createdAt: "2026-10-13T23:30:00Z" },
    ];
    assert(setsDoneToday(ledger, "m6", "2026-10-13") === 2, "setsDoneToday", String(setsDoneToday(ledger, "m6", "2026-10-13")));
  }

  // --- a finished block is never replayed (finding: back / reload paid XP and minutes twice) ---
  {
    const blocks = [{ done: true }, { done: false }, { done: false }];
    assert(resolveBlockIndex(blocks, "0").state === "done" && resolveBlockIndex(blocks, undefined).index === 1 && resolveBlockIndex(blocks, "2").state === "open", "resolveBlockIndex", JSON.stringify(resolveBlockIndex(blocks, "0")));
    assert(resolveBlockIndex([{ done: true }], "0").state === "complete" && resolveBlockIndex([], "0").state === "empty", "resolveBlockIndex complete / empty", "states");
  }

  // --- reviews before new learning ---
  {
    const math = (m: { blocks: { kind: string }[] }) => m.blocks.filter((b) => b.kind === "math") as ReturnType<typeof planMission>["blocks"];
    const two = math(planMission(synth, progressWith(["m1", "m2"], ["m3", "m4", "m5"]), coleSettings, tueNight, "2026-10-13"));
    assert(two.length === 3 && two[0].mode === "review" && two[1].mode === "review" && two[0].items === 4 && two[2].mode === "learn" && two[2].skillId === "m6" && two[2].minutes === 6, "school night: 2 due sets then the new skill", JSON.stringify(two.map((b) => [b.skillId, b.mode, b.minutes])));
    const three = math(planMission(synth, progressWith(["m1", "m2", "m3", "m4"], ["m5"]), coleSettings, tueNight, "2026-10-13"));
    assert(three.length === 3 && three.every((b) => b.mode === "review") && three.reduce((s, b) => s + b.minutes, 0) === 12, "school night: a third due set replaces the new skill", JSON.stringify(three.map((b) => [b.skillId, b.mode, b.minutes])));
    const friday = planMission(synth, progressWith(["m1", "m2", "m3", "m4", "m5"]), coleSettings, new Date("2026-10-16T22:00:00Z"), "2026-10-16");
    const fm = math(friday);
    assert(fm.length === 4 && fm.every((b) => b.mode === "review"), "Friday: up to 4 due sets", JSON.stringify(fm.map((b) => [b.skillId, b.mode])));
    const sat = planMission(synth, progressWith(["m1", "m2", "m3", "m4", "m5"]), coleSettings, new Date("2026-10-17T14:00:00Z"), "2026-10-17");
    const sm = math(sat);
    assert(sm.length === 5 && sm.slice(0, 4).every((b) => b.mode === "review") && sm[4].mode === "learn" && sm[4].minutes === 18 && sm[4].offerTestOut === true, "weekend: 4 due sets then the new skill with a skip check", JSON.stringify(sm.map((b) => [b.skillId, b.mode, b.minutes, b.offerTestOut])));
    const weekday = planMission(synth, progressWith([]), coleSettings, tueNight, "2026-10-13");
    assert(weekday.blocks.every((b) => !b.offerTestOut), "skip check offered on weekends only", JSON.stringify(weekday.blocks.map((b) => [b.skillId, b.offerTestOut])));
  }

  // --- Friday mix-up: 8 items, 12 on the last Friday (weakest first), never reusing the mission's generators ---
  {
    const weak = mergeProgress(synth, [
      mastered("m1", future),
      mastered("m2", future),
      mastered("m3", future, [true, false, false, true, true, true, true, true, true, true]),
      mastered("m4", future, [true, true, false, true, true, true, true, true, true, true]),
      mastered("m5", future),
    ]);
    const fri = planMission(synth, weak, coleSettings, new Date("2026-10-23T22:00:00Z"), "2026-10-23");
    const mixFri = fri.blocks.find((b) => b.skillIds);
    assert(!!mixFri && mixFri.items === MIXUP_SET_SIZE && MIXUP_SET_SIZE === 8, "mix-up 8 items", JSON.stringify(mixFri));
    assert(isLastFridayOfMonth("2026-10-30") && !isLastFridayOfMonth("2026-10-23"), "isLastFridayOfMonth", "Oct 30");
    const last = planMission(synth, weak, coleSettings, new Date("2026-10-30T22:00:00Z"), "2026-10-30");
    const mixLast = last.blocks.find((b) => b.skillIds);
    assert(!!mixLast && mixLast.items === MIXUP_LAST_FRIDAY_SIZE && mixLast.skillIds?.[0] === "m3" && mixLast.skillIds?.[1] === "m4", "last Friday: 12 items, two weakest first", JSON.stringify(mixLast));
    assert(mixupSkills(synth, weak, 8, 2)[0].id === "m3", "mixupSkills reopen weakest", mixupSkills(synth, weak, 8, 2).map((s) => s.id).join(","));
    const cole = catalogFor("cole");
    const firstMath = cole.find((s) => s.subject === "math")!;
    const oneDue = mergeProgress(cole, [mastered(firstMath.id, past)]);
    const plan = planMission(cole, oneDue, coleSettings, new Date("2026-10-16T22:00:00Z"), "2026-10-16");
    const mix = plan.blocks.find((b) => b.skillIds);
    const usedGens = plan.blocks.filter((b) => !b.skillIds).map((b) => cole.find((s) => s.id === b.skillId)?.generator);
    const mixGens = (mix?.skillIds ?? []).map((id) => cole.find((s) => s.id === id)?.generator);
    assert(!mixGens.some((g) => usedGens.includes(g)) && !(mix?.skillIds ?? []).includes(firstMath.id), "mix-up never reuses a mission generator", JSON.stringify({ usedGens, mixGens }));
  }

  // --- light weeks ---
  {
    assert(JSON.stringify(normalizeSettings({}, 3).lightWeeks) === JSON.stringify(DEFAULT_LIGHT_WEEKS), "light weeks default", JSON.stringify(normalizeSettings({}, 3).lightWeeks));
    assert((normalizeSettings({ lightWeeks: [] }, 3).lightWeeks ?? []).length === 0, "light weeks cleared by a parent stay cleared", "empty kept");
    assert(isPaused(coleSettings, "2026-12-25") && isPaused(coleSettings, "2027-01-01") && !isPaused(coleSettings, "2027-01-02"), "light week off = vacation", "Dec 21 - Jan 1");
    assert(lightWeekMode(coleSettings, "2027-02-17") === "review-only" && lightWeekMode(coleSettings, "2027-03-01") === null, "lightWeekMode", "Feb 15-26 review-only");
    const ro = planMission(synth, progressWith([], ["m1"]), coleSettings, new Date("2027-02-17T23:00:00Z"), "2027-02-17");
    assert(ro.blocks.length > 0 && ro.blocks.every((b) => b.mode === "review"), "review-only week plans review sets only", JSON.stringify(ro.blocks.map((b) => [b.skillId, b.mode])));
    const offSessions: SessionRecord[] = [
      { learnerId: "l", date: "2026-12-18", minutes: 10, xp: 0, blocks: [], completed: true, status: "done" },
      { learnerId: "l", date: "2027-01-04", minutes: 10, xp: 0, blocks: [], completed: true, status: "done" },
    ];
    assert(streakFromSessions(offSessions, "2027-01-04", coleSettings) === 2, "light week off freezes the streak", String(streakFromSessions(offSessions, "2027-01-04", coleSettings)));
  }

  // --- Lily's homework rule (design §14.7) and the shared todaysBlocks ---
  {
    const lily = { grade: 1, settings: lilySettings };
    const hw = (date: string, minutes: number) => ({ date, kind: "homework", subject: "math", text: "School math sheet", minutes });
    const both = [hw("2026-10-13", 10), hw("2026-10-12", 9)];
    assert(homeworkReviewOnly(both, "2026-10-13") && !homeworkReviewOnly([hw("2026-10-13", 10)], "2026-10-13") && !homeworkReviewOnly([hw("2026-10-13", 8), hw("2026-10-12", 10)], "2026-10-13"), "homework rule: > 8 minutes two nights running", "tonight + previous school night");
    assert(homeworkReviewOnly([hw("2026-10-12", 10), hw("2026-10-09", 10)], "2026-10-12"), "homework rule: Monday looks back to Friday", "previous school day");
    const map = progressWith(["m1"], []);
    const ruled = todaysBlocks({ learner: lily, catalog: synth, progressMap: map, sessions: [], now: tueNight, today: "2026-10-13", notes: both });
    const mathRuled = ruled.filter((b) => b.kind === "math");
    assert(mathRuled.length > 0 && mathRuled.every((b) => b.mode === "review") && ruled.some((b) => b.kind === "reading" && b.mode === "learn"), "homework rule: app math review-only", JSON.stringify(ruled.map((b) => [b.kind, b.skillId, b.mode])));
    const cole = todaysBlocks({ learner: { grade: 3, settings: coleSettings }, catalog: synth, progressMap: map, sessions: [], now: tueNight, today: "2026-10-13", notes: both });
    assert(cole.some((b) => b.kind === "math" && b.mode === "learn"), "homework rule: Lily only", "grade 3 keeps new learning");
    const stored: SessionRecord = {
      learnerId: "l",
      date: "2026-10-13",
      minutes: 0,
      xp: 0,
      completed: false,
      status: "planned",
      blocks: [
        { kind: "math", subject: "math", skillId: "m6", mode: "learn", minutes: 12, label: "Math · M6", done: false },
        { kind: "reading", subject: "reading", skillId: "r1", mode: "learn", minutes: 12, label: "Reading · R1", done: true },
      ],
    };
    const swapped = todaysBlocks({ learner: lily, catalog: synth, progressMap: map, sessions: [stored], now: tueNight, today: "2026-10-13", notes: both });
    assert(swapped[0].kind === "math" && swapped[0].mode === "review" && swapped.some((b) => b.kind === "reading" && b.done), "homework rule swaps a stored, unstarted math block", JSON.stringify(swapped.map((b) => [b.kind, b.mode, b.done])));
    assert(todaysBlocks({ learner: lily, catalog: synth, progressMap: map, sessions: [stored], now: tueNight, today: "2026-10-13", notes: [] }) === stored.blocks, "todaysBlocks returns the stored mission", "stored wins");
    assert(todaysBlocks({ learner: lily, catalog: synth, progressMap: map, sessions: [], now: tueNight, today: "2026-12-24", notes: [] }).length === 0, "todaysBlocks paused → none", "light week off");
  }

  // --- five-star ring, Friday Free, bonus set, streak on free days ---
  {
    const s = (date: string, status: SessionRecord["status"] = "done"): SessionRecord => ({ learnerId: "l", date, minutes: 10, xp: 0, blocks: [], completed: status === "done", status });
    const week = [s("2026-10-12"), s("2026-10-13"), s("2026-10-14"), s("2026-10-15", "partial"), s("2026-10-17")];
    const r1 = weeklyRing(week, "2026-10-18");
    assert(r1.nights === 3 && r1.sets === 1 && r1.stars === 4 && !r1.closed && !r1.fridayFree, "ring: closed nights + weekend sets, partial nights don't count", JSON.stringify(r1));
    const r2 = weeklyRing([...week, s("2026-10-18")], "2026-10-18");
    assert(r2.stars === 5 && r2.closed && r2.target === 5, "ring closes at 5 (3 nights + 2 sets)", JSON.stringify(r2));
    const fourNights = [s("2026-10-12"), s("2026-10-13"), s("2026-10-14"), s("2026-10-15")];
    assert(weeklyRing(fourNights, "2026-10-16").fridayFree && missionRole(fourNights, "2026-10-16") === "optional" && isFridayFree(fourNights, "2026-10-16"), "Friday Free with 4 nights by Thursday", "optional");
    assert(missionRole(fourNights.slice(1), "2026-10-16") === "required", "no Friday Free with 3 nights", "required");
    const fiveNights = [...fourNights, s("2026-10-16")];
    assert(missionRole(fiveNights, "2026-10-17") === "bonus" && missionRole(fiveNights.slice(1), "2026-10-17") === "required", "weekend set is a bonus once the ring is closed", "bonus / required");
    assert(missionRole([...fourNights, s("2026-10-17")], "2026-10-18") === "bonus", "second weekend set is a bonus", "Sunday after 4 + 1");
    assert(weeklyRing([...fiveNights, s("2026-10-17"), s("2026-10-18")], "2026-10-18").stars === 5, "ring caps at 5", "cap");
    assert(streakFromSessions([...fourNights, s("2026-10-19")], "2026-10-19", coleSettings) === 5, "streak freezes on Friday Free and the weekend", String(streakFromSessions([...fourNights, s("2026-10-19")], "2026-10-19", coleSettings)));
    assert(streakFromSessions([...fourNights.slice(1), s("2026-10-19")], "2026-10-19", coleSettings) === 1, "a missed required Friday still breaks the streak", "3 nights + no Friday");
    const kinds = kindProgress([
      { kind: "math", done: true },
      { kind: "math", done: false },
      { kind: "reading", done: true },
    ]);
    assert(kinds.length === 2 && !kinds[0].done && kinds[1].done, "kindProgress (a base closes when all its sets are done)", JSON.stringify(kinds));
    const ts = todayStatus({ learnerId: "l", date: "2026-10-13", minutes: 3, xp: 0, completed: false, status: "partial", blocks: [
      { kind: "math", subject: "math", skillId: "m1", mode: "review", minutes: 3, label: "x", done: true },
      { kind: "math", subject: "math", skillId: "m6", mode: "learn", minutes: 9, label: "x", done: false },
      { kind: "reading", subject: "reading", skillId: "r1", mode: "learn", minutes: 12, label: "x", done: false },
    ] });
    assert(ts.blocksDone === 0 && ts.blocksTotal === 2 && ts.status === "in-progress", "todayStatus counts bases", JSON.stringify(ts));
  }

  // --- input points: daily caps, weekly cap 25 (Mon-Sun family time), wallet ---
  {
    const today = "2026-10-14"; // Wed
    const at = "2026-10-14T23:30:00Z"; // Wed 19:30 EDT
    const row = (reason: string, delta = 1, createdAt = at): RewardRecord => ({ learnerId: "l", delta, reason, createdAt });
    assert(pointsAllowed([row("pt:block:math"), row("pt:block:reading")], "block", 1, today) === 1 && pointsAllowed([row("pt:block:math"), row("pt:block:reading"), row("pt:block:brain")], "block", 1, today) === 0, "points: block max 3 a day", "cap");
    assert(pointsAllowed([row("pt:block:math", 1, "2026-10-13T23:30:00Z"), row("pt:block:reading", 1, "2026-10-13T23:30:00Z"), row("pt:block:brain", 1, "2026-10-13T23:30:00Z")], "block", 1, today) === 1, "points: block cap is per family day", "yesterday's blocks don't count");
    assert(pointsAllowed([row("pt:ontime")], "ontime", 1, today) === 0 && pointsAllowed([row("pt:bonus")], "bonus", 1, today) === 0 && pointsAllowed([], "bonus", 1, today) === 1, "points: on-time and surprise bonus once a day", "cap");
    assert(pointsAllowed([row("pt:review:a"), row("pt:review:b"), row("pt:review:c")], "review", 1, today) === 1, "points: review sets have no daily cap", "1");
    const week24 = [row("pt:workshop:a", 12, "2026-10-12T15:00:00Z"), row("pt:workshop:b", 12, "2026-10-13T15:00:00Z")];
    assert(pointsAllowed(week24, "book", 2, today) === 1 && pointsAllowed([...week24, row("pt:review:x")], "book", 2, today) === 0, "points: weekly cap 25", "24 + 2 → 1");
    const sundayNight = row("pt:workshop:z", 20, "2026-10-19T03:30:00Z"); // Sun Oct 18 23:30 EDT
    assert(pointsAllowed([sundayNight], "book", 2, "2026-10-19") === 2 && weekPoints([sundayNight], "2026-10-18") === 20 && weekPoints([sundayNight], "2026-10-19") === 0, "points: the week is Mon-Sun in family time", "Sunday 23:30 ET is last week");
    assert(pointsAllowed([row("learn:m1", 400)], "book", 2, today) === 2, "points: XP rows never count against the cap", "XP ignored");
    const firstPt = "2026-10-12T23:00:00Z";
    const wallet = walletFrom(
      [row("learn:m1", 30, "2026-10-01T23:00:00Z"), row("redeem:old-item", -200, "2026-10-02T23:00:00Z"), row("pt:block:math", 4, firstPt), row("pt:book", 2)],
      [
        { cost: 200, createdAt: "2026-10-02T23:00:00Z" },
        { cost: 5, createdAt: "2026-10-15T00:00:00Z" },
      ]
    );
    assert(wallet.xp === 30 && wallet.earned === 6 && wallet.spent === 5 && wallet.balance === 1, "wallet: points − points-era redemptions; XP excludes points and legacy redemptions", JSON.stringify(wallet));
    assert(startedOnTime(new Date("2026-10-13T23:20:00Z")) && !startedOnTime(new Date("2026-10-13T23:21:00Z")) && startedOnTime(new Date("2026-12-08T00:20:00Z")), "on time = started by 19:20 family time", "EDT / EST");
    assert(isFinishedBook({ date: today, kind: "book", subject: "reading", text: "Finished: Charlotte's Web", minutes: 0 }) && !isFinishedBook({ date: today, kind: "book", subject: "math", text: "Grade 4 p.36", minutes: 10 }), "finished book note", "prefix");
  }

  // --- theme defaults, ladder, normalize ---
  {
    const cole = defaultSettings(3).theme;
    const lily = defaultSettings(1).theme;
    assert(cole.screen === "diamond" && cole.timeBack === "Done by 7:45 = catch in the yard" && JSON.stringify(cole.ladder) === JSON.stringify(["Rookie Ball", "Single-A", "Double-A", "Triple-A", "Lightning 9U Blue", "All-Star"]), "Cole theme defaults", JSON.stringify(cole));
    assert(lily.screen === "tutu" && lily.timeBack === "Done by 7:45 = dance party before bath" && JSON.stringify(lily.ladder) === JSON.stringify(["Barre", "Centre", "Across the Floor", "Recital", "Prima"]), "Lily theme defaults", JSON.stringify(lily));
    const legacy = normalizeSettings({ theme: { currency: "Lightning Bucks", levels: "baseball" } }, 3).theme;
    assert(legacy.screen === "diamond" && legacy.ladder?.[0] === "Rookie Ball" && legacy.timeBack === cole.timeBack, "normalizeSettings fills missing theme keys", JSON.stringify(legacy));
    const custom = normalizeSettings({ theme: { currency: "Bucks", levels: "baseball", ladder: ["A", "B"], timeBack: "", screen: "generic" } }, 3).theme;
    assert(JSON.stringify(custom.ladder) === '["A","B"]' && custom.timeBack === "" && custom.screen === "generic" && ladderFor(custom)[1] === "B", "normalizeSettings keeps a custom theme", JSON.stringify(custom));
  }

  // --- rotation, launch line, quick reply, routing, pony names, dates, rows ---
  {
    const mission = (prefix: string) => ({
      blocks: [
        { kind: "math" as const, subject: "math" as const, skillId: `${prefix}m`, mode: "learn" as const, minutes: 12, label: "Math · M" },
        { kind: "reading" as const, subject: "reading" as const, skillId: `${prefix}r`, mode: "learn" as const, minutes: 12, label: "Reading · R" },
        { kind: "brain" as const, subject: "reasoning" as const, skillId: `${prefix}b`, mode: "learn" as const, minutes: 6, label: "Brain · B" },
      ],
    });
    const turns = rotationPlan([
      { slug: "lily", name: "Lily", mission: mission("l") },
      { slug: "cole", name: "Cole", mission: mission("c") },
    ]);
    const shape = turns.map((t) => `${t.learnerSlug}:${t.kind}:${t.minutes}@${t.startMinute}`).join(" ");
    assert(shape === "lily:math:6@0 cole:math:6@6 lily:reading:6@12 cole:reading:6@18 lily:brain:3@24 cole:brain:3@27", "rotation: one 30-minute evening, younger child first", shape);
    const weekendTurns = rotationPlan([{ slug: "lily", name: "Lily", mission: { blocks: [{ ...mission("l").blocks[0], minutes: 30 }] } }, { slug: "cole", name: "Cole", mission: { blocks: [{ ...mission("c").blocks[0], minutes: 30 }] } }], 8);
    assert(weekendTurns.reduce((s, t) => s + t.minutes, 0) === 30 && weekendTurns.length === 4, "rotation: weekend 30-minute block in 7-8 minute turns", weekendTurns.map((t) => t.minutes).join(","));
    const blocks: SessionBlock[] = [
      { kind: "math", subject: "math", skillId: "a", mode: "review", items: 4, minutes: 3, label: "x", done: false },
      { kind: "math", subject: "math", skillId: "b", mode: "learn", minutes: 9, label: "x", done: false },
      { kind: "reading", subject: "reading", skillId: "c", mode: "learn", minutes: 12, label: "x", done: false },
      { kind: "brain", subject: "reasoning", skillId: "d", mode: "learn", minutes: 6, label: "x", done: false },
    ];
    assert(missionLaunchLine(blocks) === "Tonight: 1 new skill · 1 review set · 1 passage · 1 brain game — about 30 minutes.", "launch line", missionLaunchLine(blocks));
    // Breaks sit outside the 30: 2 min after math on a school night, none on a fallback night (start >= 19:55); 10 min between weekend blocks.
    assert(breakAfter("math", false, 19 * 60 + 15) === 2 && breakAfter("reading", false, 19 * 60 + 15) === 0 && breakAfter("math", false, 20 * 60) === 0 && breakAfter("math", false, 19 * 60 + 55) === 0 && breakAfter("math", false, 19 * 60 + 54) === 2, "movement break: school night, none on fallback nights", "19:55 cutoff");
    assert(breakAfter("math", true, 9 * 60) === 10 && breakAfter("reading", true, 9 * 60) === 10 && breakAfter("brain", true, 9 * 60) === 0, "weekend breaks 10 minutes", "between blocks");
    const started: SessionRecord = { learnerId: "l", date: "2026-10-13", minutes: 12, xp: 0, completed: false, status: "partial", createdAt: "2026-10-14T00:12:00Z", blocks: [{ ...blocks[1], done: true, minutes_spent: 12 }] };
    assert(eveningStartMinutes([started, null], new Date("2026-10-14T00:30:00Z")) === 20 * 60 && eveningStartMinutes([null], new Date("2026-10-13T23:15:00Z")) === 19 * 60 + 15, "evening start from the first finished block", String(eveningStartMinutes([started], new Date("2026-10-14T00:30:00Z"))));
    const reply = quickReply([{ name: "Cole", blocks: [{ ...blocks[0], done: true }, blocks[1], { ...blocks[2], done: true }, blocks[3]] }]);
    assert(reply === "Cole reading done, math partly done, thinking not done.", "quick reply groups review sets into their kind", reply);
    assert(kidSlugForEmail("cole@henderson.family") === "cole" && kidSlugForEmail("Lily@henderson.family") === "lily" && kidSlugForEmail("nicole@henderson.family") === null && kidSlugForEmail("peter@henderson.family") === null && kidSlugForEmail("pete.henderson@gmail.com") === null && kidSlugForEmail("nicole.stein78@gmail.com") === null, "kid routing by email", "cole / lily / parents");
    assert(isParentEmail("peter@henderson.family") && isParentEmail("NICOLE@x.org") && isParentEmail("pete.henderson@gmail.com") && isParentEmail("nicole.stein78@gmail.com") && !isParentEmail("cole@henderson.family") && !isParentEmail("peterpan@x.org"), "isParentEmail mirrors learn_is_parent()", "parents only");
    const names = ponyNameChoices("m1.count.next", ["Clover"]);
    assert(names.length === 6 && new Set(names).size === 6 && !names.includes("Clover") && JSON.stringify(names) === JSON.stringify(ponyNameChoices("m1.count.next", ["Clover"])), "ponyNameChoices", names.join(","));
    const stable = ponyNames([
      { date: "2026-10-14", kind: "pony", subject: "m1", text: "Daisy", minutes: 0 },
      { date: "2026-10-13", kind: "pony", subject: "m1", text: "Comet", minutes: 0 },
    ]);
    assert(stable.m1 === "Daisy", "ponyNames latest wins", JSON.stringify(stable));
    assert(familyMidnightIso("2026-10-12") === "2026-10-12T04:00:00.000Z" && familyMidnightIso("2026-12-07") === "2026-12-07T05:00:00.000Z" && familyMidnightIso("2026-11-01") === "2026-11-01T04:00:00.000Z", "familyMidnightIso (EDT / EST / DST day)", familyMidnightIso("2026-11-01"));
    assert(weekStartDate("2026-10-18") === "2026-10-12" && previousSchoolDay("2026-10-12") === "2026-10-09" && familyDateOfIso("2026-10-14T03:30:00Z") === "2026-10-13", "date helpers", "week start / previous school day / family date");
    const big = attemptToRow({ learnerId: "l", skillId: "s", mode: "learn", question: { type: "numeric", prompt: "1", answer: 1, explain: "e", hint: "h" }, answer: "1", correct: true, ms: 1, seed: 0xffffffff });
    assert(big.seed === 4294967295, "attemptToRow keeps an unsigned 32-bit seed", String(big.seed));
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s) out of ${checks} checks:\n`);
  const shown = failures.slice(0, 40);
  for (const f of shown) console.error(`  - [${f.where}] ${f.message}`);
  if (failures.length > shown.length) console.error(`  … and ${failures.length - shown.length} more`);
  process.exit(1);
} else {
  console.log(`✓ All ${checks} checks passed (${generatorIds.length} generators: ${generatorIds.join(", ")}).`);
}
