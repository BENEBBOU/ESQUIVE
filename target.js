// Cible autonome : un cercle qui avance en ligne droite dans une direction aléatoire
// et réapparaît du côté opposé lorsqu'il quitte le canvas.
class Target extends Vehicle {
  constructor(x, y, rng = Math.random) {
    super(x, y);
    this.r = SeekPopulation.ARRIVAL_RADIUS;
    // plus lente que les véhicules (maxSpeed = 4 par défaut) pour qu'ils puissent l'attraper
    this.maxSpeed = 2;
    this.setRandomDirection(rng);
  }

  // Tire une nouvelle direction ; la norme de la vitesse reste maxSpeed.
  setRandomDirection(rng = Math.random) {
    const angle = rng() * 2 * Math.PI;
    this.vel.set(Math.cos(angle) * this.maxSpeed, Math.sin(angle) * this.maxSpeed);
  }

  // Aucune force appliquée : la locomotion de Vehicle la fait avancer à vitesse constante.
  update() {
    super.update();
    this.edges();
  }

  show() {
    const pulse = (Math.sin(frameCount * 0.1) + 1) / 2;
    push();
    // halo qui pulse
    noFill();
    stroke(255, 255, 255, 120 + 120 * pulse);
    strokeWeight(3);
    circle(this.pos.x, this.pos.y, this.r * 2 + 12 + 14 * pulse);
    stroke(0, 0, 0, 120);
    strokeWeight(6);
    circle(this.pos.x, this.pos.y, this.r * 2 + 4);
    // corps et reflet
    noStroke();
    fill('red');
    circle(this.pos.x, this.pos.y, this.r * 2);
    fill(255, 255, 255, 200);
    circle(this.pos.x - this.r * 0.35, this.pos.y - this.r * 0.35, this.r * 0.5);
    pop();
  }
}
