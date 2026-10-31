const { chromium } = require('playwright');
const D=process.argv[2].replace(/\\/g,'/')+'/';
const J=x=>JSON.stringify(x);
const BAD=/native|gonggan/i;
const scan=p=>p.evaluate((src)=>{const re=new RegExp(src,'i');const o=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=w.nextNode()){const el=n.parentElement;if(!el||!el.offsetParent)continue;if(re.test(n.textContent))o.push('TEXT:'+el.className+'|'+n.textContent.trim().slice(0,80))}
 for(const e of document.querySelectorAll('[title],[aria-label],[placeholder]')){for(const a of ['title','aria-label','placeholder']){const v=e.getAttribute(a);if(v&&re.test(v))o.push('ATTR:'+a+'|'+v.slice(0,80))}}
 return o},BAD.source);
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:1700,height:1000}}); // fresh context = no cache (hard reload)
 const p=await ctx.newPage();
 p.on('pageerror',e=>console.log('PAGEERR',e.message));
 p.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('gonggan'))console.log('REQ',r.method(),r.url())});
 await p.goto('http://127.0.0.1:8188',{waitUntil:'domcontentloaded'});
 await p.waitForTimeout(8000);
 console.log('VERSION_JS',await p.evaluate(()=>fetch('/extensions/comfyui-gonggan-cut/gg_version.js',{cache:'no-store'}).then(r=>r.text()).then(t=>(t.match(/\d+\.\d+\.\d+/)||[''])[0]).catch(e=>'ERR')));
 console.log('SIDEBAR_LABELS',J(await p.evaluate(()=>[...document.querySelectorAll('[aria-label],[title]')].map(e=>e.getAttribute('aria-label')||e.title).filter(t=>/vidot/i.test(t)))));
 await p.click('[aria-label*="Vidot"]'); await p.waitForTimeout(3000);
 await p.screenshot({path:D+'01_panel.png'});
 console.log('SCAN_PANEL',J(await scan(p)));
 console.log('SCENE_TITLES',J(await p.evaluate(()=>[...document.querySelectorAll('[class*="gg-grp"] [class*="title"], [class*="scene-band"], [class*="gg-scene"]')].filter(e=>e.offsetParent).map(e=>e.className+'|'+e.textContent.trim().slice(0,40)).slice(0,12))));
 const card=p.locator('[class*="gg-card"], [class*="gg-shot"]').filter({hasText:'2-2'}).first();
 await card.click(); await p.waitForTimeout(3000);
 await p.screenshot({path:D+'02_cut_selected.png'});
 console.log('STRIP_VS_ICONROW',J(await p.evaluate(()=>{const s=document.querySelector('.gg-vstrip, [class*="gg-vs-wrap"], [class*="gg-vstrip"]')||document.querySelector('[class*="gg-vs"]');const i=document.querySelector('.gg-ir-scene');if(!s||!i)return 'missing '+!!s+' '+!!i;const a=s.getBoundingClientRect(),c=i.getBoundingClientRect();return {strip:s.className,stripTop:Math.round(a.top),stripBottom:Math.round(a.bottom),iconTop:Math.round(c.top),above:a.bottom<=c.top+1}})));
 console.log('STRIP_BUTTONS',J(await p.evaluate(()=>[...document.querySelectorAll('[class*="gg-vs"] button, [class*="gg-vs"] .gg-btn')].filter(e=>e.offsetParent).map(e=>e.textContent.trim()))));
 console.log('PREVIEW_LABEL',J(await p.evaluate(()=>[...document.querySelectorAll('.gg-v-label')].map(e=>e.textContent))));
 console.log('SCAN_CUT',J(await scan(p)));
 await p.click('.gg-proj-settings'); await p.waitForTimeout(1500);
 await p.screenshot({path:D+'03_settings.png'});
 console.log('SETTINGS_TEXT',J(await p.evaluate(()=>{const m=document.querySelector('[class*="gg-modal"]');return m?m.innerText:''})));
 console.log('SCAN_SETTINGS',J(await scan(p)));
 await b.close();
})();
