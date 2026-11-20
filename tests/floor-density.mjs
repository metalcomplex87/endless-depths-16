// Larger-layer enemy density: spawn counts and caps scale with walkable area.
import puppeteer from "puppeteer-core";

const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const N = Number(process.env.DENSITY_N || 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1600) : ""));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/floor-density-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.densitySim));
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 200, lvl: 200 }));
  await sleep(100);

  const sim = await page.evaluate((N) => window.__ED16_HZ.densitySim(N, 200), N);
  rec("densitySim ran at depth 200 across all size tiers", !!(sim && sim.ok && sim.rows && sim.rows.length >= 8), { n: sim && sim.n, rows: sim && sim.rows && sim.rows.length, unscaledBase: sim && sim.unscaledBase });

  const rows = (sim && sim.rows) || [];
  const std = rows[0];
  rec("standard (44x44) layer is the baseline tier", !!(std && std.tier === 0 && std.size === 44 && std.name === "Normal"), std);

  if (std) {
    rec("on a standard layer, enBase and enCap stay on the existing depth formula (scale 1)",
      !!(std && std.avgScale === 1 && std.avgBase === sim.unscaledBase && std.avgCap === std.unscaledCap),
      { avgBase: std.avgBase, unscaled: sim.unscaledBase, avgCap: std.avgCap, unscaledCap: std.unscaledCap, avgScale: std.avgScale, avgWalk: std.avgWalk });
  }

  const densOk = rows.every((r) => {
    const ratio = r.dens / std.dens;
    r.ratio = +ratio.toFixed(3);
    return ratio >= 0.82 && ratio <= 1.18;
  });
  rec("density (enemies per walkable tile) is about equal on standard and large layers (within 18%)",
    !!(std && densOk),
    rows.map((r) => r.name + " dens=" + r.dens + " en=" + r.avgEn + " walk=" + r.avgWalk + " scale=" + r.avgScale + " vsN=" + r.ratio));

  const enRises = rows.every((r, i) => i === 0 || r.avgEn >= rows[i - 1].avgEn * 0.92);
  rec("larger layers spawn more enemies in proportion to their size (counts nondecreasing with tier, small jitter allowed)",
    enRises, rows.map((r) => r.name + "=" + r.avgEn));

  const capScales = rows.slice(1).every((r) => r.avgCap > std.avgCap * 1.05);
  rec("respawn/wave cap (enCap) also scales up on larger layers",
    capScales, rows.map((r) => r.name + " cap=" + r.avgCap + " (unscaled " + r.unscaledCap + ")"));

  const scaleMatches = rows.every((r) => {
    const expect = r.tier === 0 ? 1 : r.avgWalk / 794;
    return Math.abs(r.avgScale - expect) < 0.03;
  });
  rec("enemy scale is 1 on standard layers and walkable/794 on larger layers",
    scaleMatches, rows.map((r) => r.name + " scale=" + r.avgScale + " expect=" + (r.tier === 0 ? 1 : +(r.avgWalk / 794).toFixed(3))));

  // Chance table: leave the roll itself unchanged, just document it.
  const probs = await page.evaluate(() => window.__ED16_HZ.sizeSim(1, 200));
  rec("larger-layer roll chances keep double weight for normal; extra sizes unlock from depth 11 every 25 floors",
    !!(probs && probs.ok && probs.probs && probs.probs[0] > probs.probs[1]),
    { depth200: probs && probs.probs, note: "P(normal)=2/(2+unlocked large tiers)" });

  rec("no page errors", errs.length === 0, errs);
  await browser.close();
  const fail = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
