'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('pairing.html','utf8');
const ids=['pairingTrackingCollapse','pairingAdvancedCollapse','pairingScoutCollapse','pairingNoticeCollapse','pairingReminderCollapse','pairingOddsCollapse'];
for(const id of ids){
 const start=html.match(new RegExp('<details id="'+id+'"[^>]*>'));
 assert(start,id+' must be native details');
 assert.equal(/\bopen\b/.test(start[0]),id==='pairingTrackingCollapse',id+' default state');
}
assert.match(html,/<\/details>\s*<details id="pairingAdvancedCollapse"/);
assert.match(html,/<\/details>\s*<section id="pairingDeckScout"/);
for(const id of ['pairingLookupButton','pairingStopButton','pairingTestButton','pairingScoutLoad','pairingAuthCopy','oddsRun','oddsActual']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' original control must remain');
}
assert.match(html,/\.pairing-feature-collapse:not\(\[open\]\)> :not\(summary\)\{display:none\}/);
assert.match(html,/<main class="wrap pairing-main" hidden>/,'authorization guard retained');
assert.match(fs.readFileSync('.github/workflows/deploy-pages.yml','utf8'),/cp pairing\.html _site\/pairing-2\.17\.4\.html/);
console.log('PASS: independent native details, only tracking open, all original controls retained');
