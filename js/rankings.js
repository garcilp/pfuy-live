const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Default games fallback if API is unavailable
const DEFAULT_GAMES = [
  { slug: 'melee', name: 'Melee' },
  { slug: 'project-plus', name: 'Project+' },
  { slug: 'rivals-2', name: 'Rivals 2' },
  { slug: 'rivals-of-aether', name: 'Rivals of Aether' },
  { slug: 'ultimate', name: 'Ultimate' }
];

let availableGames = [...DEFAULT_GAMES].sort((a, b) => a.name.localeCompare(b.name));
let currentData = null;
let comparisonData = {};
let sortCol = 'rank';
let sortAsc = true;
let visibleCount = 25;
const batchSize = 25;
let currentRequestId = 0;
let activeFetchController = null;
let scrollObserver = null;

// URL State Sync
function getStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  let section = params.get('section') || '';
  let system = params.get('system') || '';

  // Backward compatibility & aliases
  if (system === 'custom' || system === 'power_rankings' || section === 'power_rankings' || section === 'pr_creator') {
    section = 'power_rankings';
    system = 'custom';
  } else if (section === 'historical' || section === 'archive' || system === 'historical' || system === 'archive') {
    section = 'historical';
    system = 'historical';
  } else if (section === 'systems' || section === 'ranked-systems') {
    section = 'systems';
    if (!system) system = 'overview';
  } else if (system && !section) {
    section = 'systems';
  } else if (!section) {
    section = 'historical';
    system = 'historical';
  }

  return {
    section,
    game: params.get('game') || 'ultimate',
    system: system || 'historical',
    mode: params.get('mode') || 'historical',
    start: params.get('start') || '',
    end: params.get('end') || '',
    search: params.get('search') || '',
    player: params.get('player') || ''
  };
}

function updateURLState(state) {
  const params = new URLSearchParams();
  if (state.section && state.section !== 'historical') params.set('section', state.section);
  if (state.section === 'historical') {
    const hash = window.location.hash || '';
    const newSearch = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newSearch + hash);
    return;
  }
  if (state.game && state.game !== 'ultimate') params.set('game', state.game);
  if (state.system && state.system !== 'overview') params.set('system', state.system);
  if (state.mode && state.mode !== 'historical') params.set('mode', state.mode);
  if (state.start) params.set('start', state.start);
  if (state.end) params.set('end', state.end);
  if (state.search) params.set('search', state.search);
  if (state.player) params.set('player', state.player);

  const newSearch = params.toString() ? `?${params.toString()}` : window.location.pathname;
  window.history.replaceState({}, '', newSearch);
}

// Elements
const gameFilter = $('#game-filter');
const modeFilter = $('#mode-filter');
const startDateInput = $('#start-date-input');
const endDateInput = $('#end-date-input');
const playerSearch = $('#player-search');
const rankingStatus = $('#ranking-status');
const rankingsContent = $('#rankings-content');
const diagnosticModal = $('#diagnostic-modal');
const modalCloseBtn = $('#modal-close-btn');
const modalPlayerInfo = $('#modal-player-info');
const modalBody = $('#modal-body');
const breadcrumbNav = $('#ranking-breadcrumbs');

let activeSection = 'historical';
let activeSubsection = 'historical';

// Helper to get descriptive names for system tabs
function getSystemNames() {
  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  return {
    overview: isEs ? 'Resumen' : 'Overview',
    glicko2: 'Glicko-2',
    sof: isEs ? 'Fuerza de Campo' : 'Strength of Field',
    quality_wins: isEs ? 'Victorias de Calidad' : 'Quality Wins',
    loss_quality: isEs ? 'Consistencia' : 'Consistency',
    custom: isEs ? 'Fórmula Personalizada' : 'Custom Formula'
  };
}

function renderSystemTabsNav() {
  if (activeSection !== 'systems') return '';
  const names = getSystemNames();
  return `
    <nav id="system-tabs" class="ranking-subsection-tabs" aria-label="Ranking Systems Subsections">
      <button class="ranking-tab ${activeSubsection === 'overview' ? 'active' : ''}" data-system="overview">${names.overview}</button>
      <button class="ranking-tab ${activeSubsection === 'glicko2' ? 'active' : ''}" data-system="glicko2">${names.glicko2}</button>
      <button class="ranking-tab ${activeSubsection === 'sof' ? 'active' : ''}" data-system="sof">${names.sof}</button>
      <button class="ranking-tab ${activeSubsection === 'quality_wins' ? 'active' : ''}" data-system="quality_wins">${names.quality_wins}</button>
      <button class="ranking-tab ${activeSubsection === 'loss_quality' ? 'active' : ''}" data-system="loss_quality">${names.loss_quality}</button>
    </nav>
  `;
}

function bindSystemTabsEvents() {
  $$('#system-tabs .ranking-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const sys = btn.dataset.system;
      window.navigateToSection('systems', sys);
    });
  });
}

function updateBreadcrumbsAndNav() {
  // Update section tabs highlight
  $$('.ranking-section-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === activeSection);
  });

  // Update active subsection tab highlight (if present in DOM)
  $$('.ranking-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.system === activeSubsection);
  });

  // Render breadcrumbs
  if (breadcrumbNav) {
    const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
    if (activeSection === 'power_rankings') {
      const prTitle = (window.i18n && window.i18n.t) ? window.i18n.t('rankings.tab.powerRankings') : (isEs ? 'Creador de PR' : 'PR Creator');
      breadcrumbNav.innerHTML = `
        <a href="rankings.html" onclick="event.preventDefault(); window.navigateToSection('historical');">Rankings</a>
        <span class="sep">/</span>
        <span class="current">${esc(prTitle)}</span>
      `;
    } else if (activeSection === 'historical') {
      const histTitle = (window.i18n && window.i18n.t) ? window.i18n.t('rankings.tab.historical') : (isEs ? 'Archivo de Rankings' : 'Rankings Archive');
      breadcrumbNav.innerHTML = `
        <a href="rankings.html" onclick="event.preventDefault(); window.navigateToSection('historical');">Rankings</a>
        <span class="sep">/</span>
        <span class="current">${esc(histTitle)}</span>
      `;
    } else {
      const sysTitle = (window.i18n && window.i18n.t) ? window.i18n.t('rankings.tab.systems') : (isEs ? 'Sistemas de Ranking' : 'Ranked Systems');
      const names = getSystemNames();
      const subName = names[activeSubsection] || activeSubsection;
      breadcrumbNav.innerHTML = `
        <a href="rankings.html" onclick="event.preventDefault(); window.navigateToSection('historical');">Rankings</a>
        <span class="sep">/</span>
        <a href="rankings.html?section=systems&system=overview" onclick="event.preventDefault(); window.navigateToSection('systems', 'overview');">${esc(sysTitle)}</a>
        <span class="sep">/</span>
        <span class="current">${esc(subName)}</span>
      `;
    }
  }
}

if (window.i18n && window.i18n.onChange) {
  window.i18n.onChange(() => {
    updateBreadcrumbsAndNav();
    if (activeSection === 'historical') {
      renderHistoricalRankings();
    } else {
      render();
    }
  });
}

window.navigateToSection = function(section, subsection = null) {
  activeSection = section;
  if (section === 'power_rankings') {
    activeSubsection = 'custom';
  } else if (section === 'historical') {
    activeSubsection = 'historical';
  } else {
    activeSubsection = subsection || (activeSubsection === 'custom' || activeSubsection === 'historical' ? 'overview' : activeSubsection);
  }
  updateBreadcrumbsAndNav();
  visibleCount = batchSize;
  const state = getCurrentFilterState();
  updateURLState(state);
  loadData();
};

// Initialize
async function init() {
  const state = getStateFromURL();
  activeSection = state.section;
  activeSubsection = state.system;

  if (window.PRBadges) {
    window.PRBadges.loadAllRankings().catch(e => console.warn(e));
  }

  // Load available games (prefer static data/games.json for published site, fallback to DEFAULT_GAMES)
  try {
    const res = await fetch('data/games.json');
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length) {
        availableGames = json.map(g => ({ slug: g.slug || g.id, name: g.name }));
      }
    }
  } catch (err) {
    // Fallback to DEFAULT_GAMES
  }

  // Sort available games alphabetically
  availableGames.sort((a, b) => a.name.localeCompare(b.name));

  // Populate game filter
  gameFilter.innerHTML = availableGames.map(g =>
    `<option value="${esc(g.slug)}"${g.slug === state.game ? ' selected' : ''}>${esc(g.name)}</option>`
  ).join('');

  // Set initial filter inputs
  modeFilter.value = state.mode;
  startDateInput.value = state.start;
  endDateInput.value = state.end;
  playerSearch.value = state.search;

  syncDateInputsDisabledState();
  updateBreadcrumbsAndNav();

  // Add event listeners
  gameFilter.addEventListener('change', onFilterChange);
  modeFilter.addEventListener('change', onFilterChange);
  startDateInput.addEventListener('change', onFilterChange);
  startDateInput.addEventListener('input', onFilterChange);
  endDateInput.addEventListener('change', onFilterChange);
  endDateInput.addEventListener('input', onFilterChange);

  playerSearch.addEventListener('input', () => {
    visibleCount = batchSize;
    const state = getCurrentFilterState();
    updateURLState(state);
    render();
  });

  $$('.ranking-section-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      window.navigateToSection(sec);
    });
  });


  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const today = new Date().toISOString().split('T')[0];
      if (preset === 'all') {
        modeFilter.value = 'historical';
        startDateInput.value = '';
        endDateInput.value = '';
      } else {
        if (modeFilter.value === 'historical') {
          modeFilter.value = 'period_only';
        }
        if (preset === '2025') {
          startDateInput.value = '2025-01-01';
          endDateInput.value = '2025-12-31';
        } else if (preset === '2024') {
          startDateInput.value = '2024-01-01';
          endDateInput.value = '2024-12-31';
        } else if (preset === '6m') {
          const d = new Date();
          d.setMonth(d.getMonth() - 6);
          startDateInput.value = d.toISOString().split('T')[0];
          endDateInput.value = today;
        }
      }
      onFilterChange();
    });
  });

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => closeDiagnosticModal());
  }

  if (diagnosticModal) {
    // Close on backdrop click
    diagnosticModal.addEventListener('click', (e) => {
      const rect = diagnosticModal.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
                          rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) {
        closeDiagnosticModal();
      }
    });

    // Close on Escape & trap tab focus
    diagnosticModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDiagnosticModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = diagnosticModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    });
  }

  window.addEventListener('hashchange', () => {
    if (activeSection === 'historical') {
      renderHistoricalRankings();
    }
  });

  await loadData();

  if (state.player) {
    openDiagnosticModal(state.player);
  }
}

function getActiveSystem() {
  if (activeSection === 'power_rankings') return 'custom';
  if (activeSection === 'historical') return 'historical';
  return activeSubsection || 'overview';
}

function syncDateInputsDisabledState() {
  const isHistorical = modeFilter.value === 'historical';
  startDateInput.disabled = isHistorical;
  endDateInput.disabled = isHistorical;
}

function getCurrentFilterState() {
  const isHistorical = modeFilter.value === 'historical';
  return {
    section: activeSection,
    game: gameFilter.value,
    system: getActiveSystem(),
    mode: modeFilter.value,
    start: isHistorical ? '' : startDateInput.value,
    end: isHistorical ? '' : endDateInput.value,
    search: playerSearch.value.trim()
  };
}

async function onFilterChange(event) {
  if (event && event.target === gameFilter) {
    selectedInspectorPlayerId = null;
  }
  syncDateInputsDisabledState();
  visibleCount = batchSize;
  const state = getCurrentFilterState();
  updateURLState(state);
  await loadData();
}

let historicalRankingsData = null;
const historicalArticlesCache = {};

async function fetchHistoricalArticle(id) {
  if (historicalArticlesCache[id]) return historicalArticlesCache[id];
  try {
    const res = await fetch(`data/rankings/${encodeURIComponent(id)}.json`);
    if (res.ok) {
      const data = await res.json();
      historicalArticlesCache[id] = data;
      return data;
    }
  } catch (err) {
    // Article might not exist yet as individual JSON, fall back gracefully
  }
  return null;
}

function getRankingTop3(r, article) {
  if (article && Array.isArray(article.players) && article.players.length > 0) {
    return article.players.slice(0, 3).map((p, idx) => ({
      placement: p.placement || idx + 1,
      tag: p.tag || p.player || `Player${idx + 1}`
    }));
  }
  if (Array.isArray(r.top3) && r.top3.length > 0) {
    return r.top3.slice(0, 3).map((tag, idx) => ({
      placement: idx + 1,
      tag: tag
    }));
  }
  if (r.top) {
    return [{ placement: 1, tag: r.top }];
  }
  return [];
}

async function renderHistoricalRankings() {
  if (!historicalRankingsData) {
    try {
      const res = await fetch('data/rankings.json');
      if (res.ok) {
        historicalRankingsData = await res.json();
      }
    } catch (e) {
      rankingsContent.innerHTML = '<div class="empty glass">Could not load historical rankings data.</div>';
      return;
    }
  }

  if (!historicalRankingsData || !historicalRankingsData.games) {
    rankingsContent.innerHTML = '<div class="empty glass">No historical rankings available.</div>';
    return;
  }

  const games = historicalRankingsData.games;
  const rawHash = location.hash.replace(/^#/, '');
  const isAll = !rawHash || rawHash === 'all';
  const selectedGame = isAll ? null : (games.find(g => g.id === rawHash || g.slug === rawHash) || null);

  const md = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const period = (s, e) => s.slice(0, 4) === e.slice(0, 4)
    ? `${md(s)} – ${md(e)}, ${e.slice(0, 4)}`
    : `${md(s)}, ${s.slice(0, 4)} – ${md(e)}, ${e.slice(0, 4)}`;

  let items = [];
  if (isAll || !selectedGame) {
    games.forEach(g => {
      const gRankings = historicalRankingsData.rankings[g.id] || [];
      gRankings.forEach(r => {
        items.push({ ...r, gameName: g.name, gameSlug: g.slug });
      });
    });
  } else {
    items = (historicalRankingsData.rankings[selectedGame.id] || []).map(r => ({
      ...r,
      gameName: selectedGame.name,
      gameSlug: selectedGame.slug
    }));
  }

  items.sort((a, b) => b.end.localeCompare(a.end));

  let listHtml = '';
  if (!items.length) {
    listHtml = '<div class="empty glass">No rankings published for this selection yet.</div>';
  } else {
    // Fetch article details in parallel if available to show top 3 players
    const articles = await Promise.all(items.map(r => fetchHistoricalArticle(r.id)));

    let lastYear = '';
    listHtml = items.map((r, index) => {
      const year = r.end.slice(0, 4);
      const label = year === lastYear ? '' : year;
      lastYear = year;
      const article = articles[index];
      const top3 = getRankingTop3(r, article);

      let top3Html = '';
      if (top3.length > 0) {
        top3Html = top3.map(p => `<span class="top-player-item"><b class="mono p${p.placement}">#${p.placement}</b> ${esc(p.tag)}</span>`).join('<span class="dot-sep">·</span>');
      }

      return `<div class="rk"><div class="yr mono">${label}</div>
        <a class="card glass" href="ranking.html?id=${encodeURIComponent(r.id)}">
          <div class="hub-icon-col">
            <img class="hub-icon" src="assets/hubs/${esc(r.gameSlug)}.webp" alt="" onerror="this.onerror=null; this.src='assets/players/${esc(r.gameSlug)}.png'; this.style.display=this.src.includes('undefined')?'none':'block';">
          </div>
          <div class="main">
            <!-- Row 1: Ranking Identity -->
            <div class="row-identity">
              <span class="name">${esc(r.name)}</span>
              <span class="status ${r.status === 'yearly' || r.status === 'current' ? 'yearly' : 'seasonal'}">${r.status === 'yearly' || r.status === 'current' ? (window.i18n ? window.i18n.t('historical.yearly') : 'YEARLY') : (window.i18n ? window.i18n.t('historical.seasonal') : 'SEASONAL')}</span>
            </div>

            <!-- Row 2: Ranking Details -->
            <div class="row-details">
              <span class="glass pill chip">${esc(r.gameName)}</span>
              <span class="period mono">${period(r.start, r.end)}</span>
            </div>

            <!-- Row 3: Ranking Summary & Action -->
            <div class="row-summary">
              <div class="top-three mono">
                ${top3Html}
              </div>
              <span class="dot-sep">·</span>
              <span class="players-count mono muted">${r.players} players</span>
              <span class="view-link mono">View Ranking →</span>
            </div>
          </div>
        </a></div>`;
    }).join('');
  }

  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const allActive = isAll || !selectedGame;
  const gameSwitches = [
    `<a class="${allActive ? 'on' : ''}" href="#all">${isEs ? 'Todos los juegos' : 'All games'}</a>`,
    ...games.map(g =>
      `<a class="${!allActive && selectedGame && selectedGame.id === g.id ? 'on' : ''}" href="#${esc(g.id)}">${esc(g.name)}</a>`
    )
  ].join('');

  const displayTitle = (isAll || !selectedGame)
    ? (isEs ? 'Power rankings de todos los juegos' : 'All games power rankings')
    : (isEs ? `Power rankings de ${esc(selectedGame.name)}` : `${esc(selectedGame.name)} power rankings`);

  rankingsContent.innerHTML = `
    <section class="head-panel glass">
      <div class="historical-head-actions">
        <div>
          <div class="eyebrow mono">${isEs ? 'POWER RANKINGS HISTÓRICOS' : 'HISTORICAL POWER RANKINGS'}</div>
          <h2 class="display" style="font-size:36px; margin: 8px 0;">${displayTitle}</h2>
          <p class="muted lead">${isEs ? 'Los rankings son publicados por la comunidad de cada juego. Más recientes primero.' : 'Rankings are published by each game’s community. Newest first.'}</p>
        </div>
        <a href="ranking-creator.html" class="create-ranking-btn">
          <span style="font-size: 18px; line-height: 1;">+</span>
          <span>${isEs ? 'Crear' : 'Create'}</span>
        </a>
      </div>
      <nav id="switch" class="switch glass pill" aria-label="Game Switcher">
        ${gameSwitches}
      </nav>
    </section>
    <div id="list" class="list-col">
      ${listHtml}
    </div>
  `;
}

async function loadData() {
  if (activeSection === 'historical') {
    if (activeFetchController) {
      activeFetchController.abort();
    }
    cleanupObserver();
    const controlsPanel = $('.ranking-controls-panel');
    if (controlsPanel) controlsPanel.style.display = 'none';
    if (rankingStatus) rankingStatus.style.display = 'none';
    renderHistoricalRankings();
    return;
  }

  const controlsPanel = $('.ranking-controls-panel');
  if (controlsPanel) controlsPanel.style.display = '';
  if (rankingStatus) rankingStatus.style.display = '';

  if (activeFetchController) {
    activeFetchController.abort();
  }
  activeFetchController = new AbortController();
  const signal = activeFetchController.signal;

  const requestId = ++currentRequestId;
  const game = gameFilter.value;
  const system = getActiveSystem();
  const mode = modeFilter.value;
  const isHistorical = mode === 'historical';
  const start = isHistorical ? '' : startDateInput.value;
  const end = isHistorical ? '' : endDateInput.value;
  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');

  if (mode === 'period_only' && !start && !end) {
    const msg = isEs
      ? 'Selecciona una fecha de inicio, fecha de fin o rango de fechas para el modo Solo período.'
      : 'Please select a start date, an end date, or a date range for Period-only mode.';
    rankingStatus.textContent = msg;
    rankingsContent.innerHTML = `<div class="panel glass empty-state"><h2>${isEs ? 'Rango de Fechas Requerido' : 'Date Range Required'}</h2><p class="muted">${msg}</p></div>`;
    return;
  }

  if (mode === 'period_performance' && !start) {
    const msg = isEs
      ? 'Selecciona una fecha de inicio para el modo Desempeño en período.'
      : 'Period performance mode requires a start date to establish pre-period ratings.';
    rankingStatus.textContent = msg;
    rankingsContent.innerHTML = `<div class="panel glass empty-state"><h2>${isEs ? 'Fecha de Inicio Requerida' : 'Start Date Required'}</h2><p class="muted">${msg}</p></div>`;
    return;
  }

  if (!isHistorical && start && end && start > end) {
    const msg = isEs
      ? 'Rango de fechas inválido: La fecha de inicio debe ser anterior o igual a la de fin.'
      : 'Invalid date range: Start date must be before or on end date.';
    rankingStatus.textContent = msg;
    rankingsContent.innerHTML = `<div class="panel glass empty-state"><h2>${isEs ? 'Rango de Fechas Inválido' : 'Invalid Date Range'}</h2><p class="muted">${msg}</p></div>`;
    return;
  }

  rankingStatus.textContent = 'Calculating rankings…';

  try {
    if (system === 'custom') {
      // Prioritize loading and displaying the Formula Budget box before starting/displaying calculated rankings
      comparisonData = null;
      renderCustomPowerRankingsLoading();
      const systems = ['glicko2', 'sof', 'quality_wins', 'loss_quality'];
      const newCompData = {};
      for (const sys of systems) {
        const data = await fetchSystemData(game, sys, mode, start, end, signal);
        if (requestId !== currentRequestId || signal.aborted) return;
        if (data && data.error) {
          rankingStatus.textContent = `Error: ${data.error}`;
          rankingsContent.innerHTML = `<div class="panel glass empty-state"><h2>Calculation Error</h2><p class="muted">${esc(data.error)}</p></div>`;
          return;
        }
        newCompData[sys] = data;
      }
      if (requestId !== currentRequestId || signal.aborted) return;
      comparisonData = newCompData;
      rankingStatus.textContent = `Displaying Power Rankings for ${getGameName(game)}`;
      render();
      return;
    }

    if (system === 'comparison' || system === 'overview') {
      const systems = ['glicko2', 'sof', 'quality_wins', 'loss_quality'];
      const newCompData = {};
      for (const sys of systems) {
        const data = await fetchSystemData(game, sys, mode, start, end, signal);
        if (requestId !== currentRequestId || signal.aborted) return;
        if (data && data.error) {
          rankingStatus.textContent = `Error: ${data.error}`;
          rankingsContent.innerHTML = `<div class="panel glass empty-state"><h2>Calculation Error</h2><p class="muted">${esc(data.error)}</p></div>`;
          return;
        }
        newCompData[sys] = data;
      }
      if (requestId !== currentRequestId || signal.aborted) return;
      comparisonData = newCompData;
      rankingStatus.textContent = `Displaying rankings overview for ${getGameName(game)}`;
      render();
      return;
    }

    const data = await fetchSystemData(game, system, mode, start, end, signal);
    if (requestId !== currentRequestId || signal.aborted) return;

    if (data && data.error) {
      currentData = null;
      rankingStatus.textContent = `Error: ${data.error}`;
      rankingsContent.innerHTML = `<div class="panel glass empty-state"><h2>Calculation Error</h2><p class="muted">${esc(data.error)}</p></div>`;
      return;
    }

    currentData = data;
    if (currentData && currentData.rankings) {
      rankingStatus.textContent = `${currentData.totalPlayers} player${currentData.totalPlayers === 1 ? '' : 's'} ranked in ${currentData.algorithm ? currentData.algorithm.name : system}`;
    } else {
      rankingStatus.textContent = 'No ranking data available.';
    }
    render();
  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }
    rankingStatus.textContent = `Error: ${err.message}`;
  }
}

// In-memory cache for loaded game JSON datasets and calculated ranking snapshots
const staticGameDataCache = new Map();
const calculatedRankingsCache = new Map();

async function getGameData(game, signal) {
  if (staticGameDataCache.has(game)) {
    return staticGameDataCache.get(game);
  }
  const url = `data/rankings/data/${encodeURIComponent(game)}.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load ranking data for ${game}`);
  }
  const json = await res.json();
  staticGameDataCache.set(game, json);
  return json;
}

async function fetchSystemData(game, system, mode, start, end, signal) {
  const cacheKey = `${game}_${system}_${mode}_${start || ''}_${end || ''}`;
  if (calculatedRankingsCache.has(cacheKey)) {
    return calculatedRankingsCache.get(cacheKey);
  }

  // 1. If mode is historical (no date filter applied), load pre-calculated snapshot directly for fast load
  if (mode === 'historical') {
    const staticURL = `data/rankings/${encodeURIComponent(game)}-${encodeURIComponent(system)}-historical.json`;
    try {
      const res = await fetch(staticURL, { signal });
      if (res.ok) {
        const json = await res.json();
        calculatedRankingsCache.set(cacheKey, json);
        return json;
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }
  }

  // 2. Perform client-side ranking calculation using static game data
  try {
    const gameData = await getGameData(game, signal);
    if (window.ClientRankingEngine) {
      const engine = new window.ClientRankingEngine(gameData);
      const computed = engine.calculate(system, mode, start || null, end || null, null);
      calculatedRankingsCache.set(cacheKey, computed);
      return computed;
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { error: err.message };
  }

  return null;
}

function getGameName(slug) {
  const g = availableGames.find(item => item.slug === slug);
  return g ? g.name : slug;
}

// Power Rankings Custom Weights State & Logic
const PR_COMPONENTS = {
  glicko2: { name: 'Glicko-2', color: '#38BDF8' },
  quality_wins: { name: 'Quality Wins', color: '#F5C542' },
  sof: { name: 'Strength of Field', color: '#34D399' },
  loss_quality: { name: 'Consistency', color: '#A78BFA' }
};

const DEFAULT_PR_WEIGHTS = {
  glicko2: 55.0,
  quality_wins: 20.0,
  sof: 15.0,
  loss_quality: 10.0
};

const DEFAULT_PR_ACTIVE = {
  glicko2: true,
  quality_wins: true,
  sof: true,
  loss_quality: true
};

let prWeights = loadSavedPRWeights();
let prActiveComponents = loadSavedPRActive();
let selectedInspectorPlayerId = null;

function loadSavedPRWeights() {
  try {
    const saved = localStorage.getItem('platfighters_pr_weights');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          glicko2: Math.max(0, parseFloat(parsed.glicko2) || 0),
          quality_wins: Math.max(0, parseFloat(parsed.quality_wins) || 0),
          sof: Math.max(0, parseFloat(parsed.sof) || 0),
          loss_quality: Math.max(0, parseFloat(parsed.loss_quality) || 0)
        };
      }
    }
  } catch (e) {}
  return { ...DEFAULT_PR_WEIGHTS };
}

function loadSavedPRActive() {
  try {
    const saved = localStorage.getItem('platfighters_pr_active');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          glicko2: Boolean(parsed.glicko2),
          quality_wins: Boolean(parsed.quality_wins),
          sof: Boolean(parsed.sof),
          loss_quality: Boolean(parsed.loss_quality)
        };
      }
    }
  } catch (e) {}
  return { ...DEFAULT_PR_ACTIVE };
}

function savePRState() {
  try {
    localStorage.setItem('platfighters_pr_weights', JSON.stringify(prWeights));
    localStorage.setItem('platfighters_pr_active', JSON.stringify(prActiveComponents));
  } catch (e) {}
}

function calculateRedistributedWeights(changedSys, newWeightInput, baseWeights, activeComponents) {
  let val = Math.max(0, Math.min(100, parseFloat(newWeightInput) || 0));
  const newWeights = { ...baseWeights };

  const activeKeys = Object.keys(PR_COMPONENTS).filter(k => activeComponents[k]);
  if (!activeKeys.includes(changedSys)) {
    activeKeys.push(changedSys);
  }

  if (activeKeys.length <= 1) {
    activeKeys.forEach(k => { newWeights[k] = 100.0; });
    return newWeights;
  }

  const otherKeys = activeKeys.filter(k => k !== changedSys);
  const sumOthers = otherKeys.reduce((acc, k) => acc + (baseWeights[k] || 0), 0);
  const remainingBudget = 100.0 - val;

  newWeights[changedSys] = val;

  if (sumOthers > 0) {
    otherKeys.forEach(k => {
      newWeights[k] = ((baseWeights[k] || 0) / sumOthers) * remainingBudget;
    });
  } else {
    const equalShare = remainingBudget / otherKeys.length;
    otherKeys.forEach(k => {
      newWeights[k] = equalShare;
    });
  }

  Object.keys(PR_COMPONENTS).forEach(k => {
    if (!activeComponents[k]) {
      newWeights[k] = 0.0;
    }
  });

  return newWeights;
}

function redistributePRWeights(changedSys, newWeightInput) {
  if (!prActiveComponents[changedSys]) {
    prActiveComponents[changedSys] = true;
  }
  prWeights = calculateRedistributedWeights(changedSys, newWeightInput, prWeights, prActiveComponents);
  savePRState();
}

function togglePRComponent(sysKey, isChecked) {
  if (!isChecked) {
    const activeKeys = Object.keys(PR_COMPONENTS).filter(k => prActiveComponents[k]);
    if (activeKeys.length <= 1) {
      return;
    }
    prActiveComponents[sysKey] = false;
    prWeights[sysKey] = 0.0;

    const remainingKeys = Object.keys(PR_COMPONENTS).filter(k => prActiveComponents[k]);
    const remainingSum = remainingKeys.reduce((acc, k) => acc + prWeights[k], 0);
    if (remainingSum > 0) {
      remainingKeys.forEach(k => {
        prWeights[k] = (prWeights[k] / remainingSum) * 100.0;
      });
    } else {
      const equalShare = 100.0 / remainingKeys.length;
      remainingKeys.forEach(k => {
        prWeights[k] = equalShare;
      });
    }
  } else {
    prActiveComponents[sysKey] = true;
    const activeKeys = Object.keys(PR_COMPONENTS).filter(k => prActiveComponents[k]);
    if (activeKeys.length === 1) {
      prWeights[sysKey] = 100.0;
    } else {
      const newShare = Math.min(25.0, 100.0 / activeKeys.length);
      redistributePRWeights(sysKey, newShare);
    }
  }
  savePRState();
}

function getDisplayPRWeights(weights = prWeights, activeComponents = prActiveComponents) {
  const activeKeys = Object.keys(PR_COMPONENTS).filter(k => activeComponents[k]);
  const result = { glicko2: 0, quality_wins: 0, sof: 0, loss_quality: 0 };
  if (activeKeys.length === 0) return result;

  let sumFloors = 0;
  const items = [];

  activeKeys.forEach(k => {
    const rawVal = weights[k] || 0;
    const floorVal = Math.floor(rawVal);
    const rem = rawVal - floorVal;
    result[k] = floorVal;
    sumFloors += floorVal;
    items.push({ key: k, rem: rem });
  });

  let deficit = 100 - sumFloors;
  items.sort((a, b) => {
    if (Math.abs(b.rem - a.rem) > 1e-6) {
      return b.rem - a.rem;
    }
    return a.key.localeCompare(b.key);
  });

  for (let i = 0; i < deficit && i < items.length; i++) {
    result[items[i].key] += 1;
  }

  return result;
}

function computePRLeaderboard() {
  if (!comparisonData || !Object.keys(comparisonData).length) {
    return { players: [], minMax: {} };
  }

  const sysKeys = Object.keys(PR_COMPONENTS);
  const playersMap = new Map();

  sysKeys.forEach(sys => {
    const sysData = comparisonData[sys];
    if (sysData && sysData.rankings) {
      sysData.rankings.forEach(p => {
        if (!playersMap.has(p.playerId)) {
          playersMap.set(p.playerId, {
            playerId: p.playerId,
            playerTag: p.playerTag,
            rawScores: {},
            matches: 0,
            events: 0
          });
        }
        const pObj = playersMap.get(p.playerId);
        pObj.rawScores[sys] = p.score;
        pObj.matches = Math.max(pObj.matches, p.matches || 0);
        pObj.events = Math.max(pObj.events, p.events || 0);
        if (p.baselineScore !== undefined && p.baselineScore !== null) pObj.baselineScore = p.baselineScore;
        if (p.change !== undefined && p.change !== null) pObj.change = p.change;
      });
    }
  });

  const allPlayers = Array.from(playersMap.values());
  if (!allPlayers.length) return { players: [], minMax: {} };

  const minMax = {};
  sysKeys.forEach(sys => {
    const scores = allPlayers.map(p => p.rawScores[sys] !== undefined ? p.rawScores[sys] : 0);
    const minVal = Math.min(...scores);
    const maxVal = Math.max(...scores);
    minMax[sys] = { min: minVal, max: maxVal };
  });

  const displayWeights = getDisplayPRWeights();

  const computedPlayers = allPlayers.map(p => {
    const normalized = {};
    const contributions = {};
    let totalScore = 0;

    sysKeys.forEach(sys => {
      const raw = p.rawScores[sys] !== undefined ? p.rawScores[sys] : 0;
      const { min, max } = minMax[sys];
      let norm = 0;
      if (max > min) {
        norm = ((raw - min) / (max - min)) * 100.0;
      } else {
        norm = 100.0;
      }
      normalized[sys] = norm;

      const w = prActiveComponents[sys] ? (prWeights[sys] || 0) : 0;
      const contrib = (norm * w) / 100.0;
      contributions[sys] = contrib;
      totalScore += contrib;
    });

    return {
      playerId: p.playerId,
      playerTag: p.playerTag,
      score: Math.round(totalScore * 10) / 10,
      exactTotalScore: totalScore,
      rawScores: p.rawScores,
      normalizedScores: normalized,
      weightedContributions: contributions,
      matches: p.matches,
      events: p.events,
      baselineScore: p.baselineScore,
      change: p.change
    };
  });

  computedPlayers.sort((a, b) => b.exactTotalScore - a.exactTotalScore);
  computedPlayers.forEach((p, idx) => { p.rank = idx + 1; });

  return { players: computedPlayers, minMax };
}

let prDraftWeights = null;

window.onPRWeightInput = function(sysKey, value) {
  prDraftWeights = calculateRedistributedWeights(sysKey, value, prWeights, prActiveComponents);
  const displayWeights = getDisplayPRWeights(prDraftWeights, prActiveComponents);

  Object.keys(PR_COMPONENTS).forEach(k => {
    const isActive = prActiveComponents[k];
    const dispW = displayWeights[k] || 0;

    const slider = $(`input.pr-slider[data-sys="${k}"]`);
    if (slider && document.activeElement !== slider) {
      slider.value = dispW;
    }

    const numInput = $(`input.pr-number-input[data-sys="${k}"]`);
    if (numInput && document.activeElement !== numInput) {
      numInput.value = dispW;
    }

    const badge = $(`.pr-card-badge[data-sys="${k}"]`);
    if (badge) {
      badge.textContent = `${dispW}%`;
    }

    const fill = $(`.pr-card-contrib-fill[data-sys="${k}"]`);
    if (fill) {
      fill.style.width = `${dispW}%`;
    }

    const segment = $(`.pr-stacked-segment[data-sys="${k}"]`);
    if (segment) {
      segment.style.width = `${isActive ? dispW : 0}%`;
    }

    const legendText = $(`.pr-legend-text[data-sys="${k}"]`);
    if (legendText) {
      legendText.textContent = isActive ? `${dispW}%` : 'Disabled';
    }
  });
};

window.onPRWeightCommit = function(sysKey, value) {
  redistributePRWeights(sysKey, value);
  prDraftWeights = null;
  renderCustomPowerRankings();
};

window.onPRWeightChange = function(sysKey, value) {
  onPRWeightCommit(sysKey, value);
};

window.onPRToggleComponent = function(sysKey, isChecked) {
  togglePRComponent(sysKey, isChecked);
  renderCustomPowerRankings();
};

window.onPRSelectPlayer = function(playerId) {
  selectedInspectorPlayerId = playerId;
  renderCustomPowerRankings();
};

window.resetToDefaultPRWeights = function() {
  prWeights = { ...DEFAULT_PR_WEIGHTS };
  prActiveComponents = { ...DEFAULT_PR_ACTIVE };
  savePRState();
  renderCustomPowerRankings();
};

window.createPRFromCurrentRankings = function() {
  const { players: leaderboard } = computePRLeaderboard();
  const currentGameSlug = gameFilter.value || 'ultimate';
  const gameObj = availableGames.find(g => g.slug === currentGameSlug) || { slug: currentGameSlug, name: currentGameSlug };

  // Capture snapshot without modifying any existing rankings data
  const snapshot = {
    game: {
      id: gameObj.id || gameObj.slug,
      name: gameObj.name,
      slug: gameObj.slug
    },
    capturedAt: new Date().toISOString(),
    players: leaderboard.map((p, idx) => ({
      placement: idx + 1,
      tag: p.playerTag,
      points: Math.round(p.score),
      photo: `assets/players/${p.playerId}.png`,
      playerId: p.playerId
    }))
  };

  try {
    sessionStorage.setItem('platfighters_pr_snapshot', JSON.stringify(snapshot));
  } catch (e) {
    console.error('Could not save PR snapshot to sessionStorage:', e);
  }

  // Navigate to ranking creator in PR creation mode
  window.location.href = 'ranking-creator.html?source=pr';
};

function renderInlineMiniBadges(playerTag) {
  return '';
}

function renderFormulaBudgetBox() {
  const displayWeights = getDisplayPRWeights();

  const stackedSegmentsHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
    const w = displayWeights[sysKey] || 0;
    const color = PR_COMPONENTS[sysKey].color;
    return `<div class="pr-stacked-segment" data-sys="${sysKey}" style="width: ${prActiveComponents[sysKey] ? w : 0}%; background-color: ${color};" title="${PR_COMPONENTS[sysKey].name}: ${w}%"></div>`;
  }).join('');

  const legendHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
    const w = displayWeights[sysKey] || 0;
    const color = PR_COMPONENTS[sysKey].color;
    const isActive = prActiveComponents[sysKey];
    return `
      <div class="pr-legend-item ${isActive ? '' : 'muted'}">
        <span class="pr-legend-swatch" style="background-color: ${isActive ? color : '#666'};"></span>
        <span><b>${PR_COMPONENTS[sysKey].name}</b>: <span class="pr-legend-text" data-sys="${sysKey}">${isActive ? w + '%' : 'Disabled'}</span></span>
      </div>
    `;
  }).join('');

  const controlsGridHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
    const meta = PR_COMPONENTS[sysKey];
    const isActive = prActiveComponents[sysKey];
    const dispWeight = displayWeights[sysKey] || 0;

    return `
      <div class="pr-component-card ${isActive ? '' : 'inactive'}" style="border-left: 4px solid ${isActive ? meta.color : '#555'};">
        <div class="pr-card-head">
          <label class="pr-card-title check-label">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="onPRToggleComponent('${sysKey}', this.checked)">
            <span>${meta.name}</span>
          </label>
          <span class="pr-card-badge mono" data-sys="${sysKey}" style="color: ${isActive ? meta.color : 'var(--muted)'};">${dispWeight}%</span>
        </div>
        <div class="pr-inputs-row">
          <input type="range" class="pr-slider" data-sys="${sysKey}" min="0" max="100" value="${dispWeight}" ${isActive ? '' : 'disabled'} oninput="onPRWeightInput('${sysKey}', this.value)" onchange="onPRWeightCommit('${sysKey}', this.value)" aria-label="${meta.name} Weight Slider">
          <input type="number" class="pr-number-input mono" data-sys="${sysKey}" min="0" max="100" value="${dispWeight}" ${isActive ? '' : 'disabled'} oninput="onPRWeightInput('${sysKey}', this.value)" onchange="onPRWeightCommit('${sysKey}', this.value)" aria-label="${meta.name} Weight Input">%
        </div>
        <div class="pr-contrib-bar-wrap">
          <div class="pr-contrib-bar-fill pr-card-contrib-fill" data-sys="${sysKey}" style="width: ${dispWeight}%; background-color: ${isActive ? meta.color : '#555'};"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="panel glass pr-setup-panel">
      <div class="pr-header">
        <div>
          <div class="eyebrow mono">CUSTOM POWER RANKINGS CREATOR</div>
          <h2 style="margin:4px 0 0; font-size:26px;">Linked Weights &amp; Formula Budget</h2>
        </div>
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <button class="quiet-button mono" style="font-size:12px; padding:6px 12px; border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer;" onclick="resetToDefaultPRWeights()">${(window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es') ? 'Restablecer Valores (55/20/15/10)' : 'Reset to Defaults (55/20/15/10)'}</button>
          <div class="pr-total-badge mono" id="pr-total-badge">
            ${(window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es') ? 'PESO TOTAL:' : 'TOTAL WEIGHT:'} <b>100%</b>
          </div>
        </div>
      </div>

      <p class="muted" style="margin-bottom:8px; font-size:14px;">
        Adjust percentage shares to balance component systems. Increasing one component automatically scales down others proportionally to maintain an exact 100% total.
      </p>

      <p class="mono muted" style="margin-bottom:16px; font-size:12px; color:var(--sky);">
        💡 Recommended Starting Formula: <b>55% Glicko-2</b> · <b>20% Quality Wins</b> · <b>15% Strength of Field</b> · <b>10% Consistency</b>
      </p>

      <div class="pr-stacked-container">
        <div class="pr-stacked-bar" aria-label="Stacked weight configuration visualization">
          ${stackedSegmentsHtml}
        </div>
        <div class="pr-legend">
          ${legendHtml}
        </div>
      </div>

      <div class="pr-controls-grid">
        ${controlsGridHtml}
      </div>

      <details class="pr-guide-box">
        <summary>💡 Formula Distinction: Weight vs. Normalized Score vs. Weighted Contribution</summary>
        <p>
          • <b>Weight (%):</b> How important a ranking system is in the custom formula configuration budget.<br>
          • <b>Normalized Score (0–100):</b> How a particular player performs on that system relative to the eligible player population (scaled from 0 = lowest to 100 = highest in active scope).<br>
          • <b>Weighted Contribution (pts):</b> <code>(Normalized Score × Weight) / 100</code>. How much that component contributes to the player's final custom score.
        </p>
      </details>
    </div>
  `;
}

function renderCustomPowerRankingsLoading() {
  cleanupObserver();
  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const budgetBoxHtml = renderFormulaBudgetBox();

  const loadingHtml = `
    ${budgetBoxHtml}
    <div class="panel glass ranking-table-panel">
      <div class="pr-table-toolbar">
        <button class="pr-create-pill-btn mono" disabled style="opacity:0.5; cursor:not-allowed;">
          ${isEs ? 'CREAR PR' : 'CREATE PR'}
        </button>
      </div>
      <div class="pr-loading-container">
        <div class="pr-spinner"></div>
        <span class="pr-loading-text mono">${isEs ? 'Calculando Power Rankings…' : 'Calculating Power Rankings…'}</span>
        <div class="pr-skeleton-table">
          <div class="pr-skeleton-row"></div>
          <div class="pr-skeleton-row"></div>
          <div class="pr-skeleton-row"></div>
          <div class="pr-skeleton-row"></div>
          <div class="pr-skeleton-row"></div>
        </div>
      </div>
    </div>
  `;

  rankingsContent.innerHTML = loadingHtml;
}

function renderCustomPowerRankings() {
  cleanupObserver();

  if (!comparisonData || !Object.keys(comparisonData).length) {
    const budgetBoxHtml = renderFormulaBudgetBox();
    const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
    rankingsContent.innerHTML = `
      ${budgetBoxHtml}
      <div class="panel glass empty-state">
        <h2>${isEs ? 'Sin datos de Power Rankings' : 'No Power Rankings data'}</h2>
        <p class="muted">${isEs ? 'No se encontraron resultados para la selección.' : 'No results found for this selection.'}</p>
      </div>
    `;
    return;
  }

  const { players: leaderboard } = computePRLeaderboard();
  const displayWeights = getDisplayPRWeights();
  const activeKeys = Object.keys(PR_COMPONENTS).filter(k => prActiveComponents[k]);

  let inspectedPlayer = leaderboard.find(p => p.playerId === selectedInspectorPlayerId);
  if (!inspectedPlayer && leaderboard.length > 0) {
    inspectedPlayer = leaderboard[0];
    selectedInspectorPlayerId = inspectedPlayer.playerId;
  }

  const query = playerSearch.value.trim().toLowerCase();
  let list = leaderboard.filter(p => p.playerTag.toLowerCase().includes(query));

  list.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (typeof valA === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = (valA !== undefined && valA !== null) ? valA : (sortAsc ? 9999999 : -9999999);
    const numB = (valB !== undefined && valB !== null) ? valB : (sortAsc ? 9999999 : -9999999);
    return sortAsc ? (numA - numB) : (numB - numA);
  });

  const totalFiltered = list.length;
  const visibleList = list.slice(0, visibleCount);

  const stackedSegmentsHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
    const w = displayWeights[sysKey] || 0;
    const color = PR_COMPONENTS[sysKey].color;
    return `<div class="pr-stacked-segment" data-sys="${sysKey}" style="width: ${prActiveComponents[sysKey] ? w : 0}%; background-color: ${color};" title="${PR_COMPONENTS[sysKey].name}: ${w}%"></div>`;
  }).join('');

  const legendHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
    const w = displayWeights[sysKey] || 0;
    const color = PR_COMPONENTS[sysKey].color;
    const isActive = prActiveComponents[sysKey];
    return `
      <div class="pr-legend-item ${isActive ? '' : 'muted'}">
        <span class="pr-legend-swatch" style="background-color: ${isActive ? color : '#666'};"></span>
        <span><b>${PR_COMPONENTS[sysKey].name}</b>: <span class="pr-legend-text" data-sys="${sysKey}">${isActive ? w + '%' : 'Disabled'}</span></span>
      </div>
    `;
  }).join('');

  const controlsGridHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
    const meta = PR_COMPONENTS[sysKey];
    const isActive = prActiveComponents[sysKey];
    const dispWeight = displayWeights[sysKey] || 0;

    return `
      <div class="pr-component-card ${isActive ? '' : 'inactive'}" style="border-left: 4px solid ${isActive ? meta.color : '#555'};">
        <div class="pr-card-head">
          <label class="pr-card-title check-label">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="onPRToggleComponent('${sysKey}', this.checked)">
            <span>${meta.name}</span>
          </label>
          <span class="pr-card-badge mono" data-sys="${sysKey}" style="color: ${isActive ? meta.color : 'var(--muted)'};">${dispWeight}%</span>
        </div>
        <div class="pr-inputs-row">
          <input type="range" class="pr-slider" data-sys="${sysKey}" min="0" max="100" value="${dispWeight}" ${isActive ? '' : 'disabled'} oninput="onPRWeightInput('${sysKey}', this.value)" onchange="onPRWeightCommit('${sysKey}', this.value)" aria-label="${meta.name} Weight Slider">
          <input type="number" class="pr-number-input mono" data-sys="${sysKey}" min="0" max="100" value="${dispWeight}" ${isActive ? '' : 'disabled'} oninput="onPRWeightInput('${sysKey}', this.value)" onchange="onPRWeightCommit('${sysKey}', this.value)" aria-label="${meta.name} Weight Input">%
        </div>
        <div class="pr-contrib-bar-wrap">
          <div class="pr-contrib-bar-fill pr-card-contrib-fill" data-sys="${sysKey}" style="width: ${dispWeight}%; background-color: ${isActive ? meta.color : '#555'};"></div>
        </div>
      </div>
    `;
  }).join('');

  let inspectorHtml = '';
  if (inspectedPlayer) {
    const p = inspectedPlayer;
    let sumContribs = 0;

    const inspectorRowsHtml = Object.keys(PR_COMPONENTS).map(sysKey => {
      const meta = PR_COMPONENTS[sysKey];
      const isActive = prActiveComponents[sysKey];
      const w = displayWeights[sysKey] || 0;
      const normScore = Math.round((p.normalizedScores[sysKey] || 0) * 10) / 10;
      const contrib = Math.round((p.weightedContributions[sysKey] || 0) * 10) / 10;
      if (isActive) sumContribs += contrib;

      return `
        <div class="pr-inspector-row">
          <span style="color: ${isActive ? meta.color : 'var(--muted)'}; font-weight:600;">${meta.name}</span>
          <span class="mono muted">Weight: <b>${isActive ? w + '%' : '0%'}</b></span>
          <span class="mono muted">Norm: <b>${normScore}</b>/100</span>
          <div class="pr-contrib-bar-wrap" style="height:10px;">
            <div class="pr-contrib-bar-fill" style="width: ${Math.min(100, contrib)}%; background-color: ${isActive ? meta.color : '#555'};"></div>
          </div>
          <span class="mono font-bold" style="color: ${isActive ? meta.color : 'var(--muted)'};">+${contrib} pts</span>
        </div>
      `;
    }).join('');

    const roundedSumContribs = Math.round(sumContribs * 10) / 10;

    inspectorHtml = `
      <div class="pr-inspector-head">
        <div>
          <span class="eyebrow mono">PLAYER CONTRIBUTION INSPECTOR</span>
          <h3 style="margin:2px 0 0; font-size:20px;">
            ${esc(p.playerTag)} <span class="muted font-normal">(Rank #${p.rank})</span>
          </h3>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <label class="mono muted" style="font-size:12px;">INSPECT PLAYER:
            <select class="game-filter glass" style="min-width:180px; height:38px; padding:0 10px;" onchange="onPRSelectPlayer(this.value)">
              ${leaderboard.map(pl => `<option value="${esc(pl.playerId)}"${pl.playerId === p.playerId ? ' selected' : ''}>#${pl.rank} ${esc(pl.playerTag)} (${pl.score} pts)</option>`).join('')}
            </select>
          </label>
          <div class="badge mono" style="font-size:16px; font-weight:700; background:rgba(255,255,255,0.1); padding:8px 16px;">
            FINAL SCORE: <span style="color:var(--sky);">${p.score}</span>
          </div>
        </div>
      </div>

      <div class="pr-inspector-bars">
        ${inspectorRowsHtml}
      </div>

      <p class="mono muted" style="font-size:12px; margin-top:12px; text-align:right;">
        Reconciliation: ${Object.keys(PR_COMPONENTS).filter(k => prActiveComponents[k]).map(k => Math.round((p.weightedContributions[k]||0)*10)/10).join(' + ')} = <b>${roundedSumContribs} pts</b> (matches final score ${p.score})
      </p>
    `;
  }

  const budgetBoxHtml = renderFormulaBudgetBox();
  const isPeriodPerf = modeFilter.value === 'period_performance';
  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const prGridCols = isPeriodPerf ? '55px minmax(170px,1.6fr) 95px repeat(4, minmax(85px, 1fr)) 100px;' : '60px minmax(180px,1.8fr) 110px repeat(4, minmax(90px, 1fr)) 110px;';

  let html = `
    ${budgetBoxHtml}

    <div class="panel glass ranking-table-panel">
      <div class="pr-table-toolbar">
        <button class="pr-create-pill-btn mono" onclick="createPRFromCurrentRankings()">
          ${isEs ? 'CREAR PR' : 'CREATE PR'}
        </button>
      </div>
      <div class="table">
        <div class="tr head ranking-row" style="grid-template-columns: ${prGridCols}">
          <span class="sortable" onclick="changeSort('rank')">${isEs ? 'PUESTO' : 'RANK'} ${sortCol === 'rank' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span class="sortable" onclick="changeSort('playerTag')">${isEs ? 'JUGADOR' : 'PLAYER'} ${sortCol === 'playerTag' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span class="sortable" onclick="changeSort('score')">${isEs ? 'PUNTAJE' : 'SCORE'} ${sortCol === 'score' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span>GLICKO-2</span>
          <span>${isEs ? 'VICTORIAS CALIDAD' : 'QUALITY WINS'}</span>
          <span>SOF</span>
          <span>${isEs ? 'CONSISTENCIA' : 'CONSISTENCY'}</span>
          <span>${isEs ? 'ACCIONES' : 'ACTIONS'}</span>
        </div>

        ${visibleList.length ? visibleList.map(p => `
          <div class="tr ranking-row" style="grid-template-columns: ${prGridCols}; cursor:pointer;" onclick="onPRSelectPlayer('${esc(p.playerId)}')">
            <span class="rank-col font-bold ${p.rank && p.rank <= 3 ? 'p' + p.rank : ''}">#${p.rank}</span>
            <div class="player-col">
              <a href="index.html?player=${encodeURIComponent(p.playerId)}" class="player-card-link" onclick="event.stopPropagation();">
                <span class="player-avatar mini"><img src="assets/players/${esc(p.playerId)}.png" alt="" onerror="this.remove()"></span>
                <b>${esc(p.playerTag)}</b>
              </a>
            </div>
            <span class="score-col mono font-bold">${p.score}</span>
            <span class="mono" style="color:${PR_COMPONENTS.glicko2.color};">${Math.round((p.weightedContributions.glicko2||0)*10)/10} <small class="muted">(${Math.round((p.normalizedScores.glicko2||0)*10)/10})</small></span>
            <span class="mono" style="color:${PR_COMPONENTS.quality_wins.color};">${Math.round((p.weightedContributions.quality_wins||0)*10)/10} <small class="muted">(${Math.round((p.normalizedScores.quality_wins||0)*10)/10})</small></span>
            <span class="mono" style="color:${PR_COMPONENTS.sof.color};">${Math.round((p.weightedContributions.sof||0)*10)/10} <small class="muted">(${Math.round((p.normalizedScores.sof||0)*10)/10})</small></span>
            <span class="mono" style="color:${PR_COMPONENTS.loss_quality.color};">${Math.round((p.weightedContributions.loss_quality||0)*10)/10} <small class="muted">(${Math.round((p.normalizedScores.loss_quality||0)*10)/10})</small></span>
            <div class="actions-col" onclick="event.stopPropagation();">
              <button class="quiet-button diagnostic-btn" onclick="openDiagnosticModal('${esc(p.playerId)}')">${isEs ? 'Diagnóstico' : 'Diagnostic'}</button>
            </div>
          </div>
        `).join('') : `<div class="empty-state"><p class="muted">${isEs ? 'Ningún jugador coincide con el filtro.' : 'No players match the search filter.'}</p></div>`}
      </div>

      ${totalFiltered > 0 ? `
        <div id="scroll-sentinel" class="infinite-scroll-sentinel mono muted">
          ${visibleCount < totalFiltered ? ((window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es') ? `Mostrando ${visibleList.length} de ${totalFiltered} jugadores (desplaza hacia abajo para cargar más…)` : `Showing ${visibleList.length} of ${totalFiltered} players (scroll down to load more…)`) : ((window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es') ? `Mostrando los ${totalFiltered} jugadores` : `Showing all ${totalFiltered} players`)}
        </div>
      ` : ''}
    </div>
  `;

  rankingsContent.innerHTML = html;
  bindSystemTabsEvents();
  setupInfiniteScroll(totalFiltered);
}

// Render Router
function render() {
  const system = getActiveSystem();
  if (system === 'custom') {
    renderCustomPowerRankings();
  } else if (system === 'overview' || system === 'comparison') {
    renderComparison();
  } else {
    renderIndividualSystem(system);
  }
}

function cleanupObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

function setupInfiniteScroll(totalCount) {
  cleanupObserver();

  const sentinel = $('#scroll-sentinel');
  if (!sentinel || visibleCount >= totalCount) return;

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      visibleCount += batchSize;
      render();
    }
  }, { rootMargin: '200px' });

  scrollObserver.observe(sentinel);
}

// Individual System View
function renderIndividualSystem(systemKey) {
  cleanupObserver();

  if (!currentData || !currentData.rankings) {
    rankingsContent.innerHTML = '<div class="panel glass empty-state"><h2>No ranking results</h2><p class="muted">No matches found for this game and date range.</p></div>';
    return;
  }

  const query = playerSearch.value.trim().toLowerCase();
  let list = currentData.rankings.filter(p => p.playerTag.toLowerCase().includes(query));

  // Sorting
  list.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (typeof valA === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = (valA !== undefined && valA !== null) ? valA : (sortAsc ? 9999999 : -9999999);
    const numB = (valB !== undefined && valB !== null) ? valB : (sortAsc ? 9999999 : -9999999);
    return sortAsc ? (numA - numB) : (numB - numA);
  });

  const totalFiltered = list.length;
  const visibleList = list.slice(0, visibleCount);

  const sysInfo = currentData.algorithm || {};
  const isPeriodPerf = modeFilter.value === 'period_performance';
  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const indGridCols = isPeriodPerf ? '55px minmax(160px,1.8fr) 95px 85px minmax(130px, 1.2fr) 90px;' : '';

  let html = `
    <div class="panel glass system-banner">
      <h2>${esc(sysInfo.name || systemKey)} Rankings</h2>
      <p class="muted">${esc(sysInfo.description || getSystemDescription(systemKey))}</p>
    </div>

    ${renderSystemTabsNav()}

    <div class="panel glass ranking-table-panel">
      <div class="table">
        <div class="tr head ranking-row" style="${indGridCols ? `grid-template-columns: ${indGridCols}` : ''}">
          <span class="sortable" onclick="changeSort('rank')">${isEs ? 'PUESTO' : 'RANK'} ${sortCol === 'rank' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span class="sortable" onclick="changeSort('playerTag')">${isEs ? 'JUGADOR' : 'PLAYER'} ${sortCol === 'playerTag' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span class="sortable" onclick="changeSort('score')">${isEs ? 'PUNTAJE' : 'SCORE'} ${sortCol === 'score' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span class="sortable" onclick="changeSort('winRate')">${isEs ? '% VICTORIAS' : 'WIN %'} ${sortCol === 'winRate' ? (sortAsc ? '▲' : '▼') : ''}</span>
          <span>${isEs ? 'PARTIDAS / EVENTOS' : 'MATCHES / EVENTS'}</span>
          <span>${isEs ? 'ACCIONES' : 'ACTIONS'}</span>
        </div>
        ${visibleList.length ? visibleList.map(p => `
          <div class="tr ranking-row" style="${indGridCols ? `grid-template-columns: ${indGridCols}` : ''}">
            <span class="rank-col font-bold ${p.rank && p.rank <= 3 ? 'p' + p.rank : ''}">${p.rank ? '#' + p.rank : 'Unranked'}</span>
            <div class="player-col">
              <a href="index.html?player=${encodeURIComponent(p.playerId)}" class="player-card-link">
                <span class="player-avatar mini"><img src="assets/players/${esc(p.playerId)}.png" alt="" onerror="this.remove()"></span>
                <b>${esc(p.playerTag)}</b>
                ${p.isProvisional ? `<span class="badge warning mono" style="font-size:0.75rem; padding:0.1rem 0.4rem; margin-left:0.4rem;" title="Provisional ranking (< 3 eligible wins)">Provisional</span>` : ''}
                ${p.isUnranked ? `<span class="badge muted mono" style="font-size:0.75rem; padding:0.1rem 0.4rem; margin-left:0.4rem;" title="No eligible wins recorded">Unranked</span>` : ''}
              </a>
            </div>
            <span class="score-col mono font-bold">${p.isUnranked ? '-' : p.score}</span>
            <span class="winrate-col mono">${p.winRate !== undefined ? p.winRate + '%' : '-'}</span>
            <span class="matches-col mono">${p.matches !== undefined ? `${p.matches}${p.events !== undefined ? ` (${p.events} event${p.events === 1 ? '' : 's'})` : ''}` : '-'}</span>
            <div class="actions-col">
              <button class="quiet-button diagnostic-btn" onclick="openDiagnosticModal('${esc(p.playerId)}')">${isEs ? 'Diagnóstico' : 'Diagnostic'}</button>
            </div>
          </div>
        `).join('') : `<div class="empty-state"><p class="muted">${isEs ? 'Ningún jugador coincide con el filtro.' : 'No players match the search filter.'}</p></div>`}
      </div>

      ${totalFiltered > 0 ? `
        <div id="scroll-sentinel" class="infinite-scroll-sentinel mono muted">
          ${visibleCount < totalFiltered ? `Showing ${visibleList.length} of ${totalFiltered} players (scroll down to load more…)` : `Showing all ${totalFiltered} players`}
        </div>
      ` : ''}
    </div>
  `;

  rankingsContent.innerHTML = html;
  bindSystemTabsEvents();
  setupInfiniteScroll(totalFiltered);
}

function getSystemDescription(systemKey) {
  switch (systemKey) {
    case 'glicko2':
      return 'Glicko-2 models rating r, rating deviation RD, and volatility σ. Conservative rating = r - 2RD.';
    case 'sof':
      return 'Strength of Field evaluates tournament performance against pre-event field strengths and entrant scaling.';
    case 'quality_wins':
      return 'Quality Wins ranks players by average victory quality adjusted for sample confidence, rewarding wins against strong opponents without volume inflation.';
    case 'loss_quality':
      return 'Consistency reflects how reliably a player achieves strong results. It rewards wins, gives extra credit for defeating stronger opponents, and accounts for the number of matches played.';
    default:
      return '';
  }
}

function formatAlgorithmParams(params) {
  if (!params) return '';
  return Object.entries(params)
    .filter(([k]) => !/(formula|Formula|Credit|Penalty|Accomplishment|Dampening)/.test(k))
    .map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join(' · ');
}

function formatMetrics(p, systemKey) {
  if (systemKey === 'glicko2') {
    return `r:${p.rating} RD:${p.rd} vol:${p.volatility}`;
  } else if (systemKey === 'sof') {
    return `Avg Field:${p.avgFieldStrength}`;
  } else if (systemKey === 'quality_wins') {
    return `Wins:${p.wins} · Total QoW:${p.totalQualityWins} · Avg Opp Win Rating:${p.avgOpponentWinRating || '-'}`;
  } else if (systemKey === 'loss_quality') {
    return `W:${p.wins} L:${p.losses} NetPts:${p.totalPoints}`;
  }
  return '';
}

window.changeSort = function(col) {
  if (sortCol === col) {
    sortAsc = !sortAsc;
  } else {
    sortCol = col;
    sortAsc = (col === 'playerTag' || col === 'rank');
  }
  visibleCount = batchSize;
  render();
};

// Comparison View
function renderComparison() {
  cleanupObserver();

  if (!comparisonData || !Object.keys(comparisonData).length) {
    rankingsContent.innerHTML = '<div class="panel glass empty-state"><h2>No comparison data</h2></div>';
    return;
  }

  const playersMap = new Map();
  const systems = ['glicko2', 'sof', 'quality_wins', 'loss_quality'];

  systems.forEach(sys => {
    const sysData = comparisonData[sys];
    if (sysData && sysData.rankings) {
      sysData.rankings.forEach(p => {
        if (!playersMap.has(p.playerId)) {
          playersMap.set(p.playerId, { playerId: p.playerId, playerTag: p.playerTag });
        }
        playersMap.get(p.playerId)[sys] = { rank: p.rank, score: p.score, change: p.change };
      });
    }
  });

  let list = Array.from(playersMap.values());
  const query = playerSearch.value.trim().toLowerCase();
  list = list.filter(p => p.playerTag.toLowerCase().includes(query));

  list.sort((a, b) => {
    const rA = a.glicko2 ? a.glicko2.rank : 999;
    const rB = b.glicko2 ? b.glicko2.rank : 999;
    return rA - rB;
  });

  const totalFiltered = list.length;
  const visibleList = list.slice(0, visibleCount);

  let html = `
    <div class="panel glass system-banner">
      <h2>Rankings Overview</h2>
      <p class="muted">Side-by-side player ranks and scores across all 4 distinct systems. Each metric measures a different competitive dimension and raw values are presented on their native scales.</p>
    </div>

    ${renderSystemTabsNav()}

    <div class="panel glass ranking-table-panel">
      <div class="table">
        <div class="tr head comparison-head">
          <span>PLAYER</span>
          <span>GLICKO-2</span>
          <span>STRENGTH OF FIELD</span>
          <span>QUALITY WINS</span>
          <span>CONSISTENCY</span>
          <span>ACTIONS</span>
        </div>
        ${visibleList.length ? visibleList.map(p => `
          <div class="tr ranking-row comparison-row">
            <div class="player-col">
              <a href="index.html?player=${encodeURIComponent(p.playerId)}" class="player-card-link">
                <b>${esc(p.playerTag)}</b>
              </a>
            </div>
            <span class="mono">${p.glicko2 ? (p.glicko2.rank ? `#${p.glicko2.rank} (${p.glicko2.score}${p.glicko2.change !== undefined && p.glicko2.change !== null ? (p.glicko2.change >= 0 ? ' +' + p.glicko2.change : ' ' + p.glicko2.change) : ''})` : `- (${p.glicko2.score})`) : '-'}</span>
            <span class="mono">${p.sof ? (p.sof.rank ? `#${p.sof.rank} (${p.sof.score})` : `- (${p.sof.score})`) : '-'}</span>
            <span class="mono">${p.quality_wins ? (p.quality_wins.rank ? `#${p.quality_wins.rank} (${p.quality_wins.score})` : `Unranked (${p.quality_wins.score})`) : '-'}</span>
            <span class="mono">${p.loss_quality ? (p.loss_quality.rank ? `#${p.loss_quality.rank} (${p.loss_quality.score})` : `- (${p.loss_quality.score})`) : '-'}</span>
            <div>
              <button class="quiet-button diagnostic-btn" onclick="openDiagnosticModal('${esc(p.playerId)}')">${(window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es') ? 'Diagnóstico' : 'Diagnostic'}</button>
            </div>
          </div>
        `).join('') : '<div class="empty-state"><p class="muted">No players match the filter.</p></div>'}
      </div>

      ${totalFiltered > 0 ? `
        <div id="scroll-sentinel" class="infinite-scroll-sentinel mono muted">
          ${visibleCount < totalFiltered ? `Showing ${visibleList.length} of ${totalFiltered} players (scroll down to load more…)` : `Showing all ${totalFiltered} players`}
        </div>
      ` : ''}
    </div>
  `;

  rankingsContent.innerHTML = html;
  bindSystemTabsEvents();
  setupInfiniteScroll(totalFiltered);
}

// Diagnostic State & Logic
const diagState = {
  activeTab: 'summary',
  setsFilter: 'all',
  setsSort: 'newest',
  showAllEvents: false,
  diagData: null,
  playerId: null,
  playerTag: '',
  playerRank: null,
  finalScore: null,
  game: '',
  gameName: '',
  system: '',
  mode: '',
  startDate: '',
  endDate: '',
  allRankings: [],
  allSets: [],
  allEvents: [],
  triggerElement: null
};

function formatDiagDateRange(start, end) {
  if (!start && !end) return '';
  const parse = d => d ? new Date(`${d}T00:00:00`) : null;
  const sDate = parse(start);
  const eDate = parse(end);
  if (!sDate && !eDate) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (sDate && eDate) {
    if (sDate.getFullYear() === eDate.getFullYear()) {
      return `${months[sDate.getMonth()]} ${sDate.getDate()} – ${months[eDate.getMonth()]} ${eDate.getDate()}, ${sDate.getFullYear()}`;
    }
    return `${months[sDate.getMonth()]} ${sDate.getDate()}, ${sDate.getFullYear()} – ${months[eDate.getMonth()]} ${eDate.getDate()}, ${eDate.getFullYear()}`;
  }
  if (sDate) return `Since ${months[sDate.getMonth()]} ${sDate.getDate()}, ${sDate.getFullYear()}`;
  return `Until ${months[eDate.getMonth()]} ${eDate.getDate()}, ${eDate.getFullYear()}`;
}

function getDiagHexagonSvg(rank) {
  let cls = 'place-accent';
  let stroke = 'var(--accent, #9fd6ff)';
  if (rank === 1) { cls = 'place-gold'; stroke = 'var(--gold, #ffcc00)'; }
  else if (rank === 2) { cls = 'place-silver'; stroke = 'var(--silver, #d1d5db)'; }
  else if (rank === 3) { cls = 'place-bronze'; stroke = 'var(--bronze, #d97706)'; }

  const ordStr = (window.PRBadges && window.PRBadges.getOrdinal) ? window.PRBadges.getOrdinal(rank) : (rank ? rank : '-');
  return `
    <div class="diag-hex-wrap ${cls}">
      <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" stroke="${stroke}" stroke-width="2" fill="rgba(16,24,50,0.85)"/>
      </svg>
      <span class="diag-hex-ordinal">${esc(ordStr)}</span>
    </div>
  `;
}

function getDiagnosticImpactGroups(sets, won) {
  const groups = new Map();
  sets.filter(s => s.won === won && s.impact !== null && s.impact !== undefined)
    .forEach(s => {
      const key = `${s.eventKey || s.eventId || s.eventName}|${s.opponentId}|${won}`;
      if (!groups.has(key)) {
        groups.set(key, { ...s, impact: 0 });
      }
      const group = groups.get(key);
      group.impact += Number(s.impact);
    });
  return Array.from(groups.values());
}

function getDiagnosticMomentCandidates(sets) {
  if (diagState.mode !== 'historical') return { sets, excludedTournamentCount: 0 };

  const tournaments = new Map();
  diagState.allEvents.forEach(event => {
    if (!event.date) return;
    const key = String(event.tournamentSlug || event.eventKey || event.name || '');
    if (!key) return;
    const existing = tournaments.get(key);
    if (!existing || event.date < existing.date) tournaments.set(key, { key, date: event.date });
  });
  const orderedTournaments = Array.from(tournaments.values()).sort((a, b) => a.date.localeCompare(b.date));
  // Keep all available moments when the player has fewer than two dated tournaments.
  if (orderedTournaments.length < 2) return { sets, excludedTournamentCount: 0 };

  const earlyTournamentKeys = new Set(orderedTournaments.slice(0, 2).map(tournament => tournament.key));
  return {
    sets: sets.filter(set => !earlyTournamentKeys.has(String(set.tournamentSlug || set.eventKey || set.eventId || set.eventName))),
    excludedTournamentCount: 2
  };
}

function formatDiagnosticImpact(impact) {
  const decimals = ['custom', 'power_rankings'].includes(diagState.system) ? 2 : 1;
  const formatted = Number(impact).toFixed(decimals);
  return Number(formatted) > 0 ? `+${formatted}` : formatted;
}

function getDiagnosticGlickoTrend(sets) {
  // Period-only mode resets everyone to a neutral rating, so it cannot tell us
  // whether skill actually improved from a player's prior level.
  // All-time profiles represent completed careers, so they get a career summary
  // instead of language that implies the player's trajectory is still rising.
  if (diagState.mode === 'period_only' || diagState.mode === 'historical') return null;

  const byEvent = new Map();
  sets.forEach(set => {
    const pre = Number(set.eventPreScore);
    const post = Number(set.eventPostScore);
    if (!Number.isFinite(pre) || !Number.isFinite(post) || !set.eventDate) return;
    const key = set.eventKey || set.eventId || set.eventName;
    if (!byEvent.has(key)) byEvent.set(key, { date: set.eventDate, post });
  });
  const events = Array.from(byEvent.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (events.length < 4) return null;

  // Compare average rating levels across adjacent stretches. Endpoint-only
  // comparisons can hide reversals and overstate a period-long direction.
  const split = Math.floor(events.length / 2);
  if (split < 2 || events.length - split < 2) return null;
  const average = rows => rows.reduce((sum, event) => sum + event.post, 0) / rows.length;
  const earlierLevel = average(events.slice(0, split));
  const recentLevel = average(events.slice(split));
  const change = recentLevel - earlierLevel;
  if (!Number.isFinite(change)) return null;
  return { change };
}

function getAllTimeAchievementSummary(sets, events) {
  const placements = events.filter(event => Number.isFinite(Number(event.placement)) && Number(event.placement) > 0);
  if (placements.length) {
    const titles = placements.filter(event => Number(event.placement) === 1);
    const podiums = placements.filter(event => Number(event.placement) <= 3);
    const nonTitlePodiums = podiums.length - titles.length;
    const highlightPool = titles.length ? titles : podiums.length ? podiums : placements;
    const highlight = [...highlightPool].sort((a, b) => {
      const entrantDiff = (Number(b.entrants) || 0) - (Number(a.entrants) || 0);
      return entrantDiff || String(b.date || '').localeCompare(String(a.date || ''));
    })[0];
    const eventCount = placements.length;
    const highlightName = highlight?.name ? `, including ${esc(highlight.name)}` : '';

    if (titles.length > 1) {
      const otherPodiums = nonTitlePodiums ? ` and ${nonTitlePodiums} other podium finishes` : '';
      return `${titles.length} event titles${otherPodiums} across ${eventCount} recorded events${highlightName}`;
    }
    if (titles.length === 1) {
      const extraPodiums = nonTitlePodiums ? `, plus ${nonTitlePodiums} other podium finishes` : '';
      return `a title at ${esc(highlight.name)}${extraPodiums}`;
    }
    if (podiums.length > 1) {
      const best = Math.min(...placements.map(event => Number(event.placement)));
      const bestLabel = ({ 2: 'runner-up', 3: 'third-place' })[best] || `#${best}`;
      return `${podiums.length} podium finishes, including ${podiums.filter(event => Number(event.placement) === best).length} ${bestLabel} finishes`;
    }
    const best = Math.min(...placements.map(event => Number(event.placement)));
    const bestEvent = placements.find(event => Number(event.placement) === best);
    const ordinal = window.PRBadges?.getOrdinal ? window.PRBadges.getOrdinal(best) : `#${best}`;
    return `a best finish of ${ordinal} at ${esc(bestEvent?.name || 'an event')}`;
  }

  if (sets.length) {
    const wins = sets.filter(set => set.won).length;
    const losses = sets.length - wins;
    const eventWord = events.length === 1 ? 'event' : 'events';
    return `a ${wins}–${losses} set record across ${events.length || 'multiple'} ${eventWord}`;
  }
  return 'no event placements on record';
}

function getAllTimeFactorSummary(playerRank) {
  if (isCustomDiagnostic()) {
    const player = getDiagnosticPlayerRankEntry(diagState.playerId) || playerRank;
    const weights = player?.weights || {};
    const contributions = player?.weightedContributions || {};
    const leaderPhrases = {
      glicko2: 'overall rating',
      quality_wins: 'quality of wins over highly rated opponents',
      sof: 'results in stacked fields',
      loss_quality: 'consistency score'
    };
    const contributingPhrases = {
      glicko2: 'overall rating',
      quality_wins: 'wins over highly rated opponents',
      sof: 'results in stacked fields',
      loss_quality: 'consistent results'
    };
    const activeKeys = Object.keys(PR_COMPONENTS).filter(key => Number(weights[key]) > 0);
    const fieldLeaders = activeKeys.filter(key =>
      Number.isFinite(Number(contributions[key])) &&
      Math.abs(Number(contributions[key]) - Number(weights[key])) < 0.005
    );

    if (fieldLeaders.length) {
      if (fieldLeaders.includes('glicko2') && fieldLeaders.includes('loss_quality')) {
        return 'The highest rating and consistency scores reinforce it.';
      }
      const claims = fieldLeaders.map(key => leaderPhrases[key]);
      return `${esc(player?.playerTag || diagState.playerTag)} leads the field in ${claims.join(' and ')}.`;
    }

    const mainContributions = activeKeys
      .filter(key => Number.isFinite(Number(contributions[key])))
      .sort((a, b) => (Number(contributions[b]) || 0) - (Number(contributions[a]) || 0))
      .slice(0, 2)
      .map(key => contributingPhrases[key]);
    if (mainContributions.length) return `The main support for this score comes from ${mainContributions.join(' and ')}.`;
  }

  const systemDescriptions = {
    glicko2: 'A strong overall rating anchors this all-time position.',
    overview: 'A strong overall rating anchors this all-time position.',
    comparison: 'A strong overall rating anchors this all-time position.',
    quality_wins: 'Wins over highly rated opponents are a defining strength.',
    sof: 'Strong finishes in stacked fields are a defining strength.',
    loss_quality: 'Consistent results against strong opposition are a defining strength.'
  };
  return systemDescriptions[diagState.system] || 'Their career results support this all-time position.';
}

function generateAllTimeCareerNarrative(playerTag, playerRank, sets, events) {
  const rankText = playerRank ? `<strong>#${playerRank}</strong>` : 'unranked';
  const allTimeRankPhrases = {
    1: 'at the top of the all-time rankings',
    2: 'as the all-time runner-up',
    3: 'on the all-time podium',
    4: 'in the all-time top four',
    5: 'among the all-time top five',
    6: 'among the all-time top six',
    7: 'among the all-time top contenders',
    8: 'inside the all-time top eight'
  };
  const rankPhrase = allTimeRankPhrases[Number(playerRank)];
  const rankSentence = rankPhrase
    ? `<strong>${esc(playerTag)}</strong> finished ${rankText} ${rankPhrase}`
    : `<strong>${esc(playerTag)}</strong> finished ${rankText} all-time`;
  const achievement = getAllTimeAchievementSummary(sets, events);
  const factors = getAllTimeFactorSummary(getDiagnosticPlayerRankEntry(diagState.playerId));
  return `${rankSentence}, with ${achievement}. ${factors}`;
}

function generateDecidedSentence(playerTag, playerRank, sets, events = []) {
  if ((!sets || sets.length === 0) && !(diagState.mode === 'historical' && events.length > 0)) return '';
  sets = sets || [];
  if (diagState.mode === 'historical') {
    return generateAllTimeCareerNarrative(playerTag, playerRank, sets, events);
  }

  const isElite = Number(playerRank) > 0 && Number(playerRank) <= 8;
  const rankText = playerRank ? `<strong>#${playerRank}</strong>` : 'unranked';
  const topEightPhrases = {
    1: 'at the top of the field',
    2: 'as runner-up',
    3: 'on the podium',
    4: 'among the top contenders',
    5: 'in the top five',
    6: 'in the top six',
    7: 'among the season’s leading players',
    8: 'inside the top eight'
  };
  const intro = isElite
    ? `<strong>${esc(playerTag)}</strong> finished ${rankText} ${topEightPhrases[Number(playerRank)]}`
    : `<strong>${esc(playerTag)}</strong> finished ${rankText}`;

  const placements = events.filter(event => Number.isFinite(Number(event.placement)) && Number(event.placement) > 0);
  let achievement = '';
  if (placements.length) {
    const bestPlacement = Math.min(...placements.map(event => Number(event.placement)));
    const bestEvents = placements.filter(event => Number(event.placement) === bestPlacement);
    const ordinal = window.PRBadges?.getOrdinal
      ? window.PRBadges.getOrdinal(bestPlacement)
      : `#${bestPlacement}`;
    const placePhrase = ({ 1: 'first-place', 2: 'runner-up', 3: 'third-place' })[bestPlacement] || ordinal;
    if (bestEvents.length > 1) {
      achievement = `${bestEvents.length} ${placePhrase} finishes`;
    } else {
      const bestEvent = bestEvents[0];
      achievement = `a ${placePhrase} finish at ${esc(bestEvent.name)}`;
    }
  }

  const trend = getDiagnosticGlickoTrend(sets);
  let history = '';
  const years = new Set(sets.map(set => (set.eventDate || '').slice(0, 4)).filter(year => /^\d{4}$/.test(year)));
  const periodLabel = years.size === 1 ? 'the year' : 'the period';
  const rankIndex = Number(playerRank);
  const improvingPhrases = {
    1: `${esc(playerTag)} built momentum as ${periodLabel} went on.`,
    2: `${esc(playerTag)}'s strongest stretch came in the second half.`,
    3: `${esc(playerTag)} finished ${periodLabel} in stronger form.`,
    4: `${esc(playerTag)}'s results gathered strength across ${periodLabel}.`,
    5: `${esc(playerTag)} posted stronger results in the latter half.`,
    6: `${esc(playerTag)}'s later results were stronger than the early stretch.`,
    7: `${esc(playerTag)} found better form in the second half.`,
    8: `${esc(playerTag)} gained momentum later in ${periodLabel}.`
  };
  const steadyPhrases = {
    1: `${esc(playerTag)} stayed at a high level throughout ${periodLabel}.`,
    2: `${esc(playerTag)} maintained a steady level across ${periodLabel}.`,
    3: `${esc(playerTag)} kept up strong form from start to finish.`,
    4: `${esc(playerTag)} delivered a consistent run across ${periodLabel}.`,
    5: `${esc(playerTag)}'s results remained solid throughout ${periodLabel}.`,
    6: `${esc(playerTag)} held a dependable level across the season.`,
    7: `${esc(playerTag)}'s form stayed steady across their events.`,
    8: `${esc(playerTag)} kept their results on an even keel through ${periodLabel}.`
  };
  const eliteDipPhrases = {
    1: `${esc(playerTag)} held the top spot through a tougher second half.`,
    2: `${esc(playerTag)} kept second place despite a softer finish.`,
    3: `${esc(playerTag)} stayed on the podium after a quieter second half.`,
    4: `${esc(playerTag)} held a top-four finish through a tougher stretch.`,
    5: `${esc(playerTag)} remained in the top five after a softer second half.`,
    6: `${esc(playerTag)} secured a top-six season despite uneven late results.`,
    7: `${esc(playerTag)} kept a top-eight place through a tougher stretch.`,
    8: `${esc(playerTag)} stayed inside the top eight despite a softer finish.`
  };
  if (trend && Math.abs(trend.change) >= 45) {
    if (trend.change > 0) {
      history = improvingPhrases[rankIndex] || `${esc(playerTag)}'s results improved over ${periodLabel}.`;
    } else if (isElite) {
      history = eliteDipPhrases[rankIndex] || `${esc(playerTag)} stayed among the leaders through a tougher stretch.`;
    } else {
      history = `${esc(playerTag)}'s results softened as ${periodLabel} went on.`;
    }
  } else if (trend) {
    history = isElite
      ? (steadyPhrases[rankIndex] || `${esc(playerTag)} maintained strong form over ${periodLabel}.`)
      : `${esc(playerTag)}'s level stayed fairly steady over ${periodLabel}.`;
  }

  const achievementText = achievement ? `, with ${achievement}` : '';
  const firstSentence = `${intro}${achievementText}.`;
  return [firstSentence, history].filter(Boolean).join(' ');
}

function diagnosticUsesGlicko() {
  return ['glicko2', 'overview', 'comparison'].includes(diagState.system);
}

function closeDiagnosticModal() {
  if (diagnosticModal) {
    diagnosticModal.close();
  }
  document.body.classList.remove('mobile-scroll-locked');
  if (diagState.triggerElement) {
    try { diagState.triggerElement.focus(); } catch (e) {}
    diagState.triggerElement = null;
  }
}

function updateDiagnosticImpactProgress(completed, total) {
  const diagBody = $('#diag-body');
  if (!diagBody) return;
  diagBody.innerHTML = `
    <div class="diag-empty-card">
      <p>Calculating set impacts…</p>
      <p class="mono muted">${completed} of ${total} sets</p>
    </div>
  `;
}

async function calculateDiagnosticCounterfactualScores({ gameData, sets, system, mode, startDate, endDate, playerId, weights, fixedNormalizationRanges }) {
  const candidates = sets.filter(set => set.setId !== undefined && set.setId !== null);
  const scores = {};
  if (candidates.length === 0) return scores;

  if (typeof Worker !== 'undefined') {
    const availableWorkers = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);
    const workerCount = Math.min(8, availableWorkers, candidates.length);
    const workerChunks = Array.from({ length: workerCount }, () => []);
    candidates.forEach((set, index) => workerChunks[index % workerCount].push(String(set.setId)));

    return await new Promise((resolve, reject) => {
      const workers = [];
      let completedWorkers = 0;
      let completedSets = 0;
      let finished = false;

      const stopWorkers = () => workers.forEach(worker => worker.terminate());
      const fail = error => {
        if (finished) return;
        finished = true;
        stopWorkers();
        reject(error);
      };

      try {
        workerChunks.forEach(setIds => {
          const worker = new Worker(new URL('js/rankings-diagnostic-worker.js', document.baseURI));
          workers.push(worker);
          worker.onmessage = event => {
            const message = event.data || {};
            if (message.type === 'progress') {
              completedSets++;
              if (completedSets === candidates.length || completedSets % 5 === 0) {
                updateDiagnosticImpactProgress(completedSets, candidates.length);
              }
            } else if (message.type === 'done') {
              Object.assign(scores, message.impacts || {});
              completedWorkers++;
              if (completedWorkers === workers.length && !finished) {
                finished = true;
                stopWorkers();
                resolve(scores);
              }
            } else if (message.type === 'error') {
              fail(new Error(message.message || 'Could not calculate set impacts.'));
            }
          };
          worker.onerror = event => fail(new Error(event.message || 'Ranking diagnostic worker failed.'));
          worker.postMessage({
            gameData,
            system,
            mode,
            startDate,
            endDate,
            playerId,
            weights,
            fixedNormalizationRanges,
            setIds
          });
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  for (let index = 0; index < candidates.length; index++) {
    const setId = String(candidates[index].setId);
    const withoutSetData = {
      ...gameData,
      sets: (gameData.sets || []).filter(set => String(set.setId) !== setId)
    };
    const result = new window.ClientRankingEngine(withoutSetData).calculate(
      system,
      mode,
      startDate,
      endDate,
      playerId,
      weights,
      fixedNormalizationRanges
    );
    const player = result.rankings?.find(row => String(row.playerId) === String(playerId));
    scores[setId] = player?.scoreExact ?? player?.score ?? null;
    updateDiagnosticImpactProgress(index + 1, candidates.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return scores;
}

// Global modal open
window.openDiagnosticModal = async function(playerId) {
  diagState.triggerElement = document.activeElement;
  diagState.playerId = String(playerId);
  diagState.activeTab = 'summary';
  diagState.setsFilter = 'all';
  diagState.setsSort = 'newest';
  diagState.showAllEvents = false;
  ['summary', 'sets', 'method'].forEach(key => {
    const tab = $(`#diag-tab-${key}`);
    if (!tab) return;
    const active = key === 'summary';
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.setAttribute('tabindex', active ? '0' : '-1');
  });

  const game = gameFilter.value;
  diagState.game = game;
  diagState.gameName = getGameName(game);
  diagState.system = getActiveSystem();
  diagState.mode = modeFilter.value;
  diagState.startDate = diagState.mode === 'historical' ? '' : startDateInput.value;
  diagState.endDate = diagState.mode === 'historical' ? '' : endDateInput.value;

  const diagHeader = $('#diag-header');
  const diagBody = $('#diag-body');

  if (diagHeader) {
    diagHeader.innerHTML = `
      <div class="diag-player-head">
        <div class="diag-player-avatar">${playerId.charAt(0).toUpperCase()}</div>
        <div class="diag-player-meta">
          <h2 id="diag-player-tag">Loading…</h2>
          <span class="player-id mono muted">ID ${esc(playerId)}</span>
        </div>
      </div>
      <p class="muted">Loading calculation diagnostic data…</p>
    `;
  }
  if (diagBody) {
    diagBody.innerHTML = '';
  }

  diagnosticModal.showModal();
  document.body.classList.add('mobile-scroll-locked');

  // Focus modal
  const closeBtn = $('#modal-close-btn');
  if (closeBtn) closeBtn.focus();

  try {
    const gameData = await getGameData(game);
    if (!window.ClientRankingEngine) {
      throw new Error('Ranking engine client library not found.');
    }

    const calcSystem = (diagState.system === 'overview' || diagState.system === 'comparison') ? 'glicko2' : diagState.system;
    const engine = new window.ClientRankingEngine(gameData);
    const result = engine.calculate(calcSystem, diagState.mode, diagState.startDate || null, diagState.endDate || null, diagState.playerId, prWeights);

    // Also calculate Glicko2 if calcSystem is custom and has empty history
    let glickoRes = null;
    if (calcSystem === 'custom' && (!result.diagnostic || !result.diagnostic.history || result.diagnostic.history.length === 0)) {
      try {
        glickoRes = engine.calculate('glicko2', diagState.mode, diagState.startDate || null, diagState.endDate || null, diagState.playerId);
      } catch (e) {}
    }

    diagState.diagData = result;
    diagState.allRankings = result.rankings || [];

    const pRankObj = diagState.allRankings.find(r => String(r.playerId) === String(diagState.playerId));
    diagState.playerTag = pRankObj ? pRankObj.playerTag : (result.diagnostic?.playerTag || `Player ${diagState.playerId}`);
    diagState.playerRank = pRankObj ? pRankObj.rank : (result.diagnostic?.playerRank || null);
    diagState.finalScore = pRankObj ? pRankObj.score : (result.diagnostic?.finalScore !== null ? result.diagnostic?.finalScore : null);

    // Map ranks to players for easy lookup
    const rankMap = new Map();
    diagState.allRankings.forEach(r => rankMap.set(String(r.playerId), r.rank));

    // Normalize sets
    const rawHistory = (result.diagnostic && result.diagnostic.history && result.diagnostic.history.length > 0)
      ? result.diagnostic.history
      : (glickoRes && glickoRes.diagnostic && glickoRes.diagnostic.history ? glickoRes.diagnostic.history : []);

    // Filter sets by date if in period_only or period_performance
    let filteredHistory = rawHistory;
    if (diagState.mode !== 'historical') {
      filteredHistory = rawHistory.filter(h => {
        if (!h.date) return true;
        if (diagState.startDate && h.date < diagState.startDate) return false;
        if (diagState.endDate && h.date > diagState.endDate) return false;
        return true;
      });
    }

    diagState.allSets = filteredHistory.map(h => {
      const won = h.outcome === 'win';
      const oppId = String(h.opponentId || '');
      const oppRank = rankMap.get(oppId) || null;

      let winChance = 0.5;
      if (h.expectedScore !== undefined && h.expectedScore !== null) {
        winChance = parseFloat(h.expectedScore) || 0.5;
      } else if (h.opponentPreRating !== undefined && h.playerPreRating !== undefined) {
        const diff = (h.playerPreRating - h.opponentPreRating);
        winChance = 1 / (1 + Math.pow(10, -diff / 400));
      } else if (h.opponentPreRating !== undefined && h.preScore !== undefined) {
        const diff = (h.preScore - h.opponentPreRating);
        winChance = 1 / (1 + Math.pow(10, -diff / 400));
      }

      let impact = 0;
      if (h.penalty !== undefined && h.penalty !== null) {
        impact = -parseFloat(h.penalty);
      } else if (h.contribution !== undefined && h.contribution !== null) {
        impact = parseFloat(h.contribution);
      } else if (h.credit !== undefined && h.credit !== null) {
        impact = parseFloat(h.credit);
      } else if (h.change !== undefined && h.change !== null) {
        impact = parseFloat(h.change);
      } else if (h.qualityPoints !== undefined && h.qualityPoints !== null) {
        impact = parseFloat(h.qualityPoints);
      } else {
        impact = won ? 1.0 : -1.0;
      }

      // Format event name & clean up
      let eventTitle = h.event || 'Tournament';
      if (eventTitle.includes(' · ')) {
        eventTitle = eventTitle.split(' · ')[0];
      }

      return {
        setId: h.setId,
        eventId: h.eventId || h.tournamentSlug || eventTitle,
        eventKey: h.eventKey || h.tournamentSlug || eventTitle,
        tournamentSlug: h.tournamentSlug || '',
        eventName: eventTitle,
        eventDate: h.date || '',
        round: h.round ? (h.phase ? `${h.phase} ${h.round}` : h.round) : (h.phase || 'Bracket'),
        opponentId: oppId,
        opponentTag: h.opponentTag || `Player ${oppId}`,
        opponentRank: oppRank,
        won: won,
        score: h.scoreDisplay || h.displayScore || (won ? 'Won' : 'Lost'),
        winChance: Math.max(0.01, Math.min(0.99, winChance)),
        impact: impact,
        modelImpact: impact,
        eventChange: h.eventChange,
        eventPreScore: h.eventPreScore,
        eventPostScore: h.eventPostScore
      };
    });

    // Measure each set's importance against the selected ranking by recalculating
    // with that set removed, including downstream effects on later events.
    if (diagState.allSets.length > 0 && diagState.finalScore !== null) {
      const scoreWithAllSets = Number(pRankObj?.scoreExact ?? diagState.finalScore);
      const fixedNormalizationRanges = calcSystem === 'custom' ? result.normalizationRanges : null;
      const counterfactualScores = await calculateDiagnosticCounterfactualScores({
        gameData,
        sets: diagState.allSets,
        system: calcSystem,
        mode: diagState.mode,
        startDate: diagState.startDate || null,
        endDate: diagState.endDate || null,
        playerId: diagState.playerId,
        weights: prWeights,
        fixedNormalizationRanges
      });
      for (const set of diagState.allSets) {
        if (set.setId === undefined || set.setId === null) continue;
        const scoreWithoutSet = counterfactualScores[String(set.setId)];
        if (scoreWithoutSet !== undefined && scoreWithoutSet !== null && Number.isFinite(Number(scoreWithoutSet))) {
          const effect = Math.abs(scoreWithAllSets - Number(scoreWithoutSet));
          set.impact = effect * (set.won ? 1 : -1);
        } else {
          set.impact = null;
        }
      }
    }

    // Extract events summary from placements or sets
    const rawPlacements = (gameData.placements || []).filter(p => String(p.playerId) === String(diagState.playerId));
    let filteredPlacements = rawPlacements;
    if (diagState.mode !== 'historical') {
      filteredPlacements = rawPlacements.filter(p => {
        if (!p.date) return true;
        if (diagState.startDate && p.date < diagState.startDate) return false;
        if (diagState.endDate && p.date > diagState.endDate) return false;
        return true;
      });
    }

    const eventMap = new Map();
    filteredPlacements.forEach(p => {
      const key = p.eventKey || p.tournamentSlug || p.eventId || p.tournamentName || p.eventName;
      if (!eventMap.has(key)) {
        eventMap.set(key, {
          eventKey: key,
          tournamentSlug: p.tournamentSlug || '',
          name: p.tournamentName || p.eventName || 'Tournament',
          date: p.date || '',
          placement: p.placement,
          entrants: p.entrants || 0
        });
      }
    });

    // Also populate any events in sets that might be missing in placements
    diagState.allSets.forEach(s => {
      const key = s.eventKey || s.eventId || s.eventName;
      if (!eventMap.has(key)) {
        eventMap.set(key, {
          eventKey: key,
          tournamentSlug: s.tournamentSlug || '',
          name: s.eventName,
          date: s.eventDate,
          placement: null,
          entrants: null
        });
      }
    });

    diagState.allEvents = Array.from(eventMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Render modal view
    renderDiagnosticHeader();
    bindDiagnosticTabs();
    renderDiagnosticActiveTab();

  } catch (err) {
    if (diagHeader) {
      diagHeader.innerHTML = `<h2>Diagnostic Error</h2>`;
    }
    if (diagBody) {
      diagBody.innerHTML = `<div class="diag-empty-card"><p>${esc(err.message)}</p></div>`;
    }
  }
};

function renderDiagnosticHeader() {
  const diagHeader = $('#diag-header');
  if (!diagHeader) return;

  const tag = diagState.playerTag;
  const pId = diagState.playerId;
  const rank = diagState.playerRank;
  const score = diagState.finalScore !== null ? diagState.finalScore : '-';
  const scoreNum = parseFloat(score) || 0;
  const isGlicko = diagState.system === 'glicko2' || (scoreNum > 100);
  const maxScore = isGlicko ? (Math.max(2200, Math.ceil(scoreNum / 100) * 100)) : 100;
  const scorePct = Math.min(100, Math.max(0, (scoreNum / maxScore) * 100));

  // Determine neighbors for summary sentence & where it sits
  const neighbors = getPlayerNeighbors(pId, diagState.allRankings);

  // Date range formatted chip
  const dateRangeStr = formatDiagDateRange(diagState.startDate, diagState.endDate) || (diagState.mode === 'historical' ? 'All-time' : 'Full history');
  const systemName = (diagState.system === 'custom' || diagState.system === 'power_rankings') ? 'Power Rankings' : (getSystemNames()[diagState.system] || diagState.system);

  const initial = tag.charAt(0).toUpperCase();

  let rankCls = 'place-accent';
  if (rank === 1) rankCls = 'place-gold';
  else if (rank === 2) rankCls = 'place-silver';
  else if (rank === 3) rankCls = 'place-bronze';

  const decidedSentence = generateDecidedSentence(tag, rank, diagState.allSets, diagState.allEvents);

  diagHeader.innerHTML = `
    <div class="diag-player-head">
      <div class="diag-player-avatar" id="diag-player-avatar">
        <img src="assets/players/${esc(pId)}.png" alt="${esc(tag)}" onerror="this.onerror=null; this.parentNode.textContent='${esc(initial)}';">
      </div>
      <div class="diag-player-meta">
        <h2 id="diag-player-tag">${esc(tag)}</h2>
        <span class="player-id mono muted">ID ${esc(pId)}</span>
      </div>
    </div>

    <div class="diag-chips-row" id="diag-chips">
      <span class="diag-chip">${esc(diagState.gameName)}</span>
      <span class="diag-chip">${esc(systemName)}</span>
      <span class="diag-chip">${esc(dateRangeStr)}</span>
      ${diagState.mode === 'period_only' ? '<span class="diag-chip muted">Counts this period only</span>' : ''}
    </div>

    <div class="diag-stats-summary-row">
      <div class="diag-badge-card diag-rank-block">
        ${getDiagHexagonSvg(rank)}
        <div class="diag-rank-num-group">
          <span class="rank-label">Rank</span>
          <span class="rank-val ${rankCls}">#${rank ? rank : '-'}</span>
        </div>
      </div>

      <div class="diag-badge-card score-card">
        <div class="diag-score-title">Final Score</div>
        <div class="diag-score-value-row">
          <span class="score-num font-bold">${score}</span>
          <span class="score-max">/ ${maxScore}</span>
        </div>
        <div class="diag-progress-track">
          <div class="diag-progress-fill" style="width:${scorePct}%;"></div>
        </div>
      </div>
    </div>

    ${decidedSentence ? `
      <div class="diag-decided-wrap">
        <div class="diag-decided-label">What decided this rank</div>
        <div class="diag-decided-text">${decidedSentence}</div>
      </div>
    ` : ''}
  `;

  // Update tab labels (e.g. Sets (24))
  const setsTab = $('#diag-tab-sets');
  if (setsTab) {
    setsTab.textContent = `Sets (${diagState.allSets.length})`;
  }
}

function getPlayerNeighbors(playerId, rankings) {
  if (!rankings || rankings.length === 0) return { above: null, below: null, list: [] };
  const idx = rankings.findIndex(r => String(r.playerId) === String(playerId));
  if (idx === -1) return { above: null, below: null, list: [] };

  const current = rankings[idx];
  const above = idx > 0 ? rankings[idx - 1] : null;
  const below = idx < rankings.length - 1 ? rankings[idx + 1] : null;

  // Window of up to 4 rows
  let start = Math.max(0, idx - 1);
  let end = Math.min(rankings.length, start + 4);
  if (end - start < 4 && start > 0) {
    start = Math.max(0, end - 4);
  }
  const list = rankings.slice(start, end);

  return { current, above, below, list };
}

function bindDiagnosticTabs() {
  const tabs = [
    { id: 'diag-tab-summary', key: 'summary' },
    { id: 'diag-tab-sets', key: 'sets' },
    { id: 'diag-tab-method', key: 'method' }
  ];

  tabs.forEach((tabInfo, idx) => {
    const el = $(`#${tabInfo.id}`);
    if (!el) return;

    el.onclick = () => {
      setDiagActiveTab(tabInfo.key);
    };

    el.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
        const nextEl = $(`#${tabs[nextIdx].id}`);
        if (nextEl) {
          nextEl.focus();
          setDiagActiveTab(tabs[nextIdx].key);
        }
      }
    };
  });
}

function setDiagActiveTab(tabKey) {
  diagState.activeTab = tabKey;
  ['summary', 'sets', 'method'].forEach(k => {
    const tabEl = $(`#diag-tab-${k}`);
    if (tabEl) {
      const active = (k === tabKey);
      tabEl.classList.toggle('active', active);
      tabEl.setAttribute('aria-selected', active ? 'true' : 'false');
      tabEl.setAttribute('tabindex', active ? '0' : '-1');
    }
  });
  renderDiagnosticActiveTab();
  const diagBody = $('#diag-body');
  if (diagBody) diagBody.scrollTop = 0;
}

function renderDiagnosticActiveTab() {
  const diagBody = $('#diag-body');
  if (!diagBody) return;

  if (diagState.activeTab === 'summary') {
    diagBody.innerHTML = renderDiagSummaryTab();
  } else if (diagState.activeTab === 'sets') {
    diagBody.innerHTML = renderDiagSetsTab();
    bindDiagSetsControls();
  } else if (diagState.activeTab === 'method') {
    diagBody.innerHTML = renderDiagMethodTab();
  }
}

function isCustomDiagnostic() {
  return ['custom', 'power_rankings'].includes(diagState.system);
}

function getDiagnosticPlayerRankEntry(playerId) {
  return diagState.allRankings.find(row => String(row.playerId) === String(playerId)) || null;
}

function renderCustomScoreBreakdown() {
  const player = getDiagnosticPlayerRankEntry(diagState.playerId);
  const contributions = player?.weightedContributions || {};
  const weights = player?.weights || {};
  const rows = Object.entries(PR_COMPONENTS).filter(([key]) => Number(weights[key]) > 0);

  if (!rows.length) return '<div class="diag-empty-card">No component score details are available.</div>';

  return `
    <div class="diag-custom-contrib-list">
      ${rows.map(([key, component]) => {
        const contribution = Number(contributions[key]) || 0;
        const weight = Number(weights[key]) || 0;
        const pct = weight > 0 ? Math.max(0, Math.min(100, (contribution / weight) * 100)) : 0;
        return `
          <div class="diag-custom-contrib-row">
            <span class="diag-custom-contrib-name">${esc(component.name)}</span>
            <div class="diag-custom-contrib-track"><div style="width:${pct}%;background:${component.color};"></div></div>
            <span class="diag-custom-contrib-value mono">${contribution.toFixed(1)} pts</span>
          </div>
        `;
      }).join('')}
      <p class="diag-custom-contrib-total">Contributions add up to the final score of ${Number(player?.score ?? diagState.finalScore).toFixed(1)}.</p>
    </div>
  `;
}

function renderSystemScoreFactors() {
  const breakdown = diagState.diagData?.diagnostic?.breakdown || {};
  let rows = [];
  if (diagState.system === 'sof') {
    rows = [
      ['Events counted', breakdown.eventsCount],
      ['Average event field', breakdown.avgFieldStrength],
      ['Event points', breakdown.totalEventPoints]
    ];
  } else if (diagState.system === 'quality_wins') {
    rows = [
      ['Eligible wins', breakdown.eligibleWins],
      ['Average win quality', breakdown.avgOpponentQuality],
      ['Win confidence', Number.isFinite(Number(breakdown.confidenceFactor)) ? `${Math.round(Number(breakdown.confidenceFactor) * 100)}%` : null]
    ];
  } else if (diagState.system === 'loss_quality') {
    rows = [
      ['Wins and losses', breakdown.wins !== undefined ? `${breakdown.wins}–${breakdown.losses}` : null],
      ['Credit from wins', breakdown.winCreditsTotal],
      ['Penalty from losses', breakdown.lossPenaltiesTotal]
    ];
  }

  const availableRows = rows.filter(([, value]) => value !== undefined && value !== null);
  if (!availableRows.length) return '<div class="diag-empty-card">No score details are available for this selection.</div>';
  return `
    <div class="diag-system-factor-list">
      ${availableRows.map(([label, value]) => `
        <div class="diag-system-factor-row"><span>${esc(label)}</span><strong class="mono">${esc(String(value))}</strong></div>
      `).join('')}
    </div>
  `;
}

function explainNeighborScoreDifference(player, neighbor) {
  const scoreDifference = Math.abs((Number(player?.score) || 0) - (Number(neighbor?.score) || 0));
  const currentIsAhead = (Number(player?.score) || 0) >= (Number(neighbor?.score) || 0);
  const margin = `${scoreDifference.toFixed(1)} points ${currentIsAhead ? 'ahead' : 'behind'}`;

  if (isCustomDiagnostic()) {
    const currentContribs = player?.weightedContributions || {};
    const neighborContribs = neighbor?.weightedContributions || {};
    const differences = Object.entries(PR_COMPONENTS).map(([key, component]) => ({
      name: ({
        glicko2: 'overall rating strength',
        quality_wins: 'winning against stronger opponents',
        sof: 'facing stronger opponents',
        loss_quality: 'more consistent results'
      })[key] || component.name,
      difference: (Number(currentContribs[key]) || 0) - (Number(neighborContribs[key]) || 0)
    }));
    const currentEdges = differences.filter(item => item.difference > 0.05).sort((a, b) => b.difference - a.difference).slice(0, 2);
    const neighborEdges = differences.filter(item => item.difference < -0.05).sort((a, b) => a.difference - b.difference).slice(0, 2);
    const currentNames = currentEdges.map(item => item.name);
    const neighborNames = neighborEdges.map(item => item.name);

    if (currentIsAhead && currentNames.length && neighborNames.length) {
      return `${esc(diagState.playerTag)}'s advantages in ${esc(currentNames.join(' and '))} outweigh ${esc(neighbor.playerTag)}'s edge in ${esc(neighborNames.join(' and '))}, putting ${esc(diagState.playerTag)} ${margin}.`;
    }
    if (!currentIsAhead && currentNames.length && neighborNames.length) {
      return `Although ${esc(diagState.playerTag)} has an edge in ${esc(currentNames.join(' and '))}, ${esc(neighbor.playerTag)}'s advantage in ${esc(neighborNames.join(' and '))} leaves ${esc(diagState.playerTag)} ${margin}.`;
    }
    if (currentNames.length) {
      return `${esc(diagState.playerTag)}'s advantages in ${esc(currentNames.join(' and '))} leave them ${margin} of ${esc(neighbor.playerTag)}.`;
    }
    if (neighborNames.length) {
      return `${esc(neighbor.playerTag)}'s stronger ${esc(neighborNames.join(' and '))} contributions leave ${esc(diagState.playerTag)} ${margin}.`;
    }
  }

  return `${esc(diagState.playerTag)} is ${margin} of ${esc(neighbor.playerTag)} in this ranking.`;
}

function renderDiagSummaryTab() {
  const sets = diagState.allSets;
  const events = diagState.allEvents;
  const pId = diagState.playerId;
  const pTag = diagState.playerTag;
  const rank = diagState.playerRank;
  const neighbors = getPlayerNeighbors(pId, diagState.allRankings);

  // 1. At a glance metrics
  const setsPlayedCount = sets.length;
  const winsCount = sets.filter(s => s.won).length;
  const lossesCount = sets.filter(s => !s.won).length;
  const winRate = setsPlayedCount > 0 ? Math.round((winsCount / setsPlayedCount) * 100) : 0;

  const eventsCount = events.length;
  let eventDatesStr = '—';
  if (events.length > 0) {
    const sortedEv = [...events].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
    if (sortedEv.length > 0) {
      const firstD = sortedEv[0].date;
      const lastD = sortedEv[sortedEv.length - 1].date;
      eventDatesStr = formatDiagDateRange(firstD, lastD) || `${firstD} – ${lastD}`;
    }
  }

  // Best Result
  let bestPlacingStr = '—';
  let bestEventSub = '—';
  const placements = events.filter(e => e.placement !== null && e.placement !== undefined);
  if (placements.length > 0) {
    const sortedP = [...placements].sort((a, b) => a.placement - b.placement);
    const bestP = sortedP[0];
    const ord = (window.PRBadges && window.PRBadges.getOrdinal) ? window.PRBadges.getOrdinal(bestP.placement) : `#${bestP.placement}`;
    const bestPlacementCount = placements.filter(event => Number(event.placement) === Number(bestP.placement)).length;
    bestPlacingStr = ord;
    bestEventSub = bestPlacementCount > 1
      ? `${bestPlacementCount} times`
      : `${bestP.name}${bestP.entrants ? ` · ${bestP.entrants}` : ''}`;
  }

  // Record vs Top 10
  const top10Sets = sets.filter(s => s.opponentRank !== null && s.opponentRank <= 10);
  const top10Wins = top10Sets.filter(s => s.won).length;
  const top10Losses = top10Sets.filter(s => !s.won).length;
  const top10Rate = top10Sets.length > 0 ? Math.round((top10Wins / top10Sets.length) * 100) : 0;

  // 2. Where #N sits
  let whereSitsHtml = '';
  if (neighbors.list && neighbors.list.length > 0) {
    const scoreRowsHtml = neighbors.list.map(r => {
      const isCur = String(r.playerId) === String(pId);
      const sc = parseFloat(r.score) || 0;
      const maxSc = (diagState.system === 'glicko2') ? 2200 : 100;
      const pct = Math.min(100, Math.max(0, (sc / maxSc) * 100));
      let rankCls = 'place-accent';
      if (r.rank === 1) rankCls = 'place-gold';
      else if (r.rank === 2) rankCls = 'place-silver';
      else if (r.rank === 3) rankCls = 'place-bronze';

      return `
        <div class="diag-score-row ${isCur ? 'current' : ''}">
          <span class="rank-num ${rankCls}">#${r.rank}</span>
          <span class="player-tag">${esc(r.playerTag)}</span>
          <div class="score-bar-wrap">
            <div class="score-bar-fill" style="width:${pct}%;"></div>
          </div>
          <span class="score-num font-mono">${r.score}</span>
        </div>
      `;
    }).join('');

    // H2H against above and below
    const compareNeighbors = [neighbors.above, neighbors.below].filter(Boolean);
    const h2hRowsHtml = compareNeighbors.map(nb => {
      const vsSets = sets.filter(s => s.opponentId === String(nb.playerId));
      const w = vsSets.filter(s => s.won).length;
      const l = vsSets.filter(s => !s.won).length;
      let desc = 'No sets recorded';
      if (vsSets.length > 0) {
        const sortedVs = [...vsSets].sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
        const latest = sortedVs[0];
        if (latest.score && latest.score !== 'Won' && latest.score !== 'Lost') {
          desc = `${latest.won ? 'Won' : 'Lost'} ${latest.score} at ${latest.eventName}`;
        } else {
          desc = `${latest.won ? 'Won' : 'Lost'} at ${latest.eventName}`;
        }
      }
      return `
        <div class="diag-h2h-row">
          <div class="diag-h2h-info">
            <div>
              <span class="opp-tag">${esc(nb.playerTag)}</span>
            </div>
            <span class="opp-detail">${esc(desc)}</span>
          </div>
          <span class="diag-h2h-score font-mono">${w}–${l}</span>
        </div>
      `;
    }).join('');

    // Why sentences
    let whySentences = [];
    if (neighbors.above) {
      const nb = neighbors.above;
      const vsSets = sets.filter(s => s.opponentId === String(nb.playerId));
      const w = vsSets.filter(s => s.won).length;
      const l = vsSets.filter(s => !s.won).length;
      const current = getDiagnosticPlayerRankEntry(pId) || { playerTag: pTag, score: diagState.finalScore };
      whySentences.push(`<strong>Compared with ${esc(nb.playerTag)}:</strong> ${explainNeighborScoreDifference(current, nb)} Head-to-head: ${w}–${l}.`);
    }
    if (neighbors.below) {
      const nb = neighbors.below;
      const vsSets = sets.filter(s => s.opponentId === String(nb.playerId));
      const w = vsSets.filter(s => s.won).length;
      const l = vsSets.filter(s => !s.won).length;
      const current = getDiagnosticPlayerRankEntry(pId) || { playerTag: pTag, score: diagState.finalScore };
      whySentences.push(`<strong>Compared with ${esc(nb.playerTag)}:</strong> ${explainNeighborScoreDifference(current, nb)} Head-to-head: ${w}–${l}.`);
    }

    whereSitsHtml = `
      <div class="diag-card">
        <h3 class="diag-card-title">Where #${rank || '-'} sits</h3>
        <p class="diag-card-subtitle">The players on either side of ${esc(pTag)}, and how ${esc(pTag)} did against them.</p>

        <div class="diag-where-grid">
          <div>
            <div class="diag-section-label">Final scores</div>
            <div class="diag-score-rows">${scoreRowsHtml}</div>
          </div>
          <div>
            <div class="diag-section-label">Head-to-head</div>
            <div class="diag-h2h-rows">${h2hRowsHtml}</div>
          </div>
        </div>

        ${whySentences.length > 0 ? `
          <div class="diag-why-box">
            ${whySentences.join('<br><br>')}
          </div>
        ` : ''}
      </div>
    `;
  }

  // 3. Moments that shaped it
  let momentsHtml = '';
  if (setsPlayedCount === 0) {
    momentsHtml = `
      <div class="diag-card">
        <h3 class="diag-card-title">Moments that shaped it</h3>
        <p class="diag-card-subtitle">The sets that moved the score the most.</p>
        <div class="diag-empty-card">
          No sets are recorded for this player between ${esc(diagState.startDate || 'start')} and ${esc(diagState.endDate || 'end')}, so no significant win or loss moments could be identified.
        </div>
      </div>
    `;
  } else {
    const momentCandidates = getDiagnosticMomentCandidates(sets);
    const momentSubtitle = momentCandidates.excludedTournamentCount
      ? 'The first two tournaments are omitted to reduce the effect of early rating volatility.'
      : 'The sets that moved the score the most.';
    const noWinsText = momentCandidates.excludedTournamentCount ? 'No wins recorded after the first two tournaments' : 'No recorded wins';
    const noLossesText = momentCandidates.excludedTournamentCount ? 'No losses recorded after the first two tournaments' : 'No recorded losses';
    const wins = getDiagnosticImpactGroups(momentCandidates.sets, true).sort((a, b) => b.impact - a.impact).slice(0, 3);
    const losses = getDiagnosticImpactGroups(momentCandidates.sets, false).sort((a, b) => a.impact - b.impact).slice(0, 3);

    const renderMomentItem = (item) => {
      const sign = formatDiagnosticImpact(item.impact);
      const cls = item.impact >= 0 ? 'pos' : 'neg';

      return `
        <div class="diag-moment-item">
          <div class="diag-moment-info">
            <div>
              <span class="opp-name">${esc(item.opponentTag)}</span>
            </div>
            <span class="event-round">${esc(item.eventName)}</span>
          </div>
          <span class="diag-impact-val ${cls}">${sign}</span>
        </div>
      `;
    };

    momentsHtml = `
      <div class="diag-card">
        <h3 class="diag-card-title">Moments that shaped it</h3>
        <p class="diag-card-subtitle">${momentSubtitle}</p>
        <div class="diag-moments-grid">
          <div>
            <div class="diag-section-label">Best wins</div>
            <div class="diag-moment-list">
              ${wins.length > 0 ? wins.map(renderMomentItem).join('') : `<div class="muted font-13">${noWinsText}</div>`}
            </div>
          </div>
          <div>
            <div class="diag-section-label">Costliest losses</div>
            <div class="diag-moment-list">
              ${losses.length > 0 ? losses.map(renderMomentItem).join('') : `<div class="muted font-13">${noLossesText}</div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 4. Show the real Glicko rating timeline or event impacts for other systems.
  let chartHtml = '';
  const isTimeline = diagnosticUsesGlicko();
  const chartTitle = isTimeline ? 'Score over time' : 'Event impact over time';
  const chartSubtitle = isTimeline ? 'The rating after each event, shown on a true time scale.' : 'Combined set impacts at each event; wins are positive and losses are negative.';
  if (setsPlayedCount === 0) {
    chartHtml = `
      <div class="diag-card">
        <h3 class="diag-card-title">${chartTitle}</h3>
        <p class="diag-card-subtitle">${chartSubtitle}</p>
        <div class="diag-empty-card">
          No sets are recorded for this player between ${esc(diagState.startDate || 'start')} and ${esc(diagState.endDate || 'end')}, so this chart is unavailable.
        </div>
      </div>
    `;
  } else {
    const scoreContent = `<div class="diag-chart-container">${isTimeline ? renderScoreChartSvg(sets, events) : renderEventImpactChartSvg(sets)}</div>`;
    chartHtml = `
      <div class="diag-card">
        <h3 class="diag-card-title">${chartTitle}</h3>
        <p class="diag-card-subtitle">${chartSubtitle}</p>
        ${scoreContent}
      </div>
    `;
  }

  // 5. Footnote
  const footnoteHtml = `
    <div class="diag-footnote">
      Based on ${setsPlayedCount} sets across ${eventsCount} events
    </div>
  `;

  return `
    <div class="diag-glance-grid">
      <div class="diag-glance-tile">
        <span class="tile-label">Sets played</span>
        <span class="tile-value">${setsPlayedCount}</span>
        <span class="tile-sub">${setsPlayedCount > 0 ? `${winsCount}W – ${lossesCount}L · ${winRate}% win rate` : '—'}</span>
      </div>
      <div class="diag-glance-tile">
        <span class="tile-label">Events</span>
        <span class="tile-value">${eventsCount}</span>
        <span class="tile-sub">${esc(eventDatesStr)}</span>
      </div>
      <div class="diag-glance-tile">
        <span class="tile-label">Best result</span>
        <span class="tile-value">${bestPlacingStr}</span>
        <span class="tile-sub">${esc(bestEventSub)}</span>
      </div>
      <div class="diag-glance-tile">
        <span class="tile-label">vs Top 10</span>
        <span class="tile-value">${top10Sets.length > 0 ? `${top10Wins}–${top10Losses}` : '0–0'}</span>
        <span class="tile-sub">${top10Sets.length > 0 ? `${top10Rate}% win rate` : '—'}</span>
      </div>
    </div>

    ${whereSitsHtml}
    ${momentsHtml}
    ${chartHtml}
    ${footnoteHtml}
  `;
}

// Show observed event impact values without inventing a cumulative score path.
function renderEventImpactChartSvg(sets) {
  const byEvent = new Map();
  sets.forEach(set => {
    const key = set.eventKey || set.eventId || set.eventName;
    if (!byEvent.has(key)) byEvent.set(key, { label: set.eventName || 'Event', date: set.eventDate, impact: 0 });
    const impact = Number(set.impact);
    if (Number.isFinite(impact)) byEvent.get(key).impact += impact;
  });
  const points = Array.from(byEvent.values()).filter(point => point.date && Number.isFinite(Date.parse(`${point.date}T00:00:00`)))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) return '<div class="diag-empty-card">Event impact history is unavailable.</div>';

  const w = 800, h = 260, padLeft = 48, padRight = 36, padTop = 28, padBottom = 40;
  const chartW = w - padLeft - padRight, chartH = h - padTop - padBottom;
  const minTime = Date.parse(`${points[0].date}T00:00:00`);
  const maxTime = Date.parse(`${points[points.length - 1].date}T00:00:00`);
  const maxAbs = Math.max(1, ...points.map(point => Math.abs(point.impact)));
  const extent = maxAbs * 1.12;
  const y = value => padTop + chartH / 2 - (value / (extent * 2)) * chartH;
  const x = point => padLeft + (maxTime === minTime ? chartW / 2 : ((Date.parse(`${point.date}T00:00:00`) - minTime) / (maxTime - minTime)) * chartW);
  const zeroY = y(0);
  const stems = points.map(point => {
    const px = x(point), py = y(point.impact), color = point.impact >= 0 ? '#9fd6ff' : '#ffb38a';
    return `<line x1="${px}" y1="${zeroY}" x2="${px}" y2="${py}" stroke="${color}" stroke-width="3" stroke-linecap="round"><title>${esc(point.label)} · ${esc(point.date)} · ${point.impact >= 0 ? '+' : ''}${point.impact.toFixed(1)}</title></line><circle cx="${px}" cy="${py}" r="4" fill="${color}"/>`;
  }).join('');
  const ticks = [];
  const first = new Date(minTime), last = new Date(maxTime);
  if (last.getUTCFullYear() > first.getUTCFullYear()) {
    const step = Math.max(1, Math.ceil((last.getUTCFullYear() - first.getUTCFullYear()) / 5));
    for (let year = first.getUTCFullYear(); year <= last.getUTCFullYear(); year += step) ticks.push({ date: `${year}-01-01`, label: String(year) });
    const lastYear = String(last.getUTCFullYear());
    if (!ticks.some(tick => tick.label === lastYear)) ticks.push({ date: `${lastYear}-01-01`, label: lastYear });
  } else {
    const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    while (cursor <= last) {
      ticks.push({ date: cursor.toISOString().slice(0, 10), label: cursor.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  const axisLabels = ticks.map(tick => {
    const time = Date.parse(`${tick.date}T00:00:00`);
    if (time < minTime || time > maxTime) return '';
    const px = padLeft + (maxTime === minTime ? chartW / 2 : ((time - minTime) / (maxTime - minTime)) * chartW);
    return `<text x="${px}" y="${h - 10}" fill="#94a3b8" font-size="11" font-family="'JetBrains Mono', monospace" text-anchor="middle">${tick.label}</text>`;
  }).join('');
  const valueLabels = [-maxAbs, 0, maxAbs].map(value => `<text x="${padLeft - 8}" y="${y(value) + 4}" fill="#94a3b8" font-size="11" font-family="'JetBrains Mono', monospace" text-anchor="end">${value > 0 ? '+' : ''}${value.toFixed(1)}</text>`).join('');
  return `<svg class="diag-chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Combined set impact by event over time"><line x1="${padLeft}" y1="${zeroY}" x2="${w - padRight}" y2="${zeroY}" stroke="rgba(255,255,255,0.2)"/>${valueLabels}${stems}${axisLabels}</svg>`;
}

// Generate the responsive SVG score chart
function renderScoreChartSvg(sets, events) {
  const isGlicko = true;
  let eventsByDate;
  if (isGlicko) {
    const byEvent = new Map();
    sets.forEach(s => {
      const key = s.eventKey || s.eventId || s.eventName;
      if (!byEvent.has(key)) {
        byEvent.set(key, {
          name: s.eventName,
          date: s.eventDate,
          preScore: s.eventPreScore,
          postScore: s.eventPostScore,
          change: s.eventChange
        });
      }
    });
    eventsByDate = Array.from(byEvent.values()).filter(e => e.date && e.postScore !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  const points = [];
  let biggestGain = -Infinity;
  let biggestGainPoint = null;

  if (eventsByDate.length === 0) {
    points.push({ label: 'Initial', score: diagState.finalScore || 70, date: '2025-01-01' });
  } else {
    const startingScore = Number(eventsByDate[0].preScore);
    if (Number.isFinite(startingScore)) {
      const firstDate = new Date(`${eventsByDate[0].date}T00:00:00`);
      firstDate.setDate(firstDate.getDate() - 1);
      points.push({ label: 'Starting score', score: startingScore, date: firstDate.toISOString().slice(0, 10), gain: 0 });
    }
    eventsByDate.forEach(ev => {
      const score = Number(ev.postScore);
      const gain = Number(ev.change);
      const pt = { label: ev.name, score, date: ev.date, gain };
      points.push(pt);
      if (gain > biggestGain) {
        biggestGain = gain;
        biggestGainPoint = pt;
      }
    });
  }

  const scores = points.map(p => p.score);
  const rawMin = Math.min(...scores);
  const rawMax = Math.max(...scores);
  const padding = Math.max(10, (rawMax - rawMin) * 0.08);
  const minScore = Math.floor((rawMin - padding) / 10) * 10;
  const maxScore = Math.ceil((rawMax + padding) / 10) * 10;
  const range = Math.max(1, maxScore - minScore);

  const w = 800;
  const h = 260;
  const padLeft = 45;
  const padRight = 70;
  const padTop = 30;
  const padBottom = 40;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const dateTimes = points.map(p => Date.parse(`${p.date}T00:00:00`)).filter(Number.isFinite);
  const minTime = Math.min(...dateTimes);
  const maxTime = Math.max(...dateTimes);
  const getX = (_idx, p) => padLeft + (maxTime <= minTime ? chartW / 2 : ((Date.parse(`${p.date}T00:00:00`) - minTime) / (maxTime - minTime)) * chartW);
  const getY = (val) => padTop + chartH - ((val - minScore) / range) * chartH;

  const coords = points.map((p, idx) => ({ x: getX(idx, p), y: getY(p.score), ...p }));

  const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;

  // Grid lines
  const gridVals = [minScore, Math.round((minScore + maxScore) / 2), maxScore];
  const gridLines = gridVals.map(val => {
    const y = getY(val);
    return `
      <line x1="${padLeft}" y1="${y}" x2="${w - padRight}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4,4"/>
      <text x="${padLeft - 10}" y="${y + 4}" fill="#94a3b8" font-size="11" font-family="'JetBrains Mono', monospace" text-anchor="end">${val}</text>
    `;
  }).join('');

  // Use year labels for multi-year ranges, otherwise month labels.
  const firstDate = new Date(minTime);
  const lastDate = new Date(maxTime);
  const yearSpan = lastDate.getUTCFullYear() - firstDate.getUTCFullYear();
  const axisTicks = [];
  if (yearSpan >= 1) {
    const step = Math.max(1, Math.ceil(yearSpan / 5));
    for (let year = firstDate.getUTCFullYear(); year <= lastDate.getUTCFullYear(); year += step) axisTicks.push({ date: `${year}-01-01`, label: String(year) });
    const lastYear = String(lastDate.getUTCFullYear());
    if (!axisTicks.some(t => t.label === lastYear)) axisTicks.push({ date: `${lastYear}-01-01`, label: lastYear });
  } else {
    const cursor = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1));
    while (cursor <= lastDate) {
      axisTicks.push({ date: cursor.toISOString().slice(0, 10), label: cursor.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  const monthLabels = axisTicks.map(tick => {
    const tickTime = Date.parse(`${tick.date}T00:00:00`);
    if (tickTime < minTime || tickTime > maxTime) return '';
    const x = padLeft + (maxTime <= minTime ? chartW / 2 : ((tickTime - minTime) / (maxTime - minTime)) * chartW);
    return `<text x="${x}" y="${h - 10}" fill="#94a3b8" font-size="11" font-family="'JetBrains Mono', monospace" text-anchor="middle">${tick.label}</text>`;
  }).join('');

  // Biggest gain point marker
  let biggestGainSvg = '';
  if (biggestGainPoint) {
    const bgCoord = coords.find(c => c.label === biggestGainPoint.label) || coords[0];
    const sign = bgCoord.gain > 0 ? `+${Math.round(bgCoord.gain * 10) / 10}` : `${Math.round(bgCoord.gain * 10) / 10}`;
    biggestGainSvg = `
      <circle cx="${bgCoord.x}" cy="${bgCoord.y}" r="7" fill="var(--accent, #9fd6ff)" stroke="rgba(16,24,50,0.9)" stroke-width="2"/>
      <text x="${bgCoord.x - 8}" y="${bgCoord.y - 12}" fill="#fff" font-size="12" font-family="'Space Grotesk', sans-serif" font-weight="600" text-anchor="end">${esc(bgCoord.label)} ${sign}</text>
    `;
  }

  // Final point marker
  const lastCoord = coords[coords.length - 1];
  const finalSvg = `
    <circle cx="${lastCoord.x}" cy="${lastCoord.y}" r="4" fill="var(--accent, #9fd6ff)"/>
    <text x="${lastCoord.x}" y="${lastCoord.y - 12}" fill="#fff" font-size="12" font-family="'Space Grotesk', sans-serif" font-weight="700" text-anchor="middle">Finished at ${lastCoord.score}</text>
  `;

  return `
    <svg class="diag-chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Score progression chart from ${minScore} to ${maxScore}, finishing at ${diagState.finalScore || scores[scores.length - 1]}">
      <defs>
        <linearGradient id="diagChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent, #9fd6ff)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--accent, #9fd6ff)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${monthLabels}
      <path d="${areaD}" fill="url(#diagChartGrad)"/>
      <path d="${lineD}" fill="none" stroke="var(--accent, #9fd6ff)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="var(--accent, #9fd6ff)"/>`).join('')}
      ${biggestGainSvg}
      ${finalSvg}
    </svg>
  `;
}

// Sets Tab Rendering
function renderDiagSetsTab() {
  const allSets = diagState.allSets;

  if (allSets.length === 0) {
    return `
      <div class="diag-card">
        <h3 class="diag-card-title">Sets (${allSets.length})</h3>
        <div class="diag-empty-card">
          No sets are recorded for this player between ${esc(diagState.startDate || 'start')} and ${esc(diagState.endDate || 'end')}.
        </div>
      </div>
      <div class="diag-footnote">0 sets across 0 events</div>
    `;
  }

  // Filter sets
  let filtered = allSets;
  if (diagState.setsFilter === 'wins') {
    filtered = allSets.filter(s => s.won);
  } else if (diagState.setsFilter === 'losses') {
    filtered = allSets.filter(s => !s.won);
  } else if (diagState.setsFilter === 'impact') {
    filtered = [...allSets].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  // Sort sets
  let sorted = [...filtered];
  if (diagState.setsSort === 'newest') {
    sorted.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
  } else if (diagState.setsSort === 'oldest') {
    sorted.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));
  } else if (diagState.setsSort === 'impact') {
    sorted.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  // Group by event
  const eventGroupMap = new Map();
  sorted.forEach(s => {
    const eventGroupKey = s.eventKey || s.eventId || s.eventName;
    if (!eventGroupMap.has(eventGroupKey)) {
      const evMeta = diagState.allEvents.find(e => e.name === s.eventName) || { name: s.eventName, date: s.eventDate, placement: null, entrants: null };
      eventGroupMap.set(eventGroupKey, {
        meta: evMeta,
        sets: []
      });
    }
    eventGroupMap.get(eventGroupKey).sets.push(s);
  });

  const eventGroups = Array.from(eventGroupMap.values());
  const visibleGroups = diagState.showAllEvents ? eventGroups : eventGroups.slice(0, 3);

  const winsCount = allSets.filter(s => s.won).length;
  const lossesCount = allSets.filter(s => !s.won).length;
  const setsExplanation = diagnosticUsesGlicko()
    ? 'Event net impact shows the score change for the whole event. Set Impact estimates this result’s contribution to the final score; wins are positive and losses negative. Repeated results against the same player in one event are combined in the Summary.'
    : 'Win chance indicates estimated probability before the set; Impact estimates this result’s contribution to the final score. Wins are positive and losses negative. Repeated results against the same player in one event are combined in the Summary.';

  const eventCardsHtml = visibleGroups.map(grp => {
    const ev = grp.meta;
    const netImpact = diagnosticUsesGlicko()
      ? Math.round((Number(grp.sets[0].eventChange) || 0) * 10) / 10
      : Math.round(grp.sets.reduce((acc, s) => acc + (Number(s.modelImpact) || 0), 0) * 10) / 10;
    const netSign = netImpact > 0 ? `+${netImpact}` : `${netImpact}`;
    const netCls = netImpact >= 0 ? 'pos' : 'neg';

    const placeStr = ev.placement ? `${(window.PRBadges && window.PRBadges.getOrdinal) ? window.PRBadges.getOrdinal(ev.placement) : '#' + ev.placement}${ev.entrants ? ' of ' + ev.entrants : ''}` : '';
    const datePlaceStr = [ev.date, placeStr].filter(Boolean).join(' · ');

    const rowsHtml = grp.sets.map(s => {
      const resCls = s.won ? 'pos' : 'neg';
      const resText = s.won ? `W ${s.score}` : `L ${s.score}`;
      const hasImpact = s.impact !== null && s.impact !== undefined && Number.isFinite(Number(s.impact));
      const impSign = hasImpact ? formatDiagnosticImpact(s.impact) : '—';
      const impCls = !hasImpact ? 'muted' : (s.impact >= 0 ? 'pos' : 'neg');
      const pct = Math.round(s.winChance * 100);

      // Desktop row
      const desktopRow = `
        <div class="diag-set-row-desktop">
          <span class="set-round">${esc(s.round)}</span>
          <span class="set-opp">${esc(s.opponentTag)}</span>
          <span class="set-res ${resCls}">${esc(resText)}</span>
          <div class="set-chance-wrap">
            <div class="chance-bar"><div class="chance-bar-fill" style="width:${pct}%;"></div></div>
            <span class="chance-num font-mono">${pct}%</span>
          </div>
          <span class="set-impact font-mono ${impCls}">${impSign}</span>
        </div>
      `;

      // Mobile card
      const mobileCard = `
        <div class="diag-set-card-mobile">
          <div class="line-1">
            <span class="round-caps font-mono">${esc(s.round)}</span>
            <span class="diag-impact-val ${impCls}">${impSign}</span>
          </div>
          <div class="line-2">
            <div>
              <span class="opp-bold">${esc(s.opponentTag)}</span>
            </div>
            <span class="score-res ${resCls}">${esc(resText)}</span>
          </div>
          <div class="line-3">
            <span class="chance-label">WIN CHANCE</span>
            <div class="chance-bar"><div class="chance-bar-fill" style="width:${pct}%;"></div></div>
            <span class="chance-num">${pct}%</span>
          </div>
        </div>
      `;

      return desktopRow + mobileCard;
    }).join('');

    return `
      <div class="diag-event-card">
        <div class="diag-event-head">
          <div class="diag-event-meta">
            <h4 class="diag-event-name">${esc(ev.name)}</h4>
            <span class="diag-event-sub">${esc(datePlaceStr)}</span>
          </div>
          <div class="diag-event-impact">
            <span class="net-label">Net impact</span>
            <span class="net-val ${netCls}">${netSign}</span>
          </div>
        </div>
        ${rowsHtml}
      </div>
    `;
  }).join('');

  const showMoreBtnHtml = (!diagState.showAllEvents && eventGroups.length > 3) ? `
    <button class="diag-show-more-btn" id="diag-btn-show-all-events">
      Show all ${eventGroups.length} events
    </button>
  ` : '';

  return `
    <div class="diag-sets-toolbar">
      <div class="diag-filter-chips">
        <button class="diag-filter-btn ${diagState.setsFilter === 'all' ? 'active' : ''}" data-filter="all">All ${allSets.length}</button>
        <button class="diag-filter-btn ${diagState.setsFilter === 'wins' ? 'active' : ''}" data-filter="wins">Wins ${winsCount}</button>
        <button class="diag-filter-btn ${diagState.setsFilter === 'losses' ? 'active' : ''}" data-filter="losses">Losses ${lossesCount}</button>
        <button class="diag-filter-btn ${diagState.setsFilter === 'impact' ? 'active' : ''}" data-filter="impact">Biggest impact</button>
      </div>

      <div class="diag-sort-wrap">
        <label for="diag-sort-select" class="mono muted font-12">Sort by:</label>
        <select id="diag-sort-select" class="diag-sort-select">
          <option value="newest" ${diagState.setsSort === 'newest' ? 'selected' : ''}>Newest first</option>
          <option value="oldest" ${diagState.setsSort === 'oldest' ? 'selected' : ''}>Oldest first</option>
          <option value="impact" ${diagState.setsSort === 'impact' ? 'selected' : ''}>Biggest impact</option>
        </select>
      </div>
    </div>

    <div class="diag-sets-explanation">
      ${setsExplanation}
    </div>

    <div class="diag-table-head-row">
      <span>ROUND</span>
      <span>OPPONENT</span>
      <span>RESULT</span>
      <span>WIN CHANCE BEFORE SET</span>
      <span style="text-align:right;">IMPACT</span>
    </div>

    <div class="diag-event-cards">
      ${eventCardsHtml}
    </div>

    ${showMoreBtnHtml}

    <div class="diag-footnote">
      Based on ${allSets.length} sets across ${diagState.allEvents.length} events
    </div>
  `;
}

function bindDiagSetsControls() {
  const filterBtns = document.querySelectorAll('.diag-filter-btn');
  filterBtns.forEach(btn => {
    btn.onclick = () => {
      diagState.setsFilter = btn.getAttribute('data-filter');
      renderDiagnosticActiveTab();
    };
  });

  const sortSelect = $('#diag-sort-select');
  if (sortSelect) {
    sortSelect.onchange = () => {
      diagState.setsSort = sortSelect.value;
      renderDiagnosticActiveTab();
    };
  }

  const showMoreBtn = $('#diag-btn-show-all-events');
  if (showMoreBtn) {
    showMoreBtn.onclick = () => {
      diagState.showAllEvents = true;
      renderDiagnosticActiveTab();
    };
  }
}

// Method Tab Rendering
function renderDiagMethodTab() {
  const algo = diagState.diagData?.algorithm || {};
  const sysKey = diagState.system;
  const sysName = (sysKey === 'custom' || sysKey === 'power_rankings') ? 'Power Rankings' : (algo.name || sysKey);

  const dateRangeStr = formatDiagDateRange(diagState.startDate, diagState.endDate) || (diagState.mode === 'historical' ? 'All-time (no date restrictions)' : 'Full period');

  let modeDescription = 'Historical: uses all recorded sets across tournament history.';
  if (diagState.mode === 'period_only') {
    modeDescription = 'Period only: only sets played inside this date range count.';
  } else if (diagState.mode === 'period_performance') {
    modeDescription = 'Period performance: pre-period history establishes starting baseline ratings; performance is evaluated over the date range.';
  }

  const rawConfig = {
    system: sysKey,
    mode: diagState.mode,
    dateRange: {
      start: diagState.startDate || null,
      end: diagState.endDate || null
    },
    weights: diagState.diagData?.weights || prWeights,
    parameters: Object.fromEntries(
      Object.entries(algo.parameters || {}).filter(([key]) => !/formula/i.test(key))
    )
  };

  return `
    <div class="diag-card">
      <h3 class="diag-card-title">Rules for this ranking</h3>
      <dl class="diag-method-defs">
        <div class="diag-def-item">
          <dt>SYSTEM</dt>
          <dd>${esc(sysName)}</dd>
        </div>
        <div class="diag-def-item">
          <dt>GAME</dt>
          <dd>${esc(diagState.gameName)}</dd>
        </div>
        <div class="diag-def-item">
          <dt>DATE RANGE</dt>
          <dd>${esc(dateRangeStr)}</dd>
        </div>
        <div class="diag-def-item">
          <dt>MODE</dt>
          <dd>${esc(modeDescription)}</dd>
        </div>
      </dl>
    </div>

    <div class="diag-card">
      <h3 class="diag-card-title">How to read the Sets tab</h3>
      <dl class="diag-method-defs">
        <div class="diag-def-item">
          <dt>Round</dt>
          <dd>The tournament round or bracket phase in which the match was played.</dd>
        </div>
        <div class="diag-def-item">
          <dt>Opponent</dt>
          <dd>The player faced in this set.</dd>
        </div>
        <div class="diag-def-item">
          <dt>Result</dt>
          <dd>Whether the set was won (W) or lost (L) along with the final game count.</dd>
        </div>
        <div class="diag-def-item">
          <dt>Win chance</dt>
          <dd>The pre-match predicted probability of victory based on relative ratings.</dd>
        </div>
        <div class="diag-def-item">
          <dt>Impact</dt>
          <dd>An estimate of this result’s contribution to the final score. Wins are positive and losses are negative.</dd>
        </div>
      </dl>
    </div>

    <div class="diag-card">
      <h3 class="diag-card-title">Raw configuration</h3>
      <pre class="diag-code-block" tabindex="0">${esc(JSON.stringify(rawConfig, null, 2))}</pre>
    </div>

  `;
}


document.addEventListener('DOMContentLoaded', init);
