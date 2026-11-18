import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:"new",userDataDir:"/tmp/ed16-profiles/wx-"+Date.now(),args:["--no-sandbox","--disable-gpu","--mute-audio"]});
const p=await b.newPage(); await p.setViewport({width:412,height:780,deviceScaleFactor:2});
p.on("pageerror",e=>console.log("ERR",e.message)); p.on("dialog",d=>{console.log("DIALOG");d.accept().catch(()=>{});}); p.on("framenavigated",f=>console.log("NAV"));
await p.goto("http://127.0.0.1:50199/?t="+Date.now()); await p.waitForFunction(()=>!!(window.__ED16_PRIS&&window.__ED16_HZ));
await p.evaluate(()=>window.__ED16_PRIS.begin({depth:60,lvl:80})); await sleep(300);
const H=(n,...a)=>p.evaluate((n,a)=>window.__ED16_HZ[n](...a),n,a);
await H("force",{haz:"none"});
for (const k of ["snow","blizzard","drift","frost","drizzle","rain","lightning","storm","wind"]) {
  await H("wx",k); const r=await H("gen",61); await H("clean"); await sleep(k==="lightning"||k==="storm"?2600:1800);
  const el=await p.$("canvas"); await el.screenshot({path:"screenshots-weather/weather-"+k+".png"}); console.log(k, JSON.stringify(r).slice(0,150));
}
await b.close();
