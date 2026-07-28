<script lang="ts">
  import { course, genderClass } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import { onMount } from 'svelte';
  import { knownWords } from '@tausend/engine';

  let mounted = $state(false);
  let sort = $state<'curriculum' | 'frequency'>('curriculum');
  let filter = $state('');

  onMount(async () => {
    await progress.load();
    mounted = true;
  });

  const known = $derived(
    new Set(mounted ? knownWords(progress.current, course.words).map((w) => w.id) : [])
  );

  const list = $derived(
    [...course.words]
      .sort((a, b) => (sort === 'curriculum' ? a.order - b.order : a.rank - b.rank))
      .filter((w) => {
        if (!filter.trim()) return true;
        const q = filter.trim().toLowerCase();
        return w.lemma.toLowerCase().includes(q) || w.en.some((g) => g.toLowerCase().includes(q));
      })
  );
</script>

<svelte:head>
  <title>All {course.words.length} words — Tausend German</title>
  <meta
    name="description"
    content="Every word in the course, with gender, plural and corpus frequency rank. Sortable by teaching order or by raw frequency."
  />
</svelte:head>

<div class="wrap">
  <h1>Wörter</h1>
  <p class="lede">
    {course.words.length} lemmas. Teaching order is not frequency order — it is the order that
    unlocks whole sentences fastest.
  </p>

  <div class="controls">
    <input
      type="text"
      bind:value={filter}
      placeholder="Filter — German or English"
      aria-label="Filter words"
    />
    <div class="toggle">
      <button
        class="mono"
        aria-pressed={sort === 'curriculum'}
        onclick={() => (sort = 'curriculum')}>Kurs</button
      >
      <button
        class="mono"
        aria-pressed={sort === 'frequency'}
        onclick={() => (sort = 'frequency')}>Frequenz</button
      >
    </div>
  </div>

  <ol class="list">
    {#each list as word (word.id)}
      <li>
        <a class="row mark {genderClass(word)}" href="/wort/{word.slug}" class:known={known.has(word.id)}>
          <span class="lemma">
            {#if word.gender}<em>{word.gender}</em>{/if}{word.lemma}
          </span>
          <span class="en">{word.en.join(', ')}</span>
          <span class="mono no">{sort === 'curriculum' ? word.order + 1 : `#${word.rank}`}</span>
        </a>
      </li>
    {/each}
  </ol>
</div>

<style>
  h1 {
    font-size: clamp(34px, 11vw, 58px);
    padding-top: 28px;
  }
  .lede {
    max-width: 46ch;
    line-height: 1.55;
    color: var(--grau);
    margin: 14px 0 24px;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }
  .toggle {
    display: flex;
    gap: 2px;
  }
  .toggle button {
    flex: 1;
    background: var(--beton-2);
    border: 1px solid transparent;
    padding: 12px;
    cursor: pointer;
    color: var(--grau);
  }
  .toggle button[aria-pressed='true'] {
    background: var(--tinte);
    color: var(--beton);
  }

  .list {
    list-style: none;
    margin: 0 0 40px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    counter-reset: n;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'lemma no' 'en no';
    gap: 2px 12px;
    align-items: center;
    background: var(--beton-2);
    padding: 12px 14px;
    text-decoration: none;
    border-left: 5px solid var(--gender);
  }
  /* The list only has room for one channel, so it uses the colour bar and the
     article itself — never colour alone. */
  .row.mark {
    border-top: 0;
    border-bottom: 0;
    padding-top: 12px;
    padding-bottom: 12px;
    padding-left: 12px;
  }
  .lemma {
    grid-area: lemma;
    font-variation-settings: 'wdth' 84, 'wght' 700;
    font-size: 19px;
  }
  .lemma em {
    font-style: normal;
    color: var(--gender);
    margin-right: 0.4em;
    font-variation-settings: 'wdth' 78, 'wght' 700;
  }
  .en {
    grid-area: en;
    color: var(--grau);
    font-size: 14px;
  }
  .no {
    grid-area: no;
    color: var(--grau);
  }
  .row.known .lemma::after {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    background: var(--tinte);
    margin-left: 8px;
    vertical-align: middle;
  }
</style>
