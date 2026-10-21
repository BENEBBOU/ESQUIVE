import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans DOM.
class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
}
const context = vm.createContext({ Math, createVector: (x = 0, y = 0) => new Vector(x, y), p5: { Vector },
  width: 4000, height: 4000 });
for (const file of ['vehicle.js', 'vaisseau.js', 'speedScale.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}
const { Vaisseau, S } = vm.runInContext('({ Vaisseau, S: SpeedScale })', context);
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('barème : 20 crans croissants, en px/image et px/s (60 images/s)', () => {
  assert.equal(S.MIN, 1);
  assert.equal(S.MAX, 20);
  assert.equal(S.pxPerFrame(1), 2);
  assert.equal(S.pxPerFrame(5), 4);
  assert.equal(S.pxPerFrame(10), 10);
  assert.equal(S.pxPerSecond(10), 600, 'V10 = 600 px/s');
  assert.equal(S.pxPerSecond(20), 1200);
  assert.equal(S.pxPerSecond(3), 180);
  for (let l = 2; l <= 20; l++) assert.ok(S.pxPerFrame(l) > S.pxPerFrame(l - 1));
  assert.ok(close(S.pxPerFrame(4.5), 3.75), 'interpolé entre deux crans (transitions)');
  assert.equal(S.pxPerFrame(0), 2);
  assert.equal(S.pxPerFrame(99), 20);
  assert.equal(S.label(5), 'V5 · 240 px/s');
});

test('barème : rayon de virage minimal = v² / force', () => {
  assert.equal(S.turnRadius(1, 0.1), 40);
  assert.ok(close(S.turnRadius(5, 0.1), 160));
  const t = S.table(0.1);
  assert.equal(t.length, 20);
  assert.deepEqual({ ...t[2] }, { level: 3, pxPerFrame: 3, pxPerSecond: 180, turnRadius: 90 });
});

function chaseCircle(level, frames = 900) {
  const v = new Vaisseau(2000, 2000, () => 0);
  v.maxForce = 0.1;
  const speed = S.pxPerFrame(level);
  const speeds = [];
  for (let i = 0; i < frames; i++) {
    const a = i * 0.03;
    const target = new Vector(2000 + Math.cos(a) * 250, 2000 + Math.sin(a) * 250);
    v.chase(target, speed);
    v.update();
    if (i > 5) speeds.push(v.vel.mag());
  }
  return { v, speeds };
}

test('chase : la vitesse réelle est exactement celle du cran, à chaque image', () => {
  for (const level of [1, 3, 5, 7, 10, 15, 20]) {
    const { speeds } = chaseCircle(level);
    assert.ok(speeds.every(s => close(s, S.pxPerFrame(level), 1e-9)), `cran ${level}`);
  }
});

test('chase : la force max ne sert qu’à tourner (virage limité à maxForce)', () => {
  const v = new Vaisseau(0, 0, () => 0);
  v.maxForce = 0.1;
  v.vel.set(4, 0);
  const before = v.vel.heading();
  v.chase(new Vector(0, 500), 4); // cible sur le côté
  v.update();
  assert.ok(close(v.vel.mag(), 4, 1e-9));
  const turned = Math.abs(v.vel.heading() - before);
  assert.ok(turned > 0, 'il tourne vers la cible');
  assert.ok(turned <= Math.atan2(0.1, 4) + 1e-9, 'pas plus que ce que permet la force 0,1');
});

test('chase : départ à l’arrêt vers la cible, demi-tour si la cible est derrière', () => {
  const still = new Vaisseau(0, 0, () => 0);
  still.maxForce = 0.1;
  still.chase(new Vector(100, 0), 3);
  still.update();
  assert.ok(close(still.vel.x, 3) && close(still.vel.y, 0, 1e-9));
  const behind = new Vaisseau(0, 0, () => 0);
  behind.maxForce = 0.1;
  behind.vel.set(3, 0);
  behind.chase(new Vector(-300, 0), 3);
  behind.update();
  assert.ok(Math.abs(behind.vel.y) > 0.05, 'il commence à tourner au lieu de rester bloqué');
  assert.ok(close(behind.vel.mag(), 3, 1e-9));
});
