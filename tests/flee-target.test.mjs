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
  for (const file of ['vehicle.js', 'flee.js', 'population.js', 'target.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  return vm.runInContext('({ Vehicle, Target, Flee, population: SeekPopulation })', context);
}
const rng = () => 0.1;
const target = new Vector(400, 300);
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('flee Reynolds : s’éloigne, limité à maxForce, identique au flee naïf à l’arrêt', () => {
  const { Vehicle, Flee } = scene();
  const v = new Vehicle(300, 300);
  const force = Flee.reynolds(v, target);
  assert.ok(force.x < 0); assert.ok(close(force.mag(), v.maxForce));
  const naive = v.flee(target);
  assert.ok(close(force.x, naive.x) && close(force.y, naive.y));
  assert.deepEqual([target.x, target.y], [400, 300]);
});

test('flee : le naïf ne fuit pas un véhicule qui fonce sur la cible, Reynolds si', () => {
  const { Vehicle, Flee } = scene();
  const charging = new Vehicle(300, 300); charging.vel.set(charging.maxSpeed, 0);
  assert.ok(charging.flee(target).mag() < 1e-12);
  const force = Flee.reynolds(charging, target);
  assert.ok(force.x < 0); assert.ok(close(force.mag(), charging.maxForce));
  const fleeing = new Vehicle(300, 300); fleeing.vel.set(-fleeing.maxSpeed, 0);
  assert.ok(Flee.reynolds(fleeing, target).mag() < 1e-12);
});

test('stepFlee : la distance augmente, vitesse bornée, wrap appliqué', () => {
  const { Vehicle, population: p } = scene();
  for (const naive of [false, true]) {
    const v = new Vehicle(350, 300); let last = 50;
    for (let i = 0; i < 20; i++) {
      p.stepFlee(v, target, naive);
      const d = Math.hypot(v.pos.x - target.x, v.pos.y - target.y);
      assert.ok(d > last); last = d;
      assert.ok(v.vel.mag() <= v.maxSpeed + 1e-12);
    }
  }
  const edge = new Vehicle(-16.5, 300); edge.vel.set(-4, 0);
  p.stepFlee(edge, new Vector(100, 300));
  assert.ok(edge.pos.x > 700);
});

test('Target : sous-classe de Vehicle, direction aléatoire constante, wrap', () => {
  const { Vehicle, Target } = scene();
  const t = new Target(100, 100, () => 0.25);
  assert.ok(t instanceof Vehicle); assert.equal(t.r, 16);
  assert.ok(close(t.vel.x, 0) && close(t.vel.y, 2));
  for (let i = 0; i < 50; i++) t.update();
  assert.ok(close(t.pos.x, 100) && close(t.pos.y, 200));
  assert.ok(close(t.vel.mag(), 2));
  const edge = new Target(815, 300, () => 0);
  edge.update(); assert.equal(edge.pos.x, -16); assert.equal(edge.vel.x, 2);
  for (const r of [0, 0.5, 0.99]) assert.ok(close(new Target(0, 0, () => r).vel.mag(), 2));
});

test('seek vers la Target mobile : le véhicule qui l’atteint réapparaît, pas la Target', () => {
  const { Vehicle, Target, population: p } = scene();
  const t = new Target(400, 300, () => 0);
  const v = new Vehicle(410, 300); v.vel.set(-4, 0);
  t.update(); p.step(v, t.pos, 800, 600, rng);
  assert.equal(v.vel.mag(), 0); assert.ok(!p.hasArrived(v, t.pos));
  assert.deepEqual([t.pos.x, t.pos.y], [402, 300]);
});

test('variante : la Target réapparaît loin du véhicule, qui continue sa route', () => {
  const { Vehicle, Target, population: p } = scene();
  const t = new Target(400, 300, () => 0);
  const v = new Vehicle(410, 300); v.vel.set(-4, 0);
  assert.equal(p.stepChaseTarget(v, t, 800, 600, rng), true);
  assert.ok(Math.hypot(t.pos.x - v.pos.x, t.pos.y - v.pos.y) > 20);
  assert.ok(close(t.vel.mag(), 2));
  assert.ok(v.vel.mag() > 0);
  const far = new Vehicle(100, 100); const before = [t.pos.x, t.pos.y];
  assert.equal(p.stepChaseTarget(far, t, 800, 600, rng), false);
  assert.deepEqual([t.pos.x, t.pos.y], before);
  const tiny = new Target(5, 5, () => 0);
  assert.equal(p.respawnTarget(tiny, new Vector(5, 5), 10, 10, rng), false);
  assert.deepEqual([tiny.pos.x, tiny.pos.y], [5, 5]);
});
