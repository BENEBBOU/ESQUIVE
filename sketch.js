let target;        // cible pilotée par la souris (MouseTarget)
let movingTarget;  // cible autonome (Target) : scénario 1 et variante
let fuyante;       // cible fuyante (TargetFuyante) : scénario 2
let joueur;        // cible du mode joueur (PlayerTarget), placée sur la souris
let game = null;   // état de la partie (PlayerGame)
let bestScore = 0;
let shake = 0;     // tremblement de l'écran après une touche
let flash = 0;     // éclair rouge après une touche
let mode = 'niveaux';
let currentLevel = LevelRules.get(1);
let levelProgress = {};      // meilleures étoiles par niveau
let niveauEtat = null;       // annonces déjà faites pendant la partie en cours
let sheet = null;            // membrane élastique du fond blanc (RubberSheet)
let lastCursor = null;       // position précédente du curseur, pour sa vitesse
let barrieres = [];          // barres néon (Barrier) du niveau en cours

// Mode développeur (index.html?dev) : en-tête de réglages, tableau de bord avec les mesures,
// scénarios d'exercice et tous les niveaux ouverts. Sinon : jeu publié (menus, HUD épuré).
const DEV = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('dev')) {
      const on = q.get('dev') !== '0';
      localStorage.setItem('esquive-dev', on ? '1' : '0');
      return on;
    }
    return localStorage.getItem('esquive-dev') === '1';
  } catch {
    return false;
  }
})();
let appState = DEV ? 'game' : 'menu';   // 'menu' (écrans, démo animée) ou 'game'
let settings = { sound: true, shake: true, rubber: true };
let finAffichee = false;      // écran de fin déjà programmé pour cette partie
let demoT = 0;                // horloge de la démo de l'écran titre
let derniereBoule = null;    // position de la boule à l'image précédente (collision avec la barre)
let boardWasPaused = false;  // état de la pause avant l'ouverture du tableau
const vehicles = [];
const particles = [];
let sceneCanvas;
let vitesseMaxSlider;
let forceMaxSlider;
let zoneSound = null; // créé au premier clic sur « Activer le son »
let paused = false;
let simTime = 0;      // horloge de l'animation (figée pendant la pause)
let captures = 0;
let lastPing = 0;
const bgCenter = { x: 0, y: 0 };
const ui = {};

const SCENARIOS = {
  'niveaux': {
    titre: 'Niveaux — survivez !',
    hint: 'Survivez 1 minute : vos cœurs restants deviennent vos étoiles (3 = or, 2 = argent, 1 = bronze). '
      + 'N : tableau des niveaux. R pour rejouer.',
  },
  'scenario-1': {
    titre: 'Scénario 1 — Les vaisseaux chassent la cible',
    hint: 'Les vaisseaux poursuivent la cible ; celui qui la touche réapparaît ailleurs.',
  },
  'scenario-2': {
    titre: 'Scénario 2 — La cible fuit le vaisseau le plus proche',
    hint: 'Un vaisseau dans le cercle de détection ? La cible fuit en accélérant, jusqu’à 300 px.',
  },
  'joueur': {
    titre: 'Mode joueur — échappez aux vaisseaux !',
    hint: 'Chaque touche double votre taille et le nombre de vaisseaux. À ×4 : game over. '
      + 'Frôlez-les pour des bonus. R pour rejouer.',
  },
  'seek-souris': {
    titre: 'Seek — cible souris',
    hint: 'Déplacez la souris dans la scène pour guider la cible.',
  },
  'flee-souris': {
    titre: 'Flee — fuir la souris',
    hint: 'Les vaisseaux errent au hasard et fuient la souris quand ils sont dans la zone.',
  },
  'target-reapparait': {
    titre: 'Variante — la Target réapparaît',
    hint: "Quand un vaisseau atteint la Target, c'est elle qui réapparaît ailleurs.",
  },
};

function sceneHeight() {
  return Math.max(1, windowHeight - document.getElementById('controls').offsetHeight);
}

function nouveauVaisseau(x, y) {
  return new Vaisseau(x, y);
}

// Ajuste la population à nb vaisseaux suiveurs (les vaisseaux existants sont conservés).
function creerVehicules(nb) {
  SeekPopulation.resize(vehicles, nb, target.pos, width, height, nouveauVaisseau);
}

// Crée un slider p5 avec son label et l'affichage de sa valeur dans la barre de contrôle.
function creerSliderReglage(texte, min, max, value, step) {
  const label = createSpan(texte);
  label.parent('reglages');
  const slider = createSlider(min, max, value, step);
  slider.parent('reglages');
  slider.addClass('reglage');
  const valeur = createSpan(value);
  valeur.parent('reglages');
  valeur.addClass('reglage-valeur');
  slider.input(() => valeur.html(texteSlider(slider)));
  slider.afficheur = valeur;
  slider.libelle = label;
  return slider;
}

function texteSlider(slider) {
  return slider.formater ? slider.formater(slider.value()) : slider.value();
}

// Place un slider p5 sur une valeur et met à jour son affichage.
function reglerSlider(slider, value) {
  slider.value(value);
  slider.afficheur.html(texteSlider(slider));
}

// En mode Niveaux, le slider de vitesse règle un cran du barème (1 à 20) ; ailleurs, une
// vitesse max en pixels par image (1 à 30).
function configurerSliderVitesse(niveau) {
  const el = vitesseMaxSlider.elt;
  el.min = 1;
  el.min = niveau ? LevelRules.MIN_SPEED : 1;
  el.max = niveau ? LevelRules.MAX_SPEED : 30;
  el.step = niveau ? 10 : 1;
  vitesseMaxSlider.libelle.html(niveau ? 'Vitesse :' : 'Vitesse max :');
  vitesseMaxSlider.formater = niveau ? v => SpeedScale.describe(Number(v)) : null;
  if (!niveau && Number(vitesseMaxSlider.value()) < 4) vitesseMaxSlider.value(4);
  vitesseMaxSlider.afficheur.html(texteSlider(vitesseMaxSlider));
}

function modeJeu() {
  return mode === 'joueur' || mode === 'niveaux';
}

// Relie un slider HTML à son affichage « N px ».
function lierSliderPx(slider, output) {
  const maj = () => { output.value = `${slider.value} px`; };
  slider.addEventListener('input', maj);
  maj();
}

function changerMode(nouveauMode) {
  mode = nouveauMode;
  ui.mode.value = mode;
  document.getElementById('flee-controls').hidden = mode !== 'flee-souris';
  document.getElementById('detection-controls').hidden = mode !== 'scenario-2';
  document.getElementById('game-controls').hidden = !modeJeu();
  document.getElementById('level-info').hidden = mode !== 'niveaux';
  // pendant une partie, c'est le jeu qui décide du nombre de vaisseaux
  ui.vehicleCount.disabled = modeJeu();
  // dans un niveau, c'est le niveau qui décide d'afficher traînées et vecteurs
  ui.showTrails.disabled = mode === 'niveaux';
  ui.showVectors.disabled = mode === 'niveaux';
  for (const v of vehicles) v.excitement = 0;
  configurerSliderVitesse(mode === 'niveaux');
  document.getElementById('hint').textContent = SCENARIOS[mode].hint;
  captures = 0;
  particles.length = 0;
  fuyante.fleeing = false;
  fuyante.predator = null;
  if (mode === 'joueur') nouvellePartie();
  else if (mode === 'niveaux') demarrerNiveau(currentLevel.id);
  else game = null;
  // la hauteur de la barre de contrôle peut changer
  resizeCanvas(windowWidth, sceneHeight());
}

async function basculerSon() {
  if (!zoneSound) zoneSound = ZoneSound.create();
  if (zoneSound.isRunning()) await zoneSound.suspend();
  else await zoneSound.resume();
  const actif = zoneSound.isRunning();
  ui.sound.setAttribute('aria-pressed', String(actif));
  ui.sound.textContent = actif ? 'Couper le son' : 'Activer le son';
}

function basculerPause() {
  paused = !paused;
  ui.pause.setAttribute('aria-pressed', String(paused));
  ui.pause.textContent = paused ? 'Reprendre' : 'Pause';
}

function ping(frequency, duration) {
  if (!zoneSound || millis() - lastPing < 80) return;
  lastPing = millis();
  zoneSound.ping(frequency, duration);
}

// Un vaisseau a touché la cible en `at` : explosion, onde à son point de réapparition, son.
function capture(vehicle, at) {
  captures++;
  Effects.burst(particles, at.x, at.y, { hue: vehicle.hue, count: 22 });
  Effects.burst(particles, vehicle.pos.x, vehicle.pos.y, { hue: vehicle.hue, count: 0 });
  ping(660 + (captures % 8) * 55, 0.4);
}

// La cible fuyante vient de repérer un prédateur.
function alerte() {
  Effects.burst(particles, fuyante.pos.x, fuyante.pos.y, { hue: 350, count: 12 });
  ping(220, 0.7);
}

// ---------------------------------------------------------------- mode joueur

function stockage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function synchroniserCompteur() {
  ui.vehicleCount.value = vehicles.length;
  ui.vehicleCountValue.value = `${vehicles.length} / ${SeekPopulation.MAX_COUNT}`;
}

// Distance minimale d'apparition des vaisseaux autour du joueur.
function distanceSure() {
  return Math.min(Math.min(width, height) * 0.45, joueur.r + 250);
}

// Point d'apparition loin du joueur et à l'écart des barres.
function pointApparition() {
  let p = PlayerGame.spawnAway(joueur.pos, width, height, distanceSure());
  for (let i = 0; i < 30 && barrieres.some(b => b.distanceTo(p) < 70); i++) {
    p = PlayerGame.spawnAway(joueur.pos, width, height, distanceSure());
  }
  return p;
}

function placerLoin(vehicle) {
  const p = pointApparition();
  vehicle.pos.set(p.x, p.y);
  vehicle.vel.set(0, 0);
  vehicle.acc.set(0, 0);
  vehicle.trail.length = 0;
}

function ajouterVaisseaux(total) {
  while (vehicles.length < total) {
    const p = pointApparition();
    vehicles.push(new Vaisseau(p.x, p.y));
  }
}

function nouvellePartie() {
  game = PlayerGame.create(PlayerTarget.BASE_RADIUS, mode === 'niveaux' ? { lives: currentLevel.lives } : {});
  // 1 s de protection au départ : la boule peut se trouver sur une barre au « GO »
  if (mode === 'niveaux') game.grace = 1;
  finAffichee = false;
  niveauEtat = { palier: 0, trainees: false, resultat: 0, meilleurEtoiles: false, dernierDecompte: null };
  joueur.reset();
  joueur.pos.set(target.pos.x, target.pos.y);
  particles.length = 0;
  vehicles.length = 0;
  ajouterVaisseaux(PlayerGame.clampStartCount(ui.gameStartCount.value));
  synchroniserCompteur();
  shake = 0;
  flash = 0;
}

// Mode Niveaux : la cible garde sa taille, on perd un cœur ; à 0 cœur, game over.
// `vehicle` : le vaisseau qui a touché la boule, ou null si c'est la barre.
function perdreCoeur(vehicle) {
  const { over, lives } = PlayerGame.loseLife(game);
  shake = 16;
  flash = 1;
  Effects.burst(particles, joueur.pos.x, joueur.pos.y, { hue: vehicle ? vehicle.hue : 0, count: 40 });
  if (over) {
    finDePartie();
    return;
  }
  Effects.popup(particles, joueur.pos.x, joueur.pos.y - joueur.r - 30,
    `−1 ♥  (${lives} restant${lives > 1 ? 's' : ''})`, { hue: 350, size: 28 });
  // on dégage les abords du joueur
  for (const v of vehicles) {
    if (Math.hypot(v.pos.x - joueur.pos.x, v.pos.y - joueur.pos.y) < joueur.r + 150) placerLoin(v);
  }
  if (vehicle) placerLoin(vehicle);
  ping(196, 0.6);
}

function toucheJoueur(vehicle) {
  if (mode === 'niveaux') {
    perdreCoeur(vehicle);
    return;
  }
  const { over, newCount } = PlayerGame.registerHit(game, vehicles.length);
  joueur.r = game.radius;
  shake = 16;
  flash = 1;
  Effects.burst(particles, joueur.pos.x, joueur.pos.y, { hue: vehicle.hue, count: 40 });
  if (over) {
    finDePartie();
    return;
  }
  Effects.popup(particles, joueur.pos.x, joueur.pos.y - joueur.r - 30,
    `TOUCHÉ ! ×${PlayerGame.sizeFactor(game)}`, { hue: 0, size: 28 });
  // on dégage les abords du joueur, puis les renforts arrivent de loin
  for (const v of vehicles) {
    if (Math.hypot(v.pos.x - joueur.pos.x, v.pos.y - joueur.pos.y) < joueur.r + 150) placerLoin(v);
  }
  placerLoin(vehicle);
  ajouterVaisseaux(newCount);
  synchroniserCompteur();
  ping(196, 0.6);
}

function finDePartie() {
  for (let i = 0; i < 5; i++) {
    Effects.burst(particles, joueur.pos.x + random(-50, 50), joueur.pos.y + random(-50, 50),
      { hue: random(360), count: 30 });
  }
  game.newRecord = game.score > bestScore;
  if (game.newRecord) {
    bestScore = Math.floor(game.score);
    PlayerGame.saveBest(stockage(), bestScore);
  }
  if (mode === 'niveaux') finNiveau();
  ping(330, 0.4);
  setTimeout(() => ping(165, 1.2), 300);
}

// ---------------------------------------------------------------- niveaux

// Démarre un niveau : les sliders reprennent les paramètres du niveau (ils restent
// modifiables pour régler le jeu), puis une partie commence.
function demarrerNiveau(id) {
  currentLevel = LevelRules.get(id);
  reglerSlider(vitesseMaxSlider, currentLevel.maxSpeed);
  reglerSlider(forceMaxSlider, currentLevel.maxForce);
  ui.gameStartCount.value = currentLevel.vehicles;
  document.getElementById('game-start-count-value').value = currentLevel.vehicles;
  document.getElementById('level-name').textContent = `Niveau ${currentLevel.id} — ${currentLevel.name}`;
  barrieres = currentLevel.barriers.map(b => Object.assign(new Barrier(b.x * width, b.y * height, b.w, b.h),
    { fx: b.x, fy: b.y }));
  derniereBoule = null;
  nouvellePartie();
}

// Les barres sont placées en fraction de la scène : on les recale si la fenêtre change.
function placerBarrieres() {
  for (const b of barrieres) b.pos.set(b.fx * width, b.fy * height);
}

// La boule touche-t-elle une barre (position actuelle ou trajet depuis l'image précédente) ?
function toucheBarriere() {
  if (!barrieres.length || game.grace > 0) return false;
  placerBarrieres();
  return barrieres.some(b => b.touches(joueur.pos, derniereBoule, joueur.r));
}

const MEDAL_HUE = { bronze: 28, silver: 210, gold: 48 };
const MEDAL_COLOR = { bronze: '#cd7f32', silver: '#d6dbe3', gold: '#ffd23f' };

// Excitation, étoiles gagnées et victoire, annoncées une seule fois chacune.
function evenementsNiveau() {
  const t = game.time;
  // nouveau palier de difficulté : annonce (l'excitation a la sienne)
  const palier = LevelRules.stageIndex(currentLevel, t);
  if (palier > niveauEtat.palier) {
    niveauEtat.palier = palier;
    const stage = currentLevel.stages[palier];
    flash = stage.excite ? 0.8 : 0.5;
    shake = stage.excite ? 8 : 6;
    Effects.popup(particles, width / 2, height / 2 - 90, stage.excite ? 'ILS S’EXCITENT !' : 'ILS ACCÉLÈRENT !',
      { hue: 0, size: 42 });
    ping(110, 1.2);
    setTimeout(() => ping(147 + palier * 20, 0.9), 160);
  }
  if (!niveauEtat.trainees && !currentLevel.showTrails && LevelRules.trailsVisible(currentLevel, t)) {
    niveauEtat.trainees = true;
    Effects.popup(particles, width / 2, height / 2 + 30, 'TRAÎNÉES !', { hue: 200, size: 32 });
  }
  // dernières secondes : compte à rebours
  const reste = Math.ceil(LevelRules.remaining(currentLevel, t));
  if (reste <= 5 && reste > 0 && reste !== niveauEtat.dernierDecompte) {
    niveauEtat.dernierDecompte = reste;
    Effects.popup(particles, width / 2, height / 2 - 30, String(reste), { hue: 48, size: 56 });
    ping(520 + (6 - reste) * 60, 0.15);
  }
  if (LevelRules.completed(currentLevel, t)) {
    game.phase = 'won';
    finNiveau();
  }
}

// Fin d'un niveau (victoire ou game over) : étoiles enregistrées, feu d'artifice si gagné.
function finNiveau() {
  const etoiles = LevelRules.starsFor(currentLevel, game.lives, game.phase === 'won');
  const avant = levelProgress[currentLevel.id] || 0;
  levelProgress = LevelRules.saveProgress(stockage(), currentLevel.id, etoiles);
  niveauEtat.resultat = etoiles;
  niveauEtat.meilleurEtoiles = etoiles > avant;
  if (!DEV && !finAffichee) {
    finAffichee = true;
    const won = game.phase === 'won';
    const resultat = {
      level: currentLevel,
      stars: etoiles,
      won,
      time: game.time,
      lives: game.lives,
      nearMisses: game.nearMisses,
      score: game.score,
      best: levelProgress[currentLevel.id] || 0,
      newBest: etoiles > avant,
      next: won ? LevelRules.nextLevel(currentLevel.id, levelProgress, { unlockAll: DEV }) : null,
    };
    setTimeout(() => {
      if (appState === 'game' && game && (game.phase === 'over' || game.phase === 'won')) {
        document.body.classList.remove('in-game');
        Menu.showEnd(resultat);
      }
    }, won ? 1400 : 1100);
  }
  if (game.phase === 'won') {
    for (let i = 0; i < 8; i++) {
      Effects.burst(particles, random(width * 0.2, width * 0.8), random(height * 0.2, height * 0.7),
        { hue: random([28, 48, 210, 0, 120]), count: 35 });
    }
    game.newRecord = game.score > bestScore;
    if (game.newRecord) {
      bestScore = Math.floor(game.score);
      PlayerGame.saveBest(stockage(), bestScore);
    }
    ping(880, 0.4);
    setTimeout(() => ping(1100, 0.4), 150);
    setTimeout(() => ping(1320, 0.8), 300);
  }
}

// Étoile à cinq branches (pleine si `on`, grise sinon).
function etoile(x, y, r, couleur, on) {
  push();
  translate(x, y);
  stroke(on ? 0 : 120);
  strokeWeight(2);
  if (on) fill(couleur);
  else fill(60, 60, 70, 150);
  beginShape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    vertex(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  endShape(CLOSE);
  pop();
}

function dessinerEtoiles(cx, cy, r, count) {
  LevelRules.MEDALS.forEach((m, i) => {
    const lift = i === 1 ? -r * 0.35 : 0;
    etoile(cx + (i - 1) * r * 2.4, cy + lift, i === 1 ? r * 1.15 : r, MEDAL_COLOR[m], i < count);
  });
}

function mmss(seconds) {
  return PlayerGame.formatTime(seconds).slice(0, 5);
}

// Cœurs restants, en grand en haut à droite de la scène.
function dessinerCoeurs() {
  push();
  textAlign(RIGHT, TOP);
  textStyle(BOLD);
  textSize(34);
  stroke(0);
  strokeWeight(4);
  for (let i = 0; i < game.maxLives; i++) {
    const plein = i < game.lives;
    // le dernier cœur bat quand il ne reste plus qu'une vie
    const pulse = plein && game.lives === 1 ? 1 + 0.15 * Math.sin(frameCount * 0.25) : 1;
    textSize(34 * pulse);
    fill(plein ? color(255, 45, 85) : color(200, 200, 210, 160));
    text(plein ? '♥' : '♡', width - 16 - (game.maxLives - 1 - i) * 42, 12);
  }
  pop();
}

function dessinerOverlayNiveau() {
  if (game.lives !== null) dessinerCoeurs();
  push();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  if (game.phase === 'countdown') {
    const n = Math.ceil(game.countdown);
    const t = game.countdown - Math.floor(game.countdown);
    texteCentre(`NIVEAU ${currentLevel.id}`, height / 2 - 120, 44, color(255, 210, 60));
    texteCentre(String(n), height / 2, 90 + 80 * t);
    textStyle(NORMAL);
    texteCentre(`Survivez ${mmss(currentLevel.duration)} : 3 cœurs = or · 2 = argent · 1 = bronze`,
      height / 2 + 100, 22);
    if (currentLevel.barriers.length) texteCentre('Attention : toucher la barre coûte un cœur !', height / 2 + 135, 20,
      color(255, 120, 140));
  } else if (game.phase === 'playing' && game.time < 0.8) {
    texteCentre('GO !', height / 2, 110 * (1 + game.time), color(255, 220, 0));
  } else if (DEV && (game.phase === 'over' || game.phase === 'won')) {
    const etoiles = niveauEtat.resultat;
    noStroke();
    fill(5, 6, 18, 225);
    rectMode(CENTER);
    rect(width / 2, height / 2, Math.min(width - 32, 560), 400, 22);
    const won = game.phase === 'won';
    const titre = won ? (etoiles === 3 ? 'PARFAIT !' : 'NIVEAU VALIDÉ') : 'NIVEAU ÉCHOUÉ';
    const couleur = won ? color(255, 210, 60) : color(255, 70, 90);
    texteCentre(titre, height / 2 - 150, 46, couleur);
    dessinerEtoiles(width / 2, height / 2 - 70, 30, etoiles);
    texteCentre(`Survie : ${PlayerGame.formatTime(game.time)}`, height / 2 + 5, 28);
    textStyle(NORMAL);
    texteCentre(`Score : ${Math.floor(game.score).toLocaleString('fr-FR')}   ·   Frôlements : ${game.nearMisses}`,
      height / 2 + 45, 18, color(220));
    const medal = LevelRules.medalFor(etoiles);
    texteCentre(won ? `${game.lives} cœur${game.lives > 1 ? 's' : ''} restant${game.lives > 1 ? 's' : ''} → `
      + `${LevelRules.LABELS[medal]}` : `Survivez ${mmss(currentLevel.duration)} pour valider le niveau`,
    height / 2 + 78, 17, color(200));
    if (niveauEtat.meilleurEtoiles) {
      textStyle(BOLD);
      const pulse = (Math.sin(frameCount * 0.2) + 1) / 2;
      texteCentre('NOUVEAU MEILLEUR RÉSULTAT !', height / 2 + 112, 22 + 3 * pulse, color(255, 220, 0));
    }
    textStyle(NORMAL);
    const suivant = LevelRules.nextLevel(currentLevel.id, levelProgress, { unlockAll: DEV });
    const aide = suivant ? `Entrée : niveau ${suivant}   ·   clic ou R : rejouer   ·   N : tableau`
      : 'Cliquez ou appuyez sur R pour rejouer   ·   N : tableau';
    texteCentre(aide, height / 2 + 160, 18, color(180));
  }
  pop();
}

// ---------------------------------------------------------------- tableau des niveaux

function tableauOuvert() {
  return !ui.board.hidden;
}

function ouvrirTableau() {
  const cells = LevelRules.board(levelProgress, { unlockAll: DEV });
  const total = cells.reduce((s, c) => s + c.stars, 0);
  ui.boardSummary.textContent = `★ ${total} / ${LevelRules.TOTAL_LEVELS * 3}`;
  ui.boardGrid.replaceChildren(...cells.map(cell => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `board-cell ${cell.status}${mode === 'niveaux' && cell.id === currentLevel.id ? ' current' : ''}`;
    const label = cell.status === 'open' ? `Niveau ${cell.id} — ${cell.name}`
      : cell.status === 'locked' ? `Niveau ${cell.id} — verrouillé` : `Niveau ${cell.id} — à venir`;
    button.title = label;
    button.setAttribute('aria-label', label);
    const mini = cell.status === 'open' ? etoilesHtml(cell.stars)
      : cell.status === 'locked' ? '🔒' : 'à venir';
    button.innerHTML = `<span class="num">${cell.id}</span><span class="mini">${mini}</span>`;
    if (cell.status === 'open') button.addEventListener('click', () => choisirNiveau(cell.id));
    else button.disabled = true;
    return button;
  }));
  boardWasPaused = paused;
  if (!paused) basculerPause();
  ui.board.hidden = false;
  const first = ui.boardGrid.querySelector('.board-cell.open');
  if (first) first.focus();
}

function fermerTableau() {
  ui.board.hidden = true;
  if (paused && !boardWasPaused) basculerPause();
}

function choisirNiveau(id) {
  ui.board.hidden = true;
  if (paused) basculerPause();
  currentLevel = LevelRules.get(id);
  if (mode !== 'niveaux') changerMode('niveaux');
  else demarrerNiveau(id);
}

// ---------------------------------------------------------------- fond élastique

function fondElastique(dt) {
  if (!settings.rubber) {
    background(255);
    return;
  }
  if (!sheet || sheet.w !== width || sheet.h !== height) sheet = RubberSheet.create(width, height);
  const cursor = { x: target.pos.x, y: target.pos.y };
  if (lastCursor && !paused) {
    // le curseur creuse la membrane d'autant plus qu'il s'est déplacé depuis l'image précédente
    const moved = Math.hypot(cursor.x - lastCursor.x, cursor.y - lastCursor.y);
    if (moved > 0.5) RubberSheet.poke(sheet, cursor.x, cursor.y, Math.min(moved, 30) * 6);
  }
  lastCursor = cursor;
  if (!paused) RubberSheet.step(sheet, dt);
  RubberSheet.draw(drawingContext, sheet);
}

function etoilesHtml(count) {
  return LevelRules.MEDALS.map((m, i) =>
    `<span class="${i < count ? 'on' : 'off'} ${m}" title="${LevelRules.LABELS[m]}">★</span>`).join('');
}

function majInterfaceNiveau() {
  // étoiles en jeu = cœurs restants (gagnées si l'on tient jusqu'à la fin)
  const enJeu = game.phase === 'over' ? 0 : game.phase === 'won' ? niveauEtat.resultat : game.lives;
  const html = etoilesHtml(enJeu);
  if (ui.levelStars.innerHTML !== html) ui.levelStars.innerHTML = html;
  ui.levelNext.value = game.phase === 'won' || game.phase === 'over' ? 'Terminé'
    : `Fin dans ${mmss(LevelRules.remaining(currentLevel, game.time))}`;
  const best = levelProgress[currentLevel.id] || 0;
  ui.levelBest.textContent = `Meilleur : ${'★'.repeat(best)}${'☆'.repeat(3 - best)}`;
}

function simulerJoueur(dt) {
  derniereBoule = { x: joueur.pos.x, y: joueur.pos.y };
  joueur.pos.set(target.pos.x, target.pos.y);
  joueur.animate();
  const niveau = mode === 'niveaux';
  const bonusAvant = niveau ? 0 : PlayerGame.speedBonus(game);
  PlayerGame.advance(game, dt, vehicles.length);
  joueur.invulnerable = game.grace > 0;
  if (game.phase !== 'playing') return;

  let bonus = 0;
  let vitesse = 0;
  let force = 0;
  let excitation = 0;
  if (niveau) {
    // niveau : vitesse de base (slider) puis excitation définie par le niveau
    evenementsNiveau();
    if (game.phase !== 'playing') return;
    const p = LevelRules.paramsAt(currentLevel, game.time,
      { speed: vitesseMaxSlider.value(), force: forceMaxSlider.value() });
    vitesse = p.speed;
    force = p.force;
    excitation = LevelRules.excitement(currentLevel, game.time);
  } else {
    // mode libre : +1 de vitesse max toutes les 10 s
    bonus = PlayerGame.speedBonus(game);
    if (bonus > bonusAvant) {
      Effects.popup(particles, width / 2, height / 2 - 60, `VITESSE +${bonus} !`, { hue: 30, size: 34 });
      ping(880, 0.3);
    }
  }
  let plusProche = Infinity;
  for (const v of vehicles) {
    if (niveau) {
      // vitesse réelle garantie : le vaisseau avance toujours à la vitesse de son cran
      v.maxForce = force;
      v.excitement = excitation;
      v.chase(joueur.pos, vitesse / SpeedScale.FPS);
      // obstacle : évitement par fuite (prioritaire sur la poursuite)
      for (const b of barrieres) v.applyForce(v.avoid(b));
      // garde-fou : jamais à travers une barre (le vaisseau glisse le long)
      for (const b of barrieres) v.applyForce(v.contact(b));
    } else {
      v.maxSpeed += bonus;
      v.applyBehaviors(joueur.pos);
    }
    v.update();
    v.edges();
    plusProche = Math.min(plusProche, Math.hypot(v.pos.x - joueur.pos.x, v.pos.y - joueur.pos.y));
  }
  joueur.danger = constrain(1 - (plusProche - joueur.r) / 200, 0, 1);

  for (const v of PlayerGame.checkNearMisses(game, vehicles, joueur.pos)) {
    Effects.popup(particles, v.pos.x, v.pos.y - 20, `+${Math.round(PlayerGame.nearMissBonus(game))}`);
    ping(1320, 0.15);
  }
  const touche = PlayerGame.findHit(game, vehicles, joueur.pos);
  if (touche) toucheJoueur(touche);
  else if (niveau && game.phase === 'playing' && toucheBarriere()) {
    Effects.popup(particles, joueur.pos.x, joueur.pos.y + joueur.r + 40, 'LA BARRE !', { hue: 0, size: 24 });
    perdreCoeur(null);
  } else if (niveau && game.phase === 'playing' && barrieres.length) {
    // anti-glitch : se cacher contre une barre (que les vaisseaux évitent) la fait surchauffer
    const camp = currentLevel.camp;
    for (const b of barrieres) {
      const pres = b.distanceTo(joueur.pos) < camp.radius;
      if (b.updateHeat(pres && game.grace === 0, dt, camp.time)) {
        Effects.popup(particles, joueur.pos.x, joueur.pos.y + joueur.r + 40, 'SURCHAUFFE !', { hue: 10, size: 26 });
        Effects.burst(particles, b.pos.x, b.pos.y, { hue: 10, count: 50 });
        perdreCoeur(null);
        break;
      }
    }
  }
}

function majInterfaceJeu() {
  ui.gameChrono.value = PlayerGame.formatTime(game.time);
  ui.gameScore.value = `Score : ${Math.floor(game.score).toLocaleString('fr-FR')}`;
  ui.gameBest.value = `Record : ${Math.max(bestScore, game.phase === 'over' ? 0 : Math.floor(game.score))
    .toLocaleString('fr-FR')}`;
  ui.gameSize.value = game.lives === null
    ? `Taille ×${PlayerGame.sizeFactor(game)} / ${PlayerGame.MAX_SIZE_FACTOR}`
    : `${'♥'.repeat(game.lives)}${'♡'.repeat(game.maxLives - game.lives)}`;
  ui.gameSize.classList.toggle('lives', game.lives !== null);
}

function texteCentre(texte, y, taille, couleur = 255) {
  textSize(taille);
  fill(couleur);
  stroke(0);
  strokeWeight(Math.max(3, taille / 8));
  text(texte, width / 2, y);
}

function dessinerOverlayJeu() {
  push();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  if (game.phase === 'countdown') {
    const n = Math.ceil(game.countdown);
    const t = game.countdown - Math.floor(game.countdown); // 1 -> 0 dans chaque seconde
    texteCentre(String(n), height / 2, 90 + 80 * t);
    texteCentre('Échappez aux vaisseaux avec la souris !', height / 2 + 100, 22);
  } else if (game.phase === 'playing' && game.time < 0.8) {
    texteCentre('GO !', height / 2, 110 * (1 + game.time), color(255, 220, 0));
  } else if (game.phase === 'over') {
    noStroke();
    fill(5, 6, 18, 210);
    rectMode(CENTER);
    rect(width / 2, height / 2, Math.min(width - 32, 520), 330, 20);
    texteCentre('GAME OVER', height / 2 - 115, 56, color(255, 60, 90));
    texteCentre(`Score : ${Math.floor(game.score).toLocaleString('fr-FR')}`, height / 2 - 50, 34);
    textStyle(NORMAL);
    texteCentre(`Temps : ${PlayerGame.formatTime(game.time)}   ·   Frôlements : ${game.nearMisses}`,
      height / 2 + 2, 18, color(220));
    if (game.newRecord) {
      textStyle(BOLD);
      const pulse = (Math.sin(frameCount * 0.2) + 1) / 2;
      texteCentre('NOUVEAU RECORD !', height / 2 + 50, 26 + 4 * pulse, color(255, 220, 0));
    } else {
      texteCentre(`Record : ${bestScore.toLocaleString('fr-FR')}`, height / 2 + 50, 20, color(200));
    }
    textStyle(NORMAL);
    texteCentre('Cliquez ou appuyez sur R pour rejouer', height / 2 + 115, 18, color(180));
  }
  pop();
}

// Le cercle « touché » qui pilote le son et le compteur.
function cercleActif() {
  switch (mode) {
    case 'joueur':
    case 'niveaux': return { center: joueur.pos, radius: joueur.r + 120 };
    case 'flee-souris': return { center: target.pos, radius: Number(ui.fleeRadius.value) };
    case 'scenario-2': return { center: fuyante.pos, radius: fuyante.detectionRadius };
    case 'seek-souris': return { center: target.pos, radius: target.r + SeekPopulation.ARRIVAL_RADIUS };
    default: return { center: movingTarget.pos, radius: movingTarget.r + SeekPopulation.ARRIVAL_RADIUS };
  }
}

function setup() {
  // Densité 1 : sur un écran zoomé (125 %, 150 %…), p5 doublerait sinon la résolution du
  // canvas (4 fois plus de pixels à redessiner à chaque image) et le jeu tomberait à ~15-30 FPS.
  pixelDensity(1);
  sceneCanvas = createCanvas(windowWidth, sceneHeight());
  sceneCanvas.parent('scene');
  target = new MouseTarget(width / 2, height / 2);
  movingTarget = new Target(random(width), random(height));
  fuyante = new TargetFuyante(random(width), random(height));
  joueur = new PlayerTarget(width / 2, height / 2);
  bestScore = PlayerGame.loadBest(stockage());
  bgCenter.x = width / 2;
  bgCenter.y = height / 2;

  for (const id of ['mode', 'veil', 'show-trails', 'show-vectors', 'show-hud', 'flee-naif']) {
    ui[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
  }
  ui.fleeRadius = document.getElementById('flee-radius');
  ui.detection = document.getElementById('detection-radius');
  ui.sound = document.getElementById('sound-toggle');
  ui.pause = document.getElementById('pause-toggle');
  ui.insideCount = document.getElementById('inside-count');
  ui.vehicleCount = document.getElementById('vehicle-count');
  ui.vehicleCountValue = document.getElementById('vehicle-count-value');
  ui.gameChrono = document.getElementById('game-chrono');
  ui.gameScore = document.getElementById('game-score');
  ui.gameBest = document.getElementById('game-best');
  ui.gameSize = document.getElementById('game-size');
  ui.levelStars = document.getElementById('level-stars');
  ui.levelNext = document.getElementById('level-next');
  ui.levelBest = document.getElementById('level-best');
  levelProgress = LevelRules.loadProgress(stockage());
  ui.board = document.getElementById('level-board');
  ui.boardGrid = document.getElementById('board-grid');
  ui.boardSummary = document.getElementById('board-summary');
  document.getElementById('btn-board').addEventListener('click', ouvrirTableau);
  document.getElementById('board-close').addEventListener('click', fermerTableau);
  ui.board.addEventListener('click', event => {
    if (event.target === ui.board) fermerTableau();
  });
  sheet = RubberSheet.create(width, height);

  creerVehicules(SeekPopulation.INITIAL_COUNT);
  ui.vehicleCount.value = SeekPopulation.INITIAL_COUNT;
  SeekPopulation.bindSlider(ui.vehicleCount, ui.vehicleCountValue,
    vehicles, target.pos, () => ({ width, height }), nouveauVaisseau);
  document.getElementById('game-restart').addEventListener('click', nouvellePartie);
  // Vaisseaux au départ : appliqué tout de suite avant le départ ou après un game over,
  // sinon à la prochaine partie (on ne change pas les règles en pleine partie).
  ui.gameStartCount = document.getElementById('game-start-count');
  const startCountValue = document.getElementById('game-start-count-value');
  ui.gameStartCount.addEventListener('input', () => {
    startCountValue.value = ui.gameStartCount.value;
    if (modeJeu() && game && game.phase !== 'playing') nouvellePartie();
  });

  vitesseMaxSlider = creerSliderReglage('Vitesse max :', 1, 30, 4, 1);
  forceMaxSlider = creerSliderReglage('Force max :', 0.01, 1, 0.1, 0.01);

  lierSliderPx(ui.fleeRadius, document.getElementById('flee-radius-value'));
  lierSliderPx(ui.detection, document.getElementById('detection-radius-value'));
  ui.sound.addEventListener('click', basculerSon);
  ui.pause.addEventListener('click', basculerPause);
  ui.mode.addEventListener('change', () => changerMode(ui.mode.value));
  // index.html?scenario=scenario-2 ouvre directement un scénario
  const demande = new URLSearchParams(window.location.search).get('scenario');
  changerMode(demande in SCENARIOS ? demande : ui.mode.value);

  // Les coordonnées sont relatives au canvas, pas à la barre de contrôle.
  // Un événement sur un slider ne modifie donc jamais la cible.
  sceneCanvas.elt.addEventListener('pointermove', event => {
    const rect = sceneCanvas.elt.getBoundingClientRect();
    const x = (event.clientX - rect.left) * width / rect.width;
    const y = (event.clientY - rect.top) * height / rect.height;
    if (x >= 0 && x <= width && y >= 0 && y <= height) target.pos.set(x, y);
  });
  // en mode joueur, un clic sur la scène relance la partie terminée (mode développeur)
  sceneCanvas.elt.addEventListener('pointerdown', event => {
    if (!DEV) {
      // tactile : le doigt posé place directement la boule
      const rect = sceneCanvas.elt.getBoundingClientRect();
      target.pos.set((event.clientX - rect.left) * width / rect.width, (event.clientY - rect.top) * height / rect.height);
      return;
    }
    if (modeJeu() && game && (game.phase === 'over' || game.phase === 'won')) nouvellePartie();
  });
  if (!DEV) initJeuPublie();
}

function simuler() {
  const naif = ui.fleeNaif.checked;
  const fleeRadius = Number(ui.fleeRadius.value);

  if (modeJeu()) {
    simulerJoueur(Math.min(deltaTime / 1000, 0.1));
  } else if (mode === 'scenario-1') {
    movingTarget.update();
    for (const v of vehicles) {
      if (SeekPopulation.step(v, movingTarget.pos, width, height)) capture(v, movingTarget.pos);
    }
  } else if (mode === 'scenario-2') {
    fuyante.detectionRadius = Number(ui.detection.value);
    const fuyaitDeja = fuyante.fleeing;
    fuyante.update(vehicles);
    if (!fuyaitDeja && fuyante.fleeing) alerte();
    for (const v of vehicles) {
      if (SeekPopulation.step(v, fuyante.pos, width, height)) capture(v, fuyante.pos);
    }
  } else if (mode === 'seek-souris') {
    for (const v of vehicles) {
      if (SeekPopulation.step(v, target.pos, width, height)) capture(v, target.pos);
    }
  } else if (mode === 'flee-souris') {
    for (const v of vehicles) SeekPopulation.stepFlee(v, target.pos, naif, fleeRadius);
  } else {
    movingTarget.update();
    for (const v of vehicles) {
      const avant = { x: movingTarget.pos.x, y: movingTarget.pos.y };
      if (SeekPopulation.stepChaseTarget(v, movingTarget, width, height)) {
        capture(v, avant);
        Effects.burst(particles, movingTarget.pos.x, movingTarget.pos.y, { hue: 0, count: 0 });
      }
    }
  }

  for (const v of vehicles) v.recordTrail();
  Effects.step(particles);
}

function dessinerZoneFuite(radius) {
  push();
  noFill();
  stroke(255, 255, 255, 180);
  strokeWeight(2);
  drawingContext.setLineDash([10, 8]);
  drawingContext.lineDashOffset = -frameCount * 0.5;
  circle(target.pos.x, target.pos.y, radius * 2);
  pop();
}

function cibleVisible() {
  if (modeJeu()) return joueur;
  if (mode === 'scenario-2') return fuyante;
  if (mode === 'scenario-1' || mode === 'target-reapparait') return movingTarget;
  return target;
}

function dessinerHud() {
  const lignes = [
    SCENARIOS[mode].titre,
    `Vaisseaux : ${vehicles.length}   Captures : ${captures}`,
    `Particules : ${particles.length}   FPS : ${Math.round(frameRate())}`,
  ];
  if (mode === 'scenario-2') {
    const d = fuyante.predatorDistance;
    lignes.push(
      `Cible : ${fuyante.fleeing ? 'EN FUITE !' : 'calme'}`,
      `Vitesse : ${fuyante.vel.mag().toFixed(1)}  (max ${fuyante.maxSpeed.toFixed(1)} / ${TargetFuyante.FLEE_MAX_SPEED})`,
      `Vaisseau le plus proche : ${Number.isFinite(d) ? `${Math.round(d)} px` : '—'}`,
      `Détection ${fuyante.detectionRadius} px · fin de fuite ${fuyante.escapeDistance()} px`,
    );
  } else if (mode === 'niveaux') {
    const t = game.time;
    const p = LevelRules.paramsAt(currentLevel, t, { speed: vitesseMaxSlider.value(), force: forceMaxSlider.value() });
    const reel = vehicles.reduce((a, v) => a + v.vel.mag(), 0) / Math.max(1, vehicles.length);
    const prochain = LevelRules.nextStage(currentLevel, t);
    lignes[0] = `Niveau ${currentLevel.id} — ${currentLevel.name}`;
    lignes[1] = `Vaisseaux : ${vehicles.length}   Cœurs : ${'♥'.repeat(game.lives)}${'♡'.repeat(game.maxLives - game.lives)}`;
    lignes.push(
      `Danger : ${'█'.repeat(Math.round(joueur.danger * 10)).padEnd(10, '·')}`,
      `Vitesse ${SpeedScale.describe(p.speed)} · réelle ${Math.round(reel * SpeedScale.FPS)} px/s · force ${p.force.toFixed(2)}`,
      prochain ? `${prochain.excite ? 'Excitation' : 'Accélération'} dans ${Math.ceil(prochain.remaining)} s `
        + `(→ ${prochain.speed + vitesseMaxSlider.value() - currentLevel.stages[0].speed} px/s)`
        : (LevelRules.isExcited(currentLevel, t) ? 'Vaisseaux EXCITÉS !' : 'Vitesse constante'),
      `Fin dans ${Math.ceil(LevelRules.remaining(currentLevel, t))} s · étoiles en jeu : ${game.lives}`,
    );
  } else if (mode === 'joueur') {
    lignes[1] = `Vaisseaux : ${vehicles.length}   Touches : ${game.hits}`;
    lignes.push(
      `Danger : ${'█'.repeat(Math.round(joueur.danger * 10)).padEnd(10, '·')}`,
      `Points/s : ${vehicles.length * 10}   Frôlement : +${Math.round(PlayerGame.nearMissBonus(game))}`,
      `Vitesse des vaisseaux : +${PlayerGame.speedBonus(game)} (prochain +1 dans ${
        Math.ceil(PlayerGame.nextSpeedUp(game))} s)`,
      `Frôlements réussis : ${game.nearMisses}`,
    );
  }
  push();
  textFont('monospace');
  textSize(13);
  const lh = 19;
  const w = Math.max(...lignes.map(l => textWidth(l))) + 28;
  const h = lignes.length * lh + 18;
  const x = 12;
  const y = height - h - 12;
  // le tableau devient presque transparent quand la cible passe dessous
  const cible = cibleVisible();
  const marge = 40;
  const dessous = cible.pos.x > x - marge && cible.pos.x < x + w + marge
    && cible.pos.y > y - marge && cible.pos.y < y + h + marge;
  drawingContext.globalAlpha = dessous ? 0.25 : 1;
  noStroke();
  fill(8, 10, 24, 200);
  rect(x, y, w, h, 12);
  // liseré arc-en-ciel animé
  colorMode(HSB, 360, 100, 100, 1);
  fill((simTime * 60) % 360, 80, 100);
  rect(x, y, 5, h, 12, 0, 0, 12);
  colorMode(RGB, 255);
  textAlign(LEFT, TOP);
  lignes.forEach((ligne, i) => {
    textStyle(i === 0 ? BOLD : NORMAL);
    const alerteLigne = i === 3 && ((mode === 'scenario-2' && fuyante.fleeing)
      || (modeJeu() && joueur.danger > 0.6));
    fill(alerteLigne ? color(255, 90, 90) : color(240));
    text(ligne, x + 16, y + 10 + i * lh);
  });
  pop();
}

// ---------------------------------------------------------------- jeu publié : HUD

// HUD épuré : niveau, barre de temps aux couleurs du monde, alerte d'excitation (les cœurs sont
// dessinés en haut à droite par dessinerCoeurs).
function dessinerHudJeu() {
  const world = LevelRules.worldOf(currentLevel.id);
  const t = Math.min(game.time, currentLevel.duration);
  const k = t / currentLevel.duration;
  const w = Math.min(340, width - 200);
  const x = width / 2 - w / 2;
  const y = 18;
  push();
  colorMode(HSB, 360, 100, 100, 1);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  noStroke();
  fill(0, 0, 100, 0.88);
  rect(x - 14, y - 8, w + 28, 62, 18);
  fill(230, 30, 20);
  textSize(13);
  text(`MONDE ${world.id} · NIVEAU ${currentLevel.id}${currentLevel.boss ? ' · BOSS' : ''}`, width / 2, y);
  // barre de progression du temps
  fill(230, 10, 92);
  rect(x, y + 24, w, 10, 5);
  const excite = LevelRules.isExcited(currentLevel, game.time);
  fill(excite ? 352 : world.hue, excite ? 85 : 75, excite ? 100 : 90);
  rect(x, y + 24, Math.max(10, w * k), 10, 5);
  textSize(12);
  textStyle(NORMAL);
  fill(230, 20, 35);
  const reste = Math.ceil(LevelRules.remaining(currentLevel, game.time));
  text(game.phase === 'countdown' ? 'Prêt ?' : `${reste} s`, width / 2, y + 38);
  pop();
  if (excite && game.phase === 'playing') {
    push();
    textAlign(CENTER, TOP);
    textStyle(BOLD);
    textSize(13);
    noStroke();
    fill(255, 45, 85, 180 + 75 * Math.sin(frameCount * 0.2));
    text('⚠ ILS SONT EXCITÉS', width / 2, y + 62);
    pop();
  }
}

// ---------------------------------------------------------------- jeu publié : démo du titre

// Derrière les menus : des vaisseaux poursuivent une boule qui dessine une courbe de Lissajous.
function demoMenu(dt) {
  demoT += dt;
  if (vehicles.length !== 9) {
    vehicles.length = 0;
    for (let i = 0; i < 9; i++) vehicles.push(new Vaisseau(random(width), random(height)));
  }
  const cx = width / 2 + Math.sin(demoT * 0.55) * width * 0.32;
  const cy = height / 2 + Math.sin(demoT * 0.9 + 1) * height * 0.28;
  joueur.pos.set(cx, cy);
  joueur.r = PlayerTarget.BASE_RADIUS;
  joueur.invulnerable = false;
  joueur.danger = 0;
  joueur.animate();
  target.pos.set(cx, cy);
  for (const v of vehicles) {
    v.maxForce = 0.1;
    v.excitement = 0;
    v.chase(joueur.pos, 6);
    v.update();
    v.edges();
    v.recordTrail();
  }
  Effects.step(particles);
  for (const v of vehicles) v.show({ trail: true, darkOutline: true });
  joueur.show();
  for (const pt of particles) pt.show();
}

// ---------------------------------------------------------------- jeu publié : parcours

function sauverReglages() {
  Menu.saveSettings(stockage(), settings);
}

// Le son ne peut démarrer qu'après un geste de l'utilisateur (clic sur un bouton).
function activerSonSiVoulu() {
  if (!settings.sound) return;
  if (!zoneSound) zoneSound = ZoneSound.create();
  zoneSound.resume();
}

function lancerNiveau(id) {
  activerSonSiVoulu();
  appState = 'game';
  Menu.hide();
  paused = false;
  document.body.classList.add('in-game');
  ui.hudPause.hidden = false;
  currentLevel = LevelRules.get(id);
  if (mode !== 'niveaux') changerMode('niveaux');
  else demarrerNiveau(id);
}

function allerAuMenu() {
  appState = 'menu';
  paused = false;
  game = null;
  particles.length = 0;
  barrieres = [];
  document.body.classList.remove('in-game');
  ui.hudPause.hidden = true;
  Menu.update({ progress: levelProgress });
  Menu.showTitle();
}

function mettreEnPause() {
  if (appState !== 'game' || !game || game.phase === 'over' || game.phase === 'won' || paused) return;
  paused = true;
  document.body.classList.remove('in-game');
  Menu.show('pause');
}

function reprendre() {
  paused = false;
  Menu.hide();
  document.body.classList.add('in-game');
}

function initJeuPublie() {
  document.body.classList.add('prod');
  settings = Menu.loadSettings(stockage());
  ui.hudPause = document.getElementById('btn-hud-pause');
  Menu.init({
    play: () => lancerNiveau(LevelRules.continueLevel(levelProgress, { unlockAll: DEV })),
    startLevel: id => lancerNiveau(id),
    back: () => (appState === 'game' ? Menu.show(game && (game.phase === 'over' || game.phase === 'won') ? 'end' : 'pause') : Menu.showTitle()),
    getSettings: () => settings,
    setSetting: (key, value) => {
      settings[key] = value;
      sauverReglages();
      if (key === 'sound') {
        if (value) activerSonSiVoulu();
        else if (zoneSound) zoneSound.suspend();
      }
    },
    resume: reprendre,
    pause: mettreEnPause,
    restart: () => lancerNiveau(currentLevel.id),
    next: () => {
      const n = LevelRules.nextLevel(currentLevel.id, levelProgress, { unlockAll: DEV });
      if (n) lancerNiveau(n);
    },
    levelsFromGame: () => {
      allerAuMenu();
      Menu.openLevels(currentLevel.id);
    },
    toMenu: allerAuMenu,
  }, { progress: levelProgress, unlockAll: false });
  // la fenêtre perd le focus en pleine partie : pause automatique
  window.addEventListener('blur', mettreEnPause);
  // l'en-tête de développement est masqué : la scène occupe toute la fenêtre
  windowResized();
  allerAuMenu();
}

function dessinerPause() {
  push();
  fill(0, 0, 0, 120);
  noStroke();
  rect(0, 0, width, height);
  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(48);
  text('PAUSE', width / 2, height / 2);
  textSize(14);
  textStyle(NORMAL);
  text('Espace pour reprendre', width / 2, height / 2 + 40);
  pop();
}

function dessiner() {
  if (mode === 'flee-souris') dessinerZoneFuite(Number(ui.fleeRadius.value));
  if (mode === 'scenario-2') fuyante.show();

  // tremblement de l'écran après une touche (mode joueur)
  push();
  if (shake > 0.3 && settings.shake) translate(random(-shake, shake), random(-shake, shake));
  const niveau = mode === 'niveaux';
  if (niveau && barrieres.length) {
    placerBarrieres();
    for (const b of barrieres) {
      b.show(simTime, {
        campRadius: currentLevel.camp.radius,
        ballNear: game && b.distanceTo(joueur.pos) < currentLevel.camp.radius,
      });
    }
  }
  const options = {
    trail: niveau ? LevelRules.trailsVisible(currentLevel, game ? game.time : 0) : ui.showTrails.checked,
    vectors: niveau ? currentLevel.showVectors : ui.showVectors.checked,
    darkOutline: niveau && currentLevel.background === 'white',
  };
  for (const v of vehicles) v.show(options);
  if (mode !== 'scenario-2') cibleVisible().show();
  for (const p of particles) p.show();
  pop();

  if (flash > 0.02) {
    push();
    noStroke();
    fill(255, 0, 60, 110 * flash);
    rect(0, 0, width, height);
    pop();
  }
  if (!paused) {
    shake *= 0.85;
    flash *= 0.88;
  }

  if (DEV && ui.showHud.checked) dessinerHud();
  if (!DEV && mode === 'niveaux' && game) dessinerHudJeu();
  if (mode === 'joueur') dessinerOverlayJeu();
  if (mode === 'niveaux') dessinerOverlayNiveau();
  // textes HTML de la barre du haut : 15 fois par seconde suffisent (moins de recalculs de mise en page)
  if (frameCount % 4 === 0) {
    if (mode === 'niveaux') majInterfaceNiveau();
    if (modeJeu()) majInterfaceJeu();
  }
  if (paused && DEV) dessinerPause();
}

function draw() {
  if (!paused) simTime += Math.min(deltaTime / 1000, 0.1);
  if (appState === 'menu') {
    fondElastique(Math.min(deltaTime / 1000, 0.05));
    demoMenu(Math.min(deltaTime / 1000, 0.05));
    return;
  }
  RainbowBackground.follow(bgCenter, target.pos);
  if (mode === 'niveaux' && currentLevel.background === 'white') fondElastique(Math.min(deltaTime / 1000, 0.05));
  else RainbowBackground.draw(drawingContext, width, height, simTime, bgCenter.x, bgCenter.y, Number(ui.veil.value));
  SeekPopulation.applySettings(vehicles, vitesseMaxSlider.value(), forceMaxSlider.value());
  if (!paused) simuler();
  dessiner();

  const { center, radius } = cercleActif();
  const dedans = SeekPopulation.countInside(vehicles, center, radius);
  ui.insideCount.value = `Dans le cercle : ${dedans}`;
  if (zoneSound) zoneSound.update(paused ? 0 : dedans, vehicles.length);
}

// Raccourcis : 1-7 modes (1 = niveaux), Espace pause, R rejouer, T traînées, V vecteurs,
// H tableau de bord, S son.
function keyPressed() {
  if (!DEV) return clavierJeuPublie();
  if (tableauOuvert()) {
    if (keyCode === ESCAPE || key === 'n' || key === 'N') fermerTableau();
    return;
  }
  if (document.activeElement && document.activeElement.tagName === 'SELECT') return;
  if (key === 'n' || key === 'N') {
    ouvrirTableau();
    return false;
  }
  const modes = Object.keys(SCENARIOS);
  const index = Number(key) - 1;
  if (Number.isInteger(index) && index >= 0 && index < modes.length) changerMode(modes[index]);
  else if (key === ' ') basculerPause();
  else if ((key === 'r' || key === 'R') && modeJeu()) nouvellePartie();
  else if (keyCode === ENTER && mode === 'niveaux' && game && (game.phase === 'over' || game.phase === 'won')
    && LevelRules.nextLevel(currentLevel.id, levelProgress, { unlockAll: DEV })) {
    choisirNiveau(LevelRules.nextLevel(currentLevel.id, levelProgress, { unlockAll: DEV }));
  }
  else if (key === 't' || key === 'T') ui.showTrails.checked = !ui.showTrails.checked;
  else if (key === 'v' || key === 'V') ui.showVectors.checked = !ui.showVectors.checked;
  else if (key === 'h' || key === 'H') ui.showHud.checked = !ui.showHud.checked;
  else if (key === 's' || key === 'S') basculerSon();
  else return;
  return false;
}

// Clavier du jeu publié : Échap/P pause, R rejouer, Entrée niveau suivant, N niveaux.
function clavierJeuPublie() {
  const ecran = Menu.screen();
  if (keyCode === ESCAPE || key === 'p' || key === 'P') {
    if (ecran === 'pause') reprendre();
    else if (appState === 'game' && !ecran) mettreEnPause();
    else if (ecran === 'levels' || ecran === 'howto' || ecran === 'settings') {
      if (appState === 'game') Menu.show(game && (game.phase === 'over' || game.phase === 'won') ? 'end' : 'pause');
      else Menu.showTitle();
    }
    return false;
  }
  if (appState !== 'game') return;
  if (key === 'r' || key === 'R') {
    lancerNiveau(currentLevel.id);
    return false;
  }
  if (keyCode === ENTER && game && game.phase === 'won') {
    const n = LevelRules.nextLevel(currentLevel.id, levelProgress, { unlockAll: DEV });
    if (n) lancerNiveau(n);
    return false;
  }
  if (key === 'n' || key === 'N') {
    allerAuMenu();
    Menu.openLevels(currentLevel.id);
    return false;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, sceneHeight());
  placerBarrieres();
  sheet = RubberSheet.create(width, height);
  target.pos.set(constrain(target.pos.x, 0, width), constrain(target.pos.y, 0, height));
  movingTarget.edges();
  fuyante.edges();
  for (const vehicle of vehicles) vehicle.edges();
}
