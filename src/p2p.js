// p2p.js: el online fuera de claude.ai (GitHub Pages). Sin servidor propio: los navegadores se encuentran a través de relés
// públicos de Nostr (solo para presentarse) y luego hablan directamente entre ellos por WebRTC. Por eso los demás jugadores
// pueden ver tu IP, como en cualquier juego P2P. Viaja lo mismo que en claude.ai: apodo, dónde estás, hacia dónde miras y en qué vas.
// Por fuera se comporta como la sala de claude.ai: presence(msg) para mandar lo mío y una lista de los demás con su última presencia.
// Salas de 12 como mucho: si «plaza-1» está llena se prueba «plaza-2», y así.
import { joinRoom } from 'trystero';

const APP = 'ethan-life-sestao/v1', CAP = 12, MAXN = 9, STALE = 20000;

export function p2pRoom(onList, onConn) {
  const cfg = window.ELS_P2P || {}, peers = new Map();      /* ELS_P2P: solo lo ponen las pruebas (relé local) */
  let room = null, act = null, n = 1, mine = null, dead = false, dirty = false, tick = null;
  const list = () => { const now = Date.now(), L = []; peers.forEach((p, id) => { if (now - p.t > STALE) { peers.delete(id); return; } if (p.q) L.push({ peer: id, kind: 'viewer', presence: p.q }); }); return L; };
  const flush = () => { if (!dirty) return; dirty = false; try { onList(list()); } catch (e) { } };
  function join() {
    const c = { appId: APP, maxUsers: CAP, identity: 'none', maxReceiveBytes: 2048 };
    if (Array.isArray(cfg.relays)) c.relayConfig = { urls: cfg.relays, warnOnRelayFailure: false }; else c.relayConfig = { warnOnRelayFailure: false };
    if (Array.isArray(cfg.ice)) c.rtcConfig = { iceServers: cfg.ice };
    const r = room = joinRoom(c, 'plaza-' + n); act = r.makeAction('p');
    act.onMessage((d, ctx) => { if (r !== room || !ctx || !ctx.userId || typeof d !== 'object' || !d) return; let p = peers.get(ctx.userId); if (!p) { if (peers.size >= 40) return; peers.set(ctx.userId, p = { t: 0, q: null }); } p.t = Date.now(); p.q = d; dirty = true; });
    r.onUserJoin(({ userId }) => { if (r !== room) return; onConn(true); if (mine) act.send(mine, { target: userId }).catch(() => { }); });
    r.onUserLeave(({ userId }) => { if (r !== room) return; if (peers.delete(userId)) dirty = true; });
    r.onError(err => { if (r !== room || !err) return; if (err.code === 'room-full' && n < MAXN && !Object.keys(r.getPeers()).length) { n++; peers.clear(); dirty = true; r.leave().catch(() => { }); join(); } });
    r.ready.then(() => { if (r === room) onConn(true); }).catch(() => { });
  }
  join(); tick = setInterval(() => { if (list().length !== peers.size) dirty = true; flush(); }, 1000);
  return {
    p2p: true, sala: () => n,
    presence(msg) { if (dead || !act) return; const empty = msg && msg.x == null; mine = empty ? null : msg; if (empty) return; return act.send(msg).catch(() => { }); },
    pull() { flush(); },
    leave() { dead = true; clearInterval(tick); peers.clear(); const r = room; room = null; act = null; onConn(false); if (r) return r.leave().catch(() => { }); }
  };
}
