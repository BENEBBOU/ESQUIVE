// Gestion des particules : explosions (étincelles + onde de choc) et nettoyage.
const Effects = (() => {
  const MAX = 900; // au-delà, les plus anciennes particules sont retirées

  function burst(particles, x, y, { hue = 0, count = 24, ring = true, rng = Math.random } = {}) {
    for (let i = 0; i < count; i++) {
      // teintes voisines de la couleur de départ
      const h = (hue + (rng() - 0.5) * 60 + 360) % 360;
      particles.push(new Particle(x, y, { hue: h, rng }));
    }
    if (ring) particles.push(new Particle(x, y, { hue, kind: 'ring', rng }));
    if (particles.length > MAX) particles.splice(0, particles.length - MAX);
  }

  function popup(particles, x, y, label, { hue = 50, size = 18 } = {}) {
    particles.push(new Particle(x, y, { kind: 'text', label, hue, size }));
    if (particles.length > MAX) particles.splice(0, particles.length - MAX);
  }

  // Met à jour les particules et retire les mortes, sans recréer le tableau.
  function step(particles) {
    let kept = 0;
    for (const particle of particles) {
      particle.update();
      if (!particle.isDead()) particles[kept++] = particle;
    }
    particles.length = kept;
  }

  return { MAX, burst, popup, step };
})();
