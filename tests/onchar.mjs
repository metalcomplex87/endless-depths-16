import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "onchar");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/onchar-" + Date.now();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => !!(window.__ED16_PRIS && window.__ED16_PRIS.begin))) break;
    await sleep(250);
  }
  if (!(await page.evaluate(() => !!(window.__ED16_PRIS && window.__ED16_PRIS.begin)))) throw new Error("pris hook missing");
  return { browser, page, userDir };
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PRIS;
    if (!hook || typeof hook[n] !== "function") return hook && hook[n] !== undefined ? hook[n] : { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function kit(page) {
  await api(page, "begin", { depth: 10, lvl: 10 });
  await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
  await api(page, "give", "armor", { slot: "chest", armor: "chest", stars: 5 });
  await api(page, "give", "armor", { slot: "head", armor: "head", stars: 5 });
  await api(page, "give", "armor", { slot: "arms", armor: "arms", stars: 5 });
  await api(page, "give", "armor", { slot: "legs", armor: "legs", stars: 5 });
  await api(page, "give", "pet", { slot: "pet", stars: 5 });
  try { await api(page, "quiet"); } catch { /* optional */ }
}

async function main() {
  const { browser, page, userDir } = await launch();
  try {
    await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });

    const sparkles = await page.evaluate(() => window.__ED16_PRIS.spriteSparkles);
    record("on-sprite prismatic shimmer sparkles are removed", sparkles === 0, "spriteSparkles=" + sparkles);

    const hero7 = await api(page, "auraSpec", 7, true);
    const item7 = await api(page, "auraSpec", 7, false);
    const hero6 = await api(page, "auraSpec", 6, true);
    record("prismatic hero aura keeps the soft disc/ring but drops orbiting and rising motes",
      !!(hero7 && hero7.disc && hero7.ring && !hero7.px1 && !hero7.rise2 && !hero7.orbit2),
      JSON.stringify(hero7));
    record("prismatic ground-item auras still have their rainbow motes",
      !!(item7 && item7.orbit2 && item7.rise2 && item7.disc),
      JSON.stringify(item7));
    record("relic (non-prismatic) hero aura still has its rising motes",
      !!(hero6 && hero6.rise2 && !hero6.orbit2 && hero6.disc),
      JSON.stringify(hero6));

    // Existing pris inspect: tint still shimmers, weapon arcs still exist, no rect
    const armV = await api(page, "inspect", "armor");
    const wepV = await api(page, "inspect", "wep");
    const petV = await api(page, "inspect", "pet");
    record("prismatic armor still hue-cycles without a bounding box", !!(armV && armV.ok && !armV.hasRect && armV.shimmer > 10), JSON.stringify({ shimmer: armV && armV.shimmer, hasRect: armV && armV.hasRect, outside: armV && armV.outsidePx }));
    record("prismatic weapon arcs still flash off the sprite", !!(wepV && wepV.ok && wepV.outsidePx >= 8 && !wepV.hasRect), "outsidePx=" + (wepV && wepV.outsidePx));
    record("prismatic pet still tints without a box", !!(petV && petV.ok && !petV.hasRect && petV.shimmer > 0), "shimmer=" + (petV && petV.shimmer));

    const arc = await page.evaluate(() => window.__ED16_PRIS.arc);
    record("lightning arc timing is unchanged (1.5–5s gaps, ~65ms flash)",
      !!(arc && arc.FLASH === 0.065 && arc.GAP_MIN === 1.5 && arc.GAP_MAX === 5 && arc.N === 3),
      JSON.stringify(arc));
    record("rainbow drips stay removed", !!(arc && arc.SPARK_SLOTS == null), JSON.stringify(arc));

    await kit(page);
    const pieces = await api(page, "pieces");
    const TS = 24, margin = 20, minR = 1.5 * TS, maxR = 3 * TS;
    const gl = await api(page, "glints", 1.85, 160, 150, minR, maxR, margin, 30 + margin, 320 - margin, 230);
    record("hovering rainbow glints still match the equipped prismatic count",
      !!(pieces && pieces.n >= 6 && gl && gl.ok && gl.n === pieces.n && (gl.glints || []).every((g) => g.dist >= minR - 2)),
      JSON.stringify({ pieces: pieces && pieces.n, glints: gl && gl.n, dists: (gl.glints || []).map((g) => +g.dist.toFixed(1)) }));

    await api(page, "setTime", 1.85, true);
    await api(page, "openInv", true);
    await sleep(150);
    const bag = path.join(SHOTS, "after-bag-412x780.png");
    const wrap = await page.$(".dc-wrap");
    if (wrap) await wrap.screenshot({ path: bag });
    const portPath = path.join(SHOTS, "after-portrait.png");
    const port = await page.$("canvas.dc-port");
    if (port) await port.screenshot({ path: portPath });
    record("after bag preview screenshot", fs.existsSync(bag) && fs.statSync(bag).size > 2000, bag + " " + (fs.existsSync(bag) ? fs.statSync(bag).size : 0));
    record("after portrait screenshot", fs.existsSync(portPath) && fs.statSync(portPath).size > 400, portPath + " " + (fs.existsSync(portPath) ? fs.statSync(portPath).size : 0));

    await api(page, "openInv", false);
    await api(page, "setTime", 1.85, true);
    await sleep(150);
    const play = path.join(SHOTS, "after-ingame.png");
    const cv = await page.$("canvas");
    if (cv) await cv.screenshot({ path: play });
    const crop = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return null;
      const w = Math.min(160, c.width), h = Math.min(160, c.height);
      const x = Math.max(0, (c.width - w) / 2), y = Math.max(0, (c.height - h) / 2 - 10);
      const o = document.createElement("canvas");
      o.width = w; o.height = h;
      const xctx = o.getContext("2d");
      xctx.imageSmoothingEnabled = false;
      xctx.drawImage(c, x, y, w, h, 0, 0, w, h);
      return o.toDataURL();
    });
    const heroPath = path.join(SHOTS, "after-ingame-hero.png");
    if (crop) fs.writeFileSync(heroPath, Buffer.from(crop.replace(/^data:image\/\w+;base64,/, ""), "base64"));
    record("after in-game screenshot", fs.existsSync(play) && fs.statSync(play).size > 2000, play + " " + (fs.existsSync(play) ? fs.statSync(play).size : 0));
    record("after in-game hero crop", fs.existsSync(heroPath) && fs.statSync(heroPath).size > 400, heroPath + " " + (fs.existsSync(heroPath) ? fs.statSync(heroPath).size : 0));

    const beforeHero = path.join(SHOTS, "before-ingame-hero.png");
    record("before in-game hero crop is present for comparison", fs.existsSync(beforeHero) && fs.statSync(beforeHero).size > 400, beforeHero);

    await api(page, "setTime", 0, false);
    await api(page, "end");
  } catch (err) {
    try { await api(page, "end"); } catch { /* ignore */ }
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  const failed = results.filter((r) => !r.pass);
  console.log("ONCHAR " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
