#!/usr/bin/env python3
"""
Render a batch of German strings to WAV with Piper.

    echo '[{"text": "Ich bin hier.", "out": "/tmp/a.wav"}]' | piper-render.py MODEL

Driven by synth-audio.mjs rather than run by hand. It exists because Piper's
own CLI loads the 63 MB voice model on every invocation, which costs more than
the synthesis itself when the job is a few hundred short sentences.
"""

import json
import sys
import wave

from piper import PiperVoice

model = sys.argv[1]
jobs = json.load(sys.stdin)

voice = PiperVoice.load(model)

for done, job in enumerate(jobs, 1):
    with wave.open(job["out"], "wb") as out:
        voice.synthesize_wav(job["text"], out)
    print(f"\r  rendered {done}/{len(jobs)}", end="", file=sys.stderr, flush=True)

print(file=sys.stderr)
