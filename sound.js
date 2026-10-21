// Son de la zone en synthèse par modulation de fréquence (FM).
//
//   modulateur (fm = fc × harmonicité) --[profondeur = indice × fm]--> fréquence du porteur (fc)
//   porteur --> volume --> haut-parleurs
//
// Plus il y a de véhicules qui touchent le cercle :
//   - plus le son est fort, et plus il est aigu : chaque véhicule monte la note d'un demi-ton ;
//   - plus l'indice de modulation est grand : le spectre s'enrichit (son de plus en plus « métallique ») ;
//   - plus l'harmonicité s'éloigne d'un entier : le son devient inharmonique, comme une cloche.
const ZoneSound = (() => {
  const BASE = 110;       // fréquence du porteur pour 1 véhicule (la grave, A2)
  const MAX_STEPS = 48;   // au-delà de 49 véhicules la note ne monte plus (4 octaves)
  const SMOOTHING = 0.08; // constante de temps des transitions, en secondes

  // La note dépend directement du NOMBRE de véhicules dans le cercle :
  // chaque véhicule supplémentaire monte la fréquence d'un demi-ton (× 2^(1/12)).
  function carrierFrequency(count) {
    const steps = Math.min(MAX_STEPS, Math.max(0, Math.floor(count) - 1));
    return BASE * 2 ** (steps / 12);
  }

  // Paramètres sonores purs, testables sans Web Audio.
  function levels(count, total) {
    if (!(count > 0) || !(total > 0)) {
      return { gain: 0, carrier: BASE, harmonicity: 1, index: 0 };
    }
    const ratio = Math.min(1, count / total);
    return {
      gain: 0.08 + 0.17 * Math.sqrt(ratio),
      carrier: carrierFrequency(count),
      harmonicity: 1 + 2.5 * ratio,
      index: 0.5 + 9.5 * ratio,
    };
  }

  // Fréquence du modulateur et profondeur de modulation (en Hz) pour des niveaux donnés.
  function modulation(l) {
    const frequency = l.carrier * l.harmonicity;
    return { frequency, depth: l.index * frequency };
  }

  // Graphe Web Audio, créé seulement après un clic (règle d'autoplay des navigateurs).
  function create() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = BASE;

    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = BASE;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    // la sortie du modulateur s'ajoute à la fréquence du porteur : c'est la FM
    modulator.connect(depth).connect(carrier.frequency);

    const master = ctx.createGain();
    master.gain.value = 0;
    carrier.connect(master).connect(ctx.destination);
    carrier.start();
    modulator.start();

    return {
      update(count, total) {
        const l = levels(count, total);
        const m = modulation(l);
        const now = ctx.currentTime;
        master.gain.setTargetAtTime(l.gain, now, SMOOTHING);
        carrier.frequency.setTargetAtTime(l.carrier, now, SMOOTHING);
        modulator.frequency.setTargetAtTime(m.frequency, now, SMOOTHING);
        depth.gain.setTargetAtTime(m.depth, now, SMOOTHING);
      },
      // Note brève en FM (capture, alerte) : l'indice de modulation décroît, le son « s'éteint ».
      ping(frequency = 880, duration = 0.5) {
        if (ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modDepth = ctx.createGain();
        const env = ctx.createGain();
        osc.frequency.value = frequency;
        mod.frequency.value = frequency * 1.5;
        modDepth.gain.setValueAtTime(frequency * 4, now);
        modDepth.gain.exponentialRampToValueAtTime(1, now + duration);
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        mod.connect(modDepth).connect(osc.frequency);
        osc.connect(env).connect(ctx.destination);
        osc.start(now);
        mod.start(now);
        osc.stop(now + duration + 0.05);
        mod.stop(now + duration + 0.05);
      },
      resume: () => ctx.resume(),
      suspend: () => ctx.suspend(),
      isRunning: () => ctx.state === 'running',
    };
  }

  return { BASE, MAX_STEPS, carrierFrequency, levels, modulation, create };
})();
