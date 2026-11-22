// graph.js: red de calles para el GPS, el tráfico y saber por qué calle va Ethan.
import { ROAD, laneOff, clampWorld } from './world.js';

export const GR = { x: [], z: [], drv: [], iso: [], out: [], core: null, adj: [], ea: [], eb: [], el: [], er: [], roads: null, ngrid: new Map(), egrid: new Map() };
const NC = 60, EC = 40, key = (a, b) => a * 100003 + b;

export function buildGraph(roads) {
  GR.roads = roads; const ids = new Map();
  const node = (x, z) => { const k = Math.round(x * 10) + ',' + Math.round(z * 10); let id = ids.get(k); if (id === undefined) { id = GR.x.length; ids.set(k, id); GR.x.push(x); GR.z.push(z); GR.drv.push(false); GR.iso.push(true); GR.out.push(clampWorld(x, z, 8.5) !== null); GR.adj.push([]); const g = key(Math.floor(x / NC), Math.floor(z / NC)); let l = GR.ngrid.get(g); if (!l) GR.ngrid.set(g, l = []); l.push(id); } return id; };
  roads.forEach((r, ri) => { const sp = ROAD[r.t]; if (!sp) return; let prev = -1;
    for (let k = 0; k < r.p.length; k += 2) { const id = node(r.p[k], r.p[k + 1]); if (sp[3]) { GR.drv[id] = true; if (!r.iso && !r.dead) GR.iso[id] = false; }
      if (prev >= 0 && prev !== id) { const e = GR.ea.length, len = Math.hypot(GR.x[id] - GR.x[prev], GR.z[id] - GR.z[prev]); GR.ea.push(prev); GR.eb.push(id); GR.el.push(len); GR.er.push(ri);
        const out = GR.out[prev] || GR.out[id];      // tramo que sale de la zona jugable: el GPS no lo usa; el tráfico sí, para irse del mapa
        GR.adj[prev].push({ e, to: id, drive: !!sp[3], out }); GR.adj[id].push({ e, to: prev, drive: !!sp[3] && !r.o, out });
        const a = Math.floor(Math.min(GR.x[id], GR.x[prev]) / EC), b = Math.floor(Math.max(GR.x[id], GR.x[prev]) / EC), c = Math.floor(Math.min(GR.z[id], GR.z[prev]) / EC), d = Math.floor(Math.max(GR.z[id], GR.z[prev]) / EC);
        for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const g = key(i, j); let l = GR.egrid.get(g); if (!l) GR.egrid.set(g, l = []); l.push(e); } }
      prev = id; } });
  // núcleo de la red: los nudos desde los que se puede ir a cualquier otro y volver en coche sin salir del mapa. Lo demás
  // (salidas, calles de sentido único sin retorno, recintos sueltos) no sirve como destino del GPS ni para los encargos.
  const N = GR.x.length, inn = GR.adj.map(() => []); GR.adj.forEach((A, n) => A.forEach(a => { if (a.drive && !a.out) inn[a.to].push(n); }));
  const reach = (fwd, s) => { const seen = new Uint8Array(N), st = [s]; seen[s] = 1; while (st.length) { const n = st.pop(); if (fwd) { for (const a of GR.adj[n]) if (a.drive && !a.out && !seen[a.to]) { seen[a.to] = 1; st.push(a.to); } } else for (const m of inn[n]) if (!seen[m]) { seen[m] = 1; st.push(m); } } return seen; };
  let best = null, size = 0; const order = []; for (let n = 0; n < N; n++) if (GR.drv[n] && !GR.out[n]) order.push(n); order.sort((a, b) => GR.adj[b].length - GR.adj[a].length);
  for (let t = 0; t < Math.min(10, order.length); t++) { const s0 = order[Math.floor(t * order.length / 10)], f = reach(true, s0), b = reach(false, s0), c = new Uint8Array(N); let k = 0; for (let n = 0; n < N; n++) if (f[n] && b[n]) { c[n] = 1; k++; } if (k > size) { size = k; best = c; } if (size > order.length * .5) break; }
  GR.core = best || new Uint8Array(N); for (let n = 0; n < N; n++) GR.iso[n] = !GR.core[n];
}
// tramo más cercano a un punto: { e, t (0..1), d, x, z, road }. main: solo calles de la red principal (sin servicio ni recintos)
const near = { e: -1, t: 0, d: 1e9, x: 0, z: 0, road: null };
export function nearestEdge(x, z, drivable, maxR, main) {
  const o = near; o.e = -1; o.d = 1e9; o.road = null; const R = Math.ceil((maxR || 80) / EC), cx = Math.floor(x / EC), cz = Math.floor(z / EC);
  for (let i = cx - R; i <= cx + R; i++) for (let j = cz - R; j <= cz + R; j++) { const l = GR.egrid.get(key(i, j)); if (!l) continue;
    for (let q = 0; q < l.length; q++) { const e = l[q], r = GR.roads[GR.er[e]]; if (drivable && !ROAD[r.t][3]) continue; if (main && (main === 3 ? !(GR.core[GR.ea[e]] && GR.core[GR.eb[e]]) : (r.iso || r.pr || r.t === 'service' || r.t === 'track' || (main === 1 && !(GR.core[GR.ea[e]] && GR.core[GR.eb[e]]))))) continue;      /* main 3: vale cualquier tramo del que se pueda volver, también los de un aparcamiento */ const a = GR.ea[e], b = GR.eb[e], ax = GR.x[a], az = GR.z[a], ex = GR.x[b] - ax, ez = GR.z[b] - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < o.d) { o.d = d; o.e = e; o.t = t; o.x = px; o.z = pz; o.road = r; } } }
  return o;
}
export function nearestNode(x, z, drivable) {
  let best = -1, bd = 1e9; const cx = Math.floor(x / NC), cz = Math.floor(z / NC);
  for (let R = 1; R <= 8 && best < 0; R++) for (let i = cx - R; i <= cx + R; i++) for (let j = cz - R; j <= cz + R; j++) { const l = GR.ngrid.get(key(i, j)); if (!l) continue;
    for (let q = 0; q < l.length; q++) { const n = l[q]; if (GR.out[n] || (drivable && (!GR.drv[n] || GR.iso[n]))) continue; const d = Math.hypot(GR.x[n] - x, GR.z[n] - z); if (d < bd) { bd = d; best = n; } } }
  return best;
}
// ruta más rápida (A*). En coche evita, si puede, los aparcamientos y los recintos privados. Devuelve la lista de nodos o null.
export function route(from, to, onFoot) {
  if (from < 0 || to < 0) return null; if (from === to) return [from];
  const N = GR.x.length, g = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N), heap = [], hx = GR.x[to], hz = GR.z[to];
  const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
  g[from] = 0; push(from, 0); let steps = 0;
  while (heap.length && steps++ < 400000) { const n = pop()[1]; if (done[n]) continue; done[n] = 1; if (n === to) break;
    const A = GR.adj[n]; for (let k = 0; k < A.length; k++) { const a = A[k]; if (a.out || (!onFoot && !a.drive)) continue; const r = GR.roads[GR.er[a.e]], sp = ROAD[r.t], c = g[n] + GR.el[a.e] * (onFoot ? (sp[3] && !sp[2] ? 1.6 : 1) : (r.pr ? 4 : r.t === 'service' ? 1.8 : 1) / (Math.max(5, r.vm || sp[1]) / 10));
      if (c < g[a.to]) { g[a.to] = c; prev[a.to] = n; push(a.to, c + Math.hypot(GR.x[a.to] - hx, GR.z[a.to] - hz) / (onFoot ? 1 : 2.7)); } } }
  if (prev[to] < 0) return null; const path = []; for (let n = to; n >= 0; n = prev[n]) { path.push(n); if (n === from) break; } return path.reverse();
}
// ruta entre dos puntos cualesquiera: { nodes, end } o null. Se llega por el tramo de calle más cercano al destino, no por el nudo más cercano
// (que puede estar en la calle de detrás); end es el punto de ese tramo donde hay que parar.
const pathLen = p => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(GR.x[p[i]] - GR.x[p[i - 1]], GR.z[p[i]] - GR.z[p[i - 1]]); return l; };
export function routeTo(px, pz, dx, dz, onFoot, inside) {
  // salida: los dos extremos del tramo en el que se está (uno solo si es de dirección única), cada uno con lo que cuesta llegar a él;
  // así la ruta no empieza yendo al extremo equivocado para dar la vuelta nada más salir
  let starts = []; const se = nearestEdge(px, pz, !onFoot, 60, onFoot ? 0 : 1);
  if (se.e >= 0 && se.d < 25) { const sx = se.x, sz = se.z, m1 = GR.ea[se.e], m2 = GR.eb[se.e]; starts = (!onFoot && se.road.o ? [m2] : [m1, m2]).filter(n => onFoot || !GR.iso[n]).map(n => [n, Math.hypot(GR.x[n] - sx, GR.z[n] - sz)]); }
  if (!starts.length) { const a = nearestNode(px, pz, !onFoot); if (a < 0) return null; starts = [[a, 0]]; }
  const ne = nearestEdge(dx, dz, !onFoot, 140, onFoot ? 0 : inside ? 3 : 1);      /* inside: el destino está dentro de un aparcamiento y el GPS entra hasta él */
  if (ne.e < 0) { const b = nearestNode(dx, dz, !onFoot); let best = null; for (const st of starts) { const p = route(st[0], b, onFoot); if (!p) continue; const len = st[1] + pathLen(p); if (!best || len < best.len) best = { nodes: p, len }; } return best ? { nodes: best.nodes, end: null } : null; }
  const ex = ne.x, ez = ne.z, n1 = GR.ea[ne.e], n2 = GR.eb[ne.e], cands = (!onFoot && ne.road.o ? [n1] : [n1, n2]).filter(n => !GR.out[n]); let best = null;
  for (const st of starts) for (const n of cands) { const p = route(st[0], n, onFoot); if (!p) continue; const tail = Math.hypot(GR.x[n] - ex, GR.z[n] - ez), len = st[1] + pathLen(p) + (p.length > 1 && p[p.length - 2] === (n === n1 ? n2 : n1) ? -tail : tail); if (!best || len < best.len) best = { nodes: p, len }; }
  if (!best) return null; const p = best.nodes, last = p[p.length - 1], other = last === n1 ? n2 : n1; if (p.length > 1 && p[p.length - 2] === other) p.pop(); /* si la ruta pasaba de largo por el tramo, se corta en el punto */
  return { nodes: p, end: [ex, ez] };
}
// desplazamiento del carril al recorrer el tramo e desde el nodo a
export const laneOffset = (e, a) => laneOff(GR.roads[GR.er[e]], GR.ea[e] === a);
