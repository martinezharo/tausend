<script lang="ts">
  import { onMount } from "svelte";
  import { course } from "$lib/course.ts";
  import { progress } from "$lib/progress.svelte.ts";
  import {
    phrases,
    exportBackup,
    importBackup,
    type Progress,
  } from "@tausend/engine";

  let confirming = $state(false);
  let pendingImport = $state<Progress | null>(null);
  let message = $state("");
  let failed = $state(false);
  let reading = $state(false);
  const wordIds = new Set([
    ...course.words.map((word) => word.id),
    ...phrases.map((p) => p.id),
  ]);

  function download() {
    const blob = new Blob(
      [exportBackup($state.snapshot(progress.current), course.language)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tausend-${course.language}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function chooseBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    pendingImport = null;
    message = "";
    failed = false;
    if (!file) return;
    reading = true;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a backup smaller than 10 MB.");
      pendingImport = importBackup(await file.text(), course.language, wordIds);
      confirming = false;
    } catch (error) {
      failed = true;
      message =
        error instanceof Error ? error.message : "Could not read this backup.";
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
      message = "Backup imported and saved on this device.";
    } catch {
      failed = true;
      message =
        "Could not save the backup. Your current progress has been kept. You can try again.";
    }
  }

  async function resetProgress() {
    try {
      await progress.reset();
      confirming = false;
      failed = false;
      message = "Progress deleted from this device.";
    } catch {
      failed = true;
      message =
        "Could not delete progress. Your current progress has been kept.";
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
    try {
      const module = await import("$lib/data/audio-de.json");
      credits = (module.default as { clips: Record<string, Clip> }).clips;
    } catch {
      credits = {};
    }
  });

  const clipCount = $derived(credits ? Object.keys(credits).length : 0);

  const contributors = $derived.by(() => {
    if (!credits) return [];
    const byPerson = new Map<
      string,
      { name: string; count: number; licences: Set<string> }
    >();
    for (const clip of Object.values(credits)) {
      const entry = byPerson.get(clip.author) ?? {
        name: clip.author,
        count: 0,
        licences: new Set<string>(),
      };
      entry.count++;
      entry.licences.add(clip.licence);
      byPerson.set(clip.author, entry);
    }
    return [...byPerson.values()]
      .map((p) => ({ ...p, licences: [...p.licences] }))
      .sort((a, b) => b.count - a.count);
  });

  let voices = $state<SpeechSynthesisVoice[]>([]);
  let selectedVoice = $state("");
  let sound = $state(true);
  onMount(() => {
    try {
      selectedVoice = localStorage.getItem("tausend:voice") ?? "";
      sound = localStorage.getItem("tausend:sound") !== "off";
    } catch {}
    if (!("speechSynthesis" in window)) return;
    const update = () => {
      voices = speechSynthesis
        .getVoices()
        .filter((v) => v.lang.startsWith("de"));
    };
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  });
  function saveAudio() {
    try {
      localStorage.setItem("tausend:voice", selectedVoice);
      localStorage.setItem("tausend:sound", sound ? "on" : "off");
    } catch {
      message = "Audio preferences could not be saved in this browser.";
    }
  }
  const method = [
    [
      "Understand, then recall",
      "New expressions come with meaning and a short explanation. Then you recognise them and write them from memory.",
    ],
    [
      "Spaced repetition",
      "Recognition, listening and production have separate FSRS schedules. Correct answers still return in future reviews.",
    ],
    [
      "Learn from mistakes",
      "Missed answers return after other exercises, up to twice per session. They remain scheduled for later; an immediate correction is not treated as lasting mastery.",
    ],
    [
      "Everyday priorities",
      "Start with courtesy, introductions, numbers, days and colours. Move into cafés, shopping, transport and asking for help. Every topic is available from day one.",
    ],
    [
      "Speaking practice",
      "Listen and repeat, or record yourself and compare. Recordings stay in memory on your device and are discarded when you leave the exercise. This is not automated pronunciation grading.",
    ],
    [
      "A sustainable pace",
      "Introduce up to four new expressions per session alongside due reviews. There are no penalties for taking your time or missing a day.",
    ],
  ];
</script>

<svelte:head>
  <title>Method and sources — Tausend</title>
  <meta
    name="description"
    content="How the course is built, where the word list comes from, and what a thousand words actually gets you."
  />
</svelte:head>

<div class="wrap">
  <h1>Settings & learning</h1>

  <section>
    <h2>German for everyday life</h2>
    <p>
      Practise {phrases.length} useful expressions across ten situations, alongside
      a dictionary of {course.words.length} words and short reading exercises. This
      is a foundation for everyday conversations, not a claim of fluency.
    </p>
    <p>
      The topic selection follows everyday beginner needs described by the <a
        href="https://www.goethe.de/ins/de/en/prf/prf/gzsd1.html"
        >Goethe-Institut A1 overview</a
      >. The exercises and explanations are original course content.
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
    <h2>Sources</h2>
    <ul class="sources">
      <li>
        <b>{course.corpus.name}</b>
        <span
          >{course.corpus.licence} · {course.corpus.totalTokens.toLocaleString(
            "en-US",
          )} tokens, {course.corpus.distinctForms.toLocaleString("en-US")} distinct
          forms</span
        >
      </li>
      <li>
        <b>Lexicon, sentences, texts</b>
        <span>Original work · CC BY-SA 4.0</span>
      </li>
      <li>
        <b>Pronunciation audio — Wikimedia Commons</b>
        <span
          >German Wiktionary pronunciation project · CC BY-SA / CC0, per clip</span
        >
      </li>
      <li>
        <b>Archivo · JetBrains Mono</b>
        <span>SIL Open Font License</span>
      </li>
    </ul>
    <p class="small">
      Course content is CC BY-SA 4.0 deliberately: it keeps the door open to
      Wiktionary as the upstream source for gender, plural and conjugation data.
      The application code is MIT.
    </p>
  </section>

  <section>
    <h2>Audio & sound</h2>
    <p>
      Dictionary words use bundled human recordings where available. Phrases and
      inflected forms use your device’s German speech voice, including enhanced
      voices if installed. Availability and offline playback depend on your
      browser and chosen voice.
    </p>
    <label for="voice">German voice</label>
    <select id="voice" bind:value={selectedVoice} onchange={saveAudio}>
      <option value="">Automatic · best available German voice</option>
      {#each voices as voice}<option value={voice.voiceURI}
          >{voice.name}{voice.localService
            ? " · on device"
            : " · online"}</option
        >{/each}
    </select>
    <button
      class="btn ghost"
      onclick={async () => {
        const audio = await import("$lib/audio.ts");
        audio.speakText(
          "Danke! Gern geschehen. Ich möchte einen Kaffee, bitte.",
        );
      }}>Preview voice</button
    >
    <label style="display:flex;gap:10px;margin-top:18px"
      ><input type="checkbox" bind:checked={sound} onchange={saveAudio} /> Play answer
      sounds</label
    >
    <p class="small">
      You can install additional German voices in your device’s speech settings.
      Online voices may send the example text to your platform’s speech
      provider.
    </p>

    {#if credits}
      <p class="small">
        {clipCount} clips from {contributors.length} Commons contributors. Attribution
        is a licence condition — these names travel with the audio.
      </p>
      <ul class="voices">
        {#each contributors as person (person.name)}
          <li>
            <b>{person.name}</b>
            <span class="mono"
              >{person.count} clip{person.count === 1 ? "" : "s"} · {person.licences.join(
                ", ",
              )}</span
            >
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
      Progress stays on this device. There is no account, no server and no
      analytics. Export a backup to keep it safe or move it to another device.
      Importing replaces the progress on this device, so export your current
      progress first if you want to keep both.
    </p>
    <div class="row backup-actions">
      <button
        class="btn"
        disabled={!progress.ready || progress.busy}
        onclick={download}>Export progress</button
      >
      <label class="backup-input">
        <span>Import progress</span>
        <input
          type="file"
          accept=".json,application/json"
          disabled={!progress.ready || progress.busy || reading}
          onchange={chooseBackup}
        />
      </label>
    </div>
    {#if reading}<p role="status">Reading backup…</p>{/if}
    {#if message}<p role={failed ? "alert" : "status"}>{message}</p>{/if}
    {#if pendingImport}
      <div class="danger">
        <p>
          Replace your current German progress with this backup? It contains {pendingImport
            .introduced.length} introduced words and {Object.keys(
            pendingImport.cards,
          ).length} practice cards.
        </p>
        <div class="row">
          <button class="btn" disabled={progress.busy} onclick={replaceProgress}
            >{progress.busy ? "Saving…" : "Replace progress"}</button
          >
          <button
            class="btn ghost"
            disabled={progress.busy}
            onclick={() => {
              pendingImport = null;
            }}>Cancel</button
          >
        </div>
      </div>
    {:else if confirming}
      <div class="danger">
        <p>
          Delete all progress for German? This cannot be undone without a
          backup.
        </p>
        <div class="row">
          <button class="btn" disabled={progress.busy} onclick={resetProgress}
            >Delete</button
          >
          <button
            class="btn ghost"
            disabled={progress.busy}
            onclick={() => (confirming = false)}>Keep it</button
          >
        </div>
      </div>
    {:else}
      <button
        class="btn ghost"
        disabled={!progress.ready || progress.busy || reading}
        onclick={() => (confirming = true)}>Reset progress</button
      >
    {/if}
  </section>

  <p class="built mono">
    Course compiled {new Date(course.builtAt).toISOString().slice(0, 10)}
  </p>
</div>

<style>
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
    font-variation-settings:
      "wdth" 90,
      "wght" 750;
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
    font-variation-settings:
      "wdth" 80,
      "wght" 800;
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
  .backup-actions {
    margin-bottom: 16px;
    align-items: center;
  }
  .backup-input {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .backup-input input {
    max-width: 100%;
  }
  #your-data {
    scroll-margin-top: 90px;
  }
  .row {
    flex-wrap: wrap;
    display: flex;
    gap: 8px;
  }
  .built {
    color: var(--grau);
    padding: 30px 0 50px;
  }

  select {
    display: block;
    width: 100%;
    padding: 14px;
    margin: 12px 0;
    background: var(--beton-2);
    border: 1px solid var(--linie);
    border-radius: 10px;
  }
</style>
