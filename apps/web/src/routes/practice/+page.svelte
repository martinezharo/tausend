<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/state";
  import {
    dailySession,
    phrases,
    shuffle,
    mulberry32,
    units,
    phraseMatches,
    type DailyExercise,
  } from "@tausend/engine";
  import { progress } from "$lib/progress.svelte.ts";
  import * as audio from "$lib/audio.ts";
  import { feedbackSound } from "$lib/sound.ts";
  import Recorder from "$lib/Recorder.svelte";
  let queue = $state<DailyExercise[]>([]);
  let index = $state(0);
  let phase = $state<"loading" | "intro" | "ask" | "feedback" | "done">(
    "loading",
  );
  let input = $state("");
  let right = $state(false);
  let revealed = $state(false);
  let correct = $state(0);
  let attempts = $state(0);
  let sound = $state(true);
  let speech = $state(false);
  let inputElement = $state<HTMLInputElement>();
  let missed = $state<string[]>([]);
  const retries = new Map<string, number>();
  const scheduled = new Set<string>();
  const current = $derived(queue[index]);
  const unit = $derived(
    units.find((u) => u.phrases.some((p) => p.id === current?.phrase.id)),
  );
  const reviewOnly = $derived(page.url.searchParams.has("review"));
  const options = $derived.by(() => {
    if (!current) return [];
    const alternatives = [...(unit?.phrases ?? []), ...phrases];
    const meanings = [
      ...new Set(
        alternatives.filter((p) => p.en !== current.phrase.en).map((p) => p.en),
      ),
    ];
    const seed =
      [...current.key].reduce((n, c) => n * 31 + c.charCodeAt(0), index) >>> 0;
    const random = mulberry32(seed);
    return shuffle(
      [
        current.phrase.en,
        ...shuffle(
          meanings.slice(0, Math.max(3, (unit?.phrases.length ?? 4) - 1)),
          random,
        ).slice(0, 3),
      ],
      random,
    );
  });
  onMount(async () => {
    await progress.load();
    audio.warm();
    speech = audio.hasSynthesis();
    try {
      sound = localStorage.getItem("tausend:sound") !== "off";
    } catch {}
    queue = dailySession(
      progress.current,
      page.url.searchParams.get("unit") ?? undefined,
    );
    if (reviewOnly)
      queue = queue.filter(
        (e) =>
          progress.current.cards[e.key] &&
          Date.parse(progress.current.cards[e.key].due) <= Date.now(),
      );
    if (!speech) queue = queue.filter((e) => e.skill !== "listen");
    show();
  });
  onMount(() => {
    if (!audio.available()) return;
    const update = () => {
      speech = audio.hasSynthesis();
    };
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  });
  onDestroy(() => {
    audio.stop();
  });
  $effect(() => {
    if (phase === "ask" && current?.skill === "produce") inputElement?.focus();
  });
  function show() {
    input = "";
    revealed = false;
    phase = !current ? "done" : current.fresh ? "intro" : "ask";
  }
  function answer(value: string, skip = false) {
    if (phase !== "ask") return;
    right =
      !skip &&
      (current.skill === "produce"
        ? phraseMatches(current.phrase, value)
        : value === current.phrase.en);
    revealed = skip;
    attempts++;
    if (right) correct++;
    feedbackSound(right);
    // In-session corrections must not inflate long-term memory stability.
    if (!scheduled.has(current.key)) {
      progress.record(current.key, right ? "good" : "again");
      scheduled.add(current.key);
    } else if (!right) progress.record(current.key, "again");
    if (!right) {
      if (!missed.includes(current.phrase.id)) missed.push(current.phrase.id);
      const count = retries.get(current.key) ?? 0;
      if (count < 2) {
        queue.splice(Math.min(index + 4, queue.length), 0, {
          ...current,
          fresh: false,
        });
        retries.set(current.key, count + 1);
      }
    }
    phase = "feedback";
  }
  function next() {
    if (current.fresh) {
      // A new expression is recalled without options before leaving this session.
      const key = `${current.phrase.id}#produce`;
      if (!queue.some((e) => e.key === key))
        queue.splice(Math.min(index + 4, queue.length), 0, {
          ...current,
          key,
          skill: "produce",
          fresh: false,
        });
    }
    audio.stop();
    index++;
    show();
  }
  function toggleSound() {
    sound = !sound;
    try {
      localStorage.setItem("tausend:sound", sound ? "on" : "off");
    } catch {}
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.repeat || event.isComposing) return;
    if (
      event.target instanceof HTMLButtonElement ||
      event.target instanceof HTMLAnchorElement
    )
      return;
    if (phase === "feedback") {
      event.preventDefault();
      next();
    } else if (phase === "ask" && current.skill === "produce" && input.trim()) {
      event.preventDefault();
      answer(input);
    }
  }
</script>

<svelte:head><title>Everyday practice — Tausend</title></svelte:head>
<svelte:window onkeydown={keydown} />
<div class="practice">
  {#if phase !== "loading" && !speech}<p class="voice-note">
      No German voice is available yet. Reading and writing still work. <a
        href="/ueber">Voice settings</a
      >
    </p>{/if}
  <header>
    <a href="/" aria-label="Leave practice">✕</a><span
      >{unit?.title ?? "Everyday German"}</span
    ><button onclick={toggleSound} aria-pressed={sound}
      >Sound {sound ? "on" : "off"}</button
    >
  </header>
  {#if phase !== "loading" && phase !== "done"}<div class="progress-line">
      <progress max={queue.length} value={index} aria-label="Session progress"
      ></progress><span>{index + 1} / {queue.length}</span>
    </div>{/if}
  {#if phase === "loading"}<div class="empty">
      <p>Getting your practice ready…</p>
    </div>
  {:else if phase === "done"}<section class="empty">
      <div class="complete">{attempts ? "✓" : "↻"}</div>
      <p class="eyebrow">
        {attempts ? "A LITTLE FURTHER TODAY" : "ALL CAUGHT UP"}
      </p>
      <h1>
        {attempts ? "Take it into your day." : "Your next review can wait."}
      </h1>
      <p>
        {attempts
          ? `${correct} of ${attempts} attempts recalled correctly. Your review schedule is saved as you go.`
          : "Nothing is due here right now. Explore a topic or return later for a fresh review."}
      </p>
      {#if missed.length}<div class="recap">
          <h2>Keep these close</h2>
          <p>These expressions will return in future reviews.</p>
          {#each missed as id}{@const phrase = phrases.find(
              (p) => p.id === id,
            )!}
            <div>
              <b lang="de">{phrase.de}</b><span>{phrase.en}</span>
            </div>{/each}
        </div>{/if}<a class="btn" href="/">Back to your learning path →</a><a
        class="other"
        href="/learn">Practise individual words</a
      >
    </section>
  {:else if current}
    <section class="exercise">
      <div class="exercise-body">
        <p class="eyebrow">
          {phase === "intro"
            ? "FIRST, MAKE IT FAMILIAR"
            : current.skill === "produce"
              ? "YOUR TURN · RECALL"
              : current.skill === "listen"
                ? "TUNE YOUR EAR · LISTEN"
                : "MAKE THE CONNECTION"}
        </p>
        {#if phase === "intro"}
          <h1 lang="de">{current.phrase.de}</h1>
          <p class="translation">{current.phrase.en}</p>
          <div class="audio-buttons">
            <button
              class="btn ghost"
              onclick={() => audio.speakText(current.phrase.de)}
              disabled={!speech}>▷ Listen</button
            ><button
              class="btn ghost"
              onclick={() => audio.speakText(current.phrase.de, 0.65)}
              disabled={!speech}>Listen slowly</button
            >
          </div>
          <aside>
            <b>A little German, explained</b>
            <p>{current.phrase.note || unit?.tip}</p>
          </aside>
          <button
            class="btn"
            onclick={() => {
              phase = "ask";
            }}>Ready to try →</button
          >
        {:else}
          {#if current.skill === "produce"}<h1>{current.phrase.en}</h1>
            <p class="translation">How would you say this in German?</p>
          {:else if current.skill === "listen" && speech}<h1>
              What did you hear?
            </h1>
            <div class="audio-buttons">
              <button
                class="btn ghost"
                onclick={() => audio.speakText(current.phrase.de)}
                >▷ Play German</button
              ><button
                class="btn ghost"
                onclick={() => audio.speakText(current.phrase.de, 0.65)}
                >Play slowly</button
              >
            </div>
          {:else}<h1 lang="de">{current.phrase.de}</h1>
            <p class="translation">Choose the meaning.</p>{/if}
          {#if phase === "ask"}
            {#if current.skill === "produce"}<label for="answer"
                >Your German</label
              ><input
                id="answer"
                type="text"
                bind:this={inputElement}
                bind:value={input}
                placeholder="Write the expression…"
                autocomplete="off"
                spellcheck="false"
                lang="de"
              />
              <div class="characters">
                {#each ["ä", "ö", "ü", "ß"] as letter}<button
                    onclick={() => {
                      input += letter;
                      inputElement?.focus();
                    }}>{letter}</button
                  >{/each}<span>ae, oe, ue and ss also work</span>
              </div>
              <button
                class="btn"
                disabled={!input.trim()}
                onclick={() => answer(input)}>Check answer</button
              >
            {:else}<div class="choices">
                {#each options as option}<button
                    class="choice"
                    onclick={() => answer(option)}>{option}</button
                  >{/each}
              </div>{/if}
            <button class="reveal" onclick={() => answer("", true)}
              >I don’t know yet</button
            >
          {:else}<div
              class="result"
              class:wrong={!right}
              role="status"
              aria-live="polite"
            >
              <b
                >{right
                  ? "✓ That’s right!"
                  : revealed
                    ? "↻ Let’s learn this one"
                    : "↻ Not quite — try it again shortly"}</b
              >
              <p lang="de">{current.phrase.de}</p>
              <span>{current.phrase.en}</span>{#if current.phrase.note}<small
                  >{current.phrase.note}</small
                >{/if}
            </div>
            <div class="audio-buttons">
              <button
                class="btn ghost"
                disabled={!speech}
                onclick={() => audio.speakText(current.phrase.de)}
                >▷ Hear the answer</button
              ><button class="btn" onclick={next}>Continue →</button>
            </div>
            <details>
              <summary>Say it out loud</summary>{#key index}<Recorder />{/key}
            </details>{/if}
        {/if}
      </div>
      <p class="session-note">
        {phase === "intro"
          ? "Understand it first. Recall it next. Revisit it over time."
          : "No rush. Remembering takes practice."}
      </p>
    </section>
  {/if}
</div>

<style>
  .voice-note {
    font-size: 12px;
    line-height: 1.5;
    color: var(--grau);
    margin: 12px 0 0;
  }

  .practice {
    max-width: 720px;
    margin: auto;
    padding: 0 24px;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 22px 0;
    color: var(--grau);
    font-size: 13px;
  }
  header a {
    text-decoration: none;
    font-size: 20px;
    padding: 6px;
  }
  header span {
    flex: 1;
  }
  header button {
    background: transparent;
    border: 1px solid var(--linie);
    padding: 9px;
    border-radius: 9px;
    font-size: 11px;
  }
  .progress-line {
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 11px;
    color: var(--grau);
  }
  progress {
    flex: 1;
    height: 7px;
    accent-color: var(--der);
  }
  .exercise {
    display: flex;
    flex-direction: column;
    flex: 1;
    justify-content: center;
    padding: 35px 0 16px;
  }
  .exercise-body {
    width: 100%;
    max-width: 550px;
    margin: auto;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--der);
    font-weight: 650;
    margin: 0 0 24px;
  }
  h1 {
    font-size: clamp(28px, 5vw, 43px);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .translation {
    color: var(--grau);
    line-height: 1.6;
    margin: 18px 0 26px;
  }
  .audio-buttons {
    display: flex;
    gap: 12px;
    margin: 22px 0;
  }
  .audio-buttons .btn {
    font-size: 14px;
    padding: 14px;
  }
  aside {
    background: var(--beton-2);
    border: 1px solid var(--linie);
    border-radius: 16px;
    padding: 20px;
    margin: 26px 0;
    font-size: 14px;
    line-height: 1.7;
  }
  aside p {
    margin: 8px 0 0;
    color: var(--grau);
  }
  label {
    display: block;
    font-size: 12px;
    margin-bottom: 10px;
    color: var(--grau);
  }
  .characters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 22px;
  }
  .characters button {
    border: 1px solid var(--linie);
    border-radius: 7px;
    background: var(--beton-2);
    padding: 7px 12px;
  }
  .characters span {
    font-size: 10px;
    color: var(--grau);
    margin-left: auto;
  }
  .choices {
    display: grid;
    gap: 10px;
    margin-top: 25px;
  }
  .choice {
    padding: 18px;
    font-variation-settings:
      "wdth" 100,
      "wght" 500;
  }
  .reveal {
    display: block;
    margin: 20px auto 0;
    border: 0;
    background: transparent;
    color: var(--grau);
    font-size: 13px;
    padding: 10px;
    text-decoration: underline;
  }
  .result {
    background: color-mix(in srgb, var(--richtig) 12%, var(--beton-2));
    border: 2px solid var(--richtig);
    border-radius: 16px;
    padding: 24px;
    margin-top: 24px;
  }
  .result > b {
    color: var(--richtig);
  }
  .result.wrong {
    background: color-mix(in srgb, var(--falsch) 10%, var(--beton-2));
    border-color: var(--falsch);
  }
  .result.wrong > b {
    color: var(--falsch);
  }
  .result p {
    font-size: 24px;
    line-height: 1.4;
    margin: 18px 0 8px;
  }
  .result span {
    font-size: 14px;
  }
  .result small {
    display: block;
    margin-top: 15px;
    line-height: 1.6;
    color: var(--grau);
  }
  details {
    font-size: 13px;
    color: var(--grau);
  }
  summary {
    cursor: pointer;
    padding: 8px 0;
  }
  .session-note {
    text-align: center;
    color: var(--grau);
    font-size: 11px;
    margin: 32px 0 0;
  }
  .empty {
    max-width: 550px;
    margin: auto;
    padding: 45px 0;
  }
  .empty > p:not(.eyebrow) {
    line-height: 1.7;
    color: var(--grau);
  }
  .complete {
    width: 65px;
    height: 65px;
    border-radius: 22px;
    background: #dcf2e8;
    color: #16704e;
    display: grid;
    place-items: center;
    font-size: 30px;
    margin-bottom: 30px;
  }
  .empty .btn {
    margin-top: 22px;
  }
  .other {
    display: block;
    text-align: center;
    font-size: 13px;
    margin-top: 20px;
  }
  .recap {
    margin-top: 25px;
  }
  .recap h2 {
    font-size: 20px;
  }
  .recap p {
    font-size: 13px;
    color: var(--grau);
  }
  .recap div {
    display: grid;
    gap: 7px;
    padding: 14px 0;
    border-bottom: 1px solid var(--linie);
    font-size: 14px;
  }
  .recap span {
    color: var(--grau);
  }
  @media (max-width: 450px) {
    .practice {
      padding: 0 18px;
    }
    header {
      gap: 10px;
      font-size: 11px;
    }
    .exercise {
      padding-top: 26px;
    }
    .characters {
      gap: 5px;
    }
    .characters span {
      font-size: 9px;
      max-width: 120px;
    }
    .audio-buttons {
      gap: 8px;
    }
    .result {
      padding: 18px;
    }
  }
</style>
