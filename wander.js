// Comportement wander (Reynolds) : errance aléatoire mais continue.
// On place un cercle devant le véhicule ; un point de ce cercle se déplace un peu à chaque image
// (petite variation de l'angle theta) et le véhicule fait un seek vers ce point.
// La direction change donc progressivement, sans tirage brutal à chaque image.
const Wander = (() => {
  const DISTANCE = 80;   // distance du centre du cercle devant le véhicule
  const RADIUS = 40;     // rayon du cercle d'errance
  const CHANGE = 0.3;    // variation maximale de theta par image (radians)

  // theta propre à chaque véhicule, sans modifier la classe Vehicle
  const thetas = new WeakMap();

  // Point visé sur le cercle d'errance (fait avancer theta).
  function wanderPoint(vehicle, rng = Math.random) {
    const theta = (thetas.get(vehicle) ?? rng() * 2 * Math.PI) + (rng() * 2 - 1) * CHANGE;
    thetas.set(vehicle, theta);
    const heading = Math.atan2(vehicle.vel.y, vehicle.vel.x);
    const centerX = vehicle.pos.x + Math.cos(heading) * DISTANCE;
    const centerY = vehicle.pos.y + Math.sin(heading) * DISTANCE;
    return createVector(centerX + Math.cos(heading + theta) * RADIUS,
      centerY + Math.sin(heading + theta) * RADIUS);
  }

  // Force de pilotage : seek vers le point d'errance (donc limitée à maxForce).
  function force(vehicle, rng = Math.random) {
    return vehicle.seek(wanderPoint(vehicle, rng));
  }

  return { DISTANCE, RADIUS, CHANGE, wanderPoint, force };
})();
