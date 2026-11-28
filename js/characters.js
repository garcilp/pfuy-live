(async () => {
'use strict';
let characterBoards;
try {
  const response = await fetch('data/character-rankings.json');
  if (!response.ok) throw new Error(response.statusText);
  characterBoards = await response.json();
} catch {
  const view = document.querySelector('#view');
  if (view) view.textContent = window.i18n?.getLang() === 'es'
    ? 'No se pudieron cargar los rankings de personajes.' : 'Character rankings could not be loaded.';
  window.dispatchEvent(new CustomEvent('characters-leaderboard-ready', {detail:{error:true}}));
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
 const profile=player.profile?`<a class="highlight-profile secondary-button" href="player.html?player=${encodeURIComponent(player.profile)}#characters">${tr('See player profile','Ver perfil del jugador')}</a>`:'';
 return `<div class="highlight-panel"><h3>${tr('Character highlights','Destacados del personaje')}</h3>${tiles.length?`<div class="highlight-stats">${tiles.join('')}</div>`:''}${cards?`<h4>${tx('notableWins','Notable wins','Victorias destacadas')}</h4><div class="notable-wins">${cards}</div>`:''}${profile}</div>`;
}

function rankAt(sorted,index){
 let rank=0;
 for(let i=0;i<=index;i++)if(!i||(sortKey==='score'?sorted[i-1].score!==sorted[i].score:true))rank=i+1;
 return rank;
}
function winRateValue(record){return record&&Number(record[1])>0?100*Number(record[0])/Number(record[1]):null;}
function characterEntriesFor(characterKey,games=Object.keys(characterBoards)){
 return games.filter(game=>characterBoards[game]?.[characterKey]).flatMap(game=>characterBoards[game][characterKey].players.map(player=>({...player,game,character:characterBoards[game][characterKey].name||characterKey})));
}
function characterGamesTotal(entries){return entries.reduce((sum,player)=>sum+Number(player.games||0),0);}
function characterPlayerCount(entries){return new Set(entries.map(player=>String(player.profile||player.tag||'').toLocaleLowerCase())).size;}
const characterMetricCache=new Map();
function characterMetric(characterKey,games=Object.keys(characterBoards)){
 const cacheKey=`${characterKey}\u0000${games.join('\u0000')}`;
 let metric=characterMetricCache.get(cacheKey);
 if(!metric){
  const players=characterEntriesFor(characterKey,games),rankedGames=[...new Set(players.map(player=>player.game))];
  metric={key:characterKey,games:rankedGames,players,total:characterGamesTotal(players),count:characterPlayerCount(players)};
  characterMetricCache.set(cacheKey,metric);
 }
 return {...metric,name:nameOf(characterKey)};
}
function rankedCharacterPlayers(characterKey,game){return sortPlayers(characterEntriesFor(characterKey,[game]),'score',-1);}
function topPlayersPerGame(characterKey,games=Object.keys(characterBoards),entrySource=characterEntriesFor){
 return games.map(game=>{
  const gameEntries=entrySource(characterKey,[game]),ranked=sortPlayers(gameEntries,'score',-1);if(!ranked.length)return null;
  return {game,rank:1,player:ranked[0],games:Number(ranked[0].games||0),characterTotal:characterGamesTotal(gameEntries)};
 }).filter(Boolean).sort((a,b)=>b.games-a.games||String(names[a.game]||a.game).localeCompare(String(names[b.game]||b.game)));
}
function rankCharactersByGames(items){return [...items].sort((a,b)=>b.total-a.total||collator.compare(a.name,b.name));}
function profileGamesTotal(rows){return characterGamesTotal(rows);}
function profileCharacterCount(rows){return new Set(rows.map(row=>`${row.game}:${row.characterKey}`)).size;}
function profileRows(profileSlug){
 const result=[];
 for(const [game,roster] of Object.entries(characterBoards))for(const characterKey of Object.keys(roster)){
  const board=roster[characterKey];
  const players=characterEntriesFor(characterKey,[game]);
  const sorted=sortPlayers(players),index=sorted.findIndex(p=>String(p.profile||'')===String(profileSlug));
  if(index<0)continue;
  const player=sorted[index];
  result.push({...player,characterKey,stock:board.stock,rank:rankAt(sorted,index),rankedCount:sorted.length,winRate:winRateValue(player.gameRecord),lastPlayed:formatDate(player.date)});
 }
 return result;
}
window.CharactersLeaderboard={
 profileRows,
 renderHighlights(player,character){return highlightContent(player,`profile-${player.profile||'character'}`,character);},
 formatDate,
 winRateValue,
 rankAt,
 characterEntriesFor,
 characterGamesTotal,
 characterPlayerCount,
 characterMetric,
 rankedCharacterPlayers,
 topPlayersPerGame,
 profileGamesTotal,
 profileCharacterCount,
 rankCharactersByGames,
 minGamesForWinRate:MIN_GAMES_FOR_WINRATE
};
window.dispatchEvent(new CustomEvent('characters-leaderboard-ready'));

function formatDate(date) {
 if(!date)return '—';
 const match=String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
 if(!match)return '—';
 const [,year,month,day]=match;
 const value=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
 return value.getUTCFullYear()===Number(year)&&value.getUTCMonth()===Number(month)-1&&value.getUTCDate()===Number(day)?`${year}-${month}-${day}`:'—';
}
function sortPlayers(players,key=sortKey,direction=sortDirection) {
 return [...players].sort((a,b)=>{
  let av,bv;
  if(key==='rate'){av=a.gameRecord&&a.gameRecord[1]>0?a.gameRecord[0]/a.gameRecord[1]:-1;bv=b.gameRecord&&b.gameRecord[1]>0?b.gameRecord[0]/b.gameRecord[1]:-1;}
  else if(key==='date'){av=a.date||'';bv=b.date||'';}
  else if(key==='player'){av=a.tag||'';bv=b.tag||'';}
  else {av=Number(a[key]??-1);bv=Number(b[key]??-1);}
  const order=typeof av==='string'?av.localeCompare(bv):av-bv;
  return direction*order || entryOrder(a,b);
 });
}
function rows(players, character, combined, acrossGames, mobile=false, limit=Infinity){
 const sorted=sortPlayers(players).slice(0,limit);
 return sorted.map((p,index)=>{
  const rank=rankAt(sorted,index);
  const tag=safe(p.tag);
  const id = (mobile?'mobile-':'desktop-')+'character-highlights-' + index;
  const record = p.gameRecord;
  let rateCell = '—';
  if (record && Number(record[1])>0) {
   const [wins, total] = record;
   const rate = winRateValue(record);
   const detail = tr(`${wins} wins in ${total} recorded games`, `${wins} victorias en ${total} partidas registradas`);
   const small=total<MIN_GAMES_FOR_WINRATE;
   rateCell = `<span class="character-rate${small?' is-small-sample':''}" ${small?`title="${tx('smallSample','Small sample','Muestra pequeña')}: ${detail}"`:''}><span class="rate-value">${rate.toFixed(1)}%</span>${small?`<small class="small-sample-label">${tx('smallSample','Small sample','Muestra pequeña')}</small>`:''}<span class="rate-track" aria-hidden="true"><span style="width:${rate}%"></span></span></span>`;
  }
  const hasHighlights=Boolean((p.highlights||[]).length||p.profile);
  if(hasHighlights)highlightStore.set(id,{player:p,character:combined?p.character:character});
  const expanded=!mobile&&index===desktopOpenIndex&&hasHighlights;
  const rankClass=rank===1?'gold':rank===2?'silver':rank===3?'bronze':'other';
  const rankMarkup=`<span class="character-rank rank-${rankClass}">#${rank}</span>`;
  const sponsor=p.sponsor?`<small class="character-sponsor">${safe(p.sponsor)} · </small>`:'';
  const date=formatDate(p.date);
  const playerCell=mobile?`${sponsor}<strong>${tag}</strong>`:`<strong>${tag}</strong>${p.sponsor?`<small class="character-sponsor">${safe(p.sponsor)}</small>`:''}`;
  const combinedCharacter=combined&&mobile?(()=>{const key=Object.keys(rosters[p.game]||{}).find(k=>k!==ALL&&nameOf(k)===p.character);const stock=key?rosters[p.game][key]:'';return `<span class="mobile-ranked-character">${stock?`<img src="${stock}" alt="">`:''}<small>${safe(p.character||'')}</small></span>`})():'';
  const summary=mobile?`<div class="mobile-player-metrics"><span class="mobile-player-rate">${rateCell}</span><span class="mobile-last-played">${date}</span></div>`:'';
  const mainRow=mobile
   ? `<article class="mobile-player-card ${expanded?'is-open':''}" data-rank="${rank}"><button class="mobile-player-head" type="button" aria-expanded="${expanded}" ${hasHighlights?`aria-controls="${id}"`:''}><span class="mobile-rank rank-${rankClass}">#${rank}</span><span class="mobile-player-name">${playerCell}${combinedCharacter}</span><span class="mobile-player-score"><strong>${p.score.toLocaleString('en-US',{maximumFractionDigits:1})}</strong><small>${p.games} ${tr('games','partidas')}</small></span>${hasHighlights?'<span class="row-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 6 5 5 5-5"/></svg></span>':''}</button>${summary}${hasHighlights?`<div class="mobile-player-details" id="${id}" ${expanded?'':'hidden'}><div class="lazy-highlight-content"></div><button type="button" class="mobile-close">${tx('close','Close','Cerrar')}</button></div>`:''}</article>`
   : `<tr class="${hasHighlights?'has-highlights ':''}${expanded?'is-open':''}" ${hasHighlights?`tabindex="0" aria-expanded="${expanded}"`:''}><td>${rankMarkup}</td><td class="character-info-cell"><span>${safe(p.character||character)}</span>${acrossGames?`<small>${safe(names[p.game]||p.game||'')}</small>`:''}</td><td class="character-player-cell">${playerCell}</td><td class="character-score-cell"><b>${p.score.toFixed(1)}</b><small class="compact-games">${p.games} ${tr('games','partidas')}</small></td><td>${p.games}</td><td>${rateCell}</td><td>${date}</td><td>${hasHighlights?`<button class="highlight-toggle" type="button" aria-expanded="${expanded}" aria-controls="${id}" aria-label="${tr('Highlights for','Destacados de')} ${tag}"><span class="row-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 6 5 5 5-5"/></svg></span></button>`:''}</td></tr>${hasHighlights?`<tr class="character-highlights" id="${id}" ${expanded?'':'hidden'}><td colspan="8"><div class="lazy-highlight-content"></div></td></tr>`:''}`;
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
 const players=char===ALL?(acrossGames?allEntries:boards[game][ALL].players):characterEntriesFor(char,selectedGames);
 const title=nameOf(char);
 const count=n=>char===ALL ? n+tr(' ranked entries',' entradas clasificadas') :n+' '+(n===1?tr('ranked player','jugador clasificado'):tr('ranked players','jugadores clasificados'));
 const summary=char===ALL?null:characterEntriesFor(char,selectedGames);
 const totalGames=summary?characterGamesTotal(summary):null;
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
  return `<th scope="col" data-sort-header="${key}" aria-sort="${active?(sortDirection===-1?'descending':'ascending'):'none'}"><button type="button" class="sort-heading${active?' is-active':''}" data-sort="${sort}">${label}${active?` <span aria-hidden="true">${sortDirection===-1?'↓':'↑'}</span>`:''}</button>${key==='score'?`<button class="score-help" type="button" aria-label="How score works" title="${info}">i</button>`:''}</th>${key==='rank'?`<th scope="col">${tr('Character','Personaje')}</th>`:''}`;
 }).join('')+`<th class="character-expand-heading" aria-label="${tr('Expand player highlights','Expandir destacados del jugador')}"></th>`;
 const mobileSort=`<label class="mobile-sort-label">${tx('sortBy','Sort by','Ordenar por')}<select id="mobile-sort"><option value="score">${tr('Score','Puntaje')}</option><option value="games">${tr('Games','Partidas')}</option><option value="rate">${tr('Win rate','% de victorias')}</option><option value="date">${tr('Last played','Última partida')}</option></select></label>`;
 const boardIntro=tx('winRateHelp','Win rate counts only games with a recorded pick and winner.','El porcentaje de victorias cuenta solo partidas con personaje y ganador registrados.');
 return `<section class="panel hero"><div><small>${(acrossGames ? tr('All games','Todos los juegos') : names[game]).toUpperCase()} / ${tr('ALL TIME','HISTÓRICO')}</small><h2>${title}</h2><p>${count(players.length)}</p>${stats}</div><img class="${char!==ALL && (game==='rivals-2'||game==='rivals-of-aether')?'mirror':''}" src="${artSource||''}" alt=""></section>${gamesTabs}<section class="panel board leaderboard-card"><div class="boardhead"><h2>${tx('leaderboard','Leaderboard','Clasificación')}</h2>${mobileSort}</div><p class="board-intro">${boardIntro}</p><div class="rating-scroll"><table class="ratings"><thead><tr>${th}</tr></thead><tbody id="standings">${rows(players,title,char===ALL,acrossGames,false,char===ALL?desktopAllRows:Infinity)}</tbody></table></div></section>`;
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
let browseIconSeed=0x50465559;
try{browseIconSeed=crypto.getRandomValues(new Uint32Array(1))[0]}catch{browseIconSeed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0}
function seededBrowseRandom(){browseIconSeed=(browseIconSeed+0x6D2B79F5)>>>0;let t=browseIconSeed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}
const desktopBrowseIcons={};
for(const [key,games] of Object.entries(allRoster)){
 const icons=[...new Set(games.map(game=>rosters[game][key]).filter(Boolean))];
 desktopBrowseIcons[key]=icons.length>1?icons[Math.floor(seededBrowseRandom()*icons.length)]:icons[0]||'';
}
const desktopBrowsePortraits={};
for(const [key,games] of Object.entries(allRoster)){
 const portraits=[...new Set(games.map(game=>boards[game][key]?.art?.replace('/full/','/portraits/')).filter(Boolean))];
 desktopBrowsePortraits[key]=portraits.length>1?portraits[Math.floor(seededBrowseRandom()*portraits.length)]:portraits[0]||'';
}
const collator=new Intl.Collator('en',{sensitivity:'base'});
let previousScope='',query='',rosterFilter='all';
let sortKey='score',sortDirection=-1,desktopOpenIndex=-1,desktopAllRows=50,previousCharacterKey=null;
const mobileQuery=window.matchMedia('(max-width: 720px)');
let rosterPage=12, playerPage=12, mobileRosterScroll=0, mobileRosterScope='all';
window.characterBrowseSort ||= 'played';window.characterBrowseExpanded=false;window.characterBrowseLimit ||= 12;
const mobileMode=()=>mobileQuery.matches;
const mobileCount=n=>`${n} ${n===1?tr('player','jugador'):tr('players','jugadores')}`;
const isRivalsAsset=src=>/\/rivals-(?:2|of-aether)\//.test(src||'');
function mobileChipRow(items, active, on, label=tx('filterRosterGame','Filter roster by game','Filtrar lista por juego')) {
 return `<div class="mobile-game-chips" role="group" aria-label="${label}">${items.map(([key,name])=>`<button type="button" class="mobile-chip${key===active?' is-active':''}" data-game="${key}" aria-pressed="${key===active}">${name}</button>`).join('')}</div>`;
}
function mobileRosterTiles(scope, keys, game) {
 const filtered=keys.filter(k=>k!==ALL&&nameOf(k).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
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
 const count=keys.filter(k=>k!==ALL&&nameOf(k).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).length;
 let more=view.querySelector('#more-characters');
 if(count>rosterPage){
  if(!more){more=document.createElement('button');more.type='button';more.className='mobile-more';more.id='more-characters';more.textContent=tx('showMoreCharacters','Show more characters','Mostrar más personajes');grid?.after(more);}
  more.onclick=()=>{rosterPage+=12;refreshMobileRoster(scope,keys,game);};
 }else more?.remove();
}
function mobileOverview(scope, keys, game) {
 const filtered=keys.filter(k=>k!==ALL&&nameOf(k).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
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
 const players=selected.flatMap(g=>boards[g][char].players.map(p=>({...p,game:g,character:char===ALL?p.character:nameOf(char)})));
 const distinctCount=new Set(games.flatMap(g=>boards[g][char].players.map(p=>p.profile||p.tag.toLowerCase()))).size;
 const imgGame=game==='all'?games[0]:game;
 const mobileSwitcher=games.length>1?mobileChipRow([['all',tr('All games','Todos los juegos')],...games.map(g=>[g,names[g]])],game,null,tx('filterLeaderboardGame','Filter leaderboard by game','Filtrar clasificación por juego')):'';
 return `<div class="mobile-leaderboard-view"><div class="mobile-breadcrumb">${tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')} / ${safe(nameOf(char)).toUpperCase()}</div>
 <section class="mobile-selected"><img class="mobile-selected-art${['rivals-2','rivals-of-aether'].includes(imgGame)?' mobile-rivals-asset':''}" src="${art[(imgGame||'ultimate')+'/'+char]||''}" alt=""><span class="mobile-stock">${rosters[imgGame]?.[char]?`<img class="${['rivals-2','rivals-of-aether'].includes(imgGame)?'mobile-rivals-asset':''}" src="${rosters[imgGame][char]}" alt="">`:safe(nameOf(char).slice(0,2))}</span><span><strong>${safe(nameOf(char))}</strong><small>${mobileCount(distinctCount).toUpperCase()}</small></span><button class="mobile-change" type="button">${tx('change','Change','Cambiar')}</button></section>
 ${mobileSwitcher}<small class="mobile-leaderboard-label">${tx('leaderboard','Leaderboard','Clasificación')}</small>
 <label class="mobile-sort-label">${tx('sortBy','Sort by','Ordenar por')}<select id="mobile-sort"><option value="score">${tr('Score','Puntaje')}</option><option value="games">${tr('Games','Partidas')}</option><option value="rate">${tr('Win rate','% de victorias')}</option><option value="date">${tr('Last played','Última partida')}</option></select></label>
 <div class="mobile-player-list">${rows(players,char,char===ALL,game==='all',true,playerPage)}</div>
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
const number = n => Number(n||0).toLocaleString('en-US');
const plural = (n,enOne,enMany,esOne,esMany) => `${number(n)} ${window.i18n?.getLang()==='es'?(n===1?esOne:esMany):(n===1?enOne:enMany)}`;
const distinctPlayers = characterPlayerCount;
function montevideoDayIndex(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return Math.floor((Date.UTC(+part.year,+part.month-1,+part.day)-Date.UTC(2026,0,1))/86400000);
}
function stableHash(value){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function montevideoDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
const artDimensions=new Map();
function inspectArt(src){
 if(artDimensions.has(src))return artDimensions.get(src);
 const result=new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({src,width:img.naturalWidth,height:img.naturalHeight,area:img.naturalWidth*img.naturalHeight});img.onerror=()=>resolve(null);img.src=src;});
 artDimensions.set(src,result);return result;
}
function enhanceBrowseArtwork(){
 view.querySelectorAll('.browse-top-card img[data-art-candidates],.browse-spotlight img[data-render-candidates]').forEach(img=>{
  if(img.dataset.artChecked)return;img.dataset.artChecked='true';
  let candidates=[];try{candidates=JSON.parse(img.dataset.artCandidates||img.dataset.renderCandidates)}catch{}
  Promise.all(candidates.map(inspectArt)).then(results=>{
   if(!img.isConnected)return;
   const available=results.filter(Boolean),card=img.closest('.browse-top-card,.browse-spotlight');
   if(!card)return;
   if(!available.length){if(img.classList.contains('browse-spotlight-render')){img.hidden=true;card.querySelector('.browse-spotlight-initial')?.removeAttribute('hidden');}return;}
   const isSpotlight=img.classList.contains('browse-spotlight-render');
   const enough=isSpotlight?available:available.filter(asset=>asset.width>=card.clientWidth*.7&&asset.height>=card.clientHeight+20);
   const best=(enough.length?enough:available).sort((a,b)=>b.area-a.area||b.height-a.height)[0];
   img.src=best.src;
   if(enough.length)img.classList.add('is-hires-render');
  });
 });
}
function spotlightFactCopy(id,{name='',tag='',value=0,game=''}={},lang='en'){
 const n=number(value),es=lang==='es';
 const gameUnit=es?(Number(value)===1?'juego':'juegos'):(Number(value)===1?'game':'games');
 const playedUnit=es?(Number(value)===1?'partida':'partidas'):(Number(value)===1?'game':'games');
 switch(id){
  case 'character-games':return es?{long:`${name} aparece en ${n} ${gameUnit}.`,short:`En ${n} ${gameUnit}.`}:{long:`${name} appears in ${n} ${gameUnit}.`,short:`In ${n} ${gameUnit}.`};
  case 'character-players':{
   const playerUnit=es?(Number(value)===1?'jugador':'jugadores'):(Number(value)===1?'player':'players');
   return es?{long:`${n} ${playerUnit} ${Number(value)===1?'ha usado a':'han usado a'} ${name}.`,short:`${n} ${playerUnit}.`}:{long:`${n} ${playerUnit} ${Number(value)===1?'has':'have'} played ${name}.`,short:`${n} ${playerUnit}.`};
  }
  case 'character-total-games':return es?{long:`${n} ${playedUnit} ${Number(value)===1?'jugada':'jugadas'} con ${name}.`,short:`${n} ${playedUnit}.`}:{long:`${n} ${playedUnit} played with ${name}.`,short:`${n} ${playedUnit} played.`};
  case 'character-rank':return es?{long:`Personaje #${n} más jugado${game?` en ${game}`:''}.`,short:`#${n} más jugado.`}:{long:`#${n} most played${game?` in ${game}`:' character'}.`,short:`#${n} most played.`};
  case 'combined-top-player-games':return es?{long:`Mejores jugadores: ${n} ${playedUnit}.`,short:`${n} ${playedUnit}.`}:{long:`Top players: ${n} ${playedUnit} combined.`,short:`${n} ${playedUnit} combined.`};
  case 'same-player-top-multiple-games':return es?{long:`${tag} leads ${name} in ${n} ${gameUnit}.`,short:`${tag} leads in ${n} ${gameUnit}.`}:{long:`${tag} leads ${name} in ${n} ${gameUnit}.`,short:`${tag} leads in ${n} ${gameUnit}.`};
  case 'different-top-players':return es?{long:'Un #1 distinto en cada juego.',short:'#1 distinto por juego.'}:{long:'A different #1 in every game.',short:'Different #1 per game.'};
  case 'single-game-top-player-games':return es?{long:`${tag} tiene ${n} ${playedUnit} con ${name}.`,short:`${tag}: ${n} ${playedUnit}.`}:{long:`${tag} has ${n} ${gameUnit} with ${name}.`,short:`${tag}: ${n} ${gameUnit}.`};
  default:return {long:'',short:''};
 }
}
function createSpotlightFact(id,value,values={}){
 const en=spotlightFactCopy(id,{...values,value},'en'),es=spotlightFactCopy(id,{...values,value},'es');
 return {id,value,en,es,text:tr(en.long,es.long)};
}
function chooseSpotlightFact(facts,characterKey,date=montevideoDate(),lang=window.i18n?.getLang()){
 const language=lang==='es'?'es':'en',limit=language==='es'?70:60;
 let best=-1;
 const choices=new Set();
 for(const fact of facts){
  const priority=fact.priority||0;
  if(priority<best)continue;
  const copy=fact[language]||fact.en;
  const line=[copy.long,copy.short].find(text=>text&&Array.from(text).length<=limit);
  if(!line)continue;
  if(priority>best){choices.clear();best=priority;}
  choices.add(line);
 }
 return choices.size?[...choices][stableHash(date+characterKey)%choices.size]:'';
}

function playerSpotlightFacts(player,multipleGames){
 const facts=[],tag=player.tag,game=names[player.game]||player.game;
 const prefix=multipleGames&&game?`${game} · `:'';
 function add(id,priority,en,es,shortEn=en,shortEs=es){
  facts.push({id,priority,en:{long:prefix+en,short:prefix+shortEn},es:{long:prefix+es,short:prefix+shortEs}});
 }
 for(const h of player.highlights||[]){
  const opp=h.opponent,event=h.event;
  if(h.kind==='story'&&opp){
   const scores=h.scores||[],score=scores[0]||'';
   const reverse=scores[h.reverseSweeps?.[0]];
   const losses=h.prior?.[0]===0?h.prior[1]:0;
   if(reverse){
    const en=`${tag} reverse swept ${opp} ${reverse}.`,es=`${tag} remontó ante ${opp} y ganó ${reverse}.`;
    add('comeback',3,losses>=2?`After ${losses} losses to ${opp}, ${tag} won ${reverse} on a reverse sweep.`:en,losses>=2?`Con historial 0–${losses} ante ${opp}, ${tag} remontó y ganó ${reverse}.`:es,en,es);
   }else if(losses>=2){
    add('breakthrough',3,`${tag} beat ${opp} after losing their first ${losses} sets.`,`${tag} venció a ${opp} tras perder sus primeros ${losses} sets.`);
   }
   if(scores.length>=2){
    const en=`${tag} beat ${opp} ${scores.length} times at one event`,es=`${tag} venció a ${opp} ${scores.length} veces en un torneo`;
    const eventLabel=event?.replace(/^Ultimate Smashdown (?=#\d+$)/,'Smashdown ');
    add('repeat-wins',3,eventLabel?`${tag} beat ${opp} at ${eventLabel}, ${scores.join(' and ')}.`:en+'.',
     eventLabel?`${tag} venció a ${opp} en ${eventLabel}, ${scores.join(' y ')}.`:es+'.',en+'.',es+'.');
   }
   if(h.own>h.seed&&h.seed>0){
    const result=score?' '+score:'';
    add('upset',3,`${tag} (seed #${h.own}) beat ${opp} (#${h.seed})${result}.`,`${tag} (seed #${h.own}) venció a ${opp} (#${h.seed})${result}.`);
   }
   if(h.title)add('title-set',3,`${tag} beat ${opp} to win the title.`,`${tag} venció a ${opp} para ganar el torneo.`);
   if(score)add('set-win',2,`${tag} beat ${opp} ${score}.`,`${tag} venció a ${opp} ${score}.`);
  }
  if(h.kind==='best'&&h.majority&&h.place>0&&h.startSeed>h.place){
   const en=`Seeded #${h.startSeed}, ${tag} finished #${h.place}`,es=`Con seed #${h.startSeed}, ${tag} terminó #${h.place}`;
   add('beat-seed',3,event?`${en} at ${event}.`:en+'.',event?`${es} en ${event}.`:es+'.',en+'.',es+'.');
  }
  if(h.kind==='win'&&opp&&h.wins>0){
   const en=`${tag} took ${h.wins===1?'a game':h.wins+' games'} off ${opp}`,es=`${tag} le ganó ${h.wins===1?'una partida':h.wins+' partidas'} a ${opp}`;
   if(h.opponentPlace===1)add('game-vs-champion',3,en+', the eventual champion.',es+', quien ganó el torneo.');
   add('game-win',2,en+'.',es+'.');
  }
  const amateur=h.kind==='amateurTitles';
  const titles=amateur?h.count:h.kind==='appearances'?h.titles:0;
  if(titles>0){
   const en=amateur?'amateur bracket':'tournament',es=amateur?(titles===1?'cuadro amateur':'cuadros amateur'):(titles===1?'torneo':'torneos');
   const shortEn=`${tag} won ${titles} ${en}${titles===1?'':'s'}.`;
   const shortEs=`${tag} ganó ${titles} ${es}.`;
   add(amateur?'amateur-title':'title',3,titles===1&&event?(amateur?`${tag} won the amateur bracket at ${event}.`:`${tag} won ${event}.`):shortEn,
    titles===1&&event?(amateur?`${tag} ganó el cuadro amateur en ${event}.`:`${tag} ganó ${event}.`):shortEs,shortEn,shortEs);
  }
  if(event)add('event-pick',1,`${tag} picked this character at ${event}.`,`${tag} usó este personaje en ${event}.`,`${tag} competed at ${event}.`,`${tag} compitió en ${event}.`);
 }
 if(player.others?.length){
  const others=player.others.slice(0,2);
  add('other-picks',1,`${tag} also plays ${others.join(' and ')}.`,`${tag} también juega con ${others.join(' y ')}.`,
   `${tag} also plays ${others[0]}.`,`${tag} también usa a ${others[0]}.`);
 }
 const year=player.date?.match(/^\d{4}/)?.[0];
 if(year)add('recorded-pick',0,`${tag} played this character in ${year}.`,`${tag} jugó con este personaje en ${year}.`);
 return facts;
}
function spotlightFact(character,topPlayers,items,activeGame=''){
 if(!character)return [];
 const identity=p=>String(p.profile||p.tag||'').trim().toLocaleLowerCase();
 const characterEntries=character.players||[];
 const characterTotal=characterGamesTotal(characterEntries);
 const playerCount=characterPlayerCount(characterEntries);
 const ranked=rankCharactersByGames(items),rank=ranked.findIndex(x=>x.key===character.key)+1;
 const facts=characterEntries.flatMap(player=>playerSpotlightFacts(player,character.games.length>1));
 const actualGames=[...new Set(characterEntries.map(player=>player.game))];
 const topRowsValid=topPlayers.length===character.games.length&&new Set(topPlayers.map(row=>row.game)).size===topPlayers.length&&topPlayers.every(row=>{
  const gameEntries=characterEntries.filter(player=>player.game===row.game);
  return gameEntries.length>0&&row.rank===1&&row.characterTotal===characterGamesTotal(gameEntries)&&Number.isFinite(row.games)&&row.games===Number(row.player.games||0)&&row.games>=0&&row.games<=row.characterTotal;
 });
 const topGames=topPlayers.reduce((sum,row)=>sum+row.games,0);
 const grouped=new Map();
 for(const row of topPlayers){const id=identity(row.player);if(!grouped.has(id))grouped.set(id,{id,tag:row.player.tag,rows:[],games:0});const group=grouped.get(id);group.rows.push(row);group.games+=row.games;}
 const groups=[...grouped.values()].sort((a,b)=>b.games-a.games||String(a.tag).localeCompare(String(b.tag)));
 if(character.games.length===actualGames.length&&character.games.every(game=>actualGames.includes(game))&&actualGames.length>=2)facts.push(createSpotlightFact('character-games',actualGames.length,{name:character.name}));
 if(character.count===playerCount&&playerCount>=5&&playerCount<=characterEntries.length)facts.push(createSpotlightFact('character-players',playerCount,{name:character.name}));
 if(character.total===characterTotal&&characterTotal>=100&&Number.isFinite(characterTotal))facts.push(createSpotlightFact('character-total-games',characterTotal,{name:character.name}));
 if(rank>0&&rank<=10&&ranked[rank-1]?.total===characterTotal)facts.push(createSpotlightFact('character-rank',rank,{name:character.name,game:activeGame?names[activeGame]||activeGame:''}));
 if(topRowsValid&&topPlayers.length>=2&&topGames>=100)facts.push(createSpotlightFact('combined-top-player-games',topGames,{name:character.name}));
 const repeated=groups.filter(group=>group.rows.length>=2).sort((a,b)=>b.rows.length-a.rows.length||String(a.tag).localeCompare(String(b.tag)))[0];
 if(topRowsValid&&repeated)facts.push(createSpotlightFact('same-player-top-multiple-games',repeated.rows.length,{tag:repeated.tag,name:character.name}));
 if(topRowsValid&&topPlayers.length>=3&&groups.length===topPlayers.length)facts.push(createSpotlightFact('different-top-players',groups.length,{name:character.name}));
 if(topRowsValid&&topPlayers.length===1&&character.games.length===1&&topPlayers[0].games>=20)facts.push(createSpotlightFact('single-game-top-player-games',topPlayers[0].games,{tag:topPlayers[0].player.tag,name:character.name}));
 return facts;
}
window.CharactersLeaderboard.spotlightFacts=spotlightFact;
window.CharactersLeaderboard.spotlightFactCopy=spotlightFactCopy;
window.CharactersLeaderboard.chooseSpotlightFact=chooseSpotlightFact;
function spotlightFor(items){
 const pool=items.filter(x=>x.players.length).sort((a,b)=>a.key.localeCompare(b.key));if(!pool.length)return null;
 const day=montevideoDayIndex(),cycle=Math.floor(day/pool.length),position=((day%pool.length)+pool.length)%pool.length;
 const order=c=>[...pool].sort((a,b)=>stableHash(a.key+c)-stableHash(b.key+c)||a.key.localeCompare(b.key));
 const current=order(cycle), prior=order(cycle-1);
 if(pool.length>1&&current[position].key===prior[pool.length-1].key){const next=(position+1)%pool.length;[current[position],current[next]]=[current[next],current[position]];}
 return current[position];
}
function desktopBrowse(scope,keys){
 const gameOptions=gameOrder.filter(g=>Object.keys(boards[g]).length>1);
 const selectedGames=scope==='all'?gameOptions:[scope];
 const items=keys.filter(k=>k!==ALL).map(key=>{
  const gs=selectedGames.filter(g=>boards[g][key]);
  const stats=characterMetric(key,gs);
  const portraitPaths=gs.map(g=>boards[g][key].art?.replace('/full/','/portraits/')).filter(Boolean);
  const portrait=scope==='all'?desktopBrowsePortraits[key]:portraitPaths[0];
  return {...stats,stock:gs.map(g=>rosters[g][key]).find(Boolean),art:gs.map(g=>art[g+'/'+key]).find(Boolean),portrait,artCandidates:portrait?[portrait]:[]};
 }).filter(x=>x.players.length);
 const totalPlayers=distinctPlayers(items.flatMap(x=>x.players));
 const gamesPlayed=items.reduce((n,x)=>n+x.total,0);
 const rankedGames=selectedGames.length;
 const top=rankCharactersByGames(items).slice(0,5);
  const mostPlayers=[...items].sort((a,b)=>b.count-a.count||collator.compare(a.name,b.name)).slice(0,6);
  const winrate=[...items].map(x=>{const records=x.players.filter(p=>p.gameRecord);const n=records.reduce((a,p)=>a+Number(p.gameRecord[1]),0),w=records.reduce((a,p)=>a+Number(p.gameRecord[0]),0);return {...x,rate:n?100*w/n:0,n}}).filter(x=>x.n>=50&&x.count>=3).sort((a,b)=>b.rate-a.rate||collator.compare(a.name,b.name)).slice(0,6);
 const spotlight=spotlightFor(items),spotlightTopPlayers=spotlight?topPlayersPerGame(spotlight.key,spotlight.games):[],spotFacts=spotlightFact(spotlight,spotlightTopPlayers,items,scope==='all'?'':names[scope]||scope),spotFact=spotlight?chooseSpotlightFact(spotFacts,spotlight.key):'';
 const spotlightRenderCandidates=spotlight?spotlight.games.map(g=>boards[g][spotlight.key]?.art).filter(Boolean):[];
 const spotlightPlayerLink=row=>{const tag=String(row.player.tag||''),profile=row.player.profile||profileByTag.get(tag.trim().toLocaleLowerCase())||tag;return `<a class="browse-top-player-link" href="player.html?player=${encodeURIComponent(profile)}" title="${safe(tag)}" aria-label="${safe(tr(`View ${tag}'s player page`,`Ver la página del jugador ${tag}`))}">${safe(tag)}</a>`;};
 const spotlightLeadersMarkup=spotlightTopPlayers.length>1
  ? `<div class="browse-top-players"><small>${tr('Top players','Mejores jugadores')}</small><div>${spotlightTopPlayers.slice(0,3).map(row=>`<div class="browse-top-player-row"><span>${safe(names[row.game]||row.game)}</span>${spotlightPlayerLink(row)}</div>`).join('')}</div></div>`
  : spotlightTopPlayers.length?`<p class="browse-top-player-single">${tr('Top player:','Mejor jugador:')} ${spotlightPlayerLink(spotlightTopPlayers[0])}</p>`:'';
 const filtered=items.filter(x=>x.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const sort=window.characterBrowseSort||'played';
 filtered.sort(sort==='az'?(a,b)=>collator.compare(a.name,b.name):sort==='players'?(a,b)=>b.count-a.count||collator.compare(a.name,b.name):(a,b)=>b.total-a.total||collator.compare(a.name,b.name));
 const visible=query.trim()?filtered:filtered.slice(0,window.characterBrowseExpanded?filtered.length:window.characterBrowseLimit);
 const gameLabel=scope==='all'?tr('All games','Todos los juegos'):names[scope];
 const ranks=['gold','silver','bronze','other','other'];
 const card=(x,i)=>`<button type="button" class="browse-top-card glass" data-character="${x.key}" aria-label="${safe(x.name)}, ${plural(x.total,'game','games','partida','partidas')}, ${plural(x.count,'player','players','jugador','jugadores')}"><span class="browse-rank rank-${ranks[i]}">#${i+1}</span>${x.portrait?`<img class="browse-watermark" src="${x.portrait}" data-art-candidates="${safe(JSON.stringify(x.artCandidates))}" alt="">`:`<span class="browse-watermark browse-initial">${safe(x.name.slice(0,1))}</span>`}<strong>${safe(x.name)}</strong><b class="browse-total rank-${ranks[i]}">${number(x.total)}</b><span class="browse-bar rank-${ranks[i]}"><i style="width:${top[0]?.total?100*x.total/top[0].total:0}%"></i></span><small>${plural(x.count,'player','players','jugador','jugadores')}</small></button>`;
 const metric=(title,caption,data,format)=>`<section class="browse-panel glass"><header class="browse-metric-heading"><h3>${title}</h3><small>${caption}</small></header>${data.map(x=>`<button type="button" class="browse-metric-row" data-character="${x.key}" aria-label="${safe(x.name)}, ${format(x)}"><span>${safe(x.name)}</span><b>${format(x)}</b></button>`).join('')||`<p class="browse-empty">${tr('No character data available.','No hay datos de personajes disponibles.')}</p>`}</section>`;
 return `<div class="characters-browse"><header class="browse-hero"><div><small>${safe(gameLabel)} · ${tr('All time','Histórico')}</small><h1>${tr('Characters','Personajes')}</h1></div><div class="browse-stats"><span>${plural(totalPlayers,'player','players','jugador','jugadores')}</span><span>${plural(items.length,'character','characters','personaje','personajes')}</span><span>${plural(rankedGames,'game','games','juego','juegos')}</span><span>${plural(gamesPlayed,'game played','games played','partida jugada','partidas jugadas')}</span></div></header>
 <div class="browse-filters"><div class="browse-game-pills" role="group" aria-label="${tr('Filter by game','Filtrar por juego')}">${[['all',tr('All games','Todos los juegos')],...gameOptions.map(g=>[g,names[g]])].map(([g,label])=>`<button type="button" data-browse-game="${g}" class="browse-pill${scope===g?' is-active':''}" aria-pressed="${scope===g}">${label}</button>`).join('')}</div><input id="browse-search" type="search" value="${safe(query)}" placeholder="${tr('Search a character…','Buscar un personaje…')}" aria-label="${tr('Search a character','Buscar un personaje')}"></div>
 ${!items.length?`<section class="browse-panel glass browse-no-data">${tr('No character data available for this game.','No hay datos de personajes para este juego.')}</section>`:`<section class="browse-section"><div class="browse-section-head"><h2>${tr('Most played','Más jugados')}</h2><small>${tr('Top 5 · by games played','Top 5 · por partidas jugadas')}</small></div><div class="browse-top-grid">${top.map(card).join('')}</div></section>
 <div class="browse-angles">${metric(tr('Highest win rate','Mayor porcentaje de victorias'),tr('min. 50 games · 3+ players','mín. 50 partidas · 3+ jugadores'),winrate,x=>`${x.rate.toFixed(0)}%`)}${metric(tr('Most players','Más jugadores'),tr('Distinct players','Jugadores distintos'),mostPlayers,x=>number(x.count))}<section class="browse-panel glass browse-spotlight">${spotlight?`<div class="browse-spotlight-art">${spotlightRenderCandidates.length?`<img class="browse-watermark browse-spotlight-render" src="${spotlightRenderCandidates[0]}" data-render-candidates="${safe(JSON.stringify(spotlightRenderCandidates))}" alt=""><span class="browse-watermark browse-initial browse-spotlight-initial" hidden>${safe(spotlight.name.slice(0,1))}</span>`:`<span class="browse-watermark browse-initial browse-spotlight-initial">${safe(spotlight.name.slice(0,1))}</span>`}</div><div class="browse-spotlight-copy"><section class="browse-spotlight-panel browse-spotlight-panel-a"><small>${tr('Character spotlight','Personaje destacado')}</small><h3 class="browse-spotlight-name${spotlight.name.length>12?' is-long':''}"><a class="browse-spotlight-name-link" href="#${spotlight.key}/all" aria-label="${safe(tr(`${spotlight.name} leaderboard`,`Clasificación de ${spotlight.name}`))}">${safe(spotlight.name)}</a></h3>${spotlightLeadersMarkup}</section>${spotFact?`<section class="browse-spotlight-panel browse-spotlight-panel-b"><div class="browse-fun-fact"><span>${tr('Fun fact','Dato curioso')}</span><p>${safe(spotFact)}</p></div></section>`:''}</div>`:''}</section></div>
 <section class="browse-section"><div class="browse-section-head"><h2>${tr('All characters','Todos los personajes')}</h2><div class="browse-sorts" role="group" aria-label="${tr('Sort characters','Ordenar personajes')}">${[['played',tr('Most played','Más jugados')],['players',tr('Most players','Más jugadores')],['az','A–Z']].map(([key,label])=>`<button type="button" class="browse-pill${sort===key?' is-active':''}" data-browse-sort="${key}" aria-pressed="${sort===key}">${label}</button>`).join('')}</div></div><div class="browse-roster-grid">${visible.map(x=>{const metric=sort==='played'?plural(x.total,'game','games','partida','partidas'):plural(x.count,'player','players','jugador','jugadores');const icon=scope==='all'?desktopBrowseIcons[x.key]:x.stock;return `<button type="button" class="browse-tile glass" data-character="${x.key}" aria-label="${safe(x.name)}, ${metric}">${icon?`<img src="${icon}" alt="">`:`<span class="browse-tile-initial">${safe(x.name.slice(0,2))}</span>`}<strong>${safe(x.name)}</strong><small>${metric}</small></button>`}).join('')}${!query.trim()&&filtered.length>window.characterBrowseLimit&&!window.characterBrowseExpanded?`<button type="button" class="browse-tile browse-show-all glass" data-show-all>${tr('Show all','Mostrar todos')} ${number(filtered.length)} →</button>`:''}</div></section>`}</div>`;
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
 const characterChanged=char!==previousCharacterKey;
 if(characterChanged){desktopOpenIndex=-1;desktopAllRows=50;previousCharacterKey=char;}
 const game=char&&char!==ALL?(preferred==='all'?'all':allRoster[char].includes(preferred)?preferred:allRoster[char][0]):scope;
 // The roster is rebuilt below. Preserve its scroll position within the same game filter.
 const rosterOffset = scope === previousScope ? document.querySelector('#grid')?.scrollTop ?? 0 : 0;
 if(scope!==previousScope){previousScope=scope;query=''}
 const hashFor=(key,g)=>key===ALL?'#all-characters':`#${key}/${g}`;
 const isMobile=mobileMode();
 view.innerHTML=isMobile ? (char?mobileLeaderboard(game,char):mobileOverview(scope,keys,game)) : char ? `<div class="page-heading"><small>${tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')} / ${safe(nameOf(char)).toUpperCase()}</small><h1>${tr('Characters','Personajes')}</h1></div><div class="workspace"><aside class="panel sidebar"><div class="controls"><label>${tx('filterRosterGame','Filter roster by game','Filtrar lista por juego')}<select id="game">${Object.entries({all:tr('All games','Todos los juegos'),...names}).map(([k,n])=>`<option value="${k}" ${k===scope?'selected':''}>${n}</option>`).join('')}</select></label><label>${tr('CHARACTER','PERSONAJE')}<input type="search" id="search" placeholder="${tr('Search roster','Buscar personaje')}"></label></div><h2>${scope==='all'?tr('All characters','Todos los personajes'):tr(names[scope]+' roster','Personajes de '+names[scope])}</h2><div class="grid" id="grid"></div></aside><article class="detail">${detailView(game,char)}</article></div>` : desktopBrowse(scope,keys);
 if(!isMobile&&!char){const grid=view.querySelector('.browse-roster-grid');if(grid){const columns=getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;window.characterBrowseColumns=columns;const limit=Math.max(1,columns*2-1);if(limit!==window.characterBrowseLimit){window.characterBrowseLimit=limit;render();return;}}}
 if(!isMobile&&!char){enhanceBrowseArtwork();}
 view.querySelectorAll('.character-highlights:not([hidden]),.mobile-player-details:not([hidden])').forEach(hydrateHighlights);
 if(!isMobile&&char===ALL&&desktopAllRows<allEntries.length){
  const ratingScroll=view.querySelector('.rating-scroll');
  ratingScroll?.addEventListener('scroll',()=>{
   if(ratingScroll.scrollHeight-ratingScroll.scrollTop-ratingScroll.clientHeight<120){
    const scrollTop=ratingScroll.scrollTop;
    desktopAllRows=Math.min(desktopAllRows+50,allEntries.length);
    render();
    const next=view.querySelector('.rating-scroll');if(next)next.scrollTop=scrollTop;
   }
  });
 }
 if(isMobile && !char) {
  const search=document.querySelector('#search'); search.value=query;
  search.oninput=()=>{query=search.value;refreshMobileRoster(scope,keys,game);};
  const more=document.querySelector('#more-characters'); if(more)more.onclick=()=>{rosterPage+=12;refreshMobileRoster(scope,keys,game)};
  mobileRosterScroll&&window.scrollTo(0,mobileRosterScroll);
 }
 if(isMobile && char) {
  if(characterChanged)window.scrollTo(0,0);
  view.querySelector('.mobile-change')?.addEventListener('click',()=>{history.replaceState({rosterFilter:mobileRosterScope},'','#'+mobileRosterScope);rosterFilter=mobileRosterScope;render();window.scrollTo(0,mobileRosterScroll)});
  const more=document.querySelector('#more-players'); if(more)more.onclick=()=>{playerPage+=12;render()};
 }
 const sortSelect=view.querySelector('#mobile-sort');
 if(sortSelect&&char&&char!==ALL){sortSelect.value=sortKey;sortSelect.onchange=()=>{sortKey=sortSelect.value;sortDirection=-1;render();};}
 if(scope==='all')for(const link of view.querySelectorAll('.compare a')){const target=link.hash.slice(1).split('/')[0];link.hash=hashFor(char,target)}
 const browseSearch=view.querySelector('#browse-search');if(browseSearch)browseSearch.oninput=()=>{query=browseSearch.value;const y=window.scrollY;render();window.scrollTo(0,y);view.querySelector('#browse-search')?.focus();};
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
if (!view) return;
view.addEventListener('click', event => {
 const browseGame=event.target.closest('[data-browse-game]');
 if(browseGame){const next=browseGame.dataset.browseGame;rosterFilter=next;query='';window.characterBrowseExpanded=false;history.pushState({rosterFilter:next},'',next==='all'?'#all':'#'+next);render();return;}
 const browseSort=event.target.closest('[data-browse-sort]');
 if(browseSort){window.characterBrowseSort=browseSort.dataset.browseSort;render();return;}
 if(event.target.closest('[data-show-all]')){window.characterBrowseExpanded=true;render();return;}
 const spotlightCharacterLink=event.target.closest('.browse-spotlight-name-link');
 if(spotlightCharacterLink&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){rosterFilter='all';sortKey='score';sortDirection=-1;}
 const browseCharacter=event.target.closest('[data-character]');
 if(browseCharacter){const key=browseCharacter.dataset.character;const selected=rosterFilter==='all'?allRoster[key]:[rosterFilter];const target=rosterFilter==='all'?'all':selected.find(g=>boards[g][key])||allRoster[key]?.[0];if(key&&target){history.pushState({rosterFilter},'','#'+key+'/'+target);render();window.scrollTo(0,0);}return;}
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
 const row=event.target.closest('.ratings tbody tr.has-highlights');
 if(!row)return;
 const button=row.querySelector('.highlight-toggle');
 const details = document.getElementById(button.getAttribute('aria-controls'));
 const opening=details.hidden;
 if(opening)view.querySelectorAll('tr.character-highlights:not([hidden])').forEach(other=>{other.hidden=true;const otherButton=view.querySelector(`[aria-controls="${other.id}"]`);otherButton?.setAttribute('aria-expanded','false');const otherRow=otherButton?.closest('tr');otherRow?.setAttribute('aria-expanded','false');otherRow?.classList.remove('is-open');});
 details.hidden = !opening;
 button.setAttribute('aria-expanded', String(opening));
 row.setAttribute('aria-expanded',String(opening));
 row.classList.toggle('is-open',opening);
 if(opening)hydrateHighlights(details);
 desktopOpenIndex=opening?Number(details.id.match(/-(\d+)$/)?.[1]):-1;
});
view.addEventListener('keydown',event=>{
 const row=event.target.closest('.ratings tbody tr.has-highlights');
 if(row&&event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();row.click();}
});
window.addEventListener('hashchange',render);
window.addEventListener('popstate',event=>{if(event.state?.rosterFilter)rosterFilter=event.state.rosterFilter;else if(!location.hash||location.hash==='#all')rosterFilter='all';render();});
mobileQuery.addEventListener?.('change',render);
window.addEventListener('resize',()=>{if(mobileMode())return;const grid=view.querySelector('.browse-roster-grid');if(!grid)return;const columns=getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;if(columns!==window.characterBrowseColumns)render();});
window.i18n?.onChange(render);
render();

})();
