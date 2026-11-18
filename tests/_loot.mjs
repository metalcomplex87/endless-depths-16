import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:"new",userDataDir:"/tmp/ed16-profiles/loot-"+Date.now(),args:["--no-sandbox","--disable-gpu","--mute-audio"]});
const p=await b.newPage(); p.setDefaultTimeout(600000); await p.setViewport({width:412,height:780});
p.on("pageerror",e=>console.log("ERR",e.message));
await p.goto("http://127.0.0.1:50199/?t="+Date.now()); await p.waitForFunction(()=>!!(window.__ED16_PRIS&&window.__ED16_HZ));
await p.evaluate(()=>window.__ED16_PRIS.begin({depth:30,lvl:60})); await sleep(300);
await p.evaluate(()=>window.__ED16_HZ.wx(null));
for (const d of [26,51,101,201,501,1001]) { const t=Date.now(); console.log(JSON.stringify(await p.evaluate((d)=>window.__ED16_HZ.lootSim(1500,d),d)), (Date.now()-t)+"ms"); }
await b.close();
