// spots.js: los sitios de la vida de Ethan. Son INVENTADOS: se colocan solos sobre el mapa por geometría
// (un portal cualquiera a cierta distancia de otro), no por direcciones reales.
import * as THREE from 'three';
import { Vox, mat, voxText, textWidth } from './vox.js';
import { W, collide, inWaterPoly, ROAD, roadW, addProp, roadNear } from './world.js';
import { nearestEdge } from './graph.js';
import { Ethan, npc } from './ethan.js';
import { carMesh, tires, drum, toolbox } from './props.js';
import { rng } from './util.js';
import { G } from './state.js';
import { T, standY, gY, RISE, normalAt } from './terrain.js';

export const SP = { list: [], by: {}, cand: [], npcs: [] };
const DEF = {
  home: { n: 'Casa de Ethan', icon: '🏠', col: 0x5aa2e0, f: [.44, .53] },
  kebab: { n: 'Kebab de Ali', icon: '🥙', col: 0xe0b23a },
  bar: { n: 'Bar Ekintza', icon: '🍺', col: 0xff5ca0, f: [.56, .44] },
  super: { n: 'Súper', icon: '🛒', col: 0x3ce6d2, f: [.63, .56] },
  lourdes: { n: 'Casa de Lourdes', icon: '🍳', col: 0xc88aff, f: [.36, .40] },
  lonja: { n: 'Lonja de la cuadrilla', icon: '🛋️', col: 0x9a6ad0 },
  taller: { n: 'Taller', icon: '🔧', col: 0xc8dc4a },
  gas: { n: 'Gasolinera', icon: '⛽', col: 0xff8a3c },
  itv: { n: 'ITV', icon: '📋', col: 0x9aa0a8 },
  dealer: { n: 'Autos Sádaba', icon: '🚗', col: 0xd0322e }
};
// cada sitio va fijo en su portal (inventado) para este mapa: [edificio, centro de la fachada]. Si el mapa cambia, se busca otro por geometría
const PIN = { home: [425, -108.45, 24.05], kebab: [95, 61.9, 145.75], bar: [361, 203.25, -78.15], super: [542, 348.95, 107.7], lourdes: [79, -388.85, -144.7], lonja: [204, -156.6, 300.9] };
// fachadas que dan a una calle: candidatas para portales y locales
function findFacades(M) {
  const out = [], bb = M.bbox;
  // tampoco se pisan los comercios reales del mapa: los sitios del juego van en portales sin rótulo
  const real = (M.poi || []).filter(p => p.length >= 7), busy = (x, z) => real.some(p => Math.hypot(p[4] - x, p[5] - z) < 9);
  M.bld.forEach((b, bi) => { if (b.x || (b.k && b.k !== 'res') || (b.h || 10) < 8) return; const p = b.p, n = p.length / 2; let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; } cx /= n; cz /= n;
    for (let k = 0; k < n; k++) { const j = (k + 1) % n, ax = p[k * 2], az = p[k * 2 + 1], dx = p[j * 2] - ax, dz = p[j * 2 + 1] - az, l = Math.hypot(dx, dz); if (l < 9) continue; const mx = ax + dx / 2, mz = az + dz / 2; let nx = dz / l, nz = -dx / l; if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      const qx = mx + nx * 2.4, qz = mz + nz * 2.4; if (qx < bb[0] + 25 || qx > bb[2] - 25 || qz < bb[1] + 25 || qz > bb[3] - 25) continue; /* ni portales pegados al borde del mapa */ const ne = nearestEdge(qx, qz, true, 30, 1); /* solo calles a las que el GPS sabe llegar y de las que sabe salir */ if (ne.e < 0 || ne.road.u || ne.road.t === 'motorway' || ne.road.t.indexOf('_link') > 0 || ne.d > roadW(ne.road) / 2 + 5.5 || ne.d < roadW(ne.road) / 2 + .6) continue;
      if (collide(qx, qz, 1.1).hit || collide(mx + nx * 1.2, mz + nz * 1.2, .8, true).hit || inWaterPoly(qx, qz) || busy(mx, mz)) continue; /* ¿cabe una terraza? mesas a los lados del portal, a 1,7 m de la fachada: ninguna a menos de 1 m de una calzada ni dentro de otra casa */
      const tx = -nz, tz = nx; let terr = true; for (const o of [-5.4, -3.1, 3.1, 5.4]) { const X = mx + tx * o + nx * 1.7, Z = mz + tz * o + nz * 1.7; if (roadNear(X, Z, 9, true).d < 1.9 || collide(X, Z, .95, true).hit) { terr = false; break; } }
      out.push({ bi, mx, mz, nx, nz, len: l, terr, road: ne.road, h: b.h || 10, far: ne.d + roadW(ne.road) / 2 + 1 /* hasta el bordillo de enfrente */ }); } });
  return out;
}
const d2 = (a, x, z) => Math.hypot(a.mx - x, a.mz - z);
function pick(cands, used, score, id) { const pn = PIN[id]; if (pn) { const c = cands.find(q => q.bi === pn[0] && Math.abs(q.mx - pn[1]) < .3 && Math.abs(q.mz - pn[2]) < .3); if (c && !used.has(c.bi)) { used.add(c.bi); return c; } }
  let best = null, bs = 1e18; for (const c of cands) { if (used.has(c.bi)) continue; const s = score(c); if (s < bs) { bs = s; best = c; } } if (best) used.add(best.bi); return best; }

export function placeSpots(scene, M) {
  const C = SP.cand = findFacades(M), bb = M.bbox, used = new Set(), at = f => [bb[0] + (bb[2] - bb[0]) * f[0], bb[1] + (bb[3] - bb[1]) * f[1]];
  const far = (c, ...others) => others.some(o => o && d2(c, o.mx, o.mz) < 170) ? 1e9 : 0;
  const t = k => at(DEF[k].f), home = pick(C, used, c => d2(c, ...t('home')), 'home');
  const noT = c => c.terr ? 0 : 1e6 /* el kebab y el bar sacan mesas a la acera: solo donde caben */, kebab = home && pick(C, used, c => Math.abs(d2(c, home.mx, home.mz) - 210) + (c.road === home.road ? 400 : 0) + noT(c), 'kebab');
  const bar = pick(C, used, c => d2(c, ...t('bar')) + far(c, home, kebab) + noT(c), 'bar'), sup = pick(C, used, c => d2(c, ...t('super')) + far(c, home, kebab, bar), 'super'), lou = pick(C, used, c => d2(c, ...t('lourdes')) + far(c, home, kebab, bar, sup), 'lourdes'), lon = home && pick(C, used, c => Math.abs(d2(c, home.mx, home.mz) - 280) + far(c, home, kebab, bar, sup, lou) + (c.road === home.road ? 400 : 0), 'lonja');
  const add = (id, x, z, yaw, extra) => { const s = Object.assign({ id, x, z, yaw }, DEF[id], extra || {}); SP.list.push(s); SP.by[id] = s; return s; };
  [['home', home], ['kebab', kebab], ['bar', bar], ['super', sup], ['lourdes', lou], ['lonja', lon]].forEach(q => { const c = q[1]; if (!c) return; const s = add(q[0], c.mx + c.nx * 2.3, c.mz + c.nz * 2.3, Math.atan2(c.nx, c.nz), { wx: c.mx, wz: c.mz, road: c.road, far: c.far }); decorate(scene, s); });
  const A = W.anchors; if (A.taller) { ['taller', 'gas', 'itv', 'dealer'].forEach(id => { const a = A[id]; decorate(scene, add(id, a.x, a.z, a.yaw, { wx: a.x - Math.sin(a.yaw) * a.back, wz: a.z - Math.cos(a.yaw) * a.back, drive: id !== 'dealer' })); }); }
  SP.list.forEach(s => marker(scene, s));
}
function sign(v, text, y, col, bg, px) { const w = Math.max(2.2, textWidth(text) * px + .5); v.box(0, y, .12, w, 7 * px + .3, .16, bg); voxText(v, text, 0, y + .15, .21, px, .05, col, { center: true }); return w; }
function table(v, x, z, col) { v.cyl(x, 0, z, .08, .72, 0x3a3f46); v.cyl(x, .72, z, .42, .05, col); [[.62, 0], [-.62, 0]].forEach(o => { v.box(x + o[0], 0, z + o[1], .36, .44, .36, 0x8a5a34); v.box(x + o[0] + Math.sign(o[0]) * .16, .44, z + o[1], .05, .42, .36, 0x8a5a34); }); }
function person(scene, s, kind, lx, lz, yaw, anim, opts) {
  const e = opts ? new Ethan(Object.assign({ npc: true, mood: 3 }, opts)) : npc(kind), sy = Math.sin(s.yaw), cy = Math.cos(s.yaw); { const X = s.wx + cy * lx + sy * lz, Z = s.wz - sy * lx + cy * lz; e.root.position.set(X, standY(X, Z), Z); } e.root.rotation.y = s.yaw + (yaw || 0); e.play(anim || 'idle'); scene.add(e.root);
  const o = { e, x: e.root.position.x, z: e.root.position.z, spot: s.id, name: kind }; SP.npcs.push(o); addProp(o.x, o.z, .35, 'npc'); return o;
}
// decorado de cada sitio, en su propio sistema: origen en la fachada, +z hacia la calle
function decorate(scene, s) {
  const v = new Vox(), g = new Vox(), id = s.id, r = rng(id.length * 31 + 7); let props = [];
  if (id === 'home' || id === 'lourdes') { v.box(0, 0, .1, 1.5, 2.5, .2, 0x5a4634); v.box(0, .1, .16, 1.1, 2.1, .1, id === 'home' ? 0x2a5bb8 : 0x8a4a8a); v.box(.38, 1.1, .23, .08, .08, .06, 0xe0b23a); v.box(0, 2.5, .5, 2.2, .12, 1.0, 0x6a6e74); v.box(1.25, 1.1, .18, .4, .5, .14, 0xd8d4c8); sign(v, id === 'home' ? 'CASA' : 'LOURDES', 2.75, 0xf2efe6, 0x26303c, .07); }
  else if (id === 'lonja') { v.bx(-1.5, 0, .02, 1.5, 2.7, .12, 0x3a3f46); for (let y = 1.05; y < 2.6; y += .18) v.bx(-1.48, y, .12, 1.48, y + .1, .17, 0x8d9399); v.bx(-1.48, 0, .05, 1.48, 1.05, .08, 0x14161a); v.bx(-1.55, .95, .1, 1.55, 1.07, .22, 0x6a6e74);      // persiana medio subida y dentro, a oscuras
    sign(v, 'LONJA', 3.0, 0xf2efe6, 0x3a2a5a, .09); v.box(-.9, 1.6, .2, .5, .5, .03, 0xff5ca0); v.box(.8, 1.9, .2, .7, .35, .03, 0x3ce6d2);      // pegatinas en la persiana
    [[-2.3, 1.1], [2.2, 1.2]].forEach(c => { v.box(c[0], 0, c[1], .46, .42, .46, 0xf2efe6); v.box(c[0], .42, c[1] - .2, .46, .45, .06, 0xf2efe6); }); v.box(2.9, 0, .7, .5, .32, .36, 0xe0b23a); props = [[-2.3, 1.1, .4], [2.2, 1.2, .4], [2.9, .7, .35]];
    person(scene, s, 'curro', -2.3, 1.6, Math.PI * .9, 'idle', { look: { tee: 0x2a2a2a, tee2: 0x1a1a1a, sleeve: 0x2a2a2a, shorts: 0x34425e, shorts2: 0x46587a, hair: 0x2a1e14, hair2: 0x4a3a2a, skin: 0xe0b08a, skin2: 0xc8946e }, hair: 'short', whiteTeeth: true }); }
  else if (id === 'kebab') { v.box(0, 0, .1, 1.3, 2.3, .18, 0x26262c); v.box(-2.4, .9, .1, 2.6, 1.4, .14, 0x2c3a4a); const w = sign(v, 'KEBAB DE ALI', 2.9, 0xffe26a, 0xc4302a, .09); v.bx(-w / 2, 2.55, .1, w / 2, 2.7, 1.5, 0xc4302a); v.bx(-w / 2, 2.5, 1.3, w / 2, 2.6, 1.5, 0xffe26a); v.cyl(-2.4, 1.0, .5, .22, 1.0, 0x9a5a34); v.cyl(-2.4, .9, .5, .3, .1, 0x777c84);
    table(v, 3.2, 1.6, 0xd8d4c8); table(v, 5.4, 1.6, 0xd8d4c8); props = [[3.2, 1.6, .9], [5.4, 1.6, .9]];
    person(scene, s, 'ali', -1.3, 1.0, 0, 'idle', { look: { tee: 0xf2efe6, tee2: 0xd9d6cc, sleeve: 0xf2efe6, shorts: 0x26262c, shorts2: 0x3a3a44, hair: 0x1c1a18, hair2: 0x3a3632, skin: 0xb9855c, skin2: 0x9c6c46 }, hair: 'short', whiteTeeth: true }); }
  else if (id === 'bar') { v.box(0, 0, .1, 1.4, 2.3, .18, 0x3a2a20); v.box(2.6, .9, .1, 2.6, 1.4, .14, 0x2c3a4a); const w = sign(v, 'BAR EKINTZA', 2.9, 0xff5ca0, 0x16121e, .09); v.bx(-w / 2, 2.55, .1, w / 2, 2.7, 1.4, 0x2e6b4a); g.bx(-w / 2, 3.72, .2, w / 2, 3.78, .26, 0x3ce6d2);
    table(v, -3.0, 1.7, 0x8a5a34); table(v, -5.2, 1.7, 0x8a5a34); v.cyl(1.9, 0, 1.3, .36, .95, 0x6a4a2a); props = [[-3.0, 1.7, .9], [-5.2, 1.7, .9], [1.9, 1.3, .4]];
    person(scene, s, 'sadaba', -3.0, 2.5, Math.PI, 'lean'); person(scene, s, 'luisillo', 1.9, 2.0, Math.PI, 'idle'); }
  else if (id === 'super') { v.box(0, 0, .1, 2.2, 2.4, .16, 0x2c3a4a); v.box(0, 0, .14, .06, 2.4, .14, 0xd8d4c8); const w = sign(v, 'SUPER', 2.9, 0xf2efe6, 0x2a7ab8, .12); v.bx(-w / 2 - .6, 2.55, .1, w / 2 + .6, 2.68, 1.2, 0x2a7ab8); [[-2.6, 0xd0322e], [-3.5, 0xe0b23a], [2.6, 0x5fa052]].forEach(c => { v.box(c[0], 0, .7, .8, .5, .6, 0x8a5a34); v.box(c[0], .5, .7, .7, .16, .5, c[1]); }); props = [[-3.05, .7, .8], [2.6, .7, .5]]; }
  else if (id === 'taller') { v.bx(-4.2, 0, .0, 4.2, 4.2, .16, 0x1a1c20); v.bx(-4.5, 4.2, 0, 4.5, 4.6, .3, 0xc8dc4a); sign(v, 'TALLER', 5.0, 0x1a1c20, 0xc8dc4a, .16); v.bx(-4.6, 0, 0, -4.2, 4.4, .4, 0x6a6e74); v.bx(4.2, 0, 0, 4.6, 4.4, .4, 0x6a6e74);
    v.at(6.4, 0, 1.2); tires(v, 0, 0, 4); v.at(7.4, 0, 1.0); drum(v, 0, 0, 0xd0322e); v.at(-6.2, 0, 1.0); drum(v, 0, 0, 0x2a5bb8); v.at(-7.1, 0, 1.3); toolbox(v, 0, 0, 0, 0xd0322e); v.at(); props = [[6.4, 1.2, .5], [7.4, 1.0, .4], [-6.2, 1.0, .4], [-7.1, 1.3, .4]];
    person(scene, s, 'manolo', -3.2, 1.6, 0, 'idle'); }
  else if (id === 'gas') { const X = 7.5, Z0 = 3, Z1 = 11.5; [[-X, Z0], [X, Z0], [-X, Z1], [X, Z1]].forEach(p => v.box(p[0], 0, p[1], .4, 4.8, .4, 0xd8d4c8)); v.bx(-X - 1.2, 4.8, Z0 - 1.2, X + 1.2, 5.5, Z1 + 1.2, 0xf2efe6); v.bx(-X - 1.25, 4.9, Z0 - 1.25, X + 1.25, 5.25, Z1 + 1.25, 0xff8a3c);
    [-3.2, 3.2].forEach(x => { v.box(x, 0, 7.2, 1.1, .22, 3.2, 0xb9bcb4); v.box(x, .22, 7.2, .7, 1.5, .5, 0xd0322e); v.box(x, 1.0, 7.46, .5, .4, .04, 0x26262c); v.box(x, 1.72, 7.2, .8, .3, .6, 0xf2efe6); props.push([x, 7.2, .7]); });
    v.box(0, 0, .1, 1.6, 2.3, .16, 0x2c3a4a); sign(v, 'GASOLINERA', 3.2, 0xf2efe6, 0xff8a3c, .1); v.box(13, 0, 1.5, .5, 6, .5, 0x6a6e74); v.box(13, 4.2, 1.5, 2.2, 2.4, .4, 0xff8a3c); voxText(v, '1.59', 13, 5.0, 1.72, .1, .04, 0xf2efe6, { center: true }); props.push([13, 1.5, .5]); }
  else if (id === 'itv') { v.bx(-3.4, 0, 0, 3.4, 4.0, .16, 0x1a1c20); sign(v, 'ITV', 4.8, 0xf2efe6, 0x2a5bb8, .2); v.bx(-3.7, 0, 0, -3.4, 4.3, .4, 0xe0b23a); v.bx(3.4, 0, 0, 3.7, 4.3, .4, 0xe0b23a); v.box(5.2, 0, 2.4, .2, 1.1, .2, 0x55585e); v.bx(1.2, 1.0, 2.34, 5.3, 1.12, 2.46, 0xd0322e); props = [[5.2, 2.4, .25]]; person(scene, s, 'curro', 4.4, 1.2, 0, 'idle'); }
  else if (id === 'dealer') { v.box(0, 0, .1, 6, 3.4, .14, 0x2c3a4a); const w = sign(v, 'AUTOS SADABA', 4.2, 0xffe26a, 0x6b4a8a, .12); [-9, 9].forEach(x => { v.box(x, 0, 1.2, .12, 6, .12, 0xd8d4c8); v.bx(x, 4.6, 1.16, x + 1.8, 5.8, 1.24, x < 0 ? 0xd0322e : 0xe0b23a); props.push([x, 1.2, .2]); }); }
  const grp = new THREE.Group(); grp.add(v.mesh('lit', 3)); if (g.nv) grp.add(g.mesh('glow', 0)); { const sy0 = Math.sin(s.yaw), cy0 = Math.cos(s.yaw); s.gy = T.on ? gY(s.wx + sy0 * .7, s.wz + cy0 * .7) + RISE : 0; } grp.position.set(s.wx, s.gy, s.wz); grp.rotation.y = s.yaw; scene.add(grp); s.grp = grp;
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw), toW = (lx, lz) => [s.wx + cy * lx + sy * lz, s.wz - sy * lx + cy * lz]; s.toW = toW;
  props.forEach(p => { const w = toW(p[0], p[1]); addProp(w[0], w[1], p[2], 'deco'); });
  if (id === 'dealer') { s.show = []; [['golf', -4.5], ['bmw', 4.5]].forEach(c => { const w = toW(c[1], 4.2), m = carMesh(c[0] === 'golf' ? 0xd0322e : 0x1c1c22, c[0] === 'golf' ? 'hatch' : 'sport'); m.position.set(w[0], standY(w[0], w[1]), w[1]); m.rotation.y = s.yaw + Math.PI / 2 + .5; scene.add(m); addProp(w[0], w[1], 1.5, 'deco'); }); }
  if (id === 'taller') { const w = toW(6.6, 3.2), m = carMesh(0x2a5bb8, 'hatch', { hoodOpen: true }); m.position.set(w[0], standY(w[0], w[1]), w[1]); m.rotation.y = s.yaw; scene.add(m); [[7.5, 3.2], [9.6, 3.2]].forEach(c => { const q = toW(c[0], c[1]); addProp(q[0], q[1], 1.0, 'deco'); }); const e = toW(6.0, 3.2), n = toW(7.0, 3.2); s.workX = e[0]; s.workZ = e[1]; s.workYaw = s.yaw + Math.PI / 2; s.fxX = n[0]; s.fxZ = n[1]; }
  if (id === 'gas') { const w = toW(0, 7.2); s.x = w[0]; s.z = w[1]; const d = toW(0, 2.3); s.shopX = d[0]; s.shopZ = d[1]; }
}
// aro en el suelo y haz de luz
function marker(scene, s) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(s.drive ? 2.0 : .95, s.drive ? 2.35 : 1.2, 28), new THREE.MeshBasicMaterial({ color: s.col, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false })); s.y = standY(s.x, s.z); if (T.on) { const n = normalAt(s.x, s.z, [0, 0, 0]); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2])); } else ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, s.y + .13, s.z); scene.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 26, 10, 1, true), new THREE.MeshBasicMaterial({ color: s.col, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.set(s.x, s.y + 17, s.z); scene.add(beam); s.ring = ring; s.beam = beam;
}
export function updateSpots(dt, t, px, pz) {
  for (const s of SP.list) { const d = Math.hypot(s.x - px, s.z - pz), on = d < 140; s.ring.visible = s.beam.visible = on; s.dist = d; if (on) { const k = 1 + Math.sin(t * 3 + s.x) * .06; s.ring.scale.set(k, k, 1); s.beam.visible = d > 9; s.beam.material.opacity = .26 + Math.sin(t * 2 + s.z) * .06; } }
  for (const n of SP.npcs) { const on = Math.hypot(n.x - px, n.z - pz) < 70; n.e.root.visible = on; if (on) n.e.update(dt); }
}
export function spotAt(x, z, inCar) { let best = null, bd = 1e9; for (const s of SP.list) { const d = Math.hypot(s.x - x, s.z - z), r = s.drive ? 3.4 : inCar ? 0 : 1.9; if (d < r && d < bd) { bd = d; best = s; } } return best; }
export const nearSpot = (x, z, r) => SP.list.some(s => Math.hypot(s.x - x, s.z - z) < r || Math.hypot(s.wx - x, s.wz - z) < r);
