// Cible du mode joueur : pilotée par la souris, elle grossit à chaque touche.
// Entité visible, donc sous-classe de Vehicle (aucun mouvement autonome).
class PlayerTarget extends Vehicle {
  static BASE_RADIUS = 16;

  constructor(x, y) {
    super(x, y);
    this.r = PlayerTarget.BASE_RADIUS;
    this.displayR = this.r; // rayon affiché, qui rejoint r en douceur
    this.invulnerable = false;
    this.danger = 0;        // 0 à 1 : proximité du vaisseau le plus proche
  }

  reset() {
    this.r = PlayerTarget.BASE_RADIUS;
    this.displayR = this.r;
    this.invulnerable = false;
    this.danger = 0;
  }

  // Animation de croissance : le rayon affiché parcourt 15 % de l'écart à chaque image.
  animate() {
    this.displayR += (this.r - this.displayR) * 0.15;
  }

  show() {
    // clignote pendant l'invulnérabilité
    if (this.invulnerable && Math.floor(frameCount / 5) % 2 === 0) return;
    const { x, y } = this.pos;
    const r = this.displayR;
    const pulse = (Math.sin(frameCount * (0.08 + 0.3 * this.danger)) + 1) / 2;
    push();
    // aura : rouge quand un vaisseau approche
    noFill();
    strokeWeight(3);
    stroke(lerpColor(color(255, 255, 255, 170), color(255, 30, 60, 230), this.danger));
    circle(x, y, r * 2 + 14 + 12 * pulse);
    stroke(0, 0, 0, 140);
    strokeWeight(6);
    circle(x, y, r * 2 + 4);
    // corps noir avec liseré arc-en-ciel animé
    colorMode(HSB, 360, 100, 100, 1);
    strokeWeight(4);
    stroke((frameCount * 4) % 360, 90, 100);
    fill(0, 0, 4);
    circle(x, y, r * 2);
    noStroke();
    fill(0, 0, 100, 0.85);
    circle(x - r * 0.35, y - r * 0.35, r * 0.45);
    pop();
  }
}
