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
const tr = (en, es) => window.i18n?.getLang() === 'es' ? es : en;
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

function rows(players, character, combined, acrossGames){
 let rank = 0;
 return players.map((p,index)=>{
  if (!index || players[index-1].score !== p.score) rank = index + 1;
  const tag=safe(p.tag);
  const id = 'character-highlights-' + index;
  const record = p.gameRecord;
  let rateCell = '—';
  if (record) {
   const [wins, total] = record;
   const rate = 100 * wins / total;
   const detail = tr(`${wins} wins in ${total} recorded games`, `${wins} victorias en ${total} partidas registradas`);
   rateCell = `<span class="character-rate" title="${detail}">${Number(rate.toFixed(1))}%<span class="rate-track" aria-hidden="true"><span style="width:${rate}%"></span></span></span>`;
  }
  const highlights = highlightList(p, id, combined ? p.character : character, acrossGames ? 8 : combined ? 7 : 6);
  const toggle = highlights
   ? `<button class="highlight-toggle" type="button" aria-expanded="false" aria-controls="${id}" aria-label="${tr('Highlights for','Destacados de')} ${tag}">#${rank}</button>`
   : `#${rank}`;
  return `<tr${highlights ? ' class="has-highlights"' : ''}><td>${toggle}</td><td><strong>${tag}</strong></td>${combined ? `<td>${safe(p.character)}</td>` : ''}${acrossGames ? `<td>${names[p.game]}</td>` : ''}<td><b>${p.score.toFixed(1)}</b></td><td>${p.games}</td><td>${rateCell}</td><td>${p.date}</td></tr>${highlights}`;
 }).join('');
}
function detailView(game,char){
 const acrossGames = game === 'all';
 const players = acrossGames ? allEntries : boards[game][char].players;
 const games=gameOrder.filter(g=>boards[g][char]);
 const title=nameOf(char);
 const count=n=>char===ALL ? n+tr(' ranked entries',' entradas clasificadas') :n+' '+(n===1?tr('ranked player','jugador clasificado'):tr('ranked players','jugadores clasificados'));
 const comparison=char!==ALL && games.length>1?`<section class="panel compare"><h2>${title} ${tr('across games','por juego')}</h2><div>${games.map(g=>{
 const list=boards[g][char].players, leaders=list.filter(p=>p.score===list[0].score);
 return `<a href="#${g}/${char}" ${g===game?'aria-current="page"':''}><strong>${names[g]}</strong><small>${count(list.length)}</small><span>${leaders.map(p=>`#1 ${safe(p.tag)}${char===ALL ? ' ('+safe(p.character)+')' : ''} · ${p.games} ${tr('games','partidas')}`).join('<br>')}</span></a>`;
 }).join('')}</div></section>`:'';
 return `<section class="panel hero"><div><small>${(acrossGames ? tr('All games','Todos los juegos') : names[game]).toUpperCase()} / ${tr('ALL TIME','HISTÓRICO')}</small><h2>${title}</h2><p>${count(players.length)}</p></div><img class="${char!==ALL && (game==='rivals-2'||game==='rivals-of-aether')?'mirror':''}" src="${art[(acrossGames?'ultimate':game)+'/'+char]}" alt=""></section>${comparison}<section class="panel board"><div class="boardhead"><h2>${players.length===1?tr('Recorded player','Jugador registrado'):tr('Player leaderboard','Clasificación de jugadores')}</h2></div><p>${tr('Win rate uses games with a recorded pick and winner. Highlights show recorded character wins and finishes in brackets where the player used this character.','El porcentaje de victorias usa partidas con personaje y ganador registrados. Los destacados muestran victorias con el personaje y puestos en cuadros donde el jugador lo usó.')}</p><div class="rating-scroll"><table class="ratings"><thead><tr>${[tr('Rank','Puesto'),tr('Player','Jugador'),...(char===ALL?[tr('Character','Personaje')]:[]),...(acrossGames?[tr('Game','Juego')]:[]),tr('Score','Puntaje'),tr('Games','Partidas'),tr('Win rate','% de victorias'),tr('Last played','Última partida')].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody id="standings">${rows(players, title, char===ALL, acrossGames)}</tbody></table></div></section>`;
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
let previousScope='',query='';
function overview() {
 return `<section class="panel"><h2>${tr('Tournament results by character','Resultados por personaje')}</h2>
 <p>${tr('Choose a character to see who played them in tournaments. Each game has its own all-time leaderboard, with scores and games played for each player’s use of that character.', 'Elegí un personaje para ver quiénes lo usaron en torneos. Cada juego tiene su propia clasificación histórica, con el puntaje y las partidas de cada jugador con ese personaje.')}</p>
 <p>${tr('Open a player’s row to explore recorded highlights, including tournament finishes and upset wins.', 'Abrí la fila de un jugador para explorar sus resultados destacados, como puestos en torneos y victorias contra rivales mejor sembrados.')}</p></section>`;
}
function render(){
 const [raw,routeKey,preferred]=location.hash.slice(1).split('/');
 const requested = routeKey === 'sheik-zelda' ? 'sheik' : routeKey === 'simon-belmont' ? 'simon' : routeKey;
 const scope=Object.hasOwn(rosters,raw)?raw:'all';
 const keys=Object.keys(scope==='all'?allRoster:rosters[scope]).sort((a,b)=>Number(b===ALL)-Number(a===ALL)||collator.compare(nameOf(a),nameOf(b)));
 const char = keys.includes(requested) ? requested : null;
 const game=char && char!==ALL && scope==='all'?(allRoster[char].includes(preferred)?preferred:allRoster[char][0]):scope;
 // The roster is rebuilt below. Preserve its scroll position within the same game filter.
 const rosterOffset = scope === previousScope ? document.querySelector('#grid')?.scrollTop ?? 0 : 0;
 if(scope!==previousScope){previousScope=scope;query=''}
 const hashFor=(key,g)=>scope==='all' && key!==ALL?'#all/'+key+'/'+g:'#'+scope+'/'+key;
 view.innerHTML=`<div class="page-heading"><small>${tr('RANKINGS / CHARACTERS','RANKINGS / PERSONAJES')}</small><h1>${tr('Characters','Personajes')}</h1></div><div class="workspace"><aside class="panel sidebar"><div class="controls"><label>${tr('GAME','JUEGO')}<select id="game">${Object.entries({all:tr('All games','Todos los juegos'),...names}).map(([k,n])=>`<option value="${k}" ${k===scope?'selected':''}>${n}</option>`).join('')}</select></label><label>${tr('CHARACTER','PERSONAJE')}<input type="search" id="search" placeholder="${tr('Search roster','Buscar personaje')}"></label></div><h2>${scope==='all'?tr('All characters','Todos los personajes'):tr(names[scope]+' roster','Personajes de '+names[scope])}</h2><div class="grid" id="grid"></div></aside><article class="detail">${char ? detailView(game,char) : overview()}</article></div>`;
 if(scope==='all')for(const link of view.querySelectorAll('.compare a')){const target=link.hash.slice(1).split('/')[0];link.hash=hashFor(char,target)}
 const search=document.querySelector('#search');search.value=query;
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
 search.oninput=filter;filter();
 document.querySelector('#grid').scrollTop = rosterOffset;
 document.querySelector('#game').onchange = event => {
  const next = event.target.value;
  if (!char || (next !== 'all' && !Object.hasOwn(rosters[next], char))) {
   location.hash = next;
  } else {
   location.hash = next === 'all' && char!==ALL ? 'all/'+char+'/'+game : next+'/'+char;
  }
 };
}
view.addEventListener('click', event => {
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
 const row = event.target.closest('tr.has-highlights');
 if (!row || event.target.closest('a')) return;
 const button = row.querySelector('.highlight-toggle');
 const details = document.getElementById(button.getAttribute('aria-controls'));
 details.hidden = !details.hidden;
 button.setAttribute('aria-expanded', String(!details.hidden));
});
window.addEventListener('hashchange',render);
window.i18n?.onChange(render);
render();

})();
