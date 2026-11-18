import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const AUDIO = path.join(__dirname, "audio");
fs.mkdirSync(AUDIO, { recursive: true });

const NEW_NAMES = [
  "Iron Keep", "Labyrinth Keys", "Candlelight Descent", "Waltz of Rust", "Lantern 6",
  "Five-Stone March", "Hollow Pulse", "Night Gear", "Moth Pavane", "Seven Bells",
];
const INSPIRED = new Set(["Iron Keep", "Labyrinth Keys", "Candlelight Descent"]);
const EXPECT_METER = {
  "Iron Keep": "4/4", "Labyrinth Keys": "4/4", "Candlelight Descent": "4/4",
  "Waltz of Rust": "3/4", "Lantern 6": "6/8", "Five-Stone March": "5/4",
  "Hollow Pulse": "4/4", "Night Gear": "4/4", "Moth Pavane": "3/4", "Seven Bells": "7/8",
};

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/music-" + Date.now();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new", userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 412, height: 780, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => !!(window.__ED16_PRIS && window.__ED16_MUSIC && window.__ED16_PRIS.begin), { timeout: 20000 });
  return { browser, page };
}

async function main() {
  console.log("MUSIC tests against " + BASE);
  const { browser, page } = await launch();
  try {
    const begin = await page.evaluate(() => window.__ED16_PRIS.begin({ depth: 5, lvl: 8 }));
    record("pris begin", !!(begin && begin.ok), JSON.stringify(begin || {}));

    const catalog = await page.evaluate(() => {
      const M = window.__ED16_MUSIC;
      return { songs: M.songs(), count: M.count(), camp: M.camp(), campIndex: M.campIndex, boss: M.boss() };
    });
    record("dungeon catalog has the original 5 plus 10 new tracks (15 total)",
      catalog.count === 15 && catalog.songs.length === 15,
      "count=" + catalog.count);
    const names = catalog.songs.map((s) => s.name);
    const missing = NEW_NAMES.filter((n) => !names.includes(n));
    record("all 10 new dungeon tunes are registered by name",
      missing.length === 0, missing.length ? missing.join(",") : names.slice(5).join(" | "));
    record("camp still uses Quiet Stones (index 2), not a new track",
      catalog.campIndex === 2 && catalog.camp && catalog.camp.name === "Quiet Stones",
      JSON.stringify(catalog.camp));
    record("act-boss theme is still Act Clash and is not in the dungeon rotation",
      catalog.boss && catalog.boss.name === "Act Clash" && !names.includes("Act Clash"),
      JSON.stringify(catalog.boss));

    const unique = new Set(names);
    record("every dungeon track has a unique name", unique.size === names.length, names.join(", "));

    const newSongs = catalog.songs.filter((s) => NEW_NAMES.includes(s.name));
    const meters = newSongs.map((s) => s.name + " " + s.meter + " " + s.bpm + "bpm " + s.mode);
    record("new tunes use a mix of meters including 3/4, 6/8, 5/4, and 7/8",
      ["3/4", "6/8", "5/4", "7/8", "4/4"].every((m) => newSongs.some((s) => s.meter === m)),
      meters.join(" | "));
    const tempoOk = newSongs.every((s) => s.bpm >= 50 && s.bpm <= 140);
    const tempoSpan = Math.max(...newSongs.map((s) => s.bpm)) - Math.min(...newSongs.map((s) => s.bpm));
    record("new tunes vary widely in tempo (span of at least 50 bpm)",
      tempoOk && tempoSpan >= 50, "span=" + tempoSpan + " " + newSongs.map((s) => s.bpm).join(","));
    let meterMatch = true;
    for (const s of newSongs) if (EXPECT_METER[s.name] && s.meter !== EXPECT_METER[s.name]) meterMatch = false;
    record("each new tune has its intended meter", meterMatch, JSON.stringify(newSongs.map((s) => [s.name, s.meter])));
    record("only two or three new tunes lean on the Mario/Zelda dungeon feel",
      newSongs.filter((s) => s.inspired).length >= 2 && newSongs.filter((s) => s.inspired).length <= 3,
      newSongs.filter((s) => s.inspired).map((s) => s.name + " (" + s.inspired + ")").join(", "));

    const picks = await page.evaluate(() => {
      const M = window.__ED16_MUSIC, n = M.count(), out = [];
      for (let cur = 0; cur < n; cur++) {
        const seen = new Set();
        for (let k = 0; k < n - 1; k++) seen.add(M.pickNext(cur, k / Math.max(1, n - 1)));
        out.push({ cur, nexts: [...seen], repeats: seen.has(cur), size: seen.size });
      }
      return out;
    });
    record("pickNextSong never repeats the current track and covers every other index",
      picks.every((p) => !p.repeats && p.size === catalog.count - 1),
      JSON.stringify(picks.map((p) => ({ cur: p.cur, size: p.size, repeats: p.repeats }))));

    // Play each dungeon song a short way without throwing
    const played = await page.evaluate(() => {
      const M = window.__ED16_MUSIC;
      const out = [];
      for (let i = 0; i < M.count(); i++) {
        const p = M.play(i);
        const t = M.tick(0.6);
        out.push({ i, name: p.name, playOk: !!(p && p.ok), tickOk: !!(t && t.ok), scheduled: t && t.scheduled, err: t && t.error });
      }
      return out;
    });
    record("every dungeon track starts and schedules without errors",
      played.length === 15 && played.every((p) => p.playOk && p.tickOk && p.scheduled > 0),
      JSON.stringify(played));

    // Full loop: after one cycle the rotator must move on
    const loops = await page.evaluate(() => {
      const M = window.__ED16_MUSIC;
      const out = [];
      for (let i = 0; i < M.count(); i++) out.push(M.loopOnce(i));
      return out;
    });
    record("every dungeon track can play a full loop and then advances to another song",
      loops.length === 15 && loops.every((r) => r && r.ok && r.looped && r.scheduled >= r.need),
      JSON.stringify(loops.map((r) => ({ name: r.name, looped: r.looped, songI: r.songI, start: r.start, need: r.need, scheduled: r.scheduled }))));

    // Render short wav previews for the 10 new tunes
    const rendered = [];
    for (let i = 0; i < catalog.songs.length; i++) {
      const song = catalog.songs[i];
      if (!NEW_NAMES.includes(song.name)) continue;
      const rec = await page.evaluate(async (idx) => window.__ED16_MUSIC.render(idx, 2.6), i);
      const ok = !!(rec && rec.ok && rec.wav && rec.peak > 0.0005);
      const file = path.join(AUDIO, slug(song.name) + ".wav");
      if (ok) {
        fs.writeFileSync(file, Buffer.from(rec.wav, "base64"));
      }
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      rendered.push({ name: song.name, ok, peak: rec && rec.peak, size, file, err: rec && rec.error });
      record("preview wav: " + song.name,
        ok && size > 1000,
        "peak=" + (rec && rec.peak && rec.peak.toFixed ? rec.peak.toFixed(4) : rec && rec.peak) + " bytes=" + size + (rec && rec.error ? " err=" + rec.error : "") + " " + file);
    }
    record("all 10 new-tune previews were written under tests/audio/",
      rendered.length === 10 && rendered.every((r) => r.ok && r.size > 1000),
      rendered.map((r) => r.name).join(", "));

    await page.evaluate(() => { if (window.__ED16_PRIS && window.__ED16_PRIS.end) window.__ED16_PRIS.end(); });
  } catch (err) {
    record("suite ran without throwing", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log("MUSIC " + (results.length - failed.length) + " passed, " + failed.length + " failed, " + results.length + " total");
  process.exit(failed.length ? 1 : 0);
}
main();
