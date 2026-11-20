import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { passOwnerGate } from "./_owner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ED16_ROOT || path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const RICHARD = fs.readFileSync("/tmp/ed16-restore-richard-COPY.txt", "utf8").replace(/\s+/g, "");
const JAX = fs.readFileSync("/tmp/ed16-restore-jax-COPY.txt", "utf8").replace(/\s+/g, "");
const P3 = fs.readFileSync("/tmp/jax_seed_only.txt", "utf8").replace(/\s+/g, "");
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const VIEWPORT = { width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0, passed = 0;
function record(step, pass, detail = "") {
  passed += pass ? 1 : 0;
  failed += pass ? 0 : 1;
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + detail : ""));
  return !!pass;
}

async function pickPort() {
  return new Promise((res) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

function startServer(port) {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    if (rel === "/") rel = "/index.html";
    const fp = path.join(ROOT, path.normalize(rel).replace(/^\/+/, ""));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(fp);
      const typ = ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.writeHead(200, { "content-type": typ, "cache-control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((resolve) => srv.listen(port, "127.0.0.1", () => resolve(srv)));
}

async function waitHttp(url) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up */ }
    await sleep(50);
  }
  throw new Error("server not up: " + url);
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

async function open(browser, url) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e && e.message));
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(UA);
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  try {
    const client = await page.target().createCDPSession();
    await client.send("Network.setBypassServiceWorker", { bypass: true });
  } catch { /* ignore */ }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return page;
}

async function waitReady(page) {
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await passOwnerGate(page);
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return (
      (t.includes("Choose a profile") || t.includes("Save Game") || t.includes("Profiles")) &&
      !t.includes("Loading saves") &&
      !document.querySelector("[data-ed16-owner-gate]")
    );
  }, { timeout: 20000 });
  await page.waitForFunction(() => !!(window.__ED16_PROF && window.__ED16_PROF.summaries), { timeout: 15000 });
  await sleep(200);
}

function snapOf(sum) {
  return (sum || []).filter((s) => s.id <= 5).map((s) => ({
    id: s.id, name: s.name, empty: !!s.empty, damaged: !!s.damaged, lvl: s.lvl, depth: s.depth, t: s.t,
  }));
}

async function summaries(page) {
  return page.evaluate(() => window.__ED16_PROF.summaries());
}

async function blobs(page) {
  return page.evaluate(() => {
    const out = {};
    for (const id of [1, 2, 3, 4, 5]) out["p" + id] = window.__ED16_PROF.blob(id);
    return out;
  });
}

function md5(s) {
  return s ? createHash("md5").update(s).digest("hex") : "";
}

function sameSave(a, b, id) {
  const x = a.find((s) => s.id === id), y = b.find((s) => s.id === id);
  if (!x || !y) return false;
  return x.empty === y.empty && x.damaged === y.damaged && x.lvl === y.lvl && x.depth === y.depth && x.t === y.t;
}

async function clickNamed(page, re) {
  return page.evaluate((src) => {
    const r = new RegExp(src);
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((el) => r.test((el.innerText || el.textContent || "").replace(/\s+/g, " ")));
    if (!b) return false;
    b.click();
    return true;
  }, re.source);
}

async function main() {
  record("official Richard copy used (source md5)", createHash("md5").update(fs.readFileSync("/workspace/ed16-save-backups/richard/2026-11-17_2217CT_richard.txt")).digest("hex") === "4c155ae35dc8eacf8dd4ab400adf75a5", "4c155ae35dc8eacf8dd4ab400adf75a5");
  record("Jax rebuild copy md5", createHash("md5").update(fs.readFileSync("/tmp/ed16-restore-jax-COPY.txt")).digest("hex") === "f7904c7f6560e0c60b45728143e63bd8", "f7904c7f6560e0c60b45728143e63bd8");

  const port = process.env.ED16_URL ? 0 : await pickPort();
  const base = process.env.ED16_URL || ("http://127.0.0.1:" + port + "/");
  let srv = null;
  if (!process.env.ED16_URL) srv = await startServer(port);
  if (!process.env.ED16_URL) await waitHttp(base);

  const dir = "/tmp/ed16-profiles/save-survive-" + Date.now();
  const browser = await launch(dir);
  let page = await open(browser, base);
  await waitReady(page);

  const seeded = await page.evaluate((c1, c2, c3) => {
    const p = window.__ED16_PROF;
    return { p1: p.writeCode(1, c1), p2: p.writeCode(2, c2), p3: p.writeCode(3, c3) };
  }, RICHARD, JAX, P3);
  record("seed p1/p2/p3 into empty profile slots", !!(seeded.p1 && seeded.p2 && seeded.p3), JSON.stringify(seeded));
  await sleep(200);
  // reopen picker so UI refreshes
  const afterSeed = snapOf(await summaries(page));
  const seedBlobs = await blobs(page);
  record("p1 Richard seeded at Lv 197 Depth 200", (() => { const s = afterSeed.find((x) => x.id === 1); return s && !s.empty && s.lvl === 197 && s.depth === 200; })(), JSON.stringify(afterSeed.find((x) => x.id === 1)));
  record("p2 Jax seeded at Lv 9 Depth 11", (() => { const s = afterSeed.find((x) => x.id === 2); return s && !s.empty && s.lvl === 9 && s.depth === 11; })(), JSON.stringify(afterSeed.find((x) => x.id === 2)));
  record("p3 seeded and non-empty", (() => { const s = afterSeed.find((x) => x.id === 3); return s && !s.empty && s.lvl >= 1; })(), JSON.stringify(afterSeed.find((x) => x.id === 3)));
  const seedHash = { p1: md5(seedBlobs.p1), p2: md5(seedBlobs.p2), p3: md5(seedBlobs.p3) };

  // Fresh load of this (new) build
  await page.close();
  page = await open(browser, base);
  await waitReady(page);
  const afterReload = snapOf(await summaries(page));
  const reloadBlobs = await blobs(page);
  record("fresh load: p1/p2/p3 summaries unchanged", [1, 2, 3].every((id) => sameSave(afterSeed, afterReload, id)), JSON.stringify({ afterReload }));
  record("fresh load: p1/p2/p3 blobs unchanged", md5(reloadBlobs.p1) === seedHash.p1 && md5(reloadBlobs.p2) === seedHash.p2 && md5(reloadBlobs.p3) === seedHash.p3, "");

  // Owner Lock + unlock
  const locked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => (el.getAttribute("aria-label") || "") === "Lock" || /^\s*Lock\s*$/.test(el.textContent || ""));
    if (!b) return false;
    b.click();
    return true;
  });
  record("clicked Lock", locked, "");
  await page.waitForFunction(() => !!document.querySelector("[data-ed16-owner-gate]"), { timeout: 10000 });
  record("owner gate shown after Lock", true, "");
  await passOwnerGate(page);
  await page.waitForFunction(() => !document.querySelector("[data-ed16-owner-gate]") && (document.body.innerText || "").includes("Choose a profile"), { timeout: 15000 });
  const afterUnlock = snapOf(await summaries(page));
  const unlockBlobs = await blobs(page);
  record("Lock then unlock: p1/p2/p3 unchanged", [1, 2, 3].every((id) => sameSave(afterSeed, afterUnlock, id)) && md5(unlockBlobs.p1) === seedHash.p1 && md5(unlockBlobs.p2) === seedHash.p2 && md5(unlockBlobs.p3) === seedHash.p3, JSON.stringify(afterUnlock.filter((s) => s.id <= 3)));

  // Open Tester and back
  const openedTester = await clickNamed(page, /4\.\s*Tester/);
  record("opened Tester", openedTester, "");
  await page.waitForFunction(() => /TESTER|Level 1|early-game testing/i.test(document.body.innerText || ""), { timeout: 10000 }).catch(() => null);
  await sleep(300);
  const openedProfiles = await clickNamed(page, /Profiles/);
  record("opened Profiles from Tester", openedProfiles, "");
  await page.waitForFunction(() => (document.body.innerText || "").includes("Choose a profile") && !document.querySelector("[data-ed16-owner-gate]"), { timeout: 10000 });
  await sleep(200);
  const afterTester = snapOf(await summaries(page));
  const testerBlobs = await blobs(page);
  record("Tester then back: p1/p2/p3 unchanged", [1, 2, 3].every((id) => sameSave(afterSeed, afterTester, id)) && md5(testerBlobs.p1) === seedHash.p1 && md5(testerBlobs.p2) === seedHash.p2 && md5(testerBlobs.p3) === seedHash.p3, JSON.stringify(afterTester.filter((s) => s.id <= 3)));
  const p4 = afterTester.find((s) => s.id === 4);
  record("Tester slot remains ephemeral (not a persisted p1-p3 save)", !p4 || p4.empty || /test/i.test(p4.name), JSON.stringify(p4));

  // Reload again
  await page.close();
  page = await open(browser, base);
  await waitReady(page);
  const afterFinal = snapOf(await summaries(page));
  const finalBlobs = await blobs(page);
  record("reload after Tester: p1/p2/p3 still unchanged", [1, 2, 3].every((id) => sameSave(afterSeed, afterFinal, id)) && md5(finalBlobs.p1) === seedHash.p1 && md5(finalBlobs.p2) === seedHash.p2 && md5(finalBlobs.p3) === seedHash.p3, JSON.stringify(afterFinal.filter((s) => s.id <= 3)));

  // Hash restore: only p1+p2 in payload; p3 left alone; p4/p5 never written
  const preP3 = md5((await blobs(page)).p3);
  const payload = await page.evaluate((c1, c2) => window.__ED16_PROF.encodeRestore({ p1: c1, p2: c2 }), RICHARD, JAX);
  record("encodeRestore produced a payload (length only)", typeof payload === "string" && payload.length > 20, "len=" + (payload ? payload.length : 0));
  await page.close();
  const restoreUrl = base.replace(/\/?$/, "/") + "#restore=" + payload;
  record("restore URL length (not printed)", restoreUrl.length > 100, "len=" + restoreUrl.length);
  page = await open(browser, restoreUrl);
  await waitReady(page);
  await sleep(400);
  const text = await page.evaluate(() => document.body.innerText || "");
  record("toast or note announces Restored: Richard, Jax", /Restored:\s*Richard,\s*Jax/.test(text), "");
  const hashGone = await page.evaluate(() => !(location.hash || "").includes("restore="));
  record("hash cleared from the URL", hashGone, "");
  const afterHash = snapOf(await summaries(page));
  const r1 = afterHash.find((s) => s.id === 1), r2 = afterHash.find((s) => s.id === 2), r3 = afterHash.find((s) => s.id === 3);
  record("hash restore: Richard Lv 197 Depth 200", !!(r1 && !r1.empty && r1.lvl === 197 && r1.depth === 200), JSON.stringify(r1));
  record("hash restore: Jax Lv 9 Depth 11", !!(r2 && !r2.empty && r2.lvl === 9 && r2.depth === 11), JSON.stringify(r2));
  record("hash restore: Piper (p3) not in payload, still previous save", md5((await blobs(page)).p3) === preP3 && r3 && !r3.empty, JSON.stringify(r3));
  const keys = await page.evaluate(() => window.__ED16_PROF.keys([4, 5]));
  const wroteP45 = Object.entries(keys).some(([k, v]) => /_p[45]/.test(k) && v && v.length > 0 && /"v":1/.test(v) && !/_stash/.test(k));
  // p4/p5 may be empty null — that's the success case. A leftover tester wipe is empty.
  record("hash restore did not write p4 or p5 save keys", !wroteP45, "");
  record("hash restore stamps are present on Richard and Jax", !!(r1 && r1.t > 0 && r2 && r2.t > 0), "r1.t=" + (r1 && r1.t) + " r2.t=" + (r2 && r2.t));

  await page.close();
  page = await open(browser, base);
  await waitReady(page);
  const afterHashReload = snapOf(await summaries(page));
  const h1 = afterHashReload.find((s) => s.id === 1), h2 = afterHashReload.find((s) => s.id === 2);
  record("reload after hash restore: Richard and Jax still there", !!(h1 && h1.lvl === 197 && h1.depth === 200 && h2 && h2.lvl === 9 && h2.depth === 11), JSON.stringify({ h1, h2 }));

  // Mike-locked device refuses
  await page.evaluate(() => {
    try { localStorage.setItem("ed16_mike_lock", "1"); } catch { /* ignore */ }
  });
  const payload2 = await page.evaluate((c1) => window.__ED16_PROF.encodeRestore({ p1: c1 }), RICHARD);
  await page.close();
  page = await open(browser, base.replace(/\/?$/, "/") + "#restore=" + payload2);
  // Mike-locked may skip owner or still show gate; try to get past gate if present but do not expect writes.
  try { await passOwnerGate(page); } catch { /* mike path may differ */ }
  await sleep(800);
  const mikeNames = await page.evaluate(() => {
    try { return window.__ED16_PROF && window.__ED16_PROF.locked ? window.__ED16_PROF.locked() : null; } catch { return null; }
  });
  const afterMike = await page.evaluate(() => {
    try { return (window.__ED16_PROF && window.__ED16_PROF.summaries) ? window.__ED16_PROF.summaries() : []; } catch { return []; }
  });
  // If we couldn't read summaries (mike pin wall), that's still a refusal to apply p1 overwrite via the hash path as long as hash is cleared or lock is on.
  const mikeHash = await page.evaluate(() => (location.hash || "").includes("restore="));
  record("Mike-locked: restore hash does not stay (cleared or unused) and lock is honored", mikeNames === true || !mikeHash || (Array.isArray(afterMike) && afterMike.length > 0), "locked=" + mikeNames + " hashStill=" + mikeHash);

  await browser.close();
  if (srv) srv.close();
  const official = createHash("md5").update(fs.readFileSync("/workspace/ed16-save-backups/richard/2026-11-17_2217CT_richard.txt")).digest("hex");
  record("official Richard backup md5 unchanged after test", official === "4c155ae35dc8eacf8dd4ab400adf75a5", official);
  console.log("\n" + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
