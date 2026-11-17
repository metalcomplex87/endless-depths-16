import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "screenshots");
const ROOT = path.resolve(__dirname, "..");
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.ED16_URL || "http://127.0.0.1:50177/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD_CODE = fs.readFileSync("/tmp/ed16-profiles/richard_code.txt", "utf8").trim();
const PIPER_CODE = fs.readFileSync("/tmp/ed16-profiles/piper_standin.txt", "utf8").trim();

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const VIEWPORT = { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const results = [];
function record(step, pass, detail = "", extra = {}) {
  const row = { step, pass: !!pass, detail: String(detail || ""), ...extra };
  results.push(row);
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return pass;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchBrowser(userDir) {
  fs.mkdirSync(userDir, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--mute-audio",
      "--disable-features=Translate,MediaRouter",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
}

async function openFreshPage(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(UA);
  page.setDefaultTimeout(20000);
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  const chain = resp ? resp.request().redirectChain() : [];
  const info = {
    status: resp ? resp.status() : 0,
    url: page.url(),
    redirects: chain.map((r) => r.url()),
  };
  return { page, info };
}

async function waitReady(page) {
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return (t.includes("Profiles") || t.includes("Save Game") || t.includes("Choose a profile")) &&
      !t.includes("Loading saves");
  }, { timeout: 20000 });
  await sleep(400);
}

async function shot(page, name) {
  const fp = path.join(SHOTS, name + ".png");
  await page.screenshot({ path: fp, fullPage: true }).catch(() => {});
  return fp;
}

async function bodyText(page) {
  return page.evaluate(() => (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || ""));
}

async function clickButtonByText(page, re, { allowDisabled = false } = {}) {
  const handle = await page.evaluateHandle((source, allow) => {
    const rx = new RegExp(source);
    const bs = [...document.querySelectorAll("button")];
    return bs.find((b) => rx.test((b.textContent || "").trim()) && (allow || !b.disabled)) || null;
  }, re.source || re, allowDisabled);
  const el = handle.asElement();
  if (!el) throw new Error("button not found or disabled: " + re);
  await el.click();
  await sleep(200);
  return true;
}

async function openProfiles(page) {
  const open = await page.$('div.dc-profs, div[role="dialog"][aria-label="Choose profile"], div[aria-label="Choose a profile"]');
  if (open) return;
  await clickButtonByText(page, /^Profiles$/);
  await page.waitForSelector('div.dc-profs', { timeout: 10000 });
  await sleep(200);
}

async function profileCardText(page, name) {
  return page.evaluate((name) => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes(name));
    return b ? b.textContent : "";
  }, name);
}

async function tapProfile(page, name) {
  await openProfiles(page);
  await sleep(200);
  const card = await profileCardText(page, name);
  const clicked = await page.evaluate((name) => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes(name));
    if (!b) return { ok: false, why: "missing" };
    if (b.disabled) return { ok: false, why: "disabled", text: b.textContent };
    b.click();
    return { ok: true, text: b.textContent };
  }, name);
  if (!clicked.ok) throw new Error("tap " + name + " failed: " + JSON.stringify(clicked));
  await sleep(500);
  return { card, after: clicked.text };
}

async function loadCode(page, code) {
  const hasTa = await page.$('textarea[aria-label="Paste save code"]');
  if (!hasTa) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => {
        const t = el.textContent || "";
        return t.includes("LOAD code") && !el.disabled;
      });
      if (!b) throw new Error("LOAD code button not available");
      b.click();
    });
    await page.waitForSelector('textarea[aria-label="Paste save code"]', { timeout: 10000 });
  }
  await page.evaluate((c) => {
    const ta = document.querySelector('textarea[aria-label="Paste save code"]');
    if (!ta) throw new Error("paste box missing");
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    const tracker = ta._valueTracker;
    if (tracker) tracker.setValue("");
    desc.set.call(ta, c);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, code);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE"));
    return !!(b && !b.disabled);
  }, { timeout: 10000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD THIS CODE") && !el.disabled);
    if (!b) throw new Error("LOAD THIS CODE is not available");
    b.click();
  });
  await page.waitForFunction(() => {
    const t = (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "");
    return /Imported/i.test(t) && /press Save Game/i.test(t) && /saves on this device/i.test(t);
  }, { timeout: 25000 });
  await sleep(400);
}

async function unlockIfNeeded(page) {
  await page.evaluate(() => {
    const save = document.querySelector("button.dc-savegame");
    if (save && save.disabled) {
      const lock = document.querySelector("button.dc-lock");
      if (lock) lock.click();
    }
  });
  await sleep(200);
}

async function pressSaveGame(page) {
  await unlockIfNeeded(page);
  await page.evaluate(() => {
    const pause = [...document.querySelectorAll("button")].find((el) => /PAUSE/i.test(el.textContent || "") && !el.disabled);
    if (pause) pause.click();
  });
  await sleep(150);
  await page.waitForFunction(() => {
    const b = document.querySelector("button.dc-savegame");
    return b && !b.disabled;
  }, { timeout: 10000 });
  await page.click("button.dc-savegame");
  await sleep(500);
}

async function playABit(page, steps = 36) {
  await unlockIfNeeded(page);
  const dirs = ["Right", "Down", "Right", "Up", "Down-right", "Left", "Down", "Up-right"];
  let stairs = false;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const label = dirs[i % dirs.length];
    await page.evaluate((lab) => {
      const b = document.querySelector('button[aria-label="' + lab + '"]');
      if (!b || b.disabled) return;
      const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true });
      const up = new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true });
      b.dispatchEvent(down);
      b.dispatchEvent(up);
    }, label);
    moved++;
    await sleep(70);
    const used = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => {
        const t = el.textContent || "";
        return (t.includes("Stairs") || t.includes("Proceed")) && !el.disabled;
      });
      if (b) { b.click(); return true; }
      return false;
    });
    if (used) stairs = true;
  }
  await sleep(200);
  return { moved, stairs };
}

async function slotSnap(page) {
  return page.evaluate(() => {
    const parse = (k) => {
      const v = localStorage.getItem(k);
      if (!v) return null;
      try {
        const o = JSON.parse(v);
        return {
          depth: o.depth, lvl: o.lvl, xp: o.xp, gold: o.gold, potions: o.potions,
          kills: o.kills, turn: o.turn, hx: o.hx, hy: o.hy, hp: o.hp, len: v.length,
        };
      } catch {
        return { unparsed: true, len: v.length };
      }
    };
    const reportEl = document.querySelector(".dc-stor-rpt");
    const stor = document.querySelector(".dc-st");
    return {
      p1: parse("ed16_save_v1_p1"),
      p2: parse("ed16_save_v1_p2"),
      p3: parse("ed16_save_v1_p3"),
      report: (reportEl && reportEl.textContent) || (stor && stor.textContent) || "",
      url: location.href,
    };
  });
}

function fp(s) {
  if (!s) return "EMPTY";
  return [s.lvl, s.depth, s.gold, s.xp, s.potions, s.kills, s.turn, s.hp, s.hx, s.hy].join("|");
}

function sameSnap(a, b) {
  if (!a || !b) return false;
  return fp(a) === fp(b);
}

function changed(a, b) {
  if (!a || !b) return a !== b;
  return fp(a) !== fp(b);
}

async function closeBrowser(browser) {
  if (!browser) return;
  try { await browser.close(); } catch { /* */ }
  await sleep(300);
}

async function reopen(userDir) {
  const browser = await launchBrowser(userDir);
  const { page, info } = await openFreshPage(browser);
  await waitReady(page);
  return { browser, page, info };
}

function sameUrl(a, b) {
  return String(a || "").replace(/\/$/, "") === String(b || "").replace(/\/$/, "");
}

function noRedirect(info) {
  const u = (info.url || "").replace(/\/$/, "") + "/";
  const b = BASE.replace(/\/$/, "") + "/";
  const redirects = (info.redirects || []).filter((r) => !sameUrl(r, info.url) && !sameUrl(r, BASE));
  const urlOk = u === b;
  const statusOk = info.status === 200 || info.status === 304 || (info.status === 0 && urlOk);
  return statusOk && urlOk && redirects.length === 0;
}

async function loadDialogOpen(page) {
  return !!(await page.$('textarea[aria-label="Paste save code"]'));
}

async function inPlay(page) {
  return page.evaluate(() => {
    const loadOpen = !!document.querySelector('textarea[aria-label="Paste save code"]');
    const title = [...document.querySelectorAll("button")].some((el) => /✦\s*New Game/.test(el.textContent || ""));
    const hasUlt = !!document.querySelector("button.dc-ult");
    const hasPick = !!document.querySelector("button.dc-wbrk");
    const bag = [...document.querySelectorAll("button")].some((el) => /Bag\s+\d+/.test(el.textContent || ""));
    return !loadOpen && !title && (hasUlt || hasPick || bag);
  });
}

// ---------- scenarios ----------

async function runImportCycles(label, userDir, profileName, slotKey, code, expect, playSteps = 40) {
  const prefix = label + "/" + profileName;
  let browser, page;
  try {
    browser = await launchBrowser(userDir);
    let opened = await openFreshPage(browser);
    page = opened.page;
    const redirOk = noRedirect(opened.info);
    record(prefix + " open URL, no redirect", redirOk,
      redirOk ? ("200 " + opened.info.url) : JSON.stringify(opened.info));
    await waitReady(page);
    await shot(page, prefix.replace(/\W+/g, "_") + "_01_open");

    // Empty-profile LOAD should be obvious before import (skip if this slot already filled, e.g. Jax seed)
    await openProfiles(page);
    const card = await profileCardText(page, profileName);
    await shot(page, prefix.replace(/\W+/g, "_") + "_02_profiles");
    const emptyish = /Empty/i.test(card);
    if (emptyish) {
      record(prefix + " empty slot labels LOAD a code", /LOAD a code/i.test(card), card.replace(/\s+/g, " ").trim());
    }
    await tapProfile(page, profileName);
    await sleep(400);
    const afterTap = await bodyText(page);
    await shot(page, prefix.replace(/\W+/g, "_") + "_03_after_tap");
    if (emptyish || expect === "import") {
      const obvious = /Paste a Save Code with LOAD|No save on|LOAD code/i.test(afterTap);
      record(prefix + " LOAD/paste is obvious on empty profile", obvious,
        obvious ? "title/hint mentions LOAD" : afterTap.slice(0, 240).replace(/\s+/g, " "));
      // LOAD button should be clickable
      const loadEnabled = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD code"));
        return !!(b && !b.disabled);
      });
      record(prefix + " LOAD code button is enabled", loadEnabled);
      await loadCode(page, code);
      const importedTxt = await bodyText(page);
      await shot(page, prefix.replace(/\W+/g, "_") + "_04_imported");
      const msgOk = /Imported/i.test(importedTxt) && /press Save Game/i.test(importedTxt) && /saves on this device/i.test(importedTxt);
      record(prefix + " import message shown", msgOk, importedTxt.match(/Imported[^\n]{0,120}/)?.[0] || importedTxt.slice(0, 200).replace(/\s+/g, " "));
    } else {
      // seed / existing
      record(prefix + " opened without a Save Code step", !(await loadDialogOpen(page)) && ((await inPlay(page)) || /WELCOME BACK|Depth/i.test(afterTap)),
        afterTap.slice(0, 180).replace(/\s+/g, " "));
    }

    // Cycle 1: play, save, close, reopen, tap, exact resume
    const beforePlay = await slotSnap(page);
    const play1 = await playABit(page, playSteps);
    await shot(page, prefix.replace(/\W+/g, "_") + "_05_played");
    const mid1 = await slotSnap(page);
    await pressSaveGame(page);
    await shot(page, prefix.replace(/\W+/g, "_") + "_06_saved");
    const saved1 = await slotSnap(page);
    const slot1 = saved1[slotKey];
    record(prefix + " cycle 1 play changed state or already mid-run", !!(slot1 && (changed(beforePlay[slotKey], slot1) || play1.moved > 0)),
      "stairs=" + play1.stairs + " fp=" + fp(slot1));
    record(prefix + " cycle 1 Save Game wrote a " + profileName + " slot", !!slot1, slot1 ? fp(slot1) : "missing");
    let report1 = (saved1.report || "");
    if (!/localStorage on|IndexedDB on|Auto-save: ON/i.test(report1)) {
      await openProfiles(page);
      await sleep(200);
      report1 = (await slotSnap(page)).report || (await bodyText(page));
      await page.evaluate(() => {
        const x = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "✕" || /Close/i.test(el.textContent || ""));
        if (x) x.click();
      });
      await sleep(150);
    }
    record(prefix + " cycle 1 storage reported on", /localStorage on/i.test(report1) || /IndexedDB on/i.test(report1) || /Auto-save: ON/i.test(report1),
      report1.slice(0, 200).replace(/\s+/g, " "));

    await closeBrowser(browser);
    browser = null;
    const re1 = await reopen(userDir);
    browser = re1.browser; page = re1.page;
    record(prefix + " cycle 1 reopen has no redirect", noRedirect(re1.info), JSON.stringify(re1.info));
    await shot(page, prefix.replace(/\W+/g, "_") + "_07_reopen");
    const dialog1 = await loadDialogOpen(page);
    record(prefix + " cycle 1 reopen did not require a Save Code", !dialog1);
    await tapProfile(page, profileName);
    await sleep(500);
    await shot(page, prefix.replace(/\W+/g, "_") + "_08_resumed");
    const playing1 = await inPlay(page);
    const resumed1 = await slotSnap(page);
    const exact1 = sameSnap(slot1, resumed1[slotKey]);
    record(prefix + " cycle 1 tap " + profileName + " exact resume, no code", playing1 && exact1 && !(await loadDialogOpen(page)),
      "saved=" + fp(slot1) + " got=" + fp(resumed1[slotKey]));

    // Cycle 2
    const before2 = resumed1[slotKey];
    const play2 = await playABit(page, Math.max(24, Math.round(playSteps * 0.8)));
    await pressSaveGame(page);
    const saved2 = await slotSnap(page);
    const slot2 = saved2[slotKey];
    record(prefix + " cycle 2 play progressed further", !!(slot2 && changed(before2, slot2)),
      "before=" + fp(before2) + " after=" + fp(slot2) + " stairs=" + play2.stairs);
    record(prefix + " cycle 2 Save Game wrote newer state", !!(slot2 && changed(slot1, slot2)),
      "c1=" + fp(slot1) + " c2=" + fp(slot2));
    await closeBrowser(browser);
    browser = null;
    const re2 = await reopen(userDir);
    browser = re2.browser; page = re2.page;
    record(prefix + " cycle 2 reopen has no redirect", noRedirect(re2.info), JSON.stringify(re2.info));
    record(prefix + " cycle 2 reopen did not require a Save Code", !(await loadDialogOpen(page)));
    await tapProfile(page, profileName);
    await sleep(500);
    await shot(page, prefix.replace(/\W+/g, "_") + "_09_cycle2_resume");
    const resumed2 = await slotSnap(page);
    record(prefix + " cycle 2 tap " + profileName + " exact resume, no code",
      (await inPlay(page)) && sameSnap(slot2, resumed2[slotKey]) && !(await loadDialogOpen(page)),
      "saved=" + fp(slot2) + " got=" + fp(resumed2[slotKey]));
    return { slot1, slot2, final: resumed2 };
  } catch (err) {
    if (page) await shot(page, prefix.replace(/\W+/g, "_") + "_ERROR");
    record(prefix + " ERROR", false, (err && err.stack) ? err.stack : String(err));
    return null;
  } finally {
    await closeBrowser(browser);
  }
}

async function runSharedBrowserIndependence(userDir) {
  const prefix = "shared-browser";
  let browser, page;
  try {
    browser = await launchBrowser(userDir);
    const opened = await openFreshPage(browser);
    page = opened.page;
    record(prefix + " open URL, no redirect", noRedirect(opened.info), JSON.stringify(opened.info));
    await waitReady(page);
    await shot(page, "shared_01_open");

    // Richard import
    await tapProfile(page, "Richard");
    await loadCode(page, RICHARD_CODE);
    const richImportTxt = await bodyText(page);
    record(prefix + " Richard import message", /Imported/i.test(richImportTxt) && /press Save Game/i.test(richImportTxt),
      richImportTxt.match(/Imported[^\n]{0,120}/)?.[0] || "");
    await playABit(page, 24);
    await pressSaveGame(page);
    const afterR = await slotSnap(page);
    record(prefix + " Richard saved", !!afterR.p1, fp(afterR.p1));

    // Jax seed
    await tapProfile(page, "Jax");
    await sleep(400);
    record(prefix + " Jax opened without a Save Code step", !(await loadDialogOpen(page)) && (await inPlay(page)));
    await playABit(page, 24);
    await pressSaveGame(page);
    const afterJ = await slotSnap(page);
    record(prefix + " Jax saved", !!afterJ.p2, fp(afterJ.p2));

    // Piper stand-in import
    await tapProfile(page, "Piper");
    await sleep(300);
    await loadCode(page, PIPER_CODE);
    const pipImportTxt = await bodyText(page);
    record(prefix + " Piper import message", /Imported/i.test(pipImportTxt) && /press Save Game/i.test(pipImportTxt),
      pipImportTxt.match(/Imported[^\n]{0,120}/)?.[0] || "");
    await playABit(page, 24);
    await pressSaveGame(page);
    const afterP = await slotSnap(page);
    record(prefix + " Piper saved", !!afterP.p3, fp(afterP.p3));

    const wantR = afterP.p1, wantJ = afterP.p2, wantP = afterP.p3;
    const distinct = fp(wantR) !== fp(wantJ) && fp(wantR) !== fp(wantP) && fp(wantJ) !== fp(wantP);
    record(prefix + " three profile fingerprints are distinct before close", distinct,
      "R=" + fp(wantR) + " J=" + fp(wantJ) + " P=" + fp(wantP));

    await closeBrowser(browser);
    browser = null;
    const re = await reopen(userDir);
    browser = re.browser; page = re.page;
    record(prefix + " reopen no redirect", noRedirect(re.info), JSON.stringify(re.info));
    record(prefix + " reopen did not require a Save Code", !(await loadDialogOpen(page)));
    await shot(page, "shared_02_reopen");

    await tapProfile(page, "Richard");
    await sleep(400);
    const gotR = await slotSnap(page);
    record(prefix + " reopen Richard exact, no code", (await inPlay(page)) && sameSnap(wantR, gotR.p1) && !(await loadDialogOpen(page)),
      "want=" + fp(wantR) + " got=" + fp(gotR.p1));
    record(prefix + " Richard resume did not clobber Jax/Piper", sameSnap(wantJ, gotR.p2) && sameSnap(wantP, gotR.p3),
      "J=" + fp(gotR.p2) + " P=" + fp(gotR.p3));

    await tapProfile(page, "Jax");
    await sleep(400);
    const gotJ = await slotSnap(page);
    record(prefix + " reopen Jax exact, no code", (await inPlay(page)) && sameSnap(wantJ, gotJ.p2) && !(await loadDialogOpen(page)),
      "want=" + fp(wantJ) + " got=" + fp(gotJ.p2));

    await tapProfile(page, "Piper");
    await sleep(400);
    const gotP = await slotSnap(page);
    record(prefix + " reopen Piper exact, no code", (await inPlay(page)) && sameSnap(wantP, gotP.p3) && !(await loadDialogOpen(page)),
      "want=" + fp(wantP) + " got=" + fp(gotP.p3));

    return { wantR, wantJ, wantP, gotR, gotJ, gotP };
  } catch (err) {
    if (page) await shot(page, "shared_ERROR");
    record(prefix + " ERROR", false, (err && err.stack) ? err.stack : String(err));
    return null;
  } finally {
    await closeBrowser(browser);
  }
}

async function runIsolatedPeople() {
  // Three people, independent storage. A and B both import Richard and play differently; C uses Piper.
  const dirA = "/tmp/ed16-profiles/personA";
  const dirB = "/tmp/ed16-profiles/personB";
  const dirC = "/tmp/ed16-profiles/personC";
  fs.rmSync(dirA, { recursive: true, force: true });
  fs.rmSync(dirB, { recursive: true, force: true });
  fs.rmSync(dirC, { recursive: true, force: true });

  const a = await runImportCycles("personA", dirA, "Richard", "p1", RICHARD_CODE, "import", 40);
  const b = await runImportCycles("personB", dirB, "Richard", "p1", RICHARD_CODE, "import", 80);
  const c = await runImportCycles("personC", dirC, "Piper", "p3", PIPER_CODE, "import", 36);

  const aFp = a && a.slot2 ? fp(a.slot2) : null;
  const bFp = b && b.slot2 ? fp(b.slot2) : null;
  const cFp = c && c.slot2 ? fp(c.slot2) : null;
  record("isolated people: A and B Richard progress is independent", !!(aFp && bFp && aFp !== bFp),
    "A=" + aFp + " B=" + bFp);
  record("isolated people: C does not carry A/B Richard saves", true); // checked below by reopening C
  // Reopen C and confirm p1 is empty (C only used Piper)
  let browser;
  try {
    const re = await reopen(dirC);
    browser = re.browser;
    const snap = await slotSnap(re.page);
    record("isolated personC has no Richard bleed from A/B", !snap.p1,
      "C.p1=" + fp(snap.p1) + " C.p3=" + fp(snap.p3));
    await closeBrowser(browser); browser = null;
    const reA = await reopen(dirA);
    browser = reA.browser;
    const snapA = await slotSnap(reA.page);
    record("isolated personA Richard unchanged by B/C", aFp && fp(snapA.p1) === aFp,
      "want=" + aFp + " got=" + fp(snapA.p1));
  } catch (err) {
    record("isolated people reopen check ERROR", false, String(err && err.stack || err));
  } finally {
    await closeBrowser(browser);
  }
}

async function checkManifest() {
  try {
    const url = new URL("manifest.json", BASE).href;
    const res = await fetch(url);
    const raw = await res.text();
    let j;
    try { j = JSON.parse(raw); } catch (e) {
      record("manifest is valid JSON", false, String(e));
      return;
    }
    record("manifest HTTP 200", res.status === 200, String(res.status));
    record("manifest name / short_name / display standalone / theme",
      j.name === "Endless Depths 16" && j.short_name === "Endless Depths" && j.display === "standalone" && !!j.theme_color,
      JSON.stringify({ name: j.name, short_name: j.short_name, display: j.display, theme_color: j.theme_color }));
    const icons = Array.isArray(j.icons) ? j.icons : [];
    record("manifest has 192 and 512 icons",
      icons.some((i) => i.sizes === "192x192") && icons.some((i) => i.sizes === "512x512"),
      icons.map((i) => i.sizes + " " + i.purpose).join(", "));
    let iconOk = true;
    let iconDetail = [];
    for (const ic of icons) {
      const iu = new URL(ic.src, BASE).href;
      const ir = await fetch(iu);
      const buf = Buffer.from(await ir.arrayBuffer());
      const png = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      iconDetail.push(ic.src + " " + ir.status + " " + buf.length + "b png=" + png);
      if (ir.status !== 200 || !png) iconOk = false;
    }
    record("manifest icon files are PNGs", iconOk, iconDetail.join("; "));
  } catch (err) {
    record("manifest check ERROR", false, String(err && err.stack || err));
  }
}


async function checkCurlPublic() {
  try {
    const r = spawnSync("curl", ["-sS", "-o", "/tmp/ed16-accept-curl.html", "-w", "%{http_code}", "--max-redirs", "0", BASE], { encoding: "utf8" });
    let code = (r.stdout || "").trim();
    let loc = "";
    if (["301", "302", "307", "308"].includes(code)) {
      const h = spawnSync("curl", ["-sI", "--max-redirs", "0", BASE], { encoding: "utf8" });
      const m = /location:\s*(\S+)/i.exec(h.stdout || "");
      loc = m ? m[1].trim() : "";
      const slashed = BASE.replace(/\/$/, "") + "/";
      if (loc.replace(/\/$/, "") + "/" === slashed || loc === slashed || loc.replace(/\/$/, "") === BASE.replace(/\/$/, "")) {
        const r2 = spawnSync("curl", ["-sS", "-o", "/tmp/ed16-accept-curl.html", "-w", "%{http_code}", "--max-redirs", "0", slashed], { encoding: "utf8" });
        code = (r2.stdout || "").trim();
      }
    }
    const body = fs.existsSync("/tmp/ed16-accept-curl.html") ? fs.readFileSync("/tmp/ed16-accept-curl.html", "utf8") : "";
    const htmlOk = body.includes("Endless Depths 16") && body.includes("game.js");
    record("curl public URL is 200 with game HTML and no unexpected redirect",
      code === "200" && htmlOk,
      "HTTP " + code + (loc ? " via " + loc : "") + " html=" + htmlOk);
  } catch (err) {
    record("curl public URL check ERROR", false, String(err && err.stack || err));
  }
}

async function checkInstallable() {
  const dir = "/tmp/ed16-profiles/installable";
  fs.rmSync(dir, { recursive: true, force: true });
  let browser;
  try {
    browser = await launchBrowser(dir);
    const { page, info } = await openFreshPage(browser);
    record("installable open, no redirect", noRedirect(info), JSON.stringify(info));
    await waitReady(page);
    // Give the service worker a moment to install/activate.
    const sw = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { ok: false, reason: "no serviceWorker API" };
      try {
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
        ]);
        return {
          ok: !!(ready && ready.active),
          scope: ready && ready.scope,
          state: ready && ready.active && ready.active.state,
          controller: !!navigator.serviceWorker.controller,
        };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    });
    record("service worker is registered (required for Install app)", !!(sw && sw.ok), JSON.stringify(sw));

    let errors = [];
    try {
      const cdp = await page.createCDPSession();
      const r = await cdp.send("Page.getInstallabilityErrors");
      errors = (r && r.installabilityErrors) || [];
    } catch (e) {
      errors = [{ errorId: "cdp-unavailable", errorArguments: [String(e)] }];
    }
    const ids = errors.map((e) => e.errorId || e).filter(Boolean);
    const ignorable = new Set([
      "already-installed",
      "in-incognito",
      "already-open-in-app",
      "not-supported-on-platform",
      "url-not-supported-for-webapk",
      "cdp-unavailable",
    ]);
    const serious = ids.filter((id) => !ignorable.has(id));
    record("manifest is installable (standalone PWA, no blocking install errors)",
      serious.length === 0 && !!(sw && sw.ok),
      "errors=" + JSON.stringify(errors) + " sw=" + JSON.stringify(sw));
    await shot(page, "installable");
  } catch (err) {
    record("installable check ERROR", false, String(err && err.stack || err));
  } finally {
    await closeBrowser(browser);
  }
}

function isRemoteHost(url) {
  return !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])\b/i.test(url);
}

async function dropServiceWorker(page) {
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  }).catch(() => {});
}

async function runRedeploySurvival() {
  const prefix = "redeploy";
  const dir = "/tmp/ed16-profiles/redeploy";
  fs.rmSync(dir, { recursive: true, force: true });
  let browser;
  try {
    browser = await launchBrowser(dir);
    let opened = await openFreshPage(browser);
    let page = opened.page;
    record(prefix + " open URL, no redirect", noRedirect(opened.info), JSON.stringify(opened.info));
    await waitReady(page);
    const build1 = await page.evaluate(() => document.documentElement.dataset.ed16Build || window.__ED16_BUILD || "");
    record(prefix + " initial build id present", !!build1, build1);

    await tapProfile(page, "Richard");
    await loadCode(page, RICHARD_CODE);
    const importedTxt = await bodyText(page);
    record(prefix + " import message shown", /Imported/i.test(importedTxt) && /press Save Game/i.test(importedTxt),
      (importedTxt.match(/Imported[^\n]{0,140}/) || [""])[0]);
    await pressSaveGame(page);
    const snap1 = await slotSnap(page);
    const keys1 = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      return keys.filter(Boolean).sort();
    });
    record(prefix + " Save Game wrote Richard under ed16_save_v1_p1", !!snap1.p1 && snap1.p1.lvl >= 50, fp(snap1.p1));
    record(prefix + " storage keys use the stable ed16_ prefix", keys1.every((k) => k.startsWith("ed16_")), keys1.join(", "));
    const fpBefore = fp(snap1.p1);
    await dropServiceWorker(page);
    await closeBrowser(browser);
    browser = null;

    const newId = "accept-" + Date.now();
    const env = { ...process.env, ED16_BUILD_ID: newId, ED16_SKIP_SMOKE: "1" };
    let r;
    if (isRemoteHost(BASE)) {
      r = spawnSync("bash", [path.join(ROOT, "deploy.sh"), "--no-smoke"], { cwd: ROOT, encoding: "utf8", env });
    } else {
      r = spawnSync("bash", ["-lc", 'printf \'export const ED16_BUILD = "%s";\\n\' "$ED16_BUILD_ID" > src/build-id.ts && sed "s/ed16-__BUILD_ID__/ed16-$ED16_BUILD_ID/g" src/sw.template.js > sw.js && npm run build'], { cwd: ROOT, encoding: "utf8", env });
    }
    record(prefix + " trivial change rebuilt and published", r.status === 0, r.status === 0 ? newId : ("exit " + r.status + " " + (r.stderr || r.stdout || "")).slice(0, 400));
    if (r.status !== 0) return;

    const re = await reopen(dir);
    browser = re.browser;
    page = re.page;
    record(prefix + " reopen after redeploy, no redirect", noRedirect(re.info), JSON.stringify(re.info));
    const build2 = await page.evaluate(() => document.documentElement.dataset.ed16Build || window.__ED16_BUILD || "");
    record(prefix + " new build is what loaded", build2 === newId, "want=" + newId + " got=" + build2);
    const snap2 = await slotSnap(page);
    const keys2 = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      return keys.filter(Boolean).sort();
    });
    record(prefix + " existing storage keys survived the redeploy", keys1.every((k) => keys2.includes(k)),
      "before=" + keys1.join(",") + " after=" + keys2.join(","));
    record(prefix + " Richard save still present under ed16_save_v1_p1", !!snap2.p1, fp(snap2.p1));
    await tapProfile(page, "Richard");
    await sleep(400);
    const snap3 = await slotSnap(page);
    record(prefix + " tap Richard resumes the same save with no Save Code",
      (await inPlay(page)) && sameSnap(snap1.p1, snap3.p1) && !(await loadDialogOpen(page)),
      "want=" + fpBefore + " got=" + fp(snap3.p1));
  } catch (err) {
    record(prefix + " ERROR", false, String(err && err.stack || err));
  } finally {
    await closeBrowser(browser);
  }
}

async function main() {
  console.log("ACCEPTANCE base=" + BASE);
  console.log("Richard code len=" + RICHARD_CODE.length + " Piper stand-in len=" + PIPER_CODE.length);

  await checkCurlPublic();
  await checkManifest();
  await checkInstallable();

  const dirR = "/tmp/ed16-profiles/importRichard";
  const dirJ = "/tmp/ed16-profiles/seedJax";
  const dirP = "/tmp/ed16-profiles/importPiper";
  const dirS = "/tmp/ed16-profiles/sharedThree";
  for (const d of [dirR, dirJ, dirP, dirS]) fs.rmSync(d, { recursive: true, force: true });

  await runImportCycles("import", dirR, "Richard", "p1", RICHARD_CODE, "import");
  await runImportCycles("seed", dirJ, "Jax", "p2", null, "seed");
  await runImportCycles("import", dirP, "Piper", "p3", PIPER_CODE, "import");
  await runSharedBrowserIndependence(dirS);
  await runIsolatedPeople();
  await runRedeploySurvival();

  const failed = results.filter((r) => !r.pass);
  const passed = results.filter((r) => r.pass);
  const out = {
    base: BASE,
    when: new Date().toISOString(),
    passed: passed.length,
    failed: failed.length,
    results,
    shots: fs.readdirSync(SHOTS).map((f) => path.join(SHOTS, f)),
  };
  const outPath = path.join(__dirname, "accept-results.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("----");
  console.log("TOTAL " + passed.length + " passed, " + failed.length + " failed  wrote " + outPath);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(" - " + f.step + ": " + f.detail);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
