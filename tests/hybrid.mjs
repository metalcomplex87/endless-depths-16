import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const HYBRID_CODE = fs.readFileSync("/workspace/ed16test/hybrid_save_code.txt", "utf8").trim();

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/hybrid-" + Date.now();
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
  const url = BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  let hook = null;
  for (let i = 0; i < 40; i++) {
    hook = await page.evaluate(() => ({ save: typeof (window.__ED16_SAVE && window.__ED16_SAVE.decode), gibs: typeof window.__ED16_GIBS, keys: Object.keys(window).filter((k) => k.startsWith("__ED16")) }));
    if (hook.save === "function") break;
    await sleep(250);
  }
  if (hook.save !== "function") throw new Error("save hook missing: " + JSON.stringify(hook));
  return { browser, page };
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_SAVE;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

function cleanCamp(r, expectDepth) {
  if (!r || !r.ok) return false;
  if (r.area !== "camp") return false;
  if (expectDepth != null && r.depth !== expectDepth) return false;
  if (r.boss || r.enemies > 0) return false;
  if (!r.campLayout || r.hybrid) return false;
  if (r.stairs && r.stairs.up > 0) return false;
  if (!r.fireAt || !r.restAt || !r.stashAt || !r.merchant) return false;
  if (!r.canLeaveCamp || (r.portal && r.portal.kind !== "proceed")) return false;
  return true;
}

function normalBoss(r, { cleared = false, depth = 5 } = {}) {
  if (!r || !r.ok) return false;
  if (r.area !== "dungeon") return false;
  if (r.depth !== depth) return false;
  if (r.campLayout || r.fireAt || r.restAt || r.stashAt) return false;
  if (cleared) return !!(r.canEnterCamp && r.portal && r.portal.kind === "camp");
  return !!r.boss;
}

async function main() {
  const { browser, page } = await launch();
  try {
    // Real user save: camp+boss hybrid must load as a playable camp.
    const real = await api(page, "decode", HYBRID_CODE);
    record("real-hybrid-decodes", !!(real && real.ok), JSON.stringify({ area: real.area, depth: real.depth, boss: real.boss, stairs: real.stairs, portal: real.portal, hybrid: real.hybrid, actCleared: real.actCleared }));
    record("real-hybrid-repaired-to-camp", cleanCamp(real, 90), JSON.stringify(real));
    record("real-hybrid-hero-on-floor", !!(real && real.ok && real.tile !== 0), `tile=${real && real.tile} at ${real && real.hx},${real && real.hy}`);

    const left = await api(page, "leaveCamp");
    record("real-hybrid-leave-camp", !!(left && left.ok && left.area === "dungeon" && left.depth === 91 && !left.campLayout && !left.hybrid), JSON.stringify({ area: left.area, depth: left.depth, campLayout: left.campLayout, hybrid: left.hybrid, boss: left.boss }));

    const relive = await api(page, "reload");
    record("real-hybrid-after-leave-reload", !!(relive && relive.ok && relive.area === "dungeon" && relive.depth === 91 && !relive.campLayout && !relive.hybrid), JSON.stringify({ area: relive.area, depth: relive.depth, campLayout: relive.campLayout, hybrid: relive.hybrid }));

    // Boss floor, boss alive: save/reload stays a boss floor.
    const alive = await api(page, "setupBoss", false);
    record("boss-alive-setup", normalBoss(alive, { cleared: false, depth: 5 }), JSON.stringify(alive));
    const aliveRel = await api(page, "reload");
    record("boss-alive-save-reload", normalBoss(aliveRel, { cleared: false, depth: 5 }), JSON.stringify(aliveRel));
    const afterKill = await api(page, "killBoss");
    record("boss-alive-then-kill-unlocks-camp", !!(afterKill && afterKill.ok && afterKill.area === "dungeon" && afterKill.canEnterCamp && afterKill.portal && afterKill.portal.kind === "camp" && !afterKill.boss), JSON.stringify(afterKill));

    // Boss floor, boss already dead / cleared: reload keeps exits/camp available.
    const dead = await api(page, "setupBoss", true);
    record("boss-dead-setup", normalBoss(dead, { cleared: true, depth: 5 }), JSON.stringify(dead));
    const deadRel = await api(page, "reload");
    record("boss-dead-save-reload-camp-unlocked", !!(deadRel && deadRel.ok && deadRel.area === "dungeon" && deadRel.canEnterCamp && deadRel.portal && deadRel.portal.kind === "camp" && !deadRel.campLayout), JSON.stringify(deadRel));

    // Camp floor: save/reload is a normal camp, no boss lock.
    const camp = await api(page, "setupCamp");
    record("camp-setup", cleanCamp(camp, 5), JSON.stringify(camp));
    const campRel = await api(page, "reload");
    record("camp-save-reload", cleanCamp(campRel, 5), JSON.stringify(campRel));
    record("camp-reload-no-boss-lock", !!(campRel && !campRel.boss && campRel.canLeaveCamp && !campRel.canEnterCamp), `canEnterCamp=${campRel && campRel.canEnterCamp}`);

    // Multiple save -> reload -> progress cycles.
    const c1 = await api(page, "setupCamp");
    const c1r = await api(page, "reload");
    const c1l = await api(page, "leaveCamp");
    const c1lr = await api(page, "reload");
    const cycle1 = c1 && cleanCamp(c1r, 5) && c1l && c1l.area === "dungeon" && c1l.depth === 6 && c1lr && c1lr.area === "dungeon" && c1lr.depth === 6 && !c1lr.hybrid;
    record("cycle-camp-reload-leave-reload", cycle1, JSON.stringify({ c1r: { area: c1r.area, depth: c1r.depth }, c1l: { area: c1l.area, depth: c1l.depth }, c1lr: { area: c1lr.area, depth: c1lr.depth, hybrid: c1lr.hybrid } }));

    const b2 = await api(page, "setupBoss", false);
    const b2r = await api(page, "reload");
    const b2k = await api(page, "killBoss");
    const b2kr = await api(page, "reload");
    const b2c = await api(page, "enterCamp");
    const b2cr = await api(page, "reload");
    const cycle2 = normalBoss(b2r, { cleared: false, depth: 5 }) && b2k && b2k.canEnterCamp && b2kr && b2kr.canEnterCamp && cleanCamp(b2c, 5) && cleanCamp(b2cr, 5);
    record("cycle-boss-reload-kill-reload-camp-reload", cycle2, JSON.stringify({ b2kr: { area: b2kr.area, canEnterCamp: b2kr.canEnterCamp, portal: b2kr.portal }, b2cr: { area: b2cr.area, boss: b2cr.boss, stairs: b2cr.stairs, canLeaveCamp: b2cr.canLeaveCamp } }));

    // Synthetic corrupted hybrid is repaired.
    const hy = await api(page, "makeHybrid");
    const beforeBad = !!(hy && hy.before && (hy.before.boss || (hy.before.stairs && hy.before.stairs.up > 0) || hy.before.hybrid || hy.before.area === "camp"));
    record("synthetic-hybrid-before-is-corrupt", beforeBad, JSON.stringify(hy && hy.before));
    record("synthetic-hybrid-repaired", !!(hy && hy.after && cleanCamp(hy.after, 10)), JSON.stringify(hy && hy.after));

    await api(page, "end");
  } catch (err) {
    record("suite-error", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log("\nHYBRID  " + pass + " passed, " + fail + " failed, " + results.length + " total");
  process.exit(fail ? 1 : 0);
}

main();
