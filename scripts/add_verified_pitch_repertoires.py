from pathlib import Path
p=Path("baseball-game.html")
s=p.read_text()
old="""const knownPitchRepertoires={
'羅戈':['FF','CU','CH','SL','CT'],
'飛力獅':['FF','SL','CH','SI','CU','FS','CT'],
'徐若熙':['FF','CH','CU','SL','CT'],
'王尉永':['FF','SL','FS'],
'林暉盛':['FF','CU','CH','SL']
};"""
new="""const knownPitchRepertoires={
'羅戈':['FF','CU','CH','SL','CT'],
'飛力獅':['FF','SL','CH','SI','CU','FS','CT'],
'徐若熙':['FF','CH','CU','SL','CT'],
'王尉永':['FF','SL','FS'],
'林暉盛':['FF','CU','CH','SL'],
'陳冠宇':['FF','SL','CH','CU'],
'威能帝':['FF','SL','CH','CU'],
'高塩將樹':['FF','FS','SL','CU'],
'魔力藍':['FF','CT','SL','CH'],
'張奕':['FF','CT','SL','FS'],
'李東洺':['FF','CT','SL','CH'],
'朱承洋':['FF','SL','CH'],
'黃子鵬':['SI','SL','CH','CU'],
'陳柏清':['FF','SL','CH','CU'],
'布雷克':['FF','SL','CH','CU'],
'鋼龍':['FF','CU','SL','CH'],
'德保拉':['FF','CU','SL','CH'],
'魏碩成':['FF','FS','CH','CU'],
'林詩翔':['FF','CH','SL'],
'李博登':['FF','CH','SL','CU'],
'波賽樂':['FF','CH','SL','CU'],
'力亞士':['FF','CH','SL','CU']
};"""
if old not in s: raise SystemExit("known repertoire block not found")
s=s.replace(old,new)
p.write_text(s)
