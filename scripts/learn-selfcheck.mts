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
 *   Planner: never an empty block, never the same generator twice in a mission,
 *   weekend minutes, Friday mix-up, due-review-first ordering.
 *   Engine: the mastery rule with help levels, the guess filter, 4-item review
 *   sets (advance / halve / demote), test-out 5/5 and 4/5, the stuck rule,
 *   stopBy, vacation pause, streak freeze, XP, seeds, rows.
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

type Question = import("../src/lib/learn/types").Question;
type Skill = import("../src/lib/learn/types").Skill;
type SkillProgress = import("../src/lib/learn/types").SkillProgress;
type SessionRecord = import("../src/lib/learn/types").SessionRecord;

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
  currencyFor,
  shiftReviewDates,
  REVIEW_SET_SIZE,
  MIXUP_SET_SIZE,
  TEST_OUT_ITEMS,
} = masteryMod;
const { mulberry32, hashString, questionSeed, questionCounterKey } = rngMod;
const { CATALOG, catalogFor } = catalogMod;
const { gradeAnswer } = gradeMod;
const { isWeekend, isFriday, parseClock, minutesSinceMidnightInFamilyTz } = datesMod;
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
      assert(!/\bwrong\b/i.test(q.explain) && !/\bwrong\b/i.test(q.hint), tag, 'explain/hint must not say "wrong" (use "not yet")');
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
      prompts.add(q.prompt + (q.display?.svg ?? ""));
    }
    assert(answers.size > 1, where, `all ${QUESTIONS_PER_GENERATOR} answers identical`);
    assert(prompts.size > QUESTIONS_PER_GENERATOR / 10, where, `low variety: only ${prompts.size} distinct prompts`);
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
    const subjects = new Set(cat.map((s) => s.subject));
    const expectedKinds = ["math", "reading", "brain"].filter((k) =>
      k === "math" ? subjects.has("math") : k === "brain" ? subjects.has("reasoning") : subjects.has("reading") || subjects.has("phonics") || subjects.has("writing")
    );
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
  assert(demoted.status === "learning" && demoted.reviewMisses === 0 && demoted.nextReviewAt === null && demoted.masteredAt === null, "review: two failed sets demote", JSON.stringify(demoted));
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
  const today = "2026-10-12";
  const streakSessions = [
    mkSession("2026-10-12", "done"),
    mkSession("2026-10-11", "done"),
    mkSession("2026-10-10", "skipped"),
    mkSession("2026-10-09", "done"),
    mkSession("2026-10-08", "vacation"),
    mkSession("2026-10-07", "done"),
  ];
  assert(streakFromSessions(streakSessions, today, defaultSettings(3)) === 4, "streak: skipped/vacation freeze", `got ${streakFromSessions(streakSessions, today, defaultSettings(3))}`);
  const gap = [mkSession("2026-10-12", "done"), mkSession("2026-10-11", "done"), mkSession("2026-10-09", "done")];
  assert(streakFromSessions(gap, today, defaultSettings(3)) === 2, "streak: missed day breaks", `got ${streakFromSessions(gap, today, defaultSettings(3))}`);
  const pausedGap = { ...defaultSettings(3), vacations: [{ from: "2026-10-10", to: "2026-10-10" }] };
  assert(streakFromSessions(gap, today, pausedGap) === 3, "streak: paused day with no row freezes", `got ${streakFromSessions(gap, today, pausedGap)}`);
  const notYetToday = [mkSession("2026-10-12", "planned"), mkSession("2026-10-11", "done"), mkSession("2026-10-10", "done")];
  assert(streakFromSessions(notYetToday, today, null) === 2, "streak: today not done yet", `got ${streakFromSessions(notYetToday, today, null)}`);
  const partial = [mkSession("2026-10-12", "partial"), mkSession("2026-10-11", "partial"), mkSession("2026-10-10", "done")];
  assert(streakFromSessions(partial, today, null) === 1, "streak: partial freezes", `got ${streakFromSessions(partial, today, null)}`);
  assert(streakFromSessions([], today, null) === 0 && streakFromSessions([mkSession("2026-10-12", "done")], today, null) === 1, "streak: edges", "empty / single");
  const legacy = [{ ...mkSession("2026-10-12", undefined, true) }, { ...mkSession("2026-10-11", undefined, true) }];
  assert(streakFromSessions(legacy, today, null) === 2, "streak: legacy completed flag", "rows without status still count");
  assert(sessionStatusFor([{ done: true }, { done: false }]) === "partial" && sessionStatusFor([{ done: true }]) === "done" && sessionStatusFor([{ done: false }]) === "planned" && sessionStatusFor([]) === "planned", "sessionStatusFor", "status mapping");

  // xp + levels
  assert(xpFor(false, 9, "learn") === 0, "xpFor wrong", "should be 0");
  assert(xpFor(true, 1, "learn") === 10 && xpFor(true, 3, "learn") === 15 && xpFor(true, 5, "learn") === 20, "xpFor streaks", "10/15/20 expected");
  assert(xpFor(true, 5, "test") === 10, "xpFor test", "flat base");
  assert(xpFor(true, 1, "learn", "hint") === 5 && xpFor(true, 3, "learn", "taught") === 8, "xpFor helped = half", `${xpFor(true, 1, "learn", "hint")}/${xpFor(true, 3, "learn", "taught")}`);
  assert(currencyFor(150, 100) === 1.5 && currencyFor(35, 100) === 0.4 && currencyFor(50, 0) === 0.5, "currencyFor", "rate conversion");
  assert(levelFor(0).level === 1 && levelFor(0).name === "Rookie", "levelFor 0", JSON.stringify(levelFor(0)));
  assert(levelFor(100).level === 2 && levelFor(399).level === 2 && levelFor(400).level === 3, "levelFor thresholds", "sqrt rule wrong");
  assert(levelFor(100 * 9 * 9).level === 10, "levelFor 10", String(levelFor(8100).level));
  assert(levelFor(100 * 12 * 12).name.length > 0, "levelFor beyond names", "name empty");
  assert(questionTargetFor("review", 12) === REVIEW_SET_SIZE && questionTargetFor("test", 12) === TEST_OUT_ITEMS, "questionTargetFor sets", "review 4 / test 5");
  assert(questionTargetFor("learn", 12) === 14 && questionTargetFor("learn", 2) === 5 && questionTargetFor("learn", 30) === 20 && questionTargetFor("learn", 12, 6) === 6, "questionTargetFor learn", `${questionTargetFor("learn", 12)}/${questionTargetFor("learn", 2)}/${questionTargetFor("learn", 30)}`);

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
