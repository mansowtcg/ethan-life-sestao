// street.js: lo que hay en la calle. Árboles, farolas, bancos, paradas, señales, semáforos, rótulos de los
// comercios (con los nombres del mapa), bocas de metro, estaciones y los hitos de Sestao.
import * as THREE from 'three';
import { Vox, mat, voxText } from './vox.js';
import { W, ROAD, Geo, instChunks, addProp, collide, inBuilding, inWaterPoly, inPoly, roadNear, bboxOf, canvasTex, nearJunc } from './world.js';
import { rng } from './util.js';
import { GR } from './graph.js';
import { standY, deckY, gY } from './terrain.js';

export const ST = { pois: [], pgrid: new Map(), transit: [], lights: [], stops: [], cars: 0 };
const key = (a, b) => a * 100003 + b;
// semáforos: todos van a la vez. 0 verde, 1 ámbar, 2 rojo (para los coches)
export const lightState = t => { const p = t % 36; return p < 23 ? 0 : p < 26 ? 1 : 2; };

export function buildStreet(M, root, q) {
  const r = rng(4242), lit = mat('lit'), far = q === 1 ? .6 : q === 2 ? 1 : 1.5;
  const soft = (x, z, rad, kind, refs) => { const p = addProp(x, z, rad, kind); p.soft = true; p.inst = refs; return p; };
  const clear = (x, z, m) => !inBuilding(x, z) && !inWaterPoly(x, z) && roadNear(x, z, 9, true).d > (m === undefined ? .3 : m);

  // ---------- árboles: los del mapa y los de las manchas de bosque
  { const A = [], T = [], put = (x, z) => { (r() < .78 ? A : T).push([x, z, r() * 6.28, 0, .8 + r() * .55]); };
    // ninguno en la calzada, en un cruce, en mitad de un camino ni atravesando el tablero de un puente (el mapa trae algunos así, y las calles ya no miden lo que medían cuando se colocaron)
    let cutT = 0; const okTree = (x, z) => { if (roadNear(x, z, 9, true).d < .6 || roadNear(x, z, 9, false).d < .15 || nearJunc(x, z, .8)) return false; const dk = deckY(x, z); return dk < -1e8 || dk - gY(x, z) > 9; };
    for (let k = 0; k < (M.trees || []).length; k += 2) { if (okTree(M.trees[k], M.trees[k + 1])) put(M.trees[k], M.trees[k + 1]); else cutT++; } ST.treesCut = cutT;
    (M.green || []).forEach(a => { if (a.k !== 'wood') return; const b = bboxOf(a.p), n = Math.min(110, Math.floor((b[2] - b[0]) * (b[3] - b[1]) / 150)); for (let i = 0; i < n; i++) { const x = b[0] + r() * (b[2] - b[0]), z = b[1] + r() * (b[3] - b[1]); if (inPoly(a.p, x, z) && !inBuilding(x, z) && roadNear(x, z, 6, false).d > .8) put(x, z); } });
    const tv = new Vox(); tv.box(0, 0, 0, .34, 2.3, .34, 0x6a4a34); tv.box(0, 2.0, 0, 2.5, 1.5, 2.5, 0x4f8a45); tv.box(0, 3.3, 0, 1.8, 1.2, 1.8, 0x5fa052); tv.box(.5, 2.5, .4, 1.5, 1.3, 1.5, 0x437a3c);
    const tt = new Vox(); tt.box(0, 0, 0, .3, 2.6, .3, 0x5c4630); tt.box(0, 2.2, 0, 1.5, 2.2, 1.5, 0x3f7a40); tt.box(0, 4.2, 0, 1.15, 2.0, 1.15, 0x4b8a48); tt.box(0, 6.0, 0, .7, 1.3, .7, 0x58994f);
    instChunks(root, tv.geometry(), lit, A, { shadow: q > 1, far: 330 * far, ground: true }); instChunks(root, tt.geometry(), lit, T, { shadow: q > 1, far: 330 * far, ground: true });
    A.concat(T).forEach(t => addProp(t[0], t[1], .28 * t[4], 'tree')); ST.trees = A.length + T.length; }

  // ---------- farolas, alternando acera
  { const lamps = []; let total = 0; const ok = rd => { const sp = ROAD[rd.t]; return sp && sp[3] && rd.t !== 'service' && rd.t !== 'track' && rd.t.indexOf('_link') < 0 && !rd.u && !rd.pr; };
    M.roads.forEach(rd => { if (!ok(rd)) return; for (let k = 0; k + 3 < rd.p.length; k += 2) total += Math.hypot(rd.p[k + 2] - rd.p[k], rd.p[k + 3] - rd.p[k + 1]); });
    const gap = Math.max(32, total / (q === 1 ? 800 : 1500));
    M.roads.forEach((rd, ri) => { if (!ok(rd)) return; const off = rd.w / 2 + (rd.sw ? .32 : .9); let acc = 10 + (ri % 5) * 5, side = ri % 2 ? 1 : -1;
      for (let k = 0; k + 3 < rd.p.length; k += 2) { const dx = rd.p[k + 2] - rd.p[k], dz = rd.p[k + 3] - rd.p[k + 1], l = Math.hypot(dx, dz); if (l < .1) continue; const ux = dx / l, uz = dz / l; let s = acc;
        /* giro de la calle en los dos extremos de este tramo */ const tn = kk => { if (kk < 2 || kk + 3 >= rd.p.length) return 0; let d = Math.abs(Math.atan2(rd.p[kk + 2] - rd.p[kk], rd.p[kk + 3] - rd.p[kk + 1]) - Math.atan2(rd.p[kk] - rd.p[kk - 2], rd.p[kk + 1] - rd.p[kk - 1])); if (d > Math.PI) d = 2 * Math.PI - d; return d; }, t0 = tn(k), t1 = tn(k + 2);
        const bad = q => nearJunc(rd.p[k] + ux * q, rd.p[k + 1] + uz * q, 4.5) || (q < 6 && t0 > .4) || (l - q < 6 && t1 > .4);
        while (s < l) { /* en las esquinas de los cruces y en las curvas cerradas estorban al girar: la farola se corre unos metros calle adelante o atrás */ let s2 = s; if (bad(s)) { s2 = -1; for (const d of [7, -7, 13, -13]) { const q = s + d; if (q > 0 && q < l && !bad(q)) { s2 = q; break; } } }
          if (s2 >= 0) { const x = rd.p[k] + ux * s2 - uz * off * side, z = rd.p[k + 1] + uz * s2 + ux * off * side; if (!inBuilding(x, z) && (rd.b || !inWaterPoly(x, z)) && roadNear(x, z, 9, true).d > .2 && !collide(x, z, .3, true).hit) lamps.push([x, z, Math.atan2(ux * side, uz * side)]); } s += gap; side = -side; } acc = s - l; } });
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

  poiSigns(M, root, q, far); transit(M, root, q); landmarks(M, root, q);
}
export function tickStreet(t) { const s = lightState(t), m = W.mats; if (m.tlR && ST.ls !== s) { ST.ls = s; m.tlR.color.setHex(s === 2 ? 0xff3a2e : 0x3a1512); m.tlA.color.setHex(s === 1 ? 0xffb52e : 0x3a2a10); m.tlG.color.setHex(s === 0 ? 0x3cff6a : 0x103a1a); } }

// ---------- rótulos de comercios: el nombre sale del mapa (OpenStreetMap); el color, del tipo de comercio
export const CAT = {
  bar: ['#7a1f2b', 'Bar', '🍺'], cafe: ['#5a3a22', 'Cafetería', '☕'], rest: ['#8a2a1a', 'Restaurante', '🍽️'], fast: ['#c4302a', 'Comida rápida', '🍔'], super: ['#1f6f3a', 'Supermercado', '🛒'], bakery: ['#b8742a', 'Panadería', '🥖'], food: ['#3a7a3a', 'Alimentación', '🥬'],
  pharm: ['#1f8a4a', 'Farmacia', '💊'], bank: ['#1f3f7a', 'Banco', '🏧'], fuel: ['#c85a1a', 'Gasolinera', '⛽'], tobacco: ['#6a4a1a', 'Estanco', '📰'], lottery: ['#1a5a9a', 'Loterías', '🍀'], hair: ['#7a3a7a', 'Peluquería', '💈'], clothes: ['#2a2a2a', 'Tienda de ropa', '👕'],
  shop: ['#3a4a5a', 'Tienda', '🛍️'], garage: ['#4a4a4a', 'Taller', '🔧'], health: ['#2a7a8a', 'Salud', '🩺'], hotel: ['#3a2a5a', 'Alojamiento', '🛏️'], sport: ['#2a5a8a', 'Deporte', '🏋️'], police: ['#1a2a5a', 'Policía', '🚓'], town: ['#5a1a1a', 'Ayuntamiento', '🏛️'],
  civic: ['#4a3a2a', 'Servicio público', '🏛️'], lift: ['#3a5a7a', 'Ascensor público', '🛗'], fronton: ['#2a5a8a', 'Frontón', '🎾'], campo: ['#2a6a3a', 'Campo de fútbol', '⚽'], church: ['#4a4a3a', 'Iglesia', '⛪'], office: ['#3a3a3a', 'Oficina', '💼'], school: ['#2a4a3a', 'Centro escolar', '🏫']
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
  (M.green || []).forEach(g => { if (g.k !== 'pitch' || (g.s !== 'pelota' && g.s !== 'soccer')) return; const q = g.p, n = q.length / 2; let cx = 0, cz = 0, best = null; for (let k = 0; k < n; k++) { cx += q[k * 2]; cz += q[k * 2 + 1]; } cx /= n; cz /= n;
    for (let k = 0; k < n; k++) { const x = q[k * 2] + (cx - q[k * 2]) * .12, z = q[k * 2 + 1] + (cz - q[k * 2 + 1]) * .12, d = roadNear(x, z, 40, false).d; if (!inBuilding(x, z) && !inWaterPoly(x, z) && (!best || d < best[2])) best = [x, z, d]; }
    if (!best) return; const o = { x: best[0], z: best[1], ax: cx, az: cz, c: g.s === 'pelota' ? 'fronton' : 'campo', n: g.n || (g.s === 'pelota' ? 'Frontón' : 'Campo de fútbol'), yaw: 0, i: ST.pois.length, pitch: 1 }; ST.pois.push(o); const kk = key(Math.floor(o.x / 20), Math.floor(o.z / 20)); let l = ST.pgrid.get(kk); if (!l) ST.pgrid.set(kk, l = []); l.push(o); });
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

// ---------- metro y tren: un tótem en cada boca o estación. Sirven para moverse rápido por el pueblo.
function freeNear(x, z) { for (let rr = 0; rr < 30; rr += 2.5) for (let a = 0; a < 8; a++) { const px = x + Math.sin(a * .7854) * rr, pz = z + Math.cos(a * .7854) * rr; if (!inBuilding(px, pz) && !inWaterPoly(px, pz) && !collide(px, pz, .6, true).hit && roadNear(px, pz, 9, true).d > .6) return [px, pz]; if (!rr) break; } return null; }
function transit(M, root, q) {
  const met = [], trn = []; (M.transit || []).forEach(t => { const f = freeNear(t[0], t[1]); if (!f) return; const B = M.bbox; if (f[0] < B[0] + 6 || f[0] > B[2] - 6 || f[1] < B[1] + 6 || f[1] > B[3] - 6) return;
    const o = { x: f[0], z: f[1], k: t[2], n: (t[2] === 'metro' ? t[4] : t[3]) || (t[2] === 'metro' ? 'Metro' : 'Estación'), e: t[3] || '' }; ST.transit.push(o); (t[2] === 'metro' ? met : trn).push([f[0], f[1], 0]); });
  const mk = (txt, col) => { const v = new Vox(); v.box(0, 0, 0, .3, 3.6, .3, 0x3a3f46); v.box(0, 3.6, 0, 1.5, 1.5, .3, col); voxText(v, txt, 0, txt.length > 1 ? 4.12 : 3.86, .16, txt.length > 1 ? .055 : .14, .04, 0xffffff, { center: true }); v.at(0, 0, 0, Math.PI); voxText(v, txt, 0, txt.length > 1 ? 4.12 : 3.86, .16, txt.length > 1 ? .055 : .14, .04, 0xffffff, { center: true }); v.at(); return v.geometry(); };
  instChunks(root, mk('M', 0xd0322e), mat('lit'), met, { far: 500, shadow: q > 1 }); instChunks(root, mk('TREN', 0x6b2a8a), mat('lit'), trn, { far: 500, shadow: q > 1 }); ST.transit.forEach(o => addProp(o.x, o.z, .3, 'deco'));
}
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
