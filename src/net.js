// net.js: Sestao online. Quien tenga el juego abierto a la vez ve a los demás por el pueblo: su Ethan (o su coche) con su apodo,
// en el minimapa y en el mapa. Va por la sala en vivo de la página (room): solo viaja dónde está cada uno, y no se guarda nada.
// Cada cual vive su propio día (su reloj, sus planes, sus huecos para aparcar): lo que se comparte es el pueblo.
// Fuera de claude.ai (GitHub Pages) va por P2P (p2p.js): se conecta solo al empezar a jugar con el online elegido, y se desconecta al apagarlo.
// Si no hay ni una cosa ni otra, el juego sigue igual, sin online.
import { G, dampAng } from './state.js';
import { Ethan } from './ethan.js';
import { carMesh } from './props.js';
import { CARS } from './car.js';
import { standY, T } from './terrain.js';
import { P } from './player.js';
import { toast, dialog, closeDialog } from './hud.js';
import * as THREE from 'three';
import { p2pRoom } from './p2p.js';

export const NET = { room: null, ok: false, conn: false, on: true, tried: false, nick: '', peers: new Map(), sendT: 0, last: '', sent: false, max: 12 };
const TEES = [0xff5ca0, 0x3ce6d2, 0xff8a3c, 0xa855f7, 0xc8dc4a, 0x2f8fff, 0xe0483c, 0xf2efe6];
const clean = s => String(s == null ? '' : s).replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
const num = v => typeof v === 'number' && isFinite(v), v3 = new THREE.Vector3();
const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

export function initNet() {
  if (NET.tried) return; NET.tried = true;
  try { NET.nick = clean(localStorage.getItem('els_nick')); NET.on = localStorage.getItem('els_net') !== '0'; } catch (e) { }
  if (!NET.nick) NET.nick = 'Ethan ' + (10 + Math.floor(Math.random() * 90));
  const c = window.claude, fin = () => { NET.done = true; if (NET.paint) NET.paint(); };
  if (!c || typeof c.use !== 'function') {
    // P2P solo con la página abierta por sí misma (GitHub Pages…), no metida en otra: ahí suele haber reglas que cortan las conexiones de fuera
    let top = true; try { top = window.top === window.self; } catch (e) { top = false; }
    if (top && typeof RTCPeerConnection === 'function' && typeof WebSocket === 'function' && typeof crypto === 'object' && crypto.subtle) { NET.p2p = true; NET.ok = true;
      document.addEventListener('securitypolicyviolation', e => { if (!NET.p2p || !/^wss?:/.test(String(e.blockedURI || ''))) return; NET.ok = false; const r = NET.room; NET.room = null; NET.conn = false; if (r) r.leave(); sync([]); if (NET.paint) NET.paint(); }); }
    fin(); return; }
  Promise.resolve().then(() => c.use('room')).then(room => {
    if (!room) { fin(); return; } NET.room = room; NET.ok = true; fin();
    const dead = () => { NET.ok = false; NET.conn = false; sync([]); };
    room.onConnection(on => { NET.conn = !!on; }, dead);
    room.onPeers(ch => { try { sync(ch.peers || []); } catch (e) { } }, dead);
  }).catch(fin);
}
// en la portada: elegir si se juega online o en local (se recuerda para la próxima vez)
export function titleNet() {
  const on = document.getElementById('t-on'), off = document.getElementById('t-off'), tx = document.getElementById('t-net'); if (!on || !off || !tx) return;
  const nk = document.getElementById('t-nick'); if (nk) { nk.value = NET.nick; nk.oninput = () => { const v = clean(nk.value); if (v) { NET.nick = v; store('els_nick', v); NET.last = ''; } }; }      /* el apodo, a mano en la portada cuando se juega online */
  const paint = () => { const wait = !NET.done, can = NET.ok, sel = NET.on && (can || wait); on.classList.toggle('sel', sel); off.classList.toggle('sel', !sel); on.disabled = !wait && !can; if (nk) nk.hidden = !(sel && can); on.setAttribute('aria-pressed', sel ? 'true' : 'false'); off.setAttribute('aria-pressed', sel ? 'false' : 'true');
    tx.textContent = !sel && (wait || can) ? 'Local: juegas a tu aire, no ves a nadie y nadie te ve.' : wait ? 'Online: comprobando la conexión…' : !can ? (NET.p2p === false || window.claude ? 'Aquí no hay online: hace falta abrir el juego en claude.ai, compartido y con la sesión iniciada. Se juega en local.' : 'Este navegador no permite el online. Se juega en local.') : NET.p2p ? 'Online: verás a quien juegue a la vez. La conexión es directa entre jugadores, así que los demás pueden ver tu IP.' : 'Online: quien tenga el juego abierto a la vez aparece en tu pueblo' + (NET.n ? ' (' + NET.n + ' ahora mismo).' : '.'); };
  on.onclick = () => { NET.on = true; store('els_net', '1'); NET.last = ''; paint(); }; off.onclick = () => { NET.on = false; store('els_net', '0'); NET.peers.forEach(hide); paint(); }; NET.paint = paint; paint();
}

// lo que mandan los demás no es de fiar: solo números dentro del mapa y un apodo limpio
function sync(list) {
  const seen = new Set(); let n = 0;
  for (const p of list) {
    if (!p || p.isMe || p.kind !== 'viewer' || !p.peer) continue; const q = p.presence; if (!q || !num(q.x) || !num(q.z) || Math.abs(q.x) > 8000 || Math.abs(q.z) > 8000) continue;
    const id = String(p.peer); seen.add(id); n++; let g = NET.peers.get(id);
    if (!g) { if (NET.peers.size >= 40) continue; g = { id, x: q.x, z: q.z, y: 0, yaw: 0, tx: q.x, tz: q.z, tyaw: 0, m: 0, car: 'c4', v: 0, name: '', foot: null, cars: {}, shown: null, el: null, anim: '', col: TEES[hash(id) % TEES.length], fresh: true }; NET.peers.set(id, g); }
    g.tx = q.x; g.tz = q.z; g.tyaw = num(q.w) ? q.w : g.tyaw; g.m = q.m === 1 ? 1 : q.m === 2 ? 2 : 0; g.car = typeof q.c === 'string' && CARS[q.c] ? q.c : 'c4'; g.v = num(q.v) ? Math.max(0, Math.min(45, q.v)) : 0;
    const nm = clean(q.n) || 'Ethan'; if (nm !== g.name) { g.name = nm; if (g.el) g.el.textContent = nm; }
    if (g.fresh) { g.fresh = false; g.x = g.tx; g.z = g.tz; g.yaw = g.tyaw; if (!G.title) toast(nm + ' anda por Sestao.', '🌐'); }
  }
  NET.peers.forEach((g, id) => { if (!seen.has(id)) { drop(g); NET.peers.delete(id); if (!G.title && g.name) toast(g.name + ' se ha ido.', '🌐'); } });
  NET.n = n; if (G.title && NET.paint) NET.paint();
}
function drop(g) { hide(g); if (g.foot) g.foot.dispose(); Object.keys(g.cars).forEach(k => { const m = g.cars[k]; if (m.parent) m.parent.remove(m); }); if (g.el && g.el.parentNode) g.el.parentNode.removeChild(g.el); g.el = null; }
function hide(g) { if (g.shown) { g.shown.visible = false; g.shown = null; } if (g.el) g.el.style.display = 'none'; }
function body(g) {
  if (g.m === 1) { let m = g.cars[g.car]; if (!m) { const sp = CARS[g.car]; m = g.cars[g.car] = carMesh(sp.col, sp.type); m.traverse(o => { if (o.isMesh) o.castShadow = G.q > 1; }); G.scene.add(m); } return m; }
  if (!g.foot) { const mix = (c, f) => { const r = (c >> 16) * f, gg = ((c >> 8) & 255) * f, b = (c & 255) * f; return (r << 16) | (gg << 8) | b; }, t = g.col; g.foot = new Ethan({ npc: true, mood: 3, look: { tee: t, tee2: mix(t, .8), sleeve: t, collar: mix(t, .7), trim: mix(t, .7) }, whiteTeeth: true }); G.scene.add(g.foot.root); g.anim = ''; }
  return g.foot.root;
}

export function tickNet(dt) {
  if (NET.p2p) { const want = NET.on && !G.title && !!G.S; if (want && !NET.room) { NET.conn = false; NET.last = ''; NET.room = p2pRoom(sync, on => { NET.conn = !!on; }); } else if (!want && NET.room) { const r = NET.room; NET.room = null; NET.conn = false; r.leave(); sync([]); } if (NET.room) NET.room.pull(); }
  const room = NET.room; if (!room || !NET.ok || G.title) return;
  // lo mío: dónde estoy, hacia dónde miro y en qué voy. Diez veces por segundo, y solo si ha cambiado
  if ((NET.sendT -= dt) <= 0) { NET.sendT = .1; const car = G.car, drv = G.mode === 'car' && car;
    if (NET.on && G.S) { const x = drv ? car.x : P.x, z = drv ? car.z : P.z, msg = { n: NET.nick, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, w: Math.round((drv ? car.yaw : P.yaw) * 100) / 100, m: drv ? 1 : P.scoot ? 2 : 0, c: G.S.car, v: Math.round(Math.abs(drv ? car.vf : P.v) * 10) / 10 }, key = JSON.stringify(msg);
      if (key !== NET.last || (NET.p2p && (NET.keep = (NET.keep || 0) - .1) <= 0)) { NET.last = key; NET.sent = true; NET.keep = 3;      /* en P2P se repite cada 3 s aunque no te muevas: si no, a los 20 s te dan por ido */
        try { const pr = room.presence(msg); if (pr && pr.catch) pr.catch(() => { }); } catch (e) { } } }
    else if (NET.sent) { NET.sent = false; NET.last = ''; try { const pr = room.presence({ n: null, x: null, z: null, w: null, m: null, c: null, v: null }); if (pr && pr.catch) pr.catch(() => { }); } catch (e) { } } }
  // los demás: se acercan suavemente a donde dicen estar (adelantando un poco por donde iban) y se pintan los más cercanos
  const now = [], cam = G.camera, w = innerWidth, h = innerHeight, k = 1 - Math.exp(-9 * dt); let shown = 0;
  const L = Array.from(NET.peers.values()); L.forEach(g => { g.d = Math.hypot(g.tx - G.px, g.tz - G.pz); }); L.sort((a, b) => a.d - b.d);
  for (const g of L) {
    const ax = g.tx + Math.sin(g.tyaw) * g.v * .12, az = g.tz + Math.cos(g.tyaw) * g.v * .12; if (Math.hypot(ax - g.x, az - g.z) > 60) { g.x = ax; g.z = az; } else { g.x += (ax - g.x) * k; g.z += (az - g.z) * k; } g.yaw = dampAng(g.yaw, g.tyaw, 9, dt);
    now.push({ x: g.x, z: g.z, n: g.name, m: g.m });
    if (!NET.on || g.d > 230 || shown >= NET.max) { hide(g); continue; } shown++;
    const m = body(g); if (g.shown !== m) { if (g.shown) g.shown.visible = false; g.shown = m; m.visible = true; }
    g.y = T.on ? standY(g.x, g.z, g.y + .7) : 0; m.position.set(g.x, g.y, g.z); m.rotation.y = g.yaw;
    if (g.m !== 1 && g.foot) { const a = g.v > .4 && g.m !== 2 ? 'walk' : 'idle'; if (a !== g.anim) { g.anim = a; g.foot.play(a, { walkRate: g.v > 5 ? 12.5 : 8.2 }); } if (g.d < 80) g.foot.update(dt); }
    // el apodo, encima
    let show = g.d < 95 && !G.busy && cam; if (show) { v3.set(g.x, g.y + (g.m === 1 ? 2.3 : 2.5), g.z).project(cam); show = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1; }
    if (show) { if (!g.el) { g.el = document.createElement('div'); g.el.className = 'lab peer'; g.el.textContent = g.name; const box = document.getElementById('labels'); if (box) box.appendChild(g.el); } g.el.style.display = ''; g.el.style.transform = 'translate(' + ((v3.x * .5 + .5) * w).toFixed(1) + 'px,' + ((-v3.y * .5 + .5) * h).toFixed(1) + 'px) translate(-50%,-100%)'; }
    else if (g.el) g.el.style.display = 'none';
  }
  G.peersMap = NET.on ? now : null;
}

// el apartado del móvil: quién hay, cambiar el apodo, y apagar o encender
export function openNet(back) {
  const st = !NET.ok ? (window.claude ? 'Aquí no hay conexión con otros jugadores. El online funciona con el juego abierto en claude.ai, entre las personas con las que lo hayas compartido.' : 'Este navegador no permite el online.') : !NET.on ? 'Online apagado: ni te ven ni ves a nadie.' : NET.p2p && !NET.conn && !NET.n ? 'Buscando a otros jugadores… (la conexión es directa entre jugadores: los demás pueden ver tu IP)' : (NET.n ? NET.n + (NET.n === 1 ? ' jugador más' : ' jugadores más') + ' por Sestao ahora mismo: ' + Array.from(NET.peers.values()).map(g => g.name).slice(0, 8).join(', ') + '.' : 'Ahora mismo no hay nadie más. Quien abra el juego a la vez que tú aparecerá por el pueblo.') + ' Solo se comparte dónde estás en el juego y tu apodo' + (NET.p2p ? '; la conexión es directa entre jugadores, así que ven tu IP.' : '.');
  dialog({ icon: '🌐', title: 'Sestao online', text: st, close: back ? 'Volver' : 'Cerrar', onClose: back || null, options: [
    { t: 'Guardar apodo', d: 'Lo que ven los demás encima de tu Ethan (14 letras)', f: () => { const i = document.getElementById('nick'), v = clean(i && i.value); if (v) { NET.nick = v; store('els_nick', v); NET.last = ''; toast('Apodo: ' + v, '🌐'); } openNet(back); } },
    { t: NET.on ? 'Apagar el online' : 'Encender el online', d: NET.on ? 'Dejas de verte con los demás' : 'Vuelves a aparecer en el pueblo de los demás', dis: !NET.ok, f: () => { NET.on = !NET.on; store('els_net', NET.on ? '1' : '0'); if (!NET.on) NET.peers.forEach(hide); openNet(back); } }] });
  const box = document.getElementById('d-x'); if (box) { const i = document.createElement('input'); i.id = 'nick'; i.type = 'text'; i.maxLength = 14; i.value = NET.nick; i.setAttribute('autocomplete', 'off'); i.setAttribute('aria-label', 'Apodo'); box.appendChild(i); }
  void closeDialog;
}
