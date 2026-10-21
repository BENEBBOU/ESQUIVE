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
function scene(w = 2000, h = 2000) {
  const context = vm.createContext({ createVector: (x, y) => new Vector(x, y),
    p5: { Vector }, width: w, height: h });
  for (const file of ['vehicle.js', 'population.js', 'target.js', 'targetFuyante.js',
    'vaisseau.js', 'particle.js', 'effects.js', 'background.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  return vm.runInContext(`({ Vehicle, Target, TargetFuyante, Vaisseau, Particle, Effects,
    population: SeekPopulation, bg: RainbowBackground })`, context);
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function seeded(seed = 42) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

test('TargetFuyante : sous-classe de Target et de Vehicle, calme au départ', () => {
  const { Vehicle, Target, TargetFuyante } = scene();
  const t = new TargetFuyante(1000, 1000, () => 0);
  assert.ok(t instanceof Target && t instanceof Vehicle);
  assert.equal(t.detectionRadius, 200); assert.equal(t.fleeing, false);
  assert.equal(t.escapeDistance(), 300);
});

test('nearest : le vaisseau le plus proche, liste vide', () => {
  const { Vehicle, TargetFuyante } = scene();
  const a = new Vehicle(100, 0), b = new Vehicle(0, 50), c = new Vehicle(-80, 0);
  const r = TargetFuyante.nearest({ x: 0, y: 0 }, [a, b, c]);
  assert.equal(r.vehicle, b); assert.equal(r.distance, 50);
  const empty = TargetFuyante.nearest({ x: 0, y: 0 }, []);
  assert.equal(empty.vehicle, null); assert.equal(empty.distance, Infinity);
});

test('détection : fuit à 200 px (inclus), pas au-delà ; rayon réglable', () => {
  const { Vehicle, TargetFuyante } = scene();
  const t = new TargetFuyante(1000, 1000, () => 0);
  t.perceive([new Vehicle(1200.01, 1000)]); assert.equal(t.fleeing, false);
  t.perceive([new Vehicle(1200, 1000)]); assert.equal(t.fleeing, true);
  const u = new TargetFuyante(1000, 1000, () => 0); u.detectionRadius = 100;
  u.perceive([new Vehicle(1150, 1000)]); assert.equal(u.fleeing, false);
});

test('hystérésis : continue de fuir jusqu’à 300 px, puis redevient calme', () => {
  const { Vehicle, TargetFuyante } = scene();
  const t = new TargetFuyante(1000, 1000, () => 0);
  const p = new Vehicle(1150, 1000);
  t.perceive([p]); assert.equal(t.fleeing, true); assert.equal(t.predator, p);
  p.pos.set(1250, 1000); t.perceive([p]); assert.equal(t.fleeing, true);
  p.pos.set(1300, 1000); t.perceive([p]); assert.equal(t.fleeing, true);
  p.pos.set(1300.01, 1000); t.perceive([p]); assert.equal(t.fleeing, false);
  assert.equal(t.predator, null);
  t.perceive([]); assert.equal(t.fleeing, false);
  // détection > 300 : la fin de fuite suit le rayon de détection
  t.detectionRadius = 350; assert.equal(t.escapeDistance(), 350);
});

test('fuite : le plus proche des vaisseaux est le prédateur, force = flee() hérité', () => {
  const { Vehicle, TargetFuyante } = scene();
  const t = new TargetFuyante(1000, 1000, () => 0);
  const far = new Vehicle(1000, 1180), near = new Vehicle(900, 1000);
  let fled = null;
  const inherited = t.flee.bind(t);
  t.flee = target => { fled = target; return inherited(target); };
  t.update([far, near]);
  assert.equal(t.predator, near); assert.equal(fled, near.pos);
  assert.ok(t.vel.x > 2, 'la cible part à l’opposé du prédateur (vers +x)');
});

test('accélération : vitesse et force max augmentent pendant la fuite, plafonnées', () => {
  const { Vehicle, TargetFuyante: T } = scene();
  const t = new T(1000, 1000, () => 0.25);
  const p = new Vehicle(1000, 950);
  let lastSpeed = t.maxSpeed, lastForce = t.maxForce;
  for (let i = 0; i < 20; i++) {
    p.pos.set(t.pos.x, t.pos.y - 50); // le prédateur colle à la cible
    t.update([p]);
    assert.ok(t.maxSpeed > lastSpeed && t.maxForce > lastForce);
    lastSpeed = t.maxSpeed; lastForce = t.maxForce;
  }
  for (let i = 0; i < 200; i++) { p.pos.set(t.pos.x, t.pos.y - 50); t.update([p]); }
  assert.equal(t.maxSpeed, T.FLEE_MAX_SPEED); assert.equal(t.maxForce, T.FLEE_MAX_FORCE);
  assert.ok(t.vel.mag() > 6.5 && t.vel.mag() <= T.FLEE_MAX_SPEED + 1e-9);
  assert.ok(close(t.speedRatio(), t.vel.mag() / T.FLEE_MAX_SPEED));
});

test('fuite réelle : la distance au prédateur immobile augmente jusqu’à sortir de portée', () => {
  const { Vehicle, TargetFuyante } = scene();
  const t = new TargetFuyante(1000, 1000, () => 0.5); // part vers -x, vers le prédateur
  const p = new Vehicle(900, 1000);
  let i = 0;
  while (i < 500 && (i === 0 || t.fleeing)) { t.update([p]); i++; }
  assert.ok(i < 500, 'la fuite doit se terminer');
  assert.equal(t.fleeing, false);
  assert.ok(dist(t.pos, p.pos) > 300);
});

test('retour au calme : vitesse ramenée à la croisière, direction conservée', () => {
  const { TargetFuyante: T } = scene();
  const t = new T(1000, 1000, () => 0);
  t.maxSpeed = T.FLEE_MAX_SPEED; t.maxForce = T.FLEE_MAX_FORCE; t.vel.set(0, 7);
  for (let i = 0; i < 400; i++) t.update([]);
  assert.equal(t.maxSpeed, t.baseSpeed); assert.equal(t.maxForce, t.baseForce);
  assert.ok(close(t.vel.mag(), 2, 1e-6)); assert.ok(close(t.vel.x, 0, 1e-9) && t.vel.y > 0);
  // à la croisière, la cible se comporte exactement comme une Target : force nulle
  assert.ok(t.cruise().mag() < 1e-12);
  // vitesse nulle : la croisière relance la cible
  t.vel.set(0, 0); assert.ok(t.cruise().mag() > 0);
});

test('Vaisseau : Vehicle au comportement inchangé, teinte, poussée', () => {
  const { Vehicle, Vaisseau } = scene(800, 600);
  const s = new Vaisseau(10, 20, () => 0.5), v = new Vehicle(10, 20);
  assert.ok(s instanceof Vehicle); assert.equal(s.hue, 180);
  const target = new Vector(300, 400);
  const fs = s.seek(target), fv = v.seek(target);
  assert.ok(close(fs.x, fv.x) && close(fs.y, fv.y));
  assert.equal(s.thrust(), 0); s.vel.set(2, 0); assert.ok(close(s.thrust(), 0.5));
  s.vel.set(10, 0); assert.equal(s.thrust(), 1);
});

test('traînée : longueur plafonnée, coupée après rebouclage ou réapparition', () => {
  const { Vaisseau } = scene(800, 600);
  const s = new Vaisseau(0, 0, () => 0);
  for (let i = 0; i < 40; i++) { s.pos.set(i * 3, 0); s.recordTrail(); }
  assert.equal(s.trail.length, Vaisseau.TRAIL_LENGTH);
  assert.equal(s.trail.at(-1).x, 117);
  s.pos.set(700, 500); s.recordTrail();
  assert.equal(s.trail.length, 1);
  assert.notEqual(s.trail[0], s.pos, 'copie de la position, pas une référence');
});

test('particules : étincelle freinée qui s’éteint, onde qui grandit', () => {
  const { Vehicle, Particle } = scene(800, 600);
  const spark = new Particle(100, 100, { hue: 30, rng: () => 0.5 });
  assert.ok(spark instanceof Vehicle);
  let speed = spark.vel.mag();
  assert.ok(speed >= 1.5 && speed <= 7.5);
  for (let i = 0; i < 5; i++) {
    spark.update(); assert.ok(spark.vel.mag() < speed); speed = spark.vel.mag();
  }
  for (let i = 0; i < 100; i++) spark.update();
  assert.ok(spark.isDead()); assert.equal(spark.life, 0);
  const ring = new Particle(50, 50, { kind: 'ring' });
  const r0 = ring.r; ring.update();
  assert.ok(ring.r > r0); assert.equal(ring.vel.mag(), 0);
});

test('Effects : explosion, plafond de particules, nettoyage en place', () => {
  const { Effects } = scene(800, 600);
  const particles = [];
  Effects.burst(particles, 10, 10, { count: 20, rng: seeded() });
  assert.equal(particles.length, 21);
  assert.equal(particles.filter(p => p.kind === 'ring').length, 1);
  Effects.burst(particles, 10, 10, { count: 0, ring: false });
  assert.equal(particles.length, 21);
  for (let i = 0; i < 60; i++) Effects.burst(particles, 0, 0, { count: 30, rng: seeded(i) });
  assert.equal(particles.length, Effects.MAX);
  const ref = particles;
  for (let i = 0; i < 120; i++) Effects.step(particles);
  assert.equal(particles, ref); assert.equal(particles.length, 0);
});

test('step : renvoie true quand le vaisseau touche la cible, false sinon', () => {
  const { Vehicle, population: p } = scene(800, 600);
  const target = new Vector(400, 300);
  assert.equal(p.step(new Vehicle(100, 100), target, 800, 600, () => 0.1), false);
  assert.equal(p.step(new Vehicle(405, 300), target, 800, 600, () => 0.1), true);
  const v = new Vehicle(419, 300); v.vel.set(-4, 0);
  assert.equal(p.step(v, target, 800, 600, () => 0.1), true);
});

test('fond : le centre suit le curseur en douceur et le dégradé couvre tout le canvas', () => {
  const { bg } = scene();
  const c = { x: 0, y: 0 };
  bg.follow(c, { x: 100, y: 50 });
  assert.ok(close(c.x, 100 * bg.FOLLOW) && close(c.y, 50 * bg.FOLLOW));
  for (let i = 0; i < 300; i++) bg.follow(c, { x: 100, y: 50 });
  assert.ok(close(c.x, 100, 1e-6) && close(c.y, 50, 1e-6));
  assert.equal(bg.gradientRadius(800, 600), 500);
  assert.equal(bg.gradientRadius(800, 600, 0, 0), 1000);
  assert.ok(close(bg.gradientRadius(800, 600, 700, 100), Math.hypot(700, 500)));
});

test('Vaisseau : excitation à 0 par défaut, sans effet sur le comportement', () => {
  const { Vaisseau } = scene(800, 600);
  const calm = new Vaisseau(10, 20, () => 0.5);
  const excited = new Vaisseau(10, 20, () => 0.5);
  assert.equal(calm.excitement, 0);
  excited.excitement = 1;
  const target = new Vector(300, 400);
  const a = calm.seek(target), b = excited.seek(target);
  assert.ok(close(a.x, b.x) && close(a.y, b.y));
});
