(function(){
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = (key, values = {}) => {
    let value = window.i18n?.t?.(`profile.${key}`) || key;
    return value.replace(/\{(\w+)\}/g, (_, name) => esc(values[name] ?? ''));
  };
  const lang = () => window.i18n?.getLang?.() === 'es' ? 'es-UY' : 'en-US';
  const countLabel = (key, n) => window.i18n?.t?.(`profile.${key}.${new Intl.PluralRules(lang()).select(n)}`,{n:Number(n).toLocaleString(lang())}) || `${Number(n).toLocaleString(lang())} ${t(key)}`;
  let dataPromise;
  let profileIndex = [];
  let scoreHelpPointerHandler=null,scoreHelpKeyHandler=null;
  let state = { game: 'all', sort: 'score', dir: -1, open: null, initialized: false, mobileLimit: 12, mobileDefaultApplied: false };
  const tr = {
    gameName: {melee:'Melee', ultimate:'Ultimate', 'project-plus':'Project+', 'rivals-2':'Rivals 2', 'rivals-of-aether':'Rivals of Aether'},
    key: key => String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  };
  function load(){
    if(!dataPromise) dataPromise = Promise.all([
      fetch('data/profiles/index.json').then(r => r.ok ? r.json() : []),
      new Promise(resolve=>{
        if(window.CharactersLeaderboard){resolve(window.CharactersLeaderboard);return;}
        const ready=()=>resolve(window.CharactersLeaderboard||null);
        window.addEventListener('characters-leaderboard-ready',ready,{once:true});
        const script=document.createElement('script');script.src='js/characters.js';
        script.onerror=()=>resolve(null);
        document.head.append(script);
      })
    ]).then(([index])=>{profileIndex=index;}).catch(()=>null);
    return dataPromise;
  }
  function setData(){}
  function rowsFor(playerId){
    if(!window.CharactersLeaderboard || !playerId) return [];
    const input=String(playerId);
    const entry=profileIndex.find(item=>String(item.playerId)===input||String(item.slug)===input);
    return window.CharactersLeaderboard.profileRows(entry?.slug||input);
  }
  function rankClass(rank){return rank===1?'pc-rank-gold':rank===2?'pc-rank-silver':rank===3?'pc-rank-bronze':'pc-rank-other';}
  function selectBestRankRow(rows, game='all'){
    const minGames=Number(window.CharactersLeaderboard?.minGamesForWinRate)||0;
    const candidates=rows.filter(row=>{
      const fieldSize=Number(row.rankedCount),rank=Number(row.rank);
      const smallSample=row.winRate!==null&&Number(row.gameRecord?.[1])<minGames;
      return (game==='all'||row.game===game)&&Number.isFinite(rank)&&rank>0&&Number.isFinite(fieldSize)&&fieldSize>=4&&!smallSample;
    });
    candidates.sort((a,b)=>{
      const percentileA=Number(a.rank)/Number(a.rankedCount),percentileB=Number(b.rank)/Number(b.rankedCount);
      const primary=percentileA-percentileB||Number(b.rankedCount)-Number(a.rankedCount)||Number(b.score||0)-Number(a.score||0)||Number(b.games||0)-Number(a.games||0);
      if(primary)return primary;
      const gameA=String(a.game||''),gameB=String(b.game||'');
      if(gameA!==gameB)return gameA<gameB?-1:1;
      const keyA=String(a.characterKey||a.character||''),keyB=String(b.characterKey||b.character||'');
      return keyA===keyB?0:keyA<keyB?-1:1;
    });
    return candidates[0]||null;
  }
  function shares(rows){
    const total=window.CharactersLeaderboard.profileGamesTotal(rows);
    const parts=rows.map(r=>({...r,share:total?100*Number(r.games||0)/total:0})).sort((a,b)=>b.share-a.share);
    const visible=parts.slice(0,4), rest=parts.slice(4);
    if(rest.length) visible.push({other:true,character:t('other'),game:'',share:rest.reduce((n,p)=>n+p.share,0)});
    return {total,parts:visible};
  }
  function highlights(row){
    const content=renderHighlightMarkup(row);
    const link=`characters.html#${encodeURIComponent(row.characterKey)}/${encodeURIComponent(row.game)}`;
    return `<section class="pc-details" id="pc-detail-${row._index}" ${state.open===row._index?'':'hidden'}><div class="pc-highlights">${content}</div><div class="pc-actions"><a class="pc-leaderboard" href="${link}">${t('seeLeaderboard',{character:row.character})}</a><button type="button" class="pc-close" data-close="${row._index}">${t('close')}</button></div></section>`;
  }
  function renderHighlightMarkup(row){return window.CharactersLeaderboard.renderHighlights(row,row.character);}
  function render(root, player, allRows){
    if(!state.initialized){state.open=null;state.initialized=true;}
    const isMobile=window.matchMedia?.('(max-width: 640px)').matches===true;
    if(isMobile&&!state.mobileDefaultApplied){state.sort='games';state.dir=-1;state.mobileDefaultApplied=true;}
    let filtered=allRows.filter(r=>state.game==='all'||r.game===state.game);
    const values={games:r=>Number(r.games||0),score:r=>Number(r.score||0),rank:r=>Number(r.rank),rate:r=>r.winRate??-1,date:r=>r.date||'',character:r=>r.character};
    filtered.sort((a,b)=>{const av=values[state.sort](a),bv=values[state.sort](b);return (typeof av==='string'?av.localeCompare(bv):av-bv)*state.dir || Number(b.games||0)-Number(a.games||0);});
    const summary=shares(filtered); const games=[...new Set(allRows.map(r=>r.game))];
    const totalRows=allRows;
    const most=[...allRows].sort((a,b)=>Number(b.games||0)-Number(a.games||0)||String(b.date||'').localeCompare(String(a.date||'')))[0];
    const best=selectBestRankRow(filtered,state.game);
    const duplicateBestName=best&&allRows.filter(row=>String(row.character||'').toLocaleLowerCase()===String(best.character||'').toLocaleLowerCase()).length>1;
    const bestRankChip=best?`<span class="pc-chip-best-rank" tabindex="0" aria-describedby="pc-best-rank-tooltip"><span>${t('bestRankLabel')}</span><strong>${esc(best.character)}${duplicateBestName?` (${esc(tr.gameName[best.game]||best.game)})`:''}</strong><b class="pc-chip-rank ${rankClass(Number(best.rank))}">#${best.rank}</b><span>${t('bestRankOf',{n:best.rankedCount})}</span><span class="pc-best-rank-tooltip" id="pc-best-rank-tooltip" role="tooltip">${t('bestRankTooltip',{game:tr.gameName[best.game]||best.game,percent:Math.max(1,Math.ceil(Number(best.rank)/Number(best.rankedCount)*100)),n:best.rankedCount})}</span></span>`:'';
    const totalGames=window.CharactersLeaderboard.profileGamesTotal(allRows);
    const chips=[`${t('charactersCount',{n:window.CharactersLeaderboard.profileCharacterCount(allRows)})}`,most?`${t('mostPlayed')} ${esc(most.character)}`:'',totalGames?countLabel('games',totalGames):''].filter(Boolean);
    const shareColors=['var(--game-ultimate)','var(--game-melee)','var(--game-rivals-of-aether)','var(--accent)','var(--muted)'];
    const tenths=summary.parts.map(p=>Math.floor(p.share*10));
    if(tenths.length) tenths[0]+=1000-tenths.reduce((sum,value)=>sum+value,0);
    const sharePercent=index=>(tenths[index]/10).toFixed(1).replace(/\.0$/,'');
    const bar=summary.parts.map((p,i)=>`<span class="pc-segment" style="width:${p.share}%;--pc-share-color:${shareColors[i]||'var(--muted)'}" title="${esc(p.character)} ${sharePercent(i)}%"></span>`).join('');
    const legend=summary.parts.map((p,i)=>`<span class="pc-legend-item"><i aria-hidden="true" style="--pc-share-color:${shareColors[i]||'var(--muted)'}"></i>${esc(p.character)}${p.game?` (${esc(tr.gameName[p.game]||p.game)})`:''} ${sharePercent(i)}%</span>`).join('');
    const scoreExplanation=window.i18n?.t?.('characters.scoreExplanation')||'';
    const columns=[['character','character'],['rank','rank'],['score','score'],['games','games'],['rate','winRate'],['date','lastPlayed']];
    const head=columns.map(([key,label])=>`<th scope="col" aria-sort="${state.sort===key?(state.dir===1?'ascending':'descending'):'none'}"><button type="button" data-sort="${key}" class="pc-sort${state.sort===key?' active':''}">${t(label)}${state.sort===key?` <span aria-hidden="true">${state.dir===1?'↑':'↓'}</span>`:''}</button></th>`).join('');
    const visibleRows=isMobile?filtered.slice(0,state.mobileLimit):filtered;
    const tableRows=visibleRows.map((r,i)=>{r._index=i;const rate=r.winRate;const small=rate!==null&&Number(r.gameRecord?.[1])<window.CharactersLeaderboard.minGamesForWinRate;const open=state.open===i;
      const score=Number(r.score||0).toFixed(1),scoreLabel=`${t('score')} ${score}`,rankLabel=`${t('rank')} ${r.rank} ${t('rankOf')} ${r.rankedCount}`;
      const rateMarkup=rate===null?'—':`<span class="pc-rate${small?' small':''}"><b>${rate.toFixed(1)}%</b>${small?`<small>${t('smallSample')}</small>`:''}<i><span style="width:${Math.max(0,Math.min(100,rate))}%"></span></i></span>`;
      const mobileRate=rate===null?'—':`<span class="pc-mobile-rate${small?' small':''}"><span class="pc-mobile-rate-main"><b>${rate.toFixed(1)}%</b><i><span style="width:${Math.max(0,Math.min(100,rate))}%"></span></i></span>${small?`<small>${t('smallSample')}</small>`:''}</span>`;
      const chevron='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg>';
      const gameCount=countLabel('games',Number(r.games||0));
      return `<tr class="pc-entry${open?' is-open':''}" data-character-key="${esc(r.characterKey)}" data-game="${esc(r.game)}"><td colspan="7"><div class="pc-entry-inner"><div class="pc-row" role="row"><div class="pc-character" role="cell"><img src="${esc(r.stock||'')}" alt="" loading="lazy"><span><strong>${esc(r.character)}</strong><small>${esc(tr.gameName[r.game]||r.game)}</small></span></div><div role="cell"><span class="pc-rank ${rankClass(r.rank)}" aria-label="${rankLabel}">#${r.rank}</span><small class="pc-of">${t('rankOf')} ${r.rankedCount}</small></div><div class="pc-score" role="cell" aria-label="${scoreLabel}">${score}</div><div class="pc-games" role="cell">${gameCount}</div><div role="cell">${rateMarkup}</div><div class="pc-date" role="cell">${esc(r.lastPlayed||'—')}</div><div role="cell"><button class="pc-expand" type="button" aria-expanded="${open}" aria-controls="pc-detail-${i}" aria-label="${t('expandCharacter',{character:r.character})}" data-expand="${i}"><span aria-hidden="true">${chevron}</span></button></div></div><button class="pc-mobile-row" type="button" data-expand="${i}" aria-expanded="${open}" aria-controls="pc-detail-${i}" aria-label="${t('expandCharacter',{character:r.character})}"><span class="pc-mobile-line1"><img class="pc-mobile-stock" src="${esc(r.stock||'')}" alt="" loading="lazy"><span class="pc-mobile-name"><strong>${esc(r.character)}</strong><small>${esc(tr.gameName[r.game]||r.game)}</small></span><span class="pc-mobile-score" aria-label="${scoreLabel}"><strong>${score}</strong><small>${gameCount}</small></span><span class="pc-mobile-chevron">${chevron}</span></span><span class="pc-mobile-line2"><span class="pc-mobile-rank" aria-label="${rankLabel}"><b class="${rankClass(r.rank)}">#${r.rank}</b><small>${t('rankOf')} ${r.rankedCount}</small></span>${mobileRate}<span class="pc-mobile-date">${esc(r.lastPlayed||'—')}</span></span></button>${highlights(r)}</div></td></tr>`;
    }).join('');
    root.innerHTML=`<section class="pc-view"><header class="pc-heading"><h2>${t('characters')}</h2><p>${t('charactersIntro',{player:player.tag||player.name||''})}</p></header><div class="pc-chips">${chips.map(c=>`<span>${c}</span>`).join('')}${bestRankChip}</div><section class="pc-share"><p class="pc-kicker">${t('shareGames')}</p><div class="pc-bar" role="img" aria-label="${t('shareAria')}: ${summary.parts.map(p=>`${p.character} ${Math.round(p.share)}%`).join(', ')}">${bar}</div><div class="pc-legend">${legend}</div></section><nav class="pc-filters" aria-label="${t('allGames')}"><button type="button" data-game="all" aria-pressed="${state.game==='all'}">${t('allGames')}</button>${games.map(g=>`<button type="button" data-game="${esc(g)}" aria-pressed="${state.game===g}">${esc(tr.gameName[g]||g)}</button>`).join('')}</nav><section class="pc-table-card"><div class="pc-mobile-sort"><label>${t('sortBy')}<select data-mobile-sort>${[['games','games'],['score','score'],['rate','winRate'],['date','lastPlayed'],['rank','rank'],['character','character']].map(([k,label])=>`<option value="${k}" ${state.sort===k?'selected':''}>${t(label)}</option>`).join('')}</select></label><span class="pc-score-help-wrap"><button class="pc-score-help-toggle" type="button" aria-label="How score works" aria-expanded="false" aria-controls="pc-score-explanation" aria-describedby="pc-score-explanation">i</button><span class="pc-score-explanation" id="pc-score-explanation" role="tooltip" hidden>${esc(scoreExplanation)}</span></span></div><div class="pc-table-scroll"><table class="pc-table"><thead><tr>${head}<th aria-label=""></th></tr></thead><tbody>${tableRows||`<tr><td colspan="7">${t('noCharacterData')}</td></tr>`}</tbody></table></div>${isMobile&&filtered.length>state.mobileLimit?`<button type="button" class="pc-more">${window.i18n?.t?.('characters.showMoreCharacters')||'Show more characters'}</button>`:''}</section></section>`;
    root.querySelectorAll('.pc-filters button[data-game]').forEach(b=>b.addEventListener('click',()=>{state.game=b.dataset.game;state.open=null;render(root,player,totalRows);}));
    root.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.sort;if(state.sort===key)state.dir*=-1;else{state.sort=key;state.dir=key==='games'||key==='score'?-1:1;}render(root,player,totalRows);}));
    root.querySelector('[data-mobile-sort]')?.addEventListener('change',e=>{state.sort=e.target.value;state.dir=state.sort==='games'||state.sort==='score'?-1:1;render(root,player,totalRows);});
    const helpToggle=root.querySelector('.pc-score-help-toggle'),helpWrap=root.querySelector('.pc-score-help-wrap'),helpPopover=root.querySelector('.pc-score-explanation');
    if(scoreHelpPointerHandler)document.removeEventListener('pointerdown',scoreHelpPointerHandler);
    if(scoreHelpKeyHandler)document.removeEventListener('keydown',scoreHelpKeyHandler);
    helpToggle?.addEventListener('click',()=>{const open=helpToggle.getAttribute('aria-expanded')!=='true';helpToggle.setAttribute('aria-expanded',String(open));helpPopover.hidden=!open;});
    scoreHelpPointerHandler=event=>{if(helpPopover&&!helpPopover.hidden&&!helpWrap.contains(event.target)){helpPopover.hidden=true;helpToggle.setAttribute('aria-expanded','false');}};
    scoreHelpKeyHandler=event=>{if(event.key==='Escape'&&helpPopover&&!helpPopover.hidden){helpPopover.hidden=true;helpToggle.setAttribute('aria-expanded','false');helpToggle.focus();}};
    document.addEventListener('pointerdown',scoreHelpPointerHandler);
    document.addEventListener('keydown',scoreHelpKeyHandler);
    root.querySelector('.pc-more')?.addEventListener('click',()=>{state.mobileLimit+=12;render(root,player,totalRows);});
    root.querySelectorAll('.pc-row').forEach(row=>row.addEventListener('click',event=>{
      if(event.target.closest('a'))return;
      const button=row.querySelector('[data-expand]');
      const index=Number(button.dataset.expand);
      state.open=state.open===index?null:index;
      render(root,player,totalRows);
      root.querySelector(`[data-expand="${index}"]`)?.focus();
    }));
    root.querySelectorAll('.pc-mobile-row').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.expand);state.open=state.open===index?null:index;render(root,player,totalRows);root.querySelector(`.pc-mobile-row[data-expand="${index}"]`)?.focus();}));
    root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{const index=Number(b.dataset.close);state.open=null;render(root,player,totalRows);root.querySelector(isMobile?`.pc-mobile-row[data-expand="${index}"]`:`[data-expand="${index}"]`)?.focus();}));
  }
  window.ProfileCharacters={load,setData,rowsFor,render,renderHighlightMarkup,selectBestRankRow};
})();
