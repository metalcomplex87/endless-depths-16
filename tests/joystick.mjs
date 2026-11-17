import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "layout");
fs.mkdirSync(SHOTS, { recursive: true });

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

const DIRS = [
  { name: "up", dx: 0, dy: -1 },
  { name: "up-right", dx: 1, dy: -1 },
  { name: "right", dx: 1, dy: 0 },
  { name: "down-right", dx: 1, dy: 1 },
  { name: "down", dx: 0, dy: 1 },
  { name: "down-left", dx: -1, dy: 1 },
  { name: "left", dx: -1, dy: 0 },
  { name: "up-left", dx: -1, dy: -1 },
];

async function launch() {
  const userDir = "/tmp/ed16-profiles/joystick";
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  // Primary acceptance viewport: top toolbar + nav, visual 412x780.
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent(UA);
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => {
    const vv = { width: 412, height: 780, offsetTop: 56, offsetLeft: 0, scale: 1, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "visualViewport", { configurable: true, get() { return vv; } });
    window.__ED16_FORCE_VV = { width: 412, height: 780, offsetTop: 56, offsetLeft: 0 };
  });
  return { browser, page };
}

async function openPlay(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => (document.body.innerText || "").includes("Profiles") || (document.body.innerText || "").includes("Choose a profile"), { timeout: 20000 });
  await sleep(400);
  const tapped = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes("Jax"));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  if (!tapped) throw new Error("could not tap Jax");
  await page.waitForFunction(() => {
    const cv = document.querySelector("canvas.dc-cv");
    const bag = [...document.querySelectorAll("button")].some((el) => /Bag/.test(el.textContent || ""));
    const title = [...document.querySelectorAll("button")].some((el) => /✦\s*New Game/.test(el.textContent || ""));
    return !!(cv && bag && !title);
  }, { timeout: 15000 });
  await page.waitForSelector(".dc-stick", { timeout: 10000 });
  await sleep(400);
}

async function padState(page) {
  return page.evaluate(() => window.__ED16_PAD || { held: false, dx: 0, dy: 0, steps: [] });
}

async function main() {
  console.log("JOYSTICK tests against " + BASE);
  let browser;
  try {
    const launched = await launch();
    browser = launched.browser;
    const page = launched.page;
    await openPlay(page);

    const box = await page.$eval(".dc-stick", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    record("joystick is on screen and large", box.w >= 120 && box.h >= 120 && box.y >= 50, JSON.stringify(box));
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rad = Math.min(box.w, box.h) * 0.38;

    await page.evaluate(() => { window.__ED16_PAD = { held: false, dx: 0, dy: 0, steps: [] }; });
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await sleep(80);
    const atCenter = await padState(page);
    record("press in the dead zone does not start a move", atCenter.held === true && atCenter.dx === 0 && atCenter.dy === 0 && atCenter.steps.length === 0, JSON.stringify(atCenter));

    const seen = [];
    for (const d of DIRS) {
      await page.mouse.move(cx + d.dx * rad, cy + d.dy * rad, { steps: 4 });
      await sleep(120);
      const st = await padState(page);
      const ok = !!(st.held && st.dx === d.dx && st.dy === d.dy);
      record("slide (no lift) to " + d.name + " updates direction", ok, JSON.stringify(st));
      if (ok) seen.push(d.name);
    }
    record("all 8 directions were reached without lifting", seen.length === 8, seen.join(","));

    const beforeHold = await padState(page);
    const stepsBefore = beforeHold.steps.length;
    await sleep(500);
    const duringHold = await padState(page);
    record("held stick keeps repeating moves in the last direction", duringHold.held && duringHold.dx === -1 && duringHold.dy === -1 && duringHold.steps.length > stepsBefore,
      JSON.stringify({ stepsBefore, stepsAfter: duringHold.steps.length, last: duringHold }));

    const shot = path.join(SHOTS, "joystick-held-top-toolbar-412x780.png");
    await page.screenshot({ path: shot, fullPage: false });
    record("held-stick screenshot", true, shot);

    await page.mouse.up();
    await sleep(80);
    const released = await padState(page);
    const stepsAtRelease = released.steps.length;
    record("release stops the hold", released.held === false && released.dx === 0 && released.dy === 0, JSON.stringify(released));
    await sleep(500);
    const afterRelease = await padState(page);
    record("no more move repeats after release", afterRelease.held === false && afterRelease.steps.length === stepsAtRelease,
      JSON.stringify({ stepsAtRelease, stepsLater: afterRelease.steps.length }));

    // Keyboard still works after the stick is released.
    await page.evaluate(() => { window.__ED16_PAD = { held: false, dx: 0, dy: 0, steps: [] }; });
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    });
    await sleep(80);
    const keyHeld = await padState(page);
    record("keyboard ArrowRight still starts a hold", keyHeld.held && keyHeld.dx === 1 && keyHeld.dy === 0, JSON.stringify(keyHeld));
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    });
    await sleep(80);
    const keyUp = await padState(page);
    record("keyboard keyup stops the hold", keyUp.held === false, JSON.stringify(keyUp));
  } catch (err) {
    record("ERROR", false, err && err.stack ? err.stack : String(err));
  } finally {
    if (browser) try { await browser.close(); } catch { /* */ }
  }
  const failed = results.filter((r) => !r.pass);
  console.log("----");
  console.log("JOYSTICK " + (results.length - failed.length) + " passed, " + failed.length + " failed");
  if (failed.length) {
    for (const f of failed) console.log(" - " + f.step + ": " + f.detail);
    process.exitCode = 1;
  }
}

main();
