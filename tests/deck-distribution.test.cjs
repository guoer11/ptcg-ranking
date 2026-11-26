'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const ctx={TextEncoder,Uint8Array,Uint32Array,DataView,console};
vm.runInNewContext(fs.readFileSync('deck-distribution.js','utf8'),ctx);
const api=ctx.PTCGDistribution;
const exact=[{player_id:'tw1',deck_name:'多龍'},{player_id:'tw2',deck_name:'化隱'},{player_id:'tw3',deck_name:'衝突',conflict:true}];
const pairs=[{player_a_id:'tw1',player_b_id:'tw4',deck_a:'多龍',deck_b:'化隱'},{player_a_id:'tw5',player_b_id:'tw6',deck_a:'多龍',deck_b:'N的索羅亞克'},{player_a_id:'tw3',player_b_id:'tw7',deck_a:'化隱',deck_b:'多龍'}];
const d=api.build(exact,pairs);assert.equal(d.total,5);assert.equal(d.ambiguousPairs,1);assert.equal(d.conflictingPairs,1);assert.equal(d.blockedPlayers,1);
const meta={title:'2026/11/21-2 2026-27 UBL 1-4 孩童組',player_count:80};
assert.equal(api.titleFor('5865462',meta).title,'11/21 高級球孩童組（比賽人數80人）');assert.match(api.titleFor('123',{}).title,/待確認/);
let clicked=false;const box={innerHTML:'',querySelector(){return {addEventListener(type,fn){clicked=type==='click';}}}};
api.render(box,d,'5865462',meta);assert(clicked);assert.match(box.innerHTML,/匯出 Excel/);assert.match(box.innerHTML,/40\.0%/);assert.match(box.innerHTML,/100\.0%/);
const bytes=Buffer.from(api.workbook(d,'5865462',meta));fs.writeFileSync('/tmp/deck-distribution-test.xlsx',bytes);
assert.equal(bytes.readUInt32LE(0),0x04034b50);
const files={};let pos=0;while(bytes.readUInt32LE(pos)===0x04034b50){const size=bytes.readUInt32LE(pos+18),nl=bytes.readUInt16LE(pos+26),el=bytes.readUInt16LE(pos+28),name=bytes.subarray(pos+30,pos+30+nl).toString(),start=pos+30+nl+el;files[name]=bytes.subarray(start,start+size).toString();pos=start+size;}
const sheet=files['xl/worksheets/sheet1.xml'];assert.match(sheet,/11\/21 高級球孩童組（比賽人數80人）/);assert.match(sheet,/<mergeCell ref="A1:C1"\/>/);assert.match(sheet,/<f>IFERROR\(B3\/\$B\$6,0\)<\/f><v>0.4<\/v>/);assert.match(sheet,/<f>SUM\(B3:B5\)<\/f><v>5<\/v>/);assert.match(sheet,/<f>SUM\(C3:C5\)<\/f><v>1<\/v>/);assert.match(files['xl/styles.xml'],/formatCode="0.0%"/);
const styles=[...files['xl/styles.xml'].match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[\s\S]*?<\/xf>/g)].map(m=>m[0]);
for(const i of [3,5,9])assert.match(styles[i],/horizontal="center"/,'deck names and total centered');
assert.match(fs.readFileSync('deck-distribution.css','utf8'),/\.deck-distribution-table tbody td,\.deck-distribution-table tfoot td\{text-align:center/);
const malicious=api.workbook({sorted:[['=1+1 & <test>',1]],total:1},'1',{});assert(Buffer.from(malicious).includes(Buffer.from('=1+1 &amp; &lt;test&gt;')));
for(const path of ['pairing.html','history.html']){const h=fs.readFileSync(path,'utf8');assert.match(h,/deck-distribution\.js\?v=3\.2\.0-r1/);assert.match(h,/deck-distribution\.css\?v=3\.2\.0-r1/);}
assert.match(fs.readFileSync('pairing-history.js','utf8'),/PTCGDistribution\.render/);assert.match(fs.readFileSync('pairing-deck-scout.js','utf8'),/PTCGDistribution\.render/);
console.log('PASS: identical distribution rules, conflict exclusions, official event title, numeric percent formulas and genuine XLSX export');
