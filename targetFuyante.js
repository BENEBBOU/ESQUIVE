// Cible fuyante (scénario 2) : une Target qui surveille les vaisseaux.
//
// - Perception : elle repère le vaisseau le plus proche.
// - Décision (avec hystérésis) : elle se met à fuir quand ce vaisseau entre dans son cercle de
//   détection (200 px par défaut, réglable) et ne s'arrête qu'à ESCAPE_DISTANCE (300 px) de lui.
// - Pilotage : pendant la fuite, elle utilise la méthode héritée flee() et accélère : sa vitesse
//   max et sa force max augmentent à chaque image. Hors de portée, elle reprend le comportement
//   normal de Target (ligne droite) et retrouve peu à peu sa vitesse de croisière.
class TargetFuyante extends Target {
  static DETECTION_RADIUS = 200;
  static ESCAPE_DISTANCE = 300;
  static FLEE_MAX_SPEED = 7;   // les vaisseaux vont à 4 par défaut : elle peut leur échapper
  static FLEE_MAX_FORCE = 0.5;
  static SPEED_GAIN = 0.08;    // gain de vitesse max par image de fuite
  static FORCE_GAIN = 0.01;    // gain de force max par image de fuite
  static SPEED_DECAY = 0.03;   // retour progressif à la vitesse de croisière

  constructor(x, y, rng = Math.random) {
    super(x, y, rng);
    this.baseSpeed = this.maxSpeed;
    this.baseForce = this.maxForce;
    this.detectionRadius = TargetFuyante.DETECTION_RADIUS;
    this.fleeing = false;
    this.predator = null;
    this.predatorDistance = Infinity;
  }

  // Vaisseau le plus proche d'un point (null si la liste est vide).
  static nearest(point, vehicles) {
    let vehicle = null;
    let best = Infinity;
    for (const candidate of vehicles) {
      const d2 = (candidate.pos.x - point.x) ** 2 + (candidate.pos.y - point.y) ** 2;
      if (d2 < best) {
        best = d2;
        vehicle = candidate;
      }
    }
    return { vehicle, distance: Math.sqrt(best) };
  }

  // La fuite ne s'arrête jamais avant d'être sortie du cercle de détection.
  escapeDistance() {
    return Math.max(TargetFuyante.ESCAPE_DISTANCE, this.detectionRadius);
  }

  perceive(vehicles) {
    const { vehicle, distance } = TargetFuyante.nearest(this.pos, vehicles);
    this.predatorDistance = distance;
    if (!this.fleeing && vehicle && distance <= this.detectionRadius) this.fleeing = true;
    else if (this.fleeing && !(distance <= this.escapeDistance())) this.fleeing = false;
    this.predator = this.fleeing ? vehicle : null;
  }

  steer() {
    const T = TargetFuyante;
    if (this.fleeing) {
      this.maxSpeed = Math.min(T.FLEE_MAX_SPEED, this.maxSpeed + T.SPEED_GAIN);
      this.maxForce = Math.min(T.FLEE_MAX_FORCE, this.maxForce + T.FORCE_GAIN);
      return this.flee(this.predator.pos);
    }
    this.maxSpeed = Math.max(this.baseSpeed, this.maxSpeed - T.SPEED_DECAY);
    this.maxForce = Math.max(this.baseForce, this.maxForce - T.FORCE_GAIN);
    return this.cruise();
  }

  // Comportement normal de Target : garder sa direction, à la vitesse maxSpeed.
  // À la vitesse de croisière, cette force est nulle : la cible avance en ligne droite.
  cruise() {
    const speed = this.vel.mag();
    const desired = speed > 0
      ? createVector(this.vel.x / speed * this.maxSpeed, this.vel.y / speed * this.maxSpeed)
      : createVector(this.maxSpeed, 0);
    const force = p5.Vector.sub(desired, this.vel);
    force.limit(this.maxForce);
    return force;
  }

  update(vehicles = []) {
    this.perceive(vehicles);
    this.applyForce(this.steer());
    super.update(); // locomotion de Vehicle puis rebouclage (Target)
  }

  // Part de la vitesse maximale de fuite atteinte (0 à 1), pour la jauge.
  speedRatio() {
    return Math.min(1, this.vel.mag() / TargetFuyante.FLEE_MAX_SPEED);
  }

  show() {
    const { x, y } = this.pos;
    const pulse = (Math.sin(frameCount * (this.fleeing ? 0.4 : 0.08)) + 1) / 2;
    push();
    noFill();

    // distance de sécurité : la fuite s'arrête au-delà
    stroke(255, 255, 255, 70);
    strokeWeight(1);
    drawingContext.setLineDash([2, 10]);
    circle(x, y, this.escapeDistance() * 2);

    // cercle de détection, qui tourne plus vite et rougit pendant la fuite
    drawingContext.setLineDash([14, 10]);
    drawingContext.lineDashOffset = -frameCount * (this.fleeing ? 3 : 0.6);
    strokeWeight(this.fleeing ? 3 : 2);
    if (this.fleeing) stroke(255, 40, 60, 160 + 90 * pulse);
    else stroke(255, 255, 255, 170);
    circle(x, y, this.detectionRadius * 2);
    drawingContext.setLineDash([]);

    // lien vers le prédateur
    if (this.fleeing && this.predator) {
      stroke(255, 40, 60, 200);
      strokeWeight(2);
      drawingContext.setLineDash([6, 6]);
      drawingContext.lineDashOffset = frameCount * 2;
      line(x, y, this.predator.pos.x, this.predator.pos.y);
      drawingContext.setLineDash([]);
      stroke(255, 40, 60, 220);
      circle(this.predator.pos.x, this.predator.pos.y, 44 + 8 * pulse);
    }

    // jauge de vitesse autour de la cible
    stroke(0, 0, 0, 120);
    strokeWeight(7);
    circle(x, y, this.r * 2 + 16);
    stroke(this.fleeing ? color(255, 220, 0) : color(255));
    strokeWeight(4);
    const ratio = this.speedRatio();
    if (ratio > 0.01) arc(x, y, this.r * 2 + 16, this.r * 2 + 16, -HALF_PI, -HALF_PI + TWO_PI * ratio);

    // corps : noir au calme, rouge/orange pulsant pendant la fuite
    noStroke();
    const size = this.r * 2 * (this.fleeing ? 1 + 0.18 * pulse : 1);
    fill(this.fleeing ? lerpColor(color(255, 140, 0), color(255, 0, 60), pulse) : color(10, 10, 20));
    circle(x, y, size);
    fill(255, 255, 255, 200);
    circle(x - this.r * 0.35, y - this.r * 0.35, this.r * 0.5);

    if (this.fleeing) {
      fill(255);
      stroke(0);
      strokeWeight(4);
      textAlign(CENTER, BOTTOM);
      textStyle(BOLD);
      textSize(18);
      text('FUITE !', x, y - this.r - 18);
    }
    pop();
  }
}
