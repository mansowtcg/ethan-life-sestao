#!/usr/bin/env node
// Convierte un export de OpenStreetMap en el mapa del juego (map.js).
//
//   node tools/osm2map.js sestao.osm [--name Sestao] [--clip minLon,minLat,maxLon,maxLat] [--out map.js]
//
// Admite el .osm (XML) de openstreetmap.org › Exportar y el XML o JSON de Overpass. Sin dependencias.
// Los datos de OpenStreetMap son © sus colaboradores (licencia ODbL): el juego muestra la atribución.
//
// Qué hace, por orden: lee el archivo, recorta a la zona, saca calles, edificios, agua, suelo y vías de tren;
// une los cabos sueltos de la red de calles, ajusta el ancho de cada calle al hueco real entre fachadas
// (y retira un poco las fachadas que pisan la calzada), abre los pasos bajo edificios y coloca rótulos,
// pasos de cebra, señales, árboles y mobiliario.
'use strict';
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), opt = { name: 'Sestao', out: path.join(__dirname, '..', 'map.js') }; let file = null;
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === '--name') opt.name = args[++i]; else if (a === '--clip') opt.clip = args[++i].split(',').map(Number); else if (a === '--out') opt.out = path.resolve(args[++i]); else if (a === '--json') opt.json = true; else file = a; }
if (!file) { console.error('Uso: node tools/osm2map.js archivo.osm [--name Sestao] [--clip minLon,minLat,maxLon,maxLat] [--out map.js]'); process.exit(1); }

// =====================================================================================================
// 1. Lectura
// =====================================================================================================
const nodes = new Map(), ways = new Map(), rels = [], ntags = []; let fileBounds = null;
const ent = s => s.indexOf('&') < 0 ? s : s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (m, e) => e === 'amp' ? '&' : e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const nTags = o => (o ? Object.keys(o).length : 0);
function finish(e) {
  if (e.kind === 'way') { const old = ways.get(e.id); if (!old || nTags(e.tags) >= nTags(old.tags)) ways.set(e.id, e); }   // Overpass puede repetir elementos sin etiquetas
  else if (e.kind === 'relation') rels.push(e);
}
function addNode(n) { const old = nodes.get(n.id); if (old && old.tags && !n.tags) return old; nodes.set(n.id, n); return n; }
function readXml(txt) {
  const re = /<(\/?)(node|way|relation|nd|tag|member|bounds)\b([^>]*?)(\/?)>/g, at = /([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m, cur = null;
  const attrs = s => { const o = {}; let a; at.lastIndex = 0; while ((a = at.exec(s))) o[a[1]] = ent(a[2] !== undefined ? a[2] : a[3]); return o; };
  while ((m = re.exec(txt))) {
    const close = m[1] === '/', el = m[2], self = m[4] === '/';
    if (close) { if (cur && cur.kind === el) { if (el === 'node') { if (cur.tags) ntags.push(cur); } else finish(cur); cur = null; } continue; }
    const a = attrs(m[3]);
    if (el === 'bounds') { if (a.minlat) fileBounds = [+a.minlon, +a.minlat, +a.maxlon, +a.maxlat]; }
    else if (el === 'node') { const n = addNode({ kind: 'node', id: a.id, lat: +a.lat, lon: +a.lon, tags: null }); cur = self ? null : n; }
    else if (el === 'way') { cur = { kind: 'way', id: a.id, nd: [], tags: {} }; if (self) { finish(cur); cur = null; } }
    else if (el === 'relation') { cur = { kind: 'relation', id: a.id, mem: [], tags: {} }; if (self) { finish(cur); cur = null; } }
    else if (!cur) continue;
    else if (el === 'nd') cur.nd && cur.nd.push(a.ref);
    else if (el === 'tag') { if (!cur.tags) cur.tags = {}; cur.tags[a.k] = a.v; }
    else if (el === 'member') cur.mem && cur.mem.push({ type: a.type, ref: a.ref, role: a.role || '' });
  }
}
function readJson(txt) {
  const d = JSON.parse(txt); (d.elements || []).forEach(e => {
    if (e.type === 'node') { const n = addNode({ kind: 'node', id: String(e.id), lat: e.lat, lon: e.lon, tags: e.tags || null }); if (n.tags && e.tags) ntags.push(n); }
    else if (e.type === 'way') { const w = { kind: 'way', id: String(e.id), nd: (e.nodes || []).map(String), tags: e.tags || {} };
      if (e.geometry) e.geometry.forEach((g, i) => { if (!g) return; const id = w.nd[i] !== undefined ? w.nd[i] : 'g' + e.id + '_' + i; if (w.nd[i] === undefined) w.nd[i] = id; if (!nodes.has(id)) nodes.set(id, { kind: 'node', id, lat: g.lat, lon: g.lon, tags: null }); });
      finish(w); }
    else if (e.type === 'relation') rels.push({ kind: 'relation', id: String(e.id), tags: e.tags || {}, mem: (e.members || []).map(m => ({ type: m.type, ref: String(m.ref), role: m.role || '' })) });
  });
}
const raw = fs.readFileSync(file, 'utf8'); if (/^\s*\{/.test(raw)) readJson(raw); else readXml(raw);
if (!nodes.size) { console.error('No he encontrado nodos en ' + file + '. ¿Es un export de OpenStreetMap (.osm) o de Overpass?'); process.exit(1); }

// =====================================================================================================
// 2. Zona y proyección: --clip, los <bounds> del export, el término municipal o lo que traiga el archivo
// =====================================================================================================
let reg = opt.clip || fileBounds, regSrc = opt.clip ? 'recorte pedido' : 'límites del export';
if (!reg) { const b = rels.find(r => r.tags.boundary === 'administrative' && r.tags.name && r.tags.name.split(/\s*\/\s*/).indexOf(opt.name) >= 0);
  let lo0 = 1e9, la0 = 1e9, lo1 = -1e9, la1 = -1e9; const eat = id => { const n = nodes.get(id); if (n) { la0 = Math.min(la0, n.lat); la1 = Math.max(la1, n.lat); lo0 = Math.min(lo0, n.lon); lo1 = Math.max(lo1, n.lon); } };
  if (b) { b.mem.forEach(m => { const w = m.type === 'way' && ways.get(m.ref); if (w) w.nd.forEach(eat); }); regSrc = 'término municipal de ' + opt.name; const mla = 250 / 110540, mlo = 250 / (111320 * Math.cos(la0 * Math.PI / 180)); lo0 -= mlo; lo1 += mlo; la0 -= mla; la1 += mla; }
  if (!b || lo1 < lo0) { ways.forEach(w => { if (w.tags.highway || w.tags.building) w.nd.forEach(eat); }); regSrc = 'todo el archivo'; }
  reg = [lo0, la0, lo1, la1]; }
const latC = (reg[1] + reg[3]) / 2, lonC = (reg[0] + reg[2]) / 2, KX = 111320 * Math.cos(latC * Math.PI / 180), KZ = 110540, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const px = n => r1((n.lon - lonC) * KX), pz = n => r1(-(n.lat - latC) * KZ);
const HX = (reg[2] - reg[0]) / 2 * KX, HZ = (reg[3] - reg[1]) / 2 * KZ, MARG = 60;                       // MARG: franja que se dibuja más allá del límite jugable
const inside = (x, z, m) => Math.abs(x) <= HX + (m || 0) && Math.abs(z) <= HZ + (m || 0);
const pts = w => { const o = []; w.nd.forEach(id => { const n = nodes.get(id); if (n) o.push([px(n), pz(n), id]); }); return o; };

// =====================================================================================================
// 3. Geometría
// =====================================================================================================
const flat = p => { const o = []; p.forEach(q => o.push(r1(q[0]), r1(q[1]))); return o; };
const closed = w => w.nd.length > 3 && w.nd[0] === w.nd[w.nd.length - 1];
const num = v => { if (v === undefined) return NaN; const m = /-?\d+(?:[.,]\d+)?/.exec(String(v)); return m ? parseFloat(m[0].replace(',', '.')) : NaN; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
function simplify(p, tol, keep) { // Douglas-Peucker conservando los puntos marcados (cruces)
  if (p.length < 3) return p; const use = new Uint8Array(p.length); use[0] = use[p.length - 1] = 1; if (keep) p.forEach((q, i) => { if (keep(q)) use[i] = 1; });
  const rec = (a, b) => { let md = 0, mi = -1; const ax = p[a][0], az = p[a][1], dx = p[b][0] - ax, dz = p[b][1] - az, l2 = dx * dx + dz * dz || 1; for (let i = a + 1; i < b; i++) { const t = Math.max(0, Math.min(1, ((p[i][0] - ax) * dx + (p[i][1] - az) * dz) / l2)), d = Math.hypot(p[i][0] - ax - dx * t, p[i][1] - az - dz * t); if (d > md) { md = d; mi = i; } } if (md > tol) { use[mi] = 1; rec(a, mi); rec(mi, b); } };
  let last = 0; for (let i = 1; i < p.length; i++) if (use[i]) { rec(last, i); last = i; }
  return p.filter((q, i) => use[i]);
}
const simplifyRing = (p, tol) => { if (p.length < 4) return p; const s = simplify(p.concat([p[0]]), tol); s.pop(); return s; };
const area = p => { let a = 0; for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(a / 2); };
const centroid = p => { let x = 0, z = 0; p.forEach(q => { x += q[0]; z += q[1]; }); return [r1(x / p.length), r1(z / p.length)]; };
const inPoly = (p, x, z) => { let c = false; for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) { if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
const bboxOf = p => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; p.forEach(q => { a = Math.min(a, q[0]); c = Math.max(c, q[0]); b = Math.min(b, q[1]); d = Math.max(d, q[1]); }); return [a, b, c, d]; };
const lenOf = p => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
const distSeg = (x, z, ax, az, bx, bz, out) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, qx = ax + dx * t, qz = az + dz * t; if (out) { out.x = qx; out.z = qz; out.t = t; } return Math.hypot(x - qx, z - qz); };
// recorte de un polígono contra el rectángulo de la zona (Sutherland-Hodgman)
function clipRect(p, m) {
  const X = HX + m, Z = HZ + m, cut = (q, ax, lim, less) => { const o = []; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length], ia = less ? a[ax] <= lim : a[ax] >= lim, ib = less ? b[ax] <= lim : b[ax] >= lim; if (ia) o.push(a); if (ia !== ib) { const t = (lim - a[ax]) / (b[ax] - a[ax]); o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return o; };
  let q = p; q = cut(q, 0, -X, false); if (q.length > 2) q = cut(q, 0, X, true); if (q.length > 2) q = cut(q, 1, -Z, false); if (q.length > 2) q = cut(q, 1, Z, true); return q.length > 2 ? q : null;
}
// recorte de un segmento contra el rectángulo (Liang-Barsky): devuelve [t0, t1] o null
function clipSeg(a, b, X, Z) { const dx = b[0] - a[0], dz = b[1] - a[1]; let t0 = 0, t1 = 1; const P = [[-dx, a[0] + X], [dx, X - a[0]], [-dz, a[1] + Z], [dz, Z - a[1]]];
  for (const q of P) { if (Math.abs(q[0]) < 1e-12) { if (q[1] < 0) return null; continue; } const r = q[1] / q[0]; if (q[0] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
  return t1 - t0 < 1e-9 ? null : [t0, t1]; }
// anillos exteriores de una relación multipolígono (une los trozos de vía por sus extremos)
function outerRings(rel, inner) {
  const segs = []; rel.mem.forEach(m => { if (m.type !== 'way' || (m.role === 'inner') !== !!inner) return; const w = ways.get(m.ref); if (w && w.nd.length > 1) segs.push(w.nd.slice()); });
  const rings = []; while (segs.length) { let ring = segs.pop(), grew = true;
    while (ring[0] !== ring[ring.length - 1] && grew) { grew = false; for (let i = 0; i < segs.length; i++) { const s = segs[i], end = ring[ring.length - 1];
      if (s[0] === end) { ring = ring.concat(s.slice(1)); } else if (s[s.length - 1] === end) { ring = ring.concat(s.slice().reverse().slice(1)); } else continue; segs.splice(i, 1); grew = true; break; } }
    const p = []; ring.forEach(id => { const n = nodes.get(id); if (n) p.push([px(n), pz(n), id]); }); if (p.length > 3) rings.push(p); }
  return rings;
}
const isRing = p => p.length > 3 && p[0][2] === p[p.length - 1][2];
// rejilla de segmentos para búsquedas por cercanía
class SegGrid {
  constructor(cell) { this.c = cell; this.m = new Map(); this.s = []; }
  add(ax, az, bx, bz, tag) { const id = this.s.push([ax, az, bx, bz, tag]) - 1, c = this.c, x0 = Math.floor(Math.min(ax, bx) / c), x1 = Math.floor(Math.max(ax, bx) / c), z0 = Math.floor(Math.min(az, bz) / c), z1 = Math.floor(Math.max(az, bz) / c); for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; let l = this.m.get(k); if (!l) this.m.set(k, l = []); l.push(id); } return id; }
  each(x0, z0, x1, z1, cb) { const c = this.c, seen = this._seen || (this._seen = new Set()); seen.clear(); for (let x = Math.floor(x0 / c); x <= Math.floor(x1 / c); x++) for (let z = Math.floor(z0 / c); z <= Math.floor(z1 / c); z++) { const l = this.m.get(x * 100003 + z); if (!l) continue; for (const id of l) { if (seen.has(id)) continue; seen.add(id); cb(this.s[id], id); } } }
  near(x, z, R, skip) { let best = R, bs = null; const o = {}; this.each(x - R, z - R, x + R, z + R, s => { if (skip && skip(s[4])) return; const d = distSeg(x, z, s[0], s[1], s[2], s[3]); if (d < best) { best = d; bs = s; } }); return bs ? { d: best, s: bs } : null; }
}

const M = { v: 4, name: opt.name, src: 'osm', attribution: 'Mapa: © colaboradores de OpenStreetMap (ODbL)', roads: [], bld: [], water: [], green: [], rail: [], railT: [], train: [], trees: [], cross: [], signs: [], lights: [], portals: [], tubes: [], poi: [], props: { bench: [], bin: [], font: [], bus: [], art: [], lift: [], pylon: [] }, places: [], transit: [], labels: [], marks: [] };

// =====================================================================================================
// 4. Vías
// =====================================================================================================
const HW = { motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1, residential: 1, unclassified: 1, living_street: 1, service: 1, track: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1, pedestrian: 0, footway: 0, path: 0, steps: 0, cycleway: 0 };
const isTun = t => t.tunnel && t.tunnel !== 'no';
// pasillos de metro y de centros comerciales: grupos de caminos subterráneos unidos a una boca de metro o marcados como interiores
const underground = new Set();
{ const cand = []; ways.forEach(w => { const t = w.tags; if (!(t.highway in HW) || HW[t.highway]) return; if (t.indoor === 'yes' || t.level !== undefined || t.location === 'underground' || (t.conveying && (isTun(t) || num(t.layer) < 0))) { underground.add(w.id); cand.push(w); }      /* las rampas mecánicas al aire libre se quedan */ else if (isTun(t) && t.tunnel !== 'building_passage' && num(t.layer) < 0 && !t.name) cand.push(w); });
  const byNode = new Map(); cand.forEach(w => w.nd.forEach(id => { let l = byNode.get(id); if (!l) byNode.set(id, l = []); l.push(w); }));
  const seen = new Set(); cand.forEach(w0 => { if (seen.has(w0.id)) return; const grp = [], st = [w0]; seen.add(w0.id); let metro = false;
    while (st.length) { const w = st.pop(); grp.push(w); if (underground.has(w.id)) metro = true; w.nd.forEach(id => { const n = nodes.get(id); if (n && n.tags && (n.tags.railway === 'subway_entrance' || n.tags.highway === 'elevator' && num(n.tags.layer) < 0)) metro = true; (byNode.get(id) || []).forEach(o => { if (!seen.has(o.id)) { seen.add(o.id); st.push(o); } }); }); }
    if (metro || lenOf(pts(w0)) > 60) grp.forEach(w => underground.add(w.id)); }); }
const used = new Map(), hw = [];
ways.forEach(w => { const t = w.tags, k = t.highway; if (!(k in HW)) return; if (t.area === 'yes' || t.access === 'no' || underground.has(w.id)) return;
  if (/^(sidewalk|crossing)$/.test(t.footway || '') || (k === 'cycleway' && /^(sidewalk|crossing)$/.test(t.cycleway || ''))) return;      // las aceras las dibuja el juego junto a la calzada
  if (HW[k] && isTun(t) && t.tunnel !== 'building_passage') { const L = lenOf(pts(w)); if (/^(private|customers)$/.test(t.access || '') || (k === 'service' && num(t.layer) < 0) || t.indoor === 'yes' || L > 400) return; }   // rampas de garaje y túneles privados
  hw.push(w); w.nd.forEach((id, i) => used.set(id, (used.get(id) || 0) + (i === 0 || i === w.nd.length - 1 ? 2 : 1))); });
function roadWidth(t, tags, one) {
  const wd = num(tags.width), ln = num(tags.lanes); if (wd >= 1.5 && wd < 40) return r1(wd);
  if (!HW[t]) return t === 'pedestrian' ? 5 : t === 'path' ? 1.8 : 2.4;
  if (t === 'motorway' || t === 'trunk') return r1((ln >= 1 ? ln : one ? 2 : 4) * 3.6 + 1.2);
  if (/_link$/.test(t)) return r1((ln >= 1 ? ln : 1) * 3.6 + 1.6);
  if (t === 'service') return tags.service === 'driveway' ? 3.2 : tags.service === 'parking_aisle' ? 5 : 4.2; if (t === 'track') return 3; if (t === 'living_street') return 5;
  const n = ln >= 1 ? ln : one ? 1 : 2; return r1(Math.min(15, n * 3.2 + 2.4));         // carriles más una banda de aparcamiento
}
const R = [];       // vías en proceso: { t, n, w, o, b, u, v, pr, s, l, rb, p: [[x,z],...] }
const crossTmp = [], signTmp = [], lightTmp = [], crossSeen = new Set();
hw.forEach(w => {
  const t = w.tags.highway, tg = w.tags, p = pts(w); if (p.length < 2) return; const drv = HW[t];
  const one = tg.oneway === 'yes' || tg.oneway === '1' || tg.oneway === 'true' || tg.oneway === '-1' || tg.junction === 'roundabout' || tg.junction === 'circular' || (t === 'motorway' && tg.oneway !== 'no') || (/_link$/.test(t) && tg.oneway !== 'no' && tg.oneway !== undefined);
  const wd = roadWidth(t, tg, one), name = tg.name || (drv ? tg.ref : undefined), tun = isTun(tg) || tg.covered === 'yes', rev = tg.oneway === '-1';
  const base = { t, w: wd, w0: wd }; if (num(tg.width) >= 1.5) base.wTag = 1; if (name) base.n = name; if (one && drv) base.o = 1; if (tg.bridge && tg.bridge !== 'no') base.b = 1; if (tun) base.u = 1; const ms = num(tg.maxspeed); if (ms >= 5 && drv) base.v = ms;
  if (tg.conveying && tg.conveying !== 'no' && tg.indoor !== 'yes' && !tun && !(num(tg.layer) < 0)) base.cv = tg.conveying === 'backward' ? -1 : tg.conveying === 'forward' ? 1 : String(tg.incline || '') === 'down' ? -1 : 1;      /* rampas y escaleras mecánicas al aire libre: hacia dónde va la cinta respecto al dibujo */
  if (t === 'steps' || base.cv) { const ic = String(tg.incline || ''), sc = num(tg.step_count); if (/^up$|^\+?\d/.test(ic)) base.inc = 1; else if (/^down$|^-\d/.test(ic)) base.inc = -1; if (sc >= 2 && sc < 400) base.sc = sc; if (tg.handrail === 'no') base.hr = 0; }      /* escaleras: hacia dónde suben, cuántos peldaños y si llevan pasamanos */
  if (/^(private|no|customers|delivery)$/.test(tg.access || '') || /^(private|no)$/.test(tg.motor_vehicle || '')) base.pr = 1; if (t === 'service' && tg.service) base.s = tg.service === 'parking_aisle' ? 'pa' : tg.service === 'driveway' ? 'dw' : tg.service === 'alley' ? 'al' : undefined;
  // aparcamiento junto a la calzada, por lado (respecto al sentido en que está dibujada la vía): 0 no hay, 1 en línea, 2 en diagonal, 3 en batería
  if (drv) { const PT = v => v === 'diagonal' ? 2 : v === 'perpendicular' ? 3 : 1, side = sd => { let v = tg['parking:' + sd] !== undefined ? tg['parking:' + sd] : tg['parking:both'], o = tg['parking:' + sd + ':orientation'] !== undefined ? tg['parking:' + sd + ':orientation'] : tg['parking:both:orientation']; const old = tg['parking:lane:' + sd] !== undefined ? tg['parking:lane:' + sd] : tg['parking:lane:both'];
      if (v === undefined && old !== undefined) { if (/^(parallel|diagonal|perpendicular)$/.test(old)) { v = 'lane'; o = old; } else v = 'no'; } if (v === undefined) return undefined; return /^(lane|street_side|on_kerb|half_on_kerb|shoulder|yes)$/.test(v) ? PT(o) : 0; };
    const L = side('left'), Rg = side('right'); if (L !== undefined) base[rev ? 'pkr' : 'pkl'] = L; if (Rg !== undefined) base[rev ? 'pkl' : 'pkr'] = Rg; }
  const ln = num(tg.lanes); if (ln >= 1 && drv) base.l = ln; if (tg.junction === 'roundabout' || tg.junction === 'circular') base.rb = 1; if (tg.sidewalk === 'no' || tg.sidewalk === 'none' || tg['sidewalk:both'] === 'no') base.ns = 1; if (name && tg['name:es'] && tg['name:es'] !== name) base.ne = tg['name:es'];
  // recorte exacto contra la franja: las vías que salen de la zona acaban justo en el borde
  const X = HX + MARG, Z = HZ + MARG, runs = []; let run = null;
  for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], c = clipSeg(a, b, X, Z); if (!c) { run = null; continue; }
    const A = c[0] > 0 ? [r1(a[0] + (b[0] - a[0]) * c[0]), r1(a[1] + (b[1] - a[1]) * c[0]), null] : a, B = c[1] < 1 ? [r1(a[0] + (b[0] - a[0]) * c[1]), r1(a[1] + (b[1] - a[1]) * c[1]), null] : b;
    if (!run || c[0] > 0) { run = [A]; runs.push(run); } run.push(B); if (c[1] < 1) run = null; }
  const made = []; runs.forEach(q => { q = simplify(q, drv ? .5 : .9, n => n[2] && (used.get(n[2]) > 1 || (nodes.get(n[2]).tags && nodes.get(n[2]).tags.highway))); if (q.length < 2 || lenOf(q) < .5) return; if (rev) q = q.slice().reverse(); const r = Object.assign({}, base, { p: q.map(v => [v[0], v[1]]), ids: q.map(v => v[2]) }); R.push(r); made.push(r); });
  if (!drv || !made.length) return;
  // pasos de cebra, señales y semáforos: van en nodos de la calzada
  for (let i = 0; i < p.length; i++) { const n = nodes.get(p[i][2]), nt = n && n.tags; if (!nt || !nt.highway || !inside(p[i][0], p[i][1], 4)) continue; const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], ang = Math.atan2(b[0] - a[0], b[1] - a[1]), road = made.find(r => r.ids.indexOf(n.id) >= 0) || made[0];
    if (nt.highway === 'crossing' && !/^(unmarked|informal|no)$/.test(nt.crossing || '') && nt['crossing:markings'] !== 'no' && !tun && !crossSeen.has(n.id)) { crossSeen.add(n.id); const sig = nt.crossing === 'traffic_signals' || nt['crossing:signals'] === 'yes'; crossTmp.push({ x: p[i][0], z: p[i][1], a: ang, road, sig }); }
    else if ((nt.highway === 'stop' || nt.highway === 'give_way') && !crossSeen.has(n.id)) { crossSeen.add(n.id); let fwd = nt.direction === 'forward' ? 1 : nt.direction === 'backward' ? 0 : -1; if (fwd < 0) fwd = i >= p.length / 2 ? 1 : 0; if (rev) fwd = 1 - fwd; signTmp.push({ x: p[i][0], z: p[i][1], a: fwd ? ang : ang + Math.PI, road, k: nt.highway === 'stop' ? 0 : 1 }); }
    else if (nt.highway === 'traffic_signals' && !crossSeen.has(n.id)) { crossSeen.add(n.id); lightTmp.push({ x: p[i][0], z: p[i][1], a: ang, road }); } }
});
const DRV = r => HW[r.t] === 1;

// =====================================================================================================
// 5. Edificios
// =====================================================================================================
const LOW = { house: 1, detached: 1, semidetached_house: 1, terrace: 1, bungalow: 1, farm: 1, cabin: 1 }, IND = { industrial: 1, warehouse: 1, garage: 1, garages: 1, shed: 1, hut: 1, hangar: 1, service: 1, greenhouse: 1, retail: 1, supermarket: 1, sports_hall: 1, kiosk: 1, storage_tank: 1, parking: 1, transformer_tower: 1, barn: 1, sty: 1, construction: 1 };
const CIV = /^(school|church|chapel|cathedral|hospital|civic|public|government|train_station|university|college|kindergarten|sports_centre|fire_station|monastery)$/;
// suelo industrial: ahí un building=yes es una nave, no un bloque de pisos
const indZones = []; ways.forEach(w => { if (closed(w) && /^(industrial|railway|harbour|port)$/.test(w.tags.landuse || '')) { const p = pts(w); indZones.push({ p, b: bboxOf(p) }); } });
const inInd = (x, z) => indZones.some(q => x >= q.b[0] && x <= q.b[2] && z >= q.b[1] && z <= q.b[3] && inPoly(q.p, x, z));
const B = [];       // edificios en proceso: { p: [[x,z],...], h, k, n }
const SEEN = [[43.30800, -3.00589, 'g', 7], [43.30836, -3.00452, 'm', 8, 0xc4453c], [43.30921, -3.00740, 'p', 4.6], [43.31018, -3.00804, 'm', 7, 0xe6e6e0]];      // [lat, lon, tipo de cubierta, altura, color]
// patio interior de una manzana (anillo «inner» del multipolígono): se une al contorno por una costura de ancho cero, en sentido contrario.
// El juego lo dibuja como un solo polígono: el patio queda hueco (paredes con ventanas hacia dentro, se entra si hay paso) y la azotea, plana
const sArea = p => { let a = 0; for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; };
function withHoles(p, holes) {
  let out = p.slice(); if (sArea(out) < 0) out.reverse(); let cut = 0;
  for (let h of holes) { if (h.length > 3 && h[0][2] !== undefined && h[0][2] === h[h.length - 1][2]) h = h.slice(0, -1); h = simplifyRing(h.map(v => [v[0], v[1]]), .3); if (h.length < 3 || Math.abs(sArea(h)) < 12) continue; if (sArea(h) > 0) h.reverse();
    if (!h.every(q => inPoly(out, q[0], q[1]))) continue;      /* solo patios que caen dentro */
    let best = null; for (let i = 0; i < out.length; i++) for (let j = 0; j < h.length; j++) { const d = Math.hypot(out[i][0] - h[j][0], out[i][1] - h[j][1]); if (!best || d < best[0]) best = [d, i, j]; }
    const i = best[1], j = best[2], ring = h.slice(j).concat(h.slice(0, j)); out = out.slice(0, i + 1).concat(ring, [ring[0], out[i]], out.slice(i + 1)); cut += Math.abs(sArea(h)); }
  return { p: out, cut };
}
function addBuilding(p, tags, id, holes) {
  if (p.length > 3 && p[0][2] === p[p.length - 1][2]) p = p.slice(0, -1); p = simplifyRing(p.map(v => [v[0], v[1]]), .3); if (p.length < 3) return;
  let patio = 0; if (holes && holes.length) { const w = withHoles(p, holes); if (w.cut > 0) { p = w.p; patio = w.cut; } }
  const a = area(p); if (a < 8) return; const c = centroid(p); if (!inside(c[0], c[1], MARG)) return;
  if (tags.location === 'underground' || num(tags.layer) < 0) return;
  const b = tags.building || tags['building:part'] || 'yes', lev = num(tags['building:levels']), h0 = num(tags.height) > 1 ? num(tags.height) : num(tags['building:height']), u = hash(id), zone = inInd(c[0], c[1]);
  let k = 'res', h, rf, seenH = 0, seenC = -1;
  if (tags.man_made === 'chimney') { k = 'chimney'; h = 45; } else if (tags.man_made === 'storage_tank' || b === 'storage_tank' || tags.man_made === 'water_tower') { k = 'tank'; h = 10; }
  else if (b === 'roof' || b === 'carport' || b === 'canopy' || tags.amenity === 'shelter' || tags.leisure === 'bandstand') { // cubiertas abiertas: se pasa por debajo. rf: k templete, p pérgola, m chapa, g cristal (sin rf, losa)
    const band = tags.leisure === 'bandstand', st = tags.shelter_type || ''; k = 'roof'; h = band ? 4.4 : tags.amenity === 'shelter' ? (st === 'gazebo' ? 4 : 3.4) : a > 900 ? 7 : 4.8; rf = band || st === 'gazebo' ? 'k' : /pergola|sun_shelter/.test(st) ? 'p' : a > 900 ? 'm' : undefined;
    // lo visto en las fotos aéreas y a pie de calle: la plaza San Pedro va bajo cristal, el patio de al lado bajo chapa roja y blanca, y la del Kasko es una pérgola
    for (const q of SEEN) if (Math.hypot(c[0] - (q[1] - lonC) * KX, c[1] + (q[0] - latC) * KZ) < 16) { rf = q[2]; if (q[3]) seenH = q[3]; if (q[4]) seenC = q[4]; } }
  else if (b === 'grandstand' || b === 'stadium' || b === 'bleachers' || tags.leisure === 'bleachers') { k = 'stand'; h = 6; }
  else if (b === 'ruins' || b === 'collapsed') { k = 'ind'; h = 3.5; } else if (IND[b] || tags.man_made === 'works') { k = 'ind'; h = b === 'shed' || b === 'hut' || b === 'garage' || b === 'garages' || b === 'kiosk' ? 3.2 : a > 2500 ? 13 : a > 600 ? 10 : 7; }
  else if (CIV.test(b) || tags.amenity === 'townhall') { k = 'civic'; h = b === 'church' || b === 'cathedral' ? 17 : b === 'chapel' ? 8 : 11.5; }
  else if (LOW[b]) { k = 'house'; h = (2 + Math.floor(u * 2)) * 3 + 1.4; }
  else if (b === 'apartments' || b === 'residential' || b === 'dormitory' || b === 'hotel') h = (a < 150 ? 4 + Math.floor(u * 2) : 5 + Math.floor(u * 4)) * 3.05 + 1.3;
  else if (b === 'office' || b === 'commercial') h = (3 + Math.floor(u * 3)) * 3.4 + 1;
  else if (zone) { k = 'ind'; h = a < 60 ? 3.4 : a > 2500 ? 13 : a > 600 ? 10 : 7; }
  else h = a < 45 ? 3.2 : a > 3500 ? (k = 'ind', 10) : a < 130 ? (2 + Math.floor(u * 3)) * 3.05 + 1.3 : (4 + Math.floor(u * 4)) * 3.05 + 1.3;      // building=yes en zona de viviendas
  if (h0 > 1) h = h0; else if (lev >= 1 && k !== 'roof') h = lev * 3.05 + 1.3 + (num(tags['roof:levels']) > 0 ? 2.5 : 0); if (seenH) h = seenH;
  const o = { p, h: r1(Math.min(130, h)), a }; if (patio) o.pt = 1; if (k !== 'res') o.k = k; if (tags.name) o.n = tags.name; if (h0 > 1 || lev >= 1) o.real = 1;
  // lo que el mapa diga del aspecto: color de fachada y de tejado, material, forma del tejado, plantas y tipo
  { const bc = cssColour(tags['building:colour'] || tags['building:color']), rc = cssColour(tags['roof:colour'] || tags['roof:color']), rs = { flat: 'f', gabled: 'g', hipped: 'h', pyramidal: 'h', round: 'r', dome: 'r', skillion: 's', sawtooth: 'w' }[tags['roof:shape']], mt = { brick: 'b', stone: 's', metal: 'm', plaster: 'p', concrete: 'c', cement_block: 'c', glass: 'g', tiles: 't', wood: 'w' }[tags['building:material'] || tags['building:cladding']];
    if (bc >= 0) o.c = bc; if (rc >= 0) o.rc = rc; if (rs) o.rs = rs; if (mt) o.m = mt; if (lev >= 1) o.lv = lev; if (rf) o.rf = rf; if (seenC >= 0) o.rc = seenC; if (patio) o.rs = 'f';      /* con patio, azotea plana */
    const ty = b === 'church' || b === 'cathedral' || b === 'chapel' || tags.amenity === 'place_of_worship' ? 'ch' : b === 'school' || b === 'kindergarten' || b === 'university' || b === 'college' || tags.amenity === 'school' ? 'sc' : b === 'apartments' || b === 'residential' ? 'ap' : b === 'commercial' || b === 'retail' || b === 'office' || b === 'supermarket' ? 'co' : b === 'train_station' || tags.railway === 'station' ? 'st' : tags.amenity === 'townhall' ? 'th' : b === 'hospital' || tags.amenity === 'clinic' || tags.amenity === 'hospital' ? 'ho' : b === 'sports_centre' || b === 'sports_hall' || tags.leisure === 'sports_centre' ? 'sp' : ''; if (ty) o.ty = ty; }
  B.push(o);
}
const inRel = new Set(); rels.forEach(r => { if (r.tags.type !== 'multipolygon' || !r.tags.building) return; r.mem.forEach(m => { if (m.role !== 'inner') inRel.add(m.ref); }); const inner = outerRings(r, true).filter(isRing); outerRings(r).forEach((ring, i) => { if (isRing(ring)) addBuilding(ring, r.tags, 'r' + r.id + '_' + i, inner); }); });
ways.forEach(w => { const t = w.tags; if ((!t.building && t.man_made !== 'chimney' && t.man_made !== 'storage_tank' && t.man_made !== 'water_tower' && t.leisure !== 'bleachers') || t.building === 'no' || !closed(w) || inRel.has(w.id)) return; addBuilding(pts(w), t, 'w' + w.id); });

// =====================================================================================================
// 6. Agua: polígonos, línea de costa y ríos dibujados como línea
// =====================================================================================================
const isWater = t => t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'reservoir' || t.landuse === 'basin';
const waterP = [];
function addWater(p) { if (p.length > 3 && p[0][2] !== undefined && p[0][2] === p[p.length - 1][2]) p = p.slice(0, -1); const q = clipRect(p.map(v => [v[0], v[1]]), MARG + 15); if (!q || area(q) < 30) return; const s = simplifyRing(q, .8); if (s.length > 2) waterP.push(s); }
// costa: el agua queda a la derecha del sentido de la vía. Se unen los trozos, se recortan a la zona y se cierran por el borde.
(function coast() {
  const segs = []; ways.forEach(w => { if (w.tags.natural === 'coastline' && w.nd.length > 1) segs.push(w.nd.slice()); }); if (!segs.length) return;
  const chains = []; while (segs.length) { let c = segs.pop(), grew = true; while (grew) { grew = false; for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (s[0] === c[c.length - 1]) c = c.concat(s.slice(1)); else if (s[s.length - 1] === c[0]) c = s.concat(c.slice(1)); else continue; segs.splice(i, 1); grew = true; break; } } chains.push(c); }
  const X = HX + MARG + 15, Z = HZ + MARG + 15, P = 4 * X + 4 * Z, EPS = 1e-4;
  const tOf = (x, z) => Math.abs(z + Z) < EPS ? x + X : Math.abs(x - X) < EPS ? 2 * X + z + Z : Math.abs(z - Z) < EPS ? 2 * X + 2 * Z + X - x : 4 * X + 2 * Z + Z - z;   // perímetro en sentido horario desde la esquina noroeste
  const CORN = [[2 * X, [X, -Z]], [2 * X + 2 * Z, [X, Z]], [4 * X + 2 * Z, [-X, Z]], [0, [-X, -Z]]], pieces = []; let lost = 0;
  chains.forEach(ch => { const p = []; ch.forEach(id => { const n = nodes.get(id); if (n) p.push([(n.lon - lonC) * KX, -(n.lat - latC) * KZ]); }); let cur = null;
    for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], c = clipSeg(a, b, X, Z); if (!c) continue; const dx = b[0] - a[0], dz = b[1] - a[1], t0 = c[0], t1 = c[1];
      const A = [a[0] + dx * t0, a[1] + dz * t0], Bp = [a[0] + dx * t1, a[1] + dz * t1], snap = q => { if (Math.abs(Math.abs(q[0]) - X) < 1e-6) q[0] = Math.sign(q[0]) * X; if (Math.abs(Math.abs(q[1]) - Z) < 1e-6) q[1] = Math.sign(q[1]) * Z; return q; };
      if (t0 > 0 || !cur) { if (cur) lost++; cur = { pts: [snap(A)], ts: t0 > 0 ? tOf(A[0], A[1]) : null }; }
      cur.pts.push(t1 < 1 ? snap(Bp) : Bp); if (t1 < 1) { cur.te = tOf(Bp[0], Bp[1]); if (cur.ts !== null) pieces.push(cur); else lost++; cur = null; } }
    if (cur) lost++; });
  const done = new Set(); let made = 0;
  pieces.forEach((p0, i0) => { if (done.has(i0)) return; let poly = [], cur = i0, guard = 0;
    while (guard++ < 500) { done.add(cur); const pc = pieces[cur]; poly = poly.concat(pc.pts); let best = -1, bd = 1e18; pieces.forEach((q, j) => { let d = q.ts - pc.te; if (d <= 0) d += P; if (d < bd) { bd = d; best = j; } });
      CORN.map(c => { let d = c[0] - pc.te; if (d <= 0) d += P; return [d, c[1]]; }).filter(c => c[0] < bd).sort((a, b) => a[0] - b[0]).forEach(c => poly.push(c[1]));
      if (best === i0 || done.has(best)) break; cur = best; }
    const s = simplifyRing(poly, .8); if (s.length > 2 && area(s) > 50) { waterP.push(s); made++; } });
  console.log('  costa: ' + chains.length + ' tramos, ' + pieces.length + ' cruces con la zona → ' + made + ' láminas de agua' + (lost ? ' (' + lost + ' tramos sin cerrar, ignorados)' : ''));
})();
const areaRel = new Set(); rels.forEach(r => { if (r.tags.type !== 'multipolygon' || r.tags.building) return; if (isWater(r.tags)) { r.mem.forEach(m => { if (m.role !== 'inner') areaRel.add(m.ref); }); outerRings(r).forEach(ring => { if (isRing(ring)) addWater(ring); }); } });
ways.forEach(w => { if (!w.tags.building && closed(w) && isWater(w.tags) && !areaRel.has(w.id)) addWater(pts(w)); });
const waterB = () => waterP.map(p => ({ p, b: bboxOf(p) })); let WB = waterB();
const inWater = (x, z) => WB.some(q => x >= q.b[0] && x <= q.b[2] && z >= q.b[1] && z <= q.b[3] && inPoly(q.p, x, z));
ways.forEach(w => { const t = w.tags; if (closed(w) || !/^(river|stream|canal)$/.test(t.waterway || '') || isTun(t)) return; const p = simplify(pts(w), 1), wd = num(t.width) >= 1 ? num(t.width) : t.waterway === 'river' ? 9 : t.waterway === 'canal' ? 6 : 2.6;
  for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (!inside(mx, mz, MARG) || inWater(mx, mz)) continue; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx = dx / l * wd / 2; dz = dz / l * wd / 2; waterP.push([[a[0] + dz - dx * .3, a[1] - dx - dz * .3], [b[0] + dz + dx * .3, b[1] - dx + dz * .3], [b[0] - dz + dx * .3, b[1] + dx + dz * .3], [a[0] - dz - dx * .3, a[1] + dx - dz * .3]]); } });
WB = waterB(); waterP.forEach(p => M.water.push(flat(p)));

// =====================================================================================================
// 7. Suelo: parques, jardines, campos, plazas, aparcamientos, zonas industriales
// =====================================================================================================
function groundKind(t) {
  const l = t.leisure, u = t.landuse, n = t.natural;
  if (l === 'pitch' || l === 'track') return 'pitch'; if (l === 'swimming_pool') return 'pool'; if (l === 'playground') return 'play';
  if ((t.highway === 'pedestrian' || t.highway === 'footway') && t.area === 'yes') return 'plaza'; if (t.place === 'square' || l === 'bandstand' || t.railway === 'platform' || t.public_transport === 'platform') return 'plaza';
  if (l === 'park' || l === 'garden' || l === 'dog_park' || u === 'village_green' || u === 'recreation_ground' || l === 'common') return 'park'; if (u === 'cemetery' || t.amenity === 'grave_yard') return 'cem';
  if (n === 'wood' || u === 'forest' || n === 'scrub' || u === 'orchard') return 'wood'; if (u === 'grass' || u === 'meadow' || n === 'grassland' || u === 'greenfield' || n === 'heath' || t.barrier === 'hedge') return 'grass'; if (u === 'allotments' || u === 'farmland' || u === 'plant_nursery') return 'allot';
  if (t.amenity === 'parking' && t.parking !== 'underground' && t.parking !== 'multi-storey' && !t.building) return 'lot'; if (t.amenity === 'school' || t.amenity === 'college' || t.amenity === 'kindergarten' || l === 'schoolyard' || u === 'education' || l === 'sports_centre' || l === 'stadium') return 'yard';
  if (u === 'industrial' || u === 'railway' || u === 'harbour' || u === 'port' || t.man_made === 'pier' || t.man_made === 'breakwater') return 'ind'; if (u === 'construction' || u === 'brownfield' || u === 'quarry' || n === 'bare_rock' || n === 'sand' || n === 'beach') return 'dirt';
  if (u === 'residential' || u === 'retail' || u === 'commercial') return 'urb';
  return null;
}
const G = [];
function addGround(p, tags) {
  if (p.length > 3 && p[0][2] === p[p.length - 1][2]) p = p.slice(0, -1); if (p.length < 3) return; const k = groundKind(tags); if (!k) return;
  const q = clipRect(p.map(v => [v[0], v[1]]), MARG); if (!q) return; const s = simplifyRing(q, .6); if (s.length < 3 || area(s) < 12) return;
  const g = { p: s, k }; if (k === 'pitch') g.s = (tags.sport || (tags.leisure === 'track' ? 'track' : '')).split(';')[0]; if (tags.name) g.n = tags.name; G.push(g);
}
rels.forEach(r => { if (r.tags.type !== 'multipolygon' || r.tags.building || isWater(r.tags) || !groundKind(r.tags)) return; r.mem.forEach(m => { if (m.role !== 'inner') areaRel.add(m.ref); }); outerRings(r).forEach(ring => { if (isRing(ring)) addGround(ring, r.tags); }); });
ways.forEach(w => { if (closed(w) && !isWater(w.tags) && !w.tags.building) addGround(pts(w), w.tags); });

function cssColour(v) { if (!v) return -1; v = String(v).trim().toLowerCase(); if (/^#[0-9a-f]{6}$/.test(v)) return parseInt(v.slice(1), 16); if (/^#[0-9a-f]{3}$/.test(v)) return parseInt(v[1] + v[1] + v[2] + v[2] + v[3] + v[3], 16);
  const N = { white: 0xf2efe6, black: 0x2b2b2e, grey: 0x9a9a98, gray: 0x9a9a98, lightgrey: 0xc8c8c4, lightgray: 0xc8c8c4, darkgrey: 0x6a6a6c, darkgray: 0x6a6a6c, silver: 0xbfc3c6, red: 0xb5483a, maroon: 0x7a3a30, brown: 0x8a5a3c, tan: 0xd2b48c, beige: 0xe6dcc0, yellow: 0xe6c85a, orange: 0xd98a4a, green: 0x5a8a5c, blue: 0x4a78b0, aqua: 0x6ab8c0, pink: 0xe0a8a0, cream: 0xf0e6c8, ivory: 0xf0ecd8, salmon: 0xe09a80, olive: 0x8a8a50, teal: 0x3a8a8a, navy: 0x2a3a6a, purple: 0x7a4a8a, gold: 0xd8b24a };
  return N[v] === undefined ? -1 : N[v]; }
// =====================================================================================================
// 8. Vías de tren: todas para dibujar y la línea principal encadenada para que pase el tren
// =====================================================================================================
const mains = [];
ways.forEach(w => { const t = w.tags, rw = t.railway; if (!/^(rail|light_rail|tram|narrow_gauge|subway)$/.test(rw || '') || closed(w)) return; const tun = isTun(t); if (tun && (rw === 'subway' || num(t.layer) < -1)) return;
  const p = pts(w); if (p.length < 2) return; const X = HX + MARG, Z = HZ + MARG; let run = null; const runs = [];
  for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], c = clipSeg(a, b, X, Z); if (!c) { run = null; continue; } const A = [a[0] + (b[0] - a[0]) * c[0], a[1] + (b[1] - a[1]) * c[0]], Bq = [a[0] + (b[0] - a[0]) * c[1], a[1] + (b[1] - a[1]) * c[1]]; if (!run || c[0] > 0) { run = [A]; runs.push(run); } run.push(Bq); if (c[1] < 1) run = null; }
  runs.forEach(q => { const s = simplify(q, .6); if (s.length > 1 && lenOf(s) > 4) { M.rail.push(flat(s)); M.railT.push(tun ? 2 : t.bridge && t.bridge !== 'no' ? 1 : 0); } });
  if (rw === 'rail' && !t.service && rw !== 'subway') mains.push(p); });
(function chain() { const segs = mains.map(p => p.slice()); const out = [];
  while (segs.length) { let c = segs.pop(), grew = true; while (grew) { grew = false; for (let i = 0; i < segs.length; i++) { const s = segs[i], a = c[0][2], b = c[c.length - 1][2];
      if (s[0][2] === b) c = c.concat(s.slice(1)); else if (s[s.length - 1][2] === b) c = c.concat(s.slice().reverse().slice(1)); else if (s[s.length - 1][2] === a) c = s.concat(c.slice(1)); else if (s[0][2] === a) c = s.slice().reverse().concat(c.slice(1)); else continue; segs.splice(i, 1); grew = true; break; } }
    const q = simplify(c.filter(v => inside(v[0], v[1], 400)), .5); const len = lenOf(q); if (len > 600) out.push([len, flat(q)]); }
  out.sort((a, b) => b[0] - a[0]); out.slice(0, 4).forEach(o => M.train.push(o[1])); })();

// =====================================================================================================
// 9. Red de calles: se unen los cabos sueltos que casi tocan otra calle (en OSM a veces falta el nodo común)
// =====================================================================================================
const nkey = q => q[0] + ',' + q[1];
function components() {
  const par = new Map(), find = a => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
  R.forEach(r => { if (!DRV(r)) return; let prev = null; r.p.forEach(q => { const k = nkey(q); if (!par.has(k)) par.set(k, k); if (prev) { const a = find(k), b = find(prev); if (a !== b) par.set(a, b); } prev = k; }); });
  const len = new Map(); R.forEach(r => { if (!DRV(r)) return; const c = find(nkey(r.p[0])); r.c = c; len.set(c, (len.get(c) || 0) + lenOf(r.p)); });
  let main = null, ml = 0; len.forEach((l, c) => { if (l > ml) { ml = l; main = c; } }); return { find, main, len };
}
(function snap() {
  let joined = 0;
  for (let pass = 0; pass < 3; pass++) {
    const C = components(), deg = new Map(); R.forEach(r => { if (!DRV(r)) return; r.p.forEach((q, i) => { const k = nkey(q); deg.set(k, (deg.get(k) || 0) + (i === 0 || i === r.p.length - 1 ? 1 : 2)); }); });
    const grid = new SegGrid(40); R.forEach((r, ri) => { if (!DRV(r)) return; for (let i = 0; i + 1 < r.p.length; i++) grid.add(r.p[i][0], r.p[i][1], r.p[i + 1][0], r.p[i + 1][1], [ri, i]); });
    const adds = []; R.forEach((r, ri) => { if (!DRV(r)) return; [0, r.p.length - 1].forEach(e => { const q = r.p[e]; if (deg.get(nkey(q)) !== 1 || !inside(q[0], q[1], MARG - 2)) return;
      const hit = grid.near(q[0], q[1], 22, tag => C.find(nkey(R[tag[0]].p[0])) === C.find(nkey(r.p[0]))); if (!hit) return; adds.push({ ri, e, q, hit }); }); });
    if (!adds.length) break; const done = new Set();
    adds.sort((a, b) => a.hit.d - b.hit.d).forEach(a => { const tr = R[a.hit.s[4][0]], C2 = [nkey(R[a.ri].p[0]), nkey(tr.p[0])].map(k => k).sort().join('|'); if (done.has(C2)) return; done.add(C2);
      const o = {}; distSeg(a.q[0], a.q[1], a.hit.s[0], a.hit.s[1], a.hit.s[2], a.hit.s[3], o); const pt = [r1(o.x), r1(o.z)];
      // el punto de enganche pasa a ser un vértice de la calle de destino
      let idx = -1; for (let i = 0; i + 1 < tr.p.length; i++) if (tr.p[i][0] === a.hit.s[0] && tr.p[i][1] === a.hit.s[1] && tr.p[i + 1][0] === a.hit.s[2] && tr.p[i + 1][1] === a.hit.s[3]) { idx = i; break; } if (idx < 0) return;
      if (nkey(pt) !== nkey(tr.p[idx]) && nkey(pt) !== nkey(tr.p[idx + 1])) tr.p.splice(idx + 1, 0, pt);
      if (nkey(pt) === nkey(a.q)) return; const src = R[a.ri]; R.push({ t: 'service', w: Math.min(src.w, 4.2), w0: Math.min(src.w, 4.2), p: [a.q.slice(0, 2), pt], link: 1 }); joined++; });
  }
  if (joined) console.log('  red de calles: ' + joined + ' cabos sueltos unidos a la calle de al lado');
})();

// =====================================================================================================
// 10. Calles frente a edificios: tramos bajo edificios, ancho real de cada calle y fachadas que pisan la calzada
// =====================================================================================================
let wallGrid, bldGrid;
function indexBuildings() { wallGrid = new SegGrid(40); bldGrid = new Map(); B.forEach((b, bi) => { if (b.k === 'roof') return; b.bb = bboxOf(b.p); const n = b.p.length; for (let i = 0; i < n; i++) { const a = b.p[i], c = b.p[(i + 1) % n]; wallGrid.add(a[0], a[1], c[0], c[1], [bi, i]); }
    for (let x = Math.floor(b.bb[0] / 40); x <= Math.floor(b.bb[2] / 40); x++) for (let z = Math.floor(b.bb[1] / 40); z <= Math.floor(b.bb[3] / 40); z++) { const k = x * 100003 + z; let l = bldGrid.get(k); if (!l) bldGrid.set(k, l = []); l.push(bi); } }); }
const bldAt = (x, z) => { const l = bldGrid.get(Math.floor(x / 40) * 100003 + Math.floor(z / 40)); if (l) for (const bi of l) { const b = B[bi]; if (x >= b.bb[0] && x <= b.bb[2] && z >= b.bb[1] && z <= b.bb[3] && inPoly(b.p, x, z)) return bi; } return -1; };
const cumOf = p => { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; };
const pointAt = (p, cum, s) => { let i = 1; while (i < p.length - 1 && cum[i] < s) i++; const l = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / l)); return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t, i - 1]; };
// tramos de una vía que quedan dentro de edificios: [{ s0, s1, bs:Set, ev:[cruces con paredes] }]
function insideRuns(r) {
  const p = r.p, cum = cumOf(p), L = cum[cum.length - 1], ev = [];
  for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], rx = b[0] - a[0], rz = b[1] - a[1];
    wallGrid.each(Math.min(a[0], b[0]) - .1, Math.min(a[1], b[1]) - .1, Math.max(a[0], b[0]) + .1, Math.max(a[1], b[1]) + .1, s => { const ex = s[2] - s[0], ez = s[3] - s[1], den = rx * ez - rz * ex; if (Math.abs(den) < 1e-9) return;
      const rl = Math.hypot(rx, rz) || 1, tol = .3 / rl; let t = ((s[0] - a[0]) * ez - (s[1] - a[1]) * ex) / den; const u = ((s[0] - a[0]) * rz - (s[1] - a[1]) * rx) / den; if (t < -tol || t > 1 + tol || u < 0 || u > 1) return; t = Math.max(0, Math.min(1, t));      // con algo de margen: en OSM la vía suele acabar justo en la pared
      ev.push({ s: cum[i] + t * rl, b: s[4][0], x: a[0] + rx * t, z: a[1] + rz * t, wx: ex, wz: ez, dx: rx / rl, dz: rz / rl }); }); }
  ev.sort((a, b) => a.s - b.s); const cuts = [0].concat(ev.map(e => e.s), [L]), runs = []; let cur = null;
  for (let i = 0; i + 1 < cuts.length; i++) { if (cuts[i + 1] - cuts[i] < .05) continue; const m = pointAt(p, cum, (cuts[i] + cuts[i + 1]) / 2), bi = bldAt(m[0], m[1]);
    if (bi < 0) { cur = null; continue; } if (cur && Math.abs(cur.s1 - cuts[i]) < .06) { cur.s1 = cuts[i + 1]; cur.bs.add(bi); } else { cur = { s0: cuts[i], s1: cuts[i + 1], bs: new Set([bi]) }; runs.push(cur); } }
  runs.forEach(q => { q.ev = ev.filter(e => e.s >= q.s0 - .06 && e.s <= q.s1 + .06); q.L = L; const m = pointAt(p, cum, (q.s0 + q.s1) / 2), w = wallGrid.near(m[0], m[1], 30, tag => !q.bs.has(tag[0])); q.depth = w ? w.d : 30; });
  return runs;
}
function degrees() { const deg = new Map(); R.forEach(r => r.p.forEach((q, i) => { const k = nkey(q); deg.set(k, (deg.get(k) || 0) + (i === 0 || i === r.p.length - 1 ? 1 : 2)); })); return deg; }
// qué hacer con cada tramo interior: 'pass' (paso bajo el edificio), 'trunc' (entrada a un garaje: la vía acaba en la puerta), 'drop' o 'clip' (roce con una esquina)
function classify(r, q, deg) {
  const len = q.s1 - q.s0, atA = q.s0 < .6, atB = q.s1 > q.L - .6; if (atA && atB) return r.full ? 'pass' : 'drop';
  if (atA || atB) { const k = nkey(atA ? r.p[0] : r.p[r.p.length - 1]), dead = (deg.get(k) || 1) <= 1; if (!dead && (r.u || len >= 5)) return 'pass'; if (dead && (len >= 2.5 || r.t === 'service' || !DRV(r))) return 'trunc'; return 'clip'; }
  if (r.u) return 'pass'; if (len >= 6 && q.depth >= 2.6) return 'pass'; return 'clip';
}
indexBuildings();
// 10a. vías enteras dentro de un edificio (aparcamientos cubiertos, pasillos): fuera
// Las que unen dos salidas a la calle son pasos bajo el edificio y se quedan.
{ const fullIn = r => { const runs = insideRuns(r); return runs.length === 1 && runs[0].s0 < .6 && runs[0].s1 > runs[0].L - .6; }, full = new Set(R.filter(fullIn)), at = new Map();
  R.forEach(r => [r.p[0], r.p[r.p.length - 1]].forEach(q => { const k = nkey(q); let l = at.get(k); if (!l) at.set(k, l = []); l.push(r); }));
  const open = q => { for (let a = 0; a < 8; a++) if (bldAt(q[0] + Math.sin(a * .7854) * 1.2, q[1] + Math.cos(a * .7854) * 1.2) < 0) return true; return false; };
  const seen = new Set(), drop = new Set(); full.forEach(r0 => { if (seen.has(r0)) return; const grp = [], st = [r0], exits = new Set(); seen.add(r0);
    while (st.length) { const r = st.pop(); grp.push(r); [r.p[0], r.p[r.p.length - 1]].forEach(q => { const k = nkey(q); let ex = open(q); (at.get(k) || []).forEach(o => { if (o === r) return; if (full.has(o)) { if (!seen.has(o)) { seen.add(o); st.push(o); } } else ex = true; }); if (ex) exits.add(k); }); }
    if (exits.size >= 2) grp.forEach(r => { r.full = 1; r.u = 1; }); else grp.forEach(r => drop.add(r)); });
  for (let i = R.length - 1; i >= 0; i--) if (drop.has(R[i])) R.splice(i, 1);
  if (full.size) console.log('  vías enteras bajo edificios: ' + (full.size - drop.size) + ' son pasos y se quedan, ' + drop.size + ' son interiores (garajes, pasillos) y se quitan'); }
// 10b. ancho de cada calle según el hueco entre fachadas, y fachadas que se echan atrás
const MINW = r => r.t === 'service' || r.t === 'track' ? 2.6 : r.o || r.t === 'living_street' ? 3.5 : r.t === 'residential' || r.t === 'unclassified' ? 5 : 5.6;
const pairSkip = new Set();     // "vía|edificio" que se cruzan a propósito (pasos y garajes): ahí no se toca la fachada
const PARKT = { residential: 1, unclassified: 1, living_street: 1, tertiary: 1, secondary: 1 }, PKW = [0, 2, 4, 4.6];
(function fit() {
  const deg = degrees(), L0 = r => { let l = 0; for (let k = 0; k + 1 < r.p.length; k++) l += Math.hypot(r.p[k + 1][0] - r.p[k][0], r.p[k + 1][1] - r.p[k][1]); return l; }; let narrowed = 0, pkTag = 0, pkGuess = 0, pkLen = 0;
  R.forEach((r, ri) => { r.runs = insideRuns(r); r.runs.forEach(q => { q.cls = classify(r, q, deg); if (q.cls !== 'clip') q.bs.forEach(b => pairSkip.add(ri + '|' + b)); }); });
  // calzadas que van en paralelo y pegadas (la subida a un puente y la calle de abajo, dos sentidos separados, una vía de servicio):
  // entre las dos no pueden ocupar más que la distancia que hay entre sus ejes. Cada una se queda con su parte, en proporción a su ancho
  { const CAR = r => r.t !== 'steps' && r.t !== 'path' && r.t !== 'footway' && r.t !== 'cycleway' && r.t !== 'pedestrian', G = new Map(), gk = (x, z) => Math.floor(x / 20) * 100003 + Math.floor(z / 20), S = [];
    R.forEach((r, ri) => { if (!CAR(r)) return; const p = r.p, cum = cumOf(p), L = cum[cum.length - 1]; r._s = []; for (let s = Math.min(2, L / 2); s < L; s += 4) { const m = pointAt(p, cum, s), m2 = pointAt(p, cum, Math.min(L, s + 1)), m1 = pointAt(p, cum, Math.max(0, s - 1)), dl = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]) || 1, e = [m[0], m[1], (m2[0] - m1[0]) / dl, (m2[1] - m1[1]) / dl, ri, Math.min(s, L - s)]; r._s.push(e); const k = gk(m[0], m[1]); let l = G.get(k); if (!l) G.set(k, l = []); l.push(e); } });
    let nPar = 0; R.forEach((r, ri) => { if (!CAR(r) || !r._s) return; const hs = [];
      r._s.forEach(e => { let best = null; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = G.get(gk(e[0] + i * 20, e[1] + j * 20)); if (!l) continue; for (const q of l) { if (q[4] === ri) continue; const dx = q[0] - e[0], dz = q[1] - e[1], al = dx * e[2] + dz * e[3], la = Math.abs(-dx * e[3] + dz * e[2]); if (Math.abs(al) > 3 || la < 1.5 || la > 16 || Math.abs(q[2] * e[2] + q[3] * e[3]) < .9) continue; if (e[5] < 18 && q[5] < 18) continue; /* cerca de los dos extremos: ahí se están juntando en un cruce */ if (!best || la < best[0]) best = [la, R[q[4]]]; } }
        if (best) { const o = best[1]; hs.push(Math.max(MINW(r) / 2, best[0] * r.w / (r.w + o.w) - .4)); } });
      if (hs.length >= 3) { hs.sort((a, b) => a - b); r.hpar = hs[Math.floor(hs.length * .2)]; if (r.hpar * 2 < r.w - .05) nPar++; } delete r._s; });
    console.log('  calzadas paralelas y pegadas: ' + nPar + ' tramos se estrechan para no pisarse'); }
  R.forEach((r, ri) => { if (r.t === 'steps' || r.t === 'path' || r.t === 'footway' || r.t === 'cycleway') return; const p = r.p, cum = cumOf(p), L = cum[cum.length - 1], cs = [];
    for (let s = Math.min(1, L / 2); s < L; s += 2.5) { if (r.runs.some(q => q.cls !== 'clip' && s > q.s0 - 2 && s < q.s1 + 2)) continue; const m = pointAt(p, cum, s), w = wallGrid.near(m[0], m[1], 14, tag => pairSkip.has(ri + '|' + tag[0])); cs.push(w ? w.d : 14); }
    if (!cs.length) return; cs.sort((a, b) => a - b); const c25 = cs[Math.floor(cs.length * .25)];
    if (r.t === 'pedestrian') { if (num(r.w0) && c25 < 13) r.w = r1(Math.max(3, Math.min(11, c25 * 2 - .6))); return; }     // la calle peatonal ocupa de fachada a fachada
    // calles de barrio: la calzada es la suma de sus carriles y sus bandas de aparcamiento, lo que quepa entre las aceras
    if (PARKT[r.t] && !r.rb && !r.b && !r.u && !r.pr && num(r.w0) && !r.wTag) { const n = r.o ? (r.l || 1) : Math.max(2, r.l || 2), lw = n === 1 ? 3.3 : 3, usable = Math.min(c25 >= 13.9 ? 99 : 2 * c25 - 2.8, r.hpar ? r.hpar * 2 : 99); let L = r.pkl, Rg = r.pkr;
      if (L === undefined && Rg === undefined) { const spare = usable - n * lw; Rg = spare >= 2 ? 1 : 0; L = spare >= 4.1 ? 1 : 0; pkGuess++; } else pkTag++; L = L || 0; Rg = Rg || 0;
      const need = () => n * lw + PKW[L] + PKW[Rg]; if (need() > usable && L > 1) L = 1; if (need() > usable && Rg > 1) Rg = 1; if (need() > usable) L = 0; if (need() > usable) Rg = 0;
      const w = r1(Math.max(MINW(r), Math.min(need(), usable))); if (w < r.w - .05) narrowed++; r.w = w; r.pkl = L; r.pkr = Rg; if (L || Rg) pkLen += L0(r) * ((L ? 1 : 0) + (Rg ? 1 : 0)); return; }
    r.pkl = r.pkr = 0;
    const side = r.t === 'service' || r.t === 'track' ? .3 : 1.2, hw = Math.max(MINW(r) / 2, Math.min(r.w / 2, c25 - side, r.hpar || 99)); if (hw * 2 < r.w - .05) { r.w = r1(hw * 2); narrowed++; } });
  console.log('  aparcamiento en la calle: ' + pkTag + ' tramos con dato del mapa, ' + pkGuess + ' por el ancho · ' + (pkLen / 1000).toFixed(1) + ' km de banda');
  // fachadas: cada punto que quede dentro de la calle se lleva al borde, hacia el lado del edificio
  const rg = new SegGrid(40); let maxNeed = 0; R.forEach((r, ri) => { if (!DRV(r)) return; const need = r.w / 2 + (r.t === 'service' || r.t === 'track' ? .3 : 1); r.need = need; maxNeed = Math.max(maxNeed, need);
    const cum = cumOf(r.p); for (let i = 0; i + 1 < r.p.length; i++) { const mid = (cum[i] + cum[i + 1]) / 2; if (r.runs.some(q => q.cls !== 'clip' && mid > q.s0 && mid < q.s1)) continue; rg.add(r.p[i][0], r.p[i][1], r.p[i + 1][0], r.p[i + 1][1], ri); } });
  let moved = 0, pushed = 0; const o = {};
  B.forEach((b, bi) => { if (b.k === 'roof') return; const bb = b.bb; let any = false; rg.each(bb[0] - maxNeed, bb[1] - maxNeed, bb[2] + maxNeed, bb[3] + maxNeed, () => { any = true; }); if (!any) return;
    const c = centroid(b.p); let ring = [], ch = false;
    // se trocean las paredes que pasan cerca de una calle para poder moverlas por tramos
    for (let i = 0, n = b.p.length; i < n; i++) { const a = b.p[i], d = b.p[(i + 1) % n], l = Math.hypot(d[0] - a[0], d[1] - a[1]); let nearRoad = false; rg.each(Math.min(a[0], d[0]) - maxNeed, Math.min(a[1], d[1]) - maxNeed, Math.max(a[0], d[0]) + maxNeed, Math.max(a[1], d[1]) + maxNeed, () => { nearRoad = true; });
      ring.push(a); if (nearRoad && l > 2.2) { const k = Math.ceil(l / 2); for (let j = 1; j < k; j++) ring.push([a[0] + (d[0] - a[0]) * j / k, a[1] + (d[1] - a[1]) * j / k]); } }
    for (let it = 0; it < 2; it++) ring = ring.map(q => { let best = null; rg.each(q[0] - maxNeed, q[1] - maxNeed, q[0] + maxNeed, q[1] + maxNeed, s => { const r = R[s[4]]; if (pairSkip.has(s[4] + '|' + bi)) return; const d = distSeg(q[0], q[1], s[0], s[1], s[2], s[3], o); if (d >= r.need - .02) return;
        // lado del edificio en ese punto de la calle: se mira a los dos lados, justo fuera del pasillo que hay que dejar libre
        const sx = s[2] - s[0], sz = s[3] - s[1], sl = Math.hypot(sx, sz) || 1, nx = -sz / sl, nz = sx / sl, sideQ = (q[0] - s[0]) * nx + (q[1] - s[1]) * nz, far = r.need + 1.2;
        const pa = inPoly(b.p, o.x + nx * far, o.z + nz * far), pb = inPoly(b.p, o.x - nx * far, o.z - nz * far); let side; if (pa && pb) return; else if (pa) side = 1; else if (pb) side = -1; else side = sideQ >= 0 ? 1 : -1;      // a los dos lados hay edificio: la calle pasa por debajo y ahí no se toca
        let tx, tz; if (o.t > 0 && o.t < 1) { tx = o.x + nx * side * r.need; tz = o.z + nz * side * r.need; }
        else { const ex = q[0] - o.x, ez = q[1] - o.z, el = Math.hypot(ex, ez); if (el < .05) { tx = o.x + nx * side * r.need; tz = o.z + nz * side * r.need; } else { tx = o.x + ex / el * r.need; tz = o.z + ez / el * r.need; } }
        const mv = Math.hypot(tx - q[0], tz - q[1]); if (mv > 7) return; if (!best || mv > best[2]) best = [tx, tz, mv]; });
      if (best) { ch = true; moved = Math.max(moved, best[2]); return [best[0], best[1]]; } return q; });
    if (ch) { const s = simplifyRing(ring.map(q => [r1(q[0]), r1(q[1])]), .25); if (s.length >= 3 && area(s) >= 8) { b.p = s; b.a = area(s); pushed++; } else b.dead = 1; } });
  for (let i = B.length - 1; i >= 0; i--) if (B[i].dead) B.splice(i, 1);
  console.log('  calles ajustadas al hueco entre fachadas: ' + narrowed + ' · fachadas retiradas de la calzada: ' + pushed + ' edificios (máx. ' + moved.toFixed(1) + ' m)');
})();
// 10c. con la geometría final: garajes (la vía acaba en la puerta) y pasos bajo edificios (bocas y túnel)
indexBuildings();
// casetas y cobertizos pequeños que siguen pisando una calle para coches: se quitan (en el mapa suelen estar mal colocados)
{ const deg = degrees(), kill = new Set(); R.forEach(r => { if (!DRV(r)) return; insideRuns(r).forEach(q => { const cls = classify(r, q, deg); if (cls === 'trunc' || cls === 'drop') return; q.bs.forEach(b => { if (B[b].a < 150 && B[b].h < 9) kill.add(B[b]); }); }); });
  if (kill.size) { for (let i = B.length - 1; i >= 0; i--) if (kill.has(B[i])) B.splice(i, 1); indexBuildings(); console.log('  ' + kill.size + ' casetas que pisaban una calle, quitadas'); } }
(function passages() {
  const deg = degrees(); let nt = 0, np = 0, left = 0; const out = [], portalAt = [];
  R.forEach((r, ri) => { const runs = insideRuns(r); let p = r.p, a0 = 0, a1 = lenOf(p); const cum = cumOf(p), pass = [];
    runs.forEach(q => { const cls = classify(r, q, deg); if (cls === 'drop') { a1 = -1; return; } if (cls === 'trunc') { if (q.s0 < .06) a0 = Math.max(a0, q.s1 + .5); else a1 = Math.min(a1, q.s0 - .5); nt++; } else if (cls === 'pass' || (DRV(r) && q.s1 - q.s0 > .4)) { pass.push(q); if (cls !== 'pass') left++; } });
    const cut = a0 > 0 || a1 < cum[cum.length - 1] - .01; if (a1 < 0 || (cut && a1 - a0 < 3)) return;
    if (cut) { const q = []; const A = pointAt(p, cum, a0), Z2 = pointAt(p, cum, a1); q.push([r1(A[0]), r1(A[1])]); for (let i = 0; i < p.length; i++) if (cum[i] > a0 + .05 && cum[i] < a1 - .05) q.push(p[i]); q.push([r1(Z2[0]), r1(Z2[1])]); r.p = p = q; }
    pass.forEach(q => { if (q.s1 < a0 || q.s0 > a1) return; np++; const car = DRV(r), half = (car ? r.w / 2 + .45 : Math.min(r.w, 3) / 2 + .3), h = Math.min(car ? 4.4 : 3.2, Math.min.apply(null, [...q.bs].map(b => B[b].h)) - .4); if (h < 2.2) return;
      q.ev.forEach((e, k) => { const wl = Math.hypot(e.wx, e.wz) || 1, sn = Math.abs(e.dx * e.wz - e.dz * e.wx) / wl, hw = Math.min(7, half / Math.max(.45, sn));
        // boca si a un lado del cruce hay edificio y al otro calle; entre dos edificios pegados solo se abre el hueco
        let nx = e.wz / wl, nz = -e.wx / wl; const inA = bldAt(e.x + nx * .6, e.z + nz * .6) >= 0, inB = bldAt(e.x - nx * .6, e.z - nz * .6) >= 0; if (!inA && !inB) return; if (inA && !inB) { nx = -nx; nz = -nz; }
        const mouth = inA !== inB ? 1 : 0; if (portalAt.some(q => Math.hypot(q[0] - e.x, q[1] - e.z) < .8)) return; portalAt.push([e.x, e.z]); M.portals.push(r1(e.x), r1(e.z), r2(Math.atan2(nx, nz)), r1(hw), mouth, r1(h)); });
      const c2 = cumOf(r.p), off = a0, tp = [], A = pointAt(r.p, c2, Math.max(0, q.s0 - off)), Z2 = pointAt(r.p, c2, Math.min(c2[c2.length - 1], q.s1 - off)); tp.push([A[0], A[1]]); for (let i = 0; i < r.p.length; i++) if (c2[i] > q.s0 - off + .05 && c2[i] < q.s1 - off - .05) tp.push(r.p[i]); tp.push([Z2[0], Z2[1]]);
      if (lenOf(tp) > 1.5) M.tubes.push({ p: flat(tp), w: r1(half * 2), h: r1(h), k: car ? 0 : 1 }); r.u = 1; });
    out.push(r); });
  R.length = 0; out.forEach(r => R.push(r));
  console.log('  entradas de garaje recortadas: ' + nt + ' · pasos bajo edificios: ' + np + (left ? ' (de ellos, ' + left + ' roces con una esquina que se dejan como paso)' : ''));
})();

// =====================================================================================================
// 11. Red principal: lo que no esté unido a ella (otra orilla, recintos) se marca para que el juego no mande nada allí
// =====================================================================================================
{ const C = components(); let iso = 0; R.forEach(r => { if (!DRV(r)) return; if (C.find(nkey(r.p[0])) !== C.find(C.main)) { r.iso = 1; iso += lenOf(r.p); } });
  const tot = R.reduce((s, r) => s + (DRV(r) ? lenOf(r.p) : 0), 0); console.log('  red de coches: ' + (tot / 1000).toFixed(1) + ' km, ' + ((tot - iso) / 1000).toFixed(1) + ' km unidos entre sí'); }
// y dentro de ella, lo que no tiene ida y vuelta respetando los sentidos únicos (salidas del mapa, fondos de saco de un solo sentido): el GPS no manda allí
(function oneWayTraps() {
  const id = new Map(), out = [], inn = [], nid = q => { const k = nkey(q); let i = id.get(k); if (i === undefined) { i = out.length; id.set(k, i); out.push([]); inn.push([]); } return i; };
  R.forEach(r => { if (!DRV(r) || r.iso) return; for (let i = 0; i + 1 < r.p.length; i++) { const a = nid(r.p[i]), b = nid(r.p[i + 1]); out[a].push(b); inn[b].push(a); if (!r.o) { out[b].push(a); inn[a].push(b); } } });
  const N = out.length; if (!N) return; let start = 0, best = -1; out.forEach((l, i) => { if (l.length + inn[i].length > best) { best = l.length + inn[i].length; start = i; } });
  // se prueba desde varios nudos y se queda el conjunto más grande de «se puede ir y volver»
  const reach = (g, s) => { const seen = new Uint8Array(N), st = [s]; seen[s] = 1; while (st.length) { const n = st.pop(); for (const m of g[n]) if (!seen[m]) { seen[m] = 1; st.push(m); } } return seen; };
  let core = null, size = 0; for (let t = 0; t < 12; t++) { const s = t ? Math.floor(hash('scc' + t) * N) : start, f = reach(out, s), bk = reach(inn, s); let c = 0; const both = new Uint8Array(N); for (let i = 0; i < N; i++) if (f[i] && bk[i]) { both[i] = 1; c++; } if (c > size) { size = c; core = both; } if (size > N * .6) break; }
  let dead = 0; R.forEach(r => { if (!DRV(r) || r.iso) return; if (r.p.some(q => !core[id.get(nkey(q))])) { r.dead = 1; dead += lenOf(r.p); } });
  console.log('  sin ida y vuelta (salidas del mapa y sentidos únicos sin retorno): ' + (dead / 1000).toFixed(1) + ' km');
})();
R.forEach(r => { const o = { t: r.t, p: flat(r.p), w: r.w }; ['n', 'ne', 'o', 'b', 'u', 'v', 'pr', 's', 'l', 'rb', 'ns', 'iso', 'dead', 'inc', 'sc', 'hr', 'cv'].forEach(k => { if (r[k] !== undefined) o[k] = r[k]; }); if (r.pkl) o.pl = r.pkl; if (r.pkr) o.pr2 = r.pkr; r.out = o; M.roads.push(o); });
crossTmp.forEach(c => { if (R.indexOf(c.road) < 0 || bldAt(c.x, c.z) >= 0) return; M.cross.push(c.x, c.z, r2(c.a), c.road.w, c.sig ? 1 : 0); });
signTmp.forEach(c => { if (R.indexOf(c.road) < 0) return; M.signs.push(c.x, c.z, r2(c.a), c.road.w, c.k); });
lightTmp.forEach(c => { if (R.indexOf(c.road) < 0) return; M.lights.push(c.x, c.z, r2(c.a), c.road.w); });
B.forEach(b => { const o = { p: flat(b.p), h: b.h }; if (b.k) o.k = b.k; ['c', 'rc', 'rs', 'm', 'lv', 'ty', 'rf'].forEach(q => { if (b[q] !== undefined) o[q] = b[q]; }); if (b.real) o.rh = 1; if (b.n) { o.n = b.n; const c = centroid(b.p); if (inside(c[0], c[1], 0)) M.labels.push([c[0], c[1], b.n, 'b']); } M.bld.push(o); });
G.forEach(g => { const o = { p: flat(g.p), k: g.k }; if (g.s) o.s = g.s; if (g.n) { o.n = g.n; const c = centroid(g.p); if (g.k !== 'lot' && g.k !== 'ind' && g.k !== 'urb' && inside(c[0], c[1], 0)) M.labels.push([c[0], c[1], g.n, g.k === 'plaza' ? 'z' : g.k === 'pitch' ? 's' : g.k === 'yard' ? 'b' : 'p']); } M.green.push(o); });

// =====================================================================================================
// 12. Árboles y mobiliario
// =====================================================================================================
const roadGrid = new SegGrid(40); R.forEach((r, ri) => { for (let i = 0; i + 1 < r.p.length; i++) roadGrid.add(r.p[i][0], r.p[i][1], r.p[i + 1][0], r.p[i + 1][1], ri); });
const onRoad = (x, z, m) => { let hit = false; roadGrid.each(x - 9, z - 9, x + 9, z + 9, s => { const r = R[s[4]]; if (DRV(r) && distSeg(x, z, s[0], s[1], s[2], s[3]) < r.w / 2 + (m || 0)) hit = true; }); return hit; };
const free = (x, z, m) => inside(x, z, 6) && bldAt(x, z) < 0 && !onRoad(x, z, m || .2) && !inWater(x, z);
ntags.forEach(n => { if (n.tags.natural === 'tree') { const x = px(n), z = pz(n); if (inside(x, z, MARG - 5) && bldAt(x, z) < 0 && !onRoad(x, z, .3)) M.trees.push(x, z); } });
ways.forEach(w => { if (w.tags.natural !== 'tree_row') return; const p = pts(w); for (let i = 0; i + 1 < p.length; i++) { const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]), n = Math.max(1, Math.round(l / 7)); for (let k = 0; k <= (i + 2 === p.length ? n : n - 1); k++) { const x = r1(p[i][0] + (p[i + 1][0] - p[i][0]) * k / n), z = r1(p[i][1] + (p[i + 1][1] - p[i][1]) * k / n); if (inside(x, z, MARG - 5) && bldAt(x, z) < 0 && !onRoad(x, z, .3)) M.trees.push(x, z); } } });
if (M.trees.length > 14000) M.trees.length = 14000;

// =====================================================================================================
// 12b. Muros, vallas, setos y muros de contención (barrier=*), con su altura si el mapa la trae
// =====================================================================================================
// t: w muro, f valla (fr barandilla), h seto, r muro de contención (lo bajo queda a la derecha del sentido de la vía), j new jersey, g bionda
// Se quitan los que van pegados a la fachada de un edificio y se cortan en las puertas (nodos barrier=gate, lift_gate, entrance…)
// grúas pórtico (man_made=crane con su carril dibujado como polígono): centro, rumbo, largo y ancho del carril
M.cranes = []; ways.forEach(w => { const t = w.tags; if (t.man_made !== 'crane' || !/gantry|portal/.test(t['crane:type'] || 'gantry')) return; const p = pts(w); if (p.length < 4) return; let cx = 0, cz = 0; p.forEach(q => { cx += q[0]; cz += q[1]; }); cx /= p.length; cz /= p.length; let sxx = 0, szz = 0, sxz = 0; p.forEach(q => { const dx = q[0] - cx, dz = q[1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }); const a = .5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(a), uz = Math.sin(a); let l0 = 1e9, l1 = -1e9, w0 = 1e9, w1 = -1e9; p.forEach(q => { const u = (q[0] - cx) * ux + (q[1] - cz) * uz, v = -(q[0] - cx) * uz + (q[1] - cz) * ux; l0 = Math.min(l0, u); l1 = Math.max(l1, u); w0 = Math.min(w0, v); w1 = Math.max(w1, v); }); M.cranes.push([r1(cx), r1(cz), r2(a), r1(l0), r1(l1), r1(w1 - w0)]); });
M.lift = []; ntags.forEach(n => { const t = n.tags; if (t.highway !== 'elevator' || t.indoor === 'yes' || t.railway || num(t.level) < 0) return; const x = px(n), z = pz(n); if (inside(x, z, 0) && bldAt(x, z) < 0) M.lift.push(r1(x), r1(z)); });
M.bar = [];
const clipLine = p => { const X = HX + MARG, Z = HZ + MARG, runs = []; let run = null; for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1], c = clipSeg(a, b, X, Z); if (!c) { run = null; continue; } const A = c[0] > 0 ? [a[0] + (b[0] - a[0]) * c[0], a[1] + (b[1] - a[1]) * c[0]] : a, B = c[1] < 1 ? [a[0] + (b[0] - a[0]) * c[1], a[1] + (b[1] - a[1]) * c[1]] : b; if (!run || c[0] > 0) { run = [A]; runs.push(run); } run.push(B); if (c[1] < 1) run = null; } return runs; };
{ const KIND = { wall: 'w', city_wall: 'w', fence: 'f', hedge: 'h', retaining_wall: 'r', jersey_barrier: 'j', guard_rail: 'g', handrail: 'f' };
  const gate = new Set(); ntags.forEach(n => { const t = n.tags; if (/^(gate|lift_gate|swing_gate|sliding_gate|entrance|turnstile|kissing_gate|stile|chain|bollard|block)$/.test(t.barrier || '') || t.entrance) gate.add(n.id); });
  let nb = 0, nOff = 0;
  ways.forEach(w => { const t = w.tags, k = KIND[t.barrier]; if (!k || t.building || t.highway || t.location === 'underground') return;
    const all = pts(w); if (all.length < 2) return; let runs = [[]];
    all.forEach(q => { if (gate.has(q[2])) { runs[runs.length - 1].push(q); runs.push([q]); } else runs[runs.length - 1].push(q); });
    const h0 = num(t.height), mat = t['wall'] || t.material || t['fence:material'] || '', ft = t.fence_type || '';
    runs.forEach(run => { if (run.length < 2) return; let q = clipLine(run.map(v => [v[0], v[1]])); q.forEach(seg => { seg = simplify(seg, .25); if (seg.length < 2) return;
      // ¿va pegado a una fachada? (muros que en el mapa son la pared de un edificio o la valla de su patio)
      let near = 0, tot = 0; for (let i = 0; i + 1 < seg.length; i++) { const a = seg[i], b = seg[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / 2)); for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, z = a[1] + (b[1] - a[1]) * j / n; tot++; const hit = wallGrid.near(x, z, .7); if (hit || bldAt(x, z) >= 0) near++; } }
      if (near > tot * .6) { nOff++; return; }
      const o = { t: k, p: flat(seg.map(v => [r1(v[0]), r1(v[1])])) }; if (h0 > .2 && h0 < 8) o.h = r1(h0);
      if (k === 'f' && /railing|metal|bars/.test(ft + mat)) o.t = 'fr'; if (k === 'w') { const m2 = /brick/.test(mat) ? 'b' : /stone|rock/.test(mat) ? 's' : ''; if (m2) o.m = m2; }
      M.bar.push(o); nb++; }); }); });
  console.log('  muros y vallas: ' + nb + ' tramos (' + nOff + ' pegados a fachadas, fuera)'); }

// =====================================================================================================
// 13. Comercios (con su sitio en la fachada), barrios, metro y tren, hitos
// =====================================================================================================
const CAT = { pub: 'bar', bar: 'bar', nightclub: 'bar', cafe: 'cafe', restaurant: 'rest', fast_food: 'fast', ice_cream: 'cafe', pharmacy: 'pharm', bank: 'bank', fuel: 'fuel', police: 'police', townhall: 'town', library: 'civic', community_centre: 'civic', social_centre: 'civic', theatre: 'civic', cinema: 'civic', post_office: 'civic', clinic: 'health', doctors: 'health', dentist: 'health', hospital: 'health', veterinary: 'health', place_of_worship: 'church', driving_school: 'shop', school: 'school', college: 'school', kindergarten: 'school' };
const SHOP = { supermarket: 'super', convenience: 'super', greengrocer: 'food', butcher: 'food', seafood: 'food', bakery: 'bakery', pastry: 'bakery', confectionery: 'bakery', deli: 'food', clothes: 'clothes', shoes: 'clothes', bag: 'clothes', jewelry: 'clothes', hairdresser: 'hair', beauty: 'hair', lottery: 'lottery', tobacco: 'tobacco', newsagent: 'tobacco', kiosk: 'tobacco', car_repair: 'garage', car: 'garage', optician: 'health', chemist: 'pharm' };
const poiOf = t => (t.amenity && CAT[t.amenity]) || (t.shop && t.shop !== 'vacant' && t.shop !== 'no' && (SHOP[t.shop] || 'shop')) || (t.leisure === 'fitness_centre' || t.leisure === 'sports_centre' ? 'sport' : t.leisure === 'amusement_arcade' || t.leisure === 'bowling_alley' ? 'bar' : null) || (t.office ? 'office' : null) || (t.tourism === 'hotel' || t.tourism === 'guest_house' || t.tourism === 'hostel' ? 'hotel' : null);
const PRIO = { bar: 9, cafe: 9, rest: 9, fast: 9, super: 8, bakery: 8, pharm: 8, fuel: 8, food: 7, tobacco: 7, lottery: 7, bank: 6, hair: 5, clothes: 5, shop: 4, garage: 4, health: 3, hotel: 3, sport: 3, police: 3, town: 3, civic: 2, church: 2, office: 1, school: 1 };
// farmacias, consultas y despachos suelen llevar el nombre de su titular: en el juego salen con el nombre genérico de lo que son
const GENERIC = t => t.amenity === 'pharmacy' || t.shop === 'chemist' ? 'Farmacia' : t.amenity === 'dentist' ? 'Clínica dental' : t.amenity === 'veterinary' ? 'Clínica veterinaria' : t.shop === 'optician' ? 'Óptica' : t.shop === 'hairdresser' ? 'Peluquería' : t.shop === 'beauty' ? 'Centro de estética' : t.amenity === 'doctors' || t.amenity === 'clinic' ? 'Consulta médica' : t.amenity === 'hospital' ? 'Centro de salud' : t.office ? 'Oficinas' : null;
const pois = [], seenPoi = new Set(), addPoi = (x, z, t) => { const c = poiOf(t), name = GENERIC(t) || t.name || t.brand || t.operator; if (!c || !name || t.disused === 'yes' || t.abandoned === 'yes' || !inside(x, z, 0)) return; const k = c + '|' + name + '|' + Math.round(x / 25) + ',' + Math.round(z / 25); if (seenPoi.has(k)) return; seenPoi.add(k); pois.push({ x, z, c, n: name.length > 30 ? name.slice(0, 29).trim() + '…' : name }); };
const PLACE = /^(neighbourhood|quarter|suburb|hamlet|locality)$/;
ntags.forEach(n => { const t = n.tags, x = px(n), z = pz(n); addPoi(x, z, t);
  if (t.place && PLACE.test(t.place) && t.name && inside(x, z, 250)) M.places.push([x, z, t.name]);
  if (!inside(x, z, 5)) return;
  if (t.amenity === 'bench') { if (free(x, z)) M.props.bench.push(x, z); } else if (t.amenity === 'waste_basket') { if (free(x, z)) M.props.bin.push(x, z); } else if (t.amenity === 'drinking_water' || t.amenity === 'fountain') { if (free(x, z)) M.props.font.push(x, z); }
  else if (t.highway === 'bus_stop' || (t.public_transport === 'platform' && t.bus === 'yes')) M.props.bus.push([x, z, t.name || '']);
  else if (t.highway === 'elevator') { if (bldAt(x, z) < 0) M.props.lift.push(x, z); }
  else if (t.power === 'tower') M.props.pylon.push(x, z);
  else if (t.tourism === 'artwork' || t.historic === 'memorial' || t.historic === 'monument') { if (free(x, z)) M.props.art.push(x, z); if (t.name) M.labels.push([x, z, t.name, 'a']); }
  if (t.railway === 'subway_entrance') M.transit.push([x, z, 'metro', t.name || '']); else if ((t.railway === 'station' || t.railway === 'halt') && t.station !== 'subway' && t.subway !== 'yes') M.transit.push([x, z, 'tren', t.name || '']);
  if (t.tourism === 'viewpoint' && t.name) M.labels.push([x, z, t.name, 'a']); });
ways.forEach(w => { const t = w.tags; if (!closed(w) || !(t.name || GENERIC(t))) return; const c = centroid(pts(w)); if (poiOf(t)) addPoi(c[0], c[1], t); if (!t.name) return; if (t.tourism === 'attraction' && inside(c[0], c[1], 0)) { const p = pts(w), b = bboxOf(p); M.marks.push({ x: c[0], z: c[1], n: t.name, r: r1(Math.max(b[2] - b[0], b[3] - b[1]) / 2), k: /horno alto/i.test(t.name) ? 'furnace' : 'site' }); M.labels.push([c[0], c[1], t.name, 'a']); }
  if (t.man_made === 'crane') M.marks.push({ x: c[0], z: c[1], n: t.name || '', r: 6, k: 'crane' }); });
// el Horno Alto lleva su propia maqueta en el juego: se quitan los volúmenes del mapa que caen encima
{ const n0 = M.bld.length; M.bld = M.bld.filter(b => { let x = 0, z = 0; for (let k = 0; k < b.p.length; k += 2) { x += b.p[k]; z += b.p[k + 1]; } x /= b.p.length / 2; z /= b.p.length / 2; return !M.marks.some(m => m.k === 'furnace' && Math.hypot(x - m.x, z - m.z) < m.r * .95); }); if (M.bld.length < n0) console.log('  Horno Alto: ' + (n0 - M.bld.length) + ' volúmenes sustituidos por la maqueta'); }
// cada boca de metro lleva el nombre de su estación: la parada de metro más cercana
{ const stops = []; ntags.forEach(n => { const t = n.tags; if (t.name && (t.station === 'subway' || t.subway === 'yes' || /Metro/i.test(t.network || '')) && (t.railway === 'stop' || t.railway === 'station' || t.public_transport === 'station' || t.public_transport === 'stop_position')) stops.push([px(n), pz(n), t.name]); });
  M.transit.forEach(s => { if (s[2] !== 'metro') return; let best = null, bd = 450; stops.forEach(q => { const d = Math.hypot(q[0] - s[0], q[1] - s[1]); if (d < bd) { bd = d; best = q; } }); s[4] = best ? best[2] : ''; }); }
// sitio de cada rótulo: la pared más cercana de su edificio que dé a una calle. Si dos rótulos se pisan, se queda el más útil para el juego.
(function anchors() {
  const taken = [], o = {}; let n = 0; pois.sort((a, b) => (PRIO[b.c] || 0) - (PRIO[a.c] || 0));
  pois.forEach(p => { let bi = bldAt(p.x, p.z), best = null;
    wallGrid.each(p.x - 26, p.z - 26, p.x + 26, p.z + 26, s => { const b = B[s[4][0]]; if (b.k === 'roof' || b.k === 'chimney' || b.k === 'tank' || b.h < 3) return; const d = distSeg(p.x, p.z, s[0], s[1], s[2], s[3], o), wl = Math.hypot(s[2] - s[0], s[3] - s[1]); if (wl < 2.6 || d > (bi === s[4][0] ? 26 : 7) || (bi >= 0 && bi !== s[4][0])) return;
      let nx = (s[3] - s[1]) / wl, nz = -(s[2] - s[0]) / wl; const t = Math.max(1.5 / wl, Math.min(1 - 1.5 / wl, o.t)), ax = s[0] + (s[2] - s[0]) * t, az = s[1] + (s[3] - s[1]) * t; if (bldAt(ax + nx * .4, az + nz * .4) >= 0) { nx = -nx; nz = -nz; } if (bldAt(ax + nx * 1.6, az + nz * 1.6) >= 0 || inWater(ax + nx * 2, az + nz * 2)) return;
      // tiene que haber una calle o un camino delante
      let street = 99; roadGrid.each(ax + nx * 6 - 14, az + nz * 6 - 14, ax + nx * 6 + 14, az + nz * 6 + 14, q => { const dd = distSeg(ax + nx * 2, az + nz * 2, q[0], q[1], q[2], q[3]); if (dd < street) street = dd; }); if (street > 16) return;
      const score = d + street * .25; if (!best || score < best.score) best = { score, ax, az, nx, nz, wl }; });
    const e = [p.x, p.z, p.c, p.n]; if (best && !taken.some(q => Math.hypot(q[0] - best.ax, q[1] - best.az) < 4.6)) { taken.push([best.ax, best.az]); e.push(r1(best.ax), r1(best.az), r2(Math.atan2(best.nx, best.nz))); n++; } M.poi.push(e); });
  console.log('  comercios y servicios: ' + pois.length + ', ' + n + ' con rótulo en su fachada');
})();

// =====================================================================================================
// 14. Salida
// =====================================================================================================
if (!M.roads.length) { console.error('El archivo no trae calles (highway=*). Exporta una zona con calles.'); process.exit(1); }
M.bbox = [r1(-HX), r1(-HZ), r1(HX), r1(HZ)]; M.center = [+latC.toFixed(5), +lonC.toFixed(5)]; M.margin = MARG;
// relieve: si está tools/dem.json (lo hace tools/mkdem.js con el modelo digital del terreno del IGN), va dentro del mapa
{ const dp = path.join(__dirname, 'dem.json'); if (fs.existsSync(dp)) { M.dem = JSON.parse(fs.readFileSync(dp, 'utf8')); M.attribution += ' · Relieve: MDT © Instituto Geográfico Nacional (CC BY 4.0)'; console.log('  relieve: malla de ' + M.dem.fine.nx + 'x' + M.dem.fine.nz + ' cada ' + M.dem.fine.d + ' m'); } }
const json = JSON.stringify(M); fs.writeFileSync(opt.out, opt.json ? json : '// Mapa generado con tools/osm2map.js. ' + M.attribution + '.\nwindow.MAPDATA=' + json + ';\n');
const km = v => (v / 1000).toFixed(2).replace('.', ',') + ' km';
console.log(path.basename(opt.out) + ' · ' + (json.length / 1024).toFixed(0) + ' KB · ' + km(2 * HX) + ' × ' + km(2 * HZ) + ' · zona: ' + regSrc + ' (' + reg.map(v => v.toFixed(4)).join(', ') + ')');
console.log('  vías ' + M.roads.length + ' (' + M.roads.filter(r => HW[r.t]).length + ' para coches, ' + new Set(M.roads.map(r => r.n).filter(Boolean)).size + ' nombres) · edificios ' + M.bld.length + ' (' + B.filter(b => b.real).length + ' con altura real) · agua ' + M.water.length + ' · suelo ' + M.green.length + ' · vías de tren ' + M.rail.length + ' (tren: ' + M.train.length + ') · árboles ' + M.trees.length / 2);
console.log('  pasos de cebra ' + M.cross.length / 5 + ' · señales ' + M.signs.length / 5 + ' · semáforos ' + (M.lights.length / 4 + M.cross.filter((v, i) => i % 5 === 4 && v).length) + ' · bancos ' + M.props.bench.length / 2 + ' · paradas de bus ' + M.props.bus.length + ' · barrios ' + M.places.length + ' · metro y tren ' + M.transit.length + ' · sitios con nombre ' + M.labels.length + ' · túneles ' + M.tubes.length);
if (2 * HX > 6000 || 2 * HZ > 6000) console.log('  Aviso: la zona pasa de 6 km de lado. Irá más fluido si la recortas con --clip.');
if (!M.bld.length) console.log('  Aviso: no hay edificios en el archivo. El export tiene que incluir building=*.');
if (!M.water.length) console.log('  Aviso: no hay agua en la zona.');
