import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50177/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "layout");
fs.mkdirSync(SHOTS, { recursive: true });

const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

const CASES = [
  {
    name: "primary-top-toolbar-412x780",
    viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    forceVV: { width: 412, height: 780, offsetTop: 56, offsetLeft: 0 },
    overlay: { top: 56, bottom: 79, label: "Chrome top toolbar + Android nav" },
    standalone: false,
  },
  {
    name: "bottom-toolbar-412x780",
    viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    forceVV: { width: 412, height: 780, offsetTop: 0, offsetLeft: 0 },
    overlay: { top: 0, bottom: 135, label: "Chrome address bar at bottom + nav" },
    standalone: false,
  },
  {
    name: "full-412x915",
    viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    forceVV: null,
    overlay: null,
    standalone: false,
  },
  {
    name: "small-360x640",
    viewport: { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    forceVV: null,
    overlay: null,
    standalone: false,
  },
  {
    name: "standalone-notch-412x915",
    viewport: { width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    forceVV: { width: 412, height: 915, offsetTop: 0, offsetLeft: 0 },
    forceSafe: { top: 44, right: 0, bottom: 34, left: 0 },
    overlay: null,
    standalone: true,
  },
];

async function launch(userDir, viewport, hook) {
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(UA);
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument((h) => {
    if (h.forceVV) {
      const vv = {
        width: h.forceVV.width,
        height: h.forceVV.height,
        offsetTop: h.forceVV.offsetTop,
        offsetLeft: h.forceVV.offsetLeft,
        scale: 1,
        addEventListener() {},
        removeEventListener() {},
      };
      Object.defineProperty(window, "visualViewport", { configurable: true, get() { return vv; } });
      window.__ED16_FORCE_VV = h.forceVV;
    }
    if (h.forceSafe) window.__ED16_FORCE_SAFE = h.forceSafe;
  }, hook);
  if (hook.standalone) {
    // Puppeteer cannot emulate display-mode here; standalone is what matters
    // for safe-area insets, which we force via __ED16_FORCE_SAFE.
    await page.evaluateOnNewDocument(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => {
        if (String(q).includes("display-mode") && String(q).includes("standalone")) {
          return { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; }, onchange: null };
        }
        return orig(q);
      };
    });
  }
  return { browser, page };
}

async function openPlay(page) {
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  await page.waitForFunction(() => (document.body.innerText || "").includes("Profiles") || (document.body.innerText || "").includes("Choose a profile"), { timeout: 20000 });
  await sleep(400);
  // Prefer Jax so we land in a real play HUD (HP/XP) without pasting a code.
  const tapped = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button.dc-prof")].find((el) => (el.textContent || "").includes("Jax"));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  if (!tapped) throw new Error("could not tap Jax");
  await page.waitForFunction(() => {
    const cv = document.querySelector("canvas.dc-cv");
    const bag = [...document.querySelectorAll("button")].some((el) => /Bag/.test(el.textContent || ""));
    const title = [...document.querySelectorAll("button")].some((el) => /✦\s*New Game/.test(el.textContent || ""));
    return !!(cv && bag && !title);
  }, { timeout: 15000 });
  await sleep(500);
  // Re-apply in case the hook was defined after the first effect (should already be on).
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(200);
  return resp ? resp.status() : 0;
}

async function paintChrome(page, overlay) {
  if (!overlay) {
    await page.evaluate(() => { const el = document.getElementById("ed16-test-chrome"); if (el) el.remove(); });
    return;
  }
  await page.evaluate((o) => {
    let host = document.getElementById("ed16-test-chrome");
    if (!host) {
      host = document.createElement("div");
      host.id = "ed16-test-chrome";
      document.body.appendChild(host);
    }
    host.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none;";
    host.innerHTML = "";
    if (o.top > 0) {
      const t = document.createElement("div");
      t.style.cssText = "position:absolute;left:0;right:0;top:0;height:" + o.top + "px;background:rgba(32,32,36,0.96);color:#eee;font:12px/16px sans-serif;display:flex;align-items:center;padding:0 10px;border-bottom:1px solid #555;";
      t.textContent = "Chrome address bar (top, " + o.top + "px)";
      host.appendChild(t);
    }
    if (o.bottom > 0) {
      const b = document.createElement("div");
      b.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:" + o.bottom + "px;background:rgba(20,20,24,0.96);color:#eee;font:12px/16px sans-serif;display:flex;align-items:center;justify-content:center;border-top:1px solid #555;";
      b.textContent = o.top > 0 ? "Android nav (" + o.bottom + "px)" : "Chrome address bar + nav (" + o.bottom + "px)";
      host.appendChild(b);
    }
  }, overlay);
}

async function inspect(page) {
  return page.evaluate(() => {
    const forced = window.__ED16_FORCE_VV;
    const vv = forced || window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const left = vv ? vv.offsetLeft : 0;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const vis = { x: left, y: top, w: vw, h: vh, r: left + vw, b: top + vh };
    const within = (r, pad = 1.5) =>
      r.top >= vis.y - pad && r.left >= vis.x - pad && r.bottom <= vis.b + pad && r.right <= vis.r + pad && r.width > 0 && r.height > 0;
    const canvas = document.querySelector("canvas.dc-cv");
    const cr = canvas ? canvas.getBoundingClientRect() : null;
    const wanted = ["Bag", "Stairs", "Back", "Save Game", "Save Code", "LOAD", "Profiles", "Potion", "PAUSE"];
    const buttons = [...document.querySelectorAll("button")].map((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      const r = el.getBoundingClientRect();
      const interesting = wanted.some((w) => text.includes(w)) || el.classList.contains("dc-k") || el.classList.contains("dc-lock") || el.classList.contains("dc-quit") || el.classList.contains("dc-wbrk") || el.classList.contains("dc-ult");
      if (!interesting || r.width < 1 || r.height < 1 || el.offsetParent === null && !el.classList.contains("dc-k")) return null;
      // skip hidden title / profile-dialog leftover
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return null;
      return { text: text.slice(0, 40) || el.getAttribute("aria-label") || el.className, r: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height }, visible: within(r) };
    }).filter(Boolean);
    const util = document.querySelector(".dc-util");
    const ur = util ? util.getBoundingClientRect() : null;
    const wrap = document.querySelector(".dc-wrap");
    const root = document.querySelector(".dc-root");
    const missing = wanted.filter((w) => !buttons.some((b) => (b.text || "").includes(w)));
    const clipped = buttons.filter((b) => !b.visible);
    return {
      vis,
      vars: {
        top: getComputedStyle(document.documentElement).getPropertyValue("--ed-vv-top").trim(),
        h: getComputedStyle(document.documentElement).getPropertyValue("--ed-vv-h").trim(),
        canvasMax: getComputedStyle(document.documentElement).getPropertyValue("--ed-canvas-max").trim(),
        safeT: getComputedStyle(document.documentElement).getPropertyValue("--ed-safe-t").trim(),
        safeB: getComputedStyle(document.documentElement).getPropertyValue("--ed-safe-b").trim(),
      },
      scroll: { x: window.scrollX, y: window.scrollY, docH: document.documentElement.scrollHeight, wrapSH: wrap ? wrap.scrollHeight : 0, wrapCH: wrap ? wrap.clientHeight : 0, rootH: root ? root.getBoundingClientRect().height : 0 },
      canvas: cr && { top: cr.top, left: cr.left, bottom: cr.bottom, right: cr.right, width: cr.width, height: cr.height, visible: within(cr) },
      canvasAboveUtil: !!(cr && ur && cr.bottom <= ur.top + 2),
      buttons,
      missing,
      clipped: clipped.map((b) => b.text + " @ " + JSON.stringify(b.r)),
    };
  });
}

async function runCase(c) {
  const dir = "/tmp/ed16-profiles/layout-" + c.name;
  let browser;
  try {
    const launched = await launch(dir, c.viewport, { forceVV: c.forceVV, forceSafe: c.forceSafe || null, standalone: c.standalone });
    browser = launched.browser;
    const page = launched.page;
    await openPlay(page);
    await paintChrome(page, c.overlay);
    const shot = path.join(SHOTS, c.name + ".png");
    await page.screenshot({ path: shot, fullPage: false });
    const info = await inspect(page);
    const noScroll = info.scroll.y === 0 && info.scroll.x === 0 && info.scroll.wrapSH <= info.scroll.wrapCH + 2;
    const need = ["Bag", "Stairs", "Back", "Save Game", "Save Code", "LOAD", "Profiles", "Potion"];
    const haveAll = need.every((w) => info.buttons.some((b) => (b.text || "").includes(w)));
    record(c.name + " canvas (HP/XP HUD) fully in visible viewport", !!(info.canvas && info.canvas.visible),
      JSON.stringify({ canvas: info.canvas, vis: info.vis, vars: info.vars }));
    record(c.name + " every required button fully visible", haveAll && info.clipped.length === 0,
      (haveAll ? "" : "missing=" + JSON.stringify(info.missing) + " ") + (info.clipped.length ? "clipped=" + info.clipped.join("; ") : "ok"));
    record(c.name + " no page or wrap scroll / overflow", noScroll, JSON.stringify(info.scroll));
    record(c.name + " message log (canvas bottom) does not cover buttons", info.canvasAboveUtil,
      JSON.stringify({ canvasBottom: info.canvas && info.canvas.bottom }));
    record(c.name + " screenshot", true, shot);
  } catch (err) {
    record(c.name + " ERROR", false, err && err.stack ? err.stack : String(err));
  } finally {
    if (browser) try { await browser.close(); } catch { /* */ }
  }
}

async function main() {
  console.log("LAYOUT tests against " + BASE);
  for (const c of CASES) await runCase(c);
  const failed = results.filter((r) => !r.pass);
  console.log("----");
  console.log("LAYOUT " + (results.length - failed.length) + " passed, " + failed.length + " failed");
  if (failed.length) {
    for (const f of failed) console.log(" - " + f.step + ": " + f.detail);
    process.exitCode = 1;
  }
}

main();
