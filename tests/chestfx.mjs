import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const TAG = process.env.TAG || "after";
const OUT = "/workspace/ed16-web/screenshots-chests";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/cf-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
const page = await b.newPage(); page.setDefaultTimeout(120000);
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.chestShow));
const H = (n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n] ? window.__ED16_HZ[n](...a) : null, n, a);
async function shot(name) { await sleep(700); const el = await page.$("canvas"); await el.screenshot({ path: OUT + "/" + TAG + "-" + name + ".png" }); }
const out = {};
const K = (l) => page.evaluate(() => Object.keys(window.__ED16_HZ).length).then((n) => console.log("KEYS", l, n));
await K("load");
for (const [nm, d, wx] of [["bright", 61, ""], ["dark-storm", 1703, "storm"]]) {
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 60, lvl: 120 }));
  await K("begin"); await H("wx", wx); await H("gen", d); await K("gen");
  out[nm + "-mixed"] = await H("chestShow"); await shot(nm + "-normal-magic-buried-mythic");
  const all = await page.evaluate(() => { const h = window.__ED16_HZ; return h.chestShowAll ? h.chestShowAll() : ("missing:" + Object.keys(h).length); }); console.log("ALL", JSON.stringify(all)); if (all) { out[nm + "-all"] = all; await shot(nm + "-all-rarities"); }
}
// frame timing with 5 chests on screen
const ft = await page.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const f = (n) => { ts.push(n - last); last = n; if (ts.length < 120) requestAnimationFrame(f); else res({ max: Math.max(...ts.slice(5)), avg: ts.slice(5).reduce((a, b) => a + b, 0) / (ts.length - 5) }); }; requestAnimationFrame(f); }));
console.log(JSON.stringify({ TAG, out, frame: ft, errs }));
await b.close();
