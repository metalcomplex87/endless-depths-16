import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "melee");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/melee-" + Date.now();
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
  const url = BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_MELEE && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function main() {
  console.log("MELEE tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const begin = await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 5, lvl: 8 }));
    record("pris begin", !!(begin && begin.ok), JSON.stringify(begin || {}));
    const hook = await page.evaluate(() => ({
      mul: window.__ED16_MELEE.swingMul,
      kinds: window.__ED16_MELEE.kinds,
      reach: window.__ED16_MELEE.kinds.map((k) => [k, window.__ED16_MELEE.reach(k), window.__ED16_MELEE.afterMul(k)]),
    }));
    record("all 14 melee kinds listed", hook.kinds && hook.kinds.length === 14, JSON.stringify(hook.kinds || []));
    record("swing move multiplier is 1.28 (~22% slower)", hook.mul === 1.28, String(hook.mul));
    record("warhammer after-reach is 3 tiles, others 2", hook.reach.every(([k, r]) => k === "warhammer" ? r === 3 : r === 2), JSON.stringify(hook.reach));
    record("after-effect multipliers stay below ranged (0.3–0.55)", hook.reach.every(([, , m]) => m >= 0.3 && m <= 0.55), JSON.stringify(hook.reach));

    // Place a dummy foe one tile ahead, attack while stepping
    const moved = await page.evaluate(() => {
      const g = window.__ED16_DEEP ? null : null;
      // live game is installed
      const give = window.__ED16_MELEE.give("sword");
      const st = window.__ED16_DEEP.state();
      // spawn foe to the right via deep? use attackMove after planting via evaluate map
      return give;
    });
    record("give sword", !!(moved && moved.ok && moved.range === 0), JSON.stringify(moved || {}));

    const withFoe = await page.evaluate(() => {
      const r = window.__ED16_MELEE.give("axe");
      const plant = window.__ED16_MELEE.plant(1, 0);
      const atk = window.__ED16_MELEE.attackMove(1, 0);
      // attack cooldown is running, but movement is not locked by the swing
      const sidestep = window.__ED16_MELEE.attackMove(0, 1, true);
      return { r, plant, atk, sidestep };
    });
    const atk = withFoe && withFoe.atk;
    const step = withFoe && withFoe.sidestep;
    record("planted a foe to swing at", !!(withFoe && withFoe.plant && withFoe.plant.ok), JSON.stringify(withFoe && withFoe.plant));
    record(
      "melee swing uses acd and a swing window, not a full movement lock",
      !!(atk && atk.ok && (atk.acd ?? 0) > 0 && (atk.swT ?? 0) > atk.now),
      JSON.stringify(atk || {}),
    );
    record(
      "melee can attack and move in the same action (or sidestep if the foe still blocks)",
      !!((atk && (atk.x !== atk.before.x || atk.y !== atk.before.y)) || (step && (step.x !== step.before.x || step.y !== step.before.y))),
      JSON.stringify({ atk, step }),
    );
    record("swing window slows step duration", !!(atk && atk.step > atk.baseStep * 1.2), JSON.stringify({ step: atk && atk.step, base: atk && atk.baseStep, after: step && step.step }));

    const two = await page.evaluate(() => window.__ED16_MELEE.give("warhammer"));
    record("two-handed warhammer is still melee (range 0)", !!(two && two.ok && two.range === 0 && two.two), JSON.stringify(two || {}));

    const shotPath = path.join(SHOTS, "melee-reach-412x780.png");
    await page.screenshot({ path: shotPath, fullPage: false });
    record("melee screenshot", fs.existsSync(shotPath) && fs.statSync(shotPath).size > 1000, shotPath);

    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("MELEE " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
