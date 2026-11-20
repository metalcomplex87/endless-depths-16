// Biome overlay tests (2026-11-20). Throwaway browser profile, Tester profile (p4, never persisted). No real saves are written.
// Usage: ED16_URL=http://127.0.0.1:50211/ node tests/biomes.mjs   (optional OLD_SAVE=/path/to/copy-of-old-save.txt, SHOTS=dir)
import puppeteer from "puppeteer-core";
import fs from "fs";
import { passOwnerGate } from "./_owner.mjs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50211/";
const SHOTS = process.env.SHOTS || "/workspace/ed16-biome-shots";
const OLD = process.env.OLD_SAVE || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [], errors = [];
function record(step, pass, detail = "") { results.push({ step, pass: !!pass }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700) : "")); }
const IDS = ["umbral", "lodestone", "ley", "bramble", "hourglass"];
async function main() {
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/biomes-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  page.on("console", (m) => { const t = m.text(); if (m.type() === "error" && !/favicon|Failed to load resource/.test(t)) { errors.push(t); console.log("CONSOLE", t.slice(0, 300)); } });
  page.on("dialog", async (d) => { await d.accept().catch(() => {}); });
  // Offline sandbox: only the game host is reachable, so the save-backup relay / restore gists are never read or written.
  const host = new URL(BASE).host; let blocked = 0;
  await page.setRequestInterception(true);
  page.on("request", (req) => { try { const u = new URL(req.url()); if (u.host === host || u.protocol === "data:" || u.protocol === "blob:") req.continue(); else { blocked++; req.abort(); } } catch { req.abort(); } });
  // Owner gate: with ED16_OWNER_CODE set, unlock through the real gate. Without it, only a LOCAL (127.0.0.1) build is
  // opened with this throwaway browser's "remembered unlock" pre-set; never done against the live site.
  const local = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE);
  if (!process.env.ED16_OWNER_CODE) { if (!local) throw new Error("ED16_OWNER_CODE required for a non-local URL"); await page.evaluateOnNewDocument(() => { try { localStorage.setItem("ed16_owner_ok", "ed16-owner-ok-v1"); } catch {} }); }
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root");
  if (process.env.ED16_OWNER_CODE) await passOwnerGate(page);
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_BIO));
  const B = (n, ...a) => page.evaluate((n, a) => window.__ED16_BIO[n](...a), n, a);
  // start the Tester profile (p4: always a brand-new game, never saved)
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Tester/.test(b.textContent || "")), { timeout: 30000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((el) => /Tester/.test(el.textContent || "")); b.click(); });
  await sleep(1500);
  const prof = await B("useTester");
  record("using the throwaway Tester profile (p4, never persisted)", prof.prof === 4, prof);
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 30, lvl: 80 }));
  await sleep(300);

  const reg = await B("registry");
  const ALL = reg.map((b) => b.id), DEEP = reg.filter((b) => b.unlockDepth > 11).map((b) => b.id), UNL = Object.fromEntries(reg.map((b) => [b.id, b.unlockDepth])), BAD = Object.fromEntries(reg.map((b) => [b.id, b.bad]));
  record("registry has 30 biomes: the five at unlockDepth 11, then 25 unlocking at 20, 40 ... 500 in plan order; distinct ids/names", reg.length === 30 && reg.slice(0, 5).every((b) => b.unlockDepth === 11) && reg.slice(5).every((b, i) => b.unlockDepth === 20 * (i + 1)) && new Set(ALL).size === 30 && new Set(reg.map((b) => b.name)).size === 30 && reg.every((b) => b.variant && b.loot), reg.map((b) => b.unlockDepth + ":" + b.id));
  const pools = await page.evaluate(() => Object.fromEntries([10, 11, 19, 20, 39, 40, 499, 500, 600, 2000].map((d) => [d, window.__ED16_BIO.pool(d).length])));
  record("pool sizes: 19->5, 20->6, 39->6, 40->7, 499->29, 500->30, 600->30 (and 10->0? no: pool ignores the depth-11 gate, the roll applies it)", pools[19] === 5 && pools[20] === 6 && pools[39] === 6 && pools[40] === 7 && pools[499] === 29 && pools[500] === 30 && pools[600] === 30 && pools[2000] === 30 && pools[11] === 5, pools);
  const unl = await page.evaluate((reg) => {
    const B = window.__ED16_BIO, bad = [];
    for (const b of reg) {
      const u = b.unlockDepth; if (u <= 11) continue;
      if (B.pool(u - 1).includes(b.id) || !B.pool(u).includes(b.id)) bad.push(b.id + ":pool");
      let before = 0, at = 0;
      for (let s = 0; s < 6000; s++) { const sd = (s * 2246822519 + u) >>> 0; if (B.roll(u - 1, sd, []) === b.id) before++; if (B.roll(u, sd, []) === b.id) at++; }
      if (before !== 0 || at === 0) bad.push(b.id + ":roll before=" + before + " at=" + at);
    }
    return bad;
  }, reg);
  record("each of the 25 deep biomes unlocks exactly at its depth: never rolled at unlockDepth-1, rolled at unlockDepth", unl.length === 0, unl);
  const rates = await page.evaluate(() => { const B = window.__ED16_BIO, out = {}; for (const d of [11, 19, 20, 40, 99, 100, 199, 250, 401, 499, 500, 600, 1000, 5000]) { let n = 0; for (let s = 0; s < 8000; s++) if (B.roll(d, (s * 2654435761 + d * 7) >>> 0, [])) n++; out[d] = +(n / 8000).toFixed(4); } return out; });
  record("overall biome chance stays ~22% at every depth from 11 to 5000 (it does not grow with the pool)", Object.values(rates).every((r) => Math.abs(r - 0.22) < 0.015), rates);

  // 1. pure seeded roll
  const rollStats = await page.evaluate(() => {
    const B = window.__ED16_BIO; const out = {};
    for (const d of [1, 5, 10, 11, 30, 51, 150]) { const by = {}; let n = 0; for (let s = 0; s < 6000; s++) { const id = B.roll(d, (s * 2654435761) >>> 0, []); if (id) { n++; by[id] = (by[id] || 0) + 1; } } out[d] = { rate: n / 6000, by }; }
    return out;
  });
  record("seeded roll: zero biomes at depths 1, 5, 10", [1, 5, 10].every((d) => rollStats[d].rate === 0), { 1: rollStats[1].rate, 5: rollStats[5].rate, 10: rollStats[10].rate });
  for (const d of [11, 30, 51, 150]) record("seeded roll at depth " + d + ": all five appear, total ~22%", IDS.every((id) => rollStats[d].by[id] > 0) && Math.abs(rollStats[d].rate - 0.22) < 0.02, rollStats[d]);
  const mp = await B("mockPool", 25, 500, 8000);
  record("even a 55-entry pool (30 real + 25 mock) keeps the per-floor chance at ~22%", mp.pool === 55 && Math.abs(mp.rate - 0.22) < 0.02 && mp.kinds >= 50, mp);

  // 2. real floor generation over many floors
  const low = await B("sim", 1, 200, 10);
  record("200 generated floors at depths 1-10: zero biomes", low.biome === 0, { biome: low.biome, floors: low.floors });
  for (const d of [11, 30, 31, 51, 150, 151]) {
    const r = await B("sim", d, 400, 1);
    const act = d % 5 === 0;
    const pass = act ? r.biome === 0 && r.reqFail === 0 && r.stairFail === 0 : IDS.every((id) => (r.by[id] || 0) > 0) && r.reqFail === 0 && r.stairFail === 0 && r.lavaClash === 0 && r.bad.length === 0;
    record("400 floors at depth " + d + (act ? " (act-boss floor: biomes skipped by design)" : ": every biome appears; stairs/portals/chests reachable; no feature on hazards"), pass, { biome: r.biome, by: r.by, reqFail: r.reqFail, stairFail: r.stairFail, lavaClash: r.lavaClash, bad: r.bad, sizes: r.sizes });
  }
  const big = await B("sim", 151, 640, 40, 7);
  record("320 floors depths 151-190 on all 8 size tiers: valid layouts with biomes", big.reqFail === 0 && big.stairFail === 0 && big.lavaClash === 0 && big.bad.length === 0 && big.actBio === 0 && IDS.every((id) => (big.by[id] || 0) > 0), { by: big.by, sizes: big.sizes, reqFail: big.reqFail, stairFail: big.stairFail, actBio: big.actBio });

  // 3. combos: each biome x hazard x size (+ weather)
  let combos = 0, comboBad = [], refused = 0;
  for (const id of IDS) for (const haz of ["", "water", "lava", "ice"]) for (const tier of [0, 7]) {
    const r = await B("gen", 61 + (combos % 3), { id, haz, tier, wx: haz === "ice" ? "frost" : haz === "water" ? "rain" : "" });
    combos++;
    const lavaFloor = r.hz.includes("lava");
    if ((id === "umbral" || id === "bramble") && lavaFloor) { if (r.biome !== null) comboBad.push(id + "+lava not refused"); else refused++; continue; }
    if (r.biome !== id) { comboBad.push(id + "/" + haz + "/" + tier + " biome=" + r.biome); continue; }
    if (!r.req.ok || !r.stairs) comboBad.push(id + "/" + haz + "/" + tier + " " + JSON.stringify(r.req.bad));
  }
  await page.evaluate(() => window.__ED16_HZ.wx(null));
  record("biome x {none, water, lava, ice} x {normal 44, titanic 72} combos: stairs reachable from spawn, no cut-off tiles", comboBad.length === 0, { combos, refusedLava: refused, bad: comboBad.slice(0, 6) });

  // 3b. the 25 deep biomes: forced onto every hazard family x {normal 44, titanic 72}; layouts must stay intact
  {
    let n = 0; const badC = []; let refused = 0;
    for (const id of DEEP) for (const haz of ["", "water", "lava", "ice"]) for (const tier of [0, 7]) {
      const d = Math.max(UNL[id], 21) + 1 + (n % 3);
      const r = await B("gen", d % 5 === 0 ? d + 1 : d, { id, haz, tier, wx: "" }); n++;
      if ((BAD[id] || []).some((k) => r.hz.includes(k))) { if (r.biome !== null) badC.push(id + "+" + haz + " not refused"); else refused++; continue; }
      if (r.biome !== id) { badC.push(id + "/" + haz + "/" + tier + " biome=" + r.biome); continue; }
      if (!r.req.ok || !r.stairs || !r.featOk) badC.push(id + "/" + haz + "/" + tier + " req=" + JSON.stringify(r.req.bad) + " stairs=" + r.stairs + " featOk=" + r.featOk);
    }
    await page.evaluate(() => window.__ED16_HZ.wx(null));
    record("25 deep biomes x {none, water, lava, ice} x {44, 72}: stairs/portals/chests reachable, features only on plain floor, bad[] refusals honoured", badC.length === 0, { combos: n, refused, bad: badC.slice(0, 8) });
    const deepSim = await B("sim", 501, 600, 60, 7);
    record("600 random floors at depths 501-560 on all size tiers (all 30 biomes eligible): valid layouts, ~22% biome", deepSim.reqFail === 0 && deepSim.stairFail === 0 && deepSim.lavaClash === 0 && deepSim.bad.length === 0 && Object.keys(deepSim.by).length >= 18, { biome: deepSim.biome, floors: deepSim.floors, kinds: Object.keys(deepSim.by).length, sizes: deepSim.sizes, reqFail: deepSim.reqFail, stairFail: deepSim.stairFail, bad: deepSim.bad });
  }

  // 4. mechanics
  const mech = {};
  for (const id of IDS) { await B("gen", 61, { id, haz: id === "bramble" || id === "umbral" ? "water" : "" }); mech[id] = await B("mech"); }
  record("Umbral Veil: a Lumen Shard lights the floor for 30 s once (cannot be re-collected)", mech.umbral.lit === 30 && mech.umbral.used === 1 && mech.umbral.usedAgain === 1, mech.umbral);
  record("Lodestone Deep: gold 2-3 tiles away is pulled in and collected", mech.lodestone.collected && mech.lodestone.goldGain > 0, mech.lodestone);
  record("Ley Nexus: standing at a well heals; dormant during a swarm", mech.ley.healed > 0 && mech.ley.healedDuringSwarm === 0, mech.ley);
  record("Bramble Warren: thorns hurt + slow ordinary foes, never bosses or the hero", mech.bramble.foeLost > 0 && mech.bramble.foeSlow > 0 && mech.bramble.bossLost === 0 && mech.bramble.heroLost === 0, mech.bramble);
  record("Hourglass Rift: an 18 s Stillwave freezes ordinary foes, never bosses", mech.hourglass.foeStun > 0 && mech.hourglass.bossStun === 0, mech.hourglass);

  // 4a. deep biome mechanics, normal and during a swarm (calm)
  {
    const P = {}, failN = [], failC = [];
    const moved = (a, b) => !!a && !!b && (a.x !== b.x || a.y !== b.y);
    const same = (a, b) => !a || !b || (a.x === b.x && a.y === b.y && a.hp === b.hp);
    const full = (e) => !e || e.hp === e.mhp;
    const okN = {
      bells: (m) => m.foe && m.foe.stun > 0 && (!m.boss || m.boss.stun === 0),
      origami: (m) => m.ward === 8 && m.dmg100 === 75,
      honeycomb: (m) => m.foe && m.foe.slow > 0 && (!m.boss || m.boss.slow === 0),
      ink: (m) => m.blots === 1 && m.left === 0 && m.gold > 0,
      tidegear: (m) => moved(m.foe0, m.foe) && !moved(m.boss0, m.boss),
      carnival: (m) => m.charges === 3 && m.bonus === 40 && m.bossBonus === 0,
      orrery: (m) => m.inRing === 70 && m.outRing === 100,
      quilt: (m) => m.foe && m.foe.stun >= 3 && m.used === 1 && (!m.boss || m.boss.stun === 0),
      balloon: (m) => m.used === 1 && m.foeDist[1] > m.foeDist[0] && !moved(m.boss0, m.boss),
      taxidermy: (m) => m.foe && m.foe.fear > 0 && (!m.boss || m.boss.fear === 0) && m.used === 1 && m.gold > 0,
      organum: (m) => m.wrong === 0 && m.solved && m.gold > 0,
      greenhouse: (m) => m.foe && m.foe.stun > 0 && (!m.boss || m.boss.stun === 0) && m.healed > 0,
      mercury: (m) => m.decoy === 5 && m.foeDist[1] < m.foeDist[0] && (!m.boss || m.boss.stun === 0),
      kaleido: (m) => m.bright === 25 && m.dark === 0,
      levity: (m) => m.tested && m.armed && m.moved === 1,
      banquet: (m) => m.healed > 0 && m.track >= 5,
      echo: (m) => m.acd === 0,
      cactus: (m) => m.foe && m.foe.hp < m.foe.mhp && full(m.boss) && m.heroPct > 0 && m.heroPct <= 0.035,
      buriedsun: (m) => m.sun > 0 && m.foe && m.foe.hp < m.foe.mhp && full(m.boss),
      trainyard: (m) => m.used === 1 && m.gold > 0 && m.foe && (m.foe.stun > 0 || m.foeDist[1] > m.foeDist[0]) && (!m.boss || m.boss.stun === 0),
      skycellar: (m) => m.tested && m.moved === 2,
      serverfarm: (m) => m.foe && m.foe.stun > 0 && (!m.boss || m.boss.stun === 0),
      velvet: (m) => m.first === 30 && m.second === 0 && m.bossBonus === 0,
      kites: (m) => m.tested && m.moved === 3,
      white: (m) => m.foe && m.foe.hp < m.foe.mhp && m.foe.hp > 0 && m.low === 1 && full(m.boss),
    };
    const okC = {
      bells: (m) => !m.foe || m.foe.stun === 0,
      origami: (m) => m.dmg100 === 88,
      honeycomb: (m) => !m.foe || m.foe.slow === 0,
      ink: (m) => m.blots === 0,
      tidegear: (m) => !moved(m.foe0, m.foe),
      carnival: (m) => m.charges === 0 && m.onHitCalm === 0,
      orrery: (m) => m.inRing === 100,
      quilt: (m) => m.used === 0 && (!m.foe || m.foe.stun === 0),
      balloon: (m) => m.used === 0 && m.foeDist[1] === m.foeDist[0],
      taxidermy: (m) => m.used === 0 && (!m.foe || m.foe.fear === 0),
      organum: (m) => !m.solved,
      greenhouse: (m) => (!m.foe || m.foe.stun === 0) && m.healed > 0,
      mercury: (m) => m.decoy === 0,
      kaleido: (m) => m.bright === 0 || m.bright === "n/a",
      levity: (m) => !m.armed,
      banquet: (m) => m.healed === 0,
      echo: (m) => m.acd === 5,
      cactus: (m) => m.heroLost === 0 && full(m.foe),
      buriedsun: (m) => !m.sun && full(m.foe),
      trainyard: (m) => m.used === 0 && (!m.foe || m.foe.stun === 0),
      skycellar: (m) => m.tested && m.moved === 2,
      serverfarm: (m) => !m.foe || m.foe.stun === 0,
      velvet: (m) => m.first === 0 && m.onHitCalm === 0,
      kites: (m) => m.tested && m.moved === 3,
      white: (m) => full(m.foe),
    };
    for (const id of DEEP) {
      const d = Math.max(UNL[id], 21) + 1;
      await B("gen", d % 5 === 0 ? d + 1 : d, { id, haz: "", tier: 0, wx: "" });
      const n = await B("mech2", false);
      await B("gen", d % 5 === 0 ? d + 1 : d, { id, haz: "", tier: 0, wx: "" });
      const c = await B("mech2", true);
      P[id] = { n, c };
      if (!okN[id] || !okN[id](n)) failN.push(id);
      if (!okC[id] || !okC[id](c)) failC.push(id);
    }
    fs.writeFileSync("/tmp/ed16-biome-mech2.json", JSON.stringify(P, null, 1));
    record("25 deep mechanics work on ordinary foes and never touch bosses (" + (DEEP.length - failN.length) + "/" + DEEP.length + ")", failN.length === 0, Object.fromEntries(failN.map((id) => [id, P[id].n])));
    record("25 deep mechanics stay dormant or soften during a swarm (helpful hero-only tools may stay on)", failC.length === 0, Object.fromEntries(failC.map((id) => [id, P[id].c])));
  }

  // 4b. spider swarm (depth >= 51): floors that arm a swarm still generate valid biome layouts, and biome combat
  //     mechanics go dormant from the moment the swarm arms until it ends
  if (await page.evaluate(() => !!window.__ED16_SPSW)) {
    await page.evaluate(() => window.__ED16_SPSW.force(true));
    const sw = await B("sim", 51, 240, 60);
    await page.evaluate(() => window.__ED16_SPSW.force(false));
    record("240 swarm-armed floors at depths 51-110 with biomes: valid layouts, every biome appears", sw.reqFail === 0 && sw.stairFail === 0 && sw.bad.length === 0 && IDS.every((id) => (sw.by[id] || 0) > 0), { by: sw.by, reqFail: sw.reqFail, stairFail: sw.stairFail });
    await B("gen", 61, { id: "ley", haz: "water" });
    const armed = await page.evaluate(() => window.__ED16_SPSW.arm());
    const calmOn = await B("calm");
    const healArmed = await page.evaluate(() => { const B = window.__ED16_BIO; const i0 = B.info(); return i0; });
    await B("clearSpider");
    const calmOff = await B("calm");
    record("spider swarm armed -> biome mechanics dormant; swarm over -> they resume", armed.ok && calmOn === true && calmOff === false, { armed: armed.ok, calmOn, calmOff, biome: healArmed.biome });
  }
  // 5. save/reload + old saves
  const rt = {};
  for (const id of ALL) { const d = Math.max(UNL[id], 71) + 1; await B("gen", d % 5 === 0 ? d + 1 : d, { id, haz: (BAD[id] || []).includes("ice") ? "water" : "ice" }); await B("touchAll"); rt[id] = await B("roundTrip", false); }
  const rtBad = ALL.filter((id) => !(rt[id].ok && rt[id].hasBi && rt[id].after.biome === id && rt[id].after.used === rt[id].before.used && rt[id].after.feats === rt[id].before.feats));
  record("save -> reload keeps each floor's biome and its used features (all 30)", rtBad.length === 0, rtBad.length ? Object.fromEntries(rtBad.map((id) => [id, rt[id]])) : ALL.length + " ok");
  await B("gen", 71, { id: "ley", haz: "" });
  const old = await B("roundTrip", true);
  record("a save without biome data (pre-biome format) loads fine with no biome on its floor", old.ok && !old.hasBi && old.after.biome === null && old.after.depth === old.before.depth, old.after);
  if (OLD && fs.existsSync(OLD)) {
    const code = fs.readFileSync(OLD, "utf8").replace(/\s+/g, "");
    const r = await B("loadCode", code);
    record("real pre-biome save (copy) loads; its floor has no biome", r.ok && r.biome === null && !r.snapBi, { ok: r.ok, depth: r.depth, lvl: r.lvl, biome: r.biome });
  }

  // 6. smoke: play a floor of each biome in real time, screenshot each
  fs.mkdirSync(SHOTS, { recursive: true });
  const shots = [];
  let si = 0;
  for (const id of ALL) {
    const e0 = errors.length;
    const hz0 = id === "hourglass" ? "ice" : id === "ley" || id === "bramble" ? "water" : id === "lodestone" ? "lava" : id === "umbral" ? "ice" : ["water", "lava", "ice"][si % 3];
    const hz = (BAD[id] || []).includes(hz0) ? "water" : hz0; si++;
    const sd = Math.max(UNL[id], 64) + 1;
    await B("gen", sd % 5 === 0 ? sd + 1 : sd, { id, haz: hz });
    await page.evaluate(() => { const H = window.__ED16_HZ; if (H && H.clean) { /* keep enemies; just make sure we are alive */ } });
    await B("view");
    for (const k of ["d", "s", "a", "w", "d", "d", "s"]) { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); }
    await sleep(900);
    const alive = await page.evaluate(() => window.__ED16_PRIS.state ? true : true);
    await B("view");
    await sleep(700);
    const f = SHOTS + "/" + id + ".png";
    const el = await page.$("canvas"); if (el) await el.screenshot({ path: f }); else await page.screenshot({ path: f });
    shots.push(f);
    const info = await B("info");
    record("smoke: played a " + id + " floor in real time, no page errors", errors.length === e0 && info.biome === id, { depth: info.depth, size: info.size, variants: info.variants, feats: info.feats });
  }

  // 7. frame time: the SAME titanic 72x72 floor with its biome on vs off (enemies parked so combat doesn't add noise),
  //    4x CPU throttle (phone-like), plus the biome's own draw cost per frame.
  const cdp = await page.target().createCDPSession();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const meas = () => page.evaluate(() => new Promise((res) => { const a = []; let last = performance.now(); const end = last + 2500; const f = (t) => { a.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { a.sort((x, y) => x - y); res({ avg: +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), n: a.length }); } }; requestAnimationFrame(f); }));
  const ft = {}; let perfBad = [];
  for (const id of ALL) {
    const pd = Math.max(UNL[id], 176) + 1;
    await B("gen", pd % 5 === 0 ? pd + 1 : pd, { id, haz: id === "hourglass" || id === "ley" ? "ice" : "water", tier: 7 });
    await B("view"); await B("park"); await sleep(400);
    await B("toggle", false); await sleep(200); const off = await meas();
    await B("toggle", true); await B("perf", true); await sleep(200); const on = await meas(); const dc = await B("perf", false);
    ft[id] = { size: (await B("info")).size, off: off.avg, on: on.avg, drawMsPerFrame: +dc.per.toFixed(3) };
    if (on.avg > off.avg * 1.25 + 2) perfBad.push(id);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  record("same 72x72 floor, biome on vs off (4x CPU throttle): frame time within 25%", perfBad.length === 0, ft);
  record("no page errors in the whole run", errors.length === 0, errors.slice(0, 5));
  console.log("external requests blocked: " + blocked);
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - fails) + "/" + results.length + " passed. Shots: " + shots.join(", "));
  fs.writeFileSync("/tmp/ed16-biome-results.json", JSON.stringify({ results, ft, shots }, null, 1));
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
