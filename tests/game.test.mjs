import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans DOM.
class Vector {
  constructor(x = 0, y = 0) { this.set(x, y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
}
function scene(w = 800, h = 600) {
  const context = vm.createContext({ createVector: (x, y) => new Vector(x, y),
    p5: { Vector }, width: w, height: h });
  for (const file of ['vehicle.js', 'particle.js', 'effects.js', 'game.js', 'playerTarget.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  return vm.runInContext('({ Vehicle, Particle, Effects, G: PlayerGame, PlayerTarget })', context);
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const pos = { x: 400, y: 300 };
// fait démarrer la partie (fin du compte à rebours)
function playing(G, radius = 16) {
  const s = G.create(radius);
  G.advance(s, G.COUNTDOWN, 0);
  return s;
}

test('compte à rebours : 3 s sans chrono ni score, puis la partie démarre', () => {
  const { G } = scene();
  const s = G.create(16);
  assert.equal(s.phase, 'countdown');
  G.advance(s, 1, 10); G.advance(s, 1.5, 10);
  assert.equal(s.phase, 'countdown'); assert.equal(s.time, 0); assert.equal(s.score, 0);
  G.advance(s, 0.5, 10);
  assert.equal(s.phase, 'playing'); assert.equal(s.countdown, 0);
});

test('chrono et score : 10 points par seconde et par vaisseau', () => {
  const { G } = scene();
  const s = playing(G);
  G.advance(s, 2, 8);
  assert.ok(close(s.time, 2)); assert.ok(close(s.score, 160));
  G.advance(s, 0.5, 16);
  assert.ok(close(s.time, 2.5)); assert.ok(close(s.score, 240));
});

test('touche : la cible double, les vaisseaux doublent (max 200), game over à ×4', () => {
  const { G } = scene();
  const s = playing(G);
  let r = G.registerHit(s, 8);
  assert.equal(r.over, false); assert.equal(r.newCount, 16);
  assert.equal(s.radius, 32); assert.equal(G.sizeFactor(s), 2); assert.equal(s.phase, 'playing');
  assert.equal(s.grace, G.GRACE);
  r = G.registerHit(s, 150);
  assert.equal(r.over, true); assert.equal(r.newCount, 200);
  assert.equal(G.sizeFactor(s), 4); assert.equal(s.phase, 'over'); assert.equal(s.hits, 2);
});

test('après le game over, chrono et score sont figés', () => {
  const { G } = scene();
  const s = playing(G);
  G.advance(s, 3, 8);
  G.registerHit(s, 8); G.registerHit(s, 16);
  const frozen = [s.time, s.score];
  G.advance(s, 5, 32);
  assert.deepEqual([s.time, s.score], frozen);
});

test('détection des touches : rayon + marge, invulnérabilité, hors partie', () => {
  const { Vehicle, G } = scene();
  const s = playing(G);
  const far = new Vehicle(400 + 16 + 8.01, 300), near = new Vehicle(400 + 16 + 8, 300);
  assert.equal(G.findHit(s, [far], pos), null);
  assert.equal(G.findHit(s, [far, near], pos), near);
  G.registerHit(s, 2);
  assert.equal(G.findHit(s, [near], pos), null, 'invulnérable juste après une touche');
  G.advance(s, G.GRACE, 2);
  // la cible a grossi : un vaisseau plus éloigné la touche maintenant
  assert.equal(G.findHit(s, [new Vehicle(400 + 32 + 8, 300)], pos) !== null, true);
  assert.equal(G.findHit(G.create(16), [near], pos), null, 'pas de touche pendant le compte à rebours');
});

test('frôlement : entrer dans la zone puis ressortir sans toucher rapporte un bonus', () => {
  const { Vehicle, G } = scene();
  const s = playing(G);
  const v = new Vehicle(400 + 16 + G.NEAR_MARGIN + 1, 300);
  assert.equal(G.checkNearMisses(s, [v], pos).length, 0);
  v.pos.set(400 + 16 + G.NEAR_MARGIN, 300);
  assert.equal(G.checkNearMisses(s, [v], pos).length, 0);
  v.pos.set(400 + 16 + G.SAFE_MARGIN, 300);
  assert.equal(G.checkNearMisses(s, [v], pos).length, 0, 'pas encore assez loin');
  v.pos.set(400 + 16 + G.SAFE_MARGIN + 1, 300);
  assert.equal(G.checkNearMisses(s, [v], pos)[0], v);
  assert.equal(s.nearMisses, 1); assert.equal(s.score, 50);
  assert.equal(G.checkNearMisses(s, [v], pos).length, 0, 'compté une seule fois');
});

test('frôlement : bonus proportionnel à la taille, effacé par une touche', () => {
  const { Vehicle, G } = scene();
  const s = playing(G);
  const v = new Vehicle(400, 300 + 16 + 10);
  G.checkNearMisses(s, [v], pos);
  G.registerHit(s, 1); // le vaisseau qui touche est replacé : il ne doit pas valider de frôlement
  v.pos.set(10, 10);
  assert.equal(G.checkNearMisses(s, [v], pos).length, 0);
  assert.equal(G.nearMissBonus(s), 100);
});

test('difficulté : +1 de vitesse par palier de 10 s, sans plafond', () => {
  const { G } = scene();
  const s = playing(G);
  assert.equal(G.speedBonus(s), 0); assert.equal(G.nextSpeedUp(s), 10);
  G.advance(s, 9.9, 1); assert.equal(G.speedBonus(s), 0);
  assert.ok(close(G.nextSpeedUp(s), 0.1));
  G.advance(s, 0.1, 1); assert.equal(G.speedBonus(s), 1);
  G.advance(s, 15, 1); assert.equal(G.speedBonus(s), 2);
  assert.ok(close(G.nextSpeedUp(s), 5));
  G.advance(s, 100, 1); assert.equal(G.speedBonus(s), 12);
  // le compte à rebours ne compte pas
  assert.equal(G.speedBonus(G.create(16)), 0);
});

test('vaisseaux au départ : entier borné entre 1 et 100, défaut si invalide', () => {
  const { G } = scene();
  assert.equal(G.clampStartCount('8'), 8);
  assert.equal(G.clampStartCount(0), 1);
  assert.equal(G.clampStartCount(500), 100);
  assert.equal(G.clampStartCount(12.6), 13);
  assert.equal(G.clampStartCount('abc'), G.START_COUNT);
});

test('apparition loin du joueur, repli sur le coin le plus éloigné', () => {
  const { G } = scene();
  let seed = 3;
  const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 50; i++) {
    const p = G.spawnAway(pos, 800, 600, 250, rng);
    assert.ok(Math.hypot(p.x - pos.x, p.y - pos.y) >= 250);
    assert.ok(p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600);
  }
  assert.deepEqual({ ...G.spawnAway({ x: 10, y: 10 }, 800, 600, 5000, () => 0) }, { x: 800, y: 600 });
});

test('chrono affiché en mm:ss.d', () => {
  const { G } = scene();
  assert.equal(G.formatTime(0), '00:00.0');
  assert.equal(G.formatTime(75.34), '01:15.3');
  assert.equal(G.formatTime(9.96), '00:10.0');
  assert.equal(G.formatTime(-3), '00:00.0');
});

test('record : lecture et écriture tolérantes aux erreurs de stockage', () => {
  const { G } = scene();
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(G.loadBest(storage), 0);
  G.saveBest(storage, 1234.9);
  assert.equal(G.loadBest(storage), 1234);
  const broken = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
  assert.equal(G.loadBest(broken), 0);
  assert.doesNotThrow(() => G.saveBest(broken, 10));
  assert.equal(G.loadBest(null), 0);
  assert.equal(G.loadBest({ getItem: () => 'abc' }), 0);
});

test('PlayerTarget : Vehicle immobile, croissance animée, remise à zéro', () => {
  const { Vehicle, PlayerTarget } = scene();
  const t = new PlayerTarget(10, 20);
  assert.ok(t instanceof Vehicle); assert.equal(t.r, 16); assert.equal(t.vel.mag(), 0);
  t.r = 32;
  t.animate(); assert.ok(close(t.displayR, 16 + 16 * 0.15));
  for (let i = 0; i < 200; i++) t.animate();
  assert.ok(close(t.displayR, 32, 1e-6));
  t.danger = 1; t.invulnerable = true; t.reset();
  assert.deepEqual([t.r, t.displayR, t.danger, t.invulnerable], [16, 16, 0, false]);
});

test('texte flottant : monte, ralentit et s’efface', () => {
  const { Effects } = scene();
  const particles = [];
  Effects.popup(particles, 100, 100, '+50');
  const p = particles[0];
  assert.equal(p.kind, 'text'); assert.equal(p.label, '+50');
  const y0 = p.pos.y; const v0 = p.vel.mag();
  p.update();
  assert.ok(p.pos.y < y0); assert.ok(p.vel.mag() < v0);
  for (let i = 0; i < 80; i++) Effects.step(particles);
  assert.equal(particles.length, 0);
});

test('cœurs : 3 vies, une de moins par touche, taille fixe, game over à 0', () => {
  const { Vehicle, G } = scene();
  const s = G.create(16, { lives: 3 });
  G.advance(s, G.COUNTDOWN, 0);
  assert.equal(s.lives, 3);
  assert.equal(s.maxLives, 3);
  let r = G.loseLife(s);
  assert.equal(JSON.stringify(r), JSON.stringify({ over: false, lives: 2 }));
  assert.equal(s.radius, 16, 'la cible ne grandit pas');
  assert.equal(s.phase, 'playing');
  assert.equal(s.grace, G.GRACE, 'brève invulnérabilité après la touche');
  // pendant l'invulnérabilité, aucune nouvelle touche n'est détectée
  assert.equal(G.findHit(s, [new Vehicle(400, 300)], pos), null);
  G.advance(s, G.GRACE, 1);
  assert.ok(G.findHit(s, [new Vehicle(400, 300)], pos) !== null);
  r = G.loseLife(s);
  assert.equal(r.lives, 1);
  r = G.loseLife(s);
  assert.equal(JSON.stringify(r), JSON.stringify({ over: true, lives: 0 }));
  assert.equal(s.phase, 'over');
  assert.equal(s.hits, 3);
  assert.equal(G.loseLife(s).lives, 0, 'jamais en dessous de 0');
});

test('sans cœurs (mode libre) : lives vaut null, la règle « grossir » reste', () => {
  const { G } = scene();
  const s = G.create(16);
  assert.equal(s.lives, null);
  G.advance(s, G.COUNTDOWN, 0);
  G.registerHit(s, 8);
  assert.equal(s.radius, 32);
  assert.equal(G.create(16, { lives: 0 }).lives, null);
});
