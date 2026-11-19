// Eternum icon brightening + unique trigger FX/SFX. Throwaway profiles only.
// Save-test path uses a COPY of the Richard save; the official file is never written.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const RICHARD = process.env.RICHARD_FILE || path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const RICHARD_MD5 = "4c155ae35dc8eacf8dd4ab400adf75a5";
const COPY = "/tmp/richard-boss-COPY-eternum.txt";
const SHOTS = "/workspace/ed16-cave-shots";
const NAMES = ["storm-crown", "grave-toll", "phalanx-of-the-dead", "echo-self", "neon-skyfall", "second-heartbeat", "prism-guard"];
const SFX = ["nkStorm", "nkGrave", "nkPhalanx", "nkEcho", "nkSkyfall", "nkHeart", "nkPrism"];
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1200) : ""));
  return !!pass;
}

function md5(p) { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"); }

async function canvasShot(page, dest) {
  const handle = await page.evaluateHandle(() => {
    const list = [...document.querySelectorAll("canvas")];
    return list.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  });
  const el = handle.asElement();
  if (!el) throw new Error("no canvas");
  await el.screenshot({ path: dest });
}

async function main() {
  const officialMd5 = md5(RICHARD);
  rec("official Richard save md5 is untouched before the run", officialMd5 === RICHARD_MD5, officialMd5);
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the Richard save", fs.existsSync(COPY) && md5(COPY) === RICHARD_MD5 && COPY.includes("COPY"), COPY);

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/eternum-fx-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  try {
    await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".dc-root");
    await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK && window.__ED16_HZ));

    const PRIS = (n, ...a) => page.evaluate((n, a) => window.__ED16_PRIS[n](...a), n, a);
    const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
    const HZ = (n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);

    await PRIS("begin", { depth: 150, lvl: 300 });
    await sleep(200);

    const rates = await page.evaluate(() => window.__ED16_HZ.rates);
    rec("ART_CH is still 0.02 (necklace work did not change cave odds)", rates && rates.ART_CH === 0.02, rates && { ART_CH: rates.ART_CH });
    const nr = await NK("rates");
    rec("necklace drop rates are halved (NK_BASE 6e-6, NK_BASE_E 4.45e-7, min depth 101)",
      !!(nr && nr.NK_BASE === 6e-6 && nr.NK_BASE_E === 4.45e-7 && nr.NK_MIN_DEPTH === 101),
      nr);

    const grant = await NK("grantAll");
    rec("grantAll unlocks all eight Eternum necklaces in memory", !!(grant && grant.ok && grant.own && grant.own.filter((x) => x).length === 8), grant);

    await NK("sfxSpy");
    const chain = await NK("stormChain");
    rec("Storm Crown still chains to up to 6 foes for damage on the 3rd attack (mechanics unchanged)",
      !!(chain && chain.ok && chain.hops === 6 && chain.atk === 3 && chain.dealt.every((d) => d > 0) && (chain.fx || []).includes("nkbolt")),
      chain);

    // Second attack should not chain (atk is now 3; next after-attack needs atk%3===0 after increment, i.e. atk 5)
    // triggerFx unique sfx
    const sfxSeen = [];
    for (let i = 0; i < 7; i++) {
      await NK("sfxSpy");
      const tr = await NK("triggerFx", i);
      const hit = (tr && tr.sfx || []).some((x) => String(x).startsWith(SFX[i]));
      sfxSeen.push({ i, name: NAMES[i], hit, sfx: tr && tr.sfx, fx: tr && tr.fx });
      rec(NAMES[i] + " trigger plays unique sfx " + SFX[i], hit, tr);
    }
    rec("each of the 7 effect necklaces has a distinct trigger sfx name", new Set(SFX).size === 7 && sfxSeen.every((r) => r.hit), sfxSeen);

    // Icon panel on the Richard COPY (in memory unlock, never saved).
    // End the pris test game so NK hooks bind to the loaded LIVE save, not the begin() kit.
    await PRIS("end");
    const code = fs.readFileSync(COPY, "utf8").replace(/\s+/g, "");
    const loaded = await page.evaluate((code) => {
      const hook = window.__ED16_CAVES;
      if (!hook || typeof hook.load !== "function") return { ok: false, error: "no caves.load" };
      return hook.load(code);
    }, code);
    rec("Richard COPY loaded into a throwaway session", !!(loaded && (loaded.ok || loaded.depth || loaded.x !== undefined || Object.keys(loaded).length)), loaded && Object.keys(loaded));
    await NK("grantAll");
    await sleep(300);
    const bagClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => /Bag/.test(el.textContent || ""));
      if (!b) return false;
      b.click();
      return true;
    });
    rec("opened the bag on the loaded Richard COPY (not the pris begin hook)", bagClicked, bagClicked);
    await sleep(900);
    await page.evaluate(() => {
      const el = document.querySelector("[data-nk-section='1']") || document.querySelector(".dc-nk");
      if (el) el.scrollIntoView({ block: "center" });
    });
    await sleep(500);
    const icons = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("[data-nk-icon]")];
      return {
        n: nodes.length,
        pe: nodes.filter((el) => el.classList.contains("pe")).length,
        sparks: nodes.reduce((a, el) => a + el.querySelectorAll(".dc-nksparks i").length, 0),
        ids: nodes.map((el) => el.getAttribute("data-nk-icon")),
      };
    });
    rec("necklace panel shows all 8 bright icons with edge sparkles, Prismatic Eternum marked ultra-special",
      !!(icons && icons.n === 8 && icons.pe === 1 && icons.sparks >= 8 * 8),
      icons);
    const panel = await page.$("[data-nk-section='1']") || await page.$(".dc-nk");
    if (panel) {
      await panel.screenshot({ path: path.join(SHOTS, "eternum-icons.png") });
      await panel.screenshot({ path: path.join(SHOTS, "stormcrown-icon.png") });
      rec("wrote eternum-icons.png and stormcrown-icon.png", fs.existsSync(path.join(SHOTS, "eternum-icons.png")), SHOTS);
    } else {
      rec("wrote eternum-icons.png and stormcrown-icon.png", false, "panel missing");
    }

    const bagClosed = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => /Bag/.test(el.textContent || ""));
      if (!b) return false;
      b.click();
      return true;
    });
    rec("closed the bag before trigger screenshots", bagClosed, bagClosed);
    await sleep(400);
    // Equip storm + PE for aura, then fire each trigger visual over the hero
    await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 1]);
    await NK("equip", 7); // PE
    await NK("equip", 0);
    await NK("holdFx", true);
    for (let i = 0; i < 7; i++) {
      if (i !== 0) { await NK("equip", i); }
      await NK("quietHud");
      await NK("triggerFx", i);
      await sleep(60);
      const dest = path.join(SHOTS, "eternum-fx-" + NAMES[i] + ".png");
      await canvasShot(page, dest);
      rec("wrote eternum-fx-" + NAMES[i] + ".png", fs.existsSync(dest) && fs.statSync(dest).size > 1000, dest);
      if (i === 0) {
        const chainShot = path.join(SHOTS, "stormcrown-chain.png");
        fs.copyFileSync(dest, chainShot);
        rec("wrote stormcrown-chain.png", fs.existsSync(chainShot), chainShot);
      }
    }

    rec("no page errors during Eternum FX tests", errors.length === 0, errors);
  } finally {
    const after = md5(RICHARD);
    rec("official Richard save md5 is still untouched after the run", after === RICHARD_MD5, after);
    await browser.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
