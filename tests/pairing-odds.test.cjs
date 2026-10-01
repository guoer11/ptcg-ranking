const assert=require('node:assert/strict');
const fs=require('node:fs');
const {simulate}=require('../pairing-odds-engine.js');
const data=require('../data/pairing-odds-3000442.json');
const finals=require('../data/pairing-odds-3000442-final.json');
const id='tw39371632';
const options={playerId:id,totalRounds:7,cuts:[8,16,32],trials:3000,seed:3000447};
for(const s of data.snapshots){
 const indices=s.pairs.flat().filter(i=>i!==null);
 assert.equal(new Set(indices).size,indices.length,'a player only plays once in a round');
 assert.equal(indices.length,s.listed);
 assert.equal(s.players.filter(p=>p.active).length,s.listed);
 for(const p of s.players){assert(p.opponents.every(i=>i>=0 && i<s.players.length));assert(p.opponents.length<=s.completed);}
}
assert.equal(data.snapshots[0].players.length,115,'future late entrant must not leak into round 1');
assert.equal(data.snapshots[1].players.length,116);
assert(!JSON.stringify(data).includes('standings'),'final scores loaded separately');
const snapshot=data.snapshots[4], before=JSON.stringify(snapshot);
const output=simulate(snapshot,options);
assert.equal(JSON.stringify(snapshot),before,'engine must not mutate historical data');
assert.deepEqual(output,simulate(snapshot,options),'repeatable seeded scenarios');
for(let i=0;i<output.cuts.length;i++){
 const [lo,hi]=output.scoreBounds[i];assert(lo>=0 && lo<=hi && hi<=1);
 if(i){assert(lo>=output.scoreBounds[i-1][0]);assert(hi>=output.scoreBounds[i-1][1]);}
}
assert.equal(output.scenarios.reduce((n,s)=>n+s.count,0),3000);
const player=score=>({id:'tw00000001',score,active:true,opponents:[],wins:[],games:0,byes:0});
// Known two-player final round: 100% target win qualifies; 0% cannot qualify.
const simple={completed:0,players:[player(0),{...player(0),id:'tw00000002'}],pairs:[[0,1]]};
assert.deepEqual(simulate(simple,{playerId:'tw00000001',totalRounds:1,cuts:[1],chance:1,trials:5}).scoreBounds,[[1,1]]);
assert.deepEqual(simulate(simple,{playerId:'tw00000001',totalRounds:1,cuts:[1],chance:0,trials:5}).scoreBounds,[[0,0]]);
// Even when losing, a cutoff that covers all players always includes the player.
assert.deepEqual(simulate(simple,{playerId:'tw00000001',totalRounds:1,cuts:[256],chance:0,trials:5}).scoreBounds,[[1,1]]);
// At an unresolved score tie spanning a cutoff, retain the entire uncertainty range.
const tie={completed:0,players:[player(3),{...player(0),id:'tw00000002'}],pairs:[[0,1]]};
assert.deepEqual(simulate(tie,{playerId:'tw00000001',totalRounds:1,cuts:[1],chance:0,trials:5}).scoreBounds,[[0,1]]);
assert.throws(()=>simulate(snapshot,{...options,totalRounds:4}));
assert.throws(()=>simulate(snapshot,{...options,playerId:'tw00000000'}));
assert.throws(()=>simulate(snapshot,{...options,cuts:[0]}));
assert.throws(()=>simulate(snapshot,{...options,chance:NaN}));
const actual=finals.standings.find(p=>p.id===id);assert.equal(actual.rank,15);assert.equal(actual.score,15);
assert.equal(new Set(finals.standings.map(p=>p.id)).size,108);
// Official tied-score placement must fall within the score-only limits at the end.
for(const p of finals.standings){const better=finals.standings.filter(q=>q.score>p.score).length;const equal=finals.standings.filter(q=>q.score===p.score).length;assert(p.rank>=better+1 && p.rank<=better+equal);}
assert.throws(()=>simulate(data.snapshots[5],options),/空白對手/);
console.log('All tests passed. Round 5:',JSON.stringify(output));
for(const s of data.snapshots.filter(s=>!s.pairs.some(p=>p[1]===null))){const r=simulate(s,{...options,seed:3000442+s.round});console.log('Round',s.round,'score',s.players.find(p=>p.id===id).score,'bounds',r.scoreBounds);}

// Equal-point estimates are bounded and their group allocations conserve all slots.
for(let i=0;i<output.cuts.length;i++){
 assert(output.probabilities[i]>=output.scoreBounds[i][0]-1e-12 && output.probabilities[i]<=output.scoreBounds[i][1]+1e-12);
 const slots=output.field.reduce((n,p)=>n+p.meanPlayers*p.probabilities[i],0);
 assert(Math.abs(slots-Math.min(output.cuts[i],output.modeledPlayers))<1e-9);
 const conditional=output.scenarios.reduce((n,s)=>n+s.probabilities[i],0)/output.trials;
 assert(Math.abs(conditional-output.probabilities[i])<1e-10);
}
assert(Math.abs(output.field.reduce((n,p)=>n+p.meanPlayers,0)-output.modeledPlayers)<1e-9);
const tieEstimate=simulate(tie,{playerId:'tw00000001',totalRounds:1,cuts:[1],chance:0,trials:5});
assert.deepEqual(tieEstimate.probabilities,[.5],'equal tie slots allocated evenly instead of a false certainty');
const bye={completed:0,players:[player(0)],pairs:[[0,null]],pending:[{index:0,id:'tw00000001',kind:'bye'}]};
assert.deepEqual(simulate(bye,{playerId:'tw00000001',totalRounds:1,cuts:[1],trials:2}).probabilities,[1]);
const ambiguous={...bye,pending:[{index:0,id:'tw00000001',kind:'unknown'}]};
assert.throws(()=>simulate(ambiguous,{playerId:'tw00000001',totalRounds:1,cuts:[1],trials:2}),/空白對手/);
assert.throws(()=>simulate(ambiguous,{playerId:'tw00000001',totalRounds:1,cuts:[1],trials:2,pendingDecisions:{tw00000001:'absent'}}),/缺席/);
assert.deepEqual(simulate(ambiguous,{playerId:'tw00000001',totalRounds:1,cuts:[1],trials:2,pendingDecisions:{tw00000001:'bye'}}).probabilities,[1]);
console.log('Probability mass, per-score conditional rates, tie allocation and explicit/unconfirmed bye tests passed.');
