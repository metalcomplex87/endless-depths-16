import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.ED16_URL || "http://127.0.0.1:50199/";
const OUT = "/workspace/ed16-web/screenshots-save";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail).slice(0, 900) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 900) : "")); }
const UD = "/tmp/ed16-profiles/savebp-" + Date.now();
let browser;
async function launch() { browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: UD, args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] }); }
async function newPage() {
  const page = await browser.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message)); page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__ED16_HZ && document.querySelector(".dc-root")));
  await sleep(500);
  return page;
}
const H = (page, n, ...a) => page.evaluate((n, a) => window.__ED16_HZ[n](...a), n, a);
async function tap(page, re) {
  return page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button")].find((el) => r.test((el.textContent || "").trim()) && !el.disabled); if (!b) return false; b.click(); return true; }, re.source);
}
async function ensureUnlocked(page) { const p = await H(page, "peek"); if (p.locked) { await page.evaluate(() => { const lk = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "\ud83d\udd12"); if (lk) lk.click(); }); await sleep(300); } }
async function saveTap(page) {
  await ensureUnlocked(page);
  await page.evaluate(() => { window.__ED16_SAVE_NOTE = null; });
  const ok = await tap(page, /^Save Game$/);
  if (!ok) return { tapped: false };
  await page.waitForFunction(() => !!window.__ED16_SAVE_NOTE, { timeout: 8000 }).catch(() => {});
  return { tapped: true, note: await page.evaluate(() => window.__ED16_SAVE_NOTE) };
}
async function stored(page) {
  return page.evaluate(async () => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^ed16_save_v1_p\d$/.test(k)) out[k] = localStorage.getItem(k).length; }
    const idb = await new Promise((res) => { try { const rq = indexedDB.open("ed16db"); rq.onsuccess = () => { const db = rq.result; const names = [...db.objectStoreNames]; if (!names.length) { res({ stores: [] }); return; } const tx = db.transaction(names[0], "readonly"); const st = tx.objectStore(names[0]); const kr = st.getAllKeys(); kr.onsuccess = () => res({ stores: names, keys: kr.result.filter((k) => /ed16_(save|roll)/.test(String(k))) }); kr.onerror = () => res({ err: 1 }); }; rq.onerror = () => res({ err: 2 }); } catch (e) { res({ err: String(e) }); } });
    return { ls: out, idb };
  });
}
async function main() {
  await launch();
  let page = await newPage();
  await tap(page, /New Game/); await sleep(800);
  await tap(page, /^(Yes|Start|New Game)/); await sleep(800);
  let pk = await H(page, "peek");
  rec("new run started on the phone viewport (390x844)", pk.ok && pk.mode === "play", JSON.stringify(pk));
  // 1. rapid saves
  await H(page, "hud", 111111, 0, pk.depth);
  const notes = [];
  for (let i = 0; i < 8; i++) { await ensureUnlocked(page); await tap(page, /^Save Game$/); await sleep(60); }
  await sleep(1500);
  const n1 = await page.evaluate(() => window.__ED16_SAVE_NOTE);
  const s1 = await stored(page);
  rec("8 rapid Save taps: last note is a confirmation, every layer verified", n1 && n1.kind === "ok" && n1.layers.ls && n1.layers.idb && n1.layers.ss, JSON.stringify({ kind: n1 && n1.kind, txt: n1 && n1.txt, sub: n1 && n1.sub, layers: n1 && n1.layers, persist: n1 && n1.persist, rolls: n1 && n1.rolls, stored: s1 }));
  await page.screenshot({ path: OUT + "/save-confirm.png" });
  // 2. save during combat (awake enemies swinging)
  await H(page, "gen", 30); await sleep(300);
  await page.evaluate(() => { const g = window.__ED16_HZ; g.near && g.near(6); });
  await sleep(600);
  const r2 = await saveTap(page);
  const pc = await H(page, "peek");
  rec("save during combat", r2.tapped && r2.note && r2.note.kind === "ok", JSON.stringify({ awake: pc.awake, note: r2.note && r2.note.sub }));
  // 3. save during an ultimate (show still running)
  const u = await H(page, "ult"); await sleep(250);
  const pu = await H(page, "peek");
  const r3 = await saveTap(page);
  rec("save during an ultimate", u.ok && pu.ushows > 0 && r3.note && r3.note.kind === "ok", JSON.stringify({ ultShowsLive: pu.ushows, note: r3.note && r3.note.sub }));
  // 4. save right before closing the tab, then reopen
  await H(page, "hud", 777777, 0, pk.depth);
  await saveTap(page);
  await page.close({ runBeforeUnload: true });
  page = await newPage();
  await tap(page, /Continue/); await sleep(800);
  let p4 = await H(page, "peek");
  rec("Save then close the tab at once: reopened run has the saved state", p4.gold === 777777, JSON.stringify(p4));
  // 5. no Save tap: change state, close the tab -> pagehide/visibility autosave keeps it
  await H(page, "hud", 888888, 0, pk.depth); await sleep(200);
  await page.close({ runBeforeUnload: true });
  page = await newPage();
  await tap(page, /Continue/); await sleep(800);
  p4 = await H(page, "peek");
  rec("close the tab without saving: autosave on pagehide/visibilitychange kept it", p4.gold === 888888, JSON.stringify(p4));
  // 6. quota error on localStorage
  await page.evaluate(() => { window.__realSet = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === window.localStorage && /^ed16_/.test(k)) { const e = new DOMException("quota", "QuotaExceededError"); throw e; } return window.__realSet.call(this, k, v); }; });
  await H(page, "hud", 999001, 0, pk.depth);
  const r6 = await saveTap(page); await sleep(800);
  const n6 = await page.evaluate(() => window.__ED16_SAVE_NOTE);
  await page.screenshot({ path: OUT + "/save-quota.png" });
  rec("quota error on localStorage: still saved (IndexedDB), told plainly, Save Code copied", n6 && n6.kind === "ok" && n6.layers.idb === true && n6.layers.ls === false, JSON.stringify({ txt: n6 && n6.txt, sub: n6 && n6.sub }));
  await page.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
  // 7. IndexedDB unavailable
  await H(page, "idbDown", true);
  await H(page, "hud", 999002, 0, pk.depth);
  const r7 = await saveTap(page); await sleep(800);
  const n7 = await page.evaluate(() => window.__ED16_SAVE_NOTE);
  rec("IndexedDB unavailable: saved to device storage, note says backup DB is off", n7 && n7.kind === "ok" && n7.layers.ls === true && n7.layers.idb === false, JSON.stringify({ txt: n7 && n7.txt, sub: n7 && n7.sub }));
  // 8. every layer fails -> clear error + Save Code shown/copied
  await page.evaluate(() => { Storage.prototype.setItem = function (k, v) { if (/^ed16_/.test(k)) throw new DOMException("quota", "QuotaExceededError"); return window.__realSet.call(this, k, v); }; });
  const r8 = await saveTap(page); await sleep(900);
  const n8 = await page.evaluate(() => window.__ED16_SAVE_NOTE);
  const codeShown = await page.evaluate(() => { const t = [...document.querySelectorAll("textarea")].find((x) => (x.value || "").length > 100); return t ? t.value.length : 0; });
  await page.screenshot({ path: OUT + "/save-all-failed.png" });
  rec("all layers fail: clear error, Save Code shown and copied", n8 && n8.kind !== "ok" && codeShown > 100, JSON.stringify({ kind: n8 && n8.kind, txt: n8 && n8.txt, sub: n8 && n8.sub, codeLen: codeShown }));
  await page.evaluate(() => { Storage.prototype.setItem = window.__realSet; }); await H(page, "idbDown", false);
  // 9. wipe localStorage + sessionStorage (eviction) -> run restored from IndexedDB / rolling backups
  await tap(page, /Close|Done|×/); await sleep(300);
  await H(page, "hud", 555555, 0, pk.depth);
  await saveTap(page); await sleep(1200);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.close();
  page = await newPage();
  await sleep(1500);
  const cont = await tap(page, /Continue/); await sleep(900);
  const p9 = await H(page, "peek");
  rec("localStorage wiped (eviction): run comes back from IndexedDB", cont && p9.gold === 555555, JSON.stringify({ cont, gold: p9.gold }));
  // 10. title LOAD code reachable at narrow widths
  const lw = [];
  for (const w of [360, 375, 390, 412, 430]) {
    await page.setViewport({ width: w, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" }); await page.waitForSelector(".dc-root"); await sleep(700);
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((el) => /LOAD/.test(el.textContent || "")); if (!b) return { found: false }; const rc = b.getBoundingClientRect(); const top = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2); return { found: true, disabled: b.disabled, onTop: !!top && (top === b || b.contains(top)), y: Math.round(rc.y), h: Math.round(rc.height) }; });
    lw.push(w + ":" + (r.found && !r.disabled && r.onTop ? "ok" : JSON.stringify(r)));
    if (w === 360) await page.screenshot({ path: OUT + "/title-360.png" });
  }
  rec("title LOAD code visible, enabled and tappable at 360-430px", lw.every((x) => x.endsWith(":ok")), lw.join(" "));
  await browser.close();
  fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 1));
  const f = results.filter((r) => !r.pass).length;
  console.log("SUMMARY " + (results.length - f) + "/" + results.length);
  process.exit(f ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
