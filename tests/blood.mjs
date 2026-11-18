import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "blood");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/blood-" + Date.now();
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
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_BLOOD && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function main() {
  console.log("BLOOD tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const begin = await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 5, lvl: 8 }));
    record("pris begin", !!(begin && begin.ok), JSON.stringify(begin || {}));

    const cols = await page.evaluate(() => {
      const O = window.__ED16_BLOOD;
      return { def: O.bloodColor(1), slime: O.bloodColor(0), undead: O.bloodColor(3), colors: O.colors, cap: O.consts.SPLAT_CAP };
    });
    record("default blood is a dark red", cols.def === cols.colors.def, JSON.stringify(cols));
    record("slimes use a dark ichor green", cols.slime === cols.colors.slime, JSON.stringify(cols));
    record("undead use a sickly green-brown", cols.undead === cols.colors.undead, JSON.stringify(cols));
    record("splatter cap is modest for performance", typeof cols.cap === "number" && cols.cap <= 64, String(cols.cap));

    // floor spray: at the corpse and along the gib direction, no further than 2 tiles
    await page.evaluate(() => window.__ED16_BLOOD.carve({ span: 8 }));
    const floor = await page.evaluate(() => {
      const O = window.__ED16_BLOOD;
      const st = O.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0, fam: 1 });
      const TS = O.consts.TS;
      const origin = { x: st.ox, y: st.oy };
      const floors = (st.splats || []).filter((s) => !s.wall);
      const walls = (st.splats || []).filter((s) => s.wall);
      let maxFwd = 0, behind = 0, atOrigin = 0, offAxis = 0;
      for (const s of floors) {
        const dx = (s.x - origin.x) / TS, dy = (s.y - origin.y) / TS;
        const fwd = dx; // travel dir is +x
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.55) atOrigin++;
        if (fwd < -0.55) behind++;
        if (dist > maxFwd && fwd >= 0) maxFwd = dist;
        if (Math.abs(dy) > 1.4 && fwd > 0.4) offAxis++;
      }
      return { floor: floors.length, wall: walls.length, maxFwd, behind, atOrigin, offAxis, colors: floors.map((s) => s.c) };
    });
    record("kill leaves a light floor splat at the corpse",
      !!(floor && floor.floor >= 1 && floor.atOrigin >= 1),
      JSON.stringify(floor));
    record("floor splat extends along the death-particle direction up to 2 tiles",
      !!(floor && floor.maxFwd > 0.6 && floor.maxFwd <= 2.4),
      JSON.stringify({ maxFwd: floor && floor.maxFwd, floor: floor && floor.floor }));
    record("open-floor kill has no wall splat when no wall is within 3 tiles",
      !!(floor && floor.wall === 0),
      JSON.stringify({ wall: floor && floor.wall }));
    record("default enemy splat uses the dark-red color",
      !!(floor && floor.colors.length && floor.colors.every((c) => c === cols.colors.def)),
      JSON.stringify(floor && floor.colors));

    // wall within 3 tiles → face splat; wall at 4 → none
    await page.evaluate(() => window.__ED16_BLOOD.carve({ span: 8, wallDist: 2, dx: 1, dy: 0 }));
    const near = await page.evaluate(() => window.__ED16_BLOOD.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0, fam: 1 }));
    record("a wall within 3 tiles in the travel direction gets a light face splat",
      !!(near && near.wall >= 1 && near.floor >= 1),
      JSON.stringify({ floor: near && near.floor, wall: near && near.wall }));

    const shotWall = path.join(SHOTS, "blood-wall-412x780.png");
    await page.evaluate(() => window.__ED16_BLOOD.tick(0.05));
    await page.screenshot({ path: shotWall, fullPage: false });
    record("wall-splatter screenshot", fs.existsSync(shotWall) && fs.statSync(shotWall).size > 1000, shotWall);

    await page.evaluate(() => window.__ED16_BLOOD.carve({ span: 8, wallDist: 5, dx: 1, dy: 0 })); // 4 tiles past the dummy at hero+1
    const far = await page.evaluate(() => window.__ED16_BLOOD.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0, fam: 1 }));
    record("a wall 4 tiles away does not receive a wall splat",
      !!(far && far.wall === 0 && far.floor >= 1),
      JSON.stringify({ floor: far && far.floor, wall: far && far.wall }));

    // slime color + open-floor screenshot
    await page.evaluate(() => window.__ED16_BLOOD.carve({ span: 8 }));
    const slime = await page.evaluate(() => window.__ED16_BLOOD.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0, fam: 0 }));
    record("slime deaths use ichor-green splatters",
      !!(slime && slime.splats && slime.splats.length && slime.splats.every((s) => s.c === "#3a5a18")),
      JSON.stringify(slime && slime.splats && slime.splats.map((s) => s.c)));

    const shotFloor = path.join(SHOTS, "blood-floor-412x780.png");
    await page.evaluate(() => window.__ED16_BLOOD.tick(0.05));
    await page.screenshot({ path: shotFloor, fullPage: false });
    record("floor-splatter screenshot", fs.existsSync(shotFloor) && fs.statSync(shotFloor).size > 1000, shotFloor);

    const undead = await page.evaluate(() => window.__ED16_BLOOD.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0, fam: 3 }));
    record("undead deaths use sickly green-brown splatters",
      !!(undead && undead.splats && undead.splats.length && undead.splats.every((s) => s.c === "#4a5a24")),
      JSON.stringify(undead && undead.splats && undead.splats.map((s) => s.c)));

    // unsaved
    await page.evaluate(() => window.__ED16_BLOOD.carve({ span: 8 }));
    const saved = await page.evaluate(() => {
      const O = window.__ED16_BLOOD;
      O.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0 });
      return O.floorSnapHasSplats();
    });
    record("splatter is per-layer and not written into the floor snapshot",
      !!(saved && saved.ok && saved.has === false),
      JSON.stringify(saved));

    // fade / cap
    const fade = await page.evaluate(() => {
      const O = window.__ED16_BLOOD;
      O.carve({ span: 8 });
      O.killDummy({ remain: 8, dmg: 8, dx: 1, dy: 0 });
      const before = O.state();
      for (let i = 0; i < 20; i++) O.tick(0.5); // 10s > SPLAT_LIFE
      const after = O.state();
      const capN = O.consts.SPLAT_CAP;
      for (let i = 0; i < 40; i++) O.burst({ r: 1, dx: 1, dy: 0, n: 1, blood: true, clearBlood: false, fam: 1 });
      const capped = O.state();
      return { before: before.splats.length, after: after.splats.length, capN, capped: capped.splats.length };
    });
    record("splatters fade out over a few seconds",
      !!(fade && fade.before >= 1 && fade.after === 0),
      JSON.stringify(fade));
    record("active splatters are capped",
      !!(fade && fade.capped <= fade.capN),
      JSON.stringify(fade));

    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("BLOOD " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
