const PAIRING_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const PAIRING_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
const PAIRING_FUNCTION_URL = `${PAIRING_SUPABASE_URL}/functions/v1/ptcg-pairing`;
const PAIRING_WATCH_URL = `${PAIRING_SUPABASE_URL}/functions/v1/ptcg-pairing-watch`;
const DEFAULT_PLAYER_ID = 'tw39371632';
const TEST_TOURNAMENT_URL = 'https://tcg.sfc-jpn.jp/tour.asp?tid=3000442';
const TEST_TID = '3000442';

let pairingClient = null;
let pairingSession = null;
let lastPairing = null;

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
const startButton = () => document.getElementById('pairingStartButton');
const stopButton = () => document.getElementById('pairingStopButton');

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
  [lookupButton(), testButton(), startButton(), stopButton(), document.getElementById('pairingLoadTestButton')]
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

async function fetchPairing(url, playerId) {
  const response = await fetch(PAIRING_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, player: playerId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '配對資料讀取失敗');
  return data;
}

async function lookupRealNames(ids) {
  const map = {};
  if (!pairingClient || !pairingSession) return map;
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
  const playerName = names[playerId] || '';
  const opponentName = names[opponentId] || '';

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
        ${playerName ? `<small>${escPairing(playerId)}</small>` : '<small>登入授權帳號後可顯示姓名</small>'}
      </article>
      <article>
        <span>對手</span>
        <strong>${escPairing(opponentName || opponentId)}</strong>
        ${opponentName ? `<small>${escPairing(opponentId)}</small>` : '<small>登入授權帳號後可顯示姓名</small>'}
      </article>
      <article>
        <span>來源</span>
        <strong>TCG マイスター</strong>
        <small>${escPairing(data.title || '')}</small>
      </article>
    </div>`;
}

async function lookupCurrentPairing() {
  const playerId = normalizePlayerId(playerInput()?.value);
  if (!/^tw\d+$/i.test(playerId)) throw new Error('請輸入有效的 PTCG ID，例如 tw39371632');
  const parsed = normalizeRoundUrl(sourceInput()?.value, Number(roundInput()?.value || 1));
  if (sourceInput()) sourceInput().value = parsed.url;
  if (roundInput()) roundInput().value = String(parsed.round);
  const data = await fetchPairing(parsed.url, playerId);
  await renderPairing(data);
  return { data, parsed, playerId };
}

async function authorizedWatchRequest(action, extra = {}) {
  if (!pairingSession?.access_token) throw new Error('請先到玩家排行頁登入授權 Google 帳號');
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

  if (!watch?.active) {
    status.classList.remove('active');
    status.innerHTML = '<span class="pairing-watch-dot"></span>未監控';
    copy.innerHTML = '正式比賽時，先查到目前 Round，再按「開始監控下一輪」。後端會每 <strong>10 秒</strong>檢查一次。';
    return;
  }

  status.classList.add('active');
  status.innerHTML = '<span class="pairing-watch-dot"></span>監控中';
  const checked = watch.last_checked_at ? new Date(watch.last_checked_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未檢查';
  copy.innerHTML = `活動 <strong>${escPairing(watch.tid)}</strong> · 玩家 <strong>${escPairing(watch.player_id)}</strong><br>正在等待 <strong>Round ${escPairing(watch.next_round)}</strong>，每 10 秒由後端檢查。最後檢查：${escPairing(checked)}`;
}

async function refreshWatchStatus() {
  if (!pairingSession) {
    renderWatchStatus(null);
    return;
  }
  try {
    const data = await authorizedWatchRequest('status');
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

async function handleStartWatch() {
  setPairingBusy(true);
  try {
    const { parsed, playerId } = await lookupCurrentPairing();
    if (parsed.tid === TEST_TID) throw new Error('這是歷史測試場，為避免 Round 2、3、4…連續洗版，請使用「發送測試通知」，不要啟動連續監控。');
    const data = await authorizedWatchRequest('start', { url: parsed.url, player_id: playerId });
    renderWatchStatus(data.watch);
    setPairingMessage(`已開始監控 Round ${data.watch.next_round}，後端每 10 秒檢查一次。iPhone 鎖屏後仍會繼續。`, 'success');
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
    renderWatchStatus(data.watch);
    setPairingMessage('已停止下一輪配對監控。', 'success');
  } catch (error) {
    setPairingMessage(error?.message || String(error), 'error');
  } finally {
    setPairingBusy(false);
  }
}

function loadHistoricalTest() {
  if (sourceInput()) sourceInput().value = TEST_TOURNAMENT_URL;
  if (playerInput()) playerInput().value = DEFAULT_PLAYER_ID;
  if (roundInput()) roundInput().value = '1';
  setPairingMessage('已載入 2026/9/12 高級球孩童組歷史測試場。按「查詢這一輪」可驗證配對解析。');
}

async function initPairingAuth() {
  if (!window.supabase?.createClient) {
    if (authCopy()) authCopy().textContent = '登入服務載入失敗；仍可查配對，但無法顯示私人姓名或發送通知。';
    return;
  }
  pairingClient = window.supabase.createClient(PAIRING_SUPABASE_URL, PAIRING_SUPABASE_KEY);
  const { data } = await pairingClient.auth.getSession();
  pairingSession = data?.session || null;
  if (authCopy()) {
    authCopy().innerHTML = pairingSession
      ? '已偵測到授權登入，可顯示姓名並使用 LINE / 網站推播。'
      : '目前未登入；配對仍可查詢，但姓名與通知需先到 <a href="index.html">玩家排行</a> 登入。';
  }
  await refreshWatchStatus();

  pairingClient.auth.onAuthStateChange((_event, session) => {
    pairingSession = session || null;
    refreshWatchStatus();
  });
}

function initPairingPage() {
  if (playerInput() && !playerInput().value) playerInput().value = DEFAULT_PLAYER_ID;
  document.getElementById('pairingLoadTestButton')?.addEventListener('click', loadHistoricalTest);
  lookupButton()?.addEventListener('click', handleLookup);
  testButton()?.addEventListener('click', handleTestNotification);
  startButton()?.addEventListener('click', handleStartWatch);
  stopButton()?.addEventListener('click', handleStopWatch);
  document.getElementById('pairingOpenOfficialButton')?.addEventListener('click', () => {
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
