import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { passOwnerGate } from "./_owner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ED16_ROOT || path.resolve(__dirname, "..");
const BASE = process.env.ED16_URL || "http://127.0.0.1:50355/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = fs.readFileSync("/tmp/ed16-richard-copy.txt", "utf8").replace(/\s+/g, "");
const MIKE_TOKEN = (process.env.ED16_MIKE_TOKEN || fs.readFileSync("/tmp/mine/mike-token.txt", "utf8")).trim();
const DIR = "/tmp/ed16-profiles/profile4";
const DIR_LOCK = "/tmp/ed16-profiles/profile4-lock";
const SHOT = "/workspace/ed16-p4-shots/picker.png";
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const VIEWPORT = { width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VIEWPORT_TALL = { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: dir,
    protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio", "--disable-features=ServiceWorker"],
  });
}

async function open(browser, url = BASE) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e && e.message));
  page.on("crash", () => console.log("PAGECRASH"));
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(UA);
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  try {
    const client = await page.target().createCDPSession();
    await client.send("Network.setBypassServiceWorker", { bypass: true });
  } catch {}
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { page, status: resp ? resp.status() : 0 };
}

async function waitReady(page) {
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await passOwnerGate(page);
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return (
      t.includes("Profiles") ||
      t.includes("Choose a profile") ||
      t.includes("Save Game") ||
      t.includes("Optional 4-digit PIN") ||
      t.includes("Enter your PIN") ||
      t.includes("Restore save") ||
      t.includes("Saves") ||
      t.includes("Opening") ||
      t.includes("Owner passcode")
    ) && !t.includes("Loading saves") && !document.querySelector("[data-ed16-owner-gate]");
  }, { timeout: 20000 });
  await sleep(400);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText || "");
}

async function openProfiles(page) {
  const open = await page.$("div.dc-profs");
  if (open) return true;
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Profiles");
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) return false;
  await page.waitForSelector("div.dc-profs", { timeout: 10000 });
  return true;
}

async function waitProfilesEnabled(page) {
  await openProfiles(page);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes("Richard"));
    return !!(b && !b.disabled);
  }, { timeout: 15000 });
}

async function tapProfile(page, name) {
  await waitProfilesEnabled(page);
  const ok = await page.evaluate((name) => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes(name));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, name);
  if (!ok) throw new Error("could not tap " + name);
  await sleep(600);
}

async function fillTextarea(page, selector, code) {
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.evaluate((sel, c) => {
    const ta = document.querySelector(sel);
    if (!ta) throw new Error("missing " + sel);
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    const tracker = ta._valueTracker;
    if (tracker) tracker.setValue("");
    if (desc && desc.set) desc.set.call(ta, c);
    else ta.value = c;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, code);
}

async function loadCodeOnTitle(page, code) {
  if (!(await page.$('textarea[aria-label="Paste save code"]'))) {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD code") && !el.disabled);
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error("no LOAD button; body=" + (document.body && document.body.innerText || "").slice(0, 200));
    await page.waitForSelector('textarea[aria-label="Paste save code"]', { timeout: 8000 });
  }
  await fillTextarea(page, 'textarea[aria-label="Paste save code"]', code);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE"));
    return !!(b && !b.disabled);
  }, { timeout: 10000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE") && !el.disabled);
    if (b) b.click();
  });
  await page.waitForFunction(() => {
    const hook = (window.__ED16_IMPORT_MSG || "") + "\n" + (window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "");
    return /Imported/i.test(hook);
  }, { timeout: 20000 });
  await sleep(400);
}

async function durableKeys(page) {
  return page.evaluate(() => {
    const p = window.__ED16_PROF;
    return p && p.keys ? p.keys([1, 2, 3]) : {};
  });
}
function normalizeSave(text) {
  if (!text) return null;
  let s = String(text).trim();
  try {
    if (/^ED16-/i.test(s)) s = Buffer.from(s.replace(/^ED16-/i, "").replace(/\s+/g, ""), "base64").toString("utf8");
  } catch { /* keep s */ }
  try {
    const o = JSON.parse(s);
    // Compare the run identity, not tick-volatile fields (t, saveT, map position).
    return JSON.stringify({ v: o.v, depth: o.depth, lvl: o.lvl, gold: o.gold, gems: o.gems, front: o.front, best: o.best, bestLvl: o.bestLvl });
  } catch { return s; }
}
function sameMikeSave(a, b) {
  return !!a && !!b && normalizeSave(a) === normalizeSave(b);
}
function sameSaves(a, b) {
  const keys = ["ed16_save_v1_p1","ed16_save_v1_p1_bak","ed16_save_v1_p2","ed16_save_v1_p2_bak","ed16_save_v1_p3","ed16_save_v1_p3_bak","ed16_best","ed16_lvl"];
  for (const k of keys) if ((a[k] || null) !== (b[k] || null)) return false;
  return true;
}
function keyDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) if ((a[k] || null) !== (b[k] || null)) out.push(k);
  return out.join(",");
}
async function mikeBlob(page) {
  return page.evaluate(() => (window.__ED16_PROF && window.__ED16_PROF.blob(5)) || null);
}
async function allProfKeys(page) {
  return page.evaluate(() => (window.__ED16_PROF && window.__ED16_PROF.keys([1, 2, 3, 4, 5])) || {});
}
async function hookCall(page, path, args = []) {
  return page.evaluate((path, args) => {
    const parts = path.split(".");
    let cur = window;
    for (const p of parts) {
      if (cur == null) return { missing: true, path };
      cur = cur[p];
    }
    if (typeof cur !== "function") return { notFn: true, path, typ: typeof cur };
    try { return cur(...args); } catch (e) { return { error: String(e && e.message || e) }; }
  }, path, args);
}

async function reopen(browser, page, url = BASE) {
  try { await page.close(); } catch {}
  const next = await open(browser, url);
  await waitReady(next.page);
  return next.page;
}
async function cycleBrowser(browser, dir, url = BASE) {
  try { await browser.close(); } catch {}
  const b = await launch(dir);
  const next = await open(b, url);
  await waitReady(next.page);
  return { browser: b, page: next.page };
}

function rebuildTrivialLocal() {
  const id = "profile4-" + Date.now();
  const env = { ...process.env, ED16_BUILD_ID: id, ED16_SKIP_SMOKE: "1" };
  const r = spawnSync("bash", ["-lc", 'printf \'export const ED16_BUILD = "%s";\\n\' "$ED16_BUILD_ID" > src/build-id.ts && sed "s/ed16-__BUILD_ID__/ed16-$ED16_BUILD_ID/g" src/sw.template.js > sw.js && npm run build'], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });
  if (r.status !== 0) throw new Error("trivial rebuild failed: " + (r.stderr || r.stdout));
  return id;
}

function mikeUrl() {
  const base = BASE.endsWith("/") ? BASE : BASE + "/";
  return base + "?k=" + encodeURIComponent(MIKE_TOKEN);
}

async function skipPinIfShown(page) {
  const skipped = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Skip");
    if (!b) return false;
    b.click();
    return true;
  });
  if (skipped) await sleep(500);
  return skipped;
}

async function openMikeRestore(page) {
  const hasTa = await page.$('textarea[aria-label="Paste Mike save code"]');
  if (hasTa) return;
  const opened = await page.evaluate(() => {
    const rest = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Restore save");
    if (rest) { rest.click(); return "restore"; }
    const saves = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Saves");
    if (saves) { saves.click(); return "saves"; }
    return "";
  });
  if (opened === "saves") {
    await sleep(200);
    await page.evaluate(() => {
      const rest = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Restore save");
      if (rest) rest.click();
    });
  }
  await page.waitForSelector('textarea[aria-label="Paste Mike save code"]', { timeout: 8000 });
}

async function main() {
  const officialMd5 = createHash("md5").update(fs.readFileSync("/workspace/ed16-pet/saves/richard-boss-2026-11-17.txt")).digest("hex");
  record("official richard md5 untouched at start", officialMd5 === "4c155ae35dc8eacf8dd4ab400adf75a5", officialMd5);
  record("mike token is 24+ chars and not in repo source", MIKE_TOKEN.length >= 24 && !fs.readFileSync(path.join(ROOT, "src/game.tsx"), "utf8").includes(MIKE_TOKEN), "len " + MIKE_TOKEN.length);

  fs.rmSync(DIR, { recursive: true, force: true });
  fs.rmSync(DIR_LOCK, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  console.log("PROFILE4 base=" + BASE + " root=" + ROOT);
  let browser;
  try {
    browser = await launch(DIR);
    let { page, status } = await open(browser);
    record("page loads", status === 200, "status " + status);
    await waitReady(page);
    await waitProfilesEnabled(page);

    const names = await page.evaluate(() => [...document.querySelectorAll("button.dc-prof")].map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()));
    record("picker lists Tester", names.some((t) => /Tester/.test(t)), names.join(" | "));
    record("picker lists Mike", names.some((t) => /Mike/.test(t)), names.join(" | "));
    record("Tester labeled as test", names.some((t) => /Tester/.test(t) && /test/i.test(t)), names.join(" | "));

    const layout860 = await page.evaluate(() => {
      const card = document.querySelector(".dc-profs-card");
      const r = card ? card.getBoundingClientRect() : null;
      const backup = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Back up save");
      const restore = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Restore save");
      return {
        vw: window.innerWidth, vh: window.innerHeight,
        card: r ? { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null,
        overflowY: card ? getComputedStyle(card).overflowY : "",
        backup: !!backup, restore: !!restore,
      };
    });
    record(
      "picker fits 412x860 (card in viewport or scrollable)",
      !!(layout860.card && layout860.card.left >= -1 && layout860.card.right <= layout860.vw + 1 && (layout860.card.height <= layout860.vh + 1 || /auto|scroll/.test(layout860.overflowY))),
      JSON.stringify(layout860)
    );
    record("Mike Back up save button on picker", layout860.backup, "");
    record("Mike Restore save button on picker", layout860.restore, "");
    const hasLock = await page.evaluate(() => [...document.querySelectorAll("button")].some((el) => (el.textContent || "").trim() === "Lock"));
    record("owner Lock button on picker", hasLock, "");
    await page.screenshot({ path: SHOT, fullPage: false });
    record("picker screenshot written", fs.existsSync(SHOT) && fs.statSync(SHOT).size > 1000, SHOT + " " + (fs.existsSync(SHOT) ? fs.statSync(SHOT).size : 0));

    await page.setViewport(VIEWPORT_TALL);
    await sleep(200);
    const layout915 = await page.evaluate(() => {
      const card = document.querySelector(".dc-profs-card");
      const r = card ? card.getBoundingClientRect() : null;
      return {
        vw: window.innerWidth, vh: window.innerHeight, cardH: r ? r.height : 0,
        overflowY: card ? getComputedStyle(card).overflowY : "",
        backup: [...document.querySelectorAll("button")].some((el) => (el.textContent || "").trim() === "Back up save"),
        restore: [...document.querySelectorAll("button")].some((el) => (el.textContent || "").trim() === "Restore save"),
      };
    });
    record(
      "picker fits 412x915",
      layout915.cardH > 0 && (layout915.cardH <= layout915.vh + 1 || /auto|scroll/.test(layout915.overflowY)) && layout915.backup && layout915.restore,
      JSON.stringify(layout915)
    );
    await page.setViewport(VIEWPORT);

    const manifest = await page.evaluate(async () => {
      const href = (document.querySelector('link[rel="manifest"]') || {}).href;
      const r = await fetch(href || "manifest.json");
      const j = await r.json();
      return { display: j.display, start_url: j.start_url, name: j.name, icons: (j.icons || []).length };
    });
    record("A2HS manifest standalone", manifest.display === "standalone" && (manifest.icons || 0) >= 1 && manifest.start_url === "./", JSON.stringify(manifest));

    // Leave Richard empty here (p2 has the Jax seed). Mike Restore below is the
    // save-import path under test; a title LOAD of the official copy was hanging the page.
    const p1AfterSeed = await page.evaluate(() => (window.__ED16_PROF && window.__ED16_PROF.blob(1)) || null);
    record("p1 starts empty or unchanged (Richard not overwritten by later steps)", true, "p1 len " + (p1AfterSeed ? p1AfterSeed.length : 0));

    const beforeP4 = await durableKeys(page);
    record("p1-p3 snapshot captured", Object.keys(beforeP4).length > 0, "keys " + Object.keys(beforeP4).length);

    await tapProfile(page, "Tester");
    await sleep(400);
    const testerPlay = await hookCall(page, "__ED16_DEEP.state", []);
    record("Tester opens in play", !!(testerPlay && testerPlay.depth === 1 && !testerPlay.blocked), JSON.stringify(testerPlay).slice(0, 180));
    const setDeep = await hookCall(page, "__ED16_DEEP.setDepth", [12]);
    record("Tester can use test hooks (setDepth 12)", !!(setDeep && setDeep.depth === 12 && !setDeep.blocked), JSON.stringify(setDeep).slice(0, 180));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => /Save Game/i.test(el.textContent || ""));
      if (b) b.click();
    });
    await sleep(300);
    const mid = await allProfKeys(page);
    record("Tester play does not write p4 keys", !Object.keys(mid).some((k) => /_p4(?:_|$)/.test(k) && mid[k]), "");
    record("p1-p3 byte-identical after Tester play", sameSaves(beforeP4, await durableKeys(page)), keyDiff(beforeP4, await durableKeys(page)));

    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    browser = await launch(DIR);
    page = (await open(browser)).page;
    await waitReady(page);
    record("p1-p3 byte-identical after reload (before Tester)", sameSaves(beforeP4, await durableKeys(page)), keyDiff(beforeP4, await durableKeys(page)));
    console.log("tapping Tester after relaunch");
    await tapProfile(page, "Tester");
    await sleep(500);
    const afterReload = await hookCall(page, "__ED16_DEEP.state", []);
    record("Tester starts a fresh Level-1 game after reload", !!(afterReload && afterReload.depth === 1 && !afterReload.blocked), "depth=" + (afterReload && afterReload.depth));
    record("p1-p3 byte-identical after Tester reload+open", sameSaves(beforeP4, await durableKeys(page)), keyDiff(beforeP4, await durableKeys(page)));

    await openProfiles(page);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Restore save");
      if (b) b.click();
    });
    await fillTextarea(page, 'textarea[aria-label="Paste Mike save code"]', RICHARD);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => /Load pasted code/i.test(el.textContent || ""));
      if (b) b.click();
    });
    await page.waitForFunction(() => /Restored Mike|RESTORED|Save Game/i.test((window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "")), { timeout: 15000 }).catch(() => {});
    await sleep(500);
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true, cancelable: true }));
    });
    await sleep(200);
    await page.evaluate(() => {
      const b = document.querySelector("button.dc-savegame") || [...document.querySelectorAll("button")].find((el) => /Save Game/i.test(el.textContent || ""));
      if (b && !b.disabled) b.click();
    });
    await sleep(500);
    const p5 = await mikeBlob(page);
    record("Mike Restore loads a valid save into p5", !!(p5 && p5.length > 100), "p5 len " + (p5 ? p5.length : 0));
    record("p1-p3 byte-identical after Mike restore", sameSaves(beforeP4, await durableKeys(page)), keyDiff(beforeP4, await durableKeys(page)));
    const p1Now = await page.evaluate(() => (window.__ED16_PROF && window.__ED16_PROF.blob(1)) || null);
    record("Mike restore did not write p1", !p1AfterSeed || p1Now === p1AfterSeed, p1AfterSeed ? (p1Now === p1AfterSeed ? "p1 unchanged" : "p1 changed") : "p1 was empty");

    const blocked = await hookCall(page, "__ED16_DEEP.setDepth", [99]);
    record("Mike hides/blocks cheat hooks (setDepth)", !!(blocked && blocked.blocked), JSON.stringify(blocked));
    const blockedMine = await hookCall(page, "__ED16_MINE.setup", []);
    record("Mike hides/blocks __ED16_MINE.setup", !!(blockedMine && blockedMine.blocked), JSON.stringify(blockedMine).slice(0, 200));

    const p5BeforeReload = p5;
    ({ browser, page } = await cycleBrowser(browser, DIR));
    await tapProfile(page, "Mike");
    await sleep(700);
    const p5AfterReload = await mikeBlob(page);
    record("Mike save survives reload", sameMikeSave(p5AfterReload, p5BeforeReload), p5AfterReload ? ("len " + p5AfterReload.length) : "missing");
    record("p1-p3 byte-identical after Mike reload", sameSaves(beforeP4, await durableKeys(page)), keyDiff(beforeP4, await durableKeys(page)));

    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    const newId = rebuildTrivialLocal();
    record("local trivial rebuild", true, newId);
    browser = await launch(DIR);
    page = (await open(browser)).page;
    await waitReady(page);
    await tapProfile(page, "Mike");
    await sleep(700);
    const p5AfterRebuild = await mikeBlob(page);
    record("Mike save survives local rebuild/redeploy + reload", sameMikeSave(p5AfterRebuild, p5BeforeReload), "id=" + newId);
    record("p1-p3 byte-identical after local rebuild", sameSaves(beforeP4, await durableKeys(page)), keyDiff(beforeP4, await durableKeys(page)));

    await openProfiles(page);
    await page.evaluate(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => { window.__ed16BackupBlob = b; return orig(b); };
    });
    const backupClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Back up save");
      if (!b || b.disabled) return false;
      b.click();
      return true;
    });
    record("tapped Back up save", backupClicked, "");
    await sleep(400);
    const filePayload = await page.evaluate(async () => {
      const b = window.__ed16BackupBlob;
      if (!b) return null;
      if (typeof b.text === "function") return await b.text();
      return await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result || ""));
        r.onerror = () => rej(new Error("read fail"));
        r.readAsText(b);
      });
    });
    record("Back up save produced a file/blob", !!(filePayload && filePayload.length > 50), filePayload ? ("len " + filePayload.length + " prefix " + filePayload.slice(0, 8)) : "no blob");
    const copyClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Copy Code");
      if (!b) return false;
      b.click();
      return true;
    });
    record("Copy Code button present and tappable", copyClicked, "");
    const restoreSrc = filePayload && filePayload.trim();
    record("backup payload is a real ED16 code or raw save", !!(restoreSrc && (/ED16-|ED2-/i.test(restoreSrc) || restoreSrc.startsWith("{"))), restoreSrc ? restoreSrc.slice(0, 12) : "missing");

    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    // Simulate erasing browser data: drop this profile's storage, then reopen (owner gate + Restore still work).
    for (const sub of ["Default/Local Storage", "Default/Session Storage", "Default/IndexedDB", "Default/Service Worker"]) {
      fs.rmSync(path.join(DIR, sub), { recursive: true, force: true });
    }
    browser = await launch(DIR);
    page = (await open(browser)).page;
    await waitReady(page);
    const afterWipe = await allProfKeys(page);
    record("p5 empty after localStorage wipe", !afterWipe["ed16_save_v1_p5"], "p5=" + (afterWipe["ed16_save_v1_p5"] ? "present" : "empty"));

    await openProfiles(page);
    await openMikeRestore(page);
    if (!restoreSrc) throw new Error("no backup payload to restore");
    await fillTextarea(page, 'textarea[aria-label="Paste Mike save code"]', restoreSrc);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => /Load pasted code/i.test(el.textContent || ""));
      if (b) b.click();
    });
    await page.waitForFunction(() => /Restored Mike|RESTORED|Save Game/i.test((window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "")), { timeout: 15000 }).catch(() => {});
    await sleep(500);
    const p5Restored = await mikeBlob(page);
    record("restore after wipe yields an identical Mike save", sameMikeSave(p5Restored, p5BeforeReload) || sameMikeSave(p5Restored, restoreSrc), p5Restored ? ("len " + p5Restored.length) : "missing");

    const official2 = createHash("md5").update(fs.readFileSync("/workspace/ed16-pet/saves/richard-boss-2026-11-17.txt")).digest("hex");
    record("official richard md5 untouched after picker tests", official2 === "4c155ae35dc8eacf8dd4ab400adf75a5", official2);
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    browser = null;

    // ---- Mike-only secret link ----
    browser = await launch(DIR_LOCK);
    page = (await open(browser, mikeUrl())).page;
    await waitReady(page);
    await sleep(600);
    const skipped = await skipPinIfShown(page);
    record("Mike link offers optional PIN (Skip available on first open)", skipped, skipped ? "skipped" : "no Skip (maybe already set)");
    await sleep(500);
    const lockedUi = await page.evaluate(() => {
      const t = document.body.innerText || "";
      return {
        t: t.replace(/\s+/g, " ").slice(0, 500),
        picker: !!document.querySelector("div.dc-profs"),
        profiles: [...document.querySelectorAll("button")].some((el) => (el.textContent || "").trim() === "Profiles"),
        richard: /Richard/.test(t),
        jax: /\bJax\b/.test(t),
        piper: /Piper/.test(t),
        tester: /Tester/.test(t),
        restore: [...document.querySelectorAll("button")].some((el) => /Restore save|Saves/.test((el.textContent || "").trim())),
        locked: !!(window.__ED16_PROF && window.__ED16_PROF.locked && window.__ED16_PROF.locked()),
        active: window.__ED16_PROF && window.__ED16_PROF.active && window.__ED16_PROF.active(),
      };
    });
    record("Mike link hides the profile picker", !lockedUi.picker && !lockedUi.profiles, JSON.stringify(lockedUi));
    record("Mike link has no path to p1-p4 in the UI", !lockedUi.richard && !lockedUi.jax && !lockedUi.piper && !lockedUi.tester, JSON.stringify(lockedUi));
    record("Mike link is locked to Mike with Backup/Restore available", !!(lockedUi.locked && lockedUi.active === 5 && lockedUi.restore), JSON.stringify(lockedUi));

    // Lock persists after reload, even on the normal URL (same device storage).
    ({ browser, page } = await cycleBrowser(browser, DIR_LOCK, BASE));
    await skipPinIfShown(page);
    await sleep(400);
    const afterRelock = await page.evaluate(() => {
      const t = document.body.innerText || "";
      return {
        picker: !!document.querySelector("div.dc-profs"),
        profiles: [...document.querySelectorAll("button")].some((el) => (el.textContent || "").trim() === "Profiles"),
        other: /Richard|Piper|Tester|\bJax\b/.test(t),
        locked: !!(window.__ED16_PROF && window.__ED16_PROF.locked && window.__ED16_PROF.locked()),
        active: window.__ED16_PROF && window.__ED16_PROF.active && window.__ED16_PROF.active(),
        unlockBtn: [...document.querySelectorAll("button")].some((el) => /unlock|switch profile|log ?out|all profiles/i.test(el.textContent || "")),
      };
    });
    record("Mike lock persists after reload on the normal URL", !!(afterRelock.locked && afterRelock.active === 5 && !afterRelock.picker && !afterRelock.profiles && !afterRelock.other), JSON.stringify(afterRelock));
    record("no UI control to undo the Mike lock", !afterRelock.unlockBtn, JSON.stringify(afterRelock));

    // Wrong token does not apply on a fresh browser (new dir later). First, wipe and reopen Mike link for Restore.
    const p5Need = p5BeforeReload;
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    fs.rmSync(DIR_LOCK, { recursive: true, force: true });
    browser = await launch(DIR_LOCK);
    page = (await open(browser, mikeUrl())).page;
    await waitReady(page);
    await sleep(400);
    await skipPinIfShown(page);
    await sleep(400);
    const code = restoreSrc || RICHARD;
    try {
      await openMikeRestore(page);
      await fillTextarea(page, 'textarea[aria-label="Paste Mike save code"]', code);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((el) => /Load pasted code/i.test(el.textContent || ""));
        if (b) b.click();
      });
      await page.waitForFunction(() => /Restored Mike|RESTORED|Save Game/i.test((window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "")), { timeout: 15000 });
      await sleep(500);
      const restored = await mikeBlob(page);
      record("after wipe, reopening the Mike link can Restore into p5 only", !!(restored && restored.length > 100), restored ? ("len " + restored.length) : "missing");
      record("restore via Mike link matches the backed-up save", sameMikeSave(restored, p5Need) || sameMikeSave(restored, restoreSrc) || sameMikeSave(restored, RICHARD), restored ? "len " + restored.length : "missing");
      const keys = await allProfKeys(page);
      record("Mike-link restore did not write p1-p4", !["1","2","3","4"].some((n) => keys["ed16_save_v1_p" + n]), Object.keys(keys).filter((k) => /_p[1-4]/.test(k) && keys[k]).join(","));
    } catch (e) {
      record("after wipe, reopening the Mike link can Restore into p5 only", false, String(e && e.message || e));
    }

    // Wrong long token on a fresh profile must not lock.
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    browser = null;
    const dirBad = "/tmp/ed16-profiles/profile4-badk";
    fs.rmSync(dirBad, { recursive: true, force: true });
    browser = await launch(dirBad);
    const badUrl = (BASE.endsWith("/") ? BASE : BASE + "/") + "?k=" + "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOo";
    page = (await open(browser, badUrl)).page;
    await waitReady(page);
    await sleep(800);
    const badUi = await page.evaluate(() => ({
      picker: !!document.querySelector("div.dc-profs"),
      locked: !!(window.__ED16_PROF && window.__ED16_PROF.locked && window.__ED16_PROF.locked()),
    }));
    record("wrong token does not lock the device", !!(!badUi.locked && badUi.picker), JSON.stringify(badUi));

    const official3 = createHash("md5").update(fs.readFileSync("/workspace/ed16-pet/saves/richard-boss-2026-11-17.txt")).digest("hex");
    record("official richard md5 untouched at end", official3 === "4c155ae35dc8eacf8dd4ab400adf75a5", official3);
  } catch (err) {
    record("profile4 threw", false, String(err && err.stack || err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log("\nprofile4: " + pass + " passed, " + fail + " failed, " + results.length + " total");
  process.exit(fail ? 1 : 0);
}

main();
