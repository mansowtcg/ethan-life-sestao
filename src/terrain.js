// terrain.js: el relieve. Una malla de alturas de 5 m hecha con el modelo del terreno que trae el mapa (M.dem, datos del IGN),
// con cada calle nivelada a lo ancho, el agua a su nivel, los puentes a su altura y una zanja de unos centímetros bajo
// calles y aceras para que el asfalto quede siempre por encima del terreno. Fuera de la malla, una rejilla gruesa de alrededores.
// No depende de three.js: se puede probar suelto.

export const T = { on: false, x0: 0, z0: 0, d: 5, nx: 0, nz: 0, hG: null, hM: null, S: null, decks: [], cd: 2.5, cnx: 0, cnz: 0, cov: null, level: [], ms: 0 };
export const RISE = .16, LOW = .03, TRENCH = .14;       // a qué altura se apoyan las cosas sobre asfalto y sobre terreno, y hondo de la zanja
const cl = (v, a, b) => v < a ? a : v > b ? b : v, smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
let F = null, Wd = null, EXT = [], hExt = 0;

// ---------- lectura del modelo del terreno
function bil(g, x, z, k) { const fx = cl((x - g.x0) / g.d, 0, g.nx - 1.001), fz = cl((z - g.z0) / g.d, 0, g.nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, q = j * g.nx + i, h = g.h; return ((h[q] * (1 - tx) + h[q + 1] * tx) * (1 - tz) + (h[q + g.nx] * (1 - tx) + h[q + g.nx + 1] * tx) * tz) * k; }
const cr = (p0, p1, p2, p3, t) => p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
// interpolación suave (Catmull-Rom), acotada al rango de los cuatro vecinos para que no rebote en los taludes
function cub(g, x, z, k) {
  const fx = cl((x - g.x0) / g.d, 0, g.nx - 1.001), fz = cl((z - g.z0) / g.d, 0, g.nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = g.h, nx = g.nx, nz = g.nz;
  const at = (a, b) => h[cl(b, 0, nz - 1) * nx + cl(a, 0, nx - 1)];
  const r0 = cr(at(i - 1, j - 1), at(i, j - 1), at(i + 1, j - 1), at(i + 2, j - 1), tx), r1 = cr(at(i - 1, j), at(i, j), at(i + 1, j), at(i + 2, j), tx), r2 = cr(at(i - 1, j + 1), at(i, j + 1), at(i + 1, j + 1), at(i + 2, j + 1), tx), r3 = cr(at(i - 1, j + 2), at(i, j + 2), at(i + 1, j + 2), at(i + 2, j + 2), tx);
  const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1), lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d), m = (hi - lo) * .1 + 3;
  return cl(cr(r0, r1, r2, r3, tz), lo - m, hi + m) * k;
}
// terreno natural: el modelo fino dentro de su zona, el grueso fuera, fundidos en una franja de 100 m
function natural(x, z) { const f = F, m = Math.min(x - f.x0, f.x0 + (f.nx - 1) * f.d - x, z - f.z0, f.z0 + (f.nz - 1) * f.d - z), wv = bil(Wd, x, z, 1); if (m <= 0) return wv; const fv = cub(f, x, z, .1); return m >= 100 ? fv : wv + (fv - wv) * smooth(m / 100); }
// la ampliación inventada (carretera y polígono) va en una vega llana a la altura del punto donde sale del mapa
function extDist(x, z) { let d = 1e9; for (const e of EXT) { const s = (x - e.x) * e.dx + (z - e.z) * e.dz, o = (x - e.x) * e.lx + (z - e.z) * e.lz, ds = Math.max(e.s0 - s, 0, s - e.s1), dq = Math.max(e.o0 - o, 0, o - e.o1); d = Math.min(d, Math.hypot(ds, dq)); } return d; }
function base0(x, z) { const n = natural(x, z); if (!EXT.length) return n; const w = 1 - smooth((extDist(x, z) - 20) / 160); return w <= 0 ? n : n + (hExt - n) * w; }

// ---------- superficie a trozos planos sobre una malla regular (cada celda, dos triángulos por la diagonal 00-11)
function pl(g, h, x, z) {
  const fx = cl((x - g.x0) / g.d, 0, g.nx - 1.0001), fz = cl((z - g.z0) / g.d, 0, g.nz - 1.0001), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * g.nx + i, h00 = h[k], h11 = h[k + g.nx + 1];
  return tx > tz ? h00 + (h[k + 1] - h00) * tx + (h11 - h[k + 1]) * tz : h00 + (h11 - h[k + g.nx]) * tx + (h[k + g.nx] - h00) * tz;
}
export const inRaster = (x, z) => x >= T.x0 && z >= T.z0 && x <= T.x1 && z <= T.z1;
export const sceneY = (x, z) => pl(T.S, T.S.h, x, z);
// altura del suelo a nivel de calle (sin la zanja) y de la malla del terreno (con ella)
export function gY(x, z) { return !T.on ? 0 : inRaster(x, z) ? firm(x, z, pl(T, T.hG, x, z)) : sceneY(x, z); }
// el firme: media de los perfiles de las vías que pasan por (x, z), cada una con más peso cuanto más dentro de ella cae el punto.
// Dentro de una calzada solo cuentan las calzadas; los caminos entran a partir del bordillo. A PMG metros del borde ya manda la malla
const PC = 10, PMG = 2; let pBest = null, pSeg = null, pT = null, pStamp = null, pRaw = null, pStampN = 0; const pTouch = [];
const hAt = (e, k, t) => { const n = e.h.length, S = e.s, h1 = e.h[k], h2 = e.h[k + 1], L = S[k + 1] - S[k] || 1, m1 = (k > 0 ? (h2 - e.h[k - 1]) / (S[k + 1] - S[k - 1]) : (h2 - h1) / L) * L, m2 = (k + 2 < n ? (e.h[k + 2] - h1) / (S[k + 2] - S[k]) : (h2 - h1) / L) * L, t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * h1 + (t3 - 2 * t2 + t) * m1 + (3 * t2 - 2 * t3) * h2 + (t3 - t2) * m2; };      /* a lo largo, una curva suave entre los nudos del perfil (tangentes por diferencias, con la distancia real entre nudos) */
function firm(x, z, base) {
  const PG = T.pg; if (!PG) return base; const PW = T.pw, ci = Math.floor(x / PC), cj = Math.floor(z / PC), l = PG.get(ci * 100003 + cj); if (!l) return base;
  const st = ++pStampN; pTouch.length = 0;
  for (let q = 0; q < l.length; q += 2) { const wi = l[q], k = l[q + 1], e = PW[wi], ax = e.x[k], az = e.z[k], ex = e.x[k + 1] - ax, ez = e.z[k + 1] - az, t = cl(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dx = x - ax - ex * t, dz = z - az - ez * t, d2 = dx * dx + dz * dz;
    if (pStamp[wi] !== st) { pStamp[wi] = st; pBest[wi] = d2; pSeg[wi] = k; pT[wi] = t; pTouch.push(wi); } else if (d2 < pBest[wi]) { pBest[wi] = d2; pSeg[wi] = k; pT[wi] = t; } }
  // la más cercana de las que pasan por aquí hace de referencia (una calzada antes que un camino)
  let ddC = 1e9, ddA = 1e9, ref = -1, rk = 1e9; for (let i = 0; i < pTouch.length; i++) { const wi = pTouch[i], e = PW[wi], raw = Math.sqrt(pBest[wi]), dd = Math.max(0, raw - e.hw); pBest[wi] = dd; pRaw[wi] = raw; if (dd >= PMG) continue; if (dd < ddA) ddA = dd; if (e.car && dd < ddC) ddC = dd; const key = raw + (e.car ? 0 : 50); if (key < rk) { rk = key; ref = wi; } }
  if (ref < 0) return base;
  const hRef = hAt(PW[ref], pSeg[ref], pT[ref]), pathW = smooth(ddC / .8); let sw = 0, sh = 0;
  for (let i = 0; i < pTouch.length; i++) { const wi = pTouch[i], e = PW[wi], dd = pBest[wi]; if (dd >= PMG) continue; const rr = Math.min(1, pRaw[wi] / e.hw); let wt = Math.exp(-3 * rr * rr) / (dd * dd + .06);      /* cada vía pesa sobre todo en su eje: donde dos calzadas se solapan, cada una conserva su altura en su centro */ if (!e.car) { wt *= pathW; if (wt <= 0) continue; }
    const h = wi === ref ? hRef : hAt(e, pSeg[wi], pT[wi]); if (Math.abs(h - hRef) > 1.2) continue;      /* otra vía a distinta altura (la que pasa bajo un puente junto al estribo): no se promedia con ella, hay un muro entre las dos */
    sw += wt; sh += wt * h; }
  if (!sw) return base;
  let b = 1 - smooth(ddA / PMG); const eg = Math.min(x - T.x0, T.x1 - x, z - T.z0, T.z1 - z); if (eg < 40) b *= smooth(eg / 40);
  return base + (sh / sw - base) * b;
}
export function mY(x, z) { return !T.on ? 0 : inRaster(x, z) ? pl(T, T.hM, x, z) : sceneY(x, z); }
// ¿hay calle, acera o zócalo en este punto?
export function covered(x, z) { if (!T.on) return true; if (!inRaster(x, z)) return true; const i = Math.round((x - T.x0) / T.cd), j = Math.round((z - T.z0) / T.cd); return T.cov[j * T.cnx + i] > 0; }
// pendiente del suelo: [dh/dx, dh/dz]
const _g = [0, 0];
export function slopeAt(x, z, e) { e = e || 1.5; _g[0] = (gY(x + e, z) - gY(x - e, z)) / (2 * e); _g[1] = (gY(x, z + e) - gY(x, z - e)) / (2 * e); return _g; }
// tablero de puente que hay en un punto: su altura, o -1e9 si no hay ninguno
export function deckY(x, z) {
  let best = -1e9; for (const D of T.decks) { if (x < D.b[0] || x > D.b[2] || z < D.b[1] || z > D.b[3]) continue; const p = D.p;
    for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, t = cl(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1); if (Math.hypot(x - ax - ex * t, z - az - ez * t) > D.hw) continue; const h = D.h[k / 2] + (D.h[k / 2 + 1] - D.h[k / 2]) * t; if (h > best) best = h; } }
  return best;
}
// dónde se apoya algo que está en (x, z). Con y (su altura actual) se decide si va por el tablero de un puente o por debajo
export function standY(x, z, y) {
  if (!T.on) return 0; const g = covered(x, z) || (T.pad && T.pad(x, z)) ? gY(x, z) + RISE : mY(x, z) + LOW; if (!T.decks.length) return g;      /* T.pad: losas de las plazas de los aparcamientos (car.js) */
  const d = deckY(x, z); if (d < -1e8) return g; const dk = d + RISE; if (dk <= g + .4) return Math.max(g, dk); return y === undefined || y > dk - 1.6 ? dk : g;
}

// ---------- construcción
// ways: [{ p: [x,z,...], hw: medio ancho con acera, ms: pendiente máxima, bridge, flat: se nivela el terreno, sm: se suaviza el perfil }]
// el agua que toca el borde del mapa se alarga más allá: la ría hasta el horizonte; un río estrecho, solo un trecho (si no, sale un canal recto cruzando el monte)
const bboxP = p => { let a = 1e9, b = 1e9, c = -1e9, e = -1e9; for (let k = 0; k < p.length; k += 2) { a = Math.min(a, p[k]); c = Math.max(c, p[k]); b = Math.min(b, p[k + 1]); e = Math.max(e, p[k + 1]); } return [a, b, c, e]; };
const pipP = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
export function waterExt(M, p0) { const bb = M.bbox, mg = M.margin || 0; if (!mg) return { p: p0, far: false }; const lim = [bb[0] - mg - 15, bb[1] - mg - 15, bb[2] + mg + 15, bb[3] + mg + 15], p = p0.slice(), n = p.length / 2;
  const at = k => Math.abs(p[k * 2] - lim[0]) < .4 || Math.abs(p[k * 2] - lim[2]) < .4 || Math.abs(p[k * 2 + 1] - lim[1]) < .4 || Math.abs(p[k * 2 + 1] - lim[3]) < .4, on = []; for (let k = 0; k < n; k++) on.push(at(k));
  if (on.indexOf(true) < 0) return { p, far: false }; const st = on.indexOf(false); if (st < 0) return { p, far: false };
  // tramos seguidos de vértices sobre el borde: cada salida del agua se alarga según lo ancha que sea
  for (let q = 0; q < n; q++) { const k0 = (st + q) % n; if (!on[k0] || on[(k0 - 1 + n) % n]) continue; const run = []; for (let k = k0; on[k] && run.length < n; k = (k + 1) % n) run.push(k);
    let span = 0; for (const a of run) for (const b of run) span = Math.max(span, Math.hypot(p0[a * 2] - p0[b * 2], p0[a * 2 + 1] - p0[b * 2 + 1])); const FAR = span > 150 ? 2600 : 320;
    for (const k of run) { const x = p0[k * 2], z = p0[k * 2 + 1]; if (Math.abs(x - lim[0]) < .4) p[k * 2] -= FAR; else if (Math.abs(x - lim[2]) < .4) p[k * 2] += FAR; if (Math.abs(z - lim[1]) < .4) p[k * 2 + 1] -= FAR; else if (Math.abs(z - lim[3]) < .4) p[k * 2 + 1] += FAR; } }
  return { p, far: true }; }
export function initTerrain(M, ways, ext, aprons) {
  const t0 = Date.now(), dem = M.dem; if (!dem) { T.on = false; return; }
  F = dem.fine; Wd = dem.wide;
  // las alturas del modelo vienen redondeadas y dejan el monte a terrazas: una pasada de suavizado (1-2-1) las quita sin mover el relieve
  if (!F.sm) { const n1 = F.nx, n2 = F.nz, a = Float32Array.from(F.h), b = new Float32Array(a.length); for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) { const q = j * n1 + i; b[q] = (a[q - (i > 0 ? 1 : 0)] + 2 * a[q] + a[q + (i < n1 - 1 ? 1 : 0)]) / 4; } for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) { const q = j * n1 + i; a[q] = (b[q - (j > 0 ? n1 : 0)] + 2 * b[q] + b[q + (j < n2 - 1 ? n1 : 0)]) / 4; } F = Object.assign({}, F, { h: a, sm: 1 }); } EXT = (ext || []).map(e => Object.assign({}, e, { s0: Math.max(e.s0, 30) })); hExt = 0;
  if (ext && ext.length) hExt = natural(ext[0].x, ext[0].z);
  // rejilla gruesa de alrededores (80 m)
  const S = T.S = { x0: -3040, z0: -2320, d: 80, nx: 77, nz: 59, h: null }; S.h = new Float32Array(S.nx * S.nz);
  for (let j = 0; j < S.nz; j++) for (let i = 0; i < S.nx; i++) S.h[j * S.nx + i] = Math.max(-.4, base0(S.x0 + i * S.d, S.z0 + j * S.d));
  // malla fina: sus bordes coinciden con líneas de la gruesa y allí toma sus valores, para que no queden grietas
  const d = T.d = 5; T.x0 = -1520; T.z0 = -880; T.x1 = 1520; T.z1 = 880; const nx = T.nx = Math.round((T.x1 - T.x0) / d) + 1, nz = T.nz = Math.round((T.z1 - T.z0) / d) + 1, N = nx * nz, hG = T.hG = new Float32Array(N);
  for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++, k++) { const x = T.x0 + i * d, z = T.z0 + j * d, e = Math.min(x - T.x0, T.x1 - x, z - T.z0, T.z1 - z); let h = base0(x, z); if (e < 60) { const s = pl(S, S.h, x, z); h = s + (h - s) * smooth(e / 60); } hG[k] = h; }
  const nat = (x, z) => inRaster(x, z) ? pl(T, hG, x, z) : pl(S, S.h, x, z);

  // --- perfil de cada vía: altura del terreno bajo el eje, con la pendiente limitada y los baches alisados
  const ids = new Map(), H = [], cnt = [], NX = [], NZ = [], node = (x, z) => { const k = Math.round(x * 10) + ',' + Math.round(z * 10); let id = ids.get(k); if (id === undefined) { id = H.length; ids.set(k, id); H.push(nat(x, z)); cnt.push(0); NX[id] = x; NZ[id] = z; } return id; };
  const segs = [], W = [];
  ways.forEach(w => { const p = w.p, n = p.length / 2; if (n < 2) return; const o = { w, v: [], x: [], z: [] };
    if (w.bridge) { const a = node(p[0], p[1]), b = node(p[n * 2 - 2], p[n * 2 - 1]); o.v = [a, b]; o.bridge = true; W.push(o); return; }
    for (let k = 0; k < n; k++) { const x = p[k * 2], z = p[k * 2 + 1];
      if (k > 0) { const ax = p[k * 2 - 2], az = p[k * 2 - 1], l = Math.hypot(x - ax, z - az), m = Math.ceil(l / 5); for (let q = 1; q < m; q++) { const id = H.length, qx = ax + (x - ax) * q / m, qz = az + (z - az) * q / m; H.push(nat(qx, qz)); cnt.push(0); NX[id] = qx; NZ[id] = qz; o.v.push(id); o.x.push(qx); o.z.push(qz); } }
      const id = node(x, z); o.v.push(id); o.x.push(x); o.z.push(z); }
    for (let k = 0; k + 1 < o.v.length; k++) segs.push([o.v[k], o.v[k + 1], Math.hypot(o.x[k + 1] - o.x[k], o.z[k + 1] - o.z[k]) || .01, w.ms, w.sm || 0]);
    W.push(o); });
  // extremos de puente: anclados si tocan una vía que no es puente
  W.forEach(o => { if (!o.bridge) o.v.forEach(id => { cnt[id]++; }); });
  // vías vecinas: las que se tocan van a la misma altura; cuanto más hueco hay entre sus bordes, más pueden diferir (un talud)
  const HC = 16, hkey = (i, j) => i * 100003 + j, hs = new Map();
  W.forEach((o, wi) => { if (o.bridge || o.w.ghost) return; for (let k = 0; k < o.v.length; k++) { const kk = hkey(Math.floor(o.x[k] / HC), Math.floor(o.z[k] / HC)); let l = hs.get(kk); if (!l) hs.set(kk, l = []); l.push(wi, k); } });
  let nCross = 0; const cross = [];
  // (junto a una calzada o una vía, la malla de 5 m no puede dibujar un escalón: hasta 7 m de su borde todo va a su altura)
  const wide = w => w.car || w.rail !== undefined;
  W.forEach((o, wi) => { if (o.bridge || o.w.ghost) return; const a = o.w.hw, near = new Map(), wa = wide(o.w);
    for (let k = 0; k < o.v.length; k++) { const x = o.x[k], z = o.z[k], ci = Math.floor(x / HC), cj = Math.floor(z / HC); near.clear();
      for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) { const l = hs.get(hkey(i, j)); if (!l) continue; for (let q = 0; q < l.length; q += 2) { const wj = l[q]; if (wj <= wi) continue; const p = W[wj], kq = l[q + 1], dd = Math.hypot(p.x[kq] - x, p.z[kq] - z), gap = dd - a - p.w.hw, tight = wa && wide(p.w); if (gap > (tight ? 12 : 5)) continue; const e = near.get(wj); if (!e || dd < e[0]) near.set(wj, [dd, p.v[kq], tight ? gap - 7 : gap]); } }
      near.forEach((e, wj) => { if (e[1] === o.v[k]) return; cross.push([o.v[k], e[1], 1, .05 + Math.max(0, e[2]) * .8, wi, wj]); nCross++; }); } });
  // la calzada manda: el trozo de un camino o de una escalera que cae dentro de una calle (hasta su bordillo) va a la altura de la calle;
  // el camino empieza a subir o bajar fuera. Sin esto las escaleras arrancaban en el eje de la calle y la hundían
  const pslaves = [];
  W.forEach((o, wi) => { if (o.bridge || o.w.ghost || o.w.car || o.w.rail !== undefined) return;
    for (let k = 0; k < o.v.length; k++) { const x = o.x[k], z = o.z[k], ci = Math.floor(x / HC), cj = Math.floor(z / HC); let bd = 1e9, ba = -1, bb = -1, bt = 0, own = false;
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const l = hs.get(hkey(i, j)); if (!l) continue; for (let q = 0; q < l.length; q += 2) { const p = W[l[q]]; if (!p.w.car) continue; const kq = l[q + 1];
        for (let e = kq - 1; e <= kq; e++) { if (e < 0 || e + 1 >= p.v.length) continue; const ax = p.x[e], az = p.z[e], ex = p.x[e + 1] - ax, ez = p.z[e + 1] - az, t = cl(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dd = Math.hypot(x - ax - ex * t, z - az - ez * t) - p.w.hw; if (dd < bd) { bd = dd; ba = p.v[e]; bb = p.v[e + 1]; bt = t; own = ba === o.v[k] || bb === o.v[k]; } } } }
      if (bd < -.05 && !own) pslaves.push([o.v[k], ba, bb, bt]); } });
  T.nPs = pslaves.length;
  // puentes: los tramos encadenados forman un solo tablero de estribo a estribo. Si en una junta entre dos tramos nace una escalera
  // o un camino, esa junta sigue siendo tablero: es el camino el que sube hasta ella
  const br = W.filter(o => o.bridge), plen = o => { let l = 0; const p = o.w.p; for (let k = 0; k + 3 < p.length; k += 2) l += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); return l || 1; }; br.forEach(o => { o.len = plen(o); });
  const chains = [], use = new Map(); br.forEach(o => o.v.forEach(id => use.set(id, (use.get(id) || 0) + 1)));
  { const joint = id => use.get(id) === 2, done = new Set();
    br.forEach(o => { if (done.has(o)) return; const chain = [[o, 0]]; done.add(o); let end = o.v[1], start = o.v[0];
      for (;;) { if (!joint(end)) break; const nx = br.find(q => !done.has(q) && q.v.indexOf(end) >= 0); if (!nx) break; const rev = nx.v[0] === end ? 0 : 1; chain.push([nx, rev]); done.add(nx); end = nx.v[rev ? 0 : 1]; }
      for (;;) { if (!joint(start)) break; const nx = br.find(q => !done.has(q) && q.v.indexOf(start) >= 0); if (!nx) break; const rev = nx.v[1] === start ? 0 : 1; chain.unshift([nx, rev]); done.add(nx); start = nx.v[rev ? 1 : 0]; }
      let Lt = 0; chain.forEach(c => { Lt += c[0].len; }); const w0 = o.w, ch = { A: start, B: end, Lt, obs: [], slaves: [], mb: w0.rail !== undefined ? .03 : w0.car ? .12 : .2, rail: w0.rail !== undefined }; chains.push(ch);
      let acc = 0; chain.forEach((c, ci) => { const q = c[0]; q.ch = ch; q.s0 = (c[1] ? acc + q.len : acc) / Lt; q.s1 = (c[1] ? acc : acc + q.len) / Lt; acc += q.len; if (ci < chain.length - 1) { const id = q.v[c[1] ? 0 : 1]; if (cnt[id]) ch.slaves.push([id, acc / Lt]); } });
      if (start !== end) segs.push([start, end, Lt, o.w.ms]); }); }
  const tieB = [], tieN = [];
  // un puente que nace en mitad de otro (el ramal que sale de una rotonda elevada): su extremo va atado al tablero del otro, a su altura
  { let nT = 0; chains.forEach(c => [c.A, c.B].forEach(id => { if (cnt[id] || use.get(id) !== 1) return; const x = NX[id], z = NZ[id];
      for (const q of br) { if (q.ch === c || q.v.indexOf(id) >= 0) continue; const p = q.w.p; let acc = 0, hit = -1; for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, l = Math.hypot(ex, ez) || 1, t = cl(((x - ax) * ex + (z - az) * ez) / (l * l), 0, 1); if (Math.hypot(x - ax - ex * t, z - az - ez * t) < .8) { hit = acc + t * l; break; } acc += l; }
        if (hit < 1 || hit > q.len - 1) continue; const f = hit / q.len; q.ch.slaves.push([id, q.s0 + (q.s1 - q.s0) * f]); nT++; tieB.push([id, q]); (T.ties || (T.ties = [])).push([Math.round(x), Math.round(z), Math.round(c.Lt)]); break; } })); T.nTie = nT; }
  // y una calle o un camino que comparte un nudo con un puente en mitad del tablero (sale de él): ese nudo va a la altura del tablero
  { const bv = new Map(); br.forEach(q => { const p = q.w.p; let acc = 0; for (let k = 0; k < p.length; k += 2) { if (k) acc += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]); if (k && k < p.length - 2) bv.set(Math.round(p[k] * 10) + ',' + Math.round(p[k + 1] * 10), [q, acc]); } });
    let nS = 0; const done = new Set(); W.forEach(o => { if (o.bridge || o.w.ghost) return; for (let k = 0; k < o.v.length; k++) { const id = o.v[k]; if (done.has(id) || use.has(id)) continue; const hit = bv.get(Math.round(o.x[k] * 10) + ',' + Math.round(o.z[k] * 10)); if (!hit) continue; const q = hit[0], f = hit[1] / q.len; if (f < .02 || f > .98) continue; q.ch.slaves.push([id, q.s0 + (q.s1 - q.s0) * f]); done.add(id); nS++; tieN.push([id, q, o.x[k], o.z[k]]); (T.ties2 || (T.ties2 = [])).push([Math.round(o.x[k]), Math.round(o.z[k]), +f.toFixed(2)]); } }); T.nTie2 = nS; }
  // gálibo: lo que cruza por debajo (calle, vía o camino) es un obstáculo que el tablero salva por encima
  const clrs = [], xp = [], X = (ax, az, bx, bz, cx, cz, dx, dz) => { const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return -1; const t = ((cx - ax) * sz - (cz - az) * sx) / den, v = ((cx - ax) * rz - (cz - az) * rx) / den; return t >= 0 && t <= 1 && v >= 0 && v <= 1 ? t : -1; };
  br.forEach(o => { const p = o.w.p, ch = o.ch, seen = new Set(); let acc = 0;
    for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / 6));
      for (let q = 0; q <= m; q++) { const x = ax + (bx - ax) * q / m, z = az + (bz - az) * q / m, ci = Math.floor(x / HC), cj = Math.floor(z / HC);
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const lst = hs.get(hkey(i, j)); if (!lst) continue; for (let n = 0; n < lst.length; n += 2) { const wi = lst[n], u = W[wi], kq = lst[n + 1]; if (kq + 1 >= u.v.length) continue; const key = wi * 4096 + kq; if (seen.has(key)) continue;
          const t = X(ax, az, bx, bz, u.x[kq], u.z[kq], u.x[kq + 1], u.z[kq + 1]); if (t < 0) continue; seen.add(key);
          const ix = ax + (bx - ax) * t, iz = az + (bz - az) * t; if (Math.hypot(ix - NX[ch.A], iz - NZ[ch.A]) < 2 || Math.hypot(ix - NX[ch.B], iz - NZ[ch.B]) < 2) continue;
          const id = Math.hypot(u.x[kq] - ix, u.z[kq] - iz) < Math.hypot(u.x[kq + 1] - ix, u.z[kq + 1] - iz) ? u.v[kq] : u.v[kq + 1]; if (use.has(id) || use.has(u.v[kq]) && Math.hypot(u.x[kq] - ix, u.z[kq] - iz) < 1 || use.has(u.v[kq + 1]) && Math.hypot(u.x[kq + 1] - ix, u.z[kq + 1] - iz) < 1) continue;
          const f = (acc + l * t) / o.len, sA = o.s0 + (o.s1 - o.s0) * f;
          xp.push(ix, iz, chains.indexOf(ch)); (ch.U || (ch.U = new Set())).add(wi);
          clrs.push([ch, sA, id, u.w.rail !== undefined ? 5.4 : u.w.car ? 4.7 : 2.9, ch.rail ? .75 : u.w.rail !== undefined ? .12 : .4, (u.w.hw + o.w.hw * .5 + 1) / ch.Lt]); } } }
      acc += l; } });
  // junto a un cruce a distinto nivel las vías vecinas no tienen por qué ir a la misma altura
  // (lo que pasa por debajo no se ata a lo que llega al puente; dos calzadas que pasan juntas por debajo sí siguen atadas entre sí)
  if (xp.length) { const drop = q => { for (let k = 0; k < xp.length; k += 3) { const x = xp[k], z = xp[k + 1]; if (Math.hypot(NX[q[0]] - x, NZ[q[0]] - z) > 45 && Math.hypot(NX[q[1]] - x, NZ[q[1]] - z) > 45) continue; const U = chains[xp[k + 2]].U; if (U.has(q[4]) !== U.has(q[5])) return true; } return false; }; let k = 0; for (const q of cross) if (!drop(q)) cross[k++] = q; cross.length = k; }
  const NIT = T.nit || 120, relax = L => { for (let s = 0; s < L.length; s++) { const q = L[s], dh = H[q[1]] - H[q[0]], lim = q[3] * q[2]; if (dh > lim) { const e = (dh - lim) / 2; H[q[0]] += e; H[q[1]] -= e; } else if (dh < -lim) { const e = (-dh - lim) / 2; H[q[0]] -= e; H[q[1]] += e; } } };
  const slave = () => { for (const c of chains) for (const q of c.slaves) H[q[0]] = c.at ? c.at(q[1]) : H[c.A] + (H[c.B] - H[c.A]) * q[1]; for (const q of pslaves) H[q[0]] = H[q[1]] + (H[q[2]] - H[q[1]]) * q[3]; };
  // alisado: cada nudo tiende a la media de sus vecinos a lo largo de las vías, también en los cruces (si no, cada calle llega con su pendiente y el cruce queda en pico)
  const adjS = []; segs.forEach(q => { if (!q[4]) return; (adjS[q[0]] || (adjS[q[0]] = [])).push(q[1], 1 / q[2], q[4]); (adjS[q[1]] || (adjS[q[1]] = [])).push(q[0], 1 / q[2], q[4]); });
  const sink = (id, e) => { H[id] -= e; };
  const smoothG = f => { for (let id = 0; id < adjS.length; id++) { const a = adjS[id]; if (!a || a.length < 6) continue; let sh = 0, ws = 0, lam = 0; for (let k = 0; k < a.length; k += 3) { sh += H[a[k]] * a[k + 1]; ws += a[k + 1]; lam += a[k + 2]; } H[id] += (sh / ws - H[id]) * Math.min(.5, lam / (a.length / 3) * f); }
  };
  const abut = f => {
    // en los estribos, el vecino del otro lado es el propio tablero: la calle entra en el puente sin quiebro
    for (const c of chains) { if (!c.at) continue; const e = Math.min(.45, 6 / c.Lt); for (const en of [[c.A, e], [c.B, 1 - e]]) { const a = adjS[en[0]]; if (!a || a.length !== 3) continue; const wd = 1 / (e * c.Lt), tg = (H[a[0]] * a[1] + c.at(en[1]) * wd) / (a[1] + wd); H[en[0]] += (tg - H[en[0]]) * .25 * f; } } };
  // perfil de cada tablero: la cuerda tensa de estribo a estribo que pasa por encima de todos los obstáculos
  const hulls = () => { chains.forEach(c => { c.obs.length = 0; }); clrs.forEach(q => { const top = H[q[2]] + q[3] + .3; q[0].obs.push([Math.max(0, q[1] - q[5]), top], [q[1], top], [Math.min(1, q[1] + q[5]), top]); });
    chains.forEach(c => { const pts = [[0, H[c.A]]].concat(c.obs.sort((a, b) => a[0] - b[0]), [[1, H[c.B]]]), hull = [];
      for (const q of pts) { if (hull.length && q[0] - hull[hull.length - 1][0] < 1e-6) { if (q[1] > hull[hull.length - 1][1] && hull.length > 1) hull[hull.length - 1] = q; continue; } while (hull.length >= 2) { const a = hull[hull.length - 2], b = hull[hull.length - 1]; if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0) hull.pop(); else break; } hull.push(q); }
      const at = s => { s = cl(s, 0, 1); let k = 0; while (k < hull.length - 2 && hull[k + 1][0] < s) k++; const a = hull[k], b = hull[k + 1]; return a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0] || 1); }, dl = Math.min(.2, 4 / c.Lt);
      c.hull = hull; c.anch = [cnt[c.A], cnt[c.B]]; c.at = s => s < dl || s > 1 - dl ? at(s) : (at(s - dl) + 2 * at(s) + at(s + dl)) / 4; }); };
  // escaleras: el mapa dice hacia dónde suben (incline) y a veces cuántos peldaños tienen. Con la malla de 25 m dos calles a distinto
  // nivel unidas por una escalera salían casi a la misma altura: la escalera empuja para que arriba quede más alto, lo que suben sus
  // peldaños (17 cm cada uno) o, si no se sabe, algo menos de un tercio de su largo. Si un extremo va atado a una calle, empuja a la calle
  const stc = [], psOf = new Map(); pslaves.forEach(q => psOf.set(q[0], q));
  W.forEach(o => { const r = o.w.r; if (!r || (r.t !== 'steps' && !r.cv) || o.bridge || !r.inc || o.v.length < 2) return; const n = o.v.length; let L = 0; for (let k = 1; k < n; k++) L += Math.hypot(o.x[k] - o.x[k - 1], o.z[k] - o.z[k - 1]); if (L < 2.5) return;
    const rise = r.sc ? r.sc * .165 : cl(L * .26, .7, 4.5), a = o.v[0], b = o.v[n - 1]; if (a !== b) stc.push(r.inc > 0 ? [a, b, rise] : [b, a, rise]); });
  const bump = (id, e) => { const q = psOf.get(id); if (q) { H[q[1]] += e; H[q[2]] += e; } else H[id] += e; };
  const lift = f => { for (const q of stc) { const dh = H[q[1]] - H[q[0]]; if (dh < q[2]) { const e = (q[2] - dh) * f / 2; bump(q[1], e); bump(q[0], -e); } } };
  T.nStc = stc.length;
  // nada se aleja demasiado del terreno de verdad: como mucho 7 m por debajo (un paso inferior en trinchera) y 10 m por encima.
  // Sin este tope, una calle con pasarelas por encima podía hundirse más de 25 m arrastrando a las de alrededor
  const H0 = Float32Array.from(H), keep = () => { for (let i = 0; i < H.length; i++) { const lo = H0[i] - 7, hi = H0[i] + 10; if (H[i] < lo) H[i] = lo; else if (H[i] > hi) H[i] = hi; } };
  for (let it = 0; it < NIT; it++) {
    slave(); if (it < NIT - 10) lift(.85); if (it < NIT - 12) relax(cross); relax(segs);
    // el tablero tiene que poder subir hasta salvar cada obstáculo con su pendiente máxima: si no llega, el obstáculo baja y el estribo sube
    for (let s = 0; s < clrs.length; s++) { const q = clrs[s], ch = q[0], need = H[q[2]] + q[3] + .3, eA = need - H[ch.A] - ch.mb * Math.max(0, q[1] - q[5]) * ch.Lt; if (eA > 0) { sink(q[2], eA * q[4]); H[ch.A] += eA * (1 - q[4]); } const eB = H[q[2]] + q[3] + .3 - H[ch.B] - ch.mb * Math.max(0, 1 - q[1] - q[5]) * ch.Lt; if (eB > 0) { sink(q[2], eB * q[4]); H[ch.B] += eB * (1 - q[4]); } }
    if (it < NIT - 4) smoothG(it < 40 ? 1.3 : .8); keep();
  }
  { let lo = 0, hi = 0; const L = []; for (let i = 0; i < H.length; i++) { const d = H[i] - H0[i]; if (d < -6.9) { lo++; L.push([Math.round(NX[i]), Math.round(NZ[i]), Math.round(d)]); } else if (d > 9.9) { hi++; L.push([Math.round(NX[i]), Math.round(NZ[i]), Math.round(d)]); } } T.dev = { lo, hi, at: L.filter((q, k) => k % 7 === 0).slice(0, 30) }; }
  T.nCross = nCross; T.nClr = clrs.length;
  // nudos donde se juntan tres o más tramos de puente sin tocar ninguna calle: a la media de adonde llevan
  { const hub = new Set(); chains.forEach(c => [c.A, c.B].forEach(id => { if (!cnt[id] && chains.filter(q => q.A === id || q.B === id).length > 1) hub.add(id); }));
    for (let it = 0; it < 200 && hub.size; it++) hub.forEach(id => { let sm = 0, ws = 0; chains.forEach(c => { if (c.A !== id && c.B !== id) return; const w = 1 / c.Lt; sm += H[c.A === id ? c.B : c.A] * w; ws += w; }); if (ws) H[id] = sm / ws; });
    // un extremo que no toca ninguna calle (otro puente, o el borde del mapa) sube lo que haga falta para salvar lo que tiene debajo
    for (let it = 0; it < 4; it++) clrs.forEach(q => { const c = q[0], top = H[q[2]] + q[3] + .3; if (!cnt[c.A]) H[c.A] = Math.max(H[c.A], top - c.mb * Math.max(0, q[1] - q[5]) * c.Lt); if (!cnt[c.B]) H[c.B] = Math.max(H[c.B], top - c.mb * Math.max(0, 1 - q[1] - q[5]) * c.Lt); });
    // con el perfil ya curvado, los caminos que nacen en mitad de un puente se ajustan a él
    hulls(); for (let it = 0; it < 24; it++) { slave(); relax(segs); if (it < 20) { smoothG(.5); abut(.6); hulls(); } } hulls(); slave();
  { let nv = 0, mv = 0; for (let s = 0; s < segs.length; s++) { const q = segs[s], e = Math.abs(H[q[1]] - H[q[0]]) - q[3] * q[2]; if (e > .05) { nv++; if (e > mv) mv = e; } } let nx2 = 0, mx2 = 0; for (let s = 0; s < cross.length; s++) { const q = cross[s], e = Math.abs(H[q[1]] - H[q[0]]) - q[3] * q[2]; if (e > .05) { nx2++; if (e > mx2) mx2 = e; } } T.residX = [cross.length, nx2, +mx2.toFixed(2)]; T.resid = [segs.length, nv, +mv.toFixed(2)]; }
    T.decks = br.map(o => { const p0 = o.w.p, n0 = p0.length / 2, p = [], hh = [], L = o.len; let acc = 0, x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (let k = 0; k < n0; k++) { if (k) { const ax = p0[k * 2 - 2], az = p0[k * 2 - 1], bx = p0[k * 2], bz = p0[k * 2 + 1], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / 6)); for (let q = 1; q <= m; q++) { p.push(ax + (bx - ax) * q / m, az + (bz - az) * q / m); hh.push(o.ch.at(o.s0 + (o.s1 - o.s0) * (acc + l * q / m) / L)); } acc += l; } else { p.push(p0[0], p0[1]); hh.push(o.ch.at(o.s0)); } }
      for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]); }
      // por mucho que haya que salvar, el tablero no pasa de la rampa que se puede subir (si no llega, lo de abajo queda justo de gálibo)
      { const ms = o.w.rail !== undefined ? .04 : o.w.car ? .19 : o.w.r && o.w.r.t === 'steps' ? 1.2 : .45, nh = hh.length; for (let k = 1; k < nh; k++) { const l = Math.hypot(p[k * 2] - p[k * 2 - 2], p[k * 2 + 1] - p[k * 2 - 1]); if (hh[k] > hh[k - 1] + ms * l) hh[k] = hh[k - 1] + ms * l; } for (let k = nh - 2; k >= 0; k--) { const l = Math.hypot(p[k * 2 + 2] - p[k * 2], p[k * 2 + 3] - p[k * 2 + 1]); if (hh[k] > hh[k + 1] + ms * l) hh[k] = hh[k + 1] + ms * l; } }
      const hw = o.w.hw; o.w.deck = { p, h: Float32Array.from(hh), hw, b: [x0 - hw, z0 - hw, x1 + hw, z1 + hw], w: o.w, len: L, a0: !!cnt[o.v[0]], a1: !!cnt[o.v[1]], ch: o.ch, s0: o.s0, s1: o.s1 }; return o.w.deck; });
    // tableros que van pegados (calzada, acera y bidegorri del mismo puente): el estrecho toma la altura del ancho
    const hOn = (D, x, z) => { let bd = 1e9, h = 0; const p = D.p; for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, t = cl(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dd = Math.hypot(x - ax - ex * t, z - az - ez * t); if (dd < bd) { bd = dd; h = D.h[k / 2] + (D.h[k / 2 + 1] - D.h[k / 2]) * t; } } return [bd, h]; };
    // (se hace por tableros enteros, de estribo a estribo, y sin tocar los extremos: en ellos cada uno sigue llegando a su calle)
    const byCh = new Map(); T.decks.forEach(D => { let l = byCh.get(D.ch); if (!l) byCh.set(D.ch, l = []); l.push(D); });
    const ordC = chains.filter(c => byCh.has(c)).sort((a, b) => byCh.get(b)[0].hw - byCh.get(a)[0].hw || b.Lt - a.Lt);
    ordC.forEach((C, i) => { const mine = byCh.get(C); for (let j = 0; j < i; j++) { const theirs = byCh.get(ordC[j]), plan = []; let ok = true;
      for (const D of mine) { const p = D.p, n = p.length / 2; for (let k = 0; k < n && ok; k++) { let hit = null; for (const P of theirs) { if (p[k * 2] < P.b[0] - D.hw - 1 || p[k * 2] > P.b[2] + D.hw + 1 || p[k * 2 + 1] < P.b[1] - D.hw - 1 || p[k * 2 + 1] > P.b[3] + D.hw + 1) continue; const r = hOn(P, p[k * 2], p[k * 2 + 1]); if (r[0] < P.hw + D.hw + .6 && Math.abs(r[1] - D.h[k]) < 1.8 && (!hit || r[0] < hit[0])) hit = r; } if (!hit) ok = false; else plan.push([D, k, hit[1]]); } if (!ok) break; }
      if (!ok) continue;
      for (const q of plan) { const D = q[0], k = q[1], f = D.p.length > 2 ? k / (D.p.length / 2 - 1) : 0, sc = (D.s0 + (D.s1 - D.s0) * f) * C.Lt, w = smooth(Math.min(sc, C.Lt - sc) / 10); D.h[k] += (q[2] - D.h[k]) * w; }
      break; } }); }

  // los atados a un tablero, a la altura final del tablero (que sale de la cuerda con la rampa limitada, y puede quedar algo por debajo de ella)
  { const dH = (D, x, z) => { let bd = 1e9, h = 0; const p = D.p; for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, t = cl(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dd = Math.hypot(x - ax - ex * t, z - az - ez * t); if (dd < bd) { bd = dd; h = D.h[k / 2] + (D.h[k / 2 + 1] - D.h[k / 2]) * t; } } return h; };
    tieN.forEach(q => { if (q[1].w.deck) H[q[0]] = dH(q[1].w.deck, q[2], q[3]); });
    tieB.forEach(q => { const id = q[0], P = q[1].w.deck; if (!P) return; const child = br.find(o => o.v[0] === id || o.v[1] === id), D = child && child.w.deck; if (!D) return; const x = NX[id], z = NZ[id], tg = dH(P, x, z), n = D.h.length, atStart = Math.hypot(D.p[0] - x, D.p[1] - z) < Math.hypot(D.p[n * 2 - 2] - x, D.p[n * 2 - 1] - z), e = atStart ? 0 : n - 1, dl = tg - D.h[e];
      let acc = 0; for (let i = 0; i < n; i++) { const k = atStart ? i : n - 1 - i; if (i) acc += Math.hypot(D.p[k * 2] - D.p[(atStart ? k - 1 : k + 1) * 2], D.p[k * 2 + 1] - D.p[(atStart ? k - 1 : k + 1) * 2 + 1]); const w = 1 - smooth(acc / 30); if (w <= 0) break; D.h[k] += dl * w; } H[id] = tg; }); }
  // --- firme exacto: dentro de cada calle el suelo es el perfil de la calle (liso a lo largo, a nivel a lo ancho), no la malla de 5 m.
  // Cada vía guarda su perfil y una rejilla dice qué tramos pasan cerca de cada punto
  { const PW = T.pw = [], PG = T.pg = new Map();
    W.forEach(o => { if (o.bridge || o.w.ghost || !o.w.flat) return; const n = o.v.length, e = { x: Float32Array.from(o.x), z: Float32Array.from(o.z), h: new Float32Array(n), s: new Float32Array(n), hw: o.w.hw, car: o.w.car ? 1 : 0 }; for (let k = 0; k < n; k++) { e.h[k] = H[o.v[k]]; if (k) e.s[k] = e.s[k - 1] + (Math.hypot(o.x[k] - o.x[k - 1], o.z[k] - o.z[k - 1]) || .01); } const wi = PW.length; PW.push(e);
      for (let k = 0; k + 1 < n; k++) { const R = e.hw + PMG, x0 = Math.min(e.x[k], e.x[k + 1]) - R, x1 = Math.max(e.x[k], e.x[k + 1]) + R, z0 = Math.min(e.z[k], e.z[k + 1]) - R, z1 = Math.max(e.z[k], e.z[k + 1]) + R; for (let i = Math.floor(x0 / PC); i <= Math.floor(x1 / PC); i++) for (let j = Math.floor(z0 / PC); j <= Math.floor(z1 / PC); j++) { const kk = i * 100003 + j; let l = PG.get(kk); if (!l) PG.set(kk, l = []); l.push(wi, k); } } });
    PG.forEach((l, kk) => PG.set(kk, Int32Array.from(l))); pBest = new Float32Array(PW.length); pSeg = new Int32Array(PW.length); pT = new Float32Array(PW.length); pRaw = new Float32Array(PW.length); pStamp = new Int32Array(PW.length); }
  // --- nivelado: cada nudo de la malla cerca de una vía toma la altura del perfil; a partir de 4 m del borde se funde con el terreno
  const sumW = new Float32Array(N), sumH = new Float32Array(N), dmin = new Float32Array(N).fill(1e9), tr = new Uint8Array(N);
  const cd = T.cd = 2.5, cnx = T.cnx = Math.round((T.x1 - T.x0) / cd) + 1, cnz = T.cnz = Math.round((T.z1 - T.z0) / cd) + 1, cov = T.cov = new Uint8Array(cnx * cnz);
  const stampCov = (x, z, r) => { const i0 = Math.max(0, Math.ceil((x - r - T.x0) / cd)), i1 = Math.min(cnx - 1, Math.floor((x + r - T.x0) / cd)), j0 = Math.max(0, Math.ceil((z - r - T.z0) / cd)), j1 = Math.min(cnz - 1, Math.floor((z + r - T.z0) / cd)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = T.x0 + i * cd - x, dz = T.z0 + j * cd - z; if (dx * dx + dz * dz <= r * r) cov[j * cnx + i] = 1; } };
  const stampTr = (x, z, r) => { const i0 = Math.max(0, Math.ceil((x - r - T.x0) / d)), i1 = Math.min(nx - 1, Math.floor((x + r - T.x0) / d)), j0 = Math.max(0, Math.ceil((z - r - T.z0) / d)), j1 = Math.min(nz - 1, Math.floor((z + r - T.z0) / d)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = T.x0 + i * d - x, dz = T.z0 + j * d - z; if (dx * dx + dz * dz <= r * r) tr[j * nx + i] = 1; } };
  W.forEach(o => { if (o.bridge || o.w.ghost) return; const w = o.w, hw = w.hw, R = hw + 14;
    for (let k = 0; k + 1 < o.v.length; k++) { const ax = o.x[k], az = o.z[k], bx = o.x[k + 1], bz = o.z[k + 1], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / 2.5));
      for (let q = k ? 1 : 0; q <= m; q++) { const f = q / m, x = ax + (bx - ax) * f, z = az + (bz - az) * f, ph = H[o.v[k]] + (H[o.v[k + 1]] - H[o.v[k]]) * f; if (x < T.x0 - R || x > T.x1 + R || z < T.z0 - R || z > T.z1 + R) continue;
        stampCov(x, z, hw + .35); stampTr(x, z, hw + 7.2); if (!w.flat) continue;
        const i0 = Math.max(0, Math.ceil((x - R - T.x0) / d)), i1 = Math.min(nx - 1, Math.floor((x + R - T.x0) / d)), j0 = Math.max(0, Math.ceil((z - R - T.z0) / d)), j1 = Math.min(nz - 1, Math.floor((z + R - T.z0) / d));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = T.x0 + i * d - x, dz = T.z0 + j * d - z, dd = Math.max(0, Math.sqrt(dx * dx + dz * dz) - hw); if (dd > 14) continue; const n = j * nx + i, wt = 1 / (dd * dd + .06); sumW[n] += wt; sumH[n] += wt * ph; if (dd < dmin[n]) dmin[n] = dd; } } } });
  for (let n = 0; n < N; n++) if (dmin[n] < 14) hG[n] += (sumH[n] / sumW[n] - hG[n]) * (1 - smooth((dmin[n] - 4) / 10));
  // bajo los tableros de los puentes el terreno no asoma: se rebaja hasta dejar un hueco (que crece desde cero en los estribos)
  T.decks.forEach(D => { const p = D.p, hw = D.hw, R = hw + 9; let acc = 0;
    for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / 2.5));
      for (let q = 0; q <= m; q++) { const f = q / m, x = ax + (bx - ax) * f, z = az + (bz - az) * f, s0 = acc + l * f, e = Math.min(D.a0 ? s0 : 1e9, D.a1 ? D.len - s0 : 1e9), top = D.h[k / 2] + (D.h[k / 2 + 1] - D.h[k / 2]) * f - Math.min(.8, Math.max(0, e - 7) * .16);      // junto al estribo no se rebaja nada: ahí llega la calle
        stampTr(x, z, hw + 7.2);
        const i0 = Math.max(0, Math.ceil((x - R - T.x0) / d)), i1 = Math.min(nx - 1, Math.floor((x + R - T.x0) / d)), j0 = Math.max(0, Math.ceil((z - R - T.z0) / d)), j1 = Math.min(nz - 1, Math.floor((z + R - T.z0) / d));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = T.x0 + i * d - x, dz = T.z0 + j * d - z, dd = Math.max(0, Math.sqrt(dx * dx + dz * dz) - hw - 1.5); if (dd > 7.5) continue; const n = j * nx + i, lim = top + dd * .7; if (dmin[n] > .5 && hG[n] > lim) hG[n] = lim; } }
      acc += l; } });
  // bocas de los túneles del tren: si el monte sube de verdad por encima de la vía, tras la boca el terreno se levanta pronto (un frente) para tapar el tren
  T.mouths = []; W.forEach(o => { if (!o.w.ghost) return; const v = o.v, n = v.length; if (n < 3) return; let L = 0; const S = [0]; for (let k = 1; k < n; k++) { L += Math.hypot(o.x[k] - o.x[k - 1], o.z[k] - o.z[k - 1]); S.push(L); } if (L < 30) return;
    let cover = 0; for (let k = 0; k < n; k++) if (S[k] > 12 && S[k] < L - 12) cover = Math.max(cover, nat(o.x[k], o.z[k]) - H[v[k]]); if (cover < 4.5) return;
    for (const end of [0, 1]) { const i0 = end ? n - 1 : 0, dir = end ? -1 : 1, i1 = i0 + dir, ux = (o.x[i1] - o.x[i0]) / (Math.hypot(o.x[i1] - o.x[i0], o.z[i1] - o.z[i0]) || 1), uz = (o.z[i1] - o.z[i0]) / (Math.hypot(o.x[i1] - o.x[i0], o.z[i1] - o.z[i0]) || 1);
      T.mouths.push({ x: o.x[i0], z: o.z[i0], ux, uz, y: H[v[i0]] }); } });
  // (delante de otra boca vecina no se levanta nada: las vías dobles no siempre entran a la par)
  const inFront = (gx, gz, self) => { for (const q of T.mouths) { if (q === self) continue; const ax = gx - q.x, az = gz - q.z, al = ax * q.ux + az * q.uz; if (al < 1.5 && al > -30 && Math.abs(-ax * q.uz + az * q.ux) < 6.5) return true; } return false; };
  T.mouths.forEach(self => { const R = 12, x0 = self.x, z0 = self.z, ux = self.ux, uz = self.uz, cx = x0 + ux * 9, cz = z0 + uz * 9, RR = 22;
    const a0 = Math.max(0, Math.ceil((cx - RR - T.x0) / d)), a1 = Math.min(nx - 1, Math.floor((cx + RR - T.x0) / d)), b0 = Math.max(0, Math.ceil((cz - RR - T.z0) / d)), b1 = Math.min(nz - 1, Math.floor((cz + RR - T.z0) / d));
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) { const gx = T.x0 + i * d, gz = T.z0 + j * d, al = (gx - x0) * ux + (gz - z0) * uz, lat = Math.abs(-(gx - x0) * uz + (gz - z0) * ux), nn = j * nx + i; if (al < 3 || al > 20 || lat > R || dmin[nn] < 1 || inFront(gx, gz, self)) continue;
      const lim = self.y + 6.4 * smooth((al - 3.5) / 4.5) - Math.max(0, lat - 5.5) * .9 - Math.max(0, al - 14) * .9; if (hG[nn] < lim) hG[nn] = lim; } });
  // estribos: los últimos metros de la calle que llega a un puente mandan sobre lo que pase por debajo (una vía, otra calle), para que la calle llegue al tablero a su altura
  { const anch = new Set(); chains.forEach(c => { [c.A, c.B].forEach(id => { if (cnt[id]) anch.add(id); }); c.slaves.forEach(q => anch.add(q[0])); });
    W.forEach(o => { if (o.bridge || !o.w.flat) return; const v = o.v; for (let i = 0; i < v.length; i++) { if (!anch.has(v[i])) continue;
      for (const dir of [-1, 1]) { if (i + dir < 0 || i + dir >= v.length) continue; let acc = 0; const ex0 = o.x[i + dir] - o.x[i], ez0 = o.z[i + dir] - o.z[i], el0 = Math.hypot(ex0, ez0) || 1, ux0 = ex0 / el0, uz0 = ez0 / el0, x00 = o.x[i], z00 = o.z[i];      // (solo del estribo hacia atrás: lo que cruza por debajo, más allá, conserva su sitio)
        for (let k = i; k + dir >= 0 && k + dir < v.length && acc < 9; k += dir) { const ax = o.x[k], az = o.z[k], bx = o.x[k + dir], bz = o.z[k + dir], l = Math.hypot(bx - ax, bz - az) || .01, m = Math.max(1, Math.ceil(l / 1.5));
        for (let q = 0; q <= m; q++) { const f = q / m, x = ax + (bx - ax) * f, z = az + (bz - az) * f, ds = acc + l * f; if (ds > 9) break; const ph = H[v[k]] + (H[v[k + dir]] - H[v[k]]) * f, wt = 1 - smooth((ds - 5) / 4), R = o.w.hw + 1.5;
          const i0 = Math.max(0, Math.ceil((x - R - T.x0) / d)), i1 = Math.min(nx - 1, Math.floor((x + R - T.x0) / d)), j0 = Math.max(0, Math.ceil((z - R - T.z0) / d)), j1 = Math.min(nz - 1, Math.floor((z + R - T.z0) / d));
          for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const gx = T.x0 + ii * d, gz = T.z0 + j * d, dx = gx - x, dz = gz - z; if (dx * dx + dz * dz > R * R || (gx - x00) * ux0 + (gz - z00) * uz0 < .5) continue; const n = j * nx + ii; hG[n] += (ph - hG[n]) * wt; } }
        acc += l; } } } }); }
  // zócalos alrededor de los edificios de viviendas: suelo pavimentado, también por encima del terreno
  (aprons || []).forEach(p => { const n = p.length / 2; for (let k = 0; k < n; k++) { const j = (k + 1) % n, ax = p[k * 2], az = p[k * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / 2)); for (let q = 0; q <= m; q++) { const x = ax + (bx - ax) * q / m, z = az + (bz - az) * q / m; stampCov(x, z, 3.3); stampTr(x, z, 10.5); } } });

  // --- agua: cada lámina a su nivel (el más bajo de su orilla); el fondo de la malla es la propia lámina
  const WX = [];
  // el agua que toca el borde del mapa sigue más allá (como la lámina que se alarga hasta el horizonte): su lecho también, o asoma el relieve del margen como una rampa de agua
  const extW = p0 => waterExt(M, p0);
  T.level = (M.water || []).map(p0 => { const hs = []; for (let k = 0; k < p0.length; k += 2) if (inRaster(p0[k], p0[k + 1])) hs.push(base0(p0[k], p0[k + 1])); hs.sort((a, b) => a - b); let lv = hs.length ? Math.max(0, hs[Math.floor(hs.length * .15)]) : 0; const p = extW(p0).p;
    // una calzada (sin puente) que cruza el agua manda: la lámina queda por debajo de ella, o la taparía (canales y dársenas bajo una calle)
    { const bx = bboxP(p0); let m = 1e9; W.forEach(o => { if (o.bridge || !o.w.car || (o.w.r && o.w.r.u)) return; for (let k = 0; k < o.v.length; k++) { const x = o.x[k], z = o.z[k]; if (x > bx[0] && x < bx[2] && z > bx[1] && z < bx[3] && pipP(p0, x, z)) m = Math.min(m, H[o.v[k]]); } }); if (m < lv + .6) { (T.wcapL || (T.wcapL = [])).push(['calle', Math.round(bx[0]), Math.round(bx[1]), +lv.toFixed(1), +(m - .6).toFixed(1)]); lv = Math.max(-.5, m - .6); T.wcap = (T.wcap || 0) + 1; }
      // y un puente que pasa por encima del agua (o por su borde, como el de la boca de una dársena): el agua, al menos 1,2 m por debajo de sus estribos
      const dSeg = (x, z) => { let d = 1e9; for (let i = 0, j = p0.length - 2; i < p0.length; j = i, i += 2) { const ax = p0[j], az = p0[j + 1], ex = p0[i] - ax, ez = p0[i + 1] - az, t = cl(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1); d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t)); } return d; };
      let mb = 1e9; W.forEach(o => { if (!o.bridge || o.v.length < 2) return; const n2 = o.v.length - 1, mx = (NX[o.v[0]] + NX[o.v[n2]]) / 2, mz = (NZ[o.v[0]] + NZ[o.v[n2]]) / 2; if (mx < bx[0] - 20 || mx > bx[2] + 20 || mz < bx[1] - 20 || mz > bx[3] + 20) return; if (pipP(p0, mx, mz) || dSeg(mx, mz) < 12) mb = Math.min(mb, H[o.v[0]], H[o.v[n2]]); });
      if (mb < lv + 1.2) { (T.wcapL || (T.wcapL = [])).push(['puente', Math.round(bx[0]), Math.round(bx[1]), +lv.toFixed(1), +(mb - 1.2).toFixed(1)]); lv = Math.max(-.5, mb - 1.2); T.wcap = (T.wcap || 0) + 1; } }
    let a = 1e9, b = 1e9, c = -1e9, e = -1e9; for (let k = 0; k < p.length; k += 2) { a = Math.min(a, p[k]); c = Math.max(c, p[k]); b = Math.min(b, p[k + 1]); e = Math.max(e, p[k + 1]); }
    const i0 = Math.max(0, Math.ceil((a - T.x0) / d)), i1 = Math.min(nx - 1, Math.floor((c - T.x0) / d)), j0 = Math.max(0, Math.ceil((b - T.z0) / d)), j1 = Math.min(nz - 1, Math.floor((e - T.z0) / d));
    for (let j = j0; j <= j1; j++) { const z = T.z0 + j * d, xs = []; for (let k = 0, n = p.length / 2, q = n - 1; k < n; q = k++) { const zi = p[k * 2 + 1], zj = p[q * 2 + 1]; if ((zi > z) !== (zj > z)) xs.push((p[q * 2] - p[k * 2]) * (z - zi) / (zj - zi) + p[k * 2]); } xs.sort((u, v) => u - v);
      for (let s = 0; s + 1 < xs.length; s += 2) for (let i = Math.max(i0, Math.ceil((xs[s] - T.x0) / d)); i <= i1 && T.x0 + i * d <= xs[s + 1]; i++) { const n = j * nx + i; if (dmin[n] > 2) { hG[n] = lv - 1.4; tr[n] = 0; } } }      /* el lecho, por debajo de la lámina (la lámina se dibuja plana aparte) */
    WX.push([p, lv]); return lv; });
  // fuera de la malla fina (rejilla gruesa de 80 m) el lecho también se hunde, y la franja de enlace se rehace para que no queden grietas
  if (WX.length) { const S = T.S, old = Float32Array.from(S.h), pip = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
    let ch = 0; for (let j = 0; j < S.nz; j++) for (let i = 0; i < S.nx; i++) { const x = S.x0 + i * S.d, z = S.z0 + j * S.d; if (x > T.x0 + 60 && x < T.x1 - 60 && z > T.z0 + 60 && z < T.z1 - 60) continue; for (const w of WX) if (pip(w[0], x, z)) { const q = j * S.nx + i, v = Math.min(S.h[q], w[1] - 1.4); if (v < S.h[q]) { S.h[q] = v; ch++; } break; } }
    if (ch) for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++, k++) { const x = T.x0 + i * d, z = T.z0 + j * d, e = Math.min(x - T.x0, T.x1 - x, z - T.z0, z - T.z0 < 0 ? 0 : T.z1 - z); if (e >= 60) continue; const sn = pl(S, S.h, x, z), so = pl(S, old, x, z); if (e < 2.5) hG[k] = sn; else if (Math.abs(sn - so) > .01) hG[k] = Math.min(hG[k], hG[k] + (sn - so) * (1 - smooth(e / 60))); }
    T.wetS = ch; }
  // la malla bajo el firme va algo más baja que él (zanja) para que nunca asome; donde el suelo hace un pliegue brusco, más honda
  const hM = T.hM = new Float32Array(N); for (let j = 0, n = 0; j < nz; j++) for (let i = 0; i < nx; i++, n++) { if (!tr[n]) { hM[n] = hG[n]; continue; } let c = 0; if (dmin[n] < 1 && i > 0 && j > 0 && i < nx - 1 && j < nz - 1) { const h = hG[n]; c = Math.max(Math.abs((hG[n - 1] + hG[n + 1]) / 2 - h), Math.abs((hG[n - nx] + hG[n + nx]) / 2 - h), Math.abs((hG[n - nx - 1] + hG[n + nx + 1]) / 2 - h), Math.abs((hG[n - nx + 1] + hG[n + nx - 1]) / 2 - h)); } hM[n] = hG[n] - TRENCH - Math.min(1.5, c * 1.3); }
  { let big = 0; for (let n = 0; n < N; n++) if (hG[n] - hM[n] > .45) big++; T.deep = big; }
  T.on = true;
  // la malla nunca asoma por encima del firme: donde su plano queda por encima del perfil exacto de una calle, baja lo justo
  { let fix = 0; for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) { if (!cov[j * cnx + i]) continue; const x = T.x0 + i * cd, z = T.z0 + j * cd; if (x >= T.x1 - .01 || z >= T.z1 - .01) continue; const a = gY(x, z) - .1, fx = (x - T.x0) / d, fz = (z - T.z0) / d, ii = Math.min(nx - 2, Math.floor(fx)), jj = Math.min(nz - 2, Math.floor(fz)), tx = fx - ii, tz = fz - jj, k = jj * nx + ii;
      let n1, b0, b1, b2; const n2 = k + nx + 1; if (tx > tz) { n1 = k + 1; b0 = 1 - tx; b1 = tx - tz; b2 = tz; } else { n1 = k + nx; b0 = 1 - tz; b1 = tz - tx; b2 = tx; }
      const e = hM[k] * b0 + hM[n1] * b1 + hM[n2] * b2 - a; if (e <= 0) continue; const q = e / (b0 * b0 + b1 * b1 + b2 * b2); hM[k] -= q * b0; hM[n1] -= q * b1; hM[n2] -= q * b2; fix++; } T.meshFix = fix; }
  T.ms = Date.now() - t0; T.ways = W.length; T.nodes = H.length;
}
// normal del terreno en un punto (para sombrear calles y aceras como el suelo que pisan)
export function normalAt(x, z, out) { const g = slopeAt(x, z, 2.5), l = Math.hypot(g[0], 1, g[1]); out[0] = -g[0] / l; out[1] = 1 / l; out[2] = -g[1] / l; return out; }
