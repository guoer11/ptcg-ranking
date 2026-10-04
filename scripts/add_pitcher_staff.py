from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "let config=Object.assign({starterPitcherId:'',park:'dome',sound:true},JSON.parse(localStorage.getItem(CFG_KEY)||'{}'));",
        "let config=Object.assign({starterPitcherId:'',middlePitcherIds:[],closerPitcherId:'',park:'dome',sound:true},JSON.parse(localStorage.getItem(CFG_KEY)||'{}'));if(!Array.isArray(config.middlePitcherIds))config.middlePitcherIds=[];",
    ),
    (
        "<h2>投手、球場與比賽設定</h2>\n      <div class=\"config-grid\">\n        <label>先發投手<select id=\"starterPitcherSelect\"></select><span id=\"starterPitcherInfo\" class=\"sub\"></span></label>\n        <label>比賽球場<select id=\"parkSelect\"></select><span id=\"parkInfo\" class=\"park-info\"></span></label>\n      </div>",
        "<h2>投手群、球場與比賽設定</h2>\n      <div class=\"source-note\" style=\"margin:0 0 10px\"><strong style=\"color:#ffe078\">你的投手群：5 人</strong><br>先選 1 位先發、3 位中繼與 1 位後援／終結者。比賽中的換投只會從這組牛棚名單選擇。</div>\n      <div class=\"config-grid pitcher-staff-grid\">\n        <label>先發投手（SP）<select id=\"starterPitcherSelect\"></select><span id=\"starterPitcherInfo\" class=\"sub\"></span></label>\n        <label>中繼投手 1（RP）<select id=\"middlePitcher1Select\"></select><span id=\"middlePitcher1Info\" class=\"sub\"></span></label>\n        <label>中繼投手 2（RP）<select id=\"middlePitcher2Select\"></select><span id=\"middlePitcher2Info\" class=\"sub\"></span></label>\n        <label>中繼投手 3（RP）<select id=\"middlePitcher3Select\"></select><span id=\"middlePitcher3Info\" class=\"sub\"></span></label>\n        <label>後援／終結者（CL）<select id=\"closerPitcherSelect\"></select><span id=\"closerPitcherInfo\" class=\"sub\"></span></label>\n        <label>比賽球場<select id=\"parkSelect\"></select><span id=\"parkInfo\" class=\"park-info\"></span></label>\n      </div>",
    ),
    (
        ".config-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}",
        ".config-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pitcher-staff-grid label{min-width:0}.pitcher-staff-grid select{font-size:12px}.pitcher-staff-grid .sub{min-height:30px}",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Target not found for basic replacement: {old[:100]}')
    text = text.replace(old, new, 1)

old_block = """function renderConfig(){const cands=pitcherCandidates().filter(p=>!lineup.some(x=>playerId(x)===playerId(p)));if(!cands.length)return;const exists=cands.some(p=>playerId(p)===config.starterPitcherId);if(!exists)config.starterPitcherId=playerId(cands[0]);$('starterPitcherSelect').innerHTML=cands.map(p=>{const r=pitcherRatings(p);return`<option value=\"${playerId(p)}\" ${playerId(p)===config.starterPitcherId?'selected':''}>${p.name}｜${p.teamName}｜OVR ${r.overall}</option>`}).join('');$('starterPitcherSelect').onchange=e=>{config.starterPitcherId=e.target.value;saveCfg();renderStarterInfo();updateStartState()};$('parkSelect').innerHTML=Object.entries(parks).map(([k,v])=>`<option value=\"${k}\" ${k===config.park?'selected':''}>${v.name}</option>`).join('');$('parkSelect').onchange=e=>{config.park=e.target.value;saveCfg();renderParkInfo()};renderStarterInfo();renderParkInfo();renderSoundToggle();saveCfg();updateStartState()}
function renderStarterInfo(){const p=players.find(x=>playerId(x)===config.starterPitcherId);if(!p){$('starterPitcherInfo').textContent='';return}const r=pitcherRatings(p);$('starterPitcherInfo').textContent=`球速 ${r.velo}・控球 ${r.control}・變化 ${r.break}・耐力 ${r.stamina}`}
"""

new_block = """function starterScore(p){const r=pitcherRatings(p);return r.stamina*.46+r.control*.20+r.break*.16+r.velo*.08+r.overall*.10}
function relieverScore(p){const r=pitcherRatings(p);return r.overall*.34+r.break*.25+r.control*.23+r.velo*.18}
function closerScore(p){const r=pitcherRatings(p);return r.velo*.31+r.break*.31+r.control*.18+r.overall*.20}
function staffIds(){return[config.starterPitcherId,...(config.middlePitcherIds||[]),config.closerPitcherId].filter(Boolean)}
function staffRole(id){if(id===config.starterPitcherId)return'先發';const i=(config.middlePitcherIds||[]).indexOf(id);if(i>=0)return`中繼 ${i+1}`;if(id===config.closerPitcherId)return'後援／終結者';return'投手'}
function pitcherInfoText(id){const p=players.find(x=>playerId(x)===id);if(!p)return'';const r=pitcherRatings(p);return`${p.teamName}｜OVR ${r.overall}｜球速 ${r.velo}・控球 ${r.control}・變化 ${r.break}・耐力 ${r.stamina}`}
function normalizePitcherStaff(cands){const valid=new Set(cands.map(playerId)),used=new Set();let sp=valid.has(config.starterPitcherId)?config.starterPitcherId:'';if(sp)used.add(sp);if(!sp){const p=[...cands].sort((a,b)=>starterScore(b)-starterScore(a)).find(p=>!used.has(playerId(p)));sp=p?playerId(p):'';if(sp)used.add(sp)}const mids=[];for(const id of(config.middlePitcherIds||[])){if(mids.length>=3)break;if(valid.has(id)&&!used.has(id)){mids.push(id);used.add(id)}}for(const p of[...cands].sort((a,b)=>relieverScore(b)-relieverScore(a))){if(mids.length>=3)break;const id=playerId(p);if(!used.has(id)){mids.push(id);used.add(id)}}let cl=valid.has(config.closerPitcherId)&&!used.has(config.closerPitcherId)?config.closerPitcherId:'';if(cl)used.add(cl);if(!cl){const p=[...cands].sort((a,b)=>closerScore(b)-closerScore(a)).find(p=>!used.has(playerId(p)));cl=p?playerId(p):''}config.starterPitcherId=sp;config.middlePitcherIds=mids;config.closerPitcherId=cl}
function staffSelectOptions(cands,current,blocked,sorter){return[...cands].sort(sorter).filter(p=>playerId(p)===current||!blocked.has(playerId(p))).map(p=>{const r=pitcherRatings(p),id=playerId(p);return`<option value=\"${id}\" ${id===current?'selected':''}>${p.name}｜${p.teamName}｜OVR ${r.overall}</option>`}).join('')}
function renderConfig(){const cands=pitcherCandidates().filter(p=>!lineup.some(x=>playerId(x)===playerId(p)));if(cands.length<5)return;normalizePitcherStaff(cands);const ids=staffIds();const bind=(el,current,role,index,sorter)=>{const blocked=new Set(ids.filter(id=>id!==current));$(el).innerHTML=staffSelectOptions(cands,current,blocked,sorter);$(el).onchange=e=>{const v=e.target.value;if(role==='starter')config.starterPitcherId=v;else if(role==='closer')config.closerPitcherId=v;else{const a=[...(config.middlePitcherIds||[])];a[index]=v;config.middlePitcherIds=a}saveCfg();renderConfig()}};bind('starterPitcherSelect',config.starterPitcherId,'starter',0,(a,b)=>starterScore(b)-starterScore(a));bind('middlePitcher1Select',config.middlePitcherIds[0],'middle',0,(a,b)=>relieverScore(b)-relieverScore(a));bind('middlePitcher2Select',config.middlePitcherIds[1],'middle',1,(a,b)=>relieverScore(b)-relieverScore(a));bind('middlePitcher3Select',config.middlePitcherIds[2],'middle',2,(a,b)=>relieverScore(b)-relieverScore(a));bind('closerPitcherSelect',config.closerPitcherId,'closer',0,(a,b)=>closerScore(b)-closerScore(a));$('starterPitcherInfo').textContent=pitcherInfoText(config.starterPitcherId);$('middlePitcher1Info').textContent=pitcherInfoText(config.middlePitcherIds[0]);$('middlePitcher2Info').textContent=pitcherInfoText(config.middlePitcherIds[1]);$('middlePitcher3Info').textContent=pitcherInfoText(config.middlePitcherIds[2]);$('closerPitcherInfo').textContent=pitcherInfoText(config.closerPitcherId);$('parkSelect').innerHTML=Object.entries(parks).map(([k,v])=>`<option value=\"${k}\" ${k===config.park?'selected':''}>${v.name}</option>`).join('');$('parkSelect').onchange=e=>{config.park=e.target.value;saveCfg();renderParkInfo()};renderParkInfo();renderSoundToggle();saveCfg();updateStartState()}
function renderStarterInfo(){if($('starterPitcherInfo'))$('starterPitcherInfo').textContent=pitcherInfoText(config.starterPitcherId)}
"""

if old_block not in text:
    raise SystemExit('renderConfig block not found')
text = text.replace(old_block, new_block, 1)

old_can = "function canStart(){return lineup.length===9&&new Set(lineup.map(p=>positionMap[playerId(p)])).size===9&&!!players.find(p=>playerId(p)===config.starterPitcherId)}"
new_can = "function canStart(){const ids=staffIds();return lineup.length===9&&new Set(lineup.map(p=>positionMap[playerId(p)])).size===9&&ids.length===5&&new Set(ids).size===5&&ids.every(id=>!!players.find(p=>playerId(p)===id))}"
if old_can not in text:
    raise SystemExit('canStart target not found')
text = text.replace(old_can, new_can, 1)

old_tactics = "function renderTactics(){const hit=availableBench('hit').slice(0,140),run=availableBench('run').slice(0,140),rel=pitcherCandidates().filter(p=>!usedPitchers.has(playerId(p))).slice(0,120);$('pinchHitterSelect').innerHTML=hit.map(p=>`<option value=\"${playerId(p)}\">${p.name}｜OPS ${rate(p.stats?.OPS)}｜PWR ${gameRatings(p).power}</option>`).join('')||'<option value=\"\">無可用球員</option>';$('pinchRunnerSelect').innerHTML=run.map(p=>`<option value=\"${playerId(p)}\">${p.name}｜SPD ${gameRatings(p).speed}</option>`).join('')||'<option value=\"\">無可用球員</option>';$('pinchBaseSelect').innerHTML=bases.map((r,i)=>r?`<option value=\"${i}\">${i+1}壘｜${r.player.name}</option>`:'').join('')||'<option value=\"\">目前壘上無人</option>';$('relieverSelect').innerHTML=rel.map(p=>{const r=pitcherRatings(p);return`<option value=\"${playerId(p)}\">${p.name}｜OVR ${r.overall}｜V${r.velo} C${r.control}</option>`}).join('')||'<option value=\"\">無可用投手</option>';const pr=userPitcher?currentPitcherRatings(userPitcher):null;$('userPitcherStatus').textContent=userPitcher?`目前：${userPitcher.player.name}・${userPitcher.pitches}球・耐力 ${pr.stamina}`:''}"
new_tactics = "function configuredBullpen(){return[...(config.middlePitcherIds||[]),config.closerPitcherId].map(id=>players.find(p=>playerId(p)===id)).filter(Boolean).filter(p=>!usedPitchers.has(playerId(p)))}\nfunction renderTactics(){const hit=availableBench('hit').slice(0,140),run=availableBench('run').slice(0,140),rel=configuredBullpen();$('pinchHitterSelect').innerHTML=hit.map(p=>`<option value=\"${playerId(p)}\">${p.name}｜OPS ${rate(p.stats?.OPS)}｜PWR ${gameRatings(p).power}</option>`).join('')||'<option value=\"\">無可用球員</option>';$('pinchRunnerSelect').innerHTML=run.map(p=>`<option value=\"${playerId(p)}\">${p.name}｜SPD ${gameRatings(p).speed}</option>`).join('')||'<option value=\"\">無可用球員</option>';$('pinchBaseSelect').innerHTML=bases.map((r,i)=>r?`<option value=\"${i}\">${i+1}壘｜${r.player.name}</option>`:'').join('')||'<option value=\"\">目前壘上無人</option>';$('relieverSelect').innerHTML=rel.map(p=>{const r=pitcherRatings(p),id=playerId(p);return`<option value=\"${id}\">${staffRole(id)}｜${p.name}｜OVR ${r.overall}｜V${r.velo} C${r.control}</option>`}).join('')||'<option value=\"\">牛棚已無可用投手</option>';const pr=userPitcher?currentPitcherRatings(userPitcher):null;$('userPitcherStatus').textContent=userPitcher?`目前：${userPitcher.player.name}（${staffRole(playerId(userPitcher.player))}）・${userPitcher.pitches}球・耐力 ${pr.stamina}｜牛棚剩 ${rel.length} 人`:''}"
if old_tactics not in text:
    raise SystemExit('renderTactics target not found')
text = text.replace(old_tactics, new_tactics, 1)

old_change = "$('pitchChangeBtn').onclick=()=>{const p=players.find(x=>playerId(x)===$('relieverSelect').value);if(!p)return;const old=userPitcher?.player?.name||'—';userPitcher=makePitcherState(p);usedPitchers.add(playerId(p));substitutions.push(`換投：${old} → ${p.name}`);$('tacticStatus').textContent=`${p.name} 接替投球`;renderTactics()};"
new_change = "$('pitchChangeBtn').onclick=()=>{const p=players.find(x=>playerId(x)===$('relieverSelect').value);if(!p)return;const id=playerId(p),old=userPitcher?.player?.name||'—';userPitcher=makePitcherState(p);usedPitchers.add(id);substitutions.push(`換投：${old} → ${p.name}（${staffRole(id)}）`);$('tacticStatus').textContent=`${p.name}（${staffRole(id)}）接替投球`;renderTactics();updateBoard()};"
if old_change not in text:
    raise SystemExit('pitchChange handler target not found')
text = text.replace(old_change, new_change, 1)

old_start = "const sp=players.find(p=>playerId(p)===config.starterPitcherId)||pitcherCandidates()[0];userPitcher=makePitcherState(sp);usedPitchers.add(playerId(sp));"
new_start = "const sp=players.find(p=>playerId(p)===config.starterPitcherId)||pitcherCandidates()[0];userPitcher=makePitcherState(sp);usedPitchers.add(playerId(sp));substitutions.push(`投手群：先發 ${sp.name}｜中繼 ${(config.middlePitcherIds||[]).map(id=>players.find(p=>playerId(p)===id)?.name).filter(Boolean).join('、')}｜終結 ${players.find(p=>playerId(p)===config.closerPitcherId)?.name||'—'}`);"
if old_start not in text:
    raise SystemExit('startGame pitcher target not found')
text = text.replace(old_start, new_start, 1)

path.write_text(text, encoding='utf-8')
print('Added selectable 5-man pitching staff: 1 SP, 3 RP, 1 CL; tactics now limited to configured bullpen.')
