'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(p,'utf8');
let handler,deviceChecks=0,markReads=0;
const service={from(table){const filters={};let ids=[];const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){ids=v;return q;},maybeSingle(){deviceChecks++;return Promise.resolve({data:filters.endpoint==='fixture-device'&&filters.auth==='A'.repeat(22)&&filters.active===true?{owner_user_id:'owner'}:null,error:null});},then(resolve){markReads++;assert.equal(table,'player_attention_marks');assert.equal(filters.user_id,'owner');return Promise.resolve({data:[{player_id:'tw20000001',note:'留意牌組 <b>'}].filter(x=>ids.includes(x.player_id)),error:null}).then(resolve);}};return q;},rpc(name,args){assert.equal(name,'is_pairing_member');assert.equal(args.target_user,'owner');return Promise.resolve({data:true,error:null});}};
const anon={rpc(name){assert.equal(name,'family_player_attention');return Promise.resolve({data:true,error:null});}};
vm.runInNewContext(stripTypeScriptTypes(read('supabase/functions/ptcg-family-player-mark/index.ts').replace(/^import .*;\s*$/gm,''),{mode:'transform'}),{Deno:{env:{get:k=>k},serve:fn=>{handler=fn}},createClient:(_url,key)=>key==='SUPABASE_SERVICE_ROLE_KEY'?service:anon,Response,Request,console});
const call=async body=>{const r=await handler(new Request('https://example.test/',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};
function el(){
 const node={dataset:{},children:[],className:'',textContent:'',_html:'',get innerHTML(){return this._html;},set innerHTML(v){this._html=v;this.children=[];},querySelector(selector){return this.children.find(c=>c.className.split(' ').includes(selector.slice(1)))||null;},appendChild(c){this.children.push(c);c.remove=()=>{this.children=this.children.filter(n=>n!==c);};},append(c){this.appendChild(c);}};
 return node;
}
(async()=>{
 const ids=['tw10000001','tw20000001','tw10000002','tw20000002'];
 const invalid=await call({action:'family-marks',endpoint:'fixture-device',auth:'B'.repeat(22),player_ids:ids});assert.equal(invalid.status,403);assert.equal(markReads,0);
 const legacy=await call({endpoint:'fixture-device',player_id:ids[1]});assert.equal(legacy.body.attention,true);assert.equal(legacy.body.note,undefined);assert.equal(markReads,0);
 const valid=await call({action:'family-marks',endpoint:'fixture-device',auth:'A'.repeat(22),player_ids:ids});assert.equal(valid.status,200);assert.equal(valid.body.marks[ids[1]].note,'留意牌組 <b>');assert.equal(valid.body.marks[ids[3]].attention,false);assert.equal(deviceChecks,2);assert.equal(markReads,1);
 const hosts=ids.map(id=>Object.assign(el(),{dataset:{familyBadgeId:id}}));
 const root=Object.assign(el(),{hidden:false,querySelectorAll:()=>hosts,insertAdjacentElement(){}});let task;const events={};
 const doc={readyState:'loading',body:{},addEventListener(n,fn){events[n]=fn;},getElementById:id=>id==='familyMatchSummary'?root:id==='familyBadgeLegend'?{}:null,createElement:el,querySelectorAll:()=>[]};
 const win={setTimeout(fn){task=fn;return 1;}};
 vm.runInNewContext(read('player-badges.js'),{document:doc,window:win,MutationObserver:class{observe(){}},clearTimeout(){},sessionStorage:{getItem(){return null},setItem(){}},fetch:async()=>({ok:true,json:async()=>({players:{[ids[0]]:{wcs_2026:true},[ids[1]]:{ultra:{best_rank:1}},[ids[3]]:{great:{best_rank:2}}}}),text:async()=>'<img src="data:image/webp;base64,TEST">'}),console});
 await events.DOMContentLoaded();win.PTCGPlayerBadges.setFamilyMarks(valid.body.marks);task();
 const row=i=>hosts[i].querySelector('.player-badge-row');
 assert.match(row(0).innerHTML,/player-badge-wcs/);assert.match(row(1).innerHTML,/player-attention-star is-active/);assert.match(row(1).innerHTML,/player-ball-ultra/);
 assert.equal(row(1).querySelector('.family-private-attention-note').textContent,'留意牌組 <b>');
 assert.doesNotMatch(row(1).innerHTML,/留意牌組|data-player-attention-toggle/);
 assert.match(row(3).innerHTML,/player-ball-great/);
 win.PTCGPlayerBadges.setFamilyMarks({});task();assert.doesNotMatch(row(1).innerHTML,/player-attention-star/);assert.equal(row(1).querySelector('.family-private-attention-note'),null);
 const wcs=read('wcs-2027-standalone.js');assert.match(wcs,/decorateFamilyCards\(\)/);assert.match(wcs,/data-family-badge-id/);
 const bridge=read('family-attention-bridge.js');assert.match(bridge,/auth:credentials.keys.auth/);assert.match(bridge,/generation!==markGeneration/);assert.doesNotMatch(bridge,/searchParams\.set\(['"](?:note|opponent_attention)/);
 console.log('PASS: family marks verify device auth, owner isolation, notes never returned by legacy API, read-only icons and clearing private notes');
})().catch(e=>{console.error(e);process.exitCode=1;});
