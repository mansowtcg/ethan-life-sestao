// Particulas 3D: monedas, chispas, tuercas, humo, confeti... todo cajitas instanciadas.
import * as THREE from 'three';

export const FXB = { y: 0 };      // altura del suelo donde está Ethan: las partículas se piden respecto a ella
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), EU = new THREE.Euler(), C = new THREE.Color();

class Pool {
  constructor(n, material) {
    this.n = n; this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, C.setHex(0xffffff)); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  // o: x,y,z,vx,vy,vz,life,size,sy,sz,color,g,drag,floor,bounce,spin,grow,fade
  add(o) {
    if (this.list.length >= this.n) this.list.shift();
    const p = { x: o.x, y: o.y + FXB.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, t: 0, sx: o.size || .1, sy: o.sy || o.size || .1, sz: o.sz || o.size || .1,
      color: o.color === undefined ? 0xffffff : o.color, g: o.g === undefined ? 9 : o.g, drag: o.drag || 0, floor: o.floor === undefined ? undefined : o.floor + FXB.y, bounce: o.bounce === undefined ? .4 : o.bounce,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, spin: o.spin === undefined ? 6 : o.spin, grow: o.grow || 0, fade: o.fade === undefined ? .25 : o.fade, color2: o.color2 };
    this.list.push(p); return p;
  }
  update(dt) {
    const L = this.list; let k = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.t += dt; if (p.t >= p.life) continue;
      p.vy -= p.g * dt; if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor + p.sy / 2) { p.y = p.floor + p.sy / 2; if (p.vy < 0) { p.vy = -p.vy * p.bounce; p.vx *= .7; p.vz *= .7; p.spin *= .6; if (Math.abs(p.vy) < .6) { p.vy = 0; p.spin = 0; } } }
      p.rx += p.spin * dt; p.rz += p.spin * .7 * dt;
      const u = p.t / p.life, f = p.fade > 0 && u > 1 - p.fade ? (1 - u) / p.fade : 1, gs = (1 + p.grow * u) * f;
      EU.set(p.rx, p.ry, p.rz); Q.setFromEuler(EU); P.set(p.x, p.y, p.z); S.set(p.sx * gs, p.sy * gs, p.sz * gs);
      M4.compose(P, Q, S); this.mesh.setMatrixAt(k, M4);
      if (p.color2 !== undefined) { C.setHex(p.color).lerp(new THREE.Color(p.color2), u); } else C.setHex(p.color);
      this.mesh.setColorAt(k, C);
      L[k++] = p;
    }
    L.length = k; this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, n) {
    this.lit = new Pool(n || 260, new THREE.MeshLambertMaterial());
    this.glow = new Pool(n || 260, new THREE.MeshBasicMaterial({ fog: false }));
    this.soft = new Pool(120, new THREE.MeshBasicMaterial({ transparent: true, opacity: .5, depthWrite: false }));
    this.lit.mesh.castShadow = false; scene.add(this.lit.mesh, this.glow.mesh, this.soft.mesh);
    this.max = 1;
  }
  update(dt) { this.lit.update(dt); this.glow.update(dt); this.soft.update(dt); }
  r(a, b) { return a + Math.random() * (b - a); }
  coins(x, y, z, n, floor) {
    for (let i = 0; i < n; i++) this.lit.add({ x, y, z, vx: this.r(-1.6, 1.6), vy: this.r(2.6, 5), vz: this.r(.2, 2.2), life: this.r(1.1, 1.7), size: .13, sy: .04, sz: .13, color: Math.random() < .5 ? 0xf2c230 : 0xffdd66, g: 11, floor: floor, bounce: .45, spin: 14 });
  }
  sparks(x, y, z, n, col) {
    for (let i = 0; i < n; i++) this.glow.add({ x, y, z, vx: this.r(-2.4, 2.4), vy: this.r(.6, 3.6), vz: this.r(-.6, 2.6), life: this.r(.18, .42), size: this.r(.03, .07), sy: .03, color: col || 0xffe27a, color2: 0xff6a1f, g: 7, spin: 20, fade: .6 });
  }
  nuts(x, y, z, n, floor) {
    for (let i = 0; i < n; i++) this.lit.add({ x, y, z, vx: this.r(-2, 2), vy: this.r(2, 4.4), vz: this.r(.3, 2.4), life: this.r(1, 1.5), size: .09, sy: .05, color: Math.random() < .5 ? 0x9aa0a8 : 0x6c727a, g: 11, floor: floor, bounce: .5, spin: 16 });
  }
  smoke(x, y, z, n, col, up) {
    for (let i = 0; i < n; i++) this.soft.add({ x: x + this.r(-.15, .15), y, z: z + this.r(-.15, .15), vx: this.r(-.25, .25), vy: this.r(.5, 1.1) * (up || 1), vz: this.r(-.2, .2), life: this.r(.9, 1.7), size: this.r(.14, .26), color: col || 0x9aa39c, g: -.2, drag: .8, spin: 1.5, grow: 1.8, fade: .7 });
  }
  fire(x, y, z, n) {
    for (let i = 0; i < n; i++) this.glow.add({ x: x + this.r(-.25, .25), y, z: z + this.r(-.2, .2), vx: this.r(-.3, .3), vy: this.r(1.2, 2.6), vz: this.r(-.2, .2), life: this.r(.3, .6), size: this.r(.08, .16), color: 0xffd34d, color2: 0xff3b1f, g: -1.5, spin: 6, fade: .8 });
  }
  confetti(x, y, z, n, spread) {
    const C2 = [0xc9d856, 0x5f9a70, 0xe05548, 0xe8a917, 0xa7cdc6, 0x3d8bfd, 0xa855f7, 0xff5ca0]; spread = spread || 2.4;
    for (let i = 0; i < n; i++) this.lit.add({ x, y, z, vx: this.r(-spread, spread), vy: this.r(2, 5.5), vz: this.r(-spread * .6, spread), life: this.r(1.2, 2), size: .11, sy: .02, sz: .07, color: C2[i % C2.length], g: 5, drag: 1.2, spin: 12 });
  }
  stars(x, y, z, n, col) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = this.r(1.5, 3.4); this.glow.add({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, vz: this.r(-.5, 1.5), life: this.r(.35, .7), size: this.r(.07, .13), color: col || 0xffe27a, g: 1, drag: 2.5, spin: 10, fade: .7 }); }
  }
  hearts(x, y, z, n) { for (let i = 0; i < n; i++) this.glow.add({ x: x + this.r(-.3, .3), y, z: z + this.r(-.2, .2), vx: this.r(-.2, .2), vy: this.r(.6, 1.2), vz: 0, life: this.r(1, 1.6), size: .12, color: 0xff5ca0, g: -.3, spin: 2, fade: .5 }); }
  drops(x, y, z, n, col) { for (let i = 0; i < n; i++) this.glow.add({ x, y, z, vx: this.r(-.8, .8), vy: this.r(.6, 1.8), vz: this.r(-.3, .8), life: .6, size: .05, sy: .09, color: col || 0x84c6f0, g: 8, spin: 0, fade: .4 }); }
  glint(x, y, z, col) { this.glow.add({ x, y, z, vy: .35, life: .7, size: .1, color: col || 0xffffff, g: 0, spin: 5, fade: .9, grow: .6 }); }
  puff(x, y, z, col, n) { for (let i = 0; i < (n || 6); i++) { const a = Math.random() * 6.28; this.soft.add({ x, y, z, vx: Math.cos(a) * 1.2, vy: this.r(.2, 1), vz: Math.sin(a) * 1.2, life: .55, size: .16, color: col || 0xffffff, g: 0, drag: 3, spin: 2, grow: 1.4, fade: .8 }); } }
}
