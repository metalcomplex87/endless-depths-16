import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "pris");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/pris-" + Date.now();
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
    hook = await page.evaluate(() => ({
      pris: typeof (window.__ED16_PRIS && window.__ED16_PRIS.begin),
      pets: typeof (window.__ED16_PETS && window.__ED16_PETS.begin),
      keys: Object.keys(window).filter((k) => k.startsWith("__ED16")),
    }));
    if (hook.pris === "function") break;
    await sleep(250);
  }
  if (hook.pris !== "function") throw new Error("pris hook missing: " + JSON.stringify(hook));
  return { browser, page };
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PRIS;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function petsApi(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PETS;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function shotCard(page, file, title) {
  const data = await petsApi(page, "shot", "dual");
  const dest = path.join(SHOTS, file);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  await page.evaluate((payload, heading) => {
    document.querySelectorAll("#ed16-pets-shot").forEach((el) => el.remove());
    const wrap = document.createElement("div");
    wrap.id = "ed16-pets-shot";
    wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:#120c18;color:#f4ecff;font:13px/1.35 sans-serif;padding:16px;overflow:hidden;";
    const h = document.createElement("div");
    h.style.cssText = "font-size:16px;font-weight:800;color:#ffd060;margin-bottom:10px;";
    h.textContent = heading;
    wrap.appendChild(h);
    if (payload.portrait) {
      const img = document.createElement("img");
      img.src = payload.portrait;
      img.style.cssText = "image-rendering:pixelated;width:160px;height:auto;background:#14101c;border:2px solid #6a4a9a;margin-bottom:10px;";
      wrap.appendChild(img);
    }
    const meta = document.createElement("div");
    meta.style.marginBottom = "8px";
    meta.textContent = (payload.petName || "") + (payload.rare ? "  ·  RARE TRAIT" : "") +
      (payload.rh || payload.lh ? "  ·  RH " + (payload.rh || "—") + "  /  LH " + (payload.lh || "—") : "") +
      (payload.atk ? "  ·  ATK " + payload.atk : "");
    wrap.appendChild(meta);
    (payload.lines || []).forEach((line) => {
      const d = document.createElement("div");
      d.textContent = line;
      if (String(line).indexOf("✦ RARE") === 0 || String(line).indexOf("\u2726 RARE") === 0) {
        d.style.cssText = "color:#ffd060;font-weight:800;text-shadow:0 0 6px #ff60e0;margin-top:6px;";
      } else {
        d.style.cssText = "color:#e8d8ff;margin-top:3px;";
      }
      wrap.appendChild(d);
    });
    document.body.appendChild(wrap);
  }, data, title);
  await sleep(200);
  await page.screenshot({ path: dest, type: "png" });
  await page.evaluate(() => document.querySelectorAll("#ed16-pets-shot").forEach((el) => el.remove()));
  const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  return { path: dest, size, data };
}

async function main() {
  const { browser, page } = await launch();
  try {
    await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });

    // --- Visuals: no rectangle, weapon arcs, armor shimmer ---
    const petV = await api(page, "inspect", "pet");
    const wepV = await api(page, "inspect", "wep");
    const armV = await api(page, "inspect", "armor");
    record("no rectangle around prismatic pet", !!(petV && petV.ok && !petV.hasRect), JSON.stringify({ hasRect: petV.hasRect, outside: petV.outsidePx }));
    record("no rectangle around prismatic weapon", !!(wepV && wepV.ok && !wepV.hasRect), JSON.stringify({ hasRect: wepV.hasRect, outside: wepV.outsidePx }));
    record("no rectangle around prismatic armor", !!(armV && armV.ok && !armV.hasRect), JSON.stringify({ hasRect: armV.hasRect, outside: armV.outsidePx }));
    record("prismatic weapon has crackling arcs off the sprite", !!(wepV && wepV.outsidePx >= 8), "outsidePx=" + (wepV && wepV.outsidePx));
    record("prismatic armor shimmers on the sprite", !!(armV && armV.shimmer > 10), "shimmer=" + (armV && armV.shimmer));
    record("prismatic pet keeps on-sprite effect without a box", !!(petV && !petV.hasRect && petV.shimmer > 0), "shimmer=" + (petV && petV.shimmer));

    // Before/after of the same Dual Titan pet portrait
    await petsApi(page, "begin");
    await petsApi(page, "give", "pet", { slot: "pet", pab: 6, prt: 1, stars: 3 });
    await petsApi(page, "give", "2h", { slot: "rh", wep: "greatsword" });
    await petsApi(page, "give", "2h", { slot: "lh", wep: "greataxe" });
    const afterDual = await shotCard(page, "after-dual-2h-pet-box.png", "Dual Titan — two two-handed weapons equipped");
    const beforePath = path.join(SHOTS, "before-dual-2h-pet-box.png");
    record("after screenshot of dual 2H pet portrait (no box)", !!(afterDual.size > 2000 && afterDual.data && afterDual.data.rhTwo && afterDual.data.lhTwo), afterDual.path + " " + afterDual.size);
    record("before screenshot still present for comparison", fs.existsSync(beforePath) && fs.statSync(beforePath).size > 2000, beforePath);
    await petsApi(page, "end");

    // Pause screen with pris weapon + armor + pet, and equipment slots
    await api(page, "begin", { depth: 10, lvl: 10 });
    await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    await api(page, "give", "armor", { slot: "chest", armor: "chest", stars: 5 });
    await api(page, "give", "armor", { slot: "head", armor: "head", stars: 5 });
    await api(page, "give", "pet", { slot: "pet", pab: 0, prt: 1, stars: 3 });
    await api(page, "openInv", true);
    await sleep(400);
    const pausePath = path.join(SHOTS, "pause-pris-weapon-armor-pet-412x780.png");
    const wrapEl = await page.$(".dc-wrap");
    if (wrapEl) await wrapEl.screenshot({ path: pausePath });
    else await page.screenshot({ path: pausePath });
    record("pause screen prismatic weapon+armor+pet screenshot", fs.existsSync(pausePath) && fs.statSync(pausePath).size > 2000, pausePath + " " + (fs.existsSync(pausePath) ? fs.statSync(pausePath).size : 0));

    const slotsPath = path.join(SHOTS, "equipment-slots-pris-412x780.png");
    const grid = await page.$(".dc-grid6") || await page.$(".dc-inv");
    if (grid) await grid.screenshot({ path: slotsPath });
    else if (wrapEl) await wrapEl.screenshot({ path: slotsPath });
    else await page.screenshot({ path: slotsPath });
    record("equipment slots prismatic screenshot", fs.existsSync(slotsPath) && fs.statSync(slotsPath).size > 800, slotsPath + " " + (fs.existsSync(slotsPath) ? fs.statSync(slotsPath).size : 0));

    const css = await api(page, "slotCss");
    record("equipment slots have no soft prismatic rectangle glow", !!(css && css.ok && css.n >= 1 && css.glowing === 0), JSON.stringify(css));
    await api(page, "openInv", false);
    await sleep(200);

    // --- Independent ultimates ---
    await api(page, "begin", { depth: 10, lvl: 10 });
    const g1 = await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    await sleep(200);
    const one = await api(page, "logical");
    const ui1 = await api(page, "ui");
    record("1 equipped Prismatic => 1 ult button", !!(one && one.n === 1 && ui1 && ui1.n === 1), JSON.stringify({ logical: one, ui: ui1 && ui1.n }));

    await api(page, "give", "armor", { slot: "chest", armor: "chest", stars: 5 });
    await api(page, "give", "armor", { slot: "head", armor: "head", stars: 5 });
    await sleep(250);
    const three = await api(page, "logical");
    const ui3 = await api(page, "ui");
    record("3 equipped Prismatics => 3 ult buttons", !!(three && three.n === 3 && ui3 && ui3.n === 3), JSON.stringify({ n: three && three.n, ui: ui3 && ui3.n, slots: three && three.buttons && three.buttons.map((b) => b.slot) }));

    const mulRh = three && three.buttons && three.buttons.find((b) => b.slot === "rh");
    record("each button uses only that item's multiplier (no fuse)", !!(mulRh && Math.abs(mulRh.mul - 2.5) < 0.05 && three.petFuse === 0), JSON.stringify(mulRh));

    // Cross-item: add a golden 10-star armor / pet, weapon mul must stay 2.5
    await api(page, "give", "armor", { slot: "arms", armor: "arms", stars: 10, golden: true });
    await api(page, "give", "pet", { slot: "pet", pab: 0, prt: 0, stars: 10, golden: true });
    const afterXtra = await api(page, "logical");
    const rhAfter = afterXtra && afterXtra.buttons && afterXtra.buttons.find((b) => b.slot === "rh");
    record("other Prismatics (stars/golden/pet) do not multiply a different ult", !!(rhAfter && Math.abs(rhAfter.mul - 2.5) < 0.05), JSON.stringify(rhAfter));

    const dmgA = await api(page, "dmg", "rh");
    const dmgChest = await api(page, "dmg", "chest");
    record("weapon and armor ultimates have their own individual power", !!(dmgA && dmgA.ok && dmgChest && dmgChest.ok && dmgA.mul === 2.5), `rh mid=${dmgA && dmgA.mid} chest mid=${dmgChest && dmgChest.mid} muls ${dmgA && dmgA.mul}/${dmgChest && dmgChest.mul}`);

    // Independent 60s cooldown, countdown on the fired button only
    record("base ultimate cooldown is 1 minute (60000 ms)", !!(three && three.ultCdMs === 60000), String(three && three.ultCdMs));
    await api(page, "clearCds");
    const beforeCast = await api(page, "logical");
    const allReady = beforeCast && beforeCast.buttons && beforeCast.buttons.every((b) => b.ready);
    record("all ultimates start ready", !!allReady, JSON.stringify(beforeCast && beforeCast.buttons));
    const fired = await api(page, "cast", "rh");
    await sleep(250);
    const afterCast = await api(page, "logical");
    const uiCd = await api(page, "ui");
    const rhCd = afterCast && afterCast.buttons && afterCast.buttons.find((b) => b.slot === "rh");
    const othersReady = afterCast && afterCast.buttons && afterCast.buttons.filter((b) => b.slot !== "rh").every((b) => b.ready);
    const leftOk = rhCd && rhCd.left >= 50000 && rhCd.left <= 60000;
    const txtOk = rhCd && /^\d:\d\d$/.test(rhCd.cdText);
    const uiRh = uiCd && uiCd.buttons && uiCd.buttons.find((b) => b.slot === "rh");
    const uiShows = uiRh && /\d:\d\d/.test(uiRh.label + " " + uiRh.aria);
    record("firing one ult starts its own 60s cooldown", !!(fired && fired.fired && leftOk), JSON.stringify(rhCd));
    record("other ultimates stay ready (independent cooldowns)", !!othersReady, JSON.stringify(afterCast && afterCast.buttons));
    record("cooldown countdown is shown on the button", !!(txtOk && uiShows), `logical=${rhCd && rhCd.cdText} ui=${uiRh && uiRh.label}`);

    // Buttons fit at 412x780 without covering stick/potion/canvas
    await api(page, "give", "armor", { slot: "legs", armor: "legs", stars: 5 });
    await api(page, "give", "wep", { slot: "lh", wep: "sword", stars: 5 });
    await sleep(300);
    const ui6 = await api(page, "ui");
    const noCover = ui6 && ui6.n >= 5 && ui6.buttons.every((b) => !b.overlapsStick && !b.overlapsPotion && !b.overlapsCanvas && b.w >= 48 && b.h >= 48);
    record("6 ult buttons stack at 412x780 without covering key UI", !!noCover, JSON.stringify({ n: ui6 && ui6.n, buttons: ui6 && ui6.buttons && ui6.buttons.map((b) => ({ slot: b.slot, w: Math.round(b.w), h: Math.round(b.h), stick: b.overlapsStick, pot: b.overlapsPotion, cv: b.overlapsCanvas })) }));

    await api(page, "quiet");
    await sleep(200);
    const ultShot = path.join(SHOTS, "ult-buttons-412x780.png");
    const wrap2 = await page.$(".dc-wrap");
    if (wrap2) await wrap2.screenshot({ path: ultShot });
    else await page.screenshot({ path: ultShot });
    record("ult buttons screenshot", fs.existsSync(ultShot) && fs.statSync(ultShot).size > 2000, ultShot + " " + (fs.existsSync(ultShot) ? fs.statSync(ultShot).size : 0));

    // Apex Chronos shortens the independent CD
    await api(page, "begin", { depth: 10, lvl: 10 });
    await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    const len0 = await api(page, "cdLen");
    await api(page, "give", "pet", { slot: "pet", pab: 0, prt: 3, stars: 5 });
    const len1 = await api(page, "cdLen");
    await api(page, "clearCds");
    await api(page, "cast", "rh");
    const ch = await api(page, "logical");
    const chRh = ch && ch.buttons && ch.buttons[0];
    record("Apex Chronos shortens the 60s cooldown", !!(len0 === 60000 && len1 < 60000 && len1 >= 30000 && chRh && chRh.left <= len1 && chRh.left >= len1 - 2000 && chRh.cdText), `len ${len0} -> ${len1}, left=${chRh && chRh.left} text=${chRh && chRh.cdText}`);

    // A single ult does not one-shot a typical-depth boss
    await api(page, "begin", { depth: 10, lvl: 10 });
    await api(page, "give", "wep", { slot: "rh", wep: "sword", stars: 5 });
    const boss = await api(page, "spawnBoss");
    const preview = await api(page, "dmg", "rh");
    const hp0 = boss && boss.hp;
    const pool0 = (boss.hp || 0) + (boss.shd || 0);
    await api(page, "clearCds");
    const firedBoss = await api(page, "cast", "rh");
    const afterBoss = await api(page, "boss");
    const pool1 = afterBoss && ((afterBoss.hp || 0) + (afterBoss.shd || 0));
    record("single ult mid damage is below typical-depth boss HP", !!(preview && preview.ok && hp0 > 0 && preview.mid < hp0), `mid=${preview && preview.mid} bossHp=${hp0} mhp=${boss && boss.mhp} shd=${boss && boss.shd}`);
    record("a single ult does not one-shot a typical-depth boss", !!(firedBoss && firedBoss.fired && afterBoss && afterBoss.ok && afterBoss.id === boss.id && afterBoss.hp > 0 && pool1 < pool0), JSON.stringify({ before: { hp: hp0, pool: pool0, shd: boss && boss.shd }, after: afterBoss, mid: preview && preview.mid, fired: firedBoss && firedBoss.fired }));

    await api(page, "end");
  } catch (err) {
    try { await api(page, "end"); } catch { /* ignore */ }
    record("suite-error", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const pass = results.filter((x) => x.pass).length;
  const failed = results.filter((x) => !x.pass).length;
  console.log("\nPRIS  " + pass + " passed, " + failed + " failed, " + results.length + " total");
  process.exit(failed ? 1 : 0);
}

main();
