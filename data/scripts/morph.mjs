/**
 * Minimal German morphology generator.
 *
 * The job here is NOT to be a linguistically complete analyser. It is to
 * generate enough surface forms per lemma that
 *   (a) corpus frequency can be summed over the whole paradigm, and
 *   (b) sentence tokens resolve back to their lemma.
 *
 * Irregular paradigms are not guessed — they are authored in lexicon.json
 * under `f`. This generator only handles the regular cases, and everything
 * it produces is unioned with the authored forms.
 *
 * When the full Wiktionary pipeline lands, this file gets replaced by the
 * `forms` array that kaikki.org already ships per entry. It exists so the
 * project can bootstrap without a multi-gigabyte download.
 */

/** Adjective endings. German adjectives inflect for gender, case and article type. */
const ADJ_ENDINGS = ['', 'e', 'er', 'es', 'en', 'em'];

/** Preposition + article contractions, and what they decompose into. */
export const CONTRACTIONS = {
  im: ['in', 'der'],
  ins: ['in', 'der'],
  am: ['an', 'der'],
  ans: ['an', 'der'],
  vom: ['von', 'der'],
  zum: ['zu', 'der'],
  zur: ['zu', 'der'],
  beim: ['bei', 'der'],
  aufs: ['auf', 'der'],
  fürs: ['für', 'der'],
  durchs: ['durch', 'der'],
  ums: ['um', 'der']
};

/**
 * @param {string} stem
 * @param {boolean} presentOnly
 *   True when the entry authored irregular forms. Strong German verbs keep a
 *   largely regular present tense (wir essen, ihr esst) but take an ablaut
 *   preterite and participle (aß, gegessen). Generating the weak paradigm on
 *   top would invent *esste and *geesst, which then pollute both the frequency
 *   sum and the sentence token resolver.
 */
function regularVerbForms(stem, presentOnly = false) {
  // Verbs whose stem ends in d/t/chn need an epenthetic -e- (arbeitest, arbeitet).
  const needsE = /[dt]$|[cg]hn$|ffn$/.test(stem);
  const e = needsE ? 'e' : '';
  // A stem already ending in a sibilant absorbs the -s- of the 2nd person
  // singular: du weißt, du isst, du lässt — never *wissst.
  const sibilant = /(s|ss|ß|z|tz|x)$/.test(stem);
  const du = sibilant && !needsE ? stem + 't' : stem + e + 'st';
  const present = [stem + 'en', stem + 'e', du, stem + e + 't'];
  if (presentOnly) return present;
  return [
    ...present,
    // preterite
    stem + e + 'te',
    stem + e + 'test',
    stem + e + 'ten',
    stem + e + 'tet',
    // participle
    'ge' + stem + e + 't'
  ];
}

function nounForms(lemma, gender, plural) {
  const out = new Set([lemma]);
  if (plural) {
    out.add(plural);
    // Dative plural takes -n unless the plural already ends in -n or -s.
    if (!/[ns]$/.test(plural)) out.add(plural + 'n');
  }
  if (gender === 'der' || gender === 'das') {
    // Genitive singular. A stem already ending in a sibilant takes -es only:
    // das Haus -> des Hauses, never *Hauss. Everything else takes -s, plus an
    // optional -es after a final consonant cluster (des Kindes / des Kinds).
    if (/[sßxz]$/.test(lemma)) {
      out.add(lemma + 'es');
    } else {
      out.add(lemma + 's');
      if (/[^aeiouäöü][^aeiouäöü]$/.test(lemma)) out.add(lemma + 'es');
    }
  }
  return [...out];
}

/**
 * Generate the surface forms of one lexicon entry.
 * @param {object} w lexicon entry
 * @returns {string[]} unique surface forms, including the lemma itself
 */
export function formsFor(w) {
  const out = new Set([w.l]);
  const authored = w.f ?? [];

  switch (w.p) {
    case 'noun':
      for (const f of nounForms(w.l, w.g, w.pl)) out.add(f);
      break;

    case 'verb': {
      // An authored `f` list means the paradigm is irregular somewhere, so the
      // generator restricts itself to the present tense and lets the entry
      // supply the preterite and participle.
      const irregular = authored.length > 0;

      if (w.sep) {
        // Separable verbs: the finite forms are built from the bare stem
        // (aufstehen -> stehe ... auf), so generate the bare-stem paradigm too.
        const bare = w.l.slice(w.sep.length);
        if (bare.endsWith('en')) {
          for (const f of regularVerbForms(bare.slice(0, -2), irregular)) out.add(f);
        }
        if (!irregular) out.add(w.sep + 'ge' + bare.replace(/en$/, 't'));
      } else if (w.l.endsWith('en')) {
        for (const f of regularVerbForms(w.l.slice(0, -2), irregular)) out.add(f);
      }
      break;
    }

    case 'adj':
    case 'adv':
      for (const end of ADJ_ENDINGS) out.add(w.l + end);
      break;

    default:
      break;
  }

  // Authored forms always win and are always included, including multi-word
  // entries like "stehe auf" which the tokeniser handles separately.
  for (const f of authored) out.add(f);
  return [...out];
}

/** Split a separable-verb authored form ("rufe an") into [stemForm, prefix]. */
export function splitSeparable(form) {
  const parts = form.split(' ');
  return parts.length === 2 ? parts : null;
}
