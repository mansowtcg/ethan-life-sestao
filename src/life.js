// life.js: la partida (dinero, energía, hambre, reloj), los menús de cada sitio y el curro en el taller
import { G } from './state.js';
import { dialog, closeDialog, toast, banner, fade, eur, fmtTime, openMap } from './hud.js';
import { SP } from './spots.js';
import { W } from './world.js';
import { ST, CAT } from './street.js';
import { openAlbum } from './explore.js';
import { SKY } from './sky.js';
import { P } from './player.js';
import { CARS } from './car.js';
import { COS } from './cosdata.js';
import { dress } from './cosmetics.js';
import { sfx, toggleMute, isMuted } from './audio.js';
import { RATE, T_IN, T_LUNCH, T_BACK, T_OUT, WDAY, wd, dom, workday, hm, payMult, mult, addBuff, moment, cash, goSleep, resetDay, openAgenda, searching, carOK } from './day.js';
import { NET, openNet } from './net.js';

const KEY = 'els1', $ = id => document.getElementById(id);
export const RANKS = [[0, 'Becario sin contrato', 12], [8, 'Becario con contrato', 16], [24, 'Oficial de tercera', 22], [60, 'Oficial de segunda', 30], [120, 'Oficial de primera', 40], [250, 'Encargado', 55], [500, 'Jefe de taller', 75]];
export const rank = S => { let r = RANKS[0]; for (const k of RANKS) if (S.hrs >= k[0]) r = k; return r; };
export const newGame = () => ({ v: 2, money: 35, energy: 85, hunger: 60, fuel: 60, dmg: 0, day: 1, min: 390, hrs: 0, car: 'c4', cars: ['c4'], cos: [], cq: [], sarro: 0, itv: 15, pos: null, carPos: null, stats: { km: 0, kebabs: 0, nope: 0 }, done: {}, daily: { up: 1 }, warn: {}, buffs: [], ev: {}, mom: {}, tooth: 0, faltas: 0 });
export function loadGame() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && (s.v === 1 || s.v === 2)) { const g = Object.assign(newGame(), s); if (s.v === 1) { g.v = 2; g.itv = Math.ceil((g.day - 15) / 30) * 30 + 15; g.daily = Object.assign({ up: 1, in: 510, out: 1, pk: 'ok' }, s.daily || {}); /* partida de la versión anterior: el día en que vuelves cuenta como ya currado; la rutina empieza al despertar */ } return g; } } catch (e) { } return null; }
export function saveGame() { const S = G.S; if (!S || G.title) return; S.pos = [P.x, P.z, P.yaw]; if (G.car) S.carPos = [G.car.x, G.car.z, G.car.yaw]; S.map = G.mapId; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
export function wipeGame() { try { localStorage.removeItem(KEY); } catch (e) { } }
export function money(d, why) { const S = G.S; S.money = Math.max(0, S.money + d); if (why) toast((d >= 0 ? '+' : '−') + eur(Math.abs(d)) + ' · ' + why, d >= 0 ? '💶' : '💸'); sfx(d >= 0 ? 'coin' : 'pay'); }
export function pass(mins) { const S = G.S; S.min += mins; while (S.min >= 1440) { S.min -= 1440; S.yest = { w: workday(S), out: !!S.daily.out }; S.day++; S.daily = {}; } }
export const feed = (h, e) => { const S = G.S; S.hunger = Math.max(0, Math.min(100, S.hunger + (h || 0))); S.energy = Math.max(0, Math.min(100, S.energy + (e > 0 ? e * mult('regen') : e || 0))); };
const carNear = (s, r) => G.car && Math.hypot(G.car.x - s.x, G.car.z - s.z) < (r || 10);
const openAt = (a, b) => { const h = G.S.min / 60; return a < b ? h >= a && h < b : h >= a || h < b; };
let autosave = 0, fainting = false;

export function tickLife(dt) {
  const S = G.S, gm = dt * RATE * (G.mode === 'car' && !searching() ? .6 : 1); pass(gm);      /* al volante el reloj corre algo menos: cruzar el pueblo no puede costar una hora */ G.hour = S.min / 60; const run = G.mode === 'foot' && P.v > 5;
  S.hunger = Math.max(0, S.hunger - gm * 100 / 1700); S.energy = Math.max(0, S.energy - gm * 100 / 2200 * (run ? 2.2 : 1) * (S.hunger <= 0 ? 2 : 1));   // una hora de juego son tres minutos: se come un par de veces al día y se duerme una
  const warn = (k, on, msg, ic) => { if (on && !S.warn[k]) { S.warn[k] = 1; toast(msg, ic); } else if (!on) S.warn[k] = 0; };
  warn('h', S.hunger < 20, 'Ethan tiene hambre. El kebab de Ali no se come solo.', '🥙'); warn('e', S.energy < 15, 'Ethan está reventado. A casa a dormir.', '😴'); warn('f', S.fuel < 12, 'El coche va en reserva. Pasa por la gasolinera.', '⛽'); warn('i', S.day > S.itv, 'Llevas la ITV caducada. Está en el polígono.', '📋');
  if (S.energy <= 0 && !fainting) faint();
  if ((autosave += dt) > 20) { autosave = 0; saveGame(); }
}
function goHome() { const h = SP.by.home; if (!h) return; if (G.mode === 'car') G.leaveCar(true); P.x = h.x; P.z = h.z; P.yaw = h.yaw + Math.PI / 2; G.cam.yaw = P.yaw + Math.PI; }
function faint() {
  fainting = true; G.busy = true; fade(true); sfx('bad');
  setTimeout(() => { const S = G.S, lost = Math.round(S.money * .15); goHome(); S.money -= lost; S.energy = 20; S.hunger = Math.max(S.hunger, 35); (S.notes || (S.notes = [])).push(['😵', 'Te quedaste frito', 'Lourdes te subió a casa. El taxi: ' + eur(lost) + '.']); fainting = false; G.busy = false; goSleep(); }, 900);
}

// ---------- menús de los sitios
const say = a => a[Math.floor(Math.random() * a.length)];
export function enterSpot(s) {
  const S = G.S, re = () => enterSpot(s), buy = (cost, f) => () => { if (S.money < cost) { toast('No te llega el dinero.', '💸'); sfx('bad'); return; } if (cost) money(-cost); f(); re(); };
  const buyOut = (cost, f) => () => { if (S.money < cost) { toast('No te llega el dinero.', '💸'); sfx('bad'); return; } if (cost) money(-cost); closeDialog(); f(); };
  sfx('ui');
  if (s.id === 'home') { const late = S.min >= 1200 || S.min < 300, tired = S.energy < 35;
    return dialog({ icon: '🏠', title: 'Casa de Ethan', text: WDAY[wd(S)] + ' ' + dom(S) + ' · sarro acumulado: ' + S.sarro + ' · días en Sestao: ' + S.day + '.' + (S.park && S.park.k === 'bad' ? ' Ojo: el coche está mal aparcado (' + S.park.why + ').' : ''), options: [
      { t: 'Dormir', d: !(late || tired) ? 'Aún es pronto: antes de las 20:00, solo si estás reventado' : !carOK() && S.energy >= 12 ? 'Antes hay que aparcar el coche: en tu zona o en el parking grande' : !carOK() ? 'No puedes más. El coche se queda como está, y a ver qué pasa esta noche' : 'Hasta que suene el despertador. Guarda la partida', dis: !(late || tired) || (!carOK() && S.energy >= 12), f: () => goSleep() },
      { t: 'Pasar el rato en el sofá', d: 'Una hora de tele. Descansa un poco', tag: '1 h', f: () => { pass(60); feed(-3, 9); toast('Una hora de sofá.', '🛋️'); re(); } },
      { t: 'Lavarse los dientes', d: !S.tooth ? 'No tienes cepillo. En el súper los venden' : S.daily.teeth === 1 ? 'Hoy ya te los has lavado. Histórico' : 'Aliento fresco: ×1,5 a todo durante 24 h', tag: '10 min', dis: !S.tooth || S.daily.teeth === 1, f: () => { if (!S.tooth) { S.stats.nope++; toast(say(['Hoy no.', 'Mañana.', '¿Dentista? ¿Eso qué es?']), '🪥'); return; } S.daily.teeth = 1; pass(10); S.sarro = 0; addBuff('fresco', 'Aliento fresco', '🪥', 'all', 1.5, 24); S.buffs = S.buffs.filter(b => b.id !== 'sarro'); moment('diente'); sfx('ok'); re(); } },
      { t: 'Abrir el armario', d: S.cos.length + ' de ' + COS.length + ' cosas conseguidas', f: () => wardrobe(s) }] }); }
  if (s.id === 'kebab') { if (!openAt(12, 3)) return closed(s, 'Ali abre de 12:00 a 3:00.');
    const eat = (h, e, msg) => () => { feed(h, e); S.stats.kebabs++; pass(15); toast(msg, '🥙'); sfx('ok'); };
    return dialog({ icon: '🥙', title: 'Kebab de Ali', text: say(['«¿Lo de siempre, jefe?»', '«Hoy la salsa pica de verdad.»', '«Para ti, con extra de todo.»']), options: [
      { t: 'Kebab mixto', d: 'El de toda la vida', tag: eur(6), f: buy(6, eat(55, 0, 'Kebab mixto. Ethan vuelve a ser persona.')) },
      { t: 'Durum completo', d: 'Con patatas dentro', tag: eur(8), f: buy(8, eat(72, 6, 'Durum completo. No hay hambre que lo aguante.')) },
      { t: 'Patatas con salsa', d: 'Para ir tirando', tag: eur(4), f: buy(4, eat(28, 0, 'Patatas con salsa blanca.')) },
      ...(S.daily.alik === 1 ? [{ t: 'El de ayer', d: '«Te lo he guardado, jefe.» Invita Ali', tag: 'Gratis', f: buyOut(0, () => { S.daily.alik = 2; moment('alik'); S.stats.kebabs++; if (Math.random() < .7 && S.cq.indexOf('kebab') < 0) { S.energy = Math.min(S.energy, 4); feed(15, 0); addBuff('intox', 'Intoxicación', '🤢', 'regen', .4, 12); banner('Vomitona', 'Creo que esto era una uña. Ethan sobrevive de milagro.', 4200); sfx('bad'); } else { feed(45, 8); toast('Estaba bueno y todo. Milagro.', '🥙'); sfx('ok'); } }) }] : []),
      { t: 'Kebab caducado', d: 'Invita la casa. Bajo tu responsabilidad', tag: 'Gratis', dis: !!S.daily.cad, f: buy(0, () => { S.daily.cad = 1; if (Math.random() < .4) { feed(30, -14); toast('Te ha sentado regular.', '🤢'); sfx('bad'); } else eat(38, 0, 'Estaba bueno y todo.')(); }) },
      { t: 'Hacer el reparto', d: 'Encargo: lleva los pedidos antes de que se enfríen', tag: 'Curro', dis: !!G.mission, f: () => { closeDialog(); G.startMission('reparto'); } }] }); }
  if (s.id === 'bar') { if (!openAt(10, 4)) return closed(s, 'El Ekintza abre de 10:00 a 4:00.');
    return dialog({ icon: '🍺', title: 'Bar Ekintza', text: say(['Luisillo pasa la bayeta. Sádaba vigila sus cajas.', '«La banca siempre gana. Sádaba también.»', 'Huele a tortilla recién hecha.']), options: [
      { t: 'Pintxo de tortilla', d: 'De la de Lourdes no, pero se deja', tag: eur(3), f: buy(3, () => { feed(22, 0); toast('Pintxo de tortilla.', '🍳'); }) },
      { t: 'Kalimotxo', d: 'Uno y a casa', tag: eur(3), f: buy(3, () => { feed(4, 7); toast('Un kalimotxo. Solo uno.', '🍷'); }) },
      { t: 'Caja de Sádaba', d: '«Sin trucar.» Puede tocar ropa, dinero o aire', tag: eur(40), f: buy(40, () => lootBox()) },
      { t: 'Retar a Jokin a una carrera', d: 'Apuesta de 50 €. Hace falta el coche cerca', tag: eur(50), dis: !!G.mission || S.money < 50 || !carNear(s, 60), f: () => { closeDialog(); G.startMission('carrera'); } },
      { t: 'Acercar a alguien a su calle', d: 'Un favor con el coche. Te lo pagan en gasolina', tag: 'Favor', dis: !!G.mission || !carNear(s, 60), f: () => { closeDialog(); G.startMission('taxi'); } }] }); }
  if (s.id === 'super') { if (!openAt(9, 22)) return closed(s, 'El súper abre de 9:00 a 22:00.');
    return dialog({ icon: '🛒', title: 'Súper', text: 'Pasillo 3: todo lo que Ethan considera comida.', options: [
      { t: 'Aquarius', d: 'Sube la energía', tag: eur(2), f: buy(2, () => { feed(0, 14); toast('Aquarius de limón.', '🥤'); }) },
      { t: 'Bolsa de Ruffles', d: 'Sabor jamón', tag: eur(2), f: buy(2, () => { feed(16, 0); toast('Ruffles. La bolsa, mitad aire.', '🥔'); }) },
      { t: 'Bocata de lomo', d: 'El menú del currante', tag: eur(5), f: buy(5, () => { feed(42, 2); toast('Bocata de lomo con pimientos.', '🥖'); }) },
      { t: 'Bocata para el curro', d: S.bocata ? 'Ya llevas uno en la mochila' : 'Para el parón de la una en el taller', tag: eur(4), dis: !!S.bocata, f: buy(4, () => { S.bocata = 1; toast('Bocata envuelto en papel de plata. Para la una.', '🥪'); }) },
      { t: 'Cepillo de dientes', d: S.tooth ? 'Ya tienes uno. Otra cosa es usarlo' : 'Con él te puedes lavar los dientes. Y +1 € por hora en el taller', tag: eur(10), dis: !!S.tooth, f: buyOut(10, () => { S.tooth = 1; banner('Cepillo de dientes', 'El primer paso de la vida de Ethan. Sigue precintado, pero es suyo.'); sfx('win'); }) }] }); }
  if (s.id === 'gas') { const near = carNear(s, 9), sp = CARS[S.car], full = Math.ceil((100 - S.fuel) * .55), put = e => buy(e, () => { S.fuel = Math.min(100, S.fuel + e / .55); toast('Depósito al ' + Math.round(S.fuel) + ' %.', '⛽'); if (Math.random() < .12) G.hose = 1; });
    return dialog({ icon: '⛽', title: 'Gasolinera', text: near ? sp.n + ': depósito al ' + Math.round(S.fuel) + ' %.' : 'Trae el coche hasta el surtidor para repostar.', options: [
      { t: 'Llenar el depósito', d: 'Hasta arriba', tag: eur(full), dis: !near || full < 1, f: put(full) },
      { t: 'Poner 10 euros', d: 'Lo justo para llegar', tag: eur(10), dis: !near || S.fuel > 96, f: put(10) },
      { t: 'Café de máquina', d: 'Quema, pero espabila', tag: eur(1), f: buy(1, () => { feed(0, 8); toast('Café de máquina.', '☕'); }) }] }); }
  if (s.id === 'taller') { const rk = rank(S), fix = Math.ceil(S.dmg * 1.8), W = workday(S), m = S.min, pm = payMult(), ot = Math.round(wage(S) * 1.25 * pm), o = [];
    if (W && !S.daily.out) { const late = Math.floor(m - T_IN);
      if (!S.daily.in) o.push({ t: 'Fichar', d: m < 420 ? 'El taller abre a las 7:00' : m >= T_OUT - 60 ? 'A estas horas ya no te dejan fichar' : late <= 5 ? 'Turno hasta las 18:00, con parón de una a tres' : m < T_LUNCH ? 'Llegas ' + late + ' min tarde: lo que no curras, no lo cobras' : 'Solo te queda la tarde', tag: hm(m), dis: m < 390 || m >= T_OUT - 60 || S.energy < 8, f: () => clockIn() });
      else o.push({ t: 'Seguir con el turno', d: 'Sales a las 18:00', tag: hm(m), f: () => { closeDialog(); shiftNext(); } }); }
    else o.push({ t: 'Echar una hora extra', d: (S.daily.ot || 0) >= 4 ? 'Hoy ya has echado cuatro. Manolo te manda a casa' : m >= 420 && m < 1260 ? 'Fuera de turno se paga a ×1,25' : 'El taller cierra a las 21:00', tag: '+' + eur(ot), dis: !(m >= 420 && m < 1260) || S.energy < 15 || (S.daily.ot || 0) >= 4, f: () => { closeDialog(); workBlock(1, 'Hora extra', q => { const pay = Math.round(wage(S) * 1.25 * (.4 + .6 * q) * payMult()), before = rank(S)[1]; pass(60); S.daily.ot = (S.daily.ot || 0) + 1; S.hrs += 1; money(pay, 'una hora extra'); if (rank(S)[1] !== before) { banner('¡Ascenso!', 'Ethan ya es ' + rank(S)[1] + '.', 3600); sfx('win'); } saveGame(); }); } });
    o.push({ t: 'Arreglar mi coche', d: carNear(s, 14) ? 'Chapa, pintura y lo que haga falta' : 'Trae el coche al taller', tag: eur(fix), dis: !carNear(s, 14) || fix < 1, f: buy(fix, () => { S.dmg = 0; toast('El coche ha quedado como nuevo.', '🔧'); sfx('ok'); }) });
    return dialog({ icon: '🔧', title: 'Taller', text: rk[1] + ' · ' + eur(wage(S)) + ' la hora' + (pm !== 1 ? ' (×' + String(Math.round(pm * 100) / 100).replace('.', ',') + ' hoy)' : '') + ' · ' + Math.floor(S.hrs) + ' horas echadas.' + (W ? S.daily.out ? ' Turno de hoy, hecho.' : ' Turno: de 8:00 a 18:00, con parón de 13:00 a 15:00.' : ' Hoy no hay turno.'), options: o }); }
  if (s.id === 'itv') { const due = S.itv - S.day, second = S.daily.itv2, cost = second ? Math.max(10, Math.round(S.money * .03)) : 35;
    return dialog({ icon: '📋', title: 'ITV', text: due > 0 ? 'La tienes en vigor. Te toca el día 15 (faltan ' + due + ' días).' : second ? 'Te la han tumbado. La segunda cuesta el 3 % de lo que llevas.' : 'Te toca pasarla.', options: [
      { t: second ? 'Pasar la segunda' : 'Pasar la ITV', d: carNear(s, 12) ? 'Con el coche muy tocado no pasa' : 'Hay que traer el coche', tag: eur(cost), dis: !carNear(s, 12) || due > 3, f: buyOut(cost, () => { const next = (Math.floor((S.day - 1 + 14) / 30) + 1) * 30 - 15; if (S.dmg >= 25) { money(cost); banner('Rechazada', 'Con el coche así ni lo miran. Arréglalo y vuelve.'); sfx('bad'); return; }
        if (second || Math.random() < (S.dmg < 8 ? .45 : .25)) { S.itv = next > S.day + 3 ? next : next + 30; S.daily.itv2 = 0; if (!second) { banner('¡ITV a la primera!', 'El coche de Ethan pasa la ITV. La ITV no se ha recuperado.'); cash(300, 'te ahorras la segunda'); moment('itv'); } else banner('ITV pasada', 'A la segunda, como todo el mundo.'); sfx('win'); }
        else { S.daily.itv2 = 1; banner('Te la tumban', 'Una bombilla, dicen. Toca pasar la segunda.'); sfx('bad'); } }) }] }); }
  if (s.id === 'dealer') return dialog({ icon: '🚗', title: 'Autos Sádaba', text: '«Kilómetros reales. Palabra.»', options: Object.keys(CARS).map(id => { const c = CARS[id], own = S.cars.indexOf(id) >= 0;
    return { t: c.n, d: own ? (S.car === id ? 'Es el que llevas' : 'Lo tienes: cámbiate a este') : 'Corre hasta ' + Math.round(c.vmax * 3.6) + ' km/h', tag: own ? 'Tuyo' : eur(c.price), dis: S.car === id || (!own && S.money < c.price), f: () => { if (!own) { money(-c.price, c.n); S.cars.push(id); banner('Coche nuevo', c.n + '. Sádaba jura que no lleva ladrillos.'); sfx('win'); } S.car = id; G.swapCar(id); saveGame(); re(); } }; }) });
  if (s.id === 'lourdes') return dialog({ icon: '🍳', title: 'Casa de Lourdes', text: say(['«¿Tú has comido hoy?»', '«Ese coche tuyo hace un ruido raro.»', '«A ver si un día me arreglas la persiana.»']), options: [
    { t: 'Pedirle una tortilla', d: 'Hay que traerle huevos y patatas del súper', tag: 'Recado', dis: !!G.mission || !!S.daily.tort, f: () => { closeDialog(); G.startMission('tortilla'); } },
    { t: 'Ir a por el pan', d: 'Una barra de una panadería del barrio', tag: 'Recado', dis: !!G.mission || !!S.daily.pan, f: () => { closeDialog(); G.startMission('pan'); } }] });
}
function closed(s, msg) { dialog({ icon: s.icon, title: s.n, text: 'Cerrado. ' + msg, options: [] }); }

// ---------- comercios del mapa: el nombre es el real (OpenStreetMap); lo que se puede hacer dentro es genérico, igual para todos los de su tipo
const HOURS = { bar: [9, 2], cafe: [7.5, 21], rest: [13, 23.5], fast: [12, 1], bakery: [7, 20.5], super: [9, 21.5], food: [9, 20.5], pharm: [9, 21], lottery: [9, 20.5], tobacco: [8.5, 20.5], hair: [9.5, 20], clothes: [10, 20.5], shop: [10, 20.5], garage: [8, 19] };
const hh = h => Math.floor(h) + ':' + (h % 1 ? '30' : '00');
export function enterPoi(p) {
  const S = G.S, c = CAT[p.c] || CAT.shop, re = () => enterPoi(p), hrs = HOURS[p.c], buy = (cost, f) => () => { if (S.money < cost) { toast('No te llega el dinero.', '💸'); sfx('bad'); return; } if (cost) money(-cost); f(); re(); };
  sfx('ui'); S.stats.pois = S.stats.pois || {}; if (!S.stats.pois[p.n]) { S.stats.pois[p.n] = 1; }
  if (hrs && !openAt(hrs[0], hrs[1])) return dialog({ icon: c[2], title: p.n, text: c[1] + ' · Cerrado. Abre de ' + hh(hrs[0]) + ' a ' + hh(hrs[1]) + '.', options: [] });
  const near = G.car && Math.hypot(G.car.x - p.x, G.car.z - p.z) < 16, o = [];
  if (p.c === 'bar' || p.c === 'cafe') o.push({ t: 'Café', d: 'Espabila un rato', tag: eur(1.5), f: buy(1.5, () => { feed(0, 9); pass(5); toast('Un café.', '☕'); }) }, { t: 'Pintxo', d: 'El que quede en la barra', tag: eur(2.5), f: buy(2.5, () => { feed(18, 0); pass(8); toast('Un pintxo.', '🍢'); }) }, { t: 'Refresco', d: 'Con hielo', tag: eur(2), f: buy(2, () => { feed(3, 6); pass(5); toast('Un refresco.', '🥤'); }) });
  else if (p.c === 'rest') o.push({ t: 'Menú del día', d: 'Primero, segundo y postre', tag: eur(13), f: buy(13, () => { feed(80, 6); pass(45); toast('Menú del día. Ethan sale rodando.', '🍽️'); }) }, { t: 'Plato combinado', d: 'Rápido y contundente', tag: eur(9), f: buy(9, () => { feed(55, 2); pass(25); toast('Plato combinado.', '🍽️'); }) });
  else if (p.c === 'fast') o.push({ t: 'Bocadillo', d: 'Para llevar', tag: eur(5), f: buy(5, () => { feed(45, 0); pass(10); toast('Un bocadillo.', '🥪'); }) }, { t: 'Ración de patatas', d: 'Con lo que haya de salsa', tag: eur(3), f: buy(3, () => { feed(22, 0); pass(6); toast('Patatas.', '🍟'); }) });
  else if (p.c === 'bakery') o.push({ t: 'Barra de pan', d: 'Recién hecha', tag: eur(1), f: buy(1, () => { feed(12, 0); toast('Una barra de pan.', '🥖'); }) }, { t: 'Palmera de chocolate', d: 'Azúcar para aguantar', tag: eur(2), f: buy(2, () => { feed(20, 5); toast('Una palmera de chocolate.', '🥐'); }) });
  else if (p.c === 'super' || p.c === 'food') o.push({ t: 'Refresco', d: 'Sube la energía', tag: eur(2), f: buy(2, () => { feed(0, 14); toast('Un refresco.', '🥤'); }) }, { t: 'Bolsa de patatas', d: 'Para picar', tag: eur(2), f: buy(2, () => { feed(16, 0); toast('Patatas de bolsa.', '🥔'); }) }, { t: 'Bocata de lomo', d: 'El menú del currante', tag: eur(5), f: buy(5, () => { feed(42, 2); toast('Bocata de lomo.', '🥖'); }) });
  if ((p.c === 'super' || p.c === 'food' || p.c === 'pharm') && !S.tooth) o.push({ t: 'Cepillo de dientes', d: 'Con él te puedes lavar los dientes. Y +1 € por hora en el taller', tag: eur(10), f: () => { if (S.money < 10) { toast('No te llega el dinero.', '💸'); sfx('bad'); return; } money(-10); closeDialog(); S.tooth = 1; banner('Cepillo de dientes', 'El primer paso de la vida de Ethan. Sigue precintado, pero es suyo.'); sfx('win'); } });
  if (p.c === 'pharm') o.push({ t: 'Vitaminas', d: 'Una al día', tag: eur(6), dis: !!S.daily.vit, f: buy(6, () => { S.daily.vit = 1; feed(0, 22); toast('Vitaminas. Ethan nota algo. O eso dice.', '💊'); }) });
  else if (p.c === 'lottery') o.push({ t: 'Rasca', d: 'A ver si hoy sí', tag: eur(2), f: buy(2, () => { const r = Math.random(); if (r < .004) { money(200, 'premio del rasca'); sfx('win'); } else if (r < .05) money(20, 'premio del rasca'); else if (r < .24) money(4, 'premio del rasca'); else toast('Nada. Otro día será.', '🍀'); }) });
  else if (p.c === 'tobacco') o.push({ t: 'Periódico', d: 'Las noticias de la margen izquierda', tag: eur(1.5), f: buy(1.5, () => { toast(RADIO[Math.floor(Math.random() * RADIO.length)], '📰'); }) }, { t: 'Chicles', d: 'De menta', tag: eur(1), f: buy(1, () => { feed(0, 3); toast('Chicles de menta.', '🍬'); }) });
  else if (p.c === 'hair') o.push({ t: 'Corte de pelo', d: 'Lo de siempre', tag: eur(12), dis: !!S.daily.hair, f: buy(12, () => { S.daily.hair = 1; feed(0, 6); pass(30); toast('Ethan sale repeinado. Le dura hasta la esquina.', '💈'); }) });
  else if (p.c === 'fuel') { const full = Math.ceil((100 - S.fuel) * .6), put = e => buy(e, () => { S.fuel = Math.min(100, S.fuel + e / .6); toast('Depósito al ' + Math.round(S.fuel) + ' %.', '⛽'); }); o.push({ t: 'Llenar el depósito', d: near ? 'Hasta arriba' : 'Acerca el coche al surtidor', tag: eur(full), dis: !near || full < 1, f: put(full) }, { t: 'Poner 10 euros', d: 'Lo justo para llegar', tag: eur(10), dis: !near || S.fuel > 96, f: put(10) }); }
  else if (p.c === 'garage') { const fix = Math.ceil(S.dmg * 2.3); o.push({ t: 'Arreglar el coche', d: near ? 'Chapa y pintura' : 'Trae el coche hasta la puerta', tag: eur(fix), dis: !near || fix < 1, f: buy(fix, () => { S.dmg = 0; pass(60); toast('El coche ha quedado como nuevo.', '🔧'); sfx('ok'); }) }); }
  else if (p.c === 'hotel') o.push({ t: 'Pasar la noche', d: 'Duermes hasta que suene el despertador y se guarda la partida', tag: eur(45), f: () => { if (S.money < 45) { toast('No te llega el dinero.', '💸'); sfx('bad'); return; } money(-45); goSleep(null, true); } });
  else if (p.c === 'bank') o.push({ t: 'Mirar el saldo', d: 'Cajero automático', f: () => { toast('Llevas ' + eur(S.money) + '.', '🏧'); } });
  dialog({ icon: c[2], title: p.n, text: c[1] + (o.length ? '.' : '. Ahora mismo no tienes nada que hacer aquí.'), options: o });
}
// ---------- metro y tren: de una estación a otra, pagando el billete
export function enterTransit(t) {
  const S = G.S, metro = t.k === 'metro', cost = metro ? 1.7 : 1.95, seen = new Set([t.n]), opts = [];
  ST.transit.forEach(d => { if (d.k !== t.k || seen.has(d.n)) return; seen.add(d.n); const km = Math.hypot(d.x - t.x, d.z - t.z) / 1000;
    opts.push({ t: d.n, d: 'A ' + km.toFixed(1).replace('.', ',') + ' km', tag: eur(cost), f: () => { if (S.money < cost) { toast('No te llega para el billete.', '💸'); sfx('bad'); return; } money(-cost); closeDialog(); G.busy = true; fade(true); sfx('door');
      setTimeout(() => { P.x = d.x + 1.4; P.z = d.z + 1.4; G.px = P.x; G.pz = P.z; pass(4 + km * 5); fade(false); G.busy = false; banner(d.n, (metro ? 'Metro' : 'Tren') + ' · ' + fmtTime(S), 2400); }, 900); } }); });
  sfx('ui'); dialog({ icon: metro ? '🚇' : '🚆', title: (metro ? 'Metro · ' : 'Tren · ') + t.n, text: opts.length ? 'Elige a dónde vas. El coche se queda donde lo dejaste.' : 'No hay más estaciones dentro del mapa.', options: opts });
}
function wardrobe(s) {
  const S = G.S; dialog({ icon: '👕', title: 'Armario', text: S.cos.length ? 'Toca para ponerte o quitarte cada cosa.' : 'Vacío. Lo que toca en las cajas de Sádaba acaba aquí.', close: 'Volver', onClose: () => enterSpot(s),
    options: S.cos.map(id => { const c = COS.find(q => q[0] === id), on = S.cq.indexOf(id) >= 0; return { t: c ? c[1] : id, d: on ? 'Puesto' : 'En el armario', tag: on ? '✓' : '', f: () => { if (on) S.cq = S.cq.filter(q => q !== id); else S.cq.push(id); dress(P.ethan, S.cq); wardrobe(s); } }; }) });
}
function lootBox() {
  const S = G.S, left = COS.filter(c => S.cos.indexOf(c[0]) < 0), r = Math.random();
  if (r < .45 && left.length) { const c = say(left); S.cos.push(c[0]); banner('¡Te ha tocado!', c[1] + '. Está en el armario de casa.'); sfx('win'); }
  else if (r < .75) { const m = 10 + Math.floor(Math.random() * 12) * 10; money(m, 'premio de la caja'); }
  else { toast('Aire de Sestao. Sádaba se encoge de hombros.', '📦'); sfx('bad'); }
}

// ---------- el curro: fichar, turno de mañana, parada para comer, turno de tarde. Cada bloque es un rato de apretar tuercas
export const wage = S => rank(S)[2] + (S.tooth ? 1 : 0);
const setTime = t => { const S = G.S; if (S.min < t) pass(t - S.min); };
function clockIn() { const S = G.S, late = Math.floor(S.min - T_IN); closeDialog(); S.daily.in = Math.round(S.min); toast(late <= 5 ? 'Fichado a las ' + hm(S.min) + '. Manolo ni levanta la vista.' : '«¿Estas son horas?» Fichado con ' + late + ' min de retraso.', '🔧'); shiftNext(); }
function shiftNext() {
  const S = G.S, m = S.min;
  if (!S.daily.am && m < T_LUNCH - 20) { const hrs = (T_LUNCH - Math.max(m, T_IN - 30)) / 60; return workBlock(hrs, 'Turno de mañana', q => { S.daily.am = [hrs, q]; setTime(T_LUNCH); lunch(); }); }
  if (!S.daily.lunch && m < T_BACK - 10) return lunch();
  if (!S.daily.pm) { const start = Math.max(m, T_BACK), hrs = (T_OUT - start) / 60; if (hrs >= .4) return workBlock(hrs, 'Turno de tarde', q => { S.daily.pm = [hrs, q]; setTime(T_OUT); endShift(); }); }
  endShift();
}
function lunch() {
  const S = G.S, go = (f, msg, ic) => () => { f(); S.daily.lunch = 1; closeDialog(); if (S.min < T_BACK) { setTime(T_BACK); S.energy = Math.min(100, S.energy + 12); } toast(msg, ic); shiftNext(); };      /* el parón dura hasta las tres: se come y se echa una cabezada en el coche */
  dialog({ icon: '🥪', title: 'La una: parón hasta las tres', text: 'Se come y, con lo que sobra, cabezada en el coche. A las tres, otra vez al tajo.', noClose: true, options: [
    { t: 'El bocata de la mochila', d: S.bocata ? 'El que compraste en el súper' : 'Hoy no llevas. En el súper los hay por 4 €', tag: 'Gratis', dis: !S.bocata, f: go(() => { S.bocata = 0; feed(48, 4); }, 'Bocata de lomo sentado en una rueda.', '🥪') },
    { t: 'Menú en el bar del polígono', d: 'Primero, segundo y café', tag: eur(9), dis: S.money < 9, f: go(() => { money(-9); feed(78, 7); }, 'Menú del día en el bar del polígono.', '🍽️') },
    { t: 'Café de máquina y a correr', d: 'No llena, pero espabila', tag: eur(1), dis: S.money < 1, f: go(() => { money(-1); feed(0, 6); }, 'Café de máquina. Quema.', '☕') },
    { t: 'Aguantar sin comer', d: 'La tarde se hace larga', f: go(() => { }, 'Sin comer. Las tuercas se ven dobles.', '😮‍💨') }] });
}
function endShift() {
  const S = G.S, B = [S.daily.am, S.daily.pm].filter(Boolean), before = rank(S)[1]; let hrs = 0, eff = 0; B.forEach(b => { hrs += b[0]; eff += b[0] * (.4 + .6 * b[1]); });
  const pm = payMult(), pay = Math.round(wage(S) * eff * pm), q = hrs ? (eff / hrs - .4) / .6 : 0; S.daily.out = 1; S.hrs += hrs; if (S.min < T_OUT) setTime(T_OUT);
  money(pay, (Math.round(hrs * 10) / 10 + ' horas de taller').replace('.', ',') + (pm !== 1 ? ' (×' + String(Math.round(pm * 100) / 100).replace('.', ',') + ')' : ''));
  if (rank(S)[1] !== before) { banner('¡Ascenso!', 'Ethan ya es ' + rank(S)[1] + '.', 3600); sfx('win'); } else banner('Las cinco: fin del turno', (q > .85 ? 'Manolo asiente. Eso es mucho.' : q > .5 ? 'Jornada decente.' : 'Manolo ha visto cosas mejores.') + ' Ahora, a casa a buscar sitio.', 3800);
  resetDay(); saveGame();
}
// un rato de minijuego: para la aguja en la zona verde. Al acabar llama a cb(calidad de 0 a 1). opts: { title, word, steps }
export function workBlock(hours, title, cb, opts) {
  opts = opts || {}; closeDialog(); G.busy = true; const S = G.S, sp = SP.by.taller, rounds = opts.steps || Math.max(3, Math.min(9, Math.round(hours * 2))), work = !opts.title; let i = 0, score = 0, pos = 0, dir = 1, zc = .5, zw = .26, wait = 0;
  if (work) { if (G.mode === 'car') G.leaveCar(true); P.x = sp.workX; P.z = sp.workZ; P.yaw = sp.workYaw; P.anim = 'work'; P.ethan.play('work'); P.ethan.setTool(true); G.cam.yaw = sp.yaw - .55; G.cam.pitch = .2; G.cam.zoomK = .8; G.cam.manual = 1e9; G.cam.lift = 1.1; }
  $('mg-t').textContent = opts.title || '¡Aprieta la tuerca!';
  const zone = () => { zw = Math.max(.12, .26 - i * .012); zc = zw / 2 + Math.random() * (1 - zw); $('mg-z').style.left = (zc - zw / 2) * 100 + '%'; $('mg-z').style.width = zw * 100 + '%'; $('mg-x').textContent = title + ' · ' + (opts.word || 'tuerca') + ' ' + (i + 1) + ' de ' + rounds + '. Para la aguja en la zona verde.'; };
  $('mg').hidden = false; $('mg-r').textContent = ''; zone();
  const done = () => { G.mgTick = G.mgPress = null; $('mg').hidden = true; if (work) { P.anim = null; P.ethan.setTool(false); G.cam.manual = 0; G.cam.zoomK = 1; G.cam.lift = 0; S.energy = Math.max(1, S.energy - hours * 5); S.hunger = Math.max(0, S.hunger - hours * 4.5); } G.busy = false; cb(score / rounds); };
  G.mgTick = dt => { if (wait > 0) { if ((wait -= dt) <= 0) { if (i >= rounds) done(); else zone(); } return; } pos += dir * dt * (opts.speed || .8 + i * .08); if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; } $('mg-c').style.left = pos * 100 + '%'; };
  G.mgPress = () => { if (wait > 0) return; const d = Math.abs(pos - zc), r = d < zw * .2 ? 1 : d < zw / 2 ? .7 : 0; score += r; i++; wait = .6; $('mg-r').textContent = r === 1 ? (opts.hit || '¡Clavada!') : r ? 'Bien' : (opts.miss || 'Te has pasado de rosca'); if (work) P.ethan.hit(r === 1); sfx(r ? 'hit' : 'bad'); if (work && r && G.fx) { G.fx.sparks(sp.fxX, .95, sp.fxZ, r === 1 ? 14 : 6); if (r === 1) G.fx.nuts(sp.fxX, 1, sp.fxZ, 2, 0); } };
  $('mg-b').onclick = () => G.mgPress && G.mgPress();
}

// ---------- Radio Sestao: titulares mientras conduces
const RADIO = ['Ethan pide un adelanto de nómina. El jefe se ríe durante once minutos.', 'El C4 de Ethan pasa la ITV. La ITV no se ha recuperado.', 'Ali confirma que el kebab de los domingos «está bien». No precisa de qué domingo.', 'Jokin visto por Urbinaga. Nadie sabe qué trama. Nunca nadie lo sabe.', 'La Aquarius de limón sube 5 céntimos. Ethan valora mudarse a Portugalete.', 'Sádaba lanza el SádabaCoin. Vale lo que él diga ese día.', 'Récord en el Bar Ekintza: a alguien le tocó algo en una caja. Se investiga.', 'Lourdes reconoce que no sabe qué lleva la tortilla sorpresa. «Es parte de la sorpresa».', 'Hacienda abre oficina en Sestao con vistas directas al taller de Ethan.', 'La patrulla patinete alcanza los 25 km/h. Cuesta abajo y con viento a favor.', 'Expertos en tráfico: Ethan ha encontrado sitio para aparcar. Sospechan que lo compró.', 'Sádaba niega haber vendido una PS5 llena de ladrillos: «Eran ladrillos de calidad».', 'El encargado confirma que Ethan ficha antes de que abra el taller. Nadie sabe cómo entra.', 'El chándal de Ethan, declarado prenda oficial para bodas, bautizos y comuniones.', 'Tráfico: retenciones en la Gran Vía. Alguien ha aparcado en doble fila. Otra vez.', 'El tiempo en Sestao: sirimiri. Como ayer. Como mañana.', 'Autos Sádaba amplía la garantía: ahora cubre hasta la puerta del concesionario.'];
let radioT = 25, radioI = Math.floor(Math.random() * RADIO.length), mainSt = null;
// titulares que salen del propio juego: el tiempo que hace y una calle principal del mapa
function liveLine() {
  if (!mainSt) { const set = new Set(); W.map.roads.forEach(r => { if (r.n && !r.x && !r.iso && (r.t === 'primary' || r.t === 'secondary' || r.t === 'tertiary') && !/^BI-|^N-|^A-/.test(r.n)) set.add(r.n); }); mainSt = [...set]; }
  if (Math.random() < .5 || !mainSt.length) return 'El tiempo en Sestao: ' + SKY.label.toLowerCase() + '. ' + (SKY.rain > .3 ? 'El paraguas, ni lo cierres.' : SKY.cover > .7 ? 'Paraguas por si acaso.' : 'Aprovecha, que esto no dura.');
  return 'Tráfico: circulación lenta en ' + mainSt[Math.floor(Math.random() * mainSt.length)] + '. Lo de todos los días.';
}
export function tickRadio(dt) {
  const el = $('radio'); if (G.mode !== 'car' || G.mission) { radioT = Math.min(radioT, 12); if (!el.hidden) el.hidden = true; return; }
  if ((radioT -= dt) < 0) { if (el.hidden) { radioI = (radioI + 1 + Math.floor(Math.random() * 3)) % RADIO.length; el.lastElementChild.textContent = Math.random() < .3 ? liveLine() : RADIO[radioI]; el.hidden = false; radioT = 9; } else { el.hidden = true; radioT = 30 + Math.random() * 25; } }
  // arrancar con la manguera puesta
  if (G.hose && SP.by.gas && Math.hypot(G.car.x - SP.by.gas.x, G.car.z - SP.by.gas.z) > 14) { G.hose = 0; money(-Math.min(G.S.money, 25), 'manguera de la gasolinera'); banner('¡La manguera!', 'Has arrancado con ella puesta. Clásico.'); sfx('crash'); }
}

// ---------- el móvil
export function openPhone() {
  const S = G.S, far = G.car && G.mode === 'foot' && Math.hypot(G.car.x - P.x, G.car.z - P.z) > 40;
  dialog({ icon: '📱', title: 'Móvil de Ethan', text: fmtTime(S) + ' · ' + eur(S.money) + ' · ' + rank(S)[1] + ' · ' + SKY.label, options: [
    { t: 'Agenda y avisos', d: 'Qué toca hoy, mejoras activas y mensajes', f: () => openAgenda(() => openPhone()) },
    { t: 'Sestao online', d: !NET.ok ? 'Ver a otros jugadores por el pueblo (aquí no hay conexión)' : !NET.on ? 'Apagado' : NET.n ? NET.n + ' por el pueblo ahora mismo' : 'Conectado: de momento estás solo', tag: NET.ok && NET.on ? '🟢' : '', f: () => openNet(() => openPhone()) },
    { t: 'Mapa y GPS', d: 'Busca una calle o elige a dónde ir', f: () => { closeDialog(); openMap(); } },
    { t: 'Álbum de Sestao', d: 'Barrios y sitios descubiertos', f: () => openAlbum(() => openPhone()) },
    { t: 'Vista de dron', d: 'Sobrevuela Sestao. El juego espera', f: () => { closeDialog(); G.drone(true); } },
    ...(G.mission ? [{ t: 'Dejar el encargo', d: G.mission.title, f: () => { closeDialog(); G.endMission(false, 'Encargo abandonado.'); } }] : []),
    { t: 'Llamar a la grúa', d: 'Te trae el coche hasta aquí', tag: eur(40), dis: !far || S.money < 40, f: () => { money(-40, 'grúa'); G.towCar(); closeDialog(); } },
    { t: 'Calidad gráfica', d: (G.autoQ ? 'Automática: se ajusta sola para que vaya fluido. Ahora, ' + ['', 'baja', 'media', 'alta'][G.q] + (G.rscale() < .99 ? ' al ' + Math.round(G.rscale() * 100) + ' % de resolución' : '') : ['', 'Baja: sin sombras y con menos distancia', 'Media', 'Alta: para ordenadores con buena gráfica'][G.q]) + ' · ' + Math.round(G.fps || 0) + ' fps' + (G.soft ? ' · sin aceleración gráfica' : ''), tag: G.autoQ ? 'Auto' : ['', 'Baja', 'Media', 'Alta'][G.q], f: () => { G.setQuality(G.autoQ ? 1 : G.q >= 3 ? 0 : G.q + 1); openPhone(); } },
    { t: 'Sonido', d: isMuted() ? 'Apagado' : 'Encendido', f: () => { toggleMute(); openPhone(); } },
    { t: 'Borrar la partida', d: 'Empezar de cero', f: () => dialog({ icon: '🗑️', title: '¿Borrar la partida?', text: 'Se pierde todo: dinero, horas y armario.', close: 'No, volver', options: [{ t: 'Sí, borrar', d: 'No se puede deshacer', f: () => { wipeGame(); closeDialog(); G.restart(); } }] }) }] });
}
