// Niveaux du jeu (règles pures, sans dessin ni steering).
//
// Une partie dure `duration` secondes (1 minute). Les ÉTOILES suivent les CŒURS : si l'on
// survit jusqu'au bout, on gagne autant d'étoiles que de cœurs restants (3 = or, 2 = argent,
// 1 = bronze) ; si l'on perd tous ses cœurs avant la fin, le niveau est échoué (0 étoile).
//
// La vitesse des vaisseaux est donnée directement en PIXELS PAR SECONDE (vitesse réelle
// garantie : les vaisseaux des niveaux avancent toujours à cette vitesse, voir Vaisseau.chase ;
// speedScale.js donne le cran du barème correspondant, comme repère). La force max reste
// constante et ne sert qu'à tourner. Des PALIERS peuvent changer la vitesse en cours de partie
// (transition douce en RAMP secondes) ; le palier marqué `excite` rend les vaisseaux rouges.
// `barriers` : barres néon (positions en fraction de la scène) ; les toucher coûte un cœur,
// rester trop près les fait surchauffer (anti-glitch, réglé par `camp`).
//
// Les niveaux 1 à 4 sont écrits à la main ; les niveaux 5 à 100 sont GÉNÉRÉS avec la même
// logique (fonction generate, déterministe) : 10 mondes de 10 niveaux, difficulté croissante,
// un niveau « boss » à la fin de chaque monde.
const LevelRules = (() => {
  const RAMP = 3;
  const MIN_SPEED = 60;     // px/s
  const MAX_SPEED = 1200;   // px/s
  const BAR_WIDTH = Math.round((5 / 2.54) * 96); // 5 cm à 96 points par pouce ≈ 189 px
  const BAR_THICKNESS = 18;
  const TOTAL_LEVELS = 100;
  const LEVELS_PER_WORLD = 10;

  const WORLDS = [
    { id: 1, name: 'Premiers pas', hue: 200 },
    { id: 2, name: 'Les barres', hue: 275 },
    { id: 3, name: 'Accélération', hue: 18 },
    { id: 4, name: 'Labyrinthe', hue: 160 },
    { id: 5, name: 'Essaim', hue: 330 },
    { id: 6, name: 'Tempête', hue: 228 },
    { id: 7, name: 'Forteresse', hue: 42 },
    { id: 8, name: 'Hypervitesse', hue: 0 },
    { id: 9, name: 'Chaos', hue: 295 },
    { id: 10, name: 'Légende', hue: 50 },
  ];

  // Une barre : centre (x, y) en fraction de la scène, horizontale ('h') ou verticale ('v').
  function bar(x, y, orientation = 'h', scale = 1) {
    const length = Math.round(BAR_WIDTH * scale);
    return orientation === 'h' ? { x, y, w: length, h: BAR_THICKNESS } : { x, y, w: BAR_THICKNESS, h: length };
  }

  const LAYOUTS = {
    none: [],
    centerH: [bar(0.5, 0.5, 'h')],
    centerV: [bar(0.5, 0.5, 'v')],
    twoH: [bar(0.5, 0.33, 'h'), bar(0.5, 0.67, 'h')],
    twoV: [bar(0.33, 0.5, 'v'), bar(0.67, 0.5, 'v')],
    gate: [bar(0.3, 0.5, 'h'), bar(0.7, 0.5, 'h')],
    cross: [bar(0.5, 0.5, 'h', 1.4), bar(0.5, 0.5, 'v', 1.4)],
    zigzag: [bar(0.3, 0.35, 'v'), bar(0.5, 0.65, 'v'), bar(0.7, 0.35, 'v')],
    corners: [bar(0.25, 0.3, 'h'), bar(0.75, 0.3, 'h'), bar(0.25, 0.7, 'h'), bar(0.75, 0.7, 'h')],
    frame: [bar(0.5, 0.22, 'h', 1.6), bar(0.5, 0.78, 'h', 1.6), bar(0.18, 0.5, 'v'), bar(0.82, 0.5, 'v')],
  };

  // Dispositions de barres possibles pour chaque monde (de la plus simple à la plus dure).
  const POOLS = [
    ['none', 'centerH', 'centerV', 'none', 'gate'],
    ['centerH', 'centerV', 'twoH', 'twoV', 'gate'],
    ['none', 'centerH', 'twoH', 'gate', 'centerV'],
    ['cross', 'zigzag', 'twoV', 'gate', 'twoH'],
    ['none', 'centerH', 'centerV', 'twoH', 'none'],
    ['cross', 'corners', 'gate', 'zigzag', 'twoV'],
    ['frame', 'cross', 'corners', 'zigzag', 'gate'],
    ['none', 'centerH', 'twoH', 'centerV', 'twoV'],
    ['corners', 'frame', 'zigzag', 'cross', 'gate'],
    ['frame', 'cross', 'corners', 'zigzag', 'twoH'],
  ];
  const BOSS_LAYOUTS = ['gate', 'cross', 'twoH', 'zigzag', 'corners', 'frame', 'frame', 'cross', 'frame', 'frame'];

  const common = {
    lives: 3,
    force: 0.1,
    duration: 60,
    showTrails: false,
    showVectors: false,
    background: 'white',
    // anti-glitch : rester à moins de radius px d'une barre pendant time s la fait surchauffer
    camp: { radius: 60, time: 2 },
  };

  const HANDMADE = [
    { ...common, id: 1, name: 'Premier contact', vehicles: 7, stages: [{ at: 0, speed: 420 }], barriers: [] },
    { ...common, id: 2, name: 'Encerclement', vehicles: 10, stages: [{ at: 0, speed: 420 }], barriers: [] },
    {
      ...common, id: 3, name: 'Excitation', vehicles: 7, barriers: [],
      stages: [{ at: 0, speed: 420 }, { at: 30, speed: 500, excite: true }],
    },
    {
      ...common, id: 4, name: 'La barre', vehicles: 7, barriers: LAYOUTS.centerH,
      stages: [{ at: 0, speed: 420 }, { at: 30, speed: 500, excite: true }],
    },
  ];

  const round10 = v => Math.round(v / 10) * 10;

  // Niveau `id` (5 à 100) construit avec la même logique que les niveaux faits main.
  function generate(id) {
    const w = Math.floor((id - 1) / LEVELS_PER_WORLD);   // monde (0 à 9)
    const k = (id - 1) % LEVELS_PER_WORLD;              // rang dans le monde (0 à 9)
    const boss = k === LEVELS_PER_WORLD - 1;
    const world = WORLDS[w];
    const base = round10(Math.min(800, 420 + (id - 1) * 4));
    const stages = [{ at: 0, speed: base }];
    if (boss) {
      stages.push({ at: 20, speed: round10(Math.min(1000, base + 90 + w * 8)), excite: true });
      stages.push({ at: 40, speed: round10(Math.min(1100, base + 170 + w * 10)) });
    } else if (w >= 2 || k % 2 === 1) {
      stages.push({ at: 30, speed: round10(Math.min(1000, base + 80 + w * 8)), excite: true });
    }
    const layout = boss ? BOSS_LAYOUTS[w] : POOLS[w][(id * 7 + w) % POOLS[w].length];
    return {
      ...common,
      id,
      world: world.id,
      boss,
      name: boss ? `Boss — ${world.name}` : `${world.name} ${k + 1}`,
      vehicles: Math.min(boss ? 32 : 28, 7 + Math.floor((id - 1) / 4) + (boss ? 4 : 0)),
      stages,
      barriers: LAYOUTS[layout],
      layout,
      camp: { radius: 60, time: Math.max(1.2, 2 - w * 0.08) },
    };
  }

  const LEVELS = [
    ...HANDMADE.map(l => ({ ...l, world: 1, boss: false, layout: l.barriers.length ? 'centerH' : 'none' })),
    ...Array.from({ length: TOTAL_LEVELS - HANDMADE.length }, (_, i) => generate(HANDMADE.length + 1 + i)),
  ];
  // valeurs de départ, pratiques pour les sliders
  for (const level of LEVELS) {
    level.maxSpeed = level.stages[0].speed;
    level.maxForce = level.force;
  }

  const MEDALS = ['bronze', 'silver', 'gold'];
  const LABELS = { bronze: 'Bronze', silver: 'Argent', gold: 'Or' };
  const PROGRESS_KEY = 'seek-game-niveaux';

  function get(id) {
    const level = LEVELS.find(l => l.id === id);
    if (!level) throw new RangeError(`Niveau inconnu : ${id}`);
    return level;
  }

  function worldOf(id) {
    return WORLDS[Math.floor((id - 1) / LEVELS_PER_WORLD)];
  }

  // Étoiles d'une partie : les cœurs restants si l'on a survécu jusqu'au bout, sinon 0.
  function starsFor(level, lives, survived) {
    if (!survived) return 0;
    return Math.max(0, Math.min(MEDALS.length, Math.floor(lives)));
  }

  // Médaille correspondant à un nombre d'étoiles (null pour 0).
  function medalFor(stars) {
    return stars > 0 ? MEDALS[Math.min(stars, MEDALS.length) - 1] : null;
  }

  function completed(level, time) {
    return time >= level.duration;
  }

  function remaining(level, time) {
    return Math.max(0, level.duration - time);
  }

  // Indice du dernier palier commencé à `time` (0 au départ).
  function stageIndex(level, time) {
    let index = 0;
    level.stages.forEach((stage, i) => {
      if (time >= stage.at) index = i;
    });
    return index;
  }

  // Prochain palier (ou null s'il n'y en a plus).
  function nextStage(level, time) {
    const stage = level.stages.find(s => s.at > time);
    return stage ? { ...stage, remaining: stage.at - time } : null;
  }

  // 0 avant le palier d'excitation (ou sans excitation), puis monte jusqu'à 1 pendant sa rampe.
  function excitement(level, time) {
    const e = level.stages.find(s => s.excite);
    if (!e || time < e.at) return 0;
    return Math.min(1, (time - e.at) / RAMP);
  }

  function isExcited(level, time) {
    return excitement(level, time) > 0;
  }

  // Paramètres des vaisseaux à l'instant `time`, avec une transition douce à chaque palier :
  //   speed : vitesse réelle en px/s ; force : force max, constante.
  // base : valeurs réglées aux sliders (vitesse de départ en px/s, force) ; l'écart de vitesse
  // avec le palier 0 décale toute la courbe (pour régler le jeu pendant le développement).
  function paramsAt(level, time, base = {}) {
    const st = level.stages;
    const i = stageIndex(level, time);
    const prev = st[Math.max(0, i - 1)];
    const k = i === 0 ? 1 : Math.min(1, (time - st[i].at) / RAMP);
    const speed = prev.speed + (st[i].speed - prev.speed) * k;
    const dSpeed = Number.isFinite(base.speed) ? base.speed - st[0].speed : 0;
    const force = Number.isFinite(base.force) ? base.force : level.force;
    return {
      speed: Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed + dSpeed)),
      force: Math.max(0.01, force),
    };
  }

  // Vitesse seule (compatibilité) : baseSpeed décale la courbe comme dans paramsAt.
  function speedAt(level, time, baseSpeed) {
    return paramsAt(level, time, { speed: baseSpeed }).speed;
  }

  // Traînées visibles : toujours (showTrails), ou à partir de trailsAt secondes de survie.
  function trailsVisible(level, time) {
    return Boolean(level.showTrails) || (Number.isFinite(level.trailsAt) && time >= level.trailsAt);
  }

  // Barres d'un niveau, en pixels pour une scène w × h : { x, y, w, h } (x, y = centre).
  function barriersFor(level, w, h) {
    return level.barriers.map(b => ({ x: b.x * w, y: b.y * h, w: b.w, h: b.h }));
  }

  // Meilleures étoiles par niveau, gardées dans le navigateur : { 1: 2, ... }.
  function loadProgress(storage) {
    try {
      const data = JSON.parse(storage.getItem(PROGRESS_KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  // Enregistre un résultat (on ne garde que le meilleur) ; renvoie la progression à jour.
  function saveProgress(storage, id, stars) {
    const progress = loadProgress(storage);
    progress[id] = Math.max(progress[id] || 0, stars);
    try {
      storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // stockage indisponible : la progression reste valable pour cette session
    }
    return progress;
  }

  function exists(id) {
    return LEVELS.some(l => l.id === id);
  }

  // Tableau des niveaux 1 à TOTAL_LEVELS. Un niveau est jouable si le précédent a été validé
  // (au moins une étoile) — ou s'ils sont tous ouverts (unlockAll : mode développeur).
  function board(progress = {}, { unlockAll = false } = {}) {
    return Array.from({ length: TOTAL_LEVELS }, (_, i) => {
      const id = i + 1;
      const defined = exists(id);
      const unlocked = unlockAll || id === 1 || (progress[id - 1] || 0) >= 1;
      const status = !defined ? 'soon' : unlocked ? 'open' : 'locked';
      const level = defined ? get(id) : null;
      return { id, status, stars: progress[id] || 0, name: level ? level.name : null,
        world: worldOf(id).id, boss: level ? level.boss : false };
    });
  }

  // Niveau suivant jouable une fois `id` validé, ou null.
  function nextLevel(id, progress = {}, options = {}) {
    const cell = board(progress, options)[id];
    return cell && cell.status === 'open' ? cell.id : null;
  }

  // Niveau à proposer sur « Jouer » : le premier niveau ouvert pas encore validé, sinon le
  // premier niveau ouvert sans les 3 étoiles, sinon le dernier.
  function continueLevel(progress = {}, options = {}) {
    const cells = board(progress, options).filter(c => c.status === 'open');
    return (cells.find(c => c.stars === 0) || cells.find(c => c.stars < 3) || cells[cells.length - 1]).id;
  }

  function totalStars(progress = {}) {
    return Object.values(progress).reduce((s, v) => s + (Number(v) || 0), 0);
  }

  function worldStars(progress, worldId) {
    let total = 0;
    for (let id = (worldId - 1) * LEVELS_PER_WORLD + 1; id <= worldId * LEVELS_PER_WORLD; id++) {
      total += progress[id] || 0;
    }
    return total;
  }

  return { RAMP, MIN_SPEED, MAX_SPEED, BAR_WIDTH, BAR_THICKNESS, TOTAL_LEVELS, LEVELS_PER_WORLD, WORLDS,
    LAYOUTS, LEVELS, MEDALS, LABELS, get, worldOf, generate, exists, board, nextLevel, continueLevel,
    totalStars, worldStars, trailsVisible, barriersFor, starsFor, medalFor, completed, remaining,
    stageIndex, nextStage, excitement, isExcited, paramsAt, speedAt, loadProgress, saveProgress };
})();
