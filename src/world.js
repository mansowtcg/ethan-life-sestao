// world.js: construye el mundo 3D a partir del mapa (map.js) y responde a las consultas de colisión.
// El mapa sale de tools/osm2map.js (datos de OpenStreetMap). Lo que no está en el mapa (la ampliación
// del polígono) se añade aquí y es inventado.
import * as THREE from 'three';
import { Vox, mat } from './vox.js';
import { rng, shade, clamp } from './util.js';
import { T, initTerrain, gY, mY, normalAt, standY, slopeAt, RISE, waterExt } from './terrain.js';

// tipo de vía (etiqueta highway de OpenStreetMap) -> [ancho por defecto, velocidad m/s, acera, apta para coches]
export const ROAD = {
  motorway: [15, 27, 0, 1], trunk: [12, 20, 0, 1], primary: [11, 13.5, 1, 1], secondary: [9, 12.5, 1, 1], tertiary: [8, 11.5, 1, 1],
  residential: [6.5, 9, 1, 1], unclassified: [6.5, 9, 1, 1], living_street: [5.5, 5.5, 1, 1], service: [4.5, 5.5, 0, 1], track: [3, 4, 0, 1],
  motorway_link: [7, 15, 0, 1], trunk_link: [7, 13, 0, 1], primary_link: [6.5, 11, 0, 1], secondary_link: [6, 10, 0, 1], tertiary_link: [6, 9, 0, 1],
  pedestrian: [5, 0, 0, 0], footway: [2.4, 0, 0, 0], path: [2, 0, 0, 0], steps: [2.4, 0, 0, 0], cycleway: [2.4, 0, 0, 0]
};
export const roadW = r => r.w || (ROAD[r.t] || ROAD.residential)[0];
export const SW = 2.2;       // ancho de acera a cada lado

export const W = { map: null, group: null, bounds: null, ext: [], junc: [], jgrid: new Map(), segs: [], grid: new Map(), props: [], pgrid: new Map(), water: [], night: 0, mats: {}, anchors: {}, bld: [], bgrid: new Map(), rsegs: [], rgrid: new Map(), lods: [], knock: [], segY: {}, railDeck: [], towers: [] };
const CELL = 20, key = (cx, cz) => cx * 100003 + cz;

// ---------- geometría a mano
const _col = new THREE.Color(), _cc = new Map();
export function lin(hex) { let c = _cc.get(hex); if (!c) { _col.setHex(hex); c = [_col.r, _col.g, _col.b]; _cc.set(hex, c); } return c; }
export class Geo {
  // uv: con coordenadas de textura; k: si se da, la textura sale de la posición (x·k, z·k), para suelos
  constructor(uv, k) { this.p = []; this.n = []; this.c = []; this.u = uv ? [] : null; this.k = k || 0; this.i = []; this.nv = 0; }
  v(x, y, z, nx, ny, nz, col, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); if (this.u) { if (u === undefined) this.u.push(x * this.k, z * this.k); else this.u.push(u, v); } return this.nv++; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  // rectángulo vertical entre dos puntos del suelo, de y0 a y1, mirando hacia (nx, nz)
  wall(ax, az, bx, bz, y0, y1, nx, nz, col, u0, v0, u1, v1) { this.quad(this.v(bx, y0, bz, nx, 0, nz, col, u1, v0), this.v(ax, y0, az, nx, 0, nz, col, u0, v0), this.v(ax, y1, az, nx, 0, nz, col, u0, v1), this.v(bx, y1, bz, nx, 0, nz, col, u1, v1)); }
  add(vox) { const g = vox.geometry(), pa = g.attributes.position.array, na = g.attributes.normal.array, ca = g.attributes.color.array, base = this.nv; for (let i = 0; i < pa.length; i += 3) this.v(pa[i], pa[i + 1], pa[i + 2], na[i], na[i + 1], na[i + 2], [ca[i], ca[i + 1], ca[i + 2]], 0, 0); const ia = g.index.array; for (let i = 0; i < ia.length; i++) this.i.push(base + ia[i]); g.dispose(); }
  build() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); if (this.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setIndex(this.i); this.p = this.n = this.c = this.u = this.i = null; return g;
  }
}
// cinta plana a lo largo de una polilínea [x,z,...], con ingletes en las curvas
let nBay = 0;
let ribDense = false;      // sobre un tablero de puente la cinta no se aligera: la altura no sale del suelo
export function ribbon(g, p, w, y, hex, off) {
  const src = p; p = densify(p, T.on ? 4 : 60); const n = p.length / 2, h = w / 2, col = lin(hex); let S = T.on && w > 4.4 ? Math.ceil(w / 3.3) : 1, pl, pr, prow; off = off || 0;
  // estaciones: centro y dirección transversal de cada una
  const X = new Float32Array(n), Z = new Float32Array(n), NXm = new Float32Array(n), NZm = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const x = p[k * 2], z = p[k * 2 + 1]; let ax = 0, az = 0, bx = 0, bz = 0;
    if (k > 0) { ax = x - p[k * 2 - 2]; az = z - p[k * 2 - 1]; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; }
    if (k < n - 1) { bx = p[k * 2 + 2] - x; bz = p[k * 2 + 3] - z; const l = Math.hypot(bx, bz) || 1; bx /= l; bz /= l; }
    if (k === 0) { ax = bx; az = bz; } if (k === n - 1) { bx = ax; bz = az; }
    let nx = -(az + bz), nz = ax + bx; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const m = 1 / Math.max(.45, nx * -az + nz * ax); X[k] = x + nx * off * m; Z[k] = z + nz * off * m; NXm[k] = nx * h * m; NZm[k] = nz * h * m;
  }
  let keep = null;
  if (T.on && !ribDense && n > 2) {
    // con relieve la cinta va cada 4 m, pero donde el suelo es un plano sobran estaciones (y tiras a lo ancho): se quitan las que no cambian nada
    const C = S + 1, Hh = new Float32Array(n * C); let cross = false;
    for (let k = 0; k < n; k++) { for (let q = 0; q < C; q++) { const f = 1 - 2 * q / S; Hh[k * C + q] = gY(X[k] + NXm[k] * f, Z[k] + NZm[k] * f); } if (S > 1 && !cross) for (let q = 1; q < S; q++) if (Math.abs(Hh[k * C + q] - (Hh[k * C] + (Hh[k * C + S] - Hh[k * C]) * q / S)) > .045) { cross = true; break; } }
    // vértices del trazado original: se quedan siempre
    const orig = new Uint8Array(n); { let j = 0; for (let k = 0; k < n; k++) if (j < src.length / 2 && Math.abs(p[k * 2] - src[j * 2]) < 1e-6 && Math.abs(p[k * 2 + 1] - src[j * 2 + 1]) < 1e-6) { orig[k] = 1; j++; } orig[0] = orig[n - 1] = 1; }
    keep = [0]; let i = 0;
    while (i < n - 1) { let j = i + 1; while (j < n - 1 && !orig[j] && j - i < 8) { const j2 = j + 1; let ok = true; for (let m = i + 1; m <= j && ok; m++) { const t = (m - i) / (j2 - i); for (let q = 0; q < C; q++) if (Math.abs(Hh[m * C + q] - (Hh[i * C + q] + (Hh[j2 * C + q] - Hh[i * C + q]) * t)) > .045) { ok = false; break; } } if (!ok) break; j = j2; } keep.push(j); i = j; }
    if (S > 1 && !cross) S = 1;
  }
  const N = keep ? keep.length : n;
  for (let kk = 0; kk < N; kk++) { const k = keep ? keep[kk] : kk, cx = X[k], cz = Z[k], ox = NXm[k], oz = NZm[k];
    if (S > 1) { // con relieve, las calzadas anchas se parten también a lo ancho para ceñirse al suelo
      const row = []; for (let q = 0; q <= S; q++) { const f = 1 - 2 * q / S; row.push(g.v(cx + ox * f, y, cz + oz * f, 0, 1, 0, col)); }
      if (kk > 0) for (let q = 0; q < S; q++) g.quad(prow[q], row[q], row[q + 1], prow[q + 1]); prow = row; continue; }
    const L = g.v(cx + ox, y, cz + oz, 0, 1, 0, col), R = g.v(cx - ox, y, cz - oz, 0, 1, 0, col);
    if (kk > 0) g.quad(pl, L, R, pr); pl = L; pr = R;
  }
}
export function dashes(g, p, y, hex, len, gap, wd, start) {
  const col = lin(hex); let carry = start === undefined ? 2 : start;
  for (let k = 0; k + 3 < p.length; k += 2) {
    const dx = p[k + 2] - p[k], dz = p[k + 3] - p[k + 1], l = Math.hypot(dx, dz); if (l < .01) continue; const ux = dx / l, uz = dz / l, nx = -uz * wd / 2, nz = ux * wd / 2; let s = carry;
    while (s < l) { const e = Math.min(l, s + len), x0 = p[k] + ux * s, z0 = p[k + 1] + uz * s, x1 = p[k] + ux * e, z1 = p[k + 1] + uz * e;
      g.quad(g.v(x0 + nx, y, z0 + nz, 0, 1, 0, col), g.v(x1 + nx, y, z1 + nz, 0, 1, 0, col), g.v(x1 - nx, y, z1 - nz, 0, 1, 0, col), g.v(x0 - nx, y, z0 - nz, 0, 1, 0, col)); s += len + gap; }
    carry = s - l;
  }
}
// polígono plano mirando hacia arriba
export function polyFlat(g, p, y, hex) {
  const n = p.length / 2, col = lin(hex), pts = []; for (let k = 0; k < n; k++) pts.push(new THREE.Vector2(p[k * 2], p[k * 2 + 1]));
  if (pts.length > 3 && pts[0].equals(pts[pts.length - 1])) pts.pop(); if (pts.length < 3) return;
  const base = g.nv; pts.forEach(q => g.v(q.x, y, q.y, 0, 1, 0, col));
  THREE.ShapeUtils.triangulateShape(pts, []).forEach(t => { const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]], up = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y); if (up >= 0) g.i.push(base + t[0], base + t[1], base + t[2]); else g.i.push(base + t[0], base + t[2], base + t[1]); });
}
// igual, pero troceado en celdas: los triángulos enormes pierden precisión de profundidad
function clipAxis(pts, axis, lim, keepLess) { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = keepLess ? a[axis] <= lim : a[axis] >= lim, ib = keepLess ? b[axis] <= lim : b[axis] >= lim; if (ia) out.push(a); if (ia !== ib) { const t = (lim - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; }
export function polyTiled(g, p, y, hex, step) {
  const b = bboxOf(p); if (b[2] - b[0] <= step * 1.5 && b[3] - b[1] <= step * 1.5) return polyFlat(g, p, y, hex);
  const pts = []; for (let k = 0; k < p.length; k += 2) pts.push([p[k], p[k + 1]]);
  for (let x = Math.floor(b[0] / step) * step; x < b[2]; x += step) { const col = clipAxis(clipAxis(pts, 0, x, false), 0, x + step, true); if (col.length < 3) continue;
    for (let z = Math.floor(b[1] / step) * step; z < b[3]; z += step) { const cell = clipAxis(clipAxis(col, 1, z, false), 1, z + step, true); if (cell.length < 3) continue; const f = []; cell.forEach(q => f.push(q[0], q[1])); polyFlat(g, f, y, hex); } }
}
// parte los tramos largos de una polilínea
function densify(p, max) { const o = [p[0], p[1]]; for (let k = 2; k < p.length; k += 2) { const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az, n = Math.ceil(Math.hypot(dx, dz) / max); for (let i = 1; i <= n; i++) o.push(ax + dx * i / n, az + dz * i / n); } return o; }
export function offsetLine(p, off) { const o = []; for (let k = 0; k < p.length; k += 2) { const a = k > 0 ? k - 2 : k, b = k + 2 < p.length ? k + 2 : k; let dx = p[b] - p[a], dz = p[b + 1] - p[a + 1]; const l = Math.hypot(dx, dz) || 1; o.push(p[k] - dz / l * off, p[k + 1] + dx / l * off); } return o; }
export function bboxOf(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let k = 0; k < p.length; k += 2) { a = Math.min(a, p[k]); c = Math.max(c, p[k]); b = Math.min(b, p[k + 1]); d = Math.max(d, p[k + 1]); } return [a, b, c, d]; }
export function canvasTex(w, h, draw, opt) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = (opt && opt.aniso) || 4; return t; }

// ---------- texturas hechas en un canvas
// suelos: casi blancas, para que el color lo ponga la malla y la textura solo dé grano
function groundTextures() {
  const r = rng(31), noise = (g, w, h, n, a, sz) => { for (let i = 0; i < n; i++) { const v = r() < .5 ? 0 : 255; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (r() * a).toFixed(3) + ')'; const s = 1 + r() * sz; g.fillRect(r() * w, r() * h, s, s); } };
  const grain = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h); noise(g, w, h, 5200, .1, .8); });
  const soft = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h); noise(g, w, h, 90, .035, 22); noise(g, w, h, 3600, .05, .8); });
  const turf = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#eeeeee'; g.fillRect(0, 0, w, h); noise(g, w, h, 240, .1, 16); noise(g, w, h, 2400, .2, 2); });
  const tile = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f3f3f3'; g.fillRect(0, 0, w, h); noise(g, w, h, 900, .07, 3); g.fillStyle = 'rgba(0,0,0,.2)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 32, 0, 1.4, h); g.fillRect(0, i * 32, w, 1.4); } });
  const wave = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, w, h); for (let i = 0; i < 46; i++) { const x = r() * w, y = r() * h, l = 10 + r() * 26; g.fillStyle = r() < .5 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.13)'; for (let d = -1; d <= 1; d++) g.fillRect(x + d * w, y, l, 1.5); } });
  return { grain, soft, turf, tile, wave };
}
// fachadas: una columna de ventana por celda (64 px = unos 3 m) y cuatro plantas de alto. Varias celdas por estilo, con distintas ventanas encendidas de noche.
const LITP = [[1, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]], NCELL = 16;
function facadeTextures() {
  const cellStyle = c => (c < 12 ? c >> 2 : c < 14 ? 3 : 4), cellLit = c => (c < 12 ? LITP[c & 3] : c === 12 ? [1, 0, 1, 0] : c === 13 ? [0, 1, 0, 0] : [0, 0, 0, 0]);
  const win = (g, st, x, y, lit, on) => {
    const glass = (a, b, w, h) => { if (lit) { if (on) { g.fillStyle = '#ffd98a'; g.fillRect(a, b, w, h); g.fillStyle = '#ffeec0'; g.fillRect(a + 2, b + 2, w - 4, h * .4); } return; } g.fillStyle = '#2f3c4a'; g.fillRect(a, b, w, h); g.fillStyle = '#4b6078'; g.fillRect(a, b, w, h * .34); };
    if (st === 4) return;
    if (!lit) { g.fillStyle = '#e6e2d8'; g.fillRect(x, y + 61, 64, 3); }
    if (st === 0) { if (!lit) { g.fillStyle = '#d5d0c4'; g.fillRect(x + 16, y + 8, 32, 48); } glass(x + 19, y + 11, 26, 43); if (!lit) { g.fillStyle = '#d5d0c4'; g.fillRect(x + 31, y + 11, 2, 43); g.fillStyle = '#8d8a82'; g.fillRect(x + 8, y + 54, 48, 4); g.fillStyle = '#2b2f35'; g.fillRect(x + 8, y + 36, 48, 2); for (let i = 0; i < 12; i++) g.fillRect(x + 9 + i * 4.2, y + 36, 1.2, 18); } }
    else if (st === 1) { if (!lit) { g.fillStyle = '#cfcabd'; g.fillRect(x + 14, y + 10, 36, 40); } glass(x + 17, y + 16, 30, 31); if (!lit) { g.fillStyle = '#cfcabd'; g.fillRect(x + 31, y + 16, 2, 31); g.fillStyle = '#b3ad9f'; g.fillRect(x + 11, y + 49, 42, 4); } }
    else if (st === 2) { if (!lit) { g.fillStyle = '#f4f1e8'; g.fillRect(x + 10, y + 5, 44, 54); g.fillStyle = '#c9c4b7'; g.fillRect(x + 10, y + 57, 44, 3); } for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) glass(x + 13 + i * 13.3, y + 8 + j * 16.3, 11.4, 14); }
    else { if (!lit) { g.fillStyle = '#bcc0c2'; g.fillRect(x + 3, y + 13, 58, 36); } glass(x + 5, y + 15, 54, 32); if (!lit) { g.fillStyle = '#bcc0c2'; g.fillRect(x + 22, y + 15, 2, 32); g.fillRect(x + 41, y + 15, 2, 32); } }
  };
  const mk = lit => canvasTex(64 * NCELL, 256, (g, w, h) => { g.fillStyle = lit ? '#000' : '#fff'; g.fillRect(0, 0, w, h); for (let c = 0; c < NCELL; c++) for (let f = 0; f < 4; f++) win(g, cellStyle(c), c * 64, f * 64, lit, cellLit(c)[f]); }, { aniso: 8 });
  // planta baja: 0 zócalo, 1 portal, 2 escaparate, 3 puerta de tienda, 4 persiana, 5 ventana con reja, 6 garaje, 7 liso
  const base = lit => canvasTex(512, 64, (g, w, h) => { g.fillStyle = lit ? '#000' : '#fff'; g.fillRect(0, 0, w, h);
    for (let c = 0; c < 8; c++) { const x = c * 64; if (!lit) { g.fillStyle = '#b9b4a9'; g.fillRect(x, 52, 64, 12); g.fillStyle = '#dedad0'; g.fillRect(x, 0, 64, 5); }
      if (c === 1) { if (lit) { g.fillStyle = '#ffd98a'; g.fillRect(x + 22, 13, 20, 8); } else { g.fillStyle = '#3b3027'; g.fillRect(x + 17, 9, 30, 55); g.fillStyle = '#5c4735'; g.fillRect(x + 20, 12, 24, 52); g.fillStyle = '#33414f'; g.fillRect(x + 22, 13, 20, 8); g.fillRect(x + 23, 26, 8, 22); g.fillRect(x + 33, 26, 8, 22); g.fillStyle = '#d8b24a'; g.fillRect(x + 31, 44, 2, 5); } }
      else if (c === 2) { if (lit) { g.fillStyle = '#ffe6a8'; g.fillRect(x + 4, 14, 56, 38); } else { g.fillStyle = '#3a3f46'; g.fillRect(x + 2, 12, 60, 42); g.fillStyle = '#2c3a48'; g.fillRect(x + 4, 14, 56, 38); g.fillStyle = '#48607a'; g.fillRect(x + 4, 14, 56, 9); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x + 12, 14, 7, 38); g.fillRect(x + 23, 14, 3, 38); } }
      else if (c === 3) { if (lit) { g.fillStyle = '#ffe6a8'; g.fillRect(x + 16, 13, 32, 49); } else { g.fillStyle = '#3a3f46'; g.fillRect(x + 13, 10, 38, 54); g.fillStyle = '#2c3a48'; g.fillRect(x + 16, 13, 32, 49); g.fillStyle = '#48607a'; g.fillRect(x + 16, 13, 32, 8); g.fillStyle = '#3a3f46'; g.fillRect(x + 31, 13, 2, 49); g.fillStyle = '#c9ccd0'; g.fillRect(x + 27, 36, 2, 9); g.fillRect(x + 35, 36, 2, 9); } }
      else if (c === 4) { if (!lit) { g.fillStyle = '#878d93'; g.fillRect(x + 5, 11, 54, 53); g.fillStyle = '#a3a9ae'; for (let i = 0; i < 12; i++) g.fillRect(x + 6, 13 + i * 4.3, 52, 2.2); } }
      else if (c === 5) { if (!lit) { g.fillStyle = '#cfcabd'; g.fillRect(x + 16, 16, 32, 32); g.fillStyle = '#2f3c4a'; g.fillRect(x + 19, 19, 26, 26); g.fillStyle = '#4b6078'; g.fillRect(x + 19, 19, 26, 8); g.fillStyle = '#23272c'; for (let i = 0; i < 6; i++) g.fillRect(x + 20 + i * 5, 19, 1.3, 26); g.fillRect(x + 19, 31, 26, 1.3); } }
      else if (c === 6) { if (!lit) { g.fillStyle = '#5f656b'; g.fillRect(x + 3, 12, 58, 52); g.fillStyle = '#737a81'; for (let i = 0; i < 5; i++) g.fillRect(x + 5, 14 + i * 10, 54, 8); } } } }, { aniso: 8 });
  return { win: mk(false), winLit: mk(true), base: base(false), baseLit: base(true) };
}
const FACADE = [0xe8dcc4, 0xd9c7a4, 0xcfb894, 0xb8674a, 0xa85a44, 0xe9e4d8, 0xd3d6d0, 0xb7c0c2, 0xdcbb8c, 0xc4785a, 0xc2ad92, 0xe6d3ac, 0xcf9a70, 0xdfe0d8, 0xb9785c, 0xe9cfa0];
const ROOF_T = [0x8a4a3a, 0x7d4436, 0x93523e, 0x9a5a44, 0xa05c40, 0x84503c, 0x733f33], ROOF_F = [0x6a6e74, 0x5c6066, 0x777b80, 0x8a8478, 0x8c5a4a, 0x9a958a], SHED = [0x9aa7ad, 0x8a98a4, 0xb0b6b2, 0x7d8a8c, 0xa8a090, 0x6f8296, 0xc2c4be, 0x93a0a0, 0x5f7f9a, 0x6f8f7a, 0xcfc9b8, 0x9a6a50],
  // fachadas de la Margen Izquierda: ladrillo caravista rojo y tostado, revocos crema, ocre y gris, y paneles claros en lo nuevo
  BRICK = [0xb0624a, 0xa85a44, 0xb8674a, 0x9c5642, 0xc4785a, 0xb9785c, 0xa96b4e, 0xbf8062, 0x96584a, 0xc98a68],
  RENDER = [0xe8dcc4, 0xe6d3ac, 0xdcc9a0, 0xe9e4d8, 0xd9d2c0, 0xe2c79a, 0xd8b98c, 0xe4c9b0, 0xd3d6d0, 0xc9d2c8, 0xdfe0d8, 0xe9cfa0, 0xd6c2a8, 0xcdb9a4, 0xd9c7a4, 0xe0d0b8],
  PANEL = [0xe9e9e4, 0xd9dcdc, 0xc8cdd0, 0xb9c2c6, 0xe2ded2], STONE = [0xc9b48f, 0xbfae90, 0xb7a98f, 0xcabfa6, 0xa9a08e], CONC = [0xb4b2aa, 0xa8a69e, 0xbcbab0], GLASS = [0x8fa6b4, 0x7f97a8, 0x9db3bd], WOOD = [0x9a7350, 0x8a6444],
  MATPAL = { b: BRICK, s: STONE, m: SHED, p: RENDER, c: CONC, g: GLASS, t: RENDER, w: WOOD }, BAND = [0x2a5bb8, 0xd0322e, 0xe0b23a, 0x3a8a5c, 0x55585e, 0xf2efe6];

// anillo metido hacia dentro (para tejados inclinados). Devuelve null si el edificio es demasiado estrecho o retorcido.
function insetRing(ring, d) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) { const p0 = ring[(i + n - 1) % n], p1 = ring[i], p2 = ring[(i + 1) % n]; let ax = p1[0] - p0[0], az = p1[1] - p0[1], bx = p2[0] - p1[0], bz = p2[1] - p1[1]; const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; ax /= la; az /= la; bx /= lb; bz /= lb;
    const n1x = -az, n1z = ax, n2x = -bz, n2z = bx; let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz); if (ml < 1e-3) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
    const k = Math.min(d / Math.max(.35, mx * n1x + mz * n1z), d * 2.4); out.push([p1[0] + mx * k, p1[1] + mz * k]); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, ex = ring[j][0] - ring[i][0], ez = ring[j][1] - ring[i][1], fx = out[j][0] - out[i][0], fz = out[j][1] - out[i][1]; if (ex * fx + ez * fz <= 0 && Math.hypot(ex, ez) > .6) return null; }
  return out;
}

function addBuilding(ch, b, idx, shops) {
  let p = b.p, n = p.length / 2; if (n > 3 && p[0] === p[n * 2 - 2] && p[1] === p[n * 2 - 1]) n--; if (n < 3) return;
  let a2 = 0; const ring = []; for (let k = 0; k < n; k++) { const j = (k + 1) % n; a2 += p[k * 2] * p[j * 2 + 1] - p[j * 2] * p[k * 2 + 1]; ring.push([p[k * 2], p[k * 2 + 1]]); }
  if (Math.abs(a2) < 8) return; if (a2 < 0) ring.reverse(); const A2 = Math.abs(a2) / 2;
  const h = Math.max(2.6, b.h || 10), kind = b.k || (b.ty === 'ch' && (b.h || 10) < 24 ? 'civic' : 'res'), r = rng(idx * 7919 + 13), plainK = kind === 'ind' || kind === 'stand' || kind === 'chimney' || kind === 'tank' || kind === 'shed';
  const flat = []; ring.forEach(q => flat.push(q[0], q[1]));
  // con relieve: el edificio se asienta a la altura del suelo de su perímetro (hacia la parte baja) y un zócalo lo lleva hasta el punto más hondo
  let yb = 0, plinth = 0; const gH = [], mk = [ch.wall.nv, ch.base.nv, ch.plain.nv, ch.glass.nv];
  if (T.on) { const hs = []; for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], a = gY(A[0], A[1]); gH.push(a); hs.push(a, gY((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)); } hs.sort((p1, p2) => p1 - p2); yb = hs[Math.floor(hs.length * .3)] + RISE; }
  const settle = () => { if (T.on) [ch.wall, ch.base, ch.plain, ch.glass].forEach((g, i) => { for (let v = mk[i]; v < g.nv; v++) g.p[v * 3 + 1] += yb; });
    if (T.on && plinth) { const pc = lin(plinth); for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz); if (l < .05) continue; const lo = Math.min(gH[k], gH[(k + 1) % n]) - .7; if (yb - lo > .1) ch.plain.wall(A[0], A[1], B[0], B[1], lo, yb, dz / l, -dx / l, pc); } }
    b.y0 = yb; W.bld.push({ p: flat, b: bboxOf(flat), h, k: kind, i: idx, y0: yb }); };
  if (kind === 'roof') { // cubiertas abiertas (se pasa por debajo): losa, templete, pérgola, chapa a dos aguas o cristal con estructura de acero
    let cx = 0, cz = 0; ring.forEach(q => { cx += q[0] / n; cz += q[1] / n; }); const rf = b.rf, g = ch.plain, posts = [];
    // caja orientada según el lado más largo: sirve para las dos aguas y para repartir pilares y vigas
    let li = 0, ll = 0; for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], l = Math.hypot(B[0] - A[0], B[1] - A[1]); if (l > ll) { ll = l; li = k; } }
    const ux = (ring[(li + 1) % n][0] - ring[li][0]) / (ll || 1), uz = (ring[(li + 1) % n][1] - ring[li][1]) / (ll || 1), vx = -uz, vz = ux; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    ring.forEach(q => { const u = (q[0] - cx) * ux + (q[1] - cz) * uz, v = (q[0] - cx) * vx + (q[1] - cz) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    const P = (u, v) => [cx + ux * u + vx * v, cz + uz * u + vz * v], boxy = A2 > .8 * (u1 - u0) * (v1 - v0), post = (x, z, t, col, hh) => { const v = new Vox(); v.box(x, 0, z, t, hh === undefined ? h - .3 : hh, t, col); g.add(v); addProp(x, z, t * .7, 'deco'); };
    if (rf === 'k') { // templete o kiosko: tarima, columnas finas y tejadillo a varias aguas con remate
      const cR = lin(b.rc >= 0 && b.rc !== undefined ? b.rc : 0x5a6a62), cR2 = lin(0x4a5852), a0 = g.nv; polyFlat(g, flat, .28, 0xb9b3a6); for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1; g.wall(A[0], A[1], B[0], B[1], 0, .28, dz / l, -dx / l, lin(0x9c968a)); }
      void a0; const st = Math.max(1, Math.round(n / 8)); for (let k = 0; k < n; k += st) post(ring[k][0] * .94 + cx * .06, ring[k][1] * .94 + cz * .06, .16, 0x3d4a45);
      const top = g.v(cx, h + 1.9, cz, 0, 1, 0, cR); for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], ex = (A[0] - cx) * 1.12 + cx, ez = (A[1] - cz) * 1.12 + cz, fx = (B[0] - cx) * 1.12 + cx, fz = (B[1] - cz) * 1.12 + cz, mx = (ex + fx) / 2 - cx, mz = (ez + fz) / 2 - cz, ml = Math.hypot(mx, mz) || 1, cc = k % 2 ? cR : cR2; g.i.push(g.v(fx, h - .3, fz, mx / ml * .6, .8, mz / ml * .6, cc), g.v(ex, h - .3, ez, mx / ml * .6, .8, mz / ml * .6, cc), top); }
      { const v = new Vox(); v.box(cx, h + 1.8, cz, .22, .7, .22, 0x3d4a45); g.add(v); } settle(); return; }
    if (rf === 'p') { // pérgola: pilares y vigas, sin tapa
      const along = u1 - u0 >= v1 - v0, L = along ? u1 - u0 : v1 - v0, Wd = along ? v1 - v0 : u1 - u0, nb = Math.max(2, Math.round(L / 2.2)), v = new Vox(), dk = 0x4a4f55, yaw = Math.atan2(along ? ux : vx, along ? uz : vz);
      v.at(cx + (along ? ux * (u0 + u1) / 2 + vx * (v0 + v1) / 2 : ux * (u0 + u1) / 2 + vx * (v0 + v1) / 2), 0, cz + (along ? uz * (u0 + u1) / 2 + vz * (v0 + v1) / 2 : uz * (u0 + u1) / 2 + vz * (v0 + v1) / 2), yaw);
      for (const sd of [-1, 1]) v.bx(sd * Wd / 2 - .12, h - .5, -L / 2, sd * Wd / 2 + .12, h - .25, L / 2, dk); for (let k = 0; k <= nb; k++) { const z = -L / 2 + L * k / nb; v.bx(-Wd / 2 - .4, h - .25, z - .07, Wd / 2 + .4, h - .05, z + .07, 0x8a8f96); }
      v.at(); g.add(v); const np = Math.max(2, Math.round(L / 7)); for (let k = 0; k <= np; k++) for (const sd of [-1, 1]) { const f = -L / 2 + L * k / np, q = along ? P((u0 + u1) / 2 + f, (v0 + v1) / 2 + sd * (Wd / 2 - .1)) : P((u0 + u1) / 2 + sd * (Wd / 2 - .1), (v0 + v1) / 2 + f); if (inPoly(flat, q[0] * .98 + cx * .02, q[1] * .98 + cz * .02) || boxy) post(q[0], q[1], .24, dk, h - .5); }
      settle(); return; }
    if ((rf === 'g' || rf === 'm') && boxy) { // dos aguas sobre pórticos: de cristal (se ve el cielo) o de chapa a franjas
      const glass = rf === 'g', G2 = glass ? ch.glass : g, rise = Math.min(3.2, (v1 - v0) * .13), vm = (v0 + v1) / 2, base = b.rc >= 0 && b.rc !== undefined ? b.rc : 0xb9bcc0, nS = Math.max(2, Math.round((u1 - u0) / 4.5)), dk = 0x3a4046;
      for (let k = 0; k < nS; k++) { const a = u0 + (u1 - u0) * k / nS, e = u0 + (u1 - u0) * (k + 1) / nS, col = lin(glass ? 0x9fc4d2 : k % 2 ? 0xeeeeea : base);
        for (const sd of [-1, 1]) { const ve = sd < 0 ? v0 : v1, p0 = P(a, ve), p1 = P(e, ve), p2 = P(e, vm), p3 = P(a, vm), nl = Math.hypot(rise, (v1 - v0) / 2) || 1, ny = (v1 - v0) / 2 / nl, nh = rise / nl * sd, q = [G2.v(p0[0], h, p0[1], vx * nh, ny, vz * nh, col), G2.v(p1[0], h, p1[1], vx * nh, ny, vz * nh, col), G2.v(p2[0], h + rise, p2[1], vx * nh, ny, vz * nh, col), G2.v(p3[0], h + rise, p3[1], vx * nh, ny, vz * nh, col)];
          if (sd < 0) G2.quad(q[0], q[3], q[2], q[1]); else G2.quad(q[0], q[1], q[2], q[3]); if (glass || true) { const u = lin(glass ? 0x86aebd : shade(base, .7)), w = [G2.v(p0[0], h, p0[1], 0, -1, 0, u), G2.v(p1[0], h, p1[1], 0, -1, 0, u), G2.v(p2[0], h + rise, p2[1], 0, -1, 0, u), G2.v(p3[0], h + rise, p3[1], 0, -1, 0, u)]; if (sd < 0) G2.quad(w[0], w[1], w[2], w[3]); else G2.quad(w[0], w[3], w[2], w[1]); } } }
      // pórticos: una viga a dos aguas cada tramo (un canto vertical bajo el faldón), la cumbrera, los aleros y pilares a los lados
      const cD = lin(dk), strip = (a, c, ya, yc, th) => { const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l; for (const sd of [1, -1]) { const q = [g.v(a[0], ya - th, a[1], nx * sd, 0, nz * sd, cD), g.v(c[0], yc - th, c[1], nx * sd, 0, nz * sd, cD), g.v(c[0], yc, c[1], nx * sd, 0, nz * sd, cD), g.v(a[0], ya, a[1], nx * sd, 0, nz * sd, cD)]; if (sd > 0) g.quad(q[0], q[1], q[2], q[3]); else g.quad(q[0], q[3], q[2], q[1]); } };
      for (let k = 0; k <= nS; k++) { const u = u0 + (u1 - u0) * k / nS, r0 = P(u, vm); for (const sd of [-1, 1]) { const e = P(u, sd < 0 ? v0 : v1); strip(e, r0, h - .02, h + rise - .02, .3); if (k % 2 === 0 || nS < 5) { const q = P(u, sd < 0 ? v0 + .15 : v1 - .15); post(q[0], q[1], .3, dk, h); } } }
      strip(P(u0, vm), P(u1, vm), h + rise, h + rise, .28); for (const sd of [-1, 1]) strip(P(u0, sd < 0 ? v0 : v1), P(u1, sd < 0 ? v0 : v1), h + .02, h + .02, .3);
      settle(); return; }
    // losa plana (o cubierta de forma irregular): tapa, canto, cara de abajo y pilares
    const c = lin(0xd9dcdc), topC = rf === 'g' ? 0x9fc4d2 : rf === 'm' ? (b.rc >= 0 && b.rc !== undefined ? b.rc : 0xc9ccd0) : 0xe6e8e6, GT = rf === 'g' ? ch.glass : g; polyFlat(GT, flat, h, topC);
    for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1; ch.plain.wall(A[0], A[1], B[0], B[1], h - (rf ? .25 : .45), h, dz / l, -dx / l, rf ? lin(0x3a4046) : c); }
    { const cu = lin(rf === 'g' ? 0x86aebd : 0xa9aeb0), a = GT.nv; ring.forEach(q => GT.v(q[0], h - (rf ? .02 : .45), q[1], 0, -1, 0, cu)); for (let k = 1; k + 1 < n; k++) GT.i.push(a, a + k, a + k + 1); }      // cara de abajo (vale para cubiertas convexas)
    const step = Math.max(1, Math.floor(n / 6)); for (let k = 0; k < n; k += step) { const x = ring[k][0] * .93 + cx * .07, z = ring[k][1] * .93 + cz * .07; post(x, z, .35, rf ? 0x3a4046 : 0xc9ccd0, h - .45); } void posts; settle(); return; }
  // color: el que traiga el mapa (color o material de fachada); si no, por tipo de edificio y por barrio (las promociones se hicieron de una vez: ladrillo aquí, revoco allá)
  const pick = P => P[Math.floor(r() * P.length)], cq = (() => { let x = 0, z = 0; ring.forEach(q => { x += q[0] / n; z += q[1] / n; }); const i = Math.floor(x / 95), j = Math.floor(z / 95), q = rng(((i * 73856093) ^ (j * 19349663)) >>> 0); return [q(), q()]; })();
  let fc; { const ty = b.ty, civ = [0xd8cfb8, 0xcfc4a8, 0xc9b8a0, 0xdcd6c8];
    if (kind === 'chimney') fc = 0x9a5a44; else if (kind === 'tank') fc = 0xc9ccd0;
    else if (b.c >= 0 && b.c !== undefined) fc = b.c;
    else if (b.m && MATPAL[b.m]) fc = pick(MATPAL[b.m]);
    else if (plainK) fc = ty === 'sp' ? pick(PANEL) : pick(SHED);
    else if (ty === 'ch') fc = pick(STONE); else if (ty === 'sp') fc = pick(r() < .5 ? PANEL : SHED); else if (ty === 'ho') fc = pick(PANEL); else if (ty === 'co') fc = pick(r() < .6 ? PANEL : GLASS); else if (ty === 'sc') fc = r() < .5 ? pick(BRICK) : pick(civ);
    else if (kind === 'civic') fc = r() < .2 ? pick(STONE) : pick(civ);
    else if (kind === 'house') fc = r() < .7 ? pick(RENDER) : r() < .5 ? pick(BRICK) : pick(STONE);
    else { // bloques de viviendas: el barrio marca la pauta y uno de cada tres va por libre
      const local = r() < .55, q = local ? cq[0] : r(), P = q < .56 ? BRICK : q < .92 ? RENDER : PANEL;      /* visto a pie de calle: en el centro manda el ladrillo caravista */ fc = local && r() < .45 ? P[Math.floor(cq[1] * P.length)] : pick(P); } }
  const col = lin(shade(fc, .94 + r() * .12)), dark = lin(shade(fc, .62)), corn = lin(shade(fc, .8)), baseC = lin(shade(fc, .86)), band = lin(BAND[Math.floor(r() * BAND.length)]);
  const style = kind === 'civic' ? 3 : kind === 'house' ? 1 : Math.floor(r() * 3), tall = !plainK && kind !== 'house' && h >= 7, h0 = tall ? 3.5 : 0, hc = !plainK && h > 5 ? .45 : 0, hTop = h - hc;
  const floors = Math.max(1, Math.round((hTop - h0) / 3.05)), EPS = .5 / (64 * NCELL), mine = shops && shops.get(idx), gl = (x, z) => T.on ? gY(x, z) + RISE - yb : 0, zoc = lin(shade(fc, .58));
  for (let k = 0; k < n; k++) {
    const A = ring[k], B = ring[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz); if (l < .05) continue; const nx = dz / l, nz = -dx / l;
    addWall(A[0], A[1], B[0], B[1], yb + h);
    if (plainK) { const g = ch.plain; g.wall(A[0], A[1], B[0], B[1], 0, Math.min(1.1, h * .3), nx, nz, dark); if (kind === 'ind' && h >= 6) { g.wall(A[0], A[1], B[0], B[1], Math.min(1.1, h * .3), h - 1.1, nx, nz, col); g.wall(A[0], A[1], B[0], B[1], h - 1.1, h - .5, nx, nz, band); g.wall(A[0], A[1], B[0], B[1], h - .5, h, nx, nz, col); } else g.wall(A[0], A[1], B[0], B[1], Math.min(1.1, h * .3), h, nx, nz, col); continue; }
    // columnas de unos 3 m: cada una con su ventana, sin cortar ninguna en las esquinas
    const cols = l < 1.7 ? 1 : Math.max(1, Math.round(l / 3)), ux = dx / cols, uz = dz / cols, shop = mine && mine.some(q => { const t = clamp(((q[0] - A[0]) * dx + (q[1] - A[1]) * dz) / (l * l), 0, 1); return Math.hypot(q[0] - A[0] - dx * t, q[1] - A[1] - dz * t) < .7; });
    const portal = tall && !shop && l >= 7 ? Math.floor(cols / 2) : -1;
    // en cuesta, la fachada va por tramos (como portales distintos): cada tramo arranca a ras de su trozo de calle, así ningún portal
    // ni escaparate queda enterrado ni colgando; debajo, zócalo hasta el suelo. Cuanta más pendiente, más cortos los tramos
    const gA = gl(A[0], A[1]), gB = gl(B[0], B[1]), cw = l / cols, bayN = !T.on ? cols : Math.max(1, Math.min(cols, Math.round(clamp(.9 / Math.max(Math.abs(gB - gA) / l, .01), 3, 15) / cw))); let base = 0, top0 = h0, fl = floors;
    for (let c = 0; c < cols; c++) { const x0 = A[0] + ux * c, z0 = A[1] + uz * c, x1 = x0 + ux, z1 = z0 + uz;
      if (T.on && c % bayN === 0) { const c1 = Math.min(cols, c + bayN), pc = portal >= c && portal < c1 ? portal + .5 : (c + c1) / 2; base = Math.min(gl(A[0] + ux * pc, A[1] + uz * pc), hTop - .4); top0 = Math.min(hTop, base + h0); fl = Math.max(1, Math.round((hTop - top0) / 3.05)); nBay++; }
      const cell = l < 1.7 ? 14 : style === 3 ? 12 + Math.floor(r() * 2) : style * 4 + Math.floor(r() * 4), u0 = cell / NCELL + EPS, u1 = (cell + 1) / NCELL - EPS;
      if (hTop - top0 > 1.3) ch.wall.wall(x0, z0, x1, z1, top0, hTop, nx, nz, col, u0, 0, u1, fl / 4); else if (hTop - top0 > .02) ch.plain.wall(x0, z0, x1, z1, top0, hTop, nx, nz, corn);
      if (tall) { const q = r(), bc = l < 1.7 ? 7 : shop ? (q < .5 ? 2 : q < .72 ? 3 : q < .9 ? 4 : 2) : c === portal ? 1 : q < .46 ? 5 : q < .6 ? 4 : q < .68 ? 6 : 0, bh = top0 - base; if (bh > 1.6) ch.base.wall(x0, z0, x1, z1, base, top0, nx, nz, baseC, bc / 8 + .004, 0, (bc + 1) / 8 - .004, Math.min(1, bh / h0)); else if (bh > .02) ch.plain.wall(x0, z0, x1, z1, base, top0, nx, nz, dark); }
      if (T.on) { const lo = Math.min(gl(x0, z0), gl(x1, z1)) - .7; if (base - lo > .06) ch.plain.wall(x0, z0, x1, z1, lo, base, nx, nz, zoc); } }
    if (hc) ch.plain.wall(A[0], A[1], B[0], B[1], hTop, h, nx, nz, corn);
  }
  // tejado: inclinado con teja en casas y bloques pequeños, plano en el resto
  // tejado: la forma y el color que traiga el mapa; si no, teja a cuatro aguas en casas y en la mayoría de los bloques (lo normal aquí), azotea en los grandes
  const pitched = b.rs && b.rs !== 'f', tile = !plainK && (pitched || b.rs !== 'f' && (kind === 'house' || kind === 'civic' && b.ty === 'ch' || kind !== 'civic' && r() < (A2 < 2500 ? .92 : .6))), ins = tile && n <= 16 ? insetRing(ring, kind === 'house' ? 1.6 : A2 > 900 ? 2.2 : 1.3) : null, rcTag = b.rc >= 0 && b.rc !== undefined ? b.rc : -1;
  if (ins) { const rc = rcTag >= 0 ? rcTag : ROOF_T[Math.floor((cq[1] * .6 + r() * .4) * ROOF_T.length)], c1 = lin(rc), c2 = lin(shade(rc, .86)), rh = kind === 'house' ? 1.9 : A2 > 900 ? 2.3 : 1.5, g = ch.plain;
    for (let k = 0; k < n; k++) { const j = (k + 1) % n, A = ring[k], B = ring[j], C = ins[j], D = ins[k], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1, nx = dz / l * .6, nz = -dx / l * .6, cc = k % 2 ? c1 : c2; g.quad(g.v(B[0], h, B[1], nx, .8, nz, cc), g.v(A[0], h, A[1], nx, .8, nz, cc), g.v(D[0], h + rh, D[1], nx, .8, nz, cc), g.v(C[0], h + rh, C[1], nx, .8, nz, cc)); }
    // en los edificios grandes, un segundo faldón más tendido hacia el centro: de lejos se lee como un tejado y no como una tapa
    let top = ins, ht = h + rh; if (A2 > 350) { const ar = q => { let a = 0; for (let i = 0; i < q.length; i++) { const j = (i + 1) % q.length; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; } return a / 2; }, simple = q => { const m = q.length, X2 = (p1, p2, p3, p4) => { const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]); if (Math.abs(d) < 1e-9) return false; const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d, u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d; return t > 0 && t < 1 && u > 0 && u < 1; }; for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) { if (i === 0 && j === m - 1) continue; if (X2(q[i], q[(i + 1) % m], q[j], q[(j + 1) % m])) return false; } return true; };
      const a1 = ar(ins), d2 = Math.min(3.4, Math.sqrt(A2) * .11), in2 = a1 > 0 && simple(ins) ? insetRing(ins, d2) : null, a2b = in2 ? ar(in2) : 0;
      if (in2 && a2b > a1 * .22 && a2b < a1 * .97 && simple(in2)) { const rh2 = d2 * .42; for (let k = 0; k < n; k++) { const j = (k + 1) % n, A = ins[k], B = ins[j], C = in2[j], D = in2[k], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1, nx = dz / l * .4, nz = -dx / l * .4, cc = k % 2 ? c2 : c1; g.quad(g.v(B[0], ht, B[1], nx, .92, nz, cc), g.v(A[0], ht, A[1], nx, .92, nz, cc), g.v(D[0], ht + rh2, D[1], nx, .92, nz, cc), g.v(C[0], ht + rh2, C[1], nx, .92, nz, cc)); } top = in2; ht += rh2; } }
    const f2 = []; top.forEach(q => f2.push(q[0], q[1])); polyFlat(g, f2, ht, shade(rc, .9)); }
  else polyFlat(ch.plain, flat, h, rcTag >= 0 ? rcTag : plainK ? (r() < .06 ? 0x8c5a4a : shade(fc, .78)) : tile ? ROOF_T[Math.floor(r() * ROOF_T.length)] : kind === 'civic' ? 0x8a8478 : ROOF_F[Math.floor(r() * ROOF_F.length)]);      /* planta complicada: tapa plana, pero del color de la teja (desde arriba, casi todo Sestao es rojo) */
  if (!plainK && !ins && h > 9 && A2 > 300) { let cx = 0, cz = 0; ring.forEach(q => { cx += q[0]; cz += q[1]; }); cx /= n; cz /= n; if (inPoly(flat, cx, cz)) { const v = new Vox(); v.box(cx, h, cz, 3.4, 2.4, 3.4, 0xb9b3a6, { top: 0x6a6e74 }); ch.plain.add(v); } }   // casetón en la azotea
  // iglesias: torre del campanario con sus huecos y su chapitel, en la punta del edificio que da a la calle
  if (b.ty === 'ch' && kind !== 'roof' && A2 > 120 && n <= 40) { let cx = 0, cz = 0; ring.forEach(q => { cx += q[0]; cz += q[1]; }); cx /= n; cz /= n; let sxx = 0, szz = 0, sxz = 0; ring.forEach(q => { const dx = q[0] - cx, dz = q[1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; });
    const ang = .5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang); let lo = 1e9, hi = -1e9; ring.forEach(q => { const t = (q[0] - cx) * ux + (q[1] - cz) * uz; lo = Math.min(lo, t); hi = Math.max(hi, t); });
    const sd = Math.max(4, Math.min(7.5, Math.sqrt(A2) * .24)), e1 = [cx + ux * (hi - sd / 2), cz + uz * (hi - sd / 2)], e0 = [cx + ux * (lo + sd / 2), cz + uz * (lo + sd / 2)], d1 = roadNear(e1[0], e1[1], 30, false).d, d0 = roadNear(e0[0], e0[1], 30, false).d, e = d0 < d1 ? e0 : e1;
    const H = Math.min(46, Math.max(24, h + 16, h * 2.1)), stone = 0xcfc6b2, v = new Vox(); v.at(e[0], 0, e[1], -ang);
    v.box(0, 0, 0, sd, H, sd, stone, { top: 0x6a6e74 }); v.box(0, H - 4.6, 0, sd + .12, 2.6, sd * .34, 0x2a2e33); v.box(0, H - 4.6, 0, sd * .34, 2.6, sd + .12, 0x2a2e33); v.box(0, H - .5, 0, sd + .5, .5, sd + .5, 0xb9b09c);
    for (let k = 0; k < 6; k++) { const f = 1 - (k + 1) / 7; v.box(0, H + k * sd * .3, 0, sd * f, sd * .3, sd * f, 0x55606a); } v.box(0, H + 6 * sd * .3, 0, .12, 1.6, .12, 0x2a2e33); v.box(0, H + 6 * sd * .3 + 1, 0, .8, .12, .12, 0x2a2e33);
    v.at(); ch.plain.add(v); W.towers.push([e[0], e[1]]); }
  plinth = plainK ? shade(fc, .58) : 0; settle();
}

// ---------- colisión
function gridAdd(grid, x0, z0, x1, z1, id) { const a = Math.floor(Math.min(x0, x1) / CELL), b = Math.floor(Math.max(x0, x1) / CELL), c = Math.floor(Math.min(z0, z1) / CELL), d = Math.floor(Math.max(z0, z1) / CELL); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const k = key(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(id); } }
let portals = null;      // huecos en las paredes por donde pasa una calle
function addWall(ax, az, bx, bz, h) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < .05) return; let cuts = null;
  if (portals && portals.size) { const a = Math.floor((Math.min(ax, bx) - 1) / CELL), b = Math.floor((Math.max(ax, bx) + 1) / CELL), c = Math.floor((Math.min(az, bz) - 1) / CELL), d = Math.floor((Math.max(az, bz) + 1) / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const pl = portals.get(key(i, j)); if (!pl) continue; for (const q of pl) { const t = ((q[0] - ax) * dx + (q[1] - az) * dz) / (l * l); if (t < -.02 || t > 1.02) continue; if (Math.hypot(q[0] - ax - dx * t, q[1] - az - dz * t) > .5) continue; (cuts || (cuts = [])).push([t * l - q[2], t * l + q[2]]); } } }
  // un tramo de pared que va por dentro de un paso (medianera a lo largo del pasadizo) tampoco cierra el paso
  { const TB = W.map && W.map.tubes; if (TB && TB.length) { const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz), ins = (x, z) => { for (const t of TB) { const hw = t.w / 2 - .25, p = t.p; if (!t.bb) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let k = 0; k < p.length; k += 2) { a = Math.min(a, p[k]); c = Math.max(c, p[k]); b = Math.min(b, p[k + 1]); d = Math.max(d, p[k + 1]); } t.bb = [a, b, c, d]; } if (x1 < t.bb[0] - hw || x0 > t.bb[2] + hw || z1 < t.bb[1] - hw || z0 > t.bb[3] + hw) continue; for (let k = 0; k + 3 < p.length; k += 2) { const px = p[k], pz = p[k + 1], ex = p[k + 2] - px, ez = p[k + 3] - pz, tt = Math.max(0, Math.min(1, ((x - px) * ex + (z - pz) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(x - px - ex * tt, z - pz - ez * tt) < hw) return true; } } return false; };
      const m = Math.max(2, Math.ceil(l / .4)); let run = -1; for (let q = 0; q <= m; q++) { const f = q / m, inside = ins(ax + dx * f, az + dz * f); if (inside && run < 0) run = f * l; if ((!inside || q === m) && run >= 0) { const end = inside ? l : f * l; if (end - run > 1.2) (cuts || (cuts = [])).push([run - .2, end + .2]); run = -1; } } } }
  if (!cuts) { W.segs.push(ax, az, bx, bz, h); return; }
  cuts.sort((p, q) => p[0] - q[0]); let s = 0; const ux = dx / l, uz = dz / l, put = (s0, s1) => { if (s1 - s0 > .25) W.segs.push(ax + ux * s0, az + uz * s0, ax + ux * s1, az + uz * s1, h); };
  cuts.forEach(c => { put(s, Math.min(l, c[0])); s = Math.max(s, c[1]); }); put(s, l);
}
const hitOut = { x: 0, z: 0, nx: 0, nz: 0, hit: false, prop: null };
// círculo contra paredes y mobiliario: devuelve la posición corregida y la normal del choque más fuerte
export function collide(x, z, r, noProps, y) {
  const o = hitOut; o.hit = false; o.nx = 0; o.nz = 0; o.prop = null; let deep = 0;
  for (let it = 0; it < 2; it++) {
    const a = Math.floor((x - r) / CELL), b = Math.floor((x + r) / CELL), c = Math.floor((z - r) / CELL), d = Math.floor((z + r) / CELL); let moved = false;
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) {
      const l = W.grid.get(key(i, j)); if (l) for (let q = 0; q < l.length; q++) {
        const s = l[q] * 5, S = W.segs; if (y !== undefined) { if (y > S[s + 4] + .6) continue; const sy = W.segY[l[q]]; if (sy !== undefined && y < sy) continue; } const ax = S[s], az = S[s + 1], ex = S[s + 2] - ax, ez = S[s + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))), px = ax + ex * t, pz = az + ez * t, dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) { const dd = Math.sqrt(d2), pen = r - dd; x += dx / dd * pen; z += dz / dd * pen; moved = true; o.hit = true; if (pen > deep) { deep = pen; o.nx = dx / dd; o.nz = dz / dd; } }
      }
      const pl = noProps ? null : W.pgrid.get(key(i, j)); if (pl) for (let q = 0; q < pl.length; q++) {
        const P = W.props[pl[q]]; if (P.off) continue; const dx = x - P.x, dz = z - P.z, rr = r + P.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) { const dd = Math.sqrt(d2), pen = rr - dd; x += dx / dd * pen; z += dz / dd * pen; moved = true; o.hit = true; o.prop = P; if (pen > deep) { deep = pen; o.nx = dx / dd; o.nz = dz / dd; } }
      }
    }
    if (!moved) break;
  }
  o.x = x; o.z = z; return o;
}
// ¿hay pared entre dos puntos? (para la cámara) -> fracción 0..1 del primer corte por debajo de la altura y
export function wallBetween(x0, z0, x1, z1, y) {
  let best = 1; const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / CELL)), seen = new Set();
  for (let s = 0; s <= steps; s++) { const cx = Math.floor((x0 + (x1 - x0) * s / steps) / CELL), cz = Math.floor((z0 + (z1 - z0) * s / steps) / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const k = key(i, j); if (seen.has(k)) continue; seen.add(k); const l = W.grid.get(k); if (!l) continue;
      for (let q = 0; q < l.length; q++) { const s5 = l[q] * 5, S = W.segs; if (S[s5 + 4] < y) continue; const ax = S[s5], az = S[s5 + 1], ex = S[s5 + 2] - ax, ez = S[s5 + 3] - az, rx = x1 - x0, rz = z1 - z0, den = rx * ez - rz * ex; if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - x0) * ez - (az - z0) * ex) / den, u = ((ax - x0) * rz - (az - z0) * rx) / den; if (t > 0 && t < best && u >= 0 && u <= 1) best = t; } } }
  return best;
}
export function inPoly(p, x, z) { let c = false; for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) { const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
export function inWaterPoly(x, z) { for (const w of W.water) if (x > w.b[0] && x < w.b[2] && z > w.b[1] && z < w.b[3] && inPoly(w.p, x, z)) return true; return false; }
// edificio que hay en un punto (o null)
export function inBuilding(x, z) { const l = W.bgrid.get(key(Math.floor(x / 40), Math.floor(z / 40))); if (l) for (let q = 0; q < l.length; q++) { const b = W.bld[l[q]]; if (x >= b.b[0] && x <= b.b[2] && z >= b.b[1] && z <= b.b[3] && inPoly(b.p, x, z)) return b; } return null; }
// distancia al borde de la calzada más cercana (negativa si se está encima). carOnly: solo calles para coches
const rOut = { d: 1e9, r: null, x: 0, z: 0, ux: 0, uz: 0 };
export function roadNear(x, z, R, carOnly) {
  const o = rOut; o.d = 1e9; o.r = null; const a = Math.floor((x - R) / 40), b = Math.floor((x + R) / 40), c = Math.floor((z - R) / 40), d = Math.floor((z + R) / 40), S = W.rsegs;
  for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const l = W.rgrid.get(key(i, j)); if (!l) continue; for (let q = 0; q < l.length; q++) { const s = l[q] * 5, r = W.map.roads[S[s + 4]]; if (carOnly && !ROAD[r.t][3]) continue; const ax = S[s], az = S[s + 1], ex = S[s + 2] - ax, ez = S[s + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))), dd = Math.hypot(x - ax - ex * t, z - az - ez * t) - r.w / 2;
      if (dd < o.d) { o.d = dd; o.r = r; o.x = ax + ex * t; o.z = az + ez * t; const el = Math.hypot(ex, ez) || 1; o.ux = ex / el; o.uz = ez / el; } } }
  return o;
}
// altura del techo si el punto está dentro de un paso bajo un edificio (0 si no)
export function tubeAt(x, z) { for (const t of W.tubes || []) { if (x < t.b[0] - t.hw || x > t.b[2] + t.hw || z < t.b[1] - t.hw || z > t.b[3] + t.hw) continue; const p = t.p; for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, tt = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(x - ax - ex * tt, z - az - ez * tt) < t.hw) return t.h; } } return 0; }
export function addProp(x, z, r, kind) { const id = W.props.length; W.props.push({ x, z, r, kind, off: false }); gridAdd(W.pgrid, x - r, z - r, x + r, z + r, id); return W.props[id]; }
// zona por la que se puede andar y conducir: el mapa y, fuera de él, la carretera y el polígono de la ampliación
export function clampWorld(x, z, m) {
  const B = W.map.bbox; if (x >= B[0] + m && x <= B[2] - m && z >= B[1] + m && z <= B[3] - m) return null;
  const cx = clamp(x, B[0] + m, B[2] - m), cz = clamp(z, B[1] + m, B[3] - m); let best = [cx, cz], bd = Math.hypot(cx - x, cz - z);
  for (const e of W.ext) { const s = (x - e.x) * e.dx + (z - e.z) * e.dz, o = (x - e.x) * e.lx + (z - e.z) * e.lz; if (s >= e.s0 + m && s <= e.s1 - m && o >= e.o0 + m && o <= e.o1 - m) return null;
    const cs = clamp(s, e.s0 + m, e.s1 - m), co = clamp(o, e.o0 + m, e.o1 - m), qx = e.x + e.dx * cs + e.lx * co, qz = e.z + e.dz * cs + e.lz * co, d = Math.hypot(qx - x, qz - z); if (d < bd) { bd = d; best = [qx, qz]; } }
  return best;
}

// ---------- ampliación inventada: carretera al polígono, gasolinera y naves (no sale de ningún mapa real)
export function extend(M) {
  const bb = M.bbox, mg = M.margin || 0, X = bb[2] + mg, Z = bb[3] + mg; let best = null; const ends = [];
  M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp || !sp[3] || r.p.length < 4 || r.iso || r.pr || r.t === 'service' || r.t === 'track' || r.t.indexOf('_link') > 0) return;
    [[0, 2], [r.p.length - 2, r.p.length - 4]].forEach(e => { const x = r.p[e[0]], z = r.p[e[0] + 1]; if (mg && Math.abs(Math.abs(x) - X) > .3 && Math.abs(Math.abs(z) - Z) > .3) return; let dx = x - r.p[e[1]], dz = z - r.p[e[1] + 1]; const l = Math.hypot(dx, dz) || 1; ends.push({ r, x, z, dx: dx / l, dz: dz / l }); }); });
  ends.forEach(e => { const r = e.r; if (r.o || r.b) return; const cls = { tertiary: 3, secondary: 3, primary: 2, trunk: 2 }[r.t] || 1;
    // hacia fuera del mapa, lejos del agua y de otras salidas
    const perp = Math.abs(Math.abs(e.x) - X) < .3 ? Math.abs(e.dx) : Math.abs(e.dz), out = mg ? 0 : Math.max(0, Math.min(e.dx > 1e-6 ? (bb[2] - e.x) / e.dx : e.dx < -1e-6 ? (bb[0] - e.x) / e.dx : 1e9, e.dz > 1e-6 ? (bb[3] - e.z) / e.dz : e.dz < -1e-6 ? (bb[1] - e.z) / e.dz : 1e9));
    const crowd = ends.filter(o => o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 150).length, south = e.dz > .5 ? 1 : 0, west = (bb[2] - e.x) / (bb[2] - bb[0]);
    const sc = cls * 40 + perp * 30 - crowd * 25 - out * 1.2 + (mg ? south * 25 : west * 60) - (inWaterAhead(M, e.x, e.z, e.dx, e.dz) ? 1e4 : 0); if (!best || sc > best.sc) best = { sc, x: e.x, z: e.z, dx: e.dx, dz: e.dz, road: r }; });
  if (!best) best = { x: bb[0], z: (bb[1] + bb[3]) / 2, dx: -1, dz: 0 };
  const E = best, lx = -E.dz, lz = E.dx, Pt = (s, o) => [Math.round((E.x + E.dx * s + lx * o) * 10) / 10, Math.round((E.z + E.dz * s + lz * o) * 10) / 10], fl = a => { const o = []; a.forEach(q => { const w = Pt(q[0], q[1]); o.push(w[0], w[1]); }); return o; };
  const road = (t, n, w, pts) => M.roads.push({ t, n, w, p: fl(pts), x: 1 }), bld = (s0, o0, s1, o1, h, k, n) => M.bld.push({ p: fl([[s0, o0], [s1, o0], [s1, o1], [s0, o1]]), h, k: k || 'ind', n, x: 1 });
  // lo que hubiera en el mapa justo donde va la ampliación se quita, para que no se pise
  const hit = (x, z) => { const s = (x - E.x) * E.dx + (z - E.z) * E.dz, o = (x - E.x) * lx + (z - E.z) * lz; return s > 6 && ((s < 700 && Math.abs(o) < 17) || (s > 310 && s < 490 && o > -72 && o < 22) || (s >= 680 && s < 1200 && Math.abs(o) < 190)); };
  M.bld = M.bld.filter(b => { for (let k = 0; k < b.p.length; k += 2) if (hit(b.p[k], b.p[k + 1])) return false; return true; });
  if (M.trees) { const t = []; for (let k = 0; k < M.trees.length; k += 2) if (!hit(M.trees[k], M.trees[k + 1])) t.push(M.trees[k], M.trees[k + 1]); M.trees = t; }
  road('trunk', 'Carretera del polígono', 12, [[0, 0], [150, 0], [330, 6], [400, 9], [470, 10], [640, 4], [800, 0]]);
  road('service', 'Gasolinera', 7, [[330, 6], [352, -22], [400, -27], [448, -22], [470, 10]]);
  road('tertiary', 'Polígono La Tuerca', 8, [[800, 0], [800, -90], [950, -90], [1100, -90], [1100, 0], [1100, 90], [950, 90], [800, 90], [800, 0]]);
  road('tertiary', 'Calle del Cigüeñal', 8, [[950, -90], [950, 90]]);
  bld(820, -72, 930, -18, 11); bld(820, 18, 930, 72, 12); bld(970, -72, 1080, -18, 10); bld(970, 18, 1080, 72, 13);
  bld(700, -160, 775, -110, 10); bld(808, -168, 900, -112, 12); bld(700, 110, 780, 165, 11); bld(1118, 36, 1168, 150, 12); bld(1118, -150, 1168, -40, 11); bld(1030, 112, 1100, 170, 10); bld(960, -170, 1110, -112, 9, 'ind', 'Autos Sádaba');
  bld(1118, -24, 1158, 24, 8, 'shed', 'Taller'); bld(850, 112, 1000, 160, 9, 'shed', 'ITV'); bld(372, -58, 428, -44, 4.5, 'shed', 'Gasolinera');
  [[340, -44, 460, -8], [1104, -26, 1118, 26], [880, 94, 975, 112], [985, -112, 1085, -94]].forEach(q => M.green.push({ p: fl([[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]]]), k: 'lot', x: 1 }));
  // árboles a los lados de la carretera y alrededor del polígono
  { const rr = rng(77); for (let st = 30; st < 780; st += 16 + rr() * 22) [-1, 1].forEach(sd => { if (st > 300 && st < 500 && sd < 0) return; const q = Pt(st, sd * (11 + rr() * 16)); M.trees.push(q[0], q[1]); }); for (let i = 0; i < 70; i++) { const q = Pt(690 + rr() * 520, (rr() < .5 ? -1 : 1) * (182 + rr() * 22)); M.trees.push(q[0], q[1]); } }
  const ang = (dx, dz) => Math.atan2(dx, dz), A = (s, o, fs, fo, back) => { const p = Pt(s, o), q = Pt(s + fs, o + fo); return { x: p[0], z: p[1], yaw: ang(q[0] - p[0], q[1] - p[1]), back: back || 2.6 }; };
  // puntos de interés de la ampliación: posición del marcador y hacia dónde mira la fachada
  W.anchors = { taller: A(1110.5, 0, -1, 0, 7.5), itv: A(925, 105, 0, -1, 7), gas: A(400, -34, 0, 1, 10), dealer: A(1035, -105, 0, 1, 7), exit: { x: E.x, z: E.z, n: E.road ? E.road.n : '' }, P: Pt };
  const c = [Pt(-40, -220), Pt(1230, -220), Pt(1230, 220), Pt(-40, 220)]; let x0 = bb[0], z0 = bb[1], x1 = bb[2], z1 = bb[3]; c.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
  W.bounds = [x0, z0, x1, z1]; const ex = { x: E.x, z: E.z, dx: E.dx, dz: E.dz, lx, lz };
  W.ext = [Object.assign({ s0: -mg - 30, s1: 700, o0: -70, o1: 70 }, ex), Object.assign({ s0: 680, s1: 1215, o0: -205, o1: 205 }, ex)];
}
function inWaterAhead(M, x, z, dx, dz) { for (const w of M.water || []) for (let s = 60; s < 900; s += 120) if (inPoly(w, x + dx * s, z + dz * s)) return true; return false; }

// datos derivados de cada calle: acera, banda de aparcamiento, carriles y velocidad
const PKW = [0, 2, 4, 4.6];
export function prepRoads(M) {
  M.roads.forEach((r, i) => { const sp = ROAD[r.t]; if (!sp) return; r.w = roadW(r); if (!sp[3]) return;
    r.sw = sp[2] && !r.ns && !r.pr && !(r.u && !r.b) ? SW : 0; const n = r.o ? (r.l || 1) : Math.max(2, r.l || 2);
    // bandas de aparcamiento a cada lado (derecha e izquierda del sentido en que está dibujada): en línea 2 m, en diagonal 4 m, en batería 4,6 m
    r.pkR = PKW[r.pr2 || 0]; r.pkL = PKW[r.pl || 0];
    if (M.v < 4 && r.pl === undefined && r.pr2 === undefined) { const spare = r.w - n * (r.o ? 3.3 : 3); if (spare >= 2 && !r.rb && !r.u && !r.b && !r.pr && !r.x && (r.t === 'residential' || r.t === 'tertiary' || r.t === 'secondary' || r.t === 'unclassified')) { if (i % 2) r.pkR = 2; else r.pkL = 2; } }      // mapas antiguos: una banda si sobra ancho
    r.pk = r.pkL + r.pkR; r.c0 = (r.pkL - r.pkR) / 2; r.ln = n; r.vm = Math.min(sp[1], r.v ? Math.max(4, r.v / 3.6) : 99); });
  // cruces: puntos donde se juntan tres o más brazos de calzada. Ahí no se pintan rayas de carril ni de aparcamiento, ni se aparca
  const at = new Map(); M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp || !sp[3]) return; const n = r.p.length / 2; for (let k = 0; k < n; k++) { const kk = Math.round(r.p[k * 2] * 5) + ',' + Math.round(r.p[k * 2 + 1] * 5); let e = at.get(kk); if (!e) at.set(kk, e = { x: r.p[k * 2], z: r.p[k * 2 + 1], arms: 0, w: 0 }); e.arms += k === 0 || k === n - 1 ? 1 : 2; e.w = Math.max(e.w, r.w); } });
  W.junc = []; W.jgrid = new Map(); at.forEach(e => { if (e.arms < 3) return; const j = { x: e.x, z: e.z, r: e.w / 2 }; W.junc.push(j); const kk = key(Math.floor(e.x / 40), Math.floor(e.z / 40)); let l = W.jgrid.get(kk); if (!l) W.jgrid.set(kk, l = []); l.push(j); });
}
// ¿cae (x, z) en un cruce? (a menos de su radio más m)
export function nearJunc(x, z, m) { const a = Math.floor((x - 22) / 40), b = Math.floor((x + 22) / 40), c = Math.floor((z - 22) / 40), d = Math.floor((z + 22) / 40); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const l = W.jgrid.get(key(i, j)); if (l) for (const q of l) if (Math.hypot(q.x - x, q.z - z) < q.r + m) return true; } return false; }
const simplifyLine = q => { const o = [q[0], q[1]]; for (let k = 2; k + 3 < q.length; k += 2) { const ax = o[o.length - 2], az = o[o.length - 1], bx = q[k + 2], bz = q[k + 3], cr = (q[k] - ax) * (bz - az) - (q[k + 1] - az) * (bx - ax); if (Math.abs(cr) > .02 * Math.hypot(bx - ax, bz - az)) o.push(q[k], q[k + 1]); } o.push(q[q.length - 2], q[q.length - 1]); return o; };
// trozos de una línea que quedan fuera de los cruces
function clearOfJunc(p, m) { const out = []; let cur = null; const q = densify(p, 1.5); for (let k = 0; k < q.length; k += 2) { if (nearJunc(q[k], q[k + 1], m)) { if (cur && cur.length >= 4) out.push(cur); cur = null; } else (cur || (cur = [])).push(q[k], q[k + 1]); } if (cur && cur.length >= 4) out.push(cur); return out; }
// desplazamiento lateral del carril respecto al eje (positivo a la derecha de la marcha). fwd: se circula en el sentido en que está dibujada la vía
export function laneOff(r, fwd) { const c0 = r.c0 || 0; return (r.o ? 0 : (r.w - (r.pk || 0)) / 4) + (fwd ? c0 : -c0); }

// ---------- suelo con relieve
// altura del tablero de un puente en un punto (por el tramo más cercano de su eje)
export function deckH(D, x, z) { let best = 1e9, h = D.h[0]; const p = D.p; for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dd = Math.hypot(x - ax - ex * t, z - az - ez * t); if (dd < best) { best = dd; h = D.h[k / 2] + (D.h[k / 2 + 1] - D.h[k / 2]) * t; } } return h; }
// apoya una geometría plana sobre el relieve: cada vértice sube lo que mida el suelo (o el tablero del puente) en su sitio
function drape(g, marks) {
  const P = g.p, Nn = g.n, n3 = [0, 0, 0], rs = marks.filter(m => m[0] === g).sort((a, b) => a[1] - b[1]); let mi = 0;
  for (let v = 0; v < g.nv; v++) { while (mi < rs.length && v >= rs[mi][2]) mi++; const x = P[v * 3], z = P[v * 3 + 2];
    if (mi < rs.length && v >= rs[mi][1]) { P[v * 3 + 1] += deckH(rs[mi][3], x, z); continue; }
    P[v * 3 + 1] += gY(x, z); if (Nn[v * 3 + 1] > .9) { normalAt(x, z, n3); Nn[v * 3] = n3[0]; Nn[v * 3 + 1] = n3[1]; Nn[v * 3 + 2] = n3[2]; } }
}
// parte una geometría en trozos por zonas, para que la cámara descarte los que no ve
function splitGeo(g, size) {
  const B = new Map(), P = g.p, Nn = g.n, C = g.c, U = g.u, I = g.i;
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2], k = key(Math.floor((P[a * 3] + P[b * 3] + P[c * 3]) / 3 / size), Math.floor((P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3 / size)); let q = B.get(k); if (!q) B.set(k, q = { g: new Geo(!!U, g.k), m: new Map() }); const o = q.g;
    for (let s = 0; s < 3; s++) { const v = I[t + s]; let n = q.m.get(v); if (n === undefined) { n = o.nv++; q.m.set(v, n); o.p.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); o.n.push(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]); o.c.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]); if (U) o.u.push(U[v * 2], U[v * 2 + 1]); } o.i.push(n); } }
  const out = []; B.forEach(q => out.push(q.g.build())); return out;
}
const areaOf = q => { let a = 0; for (let i = 0, n = q.length; i < n; i++) { const p = q[i], r = q[(i + 1) % n]; a += p[0] * r[1] - r[0] * p[1]; } return Math.abs(a) / 2; };
const clipHalf = (pts, a, b, c) => { const out = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c; if (dp <= 0) out.push(p); if ((dp <= 0) !== (dq <= 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
// la malla fina del terreno: cada medio cuadro lo pinta el polígono de más arriba que lo cubre entero (o el suelo base); los bordes de los polígonos se recortan al medio cuadro
function terrainMeshes(L, areas, addMesh, bb, mg) {
  const d = T.d, nx = T.nx, nz = T.nz, cx = nx - 1, cz = nz - 1, own = new Uint16Array(cx * cz * 2), parts = new Map(), FULL = d * d * .999, HALF = d * d / 2 * .999, hM = T.hM, URB = 0xada79a, GRN = 0x86a877;
  areas.sort((a, b) => a.li - b.li);
  areas.forEach((A, ai) => { const p = A.p, pts = [], soft = Math.abs((A.hex >> 16) - (URB >> 16)) < 14 && Math.abs((A.hex >> 8 & 255) - (URB >> 8 & 255)) < 14 && Math.abs((A.hex & 255) - (URB & 255)) < 14; for (let k = 0; k < p.length; k += 2) pts.push([p[k], p[k + 1]]); if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop(); if (pts.length < 3) return;
    const i0 = Math.max(0, Math.floor((A.b[0] - T.x0) / d)), i1 = Math.min(cx - 1, Math.floor((A.b[2] - T.x0) / d)), j0 = Math.max(0, Math.floor((A.b[1] - T.z0) / d)), j1 = Math.min(cz - 1, Math.floor((A.b[3] - T.z0) / d));
    for (let i = i0; i <= i1; i++) { const x = T.x0 + i * d, col = clipAxis(clipAxis(pts, 0, x, false), 0, x + d, true); if (col.length < 3) continue; let za = 1e9, zb = -1e9; for (const q of col) { if (q[1] < za) za = q[1]; if (q[1] > zb) zb = q[1]; }
      for (let j = Math.max(j0, Math.floor((za - T.z0) / d)), je = Math.min(j1, Math.floor((zb - T.z0) / d)); j <= je; j++) { const z = T.z0 + j * d, cell = clipAxis(clipAxis(col, 1, z, false), 1, z + d, true); if (cell.length < 3) continue; const ar = areaOf(cell); if (ar < .01) continue; const c = (j * cx + i) * 2;
        if (ar >= FULL) { own[c] = own[c + 1] = ai + 1; continue; }
        const tr = [clipHalf(cell, -1, 1, z - x), clipHalf(cell, 1, -1, x - z)];     // medio cuadro 0: (x-x0) >= (z-z0); medio cuadro 1: el otro
        for (let s = 0; s < 2; s++) { const q = tr[s]; if (q.length < 3) continue; const a2 = areaOf(q); if (a2 < .005) continue; if (a2 >= HALF) { own[c + s] = ai + 1; continue; } let l = parts.get(c + s); if (!l) parts.set(c + s, l = []); l.push([ai, q]); } } } });
  const STEEPL = { base: 1, land: 1, plaza: 1, lot: 1 }, CONC = lin(0x9b968c);
  const CH = 64, geos = new Map(), pal = new Map(), palId = hex => { let i = pal.get(hex); if (i === undefined) { i = pal.size; pal.set(hex, i); } return i; }; const GRNID = palId(GRN);
  const gof = (ci, cj, n) => { const k = (ci * 64 + cj) * 16 + L[n].i; let q = geos.get(k); if (!q) geos.set(k, q = { g: new Geo(L[n].uv, L[n].k), m: new Map(), n }); return q; };
  const vert = (q, node, i, j, lift, col, cid) => { const k2 = node * 64 + cid; let v = q.m.get(k2); if (v !== undefined) return v;
    const hl = hM[i > 0 ? node - 1 : node], hr = hM[i < nx - 1 ? node + 1 : node], hu = hM[j > 0 ? node - nx : node], hd = hM[j < nz - 1 ? node + nx : node], gx = (hr - hl) / ((i > 0 && i < nx - 1 ? 2 : 1) * d), gz = (hd - hu) / ((j > 0 && j < nz - 1 ? 2 : 1) * d), l = Math.hypot(gx, 1, gz);
    if (STEEPL[q.n] && cid !== GRNID) { const t = Math.max(0, Math.min(1, (Math.hypot(gx, gz) - .75) / .55)); if (t > 0) { const c = col; col = [c[0] + (CONC[0] - c[0]) * t, c[1] + (CONC[1] - c[1]) * t, c[2] + (CONC[2] - c[2]) * t]; } }      /* talud muy empinado en el pueblo: hormigón, como los muros de contención entre calle y calle (se funde poco a poco) */
    v = q.g.v(T.x0 + i * d, hM[node] + lift, T.z0 + j * d, -gx / l, 1 / l, -gz / l, col); q.m.set(k2, v); return v; };
  // bloques de cuadros con el mismo suelo y las alturas en un plano: dos triángulos en vez de dos por cuadro (lo que más aligera la malla)
  const inMap = (i, j) => { const mx = T.x0 + (i + .5) * d, mz = T.z0 + (j + .5) * d; return mx > bb[0] - mg && mx < bb[2] + mg && mz > bb[1] - mg && mz < bb[3] + mg; };
  const kc = new Int32Array(cx * cz), used = new Uint8Array(cx * cz); let merged = 0, hidden = 0; const pst = [0, 0, 0, 0, 0];
  const covAll = (x, z) => { const i = Math.floor((x - T.x0) / T.cd), j = Math.floor((z - T.z0) / T.cd); if (i < 0 || j < 0 || i >= T.cnx - 1 || j >= T.cnz - 1) return false; const c = T.cov, k = j * T.cnx + i; return c[k] && c[k + 1] && c[k + T.cnx] && c[k + T.cnx + 1]; };
  // bajo los edificios cerrados el suelo no se ve nunca: esos cuadros no se dibujan
  { const d2 = d / 2, wx = cx * 2 + 1, wz = cz * 2 + 1, ins = new Uint8Array(wx * wz);
    (W.map.bld || []).forEach(b => { if (b.k === 'roof' || b.k === 'stand' || b.k === 'chimney') return; const p = b.p, n = p.length / 2; if (n < 3) return; let z0 = 1e9, z1 = -1e9; for (let k = 0; k < n; k++) { z0 = Math.min(z0, p[k * 2 + 1]); z1 = Math.max(z1, p[k * 2 + 1]); }
      for (let r = Math.max(0, Math.ceil((z0 - T.z0) / d2)), re = Math.min(wz - 1, Math.floor((z1 - T.z0) / d2)); r <= re; r++) { const z = T.z0 + r * d2, xs = []; for (let k = 0, q = n - 1; k < n; q = k++) { const zi = p[k * 2 + 1], zj = p[q * 2 + 1]; if ((zi > z) !== (zj > z)) xs.push((p[q * 2] - p[k * 2]) * (z - zi) / (zj - zi) + p[k * 2]); } xs.sort((u, v) => u - v);
        for (let s = 0; s + 1 < xs.length; s += 2) for (let c = Math.max(0, Math.ceil((xs[s] + .6 - T.x0) / d2)), ce = Math.min(wx - 1, Math.floor((xs[s + 1] - .6 - T.x0) / d2)); c <= ce; c++) ins[r * wx + c] = 1; } });
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) { let all = true; for (let b = 0; b <= 2 && all; b++) for (let a = 0; a <= 2; a++) if (!ins[(j * 2 + b) * wx + i * 2 + a]) { all = false; break; } if (all) { used[j * cx + i] = 2; hidden++; } } }
  for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) { const c = (j * cx + i) * 2; if (parts.has(c) || parts.has(c + 1) || own[c] !== own[c + 1]) continue; kc[j * cx + i] = own[c] ? own[c] : inMap(i, j) ? -1 : -2; }
  for (const B of [16, 8, 4, 2]) for (let j0 = 0; j0 + B <= cz; j0 += B) for (let i0 = 0; i0 + B <= cx; i0 += B) { const k0 = kc[j0 * cx + i0]; if (!k0) continue; let ok = true;
    for (let j = j0; j < j0 + B && ok; j++) for (let i = i0; i < i0 + B; i++) if (used[j * cx + i] || kc[j * cx + i] !== k0) { ok = false; break; } if (!ok) continue;
    const n00 = j0 * nx + i0, h00 = hM[n00], h10 = hM[n00 + B], h01 = hM[n00 + B * nx], h11 = hM[n00 + B * nx + B];
    for (let dj = 0; dj <= B && ok; dj++) for (let di = 0; di <= B; di++) { const nd = n00 + dj * nx + di, pl = di >= dj ? h00 + (h10 - h00) * di / B + (h11 - h10) * dj / B : h00 + (h01 - h00) * dj / B + (h11 - h01) * di / B; if (Math.abs(hM[nd] - pl) > (T.hG[nd] - hM[nd] > .01 ? .1 : .25)) { ok = false; break; } } if (!ok) continue;
    for (let j = j0; j < j0 + B; j++) for (let i = i0; i < i0 + B; i++) used[j * cx + i] = 1; merged += B * B;
    const name = k0 > 0 ? LAYER[areas[k0 - 1].li] : 'base', hex = k0 > 0 ? areas[k0 - 1].hex : k0 === -1 ? URB : GRN, q = gof(Math.floor(i0 / CH), Math.floor(j0 / CH), name), lift = L[name].y, cc = lin(hex), id = palId(hex);
    const v00 = vert(q, n00, i0, j0, lift, cc, id), v10 = vert(q, n00 + B, i0 + B, j0, lift, cc, id), v11 = vert(q, n00 + B * nx + B, i0 + B, j0 + B, lift, cc, id), v01 = vert(q, n00 + B * nx, i0, j0 + B, lift, cc, id); q.g.i.push(v00, v11, v10, v00, v01, v11); }
  for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) { if (used[j * cx + i]) continue; const c = (j * cx + i) * 2, n00 = j * nx + i, ci = Math.floor(i / CH), cj = Math.floor(j / CH);
    for (let s = 0; s < 2; s++) { const o = own[c + s]; let name = 'base', hex = URB;
      if (o) { name = LAYER[areas[o - 1].li]; hex = areas[o - 1].hex; } else { const mx = T.x0 + (i + .5) * d, mz = T.z0 + (j + .5) * d; if (!(mx > bb[0] - mg && mx < bb[2] + mg && mz > bb[1] - mg && mz < bb[3] + mg)) hex = GRN; }
      const q = gof(ci, cj, name), lift = L[name].y, cc = lin(hex), id = palId(hex), a = vert(q, n00, i, j, lift, cc, id), b = s ? vert(q, n00 + nx + 1, i + 1, j + 1, lift, cc, id) : vert(q, n00 + 1, i + 1, j, lift, cc, id), e = s ? vert(q, n00 + nx, i, j + 1, lift, cc, id) : vert(q, n00 + nx + 1, i + 1, j + 1, lift, cc, id);
      q.g.i.push(a, e, b);
      const pl = parts.get(c + s); if (!pl) continue; const lo = o ? areas[o - 1].li : -1, h00 = hM[n00], h10 = hM[n00 + 1], h01 = hM[n00 + nx], h11 = hM[n00 + nx + 1], gx = (s ? h11 - h01 : h10 - h00) / d, gz = (s ? h01 - h00 : h11 - h10) / d, nl = Math.hypot(gx, 1, gz), x0 = T.x0 + i * d, z0 = T.z0 + j * d;
      for (const P of pl) { const A = areas[P[0]]; if (A.li < lo || P[0] === o - 1) continue; const pts = P[1], n = pts.length;
        // recortes que no se van a ver: astillas, los del mismo color que lo que tienen debajo y los que caen enteros bajo el firme de una calle
        if (o && areas[o - 1].hex === A.hex || areaOf(pts) < .4) { pst[2]++; continue; }      /* (los que caen bajo el firme también se dibujan: «firme» incluye los zócalos de los portales, que no se pintan, y quedaban dientes de sierra) */
        const nm = LAYER[A.li], g2 = gof(ci, cj, nm).g, ly = L[nm].y, c2 = lin(A.hex), base = g2.nv; pst[0]++; pst[1] += n - 2;
        for (const pt of pts) g2.v(pt[0], h00 + gx * (pt[0] - x0) + gz * (pt[1] - z0) + ly, pt[1], -gx / nl, 1 / nl, -gz / nl, c2);
        let conv = true, sg = 0; for (let k = 0; k < n && conv; k++) { const p0 = pts[k], p1 = pts[(k + 1) % n], p2 = pts[(k + 2) % n], cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]); if (Math.abs(cr) < 1e-9) continue; if (!sg) sg = Math.sign(cr); else if (Math.sign(cr) !== sg) conv = false; }
        if (conv) { for (let k = 1; k + 1 < n; k++) { if (sg >= 0) g2.i.push(base, base + k + 1, base + k); else g2.i.push(base, base + k, base + k + 1); } }
        else THREE.ShapeUtils.triangulateShape(pts.map(pt => new THREE.Vector2(pt[0], pt[1])), []).forEach(t => { const pa = pts[t[0]], pb = pts[t[1]], pc = pts[t[2]], up = (pb[1] - pa[1]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[1] - pa[1]); if (up >= 0) g2.i.push(base + t[0], base + t[1], base + t[2]); else g2.i.push(base + t[0], base + t[2], base + t[1]); }); } } }
  let tris = 0; geos.forEach(q => { tris += q.g.i.length / 3; addMesh(q.g.build(), q.n); }); W.stats = { terrTris: tris, terrMeshes: geos.size, parts: parts.size, areas: areas.length, merged, hidden, pst };
}
// alrededores: rejilla gruesa hasta donde alcanza la vista, con el agua donde el terreno está a nivel del mar
function scenery(addMesh) {
  const S = T.S, g = new Geo(true, .16), h = S.h, nx = S.nx, d = S.d, cG = lin(0x86a877), cH = lin(0x7a9a6c), cW = lin(0x4f8791), cU = lin(0x9fa593), vs = new Map();
  const vert = (i, j) => { const n = j * nx + i; let v = vs.get(n); if (v !== undefined) return v; const hl = h[i > 0 ? n - 1 : n], hr = h[i < nx - 1 ? n + 1 : n], hu = h[j > 0 ? n - nx : n], hd = h[j < S.nz - 1 ? n + nx : n], gx = (hr - hl) / (2 * d), gz = (hd - hu) / (2 * d), l = Math.hypot(gx, 1, gz), y = h[n];
    // agua solo donde el entorno es llano a nivel del mar; en cuanto un vecino sube, es orilla (si no, la ladera sale pintada de agua, como una rampa)
    const wet = y <= .12 && Math.max(hl, hr, hu, hd) < 1.2, bed = y < -.5;
    v = g.v(S.x0 + i * d, y, S.z0 + j * d, -gx / l, 1 / l, -gz / l, bed ? cU : wet ? cW : y < 9 ? cU : y > 120 ? cH : cG); vs.set(n, v); return v; };
  for (let j = 0; j < S.nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const x = S.x0 + i * d, z = S.z0 + j * d; if (x >= T.x0 && x + d <= T.x1 && z >= T.z0 && z + d <= T.z1) continue; const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), e = vert(i, j + 1); g.i.push(a, c, b, a, e, c); }
  // fondo bajo la malla fina: donde se juntan bloques de distinto tamaño puede quedar una rendija de un píxel, y por ella se vería el cielo
  { const K = 4, ni = Math.floor((T.nx - 1) / K), nj = Math.floor((T.nz - 1) / K), tmp = new Float32Array(T.nx * T.nz), mn = new Float32Array((ni + 1) * (nj + 1)), hM = T.hM, cB = lin(0x8c9682);
    for (let j = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++) { let m = 1e9; for (let q = Math.max(0, i - K); q <= Math.min(T.nx - 1, i + K); q++) m = Math.min(m, hM[j * T.nx + q]); tmp[j * T.nx + i] = m; }
    for (let j = 0; j <= nj; j++) for (let i = 0; i <= ni; i++) { let m = 1e9; for (let q = Math.max(0, j * K - K); q <= Math.min(T.nz - 1, j * K + K); q++) m = Math.min(m, tmp[q * T.nx + i * K]); mn[j * (ni + 1) + i] = m - .6; }
    const u = new Geo(true, .16), vv = new Map(), vt = (i, j) => { const n = j * (ni + 1) + i; let v = vv.get(n); if (v === undefined) { v = u.v(T.x0 + i * K * T.d, mn[n], T.z0 + j * K * T.d, 0, 1, 0, cB); vv.set(n, v); } return v; };
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const a = vt(i, j), b = vt(i + 1, j), c = vt(i + 1, j + 1), e = vt(i, j + 1); u.i.push(a, c, b, a, e, c); }
    splitGeo(u, 960).forEach(q => addMesh(q, 'base')); }
  splitGeo(g, 960).forEach(q => addMesh(q, 'base'));
}

// escaleras de verdad sobre el relieve: huellas horizontales y contrahuellas que siguen la rampa del suelo; donde casi no hay pendiente, rellano
// rampa o escalera mecánica al aire libre: cinta metálica con estrías, zócalos, pasamanos de goma negra y marquesina de cristal sobre postes
function conveyor(g, gr, r) {
  const P = densify(r.p, 1.5), n = P.length / 2; if (n < 2) return; const hw = Math.min(1.1, r.w / 2), cB = lin(0x8c939a), cS = lin(0xb9bfc5), cK = lin(0x23272b), cG = lin(0x9fc4d2), cP = lin(0x6b7278);
  const X = [], Z = [], Y = [], NX = [], NZ = []; for (let k = 0; k < n; k++) { const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1), ux = P[b * 2] - P[a * 2], uz = P[b * 2 + 1] - P[a * 2 + 1], l = Math.hypot(ux, uz) || 1; X.push(P[k * 2]); Z.push(P[k * 2 + 1]); Y.push(gY(P[k * 2], P[k * 2 + 1]) + .22); NX.push(-uz / l); NZ.push(ux / l); }
  const q = (G, A, B, C, D, col, nx, ny, nz) => G.quad(G.v(A[0], A[1], A[2], nx, ny, nz, col), G.v(B[0], B[1], B[2], nx, ny, nz, col), G.v(C[0], C[1], C[2], nx, ny, nz, col), G.v(D[0], D[1], D[2], nx, ny, nz, col));
  for (let k = 0; k + 1 < n; k++) { const L = (s, o, dy) => [X[k + s] + NX[k + s] * o, Y[k + s] + dy, Z[k + s] + NZ[k + s] * o];
    q(g, L(0, -hw + .25, 0), L(1, -hw + .25, 0), L(1, hw - .25, 0), L(0, hw - .25, 0), k % 2 ? cB : lin(0x828990), 0, 1, 0);      /* la cinta */
    for (const sd of [-1, 1]) { const o = sd * (hw - .12); q(g, L(0, o, -.4), L(1, o, -.4), L(1, o, .95), L(0, o, .95), cS, NX[k] * sd, 0, NZ[k] * sd); q(g, L(0, o + sd * .13, .95), L(1, o + sd * .13, .95), L(1, o - sd * .13, .95), L(0, o - sd * .13, .95), cK, 0, 1, 0);      /* zócalo y pasamanos */
      q(g, L(0, o + sd * .13, -.4), L(1, o + sd * .13, -.4), L(1, o + sd * .13, .95), L(0, o + sd * .13, .95), cS, NX[k] * sd, 0, NZ[k] * sd); }
    q(gr, L(0, -hw - .2, 2.75), L(1, -hw - .2, 2.75), L(1, hw + .2, 2.75), L(0, hw + .2, 2.75), cG, 0, 1, 0);      /* marquesina */
    if (k % 3 === 0) for (const sd of [-1, 1]) { const o = sd * (hw + .1), x = X[k] + NX[k] * o, z = Z[k] + NZ[k] * o, y = Y[k]; q(gr, [x - .05, y - .3, z], [x + .05, y - .3, z], [x + .05, y + 2.75, z], [x - .05, y + 2.75, z], cP, 0, 0, 1); q(gr, [x, y - .3, z - .05], [x, y - .3, z + .05], [x, y + 2.75, z + .05], [x, y + 2.75, z - .05], cP, 1, 0, 0); } }
}
function stairs(g, p, w, gr) {
  const cT = lin(0xbdb7a8), cR = lin(0x8f897c), cS = lin(0x9c968a), cL = lin(0xb3ad9f), h = w / 2, P = densify(p, .25), n = P.length / 2, S = [0]; for (let k = 1; k < n; k++) S.push(S[k - 1] + Math.hypot(P[k * 2] - P[k * 2 - 2], P[k * 2 + 1] - P[k * 2 - 1]));
  const L = S[n - 1]; if (L < .6) return; const o = {}, at = (s, o) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } const l = S[hi] - S[lo] || 1, f = Math.max(0, Math.min(1, (s - S[lo]) / l)); o.x = P[lo * 2] + (P[hi * 2] - P[lo * 2]) * f; o.z = P[lo * 2 + 1] + (P[hi * 2 + 1] - P[lo * 2 + 1]) * f; let a = Math.max(0, lo - 2), b = Math.min(n - 1, hi + 2); o.ux = P[b * 2] - P[a * 2]; o.uz = P[b * 2 + 1] - P[a * 2 + 1]; const ul = Math.hypot(o.ux, o.uz) || 1; o.ux /= ul; o.uz /= ul; o.y = gY(o.x, o.z); return o; };
  const fq = (A, B, C, D, nx, ny, nz, col) => { const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2], fx = C[0] - A[0], fy = C[1] - A[1], fz = C[2] - A[2], d = (ey * fz - ez * fy) * nx + (ez * fx - ex * fz) * ny + (ex * fy - ey * fx) * nz, v = q => g.v(q[0], q[1], q[2], nx, ny, nz, col); if (d >= 0) g.quad(v(A), v(B), v(C), v(D)); else g.quad(v(A), v(D), v(C), v(B)); };
  let s = 0, prevY = null; const a = {}, b = {};
  while (s < L - .05) { at(s, a); at(Math.min(L, s + 1), b); const sl = Math.abs(b.y - a.y) / Math.max(.2, Math.min(L, s + 1) - s), flat = sl < .07, d = Math.min(L - s, flat ? 1.5 : Math.max(.32, Math.min(1.1, .17 / sl))); at(s + d, b);
    const nx = -a.uz, nz = a.ux, mx = -b.uz, mz = b.ux, A0 = [a.x + nx * h, 0, a.z + nz * h], A1 = [a.x - nx * h, 0, a.z - nz * h], B0 = [b.x + mx * h, 0, b.z + mz * h], B1 = [b.x - mx * h, 0, b.z - mz * h];
    if (flat) { const ya = a.y + .2, yb = b.y + .2; fq([A0[0], ya, A0[2]], [B0[0], yb, B0[2]], [B1[0], yb, B1[2]], [A1[0], ya, A1[2]], 0, 1, 0, cL); prevY = yb; s += d; continue; }
    const up = b.y >= a.y, yt = Math.max(a.y, b.y) + .2, yl = Math.min(a.y, b.y) - .15;
    fq([A0[0], yt, A0[2]], [B0[0], yt, B0[2]], [B1[0], yt, B1[2]], [A1[0], yt, A1[2]], 0, 1, 0, cT);      // huella
    if (up) fq([A0[0], yl, A0[2]], [A1[0], yl, A1[2]], [A1[0], yt, A1[2]], [A0[0], yt, A0[2]], -a.ux, 0, -a.uz, cR); else fq([B0[0], yl, B0[2]], [B1[0], yl, B1[2]], [B1[0], yt, B1[2]], [B0[0], yt, B0[2]], b.ux, 0, b.uz, cR);      // contrahuella, mirando cuesta abajo
    fq([A0[0], yl, A0[2]], [B0[0], yl, B0[2]], [B0[0], yt, B0[2]], [A0[0], yt, A0[2]], nx, 0, nz, cS); fq([A1[0], yl, A1[2]], [B1[0], yl, B1[2]], [B1[0], yt, B1[2]], [A1[0], yt, A1[2]], -nx, 0, -nz, cS);      // zancas a los lados
    prevY = yt; s += d; }
  void prevY; void o;
  // pasamanos a los dos lados en los tramos con pendiente: un poste cada 3 m y la barra entre ellos
  if (gr && L > 5) { const cM = lin(0x4a4f55), DS = 3, m = Math.max(1, Math.round(L / DS)), q4 = (A, B, C, D, nx, nz) => gr.quad(gr.v(A[0], A[1], A[2], nx, .3, nz, cM), gr.v(B[0], B[1], B[2], nx, .3, nz, cM), gr.v(C[0], C[1], C[2], nx, .3, nz, cM), gr.v(D[0], D[1], D[2], nx, .3, nz, cM));
    for (let k = 0; k < m; k++) { at(L * k / m, a); at(L * (k + 1) / m, b); const ya = a.y + .2, yb = b.y + .2, len = L / m; if (Math.abs(yb - ya) / len < .1) continue;
      for (const sd of [1, -1]) { const ax = a.x - a.uz * (h - .07) * sd, az = a.z + a.ux * (h - .07) * sd, bx = b.x - b.uz * (h - .07) * sd, bz = b.z + b.ux * (h - .07) * sd, nx = -a.uz * sd, nz = a.ux * sd;
        q4([ax, ya + .9, az], [bx, yb + .9, bz], [bx, yb + .98, bz], [ax, ya + .98, az], nx, nz);
        q4([ax - a.ux * .04, ya, az - a.uz * .04], [ax + a.ux * .04, ya, az + a.uz * .04], [ax + a.ux * .04, ya + .94, az + a.uz * .04], [ax - a.ux * .04, ya + .94, az - a.uz * .04], nx, nz);
        if (k === m - 1) q4([bx - b.ux * .04, yb, bz - b.uz * .04], [bx + b.ux * .04, yb, bz + b.uz * .04], [bx + b.ux * .04, yb + .94, bz + b.uz * .04], [bx - b.ux * .04, yb + .94, bz - b.uz * .04], nx, nz); } } }
}

// ---------- construcción
const LAYER = ['base', 'land', 'grass', 'park', 'lot', 'plaza', 'sport', 'water', 'walk', 'path', 'road', 'paint'];
const GKIND = { ind: ['land', 0xa5a199], yard: ['land', 0xc4bba4], dirt: ['land', 0xb39f7e], grass: ['grass', 0x86b068], allot: ['grass', 0x9aa868], park: ['park', 0x76a85c], wood: ['park', 0x4f8546], cem: ['park', 0x8fa582], lot: ['lot', 0x6f757b], plaza: ['plaza', 0xcdc5b3], paved: ['plaza', 0xb7b3a6], play: ['sport', 0xd89a5a], pool: ['sport', 0x4fb3e0], pitch: ['sport', 0x4f9a5a] };
const SPORT = { soccer: 0x4b9a54, football: 0x4b9a54, basketball: 0xb5604a, tennis: 0x3f8f6a, padel: 0x3a78b8, multi: 0x5a8ab0, track: 0xb0553f, athletics: 0xb0553f, running: 0xb0553f, boules: 0xc2ad86, skateboard: 0x9aa0a6, handball: 0x3a78b8, futsal: 0x3a78b8, pelota: 0x3f8f6a };
export function buildWorld(M, quality) {
  W.map = M; if (!W.bounds) W.bounds = M.bbox.slice(); const root = W.group = new THREE.Group(), gt = groundTextures(), ft = facadeTextures(), B = W.bounds, bb = M.bbox, mg = M.margin || 0;
  prepRoads(M);
  // rejilla de calles para consultas (¿esto cae en la calzada?)
  M.roads.forEach((r, ri) => { if (!ROAD[r.t]) return; for (let k = 0; k + 3 < r.p.length; k += 2) { const id = W.rsegs.length / 5; W.rsegs.push(r.p[k], r.p[k + 1], r.p[k + 2], r.p[k + 3], ri); const a = Math.floor(Math.min(r.p[k], r.p[k + 2]) / 40), b = Math.floor(Math.max(r.p[k], r.p[k + 2]) / 40), c = Math.floor(Math.min(r.p[k + 1], r.p[k + 3]) / 40), d = Math.floor(Math.max(r.p[k + 1], r.p[k + 3]) / 40); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const kk = key(i, j); let l = W.rgrid.get(kk); if (!l) W.rgrid.set(kk, l = []); l.push(id); } } });
  // relieve: malla de alturas con las calles niveladas (si el mapa trae modelo del terreno)
  { const ways = [];
    M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp) return; ways.push({ r, car: !!sp[3], p: r.p, hw: r.w / 2 + (sp[3] ? (r.sw || (r.t !== 'service' && r.t !== 'track' ? .8 : 0)) : 0), ms: r.t === 'steps' || r.cv ? 1.1 : !sp[3] ? .5 : r.t === 'service' || r.t === 'track' ? .24 : .2, bridge: !!r.b, flat: true, sm: sp[3] ? .3 : r.t === 'steps' || r.cv ? 0 : .15 }); });
    (M.rail || []).forEach((p, i) => { const f = (M.railT || [])[i] || 0; if (f === 2) { ways.push({ rail: i, p, hw: 1.7, ms: .035, ghost: true, sm: .4 }); return; } ways.push({ rail: i, p, hw: 1.7, ms: .035, bridge: f === 1, flat: true, sm: .4 }); });      // los túneles cuentan para el perfil de la vía, pero no tocan el terreno
    initTerrain(M, ways, W.ext, M.bld.filter(b => !b.k || b.k === 'house' || b.k === 'civic').map(b => b.p));
    W.railDeck = []; ways.forEach(w => { if (!w.deck) return; if (w.r) w.r.deck = w.deck; else W.railDeck[w.rail] = w.deck; }); }
  // capas de suelo: cada una un poco por encima de la anterior y con su textura
  const UVK = { base: .16, land: .16, lot: .3, road: .3, grass: .11, park: .11, sport: .11, plaza: .42, walk: .42, path: .42, water: .04, paint: 0 }, TEX = { base: gt.soft, land: gt.soft, lot: gt.grain, road: gt.grain, grass: gt.turf, park: gt.turf, sport: gt.turf, plaza: gt.tile, walk: gt.tile, path: gt.tile, water: gt.wave, paint: null };
  const L = {}; LAYER.forEach((n, i) => { L[n] = { g: new Geo(!!TEX[n], UVK[n]), y: i * .012, i, uv: !!TEX[n], k: UVK[n] }; });
  if (T.on) { L.walk.y = .11; L.path.y = .13; L.road.y = .17; L.paint.y = .21; }      // con relieve, las cintas de calles distintas no casan al milímetro: más aire entre acera, asfalto y pintura
  const deckMarks = [], areas = [], waterFar = new Geo(true, UVK.water);      // geometría que va sobre un puente; polígonos de suelo que caen en la malla fina; agua que sigue más allá del mapa
  const area = (p, n, hex) => { const b = bboxOf(p); if (T.on && b[2] > T.x0 && b[0] < T.x1 && b[3] > T.z0 && b[1] < T.z1) areas.push({ p, li: L[n].i, hex, b }); else polyTiled(L[n].g, p, L[n].y, hex, 160); };
  // suelo base sin relieve: gris urbano dentro del mapa, verde fuera (con relieve lo ponen la malla del terreno y los alrededores)
  if (!T.on) { const g = L.base.g, cu = lin(0xada79a), cg = lin(0x86a877), step = 160, m = 1900, x0 = Math.floor((B[0] - m) / step) * step, z0 = Math.floor((B[1] - m) / step) * step;
    for (let x = x0; x < B[2] + m; x += step) for (let z = z0; z < B[3] + m; z += step) { const cx = x + step / 2, cz = z + step / 2, c = cx > bb[0] - mg && cx < bb[2] + mg && cz > bb[1] - mg && cz < bb[3] + mg ? cu : cg; g.quad(g.v(x, 0, z, 0, 1, 0, c), g.v(x, 0, z + step, 0, 1, 0, c), g.v(x + step, 0, z + step, 0, 1, 0, c), g.v(x + step, 0, z, 0, 1, 0, c)); } }
  // agua: lo que toca el borde del mapa se alarga hasta el horizonte
  { const lim = mg ? [bb[0] - mg - 15, bb[1] - mg - 15, bb[2] + mg + 15, bb[3] + mg + 15] : null, FAR = 2600;
    (M.water || []).forEach((p0, wi) => { const xw = waterExt(M, p0), p = xw.p, far = xw.far;
      W.water.push({ p, b: bboxOf(p) }); if (!T.on) { polyTiled(L.water.g, p, L.water.y, 0x4f8791, 160); return; }
      area(p0, 'land', 0x5f6c50); polyTiled(L.water.g, p0, (T.level[wi] || 0) + .06, 0x4f8791, 160); if (far) polyTiled(waterFar, p, (T.level[wi] || 0) + .03, 0x4f8791, 160); }); }      /* con relieve: la lámina de agua va plana a su nivel; debajo, el lecho y las orillas en color de ribera */
  (M.green || []).forEach(a => { const gk = GKIND[a.k]; if (!gk) return; area(a.p, gk[0], a.k === 'pitch' ? (SPORT[a.s] || gk[1]) : gk[1]);
    if (a.k === 'pitch' && a.p.length >= 8 && a.s !== 'track' && a.s !== 'boules') { const q = a.p.concat([a.p[0], a.p[1]]); ribbon(L.paint.g, offsetLine(q, 0), .12, L.paint.y, 0xf2efe6, -.25); } });
  // vías
  const gs = L.walk.g, gr = L.road.g, gl = L.paint.g, gp = L.path.g, ys = L.walk.y, yr = L.road.y, yl = L.paint.y, yp = L.path.y, WHITE = 0xeeebe2;
  const ACOL = r => r.t === 'service' || r.t === 'track' ? 0x5f6468 : r.t === 'living_street' ? 0x6b6964 : r.x ? 0x4b5358 : 0x4f565b;
  const stairG = new Geo(), railG = new Geo(); let nStairs = 0;
  const onDeck = (dk, gs2, f) => { if (!dk) { f(); return; } const m0 = gs2.map(g => g.nv); ribDense = true; f(); ribDense = false; gs2.forEach((g, i) => { if (g.nv > m0[i]) deckMarks.push([g, m0[i], g.nv, dk]); }); };
  M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp) return; const w = r.w; onDeck(r.deck, [gs, gr, gl, gp], () => {
    if (!sp[3] && r.cv && T.on && !r.deck) { conveyor(stairG, railG, r); return; }
    if (!sp[3]) { if (r.t === 'steps') { if (T.on && !r.deck) { offCarriage(r.p).forEach(q => stairs(stairG, q, w, r.hr === 0 ? null : railG));      /* sin pasamanos si el mapa dice handrail=no */ nStairs++; } else { ribbon(gp, r.p, w, yp, 0xb3ad9f); dashes(gl, r.p, yl, 0x8d8779, .16, .34, w, .2); } } else ribbon(gp, r.p, w, yp, r.t === 'cycleway' ? 0xb5503c : r.t === 'path' ? 0xbfae8c : r.t === 'pedestrian' ? 0xcfc6b2 : 0xcbc4b2); return; }
    if (T.on) { // con relieve, la acera va en dos cintas a los lados (lo de debajo del asfalto no se ve y costaba la mitad de los triángulos)
      if (r.sw || r.t !== 'service' && r.t !== 'track') { const sw = r.sw || .8, wd = sw + .45, o = w / 2 + sw / 2 - .025, col = r.sw ? 0xb9bcb4 : 0x8f9488;      /* la acera pisa 25 cm de calzada (para que no quede rendija) y sobresale 20 por fuera */ ribbon(gs, r.p, wd, ys, col, o); ribbon(gs, r.p, wd, ys, col, -o); } }
    else if (r.sw) ribbon(gs, r.p, w + r.sw * 2, ys, 0xb9bcb4); else if (r.t !== 'service' && r.t !== 'track') ribbon(gs, r.p, w + 1.6, ys, 0x8f9488);
    ribbon(gr, r.p, w, yr, ACOL(r));
    if (T.on && r.sw && r.t !== 'service' && r.t !== 'track' && !r.deck) for (const sd of [1, -1]) clearOfJunc(offsetLine(r.p, sd * (w / 2 + .1)), .6).forEach(q => { if (q.length >= 6) ribbon(gl, simplifyLine(q), .2, yl - .02, 0xd2cfc4); });      /* bordillo: una franja clara de granito entre el asfalto y la acera */
    if (r.t === 'motorway' || r.t === 'trunk') { ribbon(gl, r.p, .22, yl, WHITE, w / 2 - .5); ribbon(gl, r.p, .22, yl, WHITE, -w / 2 + .5); if (!r.o) { ribbon(gl, r.p, .18, yl, WHITE, .22); ribbon(gl, r.p, .18, yl, WHITE, -.22); } dashes(gl, offsetLine(r.p, w / 4), yl, WHITE, 4, 8, .16); dashes(gl, offsetLine(r.p, -w / 4), yl, WHITE, 4, 8, .16); }
    else if (r.t !== 'service' && r.t !== 'track' && !r.rb) { const c0 = r.c0, tw = w - r.pk, ls = r.t !== 'living_street';      // (desplazamientos: positivo a la derecha del sentido dibujado)
      const dash = (off, a, b2) => clearOfJunc(offsetLine(r.p, off), 1.2).forEach(q => dashes(gl, q, yl, WHITE, a, b2, .14)), line = (off, wd) => clearOfJunc(offsetLine(r.p, off), 2.2).forEach(q => { if (q.length >= 6) ribbon(gl, simplifyLine(q), wd, yl, WHITE); });
      if (ls && !r.o && tw >= 5.2) { if (r.ln >= 4) { line(c0 - .12, .12); line(c0 + .12, .12); for (const sd of [-1, 1]) dash(c0 + sd * tw / 4, 3, 6); } else dash(c0, 3, 5); }      // eje (doble continua y carriles si hay dos por sentido)
      else if (ls && r.o && r.ln >= 2) for (let i = 1; i < r.ln; i++) dash(c0 - tw / 2 + tw * i / r.ln, 3, 6);   // carriles del mismo sentido
      if (r.pkR) line(w / 2 - r.pkR, .1); if (r.pkL) line(-(w / 2 - r.pkL), .1);                // rayas de las bandas de aparcamiento
      if (r.t === 'primary' || r.t === 'secondary') { ribbon(gl, r.p, .12, yl, WHITE, w / 2 - .25); ribbon(gl, r.p, .12, yl, WHITE, -w / 2 + .25); } } }); });
  // tapas redondas en los extremos de cada vía: sin ellas quedan cuñas entre tramos que giran
  { const ends = new Map(), put = (x, z, w, sw, col) => { const k = Math.round(x * 5) + ',' + Math.round(z * 5), e = ends.get(k); if (!e) ends.set(k, { x, z, w, sw, col, n: 1 }); else { e.w = Math.max(e.w, w); e.sw = Math.max(e.sw, sw); e.n++; } };
    M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp || !sp[3]) return; const n = r.p.length, col = ACOL(r); put(r.p[0], r.p[1], r.w, r.sw, col); put(r.p[n - 2], r.p[n - 1], r.w, r.sw, col); });
    const disc = (g, x, z, rad, y, hex) => { const c = lin(hex), o = g.v(x, y, z, 0, 1, 0, c); let prev = -1, first = -1; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.2832, v = g.v(x + Math.sin(a) * rad, y, z + Math.cos(a) * rad, 0, 1, 0, c); if (prev >= 0) g.i.push(o, prev, v); else first = v; prev = v; } g.i.push(o, prev, first); };
    ends.forEach(e => { disc(gr, e.x, e.z, e.w / 2, yr, e.col); if (e.sw) disc(gs, e.x, e.z, e.w / 2 + e.sw, ys, 0xb9bcb4); }); }
  // pasos de cebra: barras blancas a lo largo de la calle, repartidas a lo ancho
  { const C = M.cross || [], c = lin(WHITE); for (let k = 0; k < C.length; k += 5) { const x = C[k], z = C[k + 1], a = C[k + 2], w = C[k + 3], ux = Math.sin(a), uz = Math.cos(a), nx = -uz, nz = ux, n = Math.max(2, Math.floor((w - .5) / 1)), s0 = -(n - 1) / 2;
      for (let i = 0; i < n; i++) { const o = (s0 + i) * 1, cx = x + nx * o, cz = z + nz * o, hl = 1.7, hw = .25; gl.quad(gl.v(cx - ux * hl + nx * hw, yl, cz - uz * hl + nz * hw, 0, 1, 0, c), gl.v(cx + ux * hl + nx * hw, yl, cz + uz * hl + nz * hw, 0, 1, 0, c), gl.v(cx + ux * hl - nx * hw, yl, cz + uz * hl - nz * hw, 0, 1, 0, c), gl.v(cx - ux * hl - nx * hw, yl, cz - uz * hl - nz * hw, 0, 1, 0, c)); } } }
  // vías de tren: balasto, traviesas y carriles (los túneles no se dibujan)
  (M.rail || []).forEach((p, i) => { if (T.on && (M.railT || [])[i] === 2) return; onDeck(W.railDeck[i], [L.lot.g, gp, gl], () => { ribbon(L.lot.g, p, 3.4, L.lot.y, 0x857e72); dashes(gp, p, yp, 0x5c4a3a, .26, .9, 2.5, .3); ribbon(gl, p, .12, yl, 0x6b7078, .72); ribbon(gl, p, .12, yl, 0x6b7078, -.72); }); });
  // zócalo pavimentado alrededor de los edificios de viviendas: une la acera de la calle con la fachada
  M.bld.forEach(b => { if (b.k && b.k !== 'house' && b.k !== 'civic') return; const p = b.p, n = p.length / 2; if (n < 3) return; let a2 = 0; const ring = []; for (let k = 0; k < n; k++) { const j = (k + 1) % n; a2 += p[k * 2] * p[j * 2 + 1] - p[j * 2] * p[k * 2 + 1]; ring.push([p[k * 2], p[k * 2 + 1]]); } if (a2 < 0) ring.reverse();
    for (let k = 0; k < n; k++) { const A = ring[k], B2 = ring[(k + 1) % n], dx = B2[0] - A[0], dz = B2[1] - A[1], l = Math.hypot(dx, dz); if (l < .3) continue; const nx = dz / l * 3.2, nz = -dx / l * 3.2, c = lin(0xb9bcb4), g = L.walk.g, y = L.walk.y - .004, m = T.on ? Math.max(1, Math.ceil(l / 4)) : 1;
      // (tramos de 4 m que siguen el suelo; donde el suelo es un plano se juntan varios en uno)
      const hi = [], ho = []; if (T.on) for (let q = 0; q <= m; q++) { const x = A[0] + dx * q / m, z = A[1] + dz * q / m; hi.push(gY(x, z)); ho.push(gY(x + nx, z + nz)); }
      for (let q = 0; q < m;) { let e = q + 1; while (T.on && e < m && e - q < 8) { const e2 = e + 1; let ok = true; for (let t = q + 1; t <= e && ok; t++) { const f = (t - q) / (e2 - q); if (Math.abs(hi[t] - (hi[q] + (hi[e2] - hi[q]) * f)) > .045 || Math.abs(ho[t] - (ho[q] + (ho[e2] - ho[q]) * f)) > .045) ok = false; } if (!ok) break; e = e2; }
        const ax = A[0] + dx * q / m, az = A[1] + dz * q / m, bx = A[0] + dx * e / m, bz = A[1] + dz * e / m; g.quad(g.v(ax, y, az, 0, 1, 0, c), g.v(bx, y, bz, 0, 1, 0, c), g.v(bx + nx, y, bz + nz, 0, 1, 0, c), g.v(ax + nx, y, az + nz, 0, 1, 0, c)); q = e; } } });
  // mallas: con relieve, la malla del terreno por zonas y todo lo demás apoyado encima y partido en trozos; sin él, una malla por capa
  LAYER.forEach(n => { const ly = L[n]; W.mats['g_' + n] = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX[n] || null, polygonOffset: ly.i > 0, polygonOffsetFactor: 0, polygonOffsetUnits: -ly.i * 3 }); });
  const addMesh = (geo, n) => { const mesh = new THREE.Mesh(geo, W.mats['g_' + n]); mesh.receiveShadow = n !== 'water'; mesh.matrixAutoUpdate = false; if (T.on) geo.computeBoundingSphere(); else mesh.frustumCulled = false; root.add(mesh); };
  if (T.on) { terrainMeshes(L, areas, addMesh, bb, mg); scenery(addMesh); if (waterFar.nv) splitGeo(waterFar, 960).forEach(q => addMesh(q, 'water')); }
  LAYER.forEach(n => { const g = L[n].g; if (!g.nv) return; if (!T.on) { addMesh(g.build(), n); return; } if (W.stats) (W.stats.rib || (W.stats.rib = {}))[n] = g.i.length / 3; if (n !== 'water') drape(g, deckMarks); splitGeo(g, 320).forEach(q => addMesh(q, n)); });      /* el agua ya va a su cota: drapeada, en las orillas treparía por el talud */
  W.mats.water = W.mats.g_water;
  // huecos de los pasos bajo edificios: se abren en la colisión y se pinta la boca
  portals = new Map(); { const P = M.portals || []; for (let k = 0; k < P.length; k += 6) { const kk = key(Math.floor(P[k] / CELL), Math.floor(P[k + 1] / CELL)); let l = portals.get(kk); if (!l) portals.set(kk, l = []); l.push([P[k], P[k + 1], P[k + 3]]); } }
  // rótulos de comercios por edificio, para saber qué paredes llevan escaparates
  const shops = new Map(); { const bg = new Map(); M.bld.forEach((b, i) => { const q = bboxOf(b.p); for (let x = Math.floor((q[0] - 1) / 40); x <= Math.floor((q[2] + 1) / 40); x++) for (let z = Math.floor((q[1] - 1) / 40); z <= Math.floor((q[3] + 1) / 40); z++) { const kk = key(x, z); let l = bg.get(kk); if (!l) bg.set(kk, l = []); l.push(i); } });
    (M.poi || []).forEach(p => { if (p.length < 7) return; const l = bg.get(key(Math.floor(p[4] / 40), Math.floor(p[5] / 40))); if (!l) return; let best = -1, bd = .8; l.forEach(i => { const q = M.bld[i].p, n = q.length / 2; for (let k = 0; k < n; k++) { const j = (k + 1) % n, ax = q[k * 2], az = q[k * 2 + 1], ex = q[j * 2] - ax, ez = q[j * 2 + 1] - az, t = clamp(((p[4] - ax) * ex + (p[5] - az) * ez) / (ex * ex + ez * ez || 1), 0, 1), d = Math.hypot(p[4] - ax - ex * t, p[5] - az - ez * t); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0) { let s = shops.get(best); if (!s) shops.set(best, s = []); s.push([p[4], p[5]]); p.bi = best; } }); }
  // edificios, por trozos de 320 m para que la cámara descarte los que no ve
  const wallM = W.mats.wall = new THREE.MeshLambertMaterial({ vertexColors: true, map: ft.win, emissiveMap: ft.winLit, emissive: 0xffffff, emissiveIntensity: 0 });
  const baseM = W.mats.shop = new THREE.MeshLambertMaterial({ vertexColors: true, map: ft.base, emissiveMap: ft.baseLit, emissive: 0xffffff, emissiveIntensity: 0 }), lit = mat('lit');
  [ft.win, ft.winLit, ft.base, ft.baseLit].forEach(t => { t.wrapS = THREE.ClampToEdgeWrapping; });
  const chunks = new Map(), CH = 320;
  M.bld.forEach((b, i) => { const k = Math.floor(b.p[0] / CH) + ',' + Math.floor(b.p[1] / CH); let ch = chunks.get(k); if (!ch) chunks.set(k, ch = { wall: new Geo(true), base: new Geo(true), plain: new Geo(), glass: new Geo() }); addBuilding(ch, b, i, shops); });
  // túneles de los pasos: paredes y techo oscuros, y la boca en la fachada
  { const dark = new Geo(), mouth = new Geo(), c1 = lin(0x15171a), c2 = lin(0x202327), c3 = lin(0x0d0e10); W.tubes = (M.tubes || []).map(t => ({ p: t.p, hw: t.w / 2, h: t.h, b: bboxOf(t.p) }));
    (M.tubes || []).forEach(t => { const hw = t.w / 2, Lp = offsetLine(t.p, hw), Rp = offsetLine(t.p, -hw), n = t.p.length / 2;
      for (let k = 0; k + 1 < n; k++) { [[Lp, 1], [Rp, -1]].forEach(q => { const p = q[0], ax = p[k * 2], az = p[k * 2 + 1], bx = p[k * 2 + 2], bz = p[k * 2 + 3], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * q[1], nz = dx / l * q[1]; const g0 = T.on ? Math.min(gY(ax, az), gY(bx, bz)) - .5 : 0, g1 = (T.on ? Math.max(gY(ax, az), gY(bx, bz)) + RISE : 0) + t.h; if (q[1] > 0) dark.wall(bx, bz, ax, az, g0, g1, -nx, -nz, c2); else dark.wall(ax, az, bx, bz, g0, g1, nx, nz, c2); W.segs.push(ax, az, bx, bz, g1); });
        const cy = (x, z) => (T.on ? gY(x, z) + RISE : 0) + t.h; dark.quad(dark.v(Lp[k * 2], cy(Lp[k * 2], Lp[k * 2 + 1]), Lp[k * 2 + 1], 0, -1, 0, c1), dark.v(Rp[k * 2], cy(Rp[k * 2], Rp[k * 2 + 1]), Rp[k * 2 + 1], 0, -1, 0, c1), dark.v(Rp[k * 2 + 2], cy(Rp[k * 2 + 2], Rp[k * 2 + 3]), Rp[k * 2 + 3], 0, -1, 0, c1), dark.v(Lp[k * 2 + 2], cy(Lp[k * 2 + 2], Lp[k * 2 + 3]), Lp[k * 2 + 3], 0, -1, 0, c1)); } });
    const P = M.portals || []; for (let k = 0; k < P.length; k += 6) { if (!P[k + 4]) continue; const nx = Math.sin(P[k + 2]), nz = Math.cos(P[k + 2]), tx = nz, tz = -nx, hw = P[k + 3], x = P[k] + nx * .05, z = P[k + 1] + nz * .05; const my = T.on ? gY(P[k], P[k + 1]) + RISE - .2 : 0; mouth.wall(x + tx * hw, z + tz * hw, x - tx * hw, z - tz * hw, my, my + P[k + 5] + (T.on ? .2 : 0), nx, nz, c3); }
    if (dark.nv) { const m = new THREE.Mesh(dark.build(), W.mats.dark = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.matrixAutoUpdate = false; root.add(m); }
    if (mouth.nv) { const m = new THREE.Mesh(mouth.build(), new THREE.MeshBasicMaterial({ vertexColors: true })); m.matrixAutoUpdate = false; root.add(m); } }      // la boca solo se ve desde fuera: desde dentro se ve la calle al fondo
  const glassM = W.mats.glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide });
  chunks.forEach(ch => { [[ch.wall, wallM], [ch.base, baseM], [ch.plain, lit]].forEach(q => { if (!q[0].nv) return; const m = new THREE.Mesh(q[0].build(), q[1]); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); }); if (ch.glass.nv) { const m = new THREE.Mesh(ch.glass.build(), glassM); m.matrixAutoUpdate = false; m.renderOrder = 3; root.add(m); } });
  // bocas de túnel del tren: frente de hormigón con el hueco en negro (las vías dobles comparten boca)
  if (T.on && T.mouths && T.mouths.length) { const g = new Geo(), cC = 0xa9a79f, cD = lin(0x0b0c0e), used = new Set(), Ms = T.mouths;
    Ms.forEach((m, i) => { if (used.has(i)) return; let x = m.x, z = m.z, y = m.y, half = 2.3; for (let j = i + 1; j < Ms.length; j++) { if (used.has(j)) continue; const q = Ms[j], dd = Math.hypot(q.x - m.x, q.z - m.z); if (dd < 8 && q.ux * m.ux + q.uz * m.uz > .8) { used.add(j); x = (m.x + q.x) / 2; z = (m.z + q.z) / 2; y = Math.min(m.y, q.y); half = dd / 2 + 2.3; break; } }
      const ux = m.ux, uz = m.uz, px = -uz, pz = ux, fx = x + ux * 1.4, fz = z + uz * 1.4, yaw = Math.atan2(ux, uz), v = new Vox(), HO = 5.2, HT = 6.6, W2 = half + 1.5;
      // dos machones, el dintel y dos aletas que contienen el talud
      v.at(fx, y - .6, fz, yaw); v.bx(-W2, 0, -.5, -half, HT + .6, .5, cC); v.bx(half, 0, -.5, W2, HT + .6, .5, cC); v.bx(-half, HO + .6, -.5, half, HT + .6, .5, cC); v.bx(-W2 - .3, HT + .6, -.6, W2 + .3, HT + .95, .6, 0x8f8d86);
      v.bx(-W2 - 3.2, 0, -.35, -W2, HT * .62, .35, cC); v.bx(W2, 0, -.35, W2 + 3.2, HT * .62, .35, cC);
      v.bx(-W2, HT + .25, .5, W2, HT + .6, 10, 0x9a988f); v.bx(-W2, 0, .5, -half - .15, HT + .25, 10, 0x9a988f); v.bx(half + .15, 0, .5, W2, HT + .25, 10, 0x9a988f); v.at(); g.add(v);      // cajón de entrada: tapa el tren hasta que el monte lo cubre
      const bx = fx + ux * .35, bz = fz + uz * .35; g.quad(g.v(bx - px * half, y - .2, bz - pz * half, -ux, 0, -uz, cD), g.v(bx + px * half, y - .2, bz + pz * half, -ux, 0, -uz, cD), g.v(bx + px * half, y + HO + .1, bz + pz * half, -ux, 0, -uz, cD), g.v(bx - px * half, y + HO + .1, bz - pz * half, -ux, 0, -uz, cD));
      g.quad(g.v(bx - px * half, y - .2, bz - pz * half, -ux, 0, -uz, cD), g.v(bx - px * half, y + HO + .1, bz - pz * half, -ux, 0, -uz, cD), g.v(bx + px * half, y + HO + .1, bz + pz * half, -ux, 0, -uz, cD), g.v(bx + px * half, y - .2, bz + pz * half, -ux, 0, -uz, cD)); });
    if (g.nv) { const mm = new THREE.Mesh(g.build(), lit); mm.castShadow = true; mm.matrixAutoUpdate = false; mm.frustumCulled = false; root.add(mm); } }
  if (railG.nv) { const rm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); splitGeo(railG, 480).forEach(q => { const m = new THREE.Mesh(q, rm); m.matrixAutoUpdate = false; root.add(m); }); if (W.stats) W.stats.railTris = railG.i.length / 3; }
  if (stairG.nv) { splitGeo(stairG, 320).forEach(q => { const m = new THREE.Mesh(q, lit); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); }); if (W.stats) { W.stats.stairs = nStairs; W.stats.stairTris = stairG.i.length / 3; } }
  // puentes: barandillas a los lados (se ven y no dejan caerse), canto del tablero y pilares cuando va en alto
  { const g = new Geo(), c = lin(0x8a8f96), c2 = lin(0x6f747b), c3 = lin(0xa7a9a6), c4 = lin(0x7c7f80), HR = 1.05, TH = .7;
    const wq = (x0, z0, y0, x1, z1, y1, a, b2, nx, nz, col) => g.quad(g.v(x1, y1 + a, z1, nx, 0, nz, col), g.v(x0, y0 + a, z0, nx, 0, nz, col), g.v(x0, y0 + b2, z0, nx, 0, nz, col), g.v(x1, y1 + b2, z1, nx, 0, nz, col));
    // ¿pisa este punto de la barandilla otra calzada que va a la misma altura? (bocas de las rotondas y enlaces en alto: ahí no hay barandilla)
    const mouth = (x, z, y, own) => { const S = W.rsegs, a = Math.floor((x - 9) / 40), b2 = Math.floor((x + 9) / 40), c5 = Math.floor((z - 9) / 40), d5 = Math.floor((z + 9) / 40); for (let i = a; i <= b2; i++) for (let j = c5; j <= d5; j++) { const l = W.rgrid.get(key(i, j)); if (!l) continue; for (let n = 0; n < l.length; n++) { const s5 = l[n] * 5, rd = M.roads[S[s5 + 4]]; if (rd === own || !ROAD[rd.t]) continue; const ax = S[s5], az = S[s5 + 1], ex = S[s5 + 2] - ax, ez = S[s5 + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(x - ax - ex * t, z - az - ez * t) > rd.w / 2 + .3) continue; const hr = rd.deck ? deckH(rd.deck, x, z) : gY(x, z); if (Math.abs(hr + RISE - y) < 1.3) return true; } } return false; };
    const span = (p, pc, D, off, pillars, own) => { const L2 = offsetLine(p, off), R2 = offsetLine(p, -off); let run = 0;
      for (let k = 0; k + 3 < p.length; k += 2) { const mx = (pc[k] + pc[k + 2]) / 2, mz = (pc[k + 1] + pc[k + 3]) / 2, ya = D ? D.h[k / 2] + RISE : 0, yb2 = D ? D.h[k / 2 + 1] + RISE : 0, gap = D ? (ya + yb2) / 2 - gY(mx, mz) : 0, high = gap > 1.3, wet = inWaterPoly(mx, mz); if (!high && !wet) continue;
        [[L2, 1], [R2, -1]].forEach(q => { const e = q[0], ax = e[k], az = e[k + 1], bx = e[k + 2], bz = e[k + 3], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = dz / l * q[1], nz = -dx / l * q[1]; if (!high && !inWaterPoly((ax + bx) / 2, (az + bz) / 2)) return;
          if (D && own && (mouth((ax + bx) / 2, (az + bz) / 2, (ya + yb2) / 2, own) || mouth(ax + dx * .15, az + dz * .15, ya, own) || mouth(bx - dx * .15, bz - dz * .15, yb2, own))) return;
          wq(ax, az, ya, bx, bz, yb2, 0, HR, nx, nz, c); wq(bx, bz, yb2, ax, az, ya, 0, HR, -nx, -nz, c);
          g.quad(g.v(ax + nx * .08, ya + HR, az + nz * .08, 0, 1, 0, c2), g.v(bx + nx * .08, yb2 + HR, bz + nz * .08, 0, 1, 0, c2), g.v(bx - nx * .08, yb2 + HR, bz - nz * .08, 0, 1, 0, c2), g.v(ax - nx * .08, ya + HR, az - nz * .08, 0, 1, 0, c2));
          if (D) { if (q[1] > 0) wq(bx, bz, yb2, ax, az, ya, -TH, 0, nx, nz, c3); else wq(ax, az, ya, bx, bz, yb2, -TH, 0, nx, nz, c3); }          // canto
          W.segY[W.segs.length / 5] = Math.min(ya, yb2) - 1.3; W.segs.push(ax, az, bx, bz, Math.max(ya, yb2) + HR); });
        if (!D) continue;
        g.quad(g.v(L2[k], ya - TH, L2[k + 1], 0, -1, 0, c4), g.v(R2[k], ya - TH, R2[k + 1], 0, -1, 0, c4), g.v(R2[k + 2], yb2 - TH, R2[k + 3], 0, -1, 0, c4), g.v(L2[k + 2], yb2 - TH, L2[k + 3], 0, -1, 0, c4));      // cara de abajo
        const sl = Math.hypot(pc[k + 2] - pc[k], pc[k + 3] - pc[k + 1]); run += sl; if (pillars && gap > 2.6 && run > 24 && !inWaterPoly(mx, mz) && roadNear(mx, mz, 6, true).d > 1.5) { run = 0; const gy = mY(mx, mz) - .3, v = new Vox(); v.box(mx, gy, mz, 1.1, (ya + yb2) / 2 - TH - gy, 1.1, 0xa7a9a6); g.add(v); } } };
    M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp || !r.b) return; const pp = T.on && r.deck ? r.deck.p : r.p; span(pp, pp, T.on ? r.deck : null, r.w / 2 + (sp[3] ? r.sw || .5 : .15), sp[3], r); });
    if (T.on) (M.rail || []).forEach((p, i) => { const D = W.railDeck[i]; if (D) span(D.p, D.p, D, 1.9, true); });
    if (g.nv) { if (T.on) splitGeo(g, 320).forEach(q => { const m = new THREE.Mesh(q, lit); m.castShadow = true; m.matrixAutoUpdate = false; root.add(m); }); else { const m = new THREE.Mesh(g.build(), lit); m.castShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false; root.add(m); } } }
  // quitamiedos y barandillas: donde una calle va en alto sobre lo de al lado (terraplén, muro, ribera, otra calle más abajo).
  // Calles con acera: barandilla en el borde de la acera; sin acera: bionda metálica al borde del arcén. Se cortan en las bocas de las vías que entran
  // y en los cruces, y no se ponen junto a edificios ni donde al lado hay otro suelo pavimentado a la misma altura. No dejan caerse (colisión)
  if (T.on) { const g = new Geo(), cS = lin(0xb9bfc5), cS2 = lin(0x939aa1), cP = lin(0x70757a), cR = lin(0x55625d), cR2 = lin(0x44504b); let nRun = 0, len = 0; const GL = [];
    const surf = (rd, x, z) => rd && rd.deck ? deckH(rd.deck, x, z) : gY(x, z);
    const cross = (x, z, y, own, m) => { const S = W.rsegs, a = Math.floor((x - 9) / 40), b2 = Math.floor((x + 9) / 40), c5 = Math.floor((z - 9) / 40), d5 = Math.floor((z + 9) / 40); for (let i = a; i <= b2; i++) for (let j = c5; j <= d5; j++) { const l = W.rgrid.get(key(i, j)); if (!l) continue; for (let n = 0; n < l.length; n++) { const s5 = l[n] * 5, rd = M.roads[S[s5 + 4]]; if (rd === own || !ROAD[rd.t]) continue; const ax = S[s5], az = S[s5 + 1], ex = S[s5 + 2] - ax, ez = S[s5 + 3] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(x - ax - ex * t, z - az - ez * t) > rd.w / 2 + m) continue; if (Math.abs(surf(rd, x, z) - y) < 1.6) return true; } } return false; };
    const quad4 = (ax, ay, az, bx, by, bz, h0, h1, nx, nz, col) => { g.quad(g.v(bx, by + h0, bz, nx, 0, nz, col), g.v(ax, ay + h0, az, nx, 0, nz, col), g.v(ax, ay + h1, az, nx, 0, nz, col), g.v(bx, by + h1, bz, nx, 0, nz, col)); g.quad(g.v(ax, ay + h0, az, -nx, 0, -nz, col), g.v(bx, by + h0, bz, -nx, 0, -nz, col), g.v(bx, by + h1, bz, -nx, 0, -nz, col), g.v(ax, ay + h1, az, -nx, 0, -nz, col)); };
    const bar = (ax, ay, az, bx, by, bz, h0, h1, nx, nz, t, col, ct) => { const ox = nx * t, oz = nz * t; quad4(ax + ox, ay, az + oz, bx + ox, by, bz + oz, h0, h1, nx, nz, col); quad4(ax - ox, ay, az - oz, bx - ox, by, bz - oz, h0, h1, nx, nz, col);
      g.quad(g.v(ax - ox, ay + h1, az - oz, 0, 1, 0, ct), g.v(bx - ox, by + h1, bz - oz, 0, 1, 0, ct), g.v(bx + ox, by + h1, bz + oz, 0, 1, 0, ct), g.v(ax + ox, ay + h1, az + oz, 0, 1, 0, ct)); };
    const post = (x, y, z, ux, uz, w, h, col) => { const hx = ux * w / 2, hz = uz * w / 2, nx = -uz * w / 2, nz = ux * w / 2; const P = [[x - hx - nx, z - hz - nz], [x + hx - nx, z + hz - nz], [x + hx + nx, z + hz + nz], [x - hx + nx, z - hz + nz]];
      for (let i = 0; i < 4; i++) { const A = P[i], B = P[(i + 1) % 4], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1; g.quad(g.v(B[0], y - .35, B[1], dz / l, 0, -dx / l, col), g.v(A[0], y - .35, A[1], dz / l, 0, -dx / l, col), g.v(A[0], y + h, A[1], dz / l, 0, -dx / l, col), g.v(B[0], y + h, B[1], dz / l, 0, -dx / l, col)); } };
    M.roads.forEach(r => { const sp = ROAD[r.t]; if (!sp || !sp[3] || r.b) return; const p = densify(r.p, 2.5), n = p.length / 2; if (n < 4) return;
      const bare = r.t === 'service' || r.t === 'track', rail = !!r.sw && !bare, bo = r.w / 2 + (bare ? .45 : rail ? r.sw + .08 : 1.15), H = rail ? 1.02 : .8;
      const X = new Float32Array(n), Z = new Float32Array(n), UX = new Float32Array(n), UZ = new Float32Array(n), Y = new Float32Array(n);
      for (let k = 0; k < n; k++) { const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1); let ux = p[b * 2] - p[a * 2], uz = p[b * 2 + 1] - p[a * 2 + 1]; const l = Math.hypot(ux, uz) || 1; X[k] = p[k * 2]; Z[k] = p[k * 2 + 1]; UX[k] = ux / l; UZ[k] = uz / l; Y[k] = surf(r, X[k], Z[k]); }
      for (const sd of [1, -1]) { const need = new Uint8Array(n), hard = new Uint8Array(n), soft = new Uint8Array(n), BX = new Float32Array(n), BZ = new Float32Array(n), BY = new Float32Array(n);
        for (let k = 0; k < n; k++) { const nx = UZ[k] * sd, nz = -UX[k] * sd, x = X[k], z = Z[k], y = Y[k], bx = x + nx * bo, bz = z + nz * bo; BX[k] = bx; BZ[k] = bz; BY[k] = surf(r, bx, bz) + RISE - .04;
          if (k === 0 || k === n - 1 || nearJunc(bx, bz, 1.5) || cross(bx, bz, y, r, .35) || cross(x + nx * (bo + .9), z + nz * (bo + .9), y, r, .2)) { hard[k] = 1; continue; }
          const q1x = x + nx * (bo + 1.4), q1z = z + nz * (bo + 1.4), q2x = x + nx * (bo + 3.8), q2z = z + nz * (bo + 3.8); if (inBuilding(q1x, q1z) || inBuilding(bx + nx * .4, bz + nz * .4)) { hard[k] = 1; continue; }
          const rn = roadNear(q1x, q1z, 8, false); if (rn.d < .3 && rn.r !== r && Math.abs(surf(rn.r, q1x, q1z) - y) < 1.4) { hard[k] = 1; continue; }
          const d1 = y - mY(q1x, q1z), d2 = y - mY(q2x, q2z), wet = inWaterPoly(q1x, q1z) || inWaterPoly(q2x, q2z);
          if ((d1 > 1 && d2 > 1.8) || (wet && d1 > .5)) need[k] = 1; else if (d1 > .45 && d2 > .8) soft[k] = 1; }
        for (let k = 1; k + 1 < n; k++) if (!need[k] && !hard[k] && need[k - 1] && (need[k + 1] || (k + 2 < n && need[k + 2] && !hard[k + 1]))) need[k] = 1;      // rellena huecos sueltos
        for (let it = 0; it < 2; it++) { const add = []; for (let k = 0; k < n; k++) if (!need[k] && !hard[k] && (soft[k] || it === 0) && ((k > 0 && need[k - 1]) || (k + 1 < n && need[k + 1]))) add.push(k); add.forEach(k => { need[k] = 1; }); }      // entra y sale un poco antes y después del desnivel
        for (let k = 0; k < n;) { if (!need[k]) { k++; continue; } let e = k; while (e + 1 < n && need[e + 1]) e++; if (e - k >= 4) { nRun++; GL.push([Math.round(BX[(k + e) >> 1]), Math.round(BZ[(k + e) >> 1]), +Math.atan2(UX[(k + e) >> 1], UZ[(k + e) >> 1]).toFixed(2), rail ? 1 : 0, Math.round((e - k) * 2.5), sd, M.roads.indexOf(r)]);
            for (let i = k; i <= e; i++) { const ux = UX[i], uz = UZ[i]; post(BX[i], BY[i], BZ[i], ux, uz, rail ? .07 : .12, H, rail ? cR2 : cP);
              if (i < e) { const ax = BX[i], az = BZ[i], ay = BY[i], bx = BX[i + 1], bz = BZ[i + 1], by = BY[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l; len += l;
                if (rail) { bar(ax, ay, az, bx, by, bz, .96, 1.04, nx, nz, .035, cR, cR); bar(ax, ay, az, bx, by, bz, .48, .53, nx, nz, .025, cR, cR); }
                else { bar(ax, ay, az, bx, by, bz, .5, .78, nx, nz, .05, cS, cS2); }
                W.segY[W.segs.length / 5] = Math.min(ay, by) - 1.2; W.segs.push(ax, az, bx, bz, Math.max(ay, by) + H); } } }
          k = e + 1; } } });
    if (g.nv) splitGeo(g, 200).forEach(q => { const m = new THREE.Mesh(q, lit); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); nearOnly(m, 360); }); W.guard = { runs: nRun, m: Math.round(len), list: GL }; }
  // muros, vallas, setos y muros de contención del mapa (barrier=*): siguen el terreno, chocan, y se abren donde los cruza una calle, un camino o una acera
  if (M.bar && M.bar.length) { const g = new Geo(), gp = new Geo(true), cnt = {}; let len = 0;
    const COL = { w: 0xbdb6a6, b: 0x9a5644, s: 0x9d968a, r: 0xa9a397, j: 0xcfcbc1, h: 0x4f7a3c, g: 0xb9bfc5 }, cP = lin(0x3b4842), cT = lin(0xd8d2c4);
    const gnd = (x, z) => T.on ? standY(x, z, -1e9) : 0;
    const open = (x, z) => { if (inBuilding(x, z) || inWaterPoly(x, z)) return true; const rn = roadNear(x, z, 8, false); if (!rn.r) return false; const sp = ROAD[rn.r.t]; if (!sp) return false; const lim = sp[3] ? (rn.r.t === 'service' || rn.r.t === 'track' ? .55 : (rn.r.sw || .8) + .3) : .5; return rn.d < lim; };
    const box = (ax, az, ay, bx, bz, by, h, th, col, top, caps) => { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l, ox = nx * th / 2, oz = nz * th / 2, c = lin(col), ct = top ? lin(top) : c, y0a = ay - .35, y0b = by - .35;
      for (const s of [1, -1]) { const X0 = ax + ox * s, Z0 = az + oz * s, X1 = bx + ox * s, Z1 = bz + oz * s; if (s > 0) g.quad(g.v(X1, y0b, Z1, nx, 0, nz, c), g.v(X0, y0a, Z0, nx, 0, nz, c), g.v(X0, ay + h, Z0, nx, 0, nz, c), g.v(X1, by + h, Z1, nx, 0, nz, c)); else g.quad(g.v(X0, y0a, Z0, -nx, 0, -nz, c), g.v(X1, y0b, Z1, -nx, 0, -nz, c), g.v(X1, by + h, Z1, -nx, 0, -nz, c), g.v(X0, ay + h, Z0, -nx, 0, -nz, c)); }
      g.quad(g.v(ax - ox, ay + h, az - oz, 0, 1, 0, ct), g.v(bx - ox, by + h, bz - oz, 0, 1, 0, ct), g.v(bx + ox, by + h, bz + oz, 0, 1, 0, ct), g.v(ax + ox, ay + h, az + oz, 0, 1, 0, ct));
      if (caps & 1) g.quad(g.v(ax + ox, y0a, az + oz, -dx / l, 0, -dz / l, c), g.v(ax - ox, y0a, az - oz, -dx / l, 0, -dz / l, c), g.v(ax - ox, ay + h, az - oz, -dx / l, 0, -dz / l, c), g.v(ax + ox, ay + h, az + oz, -dx / l, 0, -dz / l, c));
      if (caps & 2) g.quad(g.v(bx - ox, y0b, bz - oz, dx / l, 0, dz / l, c), g.v(bx + ox, y0b, bz + oz, dx / l, 0, dz / l, c), g.v(bx + ox, by + h, bz + oz, dx / l, 0, dz / l, c), g.v(bx - ox, by + h, bz - oz, dx / l, 0, dz / l, c)); };
    const panel = (ax, az, ay, bx, bz, by, h0, h1, u0, u1) => { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l, c = [1, 1, 1]; gp.quad(gp.v(bx, by + h0, bz, nx, 0, nz, c, u1, 0), gp.v(ax, ay + h0, az, nx, 0, nz, c, u0, 0), gp.v(ax, ay + h1, az, nx, 0, nz, c, u0, 1), gp.v(bx, by + h1, bz, nx, 0, nz, c, u1, 1)); };
    const post = (x, y, z, h, w, c) => { const hw = w / 2; for (const q of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = q[0], nz = q[1], tx = -nz, tz = nx; g.quad(g.v(x + nx * hw + tx * hw, y - .35, z + nz * hw + tz * hw, nx, 0, nz, c), g.v(x + nx * hw - tx * hw, y - .35, z + nz * hw - tz * hw, nx, 0, nz, c), g.v(x + nx * hw - tx * hw, y + h, z + nz * hw - tz * hw, nx, 0, nz, c), g.v(x + nx * hw + tx * hw, y + h, z + nz * hw + tz * hw, nx, 0, nz, c)); } };
    M.bar.forEach(B => { const p = densify(B.p, 2), n = p.length / 2; if (n < 2) return; const t = B.t, X = [], Z = [], Y = [], ok = [];
      for (let k = 0; k < n; k++) { const x = p[k * 2], z = p[k * 2 + 1]; X.push(x); Z.push(z); Y.push(gnd(x, z)); ok.push(!open(x, z)); }
      const H = B.h || { w: 1.6, r: 1, j: .85, h: 1.3, f: 1.5, fr: 1.1, g: .8 }[t] || 1.4;
      for (let k = 0; k + 1 < n; k++) { if (!ok[k] || !ok[k + 1]) continue; const ax = X[k], az = Z[k], bx = X[k + 1], bz = Z[k + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < .05) continue; len += l; cnt[t] = (cnt[t] || 0) + 1;
        const caps = (k === 0 || !ok[k - 1] ? 1 : 0) | (k + 2 >= n || !ok[k + 2] ? 2 : 0); let ya = Y[k], yb = Y[k + 1], h = H, lo = Math.min(ya, yb);
        if (t === 'r') { const nx = dz / l, nz = -dx / l, mx = (ax + bx) / 2, mz = (az + bz) / 2, up = Math.max(gnd(mx - nx * 1.4, mz - nz * 1.4), gnd(mx + nx * 1.4, mz + nz * 1.4)), dn = Math.min(gnd(mx - nx * 1.4, mz - nz * 1.4), gnd(mx + nx * 1.4, mz + nz * 1.4)); lo = dn; ya = yb = dn; h = Math.max(.9, up - dn + .35); }
        if (t === 'f' || t === 'fr') { panel(ax, az, ya, bx, bz, yb, .06, h - .05, 0, l / (t === 'fr' ? .9 : 1.2)); box(ax, az, ya, bx, bz, yb, .05, .05, 0x3b4842, null, 0); g.quad(g.v(ax, ya + h - .05, az, 0, 1, 0, cP), g.v(bx, yb + h - .05, bz, 0, 1, 0, cP), g.v(bx, yb + h, bz, 0, 1, 0, cP), g.v(ax, ya + h, az, 0, 1, 0, cP)); { const dxn = dz / l * .03, dzn = -dx / l * .03; g.quad(g.v(bx + dxn, yb + h - .06, bz + dzn, dz / l, 0, -dx / l, cP), g.v(ax + dxn, ya + h - .06, az + dzn, dz / l, 0, -dx / l, cP), g.v(ax + dxn, ya + h, az + dzn, dz / l, 0, -dx / l, cP), g.v(bx + dxn, yb + h, bz + dzn, dz / l, 0, -dx / l, cP)); } if (k % 1 === 0) post(ax, ya, az, h, .07, cP); if (caps & 2) post(bx, yb, bz, h, .07, cP); }
        else if (t === 'g') { box(ax, az, ya, bx, bz, yb, .78, .06, COL.g, 0x939aa1, caps); post(ax, ya, az, .75, .12, lin(0x70757a)); }
        else if (t === 'h') box(ax, az, ya, bx, bz, yb, h, .9, COL.h, 0x5d8a46, caps);
        else box(ax, az, ya, bx, bz, yb, h, t === 'j' ? .6 : t === 'r' ? .45 : .3, t === 'w' ? COL[B.m] || COL.w : COL[t], t === 'w' || t === 'r' ? 0xd8d2c4 : null, caps);
        if (h >= .45) { W.segY[W.segs.length / 5] = lo - 1; W.segs.push(ax, az, bx, bz, Math.max(ya, yb) + h); } } });
    if (g.nv) splitGeo(g, 200).forEach(q => { const m = new THREE.Mesh(q, lit); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); nearOnly(m, 330); });
    if (gp.nv) { const tex = canvasTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#3b4842'; for (let x = 0; x < w; x += 16) c.fillRect(x + 6, 0, 4, h); c.fillRect(0, 0, w, 4); c.fillRect(0, h - 5, w, 5); c.fillRect(0, h * .5 - 2, w, 3); });
      const pm = new THREE.MeshLambertMaterial({ map: tex, transparent: false, alphaTest: .5, side: THREE.DoubleSide }); splitGeo(gp, 200).forEach(q => { const m = new THREE.Mesh(q, pm); m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); nearOnly(m, 220); }); }
    W.barStats = { m: Math.round(len), cnt }; }
  for (let s = 0, id = 0; s < W.segs.length; s += 5, id++) gridAdd(W.grid, W.segs[s], W.segs[s + 1], W.segs[s + 2], W.segs[s + 3], id);
  W.bld.forEach((b, i) => { for (let x = Math.floor(b.b[0] / 40); x <= Math.floor(b.b[2] / 40); x++) for (let z = Math.floor(b.b[1] / 40); z <= Math.floor(b.b[3] / 40); z++) { const kk = key(x, z); let l = W.bgrid.get(kk); if (!l) W.bgrid.set(kk, l = []); l.push(i); } });
  portals = null; void quality;
  return root;
}

// mallas instanciadas por zonas de 240 m: la cámara descarta las que no ve y las pequeñas se apagan de lejos
const _d = new THREE.Object3D();
// altura de la calzada de una calle en un punto: por su tablero si es puente, por el suelo si no
// una escalera no se dibuja sobre la calzada: de su trazado solo quedan los tramos que van fuera de las calles (en el mapa nacen en el eje)
function offCarriage(p) {
  const out = []; let cur = null; const push = (x, z) => { if (!cur) cur = []; const n = cur.length; if (n < 2 || Math.hypot(cur[n - 2] - x, cur[n - 1] - z) > .05) cur.push(x, z); }, cut = () => { if (cur && cur.length >= 4) { let l = 0; for (let k = 0; k + 3 < cur.length; k += 2) l += Math.hypot(cur[k + 2] - cur[k], cur[k + 3] - cur[k + 1]); if (l >= 1) out.push(cur); } cur = null; }, on = (x, z) => roadNear(x, z, 9, true).d < .7;
  for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3], l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(l / .5)); let prev = on(ax, az); if (!prev) push(ax, az);
    for (let q = 1; q <= m; q++) { const x = ax + (bx - ax) * q / m, z = az + (bz - az) * q / m, o = on(x, z); if (o !== prev) { if (o) { push(x, z); cut(); } else push(x, z); prev = o; } }
    if (!prev) push(bx, bz); }
  cut(); return out;
}
export function roadY(r, x, z) { return !T.on ? 0 : (r && r.deck ? deckH(r.deck, x, z) : gY(x, z)) + RISE; }
// dónde se apoya el mobiliario: en el suelo; solo sube al tablero de un puente si está en la calle de ese puente (lo que queda debajo se queda debajo)
function propY(x, z, ground) { const g = standY(x, z, -1e9); if (ground || !T.decks.length) return g; const top = standY(x, z); if (top - g < .5) return top; const rn = roadNear(x, z, 6, false); return rn.r && rn.r.deck && rn.d < 2.6 ? deckH(rn.r.deck, x, z) + RISE : g; }
export function instChunks(root, geo, material, list, o) {
  o = o || {}; const cells = new Map(), CS = o.cell || 240; list.forEach((t, i) => { const k = key(Math.floor(t[0] / CS), Math.floor(t[1] / CS)); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i); });
  const refs = new Array(list.length); geo.computeBoundingSphere(); const gr = geo.boundingSphere.radius + Math.hypot(geo.boundingSphere.center.x, geo.boundingSphere.center.z);
  cells.forEach(ids => { const m = new THREE.InstancedMesh(geo, material, ids.length); let cx = 0, cz = 0, rad = 0, ymax = -1e9, ymin = 1e9; const gys = [];
    ids.forEach((id, k) => { const t = list[id], gy = T.on ? propY(t[0], t[1], o.ground) : 0, yaw = t[2] || 0; gys.push(gy); _d.position.set(t[0], (t[3] || 0) + gy, t[1]);
      if (o.tilt && T.on) { const g = slopeAt(t[0], t[1], 1.6), sy = Math.sin(yaw), cy = Math.cos(yaw); _d.rotation.set(-Math.atan(g[0] * sy + g[1] * cy), yaw, Math.atan(g[0] * cy - g[1] * sy), 'YXZ'); } else _d.rotation.set(0, yaw, 0);
      _d.scale.setScalar(t[4] || 1); _d.updateMatrix(); m.setMatrixAt(k, _d.matrix); refs[id] = [m, k]; cx += t[0]; cz += t[1]; });
    cx /= ids.length; cz /= ids.length; ids.forEach((id, k) => { const t = list[id], y = (t[3] || 0) + gys[k]; rad = Math.max(rad, Math.hypot(t[0] - cx, t[1] - cz) + gr * (t[4] || 1)); ymax = Math.max(ymax, y + geo.boundingSphere.center.y + geo.boundingSphere.radius * (t[4] || 1)); ymin = Math.min(ymin, y); });
    if (o.color) { const c = new THREE.Color(); ids.forEach((id, k) => { m.setColorAt(k, c.setHex(list[id][5] === undefined ? 0xffffff : list[id][5])); }); }
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (ymax + ymin) / 2, cz), Math.hypot(rad, (ymax - ymin) / 2)); m.castShadow = !!o.shadow; m.receiveShadow = false; m.matrixAutoUpdate = false; root.add(m); if (o.far) W.lods.push({ m, x: cx, z: cz, d: o.far + rad, tag: o.tag }); });
  return refs;
}
// cada medio segundo: apaga los grupos de cosas pequeñas que quedan lejos
// malla suelta que solo se ve de cerca (muros, vallas, quitamiedos): se apunta a las de nivel de detalle
function nearOnly(m, far) { const g = m.geometry; g.computeBoundingSphere(); const bs = g.boundingSphere; W.lods.push({ m, x: bs.center.x, z: bs.center.z, d: far + bs.radius, tag: 'near' }); }
export function updateLods(px, pz) { for (const l of W.lods) l.m.visible = !l.off && Math.hypot(l.x - px, l.z - pz) < l.d; }
// algo derribado: se quita de su malla instanciada y deja de chocar
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export function knockProp(p) {
  if (p.off && p.down) return false; p.off = true; if (!p.inst || p.down) return p.kind === 'sign'; p.down = true;
  p.inst.forEach(q => { if (q) { q[0].setMatrixAt(q[1], ZERO); q[0].instanceMatrix.needsUpdate = true; } }); return true;
}
// noche: ventanas, escaparates, farolas y rótulos
export function setNight(n) {
  if (Math.abs(n - W.night) < .01 && n !== 0 && n !== 1) return; W.night = n;
  W.mats.wall.emissiveIntensity = n * .95; W.mats.shop.emissiveIntensity = n * .85; if (W.mats.lamp) W.mats.lamp.color.setHex(n > .25 ? 0xffe6a8 : 0x555a60);
  if (W.mats.pool) { W.mats.pool.opacity = n * .5; const on = n > .15; W.lods.forEach(l => { if (l.tag === 'pool') { l.off = !on; if (!on) l.m.visible = false; } }); }
  if (W.mats.sign) W.mats.sign.emissiveIntensity = .12 + n * .8;
}
let waveT = 0;
export function tickWorld(dt) { waveT += dt; const t = W.mats.water && W.mats.water.map; if (t) { t.offset.set(waveT * .012, waveT * .02); } }
