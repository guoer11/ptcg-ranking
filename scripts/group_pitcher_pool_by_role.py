from pathlib import Path

path = Path('baseball-game.html')
lines = path.read_text(encoding='utf-8').splitlines()

visible = "function visiblePitchers(){let list=players.filter(p=>p.pitching&&!lineup.some(x=>playerId(x)===playerId(p))&&(pitcherFilterTeam==='all'||p.teamKey===pitcherFilterTeam)&&(!pitcherSearch||p.name.includes(pitcherSearch)));const rank={'先發':0,'中繼':1,'後援':2,'終結者':3};return list.sort((a,b)=>{const ar=rank[pitcherUsageRole(a.pitching)]??9,br=rank[pitcherUsageRole(b.pitching)]??9;if(ar!==br)return ar-br;if(pitcherSortBy==='NAME')return a.name.localeCompare(b.name,'zh-Hant');const av=pitchStat(a,pitcherSortBy),bv=pitchStat(b,pitcherSortBy),asc=pitcherSortBy==='ERA'||pitcherSortBy==='WHIP';if(av==null&&bv!=null)return 1;if(av!=null&&bv==null)return-1;if(av==null&&bv==null)return a.name.localeCompare(b.name,'zh-Hant');return(asc?av-bv:bv-av)||a.name.localeCompare(b.name,'zh-Hant')})}"

render = "function renderPitcherPool(){if(!$('pitcherPool'))return;const list=visiblePitchers(),roles=['先發','中繼','後援','終結者'];$('pitcherPool').innerHTML=list.length?roles.map(role=>{const group=list.filter(p=>pitcherUsageRole(p.pitching)===role);if(!group.length)return'';return`<div class=\"pitch-group-title\"><strong>${role}${role==='先發'?'投手':role==='中繼'?'投手':role==='後援'?'投手':''}</strong><span>${group.length} 人</span></div>`+group.map(p=>{const s=p.pitching||{},id=playerId(p),assigned=pitchRoleKeyById(id),roleText=assigned?staffRole(id):'',active=id===pitchRoleId(activePitchRole);return`<button class=\"player pitcher-card ${assigned?'selected':''} ${active?'target':''}\" data-pitchid=\"${id}\">${assigned?`<span class=\"role-mark\">${roleText}</span>`:''}<strong>${p.name} <span class=\"ability-chip\">${pitcherUsageRole(s)}</span></strong><div class=\"team\">${p.teamName}</div><div class=\"numbers\"><span>ERA<b>${s.ERA??'—'}</b></span><span>WHIP<b>${s.WHIP??'—'}</b></span><span>IP<b>${s.IP??'—'}</b></span></div><div class=\"pitch-extra\">K ${s.K??0}・${s.W??0}-${s.L??0}・SV ${s.SV??0}・HLD ${s.HLD??0}</div></button>`}).join('')}).join(''):'<div class=\"loading\">沒有符合條件的投手</div>';qsa('[data-pitchid]').forEach(b=>b.onclick=()=>assignPitcher(b.dataset.pitchid))}"

found_visible = found_render = False
for i, line in enumerate(lines):
    if line.startswith('function visiblePitchers(){'):
        lines[i] = visible
        found_visible = True
    elif line.startswith('function renderPitcherPool(){'):
        lines[i] = render
        found_render = True

if not found_visible or not found_render:
    raise SystemExit(f'targets missing visible={found_visible} render={found_render}')

css = ".pitch-group-title{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 1px;padding:9px 10px;border-radius:11px;background:#173b3c;border-left:4px solid #ffd052}.pitch-group-title strong{font-size:14px;color:#ffe083}.pitch-group-title span{font-size:11px;color:#a9bdb8}"
if css not in lines:
    for i, line in enumerate(lines):
        if line.strip() == '/* ===== V6 full baseball systems ===== */':
            lines.insert(i, css)
            break

path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('Grouped pitcher pool by usage role.')
