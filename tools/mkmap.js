#!/usr/bin/env node
// Genera un Sestao PROVISIONAL, trazado a mano, en el formato de mapa del juego (map.js).
// Cuando haya un export de OpenStreetMap se sustituye con:  node tools/osm2map.js sestao.osm
// Coordenadas en metros: x hacia el este, z hacia el sur.
'use strict';
const fs = require('fs'), path = require('path');
let seed = 20261121; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, rr = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rr(a, b + 1));
// el casco va girado: u sigue la Gran Vía hacia el sureste, v mira a la ría (noreste)
const TH = 35 * Math.PI / 180, C = Math.cos(TH), S = Math.sin(TH), r1 = n => Math.round(n * 10) / 10;
const P = (u, v) => [r1(u * C + v * S), r1(u * S - v * C)];
const flat = pts => { const o = []; pts.forEach(p => { const q = P(p[0], p[1]); o.push(q[0], q[1]); }); return o; };
const M = { v: 1, name: 'Sestao', src: 'provisional', roads: [], bld: [], water: [], green: [], rail: [], trees: [], pois: [] };
const road = (t, n, w, pts, x) => M.roads.push(Object.assign({ t, n, w, p: flat(pts) }, x || {}));
const bld = (pts, h, k, n) => { const b = { p: flat(pts), h: r1(h) }; if (k) b.k = k; if (n) b.n = n; M.bld.push(b); };
const tree = (u, v) => { const q = P(u, v); M.trees.push(q[0], q[1]); };

// ---- retícula de cruces: US a lo largo de la Gran Vía, VS de Rebonza (arriba) a la ría (abajo)
const US = [-960, -840, -720, -610, -490, -370, -250, -130, -10, 110, 230, 350, 470, 590, 700];
const VS = [-320, -240, -160, -80, 0, 75, 150, 240, 330];
const LN = ['Camino de Rebonza', 'Doctor Ferrán', 'Vicente Blasco Ibáñez', 'Las Llanas', 'Gran Vía', 'Rivas', 'Los Baños', 'Txabarri', 'La Iberia'];
const LT = ['secondary', 'residential', 'residential', 'tertiary', 'primary', 'residential', 'residential', 'tertiary', 'secondary'];
const CN = ['Abatxolo', 'Aizpuru', 'La Bariega', 'Zumalakarregi', 'Acceso Rebonza', 'Iparraguirre', 'Antonio Trueba', 'La Protectora', 'Plaza del Kasko', 'Juan Tomás de Gandarias', 'Lope de Vega', 'San Diego', 'Acceso Galindo', 'Marismas', 'Urbinaga'];
const WD = { primary: 11, secondary: 9, tertiary: 8, residential: 6.5, service: 4.5, motorway: 15 };
const nd = US.map((u, i) => VS.map((v, j) => [r1(u + (j === 4 ? 0 : 9 * Math.sin(v / 170 + i * 1.3))), r1(v + 13 * Math.sin(u / 260 + j * 1.7))]));
VS.forEach((v, j) => road(LT[j], LN[j], WD[LT[j]], US.map((u, i) => nd[i][j])));
US.forEach((u, i) => { const t = i === 4 || i === 12 ? 'secondary' : i % 4 === 2 ? 'tertiary' : 'residential'; road(t, CN[i], WD[t], VS.map((v, j) => nd[i][j])); });

// ---- autovía por arriba, con dos accesos, y puentes sobre el Galindo hacia Barakaldo
const HV = -440, hw = [[-1150, HV + 30], [-960, HV + 8], [nd[4][0][0], HV], [-250, HV - 6], [0, HV], [230, HV + 6], [nd[12][0][0], HV], [700, HV - 4], [1000, HV + 20]];
road('motorway', 'A-8', WD.motorway, hw);
road('secondary', 'Acceso Rebonza', 9, [nd[4][0], [nd[4][0][0], HV]]); road('secondary', 'Acceso Galindo', 9, [nd[12][0], [nd[12][0][0], HV]]);
[4, 8].forEach(j => road(LT[j], j === 4 ? 'Puente de Galindo' : 'Puente de La Iberia', WD[LT[j]], [nd[14][j], [790, nd[14][j][1]], [860, nd[14][j][1]], [1000, nd[14][j][1] + 6]], { b: 1 }));
road('residential', 'Lasesarre', 6.5, [[1000, nd[14][4][1] + 6], [1000, nd[14][8][1] + 6]]);
// ---- zona industrial junto a la ría, con una calle de servicio
const SV = 448; road('service', 'Muelle', 5, [[-900, SV], [-720, SV], [-10, SV], [590, SV], [700, SV]]);
[2, 8, 13].forEach(i => road('service', 'Muelle', 5, [nd[i][8], [US[i], SV]]));
M.rail.push(flat([[-1000, 372], [-400, 368], [200, 372], [760, 366]]));

// ---- manzanas
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k], len = a => Math.hypot(a[0], a[1]);
function inset(q, d) { // cuadrilátero hacia dentro, d[k] metros en el lado k
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, L = [];
  for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4], e = sub(b, a), l = len(e); let n = [-e[1] / l, e[0] / l]; if (n[0] * (cx - a[0]) + n[1] * (cy - a[1]) < 0) n = [-n[0], -n[1]]; L.push({ p: add(a, mul(n, d[k])), e, n }); }
  return L.map((l, k) => { const m = L[(k + 3) % 4], det = m.e[0] * l.e[1] - m.e[1] * l.e[0], w = sub(l.p, m.p), t = (w[0] * l.e[1] - w[1] * l.e[0]) / det; return add(m.p, mul(m.e, t)); });
}
const halfW = (t) => WD[t] / 2 + 2.6;
const special = {};   // 'i,j' -> tipo
special['8,4'] = 'plaza'; special['1,7'] = 'park'; special['2,7'] = 'park'; special['10,1'] = 'stadium'; special['4,1'] = 'park'; special['12,5'] = 'park'; special['6,2'] = 'school'; special['3,5'] = 'school'; special['11,6'] = 'market';
for (let i = 0; i < US.length - 1; i++) for (let j = 0; j < VS.length - 1; j++) {
  const ti = k => (k === 4 || k === 12 ? 'secondary' : k % 4 === 2 ? 'tertiary' : 'residential');
  const q = inset([nd[i][j], nd[i + 1][j], nd[i + 1][j + 1], nd[i][j + 1]], [halfW(LT[j]), halfW(ti(i + 1)), halfW(LT[j + 1]), halfW(ti(i))]);
  const ctr = mul(q.reduce(add, [0, 0]), .25), sp = special[i + ',' + j], central = Math.abs(j - 4) <= 1 && i >= 4 && i <= 11;
  const rect = (cu, cv, hu, hv) => [[cu - hu, cv - hv], [cu + hu, cv - hv], [cu + hu, cv + hv], [cu - hu, cv + hv]];
  if (sp === 'plaza') { M.green.push({ p: flat(q), k: 'plaza', n: 'Plaza del Kasko' }); bld(rect(ctr[0], ctr[1] + 12, 17, 9), 17, 'civic', 'Ayuntamiento'); for (let k = 0; k < 10; k++) tree(ctr[0] - 40 + k * 9, ctr[1] - 22); M.pois.push({ x: P(ctr[0], ctr[1])[0], z: P(ctr[0], ctr[1])[1], n: 'Plaza del Kasko', k: 'plaza' }); continue; }
  if (sp === 'park') { M.green.push({ p: flat(q), k: 'park', n: i < 3 ? 'La Benedicta' : 'Parque' }); for (let k = 0; k < 22; k++) { const a = R(), b = R(), c = R(); const p = add(add(mul(q[0], (1 - a) * (1 - b)), mul(q[1], a * (1 - b))), add(mul(q[2], a * b), mul(q[3], (1 - a) * b))); tree(p[0], p[1]); } continue; }
  if (sp === 'stadium') { M.green.push({ p: flat(q), k: 'paved' }); M.green.push({ p: flat(rect(ctr[0], ctr[1], 46, 30)), k: 'pitch', n: 'Las Llanas' }); bld(rect(ctr[0], ctr[1] - 36, 46, 4), 9, 'stand', 'Las Llanas'); bld(rect(ctr[0], ctr[1] + 36, 46, 4), 7, 'stand'); M.pois.push({ x: P(ctr[0], ctr[1])[0], z: P(ctr[0], ctr[1])[1], n: 'Campo de Las Llanas', k: 'stadium' }); continue; }
  if (sp === 'school' || sp === 'market') { M.green.push({ p: flat(q), k: 'paved' }); bld(rect(ctr[0] - 8, ctr[1], 30, 14), sp === 'market' ? 9 : 13, 'civic', sp === 'market' ? 'Mercado' : 'Instituto'); for (let k = 0; k < 6; k++) tree(ctr[0] + 30, ctr[1] - 24 + k * 9); continue; }
  // manzana de viviendas: solares por el perímetro, patio en medio
  const dmin = Math.min(len(sub(q[1], q[0])), len(sub(q[2], q[1]))), D = Math.min(13, dmin / 2 - 3); if (D < 6) continue;
  for (let k = 0; k < 4; k++) {
    const a = q[k], b = q[(k + 1) % 4], e = sub(b, a), l = len(e), d = mul(e, 1 / l); let n = [-d[1], d[0]]; if (n[0] * (ctr[0] - a[0]) + n[1] * (ctr[1] - a[1]) < 0) n = [-n[0], -n[1]];
    let s = 0; const end = l - D;
    while (s < end - 5) { let w = rr(13, 23); if (end - (s + w) < 9) w = end - s; const fl = ri(central ? 6 : 4, central ? 9 : 7) - (R() < .12 ? 2 : 0);
      if (R() > .06 || s === 0) { const p0 = add(a, mul(d, s)), p1 = add(a, mul(d, s + w - .05)); bld([p0, p1, add(p1, mul(n, D)), add(p0, mul(n, D))], fl * 3.1 + 1.2, 'res'); }
      s += w; }
  }
}
// ---- naves, chimeneas y astillero entre La Iberia y la ría
for (let u = -330; u < 690; u += rr(84, 110)) for (const v0 of [392, 462]) { const w = rr(52, 76), d = rr(30, 44); if (R() < .88) bld([[u, v0], [u + w, v0], [u + w, v0 + d], [u, v0 + d]], rr(9, 15), 'ind', v0 === 392 && u > 100 && u < 220 ? 'Altos Hornos' : ''); }
[[300, 430], [352, 436], [520, 500]].forEach(c => bld([[c[0] - 3, c[1] - 3], [c[0] + 3, c[1] - 3], [c[0] + 3, c[1] + 3], [c[0] - 3, c[1] + 3]], 58, 'chimney'));
[[-880, 392, 150, 40], [-700, 392, 190, 40], [-880, 466, 120, 50]].forEach(s => bld([[s[0], s[1]], [s[0] + s[2], s[1]], [s[0] + s[2], s[1] + s[3]], [s[0], s[1] + s[3]]], 16, 'ind', s[0] === -700 ? 'La Naval' : ''));
[[-620, 516], [-520, 516], [-430, 516]].forEach(c => M.pois.push({ x: P(c[0], c[1])[0], z: P(c[0], c[1])[1], n: 'Grúa', k: 'crane' }));
// ---- la ría, el Galindo y la otra orilla
M.water.push(flat([[-1400, 545], [790, 545], [790, -560], [860, -560], [860, 545], [1250, 545], [1250, 890], [-1400, 890]]));
for (let u = -1200; u < 1100; u += rr(60, 100)) { const w = rr(26, 60), d = rr(16, 30), v0 = rr(905, 930); bld([[u, v0], [u + w, v0], [u + w, v0 + d], [u, v0 + d]], rr(6, 22), R() < .5 ? 'ind' : 'res'); }
for (let v = -300; v < 500; v += rr(40, 70)) if (Math.abs(v) > 30 && Math.abs(v - 330) > 30) { const w = rr(22, 40); bld([[880, v], [880 + w, v], [880 + w, v + 24], [880, v + 24]], rr(12, 26), 'res'); }
// ---- arbolado de Las Llanas, metro y miradores
for (let u = -940; u < 690; u += 16) { tree(u, -80 + 13 * Math.sin(u / 260 + 3 * 1.7) + 6.6); tree(u + 8, -80 + 13 * Math.sin((u + 8) / 260 + 3 * 1.7) - 6.6); }
[['Metro Sestao', -120, -52], ['Metro Abatxolo', -700, -52], ['Metro Urbinaga', 560, -110]].forEach(m => { const q = P(m[1], m[2]); M.pois.push({ x: q[0], z: q[1], n: m[0], k: 'metro' }); });
{ const q = P(-1500, 720); M.pois.push({ x: q[0], z: q[1], n: 'Puente Colgante', k: 'bridge' }); }
// ---- caja del mapa
let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; M.roads.forEach(r => { for (let k = 0; k < r.p.length; k += 2) { x0 = Math.min(x0, r.p[k]); x1 = Math.max(x1, r.p[k]); z0 = Math.min(z0, r.p[k + 1]); z1 = Math.max(z1, r.p[k + 1]); } });
M.bbox = [r1(x0 - 60), r1(z0 - 60), r1(x1 + 60), r1(z1 + 60)];
const out = path.join(__dirname, '..', 'map.js');
fs.writeFileSync(out, '// Mapa PROVISIONAL de Sestao, trazado a mano (tools/mkmap.js).\nwindow.MAPDATA=' + JSON.stringify(M) + ';\n');
console.log('map.js', (fs.statSync(out).size / 1024).toFixed(0) + ' KB · carreteras', M.roads.length, '· edificios', M.bld.length, '· árboles', M.trees.length / 2, '· caja', M.bbox.join(' '));
