// Pre-Prismatic enemy strength: HP, resists, and damage dealt are x0.8 until the
// player has a Prismatic in equipped slots or the bag. The flag is sticky.
// Loot tables and the existing no-Prismatic loot boost must stay exactly as in HEAD 5c113b6.
// Throwaway profile / hook only. Official saves are never written; Richard is read from a COPY.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { createServer } from "net";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { passOwnerGate } from "./_owner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
let PORT = Number(process.env.ED16_PORT || 0);
let BASE = process.env.ED16_URL || "";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const RICHARD_MD5 = "4c155ae35dc8eacf8dd4ab400adf75a5";
const COPY = "/tmp/ed16-pris-scale-richard-COPY.txt";
const HEAD_LOOT = JSON.parse(fs.readFileSync(path.join(__dirname, "prismatic-scaling-loot-head.json"), "utf8"));
const MUL = 0.8;
const EL_RESIST = 0.45;

const results = [];
function rec(step, pass, detail = "") {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ step, pass: !!pass, detail: d });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (d ? "  --  " + d.slice(0, 800) : ""));
  return !!pass;
}
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pickPort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}
async function waitHttp(url, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(80);
  }
  throw new Error("server did not start at " + url);
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const closeR = (a, b, eps = 1) => Math.abs(a - b) <= eps;

function startServer() {
  if (process.env.ED16_URL) return null;
  return spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
}

function numsEq(a, b, eps = 1e-9) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => numsEq(v, b[i], eps));
  }
  if (a && typeof a === "object" && b && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => numsEq(a[k], b[k], eps));
  }
  if (typeof a === "number" && typeof b === "number") return close(a, b, eps);
  return a === b;
}

async function main() {
  const srcMd5 = md5(RICHARD);
  rec("official Richard save md5 unchanged before test", srcMd5 === RICHARD_MD5, srcMd5);
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the official Richard save", fs.existsSync(COPY) && md5(COPY) === RICHARD_MD5, COPY);

  if (!process.env.ED16_URL) {
    PORT = await pickPort();
    BASE = "http://127.0.0.1:" + PORT + "/";
  } else {
    BASE = process.env.ED16_URL;
  }
  const srv = startServer();
  if (srv) await waitHttp(BASE);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    userDataDir: "/tmp/ed16-profiles/pris-scale-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--mute-audio", "--disable-dev-shm-usage", "--disable-features=ServiceWorker"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  if (process.env.ED16_OWNER_CODE) {
    try { await passOwnerGate(page); } catch (e) { rec("owner gate", false, String(e && e.message || e)); }
  }
  await page.waitForFunction(() => !!(window.__ED16_EARLY && window.__ED16_PRIS), { timeout: 25000 });
  const api = (n, ...a) => page.evaluate((n, a) => window.__ED16_EARLY[n](...a), n, a);

  // --- loot tables vs HEAD 5c113b6 ---
  const tables = await api("lootTables");
  const lootKeys = ["RW", "LOOT_BONUS", "LOOT_RAR_FLOOR", "PRIS_DROP_MULT", "PRIS_F_EXP", "PRIS_BONUS_END", "RAR_F_EXP", "RAR_F_CAP", "RAR_F_LIFT", "RAMP_START", "RAMP_END", "wRaw_1_0", "w_1_0", "w_1_22_0", "w_1_35_0", "w_1_6_2"];
  let lootOk = true;
  const lootFail = [];
  for (const k of lootKeys) {
    if (!numsEq(tables[k], HEAD_LOOT[k], 1e-9)) { lootOk = false; lootFail.push(k); }
  }
  rec("loot drop tables/rates unchanged vs HEAD 5c113b6", lootOk, lootFail.length ? lootFail.join(",") : "all " + lootKeys.length + " keys match");

  // --- fresh start (Tester-like): flag false, x0.8 ---
  let st = await api("begin", { depth: 1, lvl: 1 });
  rec("fresh start: hasPrismatic is false", st.hasPrismatic === false, st);
  rec("fresh start: early mul is 0.8", st.mul === MUL, st.mul);

  const nrm = await api("spawn", 0);
  const foe0 = nrm.foe;
  rec("pre-flag normal foe marked early-weak (efw=1)", !!(foe0 && foe0.efw === 1), foe0);
  rec("pre-flag elemental resist is 0.45 * 0.8 (mul 0.64)", !!(foe0 && close(foe0.fireMul, 1 - EL_RESIST * MUL, 1e-9)), foe0 && foe0.fireMul);
  const dmg0 = await api("applyFoeDmg", 10);
  rec("pre-flag foe damage dealt is 80% (10 -> 8)", !!(dmg0.ok && dmg0.incoming === 8 && dmg0.took === 8), dmg0);

  const boss = await api("spawn", 2);
  const boss0 = boss.foe;
  rec("pre-flag boss also early-weak", !!(boss0 && boss0.efw === 1 && boss0.cls === 2), boss0);

  // --- stash-only does not flip the strength flag, but existing loot boost still sees it ---
  await api("begin", { depth: 1, lvl: 1 });
  const stash = await api("giveStash");
  rec("Prismatic in stash only: strength flag stays false", stash.hasPrismatic === false && stash.held === false, stash);
  rec("Prismatic in stash only: loot boost still treats it as owned (lootMul=1)", stash.lootOwned === true && stash.lootMul === 1, { lootOwned: stash.lootOwned, lootMul: stash.lootMul });
  const stashFoe = await api("spawn", 0);
  rec("Prismatic in stash only: new foes still at 0.8", !!(stashFoe.foe && stashFoe.foe.efw === 1 && stashFoe.mul === MUL), stashFoe.foe);

  await api("begin", { depth: 1, lvl: 1 });
  const gb = await api("giveGemBag");
  rec("Prismatic in gem bag only: strength flag stays false", gb.hasPrismatic === false && gb.held === false, gb);

  // --- bag pickup flips flag, restores live foes, toast ---
  st = await api("begin", { depth: 1, lvl: 1 });
  const before = await api("spawn", 0);
  const fBefore = before.foe;
  const afterBag = await api("giveBag");
  rec("first Prismatic in bag sets sticky flag", afterBag.hasPrismatic === true && afterBag.held === true, afterBag);
  rec("toast announces full-strength enemies", /First Prismatic! Enemies are now at full strength/.test(afterBag.toast || afterBag.lastMsg || ""), { toast: afterBag.toast, lastMsg: afterBag.lastMsg });
  const fAfter = (afterBag.foes || []).find((f) => f.id === fBefore.id) || afterBag.foes[0];
  rec("live foe HP restored proportionally (mhp / 0.8)", !!(fAfter && closeR(fAfter.mhp, Math.max(1, Math.round(fBefore.mhp / MUL)), 1)), { before: fBefore.mhp, after: fAfter && fAfter.mhp, expect: Math.max(1, Math.round(fBefore.mhp / MUL)) });
  rec("live foe def restored", !!(fAfter && closeR(fAfter.def, Math.max(0, Math.round(fBefore.def / MUL)), 1)), { before: fBefore.def, after: fAfter && fAfter.def });
  rec("after flag flip, resists are immediately normal (0.55)", !!(fAfter && fAfter.efw === 0 && close(fAfter.fireMul, 1 - EL_RESIST, 1e-9)), fAfter);
  rec("after flag flip, damage dealt is 100%", (await api("applyFoeDmg", 10)).took === 10, await api("applyFoeDmg", 10));
  rec("loot boost also sees bag Prismatic (unchanged ownsPrismatic path)", afterBag.lootOwned === true && afterBag.lootMul === 1, { lootOwned: afterBag.lootOwned, lootMul: afterBag.lootMul });

  const newFull = await api("spawn", 0);
  rec("newly spawned foes after the flag are full strength", !!(newFull.foe && newFull.foe.efw === 0 && newFull.mul === 1), newFull.foe);

  // selling / dropping does not bring the reduction back
  const removed = await api("removeHeld");
  rec("selling/dropping the Prismatic does not clear the sticky flag", removed.hasPrismatic === true && removed.held === false, removed);
  const afterDrop = await api("spawn", 0);
  rec("after dropping the item, new foes stay at full strength", !!(afterDrop.foe && afterDrop.foe.efw === 0 && afterDrop.mul === 1), afterDrop.foe);

  // equipped path
  st = await api("begin", { depth: 1, lvl: 1 });
  const eq = await api("giveEq");
  rec("first Prismatic equipped also sets the sticky flag", eq.hasPrismatic === true && eq.held === true, eq);

  // load-time from current bag/eq (no saved flag)
  const loadBag = await api("loadSynthetic", { bag: true });
  rec("load-time: existing bag Prismatic sets the flag (no reliance on a saved field)", loadBag.hasPrismatic === true && loadBag.held === true, loadBag);
  const loadEq = await api("loadSynthetic", { eq: true });
  rec("load-time: existing equipped Prismatic sets the flag", loadEq.hasPrismatic === true && loadEq.held === true, loadEq);
  const loadStash = await api("loadSynthetic", { stash: true });
  rec("load-time: stash-only Prismatic does not set the strength flag", loadStash.hasPrismatic === false && loadStash.held === false && loadStash.lootOwned === true, loadStash);
  const loadFlag = await api("loadSynthetic", { flag: true, fp: 123 });
  rec("load-time: saved sticky flag is kept even with no Prismatic in bag/eq", loadFlag.hasPrismatic === true && loadFlag.held === false && loadFlag.firstPrismaticAt === 123, loadFlag);

  // save code round-trip: flag persists after the item is gone
  await api("begin", { depth: 1, lvl: 1 });
  await api("giveBag");
  await api("removeHeld");
  const coded = await api("saveCode");
  rec("save code stores fp > 0 when the sticky flag is set", !!(coded.ok && coded.fp > 0), { fp: coded.fp });
  // start clean, then decode the code (items already removed, flag should load from fp)
  await api("begin", { depth: 1, lvl: 1 });
  const loaded = await api("loadFromCode", coded.code);
  rec("save-code load restores the sticky flag without a held Prismatic", loaded.hasPrismatic === true && loaded.held === false, loaded);

  // Richard copy: does this existing save already count as having a Prismatic in bag/eq?
  const richardCode = fs.readFileSync(COPY, "utf8").replace(/\s+/g, "");
  const richard = await api("loadFromCode", richardCode);
  rec("Richard copy loaded", richard.ok !== false, { hasPrismatic: richard.hasPrismatic, held: richard.held, lootOwned: richard.lootOwned, bag: richard.bagRars, eq: richard.eqRars });
  // Not a pass/fail on whether he has one — report it. If he does, flag must be true so he is unaffected.
  if (richard.held) rec("Richard already has a bag/eq Prismatic, so the flag is set (unaffected)", richard.hasPrismatic === true, richard);
  else rec("Richard has no bag/eq Prismatic; flag follows saved/detected state only", true, richard);

  rec("official Richard save md5 unchanged after test", md5(RICHARD) === RICHARD_MD5, md5(RICHARD));
  rec("no page errors", errs.length === 0, errs.join(" | "));

  try {
    await api("end");
  } catch { /* ignore */ }
  try { await browser.close(); } catch { /* ignore */ }
  if (srv) try { srv.kill(); } catch { /* ignore */ }

  const failed = results.filter((r) => !r.pass);
  console.log("\n" + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  if (failed.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
