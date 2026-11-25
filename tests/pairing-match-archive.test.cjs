'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const page=fs.readFileSync('history.html','utf8');
const live=fs.readFileSync('pairing.html','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
const source=fs.readFileSync('supabase/functions/ptcg-pairing-archive/source.ts','utf8');
const fn=fs.readFileSync('supabase/functions/ptcg-pairing-archive/index.ts','utf8');
const ui=fs.readFileSync('pairing-match-archive.js','utf8');
assert.match(page,/id="matchArchive"/);
const archiveJs=page.match(/src="(pairing-match-archive-\d+\.\d+\.\d+-r\d+\.js)"/)?.[1];
assert(archiveJs,'history must load uniquely named archive JS');
assert(deploy.includes('cp pairing-match-archive.js _site/'+archiveJs),'deploy the canonical JS under its new cache-safe name');
const archiveCss=page.match(/href="(pairing-match-archive-\d+\.\d+\.\d+-r\d+\.css)"/)?.[1];
assert(archiveCss,'history must load uniquely named archive CSS');
assert(deploy.includes('cp pairing-match-archive.css _site/'+archiveCss),'deploy the canonical CSS under its new cache-safe name');
assert.equal(archiveJs.replace(/\.js$/,'.css'),archiveCss,'paired asset revisions');
assert.match(deploy,/pairing-match-archive\.js/);
assert.match(deploy,/node --check pairing-match-archive\.js/);
assert.match(fn,/requireMember\(req\)/,'archive reads require auth');
assert.match(fn,/requireCron\(req\)/,'cron polling requires secret');
assert.match(fn,/is_pairing_authorized/,'existing pairing permissions must be preserved');
assert.match(fn,/completed\?"completed"/,'final records end polling without deletion');
assert.match(source,/tourround\.asp/);
assert.match(source,/pageCount/);
assert.match(source,/captureFinal/);
assert.match(source,/captureRound/);
assert.match(ui,/pairing:tracking-started/,'tracking must automatically register archive');
assert.match(live,/pairing-match-archive\.js/,'live page must retain background archive registration');
assert.doesNotMatch(live,/id="matchArchive"/,'archive UI must move away from live pairing');
assert.match(source,/ttlScoreAfterId/,'must parse numeric official TtlScore after each player ID');
assert.match(fn,/archivePlayerContext/,'must read real names and recorded decks using authorized context');
assert.match(fn,/\.eq\("user_id",userId\)\.eq\("tid",tid\)/,'same-event decks must be scoped to account and event');
assert.match(fn,/\.neq\("tid",tid\)\.in\("player_id",chunk\)/,'historical references must come from another event');
assert.match(ui,/對戰前積分（TtlScore）/);
assert.match(ui,/本場已記錄牌組/);
assert.match(ui,/其他場歷史參考/);
assert.match(ui,/real_names/);
assert.match(ui,/首輪（無前輪積分）/);
assert.match(ui,/action/);
console.log('Match archive UI, protected actions, crawler and deployment manifest OK');

const css=fs.readFileSync('pairing-match-archive.css','utf8');
assert.doesNotMatch(ui,/不代表每輪都使用相同牌組/);
assert.match(ui,/記錄於 Round/);
assert.match(ui,/<th>名次<\/th><th>選手<\/th><th>牌組<\/th><th>TtlScore<\/th>/);
assert.match(ui,/<td>\$\{playerHTML\(p,false\)\}<\/td><td>\$\{deckHTML\(p\)\|\|"—"\}<\/td>/);
assert.match(ui,/class="archive-standings-table"/);
assert.match(css,/archive-standings-scroll\{width:100%;max-width:760px;margin-inline:0 auto\}/);
assert.match(ui,/archive-matches-scroll/);
const mobile=css.slice(css.indexOf('@media(max-width:720px)'));
assert.match(mobile,/width:100%;min-width:0;table-layout:fixed/);
assert.match(mobile,/td:last-child\{min-width:0\}/);
assert.match(ui,/archive-standings-scroll"><table class="archive-standings-table" style="width:100%;min-width:0;table-layout:fixed"><colgroup>/);
assert.match(ui,/archive-matches-scroll"><table style="width:100%;min-width:0;table-layout:fixed"><colgroup><col style="width:clamp\(46px,8vw,70px\)"><col><col><col style="width:clamp\(58px,16vw,150px\)">/);
assert.doesNotMatch(css,/min-width:(630|400|155|95)px/);
assert.match(page,/id="archiveFitCritical"/);
assert.match(page,/min-width:0 !important; table-layout:fixed/);
assert.match(css,/archive-deck\{width:fit-content;max-width:100%/);
assert.match(mobile,/overflow-wrap:anywhere/);
assert.match(mobile,/archive-score-mobile\{display:inline\}/);
assert.doesNotMatch(mobile,/td[^{]*\{[^}]*display:none/,'no table cells hidden on mobile');
console.log('PASS: mobile archive columns fit, scores retained, concise recorded-round text');

assert.match(ui,/class="archive-player\$\{deckMarkup\?" has-deck":""\}"/);
assert.match(ui,/class="archive-player-identity"/);
assert.match(css,/archive-standings-table th,#matchArchive \.archive-standings-table td\{vertical-align:middle/);
assert.match(css,/archive-standings-table \.archive-deck\{margin:0/);
assert.match(ui,/<col style="width:11%"><col style="width:32%"><col style="width:39%"><col style="width:18%">/);
assert.doesNotMatch(css,/archive-standings-scroll \.archive-player\.has-deck/);

assert.match(css,/archive-standings-table th,#matchArchive \.archive-standings-table td\{vertical-align:middle;padding:7px 8px;text-align:center\}/);
assert.match(css,/archive-standings-table \.archive-deck\{margin:0 auto;[^}]*text-align:center\}/);
assert.doesNotMatch(css,/archive-standings[^{}]*\{text-align:right\}/);
assert.match(page,/archive-standings-scroll \{ max-width:min\(100%,760px\); margin-inline:0 auto; \}/);

assert.match(css,/#matchArchive #matchArchiveRows > \.archive-standings-scroll\{width:calc\(100% \+ 16px\) !important;max-width:none !important;margin-inline:-8px !important;box-sizing:border-box\}/);
assert.match(css,/archive-standings-table td\{padding:6px 3px;text-align:center;vertical-align:middle\}/);
assert.match(page,/text-align:center !important; vertical-align:middle/);
assert.match(page,/#matchArchive #matchArchiveRows > \.archive-standings-scroll \{ width:calc\(100% \+ 16px\) !important; max-width:none !important; margin-inline:-8px !important; box-sizing:border-box; \}/);
assert.match(page,/archive-standings-table col:nth-child\(4\) \{ width:20% !important; \}/);
assert.match(deploy,/cp pairing-match-archive\.css _site\/pairing-match-archive-2\.17\.2-r1\.css/);

const mobileStandings=css.slice(css.lastIndexOf('@media(max-width:720px)',css.indexOf('/* Round pairing table:')) ,css.indexOf('/* Round pairing table:'));
assert.match(mobileStandings,/archive-standings-table td strong\{font-size:14px\}/);
assert.match(mobileStandings,/archive-player-identity small\{font-size:12px\}/);
assert.match(mobileStandings,/archive-deck\{padding:4px 4px;font-size:13px/);
assert.match(mobileStandings,/td:last-child\{font-size:14px\}/);
assert.doesNotMatch(mobileStandings,/max-width:320px/);

assert.match(deploy,/cp history\.html _site\/history-2\.17\.2-r4\.html/);
assert.match(page,/id="historyProtectedMain" hidden/,'fresh document must retain private gate');
assert.match(page,/archive-standings-table td \{ text-align:center !important; vertical-align:middle; \}/);
assert.match(css,/archive-standings-scroll\{width:100%;max-width:760px;margin-inline:0 auto\}/,'desktop remains left aligned');

for(const source of [css,page]){
 assert.match(source,/archive-matches-scroll col:first-child\{width:46px !important\}/);
 assert.match(source,/archive-matches-scroll td:first-child\{padding-inline:3px;white-space:nowrap !important;overflow-wrap:normal !important;word-break:keep-all;text-align:center/);
 assert.match(source,/archive-matches-scroll td:first-child\{font-size:12px\}/);
}
assert.match(deploy,/cp history\.html _site\/history-2\.17\.2-r5\.html/);

assert.match(ui,/class="archive-table-number" style="display:inline-block;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important"/);
assert.match(deploy,/cp history\.html _site\/history-2\.17\.2-r6\.html/);
