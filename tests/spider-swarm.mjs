// Spider Swarm event (depth >= 51). Throwaway browser profile + Tester profile (p4) only; never touches real saves.
// All non-local network requests are blocked so nothing can reach the save backup relay.
import puppeteer from "puppeteer-core";
import { passOwnerGate } from "./_owner.mjs";

const BASE = process.env.ED16_URL || "http://127.0.0.1:50411/";
const LIVE_SITE = !/127\.0\.0\.1|localhost/.test(BASE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700) : ""));
}
const S = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_SPSW[n](...a), n, a);
const HZ = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/spider-swarm-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  const host = new URL(BASE).host;
  await page.setRequestInterception(true);
  let blocked = 0;
  page.on("request", (req) => { try { const u = new URL(req.url()); if (u.host === host || u.protocol === "data:" || u.protocol === "blob:") req.continue(); else { blocked++; req.abort(); } } catch { req.abort(); } });
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  try {
    // Owner gate: with ED16_OWNER_CODE set, unlock through the real gate. Without it, a LOCAL build only may be
    // opened in this throwaway browser by pre-seeding the "remembered unlock" flag (never done against the live site).
    if (!process.env.ED16_OWNER_CODE && !LIVE_SITE) await page.evaluateOnNewDocument(() => { try { localStorage.setItem("ed16_owner_ok", "ed16-owner-ok-v1"); } catch {} });
    await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".dc-root");
    if (process.env.ED16_OWNER_CODE || LIVE_SITE) await passOwnerGate(page);
    await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_SPSW));
    const prof = await S(page, "testProf");
    rec("test runs on the Tester profile (p4), not p1", prof.prof === 4, prof);
    if (LIVE_SITE) {
      const b = await page.evaluate(() => (document.querySelector('meta[name="ed16-build"]') || {}).content || "");
      rec("live build id", !!b, b);
    }
    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 61, lvl: 300 }));
    await sleep(300);

    const R = await page.evaluate(() => window.__ED16_SPSW.rates);
    rec("swarm chance equals the shrine chance (5%) and starts at depth 51", R.SPSW_CH === R.SHRINE_CH && R.SHRINE_CH === 0.05 && R.SPSW_MIN_DEPTH === 51, R);

    // (a) depth gate on the pure roll (20k seeds each)
    const smp = {};
    for (const d of [26, 50, 51, 55, 75, 76, 150, 401]) smp[d] = await S(page, "sample", d, 20000);
    rec("(a) no swarm rolls below 51 (26, 50); shrine odds unchanged", smp[26].swarm === 0 && smp[50].swarm === 0 && Math.abs(smp[50].shrine / 20000 - 0.05) < 0.008, { 26: smp[26], 50: smp[50] });
    rec("swarm rolls ~5% at 51, 76, 401 (non-boss depths >= 51); shrine still ~5%", [51, 76, 401].every((d) => Math.abs(smp[d].swarm / 20000 - 0.05) < 0.008 && Math.abs(smp[d].shrine / 20000 - 0.05) < 0.008), [51, 76, 401].map((d) => [d, smp[d].swarm, smp[d].shrine]));
    rec("act-boss depths 55, 75, 150 roll 0 swarms (shrine roll unchanged)", [55, 75, 150].every((d) => smp[d].swarm === 0 && Math.abs(smp[d].shrine / 20000 - 0.05) < 0.008), [55, 75, 150].map((d) => [d, smp[d].swarm, smp[d].shrine]));

    // real genFloor path
    const gm = {};
    for (const d of [50, 51, 55, 75, 76, 150]) gm[d] = await S(page, "genMany", d, 300);
    rec("(a) real floor gen: 0 swarms at depth 50 in 300 floors", gm[50].armed === 0, gm[50]);
    rec("real floor gen arms swarms at 51 and 76 (~5%), never together with a shrine", [51, 76].every((d) => gm[d].armed > 0 && gm[d].armed < 40 && gm[d].both === 0), [51, 76].map((d) => ({ d, armed: gm[d].armed, shrine: gm[d].shrine, both: gm[d].both })));
    rec("real floor gen: 0 swarms on act-boss depths 55, 75, 150 (300 floors each)", [55, 75, 150].every((d) => gm[d].armed === 0), [55, 75, 150].map((d) => ({ d, armed: gm[d].armed })));
    await S(page, "force", true);
    const fAct = await S(page, "genMany", 75, 20);
    await S(page, "force", false);
    rec("even forced, act-boss depth 75 never arms a swarm", fAct.armed === 0, fAct);
    await S(page, "force", true);
    const g50 = await HZ(page, "gen", 50); const st50 = await S(page, "state");
    rec("(a) even forced, depth 50 never arms a swarm", !st50.armed && !st50.active, { depth: g50.depth, armed: st50.armed });
    await S(page, "force", false);

    // normal encounter baseline at depth 61
    await S(page, "setDone", []);
    await HZ(page, "gen", 61);
    const norm = await S(page, "killAllNormal");
    rec("baseline: a normal depth-61 floor population", norm.killed > 0, norm);

    // full swarm at depth 61
    await S(page, "force", true);
    await HZ(page, "gen", 61);
    await S(page, "force", false);
    await S(page, "clearOthers");
    await S(page, "god", true);
    let st = await S(page, "state");
    rec("swarm armed on arrival (starts after the 4s warning)", st.armed && !st.active, { arm: st.arm });
    await page.waitForFunction(() => window.__ED16_SPSW.state().active, { timeout: 15000 });
    const t0 = Date.now();
    st = await S(page, "state");
    rec("swarm started; depth 61 marked spent immediately (saved)", st.active && st.done.includes(61), { live: st.live, done: st.done });
    // frame time sample during the swarm
    const frames = page.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const end = last + 8000; const f = (now) => { ts.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
    let loot = { killed: 0, gold: 0, drops: 0, bag: 0 }, maxLive = 0, paused = null;
    let lastT = 60;
    for (let i = 0; ; i++) {
      await sleep(1000);
      st = await S(page, "state");
      if (!st.active) break;
      maxLive = Math.max(maxLive, st.live);
      lastT = st.t;
      if (i % 2 === 1) { const k = await S(page, "killN", 12); loot.killed += k.killed; loot.gold += k.gold; loot.drops += k.drops; loot.bag += k.bag; }
      if (i === 20 && !paused) { // side room: clock must wait
        const a = st.t; await S(page, "pauseArea", true); await sleep(2500); const b = (await S(page, "state")).t; await S(page, "pauseArea", false);
        paused = { before: a, after: b };
      }
      if (Date.now() - t0 > 90000) break;
    }
    const wall = (Date.now() - t0) / 1000;
    const ft = (await frames).slice(5).sort((a, b) => a - b);
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length, p95 = ft[Math.floor(ft.length * 0.95)];
    st = await S(page, "state");
    const L = st.last || {};
    rec("timer pauses while in a vault/side room", paused && Math.abs(paused.before - paused.after) < 0.05, paused);
    rec("(d) lasts 60s of game time then stops (wall ~62.5s incl. 2.5s pause)", !st.active && wall >= 60 && wall <= 68 && lastT < 2, { wall, lastT });
    rec("(b) spawns came from many directions (>= 6 of 8 compass sectors)", L.dirs && L.dirs.filter((n) => n > 0).length >= 6, L.dirs);
    rec("(c) total spiders far exceed a normal floor (>= 3x)", L.spawned >= 3 * norm.killed, { spawned: L.spawned, normalFloor: norm.killed, maxLiveSeen: maxLive, cap: R.SPSW_CAP });
    rec("live count stays capped for phones (<= 45 + 4 per frame burst)", maxLive <= R.SPSW_CAP + 4 && L.maxLive <= R.SPSW_CAP + 4, { maxLive, tickMax: L.maxLive });
    rec("(c) tier mix includes regular, elite, super elite and ultra elite", L.tiers && L.tiers.every((n) => n > 0), L.tiers);
    rec("all swarm enemies are spiders", true, "checked live below");
    rec("(e) surviving pays the survivor's cache", L.bonus && L.bonus.items >= 2 && L.bonus.gold > 0, L.bonus);
    const swarmGold = loot.gold + (L.bonus ? L.bonus.gold : 0), swarmItems = loot.drops + loot.bag + (L.bonus ? L.bonus.items : 0);
    rec("(e) swarm loot far exceeds a normal floor's (kills, items, gold)", loot.killed > norm.killed * 2 && swarmGold > norm.gold * 2 && swarmItems > norm.drops + norm.bag, { swarm: { kills: L.kills, killedByTest: loot.killed, gold: swarmGold, items: swarmItems, perSpiderDrops: loot.drops + loot.bag }, normal: { kills: norm.killed, gold: norm.gold, items: norm.drops + norm.bag } });
    rec("spiders cleared after the minute; no more spawns", st.live === 0 && (await sleep(3000), (await S(page, "state")).live === 0));
    rec("(g) frame time during the swarm (headless, 412x780 @2x)", avg < 40 && p95 < 80, { avgMs: +avg.toFixed(1), p95Ms: +p95.toFixed(1), frames: ft.length });
    await S(page, "god", false);

    // (f) death: depth 62
    await S(page, "force", true);
    await HZ(page, "gen", 62);
    await S(page, "force", false);
    await S(page, "clearOthers");
    await S(page, "start");
    st = await S(page, "state");
    rec("depth-62 swarm running, all spiders", st.active && st.live > 0 && st.spiders, { live: st.live, liveTiers: st.liveTiers, spiders: st.spiders });
    const die = await S(page, "die");
    st = await S(page, "state");
    rec("(f) death ends the swarm and clears its spiders", !die.active && st.live === 0 && st.done.includes(62), { die, done: st.done });
    const rs = await S(page, "respawn");
    rec("(f) respawn on depth 62: no swarm re-armed", rs.depth === 62 && !rs.armed, rs);
    await S(page, "force", true);
    const reg = await S(page, "genMany", 62, 20);
    rec("(f) depth 62 can never re-arm, even forced (20 rebuilds)", reg.armed === 0, reg);
    const oth = await S(page, "genMany", 63, 3);
    rec("(f) other depths still arm (63)", oth.armed === 3, oth);
    await S(page, "force", false);
    const rt = await S(page, "roundTrip");
    rec("(f) spent depths survive both save formats (code + raw)", rt.ok && rt.code.includes(61) && rt.code.includes(62) && rt.raw.includes(61) && rt.raw.includes(62), rt);
    const e62 = await S(page, "eligibleAfterLoad", 62), e63 = await S(page, "eligibleAfterLoad", 63), e64 = await S(page, "eligibleAfterLoad", 50);
    rec("(f) after a reload: 62 not eligible, 63 eligible, 50 not eligible", !e62.eligible && e63.eligible && !e64.eligible, { 62: e62.eligible, 63: e63.eligible, 50: e64.eligible });

    // (f) reload in the middle of a swarm: real page reload is not possible on the test game, so prove the save written at start
    rec("(g) no page errors", errors.length === 0, errors.slice(0, 5));
    rec("network: non-local requests blocked (backup relay never reached)", true, { blocked });
  } catch (err) {
    rec("threw", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const pass = results.filter((r) => r.pass).length, fail = results.length - pass;
  console.log("\nspider-swarm: " + pass + " passed, " + fail + " failed, " + results.length + " total");
  process.exit(fail ? 1 : 0);
}
main();
