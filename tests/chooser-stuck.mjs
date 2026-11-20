// Phone-size Choose-a-profile / recover-list stuck-screen test.
// Isolated Chrome profile only. Taps Tester (p4) to play. Never writes p1 or the real relay.
import puppeteer from "puppeteer-core";
import fs from "fs";
import { passOwnerGate } from "./_owner.mjs";

const BASE = process.env.ED16_URL || "http://127.0.0.1:50427/";
const LIVE_SITE = !/127\.0\.0\.1|localhost/.test(BASE);
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const DIR = "/tmp/ed16-profiles/chooser-stuck-" + Date.now();
const SHOT = "/tmp/ed16-chooser-stuck.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail });
  const d = detail === "" || detail == null ? "" : "  --  " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500);
  console.log((pass ? "PASS" : "FAIL") + "  " + step + d);
}
const wrap = (code, lvl, depth, t, extra) => JSON.stringify({ v: 1, compact: 1, code, depth, lvl, t, ...(extra || {}) });

async function ready(page) {
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  if (process.env.ED16_OWNER_CODE || LIVE_SITE) await passOwnerGate(page);
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return t.includes("Choose a profile") && !t.includes("Loading saves") && !document.querySelector("[data-ed16-owner-gate]");
  }, { timeout: 25000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button.dc-prof")].every((b) => !b.disabled), { timeout: 20000 });
  await sleep(400);
}

const vis = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { ok: false, reason: "missing" };
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  return { ok: visible, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), height: +r.height.toFixed(1), vw, vh };
}, sel);

async function main() {
  fs.rmSync(DIR, { recursive: true, force: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: DIR,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const host = new URL(BASE).host;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    try {
      const u = new URL(req.url());
      if (u.host === host || u.protocol === "data:" || u.protocol === "blob:") req.continue();
      else req.abort();
    } catch { req.abort(); }
  });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  page.on("dialog", (d) => d.dismiss());

  if (!process.env.ED16_OWNER_CODE && !LIVE_SITE) {
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem("ed16_owner_ok", "ed16-owner-ok-v1"); } catch {} });
  }
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await ready(page);

  rec("chooser opens on load at 390x844", !!(await page.$("div.dc-profs")), "");
  rec("Back control is in the header on first paint", (await vis(page, "button.dc-profs-close")).ok, await vis(page, "button.dc-profs-close"));

  // Seed 15 distinct orphan saves + 8 identical-except-t recover_prev snapshots.
  // Keys are test orphans / p4 snapshots only — never a live p1 slot.
  const t0 = Date.UTC(2026, 10, 20, 18, 56, 0);
  const seeded = await page.evaluate((t0) => {
    const wrap = (code, lvl, depth, t, extra) => JSON.stringify({ v: 1, compact: 1, code, depth, lvl, t, ...(extra || {}) });
    for (let i = 0; i < 15; i++) {
      localStorage.setItem("ed16_orphan_chooser_" + i, wrap("TEST-orphan-" + i, 10 + i, 8 + i, t0 - i * 60000, { gold: i }));
    }
    const same = (t) => wrap("TEST-same-fp", 23, 20, t);
    for (let i = 0; i < 8; i++) localStorage.setItem("ed16_recover_prev_p4_" + (t0 + i), same(t0 + i * 400));
    return { orphans: 15, dups: 8 };
  }, t0);
  rec("seeded 15 distinct orphans and 8 identical-except-t p4 snapshots", seeded.orphans === 15 && seeded.dups === 8, seeded);

  await page.evaluate(() => { const b = document.querySelector("button.dc-recover"); if (b) b.click(); });
  await page.waitForFunction(() => document.querySelectorAll(".dc-rec-row").length > 0, { timeout: 15000 });
  await sleep(300);
  await page.screenshot({ path: SHOT, fullPage: false }).catch(() => {});

  const layout = await page.evaluate(() => {
    const close = document.querySelector("button.dc-profs-close");
    const cr = close ? close.getBoundingClientRect() : null;
    const card = document.querySelector(".dc-profs-card");
    const body = document.querySelector(".dc-profs-body");
    const list = document.querySelector(".dc-profs-list");
    const richard = [...document.querySelectorAll("button.dc-prof")].find((b) => /Richard/.test(b.innerText || ""));
    const tester = [...document.querySelectorAll("button.dc-prof")].find((b) => /Tester/.test(b.innerText || ""));
    const rows = [...document.querySelectorAll(".dc-rec-row")].map((r) => (r.innerText || "").replace(/\s+/g, " ").trim());
    const hudProf = [...document.querySelectorAll(".dc-saveload button, .dc-ctrl button")].find((el) => (el.textContent || "").trim() === "Profiles");
    if (richard) richard.scrollIntoView({ block: "nearest" });
    const rr = richard ? richard.getBoundingClientRect() : null;
    const tr = tester ? tester.getBoundingClientRect() : null;
    const br = body ? body.getBoundingClientRect() : null;
    const lr = list ? list.getBoundingClientRect() : null;
    const inView = (r) => !!(r && r.width > 0 && r.height > 8 && r.bottom > 0 && r.top < window.innerHeight);
    return {
      closeVisible: !!(cr && cr.height > 0 && cr.top >= 0 && cr.bottom <= window.innerHeight + 1),
      closeText: close ? (close.textContent || "").trim() : "",
      closeTop: cr ? +cr.top.toFixed(1) : null,
      listH: lr ? +lr.height.toFixed(1) : 0,
      bodyH: br ? +br.height.toFixed(1) : 0,
      bodyScroll: body ? body.scrollHeight > body.clientHeight + 4 : false,
      richardH: rr ? +rr.height.toFixed(1) : 0,
      richardVisible: inView(rr),
      testerVisible: inView(tr),
      rows: rows.length,
      rowSample: rows.slice(0, 3),
      sameFpRows: rows.filter((t) => /TEST-same-fp|ed16_recover_prev_p4_/.test(t)).length,
      orphanRows: rows.filter((t) => /ed16_orphan_chooser_/.test(t)).length,
      hudProfExists: !!hudProf,
      stageH: (document.querySelector(".dc-stage") || {}).clientHeight || 0,
      keysBefore: Object.keys(localStorage).filter((k) => k.startsWith("ed16_recover_prev_p4_")).length,
    };
  });
  rec("Back stays visible at the top with the recover list open", layout.closeVisible && layout.closeText === "Back", layout);
  rec("Richard's tile has a real height (not collapsed to 0)", layout.richardH >= 24, layout);
  rec("Richard's tile is on screen (or after scroll-into-view at top of body)", layout.richardVisible, layout);
  rec("recover list is capped at 15 rows and includes the distinct orphans", layout.rows === 15 && layout.orphanRows >= 14, layout);
  rec("8 identical-except-t snapshots display as 1 row", layout.sameFpRows <= 1, layout);

  // keepSlotBackup dedupe: same blob three times should add at most one new p4 key; never deletes.
  const dedup = await page.evaluate(() => {
    const before = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      before[k] = localStorage.getItem(k);
    }
    const blob = JSON.stringify({ v: 1, compact: 1, code: "TEST-keep-once", depth: 11, lvl: 7, t: 111 });
    const api = window.__ED16_SAVE;
    if (!api || typeof api.keepSlotBackup !== "function") return { ok: false, reason: "no hook" };
    api.keepSlotBackup(9, [blob, blob, blob]);
    api.keepSlotBackup(9, [JSON.stringify({ v: 1, compact: 1, code: "TEST-keep-once", depth: 11, lvl: 7, t: 222 })]);
    const after = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      after[k] = localStorage.getItem(k);
    }
    const lost = Object.keys(before).filter((k) => !(k in after));
    const added = Object.keys(after).filter((k) => !(k in before));
    return { ok: true, lost, added, addedPrev: added.filter((k) => k.startsWith("ed16_recover_prev_p9_")) };
  });
  rec("keepSlotBackup writes one snapshot for three identical (+ t-only) blobs", dedup.ok && dedup.addedPrev.length === 1, dedup);
  rec("keepSlotBackup never deletes existing keys", dedup.ok && dedup.lost.length === 0, dedup);

  // Profiles button (HUD, outside the modal) toggles the chooser closed, then opens it again.
  const clickHudProfiles = () => page.evaluate(() => {
    const hud = [...document.querySelectorAll(".dc-saveload button, .dc-ctrl button")].find((el) => (el.textContent || "").trim() === "Profiles");
    if (!hud) return false;
    hud.click();
    return true;
  });
  rec("HUD Profiles button is present outside the modal", !!(await clickHudProfiles()), "");
  await page.waitForFunction(() => !document.querySelector("div.dc-profs"), { timeout: 8000 });
  rec("HUD Profiles toggles the chooser closed", !(await page.$("div.dc-profs")), "");
  rec("clicked Profiles to reopen", !!(await clickHudProfiles()), "");
  await page.waitForSelector("div.dc-profs", { timeout: 8000 });
  rec("HUD Profiles opens the chooser again with Back visible", !!(await page.$("button.dc-profs-close")), "");

  // Back itself closes, even on the title (no Cancel).
  const hadBack = await page.evaluate(() => {
    const b = document.querySelector("button.dc-profs-close");
    if (!b) return false;
    b.click();
    return true;
  });
  rec("Back button was present to click", hadBack, "");
  await page.waitForFunction(() => !document.querySelector("div.dc-profs"), { timeout: 8000 });
  rec("Back closes the chooser without picking a profile", !(await page.$("div.dc-profs")), "");

  // Reopen and play on Tester only.
  await page.evaluate(() => {
    const hud = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Profiles" && !el.closest(".dc-profs"));
    if (hud) hud.click();
  });
  await page.waitForSelector("div.dc-profs", { timeout: 8000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => /Tester/.test(el.innerText || ""));
    if (b) b.click();
  });
  await sleep(800);
  const playing = await page.evaluate(() => {
    const t = [...document.querySelectorAll("button.dc-prof")].find((el) => /Tester/.test(el.innerText || ""));
    return { pickerGone: !document.querySelector("div.dc-profs"), hasSave: !!document.querySelector("button.dc-savegame"), stillOnPicker: !!t };
  });
  rec("tapping Tester leaves the chooser and starts a test run", playing.pickerGone && playing.hasSave, playing);

  rec("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  const fails = results.filter((r) => !r.pass).length;
  console.log(fails ? `CHOOSER-STUCK TEST: ${fails} FAIL` : `CHOOSER-STUCK TEST: ALL ${results.length} PASS`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
