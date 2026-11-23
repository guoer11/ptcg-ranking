'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=path=>fs.readFileSync(path,'utf8');
const html=read('pairing.html');
const historyPage=read('history.html');
const archive=read('supabase/functions/ptcg-pairing-archive/source.ts');
const archiveFn=read('supabase/functions/ptcg-pairing-archive/index.ts');
const archiveUi=read('pairing-match-archive.js');
const forecast=read('supabase/functions/ptcg-pairing-forecast/source.ts');
const forecastApi=read('supabase/functions/ptcg-pairing-forecast/index.ts');
const odds=read('pairing-odds.js');
const pairing=read('pairing.js');

// Today's official TID 5865462 exposes "End of Round 7 interim result"
// at kno=7&znt=1, while kno=9999999&znt=1 is blank.
assert.match(archive,/captureInterim\(tid:string,round:number\)/);
assert.match(archive,/pageUrl\(tid,round,1,true\)/);
assert.match(archive,/znt=\$\{standings\|\|round===9999999\?1:0\}/);
assert.match(archive,/interimRounds/);
assert.match(archiveFn,/ptcg_match_archive_interims/);
assert.match(archiveFn,/detail\.interim=await saveInterim/);
assert.match(archiveFn,/detail\.final=final\.available/);
assert.match(archiveFn,/final_seen_at:now\(\)/);
assert.match(archiveUi,/selectedRound==="final"\|\|selectedRound==="interim"/);
assert.match(archiveUi,/暫定排名（非最終成績）/);
assert.match(archiveUi,/data\.interim\?"interim"/,'latest cached archive must still support the interim ranking choice');
assert.match(html,/standing && finalState\?\.ranking\?\.is_final === true/);
assert.match(html,/existing\?\.active && existing\.tid === parsed\.tid/);
assert.match(html,/暫定排名/);
assert.match(pairing,/const isInterim = Boolean\(ranking\?\.is_interim\)/);
assert.match(pairing,/暫定名次，尚非官方最終排名/);
assert.match(forecast,/interimRounds/);
assert.match(forecast,/is_interim:!complete/,'only unconfirmed rounds stay interim');
assert.match(forecast,/rank_status:complete\?"final":"interim"/,'configured last round is final');
assert.match(forecast,/rank_status:"final"/);
assert.match(forecastApi,/if\(completed\.available\)return json\(completed\)/);
assert.match(odds,/const p=data\.standing,interim=Boolean\(data\.is_interim\)/);
assert.match(odds,/官方暫定/);
assert(!archiveUi.includes("window.open("),'archive displays own saved data');
assert.match(historyPage,/id="pairingHistory"/,'legacy personal deck history moved to private history page');
assert.match(html,/id="pairingDeckScout"/,'legacy deck scout must remain');
console.log('PASS: interim rankings are displayed and archived separately from official finals; live watch and deck history preserved.');
