// mapdraw.js: el plano en 2D, pintado por teselas que se guardan. Lo usan el minimapa y el mapa grande.
import { W, ROAD, bboxOf } from './world.js';
import { T, gY } from './terrain.js';

export const TS = 512, LV = [.5, 1, 2, 4];      // tamaño de tesela y píxeles por metro de cada nivel
const cache = new Map(); let idx = null, tick = 0;
const COL = { out: '#c9d8bb', land: '#ece7db', water: '#9cc3dd', bld: '#cdc2b0', bldInd: '#c6c4be', bldCiv: '#d6b9a0', casing: '#b3ac9c', road: '#ffffff', main: '#fbe3a2', mainCase: '#d9b660', foot: '#d6cbb2', steps: '#dd9a7c', cycle: '#d9705a', rail: '#8a8f96' };
const GCOL = { ind: '#dedbd3', yard: '#eadfc8', dirt: '#dccfb6', grass: '#cfe5b8', allot: '#d6dfa8', park: '#b9dba0', wood: '#9fcf8a', cem: '#c3d6b4', lot: '#d8d8d2', plaza: '#f3eedf', paved: '#e4e1d8', play: '#f0cfa0', pool: '#8fd0f0', pitch: '#8fd3a0' }, GORD = ['ind', 'yard', 'dirt', 'grass', 'allot', 'park', 'wood', 'cem', 'lot', 'plaza', 'paved', 'pitch', 'play', 'pool'];

function index() {
  if (idx) return idx; const M = W.map, C = 128, g = { C, bld: new Map(), green: new Map(), water: new Map(), road: new Map(), rail: new Map(), bar: new Map() };
  const put = (m, b, item) => { const x0 = Math.max(-40, Math.floor(b[0] / C)), x1 = Math.min(40, Math.floor(b[2] / C)), z0 = Math.max(-40, Math.floor(b[1] / C)), z1 = Math.min(40, Math.floor(b[3] / C)); for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; let l = m.get(k); if (!l) m.set(k, l = []); l.push(item); } };
  M.bld.forEach(b => put(g.bld, bboxOf(b.p), b)); (M.green || []).forEach(a => put(g.green, bboxOf(a.p), a)); W.water.forEach(w => put(g.water, w.b, w));
  M.roads.forEach(r => { if (ROAD[r.t]) put(g.road, bboxOf(r.p), r); }); (M.rail || []).forEach(p => put(g.rail, bboxOf(p), p)); (M.bar || []).forEach(b => put(g.bar, bboxOf(b.p), b)); return idx = g;
}
// curvas de nivel cada 10 m (el relieve, en el plano): se sacan una vez de la malla del terreno y se guardan por casillas
let iso = null;
function contours() {
  if (iso) return iso; iso = new Map(); if (!T.on) return iso; const bb = W.map.bbox, D = 10, x0 = Math.floor(bb[0] / D) * D, z0 = Math.floor(bb[1] / D) * D, nx = Math.ceil((bb[2] - x0) / D) + 1, nz = Math.ceil((bb[3] - z0) / D) + 1, h = new Float32Array(nx * nz), C = 128;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = gY(x0 + i * D, z0 + j * D);
  const put = (L, ax, az, bx, bz) => { const k = Math.floor((ax + bx) / 2 / C) * 100003 + Math.floor((az + bz) / 2 / C); let l = iso.get(k); if (!l) iso.set(k, l = []); l.push(ax, az, bx, bz, L); };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i + 1], e = h[(j + 1) * nx + i], lo = Math.min(a, b, c, e), hi = Math.max(a, b, c, e); if (hi - lo < .01) continue; const x = x0 + i * D, z = z0 + j * D;
    for (let L = Math.max(10, Math.ceil(lo / 10) * 10); L < hi; L += 10) { const p = []; if ((a > L) !== (b > L)) p.push(x + D * (L - a) / (b - a), z); if ((b > L) !== (c > L)) p.push(x + D, z + D * (L - b) / (c - b)); if ((e > L) !== (c > L)) p.push(x + D * (L - e) / (c - e), z + D); if ((a > L) !== (e > L)) p.push(x, z + D * (L - a) / (e - a)); if (p.length >= 4) put(L, p[0], p[1], p[2], p[3]); if (p.length === 8) put(L, p[4], p[5], p[6], p[7]); } }
  return iso;
}
function near(m, x0, z0, x1, z1) { const C = idx.C, out = new Set(); for (let x = Math.floor(x0 / C); x <= Math.floor(x1 / C); x++) for (let z = Math.floor(z0 / C); z <= Math.floor(z1 / C); z++) { const l = m.get(x * 100003 + z); if (l) for (const i of l) out.add(i); } return out; }
const path = (c, p, close) => { c.beginPath(); for (let k = 0; k < p.length; k += 2) k ? c.lineTo(p[k], p[k + 1]) : c.moveTo(p[k], p[k + 1]); if (close) c.closePath(); };

function render(level, tx, tz) {
  index(); const s = LV[level], m = TS / s, x0 = tx * m, z0 = tz * m, pad = 16 / s + 14, cv = document.createElement('canvas'); cv.width = cv.height = TS; const c = cv.getContext('2d'), M = W.map, bb = M.bbox, mg = M.margin || 0;
  c.setTransform(s, 0, 0, s, -x0 * s, -z0 * s); c.fillStyle = COL.out; c.fillRect(x0, z0, m, m); c.fillStyle = COL.land; c.fillRect(bb[0] - mg, bb[1] - mg, bb[2] - bb[0] + 2 * mg, bb[3] - bb[1] + 2 * mg);
  const X0 = x0 - pad, Z0 = z0 - pad, X1 = x0 + m + pad, Z1 = z0 + m + pad, greens = near(idx.green, X0, Z0, X1, Z1);
  GORD.forEach(k => greens.forEach(a => { if (a.k === k) { path(c, a.p, true); c.fillStyle = GCOL[k]; c.fill(); } }));
  near(idx.water, X0, Z0, X1, Z1).forEach(w => { path(c, w.p, true); c.fillStyle = COL.water; c.fill(); });
  { const I = contours(); if (I.size) { const C = 128; for (const big of [0, 1]) { c.beginPath(); for (let x = Math.floor(X0 / C); x <= Math.floor(X1 / C); x++) for (let z = Math.floor(Z0 / C); z <= Math.floor(Z1 / C); z++) { const l = I.get(x * 100003 + z); if (!l) continue; for (let k = 0; k < l.length; k += 5) { if ((l[k + 4] % 50 === 0) !== !!big) continue; c.moveTo(l[k], l[k + 1]); c.lineTo(l[k + 2], l[k + 3]); } } c.strokeStyle = big ? 'rgba(140,100,60,.5)' : 'rgba(150,112,72,.3)'; c.lineWidth = (big ? 1.5 : 1) / s; c.stroke(); } } }
  c.lineJoin = 'round'; c.lineCap = 'round'; const roads = [...near(idx.road, X0, Z0, X1, Z1)], minW = 1.3 / s;
  // caminos, luego calles (borde y relleno) y por último las principales
  roads.forEach(r => { const sp = ROAD[r.t]; if (sp[3] || (level === 0 && r.t !== 'pedestrian')) return; path(c, r.p); c.strokeStyle = r.t === 'steps' ? COL.steps : r.t === 'cycleway' ? COL.cycle : COL.foot; c.lineWidth = Math.max(minW * .8, r.t === 'pedestrian' ? r.w : 1.6); c.stroke(); });
  const big = r => r.t === 'primary' || r.t === 'trunk' || r.t === 'motorway' || r.t === 'secondary' || r.t.indexOf('_link') > 0 && r.t !== 'tertiary_link';
  [0, 1].forEach(pass => roads.forEach(r => { const sp = ROAD[r.t]; if (!sp[3] || big(r) !== !!pass) return; if (level === 0 && (r.t === 'service' || r.t === 'track')) return; path(c, r.p); c.strokeStyle = pass ? COL.mainCase : COL.casing; c.lineWidth = Math.max(minW, r.w) + 1.6 / s; c.stroke(); }));
  [0, 1].forEach(pass => roads.forEach(r => { const sp = ROAD[r.t]; if (!sp[3] || big(r) !== !!pass) return; if (level === 0 && (r.t === 'service' || r.t === 'track')) return; path(c, r.p); c.strokeStyle = pass ? COL.main : COL.road; c.lineWidth = Math.max(minW, r.w); c.stroke(); }));
  near(idx.rail, X0, Z0, X1, Z1).forEach(p => { path(c, p); c.strokeStyle = COL.rail; c.lineWidth = Math.max(minW * .7, 1.2); c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]); });
  if (level > 0) near(idx.bar, X0, Z0, X1, Z1).forEach(b => { path(c, b.p); c.strokeStyle = b.t === 'h' ? '#7fa866' : b.t === 'f' || b.t === 'fr' ? '#8a9086' : '#a59d8e'; c.lineWidth = Math.max(.8 / s, b.t === 'h' ? .9 : .4); c.stroke(); });      /* muros, vallas y setos */
  near(idx.bld, X0, Z0, X1, Z1).forEach(b => { path(c, b.p, true); c.fillStyle = b.k === 'ind' || b.k === 'shed' || b.k === 'tank' || b.k === 'roof' ? COL.bldInd : b.k === 'civic' ? COL.bldCiv : COL.bld; c.fill(); if (level > 1) { c.strokeStyle = '#a89c88'; c.lineWidth = .7 / s; c.stroke(); } });
  return cv;
}
export function tile(level, tx, tz) { const k = level + ':' + tx + ':' + tz; let t = cache.get(k); if (!t) { t = { cv: render(level, tx, tz), u: 0 }; cache.set(k, t); if (cache.size > 36) { let old = null, ou = 1e18; cache.forEach((v, kk) => { if (v.u < ou) { ou = v.u; old = kk; } }); cache.delete(old); } } t.u = ++tick; return t.cv; }
// pinta en el contexto (ya transformado a metros) las teselas que cubren la caja dada
export function drawTiles(c, level, x0, z0, x1, z1, budget) { const m = TS / LV[level]; let made = 0, missing = 0; for (let tx = Math.floor(x0 / m); tx <= Math.floor(x1 / m); tx++) for (let tz = Math.floor(z0 / m); tz <= Math.floor(z1 / m); tz++) { const k = level + ':' + tx + ':' + tz; if (!cache.has(k)) { if (budget !== undefined && made >= budget) { missing++; continue; } made++; } c.drawImage(tile(level, tx, tz), tx * m, tz * m, m + .02, m + .02); } return missing; }
export const levelFor = pxPerM => (pxPerM <= .7 ? 0 : pxPerM <= 1.45 ? 1 : pxPerM <= 2.9 ? 2 : 3);
export const MAPCOL = COL;
