<script lang="ts">
  import { onMount } from 'svelte';
  import { course, wordById } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import * as audio from '$lib/audio.ts';
  import { knownWords } from '@tausend/engine';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const story = $derived(data.story);

  let mounted = $state(false);
  let showEnglish = $state(false);
  onMount(async () => {
    await progress.load();
    audio.warm();
    mounted = true;
  });

  const known = $derived(
    new Set(mounted ? knownWords(progress.current, course.words).map((w) => w.id) : [])
  );

  const missing = $derived(
    [...new Set(story.lines.flatMap((l) => l.words))]
      .filter((id) => !known.has(id))
      .map((id) => wordById.get(id)!)
      .filter(Boolean)
  );
</script>

<svelte:head>
  <title>{story.title} — {story.enTitle} | short German text</title>
  <meta
    name="description"
    content="{story.title} ({story.enTitle}): a short German text built entirely from high-frequency vocabulary, with English translation."
  />
</svelte:head>

<article class="wrap">
  <a class="mono back" href="/geschichten">← Alle Texte</a>

  <h1>{story.title}</h1>
  <p class="en">{story.enTitle}</p>

  <div class="controls">
    <button class="mono toggle" aria-pressed={showEnglish} onclick={() => (showEnglish = !showEnglish)}>
      {showEnglish ? 'Übersetzung ausblenden' : 'Übersetzung zeigen'}
    </button>
    <button class="mono toggle" onclick={() => { audio.unlock(); audio.speakText(story.lines.map((l) => l.de).join(' ')); }}>
      Vorlesen (synthetisch)
    </button>
  </div>

  {#if mounted && missing.length}
    <aside class="gap">
      <p class="mono label">{missing.length} Wörter fehlen noch</p>
      <p>You can read this once the course has taught these:</p>
      <ul>
        {#each missing.slice(0, 10) as word (word.id)}
          <li>
            <a href="/wort/{word.slug}">{word.gender ? `${word.gender} ` : ''}{word.lemma}</a>
          </li>
        {/each}
      </ul>
    </aside>
  {/if}

  <ol class="lines">
    {#each story.lines as line, i (i)}
      <li>
        <p class="de" lang="de">{line.de}</p>
        {#if showEnglish}<p class="tr">{line.en}</p>{/if}
      </li>
    {/each}
  </ol>
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
  h1 {
    font-size: clamp(34px, 11vw, 60px);
  }
  .en {
    color: var(--grau);
    margin: 10px 0 20px;
  }
  .controls {
    display: flex;
    gap: 2px;
    margin-bottom: 24px;
  }
  .toggle {
    flex: 1;
    background: var(--beton-2);
    border: 1px solid transparent;
    padding: 12px;
    cursor: pointer;
    color: var(--grau);
  }
  .toggle[aria-pressed='true'] {
    background: var(--tinte);
    color: var(--beton);
  }
  .gap {
    background: var(--beton-2);
    border-left: 5px solid var(--das-flaeche);
    padding: 14px;
    margin-bottom: 24px;
  }
  .gap p {
    margin: 0 0 8px;
    line-height: 1.5;
  }
  .label {
    color: var(--grau);
  }
  .gap ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .gap li a {
    display: block;
    background: var(--beton);
    padding: 6px 9px;
    font-size: 14px;
    text-decoration: none;
    font-variation-settings: 'wdth' 88, 'wght' 600;
  }
  .lines {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    counter-reset: line;
  }
  .lines li {
    background: var(--beton-2);
    padding: 16px;
    counter-increment: line;
    position: relative;
  }
  .lines li::before {
    content: counter(line, decimal-leading-zero);
    position: absolute;
    right: 12px;
    top: 12px;
    font-family: 'JBMono', monospace;
    font-size: 10px;
    color: var(--grau);
  }
  .de {
    margin: 0;
    font-variation-settings: 'wdth' 92, 'wght' 600;
    font-size: clamp(19px, 5vw, 24px);
    line-height: 1.45;
    padding-right: 34px;
  }
  .tr {
    margin: 8px 0 0;
    color: var(--grau);
    font-size: 15px;
  }
</style>
