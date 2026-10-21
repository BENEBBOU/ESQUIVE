// Particule d'effet visuel : étincelle ('spark') ou onde de choc ('ring').
// Entité visible, donc sous-classe de Vehicle : elle est lancée dans une direction aléatoire,
// puis une force de frottement (opposée à la vitesse) la freine. Elle s'efface avec sa vie.
class Particle extends Vehicle {
  static DRAG = 0.06;

  constructor(x, y, { hue = 0, kind = 'spark', rng = Math.random, label = '', size = 18 } = {}) {
    super(x, y);
    this.kind = kind;
    this.hue = hue;
    this.life = 1;
    this.maxSpeed = 12;
    if (kind === 'text') {
      // texte flottant (« +50 ») : monte en ralentissant puis s'efface
      this.label = label;
      this.r = size;
      this.decay = 1 / 60;
      this.vel.set(0, -2.5);
    } else if (kind === 'ring') {
      this.r = 6;
      this.decay = 1 / 40;
    } else {
      this.r = 2 + rng() * 3;
      this.decay = 1 / (25 + rng() * 35);
      const angle = rng() * 2 * Math.PI;
      const speed = 1.5 + rng() * 6;
      this.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }
  }

  isDead() {
    return this.life <= 0;
  }

  update() {
    this.applyForce(createVector(-this.vel.x * Particle.DRAG, -this.vel.y * Particle.DRAG));
    super.update();
    if (this.kind === 'ring') this.r += 3.5;
    this.life = Math.max(0, this.life - this.decay);
  }

  show() {
    push();
    colorMode(HSB, 360, 100, 100, 1);
    if (this.kind === 'text') {
      textAlign(CENTER, CENTER);
      textStyle(BOLD);
      textSize(this.r);
      stroke(0, 0, 0, this.life);
      strokeWeight(4);
      fill(this.hue, 70, 100, this.life);
      text(this.label, this.pos.x, this.pos.y);
    } else if (this.kind === 'ring') {
      noFill();
      stroke(this.hue, 25, 100, this.life);
      strokeWeight(1 + 4 * this.life);
      circle(this.pos.x, this.pos.y, this.r * 2);
    } else {
      noStroke();
      fill(this.hue, 85, 100, this.life);
      circle(this.pos.x, this.pos.y, this.r * 2 * this.life + 1);
      fill(0, 0, 100, this.life);
      circle(this.pos.x, this.pos.y, this.r * this.life);
    }
    pop();
  }
}
