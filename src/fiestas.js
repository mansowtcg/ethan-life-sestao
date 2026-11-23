// fiestas.js: los Sampedros, las fiestas de San Pedro de Sestao (del 19 al 29 de junio). El calendario del juego empieza el lunes
// 1 de junio de 2026, que también fue lunes, así que caen en los días 19 a 29: escenario en la plaza del Kasko con conciertos por la
// noche y txosnas en Las Canteras, con guirnaldas de bombillas. Lo que se puede hacer allí está en life.js (enterFiesta).
import * as THREE from 'three';
import { Vox, voxText } from './vox.js';
import { W, inBuilding, inPoly, addProp } from './world.js';
import { gY } from './terrain.js';
import { G } from './state.js';
import { note } from './day.js';

export const FE = { stage: null, tx: [], grp: null, crowd: null, glow: null, built: false, kasko: null, canteras: null };
export const fiestas = S => { const d = (S.day - 1) % 360 + 1; return d >= 19 && d <= 29; };
export const concertNow = S => fiestas(S) && (S.min >= 1320 || S.min < 90);
export const txosnasNow = S => fiestas(S) && (S.min >= 1140 || S.min < 210 || ((S.day - 1) % 7 >= 5 && S.min >= 720));

// eje largo de un polígono (para alinear el escenario y la fila de txosnas)
function axis(p) { const n = p.length / 2; let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += p[k * 2]; cz += p[k * 2 + 1]; } cx /= n; cz /= n; let a = 0, b = 0, c = 0; for (let k = 0; k < n; k++) { const dx = p[k * 2] - cx, dz = p[k * 2 + 1] - cz; a += dx * dx; b += dz * dz; c += dx * dz; }
  const t = .5 * Math.atan2(2 * c, a - b), ux = Math.cos(t), uz = Math.sin(t); let lo = 1e9, hi = -1e9; for (let k = 0; k < n; k++) { const s = (p[k * 2] - cx) * ux + (p[k * 2 + 1] - cz) * uz; lo = Math.min(lo, s); hi = Math.max(hi, s); } return { cx, cz, ux, uz, lo, hi }; }
const fits = (P, pts) => pts.every(q => inPoly(P, q[0], q[1]) && !inBuilding(q[0], q[1]));

export function buildFiestas(M, root) {
  const kasko = (M.green || []).find(g => g.k === 'plaza' && /kasko/i.test(g.n || '')), cant = (M.green || []).filter(g => /canteras/i.test(g.n || '') && g.k === 'lot').map(g => [g, axis(g.p)]).sort((a, b) => (b[1].hi - b[1].lo) - (a[1].hi - a[1].lo)).map(q => q[0])[0];      // el parking de Las Canteras, que es donde se ponen
  if (!kasko) return; const grp = FE.grp = new THREE.Group(); grp.visible = false; root.add(grp); const v = new Vox(), gl = new Vox();
  // ---- escenario: en un extremo de la plaza, mirando al centro
  const A = axis(kasko.p); let st = null;
  for (const sg of [1, -1]) { for (let s = (sg > 0 ? A.hi : -A.lo) - 4; s > 3 && !st; s -= .8) { const x = A.cx + A.ux * s * sg, z = A.cz + A.uz * s * sg, fx = -A.ux * sg, fz = -A.uz * sg, px = -fz, pz = fx;
      if (fits(kasko.p, [[x + px * 5.2 + fx * 3.6, z + pz * 5.2 + fz * 3.6], [x - px * 5.2 + fx * 3.6, z - pz * 5.2 + fz * 3.6], [x + px * 5.2 - fx * 3.6, z + pz * 5.2 - fz * 3.6], [x - px * 5.2 - fx * 3.6, z - pz * 5.2 - fz * 3.6], [x + fx * 9, z + fz * 9]])) st = { x, z, fx, fz }; } if (st) break; }
  if (!st) st = { x: A.cx, z: A.cz, fx: -A.ux, fz: -A.uz };
  const sy = gY(st.x, st.z), ry = Math.atan2(st.fx, st.fz); FE.stage = { x: st.x + st.fx * 6.5, z: st.z + st.fz * 6.5, sx: st.x, sz: st.z, fx: st.fx, fz: st.fz }; window.ELS_FE = FE;
  { const s = new Vox(), g = new Vox(); s.bx(-5, 0, -3.5, 5, 1.3, 3.5, 0x2c3036, { top: 0x3a3f46 }); s.bx(-5, 0, 3.4, 5, 1.3, 3.55, 0x1a1c20); s.bx(-5, 1.3, -3.5, 5, 7.2, -3.3, 0x14161a);
    [[-4.9, -3.4], [4.9, -3.4], [-4.9, 3.4], [4.9, 3.4]].forEach(c => s.box(c[0], 0, c[1], .32, 8.2, .32, 0xb4bac0)); s.bx(-5.1, 7.9, -3.6, 5.1, 8.3, -3.2, 0xb4bac0); s.bx(-5.1, 7.9, 3.2, 5.1, 8.3, 3.6, 0xb4bac0); s.bx(-5.1, 7.9, -3.6, -4.7, 8.3, 3.6, 0xb4bac0); s.bx(4.7, 7.9, -3.6, 5.1, 8.3, 3.6, 0xb4bac0);
    [-1, 1].forEach(sd => { s.box(sd * 6.3, 0, 2.6, 1.3, 2.4, 1.2, 0x1a1c20); s.box(sd * 6.3, 2.4, 2.6, 1.1, 1.6, 1.0, 0x23262b); });
    s.bx(-4.4, 5.2, -3.25, 4.4, 6.9, -3.15, 0xd0322e); voxText(s, 'SAN PEDRO JAIAK', 0, 5.65, -3.1, .1, .04, 0xf2efe6, { center: true });
    for (let k = 0; k < 7; k++) { const x = -4.2 + k * 1.4; s.box(x, 7.5, 3.4, .3, .4, .3, 0x1a1c20); g.box(x, 7.45, 3.56, .22, .22, .06, [0xff5ca0, 0x3ce6d2, 0xffe26a, 0xc8dc4a][k % 4]); }
    const m = s.mesh('lit', 3); m.position.set(st.x, sy, st.z); m.rotation.y = ry; grp.add(m); const mg = g.mesh('glow', 0); mg.position.copy(m.position); mg.rotation.y = ry; grp.add(mg); FE.lamps = mg;
    for (let a = -4.5; a <= 4.5; a += 1.5) for (const b of [-3.2, 0, 3.2]) addProp(st.x - st.fz * a + st.fx * b, st.z + st.fx * a + st.fz * b, 1.1, 'deco');      // no se sube uno al escenario
  }
  // ---- guirnaldas de bombillas desde el escenario hacia el otro lado de la plaza
  const bulbs = [], C4 = [0xffe26a, 0xff5ca0, 0x3ce6d2, 0xc8dc4a, 0xff8a3c];
  const garland = (x0, z0, y0, x1, z1, y1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.floor(L / 1.3)); for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * Math.min(2.2, L * .08); bulbs.push([x, y, z, C4[i % C4.length]]); } };
  { const ex = st.x + st.fx * 26, ez = st.z + st.fz * 26; let tx = ex, tz = ez; for (let k = 26; k > 8; k -= 1) { const x = st.x + st.fx * k, z = st.z + st.fz * k; if (inPoly(kasko.p, x, z)) { tx = x; tz = z; break; } }
    const px = -st.fz, pz = st.fx, top = sy + 7.9, endY = gY(tx, tz) + 5.6; [-4.8, -1.6, 1.6, 4.8].forEach(o => garland(st.x + px * o + st.fx * 3.4, st.z + pz * o + st.fz * 3.4, top, tx + px * o * 1.6, tz + pz * o * 1.6, endY));
    [-1, 1].forEach(sd => { const x = tx + px * sd * 7.7, z = tz + pz * sd * 7.7; v.box(x, gY(x, z), z, .14, 5.8, .14, 0x3a3f46); addProp(x, z, .15, 'deco'); }); }
  // ---- txosnas en Las Canteras: una fila de casetas con toldo y su barra
  if (cant) { const B = axis(cant.p), n = 6, colors = [0xd0322e, 0x2e6b4a, 0xe0b23a, 0x2a5bb8, 0xc85a8a, 0xff8a3c]; let placed = 0;
    for (let s0 = -(n - 1) * 2.6; s0 <= (n - 1) * 2.6 && placed < n; s0 += 5.2) for (const off of [0, 4, -4, 8, -8]) { const x = B.cx + B.ux * s0 - B.uz * off, z = B.cz + B.uz * s0 + B.ux * off, fx = -B.uz, fz = B.ux, px = B.ux, pz = B.uz;
      if (!fits(cant.p, [[x + px * 2 + fx * 2, z + pz * 2 + fz * 2], [x - px * 2 + fx * 2, z - pz * 2 + fz * 2], [x + px * 2 - fx * 1.6, z + pz * 2 - fz * 1.6], [x - px * 2 - fx * 1.6, z - pz * 2 - fz * 1.6]])) continue;
      const y = gY(x, z), col = colors[placed % colors.length], t = new Vox(), tg = new Vox(); t.bx(-2, 0, -1.5, 2, 2.6, -1.35, 0xd8d4c8); t.bx(-2, 0, -1.5, -1.85, 2.6, 1.2, 0xd8d4c8); t.bx(1.85, 0, -1.5, 2, 2.6, 1.2, 0xd8d4c8); t.bx(-1.9, 0, .7, 1.9, 1.08, 1.15, 0x8a5a34, { top: 0xb08a5a });
      for (let k = 0; k < 6; k++) t.bx(-2.15 + k * .72, 2.6, -1.6, -2.15 + (k + 1) * .72, 2.85 - (k % 2) * .08, 1.9, k % 2 ? 0xf2efe6 : col); voxText(t, 'TXOSNA', 0, 2.95, 1.25, .07, .03, 0xf2efe6, { center: true }); t.bx(-1.2, 2.9, 1.2, 1.2, 3.55, 1.26, col);
      t.box(-1.2, 1.08, .9, .3, .5, .3, 0x6a2a3a); t.box(-.6, 1.08, .9, .22, .4, .22, 0x3a8a5c); for (let k = 0; k < 5; k++) tg.box(-1.7 + k * .85, 2.5, 1.85, .14, .14, .14, C4[k]);
      const m = t.mesh('lit', 3), mg = tg.mesh('glow', 0), ry2 = Math.atan2(fx, fz); m.position.set(x, y, z); m.rotation.y = ry2; mg.position.copy(m.position); mg.rotation.y = ry2; grp.add(m); grp.add(mg);
      FE.tx.push({ x: x + fx * 2.2, z: z + fz * 2.2, i: placed }); addProp(x, z, 1.6, 'deco'); (W.noPark || (W.noPark = [])).push([x, z, 4.6]); placed++; break; }
    FE.canteras = { x: B.cx, z: B.cz }; }
  // las bombillas, en una sola malla: brillan de noche
  if (bulbs.length) { const bv = new Vox(); bulbs.forEach(b => bv.box(b[0], b[1] - .07, b[2], .14, .14, .14, b[3])); const bm = bv.mesh('glow', 0); grp.add(bm); }
  if (v.nv) grp.add(v.mesh('lit', 3));
  // ---- público delante del escenario: figuras sencillas que botan con la música (solo durante el concierto)
  { const cv = new Vox(); cv.box(0, 0, 0, .34, .85, .22, 0x26262c); cv.box(0, .85, 0, .44, .62, .26, 0xffffff); cv.box(0, 1.47, 0, .28, .28, .28, 0xd8a47c); const list = [], r = (k => () => { k = (k * 16807) % 2147483647; return k / 2147483647; })(7), TEE = [0xd0322e, 0x2a5bb8, 0xf2efe6, 0x26262c, 0x3a8a5c, 0xe0b23a, 0xc85a8a];
    for (let i = 0; i < 46; i++) { const a = (r() - .5) * 9, b = 3 + r() * 12, x = st.x + st.fx * (3.6 + b) - st.fz * a, z = st.z + st.fz * (3.6 + b) + st.fx * a; if (!inPoly(kasko.p, x, z) || inBuilding(x, z)) continue; list.push([x, gY(x, z), z, ry + Math.PI + (r() - .5) * .6, TEE[Math.floor(r() * TEE.length)], r() * 6.28]); }
    const geo = cv.geometry(), im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), list.length), d = new THREE.Object3D(), c = new THREE.Color();
    list.forEach((q, i) => { d.position.set(q[0], q[1], q[2]); d.rotation.set(0, q[3], 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setHex(q[4])); }); im.visible = false; im.frustumCulled = false; grp.add(im); FE.crowd = { im, list, d }; }
  FE.built = true; FE.kasko = { x: A.cx, z: A.cz };
}

let acc = 0;
export function tickFiestas(dt, t) {
  if (!FE.built || !G.S) return; const S = G.S; acc += dt; if (acc > .5) { acc = 0; FE.grp.visible = fiestas(S);
    if (FE.grp.visible && S.daily && !S.daily.fiNote && S.min >= 420 && !G.title) { S.daily.fiNote = 1; const d = (S.day - 1) % 360 + 1; note('🎉', d === 19 ? '¡Empiezan los Sampedros!' : 'Sampedros: día ' + (d - 18) + ' de 11', 'Fiestas de San Pedro hasta el 29: por la noche, concierto en la plaza del Kasko (22:00) y txosnas en Las Canteras.', d !== 19); } FE.conc = concertNow(S); FE.txon = txosnasNow(S); if (FE.crowd) FE.crowd.im.visible = FE.grp.visible && FE.conc; }
  // el público bota al ritmo (unos 2 saltos por segundo) mientras dura el concierto
  const C = FE.crowd; if (C && C.im.visible && Math.hypot(G.px - FE.stage.sx, G.pz - FE.stage.sz) < 160) { const d = C.d; C.list.forEach((q, i) => { d.position.set(q[0], q[1] + Math.max(0, Math.sin(t * 7.2 + q[5])) * .22, q[2]); d.rotation.set(0, q[3], 0); d.updateMatrix(); C.im.setMatrixAt(i, d.matrix); }); C.im.instanceMatrix.needsUpdate = true; }
}
// sitio de las fiestas donde está Ethan: delante del escenario (en hora de concierto) o en la barra de una txosna (cuando abren)
export function fiestaAt(x, z) {
  if (!FE.built || !G.S || !fiestas(G.S)) return null; const S = G.S;
  if (FE.stage && Math.hypot(x - FE.stage.x, z - FE.stage.z) < 7) return { k: 'stage', on: concertNow(S) };
  for (const q of FE.tx) if (Math.hypot(x - q.x, z - q.z) < 2.4) return { k: 'txosna', i: q.i, on: txosnasNow(S) };
  return null;
}
