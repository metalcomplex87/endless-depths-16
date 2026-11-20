// Camp pet excavation: hiring / slots / auto-swap, offline timer (cap, rollback, multi-day), clear-rate tracking,
// natural expected-haul simulation, the 20%-per-pet / 100%-crew cap (per tier, Prismatic included), the full loot pool,
// save round-trip, layout bumps and screenshots. Uses a COPY of the Richard save; never touches real saves.
import puppeteer from "puppeteer-core";
import fs from "fs";
import crypto from "crypto";

const BASE = process.env.ED16_URL || "http://127.0.0.1:50341/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SRC = process.env.RICHARD_FILE || "/tmp/ed16-richard-copy.txt";
const SHOTS = process.env.MINE_SHOTS || "/tmp/ed16-mine-shots";
const CODE = fs.readFileSync(SRC, "utf8").replace(/\s+/g, "");
const results = [];
const rec = (step, pass, detail = "") => { results.push({ step, pass: !!pass }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700) : "")); return !!pass; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sum = (a) => a.reduce((x, y) => x + y, 0);

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", userDataDir: "/tmp/ed16-profiles/mine-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio", "--window-size=430,900"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root");
  await page.waitForFunction(() => !!window.__ED16_MINE);
  const M = (fn, ...args) => page.evaluate((fn, args) => window.__ED16_MINE[fn](...args), fn, args);

  // ---- setup: an old save (no excavation field) loads fine ----
  let st = await M("setup", CODE, { gold: 0 });
  rec("Richard save copy loads at camp with no excavation state (old saves fine)", st.ok && st.area === "camp" && st.mine === null, { depth: st.depth, area: st.area });
  const c = await M("consts");
  rec("constants exposed", c.MINE_PER_PET_SHARE === 0.2 && c.MINE_CREW_CAP === 1 && c.MINE_CAP_HOURS === 72, c);

  // ---- layout: cave / rack / chest are solid and open the panel when bumped ----
  for (const w of ["cave", "rack", "chest"]) { const b = await M("bump", w); rec("bump " + w + " opens the excavation panel and blocks the tile", b.open && b.blocked, b); }
  await M("close");

  // ---- hiring fees (depth x crew size x rarity), free first slot, paid escalating slots ----
  const gray0 = await M("addPets", 1, 0);
  let msg = await M("assign", gray0[0]);
  st = await M("state");
  rec("hiring at depth 200 with no gold is refused (first Normal hire costs gold this deep)", st.mine.crew === 0 && /Not enough gold/.test(msg), msg);
  st = await M("setup", CODE, { gold: 0, depth: 15 });
  const gray = await M("addPets", 3, 0);
  msg = await M("assign", gray[0]);
  st = await M("state");
  rec("first hire is free at low depth (depth 15, slot 1)", st.mine.crew === 1 && st.mine.slots === 1 && st.gold === 0, msg);
  const HP = (d, n, r, s = 0) => M("hirePrice", d, n, r, s);
  const rich = await M("setup", CODE, { gold: 0 });
  const cs = await M("consts");
  rec("anchor depth is Richard's actual save depth", rich.depth === cs.MINE_ANCHOR_DEPTH, { saveDepth: rich.depth, anchor: cs.MINE_ANCHOR_DEPTH });
  const anchor = await HP(rich.depth, 19, 7);
  const anchorSlot = await M("price", 20, rich.depth);
  rec("anchor: slot 20 + a Prismatic hire into it at Richard's depth costs exactly 100,000,000", anchor + anchorSlot === 1e8, { fee: anchor, slot20: anchorSlot, total: anchor + anchorSlot });
  const pt = await M("priceTable");
  const hrs = pt.income.map((x) => x.anchor / x.incomeHr);
  const anc = pt.income.map((x) => x.anchor);
  rec("the 20th Prismatic costs more the deeper you are and is always the same big block of income (> 48 h)", anc.every((v, i) => i === 0 || v > anc[i - 1]) && hrs.every((h) => h > 48 && Math.abs(h - hrs[0]) / hrs[0] < 0.02), { anc, hrs });
  rec("past slot 20 prices keep escalating (no cap)", (await HP(200, 29, 7)) > anchor * 10 && (await M("price", 30, 200)) > anchorSlot * 10);
  const esc = { depth: [await HP(50, 4, 3), await HP(100, 4, 3), await HP(200, 4, 3), await HP(300, 4, 3)], crew: [await HP(200, 0, 3), await HP(200, 1, 3), await HP(200, 5, 3), await HP(200, 19, 3)], rar: [] };
  for (let r = 0; r < 8; r++) esc.rar.push(await HP(200, 4, r));
  const up = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
  rec("hire fee rises with depth, with crew size (steep: x1.3 per pet) and with rarity", up(esc.depth) && up(esc.crew) && up(esc.rar) && esc.crew[3] / esc.crew[0] > 100, esc);
  const first50 = await HP(50, 0, 0), first200 = await HP(200, 0, 0);
  rec("first hire stays cheap past the free depths (< 5% of an hour of gold at that depth)", first50 > 0 && first50 < 0.05 * 300000 && first200 < 0.05 * 1.3e6, { first50, first200 });
  await M("setup", CODE, { gold: 0, depth: 15 });
  const grayB = await M("addPets", 2, 0);
  await M("assign", grayB[0]);
  msg = await M("assign", grayB[1]);
  st = await M("state");
  rec("equal-quality pet is refused when the crew is full", st.mine.crew === 1 && /Crew full/.test(msg), msg);
  msg = await M("buySlot");
  rec("buying a slot without gold is refused", /Not enough gold/.test(msg), msg);
  const p2 = await M("price", 2), p3 = await M("price", 3), p10 = await M("price", 10), p60 = await M("price", 60);
  rec("slot prices escalate (2 < 3 < 10 < 60)", p2 > 0 && p3 > p2 && p10 > p3 && p60 > p10, { p2, p3, p10, p60 });

  // ---- no cap: 60 working pets ----
  st = await M("setup", CODE, { gold: 1e15 });
  const many = await M("addPets", 60, 2);
  for (let i = 0; i < 59; i++) await M("buySlot");
  for (const id of many) await M("assign", id);
  st = await M("state");
  rec("no slot limit: 60 slots bought and 60 pets digging", st.mine.slots === 60 && st.mine.crew === 60, { slots: st.mine.slots, crew: st.mine.crew, goldLeft: st.gold });
  rec("crew share is 20% per pet, capped at 100% (1 -> 0.2, 3 -> 0.6, 5 -> 1, 60 -> 1)", (await M("crewFrac", 1)) === 0.2 && Math.abs((await M("crewFrac", 3)) - 0.6) < 1e-9 && (await M("crewFrac", 5)) === 1 && (await M("crewFrac", 60)) === 1);

  // ---- auto-swap: a better pet replaces the weakest worker, which goes back to the bag ----
  st = await M("setup", CODE, { gold: 1e15 });
  const g3 = await M("addPets", 2, 0);
  const b3 = await M("addPets", 1, 3);
  await M("buySlot"); await M("buySlot");
  for (const id of [...g3, ...b3]) await M("assign", id);
  const pris = await M("addPets", 1, 7);
  const before = await M("state");
  const swapFee = await M("assignPrice", pris[0]);
  const fullFee = await HP(200, 2, 7), grayFee = await HP(200, 2, 0);
  msg = await M("assign", pris[0]);
  const after = await M("state");
  rec("swap pays only the difference of the two hire fees", swapFee > 0 && Math.abs(swapFee - (fullFee - grayFee)) <= 0.05 * fullFee && swapFee < fullFee && Math.abs(before.gold - after.gold - swapFee) < 1, { swapFee, fullFee, grayFee, paid: before.gold - after.gold });
  const removed = before.mine.crewIds.filter((id) => !after.mine.crewIds.includes(id));
  rec("Prismatic pet auto-replaces the lowest-quality worker (a Normal pet)", after.mine.crew === 3 && after.mine.crewRar.includes(7) && removed.length === 1 && g3.includes(removed[0]), { msg, before: before.mine.crewRar, after: after.mine.crewRar });
  rec("the replaced worker is back in the bag (Prismatic out, Normal back)", after.bagPets === before.bagPets, { bagPetsBefore: before.bagPets, bagPetsAfter: after.bagPets });
  const lowNew = await M("addPets", 1, 0);
  msg = await M("assign", lowNew[0]);
  rec("a pet no better than the weakest worker is refused (no swap)", /Crew full/.test(msg), msg);
  const rcl = await M("dismiss", after.mine.crewIds[0]);
  rec("recall returns a worker to the bag", (await M("state")).mine.crew === 2, rcl);

  // ---- Prismatic pet at the dig still counts as owned (no x1.5 loot boost exploit) ----
  st = await M("setup", null, { gold: 1e9 });
  const pp = await M("addPets", 1, 7);
  await M("assign", pp[0]);
  st = await M("state");
  rec("a Prismatic pet working at the excavation still counts as owned Prismatic", st.owned === true && st.bagPets === 0);

  // ---- timer: min gap, rollback guard, cap, multi-day ----
  st = await M("setup", CODE, { gold: 1e15 });
  const tp = await M("addPets", 5, 4);
  for (let i = 0; i < 4; i++) await M("buySlot");
  for (const id of tp) await M("assign", id);
  const T0 = Date.now();
  st = await M("tick", T0, T0 + 30 * 1000);
  rec("a 30 s gap counts as still playing (no credit)", st.mine.h === 0 && st.mine.box === 0 && st.mine.gd === 0, st.mine);
  st = await M("tick", T0, T0 + 2 * 3600 * 1000);
  rec("a 2 h absence is credited as 2 h", Math.abs(st.mine.a - 2) < 1e-6 && st.mine.gd > 0, { a: st.mine.a, gd: st.mine.gd, box: st.mine.box });
  const h2 = st.mine.h;
  st = await M("tick", T0, T0 - 3600 * 1000);
  rec("clock moved back 1 h: rollback guard, no credit", st.mine.rb === 1 && st.mine.h === h2, { rb: st.mine.rb, h: st.mine.h });
  await M("clearBox");
  st = await M("tick", T0, T0 + 5 * 24 * 3600 * 1000);
  rec("multi-day absence (5 days) is capped at 72 h", Math.abs(st.mine.a - 72) < 1e-6, { a: st.mine.a });
  rec("multi-day absence fills the chest (gear, gems, gold)", st.mine.box > 0 && sum(st.mine.gemRar) > 0 && st.mine.gd > 0, { box: st.mine.box, gems: st.mine.gemRar, gear: st.mine.gearRar, gd: st.mine.gd, salvaged: st.mine.ov });

  // ---- clear-rate tracking through real kill() / openChest() / depth steps ----
  await M("resetRate");
  const s1 = await M("trackSession", { secs: 1800, normal: 300, elite: 30, chests: 20, floors: 3, lairs: 2 });
  const raw = s1.raw.c;
  rec("tracker counts real kills, elites, chests, floors, lairs during play", raw[1] > 250 && raw[1] <= 300 && raw[3] > 27 && raw[10] > 18 && raw[0] > 2.5 && raw[6] + raw[7] > 1.5, { normal: raw[1], elite: raw[3], chests: raw[10], floors: raw[0], lairs: raw[6] + raw[7], secs: s1.raw.s });
  rec("tracker records gold and items found during play", raw[12] > 0 && raw[13] > 0, { gold: raw[12], items: raw[13], gems: raw[14] });
  const slowKph = s1.perHour[1];
  await M("resetRate");
  const s2 = await M("trackSession", { secs: 900, normal: 300, elite: 30, chests: 20, floors: 3 });
  rec("clearing the same content twice as fast gives a higher measured rate", s2.perHour[1] > slowKph * 1.3, { slow: slowKph, fast: s2.perHour[1] });
  const n1 = await M("natural", 1), n10 = await M("natural", 10);
  rec("natural haul scales with time (10 h = 10 x 1 h)", Math.abs(sum(n10.gear) / sum(n1.gear) - 10) < 1e-6 && Math.abs(n10.gold / n1.gold - 10) < 1e-6, { g1: sum(n1.gear), g10: sum(n10.gear) });
  rec("natural haul carries the real odds of boss copies (double / triple lairs) over the absence", n10.enc.lairs > 0 && n10.enc.tripleLairs > 0 && n10.enc.doubleLairs > n10.enc.tripleLairs, n10.enc);

  // ---- the cap: 100 Prismatic pets never beat natural rates, per tier (Prismatic included) ----
  st = await M("setup", CODE, { gold: 1e20 });
  const hundred = await M("addPets", 100, 7);
  for (let i = 0; i < 99; i++) await M("buySlot");
  for (const id of hundred) await M("assign", id);
  st = await M("state");
  rec("100 Prismatic pets digging", st.mine.crew === 100 && st.mine.crewRar.every((r) => r === 7));
  await M("clearBox");
  const cr = await M("credit", 72);
  const nat = cr.natural;
  const perTierOk = cr.gearExp.every((v, i) => v <= nat.gear[i] + 1e-9) && cr.gemExp.every((v, i) => v <= nat.gems[i] + 1e-9);
  rec("crew haul <= natural haul in EVERY tier (gear and gems), with 100 Prismatic pets", perTierOk && cr.frac === 1, { exp: cr.gearExp.map((v) => +v.toFixed(3)), nat: nat.gear.map((v) => +v.toFixed(3)) });
  st = await M("state");
  const boxOk = st.mine.gearRar.every((n, i) => n <= Math.floor(nat.gear[i] + 1)) && st.mine.gemRar.every((n, i) => n <= Math.floor(nat.gems[i] + 1));
  rec("whole finds per tier never exceed the natural expectation (Prismatic count included)", boxOk && st.mine.gearRar[7] <= Math.floor(nat.gear[7] + 1), { boxGear: st.mine.gearRar, natPris: nat.gear[7], boxGems: st.mine.gemRar });
  rec("crew gold <= natural gold (+ salvage of chest overflow)", cr.gold <= nat.gold + 1 + (cr.salv > 0 ? 1e15 : 0) && cr.gold > 0, { gold: cr.gold, nat: nat.gold, salv: cr.salv });
  const natV = [60, 25, 10, 4, 1.2, 0.5, 0.15, 0.02];
  const A100 = await M("allocate", new Array(100).fill(7), natV);
  rec("allocator: 100 Prismatic pets take exactly the natural vector, never more in any tier", A100.got.every((v, i) => v <= natV[i] + 1e-9) && Math.abs(sum(A100.got) - sum(natV)) < 1e-6, A100.got.map((v) => +v.toFixed(4)));
  const Agray = await M("allocate", [0, 0, 0, 0, 0], natV);
  rec("allocator: a gray crew yields mostly Normal", Agray.got[0] / sum(Agray.got) > 0.85 && Agray.got[7] < 1e-4, Agray.got.map((v) => +v.toFixed(4)));
  const A1p = await M("allocate", [7], natV), A1g = await M("allocate", [0], natV);
  const hi = (a) => a[3] + a[4] + a[5] + a[6] + a[7];
  rec("allocator: one Prismatic pet finds more high-tier loot than one gray pet (both capped at 20%)", hi(A1p.got) > hi(A1g.got) * 3 && A1p.got.every((v, i) => v <= natV[i] * 0.2 + 1e-9), { pris: A1p.got.map((v) => +v.toFixed(3)), gray: A1g.got.map((v) => +v.toFixed(3)) });
  const odds0 = await M("odds", 0), odds7 = await M("odds", 7);
  rec("pet tier preference: Normal pet centers on Normal, Prismatic pet on Prismatic, all tiers non-zero", odds0[0] > 0.9 && odds7[7] > 0.5 && odds0.every((v) => v > 0), { odds0, odds7 });

  // ---- full loot pool: every gear tier (incl. 5-star Prismatic), every gem tier, gold ----
  st = await M("setup", CODE, { gold: 1e20 });
  const pool = await M("addPets", 5, 7);
  for (let i = 0; i < 4; i++) await M("buySlot");
  for (const id of pool) await M("assign", id);
  await M("clearBox");
  await M("setPrisBoost", 10); // test-only x10 on the natural Prismatic budget so a single 1 h run shows the tier
  await M("credit", 1);
  await M("setPrisBoost", 1);
  st = await M("state");
  rec("excavation chest holds every gear tier Normal..Prismatic", st.mine.gearRar.every((n) => n > 0), st.mine.gearRar);
  const gemTot = st.mine.gemRar.slice();
  await M("setPrisBoost", 10);
  for (let h = 0; h < 40; h++) { await M("clearBoxKeepCarry"); await M("credit", 1); const s = await M("state"); s.mine.gemRar.forEach((n, i) => { gemTot[i] += n; }); }
  await M("setPrisBoost", 1);
  rec("excavation chest holds every gem tier Chipped..Prismatic (over 40 one-hour absences)", gemTot.every((n) => n > 0), gemTot);
  rec("excavation chest holds gold", st.mine.gd > 0, st.mine.gd);
  const nat5 = await M("sampleFinds", 7, false, 4000, 300, 1);
  rec("Prismatic finds roll natural stars (1..4 seen at natural luck)", Object.keys(nat5.stars).length >= 3, nat5.stars);
  const lucky = await M("sampleFinds", 7, false, 3000, 300, 40);
  rec("the excavation's Prismatic generator can produce 5-star Prismatic gear (natural star path)", (lucky.stars["5"] || 0) > 0, lucky.stars);
  const gemS = [];
  for (let t = 0; t < 8; t++) { const s = await M("sampleFinds", t, true, 30, 300, 1); gemS.push(Object.keys(s.kinds).join()); }
  rec("gem finds exist for every tier", gemS.every((k) => k === "gem"), gemS);

  // ---- necklaces follow the natural rolls (Eternum necklaces start past depth 100) ----
  st = await M("setup", CODE, { depth: 50, gold: 1e15 });
  await M("resetRate");
  const shallow = await M("natural", 72);
  st = await M("setup", CODE, { depth: 150, gold: 1e15 });
  await M("resetRate");
  const deep = await M("natural", 72);
  rec("necklace expectation is 0 above depth 101 and > 0 past it (natural rule)", shallow.nk === 0 && deep.nk > 0, { shallow: shallow.nk, deep: deep.nk });
  const nkp = await M("addPets", 1, 3); await M("assign", nkp[0]);
  await M("giveNk", 2);
  const opNk = await M("openChest");
  rec("a necklace in the excavation chest is granted on opening (owned or melted to gold if a duplicate)", opNk.state.nkOwn && (opNk.state.nkOwn[2] === 1 || opNk.after.gold > opNk.before.gold), opNk.note);

  // ---- opening the chest + save round-trip ----
  st = await M("setup", CODE, { gold: 1e15 });
  const rp = await M("addPets", 3, 5);
  await M("buySlot"); await M("buySlot");
  for (const id of rp) await M("assign", id);
  await M("trackSession", { secs: 600, normal: 100, elite: 10, chests: 6, floors: 1 });
  await M("credit", 6);
  const rt = await M("roundTrip");
  rec("save round-trip keeps crew, slots, timer, carries, chest and the clear-rate tracker", rt.same && rt.stable && rt.crew2 === 3 && rt.box2 > 0 && rt.mr2 > 0, rt);
  rec("a save without the new fields still loads (old saves)", rt.oldOk && rt.oldMine === null && rt.oldMr === null, rt);
  st = await M("state");
  const op = await M("openChest");
  rec("opening the chest takes every find through the normal pickup path (auto-equip / socket / combine / salvage-if-full) and the gold to the purse", op.state.mine.box === 0 && op.state.mine.gd === 0 && op.after.gold >= op.before.gold + st.mine.gd && /finds/.test(op.note), { note: op.note, before: op.before, after: op.after });

  // ---- screenshots on the live renderer ----
  st = await M("setup", CODE, { gold: 1e15, live: true });
  const vis = await M("addPets", 9, 3);
  const vis2 = await M("addPets", 3, 7);
  for (let i = 0; i < 11; i++) await M("buySlot");
  for (const id of [...vis, ...vis2]) await M("assign", id);
  await M("credit", 8);
  await M("heroTo", 27, 18);
  await sleep(1500);
  await page.screenshot({ path: SHOTS + "/camp-excavation.png" });
  await sleep(900);
  await page.screenshot({ path: SHOTS + "/camp-excavation-2.png" });
  await M("openPanel");
  await sleep(500);
  await page.screenshot({ path: SHOTS + "/excavation-panel.png" });
  const panelTxt = await page.evaluate(() => (document.querySelector('[aria-label="Pet excavation"]') || {}).innerText || "");
  rec("panel shows crew, share, pace, chest, slot price and hire/replace fees", /Pet Excavation/.test(panelTxt) && /Crew share/.test(panelTxt) && /Your pace/.test(panelTxt) && /dig slot/.test(panelTxt) && /(Hire|Replace) [^\n]*\u00b7/.test(panelTxt), panelTxt.slice(0, 300));
  await M("end");

  rec("no page errors", errs.length === 0, errs.slice(0, 3));
  const md5 = crypto.createHash("md5").update(fs.readFileSync("/workspace/ed16-pet/saves/richard-boss-2026-11-17.txt")).digest("hex");
  rec("original Richard save untouched (md5)", md5 === "4c155ae35dc8eacf8dd4ab400adf75a5", md5);
  await browser.close();
  const failed = results.filter((x) => !x.pass);
  console.log(failed.length ? ("FAILED " + failed.length + "/" + results.length) : ("ALL " + results.length + " PASSED"));
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
