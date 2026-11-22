// missions.js: encargos sacados de los sucesos del Tycoon (reparto, carrera con Jokin, la tortilla, el ladrón)
import * as THREE from 'three';
import { G, dampAng } from './state.js';
import { GR, route, routeTo, nearestNode, nearestEdge, laneOffset } from './graph.js';
import { ROAD, W, roadW } from './world.js';
import { ST } from './street.js';
import { SP } from './spots.js';
import { P } from './player.js';
import { makeBody } from './car.js';
import { npc } from './ethan.js';
import { toast, banner, setTracker, eur } from './hud.js';
import { money, saveGame } from './life.js';
import { sfx } from './audio.js';
import { damp } from './util.js';
import { standY } from './terrain.js';
import { Vox } from './vox.js';
import { RATE, addBuff, moment, cash, goSleep, carHome, note } from './day.js';
import { pass, feed, workBlock } from './life.js';

let M = null, beacon = null, lastThief = -99;
const mmss = t => Math.floor(Math.max(0, t) / 60) + ':' + String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0');
const dist = (x, z) => Math.hypot(G.px - x, G.pz - z);
const slow = () => G.mode === 'foot' || Math.abs(G.car.vf) < 5;
// calles del pueblo por las que se puede mandar a Ethan: con nombre, de la red principal y dentro del mapa
let streets = null;
function streetList() { if (streets) return streets; streets = []; GR.roads.forEach((r, ri) => { const sp = ROAD[r.t]; if (!sp || !sp[3] || !r.n || r.x || r.iso || r.pr || r.u || r.t === 'service' || r.t === 'track' || r.t.indexOf('_link') > 0 || r.p.length < 4) return; streets.push(r); }); return streets; }
// un punto al azar de una calle con nombre, a cierta distancia de (x, z): { x, z, n (calle), node }
function streetPoint(x, z, d0, d1) {
  const L = streetList(); for (let t = 0; t < 60; t++) { const r = L[Math.floor(Math.random() * L.length)], k = Math.floor(Math.random() * (r.p.length / 2 - 1)) * 2, f = Math.random(), px = r.p[k] + (r.p[k + 2] - r.p[k]) * f, pz = r.p[k + 1] + (r.p[k + 3] - r.p[k + 1]) * f, d = Math.hypot(px - x, pz - z);
    if (d < d0 || d > d1) continue; const ne = nearestEdge(px, pz, true, 20, 1); if (ne.e < 0 || ne.road !== r) continue; const b = W.map.bbox; if (px < b[0] + 30 || px > b[2] - 30 || pz < b[1] + 30 || pz > b[3] - 30) continue; return { x: ne.x, z: ne.z, n: r.n, node: GR.core[GR.ea[ne.e]] ? GR.ea[ne.e] : GR.eb[ne.e] }; }
  return null;
}
const routeLen = (x0, z0, x1, z1) => { const r = routeTo(x0, z0, x1, z1, false); if (!r) return Math.hypot(x1 - x0, z1 - z0) * 1.5; let l = 0; for (let i = 1; i < r.nodes.length; i++) l += Math.hypot(GR.x[r.nodes[i]] - GR.x[r.nodes[i - 1]], GR.z[r.nodes[i]] - GR.z[r.nodes[i - 1]]); return l + 30; };
// hasta dónde vale parar con el coche delante de un portal: el bordillo de enfrente de su calle
const farOf = (p, base) => { let f = p.far || 0; if (!f) { const ne = nearestEdge(p.x, p.z, true, 30); if (ne.e >= 0) f = ne.d + roadW(ne.road) / 2 + 1; } return Math.max(base, Math.min(22, f)); };
const streetAt = (x, z) => { const ne = nearestEdge(x, z, false, 40); return ne.e >= 0 && ne.road.n ? ne.road.n : ''; };
function setBeacon(p) {
  if (!beacon) { beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe26a, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); G.scene.add(beacon); }
  beacon.visible = !!p; if (p) beacon.position.set(p.x, 30 + standY(p.x, p.z), p.z);
}
function goal(p, n, icon) { M.goal = p; G.blips = p ? [{ x: p.x, z: p.z, icon: icon || '⭐' }] : []; setBeacon(p); G.setDest(p ? { x: p.x, z: p.z, n, icon: icon || '⭐' } : null); }
export function endMission(ok, msg, pay) {
  if (!M) return; const m = M; M = null; G.mission = null; G.blips = []; setBeacon(null); G.setDest(null); setTracker(); if (m.clean) m.clean();
  if (pay) money(pay, m.title); if (ok) { G.S.done[m.id] = (G.S.done[m.id] || 0) + 1; banner('¡Hecho!', msg || m.title); sfx('win'); } else { banner('Encargo fallido', msg || m.title); sfx('bad'); } saveGame();
}
export function startMission(id) { if (M) return; const f = START[id]; if (!f) return; if (G.slow) G.slow(); M = { id, t: null, title: '' }; G.mission = M; if (f() === false) { M = null; G.mission = null; } }
export function updateMission(dt) {
  const S = G.S;
  if (!M) { // de noche y a pie, alguna vez te intentan dar el tirón
    const h = S.min / 60; if (G.mode === 'foot' && (h > 21.5 || h < 5.5) && S.money >= 40 && S.day * 24 + h - lastThief > 7 && Math.random() < dt / 420) { lastThief = S.day * 24 + h; startMission('ladron'); }
    return; }
  if (M.t !== null) { M.t -= dt; if (M.t <= 0) { M.timeout ? M.timeout() : endMission(false, 'Se acabó el tiempo.'); return; } }
  M.tick(dt); if (M) setTracker(M.title, M.text() + (M.t !== null ? ' · <em>' + mmss(M.t) + '</em>' : ''));
}
// plan de noche en casa: hay que llegar al portal antes de que se enfríe
function nightIn(id, title, ic, msg, go, okMsg, koMsg) {
  const S = G.S, h = SP.by.home; if (!h) return false; S.daily.night = 1;
  Object.assign(M, { title, t: Math.max(165, 70 + dist(h.x, h.z) * 1.5 / 4.2), text: () => 'En casa · ' + Math.round(dist(h.x, h.z)) + ' m',
    tick() { if (G.mode === 'foot' && dist(h.x, h.z) < 3.2) { endMission(true, okMsg); go(); } }, timeout() { endMission(false, koMsg); } });
  goal({ x: h.x, z: h.z }, 'Casa de Ethan', ic); banner(ic + ' ' + title, msg, 4400); sfx('ok');
}
const plen = p => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(GR.x[p[i]] - GR.x[p[i - 1]], GR.z[p[i]] - GR.z[p[i - 1]]); return l; };
const START = {
  // Ali necesita repartidor: varias entregas contrarreloj
  reparto() {
    const k = SP.by.kebab, n = 3 + Math.min(2, Math.floor((G.S.done.reparto || 0) / 2)), C = SP.cand.filter(c => { const d = Math.hypot(c.mx - k.x, c.mz - k.z); return d > 200 && d < 1200; }), pts = [];
    for (let i = 0; i < n && C.length; i++) { const c = C.splice(Math.floor(Math.random() * C.length), 1)[0]; pts.push({ x: c.mx + c.nx * 2.2, z: c.mz + c.nz * 2.2, n: c.road.n || '', r: Math.max(8, c.far || 0) }); } if (!pts.length) return false;
    let d = 0, x = k.x, z = k.z; pts.forEach(p => { d += routeLen(x, z, p.x, p.z); x = p.x; z = p.z; });
    Object.assign(M, { title: 'Reparto de kebabs', t: d / 7.2 + n * 18 + 30, i: 0, pay: 0, text: () => 'Pedido ' + (M.i + 1) + ' de ' + pts.length + (pts[M.i] && pts[M.i].n ? ' · ' + pts[M.i].n : '') + ' · ' + Math.round(dist(M.goal.x, M.goal.z)) + ' m',
      tick() { if (dist(M.goal.x, M.goal.z) < (G.mode === 'car' ? pts[M.i].r /* vale parar delante del portal, en cualquiera de los dos carriles */ : 3.2) && slow()) { M.pay += 18 + Math.round(Math.min(12, M.t / 12)); M.i++; sfx('coin'); toast(['«¡Por fin!»', '«¿Lleva salsa blanca?»', '«Quédate con la vuelta.»', '«Llega caliente. Milagro.»'][M.i % 4], '🥙'); if (M.i >= pts.length) endMission(true, 'Reparto completo. Ali está contento.', M.pay + 15); else { goal(pts[M.i], 'Pedido ' + (M.i + 1), '🥙'); if (pts[M.i].n) toast('Siguiente pedido: ' + pts[M.i].n + '.', '📍'); } } },
      timeout() { endMission(false, 'Los kebabs han llegado fríos.', M.pay); } });
    goal(pts[0], 'Pedido 1', '🥙'); banner('Reparto de kebabs', pts.length + ' pedidos. El primero, en ' + (pts[0].n || 'el barrio') + '.'); sfx('ok');
  },
  // Lourdes hace tortilla si le llevas huevos y patatas
  tortilla() {
    const sup = SP.by.super, lou = SP.by.lourdes; if (!sup || !lou) return false; G.S.daily.tort = 1;
    Object.assign(M, { title: 'La tortilla de Lourdes', t: 300, st: 0, text: () => (M.st ? 'Lleva la compra a Lourdes' : 'Compra huevos y patatas en el súper') + ' · ' + Math.round(dist(M.goal.x, M.goal.z)) + ' m',
      tick() { if (dist(M.goal.x, M.goal.z) < (G.mode === 'car' ? M.goal.r : 3) && slow()) { if (!M.st) { if (G.S.money < 6) { endMission(false, 'No te llega ni para los huevos.'); return; } money(-6, 'huevos y patatas'); M.st = 1; goal({ x: lou.x, z: lou.z, r: farOf(lou, 9) }, 'Casa de Lourdes', '🍳'); } else { G.S.hunger = 100; G.S.energy = Math.min(100, G.S.energy + 40); endMission(true, 'Tortilla de Lourdes. Con cebolla, como debe ser.', 30); } } } });
    goal({ x: sup.x, z: sup.z, r: farOf(sup, 9) }, 'Súper', '🛒'); banner('La tortilla de Lourdes', 'Huevos y patatas, y rapidito.'); sfx('ok');
  },
  // Jokin te reta: circuito por Sestao con puntos de control
  carrera() {
    const c = G.car, S = G.S; if (!c) return false; const cps = []; let from = nearestNode(c.x, c.z, true), path = [from]; if (from < 0) return false;
    if (!GR.core[from]) { const ne = nearestEdge(c.x, c.z, true, 80, 1); if (ne.e < 0) return false; from = GR.ea[ne.e]; path = [from]; } const names = [];
    // el circuito se mide por la ruta, no en línea recta: con las direcciones únicas un control «cercano» puede quedar a un kilómetro
    let best = null;
    for (let tr = 0; tr < 6; tr++) {
      let f = from, p = [from]; const cp = [], nm = [];
      const lg = [];
      for (let k = 0; k < 3; k++) { let pick = null; for (let j = 0; j < 6; j++) { const q = k < 2 ? streetPoint(GR.x[f], GR.z[f], 220, 560) : streetPoint(GR.x[from], GR.z[from], 120, 420); /* el último control, cerca de la salida */ if (!q || q.node === f) continue; const r = route(f, q.node); if (!r || r.length < 2) continue; const l = plen(r); if (l < 150) continue; if (!pick || l < pick.l) pick = { q, r, l }; if (l < 780) break; } if (!pick) continue; p = p.concat(pick.r.slice(1)); cp.push(p.length - 1); nm.push(pick.q.n); lg.push(Math.round(pick.l)); f = pick.q.node; }
      // se vuelve a la salida solo si la vuelta no obliga a dar un rodeo; si no, la meta es el último control
      const r = route(f, p[0]), rl = r && r.length > 1 ? plen(r) : 1e9; if (rl < 700) { p = p.concat(r.slice(1)); cp.push(p.length - 1); nm.push('la salida'); lg.push(Math.round(rl)); }
      if (cp.length < 2) continue; const l = plen(p); if (!best || l < best.l) best = { p, cp, nm, l, lg }; if (l < 2600) break;
    }
    if (!best) return false; path = best.p; cps.push(...best.cp); names.push(...best.nm);
    money(-50, 'apuesta con Jokin'); if (G.mode !== 'car') G.enterCar(true);
    const pace = { c4: .9, golf: 1.04, bmw: 1.18 }[S.car] || 1, rival = makeBody('sport', 0x6b4a8a); /* Jokin aprieta más cuanto mejor coche llevas */ G.scene.add(rival); const R = { k: 0, s: 0, v: 0, x: c.x + Math.cos(c.yaw) * 3, z: c.z - Math.sin(c.yaw) * 3, yaw: c.yaw, cp: 0 }; R.y = standY(R.x, R.z, c.y + .5); rival.position.set(R.x, R.y, R.z); rival.rotation.y = R.yaw;
    Object.assign(M, { title: 'Carrera con Jokin', t: null, cd: 3.2, cp: 0, text: () => M.cd > 0 ? 'Preparados…' : 'Control ' + (M.cp + 1) + ' de ' + cps.length + ' · Jokin va por el ' + Math.min(cps.length, R.cp + 1), clean: () => { G.scene.remove(rival); G.lock = false; },
      tick(dt) {
        if (M.cd > 0) { const b = Math.ceil(M.cd); M.cd -= dt; G.lock = M.cd > 0; if (Math.ceil(M.cd) !== b) { sfx(M.cd > 0 ? 'tick' : 'horn'); if (M.cd <= 0) banner('¡Ya!', 'Sigue el GPS', 1200); } return; }
        // Jokin sigue la ruta: rápido en recta, frena en las curvas
        if (R.k < path.length - 1) { const a = path[R.k], b = path[R.k + 1], dx = GR.x[b] - GR.x[a], dz = GR.z[b] - GR.z[a], l = Math.hypot(dx, dz) || 1; let ed = -1; for (const q of GR.adj[a]) if (q.to === b) ed = q.e; const rd = ed >= 0 ? GR.roads[GR.er[ed]] : null, sp = rd ? ROAD[rd.t][1] : 10, off = ed >= 0 ? laneOffset(ed, a) : 0; let want = Math.min(27, sp * 1.75) * pace * (rd && rd.w < 4.5 ? .75 : 1); if (R.k + 2 < path.length) { const n2 = path[R.k + 2], ex = GR.x[n2] - GR.x[b], ez = GR.z[n2] - GR.z[b], el = Math.hypot(ex, ez) || 1; if ((dx * ex + dz * ez) / (l * el) < .6 && l - R.s < 22) want = 8; }
          R.v = damp(R.v, want, 1.6, dt); R.s += R.v * dt; if (R.s >= l) { R.s -= l; R.k++; if (R.k >= cps[R.cp]) R.cp++; } const t = Math.min(1, R.s / l); R.x = damp(R.x, GR.x[a] + dx * t - dz / l * off, 6, dt); R.z = damp(R.z, GR.z[a] + dz * t + dx / l * off, 6, dt); R.yaw = dampAng(R.yaw, Math.atan2(dx, dz), 5, dt); { const s1 = Math.sin(R.yaw), c1 = Math.cos(R.yaw), hF = standY(R.x + s1 * 1.4, R.z + c1 * 1.4, R.y + .5), hB = standY(R.x - s1 * 1.4, R.z - c1 * 1.4, R.y + .5); R.y = damp(R.y, (hF + hB) / 2, 14, dt); R.pt = damp(R.pt || 0, -Math.atan((hF - hB) / 2.8), 8, dt); rival.position.set(R.x, R.y, R.z); rival.rotation.set(R.pt, R.yaw, 0, 'YXZ'); } if (Math.abs(R.y - c.y) < 2.4) c.bump(R.x, R.z, 1.1); }
        if (R.cp >= cps.length) { endMission(false, 'Jokin ha llegado antes. Adiós a los 50 €.'); return; }
        const n = path[cps[M.cp]]; if (dist(GR.x[n], GR.z[n]) < 13) { M.cp++; sfx('coin'); if (M.cp >= cps.length) { endMission(true, 'Le has ganado a Jokin. Hasta él te respeta.', 150); return; } const q = path[cps[M.cp]]; goal({ x: GR.x[q], z: GR.z[q] }, 'Control ' + (M.cp + 1), '🏁'); toast('Siguiente control: ' + names[M.cp] + '.', '🏁'); } } });
    const q = path[cps[0]]; goal({ x: GR.x[q], z: GR.z[q] }, 'Control 1', '🏁'); M.len = Math.round(best.l); M.legs = best.lg; banner('Carrera con Jokin', 'Circuito de ' + (best.l / 1000).toFixed(1).replace('.', ',') + ' km. Primer control: ' + names[0] + '.'); 
  },
  // un vecino del bar necesita que le acerquen a su calle
  taxi() {
    const c = G.car, bar = SP.by.bar; if (!c || !bar) return false; const q = streetPoint(bar.x, bar.z, 450, 1500); if (!q) return false; const d = routeLen(c.x, c.z, q.x, q.z), who = ['Luisillo', 'un primo de Sádaba', 'la cuadrilla de Jokin', 'un vecino'][Math.floor(Math.random() * 4)];
    if (G.mode !== 'car') G.enterCar(true);
    Object.assign(M, { title: 'Favor: acercar a ' + who, t: d / 7 + 40, text: () => q.n + ' · ' + Math.round(dist(q.x, q.z)) + ' m',
      tick() { if (dist(q.x, q.z) < 11 && G.mode === 'car' && slow()) endMission(true, 'Le has dejado en ' + q.n + '. «Te debo una.»', 14 + Math.round(d / 55)); }, timeout() { endMission(false, 'Se ha cansado de esperar y ha seguido andando.'); } });
    goal({ x: q.x, z: q.z }, q.n, '🙋'); banner('Favor', 'Lleva a ' + who + ' a ' + q.n + '.'); sfx('ok');
  },
  // Lourdes quiere pan del día: se compra en una panadería del mapa
  pan() {
    const lou = SP.by.lourdes; if (!lou) return false; const B = ST.pois.filter(p => p.c === 'bakery' && Math.hypot(p.x - lou.x, p.z - lou.z) > 150); if (!B.length) return false; B.sort((a, b) => Math.hypot(a.x - lou.x, a.z - lou.z) - Math.hypot(b.x - lou.x, b.z - lou.z)); const bk = B[Math.floor(Math.random() * Math.min(4, B.length))]; G.S.daily.pan = 1;
    Object.assign(M, { title: 'El pan de Lourdes', t: 200 + routeLen(lou.x, lou.z, bk.x, bk.z) / 3, st: 0, text: () => (M.st ? 'Lleva el pan a Lourdes' : 'Compra una barra en ' + bk.n + (streetAt(bk.x, bk.z) ? ' (' + streetAt(bk.x, bk.z) + ')' : '')) + ' · ' + Math.round(dist(M.goal.x, M.goal.z)) + ' m',
      tick() { if (dist(M.goal.x, M.goal.z) < (G.mode === 'car' ? M.goal.r : 3) && slow()) { if (!M.st) { if (G.S.money < 1) { endMission(false, 'No te llega ni para una barra.'); return; } money(-1, 'una barra de pan'); M.st = 1; goal({ x: lou.x, z: lou.z, r: farOf(lou, 9) }, 'Casa de Lourdes', '🍳'); } else endMission(true, '«Aún está caliente. Toma, para ti la punta.»', 16); } } });
    goal({ x: bk.x, z: bk.z, r: farOf(bk, 9) }, bk.n, '🥖'); banner('El pan de Lourdes', 'Una barra en ' + bk.n + ', y de vuelta.'); sfx('ok');
  },
  // el del tirón: sale corriendo con tu dinero
  ladron() {
    const S = G.S, all = M.all, amt = all ? Math.floor(S.money) : Math.min(60, Math.round(S.money * .25)), th = npc('raver2'); let n = nearestNode(G.px, G.pz, false), prev = -1; if (n < 0) return false; if (all) { P.x = G.px; P.z = G.pz; }
    S.money -= amt; const T = { x: P.x + Math.sin(P.yaw) * 2, z: P.z + Math.cos(P.yaw) * 2, yaw: P.yaw }; T.y = standY(T.x, T.z, P.y + .7); th.root.position.set(T.x, T.y, T.z); G.scene.add(th.root); th.play('walk', { walkRate: 13 });
    Object.assign(M, { title: all ? '¡Te han robado!' : '¡Al ladrón!', t: all ? 80 : 70, text: () => 'Se lleva ' + eur(amt) + ' · ' + Math.round(dist(T.x, T.z)) + ' m', clean: () => G.scene.remove(th.root),
      tick(dt) { const tx = GR.x[n], tz = GR.z[n], dx = tx - T.x, dz = tz - T.z, l = Math.hypot(dx, dz);
        if (l < 1.2) { let best = -1, bd = -1; for (const a of GR.adj[n]) { if (a.to === prev || a.out || GR.roads[GR.er[a.e]].u) continue; const d = Math.hypot(GR.x[a.to] - P.x, GR.z[a.to] - P.z) + Math.random() * 30; if (d > bd) { bd = d; best = a.to; } } prev = n; n = best >= 0 ? best : prev; }
        else { const sp = 5.9; T.x += dx / l * sp * dt; T.z += dz / l * sp * dt; T.yaw = dampAng(T.yaw, Math.atan2(dx, dz), 10, dt); }
        T.y = standY(T.x, T.z, T.y + .7); th.root.position.set(T.x, T.y, T.z); th.root.rotation.y = T.yaw; th.update(dt); G.blips = [{ x: T.x, z: T.z, icon: '🏃', col: '#e0483c' }];
        if (dist(T.x, T.z) < (G.mode === 'car' ? 3.2 : 1.7)) { G.S.money += amt; endMission(true, 'Le has pillado. Devuelve la cartera y algo más.', 30); } },
      timeout() { endMission(false, all ? 'Mientras dabas vueltas buscando sitio, se han llevado la cartera, el móvil y hasta las Ruffles: ' + eur(amt) + '.' : 'Se ha escapado con ' + eur(amt) + '.'); } });
    if (all) { moment('robo'); banner('¡Te roban!', 'Un chorizo te abre la puerta en un stop y sale corriendo con todo. ¡A por él!', 3600); sfx('bad'); }
    banner('¡Te han dado el tirón!', 'Corre detrás de él.', 2200); sfx('bad');
  }
  ,
  // ---------- sucesos del Tycoon que hay que vivir en persona
  robo() { M.all = 1; return START.ladron(); },
  // viernes, sábado y domingo: cena con los colegas
  cenita() {
    const S = G.S, L = [SP.by.kebab, SP.by.bar].filter(Boolean).map(s => ({ x: s.x, z: s.z, n: s.n, r: 3.6 }));
    ST.pois.forEach(p => { if ((p.c === 'rest' || p.c === 'fast') && Math.hypot(p.x - G.px, p.z - G.pz) < 900) L.push({ x: p.x, z: p.z, n: p.n, r: 4.5 }); });
    const v = L[Math.floor(Math.random() * L.length)]; if (!v) return false; const lim = Math.max(180, (22.6 * 60 - S.min) / RATE, 80 + dist(v.x, v.z) * 1.5 / 4.2);      /* da tiempo a ir a por el coche y cruzar el pueblo */
    Object.assign(M, { title: 'Cenita', t: lim, text: () => 'Los colegas han quedado en ' + v.n + ' · ' + Math.round(dist(v.x, v.z)) + ' m',
      tick() { if (dist(v.x, v.z) < (G.mode === 'car' ? 10 : v.r) && slow()) { const c = Math.min(S.money, 12); if (c) money(-c, 'tu parte de la cena'); pass(70); feed(100, 0); S.energy = 100; addBuff('barriga', 'Barriga llena', '🍝', 'regen', 1.5, 12); moment('cenita'); endMission(true, c < 12 ? 'Cena con los colegas. Te han tenido que invitar.' : 'Cena con los colegas. Energía a tope.'); } },
      timeout() { S.energy *= .5; endMission(false, 'Han cenado sin ti. Sin cenar: energía a la mitad.'); } });
    goal(v, v.n, '🍝'); banner('🍝 Cenita', 'Han quedado en ' + v.n + '. No tardes.', 4200); sfx('ok');
  },
  // martes y jueves: Lourdes ha hecho tortilla porque sí
  tortillaS() {
    const S = G.S, l = SP.by.lourdes; if (!l) return false;
    Object.assign(M, { title: 'Tortilla sorpresa', t: Math.max(150, (22.3 * 60 - S.min) / RATE), text: () => 'Lourdes te espera con la tortilla · ' + Math.round(dist(l.x, l.z)) + ' m',
      tick() { if (dist(l.x, l.z) < (G.mode === 'car' ? farOf(l, 9) : 3.4) && slow()) { pass(40); feed(100, 0); S.energy = 100; addBuff('tortilla', 'Tortilla sorpresa', '🍳', 'all', 1.3, 12); moment('tortilla'); endMission(true, '«No sé qué lleva. Es parte de la sorpresa.» Energía a tope.'); } },
      timeout() { endMission(false, 'La tortilla se ha quedado fría. Lourdes, también.'); } });
    goal({ x: l.x, z: l.z, r: farOf(l, 9) }, 'Casa de Lourdes', '🍳'); banner('🍳 Tortilla sorpresa', '«Pásate, que he hecho tortilla.» Lourdes no avisa dos veces.', 4200); sfx('ok');
  },
  // la patrulla patinete: una tarde a la semana, al salir del taller
  patru() {
    const S = G.S, hm0 = SP.by.home || { x: G.px, z: G.pz }; let a = nearestNode(hm0.x, hm0.z, false); if (a < 0) return false;
    // punto de encuentro a unos minutos andando de casa (da tiempo a volver del taller y aparcar), y una vuelta de cinco controles por calles y caminos
    const far = (n0, d0, d1) => { for (let k = 0; k < 40; k++) { const ang = Math.random() * 6.283, d = d0 + Math.random() * (d1 - d0), x = GR.x[n0] + Math.cos(ang) * d, z = GR.z[n0] + Math.sin(ang) * d, n = nearestNode(x, z, false); if (n < 0 || n === n0) continue; const b = W.map.bbox; if (GR.x[n] < b[0] + 30 || GR.x[n] > b[2] - 30 || GR.z[n] < b[1] + 30 || GR.z[n] > b[3] - 30) continue; const p = route(n0, n, true); if (p && p.length > 1 && plen(p) < d * 1.8 + 60) return [n, p]; /* sin rodeos: si para llegar hay que dar la vuelta a medio pueblo, se busca otro punto */ } return null; };
    const meet = far(a, 120, 320); if (!meet) return false; let cur = meet[0]; const path = [cur], cps = [];
    for (let k = 0; k < 5; k++) { const q = far(cur, 110, 230); if (!q) break; q[1].slice(1).forEach(n => path.push(n)); cur = q[0]; cps.push(path.length - 1); } if (cps.length < 2) return false;
    // patinetes que se ven: tabla ancha con raya de color, ruedas gordas, mástil claro y manillar ancho. Cada uno, de un color
    const mk = (col, host) => { const v = new Vox(); v.bx(-.17, .1, -.56, .17, .19, .56, 0x23262b); v.bx(-.17, .19, -.56, .17, .21, .56, col); v.bx(-.055, .1, .46, .055, 1.12, .57, 0xd5d9df); v.bx(-.36, 1.07, .45, .36, 1.16, .58, col); v.bx(-.42, 1.05, .44, -.33, 1.18, .59, 0x15171a); v.bx(.33, 1.05, .44, .42, 1.18, .59, 0x15171a); v.bx(-.08, 0, .4, .08, .26, .66, 0x101113); v.bx(-.08, 0, -.66, .08, .26, -.4, 0x101113); v.bx(-.1, .08, .47, .1, .18, .59, col); v.bx(-.1, .08, -.59, .1, .18, -.47, col); const m = v.mesh('lit', 1), k = 1 / ((host && host.root.scale.x) || 1); m.scale.setScalar(k); m.position.y = -.16 * k; return m; };      /* el muñeco va a su escala: el patinete se agranda lo mismo para medir lo que tiene que medir */
    // la cuadrilla: cada uno a su ritmo (el Rayo tira, el del medio va a lo suyo y el último se descuelga), y cada uno por su lado de la calle
    const cum = [0]; for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(GR.x[path[k]] - GR.x[path[k - 1]], GR.z[path[k]] - GR.z[path[k - 1]]));
    const crew = [['raver', 0x3ce6d2, 7.5, .9, 'el Rayo'], ['raver2', 0xff7a3c, 6.7, -.8, 'la Txispa'], ['curro', 0xc8dc4a, 5.9, .1, 'el Lento']].map((q, i) => { const e = npc(q[0]), sc = mk(q[1], e); e.root.add(sc); e.play('idle'); const x0 = GR.x[meet[0]] + 1.4 + i * 1.2, z0 = GR.z[meet[0]] + 1.2 - i * 1.1; e.root.position.set(x0, standY(x0, z0) + .16, z0); G.scene.add(e.root); return { e, k: 0, s: -2 - i * 1.5, v: 0, v0: q[2], off: q[3], n: q[4], x: x0, z: z0, yaw: 0, y: 0, ph: i * 2.1, done: 0 }; });
    let st = 0, cp = 0, mine = null, pos = 0, draft = 0, T0 = 0, myP = 0;
    const prog = c => cum[Math.min(c.k, path.length - 1)] + Math.max(0, c.s), place = at => 1 + crew.filter(c => prog(c) >= at).length, ord = n => n + 'º';
    Object.assign(M, { title: 'Patrullazo', t: null, text: () => st ? 'Vas ' + ord(1 + crew.filter(c => prog(c) > myP).length) + ' de 4 · control ' + (cp + 1) + ' de ' + cps.length + (draft > 0 ? ' · a rebufo' : '') : 'La patrulla sale a las 20:00 · ' + Math.round(dist(GR.x[meet[0]], GR.z[meet[0]])) + ' m · llega a pie · faltan ' + Math.max(0, Math.ceil(1200 - S.min)) + ' min',
      clean: () => { crew.forEach(c => G.scene.remove(c.e.root)); if (mine) P.ethan.root.remove(mine); P.scoot = false; P.scootV = 0; },
      tick(dt) {
        if (!st) { if (S.min >= 1200 + 6) { endMission(false, 'La patrulla se ha ido sin ti. A las ocho en punto, ni un minuto más.'); return; }
          if (G.mode === 'foot' && dist(GR.x[meet[0]], GR.z[meet[0]]) < 4.5) { st = 1; M.t = 70 + cum[cum.length - 1] / 4.2; P.scoot = true; P.scootV = 7; mine = mk(0x2f7fe0, P.ethan); P.ethan.root.add(mine); toast('Te dejan un patinete. Es una carrera: cinco controles. Pégate detrás de uno y coge rebufo.', '🛴'); sfx('ok'); const n = path[cps[0]]; goal({ x: GR.x[n], z: GR.z[n] }, 'Control 1', '🛴'); } crew.forEach(c => c.e.update(dt)); return; }
        T0 += dt; const nx0 = path[cps[cp]], myAt = Math.max(cp > 0 ? cum[cps[cp - 1]] : 0, cum[cps[cp]] - dist(GR.x[nx0], GR.z[nx0]) * 1.15); let near = 1e9; myP = myAt;      /* por dónde vas tú, medido sobre el recorrido */
        crew.forEach(c => { if (c.k >= path.length - 1) { c.e.update(dt); return; } const A = path[c.k], B = path[c.k + 1], dx = GR.x[B] - GR.x[A], dz = GR.z[B] - GR.z[A], l = Math.hypot(dx, dz) || 1, lead = prog(c) - myAt, gap = Math.hypot(c.x - P.x, c.z - P.z);
          // cada uno a lo suyo, con sus acelerones; si te saca más de un control, afloja, y si lo dejas atrás, aprieta
          const want = c.v0 * (1 + .1 * Math.sin(T0 * .7 + c.ph)) * (lead > 140 ? .6 : lead > 80 ? .82 : lead < -40 ? 1.12 : 1) * (T0 < 1.2 + c.ph * .4 ? .3 : 1); c.v = damp(c.v, want, 2.2, dt); c.s += c.v * dt; if (c.s >= l) { c.s -= l; c.k++; if (c.k >= path.length - 1 && !c.done) { c.done = 1; toast(c.n + ' ya ha llegado.', '🏁'); } }
          const t = Math.max(0, Math.min(1, c.s / l)), tx = GR.x[A] + dx * t - dz / l * c.off, tz = GR.z[A] + dz * t + dx / l * c.off; c.x = damp(c.x, tx, 6, dt); c.z = damp(c.z, tz, 6, dt); c.yaw = dampAng(c.yaw, Math.atan2(dx, dz), 6, dt); c.y = standY(c.x, c.z, c.y + .7); c.e.root.position.set(c.x, c.y + .16, c.z); c.e.root.rotation.y = c.yaw; c.e.update(dt);
          // rebufo: justo detrás de uno (a menos de 7 m y en su estela)
          const bx = P.x - c.x, bz = P.z - c.z, back = -(bx * Math.sin(c.yaw) + bz * Math.cos(c.yaw)), side = Math.abs(bx * Math.cos(c.yaw) - bz * Math.sin(c.yaw)); if (back > .8 && back < 7 && side < 1.6 && gap < near) near = gap; });
        draft = near < 1e8 ? Math.min(1.5, draft + dt * 2) : Math.max(0, draft - dt * 1.5); P.scootV = 7 + (draft > 0 ? 1.5 : 0);
        const n = path[cps[cp]]; if (dist(GR.x[n], GR.z[n]) < 7) { pos = place(cum[cps[cp]]); cp++; sfx('coin'); if (cp >= cps.length) { const X = [1.7, 1.5, 1.35, 1.2][pos - 1] || 1.2; cash([330, 260, 200, 140][pos - 1] || 140, 'patrullazo'); addBuff('patinete', 'Subidón de patinete', '🛴', 'work', X, 8); moment('patru'); endMission(true, pos === 1 ? 'Primero. Ni el Rayo. 25 km/h, cuesta abajo y con viento a favor.' : 'Llegas ' + ord(pos) + ' de 4.' + (pos === 4 ? ' Alguien tenía que cerrar la patrulla.' : ' La próxima, a rebufo hasta el final.')); return; } toast('Control ' + cp + ': vas ' + ord(pos) + '.', '🛴'); const q = path[cps[cp]]; goal({ x: GR.x[q], z: GR.z[q] }, 'Control ' + (cp + 1), '🛴'); } },
      timeout() { endMission(false, 'La patrulla ha terminado sin ti.'); } });
    goal({ x: GR.x[meet[0]], z: GR.z[meet[0]] }, 'La patrulla patinete', '🛴'); banner('🛴 Patrullazo', 'La patrulla patinete sale a las 20:00 cerca de casa. Aparca y acércate andando.', 4400); sfx('ok');
  },
  // ojito con Jokin: si te pilla por banda, nadie sale bien de eso
  jokin() {
    const S = G.S, ne = nearestEdge(G.px, G.pz, true, 200, 1); if (ne.e < 0) return false;
    // sale de una calle cercana desde la que de verdad pueda llegar a tiempo: ni encima, ni con medio pueblo de rodeo por las direcciones prohibidas
    let st = -1, alt = -1; for (let k = 0; k < 14 && st < 0; k++) { const n = nearestNode(G.px + (Math.random() - .5) * 260, G.pz + (Math.random() - .5) * 260, true); if (n < 0) continue; if (alt < 0) alt = n; const d = Math.hypot(GR.x[n] - G.px, GR.z[n] - G.pz); if (d < 70 || d > 190) continue; const r = routeTo(GR.x[n], GR.z[n], G.px, G.pz, false), L = r ? plen(r.nodes) : 1e9; if (L > 90 && L < 400) st = n; }
    if (st < 0) st = alt; if (st < 0) return false;
    const body = makeBody('sport', 0x6b4a8a), J = { x: GR.x[st], z: GR.z[st], yaw: 0, y: standY(GR.x[st], GR.z[st]), v: 0, path: null, k: 0, rt: 0, pt: 0 }; G.scene.add(body);
    Object.assign(M, { title: 'Ojito con Jokin', t: 45, text: () => 'Que no te pille · Jokin a ' + Math.round(dist(J.x, J.z)) + ' m', clean: () => G.scene.remove(body),
      tick(dt) {
        if ((J.rt -= dt) < 0) { J.rt = 1.2; const r = routeTo(J.x, J.z, G.px, G.pz, false); J.path = r ? r.nodes : null; J.k = 0; J.len = r ? plen(r.nodes) : dist(J.x, J.z); if (J.path && J.path.length > 1) { const a = J.path[0], b = J.path[1]; if (Math.hypot(GR.x[b] - J.x, GR.z[b] - J.z) < Math.hypot(GR.x[b] - GR.x[a], GR.z[b] - GR.z[a]) + 2) J.k = 1; } if (dist(J.x, J.z) < 30) J.path = null; /* ya va por ese tramo: no vuelve al nudo de atrás; de cerca, va derecho */
          if (J.path && J.k < J.path.length) { const P0 = J.path.slice(J.k), n0 = P0[0], n1 = P0[P0.length - 1]; J.len = Math.hypot(GR.x[n0] - J.x, GR.z[n0] - J.z) + plen(P0) + dist(GR.x[n1], GR.z[n1]); } else J.len = dist(J.x, J.z); }      /* lo que le queda de verdad: hasta el primer nudo, la ruta y del último nudo a ti */
        let tx = G.px, tz = G.pz; if (J.path && J.k < J.path.length) { const n = J.path[J.k]; tx = GR.x[n]; tz = GR.z[n]; if (Math.hypot(tx - J.x, tz - J.z) < 5) { J.k++; } }
        const dx = tx - J.x, dz = tz - J.z, l = Math.hypot(dx, dz) || 1, want = Math.max(G.mode === 'car' ? 9.4 : 5.5, Math.min(G.mode === 'car' ? 11.5 : 13, (J.len || 0) / Math.max(3, M.t - 13)));      /* en coche se le deja atrás callejeando; a pie hay que correr. Si te quedas quieto, llega */ J.v = damp(J.v, want, 1.4, dt); J.x += dx / l * J.v * dt; J.z += dz / l * J.v * dt; J.yaw = dampAng(J.yaw, Math.atan2(dx, dz), 5, dt);
        const s1 = Math.sin(J.yaw), c1 = Math.cos(J.yaw), hF = standY(J.x + s1 * 1.4, J.z + c1 * 1.4, J.y + .5), hB = standY(J.x - s1 * 1.4, J.z - c1 * 1.4, J.y + .5); J.y = damp(J.y, (hF + hB) / 2, 14, dt); J.pt = damp(J.pt, -Math.atan((hF - hB) / 2.8), 8, dt); body.position.set(J.x, J.y, J.z); body.rotation.set(J.pt, J.yaw, 0, 'YXZ'); G.blips = [{ x: J.x, z: J.z, icon: '😈', col: '#6b4a8a' }];
        if (dist(J.x, J.z) < (G.mode === 'car' ? 4.4 : 2.6) && Math.abs(J.y - (G.py || 0)) < 3) { const lost = Math.round(S.money * .1); if (lost) money(-lost, 'la liada de Jokin'); addBuff('polvo', 'Hecho polvo', '🍌', 'regen', .5, 24); moment('jokin'); endMission(false, 'Jokin te pilla por banda y te lía para cargarle el coche de ladrillos. Acabas molido y con la cartera más ligera.'); } },
      timeout() { cash(60, 'te libras de Jokin'); moment('jokin'); endMission(true, 'Te libras de Jokin. Por hoy.'); } });
    G.blips = [{ x: J.x, z: J.z, icon: '😈', col: '#6b4a8a' }]; banner('😈 Ojito con Jokin', 'Jokin te ha visto y viene a por ti. Aguanta 45 segundos sin que te alcance.', 4400); sfx('horn');
  },
  // sábado noche: rave en el Horno Alto. Minijuego de ritmo, a casa a las 02:30 y resaca
  rave() {
    const S = G.S, mk = (W.map.marks || []).find(m => m.k === 'furnace') || (W.map.marks || [])[0]; if (!mk) return false; S.daily.night = 1;
    Object.assign(M, { title: 'Rave en Altos Hornos', t: Math.max(170, (23.8 * 60 - S.min) / RATE), text: () => 'Hay rave en el Horno Alto · ' + Math.round(dist(mk.x, mk.z)) + ' m',
      tick() { if (dist(mk.x, mk.z) < (mk.r || 20) + 26 && slow()) { const m = M; M.t = null; M.tick = () => { }; if (G.mode === 'car') G.leaveCar(true);
        workBlock(0, 'Rave', q => { const x = Math.round((1 + 2 * q) * 10) / 10; addBuff('rave', 'Subidón de la rave', '🎧', 'all', x, 12); moment('rave'); if (G.mission === m) endMission(true, 'Rave hasta las tantas. Subidón ×' + String(x).replace('.', ',') + '. Mañana, resaca.'); carHome(); goSleep({ bed: 150, wake: 630, id: 'resaca', n: 'Resaca de la rave', ic: '🥴', x: .6 }); }, { title: '¡Dale al ritmo!', word: 'tema', steps: 10, speed: 1.15, hit: '¡Temazo!', miss: 'Fuera de compás' }); } },
      timeout() { endMission(false, 'La rave ha acabado sin ti. Mejor: mañana no hay resaca.'); } });
    goal({ x: mk.x, z: mk.z }, 'Horno Alto', '🎧'); banner('🎧 Rave en Altos Hornos', 'Esta noche hay rave en el Horno Alto. Si vas, te acuestas a las tantas.', 4400); sfx('ok');
  },
  // domingo a mediodía: llega el primo
  primo() {
    const S = G.S, h = SP.by.home, bar = SP.by.bar; if (!h || !bar) return false; let st = 0;
    Object.assign(M, { title: 'Visita del primo', t: Math.max(200, 80 / RATE), text: () => st ? 'Lleva al primo al Ekintza · ' + Math.round(dist(bar.x, bar.z)) + ' m' : 'El primo te espera en el portal de casa · ' + Math.round(dist(h.x, h.z)) + ' m',
      tick() { if (!st) { if (dist(h.x, h.z) < (G.mode === 'car' ? farOf(h, 9) : 4) && slow()) { st = 1; M.t = 240; toast('«Con este carnet no pago en el Ekintza.» No es verdad: pagas tú.', '🪪'); goal({ x: bar.x, z: bar.z, r: farOf(bar, 9) }, 'Bar Ekintza', '🍺'); } return; }
        if (dist(bar.x, bar.z) < (G.mode === 'car' ? farOf(bar, 9) : 3.6) && slow()) { const c = Math.max(3, Math.round(S.money * .02)); money(-Math.min(S.money, c), 'le invitas a todo'); pass(45); feed(25, 5); addBuff('primo', 'Risas con el primo', '🪪', 'all', 1.2, 12); moment('primo'); endMission(true, 'El primo enseña el carnet a todo el bar. Risas aseguradas.'); } },
      timeout() { endMission(false, 'El primo se ha cansado de esperar. Ha dejado el carnet en el buzón.'); } });
    goal({ x: h.x, z: h.z, r: farOf(h, 9) }, 'Casa de Ethan', '🪪'); banner('🪪 Visita del primo', 'Ha llegado el primo, enseñando su carnet a todo el que pasa. Te espera en el portal.', 4400); sfx('ok');
  },
  // viernes y sábado: noche de GTA con los colegas, en casa
  f2f() { return nightIn('f2f', 'Face to face', '🎮', 'Noche de GTA V con Hernández y los colegas. Si entras, hasta las dos y media.', () => { moment('f2f'); goSleep({ bed: 150, wake: 630, id: 'gta', n: 'Cansancio de GTA', ic: '🎮', x: .8 }); }, 'Noche de GTA hasta las dos y media. Mañana no hay quien le levante.', 'Han jugado sin ti. Dicen que has ganado igual.'); },
  // sábado con la casa sola: fiestón
  fiesta() { return nightIn('fiesta', 'Fiestón con la casa sola', '🎉', 'Con los aitas en el pueblo, la casa es tuya. Los colegas ya están subiendo.', () => { addBuff('moral', 'Moral por las nubes', '😏', 'work', 2, 12); moment('fiesta'); goSleep({ bed: 180, wake: 660, id: 'fieston', n: 'Resaca del fiestón', ic: '🎉', x: .8 }); }, 'Fiestón en casa. La moral, por las nubes.', 'Los colegas se han ido al Ekintza. Otra vez será.'); }
};
G.startMission = startMission; G.endMission = endMission;
