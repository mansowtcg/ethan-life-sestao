// trains.js: el tren que pasa por la vía del mapa. Para en las estaciones, se va del mapa y vuelve al rato.
import * as THREE from 'three';
import { Vox } from './vox.js';
import { ST } from './street.js';
import { T, gY, mY } from './terrain.js';
import { W, deckH } from './world.js';

export const TRN = { list: [], near: 1e9, v: 0 };
const CAR = 20.6, NCAR = 3, VMAX = 17, ACC = .9;
function body(head) {
  const v = new Vox(), Wd = 2.9, Lh = CAR / 2 - .25, wh = 0xf2efe6, red = 0xc4302a, gl = 0x26303c;
  v.bx(-Wd / 2, .55, -Lh, Wd / 2, 1.5, Lh, wh); v.bx(-Wd / 2, 1.5, -Lh, Wd / 2, 1.85, Lh, red); v.bx(-Wd / 2, 1.85, -Lh, Wd / 2, 3.0, Lh, wh, { side: gl }); v.bx(-Wd / 2, 3.0, -Lh, Wd / 2, 3.55, Lh, wh); v.bx(-Wd / 2 + .25, 3.55, -Lh + .3, Wd / 2 - .25, 3.8, Lh - .3, 0x8d9399);
  // puertas y montantes sobre la banda de ventanas
  for (let i = -3; i <= 3; i++) v.bx(-Wd / 2 - .02, 1.85, i * 2.9 - .22, Wd / 2 + .02, 3.0, i * 2.9 + .22, wh); [-5.8, 5.8].forEach(z => v.bx(-Wd / 2 - .03, .7, z - .75, Wd / 2 + .03, 3.0, z + .75, red, { side: red }));
  [-6.4, 6.4].forEach(z => { v.bx(-1.05, .12, z - 1.4, 1.05, .6, z + 1.4, 0x2c3036); [-.9, .9].forEach(d => v.bx(-1.2, 0, z + d - .42, 1.2, .84, z + d + .42, 0x1b1b20)); });
  if (head) { v.bx(-Wd / 2 + .05, .55, Lh, Wd / 2 - .05, 3.4, Lh + .35, red); v.bx(-Wd / 2 + .3, 2.0, Lh + .3, Wd / 2 - .3, 3.0, Lh + .4, gl); v.bx(-1.1, .95, Lh + .33, -.7, 1.2, Lh + .42, 0xfff2b0); v.bx(.7, .95, Lh + .33, 1.1, 1.2, Lh + .42, 0xfff2b0); }
  return v.geometry();
}
// perfil de la vía: sobre el suelo, por el tablero en los puentes y recto de boca a boca en los túneles
function profile(M, t) {
  const D = 4, n = Math.ceil(t.L / D) + 1, h = new Float32Array(n), tun = new Uint8Array(n), hid = new Uint8Array(n), o = {}, R = M.rail || [], RT = M.railT || [], xs = new Float32Array(n), zs = new Float32Array(n);
  const bb = R.map(p => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let k = 0; k < p.length; k += 2) { a = Math.min(a, p[k]); c = Math.max(c, p[k]); b = Math.min(b, p[k + 1]); d = Math.max(d, p[k + 1]); } return [a - 3, b - 3, c + 3, d + 3]; });
  for (let i = 0; i < n; i++) { at(t, Math.min(t.L, i * D), o); xs[i] = o.x; zs[i] = o.z; let best = 3, bi = -1;
    for (let r = 0; r < R.length; r++) { const q = bb[r]; if (o.x < q[0] || o.x > q[2] || o.z < q[1] || o.z > q[3]) continue; const p = R[r]; for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, tt = Math.max(0, Math.min(1, ((o.x - ax) * ex + (o.z - az) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(o.x - ax - ex * tt, o.z - az - ez * tt); if (d < best) { best = d; bi = r; } } }
    const f = bi < 0 ? 0 : RT[bi] || 0; if (f === 2) tun[i] = 1; else h[i] = f === 1 && W.railDeck[bi] ? deckH(W.railDeck[bi], o.x, o.z) : gY(o.x, o.z); }
  for (let i = 0; i < n; i++) if (tun[i]) { let j = i; while (j < n && tun[j]) j++; const a = i > 0 ? h[i - 1] : j < n ? h[j] : 0, b = j < n ? h[j] : a; for (let k = i; k < j; k++) h[k] = a + (b - a) * (k - i + 1) / (j - i + 1); i = j; }
  // fuera del mapa no hay vía nivelada: el tren sale a la altura que lleva y se va adaptando al terreno poco a poco (como mucho un 4 %)
  { const ins = i => xs[i] > T.x0 + 75 && xs[i] < T.x1 - 75 && zs[i] > T.z0 + 75 && zs[i] < T.z1 - 75; let a = 0; while (a < n && !ins(a)) a++; let b = n - 1; while (b >= 0 && !ins(b)) b--;
    if (a <= b) { for (let i = a - 1; i >= 0; i--) h[i] = Math.max(h[i + 1] - .04 * D, Math.min(h[i + 1] + .04 * D, h[i])); for (let i = b + 1; i < n; i++) h[i] = Math.max(h[i - 1] - .04 * D, Math.min(h[i - 1] + .04 * D, h[i])); } }
  for (let it = 0; it < 2; it++) { let prev = h[0]; for (let i = 1; i < n - 1; i++) { const c = h[i]; h[i] = (prev + 2 * c + h[i + 1]) / 4; prev = c; } }
  for (let i = 0; i < n; i++) hid[i] = tun[i] && mY(xs[i], zs[i]) > h[i] + 2.2 ? 1 : 0;
  t.ph = h; t.pd = D; t.pn = n; t.hid = hid; t.tun = tun;
}
const hAt = (t, s) => { if (!t.ph) return 0; const f = Math.max(0, Math.min(t.pn - 1.001, s / t.pd)), i = Math.floor(f); return t.ph[i] + (t.ph[i + 1] - t.ph[i]) * (f - i); };
const hidAt = (t, s) => t.hid ? t.hid[Math.max(0, Math.min(t.pn - 1, Math.round(s / t.pd)))] : 0;
export function initTrains(M, root, mats) {
  const gh = body(true), gm = body(false);
  (M.train || []).slice(0, 3).forEach((flat, i) => { const pts = []; for (let k = 0; k < flat.length; k += 2) pts.push([flat[k], flat[k + 1]]); if (i % 2) pts.reverse(); const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); const L = cum[cum.length - 1]; if (L < 500) return;
    // paradas: el punto de la vía más cercano a cada estación del mapa
    const stops = []; (M.transit || []).forEach(t => { if (t[2] !== 'tren') return; let bs = -1, bd = 60; for (let k = 0; k + 1 < pts.length; k++) { const ax = pts[k][0], az = pts[k][1], ex = pts[k + 1][0] - ax, ez = pts[k + 1][1] - az, tt = Math.max(0, Math.min(1, ((t[0] - ax) * ex + (t[1] - az) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(t[0] - ax - ex * tt, t[1] - az - ez * tt); if (d < bd) { bd = d; bs = cum[k] + tt * (cum[k + 1] - cum[k]); } } if (bs > 0) stops.push({ s: bs + CAR * NCAR / 2, n: t[3] }); });
    stops.sort((a, b) => a.s - b.s); const cars = []; for (let c = 0; c < NCAR; c++) { const m = new THREE.Mesh(c === 0 || c === NCAR - 1 ? gh : gm, mats.lit); m.castShadow = true; m.frustumCulled = false; if (c === NCAR - 1) m.userData.flip = Math.PI; root.add(m); cars.push(m); }
    const t = { pts, cum, L, s: -40, v: 0, wait: 12 + i * 37, stops, next: 0, cars, cx: [], cz: [], cy: [] }; if (T.on) profile(M, t); TRN.list.push(t); });
}
function at(t, s, o) { const p = t.pts, c = t.cum, n = p.length; if (s <= 0) { const ux = (p[1][0] - p[0][0]) / c[1], uz = (p[1][1] - p[0][1]) / c[1]; o.x = p[0][0] + ux * s; o.z = p[0][1] + uz * s; o.ux = ux; o.uz = uz; return o; }
  if (s >= t.L) { const l = c[n - 1] - c[n - 2], ux = (p[n - 1][0] - p[n - 2][0]) / l, uz = (p[n - 1][1] - p[n - 2][1]) / l; o.x = p[n - 1][0] + ux * (s - t.L); o.z = p[n - 1][1] + uz * (s - t.L); o.ux = ux; o.uz = uz; return o; }
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; } const l = c[hi] - c[lo] || 1, f = (s - c[lo]) / l; o.ux = (p[hi][0] - p[lo][0]) / l; o.uz = (p[hi][1] - p[lo][1]) / l; o.x = p[lo][0] + (p[hi][0] - p[lo][0]) * f; o.z = p[lo][1] + (p[hi][1] - p[lo][1]) * f; return o; }
const _o = {}, _a = {}, _b = {};
// mueve los trenes. obs: lista [x, z, radio...] a la que se añaden los vagones cercanos (el tráfico los respeta)
export function updateTrains(dt, px, pz, obs) {
  TRN.near = 1e9; TRN.v = 0;
  for (const t of TRN.list) {
    if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) { if (t.s > t.L) { t.s = -CAR * NCAR - 30; t.next = 0; } else if (Math.hypot(t.cx[0] - px, t.cz[0] - pz) < 260) TRN.horn = 1; } }
    else { let want = VMAX; const st = t.stops[t.next]; if (st) { const d = st.s - t.s; if (d < .4) { t.wait = 8; t.next++; t.v = 0; want = 0; } else want = Math.min(VMAX, Math.sqrt(2 * ACC * d) + .4); }
      t.v = want > t.v ? Math.min(want, t.v + ACC * dt) : Math.max(want, t.v - ACC * 1.6 * dt); t.s += t.v * dt; if (t.s > t.L + CAR * NCAR + 60) { t.wait = 35 + Math.random() * 50; t.v = 0; } }
    for (let c = 0; c < NCAR; c++) { const sc = t.s - c * CAR - CAR / 2; at(t, sc + CAR * .35, _a); at(t, sc - CAR * .35, _b); const x = (_a.x + _b.x) / 2, z = (_a.z + _b.z) / 2, m = t.cars[c], ya = hAt(t, sc + CAR * .35), yb = hAt(t, sc - CAR * .35), y = T.on ? (ya + yb) / 2 + .16 : 0, pt = T.on ? Math.atan2(ya - yb, CAR * .7) : 0; m.position.set(x, y, z); m.rotation.set(m.userData.flip ? pt : -pt, Math.atan2(_a.x - _b.x, _a.z - _b.z) + (m.userData.flip || 0), 0, 'YXZ'); t.cx[c] = x; t.cz[c] = z; t.cy[c] = y;
      const d = Math.hypot(x - px, z - pz); m.visible = d < 900 && !(hidAt(t, sc) && hidAt(t, sc + CAR * .45) && hidAt(t, sc - CAR * .45)); if (d < TRN.near) { TRN.near = d; TRN.v = t.v; }
      if (obs && d < 160) { at(t, sc, _o); for (const k of [-7, 0, 7]) obs.push(_o.x + _o.ux * k, _o.z + _o.uz * k, 2.1, y); } }
  }
}
// choque del coche de Ethan (o de Ethan a pie) con los vagones: devuelve la fuerza del golpe
export function trainHit(car, foot) {
  let imp = 0; for (const t of TRN.list) for (let c = 0; c < NCAR; c++) { const x = t.cx[c], z = t.cz[c]; if (x === undefined) continue; const ref = car || foot; if (Math.hypot(x - ref.x, z - ref.z) > CAR) continue; if (T.on && Math.abs((ref.y || 0) - t.cy[c]) > 3.2) continue; at(t, t.s - c * CAR - CAR / 2, _o);
    for (let k = -9; k <= 9; k += 3) { const qx = _o.x + _o.ux * k, qz = _o.z + _o.uz * k; if (car) { const i = car.bump(qx, qz, 1.55); if (i > 0 || (t.v > 2 && Math.hypot(car.x - qx, car.z - qz) < 3.3)) { imp = Math.max(imp, i + t.v * .5); car.vx += _o.ux * t.v * .25; car.vz += _o.uz * t.v * .25; } } else { const dx = foot.x - qx, dz = foot.z - qz, d = Math.hypot(dx, dz); if (d < 1.9 && d > .01) { foot.x += dx / d * (1.9 - d); foot.z += dz / d * (1.9 - d); } } } }
  return imp;
}
