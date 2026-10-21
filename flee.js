// Comportement de fuite selon Craig Reynolds : on inverse la vitesse DÉSIRÉE, pas la force.
//
// Vehicle.flee() fait seek(target).mult(-1), c'est-à-dire -(désirée - vitesse) = -désirée + vitesse.
// La version correcte est (-désirée) - vitesse. Les deux coïncident seulement si le véhicule
// est à l'arrêt. Exemple : un véhicule qui fonce sur la cible à maxSpeed a une vitesse égale
// à la vitesse désirée de seek, donc Vehicle.flee() renvoie une force nulle et il ne fuit pas !
const Flee = (() => {
  function reynolds(vehicle, target) {
    // ETAPE 1 (action : s'éloigner de la cible) : vitesse désirée = cible -> véhicule
    const desiredSpeed = p5.Vector.sub(vehicle.pos, target);
    desiredSpeed.setMag(vehicle.maxSpeed);

    // ETAPE 2 (pilotage) : force = vitesse désirée - vitesse actuelle, limitée à maxForce
    const force = p5.Vector.sub(desiredSpeed, vehicle.vel);
    force.limit(vehicle.maxForce);
    return force;
  }

  // Zone de fuite (distance de panique) : la cible n'est menaçante qu'à moins de `radius`.
  function inZone(vehicle, target, radius) {
    return (vehicle.pos.x - target.x) ** 2 + (vehicle.pos.y - target.y) ** 2 <= radius ** 2;
  }

  return { reynolds, inZone };
})();
