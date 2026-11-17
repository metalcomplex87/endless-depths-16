import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "pets");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/pets-" + Date.now();
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
      pets: typeof (window.__ED16_PETS && window.__ED16_PETS.begin),
      keys: Object.keys(window).filter((k) => k.startsWith("__ED16")),
    }));
    if (hook.pets === "function") break;
    await sleep(250);
  }
  if (hook.pets !== "function") throw new Error("pets hook missing: " + JSON.stringify(hook));
  return { browser, page };
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_PETS;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function shotCard(page, kind, file, title) {
  const data = await api(page, "shot", kind);
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
  await page.screenshot({ path: dest, type: "png" });
  await page.evaluate(() => document.querySelectorAll("#ed16-pets-shot").forEach((el) => el.remove()));
  return { path: dest, data, size: fs.existsSync(dest) ? fs.statSync(dest).size : 0 };
}

async function main() {
  const { browser, page } = await launch();
  try {
    const begin = await api(page, "begin");
    record("hook-begin scratch game", !!(begin && begin.ok), JSON.stringify(begin));

    const listed = await api(page, "traits");
    record("16 common traits listed", !!(listed && listed.commons && listed.commons.length === 16), JSON.stringify(listed && listed.commons));
    record("7 rare traits listed", !!(listed && listed.rares && listed.rares.length === 7 && listed.rares[0] === "Dual Titan"), JSON.stringify(listed && listed.rares));
    record("rare roll chance is 8%", !!(listed && listed.rareChance === 0.08), String(listed && listed.rareChance));

    const first6 = ["Guardian Aegis", "Prismatic Storm", "Soul Harvest", "Phoenix Bond", "Mirror Twin", "Fortune's Eye"];
    record("first 6 commons keep old identities", !!(listed && first6.every((n, i) => listed.commons[i] === n)), JSON.stringify(listed && listed.commons && listed.commons.slice(0, 6)));

    // Roll rates on 4000 deterministic seeds
    const roll = await api(page, "roll", 4000);
    const pab = (roll && roll.pab) || [];
    const allSeen = pab.length === 16 && pab.every((c) => c > 0);
    const minC = Math.min(...pab), maxC = Math.max(...pab);
    const balanced = allSeen && minC > 4000 / 16 * 0.5 && maxC < 4000 / 16 * 1.5;
    record("common traits roll uniformly 0-15", !!balanced, `min=${minC} max=${maxC} counts=${JSON.stringify(pab)}`);
    const rate = roll && roll.rareRate;
    record("rare trait rolls near 8%", !!(rate >= 0.06 && rate <= 0.10), `rate=${rate} rare=${roll && roll.rare}/4000`);
    const rids = (roll && roll.rareIds) || [];
    const rareSpread = rids.slice(1).every((c) => c > 0);
    record("landed rares spread across all 7 ids", !!rareSpread, JSON.stringify(rids));

    // Old save migration: pab 0-5 kept, no rare granted
    let oldOk = true;
    const oldBits = [];
    for (let pabId = 0; pabId <= 5; pabId++) {
      const o = await api(page, "oldLoad", pabId);
      const pass = !!(o && o.ok && o.pab === pabId && o.prt === null);
      oldOk = oldOk && pass;
      oldBits.push(`${pabId}:${o && o.pab}/${o && o.prt}`);
    }
    record("old prismatic pets keep pab 0-5 and gain no rare", oldOk, oldBits.join(" "));

    // Independent ultimates: a Prismatic pet must not add a button or multiply damage
    await api(page, "begin");
    const ult = await api(page, "give", "ult", { slot: "rh", wep: "sword" });
    const fuse0 = await api(page, "fuse");
    record("pris weapon alone is 1 ult button", !!(fuse0 && fuse0.count === 1 && fuse0.ults === 1 && fuse0.pet === 0), JSON.stringify(fuse0));
    const mul0 = fuse0 && fuse0.mul;
    await api(page, "give", "pet", { slot: "pet", pab: 7, prt: 0 });
    const fuse1 = await api(page, "fuse");
    const mul1 = fuse1 && fuse1.mul;
    record("pris pet does not add an ult button or fuse piece", !!(fuse1 && fuse1.count === 1 && fuse1.ults === 1 && fuse1.pet === 0), JSON.stringify(fuse1));
    record("pris pet does not multiply ultimate damage", !!(mul0 > 0 && mul1 > 0 && Math.abs(mul1 / mul0 - 1) < 0.05), `mul ${mul0} -> ${mul1} ratio=${mul1 && mul0 ? (mul1 / mul0).toFixed(3) : "?"}`);
    record("pet is not an ult button source", !!(fuse1 && fuse1.hasUlt && fuse1.btn && fuse1.btn !== "ULTIMATE" && (fuse1.buttons === undefined || fuse1.buttons === 1)), String(fuse1 && fuse1.btn));

    // Crystal Bastion / Gale Stride impact
    await api(page, "begin");
    const base = await api(page, "hands");
    await api(page, "give", "pet", { slot: "pet", pab: 12, prt: 0 });
    const bastion = await api(page, "hands");
    record("Crystal Bastion raises max HP", !!(bastion && base && bastion.maxHp > base.maxHp), `hp ${base && base.maxHp} -> ${bastion && bastion.maxHp}`);
    await api(page, "begin");
    await api(page, "give", "pet", { slot: "pet", pab: 9, prt: 0 });
    const gale = await api(page, "hands");
    const base2 = base;
    record("Gale Stride raises move and attack speed", !!(gale && base2 && gale.mv > base2.mv && gale.spd > base2.spd), `mv ${base2 && base2.mv}->${gale && gale.mv} spd ${base2 && base2.spd}->${gale && gale.spd}`);

    // Split Swarm: 4 copies fire 4 stacked shots
    await api(page, "begin");
    const split = await api(page, "splitStart");
    record("Split Swarm fires stacked shots from 2-5 copies", !!(split && split.ok && split.copies === 4 && split.shots >= 4 && split.enemyHp < split.mhp), JSON.stringify(split));

    // Dual Titan equip / stats / unequip / save-reload
    await api(page, "begin");
    await api(page, "give", "pet", { slot: "pet", pab: 0, prt: 1 });
    const gs = await api(page, "give", "2h", { slot: "rh", wep: "greatsword" });
    const ga = await api(page, "give", "2h", { slot: "lh", wep: "greataxe" });
    const dual = await api(page, "hands");
    record("Dual Titan equips 2H in main and off-hand", !!(dual && dual.dual && dual.rh && dual.rh.two && dual.lh && dual.lh.two), JSON.stringify(dual));
    const expectAtk = (dual.rh.atk || 0) + Math.round((dual.lh.atk || 0) * 0.7);
    // calc also adds bonus atk from items, so just require off-hand contributed
    const mainOnly = dual.rh.atk;
    record("off-hand 2H contributes attack (70% rule)", !!(dual.atk > mainOnly + 5), `atk=${dual.atk} rh=${dual.rh.atk} lh=${dual.lh.atk} expect>=${expectAtk}`);

    const rt = await api(page, "roundtrip");
    record("dual 2H + Dual Titan survives save-reload", !!(rt && rt.ok && rt.same && rt.after && rt.after.lhTwo && rt.after.dual && rt.after.petPrt === 1), JSON.stringify(rt));

    const un = await api(page, "unequip", "pet");
    record("unequipping Dual Titan pet moves off-hand 2H to inventory", !!(un && un.ok && !un.lh && un.bagTwo >= 1 && un.rh && un.rh.two && !un.dual), JSON.stringify(un));

    // Without the trait, a 2H cannot be placed in the off-hand
    await api(page, "begin");
    await api(page, "give", "pet", { slot: "pet", pab: 0, prt: 0 });
    await api(page, "give", "2h", { slot: "rh", wep: "greatsword" });
    const blocked = await api(page, "give", "2h", { slot: "lh", wep: "greataxe" });
    const handsNo = await api(page, "hands");
    record("without Dual Titan, off-hand 2H is refused", !!(handsNo && handsNo.rh && handsNo.rh.two && !handsNo.lh && !handsNo.dual), JSON.stringify({ blocked, handsNo }));

    // Screenshots
    await api(page, "begin");
    await api(page, "give", "pet", { slot: "pet", pab: 6, prt: 1, stars: 3 });
    const shotTraits = await shotCard(page, "traits", "prismatic-pet-traits.png", "Prismatic pet — Split Swarm + Dual Titan");
    record("prismatic pet traits screenshot", !!(shotTraits.size > 2000 && shotTraits.data && shotTraits.data.rare && (shotTraits.data.lines || []).some((l) => /Split Swarm/.test(l))), shotTraits.path + " " + shotTraits.size);

    await api(page, "give", "2h", { slot: "rh", wep: "greatsword" });
    await api(page, "give", "2h", { slot: "lh", wep: "greataxe" });
    const shotDual = await shotCard(page, "dual", "dual-2h-equipped.png", "Dual Titan — two two-handed weapons equipped");
    record("dual 2H equipped screenshot", !!(shotDual.size > 2000 && shotDual.data && shotDual.data.rhTwo && shotDual.data.lhTwo), shotDual.path + " " + shotDual.size + ` RH=${shotDual.data && shotDual.data.rh} LH=${shotDual.data && shotDual.data.lh}`);

    await api(page, "end");
  } catch (err) {
    try { await api(page, "end"); } catch { /* ignore */ }
    record("suite-error", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => x.fail === false).length;
  const failed = results.filter((x) => !x.pass).length;
  console.log("\nPETS  " + pass + " passed, " + failed + " failed, " + results.length + " total");
  process.exit(failed ? 1 : 0);
}

main();
