<script lang="ts">
  import { units, phrases } from "@tausend/engine";
  import { progress } from "$lib/progress.svelte.ts";
  const due = $derived(
    Object.entries(progress.current.cards).filter(
      ([key, card]) =>
        key.startsWith("daily-") && Date.parse(card.due) <= Date.now(),
    ).length,
  );
  const learned = (id: string) =>
    units
      .find((u) => u.id === id)!
      .phrases.filter(
        (p) => progress.current.cards[`${p.id}#produce`]?.reps > 0,
      ).length;
  const next = $derived(
    units.find((u) => learned(u.id) < u.phrases.length) ?? units[0],
  );
  const today = $derived(progress.answeredToday);
</script>

<svelte:head
  ><title>Tausend — German for real life</title><meta
    name="description"
    content="Learn the German you need every day. Practical conversations, listening and personal spaced repetition, without an account."
  /></svelte:head
>
<div class="dashboard">
  <section class="welcome">
    <div>
      <p class="eyebrow">YOUR EVERYDAY GERMAN</p>
      <h1>A little German.<br />A lot more possibility.</h1>
      <p class="intro">
        From your first <span lang="de">Hallo</span> to ordering on your own.<br
        />Build the words you’ll actually reach for.
      </p>
    </div>
    <div class="daily">
      <span class="eyebrow">TODAY’S LITTLE STEP</span><strong
        >{Math.min(today, 12)}<small> / 12</small></strong
      ><progress
        max="12"
        value={Math.min(today, 12)}
        aria-label="Daily practice goal"
      ></progress><span
        >{today >= 12
          ? "Your daily practice is done. Schön!"
          : "A few minutes. Something you can use."}</span
      >
    </div>
  </section>
  <section class="start-grid">
    <a class="start-card" href={`/practice?unit=${next.id}`}
      ><div>
        <span class="pill">LET’S PUT IT INTO WORDS</span>
        <h2>{next.title}</h2>
        <p>{next.subtitle}</p>
        <span class="start-button">Start practising <span>→</span></span>
      </div>
      <div class="phrase-art" aria-hidden="true">
        <span>Danke!</span><span>Bitte!</span><small
          >A small exchange.<br />A real connection.</small
        >
      </div></a
    >
    <a class="review-card" href="/practice?review=1"
      ><span class="review-icon">↻</span>
      <h2>Keep it with you.</h2>
      <p>
        {due
          ? `${due} ${due === 1 ? "skill is" : "skills are"} ready for another look.`
          : "Your words come back when it’s time to remember."}
      </p>
      <span>{due ? "Review now" : "Check your review"} →</span></a
    >
  </section>
  <section class="path">
    <div class="section-heading">
      <div>
        <p class="eyebrow">THE FOUNDATIONS</p>
        <h2>Life happens. Have the words.</h2>
      </div>
      <span>{units.length} topics · {phrases.length} useful expressions</span>
    </div>
    <div class="units">
      {#each units as unit, i}<a class="unit" href={`/practice?unit=${unit.id}`}
          ><span class="unit-icon">{unit.icon}</span>
          <div class="unit-copy">
            <span class="eyebrow"
              >{String(i + 1).padStart(2, "0")} · EVERYDAY ESSENTIALS</span
            >
            <h3>{unit.title}</h3>
            <p>{unit.subtitle}</p>
            <div class="unit-bottom">
              <span
                >{learned(unit.id)} / {unit.phrases.length} tried from memory</span
              ><span aria-hidden="true">↗</span>
            </div>
          </div></a
        >{/each}
    </div>
  </section>
  <section class="more">
    <div>
      <h2>Make it stick, your way.</h2>
      <p>
        Mistakes return during practice. Listening and recall have their own
        review schedules. No lives to lose, no race to finish.
      </p>
    </div>
    <a href="/woerter">Explore the dictionary →</a><a href="/learn"
      >Word workout →</a
    ><a href="/geschichten">Read a short story →</a>
  </section>
</div>

<style>
  .dashboard {
    max-width: 1120px;
    margin: auto;
    padding: 48px 28px;
  }
  .welcome {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 32px;
    margin-bottom: 34px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.13em;
    font-weight: 700;
    color: var(--grau);
    margin: 0 0 14px;
  }
  h1 {
    font-size: clamp(34px, 4.6vw, 56px);
    letter-spacing: -0.04em;
    line-height: 1.06;
  }
  .intro {
    color: var(--grau);
    line-height: 1.7;
    margin-bottom: 0;
  }
  .daily {
    width: 255px;
    flex-shrink: 0;
    display: grid;
    gap: 14px;
    padding: 24px;
    background: var(--beton-2);
    border-radius: 20px;
  }
  .daily .eyebrow {
    margin: 0;
  }
  .daily strong {
    font-size: 36px;
  }
  .daily small {
    font-size: 18px;
    color: var(--grau);
  }
  .daily > span:last-child {
    font-size: 12px;
    line-height: 1.5;
    color: var(--grau);
  }
  progress {
    width: 100%;
    height: 7px;
    accent-color: var(--der);
  }
  .start-grid {
    display: grid;
    grid-template-columns: 2.2fr 1fr;
    gap: 18px;
  }
  .start-card {
    background: #4943c4;
    color: #fff;
    border-radius: 24px;
    padding: 32px;
    display: flex;
    gap: 20px;
    text-decoration: none;
    overflow: hidden;
  }
  .pill {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: #dddafa;
  }
  .start-card h2 {
    font-size: 30px;
    line-height: 1.12;
    max-width: 330px;
    margin: 22px 0 12px;
  }
  .start-card p {
    font-size: 14px;
    color: #e0ddff;
    line-height: 1.6;
    max-width: 270px;
  }
  .start-button {
    display: flex;
    justify-content: space-between;
    background: #fff;
    color: #35308f;
    padding: 15px 20px;
    border-radius: 12px;
    font-weight: 700;
    max-width: 235px;
    margin-top: 25px;
  }
  .phrase-art {
    margin: auto 0 auto auto;
    min-width: 155px;
    display: grid;
    gap: 12px;
    transform: rotate(-5deg);
  }
  .phrase-art > span {
    background: #b9efd5;
    color: #173c34;
    padding: 18px 22px;
    border-radius: 20px 20px 20px 3px;
    font-size: 27px;
    font-weight: 700;
  }
  .phrase-art > span:nth-child(2) {
    background: #eee7ff;
    color: #4943c4;
    transform: translateX(18px);
    border-radius: 20px 20px 3px 20px;
  }
  .phrase-art small {
    margin: 8px 0 0 20px;
    font-size: 11px;
    line-height: 1.6;
    color: #dddafa;
  }
  .review-card {
    border-radius: 24px;
    background: #e0eee9;
    padding: 28px;
    color: #234c42;
    text-decoration: none;
    display: flex;
    flex-direction: column;
    align-items: start;
  }
  .review-icon {
    font-size: 35px;
  }
  .review-card h2 {
    font-size: 25px;
    margin-top: 20px;
  }
  .review-card p {
    font-size: 14px;
    line-height: 1.7;
  }
  .review-card > span:last-child {
    margin-top: auto;
    font-weight: 700;
    font-size: 14px;
  }
  .path {
    margin-top: 48px;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 20px;
    margin-bottom: 22px;
  }
  .section-heading h2 {
    font-size: 27px;
  }
  .section-heading > span {
    font-size: 12px;
    color: var(--grau);
  }
  .units {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .unit {
    display: flex;
    gap: 18px;
    padding: 24px;
    background: var(--beton-2);
    border: 1px solid var(--linie);
    border-radius: 18px;
    text-decoration: none;
    transition:
      transform 0.15s,
      border-color 0.15s;
  }
  .unit:hover {
    transform: translateY(-3px);
    border-color: var(--der);
  }
  .unit-icon {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: #eceafa;
    color: #4943c4;
    display: grid;
    place-items: center;
    font-size: 25px;
    flex-shrink: 0;
  }
  .unit-copy {
    flex: 1;
  }
  .unit .eyebrow {
    font-size: 9px;
  }
  .unit h3 {
    font-size: 20px;
    margin: 8px 0;
  }
  .unit p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--grau);
    margin: 0;
  }
  .unit-bottom {
    display: flex;
    justify-content: space-between;
    margin-top: 22px;
    font-size: 11px;
    color: var(--grau);
  }
  .more {
    display: flex;
    gap: 24px;
    align-items: center;
    border-top: 1px solid var(--linie);
    margin-top: 40px;
    padding-top: 28px;
  }
  .more div {
    max-width: 430px;
    margin-right: auto;
  }
  .more h2 {
    font-size: 21px;
  }
  .more p {
    font-size: 13px;
    line-height: 1.7;
    color: var(--grau);
  }
  .more a {
    font-size: 12px;
    line-height: 1.5;
  }
  @media (max-width: 700px) {
    .dashboard {
      padding: 28px 18px;
    }
    .welcome {
      align-items: start;
    }
    .daily {
      width: 170px;
      padding: 18px;
    }
    .start-grid {
      grid-template-columns: 1fr;
    }
    .review-card {
      display: block;
      padding: 20px;
    }
    .review-icon {
      float: right;
    }
    .review-card h2 {
      margin: 0;
    }
    .review-card p {
      margin: 10px 0;
    }
    .section-heading {
      display: block;
    }
    .section-heading > span {
      display: block;
      margin-top: 12px;
    }
    .units {
      grid-template-columns: 1fr;
    }
    .more {
      flex-wrap: wrap;
    }
    .more div {
      max-width: none;
      width: 100%;
    }
  }
  @media (max-width: 460px) {
    .welcome {
      display: block;
    }
    .daily {
      width: 100%;
      margin-top: 24px;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .daily strong {
      grid-column: 2;
      grid-row: 1/3;
      font-size: 28px;
    }
    .daily progress {
      grid-row: 2;
    }
    .daily > span:last-child {
      grid-column: 1/3;
    }
    .start-card {
      padding: 25px;
    }
    .start-card h2 {
      font-size: 27px;
    }
    .phrase-art {
      min-width: 100px;
    }
    .phrase-art > span {
      font-size: 19px;
      padding: 14px;
    }
    .phrase-art small {
      display: none;
    }
    .start-button {
      font-size: 13px;
      padding: 14px;
    }
    .unit {
      padding: 20px;
    }
  }
</style>
