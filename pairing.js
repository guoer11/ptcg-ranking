const PAIRING_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const PAIRING_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
const PAIRING_FUNCTION_URL = `${PAIRING_SUPABASE_URL}/functions/v1/ptcg-pairing`;
const PAIRING_WATCH_URL = `${PAIRING_SUPABASE_URL}/functions/v1/ptcg-pairing-watch`;
const DEFAULT_PLAYER_ID = 'tw39371632';
const TEST_TOURNAMENT_URL = 'https://tcg.sfc-jpn.jp/tour.asp?tid=3000442';
const TEST_TID = '3000442';

let pairingClient = null;
let pairingSession = null;
let pairingAuthorized = false;
let lastPairing = null;
let activePairingWatch = null;
let pairingFormOwner = null;
let pairingFormEdited = false;
const PAIRING_WATCH_FORM_KEY = 'ptcg-pairing-watch-form-v1:';

const sourceInput = () => document.getElementById('pairingSourceUrl');
const playerInput = () => document.getElementById('pairingPlayerId');
const roundInput = () => document.getElementById('pairingRound');
const resultBox = () => document.getElementById('pairingResult');
const messageBox = () => document.getElementById('pairingMessage');
const watchStatus = () => document.getElementById('pairingWatchStatus');
const watchCopy = () => document.getElementById('pairingWatchCopy');
const authCopy = () => document.getElementById('pairingAuthCopy');
const lookupButton = () => document.getElementById('pairingLookupButton');
const testButton = () => document.getElementById('pairingTestButton');
const finalTestButton = () => document.getElementById('pairingFinalTestButton');
const startButton = () => document.getElementById('pairingStartButton');
const stopButton = () => document.getElementById('pairingStopButton');
const stopActions = () => document.getElementById('pairingStopActions');

function protectedPairingMain() {
  return document.getElementById('pairingProtectedMain');
}

function pairingNavLink() {
  return document.querySelector('.site-nav a[href="pairing.html"]');
}

function ensurePairingAccessGate() {
  let main = protectedPairingMain();
  if (!main) {
    main = document.querySelector('main.pairing-main');
    if (main) main.id = 'pairingProtectedMain';
  }
  if (main) main.hidden = true;
  const nav = pairingNavLink();
  if (nav) nav.hidden = true;

  let denied = document.getElementById('pairingAccessDenied');
  if (!denied) {
    denied = document.createElement('main');
    denied.id = 'pairingAccessDenied';
    denied.className = 'wrap pairing-main';
    denied.innerHTML = `
      <section class="panel pairing-panel">
        <h2>即時配對僅限授權帳號</h2>
        <p id="pairingAccessDeniedText" class="section-note">正在確認登入權限…</p>
        <a class="primary-btn" href="index.html">回玩家排行登入</a>
      </section>`;
    const footer = document.querySelector('footer.footer');
    if (footer) footer.before(denied);
    else document.body.appendChild(denied);
  }
  return denied;
}

function renderPairingAccess(allowed, message = '') {
  pairingAuthorized = Boolean(allowed);
  const main = protectedPairingMain();
  const nav = pairingNavLink();
  const denied = ensurePairingAccessGate();
  const deniedText = document.getElementById('pairingAccessDeniedText');

  if (main) main.hidden = !pairingAuthorized;
  if (nav) nav.hidden = !pairingAuthorized;
  if (denied) denied.hidden = pairingAuthorized;
  if (!pairingAuthorized && deniedText) {
    deniedText.textContent = message || '此功能僅開放指定的授權帳號使用。請先回玩家排行登入。';
  }
}

ensurePairingAccessGate();

function escPairing(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setPairingMessage(text, type = '') {
  const el = messageBox();
  if (!el) return;
  el.textContent = text || '';
  el.className = `pairing-message${type ? ` ${type}` : ''}`;
}

function setPairingBusy(busy) {
  [lookupButton(), testButton(), finalTestButton(), startButton(), stopButton(), document.getElementById('pairingLoadTestButton'),document.getElementById('pairingAddPlayer'),...extraPlayerInputs(),...(extraPlayersRoot()?.querySelectorAll('button')||[])]
    .filter(Boolean)
    .forEach(button => { button.disabled = busy; });
}

function normalizePlayerId(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeRoundUrl(raw, roundOverride = null) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('請貼上有效的 TCG マイスター網址');
  }

  if (url.hostname !== 'tcg.sfc-jpn.jp') throw new Error('只接受 tcg.sfc-jpn.jp 的比賽網址');
  const tid = url.searchParams.get('tid') || '';
  if (!/^\d+$/.test(tid)) throw new Error('網址找不到有效 tid');

  const requestedRound = Number(roundOverride ?? url.searchParams.get('kno') ?? 1);
  if (!Number.isInteger(requestedRound) || requestedRound < 1) throw new Error('Round 必須是 1 以上的整數');

  if (/\/tour\.asp$/i.test(url.pathname)) url.pathname = url.pathname.replace(/tour\.asp$/i, 'tourround.asp');
  if (!/\/tourround\.asp$/i.test(url.pathname)) throw new Error('請貼活動頁 tour.asp 或配對頁 tourround.asp');

  url.protocol = 'https:';
  url.searchParams.set('tid', tid);
  url.searchParams.set('kno', String(requestedRound));
  url.searchParams.set('znt', url.searchParams.get('znt') || '0');
  return { url: url.toString(), tid, round: requestedRound };
}


// Restore only a watch confirmed active by the backend for the signed-in account.
function pairingWatchFormKey() {
  const userId = pairingSession?.user?.id;
  return userId ? PAIRING_WATCH_FORM_KEY + userId : '';
}

function clearSavedPairingWatchForm() {
  const key = pairingWatchFormKey();
  if (!key) return;
  try { localStorage.removeItem(key); }
  catch (_) { /* Backend restoration still works when browser storage is unavailable. */ }
}

function savePairingWatchForm() {
  const userId = pairingSession?.user?.id;
  if (!pairingAuthorized || !activePairingWatch?.active || activePairingWatch.user_id !== userId) return;
  try {
    const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
    const playerId = normalizePlayerId(playerInput()?.value);
    if (parsed.tid !== String(activePairingWatch.tid) || playerId !== activePairingWatch.player_id) return;
    localStorage.setItem(pairingWatchFormKey(), JSON.stringify({
      watch_id: activePairingWatch.id,
      tid: parsed.tid,
      player_id: playerId,
      url: parsed.url,
      round: parsed.round
    }));
  } catch (_) { /* Ignore incomplete edits and unavailable browser storage. */ }
}

function syncPairingWatchForm(watch) {
  const userId = pairingSession?.user?.id;
  if (!pairingAuthorized || !userId) return;
  if (watch && watch.user_id !== userId) return;

  if (pairingFormOwner && pairingFormOwner !== userId) {
    if (sourceInput()) sourceInput().value = '';
    if (playerInput()) playerInput().value = DEFAULT_PLAYER_ID;
    restoreExtraPlayers();clearMultiResults();
    if (roundInput()) roundInput().value = '1';
    pairingFormEdited = false;
  }
  pairingFormOwner = userId;
  activePairingWatch = watch || null;

  if (!watch?.active) {
    // Keep this page's fields usable for a final lookup, but do not restore them next time.
    clearSavedPairingWatchForm();
    return;
  }
  if (pairingFormEdited) return;

  try {
    let parsed = normalizeRoundUrl(watch.source_url);
    try {
      const saved = JSON.parse(localStorage.getItem(pairingWatchFormKey()) || 'null');
      if (saved?.watch_id === watch.id && saved?.tid === String(watch.tid) && saved?.player_id === watch.player_id) {
        const savedUrl = normalizeRoundUrl(saved.url, saved.round);
        if (savedUrl.tid === String(watch.tid)) parsed = savedUrl;
      }
    } catch (_) { /* Fall back to the active watch's backend URL. */ }

    if (sourceInput()) sourceInput().value = parsed.url;
    if (playerInput()) playerInput().value = watch.player_id;
    restoreExtraPlayers(watch.player_ids||[watch.player_id]);
    if (roundInput()) roundInput().value = String(parsed.round);
    savePairingWatchForm();
  } catch (error) {
    console.warn('監控網址還原失敗', error);
  }
}

async function fetchPairing(url, playerId) {
  if (!pairingAuthorized || !pairingSession?.access_token) {
    throw new Error('即時配對僅限授權帳號使用');
  }
  const response = await fetch(PAIRING_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pairingSession.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, player: playerId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '配對資料讀取失敗');
  return data;
}

async function lookupRealNames(ids) {
  const map = {};
  if (!pairingClient || !pairingSession || !pairingAuthorized) return map;
  const normalized = [...new Set((ids || []).map(normalizePlayerId).filter(Boolean))];
  if (!normalized.length) return map;
  try {
    const { data, error } = await pairingClient
      .from('player_identities')
      .select('player_id,real_name')
      .in('player_id', normalized);
    if (error) throw error;
    for (const row of data || []) map[normalizePlayerId(row.player_id)] = row.real_name || '';
  } catch (error) {
    console.warn('姓名資料讀取失敗', error);
  }
  return map;
}

async function renderPairing(data) {
  const box = resultBox();
  if (!box) return;
  box.hidden=false;clearMultiResults();
  lastPairing = data;

  if (!data?.available) {
    box.className = 'pairing-result is-waiting';
    box.innerHTML = `
      <div class="pairing-result-title">
        <strong>Round ${escPairing(data?.round || '—')} 尚未公布</strong>
        <span class="pairing-round-badge">等待配對</span>
      </div>
      <div class="pairing-watch-copy">系統已成功連上 TCG マイスター，但這一輪目前還沒有可用的配對表。</div>`;
    return;
  }

  if (!data?.match) {
    box.className = 'pairing-result is-error';
    box.innerHTML = `
      <div class="pairing-result-title">
        <strong>找不到這位玩家</strong>
        <span class="pairing-round-badge">Round ${escPairing(data?.round || '—')}</span>
      </div>
      <div class="pairing-watch-copy">這一輪配對表已經公布，但沒有找到 ${escPairing(normalizePlayerId(playerInput()?.value))}。請確認 PTCG ID 是否正確。</div>`;
    return;
  }

  const match = data.match;
  const names = await lookupRealNames([match.player, match.opponent]);
  const playerId = normalizePlayerId(match.player);
  const opponentId = normalizePlayerId(match.opponent);
  const playerName = names[playerId] || match.player_name || '';
  const opponentName = names[opponentId] || match.opponent_name || '';

  box.className = 'pairing-result is-found';
  box.innerHTML = `
    <div class="pairing-result-title">
      <strong>找到配對</strong>
      <span class="pairing-round-badge">Round ${escPairing(data.round)}</span>
    </div>
    <div class="pairing-match-grid">
      <article>
        <span>桌號</span>
        <strong>${escPairing(match.table || '—')}</strong>
        <small>No. ${escPairing(match.number || '—')}</small>
      </article>
      <article>
        <span>你的玩家</span>
        <strong>${escPairing(playerName || playerId)}</strong>
        ${playerName ? `<small>${escPairing(playerId)}</small>` : '<small>姓名資料未收錄</small>'}
      </article>
      <article>
        <span>對手</span>
        <strong>${escPairing(opponentName || opponentId)}</strong>
        ${opponentName ? `<small>${escPairing(opponentId)}</small>` : '<small>姓名資料未收錄</small>'}
      </article>
      <article>
        <span>來源</span>
        <strong>TCG マイスター</strong>
        <small>${escPairing(data.title || '')}</small>
      </article>
    </div>`;
  document.dispatchEvent(new CustomEvent('pairing:match-rendered', {
    detail: { data, playerId, opponentId }
  }));
}

async function renderFinalRank(ranking, notification = null) {
  const box = resultBox();
  if (!box) return;
  box.hidden=false;clearMultiResults();
  const standing = ranking?.standing_match;
  const isInterim = Boolean(ranking?.is_interim);
  const rankTitle = isInterim ? `Round ${ranking.round || '—'} 暫定排名` : '最終排名';
  if (!standing) {
    box.className = 'pairing-result is-waiting';
    box.innerHTML = `
      <div class="pairing-result-title">
        <strong>${isInterim ? '暫定排名已公布，但找不到這位玩家' : '最終排名尚未公布'}</strong>
        <span class="pairing-round-badge">${isInterim ? 'Interim' : 'Final rank'}</span>
      </div>
      <div class="pairing-watch-copy">${isInterim ? '目前尚未查到指定玩家的暫定名次，請稍後更新。' : '目前還找不到這位玩家的最終排名。'}</div>`;
    return;
  }

  const playerId = normalizePlayerId(standing.player);
  const names = await lookupRealNames([playerId]);
  const playerName = notification?.player_name || names[playerId] || '';
  box.className = 'pairing-result is-found';
  box.innerHTML = `
    <div class="pairing-result-title">
      <strong>${escPairing(rankTitle)}</strong>
      <span class="pairing-round-badge">${isInterim ? 'Interim' : 'Final rank'}</span>
    </div>
    <div class="pairing-match-grid">
      <article>
        <span>你的玩家</span>
        <strong>${escPairing(playerName || playerId)}</strong>
        ${playerName ? `<small>${escPairing(playerId)}</small>` : ''}
      </article>
      <article>
        <span>${isInterim ? `第 ${ranking.round || '—'} 輪後暫定名次` : '最終排名'}</span>
        <strong>第 ${escPairing(standing.rank)} 名</strong>
        <small>${isInterim ? '暫定名次，尚非官方最終排名' : '不顯示總分'}</small>
      </article>
    </div>`;
}

async function lookupCurrentPairing() {
  const playerId = normalizePlayerId(playerInput()?.value);
  if (!/^tw\d+$/i.test(playerId)) throw new Error('請輸入有效的 PTCG ID，例如 tw39371632');
  const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
  if (sourceInput()) sourceInput().value = parsed.url;
  if (roundInput()) roundInput().value = String(parsed.round);
  savePairingWatchForm();
  const data = await fetchPairing(parsed.url, playerId);
  await renderPairing(data);
  return { data, parsed, playerId };
}

async function currentWatchInputs() {
  const playerId = normalizePlayerId(playerInput()?.value);
  if (!/^tw\d+$/i.test(playerId)) throw new Error('請輸入有效的 PTCG ID，例如 tw39371632');
  const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
  return { parsed, playerId };
}

async function authorizedWatchRequest(action, extra = {}) {
  if (!pairingAuthorized || !pairingSession?.access_token) throw new Error('即時配對僅限授權帳號使用');
  const response = await fetch(PAIRING_WATCH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pairingSession.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '配對通知服務回應失敗');
  return data;
}

function renderWatchStatus(watch) {
  const status = watchStatus();
  const copy = watchCopy();
  if (!status || !copy) return;

  const primary = lookupButton();
  const stopRow = stopActions();
  if(Array.isArray(watch?.player_ids)&&watch.player_ids.length>1){
    const finals=watch.multi_state?.finals||{};
    if(primary)primary.textContent=watch.active?'更新追蹤':'開始新的追蹤';
    if(stopRow)stopRow.hidden=!watch.active;
    status.classList.toggle('active',Boolean(watch.active));
    status.textContent=watch.active?'多人追蹤中':watch.final_notified?'已完成':'已停止';
    copy.innerHTML='活動 <strong>'+escPairing(watch.tid)+'</strong> · '+watch.player_ids.length+' 位玩家'+(watch.active?' · 等待 Round '+escPairing(watch.next_round):'')+'<div class="pairing-multi-status">'+watch.player_ids.map(id=>'<div><b>'+escPairing(id)+'</b>：'+(finals[id]?'最終第 '+escPairing(finals[id].rank)+' 名':watch.active?'追蹤中':'未追蹤')+'</div>').join('')+'</div>';
    return;
  }

  if (!watch?.active) {
    if (primary) primary.textContent = watch?.final_notified ? '開始新的追蹤' : '開始追蹤';
    if (stopRow) stopRow.hidden = true;
    status.classList.remove('active');
    if (watch?.final_notified && watch?.final_result?.rank) {
      status.innerHTML = '<span class="pairing-watch-dot"></span>已完成';
      copy.innerHTML = `最終排名已公布：<strong>第 ${escPairing(watch.final_result.rank)} 名</strong>。這場追蹤已自動停止，牌組偵察資料仍會保留。`;
      return;
    }
    status.innerHTML = '<span class="pairing-watch-dot"></span>未追蹤';
    copy.innerHTML = '按上方「開始追蹤」後，系統會先查詢目前 Round，再自動監控後續配對與最終排名。';
    return;
  }

  if (primary) primary.textContent = '更新追蹤';
  if (stopRow) stopRow.hidden = false;
  status.classList.add('active');
  status.innerHTML = '<span class="pairing-watch-dot"></span>追蹤中';
  const checked = watch.last_checked_at ? new Date(watch.last_checked_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未檢查';
  copy.innerHTML = `活動 <strong>${escPairing(watch.tid)}</strong> · 玩家 <strong>${escPairing(watch.player_id)}</strong><br>正在等待 <strong>Round ${escPairing(watch.next_round)}</strong> 或最終排名，每 10 秒由後端檢查。最後檢查：${escPairing(checked)}`;
}

async function refreshWatchStatus({ reopened = false } = {}) {
  if (!pairingAuthorized || !pairingSession) {
    renderWatchStatus(null);
    return;
  }
  const userId = pairingSession.user.id;
  try {
    const data = await authorizedWatchRequest('status');
    if (!pairingAuthorized || pairingSession?.user?.id !== userId) return;
    if (reopened && !data.watch?.active) {
      if (sourceInput()) sourceInput().value = '';
      if (playerInput()) playerInput().value = DEFAULT_PLAYER_ID;
      restoreExtraPlayers();clearMultiResults();
      if (roundInput()) roundInput().value = '1';
      pairingFormEdited = false;
    }
    syncPairingWatchForm(data.watch);
    renderWatchStatus(data.watch);
  } catch (error) {
    console.warn('監控狀態讀取失敗', error);
    renderWatchStatus(null);
  }
}

async function handleLookup() {
  setPairingBusy(true);
  setPairingMessage('正在讀取配對…');
  try {
    const { data } = await lookupCurrentPairing();
    setPairingMessage(data.match ? '配對讀取成功。' : (data.available ? '這一輪已公布，但找不到指定玩家。' : '這一輪尚未公布。'), data.match ? 'success' : '');
  } catch (error) {
    setPairingMessage(error?.message || String(error), 'error');
  } finally {
    setPairingBusy(false);
  }
}

async function handleTestNotification() {
  if(hasExtraTrackingPlayers())return handleMultiNotificationTest(false);
  setPairingBusy(true);
  setPairingMessage('正在用這一輪的真實配對發送 LINE / 網站推播測試…');
  try {
    const { parsed, playerId } = await lookupCurrentPairing();
    const data = await authorizedWatchRequest('test', { url: parsed.url, player_id: playerId });
    const lineSent = Boolean(data?.notification?.line?.sent);
    const pushSent = Number(data?.notification?.push?.sent || 0);
    const parts = [lineSent ? 'LINE 已送出' : 'LINE 未送出', pushSent > 0 ? `網站推播已送出 ${pushSent} 支裝置` : '目前沒有可用的網站推播訂閱'];
    setPairingMessage(`測試完成：${parts.join('；')}。`, lineSent || pushSent > 0 ? 'success' : 'error');
  } catch (error) {
    setPairingMessage(`測試通知失敗：${error?.message || String(error)}`, 'error');
  } finally {
    setPairingBusy(false);
  }
}

async function handleFinalTestNotification() {
  if(hasExtraTrackingPlayers())return handleMultiNotificationTest(true);
  setPairingBusy(true);
  setPairingMessage('正在讀取歷史最終排名並發送 LINE / 網站推播測試…');
  try {
    const { parsed, playerId } = await currentWatchInputs();
    const data = await authorizedWatchRequest('test-final', { url: parsed.url, player_id: playerId });
    await renderFinalRank(data.ranking, data.notification);
    const lineSent = Boolean(data?.notification?.line?.sent);
    const pushSent = Number(data?.notification?.push?.sent || 0);
    const rank = data?.ranking?.standing_match?.rank;
    const parts = [lineSent ? 'LINE 已送出' : 'LINE 未送出', pushSent > 0 ? `網站推播已送出 ${pushSent} 支裝置` : '目前沒有可用的網站推播訂閱'];
    setPairingMessage(`最終排名測試完成：第 ${rank} 名；${parts.join('；')}。`, lineSent || pushSent > 0 ? 'success' : 'error');
  } catch (error) {
    setPairingMessage(`最終排名測試失敗：${error?.message || String(error)}`, 'error');
  } finally {
    setPairingBusy(false);
  }
}

async function handleStartWatch() {
  if(hasExtraTrackingPlayers())return handleMultiWatch();
  setPairingBusy(true);
  setPairingMessage('正在查詢目前 Round 並啟動追蹤…');
  try {
    const { data: pairingData, parsed, playerId } = await lookupCurrentPairing();
    if (parsed.tid === TEST_TID) throw new Error('這是歷史測試場，為避免 Round 2、3、4…連續洗版，請使用進階 / 測試工具，不要啟動連續追蹤。');
    const data = await authorizedWatchRequest('start', { url: parsed.url, player_id: playerId, player_ids:[playerId] });
    clearSavedPairingWatchForm();
    pairingFormEdited = false;
    syncPairingWatchForm(data.watch);
    renderWatchStatus(data.watch);
    document.dispatchEvent(new CustomEvent('pairing:tracking-started', {
      detail: { watch: data.watch, parsed, playerId, pairing: pairingData }
    }));

    const currentRoundText = pairingData?.match
      ? `Round ${parsed.round} 配對已找到`
      : (pairingData?.available ? `Round ${parsed.round} 配對表已公布` : `Round ${parsed.round} 尚未公布，已開始等待`);
    setPairingMessage(`${currentRoundText}；系統會自動追蹤後續配對與最終排名。牌組偵察已套用同一場賽事與 Round，可直接使用。`, 'success');
  } catch (error) {
    setPairingMessage(error?.message || String(error), 'error');
  } finally {
    setPairingBusy(false);
  }
}

async function handleStopWatch() {
  setPairingBusy(true);
  try {
    const data = await authorizedWatchRequest('stop');
    syncPairingWatchForm(data.watch);
    renderWatchStatus(data.watch);
    document.dispatchEvent(new CustomEvent('pairing:tracking-stopped', { detail: { watch: data.watch } }));
    setPairingMessage('已停止自動追蹤與通知；牌組偵察仍可繼續使用目前賽事與 Round。', 'success');
  } catch (error) {
    setPairingMessage(error?.message || String(error), 'error');
  } finally {
    setPairingBusy(false);
  }
}

function loadHistoricalTest() {
  pairingFormEdited = true;
  if (sourceInput()) sourceInput().value = TEST_TOURNAMENT_URL;
  if (playerInput()) playerInput().value = DEFAULT_PLAYER_ID;
  if (roundInput()) roundInput().value = '1';
  setPairingMessage('已載入 2026/9/12 高級球孩童組歷史測試場。可測 Round 配對通知或最終排名通知。');
}

async function verifyPairingAuthorization() {
  if (!pairingSession || !pairingClient) return false;
  try {
    const { data, error } = await pairingClient.rpc('can_use_pairing');
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn('即時配對權限確認失敗', error);
    return false;
  }
}

async function refreshPairingAuthorization() {
  const allowed = await verifyPairingAuthorization();
  renderPairingAccess(allowed, pairingSession
    ? '目前登入的帳號沒有即時配對使用權限。此功能只開放指定的授權帳號。'
    : '請先回玩家排行登入你的授權 Google 帳號，再使用即時配對。');

  if (!allowed) {
    restoreExtraPlayers();clearMultiResults();
    if (authCopy()) authCopy().textContent = '目前帳號未授權使用即時配對。';
    document.dispatchEvent(new CustomEvent('pairing:auth-ready', { detail: { allowed: false } }));
    return;
  }

  if (authCopy()) authCopy().textContent = '已確認授權登入，可使用姓名對照、LINE 與網站推播。';
  await refreshWatchStatus();
  document.dispatchEvent(new CustomEvent('pairing:auth-ready', { detail: { allowed: true } }));
}

async function initPairingAuth() {
  if (!window.supabase?.createClient) {
    renderPairingAccess(false, '登入服務載入失敗，暫時無法使用即時配對。');
    return;
  }
  pairingClient = window.supabase.createClient(PAIRING_SUPABASE_URL, PAIRING_SUPABASE_KEY);
  const { data } = await pairingClient.auth.getSession();
  pairingSession = data?.session || null;
  await refreshPairingAuthorization();

  pairingClient.auth.onAuthStateChange(async (_event, session) => {
    pairingSession = session || null;
    await refreshPairingAuthorization();
  });
}


const extraPlayersRoot=()=>document.getElementById('pairingExtraPlayers');
function extraPlayerInputs(){return [...(extraPlayersRoot()?.querySelectorAll('input')||[])];}
function hasExtraTrackingPlayers(){return extraPlayerInputs().length>0;}
function updateExtraPlayerButtons(){
  const add=document.getElementById('pairingAddPlayer');
  if(add){add.hidden=extraPlayerInputs().length>=4;}
  extraPlayerInputs().forEach((input,i)=>{const label=input.closest('.pairing-field')?.querySelector('label');if(label)label.textContent='追蹤玩家 '+(i+2)+' PTCG ID';});
}
function addTrackingPlayer(value='',edited=true){
  const root=extraPlayersRoot();if(!root||extraPlayerInputs().length>=4)return;
  const row=document.createElement('div');row.className='pairing-extra-player';
  const field=document.createElement('div');field.className='pairing-field';
  const label=document.createElement('label'),input=document.createElement('input'),remove=document.createElement('button');
  input.type='text';input.className='search-input';input.value=value;input.placeholder='輸入 PTCG ID';input.autocomplete='off';input.autocapitalize='none';input.setAttribute('aria-label','新增追蹤玩家 PTCG ID');
  remove.type='button';remove.className='secondary-btn';remove.textContent='移除';
  input.addEventListener('input',()=>{pairingFormEdited=true;});
  remove.addEventListener('click',()=>{row.remove();pairingFormEdited=true;updateExtraPlayerButtons();});
  field.append(label,input);row.append(field,remove);root.append(row);
  if(edited)pairingFormEdited=true;
  updateExtraPlayerButtons();
  if(edited)input.focus();
}
function restoreExtraPlayers(ids=[]){
  const root=extraPlayersRoot();if(!root)return;
  root.replaceChildren();
  ids.slice(1,5).forEach(id=>addTrackingPlayer(id,false));
  updateExtraPlayerButtons();
}
function trackingIds(){
  const ids=[playerInput()?.value,...extraPlayerInputs().map(input=>input.value)].map(normalizePlayerId);
  if(ids.some(id=>!/^tw\d{1,16}$/.test(id)))throw new Error('請填妥所有 PTCG ID，或移除不使用的輸入欄位');
  if(new Set(ids).size!==ids.length)throw new Error('追蹤玩家 PTCG ID 不可重複');
  return ids;
}
function clearMultiResults(){
  const root=document.getElementById('pairingMultiResults');if(root){root.hidden=true;root.innerHTML='';}
}
function renderMultiCards(batch,cards,mode='round'){
  const root=document.getElementById('pairingMultiResults');if(!root)return;
  if(resultBox())resultBox().hidden=true;
  root.hidden=false;
  const cell=(label,value)=>'<div><span>'+escPairing(label)+'</span><b>'+escPairing(value||'—')+'</b></div>';
  const interim=new Map((batch?.results||[]).map(r=>[r.player_id,r.standing_match]));
  root.innerHTML=(cards||[]).map(c=>{
    const deckLabel=c.deck?'已記錄牌組':c.possible_deck?'可能牌組':c.previous_deck?'上次比賽牌組':'對手牌組';
    const provisional=mode==='interim'?interim.get(c.player_id):null;
    const status=c.final?'最終排名':mode==='interim'?'暫定排名':mode==='final'?'等待最終排名':'Round '+(batch?.round||'—');
    const content=c.final?cell('最終排名','第 '+c.rank+' 名')
      :provisional?cell('暫定排名','第 '+provisional.rank+' 名')
      :c.waiting||mode!=='round'?cell('狀態',mode==='round'?'本輪尚未找到配對':'尚未取得排名')
      :cell('桌號',c.table)+cell('TtlScore',c.ttl_score||'—')+cell('對手',c.opponent)+cell(deckLabel,c.deck||c.possible_deck||c.previous_deck||'尚未記錄');
    return '<article class="pairing-multi-card"><div class="pairing-multi-heading"><strong>'+escPairing(c.player)+'</strong><span class="pairing-round-badge">'+escPairing(status)+'</span></div><div class="pairing-multi-grid">'+content+'</div></article>';
  }).join('');
}
async function handleMultiWatch(){
  setPairingBusy(true);setPairingMessage('正在查詢多位玩家及賽事狀態…');
  try{
    const ids=trackingIds(),parsed=normalizeRoundUrl(sourceInput()?.value,Number(roundInput()?.value||1));
    if(parsed.tid===TEST_TID)throw new Error('這是歷史測試場，請使用進階 / 測試工具，不要啟動連續追蹤。');
    sourceInput().value=parsed.url;roundInput().value=String(parsed.round);
    const payload={url:parsed.url,player_ids:ids};
    const [lookup,rank]=await Promise.all([authorizedWatchRequest('lookup-multi',payload),authorizedWatchRequest('final-multi',payload)]);
    const first=lookup.batch?.results?.[0];
    if(first){await renderPairing(first);}
    const finished=rank.batch?.available&&rank.batch?.is_final;
    const viewingRanking=new URL(parsed.url).searchParams.get('znt')==='1';
    if(finished){
      renderMultiCards(viewingRanking?rank.batch:lookup.batch,viewingRanking?rank.cards:lookup.cards,viewingRanking?'final':'round');
      const existing=(await authorizedWatchRequest('status')).watch;
      if(existing?.active){renderWatchStatus(existing);}
      else{
        if(lookupButton())lookupButton().textContent='查詢這一輪';
        if(stopActions())stopActions().hidden=true;
        if(watchStatus()){watchStatus().classList.remove('active');watchStatus().textContent='歷史查詢';}
        if(watchCopy())watchCopy().textContent='此賽事已公布最終排名，僅查詢歷史資料，不發送通知。';
      }
      document.dispatchEvent(new CustomEvent('pairing:history-mode',{detail:{parsed,playerId:ids[0],playerIds:ids,pairing:first,ranking:rank.batch}}));
      setPairingMessage('已讀取多位玩家歷史資料，不啟動自動監控。','success');return;
    }
    if(rank.batch?.is_interim&&activePairingWatch?.active&&String(activePairingWatch.tid)===parsed.tid&&JSON.stringify(activePairingWatch.player_ids||[activePairingWatch.player_id])===JSON.stringify(ids)){
      renderMultiCards(rank.batch,rank.cards,'interim');renderWatchStatus(activePairingWatch);
      setPairingMessage('暫定排名已更新；原本追蹤繼續，不重發通知。','success');return;
    }
    renderMultiCards(lookup.batch,lookup.cards);
    const started=await authorizedWatchRequest('start-multi',payload);
    clearSavedPairingWatchForm();pairingFormEdited=false;syncPairingWatchForm(started.watch);renderWatchStatus(started.watch);
    document.dispatchEvent(new CustomEvent('pairing:tracking-started',{detail:{watch:started.watch,parsed,playerId:ids[0],playerIds:ids,pairing:first}}));
    if(rank.batch?.is_interim)renderMultiCards(rank.batch,rank.cards,'interim');
    setPairingMessage('已開始追蹤 '+ids.length+' 位玩家；每輪合併 LINE、網站推播與家庭通知。','success');
  }catch(error){setPairingMessage(error?.message||String(error),'error');}finally{setPairingBusy(false);}
}
async function handleMultiNotificationTest(final=false){
  setPairingBusy(true);setPairingMessage('正在讀取多位玩家並發送合併測試通知…');
  try{
    const ids=trackingIds(),parsed=normalizeRoundUrl(sourceInput()?.value,Number(roundInput()?.value||1));
    const data=await authorizedWatchRequest(final?'test-final-multi':'test-multi',{url:parsed.url,player_ids:ids});
    renderMultiCards(data.batch,data.cards,final?'final':'round');
    const line=Boolean(data.notification?.line?.sent),push=Number(data.notification?.push?.sent||0);
    setPairingMessage('合併測試完成：'+(line?'LINE 已送出':'LINE 未送出')+'；網站推播 '+push+' 支裝置。',line||push?'success':'error');
  }catch(error){setPairingMessage(error?.message||String(error),'error');}finally{setPairingBusy(false);}
}

function initPairingPage() {
  document.getElementById('pairingAddPlayer')?.addEventListener('click',()=>addTrackingPlayer());
  [sourceInput(), playerInput(), roundInput()].filter(Boolean).forEach(input => {
    const saveEdit = () => {
      pairingFormEdited = true;
      // The URL listener in pairing.html synchronizes Round in the same input event.
      queueMicrotask(savePairingWatchForm);
    };
    input.addEventListener('input', saveEdit);
    input.addEventListener('change', saveEdit);
  });
  window.addEventListener('pagehide', savePairingWatchForm);
  window.addEventListener('pageshow', event => {
    if (event.persisted) refreshWatchStatus({ reopened: true });
  });
  if (playerInput() && !playerInput().value) playerInput().value = DEFAULT_PLAYER_ID;
  document.getElementById('pairingLoadTestButton')?.addEventListener('click', loadHistoricalTest);
  lookupButton()?.addEventListener('click', handleStartWatch);
  testButton()?.addEventListener('click', handleTestNotification);
  finalTestButton()?.addEventListener('click', handleFinalTestNotification);
  startButton()?.addEventListener('click', handleStartWatch);
  stopButton()?.addEventListener('click', handleStopWatch);
  document.getElementById('pairingOpenOfficialButton')?.addEventListener('click', () => {
    if (!pairingAuthorized) return;
    try {
      const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
      window.open(parsed.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setPairingMessage(error?.message || String(error), 'error');
    }
  });
  initPairingAuth();
}

document.addEventListener('DOMContentLoaded', initPairingPage);
