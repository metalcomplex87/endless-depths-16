import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "portals");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/portals-" + Date.now();
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
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  const url = BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  let hook = null;
  for (let i = 0; i < 40; i++) {
    hook = await page.evaluate(() => ({
      portals: typeof (window.__ED16_PORTALS && window.__ED16_PORTALS.begin),
      keys: Object.keys(window).filter((k) => k.startsWith("__ED16")),
    }));
    if (hook.portals === "function") break;
    await sleep(250);
  }
  if (hook.portals !== "function") throw new Error("portals hook missing: " + JSON.stringify(hook));
  return { browser, page, userDir };
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PORTALS;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function shot(page, kind, file, title) {
  const setup = await api(page, "shotSetup", kind);
  if (kind === "loot") await api(page, "tick", 0.05, 12);
  else if (kind === "goblin") await api(page, "tick", 0.04, 4);
  else await api(page, "tick", 0.05, 6);
  await sleep(80);
  const dest = path.join(SHOTS, file);
  await page.screenshot({ path: dest, type: "png", fullPage: false });
  const ok = fs.existsSync(dest) && fs.statSync(dest).size > 2000;
  record("screenshot " + kind, ok, dest + (title ? " · " + title : "") + " setup=" + (setup && setup.ok));
  return dest;
}

(async () => {
  const { browser, page } = await launch();
  try {
    const began = await api(page, "begin");
    record("begin scratch game", !!(began && began.ok), JSON.stringify({ hx: began.hx, hy: began.hy }));

    const port = await api(page, "placePortal", "proceed", 21, 18, false);
    const pw = port && port.portal && port.portal.w, ph = port && port.portal && port.portal.h;
    const tiles = (port && port.portal && port.portal.tiles) || [];
    record("portal is 2x2", pw === 2 && ph === 2 && tiles.length === 4, JSON.stringify(port.portal));
    record("portal no overlap", !!(port && port.ok && (!port.overlap || port.overlap.length === 0)), JSON.stringify(port.overlap));
    const allTrigger = tiles.length === 4 && tiles.every((t) => {
      const hit = (port.triggers || []).find((r) => r.x === t.x && r.y === t.y);
      return hit && hit.portal;
    });
    record("any of 4 portal tiles triggers", allTrigger, JSON.stringify(port.triggers));

    await api(page, "carve", 22, 22, 10);
    const down = await api(page, "placeStairs", 2, 20, 18, false);
    const up = await api(page, "placeStairs", 3, 24, 18, false);
    const downPair = (down.stairs || []).find((s) => s.tile === 2 && s.h === 2);
    const upPair = (up.stairs || []).find((s) => s.tile === 3 && s.h === 2);
    record("down stairs 1x2 vertical", !!(downPair && downPair.h === 2), JSON.stringify(down.stairs));
    record("up stairs 1x2 vertical", !!(upPair && upPair.h === 2), JSON.stringify(up.stairs));
    const downTiles = (down.triggers || []).filter((t) => t.down);
    const upTiles = (up.triggers || []).filter((t) => t.up);
    record("either down stair tile triggers", downTiles.length >= 2, JSON.stringify(downTiles));
    record("either up stair tile triggers", upTiles.length >= 2, JSON.stringify(upTiles));

    const corr = await api(page, "corridor");
    record("stairs avoid 1-wide corridor", !!(corr && corr.ok && corr.corridorDetected && corr.avoided), JSON.stringify(corr));

    await api(page, "carve", 22, 22, 10);
    const oldP = await api(page, "placePortal", "camp", 20, 20, true);
    const oldPt = oldP && oldP.portal;
    record("old 1-tile portal loads", !!(oldPt && (oldPt.w ?? 1) === 1 && (oldPt.h ?? 1) === 1), JSON.stringify(oldPt));
    const oldTrig = await api(page, "putHero", 20, 20);
    record("old 1-tile portal still triggers", !!(oldTrig && oldTrig.trigger && oldTrig.trigger.portal), JSON.stringify(oldTrig.trigger));
    const neigh = await api(page, "putHero", 21, 20);
    record("old 1-tile neighbor does not trigger", !!(neigh && neigh.trigger && !neigh.trigger.portal), JSON.stringify(neigh.trigger));
    const expP = await api(page, "expand");
    const exp = expP && expP.portal;
    const coversOrigin = exp && exp.tiles && exp.tiles.some((t) => t.x === 20 && t.y === 20);
    record("old portal expands to 2x2 when space exists", !!(exp && exp.w === 2 && exp.h === 2 && coversOrigin && (exp.tiles || []).length === 4), JSON.stringify(exp));
    let expAll = true;
    for (const t of (exp && exp.tiles) || []) {
      const r = await api(page, "putHero", t.x, t.y);
      if (!(r && r.trigger && r.trigger.portal)) expAll = false;
    }
    record("expanded portal triggers on all 4 tiles", expAll, JSON.stringify(exp && exp.tiles));

    await api(page, "carve", 22, 22, 10);
    const oldS = await api(page, "placeStairs", 2, 21, 19, true);
    const isolated = (oldS.stairs || []).filter((s) => s.tile === 2);
    record("old 1-tile stairs load", isolated.some((s) => s.h === 1) || isolated.length === 1, JSON.stringify(oldS.stairs));
    const oldST = await api(page, "putHero", 21, 19);
    record("old 1-tile stairs still trigger", !!(oldST && oldST.trigger && oldST.trigger.down), JSON.stringify(oldST.trigger));
    const expS = await api(page, "expand");
    const pair = (expS.stairs || []).find((s) => s.tile === 2 && s.h === 2);
    const coversStair = pair && ((pair.x === 21 && pair.y === 19) || (pair.x === 21 && pair.y === 18));
    record("old stairs expand to 1x2 when space exists", !!(pair && coversStair), JSON.stringify(expS.stairs));
    let stairAll = true;
    if (pair) {
      for (let dy = 0; dy < 2; dy++) {
        const r = await api(page, "putHero", pair.x, pair.y + dy);
        if (!(r && r.trigger && r.trigger.down)) stairAll = false;
      }
    } else stairAll = false;
    record("expanded stairs trigger on either tile", stairAll);

    await api(page, "carve", 22, 22, 10);
    const loot = await api(page, "placePortal", "vault", 21, 18, false);
    record("loot cave portal 2x2", !!(loot.portal && loot.portal.w === 2 && loot.portal.kind === "vault"), JSON.stringify(loot.portal));
    const gob = await api(page, "spawnGob", 1, 18, 20);
    record("loot goblin spawned", !!(gob && gob.ok), JSON.stringify(gob));
    const walked = await api(page, "walkGob", 1, 0, 8);
    record("goblin trail particles present", !!(walked && walked.trail > 0), "trail=" + (walked && walked.trail));
    const cap = await api(page, "capTest");
    record("goblin trail respects cap", !!(cap && cap.ok && cap.trailOk && cap.trail > 0), JSON.stringify({ trail: cap.trail, cap: cap.trailCap }));
    record("loot portal fx respects cap", !!(cap && cap.ok && cap.pfxOk), JSON.stringify({ pfx: cap.pfx, cap: cap.pfxCap }));

    await shot(page, "stairs", "stairs-2tile-vertical-412x780.png", "new 1x2 down+up art");
    await shot(page, "portal", "normal-portal-2x2-412x780.png", "scaled one-graphic portal");
    await shot(page, "loot", "loot-cave-portal-412x780.png", "vivid loot cave portal");
    await shot(page, "goblin", "loot-goblin-trail-412x780.png", "aura + sparkle trail");

    await api(page, "end");
    record("end scratch game", true);
  } catch (err) {
    record("suite exception", false, (err && err.stack) || String(err));
  } finally {
    try { await api(page, "end"); } catch { /* ignore */ }
    await browser.close();
  }

  const fail = results.filter((r) => !r.pass).length;
  const pass = results.filter((r) => r.pass).length;
  console.log("\nPORTALS " + pass + " passed, " + fail + " failed, " + results.length + " total");
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
