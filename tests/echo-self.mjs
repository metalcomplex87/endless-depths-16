// Echo Self: a visible teal afterimage trails the hero by ~0.35s and mirrors attacks.
// Damage is still 50% on the 1s repeat. Throwaway profile only; official Richard save is never written.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { createServer } from "net";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = process.env.RICHARD_FILE || path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const RICHARD_MD5 = "4c155ae35dc8eacf8dd4ab400adf75a5";
const COPY = "/tmp/richard-boss-COPY-echo-self.txt";
const SHOTS = "/workspace/ed16-ghost-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1200) : ""));
  return !!pass;
}
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}
function startServer(port) {
  const srv = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  return srv;
}
async function waitUp(base, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(base + "game.js", { cache: "no-store" }); if (r.ok) { const t = await r.text(); if (t.includes("echoLag")) return true; throw new Error("server is not the Echo Self build (game.js missing echoLag)"); } } catch (e) { if (String(e).includes("Echo Self")) throw e; }
    await sleep(100);
  }
  throw new Error("server did not come up at " + base);
}

async function prepShot(NK, page) {
  await NK("quietHud");
  await NK("echoPrep");
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function canvasShot(page, dest) {
  const handle = await page.evaluateHandle(() => {
    const list = [...document.querySelectorAll("canvas")];
    return list.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  });
  const el = handle.asElement();
  if (!el) throw new Error("no canvas");
  await el.screenshot({ path: dest });
  return fs.existsSync(dest) && fs.statSync(dest).size > 1000;
}

async function main() {
  rec("official Richard save md5 is untouched before the run", md5(RICHARD) === RICHARD_MD5, md5(RICHARD));
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the Richard save", md5(COPY) === RICHARD_MD5 && COPY.includes("COPY"), COPY);

  const port = Number(process.env.ED16_PORT) || await freePort();
  const base = process.env.ED16_URL || ("http://127.0.0.1:" + port + "/");
  const srv = process.env.ED16_URL ? null : startServer(port);
  await waitUp(base);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/echo-self-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  try {
    await page.goto(base + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())));
    await page.waitForSelector(".dc-root");
    await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK));
    const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
    const PRIS = (n, ...a) => page.evaluate((n, a) => window.__ED16_PRIS[n](...a), n, a);
    const FOE = (dx, dy) => page.evaluate((dx, dy) => window.__ED16_PRIS.melee.placeFoe(dx, dy), dx, dy);

    // Confirm the necklace identity from the live constants, then start a throwaway run.
    const consts = await NK("consts");
    rec("necklace index 3 is Echo Self", !!(consts && consts.names && consts.names[3] === "Echo Self"), consts && consts.names);
    rec("visual lag constant is about 0.35 s", Math.abs(await NK("echoLag") - 0.35) < 0.001, await NK("echoLag"));

    await PRIS("begin", { depth: 150, lvl: 300 });
    await sleep(200);
    await NK("gear", "full");
    await NK("quietHud");
    await NK("setOwn", [0, 0, 0, 1, 0, 0, 0, 0]);
    await NK("echoReset");

    // --- unequipped: owned but not worn, no ghost ---
    const off0 = await NK("echoGhost");
    rec("ghost is off when Echo Self is not equipped", off0 && off0.ok && off0.on === false && !off0.ready && !off0.drawn, off0);
    const pixOff = await NK("echoPixels");
    rec("no teal ghost pixels are baked when the necklace is not equipped", !!(pixOff && pixOff.ok && pixOff.pix === 0 && pixOff.teal === 0 && pixOff.on === false), pixOff);

    // --- equip and fill the 0.35s buffer at a known tile, then walk away ---
    rec("equip Echo Self", /worn/.test(await NK("equip", 3)));
    const hero0 = await NK("hero");
    const x0 = hero0.x, y0 = hero0.y;
    await NK("moveHero", x0, y0);
    await NK("echoReset");
    const warm = await NK("echoAdvance", 1 / 60, 30); // 0.5 s standing still, fills the lag window
    rec("after 0.5 s equipped, the afterimage buffer is ready (~0.35 s of history)",
      !!(warm && warm.ready && warm.buf >= 2 && warm.span >= 0.30), warm);

    // walk several tiles to the right (open a path first)
    const x1 = x0 + 5, y1 = y0;
    await page.evaluate((x0, y0, x1) => {
      const N = window.__ED16_NK;
      const h = N.hero();
      // carve a walkable line in the floor via repeated move? moveHero sets tiles; gen may have walls.
      // visTick interpolates from current ax toward x. We set ax/x instantly via moveHero after sampling A.
    }, x0, y0, x1);
    // Keep the hero at A long enough, then teleport tile+ax to B and advance 0.35s
    await NK("moveHero", x0, y0);
    await NK("echoAdvance", 1 / 60, 8);
    const atA = await NK("echoGhost");
    await NK("moveHero", x1, y1);
    const mid = await NK("echoAdvance", 1 / 60, 21); // exactly 0.35 s after the teleport
    rec("0.35 s after a 5-tile move, the ghost is still near the old position (lag ~0.35 s)",
      !!(mid && mid.ready && mid.ax != null && Math.abs(mid.ax - x0) < 0.6 && Math.abs(mid.heroAx - x1) < 0.6 && Math.abs(mid.age - 0.35) < 0.08),
      mid);
    rec("the live hero is ahead of the ghost by about 5 tiles",
      !!(mid && mid.heroAx - mid.ax > 4 && mid.heroAx - mid.ax < 6),
      mid && { dx: mid && mid.heroAx - mid.ax, age: mid && mid.age });

    const pixOn = await NK("echoPixels");
    rec("baked ghost sprite is teal and clearly visible (many teal pixels, green/blue dominate)",
      !!(pixOn && pixOn.ok && pixOn.on && pixOn.ready && pixOn.teal >= 20 && pixOn.pix >= 20 && pixOn.pix < 2000 && pixOn.avg && pixOn.avg.g > pixOn.avg.r && pixOn.avg.b > pixOn.avg.r),
      pixOn);

    await prepShot(NK, page);
    rec("wrote echo-self-trail.png (hero 5 tiles ahead of the teal ghost)",
      await canvasShot(page, path.join(SHOTS, "echo-self-trail.png")));

    // --- attack mirroring ---
    await FOE(1, 0);
    const swing = await NK("echoSwing", 0.35); // attack + 0.35 s in one turn so the live loop cannot finish the swing first
    rec("player attack queues an Echo Self repeat", !!(swing && swing.ok && swing.dealt > 0 && swing.queued >= 1), swing);
    rec("0.35 s after the swing, the ghost is itself mid-attack (mirrors the delayed pose)",
      !!(swing && swing.ready && swing.attacking && swing.pr >= 0 && swing.pr < 1),
      swing);
    await prepShot(NK, page);
    rec("wrote echo-self-attack.png (ghost mid-swing)",
      await canvasShot(page, path.join(SHOTS, "echo-self-attack.png")));

    // --- damage still 50% (deterministic RNG inside the hook) ---
    await NK("echoReset");
    const dmg = await NK("echoDmg");
    rec("Echo Self twin-path damage is still 50% (same seed, NK_SCALE 0.5 vs 1)",
      !!(dmg && dmg.ok && dmg.full > 0 && dmg.half > 0 && dmg.ratio > 0.45 && dmg.ratio < 0.55),
      dmg);
    rec("the 1 s queued repeat still fires and deals damage",
      !!(dmg && dmg.queued >= 1 && dmg.queuedDmg > 0),
      dmg);
    rec("echo FX origin is recorded (from the ghost when the lag buffer is ready)",
      !!(dmg && dmg.origin && typeof dmg.origin.x === "number"),
      dmg && dmg.origin);

    // --- unequip clears the ghost ---
    rec("unequip Echo Self", /removed/.test(await NK("equip", 3)));
    const afterOff = await NK("echoAdvance", 1 / 60, 10);
    const pixAfter = await NK("echoPixels");
    rec("after unequipping, the ghost is not drawn and no teal sprite is baked",
      !!(afterOff && afterOff.on === false && !afterOff.drawn && pixAfter && pixAfter.pix === 0),
      { ghost: afterOff, pix: pixAfter });
    await prepShot(NK, page);
    rec("wrote echo-self-unequipped.png (no afterimage)",
      await canvasShot(page, path.join(SHOTS, "echo-self-unequipped.png")));

    // re-equip and photograph a standing + walking pair for the write-up
    rec("re-equip Echo Self for the close-up shot", /worn/.test(await NK("equip", 3)));
    await NK("moveHero", x0 + 2, y0);
    await NK("echoAdvance", 1 / 60, 30);
    await NK("moveHero", x0 + 6, y0);
    await NK("echoAdvance", 1 / 60, 18);
    await prepShot(NK, page);
    rec("wrote echo-self-visible.png (teal afterimage clearly separated from the hero)",
      await canvasShot(page, path.join(SHOTS, "echo-self-visible.png")));

    // --- performance ---
    await NK("echoAdvance", 1 / 60, 10);
    const bench = await NK("echoBench", 100);
    rec("drawing the ghost does not measurably inflate frame time (delta under 1.0 ms/pass on an offscreen flush)",
      !!(bench && bench.ok && bench.delta < 1.0),
      bench);

    // real rAF timings with vs without the necklace, same scene
    const raf = await page.evaluate(() => new Promise((res) => {
      const N = window.__ED16_NK;
      const measure = (frames) => new Promise((r) => {
        let n = 0, t0 = 0, acc = 0;
        const f = (t) => {
          if (!t0) t0 = t;
          else { acc += t - t0; t0 = t; n++; }
          if (n >= frames) r(acc / n);
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
      (async () => {
        if (N.echoGhost().on) N.equip(3); // toggle off if on
        if (N.echoGhost().on) N.equip(3);
        const off = await measure(45);
        N.equip(3);
        N.echoAdvance(1 / 60, 30);
        const on = await measure(45);
        res({ off: +off.toFixed(3), on: +on.toFixed(3), delta: +(on - off).toFixed(3) });
      })();
    }));
    rec("in-page rAF frame time with the ghost on is not meaningfully worse (delta under 3 ms)",
      !!(raf && raf.delta < 3),
      raf);

    rec("no page errors during Echo Self tests", errors.length === 0, errors);
  } finally {
    const after = md5(RICHARD);
    rec("official Richard save md5 is still untouched after the run", after === RICHARD_MD5, after);
    await browser.close().catch(() => {});
    if (srv) srv.kill();
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
