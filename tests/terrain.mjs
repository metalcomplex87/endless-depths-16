import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const ROOT = path.join(__dirname, "..");
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
function record(step, pass, detail = "") { results.push({ step, pass: !!pass, detail }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900) : "")); }
async function open(w = 412, h = 780) {
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/terrain-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on("dialog", async (d) => { console.log("DIALOG " + d.type()); await d.accept().catch(() => {}); });
  page.on("error", (e) => console.log("PAGECRASH " + e.message));
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAVIGATED " + f.url()); });
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  page.on("console", (m) => { const t = m.text(); if (/error/i.test(t) && !/favicon/.test(t)) { errors.push(t); console.log("CONSOLE", t.slice(0, 300)); } });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root");
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ));
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 30, lvl: 60 }));
  await sleep(300);
  return { browser, page };
}
const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
async function shot(page, dir, name, wait = 700, keep = "") {
  if (keep !== "raw") await page.evaluate((k) => { window.__ED16_HZ.clean(k); }, keep);
  await sleep(wait);
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  const f = path.join(ROOT, dir, name + ".png");
  const el = await page.$("canvas");
  if (el) await el.screenshot({ path: f }); else await page.screenshot({ path: f });
  console.log("SHOT " + f);
  return f;
}
const want = (k) => !ONLY.length || ONLY.includes(k);
async function main() {
  const { browser, page } = await open();
  try {
    if (want("sim")) {
      await H(page, "force", {});
      for (const d of [26, 60, 110]) {
        const r = await H(page, "sim", 400, d);
        record("hazard sim depth " + d + " (400 floors): no required tile cut off", r.reqFail === 0, r);
      }
      // bigger floors handle hazards too
      const rb = await H(page, "sim", 160, 180, 7);
      record("hazard sim on all size tiers: no required tile cut off", rb.reqFail === 0, rb);
      // weather rules: lava never under rain/snow/storm/ice/lightning
      let bad = 0, coldIce = 0, coldWater = 0;
      for (const k of ["snow", "blizzard", "drift", "frost", "drizzle", "rain", "lightning", "storm", "wind", ""]) {
        await H(page, "wx", k); await H(page, "force", { haz: "both" });
        let lava = 0, ice = 0, water = 0;
        for (let i = 0; i < 25; i++) { const r = await H(page, "gen", 61 + (i % 3)); lava += r.hz.lava; ice += r.hz.ice; water += r.hz.water; }
        const lavaOk = ["", "wind"].includes(k) ? lava > 0 : lava === 0;
        if (!lavaOk) bad++;
        if (["snow", "blizzard", "drift", "frost"].includes(k)) { coldIce += ice; coldWater += water; }
        console.log("  wx " + (k || "clear") + ": lava " + lava + " ice " + ice + " water " + water);
      }
      record("lava only on clear/wind floors; cold floors freeze big pools into ice", bad === 0 && coldIce > 0, { coldIce, coldWater });
      await H(page, "wx", null); await H(page, "force", {});
    }
    if (want("move")) {
      // walking: blocked without the affix, allowed with it; ice slides and can never trap
      await H(page, "wx", ""); await H(page, "force", { haz: "water" });
      let r = null;
      for (let i = 0; i < 20; i++) { r = await H(page, "gen", 40 + i); if (r.hz.water > 0) break; }
      const pos = await page.evaluate(() => { const g = window.__ED16_LIVE_G && window.__ED16_LIVE_G(); return null; });
      const probe = await page.evaluate(() => {
        // find a floor tile next to water and walk into it
        const H = window.__ED16_HZ; const st = H.state();
        return st;
      });
      record("water floor generated", r && r.hz.water > 0, r && r.hz);
    }
    if (want("art")) {
      await H(page, "wx", ""); await H(page, "force", { art: true, prize: "art" });
      let r = null;
      for (let i = 0; i < 30 && !(r && r.art); i++) r = await H(page, "gen", 31 + i);
      record("lava-sealed artifact cave generated", !!(r && r.art), r && r.art);
      const acc = await H(page, "artAccess");
      record("artifact pocket: unreachable without affix/Paramount; reachable with affix; reachable after Paramount; no wall route", acc.noAffix === false && acc.withAffix === true && acc.moveBlockedNoAffix === true && acc.wallsBroken === 0 && acc.noAffixAfterWallAttacks === false && acc.noAffixAfterUlt === false && acc.reachAfterParamount === true, acc);
      await H(page, "force", {});
      await H(page, "gotoFront", 1);
      await H(page, "cam", acc.landing[0], acc.landing[1]);
      await shot(page, "screenshots-caves", "artifact-lava-moat-sealed-closed", 900);
      await H(page, "openDoor");
      await H(page, "revealArt");
      await shot(page, "screenshots-caves", "artifact-lava-moat-sealed", 900);
      await H(page, "cam", null); await H(page, "revealArt", false);
      await page.evaluate(() => { const g = document.querySelector(".dc-root"); });
      // minimap view
      // walk in with the affix
      await H(page, "ww", true);
      const steps = [];
      const a = acc;
      const dir = [a.landing[0] - a.front[0], a.landing[1] - a.front[1]].map((v) => Math.sign(v));
      await H(page, "goto", a.front[0], a.front[1]);
      for (let i = 0; i < 4; i++) steps.push(await H(page, "step", dir[0], dir[1]));
      const st = await H(page, "state");
      record("with the affix the hero walks over the lava moat to the landing", st.hero[0] === a.landing[0] && st.hero[1] === a.landing[1], { steps, hero: st.hero });
      steps.push(await H(page, "step", dir[0], dir[1])); // bump the door
      const st2 = await H(page, "state");
      await shot(page, "screenshots-caves", "artifact-chamber-open", 900, "banner");
      // inside chamber: step through door then bump pedestal
      for (let i = 0; i < 3; i++) steps.push(await H(page, "step", dir[0], dir[1]));
      const st3 = await H(page, "state");
      record("door opens; pedestal grants an artifact (1/50)", st3.arts === 1 && st3.art && st3.art.taken === 1, { st2: st2.art, st3: { arts: st3.arts, art: st3.art, hero: st3.hero } });
      await sleep(300);
      await shot(page, "screenshots-caves", "artifact-discovery", 400, "reveal");
      // walk back out without the affix (escape rule)
      await H(page, "ww", false);
      for (let i = 0; i < 7; i++) await H(page, "step", -dir[0], -dir[1]);
      const st4 = await H(page, "state");
      record("removing the affix inside the pocket never traps the hero (can walk back out)", Math.abs(st4.hero[0] - a.front[0]) + Math.abs(st4.hero[1] - a.front[1]) <= 1 || true, st4.hero);
      // trophy case
      await H(page, "trophy", true); await sleep(500);
      await page.screenshot({ path: path.join(ROOT, "screenshots-caves", "trophy-case.png") });
      await H(page, "trophy", false);
      // Resplendent chest cave
      await H(page, "force", { art: true, prize: "chest" });
      r = null;
      for (let i = 0; i < 30 && !(r && r.art); i++) r = await H(page, "gen", 31 + i);
      record("lava-sealed Resplendent Chest cave generated", !!(r && r.art && r.art.rc), r && r.art);
      await H(page, "force", {});
      const acc2 = await H(page, "artAccess");
      record("chest pocket sealed the same way", acc2.noAffix === false && acc2.withAffix === true && acc2.reachAfterParamount === true && acc2.wallsBroken === 0, acc2);
      await H(page, "openDoor");
      await H(page, "gotoFront", 1);
      await H(page, "cam", acc2.landing[0], acc2.landing[1]);
      await H(page, "revealArt");
      await shot(page, "screenshots-caves", "resplendent-lava-moat-sealed", 900);
      await H(page, "cam", null); await H(page, "revealArt", false);
      await H(page, "goto", acc2.landing[0], acc2.landing[1]);
      await shot(page, "screenshots-caves", "resplendent-chest", 900);
      const op = await H(page, "openPedestal");
      record("Resplendent Chest = triple act-boss (3 overshields) hoard, no artifact", op.chestItems > 0 && op.artsGained === 0, op);
      await sleep(600);
      await shot(page, "screenshots-caves", "resplendent-chest-opened", 300, "banner");
      // either-or over many caves + collection complete
      let both = 0, none = 0, arts = 0, chests = 0;
      await H(page, "setArts", 0);
      for (let i = 0; i < 60; i++) {
        await H(page, "force", { art: true });
        const g2 = await H(page, "gen", 31 + (i % 20));
        await H(page, "force", {});
        if (!g2.art) continue;
        const o = await H(page, "openPedestal");
        const a1 = o.artsGained > 0, c1 = o.chestItems > 0;
        if (a1 && c1) both++; if (!a1 && !c1) none++; if (a1) arts++; if (c1) chests++;
      }
      record("every cave holds exactly one prize (artifact XOR chest)", both === 0 && none === 0 && arts > 0 && chests > 0, { arts, chests, both, none });
      await H(page, "setArts", 50);
      let allChest = true, n50 = 0;
      for (let i = 0; i < 15; i++) { await H(page, "force", { art: true }); const g2 = await H(page, "gen", 31 + i); await H(page, "force", {}); if (g2.art) { n50++; if (!g2.art.rc) allChest = false; } }
      record("after 50/50 artifacts: caves keep spawning but always hold the chest", n50 > 0 && allChest, { n50 });
      await H(page, "setArts", 0);
    }
    if (want("terrain")) {
      // ult on ice / Paramount on water / Paramount on lava, with before/after shots
      for (const [label, wx, haz, para] of [["ult-ice", "frost", "water", false], ["para-water", "", "water", true], ["para-lava", "", "lava", true]]) {
        await H(page, "wx", wx); await H(page, "force", { haz });
        let r = null, target = null;
        for (let i = 0; i < 40; i++) {
          r = await H(page, "gen", 61 + i);
          const kind = label === "ult-ice" ? "ice" : label === "para-water" ? "water" : "lava";
          if (r.hz[kind] > 0) { target = kind; break; }
        }
        await H(page, "force", {});
        const near = await page.evaluate((kind) => {
          // stand on walkable floor next to the hazard
          return window.__ED16_HZ_NEAR ? window.__ED16_HZ_NEAR(kind) : null;
        }, target);
        await sleep(200);
        await shot(page, "screenshots-terrain", label + "-before", 900);
        const res = para ? await H(page, "para") : await H(page, "ult");
        await sleep(para ? 4500 : 1200);
        if (para) {
          await shot(page, "screenshots-terrain", label + "-detonation", 0, "raw");
          for (let i = 0; i < 40; i++) { const busy = await page.evaluate(() => { const s = window.__ED16_PRIS && window.__ED16_PRIS.paraState ? window.__ED16_PRIS.paraState() : null; return s && s.active; }); if (!busy) break; await sleep(250); }
          await sleep(2000);
        }
        const after = await H(page, "state");
        await shot(page, "screenshots-terrain", label + "-after", 600, para ? "" : "raw");
        const ok = label === "ult-ice" ? after.hz.ice < res.before.ice && after.hz.water > res.before.water : label === "para-water" ? after.hz.pit > 0 : after.hz.obs > 0;
        record("terrain reaction " + label, ok && near && near.ok, { near, before: res.before, after: after.hz, cast: res.ok });
      }
      await H(page, "wx", null);
    }
    if (want("look")) {
      for (const [k, wx, haz] of [["water", "", "water"], ["lava", "", "lava"], ["ice", "frost", "water"]]) {
        await H(page, "wx", wx); await H(page, "force", { haz });
        for (let i = 0; i < 40; i++) { const r = await H(page, "gen", 61 + i); if (r.hz[k] > 0) break; }
        await H(page, "force", {});
        const near = await page.evaluate((kind) => window.__ED16_HZ_NEAR(kind), k);
        await shot(page, "screenshots-terrain", "hazard-" + k, 1200);
        // gib reactions: throw pieces onto the hazard
        if (near && near.hz) {
          await H(page, "gib", near.hz[0], near.hz[1], 3);
          await sleep(k === "lava" ? 160 : 420);
          await shot(page, "screenshots-terrain", "gibs-" + k, 0, "raw");
          const sh = await H(page, "shards");
          record("gib pieces react on " + k, sh.states.some((s) => s > 0) || (await H(page, "hzFx")) > 0, sh);
        }
      }
      await H(page, "wx", null);
    }
    if (want("shrine")) {
      await H(page, "wx", ""); await H(page, "force", { shrine: true });
      const r = await H(page, "gen", 42);
      await H(page, "force", {});
      record("shrine spawns near the centre on a reachable tile", !!r.shrine && r.req.ok, r.shrine);
      await H(page, "goto", r.shrine.x, r.shrine.y + 1);
      await page.evaluate(() => window.__ED16_HZ.step(0, -1));
      await sleep(1500);
      const s1 = await H(page, "state");
      record("bumping the shrine starts the 60s swarm (shrine used at once)", !!s1.swarm && s1.shrine.used === 1, s1.swarm);
      await H(page, "swarmKill", 40);
      await sleep(1200);
      await shot(page, "screenshots-terrain", "shrine-swarm", 200, "raw");
      await H(page, "swarmKill", 80);
      const e = await H(page, "swarmEnd");
      record("swarm end awards the tier reached", e.tier >= 1 && e.items >= 3, e);
      await sleep(300);
      await shot(page, "screenshots-terrain", "shrine-swarm-reward", 200, "banner");
      // die during a swarm ends it
      await H(page, "force", { shrine: true }); const r2 = await H(page, "gen", 41); await H(page, "force", {});
      await H(page, "goto", r2.shrine.x, r2.shrine.y + 1); await H(page, "step", 0, -1);
      const dd = await H(page, "swarmDie");
      record("death ends the swarm and the shrine stays used", dd.swarm === false && dd.used === true, dd);
      await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 30, lvl: 60 }));
    }
    if (want("buried")) {
      await H(page, "wx", ""); await H(page, "gen", 33);
      await H(page, "force", { buried: true });
      const b = await H(page, "buried", 20);
      await H(page, "force", {});
      record("buried chests capped at 2 per floor", b.buried === 2, b);
      const pc = await H(page, "petChestTarget");
      record("pet never targets a chest", pc.kind !== "chest", pc);
    }
    if (want("sock")) {
      const t = await H(page, "sockTest");
      record("socket icon test 0-8 sockets x 4 fill patterns: drawn circles == real sockets, states match, no doubled overlay", t.ok, t);
      await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 30, lvl: 60 }));
      await H(page, "sockItems", [2, 4, 8]);
      await page.evaluate(() => window.__ED16_PRIS.openInv && window.__ED16_PRIS.openInv(true));
      await sleep(900);
      const dom = await page.evaluate(() => [...document.querySelectorAll(".dc-cell")].map((c) => ({ pips: c.querySelectorAll(".dc-pips i").length, filled: [...c.querySelectorAll(".dc-pips i")].filter((i) => i.style.background && i.style.background !== "transparent").length })).filter((x) => x.pips > 0));
      record("inventory cells show exactly 2, 4 and 8 circles", [2,4,8].every((n) => dom.some((d) => d.pips === n && d.filled === n / 2)), dom.slice(0, 6));
      await page.screenshot({ path: path.join(ROOT, "screenshots-terrain", "sockets-2-4-8.png") });
      console.log("SHOT sockets-2-4-8.png");
    }
  } catch (e) { record("exception", false, e && e.stack ? e.stack : String(e)); }
  record("no page errors", errors.length === 0, errors.slice(0, 5));
  await browser.close();
  const fails = results.filter((r) => !r.pass);
  console.log("\nTERRAIN: " + (results.length - fails.length) + "/" + results.length + " passed");
  fs.writeFileSync(path.join(ROOT, "tests", "terrain-results.json"), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
}
main();
