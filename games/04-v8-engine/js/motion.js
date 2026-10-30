/* 逐帧运动学更新 —— 与 audit 使用同一套解析解 */
import * as THREE from 'three';
import { P, BANK, CYLS } from './params.js';
import { bankQuat, bankToWorld, orientBetween } from './kit.js';
import { lifterBottomY, rockerConst, solveBeta, valveTipS, rodEnds } from './kinem.js';

const RZ = new THREE.Quaternion();

export class Motion {
  constructor(G) {
    this.G = G;
    this.theta = 0;            // 曲轴角(度)
    this.rpm = 240;            // 展示转速
    this.throttle = 0.35;
    this.BQ = [bankQuat(BANK[0]), bankQuat(BANK[1])];
    this.spark = true;
  }
  advance(dt) {
    // 展示转速: 视觉降速 (rpm 600 ≈ 1.6 转/秒)
    this.theta = (this.theta + this.rpm / 60 * 360 * dt / 10) % 720;
    this.throttle = Math.min(1, 0.25 + this.rpm / 900);
  }
  apply() {
    const G = this.G, th = this.theta, thR = th * Math.PI / 180;
    G.crank.rotation.z = thR;
    G.cam.rotation.z = thR / 2;
    for (let i = 0; i < 8; i++) {
      const c = CYLS[i], bk = BANK[c.bank];
      const { be, pin, d } = rodEnds(c, th);
      G.pistons[i].position.copy(bankToWorld(bk, 0, d, c.z));   // d=沿缸轴行程(勿用含z的向量模长)
      G.rods[i].position.copy(be);
      G.rods[i].rotation.z = Math.atan2(pin.y - be.y, pin.x - be.x) - Math.PI / 2;
    }
    for (let k = 0; k < 16; k++) {
      const rc = rockerConst[k], bk = rc.bk, v = rc.v;
      const yBot = lifterBottomY(rc.idx, th);
      const lift = yBot - rc.yBase;
      G.lifters[k].position.y = yBot;
      const bottom = new THREE.Vector3(rc.B0w.x, yBot + P.lifterBodyH, rc.z);
      const top = rc.B0w.clone(); top.y += P.lifterBodyH + lift;
      orientBetween(G.pushrods[k], bottom, top);
      const beta = solveBeta(rc, top);
      const betaR = bk.u[0] < 0 ? -beta : beta;   // 镜像列渲染旋转取反
      RZ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), betaR);
      G.rockerArms[k].quaternion.copy(this.BQ[rc.c.bank]).multiply(RZ);
      const tipS = valveTipS(rc, beta);
      G.valves[k].position.copy(bankToWorld(bk, v.t, tipS - P.valveStemL, rc.z));
      G.retainers[k].position.copy(bankToWorld(bk, v.t, tipS - 0.045, rc.z));
      const sLen = (tipS - 0.06) - (P.headTop + 0.024);
      G.springs[k].scale.set(bk.u[0] < 0 ? -1 : 1, sLen, 1);
    }
    // 点火闪光 + 分电器
    if (G.flash) {
      for (let i = 0; i < 8; i++) {
        const c = CYLS[i];
        let d = (th - c.fire) % 720; if (d < 0) d += 720;
        const f = d < 36 ? 1 - d / 36 : 0;
        const m = G.flash[i];
        m.material.opacity = this.spark ? f * 0.85 : 0;
        m.material.emissiveIntensity = 0.5 + f * 3;
        m.scale.setScalar(0.6 + f * 0.7);
      }
    }
    if (G.dist) {
      G.dist.userData.rotor.rotation.y = -thR / 2;
      for (const w of G.dist.userData.wires) {
        const c = CYLS.find(cc => cc.cylNo === w.cyl);
        let d = (th - c.fire) % 720; if (d < 0) d += 720;
        const f = d < 30 ? 1 - d / 30 : 0;
        w.mat.emissive = new THREE.Color(0x33ddff);
        w.mat.emissiveIntensity = f * 1.4;
      }
    }
    // 节气门
    if (G.intake?.userData.tbPlate) {
      G.intake.userData.tbPlate.rotation.x = Math.PI / 2 * (1 - this.throttle);
    }
  }
}
