// Beam check by frame difference: with vs without the necklace on the ground (throwaway headless profile).
import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50263/";
const OUT = "/workspace/ed16-web/screenshots-necklaces";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail }); console.log((pass ? "PASS" : "FAIL") + "  " + step + "  --  " + detail); }
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/nk-verify3-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
const page = await b.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK));
const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 150, lvl: 300 }));
const C = await NK("consts");
const grab = () => page.evaluate(() => { const cv = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const y0 = Math.floor(cv.height * 0.03), h = Math.floor(cv.height * 0.15); window.__nkImg = { d: Array.from(cv.getContext("2d").getImageData(0, y0, cv.width, h).data), w: cv.width, h }; return true; });
for (let i = 0; i < 8; i++) {
  await NK("clearGround"); await NK("setOwn", i === 7 ? [1, 1, 1, 1, 1, 1, 1, 0] : [0, 0, 0, 0, 0, 0, 0, 0]);
  await sleep(600); await page.screenshot({ path: OUT + "/beam3-base-" + i + ".png" });
  await NK("drop", i, 0, -2); await sleep(600); await page.screenshot({ path: OUT + "/beam3-" + i + ".png" });
}
rec("no page errors", errs.length === 0, errs.join(" | "));
fs.writeFileSync(OUT + "/verify3.json", JSON.stringify(results, null, 1));
await b.close();
console.log(JSON.stringify(C.colors));
