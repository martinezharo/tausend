#!/usr/bin/env bash
# Fetch the frequency corpora the course compiler joins against.
#
# These files are checked in, so this only needs running to refresh them or to
# bootstrap a new language. Everything here is openly licensed — see
# data/LICENSE for attribution requirements.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/data/sources"
mkdir -p "$OUT"

LANGS="${*:-de}"

for lang in $LANGS; do
  url="https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${lang}/${lang}_50k.txt"
  echo "  fetching ${lang}_50k.txt — OpenSubtitles via hermitdave/FrequencyWords (CC BY-SA 4.0)"
  curl -fsSL "$url" -o "$OUT/${lang}_50k.txt"
  printf '    %s lines\n' "$(wc -l < "$OUT/${lang}_50k.txt")"
done

cat <<'NOTE'

  Spoken-language frequency is in place.

  Not yet wired up, and the next things worth adding:
    - Leipzig Corpora Collection (CC BY 4.0) for written-language frequency,
      to blend against the subtitle counts.
    - kaikki.org wiktextract dumps (CC BY-SA) for gender, plural and
      conjugation, replacing the hand-authored `f` lists in the lexicon.
    - Tatoeba (CC BY 2.0 FR) for example sentences, filtered by the compiler's
      existing "every token must resolve" check.
NOTE
