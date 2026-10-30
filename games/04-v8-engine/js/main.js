/* ============================================================================
   主程序: 场景 / 光照 / UI / 交互 / QA 钩子
============================================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { P, BANK, CYLS, FIRING_ORDER } from './params.js';
import { MAT, buildMaterials, bankToWorld, boltRing } from './kit.js';
import { buildLifterTables, solveRockers, rockerConst, valveTipS } from './kinem.js';
import { buildEngine } from './model.js';
import { Motion } from './motion.js';
import { runAudit } from './audit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const BOOT = async () => {
  buildMaterials();
  buildLifterTables();
  solveRockers();
  const { root, G, PARTS } = buildEngine();
  const motion = new Motion(G);
  const audits = runAudit(G);
  const auditPass = audits.filter(a => a.pass).length;

  /* ---------------- 渲染器 / 场景 ---------------- */
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = new THREE.Fog(0x07080b, 15, 32);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
  key.position.set(5.5, 7.5, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4.6; key.shadow.camera.right = 4.6;
  key.shadow.camera.top = 4.6; key.shadow.camera.bottom = -4.6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 22;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.target.position.set(0, 0.6, 3.7);
  scene.add(key.target);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db8e8, 1.0);
  rim.position.set(-6, 3, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.4);
  fill.position.set(0, -4, 7); scene.add(fill);
  scene.add(new THREE.AmbientLight(0x2a2c33, 0.35));

  // 地台: 接影暗面 + 微光晕 + 网格
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.96, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -1.46, 3.7);
  ground.receiveShadow = true;
  scene.add(ground);
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const gctx = gc.getContext('2d');
  const grad = gctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(70,95,135,0.20)');
  grad.addColorStop(0.6, 'rgba(40,55,85,0.07)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  gctx.fillStyle = grad; gctx.fillRect(0, 0, 256, 256);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(8.5, 48),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, -1.455, 3.7);
  scene.add(glow);
  const grid = new THREE.GridHelper(22, 44, 0x22304a, 0x141d30);
  grid.material.transparent = true; grid.material.opacity = 0.18;
  grid.position.set(0, -1.455, 3.7);
  scene.add(grid);
  scene.add(root);
  root.position.set(0, 0, 0);

  // 阴影: 全部实体件投影; 细密齿/链/弹簧/线缆不投影(放射状碎影伪影源)
  root.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) {
      o.castShadow = true; o.receiveShadow = true;
    }
  });
  G.flash.forEach(f => { f.castShadow = false; });
  G.liners.forEach(l => { l.castShadow = false; l.receiveShadow = false; });
  G.timing.traverse(o => { if (o.isInstancedMesh) o.castShadow = false; });   // 链条
  G.crank.traverse(o => {                                                     // 齿圈/链轮齿
    if (o.isInstancedMesh) o.castShadow = false;
  });
  G.rockerArms.forEach(a => a.traverse(o => o.castShadow = true));
  G.springs.forEach(sp => { sp.castShadow = false; });                        // 弹簧细条
  G.dist.traverse(o => { if (o.geometry?.type === 'TubeGeometry') o.castShadow = false; }); // 高压线

  // 外围螺栓细节
  for (let b = 0; b < 2; b++) {
    const bk = BANK[b];
    // 气门室盖法兰螺栓(沿盖沿)
    for (let i = 0; i < 7; i++) {
      const z = 1.35 + i * 0.78;
      for (const t of [-0.52, 0.60]) {
        const p = bankToWorld(bk, t, P.headTop + 0.02, z);
        boltRing(root, [p.x, p.y, p.z], [bk.u[0], bk.u[1], 0], 0, 1, 0.02, 0.045);
      }
    }
    // 排气法兰双螺母
    for (const c of CYLS.filter(c => c.bank === b)) {
      const p = bankToWorld(bk, 0.755, 2.35, c.z);
      boltRing(root, [p.x, p.y, p.z], [bk.t[0], bk.t[1], 0], 0, 1, 0.024, 0.05);
    }
  }
  // 油底壳法兰螺栓
  for (let i = 0; i < 7; i++) {
    const z = 1.35 + i * 0.78;
    for (const s of [-1, 1]) boltRing(root, [s * 1.12, -0.315, z], [0, 1, 0], 0, 1, 0.024, 0.05);
  }

  /* ---------------- 相机 ---------------- */
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.set(0, 0.85, 3.7);
  controls.maxDistance = 20; controls.minDistance = 1.2;
  const CENTER = V3(0, 0.85, 3.7);
  const VIEWS = {
    threeq:  { az: 35, el: 18, d: 8.2 },
    front:   { az: 90, el: 8, d: 8.5 },
    side:    { az: 0, el: 4, d: 9.0 },
    top:     { az: 0, el: 78, d: 9.5 },
    rear:    { az: -140, el: 20, d: 8.5 },
    crank:   { az: 120, el: 28, d: 4.2, tg: V3(0, -0.1, 2.2) },
    valve:   { az: 10, el: 32, d: 4.6, tg: V3(-0.6, 1.6, 3.14) },
    piston:  { az: 55, el: 42, d: 4.0, tg: V3(0.5, 1.0, 3.14) },
    valley:  { az: -30, el: 55, d: 5.0, tg: V3(0, 1.2, 3.7) },
    timing:  { az: 65, el: 12, d: 4.0, tg: V3(0, 0.5, 0.8) },
    belt:    { az: 48, el: 18, d: 6.8, tg: V3(0.55, 0.85, 0.55) },
    starter: { az: -55, el: 8, d: 6.2, tg: V3(1.05, 0.15, 5.9) },
    filter:  { az: -38, el: 26, d: 5.4, tg: V3(1.0, 0.2, 2.6) },
  };
  let viewLock = null;
  function applyView(v) {
    const t = v.tg || CENTER;
    controls.target.copy(t);
    const a = v.az * Math.PI / 180, e = v.el * Math.PI / 180;
    camera.position.set(
      t.x + Math.cos(e) * Math.cos(a) * v.d,
      t.y + Math.sin(e) * v.d,
      t.z + Math.cos(e) * Math.sin(a) * v.d);
    camera.lookAt(t);
  }
  applyView(VIEWS.threeq);

  /* ---------------- 透明壳层(默认实体, 剖视展示内部) ---------------- */
  const shells = {
    block:  { groups: [G.block], op: 0.22, on: false },
    head:   { groups: [...G.heads], op: 0.22, on: false },
    cover:  { groups: [...G.covers], op: 0.24, on: false },
    intake: { groups: [G.intake], op: 0.26, on: false },
    pan:    { groups: [G.pan], op: 0.22, on: false },
  };
  // 标记保持实体的子件(火花塞)
  G.plugs.forEach(p => p.traverse(o => o.userData.solid = true));
  function setShell(key, on) {
    const s = shells[key]; s.on = on;
    for (const grp of s.groups) grp.traverse(o => {
      if (!o.isMesh || o.userData.solid) return;
      const m = o.material;
      m.transparent = on; m.opacity = on ? s.op : 1;
      m.depthWrite = !on;
      m.side = THREE.DoubleSide;
      o.castShadow = !on;
      o.renderOrder = on ? 2 : 0;   // 透明壳层最后绘制, 避免与内部件深度冲突亮线
      m.needsUpdate = true;
    });
  }
  for (const k in shells) setShell(k, shells[k].on);

  /* ---------------- 剖视(默认关闭, 保持完整外观) ---------------- */
  const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);
  let clipOn = false, clipX = 0.0;
  function updateClip() {
    clipPlane.constant = clipOn ? clipX : 10;
    const mats = new Set();
    for (const k in shells) for (const grp of shells[k].groups)
      grp.traverse(o => { if (o.isMesh && !o.userData.solid) mats.add(o.material); });
    G.liners.forEach(l => mats.add(l.material));
    for (const m of mats) {
      m.clippingPlanes = clipOn ? [clipPlane] : null;
      m.clipShadows = clipOn;
      m.needsUpdate = true;
    }
  }
  updateClip();

  /* ---------------- 爆炸视图 ---------------- */
  const explodeDirs = new Map();
  const U = (b) => V3(BANK[b].u[0], BANK[b].u[1], 0);
  const T = (b) => V3(BANK[b].t[0], BANK[b].t[1], 0);
  explodeDirs.set(G.block, V3(0, -0.55, 0));
  explodeDirs.set(G.pan, V3(0, -1.5, 0));
  explodeDirs.set(G.intake, V3(0, 1.6, 0));
  explodeDirs.set(G.dist, V3(0, 1.6, 1.2));
  explodeDirs.set(G.cam, V3(0, 0.75, 0));
  explodeDirs.set(G.timing, V3(0, 0, -1.3));
  explodeDirs.set(G.crank, V3(0, 0, -0.55));
  G.heads.forEach((h, b) => explodeDirs.set(h, U(b).multiplyScalar(0.62)));
  G.covers.forEach((cv, b) => explodeDirs.set(cv, U(b).multiplyScalar(1.25)));
  G.headers.forEach((h, b) => explodeDirs.set(h, T(b).multiplyScalar(1.9)));
  G.liners.forEach((l, i) => explodeDirs.set(l, U(CYLS[i].bank).multiplyScalar(0.30)));
  G.pistons.forEach((p, i) => explodeDirs.set(p, U(CYLS[i].bank).multiplyScalar(1.05)));
  G.rods.forEach((r, i) => explodeDirs.set(r, U(CYLS[i].bank).multiplyScalar(0.55)));
  for (let k = 0; k < 16; k++) {
    const b = rockerConstBank(k);
    explodeDirs.set(G.rockerArms[k], U(b).multiplyScalar(1.0));
    explodeDirs.set(G.rockerHolders[k], U(b).multiplyScalar(1.0));
    explodeDirs.set(G.valves[k], U(b).multiplyScalar(0.80));
    explodeDirs.set(G.springs[k], U(b).multiplyScalar(0.80));
    explodeDirs.set(G.retainers[k], U(b).multiplyScalar(0.80));
    explodeDirs.set(G.pushrods[k], V3(0, 0.55, 0).add(U(b).multiplyScalar(0.45)));
    explodeDirs.set(G.lifters[k], V3(0, 0.42, 0));
  }
  function rockerConstBank(k) { return CYLS[Math.floor(k / 2)].bank; }
  let explode = 0;
  function setExplode(t) {
    explode = t;
    const ease = t * t * (3 - 2 * t);
    for (const [obj, dir] of explodeDirs)
      obj.position.copy(obj.userData.basePos || obj.position).addScaledVector(dir, ease);
    G.flash.forEach(f => f.visible = t < 0.05);
  }

  /* ---------------- UI ---------------- */
  const $ = (id) => document.getElementById(id);
  const auditChip = $('audit');
  auditChip.textContent = `间隙自检 ${auditPass}/${audits.length} ${auditPass === audits.length ? '✓' : '✗'}`;
  auditChip.className = auditPass === audits.length ? '' : 'bad';
  auditChip.onclick = () => {
    $('auditPanel').style.display = $('auditPanel').style.display === 'block' ? 'none' : 'block';
  };
  const aList = $('auditPanel').querySelector('tbody');
  for (const a of audits) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.name}</td><td>${a.value}</td><td>≥${a.req}</td><td class="${a.pass ? 'ok' : 'bad'}">${a.pass ? '✓' : '✗'}</td>`;
    aList.appendChild(tr);
  }
  $('firing').textContent = '点火顺序 ' + FIRING_ORDER.join('-');

  // 部件列表
  const ul = $('partList');
  const liCls = [];
  PARTS.forEach((pt, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="nm">${pt.name}</span>`;
    li.onclick = () => {
      liCls.forEach(l => l.classList.remove('sel')); li.classList.add('sel');
      focusPart(pt);
    };
    ul.appendChild(li); liCls.push(li);
  });
  function focusPart(pt) {
    const box = new THREE.Box3().setFromObject(pt.obj);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(c);
    const dir = camera.position.clone().sub(CENTER).normalize();
    camera.position.copy(c).addScaledVector(dir, Math.max(1.6, size * 1.15));
    $('info').style.display = 'block';
    $('infoTitle').textContent = pt.name;
    $('infoDesc').textContent = pt.desc;
  }

  // 控制
  let playing = true;
  $('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '⏸ 暂停' : '▶ 运转'; };
  $('step').onclick = () => { playing = false; $('play').textContent = '▶ 运转'; motion.theta = (motion.theta + 15) % 720; motion.apply(); };
  $('rpm').oninput = e => { motion.rpm = +e.target.value; $('rpmVal').textContent = motion.rpm + ' rpm'; };
  $('explode').oninput = e => setExplode(+e.target.value);
  $('clip').onchange = e => { clipOn = e.target.checked; updateClip(); };
  $('clipX').oninput = e => { clipX = +e.target.value; updateClip(); };
  $('spark').onchange = e => motion.spark = e.target.checked;
  for (const k in shells) {
    $(`gh_${k}`).onchange = e => setShell(k, e.target.checked);
    $(`gh_${k}`).checked = shells[k].on;
  }
  document.querySelectorAll('#views button').forEach(b => {
    b.onclick = () => { applyView(VIEWS[b.dataset.v]); };
  });

  /* ---------------- 拾取高亮 ---------------- */
  const ray = new THREE.Raycaster();
  let hiMats = [];
  renderer.domElement.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const sx = (ev.clientX / innerWidth) * 2 - 1, sy = -(ev.clientY / innerHeight) * 2 + 1;
    ray.setFromCamera({ x: sx, y: sy }, camera);
    const hits = ray.intersectObjects(root.children, true);
    const hit = hits.find(h => h.object.isMesh && h.object.material?.emissive);
    clearHi();
    if (hit) {
      const pt = PARTS.find(p => isDescendant(p.obj, hit.object)) || PARTS[0];
      $('info').style.display = 'block';
      $('infoTitle').textContent = pt.name;
      $('infoDesc').textContent = pt.desc;
      hiMats = collectMats(pt.obj);
      hiMats.forEach(m => { m.userData._e = m.emissive.getHex(); m.emissive.setHex(0x1c3355); });
    }
  });
  function clearHi() { hiMats.forEach(m => m.emissive.setHex(m.userData._e ?? 0)); hiMats = []; }
  function collectMats(obj) {
    const s = new Set(); obj.traverse(o => { if (o.isMesh) s.add(o.material); }); return [...s];
  }
  function isDescendant(parent, node) {
    while (node) { if (node === parent) return true; node = node.parent; }
    return false;
  }

  /* ---------------- QA 钩子: 网格级错位校验 ---------------- */
  function verifyPlacements() {
    const out = [];
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const push = (name, err, tol) => out.push({ name, err: +err.toFixed(4), tol, pass: err <= tol });
    const tmp = new THREE.Vector3();
    // 1) 每缸: 活塞中心到缸套轴线偏差 + 沿轴行程上下界(防"在轴线上但位置错")
    for (let i = 0; i < 8; i++) {
      const bk = BANK[CYLS[i].bank];
      const pp = wp(G.pistons[i]), lp = wp(G.liners[i]);
      const s = pp.x * bk.u[0] + pp.y * bk.u[1];
      push(`活塞${i}-缸套轴线`, Math.hypot(pp.x - bk.u[0] * s, pp.y - bk.u[1] * s) + Math.abs(pp.z - lp.z), 0.002);
      {
        const m1 = s - P.skirtBelow - P.linerS0;          // 裙底余量(≥0 在缸套内)
        const m2 = P.deckS - (s + P.crownH);              // 顶面余量(≥0 未顶出)
        out.push({ name: `活塞${i}行程边界`, err: +Math.min(m1, m2).toFixed(4), tol: 0, pass: m1 >= -0.005 && m2 >= -0.005 });
      }
    }
    // 2) 缸体/缸盖/室盖包围盒 z 范围(检测 shape z 镜像类 bug)
    {
      const bb = new THREE.Box3().setFromObject(G.block);
      push('缸体包围盒z下界-0.99', Math.abs(bb.min.z - 0.99), 0.03);
      push('缸体包围盒z上界-6.50', Math.abs(bb.max.z - 6.50), 0.03);
      G.heads.forEach((h, b) => {
        const hb = new THREE.Box3().setFromObject(h);
        push(`缸盖${b}z下界-1.05`, Math.abs(hb.min.z - 1.05), 0.03);
        push(`缸盖${b}z上界-6.44`, Math.abs(hb.max.z - 6.44), 0.03);
      });
      G.covers.forEach((cv, b) => {
        const cb = new THREE.Box3().setFromObject(cv);
        push(`室盖${b}z范围`, Math.abs((cb.max.z - cb.min.z) - (6.44 - 1.05)), 0.05);
      });
    }
    // 3) 推杆底端 vs 挺柱柱心
    for (let k = 0; k < 16; k++) {
      const pr = G.pushrods[k];
      const half = pr.geometry.parameters.height / 2;
      const bot = tmp.set(0, -half, 0).applyQuaternion(pr.quaternion).add(pr.position);
      push(`推杆${k}底-挺柱`, Math.hypot(bot.x - G.lifters[k].position.x, bot.z - G.lifters[k].position.z), 0.004);
    }
    // 4) 摇臂枢轴网格位置 vs 理论
    for (let k = 0; k < 16; k++) {
      const rc = rockerConst[k];
      const th = wp(G.rockerArms[k]);
      const ex = bankToWorld(rc.bk, rc.pivot.t, rc.pivot.s, rc.z);
      push(`摇臂${k}枢轴位置`, th.distanceTo(ex), 0.002);
    }
    // 5) 气门杆顶 vs 摇臂输出垫底(渲染层接触, localToWorld 计入镜像 scale)
    for (let k = 0; k < 16; k++) {
      const rc = rockerConst[k];
      const vpos = wp(G.valves[k]);
      const u = new THREE.Vector3(rc.bk.u[0], rc.bk.u[1], 0);
      const tip = vpos.clone().addScaledVector(u, P.valveStemL);
      const rk = G.rockerArms[k];
      const pad = rk.localToWorld(tmp.set(rc.nout.t * rc.R_out, rc.nout.s * rc.R_out, 0));
      push(`气门${k}顶-摇臂垫`, tip.distanceTo(pad) - P.padR + 0, 0.006);
    }
    // 6) 火花塞 z 对缸心
    G.plugs.forEach((p, i) => {
      push(`火花塞${i}z`, Math.abs(wp(p).z - CYLS[i].z), 0.003);
    });
    return out;
  }

  /* ---------------- QA 钩子 ---------------- */
  let spinning = false, qaView = null;
  window.__qa = {
    state: () => ({
      theta: motion.theta, rpm: motion.rpm, explode, clipOn, clipX,
      shells: Object.fromEntries(Object.entries(shells).map(([k, v]) => [k, v.on])),
      audit: `${auditPass}/${audits.length}`,
    }),
    set: (k, v) => {
      if (k === 'rpm') { motion.rpm = v; $('rpm').value = v; $('rpmVal').textContent = v + ' rpm'; }
      if (k === 'theta') { motion.theta = v; motion.apply(); }
      if (k === 'explode') { setExplode(v); $('explode').value = v; }
      if (k === 'clip') { clipOn = !!v; $('clip').checked = !!v; updateClip(); }
      if (k === 'clipX') { clipX = v; updateClip(); }
      if (k === 'shell') { setShell(v.k, v.on); $(`gh_${v.k}`).checked = v.on; }
      if (k === 'spin') spinning = !!v;
      if (k === 'viewLock') qaView = null;
    },
    view: (a, e, d, tx, ty, tz) => {
      qaView = { az: a, el: e, d, tg: tx !== undefined ? V3(tx, ty, tz) : undefined };
      applyView(qaView);
    },
    preset: (n) => { qaView = VIEWS[n] ? { ...VIEWS[n] } : null; if (qaView) applyView(qaView); },
    spin: (on) => spinning = !!on,
    info: () => ({
      audit: `${auditPass}/${audits.length}`,
      tris: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      errors: window.__qaErrors || [],
    }),
    verify: () => {
      const v = verifyPlacements();
      return { pass: v.filter(x => x.pass).length + '/' + v.length, fails: v.filter(x => !x.pass) };
    },
    pick: (ndcX, ndcY) => {
      ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
      const hits = ray.intersectObjects(root.children, true);
      return hits.slice(0, 6).map(h => {
        let n = h.object, path = [];
        while (n && n !== root) { path.unshift(n.name || n.type); n = n.parent; }
        return { path: path.join('/'), dist: +h.distance.toFixed(2),
                 p: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)] };
      });
    },
    diag: () => {
      const o = { children: {}, valves: [] };
      const box = (obj) => new THREE.Box3().setFromObject(obj);
      for (const grpName of ['block']) {
        for (const ch of G[grpName].children) {
          const b = box(ch);
          if (b.min.z < 1.0 || b.max.z > 6.55)
            o.children[grpName + ':' + (ch.name || ch.type) + ':' + ch.uuid.slice(0, 6) + '_full'] =
              { z: [+b.min.z.toFixed(3), +b.max.z.toFixed(3)], y: [+b.min.y.toFixed(3), +b.max.y.toFixed(3)], x: [+b.min.x.toFixed(3), +b.max.x.toFixed(3)] };
          if (false)
            o.children[grpName + ':' + (ch.name || ch.type) + ':' + ch.uuid.slice(0, 6)] =
              [+b.min.z.toFixed(3), +b.max.z.toFixed(3), (ch.geometry?.type || '?'),
               `p=${ch.position.x.toFixed(2)},${ch.position.y.toFixed(2)},${ch.position.z.toFixed(2)} r=${ch.rotation.x.toFixed(2)},${ch.rotation.y.toFixed(2)},${ch.rotation.z.toFixed(2)}`];
        }
      }
      G.heads.forEach((h, i) => {
        for (const ch of h.children) {
          const b = box(ch);
          if (b.min.z < 1.0 || b.max.z > 6.55)
            o.children['head' + i + ':' + (ch.name || ch.type) + ':' + ch.uuid.slice(0, 6)] =
              [+b.min.z.toFixed(3), +b.max.z.toFixed(3)];
        }
      });
      for (const k of [0, 1, 8, 9]) {
        const rc = rockerConst[k];
        const rk = G.rockerArms[k];
        const vp = rk.parent; // root
        const rkw = rk.getWorldPosition(new THREE.Vector3());
        const q = rk.quaternion;
        const pad = new THREE.Vector3(rc.nout.t * rc.R_out, rc.nout.s * rc.R_out, 0)
          .applyQuaternion(q).add(rkw);
        const vw = G.valves[k].getWorldPosition(new THREE.Vector3());
        const u = new THREE.Vector3(rc.bk.u[0], rc.bk.u[1], 0);
        const tip = vw.clone().addScaledVector(u, P.valveStemL);
        o.valves.push({
          k, z: +rc.z.toFixed(3), betaQ: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)],
          pivotW: [+rkw.x.toFixed(3), +rkw.y.toFixed(3), +rkw.z.toFixed(3)],
          padW: [+pad.x.toFixed(3), +pad.y.toFixed(3), +pad.z.toFixed(3)],
          tipW: [+tip.x.toFixed(3), +tip.y.toFixed(3), +tip.z.toFixed(3)],
          dist: +tip.distanceTo(pad).toFixed(4),
        });
      }
      return o;
    },
  };
  window.__qaErrors = [];
  window.addEventListener('error', e => window.__qaErrors.push(String(e.message)));
  // QA 快捷别名(裸 view()/preset() 可用, 避免 ReferenceError 静默吞掉)
  window.view = window.__qa.view;
  window.preset = window.__qa.preset;

  /* ---------------- 主循环 ---------------- */
  const clock = new THREE.Clock();
  let fps = 0, fAcc = 0, fT = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (playing && explode < 0.02) motion.advance(dt);
    if (explode < 0.02) motion.apply();   // 爆炸状态下冻结运动学, 防止逐帧位置覆写冲掉爆炸位移
    if (spinning && !qaView) {
      const t = clock.elapsedTime * 0.15;
      controls.target.copy(CENTER);
      camera.position.set(CENTER.x + Math.cos(t) * 8.2, CENTER.y + 2.4, CENTER.z + Math.sin(t) * 8.2);
      camera.lookAt(CENTER);
    }
    if (qaView) applyView(qaView);
    controls.update();
    renderer.render(scene, camera);
    fAcc++; fT += dt;
    if (fT > 0.5) { fps = fAcc / fT; fAcc = 0; fT = 0; $('fps').textContent = fps.toFixed(0) + ' fps · ' + (renderer.info.render.triangles / 1000).toFixed(0) + 'k 三角'; }
  }
  loop();
  document.getElementById('loader').style.display = 'none';
};
BOOT().catch(e => {
  window.__qaErrors?.push(String(e));
  console.error(e);
  const el = document.getElementById('loader');
  if (el) el.innerHTML = `<p style="color:#ff7b72">初始化失败: ${e.message}</p><button onclick="location.reload()">重试</button>`;
});
