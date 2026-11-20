// Camp pet excavation: hiring / slots / auto-swap, offline timer (cap, rollback, multi-day), clear-rate tracking,
// natural expected-haul simulation, the 1%-per-pet uncapped crew share (20 pets = 20%, 21+ keep adding), the full loot pool,
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
  rec("constants exposed", c.MINE_PER_PET_SHARE === 0.01 && (c.MINE_CREW_CAP === null || c.MINE_CREW_CAP >= 1e9) && c.MINE_YIELD_RAR.length === 8 && c.MINE_YIELD_RAR[7] === 1 && c.MINE_YIELD_RAR.every((v, i) => i === 0 || v > c.MINE_YIELD_RAR[i - 1]) && c.MINE_YIELD_RAR.slice(0, 7).every((v) => v < 1) && c.MINE_CAP_HOURS === 72, c);

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
  const cs = await M("consts");
  const top = {}, monoOk = {};
  for (const d of [1, 50, 200, 500]) {
    top[d] = { slot100: await M("price", 100, d), hire100: await HP(d, 99, 7) };
    top[d].total = top[d].slot100 + top[d].hire100;
    let prevS = -1, prevH = -1, prevN = -1, ok = true;
    for (let k = 2; k <= 160; k++) { const sp = await M("price", k, d), hp = await HP(d, k - 1, 7), hn = await HP(d, k - 1, 0); if (sp <= prevS || hp <= prevH || hn < prevN) ok = false; prevS = sp; prevH = hp; prevN = hn; }
    monoOk[d] = ok;
  }
  rec("the 100th Prismatic (slot 100 + hire) costs exactly 1,000,000,000 at depths 1, 50, 200 and 500", [1, 50, 200, 500].every((d) => top[d].total === 1e9) && cs.MINE_TOP_SLOT === 100 && cs.MINE_TOP_GOLD === 1e9, top);
  rec("slot and hire prices rise with every slot 2..160 at depths 1, 50, 200, 500 (no cap at 100)", Object.values(monoOk).every(Boolean), monoOk);
  const first = { slot2: await M("price", 2, 200), normal2: await HP(200, 1, 0), normal1: await HP(200, 0, 0) };
  rec("the first paid Normal pet is cheap (slot 2 + Normal hire in the hundreds to low thousands)", first.slot2 + first.normal2 >= 100 && first.slot2 + first.normal2 <= 5000 && first.normal1 > 0 && first.normal1 < 1000, first);
  const esc = { crew: [await HP(200, 1, 3), await HP(200, 5, 3), await HP(200, 19, 3), await HP(200, 99, 3)], rar: [] };
  for (let r = 0; r < 8; r++) esc.rar.push(await HP(200, 4, r));
  const up = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
  rec("hire fee rises with crew size and with rarity (a Prismatic costs more than a Normal at the same slot)", up(esc.crew) && up(esc.rar) && esc.rar[7] > esc.rar[0] * 20, esc);
  rec("price is the same at every depth (no depth scaling)", (await HP(1, 30, 5)) === (await HP(500, 30, 5)) && (await M("price", 30, 1)) === (await M("price", 30, 500)));
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
  const rep7 = (n, r = 7) => new Array(n).fill(r);
  const cf = {}; for (const n of [1, 5, 20, 21, 40, 60, 100, 500]) cf[n] = await M("crewFrac", rep7(n));
  rec("Prismatic crew share is 1% per pet with no cap (1 -> 1%, 20 -> 20%, 21 -> 21%, 40 -> 40%, 100 -> 100%, 500 -> 500%)", [1, 5, 20, 21, 40, 60, 100, 500].every((n) => Math.abs(cf[n] - n * 0.01) < 1e-12), cf);
  const YR = c.MINE_YIELD_RAR;
  const mixes = { "17 mixed (5 Normal, 4 Magic, 3 Legendary, 3 Ethereal, 2 Prismatic)": [...rep7(5, 0), ...rep7(4, 1), ...rep7(3, 3), ...rep7(3, 5), ...rep7(2, 7)], "20 Normal": rep7(20, 0), "20: 10 Ethereal + 10 Prismatic": [...rep7(10, 5), ...rep7(10, 7)], "1 of each rarity": [0, 1, 2, 3, 4, 5, 6, 7] };
  const mixOut = {};
  let mixOk = true;
  for (const [k, rars] of Object.entries(mixes)) { const f = await M("crewFrac", rars); const eq = rars.reduce((a, r) => a + YR[r], 0); mixOut[k] = { equivPris: +eq.toFixed(4), pct: +(f * 100).toFixed(4) }; if (Math.abs(f - eq * 0.01) > 1e-12) mixOk = false; }
  rec("crew share = 1% x equivalent Prismatic count (sum of MINE_YIELD_RAR per pet)", mixOk, mixOut);
  const m17 = mixes["17 mixed (5 Normal, 4 Magic, 3 Legendary, 3 Ethereal, 2 Prismatic)"];
  rec("a 17-pet mixed crew yields less than 17% (and every non-Prismatic pet less than 1%)", (await M("crewFrac", m17)) < 0.17 && (await M("crewFrac", rep7(20, 0))) < 0.2 && [0, 1, 2, 3, 4, 5, 6].every((r) => YR[r] < 1), mixOut);

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

  // ---- 1% per pet: 1 pet = 1%, 20 Prismatic = exactly 20%, more pets keep adding (no stop at 20) ----
  const yieldOf = async (n, rar, hours = 1) => {
    await M("setup", CODE, { gold: 1e20 });
    const ids = await M("addPets", n, rar);
    for (let i = 1; i < n; i++) await M("buySlot");
    for (const id of ids) await M("assign", id);
    await M("clearBox");
    const r = await M("credit", hours);
    const st2 = await M("state");
    return { crew: st2.mine.crew, frac: r.frac, gear: sum(r.gearExp) / sum(r.natural.gear), gems: sum(r.gemExp) / sum(r.natural.gems), gold: r.salv ? null : r.gold / r.natural.gold, tiers: r.gearExp.map((v, i) => v / r.natural.gear[i]), nk: r.natural.nk };
  };
  const near = (v, t) => v !== null && Math.abs(v / t - 1) < 1e-4;
  const y1 = await yieldOf(1, 7), y5 = await yieldOf(5, 7), y20 = await yieldOf(20, 7), y21 = await yieldOf(21, 7), y25 = await yieldOf(25, 7), y40 = await yieldOf(40, 7), y100 = await yieldOf(100, 7);
  rec("100 Prismatic pets = 100% of the natural haul (credited through the real chest path)", near(y100.gear, 1) && near(y100.gems, 1) && y100.crew === 100, { gear: y100.gear, gems: y100.gems, gold: y100.gold });
  const yN = await yieldOf(20, 0);
  rec("20 Normal pets earn 20 x 0.2% = 4% of the natural haul (gold, gear and gem counts 4%; no tier above Normal over its 4% share)", Math.abs(yN.frac - 0.04) < 1e-12 && near(yN.gold, 0.04) && near(yN.gear, 0.04) && near(yN.gems, 0.04) && yN.tiers.slice(1).every((t) => t <= 0.04 + 1e-9), { frac: yN.frac, gear: yN.gear, gems: yN.gems, gold: yN.gold, tiers: yN.tiers });
  rec("1 Prismatic pet = 1% of the natural haul (gear, gems, gold)", y1.crew === 1 && near(y1.gear, 0.01) && near(y1.gems, 0.01) && near(y1.gold, 0.01), y1);
  rec("20 Prismatic pets = exactly 20% of the natural haul (gear, gems, gold; every tier incl. Prismatic)", y20.crew === 20 && near(y20.gear, 0.2) && near(y20.gems, 0.2) && near(y20.gold, 0.2) && y20.tiers.every((t) => Math.abs(t - 0.2) < 1e-6), y20);
  const ys = [y1, y5, y20, y21, y25, y40];
  rec("yield keeps rising past 20 pets: 1 < 5 < 20 < 21 < 25 < 40 (21 = 21%, 40 = 40%)", ys.every((y, i) => i === 0 || (y.gear > ys[i - 1].gear && y.gold > ys[i - 1].gold)) && near(y21.gear, 0.21) && near(y40.gear, 0.4) && near(y40.gold, 0.4), ys.map((y) => ({ crew: y.crew, gear: +y.gear.toFixed(4), gold: y.gold && +y.gold.toFixed(4) })));
  rec("the Prismatic tier budget grows with crew size past 20 (40 pets find 2x the Prismatic of 20)", Math.abs(y40.tiers[7] / y20.tiers[7] - 2) < 1e-6, { p20: y20.tiers[7], p40: y40.tiers[7] });
  const natW = [60, 25, 10, 4, 1.2, 0.5, 0.15, 0.02];
  const mono = [];
  for (const crew of [[0], [3], [7], [0, 3, 7]]) { const row = []; for (const n of [19, 20, 21, 25, 40]) { const rars = []; for (let i = 0; i < n; i++) rars.push(crew[i % crew.length]); row.push(sum((await M("allocate", rars, natW)).got)); } mono.push(row); }
  rec("any crew (gray, Legendary, Prismatic, mixed): a 21st+ pet always adds yield", mono.every((r) => r.every((v, i) => i === 0 || v > r[i - 1] + 1e-9)), mono.map((r) => r.map((v) => +v.toFixed(3))));
  const s21 = await M("price", 21, 200), s20 = await M("price", 20, 200), s41 = await M("price", 41, 200);
  rec("no slot cap: slot 21+ is for sale, priced above slot 20 and still escalating", s21 > s20 && s41 > s21 && y40.crew === 40, { s20, s21, s41 });

  // ---- 100 Prismatic pets = 100% of natural (1% each), per tier never over natural share ----
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
  rec("100 Prismatic pets = 100% of the natural haul, in EVERY tier (gear and gems)", perTierOk && Math.abs(cr.frac - 1) < 1e-12, { exp: cr.gearExp.map((v) => +v.toFixed(3)), nat: nat.gear.map((v) => +v.toFixed(3)) });
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
  rec("allocator: one Prismatic pet finds more high-tier loot than one gray pet (both 1% of natural)", hi(A1p.got) > hi(A1g.got) * 3 && A1p.got.every((v, i) => v <= natV[i] * 0.01 + 1e-9) && Math.abs(sum(A1p.got) - 0.01 * sum(natV)) < 1e-9, { pris: A1p.got.map((v) => +v.toFixed(3)), gray: A1g.got.map((v) => +v.toFixed(3)) });
  const odds0 = await M("odds", 0), odds7 = await M("odds", 7);
  rec("pet tier preference: Normal pet centers on Normal, Prismatic pet on Prismatic, all tiers non-zero", odds0[0] > 0.9 && odds7[7] > 0.5 && odds0.every((v) => v > 0), { odds0, odds7 });

  // ---- full loot pool: every gear tier (incl. 5-star Prismatic), every gem tier, gold ----
  st = await M("setup", CODE, { gold: 1e20 });
  const pool = await M("addPets", 100, 7);
  for (let i = 0; i < 99; i++) await M("buySlot");
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

  // ---- never Eternum necklaces, never artifacts (creator rule, Nov 19 7:54 PM) ----
  st = await M("setup", CODE, { depth: 900, gold: 1e20 });
  await M("resetRate");
  await M("ownAllNk"); // all seven owned: the state where natural play could start rolling Eternum necklaces
  const deepCrew = await M("addPets", 100, 7);
  for (let i = 0; i < 99; i++) await M("buySlot");
  for (const id of deepCrew) await M("assign", id);
  const artsBefore = (await M("state")).arts;
  let nkSeen = 0, peSeen = 0;
  const kinds = new Set();
  for (let a = 0; a < 30; a++) {
    await M("clearBoxKeepCarry");
    await M("credit", 72);
    const s2 = await M("state");
    nkSeen += s2.mine.nk.length; peSeen += s2.mine.nk.filter((i) => i >= 7).length;
    s2.boxKinds.forEach((k) => kinds.add(k));
  }
  const opDeep = await M("openChest");
  const after2 = await M("state");
  rec("30 x 72 h absences at depth 900, 100 Prismatic pets, all seven owned: zero Eternum necklaces (and no owned duplicates)", peSeen === 0 && nkSeen === 0 && after2.nkOwn[7] === 0 && !after2.nkPe, { regularNecklaces: nkSeen, eternum: peSeen, nkOwnAfter: after2.nkOwn, pe: after2.nkPe });
  rec("...and zero artifacts: the chest holds only gear, pets and gems, and opening it grants no artifact", [...kinds].every((k) => k !== "artifact") && JSON.stringify(after2.arts) === JSON.stringify(artsBefore), { kinds: [...kinds], artsBefore: artsBefore.length, artsAfter: after2.arts.length, note: opDeep.note });
  st = await M("setup", null, { depth: 900, gold: 1e20 });
  await M("resetRate");
  const freshCrew = await M("addPets", 100, 7);
  for (let i = 0; i < 99; i++) await M("buySlot");
  for (const id of freshCrew) await M("assign", id);
  let fresh = [];
  for (let a = 0; a < 10; a++) { await M("clearBox"); await M("credit", 72); const s3 = await M("state"); fresh = fresh.concat(s3.mine.nk); if (s3.mine.nk.length) break; }
  rec("with no necklaces owned the chest does find regular necklaces (distinct, never Eternum)", fresh.length > 0 && fresh.every((i) => i < 7) && new Set(fresh).size === fresh.length, fresh);
  await M("giveNk", 7);
  const opPe = await M("openChest");
  rec("an Eternum necklace placed in an old chest is dropped, never granted", (await M("state")).nkOwn[7] === 0, opPe.note);

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
  // ---- chest view: every item shown, take one, take all ----
  const cv0 = await M("state");
  const ui0 = await page.evaluate(() => { const r = document.querySelector('[aria-label="Pet excavation"]'); const gr = r && r.querySelector("[data-mine-grid]"); return { grid: gr ? gr.querySelectorAll("button.dc-cell").length : -1, attr: gr ? +gr.getAttribute("data-mine-grid") : -1, head: (r && r.querySelector("[data-mine-chest]") || {}).innerText || "" }; });
  rec("chest view lists every item in the chest as an icon (plus gold / necklace line) before taking anything", cv0.mine.box > 0 && ui0.grid === cv0.mine.box && ui0.attr === cv0.mine.box && /Excavation chest/.test(ui0.head), { box: cv0.mine.box, ui: ui0 });
  await page.evaluate(() => { const h = document.querySelector('[aria-label="Pet excavation"] [data-mine-chest]'); h && h.scrollIntoView(); });
  await sleep(200);
  await page.screenshot({ path: SHOTS + "/excavation-chest-grid.png" });
  await page.evaluate(() => { const gr = document.querySelector('[aria-label="Pet excavation"] [data-mine-grid]'); const bs = gr ? [...gr.querySelectorAll("button.dc-cell")] : []; const pick = bs.find((b) => !b.className.includes("gem")) || bs[0]; pick && pick.click(); });
  await sleep(250);
  await page.evaluate(() => { const h = document.querySelector('[aria-label="Pet excavation"] [data-mine-sel]'); h && h.scrollIntoView(); });
  await sleep(150);
  await page.screenshot({ path: SHOTS + "/excavation-chest-item.png" });
  const selTxt = await page.evaluate(() => (document.querySelector('[aria-label="Pet excavation"] [data-mine-sel]') || {}).innerText || "");
  const before1 = await M("state");
  await page.evaluate(() => { const b = document.querySelector('[aria-label="Take this item"]'); b && b.click(); });
  await sleep(250);
  const after1 = await M("state");
  const bagGrew = (after1.bagN - before1.bagN) + (after1.gemN - before1.gemN);
  rec("tapping an icon shows the item details; Take moves exactly that one item: chest -1, bag +1", selTxt.length > 0 && after1.mine.box === before1.mine.box - 1 && bagGrew === 1, { sel: selTxt.slice(0, 80), chest: [before1.mine.box, after1.mine.box], bag: [before1.bagN, after1.bagN], gemBag: [before1.gemN, after1.gemN] });
  await page.evaluate(() => { const b = document.querySelector('[aria-label="Take all from the excavation chest"]'); b && b.click(); });
  await sleep(400);
  const after2b = await M("state");
  const ui2 = await page.evaluate(() => !!document.querySelector('[aria-label="Pet excavation"] [data-mine-grid]'));
  rec("Take All empties the chest (items, gold, necklaces) and the grid disappears", after2b.mine.box === 0 && after2b.mine.gd === 0 && after2b.mine.nk.length === 0 && !ui2, { box: after2b.mine.box, gd: after2b.mine.gd, grid: ui2 });
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
