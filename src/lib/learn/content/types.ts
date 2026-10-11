// Shared content types for authored learning material.
// These are intentionally independent of the engine types so content modules
// can be authored and type-checked on their own.

export interface ContentQuestion {
  /** The question stem shown to the child. */
  prompt: string;
  /** 3-4 answer options; exactly one is correct. */
  options: string[];
  /** Index into options. */
  answerIndex: number;
  /** Kid-friendly explanation that names the evidence or the rule (1-3 sentences). */
  explain: string;
  /** One nudge toward the answer without giving it away. */
  hint: string;
  /** What the question measures. */
  kind: "main-idea" | "detail" | "inference" | "vocabulary" | "sequence" | "author-purpose";
}

export interface ReadingPassage {
  /** Stable id, e.g. "cole-p01". Never reuse an id for different text. */
  id: string;
  title: string;
  /** Plain text, paragraphs separated by a blank line. No markdown. */
  text: string;
  /** Reading level: 1 = grade 1, 1.5 = late grade 1 / early grade 2, 2, 3, 3.5, 4 ... */
  level: number;
  /** Approximate word count of `text`. */
  words: number;
  /** "fiction" | "nonfiction" and a topic tag for variety (science, history, geography, sports, animals, arts, how-it-works, biography...). */
  genre: "fiction" | "nonfiction";
  topic: string;
  /** 2-4 vocabulary words with child-friendly definitions, taught before reading. */
  vocab: { word: string; meaning: string }[];
  questions: ContentQuestion[];
  /** For decodable (phonics) passages: the cumulative phonics stage ids this text relies on. */
  phonicsStages?: string[];
}

export interface WritingPrompt {
  id: string;
  /** Short label, e.g. "Because / But / So". */
  skill: string;
  /** The instruction shown to the child. */
  prompt: string;
  /** A strong model answer (shown after the child writes, for self-check). */
  modelAnswer: string;
  /** 2-4 checklist items the child/parent can tick. */
  checklist: string[];
  level: number;
}

export interface PhonicsWord {
  word: string;
  /** An emoji that unambiguously pictures the word, if one exists (used for picture-matching items). */
  emoji?: string;
}

export interface PhonicsStage {
  /** Stable id, e.g. "cvc-a", "digraph-sh", "magic-e", "vowel-team-ai-ay", "r-controlled-ar". */
  id: string;
  /** Order in the scope and sequence (1 = first). */
  order: number;
  /** Child-facing name, e.g. "Short a words". */
  title: string;
  /** The rule in one child-friendly sentence. */
  rule: string;
  /** The grapheme(s) / pattern(s) taught, e.g. ["sh"], ["a_e","i_e"]. */
  patterns: string[];
  /** 20-40 decodable words using ONLY this stage's pattern plus earlier stages. */
  words: PhonicsWord[];
  /** 6-12 decodable sentences using only this and earlier stages plus the sight words listed in `sightWords` up to this stage. */
  sentences: string[];
  /** Words that are NOT decodable at this stage but needed for sentences (e.g., "the", "said"), introduced here. */
  sightWords: string[];
  /** Optional standard code(s), e.g. ["L.RF.1.3b"]. */
  standards?: string[];
}

export interface VerbalItem {
  prompt: string;
  options: string[];
  answerIndex: number;
  explain: string;
  hint: string;
  /** e.g. "part-whole", "category", "antonym", "function", "degree", "sequence", "cause-effect" */
  relation?: string;
  /** 1 = grade 1 (read aloud / emoji-supported), 3 = grade 3-4 */
  level: number;
  /** Optional emoji per option, same length as options, for level-1 picture support. */
  emojis?: string[];
}
