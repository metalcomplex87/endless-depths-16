import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "bladefx");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/bladefx-" + Date.now();
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
  let hook = null;
  for (let i = 0; i < 40; i++) {
    hook = await page.evaluate(() => ({
      pris: typeof (window.__ED16_PRIS && window.__ED16_PRIS.begin),
      keys: Object.keys(window).filter((k) => k.startsWith("__ED16")),
    }));
    if (hook.pris === "function") break;
    await sleep(250);
  }
  if (hook.pris !== "function") throw new Error("pris hook missing: " + JSON.stringify(hook));
  return { browser, page, userDir };
}

async function hookGet(page, name) {
  return page.evaluate((n) => {
    const hook = window.__ED16_PRIS;
    return hook ? hook[n] : null;
  }, name);
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PRIS;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function saveDataUrl(dataUrl, file) {
  const dest = path.join(SHOTS, file);
  if (!dataUrl || !dataUrl.startsWith("data:image")) return { ok: false, dest, size: 0 };
  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  fs.writeFileSync(dest, Buffer.from(b64, "base64"));
  return { ok: true, dest, size: fs.statSync(dest).size };
}

async function main() {
  const { browser, page, userDir } = await launch();
  try {
    await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });

    const arc = await hookGet(page, "arc");
    const flashMs = arc && Math.round(arc.FLASH * 1000);
    record("arc flash lasts 50–80ms", !!(arc && arc.FLASH >= 0.05 && arc.FLASH <= 0.08), "FLASH=" + (arc && arc.FLASH) + "s (" + flashMs + "ms)");
    record("arc gaps are 1.5–5s (no fixed period)", !!(arc && arc.GAP_MIN === 1.5 && arc.GAP_MAX === 5 && arc.N === 3), JSON.stringify(arc));

    const seed = 4242;
    const gapInfo = await page.evaluate((s, arc) => {
      const hook = window.__ED16_PRIS;
      const lanes = [0, 1, 2].map((i) => {
        const gaps = hook.arcGaps(s, i, 24);
        const t0 = hook.arcT0(s, i);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const uniq = new Set(gaps.map((g) => g.toFixed(3))).size;
        const min = Math.min(...gaps), max = Math.max(...gaps);
        const eq = gaps.every((g) => Math.abs(g - gaps[0]) < 0.01);
        // a short repeating cycle of length 1–3 would show up as low unique *wrapped* diffs
        let cycle2 = gaps.length > 4 && gaps.every((g, k) => k < 2 || Math.abs(g - gaps[k % 2]) < 0.02);
        let cycle3 = gaps.length > 6 && gaps.every((g, k) => k < 3 || Math.abs(g - gaps[k % 3]) < 0.02);
        return { i, t0, min, max, mean, uniq, eq, cycle2, cycle3, sample: gaps.slice(0, 8) };
      });
      const t0s = lanes.map((l) => l.t0);
      const t0span = Math.max(...t0s) - Math.min(...t0s);
      const even = Math.abs((t0s[1] - t0s[0]) - (t0s[2] - t0s[1])) < 0.05;
      return { lanes, t0s, t0span, even };
    }, seed, arc);
    const gapsOk = gapInfo.lanes.every((l) => l.min >= 1.5 - 1e-6 && l.max <= 5 + 1e-6 && l.uniq >= 16 && !l.eq && !l.cycle2 && !l.cycle3);
    record("per-lane gaps stay in 1.5–5s and are jittered (no equal or short repeating cycle)", !!gapsOk, JSON.stringify(gapInfo.lanes));
    const beats = await page.evaluate((arc) => {
      const hook = window.__ED16_PRIS;
      return [17, 99, 4242, 9001].map((s) => {
        const t0s = [0, 1, 2].map((i) => hook.arcT0(s, i));
        const span = Math.max(...t0s) - Math.min(...t0s);
        const d01 = t0s[1] - t0s[0], d12 = t0s[2] - t0s[1];
        const even = Math.abs(d01 - d12) < 0.05 && Math.abs(d01) > 0.1;
        return { seed: s, t0s, span, even };
      });
    }, arc);
    record("lanes do not share a common first-strike beat", beats.every((b) => b.span >= 0.4 && !b.even), JSON.stringify(beats));
    record("blade drip sparks are fully removed", !!(arc && arc.SPARK_SLOTS == null && arc.SPARK_LIFE == null && arc.SPARK_PERIOD == null), JSON.stringify(arc));

    const mids = await page.evaluate((s) => window.__ED16_PRIS.arcMids(s, 24), seed);
    record("deterministic mid-flash times exist for a given seed", Array.isArray(mids) && mids.length >= 3, JSON.stringify(mids));
    const mid = mids && mids[0];
    const flash = await api(page, "frame", "wep", mid, seed);
    const idleT = mid + 0.2;
    const idle = await api(page, "frame", "wep", idleT, seed);
    const flashOn = await page.evaluate((t, s) => {
      const hook = window.__ED16_PRIS;
      return [0, 1, 2].map((i) => hook.arcOn(t, s, i));
    }, mid, seed);
    const idleOn = await page.evaluate((t, s) => {
      const hook = window.__ED16_PRIS;
      return [0, 1, 2].map((i) => hook.arcOn(t, s, i));
    }, idleT, seed);
    const anyFlash = flashOn && flashOn.some((x) => x && x.on);
    const anyIdle = idleOn && idleOn.some((x) => x && x.on);
    record("a mid-flash frame has a bolt on", !!(flash && flash.ok && anyFlash && !flash.hasRect), JSON.stringify({ t: mid, outside: flash && flash.outside, on: flash && flash.on, hasRect: flash && flash.hasRect, lanes: flashOn }));
    record("200ms later the bolt is gone (50–80ms flash, not a writhing stream)", !!(idle && idle.ok && !anyIdle), JSON.stringify({ t: idleT, outside: idle && idle.outside, on: idle && idle.on, lanes: idleOn }));
    let bestOut = flash && flash.outside || 0;
    let bestT = mid;
    for (const t of (mids || []).slice(0, 8)) {
      const f = await api(page, "frame", "wep", t, seed);
      if (f && f.ok && f.outside > bestOut) { bestOut = f.outside; bestT = t; }
    }
    record("at least one mid-flash frame draws jagged arcs off the sprite", bestOut >= 8, "best outsidePx=" + bestOut + " at t=" + bestT + " (idle outside=" + (idle && idle.outside) + ")");

    // Flash length around mid: on for only a few frames
    const win = await page.evaluate((t0, s, flash) => {
      const hook = window.__ED16_PRIS;
      const dt = 1 / 60;
      let first = null, last = null, n = 0;
      for (let i = -8; i <= 12; i++) {
        const t = t0 + i * dt;
        const on = [0, 1, 2].some((k) => hook.arcOn(t, s, k).on);
        if (on) { n++; if (first == null) first = t; last = t; }
      }
      const ms = first == null ? 0 : Math.round((last - first + dt) * 1000);
      return { n, first, last, ms, midOn: [0, 1, 2].some((k) => hook.arcOn(t0, s, k).on), nominalMs: Math.round(flash * 1000) };
    }, mid, seed, arc.FLASH);
    record("the flash covers only ~2–4 frames at 60fps (~50–80ms)", !!(win && win.midOn && win.ms >= 50 && win.ms <= 90 && win.n >= 2 && win.n <= 6), JSON.stringify(win));

    const flashShot = await saveDataUrl(flash && flash.data, "after-wep-flash.png");
    const idleShot = await saveDataUrl(idle && idle.data, "after-wep-idle.png");
    record("isolated mid-flash weapon screenshot written", flashShot.ok && flashShot.size > 500, flashShot.dest + " " + flashShot.size);
    record("isolated idle (no drip sparks) weapon screenshot written", idleShot.ok && idleShot.size > 500, idleShot.dest + " " + idleShot.size);

    // Bag preview + in-game share drawPrisPiece; freeze time and shoot the bag UI and the play canvas.
    const began = await api(page, "begin", { depth: 10, lvl: 10 });
    const given = await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    record("throwaway test game equips a prismatic sword", !!(began && began.ok && given && given.ok && given.fitted), JSON.stringify({ began, given }));
    const liveSeed = await page.evaluate(() => window.__ED16_PRIS.wepSeed());
    const liveMids = await page.evaluate((s) => window.__ED16_PRIS.arcMids(s, 24), liveSeed);
    const liveMid = (liveMids && liveMids[0]) || mid;
    const liveIdle = liveMid + 0.22;

    await api(page, "openInv", true);
    await sleep(200);
    await api(page, "setTime", liveMid, true);
    await sleep(80);
    const bagFlash = path.join(SHOTS, "after-bag-flash-412x780.png");
    const wrap = await page.$(".dc-wrap");
    if (wrap) await wrap.screenshot({ path: bagFlash });
    else await page.screenshot({ path: bagFlash });
    const port = await page.$("canvas.dc-port");
    const portFlash = path.join(SHOTS, "after-portrait-flash.png");
    if (port) await port.screenshot({ path: portFlash });
    record("after bag preview (mid-flash) screenshot", fs.existsSync(bagFlash) && fs.statSync(bagFlash).size > 2000, bagFlash + " " + (fs.existsSync(bagFlash) ? fs.statSync(bagFlash).size : 0));
    record("after portrait (mid-flash) screenshot", fs.existsSync(portFlash) && fs.statSync(portFlash).size > 400, portFlash + " " + (fs.existsSync(portFlash) ? fs.statSync(portFlash).size : 0));

    await api(page, "setTime", liveIdle, true);
    await sleep(80);
    const bagIdle = path.join(SHOTS, "after-bag-idle-412x780.png");
    if (wrap) await wrap.screenshot({ path: bagIdle });
    else await page.screenshot({ path: bagIdle });
    const portIdle = path.join(SHOTS, "after-portrait-idle.png");
    const port2 = await page.$("canvas.dc-port");
    if (port2) await port2.screenshot({ path: portIdle });
    record("after bag preview (idle/sparks) screenshot", fs.existsSync(bagIdle) && fs.statSync(bagIdle).size > 2000, bagIdle + " " + (fs.existsSync(bagIdle) ? fs.statSync(bagIdle).size : 0));
    record("after portrait (idle/sparks) screenshot", fs.existsSync(portIdle) && fs.statSync(portIdle).size > 400, portIdle + " " + (fs.existsSync(portIdle) ? fs.statSync(portIdle).size : 0));

    // In-game hero on the play canvas, same freeze + draw path
    await api(page, "openInv", false);
    await api(page, "setTime", liveMid, true);
    await sleep(80);
    const playFlash = path.join(SHOTS, "after-ingame-flash.png");
    const cv = await page.$("canvas.dc-cv, canvas#cv, .dc-stage canvas, canvas");
    if (cv) await cv.screenshot({ path: playFlash });
    else await page.screenshot({ path: playFlash });
    record("after in-game mid-flash screenshot", fs.existsSync(playFlash) && fs.statSync(playFlash).size > 2000, playFlash + " " + (fs.existsSync(playFlash) ? fs.statSync(playFlash).size : 0));

    await api(page, "setTime", liveIdle, true);
    await sleep(80);
    const playIdle = path.join(SHOTS, "after-ingame-idle.png");
    const cv2 = await page.$("canvas.dc-cv, canvas#cv, .dc-stage canvas, canvas");
    if (cv2) await cv2.screenshot({ path: playIdle });
    else await page.screenshot({ path: playIdle });
    record("after in-game idle screenshot", fs.existsSync(playIdle) && fs.statSync(playIdle).size > 2000, playIdle + " " + (fs.existsSync(playIdle) ? fs.statSync(playIdle).size : 0));

    // Inventory cell CSS overlay should use brief flashes, not the old rising bolts
    const css = await page.evaluate(() => {
      const rules = [...document.styleSheets].flatMap((ss) => {
        try { return [...ss.cssRules]; } catch { return []; }
      });
      const names = new Set();
      let flashA = "", flashB = "", boltA = "", boltB = "", rise = "";
      for (const r of rules) {
        const cssText = r.cssText || "";
        if (r.name) names.add(r.name);
        if (r.selectorText === ".dc-pris-arcs .bolt.a") boltA = cssText;
        if (r.selectorText === ".dc-pris-arcs .bolt.b") boltB = cssText;
        if (r.name === "prisFlashA") flashA = cssText;
        if (r.name === "prisFlashB") flashB = cssText;
        if (r.name === "prisRise") rise = cssText;
      }
      return { names: [...names].filter((n) => /^pris/.test(n)), boltA, boltB, flashA, flashB, rise };
    });
    const longA = css && /21\.2s/.test(css.boltA);
    const longB = css && /18\.6s/.test(css.boltB);
    record("inventory arc overlay uses brief flashes on long irregular loops (no rising drift)", !!(css && /prisFlashA/.test(css.boltA) && /prisFlashB/.test(css.boltB) && css.flashA && css.flashB && longA && longB && !css.rise && !/prisRise|prisBoltA|prisBoltB/.test(css.boltA + css.boltB)), JSON.stringify({ names: css && css.names, boltA: css && css.boltA, boltB: css && css.boltB }));

    const inspect = await api(page, "inspect", "wep");
    record("prisInspect still finds off-sprite arcs on a mid-flash frame", !!(inspect && inspect.ok && inspect.outsidePx >= 8 && !inspect.hasRect), JSON.stringify({ outsidePx: inspect && inspect.outsidePx, hasRect: inspect && inspect.hasRect, frames: inspect && inspect.frames }));

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
  console.log("BLADEFX " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
