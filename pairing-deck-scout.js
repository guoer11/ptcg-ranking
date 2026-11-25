(() => {
  'use strict';

  if (window.__pairingDeckScoutLoaded) return;
  window.__pairingDeckScoutLoaded = true;

  const TABLE_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-table';
  let deckCatalog = [];
  let currentContext = null;
  let initializedForUser = '';
  let queryMode = 'table';
  let queryBusy = false;
  let scoutRevision = 0;
  let nameCandidates = null;
  let realtimeChannel=null,realtimeTimer=null,realtimeUser='',saving=0;
  let lastMainDetail=null;

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
    queryBusy = busy;
    const table = queryMode === 'table' ? Number($('pairingScoutTable')?.value) : currentContext?.table;
    const canNavigate = Number.isSafeInteger(table) && table > 0;
    ['pairingScoutLoad','pairingScoutTable'].map($).filter(Boolean)
      .forEach(el => { el.disabled = busy; });
    ['pairingScoutPrev','pairingScoutNext'].map($).filter(Boolean)
      .forEach(el => { el.disabled = busy || !canNavigate; });
    document.querySelectorAll('[data-pairing-scout-mode]').forEach(button => { button.disabled = busy; });
  }

  function scoutSourceKey() {
    try {
      const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
      return `${parsed.tid}:${parsed.round}`;
    } catch {
      return '';
    }
  }

  function isCurrentScout(data) {
    if (!data || currentContext?.data !== data) return false;
    const tid = String(data.tid || '');
    const round = Number(data.round);
    return Boolean(tid && Number.isInteger(round) &&
      String(currentContext.parsed?.tid) === tid &&
      Number(currentContext.parsed?.round) === round &&
      scoutSourceKey() === `${tid}:${round}`);
  }

  function invalidateScoutContext() {
    scoutRevision++;
    if (!currentContext && !queryBusy && !nameCandidates) return;
    currentContext = null;
    nameCandidates = null;
    const box = $('pairingScoutResult');
    if (box) {
      box.className = 'pairing-scout-result is-idle';
      box.innerHTML = '<strong>活動或輪次已變更</strong><span>舊配對已清除，請重新查詢這一輪，避免把牌組記到上一輪。</span>';
    }
    setStatus('已切換賽事或 Round，請重新查詢後再記錄牌組。');
    setBusy(queryBusy);
  }

  function samePairIds(record, ids) {
    const stored = [record?.player_a_id, record?.player_b_id].map(normalizePlayerId).filter(Boolean).sort();
    const current = (ids || []).map(normalizePlayerId).filter(Boolean).sort();
    return stored.length === 2 && current.length === 2 && stored.every((id, i) => id === current[i]);
  }

  function pairDeckConsistent(record, confirmed) {
    const decks = [String(record.deck_a || ''), String(record.deck_b || '')];
    const knownA = confirmed.get(normalizePlayerId(record.player_a_id)) || '';
    const knownB = confirmed.get(normalizePlayerId(record.player_b_id)) || '';
    if ((knownA && !decks.includes(knownA)) || (knownB && !decks.includes(knownB))) return false;
    if (knownA && knownB) return [knownA, knownB].sort().join('||') === decks.sort().join('||');
    return true;
  }

  function normalizeQueryPlayerId(value) {
    let id = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (/^\d{6,}$/.test(id)) id = `tw${id}`;
    return id;
  }

  function setQueryMode(mode, value = '') {
    scoutRevision++;
    queryMode = ['player','name'].includes(mode) ? mode : 'table';
    currentContext = null;
    nameCandidates = null;
    document.querySelectorAll('[data-pairing-scout-mode]').forEach(button => {
      const active = button.dataset.pairingScoutMode === queryMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const input = $('pairingScoutTable');
    if (input) {
      input.value = value;
      input.inputMode = queryMode === 'table' ? 'numeric' : 'text';
      input.placeholder = queryMode === 'table' ? '例如 1' : queryMode === 'name' ? '輸入完整或部分玩家姓名' : '例如 tw39371632';
      input.setAttribute('aria-label', queryMode === 'table' ? '桌號' : queryMode === 'name' ? '姓名' : 'PTCG ID');
    }
    if ($('pairingScoutValueLabel')) $('pairingScoutValueLabel').textContent = queryMode === 'table' ? '桌號' : queryMode === 'name' ? '姓名' : 'PTCG ID';
    const box = $('pairingScoutResult');
    if (box) {
      box.className = 'pairing-scout-result is-idle';
      box.innerHTML = `<strong>${queryMode === 'table' ? '輸入桌號查詢這桌的玩家與對手' : queryMode === 'name' ? '輸入姓名查詢玩家的桌號與對手' : '輸入 PTCG ID 查詢玩家的桌號與對手'}</strong><span>查詢後可直接記錄牌組；上方追蹤玩家與監控設定不會變更。</span>`;
    }
    setStatus('');
    setBusy(false);
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

  function matchFromRows(data, playerId) {
    for (const row of data?.matched_rows || []) {
      const ids = [...new Set((row?.cells || []).flatMap(cell => String(cell).match(/tw\d+/gi) || []).map(id => id.toLowerCase()))];
      if (ids.length < 2 || !ids.includes(playerId)) continue;
      return { table: String(row.cells?.[0] || ''), player: playerId, opponent: ids.find(id => id !== playerId) };
    }
    return null;
  }

  async function fetchLookup(value, mode) {
    if (!pairingAuthorized || !pairingSession?.access_token) throw new Error('請先登入授權帳號');
    const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
    if (sourceInput()) sourceInput().value = parsed.url;
    if (roundInput()) roundInput().value = String(parsed.round);
    const byPlayer = mode === 'player';
    const response = await fetch(byPlayer ? PAIRING_FUNCTION_URL : TABLE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pairingSession.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(byPlayer ? { url: parsed.url, player: value } : { url: parsed.url, table: String(value) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || (byPlayer ? '玩家配對讀取失敗' : '桌號配對讀取失敗'));
    if (byPlayer && !data.match) data.match = matchFromRows(data, value);
    return { data, parsed };
  }

  async function scoutRows(tid, ids = []) {
    if (!tid || !pairingClient) return [];
    let query = pairingClient
      .from('pairing_shared_scouts')
      .select('player_id,deck_name,observed_round,table_no,updated_at,user_id,conflict,contributor_count,alternatives')
      .eq('tid', String(tid));
    if (ids.length) query = query.in('player_id', ids.map(normalizePlayerId));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function pairObservationRows(tid) {
    if (!tid || !pairingClient) return [];
    const { data, error } = await pairingClient
      .from('pairing_shared_pairs')
      .select('round_no,table_no,player_a_id,player_b_id,deck_a,deck_b,created_at,updated_at,user_id,conflict,contributor_count')
      .eq('tid', String(tid))
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function pairObservation(tid, round, table) {
    if (!tid || !pairingClient) return null;
    const { data, error } = await pairingClient
      .from('pairing_shared_pairs')
      .select('round_no,table_no,player_a_id,player_b_id,deck_a,deck_b,created_at,updated_at,user_id,conflict,contributor_count')
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
      .eq('user_id',currentUserId())
      .eq('tid', String(tid))
      .eq('round_no', Number(round))
      .eq('table_no', String(table));
    if (error) throw error;
  }

  function possibleDecksForPlayer(playerId, exactRows, pairRows) {
    const id = normalizePlayerId(playerId);
    const conflict=exactRows.find(row=>normalizePlayerId(row.player_id)===id&&row.conflict);
    if(conflict)return {confirmed:'',possible:conflict.alternatives||[],conflict:true};
    const exact = new Map(exactRows.filter(row=>!row.conflict).map(row => [normalizePlayerId(row.player_id), row.deck_name]));
    if (exact.has(id)) return { confirmed: exact.get(id), possible: [] };

    const possible = new Set();
    for (const row of pairRows) {
      if (row.conflict || !pairDeckConsistent(row, exact)) continue; // Ignore conflicting historical guesses.
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

  async function renderScoutMatch(data, table, target = '') {
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
      box.innerHTML = `<strong>找不到配對</strong><span>Round ${esc(data?.round || '—')} 找不到 ${target ? esc(target) : `第 ${esc(table)} 桌`}。</span>`;
      return;
    }

    const ids = [normalizePlayerId(match.player), normalizePlayerId(match.opponent)].filter(Boolean);
    const [names, saved, allPairs] = await Promise.all([
      lookupRealNames(ids),
      scoutRows(data.tid),
      pairObservationRows(data.tid)
    ]);
    if (!isCurrentScout(data)) return;
    const savedAtTable = allPairs.find(row =>
      Number(row.round_no) === Number(data.round) &&
      String(row.table_no) === String(match.table || table)
    ) || null;
    const pairSaved = savedAtTable && samePairIds(savedAtTable, ids) ? savedAtTable : null;
    if (savedAtTable && !pairSaved) {
      box.className = 'pairing-scout-result is-error';
      box.innerHTML = '<strong>這桌先前記錄的玩家 ID 與官方配對不同</strong><span>已暫停這桌的牌組編輯，原紀錄保留。請先人工核對，避免覆寫其他玩家的牌組。</span>';
      setStatus('偵測到不同玩家 ID 的舊紀錄：請先人工複核，未變更任何原有資料。', 'error');
      return;
    }
    const savedMap = Object.fromEntries(saved.map(row => [normalizePlayerId(row.player_id), row.deck_name]));
    const cards = ids.map((id, index) => {
      const display = playerLabel(id, index, names, match);
      const selected = savedMap[id] || '';
      const record=saved.find(r=>normalizePlayerId(r.player_id)===id);
      const conflict=record?.conflict;
      const source=record?`<small>共用紀錄 · ${Number(record.contributor_count||1)} 人登記${record.user_id===currentUserId()?' · 包含自己的紀錄':''}</small>`:'';
      const conflictUI=conflict?`<small style="color:#b45309;font-weight:700">牌組衝突：${(record.alternatives||[]).map(esc).join(' / ')}（暫不計入統計）</small>${typeof pairingAccessRole!=='undefined'&&pairingAccessRole==='admin'?(record.alternatives||[]).map(deck=>`<button type="button" class="secondary-btn" data-resolve-player="${esc(id)}" data-resolve-deck="${esc(deck)}">採用 ${esc(deck)}</button>`).join(''):''}`:'';
      const knowledge = possibleDecksForPlayer(id, saved, allPairs);
      const possible = !selected && knowledge.possible.length
        ? `<em class="pairing-scout-player-possible">可能：${knowledge.possible.map(esc).join(' / ')}</em>`
        : '';
      return `
        <article class="pairing-scout-player">
          <div><span>玩家 ${index + 1}</span><strong>${esc(display)}</strong><small>${esc(id)}</small>${possible}${source}${conflictUI}</div>
          <select data-scout-player="${esc(id)}" ${deckCatalog.length ? '' : 'disabled'}>
            ${deckOptions(selected)}
          </select>
        </article>`;
    }).join('');

    box.className = 'pairing-scout-result is-found';
    box.innerHTML = `
      <div class="pairing-scout-result-head"><strong>第 ${esc(match.table || table)} 桌</strong><span>Round ${esc(data.round || '—')} · TID ${esc(data.tid || '—')}</span></div>
      ${pairSaved?.conflict?`<div class="pairing-scout-message error">同桌牌組紀錄有衝突，暫不列入統計。${typeof pairingAccessRole!=='undefined'&&pairingAccessRole==='admin'?'<button type="button" class="secondary-btn" id="pairingResolvePair">選擇採用的登記</button>':''}</div>`:''}
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
    toggle?.addEventListener('change', () => {
      if (!isCurrentScout(data)) return setStatus('活動或輪次已變更，請先重新查詢。', 'error');
      if (exactMode) exactMode.hidden = toggle.checked;
      if (pairMode) pairMode.hidden = !toggle.checked;
      // Mode switching must not remove existing pair-deck observations.
      if (!toggle.checked && pairSaved) setStatus('已切換成玩家辨識模式，原雙牌組紀錄仍保留。', 'success');
    });

    box.querySelectorAll('[data-resolve-player]').forEach(button=>button.addEventListener('click',async()=>{
      if(!isCurrentScout(data)||pairingAccessRole!=='admin')return;
      const id=button.dataset.resolvePlayer;
      const record=saved.find(r=>normalizePlayerId(r.player_id)===id),chosen=button.dataset.resolveDeck||'';
      if(!record?.alternatives?.includes(chosen))return setStatus('請先選擇現有衝突紀錄中的牌組。','error');
      const {error}=await pairingClient.from('pairing_scout_resolutions').upsert({tid:String(data.tid),player_id:id,deck_name:chosen,resolved_by:currentUserId(),resolved_at:new Date().toISOString()},{onConflict:'tid,player_id'});
      if(error)return setStatus(error.message,'error');
      await syncSharedScouting();
    }));
    $('pairingResolvePair')?.addEventListener('click',async()=>{
      if(!isCurrentScout(data)||pairingAccessRole!=='admin')return;
      const {data:records,error}=await pairingClient.from('pairing_deck_pair_observations').select('user_id,player_a_id,player_b_id,deck_a,deck_b').eq('tid',String(data.tid)).eq('round_no',Number(data.round)).eq('table_no',String(match.table||table));
      if(error)return setStatus(error.message,'error');
      const choices=records||[];
      const panel=document.createElement('div');panel.className='pairing-scout-message';
      for(const record of choices){
        const option=document.createElement('button');option.type='button';option.className='secondary-btn';option.textContent=(record.user_id===currentUserId()?'自己':'其他家長')+'：'+record.deck_a+' / '+record.deck_b;
        option.addEventListener('click',async()=>{
          const {error}=await pairingClient.from('pairing_pair_resolutions').upsert({tid:String(data.tid),round_no:Number(data.round),table_no:String(match.table||table),chosen_user_id:record.user_id,deck_a:record.deck_a,deck_b:record.deck_b,player_a_id:record.player_a_id,player_b_id:record.player_b_id,resolved_by:currentUserId(),resolved_at:new Date().toISOString()},{onConflict:'tid,round_no,table_no'});
          if(error)return setStatus(error.message,'error');await syncSharedScouting();
        });panel.append(option);
      }
      $('pairingResolvePair')?.replaceWith(panel);
    });
    box.querySelectorAll('[data-scout-player]').forEach(select => {
      select.addEventListener('change', async () => {
        if (!isCurrentScout(data)) return setStatus('活動或 Round 已變更，請重新查詢配對後再存檔。', 'error');
        const deckName = select.value;
        if (!deckName) return;
        select.disabled = true;
        saving++;
        try {
          await saveScout(data.tid, data.round, match.table || table, select.dataset.scoutPlayer, deckName);
          const latest=await scoutRows(data.tid,[select.dataset.scoutPlayer]);
          setStatus(latest[0]?.conflict?'已保存你的登記；與其他紀錄衝突，等待管理者確認。':`已確認：${deckName}`,latest[0]?.conflict?'error':'success');
          await refreshStats(data.tid);
        } catch (error) {
          setStatus(`儲存失敗：${error?.message || error}`, 'error');
        } finally {
          select.disabled = false;
          saving--;scheduleSharedSync();
        }
      });
    });

    async function saveUnknownPairIfReady() {
      if (!isCurrentScout(data)) return setStatus('活動或 Round 已變更，請重新查詢配對後再存檔。', 'error');
      const deckA = $('pairingScoutPairDeckA')?.value || '';
      const deckB = $('pairingScoutPairDeckB')?.value || '';
      if (!deckA || !deckB) {
        setStatus('請把這桌看到的兩副牌都選好。');
        return;
      }
      const selects = [$('pairingScoutPairDeckA'), $('pairingScoutPairDeckB')].filter(Boolean);
      selects.forEach(select => { select.disabled = true; });
      saving++;
      try {
        await savePairObservation(data.tid, data.round, match.table || table, ids[0], ids[1], deckA, deckB);
        setStatus(`已記錄這桌：${deckA} vs ${deckB}（尚未對應玩家）`, 'success');
        await refreshStats(data.tid);
      } catch (error) {
        setStatus(`儲存失敗：${error?.message || error}`, 'error');
      } finally {
        selects.forEach(select => { select.disabled = false; });
        saving--;scheduleSharedSync();
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

  let scoutRosterCache = null;
  async function getScoutRoster() {
    const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
    const key = currentUserId()+':'+parsed.tid+':'+parsed.round;
    if (scoutRosterCache?.key === key && Date.now()-scoutRosterCache.at < 30000)
      return scoutRosterCache.ids;
    const response = await fetch('https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-archive',{
      method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+pairingSession.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({action:'scout-roster',tid:parsed.tid,round:parsed.round})
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data.ok) throw new Error(data.error || '本輪參賽名單讀取失敗');
    if (String(data.tid)!==String(parsed.tid) || Number(data.round)!==Number(parsed.round))
      throw new Error('參賽名單與目前賽事或 Round 不一致');
    if (!data.available) throw new Error('本輪配對尚未公布，請稍後再查詢姓名');
    if (key!==currentUserId()+':'+scoutSourceKey()) throw new Error('活動或輪次已變更，請重新查詢');
    const ids=[...new Set((data.player_ids||[]).map(normalizeQueryPlayerId).filter(id=>/^tw\d+$/.test(id)))];
    if (!ids.length) throw new Error('本輪參賽名單尚未完整');
    scoutRosterCache={key,at:Date.now(),ids};
    return ids;
  }
  async function searchScoutNames(raw) {
    if (!pairingAuthorized || !pairingSession?.user?.id || !pairingClient)
      throw new Error('請先登入授權帳號');
    const term = String(raw || '').trim();
    if (!term || Array.from(term).length > 40 || /[%_*\\]/.test(term))
      throw new Error('請輸入有效的玩家姓名');
    const ids = await getScoutRoster(), allowed = new Set(ids);
    const chunks=[];
    for(let i=0;i<ids.length;i+=100) chunks.push(ids.slice(i,i+100));
    const results=[];
    // Only request identities belonging to the selected round; no global search.
    for(let i=0;i<chunks.length;i+=4){
      const batch=await Promise.all(chunks.slice(i,i+4).map(chunk=>pairingClient.from('player_identities')
        .select('player_id,real_name').in('player_id',chunk).ilike('real_name','%'+term+'%')
        .order('real_name').order('player_id')));
      for(const result of batch){
        if(result.error)throw result.error;
        results.push(...(result.data||[]));
      }
    }
    const rows=new Map();
    for(const row of results){
      const id=normalizeQueryPlayerId(row.player_id);
      if(allowed.has(id)&&row.real_name)rows.set(id,{id,name:String(row.real_name)});
    }
    return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')||a.id.localeCompare(b.id)).slice(0,31);
  }
  function renderNameCandidates(rows, raw) {
    const box = $('pairingScoutResult');
    if (!box) return;
    nameCandidates = {source:scoutSourceKey(), revision:scoutRevision, rows:rows.slice(0,30)};
    box.className = 'pairing-scout-result is-idle';
    if (!rows.length) {
      box.innerHTML = '<strong>查無姓名資料</strong><span>請確認姓名，或使用 PTCG ID 查詢。</span>';
      setStatus('本場、本輪沒有符合的已知姓名。');
      return;
    }
    box.innerHTML = '<strong>本輪找到多位符合的玩家，請選擇</strong><div class="pairing-scout-name-options">'+
      nameCandidates.rows.map((row,index) => '<button type="button" class="secondary-btn" data-scout-name-index="'+index+'"><strong>'+esc(row.name)+'</strong> <small>'+esc(row.id)+'</small></button>').join('')+
      '</div>'+(rows.length>30?'<span>符合結果過多，請輸入更完整的姓名。</span>':'');
    setStatus('請選擇正確的姓名與 PTCG ID。');
  }
  async function loadSelection(value, mode = queryMode, resolvedId = '') {
    if (queryBusy) return;
    const raw = String(value || '').trim();
    const byName = mode === 'name';
    const byPlayer = mode === 'player' || byName;
    let selected = byName ? normalizeQueryPlayerId(resolvedId) : byPlayer ? normalizeQueryPlayerId(raw) : Number(raw);
    if (mode === 'player' && !/^tw\d+$/.test(selected)) return setStatus('請輸入有效的 PTCG ID，例如 tw39371632。', 'error');
    if (!byPlayer && (!/^\d+$/.test(raw) || !Number.isSafeInteger(selected) || selected < 1)) return setStatus('桌號請輸入 1 以上的整數。', 'error');
    const requestRevision = ++scoutRevision;
    nameCandidates = null;
    currentContext = null;
    const box = $('pairingScoutResult');
    if (box) {
      box.className = 'pairing-scout-result is-idle';
      box.innerHTML = '<strong>正在查詢…</strong>';
    }
    setBusy(true);
    setStatus('正在讀取配對與牌組紀錄…');
    try {
      if (byName && !selected) {
        const rows = await searchScoutNames(raw);
        if (requestRevision !== scoutRevision) return;
        if (rows.length !== 1) { renderNameCandidates(rows,raw); return; }
        selected = rows[0].id;
      }
      const { data, parsed } = await fetchLookup(selected, byPlayer ? 'player' : 'table');
      if (requestRevision !== scoutRevision) return;
      if (String(data.tid) !== parsed.tid || Number(data.round) !== parsed.round) throw new Error('後端配對的賽事或 Round 與查詢條件不一致，請重新查詢。');
      const matchedTable = Number(data.match?.table);
      currentContext = { data, parsed, table: Number.isSafeInteger(matchedTable) && matchedTable > 0 ? matchedTable : (byPlayer ? null : selected), target: byPlayer ? selected : '' };
      const input = $('pairingScoutTable');
      if (input) input.value = byName ? raw : String(selected);
      await renderScoutMatch(data, currentContext.table, currentContext.target);
      if (requestRevision !== scoutRevision) return;
      await refreshStats(parsed.tid);
      if (requestRevision !== scoutRevision) return;
      if (data.match && !$('pairingScoutUnknownToggle')?.checked) {
        setStatus('查詢完成。認得玩家就直接選牌組，不認得就勾「不知道哪位是哪副牌」。', 'success');
      } else if (!data.match) {
        setStatus(data.available ? '這一輪已公布，但找不到指定配對。' : '這一輪尚未公布。');
      }
    } catch (error) {
      if (requestRevision !== scoutRevision) return;
      currentContext = null;
      const box = $('pairingScoutResult');
      if (box) {
        box.className = 'pairing-scout-result is-error';
        box.innerHTML = '<strong>查詢失敗</strong><span>請確認網址、Round 與查詢條件後重試。</span>';
      }
      setStatus(error?.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function navigateTable(offset) {
    if (queryBusy) return;
    const table = queryMode === 'table' ? Number($('pairingScoutTable')?.value) : currentContext?.table;
    if (!Number.isSafeInteger(table) || table < 1) return;
    const next = Math.max(1, table + offset);
    setQueryMode('table', String(next));
    loadSelection(String(next), 'table');
  }

  async function refreshStats(tid) {
    const box = $('pairingScoutStats');
    if (!box || !tid) return;
    const [exactRows, pairRows] = await Promise.all([scoutRows(tid), pairObservationRows(tid)]);
    const counts = new Map();
    const countedPlayers = new Set();
    const blockedPlayers=new Set(exactRows.filter(r=>r.conflict).map(r=>normalizePlayerId(r.player_id)));
    const exactMap = new Map(exactRows.filter(r=>!r.conflict).map(row => [normalizePlayerId(row.player_id), row.deck_name]));
    let ambiguousPairs = 0;
    let conflictingPairs = 0;

    const add = deck => counts.set(deck, (counts.get(deck) || 0) + 1);
    for (const row of exactRows) {
      const id = normalizePlayerId(row.player_id);
      if (!id || row.conflict || countedPlayers.has(id)) continue;
      countedPlayers.add(id);
      add(row.deck_name);
    }

    for (const row of pairRows) {
      if (row.conflict || blockedPlayers.has(normalizePlayerId(row.player_a_id)) || blockedPlayers.has(normalizePlayerId(row.player_b_id)) || !pairDeckConsistent(row, exactMap)) { conflictingPairs++; continue; }
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
      box.innerHTML = '<div class="pairing-scout-stats-empty">'+(blockedPlayers.size||conflictingPairs?'牌組紀錄有衝突，暫無可確認統計。':'這場比賽還沒有牌組紀錄。')+'</div>';
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
    const notes = [];
    if(blockedPlayers.size)notes.push(blockedPlayers.size+' 位玩家牌組衝突，暫不計入');
    if (ambiguousPairs) notes.push(`含 ${ambiguousPairs} 桌未辨識`);
    if (conflictingPairs) notes.push(`${conflictingPairs} 桌牌組紀錄有衝突，已排除推估`);
    const note = notes.length ? `（${notes.join('；')}）` : '';
    box.innerHTML = `
      <div class="pairing-scout-stats-head"><strong>牌組分布</strong><span>已記錄 ${total} 位玩家${note}</span></div>
      <div class="pairing-scout-chart-wrap">
        <div class="pairing-scout-donut" style="background:conic-gradient(${segments.join(',')})"><span>${total}<small>人</small></span></div>
        <div class="pairing-scout-legend">${legend}</div>
      </div>`;
  }

  async function decorateMainPairing(detail) {
    lastMainDetail=detail;
    const data = detail?.data;
    const opponentId = normalizePlayerId(detail?.opponentId);
    const tid = String(data?.tid || '');
    if (!opponentId || !tid) return;

    const knowledge = await deckKnowledge(tid, opponentId).catch(() => ({ confirmed: '', possible: [] }));
    const article = document.querySelector('#pairingResult .pairing-match-grid article:nth-child(3)');
    if (!article) return;
    article.querySelector('.pairing-scout-known')?.remove();

    const badge = document.createElement('div');
    if(knowledge.conflict){badge.className='pairing-scout-known possible';badge.textContent='牌組衝突：'+knowledge.possible.join(' / ');}
    else if (knowledge.confirmed) {
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
    const section = $('pairingDeckScout');
    if (!section) return;
    if (section.dataset.scoutBound === '1') return;
    section.dataset.scoutBound = '1';
    document.querySelectorAll('[data-pairing-scout-mode]').forEach(button => {
      button.addEventListener('click', () => setQueryMode(button.dataset.pairingScoutMode));
    });
    $('pairingScoutLoad')?.addEventListener('click', () => loadSelection($('pairingScoutTable')?.value));
    $('pairingScoutResult')?.addEventListener('click', event => {
      const button = event.target.closest?.('[data-scout-name-index]');
      if (!button || queryBusy || queryMode !== 'name' || !nameCandidates ||
          nameCandidates.revision !== scoutRevision || nameCandidates.source !== scoutSourceKey()) return;
      const row = nameCandidates.rows[Number(button.dataset.scoutNameIndex)];
      if (row) void loadSelection(row.name,'name',row.id);
    });
    $('pairingScoutPrev')?.addEventListener('click', () => navigateTable(-1));
    $('pairingScoutNext')?.addEventListener('click', () => navigateTable(1));
    [sourceInput(), roundInput()].filter(Boolean).forEach(input => {
      input.addEventListener('input', invalidateScoutContext);
      input.addEventListener('change', invalidateScoutContext);
    });
    $('pairingScoutTable')?.addEventListener('input', () => {
      if (nameCandidates) invalidateScoutContext();
      setBusy(queryBusy);
    });
    $('pairingScoutTable')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      loadSelection($('pairingScoutTable')?.value);
    });
    setBusy(false);
  }

  async function syncSharedScouting(){
    if(!pairingAuthorized||!currentUserId()||saving||queryBusy)return;
    await loadCatalog();
    const context=currentContext;
    if(context&&isCurrentScout(context.data)){
      await renderScoutMatch(context.data,context.table,context.target);
      await refreshStats(context.data.tid);
      document.dispatchEvent(new CustomEvent('pairing:scout-rendered',{detail:context.data}));
    }
    if(lastMainDetail)await decorateMainPairing(lastMainDetail);
  }
  function scheduleSharedSync(){
    clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>{if(saving||queryBusy||document.activeElement?.closest?.('#pairingScoutResult select')){scheduleSharedSync();return;}void syncSharedScouting().catch(error=>console.warn('共用牌組同步失敗',error));},300);
  }
  function bindSharedRealtime(){
    const uid=pairingAuthorized?currentUserId():'';
    if(uid===realtimeUser)return;
    if(realtimeChannel){void pairingClient?.removeChannel(realtimeChannel);realtimeChannel=null;}
    realtimeUser=uid;
    if(!uid||!pairingClient?.channel)return;
    let channel=pairingClient.channel('ptcg-shared-scout-'+uid);
    for(const table of ['pairing_deck_scouts','pairing_deck_pair_observations','pairing_scout_resolutions','pairing_pair_resolutions','pairing_deck_catalog'])
      channel=channel.on('postgres_changes',{event:'*',schema:'public',table},scheduleSharedSync);
    realtimeChannel=channel.subscribe(status=>{if(status==='SUBSCRIBED')scheduleSharedSync();});
  }
  async function onAuthorized() {
    bindSharedRealtime();
    if (!pairingAuthorized || !pairingSession?.user?.id) {initializedForUser='';lastMainDetail=null;invalidateScoutContext();return;}
    if (initializedForUser === pairingSession.user.id) return;
    initializedForUser = pairingSession.user.id;
    try { await loadCatalog(); }
    catch (error) { setStatus(`牌組清單讀取失敗：${error?.message || error}`, 'error'); }
  }

  document.addEventListener('pairing:auth-ready', onAuthorized);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pairingAuthorized)scheduleSharedSync();});
  document.addEventListener('deck-catalog-updated', async () => {
    if (!pairingAuthorized || !pairingSession?.user?.id) return;
    try {
      await loadCatalog();
      if (currentContext) await renderScoutMatch(currentContext.data, currentContext.table, currentContext.target);
    } catch (error) {
      setStatus(`牌組清單讀取失敗：${error?.message || error}`, 'error');
    }
  });
  document.addEventListener('pairing:match-rendered', event => decorateMainPairing(event.detail));
  document.addEventListener('pairing:tracking-started', () => {
    if (currentContext && !isCurrentScout(currentContext.data)) invalidateScoutContext();
  });
  document.addEventListener('DOMContentLoaded', () => {
    inject();
    setTimeout(onAuthorized, 500);
  }, { once: true });
})();
