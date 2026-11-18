import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "polish");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/polish-" + Date.now();
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
  await page.waitForFunction(() => !!(window.__ED16_POLISH && window.__ED16_PRIS && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function main() {
  console.log("POLISH tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const hook = await page.evaluate(() => ({
      hasButton: window.__ED16_POLISH.hasButton,
      cost: window.__ED16_POLISH.cost({}),
      apply: window.__ED16_POLISH.apply(),
      pre: window.__ED16_POLISH.preHasPolished,
    }));
    record("no polish action hook button", hook.hasButton === false, JSON.stringify(hook));
    record("polishCost is always 0", hook.cost === 0, String(hook.cost));
    record("polishItem is a no-op message", /removed/i.test(String(hook.apply || "")), String(hook.apply));
    record("display adjective Polished remains in PRE", hook.pre === true, String(hook.pre));

    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 5, lvl: 8 }));
    // open bag if possible
    await page.evaluate(() => { if (window.__ED16_PRIS.openInv) window.__ED16_PRIS.openInv(true); });
    await sleep(200);
    const ui = await page.evaluate(() => {
      const txt = document.body.innerText || "";
      const buttons = [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
      return { hasPolish: buttons.some((t) => /^Polish/.test(t)) || /\bPolish\b/.test(txt) && /gems\)/.test(txt), buttons: buttons.filter((t) => /Polish|gem/i.test(t)) };
    });
    record("no Polish button in the bag UI", !ui.hasPolish, JSON.stringify(ui.buttons));
    const shotPath = path.join(SHOTS, "bag-no-polish-412x780.png");
    await page.screenshot({ path: shotPath, fullPage: false });
    record("polish-absent screenshot", fs.existsSync(shotPath) && fs.statSync(shotPath).size > 1000, shotPath);
    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("POLISH " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
