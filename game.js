// Mode joueur : règles du jeu (aucun calcul de steering ici).
//
// - Le joueur déplace la cible à la souris ; les vaisseaux la poursuivent (seek).
// - Quand un vaisseau la touche : la cible double de taille et le nombre de vaisseaux double.
// - Quand la cible atteint 4 fois sa taille de départ : game over.
// - Score : des points chaque seconde, proportionnels au nombre de vaisseaux en chasse,
//   plus un bonus de « frôlement » quand un vaisseau passe tout près sans toucher.
// - Les vaisseaux accélèrent : +1 de vitesse max toutes les 10 s.
const PlayerGame = (() => {
  const COUNTDOWN = 3;            // secondes avant le départ
  const GROWTH = 2;               // la cible double à chaque touche
  const MAX_SIZE_FACTOR = 4;      // game over à 4 fois la taille de départ
  const VEHICLE_FACTOR = 2;       // le nombre de vaisseaux double à chaque touche
  const START_COUNT = 8;
  const MAX_COUNT = 200;
  const GRACE = 1.5;              // secondes d'invulnérabilité après une touche
  const HIT_MARGIN = 8;           // un vaisseau touche si son centre est à moins de r + 8
  const POINTS_PER_VEHICLE = 10;  // points par seconde et par vaisseau en chasse
  const NEAR_MARGIN = 45;         // zone de frôlement autour de la cible
  const SAFE_MARGIN = 90;         // il faut ressortir jusqu'ici pour valider le frôlement
  const NEAR_MISS_BONUS = 50;     // multiplié par le facteur de taille (plus gros = plus risqué)
  const SPEED_STEP = 10;          // +1 de vitesse max toutes les 10 s
  const MIN_START = 1;            // bornes du nombre de vaisseaux au départ
  const MAX_START = 100;
  const BEST_KEY = 'steering-mode-joueur-record';

  // options.lives : nombre de cœurs (mode Niveaux). Sans cœurs, règle « grossir » du mode libre.
  function create(baseRadius, options = {}) {
    return {
      lives: Number.isInteger(options.lives) && options.lives > 0 ? options.lives : null,
      maxLives: Number.isInteger(options.lives) && options.lives > 0 ? options.lives : null,
      phase: 'countdown',
      countdown: COUNTDOWN,
      time: 0,
      score: 0,
      hits: 0,
      nearMisses: 0,
      baseRadius,
      radius: baseRadius,
      grace: 0,
      near: new WeakMap(),
    };
  }

  function sizeFactor(state) {
    return state.radius / state.baseRadius;
  }

  // Fait avancer le chrono et le score de dt secondes.
  function advance(state, dt, vehicleCount) {
    if (state.phase === 'countdown') {
      state.countdown -= dt;
      if (state.countdown <= 0) {
        state.phase = 'playing';
        state.countdown = 0;
      }
      return;
    }
    if (state.phase !== 'playing') return;
    state.time += dt;
    state.score += dt * POINTS_PER_VEHICLE * vehicleCount;
    state.grace = Math.max(0, state.grace - dt);
  }

  // Bonus de vitesse des vaisseaux : +1 à chaque palier de SPEED_STEP secondes.
  function speedBonus(state) {
    return Math.floor(state.time / SPEED_STEP);
  }

  // Secondes restantes avant la prochaine accélération.
  function nextSpeedUp(state) {
    return SPEED_STEP - (state.time % SPEED_STEP);
  }

  // Nombre de vaisseaux au départ, ramené à un entier entre MIN_START et MAX_START.
  function clampStartCount(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return START_COUNT;
    return Math.min(MAX_START, Math.max(MIN_START, n));
  }

  function distance(vehicle, pos) {
    return Math.hypot(vehicle.pos.x - pos.x, vehicle.pos.y - pos.y);
  }

  function touching(vehicle, pos, radius) {
    return distance(vehicle, pos) <= radius + HIT_MARGIN;
  }

  // Premier vaisseau qui touche la cible (null pendant l'invulnérabilité ou hors partie).
  function findHit(state, vehicles, pos) {
    if (state.phase !== 'playing' || state.grace > 0) return null;
    return vehicles.find(v => touching(v, pos, state.radius)) ?? null;
  }

  // Applique une touche. Renvoie le nouveau nombre de vaisseaux et si la partie est finie.
  function registerHit(state, vehicleCount) {
    state.hits++;
    state.radius *= GROWTH;
    state.grace = GRACE;
    state.near = new WeakMap();
    const over = sizeFactor(state) >= MAX_SIZE_FACTOR;
    if (over) state.phase = 'over';
    return { over, newCount: Math.min(MAX_COUNT, vehicleCount * VEHICLE_FACTOR) };
  }

  // Mode Niveaux : une touche retire un cœur (la cible garde sa taille) ; à 0, game over.
  function loseLife(state) {
    state.hits++;
    state.lives = Math.max(0, state.lives - 1);
    state.grace = GRACE;
    state.near = new WeakMap();
    const over = state.lives === 0;
    if (over) state.phase = 'over';
    return { over, lives: state.lives };
  }

  // Frôlements : un vaisseau entre dans la zone proche puis en ressort sans toucher.
  // Renvoie les vaisseaux qui viennent de valider un frôlement (le bonus est déjà compté).
  function checkNearMisses(state, vehicles, pos) {
    const done = [];
    if (state.phase !== 'playing') return done;
    for (const v of vehicles) {
      const d = distance(v, pos);
      if (d <= state.radius + NEAR_MARGIN) state.near.set(v, true);
      else if (d > state.radius + SAFE_MARGIN && state.near.get(v)) {
        state.near.delete(v);
        state.nearMisses++;
        state.score += nearMissBonus(state);
        done.push(v);
      }
    }
    return done;
  }

  function nearMissBonus(state) {
    return NEAR_MISS_BONUS * sizeFactor(state);
  }

  // Position aléatoire à au moins minDistance de pos (sinon le coin le plus éloigné).
  function spawnAway(pos, w, h, minDistance, rng = Math.random) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const point = { x: rng() * w, y: rng() * h };
      if (Math.hypot(point.x - pos.x, point.y - pos.y) >= minDistance) return point;
    }
    const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: h }, { x: w, y: h }];
    return corners.reduce((best, c) =>
      Math.hypot(c.x - pos.x, c.y - pos.y) > Math.hypot(best.x - pos.x, best.y - pos.y) ? c : best);
  }

  // 75.34 s -> "01:15.3"
  function formatTime(seconds) {
    const s = Math.max(0, seconds);
    const minutes = Math.floor(s / 60);
    const rest = s - minutes * 60;
    return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
  }

  // Record conservé dans le navigateur ; tout échec de stockage est ignoré.
  function loadBest(storage) {
    try {
      const value = Number(storage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function saveBest(storage, score) {
    try {
      storage.setItem(BEST_KEY, String(Math.floor(score)));
    } catch {
      // stockage indisponible (navigation privée, fichier local...) : le record reste en mémoire
    }
  }

  return { COUNTDOWN, GRACE, START_COUNT, MIN_START, MAX_START, SPEED_STEP, MAX_SIZE_FACTOR,
    NEAR_MARGIN, SAFE_MARGIN, create, sizeFactor, advance, speedBonus, nextSpeedUp,
    clampStartCount, touching, findHit, registerHit, loseLife, checkNearMisses,
    nearMissBonus, spawnAway, formatTime, loadBest, saveBest };
})();
