// Fond « membrane élastique » (décor, pas une entité) : une grille de points dont la
// profondeur z se creuse là où passe le curseur, puis revient à plat comme un ressort amorti
// (léger rebond, retour au repos en ~1 s). Le dessin simule le relief : les points enfoncés
// glissent vers le centre de la scène (perspective) et l'ombrage dépend de la pente,
// éclairée depuis le haut à gauche.
const RubberSheet = (() => {
  const SPACING = 24;        // pas de la grille, en pixels
  const OMEGA = 2 * Math.PI / 0.75; // pulsation du ressort : rebond rapide
  const DAMPING = 0.55;      // amortissement (< 1 : léger rebond avant le repos)
  const RADIUS = 130;        // rayon d'influence du curseur
  const MAX_DEPTH = 60;      // profondeur maximale d'enfoncement
  const PERSPECTIVE = 0.0018;

  function create(w, h, spacing = SPACING) {
    const cols = Math.ceil(w / spacing) + 1;
    const rows = Math.ceil(h / spacing) + 1;
    return { w, h, spacing, cols, rows, z: new Float32Array(cols * rows), v: new Float32Array(cols * rows) };
  }

  // Enfonce la membrane autour de (x, y). strength : vitesse d'enfoncement (px/s).
  function poke(sheet, x, y, strength, radius = RADIUS) {
    const { spacing, cols, rows, v } = sheet;
    const c0 = Math.max(0, Math.floor((x - radius) / spacing));
    const c1 = Math.min(cols - 1, Math.ceil((x + radius) / spacing));
    const r0 = Math.max(0, Math.floor((y - radius) / spacing));
    const r1 = Math.min(rows - 1, Math.ceil((y + radius) / spacing));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const d = Math.hypot(c * spacing - x, r * spacing - y);
        if (d >= radius) continue;
        const falloff = 0.5 + 0.5 * Math.cos((Math.PI * d) / radius); // 1 au centre, 0 au bord
        v[r * cols + c] -= strength * falloff;
      }
    }
  }

  // Ressort amorti vers z = 0 (intégration semi-implicite, stable pour dt ≤ 0,05 s).
  function step(sheet, dt) {
    const { z, v } = sheet;
    for (let i = 0; i < z.length; i++) {
      v[i] += (-OMEGA * OMEGA * z[i] - 2 * DAMPING * OMEGA * v[i]) * dt;
      z[i] += v[i] * dt;
      if (z[i] < -MAX_DEPTH) {
        z[i] = -MAX_DEPTH;
        if (v[i] < 0) v[i] = 0;
      }
    }
  }

  function maxDepth(sheet) {
    let m = 0;
    for (const value of sheet.z) m = Math.max(m, Math.abs(value));
    return m;
  }

  // Position à l'écran d'un nœud : un nœud enfoncé « recule » vers le centre de la scène.
  function project(sheet, c, r) {
    const z = sheet.z[r * sheet.cols + c];
    const x = c * sheet.spacing;
    const y = r * sheet.spacing;
    const k = -z * PERSPECTIVE;
    return { x: x + (sheet.w / 2 - x) * k, y: y + (sheet.h / 2 - y) * k, z };
  }

  // Ombre d'un nœud : éclairé s'il fait face à la lumière (haut-gauche), plus sombre au fond.
  function shadeAt(sheet, c, r) {
    const { cols, rows, z } = sheet;
    const at = (cc, rr) => z[Math.min(rows - 1, Math.max(0, rr)) * cols + Math.min(cols - 1, Math.max(0, cc))];
    const slope = (at(c + 1, r) - at(c - 1, r)) + (at(c, r + 1) - at(c, r - 1));
    const light = Math.max(-1, Math.min(1, slope / 16));
    return Math.max(110, Math.min(255, 255 + light * 75 + at(c, r) * 1.5));
  }

  function draw(ctx, sheet) {
    const { cols, rows, w, h } = sheet;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (maxDepth(sheet) < 0.2) {
      drawGrid(ctx, sheet);
      ctx.restore();
      return;
    }
    // ombrage : une image d'un pixel par nœud, agrandie avec lissage (dégradé continu)
    if (!sheet.shadeCanvas) {
      sheet.shadeCanvas = document.createElement('canvas');
      sheet.shadeCanvas.width = cols;
      sheet.shadeCanvas.height = rows;
      sheet.shadeImage = sheet.shadeCanvas.getContext('2d').createImageData(cols, rows);
    }
    const data = sheet.shadeImage.data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = shadeAt(sheet, c, r);
        const k = (r * cols + c) * 4;
        data[k] = v;
        data[k + 1] = v;
        data[k + 2] = Math.min(255, v + 8);
        data[k + 3] = 255;
      }
    }
    sheet.shadeCanvas.getContext('2d').putImageData(sheet.shadeImage, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low'; // lissage bilinéaire : suffisant pour un dégradé, et plus rapide
    const span = (cols - 1) * sheet.spacing;
    const spanY = (rows - 1) * sheet.spacing;
    // chaque pixel est centré sur son nœud
    ctx.drawImage(sheet.shadeCanvas, -sheet.spacing / 2, -sheet.spacing / 2, span + sheet.spacing, spanY + sheet.spacing);
    drawGrid(ctx, sheet);
    ctx.restore();
  }

  // Fils de la grille, déplacés par la perspective là où la membrane est enfoncée.
  function drawGrid(ctx, sheet) {
    const { cols, rows } = sheet;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(110,120,145,0.16)';
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = project(sheet, c, r);
        if (c === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const p = project(sheet, c, r);
        if (r === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }

  return { SPACING, RADIUS, MAX_DEPTH, create, poke, step, maxDepth, project, shadeAt, draw };
})();
