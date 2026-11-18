import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ED16_ROOT || path.resolve(__dirname, "..");
const BASE = process.env.ED16_URL || "http://127.0.0.1:50177/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = fs.readFileSync("/workspace/ed16test/user_save_code.txt", "utf8").replace(/\s+/g, "");
const DIR = "/tmp/ed16-profiles/smoke";
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const VIEWPORT = { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  fs.mkdirSync(DIR, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: DIR,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
}

async function open(browser) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e && e.message));
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAV", f.url()); });
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(UA);
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  const chain = resp ? resp.request().redirectChain() : [];
  return { page, status: resp ? resp.status() : 0, url: page.url(), redirects: chain.map((r) => r.url()) };
}

async function waitReady(page) {
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return (t.includes("Profiles") || t.includes("Choose a profile") || t.includes("Save Game")) && !t.includes("Loading saves");
  }, { timeout: 20000 });
  await sleep(400);
}

async function openProfiles(page) {
  const open = await page.$("div.dc-profs");
  if (open) return;
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Profiles");
    if (b) b.click();
  });
  await page.waitForSelector("div.dc-profs", { timeout: 10000 });
}

async function tapProfile(page, name) {
  await openProfiles(page);
  const ok = await page.evaluate((name) => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes(name));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, name);
  if (!ok) throw new Error("could not tap " + name);
  await sleep(500);
}

async function loadCode(page, code) {
  if (!(await page.$('textarea[aria-label="Paste save code"]'))) {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD code") && !el.disabled);
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) throw new Error("LOAD code button not available");
    await page.waitForSelector('textarea[aria-label="Paste save code"]', { timeout: 10000 });
  }
  await page.evaluate((c) => {
    const ta = document.querySelector('textarea[aria-label="Paste save code"]');
    if (!ta) throw new Error("paste textarea missing");
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
    if (!b) throw new Error("LOAD THIS CODE not available");
    b.click();
  });
  await page.waitForFunction(() => {
    const hook = (document.documentElement.dataset.ed16Import || window.__ED16_IMPORT_MSG || "") + "\n" + (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || ""); // ed16Import: the import message survives later log lines (e.g. auto-combine)
    return /Imported/i.test(hook) && /press Save Game/i.test(hook) && /saves on this device/i.test(hook);
  }, { timeout: 25000 }).catch(async (err) => {
    const last = await page.evaluate(() => (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "")).catch(() => "?");
    console.log("loadCode: last message was:", last);
    console.log("BODY:", (await page.evaluate(() => document.body.innerText).catch(() => "?")).slice(0, 1500));
    await page.screenshot({ path: "/tmp/smoke-fail.png" }).catch(() => {});
    throw err;
  });
  await sleep(300);
}

async function unlockAndSave(page) {
  await page.evaluate(() => {
    const save = document.querySelector("button.dc-savegame");
    if (save && save.disabled) {
      const lock = document.querySelector("button.dc-lock");
      if (lock) lock.click();
    }
  });
  await sleep(200);
  // Pause first so the run cannot keep ticking (and autosaving) after we snapshot.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true, cancelable: true }));
  });
  await sleep(150);
  await page.waitForFunction(() => {
    const b = document.querySelector("button.dc-savegame");
    return b && !b.disabled;
  }, { timeout: 10000 });
  await page.click("button.dc-savegame");
  await sleep(500);
  // Re-lock so close/reopen cannot advance the save.
  await page.evaluate(() => {
    const lock = document.querySelector("button.dc-lock");
    if (lock && !lock.className.includes("on")) lock.click();
  });
  await sleep(200);
}

function sameUrl(a, b) {
  return String(a || "").replace(/\/$/, "") === String(b || "").replace(/\/$/, "");
}

function noRedirectNav(nav, base) {
  const redirects = (nav.redirects || []).filter((u) => !sameUrl(u, nav.url) && !sameUrl(u, base));
  const urlOk = sameUrl(nav.url, base);
  const statusOk = nav.status === 200 || nav.status === 304 || (nav.status === 0 && urlOk);
  return { ok: statusOk && urlOk && redirects.length === 0, detail: JSON.stringify({ status: nav.status, url: nav.url, redirects: nav.redirects }) };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.sort();
    const parse = (k) => {
      const v = localStorage.getItem(k);
      if (!v) return null;
      try {
        const o = JSON.parse(v);
        return { depth: o.depth, lvl: o.lvl, xp: o.xp, gold: o.gold, potions: o.potions, kills: o.kills, turn: o.turn, hx: o.hx, hy: o.hy, hp: o.hp };
      } catch { return { raw: v.length }; }
    };
    return {
      build: document.documentElement.dataset.ed16Build || window.__ED16_BUILD || "",
      keys,
      p1: parse("ed16_save_v1_p1"),
      p2: parse("ed16_save_v1_p2"),
      p3: parse("ed16_save_v1_p3"),
    };
  });
}

function fp(s) {
  if (!s) return "EMPTY";
  return [s.lvl, s.depth, s.gold, s.xp, s.potions, s.kills, s.turn, s.hp, s.hx, s.hy].join("|");
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

async function closeB(browser) {
  if (!browser) return;
  try { await browser.close(); } catch { /* */ }
  await sleep(400);
}

async function waitForBuild(page, want, ms = 90000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const got = await page.evaluate(() => document.documentElement.dataset.ed16Build || window.__ED16_BUILD || "");
    if (got === want) return true;
    await page.setCacheEnabled(false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await waitReady(page);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function isRemoteHost(url) {
  return !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])\b/i.test(url);
}

function rebuildTrivial() {
  const id = "smoke-" + Date.now();
  const env = { ...process.env, ED16_BUILD_ID: id, ED16_SKIP_SMOKE: "1" };
  let r;
  if (isRemoteHost(BASE)) {
    r = spawnSync("bash", [path.join(ROOT, "deploy.sh"), "--no-smoke"], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });
  } else {
    r = spawnSync("bash", ["-lc", 'printf \'export const ED16_BUILD = "%s";\\n\' "$ED16_BUILD_ID" > src/build-id.ts && sed "s/ed16-__BUILD_ID__/ed16-$ED16_BUILD_ID/g" src/sw.template.js > sw.js && npm run build'], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });
  }
  if (r.status !== 0) {
    throw new Error("trivial rebuild failed: " + (r.stderr || r.stdout));
  }
  return id;
}

async function main() {
  console.log("SMOKE base=" + BASE + " root=" + ROOT);
  fs.rmSync(DIR, { recursive: true, force: true });

  let browser;
  try {
    browser = await launch();
    const first = await open(browser);
    const firstNav = noRedirectNav(first, BASE);
    record("open standalone URL, no redirect", firstNav.ok, firstNav.detail);
    const page = first.page;
    await waitReady(page);
    const build1 = await page.evaluate(() => document.documentElement.dataset.ed16Build || window.__ED16_BUILD || "");
    record("game rendered with a build id", !!build1, build1);

    await tapProfile(page, "Richard");
    const body = await page.evaluate(() => document.body.innerText || "");
    record("LOAD is obvious on empty Richard", /Paste a Save Code with LOAD|LOAD code/i.test(body));
    await loadCode(page, RICHARD);
    const imported = await page.evaluate(() => (document.documentElement.dataset.ed16Import || window.__ED16_IMPORT_MSG || "") + "\n" + (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || ""));
    record("import message shown", /Imported/i.test(imported) && /press Save Game/i.test(imported) && /saves on this device/i.test(imported),
      (imported.match(/Imported[^\n]{0,180}/) || [""])[0]);
    await unlockAndSave(page);
    const snap1 = await snapshot(page);
    record("Save Game wrote Richard (ed16_save_v1_p1)", !!snap1.p1 && snap1.p1.lvl >= 50, fp(snap1.p1));
    record("storage keys use the stable ed16_ prefix", snap1.keys.every((k) => k.startsWith("ed16_")), snap1.keys.join(", "));
    record("stable profile keys present", snap1.keys.includes("ed16_save_v1_p1"), snap1.keys.join(", "));
    await dropServiceWorker(page);
    const keysBefore = snap1.keys.slice();
    const fpBefore = fp(snap1.p1);
    await closeB(browser);
    browser = null;

    // Trivial redeploy: new build id, same game, same storage keys.
    const newId = rebuildTrivial();
    record("trivial change rebuilt", true, newId);

    browser = await launch();
    const second = await open(browser);
    const secondNav = noRedirectNav(second, BASE);
    record("reopen after redeploy, no redirect", secondNav.ok, secondNav.detail);
    await waitReady(second.page);
    const loaded = await waitForBuild(second.page, newId, 90000);
    const snap2 = await snapshot(second.page);
    record("new build is what loaded", loaded && snap2.build === newId, "want=" + newId + " got=" + snap2.build);
    record("existing storage keys survived the redeploy", keysBefore.every((k) => snap2.keys.includes(k)),
      "before=" + keysBefore.join(",") + " after=" + snap2.keys.join(","));
    record("no storage key was renamed", snap2.keys.every((k) => k.startsWith("ed16_")), snap2.keys.join(","));
    record("Richard save still present under ed16_save_v1_p1", !!snap2.p1, fp(snap2.p1));

    await tapProfile(second.page, "Richard");
    await sleep(500);
    const snap3 = await snapshot(second.page);
    const playState = await second.page.evaluate(() => {
      const loadOpen = !!document.querySelector('textarea[aria-label="Paste save code"]');
      const title = [...document.querySelectorAll("button")].some((el) => /✦\s*New Game/.test(el.textContent || ""));
      const hasUlt = !!document.querySelector("button.dc-ult");
      const hasPick = !!document.querySelector("button.dc-wbrk");
      return { loadOpen, title, hasUlt, hasPick, inPlay: !loadOpen && !title && (hasUlt || hasPick) };
    });
    record("after redeploy, tap Richard resumes the same save with no Save Code",
      playState.inPlay && fp(snap3.p1) === fpBefore,
      "want=" + fpBefore + " got=" + fp(snap3.p1) + " " + JSON.stringify(playState));
  } catch (err) {
    record("SMOKE ERROR", false, err && err.stack ? err.stack : String(err));
  } finally {
    await closeB(browser);
  }

  const failed = results.filter((r) => !r.pass);
  console.log("----");
  console.log("SMOKE " + (results.length - failed.length) + " passed, " + failed.length + " failed");
  if (failed.length) {
    for (const f of failed) console.log(" - " + f.step + ": " + f.detail);
    process.exitCode = 1;
  }
}

main();
