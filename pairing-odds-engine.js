/* Historical beta: input contains only the selected round's known information. */
(function (root) {
  'use strict';
  function random(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function play(players, a, b, rng, target, chance, stats) {
    const p = players[a]; p.games++;
    if (b === null) { p.score += 3; p.byes++; return; }
    const q = players[b]; q.games++; p.opponents.push(b); q.opponents.push(a);
    const probability = a === target ? chance : b === target ? 1 - chance : .5;
    const winner = rng() < probability ? a : b; const loser = winner === a ? b : a;
    players[winner].score += 3; players[winner].wins.push(loser);
    if (winner === target) stats.wins++;
  }
  function futurePairs(players, rng) {
    const pool = players.map((p, i) => ({p, i, lottery:rng()})).filter(x => x.p.active).sort((a,b) => b.p.score-a.p.score || a.lottery-b.lottery);
    const pairs = [];
    if (pool.length % 2) {
      let k = pool.length - 1; while (k > 0 && pool[k].p.byes) k--;
      pairs.push([pool.splice(k, 1)[0].i, null]);
    }
    while (pool.length) {
      const a = pool.shift();
      let k = pool.findIndex(b => !a.p.opponents.includes(b.i));
      if (k < 0) k = 0;
      pairs.push([a.i, pool.splice(k,1)[0].i]);
    }
    return pairs;
  }
  function simulate(snapshot, options = {}) {
    const total = options.totalRounds, completed = snapshot.completed;
    if (!Number.isInteger(total) || total <= completed || total > 20) throw new Error('總輪數必須大於已完成輪數，且最多 20 輪。');
    if (snapshot.pairs.some(pair => pair[1] === null)) throw new Error('本輪有空白對手，尚未確認輪空或缺席，暫不估算。請選擇其他輪次。');
    const target = snapshot.players.findIndex(p => p.id === options.playerId);
    if (target < 0) throw new Error('測試場找不到這個玩家 ID。');
    if (!snapshot.players[target].active) throw new Error('這位玩家在選定輪次未列入配對，暫不估算。');
    const trials = options.trials ?? 3000;
    if (!Number.isInteger(trials) || trials < 1 || trials > 20000) throw new Error('模擬次數不正確。');
    const chance = options.chance ?? .5;
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) throw new Error('勝率假設不正確。');
    const cuts = [...new Set(options.cuts || [8,16,32])].sort((a,b)=>a-b);
    if (!cuts.length || cuts.some(c=>!Number.isInteger(c)||c<1||c>4096)) throw new Error('名次門檻不正確。');
    const rng = random(options.seed ?? 3000442); const low = cuts.map(()=>0), high = cuts.map(()=>0), scenarios = {};
    const bestRanks = [], worstRanks = [];
    for (let t=0;t<trials;t++) {
      const players = snapshot.players.map(p => ({...p, opponents:[...p.opponents],wins:[...p.wins]}));
      const stats = {wins:0};
      for (let round=completed+1;round<=total;round++) {
        const pairs = round === completed+1 ? snapshot.pairs : futurePairs(players,rng);
        for (const [a,b] of pairs) play(players,a,b,rng,target,chance,stats);
      }
      const eligible=players.filter(p=>p.active);
      const better=eligible.filter(p=>p.score>players[target].score).length;
      const equal=eligible.filter(p=>p.score===players[target].score).length;
      bestRanks.push(better+1); worstRanks.push(better+equal);
      const key=players[target].score;
      const scenario=scenarios[key] ||= {score:key,count:0,low:cuts.map(()=>0),high:cuts.map(()=>0)}; scenario.count++;
      cuts.forEach((cut,i)=> {if(better+equal<=cut){low[i]++;scenario.low[i]++;}if(better<cut){high[i]++;scenario.high[i]++;}});
    }
    bestRanks.sort((a,b)=>a-b); worstRanks.sort((a,b)=>a-b);
    return {trials,cuts,scoreBounds:cuts.map((_,i)=>[low[i]/trials,high[i]/trials]),interval:[bestRanks[Math.floor(trials*.1)],worstRanks[Math.min(trials-1,Math.floor(trials*.9))]],scenarios:Object.values(scenarios).sort((a,b)=>b.score-a.score)};
  }
  const api={simulate};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.PairingOddsEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
