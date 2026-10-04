from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')

anchor = "function pitchStat(p,key){const s=p?.pitching||{};if(key==='IP')return num(s.IP_outs)||0;if(key==='NAME')return p.name;return num(s[key])}\n"
insert = anchor + "function pitcherUsageRole(s){const g=num(s?.G)||0,gs=num(s?.GS)||0,gf=num(s?.GF)||0,sv=num(s?.SV)||0,hld=num(s?.HLD)||0;if(g&&(gs>=5||gs/g>=.45))return'先發';if(g&&(sv>=3||(sv>=1&&gf/g>=.45)))return'終結者';if(hld>=2)return'中繼';return'後援'}\n"
if "function pitcherUsageRole(s)" not in text:
    if anchor not in text:
        raise SystemExit('pitchStat anchor not found')
    text = text.replace(anchor, insert, 1)

old = "<strong>${p.name}</strong><div class=\"team\">${p.teamName}</div><div class=\"numbers\"><span>ERA<b>${s.ERA??'—'}</b></span><span>WHIP<b>${s.WHIP??'—'}</b></span><span>IP<b>${s.IP??'—'}</b></span></div><div class=\"pitch-extra\">K ${s.K??0}・${s.W??0}-${s.L??0}・SV ${s.SV??0}・HLD ${s.HLD??0}</div>"
new = "<strong>${p.name} <span class=\"ability-chip\">${pitcherUsageRole(s)}</span></strong><div class=\"team\">${p.teamName}</div><div class=\"numbers\"><span>ERA<b>${s.ERA??'—'}</b></span><span>WHIP<b>${s.WHIP??'—'}</b></span><span>IP<b>${s.IP??'—'}</b></span></div><div class=\"pitch-extra\">K ${s.K??0}・${s.W??0}-${s.L??0}・SV ${s.SV??0}・HLD ${s.HLD??0}</div>"
if old not in text:
    if new not in text:
        raise SystemExit('pitcher card target not found')
else:
    text = text.replace(old, new, 1)

old_note = "ERA、WHIP、IP、K、W-L、SV、HLD 為 2026 一軍投球成績整理；球速、控球、變化球、耐力仍是遊戲能力值。投手池只顯示有一軍登板紀錄的投手。"
new_note = "ERA、WHIP、IP、K、W-L、SV、HLD 為 2026 一軍投球成績整理；名字旁的先發／中繼／後援／終結者依 2026 登板型態與 GS、GF、SV、HLD 判定。球速、控球、變化球、耐力仍是遊戲能力值。"
if old_note in text:
    text = text.replace(old_note, new_note, 1)

path.write_text(text, encoding='utf-8')
print('Added pitcher usage-role labels to pitcher cards.')
