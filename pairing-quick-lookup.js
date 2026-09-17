(() => {
  const TABLE_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-pairing-table';
  let quickMode = 'table';

  const quickInput = () => document.getElementById('pairingQuickValue');
  const quickResult = () => document.getElementById('pairingQuickResult');
  const quickMessage = () => document.getElementById('pairingQuickMessage');
  const quickButton = () => document.getElementById('pairingQuickLookupButton');

  function setQuickMessage(text = '', type = '') {
    const el = quickMessage();
    if (!el) return;
    el.textContent = text;
    el.className = `pairing-quick-message${type ? ` ${type}` : ''}`;
  }

  function setQuickBusy(busy) {
    if (quickButton()) quickButton().disabled = busy;
    document.querySelectorAll('[data-pairing-quick-mode]').forEach(button => { button.disabled = busy; });
  }

  function normalizeQuickPlayerId(value) {
    let id = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (/^\d{6,}$/.test(id)) id = `tw${id}`;
    return id;
  }

  function idsFromMatchedRows(data, requestedId) {
    for (const row of data?.matched_rows || []) {
      const ids = [...new Set((row?.cells || []).flatMap(cell => String(cell).match(/tw\d+/gi) || []).map(id => id.toLowerCase()))];
      if (ids.length < 2 || !ids.includes(requestedId)) continue;
      const opponent = ids.find(id => id !== requestedId) || '';
      if (!opponent) continue;
      return {
        row_index: row.index,
        table: String(row.cells?.[0] || ''),
        number: String(row.cells?.[1] || ''),
        player: requestedId,
        opponent,
        format: 'matched-row'
      };
    }
    return null;
  }

  async function requestQuickLookup(parsed, value) {
    if (!pairingAuthorized || !pairingSession?.access_token) throw new Error('請先登入授權帳號再使用臨時查詢');

    if (quickMode === 'table') {
      const response = await fetch(TABLE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pairingSession.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: parsed.url, table: value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || '桌號配對讀取失敗');
      return data;
    }

    const playerId = normalizeQuickPlayerId(value);
    if (!/^tw\d+$/i.test(playerId)) throw new Error('請輸入有效的 PTCG ID，例如 tw39371632');
    const response = await fetch(PAIRING_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pairingSession.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: parsed.url, player: playerId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || '玩家配對讀取失敗');
    if (!data.match) data.match = idsFromMatchedRows(data, playerId);
    return data;
  }

  async function renderQuickResult(data, requestedValue) {
    const box = quickResult();
    if (!box) return;

    if (!data?.available) {
      box.className = 'pairing-quick-result is-waiting';
      box.innerHTML = `<strong>Round ${escPairing(data?.round || '—')} 尚未公布</strong><span>目前還沒有可查詢的配對表。</span>`;
      return;
    }

    const match = data?.match;
    if (!match) {
      box.className = 'pairing-quick-result is-error';
      const target = quickMode === 'table' ? `第 ${requestedValue} 桌` : normalizeQuickPlayerId(requestedValue);
      box.innerHTML = `<strong>找不到配對</strong><span>Round ${escPairing(data?.round || '—')} 找不到 ${escPairing(target)}。</span>`;
      return;
    }

    const playerId = normalizeQuickPlayerId(match.player);
    const opponentId = normalizeQuickPlayerId(match.opponent);
    const names = await lookupRealNames([playerId, opponentId]);
    const playerName = names[playerId] || match.player_name || '';
    const opponentName = names[opponentId] || match.opponent_name || '';
    const firstLabel = quickMode === 'table' ? '玩家 1' : '查詢玩家';
    const secondLabel = quickMode === 'table' ? '玩家 2' : '對手';

    box.className = 'pairing-quick-result is-found';
    box.innerHTML = `
      <div class="pairing-quick-result-head">
        <strong>第 ${escPairing(match.table || requestedValue || '—')} 桌</strong>
        <span class="pairing-round-badge">Round ${escPairing(data.round || '—')}</span>
      </div>
      <div class="pairing-quick-versus">
        <article>
          <span>${firstLabel}</span>
          <strong>${escPairing(playerName || playerId)}</strong>
          <small>${playerName ? escPairing(playerId) : '姓名資料未收錄'}</small>
        </article>
        <b>VS</b>
        <article>
          <span>${secondLabel}</span>
          <strong>${escPairing(opponentName || opponentId)}</strong>
          <small>${opponentName ? escPairing(opponentId) : '姓名資料未收錄'}</small>
        </article>
      </div>`;
  }

  async function handleQuickLookup() {
    const raw = String(quickInput()?.value || '').trim();
    if (!raw) {
      setQuickMessage(quickMode === 'table' ? '請輸入桌號。' : '請輸入 PTCG ID。', 'error');
      return;
    }
    if (quickMode === 'table' && (!/^\d+$/.test(raw) || Number(raw) < 1)) {
      setQuickMessage('請輸入有效桌號，例如 1。', 'error');
      return;
    }

    setQuickBusy(true);
    setQuickMessage('正在讀取這一輪配對…');
    try {
      const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
      if (sourceInput()) sourceInput().value = parsed.url;
      if (roundInput()) roundInput().value = String(parsed.round);
      const data = await requestQuickLookup(parsed, raw);
      await renderQuickResult(data, raw);
      setQuickMessage(data.match ? '查詢完成。這次查詢不會改變自動監控與通知對象。' : (data.available ? '這一輪已公布，但找不到指定配對。' : '這一輪尚未公布。'), data.match ? 'success' : '');
    } catch (error) {
      setQuickMessage(error?.message || String(error), 'error');
    } finally {
      setQuickBusy(false);
    }
  }

  function setQuickMode(mode) {
    quickMode = mode === 'player' ? 'player' : 'table';
    document.querySelectorAll('[data-pairing-quick-mode]').forEach(button => {
      const active = button.dataset.pairingQuickMode === quickMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const input = quickInput();
    if (input) {
      input.value = '';
      input.inputMode = quickMode === 'table' ? 'numeric' : 'text';
      input.placeholder = quickMode === 'table' ? '例如 1' : '例如 tw39371632';
      input.setAttribute('aria-label', quickMode === 'table' ? '桌號' : 'PTCG ID');
    }
    const box = quickResult();
    if (box) {
      box.className = 'pairing-quick-result is-idle';
      box.innerHTML = `<strong>${quickMode === 'table' ? '輸入桌號即可看這桌是誰對誰' : '輸入 PTCG ID 即可找這位玩家的桌號與對手'}</strong><span>只做單次查詢，不會變更上方的自動監控玩家。</span>`;
    }
    setQuickMessage('');
  }

  function injectQuickLookup() {
    if (document.getElementById('pairingQuickLookup') || !document.querySelector('.pairing-panel')) return;
    const result = document.getElementById('pairingResult');
    const message = document.getElementById('pairingMessage');
    if (!result) return;
    const section = document.createElement('section');
    section.id = 'pairingQuickLookup';
    section.className = 'pairing-quick-card';
    section.innerHTML = `
      <div class="pairing-quick-head">
        <div><strong>臨時查詢</strong><small>不影響家人的自動監控與通知</small></div>
        <div class="pairing-quick-tabs" role="group" aria-label="臨時查詢方式">
          <button type="button" data-pairing-quick-mode="table" class="active" aria-pressed="true">桌號</button>
          <button type="button" data-pairing-quick-mode="player" aria-pressed="false">PTCG ID</button>
        </div>
      </div>
      <div class="pairing-quick-form">
        <input id="pairingQuickValue" class="search-input" type="text" inputmode="numeric" placeholder="例如 1" autocomplete="off" autocapitalize="none" aria-label="桌號" />
        <button id="pairingQuickLookupButton" class="secondary-btn" type="button">查詢</button>
      </div>
      <div id="pairingQuickResult" class="pairing-quick-result is-idle"><strong>輸入桌號即可看這桌是誰對誰</strong><span>只做單次查詢，不會變更上方的自動監控玩家。</span></div>
      <div id="pairingQuickMessage" class="pairing-quick-message"></div>`;
    (message || result).after(section);

    section.querySelectorAll('[data-pairing-quick-mode]').forEach(button => button.addEventListener('click', () => setQuickMode(button.dataset.pairingQuickMode)));
    quickButton()?.addEventListener('click', handleQuickLookup);
    quickInput()?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      handleQuickLookup();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectQuickLookup, { once: true });
  else injectQuickLookup();
})();
