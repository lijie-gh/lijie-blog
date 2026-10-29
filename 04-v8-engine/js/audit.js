/* ============================================================================
   间隙自检 —— 静态配合 + 720° 全循环扫描, 结果显示在页面上
   原则: 每一项都给出 实测值/要求值, 不靠"应该没问题"
============================================================================ */
import { P, BANK, CYLS, MAINS, crankLayout, VALVE_WIN, LOBE_HALF, lobeProfile, lobeLambda } from './params.js';
import { lifterBottomY, rockerConst, solveBeta, valveTipS, rodEnds, pistonD } from './kinem.js';

const D2R = Math.PI / 180;

export function runAudit(G) {
  const out = [];
  const ck = (name, value, req, ok = undefined) =>
    out.push({ name, value: +value.toFixed(4), req, pass: ok === undefined ? value >= req - 1e-9 : ok });

  /* ---------- 静态配合 ---------- */
  ck('活塞-缸套 径向油膜', P.boreR - P.pistonR, 0.008);
  ck('活塞环-缸套 径向油膜', P.boreR - 0.4775, 0.002);
  ck('连杆大端-曲柄销 轴承间隙', P.rodBEin - P.crankPinR, 0.008);
  ck('连杆小端-活塞销 间隙', 0.098 - P.pinR, 0.006);
  ck('主轴颈-横隔板孔 间隙', 0.21 - P.mainR, 0.008);
  ck('凸轮轴颈-横隔板孔 间隙', 0.135 - P.camJrnl, 0.008);
  ck('挺柱-山谷底板孔 间隙', 0.076 - P.lifterR, 0.008);
  ck('挺柱-导向管 间隙', 0.084 - P.lifterR, 0.012);
  ck('气门杆-缸盖导管孔 间隙', 0.035 - P.valveStemR, 0.006);
  ck('火花塞管-气门室盖孔 间隙', 0.060 - 0.055, 0.004);
  ck('缸套-缸体缸孔 装配间隙', 0.612 - P.linerOD, 0.008);
  ck('活塞上止点-缸体顶面 余隙', P.deckS - (P.R + P.L + P.crownH), 0.015);
  ck('两列连杆大端 z 向间隙', 2 * (P.rodZSep - P.rodBEw / 2), 0.015);
  ck('平衡重半径 < 缸套下端−裙部', P.linerS0 - P.skirtBelow - P.cwR, 0.05);
  ck('活塞裙下止点-缸套下端 余量', P.linerS0 - ((P.L - P.R) - P.skirtBelow), 0.02);
  ck('曲柄臂-连杆 z 最小间隙(布局)', 0.175 + P.webGap - (P.rodZSep + P.rodBEw / 2), 0.02);
  ck('减振器-前端板 z 间隙', P.frontPlateZ[0] - P.damperZ[1], 0.03);
  ck('飞轮-后端板 z 间隙', P.flyZ[0] - P.rearPlateZ[1], 0.03);
  ck('分电器-飞轮 y 间隙', 1.30 - P.ringR, 0.05);
  ck('摇臂轨-支柱 z 间隙', 0.034 - 0.024, 0.006);
  ck('火花塞管-摇臂 z 间隙', 0.20 - (0.108 / 2 + 0.055), 0.03);

  // 燃烧室胶囊在缸孔内
  {
    let rMax = 0;
    for (const c of CYLS) {
      const a = c.valves[0], b = c.valves[1];
      const R = Math.max(a.r, b.r) + 0.03;
      const dx = b.t - a.t, dz = (b.z - a.z);
      const len = Math.hypot(dx, dz);
      const nx = dx / len, nz = dz / len;
      for (const e of [-1, 1]) {
        const px = (e < 0 ? a.t : b.t) - nx * R, pz = (e < 0 ? a.z : b.z) - nz * R;
        rMax = Math.max(rMax, Math.hypot(px, pz));
      }
      const px = a.t - nz * R, pz = a.z + nx * R;
      rMax = Math.max(rMax, Math.hypot(px, pz));
    }
    ck('燃烧室轮廓-缸孔半径 余量', P.boreR - 0.01 - rMax, 0.02);
  }

  /* ---------- 链条包络 ---------- */
  if (G.timing?.userData.chainPts) {
    let m1 = 1e9, m2 = 1e9;
    for (const p of G.timing.userData.chainPts) {
      const dc = Math.hypot(p.x, p.y);
      const dcam = Math.hypot(p.x, p.y - P.camY);
      if (p.y < 0.6) m1 = Math.min(m1, Math.abs(dc - (P.gearCrankR + P.chainHalf)));
      else m2 = Math.min(m2, Math.abs(dcam - (P.gearCamR + P.chainHalf)));
    }
    ck('链条-曲轴链轮 节线偏差', m1, 0, m1 < 0.006);
    ck('链条-凸轮链轮 节线偏差', m2, 0, m2 < 0.006);
  }

  /* ---------- 高压线-气门室盖 ---------- */
  if (G.dist?.userData.wires) {
    let sMin = 1e9;
    for (const w of G.dist.userData.wires)
      for (const p of w.pts) {
        for (const b of [0, 1]) {
          const bk = BANK[b];
          const s = p.x * bk.u[0] + p.y * bk.u[1];
          const t = p.x * bk.t[0] + p.y * bk.t[1];
          if (t > -0.62 && t < 0.70) sMin = Math.min(sMin, s - (P.headTop + 0.797));
        }
      }
    ck('高压线-气门室盖顶 余隙', sMin, 0.015);
  }

  /* ---------- 排气歧管-缸体裙部 ---------- */
  for (const h of G.headers || []) {
    let m = 1e9;
    for (const p of h.userData.pts)
      if (p.y < 0.40) m = Math.min(m, Math.abs(p.x) - 1.28);
    ck('排气歧管-裙部(' + h.name + ')', m, 0.02);
  }

  /* ---------- 进气道-推杆 ---------- */
  if (G.intake?.userData.runners) {
    let m = 1e9;
    for (const pts of G.intake.userData.runners)
      for (const p of pts) {
        for (const rc of rockerConst) {
          // 推杆线段 B0→杯(基圆位置), 3D 距离含 z 错位
          const a = rc.B0w, b = rc.cinW;
          const abx = b.x - a.x, aby = b.y - a.y;
          const L2 = abx * abx + aby * aby;
          let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / L2;
          t = Math.max(0, Math.min(1, t));
          const qx = a.x + abx * t - p.x, qy = a.y + aby * t - p.y, qz = a.z - p.z;
          const d = Math.hypot(qx, qy, qz) - P.runnerR - 0.032;
          if (Math.abs(qz) < 0.45) m = Math.min(m, d);
        }
      }
    ck('进气道-推杆 最小间隙', m, 0.01);
  }

  /* ---------- 全循环扫描 ---------- */
  const N = 360;   // 每 2° 曲轴
  let valvePistonMin = 1e9, springMin = 1e9, camBEMin = 1e9;
  let linerPen = 0, pushrodSlabMin = 1e9, contactErr = 0;
  const lobeTipR = P.camBase + P.camLift;
  const beR = [P.rodBEout, P.rodBoltR];
  for (let k = 0; k < N; k++) {
    const th = k * 2;
    // 气门-活塞 / 弹簧 / 接触
    for (let j = 0; j < 16; j++) {
      const rc = rockerConst[j];
      const yBot = lifterBottomY(rc.idx, th);
      const lift = yBot - rc.yBase;
      const top = { x: rc.B0w.x, y: rc.B0w.y + P.lifterBodyH + lift };
      const beta = solveBeta(rc, top);
      const tipS = valveTipS(rc, beta);
      const d = pistonD(rc.c, th);
      valvePistonMin = Math.min(valvePistonMin, (tipS - P.valveStemL) - (d + P.crownH));
      springMin = Math.min(springMin, (tipS - 0.06) - (P.headTop + 0.024));
      // 接触一致性(气门垫底 vs 杆顶)
      const cb = Math.cos(beta), sb = Math.sin(beta);
      const coS = rc.pivot.s + rc.R_out * (rc.nout.s * cb + rc.nout.t * sb);
      contactErr = Math.max(contactErr, Math.abs((coS - P.padR + P.contactGap) - tipS));
      // 推杆-缸体外板边缘: 推杆线在缸体 s 段内的 t
      const tS = rc.B0w.x * rc.bk.t[0] + top.y * rc.bk.t[1] - lift * 0; // 近似取底端
      const a = rc.B0w, cu = rc.cinW;
      for (let q = 0; q <= 8; q++) {
        const f = q / 8;
        const px = a.x + (cu.x - a.x) * f, py = a.y + (cu.y - a.y) * f;
        for (const b of [0, 1]) {
          const bk = BANK[b];
          const s = px * bk.u[0] + py * bk.u[1], t = px * bk.t[0] + py * bk.t[1];
          if (s > P.blockS0 && s < P.deckS && t > -0.75) {
            pushrodSlabMin = Math.min(pushrodSlabMin, -0.66 - (t + 0.032));
          }
        }
      }
    }
    // 连杆大端(含耳) vs 凸轮桃尖 & 缸套壁
    for (let i = 0; i < 8; i++) {
      const c = CYLS[i], bk = BANK[c.bank];
      const { be, pin } = rodEnds(c, th);
      const rodAng = Math.atan2(pin.y - be.y, pin.x - be.x);
      const perp = rodAng + Math.PI / 2;
      for (let s = 0; s < 20; s++) {
        const a = s / 20 * Math.PI * 2;
        const rr = beR[s % 2];
        const px = be.x + Math.cos(a) * rr, py = be.y + Math.sin(a) * rr;
        // 凸轮
        const dcam = Math.hypot(px - P.camX, py - P.camY) - lobeTipR;
        camBEMin = Math.min(camBEMin, dcam);
        for (const b of [0, 1]) {
          const bk2 = BANK[b];
          const sAx = px * bk2.u[0] + py * bk2.u[1];
          const tAx = px * bk2.t[0] + py * bk2.t[1];
          for (const cyl2 of CYLS.filter(cc => cc.bank === b)) {
            const rad = Math.hypot(tAx, c.z - cyl2.z);
            if (sAx > P.linerS0 && sAx < P.deckS + 0.002 && rad > P.boreR && rad < P.linerOD)
              linerPen++;
          }
        }
      }
      // 耳(垂直连杆方向)
      for (const e of [-1, 1]) {
        const px = be.x + Math.cos(perp) * e * P.rodBoltR;
        const py = be.y + Math.sin(perp) * e * P.rodBoltR;
        camBEMin = Math.min(camBEMin, Math.hypot(px - P.camX, py - P.camY) - lobeTipR);
      }
    }
  }
  ck('气门-活塞 全循环最小间隙', valvePistonMin, 0.015);
  ck('气门弹簧-全循环最小长度(防并圈)', springMin, 0.145);
  ck('连杆大端-凸轮桃尖 最小间隙', camBEMin, 0.01);
  ck('连杆大端-缸套壁 侵入计数', linerPen, 0, linerPen === 0);
  ck('推杆-缸体板边缘 最小间隙', pushrodSlabMin, 0.005);
  ck('摇臂-气门 接触构造误差', contactErr, 1e-6, contactErr < 1e-6);

  /* ---------- 凸轮-挺柱 包络表间隙 ---------- */
  {
    let minClr = 1e9;
    for (const t of lifterTable) {
      for (let k = 0; k < 720; k++) minClr = Math.min(minClr, t.bottomY[k] - P.camY - P.camBase);
    }
    ck('挺柱底面-凸轮轮廓 最小间隙', minClr, 0.005);
  }

  return out;
}
import { lifterTable } from './kinem.js';
