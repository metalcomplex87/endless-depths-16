// Neon Skyfall: thicker beams, capped impact decals, violent cast + impact SFX.
// Throwaway profile only. Official Richard save is never written; any load uses a COPY.
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.ED16_PORT || 50432);
const BASE = process.env.ED16_URL || ("http://127.0.0.1:" + PORT + "/");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = process.env.RICHARD_FILE || path.join(ROOT, "saves/richard-boss-2026-11-17.txt");
const RICHARD_MD5 = "4c155ae35dc8eacf8dd4ab400adf75a5";
const COPY = "/tmp/richard-boss-COPY-laser.txt";
const SHOTS = "/workspace/ed16-laser-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail).slice(0, 2000) });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 800) : ""));
  return !!pass;
}
function md5(p) { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"); }

function startServer() {
  if (process.env.ED16_URL) return null;
  return spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
}

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
  const officialMd5 = md5(RICHARD);
  rec("official Richard save md5 is untouched before the run", officialMd5 === RICHARD_MD5, officialMd5);
  fs.copyFileSync(RICHARD, COPY);
  rec("working from a COPY of the Richard save", fs.existsSync(COPY) && md5(COPY) === RICHARD_MD5 && COPY.includes("COPY"), COPY);

  const src = fs.readFileSync(path.join(ROOT, "src/game.tsx"), "utf8");
  rec("src defines nkSkyfall and nkSkyfallHit SFX cases", /case "nkSkyfall":/.test(src) && /case "nkSkyfallHit":/.test(src));
  rec("src beam widths are 1.4–1.6× the original 16/6/2", /NK_LASER_GLOW_W = 24/.test(src) && /NK_LASER_MID_W = 9/.test(src) && /NK_LASER_CORE_W = 3/.test(src));

  const srv = startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    userDataDir: "/tmp/ed16-profiles/skyfall-" + Date.now(),
    args: ["--no-sandbox", "--disable-gpu", "--mute-audio", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on("pageerror", (e) => { errs.push(e.message); console.log("PAGEERROR", e.message); });
  try {
    await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      try {
        const resp = await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 5000 });
        ready = !!(resp && resp.ok());
      } catch { await sleep(150); }
    }
    rec("local worktree server responded", ready, BASE);
    await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_NK));
    const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
    await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 150, lvl: 300 }));
    await sleep(200);
    await NK("grantAll");
    await NK("equip", 4);
    await NK("holdFx", true);
    await NK("quietHud");
    await NK("sfxSpy");
    const preview = await NK("triggerFx", 4);
    rec("triggerFx preview names Neon Skyfall and plays both SFX",
      !!(preview && preview.ok && preview.name === "Neon Skyfall" && (preview.sfx || []).includes("nkSkyfall") && (preview.sfx || []).some((x) => String(x).startsWith("nkSkyfallHit"))),
      preview);
    await sleep(80);
    const dest = path.join(SHOTS, "skyfall-after.png");
    await canvasShot(page, dest);
    rec("wrote skyfall-after.png", fs.existsSync(dest) && fs.statSync(dest).size > 1000, dest);

    const info0 = await NK("skyfallInfo");
    const scale = info0 && info0.scale;
    rec("beam width constants are ~1.5× (in the 1.4–1.6 range) with a hot core",
      !!(info0 && info0.glowW === 24 && info0.midW === 9 && info0.coreW === 3 && scale >= 1.4 && scale <= 1.6 && info0.glowW0 === 16),
      info0);
    rec("impact decals are pooled with a cap and a ~2s fade",
      !!(info0 && info0.markCap === 16 && info0.markLife === 2 && Array.isArray(info0.sfx) && info0.sfx.includes("nkSkyfall") && info0.sfx.includes("nkSkyfallHit")),
      info0);

    await NK("skyfallClear");
    await NK("sfxSpy");
    const burst = await NK("skyfallBurst", 4);
    const sfx4 = (burst && burst.sfx) || [];
    rec("cast SFX nkSkyfall is called when lasers fire", sfx4.includes("nkSkyfall") || sfx4.some((x) => String(x).startsWith("nkSkyfall") && !String(x).startsWith("nkSkyfallHit")), burst);
    rec("impact SFX nkSkyfallHit is called when lasers land", sfx4.includes("nkSkyfallHit") || sfx4.some((x) => String(x).startsWith("nkSkyfallHit")), burst);
    rec("a short burst spawns one impact decal per beam", !!(burst && burst.ok && burst.marks === 4 && burst.lasers === 4), burst);

    await NK("skyfallClear");
    await NK("sfxSpy");
    const over = await NK("skyfallBurst", 40);
    rec("impact decals are capped (pool reuse); 40 hits leave at most the cap",
      !!(over && over.ok && over.marks === over.markCap && over.markCap === 16 && over.marks < 40),
      over);
    const srcOk = /lastS\["nkSkyfallCast"\].*nowS - 80/.test(src) && /lastS\["nkSkyfallHit"\].*nowS - 55/.test(src);
    rec("SFX throttle in the audio engine gaps casts by 80ms and impacts by 55ms so a spray cannot stack one voice per beam",
      srcOk, { cast: /nkSkyfallCast/.test(src), hit: /nkSkyfallHit/.test(src), calls: over && over.sfx && over.sfx.length });

    await NK("holdFx", false);
    await NK("skyfallClear");
    await NK("sfxSpy");
    const cast = await NK("skyfallCast");
    rec("live hiring/cast path (moving + enemy in range) fires a laser and plays both SFX",
      !!(cast && cast.ok && cast.fired && (cast.marks > 0 || cast.lasers > 0) && (cast.sfx || []).includes("nkSkyfall") && (cast.sfx || []).some((x) => String(x).startsWith("nkSkyfallHit"))),
      cast);

    rec("no page errors during Neon Skyfall tests", errs.length === 0, errs);
  } finally {
    const after = md5(RICHARD);
    rec("official Richard save md5 is still untouched after the run", after === RICHARD_MD5, after);
    await browser.close().catch(() => {});
    if (srv) srv.kill("SIGTERM");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
