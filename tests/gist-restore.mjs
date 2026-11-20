import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { passOwnerGate } from "./_owner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ED16_ROOT || path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHORT = fs.readFileSync("/workspace/ed16-restore/short-link.txt", "utf8").trim();
const GIST_ID = (SHORT.split("#rg=")[1] || "").trim();
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
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
      const typ = ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "application/octet-stream";
      res.writeHead(200, { "content-type": typ, "cache-control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((resolve) => srv.listen(port, "127.0.0.1", () => resolve(srv)));
}

async function main() {
  record("short link has a hex gist id (id length only)", /^[0-9a-f]{8,64}$/i.test(GIST_ID), "id_len=" + GIST_ID.length + " url_len=" + SHORT.length);
  const port = await pickPort();
  const base = "http://127.0.0.1:" + port + "/";
  const srv = await startServer(port);
  const dir = "/tmp/ed16-profiles/gist-restore-" + Date.now();
  fs.mkdirSync(dir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new", userDataDir: dir, protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio", "--disable-features=ServiceWorker"],
  });
  async function open(url) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", e && e.message));
    await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setUserAgent(UA);
    page.setDefaultTimeout(30000);
    await page.setCacheEnabled(false);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(".dc-root", { timeout: 25000 });
    await passOwnerGate(page);
    await page.waitForFunction(() => {
      const t = document.body.innerText || "";
      return (t.includes("Choose a profile") || t.includes("Could not load restore") || t.includes("Restore link is not valid") || t.includes("Restored:")) &&
        !t.includes("Loading saves") && !document.querySelector("[data-ed16-owner-gate]");
    }, { timeout: 25000 });
    await sleep(500);
    return page;
  }

  // Failure must not wipe existing saves
  let page = await open(base);
  await page.waitForFunction(() => !!(window.__ED16_PROF && window.__ED16_PROF.writeCode), { timeout: 15000 });
  const RICHARD = fs.readFileSync("/tmp/ed16-restore-richard-COPY.txt", "utf8").replace(/\s+/g, "");
  await page.evaluate((c) => window.__ED16_PROF.writeCode(1, c), RICHARD);
  let s0 = (await page.evaluate(() => window.__ED16_PROF.summaries())).find((x) => x.id === 1);
  record("pre-seeded Richard before failed gist", !!(s0 && s0.lvl === 197 && s0.depth === 200), JSON.stringify(s0));
  const blob0 = await page.evaluate(() => window.__ED16_PROF.blob(1));
  await page.close();

  page = await open(base + "#rg=ffffffffffffffffffffffffffffffff");
  await page.waitForFunction(() => /Could not load restore|Could not download the restore/i.test(document.body.innerText || ""), { timeout: 20000 });
  const failText = await page.evaluate(() => document.body.innerText || "");
  const failSums = await page.evaluate(() => window.__ED16_PROF.summaries());
  const sFail = failSums.find((x) => x.id === 1);
  const blobFail = await page.evaluate(() => window.__ED16_PROF.blob(1));
  record("bad gist shows an error toast", /Could not load restore|Could not download the restore/i.test(failText), "");
  record("bad gist does not clear existing Richard save", !!(sFail && sFail.lvl === 197 && sFail.depth === 200 && blobFail === blob0), JSON.stringify(sFail));
  await page.close();

  page = await open(base + "#rg=not_a_hex_id!!");
  await sleep(400);
  const invText = await page.evaluate(() => document.body.innerText || "");
  const sInv = (await page.evaluate(() => window.__ED16_PROF.summaries())).find((x) => x.id === 1);
  record("non-hex gist id shows invalid-link toast", /Restore link is not valid/i.test(invText), "");
  record("non-hex gist id does not clear Richard", !!(sInv && sInv.lvl === 197 && sInv.depth === 200), JSON.stringify(sInv));
  await page.close();

  // Happy path on a fresh profile (new browser context)
  await browser.close();
  const dir2 = "/tmp/ed16-profiles/gist-restore-ok-" + Date.now();
  fs.mkdirSync(dir2, { recursive: true });
  const browser2 = await puppeteer.launch({
    executablePath: CHROME, headless: "new", userDataDir: dir2, protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio", "--disable-features=ServiceWorker"],
  });
  const page2 = await browser2.newPage();
  page2.on("pageerror", (e) => console.log("PAGEERROR", e && e.message));
  await page2.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page2.setUserAgent(UA);
  page2.setDefaultTimeout(30000);
  await page2.goto(base + "#rg=" + GIST_ID, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page2.waitForSelector(".dc-root", { timeout: 25000 });
  await passOwnerGate(page2);
  await page2.waitForFunction(() => /Restored:\s*Richard,\s*Jax/.test(document.body.innerText || ""), { timeout: 25000 });
  await sleep(400);
  const body = await page2.evaluate(() => document.body.innerText || "");
  const sums = await page2.evaluate(() => window.__ED16_PROF.summaries());
  const r = sums.find((x) => x.id === 1), j = sums.find((x) => x.id === 2), p = sums.find((x) => x.id === 3);
  record("local #rg= toast Restored: Richard, Jax", /Restored:\s*Richard,\s*Jax/.test(body), "");
  record("hash cleared after gist restore", await page2.evaluate(() => !(location.hash || "").includes("rg=")), "");
  record("Richard Lv 197 Depth 200", !!(r && r.lvl === 197 && r.depth === 200 && !r.empty), JSON.stringify(r));
  record("Jax Lv 9 Depth 11", !!(j && j.lvl === 9 && j.depth === 11 && !j.empty), JSON.stringify(j));
  record("Piper not in payload, Empty", !!(p && p.empty), JSON.stringify(p));
  await page2.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page2.waitForSelector(".dc-root", { timeout: 25000 });
  await passOwnerGate(page2);
  await page2.waitForFunction(() => (document.body.innerText || "").includes("Choose a profile") && !document.querySelector("[data-ed16-owner-gate]"), { timeout: 20000 });
  await sleep(300);
  const sums2 = await page2.evaluate(() => window.__ED16_PROF.summaries());
  const r2 = sums2.find((x) => x.id === 1), j2 = sums2.find((x) => x.id === 2);
  record("reload: Richard and Jax persist", !!(r2 && r2.lvl === 197 && r2.depth === 200 && j2 && j2.lvl === 9 && j2.depth === 11), "");
  await browser2.close();
  srv.close();
  console.log("\n" + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
