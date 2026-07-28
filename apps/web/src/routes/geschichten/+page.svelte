<script lang="ts">
  import { onMount } from 'svelte';
  import { course } from '$lib/course.ts';
  import { progress } from '$lib/progress.svelte.ts';
  import { knownWords } from '@tausend/engine';

  let mounted = $state(false);
  onMount(async () => {
    await progress.load();
    mounted = true;
  });

  const known = $derived(
    new Set(mounted ? knownWords(progress.current, course.words).map((w) => w.id) : [])
  );

  const withState = $derived(
    course.stories.map((story) => {
      const words = [...new Set(story.lines.flatMap((l) => l.words))];
      const missing = words.filter((id) => !known.has(id)).length;
      return { story, missing, total: words.length };
    })
  );
</script>

<svelte:head>
  <title>Texte — short German stories built only from words you know</title>
  <meta
    name="description"
    content="Microstories written entirely from the course vocabulary, so you can read something whole in German within days of starting."
  />
</svelte:head>

<div class="wrap">
  <h1>Texte</h1>
  <p class="lede">
    Each text uses only words the course has already taught. Reading one end to end without help is
    the point of all the drilling.
  </p>

  <ul class="list">
    {#each withState as item (item.story.id)}
      <li>
        <a href="/geschichten/{item.story.id}" class:locked={item.missing > 0}>
          <span class="t">{item.story.title}</span>
          <span class="e">{item.story.enTitle}</span>
          <span class="mono s">
            {#if item.missing === 0}
              lesbar · {item.story.lines.length} Zeilen
            {:else}
              {item.missing} von {item.total} Wörtern fehlen
            {/if}
          </span>
          <span class="bar" aria-hidden="true">
            <i style="width:{((item.total - item.missing) / item.total) * 100}%"></i>
          </span>
        </a>
      </li>
    {/each}
  </ul>
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
  .list {
    list-style: none;
    padding: 0;
    margin: 0 0 50px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  a {
    display: grid;
    gap: 6px;
    background: var(--beton-2);
    padding: 16px 16px 14px;
    text-decoration: none;
  }
  .t {
    font-variation-settings: 'wdth' 78, 'wght' 800;
    font-size: 22px;
    text-transform: uppercase;
  }
  .e {
    color: var(--grau);
    font-size: 14px;
  }
  .s {
    color: var(--grau);
  }
  .bar {
    display: block;
    height: 6px;
    background: var(--linie);
    margin-top: 4px;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--tinte);
  }
  a.locked .t {
    color: var(--grau);
  }
</style>
