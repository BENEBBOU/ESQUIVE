// Interface du jeu publié (écrans HTML par-dessus la scène) : titre, choix des niveaux par
// monde, comment jouer, réglages, pause et fin de partie. Aucune règle de jeu ici : le sketch
// fournit les données et reçoit les actions (handlers).
const Menu = (() => {
  const SCREENS = ['title', 'levels', 'howto', 'settings', 'pause', 'end'];
  const SETTINGS_KEY = 'esquive-reglages';
  const DEFAULT_SETTINGS = { sound: true, shake: true, rubber: true };
  let handlers = {};
  let current = null;
  let world = 1;
  let data = { progress: {}, unlockAll: false };

  const $ = id => document.getElementById(id);

  function loadSettings(storage) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(storage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(storage, settings) {
    try {
      storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // stockage indisponible : réglages gardés pour la session
    }
  }

  function starsHtml(count, total = 3) {
    return Array.from({ length: total }, (_, i) =>
      `<span class="star ${i < count ? 'on' : ''} ${LevelRules.MEDALS[i]}">★</span>`).join('');
  }

  function show(name) {
    current = name;
    $('menu-root').hidden = false;
    // pause et fin : la partie reste visible derrière, assombrie
    $('menu-root').classList.toggle('dim', name === 'pause' || name === 'end');
    for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
    document.body.classList.toggle('menu-open', true);
    const first = $(`screen-${name}`).querySelector('button:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }

  function hide() {
    current = null;
    $('menu-root').hidden = true;
    document.body.classList.toggle('menu-open', false);
  }

  function isOpen() {
    return current !== null;
  }

  function screen() {
    return current;
  }

  // ---------------------------------------------------------------- écran titre
  function renderTitle() {
    const total = LevelRules.totalStars(data.progress);
    $('title-stars').textContent = `★ ${total} / ${LevelRules.TOTAL_LEVELS * 3}`;
    const next = LevelRules.continueLevel(data.progress, { unlockAll: data.unlockAll });
    $('btn-play').querySelector('small').textContent = `Niveau ${next} — ${LevelRules.get(next).name}`;
  }

  // ---------------------------------------------------------------- niveaux
  function renderWorldTabs() {
    $('world-tabs').replaceChildren(...LevelRules.WORLDS.map(wd => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `world-tab${wd.id === world ? ' active' : ''}`;
      b.style.setProperty('--hue', wd.hue);
      const stars = LevelRules.worldStars(data.progress, wd.id);
      b.innerHTML = `<span class="w-num">${wd.id}</span><span class="w-name">${wd.name}</span>`
        + `<span class="w-stars">★ ${stars}/30</span>`;
      b.setAttribute('aria-pressed', String(wd.id === world));
      b.addEventListener('click', () => {
        world = wd.id;
        renderLevels();
      });
      return b;
    }));
  }

  function renderLevels() {
    renderWorldTabs();
    const wd = LevelRules.WORLDS[world - 1];
    $('world-title').textContent = `Monde ${wd.id} — ${wd.name}`;
    $('screen-levels').style.setProperty('--hue', wd.hue);
    const cells = LevelRules.board(data.progress, { unlockAll: data.unlockAll })
      .filter(c => c.world === world);
    $('level-grid').replaceChildren(...cells.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `level-cell ${c.status}${c.boss ? ' boss' : ''}${c.stars === 3 ? ' perfect' : ''}`;
      const level = LevelRules.get(c.id);
      const tags = [];
      if (level.barriers.length) tags.push(`${level.barriers.length} barre${level.barriers.length > 1 ? 's' : ''}`);
      if (level.stages.some(s => s.excite)) tags.push('excitation');
      b.innerHTML = `${c.boss ? '<span class="badge">BOSS</span>' : ''}<span class="num">${c.id}</span>`
        + `<span class="stars">${c.status === 'locked' ? '🔒' : starsHtml(c.stars)}</span>`
        + `<span class="meta">${level.vehicles} vaisseaux${tags.length ? ' · ' + tags.join(' · ') : ''}</span>`;
      b.title = `${level.name}`;
      if (c.status === 'open') b.addEventListener('click', () => handlers.startLevel(c.id));
      else b.disabled = true;
      return b;
    }));
  }

  function openLevels(focusLevel) {
    if (focusLevel) world = LevelRules.worldOf(focusLevel).id;
    renderLevels();
    show('levels');
  }

  // ---------------------------------------------------------------- fin de partie
  // result : { level, stars, won, time, lives, nearMisses, score, best, newBest, next }
  function showEnd(result) {
    const panel = $('screen-end');
    panel.classList.toggle('won', result.won);
    panel.classList.toggle('lost', !result.won);
    $('end-kicker').textContent = `Niveau ${result.level.id} — ${result.level.name}`;
    $('end-title').textContent = result.won ? (result.stars === 3 ? 'Parfait !' : 'Niveau validé') : 'Perdu…';
    const stars = $('end-stars');
    stars.innerHTML = starsHtml(result.stars);
    stars.querySelectorAll('.star').forEach((s, i) => s.style.setProperty('--delay', `${0.25 + i * 0.35}s`));
    $('end-detail').textContent = result.won
      ? `${result.lives} cœur${result.lives > 1 ? 's' : ''} restant${result.lives > 1 ? 's' : ''} · `
        + `${result.nearMisses} frôlement${result.nearMisses > 1 ? 's' : ''}`
      : `Tenu ${Math.floor(result.time)} s sur ${result.level.duration} · réessayez !`;
    $('end-best').textContent = result.newBest ? 'Nouveau record pour ce niveau !' : `Meilleur : ${'★'.repeat(result.best)}${'☆'.repeat(3 - result.best)}`;
    $('end-best').classList.toggle('highlight', result.newBest);
    const next = $('btn-end-next');
    next.hidden = !result.next;
    next.textContent = result.next ? `Niveau ${result.next} ▶` : '';
    show('end');
    const primary = result.won && result.next ? next : $('btn-end-retry');
    primary.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- réglages
  function renderSettings(settings) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const input = $(`set-${key}`);
      input.checked = Boolean(settings[key]);
    }
  }

  function init(h, initialData) {
    handlers = h;
    data = { ...data, ...initialData };
    $('btn-play').addEventListener('click', () => handlers.play());
    $('btn-levels').addEventListener('click', () => openLevels());
    $('btn-howto').addEventListener('click', () => show('howto'));
    $('btn-settings').addEventListener('click', () => {
      renderSettings(handlers.getSettings());
      show('settings');
    });
    for (const el of document.querySelectorAll('[data-back]')) {
      el.addEventListener('click', () => handlers.back(el.dataset.back));
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      $(`set-${key}`).addEventListener('change', e => handlers.setSetting(key, e.target.checked));
    }
    $('btn-resume').addEventListener('click', () => handlers.resume());
    $('btn-pause-restart').addEventListener('click', () => handlers.restart());
    $('btn-pause-levels').addEventListener('click', () => handlers.levelsFromGame());
    $('btn-pause-menu').addEventListener('click', () => handlers.toMenu());
    $('btn-end-retry').addEventListener('click', () => handlers.restart());
    $('btn-end-next').addEventListener('click', () => handlers.next());
    $('btn-end-levels').addEventListener('click', () => handlers.levelsFromGame());
    $('btn-hud-pause').addEventListener('click', () => handlers.pause());
  }

  function update(newData) {
    data = { ...data, ...newData };
    if (current === 'title') renderTitle();
    if (current === 'levels') renderLevels();
  }

  function showTitle() {
    renderTitle();
    show('title');
  }

  return { SCREENS, DEFAULT_SETTINGS, loadSettings, saveSettings, init, update, show, hide, isOpen, screen,
    showTitle, openLevels, showEnd, starsHtml };
})();
