// Ethan life: Sestao. Arranque, bucle del juego, cámara, cielo y conducción.
import * as THREE from 'three';
import { G, dampAng, angDiff } from './state.js';
import { I, initInput, poll } from './input.js';
import { roadNear, W, extend, buildWorld, collide, inWaterPoly, wallBetween, roadW, knockProp, clampWorld, tickWorld, updateLods, tubeAt } from './world.js';
import { initSky, updateSky, tickSky, setFogBase, SKY } from './sky.js';
import { buildStreet, tickStreet, poiAt, transitAt, ST, CAT } from './street.js';
import { initTrains, updateTrains, trainHit, TRN } from './trains.js';
import { mat } from './vox.js';
import { GR, buildGraph, nearestEdge, nearestNode, route, routeTo, laneOffset } from './graph.js';
import { P, initPlayer, updateFoot, onBridge } from './player.js';
import { Car, TR, PK, updateTraffic, buildParked } from './car.js';
import { SP, placeSpots, updateSpots, spotAt, nearSpot } from './spots.js';
import { initHud, updateHud, toast, banner, setPrompt, hudKey, openMap, fade } from './hud.js';
import { newGame, loadGame, saveGame, tickLife, tickRadio, enterSpot, enterPoi, enterTransit, openPhone, money } from './life.js';
import { initPeds, updatePeds, PED } from './peds.js';
import { updateMission } from './missions.js';
import { tickDay, onLeaveCar, morning, resetDay, parkDbg, bigPark, carOK, offers } from './day.js';
import { initPark, anyFree, ZONE, parkState, tickMarks, marks } from './park.js';
import { initNet, tickNet, NET, titleNet } from './net.js';
import { FX, FXB } from './fx.js';
import { T, standY, gY, mY } from './terrain.js';
import { dress } from './cosmetics.js';
import { initAudio, sfx, engine, toggleMute, ambience, amb1 } from './audio.js';
import { tickExplore } from './explore.js';
import { clamp, damp } from './util.js';

const $ = id => document.getElementById(id), QS = { 1: { sh: 0, dpr: 1, px: 1.3e6, far: 480, fog: [110, 440], tr: 5, pd: 4 }, 2: { sh: 1024, dpr: 1.5, px: 3e6, far: 820, fog: [190, 740], tr: 9, pd: 7 }, 3: { sh: 2048, dpr: 2, px: 6.5e6, far: 1400, fog: [280, 1200], tr: 14, pd: 10 } };      // px: tope de píxeles dibujados (una ventana enorme o una pantalla 4K no se pintan enteras)
let renderer, scene, camera, sun, hemi, car, head, last = 0, t = 0, skyT = 0, gpsT = 0, safeT = 0, smokeT = 0, fineT = 0, edgeT = 0, lodT = 0, slowAcc = 0, scale = 1, autoQ = true, fAvg = .0167, adaptT = 0, upHold = 12, upT = 0, noUp = 0, stepD = 0, birdT = 6, lastHour = -1, waterNear = false, wetT = 0;
const ca = new THREE.Color(), cb = new THREE.Color(), safe = { x: 0, z: 0, yaw: 0 }, jam = { x: 0, z: 0, f: 0, b: 0 }, obs = [], ad = { ref: 0, bad: 0, q2: 0, slow: 0, off: false }, _sz = new THREE.Vector2();
// qué gráfica dibuja. Si no hay ninguna (lo hace el procesador) se arranca al mínimo y se avisa; con una integrada se ahorra el suavizado de bordes
function gpuName() { try { const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); if (!gl) return ''; const e = gl.getExtension('WEBGL_debug_renderer_info'), r = String((e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''), l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); return r; } catch (e) { return ''; } }

function boot() {
  const M = window.MAPDATA; if (!M) { $('t-load').textContent = 'Falta el mapa (map.js).'; return; }
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && (innerWidth < 1100 || (window.matchMedia && matchMedia('(pointer:coarse)').matches)));
  const gn = gpuName(), soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gn), weak = soft || (/intel|uhd graphics|hd graphics|mali|adreno|powervr|videocore/i.test(gn) && !/\barc\b/i.test(gn)); G.gpu = gn; G.soft = soft;
  // calidad: la elegida a mano en el móvil de Ethan o, en automático, la que mejor fue la última vez (la de versiones anteriores se olvida una vez)
  let q = soft ? 1 : 2, sc0 = soft ? .7 : 1; try { if (localStorage.getItem('els_qv') !== '2') { localStorage.removeItem('els_q'); localStorage.setItem('els_qv', '2'); } const s = +localStorage.getItem('els_q'); if (s >= 1 && s <= 3) { q = s; sc0 = 1; autoQ = false; } else { const a = (localStorage.getItem('els_ad') || '').split(','); if (+a[0] === 1 || +a[0] === 2) { q = +a[0]; sc0 = clamp(+a[1] || 1, .55, 1); ad.off = +a[2] > Date.now(); } } } catch (e) { }
  G.q = q; G.touch = mobile; if (mobile) document.documentElement.classList.add('touch'); try { G.cam.fp = localStorage.getItem('els_fp') === '1'; } catch (e) { }
  const cv = $('c'); try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile && !weak && (devicePixelRatio || 1) < 1.6, powerPreference: 'high-performance' }); } catch (e) { $('t-load').textContent = 'Este navegador no tiene WebGL, y sin 3D no hay Sestao.'; return; }
  renderer.shadowMap.type = THREE.PCFShadowMap; G.renderer = renderer;
  scene = G.scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9cdea); scene.fog = new THREE.Fog(0xa9cdea, 200, 800);
  camera = G.camera = new THREE.PerspectiveCamera(56, 1, .3, 1000);
  hemi = new THREE.HemisphereLight(0xdfeeff, 0x7a8468, 1.9); scene.add(hemi);
  sun = G.sun = new THREE.DirectionalLight(0xfff0d8, 2.7); sun.castShadow = true; const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 340; sun.shadow.bias = -.0006; sun.shadow.normalBias = .04; scene.add(sun, sun.target);
  initSky(scene, camera, sun, hemi, q);
  // mundo: mapa + ampliación inventada (polígono), calles, sitios y coches aparcados
  const tb0 = performance.now(); extend(M); scene.add(buildWorld(M, q)); G.worldMs = Math.round(performance.now() - tb0); buildGraph(M.roads); buildStreet(M, W.group, q); initTrains(M, W.group, { lit: mat('lit') }); placeSpots(scene, M); buildParked(W.group, M, (x, z) => nearSpot(x, z, 10), q); initPark(W.group);
  G.mapId = (M.src || '') + ':' + M.bbox.map(Math.round).join(',');
  G.fx = new FX(scene, 220); initPlayer(scene); car = G.car = new Car('c4'); scene.add(car.g); initPeds(scene, 12);
  head = new THREE.SpotLight(0xfff2cc, 0, 60, .6, .7, 1.5); head.position.set(0, .9, 1.6); head.target.position.set(0, 0, 14); car.g.add(head, head.target); head.visible = true;
  initHud(); initInput(cv); I.press = onKey; applyQuality(sc0); addEventListener('resize', resize); $('prompt').addEventListener('click', () => onKey($('prompt').dataset.k || 'KeyE'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); engine(false, 0, 0); } });
  // partida
  const saved = loadGame(); G.S = saved || newGame(); G.title = true; placeAll(!saved || saved.map !== G.mapId); dress(P.ethan, G.S.cq);
  $('t-load').textContent = saved ? 'Partida guardada: día ' + saved.day + '.' : 'WASD o la palanca para moverte. E o el botón A para todo lo demás.'; $('t-map').textContent = M.src === 'provisional' ? 'Mapa provisional, trazado a mano.' : (M.attribution || '');
  $('t-go').textContent = saved ? 'Continuar' : 'Jugar'; $('t-go').disabled = false; $('t-go').onclick = () => start(false); $('t-new').hidden = !saved; $('t-new').onclick = () => start(true);
  G.drone = setDrone; G.setDest = setDest; G.leaveCar = leaveCar; G.enterCar = enterCar; G.swapCar = id => { car.setModel(id); car.g.add(head, head.target); }; G.towCar = towCar; G.setQuality = n => { autoQ = !n; G.q = n || (G.soft ? 1 : 2); noUp = 0; upHold = 10; fAvg = .0167; ad.off = false; ad.ref = ad.bad = ad.q2 = ad.slow = 0; try { if (n) localStorage.setItem('els_q', n); else localStorage.removeItem('els_q'); localStorage.removeItem('els_ad'); } catch (e) { } applyQuality(); G.autoQ = autoQ; }; G.autoQ = autoQ; G.rscale = () => scale; G.adapt = adapt; G.adState = () => ad; G.restart = () => { G.S = newGame(); placeAll(true); dress(P.ethan, []); car.setModel('c4'); car.g.add(head, head.target); G.mission && G.endMission(false); intro(); };
  window.ELS = { roadNear, G, P, W, GR, SP, ST, TR, TRN, SKY, PED, PK, ZONE, NET, marks, tickMarks, parkState, DAY: { ps: parkDbg, bigPark, carOK, offers }, car, I, tick, renderer, scene, T, terr: { gY, mY, standY }, setFogBase, nav: { nearestNode, nearestEdge, route, routeTo, laneOffset } };
  updateSky(0, true); warm(); G.bootMs = Math.round(performance.now() - tb0); try { initNet(); titleNet(); } catch (e) { } requestAnimationFrame(frame);
}
function start(fresh) {
  initAudio(); if (fresh) { G.S = newGame(); placeAll(true); dress(P.ethan, []); car.setModel('c4'); car.g.add(head, head.target); }
  G.title = false; $('title').hidden = true; $('hud').hidden = false; if (G.soft && autoQ && !G.softTold) { G.softTold = 1; setTimeout(() => toast('Tu navegador está dibujando el 3D sin tarjeta gráfica (aceleración por hardware apagada), así que irá lento. Enciéndela en los ajustes del navegador y recarga.', '🐢'), 3000); } G.cam.yaw = P.yaw + Math.PI; G.cam.pitch = .34; if (fresh || G.S.day === 1 && G.S.hrs === 0 && !G.S.intro) intro(); else car.setModel(G.S.car), car.g.add(head, head.target);
}
function intro() { G.S.intro = 1; resetDay(); G.S.notes = [['👋', 'La vida de Ethan', '35 €, un C4 y turno en el taller del polígono. La agenda de arriba te dice qué toca; el GPS te lleva.']]; morning(); }
// coloca a Ethan y al coche: donde se guardó o, si es partida nueva, en el portal de casa
function placeAll(fresh) {
  const S = G.S, h = SP.by.home;
  if (!fresh && S.pos) { P.x = S.pos[0]; P.z = S.pos[1]; P.yaw = S.pos[2]; } else if (h) { P.x = h.x; P.z = h.z; P.yaw = h.yaw + Math.PI / 2; }
  if (!fresh && S.carPos) car.place(S.carPos[0], S.carPos[1], S.carPos[2]); else { const sl = anyFree(P.x, P.z, 185); if (sl) { car.place(sl.x, sl.z, sl.yaw); S.park = { k: 'ok', x: sl.x, z: sl.z }; } else parkNear(P.x, P.z); }
  P.y = standY(P.x, P.z); G.py = P.y; G.mode = 'foot'; P.ethan.root.visible = true; P.anim = null; G.px = P.x; G.pz = P.z; safe.x = car.x; safe.z = car.z; safe.yaw = car.yaw;
}
function parkNear(x, z) { const ne = nearestEdge(x, z, true, 120), py = standY(x, z) + .6; if (ne.e < 0) { car.place(x + 4, z, 0); return; } const a = GR.ea[ne.e], b = GR.eb[ne.e], dx = GR.x[b] - GR.x[a], dz = GR.z[b] - GR.z[a], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, off = roadW(ne.road) / 2 - 1.25; let side = (x - ne.x) * -uz + (z - ne.z) * ux > 0 ? 1 : -1;
  for (const s of [side, -side]) for (const d of [0, 7, -7, 14, -14]) { const cx = ne.x + ux * d - uz * off * s, cz = ne.z + uz * d + ux * off * s; if (!collide(cx, cz, 1.7, false, T.on ? py : undefined).hit) { car.place(cx, cz, Math.atan2(ux, uz) + (s > 0 ? Math.PI : 0)); return; } }
  car.place(ne.x, ne.z, Math.atan2(ux, uz)); }
function towCar() { parkNear(P.x, P.z); toast('La grúa te ha dejado el coche al lado.', '🚛'); }
// coche encajado (entre un coche aparcado y una pared, por ejemplo): se le deja en el carril de la calle más cercana
function unstick() { const ne = nearestEdge(car.x, car.z, true, 80, 1); if (ne.e < 0) { car.place(safe.x, safe.z, safe.yaw); return; } const e = ne.e, px = ne.x, pz = ne.z, a = GR.ea[e], b = GR.eb[e], dx = GR.x[b] - GR.x[a], dz = GR.z[b] - GR.z[a], l = Math.hypot(dx, dz) || 1, off = laneOffset(e, a); car.place(px - dz / l * off, pz + dx / l * off, Math.atan2(dx, dz)); }

function shadows(on) { renderer.shadowMap.enabled = on; sun.castShadow = on; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
function applyQuality(sc) {
  const q = QS[G.q]; if (q.sh && sun.shadow.mapSize.x !== q.sh) { sun.shadow.mapSize.set(q.sh, q.sh); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } shadows(!!q.sh);
  camera.far = q.far; setFogBase(q.fog[0], q.fog[1]); TR.cap = TR.max = q.tr; PED.cap = PED.max = q.pd; scale = sc || 1; resize();
}
function resize() {
  const w = innerWidth, h = innerHeight, q = QS[G.q], pr = Math.min(devicePixelRatio || 1, q.dpr, Math.sqrt(q.px / Math.max(1, w * h))) * scale;
  if (Math.abs(pr - renderer.getPixelRatio()) > .002) renderer.setPixelRatio(pr); renderer.getSize(_sz); if (_sz.x !== w || _sz.y !== h) renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix(); if (G.S) { try { renderer.render(scene, camera); } catch (e) { } }   // se redibuja en el acto: cambiar el tamaño vacía el lienzo
}
// calentamiento: se compilan todos los materiales (también la variante contraria de sombras, por si la calidad cambia sola) y se sube toda la
// geometría a la gráfica dibujando una vez el pueblo entero en una esquina de 8 píxeles. Así no hay parones la primera vez que un barrio entra en pantalla
function warm() {
  const t0 = performance.now(), hid = [], cul = [], sh = renderer.shadowMap.enabled;
  try {
    scene.traverse(o => { if (!o.visible) { hid.push(o); o.visible = true; } if (o.frustumCulled) { cul.push(o); o.frustumCulled = false; } });
    renderer.setScissorTest(true); renderer.setScissor(0, 0, 8, 8); renderer.setViewport(0, 0, 8, 8); renderer.compile(scene, camera); renderer.render(scene, camera);
    if (autoQ) { shadows(!sh); renderer.compile(scene, camera); renderer.render(scene, camera); shadows(sh); }
  } catch (e) { G.warmErr = String(e); }
  hid.forEach(o => { o.visible = false; }); cul.forEach(o => { o.frustumCulled = true; });
  try { renderer.setScissorTest(false); renderer.getSize(_sz); renderer.setViewport(0, 0, _sz.x, _sz.y); renderer.setScissor(0, 0, _sz.x, _sz.y); } catch (e) { } G.warmMs = Math.round(performance.now() - t0);
}

// ---------- teclas y acciones
function onKey(k) {
  if (G.title) { if (k === 'Enter' || k === 'Space') start(false); return; }
  if (G.mgPress) { if (G.mgKey && G.mgKey(k)) return; if (k === 'Space' || k === 'Enter' || k === 'KeyE') G.mgPress(); return; }
  if (G.dr) { if (k === 'KeyF') G.dr.ty = (G.dr.ty || G.dr.y) - 14; else if (k === 'KeyE' || k === 'Escape' || k === 'KeyT' || k === 'KeyG' || k === 'Enter') setDrone(false); return; }
  if (hudKey(k) || G.busy) return;
  if (k === 'KeyR') G.setSpeed(SPEEDS[(SPEEDS.indexOf(G.speed || 1) + 1) % SPEEDS.length]); else if (k === 'KeyE') action(); else if (k === 'KeyF' || k === 'Enter') G.mode === 'car' ? leaveCar() : enterCar(); else if (k === 'KeyT' || k === 'Escape' || k === 'KeyP') openPhone(); else if (k === 'KeyM') openMap(); else if (k === 'KeyN') toast(toggleMute() ? 'Sonido apagado' : 'Sonido encendido', '🔊'); else if (k === 'KeyH' && G.mode === 'car') sfx('horn'); else if (k === 'KeyG') setDrone(true); else if (k === 'KeyV' || k === 'KeyC') { const c = G.cam; c.fp = !c.fp; c.look = 0; c.fpP = 0; c.manual = 0; try { localStorage.setItem('els_fp', c.fp ? '1' : '0'); } catch (e) { } toast(c.fp ? 'Vista en primera persona.' : 'Vista en tercera persona.', '👁️'); }
}
// cámara rápida (R o el botón ⏩): ×1, ×2, ×4, ×8. Vuelve sola a ×1 cuando pasa algo (un aviso, un hueco para aparcar, un encargo)
const SPEEDS = [1, 2, 4, 8];
G.setSpeed = (n, quiet) => { n = SPEEDS.includes(n) ? n : 1; if ((G.speed || 1) === n) return; G.speed = n; const b = $('ff'); if (b) { b.textContent = n > 1 ? '×' + n : '⏩'; b.classList.toggle('on', n > 1); } if (!quiet) toast(n > 1 ? 'Cámara rápida ×' + n + ' (R para cambiar)' : 'Velocidad normal', n > 1 ? '⏩' : '▶️'); };
G.slow = () => { if ((G.speed || 1) > 1) G.setSpeed(1); };
const carDist = () => Math.hypot(car.x - P.x, car.z - P.z);
function action() {
  const s = spotAt(G.px, G.pz, G.mode === 'car'); if (s) { if (G.mode === 'car' && Math.abs(car.vf) > 3) { toast('Para el coche primero.', '🛑'); return; } car.vx = car.vz = 0; enterSpot(s); return; }
  if (G.mode === 'foot') { const p = poiAt(P.x, P.z); if (p) { enterPoi(p); return; } const tr = transitAt(P.x, P.z); if (tr) { enterTransit(tr); return; } if (carDist() < 3.8) enterCar(); }
}
function enterCar(force) { if (G.mode === 'car' || (!force && carDist() > 3.8)) return; G.mode = 'car'; P.ethan.root.visible = false; sfx('door'); G.cam.manual = 0; }
function leaveCar(force) {
  if (G.mode !== 'car') return; if (!force && Math.abs(car.vf) > 2.5) { toast('Para el coche antes de bajarte.', '🛑'); return; }
  const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw); let ok = false;
  for (const s of [1, -1]) { const x = car.x + cy * s * 1.6, z = car.z - sy * s * 1.6; if (!collide(x, z, .42, false, car.y + .6).hit && (!inWaterPoly(x, z) || onBridge(x, z))) { P.x = x; P.z = z; ok = true; break; } }
  if (!ok) { P.x = car.x - sy * 3.2; P.z = car.z - cy * 3.2; }
  P.y = standY(P.x, P.z, car.y + .7); G.mode = 'foot'; P.yaw = car.yaw; P.ethan.root.visible = true; car.vx = car.vz = car.vf = 0; sfx('door'); if (!force) onLeaveCar();
}
function setDest(d) { G.dest = d; G.path = null; G.pathEnd = null; gpsT = 0; }
function updateGps(dt) {
  if (!G.dest) { G.path = null; return; } if ((gpsT -= dt) > 0) return; gpsT = 1.4;
  const foot = G.mode === 'foot', r = routeTo(G.px, G.pz, G.dest.x, G.dest.z, foot, G.dest.in) || (foot ? null : routeTo(G.px, G.pz, G.dest.x, G.dest.z, true)); G.path = r ? r.nodes : null; G.pathEnd = r ? r.end : null;
  if (!G.mission && Math.hypot(G.dest.x - G.px, G.dest.z - G.pz) < 14) { toast('Has llegado: ' + G.dest.n + '.', '📍'); setDest(null); }
}

// ---------- conducción
function knock() { const p = car.hitProp; if (!p) return; car.hitProp = null; if (knockProp(p)) { sfx('crash'); G.fx.sparks(p.x, 1.2, p.z, 16); G.fx.puff(p.x, .4, p.z, 0x9aa0a8, 6); G.S.dmg = Math.min(100, G.S.dmg + 2); G.cam.shake = Math.max(G.cam.shake, .25); G.S.stats.lamps = (G.S.stats.lamps || 0) + 1; } }
function crash(imp, x, z) { const S = G.S; S.dmg = Math.min(100, S.dmg + (imp - 2.5) * 1.5); G.cam.shake = Math.min(.7, imp / 16); sfx('crash'); G.fx.sparks(x, .7, z, Math.min(18, 4 + imp)); if (S.dmg >= 100 && !S.warn.d) { S.warn.d = 1; toast('El coche ha dicho basta. Llama a la grúa o empuja hasta el taller.', '💥'); } }
function drive(dt) {
  const S = G.S, lock = G.lock; let imp = car.update(dt, lock ? 0 : I.my, lock ? 0 : I.mx, I.hb || lock, S); const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw); knock();
  for (const c of TR.list) { if (Math.abs(c.y - car.y) > 2.4) continue; const L = c.info.L > 5 ? [-2.5, 0, 2.5] : [0], s2 = Math.sin(c.yaw), c2 = Math.cos(c.yaw); for (const o of L) { const i2 = car.bump(c.x + s2 * o, c.z + c2 * o, 1.15); if (i2 > 0) { c.bumpT = 1.8; if (i2 > 3 && !c.honk) { c.honk = 1; sfx('horn'); if (Math.random() < .5) toast(['«¡Mira por dónde vas!»', '«¿Te han dado el carnet en una tómbola?»', '«¡Que es de mi cuñado!»'][Math.floor(Math.random() * 3)], '🚗'); } imp = Math.max(imp, i2); } } }
  { const ti = trainHit(car, null); if (ti > 0) { imp = Math.max(imp, ti); if (ti > 6 && !G.S.warn.tr) { G.S.warn.tr = 1; toast('El tren no frena por nadie.', '🚆'); setTimeout(() => { G.S.warn.tr = 0; }, 9000); } } }
  if (imp > 2.5) crash(imp, car.x + sy * 1.8, car.z + cy * 1.8);
  if (S.dmg < 100) S.warn.d = 0;
  S.fuel = Math.max(0, S.fuel - car.dist / 250 * (1 + Math.max(0, (car.grade || 0) * (car.vf >= 0 ? 1 : -1)) * 6)); S.stats.km += car.dist / 1000;      // cuesta arriba gasta más
  if (S.fuel <= 0 && !S.warn.nf) { S.warn.nf = 1; toast('Sin gasolina. Llama a la grúa desde el móvil.', '⛽'); } else if (S.fuel > 0) S.warn.nf = 0;
  if (inWaterPoly(car.x, car.z) && !onBridge(car.x, car.z)) { sfx('splash'); G.fx.drops(car.x, .5, car.z, 30); car.place(safe.x, safe.z, safe.yaw); S.dmg = Math.min(100, S.dmg + 14); money(-Math.min(S.money, 20), 'rescate de la ría'); banner('¡Al agua!', 'La ría no perdona. La grúa te deja donde estabas.'); }
  // el borde del mapa hace de bordillo: quita solo la velocidad hacia fuera, así se puede seguir pegado a él o dar la vuelta sin quedarse clavado
  edgeT -= dt; const cw = clampWorld(car.x, car.z, 4); if (cw) { const nx = cw[0] - car.x, nz = cw[1] - car.z, nl = Math.hypot(nx, nz); if (nl > 1e-4) { const vn = (car.vx * nx + car.vz * nz) / nl; if (vn < 0) { car.vx -= vn * nx / nl; car.vz -= vn * nz / nl; } } car.x = cw[0]; car.z = cw[1]; if (edgeT < 0 && nl > .05) { edgeT = 6; toast('Hasta aquí llega el mapa. Media vuelta.', '🚧'); } }
  if ((safeT -= dt) < 0) { safeT = .8; if (car.onRoad && !inWaterPoly(car.x, car.z) && Math.abs(car.vf) > 1) { safe.x = car.x; safe.z = car.z; safe.yaw = car.yaw; } }
  // si se ha probado hacia delante y hacia atrás y el coche no se mueve del sitio, está encajado: se le saca a la calle
  if (Math.hypot(car.x - jam.x, car.z - jam.z) > 1) { jam.x = car.x; jam.z = car.z; jam.f = jam.b = 0; }
  else if (!lock && !I.hb && S.fuel > 0 && S.dmg < 100 && Math.abs(car.vf) < .6) { if (I.my > .5) jam.f += dt; else if (I.my < -.5) jam.b += dt; if (jam.f > 1.5 && jam.b > 1.5) { jam.f = jam.b = 0; unstick(); toast('El coche estaba encajado. Lo sacas a empujones hasta la calle.', '💪'); } }
  if (S.dmg > 55 && (smokeT -= dt) < 0) { smokeT = S.dmg > 85 ? .08 : .2; G.fx.smoke(car.x + sy * 1.6, 1, car.z + cy * 1.6, 1, S.dmg > 85 ? 0x26262c : 0xb9bcb4, 1.2); }
  if (S.day > S.itv && !S.daily.fine && Math.abs(car.vf) > 4 && (fineT += dt) > 45) { fineT = 0; S.daily.fine = 1; money(-Math.min(S.money, 30), 'multa por ir sin ITV'); }
  P.x = car.x; P.z = car.z; G.px = car.x; G.pz = car.z;
}
function footExtras() { // a pie: no atravesar el coche propio ni el tráfico
  const c = car._c || (car._c = []), r = car.circles(c) + .36; if (Math.abs(car.y - P.y) < 2.4) for (let k = 0; k < 6; k += 2) { const dx = P.x - c[k], dz = P.z - c[k + 1], d = Math.hypot(dx, dz); if (d < r && d > .001) { P.x += dx / d * (r - d); P.z += dz / d * (r - d); } }
  for (const o of TR.list) { if (Math.abs(o.y - P.y) > 2.4) continue; const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz); if (d < 1.6 && d > .001) { P.x += dx / d * (1.6 - d); P.z += dz / d * (1.6 - d); } }
  trainHit(null, P); G.px = P.x; G.pz = P.z;
}

// ---------- cámara: tercera persona (por defecto) o primera (tecla V)
function updateCamera(dt) {
  const c = G.cam, by = G.py || 0; let tx, tz, ty = 1.55 + by, want;
  if (G.fly) { const f = G.fly; const fb = f[6] ? gY(f[3], f[4]) : 0; camera.position.set(f[0], f[1] + fb, f[2]); camera.lookAt(f[3], (f[5] || 0) + fb, f[4]); I.camX = I.camY = I.zoom = 0; return; }      // cámara fija (pruebas y fotos)
  if (G.dr) { P.ethan.root.visible = G.mode === 'foot'; car.body.visible = true; car.rig.visible = false; flyDrone(dt); return; }
  const fp = c.fp && !G.title && !P.anim, fpCar = fp && G.mode === 'car'; P.ethan.root.visible = G.mode === 'foot' && !fp; car.body.visible = !fpCar; car.rig.visible = fpCar;
  if (fp) { // desde los ojos de Ethan o desde el asiento del coche
    const inCar = G.mode === 'car'; if (I.camX || I.camY) { c.look = clamp((c.look || 0) - I.camX * .0055, inCar ? -2.2 : -1e9, inCar ? 2.2 : 1e9); c.fpP = clamp((c.fpP || 0) + I.camY * .004, -.9, .9); c.manual = 2.2; if (!inCar) { c.yaw -= I.camX * .0055; c.look = 0; } }
    if (c.manual < 1e8) c.manual -= dt; I.camX = I.camY = I.zoom = 0; let ex, ey, ez;
    if (inCar) { if (c.manual <= 0) { c.look = damp(c.look || 0, 0, 3, dt); c.fpP = damp(c.fpP || 0, .05, 3, dt); } c.yaw = car.yaw + Math.PI + (c.look || 0); const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw), e = car.eye; ex = car.x + sy * e[2] + cy * e[0]; ey = e[1] + car.y - Math.sin(car.pitch) * e[2]; ez = car.z + cy * e[2] - sy * e[0]; }
    else { ex = P.x; ey = 1.6 + P.y; ez = P.z; if (P.v < .3 && !G.busy) P.yaw = c.yaw + Math.PI; }
    let sx = 0, sy2 = 0; if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt * 1.8); sx = (Math.random() - .5) * c.shake * .5; sy2 = (Math.random() - .5) * c.shake * .5; }
    const p = (c.fpP || 0) + (inCar ? car.pitch * Math.cos(c.look || 0) - car.roll * Math.sin(c.look || 0) : 0), cp = Math.cos(p); camera.position.set(ex + sx, ey + sy2, ez); camera.lookAt(ex - Math.sin(c.yaw) * cp, ey - Math.sin(p), ez - Math.cos(c.yaw) * cp); c.dist = .1;
    const fov = clamp(64 + (1.3 - camera.aspect) * 22, 64, 84) + (inCar ? Math.min(10, Math.abs(car.vf) * .28) : 0); if (Math.abs(camera.fov - fov) > .2) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); } return; }
  if (G.title) { const h = SP.by.home || { x: 0, z: 0 }; c.yaw += dt * .06; tx = h.x; tz = h.z; ty = 8 + gY(h.x, h.z); want = 85; c.pitch = .5; }
  else {
    if (I.camX || I.camY) { c.yaw -= I.camX * .0055; c.pitch = clamp(c.pitch + I.camY * .004, .05, 1.3); if (c.manual < 1e8) c.manual = 1.8; }
    if (I.zoom) c.zoomK = clamp((c.zoomK || 1) + I.zoom * .12, .6, 2.2);
    if (c.manual < 1e8) c.manual -= dt;
    if (G.mode === 'car') { tx = car.x; tz = car.z; ty = 1.5 + by; want = (8 + Math.abs(car.vf) * .1) * (c.zoomK || 1); if (c.manual <= 0) { c.yaw = dampAng(c.yaw, car.yaw + Math.PI + (car.vf < -1.5 ? Math.PI : 0), 3.4, dt); c.pitch = damp(c.pitch, .27, 2, dt); } }
    else { tx = P.x; tz = P.z; want = 6.2 * (c.zoomK || 1); if (c.manual <= 0 && P.v > .6 && !G.busy) { const d = angDiff(c.yaw, P.yaw + Math.PI); if (Math.abs(d) < 2.3) c.yaw += d * (1 - Math.exp(-1.15 * dt)); } }
  }
  I.camX = I.camY = I.zoom = 0;
  const cp = Math.cos(c.pitch), dx = Math.sin(c.yaw) * cp, dy = Math.sin(c.pitch), dz = Math.cos(c.yaw) * cp;
  let lift = 0; if (!G.title) { const f = wallBetween(tx, tz, tx + dx * want, tz + dz * want, ty + dy * want * .5); if (f < 1) { want = Math.max(1.6, want * f - .4); lift = Math.max(0, 3.2 - want) * .45; }
    const th = tubeAt(tx, tz) || tubeAt(tx + dx * want, tz + dz * want); if (th && dy > .01) { want = Math.min(want, Math.max(1.8, (th - .8 - (ty - by)) / dy)); lift = 0; } }      // bajo un edificio la cámara no sube por encima del techo
  c.dist = want < c.dist ? want : damp(c.dist, want, 4, dt);
  let sx = 0, syk = 0; if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt * 1.8); sx = (Math.random() - .5) * c.shake; syk = (Math.random() - .5) * c.shake; }
  const up = c.lift || 0; let cx = tx + dx * c.dist + sx, cyy = ty + dy * c.dist + syk + lift, cz = tz + dz * c.dist;
  if (T.on) { // el terreno no tapa a Ethan ni se come la cámara: si la ladera se mete por medio, la cámara sube
    let need = 0; for (let k = 1; k <= 4; k++) { const f = k / 4, gx = tx + (cx - tx) * f, gz = tz + (cz - tz) * f, g = Math.max(mY(gx, gz), gY(gx, gz)) + (k === 4 ? .7 : .35), ly = ty + (cyy - ty) * f; if (g > ly) need = Math.max(need, (g - ly) / f); }
    c.hill = need > (c.hill || 0) ? need : damp(c.hill || 0, need, 3, dt); cyy += c.hill; } else cyy = Math.max(.5, cyy);
  camera.position.set(cx, cyy, cz); camera.lookAt(tx, ty + .25 - up, tz);   // lift: baja el encuadre cuando hay un panel abajo
  const fov = clamp(56 + (1.3 - camera.aspect) * 26, 56, 80) + (G.mode === 'car' ? Math.min(12, Math.abs(car.vf) * .3) : 0); if (Math.abs(camera.fov - fov) > .2) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }   // en vertical se abre el campo de visión
}
// pasos, pájaros, gaviotas cerca de la ría, el tren que arranca y las campanadas
function sounds(dt) {
  if (G.mode === 'foot' && P.v > .5) { stepD += P.v * dt; if (stepD > (P.v > 5 ? 1.25 : .78)) { stepD = 0; amb1('step'); } }
  if ((wetT -= dt) < 0) { wetT = 3; waterNear = false; for (let a = 0; a < 8 && !waterNear; a++) if (inWaterPoly(G.px + Math.sin(a * .7854) * 70, G.pz + Math.cos(a * .7854) * 70)) waterNear = true; }
  if ((birdT -= dt) < 0) { birdT = 7 + Math.random() * 16; if (G.night < .4 && SKY.rain < .3 && G.mode === 'foot') amb1(waterNear && Math.random() < .6 ? 'gull' : 'bird'); }
  if (TRN.horn) { TRN.horn = 0; if (TRN.near < 260) amb1('trainhorn'); }
  const h = Math.floor(G.S.min / 60); if (h !== lastHour) { if (lastHour >= 0 && h >= 8 && h <= 22 && (G.speed || 1) <= 1) { let bd = 1e9; for (const t of W.towers) bd = Math.min(bd, Math.hypot(t[0] - G.px, t[1] - G.pz)); const v = (1 - bd / 520) * (G.mode === 'car' ? .45 : 1); if (v > .05) amb1('bell', { n: h % 12 || 12, v }); } lastHour = h; }      // las horas del campanario más cercano
}
// dron: cámara libre para ver el pueblo desde arriba. El juego queda en pausa mientras tanto.
function setDrone(on) {
  if (on === !!G.dr) return; const q = QS[G.q];
  if (on) { G.dr = { x: G.px, y: 55 + (G.py || 0), z: G.pz, yaw: G.cam.yaw + Math.PI, p: .55 }; G.busy = true; camera.far = q.far * 2; setFogBase(q.fog[0] * 2.2, q.fog[1] * 2); document.documentElement.classList.add('drone'); toast(G.touch ? 'Dron: palanca para volar y arrastra para mirar. «Subir» y ⬇ cambian la altura. Toca A para volver.' : 'Dron: WASD para volar, arrastra para mirar, Espacio sube, F baja, Mayús corre. E o Esc para volver.', '🛸'); }
  else { G.dr = null; G.busy = false; G.px = G.mode === 'car' ? car.x : P.x; G.pz = G.mode === 'car' ? car.z : P.z; camera.far = q.far; setFogBase(q.fog[0], q.fog[1]); document.documentElement.classList.remove('drone'); G.cam.manual = 0; }
  camera.updateProjectionMatrix(); updateSky(0, false);
}
function flyDrone(dt) {
  const d = G.dr; d.yaw -= I.camX * .005; d.p = clamp(d.p + I.camY * .004, -.3, 1.45); I.camX = I.camY = I.zoom = 0;
  const up = I.hb || (G.touch && I.btn.run), sp = (I.run && !G.touch ? 80 : 28) * (.5 + Math.max(6, d.y - Math.max(0, gY(d.x, d.z))) / 90), cp = Math.cos(d.p), fx = Math.sin(d.yaw) * cp, fy = -Math.sin(d.p), fz = Math.cos(d.yaw) * cp, hx = Math.sin(d.yaw), hz = Math.cos(d.yaw), rx = -hz, rz = hx;
  d.x += (hx * I.my + rx * I.mx) * sp * dt; d.z += (hz * I.my + rz * I.mx) * sp * dt; if (up) d.ty = (d.ty || d.y) + 38 * dt; { const g = Math.max(0, mY(d.x, d.z), gY(d.x, d.z)) + 6; if (d.ty !== undefined) { d.ty = clamp(d.ty, g, 520); d.y = damp(d.y, d.ty, 5, dt); } if (d.y < g) { d.y = g; if (d.ty !== undefined && d.ty < g) d.ty = g; } } const B = W.bounds; d.x = clamp(d.x, B[0] - 300, B[2] + 300); d.z = clamp(d.z, B[1] - 300, B[3] + 300);
  camera.position.set(d.x, d.y, d.z); camera.lookAt(d.x + fx, d.y + fy, d.z + fz); G.px = d.x; G.pz = d.z; if (Math.abs(camera.fov - 60) > .2) { camera.fov = 60; camera.updateProjectionMatrix(); }
}
function lights() { const on = G.night > .35 && G.mode === 'car'; head.intensity = on ? 420 : 0; }

// ---------- bucle
function tick(dt) { // un paso de juego, sin dibujar
  poll();
  if (!G.title && !G.busy) {
    if (G.mode === 'car') { drive(dt); P.y = car.y; } else { updateFoot(dt, G.S.energy < 8 ? .6 : 1); footExtras(); }
    G.py = FXB.y = G.mode === 'car' ? car.y : P.y;
    obs.length = 0; if (G.mode === 'foot') obs.push(P.x, P.z, .5, P.y); obs.push(car.x, car.z, 1.5, car.y); updateTrains(dt, G.px, G.pz, obs); updateTraffic(dt, scene, G.px, G.pz, obs, t);
    { const said = updatePeds(dt, G.px, G.pz, G.mode === 'car' ? car : null, G.mode === 'foot' ? P : null); if (said) { toast(said, '🚶'); sfx('horn'); } }
    tickLife(dt); tickRadio(dt); updateMission(dt); tickDay(dt); updateGps(dt); tickExplore(dt); sounds(dt);
    const s = spotAt(G.px, G.pz, G.mode === 'car'), foot = G.mode === 'foot', p = !s && foot ? poiAt(P.x, P.z) : null, tr = !s && !p && foot ? transitAt(P.x, P.z) : null;
    if (s) setPrompt('E', s.icon + ' ' + s.n); else if (p) setPrompt('E', (CAT[p.c] || CAT.shop)[2] + ' ' + p.n); else if (tr) setPrompt('E', (tr.k === 'metro' ? '🚇 Metro · ' : '🚆 Tren · ') + tr.n); else if (foot && carDist() < 3.8) setPrompt('F', '🚗 Subir al coche'); else setPrompt();
  } else { if (G.mgTick) G.mgTick(dt); if (!G.dr && G.mode === 'foot') { P.y = standY(P.x, P.z, P.y + .7); G.py = FXB.y = P.y; } P.ethan.root.position.set(P.x, P.y, P.z); P.ethan.root.rotation.y = P.yaw; P.ethan.update(dt); setPrompt(); }
  engine(G.mode === 'car' && !G.title && !G.busy, car.vf, I.my); ambience({ on: !G.title, day: 1 - G.night, rain: SKY.rain, train: TRN.near, trainV: TRN.v, inCar: G.mode === 'car' });
  updateSpots(dt, t, G.px, G.pz); updateCamera(dt); if ((skyT -= dt) < 0) { updateSky(.4 + skyT); skyT = .4; lights(); const quiet = G.night > .7 ? .4 : SKY.rain > .4 ? .7 : 1; TR.max = TR.cap ? Math.max(2, Math.round(TR.cap * quiet)) : 0; PED.max = PED.cap ? Math.max(1, Math.round(PED.cap * quiet * (SKY.rain > .4 ? .6 : 1))) : 0; /* de noche y con lluvia hay menos gente */ } tickSky(dt); G.fx.update(dt); updateHud(dt);
  tickWorld(dt); tickStreet(t, camera, scene.fog && scene.fog.color); if ((lodT -= dt) < 0) { lodT = .5; updateLods(camera.position.x, camera.position.z); }
}
// ritmo: media móvil del tiempo por fotograma. Si no llega a unos 42 por segundo baja la resolución y, si ni así, la calidad;
// si luego va sobrado, lo recupera poco a poco. Si recortar no sirve de nada (el freno no es la gráfica: pantalla a 30 Hz, ahorro de energía…)
// deja de recortar y vuelve a lo de antes. Solo con la calidad en automático; lo que mejor fue se guarda para la próxima vez
function saveAd() { try { localStorage.setItem('els_ad', G.q + ',' + scale.toFixed(2) + ',' + (ad.off ? Date.now() + 864e5 : 0)); } catch (e) { } }
function adapt(raw) {
  const smp = Math.min(raw, .1); fAvg += (smp - fAvg) * Math.min(1, smp * 1.5); G.fps = fAvg > 0 ? 1 / fAvg : 0;
  if (!autoQ || ad.off || G.title || G.busy) return; adaptT += raw; upHold -= raw; if (adaptT <= 1.1) return; adaptT = 0;
  if (fAvg > .0238) { if (++ad.slow < 2) return; ad.slow = 0;      /* dos miradas seguidas yendo lento: un tirón suelto no cuenta */
    ad.bad = ad.ref && fAvg > ad.ref * .93 ? ad.bad + 1 : 0; ad.ref = fAvg;      /* ¿sirvió de algo el recorte anterior? */
    if (ad.bad >= 2 || scale <= .56) {
      if (G.q > 1) { ad.q2 = fAvg; G.q = 1; applyQuality(ad.bad >= 2 ? 1 : .75); ad.ref = 0; ad.bad = 0; }
      else if (ad.bad >= 2) { ad.off = true; if (ad.q2 && fAvg > ad.q2 * .85 && fAvg < .06) G.q = 2; applyQuality(1); } }      /* nada lo arregla: si aun así va pasable (30 por segundo clavados) se vuelve a la calidad media; si va a rastras, se queda en la baja */
    else { scale = Math.max(.55, scale * .84); resize(); }
    if (upT && upHold > -14) noUp++; upHold = 25 + noUp * 60; upT = 0; fAvg = .0167; saveAd();
  } else { ad.slow = 0; ad.ref = 0; ad.bad = 0;
    if (fAvg < .0176 && upHold <= 0 && noUp < 3) { if (scale < 1) { scale = Math.min(1, scale * 1.12); resize(); upHold = 18; upT = 1; saveAd(); } else if (G.q < 2 && !G.soft) { G.q = 2; applyQuality(.75); upHold = 18; upT = 1; fAvg = .0167; saveAd(); } } }
}
function frame(now) {
  requestAnimationFrame(frame); const raw = Math.min(.25, (now - last) / 1000 || 0), dt = Math.min(.05, raw); last = now; if (document.hidden) return; t += dt; G.now = t;
  try { const k = G.busy || G.title || G.dr ? 1 : G.speed || 1; if (k === 1) tick(dt); else { let rem = dt * k; while (rem > 1e-4) { const s = Math.min(rem, .034); tick(s); rem -= s; } }      /* cámara rápida: el mundo entero va k veces más deprisa, en pasos cortos */
    try { tickNet(dt); } catch (e) { } tickMarks(dt); renderer.render(scene, camera); } catch (e) { if (!G.err) { G.err = e; console.error('[sestao]', e); } }
  adapt(raw);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
