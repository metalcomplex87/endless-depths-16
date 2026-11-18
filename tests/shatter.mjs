import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "shatter");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/shatter-" + Date.now();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new", userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_SHATTER && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function main() {
  console.log("SHATTER tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const begin = await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 5, lvl: 8 }));
    record("pris begin", !!(begin && begin.ok), JSON.stringify(begin || {}));
    const meta = await page.evaluate(() => ({ cap: window.__ED16_SHATTER.cap, cone: window.__ED16_SHATTER.cone }));
    record("shard cap is 36", meta.cap === 36, JSON.stringify(meta));
    record("shatter uses the same death cone as gibs (0.65)", meta.cone === 0.65, JSON.stringify(meta));

    const burst = await page.evaluate(() => window.__ED16_SHATTER.burst(1, 0));
    record("shatter spawns 2-5 chunks (or 4-5 for bosses) along the cone", !!(burst && burst.ok && burst.n >= 2 && burst.n <= 5), JSON.stringify(burst || {}));
    record("most shards lie in the killing-blow cone", !!(burst && burst.n && burst.inCone / burst.n >= 0.8), JSON.stringify(burst || {}));

    await page.evaluate(() => window.__ED16_GIBS && window.__ED16_GIBS.tick(0.12));
    const shotPath = path.join(SHOTS, "shatter-burst-412x780.png");
    await page.screenshot({ path: shotPath, fullPage: false });
    record("shatter screenshot", fs.existsSync(shotPath) && fs.statSync(shotPath).size > 1000, shotPath);

    const cap = await page.evaluate(() => {
      for (let i = 0; i < 20; i++) window.__ED16_SHATTER.burst(1, 0);
      return window.__ED16_SHATTER.shards().length;
    });
    record("active shards are capped", cap <= 36, String(cap));
    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("SHATTER " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
