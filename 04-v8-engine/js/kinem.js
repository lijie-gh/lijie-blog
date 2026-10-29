/* ============================================================================
   运动学求解 —— 全解析构造, 保证配合副"恰好接触/恒定间隙"
   · 挺柱高度: 凸轮极坐标轮廓在挺柱底面圆足迹内的最大包络 + 0.006 间隙(查表 720 步)
   · 推杆: 随挺柱沿世界 +Y 平移(刚体平移), 上端恒在摇臂输入垫接触面上
   · 摇臂转角 β: 由推杆顶点沿推杆方向约束闭式解
   · 气门: 由摇臂输出垫底面解析确定 → 接触零穿模
============================================================================ */
import * as THREE from 'three';
import { P, BANK, CYLS, VALVE_WIN, LOBE_HALF, lobeProfile, lobeLambda, slider } from './params.js';

const D2R = Math.PI / 180;

/* ---------- 凸轮挺柱包络表 ---------- */
const LIFT_N = 720;            // 每 1° 曲轴一档
export const lifterTable = []; // 每气门一项: {z, bottomY: Float64Array(720)}

export function buildLifterTables() {
  for (const c of CYLS) {
    const bk = BANK[c.bank];
    const dx = (bk.zOff < 0 ? -1 : 1) * P.lifterRowX;
    for (const v of c.valves) {
      const kind = v.kind;
      const chiC = (VALVE_WIN[kind][0] + VALVE_WIN[kind][1]) / 2;
      const lam = lobeLambda(c.fire, chiC);
      // 凸轮局部极坐标轮廓
      const NPT = 96, poly = [];
      for (let i = 0; i < NPT; i++) {
        const phi = i / NPT * Math.PI * 2;
        let d = phi - (lam % (Math.PI * 2));
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        poly.push({ phi, r: P.camBase + lobeProfile(d, LOBE_HALF[kind]) });
      }
      const arr = new Float64Array(LIFT_N);
      for (let k = 0; k < LIFT_N; k++) {
        const th = k * D2R;                  // 曲轴角
        const cam = th / 2;                  // 凸轮转角
        let h = P.camBase;
        for (const q of poly) {
          const a = q.phi + cam;
          const x = Math.cos(a) * q.r, y = Math.sin(a) * q.r;
          const ddx = x - dx;
          if (ddx * ddx + y * y <= P.lifterR * P.lifterR && y > h) h = y;
        }
        arr[k] = P.camY + h + 0.006;         // 挺柱底面世界高度
      }
      lifterTable.push({ dx, z: c.z + v.z, bottomY: arr });
    }
  }
}
export function lifterBottomY(idx, thetaDeg) {
  const t = lifterTable[idx];
  let k = thetaDeg % 720; if (k < 0) k += 720;
  const i0 = Math.floor(k), i1 = (i0 + 1) % LIFT_N, f = k - i0;
  return t.bottomY[i0] * (1 - f) + t.bottomY[i1] * f;
}

/* ---------- 摇臂几何常数(构建期一次求解) ---------- */
/* bank 系: x=t(外正), y=s(沿缸轴), z=世界 */
export const rockerConst = [];

export function solveRockers() {
  let idx = 0;
  for (const c of CYLS) {
    const bk = BANK[c.bank];
    const dx = (bk.zOff < 0 ? -1 : 1) * P.lifterRowX;
    for (const v of c.valves) {
      const yBase = lifterBottomY(idx, 0);
      const cup = bankTS(bk, -0.42, 3.02);       // 杯世界(x,y)
      const B0v = new THREE.Vector3(dx, yBase + P.lifterBodyH, c.z + v.z);
      // 推杆方向(世界, 固定)
      const dHat = cup.clone().sub(B0v).setZ(0).normalize();
      const toTS = (w) => ({ t: w.x * bk.t[0] + w.y * bk.t[1], s: w.x * bk.u[0] + w.y * bk.u[1] });
      // 杯=推杆顶=C_in − padR·d̂ ⇒ C_in = 杯 + padR·d̂
      const cinW = cup.clone().addScaledVector(dHat, P.padR);
      const C_in = toTS(cinW);
      const pivot = { t: v.kind === 'I' ? -0.34 : -0.14, s: 3.32 };
      const nin = { t: C_in.t - pivot.t, s: C_in.s - pivot.s };
      const R_in = Math.hypot(nin.t, nin.s);
      nin.t /= R_in; nin.s /= R_in;
      const tipS0 = P.vseatFlush + 0.002 + P.valveStemL;
      const C_out0 = { t: v.t, s: tipS0 + P.contactGap + P.padR };
      const nout = { t: C_out0.t - pivot.t, s: C_out0.s - pivot.s };
      const R_out = Math.hypot(nout.t, nout.s);
      nout.t /= R_out; nout.s /= R_out;
      const dTS = { t: dHat.x * bk.t[0] + dHat.y * bk.t[1], s: dHat.x * bk.u[0] + dHat.y * bk.u[1] };
      const A = nin.t * dTS.t + nin.s * dTS.s;
      const nPerp = { t: -nin.s, s: nin.t };
      const B = nPerp.t * dTS.t + nPerp.s * dTS.s;
      const normAB = Math.hypot(A, B);
      rockerConst.push({
        c, v, bk, idx, pivot, R_in, R_out, nin, nout, dTS,
        phi0: Math.atan2(B, A), cosMax: normAB,
        B0w: B0v.clone(), dHat: dHat.clone(), yBase,
        tipS0, cinW, z: c.z + v.z,
      });
      idx++;
    }
  }
}

/* β 闭式解: A·cosβ + B·sinβ = q, 取靠近 0 的根 */
export function solveBeta(rc, pushrodTopWorld) {
  const bk = rc.bk;
  const bS = pushrodTopWorld.x * bk.u[0] + pushrodTopWorld.y * bk.u[1]; // 只 s 约束不够——用 d̂ 投影
  const proj = pushrodTopWorld.x * rc.dHat.x + pushrodTopWorld.y * rc.dHat.y;
  const q = (proj + P.padR - (rc.pivot.t * rc.dTS.t + rc.pivot.s * rc.dTS.s)) / rc.R_in;
  const ac = Math.acos(Math.max(-1, Math.min(1, q / rc.cosMax)));
  let b1 = rc.phi0 + ac, b2 = rc.phi0 - ac;
  if (Math.abs(b2) < Math.abs(b1)) return b2; else return b1;
}
/* 摇臂输出垫中心(β 后, bank 系) */
export function rockerCout(rc, beta) {
  const cb = Math.cos(beta), sb = Math.sin(beta);
  const t = rc.pivot.t + rc.R_out * (rc.nout.t * cb - rc.nout.s * sb);
  const s = rc.pivot.s + rc.R_out * (rc.nout.s * cb + rc.nout.t * sb);
  return { t, s };
}
export function rockerCin(rc, beta) {
  const cb = Math.cos(beta), sb = Math.sin(beta);
  const t = rc.pivot.t + rc.R_in * (rc.nin.t * cb - rc.nin.s * sb);
  const s = rc.pivot.s + rc.R_in * (rc.nin.s * cb + rc.nin.t * sb);
  return { t, s };
}
/* 气门杆顶 s 坐标(精确接触) */
export function valveTipS(rc, beta) {
  const co = rockerCout(rc, beta);
  return co.s - P.padR + P.contactGap;
}
export function bankTS(bk, t, s) {
  return new THREE.Vector3(bk.t[0] * t + bk.u[0] * s, bk.t[1] * t + bk.u[1] * s, 0);
}
/* 活塞销行程 d(ψ) */
export function pistonD(c, thetaDeg) {
  const psi = thetaDeg * D2R + P.pinA[c.pin] * D2R - bankAxis(c.bank);
  return slider(P.R, P.L, psi);
}
const AX = [135 * D2R, 45 * D2R];
export function bankAxis(b) { return AX[b]; }
/* 连杆两端世界坐标 */
export function rodEnds(c, thetaDeg) {
  const bk = BANK[c.bank];
  const th = thetaDeg * D2R, a = th + P.pinA[c.pin] * D2R;
  const be = new THREE.Vector3(Math.cos(a) * P.R, Math.sin(a) * P.R, c.z);
  const d = pistonD(c, thetaDeg);
  const pin = new THREE.Vector3(bk.u[0] * d, bk.u[1] * d, c.z);
  return { be, pin, d };
}
