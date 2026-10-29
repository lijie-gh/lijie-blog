// ============================================================
// 骁龙 8 至尊版 · 3D 拆解可视化  main app
// Three.js r169 (本地 vendor) · 全程序化建模与纹理 · 无外部模型
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHIP, LAYERS, BLOCKS, OVERVIEW_SPECS, OVERVIEW_DESC, DISCLAIMER, GROUPS } from './parts-data.js';

const BUILD = 'sd8e-v1-20261025';

// ---------- 全局状态 ----------
const S = {
  explodeT: 1, explodeTarget: 1,   // 开场即为拆解态，随后组装合体
  selected: null, hovered: null,
  focusHoldUntil: 0, focusGoalY: 0.9,
  fly: null,                 // 相机飞行 {az0,el0,d0,t0, az1,el1,d1,t1, start, dur}
  intro: true, introT: 0, introStage: 0,
  autoRotate: false,
  clock: new THREE.Clock(),
  elapsed: 0, frames: 0, fps: 60, fpsAcc: 0, fpsN: 0,
};
const errors = [];
window.addEventListener('error', e => errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => errors.push('rej: ' + String(e.reason)));

// ---------- 工具 ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeIO = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const deg = d => d * Math.PI / 180;

const MM = 10 / 34;                       // 毫米 → 场景单位（基板 34mm = 10 单位）
const DIE_W = 10.5 * MM, DIE_D = 8.7 * MM; // 裸片 10.5 × 8.7 mm（示意）
const DIE_TOP = 0.57;                      // 裸片上表面（含基板叠层）

// ============================================================
// 渲染器 / 场景 / 相机
// ============================================================
let renderer = null;
const stage = document.getElementById('stage');
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,          // 无头截图 & 用户截图都需要
    powerPreference: 'high-performance',
  });
} catch (e) {
  fatal('当前环境不支持 WebGL，无法渲染 3D 场景。请使用最新版 Chrome / Edge 打开本页面。');
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x05070d, 0.016);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 200);

// 环境反射（金属质感的关键）
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.4;
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.85;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.85;
controls.screenSpacePanning = false;
controls.minDistance = 3.2;
controls.maxDistance = 30;
controls.maxPolarAngle = deg(88);
controls.autoRotateSpeed = 1.1;
controls.target.set(0, 0.9, 0);

function applyViewNow(azDeg, elDeg, dist, tx, ty, tz) {
  const az = deg(azDeg), el = deg(clamp(elDeg, 1, 88));
  controls.target.set(tx, ty, tz);
  camera.position.set(
    tx + dist * Math.cos(el) * Math.sin(az),
    ty + dist * Math.sin(el),
    tz + dist * Math.cos(el) * Math.cos(az),
  );
  camera.lookAt(controls.target);
  controls.update();
}
const DEFAULT_VIEW = [35, 30, 16.5, 0, 1.0, 0];
applyViewNow(96, 52, 26, 0, 1.4, 0);   // 开场远景

// ============================================================
// 灯光
// ============================================================
S.ambient = new THREE.AmbientLight(0x8fb4ff, 0.35);
scene.add(S.ambient);
S.hemi = new THREE.HemisphereLight(0x3a4a70, 0x05070c, 0.55);
scene.add(S.hemi);

const keyLight = new THREE.DirectionalLight(0xfff2e0, 2.2);
keyLight.position.set(6, 13, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -9; keyLight.shadow.camera.right = 9;
keyLight.shadow.camera.top = 9; keyLight.shadow.camera.bottom = -9;
keyLight.shadow.camera.near = 2; keyLight.shadow.camera.far = 40;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x38bdf8, 30, 0, 2);
fillLight.position.set(-8, 4.5, 7);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x7c6cf6, 26, 0, 2);
rimLight.position.set(7, 3.5, -8);
scene.add(rimLight);

// ============================================================
// 程序化纹理
// ============================================================
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rand = (a, b) => a + Math.random() * (b - a);

// —— 基板：金色走线 + 丝印 ——
const substrateTex = canvasTex(1024, (g, s) => {
  g.fillStyle = '#0a1310'; g.fillRect(0, 0, s, s);
  g.globalAlpha = 0.05; g.strokeStyle = '#1c4a38'; g.lineWidth = 1;
  for (let i = -s; i < s * 2; i += 14) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); }
  g.globalAlpha = 1;
  g.strokeStyle = '#8f6f2f'; g.lineWidth = 4;
  g.strokeRect(18, 18, s - 36, s - 36);
  // 中央焊盘区（裸片下方）
  const c0 = s / 2, cw = s * 0.31;
  g.fillStyle = '#6e5626';
  g.fillRect(c0 - cw / 2, c0 - cw / 2, cw, cw);
  g.fillStyle = '#0a1310';
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++)
    g.fillRect(c0 - cw / 2 + 4 + i * (cw - 8) / 15 - 1.5, c0 - cw / 2 + 4 + j * (cw - 8) / 15 - 1.5, 3, 3);
  // 随机金线
  g.strokeStyle = 'rgba(201,163,74,0.8)'; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let n = 0; n < 110; n++) {
    let x, y;
    const edge = (Math.random() * 4) | 0;
    if (edge === 0) { x = rand(30, s - 30); y = 26; }
    else if (edge === 1) { x = rand(30, s - 30); y = s - 26; }
    else if (edge === 2) { x = 26; y = rand(30, s - 30); }
    else { x = s - 26; y = rand(30, s - 30); }
    g.beginPath(); g.moveTo(x, y);
    for (let seg = 0; seg < 3; seg++) {
      if (seg % 2 === 0) x += (s / 2 - x) * rand(0.15, 0.5) * (Math.random() < 0.5 ? 1 : -1);
      else y += (s / 2 - y) * rand(0.15, 0.5) * (Math.random() < 0.5 ? 1 : -1);
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(230,190,110,0.9)';
    g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill();
  }
  // 丝印
  g.fillStyle = '#dfe6ee';
  g.font = 'bold 40px Consolas, monospace';
  g.fillText('SM8750-AB', 56, s - 66);
  g.font = '24px Consolas, monospace';
  g.fillStyle = '#aebdcf';
  g.fillText('QUALCOMM · SNAPDRAGON 8 ELITE', 56, s - 34);
  g.fillText('L4527A1.0  P2385', 56, 60);
  // 伪二维码
  const q = s - 150, qs = 96, cell = qs / 10;
  g.fillStyle = '#cfd8e2';
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++)
    if (Math.random() < 0.42) g.fillRect(q + i * cell, 40 + j * cell, cell, cell);
  g.strokeStyle = '#cfd8e2'; g.lineWidth = 3;
  g.strokeRect(q - 4, 36, qs + 8, qs + 8);
});

// —— 裸片表面：金属层细纹 ——
const dieTex = canvasTex(1024, (g, s) => {
  g.fillStyle = '#10131a'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) {
    g.strokeStyle = ['rgba(95,123,176,A)', 'rgba(61,79,120,A)', 'rgba(106,134,192,A)'][(Math.random() * 3) | 0]
      .replace('A', (rand(0.02, 0.06)).toFixed(3));
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + rand(-2, 2)); g.stroke();
  }
  g.strokeStyle = 'rgba(47,111,143,0.05)'; g.lineWidth = 3;
  for (let x = 0; x < s; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
  for (let n = 0; n < 40; n++) {
    g.strokeStyle = 'rgba(120,150,210,0.05)';
    g.strokeRect(rand(0, s - 60), rand(0, s - 60), rand(20, 90), rand(20, 90));
  }
  g.fillStyle = 'rgba(110,132,175,0.5)';
  g.font = '22px Consolas, monospace';
  g.fillText('SM8750  N3E  TSMC', 24, s - 24);
});

// —— 屏蔽盖：拉丝金属 + 镭雕标识 ——
const lidTex = canvasTex(1024, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, '#2b3442'); gr.addColorStop(0.5, '#39455a'); gr.addColorStop(1, '#262e3a');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    g.lineWidth = 1;
    const y = rand(0, s);
    g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + rand(-3, 3)); g.stroke();
  }
  // 内边框倒角
  g.strokeStyle = 'rgba(200,215,235,0.16)'; g.lineWidth = 5;
  g.strokeRect(26, 26, s - 52, s - 52);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  g.strokeRect(20, 20, s - 40, s - 40);
  // 徽标底
  const cx = s / 2, cy = s / 2 - 40;
  g.fillStyle = 'rgba(18,24,36,0.35)';
  g.beginPath(); g.arc(cx, cy - 60, 118, 0, 7); g.fill();
  g.strokeStyle = 'rgba(150,175,210,0.35)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy - 60, 118, 0, 7); g.stroke();
  // Snapdragon 火焰标（示意化三瓣流线）
  const flame = (r, off, alpha) => {
    const lg = g.createLinearGradient(cx - 100, cy - 160, cx + 100, cy + 20);
    lg.addColorStop(0, 'rgba(47,124,246,' + alpha + ')');
    lg.addColorStop(1, 'rgba(154,77,240,' + alpha + ')');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(cx, cy - 150 + off);
    g.bezierCurveTo(cx + 78 * r, cy - 108 + off, cx + 86 * r, cy - 20 + off, cx + 10 * r, cy + 18 + off);
    g.bezierCurveTo(cx + 44 * r, cy - 34 + off, cx + 26 * r, cy - 96 + off, cx, cy - 150 + off);
    g.fill();
  };
  g.save();
  g.shadowColor = 'rgba(90,120,255,0.8)'; g.shadowBlur = 24;
  flame(1, 0, 0.9);
  g.restore();
  flame(-0.92, 26, 0.55);
  // 文字
  g.textAlign = 'center';
  g.fillStyle = '#eaf1fb';
  g.font = 'italic bold 58px "Segoe UI", Arial, sans-serif';
  g.fillText('Snapdragon', cx, cy + 116);
  const tg = g.createLinearGradient(cx - 180, cy, cx + 180, cy + 90);
  tg.addColorStop(0, '#dfe9fb'); tg.addColorStop(1, '#8fb6ff');
  g.fillStyle = tg;
  g.font = '900 104px "Segoe UI", Arial, sans-serif';
  g.fillText('8 ELITE', cx, cy + 216);
  try { g.letterSpacing = '5px'; } catch (e) { /* 旧浏览器忽略 */ }
  g.fillStyle = '#93a6c0';
  g.font = '26px Consolas, monospace';
  g.fillText('SM8750-AB · 3nm PLATFORM', cx, cy + 272);
  try { g.letterSpacing = '0px'; } catch (e) { }
  g.textAlign = 'left';
  g.fillStyle = '#7f92ad';
  g.font = '22px Consolas, monospace';
  g.fillText('P2385.00', 44, s - 46);
  g.fillText('MSL3 · TW', s - 190, s - 46);
});

// —— DRAM 表面 ——
const dramTex = canvasTex(1024, (g, s) => {
  g.fillStyle = '#0c2015'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(30,90,56,0.9)'; g.lineWidth = 2;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
    const x = 40 + i * 120, y = 40 + j * 195;
    g.fillStyle = 'rgba(18,44,29,0.85)';
    g.fillRect(x, y, 104, 172);
    g.strokeRect(x, y, 104, 172);
    g.fillStyle = 'rgba(60,140,95,0.35)';
    g.font = '16px Consolas, monospace';
    g.fillText('BANK' + (i * 5 + j), x + 12, y + 30);
  }
  g.textAlign = 'center';
  g.fillStyle = '#d2ead9';
  g.font = 'bold 84px "Segoe UI", Arial, sans-serif';
  g.fillText('LPDDR5X', s / 2, s / 2 - 10);
  g.font = '34px Consolas, monospace';
  g.fillStyle = '#8fbfa4';
  g.fillText('16GB SDRAM · PKD900-VNB', s / 2, s / 2 + 46);
  g.textAlign = 'left';
});

// —— 地面：极坐标网格 ——
const groundTex = canvasTex(1024, (g, s) => {
  g.fillStyle = '#04060b'; g.fillRect(0, 0, s, s);
  const c = s / 2;
  const rg = g.createRadialGradient(c, c, 0, c, c, c);
  rg.addColorStop(0, 'rgba(30,60,110,0.30)');
  rg.addColorStop(0.45, 'rgba(18,36,66,0.12)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(96,148,226,0.10)'; g.lineWidth = 1.5;
  for (let r = 72; r < c; r += 72) { g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); }
  g.strokeStyle = 'rgba(96,148,226,0.06)';
  for (let i = 0; i < 24; i++) {
    g.beginPath(); g.moveTo(c, c);
    g.lineTo(c + Math.cos(i / 24 * Math.PI * 2) * c, c + Math.sin(i / 24 * Math.PI * 2) * c);
    g.stroke();
  }
  g.strokeStyle = 'rgba(79,195,247,0.22)'; g.lineWidth = 2;
  g.beginPath(); g.arc(c, c, 216, 0, 7); g.stroke();
});

// —— 辉光 / 粒子贴图 ——
const glowTex = canvasTex(256, (g, s) => {
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, s, s);
});
const dotTex = canvasTex(64, (g, s) => {
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, s, s);
});

// ============================================================
// 环境布置：地面 / 光垫 / 光环 / 粒子
// ============================================================
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 72),
    new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 0.92, metalness: 0.08 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  scene.add(ground);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 15),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: 0x1e6fa8, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = -0.115;
  scene.add(pad);

  S.rings = [];
  [[6.9, 0.016, 0x2a9fd8, 0.5], [8.4, 0.012, 0x8b7cf6, 0.38]].forEach(([r, tube, col, op]) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, tube, 8, 128),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.05;
    scene.add(ring);
    S.rings.push(ring);
  });

  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-14, 14);
    pos[i * 3 + 1] = rand(-0.2, 13);
    pos[i * 3 + 2] = rand(-14, 14);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.075, map: dotTex, color: 0x5fc8f7, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(pts);
  S.particles = pts;
}

// ============================================================
// 芯片建模
// ============================================================
const chipRoot = new THREE.Group();
scene.add(chipRoot);

const parts = new Map();          // id → part
const pickables = [];
const layerOrder = [];            // {part, delay}

function registerPart(def, kind) {
  const part = {
    id: def.id, def, kind,
    meshes: [], edges: [],
    group: null, anchor: new THREE.Object3D(),
    pop: 0, popT: 0,
    baseEmissive: null, matRefs: [],
  };
  parts.set(def.id, part);
  return part;
}

function addMesh(part, geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.partId = part.id;
  const eg = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0 })
  );
  eg.raycast = () => { };
  m.add(eg);
  part.meshes.push(m);
  part.edges.push(eg.material);
  part.matRefs.push(mat);
  pickables.push(m);
  parent.add(m);
  return m;
}

// —— 1. BGA 焊球 ——
{
  const part = registerPart(LAYERS[0], 'layer');
  const grp = new THREE.Group();
  const n = 24, pitch = 10 / n;
  const geo = new THREE.SphereGeometry(0.068, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9973f, metalness: 0.92, roughness: 0.3 });
  const inst = new THREE.InstancedMesh(geo, mat, n * n);
  inst.userData.partId = 'balls';
  inst.castShadow = true;
  const dummy = new THREE.Object3D();
  let i = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    dummy.position.set(-5 + pitch * (a + 0.5), 0, -5 + pitch * (b + 0.5));
    dummy.updateMatrix();
    inst.setMatrixAt(i++, dummy.matrix);
  }
  grp.add(inst);
  part.meshes.push(inst); part.matRefs.push(mat);
  pickables.push(inst);
  part.group = grp;
  part.anchor.position.set(5.7, 0.2, 2.6);
  grp.add(part.anchor);
  chipRoot.add(grp);
  layerOrder.push({ part, delay: 0 });
}

// —— 2. 封装基板 ——
{
  const part = registerPart(LAYERS[1], 'layer');
  const grp = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ map: substrateTex, metalness: 0.35, roughness: 0.62 });
  const side = new THREE.MeshStandardMaterial({ color: 0x6e5a26, metalness: 0.55, roughness: 0.5 });
  const geo = new THREE.BoxGeometry(10, 0.3, 10);
  const m = new THREE.Mesh(geo, [side, side, top, top, side, side]);
  m.position.y = 0.2;
  m.castShadow = true; m.receiveShadow = true;
  m.userData.partId = 'substrate';
  const eg = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0 }));
  eg.raycast = () => { };
  m.add(eg);
  part.meshes.push(m); part.edges.push(eg.material); part.matRefs.push(top, side);
  pickables.push(m);
  grp.add(m);
  part.group = grp;
  part.anchor.position.set(5.8, 0.6, 2.7);
  grp.add(part.anchor);
  chipRoot.add(grp);
  layerOrder.push({ part, delay: 0.08 });
}

// —— 3. 裸片（基片 + 功能区块）——
let dieGroup;
{
  const part = registerPart(LAYERS[2], 'layer');
  const grp = new THREE.Group();
  dieGroup = grp;
  const top = new THREE.MeshStandardMaterial({ map: dieTex, metalness: 0.5, roughness: 0.38 });
  const side = new THREE.MeshStandardMaterial({ color: 0x0e1116, metalness: 0.55, roughness: 0.4 });
  const geo = new THREE.BoxGeometry(DIE_W, 0.22, DIE_D);
  const slab = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  slab.position.y = 0.46;
  slab.castShadow = true; slab.receiveShadow = true;
  slab.userData.partId = 'die';
  const eg = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0 }));
  eg.raycast = () => { };
  slab.add(eg);
  part.meshes.push(slab); part.edges.push(eg.material); part.matRefs.push(top, side);
  pickables.push(slab);
  grp.add(slab);
  part.group = grp;
  part.anchor.position.set(DIE_W / 2 + 0.5, 1.15, DIE_D / 2 + 0.35);
  grp.add(part.anchor);
  chipRoot.add(grp);
  layerOrder.push({ part, delay: 0.16 });

  // 功能区块
  for (const def of BLOCKS) {
    const bp = registerPart(def, 'block');
    for (const [cx, cz, wmm, dmm, h, color] of def.shapes) {
      const bg = new THREE.BoxGeometry(wmm * MM, h, dmm * MM);
      const bm = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), metalness: 0.28, roughness: 0.52,
        emissive: new THREE.Color(color), emissiveIntensity: 0.10,
      });
      bp.baseEmissive = bp.baseEmissive || { i: 0.10 };
      addMesh(bp, bg, bm, cx * MM, DIE_TOP + h / 2, cz * MM, grp);
    }
    const top0 = DIE_TOP + Math.max(...def.shapes.map(s => s[4]));
    bp.anchor.position.set(def.shapes[0][0] * MM, top0 + 0.12, def.shapes[0][1] * MM);
    grp.add(bp.anchor);
  }
}

// —— 4. TIM ——
{
  const part = registerPart(LAYERS[3], 'layer');
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff, transparent: true, opacity: 0.5, metalness: 0.05, roughness: 0.2,
    emissive: 0x2a6fa8, emissiveIntensity: 0.6,
  });
  const geo = new THREE.BoxGeometry(3.0, 0.06, 2.5);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.8;
  m.userData.partId = 'tim';
  const eg = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0 }));
  eg.raycast = () => { };
  m.add(eg);
  part.meshes.push(m); part.edges.push(eg.material); part.matRefs.push(mat);
  pickables.push(m);
  grp.add(m);
  part.group = grp;
  part.anchor.position.set(3.5, 1.3, 2.0);
  grp.add(part.anchor);
  chipRoot.add(grp);
  layerOrder.push({ part, delay: 0.24 });
}

// —— 5. 屏蔽盖 ——
{
  const part = registerPart(LAYERS[4], 'layer');
  const grp = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x3d4756, metalness: 0.6, roughness: 0.46, transparent: true, opacity: 1 });
  const topM = new THREE.MeshStandardMaterial({ map: lidTex, metalness: 0.55, roughness: 0.5, transparent: true, opacity: 1 });
  const wallH = 0.67, half = 4.75, wallT = 0.14;
  const mkWall = (w, d, x, z) => {
    const g = new THREE.BoxGeometry(w, wallH, d);
    const m = new THREE.Mesh(g, body);
    m.position.set(x, 0.83 + wallH / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.partId = 'lid';
    const eg = new THREE.LineSegments(new THREE.EdgesGeometry(g),
      new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0 }));
    eg.raycast = () => { };
    m.add(eg);
    part.meshes.push(m); part.edges.push(eg.material); part.matRefs.push(body);
    pickables.push(m);
    grp.add(m);
  };
  mkWall(half * 2, wallT, 0, -(half - wallT / 2));
  mkWall(half * 2, wallT, 0, (half - wallT / 2));
  mkWall(wallT, half * 2, -(half - wallT / 2), 0);
  mkWall(wallT, half * 2, (half - wallT / 2), 0);
  const topGeo = new THREE.BoxGeometry(half * 2, 0.12, half * 2);
  const topMsh = new THREE.Mesh(topGeo, [body, body, topM, body, body, body]);
  topMsh.position.y = 0.83 + wallH + 0.06;
  topMsh.castShadow = true; topMsh.receiveShadow = true;
  topMsh.userData.partId = 'lid';
  {
    const eg = new THREE.LineSegments(new THREE.EdgesGeometry(topGeo),
      new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0 }));
    eg.raycast = () => { };
    topMsh.add(eg);
    part.edges.push(eg.material);
  }
  part.meshes.push(topMsh); part.matRefs.push(body, topM);
  pickables.push(topMsh);
  grp.add(topMsh);
  part.group = grp;
  part.anchor.position.set(5.4, 2.3, 2.6);
  grp.add(part.anchor);
  chipRoot.add(grp);
  layerOrder.push({ part, delay: 0.32 });
}

// —— 6. LPDDR5X（PoP）——
{
  const part = registerPart(LAYERS[5], 'layer');
  const grp = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ map: dramTex, metalness: 0.18, roughness: 0.58, transparent: true, opacity: 1 });
  const side = new THREE.MeshStandardMaterial({ color: 0x14251c, metalness: 0.25, roughness: 0.55, transparent: true, opacity: 1 });
  const geo = new THREE.BoxGeometry(9.6, 0.45, 9.6);
  const m = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  m.position.y = 1.62 + 0.225;
  m.castShadow = true; m.receiveShadow = true;
  m.userData.partId = 'dram';
  const eg = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0 }));
  eg.raycast = () => { };
  m.add(eg);
  part.meshes.push(m); part.edges.push(eg.material); part.matRefs.push(top, side);
  pickables.push(m);
  grp.add(m);
  part.group = grp;
  part.anchor.position.set(5.5, 3.4, 2.7);
  grp.add(part.anchor);
  chipRoot.add(grp);
  layerOrder.push({ part, delay: 0.4 });
}

// 选中辉光精灵（跟随选中部件锚点）
const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0x4fc3f7, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
glowSprite.scale.set(3, 3, 1);
scene.add(glowSprite);

// ============================================================
// 3D 标注（HTML + SVG 引线）
// ============================================================
const labelRoot = document.getElementById('labels');
const labelSvg = document.getElementById('labelSvg');
const labelPool = [];

function getLabel(i) {
  if (!labelPool[i]) {
    const div = document.createElement('div');
    div.className = 'lbl';
    div.innerHTML = '<span class="nm"></span><span class="en"></span>';
    labelRoot.appendChild(div);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', 'rgba(140,200,255,0.55)');
    line.setAttribute('stroke-width', '1');
    labelSvg.appendChild(line);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '2.6');
    dot.setAttribute('fill', '#8fd0ff');
    labelSvg.appendChild(dot);
    labelPool.push({ div, line, dot });
  }
  return labelPool[i];
}

const _v = new THREE.Vector3();
function updateLabels() {
  const actives = [];
  const expShow = S.explodeT > 0.04;
  for (const { part } of layerOrder) {
    if (expShow || S.selected === part.id) actives.push(part);
  }
  if (S.hovered && parts.get(S.hovered)?.kind === 'block' && !actives.some(p => p.id === S.hovered)) {
    actives.push(parts.get(S.hovered));
  }
  if (S.selected && !actives.some(p => p.id === S.selected)) actives.push(parts.get(S.selected));

  const w = innerWidth, h = innerHeight;
  const mobile = w < 900;
  const sx0 = mobile ? 12 : 282, sx1 = mobile ? w - 12 : w - 332;
  const sy0 = mobile ? 112 : 68, sy1 = mobile ? h - 150 : h - 142;
  for (let i = 0; i < actives.length; i++) {
    const part = actives[i];
    part.anchor.getWorldPosition(_v);
    _v.project(camera);
    const L = getLabel(i);
    if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) {
      L.div.style.opacity = '0'; L.line.style.opacity = '0'; L.dot.style.opacity = '0';
      continue;
    }
    const x = (_v.x * 0.5 + 0.5) * w;
    const y = (-_v.y * 0.5 + 0.5) * h;
    // 标签钳位到安全区（避开顶栏/面板），引线仍指向真实锚点
    const lx = clamp(x, sx0, sx1);
    const ly = clamp(y - 16, sy0, sy1);
    L.div.style.opacity = part.id === S.selected ? '1' : '0.88';
    L.div.style.setProperty('--c', part.def.color);
    L.div.style.borderColor = part.def.color;
    L.div.style.left = lx + 'px';
    L.div.style.top = ly + 'px';
    L.div.querySelector('.nm').textContent = part.def.name;
    L.div.querySelector('.en').textContent = part.def.en;
    L.line.setAttribute('x1', x); L.line.setAttribute('y1', y);
    L.line.setAttribute('x2', lx); L.line.setAttribute('y2', ly + 5);
    L.line.style.opacity = '0.7';
    L.dot.setAttribute('cx', x); L.dot.setAttribute('cy', y);
    L.dot.setAttribute('fill', part.def.color);
    L.dot.style.opacity = '1';
  }
  for (let i = actives.length; i < labelPool.length; i++) {
    const L = labelPool[i];
    L.div.style.opacity = '0'; L.line.style.opacity = '0'; L.dot.style.opacity = '0';
  }
}

// ============================================================
// 高亮 / 选择
// ============================================================
function setPartEmissive(part, intensity) {
  for (const m of part.matRefs) {
    if (!m.emissive) continue;
    // 基准强度只认"非黑自发光"：MeshStandardMaterial.emissiveIntensity 默认为 1（黑色时无效应），
    // 不能直接当基准，否则部件色荧光会把整个封装洗白
    if (m.userData.baseEmI === undefined) {
      m.userData.baseEmI = m.emissive.getHex() !== 0x000000 ? m.emissiveIntensity : 0;
    }
    if (m.emissive.getHex() === 0x000000) m.emissive.set(part.def.color);
    m.emissiveIntensity = m.userData.baseEmI + intensity;
  }
  const eo = intensity > 0.05 ? clamp(0.25 + intensity, 0, 1) : 0;
  for (const e of part.edges) e.opacity = eo;
}

function applyHighlights() {
  const t = S.elapsed;
  for (const part of parts.values()) {
    let inten = 0;
    if (part.id === S.selected) inten = 0.4 + 0.28 * Math.sin(t * 4.2);
    else if (part.id === S.hovered) inten = 0.22;
    setPartEmissive(part, inten);
    // 区块弹起动画
    let popGoal = part.id === S.selected && part.kind === 'block' ? 1 : 0;
    part.popT = popGoal;
    part.pop += (popGoal - part.pop) * 0.16;
    if (part.kind === 'block') {
      for (const m of part.meshes) {
        const base = m.userData.baseY;
        m.position.y = base + part.pop * 0.14;
      }
    }
  }
  // 选中辉光
  if (S.selected) {
    const p = parts.get(S.selected);
    p.anchor.getWorldPosition(_v);
    glowSprite.position.copy(_v);
    const sc = p.kind === 'block' ? 1.6 : 3.2;
    glowSprite.scale.set(sc + 0.35 * Math.sin(t * 4.2), sc + 0.35 * Math.sin(t * 4.2), 1);
    glowSprite.material.color.set(p.def.color);
    glowSprite.material.opacity = 0.5 + 0.18 * Math.sin(t * 4.2);
  } else {
    glowSprite.material.opacity = 0;
  }
}

// 记录区块基准高度
for (const part of parts.values()) {
  if (part.kind === 'block') for (const m of part.meshes) m.userData.baseY = m.position.y;
}

// ============================================================
// 拾取
// ============================================================
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function pickAt(nx, ny) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  pointerNdc.set(nx, ny);
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  // 淡出中的遮挡层不参与拾取，保证"透视选中"手感
  const hit = hits.find(h => !fadedLayers.has(h.object.userData.partId));
  if (hit) {
    const pid = hit.object.userData.partId;
    if (pid && parts.has(pid)) return { id: pid, part: parts.get(pid), point: hit.point.clone() };
  }
  return null;
}

// 选中裸片区块时，上方封装层自动半透明化（透视看内部）
const fadedLayers = new Set();
function updateLayerFade(dt) {
  const goal = (S.selected && parts.get(S.selected)?.kind === 'block') ? 1 : 0;
  S.fade = (S.fade ?? 0) + (goal - (S.fade ?? 0)) * Math.min(1, dt * 5);
  if (Math.abs(goal - S.fade) < 0.002) S.fade = goal;
  const k = 1 - 0.85 * S.fade;
  for (const id of ['tim', 'lid', 'dram']) {
    const p = parts.get(id);
    for (const m of p.matRefs) {
      if (m.userData.baseOp === undefined) m.userData.baseOp = m.opacity;
      m.opacity = m.userData.baseOp * k;
    }
    const cast = k > 0.5;
    for (const mesh of p.meshes) mesh.castShadow = cast;
    if (k < 0.3) fadedLayers.add(id); else fadedLayers.delete(id);
  }
}

let downPos = null, dragging = false;
renderer.domElement.addEventListener('pointerdown', e => {
  downPos = [e.clientX, e.clientY];
  dragging = false;
});
renderer.domElement.addEventListener('pointermove', e => {
  if (downPos && (Math.abs(e.clientX - downPos[0]) + Math.abs(e.clientY - downPos[1]) > 6)) dragging = true;
  if (e.pointerType === 'mouse' && !dragging) {
    const hit = pickAt(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    setHovered(hit ? hit.id : null);
    renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
  }
});
renderer.domElement.addEventListener('pointerup', e => {
  const wasDrag = dragging;
  downPos = null; dragging = false;
  if (wasDrag || e.button !== 0) return;
  const hit = pickAt(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  selectPart(hit ? hit.id : null);
});
renderer.domElement.addEventListener('pointerleave', () => setHovered(null));

function setHovered(id) {
  if (S.hovered === id) return;
  S.hovered = id;
}

// ============================================================
// UI：部件清单 / 详情 / 工具栏
// ============================================================
const $ = s => document.querySelector(s);

function buildList() {
  const root = $('#partsPanel');
  for (const g of GROUPS) {
    const h = document.createElement('h3');
    h.textContent = g.title;
    root.appendChild(h);
    for (const id of g.ids) {
      const p = parts.get(id);
      const it = document.createElement('div');
      it.className = 'pitem';
      it.dataset.id = id;
      it.innerHTML = `<span class="dot" style="background:${p.def.color};color:${p.def.color}"></span>` +
        `<span class="nm">${p.def.name}</span><span class="tag">${p.def.category}</span>`;
      it.addEventListener('mouseenter', () => setHovered(id));
      it.addEventListener('mouseleave', () => setHovered(null));
      it.addEventListener('click', () => selectPart(id));
      root.appendChild(it);
    }
  }
}

function markListActive() {
  document.querySelectorAll('.pitem').forEach(el => {
    el.classList.toggle('active', el.dataset.id === S.selected);
    if (el.dataset.id === S.selected) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function renderDetail(id) {
  const box = $('#detailPanel');
  if (!id) {
    box.innerHTML = `
      <span class="cat">芯片总览</span>
      <h2>${CHIP.name}</h2>
      <div class="en">${CHIP.en} · ${CHIP.model}</div>
      <table class="specs">${OVERVIEW_SPECS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <p class="desc">${OVERVIEW_DESC}</p>
      <div class="foot">${DISCLAIMER}</div>`;
    return;
  }
  const p = parts.get(id);
  const meta = p.kind === 'block'
    ? `<tr><td>所属</td><td>SoC 裸片 · ${p.def.category}</td></tr>`
    : `<tr><td>层级</td><td>封装第 ${LAYERS.findIndex(l => l.id === id) + 1} 层（自下而上）</td></tr>`;
  box.innerHTML = `
    <span class="cat">${p.def.category}</span>
    <h2>${p.def.name}</h2>
    <div class="en">${p.def.en}</div>
    <table class="specs">${meta}${p.def.specs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    <p class="desc">${p.def.desc}</p>
    <div class="foot">${DISCLAIMER}</div>`;
}

function selectPart(id) {
  S.selected = id;
  markListActive();
  renderDetail(id);
  if (id) {
    const p = parts.get(id);
    p.anchor.getWorldPosition(_v);
    S.focusGoalY = clamp(_v.y * 0.55 + 0.7, 0.9, 6);
    S.focusHoldUntil = S.elapsed + 1.5;
  }
}

// —— 工具栏 ——
function setExplodeTarget(t, opts = {}) {
  S.explodeTarget = clamp(t, 0, 1);
  if (opts.scrub) S.explodeT = S.explodeTarget;
  S.focusGoalY = 0.9 + S.explodeT * 3.1;
  S.focusHoldUntil = S.elapsed + 1.4;
  $('#explodeSlider').value = Math.round(S.explodeTarget * 100);
  $('#btnExplode').querySelector('.tx').textContent = S.explodeTarget > 0.5 ? '一键还原' : '一键拆解';
}
function toggleExplode() {
  setExplodeTarget(S.explodeTarget > 0.5 ? 0 : 1);
}

function flyTo(az, el, dist, tx, ty, tz, dur = 1.2) {
  const az0 = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  const el0 = Math.asin(clamp((camera.position.y - controls.target.y) / camera.position.distanceTo(controls.target), -1, 1));
  const d0 = camera.position.distanceTo(controls.target);
  S.fly = {
    az0: az0 / Math.PI * 180, el0: el0 / Math.PI * 180, d0,
    t0: controls.target.clone(),
    az1: az, el1: el, d1: dist, t1: new THREE.Vector3(tx, ty, tz),
    start: S.elapsed, dur,
  };
}

function tickFly() {
  if (!S.fly) return;
  const k = easeOut((S.elapsed - S.fly.start) / S.fly.dur);
  if (k >= 1) {
    applyViewNow(S.fly.az1, S.fly.el1, S.fly.d1, S.fly.t1.x, S.fly.t1.y, S.fly.t1.z);
    S.fly = null;
    return;
  }
  let az = S.fly.az0 + (S.fly.az1 - S.fly.az0) * k;
  // 走最短弧
  while (az - S.fly.az0 > 180) az -= 360;
  while (az - S.fly.az0 < -180) az += 360;
  const el = S.fly.el0 + (S.fly.el1 - S.fly.el0) * k;
  const d = S.fly.d0 + (S.fly.d1 - S.fly.d0) * k;
  const t = S.fly.t0.clone().lerp(S.fly.t1, k);
  applyViewNow(az, el, d, t.x, t.y, t.z);
}

controls.addEventListener('start', () => {
  S.fly = null;
  if (S.autoRotate) { S.autoRotate = false; controls.autoRotate = false; $('#btnRotate').classList.remove('active'); }
});

$('#btnExplode').addEventListener('click', toggleExplode);
$('#explodeSlider').addEventListener('input', e => setExplodeTarget(e.target.value / 100, { scrub: true }));
$('#btnRotate').addEventListener('click', () => {
  S.autoRotate = !S.autoRotate;
  controls.autoRotate = S.autoRotate;
  $('#btnRotate').classList.toggle('active', S.autoRotate);
});
$('#btnReset').addEventListener('click', () => {
  selectPart(null);
  flyTo(...DEFAULT_VIEW, 1.1);
});
$('#btnShot').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = 'snapdragon8-elite-' + Date.now() + '.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});
const helpModal = $('#helpModal');
$('#btnHelp').addEventListener('click', () => helpModal.classList.add('show'));
$('#helpClose').addEventListener('click', () => helpModal.classList.remove('show'));
helpModal.addEventListener('click', e => { if (e.target === helpModal) helpModal.classList.remove('show'); });

// 键盘
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); toggleExplode(); }
  else if (e.key === 'r' || e.key === 'R') { selectPart(null); flyTo(...DEFAULT_VIEW, 1.1); }
  else if (e.key === 'a' || e.key === 'A') $('#btnRotate').click();
  else if (e.key === 'h' || e.key === 'H' || e.key === '?') helpModal.classList.toggle('show');
  else if (e.key === 'Escape') {
    if (helpModal.classList.contains('show')) helpModal.classList.remove('show');
    else selectPart(null);
  }
});

// 移动端页签
$('#tabLeft').addEventListener('click', () => { $('#partsPanel').classList.toggle('open'); $('#detailPanel').classList.remove('open'); });
$('#tabRight').addEventListener('click', () => { $('#detailPanel').classList.toggle('open'); $('#partsPanel').classList.remove('open'); });

// 提示条自动淡出
setTimeout(() => $('#hint').classList.add('fade'), 9000);

// ============================================================
// 主循环
// ============================================================
function applyExplode() {
  for (const { part, delay } of layerOrder) {
    const p = smooth01((S.explodeT - delay) / (1 - delay));
    part.group.position.y = part.def.lift * p;
  }
}

function step(dt) {
  S.elapsed += dt;
  // 拆解缓动
  const diff = S.explodeTarget - S.explodeT;
  S.explodeT += diff * Math.min(1, dt * (S.introStage < 2 ? 0.85 : 1.6) * 1.8);
  if (Math.abs(S.explodeTarget - S.explodeT) < 0.0006) S.explodeT = S.explodeTarget;
  applyExplode();

  // 入场编排
  if (S.intro) {
    S.introT += dt;
    if (S.introStage === 0 && S.introT > 0.55) { S.introStage = 1; flyTo(...DEFAULT_VIEW, 2.3); }
    else if (S.introStage === 1 && S.introT > 1.35) { S.introStage = 2; setExplodeTarget(0); }
    else if (S.introStage === 2 && S.explodeT === 0) { S.introStage = 3; S.intro = false; }
  }

  // 相机飞行
  tickFly();
  // 选中/拆解后的目标点缓升
  if (S.elapsed < S.focusHoldUntil && !S.fly) {
    controls.target.y += (S.focusGoalY - controls.target.y) * Math.min(1, dt * 2.6);
  }
  controls.update();

  // 环境动效
  S.rings[0].rotation.z += dt * 0.05;
  S.rings[1].rotation.z -= dt * 0.035;
  const pp = S.particles.geometry.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    let y = pp.getY(i) + dt * 0.14;
    if (y > 13) y = -0.2;
    pp.setY(i, y);
    pp.setX(i, pp.getX(i) + Math.sin(S.elapsed * 0.4 + i) * dt * 0.02);
  }
  pp.needsUpdate = true;

  updateLayerFade(dt);
  applyHighlights();
  renderer.render(scene, camera);
  updateLabels();

  // FPS 统计
  S.fpsAcc += dt; S.fpsN++;
  if (S.fpsAcc >= 0.5) {
    S.fps = Math.round(S.fpsN / S.fpsAcc);
    S.fpsAcc = 0; S.fpsN = 0;
    const inf = renderer.info.render;
    $('#stats').textContent = `${S.fps} FPS · ${inf.calls} Draws · ${(inf.triangles / 1000).toFixed(0)}k Tris`;
  }
}

renderer.setAnimationLoop(() => step(Math.min(S.clock.getDelta(), 0.1)));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// 初始化 UI + QA 钩子
// ============================================================
buildList();
renderDetail(null);
document.title = '骁龙 8 至尊版 · 3D 拆解 | Snapdragon 8 Elite';
console.log('[SD8E] ready', BUILD, 'parts:', parts.size, 'meshes:', pickables.length);

window.__qa = {
  BUILD,
  errors,
  info() {
    const inf = renderer.info.render;
    return {
      build: BUILD,
      parts: parts.size, meshes: pickables.length,
      explodeT: +S.explodeT.toFixed(3), explodeTarget: S.explodeTarget,
      selected: S.selected, hovered: S.hovered,
      camera: { pos: camera.position.toArray().map(v => +v.toFixed(2)), target: controls.target.toArray().map(v => +v.toFixed(2)) },
      renderer: { calls: inf.calls, triangles: inf.triangles, fps: S.fps },
      fade: +(S.fade ?? 0).toFixed(2),
      webgl: renderer.getContext().getParameter(renderer.getContext().VERSION),
      labelsActive: labelPool.filter(L => L.div.style.opacity !== '0').length,
    };
  },
  view(az, el, d, tx, ty, tz) {
    S.focusHoldUntil = 0;   // 显式视角接管：停用目标点缓升，防止动画覆盖
    S.fly = null;
    applyViewNow(az, el, d, tx, ty, tz);
    camera.updateMatrixWorld();
    return { ok: true, camera: camera.position.toArray().map(v => +v.toFixed(2)) };
  },
  setExplode(t) { setExplodeTarget(t); return { target: S.explodeTarget }; },
  scrub(t) { setExplodeTarget(t, { scrub: true }); applyExplode(); return { t: +S.explodeT.toFixed(3) }; },
  select(id) {
    if (id !== null && !parts.has(id)) return { err: 'no part ' + id };
    selectPart(id);
    return { selected: S.selected };
  },
  parts() { return [...parts.values()].map(p => ({ id: p.id, kind: p.kind, name: p.def.name, meshes: p.meshes.length })); },
  layerY() {
    const o = {};
    for (const { part } of layerOrder) o[part.id] = +part.group.position.y.toFixed(3);
    return o;
  },
  pick(nx, ny) {
    const h = pickAt(nx, ny);
    return h ? { id: h.id, name: h.part.def.name, point: h.point.toArray().map(v => +v.toFixed(2)) } : null;
  },
  pickPart(id) {
    const p = parts.get(id);
    if (!p) return null;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    p.anchor.getWorldPosition(_v);
    _v.project(camera);
    if (_v.z > 1) return null;
    const h = pickAt(_v.x, _v.y);
    return h ? h.id : null;
  },
  rayDebug(id) {
    const p = parts.get(id);
    if (!p) return null;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    p.anchor.getWorldPosition(_v);
    _v.project(camera);
    const ndc = { x: +_v.x.toFixed(4), y: +_v.y.toFixed(4) };
    pointerNdc.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(pickables, false).slice(0, 4).map(h => ({
      id: h.object.userData.partId, d: +h.distance.toFixed(3),
      pt: h.point.toArray().map(v => +v.toFixed(2)),
    }));
    const aw = new THREE.Vector3();
    p.anchor.getWorldPosition(aw);
    return {
      ndc, anchor: aw.toArray().map(v => +v.toFixed(2)),
      cam: camera.position.toArray().map(v => +v.toFixed(2)),
      dieY: dieGroup.position.y, hits,
    };
  },
  stash(id, off = true) {
    const p = parts.get(id);
    if (!p) return null;
    if (off) {
      if (p.group.userData._sx === undefined) p.group.userData._sx = p.group.position.x;
      p.group.position.x = p.group.userData._sx + 500;
    } else if (p.group.userData._sx !== undefined) {
      p.group.position.x = p.group.userData._sx;
      delete p.group.userData._sx;
    }
    return { id, x: +p.group.position.x.toFixed(1) };
  },
  frames(n, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); return { stepped: n, t: +S.elapsed.toFixed(2) }; },
  reset() { selectPart(null); flyTo(...DEFAULT_VIEW, 1.1); return { ok: true }; },
  pixel(x = 0.5, y = 0.5) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const c = renderer.domElement;
    const buf = new Uint8Array(4);
    gl.readPixels(Math.floor(c.width * x), Math.floor(c.height * (1 - y)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return [...buf];
  },
  texCs() {
    return { out: renderer.outputColorSpace, sub: substrateTex.colorSpace, tone: renderer.toneMapping, exp: renderer.toneMappingExposure };
  },
  tune(envI, keyI, ambI, hemiI, exp) {
    scene.environmentIntensity = envI;
    keyLight.intensity = keyI;
    S.ambient.intensity = ambI;
    S.hemi.intensity = hemiI;
    renderer.toneMappingExposure = exp;
    renderer.render(scene, camera);
    return { env: envI, key: keyI, amb: ambI, hemi: hemiI, exp };
  },
  matInfo(id) {
    const p = parts.get(id);
    if (!p) return null;
    return p.matRefs.map(m => ({
      color: '#' + m.color.getHexString(),
      emissive: '#' + m.emissive.getHexString(),
      emI: m.emissiveIntensity,
      metal: m.metalness, rough: m.roughness,
      hasMap: !!m.map,
    }));
  },
};

function fatal(msg) {
  const f = $('#fatal');
  f.classList.add('show');
  f.querySelector('p').textContent = msg;
}

// ---------- 加载条 → 淡出 ----------
{
  const fill = document.getElementById('loadbarFill');
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(100, p + rand(18, 34));
    fill.style.width = p + '%';
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => document.getElementById('loader').classList.add('hide'), 260);
    }
  }, 130);
}
