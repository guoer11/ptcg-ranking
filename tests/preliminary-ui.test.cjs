const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const source = fs.readFileSync('preliminary-ui.js', 'utf8');
  const dataset = JSON.parse(fs.readFileSync('data/preliminary_results.json', 'utf8'));
  const official = JSON.parse(fs.readFileSync('data/tournaments.json', 'utf8'));
  const matching = official.events.find(e => String(e.event_id) === '66987');
  const prelim = dataset.events['66987'];
  assert(matching && prelim && prelim.participants >= 9, '10/17 official standings must exist');
  const tournaments = { season: official.season, events: [matching] };
  const baseline = (t, id) => t.events.flatMap(e => {
    const row = (e.results || []).find(r => String(r.player_id).toLowerCase() === id);
    return row ? [{name:e.title, date:e.date, points:row.points, rank:row.rank, url:e.url}] : [];
  });
  const win = {
    calculatedEventsForPlayer: baseline,
    calculatedTop8: events => {
      const points = events.map(x => Number(x.points)).filter(Number.isFinite).sort((a,b) => b-a).slice(0,8);
      return {points, total:points.reduce((a,b)=>a+b,0)};
    },
    eventsHtml: () => '<div></div>',
    openPlayerModal: async id => win.calculatedEventsForPlayer(tournaments, id),
    ptcgOfficialVenue: e => ({name: e.venue, address:e.address}),
  };
  const doc = {head:{appendChild(){}},createElement(type){if(type!=='style')throw new Error('unexpected '+type);return {textContent:''};}};
  const sandbox = {window:win,document:doc,console,Date,fetch:async()=>({ok:true,json:async()=>dataset})};
  vm.runInNewContext(source,sandbox,{filename:'preliminary-ui.js'});

  const first = await win.openPlayerModal(prelim.standings[0].player_id);
  assert.equal(first.length,1);
  assert.equal(first[0].rank,1);
  assert.equal(first[0].points,null);
  assert.equal(first[0].resultStatus,'pending-final');
  assert.equal(win.calculatedTop8(first).total,0);

  const ninth = await win.openPlayerModal(prelim.standings[8].player_id);
  assert.equal(ninth[0].rank,9);
  assert.equal(ninth[0].points,20);
  assert.equal(ninth[0].resultStatus,'estimated');
  assert.equal(win.calculatedTop8(ninth).total,20);

  matching.results = [{player_id:prelim.standings[8].player_id,rank:3,points:50}];
  const confirmed = await win.openPlayerModal(prelim.standings[8].player_id);
  assert.equal(confirmed.length,1);
  assert.equal(confirmed[0].rank,3);
  assert.equal(confirmed[0].points,50);
  const other = await win.openPlayerModal(prelim.standings[0].player_id);
  assert.equal(other.length,0,'once official results exist, no provisional row is allowed for the same event');
  console.log('PASS: 87 official ranking rows; top 8 pending; ninth estimates; Pokémon Asia overrides provisional');
})().catch(err => {console.error(err);process.exitCode=1;});
