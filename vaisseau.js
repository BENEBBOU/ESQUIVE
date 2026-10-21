// Vaisseau : un Vehicle avec un rendu de vaisseau spatial (traînée, réacteur, cockpit coloré).
// Le comportement (seek, flee, update, edges) est entièrement hérité de Vehicle.
class Vaisseau extends Vehicle {
  static TRAIL_LENGTH = 24;
  static JUMP = 60; // déplacement plus grand en une image = rebouclage ou réapparition
  static TURN_RADIUS = 70; // rayon de virage visé pour éviter un obstacle, à toute vitesse

  constructor(x, y, rng = Math.random) {
    super(x, y);
    this.hue = Math.floor(rng() * 360);
    this.trail = [];
    // 0 à 1 : en mode niveau, les vaisseaux « excités » virent au rouge
    this.excitement = 0;
  }

  // Mémorise la position pour la traînée ; la coupe après un saut pour ne pas traverser l'écran.
  recordTrail() {
    const last = this.trail[this.trail.length - 1];
    if (last && (last.x - this.pos.x) ** 2 + (last.y - this.pos.y) ** 2 > Vaisseau.JUMP ** 2) {
      this.trail.length = 0;
    }
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > Vaisseau.TRAIL_LENGTH) this.trail.shift();
  }

  // Poursuite à vitesse CONSTANTE (mode Niveaux, barème de vitesse) :
  // - virage : force de pilotage de Reynolds (vitesse désirée vers la cible − vitesse
  //   actuelle), dont on ne garde que la partie perpendiculaire au mouvement, limitée à
  //   maxForce : la force max règle uniquement la capacité à tourner ;
  // - vitesse : une seconde force ramène la vitesse exactement à `speed` dans la direction
  //   actuelle. La vitesse réelle est donc toujours celle du barème.
  chase(target, speed) {
    this.maxSpeed = speed;
    const m = this.vel.mag();
    let dx = 1;
    let dy = 0;
    if (m > 1e-9) {
      dx = this.vel.x / m;
      dy = this.vel.y / m;
    } else {
      const tx = target.x - this.pos.x;
      const ty = target.y - this.pos.y;
      const tm = Math.hypot(tx, ty);
      if (tm > 1e-9) {
        dx = tx / tm;
        dy = ty / tm;
      }
    }
    const tx = target.x - this.pos.x;
    const ty = target.y - this.pos.y;
    const tm = Math.hypot(tx, ty) || 1;
    const sx = (tx / tm) * speed - dx * speed; // vitesse désirée − vitesse (à la vitesse du barème)
    const sy = (ty / tm) * speed - dy * speed;
    const along = sx * dx + sy * dy;
    let px = sx - along * dx;
    let py = sy - along * dy;
    if (Math.hypot(px, py) < 1e-9 && along < 0) {
      // cible exactement derrière : on tourne d'un côté plutôt que de rester bloqué
      px = -dy;
      py = dx;
    }
    const turn = createVector(px, py);
    // cible derrière : demi-tour à pleine force ; sinon virage limité à maxForce
    if (along < 0) turn.setMag(this.maxForce);
    else turn.limit(this.maxForce);
    this.applyForce(turn);
    this.applyForce(createVector(dx * speed - this.vel.x, dy * speed - this.vel.y));
  }

  // Évitement d'obstacle par FUITE (Flee.reynolds du projet) : le vaisseau regarde `lookAhead`
  // images devant lui ; si ce point est à moins de `range` px de l'obstacle, il fuit le point
  // de l'obstacle le plus proche. La fuite est plus forte que le braquage normal (× weight) :
  // l'évitement est prioritaire, sinon un vaisseau rapide traverserait la barre.
  // Réglages choisis par simulation (420 et 500 px/s, 96 approches) : aucune traversée.
  avoid(obstacle, { range = 40, lookAhead = 25, weight = 8 } = {}) {
    // on teste plusieurs points du trajet anticipé (jusqu'à `lookAhead` images devant) et on
    // garde le plus menacé : un seul point lointain pourrait se trouver au-delà de l'obstacle
    let at = this.pos;
    let c = obstacle.closestPoint(this.pos);
    let d = Math.hypot(this.pos.x - c.x, this.pos.y - c.y);
    const STEPS = 6;
    for (let k = 1; k <= STEPS && d > 0; k++) {
      const s = (lookAhead * k) / STEPS;
      const probe = { x: this.pos.x + this.vel.x * s, y: this.pos.y + this.vel.y * s };
      const cp = obstacle.closestPoint(probe);
      const dp = Math.hypot(probe.x - cp.x, probe.y - cp.y);
      if (dp < d) {
        at = probe;
        c = cp;
        d = dp;
      }
    }
    if (d > range) return createVector(0, 0);
    // fuite du point de l'obstacle, vue depuis le point menacé ; la force permise grandit avec
    // le carré de la vitesse (accélération latérale v² / rayon) pour garder un virage d'environ
    // TURN_RADIUS px quelle que soit l'allure
    const v2 = this.vel.x * this.vel.x + this.vel.y * this.vel.y;
    const limit = Math.max(this.maxForce * weight, v2 / Vaisseau.TURN_RADIUS);
    const proxy = { pos: createVector(at.x, at.y), vel: this.vel, maxSpeed: this.maxSpeed, maxForce: limit };
    if (d === 0) {
      // point menacé dans l'obstacle : on fuit son centre
      return Flee.reynolds(proxy, createVector(obstacle.pos.x, obstacle.pos.y));
    }
    const force = Flee.reynolds(proxy, createVector(c.x, c.y));
    force.mult(1 - d / range * 0.5); // plus fort tout près de l'obstacle
    return this.asTurn(force, obstacle);
  }

  // Force de CONTACT (garde-fou, à appliquer après toutes les autres) : si la vitesse de la
  // prochaine image (vitesse + accélération accumulée) ferait entrer le vaisseau dans
  // l'obstacle, on retire la partie de cette vitesse dirigée vers l'intérieur : le vaisseau
  // glisse le long de l'obstacle au lieu de le traverser. S'il est déjà dedans (réapparition
  // de l'autre côté de l'écran), on le pousse vers le bord le plus proche.
  contact(obstacle, margin = 2) {
    const r = obstacle.rect();
    const box = { x: r.x - margin, y: r.y - margin, w: r.w + 2 * margin, h: r.h + 2 * margin };
    const vx = this.vel.x + this.acc.x;
    const vy = this.vel.y + this.acc.y;
    const inside = this.pos.x > box.x && this.pos.x < box.x + box.w && this.pos.y > box.y && this.pos.y < box.y + box.h;
    if (inside) {
      // sortie par le bord le plus proche
      const exits = [
        { d: this.pos.x - box.x, nx: -1, ny: 0 }, { d: box.x + box.w - this.pos.x, nx: 1, ny: 0 },
        { d: this.pos.y - box.y, nx: 0, ny: -1 }, { d: box.y + box.h - this.pos.y, nx: 0, ny: 1 },
      ];
      const e = exits.reduce((a, b) => (b.d < a.d ? b : a));
      const speed = Math.hypot(vx, vy) || this.maxSpeed;
      return createVector(e.nx * speed - vx + e.nx * (e.d + 1), e.ny * speed - vy + e.ny * (e.d + 1));
    }
    const next = { x: this.pos.x + vx, y: this.pos.y + vy };
    if (!Barrier.segmentHitsRect(this.pos, next, box)) return createVector(0, 0);
    // normale du bord touché (vers l'extérieur), d'après la position actuelle
    const c = obstacle.closestPoint(this.pos);
    let nx = this.pos.x - c.x;
    let ny = this.pos.y - c.y;
    const n = Math.hypot(nx, ny) || 1;
    nx /= n;
    ny /= n;
    const inward = vx * nx + vy * ny;
    if (inward >= 0) return createVector(0, 0);
    // on retire la composante entrante, en gardant une petite marge au bord
    const gap = Math.max(0, n - margin - 1);
    const keep = -Math.min(gap, -inward);
    return createVector((keep - inward) * nx, (keep - inward) * ny);
  }

  // Nos vaisseaux roulent à vitesse constante (chase) : la partie d'une force qui freine est
  // annulée à chaque image, seule sa partie latérale fait tourner. On convertit donc la fuite
  // en virage : si l'obstacle est devant (la fuite s'oppose au mouvement), on tourne à pleine
  // force du côté opposé au centre de l'obstacle, pour le contourner.
  asTurn(force, obstacle) {
    const m = this.vel.mag();
    const f = force.mag();
    if (m < 1e-9 || f < 1e-12) return force;
    const dx = this.vel.x / m;
    const dy = this.vel.y / m;
    const along = force.x * dx + force.y * dy;
    let px = force.x - along * dx;
    let py = force.y - along * dy;
    if (along < 0) {
      if (Math.hypot(px, py) < f * 0.2) {
        // obstacle droit devant : on choisit le côté qui s'éloigne de son centre
        const cross = dx * (obstacle.pos.y - this.pos.y) - dy * (obstacle.pos.x - this.pos.x);
        const side = cross > 0 ? -1 : 1;
        px = -dy * side;
        py = dx * side;
      }
      const k = f / (Math.hypot(px, py) || 1);
      px *= k;
      py *= k;
    }
    return createVector(px, py);
  }

  // Poussée du réacteur (0 à 1) : proportion de la vitesse maximale.
  thrust() {
    return this.maxSpeed > 0 ? Math.min(1, this.vel.mag() / this.maxSpeed) : 0;
  }

  drawTrail() {
    if (this.trail.length < 2) return;
    push();
    noFill();
    strokeJoin(ROUND);
    stroke(0, 0, 0, 70);
    strokeWeight(6);
    beginShape();
    for (const p of this.trail) vertex(p.x, p.y);
    endShape();
    colorMode(HSB, 360, 100, 100, 1);
    // excité : traînée rouge, comme le vaisseau
    stroke(this.excitement > 0 ? 0 : this.hue, 55 + 30 * this.excitement, 100, 0.85);
    strokeWeight(2);
    beginShape();
    for (const p of this.trail) vertex(p.x, p.y);
    endShape();
    pop();
  }

  // darkOutline : contour sombre, pour rester lisible sur un fond clair
  show({ trail = true, vectors = false, darkOutline = false } = {}) {
    if (trail) this.drawTrail();
    const r = this.r;
    const e = this.excitement;
    const hue = e > 0 ? 0 : this.hue;
    const flicker = 0.75 + 0.25 * Math.sin(frameCount * 0.6 + this.hue);
    const flame = r * (0.3 + 1.4 * this.thrust() * flicker) * (1 + 0.6 * e);

    push();
    translate(this.pos.x, this.pos.y);
    // excité : halo rouge qui pulse
    if (e > 0) {
      noStroke();
      fill(255, 30, 40, 70 * e * (0.6 + 0.4 * Math.sin(frameCount * 0.3 + this.hue)));
      circle(0, 0, r * 3.4);
    }
    rotate(this.vel.heading());
    // coque : bleu nuit qui vire au rouge vif avec l'excitation
    const hull = lerpColor(color(16, 18, 36), color(225, 25, 35), e);
    colorMode(HSB, 360, 100, 100, 1);
    noStroke();
    // flamme du réacteur, plus longue quand le vaisseau va vite
    fill(hue, 85, 100, 0.85);
    triangle(-r * 0.55, -r * 0.32, -r * 0.55, r * 0.32, -r * 0.55 - flame, 0);
    fill(55, 15, 100, 0.95);
    triangle(-r * 0.55, -r * 0.15, -r * 0.55, r * 0.15, -r * 0.55 - flame * 0.5, 0);
    // coque
    stroke(0, 0, e > 0 || darkOutline ? 15 : 100);
    strokeWeight(2);
    fill(hull);
    beginShape();
    vertex(r, 0);
    vertex(-r * 0.8, -r * 0.7);
    vertex(-r * 0.45, 0);
    vertex(-r * 0.8, r * 0.7);
    endShape(CLOSE);
    // cockpit
    noStroke();
    fill(hue, e > 0 ? 20 : 75, 100);
    circle(r * 0.15, 0, r * 0.5);
    pop();

    if (vectors) this.drawVelocityVector();
  }
}
