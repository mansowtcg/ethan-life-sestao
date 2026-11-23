// car.js: el coche de Ethan (física de arcade) y el tráfico que circula por la red de calles
import * as THREE from 'three';
import { carMesh } from './props.js';
import { Vox, mat } from './vox.js';
import { W, collide, ROAD, roadW, addProp, inWaterPoly, inBuilding, instChunks, clampWorld, roadY, nearJunc } from './world.js';
import { GR, nearestEdge, laneOffset } from './graph.js';
import { ST, lightState, calmH } from './street.js';
import { SKY } from './sky.js';
import { dampAng } from './state.js';
import { clamp, damp, rng } from './util.js';
import { T, standY, gY, RISE } from './terrain.js';

export const CARS = {
  c4: { n: 'El C4', type: 'van', col: 0x8a98a4, vmax: 30, acc: 5.0, brake: 14, steer: 2.5, tank: 55, cons: 7.5, price: 0 },
  golf: { n: 'El Golf', type: 'hatch', col: 0xd0322e, vmax: 39, acc: 7.4, brake: 16, steer: 2.9, tank: 50, cons: 8.5, price: 2400 },
  bmw: { n: 'El BMW', type: 'sport', col: 0x1c1c22, vmax: 50, acc: 10.5, brake: 19, steer: 3.1, tank: 60, cons: 11, price: 9500 }
};
// el modelo tiene el morro en x=0: se gira para que avance hacia +z y se centra
// carrocerías del tráfico: una por modelo y color, hecha una vez; cada coche nuevo comparte esa malla (fabricarla en plena partida era un tirón)
const POOL = new Map();
function pooled(type, col) { const k = type + col; let p = POOL.get(k); if (!p) { p = makeBody(type, col); POOL.set(k, p); } const g = new THREE.Group(), m0 = p.children[0], m = new THREE.Mesh(m0.geometry, m0.material); m.rotation.copy(m0.rotation); m.position.copy(m0.position); m.castShadow = m0.castShadow; m.receiveShadow = m0.receiveShadow; g.add(m); g.userData.info = p.userData.info; return g; }
export function makeBody(type, col) { const g = new THREE.Group(), m = carMesh(col, type), info = m.userData.car; m.rotation.y = Math.PI / 2; m.position.z = info.L / 2; g.add(m); g.userData.info = info; return g; }

export class Car {
  constructor(id) { this.g = new THREE.Group(); this.x = 0; this.z = 0; this.yaw = 0; this.y = 0; this.pitch = 0; this.roll = 0; this.grade = 0; this.vx = 0; this.vz = 0; this.vf = 0; this.steer = 0; this.onRoad = true; this.roadT = 0; this.setModel(id); }
  setModel(id) { if (this.body) this.g.remove(this.body); if (this.rig) this.g.remove(this.rig); this.id = id; this.spec = CARS[id]; this.body = makeBody(this.spec.type, this.spec.col); this.info = this.body.userData.info; this.g.add(this.body);
    // lo que se ve desde dentro en primera persona: capó, salpicadero, volante y montantes
    const i = this.info, col = this.spec.col, zb = i.L / 2 - i.c0, zn = i.L / 2, hw = i.W / 2 - .05, dk = 0x1b1d21, v = new Vox();
    v.bx(-hw, i.hoodH - .1, zb, hw, i.hoodH, zn, col); v.bx(-hw, i.hoodH - .02, zb - .46, hw, i.hoodH + .13, zb + .03, dk); v.bx(-hw + .1, i.hoodH + .13, zb - .2, hw - .1, i.hoodH + .16, zb + .02, 0x2a2d33);
    v.bx(.12, i.hoodH + .08, zb - .56, .56, i.hoodH + .14, zb - .5, 0x0e0f12); v.bx(.12, i.hoodH + .3, zb - .56, .56, i.hoodH + .36, zb - .5, 0x0e0f12); v.bx(.5, i.hoodH + .08, zb - .56, .56, i.hoodH + .36, zb - .5, 0x0e0f12); v.bx(.12, i.hoodH + .08, zb - .56, .18, i.hoodH + .36, zb - .5, 0x0e0f12); v.bx(.31, i.hoodH + .02, zb - .52, .37, i.hoodH + .22, zb - .3, 0x0e0f12);      // el volante, a la izquierda (x positivo en el modelo)
    [-1, 1].forEach(sd => v.bx(sd * hw - .05, i.hoodH + .1, zb - .12, sd * hw + .05, i.H + .08, zb - .03, col)); v.bx(-hw, i.H - .06, zb - .7, hw, i.H + .02, zb - .05, dk); v.bx(-.1, i.H - .2, zb - .2, .14, i.H - .08, zb - .16, dk);
    this.rig = v.mesh('lit', 0); this.rig.visible = false; this.g.add(this.rig); this.eye = [.34, i.H - .3, zb - .78]; }
  place(x, z, yaw, y) { this.x = x; this.z = z; this.yaw = yaw; this.vx = this.vz = this.vf = 0; if (T.on) this.y = standY(x, z, y); this.settle(0); this.sync(); }
  // se apoya en el suelo: altura, cabeceo y balanceo según lo que haya bajo los ejes (dt = 0: de golpe)
  settle(dt) {
    if (!T.on) return; const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), e = 1.3, y0 = this.y + .5, hF = standY(this.x + sy * e, this.z + cy * e, y0) + calmH(this.x + sy * e, this.z + cy * e), hB = standY(this.x - sy * e, this.z - cy * e, y0) + calmH(this.x - sy * e, this.z - cy * e), hL = standY(this.x + cy * .8, this.z - sy * .8, y0), hR = standY(this.x - cy * .8, this.z + sy * .8, y0);
    const ty = (hF + hB) / 2, sf = (hF - hB) / (2 * e), tp = -Math.atan(sf), tr = Math.atan((hL - hR) / 1.6);
    if (!dt) { this.y = ty; this.pitch = tp; this.roll = tr; } else { this.y = Math.abs(ty - this.y) > 1.2 ? ty : damp(this.y, ty, 18, dt); this.pitch = damp(this.pitch, tp, 7, dt); this.roll = damp(this.roll, tr, 6, dt); }      /* la carrocería sigue al firme con algo de amortiguación: sin cabeceos secos */
    this.grade = sf;
  }
  sync() { this.g.position.set(this.x, this.y, this.z); if (T.on) this.g.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ'); else this.g.rotation.y = this.yaw; }
  // thr: -1..1 (acelerar / frenar y marcha atrás), st: -1..1 (derecha positivo), hb: freno de mano. Devuelve la fuerza del golpe.
  update(dt, thr, st, hb, S) {
    const sp = this.spec, dead = S.fuel <= 0 || S.dmg >= 100, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), fx = sy, fz = cy, rx = -cy, rz = sy;
    let vf = this.vx * fx + this.vz * fz, vr = this.vx * rx + this.vz * rz; const vmax = sp.vmax * (this.onRoad ? 1 : .5) * (S.dmg > 70 ? .6 : 1);
    if (dead) thr = Math.min(0, thr);
    // cuesta: la gravedad tira del coche; parado y sin tocar nada se queda donde está, como con una marcha metida
    if (T.on && (thr || Math.abs(vf) > .5) && !(hb && Math.abs(vf) < .5)) vf -= 9.81 * this.grade / Math.hypot(1, this.grade) * dt;
    if (thr > 0) { if (vf < -.5) vf += sp.brake * thr * dt; else { const r = vf / vmax; vf += sp.acc * thr * Math.max(0, 1 - r * r) * (vf < 6 ? 1.25 : 1) * dt; } }
    else if (thr < 0) { if (vf > .5) vf += sp.brake * (1 - SKY.rain * .22) * thr * dt; else if (!dead) vf += sp.acc * .7 * thr * Math.max(0, 1 + vf / 9) * dt; }
    vf -= vf * (.02 + (this.onRoad ? 0 : .55)) * dt; if (!thr) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 1.1 * dt);
    if (vf > vmax) vf -= (vf - vmax) * 2 * dt;
    if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 11 * dt);
    vr *= Math.exp(-(hb ? 2.2 : 9 - SKY.rain * 4) * dt);      // con el suelo mojado agarra menos
    this.steer = damp(this.steer, st, 8, dt);
    // a poca velocidad gira con radio fijo (4,6 m); deprisa, cada vez menos
    const av = Math.abs(vf), yr = this.steer * Math.min(av / 4.6, sp.steer / (1 + av * .045)) * (hb && av > 4 ? 1.45 : 1);
    this.yaw -= yr * (vf < 0 ? -1 : 1) * dt;
    this.vx = fx * vf + rx * vr; this.vz = fz * vf + rz * vr; this.vf = vf;
    const dist = Math.hypot(this.vx, this.vz) * dt, n = Math.max(1, Math.ceil(dist / .45)); let impact = 0;
    for (let i = 0; i < n; i++) { this.x += this.vx * dt / n; this.z += this.vz * dt / n; impact = Math.max(impact, this.hitWorld()); }
    this.dist = dist;
    if ((this.roadT -= dt) < 0) { this.roadT = .25; const ne = nearestEdge(this.x, this.z, true, 40); this.onRoad = ne.e >= 0 && ne.d < roadW(ne.road) / 2 + 3; this.road = ne.e >= 0 ? ne.road : null; }
    this.body.rotation.z = damp(this.body.rotation.z, clamp(yr * vf * .0045, -.09, .09), 6, dt); this.body.rotation.x = damp(this.body.rotation.x, clamp(-thr * .02 * (Math.abs(vf) < vmax * .9 ? 1 : 0), -.03, .03), 5, dt);
    this.settle(dt); this.sync(); return impact;
  }
  circles(out) { const hl = this.info.L / 2 - this.info.W / 2 + .1, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw); out[0] = this.x + sy * hl; out[1] = this.z + cy * hl; out[2] = this.x - sy * hl; out[3] = this.z - cy * hl; out[4] = this.x; out[5] = this.z; return this.info.W / 2 + .12; }
  hitWorld() {
    const c = this._c || (this._c = []), r = this.circles(c); let imp = 0;
    for (let k = 0; k < 6; k += 2) { const o = collide(c[k], c[k + 1], r, false, T.on ? this.y + .5 : undefined); if (o.hit) {
      // farolas y señales: si vas deprisa te las llevas por delante en vez de parar en seco
      if (o.prop && o.prop.soft && Math.hypot(this.vx, this.vz) > 6) { this.hitProp = o.prop; o.prop.off = true; this.vx *= .88; this.vz *= .88; continue; }
      this.x += o.x - c[k]; this.z += o.z - c[k + 1]; const vn = this.vx * o.nx + this.vz * o.nz; if (vn < 0) { this.vx -= o.nx * vn * 1.2; this.vz -= o.nz * vn * 1.2; imp = Math.max(imp, -vn); } this.circles(c); } }
    return imp;
  }
  // empujón contra otro coche (círculo en x,z con radio r): devuelve la velocidad de impacto
  bump(x, z, r) {
    const c = this._c || (this._c = []), R = this.circles(c) + r; let imp = 0;
    for (let k = 0; k < 6; k += 2) { const dx = c[k] - x, dz = c[k + 1] - z, d = Math.hypot(dx, dz); if (d < R && d > .001) { const nx = dx / d, nz = dz / d, pen = R - d; this.x += nx * pen; this.z += nz * pen; const vn = this.vx * nx + this.vz * nz; if (vn < 0) { this.vx -= nx * vn * 1.3; this.vz -= nz * vn * 1.3; imp = Math.max(imp, -vn); } this.circles(c); } }
    return imp;
  }
}

// ---------- tráfico
export const PK = { slots: [], grid: new Map() };      // plazas de aparcamiento: { x, z, yaw, ty (1 línea, 2 diagonal, 3 batería), ri (calle), occ (coche fijo), dyn (coche de la tarde) }
export const TR = { list: [], max: 8, t: 0, parked: [], nParked: 0 };
const COLS = [0xd0322e, 0x2a5bb8, 0xf2efe6, 0x26262c, 0x9aa0a8, 0x3a8a5c, 0xe0b23a, 0x6b4a8a, 0xc85a8a, 0x5a8ab8];
const minor = r => r.t === 'service' || r.t === 'track' || r.pr || r.iso;
function pickNext(c) {
  const A = GR.adj[c.b]; let opts = A.filter(o => o.drive && o.to !== c.a); if (!opts.length) opts = A.filter(o => o.drive); if (!opts.length) return false;
  const dx = GR.x[c.b] - GR.x[c.a], dz = GR.z[c.b] - GR.z[c.a], l = Math.hypot(dx, dz) || 1; let tot = 0; const w = opts.map(o => { const ex = GR.x[o.to] - GR.x[c.b], ez = GR.z[o.to] - GR.z[c.b], el = Math.hypot(ex, ez) || 1, dot = (dx * ex + dz * ez) / (l * el), rd = GR.roads[GR.er[o.e]], cls = ROAD[rd.t][1]; const v = Math.pow(dot + 1.15, 2) * cls * (minor(rd) ? .03 : 1); tot += v; return v; });
  let r = Math.random() * tot, k = 0; while (k < w.length - 1 && (r -= w[k]) > 0) k++;
  c.turn = Math.acos(clamp(((GR.x[opts[k].to] - GR.x[c.b]) * dx + (GR.z[opts[k].to] - GR.z[c.b]) * dz) / (l * (GR.el[opts[k].e] || 1)), -1, 1));
  c.a = c.b; c.b = opts[k].to; c.e = opts[k].e; c.s = 0; c.road = GR.roads[GR.er[c.e]]; return true;
}
function target(c, o) { const ax = GR.x[c.a], az = GR.z[c.a], dx = GR.x[c.b] - ax, dz = GR.z[c.b] - az, l = GR.el[c.e] || 1, ux = dx / l, uz = dz / l, off = laneOffset(c.e, c.a); o.x = ax + ux * c.s - uz * off; o.z = az + uz * c.s + ux * off; o.ux = ux; o.uz = uz; return o; }
const _t = {};
export function spawnTraffic(scene, px, pz) {
  if (TR.list.length >= TR.max) return; const a = Math.random() * 6.283, r = 120 + Math.random() * 130, ne = nearestEdge(px + Math.cos(a) * r, pz + Math.sin(a) * r, true, 60, true);
  if (ne.e < 0 || ne.d > 45 || ne.road.u) return; const e = ne.e, rd = ne.road, fwd = rd.o || Math.random() < .5;
  const c = { e, a: fwd ? GR.ea[e] : GR.eb[e], b: fwd ? GR.eb[e] : GR.ea[e], s: (fwd ? ne.t : 1 - ne.t) * GR.el[e], v: 6, road: rd, bumpT: 0, stuck: 0, turn: 0, honk: 0 };
  target(c, _t); if (Math.hypot(_t.x - px, _t.z - pz) < 95) return; for (const o of TR.list) if (Math.hypot(o.x - _t.x, o.z - _t.z) < 18) return;
  const q = Math.random(), big = rd.w >= 6.5, type = q < .1 && big ? 'van' : q < .17 ? 'sport' : q < .24 && rd.w >= 6.5 && /^(primary|secondary|tertiary)/.test(rd.t) ? 'bus' : 'hatch'; c.g = pooled(type, type === 'bus' ? 0x5c9e3a : COLS[Math.floor(Math.random() * COLS.length)]); c.info = c.g.userData.info; c.type = type; c.dwell = 0; c.lastStop = null;
  c.x = _t.x; c.z = _t.z; c.yaw = Math.atan2(_t.ux, _t.uz); c.y = roadY(c.road, c.x, c.z); c.pitch = 0; c.g.position.set(c.x, c.y, c.z); c.g.rotation.y = c.yaw; scene.add(c.g); TR.list.push(c);
}
// obs: [x, z, radio, altura, ...] de lo que deben respetar (Ethan a pie y su coche). now: reloj del juego, para los semáforos
export function updateTraffic(dt, scene, px, pz, obs, now) {
  const red = lightState(now || 0) !== 0;
  for (let i = TR.list.length - 1; i >= 0; i--) {
    const c = TR.list[i], sp = ROAD[c.road.t]; let want = (c.road.vm || sp[1]) * .82; const len = GR.el[c.e], left = len - c.s;
    if (left < 14 && c.turn > .6) want = Math.min(want, 4.5); if (c.bumpT > 0) { c.bumpT -= dt; want = 0; }
    target(c, _t); const ux = _t.ux, uz = _t.uz, look = 5 + c.v * 1.25; let blocked = false;
    for (let k = 0; k < obs.length; k += 4) { if (Math.abs(obs[k + 3] - c.y) > 3) continue; const rx = obs[k] - c.x, rz = obs[k + 1] - c.z, f = rx * ux + rz * uz, s = Math.abs(-rx * uz + rz * ux); if (f > -1 && f < look + obs[k + 2] && s < 1.3 + obs[k + 2]) blocked = true; }
    for (const o of TR.list) { if (o === c || Math.abs(o.y - c.y) > 3) continue; const rx = o.x - c.x, rz = o.z - c.z, f = rx * ux + rz * uz, s = Math.abs(-rx * uz + rz * ux); if (f > 0 && f < look + 2.5 && s < 1.9) blocked = true; }
    if (blocked) { want = 0; c.stuck += dt; } else c.stuck = Math.max(0, c.stuck - dt * 2);
    // el autobús para en las paradas de su lado: unos segundos con el intermitente puesto y sigue
    if (c.type === 'bus') { if (c.dwell > 0) { c.dwell -= dt; want = 0; } else { c.lastStop = c.lastStop || null; for (const st of ST.stops) { if (st === c.lastStop) continue; const rx = st.x - c.x, rz = st.z - c.z, f = rx * ux + rz * uz, side = -rx * uz + rz * ux; if (f > 0 && f < 6 && Math.abs(side) < c.road.w / 2 + 2.6 && side * -1 > -1) { c.lastStop = st; c.dwell = 5 + Math.random() * 4; want = 0; break; } } } }
    // semáforo en rojo o ámbar: se para antes de la línea
    if (red) for (const L of ST.lights) { if (L.ux * ux + L.uz * uz < .8) continue; const rx = L.x - c.x, rz = L.z - c.z, f = rx * ux + rz * uz; if (f > 1 && f < 9 + c.v * 1.6 && Math.abs(-rx * uz + rz * ux) < 5) { want = 0; break; } }
    c.v = want > c.v ? Math.min(want, c.v + 3.2 * dt) : Math.max(want, c.v - 11 * dt); c.s += c.v * dt;
    if (c.s >= len) { const over = c.s - len; if (!pickNext(c)) { c.dead = true; } else c.s = over; }
    target(c, _t); c.x = damp(c.x, _t.x, 7, dt); c.z = damp(c.z, _t.z, 7, dt); if (c.v > .3) c.yaw = dampAng(c.yaw, Math.atan2(_t.ux, _t.uz), 5, dt);
    if (T.on) { const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), hF = roadY(c.road, c.x + sy * 1.4, c.z + cy * 1.4), hB = roadY(c.road, c.x - sy * 1.4, c.z - cy * 1.4); c.y = damp(c.y, (hF + hB) / 2, 14, dt); c.pitch = damp(c.pitch, -Math.atan((hF - hB) / 2.8), 8, dt); c.g.position.set(c.x, c.y, c.z); c.g.rotation.set(c.pitch, c.yaw, 0, 'YXZ'); }
    else { c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw; }
    if (!c.dead && GR.out[c.b] && clampWorld(c.x, c.z, -35)) c.dead = true;      // ha salido del mapa
    if (c.dead || c.stuck > 25 || Math.hypot(c.x - px, c.z - pz) > 330) { scene.remove(c.g); TR.list.splice(i, 1); }
  }
  if ((TR.t -= dt) < 0) { TR.t = .45; spawnTraffic(scene, px, pz); }
}
// carrocería sencilla de coche aparcado (blanca: el color va por instancia)
export const parkedBody = (v, van) => { const W2 = 0xffffff, G2 = 0x39424d, K = 0x2a2a30; if (van) { v.box(0, .3, 0, 1.78, .62, 4.3, W2); v.box(0, .92, -.2, 1.66, .62, 2.9, W2, { front: G2, back: G2, side: G2, top: W2 }); } else { v.box(0, .28, 0, 1.7, .52, 4.0, W2); v.box(0, .8, -.25, 1.56, .5, 2.1, W2, { front: G2, back: G2, side: G2, top: W2 }); } v.box(0, 0, 1.2, 1.74, .56, .6, K); v.box(0, 0, -1.25, 1.74, .56, .6, K); return v.geometry(); };
// losas de las plazas en batería de los aparcamientos. El terreno hace una zanja junto a la calzada (para que el asfalto no asome por debajo),
// y en un aparcamiento sin aceras la plaza caía dentro: los coches salían hundidos un palmo y al entrar en la plaza se daba un bote.
// Cada plaza lleva su losa a la altura del pasillo, con sus rayas, y lo que se apoya en ella lo hace a esa altura (T.pad)
const PADG = new Map(), PH = 2.4, PW = 1.3;
function buildPads(root) {
  PADG.clear(); T.pad = null; const L = PK.slots.filter(s => s.pa); if (!L.length || !T.on) return;
  const cells = new Map(), cA = new THREE.Color(0x6f757b), cL = new THREE.Color(0xe6e3d8), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const quad = (o, P4, c) => { e1.set(P4[3] - P4[0], P4[4] - P4[1], P4[5] - P4[2]); e2.set(P4[6] - P4[0], P4[7] - P4[1], P4[8] - P4[2]); n.crossVectors(e1, e2).normalize(); const up = n.y >= 0, b = o.pos.length / 3; if (!up) n.multiplyScalar(-1);
    for (let k = 0; k < 12; k += 3) { o.pos.push(P4[k], P4[k + 1], P4[k + 2]); o.nor.push(n.x, n.y, n.z); o.col.push(c.r, c.g, c.b); } if (up) o.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else o.idx.push(b, b + 2, b + 1, b, b + 3, b + 2); };
  for (const s of L) { const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), wx = fz, wz = -fx; s.pd = [fx, fz];
    for (const k of new Set([[-PH, -PW], [PH, -PW], [PH, PW], [-PH, PW], [0, 0]].map(q => Math.floor((s.x + fx * q[0] + wx * q[1]) / 6) * 100003 + Math.floor((s.z + fz * q[0] + wz * q[1]) / 6)))) { let l = PADG.get(k); if (!l) PADG.set(k, l = []); l.push(s); }
    const ck = Math.floor(s.x / 160) * 100003 + Math.floor(s.z / 160); let o = cells.get(ck); if (!o) cells.set(ck, o = { pos: [], nor: [], col: [], idx: [] });
    const P = (a, b, dy) => { const x = s.x + fx * a + wx * b, z = s.z + fz * a + wz * b; return [x, gY(x, z) + RISE + dy, z]; }, Q = (a0, b0, a1, b1, dy) => [].concat(P(a0, b0, dy), P(a1, b0, dy), P(a1, b1, dy), P(a0, b1, dy));
    quad(o, Q(-PH, -PW, PH, PW, .012), cA); quad(o, Q(-PH, -PW - .05, PH, -PW + .05, .024), cL); quad(o, Q(-PH, PW - .05, PH, PW + .05, .024), cL); }
  cells.forEach(o => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3)); g.setIndex(o.idx); const m = new THREE.Mesh(g, mat('lit')); m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); });
  T.pad = (x, z) => { const l = PADG.get(Math.floor(x / 6) * 100003 + Math.floor(z / 6)); if (!l) return false; for (let i = 0; i < l.length; i++) { const s = l[i], dx = x - s.x, dz = z - s.z, a = dx * s.pd[0] + dz * s.pd[1]; if (a > PH + .3 || a < -PH - .3) continue; const b = dx * s.pd[1] - dz * s.pd[0]; if (b <= PW + .06 && b >= -PW - .06) return true; } return false; };
  PK.pads = L.length;
}
// coches aparcados: en la banda de aparcamiento de cada calle y en batería en los aparcamientos
export const PCOL = [0xf2efe6, 0xf2efe6, 0xf2efe6, 0xdfe0dc, 0xc9ccd0, 0x9aa0a8, 0x9aa0a8, 0x9aa0a8, 0x7d838a, 0x6a7077, 0x34363c, 0x34363c, 0x34363c, 0x55585e, 0x55585e, 0xa5342c, 0x34558f, 0x3d5f78, 0x4a6b55, 0x7a2f3a, 0xb9ab86, 0x8a8f7a];
export function buildParked(root, M, avoid, q) {
  const r = rng(999), A = [], Bv = [], occ = q === 1 ? .26 : q === 2 ? .42 : .58, C = M.cross || [], cg = new Map(), ck = (x, z) => Math.floor(x / 20) * 100003 + Math.floor(z / 20);
  for (let k = 0; k < C.length; k += 5) { const kk = ck(C[k], C[k + 1]); let l = cg.get(kk); if (!l) cg.set(kk, l = []); l.push(C[k], C[k + 1]); }
  const nearCross = (x, z) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = cg.get(ck(x + i * 20, z + j * 20)); if (l) for (let k = 0; k < l.length; k += 2) if (Math.hypot(l[k] - x, l[k + 1] - z) < 5.2) return true; } return false; };
  const nearStop = (x, z) => ST.stops.some(s => Math.hypot(s.x - x, s.z - z) < 9);
  // ¿pisa otra calle? (bocacalles): distancia al borde de la calzada más cercana que no sea la propia
  const other = (x, z, ri, m) => { const S = W.rsegs, a = Math.floor((x - 9) / 40), b = Math.floor((x + 9) / 40), c = Math.floor((z - 9) / 40), d = Math.floor((z + 9) / 40); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const l = W.rgrid.get(i * 100003 + j); if (!l) continue; for (let n = 0; n < l.length; n++) { const s = l[n] * 5; if (S[s + 4] === ri) continue; const rd = M.roads[S[s + 4]]; if (!ROAD[rd.t][3]) continue; const ax = S[s], az = S[s + 1], ex = S[s + 2] - ax, ez = S[s + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(x - ax - ex * t, z - az - ez * t) < rd.w / 2 + m) return true; } } return false; };
  // ¿pasa por encima de la plaza un camino de peatones, un carril bici o unas escaleras de los que van aparte de la calle? Ahí tampoco se aparca
  const onPath = (x, z, ri, m) => { const S = W.rsegs, a = Math.floor((x - 6) / 40), b = Math.floor((x + 6) / 40), c = Math.floor((z - 6) / 40), d = Math.floor((z + 6) / 40); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const l = W.rgrid.get(i * 100003 + j); if (!l) continue; for (let n = 0; n < l.length; n++) { const s = l[n] * 5; if (S[s + 4] === ri) continue; const rd = M.roads[S[s + 4]], sp = ROAD[rd.t]; if (!sp || sp[3] || rd.b) continue; const ax = S[s], az = S[s + 1], ex = S[s + 2] - ax, ez = S[s + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(x - ax - ex * t, z - az - ez * t) < rd.w / 2 + m) return true; } } return false; };
  const pathOver = (x, z, yaw, ri) => { const sx = Math.sin(yaw) * 1.4, cz = Math.cos(yaw) * 1.4; return onPath(x + sx, z + cz, ri, .75) || onPath(x - sx, z - cz, ri, .75); };
  const put = (x, z, yaw) => { (r() < .72 ? A : Bv).push([x, z, yaw, 0, 1, PCOL[Math.floor(r() * PCOL.length)]]); const sx = Math.sin(yaw), cz = Math.cos(yaw); addProp(x + sx * 1.05, z + cz * 1.05, .92, 'car'); addProp(x - sx * 1.05, z - cz * 1.05, .92, 'car'); };
  // plazas: todas las que caben junto al bordillo y en los aparcamientos. Cuáles llevan coche (occ) sí depende de la calidad gráfica;
  // las plazas, no: así buscar sitio es igual de difícil en todos los aparatos
  PK.slots.length = 0; PK.grid.clear();
  // ¿se monta sobre una plaza que ya existe? (pasillos de aparcamiento muy juntos, o una calle pegada a un recinto): dos círculos por coche
  const clash = (x, z, yaw) => { const sx = Math.sin(yaw) * 1.25, cz = Math.cos(yaw) * 1.25, gi = Math.floor(x / 40), gj = Math.floor(z / 40); for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) { const l = PK.grid.get(i * 100003 + j); if (!l) continue; for (let n = 0; n < l.length; n++) { const q = l[n]; if (Math.abs(q.x - x) > 6 || Math.abs(q.z - z) > 6) continue; const qx = Math.sin(q.yaw) * 1.25, qz = Math.cos(q.yaw) * 1.25;
    for (const a of [1, -1]) for (const b of [1, -1]) if (Math.hypot(x + sx * a - q.x - qx * b, z + cz * a - q.z - qz * b) < 1.75) return true; } } return false; };
  const slot = (x, z, yaw, ty, ri, rate, sd, pa) => { if (W.noPark && W.noPark.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2])) return; /* donde van las txosnas de fiestas */ if (clash(x, z, yaw)) { PK.clash = (PK.clash || 0) + 1; return; } const o = { x, z, yaw, ty, ri, sd: sd || 0, pa: pa ? 1 : 0, occ: r() < rate, dyn: null, i: PK.slots.length }; PK.slots.push(o); const kk = Math.floor(x / 40) * 100003 + Math.floor(z / 40); let l = PK.grid.get(kk); if (!l) PK.grid.set(kk, l = []); l.push(o); if (o.occ) put(x, z, yaw); };
  M.roads.forEach((rd, ri) => { const sp = ROAD[rd.t]; if (!sp || !sp[3] || rd.iso && rd.pr) return; const aisle = rd.s === 'pa'; if (!rd.pk && !aisle) return; let L = 0; for (let k = 0; k + 3 < rd.p.length; k += 2) L += Math.hypot(rd.p[k + 2] - rd.p[k], rd.p[k + 3] - rd.p[k + 1]);
    const cumL = [0]; for (let k = 0; k + 3 < rd.p.length; k += 2) cumL.push(cumL[cumL.length - 1] + Math.hypot(rd.p[k + 2] - rd.p[k], rd.p[k + 3] - rd.p[k + 1]));
    /* rumbo de la calle a s metros del principio, y cuánto gira en un tramo: en las curvas suaves tampoco se aparca */
    const headAt = s => { let k = 0; while (k < cumL.length - 2 && cumL[k + 1] < s) k++; return Math.atan2(rd.p[k * 2 + 2] - rd.p[k * 2], rd.p[k * 2 + 3] - rd.p[k * 2 + 1]); }, turn = (s, m) => { let d = Math.abs(headAt(Math.min(L, s + m)) - headAt(Math.max(0, s - m))); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
    const bends = []; { let a0 = 0; for (let k = 2; k + 3 < rd.p.length; k += 2) { a0 += Math.hypot(rd.p[k] - rd.p[k - 2], rd.p[k + 1] - rd.p[k - 1]); const a1 = Math.atan2(rd.p[k] - rd.p[k - 2], rd.p[k + 1] - rd.p[k - 1]), a2 = Math.atan2(rd.p[k + 2] - rd.p[k], rd.p[k + 3] - rd.p[k + 1]); let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; if (d > .3) bends.push(a0); } }
    // recorre la vía a pasos fijos y llama a f(centro, dirección, s)
    const walk = (step, m0, f) => { let s = m0, acc = 0, k = 0; while (s < L - m0 && k + 3 < rd.p.length) { const dx = rd.p[k + 2] - rd.p[k], dz = rd.p[k + 3] - rd.p[k + 1], l = Math.hypot(dx, dz); if (s > acc + l) { acc += l; k += 2; continue; } const t = s - acc, ux = dx / (l || 1), uz = dz / (l || 1); f(rd.p[k] + ux * t, rd.p[k + 1] + uz * t, ux, uz, s); s += step; } };
    if (aisle) { walk(2.6, 3, (cx, cz, ux, uz) => { [1, -1].forEach(sd => { const off = (rd.w / 2 + 2.4) * sd, x = cx - uz * off, z = cz + ux * off; if (inBuilding(x, z) || inWaterPoly(x, z) || other(x, z, ri, 1.9) || collide(x, z, 1.25, true).hit || (avoid && avoid(x, z))) return; const ya = Math.atan2(ux, uz) + Math.PI / 2; if (pathOver(x, z, ya, ri)) return;
        if (T.on) { const px = -uz * sd, pz = ux * sd, h0 = gY(x - px * 2.4, z - pz * 2.4), h1 = gY(x, z), h2 = gY(x + px * 2.4, z + pz * 2.4); if (Math.abs(h2 - h0) > .6 || Math.abs(h1 - (h0 + h2) / 2) > .3) return; }      /* terreno partido o en talud: ahí no hay plaza */
        slot(x, z, ya + (r() < .5 ? Math.PI : 0), 3, ri, occ * .85, sd, 1); }); }); return; }
    // bandas junto al bordillo, a la derecha y a la izquierda del sentido en que está dibujada la calle: en línea, en diagonal o en batería
    [[rd.pkR, rd.pr2 || 1, 1], [rd.pkL, rd.pl || 1, -1]].forEach(b => { const bw = b[0], ty = b[1], sd = b[2]; if (!bw) return; const step = ty === 3 ? 2.55 : ty === 2 ? 2.95 : 5.3, lat = sd * (rd.w / 2 - bw / 2 - (ty === 1 ? .16 : .1)), back = sd < 0 && !rd.o;      /* un poco hacia dentro: el bordillo de la acera pisa 25 cm de calzada */
      walk(step, ty === 1 ? 8 : 6.5, (cx, cz, ux, uz, s) => { if (bends.some(q => Math.abs(q - s) < (ty === 1 ? 7.5 : 5)) || turn(s, 7) > .34) return; const x = cx - uz * lat, z = cz + ux * lat;
        if (inWaterPoly(x, z) || nearCross(cx, cz) || nearStop(x, z) || nearJunc(cx, cz, ty === 1 ? 8 : 6) || other(x, z, ri, ty === 1 ? 1.4 : 2.3) || collide(x, z, 1.0, true).hit || inBuilding(x, z) || (avoid && avoid(x, z))) return;
        const along = Math.atan2(ux, uz) + (back ? Math.PI : 0), yaw = ty === 1 ? along : ty === 3 ? along + (back ? -sd : sd) * -Math.PI / 2 : along + (back ? -sd : sd) * -.9; if (pathOver(x, z, yaw, ri)) return; slot(x, z, yaw, ty, ri, ty === 1 ? occ : occ * 1.1, sd); }); }); });
  buildPads(root); const body = parkedBody;
  instChunks(root, body(new Vox(), false), mat('lit'), A, { shadow: q > 1, color: true, tilt: true, far: q === 1 ? 170 : 300 }); instChunks(root, body(new Vox(), true), mat('lit'), Bv, { shadow: q > 1, color: true, tilt: true, far: q === 1 ? 170 : 300 });
  TR.nParked = A.length + Bv.length;
}
