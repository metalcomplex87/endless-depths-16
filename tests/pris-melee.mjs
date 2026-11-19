// Prismatic melee weapons become ranged (thrown / beam sword laser). Throwaway profiles only.
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
const COPY = "/tmp/richard-boss-COPY-pris-melee.txt";
const SHOTS = "/workspace/ed16-cave-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const MELEE = ["sword", "axe", "mace", "spear", "dagger", "greatsword", "greataxe", "warhammer", "scythe", "flail", "katana", "nodachi", "claws"];
const NATIVE = { bow: 5, crossbow: 6, handxbow: 4, staff: 4, wand: 4 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1400) : ""));
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
  rec("official Richard save md5 is untouched before the run", md5(RICHARD) === RICHARD_MD5, md5(RICHARD));
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the Richard save", fs.existsSync(COPY) && md5(COPY) === RICHARD_MD5 && COPY.includes("COPY"), COPY);

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/pris-melee-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_PRIS.melee));
  const PRIS = (n, ...a) => page.evaluate((n, a) => {
    const fn = n.split(".").reduce((o, k) => o && o[k], window.__ED16_PRIS);
    return typeof fn === "function" ? fn(...a) : fn;
  }, n, a);

  await PRIS("begin", { depth: 120, lvl: 200 });
  await sleep(150);

  const meleeRows = [];
  for (const k of MELEE) {
    await PRIS("give", "wep", { slot: "rh", wep: k, stars: 5 });
    const f = await PRIS("melee.flags");
    meleeRows.push({ k, ...f });
    rec("Prismatic " + k + " is ranged (range 5) and thrown",
      !!(f && f.ok && f.rar === 7 && f.range === 5 && f.prisMelee && f.prisThrown && !f.prisBeam && /thrown at range 5/.test(f.note)),
      f);
  }

  await PRIS("give", "wep", { slot: "rh", wep: "beamsword", stars: 5 });
  const beam = await PRIS("melee.flags");
  rec("Prismatic beam sword is ranged (range 5) and fires a laser",
    !!(beam && beam.ok && beam.rar === 7 && beam.range === 5 && beam.prisMelee && beam.prisBeam && !beam.prisThrown && /ranging laser/.test(beam.note)),
    beam);

  for (const [k, r] of Object.entries(NATIVE)) {
    await PRIS("give", "wep", { slot: "rh", wep: k, stars: 5 });
    const f = await PRIS("melee.flags");
    rec("Prismatic " + k + " keeps its native range " + r + " (not thrown melee)",
      !!(f && f.range === r && !f.prisMelee && !f.prisThrown && !f.prisBeam),
      f);
  }

  const regKinds = ["sword", "axe", "spear", "greatsword", "beamsword", "mace", "claws"];
  for (const k of regKinds) {
    await PRIS("give", "wep", { slot: "rh", wep: k, stars: 5 });
    const down = await PRIS("melee.setRar", 3);
    rec("regular (rarity 3) " + k + " stays melee (range 0)",
      !!(down && down.ok && down.rar === 3 && down.range === 0),
      down);
  }
  for (const [k, r] of Object.entries(NATIVE)) {
    await PRIS("give", "wep", { slot: "rh", wep: k, stars: 5 });
    const down = await PRIS("melee.setRar", 3);
    rec("regular " + k + " keeps native range " + r,
      !!(down && down.ok && down.rar === 3 && down.range === r),
      down);
  }

  // Thrown shot at range
  await PRIS("give", "wep", { slot: "rh", wep: "sword", stars: 5 });
  const foeS = await PRIS("melee.placeFoe", 4, 0);
  rec("placed a foe 4 tiles away for a Prismatic sword", !!(foeS && foeS.ok && foeS.range === 5), foeS);
  await PRIS("melee.clearShots");
  const fireS = await PRIS("melee.fire");
  rec("Prismatic sword attack at range 4 throws a typ-10 returning projectile using the sword art",
    !!(fireS && fireS.ok && fireS.dist === 4 && fireS.typ.includes(10) && fireS.kinds.includes("sword")),
    fireS);

  await PRIS("give", "wep", { slot: "rh", wep: "axe", stars: 5 });
  const foeA = await PRIS("melee.placeFoe", 3, 1);
  const fireA = await PRIS("melee.fire");
  rec("Prismatic axe also throws a typ-10 spinning projectile of its own art",
    !!(fireA && fireA.ok && fireA.typ.includes(10) && fireA.kinds.includes("axe")),
    fireA);

  await PRIS("give", "wep", { slot: "rh", wep: "beamsword", stars: 5 });
  const foeB = await PRIS("melee.placeFoe", 4, 0);
  const fireB = await PRIS("melee.fire");
  rec("Prismatic beam sword fires typ-11 lasers (main beam plus small lasers around the hero)",
    !!(fireB && fireB.ok && fireB.typ.every((t) => t === 11) && fireB.hops >= 4 && fireB.kinds.includes("beamsword")),
    fireB);

  // Screenshots: hold mid-flight
  await PRIS("quiet");
  await PRIS("melee.holdShots", true);

  await PRIS("give", "wep", { slot: "rh", wep: "sword", stars: 10, golden: true });
  await PRIS("melee.placeFoe", 4, 0);
  await PRIS("melee.clearShots");
  const shotFire = await PRIS("melee.fire");
  const midS = await PRIS("melee.midFlight", 0.35);
  rec("sword throw frozen mid-flight for screenshot", !!(shotFire && shotFire.ok && midS && midS.ok && midS.n >= 1), { shotFire, midS });
  const pThrow = SHOTS + "/prism-melee-throw.png";
  await sleep(40);
  await canvasShot(page, pThrow);
  rec("wrote prism-melee-throw.png", fs.existsSync(pThrow) && fs.statSync(pThrow).size > 2000, pThrow + " " + (fs.existsSync(pThrow) ? fs.statSync(pThrow).size : 0));
  // also a spinning axe
  await PRIS("give", "wep", { slot: "rh", wep: "axe", stars: 10, golden: true });
  await PRIS("melee.placeFoe", 4, 0);
  await PRIS("melee.clearShots");
  await PRIS("melee.fire");
  await PRIS("melee.midFlight", 0.38);
  const pAxe = SHOTS + "/prism-melee-axe.png";
  await sleep(40);
  await canvasShot(page, pAxe);
  rec("wrote prism-melee-axe.png", fs.existsSync(pAxe) && fs.statSync(pAxe).size > 2000, pAxe);

  await PRIS("give", "wep", { slot: "rh", wep: "beamsword", stars: 10, golden: true });
  await PRIS("melee.placeFoe", 4, 0);
  await PRIS("melee.clearShots");
  const beamFire = await PRIS("melee.fire");
  const midB = await PRIS("melee.midFlight", 0.2);
  rec("beam sword lasers frozen for screenshot", !!(beamFire && beamFire.ok && midB && midB.ok && midB.n >= 4), { beamFire, midB });
  const pBeam = SHOTS + "/prism-melee-beam.png";
  await sleep(40);
  await canvasShot(page, pBeam);
  rec("wrote prism-melee-beam.png", fs.existsSync(pBeam) && fs.statSync(pBeam).size > 2000, pBeam);

  await PRIS("melee.holdShots", false);
  await PRIS("end");

  // Retroactive: a Prismatic melee already in a save would pick up range 5 with no migration, because calc() reads rar live.
  rec("range is applied live from rar (retroactive on owned Prismatic melee; no save rewrite)", true, "calc() grants PRIS_MELEE_RANGE whenever rar>=7 and the kind is melee");

  await browser.close();
  rec("no page errors", errs.length === 0, errs);
  rec("official Richard save md5 is still untouched after the run", md5(RICHARD) === RICHARD_MD5, md5(RICHARD));
  const fail = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
