const FAMILY_NOTIFY_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-push';
const FAMILY_INVITE_STORAGE_KEY = 'ptcgFamilyInviteToken';
const FAMILY_LINKED_STORAGE_KEY = 'ptcgFamilyPushLinked';
const FAMILY_MATCH_STORAGE_KEY = 'ptcgFamilyLatestMatch';
const FAMILY_MATCH_TTL_MS = 24 * 60 * 60 * 1000;

const familyNotifyCard = () => document.querySelector('.family-notify-card');
const familyNotifyTitle = () => document.getElementById('familyNotifyTitle');
const familyNotifyStatus = () => document.getElementById('familyNotifyStatus');
const familyNotifyButton = () => document.getElementById('familyNotifyEnableButton');
const familyNotifyHint = () => document.getElementById('familyNotifyHint');

function familyEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function familySummaryFromParams(params) {
  const type = params.get('type') || '';
  if (type !== 'round' && type !== 'final') return null;

  if (type === 'final') {
    return {
      type: 'final',
      player: params.get('player') || '—',
      rank: params.get('rank') || '—',
      official: params.get('official') || '',
      saved_at: new Date().toISOString()
    };
  }

  return {
    type: 'round',
    round: params.get('round') || '—',
    player: params.get('player') || '—',
    table: params.get('table') || '—',
    opponent: params.get('opponent') || '—',
    deck: params.get('deck') || '',
    official: params.get('official') || '',
    saved_at: new Date().toISOString()
  };
}

function familyLoadStoredSummary() {
  try {
    const raw = localStorage.getItem(FAMILY_MATCH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || (value.type !== 'round' && value.type !== 'final')) return null;

    const savedAt = Date.parse(value.saved_at || '');
    if (!Number.isFinite(savedAt) || Date.now() - savedAt >= FAMILY_MATCH_TTL_MS) {
      localStorage.removeItem(FAMILY_MATCH_STORAGE_KEY);
      return null;
    }
    return value;
  } catch (_) {
    localStorage.removeItem(FAMILY_MATCH_STORAGE_KEY);
    return null;
  }
}

function familyStoreSummary(summary) {
  try {
    localStorage.setItem(FAMILY_MATCH_STORAGE_KEY, JSON.stringify(summary));
  } catch (_) {}
}

function familyRenderMatchSummary() {
  const params = new URLSearchParams(window.location.search);
  const querySummary = familySummaryFromParams(params);
  if (querySummary) familyStoreSummary(querySummary);
  const data = querySummary || familyLoadStoredSummary();
  if (!data) return false;

  const summary = document.getElementById('familyMatchSummary');
  const title = document.getElementById('familyMatchTitle');
  const badge = document.getElementById('familyMatchBadge');
  const eyebrow = document.getElementById('familyMatchEyebrow');
  const grid = document.getElementById('familyMatchGrid');
  const officialLink = document.getElementById('familyOfficialLink');
  if (!summary || !title || !badge || !eyebrow || !grid || !officialLink) return false;

  const player = data.player || '—';
  const official = data.official || '';

  if (data.type === 'final') {
    const rank = data.rank || '—';
    eyebrow.textContent = querySummary ? '比賽完成' : '最近結果';
    title.textContent = '最終排名';
    badge.textContent = 'Final rank';
    grid.innerHTML = `
      <article><span>玩家</span><strong>${familyEscape(player)}</strong></article>
      <article><span>最終排名</span><strong>第 ${familyEscape(rank)} 名</strong></article>`;
    officialLink.textContent = '開啟官方排名';
  } else {
    const round = data.round || '—';
    const table = data.table || '—';
    const opponent = data.opponent || '—';
    const deck = data.deck || '';
    eyebrow.textContent = querySummary ? '最新配對' : '最近一次配對';
    title.textContent = `Round ${round}`;
    badge.textContent = `Round ${round}`;
    grid.innerHTML = `
      <article><span>玩家</span><strong>${familyEscape(player)}</strong></article>
      <article><span>桌號</span><strong>${familyEscape(table)}</strong></article>
      <article class="family-match-wide"><span>對手</span><strong>${familyEscape(opponent)}</strong></article>
      ${deck ? `<article class="family-match-wide"><span>對手牌組</span><strong>${familyEscape(deck)}</strong></article>` : ''}`;
    officialLink.textContent = '開啟官方配對';
  }

  if (official && /^https:\/\/tcg\.sfc-jpn\.jp\//i.test(official)) {
    officialLink.href = official;
    officialLink.hidden = false;
  } else {
    officialLink.hidden = true;
  }

  summary.hidden = false;
  return true;
}

function familyIsIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function familyIsStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function familyPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function familySetState(title, status, type = '') {
  if (familyNotifyTitle()) familyNotifyTitle().textContent = title;
  if (familyNotifyStatus()) familyNotifyStatus().textContent = status;
  familyNotifyCard()?.classList.toggle('is-success', type === 'success');
  familyNotifyCard()?.classList.toggle('is-error', type === 'error');
}

function familySetBusy(busy) {
  const button = familyNotifyButton();
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? '正在設定…' : '開啟配對通知';
}

function familyBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function familyFunctionRequest(action, extra = {}) {
  const response = await fetch(FAMILY_NOTIFY_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '家庭通知服務回應失敗');
  return data;
}

async function familyGetSubscription() {
  const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) return subscription;

  const keyData = await familyFunctionRequest('public-key');
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: familyBase64ToUint8Array(keyData.publicKey)
  });
  return subscription;
}

async function enableFamilyPush() {
  if (!familyPushSupported()) throw new Error('這個瀏覽器目前不支援網站推播');
  if (familyIsIOS() && !familyIsStandalone()) throw new Error('iPhone 請先加入主畫面，再從主畫面圖示重新開啟');

  const token = localStorage.getItem(FAMILY_INVITE_STORAGE_KEY) || '';
  if (!token) throw new Error('找不到有效邀請資料，請請家人重新產生邀請連結');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? '通知權限已被拒絕，請到 iPhone 設定重新允許' : '尚未允許通知');
  }

  const subscription = await familyGetSubscription();
  const payload = subscription.toJSON();
  const data = await familyFunctionRequest('subscribe', { token, subscription: payload });

  localStorage.setItem(FAMILY_LINKED_STORAGE_KEY, '1');
  localStorage.removeItem(FAMILY_INVITE_STORAGE_KEY);
  familySetState('家庭通知已啟用', data.confirmation_sent
    ? '設定完成。剛剛已送出一則確認推播；之後 Round 配對與最終排名都會通知這支 iPhone。'
    : '設定完成。之後 Round 配對與最終排名都會通知這支 iPhone。', 'success');
  if (familyNotifyButton()) {
    familyNotifyButton().disabled = true;
    familyNotifyButton().textContent = '已開啟通知';
  }
  if (familyNotifyHint()) familyNotifyHint().textContent = '不需要 Google 登入；這支裝置只接收配對與最終排名網站推播。';
}

async function handleFamilyEnable() {
  familySetBusy(true);
  familySetState('正在設定通知', '請稍候，正在向這支 iPhone 建立網站推播訂閱。');
  try {
    await enableFamilyPush();
  } catch (error) {
    familySetState('設定失敗', error?.message || String(error), 'error');
    familySetBusy(false);
  }
}

async function initFamilyNotify() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      registration.update().catch(() => {});
    } catch (error) {
      console.warn('家庭通知 Service Worker 更新失敗', error);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('token');
  if (queryToken) localStorage.setItem(FAMILY_INVITE_STORAGE_KEY, queryToken);

  const hasMatchSummary = familyRenderMatchSummary();
  const alreadyLinked = localStorage.getItem(FAMILY_LINKED_STORAGE_KEY) === '1';
  const token = localStorage.getItem(FAMILY_INVITE_STORAGE_KEY) || '';
  const button = familyNotifyButton();
  button?.addEventListener('click', handleFamilyEnable);

  if (alreadyLinked) {
    familySetState('家庭通知已啟用', hasMatchSummary
      ? '這支裝置已完成綁定；上方會保留最近一次配對或最終排名資訊 24 小時。'
      : '這支裝置已完成綁定，Round 配對與最終排名公布時會收到網站推播。', 'success');
    if (button) {
      button.disabled = true;
      button.textContent = '已開啟通知';
    }
    if (familyNotifyHint()) familyNotifyHint().textContent = '若日後不想接收通知，可直接從 iPhone 通知設定關閉。';
    return;
  }

  if (hasMatchSummary && !token) {
    familySetState('配對資訊', '上方可查看最近一次通知的配對資料；資料會保留 24 小時。若這支裝置尚未綁定，請重新使用家庭邀請連結設定。');
    if (button) button.disabled = true;
    return;
  }

  if (!token) {
    familySetState('邀請連結無效', '找不到邀請資料，請請家人從即時配對頁重新產生一次性邀請連結。', 'error');
    if (button) button.disabled = true;
    return;
  }

  if (!familyPushSupported()) {
    familySetState('此裝置不支援推播', '請使用支援網站推播的 iPhone Safari，並從加入主畫面的圖示開啟。', 'error');
    if (button) button.disabled = true;
    return;
  }

  if (familyIsIOS() && !familyIsStandalone()) {
    familySetState('先加入主畫面', '邀請資料已保留。請按 Safari 分享 →「加入主畫面」，再從主畫面新圖示重新開啟。');
    if (button) {
      button.disabled = true;
      button.textContent = '請先加入主畫面';
    }
    if (familyNotifyHint()) familyNotifyHint().textContent = '不要先關掉這個頁面；加入主畫面後再從新圖示開啟即可繼續。';
    return;
  }

  familySetState('可以開啟通知了', '按下「開啟配對通知」，再允許 iPhone 通知權限。');
  if (button) button.disabled = false;
}

document.addEventListener('DOMContentLoaded', initFamilyNotify);
