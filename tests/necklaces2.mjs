// Eternum necklaces, part 2: real kill()/openChest() for the remaining sources, Prismatic via the real kill path,
// beam column check, two-at-once with Prismatic. Throwaway headless profile only.
import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50263/";
const OUT = "/workspace/ed16-web/screenshots-necklaces";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 3000) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 600) : "")); }
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/nk-verify2-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"], protocolTimeout: 600000 });
const page = await b.newPage(); page.setDefaultTimeout(600000);
const errs = []; page.on("pageerror", (e) => { errs.push(e.message); });
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK));
const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 150, lvl: 300 }));
await NK("gear", "full");
const C = await NK("consts");
// real kill() for the remaining sources (boosted to the cap)
await NK("setBase", 10, 10); await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]); await NK("setDepth", 120);
for (const k of ["rare", "super", "ultra", "royal", "king", "mini21", "mini32", "act20", "act31", "act23"]) {
  const tot = [0, 0, 0, 0, 0, 0, 0, 0]; let src = "";
  const n = k.startsWith("act") ? 50 : 100;
  for (let i = 0; i < n; i++) { const r = await NK("killFrom", k); src = r.src; r.drops.forEach((v, j) => tot[j] += v); }
  rec("real kill() of " + src + " (x" + n + ", depth 120) drops all seven, no Prismatic", tot.slice(0, 7).every((v) => v > 0) && tot[7] === 0, tot.join("/"));
  await NK("clearGround"); await NK("clearBanner");
}
for (let r0 = 0; r0 < 5; r0++) {
  const tot = [0, 0, 0, 0, 0, 0, 0, 0]; let src = "";
  for (let i = 0; i < 100; i++) { const r = await NK("openChestFrom", r0, true); src = r.src; r.drops.forEach((v, j) => tot[j] += v); }
  rec("real openChest() " + src + " (x100, depth 120) drops all seven", tot.slice(0, 7).every((v) => v > 0) && tot[7] === 0, tot.join("/"));
  await NK("clearGround"); await NK("clearBanner");
}
// Prismatic Eternum through the real kill()/openChest() path
const peKill = async (kinds, n) => { let pe = 0; for (const k of kinds) for (let i = 0; i < n; i++) { const r = k.startsWith("chest") ? await NK("openChestFrom", Number(k[5])) : await NK("killFrom", k); pe += r.drops[7]; } return pe; };
const KS = ["normal", "elite", "goblin", "mini33", "act10", "act33", "chest0", "chest4"];
await NK("setOwn", [1, 1, 1, 1, 1, 1, 0, 0]); await NK("setDepth", 600);
rec("real kills/chests: no Prismatic Eternum with 6/7 owned (boosted, depth 600)", (await peKill(KS, 15)) === 0, "");
await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]); await NK("setDepth", 100);
rec("real kills/chests: no Prismatic Eternum at depth 100 even with all seven owned", (await peKill(KS, 15)) === 0, "");
await NK("setDepth", 101);
for (const k of KS) {
  await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]);
  const pe = await peKill([k], 15);
  rec("real " + (k.startsWith("chest") ? "openChest() " : "kill() ") + k + " at depth 101 with all seven owned: Prismatic Eternum drops", pe === 1, "PE drops " + pe + " (one at a time)");
}
await NK("clearGround"); await NK("clearBanner"); await NK("setBase", C.NK_BASE, C.NK_BASE_E);
// beam: per-column check (a beam is a vertical band of gem colour reaching the top of the view)
const colScan = (hex, rainbow) => page.evaluate((hex, rainbow) => {
  const cv = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cv.getContext("2d"); const y0 = Math.floor(cv.height * 0.06), h = Math.floor(cv.height * 0.3);
  const d = ctx.getImageData(0, y0, cv.width, h).data, W = cv.width;
  const tr = parseInt(hex.slice(1, 3), 16), tg = parseInt(hex.slice(3, 5), 16), tb = parseInt(hex.slice(5, 7), 16);
  const col = new Array(W).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4, r = d[k], g = d[k + 1], bb = d[k + 2], mx = Math.max(r, g, bb), mn = Math.min(r, g, bb);
    if (rainbow ? (mx - mn > 70 && mx > 140) : (Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(bb - tb) < 170 && mx > 110)) col[x]++; }
  let best = 0, bx = 0; for (let x = 0; x + 8 < W; x++) { let s = 0; for (let j = 0; j < 8; j++) s += col[x + j]; if (s / (8 * h) > best) { best = s / (8 * h); bx = x; } }
  return { frac: +best.toFixed(3), x: bx, w: W };
}, hex, rainbow);
await NK("clearGround"); await NK("clearBanner"); await sleep(400);
const base = []; for (let i = 0; i < 8; i++) base.push(await colScan(C.colors[i], i === 7));
for (let i = 0; i < 8; i++) {
  await NK("clearGround"); await NK("clearBanner"); await NK("setOwn", i === 7 ? [1, 1, 1, 1, 1, 1, 1, 0] : [0, 0, 0, 0, 0, 0, 0, 0]); await NK("sfxSpy");
  await NK("drop", i, 0, -2); const ban = await NK("banner"); const ch = (await NK("sfxLog")).filter((x) => x.startsWith("nkChime")).length;
  await sleep(600);
  const c = await colScan(C.colors[i], i === 7);
  await page.screenshot({ path: OUT + "/beam2-" + i + ".png" });
  rec("drop " + C.names[i] + ": colour-coded alert + chime (beam itself: necklaces3.mjs + _nkbeam.py screenshot diff; canvas column fill shown for info)", ban && (i === 7 ? /PRISMATIC ETERNUM!/ : /ETERNUM NECKLACE DROPPED/).test(ban.txt) && ban.c === C.colors[i] && ban.nk === i && ch >= 1,
    "beam column fill " + c.frac + " (without necklace " + base[i].frac + "), alert " + (ban && ban.txt) + " " + (ban && ban.c) + ", chimes " + ch);
}
await NK("clearGround"); await NK("clearBanner");
// two at once with Prismatic (start from nothing worn)
await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 1]);
const m = [await NK("equip", 7), await NK("equip", 0), await NK("equip", 4)]; const s = await NK("st");
rec("with Prismatic Eternum two are worn at once", s.pe && s.eq.length === 2 && s.eq.includes(0) && s.eq.includes(4), JSON.stringify({ m, eq: s.eq }));
const m2 = await NK("equip", 5); const s2 = await NK("st");
rec("a third necklace swaps out the oldest (still two)", s2.eq.length === 2 && s2.eq.includes(5), JSON.stringify({ m2, eq: s2.eq }));
rec("no page errors", errs.length === 0, errs.join(" | "));
fs.writeFileSync(OUT + "/verify2.json", JSON.stringify(results, null, 1));
await b.close();
const f = results.filter((r) => !r.pass).length;
console.log("SUMMARY " + (results.length - f) + "/" + results.length);
process.exit(f ? 1 : 0);
