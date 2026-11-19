// Headless check: a pet opens a nearby chest and the loot is collected with no player input.
import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900) : ""));
  return !!pass;
}

async function main() {
  const userDir = "/tmp/ed16-profiles/pet-chests-" + Date.now();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.petLootChest), { timeout: 20000 });
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 30, lvl: 60 }));
  await sleep(300);
  const r = await page.evaluate(() => window.__ED16_HZ.petLootChest());
  record("pet targets a nearby unopened chest", !!r.targeted, r);
  record("pet opens the chest with no hero movement", !!r.opened && !!r.heroStill, r);
  record("chest loot is collected (gold taken, no leftover drops by the chest)", !!r.collected && r.goldGain > 0 && r.leftover === 0, r);
  await browser.close();
  const failed = results.filter((x) => !x.pass);
  console.log(failed.length ? ("FAILED " + failed.length + "/" + results.length) : ("ALL " + results.length + " PASSED"));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
