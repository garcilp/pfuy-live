(async () => {
'use strict';
let characterBoards;
try {
  const response = await fetch('data/character-rankings.json');
  if (!response.ok) throw new Error(response.statusText);
  characterBoards = await response.json();
} catch {
  document.querySelector('#view').textContent = window.i18n?.getLang() === 'es'
    ? 'No se pudieron cargar los rankings de personajes.' : 'Character rankings could not be loaded.';
  return;
}
const ALL = 'all-characters';
const boards = {};
const entryOrder = (a,b) => b.score - a.score || a.tag.localeCompare(b.tag) || a.character.localeCompare(b.character) || a.game.localeCompare(b.game);
for (const [game, roster] of Object.entries(characterBoards)) {
  const players = Object.values(roster).flatMap(board =>
    board.players.map(player => ({...player, game, character:board.name})));
  players.sort(entryOrder);
  const portrait = `assets/renders/${game === 'melee' ? 'melee' : 'ultimate'}/portraits/random-character.webp`;
  boards[game] = {...roster, [ALL]:{
    stock: game === 'melee' ? portrait : 'assets/renders/ultimate/stocks/random-character.webp',
    art: portrait, players
  }};
}
const allEntries = Object.values(boards).flatMap(roster => roster[ALL].players).sort(entryOrder);
const profileByTag = new Map();
for(const player of allEntries)if(player.profile&&!profileByTag.has(String(player.tag||'').toLocaleLowerCase()))profileByTag.set(String(player.tag||'').toLocaleLowerCase(),player.profile);
const tr = (en, es) => window.i18n?.getLang() === 'es' ? es : en;
const tx = (key,en,es) => window.i18n?.t?.(`characters.${key}`) || tr(en,es);
const rosters = {};
const labels = {};
const art = {};
for (const [game, roster] of Object.entries(boards)) {
  rosters[game] = {};
  for (const [key, board] of Object.entries(roster)) {
    labels[key] = board.name;
    rosters[game][key] = board.stock;
    art[game + '/' + key] = board.art;
  }
}

const names={'melee':'Melee','ultimate':'Ultimate','project-plus':'Project+','rivals-2':'Rivals 2','rivals-of-aether':'Rivals of Aether'};
const nameOf=k=>k===ALL?tr('All characters','Todos los personajes'):labels[k]||k.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join(' ');
const MIN_GAMES_FOR_WINRATE=10;
const view=document.querySelector('#view');
const safe=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function tournamentLabel(highlight) {
 return [highlight.event, highlight.date].filter(Boolean).map(safe).join(' · ');
}
function winStory(win, tag) {
 const player = safe(tag), opponent = safe(win.opponent);
 const upset = win.own > win.seed && win.seed > 0;
 const subject = upset ? tr(`As seed #${win.own}, ${player}`, `Como seed #${win.own}, ${player}`) : player;
 const rival = upset ? tr(`#${win.seed} seed ${opponent}`, `${opponent}, seed #${win.seed},`) : opponent;
 const scores = win.scores.map(score => safe(score).replace('-', '–'));
 const sweep = scores.length === 1 && /^[2-9]–0$/.test(scores[0]);
 let action = sweep ? tr('swept','barrió a') : tr('beat','venció a');
 let result = scores.join(tr(' and ', ' y '));
 if (scores.length > 1 && win.title) {
  action = tr('beat','venció a');
  const last = scores.pop();
  result = scores.join(tr(' and ', ' y ')) + tr(`, then won the deciding set ${last}`, ` y luego ganó el set decisivo ${last}`);
 }
 const reversals = win.reverseSweeps || [];
 if (reversals.length && win.scores.length === 1) {
  action = tr('reverse swept', 'completó una barrida inversa ante');
 } else if (reversals.length) {
  const setScores = win.scores.map((score, index) => reversals.includes(index)
   ? tr(`a ${safe(score)} reverse sweep`, `una barrida inversa por ${safe(score)}`)
   : safe(score));
  result = setScores.map((score, i) => reversals.includes(i) ? tr('with ', 'con ') + score : score).join(tr(', then ', ' y luego '));
  if (win.title) result += tr(' in the deciding set', ' en el set decisivo');
 }
 let stakes = '';
 if (win.title) stakes = win.scores.length === 1 ? tr(' in grand final to win the title', ' en la gran final para llevarse el título') : tr(' to take the title', ' para quedarse con el título');
 else if (win.cut) stakes = tr(` to secure a top-${win.cut} finish`, ` para asegurar su lugar en el top ${win.cut}`);
 else if (win.place === 1) stakes = tr(' on the way to the title', ' camino al título');
 else if (win.place && win.size) stakes = tr(` on the way to finishing #${win.place} in a field of ${win.size}`, ` camino al puesto #${win.place} entre ${win.size} participantes`);

 const context = [];
 if (win.rank) context.push(tr(`was #${win.rank} on the ${safe(win.season)} PR`, `ocupaba el puesto #${win.rank} en el PR ${safe(win.season)}`));
 else if (win.opponentPlace > 0 && win.opponentPlace <= 8 && win.size > win.opponentPlace) {
  context.push(tr(`finished #${win.opponentPlace} out of ${win.size}`, `terminó en el puesto #${win.opponentPlace} entre ${win.size} participantes`));
 }
 const [wins, losses] = win.prior || [0, 0];
 if (losses && !wins) {
  context.push(tr(`had won ${losses === 1 ? 'their only previous recorded meeting' : `all ${losses} of their previous recorded sets`}`, `había ganado ${losses === 1 ? 'el único cruce registrado entre ambos' : `los ${losses} cruces anteriores entre ambos`}`));
 } else if (losses > wins || (wins && wins - losses <= 2)) {
  if (wins === losses) context.push(tr(`had split their previous ${2*wins} sets with ${player}`, `llegaba con el historial empatado ${wins}–${losses} frente a ${player}`));
  else context.push(losses > wins
   ? tr(`led their recorded head-to-head ${losses}–${wins} going into the set`, `llegaba con un historial de ${losses}–${wins} a favor frente a ${player}`)
   : tr(`trailed ${player} ${losses}–${wins} going into the set`, `llegaba ${losses}–${wins} abajo en el historial frente a ${player}`));
 }
 const background = context.length ? ` ${opponent} ${context.join(tr(' and ', ' y '))}.` : '';
 return `<strong>${tournamentLabel(win)}</strong><br>${subject} ${action} ${rival} ${result}${stakes}.${background}`;
}
function highlightList(player, id, character, columns = 6) {
 const lines = (player.highlights || []).map(win => {
  if (win.kind === 'story') return winStory(win, player.tag);
  if (win.kind === 'amateurTitles') {
   if (win.count === 1) {
    const event = tournamentLabel(win);
    return tr(`Won the amateur bracket at ${event}`, `Ganó el cuadro amateur de ${event}`);
   }
   return tr(`Won ${win.count} amateur brackets`, `Ganó ${win.count} cuadros amateur`);
  }
  if (win.kind === 'appearances') {
   const played = tr(`Played this character at ${win.count} recorded ${win.count === 1 ? 'event' : 'events'}`,
             `Usó este personaje en ${win.count} ${win.count === 1 ? 'evento registrado' : 'eventos registrados'}`);
   if (win.titles === 1) {
    const event = safe(win.event) + (win.date ? ` (${safe(win.date)})` : '');
    return played + tr(`, winning ${event}`, ` y ganó ${event}`);
   }
   return win.titles ? played + tr(`, winning ${win.titles} of them`, ` y ganó ${win.titles} de ellos`) : played;
  }
  if (win.kind === 'firstTopCut') {
   if (win.size) {
    const ordinal = ['1st','2nd','3rd','4th','5th','6th','7th','8th'][win.place - 1];
    return tr(`First made top cut at ${safe(win.event)}, placing ${ordinal} of ${win.size}`,
              `Llegó al top cut por primera vez en ${safe(win.event)}, donde quedó en el puesto ${win.place} de ${win.size}`) + ' · ' + safe(win.date);
   }
   return tr('First made top cut at', 'Llegó al top cut por primera vez en') + ' ' + tournamentLabel(win);
  }
  if (win.kind === 'best') {
   const field = win.size ? tr(` of ${win.size}`, ` de ${win.size}`) : '';
   const seed = win.startSeed > win.place ? tr(` (seed #${win.startSeed})`, ` (seed #${win.startSeed})`) : '';
   return tr(`Placed #${win.place}${field} playing mostly ${safe(character)}`, `Puesto #${win.place}${field} usando principalmente a ${safe(character)}`) + seed + ' · ' + tournamentLabel(win);
  }
  const opponent = safe(win.opponent);
  const upset = win.complete && win.seed > 0 && win.own > win.seed;
  let action;
  if (upset) {
   action = tr(`Upset ${opponent} (seed ${win.own} vs ${win.seed})`, `Venció a ${opponent} (seed ${win.own} vs ${win.seed})`);
  } else if (win.complete) {
   action = tr(`Beat ${opponent}`, `Venció a ${opponent}`);
  } else {
   const games = win.wins === 1 ? tr('game','partida') : tr('games','partidas');
   action = tr(`Won ${win.wins} ${games} against ${opponent}`, `Ganó ${win.wins} ${games} contra ${opponent}`);
  }
  return [action, tournamentLabel(win)].filter(Boolean).join(' · ');
 });
 if (!lines.length && !player.profile) return '';
 const profileLink = player.profile
  ? `<a class="highlight-profile" href="player.html?player=${encodeURIComponent(player.profile)}">${tr('See player profile','Ver perfil del jugador')}</a>`
  : '';
 return `<tr class="character-highlights" id="${id}" hidden><td colspan="${columns}"><strong>${tr('Character highlights','Destacados del personaje')}</strong><ul>${lines.map(line=>`<li>${line}</li>`).join('')}</ul>${profileLink}</td></tr>`;
}
function eventDate(date){return formatDate(date);}
function opponentMarkup(win, narrative){
 if(!win.opponent)return narrative;
 const profile=profileByTag.get(String(win.opponent).toLocaleLowerCase());
 const id=profile||win.opponentId;
 return id?narrative.replaceAll(safe(win.opponent),`<a href="player.html?player=${encodeURIComponent(id)}">${safe(win.opponent)}</a>`):narrative;
}
function highlightNarrative(win,player,character){
 if(win.kind==='story')return opponentMarkup(win,winStory(win,player.tag).replace(/^<strong>.*?<\/strong><br>/,''));
 if(win.kind==='amateurTitles')return win.count===1?tr('Won an amateur bracket','Ganó un cuadro amateur'):`${tr('Won','Ganó')} ${win.count} ${tr('amateur brackets','cuadros amateur')}`;
 if(win.kind==='best')return tr(`Placed #${win.place}${win.size?` of ${win.size}`:''} playing mostly ${safe(character)}`,`Quedó #${win.place}${win.size?` de ${win.size}`:''} usando principalmente a ${safe(character)}`);
 if(win.kind==='firstTopCut')return tr(`First top cut at ${safe(win.event)}`,`Primer top cut en ${safe(win.event)}`);
 if(win.opponent){const opp=safe(win.opponent),action=win.complete?tr('Beat','Venció a'):tr(`Won ${win.wins||1} games against`,`Ganó ${win.wins||1} partidas contra`);return opponentMarkup(win,`${action} ${opp}`);}
 return '';
}
function highlightContent(player,id,character){
 const facts=player.highlights||[];
 const appearances=facts.find(x=>x.kind==='appearances');
 const first=facts.find(x=>x.kind==='firstTopCut');
 const tiles=[];
 if(appearances?.count!=null)tiles.push(`<div class="highlight-stat"><small>${tx('eventsPlayed','Events played','Eventos jugados')}</small><strong>${appearances.count}</strong></div>`);
 if(appearances?.titles!=null)tiles.push(`<div class="highlight-stat"><small>${tx('eventsWon','Events won','Eventos ganados')}</small><strong>${appearances.titles}</strong></div>`);
 if(first)tiles.push(`<div class="highlight-stat highlight-first"><small>${tx('firstTopCut','First top cut','Primer top cut')}</small><strong>${safe(first.event||'')}</strong>${first.date?`<small>${eventDate(first.date)}</small>`:''}</div>`);
 const wins=facts.filter(x=>['story','win','best','amateurTitles'].includes(x.kind));
 const groupedWins=new Map();
 wins.forEach((win,index)=>{
  const event=win.event||(win.kind==='amateurTitles'?tr('Amateur brackets','Cuadros amateur'):tx('tournamentResult','Tournament result','Resultado del torneo'));
  const key=`${win.event||`${event}#${index}`}\u0000${win.date||''}`;
  if(!groupedWins.has(key))groupedWins.set(key,{event,date:win.date,key:win.key,wins:[],places:[]});
  const group=groupedWins.get(key);group.wins.push(win);if(Number(win.place)>0)group.places.push(Number(win.place));
 });
 const cards=[...groupedWins.values()].map(group=>{
  const link=group.key&&/^https?:\/\//i.test(group.key);
  const eventName=link?`<a href="${safe(group.key)}" target="_blank" rel="noopener noreferrer">${safe(group.event)}</a>`:safe(group.event);
  const place=group.places.length?Math.min(...group.places):0;
  const placeLabel=place?(window.i18n?.getLang()==='es'?`${place}.º`:`${place}${place===1?'st':place===2?'nd':place===3?'rd':'th'}`):'';
  const placeClass=place===1?'rank-gold':place===2?'rank-silver':place===3?'rank-bronze':'';
  const lines=group.wins.map(win=>`<li>${highlightNarrative(win,player,character)}</li>`).join('');
  return `<article class="notable-win">${placeLabel?`<span class="placement-badge ${placeClass}">${placeLabel}</span>`:''}<div><strong>${eventName}</strong>${group.date?`<small>${eventDate(group.date)}</small>`:''}<ul class="notable-win-lines">${lines}</ul></div></article>`;
 }).join('');
 const profile=player.profile?`<a class="highlight-profile secondary-button" href="player.html?player=${encodeURIComponent(player.profile)}">${tr('See player profile','Ver perfil del jugador')}</a>`:'';
 return `<div class="highlight-panel"><h3>${tr('Character highlights','Destacados del personaje')}</h3>${tiles.length?`<div class="highlight-stats">${tiles.join('')}</div>`:''}${cards?`<h4>${tx('notableWins','Notable wins','Victorias destacadas')}</h4><div class="notable-wins">${cards}</div>`:''}${profile}</div>`;
}

function formatDate(date) {
 if(!date)return '—';
 const value=new Date(`${date}T00:00:00`);
 return Number.isNaN(value.getTime())?'—':new Intl.DateTimeFormat(window.i18n?.getLang()==='es'?'es-UY':'en-US',{year:'numeric',month:'short',day:'numeric'}).format(value);
}
function sortPlayers(players) {
 const key=sortKey;
 return [...players].sort((a,b)=>{
  let av,bv;
  if(key==='rate'){av=a.gameRecord&&a.gameRecord[1]>0?a.gameRecord[0]/a.gameRecord[1]:-1;bv=b.gameRecord&&b.gameRecord[1]>0?b.gameRecord[0]/b.gameRecord[1]:-1;}
  else if(key==='date'){av=a.date||'';bv=b.date||'';}
  else if(key==='player'){av=a.tag||'';bv=b.tag||'';}
  else {av=Number(a[key]??-1);bv=Number(b[key]??-1);}
  const order=typeof av==='string'?av.localeCompare(bv):av-bv;
  return sortDirection*order || entryOrder(a,b);
 });
}
function rows(players, character, combined, acrossGames, mobile=false, limit=Infinity){
 const sorted=sortPlayers(players).slice(0,limit);
 let rank = 0;
 return sorted.map((p,index)=>{
  if (!index || (sortKey==='score'?sorted[index-1].score!==p.score:true)) rank = index + 1;
  const tag=safe(p.tag);
  const id = (mobile?'mobile-':'desktop-')+'character-highlights-' + index;
  const record = p.gameRecord;
  let rateCell = '—';
  if (record && Number(record[1])>0) {
   const [wins, total] = record;
   const rate = total>0 ? 100 * wins / total : null;
   const detail = tr(`${wins} wins in ${total} recorded games`, `${wins} victorias en ${total} partidas registradas`);
   const small=total<MIN_GAMES_FOR_WINRATE;
   rateCell = `<span class="character-rate${small?' is-small-sample':''}" ${small?`title="${tx('smallSample','Small sample','Muestra pequeña')}: ${detail}"`:''}><span class="rate-value">${Number(rate.toFixed(1))}%</span>${small?`<small class="small-sample-label">${tx('smallSample','Small sample','Muestra pequeña')}</small>`:''}<span class="rate-track" aria-hidden="true"><span style="width:${rate}%"></span></span></span>`;
  }
  const hasHighlights=Boolean((p.highlights||[]).length||p.profile);
  if(hasHighlights)highlightStore.set(id,{player:p,character:combined?p.character:character});
  const expanded=!mobile&&index===desktopOpenIndex&&hasHighlights;
  const rankClass=rank===1?'gold':rank===2?'silver':rank===3?'bronze':'other';
  const rankMarkup=`<span class="character-rank rank-${rankClass}">#${rank}</span>`;
  const sponsor=p.sponsor?`<small class="character-sponsor">${safe(p.sponsor)} · </small>`:'';
  const date=formatDate(p.date);
  const playerCell=mobile?`${sponsor}<strong>${tag}</strong>`:`<strong>${tag}</strong>${p.sponsor?`<small class="character-sponsor">${safe(p.sponsor)}</small>`:''}`;
  const summary=mobile?`<div class="mobile-player-metrics"><span class="mobile-player-rate">${rateCell}</span><span class="mobile-last-played">${date}</span></div>`:'';
  const mainRow=mobile
   ? `<article class="mobile-player-card ${expanded?'is-open':''}" data-rank="${rank}"><button class="mobile-player-head" type="button" aria-expanded="${expanded}" ${hasHighlights?`aria-controls="${id}"`:''}><span class="mobile-rank rank-${rankClass}">#${rank}</span><span class="mobile-player-name">${playerCell}</span><span class="mobile-player-score"><strong>${p.score.toLocaleString('en-US',{maximumFractionDigits:1})}</strong><small>${p.games} ${tr('games','partidas')}</small></span>${hasHighlights?'<span class="row-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 6 5 5 5-5"/></svg></span>':''}</button>${summary}${hasHighlights?`<div class="mobile-player-details" id="${id}" ${expanded?'':'hidden'}><div class="lazy-highlight-content"></div><button type="button" class="mobile-close">${tx('close','Close','Cerrar')}</button></div>`:''}</article>`
   : `<tr class="${hasHighlights?'has-highlights ':''}${expanded?'is-open':''}"><td>${rankMarkup}</td><td class="character-player-cell">${playerCell}</td><td class="character-score-cell"><b>${p.score.toFixed(1)}</b><small class="compact-games">${p.games} ${tr('games','partidas')}</small></td><td>${p.games}</td><td>${rateCell}</td><td>${date}</td><td>${hasHighlights?`<button class="highlight-toggle" type="button" aria-expanded="${expanded}" aria-controls="${id}" aria-label="${tr('Highlights for','Destacados de')} ${tag}"><span class="row-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 6 5 5 5-5"/></svg></span></button>`:''}</td></tr>${hasHighlights?`<tr class="character-highlights" id="${id}" ${expanded?'':'hidden'}><td colspan="7"><div class="lazy-highlight-content"></div></td></tr>`:''}`;
  return mainRow;
 }).join('');
}
const highlightStore=new Map();
function hydrateHighlights(details){
 if(!details||details.dataset.loaded==='true')return;
 const id=details.id,record=highlightStore.get(id),content=details.querySelector('.lazy-highlight-content');
 if(!record||!content)return;
 content.innerHTML=highlightContent(record.player,id,record.character);
 details.dataset.loaded='true';
}
function detailView(game,char){
 const games=gameOrder.filter(g=>boards[g][char]);
 const acrossGames=game==='all';
 const selectedGames=acrossGames?games:[game];
 const players=char===ALL?(acrossGames?allEntries:boards[game][ALL].players):selectedGames.flatMap(g=>boards[g][char].players.map(p=>({...p,game:g,character:nameOf(char)})));
 const title=nameOf(char);
 const count=n=>char===ALL ? n+tr(' ranked entries',' entradas clasificadas') :n+' '+(n===1?tr('ranked player','jugador clasificado'):tr('ranked players','jugadores clasificados'));
 const summary=char===ALL?null:selectedGames.flatMap(g=>boards[g][char].players);
 const totalGames=summary?.reduce((n,p)=>n+Number(p.games||0),0);
 const lastPlayed=summary?.map(p=>p.date).filter(Boolean).sort().at(-1);
 const topScore=summary?.reduce((best,p)=>Math.max(best,p.score),-Infinity);
 const leaders=summary?.length?summary.filter(p=>p.score===topScore):[];
 const gamesTabs=char!==ALL&&games.length>1?`<nav class="character-game-tabs" aria-label="${tr('Select leaderboard game','Elegir juego de la clasificación')}"><a href="#${char}/all" ${game==='all'?'aria-current="page"':''}>${tr('All games','Todos los juegos')}</a>${games.map(g=>`<a href="#${char}/${g}" ${game===g?'aria-current="page"':''}>${names[g]}</a>`).join('')}</nav>`:'';
 const stats=char===ALL?'':`<div class="character-hero-stats">${leaders.length?`<span>${tx('topRanked','Top-ranked','Mejor clasificado')} <b>${safe(leaders[0].tag)}</b></span>`:''}${totalGames?`<span>${tx('totalGames','Total games','Partidas totales')} <b>${totalGames.toLocaleString()}</b></span>`:''}${lastPlayed?`<span>${tr('Last played','Última vez')} <b>${formatDate(lastPlayed)}</b></span>`:''}</div>`;
 const artGame=acrossGames?games[0]:game;
 const artSource=art[(artGame||'ultimate')+'/'+char];
 const info=tx('scoreExplanation','Score combines four components, each normalized against the eligible players for that game: Glicko-2 (50%), Quality Wins (25%), Strength of Field (15%), and Consistency (10%).','El puntaje combina cuatro componentes, normalizados frente a los jugadores elegibles de ese juego: Glicko-2 (50%), victorias de calidad (25%), nivel del torneo (15%) y consistencia (10%).');
 const headers=[['rank',tr('Rank','Puesto'),'score'],['player',tr('Player','Jugador'),'player'],['score',tr('Score','Puntaje'),'score'],['games',tr('Games','Partidas'),'games'],['rate',tr('Win rate','% de victorias'),'rate'],['date',tr('Last played','Última partida'),'date']];
 const th=headers.map(([key,label,sort])=>{
  const active=sortKey===sort&&key!=='rank';
  return `<th scope="col" data-sort-header="${key}" aria-sort="${active?(sortDirection===-1?'descending':'ascending'):'none'}"><button type="button" class="sort-heading${active?' is-active':''}" data-sort="${sort}">${label}${active?` <span aria-hidden="true">${sortDirection===-1?'↓':'↑'}</span>`:''}</button>${key==='score'?`<button class="score-help" type="button" aria-label="How score works" title="${info}">i</button>`:''}</th>`;
 }).join('')+`<th class="character-expand-heading" aria-label="${tr('Expand player highlights','Expandir destacados del jugador')}"></th>`;
 const mobileSort=`<label class="mobile-sort-label">${tx('sortBy','Sort by','Ordenar por')}<select id="mobile-sort"><option value="score">${tr('Score','Puntaje')}</option><option value="games">${tr('Games','Partidas')}</option><option value="rate">${tr('Win rate','% de victorias')}</option><option value="date">${tr('Last played','Última partida')}</option></select></label>`;
 const boardIntro=tx('winRateHelp','Win rate counts only games with a recorded pick and winner.','El porcentaje de victorias cuenta solo partidas con personaje y ganador registrados.');
 return `<section class="panel hero"><div><small>${(acrossGames ? tr('All games','Todos los juegos') : names[game]).toUpperCase()} / ${tr('ALL TIME','HISTÓRICO')}</small><h2>${title}</h2><p>${count(players.length)}</p>${stats}</div><img class="${char!==ALL && (game==='rivals-2'||game==='rivals-of-aether')?'mirror':''}" src="${artSource||''}" alt=""></section>${gamesTabs}<section class="panel board leaderboard-card"><div class="boardhead"><h2>${tx('leaderboard','Leaderboard','Clasificación')}</h2>${mobileSort}</div><p class="board-intro">${boardIntro}</p><div class="rating-scroll"><table class="ratings"><thead><tr>${th}</tr></thead><tbody id="standings">${rows(players,title,char===ALL,acrossGames)}</tbody></table></div></section>`;
}
const gameOrder=['melee','project-plus','ultimate','rivals-of-aether','rivals-2'];
const allRoster={};
for(const game of gameOrder){
 const roster=rosters[game];
 for(const key of Object.keys(roster))(allRoster[key]??=[]).push(game);
}
const mixedIcons={};
for(const [key,games] of Object.entries(allRoster)){
 const icons=games.map(game=>rosters[game][key]).filter(Boolean);
 mixedIcons[key]=games.length>1?icons[Math.floor(Math.random()*icons.length)]:rosters[games[0]][key];
}
const collator=new Intl.Collator('en',{sensitivity:'base'});
let previousScope='',query='',rosterFilter='all';
let sortKey='score',sortDirection=-1,desktopOpenIndex=0;
const mobileQuery=window.matchMedia('(max-width: 720px)');
let rosterPage=12, playerPage=12, mobileRosterScroll=0, mobileRosterScope='all';
const mobileMode=()=>mobileQuery.matches;
const mobileCount=n=>`${n} ${n===1?tr('player','jugador'):tr('players','jugadores')}`;
const isRivalsAsset=src=>/\/rivals-(?:2|of-aether)\//.test(src||'');
function mobileChipRow(items, active, on, label=tx('filterRosterGame','Filter roster by game','Filtrar lista por juego')) {
 return `<div class="mobile-game-chips" role="group" aria-label="${label}">${items.map(([key,name])=>`<button type="button" class="mobile-chip${key===active?' is-active':''}" data-game="${key}" aria-pressed="${key===active}">${name}</button>`).join('')}</div>`;
}
function mobileRosterTiles(scope, keys, game) {
 const filtered=keys.filter(k=>nameOf(k).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return filtered.slice(0,rosterPage).map(k=>{
  const gs=scope==='all'?allRoster[k]:[game];
  const count=new Set(gs.flatMap(g=>boards[g][k].players.map(p=>p.profile||p.tag.toLowerCase()))).size;
  const img=scope==='all'?mixedIcons[k]:rosters[game][k];
  const target=gs.includes(game)?game:gs[0];
  return `<a class="mobile-roster-tile" href="#${k}/${target}"><span class="mobile-stock">${img?`<img class="${isRivalsAsset(img)?'mobile-rivals-asset':''}" src="${img}" alt="">`:k.slice(0,2)}</span><strong>${nameOf(k)}</strong><small>${mobileCount(count)}</small></a>`;
 }).join('')||`<p>${tr('No matching characters.','No se encontraron personajes.')}</p>`;
}
function refreshMobileRoster(scope, keys, game) {
 const grid=view.querySelector('#mobile-grid');
 if(grid)grid.innerHTML=mobileRosterTiles(scope,keys,game);
 const count=keys.filter(k=>nameOf(k).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).length;
 let more=view.querySelector('#more-characters');
 if(count>rosterPage){
  if(!more){more=document.createElement('button');more.type='button';more.className='mobile-more';more.id='more-characters';more.textContent=tx('showMoreCharacters','Show more characters','Mostrar más personajes');grid?.after(more);}
  more.onclick=()=>{rosterPage+=12;refreshMobileRoster(scope,keys,game);};
 }else more?.remove();
}
function mobileOverview(scope, keys, game) {
 const filtered=keys.filter(k=>nameOf(k).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const games=[['all',tr('All games','Todos los juegos')],...gameOrder.map(g=>[g,names[g]])];
 const allCount=new Set((scope==='all'?allEntries:boards[game][ALL].players).map(p=>p.profile||p.tag.toLowerCase())).size;
 return `<div class="mobile-character-view">
  <div class="page-heading"><small>${tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')}</small><h1>${tr('Characters','Personajes')}</h1><p>${tx('pickIntro','Pick a character to see who plays it in tournaments, with scores and games played.','Elegí un personaje para ver quién lo usa en torneos, con puntajes y partidas jugadas.')}</p></div>
 ${mobileChipRow(games,scope,null,tx('filterRosterGame','Filter roster by game','Filtrar lista por juego'))}
  <label class="mobile-search-label" for="search">${tr('CHARACTER','PERSONAJE')}</label><input class="mobile-search" type="search" id="search" placeholder="${tr('Search roster','Buscar personaje')}" aria-label="${tr('Search roster','Buscar personaje')}">
  <div class="mobile-roster-heading"><h2>${scope==='all'?tr('All characters','Todos los personajes'):tr(names[scope]+' roster','Personajes de '+names[scope])}</h2><small>${tr('A-Z','A-Z')}</small></div>
  <a class="mobile-all-row" href="#all-characters"><span class="mobile-stock">?</span><span><strong>${tr('All characters','Todos los personajes')}</strong><small>${mobileCount(allCount).toUpperCase()}</small></span></a>
  <div class="mobile-roster-grid" id="mobile-grid">${mobileRosterTiles(scope,keys,game)}</div>
  ${filtered.length>rosterPage?`<button type="button" class="mobile-more" id="more-characters">${tx('showMoreCharacters','Show more characters','Mostrar más personajes')}</button>`:''}
 </div>`;
}
function mobileLeaderboard(game,char) {
 const games=gameOrder.filter(g=>boards[g][char]);
 const selected=game==='all'?games:games.includes(game)?[game]:games;
 const players=selected.flatMap(g=>boards[g][char].players.map(p=>({...p,game:g,character:nameOf(char)})));
 const distinctCount=new Set(games.flatMap(g=>boards[g][char].players.map(p=>p.profile||p.tag.toLowerCase()))).size;
 const imgGame=game==='all'?games[0]:game;
 const mobileSwitcher=games.length>1?mobileChipRow([['all',tr('All games','Todos los juegos')],...games.map(g=>[g,names[g]])],game,null,tx('filterLeaderboardGame','Filter leaderboard by game','Filtrar clasificación por juego')):'';
 return `<div class="mobile-leaderboard-view"><div class="mobile-breadcrumb">${tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')} / ${safe(nameOf(char)).toUpperCase()}</div>
 <section class="mobile-selected"><img class="mobile-selected-art${['rivals-2','rivals-of-aether'].includes(imgGame)?' mobile-rivals-asset':''}" src="${art[(imgGame||'ultimate')+'/'+char]||''}" alt=""><span class="mobile-stock">${rosters[imgGame]?.[char]?`<img class="${['rivals-2','rivals-of-aether'].includes(imgGame)?'mobile-rivals-asset':''}" src="${rosters[imgGame][char]}" alt="">`:safe(nameOf(char).slice(0,2))}</span><span><strong>${safe(nameOf(char))}</strong><small>${mobileCount(distinctCount).toUpperCase()}</small></span><button class="mobile-change" type="button">${tx('change','Change','Cambiar')}</button></section>
 ${mobileSwitcher}<small class="mobile-leaderboard-label">${tx('leaderboard','Leaderboard','Clasificación')}</small>
 <label class="mobile-sort-label">${tx('sortBy','Sort by','Ordenar por')}<select id="mobile-sort"><option value="score">${tr('Score','Puntaje')}</option><option value="games">${tr('Games','Partidas')}</option><option value="rate">${tr('Win rate','% de victorias')}</option><option value="date">${tr('Last played','Última partida')}</option></select></label>
 <div class="mobile-player-list">${rows(players,char,false,game==='all',true,playerPage)}</div>
 ${players.length>playerPage?`<button type="button" class="mobile-more" id="more-players">${tx('showMorePlayers','Show more players','Mostrar más jugadores')}</button>`:''}</div>`;
}
function overview() {
 const totals=Object.keys(allRoster).filter(key=>key!==ALL).map(key=>{
  const byGame=gameOrder.filter(game=>boards[game][key]).map(game=>({game,total:boards[game][key].players.reduce((sum,p)=>sum+Number(p.games||0),0)}));
  return {key,total:byGame.reduce((sum,g)=>sum+g.total,0),game:byGame.sort((a,b)=>b.total-a.total)[0]?.game};
 }).sort((a,b)=>b.total-a.total).slice(0,5);
 const max=totals[0]?.total||1;
 return `<section class="panel overview-panel"><p>${tx('pickIntro','Pick a character to see who plays it in tournaments, with scores and games played.','Elegí un personaje para ver quién lo usa en torneos, con puntajes y partidas jugadas.')}</p><h2>${tx('mostPlayed','Most played characters','Personajes más jugados')}</h2><ol class="most-played-list">${totals.map(item=>`<li><a href="#${item.key}/${item.game}"><strong>${nameOf(item.key)}</strong><span class="most-played-track"><i style="width:${Math.max(3,100*item.total/max)}%"></i></span><small>${item.total.toLocaleString()} ${tr('games','partidas')}</small></a></li>`).join('')}</ol></section>`;
}
function render(){
 highlightStore.clear();
 let [raw,routeKey,preferred]=location.hash.slice(1).split('/');
 let requestedKey=null;
 // Accept legacy #game/character and #all/character/game links as well as the
 // canonical #character/game links used for new selections.
 if(raw==='all'&&routeKey&&Object.hasOwn(allRoster,routeKey)){requestedKey=routeKey;preferred=preferred||'all';}
 else if(raw==='all'&&!routeKey){rosterFilter='all';}
 else if(Object.hasOwn(rosters,raw)&&routeKey&&Object.hasOwn(rosters[raw],routeKey)){rosterFilter=raw;requestedKey=routeKey;preferred=preferred||raw;}
 else if(Object.hasOwn(rosters,raw)){rosterFilter=raw;}
 else if(Object.hasOwn(allRoster,raw)){requestedKey=raw;preferred=routeKey;}
 const scope=rosterFilter;
 const requested = requestedKey === 'sheik-zelda' ? 'sheik' : requestedKey === 'simon-belmont' ? 'simon' : requestedKey;
 const keys=Object.keys(scope==='all'?allRoster:rosters[scope]).sort((a,b)=>Number(b===ALL)-Number(a===ALL)||collator.compare(nameOf(a),nameOf(b)));
 const char = Object.hasOwn(allRoster,requested) ? requested : null;
 const game=char&&char!==ALL?(preferred==='all'?'all':allRoster[char].includes(preferred)?preferred:allRoster[char][0]):scope;
 // The roster is rebuilt below. Preserve its scroll position within the same game filter.
 const rosterOffset = scope === previousScope ? document.querySelector('#grid')?.scrollTop ?? 0 : 0;
 if(scope!==previousScope){previousScope=scope;query=''}
 const hashFor=(key,g)=>key===ALL?'#all-characters':`#${key}/${g}`;
 const isMobile=mobileMode();
 view.innerHTML=isMobile ? (char&&char!==ALL?mobileLeaderboard(game,char):mobileOverview(scope,keys,game)) : `<div class="page-heading"><small>${char&&char!==ALL?`${tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')} / ${safe(nameOf(char)).toUpperCase()}`:tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')}</small><h1>${tr('Characters','Personajes')}</h1></div><div class="workspace"><aside class="panel sidebar"><div class="controls"><label>${tx('filterRosterGame','Filter roster by game','Filtrar lista por juego')}<select id="game">${Object.entries({all:tr('All games','Todos los juegos'),...names}).map(([k,n])=>`<option value="${k}" ${k===scope?'selected':''}>${n}</option>`).join('')}</select></label><label>${tr('CHARACTER','PERSONAJE')}<input type="search" id="search" placeholder="${tr('Search roster','Buscar personaje')}"></label></div><h2>${scope==='all'?tr('All characters','Todos los personajes'):tr(names[scope]+' roster','Personajes de '+names[scope])}</h2><div class="grid" id="grid"></div></aside><article class="detail">${char ? detailView(game,char) : overview()}</article></div>`;
 view.querySelectorAll('.character-highlights:not([hidden]),.mobile-player-details:not([hidden])').forEach(hydrateHighlights);
 if(isMobile && !char) {
  const search=document.querySelector('#search'); search.value=query;
  search.oninput=()=>{query=search.value;refreshMobileRoster(scope,keys,game);};
  const more=document.querySelector('#more-characters'); if(more)more.onclick=()=>{rosterPage+=12;refreshMobileRoster(scope,keys,game)};
  mobileRosterScroll&&window.scrollTo(0,mobileRosterScroll);
 }
 if(isMobile && char && char!==ALL) {
  view.querySelector('.mobile-change')?.addEventListener('click',()=>{history.replaceState({rosterFilter:mobileRosterScope},'','#'+mobileRosterScope);rosterFilter=mobileRosterScope;render();window.scrollTo(0,mobileRosterScroll)});
  const more=document.querySelector('#more-players'); if(more)more.onclick=()=>{playerPage+=12;render()};
 }
 const sortSelect=view.querySelector('#mobile-sort');
 if(sortSelect&&char&&char!==ALL){sortSelect.value=sortKey;sortSelect.onchange=()=>{sortKey=sortSelect.value;sortDirection=-1;render();};}
 if(scope==='all')for(const link of view.querySelectorAll('.compare a')){const target=link.hash.slice(1).split('/')[0];link.hash=hashFor(char,target)}
 const search=document.querySelector('#search');if(search)search.value=query;
 function filter(){
  query=search.value;
  document.querySelector('#grid').innerHTML=keys.filter(k=>nameOf(k).toLowerCase().includes(query.trim().toLowerCase())).map(k=>{
   const games=scope==='all'?allRoster[k]:[game];
   const target=games.includes(game)?game:games[0];
   const count=new Set(games.flatMap(g=>boards[g][k].players.map(p=>p.profile||p.tag.toLowerCase()))).size;
   const img=scope==='all'?mixedIcons[k]:rosters[game][k];
   return `<a class="tile" ${char===k?'aria-current="true"':''} href="${hashFor(k,target)}">${img?`<img src="${img}" alt="">`:''}<strong>${nameOf(k)}</strong><small>${count} ${count===1?tr('player','jugador'):tr('players','jugadores')}</small></a>`;
  }).join('')||`<p>${tr('No matching characters.','No se encontraron personajes.')}</p>`;
 }
 if(search&&!isMobile){search.oninput=filter;filter();}
 const desktopGrid=document.querySelector('#grid'); if(desktopGrid)desktopGrid.scrollTop = rosterOffset;
 if(!isMobile&&char&&char!==ALL)view.querySelector('#grid .tile[aria-current="true"]')?.scrollIntoView({block:'nearest'});
 const gameSelect=document.querySelector('#game'); if(gameSelect)gameSelect.onchange = event => {
  const next = event.target.value;
  rosterFilter=next;
  const top=window.scrollY;
  render();
  window.scrollTo(0,top);
 };
}
view.addEventListener('click', event => {
 const sortButton=event.target.closest('[data-sort]');
 if(sortButton){const next=sortButton.dataset.sort,head=sortButton.closest('th')?.dataset.sortHeader;if(sortKey===next)sortDirection*=-1;else{sortKey=next;sortDirection=next==='date'? -1:1;}const top=window.scrollY;render();view.querySelector(`[data-sort-header="${head}"] [data-sort]`)?.focus({preventScroll:true});window.scrollTo(0,top);return;}
 const gameChip=event.target.closest('.mobile-game-chips [data-game]');
 if(gameChip){
  event.preventDefault();
  const next=gameChip.dataset.game;
  const route=location.hash.slice(1).split('/');
  const routeCandidate=route[0]==='all'?route[1]:route[0];
  const routeKey=routeCandidate==='sheik-zelda'?'sheik':routeCandidate==='simon-belmont'?'simon':routeCandidate;
  const isCharacterState=!!view.querySelector('.mobile-leaderboard-view')&&routeKey&&routeKey!==ALL&&Object.hasOwn(allRoster,routeKey);
  const hash=isCharacterState?`${routeKey}/${next}`:(next==='all'?'all':next);
  if(!isCharacterState){rosterFilter=next;mobileRosterScope=next;mobileRosterScroll=window.scrollY;rosterPage=12;}
  if('#'+hash!==location.hash)history.pushState({rosterFilter},'','#'+hash);
  render();
  if(!isCharacterState)window.scrollTo(0,mobileRosterScroll);
  return;
 }
 const rosterLink=event.target.closest('.mobile-roster-tile,.mobile-all-row'); if(rosterLink){mobileRosterScroll=window.scrollY;mobileRosterScope=rosterFilter;}
 const more=event.target.closest('#more-characters'); if(more)return;
 const head=event.target.closest('.mobile-player-head');
 if(head){
  const card=head.closest('.mobile-player-card'), details=card.querySelector('.mobile-player-details');
  if(details){const opening=details.hidden;view.querySelectorAll('.mobile-player-details:not([hidden])').forEach(el=>{el.hidden=true;el.closest('.mobile-player-card').querySelector('.mobile-player-head').setAttribute('aria-expanded','false')});details.hidden=!opening;head.setAttribute('aria-expanded',String(opening));if(opening)hydrateHighlights(details);}
  return;
 }
 const close=event.target.closest('.mobile-close'); if(close){const card=close.closest('.mobile-player-card');card.querySelector('.mobile-player-details').hidden=true;card.querySelector('.mobile-player-head').setAttribute('aria-expanded','false');return;}
 const gameLink = event.target.closest('.compare a');
 if (gameLink) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (gameLink.hash === location.hash) return;
  const top = window.scrollY;
  const left = window.scrollX;
  history.pushState(null, '', gameLink.hash);
  render();
  view.querySelector('.compare a[aria-current="page"]')?.focus({preventScroll:true});
  window.scrollTo({top, left, behavior:'instant'});
  return;
 }
 const button=event.target.closest('.ratings .highlight-toggle');
 if(!button)return;
 const row=button.closest('tr.has-highlights');
 if(!row)return;
 const details = document.getElementById(button.getAttribute('aria-controls'));
 const opening=details.hidden;
 if(opening)view.querySelectorAll('tr.character-highlights:not([hidden])').forEach(other=>{other.hidden=true;const otherButton=view.querySelector(`[aria-controls="${other.id}"]`);otherButton?.setAttribute('aria-expanded','false');otherButton?.closest('tr')?.classList.remove('is-open');});
 details.hidden = !opening;
 button.setAttribute('aria-expanded', String(opening));
 row.classList.toggle('is-open',opening);
 if(opening)hydrateHighlights(details);
 desktopOpenIndex=opening?Number(details.id.split('-').at(-1)):-1;
});
window.addEventListener('hashchange',render);
window.addEventListener('popstate',event=>{if(event.state?.rosterFilter)rosterFilter=event.state.rosterFilter;else if(!location.hash||location.hash==='#all')rosterFilter='all';render();});
mobileQuery.addEventListener?.('change',render);
window.i18n?.onChange(render);
render();

})();
