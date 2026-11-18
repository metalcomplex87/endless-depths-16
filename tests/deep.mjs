import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "deep");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/deep-" + Date.now();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new", userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_DEEP && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function deep(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_DEEP;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function main() {
  console.log("DEEP tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const nums = await page.evaluate(() => {
      const d = window.__ED16_DEEP;
      return {
        MIN: d.MIN, OVSH_ATK: d.OVSH_ATK, OVSH_W: d.OVSH_W, UE_FLOOR_CH: d.UE_FLOOR_CH,
        UE_BOSS_CH: d.UE_BOSS_CH, SECRET_PORTAL_CH: d.SECRET_PORTAL_CH,
        LOOT_EXTRA_PER_BOSS: d.LOOT_EXTRA_PER_BOSS, LOOT_EXTRA_PER_OVSH: d.LOOT_EXTRA_PER_OVSH,
        atk0: d.atkMul(0), atk1: d.atkMul(1), atk2: d.atkMul(2), atk3: d.atkMul(3),
        canSecretLow: d.canSecret(50, true), canSecretNoPris: d.canSecret(51, false),
        canSecretOk: d.canSecret(51, true), canCaveLow: d.canCave(2), canCaveAct: d.canCave(15),
      };
    });
    record("overshield damage is linear +15/30/45%", nums.atk0 === 1 && nums.atk1 === 1.15 && nums.atk2 === 1.3 && nums.atk3 === 1.45, JSON.stringify(nums));
    record("OVSH_ATK is 0.15 and weights are 40/30/20/10", nums.OVSH_ATK === 0.15 && JSON.stringify(nums.OVSH_W) === JSON.stringify([0.4, 0.3, 0.2, 0.1]), JSON.stringify(nums));
    record("UE floor 6%, boss 18%, secret portal 4%", nums.UE_FLOOR_CH === 0.06 && nums.UE_BOSS_CH === 0.18 && nums.SECRET_PORTAL_CH === 0.04, JSON.stringify(nums));
    record("loot extras: +2 per extra boss, +1 per overshield", nums.LOOT_EXTRA_PER_BOSS === 2 && nums.LOOT_EXTRA_PER_OVSH === 1, JSON.stringify(nums));
    record("secret gated: denied at depth 50 even with Prismatic", nums.canSecretLow === false, JSON.stringify(nums));
    record("secret gated: denied at depth 51 without Prismatic", nums.canSecretNoPris === false, JSON.stringify(nums));
    record("secret gated: allowed at depth 51 with Prismatic", nums.canSecretOk === true, JSON.stringify(nums));
    record("loot/goblin caves allowed at depth 2 (no Prismatic gate)", nums.canCaveLow === true, JSON.stringify(nums));

    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 8, lvl: 10 }));

    // Low depth, no Prismatic: secret must not roll; goblin may
    await deep(page, "setPris", false);
    await deep(page, "setDepth", 8);
    const lowNo = await deep(page, "tryRollSecret");
    record("secret does not spawn at depth 8 without Prismatic", !!(lowNo && lowNo.ok && lowNo.allowed === false && !lowNo.placed && !lowNo.secret), JSON.stringify(lowNo));

    const manySecretLow = await page.evaluate(() => {
      window.__ED16_DEEP.setDepth(8);
      window.__ED16_DEEP.setPris(false);
      let placed = 0;
      for (let i = 0; i < 40; i++) {
        const r = window.__ED16_DEEP.tryRollSecret();
        if (r.placed) placed++;
        window.__ED16_DEEP.state();
      }
      return { placed, allowed: window.__ED16_DEEP.canSecret(8, false) };
    });
    record("40 secret rolls at d8 no-Pris never place", manySecretLow.placed === 0, JSON.stringify(manySecretLow));

    await deep(page, "setPris", true);
    await deep(page, "setDepth", 50);
    const midPris = await page.evaluate(() => {
      let placed = 0;
      for (let i = 0; i < 30; i++) if (window.__ED16_DEEP.tryRollSecret().placed) placed++;
      return { placed, allowed: window.__ED16_DEEP.deepPrisGated(), depth: window.__ED16_DEEP.state().depth };
    });
    record("secret does not spawn at depth 50 with Prismatic", midPris.placed === 0 && midPris.allowed === false, JSON.stringify(midPris));

    await deep(page, "setDepth", 51);
    await deep(page, "setPris", true);
    const deepOk = await page.evaluate(() => {
      const allowed = window.__ED16_DEEP.deepPrisGated();
      const force = window.__ED16_DEEP.forceSecret();
      return { allowed, force, state: window.__ED16_DEEP.state() };
    });
    record("secret can spawn at depth 51 with Prismatic (forced place)", !!(deepOk.allowed && deepOk.force && deepOk.force.ok && deepOk.state.secret), JSON.stringify(deepOk));

    // loot/goblin at low depth without pris
    await deep(page, "setDepth", 5);
    await deep(page, "setPris", false);
    const caves = await page.evaluate(() => {
      const g = window.__ED16_DEEP.forceGoblin();
      const v = window.__ED16_DEEP.forceVault();
      const o = window.__ED16_DEEP.overlap();
      return { g, v, o, state: window.__ED16_DEEP.state() };
    });
    record("goblin cave can be placed at depth 5 without Prismatic", !!(caves.g && caves.g.ok && caves.state.gobPort), JSON.stringify(caves.g));
    record("loot vault and goblin cave can coexist", !!(caves.state.gobPort && caves.state.portal), JSON.stringify({ portal: caves.state.portal, gob: caves.state.gobPort }));
    record("2x2 portal footprints do not overlap", !!(caves.o && caves.o.ok && caves.o.overlap === 0 && caves.o.n >= 2), JSON.stringify(caves.o));

    // force all three together at d51 with pris
    await deep(page, "setDepth", 51);
    await deep(page, "setPris", true);
    const three = await page.evaluate(() => {
      window.__ED16_DEEP.forceVault();
      window.__ED16_DEEP.forceGoblin();
      window.__ED16_DEEP.forceSecret();
      return window.__ED16_DEEP.overlap();
    });
    record("all three portal types can coexist without overlap", !!(three && three.n >= 3 && three.overlap === 0), JSON.stringify(three));

    const ovsh = await page.evaluate(() => {
      const a = [0, 1, 2, 3].map((n) => window.__ED16_DEEP.applyOvsh(n));
      return a;
    });
    record("overshield counts 0-3 apply and mul is 1/1.15/1.30/1.45",
      ovsh.every((r, i) => r && r.ok && r.ovm === i && Math.abs(r.atkMul - (1 + 0.15 * i)) < 1e-9),
      JSON.stringify(ovsh));
    record("extra loot scales with overshields (and boss copies)",
      ovsh[3] && ovsh[3].extraLoot >= 3, JSON.stringify(ovsh[3]));

    const ue = await deep(page, "spawnUE");
    record("ultra elite is a distinct named/color tier", !!(ue && ue.ok && /Ultra Elite/.test(ue.name || "") && ue.col === "#b060ff"), JSON.stringify(ue));

    // secret arena round trip + save
    const arena = await page.evaluate(() => {
      const enter = window.__ED16_DEEP.enterArena();
      const mid = window.__ED16_DEEP.state();
      const code = window.__ED16_DEEP.code();
      const bosses = mid.arenaBosses;
      // kill remaining? not required for save mid-fight
      const loaded = window.__ED16_DEEP.load(code);
      return { enter, mid, codeLen: (code || "").length, loaded, bosses };
    });
    record("secret arena starts a triple-boss fight", !!(arena.enter && arena.enter.area === "arena" && arena.bosses === 3), JSON.stringify({ area: arena.enter && arena.enter.area, bosses: arena.bosses }));
    record("mid-arena compact save/load restores the arena", !!(arena.loaded && arena.loaded.area === "arena" && arena.codeLen > 10), JSON.stringify({ area: arena.loaded && arena.loaded.area, bosses: arena.loaded && arena.loaded.arenaBosses, codeLen: arena.codeLen }));
    record("arena exit portal is sealed while bosses live", !!(arena.mid && arena.mid.sealed), JSON.stringify(arena.mid));

    const shotA = path.join(SHOTS, "secret-arena-412x780.png");
    await page.screenshot({ path: shotA, fullPage: false });
    record("secret arena screenshot", fs.existsSync(shotA) && fs.statSync(shotA).size > 1000, shotA);

    // goblin cave round trip
    await page.evaluate(() => {
      if (window.__ED16_DEEP.state().area === "arena") {
        // clear bosses for exit? exit anyway may be sealed. start fresh.
      }
    });
    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 6, lvl: 10 }));
    await deep(page, "setPris", false);
    const gob = await page.evaluate(() => {
      window.__ED16_DEEP.forceGoblin();
      const enter = window.__ED16_DEEP.enterGoblin();
      const mid = window.__ED16_DEEP.state();
      const code = window.__ED16_DEEP.code();
      const loaded = window.__ED16_DEEP.load(code);
      const exit = window.__ED16_DEEP.exitGoblin();
      return { enter, mid, loaded, exit, codeLen: (code || "").length, gobs: mid.enemies };
    });
    record("goblin cave enter fills the room with goblins", !!(gob.enter && gob.enter.area === "goblin" && gob.gobs >= 6), JSON.stringify({ area: gob.enter && gob.enter.area, gobs: gob.gobs }));
    record("goblin cave save/load round trip", !!(gob.loaded && gob.loaded.area === "goblin" && gob.codeLen > 10), JSON.stringify({ area: gob.loaded && gob.loaded.area, codeLen: gob.codeLen }));
    record("goblin cave exit returns to the same layer", !!(gob.exit && gob.exit.area === "dungeon"), JSON.stringify(gob.exit));

    const shotG = path.join(SHOTS, "goblin-cave-412x780.png");
    // re-enter for screenshot
    await page.evaluate(() => { window.__ED16_DEEP.forceGoblin(); window.__ED16_DEEP.enterGoblin(); });
    await page.screenshot({ path: shotG, fullPage: false });
    record("goblin cave screenshot", fs.existsSync(shotG) && fs.statSync(shotG).size > 1000, shotG);

    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("DEEP " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
