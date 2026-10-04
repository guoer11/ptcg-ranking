from pathlib import Path

path = Path('baseball-game.html')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        ".mound{position:absolute;left:50%;top:57%;width:70px;height:26px;border-radius:50%;background:#9b6844;transform:translate(-50%,-50%);box-shadow:0 5px 8px rgba(0,0,0,.18)}",
        ".mound{position:absolute;left:50%;top:55%;width:62px;height:23px;border-radius:50%;background:#9b6844;transform:translate(-50%,-50%);box-shadow:0 5px 8px rgba(0,0,0,.18)}",
    ),
    (
        ".pitcher{left:50%;top:53%;width:58px;height:106px;transform:translate(-50%,-50%) scale(.72)}",
        ".pitcher{left:50%;top:49.5%;width:58px;height:106px;transform:translate(-50%,-50%) scale(.62)}",
    ),
    (
        "@keyframes windup{0%{transform:translate(-50%,-50%) scale(.72)}45%{transform:translate(-50%,-50%) scale(.72) rotate(-6deg)}70%{transform:translate(-50%,-50%) scale(.72) translateY(-4px)}100%{transform:translate(-50%,-50%) scale(.72)}}",
        "@keyframes windup{0%{transform:translate(-50%,-50%) scale(.62)}45%{transform:translate(-50%,-50%) scale(.62) rotate(-6deg)}70%{transform:translate(-50%,-50%) scale(.62) translateY(-4px)}100%{transform:translate(-50%,-50%) scale(.62)}}",
    ),
    (
        "@keyframes release{0%{transform:translate(-50%,-50%) scale(.72) rotate(0)}60%{transform:translate(-50%,-50%) scale(.72) rotate(10deg) translateX(3px)}100%{transform:translate(-50%,-50%) scale(.72)}}",
        "@keyframes release{0%{transform:translate(-50%,-50%) scale(.62) rotate(0)}60%{transform:translate(-50%,-50%) scale(.62) rotate(10deg) translateX(3px)}100%{transform:translate(-50%,-50%) scale(.62)}}",
    ),
    (
        "#ball{position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0 36%,#eee9e0 70%,#d3cec3 100%);display:none;z-index:22;box-shadow:0 2px 5px #0008}",
        "#ball{position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0 36%,#eee9e0 70%,#d3cec3 100%);display:none;z-index:22;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 2px 6px #0009}",
    ),
    (
        "pitchStart=performance.now();pitching=true;",
        "pitchStart=0;pitching=true;",
    ),
    (
        "timer=setTimeout(()=>{pitcher.classList.remove('windup');pitcher.classList.add('release');$('ball').style.display='block';raf=requestAnimationFrame(animatePitch)},430)",
        "timer=setTimeout(()=>{pitcher.classList.remove('windup');pitcher.classList.add('release');pitchStart=performance.now();$('ball').style.display='block';raf=requestAnimationFrame(animatePitch)},430)",
    ),
    (
        "sx=f.width*.5,sy=f.height*.53",
        "sx=f.width*.5,sy=f.height*.48",
    ),
    (
        "scale=.42+ease*1.16",
        "scale=.58+ease*1.00",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Target not found; refusing partial patch: {old[:80]}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Fixed pitch visibility: full release-to-plate timing, farther pitcher, longer visible path, larger initial ball.')
