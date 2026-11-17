import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ED16_URL || "http://127.0.0.1:50178/";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const SHOTS = path.join(__dirname, "screenshots", "slide");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(step, pass, detail = "") {
  results.push({ step, pass: !!pass, detail: String(detail || "") });
  console.log((pass ? "PASS" : "FAIL") + "  " + step + (detail ? "  —  " + detail : ""));
  return !!pass;
}

async function launch() {
  const userDir = "/tmp/ed16-profiles/slide-" + Date.now();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: userDir,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  const url = BASE + (BASE.includes("?") ? "&" : "?") + "t=" + Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  let hook = null;
  for (let i = 0; i < 40; i++) {
    hook = await page.evaluate(() => ({
      move: typeof (window.__ED16_MOVE && window.__ED16_MOVE.begin),
      keys: Object.keys(window).filter((k) => k.startsWith("__ED16")),
    }));
    if (hook.move === "function") break;
    await sleep(250);
  }
  if (hook.move !== "function") throw new Error("move hook missing: " + JSON.stringify(hook));
  return { browser, page };
}

async function api(page, name, ...args) {
  return page.evaluate((n, a) => {
    const hook = window.__ED16_MOVE;
    if (!hook || typeof hook[n] !== "function") return { ok: false, error: "no hook " + n };
    return hook[n](...a);
  }, name, args);
}

async function caseAct(page, walls, dx, dy, expectDx, expectDy, bias) {
  const reset = await api(page, "reset");
  if (!reset || !reset.ok) return { ok: false, error: "reset failed", reset };
  for (const w of walls) {
    const r = await api(page, "wall", w[0], w[1], true);
    if (!r || !r.ok) return { ok: false, error: "wall failed", r };
  }
  const out = bias
    ? await api(page, "act", dx, dy, bias[0], bias[1])
    : await api(page, "act", dx, dy);
  const pass = !!(out && out.ok && out.dx === expectDx && out.dy === expectDy);
  return { ...out, pass, expectDx, expectDy };
}

async function screenshotSlide(page) {
  const shotPath = path.join(SHOTS, "down-left-wall-left.png");
  await api(page, "reset");
  await api(page, "wall", -1, 0, true);
  const before = await api(page, "map");
  const moved = await api(page, "act", -1, 1);
  const after = await api(page, "map");
  await page.setViewport({ width: 520, height: 560, deviceScaleFactor: 2 });
  await page.evaluate((payload) => {
    document.querySelectorAll("#ed16-slide-shot").forEach((el) => el.remove());
    const wrap = document.createElement("div");
    wrap.id = "ed16-slide-shot";
    wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:#120c14;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f0e8d8;font:16px/1.3 sans-serif;";
    const title = document.createElement("div");
    title.textContent = "Wall-slide: down-left + wall left → move down";
    title.style.cssText = "margin-bottom:12px;font-weight:700;";
    const cv = document.createElement("canvas");
    cv.width = 448; cv.height = 448;
    cv.style.cssText = "width:448px;height:448px;image-rendering:pixelated;background:#1a1218;border:2px solid #6a4a2a;";
    wrap.appendChild(title); wrap.appendChild(cv);
    document.body.appendChild(wrap);
    const ctx = cv.getContext("2d");
    const cells = payload.after.cells;
    const ts = 64;
    const ox = payload.after.x0, oy = payload.after.y0;
    for (let j = 0; j < cells.length; j++) for (let i = 0; i < cells[j].length; i++) {
      const t = cells[j][i];
      ctx.fillStyle = t === 0 ? "#2a1a22" : "#4a3a28";
      ctx.fillRect(i * ts, j * ts, ts, ts);
      ctx.strokeStyle = "#00000055";
      ctx.strokeRect(i * ts, j * ts, ts, ts);
      if (t === 0) {
        ctx.fillStyle = "#6a3040";
        ctx.fillRect(i * ts + 8, j * ts + 8, ts - 16, ts - 16);
      }
    }
    const sx = (payload.before.x - ox) * ts + ts / 2;
    const sy = (payload.before.y - oy) * ts + ts / 2;
    const ex = (payload.after.x - ox) * ts + ts / 2;
    const ey = (payload.after.y - oy) * ts + ts / 2;
    ctx.strokeStyle = "#80ffd0";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = "#80c8ff";
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffe060";
    ctx.beginPath(); ctx.arc(ex, ey, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#120c14";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("start", sx + 16, sy - 10);
    ctx.fillText("slide", ex + 16, ey + 6);
  }, { before, after, moved });
  await sleep(50);
  await page.screenshot({ path: shotPath, type: "png" });
  return { path: shotPath, moved };
}

async function main() {
  const { browser, page } = await launch();
  try {
    const begin = await api(page, "begin");
    record("hook-begin scratch room", !!(begin && begin.ok), JSON.stringify(begin));
    if (!begin || !begin.ok) throw new Error("begin failed");

    // Diagonal slides along a vertical wall (wall to the left / right).
    const alongVert = [
      { name: "down-left + wall left -> down", walls: [[-1, 0]], dx: -1, dy: 1, ex: 0, ey: 1 },
      { name: "up-left + wall left -> up", walls: [[-1, 0]], dx: -1, dy: -1, ex: 0, ey: -1 },
      { name: "down-right + wall right -> down", walls: [[1, 0]], dx: 1, dy: 1, ex: 0, ey: 1 },
      { name: "up-right + wall right -> up", walls: [[1, 0]], dx: 1, dy: -1, ex: 0, ey: -1 },
    ];
    for (const c of alongVert) {
      const r = await caseAct(page, c.walls, c.dx, c.dy, c.ex, c.ey);
      record(c.name, r.pass, `moved ${r.dx},${r.dy} expect ${c.ex},${c.ey}`);
    }

    // Diagonal slides along a horizontal wall (wall above / below).
    const alongHoriz = [
      { name: "up-left + wall above -> left", walls: [[0, -1]], dx: -1, dy: -1, ex: -1, ey: 0 },
      { name: "up-right + wall above -> right", walls: [[0, -1]], dx: 1, dy: -1, ex: 1, ey: 0 },
      { name: "down-left + wall below -> left", walls: [[0, 1]], dx: -1, dy: 1, ex: -1, ey: 0 },
      { name: "down-right + wall below -> right", walls: [[0, 1]], dx: 1, dy: 1, ex: 1, ey: 0 },
    ];
    for (const c of alongHoriz) {
      const r = await caseAct(page, c.walls, c.dx, c.dy, c.ex, c.ey);
      record(c.name, r.pass, `moved ${r.dx},${r.dy} expect ${c.ex},${c.ey}`);
    }

    // Straight into a wall still stops (4 cardinals).
    const straight = [
      { name: "straight left into wall stops", walls: [[-1, 0]], dx: -1, dy: 0, ex: 0, ey: 0 },
      { name: "straight right into wall stops", walls: [[1, 0]], dx: 1, dy: 0, ex: 0, ey: 0 },
      { name: "straight up into wall stops", walls: [[0, -1]], dx: 0, dy: -1, ex: 0, ey: 0 },
      { name: "straight down into wall stops", walls: [[0, 1]], dx: 0, dy: 1, ex: 0, ey: 0 },
    ];
    for (const c of straight) {
      const r = await caseAct(page, c.walls, c.dx, c.dy, c.ex, c.ey);
      record(c.name, r.pass, `moved ${r.dx},${r.dy} bump=${r.bump}`);
    }

    // Open floor: diagonal and straight still walk normally (no false slides).
    let r = await caseAct(page, [], 1, 1, 1, 1);
    record("open diagonal down-right walks", r.pass, `moved ${r.dx},${r.dy}`);
    r = await caseAct(page, [], 0, -1, 0, -1);
    record("open straight up walks", r.pass, `moved ${r.dx},${r.dy}`);

    // Inner corner: both adjacent sides + dest are walls — stay put (no clip).
    r = await caseAct(page, [[-1, 0], [0, -1], [-1, -1]], -1, -1, 0, 0);
    record("inner corner up-left fully blocked stops", r.pass, `moved ${r.dx},${r.dy} bump=${r.bump}`);
    r = await caseAct(page, [[1, 0], [0, 1], [1, 1]], 1, 1, 0, 0);
    record("inner corner down-right fully blocked stops", r.pass, `moved ${r.dx},${r.dy} bump=${r.bump}`);

    // Outer / dest-only corner (pillar): both components free, dest blocked.
    r = await caseAct(page, [[-1, 1]], -1, 1, -1, 0); // tie prefers horizontal
    record("outer corner dest blocked, no bias -> horizontal", r.pass, `moved ${r.dx},${r.dy}`);
    r = await caseAct(page, [[-1, 1]], -1, 1, -1, 0, [-2, 0.4]);
    record("outer corner dest blocked, stronger X bias -> left", r.pass, `moved ${r.dx},${r.dy}`);
    r = await caseAct(page, [[-1, 1]], -1, 1, 0, 1, [-0.4, 2]);
    record("outer corner dest blocked, stronger Y bias -> down", r.pass, `moved ${r.dx},${r.dy}`);

    // Must not clip through a corner: dest is open but both cardinals are walls.
    r = await caseAct(page, [[-1, 0], [0, 1]], -1, 1, 0, 0);
    record("diagonal gap does not clip through corner", r.pass, `moved ${r.dx},${r.dy} resolved=${JSON.stringify(r.resolved)}`);

    // Dest open but one side is a wall: slide on the free axis (no corner-cut).
    r = await caseAct(page, [[-1, 0], [-1, 1]], -1, 1, 0, 1);
    record("dest open but left wall: no corner-cut, slide down", r.pass, `moved ${r.dx},${r.dy}`);

    // Fully blocked diagonal stops.
    r = await caseAct(page, [[-1, 0], [0, 1], [-1, 1]], -1, 1, 0, 0);
    record("diagonal fully blocked stops", r.pass, `moved ${r.dx},${r.dy} bump=${r.bump}`);

    // Sliding into a monster still attacks (does not walk onto it).
    {
      await api(page, "reset");
      await api(page, "wall", -1, 0, true);
      const en = await api(page, "enemy", 0, 1);
      const beforeHp = en && en.hp;
      const a = await api(page, "act", -1, 1);
      const stayed = a && a.dx === 0 && a.dy === 0;
      const hit = a && a.enemyHp !== null && a.enemyHp < beforeHp;
      record("down-left + wall left + monster below -> attack", !!(stayed && hit), `moved ${a && a.dx},${a && a.dy} hp ${beforeHp}->${a && a.enemyHp}`);
    }

    // Joystick input: analog offset quantizes to a diagonal and slides with axis bias.
    {
      await api(page, "reset");
      await api(page, "wall", -1, 0, true);
      // down-left, slightly more vertical -> should slide down
      const s = await api(page, "stick", -40, 80);
      const quantOk = s && s.quantized && s.quantized.dx === -1 && s.quantized.dy === 1;
      record("joystick down-left + wall left quantizes diagonal", !!(s && s.ok && quantOk), JSON.stringify(s && { quantized: s.quantized, dx: s.dx, dy: s.dy, kx: s.kx, ky: s.ky }));
      record("joystick down-left + wall left slides down", !!(s && s.ok && s.dx === 0 && s.dy === 1), `moved ${s && s.dx},${s && s.dy}`);
    }
    {
      await api(page, "reset");
      await api(page, "wall", 0, -1, true);
      // up-right, more horizontal -> slide right
      const s = await api(page, "stick", 80, -40);
      const quantOk = s && s.quantized && s.quantized.dx === 1 && s.quantized.dy === -1;
      record("joystick up-right + wall above quantizes diagonal", !!(s && s.ok && quantOk), JSON.stringify(s && { quantized: s.quantized, dx: s.dx, dy: s.dy }));
      record("joystick up-right + wall above slides right", !!(s && s.ok && s.dx === 1 && s.dy === 0), `moved ${s && s.dx},${s && s.dy}`);
    }
    {
      await api(page, "reset");
      await api(page, "wall", 1, 0, true);
      const s = await api(page, "stick", 80, 0);
      record("joystick straight right into wall stops", !!(s && s.ok && s.quantized && s.quantized.dx === 1 && s.quantized.dy === 0 && s.dx === 0 && s.dy === 0), `moved ${s && s.dx},${s && s.dy} quant=${JSON.stringify(s && s.quantized)}`);
    }
    {
      await api(page, "reset");
      await api(page, "wall", -1, 1, true);
      // dest-only pillar at down-left; analog down-left with stronger X slides left
      const s = await api(page, "stick", -80, 50);
      const quantOk = s && s.quantized && s.quantized.dx === -1 && s.quantized.dy === 1;
      record("joystick outer corner quantizes down-left", !!(s && s.ok && quantOk), `quant=${JSON.stringify(s && s.quantized)} kx,ky=${s && s.kx},${s && s.ky}`);
      record("joystick outer corner prefers stronger X axis (left)", !!(s && s.ok && quantOk && s.dx === -1 && s.dy === 0), `moved ${s && s.dx},${s && s.dy}`);
    }

    // Continuous hold: only stall on a straight wall or a true both-blocked
    // corner. A held diagonal along a long wall must keep sliding every step.
    async function paint(walls) {
      for (const w of walls) {
        const wr = await api(page, "wall", w[0], w[1], true);
        if (!wr || !wr.ok) return wr;
      }
      return { ok: true };
    }
    function line(axis, sign, span = 8) {
      const walls = [];
      for (let i = -span; i <= span; i++) walls.push(axis === "y" ? [i, sign] : [sign, i]);
      return walls;
    }
    function holdOk(h, ex, ey, steps = 5) {
      if (!h || !h.ok || h.dx !== ex || h.dy !== ey) return false;
      const path = h.path || [];
      if (path.length !== steps) return false;
      const sx = steps ? ex / steps : 0, sy = steps ? ey / steps : 0;
      return path.every((st) => st.dx === sx && st.dy === sy);
    }
    {
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const h = await api(page, "hold", -1, -1, 5);
      record("hold up-left + wall above slides left 5 steps", holdOk(h, -5, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const h = await api(page, "hold", 1, -1, 5);
      record("hold up-right + wall above slides right 5 steps", holdOk(h, 5, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("x", -1));
      const h = await api(page, "hold", -1, -1, 5);
      record("hold up-left + wall left slides up 5 steps", holdOk(h, 0, -5), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint([[0, -1], [1, 0], [1, -1]]);
      const h = await api(page, "hold", 1, -1, 5);
      record("hold up-right into true corner (above+right) stays put 5 steps", holdOk(h, 0, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const h = await api(page, "hold", 0, -1, 5);
      record("hold straight up into wall stays put 5 steps", holdOk(h, 0, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const h = await api(page, "stickHold", -70, -70, 5);
      record("joystick hold up-left + wall above slides left 5 steps", holdOk(h, -5, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const h = await api(page, "stickHold", 70, -70, 5);
      record("joystick hold up-right + wall above slides right 5 steps", holdOk(h, 5, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("x", -1));
      const h = await api(page, "stickHold", -70, -70, 5);
      record("joystick hold up-left + wall left slides up 5 steps", holdOk(h, 0, -5), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint([[0, -1], [1, 0], [1, -1]]);
      const h = await api(page, "stickHold", 70, -70, 5);
      record("joystick hold up-right into true corner stays put 5 steps", holdOk(h, 0, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const h = await api(page, "stickHold", 0, -80, 5);
      record("joystick hold straight up into wall stays put 5 steps", holdOk(h, 0, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }
    {
      // Start diagonal, then drift into the "up" octant. Sticky hold must keep sliding left.
      await api(page, "reset", 8);
      await paint(line("y", -1));
      const drift = [[-60, -60], [-50, -62], [-40, -65], [-30, -68], [-20, -70]];
      const h = await api(page, "stickHold", -60, -60, 5, 100, drift);
      record("joystick hold up-left keeps sliding left under drift toward up", holdOk(h, -5, 0), `moved ${h && h.dx},${h && h.dy} path=${JSON.stringify(h && h.path)}`);
    }

    const shot = await screenshotSlide(page);
    const shotOk = !!(shot && shot.moved && shot.moved.dx === 0 && shot.moved.dy === 1 && fs.existsSync(shot.path) && fs.statSync(shot.path).size > 1000);
    record("slide screenshot", shotOk, shot.path + ` moved ${shot.moved && shot.moved.dx},${shot.moved && shot.moved.dy}`);

    await api(page, "end");
  } catch (err) {
    try { await api(page, "end"); } catch { /* ignore */ }
    record("suite-error", false, String(err && err.stack || err));
  } finally {
    await browser.close();
  }
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass).length;
  console.log("\nSLIDE  " + pass + " passed, " + fail + " failed, " + results.length + " total");
  process.exit(fail ? 1 : 0);
}

main();
