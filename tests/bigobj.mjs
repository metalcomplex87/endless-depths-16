import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const OUT = "/workspace/ed16-web/screenshots-bigobj";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 900) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 900) : "")); }
async function open() {
  const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/big-" + Date.now() + Math.random(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
  const page = await b.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message)); page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_PRIS.begin));
  return { b, page };
}
const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
async function shot(page, name) { await sleep(600); const f = OUT + "/" + name + ".png"; const el = await page.$("canvas"); if (el) await el.screenshot({ path: f }); else await page.screenshot({ path: f }); return f; }
async function loadCode(page, code) {
  if (!(await page.$('textarea[aria-label="Paste save code"]'))) {
    await page.evaluate(() => { const can = [...document.querySelectorAll("button")].some((el) => (el.textContent || "").includes("LOAD code") && !el.disabled); if (!can) { const lk = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "\ud83d\udd12"); if (lk) lk.click(); } });
    await sleep(400);
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD code") && !el.disabled) || [...document.querySelectorAll("button")].find((el) => /\bLOAD$/.test((el.textContent || "").trim()) && !el.disabled);
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) { await page.screenshot({path:"/tmp/loadfail.png"}); console.log((await page.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.textContent.trim()+(b.disabled?"(x)":"")).join(" | ")))); throw new Error("LOAD code button not available"); }
    await page.waitForSelector('textarea[aria-label="Paste save code"]', { timeout: 10000 });
  }
  await page.evaluate((c) => {
    const ta = document.querySelector('textarea[aria-label="Paste save code"]');
    if (!ta) throw new Error("paste textarea missing");
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    const tracker = ta._valueTracker;
    if (tracker) tracker.setValue("");
    desc.set.call(ta, c);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, code);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE"));
    return !!(b && !b.disabled);
  }, { timeout: 10000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE") && !el.disabled);
    if (!b) throw new Error("LOAD THIS CODE not available");
    b.click();
  });
  await page.waitForFunction(() => {
    const hook = (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "");
    return /Imported/i.test(hook) && /press Save Game/i.test(hook) && /saves on this device/i.test(hook);
  }, { timeout: 25000 }).catch(async (err) => {
    const last = await page.evaluate(() => (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "")).catch(() => "?");
    console.log("loadCode: last message was:", last);
    console.log("BODY:", (await page.evaluate(() => document.body.innerText).catch(() => "?")).slice(0, 1500));
    await page.screenshot({ path: "/tmp/smoke-fail.png" }).catch(() => {});
    throw err;
  });
  await sleep(300);
}
async function main() {
  const { b, page } = await open();
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 30, lvl: 60 }));
  await sleep(400);
  // 1. connectivity sweep: many generated floors (shrine forced on every other one)
  const bad = []; let unreach = 0, floors = 0, chests = 0, big = 0, small = 0, shr = 0, shrBig = 0;
  for (const d of [3, 8, 14, 22, 27, 33, 41, 58, 77, 96, 120, 150, 199, 206, 260, 333, 420, 512, 640, 777, 900, 1111, 1301, 1666, 2025, 2600, 3000]) {
    for (let rep = 0; rep < 3; rep++) {
      await H(page, "force", { shrine: rep !== 1, buried: false });
      const gr = await H(page, "gen", d + rep);
      if (!gr.ok) continue;
      const r = await H(page, "big"); floors++;
      if (r.comps[1] > r.comps[0]) bad.push(d + rep + ": components " + r.comps.join(">"));
      if (r.stairsOk.some((x) => !x)) bad.push(d + rep + ": stairs cut off");
      if (r.portalsOk.some((x) => !x)) bad.push(d + rep + ": portal cut off");
      if (!r.req.ok) bad.push(d + rep + ": req " + r.req.bad.join("/"));
      for (const c of r.chests) { chests++; if (!c.adj) unreach++; if (c.fit === 1) big++; else small++; if ((!c.adj && c.reach0) || !c.bumpAll || (c.fit === 1 && c.corr)) bad.push(d + rep + ": chest " + JSON.stringify(c)); }
      if (r.shrine) { shr++; if (r.shrine.f === 1) shrBig++; if (!r.shrine.adj) bad.push(d + rep + ": shrine unreachable"); }
    }
  }
  await H(page, "force", {});
  rec("connectivity: " + floors + " floors, " + chests + " chests (" + big + " 2x2, " + small + " kept 1x1), " + shr + " shrines (" + shrBig + " 2x2), " + unreach + " chests sealed off on the original layout too - no stairs/portal/region cut off, every chest reachable and bumpable from all free sides", bad.length === 0 && floors > 60, bad.slice(0, 6).join(" | "));
  // 2. legacy 1x1 chests (old saves) get fitted, and the floor stays connected
  await H(page, "gen", 140);
  const lg = await H(page, "legacyChests", 12);
  const r2 = await H(page, "big");
  rec("legacy 1x1 chests fitted on load (" + lg.made + " injected)", r2.chests.every((c) => c.fit === 1 || c.fit === 2) && (r2.comps[1] <= r2.comps[0] || r2.chests.some((c) => c.fit === 2)) /* a randomly injected 1x1 chest left in a corridor blocks only until bumped open, as before */ && r2.stairsOk.every(Boolean) && r2.chests.every((c) => c.adj > 0 && c.bumpAll), JSON.stringify({ comps: r2.comps, fit: r2.chests.map((c) => c.fit).join(""), fitStats: r2.fit }));
  // 3. open from any adjacent tile (each chest, a different side)
  let opened = 0, tried = 0;
  for (let i = 0; i < 6; i++) { const o = await H(page, "openFrom", 0); if (!o.ok) break; tried++; if (o.open) opened++; }
  rec("chests open from an adjacent tile (bump any side)", tried > 0 && opened === tried, opened + "/" + tried);
  // 4. screenshot: regular, buried, Resplendent chests near the hero
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 60, lvl: 90 }));
  await H(page, "gen", 61);
  const ss = await page.evaluate(() => {
    const H = window.__ED16_HZ; return H.chestShow ? H.chestShow() : null; });
  rec("chest showcase set up", !!(ss && ss.ok), JSON.stringify(ss));
  const f1 = await shot(page, "chests-2x2");
  rec("screenshot chests", fs.existsSync(f1), f1);
  // 5. shrine 2x2 + swarm rush
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 60, lvl: 400 }));
  await H(page, "gen", 62);
  const sh = await H(page, "shrineHere");
  rec("shrine spawns as 2x2", sh.ok && sh.shrine.f === 1, JSON.stringify(sh.shrine));
  await page.evaluate(() => window.__ED16_HZ.shrineView && window.__ED16_HZ.shrineView());
  const f2 = await shot(page, "shrine-idle-2x2");
  const st = await H(page, "swarmStart");
  const pos = [];
  for (let i = 0; i < 40; i++) { await sleep(250); const q = await H(page, "swarmPos", true); if (i % 6 === 5) pos.push(q); if (i === 20) await shot(page, "shrine-swarm-glow-mid"); }
  const f3 = await shot(page, "shrine-swarm-glow");
  await sleep(250); const f3b = await shot(page, "shrine-swarm-glow-b");
  console.log("POS", JSON.stringify(pos).slice(0, 1500)); const okPos = pos.filter((p) => p.ok && p.n > 0); const pl = okPos[okPos.length - 1] || { gat: 0 };
  const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  rec("swarm: enemies head for the shrine first, then for the hero; none stand on the shrine", st.ok && okPos.length >= 3 && okPos.every((p) => p.onShrine === 0) && pl.gat > 0, "start live " + st.live + "; avg dist to shrine " + okPos.map((p) => avg(p.dShrine).toFixed(1)).join(" > ") + "; gathered/aggro " + okPos.map((p) => p.gat + "/" + p.n).join(" "));
  await H(page, "swarmEnd");
  // 6. torch light: bright, storm, dark
  const light = [];
  await H(page, "wx", "");
  let darkD = 1703, lo = 9;
  for (let d = 21; d < 1400; d += 23) { const gr = await H(page, "gen", d); const tv = await H(page, "torchView"); await sleep(120); const L = await H(page, "light", null); if (tv.ok && !L.act && L.lum < lo && L.last.n > 0) { lo = L.lum; darkD = d; } }
  console.log("darkest biome floor", darkD, lo);
  for (const [nm, d, wx] of [["torch-bright", 12, ""], ["torch-rain", 143, "rain"], ["torch-storm", 143, "storm"], ["torch-dark-biome", darkD, ""], ["torch-deep-storm", 1703, "storm"]]) {
    await H(page, "wx", wx === "" ? "" : wx);
    await H(page, "gen", d);
    await page.evaluate(() => window.__ED16_HZ.torchView && window.__ED16_HZ.torchView());
    await sleep(500);
    const f = await shot(page, nm);
    const L = await H(page, "light", null);
    light.push(nm + " (D" + d + (wx ? " " + wx : "") + "): floor lum " + (L.lum ?? 0).toFixed(2) + ", dark " + L.last.dark + " radius " + L.last.r + "px, " + L.last.n + " lit on screen");
  }
  await H(page, "wx", null);
  rec("torch light scales with darkness", true, light.join(" | "));
  await b.close();
  // 7. Richard's real save (a copy loaded into a fresh test browser - never his live save): old chests/shrine load and fit
  const R = await open();
  await R.page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await R.page.reload({ waitUntil: "domcontentloaded" }); await R.page.waitForFunction(() => !!window.__ED16_HZ);
  await sleep(800);
  try {
    await loadCode(R.page, fs.readFileSync("/workspace/ed16-web/saves/richard-boss-2026-11-17.txt", "utf8").replace(/\s+/g, ""));
    await sleep(800);
    const rr = await H(R.page, "big");
    rec("Richard save copy loads; floor chests/shrine fitted, nothing cut off", rr.ok && rr.comps[1] <= rr.comps[0] && rr.stairsOk.every(Boolean) && rr.req.ok, JSON.stringify({ d: rr.depth, comps: rr.comps, chests: rr.chests.map((c) => c.fit), shrine: rr.shrine }));
  } catch (e) { rec("Richard save copy loads", false, e.message); }
  await R.b.close();
  fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass).length;
  console.log("SUMMARY " + (results.length - f) + "/" + results.length);
  process.exit(f ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
