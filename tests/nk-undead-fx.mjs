// Grave Toll ghosts + Phalanx of the Dead skeletons: visual/audio overhaul screenshots and checks.
// Runs on a COPY of the Richard save; the official file is never written. Throwaway browser profile.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const RICHARD = path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const RICHARD_MD5 = "4c155ae35dc8eacf8dd4ab400adf75a5";
const COPY = "/tmp/richard-boss-COPY-undead.txt";
const SHOTS = "/workspace/ed16-cave-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700) : ""));
  return !!pass;
}
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
async function canvasShot(page, dest) {
  const h = await page.evaluateHandle(() => [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0] || null);
  await h.asElement().screenshot({ path: dest });
  return fs.existsSync(dest) && fs.statSync(dest).size > 1000;
}
// waits (inside the page, frame by frame) for a visual state, then freezes the undead visuals + fx so the shot is mid-effect
const waitFreeze = (page, cond, ms = 15000) => page.evaluate((cond, ms) => new Promise((res) => {
  const N = window.__ED16_NK, t0 = performance.now(), fn = new Function("s", "return (" + cond + ")(s)");
  const f = () => { const s = N.nkvState(); if (fn(s)) { N.nkvFreeze(true); N.holdFx(true); res({ ok: true, s }); } else if (performance.now() - t0 > ms) res({ ok: false, s }); else requestAnimationFrame(f); };
  f();
}), cond, ms);

async function main() {
  rec("official Richard save md5 untouched before the run", md5(RICHARD) === RICHARD_MD5);
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the Richard save", md5(COPY) === RICHARD_MD5, COPY);
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/nk-undead-" + Date.now(), args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
  const FOE = (dx, dy) => page.evaluate((dx, dy) => window.__ED16_PRIS.melee.placeFoe(dx, dy), dx, dy);
  try {
    await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".dc-root");
    await page.waitForFunction(() => !!(window.__ED16_CAVES && window.__ED16_NK && window.__ED16_PRIS));
    const code = fs.readFileSync(COPY, "utf8").replace(/\s+/g, "");
    const loaded = await page.evaluate((c) => window.__ED16_CAVES.load(c), code);
    rec("Richard COPY loaded", !!loaded, loaded && Object.keys(loaded));
    await sleep(800);
    const st0 = await NK("st");
    rec("the save itself carries no necklace data (pre-necklace save)", !st0 || !(st0.own || []).some((x) => x), st0);
    const hero = await NK("hero");
    await NK("genFloorAt", Math.max(101, hero.depth || 101));
    await NK("setOwn", [1, 1, 1, 0, 0, 0, 0, 0]);
    await NK("quietHud");
    await NK("sfxSpy");

    // ---- Phalanx of the Dead: skeletons claw out of cracked earth ----
    await NK("nkvReset");
    rec("equip Phalanx of the Dead", /worn/.test(await NK("equip", 2)));
    let w = await waitFreeze(page, "(s) => s.sk && s.sk.filter(k => k.alive && k.rise > 0.38 && k.rise < 0.62).length >= 4");
    rec("skeletons rise from the ground (mid-rise, crack decals out)", w.ok && w.s.cracks >= 4, w.s && { cracks: w.s.cracks, rise: w.s.sk.map((k) => k.rise) });
    await NK("quietHud");
    rec("wrote skeleton-fx-rise.png", await canvasShot(page, path.join(SHOTS, "skeleton-fx-rise.png")));
    await NK("nkvFreeze", false); await NK("holdFx", false);
    await sleep(1200);
    rec("wrote skeleton-fx-ranks.png (risen, guard pose)", await canvasShot(page, path.join(SHOTS, "skeleton-fx-ranks.png")));
    let heroRange = 0;
    for (const [dx, dy] of [[2, 0], [-2, 1], [1, -2]]) heroRange = (await FOE(dx, dy)).range || heroRange;
    w = await waitFreeze(page, "(s) => s.sk.some(k => k.alive && k.swing > 0.08 && k.swing < 0.3 && Math.hypot(k.ox, k.oy) > 0.25)");
    rec("skeletons stride toward the enemy and wind up the greatsword", w.ok, w.s && w.s.sk);
    await NK("quietHud");
    rec("wrote skeleton-fx-windup.png", await canvasShot(page, path.join(SHOTS, "skeleton-fx-windup.png")));
    await NK("nkvFreeze", false); await NK("holdFx", false);
    w = await waitFreeze(page, "(s) => s.imps.some(p => p > 0.04 && p < 0.2) && s.sk.some(k => k.swing > 0.36 && k.swing < 0.46)");
    rec("greatsword impact: shockwave + debris on the hit", w.ok && w.s.parts > 10, w.s && { imps: w.s.imps, parts: w.s.parts });
    await NK("quietHud");
    rec("wrote skeleton-fx-impact.png", await canvasShot(page, path.join(SHOTS, "skeleton-fx-impact.png")));
    await NK("nkvFreeze", false); await NK("holdFx", false);
    await sleep(1500);
    const skLog = await NK("sfxLog");
    for (const n of ["nkSkRise", "nkSkSmash", "nkSkClack"]) rec("skeleton sound " + n + " played", skLog.some((x) => x.startsWith(n)), [...new Set(skLog)].join(","));

    // ---- Grave Toll: ghosts ----
    await NK("genFloorAt", Math.max(101, hero.depth || 101));
    rec("equip Grave Toll", /worn/.test(await NK("equip", 1)));
    await NK("nkvReset");
    await NK("sfxSpy");
    for (let k = 0; k < 3; k++) await NK("killFrom", "normal");
    w = await waitFreeze(page, "(s) => s.ghosts >= 3 && s.time > 0.6", 5000);
    rec("three kills rise as three ghosts", w.ok, w.s && { ghosts: w.s.ghosts, spawnN: w.s.spawnN });
    await NK("quietHud");
    rec("wrote ghost-fx-apparitions.png", await canvasShot(page, path.join(SHOTS, "ghost-fx-apparitions.png")));
    await NK("nkvFreeze", false); await NK("holdFx", false);
    // foes just outside the hero's own attack range, so the shot shows the ghosts' work rather than the hero's skills
    const far = Math.min(7, (heroRange || 4) + 2);
    for (const [dx, dy] of [[far, 0], [far, -1]]) await FOE(dx, dy);
    console.log("hero range", heroRange, "foes at", far);
    w = await waitFreeze(page, "(s) => s.ghit.some(p => p > 0.06 && p < 0.3)");
    rec("a ghost strike lands with a flash/burst on the enemy", w.ok, w.s && { ghit: w.s.ghit });
    await NK("quietHud");
    rec("wrote ghost-fx-hit.png", await canvasShot(page, path.join(SHOTS, "ghost-fx-hit.png")));
    await NK("nkvFreeze", false); await NK("holdFx", false);
    await sleep(700);
    w = await waitFreeze(page, "(s) => s.ghosts >= 2 && s.ghit.some(p => p > 0.02 && p < 0.14)");
    await NK("quietHud");
    rec("wrote ghost-fx-strike.png (second hit, early flash)", w.ok && await canvasShot(page, path.join(SHOTS, "ghost-fx-strike.png")));
    await NK("nkvFreeze", false); await NK("holdFx", false);
    await sleep(4500);
    const ghLog = await NK("sfxLog");
    for (const n of ["nkGrave", "nkGhostHit", "nkGhostAmb"]) rec("ghost sound " + n + " played", ghLog.some((x) => x.startsWith(n)), [...new Set(ghLog)].join(","));
    rec("no page errors", errors.length === 0, errors);
  } finally {
    rec("official Richard save md5 still untouched after the run", md5(RICHARD) === RICHARD_MD5);
    await browser.close().catch(() => {});
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
