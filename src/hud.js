// hud.js: minimapa, barras, avisos, menús y mapa grande (todo en HTML encima del lienzo 3D)
import * as THREE from 'three';
import { G } from './state.js';
import { clearKeys } from './input.js';
import { GR, nearestEdge } from './graph.js';
import { W, ROAD } from './world.js';
import { SP } from './spots.js';
import { ST, CAT } from './street.js';
import { drawTiles, levelFor, MAPCOL } from './mapdraw.js';
import { P } from './player.js';

const $ = id => document.getElementById(id), DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
let lastSt = null, mctx, mmT = 0, hudT = 0, dl = null, labels = new Map(), bannerT = 0; const v3 = new THREE.Vector3();
export const fmtTime = S => DAYS[(S.day - 1) % 7] + ' · ' + String(Math.floor(S.min / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(S.min % 60)).padStart(2, '0');
export const eur = n => { const v = Math.round(n * 100) / 100; return (v % 1 ? v.toFixed(2).replace('.', ',') : Math.round(v).toLocaleString('es-ES')) + ' €'; };

export function initHud() {
  mctx = $('mm').getContext('2d'); $('d-c').onclick = () => closeDialog(); $('bm-c').onclick = () => closeMap(); $('mini').onclick = () => openMap();
}
export function toast(text, icon) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = (icon ? icon + ' ' : '') + text; const box = $('toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3400); }
export function banner(title, sub, ms) { const b = $('banner'); b.innerHTML = '<h3></h3><p></p>'; b.firstChild.textContent = title; b.lastChild.textContent = sub || ''; b.hidden = false; bannerT = (ms || 2600) / 1000; }
export function setPrompt(key, text) { const p = $('prompt'); if (!text) { p.hidden = true; return; } const h = (G.touch ? '' : '<kbd>' + key + '</kbd>') + text; if (p.dataset.h !== h) { p.dataset.h = h; p.dataset.k = 'Key' + key; p.innerHTML = h; } p.hidden = false; }
export function setTracker(title, text) { const t = $('tracker'); if (!title) { t.hidden = true; return; } const h = '<b>' + title + '</b>' + text; if (t.dataset.h !== h) { t.dataset.h = h; t.innerHTML = h; } t.hidden = false; }
export function fade(on) { $('fade').classList.toggle('on', !!on); }

// ---------- menús
export function dialog(o) {
  dl = o; G.busy = true; clearKeys(); $('banner').hidden = true; bannerT = 0; $('d-ic').textContent = o.icon || ''; $('d-t').textContent = o.title || ''; $('d-x').textContent = o.text || ''; const box = $('d-o'); box.innerHTML = '';
  (o.options || []).forEach((op, i) => { const b = document.createElement('button'); b.className = 'opt'; b.disabled = !!op.dis; b.innerHTML = '<i>' + (i < 9 ? i + 1 : i === 9 ? 0 : '·') + '</i><div><b></b><small></small></div>' + (op.tag ? '<em></em>' : ''); b.querySelector('b').textContent = op.t; b.querySelector('small').textContent = op.d || ''; if (op.tag) b.querySelector('em').textContent = op.tag; b.onclick = () => { if (!op.dis) op.f(); }; box.appendChild(b); });
  $('d-c').textContent = o.close || 'Salir'; $('d-c').hidden = !!o.noClose; $('dlg').hidden = false; setPrompt();
}
export function closeDialog() { const o = dl; dl = null; $('dlg').hidden = true; G.busy = false; clearKeys(); if (o && o.onClose) o.onClose(); }
export const dialogOpen = () => !!dl;
// teclas con un menú abierto: números para elegir, Esc para salir
export function hudKey(k) {
  if (!$('bigmap').hidden) { if (k === 'Escape' || k === 'KeyM') closeMap(); return true; }
  if (!dl) return false; const m = /^(?:Digit|Numpad)(\d)$/.exec(k);
  if (m) { const op = (dl.options || [])[m[1] === '0' ? 9 : +m[1] - 1]; if (op && !op.dis) op.f(); } else if ((k === 'Escape' || k === 'KeyQ') && !dl.noClose) closeDialog(); else if (k === 'Enter' && (dl.options || []).length === 1 && !dl.options[0].dis) dl.options[0].f();
  return true;
}

// ---------- minimapa: el plano por teselas, girado con la cámara
function drawMini() {
  const c = mctx, R = 160, s = R / 150, cy = G.cam.yaw, cs = Math.cos(cy), sn = Math.sin(cy), px = G.px, pz = G.pz, T = (x, z) => { const dx = (x - px) * s, dz = (z - pz) * s; return [R + dx * cs - dz * sn, R + dx * sn + dz * cs]; };
  c.save(); c.beginPath(); c.arc(R, R, R - 1, 0, 6.3); c.clip(); c.fillStyle = MAPCOL.out; c.fillRect(0, 0, 320, 320);
  c.setTransform(cs * s, sn * s, -sn * s, cs * s, R, R); c.translate(-px, -pz); drawTiles(c, 1, px - 215, pz - 215, px + 215, pz + 215, 1); c.setTransform(1, 0, 0, 1, 0, 0);
  if (G.path && G.path.length > 1) { c.beginPath(); G.path.forEach((n, k) => { const q = T(GR.x[n], GR.z[n]); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); if (G.pathEnd) { const q = T(G.pathEnd[0], G.pathEnd[1]); c.lineTo(q[0], q[1]); } if (G.dest) { const q = T(G.dest.x, G.dest.z); c.lineTo(q[0], q[1]); } c.strokeStyle = '#2f8fff'; c.lineWidth = 6; c.lineJoin = 'round'; c.stroke(); }
  c.restore();
  const blip = (x, z, col, txt, clampIt, big) => { let q = T(x, z); const dx = q[0] - R, dy = q[1] - R, d = Math.hypot(dx, dy), lim = R - 16; if (d > lim) { if (!clampIt) return; q = [R + dx / d * lim, R + dy / d * lim]; } c.beginPath(); c.arc(q[0], q[1], big ? 15 : 12, 0, 6.3); c.fillStyle = col; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#1f3328'; c.stroke(); if (txt) { c.font = (big ? 17 : 14) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, q[0], q[1] + 1); } };
  ST.transit.forEach(t => { const q = T(t.x, t.z); if (Math.hypot(q[0] - R, q[1] - R) > R - 14) return; c.fillStyle = t.k === 'metro' ? '#d0322e' : '#6b2a8a'; c.fillRect(q[0] - 9, q[1] - 9, 18, 18); c.fillStyle = '#fff'; c.font = '800 14px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t.k === 'metro' ? 'M' : 'T', q[0], q[1] + 1); });
  SP.list.forEach(sp => blip(sp.x, sp.z, '#' + sp.col.toString(16).padStart(6, '0'), sp.icon, false));
  // los otros jugadores (online)
  (G.peersMap || []).forEach(o => { const q = T(o.x, o.z), dx = q[0] - R, dy = q[1] - R, d = Math.hypot(dx, dy), lim = R - 14, x = d > lim ? R + dx / d * lim : q[0], y = d > lim ? R + dy / d * lim : q[1]; c.beginPath(); c.arc(x, y, d > lim ? 6 : 9, 0, 6.3); c.fillStyle = '#ff5ca0'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke(); });
  // mientras toca aparcar: el borde de tu zona (dentro vale cualquier plaza libre) y el parking grande
  if (G.pzone) { const q = T(G.pzone.x, G.pzone.z); c.save(); c.beginPath(); c.arc(R, R, R - 3, 0, 6.3); c.clip(); c.beginPath(); c.arc(q[0], q[1], G.pzone.R * s, 0, 6.3); c.setLineDash([10, 8]); c.lineWidth = 3; c.strokeStyle = '#3ce06a'; c.stroke(); c.restore(); if (G.pbig) blip(G.pbig.x, G.pbig.z, '#2f6fe0', 'P', true, false); }
  (G.pdots || []).forEach(s => { const q = T(s.x, s.z); if (Math.hypot(q[0] - R, q[1] - R) > R - 12) return; c.beginPath(); c.arc(q[0], q[1], 9, 0, 6.3); c.fillStyle = '#3ce06a'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#1f3328'; c.stroke(); c.fillStyle = '#10301c'; c.font = '800 11px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', q[0], q[1] + 1); });
  (G.blips || []).forEach(b => blip(b.x, b.z, b.col || '#ffe26a', b.icon || '', true, true));
  if (G.dest) blip(G.dest.x, G.dest.z, '#2f8fff', G.dest.icon || '', true, true);
  if (G.mode === 'foot' && G.car) blip(G.car.x, G.car.z, '#f2efe6', '🚗', Math.hypot(G.car.x - px, G.car.z - pz) < 600);
  // Ethan: flecha según hacia dónde mira respecto a la cámara
  const yaw = G.mode === 'car' ? G.car.yaw : P.yaw, hx = Math.sin(yaw), hz = Math.cos(yaw), ax = hx * cs - hz * sn, ay = hx * sn + hz * cs, a = Math.atan2(ax, -ay);
  c.save(); c.translate(R, R); c.rotate(a); c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fillStyle = '#c8dc4a'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#1f3328'; c.stroke(); c.restore();
  // norte
  const nx = R + (-sn) * -(R - 13), ny = R + cs * -(R - 13); c.font = '800 15px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1f3328'; c.fillText('N', nx, ny);
}

// ---------- mapa grande: se arrastra, se amplía, se busca en él y se toca para marcar destino
const MV = { cx: 0, cz: 0, s: 1, ptr: new Map(), moved: 0, pinch: 0, dpr: 1, raf: 0 }; let names = null, finder = null;
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// una etiqueta por calle: el tramo más largo con ese nombre
function streetNames() {
  if (names) return names; const by = new Map(); W.map.roads.forEach(r => { const sp = ROAD[r.t]; if (!r.n || !sp || r.x && !r.n) return; if (!sp[3] && r.t !== 'pedestrian') return; let L = 0; for (let k = 0; k + 3 < r.p.length; k += 2) L += Math.hypot(r.p[k + 2] - r.p[k], r.p[k + 3] - r.p[k + 1]);
    let acc = 0, mx = r.p[0], mz = r.p[1], ang = 0; for (let k = 0; k + 3 < r.p.length; k += 2) { const l = Math.hypot(r.p[k + 2] - r.p[k], r.p[k + 3] - r.p[k + 1]); if (acc + l >= L / 2) { const t = (L / 2 - acc) / (l || 1); mx = r.p[k] + (r.p[k + 2] - r.p[k]) * t; mz = r.p[k + 1] + (r.p[k + 3] - r.p[k + 1]) * t; ang = Math.atan2(r.p[k + 3] - r.p[k + 1], r.p[k + 2] - r.p[k]); break; } acc += l; }
    const o = { n: r.n, ne: r.ne, x: mx, z: mz, a: ang, L, cls: r.t === 'primary' || r.t === 'trunk' || r.t === 'secondary' ? 0 : r.t === 'tertiary' ? 1 : r.t === 'service' || r.t === 'pedestrian' || r.t === 'living_street' ? 3 : 2, iso: !!r.iso }; let l = by.get(r.n); if (!l) by.set(r.n, l = []); l.push(o); });
  names = []; by.forEach(l => { l.sort((a, b) => b.L - a.L); const keep = []; l.forEach(o => { if (!keep.some(q => Math.hypot(q.x - o.x, q.z - o.z) < 260)) keep.push(o); }); keep.forEach(o => names.push(o)); }); return names;
}
function drawMap() {
  MV.raf = 0; const cv = $('bm'), c = cv.getContext('2d'), dpr = MV.dpr, s = MV.s * dpr, w = cv.width, h = cv.height, T = (x, z) => [w / 2 + (x - MV.cx) * s, h / 2 + (z - MV.cz) * s], hx = w / 2 / s, hz = h / 2 / s, vis = (x, z, m) => Math.abs(x - MV.cx) < hx + (m || 0) && Math.abs(z - MV.cz) < hz + (m || 0);
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = MAPCOL.out; c.fillRect(0, 0, w, h); c.imageSmoothingEnabled = true;
  c.setTransform(s, 0, 0, s, w / 2 - MV.cx * s, h / 2 - MV.cz * s); const miss = drawTiles(c, levelFor(s), MV.cx - hx, MV.cz - hz, MV.cx + hx, MV.cz + hz, 5); c.setTransform(1, 0, 0, 1, 0, 0); if (miss && !MV.raf) MV.raf = requestAnimationFrame(drawMap);
  { const b = W.map.bbox, a = T(b[0], b[1]), q = T(b[2], b[3]); c.setLineDash([8 * dpr, 6 * dpr]); c.strokeStyle = '#1f332866'; c.lineWidth = 1.5 * dpr; c.strokeRect(a[0], a[1], q[0] - a[0], q[1] - a[1]); c.setLineDash([]); }
  if (G.path && G.path.length > 1) { c.beginPath(); G.path.forEach((n, k) => { const q = T(GR.x[n], GR.z[n]); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); if (G.pathEnd) { const q = T(G.pathEnd[0], G.pathEnd[1]); c.lineTo(q[0], q[1]); } c.strokeStyle = '#2f8fff'; c.lineWidth = 5 * dpr; c.lineJoin = 'round'; c.stroke(); }
  // etiquetas, sin pisarse: barrios, calles, parques, estaciones y comercios
  const used = [], free = (x, y, tw, th) => { const r = [x - tw / 2 - 3, y - th / 2 - 2, x + tw / 2 + 3, y + th / 2 + 2]; for (const u of used) if (r[0] < u[2] && r[2] > u[0] && r[1] < u[3] && r[3] > u[1]) return false; used.push(r); return true; };
  const text = (t, x, y, font, col, halo, ang) => { c.font = font; const tw = c.measureText(t).width, th = parseInt(font.match(/(\d+)px/)[1], 10); if (!free(x, y, ang ? Math.abs(Math.cos(ang)) * tw + Math.abs(Math.sin(ang)) * th : tw, ang ? Math.abs(Math.sin(ang)) * tw + Math.abs(Math.cos(ang)) * th : th)) return false; c.save(); c.translate(x, y); if (ang) c.rotate(ang); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 3 * dpr; c.strokeStyle = halo; c.strokeText(t, 0, 0); c.fillStyle = col; c.fillText(t, 0, 0); c.restore(); return true; };
  (W.map.places || []).forEach(p => { if (vis(p[0], p[1], 60)) { const q = T(p[0], p[1]); text(p[2].toUpperCase(), q[0], q[1], '800 ' + Math.round(12 * dpr) + 'px system-ui', '#5a4a3a', '#fffc'); } });
  if (MV.s >= .55) ST.transit.forEach(t => { if (!vis(t.x, t.z)) return; const q = T(t.x, t.z), r = 8 * dpr; c.fillStyle = t.k === 'metro' ? '#d0322e' : '#6b2a8a'; c.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r); c.fillStyle = '#fff'; c.font = '800 ' + Math.round(11 * dpr) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t.k === 'metro' ? 'M' : 'T', q[0], q[1] + dpr); used.push([q[0] - r, q[1] - r, q[0] + r, q[1] + r]); if (MV.s >= 1.1) text(t.n, q[0], q[1] + 15 * dpr, '700 ' + Math.round(10 * dpr) + 'px system-ui', t.k === 'metro' ? '#a0221e' : '#55206e', '#fffd'); });
  streetNames().forEach(o => { if (MV.s < [.5, .8, 1.5, 2.6][o.cls] || !vis(o.x, o.z, 20)) return; if (o.L * s < 60 * dpr) return; const q = T(o.x, o.z); let a = o.a; if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI; text(o.n, q[0], q[1], (o.cls < 2 ? '700 ' : '600 ') + Math.round((o.cls < 2 ? 11 : 10) * dpr) + 'px system-ui', '#3a3f46', '#fffd', a); });
  if (MV.s >= 1.3) (W.map.labels || []).forEach(l => { if (l[3] === 'b' || !vis(l[0], l[1])) return; const q = T(l[0], l[1]); text(l[2], q[0], q[1], 'italic 600 ' + Math.round(10 * dpr) + 'px system-ui', l[3] === 'a' ? '#7a4a2a' : '#2f6b3a', '#fffc'); });
  if (MV.s >= 1.7) ST.pois.forEach(p => { if (!vis(p.x, p.z)) return; const q = T(p.ax, p.az); c.beginPath(); c.arc(q[0], q[1], 3.6 * dpr, 0, 6.3); c.fillStyle = (CAT[p.c] || CAT.shop)[0]; c.fill(); c.lineWidth = dpr; c.strokeStyle = '#fff'; c.stroke(); });
  if (MV.s >= 3) ST.pois.forEach(p => { if (!vis(p.x, p.z)) return; const q = T(p.ax, p.az); text(p.n, q[0], q[1] - 9 * dpr, '600 ' + Math.round(9.5 * dpr) + 'px system-ui', '#2a2a2a', '#fffd'); });
  const dot = (x, z, col, txt, R) => { const q = T(x, z); c.beginPath(); c.arc(q[0], q[1], R * dpr, 0, 6.3); c.fillStyle = col; c.fill(); c.lineWidth = 2 * dpr; c.strokeStyle = '#1f3328'; c.stroke(); c.font = (R * 1.15 * dpr) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt || '', q[0], q[1] + dpr); };
  if (G.pbig) dot(G.pbig.x, G.pbig.z, '#2f6fe0', '🅿️', 11); (G.peersMap || []).forEach(o => { dot(o.x, o.z, '#ff5ca0', o.m === 1 ? '🚗' : '🙂', 10); const q = T(o.x, o.z); c.font = '800 ' + 11 * dpr + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 3 * dpr; c.strokeStyle = '#fff'; c.fillStyle = '#b02a6c'; c.strokeText(o.n, q[0], q[1] + 12 * dpr); c.fillText(o.n, q[0], q[1] + 12 * dpr); });
  if (G.car && G.mode === 'foot') dot(G.car.x, G.car.z, '#f2efe6', '🚗', 11); SP.list.forEach(sp => dot(sp.x, sp.z, '#' + sp.col.toString(16).padStart(6, '0'), sp.icon, 13));
  (G.blips || []).forEach(b => dot(b.x, b.z, b.col || '#ffe26a', b.icon || '', 13)); if (G.dest) dot(G.dest.x, G.dest.z, '#2f8fff', G.dest.icon || '📍', 13);
  const q = T(G.px, G.pz), yaw = G.mode === 'car' ? G.car.yaw : P.yaw; c.save(); c.translate(q[0], q[1]); c.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw))); c.beginPath(); c.moveTo(0, -15 * dpr); c.lineTo(10 * dpr, 11 * dpr); c.lineTo(0, 5 * dpr); c.lineTo(-10 * dpr, 11 * dpr); c.closePath(); c.fillStyle = '#c8dc4a'; c.fill(); c.lineWidth = 2.5 * dpr; c.strokeStyle = '#1f3328'; c.stroke(); c.restore();
}
function zoomMap(f, px, py) { const cv = $('bm'), r = cv.getBoundingClientRect(), B = W.bounds, fit = Math.min(r.width / (B[2] - B[0]), r.height / (B[3] - B[1])) * .9, ns = Math.max(fit, Math.min(5, MV.s * f)), k = 1 / MV.s - 1 / ns; if (px !== undefined) { MV.cx += (px - r.left - r.width / 2) * k; MV.cz += (py - r.top - r.height / 2) * k; } MV.s = ns; drawMap(); }
const fmtD = d => (d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km');
// buscador: calles, barrios, estaciones y comercios del mapa
function search(q) {
  if (!finder) { finder = []; streetNames().forEach(o => { if (!o.iso) finder.push({ k: norm(o.n + ' ' + (o.ne || '')), n: o.n, x: o.x, z: o.z, icon: '🛣️', pr: 2 }); }); (W.map.places || []).forEach(p => finder.push({ k: norm(p[2]), n: p[2], x: p[0], z: p[1], icon: '🏘️', pr: 1 }));
    ST.transit.forEach(t => finder.push({ k: norm((t.k === 'metro' ? 'metro ' : 'tren estacion ') + t.n), n: (t.k === 'metro' ? 'Metro ' : 'Estación ') + t.n, x: t.x, z: t.z, icon: t.k === 'metro' ? '🚇' : '🚆', pr: 1 })); ST.pois.forEach(p => { const c = CAT[p.c] || CAT.shop; finder.push({ k: norm(p.n + ' ' + c[1]), n: p.n, x: p.x, z: p.z, icon: c[2], pr: 3 }); });
    (W.map.labels || []).forEach(l => { if (l[3] !== 'b') finder.push({ k: norm(l[2]), n: l[2], x: l[0], z: l[1], icon: l[3] === 'a' ? '🗿' : '🌳', pr: 2 }); }); }
  const w = norm(q).split(/\s+/).filter(Boolean), out = []; const seen = new Set();
  for (const f of finder) { if (!w.every(t => f.k.indexOf(t) >= 0)) continue; const id = f.n + '|' + Math.round(f.x / 150) + ',' + Math.round(f.z / 150); if (seen.has(id)) continue; seen.add(id); out.push(f); }
  return out.sort((a, b) => (a.k.indexOf(w[0]) === 0 ? 0 : 1) - (b.k.indexOf(w[0]) === 0 ? 0 : 1) || a.pr - b.pr || Math.hypot(a.x - G.px, a.z - G.pz) - Math.hypot(b.x - G.px, b.z - G.pz)).slice(0, 12);
}
function fillList(q) {
  const list = $('bm-list'); list.innerHTML = ''; const add = (txt, f, cls) => { const b = document.createElement('button'); b.textContent = txt; if (cls) b.className = cls; b.onclick = () => { f(); closeMap(); }; list.appendChild(b); };
  if (q && q.trim().length > 1) { const r = search(q); if (!r.length) { const e = document.createElement('p'); e.textContent = 'No encuentro nada con ese nombre.'; list.appendChild(e); } r.forEach(f => add(f.icon + ' ' + f.n + ' · ' + fmtD(Math.hypot(f.x - G.px, f.z - G.pz)), () => G.setDest({ x: f.x, z: f.z, n: f.n, icon: f.icon }))); return; }
  SP.list.slice().sort((a, b) => Math.hypot(a.x - G.px, a.z - G.pz) - Math.hypot(b.x - G.px, b.z - G.pz)).forEach(sp => add(sp.icon + ' ' + sp.n + ' · ' + fmtD(Math.hypot(sp.x - G.px, sp.z - G.pz)), () => G.setDest({ x: sp.x, z: sp.z, n: sp.n, icon: sp.icon })));
  if (G.car && G.mode === 'foot') add('🚗 Mi coche', () => G.setDest({ x: G.car.x, z: G.car.z, n: 'Tu coche', icon: '🚗' })); if (G.dest && !G.mission) add('✖ Quitar el GPS', () => G.setDest(null));
}
export function openMap() {
  if (dl || G.title) return; G.busy = true; clearKeys(); $('bigmap').hidden = false; $('banner').hidden = true; const cv = $('bm'), r = cv.getBoundingClientRect(); MV.dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(200, r.width * MV.dpr); cv.height = Math.max(200, r.height * MV.dpr);
  MV.cx = G.px; MV.cz = G.pz; MV.s = Math.min(r.width, r.height) / 900; MV.ptr.clear(); drawMap();
  if (!cv.dataset.on) { cv.dataset.on = 1;
    cv.addEventListener('pointerdown', e => { MV.ptr.set(e.pointerId, [e.clientX, e.clientY]); if (MV.ptr.size === 1) MV.moved = 0; MV.pinch = 0; try { cv.setPointerCapture(e.pointerId); } catch (x) { } if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    cv.addEventListener('pointermove', e => { const p = MV.ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
      if (MV.ptr.size === 1) { MV.moved += Math.abs(dx) + Math.abs(dy); MV.cx -= dx / MV.s; MV.cz -= dy / MV.s; drawMap(); }
      else if (MV.ptr.size === 2) { const a = [...MV.ptr.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (MV.pinch) zoomMap(d / MV.pinch, (a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2); MV.pinch = d; MV.moved = 99; } });
    const up = e => { const had = MV.ptr.delete(e.pointerId); MV.pinch = 0; if (had && e.type === 'pointerup' && MV.moved < 8 && MV.ptr.size === 0) { const rr = cv.getBoundingClientRect(), x = MV.cx + (e.clientX - rr.left - rr.width / 2) / MV.s, z = MV.cz + (e.clientY - rr.top - rr.height / 2) / MV.s; let best = null, bd = 28 / MV.s; SP.list.forEach(sp => { const d = Math.hypot(sp.x - x, sp.z - z); if (d < bd) { bd = d; best = { x: sp.x, z: sp.z, n: sp.n, icon: sp.icon }; } });
      if (!best) { bd = 20 / MV.s; ST.transit.forEach(t => { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = { x: t.x, z: t.z, n: (t.k === 'metro' ? 'Metro ' : 'Estación ') + t.n, icon: t.k === 'metro' ? '🚇' : '🚆' }; } }); if (MV.s >= 1.7) { bd = Math.min(bd, 14 / MV.s); ST.pois.forEach(p => { const d = Math.hypot(p.ax - x, p.az - z); if (d < bd) { bd = d; best = { x: p.x, z: p.z, n: p.n, icon: (CAT[p.c] || CAT.shop)[2] }; } }); } }
      G.setDest(best || { x, z, n: 'Punto marcado', icon: '📍' }); closeMap(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', e => { e.preventDefault(); zoomMap(e.deltaY < 0 ? 1.25 : .8, e.clientX, e.clientY); }, { passive: false });
    $('bm-in').onclick = () => zoomMap(1.5); $('bm-out').onclick = () => zoomMap(1 / 1.5); const qi = $('bm-q'); if (qi) { qi.addEventListener('input', () => fillList(qi.value)); qi.addEventListener('keydown', e => { if (e.key === 'Escape') { qi.blur(); closeMap(); } else if (e.key === 'Enter') { const b = $('bm-list').querySelector('button'); if (b) b.click(); } e.stopPropagation(); }); } }
  if ($('bm-q')) $('bm-q').value = ''; fillList('');
}
export function closeMap() { $('bigmap').hidden = true; G.busy = false; clearKeys(); const q = $('bm-q'); if (q) q.blur(); }

// ---------- cada fotograma
export function updateHud(dt) {
  const S = G.S; if (!S) return;
  if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').hidden = true;
  if ((mmT -= dt) <= 0) { mmT = G.q > 1 ? .07 : .12; drawMini(); }
  if ((hudT -= dt) <= 0) { hudT = .25;
    $('clock').textContent = fmtTime(S); $('money').textContent = eur(S.money);
    const bar = (id, v) => { const e = $(id); e.style.width = Math.max(0, Math.min(100, v)) + '%'; e.parentNode.parentNode.classList.toggle('low', v < 22); };
    bar('b-en', S.energy); bar('b-hu', S.hunger); bar('b-fu', S.fuel); bar('b-dm', 100 - S.dmg);
    { const t = S.day * 1440 + S.min, B = (S.buffs || []).filter(b => b.u > t), h = B.map(b => b.ic + '×' + String(b.x).replace('.', ',') + ' ' + Math.max(1, Math.ceil((b.u - t) / 60)) + 'h').join('|'), e = $('buffs'); if (e && e.dataset.h !== h) { e.dataset.h = h; e.innerHTML = ''; B.forEach(b => { const s = document.createElement('span'); s.className = b.x < 1 ? 'bad' : ''; s.title = b.n; s.textContent = b.ic + ' ×' + String(b.x).replace('.', ',') + ' · ' + Math.max(1, Math.ceil((b.u - t) / 60)) + ' h'; e.appendChild(s); }); e.hidden = !B.length; } }
    const ne = nearestEdge(G.px, G.pz, false, 60), st = ne.e >= 0 && ne.d < 25 && ne.road.n ? ne.road.n : W.map.name; { const e = $('street'), mw = $('mini').offsetWidth, key = st + '|' + mw; if (key !== lastSt && mw) { lastSt = key; e.textContent = st; /* centrada bajo el minimapa; si no cabe, crece hacia la derecha en vez de salirse de la pantalla */ e.style.transform = 'translateX(' + -Math.min(e.offsetWidth / 2, mw / 2) + 'px)'; } }
    $('p-b').textContent = G.dr ? 'Subir' : G.mode === 'car' ? 'Freno' : 'Correr'; $('p-b').dataset.btn = G.mode === 'car' && !G.dr ? 'hb' : 'run'; $('p-car').textContent = G.dr ? '⬇' : '🚗'; }
  const inCar = G.mode === 'car'; $('speed').hidden = !inCar; if (inCar) $('speed').firstElementChild.textContent = Math.round(Math.abs(G.car.vf) * 3.6);
  // carteles sobre los sitios cercanos
  const cam = G.camera, w = innerWidth, h = innerHeight;
  SP.list.forEach(sp => { let el = labels.get(sp.id); const show = sp.dist < 70 && sp.dist > 4.5 && !G.busy;
    if (show) { v3.set(sp.x, (sp.y || 0) + (sp.drive ? 3.6 : 3.2), sp.z).project(cam); if (v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && !((v3.x * .5 + .5) * w < 290 && (-v3.y * .5 + .5) * h < 330)) { if (!el) { el = document.createElement('div'); el.className = 'lab'; el.innerHTML = sp.icon + ' ' + sp.n; $('labels').appendChild(el); labels.set(sp.id, el); } el.style.display = ''; el.style.transform = 'translate(' + ((v3.x * .5 + .5) * w).toFixed(1) + 'px,' + ((-v3.y * .5 + .5) * h).toFixed(1) + 'px) translate(-50%,-100%)'; return; } }
    if (el) el.style.display = 'none'; });
}
