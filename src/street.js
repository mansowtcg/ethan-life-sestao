// street.js: lo que hay en la calle. Árboles, farolas, bancos, paradas, señales, semáforos, rótulos de los
// comercios (con los nombres del mapa), bocas de metro, estaciones y los hitos de Sestao.
import * as THREE from 'three';
import { Vox, mat, voxText } from './vox.js';
import { car as carBody } from './props.js';
import { W, ROAD, Geo, instChunks, addProp, collide, inBuilding, inWaterPoly, inPoly, roadNear, bboxOf, canvasTex, nearJunc } from './world.js';
import { rng } from './util.js';
import { GR } from './graph.js';
import { standY, deckY, gY, mY } from './terrain.js';

export const ST = { pois: [], pgrid: new Map(), transit: [], lights: [], stops: [], cars: 0, fost: [] };
const key = (a, b) => a * 100003 + b;
// semáforos: todos van a la vez. 0 verde, 1 ámbar, 2 rojo (para los coches)
export const lightState = t => { const p = t % 36; return p < 23 ? 0 : p < 26 ? 1 : 2; };

export function buildStreet(M, root, q) {
  const r = rng(4242), lit = mat('lit'), far = q === 1 ? .6 : q === 2 ? 1 : 1.5;
  const soft = (x, z, rad, kind, refs) => { const p = addProp(x, z, rad, kind); p.soft = true; p.inst = refs; return p; };
  const clear = (x, z, m) => !inBuilding(x, z) && !inWaterPoly(x, z) && roadNear(x, z, 9, true).d > (m === undefined ? .3 : m) && !inFost(x, z, m || 0);
  fosteritos(M, root, q);

  // ---------- árboles: los del mapa y los de las manchas de bosque
  { const A = [], T = [], put = (x, z) => { (r() < .78 ? A : T).push([x, z, r() * 6.28, 0, .8 + r() * .55]); };
    // ninguno en la calzada, en un cruce, en mitad de un camino ni atravesando el tablero de un puente (el mapa trae algunos así, y las calles ya no miden lo que medían cuando se colocaron)
    let cutT = 0; const okTree = (x, z) => { if (inFost(x, z, 1.2) || roadNear(x, z, 9, true).d < .6 || roadNear(x, z, 9, false).d < .15 || nearJunc(x, z, .8)) return false; const dk = deckY(x, z); return dk < -1e8 || dk - gY(x, z) > 9; };
    for (let k = 0; k < (M.trees || []).length; k += 2) { if (okTree(M.trees[k], M.trees[k + 1])) put(M.trees[k], M.trees[k + 1]); else cutT++; } ST.treesCut = cutT;
    (M.green || []).forEach(a => { if (a.k !== 'wood') return; const b = bboxOf(a.p), n = Math.min(110, Math.floor((b[2] - b[0]) * (b[3] - b[1]) / 150)); for (let i = 0; i < n; i++) { const x = b[0] + r() * (b[2] - b[0]), z = b[1] + r() * (b[3] - b[1]); if (inPoly(a.p, x, z) && !inBuilding(x, z) && roadNear(x, z, 6, false).d > .8) put(x, z); } });
    const tv = new Vox(); tv.box(0, 0, 0, .34, 2.3, .34, 0x6a4a34); tv.box(0, 2.0, 0, 2.5, 1.5, 2.5, 0x4f8a45); tv.box(0, 3.3, 0, 1.8, 1.2, 1.8, 0x5fa052); tv.box(.5, 2.5, .4, 1.5, 1.3, 1.5, 0x437a3c);
    const tt = new Vox(); tt.box(0, 0, 0, .3, 2.6, .3, 0x5c4630); tt.box(0, 2.2, 0, 1.5, 2.2, 1.5, 0x3f7a40); tt.box(0, 4.2, 0, 1.15, 2.0, 1.15, 0x4b8a48); tt.box(0, 6.0, 0, .7, 1.3, .7, 0x58994f);
    instChunks(root, tv.geometry(), lit, A, { shadow: q > 1, far: 330 * far, ground: true }); instChunks(root, tt.geometry(), lit, T, { shadow: q > 1, far: 330 * far, ground: true });
    A.concat(T).forEach(t => addProp(t[0], t[1], .28 * t[4], 'tree')); ST.trees = A.length + T.length; }

  // ---------- huertas (las del mapa): parcelas de tierra con surcos de lechugas, tomateras con sus cañas o recién cavadas, y la chabola de las herramientas
  { const let_ = [], tom = [], sheds = [], drums = [], soil = []; let nH = 0, budget = 3200;
    (M.green || []).forEach((a, ai) => { if (a.k !== 'allot') return; const P = a.p, n = P.length / 2; if (n < 3) return; const b = bboxOf(P), A = (b[2] - b[0]) * (b[3] - b[1]); if (A < 60) return; nH++;
      let best = 0, ux = 1, uz = 0; for (let k = 0; k < n; k++) { const j = (k + 1) % n, dx = P[j * 2] - P[k * 2], dz = P[j * 2 + 1] - P[k * 2 + 1], l = Math.hypot(dx, dz); if (l > best) { best = l; ux = dx / l; uz = dz / l; } }
      const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2, R = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2, at = (u, v) => [cx + ux * u - uz * v, cz + uz * u + ux * v], ok = (x, z) => inPoly(P, x, z) && clear(x, z, .4) && !nearJunc(x, z, 1);
      const rr = rng(ai * 131 + 7), plots = []; for (let v = -R; v <= R; v += 6.4) for (let u = -R; u <= R; u += 8.6) { if ([[0, 0], [-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]].every(q => { const w = at(u + q[0], v + q[1]); return ok(w[0], w[1]); })) plots.push([u, v]); }
      for (let k = plots.length - 1; k > 0; k--) { const j = Math.floor(rr() * (k + 1)), t = plots[k]; plots[k] = plots[j]; plots[j] = t; }
      let mine = Math.min(budget, 340, Math.round(A / 10)), shedDone = A < 150; const yaw = Math.atan2(ux, uz);
      for (const pl of plots) { if (mine <= 0) break; const c = at(pl[0], pl[1]); soil.push([c[0], c[1], yaw, 0, 1]);
        if (!shedDone) { const s2 = at(pl[0] + 5.6, pl[1]); if (ok(s2[0], s2[1])) { sheds.push([s2[0], s2[1], yaw + Math.PI / 2, 0, 1, [0x5f7f5a, 0x51708a, 0x8a7a5a, 0x7a7f84][Math.floor(rr() * 4)]]); addProp(s2[0], s2[1], 1.4, 'deco'); const d2 = at(pl[0] + 5.6, pl[1] + 1.8); if (rr() < .7 && ok(d2[0], d2[1])) drums.push([d2[0], d2[1], rr() * 6.28]); shedDone = true; } }
        const crop = rr(); if (crop < .18) continue; const tomato = crop > .62, dv = tomato ? 1.2 : .9, du = tomato ? .8 : .6;
        for (let v = -2 + dv / 2; v < 2; v += dv) for (let u = -3.1; u <= 3.1; u += du) { const w = at(pl[0] + u, pl[1] + v); (tomato ? tom : let_).push([w[0] + (rr() - .5) * .1, w[1] + (rr() - .5) * .1, rr() * 6.28, 0, .8 + rr() * .4]); mine--; budget--; } } });
    const lv = new Vox(); lv.box(0, 0, 0, .42, .2, .42, 0x7fb04a); lv.box(0, .12, 0, .26, .16, .26, 0x95c45a);
    const tv = new Vox(); tv.box(0, 0, 0, .05, 1.35, .05, 0xb59a6a); tv.box(0, 0, 0, .38, .75, .38, 0x4f8a3c); tv.box(.06, .5, .05, .1, .1, .1, 0xc8402e); tv.box(-.1, .3, -.08, .09, .09, .09, 0xd85a32);
    const sv = new Vox(); sv.box(0, 0, 0, 2.3, 1.9, 1.7, 0xffffff, { top: 0x6a6e74 }); sv.bx(-1.3, 1.9, -1.05, 1.3, 2.05, 1.05, 0x8d9399); sv.box(.5, 0, .86, .7, 1.6, .04, 0x3a3f46);
    const dv = new Vox(); dv.box(0, 0, 0, .55, .85, .55, 0x2f6fb0, { top: 0x23527f });
    const ov = new Vox(); ov.box(0, -.06, 0, 5, .1, 7, 0x6e5a3e, { flat: true }); for (let k = -2; k <= 2; k++) ov.box(k * 1, .03, 0, .32, .05, 6.8, 0x5f4c33, { flat: true });
    instChunks(root, ov.geometry(), lit, soil, { far: 220 * far, ground: true, tilt: true });
    instChunks(root, lv.geometry(), lit, let_, { far: 160 * far, ground: true }); instChunks(root, tv.geometry(), lit, tom, { far: 170 * far, ground: true });
    instChunks(root, sv.geometry(), lit, sheds, { far: 260 * far, shadow: q > 1, ground: true, color: true }); instChunks(root, dv.geometry(), lit, drums, { far: 140 * far, ground: true });
    ST.huertas = { n: nH, plots: soil.length, plants: let_.length + tom.length, sheds: sheds.length }; }

  // ---------- farolas, alternando acera
  { const lamps = []; let total = 0; const ok = rd => { const sp = ROAD[rd.t]; return sp && sp[3] && rd.t !== 'service' && rd.t !== 'track' && rd.t.indexOf('_link') < 0 && !rd.u && !rd.pr; };
    M.roads.forEach(rd => { if (!ok(rd)) return; for (let k = 0; k + 3 < rd.p.length; k += 2) total += Math.hypot(rd.p[k + 2] - rd.p[k], rd.p[k + 3] - rd.p[k + 1]); });
    const gap = Math.max(32, total / (q === 1 ? 800 : 1500));
    M.roads.forEach((rd, ri) => { if (!ok(rd)) return; const off = rd.w / 2 + (rd.sw ? .32 : .9); let acc = 10 + (ri % 5) * 5, side = ri % 2 ? 1 : -1;
      for (let k = 0; k + 3 < rd.p.length; k += 2) { const dx = rd.p[k + 2] - rd.p[k], dz = rd.p[k + 3] - rd.p[k + 1], l = Math.hypot(dx, dz); if (l < .1) continue; const ux = dx / l, uz = dz / l; let s = acc;
        /* giro de la calle en los dos extremos de este tramo */ const tn = kk => { if (kk < 2 || kk + 3 >= rd.p.length) return 0; let d = Math.abs(Math.atan2(rd.p[kk + 2] - rd.p[kk], rd.p[kk + 3] - rd.p[kk + 1]) - Math.atan2(rd.p[kk] - rd.p[kk - 2], rd.p[kk + 1] - rd.p[kk - 1])); if (d > Math.PI) d = 2 * Math.PI - d; return d; }, t0 = tn(k), t1 = tn(k + 2);
        const bad = q => nearJunc(rd.p[k] + ux * q, rd.p[k + 1] + uz * q, 4.5) || (q < 6 && t0 > .4) || (l - q < 6 && t1 > .4);
        while (s < l) { /* en las esquinas de los cruces y en las curvas cerradas estorban al girar: la farola se corre unos metros calle adelante o atrás */ let s2 = s; if (bad(s)) { s2 = -1; for (const d of [7, -7, 13, -13]) { const q = s + d; if (q > 0 && q < l && !bad(q)) { s2 = q; break; } } }
          if (s2 >= 0) { const x = rd.p[k] + ux * s2 - uz * off * side, z = rd.p[k + 1] + uz * s2 + ux * off * side; if (!inBuilding(x, z) && (rd.b || !inWaterPoly(x, z)) && roadNear(x, z, 9, true).d > .2 && !collide(x, z, .3, true).hit && !inFost(x, z, .5)) lamps.push([x, z, Math.atan2(ux * side, uz * side)]); } s += gap; side = -side; } acc = s - l; } });
    const lv = new Vox(); lv.box(0, 0, 0, .16, 5.6, .16, 0x3a3f46); lv.box(0, 0, 0, .3, .5, .3, 0x2c3036); lv.bx(-.08, 5.5, -.08, 1.3, 5.62, .08, 0x3a3f46);
    const hv = new Vox(); hv.bx(.7, 5.36, -.16, 1.36, 5.5, .16, 0xffffff); W.mats.lamp = new THREE.MeshBasicMaterial({ color: 0x555a60 });
    const a = instChunks(root, lv.geometry(), lit, lamps, { far: 300 * far }), b = instChunks(root, hv.geometry(), W.mats.lamp, lamps, { far: 420 * far }); let c = null;
    if (q > 1) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,140,.55)'); gr.addColorStop(1, 'rgba(255,214,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const pg = new THREE.PlaneGeometry(13, 13); pg.rotateX(-Math.PI / 2); W.mats.pool = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      c = instChunks(root, pg, W.mats.pool, lamps.map(t => [t[0] + Math.cos(-t[2]) * 1.0, t[1] + Math.sin(-t[2]) * 1.0, 0, .16]), { far: 170 * far, tag: 'pool', tilt: true }); }
    lamps.forEach((t, i) => soft(t[0], t[1], .16, 'lamp', [a[i], b[i], c && c[i]])); ST.lamps = lamps.length; }

  // ---------- bancos, papeleras y fuentes, donde los tiene el mapa
  { const P = M.props || {}, bench = [], bin = [], font = [];
    for (let k = 0; k < (P.bench || []).length; k += 2) { const x = P.bench[k], z = P.bench[k + 1]; if (!clear(x, z, .5)) continue; const n = roadNear(x, z, 14, false); bench.push([x, z, n.r ? Math.atan2(n.x - x, n.z - z) : r() * 6.28]); }
    for (let k = 0; k < (P.bin || []).length; k += 2) if (clear(P.bin[k], P.bin[k + 1])) bin.push([P.bin[k], P.bin[k + 1], r() * 6.28]);
    for (let k = 0; k < (P.font || []).length; k += 2) if (clear(P.font[k], P.font[k + 1])) font.push([P.font[k], P.font[k + 1], r() * 6.28]);
    const bv = new Vox(); bv.box(0, .38, 0, 1.7, .08, .5, 0x8a5a34); bv.box(0, .46, -.24, 1.7, .5, .07, 0x8a5a34); [-.7, .7].forEach(x => { bv.box(x, 0, 0, .08, .4, .5, 0x3a3f46); bv.box(x, .4, -.24, .08, .55, .08, 0x3a3f46); });
    instChunks(root, bv.geometry(), lit, bench, { far: 130 * far, shadow: q > 2 }); bench.forEach(t => addProp(t[0], t[1], .55, 'deco'));
    const nv = new Vox(); nv.box(0, 0, 0, .08, .95, .08, 0x3a3f46); nv.box(0, .35, .16, .36, .55, .3, 0x4a6a4a, { top: 0x26262c });
    const br = instChunks(root, nv.geometry(), lit, bin, { far: 110 * far }); bin.forEach((t, i) => soft(t[0], t[1], .22, 'sign', [br[i]]));
    const fv = new Vox(); fv.box(0, 0, 0, .34, .95, .34, 0x6a6e74); fv.box(0, .95, 0, .44, .1, .44, 0x55585e); fv.box(0, 1.05, .1, .06, .12, .2, 0x9aa0a8);
    instChunks(root, fv.geometry(), lit, font, { far: 110 * far }); font.forEach(t => addProp(t[0], t[1], .3, 'deco'));
    // columpios en los parques infantiles
    const play = []; (M.green || []).forEach(a => { if (a.k !== 'play') return; const b = bboxOf(a.p), x = (b[0] + b[2]) / 2, z = (b[1] + b[3]) / 2; if ((b[2] - b[0]) * (b[3] - b[1]) > 60 && inPoly(a.p, x, z) && clear(x, z, 1)) play.push([x, z, r() * 6.28]); });
    const pv = new Vox(); [-1.3, 1.3].forEach(x => { pv.box(x, 0, -.5, .1, 2.2, .1, 0xd0322e); pv.box(x, 0, .5, .1, 2.2, .1, 0xd0322e); }); pv.bx(-1.4, 2.15, -.06, 1.4, 2.27, .06, 0xd0322e); [-.55, .55].forEach(x => { pv.box(x, .5, 0, .42, .05, .2, 0x2a5bb8); pv.box(x - .18, .52, 0, .03, 1.65, .03, 0x55585e); pv.box(x + .18, .52, 0, .03, 1.65, .03, 0x55585e); });
    pv.box(3, 0, 0, 1.1, 1.5, 1.1, 0xe0b23a); pv.bx(3.5, .1, -.3, 5.3, .22, .3, 0x3a8a5c); pv.bx(3.5, .8, -.3, 4.4, .92, .3, 0x3a8a5c); pv.box(3, 1.5, 0, 1.3, .1, 1.3, 0xd0322e);
    instChunks(root, pv.geometry(), lit, play, { far: 200 * far, shadow: q > 1 }); play.forEach(t => { addProp(t[0], t[1], 1.2, 'deco'); addProp(t[0] + Math.cos(-t[2]) * 3, t[1] + Math.sin(-t[2]) * 3, .9, 'deco'); });
    // ascensores públicos, torres de alta tensión y esculturas
    const lift = [], pyl = [], art = [];
    for (let k = 0; k < (P.lift || []).length; k += 2) if (!inBuilding(P.lift[k], P.lift[k + 1]) && roadNear(P.lift[k], P.lift[k + 1], 9, true).d > 1.3) lift.push([P.lift[k], P.lift[k + 1], Math.round(r() * 4) * 1.5708]);
    for (let k = 0; k < (P.pylon || []).length; k += 2) if (!inBuilding(P.pylon[k], P.pylon[k + 1])) pyl.push([P.pylon[k], P.pylon[k + 1], r() * 3.14]);
    for (let k = 0; k < (P.art || []).length; k += 2) if (clear(P.art[k], P.art[k + 1], .9)) art.push([P.art[k], P.art[k + 1], r() * 6.28]);
    const ev = new Vox(); ev.box(0, 0, 0, 2.3, 7.6, 2.3, 0x9fc4d8, { top: 0x55585e }); [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]].forEach(c => ev.box(c[0], 0, c[1], .18, 7.8, .18, 0x3a3f46)); ev.box(0, 7.6, 0, 2.6, .25, 2.6, 0xd0322e); ev.box(0, 0, 1.16, 1.1, 2.2, .06, 0x55585e);
    instChunks(root, ev.geometry(), lit, lift, { far: 420 * far, shadow: q > 1 }); lift.forEach(t => addProp(t[0], t[1], 1.5, 'deco'));
    const yv = new Vox(); yv.box(0, 0, 0, 2.6, 9, 2.6, 0x8d9399); yv.box(0, 9, 0, 1.8, 9, 1.8, 0x8d9399); yv.box(0, 18, 0, 1.0, 9, 1.0, 0x8d9399); [16.5, 20.5, 24.5].forEach((y, i) => yv.box(0, y, 0, 13 - i * 2.6, .32, .32, 0x7a8086)); yv.box(0, 27, 0, .3, 2.2, .3, 0x7a8086);
    instChunks(root, yv.geometry(), lit, pyl, { far: 900, shadow: q > 1 }); pyl.forEach(t => addProp(t[0], t[1], 1.6, 'deco'));
    const av = new Vox(); av.box(0, 0, 0, 1.3, .8, 1.3, 0xb9b3a6); av.box(0, .8, 0, .5, 1.5, .5, 0x5c6066); av.bx(-.7, 1.9, -.12, .7, 2.3, .12, 0x7a5a3a); av.box(.2, 2.3, 0, .3, .9, .3, 0x5c6066);
    instChunks(root, av.geometry(), lit, art, { far: 200 * far, shadow: q > 1 }); art.forEach(t => addProp(t[0], t[1], .85, 'deco')); }

  // ---------- paradas de autobús: marquesina en la acera, mirando a la calzada
  { const sh = [], pole = []; ((M.props || {}).bus || []).forEach(b => { const n = roadNear(b[0], b[1], 16, true); if (!n.r) return; let nx = b[0] - n.x, nz = b[1] - n.z; const l = Math.hypot(nx, nz); if (l < .2) { nx = -n.uz; nz = n.ux; } else { nx /= l; nz /= l; }
      const off = n.r.w / 2 + 1.35, x = n.x + nx * off, z = n.z + nz * off, yaw = Math.atan2(-nx, -nz); if (inWaterPoly(x, z)) return; ST.stops.push({ x, z, n: b[2] || 'Parada' });
      if (!inBuilding(x, z) && !collide(x, z, 1.3, true).hit && roadNear(x, z, 9, true).d > .4) { sh.push([x, z, yaw]); const tx = Math.cos(-yaw), tz = Math.sin(-yaw); addProp(x - tx * 1.1 + nx * .3, z - tz * 1.1 + nz * .3, .5, 'deco'); addProp(x + tx * 1.1 + nx * .3, z + tz * 1.1 + nz * .3, .5, 'deco'); }
      else if (!inBuilding(n.x + nx * (n.r.w / 2 + .5), n.z + nz * (n.r.w / 2 + .5))) pole.push([n.x + nx * (n.r.w / 2 + .5), n.z + nz * (n.r.w / 2 + .5), yaw]); });
    const v = new Vox(); v.bx(-1.6, 2.35, -.75, 1.6, 2.47, .6, 0x3a3f46); v.bx(-1.6, .25, -.74, 1.6, 2.35, -.68, 0x9fc4d8); [-1.55, 1.55].forEach(x => { v.box(x, 0, -.7, .1, 2.4, .1, 0x3a3f46); v.bx(x - .03, .25, -.7, x + .03, 2.35, .1, 0x9fc4d8); }); v.bx(-1.1, .42, -.6, 1.1, .5, -.25, 0x8a5a34); v.box(-.9, 0, -.42, .07, .42, .07, 0x3a3f46); v.box(.9, 0, -.42, .07, .42, .07, 0x3a3f46);
    v.box(2.2, 0, .3, .09, 2.7, .09, 0x3a3f46); v.box(2.2, 2.1, .3, .5, .6, .08, 0xd0322e); voxText(v, 'BUS', 2.2, 2.28, .35, .034, .02, 0xffffff, { center: true });
    instChunks(root, v.geometry(), lit, sh, { far: 190 * far, shadow: q > 1 });
    const pv = new Vox(); pv.box(0, 0, 0, .09, 2.7, .09, 0x3a3f46); pv.box(0, 2.1, 0, .5, .6, .08, 0xd0322e); voxText(pv, 'BUS', 0, 2.28, .05, .034, .02, 0xffffff, { center: true });
    const pr = instChunks(root, pv.geometry(), lit, pole, { far: 130 * far }); pole.forEach((t, i) => soft(t[0], t[1], .12, 'sign', [pr[i]])); }

  // ---------- señales de velocidad máxima al entrar en las calles que la traen en el mapa (la mayoría, zona 30)
  { const byV = new Map(); let nS = 0; const put = (x0, z0, ux, uz, w, v) => { const x = x0 + ux * 7 - uz * (w / 2 + .7), z = z0 + uz * 7 + ux * (w / 2 + .7); if (inBuilding(x, z) || inWaterPoly(x, z) || roadNear(x, z, 8, true).d < .25 || collide(x, z, .3, true).hit || nearJunc(x, z, 2)) return; let l = byV.get(v); if (!l) byV.set(v, l = []); l.push([x, z, Math.atan2(ux, uz) + Math.PI]); nS++; };
    M.roads.forEach(r => { if (!r.lim || r.b || r.u || nS > 260) return; const p = r.p, n = p.length / 2; let L = 0; for (let k = 0; k + 3 < p.length; k += 2) L += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); if (L < 45) return;
      const d0 = Math.hypot(p[2] - p[0], p[3] - p[1]) || 1; if (nearJunc(p[0], p[1], 3)) put(p[0], p[1], (p[2] - p[0]) / d0, (p[3] - p[1]) / d0, r.w, r.lim);
      if (!r.o) { const a = n - 1, b = n - 2, d1 = Math.hypot(p[b * 2] - p[a * 2], p[b * 2 + 1] - p[a * 2 + 1]) || 1; if (nearJunc(p[a * 2], p[a * 2 + 1], 3)) put(p[a * 2], p[a * 2 + 1], (p[b * 2] - p[a * 2]) / d1, (p[b * 2 + 1] - p[a * 2 + 1]) / d1, r.w, r.lim); } });
    byV.forEach((l, v) => { const sv = new Vox(); sv.box(0, 0, 0, .07, 2.1, .07, 0x9aa0a8); sv.box(0, 2.05, .03, .62, .62, .05, 0xc8281e); sv.box(0, 2.0, .03, .42, .72, .05, 0xc8281e); sv.box(0, 2.15, .03, .72, .42, .05, 0xc8281e);
      sv.box(0, 2.13, .045, .46, .46, .05, 0xf6f4ee); sv.box(0, 2.06, .045, .32, .6, .05, 0xf6f4ee); sv.box(0, 2.2, .045, .6, .32, .05, 0xf6f4ee); voxText(sv, String(v), 0, 2.27, .075, .045, .02, 0x1a1a1a, { center: true });
      const refs = instChunks(root, sv.geometry(), lit, l, { far: 120 * far }); l.forEach((t, i) => soft(t[0], t[1], .12, 'sign', [refs[i]])); }); ST.limSigns = nS; }

  // ---------- señales de stop y ceda, a la derecha de quien llega
  { const stop = [], give = [], S = M.signs || []; for (let k = 0; k < S.length; k += 5) { const a = S[k + 2], ux = Math.sin(a), uz = Math.cos(a); let ok = false, x, z; for (const m of [.75, .35]) { x = S[k] - uz * (S[k + 3] / 2 + m); z = S[k + 1] + ux * (S[k + 3] / 2 + m); if (!inBuilding(x, z) && !inWaterPoly(x, z) && roadNear(x, z, 8, true).d > .2 && !collide(x, z, .3, true).hit) { ok = true; break; } } if (ok) (S[k + 4] ? give : stop).push([x, z, a + Math.PI]); }
    const sv = new Vox(); sv.box(0, 0, 0, .07, 2.1, .07, 0x9aa0a8); sv.box(0, 2.05, .03, .62, .62, .05, 0xc8281e); sv.box(0, 2.0, .03, .42, .72, .05, 0xc8281e); sv.box(0, 2.15, .03, .72, .42, .05, 0xc8281e); voxText(sv, 'STOP', 0, 2.26, .07, .028, .02, 0xffffff, { center: true });
    const gv = new Vox(); gv.box(0, 0, 0, .07, 2.1, .07, 0x9aa0a8); [[.7, 2.55], [.52, 2.4], [.34, 2.25], [.16, 2.1]].forEach(q => gv.box(0, q[1], .03, q[0], .15, .05, 0xc8281e)); [[.46, 2.56], [.28, 2.42], [.1, 2.28]].forEach(q => gv.box(0, q[1], .045, q[0], .12, .04, 0xf2efe6));
    const a = instChunks(root, sv.geometry(), lit, stop, { far: 120 * far }), b = instChunks(root, gv.geometry(), lit, give, { far: 120 * far }); stop.forEach((t, i) => soft(t[0], t[1], .12, 'sign', [a[i]])); give.forEach((t, i) => soft(t[0], t[1], .12, 'sign', [b[i]])); ST.signs = stop.length + give.length; }

  // ---------- semáforos: en los pasos de cebra con semáforo y en los cruces que lo tienen
  { const list = [], C = M.cross || [], Lg = M.lights || [], at = (x, z, a, w) => { const n = roadNear(x, z, 6, true), two = !n.r || !n.r.o; [0, 1].forEach(d => { if (d && !two) return; const aa = a + d * Math.PI, ux = Math.sin(aa), uz = Math.cos(aa), px = x - uz * (w / 2 + .6) - ux * 2.6, pz = z + ux * (w / 2 + .6) - uz * 2.6; if (inBuilding(px, pz) || collide(px, pz, .3, true).hit) return; list.push([px, pz, aa + Math.PI]); ST.lights.push({ x: x - ux * 2.6, z: z - uz * 2.6, ux, uz }); }); };
    for (let k = 0; k < C.length; k += 5) if (C[k + 4]) at(C[k], C[k + 1], C[k + 2], C[k + 3]); for (let k = 0; k < Lg.length; k += 4) at(Lg[k], Lg[k + 1], Lg[k + 2], Lg[k + 3]);
    const v = new Vox(); v.box(0, 0, 0, .12, 3.1, .12, 0x2c3036); v.box(0, 3.1, .04, .34, 1.0, .3, 0x1c1e22); v.box(0, 2.3, .04, .26, .5, .2, 0x1c1e22);
    const refs = instChunks(root, v.geometry(), lit, list, { far: 260 * far, shadow: q > 1 }), lp = list.map((t, i) => soft(t[0], t[1], .14, 'sign', [refs[i]]));
    ['R', 'A', 'G'].forEach((n, i) => { const b = new Vox(); b.box(0, 3.78 - i * .31, .2, .2, .2, .04, 0xffffff); const m = W.mats['tl' + n] = new THREE.MeshBasicMaterial({ color: 0x222222 }); const rf = instChunks(root, b.geometry(), m, list, { far: 260 * far }); lp.forEach((p, k) => p.inst.push(rf[k])); }); }

  calming(M, root); radar(M, root); pitches(M, root, q, far); poiSigns(M, root, q, far); transit(M, root, q); landmarks(M, root, q); puente(root, q); plates(M, root, q, far);
}
// ---------- límite de velocidad de una calle: el del mapa si lo trae; si no, el general en ciudad
export function limitOf(r) { return !r ? 0 : r.lim || (r.t === 'living_street' || r.t === 'service' || r.t === 'track' ? 20 : /^(motorway|trunk|primary)/.test(r.t) || (/^secondary/.test(r.t) && (r.l || 0) >= (r.o ? 2 : 4)) ? 50 : 30); }
// ---------- radar móvil de la Policía Municipal: cada día en una calle distinta (la radio lo avisa por la mañana)
export const RADAR = { list: [], cur: null, g: null };
function radarCands(M) { const L = []; M.roads.forEach((r, i) => { const sp = ROAD[r.t]; if (!sp || !sp[3] || r.b || r.u || !r.n || r.w < 6.5 || r.t === 'service') return; const p = r.p; let len = 0; for (let k = 0; k + 3 < p.length; k += 2) len += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); if (len < 90) return;
    let k = 0, acc = 0; while (k + 3 < p.length) { const l = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); if (acc + l > len / 2) break; acc += l; k += 2; } const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, l = Math.hypot(ex, ez) || 1, ux = ex / l, uz = ez / l, f = Math.min(1, (len / 2 - acc) / l);
    const off = r.w / 2 + .9, x = ax + ex * f - uz * off, z = az + ez * f + ux * off; if (inBuilding(x, z) || inWaterPoly(x, z) || nearJunc(x, z, 8) || collide(x, z, 1.2, true).hit) return; L.push({ x, z, ux, uz, r, n: r.n }); }); return L; }
export function radarFor(day) { const L = RADAR.list; if (!L.length) return null; const k = Math.abs(Math.sin(day * 12.9898) * 43758.5453) % 1; return L[Math.floor(k * L.length)]; }
function radar(M, root) {
  RADAR.list = radarCands(M); const v = new Vox(), info = carBody(v, 0xf2efe6, 'van'); v.bx(.1, .62, -info.W / 2 - .01, info.L - .1, .82, info.W / 2 + .01, 0x1f4fa8); v.bx(.1, .82, -info.W / 2 - .015, info.L - .1, .9, info.W / 2 + .015, 0xe0b23a);
  [-1, 1].forEach(sd => { v.at(info.L / 2, 0, sd * (info.W / 2 + .02), sd > 0 ? 0 : Math.PI); voxText(v, 'POLICIA', 0, 1.05, 0, .045, .02, 0x1f4fa8, { center: true }); v.at(); });
  v.bx(info.L * .45, info.H, -.5, info.L * .65, info.H + .14, .5, 0x1f4fa8); v.bx(info.L * .47, info.H + .14, -.35, info.L * .53, info.H + .22, -.05, 0x3a7aff); v.bx(info.L * .57, info.H + .14, .05, info.L * .63, info.H + .22, .35, 0xff3a3a);
  v.box(info.L + .5, 0, 0, .1, .9, .1, 0x2c3036); v.box(info.L + .5, .9, 0, .32, .3, .26, 0x1a1c20);      // el trípode con la cámara, delante
  const m = v.mesh('lit', 3), g = new THREE.Group(); m.position.x = -info.L / 2; g.add(m); g.visible = false; root.add(g); RADAR.g = g; RADAR.L = info.L; RADAR.prop = null;
}
export function placeRadar(day) { const c = radarFor(day); RADAR.cur = c; if (!RADAR.g) return; if (!c) { RADAR.g.visible = false; return; } RADAR.g.position.set(c.x, standY(c.x, c.z), c.z); RADAR.g.rotation.y = Math.atan2(-c.uz, c.ux); RADAR.g.visible = true;
  if (RADAR.prop) { RADAR.prop.forEach(p => { p.x = 1e9; }); } RADAR.prop = [-1.5, 0, 1.5].map(o => addProp(c.x + c.ux * o, c.z + c.uz * o, 1.05, 'car')); }

// ---------- badenes y pasos elevados del mapa (traffic_calming): mesa (paso elevado, 10 cm), lomo (8 cm) y bandas rugosas.
// calmH(x, z) da cuánto levantan el firme en ese punto: el coche de Ethan lo nota (cabecea y, si pasa deprisa, se resiente)
export const CALM = [];
const PROF = [a => a < 1.4 ? .1 : a < 2.3 ? .1 * (2.3 - a) / .9 : 0, a => a < 1.85 ? .08 * Math.cos(a / 1.85 * Math.PI / 2) ** 2 : 0, () => 0], HALF = [2.3, 1.85, 1.8];
export function calmH(x, z) { for (let i = 0; i < CALM.length; i++) { const c = CALM[i], dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz > c.R2) continue; const u = dx * c.ux + dz * c.uz, v = -dx * c.uz + dz * c.ux; if (Math.abs(v) > c.hw) continue; const h = PROF[c.k](Math.abs(u)); if (h > 0) return h; } return 0; }
function calming(M, root) {
  const C = M.calm || [], g = new Geo(), cA = lin2(0x5b6167), cW = lin2(0xeeebe2), cS = lin2(0x4a4f55), cR = lin2(0xb9b3a6), X = M.cross || [];
  for (let k = 0; k < C.length; k += 5) { const x = C[k], z = C[k + 1], a = C[k + 2], w = C[k + 3], kind = C[k + 4], ux = Math.sin(a), uz = Math.cos(a), hw = w / 2, half = HALF[kind];
    if (deckY(x, z) > -1e8) continue; CALM.push({ x, z, ux, uz, hw, k: kind, R2: (half + hw) ** 2 });
    let zebra = false; for (let q = 0; q < X.length; q += 5) { const dx = X[q] - x, dz = X[q + 1] - z; if (Math.abs(dx * ux + dz * uz) < half + 1.5 && Math.abs(-dx * uz + dz * ux) < hw + 1) { zebra = true; break; } }      // paso de cebra elevado: las franjas, arriba
    const P = (u, v) => [x + ux * u - uz * v, z + uz * u + ux * v], Y = (u, v, h) => { const p = P(u, v); return gY(p[0], p[1]) + .17 + h; };
    const strip = (u0, u1, v0, v1, col, lift) => { const pr = PROF[kind], a0 = P(u0, v0), a1 = P(u1, v0), b1 = P(u1, v1), b0 = P(u0, v1), h0 = pr(Math.abs(u0)) + lift, h1 = pr(Math.abs(u1)) + lift;
      g.quad(g.v(a0[0], Y(u0, v0, h0), a0[1], 0, 1, 0, col), g.v(b0[0], Y(u0, v1, h0), b0[1], 0, 1, 0, col), g.v(b1[0], Y(u1, v1, h1), b1[1], 0, 1, 0, col), g.v(a1[0], Y(u1, v0, h1), a1[1], 0, 1, 0, col)); };
    if (kind === 2) { for (let u = -1.5; u <= 1.51; u += .6) { strip(u - .15, u + .15, -hw, hw, cR, .02); } continue; }
    const step = kind ? .37 : .3; for (let u = -half; u < half - .001; u += step) { const u1 = Math.min(half, u + step); strip(u, u1, -hw, hw, cA, .012);
      // dientes blancos en las rampas y, si es un paso de cebra elevado, las franjas arriba
      const ramp = kind ? Math.abs(u + step / 2) > .3 : Math.abs(u + step / 2) > 1.4; if (ramp) for (let v = -hw + .4; v < hw - .5; v += 1.1) strip(u, u1, v, v + .45, cW, .02);
      else if (kind === 0 && zebra) for (let v = -hw + .3; v < hw - .4; v += 1) strip(u, u1, v, v + .5, cW, .02); }
    for (const sd of [-1, 1]) for (let u = -half; u < half - .001; u += .3) { const u1 = Math.min(half, u + .3), v = sd * hw, a0 = P(u, v), a1 = P(u1, v), h0 = PROF[kind](Math.abs(u)), h1 = PROF[kind](Math.abs(u1)), b0 = gY(a0[0], a0[1]) + .17, b1 = gY(a1[0], a1[1]) + .17;
      if (h0 < .005 && h1 < .005) continue; const nx = -uz * sd, nz = ux * sd; g.quad(g.v(a0[0], b0, a0[1], nx, 0, nz, cS), g.v(a1[0], b1, a1[1], nx, 0, nz, cS), g.v(a1[0], b1 + h1 + .012, a1[1], nx, 0, nz, cS), g.v(a0[0], b0 + h0 + .012, a0[1], nx, 0, nz, cS)); } }
  if (g.nv) { const m = new THREE.Mesh(g.build(), mat('lit')); m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); } ST.calm = CALM.length;
}
const lin2 = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// ---------- campos del mapa con sus líneas y porterías (fútbol, fútbol sala, balonmano), canastas (baloncesto) y red (tenis).
// El campo se orienta por el eje largo de su polígono y las medidas se ajustan a lo que mide de verdad
function pitches(M, root, q, far) {
  const g = new Geo(), W2 = lin2(0xf2efe6), goals = [], small = [], hoops = [], nets = []; let n = 0;
  (M.green || []).forEach(a => { if (a.k !== 'pitch') return; const sp = a.s || ''; const P = a.p, m = P.length / 2; if (m < 4) return;
    let cx = 0, cz = 0; for (let k = 0; k < m; k++) { cx += P[k * 2]; cz += P[k * 2 + 1]; } cx /= m; cz /= m; let A = 0, B = 0, C = 0; for (let k = 0; k < m; k++) { const dx = P[k * 2] - cx, dz = P[k * 2 + 1] - cz; A += dx * dx; B += dz * dz; C += dx * dz; }
    const t = .5 * Math.atan2(2 * C, A - B), ux = Math.cos(t), uz = Math.sin(t); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (let k = 0; k < m; k++) { const dx = P[k * 2] - cx, dz = P[k * 2 + 1] - cz, u = dx * ux + dz * uz, v = -dx * uz + dz * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const L = (u1 - u0) - 2, Wd = (v1 - v0) - 2, ox = cx + ux * (u0 + u1) / 2 - uz * (v0 + v1) / 2, oz = cz + uz * (u0 + u1) / 2 + ux * (v0 + v1) / 2; if (L < 12 || Wd < 7 || L > 130) return;
    const at = (u, v) => [ox + ux * u - uz * v, oz + uz * u + ux * v], inside = (u, v) => { const p = at(u, v); return inPoly(P, p[0], p[1]); }; if (!inside(L / 2 - .5, Wd / 2 - .5) || !inside(-L / 2 + .5, -Wd / 2 + .5)) return;
    const line = (ua, va, ub, vb, w) => { const A0 = at(ua, va), B0 = at(ub, vb), dx = B0[0] - A0[0], dz = B0[1] - A0[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2, y = p => Math.max(gY(p[0], p[1]), mY(p[0], p[1])) + .2, ns = Math.max(1, Math.ceil(l / 1.5));      // a trozos: así sigue el suelo
      for (let i = 0; i < ns; i++) { const a = [A0[0] + dx * i / ns, A0[1] + dz * i / ns], b = [A0[0] + dx * (i + 1) / ns, A0[1] + dz * (i + 1) / ns]; g.quad(g.v(a[0] - nx, y(a), a[1] - nz, 0, 1, 0, W2), g.v(a[0] + nx, y(a), a[1] + nz, 0, 1, 0, W2), g.v(b[0] + nx, y(b), b[1] + nz, 0, 1, 0, W2), g.v(b[0] - nx, y(b), b[1] - nz, 0, 1, 0, W2)); } };
    const rect = (ua, va, ub, vb) => { line(ua, va, ub, va, .18); line(ub, va, ub, vb, .18); line(ub, vb, ua, vb, .18); line(ua, vb, ua, va, .18); };
    const circ = (uc, vc, r, a0, a1) => { const N = 20; for (let i = 0; i < N; i++) { const p0 = a0 + (a1 - a0) * i / N, p1 = a0 + (a1 - a0) * (i + 1) / N; line(uc + Math.cos(p0) * r, vc + Math.sin(p0) * r, uc + Math.cos(p1) * r, vc + Math.sin(p1) * r, .18); } };
    const H = L / 2, V = Wd / 2, yaw = Math.atan2(ux, uz);
    if (/soccer|futsal|handball|team_handball|multi/.test(sp) || (!sp && L > 25)) { n++; const big = L > 60 && Wd > 35, sc = big ? 1 : Math.min(1, L / 100);
      rect(-H, -V, H, V); line(0, -V, 0, V, .18); circ(0, 0, big ? 9.15 : Math.max(2, Wd * .17), 0, Math.PI * 2);
      for (const s2 of [-1, 1]) { const pa = big ? 16.5 : Math.max(3, L * .14), pw = big ? 20.2 : Math.max(3, Wd * .3); rect(s2 * H, -pw, s2 * (H - pa), pw); if (big) { rect(s2 * H, -9.16, s2 * (H - 5.5), 9.16); circ(s2 * (H - 11), 0, 9.15, s2 > 0 ? Math.PI * .7 : -Math.PI * .3, s2 > 0 ? Math.PI * 1.3 : Math.PI * .3); }
        const gp = at(s2 * (H + .05), 0); (big ? goals : small).push([gp[0], gp[1], yaw + (s2 > 0 ? 0 : Math.PI)]); addProp(...at(s2 * H, big ? 3.66 : 1.5), .12, 'deco'); addProp(...at(s2 * H, big ? -3.66 : -1.5), .12, 'deco'); } }
    else if (/basketball/.test(sp)) { n++; rect(-H, -V, H, V); line(0, -V, 0, V, .15); circ(0, 0, 1.8, 0, Math.PI * 2); for (const s2 of [-1, 1]) { circ(s2 * (H - 1.6), 0, Math.min(6.75, V - .3), s2 > 0 ? Math.PI / 2 : -Math.PI / 2, s2 > 0 ? Math.PI * 1.5 : Math.PI / 2); const hp = at(s2 * (H + .6), 0); hoops.push([hp[0], hp[1], yaw + (s2 > 0 ? Math.PI : 0)]); addProp(hp[0], hp[1], .2, 'deco'); } }
    else if (/tennis/.test(sp)) { n++; rect(-H, -V, H, V); const sv = Math.min(V, 4.1); line(-H, -sv, H, -sv, .12); line(-H, sv, H, sv, .12); line(-H * .5, 0, H * .5, 0, .12); line(-H * .5, -sv, -H * .5, sv, .12); line(H * .5, -sv, H * .5, sv, .12); const np = at(0, 0); nets.push([np[0], np[1], yaw, 0, 1, Wd + .6]); for (const s2 of [-1, 1]) addProp(...at(0, s2 * (V + .3)), .1, 'deco'); } });
  if (g.nv) { const mm = new THREE.Mesh(g.build(), mat('lit')); mm.receiveShadow = true; mm.matrixAutoUpdate = false; root.add(mm); nearOnly2(mm, 380 * far); }
  // porterías (de once y pequeñas), canastas y redes
  const gv = new Vox(); gv.box(0, 0, -3.66, .12, 2.44, .12, 0xffffff); gv.box(0, 0, 3.66, .12, 2.44, .12, 0xffffff); gv.bx(-.06, 2.38, -3.72, .06, 2.5, 3.72, 0xffffff); gv.bx(.06, 0, -3.66, 1.9, .05, 3.66, 0xb9bcb4); gv.bx(1.9, 0, -3.66, 1.95, 1.4, 3.66, 0xc8ccc4); gv.bx(.06, 2.4, -3.66, 1.9, 2.44, 3.66, 0xc8ccc4);
  const sv = new Vox(); sv.box(0, 0, -1.5, .08, 2, .08, 0xffffff); sv.box(0, 0, 1.5, .08, 2, .08, 0xffffff); sv.bx(-.04, 1.96, -1.54, .04, 2.04, 1.54, 0xffffff); sv.bx(.05, 0, -1.5, 1, .04, 1.5, 0xb9bcb4); sv.bx(1, 0, -1.5, 1.03, 1.1, 1.5, 0xc8ccc4);
  const hv = new Vox(); hv.box(0, 0, 0, .14, 3.4, .14, 0x3a3f46); hv.bx(-.07, 3.1, -.07, 1.1, 3.2, .07, 0x3a3f46); hv.bx(1.1, 2.9, -.9, 1.14, 3.95, .9, 0xf2efe6); hv.bx(1.14, 3.05, -.025, 1.6, 3.08, .025, 0xd85a32); hv.bx(1.18, 3.05, -.23, 1.6, 3.08, -.2, 0xd85a32); hv.bx(1.18, 3.05, .2, 1.6, 3.08, .23, 0xd85a32);
  const nv = new Vox(); nv.box(0, 0, -.5, .07, 1.07, .07, 0x3a3f46); nv.box(0, 0, .5, .07, 1.07, .07, 0x3a3f46); nv.bx(-.02, .2, -.5, .02, .95, .5, 0x2a2d31); nv.bx(-.03, .92, -.5, .03, 1, .5, 0xf2efe6);
  const yawFix = l => l.map(q => [q[0], q[1], q[2] - Math.PI / 2, 0, 1]);
  instChunks(root, gv.geometry(), mat('lit'), yawFix(goals), { far: 300 * far, ground: true, shadow: q > 1 }); instChunks(root, sv.geometry(), mat('lit'), yawFix(small), { far: 220 * far, ground: true });
  instChunks(root, hv.geometry(), mat('lit'), hoops.map(q => [q[0], q[1], q[2] - Math.PI / 2, 0, 1]), { far: 220 * far, ground: true, shadow: q > 1 });
  // la red de tenis se estira a lo ancho de la pista: el modelo mide 1 m y se escala solo en ese eje
  nets.forEach(t => { const m = new THREE.Mesh(nv.geometry(), mat('lit')); m.position.set(t[0], gY(t[0], t[1]) + .17, t[1]); m.rotation.y = t[2] - Math.PI / 2; m.scale.set(1, 1, t[5]); m.matrixAutoUpdate = false; m.updateMatrix(); root.add(m); nearOnly2(m, 200 * far); });
  ST.pitches = { n, goals: goals.length + small.length, hoops: hoops.length, nets: nets.length };
}
function nearOnly2(m, d) { const g = m.geometry; g.computeBoundingSphere(); const c = g.boundingSphere.center.clone().applyMatrix4(m.matrixWorld.copy(m.matrix)); W.lods.push({ m, x: c.x, z: c.z, d: d + g.boundingSphere.radius * Math.max(m.scale.x, m.scale.z), tag: 'near' }); }

// ---------- placas con el nombre de la calle en las esquinas: en la fachada si la hay, si no en un poste. Un atlas de nombres en un canvas
function plates(M, root, q, far) {
  const names = [], idx = new Map(), list = [], byName = new Map(), CW = q === 1 ? 128 : 192, CH = q === 1 ? 32 : 48, PER = q === 1 ? 16 : 10;      // atlas pequeño: en calidad baja, 2048×512
  const free = (x, z) => !inBuilding(x, z) && !inWaterPoly(x, z);
  M.roads.forEach(r => { const sp = ROAD[r.t]; if (!r.n || !sp || r.t === 'steps' || r.t === 'footway' || r.t === 'path' || r.t === 'track' || r.t === 'service' || r.b || r.u) return; const p = r.p, n = p.length / 2; if (n < 2) return;
    let L = 0; for (let k = 0; k + 3 < p.length; k += 2) L += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); if (L < 14) return;
    for (const end of [0, 1]) { const a = end ? n - 1 : 0, b = end ? n - 2 : 1, x0 = p[a * 2], z0 = p[a * 2 + 1]; if (!nearJunc(x0, z0, 1.5)) continue; let ux = p[b * 2] - x0, uz = p[b * 2 + 1] - z0; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
      const d0 = Math.min(l - 1, 4 + r.w / 2), sd = end ? -1 : 1, nx = uz * sd, nz = -ux * sd, side = r.w / 2 + (r.sw || 1.2) * .6, bx = x0 + ux * d0 + nx * side, bz = z0 + uz * d0 + nz * side; if (!free(bx, bz)) continue;
      const seen = byName.get(r.n) || []; if (seen.some(o => Math.hypot(o[0] - bx, o[1] - bz) < 45) || list.length > 520) continue;
      let wx = 0, wz = 0, wall = false; for (let t = .3; t < 5; t += .3) { const x = bx + nx * t, z = bz + nz * t; if (inBuilding(x, z)) { wall = true; break; } wx = x; wz = z; }
      if (!wall) { wx = bx; wz = bz; } if (roadNear(wx, wz, 9, true).d < .3) continue;
      let id = idx.get(r.n); if (id === undefined) { if (names.length >= 256) continue; id = names.length; idx.set(r.n, id); names.push(r.n); }
      seen.push([bx, bz]); byName.set(r.n, seen); list.push({ x: wx, z: wz, nx: -nx, nz: -nz, ux, uz, wall, id }); } });
  if (!list.length) return; ST.plates = list.length; ST.plateList = list;
  const tex = canvasTex(CW * PER, CH * Math.ceil(names.length / PER), (g, w, h) => { names.forEach((nm, i) => { const x = (i % PER) * CW, y = Math.floor(i / PER) * CH; g.fillStyle = '#1f3f7a'; g.fillRect(x, y, CW, CH); g.strokeStyle = '#f2efe6'; g.lineWidth = Math.max(1.5, CH / 21); const ins = Math.round(CH / 16); g.strokeRect(x + ins, y + ins, CW - ins * 2, CH - ins * 2);
    g.fillStyle = '#f2efe6'; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = Math.round(CH * .38); g.font = '800 ' + fs + 'px system-ui, sans-serif'; while (g.measureText(nm).width > CW - CH * .34 && fs > 8) { fs--; g.font = '800 ' + fs + 'px system-ui, sans-serif'; } g.fillText(nm, x + CW / 2, y + CH / 2 + 1); }); }, { anis: 4 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; const rows = Math.ceil(names.length / PER), P = [], N = [], U = [], I = [], poles = [];
  const quad = (cx, cy, cz, tx, tz, nx, nz, id, flip) => { const hw = .55, hh = .14, u0 = (id % PER) / PER, u1 = u0 + 1 / PER, v1 = 1 - Math.floor(id / PER) / rows, v0 = v1 - 1 / rows, a = P.length / 3, e = .004 / PER, ua = flip ? u1 - e : u0 + e, ub = flip ? u0 + e : u1 - e;
    P.push(cx - tx * hw, cy - hh, cz - tz * hw, cx + tx * hw, cy - hh, cz + tz * hw, cx + tx * hw, cy + hh, cz + tz * hw, cx - tx * hw, cy + hh, cz - tz * hw); for (let k = 0; k < 4; k++) N.push(nx, 0, nz); U.push(ua, v0 + .002, ub, v0 + .002, ub, v1 - .002, ua, v1 - .002); I.push(a, a + 1, a + 2, a, a + 2, a + 3); };
  list.forEach(o => { const y = gY(o.x, o.z) + (o.wall ? 2.8 : 2.66);
    // la placa se lee de frente: su eje es el de la calle (u) y mira hacia la calzada (n); en poste, por las dos caras
    let tx = o.ux, tz = o.uz; if (tx * o.nz - tz * o.nx < 0) { tx = -tx; tz = -tz; }
    if (o.wall) quad(o.x + o.nx * .06, y, o.z + o.nz * .06, tx, tz, o.nx, o.nz, o.id, false);
    else { quad(o.x + o.nx * .05, y, o.z + o.nz * .05, tx, tz, o.nx, o.nz, o.id, false); quad(o.x - o.nx * .05, y, o.z - o.nz * .05, -tx, -tz, -o.nx, -o.nz, o.id, false); poles.push([o.x, o.z, Math.atan2(o.nx, o.nz)]); addProp(o.x, o.z, .1, 'sign'); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex })); m.matrixAutoUpdate = false; root.add(m);
  const pv = new Vox(); pv.box(0, 0, 0, .07, 2.31, .07, 0x3a3f46); pv.box(0, 2.29, 0, 1.12, .04, .05, 0x3a3f46); instChunks(root, pv.geometry(), mat('lit'), poles, { far: 140 * far });
}

// ---------- a lo lejos: el Puente Colgante (Portugalete–Getxo), fuera del mapa. Se dibuja sin niebla y, si queda más allá de lo que
// alcanza la cámara, se acerca y se encoge en la misma proporción (se ve igual, pero entra en el campo de visión).
const FARM = []; const FV = new THREE.Vector3();
function puente(root, q) {
  const v = new Vox(), C = 0x4b3b39, D = 0x3a2e2d, H = 61, S = 160, G0 = 45, beam = (x0, y0, x1, y1, z, t, col) => { const l = Math.hypot(x1 - x0, y1 - y0); v.mtx(new THREE.Matrix4().makeRotationZ(Math.atan2(y1 - y0, x1 - x0)).setPosition(x0, y0, z)).bx(0, -t, -t, l, t, t, col); v.mtx(null); };
  // dos torres de celosía, cada una de cuatro patas abiertas abajo, con travesaños y aspas
  [-S / 2, S / 2].forEach(tx => { for (const zz of [-1, 1]) { for (const xs of [-1, 1]) beam(tx + xs * 5.5, 0, tx + xs * 1.6, H, zz * 3.2, .55, C); for (let k = 1; k < 7; k++) { const y = k * H / 7, w = 5.5 - (5.5 - 1.6) * y / H; v.bx(tx - w, y - .3, zz * 3.2 - .3, tx + w, y + .3, zz * 3.2 + .3, D); const y2 = (k - 1) * H / 7, w2 = 5.5 - (5.5 - 1.6) * y2 / H; beam(tx - w2, y2, tx + w, y, zz * 3.2, .18, D); beam(tx + w2, y2, tx - w, y, zz * 3.2, .18, D); } }
    for (let k = 1; k < 8; k++) v.box(tx, k * H / 8, 0, 2.2, .5, 6.6, D); v.box(tx, H - .4, 0, 4.6, 1.6, 8, C); });
  // la viga de arriba (celosía de 5 m de canto) y los tirantes en abanico desde lo alto de las torres
  for (const zz of [-3.2, 3.2]) { v.bx(-S / 2, G0, zz - .3, S / 2, G0 + .7, zz + .3, C); v.bx(-S / 2, G0 + 5, zz - .3, S / 2, G0 + 5.7, zz + .3, C); for (let k = 0; k < 16; k++) { const x = -S / 2 + k * S / 16; beam(x, G0 + .4, x + S / 16, G0 + 5.4, zz, .16, D); } }
  for (const side of [-1, 1]) for (let k = 1; k <= 7; k++) { const x0 = side * S / 2, x1 = side * (S / 2 - k * 10.5); for (const zz of [-3.4, 3.4]) beam(x0, H - 1, x1, G0 + 5.7, zz, .1, 0x2a2224); }
  // amarres hacia atrás y la barquilla colgando sobre el agua
  for (const side of [-1, 1]) for (const zz of [-3.4, 3.4]) beam(side * S / 2, H - 1, side * (S / 2 + 95), 3, zz, .13, 0x2a2224);
  const gx = -22; for (const zz of [-2.6, 2.6]) for (const dx of [-6, 6]) beam(gx + dx, G0, gx + dx * .6, 6.5, zz, .05, 0x2a2224); v.box(gx, 3.2, 0, 16, 3.4, 7.5, 0x7a1f1f, { top: 0x55585e }); v.box(gx, 6.6, 0, 9, .8, 6, 0x55585e);
  const mt = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), m = new THREE.Mesh(v.geometry(), mt); m.frustumCulled = false; m.matrixAutoUpdate = false; root.add(m);
  // 43,323 N 3,017 O; la luz va de Portugalete a Las Arenas, más o menos de oeste-suroeste a este-noreste
  FARM.push({ m, x: -945, y: 2, z: -1574, ry: .3, mt });
}
export function tickStreet(t, cam, haze) {
  if (cam) for (const f of FARM) { FV.set(f.x - cam.position.x, f.y - cam.position.y, f.z - cam.position.z); const d = FV.length(), lim = cam.far * .82, k = d > lim ? lim / d : 1; f.m.position.set(cam.position.x + FV.x * k, cam.position.y + FV.y * k, cam.position.z + FV.z * k); f.m.scale.setScalar(k); f.m.rotation.set(0, f.ry, 0); f.m.updateMatrix();
    const h = Math.min(.72, Math.max(.2, d / 2600)); f.mt.color.setScalar(1 - h); if (haze) f.mt.emissive.copy(haze).multiplyScalar(h); } const s = lightState(t), m = W.mats; if (m.tlR && ST.ls !== s) { ST.ls = s; m.tlR.color.setHex(s === 2 ? 0xff3a2e : 0x3a1512); m.tlA.color.setHex(s === 1 ? 0xffb52e : 0x3a2a10); m.tlG.color.setHex(s === 0 ? 0x3cff6a : 0x103a1a); } }

// ---------- rótulos de comercios: el nombre sale del mapa (OpenStreetMap); el color, del tipo de comercio
export const CAT = {
  bar: ['#7a1f2b', 'Bar', '🍺'], cafe: ['#5a3a22', 'Cafetería', '☕'], rest: ['#8a2a1a', 'Restaurante', '🍽️'], fast: ['#c4302a', 'Comida rápida', '🍔'], super: ['#1f6f3a', 'Supermercado', '🛒'], bakery: ['#b8742a', 'Panadería', '🥖'], food: ['#3a7a3a', 'Alimentación', '🥬'],
  pharm: ['#1f8a4a', 'Farmacia', '💊'], bank: ['#1f3f7a', 'Banco', '🏧'], fuel: ['#c85a1a', 'Gasolinera', '⛽'], tobacco: ['#6a4a1a', 'Estanco', '📰'], lottery: ['#1a5a9a', 'Loterías', '🍀'], hair: ['#7a3a7a', 'Peluquería', '💈'], clothes: ['#2a2a2a', 'Tienda de ropa', '👕'],
  shop: ['#3a4a5a', 'Tienda', '🛍️'], garage: ['#4a4a4a', 'Taller', '🔧'], health: ['#2a7a8a', 'Salud', '🩺'], hotel: ['#3a2a5a', 'Alojamiento', '🛏️'], sport: ['#2a5a8a', 'Deporte', '🏋️'], police: ['#1a2a5a', 'Policía', '🚓'], town: ['#5a1a1a', 'Ayuntamiento', '🏛️'],
  civic: ['#4a3a2a', 'Servicio público', '🏛️'], lift: ['#3a5a7a', 'Ascensor público', '🛗'], fronton: ['#2a5a8a', 'Frontón', '🎾'], campo: ['#2a6a3a', 'Campo de fútbol', '⚽'], church: ['#4a4a3a', 'Iglesia', '⛪'], bolos: ['#5a4a2a', 'Bolatoki', '🎳'], canasta: ['#c85a2a', 'Cancha de baloncesto', '🏀'], muelle: ['#2a5a7a', 'Muelle', '🎣'], office: ['#3a3a3a', 'Oficina', '💼'], school: ['#2a4a3a', 'Centro escolar', '🏫']
};
function poiSigns(M, root, q, far) {
  const P = (M.poi || []).filter(p => p.length >= 7), N = P.length; if (!N) return; const COLS = 8, CW = 256, CH = 40, rows = Math.ceil(N / COLS), TH = Math.min(2048, Math.pow(2, Math.ceil(Math.log2(rows * CH)))), vis = Math.min(N, Math.floor(TH / CH) * COLS);
  const tex = canvasTex(COLS * CW, TH, g => { g.fillStyle = '#222'; g.fillRect(0, 0, COLS * CW, TH); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < vis; i++) { const p = P[i], x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH, c = CAT[p[2]] || CAT.shop; g.fillStyle = c[0]; g.fillRect(x, y, CW, CH); g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x, y, CW, 3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + CH - 3, CW, 3);
      let fs = 23; g.font = '700 ' + fs + 'px "Arial Narrow", "Roboto Condensed", Arial, sans-serif'; while (fs > 13 && g.measureText(p[3]).width > CW - 18) { fs--; g.font = '700 ' + fs + 'px "Arial Narrow", "Roboto Condensed", Arial, sans-serif'; }
      g.fillStyle = '#fff'; g.fillText(p[3], x + CW / 2, y + CH / 2 + 1, CW - 12); } }, { aniso: 8 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; const m = W.mats.sign = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .12 });
  const chunks = new Map(), white = [1, 1, 1], crossG = new Vox(); let nCross = 0; const crossAt = [];
  for (let i = 0; i < vis; i++) { const p = P[i], ax = p[4], az = p[5], nx = Math.sin(p[6]), nz = Math.cos(p[6]), tx = nz, tz = -nx, b = inBuilding(ax - nx * .4, az - nz * .4), h = b ? b.h : 6, gy = standY(ax + nx * .5, az + nz * .5, -1e9), y0 = Math.min(gy + (h >= 7 ? 2.93 : Math.max(1.9, h - 1.05)), b && b.y0 !== undefined ? b.y0 + h - .65 : 1e9),      /* el rótulo va sobre el escaparate, que arranca a ras de calle */ hw = 1.5, x = ax + nx * .07, z = az + nz * .07;
    const ck = Math.floor(ax / 320) + ',' + Math.floor(az / 320); let g = chunks.get(ck); if (!g) chunks.set(ck, g = new Geo(true)); const u0 = (i % COLS) / COLS + .001, u1 = (i % COLS + 1) / COLS - .001, v1 = 1 - Math.floor(i / COLS) * CH / TH - .0006, v0 = 1 - (Math.floor(i / COLS) + 1) * CH / TH + .0006;
    g.wall(x + tx * hw, z + tz * hw, x - tx * hw, z - tz * hw, y0, y0 + .47, nx, nz, white, u1, v0, u0, v1);
    if (p[2] === 'pharm') { crossAt.push([ax + nx * .5, az + nz * .5, p[6], Math.min(h - .9, 3.9)]); nCross++; }
    // puerta: un paso por delante de la fachada
    const dx = ax + nx * 1.5, dz = az + nz * 1.5; if (!inBuilding(dx, dz) && !inWaterPoly(dx, dz)) { const o = { x: dx, z: dz, ax, az, c: p[2], n: p[3], yaw: p[6], i: ST.pois.length }; ST.pois.push(o); const kk = key(Math.floor(dx / 20), Math.floor(dz / 20)); let l = ST.pgrid.get(kk); if (!l) ST.pgrid.set(kk, l = []); l.push(o); } }
  // frontones y campos de fútbol del mapa: se puede jugar un rato (el sitio para pulsar E, en el borde del campo que da a un camino o una calle)
  const SPC = { pelota: ['fronton', 'Frontón'], soccer: ['campo', 'Campo de fútbol'], bowls: ['bolos', 'Bolatoki'], basketball: ['canasta', 'Cancha de baloncesto'] };
  (M.green || []).forEach(g => { if (g.k !== 'pitch' || !SPC[g.s]) return; const q = g.p, n = q.length / 2; let cx = 0, cz = 0, best = null; for (let k = 0; k < n; k++) { cx += q[k * 2]; cz += q[k * 2 + 1]; } cx /= n; cz /= n;
    for (let k = 0; k < n; k++) { const x = q[k * 2] + (cx - q[k * 2]) * .12, z = q[k * 2 + 1] + (cz - q[k * 2 + 1]) * .12, d = roadNear(x, z, 40, false).d; if (!inBuilding(x, z) && !inWaterPoly(x, z) && (!best || d < best[2])) best = [x, z, d]; }
    if (!best) return; const o = { x: best[0], z: best[1], ax: cx, az: cz, c: SPC[g.s][0], n: g.n || SPC[g.s][1], yaw: 0, i: ST.pois.length, pitch: 1 }; ST.pois.push(o); const kk = key(Math.floor(o.x / 20), Math.floor(o.z / 20)); let l = ST.pgrid.get(kk); if (!l) ST.pgrid.set(kk, l = []); l.push(o); });
  // muelles para pescar: en la orilla de la ría, donde se llega andando (un camino o una acera al lado), uno cada 220 m como mucho
  { const rias = (M.water || []).map(p => { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] + p[i]) * (p[j + 1] - p[i + 1]); return [p, Math.abs(a)]; }).sort((a, b) => b[1] - a[1]).slice(0, 3), spots = [], B = M.bbox, rod = [];
    for (const ria of rias) { const p = ria[0]; for (let k = 0; k + 3 < p.length && spots.length < 8; k += 2) { const L = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]); for (let t = 0; t < L; t += 12) { const f = t / L, x = p[k] + (p[k + 2] - p[k]) * f, z = p[k + 1] + (p[k + 3] - p[k + 1]) * f; if (x < B[0] + 30 || x > B[2] - 30 || z < B[1] + 30 || z > B[3] - 30) continue;
        const ux = (p[k + 2] - p[k]) / L, uz = (p[k + 3] - p[k + 1]) / L; for (const sd of [1, -1]) { const nx = -uz * sd, nz = ux * sd, wx = x + nx * 3.5, wz = z + nz * 3.5; if (inWaterPoly(wx, wz)) continue; const lx = x + nx * 2.2, lz = z + nz * 2.2; if (inWaterPoly(lx, lz) || !inWaterPoly(lx - nx * 4.5, lz - nz * 4.5) || inBuilding(lx, lz) || collide(lx, lz, .4, true).hit) break;      // tierra donde se pone, agua delante
          const rn = roadNear(lx, lz, 10, false); if (rn.d > 7 || roadNear(lx, lz, 10, true).d < 1) break; if (spots.some(q => Math.hypot(q[0] - lx, q[1] - lz) < 200)) break; spots.push([lx, lz, Math.atan2(-nx, -nz)]); break; } } } }
    spots.forEach(q => { const o = { x: q[0], z: q[1], c: 'muelle', n: 'Muelle de la ría', yaw: q[2], i: ST.pois.length, pitch: 1 }; ST.pois.push(o); const kk = key(Math.floor(o.x / 20), Math.floor(o.z / 20)); let l = ST.pgrid.get(kk); if (!l) ST.pgrid.set(kk, l = []); l.push(o); rod.push([q[0], q[1], q[2]]); addProp(q[0], q[1], .35, 'deco'); });
    const rv = new Vox(); rv.box(0, 0, 0, .38, .36, .38, 0x2a5bb8); rv.box(0, .36, 0, .4, .05, .4, 0x1f4f9a); rv.box(.35, 0, -.1, .3, .3, .5, 0x3a8a5c); rv.at(-.2, 0, .1, 0); for (let i = 0; i < 14; i++) rv.box(-.2, .2 + i * .17, .1 + i * .19, .04, .04, .2, 0x3a3f46); rv.at(); instChunks(root, rv.geometry(), mat('lit'), rod, { far: 120 * far, ground: true }); ST.muelles = spots.length; }
  // grúa pórtico del astillero (la Goliat de La Naval), a horcajadas sobre su carril: patas, viga, carro y luces de balizamiento
  (M.cranes || []).forEach(c => { const a = c[2], ux = Math.cos(a), uz = Math.sin(a), B = M.bbox; let u = Math.min(c[4] - 40, Math.max(c[3] + 40, (c[3] + c[4]) / 2 + 60)); for (let k = 0; k < 20; k++) { const x = c[0] + ux * u, z = c[1] + uz * u; if (x > B[0] + 40 && x < B[2] - 40 && z > B[1] + 40 && z < B[3] - 40) break; u += (c[4] - u) * .25; }
    const x = c[0] + ux * u, z = c[1] + uz * u, y = standY(x, z, -1e9) - .2, half = c[5] / 2, H = 64, RED = 0xc8372d, WH = 0xe9e6dc, v = new Vox(); v.at(x, y, z, -a);
    for (const sv of [-1, 1]) { const vz = sv * half; v.box(0, 0, vz, 16, 2.2, 3.2, 0x55595e); for (const su of [-1, 1]) { const x0 = su * 6.5; for (let k = 0; k < 8; k++) { const f0 = k / 8, f1 = (k + 1) / 8, xa = x0 * (1 - f0 * .6), xb = x0 * (1 - f1 * .6); v.bx(Math.min(xa, xb) - .9, 2.2 + (H - 6) * f0, vz - .9, Math.max(xa, xb) + .9, 2.2 + (H - 6) * f1 + .05, vz + .9, RED); } }
      for (let k = 1; k < 6; k++) v.box(0, 2.2 + (H - 6) * k / 6, vz, 13 * (1 - k / 6 * .6) + 1.6, .6, .5, RED); }
    v.bx(-4.2, H - 4, -half - 14, 4.2, H + 1.5, half + 14, WH, { top: 0xbfbcb2 }); v.bx(-4.3, H - 3.6, -half - 14.1, 4.3, H - 2.4, half + 14.1, RED);
    v.box(0, H + 1.5, half * .3, 7.5, 4.2, 9, 0xd9d6cb, { top: 0x9a978e }); v.box(0, H + 5.7, half * .3, 1.2, 1.2, 1.2, 0xff3b30); v.box(0, H + 1.5, -half - 13, 1, 1, 1, 0xff3b30); v.box(0, H + 1.5, half + 13, 1, 1, 1, 0xff3b30);
    for (const sv of [-1, 1]) v.box(0, H - 9, sv * 3, .25, 6, .25, 0x2a2e33); v.box(0, H - 10.5, 0, 3.2, 1.5, 6.6, 0xe0b23a);
    v.at(); const m = v.mesh('lit', 3); root.add(m); addProp(x + uz * half, z - ux * half, 2.2, 'crane'); addProp(x - uz * half, z + ux * half, 2.2, 'crane'); });
  // ascensores públicos: una torre de cristal y acero; con E se sube o se baja al otro nivel (el punto de la red de calles a menos de 40 m
  // con más desnivel). Si no hay otro nivel cerca, solo se dibuja
  { const L = M.lift || [], v = new Vox(); for (let k = 0; k < L.length; k += 2) { const x = L[k], z = L[k + 1], y = standY(x, z, -1e9); let best = null;
      for (let n = 0; n < GR.x.length; n++) { const dx = GR.x[n] - x, dz = GR.z[n] - z; if (dx * dx + dz * dz > 1600 || dx * dx + dz * dz < 9) continue; const h = standY(GR.x[n], GR.z[n], -1e9), d = Math.abs(h - y); if (d > 3.2 && (!best || d > best[3])) best = [GR.x[n], GR.z[n], h, d]; }
      const top = best ? Math.max(y, best[2]) : y + 4, bot = best ? Math.min(y, best[2]) : y; v.box(x, bot - .3, z, 2.4, top - bot + 3.3, 2.4, 0x9fc4d2, { top: 0x3b4842 }); v.box(x, top + 2.9, z, 2.7, .3, 2.7, 0x3b4842); v.box(x, bot - .3, z + 1.22, .9, 2.4, .06, 0x23272b);
      if (!best) continue; const o = { x: x + 1.7, z, ax: x, az: z, c: 'lift', n: best[2] > y ? 'Ascensor (sube ' + Math.round(best[3]) + ' m)' : 'Ascensor (baja ' + Math.round(best[3]) + ' m)', yaw: 0, i: ST.pois.length, to: [best[0], best[1]] }; ST.pois.push(o); const kk = key(Math.floor(o.x / 20), Math.floor(o.z / 20)); let l = ST.pgrid.get(kk); if (!l) ST.pgrid.set(kk, l = []); l.push(o); addProp(x, z, 1.3, 'lift'); }
    if (L.length) root.add(v.mesh('lit', 3)); }
  chunks.forEach(g => { const mesh = new THREE.Mesh(g.build(), m); mesh.matrixAutoUpdate = false; root.add(mesh); });
  if (nCross) { crossG.box(0, 0, 0, .14, .62, .2, 0x3cff6a); crossG.box(0, .21, 0, .14, .2, .62, 0x3cff6a); instChunks(root, crossG.geometry(), mat('glowfog'), crossAt, { far: 260 * far }); }
  void q;
}
// comercio en cuya puerta está el jugador (o null)
export function poiAt(x, z) { let best = null, bd = 2.1; const cx = Math.floor(x / 20), cz = Math.floor(z / 20); for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const l = ST.pgrid.get(key(i, j)); if (l) for (const p of l) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } } return best; }

// ---------- bocas de metro: los «fosteritos», la concha de cristal y acero que cubre la escalera que baja al andén.
// Se colocan en la acera junto a la boca del mapa, alineados con la calle y sin pisar calzada, edificios ni agua.
function inFost(x, z, m) { for (const o of ST.fost) { const dx = x - o.x0, dz = z - o.z0, a = dx * o.ax + dz * o.az, b = -dx * o.az + dz * o.ax; if (a > -1.4 - m && a < o.L + .4 + m && Math.abs(b) < o.R + .4 + m) return true; } return false; }
function fosteritos(M, root, q) {
  ST.fost = []; const L = 9, R = 1.85, HM = 2.9, prof = t => Math.pow(Math.cos(t * Math.PI / 2), .8);
  const fits = (x0, z0, ax, az) => { for (let a = -1.6; a <= L + .4; a += 1) for (const b of [-R - .3, 0, R + .3]) { const x = x0 + ax * a - az * b, z = z0 + az * a + ax * b; if (inBuilding(x, z) || inWaterPoly(x, z) || roadNear(x, z, 9, true).d < .15 || collide(x, z, .2, true).hit || inFost(x, z, .5)) return false; } return true; };
  (M.transit || []).forEach(t => { if (t[2] !== 'metro') return; const B = M.bbox; if (t[0] < B[0] + 15 || t[0] > B[2] - 15 || t[1] < B[1] + 15 || t[1] > B[3] - 15) return;
    if (deckY(t[0], t[1]) > -1e8 || t[4] === 'Urbinaga') return;                                     // Urbinaga es una estación en viaducto: allí basta el tótem
    const n = roadNear(t[0], t[1], 25, true); if (!n.r) return; const rx = n.ux, rz = n.uz; let best = null;
    // orientaciones: a lo largo de la calle (los dos sentidos) y, si no cabe, de través; la boca se puede correr hasta 7 m
    for (let rr = 0; rr <= 7 && !best; rr += 1) for (let k = 0; k < (rr ? 8 : 1) && !best; k++) { const x = t[0] + Math.sin(k * .785) * rr, z = t[1] + Math.cos(k * .785) * rr;
      for (const d of [[rx, rz], [-rx, -rz], [-rz, rx], [rz, -rx]]) { const x0 = x - d[0] * L / 2, z0 = z - d[1] * L / 2; if (fits(x0, z0, d[0], d[1])) { best = [x0, z0, d[0], d[1]]; break; } } }
    if (!best) return; const [x0, z0, ax, az] = best, y0 = gY(x0, z0), ry = Math.atan2(ax, az), wy = (a, b) => gY(x0 + ax * a - az * b, z0 + az * a + ax * b) - y0;
    const o = { src: t, x0, z0, ax, az, L, R, mx: x0 - ax * 1.1, mz: z0 - az * 1.1, tx: x0 - az * (R + .9) + ax * .6, tz: z0 + ax * (R + .9) + az * .6 }; ST.fost.push(o);
    // escalera: peldaños cada vez más oscuros según bajan
    const v = new Vox(), N = 16; for (let i = 0; i < N; i++) { const a0 = i * L / N, k = 1 - i / N * .75, g = wy(a0 + L / N / 2, 0); C2.setRGB(.42 * k, .44 * k, .47 * k); v.bx(-R * .82, g + .02, a0, R * .82, g + .05 + (i % 2) * .01, a0 + L / N, C2.getHex()); }
    // costillas de acero, espina y largueros
    const ribs = 8, steel = 0xb4bac0, seg = (ax0, ay0, ax1, ay1, zc, th) => { const l = Math.hypot(ax1 - ax0, ay1 - ay0); v.mtx(new THREE.Matrix4().makeRotationZ(Math.atan2(ay1 - ay0, ax1 - ax0)).setPosition(ax0, ay0, zc)).bx(0, -th, -th, l, th, th, steel); v.mtx(null); };
    const top = []; for (let i = 0; i <= ribs; i++) { const tt = i / ribs * .93, zc = tt * L, h = HM * prof(tt), g = wy(zc, 0), th = i ? .06 : .1; top.push([zc, g + h]);
      for (let j = 0; j < 9; j++) { const u0 = j / 9 * Math.PI, u1 = (j + 1) / 9 * Math.PI; seg(R * Math.cos(u0), g + h * Math.sin(u0), R * Math.cos(u1), g + h * Math.sin(u1), zc, th); } }
    for (let i = 0; i + 1 < top.length; i++) { const a = top[i], b = top[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); v.mtx(new THREE.Matrix4().makeRotationX(Math.atan2(-(b[1] - a[1]), b[0] - a[0])).setPosition(0, a[1], a[0])).bx(-.05, -.05, 0, .05, .05, l, steel); v.mtx(null); }
    [-R, R].forEach(b => { for (let i = 0; i + 1 < top.length; i++) { const z0r = top[i][0], z1r = top[i + 1][0], g0 = wy(z0r, 0), g1 = wy(z1r, 0), l = Math.hypot(z1r - z0r, g1 - g0); v.mtx(new THREE.Matrix4().makeRotationX(Math.atan2(-(g1 - g0), z1r - z0r)).setPosition(b, g0 + .02, z0r)).bx(-.07, -.12, 0, .07, .12, l, 0x8d9399); v.mtx(null); } });
    const m = v.mesh('lit', q > 1 ? 3 : 2); m.position.set(x0, y0, z0); m.rotation.y = ry; root.add(m);
    // concha de cristal
    const NU = 12, NT = 14, P = [], I = []; for (let i = 0; i <= NT; i++) { const tt = i / NT * .93, zc = tt * L, h = HM * prof(tt), g = wy(zc, 0); for (let j = 0; j <= NU; j++) { const u = j / NU * Math.PI; P.push(R * Math.cos(u), g + h * Math.sin(u), zc); } }
    for (let i = 0; i < NT; i++) for (let j = 0; j < NU; j++) { const a = i * (NU + 1) + j, b = a + NU + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setIndex(I); gg.computeVertexNormals();
    if (!W.mats.fost) W.mats.fost = new THREE.MeshLambertMaterial({ color: 0xa9d2dc, transparent: true, opacity: .34, side: THREE.DoubleSide, depthWrite: false });
    const gm = new THREE.Mesh(gg, W.mats.fost); gm.position.copy(m.position); gm.rotation.y = ry; gm.renderOrder = 2; root.add(gm);
    // no se atraviesa: costados, cola y el hueco de la escalera
    for (let a = .3; a <= L; a += 1.3) { [-R, R].forEach(b => addProp(x0 + ax * a - az * b, z0 + az * a + ax * b, .3, 'deco')); if (a > 1.4) addProp(x0 + ax * a, z0 + az * a, 1.25, 'deco'); } });
}
const C2 = new THREE.Color();

// ---------- metro y tren: un tótem en cada boca o estación. Sirven para moverse rápido por el pueblo.
function freeNear(x, z) { for (let rr = 0; rr < 30; rr += 2.5) for (let a = 0; a < 8; a++) { const px = x + Math.sin(a * .7854) * rr, pz = z + Math.cos(a * .7854) * rr; if (!inBuilding(px, pz) && !inWaterPoly(px, pz) && !collide(px, pz, .6, true).hit && roadNear(px, pz, 9, true).d > .6) return [px, pz]; if (!rr) break; } return null; }
function transit(M, root, q) {
  const met = [], trn = []; (M.transit || []).forEach(t => { const fo = ST.fost.find(o => o.src === t); if (fo) { ST.transit.push({ x: fo.mx, z: fo.mz, ex: fo.x0 - fo.ax * 2.4, ez: fo.z0 - fo.az * 2.4, k: 'metro', n: t[4] || 'Metro', e: t[3] || '' }); met.push([fo.tx, fo.tz, 0]); return; }
    const f = freeNear(t[0], t[1]); if (!f) return; const B = M.bbox; if (f[0] < B[0] + 6 || f[0] > B[2] - 6 || f[1] < B[1] + 6 || f[1] > B[3] - 6) return;
    const o = { x: f[0], z: f[1], k: t[2], n: (t[2] === 'metro' ? t[4] : t[3]) || (t[2] === 'metro' ? 'Metro' : 'Estación'), e: t[3] || '' }; ST.transit.push(o); (t[2] === 'metro' ? met : trn).push([f[0], f[1], 0]); });
  const mk = (txt, col) => { const v = new Vox(); v.box(0, 0, 0, .3, 3.6, .3, 0x3a3f46); v.box(0, 3.6, 0, 1.5, 1.5, .3, col); voxText(v, txt, 0, txt.length > 1 ? 4.12 : 3.86, .16, txt.length > 1 ? .055 : .14, .04, 0xffffff, { center: true }); v.at(0, 0, 0, Math.PI); voxText(v, txt, 0, txt.length > 1 ? 4.12 : 3.86, .16, txt.length > 1 ? .055 : .14, .04, 0xffffff, { center: true }); v.at(); return v.geometry(); };
  instChunks(root, mk('M', 0xd0322e), mat('lit'), met, { far: 500, shadow: q > 1 }); instChunks(root, mk('TREN', 0x6b2a8a), mat('lit'), trn, { far: 500, shadow: q > 1 }); ST.transit.forEach(o => addProp(o.x, o.z, .3, 'deco'));
}
export function busAt(x, z) { let best = null, bd = 3.4; for (const t of ST.stops) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } } return best; }
export function transitAt(x, z) { let best = null, bd = 3.2; for (const t of ST.transit) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } } return best; }

// ---------- hitos: el Horno Alto y las grúas
function landmarks(M, root, q) {
  (M.marks || []).forEach(mk => { const v = new Vox();
    if (mk.k === 'furnace') { const R = 0x7a4a36, D = 0x4a4f55, K = 0x8d9399, s = Math.max(.7, Math.min(1.2, mk.r / 34));
      v.cyl(0, 0, 0, 7.5, 6, 0x6a6e74, { seg: 4 }); v.cyl(0, 6, 0, 6, 12, R, { seg: 4 }); v.cyl(0, 18, 0, 4.6, 14, 0x8a543c, { seg: 4 }); v.cyl(0, 32, 0, 3.4, 9, R, { seg: 4 }); v.box(0, 41, 0, 9, 1, 9, D); v.box(0, 42, 0, 4, 9, 4, D); v.box(0, 51, 0, 6.5, 1, 6.5, D);          // cuba y tragante
      v.bx(-12, 16.5, -10, 12, 17.3, 10, D); [[-11.5, -9.5], [11.5, -9.5], [-11.5, 9.5], [11.5, 9.5]].forEach(c => v.box(c[0], 0, c[1], .9, 16.5, .9, D));                                                                                    // plataforma de colada
      [-1, 0, 1].forEach(i => { v.cyl(-19, 0, i * 8.5, 3.6, 30, 0xa9a59c, { seg: 4 }); v.cyl(-19, 30, i * 8.5, 2.9, 2.2, 0x8a8478, { seg: 3 }); v.cyl(-19, 32.2, i * 8.5, 1.8, 1.6, 0x8a8478, { seg: 3 }); });                                            // estufas
      v.cyl(-28, 0, 0, 1.7, 58, 0x9a5a44, { seg: 3 }); v.bx(-19, 27, -9.5, -17.5, 28.4, 9.5, K); v.bx(-18, 22, -.8, -5, 23.6, .8, K);
      for (let i = 0; i < 12; i++) v.box(8 + i * 2.6, i * 4.2, 14 - i * 1.15, 2.6, 5.2, 2.4, K);                                                                                                                                                // plano inclinado
      v.bx(3, 46, -1, 20, 47.6, 1, K); v.cyl(20, 20, 0, 2.4, 27, 0x6a6e74, { seg: 3 }); v.bx(18.5, 47, -1, 21.5, 50, 1, K);
      const m = v.mesh('lit', q > 1 ? 3 : 2); m.position.set(mk.x, standY(mk.x, mk.z) - .4, mk.z); m.scale.setScalar(s); m.rotation.y = .5; root.add(m); addProp(mk.x, mk.z, 9 * s, 'deco'); addProp(mk.x - Math.cos(-.5) * 19 * s, mk.z - Math.sin(-.5) * 19 * s, 9 * s, 'deco'); }
    else if (mk.k === 'crane') { v.box(0, 0, 0, 5, 1, 5, 0x55585e); v.box(0, 1, 0, 1.6, 30, 1.6, 0xe0b23a); v.bx(-14, 30, -.8, 26, 31.6, .8, 0xe0b23a); v.box(0, 31.6, 0, 3, 2.4, 3, 0xd8d4c8); v.bx(22, 18, -.1, 22.2, 30, .1, 0x26262c); v.box(-12, 27, 0, 4, 3, 2.4, 0x6a6e74); const m = v.mesh('lit', q > 1 ? 3 : 2); m.position.set(mk.x, standY(mk.x, mk.z) - .3, mk.z); m.rotation.y = .6; root.add(m); addProp(mk.x, mk.z, 2.6, 'deco'); } });
}
