// peds.js: vecinos paseando por las aceras. No se les puede atropellar: se apartan y protestan.
import { Ethan } from './ethan.js';
import { GR, nearestEdge } from './graph.js';
import { ROAD, roadW, collide, roadY } from './world.js';
import { dampAng, G } from './state.js';
import { T } from './terrain.js';

export const PED = { list: [], max: 6, t: 0, sayT: 0 };
const TEES = [0xd0322e, 0x2a5bb8, 0xf2efe6, 0x3a8a5c, 0xe0b23a, 0x6b4a8a, 0xc85a8a, 0x26262c, 0xff8a3c, 0x7fb2d4], LEGS = [0x26262c, 0x34425e, 0x4a4f58, 0x5a4634, 0x2c3a4a], HAIR = [0x1c1a18, 0x5a3a22, 0x8a8a8a, 0xc8922a, 0x3a2a20], SKIN = [[0xf0c8a4, 0xdcae88], [0xd8a47c, 0xc08a62], [0xb9855c, 0x9c6c46], [0x8a5a3a, 0x744a2e]];
const SAY = ['«¡Mira por dónde vas!»', '«¡Que esto es zona 30!»', '«¿Te han regalado el carnet?»', '«¡Se lo digo a tu madre!»', '«¡Animal!»', '«Luego dicen de los patinetes.»'];
export function initPeds(scene, n) {
  for (let i = 0; i < n; i++) { const pick = a => a[Math.floor(Math.random() * a.length)], tee = pick(TEES), sk = pick(SKIN), leg = pick(LEGS), hr = pick(HAIR), mix = (c, f) => { const r = (c >> 16) * f, g = ((c >> 8) & 255) * f, b = (c & 255) * f; return (r << 16) | (g << 8) | b; };
    const e = new Ethan({ npc: true, mood: 3, look: { tee, tee2: mix(tee, .8), sleeve: tee, collar: mix(tee, .7), trim: mix(tee, .7), shorts: leg, shorts2: mix(leg, 1.25), stripe: leg, hair: hr, hair2: mix(hr, 1.3), skin: sk[0], skin2: sk[1] }, hair: pick(['short', 'short', 'long', 'bald', 'curly']), whiteTeeth: true, noStache: Math.random() < .6, scale: .92 + Math.random() * .12 });
    e.root.visible = false; e.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(e.root); PED.list.push({ e, on: false, x: 0, z: 0, yaw: 0, a: 0, b: 0, e2: -1, s: 0, side: 1, v: 1.3, dodge: 0, rate: 7 + Math.random() * 2 }); }
}
function place(p, o) { const ax = GR.x[p.a], az = GR.z[p.a], dx = GR.x[p.b] - ax, dz = GR.z[p.b] - az, l = GR.el[p.e2] || 1, ux = dx / l, uz = dz / l, r = GR.roads[GR.er[p.e2]], off = (ROAD[r.t][3] ? roadW(r) / 2 + (r.sw ? .8 : .4) : 0) * p.side; o.x = ax + ux * p.s - uz * off; o.z = az + uz * p.s + ux * off; o.ux = ux; o.uz = uz; }
const _o = {};
function spawn(p, px, pz) {
  const a = Math.random() * 6.283, r = 45 + Math.random() * 45, ne = nearestEdge(px + Math.cos(a) * r, pz + Math.sin(a) * r, false, 50); if (ne.e < 0) return; const rd = ne.road, sp = ROAD[rd.t]; if (!sp || (sp[3] && !rd.sw) || rd.u) return;
  const fwd = Math.random() < .5; p.e2 = ne.e; p.a = fwd ? GR.ea[ne.e] : GR.eb[ne.e]; p.b = fwd ? GR.eb[ne.e] : GR.ea[ne.e]; p.s = (fwd ? ne.t : 1 - ne.t) * GR.el[ne.e]; p.side = Math.random() < .5 ? 1 : -1; place(p, _o);
  // nunca aparece delante de la cámara a media distancia (se le vería salir de la nada): o detrás, o lejos
  { const dx = _o.x - px, dz = _o.z - pz, dd = Math.hypot(dx, dz) || 1, cy = G.cam ? G.cam.yaw : 0, front = (-Math.sin(cy) * dx - Math.cos(cy) * dz) / dd; if (dd < 38 || (front > .3 && dd < 78) || collide(_o.x, _o.z, .4, true).hit) return; } p.x = _o.x; p.z = _o.z; p.yaw = Math.atan2(_o.ux, _o.uz); p.v = 1.1 + Math.random() * .5; p.on = true; p.y = undefined; p.dodge = 0; p.e.root.visible = true; p.e.play('walk', { walkRate: p.rate });
}
// car: el coche de Ethan si va conduciendo (o null). Devuelve una frase si alguien se ha tenido que apartar.
export function updatePeds(dt, px, pz, car, foot) {
  let said = null; PED.sayT -= dt;
  for (const p of PED.list) {
    if (!p.on) continue; const d = Math.hypot(p.x - px, p.z - pz); if (d > 125) { p.on = false; p.e.root.visible = false; continue; }
    if (p.dodge > 0) { p.dodge -= dt; if (p.dodge <= 0) p.e.play('walk', { walkRate: p.rate }); }
    else { p.s += p.v * dt; const len = GR.el[p.e2];
      if (p.s >= len) { const A = GR.adj[p.b]; let opts = A.filter(o => { const rr = GR.roads[GR.er[o.e]], s2 = ROAD[rr.t]; return o.to !== p.a && !o.out && s2 && (rr.sw || !s2[3]) && !rr.u; }); if (!opts.length) opts = A.filter(o => o.to === p.a); if (!opts.length) { p.on = false; p.e.root.visible = false; continue; } const o = opts[Math.floor(Math.random() * opts.length)]; p.a = p.b; p.b = o.to; p.e2 = o.e; p.s = 0; place(p, _o); const d1 = Math.hypot(_o.x - p.x, _o.z - p.z); p.side = -p.side; place(p, _o); if (Math.hypot(_o.x - p.x, _o.z - p.z) > d1) p.side = -p.side; }
      place(p, _o); const ex = _o.x - p.x, ez = _o.z - p.z, ed = Math.hypot(ex, ez);
      if (ed > 14) { p.on = false; p.e.root.visible = false; continue; }      /* se ha quedado descolgado de su acera: mejor que desaparezca lejos a que cruce volando */
      if (ed > .9) { p.s -= p.v * dt * .85; const st = Math.min(ed, p.v * 1.5 * dt); p.x += ex / ed * st; p.z += ez / ed * st; p.yaw = dampAng(p.yaw, Math.atan2(ex, ez), 7, dt); }      /* va andando hasta su sitio en la acera nueva */
      else { const k = 1 - Math.exp(-5 * dt); p.x += ex * k; p.z += ez * k; p.yaw = dampAng(p.yaw, Math.atan2(_o.ux, _o.uz), 6, dt); } }
    if (car) { const dx = p.x - car.x, dz = p.z - car.z, dd = Math.hypot(dx, dz); if (dd < 3.1 && dd > .01 && Math.abs((p.y || 0) - (car.y || 0)) < 2.4) { const push = (3.1 - dd); p.x += dx / dd * push; p.z += dz / dd * push; if (Math.abs(car.vf) > 2 && p.dodge <= 0) { p.dodge = 1.6; p.e.play('flail'); if (PED.sayT < 0) { PED.sayT = 5; said = SAY[Math.floor(Math.random() * SAY.length)]; } } } }
    else if (foot) { const dx = foot.x - p.x, dz = foot.z - p.z, dd = Math.hypot(dx, dz); if (dd < .75 && dd > .01 && Math.abs((p.y || 0) - (foot.y || 0)) < 2) { foot.x += dx / dd * (.75 - dd); foot.z += dz / dd * (.75 - dd); } }
    if (T.on) { const ty = roadY(GR.roads[GR.er[p.e2]], p.x, p.z); p.y = p.y === undefined || Math.abs(ty - p.y) > 1.5 ? ty : p.y + (ty - p.y) * Math.min(1, 14 * dt); }
    p.e.root.position.set(p.x, p.y || 0, p.z); p.e.root.rotation.y = p.yaw; if (d < 70) p.e.update(dt);
  }
  if ((PED.t -= dt) < 0) { PED.t = .6; const free = PED.list.filter(p => !p.on); if (free.length && PED.list.length - free.length < PED.max) spawn(free[0], px, pz); }
  return said;
}
