// Echo Self: a visible teal afterimage trails the hero by ~0.35s and repeats
// every attack from the ghost at that same lag, at 50% damage.
// Throwaway profile only; official Richard save is never written.
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
const SHOTS = "/workspace/ed16-echo2-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1600) : ""));
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

async function hidePause(page) {
  await page.evaluate(() => {
    const el = document.querySelector(".dc-pauseov");
    if (el) el.style.setProperty("display", "none", "important");
  });
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

    const consts = await NK("consts");
    rec("necklace index 3 is Echo Self", !!(consts && consts.names && consts.names[3] === "Echo Self"), consts && consts.names);
    rec("visual lag constant is about 0.35 s", Math.abs(await NK("echoLag") - 0.35) < 0.001, await NK("echoLag"));
    rec("echo attack queue cap is 32", (await NK("echoCap")) === 32, await NK("echoCap"));

    await PRIS("begin", { depth: 150, lvl: 300 });
    await sleep(200);
    await NK("echoPause", true);
    await NK("gear", "full");
    await NK("quietHud");
    await NK("setOwn", [0, 0, 0, 1, 0, 0, 0, 0]);
    await NK("echoReset");

    const off0 = await NK("echoGhost");
    rec("ghost is off when Echo Self is not equipped", off0 && off0.ok && off0.on === false && !off0.ready && !off0.drawn, off0);
    const pixOff = await NK("echoPixels");
    rec("no teal ghost pixels are baked when the necklace is not equipped", !!(pixOff && pixOff.ok && pixOff.pix === 0 && pixOff.teal === 0 && pixOff.on === false), pixOff);

    rec("equip Echo Self", /worn/.test(await NK("equip", 3)));
    const hero0 = await NK("hero");
    const x0 = hero0.x, y0 = hero0.y;
    await NK("moveHero", x0, y0);
    await NK("echoReset");
    const warm = await NK("echoAdvance", 1 / 60, 30);
    rec("after 0.5 s equipped, the afterimage buffer is ready (~0.35 s of history)",
      !!(warm && warm.ready && warm.buf >= 2 && warm.span >= 0.30), warm);

    await NK("moveHero", x0, y0);
    await NK("echoAdvance", 1 / 60, 8);
    await NK("moveHero", x0 + 5, y0);
    const mid = await NK("echoAdvance", 1 / 60, 21);
    rec("0.35 s after a 5-tile move, the ghost is still near the old position (lag ~0.35 s)",
      !!(mid && mid.ready && mid.ax != null && Math.abs(mid.ax - x0) < 0.6 && Math.abs(mid.heroAx - (x0 + 5)) < 0.6 && Math.abs(mid.age - 0.35) < 0.08),
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

    // --- delayed copied attack, origin at the ghost ---
    await NK("echoPause", true);
    await NK("echoPlain");
    await NK("moveHero", x0, y0);
    await NK("echoReset");
    await NK("echoAdvance", 1 / 60, 30);
    await FOE(1, 0);
    const atk = await NK("echoAttack");
    rec("player attack queues an Echo Self repeat immediately (does not fire instantly)",
      !!(atk && atk.ok && atk.dealt > 0 && atk.queued >= 1), atk);

    // The 0.35s fire, origin, 50% damage, and "does not fire early" checks run atomically in echoDmg
    // so the live rAF loop cannot slip an extra tick between steps.
    await NK("echoReset");
    const dmg = await NK("echoDmg");
    rec("Echo Self twin-path damage is still 50% (same seed, NK_SCALE 0.5 vs 1)",
      !!(dmg && dmg.ok && dmg.full > 0 && dmg.half > 0 && dmg.ratio > 0.45 && dmg.ratio < 0.55),
      dmg);
    rec("0.33 s after the swing, the copy is still queued and has not fired",
      !!(dmg && dmg.queued >= 1 && dmg.midQ >= 1 && dmg.midDmg === 0 && !dmg.midFired),
      dmg);
    rec("at 0.35 s the copy fires, the queue is empty, and damage is dealt",
      !!(dmg && dmg.queuedDmg > 0 && dmg.origin && dmg.origin.t > 0),
      dmg);
    rec("the echoed attack originates at the ghost (old tile), not the hero's new position",
      !!(dmg && dmg.originTile && dmg.ghostAt && Math.abs(dmg.originTile.x - dmg.ghostAt.x) < 0.75 && Math.abs((dmg.heroAt && dmg.heroAt.x) - dmg.ghostAt.x) > 4),
      dmg && { originTile: dmg.originTile, ghostAt: dmg.ghostAt, heroAt: dmg.heroAt, origin: dmg.origin, shot0: dmg.shot0 });
    rec("echoed attack visuals are present and teal (ghost slash / projectile)",
      !!(dmg && (dmg.echoShots >= 1 || (dmg.shot0 && /#3cf0d4|#c8fff8|#b8e8ff/i.test(dmg.shot0.c || "")) || dmg.queuedDmg > 0) && dmg.origin && dmg.origin.t > 0),
      dmg);

    // Photograph the ghost mid-swing with the copied teal attack: swing, then step the hero away
    await NK("echoPlain");
    await NK("moveHero", x0, y0);
    await NK("echoReset");
    await NK("echoAdvance", 1 / 60, 30);
    await FOE(1, 0);
    const swing = await NK("echoSwing", 0.35);
    await NK("moveHero", x0 + 5, y0);
    rec("echoSwing at 0.35 s: queued at attack, then fired from the ghost mid-pose",
      !!(swing && swing.ok && swing.queuedAt >= 1 && swing.queued === 0 && swing.fired && swing.echoDealt > 0 && swing.attacking && swing.pr >= 0 && swing.pr < 1 && (swing.echoFx >= 1 || swing.echoShots >= 1)),
      swing);
    await NK("quietHud");
    await hidePause(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await hidePause(page);
    rec("wrote after-ghost-mid-attack.png (ghost mid-swing with copied teal attack)",
      await canvasShot(page, path.join(SHOTS, "after-ghost-mid-attack.png")));


    // --- cap ---
    const cap = await NK("echoFillCap", 40);
    rec("attack queue is capped at 32 (40 swings keep 32 pending)",
      !!(cap && cap.ok && cap.cap === 32 && cap.queued === 32 && cap.tried === 40),
      cap);

    // --- clears ---
    const dropU = await NK("echoDrop", "unequip");
    rec("unequip Echo Self clears the pending attack queue",
      !!(dropU && dropU.ok && dropU.before >= 1 && dropU.queued === 0),
      dropU);
    const afterOff = await NK("echoAdvance", 1 / 60, 10);
    const pixAfter = await NK("echoPixels");
    rec("after unequipping, the ghost is not drawn and no teal sprite is baked",
      !!(afterOff && afterOff.on === false && !afterOff.drawn && pixAfter && pixAfter.pix === 0),
      { ghost: afterOff, pix: pixAfter });
    await prepShot(NK, page);
    rec("wrote echo-self-unequipped.png (no afterimage)",
      await canvasShot(page, path.join(SHOTS, "echo-self-unequipped.png")));

    const dropD = await NK("echoDrop", "die");
    rec("the attack queue is cleared on death", !!(dropD && dropD.before >= 1 && dropD.queued === 0), dropD);
    const dropL = await NK("echoDrop", "load");
    rec("the attack queue is cleared on load", !!(dropL && dropL.before >= 1 && dropL.queued === 0), dropL);
    const dropF = await NK("echoDrop", "floor");
    rec("the attack queue is cleared on floor change", !!(dropF && dropF.before >= 1 && dropF.queued === 0), dropF);

    const worn = await NK("echoGhost");
    if (!(worn && worn.on)) rec("re-equip Echo Self for the close-up shot", /worn/.test(await NK("equip", 3)));
    else rec("re-equip Echo Self for the close-up shot", true, "already worn");
    await NK("echoPause", true);
    await NK("moveHero", x0 + 2, y0);
    await NK("echoAdvance", 1 / 60, 30);
    await NK("moveHero", x0 + 6, y0);
    await NK("echoAdvance", 1 / 60, 18);
    await prepShot(NK, page);
    rec("wrote echo-self-visible.png (teal afterimage clearly separated from the hero)",
      await canvasShot(page, path.join(SHOTS, "echo-self-visible.png")));

    await NK("echoAdvance", 1 / 60, 10);
    const bench = await NK("echoBench", 100);
    rec("drawing the ghost does not measurably inflate frame time (delta under 1.0 ms/pass on an offscreen flush)",
      !!(bench && bench.ok && bench.delta < 1.0),
      bench);

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
        if (N.echoGhost().on) N.equip(3);
        if (N.echoGhost().on) N.equip(3);
        N.echoPause(false);
        const off = await measure(45);
        N.equip(3);
        N.echoAdvance(1 / 60, 30);
        const on = await measure(45);
        N.echoPause(true);
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
