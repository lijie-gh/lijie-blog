/* 材质库 / 几何助手 —— three.js v0.169 */
import * as THREE from 'three';

/* ---------------- 程序化纹理 ---------------- */
function noiseTex(size, base, spread, rep = 3) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.06; i++) {
    const v = base + (Math.random() - 0.5) * spread;
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.5)`;
    g.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  return t;
}
function scratchTex(size, base, rep = 2) {   // 车削/拉丝纹(同心环)
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const v = Math.max(0, Math.min(255, base + (Math.random() - 0.5) * 46));
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.35)`;
    g.lineWidth = Math.random() * 1.4 + 0.3;
    const y = Math.random() * size;
    g.beginPath(); g.moveTo(0, y); g.lineTo(size, y + (Math.random() - 0.5) * 6); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  return t;
}

/* ---------------- 材质 ---------------- */
export const MAT = {};
export function buildMaterials() {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const rCast = noiseTex(256, 150, 90, 3);
  const rMach = scratchTex(256, 160, 2);
  const rRed = noiseTex(256, 120, 80, 4);
  const bCast = noiseTex(256, 128, 130, 5);
  const bMach = scratchTex(256, 128, 2);

  MAT.steelDark  = M({ color: 0x5d646e, metalness: .92, roughness: .42, roughnessMap: rCast, bumpMap: bCast, bumpScale: .012, envMapIntensity: .9 });
  MAT.steelBright= M({ color: 0xb9bfc8, metalness: 1.0, roughness: .24, roughnessMap: rMach, bumpMap: bMach, bumpScale: .005, envMapIntensity: 1.25 });
  MAT.chrome     = M({ color: 0xdfe3e9, metalness: 1.0, roughness: .09, envMapIntensity: 1.4 });
  MAT.alu        = M({ color: 0xb9bec6, metalness: .9,  roughness: .34, roughnessMap: rMach });
  MAT.pistonAlu  = M({ color: 0x9ba1ab, metalness: .88, roughness: .42, roughnessMap: rMach, envMapIntensity: .85 });
  MAT.aluCast    = M({ color: 0x666c76, metalness: .82, roughness: .6, roughnessMap: rCast, bumpMap: bCast, bumpScale: .02, envMapIntensity: .65 });
  MAT.intakeCast = M({ color: 0x5c626c, metalness: .72, roughness: .7, roughnessMap: rCast, bumpMap: bCast, bumpScale: .022, envMapIntensity: .48 });
  MAT.ironCast   = M({ color: 0x4c515b, metalness: .78, roughness: .66, roughnessMap: rCast, bumpMap: bCast, bumpScale: .022, envMapIntensity: .55 });
  MAT.brass      = M({ color: 0xa8823a, metalness: .95, roughness: .34 });
  MAT.rubber     = M({ color: 0x17191d, metalness: 0,  roughness: .92 });
  MAT.ceramic    = M({ color: 0xd9d4c8, metalness: .04, roughness: .38 });
  MAT.springY    = M({ color: 0x8a681f, metalness: .88, roughness: .5 });
  MAT.springR    = M({ color: 0x7a2020, metalness: .82, roughness: .55 });
  MAT.coverRed   = M({ color: 0x5c1117, metalness: .28, roughness: .62, roughnessMap: rRed, bumpMap: rRed, bumpScale: .016,
                       clearcoat: .35, clearcoatRoughness: .5 });
  MAT.header     = M({ color: 0x9aa2ac, metalness: .95, roughness: .3, roughnessMap: rMach, bumpMap: bMach, bumpScale: .006, envMapIntensity: 0.8 });
  MAT.headerHot  = M({ color: 0x6e5645, metalness: .82, roughness: .5 });
  MAT.gasket     = M({ color: 0xb59a30, metalness: .32, roughness: .62 });
  MAT.puck       = M({ color: 0x1c2026, metalness: .12, roughness: .85 });
  MAT.linerGlass = M({ color: 0x9fc4e8, metalness: 0, roughness: .1, transparent: true,
                       opacity: .16, depthWrite: false, side: THREE.DoubleSide });
  MAT.blockGhost = M({ color: 0x5f7ea6, metalness: .5, roughness: .5, transparent: true,
                       opacity: .22, depthWrite: false, side: THREE.DoubleSide });
  MAT.headGhost  = M({ color: 0x6f8cb4, metalness: .5, roughness: .45, transparent: true,
                       opacity: .22, depthWrite: false, side: THREE.DoubleSide });
  MAT.gearSteel  = M({ color: 0x8d949e, metalness: .95, roughness: .36, roughnessMap: rMach });
  {  // 飞轮齿圈: 环向细齿条纹(map+凹凸), 72 齿
    const c = document.createElement('canvas'); c.width = 512; c.height = 16;
    const g = c.getContext('2d');
    for (let i = 0; i < 72; i++) {
      const x = i / 72 * 512;
      g.fillStyle = '#8d949e'; g.fillRect(x, 0, 7.1, 16);
      g.fillStyle = '#4a505a'; g.fillRect(x + 7.1, 0, 0.9, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    MAT.ringGear = M({ color: 0xffffff, map: t, metalness: .9, roughness: .42,
      bumpMap: t, bumpScale: .012 });
  }
  MAT.blackSteel  = M({ color: 0x23262b, metalness: .78, roughness: .5, roughnessMap: rCast,
                        bumpMap: bCast, bumpScale: .012 });
  MAT.belt        = M({ color: 0x1a1c1f, metalness: .05, roughness: .88 });
  MAT.alternator  = M({ color: 0x74787f, metalness: .88, roughness: .38, roughnessMap: rMach });
  MAT.copper      = M({ color: 0xa8683a, metalness: .92, roughness: .35 });
  MAT.chain      = M({ color: 0x31353c, metalness: .82, roughness: .46 });
  MAT.wire       = M({ color: 0x121418, metalness: .1,  roughness: .88 });
  MAT.spark      = M({ color: 0xffc35e, emissive: 0xff9a20, emissiveIntensity: 2.2, roughness: .4 });
  MAT.flash      = M({ color: 0xffdca0, emissive: 0xff8c1a, emissiveIntensity: 3.0,
                       transparent: true, opacity: 0, depthWrite: false });
  // 左列 bank 件带 x 镜像(负 scale) → 统一双面渲染避免背面剔除
  for (const k in MAT) MAT[k].side = THREE.DoubleSide;
}
/* 螺栓环: 沿圆周实例化六角头 */
export function boltRing(parent, pos, axis, radius, n, r = 0.028, h = 0.035, mat = null) {
  const g = new THREE.CylinderGeometry(r, r, h, 6);
  const inst = new THREE.InstancedMesh(g, mat || MAT.steelDark, n);
  const d = new THREE.Object3D();
  const a = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    const u = Math.abs(a.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v1 = new THREE.Vector3().crossVectors(a, u).normalize();
    const v2 = new THREE.Vector3().crossVectors(a, v1).normalize();
    d.position.set(
      pos[0] + (v1.x * Math.cos(t) + v2.x * Math.sin(t)) * radius,
      pos[1] + (v1.y * Math.cos(t) + v2.y * Math.sin(t)) * radius,
      pos[2] + (v1.z * Math.cos(t) + v2.z * Math.sin(t)) * radius);
    d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  parent.add(inst);
  return inst;
}

/* 玻璃组切换: 组内所有 mesh 在 ghost/实体之间切换 */
export function setGhost(group, on, solidMat) {
  group.traverse(o => {
    if (!o.isMesh) return;
    if (on) { o.userData.solid ??= o.material; o.material = o.userData.ghostMat || MAT.blockGhost; }
    else { if (o.userData.solid) o.material = solidMat || o.userData.solid; }
  });
}

/* ---------------- 几何助手 ---------------- */
export function addM(parent, mesh, name) {
  mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = false;
  parent.add(mesh); return mesh;
}
export function meshOf(geo, mat, name) { const m = new THREE.Mesh(geo, mat); m.name = name; return m; }

/* 矩形带圆孔的挤出体(法线沿 +Z, depth 厚) */
export function plateWithHoles(w, h, holes, depth, corner = 0.04, seg = 24) {
  return rectPlate(-w / 2, w / 2, -h / 2, h / 2, holes, depth, corner, seg);
}
/* 显式边界的矩形板: 圆孔 [x,y,r] 与 Path 孔混合 */
export function rectPlate(x0, x1, y0, y1, holes, depth, corner = 0.04, seg = 24) {
  const s = new THREE.Shape();
  roundedRectPath(s, x0, y0, x1 - x0, y1 - y0, corner, seg);
  for (const hh of holes || []) {
    if (Array.isArray(hh)) {
      const p = new THREE.Path();
      p.absarc(hh[0], hh[1], hh[2], 0, Math.PI * 2, true);
      s.holes.push(p);
    } else s.holes.push(hh);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: seg });
}
export function rectPlateWithPathHoles(x0, x1, y0, y1, holePaths, depth, corner = 0.04) {
  const s = new THREE.Shape();
  roundedRectPath(s, x0, y0, x1 - x0, y1 - y0, corner, 10);
  for (const hp of holePaths || []) s.holes.push(hp);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
}
export function roundedRectPath(s, x, y, w, h, r, seg = 8) {
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
}
/* 体育场(胶囊)形路径: 两绝对端点 (x1,y1)-(x2,y2), 半径 r */
export function capsulePath(x1, y1, x2, y2, r) {
  const s = new THREE.Shape();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const pAng = ang + Math.PI / 2;
  const px = Math.cos(pAng) * r, py = Math.sin(pAng) * r;
  s.moveTo(x1 + px, y1 + py);
  s.absarc(x1, y1, r, pAng, pAng + Math.PI, false);
  s.lineTo(x2 - px, y2 - py);
  s.absarc(x2, y2, r, pAng + Math.PI, pAng + 2 * Math.PI, false);
  s.closePath();
  return s;
}
/* 圆环挤出(垫圈): 平面 XY, 轴 Z */
export function annulusGeo(rIn, rOut, depth, seg = 48) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: seg });
  return g;
}
/* 螺旋弹簧几何: 沿 +Y, 底部 y=0 */
export function springGeo(rCoil, wireR, coils, segPer = 22, radial = 6) {
  const pts = [];
  const N = Math.ceil(coils * segPer);
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * coils * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * rCoil, t, Math.sin(a) * rCoil));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, N, wireR, radial, false);
  g.userData.unitLen = 1; // xz 单位, y 已是 0..1 → 用 scale.y 设长度
  return g;
}
/* 圆角倒角盒(x=w, y=h, z=d, 平面圆角 r + 上下 45° 倒角) */
export function rbox(w, h, d, r = 0.02) {
  const s = new THREE.Shape();
  roundedRectPath(s, -w / 2, -d / 2, w, d, r, 6);
  const th = Math.max(0.004, h - 0.02);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: th, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01,
    bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -th / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}
/* 齿轮: 圆盘 + 实例化梯形齿(锥台四棱, 近似渐开线齿形) */
export function gearTeeth(rTip, rRoot, w, n, mat) {
  const g = new THREE.CylinderGeometry(0.36, 0.50, w * 0.96, 4, 1);   // 顶=齿顶窄, 底=齿根宽
  g.rotateZ(Math.PI / 4);   // 侧面对准径向
  g.scale(0.10, rTip - rRoot + 0.02, 1);
  g.translate(0, (rRoot + rTip) / 2 - (rTip - rRoot) * 0.12, 0);
  const inst = new THREE.InstancedMesh(g, mat, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    d.rotation.set(0, 0, a - Math.PI / 2); d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
/* bank 局部坐标系: 局部 +Y = 缸轴 u(曲轴→缸盖), +X = t̂(出轴向外侧), +Z = 世界 Z
   组内零件按 (x=t, y=s, z=z世界) 布置后调用此函数一次性摆正 */
export function bankFrame(bank) {
  return {
    x: new THREE.Vector3(bank.t[0], bank.t[1], 0),
    y: new THREE.Vector3(bank.u[0], bank.u[1], 0),
    z: new THREE.Vector3(0, 0, 1),
  };
}
export function applyBankFrame(group, bank) {
  group.quaternion.premultiply(bankQuat(bank));
  return group;
}
export function bankQuat(bank) {
  // 纯旋转: 局部 +Y → 缸轴 u。局部 +X 落在 (cosρ,sinρ),ρ=±45°。
  // 左列(u_x<0)局部 +X 指向山谷, 因此左列件需要 x 镜像(scale.x=-1)保持 t 正=向外。
  const rho = bank.u[0] < 0 ? Math.PI / 4 : -Math.PI / 4;
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rho);
}
export function bankMirrorX(bank) { return bank.u[0] < 0; }
/* 世界坐标计算: (t, s, z) → 世界 Vector3 */
export function bankToWorld(bank, t, s, z) {
  return new THREE.Vector3(
    bank.t[0] * t + bank.u[0] * s,
    bank.t[1] * t + bank.u[1] * s,
    z);
}
/* 两点摆圆柱(推杆等): 原点在底端, 沿 +Y 长 1 */
export function orientBetween(mesh, a, b, radiusScale = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  mesh.scale.set(radiusScale, len, radiusScale);
  return len;
}
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
