import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function scene() {
  const context = vm.createContext({ Math, JSON });
  vm.runInContext(readFileSync(new URL('../levels.js', import.meta.url), 'utf8'), context);
  return vm.runInContext('LevelRules', context);
}
const L = scene();
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const json = v => JSON.stringify(v);

test('niveaux 1 à 4 faits main : inchangés', () => {
  const rows = L.LEVELS.slice(0, 4).map(l => [l.id, l.vehicles, l.stages.map(s => [s.at, s.speed, Boolean(s.excite)]),
    l.barriers.length]);
  assert.equal(json(rows), json([
    [1, 7, [[0, 420, false]], 0],
    [2, 10, [[0, 420, false]], 0],
    [3, 7, [[0, 420, false], [30, 500, true]], 0],
    [4, 7, [[0, 420, false], [30, 500, true]], 1],
  ]));
  const bar = L.get(4).barriers[0];
  assert.equal(json([bar.x, bar.y, bar.w, bar.h]), json([0.5, 0.5, L.BAR_WIDTH, L.BAR_THICKNESS]));
  assert.ok(Math.abs(L.BAR_WIDTH - 189) <= 1, 'barre de 5 cm');
  assert.equal(json({ ...L.get(4).camp }), json({ radius: 60, time: 2 }));
});

test('100 niveaux, mêmes règles de base pour tous', () => {
  assert.equal(L.LEVELS.length, 100);
  L.LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.equal(l.lives, 3);
    assert.equal(l.force, 0.1);
    assert.equal(l.maxForce, 0.1);
    assert.equal(l.duration, 60);
    assert.equal(l.background, 'white');
    assert.equal(l.showVectors, false);
    assert.equal(l.maxSpeed, l.stages[0].speed);
    assert.equal(l.stages[0].at, 0);
    assert.ok(l.vehicles >= 7 && l.vehicles <= 32, `niveau ${l.id}`);
    assert.ok(l.stages.every(s => s.speed >= L.MIN_SPEED && s.speed <= L.MAX_SPEED));
    assert.ok(l.stages.every((s, k) => k === 0 || (s.at > l.stages[k - 1].at && s.speed > l.stages[k - 1].speed)),
      `paliers croissants, niveau ${l.id}`);
    assert.ok(l.stages.filter(s => s.excite).length <= 1);
    assert.ok(l.barriers.every(b => b.x > 0 && b.x < 1 && b.y > 0 && b.y < 1 && b.w > 0 && b.h > 0));
    assert.ok(typeof l.name === 'string' && l.name.length > 0);
  });
});

test('génération : déterministe, difficulté croissante d’un monde à l’autre', () => {
  assert.equal(json(L.generate(37)), json(L.generate(37)));
  const { maxSpeed, maxForce, ...l37 } = L.get(37);
  assert.equal(json(l37), json(L.generate(37)));
  assert.equal(maxSpeed, l37.stages[0].speed);
  const avg = (ids, f) => ids.reduce((s, id) => s + f(L.get(id)), 0) / ids.length;
  for (let w = 1; w < 10; w++) {
    const prev = Array.from({ length: 10 }, (_, k) => (w - 1) * 10 + k + 1);
    const cur = Array.from({ length: 10 }, (_, k) => w * 10 + k + 1);
    assert.ok(avg(cur, l => l.stages[0].speed) > avg(prev, l => l.stages[0].speed), `vitesse, monde ${w + 1}`);
    assert.ok(avg(cur, l => l.vehicles) > avg(prev, l => l.vehicles), `vaisseaux, monde ${w + 1}`);
  }
  assert.ok(L.get(100).stages[0].speed > L.get(5).stages[0].speed);
});

test('mondes : 10 mondes de 10 niveaux, un boss à la fin de chacun', () => {
  assert.equal(L.WORLDS.length, 10);
  for (let w = 1; w <= 10; w++) {
    const boss = L.get(w * 10);
    assert.equal(boss.boss, true);
    assert.equal(boss.world, w);
    assert.ok(boss.name.startsWith('Boss'));
    assert.equal(boss.stages.length, 3, 'deux accélérations');
    assert.ok(boss.stages[1].excite);
    assert.ok(boss.vehicles > L.get(w * 10 - 1).vehicles, 'plus de vaisseaux que le niveau précédent');
  }
  assert.equal(L.LEVELS.filter(l => l.boss).length, 10);
  assert.equal(L.worldOf(1).id, 1);
  assert.equal(L.worldOf(10).id, 1);
  assert.equal(L.worldOf(11).id, 2);
  assert.equal(L.worldOf(100).id, 10);
});

test('barres : dispositions variées, de plus en plus nombreuses, positions en pixels', () => {
  const layouts = new Set(L.LEVELS.map(l => l.layout));
  assert.ok(layouts.size >= 8, `${layouts.size} dispositions`);
  const count = w => L.LEVELS.filter(l => l.world === w).reduce((s, l) => s + l.barriers.length, 0);
  assert.ok(count(10) > count(1));
  const px = L.barriersFor(L.get(4), 1000, 600);
  assert.equal(json(px), json([{ x: 500, y: 300, w: L.BAR_WIDTH, h: L.BAR_THICKNESS }]));
  assert.equal(L.barriersFor(L.get(1), 1000, 600).length, 0);
  for (const l of L.LEVELS) assert.ok(l.camp.radius > 0 && l.camp.time >= 1.2);
});

test('étoiles = cœurs restants si l’on survit jusqu’au bout, 0 sinon', () => {
  const l1 = L.get(1);
  assert.equal(L.starsFor(l1, 3, true), 3);
  assert.equal(L.starsFor(l1, 2, true), 2);
  assert.equal(L.starsFor(l1, 1, true), 1);
  assert.equal(L.starsFor(l1, 3, false), 0);
  assert.equal(L.starsFor(l1, 5, true), 3);
  assert.equal(L.medalFor(3), 'gold');
  assert.equal(L.medalFor(1), 'bronze');
  assert.equal(L.medalFor(0), null);
  assert.equal(L.completed(l1, 59.99), false);
  assert.equal(L.completed(l1, 60), true);
  assert.equal(L.remaining(l1, 15), 45);
});

test('paliers et excitation (niveaux faits main)', () => {
  for (const id of [1, 2]) {
    const l = L.get(id);
    assert.ok([0, 30, 59].every(t => L.paramsAt(l, t).speed === 420 && !L.isExcited(l, t)));
    assert.equal(L.nextStage(l, 0), null);
  }
  for (const id of [3, 4]) {
    const l = L.get(id);
    assert.equal(L.paramsAt(l, 29.9).speed, 420);
    assert.ok(close(L.paramsAt(l, 30 + L.RAMP / 2).speed, 460));
    assert.equal(L.paramsAt(l, 40).speed, 500);
    assert.equal(L.excitement(l, 40), 1);
    const n = L.nextStage(l, 10);
    assert.equal(json([n.at, n.speed, n.excite, n.remaining]), json([30, 500, true, 20]));
  }
  assert.equal(L.paramsAt(L.get(3), 50, { speed: 600 }).speed, 680);
  assert.equal(L.paramsAt(L.get(3), 50, { speed: 2000 }).speed, L.MAX_SPEED);
  assert.ok(L.paramsAt(L.get(3), 0, { force: -5 }).force >= 0.01);
});

test('progression : meilleur résultat conservé, totaux, stockage défaillant toléré', () => {
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(L.saveProgress(storage, 1, 2)[1], 2);
  assert.equal(L.saveProgress(storage, 1, 1)[1], 2);
  L.saveProgress(storage, 12, 3);
  assert.equal(L.totalStars(L.loadProgress(storage)), 5);
  assert.equal(L.worldStars(L.loadProgress(storage), 1), 2);
  assert.equal(L.worldStars(L.loadProgress(storage), 2), 3);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(json(L.loadProgress(broken)), '{}');
  assert.equal(L.saveProgress(broken, 1, 2)[1], 2);
});

test('déblocage : un niveau à la fois dans le jeu, tous ouverts en mode développeur', () => {
  const b = L.board({});
  assert.equal(b.length, 100);
  assert.equal(json(b.slice(0, 3).map(c => c.status)), json(['open', 'locked', 'locked']));
  assert.ok(b.slice(1).every(c => c.status === 'locked'));
  assert.equal(b[9].boss, true);
  assert.equal(b[14].world, 2);
  assert.ok(L.board({}, { unlockAll: true }).every(c => c.status === 'open'));
  assert.equal(L.nextLevel(1, {}), null);
  assert.equal(L.nextLevel(1, { 1: 1 }), 2);
  assert.equal(L.nextLevel(1, {}, { unlockAll: true }), 2);
  assert.equal(L.nextLevel(100, { 100: 3 }), null);
});

test('« Jouer » propose le premier niveau ouvert non validé, sinon à perfectionner', () => {
  assert.equal(L.continueLevel({}), 1);
  assert.equal(L.continueLevel({ 1: 1 }), 2);
  assert.equal(L.continueLevel({ 1: 3, 2: 2, 3: 1 }), 4);
  const all = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i + 1, 3]));
  assert.equal(L.continueLevel(all), 100);
  all[50] = 2;
  assert.equal(L.continueLevel(all), 50);
});
