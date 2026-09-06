import { test } from "node:test";
import assert from "node:assert/strict";
import { units, phrases, dailySession, phraseMatches } from "./practical.ts";
import { emptyProgress, review } from "./scheduler.ts";
import { exportBackup, importBackup } from "./backup.ts";
const now = new Date("2026-09-06T12:00:00.000Z");
test("practical curriculum has stable unique ids and complete essentials", () => {
  assert.equal(new Set(phrases.map((p) => p.id)).size, phrases.length);
  assert.equal(units.length, 10);
  for (const phrase of phrases) {
    assert.ok(phrase.en);
    assert.ok(phraseMatches(phrase, phrase.de));
  }
  assert.ok(phrases.some((p) => p.de === "Bitte!"));
  assert.equal(
    units.find((u) => u.id === "days")!.phrases.slice(0, 7).length,
    7,
  );
});
test("first session limits new material and honours the selected situation", () => {
  const session = dailySession(emptyProgress(), "cafe", now);
  assert.equal(session.length, 4);
  assert.ok(
    session.every((e) => e.fresh && e.phrase.id.startsWith("daily-cafe-")),
  );
});
test("overdue phrases from other topics return before new learning", () => {
  const phrase = units[0].phrases[0];
  const progress = review(
    emptyProgress(),
    `${phrase.id}#produce`,
    "again",
    new Date(now.getTime() - 86400000),
  );
  const session = dailySession(progress, "cafe", now);
  assert.equal(session[0].key, `${phrase.id}#produce`);
  assert.equal(session[0].fresh, false);
  assert.ok(session.some((e) => e.phrase.id.startsWith("daily-cafe-")));
});
test("recognition does not count as production and mature cards are not repeatedly drilled", () => {
  const phrase = units[0].phrases[0];
  let progress = emptyProgress();
  progress = review(progress, `${phrase.id}#recognise`, "good", now);
  assert.equal(dailySession(progress, "hello", now)[0].skill, "produce");
  for (const skill of ["produce", "listen"])
    progress = review(progress, `${phrase.id}#${skill}`, "good", now);
  assert.ok(
    !dailySession(progress, "hello", now).some(
      (e) => e.phrase.id === phrase.id,
    ),
  );
});
test("typing accepts punctuation, transliteration and authored alternatives, but not different grammar", () => {
  const name = phrases.find((p) => p.id === "daily-introductions-name")!;
  assert.ok(phraseMatches(name, " ich heisse Anna! "));
  assert.ok(phraseMatches(name, "Mein Name ist Anna"));
  assert.ok(!phraseMatches(name, "Ich heißen Anna"));
  assert.ok(
    !phraseMatches(
      phrases.find((p) => p.id === "daily-shops-apples")!,
      "Zwei Apfel",
    ),
  );
});
test("practical progress survives the existing backup format", () => {
  const progress = review(
    emptyProgress(),
    `${phrases[0].id}#produce`,
    "again",
    now,
  );
  assert.deepEqual(
    importBackup(
      exportBackup(progress, "de"),
      "de",
      new Set(phrases.map((p) => p.id)),
    ),
    progress,
  );
});
