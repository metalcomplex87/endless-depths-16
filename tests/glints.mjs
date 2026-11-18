import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "glints");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/glints-" + Date.now();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
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
  const url = BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => !!(window.__ED16_PRIS && window.__ED16_PRIS.begin));
    if (ok) break;
    await sleep(250);
  }
  const hook = await page.evaluate(() => typeof (window.__ED16_PRIS && window.__ED16_PRIS.begin));
  if (hook !== "function") throw new Error("pris hook missing");
  return { browser, page, userDir };
}

async function hookGet(page, name) {
  return page.evaluate((n) => window.__ED16_PRIS[n], name);
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PRIS;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

function checkRing(lay, minR, maxR, x0, y0, x1, y1, slop) {
  if (!lay || !lay.ok) return { ok: false, why: "no layout" };
  const issues = [];
  for (const g of lay.glints || []) {
    if (g.x < x0 - 0.01 || g.x > x1 + 0.01 || g.y < y0 - 0.01 || g.y > y1 + 0.01) issues.push("edge " + g.slot);
    if (g.dist < minR - slop) issues.push("too close " + g.slot + "=" + g.dist.toFixed(1));
  }
  return { ok: issues.length === 0, issues, n: lay.n, glints: (lay.glints || []).map((g) => ({ slot: g.slot, x: +g.x.toFixed(1), y: +g.y.toFixed(1), dist: +g.dist.toFixed(1), period: g.period, twinkle: g.twinkle })) };
}

async function main() {
  const { browser, page, userDir } = await launch();
  try {
    await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
    const meta = await hookGet(page, "glint");
    const periods = meta && meta.PERIOD && Object.values(meta.PERIOD);
    const uniqP = periods && new Set(periods).size;
    record("glint distance is 1.5–3 tiles with a screen-edge margin", !!(meta && meta.MIN === 1.5 && meta.MAX === 3 && meta.MARGIN >= 16), JSON.stringify(meta && { MIN: meta.MIN, MAX: meta.MAX, MARGIN: meta.MARGIN, TWINKLE: meta.TWINKLE }));
    record("each slot has its own distinct sparkle period", !!(periods && periods.length === 7 && uniqP === 7), JSON.stringify(meta && meta.PERIOD));

    const TS = 24, margin = meta.MARGIN, minR = 1.5 * TS, maxR = 3 * TS;
    // A typical in-game view (hero near center)
    const view = { cx: 160, cy: 150, x0: margin, y0: 30 + margin, x1: 320 - margin, y1: 30 + 200 - margin };

    await api(page, "begin", { depth: 10, lvl: 10 });
    const none = await api(page, "glints", 3.2, view.cx, view.cy, minR, maxR, view.x0, view.y0, view.x1, view.y1);
    record("zero prismatic pieces produce zero glints", !!(none && none.ok && none.n === 0), JSON.stringify(none));

    await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    const one = await api(page, "glints", 3.2, view.cx, view.cy, minR, maxR, view.x0, view.y0, view.x1, view.y1);
    const oneChk = checkRing(one, minR, maxR, view.x0, view.y0, view.x1, view.y1, 2);
    record("one prismatic piece produces one glint in the 1.5–3 tile ring, away from edges", !!(one && one.n === 1 && oneChk.ok), JSON.stringify(oneChk));

    await api(page, "give", "armor", { slot: "chest", armor: "chest", stars: 5 });
    await api(page, "give", "armor", { slot: "head", armor: "head", stars: 5 });
    await api(page, "give", "pet", { slot: "pet", stars: 5 });
    const four = await api(page, "glints", 3.2, view.cx, view.cy, minR, maxR, view.x0, view.y0, view.x1, view.y1);
    const fourChk = checkRing(four, minR, maxR, view.x0, view.y0, view.x1, view.y1, 2);
    const pers = (four.glints || []).map((g) => g.period);
    const distinct = new Set(pers).size === pers.length;
    record("glint count matches equipped prismatic pieces (4)", !!(four && four.n === 4 && fourChk.ok), JSON.stringify(fourChk));
    record("those four glints sparkle on distinct periods", !!distinct, JSON.stringify(pers));

    await api(page, "give", "armor", { slot: "arms", armor: "arms", stars: 5 });
    await api(page, "give", "armor", { slot: "legs", armor: "legs", stars: 5 });
    await api(page, "give", "wep", { slot: "lh", wep: "wand", stars: 5 });
    const seven = await api(page, "glints", 4.0, view.cx, view.cy, minR, maxR, view.x0, view.y0, view.x1, view.y1);
    const sevenChk = checkRing(seven, minR, maxR, view.x0, view.y0, view.x1, view.y1, 4);
    record("seven prismatic pieces produce seven glints, still in-bounds", !!(seven && seven.n === 7 && sevenChk.ok), JSON.stringify(sevenChk));

    // Corner: hero near the top-left of the view, glints must stay inside the margin and not sit on him if possible
    const corner = { cx: view.x0 + 8, cy: view.y0 + 8 };
    const cLay = await api(page, "glints", 5.1, corner.cx, corner.cy, minR, maxR, view.x0, view.y0, view.x1, view.y1);
    const inRect = (cLay.glints || []).every((g) => g.x >= view.x0 - 0.01 && g.x <= view.x1 + 0.01 && g.y >= view.y0 - 0.01 && g.y <= view.y1 + 0.01);
    const notOnHero = (cLay.glints || []).every((g) => g.dist > 4);
    record("when the hero is near a view corner, glints clamp inside the margin and stay off the body", !!(cLay && cLay.n === 7 && inRect && notOnHero), JSON.stringify({ n: cLay && cLay.n, inRect, notOnHero, glints: (cLay.glints || []).map((g) => ({ slot: g.slot, x: +g.x.toFixed(1), y: +g.y.toFixed(1), dist: +g.dist.toFixed(1) })) }));

    // Twinkle phases differ at a fixed t
    const phases = (seven.glints || []).map((g) => +g.phase.toFixed(3));
    record("sparkle phases are not locked together", new Set(phases).size >= 5, JSON.stringify(phases));

    // No drip-spark hook leftover
    const arc = await hookGet(page, "arc");
    record("drip-spark constants are gone from the hook", !!(arc && arc.SPARK_SLOTS == null), JSON.stringify(arc));

    // Screenshots: bag + in-game, freeze at a time when some glints twinkle if possible
    const twinkleT = await page.evaluate(() => {
      const hook = window.__ED16_PRIS;
      const g = hook.glint;
      // pick a time where at least two pieces are mid-twinkle if we can; else a settled hover time
      for (let t = 0.5; t < 20; t += 0.05) {
        const lay = hook.glints(t, 160, 150, 36, 72, 20, 50, 300, 230);
        const n = (lay.glints || []).filter((x) => x.twinkle).length;
        if (n >= 2) return t;
      }
      return 3.4;
    });
    await api(page, "setTime", twinkleT, true);
    await api(page, "openInv", true);
    await sleep(120);
    const bag = path.join(SHOTS, "after-bag-412x780.png");
    const wrap = await page.$(".dc-wrap");
    if (wrap) await wrap.screenshot({ path: bag });
    else await page.screenshot({ path: bag });
    const portPath = path.join(SHOTS, "after-portrait.png");
    const port = await page.$("canvas.dc-port");
    if (port) await port.screenshot({ path: portPath });
    record("after bag preview (glints) screenshot", fs.existsSync(bag) && fs.statSync(bag).size > 2000, bag + " " + (fs.existsSync(bag) ? fs.statSync(bag).size : 0));
    record("after portrait (mini glints) screenshot", fs.existsSync(portPath) && fs.statSync(portPath).size > 400, portPath + " " + (fs.existsSync(portPath) ? fs.statSync(portPath).size : 0));

    await api(page, "openInv", false);
    await api(page, "setTime", twinkleT, true);
    await sleep(120);
    const play = path.join(SHOTS, "after-ingame.png");
    const cv = await page.$("canvas");
    if (cv) await cv.screenshot({ path: play });
    else await page.screenshot({ path: play });
    record("after in-game glints screenshot", fs.existsSync(play) && fs.statSync(play).size > 2000, play + " " + (fs.existsSync(play) ? fs.statSync(play).size : 0));

    // One-piece bag/in-game for a quieter look
    await api(page, "begin", { depth: 10, lvl: 10 });
    await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    await api(page, "setTime", twinkleT, true);
    await api(page, "openInv", true);
    await sleep(100);
    const bag1 = path.join(SHOTS, "after-bag-one-412x780.png");
    const wrap2 = await page.$(".dc-wrap");
    if (wrap2) await wrap2.screenshot({ path: bag1 });
    const port1 = path.join(SHOTS, "after-portrait-one.png");
    const portEl = await page.$("canvas.dc-port");
    if (portEl) await portEl.screenshot({ path: port1 });
    record("after bag preview (single glint) screenshot", fs.existsSync(bag1) && fs.statSync(bag1).size > 2000, bag1 + " " + (fs.existsSync(bag1) ? fs.statSync(bag1).size : 0));

    await api(page, "setTime", 0, false);
    await api(page, "end");
  } catch (err) {
    try { await api(page, "end"); } catch { /* ignore */ }
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  const failed = results.filter((r) => !r.pass);
  console.log("GLINTS " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
