import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "overkill");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/overkill-" + Date.now();
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
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_OVERKILL && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function main() {
  console.log("OVERKILL tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const begin = await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 5, lvl: 8 }));
    record("pris begin", !!(begin && begin.ok), JSON.stringify(begin || {}));

    const meta = await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      const rs = [1, 2, 5, 10, 20, 0.5, 100];
      const curves = {};
      for (const r of rs) curves[r] = O.curve(r);
      return { consts: O.consts, curves };
    });
    const c1 = meta.curves[1], c10 = meta.curves[10], c20 = meta.curves[20];
    record("R=1 curve is the unscaled baseline (spd=1, rest=0, drag=0.98)",
      !!(c1 && c1.spd === 1 && c1.life === 1 && c1.rest === 0 && c1.drag === 0.98 && c1.grav === 1 && c1.trail === 0),
      JSON.stringify(c1));
    record("R=10 curve reaches the screen-cross / bounce max (spd=16, rest=0.72)",
      !!(c10 && c10.spd === 16 && Math.abs(c10.rest - 0.72) < 1e-9 && c10.life === 1.65),
      JSON.stringify(c10));
    record("R=20 curve is the near-instant blast (spd=140, trails on)",
      !!(c20 && c20.spd === 140 && c20.trail >= 0.99 && c20.rest >= 0.88),
      JSON.stringify(c20));
    record("R<1 is treated as 1",
      meta.curves[0.5] && meta.curves[0.5].spd === 1 && meta.curves[0.5].rest === 0,
      JSON.stringify(meta.curves[0.5]));
    const mono = [1, 2, 5, 10, 20].map((r) => meta.curves[r].spd);
    record("speed multiplier is strictly monotonic in R from 1 to 20",
      mono.every((v, i) => i === 0 || v > mono[i - 1]),
      JSON.stringify(mono));

    await page.evaluate(() => window.__ED16_OVERKILL.carve({ span: 8 }));
    const r1 = await page.evaluate(() => window.__ED16_OVERKILL.burst({ r: 1, dx: 1, dy: 0, n: 48, sp: 60 }));
    const baselineMean = 60 * 0.825; // E[sp*(0.55+0.55U)]
    record("R=1 mean speed matches the unscaled baseline",
      !!(r1 && r1.ok && r1.n >= 40 && Math.abs(r1.meanSpd - baselineMean) / baselineMean < 0.18),
      JSON.stringify({ meanSpd: r1 && r1.meanSpd, expect: baselineMean, n: r1 && r1.n }));
    record("R=1 particles have no bounce restitution",
      !!(r1 && r1.bounces === 0),
      JSON.stringify({ bounces: r1 && r1.bounces }));

    const speeds = await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      const out = {};
      for (const r of [1, 2, 5, 10, 20]) out[r] = O.burst({ r, dx: 1, dy: 0, n: 40, sp: 60 });
      return out;
    });
    const seq = [1, 2, 5, 10, 20].map((r) => speeds[r] && speeds[r].meanSpd);
    record("spawned mean speed is strictly monotonic in R",
      seq.every((v, i) => typeof v === "number" && v > 0 && (i === 0 || v > seq[i - 1] * 1.05)),
      JSON.stringify(seq));

    // R=1 must not bounce even with a close wall
    await page.evaluate(() => window.__ED16_OVERKILL.carve({ span: 8, wallDist: 2, dx: 1, dy: 0 }));
    const r1wall = await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      O.burst({ r: 1, dx: 1, dy: 0, n: 24, sp: 60 });
      let last = null;
      for (let i = 0; i < 20; i++) last = O.tick(0.05);
      return last;
    });
    record("R=1 keeps the old no-bounce integrator against walls",
      !!(r1wall && r1wall.bounces === 0),
      JSON.stringify({ bounces: r1wall && r1wall.bounces, meanDist: r1wall && r1wall.meanDist }));

    // R=10 boxed room + close wall: multiple bounces
    await page.evaluate(() => window.__ED16_OVERKILL.carve({ span: 6, dx: 1, dy: 0 }));
    const r10 = await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      O.burst({ r: 10, dx: 1, dy: 0, n: 24, sp: 60, shatter: true });
      let last = null;
      for (let i = 0; i < 24; i++) last = O.tick(0.05); // 1.2s
      return last;
    });
    record("R=10 particles travel across the screen and bounce off multiple walls",
      !!(r10 && (r10.bounces + (r10.shardBounces || 0)) >= 2 && r10.meanDist > 80),
      JSON.stringify(r10));

    const shot10 = path.join(SHOTS, "okill-r10-bounce-412x780.png");
    // mid-flight screenshot: recarve, burst, tick a little
    await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      O.carve({ span: 6, dx: 1, dy: 0 });
      O.burst({ r: 10, dx: 1, dy: 0, n: 24, sp: 60, shatter: true });
      O.tick(0.18);
    });
    await page.screenshot({ path: shot10, fullPage: false });
    record("R=10 bounce screenshot", fs.existsSync(shot10) && fs.statSync(shot10).size > 1000, shot10);

    // R=1 screenshot mid-burst for comparison
    await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      O.carve({ span: 6 });
      O.burst({ r: 1, dx: 1, dy: 0, n: 24, sp: 60 });
      O.tick(0.16);
    });
    const shot1 = path.join(SHOTS, "okill-r1-412x780.png");
    await page.screenshot({ path: shot1, fullPage: false });
    record("R=1 baseline screenshot", fs.existsSync(shot1) && fs.statSync(shot1).size > 1000, shot1);

    // R=20 near-instant crossing in a wide open box
    await page.evaluate(() => window.__ED16_OVERKILL.carve({ span: 16 }));
    const r20 = await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      const start = O.burst({ r: 20, dx: 1, dy: 0, n: 24, sp: 60, shatter: true });
      const after = O.tick(0.05);
      let t = 0, cross = null, last = after;
      const hit = (st, tt) => (st.meanDist >= 200 || st.maxDist >= 320);
      if (hit(after)) cross = { t: 0.05, meanDist: after.meanDist, maxDist: after.maxDist, meanSpd: after.meanSpd };
      else {
        for (let i = 0; i < 20; i++) {
          t += 0.01;
          last = O.tick(0.01);
          if (hit(last)) { cross = { t: 0.05 + t, meanDist: last.meanDist, maxDist: last.maxDist, meanSpd: last.meanSpd }; break; }
        }
      }
      return { start, after, cross, last };
    });
    record("R=20 particles blast across the open screen essentially instantly",
      !!(r20 && r20.start && r20.start.meanSpd > 2000 && r20.cross && r20.cross.t <= 0.07),
      JSON.stringify(r20 && { startSpd: r20.start && r20.start.meanSpd, after: r20.after && { dist: r20.after.meanDist, spd: r20.after.meanSpd }, cross: r20.cross }));

    await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      O.carve({ span: 16 });
      O.burst({ r: 20, dx: 1, dy: 0, n: 24, sp: 60, shatter: true });
      O.tick(0.03);
    });
    const shot20 = path.join(SHOTS, "okill-r20-blast-412x780.png");
    await page.screenshot({ path: shot20, fullPage: false });
    record("R=20 blast screenshot", fs.existsSync(shot20) && fs.statSync(shot20).size > 1000, shot20);

    // real kill() path stamps R from damage / remaining HP
    const stamped = await page.evaluate(() => {
      const O = window.__ED16_OVERKILL;
      O.carve({ span: 8 });
      const a = O.killDummy({ remain: 10, dmg: 10, dx: 1, dy: 0 }); // R=1
      const spd1 = a.meanSpd;
      const b = O.killDummy({ remain: 10, dmg: 200, dx: 1, dy: 0 }); // R=20
      return { spd1, spd20: b.meanSpd, n1: a.n, n20: b.n };
    });
    record("hurtEn killing-blow stamps R = damage / remaining HP",
      !!(stamped && stamped.spd1 > 20 && stamped.spd1 < 90 && stamped.spd20 > stamped.spd1 * 8),
      JSON.stringify(stamped));

    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("OVERKILL " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
