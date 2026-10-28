/* v2.4.0 — merge separately verified public preliminary standings; official Pokémon Asia results win. */
(() => {
  'use strict';

  let cachedPreliminary = null;
  let cachedKnockout = null;
  let loadPromise = null;

  async function loadPreliminary() {
    if (cachedPreliminary) return cachedPreliminary;
    if (!loadPromise) {
      const fetchJson = path => fetch(path + '?v=' + Date.now(), {cache: 'no-store'})
        .then(response => {
          if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
          return response.json();
        });
      loadPromise = Promise.all([
        fetchJson('data/preliminary_results.json'),
        fetchJson('data/knockout_results.json').catch(error => {
          console.warn('複賽成績尚未取得，維持原預賽資料：', error);
          return null;
        })
      ])
        .then(([data, knockout]) => {
          if (data?.version !== 1 || !data.events || typeof data.events !== 'object') {
            throw new Error('Unsupported official preliminary source format');
          }
          cachedPreliminary = data;
          cachedKnockout = knockout?.version === 1 && knockout.events && typeof knockout.events === 'object'
            ? knockout : null;
          return data;
        })
        .catch(error => {
          loadPromise = null;
          console.warn('預賽排名未取得，繼續使用 Pokémon Asia 正式資料：', error);
          return null;
        });
    }
    return loadPromise;
  }

  const priorModal = window.openPlayerModal;
  const priorEvents = window.calculatedEventsForPlayer;
  const priorBest = window.calculatedTop8;
  const priorHtml = window.eventsHtml;
  const priorPoints = window.calculatedPointsHtml;
  if (typeof priorModal !== 'function' || typeof priorEvents !== 'function'
      || typeof priorBest !== 'function' || typeof priorHtml !== 'function') {
    console.warn('預賽試算未載入：找不到現有玩家資料函式');
    return;
  }

  // One-time community bracket evidence. Require an exact match to all eight
  // preliminary players, podium/tie structure and Ultra LP before displaying it.
  // A later Pokémon Asia result always takes priority in calculatedEventsForPlayer.
  function validatedKnockout(event, prelim) {
    const bracket = cachedKnockout?.events?.[String(event.event_id)];
    if (!bracket || event.league !== 'Ultra' || bracket.event_id !== String(event.event_id)
        || bracket.date !== event.date || bracket.group !== event.group
        || bracket.league !== event.league || bracket.source_type !== 'community_knockout_bracket'
        || !Array.isArray(bracket.results) || bracket.results.length !== 8
        || !Array.isArray(prelim.standings)) return null;
    const eligible = prelim.standings.filter(row => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 8);
    if (eligible.length !== 8) return null;
    const rankMap = new Map(eligible.map(row => [row.player_id, row.rank]));
    const expected = [1, 2, 3, 3, 5, 5, 5, 5];
    const possible = {1: 100, 2: 75, 3: 50, 5: 25};
    const valid = new Set();
    for (const result of bracket.results) {
      if (!rankMap.has(result.player_id)
          || result.preliminary_rank !== rankMap.get(result.player_id)
          || possible[result.final_rank] !== result.points
          || !['冠軍', '亞軍', '四強', '八強'].includes(result.finish)
          || result.finish !== ({1:'冠軍', 2:'亞軍', 3:'四強', 5:'八強'})[result.final_rank]
          || valid.has(result.player_id)) return null;
      valid.add(result.player_id);
    }
    if (valid.size !== 8
        || bracket.results.map(row => row.final_rank).sort((a,b) => a-b).join(',') !== expected.join(',')) return null;
    return bracket;
  }

  function sourceRow(event, playerId) {
    const cached = cachedPreliminary?.events?.[String(event.event_id)];
    if (!cached || cached.event_id !== String(event.event_id)
        || cached.league !== event.league || cached.group !== event.group
        || cached.date !== event.date || !Number.isInteger(cached.participants)
        || !Array.isArray(cached.standings) || cached.standings.length !== cached.participants
        || cached.participants < 9) return null;

    const row = cached.standings.find(r => String(r.player_id || '').toLowerCase() === playerId);
    if (!row || !Number.isInteger(row.rank) || row.rank < 1 || row.rank > cached.participants) return null;
    const bracket = event.league === 'Ultra' && cached.ranking_type === 'preliminary'
      ? validatedKnockout(event, cached) : null;
    const knockout = row.rank <= 8 ? bracket?.results.find(item => item.player_id === playerId) : null;
    const pending = event.league === 'Ultra' && cached.ranking_type === 'preliminary'
      && row.rank <= 8 && !knockout;
    // 已確認是 0 LP 的預賽不顯示；尚待複賽確認的 null LP 照常顯示。
    const estimated = row.status === 'estimated' && typeof row.points === 'number'
      && Number.isFinite(row.points) && row.points > 0;
    const knownMode = (event.league === 'Ultra' && cached.ranking_type === 'preliminary')
      || (event.league === 'Premier' && cached.ranking_type === 'final');
    if (!knownMode || (pending && (row.status !== 'pending-final' || row.points !== null))
        || (!pending && !estimated && !knockout)) return null;
    return {
      rank: knockout?.final_rank ?? row.rank,
      preliminaryRank: knockout?.preliminary_rank ?? row.rank,
      finishLabel: knockout?.finish || '',
      points: knockout?.points ?? (pending ? null : row.points),
      pending,
      bracketEstimate: Boolean(knockout),
      source_url: knockout ? bracket.source_url : (cached.source_url || '')
    };
  }

  window.calculatedEventsForPlayer = function(tournaments, playerId) {
    const official = priorEvents(tournaments, playerId);
    const id = String(playerId || '').trim().toLowerCase();
    if (!id || !cachedPreliminary?.events) return official;
    const existing = new Set(official.map(row => String(row.eventId || row.url || '')));
    const currentSeason = String(tournaments?.season || '').trim();
    const added = [];
    for (const event of tournaments?.events || []) {
      const eventSeason = String(event.season || '').trim();
      if (currentSeason && eventSeason && currentSeason !== eventSeason) continue;
      // Never blend provisional standings into a tournament that has official results.
      if (Array.isArray(event.results) && event.results.length) continue;
      if (existing.has(String(event.url || ''))) continue;
      const row = sourceRow(event, id);
      if (!row) continue;
      const location = window.ptcgOfficialVenue?.(event);
      added.push({
        name: event.title || '官方賽事',
        date: event.date || '—',
        location: location?.name || event.venue || event.region || '—',
        locationAddress: event.league === 'Ultra' ? (location?.address || event.address || '') : '',
        rank: row.rank,
        points: row.points,
        resultStatus: row.pending ? 'pending-final' : (row.bracketEstimate ? 'knockout-estimated' : 'estimated'),
        preliminary: event.league === 'Ultra' && !row.bracketEstimate,
        preliminaryRank: row.preliminaryRank,
        finishLabel: row.finishLabel,
        sourceUrl: row.source_url,
        url: event.url || '',
        eventId: String(event.event_id)
      });
    }
    return official.concat(added).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  };

  window.calculatedTop8 = function(events) {
    // Number(null) is 0, so exclude unconfirmed rows before handing them to the old calculation.
    return priorBest((events || []).filter(row => row.points !== null && row.points !== undefined
      && row.resultStatus !== 'pending-final' && Number.isFinite(Number(row.points))
      && Number(row.points) > 0));
  };

  function decorate(html, events) {
    if (!(events || []).some(event => event.resultStatus)) return html;
    const host = document.createElement('div');
    host.innerHTML = html;
    host.querySelectorAll('.event-table tbody tr').forEach((tr, index) => {
      const event = events[index];
      if (!event?.resultStatus) return;
      const cells = tr.querySelectorAll('td');
      if (cells.length < 5) return;
      const rank = cells[3].querySelector('strong');
      if (rank && event.preliminary) rank.textContent = '預賽第 ' + event.rank + ' 名';
      if (rank && event.resultStatus === 'knockout-estimated') {
        rank.textContent = event.finishLabel + (event.rank > 2 ? '（並列第 ' + event.rank + ' 名）' : '');
      }
      const explanation = document.createElement('small');
      explanation.className = 'preliminary-result-note';
      explanation.textContent = event.resultStatus === 'pending-final'
        ? '預賽名次不是最終名次'
        : (event.resultStatus === 'knockout-estimated'
          ? '預賽第 ' + event.preliminaryRank + ' 名；非官方複賽圖試算'
          : '試算');
      cells[3].appendChild(explanation);
      cells[4].textContent = event.resultStatus === 'pending-final'
        ? '—' : String(event.points) + (event.resultStatus === 'knockout-estimated' ? '（複賽試算）' : '（試算）');
    });
    host.querySelectorAll('.event-mobile-card').forEach((card, index) => {
      const event = events[index];
      if (!event?.resultStatus) return;
      const rank = card.querySelector('.event-mobile-rank');
      if (rank && event.preliminary) rank.textContent = '預賽第 ' + event.rank + ' 名';
      if (rank && event.resultStatus === 'knockout-estimated') {
        rank.textContent = event.finishLabel + (event.rank > 2 ? '（並列第 ' + event.rank + ' 名）' : '');
      }
      const score = card.querySelector('.event-mobile-head > span');
      if (score) score.textContent = event.resultStatus === 'pending-final'
        ? 'LP 待確認' : String(event.points)
          + (event.resultStatus === 'knockout-estimated' ? ' pt（複賽試算）' : ' pt（試算）');
      if (event.resultStatus === 'pending-final' || event.resultStatus === 'knockout-estimated') {
        const note = document.createElement('div');
        note.className = 'preliminary-result-note';
        note.textContent = event.resultStatus === 'pending-final'
          ? '預賽名次不是最終名次，待複賽成績確認'
          : '預賽第 ' + event.preliminaryRank + ' 名；非官方複賽圖試算，待官方確認';
        card.appendChild(note);
      }
    });
    return host.innerHTML;
  }

  window.eventsHtml = function(data) {
    return decorate(priorHtml(data), Array.isArray(data?.events) ? data.events : []);
  };

  if (typeof priorPoints === 'function') {
    window.calculatedPointsHtml = function(events, officialPoints) {
      let html = priorPoints(events, officialPoints);
      const pending = (events || []).filter(e => e.resultStatus === 'pending-final').length;
      const estimated = (events || []).filter(e => e.resultStatus === 'estimated' || e.resultStatus === 'knockout-estimated').length;
      const knockout = (events || []).filter(e => e.resultStatus === 'knockout-estimated').length;
      if (pending || estimated) {
        const notice = document.createElement('p');
        notice.className = 'preliminary-totals-note';
        notice.textContent = '另收錄 ' + estimated + ' 場可試算成績'
          + (pending ? '、' + pending + ' 場高級球預賽前 8 名待複賽確認（不列入積分與 Best 8）' : '')
          + (knockout ? '；其中 ' + knockout + ' 場採用非官方複賽圖試算' : '')
          + '；正式排名與積分以 Pokémon Asia 公告為準。';
        html = html.replace('</section>', notice.outerHTML + '</section>');
      }
      return html;
    };
  }

  // Share the exact same validated standings cache with the separate trial ranking.
  window.loadPreliminaryForRanking = loadPreliminary;

  window.openPlayerModal = async function(playerId) {
    await loadPreliminary();
    return priorModal(playerId);
  };

  const style = document.createElement('style');
  style.textContent = '.preliminary-result-note{display:block;color:#995a0d;font-size:12px;font-weight:600;line-height:1.5;margin-top:4px}'
    + '.preliminary-totals-note{color:#895b14;font-size:13px;line-height:1.5;margin-top:8px}'
    + '.event-points{white-space:nowrap}';
  document.head.appendChild(style);
})();
