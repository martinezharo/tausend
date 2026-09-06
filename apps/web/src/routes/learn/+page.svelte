<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { course, genderClass } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import { feedbackSound } from '$lib/sound.ts';
  import { fit } from '$lib/fit.ts';
  import * as audio from '$lib/audio.ts';
  import {
    buildSession,
    checkAnswer,
    coverage,
    gradeFor,
    GENDER_OPTIONS,
    SKILL_HINT,
    SKILL_LABEL,
    type Exercise
  } from '@tausend/engine';

  let session = $state<Exercise[]>([]);
  let index = $state(0);
  let phase = $state<'loading' | 'ask' | 'shown' | 'done'>('loading');
  let given = $state<string | null>(null);
  let typed = $state('');
  let correct = $state(0);
  let askedAt = 0;
  const scheduled = new Set<string>();
  onDestroy(() => audio.stop());
  let inputEl = $state<HTMLInputElement | null>(null);

  const shareBefore = $state({ value: 0 });

  const current = $derived(session[index]);
  const wasRight = $derived(current && given !== null ? checkAnswer(current, given) : false);

  onMount(async () => {
    await progress.load();
    audio.warm();
    audio.unlock();
    shareBefore.value = coverage(course, progress.current).share;
    session = buildSession(course, progress.current, { size: 12, newWords: 3 });
    audio.preload(session.map((e) => e.word));
    phase = session.length ? 'ask' : 'done';
    askedAt = performance.now();
  });

  // Listening exercises play as soon as they appear — the prompt IS the audio.
  $effect(() => {
    if (phase === 'ask' && current?.kind === 'listen') audio.play(current.word);
  });

  $effect(() => {
    if (phase === 'ask' && current?.kind === 'produce') inputEl?.focus();
  });

  function answer(value: string) {
    if (phase !== 'ask' || !current) return;
    given = value;
    const ok = checkAnswer(current, value);
    if (ok) correct += 1;
    feedbackSound(ok);
    if (!ok && session.filter(e => e.key === current.key).length < 3) {
      session.splice(Math.min(index + 4, session.length), 0, current);
    }
    if (!scheduled.has(current.key) || !ok) progress.record(current.key, gradeFor(ok, performance.now() - askedAt));
    scheduled.add(current.key);
    phase = 'shown';

    // Hearing the word right after answering is free extra exposure, and it is
    // the only moment the learner is guaranteed to be paying attention to it.
    if (current.kind === 'cloze') audio.speakText(current.sentence.de);
    else if (current.kind !== 'listen') audio.play(current.word);
  }

  function next() {
    given = null;
    typed = '';
    if (index + 1 >= session.length) {
      phase = 'done';
      return;
    }
    index += 1;
    phase = 'ask';
    askedAt = performance.now();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    if (event.repeat || event.isComposing || event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    if (phase === 'shown') { event.preventDefault(); next(); }
    else if (phase === 'ask' && current?.kind === 'produce' && typed.trim()) answer(typed);
  }

  const gained = $derived(coverage(course, progress.current).share - shareBefore.value);
  const pct = (n: number) => (n * 100).toFixed(n >= 0.1 ? 0 : 2);
</script>

<svelte:head><title>Übung — Tausend</title></svelte:head>
<svelte:window on:keydown={onKey} />

<div class="screen">
  {#if phase === 'loading'}
    <div class="centre mono">Wird geladen …</div>
  {:else if phase === 'done'}
    <div class="wrap summary">
      <p class="mono label">Fertig</p>
      <h1 class="score">{correct}<small>/{session.length}</small></h1>
      <div class="gain">
        <p class="mono label">Coverage gained</p>
        <b>+{pct(gained)} %</b>
        <span class="mono">now {pct(coverage(course, progress.current).share)} % of corpus tokens</span
        >
      </div>
      <div class="stack actions">
        <button
          class="btn"
          onclick={() => {
            session = buildSession(course, progress.current, { size: 12, newWords: 3 });
            audio.preload(session.map((e) => e.word));
            scheduled.clear();
            index = 0;
            correct = 0;
            given = null;
            shareBefore.value = coverage(course, progress.current).share;
            phase = session.length ? 'ask' : 'done';
            askedAt = performance.now();
          }}>Another round</button
        >
        <button class="btn ghost" onclick={() => goto('/')}>Done for now</button>
      </div>
    </div>
  {:else if current}
    <!-- progress rail: one tick per exercise, filled as you go -->
    <div class="rail" aria-hidden="true">
      {#each session as _, i (i)}
        <i class:done={i < index} class:now={i === index}></i>
      {/each}
    </div>

    <div class="head wrap">
      <span class="mono">{SKILL_LABEL[current.kind === 'gender' ? 'gender' : current.kind]}</span>
      <span class="mono dim">{index + 1} / {session.length}</span>
      <a class="mono quit" href="/">Exit</a>
    </div>

    <div class="body wrap">
      {#if current.kind === 'gender'}
        <p class="mono hint">{SKILL_HINT.gender}</p>
        <div class="plate mark {phase === 'shown' ? genderClass(current.word) : 'g-hidden'}">
          <span class="plate-word big" use:fit={current.word.lemma}>{current.word.lemma}</span>
          <p class="gloss">{current.word.en.join(', ')}</p>
        </div>
      {:else if current.kind === 'listen'}
        <p class="mono hint">{SKILL_HINT.listen}</p>
        <button class="speaker" onclick={() => audio.play(current.word)}>
          <span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          <span class="mono">Nochmal hören</span>
        </button>
        {#if phase === 'shown'}
          <div class="plate mark {genderClass(current.word)} reveal">
            <span class="plate-word mid" use:fit={current.word.lemma}
              >{current.word.gender ? `${current.word.gender} ` : ''}{current.word.lemma}</span
            >
          </div>
        {/if}
      {:else if current.kind === 'produce'}
        <p class="mono hint">{SKILL_HINT.produce}</p>
        <div class="prompt">
          <b>{current.prompt}</b>
          {#if current.word.gender}<span class="mono dim">include the article</span>{/if}
        </div>
      {:else if current.kind === 'cloze'}
        <p class="mono hint">{SKILL_HINT.cloze}</p>
        <p class="sentence" lang="de">
          {#if phase === 'shown'}
            {current.sentence.de}
          {:else}
            {current.masked}
          {/if}
        </p>
        <p class="sentence-en">{current.sentence.en}</p>
      {:else}
        <p class="mono hint">{SKILL_HINT.recognise}</p>
        <div class="plate mark {genderClass(current.word)}">
          <span class="plate-word big" use:fit={current.word.lemma}
            >{current.word.gender ? `${current.word.gender} ` : ''}{current.word.lemma}</span
          >
          <p class="mono rank">Rang #{current.word.rank} · {course.words.length}</p>
        </div>
      {/if}
    </div>

    <div class="foot wrap">
      {#if phase === 'shown'}
        <div class="feedback" class:bad={!wasRight} role="status" aria-live="polite">
          <b class="mono">{wasRight ? '✓ Correct' : '↻ Let’s practise that again'}</b>
          <span>
            {#if current.kind === 'gender'}
              {current.word.gender}
              {current.word.lemma}{current.word.plural ? ` · die ${current.word.plural}` : ''}
            {:else if current.kind === 'cloze'}
              {current.answer}
            {:else if current.kind === 'produce'}
              {current.word.gender ? `${current.word.gender} ` : ''}{current.word.lemma}
            {:else}
              {current.word.en.join(', ')}
            {/if}
          </span>
        </div>

        {#if current.word.falseFriend}
          <p class="tip warn">{current.word.falseFriend}</p>
        {:else if current.word.cognate}
          <p class="tip">Cognate with English <b>{current.word.cognate}</b>.</p>
        {:else if current.word.note}
          <p class="tip">{current.word.note}</p>
        {:else if current.word.pattern}
          <p class="tip">{current.word.pattern}</p>
        {/if}

        <button class="btn" onclick={next}>Continue</button>
      {:else if current.kind === 'gender'}
        <div class="genders">
          {#each GENDER_OPTIONS as option (option)}
            <button class="gbtn g-{option}" onclick={() => answer(option)}>{option}</button>
          {/each}
        </div>
      {:else if current.kind === 'produce'}
        <input
          type="text"
          bind:this={inputEl}
          bind:value={typed}
          lang="de"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="auf Deutsch"
        />
        <button class="btn" disabled={!typed.trim()} onclick={() => answer(typed)}>Check answer</button>
      {:else}
        <div class="stack">
          {#each current.options as option (option)}
            <button class="choice" onclick={() => answer(option)}>{option}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .screen {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .centre {
    margin: auto;
    color: var(--grau);
  }

  .rail {
    display: flex;
    gap: 1px;
    height: 4px;
    flex: 0 0 auto;
  }
  .rail i {
    flex: 1;
    background: var(--linie);
  }
  .rail i.done {
    background: var(--tinte);
  }
  .rail i.now {
    background: var(--der);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 14px;
    padding-bottom: 14px;
    color: var(--grau);
  }
  .head .dim {
    margin-left: auto;
  }
  .quit {
    text-decoration: none;
    border: 1px solid var(--linie);
    padding: 6px 9px;
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-top: 8px;
    padding-bottom: 24px;
    min-height: 0;
  }
  .hint {
    color: var(--grau);
    margin: 0 0 18px;
  }

  .plate {
    transition:
      border-color 0.25s,
      padding 0.25s;
  }
  /* Before the answer, the gender channel must give nothing away. */
  .plate.g-hidden {
    border-left: 8px solid var(--linie);
    padding-left: 14px;
  }
  .plate-word {
    display: block;
  }
  /* The plate is meant to be filled: a short word is set enormous and a long
     compound condenses on the width axis to occupy the same slot. These are
     upper bounds — the fit action shrinks from here when even wdth 62 will
     not do. */
  .big {
    font-size: clamp(54px, 25vw, 132px);
  }
  .mid {
    font-size: clamp(40px, 17vw, 82px);
  }
  .gloss {
    margin: 16px 0 0;
    font-size: 17px;
    color: var(--grau);
  }
  .rank {
    margin: 16px 0 0;
    color: var(--grau);
  }
  .reveal {
    margin-top: 26px;
  }

  .speaker {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--beton-2);
    border: 1px solid var(--linie-stark);
    padding: 22px 18px;
    width: 100%;
    cursor: pointer;
    color: var(--grau);
  }
  .wave {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 26px;
  }
  .wave i {
    width: 5px;
    background: var(--der);
  }
  .wave i:nth-child(1) {
    height: 40%;
  }
  .wave i:nth-child(2) {
    height: 75%;
  }
  .wave i:nth-child(3) {
    height: 100%;
  }
  .wave i:nth-child(4) {
    height: 60%;
  }
  .wave i:nth-child(5) {
    height: 30%;
  }

  .prompt b {
    display: block;
    font-variation-settings: 'wdth' 78, 'wght' 800;
    font-size: clamp(32px, 11vw, 56px);
    line-height: 1.02;
    text-transform: uppercase;
  }
  .prompt span {
    display: block;
    margin-top: 14px;
    color: var(--grau);
  }

  .sentence {
    font-variation-settings: 'wdth' 92, 'wght' 600;
    font-size: clamp(22px, 6.2vw, 30px);
    line-height: 1.4;
    margin: 0;
  }
  .sentence-en {
    margin: 16px 0 0;
    color: var(--grau);
    font-size: 15px;
  }

  .foot {
    flex: 0 0 auto;
    padding-bottom: max(18px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .genders {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
  }
  .gbtn {
    font-variation-settings: 'wdth' 72, 'wght' 800;
    font-size: clamp(20px, 6vw, 26px);
    text-transform: lowercase;
    padding: 26px 4px;
    border: 0;
    border-radius: 0;
    cursor: pointer;
    background: var(--gender-fill);
    color: var(--gender-on);
  }
  .gbtn:active {
    opacity: 0.85;
  }

  .feedback {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    border-left: 8px solid var(--richtig);
    padding: 18px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--richtig) 14%, var(--beton));
  }
  .feedback.bad {
    border-left-color: var(--falsch);
    background: color-mix(in srgb, var(--falsch) 14%, var(--beton));
  }
  .feedback b {
    color: var(--richtig);
  }
  .feedback.bad b {
    color: var(--falsch);
  }
  .feedback span {
    font-variation-settings: 'wdth' 88, 'wght' 650;
    font-size: 19px;
  }

  .tip {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--grau);
    background: var(--beton-2);
    padding: 12px 14px;
  }
  .tip.warn {
    color: var(--tinte);
    border-left: 4px solid var(--das-flaeche);
  }

  .summary {
    margin: auto;
    padding-top: 32px;
    padding-bottom: 32px;
    width: 100%;
  }
  .label {
    color: var(--grau);
    margin: 0 0 10px;
  }
  .score {
    font-variation-settings: 'wdth' 68, 'wght' 900;
    font-size: clamp(80px, 26vw, 140px);
    line-height: 0.82;
    font-variant-numeric: tabular-nums;
  }
  .score small {
    font-size: 0.4em;
    color: var(--grau);
  }
  .gain {
    border-top: 1px solid var(--linie-stark);
    margin: 30px 0;
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gain b {
    font-variation-settings: 'wdth' 74, 'wght' 800;
    font-size: clamp(34px, 11vw, 50px);
    line-height: 1;
  }
  .gain span {
    color: var(--grau);
  }
  .actions {
    gap: 8px;
  }
</style>
