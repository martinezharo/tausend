<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { course, genderClass } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import AnswerTiles from '$lib/AnswerTiles.svelte';
  import { fit } from '$lib/fit.ts';
  import * as audio from '$lib/audio.ts';
  import { feedbackSound } from '$lib/sound.ts';
  import {
    buildSession,
    practicePlan,
    practiceMatches,
    type PracticePlan,
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
  let phase = $state<'loading' | 'intro' | 'ask' | 'shown' | 'done'>('loading');
  let typed = $state('');
  let correct = $state(0);
  let plan = $state<PracticePlan | null>(null);
  let assisted = $state(false);
  let revealed = $state(false);
  let wasRight = $state(false);
  const presented = new Set<string>();
  const scheduled = new Set<string>();
  const retries = new Map<string, number>();
  let addedConstruction = 0;
  onDestroy(() => audio.stop());
  let inputEl = $state<HTMLInputElement | null>(null);

  const shareBefore = $state({ value: 0 });

  const current = $derived(session[index]);

  onMount(async () => {
    await progress.load();
    audio.warm();
    audio.unlock();
    shareBefore.value = coverage(course, progress.current).share;
    session = buildSession(course, progress.current, { size: 12, newWords: 3 });
    audio.preload(session.map((e) => e.word));
    show();
  });

  // Listening exercises play as soon as they appear — the prompt IS the audio.
  $effect(() => {
    if (phase === 'ask' && current?.kind === 'listen') audio.play(current.word);
  });

  // Meeting a word or a sentence includes hearing it. The introduction speaks
  // for itself, and the listen button is there to hear it a second time.
  $effect(() => {
    if (phase === 'intro' && current) playCurrent();
  });

  $effect(() => {
    if (phase === 'ask' && (plan?.mode === 'hinted' || plan?.mode === 'write')) inputEl?.focus();
  });

  /** The German on screen, as a clip when there is one and as speech otherwise. */
  function playCurrent() {
    if (!current) return;
    if (current.kind === 'cloze') audio.speakText(current.sentence.de);
    else audio.play(current.word);
  }

  function show() {
    typed = '';
    assisted = false;
    revealed = false;
    if (!current) { phase = 'done'; return; }
    plan = practicePlan(current, progress.current);
    const unseenWord = !progress.current.introduced.includes(current.word.id) && !presented.has(current.word.id);
    const unseenSentence = current.kind === 'cloze' && plan.mode === 'words' && !presented.has(current.key);
    phase = unseenWord || unseenSentence ? 'intro' : 'ask';
  }

  function startQuestion() {
    if (!current) return;
    presented.add(current.word.id);
    presented.add(current.key);
    audio.stop();
    phase = 'ask';
  }

  function answer(value: string) {
    if (phase !== 'ask' || !current || !plan) return;
    wasRight = plan.mode === 'words'
      ? practiceMatches(plan.target, value) : checkAnswer(current, value);
    const firstAttempt = !scheduled.has(current.key);
    if (wasRight && !assisted && firstAttempt) correct += 1;
    feedbackSound(wasRight);
    // Only the first attempt can increase stability. Corrections are practice.
    if (!scheduled.has(current.key) || !wasRight || assisted) {
      progress.record(current.key, gradeFor(wasRight && !assisted));
      scheduled.add(current.key);
    }
    const count = retries.get(current.key) ?? 0;
    if ((!wasRight || assisted) && count < 2) {
      session.splice(Math.min(index + 4, session.length), 0, current);
      retries.set(current.key, count + 1);
    }
    // A few newly introduced words get a supported construction turn today.
    if (current.kind === 'recognise' && presented.has(current.word.id) && addedConstruction < 3) {
      const key = `${current.word.id}#produce`;
      if (!progress.current.cards[key] && !session.some((exercise) => exercise.key === key)) {
        session.splice(Math.min(index + 4, session.length), 0, {
          kind: 'produce', key, word: current.word, answer: current.word.lemma,
          prompt: current.word.en.join(', ')
        });
        addedConstruction++;
      }
    }
    phase = 'shown';
    if (current.kind === 'cloze') audio.speakText(current.sentence.de);
    else if (current.kind !== 'listen') audio.play(current.word);
  }

  function help() {
    if (!current) return;
    assisted = true;
    revealed = true;
    // Return to construction even when free recall was previously unlocked.
    plan = practicePlan(current, { ...progress.current, cards: {} });
    typed = '';
  }

  function next() {
    audio.stop();
    index += 1;
    show();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.repeat || event.isComposing ||
      event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    if (phase === 'shown') { event.preventDefault(); next(); }
    else if (phase === 'ask' && (plan?.mode === 'write' || plan?.mode === 'hinted') && typed.trim()) {
      event.preventDefault(); answer(typed);
    }
  }

  const cardCount = $derived(new Set(session.map((exercise) => exercise.key)).size);
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
      <h1 class="score">{correct}<small>/{cardCount}</small></h1>
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
            index = 0;
            correct = 0;
            shareBefore.value = coverage(course, progress.current).share;
            presented.clear();
            scheduled.clear();
            retries.clear();
            addedConstruction = 0;
            show();
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
      <a class="mono quit" href="/">Beenden</a>
    </div>

    <div class="body wrap">
      {#if phase === 'intro'}
        <p class="mono hint">First, get to know it</p>
        {#if current.kind === 'cloze'}
          <p class="sentence" lang="de">{current.sentence.de}</p>
          <p class="sentence-en">{current.sentence.en}</p>
        {:else}
          <div class="plate mark {genderClass(current.word)}">
            <span class="plate-word big" use:fit={current.word.lemma} lang="de">{current.word.gender ? `${current.word.gender} ` : ''}{current.word.lemma}</span>
            <p class="gloss">{current.word.en.join(', ')}</p>
          </div>
        {/if}
        {#if current.word.note || current.word.pattern}<p class="tip">{current.word.note || current.word.pattern}</p>{/if}
      {:else if current.kind === 'gender'}
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
        <p class="mono hint">{plan?.mode === 'letters' ? 'Build the word with the letters below' : SKILL_HINT.produce}</p>
        <div class="prompt">
          <b>{current.prompt}</b>
          {#if current.word.gender}<span class="mono dim">include the article</span>{/if}
        </div>
      {:else if current.kind === 'cloze'}
        <p class="mono hint">{plan?.mode === 'words' ? 'Rebuild the example with the words below' : SKILL_HINT.cloze}</p>
        <p class="sentence" lang={plan?.mode === 'words' && phase !== 'shown' ? 'en' : 'de'}>
          {#if phase === 'shown'}
            {current.sentence.de}
          {:else if plan?.mode === 'words'}
            {current.sentence.en}
          {:else}
            {current.masked}
          {/if}
        </p>
        {#if plan?.mode !== 'words'}<p class="sentence-en">{current.sentence.en}</p>{/if}
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
      {#if phase === 'intro'}
        <button class="btn ghost" onclick={playCurrent}>Nochmal hören</button>
        <p class="tip">Listen, and look at the German and its meaning. Then try it with help.</p>
        <button class="btn" onclick={startQuestion}>Ready to practise</button>
      {:else if phase === 'shown'}
        <div class="feedback" class:bad={!wasRight} role="status" aria-live="polite">
          <b class="mono">{wasRight ? (assisted ? 'With help' : 'Richtig') : 'Let’s try it again'}</b>
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

        <button class="btn" onclick={next}>Weiter</button>
      {:else if current.kind === 'gender'}
        <div class="genders">
          {#each GENDER_OPTIONS as option (option)}
            <button class="gbtn g-{option}" onclick={() => answer(option)}>{option}</button>
          {/each}
        </div>
      {:else if plan?.mode === 'letters' || plan?.mode === 'words'}
        {#if revealed}<p class="tip" lang="de">{plan.target}</p>{/if}
        {#key index}<AnswerTiles
          tokens={plan.tokens}
          separator={plan.mode === 'words' ? ' ' : ''}
          onanswer={answer}
          onpick={plan.mode === 'words' ? audio.playToken : undefined}
        />{/key}
        <button class="btn ghost" onclick={help}>Show me again</button>
      {:else if plan?.mode === 'hinted' || plan?.mode === 'write'}
        {#if plan.mode === 'hinted'}<p class="tip mono" lang="de">{plan.hint}</p>{/if}
        <label class="mono" for="german-answer">{current.kind === 'cloze' ? 'Missing word' : 'Your German'}</label>
        <input
          id="german-answer"
          type="text"
          bind:this={inputEl}
          bind:value={typed}
          lang="de"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="auf Deutsch"
        />
        <button class="btn" disabled={!typed.trim()} onclick={() => answer(typed)}>Prüfen</button>
        <button class="btn ghost" onclick={help}>Give me tiles</button>
      {:else if 'options' in current}
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
    padding-left: 12px;
  }
  .feedback.bad {
    border-left-color: var(--falsch);
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
    padding-top: 60px;
    padding-bottom: 60px;
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
