<script lang="ts">
  import { onMount } from 'svelte';
  import { course } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import { feedbackSound, setSoundEnabled, soundEnabled } from '$lib/sound.ts';
  import { UNLOCK, exportBackup, importBackup, type Progress } from '@tausend/engine';

  let confirming = $state(false);
  let pendingImport = $state<Progress | null>(null);
  let message = $state('');
  let failed = $state(false);
  let reading = $state(false);
  let sound = $state(true);

  function toggleSound(event: Event) {
    sound = (event.currentTarget as HTMLInputElement).checked;
    setSoundEnabled(sound);
    // Play the tone being switched on, so the choice is audible immediately.
    if (sound) feedbackSound(true);
  }
  const wordIds = new Set(course.words.map((word) => word.id));

  function download() {
    const blob = new Blob([exportBackup($state.snapshot(progress.current), course.language)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tausend-${course.language}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function chooseBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    pendingImport = null;
    message = '';
    failed = false;
    if (!file) return;
    reading = true;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a backup smaller than 10 MB.');
      pendingImport = importBackup(await file.text(), course.language, wordIds);
      confirming = false;
    } catch (error) {
      failed = true;
      message = error instanceof Error ? error.message : 'Could not read this backup.';
    } finally {
      reading = false;
    }
  }

  async function replaceProgress() {
    if (!pendingImport) return;
    try {
      await progress.restore($state.snapshot(pendingImport));
      pendingImport = null;
      failed = false;
      message = 'Backup imported and saved on this device.';
    } catch {
      failed = true;
      message = 'Could not save the backup. Your current progress has been kept. You can try again.';
    }
  }

  async function resetProgress() {
    try {
      await progress.reset();
      confirming = false;
      failed = false;
      message = 'Progress deleted from this device.';
    } catch {
      failed = true;
      message = 'Could not delete progress. Your current progress has been kept.';
    }
  }

  interface Clip {
    file: string;
    lemma: string;
    author: string;
    licence: string;
    licenceUrl: string | null;
    source: string;
  }

  // Loaded on demand: the credits are only needed on this page, and there is
  // no reason to carry 40 kB of attribution into every practice session.
  let credits = $state<Record<string, Clip> | null>(null);

  onMount(async () => {
    sound = soundEnabled();
    try {
      const module = await import('$lib/data/audio-de.json');
      credits = (module.default as { clips: Record<string, Clip> }).clips;
    } catch {
      credits = {};
    }
  });

  const clipCount = $derived(credits ? Object.keys(credits).length : 0);

  const contributors = $derived.by(() => {
    if (!credits) return [];
    const byPerson = new Map<string, { name: string; count: number; licences: Set<string> }>();
    for (const clip of Object.values(credits)) {
      const entry = byPerson.get(clip.author) ?? {
        name: clip.author,
        count: 0,
        licences: new Set<string>()
      };
      entry.count++;
      entry.licences.add(clip.licence);
      byPerson.set(clip.author, entry);
    }
    return [...byPerson.values()]
      .map((p) => ({ ...p, licences: [...p.licences] }))
      .sort((a, b) => b.count - a.count);
  });

  const method = [
    ['Retrieval practice', 'Nothing is ever shown to be read. Every contact with a word is an attempt to recall it.'],
    ['Spaced repetition', 'FSRS schedules each skill separately. You never see an interval — the scheduling is the app\'s problem, not yours.'],
    ['Desirable difficulties', `The same word escalates: recognise it, hear it after ${UNLOCK.listen} day of stability, say it after ${UNLOCK.speak}, use it in a sentence after ${UNLOCK.cloze}, produce it cold after ${UNLOCK.produce}.`],
    ['Production out loud', 'Speaking cards ask you to say the word into the microphone and grade what comes back. A course that never hears you teaches reading.'],
    ['Interleaving', 'No two consecutive exercises share a word or a skill. It feels worse and works better.'],
    ['Comprehensible input', 'Sentences are only scheduled once every word in them is known. The build fails otherwise, so the guarantee is structural.'],
    ['Gender from day one', 'A noun is never shown without its article, and gender carries a shape as well as a colour. Wrong articles fossilise; nothing repairs them later.']
  ];
</script>

<svelte:head>
  <title>Method and sources — Tausend</title>
  <meta name="description" content="How the course is built, where the word list comes from, and what a thousand words actually gets you." />
</svelte:head>

<div class="wrap">
  <h1>Über</h1>

  <section>
    <h2>What a thousand words gets you</h2>
    <p>
      The most frequent words cover an enormous share of running speech — but comprehension needs
      about <b>95 %</b> coverage, and unassisted reading about <b>98 %</b>. This course tops out at
      <b>{((course.coverage[course.coverage.length - 1] ?? 0) * 100).toFixed(0)} %</b>
      with {course.words.length} words.
    </p>
    <p>
      So: this builds the skeleton, and the coverage number on the home screen is measured rather
      than promised. It is not a route to fluency and does not pretend to be one.
    </p>
  </section>

  <section>
    <h2>Method</h2>
    <dl class="method">
      {#each method as [name, detail] (name)}
        <div>
          <dt>{name}</dt>
          <dd>{detail}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <section>
    <h2>Ordering</h2>
    <p>
      Words are not taught in frequency order. At each step the compiler picks the word that turns
      the most sentences from "one word missing" into "fully readable", breaking ties by corpus
      frequency. Pure frequency order leaves you unable to read a single whole sentence for a very
      long time.
    </p>
  </section>

  <section>
    <h2>Sources</h2>
    <ul class="sources">
      <li>
        <b>{course.corpus.name}</b>
        <span>{course.corpus.licence} · {course.corpus.totalTokens.toLocaleString('en-US')} tokens, {course.corpus.distinctForms.toLocaleString('en-US')} distinct forms</span>
      </li>
      <li>
        <b>Lexicon, sentences, texts</b>
        <span>Original work · CC BY-SA 4.0</span>
      </li>
      <li>
        <b>Pronunciation audio — Wikimedia Commons</b>
        <span>German Wiktionary pronunciation project · CC BY-SA / CC0, per clip</span>
      </li>
      <li>
        <b>Archivo · JetBrains Mono</b>
        <span>SIL Open Font License</span>
      </li>
    </ul>
    <p class="small">
      Course content is CC BY-SA 4.0 deliberately: it keeps the door open to Wiktionary as the
      upstream source for gender, plural and conjugation data. The application code is MIT.
    </p>
  </section>

  <section>
    <h2>Audio</h2>
    <p>
      Every word is a <b>human recording</b> from the German Wiktionary pronunciation project, via
      Wikimedia Commons. Each clip is loudness-normalised so a drill does not jump 20&nbsp;dB between
      cards, and all of them are packaged with the app.
    </p>
    <p>
      Example sentences and the texts have no recordings; nobody has read this course's invented
      sentences aloud. Those buttons use your device's speech synthesis and say so.
    </p>
    <p>
      Speaking cards work the other way round: they open the microphone and check what you said.
      That part runs through your browser's speech recognition, which on most browsers means the
      recording is sent to the browser vendor's service — the one thing here that leaves the
      device. Where the browser cannot listen at all, speaking cards are left out of the session,
      and <b>Kann nicht sprechen</b> drops them for the rest of a session without counting as a
      wrong answer.
    </p>

    <label class="toggle">
      <input type="checkbox" checked={sound} onchange={toggleSound} />
      <span>
        <b>Answer tones</b>
        <span class="small"
          >A short chord after each answer in a session. The written result is always shown either
          way.</span
        >
      </span>
    </label>

    {#if credits}
      <p class="small">
        {clipCount} clips from {contributors.length} Commons contributors. Attribution is a licence
        condition — these names travel with the audio.
      </p>
      <ul class="voices">
        {#each contributors as person (person.name)}
          <li>
            <b>{person.name}</b>
            <span class="mono">{person.count} clip{person.count === 1 ? '' : 's'} · {person.licences.join(', ')}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small">Loading credits…</p>
    {/if}
  </section>

  <section id="your-data">
    <h2>Your data</h2>
    <p>
      Progress stays on this device. There is no account, no application server and no analytics;
      the only thing that ever leaves is the audio of a speaking card, handled by your browser's
      own speech recognition.
      Export a backup to keep it safe or move it to another device. Importing replaces the progress
      on this device, so export your current progress first if you want to keep both.
    </p>
    <div class="row backup-actions">
      <button class="btn" disabled={!progress.ready || progress.busy} onclick={download}>Export progress</button>
      <label class="backup-input">
        <span>Import progress</span>
        <input type="file" accept=".json,application/json" disabled={!progress.ready || progress.busy || reading} onchange={chooseBackup} />
      </label>
    </div>
    {#if reading}<p role="status">Reading backup…</p>{/if}
    {#if message}<p role={failed ? 'alert' : 'status'}>{message}</p>{/if}
    {#if pendingImport}
      <div class="danger">
        <p>Replace your current German progress with this backup?
          It contains {pendingImport.introduced.length} introduced words and {Object.keys(pendingImport.cards).length} practice cards.</p>
        <div class="row">
          <button class="btn" disabled={progress.busy} onclick={replaceProgress}>{progress.busy ? 'Saving…' : 'Replace progress'}</button>
          <button class="btn ghost" disabled={progress.busy} onclick={() => { pendingImport = null; }}>Cancel</button>
        </div>
      </div>
    {:else if confirming}
      <div class="danger">
        <p>Delete all progress for German? This cannot be undone without a backup.</p>
        <div class="row">
          <button class="btn" disabled={progress.busy} onclick={resetProgress}>Delete</button>
          <button class="btn ghost" disabled={progress.busy} onclick={() => (confirming = false)}>Keep it</button>
        </div>
      </div>
    {:else}
      <button class="btn ghost" disabled={!progress.ready || progress.busy || reading} onclick={() => (confirming = true)}>Reset progress</button>
    {/if}
  </section>

  <p class="built mono">Course compiled {new Date(course.builtAt).toISOString().slice(0, 10)}</p>
</div>

<style>
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-block: 18px;
    cursor: pointer;
  }
  .toggle input {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    flex: none;
  }
  .toggle span {
    display: block;
  }
  .toggle .small {
    margin-top: 2px;
  }

  h1 {
    font-size: clamp(34px, 11vw, 58px);
    padding-top: 28px;
    margin-bottom: 10px;
  }
  section {
    border-top: 1px solid var(--linie-stark);
    padding-top: 16px;
    margin-top: 28px;
  }
  h2 {
    font-size: clamp(20px, 5.6vw, 27px);
    margin-bottom: 12px;
  }
  p {
    line-height: 1.6;
    max-width: 62ch;
    margin: 0 0 12px;
  }
  b {
    font-variation-settings: 'wdth' 90, 'wght' 750;
  }
  .method {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .method > div {
    background: var(--beton-2);
    padding: 14px;
  }
  dt {
    font-variation-settings: 'wdth' 80, 'wght' 800;
    text-transform: uppercase;
    font-size: 15px;
    margin-bottom: 6px;
  }
  dd {
    margin: 0;
    line-height: 1.55;
    color: var(--grau);
    font-size: 15px;
  }
  .sources {
    list-style: none;
    padding: 0;
    margin: 0 0 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sources li {
    background: var(--beton-2);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sources b {
    font-size: 16px;
  }
  .sources span {
    color: var(--grau);
    font-size: 13px;
  }
  .small {
    font-size: 14px;
    color: var(--grau);
  }
  .voices {
    list-style: none;
    padding: 0;
    margin: 0 0 14px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 2px;
  }
  .voices li {
    background: var(--beton-2);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .voices b {
    font-size: 15px;
  }
  .voices span {
    color: var(--grau);
  }
  .danger {
    background: var(--beton-2);
    border-left: 5px solid var(--die);
    padding: 14px;
  }
  .backup-actions { margin-bottom: 16px; align-items: center; }
  .backup-input { display: grid; gap: 8px; min-width: 0; }
  .backup-input input { max-width: 100%; }
  #your-data { scroll-margin-top: 90px; }
  .row {
    flex-wrap: wrap;
    display: flex;
    gap: 8px;
  }
  .built {
    color: var(--grau);
    padding: 30px 0 50px;
  }
</style>
