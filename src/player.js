// player.js: Ethan a pie
import { Ethan } from './ethan.js';
import { collide, inWaterPoly, clampWorld } from './world.js';
import { nearestEdge } from './graph.js';
import { roadW } from './world.js';
import { I } from './input.js';
import { G, dampAng } from './state.js';
import { clamp, damp } from './util.js';
import { T, standY, gY } from './terrain.js';

export const P = { x: 0, y: 0, z: 0, yaw: 0, v: 0, ethan: null, anim: null, lock: 0, grade: 0, scoot: false };
export function initPlayer(scene) { P.ethan = new Ethan({ mood: 3 }); P.ethan.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); scene.add(P.ethan.root); }
export const onBridge = (x, z) => { const ne = nearestEdge(x, z, false, 30); return ne.e >= 0 && ne.d < roadW(ne.road) / 2 + 2.2; };
export function updateFoot(dt, slow) {
  const cam = G.cam; let mx = I.mx, my = I.my; const mag = Math.min(1, Math.hypot(mx, my)); P.v = 0;
  if (mag > .12 && P.lock <= 0) {
    const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw); let dx = -s * my + c * mx, dz = -c * my - s * mx; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    P.yaw = dampAng(P.yaw, Math.atan2(dx, dz), 12, dt);
    // cuesta arriba se anda más despacio (y cuesta abajo, algo más ligero)
    let up = 0; if (T.on) { up = (gY(P.x + dx * 1.2, P.z + dz * 1.2) - gY(P.x - dx * .6, P.z - dz * .6)) / 1.8; P.grade = up; }
    const sp = (P.scoot ? P.scootV || 7 : I.run ? 6.6 : 3.4) * (mag < .5 ? .5 : 1) * (slow || 1) * (up > 0 ? Math.max(.5, 1 - up * 1.4) : Math.min(1.12, 1 - up * .4));
    const o = collide(P.x + dx * sp * dt, P.z + dz * sp * dt, .36, false, T.on ? P.y + .6 : undefined); let nx = o.x, nz = o.z;
    const cw = clampWorld(nx, nz, 4); if (cw) { nx = cw[0]; nz = cw[1]; }
    if (!inWaterPoly(nx, nz) || onBridge(nx, nz)) { P.v = Math.hypot(nx - P.x, nz - P.z) / dt; P.x = nx; P.z = nz; }
  }
  if (P.lock > 0) P.lock -= dt;
  const e = P.ethan; if (!P.anim) e.play(P.v > .3 && !P.scoot ? 'walk' : 'idle', { walkRate: P.v > 5 ? 12.5 : 8.2 });
  if (T.on) { const ty = standY(P.x, P.z, P.y + .7); P.y = Math.abs(ty - P.y) > 1.5 ? ty : damp(P.y, ty, 18, dt); }
  e.root.position.set(P.x, P.y + (P.scoot ? .16 : 0), P.z); e.root.rotation.y = P.yaw; e.update(dt);
}
