/**
 * Lily's phonics, sight-word and reading skills (grade 1 → 2), track "lily".
 *
 * Phonics skills run on PHONICS_STAGES through generators/phonics.ts; reading
 * skills on LILY_PASSAGES through the same file. The lead spreads
 * LILY_READING_SKILLS into CATALOG (./catalog.ts) and registers
 * generators/phonics.ts in generators/index.ts.
 *
 * Per stage (22 stages, in scope-and-sequence order):
 *   <p>.<stage>.read     ph.wordPicture   read the word, tap the picture      (testOut)
 *   <p>.<stage>.build    ph.buildWord     build the pictured word from tiles
 *   <p>.<stage>.sounds   ph.segmentSounds (odd stages) / ph.missingSound (even stages)   (testOut)
 *   <p>.<stage>.sentence ph.sentenceRead  every third stage: read a sentence, tap the scene
 * where <p> is p1 for the grade-1 stages (1-16) and p2 for the grade-2 stages (17-22).
 * Chain: read → build → sounds; the next stage's read requires this stage's build.
 *
 * Plus: p1.pa.rhyme / p1.pa.sounds (phonemic awareness), sw.g1..sw.g6 (Fry 1-60 heart
 * words, ten per group) and rd1.listen / rd1.early / rd1.passage / rd1_5.passage /
 * rd2.passage / rd2.listen (decodable passages; the listen skills speak the passage).
 * The first and only root skill is p1.cvc-a.read.
 */

import type { Skill } from "./types";
import { PHONICS_STAGES } from "./content/phonics-lily";

interface StageMeta {
  /** playful child-facing name */
  kid: string;
  /** one worked example the parent can read aloud */
  example: string;
  /** how to coach this stage */
  tip: string;
}

const STAGE_META: Record<string, StageMeta> = {
  "cvc-a": { kid: "Short a words", example: "Example: c-a-t. Say each sound slowly, then blend: cat.", tip: "Have her touch each letter and say its sound, then slide her finger under the word to blend. Say sounds slowly; never give the whole word." },
  "cvc-i": { kid: "Short i words", example: "Example: p-i-g. Tap it on your fingers, then blend: pig.", tip: "If she says the wrong vowel, ask 'Is it /a/ like apple or /i/ like itch?' and let her fix it herself." },
  "cvc-o": { kid: "Short o words", example: "Example: h-o-t. Open your mouth wide for /o/, then blend: hot.", tip: "Mix in old words (cat, pig) so she chooses the vowel instead of guessing the pattern of the day." },
  "cvc-u": { kid: "Short u words", example: "Example: s-u-n. Say /u/ like up, then blend: sun.", tip: "When she pauses, give the first sound only, never the word. Let her finish." },
  "cvc-e": { kid: "Short e words", example: "Example: b-e-d. Say /e/ like Ed, then blend: bed.", tip: "e and i sound close. Have her feel her mouth: /e/ is a little more open than /i/." },
  digraphs: { kid: "Sound Buddies: sh, ch, th", example: "Example: sh-i-p. Two letters, one sound, then blend: ship.", tip: "Cover the digraph with a finger and ask 'What sound do these two letters make together?' before she reads the rest." },
  floss: { kid: "Double Trouble: ff, ll, ss, zz", example: "Example: h-i-ll. The two l's make one sound: hill.", tip: "Remind her the doubled letter is one sound. For spelling, ask 'Is it a short vowel? Then f, l, s or z gets doubled at the end.'" },
  "blends-beginning": { kid: "Starting Blends", example: "Example: f-l-a-g. Say both sounds in the blend, then blend: flag.", tip: "Blends keep both sounds. Have her say the first two sounds quickly together before adding the vowel: fl-a-g." },
  "blends-ending": { kid: "Ending Blends", example: "Example: n-e-s-t. Both end sounds are there: nest.", tip: "End blends get dropped (nes for nest). Ask 'What is the last sound you hear?' and have her check the last letter." },
  "magic-e-a": { kid: "Magic e!", example: "Example: cap becomes cape. The e is silent and makes a say its name.", tip: "Show the pair cap / cape and let her say both. 'Is there a magic e at the end? Then the a says its name.'" },
  "magic-e-i-o-u-e": { kid: "More Magic e", example: "Example: kit becomes kite, hop becomes hope, cub becomes cube.", tip: "Same move for every vowel: look for the e at the end first, then read the vowel with its name." },
  "open-closed-syllables": { kid: "Syllable Snap", example: "Example: sun + set = sunset. Read each small part, then snap them together.", tip: "Cover one syllable at a time with your thumb. She reads the first part, then the second, then says them fast." },
  "vowel-team-ai-ay": { kid: "Vowel Teams: ai, ay", example: "Example: r-ai-n. Two vowels, one long a sound: rain.", tip: "Underline the vowel team as one unit. ai sits in the middle of a word and ay at the end." },
  "vowel-team-ee-ea": { kid: "Vowel Teams: ee, ea", example: "Example: f-ee-t. The team says long e: feet.", tip: "Say 'two vowels, one sound' and have her say the long e before blending the whole word." },
  "vowel-team-oa-ow-oe": { kid: "Vowel Teams: oa, ow, oe", example: "Example: b-oa-t. The team says long o: boat.", tip: "ow can say long o (snow) or ow (cow). At this stage read it as long o; if the word sounds silly, try the other one." },
  "long-i-igh-y": { kid: "Sneaky igh and y", example: "Example: n-igh-t. igh says long i: night. fl-y: y says long i at the end of a little word.", tip: "Three letters igh make one sound. At the end of a longer word (happy) the y says long e." },
  "r-controlled-ar": { kid: "Bossy r: ar", example: "Example: c-ar. The r bosses the a: car.", tip: "Have her say 'ar like a pirate' when she sees ar. Read ar as one chunk, never a then r." },
  "r-controlled-or": { kid: "Bossy r: or", example: "Example: c-or-n. or says /or/: corn.", tip: "Point to the or chunk and ask 'What does bossy r make the o say?' before she blends." },
  "r-controlled-er-ir-ur": { kid: "Bossy r: er, ir, ur", example: "Example: b-ir-d. ir says /er/: bird. her, bird and turn all share one sound.", tip: "Three spellings, one sound. For reading that is easy; for spelling, say 'her / bird / turn: which family?'" },
  diphthongs: { kid: "Slide Sounds: ou, oi, aw", example: "Example: c-ou-ch. ou slides: couch. b-oy: boy. s-aw: saw.", tip: "These vowels slide from one sound to another. Have her say 'ouch!' for ou/ow and 'boy' for oi/oy." },
  "soft-c-g": { kid: "Soft c and g", example: "Example: i-c-e. c before e says /s/: ice. c-a-g-e: g before e says /j/: cage.", tip: "Ask 'What letter comes after the c (or g)?' If it is e, i or y, the sound goes soft." },
  "suffixes-ed-ing": { kid: "Word Endings: -ed, -ing", example: "Example: jump + ed = jumped (then). hop + ing = hopping (now, with a doubled p).", tip: "Cover the ending, read the base word, then add the ending. -ed can sound like /t/ (jumped), /d/ (played) or /ed/ (melted)." },
};

const SENTENCE_EVERY = 3;

function prefixFor(order: number): string {
  return order <= 16 ? "p1" : "p2";
}

function gradeFor(order: number): number {
  return order <= 16 ? 1 : 2;
}

function exampleWords(stage: (typeof PHONICS_STAGES)[number]): string {
  const withEmoji = stage.words.filter((w) => w.emoji).slice(0, 4).map((w) => w.word);
  const list = withEmoji.length >= 3 ? withEmoji : stage.words.slice(0, 4).map((w) => w.word);
  return list.join(", ");
}

function stageSkills(): Skill[] {
  const stages = PHONICS_STAGES.slice().sort((a, b) => a.order - b.order);
  const out: Skill[] = [];
  let prevBuild: string | null = null;
  for (const stage of stages) {
    const meta = STAGE_META[stage.id] ?? { kid: stage.title, example: stage.rule, tip: "Say the sounds slowly and let her blend. Never give the whole word." };
    const p = prefixFor(stage.order);
    const grade = gradeFor(stage.order);
    const base = `${p}.${stage.id}`;
    const standards = stage.standards && stage.standards.length > 0 ? stage.standards : ["L.RF.1.3"];
    const intro = [stage.rule, `Words to try: ${exampleWords(stage)}.`, meta.example];
    const common = { subject: "phonics" as const, grade, standards, track: "lily" as const, estMinutes: 6, intro };
    out.push({
      ...common,
      id: `${base}.read`,
      title: `${stage.title}: read the word`,
      kidTitle: `${meta.kid}: Read It`,
      prereqs: prevBuild ? [prevBuild] : [],
      generator: "ph.wordPicture",
      params: { stage: stage.id },
      testOut: true,
      parentTip: meta.tip,
    });
    out.push({
      ...common,
      id: `${base}.build`,
      title: `${stage.title}: build the word`,
      kidTitle: `${meta.kid}: Build It`,
      prereqs: [`${base}.read`],
      generator: "ph.buildWord",
      params: { stage: stage.id },
      testOut: false,
      parentTip: `Have her say the picture's name slowly and tap one finger per sound before touching a tile. ${meta.tip}`,
    });
    const segment = stage.order % 2 === 1;
    out.push({
      ...common,
      id: `${base}.sounds`,
      title: `${stage.title}: ${segment ? "count the sounds" : "the missing sound"}`,
      kidTitle: `${meta.kid}: ${segment ? "Sound Boxes" : "Missing Sound"}`,
      prereqs: [`${base}.build`],
      generator: segment ? "ph.segmentSounds" : "ph.missingSound",
      params: { stage: stage.id },
      testOut: true,
      parentTip: segment
        ? "Say the word slowly like a robot and tap one box per sound, not per letter. Two letters can make one sound (sh, ee), a silent e makes none, and x makes two (/k/ /s/: box has 4)."
        : "Have her say the picture's name slowly and find the sound that is not written yet. Say sounds, never the whole word.",
    });
    if (stage.order % SENTENCE_EVERY === 0) {
      out.push({
        ...common,
        id: `${base}.sentence`,
        title: `${stage.title}: read a sentence`,
        kidTitle: `${meta.kid}: Story Time`,
        prereqs: [`${base}.read`],
        generator: "ph.sentenceRead",
        params: { stage: stage.id },
        testOut: false,
        parentTip: "She reads every word out loud, left to right, before she taps. If she skips a word, point to it and wait. Then reread the sentence smoothly.",
      });
    }
    prevBuild = `${base}.build`;
  }
  return out;
}

const SIGHT_ANCHORS: readonly string[] = ["p1.cvc-a.read", "p1.cvc-i.read", "p1.cvc-o.read", "p1.cvc-u.read", "p1.cvc-e.read", "p1.digraphs.read"];

function sightWordSkills(): Skill[] {
  return SIGHT_ANCHORS.map((anchor, i) => {
    const g = i + 1;
    return {
      id: `sw.g${g}`,
      subject: "phonics" as const,
      grade: 1,
      title: `Heart words: Fry ${g * 10 - 9}-${g * 10}`,
      kidTitle: `Heart Words ${g}`,
      standards: ["L.RF.1.3g"],
      prereqs: g === 1 ? [anchor] : [`sw.g${g - 1}`, anchor],
      generator: "ph.sightWord",
      params: { group: g },
      estMinutes: 5,
      testOut: true,
      parentTip: "Heart words are known by heart, as a whole. Say the word, have her find it, then spell it in the air. Review old groups every week.",
      track: "lily" as const,
      intro: [
        "Some words are so common we learn them by heart instead of sounding them out. We call them heart words.",
        "Listen to the word, then find it. Look at the first letter, then the last letter.",
        "Example: 'the' is t-h-e. We see it everywhere, so we just know it.",
      ],
    };
  });
}

const PHONEMIC_AWARENESS: Skill[] = [
  {
    id: "p1.pa.rhyme",
    subject: "phonics",
    grade: 1,
    title: "Rhyming words",
    kidTitle: "Rhyme Time",
    standards: ["L.RF.1.2a", "L.RF.1.2c"],
    prereqs: ["p1.cvc-a.read"],
    generator: "ph.rhyme",
    params: { upTo: "cvc-e" },
    estMinutes: 5,
    testOut: true,
    parentTip: "Rhymes share the end of the word. Have her say the end part alone (-at) and tap each option's speaker to compare. No reading needed.",
    track: "lily",
    intro: [
      "Words rhyme when they end with the same sounds: cat, hat, bat.",
      "Say the word, then say just its ending. Find the word that ends the same way.",
      "Example: cat ends with -at. Hat ends with -at too, so cat and hat rhyme.",
    ],
  },
  {
    id: "p1.pa.sounds",
    subject: "phonics",
    grade: 1,
    title: "Hear the sound (first, last and vowel sounds)",
    kidTitle: "Sound Detective",
    standards: ["L.RF.1.2c", "L.RF.1.2d"],
    prereqs: ["p1.cvc-i.read"],
    generator: "ph.soundSort",
    params: { upTo: "digraphs" },
    estMinutes: 5,
    testOut: true,
    parentTip: "This is a listening game: she taps each word's speaker and listens for the sound. Say the sound, not the letter name.",
    track: "lily",
    intro: [
      "Every word is made of sounds. We can listen for one sound at the start, at the end, or in the middle.",
      "Say each word slowly and listen for the sound you were asked about.",
      "Example: map starts with /m/, just like mat. Hat starts with /h/, so it does not match.",
    ],
  },
];

const READING: Skill[] = [
  {
    id: "rd1.listen",
    subject: "reading",
    grade: 1,
    title: "Listening comprehension (level 1 stories)",
    kidTitle: "Listen and Answer",
    standards: ["SL.II.1.2", "RL.CI.1.2", "RL.CR.1.1"],
    prereqs: ["p1.cvc-a.read"],
    generator: "rd.lilyListen",
    params: { level: 1 },
    estMinutes: 6,
    testOut: false,
    parentTip: "The story is read to her. Ask 'What happened first? Then what?' before the question. Good for days when sounding out is hard.",
    track: "lily",
    intro: [
      "A story tells us who, where and what happens. Listen for the little clues.",
      "After listening, think: what did the story say? The answer is always in the story.",
      "Example: 'Max sat on a mat.' So where did Max sit? On a mat.",
    ],
  },
  {
    id: "rd1.early",
    subject: "reading",
    grade: 1,
    title: "First decodable stories (short vowels and digraphs)",
    kidTitle: "My First Stories",
    standards: ["L.RF.1.4", "RL.CR.1.1", "RL.CI.1.2"],
    prereqs: ["p1.digraphs.read"],
    generator: "rd.lilyPassage",
    params: { level: 1, upTo: "digraphs" },
    estMinutes: 8,
    testOut: false,
    parentTip: "She reads the story out loud, finger under the words. Read it twice: once to decode, once smoothly. Then tap 'Read it to me' only to check.",
    track: "lily",
    intro: [
      "You can read a whole story now. Read every word with your finger, left to right.",
      "If a word is tricky, say each sound and blend it. Then read the sentence again smoothly.",
      "Example: 'Sam has a cat.' S-a-m, h-a-s, a, c-a-t. Sam has a cat.",
    ],
  },
  {
    id: "rd1.passage",
    subject: "reading",
    grade: 1,
    title: "Decodable stories, level 1",
    kidTitle: "Story Reader 1",
    standards: ["L.RF.1.4", "RL.CR.1.1", "RL.CI.1.2", "RI.CR.1.1"],
    prereqs: ["p1.blends-ending.read", "rd1.early"],
    generator: "rd.lilyPassage",
    params: { level: 1 },
    estMinutes: 8,
    testOut: false,
    parentTip: "Repeated reading builds fluency: have her read the story out loud twice, then answer. Count words correct per minute once a month on a fresh story.",
    track: "lily",
    intro: [
      "Read the story with your finger under the words. Then answer the question.",
      "If you do not remember, look back at the story. The answer is in there.",
      "Example: the question asks what a frog eats. Find the word bug in the story: 'Frogs like bugs.'",
    ],
  },
  {
    id: "rd1_5.passage",
    subject: "reading",
    grade: 1,
    title: "Decodable stories, level 1.5 (magic e and vowel teams)",
    kidTitle: "Story Reader 2",
    standards: ["L.RF.1.4", "RL.CR.1.1", "RL.CI.1.2", "RI.CR.1.1"],
    prereqs: ["p1.long-i-igh-y.read", "rd1.passage"],
    generator: "rd.lilyPassage",
    params: { level: 1.5 },
    estMinutes: 8,
    testOut: false,
    parentTip: "Longer stories: read one paragraph at a time and ask 'What happened so far?' before the next one. Praise self-corrections.",
    track: "lily",
    intro: [
      "These stories are a little longer. Read one part, then think about what happened.",
      "Some questions ask why. Find the clue sentence that tells the reason.",
      "Example: 'The snow is deep. Lily makes a snowman.' Why can she make a snowman? Because the snow is deep.",
    ],
  },
  {
    id: "rd2.passage",
    subject: "reading",
    grade: 2,
    title: "Decodable stories, level 2",
    kidTitle: "Story Reader 3",
    standards: ["L.RF.2.4", "RL.CR.2.1", "RL.CI.2.2", "RI.CR.2.1"],
    prereqs: ["p2.suffixes-ed-ing.read", "rd1_5.passage"],
    generator: "rd.lilyPassage",
    params: { level: 2 },
    estMinutes: 8,
    testOut: false,
    parentTip: "Grade-2 texts: aim for smooth, expressive reading. If she reads word by word, model one sentence and have her echo it.",
    track: "lily",
    intro: [
      "Good readers stop and think: what is this story mostly about?",
      "For order questions, find the words first, then, after and last in the story.",
      "Example: 'In May they plant seeds. By summer the garden has corn.' Planting comes first, corn comes later.",
    ],
  },
  {
    id: "rd2.listen",
    subject: "reading",
    grade: 2,
    title: "Listening comprehension (level 2 stories)",
    kidTitle: "Listen and Answer 2",
    standards: ["SL.II.2.2", "RL.CI.2.2", "RL.CR.2.1"],
    prereqs: ["rd1.listen"],
    generator: "rd.lilyListen",
    params: { level: 2 },
    estMinutes: 6,
    testOut: false,
    parentTip: "Listening runs ahead of reading. Pause the story and ask her to predict what comes next, then check.",
    track: "lily",
    intro: [
      "Listen to the whole story. Picture it in your head as it goes.",
      "The questions ask about details, order, and why things happened.",
      "Example: 'Cole swings hard. Crack! The ball goes up high.' What happens right after the hit? Cole runs to first base.",
    ],
  },
];

/** Array order = map order and the planner's tie-break: prereqs always come before dependents. */
function assemble(): Skill[] {
  const stages = stageSkills();
  const sight = sightWordSkills();
  const byId = new Map<string, Skill>();
  for (const s of [...sight, ...PHONEMIC_AWARENESS, ...READING]) byId.set(s.id, s);
  const after: Record<string, string[]> = {
    "p1.cvc-a.sounds": ["sw.g1", "p1.pa.rhyme", "rd1.listen"],
    "p1.cvc-i.sounds": ["sw.g2", "p1.pa.sounds"],
    "p1.cvc-o.sentence": ["sw.g3"],
    "p1.cvc-u.sounds": ["sw.g4"],
    "p1.cvc-e.sounds": ["sw.g5"],
    "p1.digraphs.sentence": ["sw.g6", "rd1.early"],
    "p1.blends-ending.sentence": ["rd1.passage"],
    "p1.long-i-igh-y.sounds": ["rd1_5.passage"],
    "p2.suffixes-ed-ing.sounds": ["rd2.passage", "rd2.listen"],
  };
  const out: Skill[] = [];
  const placed = new Set<string>();
  for (const s of stages) {
    out.push(s);
    for (const id of after[s.id] ?? []) {
      const extra = byId.get(id);
      if (extra && !placed.has(id)) {
        out.push(extra);
        placed.add(id);
      }
    }
  }
  for (const s of [...sight, ...PHONEMIC_AWARENESS, ...READING]) if (!placed.has(s.id)) out.push(s);
  return out;
}

export const LILY_READING_SKILLS: Skill[] = assemble();
