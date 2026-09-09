<script lang="ts">
  import { shuffle, mulberry32 } from '@tausend/engine';
  let { tokens, separator = '', onanswer, onpick }: {
    tokens: string[];
    separator?: string;
    onanswer: (answer: string) => void;
    /**
     * Called with a tile's text as it is placed, so the caller can say it
     * aloud — a word in a sentence, a letter named as you would spell it.
     */
    onpick?: (token: string) => void;
  } = $props();
  let selected = $state<number[]>([]);
  const tiles = $derived(shuffle(tokens.map((text, id) => ({ text, id })), mulberry32(42)));
  const answer = $derived(selected.map((id) => tokens[id]).join(separator));
</script>

<div class="assembled" aria-live="polite" aria-label="Your answer">
  {#if selected.length}
    {#each selected as id, position (id)}
      <button class="tile" onclick={() => selected = selected.filter((_, i) => i !== position)}
        aria-label={`Remove ${tokens[id]}`} lang="de">{tokens[id]}</button>
    {/each}
  {:else}<span class="mono">Choose the tiles below.</span>{/if}
</div>
<div class="tiles" aria-label="Available tiles">
  {#each tiles as tile (tile.id)}
    <button class="tile" lang="de" disabled={selected.includes(tile.id)}
      onclick={() => { selected = [...selected, tile.id]; onpick?.(tile.text); }}>{tile.text}</button>
  {/each}
</div>
<div class="controls">
  <button class="btn ghost" disabled={!selected.length} onclick={() => selected = []}>Clear</button>
  <button class="btn" disabled={selected.length !== tokens.length} onclick={() => onanswer(answer)}>Prüfen</button>
</div>

<style>
  .assembled, .tiles { display: flex; flex-wrap: wrap; gap: 6px; }
  .assembled { min-height: 58px; padding: 10px 0; border-bottom: 1px solid var(--linie-stark); align-items: center; }
  .assembled span { color: var(--grau); }
  .tile { min-width: 44px; min-height: 44px; padding: 8px 12px; background: var(--beton-2); color: var(--tinte); border: 1px solid var(--linie-stark); font: inherit; cursor: pointer; }
  .tile:disabled { opacity: 0.25; cursor: default; }
  .controls { display: flex; gap: 8px; }
  .controls .btn:last-child { flex: 1; }
</style>
