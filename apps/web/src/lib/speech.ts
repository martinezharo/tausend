import { course } from './course.ts';

/**
 * Speech recognition, for the exercise that asks the learner to say the word.
 *
 * This is the one part of the app that is not self-contained: the browser's
 * `SpeechRecognition` sends the recording to whatever service the browser uses
 * — Google's for Chrome, Apple's for Safari — and Firefox has no
 * implementation at all. Speaking is worth that: a course that never asks for
 * your voice teaches you to read German, not to speak it. Everything else
 * still runs offline, and where recognition is missing the speaking cards are
 * simply left out of the session.
 */

const TAGS: Record<string, string> = { de: 'de-DE' };
const LANG = TAGS[course.language] ?? course.language;

type Alternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: Alternative };
type RecognitionEvent = { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } };

interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type RecognitionClass = new () => Recognition;

function implementation(): RecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const global = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return global.SpeechRecognition ?? global.webkitSpeechRecognition ?? null;
}

export const supported = (): boolean => implementation() !== null;

/**
 * Why a turn at the microphone produced nothing.
 *
 * `denied` is permanent for the page and hides speaking for the rest of the
 * session; the other two are worth another try.
 */
export type SpeechFailure = 'denied' | 'silent' | 'unavailable';

export interface Attempt {
  /** Give up on this turn. Nothing is reported after it. */
  cancel(): void;
}

export interface AttemptHandlers {
  /** Words as they are being recognised, for the live transcript. */
  onpartial?(text: string): void;
  /** Every alternative the recogniser offered, best first. */
  onresult(alternatives: string[]): void;
  onfail(reason: SpeechFailure): void;
  /** The microphone is actually open — the point at which to look live. */
  onstart?(): void;
}

/** How long to keep listening for a single word before giving up. */
const LIMIT = 8000;

export function listen(handlers: AttemptHandlers): Attempt {
  const Impl = implementation();
  if (!Impl) {
    handlers.onfail('unavailable');
    return { cancel() {} };
  }

  const recognition = new Impl();
  recognition.lang = LANG;
  recognition.continuous = false;
  recognition.interimResults = true;
  // A single German word is easy to mishear in one way and right in another,
  // so the caller gets every reading and accepts the best of them.
  recognition.maxAlternatives = 5;

  let done = false;
  const finish = (report: () => void) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    report();
  };

  const timer = setTimeout(() => recognition.stop(), LIMIT);

  recognition.onstart = () => handlers.onstart?.();

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (!result.isFinal) {
      handlers.onpartial?.(result[0]?.transcript ?? '');
      return;
    }
    const alternatives: string[] = [];
    for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);
    finish(() => handlers.onresult(alternatives));
    recognition.stop();
  };

  recognition.onerror = ({ error }) => {
    if (error === 'aborted') return;
    const reason: SpeechFailure =
      error === 'not-allowed' || error === 'service-not-allowed'
        ? 'denied'
        : error === 'no-speech'
          ? 'silent'
          : 'unavailable';
    finish(() => handlers.onfail(reason));
  };

  // Silence ends the turn without an error on some engines.
  recognition.onend = () => finish(() => handlers.onfail('silent'));

  try {
    recognition.start();
  } catch {
    finish(() => handlers.onfail('unavailable'));
  }

  return {
    cancel() {
      done = true;
      clearTimeout(timer);
      recognition.abort();
    }
  };
}
