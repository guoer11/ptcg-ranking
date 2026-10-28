/* v2.5.0: optional projected Junior ranking; never modifies official ranking.json. */
(() => {
  'use strict';
  function rankPlayers(entries) {
    const rows = entries.slice().sort((a,b) =>
      b.points - a.points || String(a.player_id).localeCompare(String(b.player_id)));
    let lastScore = null;
    let place = 0;
    rows.forEach((row,i) => {
      if (lastScore !== row.points) place = i + 1;
      row.rank = place;
      lastScore = row.points;
    });
    return rows;
  }

  // If our published official event records fully reconcile to the official ranking,
  // calculate the full Best 8 replacement; otherwise keep the official score as
  // baseline and label the increment provisional (it can overestimate a full Best 8).
  function projectPlayer(official, knownEvents) {
    const officialPoints = Number.isFinite(Number(official?.points)) ? Number(official.points) : 0;
    const published = knownEvents.filter(row => row.resultStatus == null
      && typeof row.points === 'number' && Number.isFinite(row.points) && row.points > 0);
    const newEvents = knownEvents.filter(row =>
      ['estimated','knockout-estimated'].includes(row.resultStatus)
      && typeof row.points === 'number' && row.points > 0);
    const officialKnownTop8 = window.calculatedTop8(published).total;
    const combinedKnownTop8 = window.calculatedTop8(published.concat(newEvents)).total;
    let total = officialPoints, uncertainCap = false;
    if (officialKnownTop8 >= officialPoints && (published.length || newEvents.length)) {
      // Some individual official event scores were published before the overall ranking.
      total = Math.max(officialPoints, combinedKnownTop8);
      uncertainCap = officialKnownTop8 > officialPoints;
    } else if (newEvents.length) {
      total = officialPoints + newEvents.reduce((sum,row)=>sum + row.points,0);
      uncertainCap = true;
    }
    // Unranked players are included only once a positive, identified result exists.
    return {points:Math.max(officialPoints,total), officialPoints,
      gained:Math.max(0,total-officialPoints), uncertainCap,
      countedEvents:newEvents.length};
  }

  async function buildProjectedRankingRows(officialRows) {
    if (!Array.isArray(officialRows)) throw new Error('官方排行榜資料異常');
    if (typeof window.loadPreliminaryForRanking !== 'function') {
      throw new Error('官方賽事試算尚未初始化');
    }
    const [tournaments,preliminary] = await Promise.all([
      loadTournamentData(),window.loadPreliminaryForRanking()
    ]);
    if (!tournaments?.events || !preliminary?.events) throw new Error('試算資料尚未取得');
    const existing = new Map(officialRows.map(row => [String(row.player_id||'').toLowerCase(),row]));
    const candidates = new Set(existing.keys());
    const newSeason = String(tournaments.season || '');
    const allEvents = tournaments.events.filter(event =>
      event.group === 'Junior'
      && (!newSeason || !event.season || String(event.season) === newSeason));
    const eventById = new Map(allEvents.map(event=>[String(event.event_id),event]));
    for (const event of allEvents) {
      for (const row of (event.results || [])) {
        if (Number(row.points)>0 && /^tw\d{6,12}$/i.test(String(row.player_id))) {
          candidates.add(String(row.player_id).toLowerCase());
        }
      }
    }
    for (const [eventId,source] of Object.entries(preliminary.events)) {
      if (!eventById.has(eventId)) continue;
      if (source.group !== 'Junior' || !Array.isArray(source.standings)) continue;
      for (const row of source.standings) {
        if (/^tw\d{6,12}$/i.test(String(row.player_id))) candidates.add(row.player_id.toLowerCase());
      }
    }
    const rows = [];
    for (const id of candidates) {
      if (!/^tw\d{6,12}$/.test(id)) continue;
      const official = existing.get(id);
      const events = window.calculatedEventsForPlayer(tournaments,id);
      const estimate = projectPlayer(official,events);
      if (!official && estimate.points <= 0) continue;
      const name = official?.name || identityFor(id)?.real_name || id;
      rows.push({
        ...(official || {}),player_id:id,name,
        region:official?.region || '—',
        officialRank:official?.rank ?? null,
        ...estimate
      });
    }
    return rankPlayers(rows);
  }

  window.PTCGProjectionMath = {rankPlayers,projectPlayer};
  window.buildProjectedRankingRows = buildProjectedRankingRows;
})();
