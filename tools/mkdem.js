#!/usr/bin/env node
// Relieve: junta el MDT25 (malla UTM de 25 m, metros enteros) y el MDT200 del IGN y los pasa a las coordenadas del juego.
// Uso: node tools/mkdem.js <carpeta con dem_utm.json y dem200.json>  →  tools/dem.json
// Datos: Modelo Digital del Terreno del IGN (LiDAR-PNOA), CC BY 4.0 scne.es.
const fs = require('fs'), path = require('path'), dir = process.argv[2] || path.join(__dirname, '../../dem');
const D = JSON.parse(fs.readFileSync(path.join(dir, 'dem_utm.json'), 'utf8')), C = JSON.parse(fs.readFileSync(path.join(dir, 'dem200.json'), 'utf8')), { toUTM, fromLocal } = require(path.join(dir, 'utm.js'));
const W = D.W, H = D.H, v = Float32Array.from(D.g.map(x => x === null ? 0 : x));
// 1. los datos vienen redondeados al metro: se busca la superficie más suave que respeta cada valor ±0,5 m (en llano quita los escalones de 1 m)
let h = Float32Array.from(v);
for (let it = 0; it < 60; it++) { const n = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const w = dx && dy ? 1 : dx || dy ? 2 : 4; s += h[yy * W + xx] * w; c += w; }
    n[i] = Math.max(v[i] - .5, Math.min(v[i] + .5, s / c)); } h = n; }
// el agua (0 o menos en el dato) se deja en 0
for (let i = 0; i < W * H; i++) if (v[i] <= 0) h[i] = Math.min(h[i], 0);
const cx = x => (D.P0 + x) * 25 + 12.5 + D.dx, cy = y => (D.M1 - y) * 25 + 12.5 + D.dy;
const fine = (E, N) => { const fx = (E - cx(0)) / 25, fy = (cy(0) - N) / 25; if (fx < 0 || fy < 0 || fx > W - 1 || fy > H - 1) return NaN; const x0 = Math.min(W - 2, Math.floor(fx)), y0 = Math.min(H - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0, i = y0 * W + x0; return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - ty) + (h[i + W] * (1 - tx) + h[i + W + 1] * tx) * ty; };
const cg = C.g.map(x => x === null ? NaN : x), coarse = (E, N) => { const fx = (E - C.e0) / 200, fy = (C.n0 - N) / 200, x0 = Math.max(0, Math.min(C.CW - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(C.CH - 2, Math.floor(fy))), tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)); let s = 0, w = 0;
  [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]].forEach(q => { const val = cg[(y0 + q[1]) * C.CW + x0 + q[0]]; if (!isNaN(val)) { s += val * q[2]; w += q[2]; } }); return w > 0 ? s / w : NaN; };
const at = (x, z, f) => { const g = fromLocal(x, z), u = toUTM(g[0], g[1]); return f(u[0], u[1]); };
// 2. malla fina en coordenadas del juego (25 m) y malla gruesa de alrededores (200 m)
const F = { x0: -1450, z0: -850, d: 25, nx: 117, nz: 69, h: [] }, G = { x0: -3000, z0: -2200, d: 200, nx: 31, nz: 23, h: [] };
for (let j = 0; j < F.nz; j++) for (let i = 0; i < F.nx; i++) { const val = at(F.x0 + i * F.d, F.z0 + j * F.d, fine); if (isNaN(val)) throw new Error('fuera de la malla fina: ' + i + ',' + j); F.h.push(Math.round(val * 10)); }
for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) { const x = G.x0 + i * G.d, z = G.z0 + j * G.d; let val = at(x, z, coarse); if (isNaN(val)) val = 0; G.h.push(Math.round(val)); }
const out = { src: 'MDT25 y MDT200 © Instituto Geográfico Nacional (CC BY 4.0, scne.es)', fine: F, wide: G };
fs.writeFileSync(path.join(__dirname, 'dem.json'), JSON.stringify(out));
let mn = 1e9, mx = -1e9; F.h.forEach(q => { mn = Math.min(mn, q); mx = Math.max(mx, q); }); console.log('malla fina', F.nx + 'x' + F.nz, 'de', mn / 10, 'a', mx / 10, 'm · gruesa', G.nx + 'x' + G.nz, 'hasta', Math.max(...G.h), 'm ·', (JSON.stringify(out).length / 1024).toFixed(1), 'KB');
