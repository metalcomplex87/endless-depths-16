import puppeteer from "puppeteer-core";
import fs from "fs";
// Save test on a COPY of Richard's save code, in a throwaway headless profile (never touches real saves).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50263/";
const CODE = fs.readFileSync(process.env.RICHARD_FILE || "/workspace/ed16-web/saves/richard-boss-2026-11-17.txt", "utf8").replace(/\s+/g, "");
const results = [];
function rec(step, pass, detail = "") { results.push({ step, pass: !!pass, detail: String(detail) }); console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  --  " + String(detail).slice(0, 500) : "")); }
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
    await page.evaluate(() => { const can = [...document.querySelectorAll("button")].some((el) => (el.textContent || "").includes("LOAD code") && !el.disabled); if (!can) { const lk = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "\ud83d\udd12"); if (lk) lk.click(); } });
    await sleep(400);
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").includes("LOAD code") && !el.disabled) || [...document.querySelectorAll("button")].find((el) => /\bLOAD$/.test((el.textContent || "").trim()) && !el.disabled);
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) { await page.screenshot({path:"/tmp/loadfail.png"}); console.log((await page.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.textContent.trim()+(b.disabled?"(x)":"")).join(" | ")))); throw new Error("LOAD code button not available"); }
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
    const hook = (document.documentElement.dataset.ed16Msg || window.__ED16_LAST_MSG || "") + "\n" + (document.body.innerText || "");
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




const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/nksave-" + Date.now(), args: ["--no-sandbox", "--mute-audio"] });
const page = await b.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("dialog", (d) => d.accept().catch(() => {}));
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await waitReady(page);
await tapProfile(page, "Richard");
await loadCode(page, CODE);
await sleep(1200);
const NK = (n, ...a) => page.evaluate((n, a) => window.__ED16_NK[n](...a), n, a);
const h0 = await NK("hero"); const st0 = await NK("st");
rec("Richard's (copied) old save loads in the necklace build", h0 && h0.depth > 1, JSON.stringify(h0));
rec("old save has no necklace state and no bag section", st0 === null && !(await page.$("[data-nk-section]")), JSON.stringify(st0));
await NK("setOwn", [1, 0, 1, 0, 0, 1, 0, 0]); await NK("equip", 2);
await page.evaluate(() => { const bt = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Save Game" && !el.disabled); if (bt) bt.click(); });
await sleep(1200);
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await waitReady(page);
await tapProfile(page, "Richard");
await sleep(1500);
const h1 = await NK("hero"); const st1 = await NK("st");
rec("after Save Game + reload: same run (depth kept)", h1 && h1.depth === h0.depth, JSON.stringify(h1));
rec("after reload: owned necklaces and the worn one are kept", st1 && JSON.stringify(st1.own) === JSON.stringify([1, 0, 1, 0, 0, 1, 0, 0]) && JSON.stringify(st1.eq) === JSON.stringify([2]), JSON.stringify(st1));
rec("no page errors", errs.length === 0, errs.join(" | "));
await b.close();
const f = results.filter((r) => !r.pass).length; console.log("SUMMARY " + (results.length - f) + "/" + results.length); process.exit(f ? 1 : 0);
