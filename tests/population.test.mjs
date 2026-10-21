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
  for (const file of ['vehicle.js', 'population.js', 'mouseTarget.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  return vm.runInContext('({ Vehicle, MouseTarget, population: SeekPopulation })', context);
}
const rng = () => 0.1;
const target = new Vector(400, 300);

test('population : bornes, conservation des instances et valeurs invalides', () => {
  const { Vehicle, population: p } = scene();
  const vehicles = [];
  const resize = n => p.resize(vehicles, n, target, 800, 600, (x, y) => new Vehicle(x, y), rng);
  resize(20);
  const first = vehicles[0]; first.vel.set(2, 1);
  resize(35); assert.equal(vehicles.length, 35); assert.equal(vehicles[0], first);
  resize(8); assert.equal(vehicles.length, 8); assert.equal(first.vel.x, 2);
  resize(8); assert.equal(vehicles[0], first);
  resize(200); assert.equal(vehicles.length, 200);
  resize(1); assert.equal(vehicles.length, 1);
  for (const n of [0, 201, 1.5, NaN, '20']) assert.throws(() => resize(n), { name: 'RangeError' });
});

test('slider : input met à jour population et compteur sans change', () => {
  const { Vehicle, population: p } = scene();
  const events = {}; const slider = { value: '20', addEventListener: (name, fn) => events[name] = fn };
  const output = {}; const vehicles = [];
  p.bindSlider(slider, output, vehicles, target, () => ({ width: 800, height: 600 }),
    (x, y) => new Vehicle(x, y), rng);
  for (const count of [1, 57, 200, 8]) {
    slider.value = String(count); events.input();
    assert.equal(vehicles.length, count); assert.equal(output.value, `${count} / 200`);
  }
  assert.equal(events.change, undefined);
});

test('edges fourni : quatre seuils stricts, angles et vitesse conservée', () => {
  const { Vehicle } = scene();
  for (const [x, y, expectedX, expectedY] of [
    [817, 100, -16, 100], [-17, 100, 816, 100],
    [100, 617, 100, -16], [100, -17, 100, 616],
    [817, -17, -16, 616], [816, 616, 816, 616], [-16, -16, -16, -16],
  ]) {
    const v = new Vehicle(x, y); v.vel.set(2, -3); v.edges();
    assert.deepEqual([v.pos.x, v.pos.y], [expectedX, expectedY]);
    assert.deepEqual([v.vel.x, v.vel.y], [2, -3]);
  }
});

test('seek fourni : forces proches/lointaines limitées et cible intacte', () => {
  const { Vehicle } = scene();
  for (const position of [new Vector(0.001, 0), new Vector(800, 600), new Vector(0, 0)]) {
    const v = new Vehicle(0, 0); const original = [position.x, position.y];
    const force = v.seek(position);
    assert.ok(force.mag() <= v.maxForce + 1e-12);
    if (position.mag()) assert.ok(force.x > 0);
    assert.deepEqual([position.x, position.y], original);
    v.vel.set(100, 100); v.applyBehaviors(position); v.update();
    assert.ok(v.vel.mag() <= v.maxSpeed + 1e-12);
    assert.equal(v.acc.mag(), 0);
  }
});

test('arrivée : seuil inclusif, même instance et paramètres préservés', () => {
  const { Vehicle, population: p } = scene();
  const v = new Vehicle(416.01, 300);
  assert.equal(p.hasArrived(v, target), false);
  v.pos.x = 416; assert.equal(p.hasArrived(v, target), true);
  v.vel.set(3, 1); v.acc.set(1, 2);
  const parameters = [v.r, v.maxSpeed, v.maxForce];
  p.step(v, target, 800, 600, rng);
  assert.equal(v.vel.mag(), 0); assert.equal(v.acc.mag(), 0);
  assert.ok(Math.hypot(v.pos.x - target.x, v.pos.y - target.y) > 20);
  assert.deepEqual([v.r, v.maxSpeed, v.maxForce], parameters);
});

test('arrivée avant/après déplacement, après wrap, et une seule réapparition', () => {
  const { Vehicle, population: p } = scene();
  const before = new Vehicle(400, 300);
  before.update = () => assert.fail('Pas de locomotion après une arrivée avant déplacement');
  let calls = 0;
  p.step(before, target, 800, 600, () => { calls++; return 0.1; });
  assert.equal(calls, 2);
  const after = new Vehicle(418, 300); after.vel.set(-4, 0);
  p.step(after, target, 800, 600, rng); assert.equal(after.vel.mag(), 0);
  const wrap = new Vehicle(815, 100); wrap.vel.set(4, 0);
  p.step(wrap, new Vector(0, 100), 800, 600, rng);
  assert.equal(wrap.vel.mag(), 0); assert.ok(wrap.pos.x >= 0);
});

test('tirage : marges, repli déterministe borné, petite géométrie impossible', () => {
  const { Vehicle, population: p } = scene();
  const point = p.spawnPosition(target, 800, 600, 16, rng);
  assert.ok(point.x >= 16 && point.x <= 784 && point.y >= 16 && point.y <= 584);
  let calls = 0;
  const fallback = p.spawnPosition(target, 800, 600, 16, () => { calls++; return 0.5; });
  assert.equal(calls, 64); assert.equal(fallback.x, 16); assert.equal(fallback.y, 16);
  assert.ok(p.spawnPosition(new Vector(20, 20), 40, 40, 16, () => 0.5));
  const smallTarget = new Vector(5, 5);
  assert.equal(p.spawnPosition(smallTarget, 10, 10, 16, rng), null);
  const v = new Vehicle(5, 5); v.vel.set(1, 2);
  assert.equal(p.respawn(v, smallTarget, 10, 10, rng), false);
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], [5, 5, 1, 2]);
  const vehicles = [];
  p.resize(vehicles, 200, smallTarget, 10, 10, (x, y) => new Vehicle(x, y), rng);
  assert.equal(vehicles.length, 200);
});

test('population : arrivées simultanées et véhicules supprimés non mis à jour', () => {
  const { Vehicle, population: p } = scene();
  const vehicles = [new Vehicle(400, 300), new Vehicle(400, 300)];
  for (const v of vehicles) p.step(v, target, 800, 600, rng);
  assert.equal(vehicles.length, 2);
  assert.ok(vehicles.every(v => !p.hasArrived(v, target)));
  const removed = vehicles[1]; removed.update = () => assert.fail('Véhicule supprimé');
  p.resize(vehicles, 1, target, 800, 600, () => assert.fail('Création inutile'));
  for (const v of vehicles) p.step(v, target, 800, 600, rng);
});

test('MouseTarget hérite de Vehicle et garde le rayon visuel attendu', () => {
  const { Vehicle, MouseTarget } = scene(); const t = new MouseTarget(50, 60);
  assert.ok(t instanceof Vehicle); assert.equal(t.r, 16); assert.equal(t.vel.mag(), 0);
});

test('réglages : maxSpeed et maxForce appliqués à tous et utilisés par seek/update', () => {
  const { Vehicle, population: p } = scene();
  const vehicles = [new Vehicle(0, 0), new Vehicle(100, 100)];
  p.applySettings(vehicles, 12, 0.5);
  for (const v of vehicles) { assert.equal(v.maxSpeed, 12); assert.equal(v.maxForce, 0.5); }
  const v = vehicles[0];
  assert.ok(Math.abs(v.seek(new Vector(500, 0)).mag() - 0.5) < 1e-9);
  for (let i = 0; i < 100; i++) { v.applyBehaviors(new Vector(1e6, 0)); v.update(); }
  assert.ok(Math.abs(v.vel.mag() - 12) < 1e-9);
  p.applySettings([], 1, 1);
  for (const [s, f] of [[0, 0.1], [4, 0], [-1, 0.1], [NaN, 0.1], [4, undefined]]) {
    assert.throws(() => p.applySettings(vehicles, s, f), { name: 'RangeError' });
  }
  assert.equal(vehicles[1].maxSpeed, 12);
});
