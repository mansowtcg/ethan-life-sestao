// state.js: estado compartido del juego (lo que se guarda va en G.S)
export const G = {
  S: null,            // partida
  q: 2,               // calidad 1..3
  mode: 'foot',       // foot | car
  busy: false,        // hay un menú o minijuego abierto: el mundo espera
  cam: { yaw: 0, pitch: .34, dist: 6.4, manual: 0, shake: 0, x: 0, y: 0, z: 0 },
  scene: null, camera: null, renderer: null, fx: null, sun: null,
  hour: 8, night: 0, now: 0, dest: null, path: null
};
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const dampAng = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
