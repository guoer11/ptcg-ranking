const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ranking-projection.js','utf8');
const ranking = JSON.parse(fs.readFileSync('data/ranking.json','utf8'));
const tournaments = JSON.parse(fs.readFileSync('data/tournaments.json','utf8'));
const prelim = JSON.parse(fs.readFileSync('data/preliminary_results.json','utf8'));
const knockout = JSON.parse(fs.readFileSync('data/knockout_results.json','utf8'));

(async () => {
  let activePrelim=prelim, activeKnockout=knockout, activeTournaments=tournaments;
  const mockEvents = (t,id) => {
    const out = [];
    for (const e of t.events.filter(e=>e.group === 'Junior')) {
      for (const result of e.results || []) {
        if (String(result.player_id).toLowerCase() === id && result.points>0)
          out.push({points:result.points, resultStatus:undefined});
      }
    }
    for (const [eventId,p] of Object.entries(activePrelim.events)) {
      const event=t.events.find(e=>String(e.event_id)===eventId && e.group==='Junior');
      if (!event || event.results?.length || p.group!=='Junior') continue;
      const player = p.standings.find(x=>x.player_id===id);
      const bracket = activeKnockout.events[eventId]?.results.find(x=>x.player_id===id);
      if (bracket) out.push({points:bracket.points,resultStatus:'knockout-estimated'});
      else if (player?.points>0) out.push({points:player.points,resultStatus:'estimated'});
    }
    return out;
  };
  const win = {
    loadPreliminaryForRanking:async()=>activePrelim,
    calculatedEventsForPlayer:mockEvents,
    calculatedTop8:events=>{
      const points=events.filter(x=>x.points!==null&&Number(x.points)>0)
        .map(x=>Number(x.points)).sort((a,b)=>b-a).slice(0,8);
      return {points,total:points.reduce((a,b)=>a+b,0)};
    }
  };
  const sandbox={window:win,loadTournamentData:async()=>activeTournaments,identityFor:()=>null,console};
  vm.runInNewContext(source,sandbox,{filename:'ranking-projection.js'});
  const math=win.PTCGProjectionMath;
  assert.equal(math.projectPlayer({points:100},[{points:100},{points:20,resultStatus:'estimated'}]).points,120);
  assert.equal(math.projectPlayer({points:100},[{points:20,resultStatus:'estimated'}]).points,120);
  const eight=Array(8).fill(0).map((_,i)=>({points:100-i*10}));
  assert.equal(math.projectPlayer({points:520},eight.concat({points:90,resultStatus:'estimated'})).points,580);
  assert.equal(math.projectPlayer({points:80},[{points:30},{points:25},{points:20},{points:15}]).points,90);
  const ordered=math.rankPlayers([{player_id:'b',points:20},{player_id:'a',points:20},{player_id:'c',points:19}]);
  assert.deepEqual(ordered.map(x=>x.rank).join(','),'1,1,3');
  const copy=JSON.stringify(ranking.groups.Junior);
  const rows=await win.buildProjectedRankingRows(ranking.groups.Junior);
  assert(rows.length>=ranking.groups.Junior.length,'all official players stay present');
  assert.equal(JSON.stringify(ranking.groups.Junior),copy,'original official rows must stay unchanged');
  const byId=new Map(rows.map(x=>[x.player_id,x]));
  // Live fixtures evolve as official players are promoted into the ranking.
  // Verify every official row and every actual positive candidate, without
  // requiring that an unranked or provisional player exist on every update.
  for(const official of ranking.groups.Junior){
    const row=byId.get(String(official.player_id).toLowerCase());
    assert(row,'official player missing: '+official.player_id);
    assert.equal(row.officialRank,official.rank);
    assert.equal(row.officialPoints,Number(official.points));
    assert(row.points>=row.officialPoints,'official score must never decrease');
  }
  const officialIds=new Set(ranking.groups.Junior.map(row=>String(row.player_id).toLowerCase()));
  const candidateIds=new Set();
  for(const event of tournaments.events.filter(e=>e.group==='Junior'&&(!e.season||e.season===tournaments.season))){
    for(const result of event.results||[])if(Number(result.points)>0)candidateIds.add(String(result.player_id).toLowerCase());
    for(const result of prelim.events[String(event.event_id)]?.standings||[])candidateIds.add(String(result.player_id).toLowerCase());
  }
  for(const id of candidateIds){
    if(!/^tw\d{6,12}$/.test(id)||officialIds.has(id))continue;
    const expected=math.projectPlayer(undefined,mockEvents(tournaments,id)).points;
    if(expected>0){
      assert.equal(byId.get(id)?.officialRank,null,'new scored player must appear');
      assert.equal(byId.get(id)?.points,expected);
    }else assert(!byId.has(id),'zero-point unranked player must not appear');
  }
  assert(rows.every(x=>Number.isFinite(x.points)&&x.points>=0));
  assert(rows.every((x,i)=>i===0||rows[i-1].points>=x.points));

  // Deterministic fixture proves the new-player behavior even when ALL current
  // real-world positive candidates have already joined the official ranking.
  activeTournaments={season:'2026-27',events:[
    {event_id:'fixture-official',group:'Junior',results:[{player_id:'tw90000001',points:20},{player_id:'tw90000002',points:12}]},
    {event_id:'fixture-prelim',group:'Junior',results:[]}
  ]};
  activePrelim={events:{'fixture-prelim':{group:'Junior',standings:[
    {player_id:'tw90000001',points:15},{player_id:'tw90000003',points:8},{player_id:'tw90000004',points:0},
    {player_id:'tw90000005',points:0}
  ]}}};
  activeKnockout={events:{'fixture-prelim':{results:[{player_id:'tw90000005',points:25}]}}};
  const fixtureOfficial=[{player_id:'tw90000001',rank:1,points:20,name:'fixture'}];
  const fixtureBefore=JSON.stringify(fixtureOfficial);
  const fixtureRows=await win.buildProjectedRankingRows(fixtureOfficial);
  const fixtureById=new Map(fixtureRows.map(row=>[row.player_id,row]));
  assert.equal(fixtureById.get('tw90000001').points,35);
  assert.equal(fixtureById.get('tw90000002').officialRank,null);
  assert.equal(fixtureById.get('tw90000002').points,12);
  assert.equal(fixtureById.get('tw90000003').officialRank,null);
  assert.equal(fixtureById.get('tw90000003').points,8);
  assert(!fixtureById.has('tw90000004'),'unranked zero-point player excluded');
  assert.equal(fixtureById.get('tw90000005').points,25);
  assert.equal(JSON.stringify(fixtureOfficial),fixtureBefore);
  console.log('PASS: official immutable, score estimates, tie rank, Best 8, new scored players');
})().catch(err=>{console.error(err);process.exitCode=1;});
