// Gem power v2 (2026-11-19): retroactive values on a COPY of the Richard save + tooltip screenshots.
// Never touches the official save file or any real browser profile.
import puppeteer from "puppeteer-core";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const RICHARD = path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const RICHARD_MD5 = "4c155ae35dc8eacf8dd4ab400adf75a5";
const COPY = "/tmp/richard-boss-COPY-gem-v2.txt";
const SHOTS = "/workspace/ed16-cave-shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass });
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (d ? "  --  " + d.slice(0, 1400) : ""));
}
function md5(p) { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"); }
const QN = ["Chipped", "Fine", "Clear", "Bright", "Vivid", "Royal", "Imperial", "Prismatic"];
const pow = (rar, s) => (rar >= 7 ? Math.pow(1.5, 6) * 2.25 : Math.pow(1.5, rar)) * (1 + 0.15 * s);

async function main() {
  rec("official Richard save md5 untouched at start", md5(RICHARD) === RICHARD_MD5, md5(RICHARD));
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the Richard save", md5(COPY) === RICHARD_MD5, COPY);
  const code = fs.readFileSync(COPY, "utf8").replace(/\s+/g, "");
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable", headless: "new",
    userDataDir: "/tmp/ed16-profiles/gem-v2-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"], protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 412, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_CAVES && window.__ED16_PRIS && window.__ED16_PRIS.gems && window.__ED16_PRIS.gems.liveGems));
  const loaded = await page.evaluate((c) => window.__ED16_CAVES.load(c), code);
  rec("Richard COPY loaded into a throwaway session", !!loaded, loaded && Object.keys(loaded).slice(0, 6));
  await sleep(400);
  const L = await page.evaluate(() => window.__ED16_PRIS.gems.liveGems());
  rec("live save has socketed and bag gems", L.ok && L.socketed.length > 0 && L.bag.length > 0, { socketed: L.socketed.length, bag: L.bag.length, lvl: L.lvl, depth: L.depth });

  const badPow = [];
  for (const z of [...L.socketed, ...L.bag]) {
    const m = /^(Golden Prismatic|\w+) \w+ Gem/.exec(z.gem); const rar = m ? (m[1] === "Golden Prismatic" ? 7 : QN.indexOf(m[1])) : -1;
    const sm = /\u2605(\d+)/.exec(z.gem); const s = sm ? +sm[1] : 0;
    const want = pow(rar, s);
    if (rar < 0 || Math.abs(z.pow - want) > 0.01 || !z.text.startsWith("Gem power " + (Math.round(want * 100) / 100) + ".")) badPow.push({ gem: z.gem, pow: z.pow, want, text: z.text.slice(0, 40) });
  }
  rec("every socketed and bag gem uses the v2 power curve in its tooltip (recomputed from rarity + stars)", badPow.length === 0, badPow.length ? badPow : [...L.socketed, ...L.bag].length + " gems");

  // hero totals: the sum of each socketed gem's "now +N" numbers matches calc with gems minus calc without gems
  let hp = 0, atk = 0, def = 0;
  for (const z of L.socketed) {
    const n = (re) => { let t = 0; for (const mm of z.text.matchAll(re)) t += +mm[1].replace(/,/g, ""); return t; };
    hp += n(/\+([\d,]+) HP/g); atk += n(/\+([\d,]+) Atk/g); def += n(/\+([\d,]+) Def\b/g);
  }
  const dHp = L.withGems.hp - L.withoutGems.hp, dAtk = L.withGems.atk - L.withoutGems.atk, dDef = L.withGems.def - L.withoutGems.def;
  const near = (a, b) => Math.abs(a - b) <= Math.max(3, Math.abs(b) * 0.01);
  rec("hero totals right after load include the new gem values (tooltip sums = calc delta)",
    near(hp, dHp) && near(atk, dAtk) && near(def, dDef) && dHp > 1000 && dAtk > 500,
    { tooltipSum: { hp, atk, def }, calcDelta: { hp: dHp, atk: dAtk, def: dDef }, withGems: L.withGems, withoutGems: L.withoutGems });

  // Screenshots: a bag gem tooltip (best Ruby) and the head piece with socketed Prismatic gems
  const bag = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((el) => /Bag/.test(el.textContent || "")); if (b) { b.click(); return true; } return false; });
  await sleep(700);
  const clicked = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".dc-cell")];
    const el = cells.find((c) => /Imperial Ruby/.test(c.getAttribute("aria-label") || "")) || cells.find((c) => /Ruby/.test(c.getAttribute("aria-label") || ""));
    if (el) { el.click(); return el.getAttribute("aria-label"); }
    return null;
  });
  await sleep(400);
  const tipText = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".dc-det div")].find((d) => /^Gem power/.test(d.textContent || ""));
    if (el) { el.scrollIntoView({ block: "center" }); return el.textContent; }
    return null;
  });
  await sleep(250);
  const p1 = path.join(SHOTS, "gem-tooltip-v2.png");
  await page.screenshot({ path: p1, type: "png" });
  rec("gem-tooltip-v2.png shows a bag gem tooltip with the new numbers", bag && !!clicked && !!tipText && fs.statSync(p1).size > 1000, { clicked, tipText });

  const headClicked = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".dc-cell")];
    const el = cells.find((c) => /Sallet/.test(c.getAttribute("aria-label") || ""));
    if (el) { el.click(); return el.getAttribute("aria-label"); }
    return null;
  });
  await sleep(400);
  const sockTexts = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".dc-sockfx")];
    if (els[0]) els[0].scrollIntoView({ block: "center" });
    return els.map((e) => e.textContent);
  });
  await sleep(250);
  const p2 = path.join(SHOTS, "gem-tooltip-v2-socketed.png");
  await page.screenshot({ path: p2, type: "png" });
  rec("socketed gems show their new values on the gear tooltip", !!headClicked && sockTexts.length >= 4 && sockTexts.every((t) => /^Gem power/.test(t)), { headClicked, sockTexts });

  rec("no page errors", errs.length === 0, errs);
  await browser.close();
  rec("official Richard save md5 unchanged", md5(RICHARD) === RICHARD_MD5, md5(RICHARD));
  const fail = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
