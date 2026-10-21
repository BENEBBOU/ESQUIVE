// Décor de la scène (pas une entité) : anneaux arc-en-ciel concentriques plein écran.
// Du centre vers l'extérieur : magenta, bleu, cyan, vert, jaune, rouge, magenta.
// Les teintes défilent avec le temps, donc les anneaux semblent sortir du centre.
// Le centre suit le curseur en douceur (voir follow()).
// Dessiné directement sur le contexte 2D du canvas p5 (drawingContext).
const RainbowBackground = (() => {
  const STOPS = 25;
  const CENTER_HUE = 300; // magenta au centre
  const HUE_SPEED = 60;   // degrés par seconde
  const FOLLOW = 0.08;    // part du chemin parcourue vers le curseur à chaque image

  // Teinte au rayon relatif `offset` (0 = centre, 1 = coin le plus éloigné) à l'instant t.
  function hueAt(offset, t) {
    const hue = CENTER_HUE - 360 * offset + t * HUE_SPEED;
    return ((hue % 360) + 360) % 360;
  }

  function rainbowStops(t) {
    return Array.from({ length: STOPS }, (_, i) => {
      const offset = i / (STOPS - 1);
      return { offset, hue: hueAt(offset, t) };
    });
  }

  // Distance du centre au coin le plus éloigné : le dégradé couvre tout le canvas.
  function gradientRadius(w, h, cx = w / 2, cy = h / 2) {
    return Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy),
      Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
  }

  // Rapproche `current` de `goal` (modifie et renvoie `current`).
  function follow(current, goal, factor = FOLLOW) {
    current.x += (goal.x - current.x) * factor;
    current.y += (goal.y - current.y) * factor;
    return current;
  }

  // veil : voile sombre (0 = aucun, 1 = noir) pour calmer les couleurs.
  function draw(ctx, w, h, t, cx = w / 2, cy = h / 2, veil = 0) {
    const rings = ctx.createRadialGradient(cx, cy, 0, cx, cy, gradientRadius(w, h, cx, cy));
    for (const s of rainbowStops(t)) rings.addColorStop(s.offset, `hsl(${s.hue}, 100%, 50%)`);
    ctx.save();
    ctx.fillStyle = rings;
    ctx.fillRect(0, 0, w, h);
    if (veil > 0) {
      ctx.fillStyle = `rgba(4, 4, 16, ${Math.min(1, veil)})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  return { HUE_SPEED, FOLLOW, hueAt, rainbowStops, gradientRadius, follow, draw };
})();
