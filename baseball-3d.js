/* 中職九局棒球・互動 3D 實戰場景 v3.0
 * Browser-rendered WebGL (Three.js). Game rules and hit registration stay in baseball-game.html.
 * 3D runs only after the renderer is ready; the existing game remains a safe fallback.
 */
(async () => {
  'use strict';
  const game = document.getElementById('gameApp');
  const stage = document.getElementById('scene');
  if (!game || !stage) return;
  let T = null;
  for (const url of [
    'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
    'https://unpkg.com/three@0.170.0/build/three.module.js'
  ]) {
    try { T = await import(url); break; } catch (err) { console.warn('3D module source unavailable', url, err); }
  }
  if (!T) { console.warn('3D renderer unavailable; retaining playable 2D fallback.'); return; }

  const c = (hex) => new T.Color(hex);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI;
  const scene = new T.Scene();
  scene.background = c(0x8ac8f0);
  scene.fog = new T.Fog(0x9fd0ee, 105, 220);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.className = 'baseball-3d-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.pointerEvents = 'none';
    stage.prepend(renderer.domElement);
  } catch (err) {
    console.error('Could not start 3D baseball scene', err);
    return;
  }

  const camera = new T.PerspectiveCamera(58, 2, 0.08, 300);
  const ambient = new T.HemisphereLight(0xd8f2ff, 0x476142, 2.1);
  scene.add(ambient);
  const sun = new T.DirectionalLight(0xfff5de, 3.1);
  sun.position.set(-25, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 145;
  sun.shadow.bias = -0.0001;
  scene.add(sun);
  const mat = (color, roughness = .82, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const grass = mat(0x368047);
  const grassAlt = mat(0x438e4f);
  const clay = mat(0xb8794d);
  const white = mat(0xfffcf0);
  const wallMat = mat(0x1a483b);
  const concrete = mat(0x72868a);
  const blue = mat(0x1e3758);
  const skin = mat(0xc68a63);
  const leather = mat(0x42291f);
  const mesh = (geom, material, cast = true) => {
    const m = new T.Mesh(geom, material);
    m.castShadow = cast; m.receiveShadow = true;
    return m;
  };
  const sphere = (r, material, ws = 16, hs = 12) => mesh(new T.SphereGeometry(r, ws, hs), material);
  const cube = (w, h, d, material) => mesh(new T.BoxGeometry(w, h, d), material);
  const cyl = (rt, rb, h, material, n = 16) => mesh(new T.CylinderGeometry(rt, rb, h, n), material);
  const put = (parent, obj, x = 0, y = 0, z = 0) => {
    obj.position.set(x, y, z);
    parent.add(obj);
    return obj;
  };
  const line = (a, b, width, material) => {
    const v = new T.Vector3(...a), w = new T.Vector3(...b);
    const d = w.clone().sub(v);
    const o = mesh(new T.CylinderGeometry(width, width, d.length(), 8), material, false);
    o.position.copy(v.add(w).multiplyScalar(.5));
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    scene.add(o);
    return o;
  };
  function seeded(seed) {
    return () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }
  const rand = seeded(20261122);

  // Turf, cut grass stripes, clay infield and exact 90-foot basepaths.
  const turf = mesh(new T.PlaneGeometry(280, 280), grass, false);
  turf.rotation.x = -PI / 2;
  turf.position.set(0, -.07, -45);
  turf.receiveShadow = true;
  scene.add(turf);
  for (let x = -108; x < 109; x += 12) {
    const stripe = mesh(new T.PlaneGeometry(6, 210), grassAlt, false);
    stripe.rotation.x = -PI / 2;
    stripe.position.set(x, -.059, -48);
    stripe.receiveShadow = true;
    scene.add(stripe);
  }
  function groundPoly(points, material, y) {
    const shape = new T.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(p => shape.lineTo(p[0], p[1]));
    shape.closePath();
    const obj = mesh(new T.ShapeGeometry(shape), material, false);
    obj.rotation.x = -PI / 2;
    obj.position.y = y;
    obj.receiveShadow = true;
    scene.add(obj);
    return obj;
  }
  groundPoly([[0, -3], [23, 19.4], [0, 42], [-23, 19.4]], clay, -.045);
  groundPoly([[0, 7.5], [13.5, 19.4], [0, 32], [-13.5, 19.4]], grass, -.034);
  // Mound and home plate.
  const mound = mesh(new T.CylinderGeometry(2.75, 3.05, .22, 44), clay, false);
  mound.position.set(0, .04, -18.4);
  scene.add(mound);
  const rubber = put(scene, cube(.85, .035, .17, white), 0, .18, -18.5);
  rubber.castShadow = false;
  const home = groundPoly([[-.36, -.18], [.36, -.18], [.36, .16], [0, .5], [-.36, .16]], white, -.01);
  function base(x, z) {
    const b = cube(.73, .085, .73, white);
    b.rotation.y = PI / 4;
    put(scene, b, x, .01, z);
  }
  base(19.4, -19.4); base(0, -38.8); base(-19.4, -19.4);
  line([0, .025, 0], [78, .025, -78], .055, white);
  line([0, .025, 0], [-78, .025, -78], .055, white);
  const battingCircle = mesh(new T.RingGeometry(1.9, 1.96, 48, 1, PI*.2, PI*.64), white, false);
  battingCircle.rotation.x = -PI / 2;
  battingCircle.position.set(1.25, .002, 0);
  scene.add(battingCircle);
  for (const x of [-.68, .68]) {
    line([x, .015, -.7], [x, .015, 1.25], .025, white);
  }

  // Low, real 3D outfield fence, grandstands, individual seats and light towers.
  const crowdColours = [0xe7e9ee, 0xb7c0d3, 0x294a71, 0xf9d178, 0xc86b57, 0x385f79, 0xe1e8d9];
  const fenceRadius = 86;
  const walls = new T.Group();
  scene.add(walls);
  for (let j = 0; j < 80; j++) {
    const a = -1.22 + (2.44 * j / 80);
    const b = -1.22 + (2.44 * (j+1) / 80);
    const shape = new T.BufferGeometry();
    const xa = Math.sin(a)*fenceRadius, za = -Math.cos(a)*fenceRadius;
    const xb = Math.sin(b)*fenceRadius, zb = -Math.cos(b)*fenceRadius;
    shape.setAttribute('position', new T.Float32BufferAttribute([
      xa, 0, za, xb, 0, zb, xa, 4.2, za,
      xb, 0, zb, xb, 4.2, zb, xa, 4.2, za
    ], 3));
    shape.computeVertexNormals();
    const panel = mesh(shape, wallMat, false);
    panel.material.side = T.DoubleSide;
    walls.add(panel);
    if (j % 8 === 0) {
      const column = cyl(.16, .18, 4.25, concrete, 8);
      column.position.set(xa, 2.12, za);
      walls.add(column);
    }
  }
  function signTexture(text, bg, fg = '#ffffff') {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = fg; g.font = 'bold 100px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 512, 127, 990);
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  const adverts = [
    ['CPBL • BASEBALL', '#184566'],
    ['九局實戰', '#bd471d'],
    ['HOME RUN', '#162b56'],
    ['TAIWAN BASEBALL', '#28735c'],
    ['2026 SEASON', '#a8641b']
  ];
  for (let k = 0; k < adverts.length; k++) {
    const a = -.96 + k * .48;
    const pane = mesh(new T.PlaneGeometry(14, 2.6),
      new T.MeshBasicMaterial({ map:signTexture(...adverts[k]), side:T.DoubleSide }), false);
    pane.position.set(Math.sin(a)*85.6, 2.25, -Math.cos(a)*85.6);
    pane.rotation.y = -a;
    scene.add(pane);
  }
  for (let row = 0; row < 12; row++) {
    const R = 88 + row * 2.25;
    const standMat = row % 2 ? mat(0x71858e) : mat(0x87939b);
    for (let j = 0; j < 63; j++) {
      const a = -1.26 + j * (2.52/62);
      const x = Math.sin(a)*R, z = -Math.cos(a)*R;
      const seat = cube(3.25, .35, 2.18, standMat);
      seat.position.set(x, 3.6 + row*.49, z);
      seat.rotation.y = -a;
      seat.castShadow = false;
      scene.add(seat);
    }
  }
  const spectators = new T.InstancedMesh(
    new T.SphereGeometry(.23, 6, 5),
    new T.MeshLambertMaterial({color:0xffffff}),
    1550
  );
  spectators.frustumCulled = false;
  const dummy = new T.Object3D();
  for (let i = 0; i < 1550; i++) {
    const a = -1.24 + rand()*2.48;
    const row = Math.floor(rand()*12);
    const radius = 88.5 + row*2.25;
    dummy.position.set(Math.sin(a)*radius, 4.1+row*.49, -Math.cos(a)*radius);
    dummy.scale.set(.7+rand()*.8, .9+rand()*.7, .7+rand()*.8);
    dummy.updateMatrix();
    spectators.setMatrixAt(i,dummy.matrix);
    spectators.setColorAt(i,c(crowdColours[Math.floor(rand()*crowdColours.length)]));
  }
  spectators.instanceMatrix.needsUpdate = true;
  if (spectators.instanceColor) spectators.instanceColor.needsUpdate = true;
  scene.add(spectators);
  function lightTower(x,z) {
    const pole = cyl(.25, .36, 22, concrete, 12);
    pole.position.set(x,11,z); scene.add(pole);
    const frame = cube(12, 3, .8, concrete);
    frame.position.set(x,22,z); scene.add(frame);
    for (let i=-5;i<=5;i+=2) {
      const bulb = cube(1.5, 2.1, .33, mat(0xf7f7e7, .32));
      bulb.position.set(x+i,22,z+.65); scene.add(bulb);
    }
  }
  lightTower(-76,-46); lightTower(76,-46);
  const boardStand = cube(23, 10, 1.2, blue);
  boardStand.position.set(0,11,-94); scene.add(boardStand);
  const mainBoard = mesh(new T.PlaneGeometry(21.5, 8),
    new T.MeshBasicMaterial({ map: signTexture('中職九局 3D 實戰', '#102834'), side:T.DoubleSide }), false);
  mainBoard.position.set(0,11,-93.25);
  scene.add(mainBoard);
  for (let i of [-8,8]) {
    put(scene,cube(.65,8,.65,concrete),i,3.2,-94);
  }

  // Fully volumetric uniformed baseball athlete: jersey, articulated arms,
  // 2-piece legs, hands, helmet, face, glove, bat and cleats (no 2D figures).
  const teamColors = {
    '兄弟':0xf2c735,'統一':0xf47c24,'樂天':0xa93c47,
    '味全':0xca4442,'富邦':0x2e61a2,'台鋼':0x297866,
    'STAR':0xf7f7f4
  };
  function makePlayer(jerseyHex, number, style='fielder') {
    const root = new T.Group(), torso = new T.Group();
    root.userData = { number, torso };
    const jersey = mat(jerseyHex, .82);
    const capMat = mat(style==='batter'?0x17273d:0x1a3046, .58);
    const pants = mat(0xe7e9e8);
    const trim = mat(style==='pitcher'?0xd5b54a:0x243654);
    const face = mat(0xc68b65);
    const gloveMat = mat(0x61402b, .95);
    const shoes = mat(0x222b37, .72);
    const torsoM = cyl(.40,.34,.82,jersey,20);
    put(torso,torsoM,0,1.34,0);
    const chest = sphere(.39,jersey,18,12);
    chest.scale.set(1.05,.54,.8);
    put(torso,chest,0,1.56,.01);
    put(torso,cyl(.28,.30,.22,trim),0,.93,0);
    const belt = put(torso,cyl(.34,.32,.10,mat(0x273344)),0,.97,0);
    const neckline=put(torso,cyl(.175,.165,.085,trim),0,1.79,0);
    // head + nose + ears + face features
    const head=sphere(.245,face,18,16);
    head.scale.set(.92,1.14,.94);
    put(torso,head,0,2.04,0);
    put(torso,sphere(.076,face),0,1.99,.231);
    for (const side of [-1,1]){
      const eye=sphere(.024,mat(0x212223),8,6);
      put(torso,eye,side*.088,2.084,.209);
      const ear=sphere(.075,face,10,8);
      ear.scale.set(.55,1,.65);
      put(torso,ear,side*.227,2.02,0);
    }
    const hat=put(torso,cyl(.24,.26,.20,capMat,20),0,2.29,0);
    hat.scale.set(1,.8,.97);
    const brim=put(torso,sphere(.30,capMat,20,10),0,2.22,.20);
    brim.scale.set(.92,.12,.68);
    if (style==='batter') {
      const helmet=put(torso,sphere(.266,capMat),0,2.29,-.005);
      helmet.scale.set(1,.65,1.02);
      const earGuard=put(torso,sphere(.13,capMat),-.22,2.08,.045);
      earGuard.scale.set(.4,1,.8);
    }
    const rigs={root,torso,arms:[],legs:[],jersey,cap:capMat,glove:null,bat:null};
    const arms = [];
    for (const side of [-1,1]) {
      const shoulder = new T.Group();
      shoulder.position.set(side*.46,1.62,0);
      torso.add(shoulder);
      const sleeve=cyl(.19,.175,.28,jersey);
      sleeve.rotation.z=side*.1; put(shoulder,sleeve,0,-.17,0);
      const upper=cyl(.16,.13,.37,face);
      upper.rotation.z=side*.06; put(shoulder,upper,0,-.47,0);
      const elbow=put(shoulder,sphere(.133,face),0,-.65,0);
      const forearm=cyl(.13,.095,.38,face);
      put(shoulder,forearm,0,-.84,0);
      const hand=put(shoulder,sphere(.12,face),0,-1.05,0);
      shoulder.rotation.z=side*.28;
      arms.push(shoulder);
      if (side===-1 && style!=='umpire') {
        const mitt=put(shoulder,sphere(.225,gloveMat,16,12),0,-1.03,.09);
        mitt.scale.set(1.13,1.15,.58);
        const pocket=put(shoulder,sphere(.15,leather),0,-1.05,.19);
        pocket.scale.set(.92,1.05,.25);
        rigs.glove=mitt;
      }
    }
    rigs.arms=arms;
    for (const side of [-1,1]) {
      const leg=new T.Group();
      leg.position.set(side*.20,.91,0);
      torso.add(leg);
      put(leg,cyl(.205,.17,.50,pants),0,-.26,0);
      put(leg,sphere(.16,pants),0,-.50,0);
      put(leg,cyl(.155,.125,.49,pants),0,-.74,.03);
      const sock=put(leg,cyl(.13,.13,.10,trim),0,-.99,.04);
      const boot=put(leg,cube(.28,.18,.50,shoes),0,-1.08,.14);
      boot.position.z=.15;
      rigs.legs.push(leg);
    }
    if (style==='batter') {
      // 3D tapered wooden bat with wrapped grip.
      const batRoot = new T.Group();
      batRoot.position.set(.05,-.88,.11);
      rigs.arms[1].add(batRoot);
      const grip = cyl(.043,.038,.52,mat(0x222a32,.73),12);
      put(batRoot,grip,0,.19,0);
      const barrel = cyl(.07,.045,.84,mat(0xbb8444,.48),16);
      put(batRoot,barrel,0,.87,0);
      put(batRoot,sphere(.07,mat(0x976333)),0,1.32,0);
      batRoot.rotation.set(.22,0,.40);
      rigs.bat=batRoot;
    }
    root.add(torso);
    return rigs;
  }
  const cpuPitcher = makePlayer(0xf6f7f5,16,'pitcher');
  cpuPitcher.root.position.set(0,.09,-18.4);
  cpuPitcher.root.rotation.y=0;
  cpuPitcher.root.scale.setScalar(1.05);
  scene.add(cpuPitcher.root);
  const userPitcher = makePlayer(0xf1f2ef,26,'pitcher');
  userPitcher.root.position.set(0,.09,-18.4);
  userPitcher.root.rotation.y=0;
  userPitcher.root.scale.setScalar(1.2);
  scene.add(userPitcher.root);
  const playerBatter = makePlayer(0xf08024,3,'batter');
  playerBatter.root.position.set(2.35,.06,6.8);
  playerBatter.root.rotation.y=PI;
  playerBatter.root.scale.setScalar(1.1);
  scene.add(playerBatter.root);
  const opponentBatter = makePlayer(0xf0c42f,32,'batter');
  opponentBatter.root.position.set(1.1,.02,.4);
  opponentBatter.root.rotation.y=PI;
  scene.add(opponentBatter.root);
  const catcher = makePlayer(0x182f4d,2,'catcher');
  catcher.root.position.set(0,.08,1.4);
  catcher.root.rotation.y=PI;
  catcher.root.scale.setScalar(.91);
  scene.add(catcher.root);
  const fielders = [];
  const pos = [
    [-28,0,-56], [0,0,-67], [28,0,-56],
    [-13,0,-29], [12,0,-30], [19.4,0,-19.4], [-19.4,0,-19.4]
  ];
  pos.forEach((p,i)=>{
    const rig=makePlayer(0xf5f6f3,i+4);
    rig.root.position.set(p[0],p[1],p[2]);
    rig.root.rotation.y=.3*(i%2?1:-1);
    rig.root.scale.setScalar(.92);
    scene.add(rig.root);
    fielders.push(rig);
  });

  // 3D ball, raised seams, and ball ground shadow.
  const baseball = sphere(.105, mat(0xfaf4e6,.38),20,14);
  scene.add(baseball);
  const redThread = new T.MeshBasicMaterial({color:0xb94b3d});
  for (let side of [-1,1]) {
    const pts=[];
    for(let i=0;i<=22;i++){
      const t=-PI*.45+i*(PI*.9/22);
      pts.push(new T.Vector3(Math.sin(t)*.108,Math.cos(t)*.071,
        side*Math.cos(t)*.075));
    }
    const seam=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),36,.006,5,false),redThread,false);
    baseball.add(seam);
  }
  baseball.visible=false;
  const ballShadow = mesh(new T.CircleGeometry(.17,20),
    new T.MeshBasicMaterial({color:0x102615,transparent:true,opacity:.28,depthWrite:false}),false);
  ballShadow.rotation.x=-PI/2;
  scene.add(ballShadow);
  ballShadow.visible=false;

  const pitchClass = () => stage.classList.contains('user-pitching');
  function applyTeams(pitchMode) {
    const short=(document.getElementById('cpuShort')?.textContent || '').trim();
    const cpuColor=teamColors[short] || 0xe2d6c2;
    const batterLeft=stage.classList.contains('bat-left');
    cpuPitcher.jersey.color.setHex(cpuColor);
    opponentBatter.jersey.color.setHex(cpuColor);
    playerBatter.jersey.color.setHex(0xef842f);
    userPitcher.jersey.color.setHex(0xf4f3ef);
    catcher.jersey.color.setHex(pitchMode?0xffffff:cpuColor);
    fielders.forEach(f=>f.jersey.color.setHex(pitchMode?0xf2f3f2:cpuColor));
    playerBatter.root.scale.x=batterLeft?-1.1:1.1;
    playerBatter.root.position.x=batterLeft?-2.35:2.35;
    opponentBatter.root.position.x=batterLeft?-1.1:1.1;
    playerBatter.root.rotation.y=PI;
    opponentBatter.root.rotation.y=PI;
    cpuPitcher.root.visible=!pitchMode;
    userPitcher.root.visible=pitchMode;
    playerBatter.root.visible=!pitchMode;
    opponentBatter.root.visible=pitchMode;
    catcher.root.visible=pitchMode;
  }
  const targetPos = new T.Vector3();
  const targetLook = new T.Vector3();
  function setCameraMode(pitching, hitMode, snap = false) {
    const isPortrait=stage.clientHeight>stage.clientWidth;
    const left=stage.classList.contains('bat-left');
    const pitchLeft=stage.classList.contains('pitch-left');
    if (hitMode) {
      targetPos.set(0, isPortrait?45:34, isPortrait?40:29);
      targetLook.set(0, 0, -36);
    } else if (pitching) {
      targetPos.set(pitchLeft?1:-1, isPortrait?3.3:2.65, isPortrait?-30:-29);
      targetLook.set(0,1.3,-1.4);
    } else {
      targetPos.set(left?.15:-.15, isPortrait?2.8:2.2, isPortrait?11:10);
      targetLook.set(0, 1.25, -18.4);
    }
    camera.fov = hitMode ? (isPortrait?54:51) : (isPortrait?63:57);
    camera.updateProjectionMatrix();
    if (snap || camera.position.length() < .1) camera.position.copy(targetPos);
    else camera.position.lerp(targetPos,.12);
    camera.lookAt(targetLook);
  }
  const ballElement = document.getElementById('ball');
  const pitchFigure = document.getElementById('pitcher');
  const batterFigure = document.getElementById('batter');
  const hitOverlay = document.getElementById('hitCam');
  const flyballFigure = document.getElementById('flyball');
  const currentPitchScale = () => {
    const match = /scale\(([-.\d]+)\)/.exec(ballElement?.style.transform||'');
    return match?Number(match[1]):NaN;
  };
  let lastWindup=false,lastRelease=false,lastSwing=false,windupAt=0,releaseAt=0,swingAt=0;
  let lastTick=performance.now(),simClock=0,lastMode='',lastHit=false,resizeW=0,resizeH=0;
  function motion(rig, activeWind, activeRelease, w, r, bat=false) {
    const t=simClock;
    const idle = Math.sin(t*1.5)*.018;
    rig.torso.rotation.set(idle,0,0);
    for (const a of rig.arms) a.rotation.set(0,0,(rig.arms.indexOf(a)===0?1:-1)*.22);
    for (const l of rig.legs) l.rotation.set(0,0,0);
    if (activeWind) {
      const u=clamp(w/.58,0,1);
      const pulse=Math.sin(PI*u);
      rig.legs[0].rotation.x=-.8*pulse;
      rig.arms[0].rotation.x=-1.0*pulse;
      rig.arms[1].rotation.x=.95*pulse;
      rig.torso.rotation.y=.22*pulse;
    }
    if (activeRelease) {
      const u=clamp(r/.36,0,1);
      rig.arms[1].rotation.x=-2.9*Math.sin(Math.min(1,u)*PI*.78);
      rig.arms[0].rotation.x=.9*Math.sin(u*PI);
      rig.legs[1].rotation.x=-.45*Math.sin(u*PI);
      rig.torso.rotation.y=-.24*Math.sin(u*PI);
      rig.torso.rotation.x=.22*Math.sin(u*PI);
    }
    if (bat) {
      const u=clamp((simClock-swingAt)/.30,0,1);
      const sw=Math.sin(u*PI);
      rig.torso.rotation.y=-1.12*sw;
      rig.arms[0].rotation.x=-.85*sw;
      rig.arms[1].rotation.x=-1.22*sw;
      rig.arms[1].rotation.z=-.40*sw;
      rig.legs[0].rotation.y=.22*sw;
      rig.legs[1].rotation.y=-.22*sw;
    }
  }
  function renderBall(pitchMode, hitMode) {
    if (hitMode && flyballFigure) {
      const rect=flyballFigure.getBoundingClientRect();
      const box=hitOverlay.getBoundingClientRect();
      if (box.width>0 && rect.width>0) {
        const nx=(rect.left+rect.width/2-box.left)/box.width;
        const ny=(rect.top+rect.height/2-box.top)/box.height;
        baseball.position.set((nx-.5)*105, 2+Math.max(0,.53-ny)*45,
          -19-(1-ny)*63);
        baseball.scale.setScalar(1.3);
        baseball.visible=true;
        ballShadow.position.set(baseball.position.x,-.01,baseball.position.z);
        ballShadow.visible=true;
        return;
      }
    }
    if (!ballElement || ballElement.style.display==='none') {
      baseball.visible=false; ballShadow.visible=false; return;
    }
    const zScale=currentPitchScale();
    const progress=Number.isFinite(zScale) ?
      (pitchMode?clamp((1.34-zScale)/(.86),0,1):clamp((zScale-.42)/1.26,0,1)) : .15;
    const aim=document.getElementById('aim');
    const xAim=clamp(parseFloat(aim?.style.left||'50')/100,0,1);
    const yAim=clamp(parseFloat(aim?.style.top||'50')/100,0,1);
    const side=stage.classList.contains('pitch-left')?-1:1;
    const startX=side*.32, endX=(xAim-.5)*1.6;
    baseball.position.set(startX*(1-progress)+endX*progress,
      1.85+(1-progress)*.45-(yAim-.5)*.92*progress+
      Math.sin(PI*progress)*.18,
      -18.4 + 18.4*progress);
    baseball.rotation.set(simClock*13,simClock*8,simClock*11);
    baseball.scale.setScalar(1);
    baseball.visible=true;
    ballShadow.position.set(baseball.position.x,-.012,baseball.position.z);
    ballShadow.visible=true;
  }
  function resize() {
    const w=stage.clientWidth,h=stage.clientHeight;
    if (!w || !h || (w===resizeW && h===resizeH)) return;
    resizeW=w; resizeH=h;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  }
  const visible = () => !game.classList.contains('hidden') &&
    stage.getClientRects().length>0 && !!stage.clientWidth;
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (!visible() || document.hidden) { lastTick=now; return; }
    try {
      resize();
      const dt=game.classList.contains('paused')?0:clamp((now-lastTick)/1000,0,.065);
      lastTick=now;
      simClock+=dt;
      const pitchMode=pitchClass();
      const hitMode=!!hitOverlay && !hitOverlay.classList.contains('hidden');
      const mode=(pitchMode?'pitch':'bat') + (hitMode?'-hit':'') +
        (stage.classList.contains('bat-left')?'-left':'');
      if (mode!==lastMode) {
        lastMode=mode;
        applyTeams(pitchMode);
        setCameraMode(pitchMode,hitMode,true);
      }
      const windy=pitchFigure.classList.contains('windup');
      const releasing=pitchFigure.classList.contains('release');
      const swinging=batterFigure.classList.contains('swing');
      if (windy&&!lastWindup)windupAt=simClock;
      if (releasing&&!lastRelease)releaseAt=simClock;
      if (swinging&&!lastSwing)swingAt=simClock;
      lastWindup=windy;lastRelease=releasing;lastSwing=swinging;
      const pitcherRig=pitchMode?userPitcher:cpuPitcher;
      motion(pitcherRig,windy,releasing,simClock-windupAt,simClock-releaseAt);
      const hitterRig=pitchMode?opponentBatter:playerBatter;
      motion(hitterRig,false,false,0,0,swinging||(simClock-swingAt)<.28);
      catcher.torso.rotation.x=.35;
      catcher.legs.forEach((l,i)=>{l.rotation.x=i?-.65:.65;l.rotation.z=i?-.55:.55;});
      catcher.root.position.y=-.52;
      for (const [i,f] of fielders.entries()) {
        f.torso.rotation.y=Math.sin(simClock*1.1+i)*.055;
      }
      setCameraMode(pitchMode,hitMode);
      renderBall(pitchMode,hitMode);
      renderer.render(scene,camera);
      if (!game.classList.contains('baseball-3d-ready')) {
        game.classList.add('baseball-3d-ready');
      }
      lastHit=hitMode;
    } catch (err) {
      console.error('3D baseball rendering failed', err);
      game.classList.remove('baseball-3d-ready');
      renderer.domElement.style.display='none';
    }
  }
  const resizeObserver = window.ResizeObserver ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(stage);
  window.addEventListener('resize',resize,{passive:true});
  window.requestAnimationFrame(frame);
})();