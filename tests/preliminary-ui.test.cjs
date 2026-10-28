const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const source = fs.readFileSync('preliminary-ui.js', 'utf8');
  const dataset = JSON.parse(fs.readFileSync('data/preliminary_results.json', 'utf8'));
  const knockout = JSON.parse(fs.readFileSync('data/knockout_results.json', 'utf8'));
  const official = JSON.parse(fs.readFileSync('data/tournaments.json', 'utf8'));
  const matching = official.events.find(e => String(e.event_id) === '66987');
  const prelim = dataset.events['66987'];
  assert(matching && prelim && prelim.participants === 87, '10/17 complete 87-player ranking is required');
  const tournaments = {season: official.season, events:[matching]};
  const baseline = (t,id) => t.events.flatMap(e => {
    const row = (e.results || []).find(r => String(r.player_id).toLowerCase() === id);
    return row && Number.isFinite(Number(row.points)) && Number(row.points) > 0
      ? [{name:e.title,date:e.date,points:row.points,rank:row.rank,url:e.url}] : [];
  });

  function createHarness(bracketData = knockout) {
    const win = {
      calculatedEventsForPlayer: baseline,
      calculatedTop8: events => {
        const points = events.map(x => Number(x.points)).filter(Number.isFinite).sort((a,b)=>b-a).slice(0,8);
        return {points,total:points.reduce((a,b)=>a+b,0)};
      },
      eventsHtml: () => '<div></div>',
      openPlayerModal: async id => win.calculatedEventsForPlayer(tournaments,id),
      ptcgOfficialVenue: e => ({name:e.venue,address:e.address})
    };
    const doc = {head:{appendChild(){}},createElement(type){
      if(type!=='style')throw Error('unexpected '+type);
      return {textContent:''};
    }};
    const fetcher = async path => ({
      ok:true,
      json:async()=>String(path).includes('knockout_results.json')?bracketData:dataset
    });
    const sandbox={window:win,document:doc,console,Date,fetch:fetcher};
    vm.runInNewContext(source,sandbox,{filename:'preliminary-ui.js'});
    return win;
  }
  const win = createHarness();
  const winners = {
    tw82755386:[1,100,'冠軍',7],
    tw63041398:[2,75,'亞軍',5],
    tw33000082:[3,50,'四強',1],
    tw86591343:[3,50,'四強',6],
    tw06034751:[5,25,'八強',2],
    tw90786092:[5,25,'八強',3],
    tw71161900:[5,25,'八強',4],
    tw46877625:[5,25,'八強',8]
  };
  for(const [id, [rank,points,finish,preliminaryRank]] of Object.entries(winners)) {
    const event=(await win.openPlayerModal(id)).find(e=>e.eventId==='66987');
    assert(event, 'missing player '+id);
    assert.equal(event.rank,rank);
    assert.equal(event.points,points);
    assert.equal(event.finishLabel,finish);
    assert.equal(event.preliminaryRank,preliminaryRank);
    assert.equal(event.resultStatus,'knockout-estimated');
    assert.equal(win.calculatedTop8([event]).total,points);
  }
  const ninth=await win.openPlayerModal(prelim.standings[8].player_id);
  assert.equal(ninth[0].rank,9);
  assert.equal(ninth[0].points,20);
  assert.equal(ninth[0].resultStatus,'estimated');

  // 第 69 名的 0 LP 不應進入本站已知官方賽事。
  const zeroRow=prelim.standings.find(x=>x.rank===69);
  assert(zeroRow && zeroRow.points===0, 'rank 69 has zero LP');
  const zeroEstimated=await win.openPlayerModal(zeroRow.player_id);
  assert.equal(zeroEstimated.length,0,'zero-LP provisional event must be hidden');

  const fallback=createHarness({version:1,events:{}});
  const pending=await fallback.openPlayerModal('tw82755386');
  assert.equal(pending[0].rank,7);
  assert.equal(pending[0].points,null);
  assert.equal(pending[0].resultStatus,'pending-final');
  assert.equal(fallback.calculatedTop8(pending).total,0);

  matching.results=[{player_id:'tw82755386',rank:1,points:100}];
  const officialResult=await win.openPlayerModal('tw82755386');
  assert.equal(officialResult.length,1);
  assert.equal(officialResult[0].points,100);
  assert.equal(officialResult[0].resultStatus,undefined);
  const other=await win.openPlayerModal('tw63041398');
  assert.equal(other.length,0,'official results must suppress provisional rows for this event');
  matching.results=[{player_id:zeroRow.player_id,rank:69,points:0}];
  const zeroOfficial=await win.openPlayerModal(zeroRow.player_id);
  assert.equal(zeroOfficial.length,0,'zero-LP Pokémon Asia result must be hidden too');
  matching.results=[];
  console.log('PASS: bracket joins, score estimates, pending preserved, official first, 0-LP rows hidden');
})().catch(err=>{console.error(err);process.exitCode=1;});
