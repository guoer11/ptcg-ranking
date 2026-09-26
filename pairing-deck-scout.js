(() => {
  'use strict';

  if (window.__pairingDeckScoutLoaded) return;
  window.__pairingDeckScoutLoaded = true;

  const TABLE_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-table';
  let deckCatalog = [];
  let currentContext = null;
  let initializedForUser = '';

  const $ = id => document.getElementById(id);

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function currentUserId() {
    return pairingSession?.user?.id || '';
  }

  function setStatus(text = '', type = '') {
    const el = $('pairingScoutMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `pairing-scout-message${type ? ` ${type}` : ''}`;
  }

  function setBusy(busy) {
    ['pairingScoutLoad','pairingScoutPrev','pairingScoutNext']
      .map($).filter(Boolean).forEach(el => { el.disabled = busy; });
  }

  async function loadCatalog() {
    if (!pairingClient || !pairingSession || !pairingAuthorized) return;
    const { data, error } = await pairingClient
      .from('pairing_deck_catalog')
      .select('id,name,sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    deckCatalog = data || [];
    if (!deckCatalog.length) {
      setStatus('尚未設定牌組清單，請到右上角 ICON → 牌組設定新增。', 'error');
    }
  }

  function deckOptions(selected = '') {
    return [
      '<option value="">選擇牌組…</option>',
      ...deckCatalog.map(item => `<option value="${esc(item.name)}"${item.name === selected ? ' selected' : ''}>${esc(item.name)}</option>`)
    ].join('');
  }

  async function fetchTable(table) {
    if (!pairingAuthorized || !pairingSession?.access_token) throw new Error('請先登入授權帳號');
    const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
    if (sourceInput()) sourceInput().value = parsed.url;
    const response = await fetch(TABLE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pairingSession.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: parsed.url, table: String(table) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || '桌號配對讀取失敗');
    return { data, parsed };
  }

  async function scoutRows(tid, ids = []) {
    if (!tid || !pairingClient) return [];
    let query = pairingClient
      .from('pairing_deck_scouts')
      .select('player_id,deck_name,observed_round,table_no,updated_at')
      .eq('tid', String(tid));
    if (ids.length) query = query.in('player_id', ids.map(normalizePlayerId));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function pairObservationRows(tid) {
    if (!tid || !pairingClient) return [];
    const { data, error } = await pairingClient
      .from('pairing_deck_pair_observations')
      .select('round_no,table_no,player_a_id,player_b_id,deck_a,deck_b,created_at,updated_at')
      .eq('tid', String(tid))
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function pairObservation(tid, round, table) {
    if (!tid || !pairingClient) return null;
    const { data, error } = await pairingClient
      .from('pairing_deck_pair_observations')
      .select('round_no,table_no,player_a_id,player_b_id,deck_a,deck_b,created_at,updated_at')
      .eq('tid', String(tid))
      .eq('round_no', Number(round))
      .eq('table_no', String(table))
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function saveScout(tid, round, table, playerId, deckName) {
    if (!deckName || !playerId) return;
    const { error } = await pairingClient.from('pairing_deck_scouts').upsert({
      user_id: currentUserId(),
      tid: String(tid),
      player_id: normalizePlayerId(playerId),
      deck_name: deckName,
      observed_round: Number(round) || null,
      table_no: String(table || ''),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,tid,player_id' });
    if (error) throw error;
  }

  async function savePairObservation(tid, round, table, playerA, playerB, deckA, deckB) {
    if (!deckA || !deckB) return;
    const { error } = await pairingClient.from('pairing_deck_pair_observations').upsert({
      user_id: currentUserId(),
      tid: String(tid),
      round_no: Number(round),
      table_no: String(table),
      player_a_id: normalizePlayerId(playerA),
      player_b_id: normalizePlayerId(playerB),
      deck_a: deckA,
      deck_b: deckB,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,tid,round_no,table_no' });
    if (error) throw error;
  }

  async function deletePairObservation(tid, round, table) {
    const { error } = await pairingClient
      .from('pairing_deck_pair_observations')
      .delete()
      .eq('tid', String(tid))
      .eq('round_no', Number(round))
      .eq('table_no', String(table));
    if (error) throw error;
  }

  function possibleDecksForPlayer(playerId, exactRows, pairRows) {
    const id = normalizePlayerId(playerId);
    const exact = new Map(exactRows.map(row => [normalizePlayerId(row.player_id), row.deck_name]));
    if (exact.has(id)) return { confirmed: exact.get(id), possible: [] };

    const possible = new Set();
    for (const row of pairRows) {
      const a = normalizePlayerId(row.player_a_id);
      const b = normalizePlayerId(row.player_b_id);
      if (a !== id && b !== id) continue;
      const other = a === id ? b : a;
      const decks = [row.deck_a, row.deck_b].filter(Boolean);
      const otherDeck = exact.get(other) || '';
      if (row.deck_a === row.deck_b) {
        possible.add(row.deck_a);
      } else if (otherDeck && decks.includes(otherDeck)) {
        decks.filter(deck => deck !== otherDeck).forEach(deck => possible.add(deck));
      } else {
        decks.forEach(deck => possible.add(deck));
      }
    }
    return { confirmed: '', possible: [...possible] };
  }

  async function deckKnowledge(tid, playerId) {
    const [exactRows, pairRows] = await Promise.all([
      scoutRows(tid),
      pairObservationRows(tid)
    ]);
    return possibleDecksForPlayer(playerId, exactRows, pairRows);
  }

  function playerLabel(id, index, names, match) {
    return names[id] || (index === 0 ? match.player_name : match.opponent_name) || id;
  }

  async function renderScoutMatch(data, table) {
    const box = $('pairingScoutResult');
    if (!box) return;
    if (!data?.available) {
      box.className = 'pairing-scout-result is-waiting';
      box.innerHTML = `<strong>Round ${esc(data?.round || '—')} 尚未公布</strong><span>等配對公布後再開始逐桌紀錄。</span>`;
      return;
    }
    const match = data?.match;
    if (!match) {
      box.className = 'pairing-scout-result is-error';
      box.innerHTML = `<strong>找不到第 ${esc(table)} 桌</strong><span>可能已經超過本輪最後一桌。</span>`;
      return;
    }

    const ids = [normalizePlayerId(match.player), normalizePlayerId(match.opponent)].filter(Boolean);
    const [names, saved, allPairs] = await Promise.all([
      lookupRealNames(ids),
      scoutRows(data.tid),
      pairObservationRows(data.tid)
    ]);
    const pairSaved = allPairs.find(row =>
      Number(row.round_no) === Number(data.round) &&
      String(row.table_no) === String(match.table || table)
    ) || null;
    const savedMap = Object.fromEntries(saved.map(row => [normalizePlayerId(row.player_id), row.deck_name]));
    const cards = ids.map((id, index) => {
      const display = playerLabel(id, index, names, match);
      const selected = savedMap[id] || '';
      const knowledge = possibleDecksForPlayer(id, saved, allPairs);
      const possible = !selected && knowledge.possible.length
        ? `<em class="pairing-scout-player-possible">可能：${knowledge.possible.map(esc).join(' / ')}</em>`
        : '';
      return `
        <article class="pairing-scout-player">
          <div><span>玩家 ${index + 1}</span><strong>${esc(display)}</strong><small>${esc(id)}</small>${possible}</div>
          <select data-scout-player="${esc(id)}" ${deckCatalog.length ? '' : 'disabled'}>
            ${deckOptions(selected)}
          </select>
        </article>`;
    }).join('');

    box.className = 'pairing-scout-result is-found';
    box.innerHTML = `
      <div class="pairing-scout-result-head"><strong>第 ${esc(match.table || table)} 桌</strong><span>Round ${esc(data.round || '—')}</span></div>
      <label class="pairing-scout-unknown-toggle">
        <input id="pairingScoutUnknownToggle" type="checkbox" ${pairSaved ? 'checked' : ''}>
        <span><strong>不知道哪位是哪副牌</strong><small>只記這桌看到的兩副牌，不必先認出玩家。</small></span>
      </label>
      <div id="pairingScoutExactMode" ${pairSaved ? 'hidden' : ''}>
        <div class="pairing-scout-players">${cards}</div>
      </div>
      <div id="pairingScoutPairMode" class="pairing-scout-pair-mode" ${pairSaved ? '' : 'hidden'}>
        <div class="pairing-scout-pair-people">
          <span>這桌玩家</span>
          <strong>${esc(playerLabel(ids[0], 0, names, match))}</strong>
          <b>／</b>
          <strong>${esc(playerLabel(ids[1], 1, names, match))}</strong>
          <small>不用判斷哪個人是哪副牌</small>
        </div>
        <div class="pairing-scout-pair-decks">
          <label><span>看到的牌組 1</span><select id="pairingScoutPairDeckA" ${deckCatalog.length ? '' : 'disabled'}>${deckOptions(pairSaved?.deck_a || '')}</select></label>
          <b>VS</b>
          <label><span>看到的牌組 2</span><select id="pairingScoutPairDeckB" ${deckCatalog.length ? '' : 'disabled'}>${deckOptions(pairSaved?.deck_b || '')}</select></label>
        </div>
        <small class="pairing-scout-pair-tip">兩邊都選好後自動儲存；之後若確認其中一人的牌組，系統會縮小另一人的可能牌組。</small>
      </div>`;

    const toggle = $('pairingScoutUnknownToggle');
    const exactMode = $('pairingScoutExactMode');
    const pairMode = $('pairingScoutPairMode');
    toggle?.addEventListener('change', async () => {
      if (exactMode) exactMode.hidden = toggle.checked;
      if (pairMode) pairMode.hidden = !toggle.checked;
      if (!toggle.checked && pairSaved) {
        try {
          await deletePairObservation(data.tid, data.round, match.table || table);
          setStatus('已切回「知道玩家對應」模式。', 'success');
          await refreshStats(data.tid);
        } catch (error) {
          setStatus(`模式切換失敗：${error?.message || error}`, 'error');
        }
      }
    });

    box.querySelectorAll('[data-scout-player]').forEach(select => {
      select.addEventListener('change', async () => {
        const deckName = select.value;
        if (!deckName) return;
        select.disabled = true;
        try {
          await saveScout(data.tid, data.round, match.table || table, select.dataset.scoutPlayer, deckName);
          await deletePairObservation(data.tid, data.round, match.table || table).catch(() => {});
          setStatus(`已確認：${deckName}`, 'success');
          await refreshStats(data.tid);
        } catch (error) {
          setStatus(`儲存失敗：${error?.message || error}`, 'error');
        } finally {
          select.disabled = false;
        }
      });
    });

    async function saveUnknownPairIfReady() {
      const deckA = $('pairingScoutPairDeckA')?.value || '';
      const deckB = $('pairingScoutPairDeckB')?.value || '';
      if (!deckA || !deckB) {
        setStatus('請把這桌看到的兩副牌都選好。');
        return;
      }
      const selects = [$('pairingScoutPairDeckA'), $('pairingScoutPairDeckB')].filter(Boolean);
      selects.forEach(select => { select.disabled = true; });
      try {
        await savePairObservation(data.tid, data.round, match.table || table, ids[0], ids[1], deckA, deckB);
        setStatus(`已記錄這桌：${deckA} vs ${deckB}（尚未對應玩家）`, 'success');
        await refreshStats(data.tid);
      } catch (error) {
        setStatus(`儲存失敗：${error?.message || error}`, 'error');
      } finally {
        selects.forEach(select => { select.disabled = false; });
      }
    }

    $('pairingScoutPairDeckA')?.addEventListener('change', saveUnknownPairIfReady);
    $('pairingScoutPairDeckB')?.addEventListener('change', saveUnknownPairIfReady);

    if (!deckCatalog.length) {
      setStatus('尚未設定牌組清單，請到右上角 ICON → 牌組設定新增。', 'error');
    } else if (pairSaved) {
      setStatus(`已載入這桌的未辨識紀錄：${pairSaved.deck_a} vs ${pairSaved.deck_b}`, 'success');
    }
  }

  async function loadTable(table) {
    const n = Number(table);
    if (!Number.isInteger(n) || n < 1) return setStatus('桌號請輸入 1 以上的整數。', 'error');
    setBusy(true);
    setStatus('正在讀取這一桌…');
    try {
      const { data, parsed } = await fetchTable(n);
      currentContext = { data, parsed, table: n };
      const input = $('pairingScoutTable');
      if (input) input.value = String(n);
      await renderScoutMatch(data, n);
      await refreshStats(parsed.tid);
      if (data.match && !$('pairingScoutUnknownToggle')?.checked) {
        setStatus('已載入；認得玩家就直接選牌組，不認得就勾「不知道哪位是哪副牌」。', 'success');
      } else if (!data.match) {
        setStatus('找不到這一桌。');
      }
    } catch (error) {
      setStatus(error?.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function refreshStats(tid) {
    const box = $('pairingScoutStats');
    if (!box || !tid) return;
    const [exactRows, pairRows] = await Promise.all([scoutRows(tid), pairObservationRows(tid)]);
    const counts = new Map();
    const countedPlayers = new Set();
    let ambiguousPairs = 0;

    const add = deck => counts.set(deck, (counts.get(deck) || 0) + 1);
    for (const row of exactRows) {
      const id = normalizePlayerId(row.player_id);
      if (!id || countedPlayers.has(id)) continue;
      countedPlayers.add(id);
      add(row.deck_name);
    }

    for (const row of pairRows) {
      const a = normalizePlayerId(row.player_a_id);
      const b = normalizePlayerId(row.player_b_id);
      if (!a || !b) continue;
      const aKnown = exactRows.find(item => normalizePlayerId(item.player_id) === a)?.deck_name || '';
      const bKnown = exactRows.find(item => normalizePlayerId(item.player_id) === b)?.deck_name || '';

      if (aKnown && bKnown) continue;

      if (aKnown && !bKnown && !countedPlayers.has(b)) {
        const inferred = row.deck_a === row.deck_b
          ? row.deck_a
          : ([row.deck_a, row.deck_b].includes(aKnown) ? [row.deck_a, row.deck_b].find(deck => deck !== aKnown) : '');
        if (inferred) {
          add(inferred);
          countedPlayers.add(b);
          continue;
        }
      }

      if (bKnown && !aKnown && !countedPlayers.has(a)) {
        const inferred = row.deck_a === row.deck_b
          ? row.deck_a
          : ([row.deck_a, row.deck_b].includes(bKnown) ? [row.deck_a, row.deck_b].find(deck => deck !== bKnown) : '');
        if (inferred) {
          add(inferred);
          countedPlayers.add(a);
          continue;
        }
      }

      if (!aKnown && !bKnown && !countedPlayers.has(a) && !countedPlayers.has(b)) {
        add(row.deck_a);
        add(row.deck_b);
        countedPlayers.add(a);
        countedPlayers.add(b);
        ambiguousPairs += 1;
      }
    }

    const sorted = [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    if (!sorted.length) {
      box.innerHTML = '<div class="pairing-scout-stats-empty">這場比賽還沒有牌組紀錄。</div>';
      return;
    }

    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    const segments = sorted.map(([name, count], index) => {
      const start = cursor;
      cursor += count / total * 100;
      return `hsl(${(index * 67 + 210) % 360} 65% 56%) ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    const legend = sorted.map(([name, count], index) => {
      const pct = Math.round(count / total * 100);
      return `<div><i style="--dot:hsl(${(index * 67 + 210) % 360} 65% 56%)"></i><span>${esc(name)}</span><b>${count} · ${pct}%</b></div>`;
    }).join('');
    const note = ambiguousPairs ? `（含 ${ambiguousPairs} 桌未辨識）` : '';
    box.innerHTML = `
      <div class="pairing-scout-stats-head"><strong>牌組分布</strong><span>已記錄 ${total} 位玩家${note}</span></div>
      <div class="pairing-scout-chart-wrap">
        <div class="pairing-scout-donut" style="background:conic-gradient(${segments.join(',')})"><span>${total}<small>人</small></span></div>
        <div class="pairing-scout-legend">${legend}</div>
      </div>`;
  }

  async function decorateMainPairing(detail) {
    const data = detail?.data;
    const opponentId = normalizePlayerId(detail?.opponentId);
    const tid = String(data?.tid || '');
    if (!opponentId || !tid) return;

    const knowledge = await deckKnowledge(tid, opponentId).catch(() => ({ confirmed: '', possible: [] }));
    const article = document.querySelector('#pairingResult .pairing-match-grid article:nth-child(3)');
    if (!article) return;
    article.querySelector('.pairing-scout-known')?.remove();

    const badge = document.createElement('div');
    if (knowledge.confirmed) {
      badge.className = 'pairing-scout-known';
      badge.innerHTML = `已記錄牌組：<strong>${esc(knowledge.confirmed)}</strong>`;
    } else if (knowledge.possible.length) {
      badge.className = 'pairing-scout-known possible';
      badge.innerHTML = `可能牌組：<strong>${knowledge.possible.map(esc).join(' / ')}</strong>`;
    } else {
      badge.className = 'pairing-scout-known unknown';
      badge.textContent = '牌組尚未記錄';
    }
    article.appendChild(badge);
  }

  function inject() {
    const main = document.querySelector('main.pairing-main');
    const grid = main?.querySelector('.pairing-grid');
    if (!main || !grid) return;

    let section = $('pairingDeckScout');
    if (!section) {
      section = document.createElement('section');
      section.id = 'pairingDeckScout';
      section.className = 'panel pairing-scout-panel';
      section.innerHTML = `
        <div class="pairing-scout-head">
          <div><h2>牌組偵察</h2><p>逐桌快速選擇牌組；認不出玩家時也可以只記這桌看到的兩副牌。</p></div>
        </div>
        <div class="pairing-scout-controls">
          <button id="pairingScoutPrev" class="secondary-btn" type="button">← 上一桌</button>
          <label><span>桌號</span><input id="pairingScoutTable" class="search-input" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
          <button id="pairingScoutLoad" class="primary-btn" type="button">載入這桌</button>
          <button id="pairingScoutNext" class="secondary-btn" type="button">下一桌 →</button>
        </div>
        <div id="pairingScoutResult" class="pairing-scout-result is-idle"><strong>準備好了</strong><span>先設定上方活動網址與 Round，再從第 1 桌開始。</span></div>
        <div id="pairingScoutMessage" class="pairing-scout-message"></div>
        <div id="pairingScoutStats" class="pairing-scout-stats"><div class="pairing-scout-stats-empty">載入任一桌後會顯示這場比賽的牌組分布。</div></div>`;
      grid.after(section);
    }

    if (section.dataset.scoutBound === '1') return;
    section.dataset.scoutBound = '1';

    $('pairingScoutLoad')?.addEventListener('click', () => loadTable($('pairingScoutTable')?.value));
    $('pairingScoutPrev')?.addEventListener('click', () => loadTable(Math.max(1, Number($('pairingScoutTable')?.value || 1) - 1)));
    $('pairingScoutNext')?.addEventListener('click', () => loadTable(Number($('pairingScoutTable')?.value || 1) + 1));
  }

  async function onAuthorized() {
    if (!pairingAuthorized || !pairingSession?.user?.id) return;
    if (initializedForUser === pairingSession.user.id) return;
    initializedForUser = pairingSession.user.id;
    try { await loadCatalog(); }
    catch (error) { setStatus(`牌組清單讀取失敗：${error?.message || error}`, 'error'); }
  }

  document.addEventListener('pairing:auth-ready', onAuthorized);
  document.addEventListener('deck-catalog-updated', async () => {
    if (!pairingAuthorized || !pairingSession?.user?.id) return;
    try {
      await loadCatalog();
      if (currentContext) await renderScoutMatch(currentContext.data, currentContext.table);
    } catch (error) {
      setStatus(`牌組清單讀取失敗：${error?.message || error}`, 'error');
    }
  });
  document.addEventListener('pairing:match-rendered', event => decorateMainPairing(event.detail));
  document.addEventListener('DOMContentLoaded', () => {
    inject();
    setTimeout(onAuthorized, 500);
  }, { once: true });
})();