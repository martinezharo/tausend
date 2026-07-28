<script lang="ts">
  import { course, genderClass, posLabel } from '$lib/course.ts';
  import { fit } from '$lib/fit.ts';
  import * as audio from '$lib/audio.ts';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const { word, sentences, share } = $derived(data);

  let canPlay = $state(false);
  onMount(() => {
    audio.warm();
    canPlay = audio.hasClip(word) || audio.available();
  });

  const title = $derived(
    word.gender ? `${word.gender} ${word.lemma}` : word.lemma
  );
</script>

<svelte:head>
  <title>{title} — {word.en.join(', ')} | German word #{word.rank}</title>
  <meta
    name="description"
    content="{title} means {word.en.join(', ')} in English.{word.plural
      ? ` Plural: die ${word.plural}.`
      : ''} Frequency rank #{word.rank} in spoken German, with example sentences."
  />
</svelte:head>

<article class="wrap">
  <a class="mono back" href="/woerter">← Alle Wörter</a>

  <header class="plate mark {genderClass(word)}">
    {#if word.gender}<p class="article">{word.gender}</p>{/if}
    <h1 class="plate-word" use:fit={word.lemma}>{word.lemma}</h1>
    <p class="en">{word.en.join(' · ')}</p>
  </header>

  {#if canPlay}
    <button class="btn ghost speak" onclick={() => { audio.unlock(); audio.play(word); }}>
      Aussprache hören
      <span class="mono src">{audio.hasClip(word) ? 'menschliche Aufnahme' : 'synthetisch'}</span>
    </button>
  {/if}

  <dl class="facts">
    <div><dt class="mono">Wortart</dt><dd>{posLabel[word.pos] ?? word.pos}</dd></div>
    {#if word.gender}
      <div><dt class="mono">Genus</dt><dd class="gender">{word.gender}</dd></div>
    {/if}
    {#if word.plural}
      <div><dt class="mono">Plural</dt><dd>die {word.plural}</dd></div>
    {/if}
    {#if word.aux}
      <div><dt class="mono">Hilfsverb</dt><dd>{word.aux}</dd></div>
    {/if}
    {#if word.sep}
      <div><dt class="mono">Trennbar</dt><dd>{word.sep}&thinsp;|&thinsp;{word.lemma.slice(word.sep.length)}</dd></div>
    {/if}
    <div><dt class="mono">Frequenz</dt><dd>#{word.rank}</dd></div>
    <div><dt class="mono">Anteil</dt><dd>{(share * 100).toFixed(2)} %</dd></div>
    <div><dt class="mono">Kursposition</dt><dd>{word.order + 1} / {course.words.length}</dd></div>
  </dl>

  {#if word.falseFriend}
    <aside class="warn">
      <p class="mono label">Falscher Freund</p>
      <p>{word.falseFriend}</p>
    </aside>
  {/if}

  {#if word.cognate}
    <aside class="tip">
      <p class="mono label">Cognate</p>
      <p>Related to English <b>{word.cognate}</b> — one of the words English gives you for free.</p>
    </aside>
  {/if}

  {#if word.note}
    <aside class="tip"><p class="mono label">Hinweis</p><p>{word.note}</p></aside>
  {/if}

  {#if word.pattern}
    <aside class="tip"><p class="mono label">Muster</p><p>{word.pattern}</p></aside>
  {/if}

  {#if sentences.length}
    <section>
      <h2>Beispiele</h2>
      <ul class="examples">
        {#each sentences as sentence (sentence.id)}
          <li>
            <p class="de" lang="de">{sentence.de}</p>
            <p class="tr">{sentence.en}</p>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if word.forms.length > 1}
    <section>
      <h2>Formen</h2>
      <ul class="forms">
        {#each word.forms as form (form)}
          <li class="mono">{form}</li>
        {/each}
      </ul>
      <p class="small">
        Forms are generated from the lemma and corrected by hand where German refuses to be regular.
        They are what the corpus frequency above is summed over.
      </p>
    </section>
  {/if}

  <a class="btn" href="/learn">Diese Wörter üben</a>
</article>

<style>
  article {
    padding-bottom: 60px;
  }
  .back {
    display: inline-block;
    text-decoration: none;
    color: var(--grau);
    padding: 20px 0 18px;
  }
  .plate {
    margin-bottom: 22px;
  }
  .article {
    margin: 0 0 6px;
    font-variation-settings: 'wdth' 76, 'wght' 750;
    font-size: clamp(20px, 5vw, 28px);
    color: var(--gender);
  }
  h1.plate-word {
    font-size: clamp(52px, 23vw, 124px);
  }
  .en {
    margin: 18px 0 0;
    font-size: 19px;
    color: var(--grau);
  }
  .speak {
    margin-bottom: 22px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .speak .src {
    color: var(--grau);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 2px;
    margin: 0 0 22px;
  }
  .facts > div {
    background: var(--beton-2);
    padding: 12px 14px;
  }
  dt {
    color: var(--grau);
    margin-bottom: 6px;
  }
  dd {
    margin: 0;
    font-variation-settings: 'wdth' 86, 'wght' 700;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
  dd.gender {
    color: var(--gender);
  }

  aside {
    background: var(--beton-2);
    padding: 14px;
    margin-bottom: 2px;
  }
  aside.warn {
    border-left: 5px solid var(--das-flaeche);
  }
  aside.tip {
    border-left: 5px solid var(--linie-stark);
  }
  aside p {
    margin: 0;
    line-height: 1.55;
  }
  .label {
    color: var(--grau);
    margin-bottom: 6px !important;
  }

  section {
    margin-top: 32px;
  }
  h2 {
    font-size: clamp(22px, 6vw, 30px);
    margin-bottom: 14px;
  }
  .examples {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .examples li {
    background: var(--beton-2);
    padding: 14px;
  }
  .de {
    margin: 0 0 6px;
    font-variation-settings: 'wdth' 92, 'wght' 600;
    font-size: 18px;
    line-height: 1.4;
  }
  .tr {
    margin: 0;
    color: var(--grau);
    font-size: 14px;
  }
  .forms {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .forms li {
    background: var(--beton-2);
    padding: 7px 10px;
    color: var(--tinte);
    text-transform: none;
    letter-spacing: 0.04em;
  }
  .small {
    font-size: 13px;
    line-height: 1.6;
    color: var(--grau);
    max-width: 58ch;
  }
  a.btn {
    display: block;
    text-align: center;
    text-decoration: none;
    margin-top: 36px;
  }
</style>
