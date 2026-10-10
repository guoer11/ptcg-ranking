from pathlib import Path
import re

index_path = Path("pitching-app/index.html")
sw_path = Path("pitching-app/sw.js")
text = index_path.read_text(encoding="utf-8")

pitch_array = "const pitches = [\n  {id:'four',cat:'fast',name:'四縫線速球',short:'4-Seam Fastball',base:148,sd:5,control:0.92,breakX:0,breakY:-5},\n  {id:'two',cat:'fast',name:'二縫線速球',short:'2-Seam Fastball',base:145,sd:5,control:0.87,breakX:14,breakY:5},\n  {id:'one',cat:'fast',name:'一縫線伸卡',short:'1-Seam Sinker',base:143,sd:5,control:0.80,breakX:17,breakY:13},\n  {id:'sinker',cat:'fast',name:'伸卡球',short:'Sinker',base:144,sd:5,control:0.84,breakX:18,breakY:16},\n  {id:'cutter',cat:'fast',name:'卡特球',short:'Cutter',base:140,sd:4,control:0.87,breakX:-12,breakY:3},\n  {id:'running',cat:'fast',name:'跑動速球',short:'Running Fastball',base:145,sd:5,control:0.82,breakX:19,breakY:3},\n  {id:'riding',cat:'fast',name:'上竄速球',short:'Riding Fastball',base:149,sd:5,control:0.84,breakX:-2,breakY:-13},\n  {id:'heavy',cat:'fast',name:'重球速球',short:'Heavy Fastball',base:146,sd:5,control:0.84,breakX:8,breakY:10},\n  {id:'slider',cat:'slider',name:'滑球',short:'Slider',base:134,sd:5,control:0.79,breakX:-24,breakY:14},\n  {id:'sweeper',cat:'slider',name:'橫掃滑球',short:'Sweeper',base:129,sd:5,control:0.72,breakX:-39,breakY:10},\n  {id:'gyroSlider',cat:'slider',name:'陀螺滑球',short:'Gyro Slider',base:133,sd:5,control:0.75,breakX:-8,breakY:23},\n  {id:'powerSlider',cat:'slider',name:'高速滑球',short:'Power Slider',base:138,sd:4,control:0.76,breakX:-19,breakY:11},\n  {id:'slurve',cat:'slider',name:'滑曲球',short:'Slurve',base:126,sd:5,control:0.73,breakX:-28,breakY:26},\n  {id:'frisbee',cat:'slider',name:'飛盤滑球',short:'Frisbee Slider',base:126,sd:5,control:0.68,breakX:-43,breakY:6},\n  {id:'curve',cat:'curve',name:'曲球',short:'Curveball',base:121,sd:6,control:0.75,breakX:-11,breakY:35},\n  {id:'twelveSix',cat:'curve',name:'12–6 曲球',short:'12–6 Curve',base:119,sd:6,control:0.71,breakX:0,breakY:43},\n  {id:'knuckleCurve',cat:'curve',name:'彈指曲球',short:'Knuckle Curve',base:124,sd:5,control:0.74,breakX:-9,breakY:38},\n  {id:'spikeCurve',cat:'curve',name:'Spike 曲球',short:'Spike Curve',base:123,sd:5,control:0.72,breakX:-8,breakY:40},\n  {id:'powerCurve',cat:'curve',name:'高速曲球',short:'Power Curve',base:128,sd:5,control:0.75,breakX:-10,breakY:31},\n  {id:'slowCurve',cat:'curve',name:'慢速曲球',short:'Slow Curve',base:108,sd:7,control:0.67,breakX:-14,breakY:46},\n  {id:'sweepCurve',cat:'curve',name:'橫掃曲球',short:'Sweeping Curve',base:117,sd:6,control:0.68,breakX:-28,breakY:33},\n  {id:'change',cat:'change',name:'變速球',short:'Changeup',base:128,sd:5,control:0.84,breakX:10,breakY:19},\n  {id:'straightChange',cat:'change',name:'直線變速球',short:'Straight Change',base:127,sd:5,control:0.86,breakX:3,breakY:18},\n  {id:'circle',cat:'change',name:'圈指變速球',short:'Circle Change',base:126,sd:5,control:0.82,breakX:18,breakY:23},\n  {id:'vulcan',cat:'change',name:'火神變速球',short:'Vulcan Change',base:125,sd:5,control:0.75,breakX:12,breakY:26},\n  {id:'palm',cat:'change',name:'掌心球',short:'Palmball',base:118,sd:6,control:0.73,breakX:7,breakY:27},\n  {id:'fosh',cat:'change',name:'Fosh 變速球',short:'Fosh Change',base:122,sd:6,control:0.70,breakX:5,breakY:31},\n  {id:'fade',cat:'change',name:'Fade 變速球',short:'Fade Change',base:126,sd:5,control:0.78,breakX:22,breakY:20},\n  {id:'splitChange',cat:'change',name:'分指變速球',short:'Split-Change',base:130,sd:5,control:0.73,breakX:4,breakY:32},\n  {id:'kickChange',cat:'change',name:'Kick Change',short:'Kick Change',base:124,sd:6,control:0.68,breakX:15,breakY:30},\n  {id:'splitter',cat:'drop',name:'快速指叉球',short:'Splitter / SFF',base:136,sd:5,control:0.77,breakX:3,breakY:34},\n  {id:'fork',cat:'drop',name:'指叉球',short:'Forkball',base:129,sd:6,control:0.69,breakX:2,breakY:43},\n  {id:'forkChange',cat:'drop',name:'指叉變速球',short:'Fork Change',base:124,sd:6,control:0.68,breakX:5,breakY:39},\n  {id:'dropCurve',cat:'drop',name:'下墜曲球',short:'Drop Curve',base:116,sd:6,control:0.67,breakX:-5,breakY:48},\n  {id:'splitSinker',cat:'drop',name:'分指伸卡球',short:'Split Sinker',base:134,sd:5,control:0.70,breakX:12,breakY:34},\n  {id:'knuckle',cat:'special',name:'蝴蝶球',short:'Knuckleball',base:108,sd:8,control:0.48,breakX:0,breakY:22},\n  {id:'knuckleChange',cat:'special',name:'彈指變速球',short:'Knuckle Change',base:121,sd:6,control:0.64,breakX:7,breakY:29},\n  {id:'screw',cat:'special',name:'螺旋球',short:'Screwball',base:123,sd:6,control:0.66,breakX:27,breakY:30},\n  {id:'shuuto',cat:'special',name:'噴射球',short:'Shuuto',base:137,sd:5,control:0.76,breakX:24,breakY:10},\n  {id:'gyro',cat:'special',name:'陀螺球',short:'Gyroball',base:138,sd:5,control:0.70,breakX:-3,breakY:18},\n  {id:'eephus',cat:'special',name:'小便球／超慢曲球',short:'Eephus',base:75,sd:7,control:0.62,breakX:2,breakY:52},\n  {id:'screwChange',cat:'special',name:'反向變速球',short:'Screw Change',base:119,sd:6,control:0.63,breakX:31,breakY:30},\n  {id:'spitball',cat:'special',name:'口水球（歷史禁用）',short:'Spitball · Historical',base:126,sd:7,control:0.58,breakX:18,breakY:31},\n  {id:'scuffball',cat:'special',name:'磨球（歷史禁用）',short:'Scuffball · Historical',base:124,sd:7,control:0.55,breakX:-27,breakY:27},\n  {id:'emory',cat:'special',name:'砂紙球（歷史禁用）',short:'Emery Ball · Historical',base:123,sd:7,control:0.54,breakX:23,breakY:35},\n];"

new_text, n = re.subn(
    r"const pitches = \[.*?\n\];\nlet state =",
    pitch_array + "\nlet state =",
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit("Could not replace pitching-app pitch array")

html_old = '    <div class="pitchRow" id="pitchRow"></div>'
html_new = '    <div class="pitchTools">\n      <select id="pitchCategory" class="pitchSelect" aria-label="球種分類">\n        <option value="all">全部球種</option>\n        <option value="fast">速球系</option>\n        <option value="slider">滑球系</option>\n        <option value="curve">曲球系</option>\n        <option value="change">變速球系</option>\n        <option value="drop">下墜系</option>\n        <option value="special">特殊／歷史球種</option>\n      </select>\n      <span id="pitchCountLabel">45 種球路</span>\n    </div>\n    <div class="pitchRow" id="pitchRow"></div>'
if html_old not in new_text:
    raise SystemExit("Could not find pitch row HTML")
new_text = new_text.replace(html_old, html_new, 1)

css_anchor = '    .pitchRow{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}'
css_new = '    .pitchTools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}\n    .pitchSelect{min-width:132px;border:1px solid var(--line);background:#122238;color:var(--text);border-radius:11px;padding:8px 10px;font-size:12px;font-weight:700}\n    #pitchCountLabel{font-size:10px;color:var(--muted);white-space:nowrap}\n    .pitchRow{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}'
if css_anchor not in new_text:
    raise SystemExit("Could not find pitch row CSS")
new_text = new_text.replace(css_anchor, css_new, 1)

render_pattern = r"function renderPitches\(\)\{.*?\n\}\nfunction updateStats\(\)\{"
render_replacement = "function renderPitches(){\n  pitchRow.innerHTML='';\n  const category = $('#pitchCategory') ? $('#pitchCategory').value : 'all';\n  const visible = category === 'all' ? pitches : pitches.filter(p=>p.cat===category);\n  if($('#pitchCountLabel')) $('#pitchCountLabel').textContent = `${visible.length} / ${pitches.length} 種球路`;\n  visible.forEach(p=>{\n    let b=document.createElement('button');\n    b.className='pitch'+(p.id===selected.id?' active':'');\n    b.innerHTML=`<strong>${p.name}</strong><span>${p.short}</span>`;\n    b.onclick=()=>{\n      if(throwing)return;\n      selected=p;\n      renderPitches();\n      resultSub.textContent=`${p.name}｜預估 ${p.base-p.sd}–${p.base+p.sd} km/h`;\n    };\n    pitchRow.appendChild(b);\n  });\n}\nfunction updateStats(){"
new_text, n = re.subn(render_pattern, render_replacement, new_text, count=1, flags=re.S)
if n != 1:
    raise SystemExit("Could not replace renderPitches")

init_old = "renderZone();renderPitches();updateStats();"
init_new = "if($('#pitchCategory')) $('#pitchCategory').onchange=renderPitches;renderZone();renderPitches();updateStats();"
if init_old not in new_text:
    raise SystemExit("Could not find initialization")
new_text = new_text.replace(init_old, init_new, 1)

help_old = "不同球種的球速、控球與位移都不一樣。"
help_new = "目前收錄 45 種球路，包含速球、滑球、曲球、變速、下墜與特殊／歷史球種；不同球種的球速、控球與位移都不一樣。"
new_text = new_text.replace(help_old, help_new, 1)

index_path.write_text(new_text, encoding="utf-8")

sw = sw_path.read_text(encoding="utf-8")
sw = sw.replace("pitch-king-v1", "pitch-king-v2")
sw_path.write_text(sw, encoding="utf-8")
print("Expanded pitching app to 45 pitch types.")
