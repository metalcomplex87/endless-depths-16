import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.env.ED16_URL||"http://127.0.0.1:50199/";
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:"new",userDataDir:"/tmp/ed16-profiles/u7-"+Date.now(),args:["--no-sandbox","--disable-gpu","--mute-audio"]});
for (const [w,h] of [[412,780],[360,740],[430,932]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h,deviceScaleFactor:2}); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.goto(BASE+"?t="+Date.now()); await p.waitForFunction(()=>!!(window.__ED16_PRIS));
  const r=await p.evaluate(()=>{ const P=window.__ED16_PRIS; P.begin({depth:40,lvl:90});
    for (const a of ["head","chest","arms","legs"]) P.give("armor",{armor:a,stars:3});
    P.give("wep",{slot:"rh",wep:"sword",stars:3}); P.give("wep",{slot:"lh",wep:"sword",stars:3}); return P.give("pet",{stars:3}); });
  await sleep(600);
  const btns=await p.evaluate(()=>[...document.querySelectorAll(".dc-ult")].map(e=>{const r=e.getBoundingClientRect(); return [e.getAttribute("data-ult-slot"),Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];}));
  const para=await p.evaluate(()=>{const e=document.querySelector(".dc-para"); if(!e) return null; const r=e.getBoundingClientRect(); return [Math.round(r.y),Math.round(r.height)];});
  const vis=btns.every(x=>x[1]>=0&&x[1]+x[3]<=w&&x[2]>=0&&x[2]+x[4]<=h);
  console.log(w+"x"+h, "pet", JSON.stringify(r).slice(0,120), "buttons", btns.length, JSON.stringify(btns), "para", JSON.stringify(para), "allOnScreen", vis, "errs", errs.length);
  await p.screenshot({path:`/workspace/ed16-web/screenshots-combine/ult7-${w}x${h}.png`});
  await p.close();
}
await b.close();
