import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const OUT = "/workspace/ed16-web/screenshots-bulwark";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 3000) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 1500) : "")); }
async function open(w, h) {
  const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/bw-" + Date.now() + Math.random(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
  const page = await b.newPage(); page.setDefaultTimeout(120000);
  const errs = [];
  page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_PRIS.begin));
  return { b, page, errs };
}
const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
const fmt = (t) => t < 1.5 ? t.toFixed(1) + " s" : t < 120 ? Math.round(t) + " s" : t < 3600 ? (t / 60).toFixed(1) + " min" : t < 86400 ? (t / 3600).toFixed(1) + " h" : (t / 86400).toFixed(0) + " days";
async function main() {
  const { b, page, errs } = await open(412, 860);
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 200, lvl: 200 }));
  await sleep(300);
  // 1. tiers
  const tiers = {};
  for (const st of [0, 5, 10]) for (const d of [25, 200, 500, 1000, 1300, 3000]) tiers[st + "@" + d] = (await H(page, "bwTier", st, d, 6)).b;
  fs.writeFileSync(OUT + "/tiers.json", JSON.stringify(tiers, null, 1));
  const t0 = tiers["0@200"], t5 = tiers["5@200"], t10 = tiers["10@200"];
  rec("hit cap 54/45/35% for 6 Prismatics at 0/5/10 stars", Math.round(t0.cap * 100) === 54 && Math.round(t5.cap * 100) === 45 && Math.round(t10.cap * 100) === 35, [t0, t5, t10].map((t) => (t.cap * 100).toFixed(1)).join(" / "));
  // 2. fight sims, before/after
  const sims = [];
  for (const d of [200, 500, 1000, 3000]) for (const st of [0, 5, 10]) {
    const off = await H(page, "bwSim", d, st, false, 6);
    const on = await H(page, "bwSim", d, st, true, 6);
    sims.push({ d, st, before: off, after: on });
    console.log("SIM d" + d + " " + st + "*: basic-hit model " + fmt(off.ttkBasic) + " -> " + fmt(on.ttkBasic) + " | full combat before " + fmt(off.ttk) + " worst hit " + Math.round(off.worstHit * 100) + "%/" + Math.round(off.worstSpecial * 100) + "% | after " + fmt(on.ttk) + " worst " + Math.round(on.worstHit * 100) + "%/" + Math.round(on.worstSpecial * 100) + "% oneShots " + on.oneShots + " | LS " + on.lastStand);
  }
  fs.writeFileSync(OUT + "/fight-sims.json", JSON.stringify(sims, null, 1));
  rec("no boss one-shots with the Bulwark (melee + specials, boss power x3)", sims.every((s) => s.after.oneShots === 0 && s.after.worstHit <= s.after.cap + 0.005 && s.after.worstSpecial <= s.after.cap + 0.005), sims.map((s) => "d" + s.d + "/" + s.st + "*: " + Math.round(s.after.worstHit * 100) + "%").join(" "));
  rec("Last Stand: lethal hit leaves 1 HP, next hit ignored", sims.every((s) => /hp after lethal 1, after 2nd hit in immunity 1,/.test(s.after.lastStand)), sims[0].after.lastStand);
  rec("boss damage multiplier applied (basic-hit model faster at every tier)", sims.every((s) => s.after.ttkBasic < s.before.ttkBasic), "");
  // 3. live play: gear 5*, Bag chip, cap and Last Stand on the real hero
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 1000, lvl: 1000 }));
  await sleep(300);
  const g5 = await H(page, "bwGear", 5); await sleep(200);
  const full = await H(page, "bwHit", 3.0);
  rec("live: a 300% max-HP hit at full HP only takes the cap", Math.abs(full.took - g5.bw.cap) < 0.01 && full.mode === "play", JSON.stringify({ took: full.took, cap: g5.bw.cap }));
  let low = null; for (let i = 0; i < 4; i++) { low = await H(page, "bwHit", 3.0); if (low.h1 === 1) break; }
  rec("live: lethal hit -> Last Stand 1 HP", low.h1 === 1 && low.mode === "play" && low.log.lastStand >= 1, JSON.stringify(low));
  await page.keyboard.press("i"); await sleep(700);
  const chips = await page.evaluate(() => [...document.querySelectorAll(".dc-chip")].map((e) => e.textContent).filter((t) => /Bulwark|Stars:|Move speed/.test(t)));
  await page.screenshot({ path: OUT + "/bag-bulwark-5star-d1000.png" });
  rec("Bag stats shows Bulwark cap and star bonuses", chips.some((c) => /Prismatic Bulwark .*max hit 45% HP/.test(c)) && chips.some((c) => /Boss dmg x/.test(c)), chips.join(" | "));
  await page.keyboard.press("Escape"); await sleep(300);
  const g10 = await H(page, "bwGear", 10); await sleep(200);
  await page.keyboard.press("i"); await sleep(700);
  await page.screenshot({ path: OUT + "/bag-bulwark-10star-d1000.png" });
  await page.keyboard.press("Escape"); await sleep(200);
  rec("no page errors", errs.length === 0, errs.join(" | "));
  await b.close();
  fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass).length;
  console.log("SUMMARY " + (results.length - f) + "/" + results.length);
  process.exit(f ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
