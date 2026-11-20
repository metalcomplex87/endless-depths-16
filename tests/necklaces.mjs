// Eternum necklaces: real-game verification (throwaway profiles only; never touches real saves).
import puppeteer from "puppeteer-core";
import fs from "fs";
import { wOf } from "./_nkmc.mjs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50263/";
const OUT = "/workspace/ed16-web/screenshots-necklaces";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 4000) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 900) : "")); }
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/nk-verify-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"], protocolTimeout: 600000 });
const page = await b.newPage(); page.setDefaultTimeout(600000);
const errs = []; page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK));
const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 150, lvl: 300 }));
await NK("gear", "full");
const C = await NK("consts");
const BASE0 = C.NK_BASE, BASEE0 = C.NK_BASE_E;
const names = C.names;
const SOURCES = ["normal", "rare", "elite", "super", "ultra", "goblin", "royal", "king", "hunter", "mini10", "mini33", "act10", "act23", "act33", "chest0", "chest1", "chest2", "chest3", "chest4"];
const out = { consts: C, sources: {}, prismatic: {}, killPath: {}, chestPath: {} };

// 0) reworked weights (2026-11-18 ~5:30 PM CT): exact values, monotonic boss ladder, act x3+3 on top at ~12%
{
  const EW = { NK_W_NORM: 1.28, NK_W_RARE: 3.78, NK_W_ELITE: 7.75, NK_W_ROYAL: 44.56, NK_W_SE: 66.84, NK_W_UE: 111.4, NK_W_GOB: 139.3, NK_W_HUNT: 195, NK_W_KING: 334.2, NK_W_MINI: 37, NK_W_MINI_PM: 1, NK_W_MINI_OV: 0.4, NK_W_ACT: 2500, NK_W_ACT_PM: 0.75, NK_W_OVSH: 0.25, NK_W_ACT_J: 1.524, NK_W_CHEST: [11.14, 16.71, 26.06, 34.2, 89.12], NK_W_VCHEST: [10.65, 19.15, 37.83, 67.32, 133.71] };
  const bad = Object.entries(EW).filter(([k, v]) => JSON.stringify(C.NK_W[k]) !== JSON.stringify(v));
  rec("reworked weights are in the build (NK_BASE 6e-6, NK_BASE_E 4.45e-7; half of spec D)", bad.length === 0 && C.NK_BASE === 6e-6 && C.NK_BASE_E === 4.45e-7, bad.length ? JSON.stringify(bad) : JSON.stringify({ NK_BASE: C.NK_BASE, NK_BASE_E: C.NK_BASE_E }));
  const actP = []; for (let pm = 1; pm <= 3; pm++) for (let ov = 0; ov <= 3; ov++) actP.push({ pm, ov, p: Math.min(0.9, C.NK_BASE * C.NK_W.NK_W_ACT * (1 + C.NK_W.NK_W_ACT_PM * (pm - 1)) * (1 + C.NK_W.NK_W_OVSH * ov) * (pm === 3 && ov === 3 ? C.NK_W.NK_W_ACT_J : 1)) });
  const mono = actP.every((a) => actP.every((b) => !(b.pm >= a.pm && b.ov >= a.ov && (b.pm > a.pm || b.ov > a.ov)) || b.p > a.p));
  const top = actP.find((a) => a.pm === 3 && a.ov === 3).p, maxOther = Math.max(...actP.filter((a) => !(a.pm === 3 && a.ov === 3)).map((a) => a.p));
  const nonBossMax = Math.max(C.NK_W.NK_W_KING, C.NK_W.NK_W_HUNT, C.NK_W.NK_W_MINI * (1 + 2 * C.NK_W.NK_W_MINI_PM) * (1 + 3 * C.NK_W.NK_W_MINI_OV), ...C.NK_W.NK_W_VCHEST, ...C.NK_W.NK_W_CHEST) * C.NK_BASE;
  rec("every non-boss source sits well below the basic act boss (1.5%)", nonBossMax < actP[0].p / 2, "best non-boss " + (nonBossMax * 100).toFixed(2) + "%");
  rec("act boss chance rises with boss power and with overshields; x3 + 3 overshields is the only one at 10% (all others < 7.5%), x1 at 1.5%", mono && top > maxOther && Math.abs(top - 0.1) < 0.001 && maxOther < 0.075 && Math.abs(actP[0].p - 0.015) < 0.0005, "x1 " + (actP[0].p * 100).toFixed(2) + "% ... x3+3 " + (top * 100).toFixed(2) + "%");
}

// 1) depth gate: boosted to the 90% cap, depth 100 -> nothing; depth 101 -> drops
await NK("setBase", 10, 10); await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]);
for (const d of [1, 50, 99, 100]) {
  await NK("setDepth", d);
  let tot = 0;
  for (const s of SOURCES) { const r = await NK("rollFrom", s, 200); tot += r.drops.reduce((a, b) => a + b, 0); }
  for (const k of ["normal", "elite", "mini33", "act33"]) { for (let i = 0; i < 20; i++) { const r = await NK("killFrom", k); tot += r.drops.reduce((a, b) => a + b, 0); } }
  for (let r0 = 0; r0 < 5; r0++) for (let i = 0; i < 20; i++) { const r = await NK("openChestFrom", r0); tot += r.drops.reduce((a, b) => a + b, 0); }
  rec("no necklace drops at depth " + d + " (boosted to the cap, 3,800 rolls + 180 real kills/chests)", tot === 0, "drops " + tot);
}
// with all seven owned and boosted, depth 100 still gives no Prismatic Eternum
await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]); await NK("setDepth", 100);
{ let tot = 0; for (const s of SOURCES) { const r = await NK("rollFrom", s, 200); tot += r.drops.reduce((a, b) => a + b, 0); } rec("no Prismatic Eternum at depth 100 even with all seven owned", tot === 0, "drops " + tot); }
await NK("clearGround"); await NK("clearBanner");

// 2) each of the 7 from every source at depth 101+ (real nkRoll path, boosted so every roll is at the 90% cap)
await NK("setDepth", 101); await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]);
let allOk = true;
for (const s of SOURCES) {
  await NK("clearGround"); await NK("clearBanner");
  const r = await NK("rollFrom", s, 700);
  const per = r.drops.slice(0, 7);
  const ok = per.every((v) => v > 0) && r.drops[7] === 0;
  allOk = allOk && ok;
  out.sources[s] = { src: r.src, w: r.w, drops: r.drops };
  rec("depth 101 " + s + " (" + r.src + ", weight " + r.w + "): all seven drop, no Prismatic", ok, per.join("/") + " PE " + r.drops[7]);
}
// necklace (any of the 7) vs Prismatic item chance per kill/chest from the same source, depth 101-110 (loot formulas, tests/nk-pris-ref.json)
{ const REF = JSON.parse(fs.readFileSync(new URL("./nk-pris-ref.json", import.meta.url), "utf8")); const rows = [];
  for (const [s, r] of Object.entries(REF)) { const p = Math.min(0.9, C.NK_BASE * wOf(s)); const lim = s === "act boss x3 +3 overshield" ? 1 : 0.5; rows.push({ s, x: p / r.p1, lim }); }
  const bad = rows.filter((r) => !(r.x <= r.lim && r.x < 1));
  rec("every source: necklace chance <= 0.5x its Prismatic item chance (act x3+3: below 1x); " + rows.length + " sources", bad.length === 0 && rows.length >= 36, (bad.length ? "BAD " + bad.map((r) => r.s + " " + r.x.toFixed(2)).join("; ") + " | " : "") + rows.sort((a, b) => b.x - a.x).slice(0, 6).map((r) => r.s + " " + r.x.toFixed(2) + "x").join(", ")); }
{ const mism = Object.values(out.sources).filter((x) => Math.abs(x.w - wOf(x.src)) > 1e-9).map((x) => x.src + " game " + x.w + " sim " + wOf(x.src));
  rec("in-game weight of every source matches the simulation table", mism.length === 0, mism.join("; ") || Object.values(out.sources).map((x) => x.src + "=" + +x.w.toFixed(2)).join(", ")); }
await NK("clearGround"); await NK("clearBanner");
// real kill() / openChest() path
await NK("setDepth", 120);
for (const k of ["normal", "elite", "goblin", "hunter", "mini10", "mini33", "act10", "act33"]) {
  const tot = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < (k.startsWith("act") ? 60 : 120); i++) { const r = await NK("killFrom", k); r.drops.forEach((v, j) => tot[j] += v); }
  out.killPath[k] = tot;
  rec("real kill() of " + k + " (x" + (k.startsWith("act") ? 60 : 120) + ") at depth 120 drops necklaces (boosted)", tot.slice(0, 7).every((v) => v > 0) && tot[7] === 0, tot.join("/"));
  await NK("clearGround"); await NK("clearBanner");
}
for (let r0 = 0; r0 < 5; r0++) {
  const tot = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 120; i++) { const r = await NK("openChestFrom", r0); r.drops.forEach((v, j) => tot[j] += v); }
  out.chestPath["r" + r0] = tot;
  rec("real openChest() rarity " + r0 + " at depth 120 drops necklaces (boosted)", tot.slice(0, 7).every((v) => v > 0) && tot[7] === 0, tot.join("/"));
  await NK("clearGround"); await NK("clearBanner");
}

// 3) Prismatic gate: 0..6 owned -> never; all seven -> drops from every source; owned -> never again
for (const own of [[0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 0, 0], [0, 1, 1, 1, 1, 1, 1, 0], [1, 0, 1, 1, 1, 1, 1, 0]]) {
  await NK("setOwn", own); await NK("setDepth", 900);
  let pe = 0; for (const s of SOURCES) { const r = await NK("rollFrom", s, 300); pe += r.drops[7]; }
  rec("Prismatic never drops while owning " + own.slice(0, 7).reduce((a, b) => a + b, 0) + "/7 (boosted, depth 900)", pe === 0, "PE drops " + pe);
}
for (const s of SOURCES) {
  await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]);
  const r = await NK("rollFrom", s, 40);
  out.prismatic[s] = r.drops[7];
  rec("all seven owned: Prismatic Eternum drops from " + s + " (" + r.src + ")", r.drops[7] === 1, "PE drops " + r.drops[7] + " (max one on the ground at a time)");
}
await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 1]);
{ let pe = 0; for (const s of SOURCES) { const r = await NK("rollFrom", s, 200); pe += r.drops[7]; } rec("Prismatic never drops again once owned", pe === 0, "PE drops " + pe); }
await NK("clearGround"); await NK("clearBanner");

// 4) live game loop: beam, alert, chime, pet does not loot, never auto-equips, pickup on step
await NK("setBase", BASE0, BASEE0);
await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]);
await NK("setDepth", 150);
await NK("sfxSpy");
const samplePx = (hex, rainbow) => page.evaluate(async (hex, rainbow) => {
    const cv = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!cv) return { ok: false };
    const ctx = cv.getContext("2d"); const h = Math.floor(cv.height * 0.22), y0 = Math.floor(cv.height * 0.08);
    const d = ctx.getImageData(0, y0, cv.width, h).data;
    const tr = parseInt(hex.slice(1, 3), 16), tg = parseInt(hex.slice(3, 5), 16), tb = parseInt(hex.slice(5, 7), 16);
    let hit = 0, bright = 0;
    for (let k = 0; k < d.length; k += 4) {
      const r = d[k], g = d[k + 1], bb = d[k + 2];
      const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb);
      if (mx > 140) bright++;
      if (rainbow ? (mx - mn > 90 && mx > 150) : (Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(bb - tb) < 150 && mx > 120)) hit++;
    }
    return { ok: true, hit, bright, total: d.length / 4 };
  }, hex, rainbow);

const shots = [];
await NK("clearGround"); await NK("clearBanner"); await sleep(500);
const baseline = []; for (let i = 0; i < 8; i++) baseline.push((await samplePx(C.colors[i], i === 7)).hit);
await page.screenshot({ path: OUT + "/beam-none.png" });
for (let i = 0; i < 8; i++) {
  await NK("clearGround"); await NK("clearBanner");
  if (i === 7) await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]);
  await NK("drop", i, 0, -2);
  const ban = await NK("banner");
  const sfx = await NK("sfxLog");
  await sleep(700);
  const f = OUT + "/beam-" + i + ".png"; await page.screenshot({ path: f }); shots.push(f);
  const px = await samplePx(C.colors[i], i === 7);
  const basePx = baseline[i];
  const chimes = sfx.filter((x) => x.startsWith("nkChime")).length;
  rec("drop " + names[i] + ": colour-coded alert + chime (beam itself: necklaces3.mjs + _nkbeam.py screenshot diff; pixel count shown for info)", !!ban && (i === 7 ? /PRISMATIC ETERNUM!/ : /ETERNUM NECKLACE DROPPED/).test(ban.txt) && ban.c === C.colors[i] && ban.nk === i && chimes >= 1,
    "banner " + JSON.stringify(ban) + " chimes " + chimes + " beamPixels " + px.hit + " vs " + basePx + " without the necklace (of " + px.total + ")");
  await NK("sfxSpy");
}
await NK("clearGround"); await NK("clearBanner"); await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]);
// pet: give the hero a pet, drop a necklace on the floor and let the real loop run for 6 s; it must still be there
await page.evaluate(() => window.__ED16_PRIS.give("pet"));
await NK("clearDrops");
await NK("drop", 3, 2, 0);
const pos0 = await NK("nkPos");
const tgt0 = await NK("petTarget");
await NK("addItemDrop", 0, 2);
const tgt1 = await NK("petTarget");
await sleep(6000);
const pos1 = await NK("nkPos"); const st1 = await NK("st");
rec("pet never targets or loots a necklace (only the control item); necklace still on the ground after 6 s of the live loop", tgt0 === null && tgt1 && tgt1.kind === "drop" && pos1.length === 1 && JSON.stringify(pos0) === JSON.stringify(pos1) && st1.own.every((v) => v === 0), JSON.stringify({ tgt0, tgt1, pos0, pos1, own: st1.own }));
await NK("clearDrops");
// hero steps on it -> picked up, not equipped, chime + alert
await NK("sfxSpy");
const pk = pos1[0];
await NK("moveHero", pk.x, pk.y);
await NK("tick", 0.05);
const st2 = await NK("st"), ban2 = await NK("banner"), sfx2 = await NK("sfxLog");
rec("stepping on it picks it up (pickup alert + chime), never auto-equipped", st2.own[3] === 1 && st2.gd.length === 0 && st2.eq.length === 0 && /ETERNUM NECKLACE!/.test(ban2.txt) && sfx2.some((x) => x.startsWith("nkChime")), JSON.stringify({ own: st2.own, eq: st2.eq, ban2, sfx2 }));
// owned necklaces must not drop again (no duplicate, no gold melt)
await NK("resetLog"); await NK("clearGround"); await NK("clearBanner");
const rDup = await NK("rollFrom", "act33", 80);
const st3 = await NK("st"), ban3 = await NK("banner");
rec("owned necklace never drops again (no duplicate, no gold melt)", rDup.drops[3] === 0 && st3.own[3] === 1 && !(ban3 && /DUPLICATE/.test(String(ban3.txt || ""))), JSON.stringify({ drops: rDup.drops, own: st3.own, ban3 }));
// equip rules
await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]);
let m = [await NK("equip", 0), await NK("equip", 4)]; let s4 = await NK("st");
rec("without Prismatic Eternum only one necklace is worn (wearing a second swaps)", s4.eq.length === 1 && s4.eq[0] === 4, JSON.stringify({ m, eq: s4.eq }));
await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 1]);
m = [await NK("equip", 7), await NK("equip", 0)]; s4 = await NK("st"); // Neon Skyfall (4) is still worn from the step above
rec("with Prismatic Eternum two are worn at once", s4.eq.length === 2 && s4.pe && s4.eq.includes(0) && s4.eq.includes(4), JSON.stringify({ m, eq: s4.eq, pe: s4.pe }));
m = [await NK("equip", 7)]; s4 = await NK("st");
rec("taking Prismatic off drops back to one", s4.eq.length === 1 && !s4.pe, JSON.stringify({ m, eq: s4.eq }));
// bag section screenshot
await NK("equip", 7); await NK("equip", 0);
await page.evaluate(() => window.__ED16_PRIS.openInv && window.__ED16_PRIS.openInv(true)); await sleep(800);
await page.screenshot({ path: OUT + "/bag-section.png" });
const hasSec = await page.evaluate(() => !!document.querySelector("[data-nk-section]"));
rec("necklace bag section is shown once a necklace is owned", hasSec, "");
rec("no page errors", errs.length === 0, errs.join(" | "));
fs.writeFileSync(OUT + "/verify.json", JSON.stringify({ results, out }, null, 1));
await b.close();
const f = results.filter((r) => !r.pass).length;
console.log("SUMMARY " + (results.length - f) + "/" + results.length);
process.exit(f ? 1 : 0);
