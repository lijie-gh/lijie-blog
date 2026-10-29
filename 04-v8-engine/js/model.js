/* ============================================================================
   V8 发动机建模 —— 全程序化参数建模, 零外部资产
   世界: 曲轴沿 Z(前端低 z), Y 上。bank 系: +Y=缸轴 u, +X=出轴向外 t, +Z=世界 Z
   平板件约定: shape 在 (x=t, y=−z) 平面内绘制, 沿 +Z 挤出 = 沿 +s
============================================================================ */
import * as THREE from 'three';
import { P, BANK, CYLS, MAINS, crankLayout, VALVE_WIN, LOBE_HALF, lobeProfile, lobeLambda } from './params.js';
import { MAT, meshOf, plateWithHoles, capsulePath, annulusGeo, springGeo,
         gearTeeth, applyBankFrame, bankQuat, bankMirrorX, bankToWorld, rectPlate, rectPlateWithPathHoles, rbox } from './kit.js';
import { rockerConst } from './kinem.js';

const D2R = Math.PI / 180;
const RX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/* 平板(bank): shape (x=t, y=−z) 烘入几何, 沿挤出方向=局部+Y, 置于 s0 */
function placePlate(mesh, bk, s0) {
  applyBankFrame(mesh, bk);
  mesh.quaternion.multiply(RX);
  mesh.position.copy(bankToWorld(bk, 0, s0, 0));
  if (bankMirrorX(bk)) mesh.scale.x = -1;
  return mesh;
}
/* 圆柱/车削件(bank): 局部 +Y 沿缸轴 */
function placeCyl(mesh, bk, t, s, z) {
  applyBankFrame(mesh, bk);
  mesh.position.copy(bankToWorld(bk, t, s, z));
  if (bankMirrorX(bk)) mesh.scale.x = -1;
  return mesh;
}
const holeZ = (t, z, r) => [t, -z, r];

export function buildEngine() {
  const root = new THREE.Group(); root.name = 'V8';
  const G = {};
  const PARTS = [];
  const part = (name, obj, desc) => { PARTS.push({ name, obj, desc }); return obj; };

  /* ==================== 曲轴总成 ==================== */
  {
    const cr = new THREE.Group(); cr.name = '曲轴飞轮组';
    const { pins, webs } = crankLayout();
    const seg = 56;
    for (const z of MAINS) {
      const m = meshOf(new THREE.CylinderGeometry(P.mainR, P.mainR, P.mainW, seg), MAT.steelDark);
      m.rotation.x = Math.PI / 2; m.position.z = z; cr.add(m);
    }
    const hubG = new THREE.CylinderGeometry(0.24, 0.24, P.webW, seg);
    const bossG = new THREE.CylinderGeometry(0.21, 0.21, P.webW, seg);
    const armG = new THREE.BoxGeometry(0.30, P.R + 0.06, P.webW);
    const cwG = sectorGeo(0.17, P.cwR, 1.35, P.webW);
    for (const w of webs) {
      const g = new THREE.Group();
      const hub = meshOf(hubG, MAT.steelDark); g.add(hub);
      const arm = meshOf(armG, MAT.steelDark); arm.position.y = P.R / 2; g.add(arm);
      const boss = meshOf(bossG, MAT.steelDark); boss.position.y = P.R; g.add(boss);
      const cw = meshOf(cwG, MAT.steelDark); g.add(cw);   // sector 已朝 −Y
      g.rotation.z = w.pinA - Math.PI / 2;                 // 局部 +Y(销) → 台位角
      g.position.z = (w.z0 + w.z1) / 2;
      cr.add(g);
    }
    for (const p of pins) {
      const m = meshOf(new THREE.CylinderGeometry(P.crankPinR, P.crankPinR, p.z1 - p.z0, seg), MAT.steelBright);
      m.rotation.x = Math.PI / 2;
      m.position.set(Math.cos(p.a) * P.R, Math.sin(p.a) * P.R, p.z);
      cr.add(m);
    }
    // 前端螺杆 + 曲轴链轮 + 减振器 + 皮带轮 + 螺栓
    const snout = meshOf(new THREE.CylinderGeometry(P.snoutR, P.snoutR, 1.005, seg), MAT.steelDark);
    snout.rotation.x = Math.PI / 2; snout.position.z = 0.6025; cr.add(snout);
    const bolt = meshOf(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 12), MAT.steelBright);
    bolt.rotation.x = Math.PI / 2; bolt.position.z = 0.07; cr.add(bolt);
    const cg = new THREE.Group(); cg.position.z = 0.72;
    const cgD = meshOf(new THREE.CylinderGeometry(P.gearCrankR, P.gearCrankR, P.gearW, 36), MAT.gearSteel);
    cgD.rotation.x = Math.PI / 2; cg.add(cgD);
    const cgt = gearTeeth(P.gearCrankR + 0.020, P.gearCrankR - 0.004, P.gearW, 22, MAT.gearSteel);
    cgt.rotation.y = Math.PI / 2; cg.add(cgt);
    cr.add(cg);
    const damper = meshOf(damperGeo(), MAT.steelDark);
    damper.rotation.x = Math.PI / 2; damper.position.z = P.damperZ[0]; cr.add(damper);
    const pulley = meshOf(pulleyGeo(), MAT.aluCast);
    pulley.rotation.x = Math.PI / 2; pulley.position.z = P.pulleyZ[0]; cr.add(pulley);
    const boltG2 = new THREE.CylinderGeometry(0.024, 0.024, 0.05, 10);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3;
      const b = meshOf(boltG2, MAT.steelBright);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * 0.30, Math.sin(a) * 0.30, P.damperZ[0] - 0.02);
      cr.add(b);
    }
    // 后端: 尾轴 + 法兰 + 飞轮 + 齿圈
    const stub = meshOf(new THREE.CylinderGeometry(0.24, 0.24, P.flangeZ[0] - 6.275, seg), MAT.steelDark);
    stub.rotation.x = Math.PI / 2; stub.position.z = (6.275 + P.flangeZ[0]) / 2; cr.add(stub);
    const flange = meshOf(new THREE.CylinderGeometry(P.flangeR, P.flangeR, P.flangeZ[1] - P.flangeZ[0], seg), MAT.steelDark);
    flange.rotation.x = Math.PI / 2; flange.position.z = (P.flangeZ[0] + P.flangeZ[1]) / 2; cr.add(flange);
    const fw = meshOf(new THREE.CylinderGeometry(P.flyR, P.flyR * 0.98, P.flyZ[1] - P.flyZ[0], 56), MAT.steelBright);
    fw.rotation.x = Math.PI / 2; fw.position.z = (P.flyZ[0] + P.flyZ[1]) / 2; cr.add(fw);
    // 齿圈: 连续环带 + 细齿条纹贴图(替代分离齿块, 低角度不再呈梳状碎裂)
    const ring = meshOf(new THREE.CylinderGeometry(0.662, 0.662, P.flyZ[1] - P.flyZ[0] - 0.012, 72, 1), MAT.ringGear);
    ring.rotation.x = Math.PI / 2; ring.position.z = (P.flyZ[0] + P.flyZ[1]) / 2; cr.add(ring);
    const face = meshOf(annulusGeo(0.20, 0.56, 0.012, 48), MAT.puck);
    face.rotation.x = Math.PI / 2; face.position.z = P.flyZ[1] + 0.002; cr.add(face);
    const fbolt = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const b = meshOf(fbolt, MAT.steelDark);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, P.flyZ[1] + 0.03);
      cr.add(b);
    }
    root.add(cr); G.crank = cr;
    part('曲轴飞轮组', cr, '交叉平面曲轴(0°·90°·270°·180°) · 5 主轴颈 · 8 平衡重 · 扭振减振器 · 56 齿飞轮齿圈');
  }

  /* ==================== 活塞连杆 ==================== */
  {
    G.pistons = []; G.rods = [];
    const pistonGeo = pistonLathe();
    const ringGeo = annulusGeo(0.44, 0.4775, 0.020, 40);
    const pinGeo = new THREE.CylinderGeometry(P.pinR, P.pinR, 0.68, 20);
    const rodWeb = new THREE.BoxGeometry(0.150, P.L - 0.30, 0.050);
    const rodFl = new THREE.BoxGeometry(0.040, P.L - 0.30, 0.115);
    const beRing = annulusGeo(P.rodBEin, P.rodBEout, P.rodBEw, 40);
    const seRing = annulusGeo(0.098, 0.155, 0.075, 32);
    const boltGeo = new THREE.CylinderGeometry(0.026, 0.026, P.rodBEw + 0.035, 10);
    const earGeo = new THREE.BoxGeometry(0.09, 0.085, P.rodBEw);
    for (const c of CYLS) {
      const bk = BANK[c.bank];
      const pg = new THREE.Group();
      const body = meshOf(pistonGeo, MAT.pistonAlu); pg.add(body);
      for (let i = 0; i < 3; i++) {
        const r = meshOf(ringGeo, MAT.puck);
        r.rotation.x = -Math.PI / 2; r.position.y = 0.083 + 0.046 * i; pg.add(r);
      }
      const pin = meshOf(pinGeo, MAT.steelBright); pin.rotation.x = Math.PI / 2; pg.add(pin);
      placeCyl(pg, bk, 0, 1.2, c.z);
      root.add(pg); G.pistons.push(pg);

      const rg = new THREE.Group();
      const web = meshOf(rodWeb, MAT.steelBright); web.position.y = P.L / 2; rg.add(web);
      const f1 = meshOf(rodFl, MAT.steelBright); f1.position.set(0.055, P.L / 2, 0); rg.add(f1);
      const f2 = meshOf(rodFl, MAT.steelBright); f2.position.set(-0.055, P.L / 2, 0); rg.add(f2);
      const be = meshOf(beRing, MAT.steelBright); be.rotation.x = Math.PI / 2; be.position.z = -P.rodBEw / 2; rg.add(be);
      const se = meshOf(seRing, MAT.steelBright); se.rotation.x = Math.PI / 2; se.position.set(0, P.L, -0.0375); rg.add(se);
      for (const s of [-1, 1]) {
        const ear = meshOf(earGeo, MAT.steelBright);
        ear.position.set(s * 0.245, -0.155, -P.rodBEw / 2); rg.add(ear);
        const b = meshOf(boltGeo, MAT.steelDark); b.rotation.x = Math.PI / 2;
        b.position.set(s * 0.245, -0.155, -P.rodBEw / 2 - 0.017); rg.add(b);
      }
      rg.position.set(0, 0, c.z);
      root.add(rg); G.rods.push(rg);
    }
    part('活塞连杆组', G.pistons[0], '8 × 活塞(3 环 · 全浮式销) + 8 × I 字梁连杆 · 全浮式运动学无偏差');
  }

  /* ==================== 缸套 ==================== */
  {
    G.liners = [];
    const geo = linerGeo();
    for (const c of CYLS) {
      const bk = BANK[c.bank];
      const m = meshOf(geo, MAT.linerGlass.clone());
      placeCyl(m, bk, 0, P.linerS0, c.z);
      root.add(m); G.liners.push(m);
    }
    part('缸套 ×8', G.liners[0], '干式缸套 · 内径 0.96 · 与活塞/活塞环恒定油膜间隙(透明展示)');
  }

  /* ==================== 缸体 ==================== */
  {
    const blk = new THREE.Group(); blk.name = '缸体';
    const zF = 1.05, zR = 6.39;
    // 曲轴箱雕塑体: shape(x=世界x, y=世界y) + 挤出沿世界z, 无需任何旋转
    {
      const sh = new THREE.Shape();
      sh.moveTo(-1.20, -0.31);
      sh.lineTo(-1.20, 0.10);
      sh.quadraticCurveTo(-1.20, 0.20, -1.148, 0.166);
      sh.lineTo(-0.148, 1.166);
      sh.lineTo(0.148, 1.166);
      sh.lineTo(1.148, 0.148);
      sh.quadraticCurveTo(1.20, 0.20, 1.148, 0.166);
      sh.lineTo(1.20, -0.31);
      sh.quadraticCurveTo(1.20, -0.38, 1.06, -0.38);
      sh.lineTo(-1.06, -0.38);
      sh.quadraticCurveTo(-1.20, -0.38, -1.20, -0.31);
      sh.closePath();
      const cav = new THREE.Path();               // 曲轴回转腔: r=0.78 弧 + 底弦(宽口, 钝角)
      const a1 = 198 * Math.PI / 180, a2 = 342 * Math.PI / 180;
      cav.moveTo(Math.cos(a1) * 0.78, Math.sin(a1) * 0.78);
      cav.absarc(0, 0, 0.78, a1, a2, false);
      cav.closePath();
      sh.holes.push(cav);
      const camT = new THREE.Path();              // 凸轮隧道 r=0.26 @ (0,1.08), 离外形顶 0.10
      camT.absarc(0, 1.08, 0.26, 0, Math.PI * 2, true);
      sh.holes.push(camT);
      const ccGeo = new THREE.ExtrudeGeometry(sh, {
        depth: 5.38, bevelEnabled: false, curveSegments: 44 });   // bevel 在薄壁/尖角处致破面, 禁用
      ccGeo.translate(0, 0, 3.74 - 5.38 / 2);
      blk.add(meshOf(ccGeo, MAT.blockGhost.clone()));
    }
    // 缸体斜腹面: 每缸 4 颗缸盖螺栓座凸包(圆柱凸台+球冠帽), 沿缸轴方向排在斜面上
    {
      const bossG = new THREE.CylinderGeometry(0.075, 0.095, 0.055, 22);
      const capG = new THREE.SphereGeometry(0.078, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      for (const b of [0, 1]) {
        const bk = BANK[b];
        for (const c of CYLS.filter(c => c.bank === b)) {
          for (const bt of [-0.50, 0.50]) {
            // 凸台位于缸心线外側 bt 处, s=2.0(斜面上), 朝向=缸轴方向
            const p = bankToWorld(bk, bt, 2.00, c.z);
            const dir = new THREE.Vector3(bk.u[0], bk.u[1], 0);
            const boss = meshOf(bossG, MAT.blockGhost.clone());
            boss.position.copy(p);
            boss.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            const cap = meshOf(capG, MAT.blockGhost.clone());
            cap.scale.setScalar(0.095 / 0.078);
            cap.position.copy(p).addScaledVector(dir, 0.027);
            cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            blk.add(boss, cap);
          }
        }
      }
    }
    for (const s of [-1, 1]) {
      // 分模线: 沿全长的水平细凸棱(缸体上下模接缝)
      const pl = meshOf(rbox(0.045, 0.028, zR - zF - 0.06, 0.012), MAT.blockGhost.clone());
      pl.position.set(s * 1.202, 0.035, (zF + zR) / 2); blk.add(pl);
      // 铸造细节: 竖向加强肋 ×4 / 砂堵 ×3 / 悬挂凸台
      for (let i = 0; i < 4; i++) {
        const rib = meshOf(rbox(0.10, 0.50, 0.10, 0.03), MAT.blockGhost.clone());
        rib.position.set(s * 1.215, -0.075, 1.62 + i * 1.36);
        blk.add(rib);
      }
      for (let i = 0; i < 3; i++) {
        const fplug = meshOf(new THREE.CylinderGeometry(0.115, 0.115, 0.035, 24), MAT.steelDark);
        fplug.rotation.z = Math.PI / 2;
        fplug.position.set(s * 1.195, -0.165, 2.26 + i * 1.24);
        blk.add(fplug);
      }
      const mm = meshOf(rbox(0.16, 0.30, 0.55, 0.05), MAT.blockGhost.clone());
      mm.position.set(s * 1.13, -0.12, 3.76); blk.add(mm);
      // 每缸外侧机加工检测凸台(圆盘)
      for (let i = 0; i < 4; i++) {
        const pad2 = meshOf(new THREE.CylinderGeometry(0.075, 0.085, 0.045, 20), MAT.blockGhost.clone());
        pad2.rotation.z = Math.PI / 2;
        pad2.position.set(s * 1.198, 0.145, 1.63 + i * 1.36);
        blk.add(pad2);
      }
    }
    for (let b = 0; b < 2; b++) {
      const bk = BANK[b];
      const cz = CYLS.filter(c => c.bank === b).map(c => c.z);
      const zMin = 1.05, zMax = 6.44;
      const holes = cz.map(z => holeZ(0, z, 0.612));
      const slab = meshOf(rectPlate(-0.66, 0.70, -zMax, -zMin, holes, P.deckS - P.blockS0, 0.05),
        MAT.blockGhost.clone());
      placePlate(slab, bk, P.blockS0); blk.add(slab);
    }
    const bh = bulkheadGeo();
    for (const z of MAINS) {
      const m = meshOf(bh, MAT.blockGhost.clone());
      m.position.z = z - P.mainW / 2; blk.add(m);
    }
    const fp = meshOf(bulkheadGeo(0.23, 0.118, 0.06), MAT.blockGhost.clone());
    fp.position.z = P.frontPlateZ[0]; blk.add(fp);
    const rp = meshOf(bulkheadGeo(0.28, 0.0, 0.06), MAT.blockGhost.clone());
    rp.position.z = P.rearPlateZ[0]; blk.add(rp);
    // 山谷底板(挺柱孔) + 挺柱导管
    const vpts = [];
    for (const c of CYLS) {
      const bk = BANK[c.bank];
      const x = (bk.zOff < 0 ? -1 : 1) * P.lifterRowX;
      for (const v of c.valves) vpts.push({ x, z: c.z + v.z });
    }
    const vpHoles = vpts.map(p => [p.x, -p.z, 0.076]);
    const vp = meshOf(rectPlate(-0.70, 0.70, -6.40, -1.10, vpHoles, 0.045, 0.05), MAT.blockGhost.clone());
    vp.rotation.set(-Math.PI / 2, 0, 0); vp.position.set(0, P.plateY, 0); blk.add(vp);
    const tubeG = new THREE.CylinderGeometry(0.084, 0.084, P.plateY - 1.40, 14, 1, true);
    for (const p of vpts) {
      const tu = meshOf(tubeG, MAT.blockGhost.clone());
      tu.material = tu.material.clone(); tu.material.side = THREE.DoubleSide;
      tu.position.set(p.x, (P.plateY + 1.40) / 2, p.z); blk.add(tu);
    }
    root.add(blk); G.block = blk;
    part('缸体组', blk, '90° V 型铸铝缸体 · 开放式山谷 · 5 横隔板(曲轴孔+凸轮孔) · 山谷挺柱底座');
  }

  /* ==================== 缸盖 / 气门室盖 / 缸垫 / 火花塞 ==================== */
  {
    G.heads = []; G.covers = []; G.plugs = [];
    for (let b = 0; b < 2; b++) {
      const bk = BANK[b];
      const cylsB = CYLS.filter(c => c.bank === b);
      const cz = cylsB.map(c => c.z);
      const zMin = 1.05, zMax = 6.44;
      const hg = new THREE.Group(); hg.name = '缸盖' + bk.name;
      // 下层(2.27..2.545): 燃烧室胶囊孔
      const holePaths = cylsB.map(c => capsuleHolePath(c));
      const lower = meshOf(rectPlateWithPathHoles(-0.45, 0.72, -zMax, -zMin, holePaths, 2.545 - P.headBot),
        MAT.headGhost.clone());
      placePlate(lower, bk, P.headBot); hg.add(lower);
      // 燃烧室底板/顶板 + 火花塞
      for (const c of cylsB) {
        const floor = meshOf(chamberFloorGeo(c), MAT.headGhost.clone());
        placePlate(floor, bk, 2.27); hg.add(floor);
        const roof = meshOf(chamberRoofGeo(c), MAT.headGhost.clone());
        placePlate(roof, bk, 2.50); hg.add(roof);
        const plug = plugGroup();
        placeCyl(plug, bk, 0, 2.545, c.z);
        hg.add(plug); G.plugs.push(plug);
      }
      // 上层(2.545..2.77): 气门杆孔 + 火花塞孔
      const upHoles = [];
      for (const c of cylsB) {
        for (const v of c.valves) upHoles.push(holeZ(v.t, c.z + v.z, 0.035));
        upHoles.push(holeZ(0, c.z, 0.062));
      }
      const upper = meshOf(rectPlate(-0.45, 0.72, -zMax, -zMin, upHoles, P.headTop - 2.545, 0.05),
        MAT.headGhost.clone());
      placePlate(upper, bk, 2.545); hg.add(upper);
      // 缸垫(与缸盖同宽, 不外溢)
      const gkHoles = cz.map(z => [0, -z, 0.62]).concat(cylsB.map(c => capsuleHolePath(c, 0.012)));
      const gk = meshOf(rectPlate(-0.45, 0.72, -zMax, -zMin, gkHoles, P.gasketT, 0.05), MAT.gasket);
      placePlate(gk, bk, P.deckS + 0.002); hg.add(gk);
      // 弹簧座圈
      const seatG = annulusGeo(0.075, 0.105, 0.024, 20);
      for (const c of cylsB) for (const v of c.valves) {
        const seat = meshOf(seatG, MAT.aluCast);
        seat.rotation.x = -Math.PI / 2;
        placeCyl(seat, bk, v.t, P.headTop, c.z + v.z); hg.add(seat);
      }
      root.add(hg); G.heads.push(hg);
      part(bk.name + ' 缸盖', hg, '半球燃烧室 · 中置火花塞 · 双气门 · 铜缸垫 · 推杆全外置山谷');
      const cov = coverGroup(b, cylsB);
      root.add(cov); G.covers.push(cov);
      part(bk.name + ' 气门室盖', cov, '红色烤漆 · 火花塞管贯穿 · 加机油口 · 呼吸器');
    }
  }

  /* ==================== 配气机构 ==================== */
  {
    G.cam = buildCam(); root.add(G.cam);
    part('凸轮轴', G.cam, '下置凸轮轴 · 16 桃尖交叉平面相位 · 44 齿链轮 · 转速=曲轴 1/2');
    G.lifters = []; G.pushrods = []; G.rockerArms = []; G.rockerHolders = [];
    G.valves = []; G.springs = []; G.retainers = [];
    const springG = springGeo(0.088, 0.023, 5.0, 26, 10);
    const lifterG = new THREE.CylinderGeometry(P.lifterR, P.lifterR, P.lifterBodyH, 20);
    const pushG = new THREE.CylinderGeometry(0.032, 0.032, 1, 16);
    for (const rc of rockerConst) {
      const bk = rc.bk, c = rc.c, v = rc.v, z = rc.z;
      // 挺柱
      const lf = new THREE.Group();
      const lb = meshOf(lifterG, MAT.steelBright);
      lb.position.y = P.lifterBodyH / 2; lf.add(lb);
      lf.position.set(rc.B0w.x, rc.yBase, z);
      root.add(lf); G.lifters.push(lf);
      // 推杆
      const pr = meshOf(pushG, MAT.steelBright);
      root.add(pr); G.pushrods.push(pr);
      // 摇臂(原点=枢轴, 叉轨式: 支柱从两轨之间穿过)
      const rk = new THREE.Group();
      const bossG = new THREE.CylinderGeometry(P.padR + 0.022, P.padR + 0.022, 0.108, 16);
      const bIn = meshOf(bossG, MAT.steelBright); bIn.rotation.x = Math.PI / 2;
      bIn.position.set(rc.nin.t * rc.R_in, rc.nin.s * rc.R_in, 0); rk.add(bIn);
      const bOut = meshOf(bossG, MAT.steelBright); bOut.rotation.x = Math.PI / 2;
      bOut.position.set(rc.nout.t * rc.R_out, rc.nout.s * rc.R_out, 0); rk.add(bOut);
      const piv = meshOf(new THREE.CylinderGeometry(0.062, 0.062, 0.108, 16), MAT.steelBright);
      piv.rotation.x = Math.PI / 2; rk.add(piv);
      for (const side of [-1, 1]) {
        for (const [nn, RR] of [[rc.nin, rc.R_in], [rc.nout, rc.R_out]]) {
          const len = RR - 0.06;
          const rail = meshOf(new THREE.BoxGeometry(len, 0.062, 0.030), MAT.steelBright);
          const mid = 0.06 + len / 2;
          rail.position.set(nn.t * mid, nn.s * mid, side * 0.049);
          rail.rotation.z = Math.atan2(nn.s, nn.t);
          rk.add(rail);
        }
      }
      rk.userData.rc = rc;
      placeCyl(rk, bk, rc.pivot.t, rc.pivot.s, z);
      root.add(rk); G.rockerArms.push(rk);
      // 支柱(固定): 双轨之间穿过, z 向无干涉
      const hd = new THREE.Group();
      const stud = meshOf(new THREE.CylinderGeometry(0.024, 0.024, 0.56, 10), MAT.steelDark);
      placeCyl(stud, bk, rc.pivot.t, 3.02, z);
      const trun = meshOf(new THREE.CylinderGeometry(0.040, 0.040, 0.050, 14), MAT.steelBright);
      trun.rotation.x = Math.PI / 2;
      placeCyl(trun, bk, rc.pivot.t, rc.pivot.s, z);
      const nut = meshOf(new THREE.CylinderGeometry(0.050, 0.050, 0.050, 6), MAT.steelBright);
      placeCyl(nut, bk, rc.pivot.t, 3.36, z);
      hd.add(stud, trun, nut);
      root.add(hd); G.rockerHolders.push(hd);
      // 气门
      const vg = valveGroup(v);
      placeCyl(vg, bk, v.t, P.vseatFlush, z);
      root.add(vg); G.valves.push(vg);
      // 弹簧 + 锁夹座
      const sp = meshOf(springG, c.bank ? MAT.springR : MAT.springY);
      placeCyl(sp, bk, v.t, P.headTop + 0.024, z);
      root.add(sp); G.springs.push(sp);
      const ret = meshOf(new THREE.CylinderGeometry(0.030, 0.062, 0.045, 16), MAT.steelBright);
      placeCyl(ret, bk, v.t, rc.tipS0 - 0.045, z);
      root.add(ret); G.retainers.push(ret);
    }
    part('配气机构', G.cam, '挺柱-推杆-摇臂-气门全链解析接触 · 16 气门 · 弹簧可视压缩');
  }

  /* ==================== 水泵总成(前端) ==================== */
  {
    const wp = new THREE.Group(); wp.name = '水泵';
    const body = meshOf(new THREE.CylinderGeometry(0.135, 0.15, 0.36, 28), MAT.aluCast);
    body.rotation.x = Math.PI / 2; body.position.set(0.55, 0.85, 0.84); wp.add(body);
    const hub = meshOf(new THREE.CylinderGeometry(0.06, 0.06, 0.30, 16), MAT.steelDark);
    hub.rotation.x = Math.PI / 2; hub.position.set(0.55, 0.85, 0.62); wp.add(hub);
    const pulley = meshOf(new THREE.CylinderGeometry(0.19, 0.19, 0.11, 32), MAT.aluCast);
    pulley.rotation.x = Math.PI / 2; pulley.position.set(0.55, 0.85, 0.50); wp.add(pulley);
    const groove = meshOf(annulusGeo(0.145, 0.193, 0.045, 28), MAT.puck);
    groove.rotation.x = Math.PI / 2; groove.position.set(0.55, 0.85, 0.505); wp.add(groove);
    const wbolt = meshOf(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6), MAT.steelBright);
    wbolt.rotation.x = Math.PI / 2; wbolt.position.set(0.55, 0.85, 0.40); wp.add(wbolt);
    root.add(wp);
    part('水泵总成', wp, '前端离心水泵 · 带槽皮带轮 · 全避让正时链与减振器');
  }

  /* ==================== 附件驱动系统(前端) ==================== */
  {
    const acc = new THREE.Group(); acc.name = '附件驱动';
    const ACX = 0.55, ACY = 0.85;                    // 水泵带轮位(已有)
    // 发电机(右上前方, 大壳体+散热筋+带轮)
    const alt = new THREE.Group();
    const aBody = meshOf(new THREE.CylinderGeometry(0.24, 0.22, 0.44, 30), MAT.alternator);
    aBody.rotation.x = Math.PI / 2; aBody.position.set(0.95, 1.35, 0.62); alt.add(aBody);
    for (let i = 0; i < 10; i++) {                    // 散热筋
      const fin = meshOf(rbox(0.05, 0.44, 0.045, 0.015), MAT.alternator);
      const a = i / 10 * Math.PI * 2;
      fin.position.set(0.95 + Math.cos(a) * 0.235, 1.35 + Math.sin(a) * 0.235, 0.62);
      fin.rotation.z = a; fin.rotation.x = Math.PI / 2; alt.add(fin);
    }
    const aPulley = meshOf(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 28), MAT.steelDark);
    aPulley.rotation.x = Math.PI / 2; aPulley.position.set(0.95, 1.35, 0.36); alt.add(aPulley);
    const aFan = meshOf(new THREE.CylinderGeometry(0.155, 0.19, 0.045, 28), MAT.steelDark);
    aFan.rotation.x = Math.PI / 2; aFan.position.set(0.95, 1.35, 0.45); alt.add(aFan);
    // 张紧轮(左中)
    const tPulley = meshOf(new THREE.CylinderGeometry(0.10, 0.10, 0.13, 24), MAT.blackSteel);
    tPulley.rotation.x = Math.PI / 2; tPulley.position.set(-0.62, 1.30, 0.50); acc.add(tPulley);
    const tArm = meshOf(rbox(0.34, 0.09, 0.07, 0.03), MAT.blackSteel);
    tArm.position.set(-0.45, 1.10, 0.50); tArm.rotation.z = 0.6; acc.add(tArm);
    // 惰轮(左下, 光面)
    const iPulley = meshOf(new THREE.CylinderGeometry(0.12, 0.12, 0.13, 24), MAT.steelBright);
    iPulley.rotation.x = Math.PI / 2; iPulley.position.set(-0.55, 0.28, 0.50); acc.add(iPulley);
    acc.add(alt);
    // 传动皮带: 水泵轮 → 发电机 → 曲轴减振器 → 惰轮 → 张紧轮 闭合环路
    const wP = new THREE.Vector3(ACX, ACY, 0.455);    // 水泵带轮槽
    const aP = new THREE.Vector3(0.95, 1.35, 0.42);
    const cP = new THREE.Vector3(0.00, 0.42, 0.435);  // 减振器带槽
    const iP2 = new THREE.Vector3(-0.55, 0.28, 0.435);
    const tP2 = new THREE.Vector3(-0.62, 1.30, 0.435);
    const seg = (a, b, r) => {                        // 两轮外公切线段(近似: 沿圆心连线偏移 r)
      const d = new THREE.Vector3().subVectors(b, a); d.z = 0;
      const L = d.length(); d.normalize();
      const n = new THREE.Vector3(-d.y, d.x, 0);
      return [a.clone().addScaledVector(n, r), b.clone().addScaledVector(n, r)];
    };
    const pts = [];
    const chain = [[wP, aP, 0.19, 0.15], [aP, cP, 0.15, 0.585], [cP, iP2, 0.585, 0.12],
                   [iP2, tP2, 0.12, 0.10], [tP2, wP, 0.10, 0.19]];
    // 简化: 外公切线每段生成两点, 用 CatmullRom 平滑闭合
    const ring = [];
    for (const [p, q, r1, r2] of chain) {
      const d = new THREE.Vector3().subVectors(q, p); d.z = 0; d.normalize();
      const n = new THREE.Vector3(-d.y, d.x, 0);
      ring.push(p.clone().addScaledVector(n, r1));
      ring.push(q.clone().addScaledVector(n, r2));
    }
    const beltCurve = new THREE.CatmullRomCurve3(ring, true, 'catmullrom', 0.35);
    const belt = meshOf(new THREE.TubeGeometry(beltCurve, 90, 0.024, 10, true), MAT.belt);
    acc.add(belt);
    // 皮带在带轮上的包覆弧(视觉补充): 每轮一个薄环带
    for (const [c, r] of [[wP, 0.19], [aP, 0.15], [iP2, 0.12], [tP2, 0.10]]) {
      const band = meshOf(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.05, 28, 1, true),
        MAT.blackSteel.clone());
      band.material.side = THREE.DoubleSide;
      band.rotation.x = Math.PI / 2; band.position.set(c.x, c.y, c.z);
      acc.add(band);
    }
    root.add(acc);
    part('附件驱动系统', acc, '发电机(带散热筋) · 张紧轮 · 惰轮 · 水泵轮 · 多楔带闭环走向');
  }

  /* ==================== 正时链 ==================== */
  {
    const tg = chainGroup();
    root.add(tg); G.timing = tg;
    part('正时传动', tg, '曲轴链轮 22 齿 : 凸轮链轮 44 齿 · 滚子链外切包络 · 2:1 减速');
  }

  /* ==================== 进气 ==================== */
  {
    const ig = intakeGroup();
    root.add(ig); G.intake = ig;
    part('进气系统', ig, '山谷式进气歧管 · 8 支弧形进气道跨过推杆 · 节气门开度随转速');
  }

  /* ==================== 排气 ==================== */
  {
    G.headers = [];
    for (let b = 0; b < 2; b++) {
      const h = headerGroup(b);
      h.name = '排气' + BANK[b].name;
      root.add(h); G.headers.push(h);
      part(BANK[b].name + ' 排气歧管', h, '4-1 长管等长歧管 · 抛光不锈钢 · 外侧全避让缸体');
    }
  }

  /* ==================== 油底壳 ==================== */
  {
    const pan = panGroup();
    root.add(pan); G.pan = pan;
    part('油底壳', pan, '湿式油底壳 · 放油螺塞 · 曲轴扫掠全避让');
  }

  /* ==================== 机油滤清器 + 启动机 ==================== */
  {
    const aux = new THREE.Group(); aux.name = '滤清器与启动机';
    // 机油滤(右下, 竖装白滤罐)
    const of = meshOf(new THREE.CylinderGeometry(0.17, 0.17, 0.52, 28), MAT.coverRed.clone());
    of.material = MAT.ceramic.clone(); of.material.color = new THREE.Color(0xd8d5cc);
    of.position.set(1.02, 0.28, 2.6); aux.add(of);
    const ofTop = meshOf(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 28), MAT.blackSteel);
    ofTop.position.set(1.02, 0.56, 2.6); aux.add(ofTop);
    const ofBase = meshOf(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 24), MAT.aluCast);
    ofBase.position.set(1.02, 0.02, 2.6); aux.add(ofBase);
    // 启动机(右下后方: 壳体+电磁开关+驱动齿)
    const st = new THREE.Group();
    const sBody = meshOf(new THREE.CylinderGeometry(0.16, 0.16, 0.66, 24), MAT.alternator);
    sBody.rotation.x = Math.PI / 2; sBody.rotation.y = 0.5;
    sBody.position.set(1.30, -0.28, 5.85); st.add(sBody);
    const sSol = meshOf(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 16), MAT.blackSteel);
    sSol.rotation.x = Math.PI / 2; sSol.rotation.y = 0.5;
    sSol.position.set(1.02, -0.06, 6.22); st.add(sSol);
    const sGear = meshOf(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 16), MAT.steelBright);
    sGear.rotation.x = Math.PI / 2; sGear.rotation.y = 0.5;
    sGear.position.set(1.60, -0.50, 5.50); st.add(sGear);
    aux.add(st);
    root.add(aux);
    part('滤清器与启动机', aux, '竖装机油滤清器 · 启动机(壳体/电磁开关/驱动齿轮)');
  }

  /* ==================== 分电器 ==================== */
  {
    const d = distGroup();
    root.add(d); G.dist = d;
    part('分电器', d, '8 缸分火 · 点火顺序 1-8-4-3-6-5-7-2 · 高压线按点火顺序闪光');
  }

  /* ==================== 点火闪光 ==================== */
  {
    G.flash = [];
    const fg = new THREE.SphereGeometry(0.09, 12, 8);
    for (const c of CYLS) {
      const bk = BANK[c.bank];
      const m = meshOf(fg, MAT.flash.clone());
      m.position.copy(bankToWorld(bk, 0, 2.42, c.z));
      root.add(m); G.flash.push(m);
    }
  }

  root.traverse(o => { o.userData.basePos = o.position.clone(); o.userData.baseQuat = o.quaternion.clone(); });
  return { root, G, PARTS };
}

/* ==================== 子程序 ==================== */
function sectorGeo(r0, r1, half, depth) {
  const s = new THREE.Shape();
  const a0 = -Math.PI / 2 - half, a1 = -Math.PI / 2 + half;
  s.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
  s.absarc(0, 0, r1, a0, a1, false);
  s.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
  s.absarc(0, 0, r0, a1, a0, true);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 28 });
}
function damperGeo() {
  const pts = [
    new THREE.Vector2(0.20, 0), new THREE.Vector2(0.56, 0), new THREE.Vector2(0.56, 0.16),
    new THREE.Vector2(0.50, 0.185), new THREE.Vector2(0.50, 0.245), new THREE.Vector2(0.56, 0.27),
    new THREE.Vector2(0.56, 0.30), new THREE.Vector2(0.20, 0.30), new THREE.Vector2(0.0, 0.30),
    new THREE.Vector2(0.0, 0),
  ];
  return new THREE.LatheGeometry(pts, 64);
}
function pulleyGeo() {
  const pts = [
    new THREE.Vector2(0.10, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.34, 0.055), new THREE.Vector2(0.34, 0.125), new THREE.Vector2(0.42, 0.14),
    new THREE.Vector2(0.42, 0.18), new THREE.Vector2(0.10, 0.18), new THREE.Vector2(0.0, 0.18),
    new THREE.Vector2(0.0, 0),
  ];
  return new THREE.LatheGeometry(pts, 56);
}
function pistonLathe() {
  const pts = [];
  pts.push(new THREE.Vector2(0.400, -P.skirtBelow));
  pts.push(new THREE.Vector2(0.465, -P.skirtBelow));
  pts.push(new THREE.Vector2(0.465, 0.055));
  for (const [a, b] of [[0.072, 0.094], [0.118, 0.140], [0.168, 0.190]]) {
    pts.push(new THREE.Vector2(0.468, a));
    pts.push(new THREE.Vector2(0.438, a + 0.004));
    pts.push(new THREE.Vector2(0.438, b - 0.004));
    pts.push(new THREE.Vector2(0.468, b));
  }
  pts.push(new THREE.Vector2(0.470, 0.205));
  pts.push(new THREE.Vector2(0.470, P.crownH - 0.012));
  pts.push(new THREE.Vector2(0.30, P.crownH - 0.008));
  pts.push(new THREE.Vector2(0.0, P.crownH - 0.014));
  return new THREE.LatheGeometry(pts, 80);
}
function linerGeo() {
  const pts = [
    new THREE.Vector2(P.boreR, 0), new THREE.Vector2(P.linerOD, 0.004),
    new THREE.Vector2(P.linerOD, 1.452 - 0.004), new THREE.Vector2(P.linerOD - 0.012, 1.452),
    new THREE.Vector2(P.boreR + 0.008, 1.462), new THREE.Vector2(P.boreR, 1.462),
    new THREE.Vector2(P.boreR, 0),
  ];
  return new THREE.LatheGeometry(pts, 64);
}
function bulkheadGeo(crankR = 0.21, camR = 0.135, depth = P.mainW) {
  const s = new THREE.Shape();
  s.moveTo(-1.20, -0.32); s.lineTo(1.20, -0.32); s.lineTo(1.20, 0.16);
  s.lineTo(0.80, 1.25); s.lineTo(-0.80, 1.25); s.lineTo(-1.20, 0.16); s.closePath();
  if (camR > 0) { const h = new THREE.Path(); h.absarc(0, 1.10, camR, 0, Math.PI * 2, true); s.holes.push(h); }
  const h2 = new THREE.Path(); h2.absarc(0, 0, crankR, 0, Math.PI * 2, true); s.holes.push(h2);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 28 });
}
function capsulePts(c, inflate = 0) {
  const a = c.valves[0], b = c.valves[1];
  const r = Math.max(a.r, b.r) + 0.03 + inflate;
  const sh = capsulePath(a.t, -(c.z + a.z), b.t, -(c.z + b.z), r);
  return sh.getPoints(40);
}
function capsuleHolePath(c, inflate = 0) {
  const pts = capsulePts(c, inflate);
  const hp = new THREE.Path();
  hp.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) hp.lineTo(pts[i].x, pts[i].y);
  hp.closePath();
  return hp;
}
function chamberFloorGeo(c) {
  const sh = capsulePath(c.valves[0].t, -(c.z + c.valves[0].z), c.valves[1].t, -(c.z + c.valves[1].z),
    Math.max(c.valves[0].r, c.valves[1].r) + 0.03);
  for (const v of c.valves) {
    const h = new THREE.Path(); h.absarc(v.t, -(c.z + v.z), v.r + 0.005, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  return new THREE.ExtrudeGeometry(sh, { depth: 0.036, bevelEnabled: false, curveSegments: 30 });
}
function chamberRoofGeo(c) {
  const sh = capsulePath(c.valves[0].t, -(c.z + c.valves[0].z), c.valves[1].t, -(c.z + c.valves[1].z),
    Math.max(c.valves[0].r, c.valves[1].r) + 0.03);
  const h = new THREE.Path(); h.absarc(0, -c.z, 0.062, 0, Math.PI * 2, true);
  sh.holes.push(h);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.042, bevelEnabled: false, curveSegments: 30 });
}
function plugGroup() {
  const g = new THREE.Group();
  const boss = meshOf(new THREE.CylinderGeometry(0.055, 0.055, 0.955, 14), MAT.aluCast);
  boss.position.y = 0.4775; g.add(boss);
  const hex = meshOf(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 6), MAT.steelBright);
  hex.position.y = 1.0; g.add(hex);
  const cer = meshOf(new THREE.CylinderGeometry(0.044, 0.037, 0.19, 12), MAT.ceramic);
  cer.position.y = 1.13; g.add(cer);
  const tip = meshOf(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8), MAT.steelBright);
  tip.position.y = 1.235; g.add(tip);
  const boot = meshOf(new THREE.CylinderGeometry(0.05, 0.056, 0.09, 10), MAT.rubber);
  boot.position.y = 1.30; g.add(boot);
  const electrode = meshOf(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 6), MAT.steelBright);
  electrode.position.y = -0.02; g.add(electrode);
  return g;
}
function coverGroup(b, cylsB) {
  const bk = BANK[b];
  const g = new THREE.Group();
  const zMin = 1.05, zMax = 6.44;
  const y0 = -zMax, y1 = -zMin;
  // 穹顶壳: 截面为拱形(侧墙直+顶部大圆角), 沿 z 挤出(两端封板在下方单独加)
  {
    const dome = new THREE.Shape();
    dome.moveTo(-0.60, 0);
    dome.lineTo(-0.60, 0.52);
    dome.quadraticCurveTo(-0.60, 0.72, -0.42, 0.74);
    dome.lineTo(0.46, 0.74);
    dome.quadraticCurveTo(0.66, 0.72, 0.66, 0.52);
    dome.lineTo(0.66, 0);
    dome.closePath();
    const inner = new THREE.Path();
    inner.moveTo(-0.565, 0.035);
    inner.lineTo(-0.565, 0.52);
    inner.quadraticCurveTo(-0.565, 0.675, -0.42, 0.695);
    inner.lineTo(0.46, 0.695);
    inner.quadraticCurveTo(0.615, 0.675, 0.615, 0.52);
    inner.lineTo(0.615, 0.035);
    inner.closePath();
    dome.holes.push(inner);
    const dGeo = new THREE.ExtrudeGeometry(dome, {
      depth: zMax - zMin, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012,
      bevelSegments: 2, curveSegments: 24 });
    // shape(x=t, y=h) 沿 z 挤出: (x, h, 长度) 就是世界 (x, y, z) —— 无需任何变换
    dGeo.translate(0, 0, zMin);
    const wm2 = meshOf(dGeo, MAT.coverRed);
    applyBankFrame(wm2, bk);            // 只做 bank 旋转(绕曲轴 z), 不加 RX 翻转
    wm2.position.copy(bankToWorld(bk, 0, P.headTop + 0.012, 0));
    g.add(wm2);
  }
  // 顶板(火花塞孔): 贴合穹顶上表面
  const plugHoles = cylsB.map(c => [0, -c.z, 0.060]);
  const top = meshOf(rectPlate(-0.565, 0.615, -zMax + 0.01, -zMin - 0.01, plugHoles, 0.035, 0.12), MAT.coverRed);
  placePlate(top, bk, P.headTop + 0.762); g.add(top);
  // 上沿黑色凸缘条(分色)
  const trim = meshOf(rbox(1.30, 0.045, 5.30, 0.02), MAT.blackSteel);
  placeCyl(trim, bk, 0.03, P.headTop + 0.755, (zMin + zMax) / 2);
  g.add(trim);
  // 纵向散热鳍 ×3 (沿 z, 贴穹顶斜面, 避开火花塞走廊)
  for (const ft of [-0.36, -0.16, 0.36]) {
    const fin = meshOf(rbox(0.055, 0.055, 4.9, 0.018), MAT.coverRed);
    placeCyl(fin, bk, ft, P.headTop + 0.745, (zMin + zMax) / 2);
    g.add(fin);
  }
  // 底面密封条
  const seal = meshOf(rectPlate(-0.60, 0.66, -zMax, -zMin, [], 0.012, 0.02), MAT.rubber);
  placePlate(seal, bk, P.headTop); g.add(seal);
  // 加油口 + 呼吸器
  const cap = meshOf(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 20), MAT.aluCast);
  placeCyl(cap, bk, 0.25, P.headTop + 0.80, zMin + 0.95); g.add(cap);
  const br = meshOf(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12), MAT.aluCast);
  placeCyl(br, bk, -0.32, P.headTop + 0.80, zMax - 0.9); g.add(br);
  return g;
}
function buildCam() {
  const cam = new THREE.Group(); cam.position.set(P.camX, P.camY, 0);
  const core = meshOf(new THREE.CylinderGeometry(0.095, 0.095, 5.07, 20), MAT.steelDark);
  core.rotation.x = Math.PI / 2; core.position.z = 3.835; cam.add(core);
  const jrn = meshOf(new THREE.CylinderGeometry(P.camJrnl, P.camJrnl, 0.26, 24), MAT.steelBright);
  jrn.rotation.x = Math.PI / 2;
  for (const z of MAINS) { const j = jrn.clone(); j.position.z = z; cam.add(j); }
  for (const c of CYLS) for (const v of c.valves) {
    const m = meshOf(lobeMeshGeo(c, v), MAT.steelBright);
    m.rotation.x = Math.PI / 2; m.position.z = c.z + v.z - 0.055;
    cam.add(m);
  }
  const nose = meshOf(new THREE.CylinderGeometry(0.10, 0.10, 0.57, 16), MAT.steelDark);
  nose.rotation.x = Math.PI / 2; nose.position.z = 1.025; cam.add(nose);
  const gear = meshOf(new THREE.CylinderGeometry(P.gearCamR, P.gearCamR, P.gearW, 44), MAT.gearSteel);
  gear.rotation.x = Math.PI / 2; gear.position.z = 0.72; cam.add(gear);
  const gt = gearTeeth(P.gearCamR + 0.020, P.gearCamR - 0.004, P.gearW, 44, MAT.gearSteel);
  gt.rotation.y = Math.PI / 2; gt.position.z = 0.72; cam.add(gt);
  return cam;
}
function lobeMeshGeo(c, v) {
  const chiC = (VALVE_WIN[v.kind][0] + VALVE_WIN[v.kind][1]) / 2;
  const lam = lobeLambda(c.fire, chiC);
  const N = 72, pts = [];
  for (let i = 0; i <= N; i++) {
    const phi = i / N * Math.PI * 2;
    let d = phi - (lam % (Math.PI * 2));
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const r = P.camBase + lobeProfile(d, LOBE_HALF[v.kind]);
    pts.push(new THREE.Vector2(Math.cos(phi) * r, Math.sin(phi) * r));
  }
  return new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.11, bevelEnabled: false });
}
function valveGroup(v) {
  const g = new THREE.Group();
  const pts = [
    new THREE.Vector2(0.0, 0.0), new THREE.Vector2(v.r - 0.03, 0.0),
    new THREE.Vector2(v.r - 0.012, 0.014), new THREE.Vector2(v.r - 0.06, 0.075),
    new THREE.Vector2(0.026, 0.16), new THREE.Vector2(0.026, P.valveStemL - 0.02),
    new THREE.Vector2(0.020, P.valveStemL), new THREE.Vector2(0.0, P.valveStemL),
  ];
  const m = meshOf(new THREE.LatheGeometry(pts, 32), v.kind === 'I' ? MAT.steelBright : MAT.steelDark);
  g.add(m);
  return g;
}
function chainGroup() {
  const g = new THREE.Group(); g.name = '正时';
  const r1 = P.gearCrankR + P.chainHalf, r2 = P.gearCamR + P.chainHalf;
  const dd = (r2 - r1) / P.camY;
  const nrm = Math.sqrt(Math.max(0, 1 - dd * dd));
  const c1 = new THREE.Vector2(0, 0), c2 = new THREE.Vector2(0, P.camY);
  const tR1 = new THREE.Vector2(nrm, dd).multiplyScalar(r1).add(c1);
  const tR2 = new THREE.Vector2(nrm, dd).multiplyScalar(r2).add(c2);
  const tL1 = new THREE.Vector2(-nrm, dd).multiplyScalar(r1).add(c1);
  const tL2 = new THREE.Vector2(-nrm, dd).multiplyScalar(r2).add(c2);
  const ang = (p, c) => Math.atan2(p.y - c.y, p.x - c.x);
  const path = new THREE.CurvePath();
  path.add(new THREE.EllipseCurve(c1.x, c1.y, r1, r1, ang(tR1, c1), ang(tL1, c1) - Math.PI * 2, true));
  path.add(new THREE.LineCurve3(new THREE.Vector3(tL1.x, tL1.y, 0), new THREE.Vector3(tL2.x, tL2.y, 0)));
  path.add(new THREE.EllipseCurve(c2.x, c2.y, r2, r2, ang(tL2, c2), ang(tR2, c2), true));
  path.add(new THREE.LineCurve3(new THREE.Vector3(tR2.x, tR2.y, 0), new THREE.Vector3(tR1.x, tR1.y, 0)));
  const pts = path.getSpacedPoints(150);
  const n = pts.length - 1;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.030, 0.052, 0.048), MAT.chain, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1];
    dummy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0.72);
    dummy.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x));
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  g.add(inst);
  g.userData.chainPts = pts.slice(0, n).map(p => ({ x: p.x, y: p.y }));
  return g;
}
function intakeGroup() {
  const g = new THREE.Group(); g.name = '进气';
  g.userData.runners = [];
  const base = meshOf(new THREE.BoxGeometry(1.06, 0.06, 4.7), MAT.intakeCast);
  base.position.set(0, 1.80, 3.70); g.add(base);
  // 稳压腔(圆角矩形 XY, 沿 Z 挤出)
  const sh = new THREE.Shape();
  const x0 = -0.50, y0 = 1.86, x1 = 0.50, y1 = 2.50;
  sh.moveTo(x0, y0);
  sh.lineTo(x1, y0);
  sh.lineTo(x1, y1 - 0.14);
  sh.quadraticCurveTo(x1, y1, x1 - 0.14, y1);      // 大圆角拱肩
  sh.lineTo(x0 + 0.14, y1);
  sh.quadraticCurveTo(x0, y1, x0, y1 - 0.14);
  sh.closePath();
  const plen = meshOf(new THREE.ExtrudeGeometry(sh, {
    depth: 4.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.065,
    bevelSegments: 3, curveSegments: 20 }), MAT.intakeCast);
  plen.position.z = 1.61; g.add(plen);
  // 8 进气道 + 落座凸台
  for (const c of CYLS) {
    const bk = BANK[c.bank];
    const pad = bankToWorld(bk, -0.38, 2.82, c.z);
    const side = new THREE.Vector3(bk.zOff < 0 ? -0.50 : 0.50, 2.15, c.z);
    const mid1 = new THREE.Vector3(side.x * 1.9, 2.60, c.z);
    const mid2 = new THREE.Vector3(pad.x * 0.90, 2.50, c.z);
    const curve = new THREE.CatmullRomCurve3([side, mid1, mid2, pad]);
    g.userData.runners.push(curve.getPoints(36));
    g.add(meshOf(new THREE.TubeGeometry(curve, 48, P.runnerR, 16, false), MAT.intakeCast));
    const boss = meshOf(rbox(0.26, 0.15, 0.30, 0.04), MAT.intakeCast);
    boss.position.copy(pad);
    boss.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bk.u[0], bk.u[1], 0));
    g.add(boss);
  }
  // 丝印铭牌(两侧 + 顶)
  const d1 = decalPlane('V8', '5.7 L · 16 VALVE', 0.62, 0.31);
  d1.position.set(0.556, 2.16, 3.55); d1.rotation.y = Math.PI / 2; g.add(d1);
  const d2 = decalPlane('V8', '5.7 L · 16 VALVE', 0.62, 0.31);
  d2.position.set(-0.556, 2.16, 3.55); d2.rotation.y = -Math.PI / 2; g.add(d2);
  const d3 = decalPlane('FIRING 1-8-4-3-6-5-7-2', '', 1.15, 0.20, '#c9c2ae');
  d3.position.set(0, 2.525, 3.65); d3.rotation.x = -Math.PI / 2; g.add(d3);
  // 进气道凸台双螺柱(每缸 2)
  for (const c of CYLS) {
    const bk = BANK[c.bank];
    const pad = bankToWorld(bk, -0.38, 2.82, c.z);
    for (const dz of [-0.17, 0.17]) {
      const stud = meshOf(new THREE.CylinderGeometry(0.02, 0.02, 0.20, 8), MAT.steelDark);
      const nut = meshOf(new THREE.CylinderGeometry(0.032, 0.032, 0.035, 6), MAT.steelBright);
      const dir = new THREE.Vector3(bk.u[0], bk.u[1], 0);
      stud.position.copy(pad).addScaledVector(dir, 0.10); stud.position.z += dz;
      stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      nut.position.copy(pad).addScaledVector(dir, 0.20); nut.position.z += dz;
      nut.quaternion.copy(stud.quaternion);
      g.add(stud, nut);
    }
  }
  // 节气门体
  const tb = new THREE.Group();
  const boreMat = MAT.intakeCast.clone(); boreMat.side = THREE.DoubleSide;
  const bore = meshOf(new THREE.CylinderGeometry(0.20, 0.20, 0.30, 28, 1, true), boreMat);
  bore.rotation.x = Math.PI / 2; tb.add(bore);
  const plateM = meshOf(new THREE.CylinderGeometry(0.193, 0.193, 0.015, 26), MAT.steelBright);
  tb.add(plateM); g.userData.tbPlate = plateM;
  const bell = meshOf(new THREE.LatheGeometry([
    new THREE.Vector2(0.13, 0), new THREE.Vector2(0.20, 0.02), new THREE.Vector2(0.24, 0.10),
  ], 28), MAT.aluCast);
  bell.rotation.x = -Math.PI / 2; bell.position.z = -0.24; tb.add(bell);
  tb.position.set(0, 2.16, 1.52); g.add(tb);
  return g;
}
function heatTintTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 8;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0.0, '#6b5a4c');   // 法兰端(热)
  gr.addColorStop(0.30, '#8a8d94');
  gr.addColorStop(1.0, '#a0a6ae');   // 集气端(冷)
  g.fillStyle = gr; g.fillRect(0, 0, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
let _heatMat = null;
function heatHeaderMat() {
  if (!_heatMat) {
    _heatMat = MAT.header.clone();
    _heatMat.color = new THREE.Color(0xffffff);
    _heatMat.map = heatTintTexture();
    _heatMat.needsUpdate = true;
  }
  return _heatMat;
}
function decalPlane(text, sub, w, h, color = '#d9d4c4') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 118px Arial'; g.fillText(text, 256, sub ? 96 : 128);
  if (sub) { g.font = '600 52px Arial'; g.fillText(sub, 256, 190); }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .6, metalness: .1,
      polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}
function headerGroup(b) {
  const g = new THREE.Group();
  g.userData.pts = [];
  const bk = BANK[b];
  const sgn = bk.zOff < 0 ? -1 : 1;
  const zc = CYLS.filter(c => c.bank === b).map(c => c.z);
  // 集气器: 宽口朝上略后倾, 主管末端按圆周精确埋入锥腔
  const colX = sgn * 2.42, colY = -0.62, colZ = 4.35;
  const tilt = new THREE.Euler(0.18, sgn * 0.12, 0);
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(tilt);
  const wideC = new THREE.Vector3(colX, colY, colZ).addScaledVector(axis, 0.425);
  const narrowC = new THREE.Vector3(colX, colY, colZ).addScaledVector(axis, -0.425);
  const zcSorted = [...zc].sort((a, b2) => a - b2);
  for (let i = 0; i < zcSorted.length; i++) {
    const z = zcSorted[i];
    const phi = -0.9 + i * (1.9 / 3);                     // 圆周角展开
    const end = wideC.clone();
    end.x += Math.cos(phi) * 0.19 * (sgn < 0 ? 1 : -1);
    end.z += Math.sin(phi) * 0.19;
    end.addScaledVector(axis, -0.26);                     // 深埋锥腔(焊入观感)
    const p0 = bankToWorld(bk, 0.735, 2.35, z);
    const w0 = new THREE.Vector3(p0.x + sgn * 0.05, p0.y - 0.05, z);
    const p1 = new THREE.Vector3(p0.x + sgn * 0.38, p0.y - 0.18, z + (z - 3.7) * 0.10);
    const p2 = new THREE.Vector3(sgn * 2.62, 0.30 + (z - 3.7) * 0.05, z + (z - 3.7) * 0.22);
    const p3 = new THREE.Vector3(sgn * 2.58, -0.05, z * 0.55 + colZ * 0.45);
    const curve = new THREE.CatmullRomCurve3([w0, p1, p2, p3, end]);
    g.userData.pts.push(...curve.getPoints(40));
    g.add(meshOf(new THREE.TubeGeometry(curve, 72, P.headerR, 18, false), heatHeaderMat()));
    const fl = meshOf(new THREE.BoxGeometry(0.05, 0.34, 0.34), MAT.steelDark);
    fl.position.copy(bankToWorld(bk, 0.745, 2.35, z));
    fl.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(bk.t[0], bk.t[1], 0));
    g.add(fl);
    for (const dz of [-0.11, 0.11]) {
      const fb = meshOf(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6), MAT.steelBright);
      fb.position.copy(bankToWorld(bk, 0.765, 2.35, z)); fb.position.z += dz;
      fb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bk.t[0], bk.t[1], 0));
      g.add(fb);
    }
  }
  const colMat = MAT.blackSteel.clone(); colMat.side = THREE.DoubleSide;
  const col = meshOf(new THREE.CylinderGeometry(0.30, 0.115, 0.85, 24, 1, true), colMat);
  col.rotation.copy(tilt);
  col.position.set(colX, colY, colZ);
  g.add(col);
  // 锥口焊缝环 + 锥底焊缝环
  const weldG = new THREE.TorusGeometry(0.30, 0.028, 10, 36);
  const weld1 = meshOf(weldG, MAT.copper);
  weld1.position.copy(wideC); weld1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  g.add(weld1);
  const weld2 = meshOf(new THREE.TorusGeometry(0.115, 0.024, 10, 30), MAT.copper);
  weld2.position.copy(narrowC); weld2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  g.add(weld2);
  // 尾管: 严格沿集气器轴线从窄口端向外延伸(埋入 0.2), 无独立倾斜
  const tipLen = 1.5;
  const tip = meshOf(new THREE.CylinderGeometry(0.115, 0.115, tipLen, 24), MAT.header);
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  tip.position.copy(narrowC).addScaledVector(axis, -tipLen / 2 + 0.2);
  g.add(tip);
  return g;
}
function panGroup() {
  const g = new THREE.Group();
  // 深冲压槽形: 截面(法兰缘→外斜壁→大圆弧底→内斜壁), 沿 z 挤出
  {
    const sh = new THREE.Shape();
    sh.moveTo(-1.19, -0.36);
    sh.lineTo(1.19, -0.36);                       // 法兰外缘(顶面将在装配中贴 panRail)
    sh.lineTo(1.19, -0.46);                       // 法兰厚度
    sh.lineTo(0.84, -0.62);                       // 外斜壁
    sh.quadraticCurveTo(0.74, -0.66, 0.62, -0.80);
    sh.quadraticCurveTo(0.52, -0.94, 0.30, -0.985);
    sh.lineTo(-0.30, -0.985);                     // 圆弧底(近似平底微弧)
    sh.quadraticCurveTo(-0.52, -0.94, -0.62, -0.80);
    sh.quadraticCurveTo(-0.74, -0.66, -0.84, -0.62);
    sh.lineTo(-1.19, -0.46);
    sh.closePath();
    const shHole = new THREE.Path();
    shHole.moveTo(-1.135, -0.40);
    shHole.lineTo(1.135, -0.40);
    shHole.lineTo(0.815, -0.645);
    shHole.quadraticCurveTo(0.70, -0.70, 0.585, -0.82);
    shHole.quadraticCurveTo(0.49, -0.92, 0.28, -0.945);
    shHole.lineTo(-0.28, -0.945);
    shHole.quadraticCurveTo(-0.49, -0.92, -0.585, -0.82);
    shHole.quadraticCurveTo(-0.70, -0.70, -0.815, -0.645);
    shHole.lineTo(-1.135, -0.40);
    shHole.closePath();
    sh.holes.push(shHole);
    const pGeo = new THREE.ExtrudeGeometry(sh, {
      depth: 5.06, bevelEnabled: false, curveSegments: 24 });
    // shape(x, y)=世界(x, y), 挤出沿 z: 与曲轴箱相同直接用法
    pGeo.translate(0, 0, 1.13);
    g.add(meshOf(pGeo, MAT.blockGhost.clone()));
  }
  // 前后端封板
  for (const z of [1.14, 6.18]) {
    const cap = meshOf(rectPlate(-1.135, 1.135, -0.945, -0.40, [], 0.03, 0.06), MAT.blockGhost.clone());
    cap.rotation.set(-Math.PI / 2, 0, 0); cap.position.set(0, 0, 0);
    cap.position.z = z; g.add(cap);
  }
  // 底壳冲压肋 ×3
  for (const z of [2.3, 3.66, 5.0]) {
    const rib = meshOf(rbox(0.62, 0.04, 0.10, 0.02), MAT.blockGhost.clone());
    rib.position.set(0, P.panBot - 0.03, z); g.add(rib);
  }
  const plug = meshOf(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), MAT.steelDark);
  plug.position.set(0.45, P.panBot - 0.03, 5.9); g.add(plug);
  return g;
}
function distGroup() {
  const g = new THREE.Group();
  const body = meshOf(new THREE.CylinderGeometry(0.145, 0.155, 0.50, 24), MAT.aluCast);
  body.position.set(0, 1.55, 6.55); g.add(body);
  const shaft = meshOf(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 10), MAT.steelDark);
  shaft.position.set(0, 1.15, 6.55); g.add(shaft);
  const capMat = MAT.coverRed.clone(); capMat.transparent = true; capMat.opacity = 0.9;
  const cap = meshOf(new THREE.CylinderGeometry(0.235, 0.245, 0.30, 28), capMat);
  cap.position.set(0, 1.95, 6.55); g.add(cap);
  const rotor = meshOf(new THREE.BoxGeometry(0.34, 0.04, 0.10), MAT.rubber);
  rotor.position.set(0, 1.84, 6.55); g.add(rotor); g.userData.rotor = rotor;
  const towers = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const tw = meshOf(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 12), MAT.coverRed.clone());
    tw.position.set(Math.cos(a) * 0.185, 2.15, 6.55 + Math.sin(a) * 0.185);
    g.add(tw); towers.push(tw.position.clone());
  }
  g.userData.wires = [];
  for (const c of CYLS) {
    const bk = BANK[c.bank];
    const plugTop = bankToWorld(bk, 0, 2.545 + 1.30, c.z);
    const tw = towers[c.cylNo - 1];
    const mid1 = new THREE.Vector3(tw.x * 1.6, 2.95, 6.5 - (6.5 - c.z) * 0.25);
    const mid2 = new THREE.Vector3(plugTop.x * 0.78, 3.55, c.z + (6.5 - c.z) * 0.10);
    const curve = new THREE.CatmullRomCurve3([tw, mid1, mid2, plugTop]);
    const mat = MAT.wire.clone();
    g.add(meshOf(new THREE.TubeGeometry(curve, 60, 0.024, 12, false), mat));
    g.userData.wires.push({ mat, cyl: c.cylNo, pts: curve.getPoints(40) });
  }
  return g;
}
