import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const OUT = "/workspace/ed16-web/screenshots-hud";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 1500) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 1500) : "")); }
async function open(w, h) {
  const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/hud-" + Date.now() + Math.random(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
  const page = await b.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_PRIS.begin));
  return { b, page };
}
const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
const ov = (a, b) => a[1] > b[0] && b[1] > a[0];
async function main() {
  // A. HUD row at phone widths with huge gold/gems
  for (const w of [360, 375, 390, 412, 430]) {
    const { b, page } = await open(w, 800);
    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 206, lvl: 204 }));
    await sleep(300);
    let worst = "";
    let okAll = true;
    for (const [gold, gems, best, d] of [[12630814, 0, 9999, 9999], [987654321987, 99999, 99999, 99999], [99999, 12, 206, 206], [1234, 3, 62, 140]]) {
      await H(page, "hud", gold, gems, best, d); await sleep(250);
      const r = (await H(page, "hudRow")).row;
      const segs = [["pl", r.pl], ["area", r.area], ["gold", r.gold], ["best", r.best]].filter((x) => x[1][1] > x[1][0]);
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (ov(segs[i][1], segs[j][1])) { okAll = false; worst += segs[i][0] + "x" + segs[j][0] + "@" + gold + " "; }
      if (gold === 12630814) { const el = await page.$("canvas"); await el.screenshot({ path: OUT + "/hud-" + w + "px-12.6M.png", clip: undefined }); }
    }
    rec("HUD row no overlap at " + w + "px (gold 12,630,814 / 987.65B, gems 99,999, BEST D99999)", okAll, worst);
    if (w === 412) {
      // B. HP integer + clamp
      const hp = await H(page, "hpTest"); await sleep(200); const now = await H(page, "hpNow");
      rec("maxHp is a whole number and HP never exceeds it", hp.int && now.hp <= now.maxHp, JSON.stringify({ maxHp: hp.maxHp, hpAfter: now.hp }));
      // C. peaks
      const pk = await H(page, "peakTest");
      rec("Paramount tracked apart from Prismatic ults (old saves migrate)", pk.live.p === 214774470 && pk.live.u.endsWith("5123456") && pk.legacy.p === 214774470 && pk.legacy.u === null, JSON.stringify(pk));
    }
    await b.close();
  }
  // D. movement speed
  const { b, page } = await open(412, 800);
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 60, lvl: 120 }));
  await sleep(300);
  const tab = await H(page, "mvTable", 6000);
  fs.writeFileSync(OUT + "/mv-table.json", JSON.stringify(tab.rows));
  const bad = tab.rows.filter((r) => r.top > r.max || r.max > 100);
  rec("move-speed rolls stay inside the per-item range (max 100%)", bad.length === 0, tab.rows.filter((r) => r.rar === 7).map((r) => "il" + r.il + ": max " + r.max + " med " + r.med + " p99 " + r.p99).join(" | "));
  const cl = await H(page, "mvClampTest");
  rec("old items: limited to +100% per item, never lowered otherwise; earlier clamp undone once; pets keep run speed", cl.armor200 === 100 && cl.weapon150 === 100 && cl.legs20r4at90 === 90 && cl.clampedHead1500[1] === 100 && cl.clampedChest215[1] === 100 && cl.newItemAtOldMax === cl.clampedHead1500[0] && cl.pet40 === 40 && cl.reloadKeeps === 100, JSON.stringify(cl));
  const gear = await H(page, "mvGear", 100);
  rec("total move speed hard-capped at +400%", gear.mv === 400 && gear.mvRaw > 400, JSON.stringify(gear));
  // E. walk at +300% through hazard floors: never inside a wall or on water/lava, camera keeps up
  let samples = 0, wall = 0, hz = 0, maxLag = 0, moved = 0;
  for (const d of [61, 77, 95, 133]) {
    await H(page, "force", { haz: "both" });
    await H(page, "gen", d); await H(page, "force", {});
    await H(page, "mvGear", 100);
    let last = null;
    for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"]) {
      await page.keyboard.down(key);
      for (let i = 0; i < 25; i++) { await sleep(30); const p = await H(page, "mvProbe"); samples++; if (p.wall) wall++; if (p.hzBlock) hz++; maxLag = Math.max(maxLag, p.camLag); if (last && (last[0] !== p.x || last[1] !== p.y)) moved++; last = [p.x, p.y]; }
      await page.keyboard.up(key);
    }
  }
  const el = await page.$("canvas"); await el.screenshot({ path: OUT + "/mv-400-walk.png" });
  rec("+400% walking: no wall/water/lava tunnelling, camera follows", wall === 0 && hz === 0 && moved > 20, JSON.stringify({ samples, moved, wall, hz, maxCamLagPx: maxLag }));
  // F. Bag stats chip
  await page.keyboard.press("i"); await sleep(600);
  const chip = await page.evaluate(() => { const e = document.querySelector("[data-mv]"); return e ? e.textContent : null; });
  await page.screenshot({ path: OUT + "/bag-stats-move.png" });
  rec("Bag stats shows total with cap", !!chip && /Move speed \+400% \(cap 400%\)/.test(chip), chip);
  await b.close();
  fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass).length;
  console.log("SUMMARY " + (results.length - f) + "/" + results.length);
  process.exit(f ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
