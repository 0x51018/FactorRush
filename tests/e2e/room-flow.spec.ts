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

function solveBinaryPrompt(prompt: string) {
  const value = extractFirstNumber(prompt);
  if (/to binary/i.test(prompt)) {
    return value.toString(2);
  }

  const binaryMatch = prompt.match(/[01]{3,}/);
  if (!binaryMatch) {
    throw new Error(`No binary input found in prompt: ${prompt}`);
  }

  return String(parseInt(binaryMatch[0], 2));
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
  expect(darkHeroBackground).toContain("46, 50, 62");

  await page.screenshot({
    path: ".codex-artifacts/qa-dark-landing.png",
    fullPage: true
  });
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
  await expect(hostPage.getByTestId("factor-prime-answer-select")).toBeVisible();
  await hostPage.getByTestId("factor-resolution-select").selectOption("first-correct");
  await setRangeValue(hostPage.getByTestId("round-count-range"), 12);
  await expect(hostPage.locator("body")).toContainText("12 rounds");
  await setRangeValue(hostPage.getByTestId("round-count-range"), 3);
  await hostPage.getByTestId("factor-single-attempt-toggle").click();
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

  await hostPage.screenshot({
    path: ".codex-artifacts/qa-lobby.png",
    fullPage: true
  });

  await guestPage.getByTestId("ready-button").click();
  await expect(hostPage.locator("body")).toContainText("1/1 ready");
  await hostPage.getByTestId("settings-button").click();
  await setRangeValue(hostPage.getByTestId("time-limit-range"), 35);
  await expect(hostPage.locator("body")).toContainText(
    "Rules changed and ready states were cleared."
  );
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

  await hostPage.locator("body").click({ position: { x: 40, y: 40 } });
  await hostPage.keyboard.press("Enter");
  await expect(hostPage.getByTestId("answer-input")).toBeFocused();

  await guestPage.getByTestId("answer-input").fill("hello");
  await guestPage.getByTestId("submit-answer-button").click();
  await expect(guestPage.getByTestId("answer-input")).toHaveValue("");

  await hostPage.locator("body").click({ position: { x: 40, y: 40 } });
  await hostPage.keyboard.press("/");
  await expect(hostPage.getByTestId("activity-panel")).toContainText("GuestBeta");
  await expect(hostPage.getByTestId("activity-panel")).toContainText("hello");
  await hostPage.getByRole("button", { name: "Close" }).click();

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
  await hostPage.getByTestId("factor-resolution-select").selectOption("golden-bell");
  await hostPage.getByRole("button", { name: "Close" }).click();

  await guestPage.getByTestId("ready-button").click();
  await hostPage.getByTestId("start-button").click();

  await expect(hostPage.getByTestId("claim-answer-button")).toBeVisible();
  await expect(guestPage.getByTestId("claim-answer-button")).toBeVisible();

  await hostPage.getByTestId("claim-answer-button").click();
  await expect(hostPage.getByTestId("answer-input")).toBeVisible();
  await expect(guestPage.getByTestId("golden-bell-waiting-panel")).toContainText("BellHost");

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

test("binary mode can be forced to decimal to binary", async ({ page }) => {
  await switchToEnglish(page);
  await page.getByTestId("create-name-input").fill("BinarySolo");
  await page.getByTestId("create-mode-select").selectOption("binary");
  await page.getByTestId("create-room-button").click();

  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-mode-select").selectOption("binary");
  await setRangeValue(page.getByTestId("binary-ratio-range"), 100);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("answer-input")).toBeVisible();

  const prompt = (await page.locator("h4").first().textContent()) ?? "";
  expect(prompt).toMatch(/to binary/i);

  await page.getByTestId("answer-input").fill(solveBinaryPrompt(prompt));
  await page.getByTestId("submit-answer-button").click();
  await expect(page.getByTestId("round-reveal-panel")).toBeVisible();

  await page.screenshot({
    path: ".codex-artifacts/qa-binary.png",
    fullPage: true
  });
});
