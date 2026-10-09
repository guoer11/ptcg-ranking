from pathlib import Path
p=Path('baseball-game.html')
s=p.read_text(encoding='utf-8')
marker='/* ===== V209 RESULT SAFE AREA ===== */'
if marker in s:
    print('v209 already applied')
    raise SystemExit(0)
css=r'''

/* ===== V209 RESULT SAFE AREA ===== */
/* Keep the previous plate-appearance result readable above the pitch selector. */
#gameApp.pitch-ui-top #scene > .message{
  top:82px!important;
  z-index:96!important;
  width:92%!important;
  padding:0 8px!important;
}
#gameApp.pitch-ui-top #scene > .message strong{
  font-size:clamp(22px,6.5vw,30px)!important;
  line-height:1.05!important;
}
#gameApp.pitch-ui-top #scene > .message span{
  display:block!important;
  margin-top:3px!important;
  font-size:12px!important;
}
#gameApp.pitch-ui-top #scene > .pitch-mode-panel{
  top:150px!important;
  z-index:86!important;
}
@media (orientation:landscape){
  #gameApp.pitch-ui-top #scene > .message{top:34px!important;width:72%!important}
  #gameApp.pitch-ui-top #scene > .message strong{font-size:20px!important}
  #gameApp.pitch-ui-top #scene > .pitch-mode-panel{top:82px!important}
}
'''
if '</style>' not in s:
    raise SystemExit('style end not found')
s=s.replace('</style>',css+'\n</style>',1)
p.write_text(s,encoding='utf-8')
print('applied v209')
