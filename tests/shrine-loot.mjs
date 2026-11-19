// Shrine swarm loot scales with kills. Throwaway profiles only; never touches real saves.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50410/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900) : ""));
}

const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);

async function open() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    userDataDir: "/tmp/ed16-profiles/shrine-loot-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root");
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_HZ && window.__ED16_HZ.swarmReward));
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 41, lvl: 80 }));
  await sleep(300);
  return { browser, page };
}

async function startSwarm(page) {
  await H(page, "wx", "");
  await H(page, "force", { shrine: true });
  const r = await H(page, "gen", 41);
  await H(page, "force", {});
  if (!r || !r.shrine) throw new Error("shrine did not spawn");
  await H(page, "goto", r.shrine.x, r.shrine.y + 1);
  await H(page, "step", 0, -1);
  const st = await H(page, "state");
  if (!st.swarm) throw new Error("swarm did not start");
  return st;
}

async function main() {
  const { browser, page } = await open();
  try {
    const rates = await page.evaluate(() => window.__ED16_HZ.rates);
    const ks = (rates.SWARM_TIERS || []).map((t) => t.k);
    rec("tiers start at 25 and include 40, 60, 100 (reachable in a 60s event)", ks[0] === 25 && ks.includes(40) && ks.includes(60) && ks.includes(100) && ks[ks.length - 1] >= 100, ks);

    const samples = {};
    for (const k of [0, 10, 24, 25, 40, 50, 60, 80, 100, 130]) {
      samples[k] = await H(page, "swarmReward", k);
    }
    rec("under 25 kills: no shrine loot (0, 10, 24)", [0, 10, 24].every((k) => samples[k].reward == null && samples[k].gold === 0), { 0: samples[0].reward, 10: samples[10].hud, 24: samples[24].hud });
    rec("HUD below 25 shows kills/25 and 'Bronze at 25'", samples[10].hud.count === "10/25 KILLS" && samples[10].hud.line === "Bronze at 25" && samples[24].hud.count === "24/25 KILLS", samples[10].hud);

    const at = (k) => samples[k].reward;
    rec("25 kills is Bronze base: 2 items, min rarity 1, gold x4, no gems", at(25) && at(25).n === "Bronze" && at(25).items === 2 && at(25).min === 1 && at(25).gold === 4 && at(25).gems === 0, at(25));
    rec("40 kills is Silver: 3 items, min 2, gold x7", at(40) && at(40).n === "Silver" && at(40).items === 3 && at(40).min === 2 && at(40).gold === 7, at(40));
    rec("60 kills is Gold: 4 items, min 3, gold x11, 1 gem", at(60) && at(60).n === "Gold" && at(60).items === 4 && at(60).min === 3 && at(60).gold === 11 && at(60).gems === 1, at(60));
    rec("100 kills is Relic: 6 items, min 5, gold x24, 2 gems, 35% Prismatic", at(100) && at(100).n === "Relic" && at(100).items === 6 && at(100).min === 5 && at(100).gold === 24 && at(100).gems === 2 && Math.abs(at(100).pris - 0.35) < 1e-9, at(100));
    rec("gold interpolates between tiers (50 is halfway from Silver x7 to Gold x11 = x9)", at(50) && at(50).n === "Silver" && at(50).items === 3 && Math.abs(at(50).gold - 9) < 1e-9, at(50));
    rec("each listed step pays more items and more gold than the last (25 < 40 < 60 < 100)", at(25).items < at(40).items && at(40).items < at(60).items && at(60).items < at(100).items && at(25).gold < at(40).gold && at(40).gold < at(60).gold && at(60).gold < at(100).gold, { 25: at(25).items, 40: at(40).items, 60: at(60).items, 100: at(100).items, gold: [at(25).gold, at(40).gold, at(60).gold, at(100).gold] });
    rec("HUD at 40 shows 40/60 KILLS and Silver, next Gold 60", samples[40].hud.count === "40/60 KILLS" && samples[40].hud.tier === "Silver" && /Gold 60/.test(samples[40].hud.line), samples[40].hud);
    rec("HUD at 100 shows 100/130 KILLS and Relic", samples[100].hud.count === "100/130 KILLS" && samples[100].hud.tier === "Relic", samples[100].hud);

    // Depth 41 raw gold (no gem bonus): (40 + 41*18) * mul = 778 * mul
    const raw = (mul) => Math.round(778 * mul);
    rec("example raw gold at depth 41 (no gem bonus): 25→3112, 40→5446, 60→8558, 100→18672", samples[25].goldRaw === raw(4) && samples[40].goldRaw === raw(7) && samples[60].goldRaw === raw(11) && samples[100].goldRaw === raw(24), { 25: samples[25].goldRaw, 40: samples[40].goldRaw, 60: samples[60].goldRaw, 100: samples[100].goldRaw, gemMul: samples[25].gemMul });

    // Live payouts: start a real swarm, set kill count, end it.
    const live = {};
    for (const k of [24, 25, 40, 60, 100]) {
      await startSwarm(page);
      await H(page, "swarmSetKills", k);
      const e = await H(page, "swarmEnd");
      live[k] = e;
    }
    rec("live end at 24 kills: no items, no gold, 'no reward' banner", live[24].items === 0 && live[24].gold === 0 && /no reward/i.test(live[24].sub || live[24].banner || ""), live[24]);
    rec("live end at 25: Bronze banner, 2 items, gold matches plan", live[25].name === "Bronze" && live[25].items === 2 && live[25].gold === live[25].goldPlan && live[25].gold > 0 && /BRONZE/i.test(live[25].banner || ""), live[25]);
    rec("live end at 40: Silver, 3 items, more gold than 25", live[40].name === "Silver" && live[40].items === 3 && live[40].gold > live[25].gold, { 25: live[25].gold, 40: live[40].gold, e: live[40] });
    rec("live end at 60: Gold, 4 items, more gold than 40", live[60].name === "Gold" && live[60].items === 4 && live[60].gold > live[40].gold, live[60]);
    rec("live end at 100: Relic, 6 items, more gold than 60", live[100].name === "Relic" && live[100].items === 6 && live[100].gold > live[60].gold, live[100]);
    rec("no page errors", errors.length === 0, errors);
  } finally {
    await browser.close().catch(() => {});
  }
  const fail = results.filter((r) => !r.pass);
  console.log("SHRINE-LOOT: " + results.filter((r) => r.pass).length + "/" + results.length + " passed");
  if (fail.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
