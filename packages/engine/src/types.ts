/** Compiled course data, as emitted by data/scripts/build-course.mjs. */

export type Pos =
  | 'noun'
  | 'verb'
  | 'adj'
  | 'adv'
  | 'det'
  | 'pron'
  | 'prep'
  | 'conj'
  | 'wh'
  | 'part'
  | 'num';

export type Gender = 'der' | 'die' | 'das';

export interface Word {
  id: string;
  lemma: string;
  pos: Pos;
  gender: Gender | null;
  plural: string | null;
  en: string[];
  forms: string[];
  aux: 'haben' | 'sein' | null;
  sep: string | null;
  cognate: string | null;
  falseFriend: string | null;
  pattern: string | null;
  note: string | null;
  /** Position in this course's own frequency ordering. */
  rank: number;
  /** Position in the teaching curriculum, which is NOT frequency order. */
  order: number;
  corpusCount: number;
  slug: string;
  /**
   * Filename of the human pronunciation clip, relative to /audio/<lang>/.
   * Null when no recording was found, in which case the app falls back to
   * speech synthesis for this word.
   */
  audio: string | null;
}

export interface Sentence {
  id: string;
  de: string;
  en: string;
  words: string[];
  focus: string | null;
  /** Curriculum position at which every word in this sentence is known. */
  unlocksAt: number;
}

export interface Story {
  id: string;
  title: string;
  enTitle: string;
  lines: { de: string; en: string; words: string[] }[];
  unlocksAt: number;
}

export interface ShowcaseToken {
  i: number;
  text: string;
  /** null when the token is outside the course vocabulary entirely. */
  word: string | null;
  order: number | null;
}

export interface Course {
  language: string;
  source: string;
  builtAt: string;
  corpus: {
    name: string;
    licence: string;
    totalTokens: number;
    distinctForms: number;
  };
  words: Word[];
  sentences: Sentence[];
  stories: Story[];
  showcase: { title: string; enTitle: string; tokens: ShowcaseToken[] };
  /** coverage[k] = share of corpus tokens covered by the first k+1 words. */
  coverage: number[];
}

/**
 * The six things it means to "know" a word here.
 *
 * A word is not one flashcard. Each of these is scheduled independently, and
 * they unlock in a ladder as the word gets more stable — which is the
 * desirable-difficulties principle made concrete rather than decorative.
 */
export type Skill = 'recognise' | 'gender' | 'listen' | 'speak' | 'cloze' | 'produce';

/** A serialisable FSRS card. Dates are ISO strings so this survives JSON. */
export interface StoredCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  last_review?: string;
}

export interface Progress {
  /** Keyed by `${wordId}#${skill}`. */
  cards: Record<string, StoredCard>;
  /** Word ids in the order they were first shown. */
  introduced: string[];
  /** ISO dates (YYYY-MM-DD) on which at least one session was completed. */
  activeDays: string[];
  /** Rolling answer log, newest last. Capped by the caller. */
  answers: { at: number; key: string; correct: boolean }[];
}

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type Exercise =
  | { kind: 'recognise'; key: string; word: Word; options: string[]; answer: string }
  | { kind: 'gender'; key: string; word: Word; answer: Gender }
  | { kind: 'listen'; key: string; word: Word; options: string[]; answer: string }
  /**
   * Say the word out loud. The German is on screen — this asks the mouth for
   * something the eye already has, so it is a pronunciation test, not a recall
   * test. `answer` is what the microphone has to hear back.
   */
  | { kind: 'speak'; key: string; word: Word; answer: string; prompt: string }
  | { kind: 'produce'; key: string; word: Word; answer: string; prompt: string }
  | {
      kind: 'cloze';
      key: string;
      word: Word;
      sentence: Sentence;
      /** The sentence with the target token replaced by "___". */
      masked: string;
      options: string[];
      answer: string;
    };
