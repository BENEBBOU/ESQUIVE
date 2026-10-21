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
  for (const file of ['vehicle.js', 'flee.js', 'wander.js', 'population.js', 'background.js',
    'sound.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  return vm.runInContext(
    '({ Vehicle, Flee, Wander, population: SeekPopulation, bg: RainbowBackground, sound: ZoneSound })',
    context);
}
const threat = new Vector(400, 300);
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('zone de fuite : bord inclus, rayon infini = fuite partout', () => {
  const { Vehicle, Flee } = scene();
  const v = new Vehicle(500, 300);
  assert.equal(Flee.inZone(v, threat, 100), true);
  assert.equal(Flee.inZone(v, threat, 99.99), false);
  assert.equal(Flee.inZone(v, threat, Infinity), true);
});

// Générateur pseudo-aléatoire déterministe (LCG) pour des tests reproductibles.
function seeded(seed = 42) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

test('wander : point sur le cercle devant le véhicule, theta qui varie peu', () => {
  const { Vehicle, Wander } = scene();
  const v = new Vehicle(100, 100); v.vel.set(2, 0);
  const angles = [];
  for (const r of [0.5, 1, 0]) {
    const p = Wander.wanderPoint(v, () => r);
    const cx = 100 + Wander.DISTANCE;
    assert.ok(close(Math.hypot(p.x - cx, p.y - 100), Wander.RADIUS));
    angles.push(Math.atan2(p.y - 100, p.x - cx));
  }
  // theta initial = π (r = 0.5 => variation nulle), puis +CHANGE, puis -CHANGE
  assert.ok(close(Math.abs(angles[0]), Math.PI));
  const diff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  assert.ok(close(diff(angles[1], angles[0]), Wander.CHANGE));
  assert.ok(close(diff(angles[2], angles[1]), -Wander.CHANGE));
  const force = Wander.force(v, seeded());
  assert.ok(force.mag() <= v.maxForce + 1e-12);
});

test('wander : les véhicules continuent de bouger hors de la zone, direction qui change', () => {
  const { Vehicle, population: p } = scene();
  const rng = seeded(7);
  const v = new Vehicle(100, 100);
  const headings = [];
  for (let i = 0; i < 300; i++) {
    p.stepFlee(v, threat, false, 50, rng);
    assert.ok(v.vel.mag() <= v.maxSpeed + 1e-12);
    if (i > 50) assert.ok(v.vel.mag() > 1, 'le véhicule ne doit pas s’arrêter');
    headings.push(Math.atan2(v.vel.y, v.vel.x));
  }
  assert.ok(Math.max(...headings) - Math.min(...headings) > 1, 'la direction doit varier');
  assert.ok(v.pos.x >= -16 && v.pos.x <= 816 && v.pos.y >= -16 && v.pos.y <= 616);
});

test('stepFlee limité : fuite dans la zone, wander au-delà', () => {
  const { Vehicle, Flee, Wander, population: p } = scene();
  const inside = new Vehicle(420, 300);
  const expected = Flee.reynolds(inside, threat);
  p.stepFlee(inside, threat, false, 100, () => assert.fail('pas de wander dans la zone'));
  assert.ok(close(inside.vel.x, expected.x) && close(inside.vel.y, expected.y));
  for (const naive of [false, true]) {
    const v = new Vehicle(420, 300);
    for (let i = 0; i < 40; i++) p.stepFlee(v, threat, naive, 100, seeded());
    assert.ok(Math.hypot(v.pos.x - threat.x, v.pos.y - threat.y) > 100);
  }
  const outside = new Vehicle(700, 300); outside.vel.set(2, 0);
  const twin = new Vehicle(700, 300); twin.vel.set(2, 0);
  const wanderForce = Wander.force(twin, () => 0.5);
  p.stepFlee(outside, threat, false, 100, () => 0.5);
  assert.ok(close(outside.vel.x, 2 + wanderForce.x) && close(outside.vel.y, wanderForce.y));
});

test('countInside : bord inclus, liste vide, rayon nul', () => {
  const { Vehicle, population: p } = scene();
  const vehicles = [new Vehicle(400, 300), new Vehicle(450, 300), new Vehicle(450.01, 300)];
  assert.equal(p.countInside(vehicles, threat, 50), 2);
  assert.equal(p.countInside(vehicles, threat, 0), 1);
  assert.equal(p.countInside([], threat, 1000), 0);
});

test('son FM : silence sans contact, paramètres croissants, bornes', () => {
  const { sound } = scene();
  for (const [c, t] of [[0, 20], [5, 0], [NaN, 20], [-1, 20]]) {
    const l = sound.levels(c, t);
    assert.equal(l.gain, 0); assert.equal(l.index, 0);
    assert.equal(sound.modulation(l).depth, 0);
  }
  let previous = sound.levels(1, 50);
  assert.ok(previous.gain > 0 && previous.index > 0);
  for (let c = 2; c <= 50; c++) {
    const l = sound.levels(c, 50);
    for (const key of ['gain', 'harmonicity', 'index']) {
      assert.ok(l[key] > previous[key], `${key} doit croître`);
    }
    previous = l;
  }
  const full = sound.levels(80, 50);
  assert.ok(close(full.gain, 0.25));
  assert.ok(close(full.harmonicity, 3.5)); assert.ok(close(full.index, 10));
  const m = sound.modulation(full);
  assert.ok(close(m.frequency, full.carrier * 3.5)); assert.ok(close(m.depth, 10 * m.frequency));
});

test('son FM : la fréquence suit le nombre de véhicules (un demi-ton chacun), pas la proportion', () => {
  const { sound } = scene();
  assert.equal(sound.carrierFrequency(1), sound.BASE);
  assert.ok(close(sound.carrierFrequency(13), sound.BASE * 2));   // 12 demi-tons = 1 octave
  for (let c = 2; c <= sound.MAX_STEPS + 1; c++) {
    assert.ok(close(sound.carrierFrequency(c) / sound.carrierFrequency(c - 1), 2 ** (1 / 12)));
  }
  const top = sound.BASE * 2 ** (sound.MAX_STEPS / 12);
  assert.ok(close(sound.carrierFrequency(sound.MAX_STEPS + 1), top));
  assert.ok(close(sound.carrierFrequency(200), top));
  // même nombre de véhicules => même note, quel que soit l'effectif total
  assert.equal(sound.levels(5, 20).carrier, sound.levels(5, 200).carrier);
  assert.equal(sound.levels(5, 20).carrier, sound.carrierFrequency(5));
});

test('fond : anneaux arc-en-ciel du magenta au centre jusqu’aux coins, qui s’éloignent', () => {
  const { bg } = scene();
  // ordre de l'image : magenta, bleu, cyan, vert, jaune, rouge, magenta
  const expected = [300, 240, 180, 120, 60, 0, 300];
  expected.forEach((hue, i) => assert.ok(close(bg.hueAt(i / 6, 0), hue)));
  for (const t of [0, 1.5, 100, -3]) {
    const stops = bg.rainbowStops(t);
    assert.equal(stops[0].offset, 0); assert.equal(stops.at(-1).offset, 1);
    assert.ok(stops.every(s => s.hue >= 0 && s.hue < 360));
  }
  // une couleur présente au rayon 0.2 se retrouve plus loin une seconde plus tard
  const later = 0.2 + bg.HUE_SPEED / 360;
  assert.ok(close(bg.hueAt(0.2, 0), bg.hueAt(later, 1)));
  assert.equal(bg.gradientRadius(800, 600), 500);
});
