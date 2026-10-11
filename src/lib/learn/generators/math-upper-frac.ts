/**
 * Math generators, grades 3-5, part B: fractions and decimals (3.NF, 4.NF,
 * 5.NF, 4.NF.C, 5.NBT.A-B). Pictures: circles/bars partitioned, number lines,
 * hundred grids, area models. Fraction answers are choices (or typed "3/4"
 * with equivalent forms accepted); decimal answers are typed text or choices
 * because the numeric keypad has no decimal point.
 *
 * Rules: pure functions of ctx.rng, relative imports, `import type`, no DOM.
 * `hint` never states the answer. SVGs: viewBox 0 0 100 100, no id="".
 */

import type { ChoiceQuestion, Generator, Option } from "../types";
import { int, pick, shuffle, sample } from "../rng";
import {
  COLORS,
  barFractionSvg,
  circleFractionSvg,
  dec,
  decAccept,
  decShort,
  frac,
  fracAccept,
  fracEqual,
  fracWords,
  gcd,
  hundredGridSvg,
  labelChoice,
  mixed,
  numListParam,
  numParam,
  numberLineSvg,
  numberName,
  numericChoice,
  pickName,
  r1,
  simplify,
  strParam,
  svgText,
  svgWrap,
} from "./math-util";

type Base = Omit<ChoiceQuestion, "type" | "options" | "answerIndex">;

/** 4-option fraction choice. `label` formats a fraction (default: mixed-number form). */
function fracChoice(rng: () => number, n: number, d: number, distractors: [number, number][], base: Base, label: (n: number, d: number) => string = mixed): ChoiceQuestion {
  const answer = label(n, d);
  const seen = new Set<string>([answer]);
  const wrong: string[] = [];
  for (const [wn, wd] of distractors) {
    if (wd <= 0 || wn < 0 || fracEqual(wn, wd, n, d)) continue;
    const l = label(wn, wd);
    if (seen.has(l)) continue;
    seen.add(l);
    wrong.push(l);
    if (wrong.length === 3) break;
  }
  let k = 1;
  while (wrong.length < 3) {
    const cand = label(n + k, d + (k % 2));
    if (!seen.has(cand) && !fracEqual(n + k, d + (k % 2), n, d)) {
      seen.add(cand);
      wrong.push(cand);
    }
    k += 1;
  }
  return labelChoice(rng, answer, wrong, base);
}

/** Typed fraction answer with equivalent forms accepted. */
function fracText(n: number, d: number, base: Omit<Base, "options">, rng?: () => number): import("../types").Question {
  const [sn, sd] = simplify(n, d);
  const forms = [`${sn}/${sd}`, `${n}/${d}`, mixed(n, d)];
  const leaks = forms.some((f) => f.length >= 2 && new RegExp(`(^|[^\\w])${f.replace(/[/ ]/g, (c) => (c === "/" ? "\\/" : " "))}(?=$|[^\\w])`).test(base.prompt));
  if (leaks && rng) return fracChoice(rng, n, d, [[n + 1, d], [n, d * 2], [Math.max(1, n - 1), d], [n, d + 1]], { ...base, prompt: base.prompt.replace(/\s*\(type[^)]*\)/, "") });
  return { type: "text", answer: sd === 1 ? String(sn) : `${sn}/${sd}`, accept: fracAccept(n, d, true), ...base };
}

/** "1 piece", "3 pieces". */
function pieces(n: number): string {
  return `${n} ${n === 1 ? "piece" : "pieces"}`;
}

/**
 * Typed forms of n/d and its equivalents (the original, simplest form and its
 * ×2..×4 multiples), each as "a/b" and "a / b", prefixed by `whole` ("" for a
 * plain fraction, "4 " for a mixed number). Local stand-in for math-util's
 * fracAccept, which also mixes improper and mixed forms together.
 */
function equivalentForms(n: number, d: number, whole: string): string[] {
  const [sn, sd] = simplify(n, d);
  const out = new Set<string>();
  for (const [a, b] of [[n, d], ...[1, 2, 3, 4].map((k) => [sn * k, sd * k])]) {
    out.add(`${whole}${a}/${b}`);
    out.add(`${whole}${a} / ${b}`);
  }
  return [...out];
}

/** Round to the nearest half (benchmarks 0, 1/2, 1, 1 1/2, …). */
function nearestHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

/** 0 → "0", 0.5 → "1/2", 3 → "3", 3.5 → "3 1/2". */
function halfText(h: number): string {
  const whole = Math.floor(h);
  if (h === whole) return String(whole);
  return whole === 0 ? "1/2" : `${whole} 1/2`;
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

const DENOMS_G3 = [2, 3, 4, 6, 8];
const DENOMS_G4 = [2, 3, 4, 5, 6, 8, 10, 12];

// ---------------------------------------------------------------------------
// fractionOfShape — 3.NF.A.1, 3.G.A.2
// ---------------------------------------------------------------------------

const fractionOfShape: Generator = (ctx) => {
  const { rng } = ctx;
  const denoms = numListParam(ctx, "denoms", DENOMS_G3);
  const mode = strParam(ctx, "mode", "mixed");
  const d = pick(rng, denoms.filter((x) => x <= 12));
  const n = int(rng, 1, d - 1);
  const shape = pick(rng, ["circle", "bar"] as const);
  const shadedIdx = sample(rng, Array.from({ length: d }, (_, i) => i), n);
  const draw = (parts: number, shaded: number[]) => (shape === "circle" ? circleFractionSvg(parts, shaded) : barFractionSvg(parts, shaded));
  const variant = mode === "partition" ? int(rng, 2, 3) : mode === "identify" ? int(rng, 0, 1) : int(rng, 0, 3);
  if (variant === 0) {
    return fracChoice(rng, n, d, [[d - n, d], [n, d + 1], [d, n], [n + 1, d]], {
      prompt: "What fraction of the shape is shaded?",
      display: { svg: draw(d, shadedIdx), speak: "What fraction of the shape is shaded?" },
      explain: `The whole is cut into ${d} equal parts, so each part is 1/${d}. ${n} parts are shaded: ${n} parts of size 1/${d} = ${n}/${d} (${fracWords(n, d)}).`,
      hint: "Bottom number: how many equal parts in the whole. Top number: how many are shaded.",
    }, frac);
  }
  if (variant === 1) {
    const correct: Option = { svg: draw(d, shadedIdx) };
    const others: Option[] = [{ svg: draw(d, shadedIdx.slice(0, Math.max(1, n - 1)).concat(n === d - 1 ? [] : [])) }, { svg: draw(d + 1, shadedIdx.map((i) => Math.min(i, d))) }, { svg: draw(d, Array.from({ length: Math.min(d, n + 1) }, (_, i) => i)) }];
    return ((): ChoiceQuestion => {
        const seen = new Set<string>([correct.svg as string]);
        const uniq = others.filter((o) => {
          if (seen.has(o.svg as string)) return false;
          seen.add(o.svg as string);
          return true;
        });
        const values = shuffle(rng, [correct, ...uniq]);
        return {
          type: "choice",
          prompt: `Which picture shows ${n}/${d}?`,
          display: { speak: `Which picture shows ${fracWords(n, d)}?` },
          options: values,
          answerIndex: values.indexOf(correct),
          explain: `${n}/${d} means ${d} equal parts with ${n} shaded. Count the parts first, then the shaded ones.`,
          hint: `First find the pictures cut into exactly ${d} equal parts. Then count the shaded parts.`,
        };
      })();
  }
  if (variant === 2) {
    return fracChoice(rng, 1, d, [[1, d + 1], [1, d - 1], [d, 1]], {
      prompt: "The shape is cut into equal parts. Each part is what fraction of the whole?",
      display: { svg: draw(d, []), speak: "The shape is cut into equal parts. Each part is what fraction of the whole?" },
      explain: `There are ${d} equal parts, so each part is one ${d}th of the whole: 1/${d}. ${d} parts of 1/${d} make the whole.`,
      hint: "Count the equal parts. Each part is 1 over that number.",
    }, frac);
  }
  return {
    type: "numeric",
    prompt: `How many pieces of size 1/${d} make ${n}/${d}?`,
    answer: n,
    display: { svg: draw(d, shadedIdx), speak: `How many pieces of size one ${d}th make ${fracWords(n, d)}?` },
    explain: `${n}/${d} is built from unit fractions: ${Array.from({ length: n }, () => `1/${d}`).join(" + ")} = ${n}/${d}. That is ${pieces(n)}.`,
    hint: "The top number counts how many unit pieces there are.",
  };
};

// ---------------------------------------------------------------------------
// fractionNumberLine — 3.NF.A.2
// ---------------------------------------------------------------------------

function fracLineLabels(d: number, units: number): Record<number, string> {
  const labels: Record<number, string> = {};
  for (let i = 0; i <= d * units; i++) labels[i] = i % d === 0 ? String(i / d) : "";
  return labels;
}

const fractionNumberLine: Generator = (ctx) => {
  const { rng } = ctx;
  const denoms = numListParam(ctx, "denoms", DENOMS_G3);
  const d = pick(rng, denoms.filter((x) => x <= 8));
  const units = rng() < 0.35 ? 2 : 1;
  const n = int(rng, 1, d * units - 1);
  const line = (dots: { at: number; label?: string; color?: string }[]) => numberLineSvg({ min: 0, max: d * units, step: 1, labelEvery: 1, labels: fracLineLabels(d, units), dots });
  const variant = d * units - 1 < 3 ? pick(rng, [0, 2]) : int(rng, 0, 2);
  if (variant === 0) {
    return fracChoice(rng, n, d, [[n, d + 1], [d, n], [n + 1, d], [n, d * 2]], {
      prompt: `The line from 0 to 1 is cut into equal parts. What fraction is the dot at?`,
      display: { svg: line([{ at: n }]), speak: "The number line from 0 to 1 is cut into equal parts. What fraction is at the dot?" },
      explain: `From 0 to 1 there are ${d} equal jumps, so each jump is 1/${d}. The dot is ${n} jumps from 0: ${n}/${d}${n > d ? ` (that is more than 1: ${mixed(n, d)})` : ""}.`,
      hint: "Count the jumps between 0 and 1 to find the size of each jump. Then count jumps from 0 to the dot.",
    }, frac);
  }
  if (variant === 1) {
    const positions = sample(rng, Array.from({ length: d * units - 1 }, (_, i) => i + 1), Math.min(4, d * units - 1));
    if (!positions.includes(n)) positions[0] = n;
    const letters = ["A", "B", "C", "D"];
    const sorted = [...positions].sort((a, b) => a - b);
    const dots = sorted.map((p, i) => ({ at: p, label: letters[i], color: p === n ? COLORS.rose : COLORS.blue }));
    const answer = letters[sorted.indexOf(n)];
    return labelChoice(rng, answer, letters.filter((l) => l !== answer).slice(0, sorted.length - 1), {
      prompt: `Which point is at ${n}/${d}?`,
      display: { svg: line(dots.map((x) => ({ at: x.at, label: x.label, color: COLORS.blue }))), speak: `Which point is at ${fracWords(n, d)}?` },
      explain: `Each jump is 1/${d}. ${n}/${d} is ${n} jumps from 0, which is point ${answer}.`,
      hint: `Start at 0 and count ${n} jumps of 1/${d}.`,
    });
  }
  return {
    type: "numeric",
    prompt: `The line from 0 to 1 is cut into parts of 1/${d}. How many jumps of 1/${d} does it take to reach the dot?`,
    answer: n,
    display: { svg: line([{ at: n }]), speak: `Zero to one is cut into parts of one ${d}th. How many jumps does it take to reach the dot?` },
    explain: `${n}/${d} means ${n} copies of 1/${d} laid end to end from 0. So it takes ${n} jumps.`,
    hint: "The top number of the fraction tells how many unit jumps.",
  };
};

// ---------------------------------------------------------------------------
// equivalentFractions — 3.NF.A.3, 4.NF.A.1
// ---------------------------------------------------------------------------

const equivalentFractions: Generator = (ctx) => {
  const { rng } = ctx;
  const denoms = numListParam(ctx, "denoms", DENOMS_G4);
  const d = pick(rng, denoms.filter((x) => x <= 12));
  let n = int(rng, 1, d - 1);
  const k = int(rng, 2, d <= 4 ? 4 : 3);
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    if (gcd(n, d) !== 1) n = 1;
    return {
      type: "numeric",
      prompt: `${n}/${d} = ?/${d * k}`,
      answer: n * k,
      display: { svg: barFractionSvg(d, Array.from({ length: n }, (_, i) => i), COLORS.blue, [{ parts: d * k, shaded: Array.from({ length: n * k }, (_, i) => i), color: COLORS.amber }]), speak: `${fracWords(n, d)} equals how many ${d * k}ths?` },
      explain: `The denominator went from ${d} to ${d * k}: it was multiplied by ${k}. Do the same to the numerator: ${n} × ${k} = ${n * k}. So ${n}/${d} = ${n * k}/${d * k}. The bars show the same amount cut into smaller pieces.`,
      hint: `What was ${d} multiplied by to get ${d * k}? Multiply the top number by the same thing.`,
    };
  }
  if (variant === 1) {
    const [sn, sd] = simplify(n, d);
    return fracChoice(rng, sn * k, sd * k, [[sn + 1, sd * k], [sn * k, sd + k], [sn, sd * k], [sn * k, sd]], {
      prompt: `Which fraction is equivalent to ${sn}/${sd}?`,
      display: { svg: barFractionSvg(sd, Array.from({ length: sn }, (_, i) => i)), speak: `Which fraction is equivalent to ${fracWords(sn, sd)}?` },
      explain: `Multiply top and bottom by the same number: ${sn} × ${k} / ${sd} × ${k} = ${sn * k}/${sd * k}. Same amount, smaller pieces.`,
      hint: "Equivalent fractions come from multiplying (or dividing) the top AND bottom by the same number.",
    }, frac);
  }
  if (variant === 2) {
    const [sn, sd] = simplify(n, d);
    const bn = sn * k;
    const bd = sd * k;
    return fracChoice(rng, sn, sd, [[bn - 1, bd], [sn, sd + 1], [sn + 1, sd], [bn, sd]], {
      prompt: `Write ${bn}/${bd} in simplest form.`,
      display: { speak: `Write ${fracWords(bn, bd)} in simplest form.` },
      explain: `${bn} and ${bd} can both be divided by ${k}: ${bn} ÷ ${k} = ${sn}, ${bd} ÷ ${k} = ${sd}. So ${bn}/${bd} = ${sn}/${sd}.`,
      hint: `Find a number that divides both ${bn} and ${bd} evenly. Divide top and bottom by it.`,
    }, frac);
  }
  const [sn, sd] = simplify(n, d);
  const correct: Option = { svg: barFractionSvg(sd * k, Array.from({ length: sn * k }, (_, i) => i), COLORS.amber) };
  const others: Option[] = [
    { svg: barFractionSvg(sd * k, Array.from({ length: sn * k + 1 }, (_, i) => i), COLORS.amber) },
    { svg: barFractionSvg(sd * k, Array.from({ length: Math.max(1, sn * k - 1) }, (_, i) => i), COLORS.amber) },
    { svg: barFractionSvg(sd * k + 1, Array.from({ length: sn * k }, (_, i) => i), COLORS.amber) },
  ];
  const values = shuffle(rng, [correct, ...others]);
  return {
    type: "choice",
    prompt: `Which bar shows a fraction equal to ${sn}/${sd}?`,
    display: { svg: barFractionSvg(sd, Array.from({ length: sn }, (_, i) => i)), speak: `Which bar shows a fraction equal to ${fracWords(sn, sd)}?` },
    options: values,
    answerIndex: values.indexOf(correct),
    explain: `${sn}/${sd} = ${sn * k}/${sd * k}: the same length is shaded, just cut into ${sd * k} smaller pieces (${sn * k} of them shaded).`,
    hint: "Compare the shaded LENGTH, not the number of pieces. Which bar has the same amount shaded as the one on top?",
  };
};

// ---------------------------------------------------------------------------
// compareFractions — 3.NF.A.3d (same numerator/denominator), 4.NF.A.2
// ---------------------------------------------------------------------------

function compareWhyFrac(n1: number, d1: number, n2: number, d2: number): string {
  const sym = n1 * d2 > n2 * d1 ? ">" : n1 * d2 < n2 * d1 ? "<" : "=";
  if (sym === "=") return `${n1}/${d1} and ${n2}/${d2} are equivalent (same point on the number line), so they are equal.`;
  if (d1 === d2) return `Same denominator, so the pieces are the same size: compare the numerators. ${pieces(Math.max(n1, n2))} is more than ${pieces(Math.min(n1, n2))}. ${n1}/${d1} ${sym} ${n2}/${d2}.`;
  if (n1 === n2) return `Same numerator (same number of pieces), so compare piece size: ${Math.min(d1, d2)}ths are bigger pieces than ${Math.max(d1, d2)}ths. ${n1}/${d1} ${sym} ${n2}/${d2}.`;
  const half1 = n1 * 2 - d1;
  const half2 = n2 * 2 - d2;
  if ((half1 > 0 && half2 < 0) || (half1 < 0 && half2 > 0)) return `Use the benchmark 1/2: ${n1}/${d1} is ${half1 > 0 ? "more" : "less"} than 1/2 and ${n2}/${d2} is ${half2 > 0 ? "more" : "less"} than 1/2. So ${n1}/${d1} ${sym} ${n2}/${d2}.`;
  const l = lcm(d1, d2);
  return `Make the denominators the same (${l}): ${n1}/${d1} = ${(n1 * l) / d1}/${l} and ${n2}/${d2} = ${(n2 * l) / d2}/${l}. Now compare numerators: ${n1}/${d1} ${sym} ${n2}/${d2}.`;
}

const compareFractions: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const denoms = numListParam(ctx, "denoms", mode === "sameNumOrDenom" ? DENOMS_G3 : DENOMS_G4);
  let n1: number;
  let d1: number;
  let n2: number;
  let d2: number;
  const kind = mode === "sameNumOrDenom" ? pick(rng, ["den", "num"]) : mode === "mixed" ? pick(rng, ["den", "num", "unlike", "unlike"]) : "unlike";
  if (kind === "den") {
    // Two different numerators from 1 to d − 1 need d ≥ 3 (halves would force "1/2 ○ 0/2").
    const roomy = denoms.filter((x) => x >= 3);
    d1 = pick(rng, roomy.length > 0 ? roomy : [4]);
    d2 = d1;
    n1 = int(rng, 1, d1 - 1);
    n2 = int(rng, 1, d1 - 1);
    if (n2 === n1) n2 = n1 === d1 - 1 ? n1 - 1 : n1 + 1;
  } else if (kind === "num") {
    n1 = int(rng, 1, 3);
    n2 = n1;
    d1 = pick(rng, denoms.filter((x) => x > n1));
    d2 = pick(rng, denoms.filter((x) => x > n1 && x !== d1));
  } else {
    d1 = pick(rng, denoms);
    d2 = pick(rng, denoms.filter((x) => x !== d1));
    n1 = int(rng, 1, d1 - 1);
    n2 = int(rng, 1, d2 - 1);
    if (rng() < 0.15) {
      const g = gcd(n1, d1);
      n2 = (n1 / g) * (d2 / (d2 % (d1 / g) === 0 ? d1 / g : d2));
      if (!Number.isInteger(n2) || n2 <= 0 || n2 >= d2) n2 = int(rng, 1, d2 - 1);
    }
  }
  const sym = n1 * d2 > n2 * d1 ? ">" : n1 * d2 < n2 * d1 ? "<" : "=";
  if (rng() < 0.6) {
    const options = shuffle(rng, ["<", ">", "="]);
    return {
      type: "choice",
      prompt: `${n1}/${d1} ○ ${n2}/${d2}   Which sign makes it true? (Same-size wholes.)`,
      display: { svg: barFractionSvg(d1, Array.from({ length: n1 }, (_, i) => i), COLORS.blue, [{ parts: d2, shaded: Array.from({ length: n2 }, (_, i) => i), color: COLORS.amber }]), speak: `Compare ${fracWords(n1, d1)} and ${fracWords(n2, d2)}.` },
      options: options.map((s) => ({ label: s })),
      answerIndex: options.indexOf(sym),
      explain: compareWhyFrac(n1, d1, n2, d2),
      hint: kind === "den" ? "Same denominator: just compare the top numbers." : kind === "num" ? "Same top number: the bigger the denominator, the smaller each piece." : "Is each fraction more or less than 1/2? Or rewrite both with the same denominator.",
    };
  }
  // Never two equal fractions in a greatest/least set (the "unlike" pair above is
  // deliberately equivalent 15% of the time): two options would both be correct.
  const set: [number, number][] = fracEqual(n1, d1, n2, d2) ? [[n1, d1]] : [[n1, d1], [n2, d2]];
  while (set.length < 4) {
    const d = pick(rng, denoms);
    const n = int(rng, 1, d - 1);
    if (!set.some(([a, b]) => fracEqual(a, b, n, d))) set.push([n, d]);
  }
  const greatest = rng() < 0.5;
  const best = set.reduce((acc, f) => (greatest ? (f[0] * acc[1] > acc[0] * f[1] ? f : acc) : (f[0] * acc[1] < acc[0] * f[1] ? f : acc)), set[0]);
  const answer = `${best[0]}/${best[1]}`;
  const others = set.filter((f) => f !== best).map(([a, b]) => `${a}/${b}`);
  const second = set.filter((f) => f !== best).sort((f, g) => (greatest ? g[0] * f[1] - f[0] * g[1] : f[0] * g[1] - g[0] * f[1]))[0];
  return labelChoice(rng, answer, others, {
    prompt: `Which fraction is the ${greatest ? "greatest" : "least"}?`,
    display: { speak: `Which fraction is the ${greatest ? "greatest" : "least"}?` },
    explain: `${compareWhyFrac(best[0], best[1], second[0], second[1])} Checking each one the same way, ${answer} is the ${greatest ? "greatest" : "least"}.`,
    hint: "Compare each fraction to 1/2 and to 1 first. Rewrite with a common denominator if two are close.",
  });
};

// ---------------------------------------------------------------------------
// addSubLikeDenominators — 4.NF.B.3a-d
// ---------------------------------------------------------------------------

const addSubLikeDenominators: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const denoms = numListParam(ctx, "denoms", DENOMS_G4);
  const d = pick(rng, denoms);
  const m = mode === "mixed" ? pick(rng, ["add", "sub", "decompose", "mixedNumbers", "wordproblem"]) : mode;
  const asText = rng() < 0.4;
  if (m === "decompose") {
    // A proper fraction split into two non-empty parts needs d >= 3: with d = 2 the
    // item collapses to "1/2 + 0/2" or decomposes the whole "2/2".
    const big = denoms.filter((x) => x >= 3);
    const dd = d >= 3 ? d : pick(rng, big.length > 0 ? big : [3, 4, 6, 8]);
    const n = int(rng, 2, dd - 1);
    const a = int(rng, 1, n - 1);
    if (rng() < 0.5) {
      return {
        type: "numeric",
        prompt: `${n}/${dd} = ${a}/${dd} + ?/${dd}`,
        answer: n - a,
        display: { svg: barFractionSvg(dd, Array.from({ length: n }, (_, i) => i)), speak: `${fracWords(n, dd)} equals ${fracWords(a, dd)} plus how many ${dd}ths?` },
        explain: `Same-size pieces: ${pieces(n)} = ${pieces(a)} + ${pieces(n - a)}. So ${n}/${dd} = ${a}/${dd} + ${n - a}/${dd}. (Also ${n}/${dd} = ${Array.from({ length: n }, () => `1/${dd}`).join(" + ")}.)`,
        hint: `Only the top numbers change. ${a} plus what makes ${n}?`,
      };
    }
    const answer = `${a}/${dd} + ${n - a}/${dd}`;
    // Every distractor is a sum that is NOT n/dd (no "n/dd + 0/dd", which is also correct).
    return labelChoice(rng, answer, [`${a}/${dd} + ${n - a}/${dd * 2}`, `${a}/${dd} × ${n - a}/${dd}`, `${a}/${dd} + ${n - a + 1}/${dd}`, `${a}/${dd + 1} + ${n - a}/${dd + 1}`], {
      prompt: `Which sum equals ${n}/${dd}?`,
      display: { svg: barFractionSvg(dd, Array.from({ length: n }, (_, i) => i)), speak: `Which sum equals ${fracWords(n, dd)}?` },
      explain: `A fraction is a sum of smaller fractions with the same denominator: ${a}/${dd} + ${n - a}/${dd} = ${n}/${dd}, because ${a} + ${n - a} = ${n} pieces.`,
      hint: "Keep the denominator the same and make the top numbers add up.",
    });
  }
  if (m === "add" || m === "sub") {
    const a = int(rng, 1, d - 1);
    const b = m === "add" ? int(rng, 1, d - 1) : int(rng, 1, a);
    const n = m === "add" ? a + b : a - b;
    if (m === "sub" && n === 0) return addSubLikeDenominators({ ...ctx, params: { ...(ctx.params ?? {}), mode: "add" } });
    const prompt = `${a}/${d} ${m === "add" ? "+" : "−"} ${b}/${d} = ?`;
    const explain = `Same denominator, so ${m === "add" ? "add" : "subtract"} the numerators and keep the ${d}: ${a} ${m === "add" ? "+" : "−"} ${b} = ${n}, so the answer is ${n}/${d}${simplify(n, d)[1] !== d ? ` = ${frac(...simplify(n, d))}` : ""}${n >= d ? ` = ${mixed(n, d)}` : ""}.`;
    const hint = `The pieces are all ${d}ths. ${m === "add" ? "Add" : "Subtract"} the number of pieces; the denominator stays ${d}.`;
    const speak = `${fracWords(a, d)} ${m === "add" ? "plus" : "minus"} ${fracWords(b, d)}`;
    if (asText) return fracText(n, d, { prompt: `${prompt}  (type it like 3/4)`, display: { speak }, explain, hint }, rng);
    return fracChoice(rng, n, d, [[n, d * 2], [m === "add" ? a + b : a + b, d], [n + 1, d], [Math.abs(a - b) || 1, d]], { prompt, display: { speak }, explain, hint });
  }
  if (m === "mixedNumbers") {
    const w1 = int(rng, 1, 4);
    const w2 = int(rng, 1, 3);
    const f1 = int(rng, 1, d - 1);
    const f2 = int(rng, 1, d - 1);
    const add = rng() < 0.6;
    if (add) {
      const total = (w1 + w2) * d + f1 + f2;
      const prompt = `${w1} ${f1}/${d} + ${w2} ${f2}/${d} = ?`;
      const regroup = f1 + f2 >= d;
      const explain = `Add the wholes: ${w1} + ${w2} = ${w1 + w2}. Add the fractions: ${f1}/${d} + ${f2}/${d} = ${f1 + f2}/${d}${regroup ? ` = ${mixed(f1 + f2, d)} — regroup the extra whole` : ""}. Total: ${mixed(total, d)}.`;
      const hint = "Add the whole numbers, then the fractions. If the fraction part is 1 or more, carry a whole.";
      const speak = `${w1} and ${fracWords(f1, d)} plus ${w2} and ${fracWords(f2, d)}`;
      if (asText) return fracText(total, d, { prompt: `${prompt}  (type a mixed number like 3 1/4 or a fraction)`, display: { speak }, explain, hint }, rng);
      return fracChoice(rng, total, d, [[total - d, d], [total + 1, d], [(w1 + w2) * d + Math.max(0, f1 + f2 - d), d], [total, d * 2]], { prompt, display: { speak }, explain, hint });
    }
    const big = Math.max(w1, w2) + 1;
    const small = Math.min(w1, w2);
    const total = big * d + f1 - (small * d + f2);
    const prompt = `${big} ${f1}/${d} − ${small} ${f2}/${d} = ?`;
    const borrow = f1 < f2;
    const explain = borrow
      ? `${f1}/${d} is less than ${f2}/${d}, so regroup: ${big} ${f1}/${d} = ${big - 1} ${f1 + d}/${d}. Then ${big - 1} − ${small} = ${big - 1 - small} and ${f1 + d}/${d} − ${f2}/${d} = ${f1 + d - f2}/${d}. Answer: ${mixed(total, d)}.`
      : `Subtract the wholes: ${big} − ${small} = ${big - small}. Subtract the fractions: ${f1}/${d} − ${f2}/${d} = ${f1 - f2}/${d}. Answer: ${mixed(total, d)}.`;
    const hint = borrow ? "The top fraction is smaller than the one you subtract. Borrow 1 whole and turn it into pieces first." : "Subtract the whole numbers, then subtract the fractions.";
    const speak = `${big} and ${fracWords(f1, d)} minus ${small} and ${fracWords(f2, d)}`;
    if (asText) return fracText(total, d, { prompt: `${prompt}  (type a mixed number like 1 3/4 or a fraction)`, display: { speak }, explain, hint }, rng);
    return fracChoice(rng, total, d, [[total + d, d], [total - 1, d], [Math.abs((big - small) * d + f1 - f2) || 1, d], [total, d * 2]], { prompt, display: { speak }, explain, hint });
  }
  const a = int(rng, 1, d - 1);
  let b = int(rng, 1, d - 1);
  const name = pickName(rng);
  const other = pickName(rng, name);
  // A subtraction story needs two different proper fractions, so d = 2 is always an addition story.
  const add = rng() < 0.5 || d < 3;
  const unit = pick(rng, LIKE_STORIES);
  if (add) {
    // Two people sharing ONE pizza cannot eat more than all of it.
    if (unit.sameWhole && a + b > d) b = int(rng, 1, d - a);
    const n = a + b;
    const prompt = unit.add(name, other, `${a}/${d}`, `${b}/${d}`);
    const explain = `Same-size pieces (${d}ths): ${a}/${d} + ${b}/${d} = ${n}/${d}${n >= d ? ` = ${mixed(n, d)}` : ""}${simplify(n, d)[1] !== d && n < d ? ` = ${frac(...simplify(n, d))}` : ""}.`;
    const hint = "Putting the amounts together means add. The pieces are the same size, so add the tops.";
    return fracChoice(rng, n, d, [[n, d * 2], [n + 1, d], [Math.abs(a - b) || 1, d], [a * b, d]], { prompt, display: { speak: prompt }, explain, hint });
  }
  let big = Math.max(a, b);
  let small = Math.min(a, b);
  if (big === small) {
    // a = b: nudge apart, staying inside 1..d-1 (never "used 0/d").
    if (big < d - 1) big += 1;
    else small -= 1;
  }
  const n = big - small;
  const prompt = unit.sub(name, `${big}/${d}`, `${small}/${d}`);
  const explain = `Take away pieces of the same size: ${big}/${d} − ${small}/${d} = ${n}/${d}${simplify(n, d)[1] !== d ? ` = ${frac(...simplify(n, d))}` : ""}.`;
  const hint = "Finding what is left means take away. Subtract the tops; the denominator stays.";
  return fracChoice(rng, n, d, [[n, d * 2], [big + small, d], [n + 1, d], [small, d]], { prompt, display: { speak: prompt }, explain, hint });
};

interface LikeStory {
  /** both amounts are parts of the SAME single whole (one pizza): their sum must be <= 1 */
  sameWhole: boolean;
  add: (name: string, other: string, x: string, y: string) => string;
  sub: (name: string, big: string, small: string) => string;
}

/** Each unit carries its own verbs ("ate" a pizza, "ran" a mile, "practiced" an hour). */
const LIKE_STORIES: LikeStory[] = [
  {
    sameWhole: true,
    add: (name, other, x, y) => `${name} ate ${x} of a pizza and ${other} ate ${y} of the same pizza. How much of the pizza did they eat together?`,
    sub: (name, big, small) => `There was ${big} of a pizza left. ${name} ate ${small} of the pizza. How much of the pizza is left now?`,
  },
  {
    sameWhole: true,
    add: (name, other, x, y) => `${name} ate ${x} of a pan of brownies and ${other} ate ${y} of the same pan. How much of the pan did they eat together?`,
    sub: (name, big, small) => `There was ${big} of a pan of brownies left. ${name} ate ${small} of the pan. How much of the pan is left now?`,
  },
  {
    sameWhole: false,
    add: (name, other, x, y) => `${name} ran ${x} of a mile and ${other} ran ${y} of a mile. How far did they run together?`,
    sub: (name, big, small) => `${name}'s trail is ${big} of a mile long. ${name} has run ${small} of a mile so far. How much of the trail is left?`,
  },
  {
    sameWhole: false,
    add: (name, _other, x, y) => `${name} practiced ${x} of an hour on Monday and ${y} of an hour on Tuesday. How long did ${name} practice in all?`,
    sub: (name, big, small) => `${name} has ${big} of an hour to practice. ${name} has practiced for ${small} of an hour so far. How much practice time is left?`,
  },
  {
    sameWhole: false,
    add: (name, other, x, y) => `${name} used ${x} of a yard of ribbon and ${other} used ${y} of a yard. How much ribbon did they use together?`,
    sub: (name, big, small) => `${name} had ${big} of a yard of ribbon and used ${small} of a yard. How much ribbon is left?`,
  },
];

// ---------------------------------------------------------------------------
// mixedImproper — 3.NF.A.3c (wholes), 4.NF.B.3c (convert)
// ---------------------------------------------------------------------------

const mixedImproper: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "convert");
  const d = pick(rng, numListParam(ctx, "denoms", DENOMS_G4));
  if (mode === "wholes") {
    const variant = int(rng, 0, 3);
    const w = int(rng, 1, 6);
    if (variant === 0) {
      return {
        type: "numeric",
        prompt: `${d}/${d} = ?`,
        answer: 1,
        display: { svg: circleFractionSvg(d, Array.from({ length: d }, (_, i) => i)), speak: `${d} ${d}ths equals what whole number?` },
        explain: `${d} pieces of size 1/${d} fill the whole shape. ${d}/${d} = 1. Any fraction with the same top and bottom equals 1.`,
        hint: "All the pieces are shaded. How many whole shapes is that?",
      };
    }
    if (variant === 1) {
      return {
        type: "numeric",
        prompt: `${w} = ?/1`,
        answer: w,
        display: { speak: `${w} equals how many over 1?` },
        explain: `Any whole number can be written over 1: ${w} = ${w}/1, because ${w} ÷ 1 = ${w}.`,
        hint: "Dividing by 1 does not change a number.",
      };
    }
    if (variant === 2) {
      return {
        type: "numeric",
        prompt: `${w * d}/${d} = ?`,
        answer: w,
        display: { speak: `${w * d} ${d}ths equals what whole number?` },
        explain: `Every ${d} pieces of 1/${d} make 1 whole. ${w * d} ÷ ${d} = ${w}, so ${w * d}/${d} = ${w}.`,
        hint: `How many groups of ${d} are in ${w * d}? Each group is one whole.`,
      };
    }
    return fracChoice(rng, w, 1, [[1, w], [w, w], [w, w + 1]], {
      prompt: `Which fraction equals the whole number ${w}?`,
      display: { speak: `Which fraction equals the whole number ${w}?` },
      explain: `${w}/1 = ${w} ÷ 1 = ${w}. (${w}/${w} would be 1, and 1/${w} is a small piece.)`,
      hint: "A whole number is that many ones. Which fraction means 'that many divided by 1'?",
    }, frac);
  }
  const w = int(rng, 1, 5);
  const n = int(rng, 1, d - 1);
  const improper = w * d + n;
  const toImproper = rng() < 0.5;
  const asText = rng() < 0.4;
  const [simpN, simpD] = simplify(n, d);
  const [simpImpN, simpImpD] = simplify(improper, d);
  if (toImproper) {
    const prompt = `Write ${w} ${n}/${d} as an improper fraction.`;
    const explain = `${w} wholes = ${w} × ${d} = ${w * d} ${d}ths. Add the ${n} extra ${n === 1 ? "piece" : "pieces"}: ${w * d} + ${n} = ${improper}. So ${w} ${n}/${d} = ${improper}/${d}${simpImpD !== d ? ` = ${simpImpN}/${simpImpD} in simplest form` : ""}.`;
    const hint = `Multiply the whole number by ${d} (pieces in each whole), then add the ${n} extra ${n === 1 ? "piece" : "pieces"}. Keep the denominator.`;
    const speak = `Write ${w} and ${fracWords(n, d)} as an improper fraction.`;
    // Any equivalent improper fraction is correct (18/8 or 9/4) — but not the mixed number itself.
    if (asText) return { type: "text", prompt: `${prompt} (type it like 9/7)`, answer: `${improper}/${d}`, accept: equivalentForms(improper, d, ""), display: { speak }, explain, hint };
    return fracChoice(rng, improper, d, [[w + n, d], [w * d, d], [improper, d * w], [w * n, d]], { prompt, display: { speak }, explain, hint }, frac);
  }
  const prompt = `Write ${improper}/${d} as a mixed number.`;
  const explain = `${improper} ÷ ${d} = ${w} remainder ${n}. So there are ${w} wholes and ${n}/${d} left over: ${w} ${n}/${d}${simpD !== d ? `, which simplifies to ${w} ${simpN}/${simpD}` : ""}.`;
  const hint = `How many whole groups of ${d} fit in ${improper}? The leftover pieces stay as a fraction.`;
  const speak = `Write ${improper} ${d}ths as a mixed number.`;
  // Any equivalent mixed number is correct (4 2/6 or 4 1/3) — but not an improper fraction.
  if (asText) return { type: "text", prompt: `${prompt} (type it like 2 1/7)`, answer: `${w} ${n}/${d}`, accept: equivalentForms(n, d, `${w} `), display: { speak }, explain, hint };
  return fracChoice(rng, improper, d, [[(w + 1) * d + n, d], [w * d + (n === d - 1 ? n - 1 : n + 1), d], [n * d + w, d]], { prompt, display: { speak }, explain, hint });
};

// ---------------------------------------------------------------------------
// multiplyFractionByWhole — 4.NF.B.4
// ---------------------------------------------------------------------------

const multiplyFractionByWhole: Generator = (ctx) => {
  const { rng } = ctx;
  const d = pick(rng, numListParam(ctx, "denoms", DENOMS_G4));
  const n = int(rng, 1, d - 1);
  const k = int(rng, 2, 6);
  const wordProblem = ctx.params?.wordProblem === true;
  const variant = wordProblem ? (rng() < 0.6 ? 3 : int(rng, 0, 2)) : int(rng, 0, 3);
  const prod = k * n;
  if (variant === 0 && n < 10) {
    return {
      type: "numeric",
      prompt: `${n}/${d} = ? × 1/${d}`,
      answer: n,
      display: { svg: barFractionSvg(d, Array.from({ length: n }, (_, i) => i)), speak: `${fracWords(n, d)} equals how many times one ${d}th?` },
      explain: `${n}/${d} is ${n} copies of the unit fraction 1/${d}: ${n}/${d} = ${n} × 1/${d}.`,
      hint: "A fraction is a multiple of its unit fraction. The top number says how many copies.",
    };
  }
  if (variant === 1) {
    return fracChoice(rng, prod, d, [[k + n, d], [prod, d * k], [n, d * k], [k * d, n]], {
      prompt: `${k} × ${n}/${d} = ?`,
      display: { svg: barFractionSvg(d, Array.from({ length: n }, (_, i) => i), COLORS.blue, Array.from({ length: Math.min(k - 1, 3) }, () => ({ parts: d, shaded: Array.from({ length: n }, (_, i) => i) }))), speak: `${k} times ${fracWords(n, d)}` },
      explain: `${k} groups of ${n}/${d}: multiply the top by ${k} and keep the denominator. ${k} × ${n} = ${prod}, so ${k} × ${n}/${d} = ${prod}/${d}${prod >= d ? ` = ${mixed(prod, d)}` : ""}.`,
      hint: `${k} × ${n}/${d} is ${k} copies of ${pieces(n)}. Count the pieces; the piece size (denominator) stays ${d}.`,
    });
  }
  if (variant === 2) {
    const answer = `${k * n}/${d}`;
    return labelChoice(rng, answer, [`${n}/${k * d}`, `${k * n}/${k * d}`, `${k + n}/${d}`], {
      prompt: `Which fraction equals ${k} × ${n}/${d}?`,
      display: { speak: `Which fraction equals ${k} times ${fracWords(n, d)}?` },
      explain: `${k} × ${n}/${d} = (${k} × ${n})/${d} = ${answer}. Only the numerator is multiplied — the pieces do not change size.`,
      hint: "Multiply the whole number by the top number only.",
    });
  }
  const name = pickName(rng);
  // [verb phrase, unit (singular), group noun, unit (plural)]
  const things = pick(rng, [
    ["each dancer drinks", "liter of water", "dancers", "liters of water"],
    ["each pony eats", "bag of oats", "ponies", "bags of oats"],
    ["each player runs", "mile", "players", "miles"],
    ["each recipe uses", "cup of sugar", "recipes", "cups of sugar"],
  ]);
  return fracChoice(rng, prod, d, [[k + n, d], [prod, d * k], [n, d * k], [k * d, n]], {
    prompt: `At ${name}'s practice, ${things[0]} ${n}/${d} ${things[1]}. How much for ${k} ${things[2]}?`,
    display: { speak: `${things[0]} ${fracWords(n, d)} ${things[1]}. How much for ${k} ${things[2]}?` },
    explain: `Equation: ${k} × ${n}/${d} = ${prod}/${d}${prod >= d ? ` = ${mixed(prod, d)}` : ""} ${prod > d ? things[3] : things[1]}. ${k} equal groups of ${pieces(n)} of size 1/${d}.`,
    hint: `${k} equal groups of ${n}/${d}: multiply. Only the top number changes.`,
  });
};

// ---------------------------------------------------------------------------
// decimalsTenthsHundredths — 4.NF.C.5-6
// ---------------------------------------------------------------------------

const decimalsTenthsHundredths: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const variant = mode === "tenthsToHundredths" ? int(rng, 0, 1) : mode === "notation" ? int(rng, 2, 4) : int(rng, 0, 4);
  const t = int(rng, 2, 9);
  const h = int(rng, 1, 99);
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: `${t}/10 = ?/100`,
      answer: t * 10,
      display: { svg: hundredGridSvg(t * 10), speak: `${t} tenths equals how many hundredths?` },
      explain: `Each tenth is 10 hundredths (one column of the grid). ${t} tenths = ${t} × 10 = ${t * 10} hundredths: ${t}/10 = ${t * 10}/100.`,
      hint: "One tenth is one full column of the hundred grid. How many little squares is that?",
    };
  }
  if (variant === 1) {
    const hh = int(rng, 1, 9);
    return {
      type: "numeric",
      prompt: `${t}/10 + ${hh}/100 = ?/100`,
      answer: t * 10 + hh,
      display: { svg: hundredGridSvg(t * 10 + hh), speak: `${t} tenths plus ${hh} hundredths equals how many hundredths?` },
      explain: `Change the tenths to hundredths first: ${t}/10 = ${t * 10}/100. Then add: ${t * 10}/100 + ${hh}/100 = ${t * 10 + hh}/100.`,
      hint: "Rewrite the tenths as hundredths (multiply top and bottom by 10). Then add the tops.",
    };
  }
  if (variant === 2) {
    const answer = `0.${String(h).padStart(2, "0")}`;
    const wrong = [`0.${h}${h < 10 ? "" : "0"}`, `${h}.0`, `0.${String(100 - h).padStart(2, "0")}`, `0.0${h}`].filter((w) => w !== answer && Number(w) !== Number(answer));
    return labelChoice(rng, answer, wrong, {
      prompt: "What decimal is shaded on the hundred grid?",
      display: { svg: hundredGridSvg(h), speak: "What decimal is shaded on the hundred grid?" },
      explain: `${h} of 100 squares are shaded: ${h}/100 = ${answer}. The first place after the point is tenths (full columns: ${Math.floor(h / 10)}), the second is hundredths (${h % 10} extra squares).`,
      hint: "Count full columns (tenths) and extra squares (hundredths). Write 0, a point, then tenths, then hundredths.",
    });
  }
  if (variant === 3) {
    const useTenths = rng() < 0.5;
    const n = useTenths ? t : h;
    const dd = useTenths ? 10 : 100;
    const answer = useTenths ? `0.${t}` : `0.${String(h).padStart(2, "0")}`;
    const wrong = useTenths ? [`0.0${t}`, `${t}.0`, `0.${t}${t}`] : [`0.${h}0`, `${h}.00`, `0.0${h}`];
    return labelChoice(rng, answer, wrong.filter((w) => Number(w) !== Number(answer)), {
      prompt: `Write ${n}/${dd} as a decimal.`,
      display: { speak: `Write ${fracWords(n, dd)} as a decimal.` },
      explain: `${n}/${dd} is ${fracWords(n, dd)}. ${useTenths ? "Tenths go in the first place after the point" : "Hundredths fill two places after the point"}: ${answer}.`,
      hint: useTenths ? "Tenths: one digit after the decimal point." : "Hundredths: two digits after the decimal point.",
    });
  }
  const m = int(rng, 1, 99);
  const answer = `0.${String(m).padStart(2, "0")}`;
  return {
    type: "text",
    prompt: `A ribbon is ${m} centimeters long. Write its length in meters as a decimal. (1 m = 100 cm)`,
    answer,
    accept: decAccept(m / 100),
    display: { svg: hundredGridSvg(m), speak: `A ribbon is ${m} centimeters long. Write its length in meters as a decimal.` },
    explain: `${m} cm is ${m}/100 of a meter, because a meter has 100 centimeters. ${m}/100 = ${answer} m.`,
    hint: "Centimeters are hundredths of a meter. Write 0, a point, then two digits.",
  };
};

// ---------------------------------------------------------------------------
// compareDecimals — 4.NF.C.7, 5.NBT.A.3b
// ---------------------------------------------------------------------------

const compareDecimals: Generator = (ctx) => {
  const { rng } = ctx;
  const places = numParam(ctx, "places", 2);
  const mk = () => {
    const p = int(rng, 1, places);
    const whole = rng() < 0.5 ? 0 : int(rng, 1, 9);
    const fracPart = int(rng, 1, 10 ** p - 1);
    return whole + fracPart / 10 ** p;
  };
  let a = mk();
  let b = mk();
  if (rng() < 0.12) b = a;
  if (rng() < 0.3 && a !== b) b = Math.round(a * 10) / 10;
  const sa = decShort(a);
  const sb = decShort(b);
  const sym = a > b ? ">" : a < b ? "<" : "=";
  if (rng() < 0.6) {
    const options = shuffle(rng, ["<", ">", "="]);
    const pad = Math.max(places, 2);
    return {
      type: "choice",
      prompt: `${sa} ○ ${sb}   Which sign makes it true?`,
      display: { speak: `Compare ${sa} and ${sb}.` },
      options: options.map((s) => ({ label: s })),
      answerIndex: options.indexOf(sym),
      explain: sym === "=" ? `${sa} and ${sb} are the same value: adding zeros on the end (${dec(a, pad)}) does not change a decimal.` : `Line up the decimal points and compare place by place: ${dec(a, pad)} and ${dec(b, pad)}. Compare the ${Math.floor(a) !== Math.floor(b) ? "ones" : Math.floor(a * 10) !== Math.floor(b * 10) ? "tenths" : Math.floor(a * 100) !== Math.floor(b * 100) ? "hundredths" : "thousandths"} first. ${sa} ${sym} ${sb}.`,
      hint: "Give both decimals the same number of places by adding zeros on the end. Then compare left to right.",
    };
  }
  const set = new Set<string>([sa, sb]);
  while (set.size < 4) set.add(decShort(mk()));
  const nums = [...set];
  const greatest = rng() < 0.5;
  const vals = nums.map(Number);
  const target = greatest ? Math.max(...vals) : Math.min(...vals);
  const answer = nums[vals.indexOf(target)];
  a = target;
  return labelChoice(rng, answer, nums.filter((x) => x !== answer), {
    prompt: `Which decimal is the ${greatest ? "greatest" : "least"}?`,
    display: { speak: `Which decimal is the ${greatest ? "greatest" : "least"}?` },
    explain: `Write them with the same number of places and compare left to right: ${[...vals].sort((x, y) => x - y).map((v) => dec(v, Math.max(places, 2))).join(" < ")}. The ${greatest ? "greatest" : "least"} is ${answer}.`,
    hint: "Compare the ones first, then tenths, then hundredths. More digits does not mean bigger.",
  });
};

// ---------------------------------------------------------------------------
// fractionDecimalEquivalents — 4.NF.C.6
// ---------------------------------------------------------------------------

const EQUIVS: [number, number, string][] = [
  [1, 2, "0.5"],
  [1, 4, "0.25"],
  [3, 4, "0.75"],
  [1, 5, "0.2"],
  [2, 5, "0.4"],
  [3, 5, "0.6"],
  [4, 5, "0.8"],
  [1, 10, "0.1"],
  [3, 10, "0.3"],
  [7, 10, "0.7"],
  [9, 10, "0.9"],
  [1, 100, "0.01"],
  [25, 100, "0.25"],
  [50, 100, "0.5"],
];

const fractionDecimalEquivalents: Generator = (ctx) => {
  const { rng } = ctx;
  const [n, d, decimal] = pick(rng, EQUIVS);
  const variant = strParam(ctx, "mode", "mixed") === "choice" ? int(rng, 0, 1) : int(rng, 0, 2);
  const shaded = Math.round((n / d) * 100);
  if (variant === 0) {
    const wrong = EQUIVS.map((e) => e[2]).filter((x) => x !== decimal);
    return labelChoice(rng, decimal, sample(rng, wrong, 3), {
      prompt: `Which decimal equals ${n}/${d}?`,
      display: { svg: hundredGridSvg(shaded), speak: `Which decimal equals ${fracWords(n, d)}?` },
      explain: `${n}/${d} = ${shaded}/100 (the grid shows ${shaded} of 100 squares), and ${shaded}/100 = ${decimal}.`,
      hint: `Change ${n}/${d} into hundredths first (how many squares of the hundred grid?), then write it as a decimal.`,
    });
  }
  if (variant === 1) {
    const answer = `${n}/${d}`;
    const wrong = [`${d}/${n}`, `${n}/${d * 10}`, `${n * 10}/${d}`, `${n + 1}/${d}`].filter((w) => w !== answer);
    return labelChoice(rng, answer, wrong, {
      prompt: `Which fraction equals ${decimal}?`,
      display: { svg: hundredGridSvg(shaded), speak: `Which fraction equals ${decimal}?` },
      explain: `${decimal} = ${shaded}/100 = ${n}/${d}${shaded !== n ? ` (divide top and bottom by ${100 / d})` : ""}.`,
      hint: "Read the decimal as hundredths, then simplify if you can.",
    });
  }
  if (d >= 10 || shaded === n) return fractionDecimalEquivalents({ ...ctx, params: { ...(ctx.params ?? {}), mode: "choice" } });
  return {
    type: "numeric",
    prompt: `${n}/${d} = ?/100`,
    answer: shaded,
    display: { svg: hundredGridSvg(shaded), speak: `${fracWords(n, d)} equals how many hundredths?` },
    explain: `Multiply top and bottom by ${100 / d}: ${n}/${d} = ${shaded}/100 — ${shaded} squares of the hundred grid, which is ${decimal}.`,
    hint: `What do you multiply ${d} by to get 100? Multiply the top by the same number.`,
  };
};

// ---------------------------------------------------------------------------
// decimalAddSub / decimalMultiply / decimalDivide — 5.NBT.B.7
// ---------------------------------------------------------------------------

function decQuestion(rng: () => number, answer: number, rawDistractors: number[], prompt: string, speak: string, explain: string, hint: string): import("../types").Question {
  const distractors = rawDistractors.map((d) => Math.round(d * 100) / 100);
  if (rng() < 0.5) {
    return { type: "text", prompt: `${prompt}  (type the decimal)`, answer: decShort(answer), accept: decAccept(answer), display: { speak }, explain, hint };
  }
  return numericChoice(rng, answer, distractors, { prompt, display: { speak }, explain, hint }, decShort);
}

const decimalAddSub: Generator = (ctx) => {
  const { rng } = ctx;
  const add = rng() < 0.55;
  const a = int(rng, 10, 999) / 100;
  const b = rng() < 0.5 ? int(rng, 1, 99) / 10 : int(rng, 10, 999) / 100;
  if (add) {
    const s = Math.round((a + b) * 100) / 100;
    return decQuestion(rng, s, [Math.round((a + b / 10) * 100) / 100, Math.round((a + b) * 100) / 100 + 0.1, Math.round((a + b * 10) * 100) / 100], `${decShort(a)} + ${decShort(b)} = ?`, `${decShort(a)} plus ${decShort(b)}`, `Line up the decimal points: ${dec(a, 2)} + ${dec(b, 2)}. Add hundredths, then tenths, then ones, carrying as usual: ${decShort(s)}.`, "Write the numbers so the decimal points sit under each other. Add zeros on the end so both have the same places.");
  }
  const big = Math.max(a, b);
  let small = Math.min(a, b);
  if (big === small) small = Math.round((small / 2) * 100) / 100;
  let dres = Math.round((big - small) * 100) / 100;
  if (Math.abs(dres - small) < 1e-9) {
    small = Math.round((small - 0.01) * 100) / 100;
    dres = Math.round((big - small) * 100) / 100;
  }
  return decQuestion(rng, dres, [Math.round((big - small / 10) * 100) / 100, dres + 0.1, Math.round((big - small) * 100) / 100 + 1], `${decShort(big)} − ${decShort(small)} = ?`, `${decShort(big)} minus ${decShort(small)}`, `Line up the decimal points: ${dec(big, 2)} − ${dec(small, 2)}. Subtract hundredths, then tenths, then ones, regrouping as usual: ${decShort(dres)}.`, "Line up the decimal points and add zeros so both numbers have two places. Then subtract like whole numbers.");
};

const decimalMultiply: Generator = (ctx) => {
  const { rng } = ctx;
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    // Explanations are built from whole tenths/hundredths: a * 10 in floating point can print 448.00000000000006.
    const at = int(rng, 2, 9);
    const a = at / 10;
    const k = int(rng, 2, 9);
    const p = (at * k) / 10;
    return decQuestion(rng, p, [at * k, p + 1, (at * k) / 100], `${decShort(a)} × ${k} = ?`, `${decShort(a)} times ${k}`, `Think ${at} tenths × ${k} = ${at * k} tenths = ${decShort(p)}. Or multiply ${at} × ${k} = ${at * k}, then put back the one decimal place.`, "Multiply as whole numbers, then count the decimal places in the factors and put the point back.");
  }
  if (variant === 1) {
    const at = int(rng, 11, 29);
    const bt = int(rng, 2, 9);
    const a = at / 10;
    const b = bt / 10;
    const p = (at * bt) / 100;
    return decQuestion(rng, p, [Math.round(a * b * 1000) / 100, Math.round(a * b * 10) / 100, p + 0.1], `${decShort(a)} × ${decShort(b)} = ?`, `${decShort(a)} times ${decShort(b)}`, `Multiply as whole numbers: ${at} × ${bt} = ${at * bt}. The factors have 1 + 1 = 2 decimal places, so the product has 2: ${decShort(p)}. Check: ${decShort(a)} × ${decShort(b)} should be less than ${decShort(a)} because ${decShort(b)} < 1.`, "Ignore the points and multiply. Then count the total decimal places in both factors and place the point.");
  }
  const ah = int(rng, 105, 995);
  const a = ah / 100;
  const k = int(rng, 2, 9);
  const p = (ah * k) / 100;
  return decQuestion(rng, p, [Math.round(a * k * 10) / 100, p + 1, Math.round(a * k * 1000) / 100], `${decShort(a)} × ${k} = ?`, `${decShort(a)} times ${k}`, `${ah} hundredths × ${k} = ${ah * k} hundredths = ${decShort(p)}. Estimate: ${Math.round(a)} × ${k} ≈ ${Math.round(a) * k}, so the point goes after the ones.`, "Multiply as if there were no point, then use an estimate to decide where the point goes.");
};

const decimalDivide: Generator = (ctx) => {
  const { rng } = ctx;
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    const k = int(rng, 2, 9);
    const qtTenths = int(rng, 2, 9);
    const qt = qtTenths + (rng() < 0.5 ? int(rng, 1, 3) * 10 : 0);
    const q = qt / 10;
    const nt = qt * k;
    const n = nt / 10;
    return decQuestion(rng, q, [qt, qt / 100, q + 1], `${decShort(n)} ÷ ${k} = ?`, `${decShort(n)} divided by ${k}`, `Share ${nt} tenths into ${k} equal groups: ${nt} ÷ ${k} = ${qt} tenths = ${decShort(q)}. Check: ${decShort(q)} × ${k} = ${decShort(n)}.`, "Think of the dividend in tenths, divide, then write the result as tenths.");
  }
  if (variant === 1) {
    const bt = int(rng, 2, 9);
    const b = bt / 10;
    const q = int(rng, 2, 12);
    const n = (bt * q) / 10;
    return {
      type: "numeric",
      prompt: `${decShort(n)} ÷ ${decShort(b)} = ?`,
      answer: q,
      display: { speak: `${decShort(n)} divided by ${decShort(b)}` },
      explain: `How many ${decShort(b)}s are in ${decShort(n)}? Multiply both by 10 to get whole numbers: ${bt * q} ÷ ${bt} = ${q}. Check: ${q} × ${decShort(b)} = ${decShort(n)}.`,
      hint: "Multiply both numbers by ten (move each decimal point one place right) so the divisor is a whole number. The quotient does not change.",
    };
  }
  const k = int(rng, 2, 9);
  const qh = int(rng, 105, 995);
  const q = qh / 100;
  const n = (qh * k) / 100;
  return decQuestion(rng, q, [Math.round(q * 10) / 100, q + 1, Math.round(q * 1000) / 100], `${decShort(n)} ÷ ${k} = ?`, `${decShort(n)} divided by ${k}`, `${qh * k} hundredths ÷ ${k} = ${qh} hundredths = ${decShort(q)}. Estimate first: ${decShort(n)} ÷ ${k} is about ${Math.round(n / k)}.`, "Divide as whole numbers (think hundredths), then place the point using an estimate.");
};

// ---------------------------------------------------------------------------
// powersOfTen — 5.NBT.A.2
// ---------------------------------------------------------------------------

const powersOfTen: Generator = (ctx) => {
  const { rng } = ctx;
  const variant = int(rng, 0, 4);
  if (variant === 0) {
    const n = int(rng, 2, 99);
    const p = pick(rng, [10, 100, 1000]);
    return {
      type: "numeric",
      prompt: `${n} × ${p} = ?`,
      answer: n * p,
      display: { speak: `${n} times ${p}` },
      explain: `Multiplying by ${p} shifts every digit ${String(p).length - 1} place${p > 10 ? "s" : ""} to the left — that is why ${String(p).length - 1} zero${p > 10 ? "s" : ""} appear: ${n} × ${p} = ${(n * p).toLocaleString("en-US")}.`,
      hint: `Count the zeros in ${p}. Each zero moves the digits one place to the left.`,
    };
  }
  if (variant === 1) {
    const q = int(rng, 2, 99);
    const p = pick(rng, [10, 100]);
    return {
      type: "numeric",
      prompt: `${(q * p).toLocaleString("en-US")} ÷ ${p} = ?`,
      answer: q,
      display: { speak: `${q * p} divided by ${p}` },
      explain: `Dividing by ${p} shifts the digits ${String(p).length - 1} place${p > 10 ? "s" : ""} to the right: ${(q * p).toLocaleString("en-US")} ÷ ${p} = ${q}.`,
      hint: `Dividing by ${p} removes ${String(p).length - 1} zero${p > 10 ? "s" : ""} (moves the digits right).`,
    };
  }
  if (variant === 2) {
    const e = int(rng, 2, 5);
    return numericChoice(rng, 10 ** e, [10 * e, 10 ** (e - 1), 10 ** (e + 1), e * e], {
      prompt: `10 to the power of ${e} (10^${e}) = ?`,
      display: { speak: `Ten to the power of ${e} equals what?` },
      explain: `10^${e} means ${Array.from({ length: e }, () => "10").join(" × ")} = ${(10 ** e).toLocaleString("en-US")}: a 1 followed by ${e} zeros.`,
      hint: "The exponent tells how many tens are multiplied — and how many zeros follow the 1.",
    }, (v) => v.toLocaleString("en-US"));
  }
  if (variant === 3) {
    const a = int(rng, 11, 99) / 10;
    const p = pick(rng, [10, 100]);
    const prod = Math.round(a * p);
    return {
      type: "numeric",
      prompt: `${decShort(a)} × ${p} = ?`,
      answer: prod,
      display: { speak: `${decShort(a)} times ${p}` },
      explain: `Multiplying by ${p} moves the decimal point ${String(p).length - 1} place${p > 10 ? "s" : ""} to the right: ${decShort(a)} → ${prod}.`,
      hint: `Move the decimal point to the right once for every zero in ${p}.`,
    };
  }
  const n = int(rng, 2, 99);
  const p = pick(rng, [10, 100]);
  const q = n / p;
  return { type: "text", prompt: `${n} ÷ ${p} = ?  (type the decimal)`, answer: decShort(q), accept: decAccept(q), display: { speak: `${n} divided by ${p}` }, explain: `Dividing by ${p} moves the decimal point ${String(p).length - 1} place${p > 10 ? "s" : ""} to the left: ${n} → ${decShort(q)}.`, hint: `Start with the point after the ${n}, and move it left once for each zero in ${p}.` };
};

// ---------------------------------------------------------------------------
// decimalPlaceValue — 5.NBT.A.3a
// ---------------------------------------------------------------------------

const decimalPlaceValue: Generator = (ctx) => {
  const { rng } = ctx;
  const whole = int(rng, 0, 9);
  const t = int(rng, 1, 9);
  const h = int(rng, 1, 9);
  const th = int(rng, 1, 9);
  const s = `${whole}.${t}${h}${th}`;
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    const which = pick(rng, [[t, "tenths"], [h, "hundredths"], [th, "thousandths"]] as const);
    const answer = `${which[0]} ${which[1]}`;
    const wrong = ["tenths", "hundredths", "thousandths", "ones"].filter((p) => p !== which[1]).map((p) => `${which[0]} ${p}`);
    return labelChoice(rng, answer, wrong, {
      prompt: `In ${s}, what is the value of the digit ${which[0]} in the ${which[1]} place?`,
      display: { speak: `In ${s}, what is the value of the digit ${which[0]} in the ${which[1]} place?` },
      explain: `After the point the places are tenths, hundredths, thousandths. The ${which[0]} in the ${which[1]} place is worth ${answer} (${which[1] === "tenths" ? `${which[0]}/10` : which[1] === "hundredths" ? `${which[0]}/100` : `${which[0]}/1000`}).`,
      hint: "Name the places after the decimal point in order: tenths, hundredths, thousandths.",
    });
  }
  if (variant === 1) {
    const name = `${whole === 0 ? "" : `${numberName(whole)} and `}${numberName(t * 100 + h * 10 + th)} thousandths`;
    const wrong = [`${whole}.${t}${h}`, `${whole}.0${t}${h}${th}`, `${whole}${t}.${h}${th}`, `${whole}.${th}${h}${t}`].filter((w) => w !== s);
    return labelChoice(rng, s, wrong, {
      prompt: `Which decimal is "${name}"?`,
      display: { speak: `Which decimal is ${name}?` },
      explain: `"Thousandths" means three places after the point. ${name} = ${s}.`,
      hint: "The last word names the last place. Thousandths = three digits after the point.",
    });
  }
  if (variant === 2) {
    const expanded = `${whole} + ${t} × (1/10) + ${h} × (1/100) + ${th} × (1/1000)`;
    const wrong = [`${whole} + ${t} × 10 + ${h} × 100 + ${th} × 1000`, `${whole} + ${t} × (1/100) + ${h} × (1/10) + ${th} × (1/1000)`, `${whole} + ${t} × (1/10) + ${h} × (1/10) + ${th} × (1/10)`];
    return labelChoice(rng, expanded, wrong, {
      prompt: `Which is the expanded form of ${s}?`,
      display: { speak: `Which is the expanded form of ${s}?` },
      explain: `Each digit times its place value: ${s} = ${expanded}.`,
      hint: "Tenths are × 1/10, hundredths × 1/100, thousandths × 1/1000.",
    });
  }
  const answer = `${whole}.${t}${h}`;
  const wrong = [`${whole}.${h}${t}`, `${whole}${t}.${h}`, `${whole}.0${t}${h}`].filter((w) => w !== answer);
  return labelChoice(rng, answer, wrong, {
    prompt: `Write ${whole} + ${t}/10 + ${h}/100 as a decimal.`,
    display: { speak: `Write ${whole} plus ${t} tenths plus ${h} hundredths as a decimal.` },
    explain: `${whole} ones, ${t} tenths, ${h} hundredths → ${answer}.`,
    hint: "Ones before the point; tenths then hundredths after it.",
  });
};

// ---------------------------------------------------------------------------
// addSubUnlikeDenominators — 5.NF.A.1-2
// ---------------------------------------------------------------------------

const addSubUnlikeDenominators: Generator = (ctx) => {
  const { rng } = ctx;
  const useMixed = ctx.params?.mixed === true;
  const wordProblem = ctx.params?.wordProblem === true;
  const pairs: [number, number][] = [[2, 3], [2, 4], [2, 5], [2, 6], [2, 8], [3, 4], [3, 6], [4, 6], [4, 8], [3, 5], [5, 10], [4, 12], [6, 8]];
  const [d1, d2] = shuffle(rng, pick(rng, pairs));
  const l = lcm(d1, d2);
  const n1 = int(rng, 1, d1 - 1);
  const n2 = int(rng, 1, d2 - 1);
  const add = rng() < 0.6;
  const a = n1 * (l / d1);
  const b = n2 * (l / d2);
  const w1 = useMixed ? int(rng, 1, 4) : 0;
  const w2 = useMixed ? int(rng, 1, 3) : 0;
  let total: number;
  let left: string;
  let right: string;
  let steps: string;
  /** values of the left and right operands, for the estimate check */
  let leftVal: number;
  let rightVal: number;
  if (add || a === b) {
    total = (w1 + w2) * l + a + b;
    leftVal = w1 + n1 / d1;
    rightVal = w2 + n2 / d2;
    left = useMixed ? `${w1} ${n1}/${d1}` : `${n1}/${d1}`;
    right = useMixed ? `${w2} ${n2}/${d2}` : `${n2}/${d2}`;
    steps = `Common denominator ${l}: ${n1}/${d1} = ${a}/${l} and ${n2}/${d2} = ${b}/${l}. Add: ${a}/${l} + ${b}/${l} = ${a + b}/${l}${useMixed ? `. Wholes: ${w1} + ${w2} = ${w1 + w2}` : ""}. Answer: ${mixed(total, l)}${simplify(total, l)[1] !== l ? ` = ${mixed(...simplify(total, l))}` : ""}.`;
  } else {
    const bigIsFirst = a > b;
    const [ln, ld, lw] = bigIsFirst ? [n1, d1, Math.max(w1, w2)] : [n2, d2, Math.max(w1, w2)];
    const [sn, sd, sw] = bigIsFirst ? [n2, d2, Math.min(w1, w2)] : [n1, d1, Math.min(w1, w2)];
    const la = Math.max(a, b);
    const sb = Math.min(a, b);
    total = (lw - sw) * l + la - sb;
    leftVal = lw + ln / ld;
    rightVal = sw + sn / sd;
    left = useMixed ? `${lw} ${ln}/${ld}` : `${ln}/${ld}`;
    right = useMixed ? `${sw} ${sn}/${sd}` : `${sn}/${sd}`;
    steps = `Common denominator ${l}: ${ln}/${ld} = ${la}/${l} and ${sn}/${sd} = ${sb}/${l}. Subtract: ${la}/${l} − ${sb}/${l} = ${la - sb}/${l}${useMixed ? `. Wholes: ${lw} − ${sw} = ${lw - sw}` : ""}. Answer: ${mixed(total, l)}${simplify(total, l)[1] !== l ? ` = ${mixed(...simplify(total, l))}` : ""}.`;
  }
  const op = add || a === b ? "+" : "−";
  const distractors: [number, number][] = [[(add ? n1 + n2 : Math.abs(n1 - n2)) || 1, d1 + d2], [total + 1, l], [total, l * 2], [(add ? n1 + n2 : Math.abs(n1 - n2)) || 1, Math.max(d1, d2)]];
  const hint = `The denominators are different, so first rewrite both fractions with the same denominator (try ${l}).`;
  if (wordProblem) {
    const name = pickName(rng);
    const unit = pick(rng, [
      ["ran", "miles", "How far did ${name} run in all?", "had", "miles of trail to run", "ran"],
      ["practiced", "hours", "How long did ${name} practice in all?", "had", "hours of free time", "used"],
      ["used", "cups of flour", "How much flour in all?", "had", "cups of flour", "used"],
      ["cut", "yards of ribbon", "How much ribbon in all?", "had", "yards of ribbon", "cut off"],
    ] as const);
    const prompt =
      op === "+"
        ? `${name} ${unit[0]} ${left} ${unit[1]} in the morning and ${right} ${unit[1]} after school. ${unit[2].replace("${name}", name)}`
        : `${name} ${unit[3]} ${left} ${unit[4]} and ${unit[5]} ${right}. How much is left?`;
    // Benchmark estimate (5.NF.A.2): round each operand to the nearest half, then do the same operation.
    const lh = nearestHalf(leftVal);
    const rh = nearestHalf(rightVal);
    const estimate = `Estimate check: ${left} is about ${halfText(lh)} and ${right} is about ${halfText(rh)}, so the answer should be about ${halfText(op === "+" ? lh + rh : lh - rh)}.`;
    return fracChoice(rng, total, l, distractors, { prompt, display: { speak: prompt }, explain: `${op === "+" ? "In all means add" : "Left means subtract"}. ${steps} ${estimate}`, hint });
  }
  const prompt = `${left} ${op} ${right} = ?`;
  const speak = `${left.replace("/", " over ")} ${op === "+" ? "plus" : "minus"} ${right.replace("/", " over ")}`;
  if (rng() < 0.4) return fracText(total, l, { prompt: `${prompt}  (type a fraction like 5/6 or a mixed number)`, display: { speak }, explain: steps, hint }, rng);
  return fracChoice(rng, total, l, distractors, { prompt, display: { speak }, explain: steps, hint });
};

// ---------------------------------------------------------------------------
// fractionAsDivision — 5.NF.B.3
// ---------------------------------------------------------------------------

const fractionAsDivision: Generator = (ctx) => {
  const { rng } = ctx;
  const a = int(rng, 1, 9);
  let b = int(rng, 2, 9);
  if (b === a) b = a + 1;
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    return fracChoice(rng, a, b, [[b, a], [1, a], [1, b], [a, a + b]], {
      prompt: `${a} ÷ ${b} = ?`,
      display: { speak: `${a} divided by ${b}, as a fraction` },
      explain: `A fraction IS a division: a/b means a ÷ b. So ${a} ÷ ${b} = ${a}/${b}${a > b ? ` = ${mixed(a, b)}` : ""}. Picture ${a} things shared by ${b}: each gets ${a}/${b}.`,
      hint: "Write the number being divided on top and the divisor on the bottom.",
    }, (n, d) => (n % d === 0 ? String(n / d) : `${n}/${d}`));
  }
  if (variant === 1) {
    const items = int(rng, 2, 9);
    const people = int(rng, 2, 8);
    const thing = pick(rng, ["pizzas", "pans of brownies", "yards of ribbon", "bags of oats"]);
    return fracChoice(rng, items, people, [[people, items], [1, people], [items, items + people], [1, items]], {
      prompt: `${items} ${thing} are shared equally by ${people} friends. How much does each friend get?`,
      display: { speak: `${items} ${thing} are shared equally by ${people} friends. How much does each friend get?` },
      explain: `Sharing is division: ${items} ÷ ${people} = ${items}/${people}${items > people ? ` = ${mixed(items, people)}` : ""} each. (Each of the ${items} items is cut into ${people} parts; each friend gets ${items} parts of size 1/${people}.)`,
      hint: "Total ÷ number of friends. Write that division as a fraction.",
    });
  }
  const answer = `${a} ÷ ${b}`;
  return labelChoice(rng, answer, [`${b} ÷ ${a}`, `${a} × ${b}`, `${b} − ${a}`], {
    prompt: `Which division equals the fraction ${a}/${b}?`,
    display: { speak: `Which division equals the fraction ${fracWords(a, b)}?` },
    explain: `${a}/${b} means ${a} divided by ${b}: the numerator is divided by the denominator.`,
    hint: "Top number divided by bottom number.",
  });
};

// ---------------------------------------------------------------------------
// multiplyFractions — 5.NF.B.4 (a/b × c/d, area), 5.NF.B.6 (word problems)
// ---------------------------------------------------------------------------

function areaModelFracSvg(n1: number, d1: number, n2: number, d2: number): string {
  const out: string[] = [];
  const x0 = 10;
  const y0 = 10;
  const size = 80;
  const cw = size / d2;
  const rh = size / d1;
  for (let r = 0; r < d1; r++) {
    for (let c = 0; c < d2; c++) {
      const inRow = r < n1;
      const inCol = c < n2;
      const fill = inRow && inCol ? "#7c3aed" : inRow ? "#bfdbfe" : inCol ? "#fde68a" : "#fff";
      out.push(`<rect x="${r1(x0 + c * cw)}" y="${r1(y0 + r * rh)}" width="${r1(cw)}" height="${r1(rh)}" fill="${fill}" stroke="${COLORS.ink}" stroke-width="0.8"/>`);
    }
  }
  out.push(svgText(50, 97, `${n2}/${d2} across`, 5));
  out.push(`<g transform="rotate(-90 4 50)">${svgText(4, 50, `${n1}/${d1} down`, 5)}</g>`);
  return svgWrap(out.join(""));
}

const multiplyFractions: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const d1 = pick(rng, [2, 3, 4, 5]);
  const d2 = pick(rng, [2, 3, 4, 5, 6].filter((x) => x !== d1 || x > 2));
  const n1 = int(rng, 1, d1 - 1);
  const n2 = int(rng, 1, d2 - 1);
  const pn = n1 * n2;
  const pd = d1 * d2;
  const [sn, sd] = simplify(pn, pd);
  const variant = mode === "area" ? 1 : mode === "wordProblem" ? 2 : int(rng, 0, 2);
  const distractors: [number, number][] = [[n1 + n2, d1 + d2], [pn, d1 + d2], [n1 * d2 + n2 * d1, pd], [pn, Math.max(d1, d2)]];
  const explain = `Multiply tops and multiply bottoms: ${n1} × ${n2} = ${pn} and ${d1} × ${d2} = ${pd}, so ${n1}/${d1} × ${n2}/${d2} = ${pn}/${pd}${sd !== pd ? ` = ${sn}/${sd}` : ""}. The picture: ${n1}/${d1} of the rows and ${n2}/${d2} of the columns overlap in ${pn} of ${pd} little rectangles.`;
  if (variant === 0) {
    return fracChoice(rng, pn, pd, distractors, {
      prompt: `${n1}/${d1} × ${n2}/${d2} = ?`,
      display: { svg: areaModelFracSvg(n1, d1, n2, d2), speak: `${fracWords(n1, d1)} times ${fracWords(n2, d2)}` },
      explain,
      hint: "Multiply the two top numbers; multiply the two bottom numbers. Count the overlap in the picture to check.",
    }, frac);
  }
  if (variant === 1) {
    const unit = pick(rng, ["m", "ft", "yd"]);
    return fracChoice(rng, pn, pd, distractors, {
      prompt: `A rectangle is ${n1}/${d1} ${unit} by ${n2}/${d2} ${unit}. What is its area in square ${unit}?`,
      display: { svg: areaModelFracSvg(n1, d1, n2, d2), speak: `A rectangle is ${fracWords(n1, d1)} by ${fracWords(n2, d2)} ${unit}. What is its area?` },
      explain: `Area = length × width, even with fractions: ${explain} Tiling the unit square with 1/${d1} by 1/${d2} rectangles shows ${pn} of the ${pd} tiles.`,
      hint: "Area is still length times width. Multiply the fractions.",
    }, frac);
  }
  const name = pickName(rng);
  const whole = pick(rng, ["cup of flour", "mile", "hour", "tank of gas", "pizza"]);
  return fracChoice(rng, pn, pd, distractors, {
    prompt: `A recipe calls for ${n2}/${d2} ${whole}. ${name} makes only ${n1}/${d1} of the recipe. How much does ${name} use?`,
    display: { speak: `A recipe calls for ${fracWords(n2, d2)} ${whole}. ${name} makes only ${fracWords(n1, d1)} of the recipe. How much does ${name} use?` },
    explain: `"${n1}/${d1} of ${n2}/${d2}" means multiply: ${explain}`,
    hint: "'Of' means multiply. A fraction OF a fraction is their product.",
  }, frac);
};

// ---------------------------------------------------------------------------
// fractionScaling — 5.NF.B.5
// ---------------------------------------------------------------------------

const fractionScaling: Generator = (ctx) => {
  const { rng } = ctx;
  const q = int(rng, 4, 40);
  const d = pick(rng, [2, 3, 4, 5, 8]);
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    const n = pick(rng, [int(rng, 1, d - 1), d, d + int(rng, 1, 3)]);
    const rel = n < d ? "less than" : n === d ? "equal to" : "greater than";
    const answer = `${rel} ${q}`;
    return labelChoice(rng, answer, [`less than ${q}`, `equal to ${q}`, `greater than ${q}`].filter((o) => o !== answer), {
      prompt: `Without multiplying: ${n}/${d} × ${q} is …`,
      display: { speak: `Without multiplying: ${fracWords(n, d)} times ${q} is less than, equal to, or greater than ${q}?` },
      explain: n < d ? `${n}/${d} is less than 1, so multiplying by it shrinks ${q}: the product is less than ${q}.` : n === d ? `${n}/${d} equals 1, so the product is exactly ${q}.` : `${n}/${d} is greater than 1, so multiplying by it makes ${q} bigger.`,
      hint: "Is the fraction less than 1, equal to 1, or more than 1? That tells whether the product shrinks, stays, or grows.",
    });
  }
  if (variant === 1) {
    const n = int(rng, 1, d - 1);
    const answer = `${q} × ${d}/${n}`;
    return labelChoice(rng, answer, [`${q} × ${n}/${d}`, `${q} × ${d}/${d}`, `${q} × 1/${d}`], {
      prompt: `Which product is greater than ${q}?`,
      display: { speak: `Which product is greater than ${q}?` },
      explain: `${d}/${n} is more than 1, so ${q} × ${d}/${n} is more than ${q}. ${n}/${d} and 1/${d} are less than 1 (they shrink ${q}), and ${d}/${d} = 1 keeps it the same.`,
      hint: "Look for the factor that is bigger than 1.",
    });
  }
  const n = int(rng, 1, d - 1);
  const k = int(rng, 2, 4);
  const answer = `${k * q}`;
  return numericChoice(rng, q * k, [q * n, Math.round((q * n) / d), q + k], {
    prompt: `Which is bigger: ${k} × ${q} or ${n}/${d} × ${q}? Give the bigger product.`,
    display: { speak: `Which is bigger: ${k} times ${q}, or ${fracWords(n, d)} times ${q}? Give the bigger product.` },
    explain: `${k} is greater than 1, so ${k} × ${q} = ${answer} is bigger than ${q}. ${n}/${d} is less than 1, so ${n}/${d} × ${q} is smaller than ${q}.`,
    hint: "Multiplying by a number bigger than 1 makes it bigger; by a fraction less than 1 makes it smaller.",
  });
};

// ---------------------------------------------------------------------------
// divideUnitFractions — 5.NF.B.7
// ---------------------------------------------------------------------------

const divideUnitFractions: Generator = (ctx) => {
  const { rng } = ctx;
  const d = pick(rng, [2, 3, 4, 5, 6, 8]);
  const k = int(rng, 2, 6);
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    return fracChoice(rng, 1, d * k, [[k, d], [1, d + k], [d, k], [1, d]], {
      prompt: `1/${d} ÷ ${k} = ?`,
      display: { svg: barFractionSvg(d, [0], COLORS.blue, [{ parts: d * k, shaded: [0], color: COLORS.amber }]), speak: `one ${d}th divided by ${k}` },
      explain: `Split one ${d}th into ${k} equal pieces. Each piece is 1/${d * k} of the whole: 1/${d} ÷ ${k} = 1/${d * k}. Check: ${k} × 1/${d * k} = ${k}/${d * k} = 1/${d}.`,
      hint: "Cutting a piece into more pieces makes each one smaller. Multiply the denominator.",
    }, frac);
  }
  if (variant === 1) {
    return {
      type: "numeric",
      prompt: `${k} ÷ 1/${d} = ?`,
      answer: k * d,
      display: { speak: `${k} divided by one ${d}th` },
      explain: `How many ${d}ths fit in ${k} wholes? Each whole has ${d} of them, so ${k} wholes have ${k} × ${d} = ${k * d}. Check: ${k * d} × 1/${d} = ${k}.`,
      hint: `Ask: how many pieces of size 1/${d} are in one whole? Then in ${k} wholes?`,
    };
  }
  if (variant === 2) {
    const cups = int(rng, 2, 6);
    return {
      type: "numeric",
      prompt: `How many 1/${d}-cup servings are in ${cups} cups of oats?`,
      answer: cups * d,
      display: { speak: `How many one ${d}th cup servings are in ${cups} cups of oats?` },
      explain: `${cups} ÷ 1/${d}: each cup holds ${d} servings of 1/${d} cup, so ${cups} cups hold ${cups} × ${d} = ${cups * d} servings.`,
      hint: "Count the servings in one cup first, then multiply by the number of cups.",
    };
  }
  const name = pickName(rng);
  return fracChoice(rng, 1, d * k, [[k, d], [1, d + k], [d, k], [1, d]], {
    prompt: `${name} shares 1/${d} of a pan of brownies equally with ${k} friends (${k} shares). What fraction of the pan does each get?`,
    display: { speak: `${name} shares one ${d}th of a pan of brownies equally into ${k} shares. What fraction of the pan is each share?` },
    explain: `1/${d} ÷ ${k} = 1/${d * k}. The ${d}th is cut into ${k} pieces, and ${d} × ${k} = ${d * k} such pieces would fill the whole pan.`,
    hint: "Dividing a unit fraction by a whole number: multiply the denominator by that number.",
  }, frac);
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  fractionOfShape,
  fractionNumberLine,
  equivalentFractions,
  compareFractions,
  addSubLikeDenominators,
  mixedImproper,
  multiplyFractionByWhole,
  decimalsTenthsHundredths,
  compareDecimals,
  fractionDecimalEquivalents,
  decimalAddSub,
  decimalMultiply,
  decimalDivide,
  powersOfTen,
  decimalPlaceValue,
  addSubUnlikeDenominators,
  fractionAsDivision,
  multiplyFractions,
  fractionScaling,
  divideUnitFractions,
};
