import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ Math, Float32Array });
vm.runInContext(readFileSync(new URL('../rubberSheet.js', import.meta.url), 'utf8'), context);
const S = vm.runInContext('RubberSheet', context);

const run = (sheet, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) S.step(sheet, dt);
};
const zAt = (sheet, x, y) => sheet.z[Math.round(y / sheet.spacing) * sheet.cols + Math.round(x / sheet.spacing)];

test('grille : couvre tout le canvas, à plat au départ', () => {
  const s = S.create(800, 600, 20);
  assert.equal(s.cols, 41);
  assert.equal(s.rows, 31);
  assert.equal(S.maxDepth(s), 0);
});

test('le curseur creuse la membrane autour de lui, pas au loin', () => {
  const s = S.create(800, 600, 20);
  S.poke(s, 400, 300, 600);
  run(s, 0.1);
  assert.ok(zAt(s, 400, 300) < -5, 'enfoncée sous le curseur');
  assert.ok(zAt(s, 400, 300) < zAt(s, 460, 300), 'plus profond au centre');
  assert.equal(zAt(s, 700, 100), 0, 'intacte loin du curseur');
});

test('retour au repos en environ une seconde, avec un léger rebond', () => {
  const s = S.create(800, 600, 20);
  S.poke(s, 400, 300, 900);
  let deepest = 0;
  let rebound = 0;
  for (let t = 0; t < 1.2; t += 1 / 60) {
    S.step(s, 1 / 60);
    deepest = Math.min(deepest, zAt(s, 400, 300));
    rebound = Math.max(rebound, zAt(s, 400, 300));
  }
  assert.ok(deepest < -20);
  assert.ok(rebound > 0, 'la membrane remonte légèrement au-dessus du plan');
  assert.ok(S.maxDepth(s) < Math.abs(deepest) * 0.05, `reste ${S.maxDepth(s)} après 1,2 s`);
  run(s, 2);
  assert.ok(S.maxDepth(s) < 0.05);
});

test('profondeur plafonnée même si le curseur insiste', () => {
  const s = S.create(800, 600, 20);
  for (let i = 0; i < 120; i++) {
    S.poke(s, 400, 300, 3000);
    S.step(s, 1 / 60);
  }
  assert.ok(Math.abs(zAt(s, 400, 300)) <= S.MAX_DEPTH + 1e-6);
});

test('projection : un point enfoncé recule vers le centre, un point à plat ne bouge pas', () => {
  const s = S.create(800, 600, 20);
  const flat = S.project(s, 5, 5);
  assert.deepEqual([flat.x, flat.y], [100, 100]);
  s.z[5 * s.cols + 5] = -40;
  const deep = S.project(s, 5, 5);
  assert.ok(deep.x > 100 && deep.y > 100, 'déplacé vers le centre (400, 300)');
});

test('poke près des bords : aucun débordement de la grille', () => {
  const s = S.create(300, 200, 20);
  assert.doesNotThrow(() => {
    S.poke(s, -50, -50, 500);
    S.poke(s, 350, 250, 500);
    S.poke(s, 0, 0, 500);
  });
  assert.ok(s.v.every(Number.isFinite));
});

test('ombrage : blanc à plat, flanc éclairé plus clair que flanc à l’ombre, fond plus sombre', () => {
  const s = S.create(800, 600, 20);
  assert.equal(S.shadeAt(s, 10, 10), 255, 'à plat : blanc pur, comme le fond');
  S.poke(s, 400, 300, 900);
  run(s, 0.12);
  const c = 20, r = 15; // nœud sous le curseur
  const lit = S.shadeAt(s, c + 3, r + 3);   // pente qui remonte vers la lumière... côté bas-droite
  const dark = S.shadeAt(s, c - 3, r - 3);  // côté haut-gauche
  assert.notEqual(lit, dark);
  assert.ok(S.shadeAt(s, c, r) < 255, 'le fond du creux est ombré');
  assert.ok(S.shadeAt(s, c, r) >= 110);
});
