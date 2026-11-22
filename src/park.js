// park.js: buscar sitio para aparcar. Las plazas salen de car.js (PK.slots). Aquí se llena el barrio de Ethan por la tarde
// (quedan muy pocos huecos), se mira cómo ha quedado el coche al bajarse y qué le pasa de noche a uno mal aparcado.
import * as THREE from 'three';
import { G } from './state.js';
import { PK, PCOL, parkedBody } from './car.js';
import { W, addProp, roadNear, ROAD } from './world.js';
import { T, standY, slopeAt } from './terrain.js';
import { Vox, mat } from './vox.js';
import { rng } from './util.js';

const D = { mesh: null, used: [], hole: [], cap: 440 }, _o = new THREE.Object3D(), _c = new THREE.Color(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export const ZONE = { x: 0, z: 0, R: 200, free: [], day: -1 };      // el barrio lleno de hoy y sus huecos libres

export function initPark(root) {
  D.mesh = new THREE.InstancedMesh(parkedBody(new Vox(), false), mat('lit'), D.cap); D.mesh.count = D.cap; D.mesh.frustumCulled = false; D.mesh.castShadow = G.q > 1; D.mesh.matrixAutoUpdate = false;
  for (let i = 0; i < D.cap; i++) { D.mesh.setMatrixAt(i, ZERO); D.mesh.setColorAt(i, _c.setHex(0xffffff)); } root.add(D.mesh); initMarks(root);
}
export function slotsNear(x, z, R) {
  const out = [], a = Math.floor((x - R) / 40), b = Math.floor((x + R) / 40), c = Math.floor((z - R) / 40), d = Math.floor((z + R) / 40);
  for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const l = PK.grid.get(i * 100003 + j); if (l) for (const s of l) if (Math.hypot(s.x - x, s.z - z) <= R) out.push(s); }
  return out;
}
const taken = s => s.occ || s.dyn !== null;
// bulto del coche de una plaza: se crea una vez y luego solo se enciende y se apaga
function bulk(s, on) { if (!s.props) { if (!on) return; const sx = Math.sin(s.yaw), cz = Math.cos(s.yaw); s.props = [addProp(s.x + sx * 1.05, s.z + cz * 1.05, .92, 'car'), addProp(s.x - sx * 1.05, s.z - cz * 1.05, .92, 'car')]; } s.props.forEach(p => { p.off = !on; }); }
function setDyn(s, i, col) {
  s.dyn = i; _o.position.set(s.x, T.on ? standY(s.x, s.z, -1e9) : 0, s.z);
  if (T.on) { const g = slopeAt(s.x, s.z, 1.6), sy = Math.sin(s.yaw), cy = Math.cos(s.yaw); _o.rotation.set(-Math.atan(g[0] * sy + g[1] * cy), s.yaw, Math.atan(g[0] * cy - g[1] * sy), 'YXZ'); } else _o.rotation.set(0, s.yaw, 0);
  _o.updateMatrix(); D.mesh.setMatrixAt(i, _o.matrix); D.mesh.setColorAt(i, _c.setHex(col)); D.used[i] = s; bulk(s, true);
}
function clearDyn() { for (let i = 0; i < D.cap; i++) { const s = D.used[i]; if (s) { s.dyn = null; bulk(s, false); D.mesh.setMatrixAt(i, ZERO); } } D.used.length = 0; D.hole.length = 0; D.mesh.instanceMatrix.needsUpdate = true; }
// llena de coches las plazas vacías alrededor de (x, z) y deja nFree huecos. easy: uno de ellos, cerca de la puerta
export function fillZone(x, z, R, nFree, seed, easy, keep) {
  clearDyn(); const r = rng(seed), all = slotsNear(x, z, R).filter(s => !s.occ && !(keep && Math.hypot(s.x - keep.x, s.z - keep.z) < 2.6)), free = [];
  all.forEach(s => { s.k = r(); s.d = Math.hypot(s.x - x, s.z - z); });
  if (easy) { const near = all.filter(s => s.d < 75 && s.d > 12).sort((a, b) => a.k - b.k)[0]; if (near) free.push(near); }
  const far = all.filter(s => s.d > 105 && s.d < R - 15).sort((a, b) => a.k - b.k); for (const s of far) { if (free.length >= nFree) break; if (free.every(f => Math.hypot(f.x - s.x, f.z - s.z) > 45)) free.push(s); }
  all.sort((a, b) => a.d - b.d); let i = 0; for (const s of all) { if (free.indexOf(s) >= 0) continue; if (i >= D.cap) break; setDyn(s, i++, PCOL[Math.floor(r() * PCOL.length)]); }
  D.mesh.instanceMatrix.needsUpdate = true; if (D.mesh.instanceColor) D.mesh.instanceColor.needsUpdate = true;
  ZONE.x = x; ZONE.z = z; ZONE.R = R; ZONE.free = free; ZONE.n = i; return free;
}
// se va un coche de la zona: queda un hueco libre a entre d0 y d1 metros del jugador (y dentro de la zona)
export function openSlot(x, z, d0, d1) {
  const C = []; for (let i = 0; i < D.used.length; i++) { const s = D.used[i]; if (!s) continue; const d = Math.hypot(s.x - x, s.z - z); if (d >= d0 && d <= d1 && Math.hypot(s.x - ZONE.x, s.z - ZONE.z) < ZONE.R - 10) C.push(i); }
  if (!C.length) return null; if (G.slow) G.slow(); const i = C[Math.floor(Math.random() * C.length)], s = D.used[i]; s.dyn = null; bulk(s, false); D.used[i] = null; D.hole.push(i); D.mesh.setMatrixAt(i, ZERO); D.mesh.instanceMatrix.needsUpdate = true; ZONE.free.push(s); return s;
}
export function slotAt(x, z) { let b = null, bd = 2.5; for (const s of slotsNear(x, z, 4)) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; b = s; } } return b; }
// el parking grande: el aparcamiento en batería con más plazas a una distancia razonable de casa (ni al lado ni en la otra punta)
export function findBig(x, z) {
  let best = null; const P3 = PK.slots.filter(s => s.ty === 3 || s.ty === 2);
  for (const pass of [[330, 950], [290, 1500], [0, 9999]]) { for (const s of P3) { const d = Math.hypot(s.x - x, s.z - z); if (d < pass[0] || d > pass[1]) continue; if (s._n === undefined) { let n = 0; for (const q of slotsNear(s.x, s.z, 42)) if (q.ty === s.ty) n++; s._n = n; } const sc = s._n - d / 60; if (!best || sc > best[0]) best = [sc, s]; } if (best && best[1]._n >= 14) break; }
  if (!best) return null;
  // el recinto entero: desde el grupo elegido se van sumando las plazas en batería o en diagonal que quedan pegadas (un mismo aparcamiento no se parte en dos)
  const c = best[1], seed = slotsNear(c.x, c.z, 60).filter(q => q.ty === c.ty), all = slotsNear(c.x, c.z, 175).filter(q => q.ty > 1), inS = new Set(seed), st = seed.slice();
  while (st.length) { const p = st.pop(); for (const q of all) if (!inS.has(q) && Math.hypot(q.x - p.x, q.z - p.z) < 11) { inS.add(q); st.push(q); } }
  const L = Array.from(inS); let sx = 0, sz = 0; L.forEach(q => { sx += q.x; sz += q.z; }); const bx = sx / L.length, bz = sz / L.length; let r = 30; L.forEach(q => { r = Math.max(r, Math.hypot(q.x - bx, q.z - bz) + 6); });
  return { x: bx, z: bz, r, n: L.length, free: L.filter(q => !q.occ).length };
}
// un vecino se cuela en el hueco delante de tus narices
export function stealSlot(s) { const i = D.hole.length ? D.hole.pop() : D.used.length < D.cap ? D.used.length : -1; if (i < 0 || taken(s)) { if (i >= 0 && i < D.used.length && !D.used[i]) D.hole.push(i); return false; } setDyn(s, i, PCOL[Math.floor(Math.random() * PCOL.length)]); D.mesh.instanceMatrix.needsUpdate = true; if (D.mesh.instanceColor) D.mesh.instanceColor.needsUpdate = true; ZONE.free = ZONE.free.filter(f => f !== s); return true; }
const angMod = (a, b, m) => { let d = Math.abs(a - b) % m; if (d > m / 2) d = m - d; return d; };
// cómo ha quedado el coche: { k: 'ok' en una plaza libre, 'bad' mal aparcado (why dice por qué), 'off' fuera de la calle }, y la plaza si la hay
export function parkState(car) {
  let best = null, bd = 2.4; for (const s of slotsNear(car.x, car.z, 4)) { const d = Math.hypot(s.x - car.x, s.z - car.z); if (d < bd) { bd = d; best = s; } }
  if (best && !taken(best)) { const al = angMod(car.yaw, best.yaw, Math.PI); if (al < .55 && bd < (best.ty === 1 ? 2.2 : 1.5)) return { k: 'ok', slot: best }; return { k: 'bad', slot: best, why: 'torcido, pisando dos plazas' }; }
  const rn = roadNear(car.x, car.z, 12, true);
  if (rn.r && rn.d < -.3) { const u = rn.d + rn.r.w / 2; return { k: 'bad', why: rn.r.pk && u < 2.6 + Math.max(rn.r.pkL, rn.r.pkR) ? 'en doble fila' : 'en mitad de la calle' }; }
  if (rn.r && rn.d < (rn.r.sw || 0) + .9) return { k: 'bad', why: 'subido a la acera' };
  const any = roadNear(car.x, car.z, 6, false); if (any.r && !ROAD[any.r.t][3] && any.d < .5) return { k: 'bad', why: 'en mitad de un paso de peatones' };
  return { k: 'off' };
}
// huecos libres a la vista (para el minimapa): los que quedan a menos de R metros
export function freeNear(x, z, R) { return ZONE.free.filter(s => !taken(s) && Math.hypot(s.x - x, s.z - z) < R); }
export function nearestFree(x, z) { let b = null, bd = 1e9; for (const s of ZONE.free) { if (taken(s)) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; b = s; } } return b; }
// plaza libre cualquiera cerca de un punto (para dejar el coche cuando lo trae otro)
export function anyFree(x, z, R) { let b = null, bd = 1e9; for (const s of slotsNear(x, z, R)) { if (taken(s)) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; b = s; } } return b; }
// ---------- marcas del minijuego de aparcar: se ven, pero no se tocan (no tienen bulto)
// Mientras toca aparcar: una cortina verde translúcida por el borde de la zona de casa, una valla translúcida alrededor de cada plaza que vale
// (roja y baja si está ocupada, verde y alta si está libre), baldosa y haz verdes en cada hueco libre de la zona, y el parking grande rodeado de azul con su haz.
const MK = { g: null, ring: null, fence: null, tile: null, beam: null, big: null, bigBeam: null, key: '', t: 0, n: 0, nt: 0, nf: 0 }, FCAP = 460, TCAP = 420, BCAP = 12, _w = new THREE.Color(0xffffff);
const mkMat = (hex, op, vc) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false, vertexColors: !!vc });
const geo = (pos, idx, col) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); return g; };
// cortina: una pared que sigue el suelo por un círculo, viva abajo y deshecha hacia arriba, con una raya de color a ras de suelo
function curtain(cx, cz, R, h, hex, op, seg) {
  const pos = [], col = [], idx = [], p2 = [], i2 = [];
  for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = T.on ? standY(x, z, -1e9) : 0;
    pos.push(x, y - .4, z, x, y + h * .3, z, x, y + h, z); col.push(1, 1, 1, 1, 1, 1, 1, .5, 1, 1, 1, 0); p2.push(x, y - .4, z, x, y + .45, z);
    if (k < seg) { const i = k * 3, j = k * 2; idx.push(i, i + 1, i + 3, i + 1, i + 4, i + 3, i + 1, i + 2, i + 4, i + 2, i + 5, i + 4); i2.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); } }
  const m = new THREE.Mesh(geo(pos, idx, col), mkMat(hex, op, true)); m.renderOrder = 6; m.matrixAutoUpdate = false; m.frustumCulled = false;
  const base = new THREE.Mesh(geo(p2, i2), mkMat(hex, .9)); base.renderOrder = 7; base.matrixAutoUpdate = false; base.frustumCulled = false; m.add(base); m.userData.top = base; return m;
}
// valla de una plaza: las cuatro paredes de una caja sin tapa, más vivas abajo que arriba
function fenceGeo() { const p = [], c = [], ix = []; [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].forEach(q => { p.push(q[0], 0, q[1], q[0], 1, q[1]); c.push(1, 1, 1, 1, 1, 1, 1, .1); }); for (let k = 0; k < 4; k++) { const a = k * 2, b = ((k + 1) % 4) * 2; ix.push(a, a + 1, b, a + 1, b + 1, b); } return geo(p, ix, c); }
// altura y caída del suelo en una plaza: se miran una vez (el terreno no cambia)
function slotMk(s) { if (s._mk) return s._mk; const y = T.on ? standY(s.x, s.z, -1e9) : 0; let rx = 0, rz = 0; if (T.on) { const g = slopeAt(s.x, s.z, 1.6), sn = Math.sin(s.yaw), cs = Math.cos(s.yaw); rx = -Math.atan(g[0] * sn + g[1] * cs); rz = Math.atan(g[0] * cs - g[1] * sn); } return (s._mk = [y, rx, rz]); }
function freeMk(o) { if (!o) return; if (o.userData && o.userData.top) freeMk(o.userData.top); if (o.parent) o.parent.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
// las mallas de las marcas se crean al arrancar (escondidas): así sus materiales se compilan con todo lo demás y no dan un parón al empezar a buscar sitio
function initMarks(root) {
  MK.g = new THREE.Group(); MK.g.visible = false; root.add(MK.g);
  MK.fence = new THREE.InstancedMesh(fenceGeo(), mkMat(0xffffff, .66, true), FCAP); MK.fence.renderOrder = 5;
  const tg = new THREE.PlaneGeometry(1, 1); tg.rotateX(-Math.PI / 2); MK.tile = new THREE.InstancedMesh(tg, mkMat(0x3ce06a, .45), TCAP); MK.tile.renderOrder = 5;
  const cg = new THREE.CylinderGeometry(.6, .6, 1, 10, 1, true); cg.translate(0, .5, 0); MK.beam = new THREE.InstancedMesh(cg, mkMat(0x6dff9a, .32), BCAP); MK.beam.renderOrder = 7;
  for (const m of [MK.fence, MK.tile, MK.beam]) { m.frustumCulled = false; m.count = 0; m.matrixAutoUpdate = false; m.setColorAt(0, _w); MK.g.add(m); }
  const dg = geo([0, 0, 0, 0, .01, 0, .01, 0, 0], [0, 1, 2], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]); for (const m of [new THREE.Mesh(dg, mkMat(0xffffff, .5, true)), new THREE.Mesh(dg, mkMat(0xffffff, .5))]) { m.visible = false; m.frustumCulled = false; MK.g.add(m); }      /* muestras de los dos materiales de las cortinas */
}
export function tickMarks(dt) {
  const Z = G.pzone, on = !!Z; if (!MK.g) return;
  MK.g.visible = on; if (!on) { MK.key = ''; return; }
  // la cortina de la zona y la del parking grande se hacen una vez por sitio
  const key = Math.round(Z.x) + ',' + Math.round(Z.z) + ',' + Z.R + (G.pbig ? ',' + Math.round(G.pbig.x) + ',' + Math.round(G.pbig.z) : '');
  if (key !== MK.key) { MK.key = key; freeMk(MK.ring); freeMk(MK.big); freeMk(MK.bigBeam); MK.ring = curtain(Z.x, Z.z, Z.R, 9, 0x3ce06a, .6, 240); MK.g.add(MK.ring); MK.big = MK.bigBeam = null;
    if (G.pbig) { const b = G.pbig; MK.big = curtain(b.x, b.z, b.r, 7, 0x2f8fff, .6, 96); const cg = new THREE.CylinderGeometry(2.2, 2.2, 90, 14, 1, true); MK.bigBeam = new THREE.Mesh(cg, mkMat(0x4da3ff, .24)); MK.bigBeam.position.set(b.x, (T.on ? standY(b.x, b.z, -1e9) : 0) + 45, b.z); MK.bigBeam.renderOrder = 7; MK.g.add(MK.big, MK.bigBeam); } MK.t = 0; }
  // la cortina late despacio, de noche brilla menos y, con la cámara pegada a ella, casi se apaga: al cruzarla no tiñe la pantalla entera
  const pu = .5 + .5 * Math.sin(G.now * 2.6), dim = 1 - .35 * (G.night || 0), cp = G.camera && G.camera.position, near = (c, R) => !cp ? 1 : Math.max(.1, Math.min(1, (Math.abs(Math.hypot(cp.x - c.x, cp.z - c.z) - R) - 1.5) / 16));
  { const k = near(Z, Z.R); MK.ring.material.opacity = (.5 + .16 * pu) * dim * k; MK.ring.userData.top.material.opacity = .9 * Math.max(.45, k); if (MK.big && G.pbig) { const kb = near(G.pbig, G.pbig.r); MK.big.material.opacity = .6 * dim * kb; MK.big.userData.top.material.opacity = .9 * Math.max(.45, kb); } }
  MK.beam.material.opacity = (.24 + .2 * pu) * dim; MK.fence.material.opacity = .66 * dim;
  if ((MK.t -= dt) > 0) return; MK.t = .25;
  // plazas que valen, a la vista del jugador. En la zona de casa: valla roja y baja si hay coche; verde y alta, con baldosa y haz de luz, si está libre.
  // En el parking grande sobran huecos: solo se marcan los libres, con baldosa verde y una valla bajita (muchas vallas altas juntas no dejan ver nada)
  const b = G.pbig; let n = 0, nt = 0, nf = 0;
  const fence = (s, k, h, col) => { if (n >= FCAP) return; _o.position.set(s.x, k[0] - .06, s.z); _o.rotation.set(k[1], s.yaw, k[2], 'YXZ'); _o.scale.set(s.ty === 1 ? 2.1 : 2.5, h, s.ty === 1 ? 5.2 : 4.8); _o.updateMatrix(); MK.fence.setMatrixAt(n, _o.matrix); MK.fence.setColorAt(n, _c.setHex(col)); n++; };
  const tile = (s, k) => { if (nt >= TCAP) return; _o.position.set(s.x, k[0] + .08, s.z); _o.rotation.set(k[1], s.yaw, k[2], 'YXZ'); _o.scale.set(s.ty === 1 ? 2 : 2.4, 1, s.ty === 1 ? 5 : 4.6); _o.updateMatrix(); MK.tile.setMatrixAt(nt++, _o.matrix); };
  for (const s of slotsNear(G.px, G.pz, 110)) { const free = !taken(s);
    if (Math.hypot(s.x - Z.x, s.z - Z.z) < Z.R - 2) { const k = slotMk(s); if (free) { fence(s, k, 2.3, 0x3cf07a); tile(s, k); } else fence(s, k, .85, 0xff4a3a); }
    else if (b && free && Math.hypot(s.x - b.x, s.z - b.z) < b.r) { const k = slotMk(s); fence(s, k, .4, 0x3cf07a); tile(s, k); } }
  // los huecos del día en la zona de casa llevan además un haz de luz, y se marcan aunque queden lejos
  for (const s of ZONE.free) { if (nf >= BCAP) break; if (taken(s)) continue; const k = slotMk(s); if (Math.hypot(s.x - G.px, s.z - G.pz) > 110) { fence(s, k, 2.3, 0x3cf07a); tile(s, k); } _o.position.set(s.x, k[0], s.z); _o.rotation.set(0, 0, 0); _o.scale.set(1, 46, 1); _o.updateMatrix(); MK.beam.setMatrixAt(nf++, _o.matrix); }
  _o.scale.set(1, 1, 1); _o.rotation.set(0, 0, 0); MK.fence.count = n; MK.tile.count = nt; MK.beam.count = nf; MK.n = n; MK.nt = nt; MK.nf = nf;
  MK.fence.instanceMatrix.needsUpdate = true; if (MK.fence.instanceColor) MK.fence.instanceColor.needsUpdate = true; MK.tile.instanceMatrix.needsUpdate = true; MK.beam.instanceMatrix.needsUpdate = true;
}
export const marks = () => MK;
void W;
