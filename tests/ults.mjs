import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.env.ED16_URL||"http://127.0.0.1:50199/";
const OUT="/workspace/ed16-web/screenshots-ults";
const ONLY=(process.env.ONLY||"").split(",").filter(Boolean).map(Number);
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:"new",userDataDir:"/tmp/ed16-profiles/ults-"+Date.now(),args:["--no-sandbox","--disable-gpu","--mute-audio"]});
const p=await b.newPage(); await p.setViewport({width:412,height:780,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>{errs.push(e.message);console.log("ERR",e.message)}); p.on("dialog",d=>d.accept().catch(()=>{}));
await p.goto(BASE+"?t="+Date.now()); await p.waitForFunction(()=>!!(window.__ED16_PRIS&&window.__ED16_HZ));
await p.evaluate(()=>window.__ED16_PRIS.begin({depth:40,lvl:90})); await sleep(300);
const H=(n,...a)=>p.evaluate((n,a)=>window.__ED16_HZ[n](...a),n,a);
await H("wx",""); await H("force",{haz:"none"}); await H("gen",41); await H("force",{});
const PEAK=[0.8,0.85,0.7,1.0,1.0,0.75,0.45,0.95,0.55,1.3];
const SEQ=[0.25,0.6,1.0,1.5];
const names=await H("ultNames");
const shot=async(f)=>{ const el=await p.$("canvas"); await el.screenshot({path:f}); };
const fpsLog=[];
const ids = ONLY.length?ONLY:[...Array(50).keys()];
for (const id of ids) {
  await H("clean"); await H("gen",41+(id%3)); await H("clean");
  await sleep(150);
  const pat=id%10, seq = id<10 || id===26; // first row (ids 0-9) also gets a frame sequence
  const r=await H("ultCast",id,8);
  const t0=Date.now();
  if (seq) { for (const ts of (id===26?[0.3,0.7,1.1,1.6,1.9,2.3]:SEQ)) { const w=ts*1000-(Date.now()-t0); if (w>0) await sleep(w); await shot(`${OUT}/seq-p${pat}-${String(id).padStart(2,"0")}-${ts.toFixed(2)}s.png`); } }
  else { const w=PEAK[pat]*1000-(Date.now()-t0); if (w>0) await sleep(w); await shot(`${OUT}/ult-${String(id).padStart(2,"0")}-${r.name.replace(/[^A-Za-z]+/g,"-")}.png`); }
  // frame-time probe during the show
  const ft=await p.evaluate(()=>new Promise(res=>{let n=0,last=performance.now(),mx=0;const f=(now)=>{mx=Math.max(mx,now-last);last=now;if(++n<20)requestAnimationFrame(f);else res(mx);};requestAnimationFrame(f);}));
  fpsLog.push([id,r.name,Math.round(ft)]);
  console.log(id, r.name, "pat", pat, r.el, "targets", r.targets, "maxFrame", Math.round(ft)+"ms");
  await sleep(Math.max(0,2700-(Date.now()-t0)));
}
fs.writeFileSync(OUT+(process.env.OUTJSON||"/ults.json"),JSON.stringify({names,frames:fpsLog,errs},null,1));
console.log("errors:",errs.length);
await b.close();
