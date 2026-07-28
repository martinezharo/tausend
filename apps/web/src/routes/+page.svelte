<script lang="ts">
  import { onMount } from 'svelte';
  import { course, genderClass } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import { coverage, showcase, dueCount, nextStory, readableStories } from '@tausend/engine';

  let mounted = $state(false);
  onMount(async () => {
    await progress.load();
    mounted = true;
  });

  const report = $derived(coverage(course, progress.current));
  const tokens = $derived(showcase(course, progress.current));
  const due = $derived(dueCount(progress.current));
  const upcoming = $derived(nextStory(course, progress.current));
  const unlocked = $derived(readableStories(course, progress.current));

  const pct = (n: number) => (n * 100).toFixed(n >= 0.1 ? 0 : 1);
  const bars = 24;
</script>

<svelte:head>
  <title>Tausend — the 1000 most frequent German words</title>
  <meta
    name="description"
    content="Learn the most frequent German words in the order that unlocks real sentences fastest. Coverage is measured against a 151-million-token corpus, not estimated."
  />
</svelte:head>

<div class="wrap">
  <!-- The signature. Progress is not a bar, it is legibility. -->
  <section class="deck">
    <div class="figure">
      <b class="num">{mounted ? pct(report.share) : '—'}</b>
      <span class="pc">%</span>
      <span class="mono cap">of everyday spoken German</span>
    </div>

    <div class="meter" aria-hidden="true">
      {#each Array(bars) as _, i (i)}
        <i class:on={mounted && report.share * bars > i}></i>
      {/each}
    </div>

    <p class="mono src">
      {course.words.length} words · measured against {(course.corpus.totalTokens / 1e6).toFixed(0)}M
      corpus tokens
    </p>

    <div class="text-card">
      <p class="mono label">{course.showcase.title} · {course.showcase.enTitle}</p>
      <p class="showcase" lang="de">
        {#each tokens as token (token.i)}<span
            class="tok"
            data-known={token.known ? 'yes' : token.beyond ? 'beyond' : 'no'}
            >{token.text}</span
          >{' '}{/each}
      </p>
      <p class="mono note">
        Solid blocks are words you have not learned yet. Faded blocks are beyond this course
        entirely — an honest reminder that a thousand words is a skeleton, not fluency.
      </p>
    </div>
  </section>

  <a class="btn go" href="/learn">
    {due > 0 ? `Review ${due} · 3 min` : 'Start · 3 min'}
  </a>

  <section class="grid">
    <div class="cell">
      <span class="mono k">This week</span>
      <b class="v">{mounted ? progress.weekDays : 0}<small>/5</small></b>
      <span class="mono k2">sessions</span>
    </div>
    <div class="cell">
      <span class="mono k">Known</span>
      <b class="v">{mounted ? report.knownCount : 0}<small>/{report.totalWords}</small></b>
      <span class="mono k2">words</span>
    </div>
    <div class="cell">
      <span class="mono k">Recall</span>
      <b class="v">{mounted && progress.accuracy ? pct(progress.accuracy) : '—'}<small>%</small></b>
      <span class="mono k2">last 60 answers</span>
    </div>
  </section>

  {#if mounted && upcoming}
    <section class="story">
      <p class="mono label">Next text</p>
      <h2>{upcoming.story.title}</h2>
      <p class="story-en">{upcoming.story.enTitle}</p>
      <p class="missing">
        <b>{upcoming.missing.length}</b> word{upcoming.missing.length === 1 ? '' : 's'} away.
      </p>
      <ul class="chips">
        {#each upcoming.missing.slice(0, 8) as word (word.id)}
          <li class="chip mark {genderClass(word)}">
            {word.gender ? `${word.gender} ` : ''}{word.lemma}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if unlocked.length}
    <section class="story">
      <p class="mono label">You can read</p>
      <ul class="reads">
        {#each unlocked as story (story.id)}
          <li>
            <a href="/geschichten/{story.id}">
              <b>{story.title}</b>
              <span class="mono">{story.lines.length} lines</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .deck {
    padding: clamp(26px, 7vw, 48px) 0 24px;
  }
  .figure {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .num {
    font-variation-settings: 'wdth' 68, 'wght' 900;
    font-size: clamp(76px, 26vw, 150px);
    line-height: 0.8;
    font-variant-numeric: tabular-nums;
  }
  .pc {
    font-variation-settings: 'wdth' 70, 'wght' 800;
    font-size: clamp(26px, 8vw, 44px);
    line-height: 1;
  }
  .cap {
    color: var(--grau);
    flex-basis: 100%;
    margin-top: 12px;
  }
  .meter {
    display: flex;
    gap: 2px;
    height: 10px;
    margin: 18px 0 10px;
  }
  .meter i {
    flex: 1;
    background: var(--linie);
    transition: background 0.4s;
  }
  .meter i.on {
    background: var(--tinte);
  }
  .src {
    color: var(--grau);
    margin: 0 0 22px;
  }

  .text-card {
    background: var(--beton-2);
    padding: 18px 16px;
  }
  .label {
    color: var(--grau);
    margin: 0 0 12px;
  }
  .showcase {
    font-size: clamp(17px, 4.4vw, 20px);
    line-height: 1.75;
    margin: 0 0 16px;
  }
  .note {
    color: var(--grau);
    margin: 0;
    line-height: 1.7;
    text-transform: none;
    letter-spacing: 0.02em;
    font-size: 11px;
  }

  .go {
    display: block;
    text-align: center;
    text-decoration: none;
    margin: 22px 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    margin-bottom: 28px;
  }
  .cell {
    background: var(--beton-2);
    padding: 14px 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .k {
    color: var(--grau);
  }
  .k2 {
    color: var(--grau);
    font-size: 9px;
  }
  .v {
    font-variation-settings: 'wdth' 74, 'wght' 800;
    font-size: clamp(26px, 8vw, 34px);
    line-height: 0.9;
    font-variant-numeric: tabular-nums;
  }
  .v small {
    font-size: 0.45em;
    color: var(--grau);
    font-variation-settings: 'wdth' 90, 'wght' 500;
  }

  .story {
    border-top: 1px solid var(--linie-stark);
    padding-top: 16px;
    margin-bottom: 28px;
  }
  .story h2 {
    font-size: clamp(24px, 7vw, 34px);
  }
  .story-en {
    color: var(--grau);
    margin: 6px 0 12px;
    font-size: 14px;
  }
  .missing {
    margin: 0 0 12px;
    font-size: 15px;
  }
  .missing b {
    font-variation-settings: 'wdth' 80, 'wght' 800;
  }
  .chips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    background: var(--beton-2);
    padding: 7px 10px;
    font-size: 14px;
    font-variation-settings: 'wdth' 88, 'wght' 600;
  }
  /* Chips use the left-bar channel only; the full mark rules are too heavy here. */
  .chip.mark {
    border-top: 0;
    border-bottom: 0;
    padding-top: 7px;
    padding-bottom: 7px;
    border-left: 5px solid var(--gender);
    padding-left: 9px;
  }

  .reads {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .reads a {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    background: var(--beton-2);
    padding: 14px 14px;
    text-decoration: none;
  }
  .reads b {
    font-variation-settings: 'wdth' 84, 'wght' 700;
    font-size: 17px;
  }
  .reads span {
    color: var(--grau);
  }
</style>
