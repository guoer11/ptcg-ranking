from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')

old_core = """function makePitcherState(p){return{player:p,pitches:0,innings:0}}
function currentPitcherRatings(state){return pitcherRatings(state.player)}
function pitcherFatigue(state){const r=currentPitcherRatings(state);return clamp((state.pitches-r.stamina*.82)/(r.stamina*.95),0,1)}"""
new_core = """function roleAdjustedPitcherRatings(p,role='投手',pitches=0){const b=pitcherRatings(p);let velo=b.velo,control=b.control,brk=b.break,stamina=b.stamina;if(role==='先發'){velo-=1;control+=2;brk+=1;stamina+=12}else if(role.startsWith('中繼')){const fresh=pitches<=30;velo+=fresh?3:1;control+=fresh?4:1;brk+=fresh?3:1;stamina-=8}else if(role==='後援／終結者'){const fresh=pitches<=25;velo+=fresh?6:2;control+=fresh?2:-1;brk+=fresh?6:2;stamina-=18}velo=clamp(Math.round(velo),45,99);control=clamp(Math.round(control),40,99);brk=clamp(Math.round(brk),40,99);stamina=clamp(Math.round(stamina),35,99);const overall=Math.round((velo+control+brk+stamina*.72)/3.72);return{...b,velo,control,break:brk,stamina,overall}}
function makePitcherState(p){const role=staffRole(playerId(p));return{player:p,pitches:0,innings:0,role}}
function currentPitcherRatings(state){return roleAdjustedPitcherRatings(state.player,state.role||staffRole(playerId(state.player)),state.pitches||0)}
function pitcherFatigue(state){const r=currentPitcherRatings(state),role=state.role||'';const raw=(state.pitches-r.stamina*.82)/(r.stamina*.95),pace=role==='先發'?.82:role.startsWith('中繼')?1.05:role==='後援／終結者'?1.18:1;return clamp(raw*pace,0,1)}"""
if old_core not in text:
    raise SystemExit('pitcher core target not found')
text = text.replace(old_core, new_core, 1)

old_info = """function pitcherInfoText(id){const p=players.find(x=>playerId(x)===id);if(!p)return'';const r=pitcherRatings(p);return`${p.teamName}｜OVR ${r.overall}｜球速 ${r.velo}・控球 ${r.control}・變化 ${r.break}・耐力 ${r.stamina}`}"""
new_info = """function roleTrait(role){if(role==='先發')return'耐投型：疲勞較慢';if(role.startsWith('中繼'))return'短局型：前30球球威／控球提升';if(role==='後援／終結者')return'終結型：前25球球速／變化大幅提升';return'一般投手'}
function pitcherInfoText(id){const p=players.find(x=>playerId(x)===id);if(!p)return'';const role=staffRole(id),r=roleAdjustedPitcherRatings(p,role,0);return`${roleTrait(role)}｜${p.teamName}｜OVR ${r.overall}｜球速 ${r.velo}・控球 ${r.control}・變化 ${r.break}・耐力 ${r.stamina}`}"""
if old_info not in text:
    raise SystemExit('pitcher info target not found')
text = text.replace(old_info, new_info, 1)

text = text.replace("$('startGameBtn').textContent=ok?'開始 9 局比賽':lineup.length!==9?'選滿 9 人後開始比賽':'完成守位與先發投手設定'", "$('startGameBtn').textContent=ok?'開始 9 局比賽':lineup.length!==9?'選滿 9 人後開始比賽':'完成守位與投手群設定'", 1)
text = text.replace("$('lineupError').textContent='請先選滿 9 人、完成 9 個不同守位並選擇先發投手。'", "$('lineupError').textContent='請先選滿 9 人、完成 9 個不同守位，並選好 1 位先發、3 位中繼與 1 位終結者。'", 1)

old_note = "AVG／OBP／SLG／OPS 使用 2026 球季資料；SPD／DEF 與投手球速、控球、變化球、耐力為遊戲能力值，用來讓不同球員在遊戲中有穩定差異，並非聯盟官方評分。"
new_note = "AVG／OBP／SLG／OPS 使用 2026 球季資料；SPD／DEF 與投手球速、控球、變化球、耐力為遊戲能力值，並依先發／中繼／終結角色套用不同疲勞與短局加成，並非聯盟官方評分。"
if old_note in text:
    text = text.replace(old_note, new_note, 1)

path.write_text(text, encoding='utf-8')
print('Pitcher roles tuned: starter endurance, reliever short-stint stability, closer power.')
