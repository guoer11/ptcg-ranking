/* Match-point projections. Official final standings always take precedence. */
(function(root){
  'use strict';
  function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
  function futurePairs(players,rng){
    const pool=players.map((p,i)=>({p,i,lottery:rng()})).filter(x=>x.p.active).sort((a,b)=>b.p.score-a.p.score||a.lottery-b.lottery);
    const used=new Set(),pairs=[];
    if(pool.length%2){let k=pool.length-1;while(k>0 && pool[k].p.byes)k--;pairs.push([pool[k].i,null]);used.add(k);}
    for(let i=0;i<pool.length;i++){
      if(used.has(i))continue;
      let first=-1,chosen=-1;
      for(let j=i+1;j<pool.length;j++){
        if(used.has(j))continue;if(first<0)first=j;
        if(!pool[i].p.opponents.includes(pool[j].i)){chosen=j;break;}
      }
      if(chosen<0)chosen=first;
      if(chosen<0)throw new Error('模擬配對無法完成。');
      used.add(i);used.add(chosen);pairs.push([pool[i].i,pool[chosen].i]);
    }
    return pairs;
  }
  function simulate(snapshot,options={}){
    const total=options.totalRounds,completed=snapshot.completed;
    if(!Number.isInteger(total)||total<=completed||total>20)throw new Error('總輪數必須大於已完成輪數，且最多 20 輪。');
    const target=snapshot.players.findIndex(p=>p.id===options.playerId);
    if(target<0)throw new Error('本輪配對找不到追蹤玩家，請確認 PTCG ID；可能已退賽或尚未列入。');
    if(!snapshot.players[target].active)throw new Error('追蹤玩家未列入本輪配對。');
    const trials=options.trials??3000,chance=options.chance??.5;
    if(!Number.isInteger(trials)||trials<1||trials>20000)throw new Error('模擬次數不正確。');
    if(!Number.isFinite(chance)||chance<0||chance>1)throw new Error('勝率假設不正確。');
    const cuts=[...new Set(options.cuts||[8,16,32])].sort((a,b)=>a-b);
    if(!cuts.length||cuts.some(c=>!Number.isInteger(c)||c<1||c>4096))throw new Error('名次門檻不正確。');
    const pending=snapshot.pending||snapshot.pairs.filter(p=>p[1]===null).map(p=>({index:p[0],id:snapshot.players[p[0]].id,kind:'unknown'}));
    const decisions=options.pendingDecisions||{};
    for(const p of pending){if(p.kind!=='bye' && !['bye','absent'].includes(decisions[p.id]))throw new Error('本輪有空白對手，請先確認每位玩家是輪空或缺席／退賽。');}
    if(pending.some(p=>p.index===target && p.kind!=='bye' && decisions[p.id]==='absent'))throw new Error('追蹤玩家被設為缺席／退賽，因此不計算晉級機率。');
    const baseline=snapshot.players.map(p=>({...p,opponents:[...(p.opponents||[])],byes:p.byes||0}));
    for(const p of pending)if(p.kind!=='bye' && decisions[p.id]==='absent')baseline[p.index].active=false;
    const rng=random(options.seed??3000442),low=cuts.map(()=>0),high=cuts.map(()=>0),probabilities=cuts.map(()=>0),scenarios={},field={};
    for(let t=0;t<trials;t++){
      const players=baseline.map(p=>({...p,opponents:[...p.opponents]}));
      for(let round=completed+1;round<=total;round++){
        const pairs=round===completed+1?snapshot.pairs:futurePairs(players,rng);
        for(const [a,b] of pairs){
          const p=players[a];if(!p.active)continue;
          if(b===null){p.score+=3;p.byes++;continue;}
          const q=players[b];if(!q.active)throw new Error('對戰玩家的留賽狀態不一致。');
          p.opponents.push(b);q.opponents.push(a);
          const winChance=a===target?chance:b===target?1-chance:.5;
          players[rng()<winChance?a:b].score+=3;
        }
      }
      const counts=new Map();for(const p of players)if(p.active)counts.set(p.score,(counts.get(p.score)||0)+1);
      let better=0;
      const score=players[target].score,scenario=scenarios[score]||=( {score,count:0,low:cuts.map(()=>0),high:cuts.map(()=>0),probabilities:cuts.map(()=>0)} );scenario.count++;
      for(const [points,count] of [...counts.entries()].sort((a,b)=>b[0]-a[0])){
        const group=field[points]||=( {score:points,players:0,slots:cuts.map(()=>0)} );group.players+=count;
        cuts.forEach((cut,i)=>{
          const slots=Math.min(count,Math.max(0,cut-better));group.slots[i]+=slots;
          if(points===score){const rate=slots/count;probabilities[i]+=rate;scenario.probabilities[i]+=rate;
            if(better+count<=cut){low[i]++;scenario.low[i]++;}if(better<cut){high[i]++;scenario.high[i]++;}}
        });
        better+=count;
      }
    }
    return {trials,cuts,listed:snapshot.listed,modeledPlayers:baseline.filter(p=>p.active).length,probabilities:probabilities.map(x=>x/trials),scoreBounds:cuts.map((_,i)=>[low[i]/trials,high[i]/trials]),scenarios:Object.values(scenarios).sort((a,b)=>b.score-a.score),field:Object.values(field).sort((a,b)=>b.score-a.score).map(p=>({score:p.score,meanPlayers:p.players/trials,probabilities:p.slots.map(x=>x/p.players)}))};
  }
  const api={simulate};if(typeof module!=='undefined' && module.exports)module.exports=api;else root.PairingOddsEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
