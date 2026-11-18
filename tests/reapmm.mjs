import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.env.ED16_URL||"http://127.0.0.1:50199/";
const RO="/workspace/ed16-web/screenshots-reaper", MO="/workspace/ed16-web/screenshots-mmboss";
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:"new",userDataDir:"/tmp/ed16-profiles/reapmm-"+Date.now(),args:["--no-sandbox","--disable-gpu","--mute-audio"]});
const p=await b.newPage(); await p.setViewport({width:412,height:780,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>{errs.push(e.message);console.log("ERR",e.message)}); p.on("dialog",d=>d.accept().catch(()=>{}));
await p.goto(BASE+"?t="+Date.now()); await p.waitForFunction(()=>!!(window.__ED16_PRIS&&window.__ED16_HZ));
await p.evaluate(()=>window.__ED16_PRIS.begin({depth:40,lvl:90})); await sleep(300);
const H=(n,...a)=>p.evaluate((n,a)=>window.__ED16_HZ[n](...a),n,a);
const shot=async(f)=>{ const el=await p.$("canvas"); await el.screenshot({path:f}); };
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log("PASS",m);} else {fail++;console.log("FAIL",m);} };
const ONLY=process.env.PART||"both";
if (ONLY!=="mm") {
  // ---- Eternal Reapers: frame sequence for the contact sheet + orientation log
  await H("wx",""); await H("force",{haz:"none"}); await H("gen",41); await H("force",{}); await H("clean"); await sleep(150);
  await H("reapLog",true);
  const r=await H("ultCast",26,10); console.log("cast",JSON.stringify(r));
  const t0=Date.now(); const TS=[0.12,0.2,0.33,0.41,0.54,0.62,0.75,0.83,1.25,1.38,1.5,1.75];
  for (const ts of TS){ const w=ts*1000-(Date.now()-t0); if(w>0) await sleep(w); await shot(`${RO}/reap-${ts.toFixed(2)}s.png`); }
  const ft=await p.evaluate(()=>new Promise(res=>{let n=0,last=performance.now(),mx=0;const f=(now)=>{mx=Math.max(mx,now-last);last=now;if(++n<20)requestAnimationFrame(f);else res(mx);};requestAnimationFrame(f);}));
  await sleep(1500);
  const log=await H("reapLog",false);
  const bySweep={}; for (const e of log){ const k=e.k; bySweep[k]=bySweep[k]||{n:0,good:0}; bySweep[k].n++; if(e.lead===e.vel) bySweep[k].good++; }
  console.log("orientation",JSON.stringify(bySweep), "maxFrame", Math.round(ft));
  for (const k of [0,1,2,3,4]) ok(bySweep[k] && bySweep[k].n>0 && bySweep[k].good===bySweep[k].n, `sweep ${k===4?"rainbow finale":k}: blade leads in every drawn frame (${bySweep[k]?.good}/${bySweep[k]?.n})`);
  // frozen frames (exact times) for the contact sheet: mid-swing of each sweep + the finale spin
  const FT=[0.06+0.32*0.45,0.27+0.32*0.45,0.48+0.32*0.45,0.69+0.32*0.45,0.98+0.2+0.46*0.15,0.98+0.2+0.46*0.4];
  await H("clean"); await H("ultCast",26,10);
  for (const [i,ft2] of FT.entries()){ await H("reapFreeze",ft2); await sleep(120); await shot(`${RO}/frozen-${i}-${ft2.toFixed(2)}s.png`); }
  await H("reapFreeze",null); await sleep(2500);
  const du=await H("reapSheet"); fs.writeFileSync(RO+"/orientation-diagram.png",Buffer.from(du.split(",")[1],"base64"));
  fs.writeFileSync(RO+"/orientation.json",JSON.stringify({bySweep,maxFrame:ft,cast:r},null,1));
}
if (ONLY!=="reap") {
  // ---- act-boss minimap skull through fog
  await H("wx",""); await H("force",{haz:"none"}); const gg=await H("gen",45); await H("force",{});
  await sleep(400);
  let m=await H("mmBoss"); console.log("mm",JSON.stringify(m));
  ok(m.act && m.boss, "act floor has a live act boss");
  ok(m.boss && !m.boss.seen, "boss tile is still unexplored fog");
  const s0=m.skulls; await sleep(300); m=await H("mmBoss"); ok(m.skulls>s0, "skull marker drawn every frame on the minimap");
  const seen0=m.seen;
  await shot(`${MO}/mm-small-fog.png`);
  // crop minimap corner at 2x for readability
  await H("mmBoss","big"); await sleep(250); await shot(`${MO}/mm-big-fog.png`);
  m=await H("mmBoss"); ok(m.seen===seen0, "marker reveals no fog (seen tiles unchanged: "+m.seen+")");
  const before={...m.boss}; await H("mmBoss","move"); await sleep(250); m=await H("mmBoss"); ok(m.boss && (m.boss.x!==before.x||m.boss.y!==before.y), "boss moved to "+(m.boss&&m.boss.x)+","+(m.boss&&m.boss.y));
  await shot(`${MO}/mm-big-moved.png`);
  await H("mmBoss","small"); await H("mmBoss","kill"); await sleep(200); const s1=(await H("mmBoss")).skulls; await sleep(300); m=await H("mmBoss");
  ok(!m.boss && m.skulls===s1, "marker disappears once the boss is dead");
  await shot(`${MO}/mm-small-dead.png`);
  // non-act floor: no skull
  await H("gen",44); await sleep(200); const s2=(await H("mmBoss")).skulls; await sleep(300); ok((await H("mmBoss")).skulls===s2, "no skull on a normal floor");
}
console.log(`${pass}/${pass+fail} passed, errors: ${errs.length}`);
await b.close();
