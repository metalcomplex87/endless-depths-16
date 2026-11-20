// Eternum necklaces: owned ones must never drop again. Throwaway profile only; never touches real saves.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.ED16_PORT || 50421);
const BASE = process.env.ED16_URL || ("http://127.0.0.1:" + PORT + "/");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail).slice(0, 2000) });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 700) : ""));
  return !!pass;
}

function startServer() {
  if (process.env.ED16_URL) return null;
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  return srv;
}

async function main() {
  const srv = startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    userDataDir: "/tmp/ed16-profiles/nk-nodup-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--mute-audio", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK));
  const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
  await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 150, lvl: 300 }));
  await NK("gear", "full");
  await NK("setBase", 10, 10);
  await NK("setDepth", 120);

  // 1) with nothing owned, every regular can drop and Prismatic Eternum cannot
  await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]);
  await NK("clearGround"); await NK("resetLog");
  const r0 = await NK("rollFrom", "act33", 80);
  rec("unowned: all seven regulars can drop, no Prismatic Eternum", r0.drops.slice(0, 7).every((v) => v > 0) && r0.drops[7] === 0, r0.drops.join("/"));

  // 2) owned indexes are excluded from every source (roll + real kill + chest)
  const own = [1, 0, 1, 0, 1, 0, 0, 0]; // Storm Crown, Phalanx, Neon Skyfall
  await NK("setOwn", own);
  await NK("clearGround"); await NK("resetLog");
  const rMix = await NK("rollFrom", "act33", 200);
  await NK("clearGround"); await NK("resetLog");
  const rKill = { drops: [0, 0, 0, 0, 0, 0, 0, 0] };
  for (let i = 0; i < 40; i++) { const r = await NK("killFrom", "act33"); r.drops.forEach((v, j) => rKill.drops[j] += v); }
  await NK("clearGround"); await NK("resetLog");
  const rChest = { drops: [0, 0, 0, 0, 0, 0, 0, 0] };
  for (let i = 0; i < 40; i++) { const r = await NK("openChestFrom", 4); r.drops.forEach((v, j) => rChest.drops[j] += v); }
  const ownedDropped = (d) => [0, 2, 4, 7].some((i) => d[i] > 0);
  const unownedOk = (d) => [1, 3, 5, 6].every((i) => d[i] > 0);
  rec("rollFrom: owned necklaces never drop; only unowned regulars do", !ownedDropped(rMix.drops) && unownedOk(rMix.drops), rMix.drops.join("/"));
  rec("kill(): owned necklaces never drop; only unowned regulars do", !ownedDropped(rKill.drops) && unownedOk(rKill.drops), rKill.drops.join("/"));
  rec("openChest(): owned necklaces never drop; only unowned regulars do", !ownedDropped(rChest.drops) && unownedOk(rChest.drops), rChest.drops.join("/"));

  // 3) a necklace already on the ground is also excluded (so picking both up cannot create a duplicate)
  await NK("setOwn", [0, 0, 0, 0, 0, 0, 0, 0]);
  await NK("clearGround"); await NK("resetLog");
  await NK("drop", 3, 2, 0);
  const rPend = await NK("rollFrom", "act33", 200);
  rec("a necklace already on the ground is not rolled again", rPend.drops[3] === 0 && rPend.drops.slice(0, 7).filter((v, i) => i !== 3).every((v) => v > 0), rPend.drops.join("/"));

  // 4) all seven owned, Prismatic Eternum not owned: no regular drop; PE may drop (at most one)
  await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 0]);
  await NK("clearGround"); await NK("resetLog");
  const rSeven = await NK("rollFrom", "act33", 80);
  rec("all seven owned: no regular necklace drops", rSeven.drops.slice(0, 7).every((v) => v === 0), rSeven.drops.join("/"));
  rec("all seven owned: Prismatic Eternum can drop, and only once while it sits on the ground", rSeven.drops[7] === 1, rSeven.drops.join("/"));

  // 5) all eight owned: nothing drops
  await NK("setOwn", [1, 1, 1, 1, 1, 1, 1, 1]);
  await NK("clearGround"); await NK("resetLog");
  const rAll = await NK("rollFrom", "act33", 200);
  const rAllK = { drops: [0, 0, 0, 0, 0, 0, 0, 0] };
  for (let i = 0; i < 40; i++) { const r = await NK("killFrom", "act33"); r.drops.forEach((v, j) => rAllK.drops[j] += v); }
  rec("all eight owned: rollFrom drops nothing", rAll.drops.every((v) => v === 0), rAll.drops.join("/"));
  rec("all eight owned: kill() drops nothing", rAllK.drops.every((v) => v === 0), rAllK.drops.join("/"));

  // 6) forced drop of an already-owned necklace is refused (no gold melt, ownership unchanged)
  await NK("setOwn", [0, 0, 0, 1, 0, 0, 0, 0]);
  await NK("clearGround"); await NK("clearBanner"); await NK("resetLog");
  await NK("drop", 3, 0, 0);
  await NK("tick", 0.05);
  const st = await NK("st"), ban = await NK("banner"), log = await NK("log");
  rec("forced drop of an owned necklace does not land or melt into gold", st.own[3] === 1 && st.gd.length === 0 && !(ban && /DUPLICATE/.test(String(ban.txt || ""))) && log.dup === 0 && log.drops[3] === 0, JSON.stringify({ own: st.own, gd: st.gd.length, ban, dup: log.dup, drops: log.drops }));

  rec("no page errors", errs.length === 0, errs.join(" | "));
  await browser.close();
  if (srv) { try { srv.kill("SIGTERM"); } catch { /* ignore */ } }
  const f = results.filter((r) => !r.pass).length;
  console.log("SUMMARY " + (results.length - f) + "/" + results.length);
  process.exit(f ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
