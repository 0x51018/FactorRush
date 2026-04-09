import { expect, test, type Locator, type Page } from "@playwright/test";

const PRIME_SHOUT = "야호 소수다";

function extractFirstNumber(text: string) {
  const match = text.match(/(\d+)/);
  if (!match) {
    throw new Error(`No number found in prompt: ${text}`);
  }

  return Number(match[1]);
}

function factorize(value: number) {
  const factors: number[] = [];
  let remainder = value;

  for (let divisor = 2; divisor * divisor <= remainder; divisor += 1) {
    while (remainder % divisor === 0) {
      factors.push(divisor);
      remainder /= divisor;
    }
  }

  if (remainder > 1) {
    factors.push(remainder);
  }

  if (factors.length === 1 && factors[0] === value) {
    return PRIME_SHOUT;
  }

  return factors.join(" ");
}

function parseBaseConversionPrompt(prompt: string) {
  const match = prompt.match(/Convert ([0-9A-F]+) from (binary|decimal|hexadecimal) to (binary|decimal|hexadecimal)\./i);
  if (!match) {
    throw new Error(`Unsupported base-conversion prompt: ${prompt}`);
  }

  const [, rawValue, sourceLabel, targetLabel] = match;
  const sourceBase = sourceLabel.toLowerCase() === "binary" ? 2 : sourceLabel.toLowerCase() === "hexadecimal" ? 16 : 10;
  const targetBase = targetLabel.toLowerCase() === "binary" ? 2 : targetLabel.toLowerCase() === "hexadecimal" ? 16 : 10;
  return { rawValue, sourceBase, targetBase };
}

function solveBaseConversionPrompt(prompt: string) {
  const { rawValue, sourceBase, targetBase } = parseBaseConversionPrompt(prompt);
  const decimalValue = parseInt(rawValue, sourceBase);
  return targetBase === 16 ? decimalValue.toString(16).toUpperCase() : decimalValue.toString(targetBase);
}

function getWrongBaseConversionAnswer(prompt: string) {
  const { targetBase } = parseBaseConversionPrompt(prompt);
  const correctAnswer = solveBaseConversionPrompt(prompt);

  if (targetBase === 2) {
    if (correctAnswer === "0") {
      return "1";
    }

    return correctAnswer.endsWith("0")
      ? `${correctAnswer.slice(0, -1)}1`
      : `${correctAnswer.slice(0, -1)}0`;
  }

  if (targetBase === 10) {
    return String(Number(correctAnswer) + 1);
  }

  const upperAnswer = correctAnswer.toUpperCase();
  const replacement = upperAnswer.endsWith("F") ? "E" : "F";
  return `${upperAnswer.slice(0, -1)}${replacement}`;
}

function getRetryPenalty(score: number) {
  if (score <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(score * 0.1));
}

async function getLeaderboardScore(page: Page) {
  const text = (await page.getByTestId("leaderboard").locator("strong").first().textContent()) ?? "";
  const match = text.match(/-?\d+/);
  if (!match) {
    throw new Error(`No score found in leaderboard entry: ${text}`);
  }

  return Number(match[0]);
}

async function setRangeValue(locator: Locator, value: number) {
  const currentValue = Number(await locator.inputValue());
  const step = Number((await locator.getAttribute("step")) ?? "1");
  const min = Number((await locator.getAttribute("min")) ?? "0");
  const max = Number((await locator.getAttribute("max")) ?? "100");

  await locator.focus();
  if (value === min) {
    await locator.press("Home");
  } else if (value === max) {
    await locator.press("End");
  } else {
    const key = value >= currentValue ? "ArrowRight" : "ArrowLeft";
    const moveCount = Math.round(Math.abs(value - currentValue) / step);
    for (let index = 0; index < moveCount; index += 1) {
      await locator.press(key);
    }
  }

  await expect(locator).toHaveValue(String(value));
}

async function switchToEnglish(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^EN$/ }).click();
  await expect(page.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
}

test("landing keeps both forms inside a 720p viewport", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && /hydration|hydrated but some attributes/i.test(text)) {
      hydrationErrors.push(text);
    }
  });

  await switchToEnglish(page);
  await expect(page.getByTestId("create-room-button")).toBeVisible();
  await expect(page.getByTestId("join-room-button")).toBeVisible();

  const joinButtonBox = await page.getByTestId("join-room-button").boundingBox();
  expect(joinButtonBox).not.toBeNull();
  expect(joinButtonBox!.y + joinButtonBox!.height).toBeLessThanOrEqual(720);

  await page.screenshot({
    path: ".codex-artifacts/qa-landing.png",
    fullPage: true
  });

  const lightHeroBackground = await page.getByTestId("landing-hero").evaluate((element) => {
    return window.getComputedStyle(element).backgroundImage;
  });
  await page.getByRole("button", { name: "Dark" }).click();
  const darkHeroBackground = await page.getByTestId("landing-hero").evaluate((element) => {
    return window.getComputedStyle(element).backgroundImage;
  });
  expect(darkHeroBackground).not.toEqual(lightHeroBackground);
  expect(darkHeroBackground).toContain("rgb(48, 48, 47)");

  await page.screenshot({
    path: ".codex-artifacts/qa-dark-landing.png",
    fullPage: true
  });

  expect(hydrationErrors).toHaveLength(0);
});

test("nickname input sanitizes length and disallowed characters", async ({ page }) => {
  await switchToEnglish(page);

  await page.getByTestId("create-name-input").fill("Alpha<>Beta??1234567890");
  await expect(page.getByTestId("create-name-input")).toHaveValue("AlphaBeta123456");

  await page.getByTestId("create-room-button").click();
  await expect(page.getByTestId("room-name-button")).toContainText("AlphaBeta123456");
});

test("invite flow, ready gate, factor options, and final results all work together", async ({
  browser
}) => {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("HostAlpha");
  await hostPage.getByTestId("create-room-button").click();

  await expect(hostPage.getByTestId("room-name-button")).toHaveText("HostAlpha님의 방");
  await expect(hostPage.getByTestId("ready-button")).toHaveCount(0);
  await expect(hostPage.locator("body")).toContainText("host");

  const roomId = (await hostPage.getByTestId("room-id-chip").textContent())?.trim() ?? "";
  expect(roomId).toMatch(/^[A-Z0-9]{6}$/);

  await hostPage.getByTestId("room-name-button").click();
  await hostPage.getByTestId("room-name-input").fill("Night Sprint");
  await hostPage.getByTestId("room-name-input").press("Enter");
  await expect(hostPage.getByTestId("room-name-button")).toHaveText("Night Sprint");

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  expect(inviteUrl).toContain(`/room/${roomId}`);

  await hostPage.getByTestId("copy-invite-button").click();
  await expect(hostPage.locator("body")).toContainText("Invite link copied.");
  await expect
    .poll(async () => hostPage.evaluate(async () => navigator.clipboard.readText()))
    .toContain(`/room/${roomId}`);

  await hostPage.getByTestId("settings-button").click();
  await expect(hostPage.getByTestId("factor-prime-answer-toggle")).toBeAttached();
  await hostPage.getByTestId("factor-resolution-first-correct").click();
  await setRangeValue(hostPage.getByTestId("round-count-range"), 12);
  await expect(hostPage.locator("body")).toContainText("12 rounds");
  await setRangeValue(hostPage.getByTestId("round-count-range"), 3);
  await hostPage.getByTestId("factor-single-attempt-card").click();
  await expect(hostPage.getByTestId("factor-single-attempt-toggle")).toBeChecked();
  await expect(hostPage.locator("body")).toContainText("First-correct mode");
  await hostPage.getByRole("button", { name: "Close" }).click();

  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await expect(guestPage.getByTestId("invite-name-input")).toBeVisible();
  await guestPage.getByTestId("invite-name-input").fill("GuestBeta");
  await guestPage.getByTestId("invite-join-button").click();
  await expect(guestPage.getByTestId("ready-button")).toBeVisible();
  await expect(hostPage.locator("body")).toContainText("GuestBeta");
  await expect(hostPage.getByTestId("lobby-chat-list")).toContainText("GuestBeta joined the room.");

  await guestPage.getByTestId("player-name-button").click();
  await guestPage.getByTestId("player-name-input").fill("GuestNova");
  await guestPage.getByTestId("player-name-input").press("Enter");
  await expect(guestPage.getByTestId("player-name-button")).toHaveText("GuestNova");
  await expect(hostPage.locator("body")).toContainText("GuestNova");

  await hostPage.screenshot({
    path: ".codex-artifacts/qa-lobby.png",
    fullPage: true
  });

  await guestPage.getByTestId("ready-button").click();
  await expect(hostPage.locator("body")).toContainText("1/1 ready");
  await hostPage.getByTestId("settings-button").click();
  await setRangeValue(hostPage.getByTestId("time-limit-range"), 35);
  await expect(hostPage.locator("body")).toContainText("35s");
  await expect(hostPage.locator("body")).toContainText("0/1 ready");
  await hostPage.getByRole("button", { name: "Close" }).click();

  await hostPage.getByTestId("start-button").click();
  await expect(hostPage.locator("body")).toContainText(
    "Everyone needs to click ready before the host can start."
  );

  await guestPage.getByTestId("ready-button").click();
  await expect(hostPage.locator("body")).toContainText("1/1 ready");
  await hostPage.getByTestId("start-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();
  await expect(guestPage.getByTestId("answer-input")).toBeVisible();

  await expect(guestPage.getByTestId("chat-panel")).toBeVisible();
  await expect(guestPage.getByTestId("chat-input")).toBeVisible();
  await guestPage.getByTestId("chat-input").fill("hello room");
  await guestPage.getByTestId("chat-send-button").click();
  await expect(guestPage.getByTestId("chat-input")).toHaveValue("");

  await expect(hostPage.getByTestId("chat-panel")).toBeVisible();
  await expect(hostPage.getByTestId("chat-list")).toContainText("GuestNova");
  await expect(hostPage.getByTestId("chat-list")).toContainText("hello room");

  await hostPage.locator("body").click({ position: { x: 40, y: 40 } });
  await hostPage.keyboard.press("Enter");
  await expect(hostPage.getByTestId("answer-input")).toBeFocused();

  await guestPage.getByTestId("answer-input").fill("4 4");
  await guestPage.getByTestId("submit-answer-button").click();
  await expect(guestPage.getByTestId("locked-panel")).toBeVisible();
  await expect(hostPage.locator("body")).toContainText("tries 1");

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const prompt = (await hostPage.locator("h4").first().textContent()) ?? "";
    const answer = factorize(extractFirstNumber(prompt));
    await hostPage.getByTestId("answer-input").fill(answer);
    await hostPage.getByTestId("submit-answer-button").click();
    await expect(hostPage.getByTestId("round-reveal-panel")).toBeVisible();

    if (roundIndex === 0) {
      await hostPage.screenshot({
        path: ".codex-artifacts/qa-reveal.png",
        fullPage: true
      });
    }

    if (roundIndex < 2) {
      await expect(hostPage.getByTestId("answer-input")).toBeVisible({ timeout: 10_000 });
    }
  }

  await expect(hostPage.getByTestId("results-table")).toBeVisible({ timeout: 10_000 });
  await expect(hostPage.locator("body")).toContainText("Night Sprint");
  await expect(hostPage.locator("body")).toContainText("Returning to the lobby automatically");
  const frozenTotalTime = await hostPage.getByTestId("results-total-time").textContent();
  await hostPage.waitForTimeout(1200);
  await expect(hostPage.getByTestId("results-total-time")).toHaveText(frozenTotalTime ?? "");

  await hostPage.screenshot({
    path: ".codex-artifacts/qa-results.png",
    fullPage: true
  });

  await guestPage.getByRole("button", { name: "Return to lobby" }).click();
  await expect(hostPage.getByTestId("start-button")).toBeVisible({ timeout: 10_000 });
  await expect(hostPage.locator("body")).toContainText("0/1 ready");

  await hostContext.close();
  await guestContext.close();
});

test("golden bell mode gates the answer turn and penalizes a failed caller", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("BellHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("BellGuest");
  await guestPage.getByTestId("invite-join-button").click();

  await hostPage.getByTestId("settings-button").click();
  await hostPage.getByTestId("factor-resolution-golden-bell").click();
  await hostPage.getByTestId("factor-golden-bell-single-attempt-card").click();
  await hostPage.getByRole("button", { name: "Close" }).click();

  await guestPage.getByTestId("ready-button").click();
  await hostPage.getByTestId("start-button").click();

  await expect(hostPage.getByTestId("claim-answer-button")).toBeVisible();
  await expect(guestPage.getByTestId("claim-answer-button")).toBeVisible();
  await expect(hostPage.getByTestId("submit-answer-button")).toBeDisabled();
  await expect(guestPage.getByTestId("submit-answer-button")).toBeDisabled();

  await hostPage.getByTestId("claim-answer-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();
  await expect(guestPage.locator("body")).toContainText("BellHost");

  await hostPage.getByTestId("answer-input").fill("4 4");
  await hostPage.getByTestId("submit-answer-button").click();
  await expect(hostPage.getByTestId("locked-panel")).toBeVisible();
  await expect(hostPage.locator("body")).toContainText("60 points were deducted");

  await expect(guestPage.getByTestId("claim-answer-button")).toBeVisible({ timeout: 5_000 });
  await guestPage.getByTestId("claim-answer-button").click();
  await expect(guestPage.getByTestId("answer-input")).toBeVisible();

  const prompt = (await guestPage.locator("h4").first().textContent()) ?? "";
  await guestPage.getByTestId("answer-input").fill(factorize(extractFirstNumber(prompt)));
  await guestPage.getByTestId("submit-answer-button").click();
  await expect(guestPage.getByTestId("round-reveal-panel")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("golden bell keeps the input visible before buzzing and allows retries by default", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("RetryHost");
  await hostPage.getByTestId("create-room-button").click();
  await hostPage.getByTestId("settings-button").click();
  await hostPage.getByTestId("factor-resolution-golden-bell").click();
  await hostPage.getByRole("button", { name: "Close" }).click();
  await hostPage.getByTestId("start-button").click();

  await expect(hostPage.getByTestId("golden-bell-answer-panel")).toBeVisible();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();
  await expect(hostPage.getByTestId("submit-answer-button")).toBeDisabled();

  await hostPage.getByTestId("answer-input").fill("4 4");
  await hostPage.getByTestId("claim-answer-button").click();
  await expect(hostPage.getByTestId("answer-input")).toHaveValue("4 4");
  await expect(hostPage.getByTestId("submit-answer-button")).toBeVisible();

  await hostPage.getByTestId("submit-answer-button").click();
  await expect(hostPage.locator("body")).toContainText("60 points were deducted");
  await expect(hostPage.getByTestId("locked-panel")).toHaveCount(0);
  await expect(hostPage.getByTestId("claim-answer-button")).toBeVisible({ timeout: 5_000 });

  await hostContext.close();
});

test("golden bell blocks immediate reclaims by the same player until another player claims", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("TimerHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("TimerGuest");
  await guestPage.getByTestId("invite-join-button").click();

  await hostPage.getByTestId("settings-button").click();
  await hostPage.getByTestId("factor-resolution-golden-bell").click();
  await setRangeValue(hostPage.getByTestId("time-limit-range"), 15);
  await hostPage.getByRole("button", { name: "Close" }).click();

  await guestPage.getByTestId("ready-button").click();
  await hostPage.getByTestId("start-button").click();

  await hostPage.getByTestId("claim-answer-button").click();
  await expect(hostPage.getByTestId("claim-answer-button")).toBeDisabled();

  await hostPage.getByTestId("answer-input").fill("4 4");
  await hostPage.getByTestId("submit-answer-button").click();

  await expect(hostPage.getByTestId("claim-answer-button")).toBeDisabled();
  await guestPage.getByTestId("claim-answer-button").click();
  await expect(hostPage.getByTestId("claim-answer-button")).toBeDisabled();
  await guestPage.getByTestId("answer-input").fill("4 4");
  await guestPage.getByTestId("submit-answer-button").click();
  await expect(hostPage.getByTestId("claim-answer-button")).toBeEnabled();

  await hostContext.close();
  await guestContext.close();
});

test("golden bell moves to the next round when nobody solves before the main timer expires", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("ClockHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("ClockGuest");
  await guestPage.getByTestId("invite-join-button").click();

  await hostPage.getByTestId("settings-button").click();
  await hostPage.getByTestId("factor-resolution-golden-bell").click();
  await setRangeValue(hostPage.getByTestId("time-limit-range"), 15);
  await hostPage.getByRole("button", { name: "Close" }).click();

  await guestPage.getByTestId("ready-button").click();
  await hostPage.getByTestId("start-button").click();

  const firstPrompt = (await hostPage.locator("h4").first().textContent()) ?? "";
  await expect
    .poll(async () => ((await hostPage.locator("h4").first().textContent()) ?? "") !== firstPrompt, {
      timeout: 22_000
    })
    .toBeTruthy();

  await hostContext.close();
  await guestContext.close();
});

test("host can abort an active match and return everyone to the lobby", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("ResetHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("ResetGuest");
  await guestPage.getByTestId("invite-join-button").click();
  await guestPage.getByTestId("ready-button").click();

  await hostPage.getByTestId("start-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();
  await expect(guestPage.getByTestId("answer-input")).toBeVisible();
  await expect(hostPage.getByTestId("live-reset-button")).toBeVisible();
  await expect(guestPage.getByTestId("live-reset-button")).toHaveCount(0);

  await hostPage.getByTestId("live-reset-button").click();
  await expect(hostPage.getByTestId("start-button")).toBeVisible({ timeout: 10_000 });
  await expect(guestPage.getByTestId("ready-button")).toBeVisible({ timeout: 10_000 });
  await expect(hostPage.locator("body")).toContainText("Returned to the lobby.");

  await hostContext.close();
  await guestContext.close();
});

test("host keeps host rights after a page refresh and can still run the room", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("RefreshHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("RefreshGuest");
  await guestPage.getByTestId("invite-join-button").click();
  await guestPage.getByTestId("ready-button").click();
  await expect(hostPage.locator("body")).toContainText("1/1 ready");

  await hostPage.reload();
  await expect(hostPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await expect(hostPage.getByTestId("ready-button")).toHaveCount(0);
  await expect(hostPage.locator("body")).toContainText("host");
  await expect(hostPage.getByTestId("settings-button")).toBeVisible();
  await expect(hostPage.getByTestId("start-button")).toBeVisible();

  await hostPage.getByTestId("settings-button").click();
  await expect(hostPage.getByTestId("settings-modal")).toBeVisible();
  await hostPage.getByRole("button", { name: "Close" }).click();
  await expect(hostPage.getByTestId("settings-modal")).toHaveCount(0);

  await hostPage.getByTestId("start-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();
  await expect(guestPage.getByTestId("answer-input")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("mid-match joiners spectate first and can take a player seat back in the lobby", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const spectatorContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const spectatorPage = await spectatorContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("SpecHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";

  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("SpecGuest");
  await guestPage.getByTestId("invite-join-button").click();
  await guestPage.getByTestId("ready-button").click();
  await hostPage.getByTestId("start-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();

  await spectatorPage.goto(inviteUrl);
  await expect(spectatorPage.getByTestId("invite-name-input")).toBeVisible();
  await spectatorPage.getByTestId("invite-name-input").fill("SpecWatcher");
  await spectatorPage.getByTestId("invite-join-button").click();
  await expect(spectatorPage.getByTestId("spectator-panel")).toBeVisible();
  await expect(spectatorPage.locator("body")).toContainText("spectating");
  await expect(hostPage.locator("body")).toContainText("SpecWatcher");

  await hostPage.getByTestId("live-reset-button").click();
  await expect(spectatorPage.getByTestId("become-player-button")).toBeVisible({ timeout: 10_000 });
  await spectatorPage.getByTestId("become-player-button").click();
  await expect(spectatorPage.getByTestId("ready-button")).toBeVisible();
  await spectatorPage.getByTestId("ready-button").click();
  await guestPage.getByTestId("ready-button").click();
  await expect(hostPage.locator("body")).toContainText("2/2 ready");

  await hostContext.close();
  await guestContext.close();
  await spectatorContext.close();
});

test("mid-match joiners can enter as players immediately when match settings allow it", async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const lateContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const latePage = await lateContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("LateHost");
  await hostPage.getByTestId("create-room-button").click();
  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";

  await hostPage.getByTestId("match-settings-button").click();
  await hostPage.getByTestId("allow-mid-match-join-card").click();
  await hostPage.getByRole("button", { name: "Close" }).click();

  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("connection-badge")).toHaveText("socket live", {
    timeout: 15_000
  });
  await guestPage.getByTestId("invite-name-input").fill("LateGuest");
  await guestPage.getByTestId("invite-join-button").click();
  await guestPage.getByTestId("ready-button").click();

  await hostPage.getByTestId("start-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();

  await latePage.goto(inviteUrl);
  await expect(latePage.getByTestId("invite-name-input")).toBeVisible();
  await latePage.getByTestId("invite-name-input").fill("LateEntry");
  await latePage.getByTestId("invite-join-button").click();

  await expect(latePage.getByTestId("answer-input")).toBeVisible();
  await expect(latePage.getByTestId("spectator-panel")).toHaveCount(0);
  await expect(hostPage.locator("body")).toContainText("LateEntry");

  await hostContext.close();
  await guestContext.close();
  await lateContext.close();
});

test("base conversion mode supports fixed conversion pairs", async ({ page }) => {
  await switchToEnglish(page);
  await page.getByTestId("create-name-input").fill("BinarySolo");
  await page.getByTestId("create-mode-binary").click();
  await page.getByTestId("create-room-button").click();

  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-mode-binary").click();
  await page.getByTestId("base-pair-2-10").click();
  await expect(page.getByTestId("binary-preview-toggle")).toBeChecked();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("answer-input")).toBeVisible();

  const prompt = (await page.locator("h4").first().textContent()) ?? "";
  expect(prompt).toMatch(/from (binary|decimal) to (binary|decimal)\./i);

  await page.getByTestId("answer-input").fill("1010");
  await expect(page.getByTestId("binary-preview")).toContainText(/(decimal|binary) 10/i);
  await page.getByTestId("answer-input").fill(solveBaseConversionPrompt(prompt));
  await page.getByTestId("submit-answer-button").click();
  await expect(page.getByTestId("round-reveal-panel")).toBeVisible();

  await page.screenshot({
    path: ".codex-artifacts/qa-binary.png",
    fullPage: true
  });
});

test("factor retry mode deducts 10 percent of the current score after a wrong answer", async ({
  page
}) => {
  await switchToEnglish(page);
  await page.getByTestId("create-name-input").fill("PenaltyFactor");
  await page.getByTestId("create-room-button").click();

  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("answer-input")).toBeVisible();

  const firstPrompt = (await page.locator("h4").first().textContent()) ?? "";
  await page.getByTestId("answer-input").fill(factorize(extractFirstNumber(firstPrompt)));
  await page.getByTestId("submit-answer-button").click();
  await expect(page.getByTestId("round-reveal-panel")).toBeVisible();
  await expect(page.getByTestId("answer-input")).toBeVisible({ timeout: 10_000 });

  const scoreBeforePenalty = await getLeaderboardScore(page);
  const expectedPenalty = getRetryPenalty(scoreBeforePenalty);

  await page.getByTestId("answer-input").fill("4 4");
  await page.getByTestId("submit-answer-button").click();

  await expect(page.locator("body")).toContainText(`${expectedPenalty} points were deducted`);
  await expect.poll(() => getLeaderboardScore(page)).toBe(scoreBeforePenalty - expectedPenalty);
});

test("base conversion mode also deducts 10 percent of the current score after a wrong answer", async ({
  page
}) => {
  await switchToEnglish(page);
  await page.getByTestId("create-name-input").fill("PenaltyBinary");
  await page.getByTestId("create-mode-binary").click();
  await page.getByTestId("create-room-button").click();

  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("answer-input")).toBeVisible();

  const firstPrompt = (await page.locator("h4").first().textContent()) ?? "";
  await page.getByTestId("answer-input").fill(solveBaseConversionPrompt(firstPrompt));
  await page.getByTestId("submit-answer-button").click();
  await expect(page.getByTestId("round-reveal-panel")).toBeVisible();
  await expect(page.getByTestId("answer-input")).toBeVisible({ timeout: 10_000 });

  const scoreBeforePenalty = await getLeaderboardScore(page);
  const expectedPenalty = getRetryPenalty(scoreBeforePenalty);
  const nextPrompt = (await page.locator("h4").first().textContent()) ?? "";

  await page.getByTestId("answer-input").fill(getWrongBaseConversionAnswer(nextPrompt));
  await page.getByTestId("submit-answer-button").click();

  await expect(page.locator("body")).toContainText(`${expectedPenalty} points were deducted`);
  await expect.poll(() => getLeaderboardScore(page)).toBe(scoreBeforePenalty - expectedPenalty);
});

test("players can leave from the lobby and return to the main screen", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("LeaveHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("invite-name-input")).toBeVisible();
  await guestPage.getByTestId("invite-name-input").fill("LeaveGuest");
  await guestPage.getByTestId("invite-join-button").click();
  await expect(guestPage.getByTestId("leave-room-button")).toBeVisible();

  await guestPage.getByTestId("leave-room-button").click();
  await expect(guestPage.getByTestId("create-room-button")).toBeVisible({ timeout: 10_000 });
  await expect(hostPage.locator("body")).toContainText("LeaveGuest left the room.");

  await hostContext.close();
  await guestContext.close();
});

test("host can kick another player from the lobby", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await switchToEnglish(hostPage);
  await hostPage.getByTestId("create-name-input").fill("KickHost");
  await hostPage.getByTestId("create-room-button").click();

  const inviteUrl = (await hostPage.getByTestId("invite-url").textContent())?.trim() ?? "";
  await guestPage.goto(inviteUrl);
  await expect(guestPage.getByTestId("invite-name-input")).toBeVisible();
  await guestPage.getByTestId("invite-name-input").fill("KickGuest");
  await guestPage.getByTestId("invite-join-button").click();
  await expect(guestPage.getByTestId("leave-room-button")).toBeVisible();

  const guestPod = hostPage.getByTestId("player-pod").filter({ hasText: "KickGuest" });
  await guestPod.getByTestId("kick-player-button").click();

  await expect(guestPage.getByTestId("invite-name-input")).toBeVisible({ timeout: 10_000 });
  await expect(hostPage.locator("body")).toContainText("KickGuest was removed from the room.");

  await hostContext.close();
  await guestContext.close();
});
