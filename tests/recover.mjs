// Lost-profile recovery test (2026-11-18). Uses COPIES of save codes in synthetic browser profiles only.
import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50177/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = fs.readFileSync("/workspace/ed16test/user_save_code.txt", "utf8").replace(/\s+/g, "");
const OLDCODE = fs.readFileSync("/workspace/ed16test/son_save_t2295u.txt", "utf8").replace(/\s+/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (step, pass, d = "") => { results.push({ step, pass: !!pass, d }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (d ? "  —  " + d : "")); };
const wrap = (code, lvl, depth, t) => JSON.stringify({ v: 1, compact: 1, code, depth, lvl, t });

async function session(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", userDataDir: dir, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e && e.message));
  page.on("dialog", (d) => d.accept());
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  return { browser, page };
}
async function ready(page) {
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => { const t = document.body.innerText || ""; return t.includes("Choose a profile") && !t.includes("Loading saves"); }, { timeout: 25000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button.dc-prof")].every((b) => !b.disabled), { timeout: 20000 });
  await sleep(800);
}
const profLines = (page) => page.evaluate(() => [...document.querySelectorAll("button.dc-prof")].map((b) => b.innerText.replace(/\s+/g, " ").trim()));
const lsDump = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const idbPut = (page, k, v) => page.evaluate((k, v) => new Promise((res) => { const rq = indexedDB.open("ed16db", 1); rq.onupgradeneeded = () => rq.result.createObjectStore("kv"); rq.onsuccess = () => { const tx = rq.result.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => { rq.result.close(); res(true); }; }; }), k, v);
const idbGetAll = (page) => page.evaluate(() => new Promise((res) => { const rq = indexedDB.open("ed16db", 1); rq.onupgradeneeded = () => rq.result.createObjectStore("kv"); rq.onsuccess = () => { const st = rq.result.transaction("kv").objectStore("kv"); const a = st.getAllKeys(); a.onsuccess = () => { rq.result.close(); res(a.result.map(String)); }; }; }));

const R = wrap(RICHARD, 40, 60, Date.now() - 3600e3);
const PIPER = wrap(OLDCODE, 37, 52, Date.now() - 7200e3);
const PIPER_OLD = wrap(OLDCODE, 12, 14, Date.now() - 86400e3);

// ---- Scenario A: Piper's main key is gone; her data survives only in IndexedDB (pre-load snapshot) + an orphan export key.
{
  const { browser, page } = await session("/tmp/ed16-profiles/recover-a");
  await page.evaluate((R, P) => { localStorage.setItem("ed16_profile_mig_v1", "1"); localStorage.setItem("ed16_save_v1_p1", R); localStorage.setItem("ed16_piper_export_old", P); }, R, PIPER_OLD);
  await idbPut(page, "ed16_premig_p3", JSON.stringify({ b: "smoke-1795033651844", t: Date.now(), raw: PIPER }));
  const before = await lsDump(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  let lines = await profLines(page);
  rec("A: picker lists Richard, Jax, Piper", lines.length === 3 && /Richard/.test(lines[0]) && /Jax/.test(lines[1]) && /Piper/.test(lines[2]), lines.join(" | "));
  rec("A: Piper auto-recovered from IndexedDB (Lv 37 · Depth 52)", /Piper.*Lv 37.*Depth 52/.test(lines[2]), lines[2]);
  rec("A: Richard still Lv 40 · Depth 60", /Lv 40.*Depth 60/.test(lines[0]), lines[0]);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button.dc-prof")].find((el) => el.innerText.includes("Piper")); b.click(); });
  await sleep(1500);
  const playing = await page.evaluate(() => !document.querySelector("div.dc-profs") && !!document.querySelector("button.dc-savegame"));
  rec("A: tapping Piper loads her old-format run into play", playing);
  // Recover list shows the orphan export key
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Profiles"); if (b) b.click(); });
  await sleep(500);
  if (!(await page.$("div.dc-profs"))) { await page.evaluate(() => { const q = document.querySelector("button.dc-quit"); if (q) q.click(); }); await sleep(300); }
  await page.evaluate(() => { const b = document.querySelector("button.dc-recover"); if (b) b.click(); });
  await sleep(1500);
  const recText = await page.evaluate(() => (document.querySelector(".dc-rec") || {}).innerText || "");
  rec("A: Recover lost profiles lists the orphan Piper export", /ed16_piper_export_old/.test(recText) && /Lv 12/.test(recText), recText.replace(/\s+/g, " ").slice(0, 200));
  const after = await lsDump(page);
  const lost = Object.keys(before).filter((k) => !(k in after));
  rec("A: no localStorage key was deleted", lost.length === 0, lost.join(","));
  rec("A: Richard's save bytes unchanged", after["ed16_save_v1_p1"] === R);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  lines = await profLines(page);
  rec("A: after reload all three profiles still have saves", lines.every((l) => /Lv \d+/.test(l)), lines.join(" | "));
  const keys = await idbGetAll(page);
  rec("A: backup-before-migrate snapshot exists for Piper", keys.includes("ed16_premig_p3"), keys.filter((k) => /premig|recover/.test(k)).join(","));
  await browser.close();
}

// ---- Scenario B: Piper's main key is corrupted, no backup; her data only under an unknown key. Manual Recover.
{
  const { browser, page } = await session("/tmp/ed16-profiles/recover-b");
  await page.evaluate((R, P) => { localStorage.setItem("ed16_profile_mig_v1", "1"); localStorage.setItem("ed16_save_v1_p1", R); localStorage.setItem("ed16_save_v1_p3", "{corrupt"); localStorage.setItem("ed16_save_old_piper", P); }, R, PIPER);
  const before = await lsDump(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  let lines = await profLines(page);
  rec("B: Piper listed as 'save found but not readable' (not silently empty)", /Piper.*not readable/.test(lines[2]), lines[2]);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button.dc-prof")].find((el) => el.innerText.includes("Piper")); b.click(); });
  await sleep(800);
  const note = await page.evaluate(() => document.body.innerText);
  rec("B: tapping damaged Piper warns not to start New Game", /kept safe/.test(note), "");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Profiles"); if (b) b.click(); });
  await sleep(400);
  await page.evaluate(() => { const b = document.querySelector("button.dc-recover"); if (b) b.click(); });
  await sleep(1500);
  const ok = await page.evaluate(() => { const row = [...document.querySelectorAll(".dc-rec-row")].find((r) => r.innerText.includes("ed16_save_old_piper")); if (!row) return false; const b = [...row.querySelectorAll("button")].find((x) => x.innerText.includes("Piper")); b.click(); return true; });
  await sleep(800);
  lines = await profLines(page);
  rec("B: Recover → To Piper restores her (Lv 37 · Depth 52)", ok && /Piper.*Lv 37.*Depth 52/.test(lines[2]), lines[2]);
  const after = await lsDump(page);
  const prevKey = Object.keys(after).find((k) => k.startsWith("ed16_recover_prev_p3_"));
  rec("B: the corrupt blob was kept (not deleted) as " + (prevKey || "?"), prevKey && after[prevKey] === "{corrupt");
  rec("B: no key deleted, Richard unchanged", Object.keys(before).every((k) => k in after) && after["ed16_save_v1_p1"] === R);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  lines = await profLines(page);
  rec("B: after reload Piper and Richard still listed with saves", /Piper.*Lv 37/.test(lines[2]) && /Richard.*Lv 40/.test(lines[0]), lines.join(" | "));
  await page.evaluate(() => { const b = [...document.querySelectorAll("button.dc-prof")].find((el) => el.innerText.includes("Piper")); b.click(); });
  await sleep(1500);
  rec("B: restored Piper loads into play", await page.evaluate(() => !document.querySelector("div.dc-profs") && !!document.querySelector("button.dc-savegame")));
  await browser.close();
}
const fails = results.filter((r) => !r.pass).length;
console.log(fails ? `RECOVER TEST: ${fails} FAIL` : `RECOVER TEST: ALL ${results.length} PASS`);
fs.writeFileSync("/workspace/ed16-web/tests/recover-results.json", JSON.stringify(results, null, 2));
process.exit(fails ? 1 : 0);
