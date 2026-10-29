/* ============================================================================
   V8 参数与总体布局 —— 所有尺寸同源推导，防穿模的第一道保证
   坐标系: 曲轴沿 Z 轴(前端=低 z，飞轮=高 z), Y 向上, 单位≈缸径=1.0
   ----------------------------------------------------------------------------
   关键防穿模不变量(由 audit.js 逐条数值复核):
   · 活塞/环半径 < 缸套内半径(恒定油隙)
   · 连杆大端扫掠半径 + 凸轮轴升程顶点 < 凸轮轴到曲轴距离(径向分离)
   · 曲柄臂/平衡重最大半径 < 缸套下端 s 值(永远够不到缸套跨度)
   · 气门升程窗口在 TDC 处归零(sin² 窗), 活塞上止点低于气门关闭面 0.07
   · 摇臂-气门/推杆-摇臂接触按"解析求解+0.003 预留"构造, 不穿不脱
============================================================================ */
const D2R = Math.PI / 180;
const s45 = Math.SQRT1_2; // 0.7071

export const P = {
  // --- 曲柄连杆 ---
  R: 0.45,            // 曲柄回转半径 (行程 0.9)
  L: 1.5,             // 连杆长度(孔心距)
  boreR: 0.48,        // 缸套内半径
  pistonR: 0.47,      // 活塞半径
  linerOD: 0.60,      // 缸套外半径
  linerS0: 0.80,      // 缸套下端(沿缸轴 s)
  deckS: 2.25,        // 缸体顶面(上止点皇冠顶 2.23 + 0.02)
  crownH: 0.28,       // 活塞销孔到皇冠顶
  skirtBelow: 0.28,   // BDC 裙底 0.77 < 缸套下端 0.80, 全程不出缸套   // 活塞销孔到裙底
  pinR: 0.09,         // 活塞销半径
  // --- 曲轴 ---
  mainR: 0.20, mainW: 0.35,
  crankPinR: 0.155,   // 曲柄销半径(连杆轴颈)
  rodBEin: 0.165, rodBEout: 0.285, rodBEw: 0.13, rodBoltR: 0.31,
  rodZSep: 0.075,     // 两列连杆在销上的 z 错位
  webW: 0.25, webGap: 0.02,
  cwR: 0.40,          // 平衡重最大半径 (< linerS0-余量)
  snoutR: 0.17,
  // --- 缸距/台位 ---
  sp: 1.24,           // 缸心距(z)
  pinZ: [1.90, 3.14, 4.38, 5.62],
  pinA: [0, 90, 270, 180],   // 交叉平面曲轴(90° V8 特征)
  // --- 配气 ---
  camX: 0, camY: 1.10, camBase: 0.13, camLift: 0.155, camJrnl: 0.125,
  lifterR: 0.065, lifterRowX: 0.072,
  valveI: { r: 0.175, t: -0.10, z: -0.20 },  // 进气门(相对缸心)
  valveE: { r: 0.150, t: +0.10, z: +0.20 },  // 排气门
  vseatFlush: 2.302,  // 气门关闭面(燃烧室底)
  chamberTop: 2.52,   // 燃烧室顶
  valveStemR: 0.026, valveStemL: 0.85,
  lobeHW: 0.055,      // 凸轮桃尖半宽
  // --- 缸盖/罩 ---
  gasketT: 0.02,
  headBot: 2.27, headTop: 2.77,
  headSlot: [-0.60, -0.30],  // 推杆槽(t 区间) —— 缸盖与缸体均按此分体
  coverH: 0.46,
  // --- 摇臂 ---
  padR: 0.05, contactGap: 0.003,
  // --- 前端 ---
  pulleyZ: [0.10, 0.28], pulleyR: 0.42,
  damperZ: [0.32, 0.62], damperR: 0.56,
  gearCrankR: 0.20, gearCamR: 0.40, gearW: 0.08, gearZ: [0.68, 0.76],
  chainHalf: 0.024,
  frontPlateZ: [0.99, 1.05],
  // --- 后端 ---
  rearPlateZ: [6.44, 6.50],
  flangeZ: [6.56, 6.68], flangeR: 0.30,
  flyZ: [6.69, 6.78], flyR: 0.60, ringR: 0.668,
  lifterBodyH: 0.38,
  plateY: 1.46,
  // --- 缸体 ---
  blockS0: 0.95, blockT: 0.70,      // 缸体_BANK 沿 t 半宽(推杆槽分体后: 内侧墙 -0.70..-0.60)
  skirtX: 1.20, skirtBot: -0.75, panRailY: -0.30,
  innerX: 0.80,
  // --- 油底壳 ---
  panBot: -0.95,
  // --- 进排气 ---
  runnerR: 0.075,
  headerR: 0.105,
};

// ---------------- 气缸坐标 ----------------
export const BANK = [
  { name: 'L', beta: +45, u: [-s45, s45], t: [-s45, -s45], zOff: -P.rodZSep, ux: -45 },
  { name: 'R', beta: -45, u: [+s45, s45], t: [+s45, -s45], zOff: +P.rodZSep, ux: +45 },
];
// 曲柄销世界方向角(自 +X): TDC 时 = 缸轴角: L=135°, R=45°
export const BANK_AXIS_ANG = [135, 45].map(a => a * D2R);

export function slider(r, l, psi) { // 曲柄连杆位移
  const s = r * Math.sin(psi);
  return r * Math.cos(psi) + Math.sqrt(l * l - s * s);
}

// ---------------- 点火相位 ----------------
// TDC(自+X角): L1..L4 = 135,45,225,315 ; R1..R4 = 45,315,135,225
// 按 GM 1-8-4-3-6-5-7-2 交替分配做功行程 (L=1,3,5,7 / R=2,4,6,8 前→后)
const FIRE = { L1: 135, R4: 225, R2: 315, L2: 405, R3: 495, L3: 585, L4: 675, R1: 765 };

export const CYLS = []; // 8 缸
for (let b = 0; b < 2; b++)
  for (let i = 0; i < 4; i++) {
    const bk = BANK[b];
    const name = bk.name + (i + 1);
    CYLS.push({
      bank: b, pin: i, name,
      cylNo: b === 0 ? 1 + 2 * i : 2 + 2 * i,   // GM 风格编号
      z: P.pinZ[i] + bk.zOff,
      fire: FIRE[name],
      valves: [
        { kind: 'I', ...P.valveI, zr: P.valveI.z },
        { kind: 'E', ...P.valveE, zr: P.valveE.z },
      ],
    });
  }
export const FIRING_ORDER = [1, 8, 4, 3, 6, 5, 7, 2];

// 每缸每气门: 凸轮窗口(χ = 720° 循环相位, 0=做功TDC)
export const VALVE_WIN = { I: [0.50, 0.78], E: [0.225, 0.505] };

// ---------------- 曲轴台位 ----------------
export const MAINS = [1.28, 2.52, 3.76, 5.00, 6.24];
export function crankLayout() {
  const webs = [], pins = [];
  for (let i = 0; i < 4; i++) {
    const z = P.pinZ[i], a = P.pinA[i] * D2R;
    const pinHalf = P.crankPinR === 0.155 ? 0.175 : 0.175; // 销半长(含嵌入)
    pins.push({ z, a, z0: z - 0.175, z1: z + 0.175 });
    const mL = MAINS[i], mR = MAINS[i + 1];
    webs.push({ z0: mL + P.mainW / 2 + P.webGap, z1: z - 0.175 - P.webGap, pinA: a, side: -1 });
    webs.push({ z0: z + 0.175 + P.webGap, z1: mR - P.mainW / 2 - P.webGap, pinA: a, side: +1 });
  }
  return { pins, webs };
}

// ---------------- 凸轮升程型线 ----------------
export function lobeProfile(phi, winHalfCam) { // phi: 距桃尖角(弧度), 返回附加升程
  const x = Math.abs(phi);
  if (x >= winHalfCam) return 0;
  return P.camLift * Math.pow(Math.sin(Math.PI / 2 * (1 - x / winHalfCam)), 2);
}
// 每个挺柱的窗口半宽(凸轮角)
export const LOBE_HALF = {
  I: (VALVE_WIN.I[1] - VALVE_WIN.I[0]) / 2 * Math.PI,   // χ×720/2 → 凸轮弧度
  E: (VALVE_WIN.E[1] - VALVE_WIN.E[0]) / 2 * Math.PI,
};
// 桃尖指向角 λ: θ=θ_peak 时桃尖朝上(+Y=90°)
export function lobeLambda(cylFire, chiCenter) {
  const thetaPeak = cylFire + 720 * chiCenter;
  return (90 * D2R - thetaPeak / 2 * D2R);
}
