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
      { t: 'Cocinar algo', d: (S.fridge || 0) > 0 ? 'Pasta, huevos o lo que haya. Quedan ' + S.fridge + ' en la nevera' : 'La nevera está vacía: haz la compra en el súper', tag: '30 min', dis: !(S.fridge > 0), f: () => { S.fridge--; pass(30); feed(55, 4); toast(say(['Macarrones con tomate. Clásico.', 'Tortilla francesa con lo que había.', 'Arroz con huevo. Cena de campeones.', 'Lentejas de bote. No se lo digas a Lourdes.']), '🍳'); sfx('ok'); re(); } },
      { t: 'Abrir el armario', d: S.cos.length + ' de ' + COS.length + ' cosas conseguidas', f: () => wardrobe(s) },
      { t: 'Buzoneo', d: S.daily.buzon ? 'Hoy ya has repartido' : S.min < 540 || S.min > 1230 ? 'La de la imprenta da los folletos de 9:00 a 20:30' : 'Folletos de la frutería en cinco portales del barrio, a pie y a contrarreloj', tag: 'Curro', dis: !!G.mission || !!S.daily.buzon || S.min < 540 || S.min > 1230, f: () => { closeDialog(); G.startMission('buzon'); } },
      { t: 'La vecina del cuarto', d: S.daily.vecina ? 'Hoy ya le has hecho el recado' : 'Necesita que le bajes a la farmacia a por su receta', tag: 'Recado', dis: !!G.mission || !!S.daily.vecina || S.min < 540 || S.min > 1260, f: () => { closeDialog(); G.startMission('vecina'); } }] }); }
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
  if (s.id === 'lonja') { const m = S.min, d = wd(S), wk = d >= 5, D = S.daily, week = Math.floor((S.day - 1) / 7), bote = S.bote === week, open = wk ? (m >= 720 || m < 120) : (m >= 1020 || m < 60);
    if (!open) return closed(s, wk ? 'El finde la cuadrilla aparece a mediodía.' : 'Entre semana, la cuadrilla llega a partir de las 17:00.');
    const cena = (d === 4 || d === 5) && m >= 1230 && m < 1430;
    return dialog({ icon: '🛋️', title: 'Lonja de la cuadrilla', text: say(['Huele a patatas fritas y a sofá viejo. Como siempre.', 'Alguien ha dejado la Play encendida desde el martes.', 'En la pizarra: «CUOTA DEL MES: ¿QUIÉN FALTA?». Todos miran a Ethan.', 'Suena la misma lista de reproducción desde 2019.']), options: [
      { t: 'Echar la tarde', d: 'Sofá, música y lo que salga. Una hora que sienta bien', tag: '1 h', f: () => { pass(60); feed(-4, 6); addBuff('lonja', 'Con la cuadrilla', '🛋️', 'regen', 1.1, 10); toast(say(['Se habla de fútbol, de coches y de nada. Perfecto.', 'Debate de una hora sobre cuál es el mejor kebab. Gana Ali.', 'Alguien enseña un vídeo de un gato. Se ve once veces.']), '🛋️'); re(); } },
      { t: 'Partida a la Play', d: D.play ? 'Por hoy ya has jugado bastante' : 'Un partido contra el del sofá: para la aguja en lo verde para chutar', tag: '30 min', dis: !!D.play, f: () => { D.play = 1;
        workBlock(0, 'Partida a la Play', q => { pass(30); if (q >= .6) { banner('¡Ganas a la Play!', Math.round(2 + q * 3) + ' a ' + Math.round(Math.random() * 2) + '. El del sofá pide la revancha y le dices que mañana.', 3000); sfx('win'); } else toast(say(['Pierdes 3 a 1. La culpa, del mando.', 'Empate a cero. Nadie quiere hablar de ello.']), '🎮'); re(); },
          { title: 'Partida a la Play', word: 'chut', steps: 5, hit: '¡Golazo!', miss: 'Al palo', speed: 1.25 }); } },
      { t: 'Poner bote', d: bote ? 'Esta semana ya has puesto' : 'Para las patatas y los refrescos de la semana', tag: eur(5), dis: bote, f: buy(5, () => { S.bote = week; toast('Bote puesto: esta semana los refrescos de la lonja, gratis.', '🪙'); }) },
      { t: 'Refresco de la nevera', d: bote ? 'Del bote de la semana' : 'Primero hay que poner bote', dis: !bote, f: () => { feed(0, 12); pass(5); toast('Refresco de la nevera de la lonja. Está caliente, pero es gratis.', '🥤'); re(); } }]
      .concat(cena ? [{ t: 'Cena de cuadrilla', d: D.cena ? 'Ya has cenado. Y repetido' : 'Viernes y sábado por la noche: entre todos, y alguien quema algo', tag: eur(10), dis: !!D.cena, f: buy(10, () => { D.cena = 1; pass(90); feed(70, 4); addBuff('cena', 'Cena de cuadrilla', '🍖', 'all', 1.1, 14); toast('Cena de cuadrilla: chuletillas, patatas y sobremesa larga.', '🍖'); sfx('ok'); }) }] : []) }); }
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
  if (p.c === 'bar' || p.c === 'cafe') barFun(p, o, buy, re);
  if (p.c === 'fronton' || p.c === 'campo') sportFun(p, o, re);
  if (p.c === 'sport') o.push({ t: 'Sesión de gimnasio', d: S.daily.gym ? 'Por hoy ya has sudado' : S.energy < 25 ? 'Estás demasiado reventado' : S.min < 420 || S.min > 1290 ? 'Abre de 7:00 a 21:30' : 'Una hora de pesas y cinta. Cansa, pero luego descansas mejor', tag: eur(6), dis: !!S.daily.gym || S.energy < 25 || S.min < 420 || S.min > 1290, f: buy(6, () => { S.daily.gym = 1; pass(60); feed(-8, -12); addBuff('sport', 'En forma', '💪', 'regen', 1.2, 18); toast(say(['Piernas: hechas. Escaleras de Sestao: temidas.', 'Has hecho cinta. Mirando el móvil, pero cinta.', 'El monitor dice que «bien». Ethan se lo cree.']), '🏋️'); sfx('ok'); }) });
  if (p.c === 'lift' && p.to) o.push({ t: 'Coger el ascensor', d: 'Gratis, como los de verdad', f: () => { closeDialog(); G.busy = true; sfx('door'); fade(true); setTimeout(() => { P.x = p.to[0]; P.z = p.to[1]; G.px = P.x; G.pz = P.z; P.y = -1e3; fade(false); G.busy = false; toast('Ding. Otra altura de Sestao.', '🛗'); }, 700); } });
  else if (p.c === 'rest') o.push({ t: 'Menú del día', d: 'Primero, segundo y postre', tag: eur(13), f: buy(13, () => { feed(80, 6); pass(45); toast('Menú del día. Ethan sale rodando.', '🍽️'); }) }, { t: 'Plato combinado', d: 'Rápido y contundente', tag: eur(9), f: buy(9, () => { feed(55, 2); pass(25); toast('Plato combinado.', '🍽️'); }) });
  else if (p.c === 'fast') o.push({ t: 'Bocadillo', d: 'Para llevar', tag: eur(5), f: buy(5, () => { feed(45, 0); pass(10); toast('Un bocadillo.', '🥪'); }) }, { t: 'Ración de patatas', d: 'Con lo que haya de salsa', tag: eur(3), f: buy(3, () => { feed(22, 0); pass(6); toast('Patatas.', '🍟'); }) });
  else if (p.c === 'bakery') o.push({ t: 'Barra de pan', d: 'Recién hecha', tag: eur(1), f: buy(1, () => { feed(12, 0); toast('Una barra de pan.', '🥖'); }) }, { t: 'Palmera de chocolate', d: 'Azúcar para aguantar', tag: eur(2), f: buy(2, () => { feed(20, 5); toast('Una palmera de chocolate.', '🥐'); }) });
  if (p.c === 'super') o.push({ t: 'Hacer la compra', d: (S.fridge || 0) >= 5 ? 'La nevera ya está llena' : 'Para cinco comidas en casa (ahora: ' + (S.fridge || 0) + ')', tag: eur(16), dis: (S.fridge || 0) >= 5, f: buy(16, () => { S.fridge = 5; pass(20); toast('Compra hecha: la nevera, llena.', '🛒'); }) });
  if (p.c === 'super' || p.c === 'food') o.push({ t: 'Refresco', d: 'Sube la energía', tag: eur(2), f: buy(2, () => { feed(0, 14); toast('Un refresco.', '🥤'); }) }, { t: 'Bolsa de patatas', d: 'Para picar', tag: eur(2), f: buy(2, () => { feed(16, 0); toast('Patatas de bolsa.', '🥔'); }) }, { t: 'Bocata de lomo', d: 'El menú del currante', tag: eur(5), f: buy(5, () => { feed(42, 2); toast('Bocata de lomo.', '🥖'); }) });
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
// ---------- lo que se hace en un bar además de comer: pintxo-pote, futbolín, mus y el partido del Athletic
function barFun(p, o, buy, re) {
  const S = G.S, m = S.min, d = wd(S), bar = p.c === 'bar', D = S.daily;
  if (bar && (d === 3 || d === 4) && m >= 1140 && m < 1350) o.push({ t: 'Pintxo-pote', d: (D.pote || []).indexOf(p.n) >= 0 ? 'Aquí ya has caído. La gracia es ir de bar en bar' : 'Zurito y pintxo. Jueves y viernes por la tarde' + ((D.pote || []).length ? ' · llevas ' + D.pote.length : ''), tag: eur(2), dis: (D.pote || []).indexOf(p.n) >= 0, f: buy(2, () => {
    D.pote = (D.pote || []).concat([p.n]); feed(16, 4); pass(15); const n = D.pote.length; if (n === 3) { addBuff('pote', 'Ruta de pintxo-pote', '🍢', 'regen', 1.3, 14); moment('pote'); banner('Ruta de pintxo-pote', 'Tres bares. Esta noche se duerme de maravilla.', 3200); sfx('win'); } else toast(['Zurito y pintxo de tortilla.', 'Zurito y un gilda. Pica.', 'Zurito y pintxo de chorizo a la sidra.', 'Zurito y mini de calamares.'][n % 4] + (n < 3 ? ' A por el siguiente bar.' : ''), '🍢'); }) });
  if (bar && m >= 600 && m < 1380 && !D.futbolin) o.push({ t: 'Futbolín', d: 'Una partida con el de la barra. Si ganas, paga él la ronda', tag: eur(1), f: () => { if (S.money < 1) { toast('No te llega el dinero.', '💸'); return; } money(-1); D.futbolin = 1;
    workBlock(0, 'Futbolín', q => { if (q >= .6) { money(2, 'ronda ganada al futbolín'); feed(0, 5); toast('¡Ganas ' + (5 + Math.round(q * 5)) + ' a ' + Math.round(4 + Math.random() * 4) + '! Paga él.', '⚽'); sfx('win'); } else toast('Pierdes ' + Math.round(3 + q * 5) + ' a 10. Hoy no era el día.', '⚽'); pass(15); re(); }, { title: 'Futbolín', word: 'chut', steps: 5, hit: '¡Golazo!', miss: 'Al palo', speed: 1.05 }); } });
  if (bar && m >= 960 && m < 1200 && !D.mus) o.push({ t: 'Echar un mus', d: 'Con los jubilados de la mesa del fondo. Se juegan el café', tag: eur(1.5), dis: S.money < 1.5, f: () => { D.mus = 1; pass(40); const r = Math.random(); if (r < .45) { money(1.5, 'café ganado al mus'); toast(['¡Órdago a la grande y lo ven! Ganas el café.', 'Duples de reyes. Los jubilados se miran. Ganas.'][Math.floor(Math.random() * 2)], '🃏'); sfx('win'); } else { money(-1.5); toast(['Te pillan las señas a la primera. Pagas el café.', 'Envidas a pares con una pareja de cuatros. Pagas tú.'][Math.floor(Math.random() * 2)], '🃏'); } feed(0, 3); re(); } });
  if (bar && d >= 5 && m >= 960 && m < 1260 && !D.athletic) o.push({ t: 'Ver el partido del Athletic', d: 'Caña y el partido en la tele del bar', tag: eur(3), f: buy(3, () => { D.athletic = 1; pass(105); feed(6, -4); const r = Math.random();
    if (r < .48) { addBuff('leones', 'Ha ganado el Athletic', '🦁', 'all', 1.15, 24); moment('athletic'); banner('¡Gana el Athletic!', 'Todo el bar en pie. Mañana, todo sale mejor.', 3200); sfx('win'); } else if (r < .74) toast('Empate. «Con este árbitro, bastante.»', '🦁'); else toast('Pierde el Athletic. El bar entero mira al suelo.', '🦁'); }) });
}
// frontón y campo de fútbol del mapa: un partido rápido (cansa, pero sienta bien)
function sportFun(p, o, re) {
  const S = G.S, D = S.daily, fr = p.c === 'fronton', m = S.min, k = fr ? 'pala' : 'fut';
  if (m < 480 || m >= 1320) { o.push({ t: fr ? 'Partido de pala' : 'Partidillo', d: 'De noche no hay nadie para jugar', dis: true, f: () => { } }); return; }
  o.push({ t: fr ? 'Partido de pala' : 'Partidillo de fútbol', d: D[k] ? 'Por hoy ya has jugado' : S.energy < 20 ? 'Estás demasiado reventado' : fr ? 'Contra la pared, con los del barrio. A 22 tantos' : 'Cinco contra cinco con la cuadrilla', dis: !!D[k] || S.energy < 20, f: () => { D[k] = 1;
    workBlock(0, fr ? 'Frontón' : 'Partidillo', q => { feed(-10, -14); pass(fr ? 50 : 60); if (q >= .6) { addBuff('sport', 'En forma', '💪', 'regen', 1.2, 18); banner(fr ? '¡Ganas a pala!' : '¡Gana tu equipo!', fr ? '22 a ' + Math.round(10 + Math.random() * 10) + '. Los del barrio piden la revancha.' : Math.round(3 + q * 3) + ' a ' + Math.round(1 + Math.random() * 2) + '. Ethan marca uno de rebote.', 3000); sfx('win'); moment(k); } else toast(fr ? 'Pierdes a pala. La pared siempre gana.' : 'Pierde tu equipo. La culpa, del portero.', fr ? '🎾' : '⚽'); re(); },
      { title: fr ? 'Frontón' : 'Partidillo', word: fr ? 'pelotazo' : 'disparo', steps: 6, hit: fr ? '¡Al ancho!' : '¡Golazo!', miss: fr ? 'Falta' : 'Fuera', speed: 1.1 }); } });
}
// ---------- Bizkaibus: desde cualquier parada del mapa a la parada más cercana de uno de los sitios de Ethan
export function enterBus(st) {
  const S = G.S, cost = 1.5, h = S.min, opts = [], used = new Set([st]);
  if (h < 360 || h >= 1380) return dialog({ icon: '🚌', title: 'Bizkaibus · ' + st.n, text: 'A estas horas ya no pasa ninguno. El primero, a las 6:00.', options: [] });
  SP.list.forEach(sp => { let best = null, bd = 1e9; ST.stops.forEach(q => { const d = Math.hypot(q.x - sp.x, q.z - sp.z); if (d < bd) { bd = d; best = q; } }); if (!best || used.has(best) || bd > 420 || Math.hypot(best.x - st.x, best.z - st.z) < 250) return; used.add(best);
    const km = Math.hypot(best.x - st.x, best.z - st.z) * 1.3 / 1000, wait = 3 + Math.floor(Math.random() * 10), ride = Math.round(km / 20 * 60) + 2;
    opts.push({ t: sp.icon + ' ' + sp.n, d: 'Parada ' + best.n + ' · espera unos ' + wait + ' min y ' + ride + ' de viaje', tag: eur(cost), f: () => { if (S.money < cost) { toast('No te llega para el billete.', '💸'); sfx('bad'); return; } money(-cost); closeDialog(); G.busy = true; fade(true); sfx('door');
      setTimeout(() => { P.x = best.x; P.z = best.z; G.px = P.x; G.pz = P.z; pass(wait + ride); fade(false); G.busy = false; banner('Bizkaibus · ' + best.n, sp.n + ' queda a ' + Math.round(bd) + ' m · ' + fmtTime(S), 2600); }, 900); } }); });
  dialog({ icon: '🚌', title: 'Bizkaibus · ' + st.n, text: opts.length ? '¿A dónde vas? El coche se queda donde lo dejaste.' : 'Desde aquí no te lleva cerca de ninguno de tus sitios.', options: opts.slice(0, 9) });
}
// ---------- metro y tren: de una estación a otra, pagando el billete
export function enterTransit(t) {
  const S = G.S, metro = t.k === 'metro', cost = metro ? 1.7 : 1.95, seen = new Set([t.n]), opts = [];
  ST.transit.forEach(d => { if (d.k !== t.k || seen.has(d.n)) return; seen.add(d.n); const km = Math.hypot(d.x - t.x, d.z - t.z) / 1000;
    opts.push({ t: d.n, d: 'A ' + km.toFixed(1).replace('.', ',') + ' km', tag: eur(cost), f: () => { if (S.money < cost) { toast('No te llega para el billete.', '💸'); sfx('bad'); return; } money(-cost); closeDialog(); G.busy = true; fade(true); sfx('door');
      setTimeout(() => { P.x = d.ex !== undefined ? d.ex : d.x + 1.4; P.z = d.ez !== undefined ? d.ez : d.z + 1.4; G.px = P.x; G.pz = P.z; pass(4 + km * 5); fade(false); G.busy = false; banner(d.n, (metro ? 'Metro' : 'Tren') + ' · ' + fmtTime(S), 2400); }, 900); } }); });
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
// al acabar la tarde, a veces entra un cliente con prisa o Manolo pide un favor: se decide (más dinero o a casa a buscar sitio antes)
function rush() {
  const S = G.S; if (S.daily.rush || Math.random() > .35 || S.noEv) { endShift(); return; } S.daily.rush = 1;
  const C = [['Un cliente con prisa', 'Se le ha encendido un testigo y mañana se va de viaje. «Te lo pago bien si me lo miras ahora.»', 'Mirárselo ahora', 14], ['Manolo pide un favor', '«Hay que sacar la furgoneta del frutero hoy sin falta. ¿Te quedas un rato?»', 'Quedarse un rato', 11], ['La grúa trae un coche', 'Un Clio con el embrague hecho polvo. El de la grúa quiere firmar ya.', 'Atenderlo', 12]][Math.floor(Math.random() * 3)];
  dialog({ icon: '🔧', title: C[0], text: C[1] + ' Ojo: cuanto más tarde vuelvas, más difícil aparcar.', noClose: true, options: [
    { t: C[2], d: 'Media hora más. Según lo bien que salga, hasta ' + eur(Math.round(C[3] * 1.5)), tag: '+30 min', f: () => workBlock(.5, C[0], q => { pass(30); money(Math.round(C[3] * (.5 + q)), C[0].toLowerCase()); endShift(); }, { steps: 3 }) },
    { t: 'Hoy no, que hay que aparcar', d: 'Manolo pone cara. Mañana se le pasa', f: () => { closeDialog(); endShift(); } }] });
}
function shiftNext() {
  const S = G.S, m = S.min;
  if (!S.daily.am && m < T_LUNCH - 20) { const hrs = (T_LUNCH - Math.max(m, T_IN - 30)) / 60; return workBlock(hrs, 'Turno de mañana', q => { S.daily.am = [hrs, q]; setTime(T_LUNCH); lunch(); }); }
  if (!S.daily.lunch && m < T_BACK - 10) return lunch();
  if (!S.daily.pm) { const start = Math.max(m, T_BACK), hrs = (T_OUT - start) / 60; if (hrs >= .4) return workBlock(hrs, 'Turno de tarde', q => { S.daily.pm = [hrs, q]; setTime(T_OUT); rush(); }); }
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
// averías para el diagnóstico: el síntoma que cuenta el cliente, la buena y dos que despistan
const FAULTS = [
  ['Chirría al frenar, sobre todo por la mañana', 'Pastillas de freno gastadas', ['Amortiguador roto', 'Falta líquido de dirección']],
  ['Hace «clac-clac» al girar con el volante a tope', 'Junta homocinética', ['Bujías', 'Filtro del aire']],
  ['Echa humo azul por el escape', 'Quema aceite (segmentos)', ['Inyector de agua', 'Neumático pinchado']],
  ['Humo blanco espeso que huele dulce', 'Junta de culata', ['Pastillas de freno', 'Batería']],
  ['El volante vibra a partir de 100', 'Ruedas sin equilibrar', ['Junta de culata', 'Alternador']],
  ['Por la mañana hace «clic» y no arranca', 'Batería descargada', ['Embrague', 'Escobillas']],
  ['En los atascos se calienta y pita', 'Electroventilador', ['Pastillas de freno', 'Junta homocinética']],
  ['Se va hacia un lado en recta', 'Alineación de la dirección', ['Bujías', 'Filtro del gasoil']],
  ['Sube de vueltas pero no anda, y huele a quemado', 'Embrague gastado', ['Batería', 'Escobillas']],
  ['Se enciende el testigo de la aceitera', 'Falta aceite', ['Falta agua del limpia', 'Cinturón mal puesto']],
  ['Las luces bajan cuando paras y el testigo de batería se enciende', 'Alternador', ['Pastillas de freno', 'Embrague']],
  ['Pega golpes secos en los baches', 'Amortiguadores', ['Bujías', 'Termostato']]];
const KIND_TXT = { nut: '¡Aprieta la tuerca!', wheel: 'Cambio de rueda', oil: 'Cambio de aceite', diag: 'Diagnóstico', bat: 'Arrancar con pinzas', paint: 'Pulir arañazos', quote: 'Presupuesto' };
// las pinzas, en el orden de verdad: así no salta la chispa junto a la batería
const BAT = ['Rojo al + de la batería muerta', 'Rojo al + de la batería buena', 'Negro al − de la batería buena', 'Negro a masa del coche averiado (chasis)'];
// un rato de minijuego. En el taller se turnan seis: apretar tuercas (para la aguja en lo verde), cambiar una rueda (las cinco tuercas
// en estrella, deprisa), cambiar el aceite (parar en la marca), diagnosticar (qué le pasa al coche por lo que cuenta el cliente),
// arrancar con pinzas (las cuatro en su orden), pulir arañazos (tocar los que van saliendo en el capó antes de que se pierdan) y
// hacer un presupuesto de cabeza (pieza más horas de mano de obra).
// Al acabar llama a cb(calidad de 0 a 1). opts: { title, word, steps } (con title es otra cosa que no es el taller: solo la aguja)
export function workBlock(hours, title, cb, opts) {
  opts = opts || {}; closeDialog(); G.busy = true; const S = G.S, sp = SP.by.taller, rounds = opts.plan ? opts.plan.length : opts.steps || Math.max(3, Math.min(9, Math.round(hours * 2))), work = !opts.title; let i = 0, score = 0, pos = 0, dir = 1, zc = .5, zw = .26, wait = 0, kind = 'nut', K = null;
  if (work) { if (G.mode === 'car') G.leaveCar(true); P.x = sp.workX; P.z = sp.workZ; P.yaw = sp.workYaw; P.anim = 'work'; P.ethan.play('work'); P.ethan.setTool(true); G.cam.yaw = sp.yaw - .55; G.cam.pitch = .2; G.cam.zoomK = .8; G.cam.manual = 1e9; G.cam.lift = 1.1; }
  // el orden de los trabajos del bloque: siempre empieza con tuercas y no repite el mismo dos veces seguidas
  const plan = []; for (let k = 0; k < rounds; k++) { if (!work || k === 0) { plan.push('nut'); continue; } const L = ['nut', 'wheel', 'oil', 'diag', 'bat', 'paint', 'quote'].filter(q => q !== plan[k - 1] && (q !== 'bat' || plan.indexOf('bat') < 0)); plan.push(L[Math.floor(Math.random() * L.length)]); }
  if (opts.plan) { plan.length = 0; opts.plan.forEach(q => plan.push(q)); }      // para probar un juego concreto
  const box = $('mg-k'), bar = $('mg-bar'), btn = $('mg-b');
  const show = custom => { bar.hidden = custom; box.hidden = !custom; btn.hidden = custom && kind !== 'oil'; if (!custom) box.innerHTML = ''; };
  const head = (t, x) => { $('mg-t').textContent = work ? KIND_TXT[kind] : (opts.title || KIND_TXT.nut); $('mg-x').textContent = title + ' · ' + t + ' (' + (i + 1) + ' de ' + rounds + '). ' + x; };
  const finish = (r, msg) => { if (wait > 0) return; score += r; i++; wait = .7; K = null; $('mg-r').textContent = msg; if (work) P.ethan.hit(r >= .9); sfx(r >= .5 ? 'hit' : 'bad'); if (work && r >= .5 && G.fx) { G.fx.sparks(sp.fxX, .95, sp.fxZ, r >= .9 ? 14 : 6); if (r >= .9) G.fx.nuts(sp.fxX, 1, sp.fxZ, 2, 0); } };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const start = () => { kind = plan[i]; btn.textContent = '¡Ahora!'; G.mgDiag = G.mgBat = null;
    if (kind === 'nut') { show(false); zw = Math.max(.12, .26 - i * .012); zc = zw / 2 + Math.random() * (1 - zw); $('mg-z').style.left = (zc - zw / 2) * 100 + '%'; $('mg-z').style.width = zw * 100 + '%'; head((opts.word || 'tuerca'), 'Para la aguja en la zona verde.'); return; }
    show(true); box.innerHTML = '';
    if (kind === 'wheel') { // las cinco tuercas en estrella: se enciende la que toca
      head('rueda', 'Aprieta las tuercas en estrella: la que brilla, deprisa (o su número).'); const ord = [0, 2, 4, 1, 3], w = el('div', 'mg-wheel'), nuts = []; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5, b = el('button', 'nut', String(k + 1)); b.type = 'button'; b.style.left = (50 + Math.cos(a) * 34) + '%'; b.style.top = (50 + Math.sin(a) * 34) + '%'; w.appendChild(b); nuts.push(b); }
      box.appendChild(w); K = { t: 0, step: 0, err: 0, ord, nuts }; const lit = () => nuts.forEach((b, k) => b.classList.toggle('on', K && k === K.ord[K.step]));
      const tap = k => { if (!K || K.kind) return; if (k === K.ord[K.step]) { nuts[k].classList.add('ok'); sfx('ui'); K.step++; if (K.step >= 5) { const r = Math.max(0, Math.min(1, 1.15 - K.t / 5.5 - K.err * .2)); finish(r, r >= .9 ? '¡Rueda puesta en un santiamén!' : r >= .5 ? 'Rueda puesta.' : 'Puesta, pero a ese ritmo el cliente se jubila.'); return; } } else { K.err++; nuts[k].classList.add('bad'); setTimeout(() => nuts[k].classList.remove('bad'), 250); sfx('bad'); } lit(); };
      nuts.forEach((b, k) => { b.onclick = () => tap(k); }); K.key = k => { const m = /^(?:Digit|Numpad)([1-5])$/.exec(k); if (m) { tap(+m[1] - 1); return true; } return false; }; lit(); return; }
    if (kind === 'oil') { // pulsa para echar aceite y otra vez para parar en la marca
      head('aceite', 'Pulsa para echar y otra vez para parar en la marca.'); const mk = .62 + Math.random() * .25, g = el('div', 'mg-oil'), fill = el('i'), line = el('b'); line.style.bottom = mk * 100 + '%'; g.appendChild(fill); g.appendChild(line); box.appendChild(g); btn.hidden = false; btn.textContent = 'Echar aceite';
      K = { lv: 0, on: false, mk, fill, v: .22 + Math.random() * .1 }; K.press = () => { if (!K.on && K.lv === 0) { K.on = true; btn.textContent = '¡Para!'; return; } if (K.on) { K.on = false; const d = Math.abs(K.lv - K.mk), r = d < .025 ? 1 : d < .06 ? .7 : d < .12 ? .35 : 0; finish(r, r >= 1 ? '¡Clavado en la marca!' : r >= .7 ? 'Casi en la marca.' : K.lv > K.mk ? 'Te has pasado: a sacar aceite.' : 'Se ha quedado corto.'); } }; return; }
    if (kind === 'diag') { // qué le pasa: tres respuestas, ocho segundos
      const f = FAULTS[Math.floor(Math.random() * FAULTS.length)], opts2 = [f[1]].concat(f[2]).sort(() => Math.random() - .5); head('diagnóstico', '«' + f[0] + '». ¿Qué le pasa?'); const l = el('div', 'mg-diag'); K = { t: 0, lim: 9 }; G.mgDiag = f[1];
      const pick = o => { if (!K) return; const ok = o === f[1]; finish(ok ? (K.t < 4 ? 1 : .8) : 0, ok ? 'Exacto: ' + f[1].toLowerCase() + '.' : 'No: era ' + f[1].toLowerCase() + '. Manolo suspira.'); };
      opts2.forEach((o, k) => { const b = el('button', null, (k + 1) + '. ' + o); b.type = 'button'; b.onclick = () => pick(o); l.appendChild(b); }); box.appendChild(l); K.key = k => { const m = /^(?:Digit|Numpad)([1-3])$/.exec(k); if (m) { pick(opts2[+m[1] - 1]); return true; } return false; }; K.timeout = () => finish(0, 'Se ha cansado de esperar. Era ' + f[1].toLowerCase() + '.'); return; }
    if (kind === 'bat') { // pinzas: las cuatro, en orden; equivocarse hace chispa
      head('pinzas', 'Engancha las cuatro pinzas en su orden (o su número).'); const bt = el('div', 'mg-bat'); [['Muerta'], ['Buena']].forEach(q => { const sp2 = el('span'); sp2.appendChild(el('i')); sp2.appendChild(document.createTextNode(q[0])); bt.appendChild(sp2); }); box.appendChild(bt);
      const ord = BAT.map((t, k) => k).sort(() => Math.random() - .5), l = el('div', 'mg-diag'), bs = []; K = { t: 0, step: 0, err: 0 };
      const tap = q => { if (!K) return; const k = ord[q]; if (k === K.step) { bs[q].classList.add('ok'); bs[q].disabled = true; sfx('ui'); K.step++; if (K.step >= 4) { const r = Math.max(0, Math.min(1, 1.1 - K.t / 14 - K.err * .3)); finish(r, r >= .9 ? '¡Arranca a la primera! El cliente te mira como a un mago.' : r >= .5 ? 'Arranca. Bien.' : 'Arranca… después de unos cuantos chispazos.'); } } else { K.err++; bs[q].classList.add('bad'); setTimeout(() => bs[q] && bs[q].classList.remove('bad'), 300); sfx('bad'); $('mg-r').textContent = '¡Chispazo! Esa no toca todavía.'; } };
      ord.forEach((k, q) => { const b = el('button', null, (q + 1) + '. ' + BAT[k]); b.type = 'button'; b.onclick = () => tap(q); l.appendChild(b); bs.push(b); }); box.appendChild(l); G.mgBat = () => K ? ord.indexOf(K.step) : -1;
      K.key = k => { const m = /^(?:Digit|Numpad)([1-4])$/.exec(k); if (m) { tap(+m[1] - 1); return true; } return false; }; return; }
    if (kind === 'quote') { // presupuesto de cabeza: la pieza más las horas a 40 € (el IVA, otro día)
      const PZ = [['Pastillas de freno', 45, 1], ['Batería', 95, .5], ['Kit de embrague', 260, 4], ['Amortiguador', 70, 1.5], ['Correa de distribución', 180, 3], ['Alternador', 150, 2], ['Bujías', 30, .5], ['Termostato', 35, 1.5]], z = PZ[Math.floor(Math.random() * PZ.length)], ok = z[1] + z[2] * 40, f = v => v + ' €';
      const opts3 = [ok, ok + (Math.random() < .5 ? 20 : -20), ok + (Math.random() < .5 ? 40 : -40)].filter((v, k, a) => a.indexOf(v) === k && v > 0).sort(() => Math.random() - .5);
      head('presupuesto', z[0] + ': ' + f(z[1]) + ' la pieza y ' + String(z[2]).replace('.', ',') + ' h de mano de obra a 40 €/h. ¿Cuánto le dices?'); const l = el('div', 'mg-diag'); K = { t: 0, lim: 12 }; G.mgDiag = f(ok);
      const pick = v => { if (!K) return; finish(v === ok ? (K.t < 6 ? 1 : .8) : 0, v === ok ? 'Cuadra: ' + f(ok) + '. El cliente ni pestañea.' : 'No cuadra: eran ' + f(ok) + '. Manolo lo rehace con la calculadora.'); };
      opts3.forEach((v, k) => { const b = el('button', null, (k + 1) + '. ' + f(v)); b.type = 'button'; b.onclick = () => pick(v); l.appendChild(b); }); box.appendChild(l); K.key = k => { const m = /^(?:Digit|Numpad)([1-3])$/.exec(k); if (m && opts3[+m[1] - 1] !== undefined) { pick(opts3[+m[1] - 1]); return true; } return false; }; K.timeout = () => finish(0, 'El cliente se ha ido a otro taller. Eran ' + f(ok) + '.'); return; }
    if (kind === 'paint') { // arañazos en el capó: salen de uno en uno, se pulen tocándolos (o con el teclado numérico, como está dibujado)
      head('capó', 'Toca cada arañazo antes de que se pierda (teclas 1-9).'); const gr = el('div', 'mg-grid'), cells = []; for (let k = 0; k < 9; k++) { const b = el('button', null, String([7, 8, 9, 4, 5, 6, 1, 2, 3][k])); b.type = 'button'; gr.appendChild(b); cells.push(b); } box.appendChild(gr);
      K = { t: 0, cur: -1, life: 0, n: 0, hit: 0, max: 7 }; const next = () => { if (K.cur >= 0) cells[K.cur].classList.remove('on'); if (K.n >= K.max) { const r = K.hit / K.max; finish(r >= .99 ? 1 : r >= .7 ? .75 : r >= .45 ? .4 : 0, r >= .99 ? '¡Como el día que salió del concesionario!' : r >= .7 ? 'Ha quedado apañado.' : 'Se ven más rayas que antes.'); return; } let c; do c = Math.floor(Math.random() * 9); while (c === K.cur); K.cur = c; K.life = Math.max(.75, 1.35 - K.n * .08); K.n++; cells[c].classList.add('on'); };
      const tap = c => { if (!K || c !== K.cur) { if (K) sfx('bad'); return; } cells[c].classList.remove('on'); cells[c].classList.add('ok'); setTimeout(() => cells[c] && cells[c].classList.remove('ok'), 160); K.hit++; sfx('ui'); K.cur = -1; K.life = .18; };
      cells.forEach((b, k) => { b.onclick = () => tap(k); }); K.key = k => { const m = /^(?:Digit|Numpad)([1-9])$/.exec(k); if (m) { tap([6, 7, 8, 3, 4, 5, 0, 1, 2][+m[1] - 1]); return true; } return false; }; K.tick = dt => { if ((K.life -= dt) <= 0) next(); }; K.life = .3; } };
  $('mg').hidden = false; $('mg-r').textContent = ''; start();
  const done = () => { G.mgTick = G.mgPress = G.mgKey = G.mgDiag = G.mgBat = null; $('mg').hidden = true; show(false); btn.textContent = '¡Ahora!'; btn.hidden = false; if (work) { P.anim = null; P.ethan.setTool(false); G.cam.manual = 0; G.cam.zoomK = 1; G.cam.lift = 0; S.energy = Math.max(1, S.energy - hours * 5); S.hunger = Math.max(0, S.hunger - hours * 4.5); } G.busy = false; cb(score / rounds); };
  G.mgTick = dt => { if (wait > 0) { if ((wait -= dt) <= 0) { $('mg-r').textContent = ''; if (i >= rounds) done(); else start(); } return; }
    if (kind === 'nut') { pos += dir * dt * (opts.speed || .8 + i * .08); if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; } $('mg-c').style.left = pos * 100 + '%'; return; }
    if (!K) return; if (kind === 'wheel') { K.t += dt; if (K.t > 12) finish(Math.max(0, K.step / 5 * .5 - K.err * .1), 'Se te ha hecho de noche con la rueda.'); }
    else if (kind === 'oil' && K.on) { K.lv = Math.min(1, K.lv + dt * K.v); K.fill.style.height = K.lv * 100 + '%'; if (K.lv >= 1) { K.on = false; finish(0, 'Rebosa por todas partes. Fregona.'); } }
    else if (kind === 'diag' || kind === 'quote') { K.t += dt; if (K.t > K.lim && K.timeout) K.timeout(); }
    else if (kind === 'bat') { K.t += dt; if (K.t > 20) finish(Math.max(0, K.step / 4 * .4), 'El cliente ha llamado a la grúa.'); }
    else if (kind === 'paint' && K.tick) K.tick(dt); };
  G.mgPress = () => { if (wait > 0) return; if (kind === 'nut') { const d = Math.abs(pos - zc), r = d < zw * .2 ? 1 : d < zw / 2 ? .7 : 0; finish(r, r === 1 ? (opts.hit || '¡Clavada!') : r ? 'Bien' : (opts.miss || 'Te has pasado de rosca')); return; } if (K && K.press) K.press(); };
  G.mgKey = k => !!(K && K.key && K.key(k));
  btn.onclick = () => G.mgPress && G.mgPress();
}

G.workBlock = workBlock;      // para las pruebas

// ---------- Radio Sestao: titulares mientras conduces
const RADIO = ['Ethan pide un adelanto de nómina. El jefe se ríe durante once minutos.', 'El C4 de Ethan pasa la ITV. La ITV no se ha recuperado.', 'Ali confirma que el kebab de los domingos «está bien». No precisa de qué domingo.', 'Jokin visto por Urbinaga. Nadie sabe qué trama. Nunca nadie lo sabe.', 'La Aquarius de limón sube 5 céntimos. Ethan valora mudarse a Portugalete.', 'Sádaba lanza el SádabaCoin. Vale lo que él diga ese día.', 'Récord en el Bar Ekintza: a alguien le tocó algo en una caja. Se investiga.', 'Lourdes reconoce que no sabe qué lleva la tortilla sorpresa. «Es parte de la sorpresa».', 'Hacienda abre oficina en Sestao con vistas directas al taller de Ethan.', 'La patrulla patinete alcanza los 25 km/h. Cuesta abajo y con viento a favor.', 'Expertos en tráfico: Ethan ha encontrado sitio para aparcar. Sospechan que lo compró.', 'Sádaba niega haber vendido una PS5 llena de ladrillos: «Eran ladrillos de calidad».', 'El encargado confirma que Ethan ficha antes de que abra el taller. Nadie sabe cómo entra.', 'El chándal de Ethan, declarado prenda oficial para bodas, bautizos y comuniones.', 'Tráfico: retenciones en la Gran Vía. Alguien ha aparcado en doble fila. Otra vez.', 'El tiempo en Sestao: sirimiri. Como ayer. Como mañana.', 'Autos Sádaba amplía la garantía: ahora cubre hasta la puerta del concesionario.'];
let radioT = 25, radioI = Math.floor(Math.random() * RADIO.length), mainSt = null;
// titulares que salen del propio juego: el tiempo que hace y una calle principal del mapa
function liveLine() {
  if (!mainSt) { const set = new Set(); W.map.roads.forEach(r => { if (r.n && !r.x && !r.iso && (r.t === 'primary' || r.t === 'secondary' || r.t === 'tertiary') && !/^BI-|^N-|^A-/.test(r.n)) set.add(r.n); }); mainSt = [...set]; }
  if (Math.random() < .5 || !mainSt.length) return 'El tiempo en Sestao: ' + SKY.label.toLowerCase() + '. ' + (SKY.rain > .3 ? 'El paraguas, ni lo cierres.' : SKY.cover > .62 ? 'El Serantes tiene txapela: paraguas.' : SKY.cover > .5 ? 'Paraguas por si acaso.' : 'Se ve el Serantes clarito. Aprovecha, que esto no dura.');
  return 'Tráfico: circulación lenta en ' + mainSt[Math.floor(Math.random() * mainSt.length)] + '. Lo de todos los días.';
}
export function tickRadio(dt) {
  const el = $('radio'); if (G.mode !== 'car' || G.mission) { radioT = Math.min(radioT, 12); if (!el.hidden) el.hidden = true; return; }
  if ((radioT -= dt) < 0) { if (el.hidden) { radioI = (radioI + 1 + Math.floor(Math.random() * 3)) % RADIO.length; el.lastElementChild.textContent = Math.random() < .3 ? liveLine() : RADIO[radioI]; el.hidden = false; radioT = 9; } else { el.hidden = true; radioT = 30 + Math.random() * 25; } }
  // arrancar con la manguera puesta
  if (G.hose && SP.by.gas && Math.hypot(G.car.x - SP.by.gas.x, G.car.z - SP.by.gas.z) > 14) { G.hose = 0; money(-Math.min(G.S.money, 25), 'manguera de la gasolinera'); banner('¡La manguera!', 'Has arrancado con ella puesta. Clásico.'); sfx('crash'); }
}

// ---------- el móvil
// ayuda: lo justo para quien llega de nuevas (en páginas, para que quepa en el móvil)
const HELP = [
  ['🎮 Controles', 'Ordenador: WASD para moverte, Mayús para correr, E para todo (entrar, hablar, coger el ascensor), F para subir o bajar del coche, Espacio freno de mano, V cambia la cámara, M el mapa, T el móvil y R la cámara rápida. Móvil: palanca a la izquierda, botones a la derecha, y se arrastra para mirar.'],
  ['⏰ El día de Ethan', 'Suena el despertador a las 6:30. A las 8:00 se ficha en el taller (de lunes a viernes) y se trabaja con minijuegos: tuercas, ruedas, aceite, averías, arrancar con pinzas, pulir arañazos y presupuestos de cabeza. De 13:00 a 15:00, parón para comer. A las 18:00, a casa. La agenda de la izquierda dice siempre qué toca y el GPS se pone solo.'],
  ['🅿️ Aparcar', 'Por la tarde la zona de casa (cortina verde) está llena. Da vueltas: cuando se va alguien, te avisa y el GPS te lleva al hueco, pero vuela. Valla roja, ocupado; valla verde con haz de luz, libre. Si no hay manera, el parking grande (cortina azul). Sin el coche bien aparcado no se sube a dormir.'],
  ['🍢 Entre medias', 'En los bares del mapa: pintxo-pote (jueves y viernes por la tarde, tres bares), futbolín, mus y el partido del Athletic el finde. Frontones y campos para echar un partido. En casa: cocinar (si has hecho la compra en el súper), buzoneo y recados de la vecina. En la lonja de la cuadrilla (por la tarde entre semana, desde mediodía el finde): echar la tarde, la Play, el bote y, viernes y sábado por la noche, cena de cuadrilla. En el kebab, el bar y lo de Lourdes salen encargos. Los planes de cada día se eligen en el despertador.'],
  ['🗺️ Moverse por Sestao', 'Las escaleras, rampas mecánicas y ascensores públicos son atajos entre las calles de arriba y las de abajo. Metro (bajo los fosteritos de cristal) y tren llevan de una estación a otra, y desde las paradas el Bizkaibus te deja cerca de tus sitios. Si el Serantes tiene txapela, llueve. Si el coche se queda lejos, el móvil llama a la grúa.']];
function howTo(i) { i = i || 0; const h = HELP[i]; dialog({ icon: '❓', title: h[0], text: h[1], close: 'Volver', onClose: () => openPhone(), options: i + 1 < HELP.length ? [{ t: 'Siguiente', d: HELP[i + 1][0], f: () => howTo(i + 1) }] : [] }); }
export function openPhone() {
  const S = G.S, far = G.car && G.mode === 'foot' && Math.hypot(G.car.x - P.x, G.car.z - P.z) > 40;
  dialog({ icon: '📱', title: 'Móvil de Ethan', text: fmtTime(S) + ' · ' + eur(S.money) + ' · ' + rank(S)[1] + ' · ' + SKY.label, options: [
    { t: 'Agenda y avisos', d: 'Qué toca hoy, mejoras activas y mensajes', f: () => openAgenda(() => openPhone()) },
    { t: 'Cómo se juega', d: 'Controles, el día de Ethan, aparcar y qué más hay', f: () => howTo() },
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
