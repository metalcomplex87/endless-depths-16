// Exact gem tooltips, Prismatic sockets, and socket-bonus rules.
import puppeteer from "puppeteer-core";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const OFFICIAL = path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const SHOT_DIR = "/workspace/ed16-cave-shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (d ? "  --  " + d.slice(0, 1600) : ""));
}
function md5(p) { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"); }

async function main() {
  const officialBefore = md5(OFFICIAL);
  rec("official Richard save md5 at start", officialBefore === "4c155ae35dc8eacf8dd4ab400adf75a5", officialBefore);

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/gem-sockets-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.setViewport({ width: 412, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_PRIS.gems));
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 200, lvl: 200 }));
  await sleep(150);

  const G = (name, ...a) => page.evaluate((name, a) => window.__ED16_PRIS.gems[name](...a), name, a);
  const Gprop = (name) => page.evaluate((name) => window.__ED16_PRIS.gems[name], name);

  const names = await Gprop("names");
  rec("seven gem types exist with flavor text", Array.isArray(names) && names.length === 7, names.map((t) => t.n + ": " + t.d));

  // Exact numeric tooltips for every type × rarity at 0 stars, depth 200 (Ruby scales).
  const table = [];
  let textsOk = true;
  for (let typ = 0; typ <= 6; typ++) {
    const row = { typ, name: names[typ].n, cells: [] };
    for (let rar = 0; rar <= 7; rar++) {
      const text = await G("effect", typ, typ, rar, 0, 200);
      // G("effect", rar, typ, stars, depth) — check hook signature: (rar, typ, stars, depth)
    }
    table.push(row);
  }
  // fix: hook is effect(rar, typ, stars, depth)
  const byType = [];
  for (let typ = 0; typ <= 6; typ++) {
    const cells = [];
    for (let rar = 0; rar <= 7; rar++) {
      const text = await page.evaluate((rar, typ) => window.__ED16_PRIS.gems.effect(rar, typ, 0, 200), rar, typ);
      const hasNum = /\d/.test(text) && !names[typ].d.split(" ").every((w) => text.includes(w) && names[typ].d.length > 10 && text === names[typ].d);
      if (!text || !/\d/.test(text)) textsOk = false;
      cells.push({ rar, text });
    }
    byType.push({ name: names[typ].n, flavor: names[typ].d, cells });
  }
  rec("every gem type/tier tooltip is numeric (not just flavor text)", textsOk,
    byType.map((t) => t.name + ": " + t.cells[0].text + " / " + t.cells[7].text));

  // Spot-check gem v2 (2026-11-19): power = 1.5^tier (Prismatic 1.5^6 x 2.25), Diamond +0.03% per power, Emerald +0.04%
  const dia0 = await page.evaluate(() => window.__ED16_PRIS.gems.effect(0, 0, 0, 1));
  const dia7 = await page.evaluate(() => window.__ED16_PRIS.gems.effect(7, 0, 0, 1));
  rec("Chipped Diamond is +0.030% Max HP, Atk and Def (power 1)", dia0.startsWith("Gem power 1. +0.030% Max HP, Atk and Def"), dia0);
  rec("Prismatic Diamond is +0.77% Max HP, Atk and Def (power 25.63)", dia7.startsWith("Gem power 25.63. +0.77% Max HP, Atk and Def"), dia7);
  const em3 = await page.evaluate(() => window.__ED16_PRIS.gems.effect(3, 3, 0, 1));
  rec("Bright Emerald is +0.14% Max HP (power 3.38)", em3.startsWith("Gem power 3.38. +0.14% Max HP"), em3);
  const pows = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 6, 7].map((r) => window.__ED16_PRIS.gems.pow(r, 0)));
  const steps = pows.slice(1).map((v, i) => v / pows[i]);
  rec("each rarity tier is x1.5 the one below; Prismatic is x2.25 over Imperial",
    steps.slice(0, 6).every((x) => Math.abs(x - 1.5) < 1e-9) && Math.abs(steps[6] - 2.25) < 1e-9, pows.map((v) => +v.toFixed(3)));
  const maxStarBelow = await page.evaluate(() => [3, 4, 5, 6].map((r) => [window.__ED16_PRIS.gems.pow(r, [0, 0, 0, 1, 2, 3, 4][r]), window.__ED16_PRIS.gems.pow(r + 1, 0)]));
  rec("a max-star gem never out-powers the next rarity at 0 stars", maxStarBelow.every(([a, b]) => a < b), maxStarBelow);
  const pris = await page.evaluate(() => [0, 5, 10].map((n) => window.__ED16_PRIS.gems.starMul(7, n)));
  rec("Prismatic gem stars add +15% each (x1.75 at 5, x2.5 at 10)", Math.abs(pris[1] - 1.75) < 1e-9 && Math.abs(pris[2] - 2.5) < 1e-9, pris);

  const starMul = await page.evaluate(() => [0, 1, 2, 3, 4].map((n) => window.__ED16_PRIS.gems.starMul(5, n)));
  rec("non-Prismatic gem stars add +15% each (Ethereal cap 3)",
    starMul[0] === 1 && Math.abs(starMul[1] - 1.15) < 1e-9 && Math.abs(starMul[3] - 1.45) < 1e-9 && starMul[4] === 1.45,
    starMul);

  // Fit rules
  const fits = await page.evaluate(() => {
    const g = window.__ED16_PRIS.gems;
    return {
      rubyInRuby: g.fits(3, 1, 1),
      rubyInSap: g.fits(3, 1, 2),
      prisInSap: g.fits(7, 1, 2),
      prisInPris: g.fits(7, 0, 7),
      rubyInPris: g.fits(3, 1, 7),
      diaInPris: g.fits(6, 0, 7),
    };
  });
  rec("regular gems fit only their color; Prismatic gems fit any socket including Prismatic",
    fits.rubyInRuby && !fits.rubyInSap && fits.prisInSap && fits.prisInPris,
    fits);
  rec("non-Prismatic gems do not complete a Prismatic socket",
    !fits.rubyInPris && !fits.diaInPris, fits);

  // Drops: 2★+ Prismatic always 4 Prismatic sockets
  const drops = await page.evaluate(() => {
    const g = window.__ED16_PRIS.gems;
    const a = g.dropSockets("sword", 7, 2);
    const b = g.dropSockets("chest", 7, 5);
    const c = g.dropSockets("sword", 7, 10);
    const d = g.dropSockets("sword", 7, 1);
    const e = g.dropSockets("sword", 5, 2);
    return { a, b, c, d, e };
  });
  const allPris = (row) => row.n === 4 && row.colors.every((c) => c === 7);
  rec("2★+ Prismatic drops always have 4 Prismatic sockets",
    allPris(drops.a) && allPris(drops.b) && allPris(drops.c), drops);
  rec("1★ Prismatic sockets are all Prismatic-colored (count may be rolled, never above 4)",
    drops.d.colors.every((c) => c === 7) && drops.d.n <= 4, drops.d);
  rec("regular (non-Prismatic) gear still uses gem-color sockets 0–6, not Prismatic",
    drops.e.colors.every((c) => c >= 0 && c <= 6), drops.e);

  // Bonus ready / migrated gem
  const ready = await page.evaluate(() => {
    const g = window.__ED16_PRIS.gems;
    const on = g.layout("chest", 5, 2, [0, 3], [{ typ: 0, rar: 5 }, { typ: 3, rar: 5 }]);
    const offEmpty = g.layout("chest", 5, 2, [0, 3], [{ typ: 0, rar: 5 }]);
    const offWrong = g.layout("chest", 5, 2, [0, 3], [{ typ: 0, rar: 5 }, { typ: 1, rar: 5 }]);
    const prisOn = g.layout("chest", 7, 5, [7, 7, 7, 7], [0, 1, 2, 3].map(() => ({ typ: 0, rar: 7, s: 2 })));
    const prisOff = g.layout("chest", 7, 5, [7, 7, 7, 7], [{ typ: 0, rar: 6 }, { typ: 0, rar: 7 }, { typ: 1, rar: 7 }, { typ: 2, rar: 7 }]);
    return { on, offEmpty, offWrong, prisOn, prisOff };
  });
  rec("socket bonus activates only when every socket has a proper-color gem",
    ready.on.ready && !ready.offEmpty.ready && !ready.offWrong.ready, { on: ready.on.line, empty: ready.offEmpty.line, wrong: ready.offWrong.line });
  rec("Prismatic bonus is from the Prismatic-only pool when all sockets have Prismatic gems",
    !!(ready.prisOn.ready && ready.prisOn.bonus && ready.prisOn.bonus.pris && ready.prisOn.line.startsWith("Socket bonus: ")),
    ready.prisOn.line);
  rec("migrated non-Prismatic gem stays in a Prismatic socket but does not activate the bonus",
    !ready.prisOff.ready && ready.prisOff.filled[0] === true, ready.prisOff);

  const pools = await page.evaluate(() => window.__ED16_PRIS.gems.pools());
  const overlap = pools.reg.filter((id) => pools.pris.includes(id));
  rec("regular and Prismatic bonus pools are separate (no shared ids)",
    pools.reg.length >= 10 && pools.pris.length >= 10 && overlap.length === 0,
    { reg: pools.reg, pris: pools.pris });

  // Scaling
  const mags = await page.evaluate(() => {
    const g = window.__ED16_PRIS.gems;
    return {
      n0: +g.bonusMag(0, 0).toFixed(3),
      n6: +g.bonusMag(6, 0).toFixed(3),
      n6s4: +g.bonusMag(6, 4).toFixed(3),
      p0: +g.bonusMag(7, 0).toFixed(3),
      p5: +g.bonusMag(7, 5).toFixed(3),
      p10: +g.bonusMag(7, 10).toFixed(3),
    };
  });
  rec("socket bonus scales by rarity (0.40 + 0.10×rar) and +10% per star; Prismatic 0.90 / 1.35 / 1.80 at 0/5/10★",
    mags.n0 === 0.4 && mags.n6 === 1 && mags.n6s4 === 1.4 && mags.p0 === 0.9 && mags.p5 === 1.35 && mags.p10 === 1.8,
    mags);

  const pack = await page.evaluate(() => window.__ED16_PRIS.gems.packRoundtrip());
  rec("pack/unpack keeps Prismatic socket color 7 and socketed gems",
    pack.ok && pack.n === 4 && pack.colors.every((c) => c === 7) && pack.gem && pack.gem.typ === 0 && pack.gem.s === 2,
    pack);

  const comb = await page.evaluate(() => {
    const g = window.__ED16_PRIS.gems;
    return {
      from1: g.combine(1, 1),
      from2: g.combine(2, 2),
      from4: g.combine(5, 4),
      noReduce: g.combine(0, 3),
    };
  });
  rec("combine never reduces sockets; 2★+ Prismatic results have 4 Prismatic sockets; gems are kept",
    !comb.from1.reduced && !comb.from2.reduced && !comb.from4.reduced && !comb.noReduce.reduced
      && comb.from2.outN === 4 && comb.from2.colors.every((c) => c === 7)
      && comb.from4.outN === 4 && comb.from4.keptGem
      && comb.noReduce.outN >= 3,
    comb);

  const rr = await page.evaluate(() => window.__ED16_PRIS.gems.reroll());
  rec("Prismatic combine into a new star value re-rolls the Prismatic bonus (deterministic on seed+stars); magnitude rises with stars",
    rr.changed && rr.mag3 > rr.mag2, rr);

  const stOn = await page.evaluate(() => window.__ED16_PRIS.gems.stats(true));
  const stOff = await page.evaluate(() => window.__ED16_PRIS.gems.stats(false));
  rec("active socket bonus can change calc'd stats; inactive (unfilled) does not grant the bonus",
    stOn.ready && !stOff.ready && (stOn.hp1 !== stOn.hp0 || stOn.atk1 !== stOn.atk0 || stOn.def1 !== stOn.def0),
    { stOn, stOff });

  // Screenshots
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const tip = await page.evaluate(() => window.__ED16_PRIS.gems.setupShot("tooltip"));
  await sleep(400);
  // click the gem cell
  const gemClicked = await page.evaluate((id) => {
    const cells = Array.from(document.querySelectorAll(".dc-cell"));
    const el = cells.find((c) => (c.getAttribute("aria-label") || "").includes("Ruby"));
    if (el) { el.click(); return el.getAttribute("aria-label"); }
    return null;
  }, tip.id);
  await sleep(300);
  await page.evaluate(() => {
    const inv = document.querySelector(".dc-inv");
    const el = Array.from(document.querySelectorAll(".dc-inv div")).find((d) => /Aura:.*damage each turn/.test(d.textContent || ""));
    if (el) el.scrollIntoView({ block: "center" });
    else if (inv) inv.scrollTop = inv.scrollHeight;
  });
  await sleep(200);
  const tipPath = path.join(SHOT_DIR, "gem-tooltip.png");
  await page.screenshot({ path: tipPath, type: "png" });
  rec("gem tooltip screenshot saved", fs.existsSync(tipPath) && fs.statSync(tipPath).size > 1000, { path: tipPath, clicked: gemClicked, text: tip.text });

  await page.evaluate(() => window.__ED16_PRIS.openInv(false));
  await sleep(150);
  const bon = await page.evaluate(() => window.__ED16_PRIS.gems.setupShot("bonus"));
  await sleep(400);
  const chestClicked = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll(".dc-cell"));
    const el = cells.find((c) => /chest|plate|mail|cuirass|aegis|harness|jerkin/i.test(c.getAttribute("aria-label") || ""))
      || cells.find((c) => (c.getAttribute("aria-label") || "").length > 0 && c.className.includes("r7"));
    if (el) { el.click(); return el.getAttribute("aria-label"); }
    return null;
  });
  await sleep(300);
  await page.evaluate(() => {
    const el = document.querySelector(".dc-sockbonus");
    if (el) el.scrollIntoView({ block: "center" });
  });
  await sleep(200);
  const bonPath = path.join(SHOT_DIR, "socket-bonus.png");
  await page.screenshot({ path: bonPath, type: "png" });
  const bonusVisible = await page.evaluate(() => {
    const el = document.querySelector(".dc-sockbonus");
    return el ? el.textContent : null;
  });
  rec("socket bonus screenshot saved and the bonus line is visible",
    fs.existsSync(bonPath) && fs.statSync(bonPath).size > 1000 && !!(bonusVisible && bonusVisible.indexOf("Socket bonus") >= 0),
    { path: bonPath, clicked: chestClicked, line: bon.line, visible: bonusVisible });

  rec("no page errors", errs.length === 0, errs);

  await page.evaluate(() => window.__ED16_PRIS.end && window.__ED16_PRIS.end());
  await browser.close();

  const officialAfter = md5(OFFICIAL);
  rec("official Richard save md5 unchanged", officialAfter === officialBefore, officialAfter);

  const fail = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
