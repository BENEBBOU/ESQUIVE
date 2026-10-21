// Barème de vitesse du jeu : 20 crans, chacun associé à une vitesse RÉELLE garantie.
// Les vaisseaux des niveaux avancent toujours exactement à la vitesse de leur cran (voir
// Vaisseau.chase) ; la force max ne sert qu'à tourner. Le rayon de virage minimal vaut
// v² / force : plus un cran est rapide, plus les virages sont larges.
// Les px/s supposent 60 images par seconde (la physique avance d'un pas par image).
const SpeedScale = (() => {
  const FPS = 60;
  // vitesse en pixels par image, pour les crans 1 à 20 (V10 = 600 px/s, puis +60 px/s par cran)
  const PX_PER_FRAME = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const MIN = 1;
  const MAX = PX_PER_FRAME.length;

  // Cran (éventuellement fractionnaire pendant une transition) -> pixels par image.
  function pxPerFrame(level) {
    const l = Math.min(MAX, Math.max(MIN, level));
    const i = Math.floor(l) - 1;
    if (i >= MAX - 1) return PX_PER_FRAME[MAX - 1];
    const k = l - Math.floor(l);
    return PX_PER_FRAME[i] + (PX_PER_FRAME[i + 1] - PX_PER_FRAME[i]) * k;
  }

  function pxPerSecond(level) {
    return pxPerFrame(level) * FPS;
  }

  // Rayon de virage minimal (px) à ce cran, avec cette force max.
  function turnRadius(level, force) {
    const v = pxPerFrame(level);
    return (v * v) / force;
  }

  function label(level) {
    return `V${Math.round(level * 10) / 10} · ${Math.round(pxPerSecond(level))} px/s`;
  }

  // Cran du barème le plus proche d'une vitesse en px/s.
  function nearestLevel(pxs) {
    let best = 1;
    PX_PER_FRAME.forEach((px, i) => {
      if (Math.abs(px * FPS - pxs) < Math.abs(PX_PER_FRAME[best - 1] * FPS - pxs)) best = i + 1;
    });
    return best;
  }

  // « 420 px/s (V8) » ; « ≈V9 » quand la vitesse tombe entre deux crans.
  function describe(pxs) {
    const level = nearestLevel(pxs);
    const exact = Math.abs(PX_PER_FRAME[level - 1] * FPS - pxs) < 0.5;
    return `${Math.round(pxs)} px/s (${exact ? '' : '≈'}V${level})`;
  }

  // Tableau complet du barème (pour la documentation et l'interface).
  function table(force = 0.1) {
    return PX_PER_FRAME.map((px, i) => ({
      level: i + 1,
      pxPerFrame: px,
      pxPerSecond: px * FPS,
      turnRadius: Math.round((px * px) / force),
    }));
  }

  return { FPS, MIN, MAX, PX_PER_FRAME, pxPerFrame, pxPerSecond, turnRadius, label, nearestLevel, describe,
    table };
})();
