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
    const rate = arc && arc.N / arc.PERIOD;
    const duty = arc && (arc.N * arc.FLASH) / arc.PERIOD;
    const oldRate = 11;
    record("arc flash lasts 50–80ms", !!(arc && arc.FLASH >= 0.05 && arc.FLASH <= 0.08), "FLASH=" + (arc && arc.FLASH) + "s (" + flashMs + "ms)");
    record("arc frequency is ~20% of the old 11 Hz swirl (~2 strikes/s)", !!(arc && rate >= 1.6 && rate <= 2.4), "N=" + (arc && arc.N) + " PERIOD=" + (arc && arc.PERIOD) + "s rate=" + (rate && rate.toFixed ? rate.toFixed(2) : rate) + "/s vs old " + oldRate + " (" + (rate ? Math.round(100 * rate / oldRate) : "?") + "%)");
    record("visible-arc duty is a brief flash, not a continuous crackle", !!(arc && duty > 0.05 && duty <= 0.2), "duty=" + (duty && duty.toFixed ? (duty * 100).toFixed(1) : duty) + "% (3 staggered 65ms flashes / 1.5s)");
    record("rainbow drip sparks are 1–4 sparse slots with a short life", !!(arc && arc.SPARK_SLOTS >= 1 && arc.SPARK_SLOTS <= 4 && arc.SPARK_LIFE >= 0.35 && arc.SPARK_LIFE <= 0.8 && arc.SPARK_PERIOD >= 1.5), JSON.stringify({ slots: arc && arc.SPARK_SLOTS, life: arc && arc.SPARK_LIFE, period: arc && arc.SPARK_PERIOD }));

    const seed = 4242;
    const mids = await page.evaluate((s) => window.__ED16_PRIS.arcMids(s, 4), seed);
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

    // Spark occupancy over a long window stays sparse (0–4)
    const sparkOcc = await page.evaluate((s, arc) => {
      const dt = 0.02;
      let max = 0, sum = 0, samples = 0, hits = 0;
      for (let t = 0; t < 12; t += dt) {
        let n = 0;
        for (let i = 0; i < arc.SPARK_SLOTS; i++) {
          const off = (i * (arc.SPARK_PERIOD / arc.SPARK_SLOTS) + (s % 17) * 0.04) % arc.SPARK_PERIOD;
          const u = ((t + off) % arc.SPARK_PERIOD + arc.SPARK_PERIOD) % arc.SPARK_PERIOD;
          if (u < arc.SPARK_LIFE * 0.9) n++;
        }
        if (n > max) max = n;
        if (n > 0) hits++;
        sum += n; samples++;
      }
      return { max, avg: sum / samples, frac: hits / samples, samples };
    }, seed, arc);
    record("at most 4 sparks are alive, and they stay sparse", !!(sparkOcc && sparkOcc.max <= 4 && sparkOcc.avg > 0 && sparkOcc.avg <= 2.2), JSON.stringify(sparkOcc));

    const flashShot = await saveDataUrl(flash && flash.data, "after-wep-flash.png");
    const idleShot = await saveDataUrl(idle && idle.data, "after-wep-idle.png");
    record("isolated mid-flash weapon screenshot written", flashShot.ok && flashShot.size > 500, flashShot.dest + " " + flashShot.size);
    record("isolated idle (sparks-only) weapon screenshot written", idleShot.ok && idleShot.size > 500, idleShot.dest + " " + idleShot.size);

    // Bag preview + in-game share drawPrisPiece; freeze time and shoot the bag UI and the play canvas.
    const began = await api(page, "begin", { depth: 10, lvl: 10 });
    const given = await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    record("throwaway test game equips a prismatic sword", !!(began && began.ok && given && given.ok && given.fitted), JSON.stringify({ began, given }));
    const liveSeed = await page.evaluate(() => window.__ED16_PRIS.wepSeed());
    const liveMids = await page.evaluate((s) => window.__ED16_PRIS.arcMids(s, 6), liveSeed);
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
    record("inventory arc overlay uses brief flash keyframes (no rising drift)", !!(css && /prisFlashA/.test(css.boltA) && /prisFlashB/.test(css.boltB) && css.flashA && css.flashB && !css.rise && !/prisRise|prisBoltA|prisBoltB/.test(css.boltA + css.boltB)), JSON.stringify({ names: css && css.names, boltA: css && css.boltA, boltB: css && css.boltB }));

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
