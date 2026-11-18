import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:"new",userDataDir:"/tmp/ed16-profiles/sz-"+Date.now(),args:["--no-sandbox","--disable-gpu","--mute-audio"],protocolTimeout:600000});
const p=await b.newPage(); p.on("pageerror",e=>console.log("ERR",e.message)); p.on("dialog",d=>d.accept().catch(()=>{}));
await p.goto("http://127.0.0.1:50199/?t="+Date.now()); await p.waitForFunction(()=>!!(window.__ED16_PRIS&&window.__ED16_HZ));
await p.evaluate(()=>window.__ED16_PRIS.begin({depth:60,lvl:80})); await sleep(300);
for (const d of [101, 201]) { const r=await p.evaluate((d)=>window.__ED16_HZ.sizeSim(200,d),d); console.log(JSON.stringify(r)); }
for (const d of [10,25,26,50,75,100,150,175,200]) console.log(d, JSON.stringify(await p.evaluate((d)=>window.__ED16_HZ.sizeSim(1,d).probs,d)));
await b.close();
