const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = dateStr => dateStr ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const ord = n => {
  if (!Number.isFinite(Number(n)) || Number(n) < 1) return '—';
  const num = Number(n);
  return num + ((num % 100 >= 11 && num % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[num % 10] || 'th'));
};

const tournamentSlug = new URLSearchParams(location.search).get('tournament');
const main = $('#main');
let playerDirectoryMap = new Map();

async function loadPlayerDirectory() {
  if (playerDirectoryMap.size > 0) return;
  try {
    const res = await fetch('data/profiles/index.json', { cache: 'no-store' });
    if (res.ok) {
      const list = await res.json();
      list.forEach(p => {
        if (p.playerId) {
          playerDirectoryMap.set(String(p.playerId), p);
        }
      });
    }
  } catch (e) {
    // Graceful fallback if index.json cannot be fetched
  }
}

async function loadEvent() {
  if (!tournamentSlug) {
    main.innerHTML = '<div class="panel glass empty-state"><h2>No tournament selected</h2><p class="muted"><a href="events.html">Return to event directory</a></p></div>';
    return;
  }

  try {
    const [eventRes] = await Promise.all([
      fetch(`data/events/${encodeURIComponent(tournamentSlug)}.json`, { cache: 'no-store' }),
      loadPlayerDirectory()
    ]);
    if (!eventRes.ok) throw new Error('Tournament details not found.');
    const event = await eventRes.json();
    renderEvent(event);
  } catch (error) {
    main.innerHTML = `<div class="panel glass empty-state"><h2>Event unavailable</h2><p class="muted">${esc(error.message)}</p><p style="margin-top:12px;"><a href="events.html" class="action-button">Return to Event Directory</a></p></div>`;
  }
}

function renderEvent(event) {
  document.title = `${event.tournament} · Platfighters.uy`;

  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const gamesStr = event.games.map(g => g.name).join(' · ');
  const avatarHtml = `<span class="event-header-avatar" aria-hidden="true">${esc((event.tournament || '?').slice(0, 1))}${event.image ? `<img src="${esc(event.image)}" alt="" loading="lazy">` : ''}</span>`;
  const entrantsLabel = isEs
    ? `${event.totalEntrants} participante${event.totalEntrants === 1 ? '' : 's'}`
    : `${event.totalEntrants} entrant${event.totalEntrants === 1 ? '' : 's'}`;

  const headerBarHtml = `
    <section class="panel glass event-header-panel">
      <div class="event-header-top">
        ${avatarHtml}
        <div class="event-header-info">
          <div class="eyebrow mono">${esc(gamesStr || (isEs ? 'PLATFORM FIGHTER' : 'PLATFORM FIGHTER'))}</div>
          <h1>${esc(event.tournament)}</h1>
          <div class="event-header-meta mono muted">
            <span>📅 ${fmt(event.date)}</span>
            <span>👥 ${entrantsLabel}</span>
          </div>
        </div>
        ${event.startggUrl ? `<a class="action-button open-startgg-btn" href="${esc(event.startggUrl)}" target="_blank" rel="noopener noreferrer">${isEs ? 'Abrir en start.gg ↗' : 'Open on start.gg ↗'}</a>` : ''}
      </div>
    </section>
  `;

  const subEvents = event.subEvents || [];
  const subEventsHtml = subEvents.length
    ? subEvents.map(sub => renderBracketCard(sub)).join('')
    : '<div class="panel glass empty-state"><p class="muted">No bracket standings available for this tournament.</p></div>';
  const vodGames = [...new Map(subEvents.map(sub => [normalizeGameName(sub.game), sub.game])).values()];
  const gameVods = vodGames.map(game => renderEventVods(
    (event.vods || []).filter(vod => normalizeGameName(vod.game) === normalizeGameName(game)),
    game
  )).filter(Boolean);
  const vodsSectionHtml = gameVods.length
    ? `<h2 class="sec" style="margin:28px 0 12px;">${isEs ? 'Partidas grabadas (VODs)' : 'Tournament Matches (VODs)'}</h2><div class="brackets-grid">${gameVods.join('')}</div>`
    : '';

  main.innerHTML = `${headerBarHtml}<h2 class="sec" style="margin:28px 0 12px;">${isEs ? 'Posiciones' : 'Standings'}</h2><div class="brackets-grid">${subEventsHtml}</div>${vodsSectionHtml}`;
}

function normalizeGameName(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function vodPhaseSortKey(vod) {
  const phase = String(vod.phaseLabel || vod.phase || vod.round || '').trim();
  const normalized = phase.toLocaleLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  let match = normalized.match(/^winners?\s+round\s+(\d+)$/);
  if (match) return [0, Number(match[1])];
  if (/^winners?\s+quarter[- ]?finals?$/.test(normalized)) return [1, 0];
  if (/^winners?\s+semi[- ]?finals?$/.test(normalized)) return [2, 0];
  if (/^winners?\s+finals?$/.test(normalized)) return [3, 0];
  match = normalized.match(/^losers?\s+round\s+(\d+)$/);
  if (match) return [4, Number(match[1])];
  if (/^losers?\s+quarter[- ]?finals?$/.test(normalized)) return [5, 0];
  if (/^losers?\s+semi[- ]?finals?$/.test(normalized)) return [6, 0];
  if (/^losers?\s+finals?$/.test(normalized)) return [7, 0];
  if (/^grand\s+finals?$/.test(normalized)) return [8, 0];
  return [9, 0, normalized];
}

function renderEventVods(vods, gameName) {
  if (!vods || !vods.length) return '';

  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const watchText = isEs ? 'Ver en YouTube ↗' : 'Watch on YouTube ↗';

  const sortedVods = vods.map((vod, index) => ({ vod, index, key: vodPhaseSortKey(vod) }))
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
        const av = a.key[i] ?? '';
        const bv = b.key[i] ?? '';
        if (av !== bv) return typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      }
      return a.index - b.index;
    }).map(entry => entry.vod);

  const itemsHtml = sortedVods.map(vod => {
      const p1Id = vod.player1?.playerId;
      const p2Id = vod.player2?.playerId;

      const p1Info = p1Id ? playerDirectoryMap.get(String(p1Id)) : null;
      const p2Info = p2Id ? playerDirectoryMap.get(String(p2Id)) : null;

      const p1Sponsor = (vod.player1?.sponsor || p1Info?.sponsor || '').trim();
      const p2Sponsor = (vod.player2?.sponsor || p2Info?.sponsor || '').trim();

      const p1Tag = (vod.player1?.tag || 'Player 1').trim();
      const p2Tag = (vod.player2?.tag || 'Player 2').trim();

      const p1Full = p1Sponsor ? `${esc(p1Sponsor)} ${esc(p1Tag)}` : esc(p1Tag);
      const p2Full = p2Sponsor ? `${esc(p2Sponsor)} ${esc(p2Tag)}` : esc(p2Tag);

      const p1Link = p1Id
        ? `<a class="standing-tag opponent-link" href="player.html?player=${encodeURIComponent(p1Id)}">${p1Full}</a>`
        : `<span class="standing-tag">${p1Full}</span>`;
      const p2Link = p2Id
        ? `<a class="standing-tag opponent-link" href="player.html?player=${encodeURIComponent(p2Id)}">${p2Full}</a>`
        : `<span class="standing-tag">${p2Full}</span>`;

      const phaseOrRound = vod.phaseLabel || vod.phase || vod.round || 'Bracket';
      const showRound = vod.round && vod.round !== phaseOrRound && phaseOrRound !== 'Pools' && !phaseOrRound.startsWith('[Cat. B] ');
      const roundLabel = showRound ? `<span class="mono muted" style="font-size:12px;">${esc(vod.round)}</span>` : '';
      const thumbSrc = esc(vod.thumbnail || 'assets/logo.jpg');

      return `
        <div class="vod-item-card" style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 14px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid var(--line); flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:14px; min-width:240px; flex:1 1 auto;">
            <a href="${esc(vod.url)}" target="_blank" rel="noopener noreferrer" style="flex-shrink:0; display:block; border-radius:6px; overflow:hidden; width:80px; height:45px; background:#000;">
              <img src="${thumbSrc}" alt="" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
            </a>
            <div>
              <div style="font-weight:600; font-size:14px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                <span>${esc(phaseOrRound)}</span> · ${p1Link} <span class="muted" style="margin:0 4px; font-weight:normal;">vs</span> ${p2Link}
              </div>
              <div class="mono muted" style="font-size:12px; margin-top:2px;">
                ${roundLabel}${roundLabel && vod.title ? ' · ' : ''}${esc(vod.title)}
              </div>
            </div>
          </div>
          <div style="flex-shrink:0;">
            <a href="${esc(vod.url)}" target="_blank" rel="noopener noreferrer" class="btn glass pill" style="font-size:12px; padding:6px 12px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
              ${watchText}
            </a>
          </div>
        </div>
      `;
  }).join('');

  return `
    <section class="panel glass event-game-vods">
      <h3 style="margin:0 0 12px 0;">${esc(gameName)}</h3>
      <div style="display:flex; flex-direction:column; gap:8px;">${itemsHtml}</div>
    </section>
  `;
}

function renderBracketCard(sub) {
  const standingsHtml = sub.standings && sub.standings.length
    ? sub.standings.map(st => {
        const isTop3 = st.placement <= 3;
        const playerHtml = st.playerId
          ? `<a class="standing-tag opponent-link" href="player.html?player=${encodeURIComponent(st.playerId)}">${esc(st.tag)}</a>`
          : `<span class="standing-tag">${esc(st.tag)}</span>`;

        let stockIconHtml = '<span class="stock-icon stock-placeholder"></span>';
        if (st.character && st.character.stockIcon) {
          const charInitial = esc((st.character.name || '?')[0]);
          const stockIconSrc = esc(st.character.stockIcon.replace(/\.png$/, '.webp'));
          stockIconHtml = `<span class="stock-icon"><span>${charInitial}</span><img src="${stockIconSrc}" alt="${esc(st.character.name)}" title="${esc(st.character.name)}" onload="if(this.previousElementSibling)this.previousElementSibling.remove()" onerror="this.remove()"></span>`;
        }

        return `
          <div class="standing-row">
            <span class="placement-badge p${st.placement} ${isTop3 ? 'top3' : 'muted'} mono">${ord(st.placement)}</span>
            ${stockIconHtml}
            ${playerHtml}
          </div>
        `;
      }).join('')
    : '<p class="muted p-12">No standings recorded.</p>';

  const isEs = (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'es');
  const entrantsLabel = isEs
    ? `${sub.entrants} participante${sub.entrants === 1 ? '' : 's'}`
    : `${sub.entrants} entrant${sub.entrants === 1 ? '' : 's'}`;
  const gameLabel = normalizeGameName(sub.title) === normalizeGameName(sub.game)
    ? entrantsLabel
    : `${sub.game} · ${entrantsLabel}`;

  return `
    <section class="panel glass bracket-card ${sub.isAmateur ? 'amateur-bracket' : 'main-bracket'}">
      <div class="bracket-card-head">
        <h2>${esc(sub.title)}</h2>
        <p class="mono muted">${esc(gameLabel)}</p>
      </div>
      <div class="standings-list">
        ${standingsHtml}
      </div>
    </section>
  `;
}

if (window.i18n && window.i18n.onChange) {
  window.i18n.onChange(() => {
    loadEvent();
  });
}

loadEvent();
