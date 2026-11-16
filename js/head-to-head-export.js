(() => {
  const W = 1080;
  const C = {
    bg: '#050B1F', text: '#F2F5FA', muted: '#AEB6C7', blue: '#9FD6FF',
    gold: '#F5C542', line: 'rgba(255,255,255,.15)', panel: 'rgba(255,255,255,.085)'
  };
  const FONT = '"Space Grotesk", sans-serif';
  const MONO = '"JetBrains Mono", monospace';
  let textShadows = true;

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h, r = 22) {
    roundRect(ctx, x, y, w, h, r);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(220,235,255,.18)');
    grad.addColorStop(.48, 'rgba(255,255,255,.075)');
    grad.addColorStop(1, 'rgba(124,165,229,.15)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    const sheen = ctx.createLinearGradient(x, y, x, y + 32);
    sheen.addColorStop(0, 'rgba(255,255,255,.16)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, 34);
    ctx.restore();
  }

  function loadImage(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function gameSlug(value) {
    return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function charSlug(value) {
    const aliases = {
      'Mr. Game & Watch': 'mr-game-watch',
      'Pokémon Trainer': 'pokemon-trainer',
      'Pokemon Trainer': 'pokemon-trainer',
      'Pyra & Mythra': 'pyra-mythra',
      'R.O.B.': 'rob'
    };
    return aliases[value] || gameSlug(value);
  }

  function mainCharacter(profile, gameId) {
    const game = (profile?.games || []).find(item => String(item.id || item.slug) === String(gameId));
    const character = [...(game?.characters || [])]
      .filter(item => String(item.name || '').trim().toLowerCase() !== 'other')
      .sort((a, b) => Number(b.usage) - Number(a.usage))[0]?.name;
    return character || '';
  }

  function mainCharacterIcon(profile, gameId) {
    const game = (profile?.games || []).find(item => String(item.id || item.slug) === String(gameId));
    return game?.mostPlayedCharacterIcon || '';
  }

  function portraitPath(profile, gameId) {
    const character = mainCharacter(profile, gameId);
    return imagePath('portraits', gameId, character) || mainCharacterIcon(profile, gameId);
  }

  function imagePath(kind, gameId, character) {
    if (!character || !gameId || gameId === 'all') return '';
    return `assets/renders/${encodeURIComponent(gameId)}/${kind}/${encodeURIComponent(charSlug(character))}.webp`;
  }

  function fitFont(ctx, value, maxWidth, size, weight = 400, family = FONT, minSize = 12) {
    let px = size;
    const label = String(value ?? '');
    while (px > minSize) {
      ctx.font = `${weight} ${px}px ${family}`;
      if (ctx.measureText(label).width <= maxWidth) break;
      px -= 1;
    }
    return { label, px };
  }

  function drawText(ctx, value, x, y, size, color = C.text, weight = 400, align = 'left', family = FONT, maxWidth = Infinity, minSize = 10) {
    const { label, px } = fitFont(ctx, value, maxWidth, size, weight, family, minSize);
    ctx.save();
    ctx.font = `${weight} ${px}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = textShadows ? 'rgba(0,0,0,.48)' : 'transparent';
    ctx.shadowBlur = textShadows ? 5 : 0;
    ctx.shadowOffsetY = textShadows ? 2 : 0;
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawBackground(ctx, h) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, h);
    const glows = [
      [W * .13, h * .03, W * .62, h * .5, 'rgba(0,56,168,.62)'],
      [W * .94, h * .18, W * .46, h * .42, 'rgba(245,197,66,.16)'],
      [W * .87, h * .92, W * .48, h * .35, 'rgba(65,115,190,.25)']
    ];
    for (const [x, y, rx, ry, color] of glows) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPortrait(ctx, img, x, y, w, h, side) {
    if (!img) return;
    const temp = document.createElement('canvas');
    temp.width = Math.ceil(w);
    temp.height = Math.ceil(h);
    const t = temp.getContext('2d');
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    t.save();
    if (side === 1) {
      t.translate(w, 0);
      t.scale(-1, 1);
    }
    t.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    t.restore();
    t.globalCompositeOperation = 'destination-in';
    const horizontal = t.createLinearGradient(0, 0, w, 0);
    if (side === 1) {
      horizontal.addColorStop(0, 'rgba(0,0,0,1)');
      horizontal.addColorStop(.78, 'rgba(0,0,0,1)');
      horizontal.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      horizontal.addColorStop(0, 'rgba(0,0,0,0)');
      horizontal.addColorStop(.22, 'rgba(0,0,0,1)');
      horizontal.addColorStop(1, 'rgba(0,0,0,1)');
    }
    t.fillStyle = horizontal;
    t.fillRect(0, 0, w, h);
    const vertical = t.createLinearGradient(0, 0, 0, h);
    vertical.addColorStop(0, 'rgba(0,0,0,1)');
    vertical.addColorStop(.62, 'rgba(0,0,0,1)');
    vertical.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = vertical;
    t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = .24;
    ctx.drawImage(temp, x, y);
    ctx.restore();
  }

  function drawBar(ctx, x, y, w, h, pct) {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = C.blue;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
    ctx.restore();
  }

  function cleanDate(date, es) {
    if (!date) return '—';
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleDateString(es ? 'es-UY' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function latestMeeting(sets, state, es) {
    const sorted = [...sets].sort((a, b) => (Number(a.startedAt) || Date.parse(a.date || '') || 0) - (Number(b.startedAt) || Date.parse(b.date || '') || 0));
    const set = sorted.at(-1);
    if (!set) return '';
    const score = String(set.score || '—').match(/^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/);
    const winner = set.outcome === 'win' ? state.p1.player.tag : state.p2.player.tag;
    const wins = score ? (set.outcome === 'win' ? score[1] : score[2]) : '';
    const losses = score ? (set.outcome === 'win' ? score[2] : score[1]) : '';
    const game = gameName(state, set.gameId || state.primaryGameId);
    const round = set.round ? ` · ${set.round}` : '';
    return `${cleanDate(set.date, es)}${game ? ` · ${game}` : ''} · ${winner}${wins ? ` ${wins}–${losses}` : ''}${round}`;
  }

  function gameGroups(state) {
    const groups = new Map();
    for (const set of state.sets) {
      const id = String(set.gameId || state.primaryGameId || '');
      const item = groups.get(id) || { id, name: '', p1: 0, p2: 0, sets: 0 };
      item.sets++;
      if (set.outcome === 'win') item.p1++;
      else if (set.outcome === 'loss') item.p2++;
      groups.set(id, item);
    }
    for (const item of groups.values()) {
      const game = (state.p1.games || []).find(x => String(x.id || x.slug) === item.id)
        || (state.p2.games || []).find(x => String(x.id || x.slug) === item.id);
      item.name = game?.name || item.id;
    }
    return [...groups.values()];
  }

  function gameName(state, gameId) {
    const game = [...(state.p1.games || []), ...(state.p2.games || [])]
      .find(item => String(item.id || item.slug) === String(gameId));
    return game?.name || gameId || state.gameLabel;
  }

  function winningCharacter(set, side, state) {
    const counts = new Map();
    for (const game of (Array.isArray(set.games) ? set.games : [])) {
      const character = side === 0 ? game.character : game.opponentCharacter;
      if (character) counts.set(character, (counts.get(character) || 0) + 1);
    }
    const selected = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (selected) return selected;
    const profile = side === 0 ? state.p1 : state.p2;
    return mainCharacter(profile, set.gameId || state.primaryGameId) || '';
  }

  async function render(state) {
    textShadows = true;
    const es = state.lang === 'es';
    const pad = 48;
    const heroY = 226, heroH = 320;
    const gameRows = gameGroups(state);
    const gameY = heroY + heroH + 20;
    const gameH = 62 + gameRows.length * 54 + 18;
    const statsH = 300;
    const analysisY = gameY + gameH + 18;
    const seriesY = analysisY + statsH + 18;
    const series = [...state.sets].sort((a, b) => (Number(a.startedAt) || Date.parse(a.date || '') || 0) - (Number(b.startedAt) || Date.parse(b.date || '') || 0));
    const columns = Math.min(16, Math.max(1, series.length));
    const tile = 46, tileGap = 8;
    const seriesRows = Math.ceil(series.length / columns);
    const seriesH = 60 + seriesRows * (tile + tileGap) + 36;
    const footerY = seriesY + seriesH + 44;
    const H = Math.max(1350, footerY + 48);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(es ? 'No se pudo crear la imagen.' : 'Could not create the image.');

    const p1Portrait = portraitPath(state.p1, state.primaryGameId);
    const p2Portrait = portraitPath(state.p2, state.primaryGameId);
    const seriesAssets = series.map(set => {
      const side = set.outcome === 'win' ? 0 : 1;
      const character = winningCharacter(set, side, state);
      const gameId = set.gameId || state.primaryGameId;
      return imagePath('stocks', gameId, character) || mainCharacterIcon(side === 0 ? state.p1 : state.p2, gameId);
    });
    const pairAssets = state.pairs.flatMap(row => [imagePath('stocks', row.gameId || state.primaryGameId, row.p1), imagePath('stocks', row.gameId || state.primaryGameId, row.p2)]);
    const assetPaths = [...new Set(['assets/logo.jpg', p1Portrait, p2Portrait, ...seriesAssets, ...pairAssets].filter(Boolean))];
    const imageEntries = await Promise.all(assetPaths.map(async path => [path, await loadImage(new URL(path, location.href).href)]));
    const images = new Map(imageEntries);
    if (document.fonts?.ready) await document.fonts.ready;

    drawBackground(ctx, H);
    const artW = W * .57, artH = 680, artY = 114;
    drawPortrait(ctx, images.get(p1Portrait), -85, artY, artW, artH, 1);
    drawPortrait(ctx, images.get(p2Portrait), W - artW + 80, artY, artW, artH, 2);
    const logo = images.get('assets/logo.jpg');
    if (logo) {
      ctx.save();
      roundRect(ctx, pad, 38, 44, 44, 13);
      ctx.clip();
      ctx.drawImage(logo, pad, 38, 44, 44);
      ctx.restore();
    }
    drawText(ctx, 'Platfighters', pad + 58, 60, 22, C.text, 700);
    ctx.font = `700 22px ${FONT}`;
    const brandW = ctx.measureText('Platfighters').width;
    drawText(ctx, '.uy', pad + 58 + brandW, 60, 22, C.blue, 700);
    drawText(ctx, 'HEAD-TO-HEAD', W - pad, 60, 12, C.muted, 500, 'right', MONO);
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath(); ctx.moveTo(pad, 101); ctx.lineTo(W - pad, 101); ctx.stroke();

    drawText(ctx, `${state.gameLabel} · ${state.periodLabel} · ${state.phaseLabel}`, W / 2, 132, 12, C.blue, 500, 'center', MONO, W - 2 * pad, 9);
    const name1 = state.p1.player.tag || 'Player 1';
    const name2 = state.p2.player.tag || 'Player 2';
    ctx.font = `700 40px ${FONT}`;
    const title1 = fitFont(ctx, name1, 380, 40, 700).px;
    const title2 = fitFont(ctx, name2, 380, 40, 700).px;
    ctx.font = `700 ${title1}px ${FONT}`; const w1 = ctx.measureText(name1).width;
    ctx.font = `400 28px ${FONT}`; const wvs = ctx.measureText('vs').width;
    ctx.font = `700 ${title2}px ${FONT}`; const w2 = ctx.measureText(name2).width;
    const titleX = (W - (w1 + 24 + wvs + 24 + w2)) / 2;
    drawText(ctx, name1, titleX, 176, title1, C.blue, 700, 'left', FONT, 380, 18);
    drawText(ctx, 'vs', titleX + w1 + 24, 177, 28, C.muted, 400, 'left');
    drawText(ctx, name2, titleX + w1 + 24 + wvs + 24, 176, title2, C.gold, 700, 'left', FONT, 380, 18);

    textShadows = false;
    drawText(ctx, es ? 'HISTORIAL DE SETS' : 'SET RECORD', W / 2, heroY + 39, 11, C.muted, 500, 'center', MONO);
    const scoreY = heroY + 140;
    const leftScore = fitFont(ctx, String(state.stats.p1Sets), 245, 114, 700);
    const rightScore = fitFont(ctx, String(state.stats.p2Sets), 245, 114, 700);
    ctx.font = `700 ${leftScore.px}px ${FONT}`; const leftScoreW = ctx.measureText(leftScore.label).width;
    ctx.font = `700 88px ${FONT}`; const dashW = ctx.measureText('–').width;
    ctx.font = `700 ${rightScore.px}px ${FONT}`; const rightScoreW = ctx.measureText(rightScore.label).width;
    const scoreGap = 18;
    const scoreGroupW = leftScoreW + dashW + rightScoreW + scoreGap * 2;
    const scoreStart = (W - scoreGroupW) / 2;
    drawText(ctx, leftScore.label, scoreStart + leftScoreW / 2, scoreY, leftScore.px, C.blue, 700, 'center', FONT, 245, 56);
    drawText(ctx, '–', scoreStart + leftScoreW + scoreGap + dashW / 2, scoreY - 2, 88, C.text, 700, 'center', FONT);
    drawText(ctx, rightScore.label, scoreStart + leftScoreW + scoreGap + dashW + scoreGap + rightScoreW / 2, scoreY, rightScore.px, C.gold, 700, 'center', FONT, 245, 56);
    const gameYCount = heroY + 191;
    const gameCount = (x, count, color) => {
      ctx.font = `500 16px ${MONO}`;
      const digits = String(count);
      const openW = ctx.measureText('(').width;
      const digitsW = ctx.measureText(digits).width;
      const closeW = ctx.measureText(')').width;
      let cursor = x - (openW + digitsW + closeW) / 2;
      drawText(ctx, '(', cursor, gameYCount, 16, C.muted, 500, 'left', MONO); cursor += openW;
      drawText(ctx, digits, cursor, gameYCount, 16, color, 500, 'left', MONO); cursor += digitsW;
      drawText(ctx, ')', cursor, gameYCount, 16, C.muted, 500, 'left', MONO);
    };
    gameCount(W / 2 - 75, state.stats.p1Games, C.blue);
    gameCount(W / 2 + 75, state.stats.p2Games, C.gold);
    const barX = pad + 40, barW = W - 2 * pad - 80, barY = heroY + 218;
    drawBar(ctx, barX, barY, barW, 12, (state.stats.p1Sets + state.stats.p2Sets) ? state.stats.p1Sets / (state.stats.p1Sets + state.stats.p2Sets) : .5);
    drawText(ctx, state.lead, W / 2, heroY + 253, 13, C.text, 500, 'center', FONT, W - 2 * pad - 90, 10);
    const chips = [state.gameLabel, state.periodLabel, ...(state.phaseLabel === (es ? 'Todas las fases' : 'All phases') ? [] : [state.phaseLabel])];
    ctx.font = `500 12px ${FONT}`;
    const chipWidths = chips.map(label => Math.max(92, ctx.measureText(label).width + 30));
    const chipsTotal = chipWidths.reduce((a, b) => a + b, 0) + (chips.length - 1) * 10;
    let chipX = (W - chipsTotal) / 2;
    for (let i = 0; i < chips.length; i++) {
      roundRect(ctx, chipX, heroY + 278, chipWidths[i], 28, 14);
      ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.24)'; ctx.stroke();
      drawText(ctx, chips[i], chipX + chipWidths[i] / 2, heroY + 292, 12, C.text, 500, 'center');
      chipX += chipWidths[i] + 10;
    }

    const boxX = pad, boxW = W - 2 * pad;
    panel(ctx, boxX, gameY, boxW, gameH, 22);
    drawText(ctx, es ? 'Por juego' : 'By game', boxX + 24, gameY + 31, 22, C.text, 700);
    drawText(ctx, es ? 'VICTORIAS EN SETS' : 'SET WINS', boxX + boxW - 24, gameY + 31, 10, C.muted, 500, 'right', MONO);
    gameRows.forEach((row, index) => {
      const rowY = gameY + 80 + index * 54;
      if (index) { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(boxX + 24, rowY - 25); ctx.lineTo(boxX + boxW - 24, rowY - 25); ctx.stroke(); }
      const contentX = boxX + 24, contentW = boxW - 48;
      const labelW = 170, scoreW = 80, gap = 16;
      const bx = contentX + labelW + gap;
      const bw = contentW - labelW - scoreW - gap * 2;
      drawText(ctx, row.name, contentX, rowY, 18, C.text, 700, 'left', FONT, labelW, 12);
      drawBar(ctx, bx, rowY - 7, bw, 14, row.sets ? row.p1 / row.sets : 0);
      drawText(ctx, `${row.p1}–${row.p2}`, boxX + boxW - 24, rowY, 21, C.text, 700, 'right', FONT, scoreW, 14);
    });

    const analysisGap = 16, halfW = (boxW - analysisGap) / 2;
    panel(ctx, boxX, analysisY, halfW, statsH, 22);
    panel(ctx, boxX + halfW + analysisGap, analysisY, halfW, statsH, 22);
    drawText(ctx, es ? 'Estadísticas del enfrentamiento' : 'Matchup stats', boxX + 20, analysisY + 27, 18, C.text, 700, 'left', FONT, halfW - 40, 12);
    drawText(ctx, es ? 'SOLO SETS COMPARTIDOS' : 'SHARED SETS ONLY', boxX + halfW - 20, analysisY + 27, 9, C.muted, 500, 'right', MONO);
    const statCols = [boxX + 20, boxX + halfW - 105, boxX + halfW - 25];
    drawText(ctx, es ? 'DATO' : 'STAT', statCols[0], analysisY + 61, 9, C.muted, 500, 'left', MONO);
    drawText(ctx, name1, statCols[1], analysisY + 61, 9, C.blue, 500, 'center', MONO, 80, 8);
    drawText(ctx, name2, statCols[2], analysisY + 61, 9, C.gold, 500, 'right', MONO, 80, 8);
    const metricRows = [
      [es ? 'Racha de victorias en games' : 'Longest game win streak', state.stats.longest[0], state.stats.longest[1]],
      [es ? 'Series de eliminación ganadas' : 'Elimination matches won', state.stats.elimination[0], state.stats.elimination[1]],
      [es ? 'Remontadas (épicas)' : 'Comebacks (epic)', `${state.stats.comebacks[0]} (${state.stats.epic[0]})`, `${state.stats.comebacks[1]} (${state.stats.epic[1]})`],
      [es ? 'Series decisivas ganadas' : 'Decider sets won', state.stats.deciders[0], state.stats.deciders[1]],
      [es ? 'Victorias perfectas' : 'Clean sweeps', state.stats.sweeps[0], state.stats.sweeps[1]]
    ];
    metricRows.forEach((row, i) => {
      const y = analysisY + 97 + i * 38;
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.moveTo(boxX + 20, y - 15); ctx.lineTo(boxX + halfW - 20, y - 15); ctx.stroke();
      drawText(ctx, row[0], statCols[0], y, 12, C.muted, 400, 'left', FONT, halfW - 185, 9);
      drawText(ctx, String(row[1]), statCols[1], y, 14, C.blue, 700, 'center', FONT, 72, 9);
      drawText(ctx, String(row[2]), statCols[2], y, 14, C.gold, 700, 'right', FONT, 72, 9);
    });

    const charX = boxX + halfW + analysisGap;
    drawText(ctx, es ? 'Enfrentamientos de personajes' : 'Character matchups', charX + 20, analysisY + 27, 18, C.text, 700, 'left', FONT, halfW - 40, 12);
    drawText(ctx, es ? 'POR JUEGOS INDIVIDUALES' : 'BY INDIVIDUAL GAMES', charX + halfW - 20, analysisY + 27, 9, C.muted, 500, 'right', MONO);
    if (!state.pairs.length) {
      drawText(ctx, es ? 'No hay datos de personajes por juego.' : 'No game-by-game character data.', charX + halfW / 2, analysisY + 150, 13, C.muted, 400, 'center', FONT, halfW - 35, 10);
    } else {
      state.pairs.slice(0, 3).forEach((row, i) => {
        const y = analysisY + 66 + i * 75;
        const pct = Math.round(100 * row.p1Wins / Math.max(1, row.games));
        const otherPct = 100 - pct;
        const leftPath = imagePath('stocks', row.gameId || state.primaryGameId, row.p1);
        const rightPath = imagePath('stocks', row.gameId || state.primaryGameId, row.p2);
        const leftImg = images.get(leftPath), rightImg = images.get(rightPath);
        if (leftImg) ctx.drawImage(leftImg, charX + 22, y, 28, 28);
        if (rightImg) ctx.drawImage(rightImg, charX + halfW - 50, y, 28, 28);
        drawText(ctx, `${row.games} ${es ? 'JUEGOS' : 'GAMES'}`, charX + halfW / 2, y + 14, 9, C.muted, 500, 'center', MONO);
        const barX = charX + 20, barY = y + 38, barW = halfW - 40, barH = 22;
        roundRect(ctx, barX, barY, barW, barH, 11); ctx.fillStyle = C.gold; ctx.fill();
        ctx.save(); roundRect(ctx, barX, barY, barW, barH, 11); ctx.clip(); ctx.fillStyle = C.blue; ctx.fillRect(barX, barY, barW * pct / 100, barH); ctx.restore();
        if (pct >= 15) drawText(ctx, `${pct}%`, barX + Math.max(20, barW * pct / 2), barY + barH / 2, 10, '#071024', 700, 'center', MONO);
        else drawText(ctx, `${pct}%`, barX + 7, barY + barH / 2, 9, '#071024', 700, 'left', MONO);
        if (otherPct >= 15) drawText(ctx, `${otherPct}%`, barX + barW - Math.max(20, barW * otherPct / 2), barY + barH / 2, 10, '#071024', 700, 'center', MONO);
        else drawText(ctx, `${otherPct}%`, barX + barW - 7, barY + barH / 2, 9, C.gold, 700, 'right', MONO);
      });
    }

    panel(ctx, boxX, seriesY, boxW, seriesH, 22);
    drawText(ctx, es ? 'La serie' : 'The series', boxX + 24, seriesY + 29, 21, C.text, 700);
    drawText(ctx, es ? 'ANTERIOR → RECIENTE' : 'OLDER → NEWER', boxX + boxW - 24, seriesY + 29, 9, C.muted, 500, 'right', MONO);
    const tileW = columns * tile + (columns - 1) * tileGap;
    const startX = boxX + (boxW - tileW) / 2;
    series.forEach((set, i) => {
      const col = i % columns, row = Math.floor(i / columns);
      const x = startX + col * (tile + tileGap), y = seriesY + 51 + row * (tile + tileGap);
      const side = set.outcome === 'win' ? 0 : 1;
      const color = side === 0 ? C.blue : C.gold;
      roundRect(ctx, x, y, tile, tile, 10); ctx.fillStyle = side === 0 ? 'rgba(159,214,255,.92)' : 'rgba(245,197,66,.92)'; ctx.fill();
      const src = seriesAssets[i], img = images.get(src);
      if (img) {
        const size = tile - 8;
        const scale = Math.min(size / img.width, size / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        ctx.drawImage(img, x + (tile - iw) / 2, y + (tile - ih) / 2, iw, ih);
      } else {
        drawText(ctx, side === 0 ? 'P1' : 'P2', x + tile / 2, y + tile / 2, 14, side === 0 ? '#06132b' : '#191506', 700, 'center', MONO);
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; roundRect(ctx, x, y, tile, tile, 10); ctx.stroke();
    });
    const last = series.at(-1);
    if (last) {
      const info = `${es ? 'Último' : 'Latest'}: ${latestMeeting(series, state, es)}`;
      drawText(ctx, info, boxX + 24, seriesY + seriesH - 18, 11, C.muted, 400, 'left', FONT, boxW - 48, 9);
    }
    textShadows = true;
    drawText(ctx, 'FULL HEAD-TO-HEAD AT PLATFIGHTERS.UY', pad, H - 27, 10, C.muted, 500, 'left', MONO, W * .65, 8);
    drawText(ctx, new Date().toLocaleDateString(es ? 'es-UY' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }), W - pad, H - 27, 10, C.muted, 500, 'right', MONO);
    return canvas;
  }

  async function download(state) {
    const canvas = await render(state);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed.')), 'image/png'));
    const a = document.createElement('a');
    const slug = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = `${slug(state.p1.player.tag)}-vs-${slug(state.p2.player.tag)}-head-to-head.png`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.H2HExport = { download };
})();
