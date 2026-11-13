const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = dateStr => dateStr ? new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
const ord = n => { const x = Number(n); return x + ((x % 100 >= 11 && x % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[x % 10] || 'th')); };
const slug = new URLSearchParams(location.search).get('tournament');
const main = $('#main');
let playerDirectoryMap = new Map();
let currentEvent;
let activeGame = 'all';
let searchTerm = '';
let activeVodId = '';
let playAllMode = false;

async function loadPlayerDirectory() {
  try {
    const res = await fetch('data/profiles/index.json', { cache: 'no-store' });
    if (res.ok) (await res.json()).forEach(p => { if (p.playerId) playerDirectoryMap.set(String(p.playerId), p); });
  } catch (_) { /* player links still render without profile metadata */ }
}

async function loadEvent() {
  if (!slug) { main.innerHTML = '<div class="panel glass empty-state"><h2>No tournament selected</h2><p class="muted"><a href="events.html">Return to event directory</a></p></div>'; return; }
  try {
    const [res] = await Promise.all([fetch(`data/events/${encodeURIComponent(slug)}.json`, { cache: 'no-store' }), loadPlayerDirectory()]);
    if (!res.ok) throw new Error('Tournament details not found.');
    currentEvent = await res.json();
    renderEvent(currentEvent);
  } catch (error) {
    main.innerHTML = `<div class="panel glass empty-state"><h2>Event unavailable</h2><p class="muted">${esc(error.message)}</p><p style="margin-top:12px"><a href="events.html" class="action-button">Return to Event Directory</a></p></div>`;
  }
}

const norm = name => String(name || '').trim().toLocaleLowerCase();
const gameKey = game => norm(game);
const lang = () => window.i18n?.getLang?.() === 'es';
const charIcon = character => {
  if (!character?.stockIcon) return '<span class="event-character event-character-empty" aria-hidden="true">?</span>';
  const src = esc(character.stockIcon.replace(/\.png$/, '.webp'));
  return `<span class="event-character"><span>${esc((character.name || '?')[0])}</span><img src="${src}" alt="${esc(character.name || '')}" title="${esc(character.name || '')}" loading="lazy" onload="this.previousElementSibling.remove()" onerror="this.remove()"></span>`;
};
const fullCharacterArt = character => {
  if (!character?.stockIcon) return '';
  const src = esc(character.stockIcon.replace(/\/stocks\/([^/]+)$/, '/portraits/$1').replace(/\.png$/, '.webp'));
  return `<img class="podium-character-art" src="${src}" alt="${esc(character.name || '')}" title="${esc(character.name || '')}" loading="lazy" onerror="this.remove()">`;
};
function playerLink(st) {
  const name = esc(st.tag || 'Player');
  return st.playerId ? `<a class="standing-tag opponent-link" href="player.html?player=${encodeURIComponent(st.playerId)}">${name}</a>` : `<span class="standing-tag">${name}</span>`;
}
function playerSponsor(st) {
  const profile = st.playerId ? playerDirectoryMap.get(String(st.playerId)) : null;
  const sponsor = String(st.sponsor || profile?.sponsor || '').trim();
  return sponsor ? `<span class="podium-sponsor mono">${esc(sponsor)}</span>` : '';
}
function renderBracket(sub) {
  const standings = sub.standings || [];
  const podium = standings.filter(st => Number(st.placement) <= 3);
  const remaining = standings.filter(st => Number(st.placement) > 3);
  const podiumHtml = podium.length ? `<div class="event-podium">${podium.map(st => `<article class="event-podium-card place-${st.placement}">${fullCharacterArt(st.character)}<div class="podium-player">${playerSponsor(st)}${playerLink(st)}</div><span class="podium-place">${ord(st.placement)}</span></article>`).join('')}</div>` : '';
  const rows = remaining.map(st => `<div class="standing-row"><span class="placement-badge p${st.placement} mono">${ord(st.placement)}</span>${charIcon(st.character)}${playerLink(st)}</div>`).join('');
  const entrantsLabel = lang() ? `${sub.entrants} participante${sub.entrants === 1 ? '' : 's'}` : `${sub.entrants} entrant${sub.entrants === 1 ? '' : 's'}`;
  return `<section class="panel glass bracket-card"><header class="bracket-card-head"><div><h2>${esc(sub.title || sub.game)}</h2></div><span class="mono muted event-entrant-count">${esc(entrantsLabel)}</span></header>${podiumHtml}<div class="standings-list">${rows || (!podium.length ? '<p class="muted">No standings recorded.</p>' : '')}</div></section>`;
}

function isAmateurVod(vod) {
  return vod.isAmateur === true
    || /\b(?:cat(?:egoria)?\s*\.?\s*b|amateur)\b/i.test(String(vod.title || ''))
    || /^\s*\[(?:cat\.?\s*b|amateur)\]/i.test(String(vod.phaseLabel || vod.phase || ''));
}
function phaseText(vod) {
  const phase = String(vod.phaseLabel || vod.phase || '').trim();
  const round = String(vod.round || '').trim();
  if (/^pools?$/i.test(phase) || /^pools?$/i.test(round)) return phase || round;
  if (round && !/^top\s*\d+$/i.test(round)) return round;
  if (phase && !/^top\s*\d+$/i.test(phase)) return phase.replace(/^\s*\[(?:cat\.?\s*b|amateur)\]\s*/i, '');
  return round || phase || (lang() ? 'Llaves' : 'Bracket');
}
function vodPhaseSortKey(vod) {
  const phase = norm(vod.phaseLabel || vod.phase || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const round = norm(vod.round || '').replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  if (/^pools?$/.test(phase) || /^pools?$/.test(round)) return [0, 0];
  const p = (round && !/^top\s*\d+$/.test(round) ? round : phase).replace(/^\s*\[(?:cat\.?\s*b|amateur)\]\s*/, '');
  let m = p.match(/^winners?\s+round\s+(\d+)$/); if (m) return [0, Number(m[1])];
  if (/^winners?\s+(?:quarter[- ]?finals?|quarters?)$/.test(p)) return [1, 0];
  if (/^winners?\s+(?:semi[- ]?finals?|semis?)$/.test(p)) return [2, 0];
  if (/^winners?\s+finals?$/.test(p)) return [3, 0];
  m = p.match(/^losers?\s+round\s+(\d+)$/); if (m) return [4, Number(m[1])];
  if (/^losers?\s+(?:quarter[- ]?finals?|quarters?)$/.test(p)) return [5, 0];
  if (/^losers?\s+(?:semi[- ]?finals?|semis?)$/.test(p)) return [6, 0];
  if (/^losers?\s+finals?$/.test(p)) return [7, 0];
  if (/^grand\s+finals?$/.test(p)) return [8, 0];
  return [9, 0, p];
}
function orderedVods() {
  return (currentEvent.vods || []).map((vod, index) => ({ vod, index, key: vodPhaseSortKey(vod) })).sort((a, b) => {
    if (isAmateurVod(a.vod) !== isAmateurVod(b.vod)) return isAmateurVod(a.vod) ? 1 : -1;
    for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) { const x = a.key[i] ?? '', y = b.key[i] ?? ''; if (x !== y) return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); }
    return a.index - b.index;
  }).map(x => x.vod);
}
function vodMatches(vod) {
  const vodGameKey = `${gameKey(vod.game)}${isAmateurVod(vod) ? '::amateur' : ''}`;
  if (activeGame !== 'all' && vodGameKey !== activeGame) return false;
  const q = searchTerm.trim().toLocaleLowerCase();
  return !q || [vod.title, phaseText(vod), vod.game, vod.player1?.tag, vod.player1?.sponsor, vod.player2?.tag, vod.player2?.sponsor].some(v => String(v || '').toLocaleLowerCase().includes(q));
}
function characterSlug(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function vodCharacterSides(vod) {
  const title = String(vod.title || '');
  const divider = Math.max(title.lastIndexOf(' - '), title.lastIndexOf(' – '), title.lastIndexOf(' — '));
  const matchup = (divider >= 0 ? title.slice(divider + 3) : title).trim();
  const match = matchup.match(/^(.*?)\s+\(([^()]*)\)\s+vs\s+(.*?)\s+\(([^()]*)\)\s*$/i);
  if (!match) return [];
  const parse = value => value.split(/[,/|;+&]/).map(name => name.trim()).filter(Boolean);
  return [
    { tag: match[1].trim(), characters: parse(match[2]) },
    { tag: match[3].trim(), characters: parse(match[4]) }
  ];
}
function vodCharacterNames(vod, player) {
  if (Array.isArray(player?.characters)) return player.characters.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
  const tag = String(player?.tag || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return vodCharacterSides(vod).find(side => side.tag.replace(/\s+/g, ' ').toLocaleLowerCase() === tag)?.characters || [];
}
function vodCharacters(vod) {
  return [vodCharacterNames(vod, vod.player1)[0] || '', vodCharacterNames(vod, vod.player2)[0] || ''];
}
function vodId(vod) { return vod.videoId || new URL(vod.url || '', location.href).searchParams.get('v') || ''; }
function renderVodCard(vod) {
  const p1 = vod.player1 || {}, p2 = vod.player2 || {};
  const profile1 = p1.playerId ? playerDirectoryMap.get(String(p1.playerId)) : null;
  const profile2 = p2.playerId ? playerDirectoryMap.get(String(p2.playerId)) : null;
  const sponsor1 = p1.sponsor || profile1?.sponsor || '', sponsor2 = p2.sponsor || profile2?.sponsor || '';
  const game = vod.game || '';
  const videoId = vod.videoId || new URL(vod.url || '', location.href).searchParams.get('v') || '';
  const selected = activeVodId === videoId;
  const [char1, char2] = vodCharacters(vod);
  const icon = (name, side) => name ? `<img class="event-vod-character ${side}" src="assets/renders/${esc(vod.gameSlug || '')}/portraits/${esc(characterSlug(name))}.webp" alt="${esc(name)}" title="${esc(name)}" loading="lazy" onerror="this.remove()">` : '';
  const identity = (data, sponsor, second = false) => `<div class="event-vod-identity${second ? ' player-two' : ' player-one'}">${sponsor ? `<small>${esc(sponsor)}</small>` : ''}<b>${esc(data.tag || 'Player')}</b></div>`;
  return `<article class="event-vod-card ${selected ? 'is-playing' : ''}" data-vod="${esc(videoId)}" role="button" tabindex="0" aria-label="Play ${esc(p1.tag || '')} vs ${esc(p2.tag || '')}"><div class="event-vod-copy"><div class="event-vod-card-head"><div class="event-vod-game mono">${esc(game)}</div><div class="event-vod-round mono">${esc(phaseText(vod))}</div></div><div class="event-vod-match"><div class="event-vod-identities">${identity(p1, sponsor1)}<i>vs</i>${identity(p2, sponsor2, true)}</div><div class="event-vod-icons">${icon(char1, 'player-one')}<span aria-hidden="true"></span>${icon(char2, 'player-two')}</div></div></div></article>`;
}

function fitVodPlayerTags() {
  document.querySelectorAll('.event-vod-identity b').forEach(tag => {
    tag.style.fontSize = '';
    const column = tag.parentElement.clientWidth;
    let size = parseFloat(getComputedStyle(tag).fontSize) || 16;
    while (tag.getBoundingClientRect().width > column && size > 9) {
      size = Math.max(9, size - 0.25);
      tag.style.fontSize = `${size}px`;
    }
  });
}

function renderVods() {
  const filtered = orderedVods().filter(vodMatches);
  const grid = $('#event-vod-list');
  if (!grid) return;
  const emptyMessage = `<p class="event-vod-empty muted">${lang() ? 'No hay partidas que coincidan con los filtros.' : 'No matches found for these filters.'}</p>`;
  const eventGames = currentEvent.games || [];
  const gameNames = new Map(eventGames.map(game => [gameKey(game.name), game.name]));
  const groups = new Map();
  filtered.forEach(vod => {
    const key = gameKey(vod.game) || vod.gameSlug || 'unknown';
    if (!groups.has(key)) groups.set(key, { name: vod.game || key, regular: [], amateur: [] });
    groups.get(key)[isAmateurVod(vod) ? 'amateur' : 'regular'].push(vod);
  });
  const orderedGroups = [...groups.entries()].sort(([keyA, a], [keyB, b]) => {
    const nameA = gameKey(a.name), nameB = gameKey(b.name);
    const indexA = eventGames.findIndex(game => gameKey(game.name) === nameA);
    const indexB = eventGames.findIndex(game => gameKey(game.name) === nameB);
    if (indexA !== indexB && indexA >= 0 && indexB >= 0) return indexA - indexB;
    if (indexA >= 0) return -1;
    if (indexB >= 0) return 1;
    return String(keyA).localeCompare(String(keyB));
  });
  const multipleGames = eventGames.length > 1 || groups.size > 1;
  const regularHtml = orderedGroups.map(([, group]) => group.regular.length
    ? `${multipleGames ? `<h3 class="event-vod-group-title">${esc(gameNames.get(gameKey(group.name)) || group.name)}</h3>` : ''}${group.regular.map(renderVodCard).join('')}`
    : '').join('');
  const amateurHtml = orderedGroups.map(([, group]) => group.amateur.length
    ? `<h3 class="event-vod-group-title">${multipleGames ? `${esc(gameNames.get(gameKey(group.name)) || group.name)} · ` : ''}Amateur Bracket</h3>${group.amateur.map(renderVodCard).join('')}`
    : '').join('');
  grid.innerHTML = regularHtml || amateurHtml ? `${regularHtml}${amateurHtml}` : emptyMessage;
  requestAnimationFrame(fitVodPlayerTags);
  const player = $('#event-vod-player');
  const selectedVod = orderedVods().find(vod => vodId(vod) === activeVodId);
  const nowPlaying = $('#event-vod-now-playing');
  const matchup = $('#event-vod-playing-match');
  if (nowPlaying) nowPlaying.textContent = selectedVod ? [selectedVod.game, phaseText(selectedVod)].filter(Boolean).join(' · ') : '';
  if (matchup) {
    if (selectedVod) {
      const chars1 = vodCharacterNames(selectedVod, selectedVod.player1);
      const chars2 = vodCharacterNames(selectedVod, selectedVod.player2);
      const playerLabel = (player, chars) => `${player?.tag || 'Player'}${chars.length ? ` (${chars.join(', ')})` : ''}`;
      matchup.textContent = `${playerLabel(selectedVod.player1, chars1)} vs ${playerLabel(selectedVod.player2, chars2)}`;
    } else matchup.textContent = '';
  }
  if (player) {
    const playlistIds = playAllMode ? orderedVods().filter(vodMatches).map(vodId).filter(Boolean) : [];
    const playlistParam = playlistIds.length > 1 ? `&playlist=${playlistIds.map(encodeURIComponent).join(',')}` : '';
    player.innerHTML = activeVodId ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(activeVodId)}?autoplay=1${playlistParam}" title="${lang() ? 'Reproductor de video de YouTube' : 'YouTube video player'}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>` : '';
  }
}

function renderEvent(event) {
  document.title = `${event.tournament} · Platfighters.uy`;
  const games = event.games || [];
  const logo = event.image ? `<span class="event-tournament-logo-frame"><img class="event-tournament-logo" src="${esc(event.image)}" alt="${esc(event.tournament)} logo" loading="lazy"></span>` : '';
  const gamePills = games.map(g => `<span class="game-chip">${esc(g.name)}</span>`).join('');
  const brackets = (event.subEvents || []).map(renderBracket).join('');
  const vods = event.vods || [];
  const vodGames = [...new Map(vods.map(v => [gameKey(v.game), v.game]).filter(([key]) => key)).entries()];
  const filterOptions = `<option value="all">${lang() ? 'Todos los juegos' : 'All games'}</option>${vodGames.map(([key, name]) => `<option value="${esc(key)}">${esc(name)}</option>${vods.some(v => gameKey(v.game) === key && isAmateurVod(v)) ? `<option value="${esc(key)}::amateur">${esc(name)} · Amateur Bracket</option>` : ''}`).join('')}`;
  main.classList.toggle('event-compact-podium', (event.subEvents || []).length >= 3);
  main.innerHTML = `
    <section class="panel glass event-header-panel"><div class="event-header-top">${logo}<div class="event-header-info">${event.date ? `<p class="eyebrow mono">${esc(fmt(event.date))}</p>` : ''}<h1>${esc(event.tournament)}</h1><div class="event-games">${gamePills}</div></div><div class="event-header-actions">${event.startggUrl ? `<a class="action-button" href="${esc(event.startggUrl)}" target="_blank" rel="noopener noreferrer">${lang() ? 'Abrir en start.gg' : 'Open on start.gg'} ↗</a>` : ''}</div></div></section>
    <section class="event-section"><div class="event-section-head"><div><p class="eyebrow mono">${lang() ? 'RESULTADOS' : 'RESULTS'}</p><h2>${lang() ? 'Posiciones finales' : 'Final standings'}</h2></div></div><div class="brackets-grid">${brackets || '<div class="panel glass empty-state"><p class="muted">No bracket standings available for this tournament.</p></div>'}</div></section>
    ${vods.length ? `<section class="event-section event-vods-section"><div class="event-section-head"><div><p class="eyebrow mono">${lang() ? 'PARTIDAS GRABADAS' : 'RECORDED SETS'}</p><h2>${lang() ? 'VODs del torneo' : 'Tournament VODs'}</h2></div></div><div class="event-vod-controls"><label class="search glass"><span aria-hidden="true">⌕</span><input id="event-vod-search" type="search" placeholder="${lang() ? 'Buscar jugador' : 'Search players'}" aria-label="${lang() ? 'Buscar partidas' : 'Search matches'}"></label><label class="event-vod-game-label"><span class="sr-only">${lang() ? 'Filtrar por juego' : 'Filter by game'}</span><select id="event-vod-game" class="game-filter">${filterOptions}</select></label><button type="button" class="quiet-button event-play-all" id="event-play-all">${lang() ? 'Reproducir todo' : 'Play all'}</button></div><div id="event-vod-now-playing" class="event-vod-now-playing mono" aria-live="polite"></div><div id="event-vod-player" class="event-vod-player"></div><div id="event-vod-playing-match" class="event-vod-playing-match" aria-live="polite"></div><div id="event-vod-list" class="event-vod-list"></div></section>` : ''}`;
  renderVods();
  $('#event-vod-search')?.addEventListener('input', e => { searchTerm = e.target.value; renderVods(); });
  $('#event-vod-game')?.addEventListener('change', e => { activeGame = e.target.value; renderVods(); });
  $('#event-play-all')?.addEventListener('click', () => { const list = orderedVods().filter(vodMatches); if (!list.length) return; activeVodId = list[0].videoId || new URL(list[0].url || '', location.href).searchParams.get('v') || ''; playAllMode = true; renderVods(); $('#event-vod-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  const activateVod = card => { if (!card?.dataset.vod) return; activeVodId = activeVodId === card.dataset.vod && !playAllMode ? '' : card.dataset.vod; playAllMode = false; renderVods(); if (activeVodId) $('#event-vod-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('#event-vod-list')?.addEventListener('click', e => activateVod(e.target.closest('.event-vod-card')));
  $('#event-vod-list')?.addEventListener('keydown', e => { const card = e.target.closest('.event-vod-card'); if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activateVod(card); } });
}

window.i18n?.onChange?.(() => { if (currentEvent) renderEvent(currentEvent); });
window.addEventListener('resize', fitVodPlayerTags);
loadEvent();
