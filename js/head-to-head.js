(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const two = $('#player-two');
  const gameSelect = $('#h2h-game');
  const periodSelect = $('#h2h-period');
  const phaseSelect = $('#h2h-phase');
  const status = $('#h2h-status');
  const content = $('#h2h-content');
  const heading = $('#h2h-title');
  const params = new URLSearchParams(location.search);
  let directory = [];
  let profiles = new Map();
  let merges = {};
  let current = null;
  let originId = '';
  let initialPeriod = params.get('period') || '';
  const isEs = () => window.i18n?.getLang?.() === 'es';
  const text = (en, es) => isEs() ? es : en;
  const setWord = count => Number(count) === 1 ? 'set' : 'sets';
  const canonical = id => {
    let currentId = String(id || '');
    const seen = new Set();
    while (merges[currentId] && !seen.has(currentId)) { seen.add(currentId); currentId = String(merges[currentId]); }
    return currentId;
  };
  const profilePath = id => {
    const entry = directory.find(item => String(item.playerId) === canonical(id));
    return entry ? `data/profiles/${encodeURIComponent(entry.slug)}.json` : null;
  };
  const compareUrl = () => {
    const next = new URLSearchParams();
    if (originId) next.set('p1', originId);
    if (two.value) next.set('p2', two.value);
    if (gameSelect.value) next.set('game', gameSelect.value);
    if (periodSelect.value && periodSelect.value !== 'all') next.set('period', periodSelect.value);
    if (phaseSelect.value && phaseSelect.value !== 'all') next.set('phase', phaseSelect.value);
    history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
  };
  const setStatus = message => { status.textContent = message; };
  const ord = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
  const scorePair = (score, outcome = 'win') => {
    const match = String(score || '').match(/^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/);
    if (match) return [Number(match[1]), Number(match[2])];
    const legacy = String(score || '').match(/^\s*(\d+)\s*-\s*(\d+)\s*[–—]\s*(\d+)\s*-\s*(\d+)\s*$/);
    if (legacy) {
      const values = legacy.slice(1).map(Number);
      const high = Math.max(...values), low = Math.min(...values);
      return outcome === 'loss' ? [low, high] : [high, low];
    }
    return null;
  };
  const gameAssetSlug = name => String(name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const characterAssetAliases = {
    'Mr. Game & Watch': 'mr-game-watch',
    'Pokémon Trainer': 'pokemon-trainer',
    'Pokemon Trainer': 'pokemon-trainer',
    'Pyra & Mythra': 'pyra-mythra',
    'R.O.B.': 'rob'
  };
  const characterAssetSlug = name => characterAssetAliases[name] || gameAssetSlug(name);

  async function load() {
    try {
      const [indexResponse, mergesResponse, opponentsResponse] = await Promise.all([
        fetch('data/profiles/index.json', { cache: 'no-store' }),
        fetch('data/profiles/merges.json', { cache: 'no-store' }),
        fetch('data/profiles/head-to-head-index.json', { cache: 'no-store' })
      ]);
      if (!indexResponse.ok) throw new Error('Player profiles are not available.');
      if (!opponentsResponse.ok) throw new Error('The opponent list is not available. Please republish the site data.');
      directory = await indexResponse.json();
      if (mergesResponse.ok) merges = await mergesResponse.json();
      const opponentIndex = await opponentsResponse.json();
      originId = canonical(params.get('p1') || '');
      const verifiedOpponentIds = new Set((opponentIndex[originId] || []).map(canonical));
      const opponents = directory
        .filter(entry => canonical(entry.playerId) !== originId && verifiedOpponentIds.has(canonical(entry.playerId)))
        .sort((a, b) => a.tag.localeCompare(b.tag));
      const options = opponents
        .map(entry => `<option value="${esc(entry.playerId)}">${esc(entry.tag)}</option>`).join('');
      two.insertAdjacentHTML('beforeend', options);
      const requestedOpponent = canonical(params.get('p2') || '');
      two.value = opponents.some(entry => canonical(entry.playerId) === requestedOpponent) ? requestedOpponent : '';
      if (params.get('phase')) phaseSelect.value = params.get('phase');
      await update();
    } catch (error) {
      setStatus(error.message || 'Could not load player data.');
    }
  }

  async function fetchProfile(id) {
    const canonicalId = canonical(id);
    if (!canonicalId) return null;
    if (profiles.has(canonicalId)) return profiles.get(canonicalId);
    const path = profilePath(canonicalId);
    if (!path) return null;
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const profile = await response.json();
    profiles.set(canonicalId, profile);
    return profile;
  }

  function populateGames(p1, p2) {
    const second = new Map((p2.games || []).map(game => [String(game.id || game.slug), game]));
    const shared = (p1.games || []).filter(game => second.has(String(game.id || game.slug)));
    const common = shared.map(game => {
      const id = String(game.id || game.slug);
      const sets = intersectSets(p1, p2, id,
        canonical(p1.player.playerId || p1.player.startggPlayerId),
        canonical(p2.player.playerId || p2.player.startggPlayerId));
      return { game, id, sets };
    }).filter(item => item.sets.length > 0);
    const previous = gameSelect.value || params.get('game');
    gameSelect.innerHTML = common.length
      ? `<option value="all">${text('All games', 'Todos los juegos')}</option>${common.map(item => `<option value="${esc(item.id)}">${esc(item.game.name)}</option>`).join('')}`
      : `<option value="">${text('No shared sets', 'No tienen sets en común')}</option>`;
    gameSelect.disabled = common.length === 0;
    if (!common.length) return null;
    const bestMatch = [...common].sort((a, b) => b.sets.length - a.sets.length || a.game.name.localeCompare(b.game.name))[0];
    const validPrevious = previous === 'all' || common.some(item => item.id === previous);
    const defaultGame = common.length === 1 ? common[0].id : 'all';
    gameSelect.value = validPrevious ? previous : defaultGame;
    if (gameSelect.value === 'all') return { id: 'all', name: text('All games', 'Todos los juegos'), primaryGameId: bestMatch.id, games: common };
    const selected = common.find(item => item.id === gameSelect.value);
    return { ...selected.game, id: selected.id, primaryGameId: selected.id, sharedSets: selected.sets };
  }

  function updatePeriods(sets) {
    const years = [...new Set(sets.map(set => String(set.date || '').slice(0, 4)).filter(year => /^\d{4}$/.test(year)))].sort().reverse();
    const wanted = initialPeriod || periodSelect.value || 'all';
    periodSelect.innerHTML = `<option value="all">${text('All history', 'Todo el historial')}</option>` + years.map(year => `<option value="${year}">${year}</option>`).join('');
    periodSelect.disabled = years.length === 0;
    periodSelect.value = years.includes(wanted) ? wanted : 'all';
    initialPeriod = '';
  }

  function updatePhases(sets) {
    const order = [
      ['pools', text('Pools', 'Pools')],
      ['bracket', text('Bracket', 'Llaves')],
      ['top8', text('Top 8', 'Top 8')],
      ['top3', text('Top 3', 'Top 3')]
    ];
    const available = new Set(sets.map(phaseClass));
    const wanted = phaseSelect.value || params.get('phase') || 'all';
    phaseSelect.innerHTML = `<option value="all">${text('All phases', 'Todas las fases')}</option>`
      + order.filter(([value]) => available.has(value)).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    phaseSelect.value = available.has(wanted) ? wanted : 'all';
    phaseSelect.disabled = available.size === 0;
  }

  function allGameSets(profile, gameId) {
    const game = (profile.games || []).find(item => String(item.id || item.slug) === String(gameId));
    return (game?.results || []).flatMap(result => (result.sets || []).map(set => ({ ...set, date: result.date, place: result.place, seed: result.seed, event: result.event, eventKey: result.eventKey })));
  }

  function intersectSets(p1, p2, gameId, id1, id2) {
    const p2Sets = allGameSets(p2, gameId);
    const p2ById = new Map(p2Sets.filter(set => set.setId).map(set => [String(set.setId), set]));
    return allGameSets(p1, gameId).filter(set => set.setId && p2ById.has(String(set.setId)))
      .map(set => ({ ...set, mirror: p2ById.get(String(set.setId)) }));
  }

  function phaseClass(set) {
    const phase = normalize(set.phase);
    const round = normalize(set.round);
    if (phase.includes('pool')) return 'pools';
    if (/(grand final|losers final|winners final|third place|3rd place|bronze match|top 3)/.test(round) || phase.includes('top 3')) return 'top3';
    if (/(quarter|semi|top 8|top 16|top 8)/.test(round) || phase.includes('top 8')) return 'top8';
    return 'bracket';
  }

  function applyFilters(sets) {
    const year = periodSelect.value;
    const phase = phaseSelect.value;
    return sets.filter(set => (!year || year === 'all' || String(set.date || '').startsWith(year)) && (phase === 'all' || phaseClass(set) === phase));
  }

  function gameResults(set) {
    if (Array.isArray(set.games) && set.games.length) return set.games.map(game => ({
      ...game,
      p1Character: game.character,
      p2Character: game.opponentCharacter,
      p1Won: game.outcome === 'win' ? true : game.outcome === 'loss' ? false : null
    }));
    const score = scorePair(set.score, set.outcome);
    if (!score) return [];
    return Array.from({ length: score[0] + score[1] }, (_, index) => ({ p1Character: null, p2Character: null, p1Won: null, guessed: true, index }));
  }

  function recordStats(sets) {
    let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0, longest = [0, 0], currentStreak = 0, currentSide = 0;
    let elimination = [0, 0], comebacks = [0, 0], epic = [0, 0], deciders = [0, 0], sweeps = [0, 0];
    let hasGameResults = false;
    let previousGameId = null;
    const chronological = [...sets].sort((a, b) => (Number(a.startedAt) || 0) - (Number(b.startedAt) || 0));
    chronological.forEach(set => {
      const setGameId = String(set.gameId || '');
      if (previousGameId !== null && setGameId && setGameId !== previousGameId) {
        currentStreak = 0;
        currentSide = -1;
      }
      if (setGameId) previousGameId = setGameId;
      const scores = scorePair(set.score, set.outcome);
      if (set.outcome === 'win') p1Sets++; else if (set.outcome === 'loss') p2Sets++;
      if (scores) { p1Games += scores[0]; p2Games += scores[1]; }
      const games = gameResults(set);
      if (games.some(game => game.p1Won !== null)) hasGameResults = true;
      if (games.length) {
        games.forEach(game => {
          if (game.p1Won === null) {
            currentStreak = 0;
            currentSide = -1;
            return;
          }
          const side = game.p1Won ? 0 : 1;
          currentStreak = side === currentSide ? currentStreak + 1 : 1;
          currentSide = side;
          longest[side] = Math.max(longest[side], currentStreak);
        });
      } else {
        currentStreak = 0;
        currentSide = -1;
      }
      const parsed = scores || [0, 0];
      const winner = set.outcome === 'win' ? 0 : set.outcome === 'loss' ? 1 : -1;
      if (winner >= 0) {
        const round = normalize(set.round);
        const hasGrandFinalReset = chronological.some(candidate => candidate.eventKey === set.eventKey && normalize(candidate.round).includes('grand final reset'));
        const isElimination = String(set.bracketType || '').toUpperCase().includes('SINGLE_ELIMINATION')
          || round.includes('losers') || round.includes('grand final reset') || round.includes('elimination')
          || (round === 'grand final' && !hasGrandFinalReset);
        if (winner === 0 && isElimination) elimination[0]++;
        if (winner === 1 && isElimination) elimination[1]++;
        const bestOf = scores && Math.max(...scores) >= 3 ? 5 : 3;
        const target = bestOf === 5 ? 3 : 2;
        const winScore = winner === 0 ? parsed[0] : parsed[1];
        const lossScore = winner === 0 ? parsed[1] : parsed[0];
        if (winScore === target && lossScore === target - 1) deciders[winner]++;
        if (winScore === target && lossScore === 0) sweeps[winner]++;
        const sequence = games.map(game => game.p1Won === null ? null : game.p1Won ? 0 : 1);
        for (const side of [0, 1]) {
          if (winner !== side) continue;
          const ownResult = side === 0 ? 0 : 1;
          const completeSequence = games.length === parsed[0] + parsed[1] && sequence.every(value => value !== null);
          const prefix = sequence.slice(0, -2);
          const ownBeforeComeback = prefix.filter(value => value === ownResult).length;
          const opponentBeforeComeback = prefix.length - ownBeforeComeback;
          const opponentAtOneAway = opponentBeforeComeback === target - 1 && ownBeforeComeback < target - 1;
          const finalTwoWon = sequence.slice(-2).length === 2 && sequence.slice(-2).every(value => value === ownResult);
          if (completeSequence && opponentAtOneAway && finalTwoWon) {
            comebacks[side]++;
            if (bestOf === 5 && ownBeforeComeback === 0 && opponentBeforeComeback === 2) epic[side]++;
          }
        }
      }
    });
    return { p1Sets, p2Sets, p1Games, p2Games, longest, elimination, comebacks, epic, deciders, sweeps, hasGameResults };
  }

  function formatDate(date) {
    if (!date) return '—';
    return new Date(`${date}T00:00:00`).toLocaleDateString(isEs() ? 'es-UY' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function stockPath(gameId, character) {
    if (!character) return '';
    return `assets/renders/${encodeURIComponent(gameId)}/stocks/${encodeURIComponent(characterAssetSlug(character))}.webp`;
  }

  function matchupRows(sets) {
    const rows = new Map();
    sets.forEach(set => gameResults(set).forEach(game => {
      if (!game.p1Character || !game.p2Character || game.p1Won === null) return;
      const gameId = String(set.gameId || '');
      const key = `${gameId}\u0000${game.p1Character}\u0000${game.p2Character}`;
      const row = rows.get(key) || { gameId, p1: game.p1Character, p2: game.p2Character, p1Wins: 0, p2Wins: 0, games: 0 };
      row.games++;
      if (game.p1Won) row.p1Wins++; else row.p2Wins++;
      rows.set(key, row);
    }));
    const ranked = [...rows.values()].sort((a, b) => b.games - a.games || a.gameId.localeCompare(b.gameId) || a.p1.localeCompare(b.p1));
    // In All games mode, reserve one slot for the strongest matchup from each game
    // before filling any remaining slots by overall frequency.
    const selected = [];
    const seenGames = new Set();
    for (const row of ranked) {
      if (seenGames.has(row.gameId)) continue;
      seenGames.add(row.gameId);
      selected.push(row);
      if (selected.length === 3) break;
    }
    if (selected.length < 3) {
      for (const row of ranked) {
        if (selected.includes(row)) continue;
        selected.push(row);
        if (selected.length === 3) break;
      }
    }
    return selected;
  }

  function matchupHtml(rows, gameId) {
    if (!rows.length) return `<div class="h2h-empty-chart">${text('No game-by-game character data for these meetings.', 'No hay datos de personajes juego a juego para estos enfrentamientos.')}</div>`;
    return `<div class="h2h-matchups">${rows.map(row => {
      const p1Pct = Math.round(100 * row.p1Wins / row.games);
      const p2Pct = 100 - p1Pct;
      return `<div class="h2h-matchup-row"><div class="h2h-matchup-icons"><img src="${esc(stockPath(row.gameId || gameId, row.p1))}" alt="${esc(row.p1)}" loading="lazy"><span class="h2h-matchup-count">${row.games} ${text('GAMES', 'JUEGOS')}</span><img src="${esc(stockPath(row.gameId || gameId, row.p2))}" alt="${esc(row.p2)}" loading="lazy"></div><div class="h2h-matchup-bar"><span class="p1" style="width:${p1Pct}%">${p1Pct}%</span><span class="p2" style="width:${p2Pct}%">${p2Pct}%</span></div></div>`;
    }).join('')}</div>`;
  }

  function help(label, tip) { return `${label}<sup class="h2h-help" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}">?</sup>`; }

  function statTable(stats, p1, p2) {
    const rows = [
      [text('Longest game win streak', 'Racha más larga de victorias en juegos'), stats.longest[0], stats.longest[1], text('Longest known run of consecutive individual game wins. Missing game results break the streak.', 'Mayor racha conocida de victorias consecutivas en juegos individuales. Los resultados faltantes interrumpen la racha.')],
      [text('Elimination matches won', 'Series de eliminación ganadas'), stats.elimination[0], stats.elimination[1], text('Sets won that eliminated the opponent from the tournament.', 'Series ganadas que eliminaron al rival del torneo.')],
      [text('Comebacks (sweeps)', 'Remontadas (épicas)'), `${stats.comebacks[0]} (${stats.epic[0]})`, `${stats.comebacks[1]} (${stats.epic[1]})`, text('Verified from complete game-by-game results; sets without a full sequence are excluded. Epic comebacks are wins after going 0–2 down in a best-of-five.', 'Verificadas con resultados completos juego a juego; se excluyen los sets sin secuencia completa. Las remontadas épicas son victorias tras quedar 0–2 abajo en un set al mejor de cinco.')],
      [text('Decider sets won', 'Series decisivas ganadas'), stats.deciders[0], stats.deciders[1], text('Sets won in the final possible game (game 3 in a best-of-three or game 5 in a best-of-five).', 'Series ganadas en el último juego posible (juego 3 al mejor de tres o juego 5 al mejor de cinco).')],
      [text('Clean sweeps', 'Victorias perfectas'), stats.sweeps[0], stats.sweeps[1], text('Sets won without dropping a game.', 'Series ganadas sin perder ningún juego.')]
    ];
    return `<table class="h2h-stats"><thead><tr><th>${text('STAT', 'DATO')}</th><th>${esc(p1.player.tag)}</th><th>${esc(p2.player.tag)}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${help(row[0], row[3])}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('')}</tbody></table>`;
  }

  function rankingHistoryHtml(rankings, p1, p2, firstRow = false) {
    const id1 = canonical(p1.player.playerId || p1.player.startggPlayerId);
    const id2 = canonical(p2.player.playerId || p2.player.startggPlayerId);
    const history = (rankings || []).map(ranking => {
      const players = ranking.players || [];
      const entryFor = id => players.find(entry => canonical(entry.playerId || entry.id) === id && Number(entry.placement) > 0) || null;
      const player1 = entryFor(id1), player2 = entryFor(id2);
      return player1 || player2 ? { ranking, player1, player2 } : null;
    }).filter(Boolean).sort((a, b) => {
      const dateA = a.ranking.period?.end || a.ranking.end || a.ranking.period?.start || a.ranking.start || '';
      const dateB = b.ranking.period?.end || b.ranking.end || b.ranking.period?.start || b.ranking.start || '';
      return dateB.localeCompare(dateA) || String(a.ranking.game?.name || '').localeCompare(String(b.ranking.game?.name || ''));
    });
    if (!history.length) return '';
    const medal = (entry, player, ranking, side) => {
      if (!entry) return `<span class="h2h-rank-state" title="${esc(text('Not ranked', 'Sin ranking'))}" aria-label="${esc(text('Not ranked', 'Sin ranking'))}"><svg class="h2h-rank-hex blank" viewBox="0 0 48 48" aria-hidden="true"><polygon class="pr-hex-ring" points="24,2 44,13 44,35 24,46 4,35 4,13"/></svg></span>`;
      const place = Number(entry.placement);
      const tier = window.PRBadges?.getPlacementTier(place) || { key: 'sky', hex: '#9fd6ff' };
      const ordinal = window.PRBadges?.getOrdinal(place) || String(place);
      const aria = `${player.player.tag}: ${ordinal} ${text('place', 'puesto')} · ${ranking.game?.name || ''} ${ranking._periodFormatted || ''}`;
      return `<a class="h2h-rank-medal tier-${esc(tier.key)} ${side}" href="ranking.html?id=${encodeURIComponent(ranking.id)}" title="${esc(aria)}" aria-label="${esc(aria)}"><span class="h2h-rank-hex-wrap"><svg class="h2h-rank-hex" viewBox="0 0 48 48" aria-hidden="true"><polygon class="pr-hex-bg" points="24,2 44,13 44,35 24,46 4,35 4,13"/><polygon class="pr-hex-ring" points="24,2 44,13 44,35 24,46 4,35 4,13" stroke="${esc(tier.hex)}" stroke-width="2.8"/></svg><span class="h2h-rank-ordinal">${esc(ordinal)}</span></span></a>`;
    };
    return `<section class="h2h-panel h2h-ranking-panel glass${firstRow ? ' ranking-first' : ''}"><h3>${text('Ranking history', 'Historial de rankings')}</h3><div class="h2h-sub">${text('Rankings where either player placed, with both placements shown.', 'Rankings donde quedó al menos uno de los jugadores, con ambas posiciones.')}</div><div class="h2h-ranking-list">${history.map(({ ranking, player1, player2 }) => {
      const game = ranking.game?.name || ranking.game?.slug || text('Ranking', 'Ranking');
      const period = ranking._periodFormatted || (ranking.period?.start || ranking.start || '').slice(0, 4);
      return `<div class="h2h-ranking-row">${medal(player1, p1, ranking, 'p1')}<span class="h2h-ranking-player">${esc(p1.player.tag)}</span><a class="h2h-ranking-title" href="ranking.html?id=${encodeURIComponent(ranking.id)}">${esc(game)} · ${esc(period)}</a><span class="h2h-ranking-player right">${esc(p2.player.tag)}</span>${medal(player2, p2, ranking, 'p2')}</div>`;
    }).join('')}</div></section>`;
  }

  function placements(p1, p2, gameId, sets) {
    const keys = new Set(sets.map(set => set.eventKey).filter(Boolean));
    const gameIds = new Set(gameId === 'all' ? sets.map(set => String(set.gameId || '')) : [String(gameId)]);
    const resultsFor = profile => (profile.games || [])
      .filter(game => gameIds.has(String(game.id || game.slug)))
      .flatMap(game => game.results || [])
      .filter(result => keys.has(result.eventKey) && Number(result.place) > 0);
    const r1 = new Map(resultsFor(p1).map(result => [result.eventKey, result]));
    const r2 = new Map(resultsFor(p2).map(result => [result.eventKey, result]));
    return [...keys].map(key => ({ p1: r1.get(key), p2: r2.get(key), key })).filter(event => event.p1 || event.p2).sort((a, b) => (a.p1?.date || a.p2?.date || '').localeCompare(b.p1?.date || b.p2?.date || ''));
  }

  function placementsHtml(events, p1, p2) {
    if (!events.length) return `<div class="h2h-empty-chart">${text('No shared tournament placements in this selection.', 'No hay posiciones compartidas en torneos para esta selección.')}</div>`;
    const width = 940, height = 245, left = 42, right = 18, top = 20, bottom = 36;
    const maxPlace = Math.max(4, ...events.flatMap(event => [Number(event.p1?.place), Number(event.p2?.place)]).filter(Number.isFinite));
    const x = index => events.length === 1 ? (left + width - right) / 2 : left + index * (width - left - right) / (events.length - 1);
    const y = place => top + (Number(place) - 1) * (height - top - bottom) / Math.max(1, maxPlace - 1);
    const polyline = side => events.map((event, index) => event[side] ? `${x(index)},${y(event[side].place)}` : null).filter(Boolean).join(' ');
    const points = events.map((event, index) => {
      const label = (event.p1?.event || event.p2?.event || '').split(' · ')[0];
      const date = event.p1?.date || event.p2?.date || '';
      return `<g class="event-dot" tabindex="0" data-name="${esc(label)}" data-date="${esc(date)}" data-p1-place="${event.p1?.place || ''}" data-p2-place="${event.p2?.place || ''}" data-p1-seed="${event.p1?.seed || ''}" data-p2-seed="${event.p2?.seed || ''}">${event.p1 ? `<circle class="p1point" cx="${x(index)}" cy="${y(event.p1.place)}" r="4.5"/>` : ''}${event.p2 ? `<circle class="p2point" cx="${x(index)}" cy="${y(event.p2.place)}" r="4.5"/>` : ''}<circle cx="${x(index)}" cy="${top}" r="12" fill="transparent"/></g>`;
    }).join('');
    const lines = Array.from({ length: Math.min(maxPlace, 5) }, (_, index) => {
      const place = index === 0 ? 1 : Math.ceil(1 + index * (maxPlace - 1) / (Math.min(maxPlace, 5) - 1));
      return `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(place)}" y2="${y(place)}"/><text x="0" y="${y(place) + 3}">${ord(place)}</text>`;
    }).join('');
    return `<div class="h2h-section-title"><span></span><div class="h2h-legend"><span>${esc(p1.player.tag)}</span><span class="p2">${esc(p2.player.tag)}</span></div></div><svg class="h2h-placement-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Shared tournament placements">${lines}<polyline class="p1line" points="${polyline('p1')}"/><polyline class="p2line" points="${polyline('p2')}"/>${points}<text x="${left}" y="${height - 7}">${esc(events[0].p1?.date || events[0].p2?.date || '')}</text><text x="${width - right - 40}" y="${height - 7}">${esc(events[events.length - 1].p1?.date || events[events.length - 1].p2?.date || '')}</text></svg><div class="h2h-chart-tooltip" hidden></div>`;
  }

  function meetingsHtml(sets, p1) {
    if (!sets.length) return `<div class="h2h-empty">${text('No sets match these filters.', 'No hay sets que coincidan con estos filtros.')}</div>`;
    const rows = [...sets].sort((a, b) => (Number(b.startedAt) || 0) - (Number(a.startedAt) || 0));
    const grandFinalVods = new Map(sets.filter(set => normalize(set.round) === 'grand final')
      .map(set => [set.eventKey, set.vods?.find(item => item.url)?.url || set.mirror?.vods?.find(item => item.url)?.url])
      .filter(([, url]) => url));
    return `<div class="h2h-table-wrap"><table class="h2h-meeting-table"><thead><tr><th>${text('EVENT', 'TORNEO')}</th><th>${text('ROUND', 'RONDA')}</th><th>${text('GAMES · P1 ABOVE / P2 BELOW', 'JUEGOS · P1 ARRIBA / P2 ABAJO')}</th><th>VOD</th></tr></thead><tbody>${rows.map(set => {
      const p1Won = set.outcome === 'win';
      const gameRows = gameResults(set);
      const gameHtml = gameRows.length ? gameRows.map(game => {
        const setGameId = set.gameId || current.gameId;
        const p1Icon = stockPath(setGameId, game.p1Character);
        const p2Icon = stockPath(setGameId, game.p2Character);
        return `<span class="h2h-game-pick">${p1Icon ? `<img class="${game.p1Won === false ? 'lost' : ''}" src="${esc(p1Icon)}" alt="${esc(game.p1Character)}" loading="lazy">` : '<i></i>'}${p2Icon ? `<img class="${game.p1Won === true ? 'lost' : ''}" src="${esc(p2Icon)}" alt="${esc(game.p2Character)}" loading="lazy">` : '<i></i>'}</span>`;
      }).join('') : `<span class="h2h-muted-row">${esc(set.score || '—')}</span>`;
      const vod = set.vods?.find(item => item.url)?.url || set.mirror?.vods?.find(item => item.url)?.url
        || (normalize(set.round) === 'grand final reset' ? grandFinalVods.get(set.eventKey) : null);
      const round = normalize(set.round);
      const phase = normalize(set.phase);
      const roundLabel = phase.includes('pool') || round.includes('pool') ? 'Pools' : set.round || '—';
      return `<tr class="${p1Won ? 'winner1' : 'winner2'}"><td><div class="mono muted">${esc(formatDate(set.date))}</div><strong>${esc((set.event || '').split(' · ')[0])}</strong></td><td class="h2h-round">${esc(roundLabel)}</td><td><div class="h2h-game-picks">${gameHtml}</div></td><td class="h2h-vod">${vod ? `<a href="${esc(vod)}" target="_blank" rel="noopener" aria-label="${text('Watch set VOD', 'Ver VOD de la serie')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg></a>` : '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function portrait(profile, gameId) {
    const game = (profile.games || []).find(item => String(item.id || item.slug) === String(gameId));
    const topCharacter = [...(game?.characters || [])]
      .filter(character => normalize(character.name) !== 'other')
      .sort((a, b) => Number(b.usage) - Number(a.usage))[0]?.name;
    if (topCharacter) return `assets/renders/${encodeURIComponent(gameId)}/portraits/${encodeURIComponent(characterAssetSlug(topCharacter))}.webp`;
    return game?.mostPlayedCharacterIcon || '';
  }

  function heroHtml(p1, p2, stats, gameId) {
    const p1Lead = stats.p1Sets / Math.max(1, stats.p1Sets + stats.p2Sets);
    let lead = stats.p1Sets === stats.p2Sets
      ? text('Even record', 'Historial empatado')
      : stats.p1Sets > stats.p2Sets
        ? text(`${p1.player.tag} leads ${p2.player.tag} by ${stats.p1Sets - stats.p2Sets} ${setWord(stats.p1Sets - stats.p2Sets)}`, `${p1.player.tag} le lleva ${stats.p1Sets - stats.p2Sets} ${setWord(stats.p1Sets - stats.p2Sets)} a ${p2.player.tag}`)
        : text(`${p1.player.tag} is behind ${p2.player.tag} by ${stats.p2Sets - stats.p1Sets} ${setWord(stats.p2Sets - stats.p1Sets)}`, `${p1.player.tag} está detrás de ${p2.player.tag} por ${stats.p2Sets - stats.p1Sets} ${setWord(stats.p2Sets - stats.p1Sets)}`);
    if (stats.p1Sets + stats.p2Sets >= 5) {
      if (p1Lead < .10) lead = text(`${p1.player.tag} is ${p2.player.tag}'s grandchild`, `${p1.player.tag} es nieto de ${p2.player.tag}`);
      else if (p1Lead < .25) lead = text(`${p1.player.tag} is ${p2.player.tag}'s child`, `${p1.player.tag} es hijo de ${p2.player.tag}`);
      else if (p1Lead >= .90) lead = text(`${p1.player.tag} is ${p2.player.tag}'s grandparent`, `${p1.player.tag} es abuelo de ${p2.player.tag}`);
      else if (p1Lead >= .75) lead = text(`${p1.player.tag} is ${p2.player.tag}'s parent`, `${p1.player.tag} es padre de ${p2.player.tag}`);
    }
    return `<section class="h2h-hero glass" style="--p1-color:#9fd6ff;--p2-color:#f5c542"><div class="h2h-player p1">${portrait(p1, gameId) ? `<img class="h2h-player-art" src="${esc(portrait(p1, gameId))}" alt="" onerror="this.remove()">` : ''}<div class="h2h-identity">${p1.player.sponsor ? `<span class="h2h-sponsor">${esc(p1.player.sponsor)}</span>` : ''}<h2 class="h2h-tag">${esc(p1.player.tag)}</h2></div></div><div class="h2h-record"><div class="h2h-record-kicker">${text('Set record', 'Historial de sets')}</div><div class="h2h-score"><span class="p1">${stats.p1Sets}</span><span class="dash">–</span><span class="p2">${stats.p2Sets}</span></div><div class="h2h-game-score">(<span class="p1">${stats.p1Games}</span> - <span class="p2">${stats.p2Games}</span>)</div><div class="h2h-record-caption">${text('Played', 'Jugaron')} ${stats.p1Games + stats.p2Games} ${text('games across', 'juegos en')} ${stats.p1Sets + stats.p2Sets} ${setWord(stats.p1Sets + stats.p2Sets)}</div><div class="h2h-recordbar"><i style="width:${stats.p1Sets + stats.p2Sets ? 100 * stats.p1Sets / (stats.p1Sets + stats.p2Sets) : 50}%"></i><b></b></div><div class="h2h-lead">${esc(lead)}</div></div><div class="h2h-player p2">${portrait(p2, gameId) ? `<img class="h2h-player-art" src="${esc(portrait(p2, gameId))}" alt="" onerror="this.remove()">` : ''}<div class="h2h-identity">${p2.player.sponsor ? `<span class="h2h-sponsor">${esc(p2.player.sponsor)}</span>` : ''}<h2 class="h2h-tag">${esc(p2.player.tag)}</h2></div></div></section>`;
  }

  function attachChartEvents() {
    const chart = $('.h2h-placement-chart');
    const tip = $('.h2h-chart-tooltip');
    if (!chart || !tip) return;
    chart.querySelectorAll('.event-dot').forEach(point => {
      const show = event => {
        const p1 = point.dataset.p1Place ? `${esc(current.p1.player.tag)}: ${ord(Number(point.dataset.p1Place))} (${text('seed', 'seed')} ${esc(point.dataset.p1Seed || '—')})` : '';
        const p2 = point.dataset.p2Place ? `${esc(current.p2.player.tag)}: ${ord(Number(point.dataset.p2Place))} (${text('seed', 'seed')} ${esc(point.dataset.p2Seed || '—')})` : '';
        tip.innerHTML = `<strong>${esc(point.dataset.name)}</strong><span class="h2h-tooltip-date">${esc(formatDate(point.dataset.date))}</span>${p1 ? `<span class="p1">${p1}</span>` : ''}${p2 ? `<span class="p2">${p2}</span>` : ''}`;
        tip.hidden = false;
        const rect = tip.getBoundingClientRect();
        tip.style.left = `${Math.min(innerWidth - rect.width - 8, Math.max(8, event.clientX + 12))}px`;
        tip.style.top = `${Math.min(innerHeight - rect.height - 8, Math.max(8, event.clientY + 12))}px`;
      };
      point.addEventListener('mouseenter', show);
      point.addEventListener('mousemove', show);
      point.addEventListener('mouseleave', () => { tip.hidden = true; });
      point.addEventListener('focus', event => show({ clientX: Math.min(innerWidth - 260, event.target.getBoundingClientRect().left), clientY: event.target.getBoundingClientRect().top }));
      point.addEventListener('blur', () => { tip.hidden = true; });
    });
  }

  function render(p1, p2, gameId, allSets, rankings, primaryGameId = gameId) {
    updatePeriods(allSets);
    updatePhases(allSets);
    const sets = applyFilters(allSets);
    if (!sets.length) {
      current = { gameId, p1, p2 };
      content.hidden = false;
      content.innerHTML = `<div class="h2h-empty glass">${text('No data for this matchup and selection.', 'No hay datos para este enfrentamiento y selección.')}</div>`;
      setStatus('');
      compareUrl();
      return;
    }
    const stats = recordStats(sets);
    const events = placements(p1, p2, gameId, sets);
    current = { gameId, p1, p2 };
    content.hidden = false;
    const pairs = matchupRows(sets);
    const rankingPanel = rankingHistoryHtml(rankings, p1, p2, false);
    const setCountLabel = sets.length === 1 ? 'set registrado · perfiles combinados' : 'sets registrados · perfiles combinados';
    content.innerHTML = `<div style="--p1-color:#9fd6ff;--p2-color:#f5c542">${heroHtml(p1, p2, stats, primaryGameId)}<div class="h2h-section-title"><h2>${text('Rivalry at a glance', 'La rivalidad en resumen')}</h2><small>${sets.length} ${text('tracked tournament sets · merged player profiles', setCountLabel)}</small></div><div class="h2h-panels"><section class="h2h-panel h2h-stats-panel glass${pairs.length ? '' : ' h2h-stats-wide'}"><h3>${text('Matchup stats', 'Estadísticas del enfrentamiento')}</h3><div class="h2h-sub">${text('Only sets played against each other', 'Solo sets disputados entre ambos')} · ${sets.length} ${setWord(sets.length)}</div>${statTable(stats, p1, p2)}</section>${pairs.length ? `<section class="h2h-panel h2h-character-panel glass"><h3>${text('Character matchups', 'Enfrentamientos de personajes')}</h3><div class="h2h-sub">${text('Win rates by individual game', 'Porcentaje de victorias por juego')}</div>${matchupHtml(pairs, primaryGameId)}</section>` : ''}<section class="h2h-panel h2h-chart-panel glass${rankingPanel ? '' : ' h2h-chart-wide'}"><div class="h2h-section-title" style="margin:0"><h3>${text('Shared tournament placements', 'Posiciones en torneos compartidos')}</h3></div><div class="h2h-sub">${text('Compare their final placements at tournaments they both entered.', 'Compara sus posiciones finales en los torneos a los que ambos asistieron.')}</div>${placementsHtml(events, p1, p2)}</section>${rankingPanel}</div><div class="h2h-section-title h2h-history-heading"><h2>${text('Set history', 'Historial de sets')}</h2><small>${sets.length} ${text('meetings', 'enfrentamientos')}</small></div><section class="h2h-panel h2h-history-panel glass">${meetingsHtml(sets, p1)}</section></div>`;
    setStatus('');
    attachChartEvents();
    compareUrl();
  }

  async function update() {
    const id1 = canonical(originId), id2 = canonical(two.value);
    const origin = directory.find(entry => canonical(entry.playerId) === id1);
    heading.textContent = origin?.tag
      ? text(`Compare players to ${origin.tag}`, `Comparar jugadores con ${origin.tag}`)
      : text('Compare players', 'Comparar jugadores');
    if (!id1 || !id2) {
      content.hidden = true;
      setStatus(!id1 ? text('Open Compare from a player profile to choose the origin player.', 'Abre Comparar desde el perfil de un jugador para elegir el jugador de origen.') : text('Choose an opponent.', 'Elige un oponente.'));
      return;
    }
    if (id1 === id2) {
      content.hidden = true;
      setStatus(text('Choose two different players.', 'Elige dos jugadores diferentes.'));
      return;
    }
    setStatus(text('Loading player data…', 'Cargando datos de jugadores…'));
    const [p1, p2, rankingData] = await Promise.all([
      fetchProfile(id1),
      fetchProfile(id2),
      window.PRBadges?.loadAllRankings?.() || Promise.resolve({ rankings: [] })
    ]);
    if (!p1 || !p2) { content.hidden = true; setStatus(text('One or both player profiles could not be loaded.', 'No se pudo cargar uno o ambos perfiles.')); return; }
    heading.textContent = text(`Compare players to ${p1.player.tag}`, `Comparar jugadores con ${p1.player.tag}`);
    const selectedGame = populateGames(p1, p2);
    if (!selectedGame) { content.hidden = false; content.innerHTML = `<div class="h2h-empty glass">${text('These players have no tracked sets in common.', 'Estos jugadores no tienen sets registrados en común.')}</div>`; updatePeriods([]); updatePhases([]); compareUrl(); setStatus(''); return; }
    const gameId = selectedGame.id || selectedGame.slug;
    const sets = gameId === 'all'
      ? selectedGame.games.flatMap(item => item.sets.map(set => ({ ...set, gameId: item.id })))
      : selectedGame.sharedSets.map(set => ({ ...set, gameId }));
    current = { gameId, p1, p2 };
    if (!sets.length) {
      content.hidden = false;
      content.innerHTML = `<div class="h2h-empty glass">${text('No tracked sets between these players in this selection.', 'No hay sets registrados entre estos jugadores en esta selección.')}</div>`;
      updatePeriods([]);
      updatePhases([]);
      compareUrl();
      setStatus('');
      return;
    }
    render(p1, p2, gameId, sets, rankingData?.rankings || [], selectedGame.primaryGameId || gameId);
  }

  [two, gameSelect, periodSelect, phaseSelect].forEach(element => element.addEventListener('change', () => {
    if (element === two) { periodSelect.value = 'all'; gameSelect.value = ''; params.delete('game'); }
    update();
  }));
  const timestamp = $('#synced');
  if (timestamp) timestamp.textContent = new Date().toLocaleDateString(isEs() ? 'es-UY' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  window.i18n?.onChange?.(() => update());
  load();
})();
