/**
 * Learn module self-check: `npm run selfcheck` (= node scripts/learn-selfcheck.mts).
 *
 * Runs in plain Node 22+ (built-in TypeScript type stripping). The resolve hook
 * in ./ts-resolve-hooks.mjs lets the engine's extension-less relative imports
 * load. No path aliases, no DOM, no Next.
 *
 * Checks every registered generator (300 seeded questions each, at levels 1
 * and 3) and the mastery-engine scenarios. Exits 1 with a readable report on
 * any failure.
 */

import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);

// Dynamic imports so they resolve after the hook is registered.
const generatorsMod = await import("../src/lib/learn/generators/index");
const masteryMod = await import("../src/lib/learn/mastery");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog");
const gradeMod = await import("../src/lib/learn/grade");

const { generators, makeQuestion } = generatorsMod;
const { applyResult, applyTestOut, testOut, emptyProgress, planMission, levelFor, xpFor, mergeProgress, nextReviewInterval, isReviewDue, defaultSettings } =
  masteryMod;
const { mulberry32, hashString } = rngMod;
const { CATALOG, catalogFor } = catalogMod;
const { gradeAnswer } = gradeMod;

const QUESTIONS_PER_GENERATOR = 300;
const LEVELS = [1, 3];

interface Failure {
  where: string;
  message: string;
}

const failures: Failure[] = [];
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

function optionKey(o: { label?: string; svg?: string; emoji?: string }): string {
  return JSON.stringify([o.label ?? "", o.emoji ?? "", o.svg ?? ""]);
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
    for (let i = 0; i < QUESTIONS_PER_GENERATOR; i++) {
      const seed = hashString(`selfcheck:${id}:${level}:${i}`);
      let q;
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
      if (q.display?.svg) {
        assert(svgTagsBalanced(q.display.svg), tag, "display svg tags not balanced");
        assert(!hasBadString(q.display.svg), tag, "display svg contains NaN/undefined");
        assert(q.display.svg.includes("viewBox"), tag, "display svg lacks viewBox");
      }
      if (q.display?.speak) assert(!hasBadString(q.display.speak), tag, "speak text contains NaN/undefined");

      if (q.type === "numeric") {
        assert(Number.isFinite(q.answer), tag, `numeric answer not finite: ${q.answer}`);
        for (const a of q.accept ?? []) assert(Number.isFinite(a), tag, "accept value not finite");
        answers.add(String(q.answer));
        assert(gradeAnswer(q, String(q.answer)), tag, "gradeAnswer rejects the correct numeric answer");
      } else if (q.type === "text") {
        assert(typeof q.answer === "string" && (q.answer.length > 0 || q.selfCheck === true), tag, "text answer empty");
        answers.add(q.answer);
        if (!q.selfCheck) assert(gradeAnswer(q, q.answer), tag, "gradeAnswer rejects the correct text answer");
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
          }
          if (o.label) assert(!hasBadString(o.label), tag, `option label bad: ${o.label}`);
        }
        answers.add(optionKey(q.options[q.answerIndex]));
        assert(gradeAnswer(q, String(q.answerIndex)), tag, "gradeAnswer rejects the correct choice");
      } else {
        fail(tag, `unknown question type ${(q as { type: string }).type}`);
      }
      prompts.add(q.prompt + (q.display?.svg ?? ""));
    }
    assert(answers.size > 1, where, `all ${QUESTIONS_PER_GENERATOR} answers identical`);
    assert(prompts.size > QUESTIONS_PER_GENERATOR / 10, where, `low variety: only ${prompts.size} distinct prompts`);
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
    for (const pre of skill.prereqs) assert(CATALOG.some((s) => s.id === pre), where, `prereq "${pre}" not in catalog`);
    try {
      makeQuestion(skill, 42);
    } catch (err) {
      fail(where, `makeQuestion threw: ${(err as Error).message}`);
    }
  }
  for (const slug of ["cole", "lily"]) {
    const cat = catalogFor(slug);
    assert(cat.length > 0, `catalogFor(${slug})`, "empty track");
    for (const s of cat) {
      if (s.track === "both") assert(typeof s.params?.level === "number", `catalogFor(${slug}) ${s.id}`, "level not injected for shared skill");
    }
    const mission = planMission(cat, mergeProgress(cat, []), defaultSettings(slug === "lily" ? 1 : 3), new Date("2026-10-12T20:00:00Z"));
    // Blocks whose subject has no skills yet (e.g. reading before the content lands) are skipped.
    const subjects = new Set(cat.map((s) => s.subject));
    const expectedKinds = ["math", "reading", "brain"].filter((k) =>
      k === "math" ? subjects.has("math") : k === "brain" ? subjects.has("reasoning") : subjects.has("reading") || subjects.has("phonics") || subjects.has("writing")
    );
    const kinds = mission.blocks.map((b) => b.kind).join(",");
    assert(kinds === expectedKinds.join(","), `planMission(${slug})`, `expected blocks ${expectedKinds.join(",")}, got ${kinds}`);
    for (const b of mission.blocks) assert(cat.some((s) => s.id === b.skillId), `planMission(${slug})`, `block skill ${b.skillId} not in track`);
  }
}

// ---------------------------------------------------------------------------
// Mastery engine scenarios
// ---------------------------------------------------------------------------

{
  const now = new Date("2026-10-12T20:00:00Z");
  const day = 86400000;

  // 8 correct → mastered
  let p = emptyProgress("x");
  for (let i = 0; i < 7; i++) p = applyResult(p, true, now);
  assert(p.status === "learning", "mastery: 7 correct", `expected learning, got ${p.status}`);
  p = applyResult(p, true, now);
  assert(p.status === "mastered", "mastery: 8 correct", `expected mastered, got ${p.status}`);
  assert(p.intervalDays === 1, "mastery: interval", `expected 1, got ${p.intervalDays}`);
  assert(p.nextReviewAt === new Date(now.getTime() + day).toISOString(), "mastery: nextReviewAt", "expected tomorrow");
  assert(!!p.masteredAt, "mastery: masteredAt", "missing");

  // 8 attempts with a miss early and streak>=3 → accuracy 7/8 < 0.9 → not mastered; 2 more correct → 9/10 → mastered
  let q = emptyProgress("y");
  q = applyResult(q, false, now);
  for (let i = 0; i < 7; i++) q = applyResult(q, true, now);
  assert(q.status === "learning", "mastery: 7/8 accuracy", `expected learning, got ${q.status}`);
  q = applyResult(q, true, now);
  q = applyResult(q, true, now);
  assert(q.status === "mastered", "mastery: 9/10 accuracy", `expected mastered, got ${q.status}`);

  // streak requirement: 8 attempts, 90%+ but last one wrong → streak 0 → not mastered
  let r = emptyProgress("z");
  for (let i = 0; i < 9; i++) r = applyResult(r, true, now);
  // already mastered at 8; build a fresh one that misses the last
  let r2 = emptyProgress("z2");
  for (let i = 0; i < 7; i++) r2 = applyResult(r2, true, now);
  r2 = applyResult(r2, false, now);
  assert(r2.status === "learning", "mastery: streak rule", `expected learning after a final miss, got ${r2.status}`);
  assert(r.status === "mastered", "mastery: 9 correct", "expected mastered");

  // review correct when due → next interval
  const due = { ...p, intervalDays: 3, nextReviewAt: new Date(now.getTime() - day).toISOString() };
  const after = applyResult(due, true, now, "review");
  assert(after.intervalDays === 7, "review: advance", `expected 7, got ${after.intervalDays}`);
  assert(after.status === "mastered", "review: stays mastered", after.status);
  const again = applyResult(after, true, now, "review");
  assert(again.intervalDays === 7, "review: no double advance in one block", `expected 7, got ${again.intervalDays}`);
  assert(isReviewDue(due, now) && !isReviewDue(after, now), "review: isReviewDue", "due flags wrong");

  // review miss halves interval
  const m14 = { ...p, intervalDays: 14, nextReviewAt: new Date(now.getTime() - day).toISOString(), window: [true, true, true, true, true] };
  const miss1 = applyResult(m14, false, now, "review");
  assert(miss1.intervalDays === 7, "review: miss halves", `expected 7, got ${miss1.intervalDays}`);
  assert(miss1.status === "mastered", "review: one miss keeps mastered", miss1.status);
  const m1 = { ...m14, intervalDays: 1 };
  assert(applyResult(m1, false, now, "review").intervalDays === 1, "review: miss floor", "interval should not drop below 1");

  // two consecutive review misses demote
  const miss2 = applyResult(miss1, false, now, "review");
  assert(miss2.status === "learning", "review: two misses demote", `expected learning, got ${miss2.status}`);
  assert(miss2.nextReviewAt === null && miss2.masteredAt === null, "review: demotion clears review", "fields not cleared");

  // miss, correct, miss → not consecutive → still mastered
  const mcm = applyResult(applyResult(miss1, true, now, "review"), false, now, "review");
  assert(mcm.status === "mastered", "review: non-consecutive misses", `expected mastered, got ${mcm.status}`);

  // intervals ladder
  assert([0, 1, 3, 7, 14, 30, 60, 99].map(nextReviewInterval).join(",") === "1,3,7,14,30,60,60,60", "nextReviewInterval", "ladder wrong");

  // test-out 5/5
  assert(testOut([true, true, true, true, true]) === true, "testOut 5/5", "should pass");
  assert(testOut([true, true, true, true, false]) === false, "testOut 4/5", "should fail");
  assert(testOut([true, true, true, true]) === false, "testOut 4 items", "should fail");
  const t = applyTestOut(emptyProgress("t"), [true, true, true, true, true], now);
  assert(t.status === "mastered" && t.intervalDays === 3, "applyTestOut pass", `got ${t.status}/${t.intervalDays}`);
  const tf = applyTestOut(emptyProgress("tf"), [true, true, false, true, true], now);
  assert(tf.status === "learning" && tf.attempts === 5, "applyTestOut fail", `got ${tf.status}/${tf.attempts}`);

  // xp + levels
  assert(xpFor(false, 9, "learn") === 0, "xpFor wrong", "should be 0");
  assert(xpFor(true, 1, "learn") === 10 && xpFor(true, 3, "learn") === 15 && xpFor(true, 5, "learn") === 20, "xpFor streaks", "10/15/20 expected");
  assert(levelFor(0).level === 1 && levelFor(0).name === "Rookie", "levelFor 0", JSON.stringify(levelFor(0)));
  assert(levelFor(100).level === 2 && levelFor(399).level === 2 && levelFor(400).level === 3, "levelFor thresholds", "sqrt rule wrong");
  assert(levelFor(100 * 9 * 9).level === 10, "levelFor 10", String(levelFor(8100).level));
  assert(levelFor(100 * 12 * 12).name.length > 0, "levelFor beyond names", "name empty");

  // unlocking
  const cat = catalogFor("lily");
  const map0 = mergeProgress(cat, []);
  assert(map0["m1.count.next"].status === "ready" && map0["m1.add.within10"].status === "locked", "deriveStatuses", "prereq gating wrong");
  const map1 = mergeProgress(cat, [{ ...emptyProgress("m1.count.next"), status: "mastered", attempts: 8, correct: 8, streak: 8, window: [true] }]);
  assert(map1["m1.add.within10"].status === "ready", "deriveStatuses unlock", "should unlock after prereq mastered");

  // mission picks due review first, then learning, then ready
  const coleCat = catalogFor("cole");
  const dueProgress = {
    ...emptyProgress("m4.mult.facts"),
    status: "mastered" as const,
    attempts: 10,
    correct: 10,
    streak: 10,
    intervalDays: 1,
    nextReviewAt: new Date(now.getTime() - day).toISOString(),
  };
  const mission = planMission(coleCat, mergeProgress(coleCat, [dueProgress]), defaultSettings(3), now);
  assert(mission.blocks[0].skillId === "m4.mult.facts" && mission.blocks[0].mode === "review", "planMission due review first", JSON.stringify(mission.blocks[0]));
  const mission2 = planMission(coleCat, mergeProgress(coleCat, [{ ...dueProgress, nextReviewAt: new Date(now.getTime() + 5 * day).toISOString() }]), defaultSettings(3), now);
  assert(mission2.blocks[0].skillId === "m4.mult.2x1" && mission2.blocks[0].mode === "learn" && mission2.blocks[0].offerTestOut === true, "planMission ready after mastered", JSON.stringify(mission2.blocks[0]));
  const zeroBrain = planMission(coleCat, mergeProgress(coleCat, []), { ...defaultSettings(3), blocks: { math: 12, reading: 12, brain: 0 } }, now);
  assert(zeroBrain.blocks.every((b) => b.kind !== "brain"), "planMission respects 0-minute block", "brain block should be skipped");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s) out of ${checks} checks:\n`);
  const shown = failures.slice(0, 40);
  for (const f of shown) console.error(`  - [${f.where}] ${f.message}`);
  if (failures.length > shown.length) console.error(`  … and ${failures.length - shown.length} more`);
  process.exit(1);
} else {
  console.log(`✓ All ${checks} checks passed (${generatorIds.length} generators: ${generatorIds.join(", ")}).`);
}
