import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  width: 1400, height: 800 });
for (const file of ['vehicle.js', 'flee.js', 'vaisseau.js', 'barrier.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}
const { Vaisseau, Barrier } = vm.runInContext('({ Vaisseau, Barrier })', context);
const bar = () => new Barrier(700, 400, 189, 18); // x de 605,5 à 794,5 ; y de 391 à 409
const ship = (x, y, vx, vy) => {
  const v = new Vaisseau(x, y, () => 0);
  v.maxForce = 0.1;
  v.maxSpeed = Math.hypot(vx, vy) || 7;
  v.vel.set(vx, vy);
  return v;
};

test('barre : point le plus proche et distance', () => {
  const b = bar();
  assert.equal(JSON.stringify(b.closestPoint({ x: 700, y: 300 })), JSON.stringify({ x: 700, y: 391 }));
  assert.equal(b.distanceTo({ x: 700, y: 300 }), 91);
  assert.equal(b.distanceTo({ x: 700, y: 400 }), 0, 'à l’intérieur');
  assert.ok(Math.abs(b.distanceTo({ x: 794.5 + 30, y: 391 - 40 }) - 50) < 1e-9, 'près d’un coin');
});

test('évitement : aucune force loin de la barre', () => {
  const b = bar();
  assert.equal(ship(700, 100, 7, 0).avoid(b).mag(), 0);
  assert.equal(ship(200, 400, 0, 7).avoid(b).mag(), 0, 'à côté, et ne se dirige pas vers elle');
});

test('évitement : face à la barre, virage latéral à pleine force (fuite convertie en virage)', () => {
  const b = bar();
  const v = ship(650, 330, 0, 7); // descend vers la barre, à gauche de son centre
  const f = v.avoid(b);
  assert.ok(f.mag() > 0.1, 'plus fort que le braquage normal');
  assert.ok(f.mag() <= 0.1 * 8 + 1e-9, 'jamais plus que maxForce × weight');
  assert.ok(Math.abs(f.x * v.vel.x + f.y * v.vel.y) < 1e-9, 'perpendiculaire au mouvement : il tourne sans freiner');
  assert.ok(f.x < 0, 'il contourne par la gauche, le côté le plus proche de son bord');
});

test('évitement : un vaisseau qui longe la barre ou s’en éloigne n’est pas dévié vers elle', () => {
  const b = bar();
  const away = ship(700, 380, 0, -7); // juste au-dessus, s'éloigne vers le haut
  const f = away.avoid(b);
  assert.ok(f.y <= 1e-9, 'pas poussé vers la barre');
});

test('simulation : à 420 et 500 px/s, aucun vaisseau ne traverse la barre', () => {
  const b = bar();
  let crossings = 0;
  for (const pxs of [420, 500]) {
    for (let a = 0; a < 24; a++) {
      for (const side of [-1, 1]) {
        const ang = (a / 24) * Math.PI;
        const v = new Vaisseau(700 + Math.cos(ang) * 350 * side, 400 - side * (Math.abs(Math.sin(ang)) * 300 + 40), () => 0);
        v.maxForce = 0.1;
        const target = { x: 700 + ((a % 5) - 2) * 30, y: 400 + side * 100 };
        for (let i = 0; i < 600; i++) {
          const prev = { x: v.pos.x, y: v.pos.y };
          v.chase(target, pxs / 60);
          v.applyForce(v.avoid(b));
          v.update();
          if (Barrier.segmentHitsRect(prev, v.pos, b.rect())) {
            crossings++;
            break;
          }
        }
      }
    }
  }
  assert.equal(crossings, 0);
});

test('anti-glitch : la barre chauffe près d’elle, surchauffe en 2 s, refroidit loin', () => {
  const b = bar();
  let zaps = 0;
  for (let i = 0; i < 119; i++) if (b.updateHeat(true, 1 / 60, 2)) zaps++;
  assert.equal(zaps, 0, 'pas avant 2 s');
  assert.ok(b.heat > 0.95);
  assert.equal(b.updateHeat(true, 2 / 60, 2), true, 'surchauffe à 2 s');
  assert.equal(b.heat, 0, 'la chaleur repart de zéro');
  for (let i = 0; i < 60; i++) b.updateHeat(true, 1 / 60, 2); // 1 s près de la barre
  for (let i = 0; i < 30; i++) b.updateHeat(false, 1 / 60, 2); // 0,5 s loin
  assert.ok(Math.abs(b.heat - 0) < 1e-9, 'refroidit deux fois plus vite qu’elle ne chauffe');
  // s'approcher et s'éloigner par intermittence (moins de la moitié du temps près) ne suffit pas
  for (let i = 0; i < 600; i++) assert.equal(b.updateHeat(i % 3 === 0, 1 / 60, 2), false);
});

test('évitement à grande vitesse : la force permise grandit avec v², virage d’environ 70 px', () => {
  const b = bar();
  const fast = ship(650, 300, 0, 17); // 1 020 px/s, descend vers la barre
  const f = fast.avoid(b);
  assert.ok(f.mag() > 0.1 * 8, 'plus que maxForce × weight à cette vitesse');
  assert.ok(f.mag() <= (17 * 17) / Vaisseau.TURN_RADIUS + 1e-9);
});

test('simulation : de 700 à 1 100 px/s, plusieurs barres, aucun vaisseau ne traverse', () => {
  const bars = [new Barrier(500, 300, 18, 260), new Barrier(900, 300, 18, 260), new Barrier(700, 520, 300, 18)];
  let crossings = 0;
  let steps = 0;
  for (const pxs of [700, 900, 1100]) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const v = new Vaisseau(700 + Math.cos(ang) * 420, 350 + Math.sin(ang) * 300, () => 0);
      v.maxForce = 0.1;
      for (let i = 0; i < 500; i++) {
        const t = i * 0.02;
        const target = { x: 700 + Math.cos(t + a) * 250, y: 350 + Math.sin(t * 1.3) * 200 };
        const prev = { x: v.pos.x, y: v.pos.y };
        v.chase(target, pxs / 60);
        for (const b of bars) v.applyForce(v.avoid(b));
        for (const b of bars) v.applyForce(v.contact(b));
        v.update();
        steps++;
        if (bars.some(b => Barrier.segmentHitsRect(prev, v.pos, b.rect()))) crossings++;
      }
    }
  }
  assert.equal(crossings, 0, `${crossings} traversées sur ${steps} déplacements`);
});

test('contact : rien si l’on s’éloigne ou si la trajectoire ne touche pas la barre', () => {
  const b = bar();
  assert.equal(ship(700, 380, 0, -7).contact(b).mag(), 0, 's’éloigne');
  assert.equal(ship(700, 300, 0, 7).contact(b).mag(), 0, 'encore loin');
  assert.equal(ship(500, 400, 0, 7).contact(b).mag(), 0, 'à côté de la barre');
});

test('contact : la composante entrante est retirée, le vaisseau glisse le long de la barre', () => {
  const b = bar();
  const v = ship(700, 386, 3, 6); // à 5 px au-dessus, plonge vers la barre
  v.applyForce(v.contact(b));
  v.update();
  assert.ok(v.pos.y < 391, 'ne pénètre pas');
  assert.ok(v.vel.x > 2.9, 'la composante parallèle est conservée');
});

test('contact : un vaisseau apparu dans la barre en est expulsé par le bord le plus proche', () => {
  const b = bar();
  const v = ship(620, 395, 7, 0); // dans la barre, près du bord supérieur
  v.applyForce(v.contact(b));
  v.update();
  assert.ok(v.pos.y < 391, `sorti par le haut (y = ${v.pos.y})`);
});
