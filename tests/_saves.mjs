import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.argv[2];
const OUT = process.argv[3] || "/workspace/ed16-web/screenshots-saves";
fs.mkdirSync(OUT, { recursive: true });
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



const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", userDataDir: "/tmp/ed16-profiles/saves-"+Date.now(), args: ["--no-sandbox","--mute-audio"] });
const page = await b.newPage(); page.on("pageerror", e=>console.log("PAGEERROR", e.message)); page.on("dialog", d=>{console.log("DIALOG "+d.type()); d.accept().catch(()=>{});});
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await waitReady(page);
const build = await page.evaluate(() => document.documentElement.dataset.ed16Build);
console.log("BUILD", build);
const hasHz = await page.evaluate(() => !!window.__ED16_HZ);
const res = {};
for (const [name, file] of [["Richard", "/workspace/ed16-web/saves/richard-boss-2026-11-17.txt"], ["Jax", "/tmp/p2-test-code.txt"]]) {
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await waitReady(page);
  await tapProfile(page, name);
  console.log(name, "tapped; buttons:", (await page.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.textContent.trim()+(b.disabled?"(x)":"")).join(" | "))).slice(0,300));
  await loadCode(page, fs.readFileSync(file, "utf8").replace(/\s+/g, ""));
  await sleep(1500);
  const rep = hasHz ? await page.evaluate(() => window.__ED16_HZ.prisReport()) : null;
  // save, then reload the page and reopen the profile: numbers must persist
  await page.evaluate(() => { const bt = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Save Game" && !el.disabled); if (bt) bt.click(); });
  await sleep(800);
  await page.screenshot({ path: OUT + "/" + name.toLowerCase() + "-loaded.png" });
  res[name] = { rep };
}
await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
await waitReady(page);
for (const name of ["Richard", "Jax"]) {
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await waitReady(page);
  await tapProfile(page, name);
  await sleep(1500);
  const rep2 = hasHz ? await page.evaluate(() => window.__ED16_HZ.prisReport()) : null;
  res[name].afterReload = rep2;
  await page.screenshot({ path: OUT + "/" + name.toLowerCase() + "-after-reload.png" });
  await page.evaluate(() => { const bt = [...document.querySelectorAll("button")].find((el) => (el.textContent || "").trim() === "Profiles"); if (bt) bt.click(); }).catch(() => {});
  await sleep(500);
}
fs.writeFileSync(OUT + "/save-test.json", JSON.stringify(res, null, 1));
for (const [n, r] of Object.entries(res)) {
  const a = r.rep, c = r.afterReload;
  console.log(n, "lvl", a && a.lvl, "depth", a && a.depth, "pris", a && a.pris.length, "sockFixed", JSON.stringify(a && a.sockFixed), "maxSockets", a && a.sk.maxSockets, "over4", a && a.sk.over4, "gemBag", a && a.gemBag);
  if (a) for (const x of a.pris) console.log("   ", x.where, x.stars + "*", "mul x" + x.mul, "(old x" + x.oldMul + ")", "atk", x.rawAtk, "->", x.atk, "def", x.rawDef, "->", x.def, "sockets", x.sockets, "gems", x.gems);
  const same = a && c && JSON.stringify(a.pris.map((x) => [x.name, x.atk, x.def, x.sockets])) === JSON.stringify(c.pris.map((x) => [x.name, x.atk, x.def, x.sockets]));
  console.log("   after reload identical:", same, "over4 after reload", c && c.sk.over4);
}
await b.close();
