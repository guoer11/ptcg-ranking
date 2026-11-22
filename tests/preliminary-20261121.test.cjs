'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const prelim=read('data/preliminary_results.json'),knockout=read('data/knockout_results.json');
const official=read('data/tournaments.json'),event=official.events.find(e=>String(e.event_id)==='66990');
const result=prelim.events['66990'],bracket=knockout.events['66990'];
assert(event&&event.date==='2026-11-21'&&event.group==='Junior'&&event.league==='Ultra');
assert(result&&result.tid==='5865462'&&result.participants===77);
assert.equal(result.standings.length,77);
assert(result.source_url.includes('kno=7'));
assert(result.standings.every((p,i)=>p.rank===i+1&&/^tw\d{6,12}$/.test(p.player_id)));
assert.equal(new Set(result.standings.map(p=>p.player_id)).size,77);
assert.deepEqual(result.standings.slice(0,8).map(p=>p.points),Array(8).fill(null));
assert.equal(bracket.results.length,8);
const podium={tw39371632:[1,100,'冠軍'],tw82928313:[2,75,'亞軍'],
  tw61881775:[3,50,'四強'],tw06034751:[3,50,'四強']};
for(const r of bracket.results){
 const raw=result.standings[r.preliminary_rank-1];
 assert.equal(raw.player_id,r.player_id);
 const [rank,pts,finish]=podium[r.player_id]||[5,25,'八強'];
 assert.equal(r.final_rank,rank);assert.equal(r.points,pts);assert.equal(r.finish,finish);
}
for(const [rank,points] of [[9,20],[16,20],[17,15],[32,15],[33,0],[64,0],[65,0],[77,0]])
 assert.equal(result.standings[rank-1].points,points);
(async()=>{
 const source=fs.readFileSync('preliminary-ui.js','utf8');
 const tournaments={season:official.season,events:[event]};
 const win={
   calculatedEventsForPlayer:()=>[],
   calculatedTop8:rows=>({points:rows.map(x=>x.points).filter(x=>Number(x)>0),
     total:rows.reduce((s,x)=>s+(Number(x.points)||0),0)}),
   eventsHtml:()=>'<div></div>',
   openPlayerModal:async id=>win.calculatedEventsForPlayer(tournaments,id),
   ptcgOfficialVenue:()=>({name:event.venue,address:event.address})
 };
 const document={head:{appendChild(){}},createElement:()=>({textContent:''})};
 const fetch=async p=>({ok:true,json:async()=>p.includes('knockout_results.json')?knockout:prelim});
 vm.runInNewContext(source,{window:win,document,fetch,Date,console});
 for(const r of bracket.results){
   const match=(await win.openPlayerModal(r.player_id)).find(x=>x.eventId==='66990');
   assert(match,'no projected bracket for '+r.player_id);
   assert.equal(match.rank,r.final_rank);assert.equal(match.points,r.points);
   assert.equal(match.resultStatus,'knockout-estimated');
   assert.equal(match.preliminaryRank,r.preliminary_rank);
 }
 for(const rank of [9,17]){
   const match=(await win.openPlayerModal(result.standings[rank-1].player_id)).find(x=>x.eventId==='66990');
   assert(match);assert.equal(match.points,result.standings[rank-1].points);
   assert.equal(match.resultStatus,'estimated');
 }
 assert.equal((await win.openPlayerModal(result.standings[32].player_id)).length,0,'77 entrants: 33rd place has 0 LP');
 assert.equal((await win.openPlayerModal(result.standings[64].player_id)).length,0,'0 LP should stay unlisted');
 const existing=knockout.events['66987'];
 assert(existing&&existing.results.length===8,'past event records untouched');
 console.log('PASS: 77 archived players, Top8 verified, LP bands, UI join and historical event preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
