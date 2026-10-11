/**
 * Reasoning ("Brain" block) skill catalog — CogAT-style format familiarity + real
 * thinking, split by learner: level-1 skills (track "lily", grade 1, pictorial,
 * read aloud) and level-3 skills (track "cole", grade 3, text, two-step rules).
 *
 * Each skill names a generator from ./generators/reasoning.ts and passes
 * `params.level` (1 or 3) plus any variant params. Standards carry the CogAT
 * battery/subtest label the format comes from, plus an NJSLS practice or
 * language code where it fits. Prereqs run simple → complex within a battery
 * so the Brain block can rotate batteries across the week.
 *
 * The lead spreads REASONING_SKILLS into CATALOG (./catalog.ts).
 */

import type { Skill } from "./types";

const EST = 6;

function lily(s: Omit<Skill, "subject" | "grade" | "track" | "estMinutes" | "testOut">): Skill {
  return { subject: "reasoning", grade: 1, track: "lily", estMinutes: EST, testOut: false, ...s, params: { level: 1, ...(s.params ?? {}) } };
}

function cole(s: Omit<Skill, "subject" | "grade" | "track" | "estMinutes" | "testOut">): Skill {
  return { subject: "reasoning", grade: 3, track: "cole", estMinutes: EST, testOut: false, ...s, params: { level: 3, ...(s.params ?? {}) } };
}

// ---------------------------------------------------------------------------
// Lily — level 1 (CogAT Level 8 formats: pictorial, untimed, read aloud)
// ---------------------------------------------------------------------------

const LILY: Skill[] = [
  // ---- Quantitative ------------------------------------------------------
  lily({
    id: "r1.series",
    title: "Number series: count on by 1s and 2s",
    kidTitle: "Bead Pattern Detective",
    standards: ["CogAT:Quantitative:NumberSeries", "MP.7", "MP.8"],
    prereqs: [],
    generator: "r.numberSeries",
    params: { steps: [1, 2], max: 20 },
    parentTip: "Have her say the numbers out loud and tap the beads. Ask 'how many more each time?' before she picks.",
    intro: [
      "Look at the strings of beads. Each string has a few more beads than the one before. Find the jump!",
      "Then pick the number of beads that comes next.",
      "Example: 2, 4, 6, 8 — the jump is +2, so next comes 10.",
    ],
  }),
  lily({
    id: "r1.series.skip",
    title: "Number series: skip count by 5s and 10s",
    kidTitle: "Skip-Count Rocket",
    standards: ["CogAT:Quantitative:NumberSeries", "1.NBT.C.5", "MP.8"],
    prereqs: ["r1.series"],
    generator: "r.numberSeries",
    params: { steps: [2, 5, 10] },
    parentTip: "Skip-count together on a hundred chart first (5, 10, 15…). Then ask what the jump is in the puzzle.",
    intro: [
      "These patterns jump by 5 or by 10. Say the numbers out loud like a song: 5, 10, 15, 20…",
      "Find the jump, then keep jumping one more time.",
      "Example: 10, 20, 30, 40 — the jump is +10, so next comes 50.",
    ],
  }),
  lily({
    id: "r1.num.analogies",
    title: "Number analogies (picture counts)",
    kidTitle: "Copy-the-Change Pictures",
    standards: ["CogAT:Quantitative:NumberAnalogies", "1.OA.A.1", "MP.7"],
    prereqs: ["r1.series"],
    generator: "r.numberAnalogies",
    parentTip: "Point to the top row: 'What happened to the apples?' She must say the change (one more, double…) before touching an answer.",
    intro: [
      "The top row shows a change: a group of pictures turns into a new group. Figure out what happened — one more? two less? double?",
      "Then do the SAME change to the bottom row. When there are two example rows, the change must work for both of them.",
      "Example: 3 apples → 5 apples is 'two more'. So 1 fish → 3 fish.",
    ],
  }),
  lily({
    id: "r1.num.puzzles",
    title: "Number puzzles: balance scales and trains",
    kidTitle: "Balance It!",
    standards: ["CogAT:Quantitative:NumberPuzzles", "1.OA.D.8", "MP.2"],
    prereqs: ["r1.num.analogies"],
    generator: "r.numberPuzzles",
    parentTip: "Use real cubes on a kitchen scale or two hands: 'both sides must be the same'. Count on from the smaller number.",
    intro: [
      "A balance scale is even when both sides have the same amount. One side has a mystery number ?.",
      "Count on from the number you know until you reach the other side.",
      "Example: ? + 3 = 7. Count from 3 up to 7: 4, 5, 6, 7 — that is 4 counts, so ? is 4.",
    ],
  }),

  // ---- Nonverbal ---------------------------------------------------------
  lily({
    id: "r1.pattern",
    title: "Pattern completion (ABAB, AABB)",
    kidTitle: "What Comes Next?",
    standards: ["CogAT:Nonverbal:FigureSeries", "MP.7"],
    prereqs: [],
    generator: "r.patternCompletion",
    parentTip: "Clap the pattern together (clap-stomp-clap-stomp). Ask 'where does it start over?' then let her pick.",
    intro: [
      "A pattern is a little group that repeats over and over: apple, banana, apple, banana…",
      "Find the group that repeats, then say what comes next.",
      "Example: 🍎 🍌 🍎 🍌 🍎 — after apple comes banana.",
    ],
  }),
  lily({
    id: "r1.fig.class",
    title: "Figure classification (what do these three share?)",
    kidTitle: "Shape Club",
    standards: ["CogAT:Nonverbal:FigureClassification", "1.G.A.1", "MP.7"],
    prereqs: ["r1.pattern"],
    generator: "r.figureClassification",
    parentTip: "Ask 'what is the same about all three?' — shape, color, filled-in, or size. Only ONE thing is the same for all of them.",
    intro: [
      "Three pictures are in a club. They all share one secret: maybe they are all triangles, or all blue, or all filled in.",
      "Find the secret, then pick the picture that can join the club.",
      "Example: a big blue heart, a small orange heart, an empty pink heart — the secret is 'hearts', so another heart joins.",
    ],
  }),
  lily({
    id: "r1.matrix",
    title: "Figure matrix (2×2 picture rules)",
    kidTitle: "Shape Puzzle Box",
    standards: ["CogAT:Nonverbal:FigureMatrices", "MP.7"],
    prereqs: ["r1.fig.class"],
    generator: "r.figureMatrix",
    parentTip: "Say the rule out loud: 'Across, it turns. Down, it changes color.' Then do the same thing to the bottom-left picture.",
    intro: [
      "The box has four spaces and one is empty. Look across the top row: how did the first picture change into the second?",
      "Now make the SAME change to the bottom-left picture to find the missing one.",
      "Example: top row is a white star → a blue star. Bottom-left is a white heart, so the missing picture is a blue heart.",
    ],
  }),
  lily({
    id: "r1.fig.series",
    title: "Figure series (what picture comes next?)",
    kidTitle: "Shape Parade",
    standards: ["CogAT:Nonverbal:FigureSeries", "MP.8"],
    prereqs: ["r1.pattern"],
    generator: "r.figureSeries",
    parentTip: "Cover all but the first two pictures: 'what changed?' Check the change happens again, then ask for the next one.",
    intro: [
      "The pictures march in a row, and each one changes the same way as the one before: turning, changing color, or getting bigger.",
      "Spot the change, then do it one more time.",
      "Example: an arrow turns a little to the right each time — the next arrow turns once more.",
    ],
  }),
  lily({
    id: "r1.fold",
    title: "Paper folding (one fold, one hole)",
    kidTitle: "Hole-Punch Magic",
    standards: ["CogAT:Nonverbal:PaperFolding", "1.G.A.3", "MP.4"],
    prereqs: ["r1.matrix"],
    generator: "r.paperFolding",
    params: { folds: 1, punches: 1 },
    parentTip: "Do it for real: fold a scrap of paper once, punch, PREDICT, then open. Ten real folds beat any worksheet.",
    intro: [
      "A square of paper gets folded in half, then a hole is punched through both layers.",
      "When you open it, the hole shows up twice: once where you punched, and once as a mirror twin across the fold line.",
      "Example: fold left onto right and punch near the top right — opened up, there is a hole at the top right AND the top left.",
    ],
  }),

  // ---- Verbal ------------------------------------------------------------
  lily({
    id: "r1.verbal.class",
    title: "Picture classification (which one goes with these?)",
    kidTitle: "Which Goes Together?",
    standards: ["CogAT:Verbal:PictureClassification", "L.1.5"],
    prereqs: [],
    generator: "r.verbalClassification",
    parentTip: "Ask her to NAME the group ('these are all fruits') before she picks. Naming the rule is the skill.",
    intro: [
      "Three things go together because they are the same kind: a lion, a bear and a wolf are all wild animals.",
      "Say what kind they are, then pick the picture that is the same kind.",
      "Example: a fork, a cup and a bowl are kitchen things — so a pan goes with them, not a shoe.",
    ],
  }),
  lily({
    id: "r1.verbal.analogies",
    title: "Picture analogies (A is to B as C is to ?)",
    kidTitle: "Go-Together Pairs",
    standards: ["CogAT:Verbal:PictureAnalogies", "L.1.5"],
    prereqs: ["r1.verbal.class"],
    generator: "r.verbalAnalogies",
    parentTip: "Play 'analogy tennis' in the car: 'cow is to moo as sheep is to…?' Have her explain WHY the pair goes together.",
    intro: [
      "Two things go together in a special way: a pig says 'oink'. Then a new thing needs its partner in the SAME way.",
      "Say the way they go together, then find the partner.",
      "Example: pig is to oink as duck is to… quack, because that is the sound a duck makes.",
    ],
  }),
  lily({
    id: "r1.sentence",
    title: "Sentence completion (listen and choose)",
    kidTitle: "Listen & Pick",
    standards: ["CogAT:Verbal:SentenceCompletion", "L.1.5", "SL.1.2"],
    prereqs: ["r1.verbal.class"],
    generator: "r.sentenceCompletion",
    parentTip: "Tap the speaker so the question is read aloud. Ask her to repeat the important words before choosing.",
    intro: [
      "Listen to the question. Think about every word, then pick the picture that answers it.",
      "Some answers are tricky: they look nice but do not fit ALL the words.",
      "Example: 'Which one do you use to dig in the sand?' — a shovel, not a pillow.",
    ],
  }),

  // ---- Spatial / logic extras -------------------------------------------
  lily({
    id: "r1.odd",
    title: "Odd one out (picture sets)",
    kidTitle: "One of These Is Different",
    standards: ["CogAT:Verbal:PictureClassification", "L.1.5"],
    prereqs: [],
    generator: "r.oddOneOut",
    parentTip: "Have her name all four pictures first. Then: 'Which three are the same kind of thing?'",
    intro: [
      "Four pictures — three are the same kind of thing and one is a different kind.",
      "Name them all, find the three that match, and the leftover one is the odd one out.",
      "Example: car, bus, bike, apple — the apple is food, the others are things you ride.",
    ],
  }),
  lily({
    id: "r1.sudoku",
    title: "Mini sudoku with pictures (4×4)",
    kidTitle: "Picture Sudoku",
    standards: ["CogAT:Quantitative:NumberPuzzles", "MP.1", "MP.7"],
    prereqs: ["r1.odd"],
    generator: "r.sudoku4",
    params: { symbols: "emoji" },
    parentTip: "Trace the ?'s row with a finger, then its column: 'which picture is missing from both?'",
    intro: [
      "Every row and every column must have each picture exactly once — no repeats!",
      "Look along the ?'s row and down its column and cross off the pictures you see. The one left over goes in the ? box.",
      "Example: the row has 🍎 🍌 🍇 — so the ? must be 🍓.",
    ],
  }),
  lily({
    id: "r1.logic",
    title: "Logic clues (who has which pet?)",
    kidTitle: "Pet Detective",
    standards: ["CogAT:Verbal:SentenceCompletion", "MP.1", "SL.1.2"],
    prereqs: ["r1.sentence"],
    generator: "r.logicGrid",
    parentTip: "Read the clues one at a time. After each clue ask 'so what do we know now?' and cross out what cannot be true.",
    intro: [
      "Three kids each have a different pet. One clue tells you who has a pet for sure; the other tells you who does NOT have one.",
      "Cross out what cannot be true. When only one choice is left for a kid, that is their pet.",
      "Example: 'Ava has the dog. Ben does not have the cat.' — so Ben has the fish, and Cara has the cat.",
    ],
  }),
];

// ---------------------------------------------------------------------------
// Cole — level 3 (CogAT Level 9-11 formats: text, timed, two-step rules)
// ---------------------------------------------------------------------------

const COLE: Skill[] = [
  // ---- Quantitative ------------------------------------------------------
  cole({
    id: "r3.series",
    title: "Number series: add, subtract, double, growing jumps",
    kidTitle: "Series Sleuth",
    standards: ["CogAT:Quantitative:NumberSeries", "MP.7", "MP.8"],
    prereqs: [],
    generator: "r.numberSeries",
    params: { kinds: ["add", "sub", "double", "growing", "squares"] },
    parentTip: "Have him write the jump between each pair of numbers above the list. If the jumps are not equal, look for a pattern in the jumps.",
    intro: [
      "A number series follows a rule. Write the jump between each pair of numbers — same jump every time? growing jumps? doubling?",
      "Test your rule on EVERY step before you answer.",
      "Example: 2, 3, 5, 8, 12 — jumps are +1, +2, +3, +4, so next is +5: 17.",
    ],
  }),
  cole({
    id: "r3.series.adv",
    title: "Number series: alternating and interleaved patterns",
    kidTitle: "Double-Agent Series",
    standards: ["CogAT:Quantitative:NumberSeries", "MP.7", "MP.8"],
    prereqs: ["r3.series"],
    generator: "r.numberSeries",
    params: { kinds: ["alternate", "interleave", "shrinking", "fib", "sub", "double"] },
    parentTip: "When the jumps go up-down-up-down, there may be two patterns taking turns. Circle every other number.",
    intro: [
      "Some series hide TWO patterns taking turns, or jumps that alternate (+5, −2, +5, −2).",
      "Circle every other number and check each set on its own.",
      "Example: 10, 9, 11, 10, 12, 11 — the 1st, 3rd, 5th go 10, 11, 12 and the others go 9, 10, 11. Next is 13.",
    ],
  }),
  cole({
    id: "r3.num.analogies",
    title: "Number analogies ([3→6] [5→10] [7→?])",
    kidTitle: "Rule Machine",
    standards: ["CogAT:Quantitative:NumberAnalogies", "3.OA.D.9", "MP.8"],
    prereqs: ["r3.series"],
    generator: "r.numberAnalogies",
    parentTip: "Play 'function machine': you are the machine, he feeds in numbers and guesses the rule. Rules must work for BOTH pairs.",
    intro: [
      "Each pair of numbers follows the same secret rule: [3 → 6] [5 → 10] could be 'add 3'… but check the second pair: 5 + 3 is 8, not 10. So the rule is 'times 2'.",
      "A rule only counts if it works for BOTH pairs.",
      "Example: [4 → 12] [5 → 15] [7 → ?] — the rule is ×3, so 7 → 21.",
    ],
  }),
  cole({
    id: "r3.num.puzzles",
    title: "Number puzzles: missing numbers in equations",
    kidTitle: "Equation Cracker",
    standards: ["CogAT:Quantitative:NumberPuzzles", "3.OA.A.4", "MP.2"],
    prereqs: ["r3.num.analogies"],
    generator: "r.numberPuzzles",
    params: { kinds: ["missing", "missing", "same-blank"] },
    parentTip: "Say 'undo it': the opposite of +7 is −7, the opposite of ×5 is ÷5. Always check by putting the answer back in.",
    intro: [
      "An equation has a missing number. Undo the operation to find it: the opposite of + is −, the opposite of × is ÷.",
      "Then check your answer by putting it back into the equation.",
      "Example: ? × 5 = 35. Undo ×5 with ÷5: 35 ÷ 5 = 7. Check: 7 × 5 = 35.",
    ],
  }),
  cole({
    id: "r3.num.puzzles.two",
    title: "Number puzzles: two equations with shapes",
    kidTitle: "Shape Equations",
    standards: ["CogAT:Quantitative:NumberPuzzles", "3.OA.D.8", "MP.1"],
    prereqs: ["r3.num.puzzles"],
    generator: "r.numberPuzzles",
    params: { kinds: ["two-eq", "two-eq", "substitute"] },
    parentTip: "Ask 'which equation can you solve by itself?' Solve that one first, then carry the answer into the other one.",
    intro: [
      "Shapes stand for numbers. Two equations, two shapes. Find the equation you can solve alone — usually the one with only one kind of shape.",
      "Then use that number in the other equation.",
      "Example: ■ + ■ = 10, so ■ = 5. Then ■ − ● = 2 means 5 − ● = 2, so ● = 3.",
    ],
  }),

  // ---- Nonverbal ---------------------------------------------------------
  cole({
    id: "r3.fig.class",
    title: "Figure classification (3 share a rule; pick the 4th)",
    kidTitle: "Rule Finder",
    standards: ["CogAT:Nonverbal:FigureClassification", "MP.7"],
    prereqs: [],
    generator: "r.figureClassification",
    params: { variant: "belongs" },
    parentTip: "Have him list what is the same AND what is different about the three. The rule is the one thing that never changes.",
    intro: [
      "Three figures share exactly one rule — same shape, filling, color, size, number of copies, which way arrows or triangles point, or curved vs straight.",
      "Ignore everything that changes; the rule is what stays the same. Then pick the figure that follows it.",
      "Example: a solid blue arrow, a solid pink circle, a solid orange star — the rule is 'solid', so a solid heart belongs.",
    ],
  }),
  cole({
    id: "r3.fig.class.odd",
    title: "Figure classification: which does not belong?",
    kidTitle: "Rule Breaker",
    standards: ["CogAT:Nonverbal:FigureClassification", "MP.7"],
    prereqs: ["r3.fig.class"],
    generator: "r.figureClassification",
    params: { variant: "odd" },
    parentTip: "Flip the question: 'what rule do THREE of them follow?' The leftover one is the answer.",
    intro: [
      "Four figures — three follow a rule and one breaks it.",
      "Find the rule three of them share; the odd one is the one that breaks it.",
      "Example: three small figures and one big one — the big one does not belong.",
    ],
  }),
  cole({
    id: "r3.matrix",
    title: "Figure matrix (3×3, two rules at once)",
    kidTitle: "Matrix Master",
    standards: ["CogAT:Nonverbal:FigureMatrices", "MP.7"],
    prereqs: ["r3.fig.class"],
    generator: "r.figureMatrix",
    parentTip: "Two rules: one ACROSS the rows and one DOWN the columns. Have him say both rules before looking at the choices.",
    intro: [
      "A 3×3 grid with one empty corner. One rule works across every row and another works down every column: turn, flip, fill, size, number, shape or color.",
      "Find both rules, then apply them to reach the empty cell.",
      "Example: across, shapes get darker; down, they turn a quarter turn. The missing one is the darkest, most-turned version.",
    ],
  }),
  cole({
    id: "r3.fig.series",
    title: "Figure series (two changes per step)",
    kidTitle: "Shape Marcher",
    standards: ["CogAT:Nonverbal:FigureSeries", "MP.8"],
    prereqs: ["r3.matrix"],
    generator: "r.figureSeries",
    parentTip: "Sometimes two things change at once (turning AND filling). Check each attribute separately: shape? color? turn? fill?",
    intro: [
      "Each figure changes from the one before — sometimes in two ways at once (turn and change color).",
      "Check one attribute at a time: direction, filling, size, color, shape, number of copies.",
      "Example: an L turns a quarter turn each step and flips between empty and solid — the next one is turned again AND switched.",
    ],
  }),
  cole({
    id: "r3.fold",
    title: "Paper folding (two folds, diagonal folds)",
    kidTitle: "Fold & Punch Pro",
    standards: ["CogAT:Nonverbal:PaperFolding", "3.G.A.2", "MP.4"],
    prereqs: ["r3.matrix"],
    generator: "r.paperFolding",
    params: { folds: 2, punches: 1 },
    parentTip: "Real paper, real hole punch, predict BEFORE unfolding. Count layers: two folds = four layers = four holes per punch.",
    intro: [
      "The paper is folded twice, then punched. Every fold doubles the layers, so two folds mean each punch makes FOUR holes.",
      "Undo the last fold first (mirror the holes across its line), then undo the first fold.",
      "Example: fold left-onto-right, then top-onto-bottom, punch once — opened up, there is one hole in each quarter, all mirror images.",
    ],
  }),
  cole({
    id: "r3.fold.two",
    title: "Paper folding (two folds, two punches)",
    kidTitle: "Eight-Hole Challenge",
    standards: ["CogAT:Nonverbal:PaperFolding", "MP.4"],
    prereqs: ["r3.fold"],
    generator: "r.paperFolding",
    params: { folds: 2, punches: 2 },
    parentTip: "Count first: 2 punches × 4 layers = 8 holes. Eliminate any choice with the wrong count before checking positions.",
    intro: [
      "Two folds and two punches: 2 × 4 = 8 holes. Count the holes in each choice first to throw out wrong ones fast.",
      "Then check that every hole has its mirror twin across each fold line.",
      "Example: both punches near the folded corner open into a tight cluster of 8 holes around the middle.",
    ],
  }),

  // ---- Verbal ------------------------------------------------------------
  cole({
    id: "r3.verbal.class",
    title: "Verbal classification (three words share a group)",
    kidTitle: "Word Groups",
    standards: ["CogAT:Verbal:VerbalClassification", "L.3.5"],
    prereqs: [],
    generator: "r.verbalClassification",
    parentTip: "Insist he names the category precisely ('metals', not 'shiny things'). A vague category lets wrong answers sneak in.",
    intro: [
      "Three words belong to one group: tulip, rose, daisy are flowers. Name the group as exactly as you can.",
      "Then pick the word that fits that exact group — not just a word that is related.",
      "Example: tulip, rose, daisy → lily (a flower). 'Vase' holds flowers but is not a flower.",
    ],
  }),
  cole({
    id: "r3.verbal.analogies",
    title: "Verbal analogies (A : B :: C : ?)",
    kidTitle: "Analogy Ace",
    standards: ["CogAT:Verbal:VerbalAnalogies", "L.3.5"],
    prereqs: ["r3.verbal.class"],
    generator: "r.verbalAnalogies",
    parentTip: "Have him turn the first pair into a sentence ('a petal is part of a flower'), then test each choice in the same sentence.",
    intro: [
      "Read the first pair and say how they go together: part of, kind of, used for, opposite of, baby of, maker of…",
      "Then finish the second pair in exactly the same way.",
      "Example: poet : poem :: chef : meal — a poet makes a poem, a chef makes a meal.",
    ],
  }),
  cole({
    id: "r3.sentence",
    title: "Sentence completion (context clues)",
    kidTitle: "Fill the Gap",
    standards: ["CogAT:Verbal:SentenceCompletion", "L.3.4.A"],
    prereqs: ["r3.verbal.class"],
    generator: "r.sentenceCompletion",
    parentTip: "Point out signal words: 'because' gives a reason, 'even though' signals a surprise, 'so' gives a result.",
    intro: [
      "One word is missing. Every other word in the sentence is a clue — especially signal words like 'because', 'but', 'even though' and 'so'.",
      "Try each choice in the gap and keep the one that fits ALL the clues.",
      "Example: 'Even though the movie was ___, Jack stayed awake until the very end.' — 'even though' signals a surprise, so the answer is 'boring'.",
    ],
  }),

  // ---- Spatial / logic extras -------------------------------------------
  cole({
    id: "r3.rotation",
    title: "Mental rotation (turned, not flipped)",
    kidTitle: "Spin It, Don't Flip It",
    standards: ["CogAT:Nonverbal:FigureMatrices", "3.G.A.1", "MP.7"],
    prereqs: ["r3.fig.class"],
    generator: "r.mentalRotation",
    parentTip: "Cut an L from paper. Show that spinning it on the table never makes its mirror image — you would have to flip it over.",
    intro: [
      "One figure is shown. Which choice is the SAME figure just spun around? The others are flipped over (mirror images).",
      "A spin keeps the shape's 'handedness': an L stays an L, it never becomes a backwards L.",
      "Example: an L turned upside down is still an L; a backwards L is a flip, not a turn.",
    ],
  }),
  cole({
    id: "r3.sudoku",
    title: "Mini sudoku 1-4 (fill the marked cell)",
    kidTitle: "Sudoku Sprint",
    standards: ["CogAT:Quantitative:NumberPuzzles", "MP.1", "MP.7"],
    prereqs: ["r3.num.puzzles"],
    generator: "r.sudoku4",
    params: { symbols: "digits" },
    parentTip: "Three checks: the ?'s row, its column, and its 2×2 box. The number missing from all three is the answer.",
    intro: [
      "Every row, every column AND every 2×2 box must contain 1, 2, 3, 4 exactly once.",
      "Cross off every number you can see in the ?'s row, column and box. What is left is the answer.",
      "Example: the row has 1 and 4, the column has 2 — so the ? must be 3.",
    ],
  }),
  cole({
    id: "r3.logic",
    title: "Logic grid (three clues, who has which?)",
    kidTitle: "Clue Cruncher",
    standards: ["CogAT:Verbal:SentenceCompletion", "MP.1", "MP.3"],
    prereqs: ["r3.verbal.class"],
    generator: "r.logicGrid",
    parentTip: "Draw a 3×3 chart (kids across, pets down). Put an X for every 'not'. A row with one blank left is solved.",
    intro: [
      "Three kids, three pets, three clues — mostly 'not' clues. Make a chart and X out what cannot be true.",
      "When a kid has only one pet left, or a pet has only one kid left, fill it in and keep going.",
      "Example: 'Ava does not have the dog. Neither Ava nor Ben has the fish.' — so Ava has the cat, Ben has the dog, Cara has the fish.",
    ],
  }),
];

export const REASONING_SKILLS: Skill[] = [...LILY, ...COLE];
