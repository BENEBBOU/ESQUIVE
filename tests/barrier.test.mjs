import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  mag() { return Math.hypot(this.x, this.y); }
}
const context = vm.createContext({ Math, createVector: (x = 0, y = 0) => new Vector(x, y), p5: { Vector } });
for (const file of ['vehicle.js', 'barrier.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}
const { Vehicle, Barrier } = vm.runInContext('({ Vehicle, Barrier })', context);

// barre de 190 × 14 centrée en (500, 300) : x de 405 à 595, y de 293 à 307
const bar = () => new Barrier(500, 300, 190, 14);
const p = (x, y) => ({ x, y });

test('barre : entité immobile, sous-classe de Vehicle', () => {
  const b = bar();
  assert.ok(b instanceof Vehicle);
  assert.equal(b.vel.mag(), 0);
  assert.equal(JSON.stringify(b.rect()), JSON.stringify({ x: 405, y: 293, w: 190, h: 14 }));
});

test('contact cercle / barre : bord inclus, coins arrondis par la distance', () => {
  const b = bar();
  assert.equal(b.touches(p(500, 300), null, 16), true, 'au centre');
  assert.equal(b.touches(p(500, 293 - 16), null, 16), true, 'pile au contact au-dessus');
  assert.equal(b.touches(p(500, 293 - 16.01), null, 16), false);
  assert.equal(b.touches(p(595 + 16, 300), null, 16), true, 'au contact à droite');
  assert.equal(b.touches(p(595 + 12, 293 - 12), null, 16), false, 'près du coin, mais à plus de 16 px');
  assert.equal(b.touches(p(595 + 10, 293 - 10), null, 16), true, 'près du coin, à moins de 16 px');
});

test('trajet : traverser la barre entre deux images compte comme une touche', () => {
  const b = bar();
  assert.equal(b.touches(p(500, 400), p(500, 200), 16), true, 'passage vertical rapide');
  assert.equal(b.touches(p(300, 400), p(700, 200), 16), true, 'passage en diagonale');
  assert.equal(b.touches(p(300, 400), p(300, 200), 16), false, 'passage à côté de la barre');
  assert.equal(b.touches(p(500, 250), p(500, 200), 16), false, 'trajet au-dessus, sans contact');
});

test('segment / rectangle : cas limites', () => {
  const r = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(Barrier.segmentHitsRect(p(-5, 5), p(15, 5), r), true);
  assert.equal(Barrier.segmentHitsRect(p(-5, 15), p(15, 15), r), false, 'parallèle, au-dessous');
  assert.equal(Barrier.segmentHitsRect(p(5, 5), p(5, 5), r), true, 'point à l’intérieur');
  assert.equal(Barrier.segmentHitsRect(p(20, 20), p(20, 20), r), false, 'point à l’extérieur');
  assert.equal(Barrier.segmentHitsRect(p(-5, -5), p(-1, -1), r), false, 's’arrête avant');
});
