/**
 * The German alphabet, written the way a German voice reads it aloud.
 *
 * A synthesiser handed a bare "k" is as likely to say the sound as the name,
 * and which one it picks differs by platform. Spelling the names out removes
 * the guess: tapping K always says "kah", the way a German would spell it.
 *
 * `data/scripts/synth-audio.mjs` imports this list to pre-render a clip per
 * name, so it is the one place the spelling of a letter is decided.
 */
export const LETTER_NAMES: Record<string, string> = {
  a: 'Ah', b: 'Beh', c: 'Zeh', d: 'Deh', e: 'Eh', f: 'Eff', g: 'Geh',
  h: 'Hah', i: 'Ih', j: 'Jott', k: 'Kah', l: 'Ell', m: 'Emm', n: 'Enn',
  o: 'Oh', p: 'Peh', q: 'Kuh', r: 'Err', s: 'Ess', t: 'Teh', u: 'Uh',
  v: 'Vau', w: 'Weh', x: 'Iks', y: 'Ypsilon', z: 'Zett',
  ä: 'Ä', ö: 'Ö', ü: 'Ü', ß: 'Eszett'
};

/** The name of a single letter, or null for anything that is not one. */
export function letterName(letter: string): string | null {
  return LETTER_NAMES[letter.toLowerCase()] ?? null;
}
