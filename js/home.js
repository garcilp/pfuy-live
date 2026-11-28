// Platfighters.uy — Homepage logic
// Loads real tournament data, player index, rankings and stats.

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmt = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString(window.i18n?.getLang() === 'es' ? 'es-UY' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function renderHomeGameLine(game, winnerHtml, entrantsHtml = '') {
  return `<div class="home-result-game"><span class="home-result-game-main"><span class="game-chip">${esc(game)}</span>${winnerHtml}</span>${entrantsHtml}</div>`;
}

function externalProvider(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'parry.gg' || host === 'www.parry.gg') return 'parry';
    if (host === 'challonge.com' || host === 'www.challonge.com') return 'challonge';
    if (host === 'start.gg' || host.endsWith('.start.gg')) return 'startgg';
    return false;
  } catch (e) {
    return false;
  }
}

function tournamentExternalUrl(event) {
  if (event.tournamentUrl && externalProvider(event.tournamentUrl)) return event.tournamentUrl;
  const provider = event.provider || externalProvider(event.url);
  if (provider === 'parry' && event.url) {
    const parsed = new URL(event.url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length) return `https://parry.gg/${parts[0]}`;
  }
  if (provider === 'startgg' && event.url) {
    const match = event.url.match(/^(https?:\/\/(?:www\.)?start\.gg\/tournament\/[^/?#]+)/i);
    if (match) return match[1];
  }
  if (provider === 'challonge' && event.url) return event.url;
  if (!provider && event.tournamentSlug) {
    return `https://www.start.gg/tournament/${encodeURIComponent(event.tournamentSlug)}`;
  }
  return '';
}

let eventsIndex = [];
let playerDirectory = [];
let communitySocials = {};
let activeCommunities = [
  { slug: 'rivals-2', name: 'Rivals 2', abbr: 'R2' },
  { slug: 'ultimate', name: 'Ultimate', abbr: 'U' },
  { slug: 'project-plus', name: 'Project+', abbr: 'P+' },
  { slug: 'rivals-of-aether', name: 'Rivals of Aether', abbr: 'RoA' },
  { slug: 'melee', name: 'Melee', abbr: 'M' }
];
const communityCardGroups = [
  { games: [{ slug: 'ultimate' }], accent: '--game-ultimate', art: 'assets/hubs/ultimate.webp' },
  { games: [{ slug: 'melee' }, { slug: 'project-plus' }], accent: '--game-melee', art: 'assets/renders/melee/full/captain-falcon.webp' },
  { games: [{ slug: 'rivals-of-aether' }, { slug: 'rivals-2' }], accent: '--game-rivals-of-aether', art: 'assets/hubs/rivals-2.webp' }
];

// Cache for event details to prevent fetching the same tournament JSON multiple times across sections
const eventDetailsCache = new Map();

async function getTournamentDetail(slug) {
  if (!slug) return null;
  if (!eventDetailsCache.has(slug)) {
    try {
      const res = await fetch(`data/events/${encodeURIComponent(slug)}.json`);
      if (res.ok) {
        eventDetailsCache.set(slug, await res.json());
      } else {
        eventDetailsCache.set(slug, null);
      }
    } catch (e) {
      eventDetailsCache.set(slug, null);
    }
  }
  return eventDetailsCache.get(slug);
}

async function initHome() {
  try {
    const [eventsRes, playersRes, socialsRes] = await Promise.all([
      fetch('data/events-index.json', { cache: 'no-store' }),
      fetch('data/profiles/index.json', { cache: 'no-store' }),
      fetch('data/community_socials.json', { cache: 'no-store' })
    ]);

    if (eventsRes.ok) {
      eventsIndex = await eventsRes.json();
    }
    if (playersRes.ok) {
      playerDirectory = await playersRes.json();
    }
    if (socialsRes.ok) communitySocials = await socialsRes.json();

    renderStats();
    renderUpcomingEvents();
    renderCommunityPanel();
    await renderRecentResults();
    await renderOnThisWeek();
    await renderTopPlayers();
    await renderRivalry();
    setupSearch();

    // Set synced timestamp
    const syncedEl = $('#synced');
    if (syncedEl) {
      syncedEl.textContent = new Date().toLocaleDateString(window.i18n?.getLang() === 'es' ? 'es-UY' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (err) {
    console.error('Error loading homepage data:', err);
  }
}

// 1. Stats strip
function renderStats() {
  const statsContainer = $('#stats');
  if (!statsContainer) return;

  const totalPlayers = playerDirectory.length || 0;

  // Group events by tournament slug or title to count distinct tournaments
  const uniqueTournaments = new Set(eventsIndex.map(e => e.tournamentSlug || e.tournament).filter(Boolean));
  const totalTournaments = uniqueTournaments.size || eventsIndex.length;

  // Crossover players: players participating in 2 or more games
  const crossoverCount = playerDirectory.filter(p => (p.games || []).length >= 2).length;

  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const stats = [
    { label: isEs ? 'JUGADORES' : 'PLAYERS', value: totalPlayers.toLocaleString(), sub: isEs ? `en ${activeCommunities.length} comunidades` : `across ${activeCommunities.length} communities`, href: 'players.html' },
    { label: isEs ? 'TORNEOS' : 'TOURNAMENTS', value: totalTournaments.toLocaleString(), sub: isEs ? 'registrados en start.gg' : 'indexed from start.gg', href: 'events.html' },
    { label: isEs ? 'JUEGOS' : 'GAMES', value: activeCommunities.length.toString(), sub: isEs ? 'platform fighters activos' : 'platform fighters active', href: '#communities' },
    { label: isEs ? 'JUGADORES CROSSOVER' : 'CROSSOVER PLAYERS', value: crossoverCount.toLocaleString(), sub: isEs ? 'compiten en 2+ juegos' : 'compete in 2+ games' }
  ];

  statsContainer.innerHTML = stats.map(s => {
    const tag = s.href ? 'a' : 'div';
    const hrefAttr = s.href ? ` href="${esc(s.href)}"` : '';
    const linkClass = s.href ? ' stat-link' : '';
    return `
      <${tag} class="tile glass${linkClass}"${hrefAttr}>
        <div class="label">${esc(s.label)}</div>
        <div class="val">${esc(s.value)}</div>
        <div class="sub">${esc(s.sub)}</div>
      </${tag}>
    `;
  }).join('');
}

// 2. Upcoming Events
function renderUpcomingEvents() {
  const container = $('#events-grid');
  if (!container) return;

  const todayIso = new Date().toISOString().split('T')[0];

  // Group tournaments like events.js
  const grouped = new Map();
  eventsIndex.forEach(event => {
    const key = event.displaySeparately ? `event:${event.id || event.url}` : (event.tournamentSlug || (event.tournament || '').toLowerCase());
    if (!grouped.has(key)) {
      grouped.set(key, {
        tournament: event.tournament,
        tournamentSlug: event.tournamentSlug,
        image: event.image || '',
        provider: event.provider || externalProvider(event.url) || 'internal',
        tournamentUrl: event.tournamentUrl || '',
        date: event.date,
        isTemporary: !!event.isTemporary,
        hasTakenPlace: event.hasTakenPlace,
        online: !!event.online,
        startggUrl: tournamentExternalUrl(event),
        games: new Map(),
        entrants: event.entrants || 0
      });
    }
    const t = grouped.get(key);
    if (event.online) t.online = true;
    if (event.isTemporary) t.isTemporary = true;
    if (event.hasTakenPlace !== undefined) {
      if (t.hasTakenPlace === undefined || event.hasTakenPlace === false) {
        t.hasTakenPlace = event.hasTakenPlace;
      }
    }
    if (event.game) {
      const gSlug = event.gameSlug || event.game;
      if (!t.games.has(gSlug)) {
        t.games.set(gSlug, { slug: event.gameSlug, name: event.game, url: event.url || '' });
      } else if (!t.games.get(gSlug).url && event.url) {
        t.games.get(gSlug).url = event.url;
      }
    }
    if (!t.date || (event.date && event.date < t.date)) t.date = event.date;
    if (event.entrants && event.entrants > t.entrants) t.entrants = event.entrants;
  });

  const tournaments = [...grouped.values()];
  const upcoming = tournaments.filter(t => {
    const takenPlace = t.hasTakenPlace !== undefined
      ? t.hasTakenPlace
      : (t.date ? t.date <= todayIso : true);
    return !takenPlace;
  }).sort((a, b) => (a.date || '').localeCompare(b.date || '') || collator.compare(a.tournament, b.tournament));
  if (!upcoming.length) {
    container.innerHTML = `<p class="empty-notice">${esc(window.i18n?.t('home.empty.upcoming') || 'No upcoming tournaments currently scheduled. Check back soon or view past events!')}</p>`;
    return;
  }

  container.innerHTML = upcoming.map((e, i) => {
    const dt = e.date ? new Date(`${e.date}T00:00:00`) : new Date();
    const day = dt.getDate();
    const locale = window.i18n?.getLang() === 'es' ? 'es-UY' : 'en-US';
    const weekday = dt.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase();
    const month = dt.toLocaleDateString(locale, { month: 'short' }).toUpperCase();
    const gameNames = [...e.games.values()].map(g => g.name).join(' · ');

    // Link a single-game card to its event bracket and a multi-game card to its tournament page.
    let externalUrl = '';
    const gamesList = [...e.games.values()];
    if (gamesList.length === 1 && gamesList[0].url && externalProvider(gamesList[0].url)) {
      externalUrl = gamesList[0].url;
    } else if (e.startggUrl && externalProvider(e.startggUrl)) {
      externalUrl = e.startggUrl;
    } else {
      externalUrl = gamesList.find(g => g.url && externalProvider(g.url))?.url || '';
    }

    const isExternal = Boolean(externalUrl);
    const linkUrl = externalUrl || (e.tournamentSlug ? `event.html?tournament=${encodeURIComponent(e.tournamentSlug)}` : 'events.html');
    const targetAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';

    return `
      <a class="event glass" href="${esc(linkUrl)}"${targetAttrs}>
        <div class="datebox">
          <div class="mono muted">${weekday}</div>
          <div class="day">${day}</div>
          <div class="mono muted">${month}</div>
        </div>
        ${e.image ? `<span class="home-event-avatar${e.provider === 'parry' ? ' home-event-avatar-parry' : ''}"><img src="${esc(e.image)}" alt="" loading="lazy"></span>` : ''}
        <div class="info">
          ${i === 0 ? `<span class="next">${esc(window.i18n?.t('home.event.next') || 'NEXT')}</span>` : ''}
          <b>${esc(e.tournament)}</b>
          <span class="muted">${esc(gameNames || 'Platform Fighter')}</span>
        </div>
        ${e.online ? '<span class="online-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 8.8a17 17 0 0 1 22 0M4.5 12.4a12 12 0 0 1 15 0M8.5 16a6.5 6.5 0 0 1 7 0M12 19h.01"/></svg><span>Online</span></span>' : ''}
      </a>
    `;
  }).join('');
}

// 3. Recent results (grouped by tournament)
async function renderRecentResults() {
  const container = $('#results');
  if (!container) return;

  const RECENT_TOURNAMENT_LIMIT = 5;
  const todayIso = new Date().toISOString().split('T')[0];

  // Group completed events into tournament rows while retaining each event as a game line.
  const grouped = new Map();
  eventsIndex.forEach(event => {
    const name = (event.tournament || '').trim();
    const date = event.date || '';
    const identity = event.tournamentSlug || `${name.toLowerCase()}::${date}`;
    const tournamentKey = event.displaySeparately ? `event:${event.id || event.url || identity}` : identity;

    const takenPlace = event.hasTakenPlace !== undefined
      ? event.hasTakenPlace
      : (event.date ? event.date <= todayIso : true);

    if (takenPlace && !event.isTemporary) {
      if (!grouped.has(tournamentKey)) {
        grouped.set(tournamentKey, {
          key: tournamentKey,
          tournament: name,
          tournamentSlug: event.tournamentSlug,
          date,
          games: []
        });
      }

      const tournament = grouped.get(tournamentKey);
      const gameKey = (event.gameSlug || event.game || 'default').toLowerCase();
      const existingGame = tournament.games.find(game => game.key === gameKey);
      if (!existingGame) {
        tournament.games.push({
          key: gameKey,
          game: event.game || 'Platform Fighter',
          gameSlug: event.gameSlug || '',
          entrants: event.entrants || 0,
          tournamentSlug: event.tournamentSlug,
          sourceEventId: event.id || event.url || ''
        });
      } else if (event.entrants && event.entrants > existingGame.entrants) {
        existingGame.entrants = event.entrants;
      }
    }
  });

  const completed = [...grouped.values()]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, RECENT_TOURNAMENT_LIMIT);

  if (!completed.length) {
    container.innerHTML = `<p class="empty-notice">${esc(window.i18n?.t('home.empty.results') || 'No recent results found.')}</p>`;
    return;
  }

  const gameOrder = new Map(activeCommunities.map((community, index) => [community.slug, index]));
  const resultsWithWinners = await Promise.all(completed.map(async tournament => {
    let detail = null;
    if (tournament.tournamentSlug) {
      try {
        detail = await getTournamentDetail(tournament.tournamentSlug);
      } catch (e) {
        // Keep the event-index information when tournament details are unavailable.
      }
    }

    const detailGames = detail?.subEvents || [];
    const games = tournament.games.map(game => {
      const sub = detailGames.find(item => {
        const detailSlug = (item.gameSlug || item.game || '').toLowerCase();
        return (game.gameSlug && detailSlug === game.gameSlug.toLowerCase()) ||
          detailSlug === game.game.toLowerCase();
      });
      const first = (sub?.standings || []).find(standing => Number(standing.placement) === 1);
      const winnerTag = first?.tag || '—';
      const normalizedWinner = winnerTag.trim().replace(/\s+/g, ' ').toLowerCase();
      const directoryWinner = first?.playerId ? null : playerDirectory.find(player =>
        String(player.tag || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedWinner
      );
      const winnerId = first?.playerId || directoryWinner?.playerId || null;
      return {
        ...game,
        entrants: sub?.entrants || game.entrants,
        winner: winnerId ? winnerTag : '—',
        winnerId
      };
    });
    games.sort((a, b) => (gameOrder.get(a.gameSlug) ?? Number.MAX_SAFE_INTEGER) -
      (gameOrder.get(b.gameSlug) ?? Number.MAX_SAFE_INTEGER) || collator.compare(a.game, b.game));
    return { ...tournament, games };
  }));

  const tournamentRows = resultsWithWinners.map(tournament => {
    const tournamentUrl = tournament.tournamentSlug
      ? `event.html?tournament=${encodeURIComponent(tournament.tournamentSlug)}`
      : 'events.html';
    const gameRows = tournament.games.map(game => {
      const winnerHtml = game.winnerId
        ? `<a class="home-result-winner" href="player.html?player=${encodeURIComponent(game.winnerId)}">${esc(game.winner)}</a>`
        : `<span class="home-result-winner">—</span>`;
      const entrants = game.entrants ? `${esc(game.entrants)} ${window.i18n?.getLang?.() === 'es' ? 'participantes' : 'entrants'}` : '—';
      return renderHomeGameLine(game.game, winnerHtml, `<small>${entrants}</small>`);
    }).join('');
    return `<article class="home-result-row"><div class="home-result-tournament"><a class="home-result-title" href="${esc(tournamentUrl)}">${esc(tournament.tournament)}</a><small>${fmt(tournament.date)}</small></div><div class="home-result-games">${gameRows}</div></article>`;
  }).join('');
  container.innerHTML = `<div class="home-result-list">${tournamentRows}</div>`;
}

// 4. On this week
async function renderOnThisWeek() {
  const container = $('#history');
  const subtitle = $('#history-sub-text');
  if (!container) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - 3);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 3);
  const locale = window.i18n?.getLang() === 'es' ? 'es-UY' : 'en-US';
  const weekRange = `${startOfWeek.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;
  const updateSubtitle = () => {
    const isSpanish = window.i18n?.getLang() === 'es';
    if (subtitle) subtitle.textContent = `${weekRange}, ${isSpanish ? 'en años anteriores' : 'in past years'}`;
  };
  updateSubtitle();
  if (subtitle && window.i18n?.onChange && !subtitle.dataset.langListener) {
    subtitle.dataset.langListener = '1';
    window.i18n.onChange(updateSubtitle);
  }

  const currentYear = now.getFullYear();

  // Match events that occurred in the calendar week (+/- 3 days) in past years
  const matchingEvents = eventsIndex.filter(e => {
    if (!e.date || e.isTemporary) return false;
    const parts = e.date.split('-');
    if (parts.length < 3) return false;
    const year = parseInt(parts[0], 10);
    if (year >= currentYear) return false;

    // Project the event month/day onto the local calendar window. If needed, the
    // next-year date handles a window that crosses December/January.
    let anniversary = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (anniversary < startOfWeek) {
      anniversary = new Date(currentYear + 1, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return anniversary >= startOfWeek && anniversary <= endOfWeek;
  });

  if (!matchingEvents.length) {
    container.innerHTML = `<p class="empty-notice">${esc(window.i18n?.t('home.empty.history') || 'No tournaments were played during this week in past years.')}</p>`;
    return;
  }

  // Group tournaments and collect all events if multiple sub-entries
  const groupedTournaments = new Map();
  matchingEvents.forEach(e => {
    const key = e.tournamentSlug || e.tournament;
    if (!groupedTournaments.has(key)) {
      const year = parseInt(e.date.split('-')[0], 10);
      groupedTournaments.set(key, {
        year,
        date: e.date,
        tournament: e.tournament,
        slug: e.tournamentSlug,
        games: new Map(),
        entrants: e.entrants || 0
      });
    } else {
      const item = groupedTournaments.get(key);
      if (e.entrants && e.entrants > item.entrants) {
        item.entrants = e.entrants;
      }
    }
    const item = groupedTournaments.get(key);
    if (e.game) {
      const gameKey = (e.gameSlug || e.game).toLowerCase();
      if (!item.games.has(gameKey)) {
        item.games.set(gameKey, { game: e.game, gameSlug: e.gameSlug || '', entrants: e.entrants || 0 });
      } else if (e.entrants && e.entrants > item.games.get(gameKey).entrants) {
        item.games.get(gameKey).entrants = e.entrants;
      }
    }
  });

  const items = [...groupedTournaments.values()];
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Fetch canonical totals and per-game entrant counts from tournament details.
  await Promise.all(items.map(async h => {
    if (h.slug) {
      try {
        const detail = await getTournamentDetail(h.slug);
        if (detail && typeof detail.totalEntrants === 'number') {
          h.entrants = detail.totalEntrants;
        }
        h.subEvents = detail?.subEvents || [];
      } catch (e) {
        // Fallback gracefully
      }
    }
    h.subEvents ||= [];
  }));

  const getSubEvent = (h, game) => h.subEvents.find(item => {
    const detailSlug = (item.gameSlug || item.game || '').toLowerCase();
    return (game.gameSlug && detailSlug === game.gameSlug.toLowerCase()) || detailSlug === game.game.toLowerCase();
  });
  const hasPerGameEntrants = items.some(h => [...h.games.values()].some(game =>
    Number(getSubEvent(h, game)?.entrants || game.entrants) > 0
  ));

  const historyRows = items.map(h => {
    const tourneyUrl = h.slug ? `event.html?tournament=${encodeURIComponent(h.slug)}` : 'events.html';
    const games = [...h.games.values()];
    const gameLines = games.map(game => {
      const sub = getSubEvent(h, game);
      const firstPlace = (sub?.standings || []).find(standing => Number(standing.placement) === 1);
      const winnerTag = firstPlace?.tag || '';
      const normalizedTag = winnerTag.trim().replace(/\s+/g, ' ').toLowerCase();
      const directoryPlayer = firstPlace?.playerId ? null : playerDirectory.find(player =>
        String(player.tag || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTag
      );
      const playerId = firstPlace?.playerId || directoryPlayer?.playerId;
      const winner = winnerTag && playerId
        ? `<a class="home-result-winner" href="player.html?player=${encodeURIComponent(playerId)}">${esc(winnerTag)}</a>`
        : '<span class="home-result-winner">—</span>';
      const entrants = Number(sub?.entrants || game.entrants) || 0;
      const entrantsHtml = hasPerGameEntrants
        ? `<small>${entrants ? `${entrants} ${window.i18n?.getLang?.() === 'es' ? 'participantes' : 'entrants'}` : '—'}</small>`
        : '';
      return renderHomeGameLine(game.game, winner, entrantsHtml);
    }).join('');
    const dateLabel = h.date ? fmt(h.date) : '';
    const totalLabel = !hasPerGameEntrants && h.entrants
      ? ` · ${h.entrants} ${window.i18n?.getLang?.() === 'es' ? 'participantes' : 'entrants'}`
      : '';

    return `
      <div class="home-result-row home-history-row">
        <span class="mono muted">${h.year}</span>
        <span class="home-result-tournament">
          <a class="home-result-title" href="${esc(tourneyUrl)}">${esc(h.tournament)}</a>
          <small>${esc(dateLabel)}${esc(totalLabel)}</small>
        </span>
        <span class="home-history-mobile-meta mono muted">${esc(dateLabel)}</span>
        <div class="home-result-games home-history-games">${gameLines}</div>
      </div>
    `;
  }).join('');
  container.innerHTML = `<div class="home-result-list home-history-list${hasPerGameEntrants ? ' has-game-entrants' : ''}">${historyRows}</div>`;
}

// Helper for rendering character stock icon
const charSlugAliases = {
  'simon-belmont': 'simon',
  'shovel-knight': 'shovelknight',
  'sheik-zelda': 'sheik',
  'la-reina': 'reina'
};

const charStockSlug = name => {
  const s = slug(name);
  return charSlugAliases[s] || s;
};

function renderStockIcon(gameSlug, charName) {
  const gslug = gameSlug || 'rivals-2';
  const cslug = charStockSlug(charName);
  const initial = charName ? charName[0] : '?';
  return `<span class="stock" title="${esc(charName)}" role="img" aria-label="${esc(charName)}"><i>${esc(initial)}</i><img src="assets/renders/${esc(gslug)}/stocks/${esc(cslug)}.webp" alt="" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='assets/renders/${esc(gslug)}/stocks/other.webp';}else{this.remove();}"></span>`;
}

// 5. Top Players (#1 on latest published Power Ranking or all-time historical fallback)
async function renderTopPlayers() {
  const container = $('#top-players');
  if (!container) return;

  let rankingsIndex = null;
  try {
    const res = await fetch('data/rankings.json', { cache: 'no-store' });
    if (res.ok) {
      rankingsIndex = await res.json();
    }
  } catch (e) {
    // rankingsIndex remains null
  }

  const topPlayers = [];

  for (const comm of activeCommunities) {
    let topPlayerEntry = null;

    // 1. Check published Power Rankings in rankingsIndex
    if (rankingsIndex && rankingsIndex.rankings) {
      // Find matching game key in rankingsIndex (e.g., matching slug or id)
      const gObj = (rankingsIndex.games || []).find(g => g.slug === comm.slug || g.id === comm.slug);
      const rankingKey = gObj?.id || (rankingsIndex.rankings[comm.slug] ? comm.slug : Object.keys(rankingsIndex.rankings).find(k => {
        const item = (rankingsIndex.rankings[k] || [])[0];
        return item && (item.game?.slug === comm.slug || item.gameSlug === comm.slug);
      }));

      const list = rankingKey ? (rankingsIndex.rankings[rankingKey] || []) : [];
      if (list.length > 0) {
        // Identify the most recent Power Ranking by its actual ranking year, not by publication order or creation date
        const parseRankingYear = r => {
          if (r.period?.end) {
            const yr = parseInt(r.period.end.slice(0, 4), 10);
            if (!isNaN(yr)) return yr;
          }
          if (r.end) {
            const yr = parseInt(r.end.slice(0, 4), 10);
            if (!isNaN(yr)) return yr;
          }
          if (r.period?.start) {
            const yr = parseInt(r.period.start.slice(0, 4), 10);
            if (!isNaN(yr)) return yr;
          }
          if (r.start) {
            const yr = parseInt(r.start.slice(0, 4), 10);
            if (!isNaN(yr)) return yr;
          }
          const m = String(r.id || r.name || '').match(/20\d\d/);
          if (m) return parseInt(m[0], 10);
          return 0;
        };

        const sortedByYear = [...list].sort((a, b) => {
          const yearDiff = parseRankingYear(b) - parseRankingYear(a);
          if (yearDiff !== 0) return yearDiff;
          const endA = a.period?.end || a.end || '';
          const endB = b.period?.end || b.end || '';
          return endB.localeCompare(endA);
        });

        const latestRankingMeta = sortedByYear[0];
        if (latestRankingMeta && latestRankingMeta.id) {
          try {
            const artRes = await fetch(`data/rankings/${encodeURIComponent(latestRankingMeta.id)}.json`);
            if (artRes.ok) {
              const art = await artRes.json();
              const p1 = (art.players || []).find(p => Number(p.placement) === 1) || (art.players || [])[0];
              if (p1) {
                topPlayerEntry = {
                  game: comm.name,
                  gameSlug: comm.slug,
                  tag: p1.tag || latestRankingMeta.top || 'Player 1',
                  playerId: p1.playerId,
                  mains: Array.isArray(p1.mains) ? p1.mains : []
                };
              }
            }
          } catch (e) {
            // Fall through to historical
          }
        }
      }
    }

    // 2. Historical ranking fallback if no published Power Rankings found
    if (!topPlayerEntry) {
      try {
        const res = await fetch(`data/rankings/${comm.slug}-glicko2-historical.json`);
        if (res.ok) {
          const data = await res.json();
          // Identify the player with the highest number of points in that historical ranking
          const list = [...(data.rankings || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
          const top = list[0];
          if (top) {
            // Find player mains from profile
            let mains = [];
            const profMatch = playerDirectory.find(p => String(p.playerId) === String(top.playerId) || slug(p.tag) === slug(top.playerTag));
            const pSlug = profMatch?.slug;
            if (pSlug) {
              try {
                const pRes = await fetch(`data/profiles/${encodeURIComponent(pSlug)}.json`);
                if (pRes.ok) {
                  const pJson = await pRes.json();
                  const g = (pJson.games || []).find(x => x.slug === comm.slug || x.id === comm.slug);
                  if (g && Array.isArray(g.characters) && g.characters.length) {
                    mains = g.characters
                      .filter(c => String(c.name || '').toLowerCase() !== 'other')
                      .slice(0, 2)
                      .map(c => c.name);
                  }
                }
              } catch (e) {}
            }

            topPlayerEntry = {
              game: comm.name,
              gameSlug: comm.slug,
              tag: top.playerTag,
              playerId: top.playerId,
              mains
            };
          }
        }
      } catch (e) {
        // Continue
      }
    }

    if (topPlayerEntry) {
      topPlayers.push(topPlayerEntry);
    }
  }

  if (!topPlayers.length) {
    container.innerHTML = `<p class="empty-notice">${esc(window.i18n?.t('home.empty.rankings') || 'Rankings are currently being calculated.')}</p>`;
    return;
  }

  container.innerHTML = topPlayers.map(p => {
    const stockIconsHtml = (p.mains && p.mains.length)
      ? p.mains.map(m => renderStockIcon(p.gameSlug, m)).join('')
      : '';

    return `
      <div class="tr rank">
        <span class="mono gold">#1</span>
        <span>
          <a class="opponent-link" href="player.html?player=${encodeURIComponent(p.playerId)}"><b>${esc(p.tag)}</b></a>
          <small>${esc(p.game)}</small>
        </span>
        <div class="top-player-stocks">
          ${stockIconsHtml}
        </div>
      </div>
    `;
  }).join('');
}

// 6. Rivalry of the Week
async function renderRivalry() {
  const container = $('#rivalry');
  if (!container) return;

  try {
    const res = await fetch('data/rivalry.json', { cache: 'no-store' });
    if (!res.ok) {
      container.style.display = 'none';
      return;
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.players) || data.players.length < 2 || !data.overall) {
      container.style.display = 'none';
      return;
    }

    const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
    const [p1, p2] = data.players;
    const score = data.overall.score || [0, 0];
    const totalSets = data.overall.totalSets ?? (score[0] + score[1]);
    const distinctGames = data.overall.distinctGames ?? (data.games?.length || 1);
    const lastDate = data.overall.lastEncounterDate;
    const weekOfFmt = fmt(data.weekOf);
    const lastEncounterFmt = lastDate ? fmt(lastDate) : null;

    const gamesList = Array.isArray(data.games) ? data.games : [];

    container.style.display = '';
    container.innerHTML = `
      <div class="head mono muted sm0">
        <span>${isEs ? 'RIVALIDAD DE LA SEMANA' : 'FEATURED RIVALRY'}</span>
        <span>${isEs ? `SEMANA DEL ${esc(weekOfFmt)}` : `WEEK OF ${esc(weekOfFmt)}`}</span>
      </div>
      <div class="rival">
        <div class="rival-player">
          <img class="rival-player-photo" src="${esc(p1.photo || 'assets/logo.jpg')}" alt="${esc(p1.tag)}" onerror="this.onerror=null;this.src='assets/logo.jpg';">
          <b><a class="opponent-link" href="player.html?player=${encodeURIComponent(p1.playerId)}">${esc(p1.tag)}</a></b>
        </div>
        <span class="rec">${score[0]}–${score[1]}</span>
        <div class="rival-player">
          <img class="rival-player-photo" src="${esc(p2.photo || 'assets/logo.jpg')}" alt="${esc(p2.tag)}" onerror="this.onerror=null;this.src='assets/logo.jpg';">
          <b><a class="opponent-link" href="player.html?player=${encodeURIComponent(p2.playerId)}">${esc(p2.tag)}</a></b>
        </div>
      </div>
      <p class="muted sm" style="text-align:center;margin:6px 0 10px;">
        ${totalSets} ${isEs ? 'sets en' : 'sets across'} ${distinctGames} ${distinctGames === 1 ? (isEs ? 'juego' : 'game') : (isEs ? 'juegos' : 'games')}
        ${lastEncounterFmt ? ` · ${isEs ? 'Último encuentro' : 'Last match'}: ${esc(lastEncounterFmt)}` : ''}
      </p>
      ${gamesList.map(g => {
        const gScore = g.score || [0, 0];
        return `
          <div class="rg">
            <span>${esc(g.gameName || g.gameId || 'Game')}</span>
            <span class="mono muted">${gScore[0]}–${gScore[1]} (${g.sets} sets)</span>
          </div>
        `;
      }).join('')}
      <div style="margin-top:14px;text-align:center;">
        <a class="link" href="head-to-head.html?p1=${encodeURIComponent(p1.playerId)}&amp;p2=${encodeURIComponent(p2.playerId)}">${isEs ? 'Ver enfrentamiento completo' : 'See head-to-head'}</a>
      </div>
    `;
  } catch (err) {
    console.warn('Could not render rivalry of the week:', err);
    container.style.display = 'none';
  }
}

// 7. Combined community and newcomer panel
function renderCommunityPanel() {
  const container = $('#community-cards');
  const accordion = $('#newcomer-accordion');
  if (!container || !accordion) return;
  const t = (key, params) => window.i18n?.t(key, params) || key;
  const icons = {
    whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.64c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.15.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.11-.23-.17-.48-.3z"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.011 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`
  };
  const socialNames = ['whatsapp', 'discord', 'instagram'];
  const socialLabel = key => t(`home.communities.social.${key}`);
  const getLink = (game, key) => {
    const value = communitySocials[game.slug]?.[key];
    if (typeof value === 'string') return value.trim();
    return value?.enabled !== false && value?.url ? value.url.trim() : '';
  };
  const gameName = gameSlug => activeCommunities.find(game => game.slug === gameSlug)?.name || gameSlug;
  const playerCount = gameSlug => playerDirectory.filter(player =>
    (player.games || []).some(game => (game.slug || game.id) === gameSlug)
  ).length;

  container.innerHTML = communityCardGroups.map(group => {
    const firstGame = group.games[0];
    const names = group.games.map(game => gameName(game.slug));
    const spokenTitle = names.join(` ${t('home.communities.and')} `);
    const gameLinks = group.games.map((game, index) => `${index ? '<span class="community-title-join" aria-hidden="true">&</span>' : ''}<a class="community-game-link" href="rankings.html?game=${encodeURIComponent(game.slug)}">${esc(gameName(game.slug))}</a>`).join('');
    const counts = group.games.length === 1
      ? t('home.communities.playersSingle', { n: playerCount(firstGame.slug) })
      : t('home.communities.playersGrouped', {
        a: playerCount(group.games[0].slug), gameA: gameName(group.games[0].slug),
        b: playerCount(group.games[1].slug), gameB: gameName(group.games[1].slug)
      });
    const buttons = socialNames.map(key => {
      const url = getLink(firstGame, key);
      if (!url) return '';
      return `<a class="community-social-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(spokenTitle)} ${esc(socialLabel(key))}" title="${esc(socialLabel(key))}">${icons[key]}</a>`;
    }).join('');
    return `<article class="community-card glass" style="--group-accent:var(${group.accent})">${group.art ? `<img class="community-card-art" src="${esc(group.art)}" alt="" loading="lazy">` : ''}
      <div class="community-card-content"><div class="community-card-top"><div class="community-card-title"><div class="community-game-links">${gameLinks}</div><div class="community-player-counts">${esc(counts)}</div></div></div>
      <div class="community-social-links">${buttons}</div></div>
    </article>`;
  }).join('');

  const questions = ['q1', 'q2', 'q3', 'q4'];
  accordion.innerHTML = questions.map((key, index) => `<div class="newcomer-accordion-item">
    <button class="newcomer-question" type="button" aria-expanded="false" aria-controls="newcomer-answer-${index}" id="newcomer-question-${index}">
      <span>${esc(t(`home.newcomer.${key}`))}</span><svg class="newcomer-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
    </button>
    <div class="newcomer-answer" id="newcomer-answer-${index}" role="region" aria-labelledby="newcomer-question-${index}" hidden>${esc(t(`home.newcomer.${key}Answer`))}</div>
  </div>`).join('');
  accordion.querySelectorAll('.newcomer-question').forEach(button => button.addEventListener('click', () => {
    accordion.querySelectorAll('.newcomer-question').forEach(other => {
      const open = other === button && other.getAttribute('aria-expanded') !== 'true';
      other.setAttribute('aria-expanded', String(open));
      accordion.querySelector(`#${other.getAttribute('aria-controls')}`).hidden = !open;
    });
  }));
}

// 9. Live Player & Event Search
function setupSearch() {
  const searchInput = $('#global-search');
  const searchForm = $('#search-form');
  if (!searchInput || !searchForm) return;

  // Create search results dropdown
  let resultsBox = document.createElement('div');
  resultsBox.className = 'search-results';
  resultsBox.hidden = true;
  // Ensure wheel events inside the dropdown scroll the results box, preventing page scroll chaining
  resultsBox.addEventListener('wheel', e => {
    e.stopPropagation();
  }, { passive: false });
  searchForm.appendChild(resultsBox);

  function handleSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) {
      resultsBox.hidden = true;
      resultsBox.innerHTML = '';
      return;
    }

    // Match players
    const matchingPlayers = playerDirectory.filter(p => {
      const tag = (p.tag || '').toLowerCase();
      const sponsor = (p.sponsor || '').toLowerCase();
      return tag.includes(q) || sponsor.includes(q);
    }).slice(0, 5);

    // Match tournaments
    const matchingEvents = eventsIndex.filter(e => {
      const name = (e.tournament || '').toLowerCase();
      return name.includes(q);
    }).slice(0, 4);

    if (!matchingPlayers.length && !matchingEvents.length) {
      resultsBox.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">${esc(window.i18n?.t('home.search.noResults') || 'No matching players or events found.')}</div>`;
      resultsBox.hidden = false;
      return;
    }

    let html = '';

    if (matchingPlayers.length) {
      html += `<div style="padding:6px 10px;font:11px 'JetBrains Mono',monospace;color:var(--muted)">PLAYERS</div>`;
      matchingPlayers.forEach(p => {
        const gamesStr = (p.games || []).map(g => g.name).join(' · ') || 'Player';
        html += `
          <a class="search-item" href="player.html?player=${encodeURIComponent(p.playerId)}">
            <span class="search-item-info">
              <span class="search-item-title">${p.sponsor ? `<span class="mono muted">[${esc(p.sponsor)}]</span> ` : ''}${esc(p.tag)}</span>
              <span class="search-item-sub">${esc(gamesStr)}</span>
            </span>
            <span class="search-item-tag">${(p.games || []).length} game${(p.games || []).length === 1 ? '' : 's'}</span>
          </a>
        `;
      });
    }

    if (matchingEvents.length) {
      html += `<div style="padding:6px 10px 4px;margin-top:4px;border-top:1px solid var(--line);font:11px 'JetBrains Mono',monospace;color:var(--muted)">TOURNAMENTS</div>`;
      matchingEvents.forEach(e => {
        const tourneyUrl = e.tournamentSlug ? `event.html?tournament=${encodeURIComponent(e.tournamentSlug)}` : 'events.html';
        html += `
          <a class="search-item" href="${esc(tourneyUrl)}">
            <span class="search-item-info">
              <span class="search-item-title">${esc(e.tournament)}</span>
              <span class="search-item-sub">${esc(e.game || '')}${e.date ? ` · ${fmt(e.date)}` : ''}</span>
            </span>
            <span class="search-item-tag">EVENT</span>
          </a>
        `;
      });
    }

    resultsBox.innerHTML = html;
    resultsBox.hidden = false;
  }

  searchInput.addEventListener('input', handleSearch);
  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const firstLink = resultsBox.querySelector('a.search-item');
    if (firstLink) firstLink.click();
  });

  // Hide on click outside
  document.addEventListener('click', e => {
    if (!searchForm.contains(e.target)) {
      resultsBox.hidden = true;
    }
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) {
      resultsBox.hidden = false;
    }
  });
}

if (window.i18n && window.i18n.onChange) {
  window.i18n.onChange(async () => {
    renderStats();
    renderUpcomingEvents();
    renderCommunityPanel();
    await renderRecentResults();
    await renderOnThisWeek();
    await renderTopPlayers();
    await renderRivalry();
  });
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHome);
} else {
  initHome();
}
