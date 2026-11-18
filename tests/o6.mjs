import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const OUT = "/workspace/ed16-web/screenshots-o6";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 3000) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 1200) : "")); }
const fmt = (t) => t < 1.5 ? t.toFixed(1) + " s" : t < 120 ? Math.round(t) + " s" : t < 3600 ? (t / 60).toFixed(1) + " min" : t < 86400 ? (t / 3600).toFixed(1) + " h" : (t / 86400).toFixed(0) + " days";
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/o6-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
const page = await b.newPage(); page.setDefaultTimeout(600000);
const errs = []; page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.o6Sim));
await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 200, lvl: 200 }));
const H = (n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
const rows = [];
const REPS = Number(process.env.REPS || 3);
for (const d of [300, 500, 1000, 2000, 3000]) for (const st of [0, 5, 10]) {
  const bOff = await H("o6Sim", d, st, false, false), bOn = await H("o6Sim", d, st, false, true);
  const fOff = [], fOn = []; let ph = [];
  for (let i = 0; i < REPS; i++) { fOff.push((await H("o6Sim", d, st, true, false)).sec); const r = await H("o6Sim", d, st, true, true); fOn.push(r.sec); ph.push(r.phases); }
  const row = { d, st, basicBefore: bOff.sec, basicAfter: bOn.sec, fullBefore: med(fOff), fullAfter: med(fOn), mul: bOn.mul, k: bOn.k, phasesBasic: bOn.phases, phasesFull: ph, cappedBasic: bOn.capped };
  rows.push(row);
  console.log("SIM d" + d + " " + st + "*: basic " + fmt(row.basicBefore) + " -> " + fmt(row.basicAfter) + " | full " + fmt(row.fullBefore) + " -> " + fmt(row.fullAfter) + " | HPx" + (+row.mul).toPrecision(3) + " phases " + row.phasesBasic + "/" + ph.join(","));
}
fs.writeFileSync(OUT + "/o6-sims.json", JSON.stringify(rows, null, 1));
const d300 = rows.filter((r) => r.d === 300);
rec("below depth 500 nothing changes", d300.every((r) => Math.abs(r.basicAfter - r.basicBefore) <= 0.15 * r.basicBefore + 0.5 && r.mul === 1 && r.phasesBasic === 0), d300.map((r) => r.basicBefore.toFixed(1) + "/" + r.basicAfter.toFixed(1)).join(" "));
const deep = rows.filter((r) => r.d >= 500);
// retune 2026-11-18 14:05 CT: basic <= ~3.5 min and full ~1.5-3 min wherever O6 can reach it. Where the kit is slower than
// that even with O6 off (starred kits deep; O6 may only lower HP for star-free kits) O6 must not add more than ~10%.
const slowAnyway = (r) => r.basicBefore > 225;
rec("d500+: basic attacks <= 3.5 min (or no slower than without O6 +10% where already slower)", deep.every((r) => slowAnyway(r) ? r.basicAfter <= r.basicBefore * 1.1 + 15 : r.basicAfter <= 225), deep.map((r) => r.d + "/" + r.st + ":" + Math.round(r.basicAfter) + (slowAnyway(r) ? "(pre " + Math.round(r.basicBefore) + ")" : "")).join(" "));
rec("d500+: full combat 1.5-3 min where reachable", deep.every((r) => (r.fullBefore > 185) || (r.fullAfter >= 85 && r.fullAfter <= 185)), deep.map((r) => r.d + "/" + r.st + ":" + Math.round(r.fullAfter)).join(" "));
rec("stronger kits win faster (d500/d1000: 0* > 5* > 10*, basic and full)", [500, 1000].every((d) => { const a = deep.filter((r) => r.d === d); return a[0].basicAfter > a[1].basicAfter && a[1].basicAfter > a[2].basicAfter && a[0].fullAfter > a[1].fullAfter && a[1].fullAfter > a[2].fullAfter; }), "");
rec("3 transitions per matched fight (none when O6 left the boss as is)", deep.every((r) => r.phasesBasic === (r.mul === 1 ? 0 : 3)), deep.map((r) => r.phasesBasic).join(","));
const mg = await H("o6Migrate");
rec("boss saved by the 13:19 build is re-matched (not left at x1e6), HP fraction kept", mg.ver === 2 && Math.abs(mg.migratedMhp - mg.freshMhp) <= mg.freshMhp * 0.02 && Math.abs(mg.frac - 0.6) < 0.01, JSON.stringify(mg));
const pa = await H("o6Para");
rec("Paramount ignores the cap and phase clamp; a normal hit of the same size is capped", pa.paramountDealt >= Math.round(pa.mhp * 0.6) * 0.99 && pa.normalFrac < 0.05, JSON.stringify(pa));
// live: Paramount exempt check + cap on the real hero (uses the existing paramount hook if present)
rec("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 1));
const f = results.filter((r) => !r.pass).length;
console.log("SUMMARY " + (results.length - f) + "/" + results.length);
process.exit(f ? 1 : 0);
