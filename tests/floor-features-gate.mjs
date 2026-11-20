// Seeded generation check: lava, ice, water puddles, and oversized maps
// start at depth 11 and can appear on every non-act floor from 11 onward.
// Act-boss floors (depth % 5 === 0) already exclude hazards and stay Normal by design.
import puppeteer from "puppeteer-core";

const BASE = process.env.ED16_URL || "http://127.0.0.1:50231/";
const N_LOW = Number(process.env.GATE_N_LOW || 80);
const N_HIGH = Number(process.env.GATE_N_HIGH || 400);
const N_ACT = Number(process.env.GATE_N_ACT || 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (d ? "  --  " + d.slice(0, 1800) : ""));
}
function pct(n, tot) { return tot ? +(100 * n / tot).toFixed(2) : 0; }
function isAct(d) { return d > 0 && d % 5 === 0; }
function playable(d) { return isAct(d) ? d + 1 : d; }

async function main() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/floor-gate-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.setDefaultTimeout(180000);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_HZ && window.__ED16_HZ.sampleDepth && window.__ED16_HZ.sizeProbs));
  // sampleDepth builds a throwaway in-memory game and sets GIB_SKIP_SAVE; it never writes a profile (including p1).

  const rates = await page.evaluate(() => window.__ED16_HZ.rates);
  rec("gates are depth >= 11",
    rates.HZ_MIN_DEPTH === 11 && rates.WX_MIN_DEPTH === 11 && rates.FLOOR_SIZE_START === 11 && rates.FLOOR_SIZE_STEP === 25,
    rates);

  async function sample(depth, n) {
    const r = await page.evaluate((depth, n) => window.__ED16_HZ.sampleDepth(depth, n), depth, n);
    r.rates = {
      water: +(100 * r.water / r.n).toFixed(2),
      lava: +(100 * r.lava / r.n).toFixed(2),
      ice: +(100 * r.ice / r.n).toFixed(2),
      oversized: +(100 * r.oversized / r.n).toFixed(2),
      weather: +(100 * r.wx / r.n).toFixed(2),
    };
    return r;
  }

  const low = [];
  let lowBad = 0;
  for (let d = 1; d <= 10; d++) {
    const r = await sample(d, N_LOW);
    low.push(r);
    if (r.water || r.lava || r.ice || r.oversized) lowBad++;
    console.log("  depth " + d + " (n=" + r.n + "): " + JSON.stringify(r.rates) + " sizes=" + JSON.stringify(r.sizes));
  }
  rec("depths 1-10: zero lava, ice, water puddles, or oversized maps",
    lowBad === 0,
    low.map((r) => "d" + r.depth + "=" + JSON.stringify(r.rates)));

  const targets = [11, 12, 30, 51, 150];
  const report = {};
  for (const d of targets) {
    const exact = await sample(d, isAct(d) ? N_ACT : N_HIGH);
    let effective = exact;
    let note = "exact depth";
    if (isAct(d)) {
      const adj = playable(d);
      effective = await sample(adj, N_HIGH);
      note = "act-boss floor (depth % 5 === 0): hazards and oversized maps are excluded by design; rates below are from depth " + adj;
      rec("depth " + d + " is an act-boss floor and stays clear/Normal by design",
        exact.water === 0 && exact.lava === 0 && exact.ice === 0 && exact.oversized === 0 && exact.sizes["44"] === exact.n,
        { exact: exact.rates, sizes: exact.sizes });
      const probs = await page.evaluate((d) => window.__ED16_HZ.sizeProbs(d), d);
      rec("depth " + d + " still unlocks oversized tiers (gate is >= 11); act floors just do not roll them",
        Array.isArray(probs) && probs[1] > 0,
        { probs });
    }
    report[d] = { exact, effective, note };
    const ok = effective.water > 0 && effective.lava > 0 && effective.ice > 0 && effective.oversized > 0;
    rec("depth " + (isAct(d) ? playable(d) + " (playable neighbor of " + d + ")" : d) + ": lava, ice, puddles, and oversized maps each appear at a nonzero rate",
      ok,
      { n: effective.n, rates: effective.rates, sizes: effective.sizes, note });
    console.log("  TARGET " + d + " -> sampled " + effective.depth + ": " + JSON.stringify(effective.rates));
  }

  rec("no page errors", errs.length === 0, errs);
  await browser.close();

  console.log("\n=== rate summary ===");
  console.log(JSON.stringify({
    low: low.map((r) => ({ depth: r.depth, n: r.n, rates: r.rates })),
    targets: Object.fromEntries(Object.entries(report).map(([d, v]) => [d, {
      act: isAct(Number(d)),
      note: v.note,
      exactDepthRates: v.exact.rates,
      sampledDepth: v.effective.depth,
      rates: v.effective.rates,
    }])),
  }, null, 2));

  const fail = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
