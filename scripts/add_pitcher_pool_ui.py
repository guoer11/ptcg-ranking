from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')

old_vars = "let players=[],lineup=[],filterTeam='all',search='',sortBy='OPS',opponent='brothers',positionMap=JSON.parse(localStorage.getItem(POS_KEY)||'{}');"
new_vars = "let players=[],lineup=[],filterTeam='all',search='',sortBy='OPS',pitcherFilterTeam='all',pitcherSearch='',pitcherSortBy='ERA',activePitchRole='starter',opponent='brothers',positionMap=JSON.parse(localStorage.getItem(POS_KEY)||'{}');"
if old_vars not in text: raise SystemExit('vars target missing')
text = text.replace(old_vars, new_vars, 1)

old_settings = '''    <section class="card">
      <h2>投手群、球場與比賽設定</h2>
      <div class="source-note" style="margin:0 0 10px"><strong style="color:#ffe078">你的投手群：5 人</strong><br>先選 1 位先發、3 位中繼與 1 位後援／終結者。比賽中的換投只會從這組牛棚名單選擇。</div>
      <div class="config-grid pitcher-staff-grid">
        <label>先發投手（SP）<select id="starterPitcherSelect"></select><span id="starterPitcherInfo" class="sub"></span></label>
        <label>中繼投手 1（RP）<select id="middlePitcher1Select"></select><span id="middlePitcher1Info" class="sub"></span></label>
        <label>中繼投手 2（RP）<select id="middlePitcher2Select"></select><span id="middlePitcher2Info" class="sub"></span></label>
        <label>中繼投手 3（RP）<select id="middlePitcher3Select"></select><span id="middlePitcher3Info" class="sub"></span></label>
        <label>後援／終結者（CL）<select id="closerPitcherSelect"></select><span id="closerPitcherInfo" class="sub"></span></label>
        <label>比賽球場<select id="parkSelect"></select><span id="parkInfo" class="park-info"></span></label>
      </div>
      <div class="sound-toggle" style="margin-top:10px"><div><strong>球場音效</strong><div class="sub">擊球、接球、歡呼與全壘打效果音</div></div><button id="soundToggle">開啟</button></div>
      <div class="source-note">AVG／OBP／SLG／OPS 使用 2026 球季資料；SPD／DEF 與投手球速、控球、變化球、耐力為遊戲能力值，並依先發／中繼／終結角色套用不同疲勞與短局加成，並非聯盟官方評分。</div>
    </section>'''
new_settings = '''    <section class="card">
      <div class="hero"><div><h2 style="margin:0">選擇投手群</h2><div id="pitcherPoolStatus" class="sub">讀取 2026 投手成績中…</div></div><span id="pitcherCountBadge" class="badge">0 位</span></div>
      <div id="pitcherTeamFilters" class="filters" style="margin-top:10px"></div>
      <div class="tools"><input id="pitcherSearchInput" placeholder="搜尋投手姓名"><select id="pitcherSortSelect"><option value="ERA">ERA 低→高</option><option value="WHIP">WHIP 低→高</option><option value="IP">局數 高→低</option><option value="K">三振 高→低</option><option value="W">勝投 高→低</option><option value="SV">救援 高→低</option><option value="HLD">中繼 高→低</option><option value="NAME">姓名</option></select></div>
      <div class="pool-head"><h3 style="margin:0">我的投手群</h3><span class="sub">先點角色，再點下方投手即可替換</span></div>
      <div id="pitchRoleTabs" class="pitch-role-tabs"></div>
      <div class="pool-head" style="margin-top:12px"><h3 style="margin:0">投手池</h3><span class="sub">ERA・WHIP・IP・K・W-L・SV/HLD</span></div>
      <div id="pitcherPool" class="pool pitcher-pool"><div class="loading">載入投手資料中…</div></div>
      <div class="source-note">ERA、WHIP、IP、K、W-L、SV、HLD 為 2026 一軍投球成績整理；球速、控球、變化球、耐力仍是遊戲能力值。投手池只顯示有一軍登板紀錄的投手。</div>
    </section>

    <section class="card">
      <h2>球場與比賽設定</h2>
      <div class="hidden"><select id="starterPitcherSelect"></select><span id="starterPitcherInfo"></span><select id="middlePitcher1Select"></select><span id="middlePitcher1Info"></span><select id="middlePitcher2Select"></select><span id="middlePitcher2Info"></span><select id="middlePitcher3Select"></select><span id="middlePitcher3Info"></span><select id="closerPitcherSelect"></select><span id="closerPitcherInfo"></span></div>
      <div class="config-grid"><label>比賽球場<select id="parkSelect"></select><span id="parkInfo" class="park-info"></span></label></div>
      <div class="sound-toggle" style="margin-top:10px"><div><strong>球場音效</strong><div class="sub">擊球、接球、歡呼與全壘打效果音</div></div><button id="soundToggle">開啟</button></div>
      <div class="source-note">AVG／OBP／SLG／OPS 使用 2026 打擊資料；投手 ERA／WHIP／IP／K 等使用 2026 投球資料。SPD／DEF 與投手球速、控球、變化球、耐力為遊戲能力值。</div>
    </section>'''
if old_settings not in text: raise SystemExit('settings target missing')
text = text.replace(old_settings, new_settings, 1)

css_marker = "@media(max-width:620px){.config-grid{grid-template-columns:1fr}.slot{grid-template-columns:34px minmax(0,1fr) 76px auto}.position-select{width:74px}.broadcastMetrics{gap:8px;font-size:9px}.broadcastMetrics b{font-size:13px}}"
new_css = '''.pitch-role-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.pitch-role{border:1px solid #365858;background:#0b2627;color:#fff;border-radius:12px;padding:8px 5px;text-align:center;min-width:0}.pitch-role.active{border-color:#ffd052;box-shadow:0 0 0 2px rgba(255,208,82,.14);background:#173c35}.pitch-role .role{font-size:10px;color:#ffe078;font-weight:950}.pitch-role strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}.pitch-role .mini{font-size:9px;color:#9fb4af;margin-top:3px;white-space:nowrap}.pitcher-card .pitch-extra{font-size:10px;color:#b8cbc7;margin-top:6px;line-height:1.45}.pitcher-card .role-mark{position:absolute;right:7px;top:7px;background:#ffd052;color:#4a3400;border-radius:999px;padding:3px 6px;font-size:9px;font-weight:950}.pitcher-card.target{box-shadow:0 0 0 2px rgba(255,208,82,.2)}
@media(max-width:620px){.pitch-role-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.pitch-role:last-child{grid-column:1/-1}.pitcher-pool{max-height:52vh}}
'''
if css_marker not in text: raise SystemExit('css marker missing')
text = text.replace(css_marker, new_css + css_marker, 1)

old_pitch_core = "function isLikelyPitcher(p){const s=p.stats||{};return num(s.PA)==null||num(s.PA)===0||s.AVG==null}\nfunction pitcherRatings(p){const id=playerId(p),base=isLikelyPitcher(p)?1:0;const velo=clamp(Math.round(58+base*8+h01(id,'pv')*27),48,97),control=clamp(Math.round(54+base*8+h01(id,'pc')*30),45,97),brk=clamp(Math.round(54+base*8+h01(id,'pb')*31),45,98),stamina=clamp(Math.round(52+base*12+h01(id,'ps')*31),45,98);const all=['FF','SI','SL','CH','CU'],count=3+(h01(id,'pn')>.56?1:0)+(h01(id,'pn2')>.83?1:0),rep=['FF',...all.slice(1).sort((a,b)=>h01(id,a)-h01(id,b)).slice(0,count-1)];return{velo,control,break:brk,stamina,overall:Math.round((velo+control+brk+stamina*.72)/3.72),repertoire:rep}}\nfunction pitcherCandidates(teamKey=null){return players.filter(p=>(!teamKey||p.teamKey===teamKey)&&isLikelyPitcher(p)).sort((a,b)=>pitcherRatings(b).overall-pitcherRatings(a).overall)}"
new_pitch_core = "function isLikelyPitcher(p){if(p.pitching)return true;const s=p.stats||{};return num(s.PA)==null||num(s.PA)===0||s.AVG==null}\nfunction pitcherRatings(p){const id=playerId(p),ps=p.pitching||{},outs=num(ps.IP_outs)||0,w=clamp(outs/120,0,1),era=num(ps.ERA)??4.2,whip=num(ps.WHIP)??1.4,k9=num(ps.K9)??7,bb9=num(ps.BB9)??3.2,gs=num(ps.GS)||0,g=Math.max(1,num(ps.G)||1);const velo=clamp(Math.round(65+h01(id,'pv')*20+(k9-7)*1.15*w),50,97),control=clamp(Math.round(63+h01(id,'pc')*18+(3.2-bb9)*4.5*w+(1.4-whip)*8*w),45,98),brk=clamp(Math.round(62+h01(id,'pb')*19+(k9-7)*2.2*w+(4.2-era)*1.4*w),45,98),stamina=clamp(Math.round(55+h01(id,'ps')*17+(gs/g)*18+Math.min(outs/3,120)*.09),45,98);const perf=clamp((4.2-era)*2.2+(1.4-whip)*7, -8, 10)*w;const all=['FF','SI','SL','CH','CU'],count=3+(h01(id,'pn')>.56?1:0)+(h01(id,'pn2')>.83?1:0),rep=['FF',...all.slice(1).sort((a,b)=>h01(id,a)-h01(id,b)).slice(0,count-1)];return{velo,control,break:brk,stamina,overall:clamp(Math.round((velo+control+brk+stamina*.72)/3.72+perf),45,99),repertoire:rep}}\nfunction pitcherCandidates(teamKey=null){return players.filter(p=>(!teamKey||p.teamKey===teamKey)&&!!p.pitching).sort((a,b)=>pitcherRatings(b).overall-pitcherRatings(a).overall)}"
if old_pitch_core not in text: raise SystemExit('pitcher core missing')
text = text.replace(old_pitch_core, new_pitch_core, 1)

old_load_start = "async function loadPlayers(){try{const r=await fetch('data/cpbl_batting_2026.json?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(r.status);const j=await r.json();players=Object.values(j.players||{}).map(s=>{const teamKey=teamByName[s.team];return teamKey?{name:s.player,teamKey,teamName:s.team,stats:s}:null}).filter(Boolean);const seen=new Set();players=players.filter(p=>{const k=playerId(p);if(seen.has(k))return false;seen.add(k);return true});$('poolStatus').textContent=`2026 正式註冊一軍球員池・共 ${players.length} 人可選`;const saved=JSON.parse(localStorage.getItem(LINEUP_KEY)||localStorage.getItem('cpblFantasyLineupV5')||'[]');if(Array.isArray(saved)&&saved.length)lineup=saved.map(id=>players.find(p=>playerId(p)===id)).filter(Boolean).slice(0,9)}catch(e){$('poolStatus').textContent='球員資料讀取失敗，請重新整理後再試';console.warn(e)}ensurePositions();renderFilters();renderPool();renderLineup();renderConfig();renderOpponent();}"
new_load_start = "async function loadPlayers(){try{const r=await fetch('data/cpbl_batting_2026.json?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(r.status);const j=await r.json();players=Object.values(j.players||{}).map(s=>{const teamKey=teamByName[s.team];return teamKey?{name:s.player,teamKey,teamName:s.team,stats:s,pitching:null}:null}).filter(Boolean);const seen=new Set();players=players.filter(p=>{const k=playerId(p);if(seen.has(k))return false;seen.add(k);return true});$('poolStatus').textContent=`2026 正式註冊一軍球員池・共 ${players.length} 人可選`;try{const pr=await fetch('data/cpbl_pitching_2026.json?v='+Date.now(),{cache:'no-store'});if(pr.ok){const pj=await pr.json(),pm=pj.pitchers||{};players.forEach(p=>p.pitching=pm[`${p.teamName}|${p.name}`]||null);const pc=players.filter(p=>p.pitching).length;$('pitcherPoolStatus').textContent=`2026 一軍登板投手・${pc} 人可選`;$('pitcherCountBadge').textContent=pc+' 位'}else throw Error(pr.status)}catch(pe){$('pitcherPoolStatus').textContent='投手成績讀取失敗，請重新整理';console.warn(pe)}const saved=JSON.parse(localStorage.getItem(LINEUP_KEY)||localStorage.getItem('cpblFantasyLineupV5')||'[]');if(Array.isArray(saved)&&saved.length)lineup=saved.map(id=>players.find(p=>playerId(p)===id)).filter(Boolean).slice(0,9)}catch(e){$('poolStatus').textContent='球員資料讀取失敗，請重新整理後再試';console.warn(e)}ensurePositions();renderFilters();renderPitcherFilters();renderPool();renderLineup();renderConfig();renderOpponent();}"
if old_load_start not in text: raise SystemExit('loadPlayers target missing')
text = text.replace(old_load_start, new_load_start, 1)

old_events = "$('searchInput').oninput=e=>{search=e.target.value.trim();renderPool()};$('sortSelect').onchange=e=>{sortBy=e.target.value;renderPool()};\nfunction starterScore(p)"
new_events = r'''$('searchInput').oninput=e=>{search=e.target.value.trim();renderPool()};$('sortSelect').onchange=e=>{sortBy=e.target.value;renderPool()};
const pitchRoleDefs=[['starter','先發 SP'],['middle0','中繼 RP1'],['middle1','中繼 RP2'],['middle2','中繼 RP3'],['closer','終結 CL']];
function pitchRoleId(key){if(key==='starter')return config.starterPitcherId||'';if(key==='closer')return config.closerPitcherId||'';const i=Number(key.replace('middle',''));return(config.middlePitcherIds||[])[i]||''}
function setPitchRoleId(key,id){if(key==='starter')config.starterPitcherId=id;else if(key==='closer')config.closerPitcherId=id;else{const i=Number(key.replace('middle','')),a=[...(config.middlePitcherIds||[])];while(a.length<3)a.push('');a[i]=id;config.middlePitcherIds=a}}
function pitchRoleKeyById(id){if(config.starterPitcherId===id)return'starter';const i=(config.middlePitcherIds||[]).indexOf(id);if(i>=0)return'middle'+i;if(config.closerPitcherId===id)return'closer';return''}
function pitchStat(p,key){const s=p?.pitching||{};if(key==='IP')return num(s.IP_outs)||0;if(key==='NAME')return p.name;return num(s[key])}
function renderPitcherFilters(){$('pitcherTeamFilters').innerHTML=`<button class="filter active" data-pf="all">全部</button>`+Object.entries(teams).map(([k,t])=>`<button class="filter" data-pf="${k}">${t.short}</button>`).join('');qsa('[data-pf]').forEach(b=>b.onclick=()=>{pitcherFilterTeam=b.dataset.pf;qsa('[data-pf]').forEach(x=>x.classList.toggle('active',x===b));renderPitcherPool()})}
function visiblePitchers(){let list=players.filter(p=>p.pitching&&(pitcherFilterTeam==='all'||p.teamKey===pitcherFilterTeam)&&(!pitcherSearch||p.name.includes(pitcherSearch)));return list.sort((a,b)=>{if(pitcherSortBy==='NAME')return a.name.localeCompare(b.name,'zh-Hant');const av=pitchStat(a,pitcherSortBy),bv=pitchStat(b,pitcherSortBy),asc=pitcherSortBy==='ERA'||pitcherSortBy==='WHIP';if(av==null&&bv!=null)return 1;if(av!=null&&bv==null)return-1;if(av==null&&bv==null)return a.name.localeCompare(b.name,'zh-Hant');return(asc?av-bv:bv-av)||a.name.localeCompare(b.name,'zh-Hant')})}
function renderPitchRoleTabs(){if(!$('pitchRoleTabs'))return;$('pitchRoleTabs').innerHTML=pitchRoleDefs.map(([key,label])=>{const id=pitchRoleId(key),p=players.find(x=>playerId(x)===id),s=p?.pitching||{};return`<button class="pitch-role ${activePitchRole===key?'active':''}" data-prole="${key}"><span class="role">${label}</span><strong>${p?.name||'尚未選擇'}</strong><div class="mini">${p?`ERA ${s.ERA??'—'}・WHIP ${s.WHIP??'—'}`:'點此選角色'}</div></button>`}).join('');qsa('[data-prole]').forEach(b=>b.onclick=()=>{activePitchRole=b.dataset.prole;renderPitchRoleTabs();renderPitcherPool()})}
function assignPitcher(id){const old=pitchRoleId(activePitchRole),prev=pitchRoleKeyById(id);if(prev&&prev!==activePitchRole)setPitchRoleId(prev,old);setPitchRoleId(activePitchRole,id);saveCfg();renderConfig();updateStartState()}
function renderPitcherPool(){if(!$('pitcherPool'))return;const list=visiblePitchers();$('pitcherPool').innerHTML=list.length?list.map(p=>{const s=p.pitching||{},id=playerId(p),role=pitchRoleKeyById(id),roleText=role?staffRole(id):'',active=id===pitchRoleId(activePitchRole);return`<button class="player pitcher-card ${role?'selected':''} ${active?'target':''}" data-pitchid="${id}">${role?`<span class="role-mark">${roleText}</span>`:''}<strong>${p.name}</strong><div class="team">${p.teamName}</div><div class="numbers"><span>ERA<b>${s.ERA??'—'}</b></span><span>WHIP<b>${s.WHIP??'—'}</b></span><span>IP<b>${s.IP??'—'}</b></span></div><div class="pitch-extra">K ${s.K??0}・${s.W??0}-${s.L??0}・SV ${s.SV??0}・HLD ${s.HLD??0}</div></button>`}).join(''):'<div class="loading">沒有符合條件的投手</div>';qsa('[data-pitchid]').forEach(b=>b.onclick=()=>assignPitcher(b.dataset.pitchid))}
$('pitcherSearchInput').oninput=e=>{pitcherSearch=e.target.value.trim();renderPitcherPool()};$('pitcherSortSelect').onchange=e=>{pitcherSortBy=e.target.value;renderPitcherPool()};
function starterScore(p)'''
if old_events not in text: raise SystemExit('events insertion target missing')
text = text.replace(old_events, new_events, 1)

old_tail = "renderParkInfo();renderSoundToggle();saveCfg();updateStartState()}"
new_tail = "renderParkInfo();renderSoundToggle();renderPitchRoleTabs();renderPitcherPool();saveCfg();updateStartState()}"
if old_tail not in text: raise SystemExit('renderConfig tail missing')
text = text.replace(old_tail, new_tail, 1)

old_info = "function pitcherInfoText(id){const p=players.find(x=>playerId(x)===id);if(!p)return'';const role=staffRole(id),r=roleAdjustedPitcherRatings(p,role,0);return`${roleTrait(role)}｜${p.teamName}｜OVR ${r.overall}｜球速 ${r.velo}・控球 ${r.control}・變化 ${r.break}・耐力 ${r.stamina}`}"
new_info = "function pitcherInfoText(id){const p=players.find(x=>playerId(x)===id);if(!p)return'';const role=staffRole(id),r=roleAdjustedPitcherRatings(p,role,0),s=p.pitching||{};return`${roleTrait(role)}｜${p.teamName}｜ERA ${s.ERA??'—'}・WHIP ${s.WHIP??'—'}・IP ${s.IP??'—'}｜OVR ${r.overall}`}"
if old_info in text:text=text.replace(old_info,new_info,1)

path.write_text(text,encoding='utf-8')
print('Added searchable sortable pitcher pool with ERA/WHIP/IP/K/W/SV/HLD.')
