/**
 * Math generators, grades 3-5, part A (Cole's track): multiplication and
 * division facts, multi-digit operations, place value to millions, factors,
 * rounding, patterns, multi-step word problems, order of operations.
 * Part B (fractions, decimals, measurement, geometry, data) is in
 * ./math-upper-frac.ts.
 *
 * Rules: pure functions of ctx.rng, relative imports, `import type`, no DOM.
 * `explain` states the rule and the steps; `hint` nudges without giving the
 * answer. SVGs: viewBox 0 0 100 100, no id="".
 */

import type { Generator } from "../types";
import { int, pick, shuffle, sample } from "../rng";
import {
  COLORS,
  SCENES_UPPER,
  columnAddExplain,
  columnSubExplain,
  fmt,
  labelChoice,
  levelOf,
  numListParam,
  numParam,
  numberName,
  numericChoice,
  pickName,
  r1,
  strParam,
  svgText,
  svgWrap,
} from "./math-util";

function digitsOf(n: number): number[] {
  return String(n).split("").map(Number);
}

/**
 * Replace every occurrence of digit `d` in `n` except the one at place 10^k with
 * another digit (never a leading 0), so "the value of the digit d" is unambiguous.
 */
function onlyOnce(n: number, k: number, d: number): number {
  const s = String(n).split("");
  const kIdx = s.length - 1 - k;
  return Number(
    s
      .map((c, i) => {
        if (i === kIdx || Number(c) !== d) return c;
        let r = (d + 1 + (i % 8)) % 10;
        if (i === 0 && r === 0) r = 1;
        return String(r);
      })
      .join("")
  );
}

function partialProducts(a: number, b: number): { parts: string[]; values: number[] } {
  const ds = digitsOf(a);
  const parts: string[] = [];
  const values: number[] = [];
  ds.forEach((d, i) => {
    const place = 10 ** (ds.length - 1 - i);
    if (d === 0) return;
    parts.push(`${fmt(d * place)} × ${b} = ${fmt(d * place * b)}`);
    values.push(d * place * b);
  });
  return { parts, values };
}

/** Rectangle split into two parts along the width (area model for the distributive property). */
function splitRectSvg(a: number, b1: number, b2: number): string {
  const total = b1 + b2;
  const w = 80;
  const w1 = (b1 / total) * w;
  const h = Math.min(50, Math.max(22, a * 5));
  const x0 = 14;
  const y0 = 50 - h / 2 + 4;
  return svgWrap(
    `<rect x="${x0}" y="${y0}" width="${r1(w1)}" height="${h}" fill="#bfdbfe" stroke="${COLORS.ink}" stroke-width="1.5"/>` +
      `<rect x="${r1(x0 + w1)}" y="${y0}" width="${r1(w - w1)}" height="${h}" fill="#fde68a" stroke="${COLORS.ink}" stroke-width="1.5"/>` +
      svgText(x0 + w1 / 2, y0 - 4, String(b1), 7, 'font-weight="700"') +
      svgText(x0 + w1 + (w - w1) / 2, y0 - 4, String(b2), 7, 'font-weight="700"') +
      svgText(x0 - 6, y0 + h / 2 + 2.5, String(a), 7, 'font-weight="700"')
  );
}

// ---------------------------------------------------------------------------
// multFacts — 3.OA.C.7 (params min/max, mixed → some division)
// ---------------------------------------------------------------------------

function multExplain(a: number, b: number): string {
  const prod = a * b;
  if (a === 0 || b === 0) return `Anything times 0 is 0. ${a} × ${b} = 0.`;
  if (a === 1 || b === 1) return `Anything times 1 is itself. ${a} × ${b} = ${prod}.`;
  if (a === 2 || b === 2) {
    const other = a === 2 ? b : a;
    return `Times 2 is a double: ${other} + ${other} = ${prod}.`;
  }
  if (a === 10 || b === 10) {
    const other = a === 10 ? b : a;
    return `Times 10 adds a zero: ${other} becomes ${other}0. ${a} × ${b} = ${prod}.`;
  }
  if (a === 5 || b === 5) {
    const other = a === 5 ? b : a;
    return `Skip count by 5, ${other} times: ${Array.from({ length: other }, (_, i) => 5 * (i + 1)).join(", ")}. So ${a} × ${b} = ${prod}.`;
  }
  if (a === 9 || b === 9) {
    const other = a === 9 ? b : a;
    return `Nines trick: ${other} × 10 = ${other * 10}, take away ${other}: ${other * 10} − ${other} = ${prod}.`;
  }
  if (a === b) return `Square number: ${a} × ${a} = ${prod}. (Doubling helps: ${a} × ${a - 1} = ${a * (a - 1)}, plus one more ${a} is ${prod}.)`;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  if (big < 6) {
    // Only 3 × 4 / 4 × 3 reach here (0, 1, 2, 5 are handled above): small × (big − 5) would be negative.
    return `${a} × ${b} means ${a} groups of ${b}. Times 4 is double, then double again: ${small} + ${small} = ${small * 2}, and ${small * 2} + ${small * 2} = ${prod}. Turn-around: ${b} × ${a} = ${prod} too.`;
  }
  return `${a} × ${b} means ${a} groups of ${b}. Build from a fact you know: ${small} × 5 = ${small * 5}, then ${small} × ${big - 5} = ${small * (big - 5)}; ${small * 5} + ${small * (big - 5)} = ${prod}. Turn-around: ${b} × ${a} = ${prod} too.`;
}

function multHint(a: number, b: number): string {
  if (a === 0 || b === 0) return "What is any number times zero?";
  if (a === 1 || b === 1) return "Any number times 1 stays the same.";
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const terms = Math.min(small - 1, 3);
  if (terms <= 0) return `Think of ${big} groups of ${small}.`;
  return `Skip count by ${big}: ${Array.from({ length: terms }, (_, i) => big * (i + 1)).join(", ")}, … (${small} times in all).`;
}

const multFacts: Generator = (ctx) => {
  const { rng } = ctx;
  const min = numParam(ctx, "min", 0);
  const max = numParam(ctx, "max", 10);
  const mixed = ctx.params?.mixed === true;
  const a = rng() < 0.75 ? int(rng, Math.max(min, 3), Math.min(max, 9)) : int(rng, min, max);
  const b = rng() < 0.75 ? int(rng, Math.max(min, 3), Math.min(max, 9)) : int(rng, min, max);
  if (mixed && rng() < 0.5 && b !== 0 && a !== b) {
    return {
      type: "numeric",
      prompt: `${a * b} ÷ ${b} = ?`,
      answer: a,
      display: { speak: `${a * b} divided by ${b}` },
      explain: `Division is the missing factor: ${b} × ? = ${a * b}. ${b} × ${a} = ${a * b}, so ${a * b} ÷ ${b} = ${a}.`,
      hint: `Think: ${b} times what makes ${a * b}?`,
    };
  }
  return {
    type: "numeric",
    prompt: `${a} × ${b} = ?`,
    answer: a * b,
    display: { speak: `${a} times ${b}` },
    explain: multExplain(a, b),
    hint: multHint(a, b),
  };
};

// ---------------------------------------------------------------------------
// divFacts — 3.OA.A.2, 3.OA.B.6, 3.OA.C.7
// ---------------------------------------------------------------------------

const divFacts: Generator = (ctx) => {
  const { rng } = ctx;
  const context = ctx.params?.context === true;
  const unknownFactor = ctx.params?.asUnknownFactor === true;
  const a = int(rng, 2, 9);
  const b = int(rng, 2, 9);
  const p = a * b;
  const variant = rng();
  if (context && variant < 0.6) {
    const name = pickName(rng);
    const scene = pick(rng, SCENES_UPPER);
    const shares = rng() < 0.5;
    const groups = pick(rng, ["teams", "bags", "boxes", "rows"]);
    if (shares) {
      return {
        type: "numeric",
        prompt: `${name} shares ${p} ${scene.item[1]} equally among ${b} ${groups}. How many does each get?`,
        answer: a,
        display: { speak: `${name} shares ${p} ${scene.item[1]} equally among ${b} ${groups}. How many does each get?` },
        explain: `Sharing equally is division: ${p} ÷ ${b} = ${a}. Check with multiplication: ${b} × ${a} = ${p}. Here the answer is the size of each share.`,
        hint: `${p} split into ${b} equal shares. Think: ${b} times what makes ${p}?`,
      };
    }
    return {
      type: "numeric",
      prompt: `${name} puts ${p} ${scene.item[1]} into ${groups} of ${b}. How many ${groups} are there?`,
      answer: a,
      display: { speak: `${name} puts ${p} ${scene.item[1]} into ${groups} of ${b}. How many ${groups}?` },
      explain: `Making groups of a known size is also division: ${p} ÷ ${b} = ${a}. Here the answer is the number of groups. Check: ${a} × ${b} = ${p}.`,
      hint: `How many ${b}s are in ${p}? Skip count by ${b}.`,
    };
  }
  if (unknownFactor && variant < 0.8) {
    return {
      type: "numeric",
      prompt: `${p} ÷ ${b} = ?   (Think: ${b} × ? = ${p})`,
      answer: a,
      display: { speak: `${p} divided by ${b}. Think ${b} times what equals ${p}?` },
      explain: `Division is an unknown-factor problem. ${b} × ${a} = ${p}, so ${p} ÷ ${b} = ${a}.`,
      hint: `Run through the ${b}s facts: ${b} × 2, ${b} × 3, … until you hit ${p}.`,
    };
  }
  return {
    type: "numeric",
    prompt: `${p} ÷ ${b} = ?`,
    answer: a,
    display: { speak: `${p} divided by ${b}` },
    explain: `Think multiplication: ${b} × ? = ${p}. ${b} × ${a} = ${p}, so ${p} ÷ ${b} = ${a}.`,
    hint: `Think: ${b} times what makes ${p}?`,
  };
};

// ---------------------------------------------------------------------------
// missingFactor — 3.OA.A.4
// ---------------------------------------------------------------------------

const missingFactor: Generator = (ctx) => {
  const { rng } = ctx;
  const a = int(rng, 2, 9);
  const b = int(rng, 2, 9);
  const p = a * b;
  const variant = int(rng, 0, 4);
  const mult = `${b} × ${a} = ${p}`;
  switch (variant) {
    case 0:
      return { type: "numeric", prompt: `${b} × ___ = ${p}`, answer: a, display: { speak: `${b} times what equals ${p}?` }, explain: `Think: ${b} times what makes ${p}? ${mult}. The missing factor is ${a}.`, hint: `Count by ${b}s until you reach ${p}. How many counts?` };
    case 1:
      return { type: "numeric", prompt: `___ × ${b} = ${p}`, answer: a, display: { speak: `What times ${b} equals ${p}?` }, explain: `${mult}, so the missing factor is ${a}. (Order does not matter: ${a} × ${b} = ${p} too.)`, hint: `Which number times ${b} gives ${p}?` };
    case 2:
      return { type: "numeric", prompt: `${p} ÷ ___ = ${a}`, answer: b, display: { speak: `${p} divided by what equals ${a}?` }, explain: `Use the related multiplication: ${a} × ? = ${p}. ${a} × ${b} = ${p}, so the missing number is ${b}.`, hint: `Rewrite it as a multiplication: ${a} times what makes ${p}?` };
    case 3:
      return { type: "numeric", prompt: `___ ÷ ${b} = ${a}`, answer: p, display: { speak: `What divided by ${b} equals ${a}?` }, explain: `If the quotient is ${a} and the divisor is ${b}, the start number is ${b} × ${a} = ${p}.`, hint: `Multiply the two numbers you know.` };
    default:
      return { type: "numeric", prompt: `${a} = ___ ÷ ${b}`, answer: p, display: { speak: `${a} equals what divided by ${b}?` }, explain: `Read it as "${a} is what divided by ${b}?" Multiply back: ${a} × ${b} = ${p}.`, hint: `The equal sign just means "same as". What number divided by ${b} gives ${a}?` };
  }
};

// ---------------------------------------------------------------------------
// multProperties — 3.OA.B.5 (commutative, associative, distributive)
// ---------------------------------------------------------------------------

const multProperties: Generator = (ctx) => {
  const { rng } = ctx;
  const a = int(rng, 3, 9);
  const b = int(rng, 6, 9);
  const variant = int(rng, 0, 4);
  if (variant === 0) {
    const b1 = 5;
    const b2 = b - 5;
    return {
      type: "numeric",
      prompt: `${a} × ${b} = (${a} × ${b1}) + (${a} × ___)`,
      answer: b2,
      display: { svg: splitRectSvg(a, b1, b2), speak: `${a} times ${b} equals ${a} times ${b1} plus ${a} times what?` },
      explain: `Break ${b} into ${b1} + ${b2}. Then ${a} × ${b} = ${a} × ${b1} + ${a} × ${b2} = ${a * b1} + ${a * b2} = ${a * b}. That is the distributive property — the picture shows the rectangle cut into two parts.`,
      hint: `${b} was split into ${b1} and another piece. What is ${b} − ${b1}?`,
    };
  }
  if (variant === 1) {
    return labelChoice(rng, `${b} × ${a}`, [`${a} + ${b}`, `${a} × ${a}`, `${b} × ${b}`], {
      prompt: `Which has the same product as ${a} × ${b}?`,
      display: { speak: `Which has the same product as ${a} times ${b}?` },
      explain: `Commutative property: you can multiply in either order. ${a} × ${b} = ${a * b} and ${b} × ${a} = ${a * b}. (${a} rows of ${b} and ${b} rows of ${a} have the same number of dots.)`,
      hint: "Turn the array sideways. Does the number of dots change?",
    });
  }
  if (variant === 2) {
    const c = pick(rng, [2, 5]);
    const d = c === 2 ? 5 : 2;
    const e = int(rng, 3, 9);
    return {
      type: "numeric",
      prompt: `${e} × ${c} × ${d} = ?`,
      answer: e * c * d,
      display: { speak: `${e} times ${c} times ${d}` },
      explain: `Associative property: group the easy pair first. ${c} × ${d} = 10, then ${e} × 10 = ${e * 10}.`,
      hint: "Look for two factors that make 10. Multiply those first.",
    };
  }
  if (variant === 3) {
    const n = int(rng, 11, 19);
    const answer = `${a} × 10 + ${a} × ${n - 10}`;
    return labelChoice(rng, answer, [`${a} + 10 + ${n - 10}`, `${a} × 10 × ${n - 10}`, `${a * 10} × ${n - 10}`, `${a} × 10 + ${n - 10}`], {
      prompt: `Which breaks apart ${a} × ${n} correctly?`,
      display: { svg: splitRectSvg(a, 10, n - 10), speak: `Which breaks apart ${a} times ${n} correctly?` },
      explain: `${n} = 10 + ${n - 10}, so ${a} × ${n} = ${a} × 10 + ${a} × ${n - 10} = ${a * 10} + ${a * (n - 10)} = ${a * n}. Every part of the split must be multiplied by ${a}.`,
      hint: "Split the bigger number into 10 and the rest. Multiply BOTH parts.",
    });
  }
  const n = int(rng, 11, 15);
  return {
    type: "numeric",
    prompt: `${a} × ${n} = ?   (Hint: ${n} = 10 + ${n - 10})`,
    answer: a * n,
    display: { svg: splitRectSvg(a, 10, n - 10), speak: `${a} times ${n}. Break ${n} into 10 and ${n - 10}.` },
    explain: `${a} × 10 = ${a * 10} and ${a} × ${n - 10} = ${a * (n - 10)}. Add: ${a * 10} + ${a * (n - 10)} = ${a * n}.`,
    hint: `Multiply ${a} by 10, then ${a} by ${n - 10}, then add the two products.`,
  };
};

// ---------------------------------------------------------------------------
// multiDigitTimes1Digit — 3.NBT.A.3 (mode "tens"), 4.NBT.B.5 (digits 2/3/4)
// ---------------------------------------------------------------------------

const multiDigitTimes1Digit: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "standard");
  const digitsList = numListParam(ctx, "digits", [2]);
  const b = int(rng, 2, 9);
  if (mode === "tens") {
    const t = int(rng, 2, 9);
    const useHundreds = rng() < 0.3;
    const a = useHundreds ? t * 100 : t * 10;
    return {
      type: "numeric",
      prompt: `${b} × ${a} = ?`,
      answer: a * b,
      display: { speak: `${b} times ${a}` },
      explain: `${a} is ${t} ${useHundreds ? "hundreds" : "tens"}. ${b} × ${t} = ${b * t}, so ${b} × ${a} = ${b * t} ${useHundreds ? "hundreds" : "tens"} = ${fmt(a * b)}.`,
      hint: `Use the basic fact ${b} × ${t}, then think in ${useHundreds ? "hundreds" : "tens"}.`,
    };
  }
  const digits = pick(rng, digitsList);
  const a = int(rng, 10 ** (digits - 1) + 2, 10 ** digits - 1);
  const { parts, values } = partialProducts(a, b);
  const prod = a * b;
  return {
    type: "numeric",
    prompt: `${fmt(a)} × ${b} = ?`,
    answer: prod,
    display: { speak: `${fmt(a)} times ${b}` },
    explain: `Break ${fmt(a)} by place value and multiply each part (partial products): ${parts.join("; ")}. Add them: ${values.map(fmt).join(" + ")} = ${fmt(prod)}.`,
    hint: `Split ${fmt(a)} into ${digits === 2 ? "tens and ones" : digits === 3 ? "hundreds, tens and ones" : "thousands, hundreds, tens and ones"}. Multiply each part by ${b}, then add.`,
  };
};

// ---------------------------------------------------------------------------
// twoDigitTimesTwoDigit — 4.NBT.B.5 (2×2), 5.NBT.B.5 (3×2, 3×3)
// ---------------------------------------------------------------------------

function areaModel2x2Svg(a: number, b: number): string {
  const at = Math.floor(a / 10) * 10;
  const ao = a % 10;
  const bt = Math.floor(b / 10) * 10;
  const bo = b % 10;
  const x0 = 18;
  const y0 = 18;
  const w1 = 50;
  const w2 = 26;
  const h1 = 42;
  const h2 = 22;
  const cell = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${COLORS.ink}" stroke-width="1.2"/>`;
  return svgWrap(
    cell(x0, y0, w1, h1, "#bfdbfe") +
      cell(x0 + w1, y0, w2, h1, "#fde68a") +
      cell(x0, y0 + h1, w1, h2, "#bbf7d0") +
      cell(x0 + w1, y0 + h1, w2, h2, "#fecdd3") +
      svgText(x0 + w1 / 2, y0 - 4, String(bt), 7, 'font-weight="700"') +
      svgText(x0 + w1 + w2 / 2, y0 - 4, String(bo), 7, 'font-weight="700"') +
      svgText(x0 - 8, y0 + h1 / 2 + 2.5, String(at), 7, 'font-weight="700"') +
      svgText(x0 - 8, y0 + h1 + h2 / 2 + 2.5, String(ao), 7, 'font-weight="700"')
  );
}

const twoDigitTimesTwoDigit: Generator = (ctx) => {
  const { rng } = ctx;
  const aDigits = pick(rng, numListParam(ctx, "aDigits", [2]));
  const bDigits = pick(rng, numListParam(ctx, "bDigits", [2]));
  const a = int(rng, 10 ** (aDigits - 1) + 1, 10 ** aDigits - 1);
  const b = int(rng, 10 ** (bDigits - 1) + 1, 10 ** bDigits - 1);
  const prod = a * b;
  if (aDigits === 2 && bDigits === 2) {
    const at = Math.floor(a / 10) * 10;
    const ao = a % 10;
    const bt = Math.floor(b / 10) * 10;
    const bo = b % 10;
    const pp = [at * bt, at * bo, ao * bt, ao * bo];
    return {
      type: "numeric",
      prompt: `${a} × ${b} = ?`,
      answer: prod,
      display: { svg: areaModel2x2Svg(a, b), speak: `${a} times ${b}` },
      explain: `Area model with four parts: ${at} × ${bt} = ${fmt(pp[0])}, ${at} × ${bo} = ${fmt(pp[1])}, ${ao} × ${bt} = ${fmt(pp[2])}, ${ao} × ${bo} = ${fmt(pp[3])}. Add: ${pp.map(fmt).join(" + ")} = ${fmt(prod)}.`,
      hint: "Split both numbers into tens and ones. Multiply all four pairs (the four boxes), then add.",
    };
  }
  const bd = digitsOf(b);
  const rows: string[] = [];
  const vals: number[] = [];
  bd.forEach((d, i) => {
    const place = 10 ** (bd.length - 1 - i);
    if (d === 0) return;
    rows.push(`${fmt(a)} × ${fmt(d * place)} = ${fmt(a * d * place)}`);
    vals.push(a * d * place);
  });
  return {
    type: "numeric",
    prompt: `${fmt(a)} × ${fmt(b)} = ?`,
    answer: prod,
    display: { speak: `${fmt(a)} times ${fmt(b)}` },
    explain: `Standard algorithm: multiply ${fmt(a)} by each digit of ${fmt(b)} by its place value, then add. ${rows.join("; ")}. ${vals.map(fmt).join(" + ")} = ${fmt(prod)}.`,
    hint: `Multiply ${fmt(a)} by the ones digit of ${fmt(b)}, then by the tens (remember the zero), ${bDigits === 3 ? "then by the hundreds (two zeros), " : ""}then add the rows.`,
  };
};

// ---------------------------------------------------------------------------
// divisionWithRemainder — 4.NBT.B.6 (2-4 digit ÷ 1 digit, with/without remainder)
// ---------------------------------------------------------------------------

function divideByPlaceExplain(n: number, d: number): string {
  const q = Math.floor(n / d);
  const r = n % d;
  const ds = digitsOf(q);
  const parts: string[] = [];
  ds.forEach((digit, i) => {
    const place = 10 ** (ds.length - 1 - i);
    if (digit === 0) return;
    parts.push(`${fmt(digit * place * d)} ÷ ${d} = ${fmt(digit * place)}`);
  });
  const sumParts = ds.map((digit, i) => digit * 10 ** (ds.length - 1 - i)).filter((x) => x > 0).map(fmt).join(" + ");
  return `Split ${fmt(n)} into friendly multiples of ${d}: ${parts.join(", ")}${r ? `, with ${r} left over` : ""}. Add the pieces: ${sumParts} = ${fmt(q)}${r ? `, remainder ${r}` : ""}. Check: ${d} × ${fmt(q)}${r ? ` + ${r}` : ""} = ${fmt(n)}.`;
}

const divisionWithRemainder: Generator = (ctx) => {
  const { rng } = ctx;
  const digitsList = numListParam(ctx, "digits", [2, 3]);
  const remParam = ctx.params?.remainder;
  const withRem = typeof remParam === "boolean" ? remParam : rng() < 0.5;
  const digits = pick(rng, digitsList);
  const d = int(rng, 2, 9);
  const q = int(rng, Math.ceil(10 ** (digits - 1) / d) + 1, Math.floor((10 ** digits - 1) / d));
  const r = withRem ? int(rng, 1, d - 1) : 0;
  const n = q * d + r;
  if (!withRem) {
    return {
      type: "numeric",
      prompt: `${fmt(n)} ÷ ${d} = ?`,
      answer: q,
      display: { speak: `${fmt(n)} divided by ${d}` },
      explain: divideByPlaceExplain(n, d),
      hint: `Start with the biggest place: how many ${d}s fit in the ${digits === 2 ? "tens" : digits === 3 ? "hundreds" : "thousands"}? Then divide what is left.`,
    };
  }
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: `What is the remainder when ${fmt(n)} is divided by ${d}?`,
      answer: r,
      display: { speak: `What is the remainder when ${fmt(n)} is divided by ${d}?` },
      explain: `${d} × ${fmt(q)} = ${fmt(q * d)} is the biggest multiple of ${d} that fits in ${fmt(n)}. ${fmt(n)} − ${fmt(q * d)} = ${r}. The remainder is ${r} (always smaller than the divisor).`,
      hint: `Find the biggest multiple of ${d} that fits in ${fmt(n)}. What is left over?`,
    };
  }
  if (variant === 1) {
    return {
      type: "numeric",
      prompt: `${fmt(n)} ÷ ${d}: how many whole groups of ${d}? (Ignore the remainder.)`,
      answer: q,
      display: { speak: `${fmt(n)} divided by ${d}. How many whole groups? Ignore the remainder.` },
      explain: divideByPlaceExplain(n, d),
      hint: `Divide place by place. The quotient is the number of whole ${d}s; the leftover is the remainder.`,
    };
  }
  const answer = `${fmt(q)} R ${r}`;
  const wrong = [`${fmt(q)} R ${(r + 1) % d || 1}`, `${fmt(q + 1)} R ${r}`, `${fmt(q - 1)} R ${r + d}`, `${fmt(q)} R ${d}`].filter((w) => w !== answer);
  return labelChoice(rng, answer, wrong, {
    prompt: `${fmt(n)} ÷ ${d} = ?`,
    display: { speak: `${fmt(n)} divided by ${d}. Give the quotient and remainder.` },
    explain: `${divideByPlaceExplain(n, d)} A remainder must be smaller than the divisor ${d}.`,
    hint: `The remainder must be less than ${d}. Check with multiplication: divisor × quotient + remainder = ${fmt(n)}.`,
  });
};

// ---------------------------------------------------------------------------
// longDivision — 4.NBT.B.6 (4-digit ÷ 1-digit), 5.NBT.B.6 (÷ 2-digit)
// ---------------------------------------------------------------------------

function longDivisionSteps(n: number, d: number): string {
  const ds = digitsOf(n);
  const steps: string[] = [];
  let cur = 0;
  let started = false;
  for (let i = 0; i < ds.length; i++) {
    cur = cur * 10 + ds[i];
    if (!started && cur < d && i < ds.length - 1) continue;
    started = true;
    const qd = Math.floor(cur / d);
    const rem = cur - qd * d;
    steps.push(`${cur} ÷ ${d} = ${qd}, remainder ${rem}${i < ds.length - 1 ? `; bring down ${ds[i + 1]}` : ""}`);
    cur = rem;
  }
  return steps.join(" → ");
}

const longDivision: Generator = (ctx) => {
  const { rng } = ctx;
  const digits = pick(rng, numListParam(ctx, "digits", [4]));
  const divisorDigits = numParam(ctx, "divisorDigits", 1);
  const d = divisorDigits === 2 ? int(rng, 11, 49) : int(rng, 3, 9);
  const lo = Math.ceil(10 ** (digits - 1) / d) + 1;
  const hi = Math.floor((10 ** digits - 1) / d);
  let q = int(rng, lo, hi);
  if (q === d) q = q > lo ? q - 1 : q + 1;
  const r = rng() < 0.5 ? 0 : int(rng, 1, d - 1);
  const n = q * d + r;
  const steps = longDivisionSteps(n, d);
  if (r === 0) {
    return {
      type: "numeric",
      prompt: `${fmt(n)} ÷ ${d} = ?`,
      answer: q,
      display: { speak: `${fmt(n)} divided by ${d}` },
      explain: `Long division, left to right: ${steps}. Quotient ${fmt(q)}. Check: ${d} × ${fmt(q)} = ${fmt(n)}.`,
      hint: divisorDigits === 2 ? `Estimate: round ${d} to ${Math.round(d / 10) * 10} to guess each digit, then check by multiplying.` : `Divide, multiply, subtract, bring down — one digit at a time starting on the left.`,
    };
  }
  if (rng() < 0.5) {
    return {
      type: "numeric",
      prompt: `${fmt(n)} ÷ ${d}: what is the quotient (whole part)?`,
      answer: q,
      display: { speak: `${fmt(n)} divided by ${d}. What is the whole number part of the quotient?` },
      explain: `${steps}. Quotient ${fmt(q)} remainder ${r}. Check: ${d} × ${fmt(q)} + ${r} = ${fmt(n)}.`,
      hint: "Work digit by digit from the left: divide, multiply, subtract, bring down.",
    };
  }
  const answer = `${fmt(q)} R ${r}`;
  const wrong = [`${fmt(q)} R ${r + 1 < d ? r + 1 : r - 1}`, `${fmt(q + 1)} R ${r}`, `${fmt(q - 1)} R ${r}`, `${fmt(q)} R ${d}`].filter((w) => w !== answer);
  return labelChoice(rng, answer, wrong, {
    prompt: `${fmt(n)} ÷ ${d} = ?`,
    display: { speak: `${fmt(n)} divided by ${d}. Quotient and remainder.` },
    explain: `${steps}. So ${fmt(n)} ÷ ${d} = ${answer}. The remainder must be less than ${d}.`,
    hint: `Divide from the left. Finish by checking: ${d} × quotient + remainder should equal ${fmt(n)}.`,
  });
};

// ---------------------------------------------------------------------------
// factorsMultiples / primeComposite — 4.OA.B.4
// ---------------------------------------------------------------------------

function factorsOf(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i);
  return out;
}

const factorsMultiples: Generator = (ctx) => {
  const { rng } = ctx;
  const variant = int(rng, 0, 4);
  if (variant === 0) {
    const n = pick(rng, [12, 16, 18, 20, 24, 28, 30, 36, 40, 42, 45, 48, 54, 56, 60, 63, 64, 72, 80, 84, 90, 96, 100]);
    const fs = factorsOf(n);
    const answer = pick(rng, fs.filter((f) => f > 1 && f < n));
    const nonFactors: number[] = [];
    for (let c = 2; c < n && nonFactors.length < 6; c++) if (n % c !== 0) nonFactors.push(c);
    return numericChoice(rng, answer, sample(rng, nonFactors, 3), {
      prompt: `Which number is a factor of ${n}?`,
      display: { speak: `Which number is a factor of ${n}?` },
      explain: `A factor divides the number with no remainder. ${n} ÷ ${answer} = ${n / answer} exactly, so ${answer} is a factor. All factors of ${n}: ${fs.join(", ")}.`,
      hint: `Try dividing ${n} by each option. A factor leaves no remainder.`,
    });
  }
  if (variant === 1) {
    const k = int(rng, 3, 9);
    const answer = k * int(rng, 2, 12);
    const wrong = new Set<number>();
    while (wrong.size < 3) {
      const c = answer + int(rng, -8, 8);
      if (c > 0 && c % k !== 0) wrong.add(c);
    }
    return numericChoice(rng, answer, [...wrong], {
      prompt: `Which number is a multiple of ${k}?`,
      display: { speak: `Which number is a multiple of ${k}?` },
      explain: `Multiples of ${k} are ${k} × 1, ${k} × 2, ${k} × 3 … ${answer} = ${k} × ${answer / k}, so it is a multiple of ${k}. The others leave a remainder when divided by ${k}.`,
      hint: `Count by ${k}s (or divide each option by ${k}). Which one comes up with no remainder?`,
    });
  }
  if (variant === 2) {
    const n = pick(rng, [12, 16, 18, 20, 24, 30, 36, 40, 48]);
    const fs = factorsOf(n);
    const pairs = fs.filter((f) => f * f <= n).length;
    return {
      type: "numeric",
      prompt: `How many factor pairs does ${n} have?`,
      answer: pairs,
      display: { speak: `How many factor pairs does ${n} have?` },
      explain: `List pairs that multiply to ${n}: ${fs.filter((f) => f * f <= n).map((f) => `${f} × ${n / f}`).join(", ")}. That is ${pairs} pairs.`,
      hint: `Start with 1 × ${n}, then 2 × ?, 3 × ? … Stop when the pairs start repeating.`,
    };
  }
  if (variant === 3) {
    const n = int(rng, 10, 100);
    const c = int(rng, 2, 9);
    const yes = n % c === 0;
    const options = shuffle(rng, ["yes", "no"]);
    return {
      type: "choice",
      prompt: `Is ${c} a factor of ${n}?`,
      display: { speak: `Is ${c} a factor of ${n}?` },
      options: options.map((o) => ({ label: o })),
      answerIndex: options.indexOf(yes ? "yes" : "no"),
      explain: yes ? `${n} ÷ ${c} = ${n / c} with no remainder, so yes — ${c} is a factor of ${n} (and ${n} is a multiple of ${c}).` : `${n} ÷ ${c} = ${Math.floor(n / c)} remainder ${n % c}. There is a remainder, so ${c} is not a factor of ${n}.`,
      hint: `Divide ${n} by ${c}. Factor means no remainder.`,
    };
  }
  const a = int(rng, 2, 9);
  const b = int(rng, 2, 12);
  return {
    type: "numeric",
    prompt: `${a * b} = ${a} × ___   Complete the factor pair.`,
    answer: b,
    display: { speak: `${a * b} equals ${a} times what? Complete the factor pair.` },
    explain: `${a * b} ÷ ${a} = ${b}, so the factor pair is ${a} × ${b}.`,
    hint: `Divide ${a * b} by ${a}.`,
  };
};

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

const primeComposite: Generator = (ctx) => {
  const { rng } = ctx;
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    const n = int(rng, 2, 60);
    const prime = isPrime(n);
    const options = shuffle(rng, ["prime", "composite"]);
    const smallest = prime ? 0 : factorsOf(n).find((f) => f > 1 && f < n) ?? 0;
    return {
      type: "choice",
      prompt: `Is ${n} prime or composite?`,
      display: { speak: `Is ${n} prime or composite?` },
      options: options.map((o) => ({ label: o })),
      answerIndex: options.indexOf(prime ? "prime" : "composite"),
      explain: prime ? `${n} has exactly two factors, 1 and ${n}, so it is prime.` : `${n} = ${smallest} × ${n / smallest}, so it has more than two factors: composite. (Factors: ${factorsOf(n).join(", ")}.)`,
      hint: n === 2 ? "Does 2 have any factor other than 1 and itself?" : `Can you divide ${n} evenly by 2, 3, 5 or 7? If any works, it is composite.`,
    };
  }
  if (variant === 1) {
    const answer = pick(rng, PRIMES.filter((p) => p > 3 && p < 60));
    const comps = new Set<number>();
    while (comps.size < 3) {
      const c = int(rng, 4, 60);
      if (!isPrime(c)) comps.add(c);
    }
    return numericChoice(rng, answer, [...comps], {
      prompt: "Which number is prime?",
      display: { speak: "Which number is prime?" },
      explain: `${answer} cannot be divided evenly by anything except 1 and ${answer}, so it is prime. The others have extra factors: ${[...comps].map((c) => `${c} = ${factorsOf(c).find((f) => f > 1 && f < c)} × ${c / (factorsOf(c).find((f) => f > 1 && f < c) as number)}`).join(", ")}.`,
      hint: "Test each one: can it be split into equal groups of 2, 3, 5 or 7? A prime cannot.",
    });
  }
  const answer = pick(rng, [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28, 30, 32, 33, 34, 35, 36]);
  const ps = sample(rng, PRIMES.filter((p) => p < 40), 3);
  const f = factorsOf(answer).find((x) => x > 1 && x < answer) as number;
  return numericChoice(rng, answer, ps, {
    prompt: "Which number is composite?",
    display: { speak: "Which number is composite?" },
    explain: `${answer} = ${f} × ${answer / f}, so it has more than two factors: composite. ${ps.join(", ")} are prime (only 1 and themselves).`,
    hint: "A composite number can be made as a rectangle array with more than one row. Which one can?",
  });
};

// ---------------------------------------------------------------------------
// roundTo — 3.NBT.A.1, 4.NBT.A.3, 5.NBT.A.4 (decimals: text answer)
// ---------------------------------------------------------------------------

const PLACE_WORDS: Record<number, string> = { 10: "ten", 100: "hundred", 1000: "thousand", 10000: "ten thousand", 100000: "hundred thousand" };

const roundTo: Generator = (ctx) => {
  const { rng } = ctx;
  const decimals = ctx.params?.decimals === true;
  if (decimals) {
    const places = pick(rng, [0, 1, 2]);
    let n = int(rng, 100, 99999) / 1000;
    const f = 10 ** places;
    if (Math.abs(Math.round(n * f + 1e-9) / f - n) < 1e-9) n = Math.round((n + 0.003) * 1000) / 1000;
    const rounded = Math.round(n * f + 1e-9) / f;
    const label = places === 0 ? "whole number" : places === 1 ? "tenth" : "hundredth";
    const answer = rounded.toFixed(places);
    const accept = [answer, String(rounded), rounded.toFixed(places + 1), rounded.toFixed(3)];
    const nextDigit = Math.floor(n * f * 10 + 1e-9) % 10;
    return {
      type: "text",
      prompt: `Round ${n} to the nearest ${label}.`,
      answer,
      accept,
      display: { speak: `Round ${n} to the nearest ${label}.` },
      explain: `Find the ${label}s place, then look at the digit just to its right: ${nextDigit}. ${nextDigit >= 5 ? "5 or more rounds up" : "Less than 5 keeps it the same"}. ${n} → ${answer}.`,
      hint: `Underline the ${label}s digit. Look at the next digit to the right: is it 5 or more?`,
    };
  }
  const places = numListParam(ctx, "places", [10, 100]);
  const place = pick(rng, places);
  const maxN = Math.max(999, place * 10 * (rng() < 0.5 ? 1 : 10));
  let n = int(rng, place + 1, Math.min(999999, maxN));
  if (n % place === 0) n += int(rng, 1, 9);
  const rounded = Math.round(n / place) * place;
  const nextDigit = Math.floor(n / (place / 10)) % 10;
  const name = PLACE_WORDS[place] ?? String(place);
  return {
    type: "numeric",
    prompt: `Round ${fmt(n)} to the nearest ${name}.`,
    answer: rounded,
    display: { speak: `Round ${fmt(n)} to the nearest ${name}.` },
    explain: `${fmt(n)} is between ${fmt(Math.floor(n / place) * place)} and ${fmt(Math.floor(n / place) * place + place)}. Look at the digit to the right of the ${name}s place: ${nextDigit}. ${nextDigit >= 5 ? "5 or more → round up" : "Less than 5 → round down"}: ${fmt(rounded)}.`,
    hint: `Find the ${name}s digit. Look at the digit just to its right: 5 or more rounds up, less than 5 keeps it.`,
  };
};

// ---------------------------------------------------------------------------
// placeValueMillions — 4.NBT.A.1-2 (whole numbers), 5.NBT.A.1 (decimals)
// ---------------------------------------------------------------------------

const PLACE_LIST: [number, string][] = [
  [1, "ones"],
  [10, "tens"],
  [100, "hundreds"],
  [1000, "thousands"],
  [10000, "ten thousands"],
  [100000, "hundred thousands"],
];

/**
 * Expanded-form distractor with a real place-value slip: the last term of 10 or
 * more loses one zero (12,708 → "10,000 + 2,000 + 70 + 8"). Its sum is never the
 * number, unlike a reordered expansion ("8 + 700 + 2,000 + 10,000"), which is
 * still a correct expanded form.
 */
function droppedZero(ds: number[]): string {
  const terms = ds.map((d, i) => d * 10 ** (ds.length - 1 - i)).filter((x) => x > 0);
  let j = -1;
  terms.forEach((t, i) => {
    if (t >= 10) j = i;
  });
  return terms.map((t, i) => fmt(i === j ? t / 10 : t)).join(" + ");
}

const placeValueMillions: Generator = (ctx) => {
  const { rng } = ctx;
  const decimals = ctx.params?.decimals === true;
  const mode = strParam(ctx, "mode", "mixed");
  if (decimals) {
    const variant = int(rng, 0, 2);
    const d = int(rng, 1, 9);
    if (variant === 0) {
      const n = `${int(rng, 0, 9)}.${d}${d}`;
      return {
        type: "numeric",
        prompt: `In ${n}, the ${d} in the tenths place is how many times the value of the ${d} in the hundredths place?`,
        answer: 10,
        display: { speak: `In ${n}, the ${d} in the tenths place is how many times the value of the ${d} in the hundredths place?` },
        explain: `Each place is 10 times the place to its right. ${d} tenths = ${d * 10} hundredths, so the tenths ${d} is 10 times the hundredths ${d}.`,
        hint: "Moving one place to the LEFT makes a digit worth how many times more?",
      };
    }
    if (variant === 1) {
      const n = `${d}${d}${int(rng, 0, 9)}`;
      return labelChoice(rng, "1/10", ["10", "1/100", "100"], {
        prompt: `In ${n}, the ${d} in the tens place is what fraction of the value of the ${d} in the hundreds place?`,
        display: { speak: `In ${n}, the ${d} in the tens place is what fraction of the ${d} in the hundreds place?` },
        explain: `Moving one place to the right divides the value by 10: ${d} tens is 1/10 of ${d} hundreds (${d * 10} is 1/10 of ${d * 100}).`,
        hint: "One place to the right = one tenth as much.",
      });
    }
    // Work in whole thousandths (no float noise) and only ask about a non-zero digit:
    // a 0 is worth 0 in every place, so "0 tenths" / "0 hundredths" would all be right.
    let thousandths = int(rng, 1000, 9999);
    if (thousandths % 1000 === 0) thousandths += 111;
    const places = ([[1, "tenths"], [2, "hundredths"], [3, "thousandths"]] as const).filter(([p]) => Math.floor(thousandths / 10 ** (3 - p)) % 10 !== 0);
    const digit = pick(rng, places);
    const dv = Math.floor(thousandths / 10 ** (3 - digit[0])) % 10;
    const shown = `${Math.floor(thousandths / 1000)}.${String(thousandths % 1000).padStart(3, "0")}`;
    const worth = `0.${"0".repeat(digit[0] - 1)}${dv}${"0".repeat(3 - digit[0])}`;
    const answer = `${dv} ${digit[1]}`;
    const wrong = [`${dv} ${digit[1] === "tenths" ? "hundredths" : "tenths"}`, `${dv} ones`, `${dv} ${digit[1] === "thousandths" ? "hundredths" : "thousandths"}`].filter((w) => w !== answer);
    return labelChoice(rng, answer, wrong, {
      prompt: `What is the value of the digit ${dv} in ${shown} (in the ${digit[1]} place)?`,
      display: { speak: `What is the value of the digit ${dv} in ${shown}?` },
      explain: `Places after the decimal point: tenths, hundredths, thousandths. The ${dv} sits in the ${digit[1]} place, so it is worth ${dv} ${digit[1]} (${worth}).`,
      hint: "Name the places after the point in order: tenths, hundredths, thousandths.",
    });
  }
  const modes = mode === "mixed" ? ["tenTimes", "digitValue", "names", "expanded", "compare"] : [mode];
  const m = pick(rng, modes);
  const n = int(rng, 10000, 999999);
  if (m === "tenTimes") {
    const d = int(rng, 1, 9);
    const k = int(rng, 1, 4);
    const big = d * 10 ** k;
    const small = d * 10 ** (k - 1);
    const number = big + small;
    return {
      type: "numeric",
      prompt: `In ${fmt(number)}, the ${d} in the ${PLACE_LIST[k][1]} place is how many times the ${d} in the ${PLACE_LIST[k - 1][1]} place?`,
      answer: 10,
      display: { speak: `In ${fmt(number)}, the ${d} in the ${PLACE_LIST[k][1]} place is how many times the ${d} in the ${PLACE_LIST[k - 1][1]} place?` },
      explain: `A digit one place to the left is worth 10 times as much: ${fmt(big)} ÷ ${fmt(small)} = 10.`,
      hint: "Compare the value of the two digits. Moving one place to the left makes a digit worth how many times more?"
    };
  }
  if (m === "digitValue") {
    const k = int(rng, 1, 5);
    const d = Math.floor(n / 10 ** k) % 10 || 5;
    const placed = n - (Math.floor(n / 10 ** k) % 10) * 10 ** k + d * 10 ** k;
    // The asked digit must appear exactly once, or "the value of the digit d" has two answers.
    const number = onlyOnce(placed, k, d);
    return numericChoice(rng, d * 10 ** k, [d, d * 10 ** (k - 1), d * 10 ** (k + 1), k], {
      prompt: `What is the value of the digit ${d} in ${fmt(number)}?`,
      display: { speak: `What is the value of the digit ${d} in ${fmt(number)}?` },
      explain: `Count places from the right: ones, tens, hundreds, thousands … The ${d} is in the ${PLACE_LIST[k][1]} place, so it is worth ${d} × ${fmt(10 ** k)} = ${fmt(d * 10 ** k)}.`,
      hint: "Count the places from the right, starting with ones, to find which place the digit is in.",
    }, fmt);
  }
  if (m === "names") {
    const name = numberName(n);
    const wrong = [n + 1000, n + 10, n - 100, Number(String(n).split("").reverse().join(""))].filter((x) => x !== n && x > 0);
    return numericChoice(rng, n, wrong, {
      prompt: `Which number is "${name}"?`,
      display: { speak: `Which number is ${name}?` },
      explain: `Read it in groups: the part before "thousand" is the thousands group. ${name} = ${fmt(n)}.`,
      hint: "The words before 'thousand' go on the left of the comma; the rest fills the last three places.",
    }, fmt);
  }
  if (m === "expanded") {
    const ds = digitsOf(n);
    const expanded = ds.map((d, i) => d * 10 ** (ds.length - 1 - i)).filter((x) => x > 0).map(fmt).join(" + ");
    const wrong = [
      ds.map((d, i) => d * 10 ** (ds.length - 2 - i)).filter((x) => x > 0).map((x) => fmt(Math.max(1, x))).join(" + "),
      ds.filter((d) => d > 0).join(" + "),
      droppedZero(ds),
    ].filter((w) => w !== expanded);
    return labelChoice(rng, expanded, wrong, {
      prompt: `Which is the expanded form of ${fmt(n)}?`,
      display: { speak: `Which is the expanded form of ${fmt(n)}?` },
      explain: `Each digit times its place value: ${fmt(n)} = ${expanded}.`,
      hint: "Each digit keeps the zeros of its place. The biggest place comes first.",
    });
  }
  const a = n;
  const b = rng() < 0.5 ? a + int(rng, -5000, 5000) : int(rng, 10000, 999999);
  const sym = a > b ? ">" : a < b ? "<" : "=";
  const options = shuffle(rng, ["<", ">", "="]);
  const firstDiff = (() => {
    const sa = String(a).padStart(6, "0");
    const sb = String(b).padStart(6, "0");
    for (let i = 0; i < 6; i++) if (sa[i] !== sb[i]) return PLACE_LIST[5 - i][1];
    return "";
  })();
  return {
    type: "choice",
    prompt: `${fmt(a)} ○ ${fmt(b)}   Which sign goes in the circle?`,
    display: { speak: `Compare ${fmt(a)} and ${fmt(b)}.` },
    options: options.map((s) => ({ label: s })),
    answerIndex: options.indexOf(sym),
    explain: sym === "=" ? "They are the same number, so the sign is =." : `Both have ${String(a).length === String(b).length ? "the same number of digits, so compare from the left. The first place that differs is the " + firstDiff : "different numbers of digits; more digits means bigger"}. ${fmt(a)} ${sym} ${fmt(b)}.`,
    hint: "Compare the number of digits first. If equal, compare digit by digit from the left.",
  };
};

// ---------------------------------------------------------------------------
// addSub4Digit — 3.NBT.A.2 (within 1000), 4.NBT.B.4 (standard algorithm)
// ---------------------------------------------------------------------------

const addSub4Digit: Generator = (ctx) => {
  const { rng } = ctx;
  const op = strParam(ctx, "op", "mixed");
  const max = numParam(ctx, "max", 10000);
  const zeros = ctx.params?.zeros === true;
  const doSub = op === "sub" || (op === "mixed" && rng() < 0.5);
  const lo = Math.max(100, Math.floor(max / 100));
  if (!doSub) {
    const a = int(rng, lo, Math.floor(max * 0.7));
    const b = int(rng, lo, max - a);
    return {
      type: "numeric",
      prompt: `${fmt(a)} + ${fmt(b)} = ?`,
      answer: a + b,
      display: { speak: `${fmt(a)} plus ${fmt(b)}` },
      explain: columnAddExplain(a, b),
      hint: "Line up the digits by place. Add from the ones column; carry when a column reaches 10 or more.",
    };
  }
  let a = int(rng, lo * 2, max);
  if (zeros && rng() < 0.6) a = Math.floor(a / 100) * 100 || 1000;
  let b = int(rng, lo, a - 1);
  if (a - b === b) b -= 1;
  return {
    type: "numeric",
    prompt: `${fmt(a)} − ${fmt(b)} = ?`,
    answer: a - b,
    display: { speak: `${fmt(a)} minus ${fmt(b)}` },
    explain: columnSubExplain(a, b),
    hint: zeros && a % 100 === 0 ? "There are zeros on top: regroup from the first non-zero digit to the left, one place at a time." : "Subtract from the ones column. When the top digit is smaller, regroup 1 from the next place to the left.",
  };
};

// ---------------------------------------------------------------------------
// multiplicativeComparison — 4.OA.A.1-2
// ---------------------------------------------------------------------------

const multiplicativeComparison: Generator = (ctx) => {
  const { rng } = ctx;
  const k = int(rng, 2, 6);
  const small = int(rng, 2, 12);
  const big = k * small;
  const name = pickName(rng);
  const other = pickName(rng, name);
  const scene = pick(rng, SCENES_UPPER);
  const items = scene.item[1];
  const variant = int(rng, 0, 4);
  if (variant === 0) {
    const answer = `${big} = ${k} × ${small}`;
    return labelChoice(rng, answer, [`${big} = ${k} + ${small}`, `${small} = ${k} × ${big}`, `${big} = ${small} + ${k}`], {
      prompt: `Which equation says "${big} is ${k} times as many as ${small}"?`,
      display: { speak: `Which equation says ${big} is ${k} times as many as ${small}?` },
      explain: `"${k} times as many as ${small}" means ${k} × ${small}. So ${big} = ${k} × ${small}. "Times as many" is multiplication, not addition.`,
      hint: "'Times as many' means multiply. Which equation multiplies?",
    });
  }
  if (variant === 1) {
    return {
      type: "numeric",
      prompt: `${name} has ${small} ${items}. ${other} has ${k} times as many. How many does ${other} have?`,
      answer: big,
      display: { speak: `${name} has ${small} ${items}. ${other} has ${k} times as many. How many does ${other} have?` },
      explain: `${k} times as many as ${small} is ${k} × ${small} = ${big}. Picture ${k} bars of ${small} stacked next to one bar of ${small}.`,
      hint: `Draw one bar for ${name}. ${other}'s bar is ${k} of those bars. Multiply.`,
    };
  }
  if (variant === 2) {
    return {
      type: "numeric",
      prompt: `${other} has ${big} ${items}. That is ${k} times as many as ${name}. How many does ${name} have?`,
      answer: small,
      display: { speak: `${other} has ${big} ${items}, which is ${k} times as many as ${name}. How many does ${name} have?` },
      explain: `Equation: ${big} = ${k} × ?. Divide: ${big} ÷ ${k} = ${small}.`,
      hint: `${k} equal bars make ${big}. How big is one bar? Divide.`,
    };
  }
  if (variant === 3) {
    return {
      type: "numeric",
      prompt: `${other} has ${big} ${items} and ${name} has ${small}. How many times as many does ${other} have?`,
      answer: k,
      display: { speak: `${other} has ${big} ${items} and ${name} has ${small}. How many times as many does ${other} have?` },
      explain: `Equation: ${big} = ? × ${small}. ${big} ÷ ${small} = ${k}, so ${other} has ${k} times as many.`,
      hint: `How many groups of ${small} fit into ${big}?`,
    };
  }
  // A third person, different from BOTH others (pickName only excludes one): never "Jack has 7 more than Jack".
  let third = pickName(rng, other);
  for (let guard = 0; third === name && guard < 20; guard++) third = pickName(rng, other);
  const addMore = int(rng, 2, 9);
  const additive = small + addMore;
  const same = "they have the same";
  const answer = big > additive ? other : big < additive ? third : same;
  const compared = big > additive ? `${big} > ${additive}, so ${other} has more.` : big < additive ? `${additive} > ${big}, so ${third} has more.` : `${big} = ${additive}, so they have the same.`;
  return labelChoice(rng, answer, [other, third, same, name].filter((o) => o !== answer), {
    prompt: `${name} has ${small} ${items}. ${other} has ${k} times as many as ${name}. ${third} has ${addMore} more than ${name}. Who has more, ${other} or ${third}?`,
    display: { speak: `${name} has ${small} ${items}. ${other} has ${k} times as many. ${third} has ${addMore} more than ${name}. Who has more, ${other} or ${third}?` },
    explain: `"${k} times as many" multiplies: ${k} × ${small} = ${big}. "${addMore} more" adds: ${small} + ${addMore} = ${additive}. ${compared}`,
    hint: "'Times as many' means multiply; 'more than' means add. Work out both amounts.",
  });
};

// ---------------------------------------------------------------------------
// multiStepWordProblem — 3.OA.A.3 (1-step ×/÷), 3.OA.D.8, 4.OA.A.3, 4.M.A.2
// ---------------------------------------------------------------------------

const multiStepWordProblem: Generator = (ctx) => {
  const { rng } = ctx;
  const steps = numParam(ctx, "steps", 2);
  const measurement = ctx.params?.measurement === true;
  const remainders = ctx.params?.remainders === true;
  const name = pickName(rng);
  if (measurement) {
    const variant = int(rng, 0, 4);
    if (variant === 0) {
      const half = pick(rng, [25, 30, 35, 40, 45]);
      const brk = pick(rng, [5, 10, 15]);
      return {
        type: "numeric",
        prompt: `A soccer game has two halves of ${half} minutes and a ${brk}-minute break. How many minutes from kickoff to the end?`,
        answer: 2 * half + brk,
        display: { speak: `A soccer game has two halves of ${half} minutes and a ${brk} minute break. How many minutes in all?` },
        explain: `Two halves: 2 × ${half} = ${2 * half}. Add the break: ${2 * half} + ${brk} = ${2 * half + brk} minutes.`,
        hint: "Multiply for the two halves, then add the break.",
      };
    }
    if (variant === 1) {
      const laps = int(rng, 3, 8);
      const m = pick(rng, [200, 250, 400, 500]);
      return {
        type: "numeric",
        prompt: `${name} runs ${laps} laps of a ${m}-meter track. How many meters is that? (1 km = 1,000 m)`,
        answer: laps * m,
        display: { speak: `${name} runs ${laps} laps of a ${m} meter track. How many meters?` },
        explain: `${laps} × ${m} = ${fmt(laps * m)} meters${laps * m >= 1000 ? ` — that is ${laps * m / 1000} km` : ""}.`,
        hint: "Equal laps of the same length: multiply.",
      };
    }
    if (variant === 2) {
      const ft = int(rng, 2, 5);
      const inch = int(rng, 1, 11);
      return {
        type: "numeric",
        prompt: `A baseball bat is ${ft} feet ${inch} ${inch === 1 ? "inch" : "inches"} long. How many inches is that?`,
        answer: ft * 12 + inch,
        display: { speak: `A baseball bat is ${ft} feet ${inch} ${inch === 1 ? "inch" : "inches"} long. How many inches is that?` },
        explain: `1 foot = 12 inches. ${ft} × 12 = ${ft * 12} inches, plus ${inch} more = ${ft * 12 + inch} inches.`,
        hint: "Change the feet to inches first (12 inches per foot), then add the extra inches.",
      };
    }
    if (variant === 3) {
      const price = int(rng, 3, 9);
      const count = int(rng, 4, 12);
      let paid = Math.ceil((price * count) / 10) * 10 + 10;
      for (let guard = 0; guard < 5 && [price, count, paid].includes(paid - price * count); guard++) paid += 10;
      return {
        type: "numeric",
        prompt: `Tickets to the recital cost $${price} each. ${name} buys ${count} tickets and pays with $${paid}. How many dollars change?`,
        answer: paid - price * count,
        display: { speak: `Tickets cost ${price} dollars each. ${name} buys ${count} and pays with ${paid} dollars. How much change?` },
        explain: `Cost: ${count} × $${price} = $${count * price}. Change: $${paid} − $${count * price} = $${paid - price * count}.`,
        hint: "Find the total cost first (multiply), then subtract it from what was paid.",
      };
    }
    const kg = int(rng, 2, 6);
    const used = int(rng, 200, 900);
    return {
      type: "numeric",
      prompt: `A bag of pony feed has ${kg} kg. ${name} scoops out ${used} g. How many grams are left? (1 kg = 1,000 g)`,
      answer: kg * 1000 - used,
      display: { speak: `A bag of pony feed has ${kg} kilograms. ${name} scoops out ${used} grams. How many grams are left?` },
      explain: `Convert first: ${kg} kg = ${fmt(kg * 1000)} g. Then subtract: ${fmt(kg * 1000)} − ${used} = ${fmt(kg * 1000 - used)} g.`,
      hint: "Change kilograms to grams so both amounts use the same unit, then subtract.",
    };
  }
  if (steps <= 1) {
    const a = int(rng, 3, 9);
    const b = int(rng, 3, 12);
    const variant = int(rng, 0, 2);
    if (variant === 0) {
      return {
        type: "numeric",
        prompt: `There are ${a} teams with ${b} players on each team. How many players in all?`,
        answer: a * b,
        display: { speak: `There are ${a} teams with ${b} players each. How many players in all?` },
        explain: `Equal groups: ${a} × ${b} = ${a * b} players.`,
        hint: `${a} equal groups of ${b}. Multiply.`,
      };
    }
    if (variant === 1) {
      return {
        type: "numeric",
        prompt: `${a * b} players are split into teams of ${b}. How many teams?`,
        answer: a,
        display: { speak: `${a * b} players are split into teams of ${b}. How many teams?` },
        explain: `Equation: ${b} × ? = ${a * b}, so ? = ${a * b} ÷ ${b} = ${a} teams.`,
        hint: `How many groups of ${b} are in ${a * b}? Divide.`,
      };
    }
    return {
      type: "numeric",
      prompt: `${name} buys ${a} packs of baseball cards with ${b} cards in each pack. How many cards?`,
      answer: a * b,
      display: { speak: `${name} buys ${a} packs with ${b} cards in each. How many cards?` },
      explain: `${a} packs × ${b} cards = ${a * b} cards.`,
      hint: "Packs are equal groups. Multiply the number of packs by the cards per pack.",
    };
  }
  const variant = int(rng, 0, remainders ? 5 : 3);
  if (variant === 0) {
    const boxes = int(rng, 3, 8);
    const per = pick(rng, [6, 10, 12, 15]);
    let used = int(rng, 5, boxes * per - 5);
    for (let guard = 0; guard < 5 && [used, per, boxes].includes(boxes * per - used); guard++) used += 1;
    return {
      type: "numeric",
      prompt: `A baseball team gets ${boxes} boxes of ${per} balls. They use ${used} in practice. How many balls are left?`,
      answer: boxes * per - used,
      display: { speak: `A baseball team gets ${boxes} boxes of ${per} balls and uses ${used}. How many are left?` },
      explain: `Step 1: ${boxes} × ${per} = ${boxes * per} balls. Step 2: ${boxes * per} − ${used} = ${boxes * per - used}. Let b = balls left: b = ${boxes} × ${per} − ${used}.`,
      hint: "First find how many balls there were in all (multiply). Then take away the ones used.",
    };
  }
  if (variant === 1) {
    const games = int(rng, 4, 9);
    const per = int(rng, 2, 4);
    const extra = int(rng, 1, 5);
    return {
      type: "numeric",
      prompt: `${name} scored ${per} goals in each of ${games} games, plus ${extra} more in the final. How many goals in all?`,
      answer: games * per + extra,
      display: { speak: `${name} scored ${per} goals in each of ${games} games, plus ${extra} in the final. How many goals in all?` },
      explain: `Step 1: ${games} × ${per} = ${games * per}. Step 2: ${games * per} + ${extra} = ${games * per + extra}. Equation: g = ${games} × ${per} + ${extra}.`,
      hint: "Multiply for the equal games, then add the final's goals.",
    };
  }
  if (variant === 2) {
    const price = int(rng, 4, 9);
    const sold = int(rng, 12, 30);
    let spend = int(rng, 20, price * sold - 10);
    for (let guard = 0; guard < 5 && [spend, sold, price].includes(price * sold - spend); guard++) spend += 1;
    return {
      type: "numeric",
      prompt: `The team sells ${sold} raffle tickets at $${price} each, then spends $${spend} on new jerseys. How many dollars are left?`,
      answer: price * sold - spend,
      display: { speak: `The team sells ${sold} tickets at ${price} dollars each, then spends ${spend} dollars. How much is left?` },
      explain: `Step 1: ${sold} × $${price} = $${sold * price}. Step 2: $${sold * price} − $${spend} = $${sold * price - spend}. Estimate to check: about ${Math.round(sold / 10) * 10} × ${price} ≈ ${Math.round(sold / 10) * 10 * price}.`,
      hint: "Money in (multiply tickets by price) minus money out.",
    };
  }
  if (variant === 3) {
    const per = int(rng, 2, 4);
    const kids = int(rng, 5, 9);
    const total = per * kids + int(rng, 10, 30);
    return {
      type: "numeric",
      prompt: `${name} has ${total} baseball cards and gives ${per} cards to each of ${kids} friends. How many cards does ${name} keep?`,
      answer: total - per * kids,
      display: { speak: `${name} has ${total} cards and gives ${per} to each of ${kids} friends. How many are kept?` },
      explain: `Step 1: ${kids} × ${per} = ${kids * per} cards given away. Step 2: ${total} − ${kids * per} = ${total - per * kids} kept.`,
      hint: "Find how many were given away in all, then subtract from the start.",
    };
  }
  if (variant === 4) {
    const per = pick(rng, [4, 6, 8, 10]);
    let people = per * int(rng, 5, 12) + int(rng, 1, per - 1);
    if (Math.ceil(people / per) === per) people += per;
    const benches = Math.ceil(people / per);
    return {
      type: "numeric",
      prompt: `${people} fans come to the game. Each bench seats ${per} people. How many benches are needed so everyone has a seat?`,
      answer: benches,
      display: { speak: `${people} fans come to the game. Each bench seats ${per}. How many benches are needed so everyone sits?` },
      explain: `${people} ÷ ${per} = ${Math.floor(people / per)} remainder ${people % per}. The ${people % per} left-over fans still need a bench, so round UP: ${benches} benches.`,
      hint: "Divide. If there is a remainder, those people still need somewhere to sit.",
    };
  }
  const per = pick(rng, [4, 5, 6, 8]);
  const total = per * int(rng, 6, 15) + int(rng, 1, per - 1);
  return {
    type: "numeric",
    prompt: `A coach packs ${total} water bottles into crates of ${per}. How many bottles are left over after filling as many crates as possible?`,
    answer: total % per,
    display: { speak: `A coach packs ${total} water bottles into crates of ${per}. How many are left over?` },
    explain: `${total} ÷ ${per} = ${Math.floor(total / per)} full crates with ${total % per} left over. The question asks about the remainder, so the answer is ${total % per}.`,
    hint: "Divide and look at the remainder — that is what does not fit into a full crate.",
  };
};

// ---------------------------------------------------------------------------
// patternsRules — 3.OA.D.9, 4.OA.C.5, 5.OA.B.3
// ---------------------------------------------------------------------------

const patternsRules: Generator = (ctx) => {
  const { rng } = ctx;
  const level = Math.max(levelOf(ctx), numParam(ctx, "grade", 3));
  const twoRules = ctx.params?.twoRules === true || level >= 5;
  const variant = int(rng, 0, twoRules ? 4 : 3);
  if (variant === 0) {
    const start = int(rng, 1, 12);
    const step = int(rng, 2, 9);
    const n = int(rng, 5, 8);
    const terms = Array.from({ length: n - 1 }, (_, i) => start + i * step);
    return {
      type: "numeric",
      prompt: `Rule: start at ${start}, add ${step}. What is the ${n}th number in the pattern?`,
      answer: start + (n - 1) * step,
      display: { speak: `Rule: start at ${start}, add ${step}. What is the ${n}th number?` },
      explain: `Write the terms: ${terms.join(", ")}, … The ${n}th term is ${start} + ${n - 1} × ${step} = ${start + (n - 1) * step}.`,
      hint: `Write out the pattern one term at a time, counting as you go, until you reach the ${n}th.`,
    };
  }
  if (variant === 1) {
    const start = int(rng, 1, 5);
    const mult = pick(rng, [2, 3]);
    const terms = Array.from({ length: 4 }, (_, i) => start * mult ** i);
    const answer = start * mult ** 4;
    return numericChoice(rng, answer, [terms[3] + (terms[3] - terms[2]), answer + mult, terms[3] * (mult + 1)], {
      prompt: `Rule: multiply by ${mult}.  ${terms.join(", ")}, ___`,
      display: { speak: `Rule: multiply by ${mult}. ${terms.join(", ")}, and then?` },
      explain: `Each term is ${mult} times the one before: ${terms[3]} × ${mult} = ${answer}.`,
      hint: `Multiply the last number by ${mult}.`,
    });
  }
  if (variant === 2) {
    const start = pick(rng, [1, 3, 5, 7]);
    const step = pick(rng, [2, 4, 6]);
    const terms = Array.from({ length: 5 }, (_, i) => start + i * step);
    return labelChoice(rng, "all the numbers are odd", ["all the numbers are even", "the numbers get smaller", "every number ends in 5"], {
      prompt: `Pattern: start at ${start}, add ${step}: ${terms.join(", ")}, … Which is always true?`,
      display: { speak: `Pattern: start at ${start}, add ${step}. Which is always true?` },
      explain: `Start odd and keep adding an even number: odd + even = odd, so every term stays odd. That feature is not stated in the rule, but it follows from it.`,
      hint: "Look at the terms you have. What do they all have in common? Will it keep being true?",
    });
  }
  if (variant === 3 && !twoRules) {
    const facts = [
      ["When you multiply any number by 2, the product is always …", "even", ["odd", "a multiple of 5", "ending in 2"]],
      ["Add the digits of any product in the 9s facts (9, 18, 27 …). The sum is always …", "9", ["10", "18", "odd"]],
      ["Odd + odd always equals …", "an even number", ["an odd number", "a prime number", "a multiple of 3"]],
      ["Every multiple of 5 ends in …", "0 or 5", ["5 only", "0 only", "2 or 4"]],
      ["Even × odd always equals …", "an even number", ["an odd number", "a square number", "a prime number"]],
    ] as const;
    const f = pick(rng, facts);
    return labelChoice(rng, f[1], [...f[2]], {
      prompt: f[0],
      display: { speak: f[0] },
      explain: `${f[1]}. Test a few examples to see the pattern, then explain it: ${f[1] === "even" || f[1] === "an even number" ? "an even factor means the product can be split into pairs." : f[1] === "9" ? "9 × n = 10n − n, which keeps the digit sum at 9." : "check with examples like 5, 10, 15, 20."}`,
      hint: "Try three examples and look for what they share.",
    });
  }
  const stepA = int(rng, 2, 5);
  const k = int(rng, 2, 3);
  const stepB = stepA * k;
  const n = int(rng, 3, 6);
  const a = Array.from({ length: n }, (_, i) => i * stepA);
  const b = Array.from({ length: n }, (_, i) => i * stepB);
  if (rng() < 0.5) {
    return {
      type: "numeric",
      prompt: `Pattern A: start at 0, add ${stepA}. Pattern B: start at 0, add ${stepB}. Each term in B is how many times the matching term in A?`,
      answer: k,
      display: { grid: [["A", ...a.map(String)], ["B", ...b.map(String)]], speak: `Pattern A adds ${stepA}, pattern B adds ${stepB}. Each B term is how many times the matching A term?` },
      explain: `Line up the terms: A = ${a.join(", ")}; B = ${b.join(", ")}. Each B term is ${stepB} ÷ ${stepA} = ${k} times the A term, because the rule adds ${k} times as much.`,
      hint: `Compare matching terms, like the second term of each. Divide B's by A's.`,
    };
  }
  const idx = int(rng, 1, n - 1);
  const answer = `(${a[idx]}, ${b[idx]})`;
  return labelChoice(rng, answer, [`(${b[idx]}, ${a[idx]})`, `(${a[idx]}, ${a[idx] + stepB})`, `(${a[idx + 1] ?? a[idx] + stepA}, ${b[idx]})`], {
    prompt: `Pattern A: 0, ${stepA}, ${2 * stepA}, … Pattern B: 0, ${stepB}, ${2 * stepB}, … Which ordered pair (A, B) comes from the ${idx + 1}${idx + 1 === 2 ? "nd" : idx + 1 === 3 ? "rd" : "th"} terms?`,
    display: { speak: `Pattern A adds ${stepA}, pattern B adds ${stepB}. Which ordered pair comes from the ${idx + 1} terms?` },
    explain: `Term ${idx + 1} of A is ${a[idx]}; term ${idx + 1} of B is ${b[idx]}. The pair is (A, B) = ${answer}, which could be graphed as a point.`,
    hint: "Count to the same position in each pattern. A goes first in the pair.",
  });
};

// ---------------------------------------------------------------------------
// orderOfOperations — 5.OA.A.1-2 (no exponents)
// ---------------------------------------------------------------------------

const orderOfOperations: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const variant = mode === "write" ? int(rng, 3, 4) : mode === "evaluate" ? int(rng, 0, 2) : int(rng, 0, 4);
  const a = int(rng, 2, 9);
  const b = int(rng, 2, 9);
  const c = int(rng, 2, 9);
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: `(${a} + ${b}) × ${c} = ?`,
      answer: (a + b) * c,
      display: { speak: `open parenthesis ${a} plus ${b} close parenthesis, times ${c}` },
      explain: `Parentheses first: ${a} + ${b} = ${a + b}. Then multiply: ${a + b} × ${c} = ${(a + b) * c}.`,
      hint: "Do what is inside the parentheses first.",
    };
  }
  if (variant === 1) {
    return {
      type: "numeric",
      prompt: `${a} + ${b} × ${c} = ?`,
      answer: a + b * c,
      display: { speak: `${a} plus ${b} times ${c}` },
      explain: `No parentheses, so multiply before adding: ${b} × ${c} = ${b * c}, then ${a} + ${b * c} = ${a + b * c}. (Not ${(a + b) * c}!)`,
      hint: "Multiplication comes before addition unless parentheses say otherwise.",
    };
  }
  if (variant === 2) {
    const d = int(rng, 1, Math.min(9, a * (b + c) - 1));
    return {
      type: "numeric",
      prompt: `[${a} × (${b} + ${c})] − ${d} = ?`,
      answer: a * (b + c) - d,
      display: { speak: `bracket ${a} times, open parenthesis ${b} plus ${c} close parenthesis, close bracket, minus ${d}` },
      explain: `Innermost grouping first: ${b} + ${c} = ${b + c}. Then the bracket: ${a} × ${b + c} = ${a * (b + c)}. Finally subtract ${d}: ${a * (b + c) - d}.`,
      hint: "Work from the inside out: parentheses, then brackets, then the rest.",
    };
  }
  if (variant === 3) {
    const answer = `(${a} + ${b}) × ${c}`;
    return labelChoice(rng, answer, [`${a} + ${b} × ${c}`, `${a} + (${b} × ${c})`, `(${a} × ${b}) + ${c}`], {
      prompt: `Which expression means "add ${a} and ${b}, then multiply by ${c}"?`,
      display: { speak: `Which expression means add ${a} and ${b}, then multiply by ${c}?` },
      explain: `To make the addition happen first, put it in parentheses: ${answer}. Without them, ${b} × ${c} would happen first.`,
      hint: "Parentheses force that part to be done first. Which part should be first?",
    });
  }
  const big = int(rng, 1000, 9999);
  const small = int(rng, 100, 999);
  return labelChoice(rng, `${a} times as large as ${fmt(big)} + ${small}`, [`${a} more than ${fmt(big)} + ${small}`, `${fmt(big)} + ${small} ÷ ${a}`, `${a} times ${fmt(big)}, plus ${small}`], {
    prompt: `Without calculating: what does ${a} × (${fmt(big)} + ${small}) mean?`,
    display: { speak: `Without calculating, what does ${a} times, open parenthesis ${fmt(big)} plus ${small} close parenthesis, mean?` },
    explain: `The parentheses group ${fmt(big)} + ${small} into one amount, and the ${a} × multiplies that whole amount. So it is ${a} times as large as ${fmt(big)} + ${small}.`,
    hint: "The parentheses make one single amount. What is happening to that amount?",
  });
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  multFacts,
  divFacts,
  missingFactor,
  multProperties,
  multiDigitTimes1Digit,
  twoDigitTimesTwoDigit,
  divisionWithRemainder,
  longDivision,
  factorsMultiples,
  primeComposite,
  roundTo,
  placeValueMillions,
  addSub4Digit,
  multiplicativeComparison,
  multiStepWordProblem,
  patternsRules,
  orderOfOperations,
};

