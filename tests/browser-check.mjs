import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, stat } from "node:fs/promises";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const output = "test-results";
await mkdir(output, { recursive: true });
try {
  await page.clock.install();
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173");
  await page.waitForTimeout(1400);
  assert.equal(
    await page.locator("#sceneCaption").innerText(),
    "로켓 확대 · 자동 시야",
  );
  for (const [width, height] of [
    [1920, 1080],
    [1440, 1000],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [760, 700],
    [430, 932],
    [390, 844],
    [375, 667],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(60);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      bad: [
        "#launchBtn",
        "#resetBtn",
        "#fraction",
        ".fuel-options",
        ".telemetry",
        "#applyThreshold",
        "#playbackRate",
      ].filter((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return (
          r.left < 0 || r.right > innerWidth || r.width < 1 || r.height < 1
        );
      }),
    }));
    assert.equal(layout.overflow, false, `overflow at ${width}`);
    assert.deepEqual(layout.bad, [], `clipping at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.locator("#aboutBtn").click();
  assert.ok(await page.locator("#infoModal").isVisible());
  await page.keyboard.press("Escape");
  assert.ok(
    await page
      .locator("#aboutBtn")
      .evaluate((e) => e === document.activeElement),
  );
  for (const [id, fraction] of [
    ["rp1", "98.2"],
    ["ch4", "96.9"],
    ["lh2", "94.1"],
  ]) {
    await page.locator(`[data-fuel=${id}]`).click();
    await page.locator("#applyThreshold").click();
    assert.equal(await page.locator("#fraction").inputValue(), fraction);
    assert.equal(await page.locator("#escapeValue").innerText(), "탈출 가능");
  }
  await page.locator("#fraction").fill("95");
  await page.locator("#launchBtn").click();
  await page.clock.runFor(2400);
  await page.screenshot({ path: `${output}/powered-flight.png` });
  await page.locator("#playbackRate").selectOption("1200");
  await page.clock.runFor(500);
  assert.ok(
    Number((await page.locator("#timeVal").innerText()).replaceAll(",", "")) >
      350,
  );
  assert.equal(await page.locator("#phaseText").innerText(), "관성 상승");
  assert.ok(await page.locator("#compareBtn").isVisible());
  await page.locator("#launchBtn").click();
  const frozen = await page.locator("#timeVal").innerText();
  await page.clock.runFor(500);
  assert.equal(await page.locator("#timeVal").innerText(), frozen);
  await page.screenshot({ path: `${output}/coasting-flight.png` });
  await page.locator("#compareBtn").click();
  assert.equal(await page.locator("#compareRows tr").count(), 3);
  assert.ok(
    (await page.locator("#compareRows").innerText()).includes("11.519"),
  );
  await page.screenshot({ path: `${output}/comparison.png` });
  const downloading = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const download = await downloading;
  await download.saveAs(`${output}/report.png`);
  assert.ok((await stat(`${output}/report.png`)).size > 10000);
  await page.keyboard.press("Escape");
  await page.locator("#launchBtn").click();
  await page.clock.runFor(6000);
  await page.locator("#launchBtn").click();
  assert.equal(await page.locator("#phaseText").innerText(), "일시 정지");
  assert.equal((await page.locator("#timeUnit").innerText()).trim(), "h");
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(80);
    assert.ok(
      await page
        .locator(".telemetry")
        .evaluate((e) => e.getBoundingClientRect().right <= innerWidth),
    );
    if (width === 390)
      await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("[data-fuel=rp1]").click();
  await page.locator("#fraction").fill("86");
  await page.locator("#launchBtn").click();
  await page.clock.runFor(800);
  assert.equal(await page.locator("#phaseText").innerText(), "낙하");
  assert.ok(
    Number((await page.locator("#velVal").innerText()).replaceAll(",", "")) < 0,
  );
  await page.clock.runFor(600);
  assert.equal(await page.locator("#phaseText").innerText(), "지표면 도달");
  assert.equal(await page.locator("#altVal").innerText(), "0.00");
  assert.equal(await page.locator("#launchLabel").innerText(), "다시 발사");
  await page.locator("#resetBtn").click();
  assert.equal(await page.locator("#velVal").innerText(), "0.000");
  assert.equal(await page.locator("#compareBtn").isVisible(), false);
  await page.evaluate(() => {
    window.clearCount = 0;
    const original = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (...args) {
      window.clearCount++;
      return original.apply(this, args);
    };
  });
  await page.clock.runFor(500);
  assert.equal(
    await page.evaluate(() => window.clearCount),
    0,
    "idle rendering",
  );
  await page.locator("#launchBtn").click();
  await page.clock.runFor(1000);
  await page.locator("#launchBtn").click();
  const clearCount = await page.evaluate(() => window.clearCount);
  assert.ok(clearCount > 0 && clearCount <= 110, "30 fps rendering budget");
  await page.locator("[data-fuel=ch4]").click();
  assert.equal(await page.locator("#phaseText").innerText(), "발사 전");
  assert.equal(await page.locator("#velVal").innerText(), "0.000");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        layouts: 11,
        webgl: "pass",
        unlimitedFlight: "pass",
        descentAndImpact: "pass",
        thresholdApplication: "pass",
        pauseResume: "pass",
        comparisonAndPNG: "pass",
        keyboard: "pass",
        idleRendering: "none",
        renderBudget: "30 fps",
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
