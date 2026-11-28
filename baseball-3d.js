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
  // One instanced draw instead of 756 mobile GPU draw calls.
  const seating = new T.InstancedMesh(
    new T.BoxGeometry(3.25, .35, 2.18),
    new T.MeshStandardMaterial({color:0xffffff,roughness:.9}), 12*63
  );
  const seatDummy = new T.Object3D();
  let seatIndex = 0;
  for (let row = 0; row < 12; row++) {
    const R = 88 + row * 2.25;
    for (let j = 0; j < 63; j++) {
      const a = -1.26 + j * (2.52/62);
      seatDummy.position.set(Math.sin(a)*R,3.6+row*.49,-Math.cos(a)*R);
      seatDummy.rotation.set(0,-a,0);
      seatDummy.updateMatrix();
      seating.setMatrixAt(seatIndex,seatDummy.matrix);
      seating.setColorAt(seatIndex,c(row%2?0x71858e:0x87939b));
      seatIndex++;
    }
  }
  seating.instanceMatrix.needsUpdate=true;
  if(seating.instanceColor)seating.instanceColor.needsUpdate=true;
  seating.receiveShadow=true;
  scene.add(seating);
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

  // Backstop grandstand behind home plate, visible from the pitching camera.
  // The earlier scene only had outfield seating, leaving the pitch view empty.
  const backWall=put(scene,cube(132,4.3,1.4,mat(0x1f3e46)),0,1.85,32);
  const backSeating=new T.InstancedMesh(
    new T.BoxGeometry(2,.30,1.92),
    new T.MeshStandardMaterial({color:0xffffff,roughness:.88}),
    12*70
  );
  const backSeatObj=new T.Object3D();
  let backIndex=0;
  for(let r=0;r<12;r++){
    for(let j=0;j<70;j++){
      const x=-69+j*2;
      backSeatObj.position.set(x,4.2+r*.66,33.5+r*2.1);
      backSeatObj.rotation.set(0,0,0);
      backSeatObj.updateMatrix();
      backSeating.setMatrixAt(backIndex,backSeatObj.matrix);
      backSeating.setColorAt(backIndex,c(r%2?0x7b8d98:0xa7b0b7));
      backIndex++;
    }
  }
  backSeating.instanceMatrix.needsUpdate=true;
  if(backSeating.instanceColor)backSeating.instanceColor.needsUpdate=true;
  scene.add(backSeating);
  const backSpectators=new T.InstancedMesh(
    new T.SphereGeometry(.25,6,5),
    new T.MeshLambertMaterial({color:0xffffff}),1750
  );
  const backHuman=new T.Object3D();
  for(let i=0;i<1750;i++){
    const col=Math.floor(rand()*70),row=Math.floor(rand()*12);
    backHuman.position.set(-69+col*2+rand()*1.5,4.75+row*.66,33.5+row*2.1);
    backHuman.scale.set(.7+rand()*.7,.85+rand()*.55,.7+rand()*.7);
    backHuman.updateMatrix();
    backSpectators.setMatrixAt(i,backHuman.matrix);
    backSpectators.setColorAt(i,c(crowdColours[Math.floor(rand()*crowdColours.length)]));
  }
  backSpectators.instanceMatrix.needsUpdate=true;
  if(backSpectators.instanceColor)backSpectators.instanceColor.needsUpdate=true;
  scene.add(backSpectators);
  const backBoard=mesh(new T.PlaneGeometry(24,8),
    new T.MeshBasicMaterial({
      map:signTexture('CPBL 3D LIVE', '#133341'),
      side:T.DoubleSide
    }),false);
  backBoard.position.set(0,14.2,39);
  backBoard.rotation.y=PI;
  scene.add(backBoard);
  put(scene,cube(25,8.8,.9,blue),0,14.2,39.6);

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
    // Shaped mesh with shoulder/waist taper, rather than a rectangular tube.
    const shirtProfile=[
      [.28,0],[.31,.08],[.30,.23],[.34,.44],
      [.38,.64],[.36,.75],[.27,.81],[.16,.85]
    ].map(([x,y])=>new T.Vector2(x,y));
    const torsoM=mesh(new T.LatheGeometry(shirtProfile,28),jersey);torsoM.scale.z=.78;
    put(torso,torsoM,0,.96,0);
    const chest = sphere(.34,jersey,24,16);
    chest.scale.set(1.08,.46,.69);
    put(torso,chest,0,1.55,.005);
    // Jersey back name and number remain readable in the batting camera.
    const numberTexture=(()=>{
      const cv=document.createElement('canvas');cv.width=256;cv.height=256;
      const g=cv.getContext('2d');
      g.clearRect(0,0,256,256);
      g.textAlign='center';g.fillStyle='#f9f9e8';
      g.font='bold 34px sans-serif';g.fillText('BASEBALL',128,62);
      g.font='bold 160px sans-serif';g.fillText(String(number),128,213);
      const t=new T.CanvasTexture(cv);t.colorSpace=T.SRGBColorSpace;return t;
    })();
    const jerseyBack=new T.Mesh(new T.PlaneGeometry(.55,.60),
      new T.MeshBasicMaterial({map:numberTexture,transparent:true,side:T.DoubleSide,depthWrite:false}));
    jerseyBack.position.set(0,1.43,-.283);
    jerseyBack.rotation.y=PI;
    torso.add(jerseyBack);
    put(torso,cyl(.28,.30,.22,trim),0,.93,0);
    const belt = put(torso,cyl(.34,.32,.10,mat(0x273344)),0,.97,0);
    const neckline=put(torso,cyl(.175,.165,.085,trim),0,1.79,0);
    // head + nose + ears + face features
    const head=sphere(.171,face,24,20);
    head.scale.set(.94,1.16,1);
    put(torso,head,0,2.01,0);
    put(torso,sphere(.039,face),0,1.98,.165);
    for (const side of [-1,1]){
      const eye=sphere(.024,mat(0x212223),8,6);
      put(torso,eye,side*.065,2.047,.151);
      const ear=sphere(.052,face,10,8);
      ear.scale.set(.60,1,.75);
      put(torso,ear,side*.168,2.00,0);
    }
    const hat=put(torso,sphere(.185,capMat,24,16),0,2.17,-.012);
    hat.scale.set(1,.62,1.03);
    const brim=put(torso,sphere(.26,capMat,20,10),0,2.124,.146);
    brim.scale.set(.90,.12,.67);
    if (style==='batter') {
      const helmet=put(torso,sphere(.187,capMat),0,2.169,-.005);
      helmet.scale.set(1.04,.83,1.04);
      const earGuard=put(torso,sphere(.105,capMat),-.172,2.04,.035);
      earGuard.scale.set(.40,1,.85);
    }
    // V310: articulated elbows and knees, separate leg/upper body motion.
    // Small uniform details remain procedural, no downloaded player likenesses.
    const piping=mat(0xe9e4d3,.86),beltMat=mat(0x263141,.8);
    put(torso,cube(.022,.58,.014,piping),0,1.40,.274);
    for(let i=0;i<5;i++)put(torso,sphere(.014,piping,8,6),.028,1.18+i*.11,.283);
    put(torso,cube(.115,.075,.04,piping),0,.97,.322);
    const rigs={root,torso,arms:[],elbows:[],hands:[],legs:[],knees:[],jersey,cap:capMat,glove:null,gloves:[],bat:null,style};
    for (const side of [-1,1]) {
      const shoulder=new T.Group();shoulder.position.set(side*.35,1.62,0);torso.add(shoulder);
      put(shoulder,sphere(.134,jersey,16,12),0,-.055,0);
      put(shoulder,cyl(.139,.115,.22,jersey),0,-.14,0);
      put(shoulder,cyl(.117,.113,.045,piping),0,-.245,0);
      put(shoulder,cyl(.103,.081,.18,face),0,-.345,0);
      const elbow=new T.Group();elbow.position.y=-.44;shoulder.add(elbow);
      put(elbow,sphere(.083,face,14,10),0,0,0);
      put(elbow,cyl(.083,.062,.30,face),0,-.16,0);
      const hand=new T.Group();hand.position.y=-.365;elbow.add(hand);
      const handMesh=put(hand,sphere(.082,style==='batter'?piping:face,14,10),0,-.012,0);
      handMesh.scale.set(.82,1.08,.76);
      if(style==='batter'){put(elbow,cyl(.071,.070,.08,beltMat),0,-.28,0)}
      else if(style!=='runner') {
        const mitt=put(hand,sphere(.137,gloveMat,16,12),0,0,.056);mitt.scale.set(1.02,1.14,.55);
        const pocket=put(mitt,sphere(.10,leather,12,8),0,.015,.08);pocket.scale.set(.85,.95,.35);
        mitt.visible=side===-1;rigs.gloves.push(mitt);
        if(side===-1)rigs.glove=mitt;
      }
      rigs.arms.push(shoulder);rigs.elbows.push(elbow);rigs.hands.push(hand);
    }
    for (const side of [-1,1]) {
      const leg=new T.Group();leg.position.set(side*.195,.95,0);root.add(leg);
      put(leg,cyl(.167,.132,.43,pants),0,-.215,0);
      const knee=new T.Group();knee.position.y=-.43;leg.add(knee);
      put(knee,sphere(.133,pants,16,12),0,0,0);
      put(knee,cyl(.133,.104,.39,pants),0,-.195,0);
      put(knee,cyl(.105,.106,.075,trim),0,-.405,0);
      const boot=put(knee,sphere(.145,shoes,18,12),0,-.462,.105);boot.scale.set(.80,.52,1.64);
      put(knee,cube(.20,.035,.34,beltMat),0,-.515,.105);
      for(let n=0;n<3;n++)put(knee,cube(.105,.012,.016,piping),0,-.41,.12+n*.035);
      rigs.legs.push(leg);rigs.knees.push(knee);
    }
    if(style==='batter'){
      const batRoot=new T.Group();torso.add(batRoot);
      const grip=mat(0x26303d,.73),wood=mat(0xc49760,.48);
      put(batRoot,cyl(.032,.034,.27,grip,14),0,.105,0);
      put(batRoot,cyl(.066,.032,.68,wood,20),0,.56,0);
      put(batRoot,sphere(.066,wood,16,10),0,.90,0);
      put(batRoot,cyl(.047,.047,.034,grip),0,-.043,0);
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
  playerBatter.root.position.set(2.35,.06,5.1);
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

  // Real 3D baserunners respond to the existing safe/occupied base state.
  const runnerSpots=[[19.4,-19.4],[0,-38.8],[-19.4,-19.4]];
  const runners=runnerSpots.map(([x,z],i)=>{
    const rig=makePlayer(0xf08024,11+i,'runner');
    rig.root.position.set(x,0,z);
    rig.root.rotation.y=PI*.75;
    rig.root.scale.setScalar(.91);
    rig.root.visible=false;
    scene.add(rig.root);
    return rig;
  });
  // Baserunning follows the existing official hit-runner animation, not the scoring logic.
  const liveRunner=makePlayer(0xf08024,11,'runner');
  liveRunner.root.scale.setScalar(.93);liveRunner.root.visible=false;scene.add(liveRunner.root);
  const runnerFigure=document.getElementById('hitRunner');
  const runningPath=[[0,0],[19.4,-19.4],[0,-38.8],[-19.4,-19.4],[0,0]];
  function renderLiveRunner(hitMode,pitchMode){
    liveRunner.root.visible=false;
    if(!hitMode||pitchMode||!runnerFigure)return;
    const a=runnerFigure.getAnimations()[0];
    if(!a||a.currentTime===null||Number(getComputedStyle(runnerFigure).opacity)<.1)return;
    const frames=a.effect.getKeyframes(),legs=Math.min(4,Math.max(1,frames.length-1));
    const u=clamp(a.effect.getComputedTiming().progress??0,0,1)*legs;
    const i=Math.min(legs-1,Math.floor(u)),t=u-i;
    const p=runningPath[i],q=runningPath[i+1];
    liveRunner.root.position.set(p[0]+(q[0]-p[0])*t,0,p[1]+(q[1]-p[1])*t);
    liveRunner.root.rotation.y=Math.atan2(q[0]-p[0],q[1]-p[1]);
    liveRunner.jersey.color.copy(playerBatter.jersey.color);
    liveRunner.root.visible=true;
    fieldPose(liveRunner,Number(a.currentTime)*.017,u<legs);
  }
  const occupiedBaseElements=[
    document.getElementById('base1'),
    document.getElementById('base2'),
    document.getElementById('base3')
  ];

  // 3D ball, raised seams, and ball ground shadow.
  // V305: readable pitch in 3D batting view (especially on iPhone).
  // The distant .105m ball projected to only a few pixels and blended into
  // the light sky/uniform. Keep the physical trajectory and swing timing intact.
  const baseball = sphere(.105,
    new T.MeshStandardMaterial({color:0xffffff,roughness:.33,
      emissive:0xf6e9c8,emissiveIntensity:.48}),20,14);
  scene.add(baseball);
  const pitchHalo = new T.Sprite(new T.SpriteMaterial({
    map:(()=>{
      const c=document.createElement('canvas');c.width=c.height=64;
      const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,8,32,32,31);
      g.addColorStop(0,'rgba(255,255,255,0)');
      g.addColorStop(.36,'rgba(255,246,174,.18)');
      g.addColorStop(.59,'rgba(255,206,79,.82)');
      g.addColorStop(.78,'rgba(88,56,18,.65)');
      g.addColorStop(1,'rgba(88,56,18,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
      return new T.CanvasTexture(c);
    })(),
    transparent:true,depthWrite:false,depthTest:false,opacity:.90
  }));
  pitchHalo.visible=false;
  pitchHalo.renderOrder=80;
  scene.add(pitchHalo);
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
    const battingTeam=(document.getElementById('batterTeam')?.textContent||'');
    const teamName=Object.keys(teamColors).find(k=>battingTeam.includes(k));
    playerBatter.jersey.color.setHex(!pitchMode&&teamName?teamColors[teamName]:0xef842f);
    userPitcher.jersey.color.setHex(0xf4f3ef);
    catcher.jersey.color.setHex(pitchMode?0xffffff:cpuColor);
    fielders.forEach(f=>f.jersey.color.setHex(pitchMode?0xf2f3f2:cpuColor));
    playerBatter.root.scale.x=batterLeft?-1.1:1.1;
    playerBatter.root.position.x=batterLeft?-2.35:2.35;
    opponentBatter.root.position.x=batterLeft?-1.1:1.1;
    opponentBatter.root.scale.x=batterLeft?-1:1;
    playerBatter.root.rotation.y=PI;
    opponentBatter.root.rotation.y=PI;
    cpuPitcher.root.visible=!pitchMode;
    userPitcher.root.visible=pitchMode;
    playerBatter.root.visible=!pitchMode;
    opponentBatter.root.visible=pitchMode;
    catcher.root.visible=pitchMode;
  }
  // V307: cinematic home-run camera driven by the game's actual hit animation.
  const hrTrailGeometry = new T.BufferGeometry();
  const hrTrailPositions = new Float32Array(21*3);
  hrTrailGeometry.setAttribute('position',new T.BufferAttribute(hrTrailPositions,3));
  const hrTrail = new T.Line(hrTrailGeometry,new T.LineBasicMaterial({color:0xffe4a1,transparent:true,opacity:.65,depthTest:false,depthWrite:false}));
  hrTrail.frustumCulled=false;hrTrail.renderOrder=79;hrTrail.visible=false;scene.add(hrTrail);
  const hrPoint=new T.Vector3(),hrSample=new T.Vector3();
  let hrFlight=null;
  function getHrFlight(hitMode){
    if(!hitMode||!hitOverlay.classList.contains('hrMode')||!hitOverlay.dataset.hrDistance)return null;
    const animation=flyballFigure.getAnimations()[0];
    if(!animation||animation.currentTime===null)return null;
    const duration=Number(animation.effect.getTiming().duration)||2900;
    const progress=clamp(Number(animation.currentTime)/duration,0,1);
    const angle=clamp(Number(hitOverlay.dataset.hrSpray)||0,-48,48)*PI/180;
    const distance=Number(hitOverlay.dataset.hrDistance)||400;
    const fence=Number(hitOverlay.dataset.hrFence)||400;
    const radius=86*clamp(distance/fence,1.025,1.38);
    const height=clamp((Number(hitOverlay.dataset.hrLaunch)||28)*.72,13,34);
    return {progress,angle,radius,height};
  }
  function hrPosition(out,flight,t){
    // A continuous arc from home plate to beyond the modeled outfield wall.
    const q=clamp(t,0,1),travel=flight.radius*q;
    return out.set(Math.sin(flight.angle)*travel,
      1.45+Math.sin(PI*q)*flight.height+q*5.2,
      -Math.cos(flight.angle)*travel);
  }
  const targetPos = new T.Vector3();
  const targetLook = new T.Vector3();
  function setCameraMode(pitching, hitMode, snap = false) {
    const isPortrait=stage.clientHeight>stage.clientWidth;
    const left=stage.classList.contains('bat-left');
    const pitchLeft=stage.classList.contains('pitch-left');
    if (hrFlight) {
      hrPosition(hrPoint,hrFlight,hrFlight.progress);
      const p=hrFlight.progress,a=hrFlight.angle;
      // Follow from behind the ball, gradually rising toward the fence.
      const back=isPortrait?38:32,side=isPortrait?9:12;
      targetPos.set(hrPoint.x-Math.sin(a)*back+Math.cos(a)*side,
        Math.max(9,hrPoint.y+10),hrPoint.z+Math.cos(a)*back+Math.sin(a)*side);
      targetLook.set(hrPoint.x+Math.sin(a)*7,Math.max(3,hrPoint.y-2),
        hrPoint.z-Math.cos(a)*7);
    } else if (hitMode) {
      targetPos.set(0, isPortrait?45:34, isPortrait?40:29);
      targetLook.set(0, 0, -36);
    } else if (pitching) {
      targetPos.set(pitchLeft?.60:-.60, isPortrait?2.65:2.38,
        isPortrait?-24.3:-23.5);
      targetLook.set(0,1.35,1.7);
    } else {
      targetPos.set(left?.15:-.15, isPortrait?2.8:2.2, isPortrait?11:10);
      targetLook.set(0, 1.25, -18.4);
    }
    camera.fov = hrFlight ? (isPortrait?59:54) : hitMode ? (isPortrait?54:51) : (isPortrait?63:57);
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
  let lastWindup=false,lastRelease=false,lastSwing=false,windupAt=0,releaseAt=0,swingAt=-10;
  let lastTick=performance.now(),simClock=0,lastMode='',lastHit=false,resizeW=0,resizeH=0;
  // Two-bone arm solve: hand targets and elbow bend are computed in torso coordinates.
  const down=new T.Vector3(0,-1,0),upAxis=new T.Vector3(0,1,0);
  const ikDir=new T.Vector3(),ikBend=new T.Vector3(),ikElbow=new T.Vector3(),ikFore=new T.Vector3(),ikTarget=new T.Vector3(),ikInv=new T.Quaternion();
  const armHint=new T.Vector3(),handTarget=new T.Vector3(),batAxis=new T.Vector3(),batGrip=new T.Vector3();
  function armTo(rig,i,target,hint){
    const shoulder=rig.arms[i],elbow=rig.elbows[i],a=.44,b=.365;
    ikDir.subVectors(target,shoulder.position);
    const d=clamp(ikDir.length(),.09,a+b-.008);ikDir.normalize();
    ikBend.copy(hint).addScaledVector(ikDir,-hint.dot(ikDir));
    if(ikBend.lengthSq()<.001)ikBend.set(0,0,1).addScaledVector(ikDir,-ikDir.z);
    ikBend.normalize();
    const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
    ikElbow.copy(ikDir).multiplyScalar(along).addScaledVector(ikBend,height);
    shoulder.quaternion.setFromUnitVectors(down,ikElbow.clone().normalize());
    ikTarget.copy(ikDir).multiplyScalar(d);
    ikFore.subVectors(ikTarget,ikElbow).normalize().applyQuaternion(ikInv.copy(shoulder.quaternion).invert());
    elbow.quaternion.setFromUnitVectors(down,ikFore);
  }
  function poseLeg(rig,i,x,z,knee){rig.legs[i].rotation.set(x,0,z);rig.knees[i].rotation.set(knee,0,0)}
  function batterPose(rig,active){
    const u=active?clamp((simClock-swingAt)/.38,0,1):0;
    const swing=active?Math.sin(Math.PI*Math.min(1,u*.94)):0;
    const turn=active?Math.sin(Math.PI*u*.82):0;
    const sway=Math.sin(simClock*2.1)*.019;
    rig.torso.rotation.set(-.055+sway,-.20-1.12*turn,.035);
    rig.torso.position.y=-.055;
    poseLeg(rig,0,-.13,.13,.27);poseLeg(rig,1,-.17-.16*swing,-.16,.31+.15*swing);
    rig.legs[0].rotation.y=-.25*turn;rig.legs[1].rotation.y=.38*turn;
    // Both gloved hands grip the same bat; the axis sweeps across the body.
    batGrip.set(.19-.45*turn,1.49-.15*swing,-.36+.58*turn);
    batAxis.set(.52-.90*turn,.83-.70*swing,-.17-.62*swing).normalize();
    rig.bat.position.copy(batGrip);rig.bat.quaternion.setFromUnitVectors(upAxis,batAxis);
    for(let i=0;i<2;i++){
      handTarget.copy(batGrip).addScaledVector(batAxis,.035+i*.125);
      armHint.set(i===0?-.8:.8,-.7,.2);
      armTo(rig,i,handTarget,armHint);
    }
  }
  function pitcherPose(rig,wind,release,w,r){
    const left=stage.classList.contains('pitch-left'),throwIndex=left?0:1,gloveIndex=1-throwIndex,sign=left?-1:1;
    const low=stage.classList.contains('delivery-submarine'),side=stage.classList.contains('delivery-sidearm');
    const lift=wind?Math.sin(Math.PI*clamp(w/.43,0,1)*.84):0;
    const p=release?clamp(r/.40,0,1):0,drive=release?Math.sin(Math.PI*p):0;
    rig.torso.position.y=-.03-(low?.15:side?.065:0)*drive;
    rig.torso.rotation.set(.04+.36*drive,sign*(.46*lift-.72*drive),sign*(low?.58:side?.30:.10)*drive);
    poseLeg(rig,gloveIndex,-.15-.85*lift-.42*drive,sign*.12,.18+.92*lift+.24*drive);
    poseLeg(rig,throwIndex,.07+.40*drive,-sign*.07,.13+.22*drive);
    if(rig.gloves.length===2){rig.gloves[0].visible=gloveIndex===0;rig.gloves[1].visible=gloveIndex===1}
    handTarget.set(-sign*(.05+.19*drive),1.35-.22*drive,.40);
    armHint.set(-sign,.2,0);armTo(rig,gloveIndex,handTarget,armHint);
    if(wind)handTarget.set(sign*(.10+.48*lift),1.39+.22*lift,.38-.72*lift);
    else if(release){
      const q=Math.sin(Math.PI*clamp(p*1.35,0,1)),follow=Math.sin(Math.PI*p*.82);
      handTarget.set(sign*(.36+(low?.46:side?.62:.12)*q)-sign*.50*follow,
        1.38+(low?-.65:side?-.04:.60)*q-.44*follow,.18+.50*follow);
    }else handTarget.set(sign*.17,1.30,.37);
    armHint.set(sign,.22,-.20);armTo(rig,throwIndex,handTarget,armHint);
  }
  function motion(rig,activeWind,activeRelease,w,r,bat=false){
    if(rig.style==='batter'){batterPose(rig,bat);return}
    if(rig.style==='pitcher'){pitcherPose(rig,activeWind,activeRelease,w,r);return}
  }
  function fieldPose(rig,phase,run=false){
    rig.torso.position.y=run?.02*Math.sin(phase*2):-.035;
    rig.torso.rotation.set(run?.16:.07,0,0);
    for(let i=0;i<2;i++){
      const sign=i===0?-1:1,step=run?Math.sin(phase+i*Math.PI):0;
      poseLeg(rig,i,-.10+step*.60,sign*.10,.18+Math.max(0,-step)*.65);
      handTarget.set(sign*.40,run?1.12:.98,run?-.40*step:.13);
      armHint.set(sign,-.4,.3);armTo(rig,i,handTarget,armHint);
    }
  }
  // V311: visually follow the selected fielder and relay to the chosen base.
  let fieldVisualPhase='',fieldVisualAt=0;
  const fieldTarget=new T.Vector3(),fieldStart=new T.Vector3(),fieldEnd=new T.Vector3();
  const fieldBases={'1B':[19.4,0,-19.4],'2B':[0,0,-38.8],'3B':[-19.4,0,-19.4],HOME:[0,0,0]};
  function renderManualField(hitMode){
    const phase=hitMode&&hitOverlay?.dataset.fieldPhase||'';
    if(!phase){if(fieldVisualPhase)fielders.forEach((f,i)=>f.root.position.set(...pos[i]));fieldVisualPhase='';return false}
    if(phase!==fieldVisualPhase){fieldVisualPhase=phase;fieldVisualAt=simClock}
    const angle=clamp(Number(hitOverlay.dataset.fieldSpray)||0,-46,46)*PI/180;
    const radius=clamp((Number(hitOverlay.dataset.fieldDistance)||100)*.215,5,83);
    fieldTarget.set(Math.sin(angle)*radius,0,-Math.cos(angle)*radius);
    let idx=0,best=Infinity;
    for(let i=0;i<pos.length;i++){const d=(pos[i][0]-fieldTarget.x)**2+(pos[i][2]-fieldTarget.z)**2;if(d<best){best=d;idx=i}}
    const rig=fielders[idx],a=flyballFigure?.getAnimations()[0];
    const p=phase==='approach'?clamp(a?.effect.getComputedTiming().progress??0,0,1):1;
    const runP=clamp(p*1.23,0,1);
    rig.root.position.set(pos[idx][0]+(fieldTarget.x-pos[idx][0])*runP,0,pos[idx][2]+(fieldTarget.z-pos[idx][2])*runP);
    rig.root.rotation.y=Math.atan2(fieldTarget.x-pos[idx][0],fieldTarget.z-pos[idx][2]);
    fieldPose(rig,simClock*12,runP<1);
    const ground=hitOverlay.dataset.fieldGround==='1';
    if(phase==='approach'){
      baseball.position.set(fieldTarget.x*p,ground?.18+Math.abs(Math.sin(p*PI*5))*.25:1+Math.sin(PI*p)*Math.min(22,radius*.28),fieldTarget.z*p);
    }else if(phase==='relay'){
      const key=hitOverlay.dataset.fieldTarget,base=fieldBases[key]||fieldBases['1B'];
      fieldStart.copy(fieldTarget);fieldStart.y=1.35;fieldEnd.set(...base);fieldEnd.y=1.1;
      const dp=hitOverlay.dataset.fieldDouble==='1',elapsed=simClock-fieldVisualAt;
      let u=clamp(elapsed/(dp?.42:.46),0,1);
      if(dp&&elapsed>.42){fieldStart.set(...fieldBases['2B']);fieldStart.y=1.1;fieldEnd.set(...fieldBases['1B']);fieldEnd.y=1.1;u=clamp((elapsed-.42)/.42,0,1)}
      baseball.position.copy(fieldStart).lerp(fieldEnd,u);baseball.position.y+=Math.sin(PI*u)*2.3;
      handTarget.set(.20,1.66,.35);armHint.set(1,.3,0);armTo(rig,1,handTarget,armHint);
    }else{
      baseball.position.copy(fieldTarget);baseball.position.y=ground?.65:1.8;
      handTarget.set(-.22,ground?.93:1.83,.32);armHint.set(-1,.1,0);armTo(rig,0,handTarget,armHint);
    }
    baseball.visible=true;baseball.scale.setScalar(2.2);
    pitchHalo.visible=true;pitchHalo.position.copy(baseball.position);pitchHalo.scale.setScalar(.95);
    ballShadow.visible=true;ballShadow.position.set(baseball.position.x,-.01,baseball.position.z);
    return true;
  }
  function renderBall(pitchMode, hitMode) {
    hrTrail.visible=false;
    if(renderManualField(hitMode))return;
    if(hrFlight){
      hrPosition(baseball.position,hrFlight,hrFlight.progress);
      baseball.scale.setScalar(2.6);baseball.visible=true;
      baseball.rotation.set(simClock*13,simClock*8,simClock*11);
      pitchHalo.visible=true;pitchHalo.position.copy(baseball.position);pitchHalo.scale.setScalar(1.2);
      const p=hrFlight.progress;
      for(let i=0;i<21;i++){
        hrPosition(hrSample,hrFlight,Math.max(0,p-.15*(1-i/20)));
        hrTrailPositions.set([hrSample.x,hrSample.y,hrSample.z],i*3);
      }
      hrTrailGeometry.attributes.position.needsUpdate=true;hrTrail.visible=p>.015;
      ballShadow.visible=false;
      return;
    }
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
        pitchHalo.visible=false;
        ballShadow.position.set(baseball.position.x,-.01,baseball.position.z);
        ballShadow.visible=true;
        return;
      }
    }
    if (!ballElement || ballElement.style.display==='none') {
      baseball.visible=false; pitchHalo.visible=false; ballShadow.visible=false; return;
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
    // The visual-only scale compensates for perspective: far pitches are
    // readable without enlarging the hit zone or changing game physics.
    const pitchVisualScale=pitchMode?1.12:(2.05-.58*progress);
    baseball.scale.setScalar(pitchVisualScale);
    baseball.visible=true;
    pitchHalo.visible=!pitchMode;
    if(!pitchMode){
      pitchHalo.position.copy(baseball.position);
      pitchHalo.scale.setScalar(.54+.13*progress);
    }
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
      hrFlight=getHrFlight(hitMode);
      const mode=(pitchMode?'pitch':'bat') + (hrFlight?'-hr':hitMode?'-hit':'') +
        (stage.classList.contains('bat-left')?'-left':'')+'|'+(document.getElementById('batterTeam')?.textContent||'')+'|'+(document.getElementById('cpuShort')?.textContent||'');
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
      motion(pitcherRig,windy,releasing&&(simClock-releaseAt)<.40,simClock-windupAt,simClock-releaseAt);
      const hitterRig=pitchMode?opponentBatter:playerBatter;
      motion(hitterRig,false,false,0,0,swinging||(simClock-swingAt)<.38);
      catcher.torso.rotation.set(.24,0,0);catcher.torso.position.y=-.28;catcher.root.position.y=-.13;
      for(let i=0;i<2;i++){poseLeg(catcher,i,-.75,i===0?.25:-.25,1.25);handTarget.set(i===0?-.22:.22,1.18,.42);armHint.set(i===0?-1:1,-.5,0);armTo(catcher,i,handTarget,armHint)}
      for (const [i,f] of fielders.entries()) {
        fieldPose(f,simClock*2+i,false);
      }
      for(let i=0;i<runners.length;i++) {
        const occupied=!!occupiedBaseElements[i]?.classList.contains('runner');
        runners[i].root.visible=occupied;
        if(occupied){
          runners[i].jersey.color.setHex(pitchMode?
            (teamColors[(document.getElementById('cpuShort')?.textContent||'').trim()]||0xf0c42f):
            0xf08024);
          fieldPose(runners[i],simClock*5+i,false);
        }
      }
      // Freeze camera while paused; the WAAPI ball animation is paused by the game.
      if(!game.classList.contains('paused'))setCameraMode(pitchMode,hitMode);
      renderBall(pitchMode,hitMode);
      renderLiveRunner(hitMode,pitchMode);
      stage.classList.toggle('v307-hr-tracking',!!hrFlight);
      renderer.render(scene,camera);
      stage.classList.add('v310-articulated');
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