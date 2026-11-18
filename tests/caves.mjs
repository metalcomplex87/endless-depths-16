import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const SHOTS = process.env.ED16_SHOTS || path.join(__dirname, "..", "screenshots-caves");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(step, pass, detail = "") { results.push({ step, pass: !!pass }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + String(detail).slice(0, 700) : "")); }
async function open(w, h) {
  const userDir = "/tmp/ed16-profiles/caves-" + Date.now() + "-" + w;
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: userDir, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root");
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_CAVES && window.__ED16_PRIS.begin));
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 12, lvl: 40 }));
  await sleep(300);
  return { browser, page };
}
const C = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_CAVES[n](...a), n, a);
async function shot(page, name) {
  await page.evaluate(() => { const g = window.__ED16_CAVES; g.shotSetup(); });
  await sleep(700);
  const f = path.join(SHOTS, name + ".png");
  const el = await page.$("canvas");
  if (el) await el.screenshot({ path: f }); else await page.screenshot({ path: f });
  return f;
}
async function main() {
  console.log("CAVES tests against " + BASE);
  // 1. many-spawn announcement test on a narrow (240px) view and a phone view
  for (const [w, h] of [[300, 560], [412, 780]]) {
    const { browser, page } = await open(w, h);
    try {
      const r = await C(page, "spawnTest", 250);
      record(`[${w}x${h}] 250 forced cave spawns: every spawn placed, on floor, reachable`, r.placeFail === 0 && !r.bad.some((b) => b.why !== "bad alert"), JSON.stringify({ spawned: r.spawned, skipped: r.skipped, placeFail: r.placeFail, byKind: r.byKind, view: r.view }));
      record(`[${w}x${h}] every announcement had a real, on-screen, drawn, reachable portal`, !r.bad.some((b) => b.why === "bad alert"), "alerts=" + r.alerts + " bad=" + JSON.stringify(r.bad.slice(0, 3)));
      record(`[${w}x${h}] every spawned portal was announced when it came on screen`, r.missed.length === 0 && r.announced === r.spawned, "announced=" + r.announced + "/" + r.spawned + " missed=" + JSON.stringify(r.missed.slice(0, 3)));
      console.log(`   old sight-only rule would have announced off-screen in ${r.oldRuleOffscreen}/${r.spawned} walks`);
    } finally { await browser.close(); }
  }
  const { browser, page } = await open(412, 780);
  try {
    const rates = await page.evaluate(() => window.__ED16_CAVES.rates);
    record("rates: loot 4%, super loot 0.45% (~1/9), goblin 4%, super goblin 0.25% (~1/16)", rates.LOOT_CAVE_CH === 0.04 && rates.SUPER_LOOT_CH === 0.0045 && rates.SUPER_GOB_CH === 0.0025, JSON.stringify(rates));
    // 2. per-kind permanence + state + screenshots
    for (const kind of ["vault", "svault", "goblin", "sgoblin", "secret"]) {
      const field = kind === "secret" ? "secret" : (kind === "goblin" || kind === "sgoblin") ? "gobPort" : "portal";
      const which = kind === "secret" ? "secret" : (kind === "goblin" || kind === "sgoblin") ? "goblin" : "vault";
      const f = await C(page, "floor", kind, 14);
      record(`${kind}: portal placed on floor`, !!(f.ok && f[field] && f[field].sup === ((kind[0] === "s" && kind !== "secret") ? 1 : 0)), JSON.stringify(f[field]));
      record(`${kind}: announcement shown`, !!f.warn, f.warn);
      const s1 = await shot(page, kind + "-portal-announce");
      const inn = await C(page, "usePortal", which);
      const inside = which === "vault" ? inn.inVault : inn.area === (which === "secret" ? "arena" : "goblin");
      record(`${kind}: entered cave`, inside, JSON.stringify({ area: inn.area, inVault: inn.inVault, sup: inn.sup, chests: inn.chests, goblins: inn.goblins, royal: inn.royal, king: inn.king, banner: inn.banner }));
      record(`${kind}: walls cannot be damaged inside`, inn.wallOk === false);
      const s2 = await shot(page, kind + "-inside");
      let act;
      if (which === "vault") act = await C(page, "openChests", 5);
      else if (which === "goblin") act = await C(page, "killGoblins", 4);
      else act = await C(page, "killBosses");
      const before = which === "vault" ? act.closed : act.goblins;
      // reload while inside
      const codeIn = await C(page, "code");
      const re = await C(page, "load", codeIn);
      const reInside = which === "vault" ? re.inVault && re.closed === act.closed : (which === "goblin" ? re.area === "goblin" && re.goblins === act.goblins : re.area === "arena");
      record(`${kind}: save/reload while inside keeps the cave as it was`, reInside, JSON.stringify({ closed: re.closed, goblins: re.goblins, area: re.area, sup: re.sup }));
      const out = await C(page, "usePortal", "exit");
      const op = out[field];
      record(`${kind}: portal still open after exit`, !!op && op.sup === ((kind[0] === "s" && kind !== "secret") ? 1 : 0) && out.area === "dungeon" && !out.inVault, JSON.stringify(op));
      const back = await C(page, "usePortal", which);
      const kept = which === "vault" ? back.closed === before && back.chests === act.chests : which === "goblin" ? back.goblins === before : back.goblins === 0;
      record(`${kind}: re-entry keeps state (no refill)`, kept, JSON.stringify({ before, now: which === "vault" ? back.closed : back.goblins, banner: back.banner }));
      const out2 = await C(page, "usePortal", "exit");
      const code = await C(page, "code");
      const ld = await C(page, "load", code);
      record(`${kind}: portal survives save/reload on the floor`, !!(ld[field] && ld[field].x === out2[field].x && ld[field].y === out2[field].y && ld[field].sup === out2[field].sup && !!ld[field].cs), JSON.stringify(ld[field]));
      const db = await C(page, "downAndBack");
      record(`${kind}: portal survives leaving the floor and coming back`, !!(db.back && db.back[field] && db.back[field].x === out2[field].x && !!db.back[field].cs && db.back.depth === out2.depth), JSON.stringify({ mid: db.mid && db.mid.depth, back: db.back && db.back[field] }));
      console.log("   shots:", s1, s2);
    }
    // 3. loot boosts: normal vs super vault, normal vs royal goblins
    const cmp = {};
    for (const kind of ["vault", "svault"]) {
      let rars = [], gold = 0, chests = 0, crar = [];
      for (let k = 0; k < 6; k++) {
        await C(page, "floor", kind, 20);
        const inn = await C(page, "usePortal", "vault");
        crar = crar.concat(inn.chestRar);
        const r = await C(page, "openChests", 99);
        rars = rars.concat(r.itemRars); gold += r.goldGain; chests += r.opened;
        await C(page, "usePortal", "exit");
      }
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      cmp[kind] = { chestsPerCave: +(chests / 6).toFixed(1), avgChestRar: +avg(crar).toFixed(2), avgItemRar: +avg(rars).toFixed(2), items: rars.length, goldPerChest: Math.round(gold / Math.max(1, chests)) };
    }
    record("super loot cave: more chests, better chest + item rarity, more gold", cmp.svault.avgItemRar > cmp.vault.avgItemRar + 0.5 && cmp.svault.goldPerChest > cmp.vault.goldPerChest * 2 && cmp.svault.chestsPerCave > cmp.vault.chestsPerCave, JSON.stringify(cmp));
    const gcmp = {};
    for (const kind of ["goblin", "sgoblin"]) {
      let rars = [], gold = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        await C(page, "floor", kind, 20);
        const inn = await C(page, "usePortal", "goblin");
        const r = await C(page, "killGoblins", 99);
        rars = rars.concat(r.itemRars); gold += r.goldGain; n += r.killed;
        await C(page, "usePortal", "exit");
      }
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      gcmp[kind] = { goblinsPerCave: n / 4, items: rars.length, avgItemRar: +avg(rars).toFixed(2), goldPerCave: Math.round(gold / 4) };
    }
    record("royal goblin warren: more/better drops and gold", gcmp.sgoblin.avgItemRar > gcmp.goblin.avgItemRar && gcmp.sgoblin.items > gcmp.goblin.items * 1.5 && gcmp.sgoblin.goldPerCave > gcmp.goblin.goldPerCave * 2, JSON.stringify(gcmp));
  } catch (e) { record("suite exception", false, e.stack); }
  finally { await browser.close(); }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main();
