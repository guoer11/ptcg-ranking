// Optional DOM interaction test: install jsdom 26.1.0 and provide it via NODE_PATH.
const {JSDOM}=require('jsdom');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const html=fs.readFileSync(path.join(root,'pairing.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/pairing.html'});const w=dom.window,$=id=>w.document.getElementById(id),requests=[];
 w.fetch=async url=>{requests.push(url);assert(/^data\/pairing-odds-3000442(?:-final)?\.json\?/.test(url),'no production APIs');return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.split('?')[0]),'utf8'))};};
 w.pairingAuthorized=true;
 for(const file of ['pairing-odds-engine.js','pairing-odds.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 await new Promise(r=>w.setTimeout(r,0));
 const wait=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>w.setTimeout(r,10));}throw new Error('UI condition timed out');};
 const run=async()=>{$('oddsRun').click();await wait(()=>!$('oddsRun').disabled);};
 const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event(id==='oddsType'?'change':'input',{bubbles:true}));};
 await run();assert.equal(w.document.querySelectorAll('.odds-cards article').length,3);assert($('oddsResult').textContent.includes('12%–46%'));assert.equal(requests.length,1,'no future final fetch during prediction');
 $('oddsReadActual').click();await wait(()=>$('oddsActualResult').textContent.includes('第 15 名'));assert.equal(requests.length,2);
 change('oddsRound','7');assert($('oddsActual').hidden);assert.equal(w.document.querySelectorAll('.odds-cards article').length,0);await run();assert($('oddsResult').textContent.includes('剩 1 輪'));
 change('oddsTotal','8');await run();assert($('oddsActual').hidden,'counterfactual rounds have no actual comparison');
 change('oddsType','master');await run();assert($('oddsResult').textContent.includes('請填寫'));
 change('oddsCut','16');await run();assert.equal(w.document.querySelectorAll('.odds-cards article').length,1);
 change('oddsType','premier');await run();assert(w.document.querySelector('.odds-warning'));
 change('oddsPlayer','tw00000000');await run();assert($('oddsResult').textContent.includes('找不到'));
 change('oddsPlayer','<img src=x>');await run();assert.equal(w.document.querySelectorAll('#oddsResult img').length,0);
 w.document.dispatchEvent(new w.CustomEvent('pairing:auth-ready',{detail:{allowed:false}}));assert($('oddsRun').disabled);assert($('oddsActual').hidden);
 dom.window.close();console.log('DOM tests passed: rendering, validation, stale results, separate final fetch, presets, auth gate.');
})().catch(e=>{console.error(e);process.exit(1)});
