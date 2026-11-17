import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "gibs");
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
  const userDir = "/tmp/ed16-profiles/gibs";
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
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
  await page.waitForFunction(() => !!(window.__ED16_GIBS && window.__ED16_GIBS.begin), { timeout: 10000 });
  await sleep(300);
}

async function begin(page, kind, dx, dy, faceDx, faceDy) {
  return page.evaluate((k, x, y, fx, fy) => window.__ED16_GIBS.begin(k, x, y, fx, fy), kind, dx, dy, faceDx, faceDy);
}
async function end(page) {
  return page.evaluate(() => { window.__ED16_GIBS.end(); });
}

async function main() {
  console.log("GIBS tests against " + BASE);
  const { browser, page } = await launch();
  try {
    await openPlay(page);

    for (const d of DIRS) {
      const r = await begin(page, "melee", d.dx, d.dy, -d.dx, -d.dy);
      await end(page);
      const faceAway = r && typeof r.face === "object" && r.face.dot < 0;
      record(
        "melee " + d.name + " follows player→enemy, not facing",
        !!(r && r.ok && r.dead && r.n >= 8 && r.align > 0.65 && faceAway),
        JSON.stringify(r || {}),
      );
    }

    const proj = await begin(page, "proj", 1, 0);
    await end(page);
    record(
      "projectile burst follows travel direction at impact",
      !!(proj && proj.ok && proj.dead && proj.n >= 8 && proj.align > 0.65),
      JSON.stringify(proj || {}),
    );

    const aoe = await begin(page, "aoe", 1, 0);
    await end(page);
    record(
      "AoE / nova burst is outward from the blast center",
      !!(aoe && aoe.ok && aoe.dead && aoe.n >= 8 && aoe.align > 0.65),
      JSON.stringify(aoe || {}),
    );

    const shot = await begin(page, "melee", 1, 0, -1, 0);
    if (shot && shot.n >= 8) {
      await page.evaluate(() => window.__ED16_GIBS.tick(0.16));
      await sleep(80);
      const shotPath = path.join(SHOTS, "mid-burst-top-toolbar-412x780.png");
      await page.screenshot({ path: shotPath, fullPage: false });
      record("mid-burst screenshot", fs.existsSync(shotPath) && fs.statSync(shotPath).size > 1000, shotPath);
    } else {
      record("mid-burst screenshot", false, JSON.stringify(shot || {}));
    }
    await end(page);
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    try { await page.evaluate(() => window.__ED16_GIBS && window.__ED16_GIBS.end()); } catch { /* ignore */ }
    await browser.close();
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log("----");
  console.log("GIBS " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

main();
