/**
 * Math generators, grades 1-2 (Lily's track). Counting to 120, place value,
 * addition/subtraction strategies (CPA: ten frames, base-ten blocks, bar-model
 * number sentences), time, money, length, shapes, data.
 *
 * Rules: pure functions of ctx.rng, relative imports, `import type`, no DOM.
 * Every question has `explain` (the rule + the steps) and `hint` (a nudge
 * that never states the answer). SVGs: viewBox 0 0 100 100, no id="".
 */

import type { Generator, Option, Question } from "../types";
import { int, pick, shuffle, sample } from "../rng";
import {
  COLORS,
  KID_NAMES,
  SCENES_EARLY,
  arraySvg,
  baseTenSvg,
  barFractionSvg,
  boolParam,
  circleFractionSvg,
  clockSvg,
  columnAddExplain,
  columnSubExplain,
  gridSvg,
  labelChoice,
  levelOf,
  numListParam,
  numParam,
  numberLineSvg,
  numberName,
  numericChoice,
  optionChoice,
  pickName,
  plural,
  polygonPoints,
  r1,
  strListParam,
  strParam,
  svgText,
  svgWrap,
  tenFrameSvg,
  timeStr,
} from "./math-util";

const EMOJI_SETS = ["🍎", "🐴", "⚽", "⭐", "🎀", "🌸", "🐶", "🦋", "🍪", "🏀", "⚾", "🧁"];

function emojiGroups(emoji: string, n: number, groupSize = 5): string {
  const groups: string[] = [];
  for (let i = 0; i < n; i += groupSize) groups.push(emoji.repeat(Math.min(groupSize, n - i)));
  return groups.join("  ");
}

function seq(from: number, to: number): string {
  const out: number[] = [];
  if (to >= from) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out.join(", ");
}

// ---------------------------------------------------------------------------
// countObjects — K.CC / 1.NBT.A.1 (represent a set with a numeral)
// ---------------------------------------------------------------------------

const countObjects: Generator = (ctx) => {
  const { rng } = ctx;
  const max = Math.min(30, numParam(ctx, "max", 20));
  const emoji = pick(rng, EMOJI_SETS);
  const n = int(rng, 1, max);
  const variant = rng();
  if (variant < 0.6) {
    return {
      type: "numeric",
      prompt: `How many ${emoji} are there?`,
      answer: n,
      display: { emoji: emojiGroups(emoji, n), speak: "How many are there? Count them." },
      explain: `Touch each one and say a number: 1, 2, 3 … The last number you say is how many. There are ${n}. The groups of 5 help: ${n >= 5 ? `${Math.floor(n / 5)} full group${Math.floor(n / 5) === 1 ? "" : "s"} of 5${n % 5 ? ` and ${n % 5} more` : ""}` : "less than one group of 5"}.`,
      hint: "Touch each one as you count. Count a whole group of 5 at once, then keep going.",
    };
  }
  if (variant < 0.85) {
    const counts = new Set<number>([n]);
    const pool = [n + 1, n - 1, n + 2, n - 2, n + 3].filter((c) => c >= 1 && c <= max + 3);
    for (const c of pool) {
      counts.add(c);
      if (counts.size === 4) break;
    }
    const options: Option[] = [...counts].map((c) => ({ emoji: emojiGroups(emoji, c, 5) }));
    const answer = options[0];
    return optionChoice(rng, answer, options.slice(1), {
      prompt: `Which group has ${n} ${emoji}?`,
      display: { speak: `Which group has ${n}?` },
      explain: `Count each group. The group with exactly ${n} is the one. Counting by 5s makes it faster: 5, 10, 15 …`,
      hint: "Count each group out loud. Stop when you reach the number you want.",
    });
  }
  const written = numberName(n);
  return numericChoice(rng, n, [n + 1, n - 1, n + 10, n + 2], {
    prompt: `Which numeral means "${written}"?`,
    display: { emoji: emojiGroups(emoji, n), speak: `Which number means ${written}?` },
    explain: `"${written}" is the number word. Count the ${emoji} to check: there are ${n}, so the numeral is ${n}.`,
    hint: "Say the number word slowly, then count the pictures to check.",
  });
};

// ---------------------------------------------------------------------------
// whatComesNext / whatComesBefore / whatComesBetween — 1.NBT.A.1
// ---------------------------------------------------------------------------

function pickHardNumber(rng: () => number, max: number, endsIn: number): number {
  // 45%: a number ending in `endsIn` (crossing a decade is the hard part)
  if (rng() < 0.45) {
    const tens = int(rng, 0, Math.floor((max - endsIn) / 10));
    return Math.max(1, tens * 10 + endsIn);
  }
  return int(rng, 1, max);
}

const whatComesNext: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 120);
  const n = Math.min(max - 1, pickHardNumber(rng, max - 1, 9));
  const cross = n % 10 === 9;
  if (rng() < 0.5) {
    return {
      type: "numeric",
      prompt: `What number comes right after ${n}?`,
      answer: n + 1,
      display: { speak: `What number comes right after ${n}?` },
      explain: `After ${n} comes one more: ${n} + 1 = ${n + 1}.${cross ? ` ${n} ends in 9, so the next number starts a new ten.` : ""}`,
      hint: cross ? `${n} ends in 9. When a number ends in 9, the next number starts a new group of ten.` : `Say ${n}, then say the next counting number.`,
    };
  }
  const start = Math.max(1, n - 2);
  return {
    type: "numeric",
    prompt: `Keep counting: ${seq(start, n)}, ___`,
    answer: n + 1,
    display: { speak: `Keep counting. ${seq(start, n)}, and then?` },
    explain: `Each number is one more than the one before. ${n} + 1 = ${n + 1}.`,
    hint: "Say the numbers out loud and keep going by one.",
  };
};

const whatComesBefore: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 120);
  const n = Math.max(2, pickHardNumber(rng, max, 0));
  const cross = n % 10 === 0;
  if (rng() < 0.5) {
    return {
      type: "numeric",
      prompt: `What number comes right before ${n}?`,
      answer: n - 1,
      display: { speak: `What number comes right before ${n}?` },
      explain: `Before ${n} is one less: ${n} − 1 = ${n - 1}.${cross ? ` ${n} ends in 0, so the number before it ends in 9.` : ""}`,
      hint: cross ? `${n} ends in 0. The number just before a "ten" always ends in 9.` : `Count back one from ${n}.`,
    };
  }
  const end = Math.min(max, n + 2);
  return {
    type: "numeric",
    prompt: `Fill in the blank: ___, ${seq(n, end)}`,
    answer: n - 1,
    display: { speak: `What number comes just before ${n}? Blank, ${seq(n, end)}` },
    explain: `The blank is one less than ${n}. ${n} − 1 = ${n - 1}.`,
    hint: `Count back one from ${n}. If you need to, count up to ${n} from a smaller number and listen to what you say right before it.`,
  };
};

const whatComesBetween: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 120);
  const a = int(rng, 1, max - 2);
  const mid = a + 1;
  if (rng() < 0.6) {
    return {
      type: "numeric",
      prompt: `What number is between ${a} and ${a + 2}?`,
      answer: mid,
      display: { speak: `What number is between ${a} and ${a + 2}?` },
      explain: `Count on from ${a}: the next number is ${mid}, and after that comes ${a + 2}. So ${mid} is between them.`,
      hint: `Start at ${a} and count on by one. The number you say first is the one between.`,
    };
  }
  return {
    type: "numeric",
    prompt: `Fill in the blank: ${a}, ___, ${a + 2}`,
    answer: mid,
    display: { speak: `Fill in the blank. ${a}, blank, ${a + 2}` },
    explain: `The numbers go up by one. ${a} + 1 = ${mid}, and ${mid} + 1 = ${a + 2}.`,
    hint: `Say ${a}, then the very next counting number.`,
  };
};

// ---------------------------------------------------------------------------
// countOnFrom — 1.NBT.A.1 (count on / count back from any number, blank anywhere)
// ---------------------------------------------------------------------------

const countOnFrom: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 120);
  const dirParam = strParam(ctx, "direction", "forward");
  const back = dirParam === "back" || (dirParam === "both" && rng() < 0.5);
  const len = int(rng, 4, 5);
  const variant = rng();
  if (variant < 0.7) {
    const start = back ? int(rng, len + 1, max) : int(rng, 1, max - len);
    const terms = Array.from({ length: len }, (_, i) => (back ? start - i : start + i));
    const blank = int(rng, 1, len - 1);
    const shown = terms.map((t, i) => (i === blank ? "___" : String(t))).join(", ");
    const answer = terms[blank];
    return {
      type: "numeric",
      prompt: `${back ? "Count back" : "Count on"}: ${shown}`,
      answer,
      display: { speak: `${back ? "Count back" : "Count on"}. ${shown.replace("___", "blank")}` },
      explain: `${back ? "Counting back, each number is one less" : "Counting on, each number is one more"} than the one before: ${terms.join(", ")}. The missing number is ${answer}.`,
      hint: `Say the numbers out loud from ${terms[0]}. What do you say in the blank spot?`,
    };
  }
  const start = back ? int(rng, 10, max) : int(rng, 1, max - 5);
  const steps = int(rng, 2, 5);
  const answer = back ? start - steps : start + steps;
  const path = back ? seq(start - 1, answer) : seq(start + 1, answer);
  return {
    type: "numeric",
    prompt: `Start at ${start} and count ${back ? "back" : "on"} ${steps}. Where do you land?`,
    answer,
    display: { speak: `Start at ${start} and count ${back ? "back" : "on"} ${steps}. Where do you land?` },
    explain: `Start at ${start}, then count ${steps} ${back ? "back" : "on"}: ${path}. You land on ${answer}.`,
    hint: `Say ${start}, then use ${steps} fingers to count ${back ? "back" : "on"} one at a time.`,
  };
};

// ---------------------------------------------------------------------------
// skipCount — 1.NBT.A.1 (by 10s), 2.NBT.A.2 (5s, 10s, 100s)
// ---------------------------------------------------------------------------

const skipCount: Generator = (ctx) => {
  const { rng } = ctx;
  const steps = numListParam(ctx, "steps", [2, 5, 10]);
  const max = numParam(ctx, "max", 120);
  const offStart = boolParam(ctx, "offStart", false);
  const step = pick(rng, steps);
  const len = 4;
  let start: number;
  if (offStart && rng() < 0.5) start = int(rng, 1, Math.max(1, max - step * len));
  else start = step * int(rng, 1, Math.max(1, Math.floor(max / step) - len));
  const terms = Array.from({ length: len }, (_, i) => start + step * i);
  const answer = start + step * len;
  const blankAtEnd = rng() < 0.6;
  if (blankAtEnd) {
    return {
      type: "numeric",
      prompt: `Count by ${step}s: ${terms.join(", ")}, ___`,
      answer,
      display: { speak: `Count by ${step}s. ${terms.join(", ")}, and then?` },
      explain: `Counting by ${step}s means adding ${step} each time. ${terms[len - 1]} + ${step} = ${answer}.${step === 10 ? " Only the tens digit changes when you add 10." : ""}`,
      hint: `Add ${step} to ${terms[len - 1]}.${step === 10 ? " The ones digit stays the same." : ""}`,
    };
  }
  const blank = int(rng, 1, len - 2);
  const shown = terms.map((t, i) => (i === blank ? "___" : String(t))).join(", ");
  return {
    type: "numeric",
    prompt: `Count by ${step}s: ${shown}`,
    answer: terms[blank],
    display: { speak: `Count by ${step}s. ${shown.replace("___", "blank")}` },
    explain: `Each number is ${step} more than the one before: ${terms.join(", ")}. The missing number is ${terms[blank]}.`,
    hint: `Add ${step} to the number just before the blank, or take ${step} away from the number just after it.`,
  };
};

// ---------------------------------------------------------------------------
// compareNumbers — 1.NBT.B.3 (two-digit), 2.NBT.A.4 (three-digit), 4.NBT.A.2
// ---------------------------------------------------------------------------

function compareWhy(a: number, b: number): string {
  if (a === b) return `${a} and ${b} are the same number, so they are equal.`;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const places = [1000000, 100000, 10000, 1000, 100, 10, 1];
  const names: Record<number, string> = { 1000000: "millions", 100000: "hundred-thousands", 10000: "ten-thousands", 1000: "thousands", 100: "hundreds", 10: "tens", 1: "ones" };
  if (String(big).length !== String(small).length) return `${big} has more digits than ${small}, so ${big} is greater.`;
  // Biggest place first; name every place that ties before the one that decides.
  const tied: string[] = [];
  for (const p of places) {
    if (p > big) continue;
    const db = Math.floor(big / p) % 10;
    const ds = Math.floor(small / p) % 10;
    if (db === ds) {
      tied.push(`${db} ${names[p]}`);
      continue;
    }
    const why = `${db} ${names[p]} is more than ${ds} ${names[p]}, so ${big} > ${small}.`;
    if (tied.length === 0) return `Compare the ${names[p]} first: ${why}`;
    return `Both have ${tied.join(" and ")}, so compare the next place, the ${names[p]}: ${why}`;
  }
  return `${big} is greater than ${small}.`;
}

const compareNumbers: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 99);
  const min = numParam(ctx, "min", max > 999 ? 1000 : max > 99 ? 100 : 10);
  const variant = rng();
  const near = () => {
    const a = int(rng, min, max);
    const spread = max > 999 ? 5000 : max > 99 ? 60 : 12;
    const b = Math.max(min, Math.min(max, a + int(rng, -spread, spread)));
    return [a, b];
  };
  if (variant < 0.55) {
    const pair = near();
    const a = pair[0];
    let b = pair[1];
    if (rng() < 0.15) b = a;
    const sym = a > b ? ">" : a < b ? "<" : "=";
    const options = shuffle(rng, ["<", ">", "="]);
    return {
      type: "choice",
      prompt: `${a} ○ ${b}   Which sign goes in the circle?`,
      display: { speak: `${a} compared with ${b}. Is it greater than, less than, or equal?` },
      options: options.map((s) => ({ label: s })),
      answerIndex: options.indexOf(sym),
      explain: `${compareWhy(a, b)} The sign is ${sym} (${sym === ">" ? "greater than" : sym === "<" ? "less than" : "equal to"}). The open side of the sign faces the bigger number.`,
      hint: `Compare the biggest place first (${max > 99 ? "hundreds, then tens" : "tens, then ones"}). The open mouth of the sign eats the bigger number.`,
    };
  }
  const set = new Set<number>();
  while (set.size < 4) set.add(int(rng, min, max));
  const nums = [...set];
  const greatest = variant < 0.78;
  const answer = greatest ? Math.max(...nums) : Math.min(...nums);
  const sorted = [...nums].sort((x, y) => x - y);
  return numericChoice(rng, answer, nums.filter((n) => n !== answer), {
    prompt: `Which number is the ${greatest ? "greatest" : "least"}?`,
    display: { speak: `Which number is the ${greatest ? "greatest" : "least"}?` },
    explain: `In order from least to greatest: ${sorted.join(", ")}. So the ${greatest ? "greatest" : "least"} is ${answer}. ${greatest ? compareWhy(sorted[sorted.length - 1], sorted[sorted.length - 2]) : compareWhy(sorted[1], sorted[0])}`,
    hint: `Look at the ${max > 99 ? "hundreds" : "tens"} digit of each number first. If they tie, look at the next place.`,
  });
};

// ---------------------------------------------------------------------------
// tenFrameAdd / tenFrameSub — 1.OA.C.6 (within 10, within 20)
// ---------------------------------------------------------------------------

function addStrategy(a: number, b: number): string {
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const sum = a + b;
  if (small === 0) return `Adding 0 changes nothing: ${a} + ${b} = ${sum}.`;
  if (a === b) return `This is a double: ${a} + ${a} = ${sum}.`;
  if (Math.abs(a - b) === 1) return `This is a near double: ${small} + ${small} = ${small * 2}, and 1 more is ${sum}.`;
  if (big < 10 && sum > 10) {
    const toTen = 10 - big;
    return `Make ten: ${big} needs ${toTen} to make 10. Split ${small} into ${toTen} and ${small - toTen}. ${big} + ${toTen} = 10, and 10 + ${small - toTen} = ${sum}.`;
  }
  if (big === 10) return `10 and ${small} more is ${sum} — ten and some ones.`;
  const path = Array.from({ length: small }, (_, i) => big + i + 1).join(", ");
  return `Start at the bigger number, ${big}, and count on ${small}: ${path}. So ${a} + ${b} = ${sum}.`;
}

const tenFrameAdd: Generator = (ctx) => {
  const { rng } = ctx;
  const max = Math.min(20, numParam(ctx, "max", 10));
  const frames: 1 | 2 = max > 10 ? 2 : 1;
  let a: number;
  let b: number;
  if (max > 10) {
    a = int(rng, 2, 10);
    b = int(rng, 1, Math.min(10, max - a));
    if (rng() < 0.6 && a + b <= 10) a = Math.min(10, a + int(rng, 1, 10 - a - b + 1 > 0 ? 10 - a - b + 1 : 1));
  } else {
    a = int(rng, 1, max - 1);
    b = int(rng, 1, max - a);
  }
  const sum = a + b;
  return {
    type: "numeric",
    prompt: `${a} + ${b} = ?`,
    answer: sum,
    display: { svg: tenFrameSvg(a, b, frames), speak: `${a} plus ${b} equals what?` },
    explain: addStrategy(a, b),
    hint: sum > 10 && a < 10 && b < 10 ? "Fill the first ten frame to make 10, then count what spills into the second frame." : "Start at the bigger number and count on the other dots.",
  };
};

const tenFrameSub: Generator = (ctx) => {
  const { rng } = ctx;
  const max = Math.min(20, numParam(ctx, "max", 10));
  const frames: 1 | 2 = max > 10 ? 2 : 1;
  const t = max > 10 ? int(rng, 11, max) : int(rng, 2, max);
  // s < t: "6 − 6" would be a degenerate take-everything item (and the
  // count-up explanation would count 0 jumps backwards).
  let s = max > 10 ? int(rng, 2, t - 1) : int(rng, 1, t - 1);
  if (t - s === s && s > 1) s -= 1;
  const d = t - s;
  let explain: string;
  if (t > 10 && d < 10 && s < 10) {
    const toTen = t - 10;
    explain = `Take away to ten first: ${t} − ${toTen} = 10. Then take away the rest: ${s} − ${toTen} = ${s - toTen}, and 10 − ${s - toTen} = ${d}. So ${t} − ${s} = ${d}.`;
  } else if (s <= 3) {
    explain = `Count back ${s} from ${t}: ${seq(t - 1, d)}. So ${t} − ${s} = ${d}.`;
  } else if (d <= 3 && d > 0) {
    explain = `Think addition: ${s} + ? = ${t}. Count up from ${s}: ${seq(s + 1, t)} — that is ${plural(d, "jump")}. So ${t} − ${s} = ${d}.`;
  } else {
    explain = `The frame shows ${t} dots. Taking away the ${s} orange ones leaves ${d} blue ones. ${t} − ${s} = ${d}.`;
  }
  return {
    type: "numeric",
    prompt: `${t} − ${s} = ?`,
    answer: d,
    display: { svg: tenFrameSvg(d, s, frames), speak: `${t} minus ${s} equals what?` },
    explain,
    hint: "The orange dots are being taken away. Count the blue dots that are left — or count back from the bigger number.",
  };
};

// ---------------------------------------------------------------------------
// makeTen — 1.OA.C.6 (8 + 6 = 8 + 2 + 4)
// ---------------------------------------------------------------------------

const makeTen: Generator = (ctx) => {
  const { rng } = ctx;
  const a = int(rng, 5, 9);
  const b = int(rng, 11 - a, 9);
  const toTen = 10 - a;
  const rest = b - toTen;
  const sum = a + b;
  const variant = rng();
  if (variant < 0.4) {
    return {
      type: "numeric",
      prompt: `${a} + ${b} = ?`,
      answer: sum,
      display: { svg: tenFrameSvg(a, b, 2), speak: `${a} plus ${b}. Make a ten first.` },
      explain: `Make ten: ${a} needs ${toTen} more to make 10. Split ${b} into ${toTen} and ${rest}. ${a} + ${toTen} = 10, then 10 + ${rest} = ${sum}.`,
      hint: `How many dots fill the first frame? Give ${a} that many from the ${b}, then add what is left to 10.`,
    };
  }
  if (variant < 0.7) {
    return {
      type: "numeric",
      prompt: `${a} + ___ = 10`,
      answer: toTen,
      display: { svg: tenFrameSvg(a, 0, 1), speak: `${a} plus what makes 10?` },
      explain: `Count the empty boxes in the ten frame. ${a} + ${toTen} = 10. These are the "make ten" partners.`,
      hint: "Count the empty boxes in the frame.",
    };
  }
  return {
    type: "numeric",
    prompt: `${a} + ${b} = ${a} + ${toTen} + ___`,
    answer: rest,
    display: { svg: tenFrameSvg(a, b, 2), speak: `${a} plus ${b} is the same as ${a} plus ${toTen} plus what?` },
    explain: `We split ${b} into two parts: ${toTen} (to make ten with ${a}) and the rest. ${b} − ${toTen} = ${rest}. So ${a} + ${b} = ${a} + ${toTen} + ${rest} = ${sum}.`,
    hint: `${b} is being split into ${toTen} and another part. What is left of ${b} after you take ${toTen}?`,
  };
};

// ---------------------------------------------------------------------------
// doublesNearDoubles — 1.OA.C.6
// ---------------------------------------------------------------------------

const doublesNearDoubles: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  const n = int(rng, 1, Math.floor(max / 2) - (rng() < 0.5 ? 1 : 0));
  const variant = rng();
  if (variant < 0.35) {
    return {
      type: "numeric",
      prompt: `${n} + ${n} = ?`,
      answer: 2 * n,
      display: { svg: tenFrameSvg(n, n, 2 * n > 10 ? 2 : 1), speak: `${n} plus ${n}` },
      explain: `This is a double: two groups of ${n}. ${n} + ${n} = ${2 * n}.`,
      hint: `Doubles: 1+1=2, 2+2=4, 3+3=6 … Keep going up to ${n} + ${n}.`,
    };
  }
  if (variant < 0.5) {
    return {
      type: "numeric",
      prompt: `What is double ${n}?`,
      answer: 2 * n,
      display: { speak: `What is double ${n}?` },
      explain: `Double means add the number to itself: ${n} + ${n} = ${2 * n}.`,
      hint: `Double ${n} means ${n} plus ${n}.`,
    };
  }
  const first = rng() < 0.5;
  // n + (n + 1) must stay within max (and within the 20 cells of a double ten frame).
  const nn = Math.min(n, Math.floor((max - 1) / 2));
  const a = first ? nn : nn + 1;
  const b = first ? nn + 1 : nn;
  return {
    type: "numeric",
    prompt: `${a} + ${b} = ?`,
    answer: 2 * nn + 1,
    display: { svg: tenFrameSvg(a, b, 2 * nn + 1 > 10 ? 2 : 1), speak: `${a} plus ${b}` },
    explain: `Near double: ${nn} + ${nn} = ${2 * nn}, then one more makes ${2 * nn + 1}. So ${a} + ${b} = ${2 * nn + 1}.`,
    hint: `Use the double you know, ${nn} + ${nn}, then add 1 more.`,
  };
};

// ---------------------------------------------------------------------------
// missingAddend — 1.OA.B.4, 1.OA.D.8 (unknown in any position)
// ---------------------------------------------------------------------------

const missingAddend: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  const total = int(rng, 5, max);
  let part = int(rng, 1, total - 1);
  if (total - part === part) part += 1;
  const other = total - part;
  const variant = int(rng, 0, 4);
  const countUp = `Count up from ${part} to ${total}: ${seq(part + 1, total)} — that is ${plural(other, "jump")}.`;
  switch (variant) {
    case 0:
      return {
        type: "numeric",
        prompt: `${part} + ___ = ${total}`,
        answer: other,
        display: { speak: `${part} plus what equals ${total}?` },
        explain: `Think: ${part} plus what makes ${total}? ${countUp} So ${part} + ${other} = ${total}.`,
        hint: `Start at ${part} and count up to ${total}. How many jumps did you take?`,
      };
    case 1:
      return {
        type: "numeric",
        prompt: `___ + ${part} = ${total}`,
        answer: other,
        display: { speak: `What plus ${part} equals ${total}?` },
        explain: `Turn it around: ${part} + ? = ${total}. ${countUp} So the missing number is ${other}.`,
        hint: `Order does not matter in addition. Ask: ${part} plus what makes ${total}?`,
      };
    case 2:
      return {
        type: "numeric",
        prompt: `${total} − ___ = ${other}`,
        answer: part,
        display: { speak: `${total} minus what equals ${other}?` },
        explain: `Subtraction is a missing-addend problem: ${other} + ? = ${total}. ${other} + ${part} = ${total}, so ${total} − ${part} = ${other}.`,
        hint: `Think of the addition fact: ${other} plus what makes ${total}?`,
      };
    case 3:
      return {
        type: "numeric",
        prompt: `___ − ${part} = ${other}`,
        answer: total,
        display: { speak: `What minus ${part} equals ${other}?` },
        explain: `If taking away ${part} leaves ${other}, the start number was ${other} + ${part}. ${other} + ${part} = ${total}.`,
        hint: `Put the parts back together: ${other} plus ${part}.`,
      };
    default:
      return {
        type: "numeric",
        prompt: `${total} − ${part} = ?   Think: ${part} + ? = ${total}`,
        answer: other,
        display: { speak: `${total} minus ${part}. Think ${part} plus what equals ${total}?` },
        explain: `${countUp} So ${total} − ${part} = ${other}.`,
        hint: `Count up from ${part} until you reach ${total}.`,
      };
  }
};

// ---------------------------------------------------------------------------
// countOnAdd — 1.OA.C.5 (counting on / counting back)
// ---------------------------------------------------------------------------

const countOnAdd: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  const big = int(rng, 4, max - 3);
  const small = int(rng, 1, Math.min(3, max - big));
  if (rng() < 0.6) {
    const flip = rng() < 0.5;
    const a = flip ? small : big;
    const b = flip ? big : small;
    return {
      type: "numeric",
      prompt: `${a} + ${b} = ?`,
      answer: a + b,
      display: { speak: `${a} plus ${b}` },
      explain: `Start at the bigger number, ${big}, and count on ${small}: ${seq(big + 1, big + small)}. So ${a} + ${b} = ${a + b}.`,
      hint: `Put the bigger number in your head and count on ${small} with your fingers.`,
    };
  }
  const t = big + small;
  return {
    type: "numeric",
    prompt: `${t} − ${small} = ?`,
    answer: big,
    display: { speak: `${t} minus ${small}` },
    explain: `Count back ${small} from ${t}: ${seq(t - 1, big)}. So ${t} − ${small} = ${big}.`,
    hint: `Say ${t}, then count back ${small} using your fingers.`,
  };
};

// ---------------------------------------------------------------------------
// addProperties — 1.OA.B.3 (commutative, associative as strategies)
// ---------------------------------------------------------------------------

const addProperties: Generator = (ctx) => {
  const { rng } = ctx;
  const a = int(rng, 2, 9);
  let b = int(rng, 2, 9);
  if (b === a) b = a === 9 ? 8 : a + 1;
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: `${a} + ${b} = ${b} + ___`,
      answer: a,
      display: { speak: `${a} plus ${b} equals ${b} plus what?` },
      explain: `Turn-around facts: you can add in any order and get the same total. ${a} + ${b} = ${a + b} and ${b} + ${a} = ${a + b}. The missing number is ${a}.`,
      hint: "The same two numbers, just swapped. Which number is missing from the right side?",
    };
  }
  if (variant === 1) {
    return labelChoice(rng, `${b} + ${a}`, [`${a} + ${a}`, `${b} + ${b}`, `${a + b} + ${a}`], {
      prompt: `Which has the same total as ${a} + ${b}?`,
      display: { speak: `Which has the same total as ${a} plus ${b}?` },
      explain: `Swapping the numbers does not change the sum: ${a} + ${b} = ${a + b} and ${b} + ${a} = ${a + b}.`,
      hint: "Does the order matter when you add? Try it with 2 + 1 and 1 + 2.",
    });
  }
  if (variant === 2) {
    const c = int(rng, 1, 9);
    const partner = 10 - a;
    return {
      type: "numeric",
      prompt: `${a} + ${partner} + ${c} = ?`,
      answer: 10 + c,
      display: { speak: `${a} plus ${partner} plus ${c}` },
      explain: `Group the easy pair first: ${a} + ${partner} = 10. Then 10 + ${c} = ${10 + c}. You can group addends any way you like.`,
      hint: "Look for two numbers that make 10. Add those first.",
    };
  }
  const answer = `${b} + ${a}`;
  return labelChoice(rng, answer, [`${a} − ${b}`, `${b} − ${a}`, `${a} + ${a}`, `${b} + ${b}`], {
    prompt: `Which is the turn-around fact for ${a} + ${b}?`,
    display: { speak: `Which is the turn around fact for ${a} plus ${b}?` },
    explain: `A turn-around fact swaps the two addends: ${a} + ${b} and ${b} + ${a} both equal ${a + b}.`,
    hint: "Keep both numbers and the plus sign, but switch their places.",
  });
};

// ---------------------------------------------------------------------------
// equationTrueFalse — 1.OA.D.7 (meaning of the equal sign)
// ---------------------------------------------------------------------------

const equationTrueFalse: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  const t = int(rng, 4, max);
  const a = int(rng, 1, t - 1);
  const b = t - a;
  const c = int(rng, 1, t - 1);
  const d = t - c;
  const trueForms = [`${t} = ${t}`, `${a} + ${b} = ${b} + ${a}`, `${t} = ${a} + ${b}`, `${a} + ${b} = ${c} + ${d}`, `${t} − ${a} = ${b}`, `${a} + ${b} = ${t}`];
  const falseForms = [`${a} + ${b} = ${t + 1}`, `${t} = ${t + 2}`, `${a} + ${b} = ${a}`, `${t} − ${a} = ${b + 1}`, `${a} + ${b} = ${c} + ${d + 1}`, `${t + 1} = ${a} + ${b}`];
  if (rng() < 0.55) {
    const answer = pick(rng, trueForms);
    const falses = sample(rng, falseForms, 3);
    return labelChoice(rng, answer, falses, {
      prompt: "Which number sentence is TRUE?",
      display: { speak: "Which number sentence is true?" },
      explain: `The equal sign means "is the same amount as". Both sides of ${answer} are worth ${t}, so it is true. Check the others: one side is a different amount.`,
      hint: "Work out each side of the equal sign. Are they the same amount?",
    });
  }
  const isTrue = rng() < 0.5;
  const eq = isTrue ? pick(rng, trueForms) : pick(rng, falseForms);
  const options = shuffle(rng, ["True", "False"]);
  return {
    type: "choice",
    prompt: `True or false?  ${eq}`,
    display: { speak: `True or false? ${eq.replace("−", "minus").replace("=", "equals")}` },
    options: options.map((o) => ({ label: o })),
    answerIndex: options.indexOf(isTrue ? "True" : "False"),
    explain: isTrue
      ? `Both sides are the same amount (${t}), so ${eq} is true. The equal sign means "same as", not "the answer is".`
      : `Work out each side: they are different amounts, so ${eq} is false. The equal sign only goes between two amounts that are the same.`,
    hint: "Find the value of the left side and the value of the right side. The equal sign is only true if they match.",
  };
};

// ---------------------------------------------------------------------------
// threeAddends — 1.OA.A.2
// ---------------------------------------------------------------------------

const threeAddends: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  let a = int(rng, 1, 9);
  let b = int(rng, 1, 9);
  let c = int(rng, 1, 9);
  while (a + b + c > max) {
    if (a > 1) a--;
    else if (b > 1) b--;
    else c--;
  }
  const total = a + b + c;
  const pairs = [
    [a, b, c],
    [a, c, b],
    [b, c, a],
  ];
  const ten = pairs.find(([x, y]) => x + y === 10);
  const dbl = pairs.find(([x, y]) => x === y);
  const strategy = ten
    ? `Look for a ten: ${ten[0]} + ${ten[1]} = 10, then 10 + ${ten[2]} = ${total}.`
    : dbl
      ? `Look for a double: ${dbl[0]} + ${dbl[1]} = ${dbl[0] * 2}, then ${dbl[0] * 2} + ${dbl[2]} = ${total}.`
      : `Add two numbers first, then the third: ${a} + ${b} = ${a + b}, then ${a + b} + ${c} = ${total}.`;
  if (rng() < 0.5) {
    return {
      type: "numeric",
      prompt: `${a} + ${b} + ${c} = ?`,
      answer: total,
      display: { speak: `${a} plus ${b} plus ${c}` },
      explain: strategy,
      hint: "Add two of the numbers first. Is there a pair that makes a ten, or a double?",
    };
  }
  const name = pick(rng, KID_NAMES);
  const scene = pick(rng, SCENES_EARLY);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const d = sample(rng, days, 3);
  return {
    type: "numeric",
    prompt: `${name} ${scene.more} ${a} ${scene.item[1]} on ${d[0]}, ${b} on ${d[1]}, and ${c} on ${d[2]}. How many ${scene.item[1]} in all?`,
    answer: total,
    display: { emoji: scene.emoji, speak: `${name} ${scene.more} ${a} ${scene.item[1]} on ${d[0]}, ${b} on ${d[1]}, and ${c} on ${d[2]}. How many in all?` },
    explain: `Number sentence: ${a} + ${b} + ${c} = ${total}. ${strategy}`,
    hint: "Write the three numbers with plus signs. Add the easiest pair first.",
  };
};

// ---------------------------------------------------------------------------
// addSubFacts — 2.OA.B.2 (facts within 20 from memory)
// ---------------------------------------------------------------------------

const addSubFacts: Generator = (ctx) => {
  const { rng } = ctx;
  const op = strParam(ctx, "op", "mixed");
  const max = numParam(ctx, "max", 20);
  const doSub = op === "sub" || (op === "mixed" && rng() < 0.5);
  // weight toward the harder facts (both addends 5-9)
  const a = rng() < 0.7 ? int(rng, 5, 9) : int(rng, 0, 10);
  const b = rng() < 0.7 ? int(rng, 5, 9) : int(rng, 0, 10);
  if (!doSub) {
    const sum = Math.min(max, a + b);
    const bb = sum - a;
    return {
      type: "numeric",
      prompt: `${a} + ${bb} = ?`,
      answer: sum,
      display: { speak: `${a} plus ${bb}` },
      explain: addStrategy(a, bb),
      hint: a === bb ? "It is a double." : a + bb > 10 ? "Make ten first, then add the rest." : "Start at the bigger number and count on.",
    };
  }
  const t = Math.min(max, a + b);
  let s = Math.max(0, Math.min(t, rng() < 0.5 ? a : b));
  if (t - s === s && s > 0) s -= 1;
  const d = t - s;
  return {
    type: "numeric",
    prompt: `${t} − ${s} = ?`,
    answer: d,
    display: { speak: `${t} minus ${s}` },
    explain:
      t > 10 && s < 10 && d < 10
        ? `Go down to ten: ${t} − ${t - 10} = 10, then 10 − ${s - (t - 10)} = ${d}. Or think ${s} + ${d} = ${t}.`
        : `Think addition: ${s} + ? = ${t}. ${s} + ${d} = ${t}, so ${t} − ${s} = ${d}.`,
    hint: `Think of the addition fact: ${s} plus what makes ${t}?`,
  };
};

// ---------------------------------------------------------------------------
// tenMoreLess — 1.NBT.C.5 (10 more/less), 2.NBT.B.8 (10 or 100 more/less)
// ---------------------------------------------------------------------------

const tenMoreLess: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 99);
  const steps = numListParam(ctx, "steps", [10]);
  const step = pick(rng, steps);
  const more = rng() < 0.5;
  let n = more ? int(rng, step <= 10 ? 10 : 100, max - step) : int(rng, step + 1, max);
  if (!more && n - step === step) n += 1;
  const answer = more ? n + step : n - step;
  const place = step === 10 ? "tens" : "hundreds";
  const nextPlace = step === 10 ? "hundreds" : "thousands";
  const unitWord = step === 10 ? "ten" : "hundred";
  const lower = step === 10 ? "ones" : "tens and ones";
  // Crossing a hundred (91 + 10 = 101, 306 − 10 = 296): the next place changes too.
  const crosses = Math.floor(n / (step * 10)) !== Math.floor(answer / (step * 10));
  const digit = Math.floor(n / step) % 10;
  const nextUnit = step === 10 ? "hundred" : "thousand";
  const explain = crosses
    ? more
      ? `${n} has ${digit} ${place}. One more ${unitWord} makes 10 ${place} = 1 ${nextUnit}, so the ${place} digit becomes 0 and the ${nextPlace} digit goes up by 1: ${n} + ${step} = ${answer}. The ${lower} stay the same.`
      : `${n} has 0 ${place}, so regroup 1 ${nextUnit} as 10 ${place} and take 1 ${unitWord} away: 9 ${place} are left and the ${nextPlace} digit goes down by 1. ${n} − ${step} = ${answer}. The ${lower} stay the same.`
    : `${step} ${more ? "more" : "less"} changes only the ${place} digit: ${n} ${more ? "+" : "−"} ${step} = ${answer}. The ${lower} stay the same.`;
  return {
    type: "numeric",
    prompt: `What is ${step} ${more ? "more" : "less"} than ${n}?`,
    answer,
    display: { speak: `What is ${step} ${more ? "more" : "less"} than ${n}?` },
    explain,
    hint: crosses
      ? `Count ${more ? "up" : "down"} one ${unitWord}. The ${place} digit is ${digit}, so the ${nextPlace} digit changes too. The ${lower} stay the same.`
      : `Only the ${place} digit changes. Count ${more ? "up" : "down"} one ${unitWord}.`,
  };
};

// ---------------------------------------------------------------------------
// placeValueTensOnes — 1.NBT.B.2 (tens and ones), 2.NBT.A.1 (hundreds)
// ---------------------------------------------------------------------------

const placeValueTensOnes: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 99);
  const min = numParam(ctx, "min", 10);
  const n = int(rng, min, max);
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts = [h ? plural(h, "hundred") : "", t ? plural(t, "ten") : "", o ? plural(o, "one") : ""].filter(Boolean).join(" and ");
  const variant = int(rng, 0, 4);
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: "What number do the blocks show?",
      answer: n,
      display: { svg: baseTenSvg(h, t, o), speak: "What number do the blocks show?" },
      explain: `${h ? "Flats are hundreds, rods" : "Rods"} are tens and small cubes are ones. ${parts} = ${n}.`,
      hint: `Count the ${h ? "flats, then the " : ""}rods by ${h ? "hundreds and tens" : "tens"}, then count the little cubes by ones.`,
    };
  }
  if (variant === 1) {
    const which = h && rng() < 0.4 ? "hundreds" : rng() < 0.5 ? "tens" : "ones";
    const answer = which === "hundreds" ? h : which === "tens" ? t : o;
    return {
      type: "numeric",
      prompt: `How many ${which} are in ${n}?`,
      answer,
      display: { svg: baseTenSvg(h, t, o), speak: `How many ${which} are in ${n}?` },
      explain: `${n} is ${parts}. The ${which} digit is ${answer}.`,
      hint: `In ${n}, the ${which} digit is the one on the ${which === "ones" ? "right" : which === "tens" ? (h ? "middle" : "left") : "left"}.`,
    };
  }
  if (variant === 2) {
    return {
      type: "numeric",
      prompt: `${parts} = ?`,
      answer: n,
      display: { speak: `${parts}. What number is that?` },
      explain: `${h ? `${h} hundreds = ${h * 100}, ` : ""}${t} tens = ${t * 10}, ${o} ones = ${o}. Put them together: ${n}.`,
      hint: `Write the ${h ? "hundreds, " : ""}tens and ones digits in order.`,
    };
  }
  if (variant === 3 && max <= 99) {
    const options: Option[] = [{ svg: baseTenSvg(0, t, o) }];
    const alts = [
      [o, t],
      [t, o + 1],
      [t + 1, o],
      [t, Math.max(0, o - 1)],
      [Math.max(0, t - 1), o],
    ].filter(([tt, oo]) => tt <= 9 && oo <= 9 && !(tt === t && oo === o));
    for (const [tt, oo] of alts) options.push({ svg: baseTenSvg(0, tt, oo) });
    return optionChoice(rng, options[0], options.slice(1), {
      prompt: `Which picture shows ${n}?`,
      display: { speak: `Which picture shows ${n}?` },
      explain: `${n} is ${parts}. Look for ${t} rods and ${o} little cubes.`,
      hint: `How many tens are in ${n}? Count the rods in each picture.`,
    });
  }
  if (h === 0) {
    const tens = int(rng, 1, 9);
    return {
      type: "numeric",
      prompt: `${tens * 10} ones is the same as how many tens?`,
      answer: tens,
      display: { svg: baseTenSvg(0, tens, 0), speak: `${tens * 10} ones is the same as how many tens?` },
      explain: `Every 10 ones can be bundled into 1 ten. ${tens * 10} ones make ${tens} tens.`,
      hint: "Bundle the ones into groups of ten. How many bundles?",
    };
  }
  const hundreds = int(rng, 1, 9);
  return {
    type: "numeric",
    prompt: `${hundreds * 10} tens is the same as how many hundreds?`,
    answer: hundreds,
    display: { svg: baseTenSvg(hundreds, 0, 0), speak: `${hundreds * 10} tens is the same as how many hundreds?` },
    explain: `10 tens make 1 hundred. ${hundreds * 10} tens make ${hundreds} hundreds (${hundreds * 100}).`,
    hint: "Bundle the tens into groups of ten. Each group is one hundred.",
  };
};

// ---------------------------------------------------------------------------
// expandedForm — 2.NBT.A.3 (numerals, number names, expanded form)
// ---------------------------------------------------------------------------

const expandedForm: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 999);
  const n = int(rng, 100, max);
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const expanded = [h * 100, t * 10, o].filter((x) => x > 0).map(String).join(" + ");
  const variant = int(rng, 0, 4);
  if (variant === 0 && t > 0 && o > 0) {
    const missing = pick(rng, ["h", "t", "o"]);
    const answer = missing === "h" ? h * 100 : missing === "t" ? t * 10 : o;
    const shown = [missing === "h" ? "___" : String(h * 100), missing === "t" ? "___" : String(t * 10), missing === "o" ? "___" : String(o)].join(" + ");
    return {
      type: "numeric",
      prompt: `${n} = ${shown}`,
      answer,
      display: { speak: `${n} equals ${shown.replace("___", "blank")}` },
      explain: `Expanded form shows the value of each digit: ${n} = ${expanded}. The missing part is the ${missing === "h" ? "hundreds" : missing === "t" ? "tens" : "ones"}: ${answer}.`,
      hint: `Which place is missing — hundreds, tens or ones? Look at that digit in ${n}.`,
    };
  }
  if (variant === 1) {
    return {
      type: "numeric",
      prompt: `${expanded} = ?`,
      answer: n,
      display: { speak: `${expanded.replace(/\+/g, "plus")} equals what?` },
      explain: `Add the place values: ${expanded} = ${n}. The hundreds digit is ${h}, the tens digit is ${t}, the ones digit is ${o}.`,
      hint: "Put the hundreds digit first, then the tens, then the ones.",
    };
  }
  if (variant === 2) {
    const wrong = [
      [h * 100, t, o],
      [h, t * 10, o],
      [h * 100, o * 10, t],
      [h * 10, t * 10, o],
    ].map((xs) => xs.filter((x) => x > 0).map(String).join(" + "));
    return labelChoice(rng, expanded, wrong, {
      prompt: `Which is the expanded form of ${n}?`,
      display: { speak: `Which is the expanded form of ${n}?` },
      explain: `${n} has ${h} hundreds (${h * 100}), ${t} tens (${t * 10}) and ${o} ones (${o}). So ${n} = ${expanded}.`,
      hint: "The tens digit is worth that many tens, so it needs a zero after it.",
    });
  }
  if (variant === 3) {
    const name = numberName(n);
    const wrongNums = [n + 10, n + 100, n - 1, h * 100 + o * 10 + t, Number(`${h}${o}${t}`)].filter((x) => x !== n && x > 0);
    return numericChoice(rng, n, wrongNums, {
      prompt: `Which number is "${name}"?`,
      display: { speak: `Which number is ${name}?` },
      explain: `"${name}" means ${expanded}, which is ${n}.`,
      hint: "Listen for the hundreds word first, then the tens word, then the ones.",
    });
  }
  const name = numberName(n);
  const wrongNames = [numberName(n + 10), numberName(n + 100), numberName(n - 1), numberName(h * 100 + o * 10 + t)].filter((x) => x !== name);
  return labelChoice(rng, name, wrongNames, {
    prompt: `How do you write ${n} in words?`,
    display: { speak: `How do you write ${n} in words?` },
    explain: `${n} = ${expanded}: ${name}.`,
    hint: "Say the hundreds digit with the word hundred, then say the two-digit number that is left.",
  });
};

// ---------------------------------------------------------------------------
// add2Digit / sub2Digit — 1.NBT.C.4, 1.NBT.C.6, 2.NBT.B.5, 2.NBT.B.6
// ---------------------------------------------------------------------------

function splitAddExplain(a: number, b: number): string {
  const at = Math.floor(a / 10) * 10;
  const ao = a % 10;
  const bt = Math.floor(b / 10) * 10;
  const bo = b % 10;
  const sum = a + b;
  if (bo === 0) return `Add the tens: ${a} + ${b} = ${sum}. Only the tens digit changes (${at / 10} tens + ${bt / 10} tens = ${(at + bt) / 10} tens).`;
  if (bt === 0) {
    if (ao + bo >= 10) return `${ao} + ${bo} = ${ao + bo}, which makes a new ten. ${at} + 10 + ${ao + bo - 10} = ${sum}. So ${a} + ${b} = ${sum}.`;
    return `Add the ones: ${ao} + ${bo} = ${ao + bo}. Keep the tens: ${at} + ${ao + bo} = ${sum}.`;
  }
  const tens = at + bt;
  const ones = ao + bo;
  return `Split into tens and ones. Tens: ${at} + ${bt} = ${tens}. Ones: ${ao} + ${bo} = ${ones}${ones >= 10 ? " (that is a new ten!)" : ""}. ${tens} + ${ones} = ${sum}.`;
}

const add2Digit: Generator = (ctx) => {
  const { rng } = ctx;
  const regroupParam = ctx.params?.regroup;
  const regroup = typeof regroupParam === "boolean" ? regroupParam : rng() < 0.5;
  const kind = strParam(ctx, "kind", "2d+2d"); // "2d+1d" | "2d+tens" | "2d+2d" | "mixed"
  const addends = numParam(ctx, "addends", 2);
  const max = numParam(ctx, "max", 100);
  if (addends > 2) {
    const nums: number[] = [];
    for (let i = 0; i < addends; i++) nums.push(int(rng, 11, 35));
    const total = nums.reduce((s, x) => s + x, 0);
    const tens = nums.map((x) => Math.floor(x / 10) * 10);
    const ones = nums.map((x) => x % 10);
    const tSum = tens.reduce((s, x) => s + x, 0);
    const oSum = ones.reduce((s, x) => s + x, 0);
    return {
      type: "numeric",
      prompt: `${nums.join(" + ")} = ?`,
      answer: total,
      display: { speak: `${nums.join(" plus ")} equals what?` },
      explain: `Add all the tens: ${tens.join(" + ")} = ${tSum}. Add all the ones: ${ones.join(" + ")} = ${oSum}. Then ${tSum} + ${oSum} = ${total}.`,
      hint: "Add up all the tens first, then all the ones, then put them together. Look for pairs of ones that make 10.",
    };
  }
  // Adding whole tens never makes a new ten, so a regrouping "mixed" item is
  // 2d+1d or 2d+2d (27 + 5, 36 + 27), never 2d+tens.
  const k = kind === "mixed" ? pick(rng, regroup ? ["2d+1d", "2d+2d"] : ["2d+1d", "2d+tens", "2d+2d"]) : kind;
  let a: number;
  let b: number;
  if (k === "2d+1d") {
    a = int(rng, 11, 89);
    // No-regroup items need room in the ones: 69 + 1 would make a new ten.
    if (!regroup && a % 10 === 9) a -= 1;
    // Regroup items need ones to build on: 40 + 9 cannot make a new ten.
    if (regroup && a % 10 === 0) a += int(rng, 1, 9);
    const ao = a % 10;
    b = regroup ? int(rng, 10 - ao, 9) : int(rng, 1, Math.max(1, 9 - ao));
    if (!regroup && ao + b >= 10) b = 9 - ao || 1;
  } else if (k === "2d+tens") {
    a = int(rng, 11, 59);
    b = 10 * int(rng, 1, Math.floor((max - 1 - a) / 10));
  } else {
    a = int(rng, 11, 78);
    // As above: with 0 ones, no second ones digit (1-9) can make a new ten.
    if (regroup && a % 10 === 0) a += int(rng, 1, 9);
    const ao = a % 10;
    const bo = regroup ? int(rng, 10 - ao, 9) : int(rng, 0, Math.max(0, 9 - ao));
    const maxTens = Math.floor((max - 1 - a - bo) / 10);
    b = 10 * int(rng, 1, Math.max(1, maxTens)) + bo;
    // Over max: take away tens, never ones (the ones decide the regrouping).
    while (a + b > max && b >= 20) b -= 10;
    while (a + b > max && a >= 20) a -= 10;
  }
  const sum = a + b;
  return {
    type: "numeric",
    prompt: `${a} + ${b} = ?`,
    answer: sum,
    display: { speak: `${a} plus ${b} equals what?` },
    explain: splitAddExplain(a, b),
    hint: k === "2d+tens" ? "Adding tens only changes the tens digit." : "Split the numbers into tens and ones. Add the tens, add the ones, then put them together.",
  };
};

const sub2Digit: Generator = (ctx) => {
  const { rng } = ctx;
  const regroupParam = ctx.params?.regroup;
  const regroup = typeof regroupParam === "boolean" ? regroupParam : rng() < 0.5;
  const tensOnly = boolParam(ctx, "tensOnly", false);
  if (tensOnly) {
    const a = 10 * int(rng, 3, 9);
    let b = 10 * int(rng, 1, a / 10 - 1);
    if (a - b === b) b = b >= 20 ? b - 10 : b + 10;
    return {
      type: "numeric",
      prompt: `${a} − ${b} = ?`,
      answer: a - b,
      display: { svg: baseTenSvg(0, a / 10, 0), speak: `${a} minus ${b} equals what?` },
      explain: `Think in tens: ${a / 10} tens − ${b / 10} tens = ${(a - b) / 10} tens. So ${a} − ${b} = ${a - b}.`,
      hint: `Count the rods: ${a / 10} tens take away ${b / 10} tens.`,
    };
  }
  // Regrouping needs a bigger ones digit below, so the top ones digit is 0-8
  // (int(rng, 10, 9) would hand back 9 or 10: "89 − 40").
  const a = regroup ? 10 * int(rng, 2, 9) + int(rng, 0, 8) : int(rng, 21, 99);
  const ao = a % 10;
  const bo = regroup ? int(rng, ao + 1, 9) : int(rng, 0, ao);
  const bt = int(rng, 1, Math.floor(a / 10) - (regroup ? 1 : 0));
  let b = Math.max(1, Math.min(a - 1, 10 * Math.max(0, bt) + bo));
  // Not a doubles fact (52 − 26 = 26). Keep the ones digit's relation to the
  // top's: regroup items move a ten (78 − 39 → 78 − 49, not the no-regroup
  // 78 − 38); no-regroup items with 0 ones move a ten too (60 − 30 → 60 − 20).
  if (a - b === b) b = regroup ? b + 10 : bo > 0 ? b - 1 : b - 10;
  const d = a - b;
  const bTens = Math.floor(b / 10) * 10;
  const bOnes = b % 10;
  const afterTens = a - bTens;
  const explain =
    bOnes === 0
      ? `Subtract the tens: ${a} − ${b} = ${d}. Only the tens digit changes.`
      : afterTens % 10 >= bOnes
        ? `Take away the tens first: ${a} − ${bTens} = ${afterTens}. Then the ones: ${afterTens} − ${bOnes} = ${d}.`
        : afterTens % 10 === 0
          ? `Take away the tens first: ${a} − ${bTens} = ${afterTens}. ${afterTens} is already a ten, so take the ones straight away: ${afterTens} − ${bOnes} = ${d} (count back ${bOnes}: ${seq(afterTens - 1, d)}). (In columns: regroup 1 ten as 10 ones.)`
          : `Take away the tens first: ${a} − ${bTens} = ${afterTens}. Then the ones in two steps: ${afterTens} − ${afterTens % 10} = ${afterTens - (afterTens % 10)}, then − ${bOnes - (afterTens % 10)} more = ${d}. (In columns: regroup 1 ten as 10 ones.)`;
  return {
    type: "numeric",
    prompt: `${a} − ${b} = ?`,
    answer: d,
    display: { speak: `${a} minus ${b} equals what?` },
    explain,
    hint: regroup ? "Take away the tens first, then take away the ones in two steps (down to the nearest ten, then the rest)." : "Take away the tens first, then the ones.",
  };
};

// ---------------------------------------------------------------------------
// add3Digit / sub3Digit — 2.NBT.B.7, 3.NBT.A.2
// ---------------------------------------------------------------------------

const add3Digit: Generator = (ctx) => {
  const { rng } = ctx;
  const regroupParam = ctx.params?.regroup;
  const regroup = typeof regroupParam === "boolean" ? regroupParam : rng() < 0.6;
  const max = numParam(ctx, "max", 999);
  let a = int(rng, 101, 699);
  let b = int(rng, 101, Math.max(102, max - a));
  if (!regroup) {
    const fix = (x: number, y: number) => {
      let out = 0;
      for (const p of [1, 10, 100]) {
        const dx = Math.floor(x / p) % 10;
        const dy = Math.floor(y / p) % 10;
        out += p * (dx + dy > 9 ? Math.max(0, 9 - dx) : dy);
      }
      return out;
    };
    b = fix(a, b) || 111;
  } else if (!((a % 10) + (b % 10) > 9 || (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) > 9)) {
    a = Math.floor(a / 10) * 10 + Math.max(a % 10, 10 - (b % 10));
    if (a + b > max) a -= 10;
  }
  const sum = a + b;
  return {
    type: "numeric",
    prompt: `${a} + ${b} = ?`,
    answer: sum,
    display: { speak: `${a} plus ${b} equals what?` },
    explain: columnAddExplain(a, b),
    hint: "Line up the ones, tens and hundreds. Add the ones first. If a column makes 10 or more, carry a ten to the next column.",
  };
};

const sub3Digit: Generator = (ctx) => {
  const { rng } = ctx;
  const regroupParam = ctx.params?.regroup;
  const regroup = typeof regroupParam === "boolean" ? regroupParam : rng() < 0.6;
  let a = int(rng, 201, 999);
  let b = int(rng, 101, a - 50);
  if (!regroup) {
    let out = 0;
    for (const p of [1, 10, 100]) {
      const da = Math.floor(a / p) % 10;
      const db = Math.floor(b / p) % 10;
      out += p * Math.min(da, db);
    }
    b = out;
    if (b === a || b === 0) b = Math.max(1, b - 1);
    if (b === a) a += 1;
  } else if ((a % 10) >= (b % 10) && (Math.floor(a / 10) % 10) >= (Math.floor(b / 10) % 10)) {
    b = Math.floor(b / 10) * 10 + Math.min(9, (a % 10) + 1);
    if (b >= a) b = a - 1;
  }
  if (a - b === b) b -= 1;
  const d = a - b;
  return {
    type: "numeric",
    prompt: `${a} − ${b} = ?`,
    answer: d,
    display: { speak: `${a} minus ${b} equals what?` },
    explain: columnSubExplain(a, b),
    hint: "Start with the ones. If the top digit is smaller, regroup: borrow 1 ten (or 1 hundred) from the next column.",
  };
};

// ---------------------------------------------------------------------------
// oddEven — 2.OA.C.3
// ---------------------------------------------------------------------------

const oddEven: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  const n = int(rng, 1, rng() < 0.7 ? max : max + 20);
  const even = n % 2 === 0;
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    const options = shuffle(rng, ["odd", "even"]);
    const emoji = pick(rng, EMOJI_SETS);
    const shown = n <= 20 ? Array.from({ length: Math.ceil(n / 2) }, (_, i) => emoji.repeat(Math.min(2, n - 2 * i))).join(" ") : undefined;
    return {
      type: "choice",
      prompt: `Is ${n} odd or even?`,
      display: { emoji: shown, speak: `Is ${n} odd or even?` },
      options: options.map((o) => ({ label: o })),
      answerIndex: options.indexOf(even ? "even" : "odd"),
      explain: even
        ? `${n} can be split into pairs with none left over (${n / 2} pairs), so it is even. Even numbers end in 0, 2, 4, 6 or 8.`
        : `${n} makes ${Math.floor(n / 2)} pairs with 1 left over, so it is odd. Odd numbers end in 1, 3, 5, 7 or 9.`,
      hint: "Make pairs. Is there one left over? Also check the last digit.",
    };
  }
  if (variant === 1) {
    const wantEven = rng() < 0.5;
    const set = new Set<number>();
    const answer = wantEven ? 2 * int(rng, 1, 15) : 2 * int(rng, 0, 14) + 1;
    while (set.size < 3) {
      const d = wantEven ? 2 * int(rng, 0, 14) + 1 : 2 * int(rng, 1, 15);
      set.add(d);
    }
    return numericChoice(rng, answer, [...set], {
      prompt: `Which number is ${wantEven ? "even" : "odd"}?`,
      display: { speak: `Which number is ${wantEven ? "even" : "odd"}?` },
      explain: `${answer} ends in ${answer % 10}, so it is ${wantEven ? "even — it splits into equal pairs" : "odd — one is left over after pairing"}. The others are ${wantEven ? "odd" : "even"}.`,
      hint: `Look at the last digit. ${wantEven ? "Even numbers end in 0, 2, 4, 6 or 8." : "Odd numbers end in 1, 3, 5, 7 or 9."}`,
    });
  }
  if (variant === 2) {
    const e = 2 * int(rng, 2, 10);
    return {
      type: "numeric",
      prompt: `${e} = ___ + ___  (two equal numbers). What is each number?`,
      answer: e / 2,
      display: { speak: `${e} is the sum of two equal numbers. What is each number?` },
      explain: `An even number is a double: ${e} = ${e / 2} + ${e / 2}. Half of ${e} is ${e / 2}.`,
      hint: `Share ${e} into two equal groups. Which double makes ${e}?`,
    };
  }
  const pairs = Math.floor(n / 2);
  return {
    type: "numeric",
    prompt: `${n} ${pick(rng, ["dancers", "ponies", "soccer players", "cheerleaders"])} line up in pairs. How many are left without a partner?`,
    answer: n % 2,
    display: { speak: `${n} line up in pairs. How many are left without a partner?` },
    explain: `${n} makes ${pairs} pairs${n % 2 ? " with 1 left over, so " + n + " is odd" : " exactly, so " + n + " is even"}. Left over: ${n % 2}.`,
    hint: "Count by 2s. Do you land exactly on the number, or is there one extra?",
  };
};

// ---------------------------------------------------------------------------
// arraysRepeatedAddition — 2.OA.C.4 (arrays), 2.G.A.2 (rows/columns of squares)
// ---------------------------------------------------------------------------

const arraysRepeatedAddition: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "array");
  const maxSide = numParam(ctx, "max", 5);
  const rows = int(rng, 2, maxSide);
  const cols = int(rng, 2, maxSide);
  const total = rows * cols;
  const rowSum = Array.from({ length: rows }, () => String(cols)).join(" + ");
  if (mode === "grid") {
    const variant = rng();
    if (variant < 0.6) {
      return {
        type: "numeric",
        prompt: "The rectangle is cut into equal squares. How many squares are there?",
        answer: total,
        display: { svg: gridSvg(rows, cols, 0), speak: "The rectangle is cut into equal squares. How many squares?" },
        explain: `There are ${rows} rows with ${cols} squares in each row. Count by rows: ${rowSum} = ${total}.`,
        hint: "Count one row. Then count that many for each row.",
      };
    }
    const askRows = rng() < 0.5;
    return {
      type: "numeric",
      prompt: `How many ${askRows ? "rows" : "columns"} of squares are there?`,
      answer: askRows ? rows : cols,
      display: { svg: gridSvg(rows, cols, 0), speak: `How many ${askRows ? "rows" : "columns"} of squares?` },
      explain: `Rows go across, columns go up and down. This rectangle has ${rows} rows and ${cols} columns, ${total} squares in all.`,
      hint: askRows ? "Rows go across, like rows of seats. Count them from top to bottom." : "Columns stand up like pillars. Count them from left to right.",
    };
  }
  const variant = rng();
  if (variant < 0.45) {
    return {
      type: "numeric",
      prompt: "How many dots are in the array?",
      answer: total,
      display: { svg: arraySvg(rows, cols), speak: "How many dots are in the array?" },
      explain: `${rows} rows of ${cols}: ${rowSum} = ${total}.`,
      hint: "Count one row, then add that number once for every row.",
    };
  }
  if (variant < 0.8) {
    const answer = `${rowSum} = ${total}`;
    const colSum = Array.from({ length: cols }, () => String(rows)).join(" + ");
    const wrong = [`${Array.from({ length: rows }, () => String(rows)).join(" + ")} = ${rows * rows}`, `${rows} + ${cols} = ${rows + cols}`, `${colSum} + ${rows} = ${rows * cols + rows}`, `${Array.from({ length: rows + 1 }, () => String(cols)).join(" + ")} = ${(rows + 1) * cols}`];
    return labelChoice(rng, answer, wrong, {
      prompt: `The array has ${rows} rows of ${cols}. Which addition sentence shows the rows?`,
      display: { svg: arraySvg(rows, cols), speak: `The array has ${rows} rows of ${cols}. Which addition sentence shows the rows?` },
      explain: `Each row has ${cols} dots, and there are ${rows} rows. So we add ${cols} ${rows} times: ${answer}.`,
      hint: `Add the number in one row, ${rows} times.`,
    });
  }
  return {
    type: "numeric",
    prompt: `${pick(rng, KID_NAMES)} lines up ${pick(rng, ["ponies", "cupcakes", "soccer balls", "baseball cards"])} in ${rows} rows with ${cols} in each row. How many in all?`,
    answer: total,
    display: { svg: arraySvg(rows, cols, COLORS.amber), speak: `${rows} rows with ${cols} in each row. How many in all?` },
    explain: `Number sentence: ${rowSum} = ${total}. (That is the same as ${rows} × ${cols}.)`,
    hint: `Draw ${rows} rows of ${cols} dots, then count by ${cols}s.`,
  };
};

// ---------------------------------------------------------------------------
// equalGroupsIntro — 3.OA.A.1 bridge (groups of), level 3 = interpret products
// ---------------------------------------------------------------------------

const equalGroupsIntro: Generator = (ctx) => {
  const { rng } = ctx;
  const level = levelOf(ctx);
  const groups = int(rng, 2, level >= 3 ? 9 : 5);
  const size = int(rng, 2, level >= 3 ? 9 : 5);
  const emoji = pick(rng, EMOJI_SETS);
  const total = groups * size;
  const shown = Array.from({ length: groups }, () => emoji.repeat(size)).join("   ");
  const variant = int(rng, 0, 3);
  if (variant === 0 && total <= 45) {
    return {
      type: "numeric",
      prompt: `${groups} groups of ${size}. How many ${emoji} in all?`,
      answer: total,
      display: { emoji: shown, speak: `${groups} groups of ${size}. How many in all?` },
      explain: `${groups} groups of ${size} means ${Array.from({ length: groups }, () => String(size)).join(" + ")} = ${total}. We write it as ${groups} × ${size} = ${total}.`,
      hint: `Count by ${size}s, once for each group.`,
    };
  }
  if (variant === 1) {
    const answer = `${groups} × ${size}`;
    return labelChoice(rng, answer, [`${groups} + ${size}`, `${size} × ${size}`, `${groups} × ${groups}`, `${groups} − ${size}`], {
      prompt: `Which multiplication means "${groups} groups of ${size}"?`,
      display: { emoji: total <= 45 ? shown : emoji, speak: `Which multiplication means ${groups} groups of ${size}?` },
      explain: `${groups} × ${size} is read "${groups} groups of ${size}" — the first number tells how many groups, the second how many in each group. ${groups} × ${size} = ${total}.`,
      hint: "The first number is how many groups. The second number is how many in each group.",
    });
  }
  if (variant === 2) {
    return {
      type: "numeric",
      prompt: `${groups} × ${size} means ${groups} groups of ___. What goes in the blank?`,
      answer: size,
      display: { speak: `${groups} times ${size} means ${groups} groups of what?` },
      explain: `In ${groups} × ${size}, the ${groups} is the number of groups and the ${size} is how many in each group. ${groups} × ${size} = ${total}.`,
      hint: "Groups of what size? Look at the second number.",
    };
  }
  const name = pick(rng, KID_NAMES);
  const thing = pick(rng, [
    ["teams", "players on each team"],
    ["bags", "apples in each bag"],
    ["rows", "dancers in each row"],
    ["boxes", "baseballs in each box"],
  ]);
  return {
    type: "numeric",
    prompt: `${name} makes ${groups} ${thing[0]} with ${size} ${thing[1]}. How many in all?`,
    answer: total,
    display: { speak: `${name} makes ${groups} ${thing[0]} with ${size} ${thing[1]}. How many in all?` },
    explain: `Equal groups: ${groups} × ${size} = ${total}. (${Array.from({ length: Math.min(groups, 5) }, () => String(size)).join(" + ")}${groups > 5 ? " + …" : ""} = ${total}.)`,
    hint: `${groups} equal groups of ${size}: skip count by ${size}.`,
  };
};

// ---------------------------------------------------------------------------
// timeHourHalf — 1.M.B.3 ; timeFiveMinutes — 2.M.C.7
// ---------------------------------------------------------------------------

function timeWords(h: number, m: number): string {
  if (m === 0) return `${h} o'clock`;
  if (m === 30) return `half past ${h}`;
  if (m === 15) return `quarter past ${h}`;
  if (m === 45) return `quarter to ${h === 12 ? 1 : h + 1}`;
  return `${m} minutes past ${h}`;
}

/** Where the hour hand sits at h:m, in kid words (it moves between h and h + 1 all hour). */
function hourHandWords(h: number, m: number): string {
  const next = (h % 12) + 1;
  if (m === 0) return `points right at ${h}`;
  if (m <= 15) return `is just past ${h}`;
  if (m < 30) return `is between ${h} and ${next}, not yet halfway`;
  if (m === 30) return `is halfway between ${h} and ${next}`;
  return `is most of the way from ${h} to ${next} — it has not reached ${next} yet, so the hour is still ${h}`;
}

function clockQuestion(rng: () => number, h: number, m: number, allMinutes: number[]): Question {
  const answer = timeStr(h, m);
  const wrongs = [
    timeStr(m === 0 ? (h % 12) + 1 : h, m === 0 ? 0 : 0),
    timeStr(h, allMinutes[(allMinutes.indexOf(m) + 1) % allMinutes.length]),
    timeStr((h % 12) + 1, m),
    timeStr(m === 0 ? h : (h % 12) + 1, m === 30 ? 0 : 30),
    timeStr(m === 0 || m === 30 ? (h + 5) % 12 || 12 : h, m === 30 ? 30 : 0),
    timeStr(m / 5 || 12, h * 5 === 60 ? 0 : h * 5),
  ].filter((w) => w !== answer);
  return labelChoice(rng, answer, wrongs, {
    prompt: "What time does the clock show?",
    display: { svg: clockSvg(h, m), speak: "What time does the clock show?" },
    explain: `The short hand points ${m === 0 ? `right at ${h}` : `between ${h} and ${(h % 12) + 1} — the hour is ${h}`}. The long hand ${m === 0 ? "points straight up to 12: 0 minutes" : `points to ${m / 5}: count by 5s, ${m} minutes`}. The time is ${answer} (${timeWords(h, m)}).`,
    hint: "The short hand tells the hour (the number it has passed). The long hand tells the minutes — count by 5s from the 12.",
  });
}

const timeHourHalf: Generator = (ctx) => {
  const { rng } = ctx;
  const h = int(rng, 1, 12);
  const m = rng() < 0.5 ? 0 : 30;
  const variant = int(rng, 0, 2);
  if (variant === 0) return clockQuestion(rng, h, m, [0, 30]);
  if (variant === 1) {
    const answer: Option = { svg: clockSvg(h, m) };
    const others: Option[] = [{ svg: clockSvg(h, m === 0 ? 30 : 0) }, { svg: clockSvg((h % 12) + 1, m) }, { svg: clockSvg(m === 0 ? (h + 5) % 12 || 12 : (h + 6) % 12 || 12, m) }];
    return optionChoice(rng, answer, others, {
      prompt: `Which clock shows ${timeStr(h, m)}?`,
      display: { speak: `Which clock shows ${timeWords(h, m)}?` },
      explain: `${timeStr(h, m)} is ${timeWords(h, m)}: the short hand ${m === 0 ? `points to ${h}` : `is halfway between ${h} and ${(h % 12) + 1}`} and the long hand points to ${m === 0 ? "12" : "6"}.`,
      hint: m === 0 ? "On the hour, the long hand points straight up to 12." : "At half past, the long hand points straight down to 6 and the short hand is halfway between two numbers.",
    });
  }
  const words = timeWords(h, m);
  const answer = timeStr(h, m);
  return labelChoice(rng, answer, [timeStr(h, m === 0 ? 30 : 0), timeStr((h % 12) + 1, m), timeStr(h === 1 ? 12 : h - 1, m)], {
    prompt: `Which digital time is "${words}"?`,
    display: { speak: `Which digital time is ${words}?` },
    explain: `"${words}" means ${answer}. ${m === 30 ? "Half past means 30 minutes after the hour." : "O'clock means exactly on the hour: 00 minutes."}`,
    hint: m === 30 ? "Half past an hour is that hour and 30 minutes." : "O'clock means zero minutes.",
  });
};

const timeFiveMinutes: Generator = (ctx) => {
  const { rng } = ctx;
  const h = int(rng, 1, 12);
  const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const m = pick(rng, mins);
  const variant = int(rng, 0, 3);
  if (variant === 0) return clockQuestion(rng, h, m, mins);
  if (variant === 1) {
    const answer: Option = { svg: clockSvg(h, m) };
    const others: Option[] = [{ svg: clockSvg(h, (m + 5) % 60) }, { svg: clockSvg((h % 12) + 1, m) }, { svg: clockSvg(m / 5 || 12, (h * 5) % 60) }];
    return optionChoice(rng, answer, others, {
      prompt: `Which clock shows ${timeStr(h, m)}?`,
      display: { speak: `Which clock shows ${timeStr(h, m)}?` },
      explain: `For ${timeStr(h, m)}: the long hand points to ${m / 5 || 12} (${m} minutes = count by 5s), and the short hand ${hourHandWords(h, m)}.`,
      hint: "Minutes: count by 5s around the clock. The long hand should point at the right number.",
    });
  }
  if (variant === 2) {
    return {
      type: "numeric",
      prompt: "How many minutes past the hour does the clock show?",
      answer: m,
      display: { svg: clockSvg(h, m), speak: "How many minutes past the hour does the clock show?" },
      explain: `The long hand points to ${m / 5 || 12}. Count by 5s from the 12: ${m === 0 ? "it is right on the 12, so 0 minutes" : Array.from({ length: m / 5 }, (_, i) => String(5 * (i + 1))).join(", ")}. That is ${m} minutes.`,
      hint: "Each number on the clock is 5 minutes. Count by 5s from the 12 to the long hand.",
    };
  }
  const events: [string, number, "a.m." | "p.m."][] = [
    ["eats breakfast", 7, "a.m."],
    ["goes to school", 8, "a.m."],
    ["has lunch", 12, "p.m."],
    ["goes to ballet", 4, "p.m."],
    ["has soccer practice", 5, "p.m."],
    ["eats dinner", 6, "p.m."],
    ["goes to bed", 8, "p.m."],
    ["wakes up", 6, "a.m."],
  ];
  const [what, eh, ampm] = pick(rng, events);
  const name = pick(rng, KID_NAMES);
  const options = shuffle(rng, ["a.m.", "p.m."]);
  return {
    type: "choice",
    prompt: `${name} ${what} at ${timeStr(eh, m)}. Is that a.m. or p.m.?`,
    display: { speak: `${name} ${what} at ${timeStr(eh, m)}. Is that a.m. or p.m.?` },
    options: options.map((o) => ({ label: o })),
    answerIndex: options.indexOf(ampm),
    explain: `a.m. is from midnight to noon (morning). p.m. is from noon to midnight (afternoon, evening, night). Someone ${what} in the ${ampm === "a.m." ? "morning" : "afternoon or evening"}, so it is ${ampm}.`,
    hint: "a.m. = morning, before noon. p.m. = after noon. When does this usually happen?",
  };
};

// ---------------------------------------------------------------------------
// coinsValue — 1.M.C.4, 1.M.C.5, 2.M.C.8
// ---------------------------------------------------------------------------

interface Coin {
  name: string;
  plural: string;
  value: number;
  r: number;
  fill: string;
}

/**
 * Radii keep the real size order (dime < penny < nickel < quarter) and are big
 * enough for the bold 4.2-unit name to sit inside the coin, descenders and
 * all (about 0.62 em per letter: "penny" is 13 units wide in a 16-unit coin).
 * Coins sit 24 units apart, so r ≤ 11 keeps neighbours from touching. The
 * label is the coin's name, not its value: "How many cents is a nickel worth?"
 * shows the coin, so a "5¢" label would give the answer away.
 */
const COINS: Coin[] = [
  { name: "penny", plural: "pennies", value: 1, r: 8, fill: "#d97706" },
  { name: "nickel", plural: "nickels", value: 5, r: 9.5, fill: "#9ca3af" },
  { name: "dime", plural: "dimes", value: 10, r: 7, fill: "#cbd5e1" },
  { name: "quarter", plural: "quarters", value: 25, r: 11, fill: "#94a3b8" },
];

/** COINS indexes from the biggest value down: count on from quarters, then dimes, nickels, pennies. */
const COIN_ORDER = [3, 2, 1, 0];

function coinTotal(counts: number[]): number {
  return counts.reduce((s, c, i) => s + c * COINS[i].value, 0);
}

function coinsSvg(counts: number[]): string {
  const items: Coin[] = [];
  for (const i of COIN_ORDER) for (let k = 0; k < (counts[i] ?? 0); k++) items.push(COINS[i]);
  const out: string[] = [];
  const perRow = 4;
  items.forEach((coin, idx) => {
    const x = 14 + (idx % perRow) * 24;
    const y = 14 + Math.floor(idx / perRow) * 24;
    out.push(`<circle cx="${x}" cy="${y}" r="${coin.r}" fill="${coin.fill}" stroke="#475569" stroke-width="1"/>`);
    // Baseline 1.5 below the centre: the letters (x-height plus p/y tails) straddle the middle.
    out.push(svgText(x, y + 1.5, coin.name, 4.2, 'fill="#1f2937" font-weight="700"'));
  });
  return svgWrap(out.join(""));
}

function coinsWords(counts: number[]): string {
  const parts = COIN_ORDER.filter((i) => counts[i] > 0).map((i) => `${counts[i]} ${counts[i] === 1 ? COINS[i].name : COINS[i].plural}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

/** "2 × 25¢ = 50¢, 1 × 10¢ = 10¢, …" — biggest coins first. */
function centsSum(counts: number[]): string {
  return COIN_ORDER.filter((i) => counts[i] > 0)
    .map((i) => `${counts[i]} × ${COINS[i].value}¢ = ${counts[i] * COINS[i].value}¢`)
    .join(", ");
}

/** The count-on the intro teaches: "25, 50, 60, 61, 62". */
function coinsCountOn(counts: number[]): string {
  const run: number[] = [];
  let t = 0;
  for (const i of COIN_ORDER) {
    for (let k = 0; k < counts[i]; k++) {
      t += COINS[i].value;
      run.push(t);
    }
  }
  return run.join(", ");
}

/** "1 ten + 1 five + 2 ones" (zero terms dropped, plurals right). */
function billsLabel(tens: number, fives: number, ones: number): string {
  return [tens ? plural(tens, "ten") : "", fives ? plural(fives, "five") : "", ones ? plural(ones, "one") : ""].filter(Boolean).join(" + ");
}

const coinsValue: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "count");
  const max = numParam(ctx, "max", 99);
  if (mode === "identify") {
    const coin = pick(rng, COINS);
    const variant = int(rng, 0, 2);
    if (variant === 0) {
      return {
        type: "numeric",
        prompt: `How many cents is a ${coin.name} worth?`,
        answer: coin.value,
        display: { svg: coinsSvg(COINS.map((c) => (c === coin ? 1 : 0))), speak: `How many cents is a ${coin.name} worth?` },
        explain: `A ${coin.name} is worth ${coin.value}¢. Penny 1¢, nickel 5¢, dime 10¢, quarter 25¢. Remember: the dime is the smallest coin but it is worth more than a nickel.`,
        hint: "Say the coins in order from smallest value to biggest: penny, nickel, dime, quarter. Which value goes with this one?",
      };
    }
    if (variant === 1) {
      return labelChoice(rng, coin.name, COINS.filter((c) => c !== coin).map((c) => c.name), {
        prompt: `Which coin is worth ${coin.value}¢?`,
        display: { speak: `Which coin is worth ${coin.value} cents?` },
        explain: `${coin.value}¢ is a ${coin.name}. Penny 1¢, nickel 5¢, dime 10¢, quarter 25¢.`,
        hint: "Say the coins in order of value: penny, nickel, dime, quarter.",
      });
    }
    const other = pick(rng, COINS.filter((c) => c !== coin));
    const bigger = coin.value > other.value ? coin : other;
    return labelChoice(rng, bigger.name, [bigger === coin ? other.name : coin.name, "they are worth the same", "neither one"], {
      prompt: `Which is worth more: a ${coin.name} or a ${other.name}?`,
      display: { svg: coinsSvg(COINS.map((c) => (c === coin || c === other ? 1 : 0))), speak: `Which is worth more, a ${coin.name} or a ${other.name}?` },
      explain: `A ${coin.name} is ${coin.value}¢ and a ${other.name} is ${other.value}¢. ${bigger.value}¢ is more, so the ${bigger.name} is worth more — even if it is the smaller coin.`,
      hint: "Size does not tell value. Think of each coin's number of cents.",
    });
  }
  if (mode === "dollars") {
    const bills = [1, 5, 10, 20];
    const variant = int(rng, 0, 2);
    if (variant === 0) {
      const fives = int(rng, 0, 3);
      const ones = int(rng, 1, 4);
      const tens = fives + ones > 2 ? 0 : int(rng, 0, 1);
      const total = 10 * tens + 5 * fives + ones;
      const words = [tens ? `${tens} ten-dollar bill` : "", fives ? `${fives} five-dollar bill${fives > 1 ? "s" : ""}` : "", `${ones} one-dollar bill${ones > 1 ? "s" : ""}`].filter(Boolean).join(" and ");
      return {
        type: "numeric",
        prompt: `${pick(rng, KID_NAMES)} has ${words}. How many dollars is that?`,
        answer: total,
        display: { speak: `${words}. How many dollars is that?` },
        explain: `Count the biggest bills first: ${tens ? `$10, ` : ""}${fives ? `${fives} fives = $${5 * fives}, ` : ""}${ones} ones = $${ones}. Total $${total}.`,
        hint: "Count the tens, then the fives (5, 10, 15 …), then count on by ones.",
      };
    }
    if (variant === 1) {
      // $6-$19 from $10, $5 and $1 bills ($20 itself would just be one $20 bill).
      const amt = int(rng, 6, 19);
      const tens = Math.floor(amt / 10);
      const fives = Math.floor((amt % 10) / 5);
      const ones = amt % 5;
      const answer = billsLabel(tens, fives, ones);
      // Same amount with more bills first (the real "fewest" test), then wrong totals.
      const cands: [number, number, number][] = [
        [tens - 1, fives + 2, ones],
        [tens, fives - 1, ones + 5],
        [0, 0, amt],
        [tens, fives, ones + 1],
        [tens + 1, fives, ones],
        [tens, fives + 1, ones],
      ];
      const wrong = cands.filter(([t, f, o]) => t >= 0 && f >= 0 && o >= 0 && t + f + o > 0).map(([t, f, o]) => billsLabel(t, f, o));
      const bills = [...Array.from({ length: tens }, () => "$10"), ...Array.from({ length: fives }, () => "$5"), ...Array.from({ length: ones }, () => "$1")];
      return labelChoice(rng, answer, wrong, {
        prompt: `Which bills make exactly $${amt} with the fewest bills?`,
        display: { speak: `Which bills make exactly ${amt} dollars with the fewest bills?` },
        explain: `Use the biggest bill that fits first, then the next biggest: ${bills.join(" + ")} = $${amt}. That is ${plural(bills.length, "bill")}; every other way to make $${amt} needs more bills.`,
        hint: "Start with the biggest bill that fits, then fill in with smaller bills. Check the total too.",
      });
    }
    const a = pick(rng, bills.filter((x) => x < 20));
    const b = pick(rng, bills.filter((x) => x + a <= 20));
    return {
      type: "numeric",
      prompt: `$${a} + $${b} = $?`,
      answer: a + b,
      display: { speak: `${a} dollars plus ${b} dollars is how many dollars?` },
      explain: `Add dollars like any numbers: ${a} + ${b} = ${a + b}. We write it $${a + b}.`,
      hint: "Add the two numbers. Keep the dollar sign.",
    };
  }
  if (mode === "problem") {
    const counts = [int(rng, 0, 4), int(rng, 0, 2), int(rng, 0, 3), int(rng, 1, 3)];
    const total = coinTotal(counts);
    const variant = int(rng, 0, 2);
    const name = pick(rng, KID_NAMES);
    if (variant === 0) {
      let price = int(rng, 10, Math.max(11, total - 5));
      if (total - price === price) price += 1;
      return {
        type: "numeric",
        prompt: `${name} has ${coinsWords(counts)}. ${name} buys a sticker for ${price}¢. How many cents are left?`,
        answer: total - price,
        display: { svg: coinsSvg(counts), speak: `${name} has ${coinsWords(counts)} and buys a sticker for ${price} cents. How many cents are left?` },
        explain: `First count the coins: ${centsSum(counts)}; total ${total}¢. Then subtract: ${total} − ${price} = ${total - price}¢.`,
        hint: "Two steps: count all the coins first (quarters, then dimes, nickels, pennies). Then take away the price.",
      };
    }
    if (variant === 1) {
      const dollars = int(rng, 1, 3);
      // The cents after the point must be 0-99: drop the smallest coins until they fit
      // (otherwise "1 dollar and 108¢" would need a carry, not a notation lesson).
      const cc = counts.slice();
      let cents = total;
      while (cents > 99) {
        cc[cc.findIndex((c) => c > 0)] -= 1;
        cents = coinTotal(cc);
      }
      const two = (c: number) => String(c).padStart(2, "0");
      const answer = `$${dollars}.${two(cents)}`;
      return labelChoice(rng, answer, [`$${cents}.${dollars}`, `$${dollars}${cents}`, `${dollars}¢ and $${cents}`, `$${dollars}.${two((cents + 10) % 100)}`], {
        prompt: `${name} has ${dollars} dollar${dollars > 1 ? "s" : ""} and ${cents}¢. How do we write that with a dollar sign?`,
        display: { speak: `${name} has ${dollars} dollar${dollars > 1 ? "s" : ""} and ${cents} cents. How do we write that with a dollar sign?` },
        explain: `Dollars go before the point, cents after it (always two digits): ${answer}.`,
        hint: "Dollars, then a point, then the cents as two digits.",
      });
    }
    const other = pick(rng, KID_NAMES.filter((k) => k !== name));
    const c2 = [int(rng, 0, 4), int(rng, 0, 2), int(rng, 0, 3), int(rng, 0, 2)];
    const t2 = c2.reduce((s, c, i) => s + c * COINS[i].value, 0) || 7;
    return {
      type: "numeric",
      prompt: `${name} has ${coinsWords(counts)}. ${other} has ${t2}¢. How many cents do they have together?`,
      answer: total + t2,
      display: { svg: coinsSvg(counts), speak: `${name} has ${coinsWords(counts)}. ${other} has ${t2} cents. How many cents together?` },
      explain: `${name}: ${centsSum(counts)} → ${total}¢. Together: ${total} + ${t2} = ${total + t2}¢.`,
      hint: "Count the coins first, then add the other amount.",
    };
  }
  // count mode
  const counts = [int(rng, 0, 4), int(rng, 0, 2), int(rng, 0, 3), int(rng, 0, 3)];
  if (counts.reduce((s, c) => s + c, 0) === 0) counts[2] = 2;
  let total = counts.reduce((s, c, i) => s + c * COINS[i].value, 0);
  while (total > max) {
    const i = counts.findIndex((c) => c > 0);
    counts[i] -= 1;
    total = counts.reduce((s, c, k) => s + c * COINS[k].value, 0);
    if (total === 0) {
      counts[0] = 3;
      total = 3;
    }
  }
  if (rng() < 0.75) {
    return {
      type: "numeric",
      prompt: `How many cents: ${coinsWords(counts)}?`,
      answer: total,
      display: { svg: coinsSvg(counts), speak: `How many cents is ${coinsWords(counts)}?` },
      explain: `Start with the biggest coins and count on: ${coinsCountOn(counts)}. (${centsSum(counts)}.) That is ${total}¢.`,
      hint: "Count the quarters first, then the dimes, then nickels, then pennies. Count on from the biggest coins.",
    };
  }
  const answer = `${total}¢`;
  return labelChoice(rng, answer, [`$${total}`, `${total + 5}¢`, `${total - 1 > 0 ? total - 1 : total + 1}¢`, `$${total}.00`], {
    prompt: `${coinsWords(counts)} — which shows the amount correctly?`,
    display: { svg: coinsSvg(counts), speak: `${coinsWords(counts)}. Which shows the amount correctly?` },
    explain: `${centsSum(counts)} → ${total} cents. Cents are written with the ¢ sign: ${answer}. ($${total} would be ${total} dollars — much more!)`,
    hint: "Count the cents, then use the cents sign. A dollar sign would mean whole dollars.",
  });
};

// ---------------------------------------------------------------------------
// lengthCompare — 1.M.A.1 ; lengthMeasureUnits — 1.M.A.2, 2.M.A.1
// ---------------------------------------------------------------------------

const OBJECTS = ["ribbon", "crayon", "pencil", "straw", "carrot", "feather", "shoelace", "spoon"];
const BAR_COLORS = [COLORS.blue, COLORS.amber, COLORS.green, COLORS.rose];

function barsSvg(lengths: number[], labels: string[], unit = 0): string {
  const out: string[] = [];
  const maxLen = Math.max(...lengths);
  const x0 = 8;
  const scale = 84 / maxLen;
  lengths.forEach((len, i) => {
    const y = 18 + i * (lengths.length > 2 ? 24 : 30);
    // Label above its bar (left-aligned with the common start line), clear of the unit ticks.
    out.push(svgText(x0, y - 8, labels[i], 6, 'text-anchor="start" font-weight="700"'));
    out.push(`<rect x="${x0}" y="${y - 4}" width="${r1(len * scale)}" height="9" rx="2" fill="${BAR_COLORS[i % BAR_COLORS.length]}"/>`);
    if (unit > 0) {
      for (let k = 0; k <= maxLen; k++) {
        out.push(`<line x1="${r1(x0 + k * scale)}" y1="${y - 6}" x2="${r1(x0 + k * scale)}" y2="${y + 7}" stroke="#475569" stroke-width="0.6"/>`);
      }
    }
  });
  return svgWrap(out.join(""));
}

const lengthCompare: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "compare");
  const names = sample(rng, OBJECTS, 3);
  if (mode === "difference") {
    const a = int(rng, 4, 20);
    let b = int(rng, 2, a - 1);
    if (a - b === b) b -= 1;
    const unit = pick(rng, ["cm", "inches"]);
    return {
      type: "numeric",
      prompt: `The ${names[0]} is ${a} ${unit} long. The ${names[1]} is ${b} ${unit} long. How much longer is the ${names[0]}?`,
      answer: a - b,
      display: { svg: barsSvg([a, b], [names[0], names[1]], 1), speak: `The ${names[0]} is ${a} ${unit} long. The ${names[1]} is ${b} ${unit}. How much longer is the ${names[0]}?` },
      explain: `"How much longer" means find the difference: ${a} − ${b} = ${a - b} ${unit}. On the picture, count the extra units sticking out past the shorter bar.`,
      hint: "Line them up at the same start. Subtract the shorter length from the longer one.",
    };
  }
  const variant = int(rng, 0, 3);
  if (variant === 3) {
    const [x, y, z] = names;
    const longest = rng() < 0.5;
    return labelChoice(rng, longest ? x : z, [longest ? z : x, y, "you cannot tell"], {
      prompt: `The ${x} is longer than the ${y}. The ${y} is longer than the ${z}. Which is the ${longest ? "longest" : "shortest"}?`,
      display: { speak: `The ${x} is longer than the ${y}. The ${y} is longer than the ${z}. Which is the ${longest ? "longest" : "shortest"}?` },
      explain: `Put them in order: ${x} > ${y} > ${z}. The ${x} is the longest and the ${z} is the shortest. We compared the ${x} and the ${z} using the ${y} in between.`,
      hint: "Line them up in your head from longest to shortest, using the middle one as the helper.",
    });
  }
  const set = new Set<number>();
  while (set.size < 3) set.add(int(rng, 3, 12));
  const lens = shuffle(rng, [...set]);
  const sorted = [...lens].sort((p, q) => p - q);
  if (variant === 0 || variant === 1) {
    const wantLongest = variant === 0;
    const target = wantLongest ? Math.max(...lens) : Math.min(...lens);
    const answer = names[lens.indexOf(target)];
    return labelChoice(rng, answer, names.filter((n) => n !== answer), {
      prompt: `Which is the ${wantLongest ? "longest" : "shortest"}?`,
      display: { svg: barsSvg(lens, names), speak: `Which is the ${wantLongest ? "longest" : "shortest"}?` },
      explain: `All three start at the same line, so compare where they end. The ${answer} is the ${wantLongest ? "longest" : "shortest"}.`,
      hint: "They all start at the same place on the left. Look at which one reaches farthest (or least far) to the right.",
    });
  }
  const order = sorted.map((l) => names[lens.indexOf(l)]);
  const answer = order.join(", ");
  const wrong = [
    [...order].reverse().join(", "),
    [order[1], order[0], order[2]].join(", "),
    [order[0], order[2], order[1]].join(", "),
  ];
  return labelChoice(rng, answer, wrong, {
    prompt: "Put them in order from shortest to longest.",
    display: { svg: barsSvg(lens, names), speak: "Put them in order from shortest to longest." },
    explain: `Shortest first: ${answer}. Compare the right ends since they all start together.`,
    hint: "Find the shortest first. Then the next shortest. The longest goes last.",
  });
};

function rulerSvg(startCm: number, endCm: number, label: string): string {
  const out: string[] = [];
  const x = (cm: number) => 6 + cm * 8.8;
  out.push(`<rect x="4" y="52" width="92" height="22" fill="#fef3c7" stroke="#92400e" stroke-width="1"/>`);
  for (let cm = 0; cm <= 10; cm++) {
    out.push(`<line x1="${r1(x(cm))}" y1="52" x2="${r1(x(cm))}" y2="62" stroke="#92400e" stroke-width="1"/>`);
    out.push(svgText(x(cm), 71, String(cm), 5));
    if (cm < 10) out.push(`<line x1="${r1(x(cm) + 4.4)}" y1="52" x2="${r1(x(cm) + 4.4)}" y2="57" stroke="#92400e" stroke-width="0.6"/>`);
  }
  out.push(`<rect x="${r1(x(startCm))}" y="36" width="${r1((endCm - startCm) * 8.8)}" height="10" rx="3" fill="${COLORS.blue}"/>`);
  out.push(svgText((x(startCm) + x(endCm)) / 2, 30, label, 6));
  return svgWrap(out.join(""));
}

function cubesSvg(n: number, label: string): string {
  const out: string[] = [];
  const cube = Math.min(10, 88 / n);
  const x0 = 50 - (n * cube) / 2;
  out.push(`<rect x="${r1(x0)}" y="38" width="${r1(n * cube)}" height="10" rx="3" fill="${COLORS.amber}"/>`);
  out.push(svgText(50, 32, label, 6));
  for (let i = 0; i < n; i++) {
    out.push(`<rect x="${r1(x0 + i * cube)}" y="52" width="${r1(cube)}" height="${r1(cube)}" fill="#bfdbfe" stroke="${COLORS.blue}" stroke-width="1"/>`);
  }
  return svgWrap(out.join(""));
}

const lengthMeasureUnits: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "cubes");
  const level = levelOf(ctx);
  const obj = pick(rng, OBJECTS);
  if (mode === "ruler") {
    const broken = level >= 2 && rng() < 0.4;
    const start = broken ? int(rng, 1, 4) : 0;
    const len = int(rng, 2, 10 - start);
    const end = start + len;
    return {
      type: "numeric",
      prompt: `How many centimeters long is the ${obj}?`,
      answer: len,
      display: { svg: rulerSvg(start, end, obj), speak: `How many centimeters long is the ${obj}?` },
      explain: broken
        ? `The ${obj} starts at ${start} and ends at ${end}. Length = end − start = ${end} − ${start} = ${len} cm.`
        : `The ${obj} starts at 0 and ends at ${end}, so it is ${len} cm long. Always start measuring at the 0 mark.`,
      hint: broken ? "The object does not start at 0. Count the spaces between its two ends, or subtract." : "Find the number at the end of the object. Make sure it starts at 0.",
    };
  }
  const n = int(rng, 2, 9);
  if (rng() < 0.7) {
    return {
      type: "numeric",
      prompt: `How many cubes long is the ${obj}?`,
      answer: n,
      display: { svg: cubesSvg(n, obj), speak: `How many cubes long is the ${obj}?` },
      explain: `The cubes are laid end to end with no gaps and no overlaps. Count them: ${n}. The ${obj} is ${n} cubes long.`,
      hint: "Count the cubes under the object. They must touch with no gaps.",
    };
  }
  const options = shuffle(rng, ["no gaps and no overlaps", "big gaps between them", "stacked on top of each other", "starting in the middle"]);
  return {
    type: "choice",
    prompt: "To measure with cubes, how should the cubes be placed?",
    display: { svg: cubesSvg(n, obj), speak: "To measure with cubes, how should the cubes be placed?" },
    options: options.map((o) => ({ label: o })),
    answerIndex: options.indexOf("no gaps and no overlaps"),
    explain: "Units must be the same size, laid end to end from one end of the object to the other, with no gaps and no overlaps. Then the count tells the length.",
    hint: "Think about what would make the count come out too big or too small: spaces between cubes, or cubes on top of each other.",
  };
};

// ---------------------------------------------------------------------------
// shapesAttributes — 1.G.A.1-2, 2.G.A.1, 3.G.A.1
// ---------------------------------------------------------------------------

interface ShapeDef {
  name: string;
  sides: number;
  draw: (rot: number, size: number) => string;
}

const style = `fill="#c7d2fe" stroke="#4338ca" stroke-width="2.5" stroke-linejoin="round"`;

const SHAPES: ShapeDef[] = [
  { name: "triangle", sides: 3, draw: (rot, s) => `<polygon points="${polygonPoints(3, 50, 54, s, rot)}" ${style}/>` },
  { name: "square", sides: 4, draw: (rot, s) => `<polygon points="${polygonPoints(4, 50, 50, s, rot + 45)}" ${style}/>` },
  { name: "rectangle", sides: 4, draw: (rot, s) => `<g transform="rotate(${rot} 50 50)"><rect x="${r1(50 - s)}" y="${r1(50 - s * 0.55)}" width="${r1(2 * s)}" height="${r1(s * 1.1)}" ${style}/></g>` },
  { name: "rhombus", sides: 4, draw: (rot, s) => `<g transform="rotate(${rot} 50 50)"><polygon points="50,${r1(50 - s)} ${r1(50 + s * 0.65)},50 50,${r1(50 + s)} ${r1(50 - s * 0.65)},50" ${style}/></g>` },
  { name: "trapezoid", sides: 4, draw: (rot, s) => `<g transform="rotate(${rot} 50 50)"><polygon points="${r1(50 - s * 0.55)},${r1(50 - s * 0.6)} ${r1(50 + s * 0.55)},${r1(50 - s * 0.6)} ${r1(50 + s)},${r1(50 + s * 0.6)} ${r1(50 - s)},${r1(50 + s * 0.6)}" ${style}/></g>` },
  { name: "pentagon", sides: 5, draw: (rot, s) => `<polygon points="${polygonPoints(5, 50, 50, s, rot)}" ${style}/>` },
  { name: "hexagon", sides: 6, draw: (rot, s) => `<polygon points="${polygonPoints(6, 50, 50, s, rot)}" ${style}/>` },
  { name: "circle", sides: 0, draw: (_rot, s) => `<circle cx="50" cy="50" r="${s}" ${style}/>` },
];

function shapeSvg(def: ShapeDef, rot: number, size: number): string {
  return svgWrap(def.draw(rot, size));
}

/**
 * Names that are ALSO true of a drawn `shown` shape: a square is a rectangle
 * and a rhombus too (the drawn rectangle and rhombus are never squares). Such
 * a name can never be a distractor, nor such a shape a "not a …" answer.
 */
function alsoNames(shown: string): string[] {
  return shown === "square" ? ["rectangle", "rhombus"] : [];
}

const shapesAttributes: Generator = (ctx) => {
  const { rng } = ctx;
  const level = levelOf(ctx);
  const mode = strParam(ctx, "mode", "attributes");
  const rot = int(rng, 0, 11) * 15;
  const size = int(rng, 30, 42);
  if (mode === "compose") {
    const variant = int(rng, 0, 2);
    if (variant === 0) {
      const svg = svgWrap(`<polygon points="15,85 85,85 85,15 15,15" ${style}/><line x1="15" y1="85" x2="85" y2="15" stroke="#4338ca" stroke-width="2" stroke-dasharray="4 3"/>`);
      return labelChoice(rng, "2 triangles", ["2 circles", "3 rectangles", "2 hexagons"], {
        prompt: "The square is cut along the dashed line. What two shapes do you get?",
        display: { svg, speak: "The square is cut along the dashed line. What two shapes do you get?" },
        explain: "Cutting a square corner to corner makes 2 triangles. Two of those triangles put back together make the square again.",
        hint: "Count the sides of each piece after the cut.",
      });
    }
    if (variant === 1) {
      const pts = polygonPoints(6, 50, 50, 40, 0).split(" ");
      const lines = pts.map((p) => `<line x1="50" y1="50" x2="${p.split(",")[0]}" y2="${p.split(",")[1]}" stroke="#4338ca" stroke-width="1.5" stroke-dasharray="3 3"/>`).join("");
      const svg = svgWrap(`<polygon points="${pts.join(" ")}" ${style}/>${lines}`);
      return {
        type: "numeric",
        prompt: "How many triangles make up this hexagon?",
        answer: 6,
        display: { svg, speak: "How many triangles make up this hexagon?" },
        explain: "A hexagon has 6 sides, and each side is the base of one triangle that meets in the middle. So 6 triangles compose the hexagon.",
        hint: "Count the dashed pieces. Each one is a triangle.",
      };
    }
    const n = int(rng, 2, 4);
    const w = 80 / n;
    const rects = Array.from({ length: n }, (_, i) => `<rect x="${r1(10 + i * w)}" y="30" width="${r1(w)}" height="40" ${style}/>`).join("");
    return {
      type: "numeric",
      prompt: "How many small rectangles were put together to make the big rectangle?",
      answer: n,
      display: { svg: svgWrap(rects), speak: "How many small rectangles were put together to make the big rectangle?" },
      explain: `Count the pieces side by side: ${n}. Shapes can be combined to make a new, bigger shape.`,
      hint: "Count the pieces from left to right.",
    };
  }
  if (level >= 3) {
    const variant = int(rng, 0, 3);
    if (variant === 0) {
      const target = pick(rng, ["rhombus", "rectangle", "square", "trapezoid"]);
      const def = SHAPES.find((s) => s.name === target) as ShapeDef;
      // A square is also a rectangle and a rhombus, so it can't be a wrong option for those.
      const others = sample(rng, SHAPES.filter((s) => s.name !== target && s.name !== (target === "square" ? "rhombus" : "") && !alsoNames(s.name).includes(target)), 3);
      return optionChoice(rng, { svg: shapeSvg(def, rot, size) }, others.map((o) => ({ svg: shapeSvg(o, rot, size) })), {
        prompt: `Which shape is a ${target}?`,
        display: { speak: `Which shape is a ${target}?` },
        explain:
          target === "rhombus"
            ? "A rhombus has 4 sides that are all the same length (it can be tilted)."
            : target === "rectangle"
              ? "A rectangle has 4 sides and 4 square corners (right angles). Opposite sides are equal."
              : target === "square"
                ? "A square has 4 equal sides AND 4 right angles. So every square is also a rectangle and a rhombus."
                : "A trapezoid has 4 sides with exactly one pair of parallel sides.",
        hint: "Count the sides, then check: are the sides equal? Are the corners square?",
      });
    }
    if (variant === 1) {
      return labelChoice(rng, "rectangle", ["triangle", "hexagon", "circle"], {
        prompt: "A square is always also a …?",
        display: { svg: shapeSvg(SHAPES[1], 0, 36), speak: "A square is always also a what?" },
        explain: "A rectangle is any quadrilateral with 4 right angles. A square has 4 right angles, so it IS a rectangle (a special one, with equal sides). It is also a rhombus.",
        hint: "Which category needs 4 right angles? Does a square have them?",
      });
    }
    if (variant === 2) {
      const qs = [
        ["Which quadrilateral has 4 right angles but does NOT need all sides equal?", "rectangle", ["square", "rhombus", "triangle"]],
        ["Which quadrilateral has 4 equal sides but does NOT need right angles?", "rhombus", ["rectangle", "trapezoid", "pentagon"]],
        ["Which shape is NOT a quadrilateral?", "hexagon", ["square", "rhombus", "trapezoid"]],
        ["Which shape has exactly one pair of parallel sides?", "trapezoid", ["rectangle", "rhombus", "square"]],
      ] as const;
      const q = pick(rng, qs);
      return labelChoice(rng, q[1], [...q[2]], {
        prompt: q[0],
        display: { speak: q[0] },
        explain:
          q[1] === "rectangle"
            ? "Rectangle: 4 right angles, opposite sides equal. A square is a rectangle with all sides equal too."
            : q[1] === "rhombus"
              ? "Rhombus: 4 equal sides. The corners can be slanted. A square is a rhombus with right angles."
              : q[1] === "hexagon"
                ? "Quadrilateral means 4 sides. A hexagon has 6 sides, so it is not a quadrilateral."
                : "A trapezoid has exactly one pair of parallel sides (sides that never meet).",
        hint: "Quadrilateral = 4 sides. Then think: equal sides? square corners? parallel sides?",
      });
    }
    const def = pick(rng, SHAPES.filter((s) => s.sides === 4));
    const options = shuffle(rng, ["yes", "no"]);
    return {
      type: "choice",
      prompt: `Is this shape a quadrilateral?`,
      display: { svg: shapeSvg(def, rot, size), speak: "Is this shape a quadrilateral?" },
      options: options.map((o) => ({ label: o })),
      answerIndex: options.indexOf("yes"),
      explain: `It has 4 straight sides, so yes — it is a quadrilateral. (It is a ${def.name}.) Squares, rectangles, rhombuses and trapezoids are all quadrilaterals.`,
      hint: "Count the straight sides. Quad means four.",
    };
  }
  if (level >= 2) {
    const variant = int(rng, 0, 3);
    const pool = SHAPES.filter((s) => s.sides >= 3);
    const def = pick(rng, pool);
    if (variant === 0) {
      return {
        type: "numeric",
        prompt: `How many sides does a ${def.name} have?`,
        answer: def.sides,
        display: { svg: shapeSvg(def, rot, size), speak: `How many sides does a ${def.name} have?` },
        explain: `A ${def.name} has ${def.sides} straight sides and ${def.sides} corners (angles). ${def.sides === 3 ? "Tri means three." : def.sides === 4 ? "Quad means four." : def.sides === 5 ? "Penta means five." : "Hexa means six."}`,
        hint: "Trace each side with your finger and count. Corners and sides always match.",
      };
    }
    if (variant === 1) {
      const n = pick(rng, [3, 4, 5, 6]);
      const answers = pool.filter((s) => s.sides === n);
      const def2 = pick(rng, answers);
      const others = sample(rng, pool.filter((s) => s.sides !== n), 3);
      return optionChoice(rng, { svg: shapeSvg(def2, rot, size) }, others.map((o) => ({ svg: shapeSvg(o, rot, size) })), {
        prompt: `Which shape has ${n} sides?`,
        display: { speak: `Which shape has ${n} sides?` },
        explain: `Count the sides of each shape. The ${def2.name} has ${n} sides.`,
        hint: "Count the straight sides on each shape, one at a time.",
      });
    }
    if (variant === 2) {
      const q = pick(rng, [
        ["faces", 6, "A cube has 6 square faces, like a dice."],
        ["corners (vertices)", 8, "A cube has 8 corners: 4 on top and 4 on the bottom."],
        ["edges", 12, "A cube has 12 edges: 4 on top, 4 on the bottom and 4 going up."],
      ] as const);
      const cube = svgWrap(`<polygon points="25,35 65,35 65,75 25,75" ${style}/><polygon points="25,35 40,22 80,22 65,35" ${style}/><polygon points="65,35 80,22 80,62 65,75" ${style}/>`);
      return {
        type: "numeric",
        prompt: `How many ${q[0]} does a cube have?`,
        answer: q[1],
        display: { svg: cube, speak: `How many ${q[0]} does a cube have?` },
        explain: q[2],
        hint: "Picture a dice. Turn it around in your mind and count.",
      };
    }
    const answer = def.name;
    return labelChoice(rng, answer, sample(rng, pool.filter((s) => s.name !== answer && !alsoNames(answer).includes(s.name)).map((s) => s.name), 3), {
      prompt: "What is the name of this shape?",
      display: { svg: shapeSvg(def, rot, size), speak: "What is the name of this shape?" },
      explain: `It has ${def.sides} sides, so it is a ${def.name}.${def.sides === 4 ? " Four-sided shapes are quadrilaterals." : ""}`,
      hint: "Count the sides first. Three is a triangle, four is a quadrilateral, five is a pentagon, six is a hexagon.",
    });
  }
  // level 1
  const variant = int(rng, 0, 3);
  const pool = SHAPES.filter((s) => ["triangle", "square", "rectangle", "hexagon", "circle", "trapezoid"].includes(s.name));
  const def = pick(rng, pool);
  if (variant === 0) {
    return labelChoice(rng, def.name, sample(rng, pool.filter((s) => s.name !== def.name && !alsoNames(def.name).includes(s.name)).map((s) => s.name), 3), {
      prompt: "What shape is this?",
      display: { svg: shapeSvg(def, rot, size), speak: "What shape is this?" },
      explain: def.sides === 0 ? "A circle is perfectly round with no straight sides and no corners." : `It has ${def.sides} straight sides and ${def.sides} corners: a ${def.name}. Turning it or making it bigger does not change its name.`,
      hint: "Count the straight sides and the corners. Being tilted does not change the shape.",
    });
  }
  if (variant === 1 && def.sides > 0) {
    const askCorners = rng() < 0.5;
    return {
      type: "numeric",
      prompt: `How many ${askCorners ? "corners" : "sides"} does this shape have?`,
      answer: def.sides,
      display: { svg: shapeSvg(def, rot, size), speak: `How many ${askCorners ? "corners" : "sides"} does this shape have?` },
      explain: `A ${def.name} has ${def.sides} sides and ${def.sides} corners. Sides and corners always match.`,
      hint: "Trace around the shape with your finger. Count each straight side (or each pointy corner).",
    };
  }
  if (variant === 2) {
    const target = pick(rng, pool.filter((s) => s.sides > 0));
    // A square is a rectangle too, so it can't be the odd one out among rectangles.
    const notIt = pick(rng, pool.filter((s) => s.name !== target.name && !alsoNames(s.name).includes(target.name)));
    const same = [0, 1, 2].map((k) => ({ svg: shapeSvg(target, (rot + k * 40) % 360, size - k * 4) }));
    return optionChoice(rng, { svg: shapeSvg(notIt, rot, size) }, same, {
      prompt: `Which one is NOT a ${target.name}?`,
      display: { speak: `Which one is not a ${target.name}?` },
      explain: `Three of them are ${target.name}s — some are turned or smaller, but they still have ${target.sides} sides. The ${notIt.name} is different.`,
      hint: "Color, size and turning do not matter. Count the sides.",
    });
  }
  const facts = [
    ["Which is always true about a triangle?", "it has 3 sides", ["it is blue", "it is big", "it points up"]],
    ["Which is always true about a square?", "it has 4 equal sides", ["it is red", "it is small", "it has 3 corners"]],
    ["Which is always true about a rectangle?", "it has 4 corners", ["it is tall", "it is green", "it has 6 sides"]],
    ["Which is always true about a circle?", "it has no corners", ["it is small", "it is orange", "it has 4 sides"]],
    ["Which is always true about a hexagon?", "it has 6 sides", ["it is yellow", "it is big", "it has 5 corners"]],
  ] as const;
  const f = pick(rng, facts);
  return labelChoice(rng, f[1], [...f[2]], {
    prompt: f[0],
    display: { speak: f[0] },
    explain: `${f[1]} — that is a defining attribute. Color, size and which way it points are NOT defining: a shape keeps its name no matter its color or size.`,
    hint: "Defining attributes are about sides and corners. Color and size can change without changing the shape.",
  });
};

// ---------------------------------------------------------------------------
// halvesQuarters — 1.G.A.3 (halves, fourths), 2.G.A.3 (thirds too)
// ---------------------------------------------------------------------------

const PART_WORDS: Record<number, [string, string]> = {
  2: ["one half", "halves"],
  3: ["one third", "thirds"],
  4: ["one fourth", "fourths"],
};

const PART_COLORS = ["#a5b4fc", "#fcd34d", "#86efac", "#f9a8d4"];

function partitionSvg(shape: "circle" | "bar", parts: number, shaded: number[], color = "#a5b4fc"): string {
  return shape === "circle" ? circleFractionSvg(parts, shaded, color) : barFractionSvg(parts, shaded, color);
}

function unequalSvg(): string {
  return svgWrap(
    `<rect x="4" y="35" width="30" height="30" fill="#fff" stroke="${COLORS.ink}" stroke-width="1.5"/><rect x="34" y="35" width="62" height="30" fill="#fff" stroke="${COLORS.ink}" stroke-width="1.5"/>`
  );
}

const halvesQuarters: Generator = (ctx) => {
  const { rng } = ctx;
  const partsList = numListParam(ctx, "parts", [2, 4]);
  const parts = pick(rng, partsList);
  const shape = pick(rng, ["circle", "bar"] as const);
  const shadedIdx = int(rng, 0, parts - 1);
  const color = pick(rng, PART_COLORS);
  const variant = int(rng, 0, 4);
  if (variant === 4) {
    const want = pick(rng, [PART_WORDS[parts][1], PART_WORDS[parts][1]]);
    return {
      type: "numeric",
      prompt: `How many ${want} make one whole?`,
      answer: parts,
      display: { svg: partitionSvg(shape, parts, Array.from({ length: parts }, (_, i) => i), color), speak: `How many ${want} make one whole?` },
      explain: `The whole is cut into ${parts} equal parts, so it takes all ${parts} ${want} to make the whole again.`,
      hint: "Count the equal pieces in the whole shape.",
    };
  }
  if (variant === 0) {
    const answer = PART_WORDS[parts][0];
    const wrong = Object.values(PART_WORDS).map((w) => w[0]).filter((w) => w !== answer).concat(["one whole"]);
    return labelChoice(rng, answer, wrong, {
      prompt: "What part of the shape is shaded?",
      display: { svg: partitionSvg(shape, parts, [shadedIdx], color), speak: "What part of the shape is shaded?" },
      explain: `The shape is cut into ${parts} equal parts (${PART_WORDS[parts][1]}). One part is shaded: ${answer}.`,
      hint: "Count how many equal pieces the whole shape is cut into. One of those pieces is shaded.",
    });
  }
  if (variant === 1) {
    const wantParts = parts;
    const correct: Option = { svg: partitionSvg(shape, wantParts, [], color) };
    const others: Option[] = [2, 3, 4].filter((p) => p !== wantParts).map((p) => ({ svg: partitionSvg(shape, p, [], color) }));
    others.push({ svg: unequalSvg() });
    return optionChoice(rng, correct, others, {
      prompt: `Which shape is cut into ${PART_WORDS[wantParts][1]}?`,
      display: { speak: `Which shape is cut into ${PART_WORDS[wantParts][1]}?` },
      explain: `${PART_WORDS[wantParts][1]} means ${wantParts} EQUAL parts. Count the parts and check they are the same size. (Pieces of different sizes are not equal shares.)`,
      hint: `Count the pieces: you need exactly ${wantParts}, all the same size.`,
    });
  }
  if (variant === 2) {
    const other = pick(rng, [2, 3, 4].filter((p) => p !== parts));
    const bigger = Math.min(parts, other);
    const answer = PART_WORDS[bigger][0];
    return labelChoice(rng, answer, [PART_WORDS[Math.max(parts, other)][0], "they are the same size", "you cannot tell"], {
      prompt: `Two pizzas are the same size. Which piece is bigger: ${PART_WORDS[parts][0]} or ${PART_WORDS[other][0]} of a pizza?`,
      display: { svg: barFractionSvg(parts, [0], "#a5b4fc", [{ parts: other, shaded: [0], color: "#fcd34d" }]), speak: `Which piece is bigger, ${PART_WORDS[parts][0]} or ${PART_WORDS[other][0]} of a pizza?` },
      explain: `More shares means smaller shares. Cutting into ${Math.max(parts, other)} pieces makes each piece smaller than cutting into ${bigger} pieces. So ${answer} is bigger.`,
      hint: "If you share a pizza with more people, does each person get more or less?",
    });
  }
  return {
    type: "numeric",
    prompt: `A ${shape === "circle" ? "pie" : "sandwich"} is cut into ${PART_WORDS[parts][1]}. How many equal pieces are there?`,
    answer: parts,
    display: { svg: partitionSvg(shape, parts, [], color), speak: `It is cut into ${PART_WORDS[parts][1]}. How many equal pieces?` },
    explain: `${PART_WORDS[parts][1]} means ${parts} equal pieces. ${parts === 2 ? "Two halves" : parts === 3 ? "Three thirds" : "Four fourths (quarters)"} make one whole.`,
    hint: "Halves = 2, thirds = 3, fourths = 4.",
  };
};

// ---------------------------------------------------------------------------
// wordProblemJoinSeparateCompare — 1.OA.A.1, 2.OA.A.1, 2.M.B.5
// ---------------------------------------------------------------------------

type WpType = "joinResult" | "joinChange" | "joinStart" | "sepResult" | "sepChange" | "pwTotal" | "pwPart" | "cmpDiff" | "cmpBigger" | "cmpSmaller";

const WP_GROUPS: Record<string, WpType[]> = {
  join: ["joinResult", "joinChange", "joinStart"],
  separate: ["sepResult", "sepChange"],
  partwhole: ["pwTotal", "pwPart"],
  compare: ["cmpDiff", "cmpBigger", "cmpSmaller"],
};

/** "1 inch", "12 inches", "5 cm", "1 meter". */
function lengthUnit(unit: string): (n: number) => string {
  const one = unit === "inches" ? "inch" : unit === "meters" ? "meter" : unit;
  return (n: number) => `${n} ${n === 1 ? one : unit}`;
}

/**
 * Length stories (2.M.B.5): ribbon verbs (ties on / cuts off / longer than)
 * instead of the item scenes, and the unit on every number.
 */
function lengthStory(type: WpType, len: (n: number) => string, name: string, other: string, n: { part: number; rest: number; total: number; big: number; small: number; diff: number }): Question {
  const { part, rest, total, big, small, diff } = n;
  const q = (prompt: string, answer: number, explain: string, hint: string): Question => ({ type: "numeric", prompt, answer, display: { emoji: "🎀", speak: prompt }, explain, hint });
  switch (type) {
    case "joinResult":
      return q(`${name} has a ribbon that is ${len(part)} long. ${name} ties on ${len(rest)} more. How long is the ribbon now?`, total, `Join story: part + part = whole. ${part} + ${rest} = ${total}, so the ribbon is ${len(total)} long.`, "Some ribbon was there, then more was tied on. Add the two lengths.");
    case "joinChange":
      return q(`${name} has a ribbon that is ${len(part)} long. ${name} ties on another piece, and now the ribbon is ${len(total)} long. How long is the piece ${name} tied on?`, rest, `Number sentence: ${part} + ? = ${total}. Count up from ${part} to ${total}, or subtract: ${total} − ${part} = ${rest}. The piece is ${len(rest)} long.`, `Start at ${part} and count up to ${total}. The jump is the missing piece.`);
    case "joinStart":
      return q(`${name} has a ribbon. ${name} ties on ${len(rest)} more, and now it is ${len(total)} long. How long was the ribbon at the start?`, part, `Number sentence: ? + ${rest} = ${total}. Take away the piece that was added: ${total} − ${rest} = ${part}. It was ${len(part)} long.`, "The whole length is known and one piece is known. Take the known piece away from the whole.");
    case "sepResult":
      return q(`${name} has ${len(total)} of ribbon. ${name} cuts off ${len(part)}. How much ribbon is left?`, rest, `Take-away story: whole − part = part. ${total} − ${part} = ${rest}, so ${len(rest)} of ribbon is left.`, "Start with the whole length and take away the piece that was cut off.");
    case "sepChange":
      return q(`${name} has ${len(total)} of ribbon. ${name} cuts some off, and ${len(rest)} is left. How much did ${name} cut off?`, part, `Number sentence: ${total} − ? = ${rest}. The missing part is ${total} − ${rest} = ${part} (or count up from ${rest} to ${total}). ${name} cut off ${len(part)}.`, `Count up from ${rest} to ${total}, or subtract what is left from the whole length.`);
    case "pwTotal":
      return q(`${name} has a red ribbon that is ${len(part)} long and a blue ribbon that is ${len(rest)} long. How long are the two ribbons together?`, total, `Put-together story: part + part = whole. ${part} + ${rest} = ${total}, so together they are ${len(total)} long.`, "Two ribbons put end to end. Add the lengths.");
    case "pwPart":
      return q(`${name} has ${len(total)} of ribbon. ${len(part)} of it is red and the rest is blue. How much of the ribbon is blue?`, rest, `Whole − known part = other part. ${total} − ${part} = ${rest}, so ${len(rest)} is blue. (Check: ${part} + ${rest} = ${total}.)`, "You know the whole length and one part. Subtract to find the other part.");
    case "cmpDiff":
      return q(`${name}'s ribbon is ${len(big)} long. ${other}'s ribbon is ${len(small)} long. How much longer is ${name}'s ribbon?`, diff, `Compare story: the difference is longer − shorter. ${big} − ${small} = ${diff}, so ${name}'s ribbon is ${len(diff)} longer. Line the ribbons up: the longer one sticks out by that much.`, "Line the two ribbons up at one end. The extra piece of the longer ribbon is the answer.");
    case "cmpBigger":
      return q(`${other}'s ribbon is ${len(small)} long. ${name}'s ribbon is ${len(diff)} longer than ${other}'s. How long is ${name}'s ribbon?`, big, `"${len(diff)} longer than ${len(small)}" means add: ${small} + ${diff} = ${big}. ${name}'s ribbon is ${len(big)} long.`, `${name}'s ribbon is longer. Start with ${other}'s length and add the extra.`);
    default:
      return q(`${name}'s ribbon is ${len(big)} long. That is ${len(diff)} longer than ${other}'s ribbon. How long is ${other}'s ribbon?`, small, `${name}'s ribbon is the longer one, so ${other}'s is ${len(diff)} shorter: ${big} − ${diff} = ${small}. It is ${len(small)} long. (Check: ${small} + ${diff} = ${big}.)`, `Careful: "longer" is in the story, but ${other}'s ribbon is SHORTER. Take the difference away from the longer length.`);
  }
}

const wordProblemJoinSeparateCompare: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 20);
  const steps = numParam(ctx, "steps", 1);
  const theme = strParam(ctx, "theme", "items");
  const typeNames = strListParam(ctx, "types", ["join", "separate", "partwhole", "compare"]);
  const name = pickName(rng);
  const other = pickName(rng, name);
  const scene = pick(rng, SCENES_EARLY);
  const unit = theme === "length" ? pick(rng, ["cm", "inches", "meters"]) : "";
  const thing = theme === "length" ? `${unit} of ribbon` : scene.item[1];
  const total = int(rng, Math.min(max, 8), max);
  let part = int(rng, 1, total - 1);
  if (total - part === part) part += 1;
  const rest = total - part;
  const big = Math.max(part, rest);
  const small = Math.min(part, rest);
  const diff = big - small;

  if (steps >= 2) {
    const start = int(rng, Math.floor(max / 2), max - 10);
    const add = int(rng, 5, Math.min(30, max - start));
    let take = int(rng, 3, Math.min(start + add - 1, 30));
    for (let guard = 0; guard < 5 && [start, add, take].includes(start + add - take); guard++) take = take > 3 ? take - 1 : take + 1;
    const kind = rng() < 0.5 ? "addThenTake" : "takeTwice";
    if (theme === "length") {
      const len = lengthUnit(unit);
      let take2 = 0;
      if (kind === "takeTwice") {
        take2 = int(rng, 2, Math.max(2, start + add - take - 1));
        for (let guard = 0; guard < 5 && [start + add, take, take2].includes(start + add - take - take2); guard++) take2 = take2 > 2 ? take2 - 1 : take2 + 1;
      }
      const whole = kind === "addThenTake" ? start : start + add;
      const answer = kind === "addThenTake" ? start + add - take : start + add - take - take2;
      const prompt =
        kind === "addThenTake"
          ? `${name} has ${len(start)} of ribbon. ${name} ties on ${len(add)} more, then cuts off ${len(take)}. How much ribbon does ${name} have now?`
          : `${name} has ${len(whole)} of ribbon. ${name} gives ${len(take)} to ${other} and cuts off ${len(take2)} for a bow. How much ribbon is left?`;
      return {
        type: "numeric",
        prompt,
        answer,
        display: { emoji: "🎀", speak: prompt },
        explain:
          kind === "addThenTake"
            ? `Two steps. Step 1: ${start} + ${add} = ${start + add}. Step 2: ${start + add} − ${take} = ${answer}. ${name} has ${len(answer)} of ribbon.`
            : `Two steps. Step 1: ${whole} − ${take} = ${whole - take}. Step 2: ${whole - take} − ${take2} = ${answer}. ${len(answer)} of ribbon is left.`,
        hint: "Do the first thing that happens, write the new length, then do the second thing.",
      };
    }
    if (kind === "addThenTake") {
      return {
        type: "numeric",
        prompt: `${name} has ${start} ${thing}. ${name} ${scene.more} ${add} more, then ${scene.fewer} ${take}. How many ${thing} now?`,
        answer: start + add - take,
        display: { emoji: scene.emoji, speak: `${name} has ${start} ${thing}, ${scene.more} ${add} more, then ${scene.fewer} ${take}. How many now?` },
        explain: `Two steps. Step 1: ${start} + ${add} = ${start + add}. Step 2: ${start + add} − ${take} = ${start + add - take}.`,
        hint: "Do the first thing that happens, write the new amount, then do the second thing.",
      };
    }
    let take2 = int(rng, 2, Math.max(2, start + add - take - 1));
    for (let guard = 0; guard < 5 && [start + add, take, take2].includes(start + add - take - take2); guard++) take2 = take2 > 2 ? take2 - 1 : take2 + 1;
    return {
      type: "numeric",
      prompt: `${name} has ${start + add} ${thing}. ${name} gives ${take} to ${other} and ${take2} to a friend. How many ${thing} are left?`,
      answer: start + add - take - take2,
      display: { emoji: scene.emoji, speak: `${name} has ${start + add} ${thing}, gives ${take} to ${other} and ${take2} to a friend. How many are left?` },
      explain: `Two steps. Step 1: ${start + add} − ${take} = ${start + add - take}. Step 2: ${start + add - take} − ${take2} = ${start + add - take - take2}. (Or add what was given away first: ${take} + ${take2} = ${take + take2}, then ${start + add} − ${take + take2}.)`,
      hint: "Two things are given away. Take away the first amount, then the second.",
    };
  }

  const group = pick(rng, typeNames.filter((g) => WP_GROUPS[g]));
  const type = pick(rng, WP_GROUPS[group] ?? WP_GROUPS.join);
  if (theme === "length") return lengthStory(type, lengthUnit(unit), name, other, { part, rest, total, big, small, diff });
  const em = { emoji: scene.emoji };
  switch (type) {
    case "joinResult":
      return {
        type: "numeric",
        prompt: `${name} has ${part} ${thing}. ${name} ${scene.more} ${rest} more. How many ${thing} does ${name} have now?`,
        answer: total,
        display: { ...em, speak: `${name} has ${part} ${thing} and ${scene.more} ${rest} more. How many now?` },
        explain: `Join story: part + part = whole. ${part} + ${rest} = ${total}.`,
        hint: "Some were there, then more came. Add the two parts.",
      };
    case "joinChange":
      return {
        type: "numeric",
        prompt: `${name} has ${part} ${thing}. ${name} ${scene.more} some more. Now ${name} has ${total}. How many did ${name} get?`,
        answer: rest,
        display: { ...em, speak: `${name} has ${part} ${thing}, gets some more, and now has ${total}. How many did ${name} get?` },
        explain: `Number sentence: ${part} + ? = ${total}. Count up from ${part} to ${total}, or subtract: ${total} − ${part} = ${rest}.`,
        hint: `Start at ${part} and count up to ${total}. The jump is the missing part.`,
      };
    case "joinStart":
      return {
        type: "numeric",
        prompt: `${name} has some ${thing}. ${name} ${scene.more} ${rest} more and now has ${total}. How many did ${name} start with?`,
        answer: part,
        display: { ...em, speak: `${name} has some ${thing}, gets ${rest} more and now has ${total}. How many to start?` },
        explain: `Number sentence: ? + ${rest} = ${total}. Take away the part that was added: ${total} − ${rest} = ${part}.`,
        hint: "The whole is known and one part is known. Take the known part away from the whole.",
      };
    case "sepResult":
      return {
        type: "numeric",
        prompt: `${name} has ${total} ${thing}. ${name} ${scene.fewer} ${part}. How many ${thing} are left?`,
        answer: rest,
        display: { ...em, speak: `${name} has ${total} ${thing} and ${scene.fewer} ${part}. How many are left?` },
        explain: `Take-away story: whole − part = part. ${total} − ${part} = ${rest}.`,
        hint: "Start with the whole amount and take away the part that left.",
      };
    case "sepChange":
      return {
        type: "numeric",
        prompt: `${name} has ${total} ${thing}. ${name} ${scene.fewer} some. Now ${name} has ${rest} left. How many did ${name} give away?`,
        answer: part,
        display: { ...em, speak: `${name} has ${total} ${thing}, gives some away, and has ${rest} left. How many were given away?` },
        explain: `Number sentence: ${total} − ? = ${rest}. The missing part is ${total} − ${rest} = ${part} (or count up from ${rest} to ${total}).`,
        hint: `Count up from ${rest} to ${total}, or subtract the leftover from the whole.`,
      };
    case "pwTotal":
      return {
        type: "numeric",
        prompt: `${name} has ${part} red ${thing} and ${rest} blue ${thing}. How many ${thing} in all?`,
        answer: total,
        display: { ...em, speak: `${name} has ${part} red and ${rest} blue ${thing}. How many in all?` },
        explain: `Put-together story: part + part = whole. ${part} + ${rest} = ${total}.`,
        hint: "Two groups put together. Add them.",
      };
    case "pwPart":
      return {
        type: "numeric",
        prompt: `${name} has ${total} ${thing}. ${part} are red and the rest are blue. How many are blue?`,
        answer: rest,
        display: { ...em, speak: `${name} has ${total} ${thing}. ${part} are red and the rest are blue. How many are blue?` },
        explain: `Whole − known part = other part. ${total} − ${part} = ${rest}. (Check: ${part} + ${rest} = ${total}.)`,
        hint: "You know the whole and one part. Subtract to find the other part.",
      };
    case "cmpDiff":
      return {
        type: "numeric",
        prompt: `${name} has ${big} ${thing}. ${other} has ${small}. How many more does ${name} have than ${other}?`,
        answer: diff,
        display: { ...em, speak: `${name} has ${big} ${thing}. ${other} has ${small}. How many more does ${name} have?` },
        explain: `Compare story: the difference is big − small. ${big} − ${small} = ${diff}. Picture two bars: the longer bar sticks out by ${diff}.`,
        hint: "Draw two bars, one for each person. The extra piece of the longer bar is the answer.",
      };
    case "cmpBigger":
      return {
        type: "numeric",
        prompt: `${other} has ${small} ${thing}. ${name} has ${diff} more than ${other}. How many does ${name} have?`,
        answer: big,
        display: { ...em, speak: `${other} has ${small} ${thing}. ${name} has ${diff} more than ${other}. How many does ${name} have?` },
        explain: `"${diff} more than ${small}" means add: ${small} + ${diff} = ${big}.`,
        hint: `${name} has more. Start with ${other}'s amount and add the extra.`,
      };
    default:
      return {
        type: "numeric",
        prompt: `${name} has ${big} ${thing}. ${name} has ${diff} more than ${other}. How many does ${other} have?`,
        answer: small,
        display: { ...em, speak: `${name} has ${big} ${thing}, which is ${diff} more than ${other}. How many does ${other} have?` },
        explain: `${name} has the bigger amount. ${other} has ${diff} fewer: ${big} − ${diff} = ${small}. (Check: ${small} + ${diff} = ${big}.)`,
        hint: `Careful: "more" is in the story, but ${other} has LESS. Take the difference away from the bigger amount.`,
      };
  }
};

// ---------------------------------------------------------------------------
// measurementUnits — 2.M.A.2-3 (length units, estimates), 3.M.A.2 (mass, volume)
// ---------------------------------------------------------------------------

const measurementUnits: Generator = (ctx) => {
  const { rng } = ctx;
  const grade = numParam(ctx, "grade", 2);
  if (grade >= 3) {
    const variant = int(rng, 0, 3);
    if (variant === 0) {
      const items = [
        ["an apple", "150 grams", ["15 kilograms", "1 gram", "150 kilograms"]],
        ["a pony", "200 kilograms", ["200 grams", "2 kilograms", "20 grams"]],
        ["a paper clip", "1 gram", ["1 kilogram", "100 grams", "10 kilograms"]],
        ["a soccer ball", "400 grams", ["4 kilograms", "40 kilograms", "4 grams"]],
        ["a bathtub of water", "150 liters", ["150 milliliters", "1 liter", "15 milliliters"]],
        ["a spoonful of medicine", "5 milliliters", ["5 liters", "500 milliliters", "50 liters"]],
        ["a water bottle", "500 milliliters", ["500 liters", "5 milliliters", "50 liters"]],
        ["a baseball", "150 grams", ["15 kilograms", "150 kilograms", "1 gram"]],
      ] as const;
      const it = pick(rng, items);
      return labelChoice(rng, it[1], [...it[2]], {
        prompt: `Which is the best estimate for ${it[0]}?`,
        display: { speak: `Which is the best estimate for ${it[0]}?` },
        explain: `${it[0]} is about ${it[1]}. Remember: 1 kilogram = 1,000 grams (a kilogram is like a big book); 1 liter = 1,000 milliliters (a big water bottle).`,
        hint: "Grams and milliliters are tiny. Kilograms and liters are big. Which fits?",
      });
    }
    if (variant === 1) {
      const n = int(rng, 2, 6);
      const each = pick(rng, [250, 300, 500, 750]);
      return {
        type: "numeric",
        prompt: `Each water bottle holds ${each} mL. How many mL do ${n} bottles hold?`,
        answer: n * each,
        display: { speak: `Each water bottle holds ${each} milliliters. How many milliliters do ${n} bottles hold?` },
        explain: `${n} equal groups of ${each}: ${n} × ${each} = ${n * each} mL.`,
        hint: `Add ${each} for each bottle, or multiply ${n} × ${each}.`,
      };
    }
    if (variant === 2) {
      const a = int(rng, 20, 90) * 10;
      let b = int(rng, 1, Math.floor(a / 20)) * 10;
      if (a - b === b) b = b === 10 ? 20 : b - 10;
      return {
        type: "numeric",
        prompt: `A pony has a mass of ${a} kg. A foal has a mass of ${b} kg. How many kilograms more is the pony?`,
        answer: a - b,
        display: { speak: `A pony is ${a} kilograms. A foal is ${b} kilograms. How many more kilograms is the pony?` },
        explain: `"How many more" is a difference: ${a} − ${b} = ${a - b} kg.`,
        hint: "Subtract the smaller mass from the bigger mass.",
      };
    }
    const q = pick(rng, [
      ["Which tool measures mass?", "a scale", ["a ruler", "a clock", "a measuring cup"]],
      ["Which holds about 1 liter?", "a large water bottle", ["a spoon", "a bathtub", "a swimming pool"]],
      ["Which unit is best for the mass of a truck?", "kilograms", ["grams", "liters", "centimeters"]],
      ["Which unit is best for a drop of water?", "milliliters", ["liters", "kilograms", "meters"]],
    ] as const);
    return labelChoice(rng, q[1], [...q[2]], {
      prompt: q[0],
      display: { speak: q[0] },
      explain: `${q[1]} is the answer. Mass is measured in grams and kilograms with a scale; liquid volume in milliliters and liters with a measuring cup or jug.`,
      hint: "Mass = how heavy. Liquid volume = how much it holds.",
    });
  }
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    const items = [
      ["a crayon", "9 centimeters", ["9 meters", "90 centimeters", "1 meter"]],
      ["a door", "2 meters", ["2 centimeters", "20 meters", "20 centimeters"]],
      ["a soccer field", "100 meters", ["100 centimeters", "1 meter", "10 centimeters"]],
      ["a pony", "1 meter tall", ["1 centimeter tall", "10 meters tall", "100 meters tall"]],
      ["a baseball bat", "3 feet", ["3 inches", "30 feet", "300 feet"]],
      ["a ballet slipper", "8 inches", ["8 feet", "80 inches", "1 inch"]],
      ["an ant", "5 millimeters", ["5 meters", "5 centimeters", "50 centimeters"]],
      ["a bed", "6 feet", ["6 inches", "60 feet", "1 inch"]],
    ] as const;
    const it = pick(rng, items);
    return labelChoice(rng, it[1], [...it[2]], {
      prompt: `About how long is ${it[0]}?`,
      display: { speak: `About how long is ${it[0]}?` },
      explain: `${it[0]} is about ${it[1]}. Benchmarks: a centimeter is a fingernail width, an inch is a thumb joint, a foot is a ruler, a meter is a big step.`,
      hint: "Use a benchmark: fingernail (cm), thumb (inch), ruler (foot), big step (meter).",
    });
  }
  if (variant === 1) {
    const n = int(rng, 1, 5);
    const facts = [
      [`How many inches are in ${n} ${n === 1 ? "foot" : "feet"}?`, 12 * n, "1 foot = 12 inches"],
      [`How many centimeters are in ${n} meter${n === 1 ? "" : "s"}?`, 100 * n, "1 meter = 100 centimeters"],
      [`How many feet are in ${n} yard${n === 1 ? "" : "s"}?`, 3 * n, "1 yard = 3 feet"],
    ] as const;
    const f = pick(rng, facts);
    return {
      type: "numeric",
      prompt: f[0],
      answer: f[1],
      display: { speak: f[0] },
      explain: `${f[2]}. ${n === 1 ? "" : `${n} of them: ${n} × ${f[1] / n} = ${f[1]}.`} So the answer is ${f[1]}.`,
      hint: "Picture a ruler (a foot of inches), a yardstick (three rulers), and a meter stick (a hundred centimeters).",
    };
  }
  if (variant === 2) {
    const obj = pick(rng, OBJECTS);
    const cm = int(rng, 10, 30);
    const inches = Math.round(cm / 2.5);
    const options = shuffle(rng, ["centimeters", "inches"]);
    return {
      type: "choice",
      prompt: `A ${obj} is measured in centimeters and then in inches. Which measurement gives the BIGGER number?`,
      display: { speak: `A ${obj} is measured in centimeters and then in inches. Which gives the bigger number?` },
      options: options.map((o) => ({ label: o })),
      answerIndex: options.indexOf("centimeters"),
      explain: `A centimeter is smaller than an inch, so it takes MORE centimeters to cover the same ${obj}: about ${cm} cm but only about ${inches} inches. Smaller unit → bigger number.`,
      hint: "Which unit is smaller? You need more of the small unit to measure the same thing.",
    };
  }
  const tools = [
    ["the length of a soccer field", "a measuring tape", ["a ruler", "a cup", "a clock"]],
    ["the length of a crayon", "a ruler", ["a yardstick", "a scale", "a clock"]],
    ["the height of a door", "a yardstick or meter stick", ["a ruler", "a spoon", "a thermometer"]],
    ["around a pony's belly", "a measuring tape", ["a ruler", "a yardstick", "a scale"]],
  ] as const;
  const t = pick(rng, tools);
  return labelChoice(rng, t[1], [...t[2]], {
    prompt: `Which tool is best to measure ${t[0]}?`,
    display: { speak: `Which tool is best to measure ${t[0]}?` },
    explain: `${t[1]} is best for ${t[0]}. Rulers are for short things, yardsticks and meter sticks for medium, and tapes for long or curved things.`,
    hint: "Think about how long the thing is, and whether it is straight or curved.",
  });
};

// ---------------------------------------------------------------------------
// dataPictureGraph — 1.DL.A.1, 2.DL.A-B, 3.DL.B.3
// ---------------------------------------------------------------------------

interface Survey {
  question: string;
  cats: [string, string][];
}

const SURVEYS: Survey[] = [
  { question: "favorite pony color", cats: [["brown", "🐴"], ["white", "🐴"], ["black", "🐴"], ["spotted", "🐴"]] },
  { question: "favorite sport", cats: [["soccer", "⚽"], ["baseball", "⚾"], ["basketball", "🏀"], ["cheer", "📣"]] },
  { question: "favorite fruit", cats: [["apples", "🍎"], ["bananas", "🍌"], ["grapes", "🍇"], ["berries", "🍓"]] },
  { question: "favorite dance", cats: [["ballet", "🩰"], ["tap", "👞"], ["hip hop", "🎧"], ["jazz", "🎷"]] },
  { question: "pets at home", cats: [["dogs", "🐶"], ["cats", "🐱"], ["fish", "🐟"], ["ponies", "🐴"]] },
];

function barGraphSvg(labels: string[], values: number[], scale: number): string {
  const out: string[] = [];
  const maxV = Math.max(...values, 1);
  const top = Math.ceil(maxV / scale) * scale;
  const h = 60;
  const x0 = 16;
  const w = 80 / labels.length;
  out.push(`<line x1="${x0}" y1="10" x2="${x0}" y2="72" stroke="${COLORS.ink}" stroke-width="1"/>`);
  out.push(`<line x1="${x0}" y1="72" x2="98" y2="72" stroke="${COLORS.ink}" stroke-width="1"/>`);
  const gridStep = top / scale > 10 ? scale * 2 : scale;
  for (let v = 0; v <= top; v += gridStep) {
    const y = r1(72 - (v / top) * h);
    out.push(`<line x1="${x0}" y1="${y}" x2="98" y2="${y}" stroke="#e2e8f0" stroke-width="0.6"/>`);
    out.push(svgText(x0 - 3, y + 2, String(v), 5, 'text-anchor="end"'));
  }
  // A label wider than its column (about 2.75 units per letter at size 5, e.g.
  // "basketball" in a 20-unit column) would run into its neighbours: put every
  // other label on a second row.
  const stagger = labels.some((l) => l.length * 2.75 > w * 0.95);
  values.forEach((v, i) => {
    const bh = r1((v / top) * h);
    out.push(`<rect x="${r1(x0 + i * w + w * 0.2)}" y="${r1(72 - bh)}" width="${r1(w * 0.6)}" height="${bh}" fill="${BAR_COLORS[i % BAR_COLORS.length]}"/>`);
    out.push(svgText(x0 + i * w + w / 2, stagger && i % 2 === 1 ? 88 : 80, labels[i], 5));
  });
  return svgWrap(out.join(""));
}

const dataPictureGraph: Generator = (ctx) => {
  const { rng } = ctx;
  const nCats = Math.min(4, numParam(ctx, "categories", 3));
  const max = numParam(ctx, "max", 10);
  const scaled = boolParam(ctx, "scaled", false);
  const mode = strParam(ctx, "mode", "picture");
  const scale = scaled ? pick(rng, [2, 5, 10]) : 1;
  const survey = pick(rng, SURVEYS);
  const cats = sample(rng, survey.cats, nCats);
  const values = cats.map(() => scale * int(rng, 1, Math.max(2, Math.floor(max / (scaled ? 2 : 1)))));
  const labels = cats.map((c) => c[0]);
  // Each row is drawn with its own category's picture (fish 🐟, not fish 🐱).
  const grid: string[][] = cats.map((c, i) => [c[0], c[1].repeat(values[i] / scale)]);
  // One shared picture (every pony row is 🐴) keys as "🐴 = 5"; mixed pictures as "each picture = 5".
  const keyPic = cats.every((c) => c[1] === cats[0][1]) ? cats[0][1] : "each picture";
  if (scaled) grid.push(["Key", `${keyPic} = ${scale}`]);
  const display = mode === "bar" ? { svg: barGraphSvg(labels, values, scale), speak: "Look at the bar graph." } : { grid, speak: "Look at the picture graph." };
  const title = `${pick(rng, KID_NAMES)} asked friends about their ${survey.question}.`;
  if (mode === "question" && rng() < 0.5) {
    const good = [
      "What is the favorite sport in our class?",
      "How many pets do my friends have?",
      "Which pony color do my friends like best?",
      "How many letters are in each friend's name?",
    ];
    // None of these can be answered by asking classmates and counting their answers
    // (a yes/no opinion like "Is ballet fun?" could be — ask everyone, count the yeses).
    const bad = ["How many fish live in the ocean?", "What will happen next year?", "Why is the sky blue?", "How tall will I be when I grow up?"];
    const answer = pick(rng, good);
    return labelChoice(rng, answer, sample(rng, bad, 3), {
      prompt: "Which question can be answered by collecting data from classmates?",
      display: { speak: "Which question can be answered by collecting data from classmates?" },
      explain: `"${answer}" — you can ask each classmate, write down every answer, and count. Data is information we collect to answer a question. The other questions are about the future or about facts your classmates cannot know, so asking them and counting would not answer them.`,
      hint: "Could you ask each friend and write down a countable answer?",
    });
  }
  const variant = int(rng, 0, 3);
  const i = int(rng, 0, cats.length - 1);
  let j = int(rng, 0, cats.length - 1);
  if (j === i) j = (i + 1) % cats.length;
  // "How many more" needs two different counts (equal bars would make it 0).
  if (values[j] === values[i]) {
    const k = values.findIndex((v) => v !== values[i]);
    if (k >= 0) j = k;
  }
  const total = values.reduce((s, v) => s + v, 0);
  const keyNote = scaled ? ` Each picture stands for ${scale}, so count by ${scale}s.` : "";
  const howMany = (): Question => ({
    type: "numeric",
    prompt: `${title} How many chose ${labels[i]}?`,
    answer: values[i],
    display: { ...display, speak: `${title} How many chose ${labels[i]}?` },
    explain: `Find the ${labels[i]} row and count.${keyNote} ${values[i] / scale} pictures${scaled ? ` × ${scale}` : ""} = ${values[i]}.`,
    hint: `Find the row for ${labels[i]}.${scaled ? ` Each picture = ${scale}.` : " Count the pictures."}`,
  });
  if (variant === 0) return howMany();
  if (variant === 1 && values[i] !== values[j]) {
    const hi = values[i] >= values[j] ? i : j;
    const lo = hi === i ? j : i;
    return {
      type: "numeric",
      prompt: `${title} How many more chose ${labels[hi]} than ${labels[lo]}?`,
      answer: values[hi] - values[lo],
      display: { ...display, speak: `${title} How many more chose ${labels[hi]} than ${labels[lo]}?` },
      explain: `${labels[hi]}: ${values[hi]}. ${labels[lo]}: ${values[lo]}. Difference: ${values[hi]} − ${values[lo]} = ${values[hi] - values[lo]}.${keyNote}`,
      hint: "Find both numbers, then subtract the smaller from the bigger.",
    };
  }
  if (variant === 1 || variant === 2) {
    return {
      type: "numeric",
      prompt: `${title} How many friends answered in all?`,
      answer: total,
      display: { ...display, speak: `${title} How many friends answered in all?` },
      explain: `Add every row: ${values.join(" + ")} = ${total}.${keyNote}`,
      hint: "Add the number for every category.",
    };
  }
  const most = rng() < 0.5;
  const target = most ? Math.max(...values) : Math.min(...values);
  const occurs = (v: number) => values.filter((w) => w === v).length;
  if (occurs(target) === 1) {
    const answer = labels[values.indexOf(target)];
    return labelChoice(rng, answer, labels.filter((l) => l !== answer), {
      prompt: `${title} Which was chosen the ${most ? "most" : "least"}?`,
      display: { ...display, speak: `${title} Which was chosen the ${most ? "most" : "least"}?` },
      explain: `The ${most ? "longest" : "shortest"} row is ${answer} with ${target}. ${most ? "Most popular means the biggest" : "Least popular means the smallest"} count.`,
      hint: `Look for the ${most ? "longest" : "shortest"} row.`,
    });
  }
  // The most/least is a tie, so ask about a count only one category has
  // (otherwise two options would be right but only one graded right).
  const unique = values.map((_, k) => k).filter((k) => occurs(values[k]) === 1);
  if (unique.length === 0) return howMany();
  const askIdx = pick(rng, unique);
  const answer = labels[askIdx];
  return labelChoice(rng, answer, labels.filter((l) => l !== answer), {
    prompt: `${title} Which category has ${values[askIdx]}?`,
    display: { ...display, speak: `${title} Which category has ${values[askIdx]}?` },
    explain: `Count each row.${keyNote} Only ${answer} has ${values[askIdx]}.`,
    hint: "Count each row carefully.",
  });
};

// ---------------------------------------------------------------------------
// numberLine — 2.M.B.6 (whole numbers as lengths; sums and differences)
// ---------------------------------------------------------------------------

const numberLine: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 100);
  const variant = int(rng, 0, 3);
  const span = max <= 20 ? max : pick(rng, [20, 50, 100]);
  const step = span <= 20 ? 1 : span <= 50 ? 5 : 10;
  const labelEvery = span <= 20 ? 5 : span <= 50 ? 2 : 1;
  const minor = step === 1 ? 1 : step === 5 ? 1 : 2;
  if (variant === 0) {
    const v = int(rng, 1, span - 1);
    return {
      type: "numeric",
      prompt: "What number does the dot show?",
      answer: v,
      display: { svg: numberLineSvg({ min: 0, max: span, step: step / (step === 10 ? 5 : step === 5 ? 5 : 1) * (step === 1 ? 1 : 1), labelEvery: step === 1 ? labelEvery : step === 5 ? 5 : 5, dots: [{ at: v }] }), speak: "What number does the dot show?" },
      explain: `Find the labelled tick just before the dot, then count the small ticks by ${step === 1 ? 1 : step === 5 ? 1 : 2}s. The dot is at ${v}.`,
      hint: "Start from a labelled number on the left and count the little ticks up to the dot.",
    };
  }
  if (variant === 1) {
    const from = int(rng, 1, span - 5);
    const jump = int(rng, 2, Math.min(span - from, span <= 20 ? 9 : 35));
    return {
      type: "numeric",
      prompt: `Start at ${from} and jump ${jump} to the right. Where do you land?`,
      answer: from + jump,
      display: { svg: numberLineSvg({ min: 0, max: span, step: minor === 2 ? 2 : 1, labelEvery: step === 1 ? 5 : step === 5 ? 5 : 5, dots: [{ at: from, label: String(from) }], jumps: [{ from, to: from + jump, label: `+${jump}` }] }), speak: `Start at ${from} and jump ${jump} to the right. Where do you land?` },
      explain: `A jump to the right is adding: ${from} + ${jump} = ${from + jump}. The number line shows the sum as a length from 0.`,
      hint: "Jumping right means adding. Add the jump to the start number.",
    };
  }
  if (variant === 2) {
    const from = int(rng, 5, span);
    let jump = int(rng, 2, Math.min(from, span <= 20 ? 9 : 35));
    if (from - jump === jump) jump -= 1;
    return {
      type: "numeric",
      prompt: `Start at ${from} and jump ${jump} to the left. Where do you land?`,
      answer: from - jump,
      display: { svg: numberLineSvg({ min: 0, max: span, step: minor === 2 ? 2 : 1, labelEvery: step === 1 ? 5 : 5, dots: [{ at: from, label: String(from) }], jumps: [{ from, to: from - jump, label: `−${jump}` }] }), speak: `Start at ${from} and jump ${jump} to the left. Where do you land?` },
      explain: `A jump to the left is subtracting: ${from} − ${jump} = ${from - jump}.`,
      hint: "Jumping left means taking away. Subtract the jump from the start number.",
    };
  }
  let a = int(rng, 1, span - 3);
  let b = int(rng, a + 2, span);
  if (b - a === a) {
    if (b < span) b += 1;
    else a -= 1;
  }
  return {
    type: "numeric",
    prompt: `How far is it from ${a} to ${b} on the number line?`,
    answer: b - a,
    display: { svg: numberLineSvg({ min: 0, max: span, step: minor === 2 ? 2 : 1, labelEvery: step === 1 ? 5 : 5, dots: [{ at: a, label: String(a) }, { at: b, label: String(b), color: COLORS.blue }] }), speak: `How far is it from ${a} to ${b} on the number line?` },
    explain: `The distance between two numbers is their difference: ${b} − ${a} = ${b - a}. You can also count up from ${a} to ${b}.`,
    hint: `Count up from ${a} to ${b}, or subtract.`,
  };
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  countObjects,
  whatComesNext,
  whatComesBefore,
  whatComesBetween,
  countOnFrom,
  skipCount,
  compareNumbers,
  tenFrameAdd,
  tenFrameSub,
  makeTen,
  doublesNearDoubles,
  missingAddend,
  countOnAdd,
  addProperties,
  equationTrueFalse,
  threeAddends,
  addSubFacts,
  tenMoreLess,
  placeValueTensOnes,
  expandedForm,
  add2Digit,
  sub2Digit,
  add3Digit,
  sub3Digit,
  oddEven,
  arraysRepeatedAddition,
  equalGroupsIntro,
  timeHourHalf,
  timeFiveMinutes,
  coinsValue,
  lengthCompare,
  lengthMeasureUnits,
  shapesAttributes,
  halvesQuarters,
  wordProblemJoinSeparateCompare,
  measurementUnits,
  dataPictureGraph,
  numberLine,
};

