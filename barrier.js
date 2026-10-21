// Barre néon du niveau 4 : un obstacle immobile au centre de la scène. Toucher la barre avec la
// boule coûte un cœur. Entité visible du monde, donc sous-classe de Vehicle (vitesse nulle).
//
// Rendu : cœur noir brillant, bordure néon blanche qui pulse, reflet de miroir qui glisse
// dessus et reflet inversé estompé sous la barre.
class Barrier extends Vehicle {
  constructor(x, y, w, h) {
    super(x, y);
    this.w = w;
    this.h = h;
    this.r = Math.max(w, h) / 2;
  }

  rect() {
    return { x: this.pos.x - this.w / 2, y: this.pos.y - this.h / 2, w: this.w, h: this.h };
  }

  // Point de la barre le plus proche de p (p lui-même s'il est à l'intérieur).
  closestPoint(p) {
    const r = this.rect();
    return { x: Math.max(r.x, Math.min(p.x, r.x + r.w)), y: Math.max(r.y, Math.min(p.y, r.y + r.h)) };
  }

  distanceTo(p) {
    const c = this.closestPoint(p);
    return Math.hypot(p.x - c.x, p.y - c.y);
  }

  // Anti-glitch : la barre chauffe tant que la boule reste tout près d'elle. Renvoie true quand
  // elle surchauffe (au bout de `duration` secondes) : la chaleur repart alors de zéro.
  // Loin de la barre, elle refroidit deux fois plus vite qu'elle ne chauffe.
  updateHeat(near, dt, duration) {
    this.heat = this.heat || 0;
    if (near) this.heat += dt / duration;
    else this.heat = Math.max(0, this.heat - (2 * dt) / duration);
    if (this.heat >= 1) {
      this.heat = 0;
      return true;
    }
    return false;
  }

  // Cercle (cx, cy, r) en contact avec le rectangle ?
  static circleHitsRect(cx, cy, r, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
  }

  // Le segment p0 → p1 traverse-t-il le rectangle ? (méthode des « dalles »)
  static segmentHitsRect(p0, p1, rect) {
    let t0 = 0;
    let t1 = 1;
    const d = { x: p1.x - p0.x, y: p1.y - p0.y };
    for (const [p, dd, lo, hi] of [[p0.x, d.x, rect.x, rect.x + rect.w], [p0.y, d.y, rect.y, rect.y + rect.h]]) {
      if (dd === 0) {
        if (p < lo || p > hi) return false;
        continue;
      }
      let a = (lo - p) / dd;
      let b = (hi - p) / dd;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
    return true;
  }

  // La boule de rayon r, passée de `prev` à `cur` depuis l'image précédente, touche-t-elle la
  // barre ? Le trajet compte aussi : un passage rapide à travers la barre est une touche.
  touches(cur, prev, r) {
    const rect = this.rect();
    if (Barrier.circleHitsRect(cur.x, cur.y, r, rect)) return true;
    if (!prev) return false;
    const grown = { x: rect.x - r, y: rect.y - r, w: rect.w + 2 * r, h: rect.h + 2 * r };
    return Barrier.segmentHitsRect(prev, cur, grown);
  }

  // options : campRadius (zone anti-glitch), ballNear (la boule est dans cette zone).
  show(t, { campRadius = 0, ballNear = false } = {}) {
    const ctx = drawingContext;
    const { x, y, w, h } = this.rect();
    const thick = Math.min(w, h);          // épaisseur (barre horizontale ou verticale)
    const vertical = h > w;
    const radius = thick / 2;
    const heat = this.heat || 0;
    const pulse = (Math.sin(t * (3 + 12 * heat)) + 1) / 2;
    const path = () => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
    };
    ctx.save();

    // zone de surchauffe : visible quand la boule s'en approche
    if (campRadius > 0 && (ballNear || heat > 0)) {
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255, ${Math.round(120 - 100 * heat)}, ${Math.round(120 - 100 * heat)}, ${0.35 + 0.6 * heat})`;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - campRadius, y - campRadius, w + 2 * campRadius, h + 2 * campRadius, campRadius);
      else ctx.rect(x - campRadius, y - campRadius, w + 2 * campRadius, h + 2 * campRadius);
      ctx.stroke();
      ctx.restore();
    }

    // reflet de miroir sous la barre : copie inversée, estompée vers le bas
    // (estompé sur une hauteur proportionnelle à l'épaisseur, quelle que soit l'orientation)
    const depth = thick * 2.2;
    const mirror = ctx.createLinearGradient(0, y + h + 2, 0, y + h + 2 + depth);
    mirror.addColorStop(0, 'rgba(10, 10, 20, 0.28)');
    mirror.addColorStop(1, 'rgba(10, 10, 20, 0)');
    ctx.fillStyle = mirror;
    if (vertical) ctx.fillRect(x, y + h + 2, w, depth);
    else ctx.fillRect(x + radius, y + h + 2, w - 2 * radius, depth);

    // halo sombre autour de la barre (néon noir)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 34 + 14 * pulse;
    const core = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
    core.addColorStop(0, '#2b2d3a');
    core.addColorStop(0.5, '#000000');
    core.addColorStop(1, '#1a1b24');
    ctx.fillStyle = core;
    path();
    ctx.fill();

    // bordure néon blanche qui pulse ; elle vire au rouge en chauffant
    const g = Math.round(255 - 215 * heat);
    ctx.shadowColor = `rgba(255, ${g}, ${g}, 0.95)`;
    ctx.shadowBlur = 10 + 14 * pulse + 20 * heat;
    ctx.strokeStyle = `rgba(255, ${g}, ${g}, ${0.8 + 0.2 * pulse})`;
    ctx.lineWidth = 2.5;
    path();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // reflet de miroir qui glisse le long de la barre
    ctx.save();
    path();
    ctx.clip();
    const len = vertical ? h : w;
    const sweep = -len * 0.4 + ((t * 0.45) % 1.6) * len; // position du reflet le long de la barre
    const shine = vertical
      ? ctx.createLinearGradient(x, y + sweep - 40, x + w, y + sweep + 40)
      : ctx.createLinearGradient(x + sweep - 40, y, x + sweep + 40, y + h);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
    shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shine;
    ctx.fillRect(x, y, w, h);
    // liseré brillant en haut (surface polie)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    if (vertical) ctx.fillRect(x + 2, y + radius, 1.5, h - 2 * radius);
    else ctx.fillRect(x + radius, y + 2, w - 2 * radius, 1.5);
    ctx.restore();

    // avertissement
    if (heat > 0.2) {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillStyle = `rgba(255, ${g}, ${g}, 1)`;
      const label = `TROP PRÈS ! ${Math.round(heat * 100)} %`;
      ctx.strokeText(label, x + w / 2, y - 14);
      ctx.fillText(label, x + w / 2, y - 14);
    }

    ctx.restore();
  }
}
