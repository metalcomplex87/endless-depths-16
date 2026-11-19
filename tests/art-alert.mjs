// Artifact-cave floor-entry alert: fires on cave floors, not on others; once per arrival;
// continue of an unseen cave fires; a packed al flag stops save-reload spam.
// Throwaway profiles only. Never touches the real Richard save.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const RICHARD = process.env.RICHARD_FILE || path.join(__dirname, "..", "saves/richard-boss-2026-11-17.txt");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1200) : ""));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/art-alert-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  try {
    await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".dc-root");
    await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.artAlertFire));
    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 41, lvl: 80 }));
    await sleep(200);
    const H = (n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
    const rates = await page.evaluate(() => window.__ED16_HZ.rates);
    rec("ART_CH is still 0.02 (1/50) and was not changed", rates && rates.ART_CH === 0.02, rates && { ART_CH: rates.ART_CH });

    // Confirm U layout on a forced cave
    const layout = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true, prize: "chest", haz: "lava" });
      HZ.wx("");
      let gen, tries = 0;
      for (; tries < 20; tries++) { gen = HZ.gen(32); if (gen && gen.art && gen.art.open === 1) break; }
      return { gen, acc: HZ.artAccess(), tries };
    });
    const acc = layout.acc, gen = layout.gen;
    const manh = acc && acc.prizeAt && acc.front
      ? Math.abs(acc.prizeAt[0] - acc.front[0]) + Math.abs(acc.prizeAt[1] - acc.front[1])
      : -1;
    rec("U-shaped cave is still live (open=1, prize immediately behind lava, manhattan 4)",
      !!(gen && gen.art && gen.art.open === 1 && manh === 4 && acc && acc.door == null),
      { open: gen && gen.art && gen.art.open, manh, door: acc && acc.door, prizeAt: acc && acc.prizeAt, front: acc && acc.front });

    const chestFire = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true, prize: "chest", haz: "lava" });
      HZ.wx("");
      let gen;
      for (let i = 0; i < 20; i++) { gen = HZ.gen(32); if (gen && gen.art) break; }
      HZ.artAlertReset();
      return { gen, fire: HZ.artAlertFire() };
    });
    const cf = chestFire.fire;
    rec("chest cave fires the unique plate (not msg/setBanner) naming a Resplendent Chest",
      !!(cf && cf.fired && cf.show && cf.txt === "A Resplendent Chest lies sealed behind lava nearby!" && cf.rc === 1 && cf.al === 1),
      chestFire);
    rec("alert is not the normal top banner or msg() line",
      !!(cf && cf.show && cf.banner !== cf.txt && !(cf.msgs || []).includes(cf.txt) && cf.warn !== cf.txt),
      { banner: cf && cf.banner, warn: cf && cf.warn, msgs: cf && cf.msgs });
    rec("sfx name is the unique artVault fanfare",
      !!(cf && cf.sfx && cf.sfx.includes("artVault") && cf.sfxName === "artVault"),
      cf && { sfx: cf.sfx, sfxName: cf.sfxName });
    rec("compass hint names a cardinal direction or 'here'",
      !!(cf && typeof cf.sub === "string" && /To the (north|south|east|west)|Cross the lava/.test(cf.sub)),
      cf && cf.sub);

    const second = await H("artAlertFire");
    rec("a second fire on the same arrival is refused (al already set)",
      !!(second && second.fired === false && second.al === 1 && second.show),
      second);

    const artFire = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true, prize: "art", haz: "lava" });
      HZ.wx("");
      let gen;
      for (let i = 0; i < 20; i++) { gen = HZ.gen(33); if (gen && gen.art && !gen.art.rc) break; }
      HZ.artAlertReset();
      return HZ.artAlertFire();
    });
    rec("artifact cave names An Artifact in the alert text",
      !!(artFire && artFire.fired && artFire.txt === "An Artifact lies sealed behind lava nearby!" && artFire.rc === 0 && artFire.prize === "art"),
      artFire);

    const none = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({});
      HZ.wx("");
      const out = [];
      for (let i = 0; i < 16; i++) {
        const r = HZ.gen(10);
        HZ.artAlertReset();
        const f = HZ.artAlertFire();
        out.push({ art: !!(r && r.art), fired: !!(f && f.fired), show: !!(f && f.show) });
      }
      return out;
    });
    rec("floors without a cave never fire the alert (16 floors below the cave depth gate)",
      none.every((x) => !x.art && !x.fired && !x.show),
      none.filter((x) => x.art || x.fired || x.show));

    const natural = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({});
      HZ.wx("");
      const res = { cave: 0, caveFired: 0, empty: 0, emptyFired: 0 };
      for (let i = 0; i < 40; i++) {
        let d = 26 + (i % 20);
        if (d % 5 === 0) d++;
        const r = HZ.gen(d);
        HZ.artAlertReset();
        const f = HZ.artAlertFire();
        if (r && r.art) { res.cave++; if (f && f.fired) res.caveFired++; }
        else { res.empty++; if (f && f.fired) res.emptyFired++; }
      }
      return res;
    });
    rec("on natural rolls, the alert fires on every cave floor and on no other floor",
      natural.caveFired === natural.cave && natural.emptyFired === 0 && natural.empty > 0,
      natural);

    const muteFire = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true, prize: "chest", haz: "lava" });
      HZ.wx("");
      for (let i = 0; i < 12; i++) { const r = HZ.gen(32); if (r && r.art) break; }
      HZ.mute(true);
      HZ.artAlertReset();
      const fired = HZ.artAlertFire();
      HZ.mute(false);
      return fired;
    });
    rec("alert still shows when muted; mixer honors mute (sfx name still recorded)",
      !!(muteFire && muteFire.fired && muteFire.show && muteFire.muted === true && muteFire.txt.indexOf("Resplendent Chest") >= 0 && muteFire.sfx.includes("artVault")),
      muteFire);

    const persist = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true, prize: "chest", haz: "lava" });
      HZ.wx("");
      for (let i = 0; i < 16; i++) { const r = HZ.gen(34); if (r && r.art) break; }
      HZ.artAlertReset();
      const before = HZ.artAlertFire();
      const code = HZ.saveCode();
      HZ.artAlertReset();
      const loaded = HZ.load(code);
      const first = HZ.artAlert();
      const second = HZ.artAlertFire();
      return { before, codeLen: (code || "").length, codeOk: typeof code === "string" && code.indexOf("ED2-") === 0, loaded: !!(loaded && loaded.ok), first, second, art: HZ.state() && HZ.state().art };
    });
    rec("save code captured after the alert has marked the floor",
      !!(persist.before && persist.before.fired && persist.codeOk),
      { fired: persist.before && persist.before.fired, al: persist.before && persist.before.al, codeLen: persist.codeLen });
    rec("save-reload of the same floor does not fire again (al persisted)",
      !!(persist.loaded && persist.art && persist.art.al === 1 && persist.first && persist.first.show === false && persist.first.al === 1 && persist.second && persist.second.fired === false),
      persist);

    const cont = await page.evaluate(() => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true, prize: "chest", haz: "lava" });
      HZ.wx("");
      for (let i = 0; i < 16; i++) { const r = HZ.gen(36); if (r && r.art) break; }
      HZ.artAlertReset(); // unseen arrival, as on a first continue before the alert has played
      const code = HZ.saveCode();
      HZ.artAlertReset();
      const loaded = HZ.load(code);
      const first = HZ.artAlert();
      return { loaded: !!(loaded && loaded.ok), first, art: HZ.state() && HZ.state().art };
    });
    rec("first floor load after a continue fires when the cave was not yet alerted",
      !!(cont.loaded && cont.first && cont.first.show && cont.first.al === 1 && cont.first.txt.indexOf("Resplendent Chest") >= 0 && cont.first.sfx.includes("artVault")),
      cont);

    rec("no page errors", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("ART-ALERT: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
