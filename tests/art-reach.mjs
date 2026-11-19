// Artifact cave U-layout: the prize is reachable 100% across the lava (Lavastrider or Paramount
// obsidian) and never through the outer metal walls. Throwaway profiles only; never touches real saves.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const N = Number(process.env.ART_REACH_N || 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1000) : ""));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/art-reach-" + Date.now(),
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
    await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.artAccess));
    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 41, lvl: 80 }));
    await sleep(300);

    const batch = await page.evaluate((N) => {
      const HZ = window.__ED16_HZ;
      HZ.force({ art: true });
      HZ.wx("");
      const fails = [];
      let n = 0, chests = 0, arts = 0;
      const t0 = Date.now();
      for (let i = 0; i < N * 4 && n < N; i++) {
        let d = 26 + (i % 24);
        if (d % 5 === 0) d++;
        const r = HZ.gen(d);
        if (!r || !r.art) continue;
        n++;
        if (r.art.rc) chests++; else arts++;
        const acc = HZ.artAccess();
        const bad = [];
        if (acc.noAffix !== false) bad.push("reachable-without-crossing-lava");
        if (acc.withAffix !== true) bad.push("lavastrider-could-not-reach-prize");
        if (acc.reachAfterParamount !== true) bad.push("paramount-obsidian-could-not-reach-prize");
        if (acc.wallsBroken) bad.push("outer-walls-broke:" + acc.wallsBroken);
        if (acc.noAffixAfterWallAttacks !== false) bad.push("entered-through-outer-walls");
        if (acc.noAffixAfterUlt !== false) bad.push("ult-opened-a-path");
        if (acc.moveBlockedNoAffix !== true) bad.push("moat-not-blocked");
        const prize = acc.prizeAt || acc.pedestal, front = acc.front;
        if (!prize || !front) bad.push("missing-coords");
        else {
          const manh = Math.abs(prize[0] - front[0]) + Math.abs(prize[1] - front[1]);
          // front at s=-1, prize at s=3, same q=0 → manhattan 4
          if (manh !== 4) bad.push("prize-not-immediately-behind-lava:manh=" + manh);
        }
        if (r.art.open !== 1) bad.push("hidden-door-still-present");
        if (bad.length) fails.push({ depth: r.depth, art: r.art, bad, acc: { noAffix: acc.noAffix, withAffix: acc.withAffix, reachAfterParamount: acc.reachAfterParamount, wallsBroken: acc.wallsBroken, prizeAt: acc.prizeAt, front: acc.front } });
      }
      HZ.force({});
      return { n, chests, arts, fails, ms: Date.now() - t0 };
    }, N);

    rec("generated " + N + " caves for the reachability proof", batch.n === N, { n: batch.n, ms: batch.ms, arts: batch.arts, chests: batch.chests });
    rec("BFS: prize is unreachable without crossing the lava, on every cave", batch.n === N && batch.fails.every((f) => !f.bad.includes("reachable-without-crossing-lava") && !f.bad.includes("moat-not-blocked")), batch.fails.filter((f) => f.bad.includes("reachable-without-crossing-lava") || f.bad.includes("moat-not-blocked")));
    rec("BFS: Lavastrider can reach the prize on every cave (100%)", batch.n === N && batch.fails.every((f) => !f.bad.includes("lavastrider-could-not-reach-prize")), batch.fails.filter((f) => f.bad.includes("lavastrider-could-not-reach-prize")));
    rec("BFS: Paramount obsidian can reach the prize on every cave (100%)", batch.n === N && batch.fails.every((f) => !f.bad.includes("paramount-obsidian-could-not-reach-prize")), batch.fails.filter((f) => f.bad.includes("paramount-obsidian-could-not-reach-prize")));
    rec("hero cannot get in through the outer walls (0 broken, still unreachable after wall attacks)", batch.n === N && batch.fails.every((f) => !f.bad.some((b) => /outer-walls|entered-through|ult-opened/.test(b))), batch.fails.filter((f) => f.bad.some((b) => /outer-walls|entered-through|ult-opened/.test(b))));
    rec("prize sits immediately behind the lava (manhattan 4 from the front tile) and there is no door", batch.n === N && batch.fails.every((f) => !f.bad.some((b) => /immediately-behind|hidden-door/.test(b))), batch.fails.filter((f) => f.bad.some((b) => /immediately-behind|hidden-door/.test(b))));
    rec("no cave failed any reachability check", batch.fails.length === 0, { fails: batch.fails.slice(0, 8), n: batch.n });
    rec("no page errors", errors.length === 0, errors);
  } finally {
    await browser.close().catch(() => {});
  }
  const fail = results.filter((r) => !r.pass);
  console.log("ART-REACH: " + results.filter((r) => r.pass).length + "/" + results.length + " passed");
  if (fail.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
