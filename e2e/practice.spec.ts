import { test, expect } from "@playwright/test";

test("first session teaches, retries errors, asks for recall and persists across reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/practice?unit=hello");
  await page.getByRole("button", { name: "Ready to try" }).click();
  await page.getByRole("button", { name: "I don’t know yet" }).click();
  await expect(page.getByRole("status")).toContainText("Let’s learn this one");
  await expect(page.getByRole("status")).toContainText("Hallo!");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Continue" }).click();
  const answers: Record<string, string> = {
    "Hallo!": "Hello!",
    "Guten Morgen!": "Good morning!",
    "Guten Tag!": "Good day!",
    "Guten Abend!": "Good evening!",
  };
  let recallSeen = false;
  for (let i = 0; i < 20; i++) {
    if (
      await page
        .getByRole("link", { name: "Back to your learning path" })
        .count()
    )
      break;
    if (await page.getByRole("button", { name: "Ready to try" }).count())
      await page.getByRole("button", { name: "Ready to try" }).click();
    if (await page.locator("#answer").count()) {
      recallSeen = true;
      const prompt = await page.getByRole("heading", { level: 1 }).innerText();
      const german = Object.keys(answers).find(
        (key) => answers[key] === prompt,
      )!;
      await page.locator("#answer").fill(german);
      await page.locator("#answer").press("Enter");
    } else {
      const german = await page.getByRole("heading", { level: 1 }).innerText();
      await page
        .getByRole("button", { name: answers[german], exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Continue" }).click();
  }
  expect(recallSeen).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Take it into your day." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to your learning path" }).click();
  await expect(page.getByText("4 / 8 tried from memory")).toBeVisible();
  await page.reload();
  await expect(page.getByText("4 / 8 tried from memory")).toBeVisible();
  expect(errors).toEqual([]);
});

test("empty review, phrase search, settings and mobile navigation remain usable", async ({
  page,
}) => {
  await page.goto("/practice?review=1");
  await expect(
    page.getByRole("heading", { name: "Your next review can wait." }),
  ).toBeVisible();
  await page.goto("/phrases");
  await page.getByLabel("Find an expression").fill("welcome");
  await expect(
    page.getByText("You’re welcome!", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find an expression").fill("zzzzzz");
  await expect(
    page.getByText("No matching expression.", { exact: false }),
  ).toBeVisible();
  await page.goto("/ueber");
  await page.getByLabel("Play answer sounds").uncheck();
  await page.reload();
  await expect(page.getByLabel("Play answer sounds")).not.toBeChecked();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("microphone denial has a useful fallback and never changes learning results", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/practice?unit=hello");
  await page.getByRole("button", { name: "Ready to try" }).click();
  await page.getByRole("button", { name: "Hello!", exact: true }).click();
  await page.getByText("Say it out loud", { exact: true }).click();
  await page.getByRole("button", { name: "Record yourself" }).click();
  await expect(page.getByRole("alert")).toContainText("Microphone unavailable");
  await expect(page.getByRole("status")).toContainText("That’s right!");
});

test("cached course and saved progress remain available offline", async ({
  page,
  context,
}) => {
  await page.goto("/practice?unit=hello");
  await page.getByRole("button", { name: "Ready to try" }).click();
  await page.getByRole("button", { name: "Hello!", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await page.goto("/phrases");
  await page.getByLabel("Find an expression").fill("coffee");
  await expect(
    page.getByText("I would like a coffee, please.", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByText(/^your everyday german$/i),
  ).toBeVisible();
});
