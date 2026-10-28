const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ranking-projection.js','utf8');
const ranking = JSON.parse(fs.readFileSync('data/ranking.json','utf8'));
const tournaments = JSON.parse(fs.readFileSync('data/tournaments.json','utf8'));
const prelim = JSON.parse(fs.readFileSync('data/preliminary_results.json','utf8'));
const knockout = JSON.parse(fs.readFileSync('data/knockout_results.json','utf8'));

(async () => {
  const mockEvents = (t,id) => {
    const out = [];
    for (const e of t.events.filter(e=>e.group === 'Junior')) {
      for (const result of e.results || []) {
        if (String(result.player_id).toLowerCase() === id && result.points>0)
          out.push({points:result.points, resultStatus:undefined});
      }
    }
    const p = prelim.events['66987'];
    if (p && !t.events.find(e=>String(e.event_id)==='66987')?.results?.length) {
      const player = p.standings.find(x=>x.player_id===id);
      const bracket = knockout.events['66987']?.results.find(x=>x.player_id===id);
      if (bracket) out.push({points:bracket.points,resultStatus:'knockout-estimated'});
      else if (player?.points>0) out.push({points:player.points,resultStatus:'estimated'});
    }
    return out;
  };
  const win = {
    loadPreliminaryForRanking:async()=>prelim,
    calculatedEventsForPlayer:mockEvents,
    calculatedTop8:events=>{
      const points=events.filter(x=>x.points!==null&&Number(x.points)>0)
        .map(x=>Number(x.points)).sort((a,b)=>b-a).slice(0,8);
      return {points,total:points.reduce((a,b)=>a+b,0)};
    }
  };
  const sandbox={window:win,loadTournamentData:async()=>tournaments,identityFor:()=>null,console};
  vm.runInNewContext(source,sandbox,{filename:'ranking-projection.js'});
  const math=win.PTCGProjectionMath;
  assert.equal(math.projectPlayer({points:100},[{points:100},{points:20,resultStatus:'estimated'}]).points,120);
  assert.equal(math.projectPlayer({points:100},[{points:20,resultStatus:'estimated'}]).points,120);
  const eight=Array(8).fill(0).map((_,i)=>({points:100-i*10}));
  assert.equal(math.projectPlayer({points:520},eight.concat({points:90,resultStatus:'estimated'})).points,590);
  assert.equal(math.projectPlayer({points:80},[{points:30},{points:25},{points:20},{points:15}]).points,90);
  const ordered=math.rankPlayers([{player_id:'b',points:20},{player_id:'a',points:20},{player_id:'c',points:19}]);
  assert.deepEqual(ordered.map(x=>x.rank).join(','),'1,1,3');
  const copy=JSON.stringify(ranking.groups.Junior);
  const rows=await win.buildProjectedRankingRows(ranking.groups.Junior);
  assert(rows.length>=ranking.groups.Junior.length,'all official players stay present');
  assert.equal(JSON.stringify(ranking.groups.Junior),copy,'original official rows must stay unchanged');
  const byId=new Map(rows.map(x=>[x.player_id,x]));
  assert.equal(byId.get('tw82755386').officialRank,30);
  assert(byId.get('tw82755386').points>byId.get('tw82755386').officialPoints);
  assert(rows.every(x=>Number.isFinite(x.points)&&x.points>=0));
  assert(rows.every((x,i)=>i===0||rows[i-1].points>=x.points));
  assert(rows.some(x=>x.officialRank===null&&x.points>0),'previously unranked scored players included');
  console.log('PASS: official immutable, score estimates, tie rank, Best 8, new scored players');
})().catch(err=>{console.error(err);process.exitCode=1;});
