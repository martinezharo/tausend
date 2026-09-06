<script lang="ts">
  import { units } from "@tausend/engine";
  import * as audio from "$lib/audio.ts";
  import { onMount, onDestroy } from "svelte";
  let query = $state("");
  let available = $state(false);
  onMount(() => {
    audio.warm();
    available = audio.hasSynthesis();
    if (!audio.available()) return;
    const update = () => {
      available = audio.hasSynthesis();
    };
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  });
  onDestroy(() => audio.stop());
  const filtered = $derived(
    units
      .map((unit) => ({
        ...unit,
        phrases: unit.phrases.filter((p) =>
          `${p.de} ${p.en} ${unit.title}`
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        ),
      }))
      .filter((u) => u.phrases.length),
  );
</script>

<svelte:head><title>Your everyday phrasebook — Tausend</title></svelte:head>
<div class="phrasebook">
  <p class="eyebrow">WORDS WHEN YOU NEED THEM</p>
  <h1>Your everyday phrasebook.</h1>
  <p class="intro">Look it up. Listen. Take it into a conversation.</p>
  <label for="search">Find an expression in German or English</label><input
    id="search"
    type="text"
    bind:value={query}
    placeholder="Thank you, coffee, Monday…"
  />
  <p class="count" aria-live="polite">
    {filtered.reduce((n, u) => n + u.phrases.length, 0)} expressions
  </p>
  {#each filtered as unit}<section>
      <div class="heading">
        <h2>{unit.title}</h2>
        <a href={`/practice?unit=${unit.id}`}>Practise →</a>
      </div>
      <p class="tip">{unit.tip}</p>
      {#each unit.phrases as phrase}<div class="phrase">
          <div>
            <b lang="de">{phrase.de}</b><span>{phrase.en}</span
            >{#if phrase.note}<small>{phrase.note}</small>{/if}
          </div>
          <button
            disabled={!available}
            onclick={() => audio.speakText(phrase.de)}
            aria-label={`Listen: ${phrase.de}`}>▷</button
          >
        </div>{/each}
    </section>{/each}{#if !filtered.length}<p>
      No matching expression. Try a shorter word, or browse a topic.
    </p>{/if}
</div>

<style>
  .phrasebook {
    max-width: 760px;
    margin: auto;
    padding: 40px 24px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--der);
    font-weight: 700;
  }
  h1 {
    font-size: clamp(30px, 5vw, 44px);
  }
  .intro,
  .count {
    color: var(--grau);
    line-height: 1.6;
  }
  .count {
    font-size: 12px;
  }
  label {
    display: block;
    margin: 30px 0 12px;
    font-size: 13px;
  }
  section {
    margin: 35px 0;
  }
  .heading {
    display: flex;
    gap: 20px;
    justify-content: space-between;
    align-items: center;
  }
  .heading h2 {
    font-size: 23px;
  }
  .heading a {
    font-size: 12px;
    white-space: nowrap;
  }
  .tip {
    font-size: 13px;
    line-height: 1.7;
    color: var(--grau);
    background: var(--beton-2);
    padding: 18px;
    border-radius: 12px;
  }
  .phrase {
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 18px 0;
    border-bottom: 1px solid var(--linie);
  }
  .phrase div {
    display: grid;
    gap: 8px;
    flex: 1;
  }
  .phrase b {
    font-weight: 650;
    font-size: 18px;
  }
  .phrase span {
    font-size: 14px;
    color: var(--grau);
  }
  .phrase small {
    font-size: 12px;
    line-height: 1.5;
    color: var(--grau);
  }
  .phrase button {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    background: var(--beton-2);
    border: 1px solid var(--linie);
    border-radius: 12px;
    color: var(--der);
    font-size: 20px;
    cursor: pointer;
  }
  .phrase button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
