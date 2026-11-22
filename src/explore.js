// explore.js: el barrio en el que estás y el álbum de Sestao (barrios y sitios que se van descubriendo)
import { G } from './state.js';
import { W } from './world.js';
import { toast, banner, dialog, closeDialog } from './hud.js';
import { money, saveGame } from './life.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id); let t = 0, zone = '', zoneTxt = '', sites = null;
function siteList() { if (sites) return sites; const M = W.map, seen = new Set(); sites = []; (M.marks || []).forEach(m => { if (m.n && !seen.has(m.n)) { seen.add(m.n); sites.push({ x: m.x, z: m.z, n: m.n, r: Math.max(30, (m.r || 10) + 22) }); } });
  (M.labels || []).forEach(l => { if (l[3] !== 'a' || seen.has(l[2])) return; seen.add(l[2]); sites.push({ x: l[0], z: l[1], n: l[2], r: 20 }); }); return sites; }
const album = S => S.seen || (S.seen = { z: {}, s: {} });
export function tickExplore(dt) {
  if ((t -= dt) > 0) return; t = .6; const S = G.S, M = W.map, A = album(S), px = G.px, pz = G.pz; let best = '', bd = 380;
  (M.places || []).forEach(p => { const d = Math.hypot(p[0] - px, p[1] - pz); if (d < bd) { bd = d; best = p[2]; } });
  zone = best; { const txt = best ? best + (W.map.dem ? ' · ' + Math.round(G.py || 0) + ' m' : '') : ''; if (txt !== zoneTxt) { zoneTxt = txt; const el = $('zone'); if (el) { el.textContent = txt; el.hidden = !txt; } } }      // barrio y, con relieve, la altitud a la que está Ethan
  if (best && bd < 260 && !A.z[best]) { A.z[best] = 1; const n = Object.keys(A.z).length, N = (M.places || []).length; toast('Barrio nuevo: ' + best + ' · ' + n + ' de ' + N, '🏘️'); sfx('ok'); if (n === N) { banner('¡Todo Sestao!', 'Has pisado todos los barrios. Toma, para unos pintxos.', 4000); money(200, 'álbum de barrios'); } saveGame(); }
  for (const s of siteList()) { if (A.s[s.n]) continue; if (Math.hypot(s.x - px, s.z - pz) < s.r) { A.s[s.n] = 1; toast('Sitio descubierto: ' + s.n + ' · ' + Object.keys(A.s).length + ' de ' + sites.length, '📸'); sfx('ok'); saveGame(); break; } }
}
// el álbum, desde el móvil: lo que falta y GPS al más cercano
export function openAlbum(back) {
  const S = G.S, M = W.map, A = album(S), P = M.places || [], L = siteList(), nz = Object.keys(A.z).length, ns = Object.keys(A.s).length, near = (list, key, name) => { let b = null, bd = 1e9; list.forEach(p => { const x = p.x === undefined ? p[0] : p.x, z = p.z === undefined ? p[1] : p.z, n = name(p); if (key[n]) return; const d = Math.hypot(x - G.px, z - G.pz); if (d < bd) { bd = d; b = { x, z, n }; } }); return b; };
  const zb = near(P, A.z, p => p[2]), sb = near(L, A.s, p => p.n), o = [];
  if (zb) o.push({ t: 'Ir al barrio que falta más cerca', d: zb.n, tag: 'GPS', f: () => { closeDialog(); G.setDest({ x: zb.x, z: zb.z, n: zb.n, icon: '🏘️' }); } });
  if (sb) o.push({ t: 'Ir al sitio que falta más cerca', d: 'Un monumento o un rincón de Sestao', tag: 'GPS', f: () => { closeDialog(); G.setDest({ x: sb.x, z: sb.z, n: 'Sitio por descubrir', icon: '📸' }); } });
  dialog({ icon: '📒', title: 'Álbum de Sestao', text: 'Barrios: ' + nz + ' de ' + P.length + ' · Sitios: ' + ns + ' de ' + L.length + ' · Kilómetros: ' + (S.stats.km || 0).toFixed(1).replace('.', ',') + (Object.keys(A.z).length ? ' · Último barrio: ' + (zone || '—') : ''), options: o, close: 'Volver', onClose: back });
}
