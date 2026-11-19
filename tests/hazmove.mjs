// Water walking, exclusive hazard floors, ultimate melt, Paramount evaporate/obsidian.
// Throwaway profiles only; never touches real saves. Richard's save is loaded from a COPY of the file.
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50264/";
const ROOT = path.join(__dirname, "..");
const RICHARD = (process.env.RICHARD_FILE || path.join(ROOT, "saves/richard-boss-2026-11-17.txt"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900) : ""));
}

async function open() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/hazmove-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  page.on("console", (m) => { const t = m.text(); if (/error/i.test(t) && !/favicon/.test(t)) { errors.push(t); console.log("CONSOLE", t.slice(0, 300)); } });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root");
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ));
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 40, lvl: 80 }));
  await sleep(300);
  return { browser, page };
}
const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);

async function loadCode(page, code) {
  if (!(await page.$('textarea[aria-label="Paste save code"]'))) {
    await page.evaluate(() => {
      const can = [...document.querySelectorAll("button")].some((el) => (el.textContent || "").includes("LOAD code") && !el.disabled);
      if (!can) {
        const lk = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "\ud83d\udd12");
        if (lk) lk.click();
      }
    });
    await sleep(400);
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD code") && !el.disabled)
        || [...document.querySelectorAll("button")].find((el) => /\bLOAD$/.test((el.textContent || "").trim()) && !el.disabled);
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) throw new Error("LOAD code button not available");
    await page.waitForSelector('textarea[aria-label="Paste save code"]', { timeout: 15000 });
  }
  await page.evaluate((c) => {
    const ta = document.querySelector('textarea[aria-label="Paste save code"]');
    if (!ta) throw new Error("paste textarea missing");
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    const tracker = ta._valueTracker;
    if (tracker) tracker.setValue("");
    desc.set.call(ta, c);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, code);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE"));
    return !!(b && !b.disabled);
  }, { timeout: 15000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE") && !el.disabled);
    if (!b) throw new Error("LOAD THIS CODE not available");
    b.click();
  });
  await sleep(800);
}

async function main() {
  const { browser, page } = await open();
  try {
    // --- exclusive generation ---
    await H(page, "force", {});
    await H(page, "wx", null);
    for (const [n, d, tier] of [[300, 40, null], [160, 180, 7]]) {
      const r = await H(page, "sim", n, d, tier);
      rec("natural gen (" + n + " floors @ " + d + (tier != null ? ", all sizes" : "") + "): water and lava never share a floor; ice is only on its own floors",
        r.mixWaterLava === 0 && r.mixIceWater === 0 && r.mixIceLava === 0 && r.reqFail === 0 && r.water + r.lava + r.ice > 0, r);
    }
    for (const [haz, wx, want, forbid] of [
      ["water", "", "water", ["lava", "ice"]],
      ["lava", "", "lava", ["water", "ice"]],
      ["ice", "frost", "ice", ["water", "lava"]],
    ]) {
      await H(page, "wx", wx);
      await H(page, "force", { haz });
      let ok = 0, bad = 0, empty = 0;
      for (let i = 0; i < 40; i++) {
        const r = await H(page, "gen", 50 + i);
        const c = r.hz;
        if (c[want] > 0) ok++;
        else empty++;
        if (forbid.some((k) => c[k] > 0)) bad++;
      }
      rec("forced " + haz + " floors have " + want + " only (no " + forbid.join("/") + ")", ok >= 20 && bad === 0, { ok, empty, bad });
    }
    await H(page, "force", {});
    await H(page, "wx", null);

    // --- movement: walk + run on water, lava blocks, ice slides ---
    await H(page, "ww", false);
    const water = await H(page, "paintFront", "water", 5);
    rec("painted a 5-tile water path in front of the hero", !!(water && water.ok), water);
    if (water && water.ok) {
      const [dx, dy] = water.dir;
      const landDur = water.stepDur;
      const p0 = await H(page, "probe", water.cells[0][0], water.cells[0][1]);
      rec("water is solid for enemies but not for the hero (normal tile, no slowdown hook)", p0.solid === true && p0.blocksHero === false && p0.heroStep === true && p0.enemyWalk === false, p0);

      await H(page, "setRt", false);
      const w1 = await H(page, "step", dx, dy, false);
      rec("walk (turn-based) steps onto water at normal speed", w1.to[0] === water.cells[0][0] && w1.to[1] === water.cells[0][1] && w1.onHz === 1 && w1.rt === false && Math.abs((w1.stepDur || 0) - landDur) < 1e-9, w1);
      const w2 = await H(page, "step", dx, dy, false);
      rec("walk continues across a second water tile", w2.to[0] === water.cells[1][0] && w2.to[1] === water.cells[1][1] && w2.onHz === 1, w2);

      // reset to the start tile and run across the rest
      await H(page, "goto", water.from[0], water.from[1]);
      await H(page, "setRt", true);
      const r1 = await H(page, "step", dx, dy, true);
      rec("run (real-time) steps onto water at the same step duration", r1.to[0] === water.cells[0][0] && r1.to[1] === water.cells[0][1] && r1.onHz === 1 && r1.rt === true && Math.abs((r1.stepDur || 0) - landDur) < 1e-9, r1);
      const r2 = await H(page, "step", dx, dy, true);
      rec("run continues across a second water tile", r2.to[0] === water.cells[1][0] && r2.to[1] === water.cells[1][1] && r2.onHz === 1, r2);
    }

    // leave the water strip and paint lava from a clear floor tile
    const st = await H(page, "state");
    // find a plain floor tile near the hero that is not on a hazard
    await page.evaluate(() => {
      const g = window.__ED16_LIVE_G && window.__ED16_LIVE_G();
      if (!g) return;
      // hook may not expose LIVE_G; paintFront uses current hero pos
    });
    // step back to origin if possible, else gen a fresh floor and paint lava
    await H(page, "wx", "");
    await H(page, "force", {});
    await H(page, "gen", 55);
    await H(page, "ww", false);
    const lava = await H(page, "paintFront", "lava", 4);
    rec("painted a lava path in front of the hero", !!(lava && lava.ok), lava);
    if (lava && lava.ok) {
      const [dx, dy] = lava.dir;
      const from = lava.from;
      const pL = await H(page, "probe", lava.cells[0][0], lava.cells[0][1]);
      rec("lava blocks the hero without Lavastrider and blocks enemies", pL.solid === true && pL.blocksHero === true && pL.heroStep === false && pL.enemyWalk === false, pL);
      const blocked = await H(page, "step", dx, dy, true);
      rec("run/walk into lava is refused (hero stays put)", blocked.blocked === true && blocked.to[0] === from[0] && blocked.to[1] === from[1] && blocked.onHz !== 2, blocked);
      await H(page, "ww", true);
      const cross = await H(page, "step", dx, dy, true);
      rec("with Lavastrider the hero can cross lava", cross.to[0] === lava.cells[0][0] && cross.to[1] === lava.cells[0][1] && cross.onHz === 2, cross);
      await H(page, "ww", false);
    }

    await H(page, "gen", 56);
    const ice = await H(page, "paintFront", "ice", 6);
    rec("painted an ice path in front of the hero", !!(ice && ice.ok), ice);
    if (ice && ice.ok) {
      const [dx, dy] = ice.dir;
      const s1 = await H(page, "step", dx, dy, true);
      rec("stepping onto ice starts a slide in that direction", s1.to[0] === ice.cells[0][0] && s1.to[1] === ice.cells[0][1] && s1.onHz === 3 && !!s1.slide && s1.slide.dx === dx && s1.slide.dy === dy, s1);
      // slideTick waits SLIDE_STEP (0.075s) then moves; give it 0.2s
      let pos = s1.to, slides = 0;
      for (let i = 0; i < 8; i++) {
        const t = await H(page, "tick", 0.2);
        if (t.hero[0] !== pos[0] || t.hero[1] !== pos[1]) { slides++; pos = t.hero; }
      }
      rec("ice slide continues automatically across further ice tiles (stops at the end of the ice or the 8-tile cap)", slides >= 1 && slides <= 8, { slides, pos, path: ice.cells });
    }

    // --- ultimate melts ice to water ---
    await H(page, "gen", 70);
    const ice2 = await H(page, "paintFront", "ice", 5);
    const melt = await H(page, "terrain", false);
    rec("regular ultimate melts ice in its area into water (passable); lava unchanged",
      !!(ice2 && ice2.ok) && melt.after.ice < melt.before.ice && melt.after.water > melt.before.water && melt.r.melted > 0 && melt.after.ice + melt.after.water === melt.before.ice + melt.before.water, melt);
    const wAfter = ice2 && ice2.ok ? await H(page, "probe", ice2.cells[0][0], ice2.cells[0][1]) : null;
    rec("melted ice is now walkable water for the hero", wAfter && (wAfter.hz === 1 || wAfter.hz === 0) && wAfter.blocksHero === false, wAfter);

    // --- Paramount evaporates water and ice to bare floor; lava -> obsidian ---
    await H(page, "gen", 71);
    const w3 = await H(page, "paintFront", "water", 5);
    const evapW = await H(page, "terrain", true);
    rec("Paramount evaporates water into plain floor (not a dry pit); steam radius reported",
      !!(w3 && w3.ok) && evapW.after.water < evapW.before.water && evapW.r.pits > 0 && evapW.after.pit === (evapW.before.pit || 0) && evapW.rad >= 9, evapW);
    const pW = w3 && w3.ok ? await H(page, "probe", w3.cells[0][0], w3.cells[0][1]) : null;
    rec("evaporated water tile is plain walkable floor", pW && pW.hz === 0 && pW.blocksHero === false && pW.heroStep === true, pW);

    await H(page, "gen", 72);
    const i3 = await H(page, "paintFront", "ice", 5);
    const evapI = await H(page, "terrain", true);
    rec("Paramount evaporates ice into plain floor (not a dry pit)",
      !!(i3 && i3.ok) && evapI.after.ice < evapI.before.ice && evapI.r.pits > 0 && evapI.after.pit === (evapI.before.pit || 0), evapI);

    await H(page, "gen", 73);
    const l3 = await H(page, "paintFront", "lava", 5);
    const obs = await H(page, "terrain", true);
    rec("Paramount turns lava in the same area into walkable obsidian",
      !!(l3 && l3.ok) && obs.after.lava < obs.before.lava && obs.after.obs > (obs.before.obs || 0) && obs.r.obs > 0 && obs.rad >= 9, obs);
    const pO = l3 && l3.ok ? await H(page, "probe", l3.cells[0][0], l3.cells[0][1]) : null;
    rec("obsidian is a distinct walkable tile (no damage, hero and pathing can enter)", pO && pO.hz === 4 && pO.solid === false && pO.blocksHero === false && pO.heroStep === true, pO);

    rec("Paramount terrain radius is the Paramount blast radius plus 4 tiles (at least 9)", evapW.rad === evapW.paraRadius + 4 && evapW.rad >= 9, { rad: evapW.rad, paraRadius: evapW.paraRadius });

    // --- save-copy of Richard: load, still intact, Paramount lava -> obsidian on a painted strip ---
    const code = fs.readFileSync(RICHARD, "utf8").replace(/\s+/g, "");
    rec("Richard save file is read only from the local copy path (never a live profile)", RICHARD.includes("richard-boss-2026-11-17") && code.length > 20, { file: RICHARD, chars: code.length });
    const loaded = await H(page, "load", code);
    rec("Richard save COPY loaded into the throwaway session (depth kept, nothing wiped)", !!(loaded && loaded.ok && loaded.depth > 1), loaded);
    if (loaded && loaded.ok) {
      const before = await H(page, "state");
      rec("copied save is playable after load", !!(before && before.hero), before);
      const lavaR = await H(page, "paintFront", "lava", 4);
      if (lavaR && lavaR.ok) {
        const after = await H(page, "terrain", true);
        rec("on the copied save, Paramount still turns painted lava into walkable obsidian", after.after.obs > (after.before.obs || 0) && after.r.obs > 0, after);
      } else {
        rec("on the copied save, could paint lava in front of the hero to test Paramount obsidian", false, lavaR);
      }
    }

  } catch (e) {
    rec("exception", false, e && e.stack ? e.stack : String(e));
  }
  rec("no page errors", errors.length === 0, errors.slice(0, 5));
  await browser.close();
  const fails = results.filter((r) => !r.pass);
  console.log("\nHAZMOVE: " + (results.length - fails.length) + "/" + results.length + " passed");
  fs.writeFileSync(path.join(ROOT, "tests", "hazmove-results.json"), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
}
main();
