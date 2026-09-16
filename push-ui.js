const PUSH_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-push';

let pushRegistration = null;
let pushSubscription = null;
let pushBusy = false;

const pushModal = () => document.getElementById('pushModal');
const pushStatusTitle = () => document.getElementById('pushStatusTitle');
const pushStatusText = () => document.getElementById('pushStatusText');
const pushToggleButton = () => document.getElementById('pushToggleButton');
const pushTestButton = () => document.getElementById('pushTestButton');

const PUSH_PREF_FIELDS = {
  pushPrefRanking: 'notify_ranking',
  pushPrefGreat: 'notify_great',
  pushPrefUltra: 'notify_ultra',
  pushPrefPremier: 'notify_premier',
  pushPrefMaster: 'notify_master',
  pushPrefResults: 'notify_results'
};

function pushIsStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function pushIsIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function pushSupportsWebPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function pushSetMessage(title, text) {
  if (pushStatusTitle()) pushStatusTitle().textContent = title;
  if (pushStatusText()) pushStatusText().textContent = text;
}

function pushSetBusy(busy) {
  pushBusy = busy;
  if (pushToggleButton()) pushToggleButton().disabled = busy || !identityAuthorized;
  if (pushTestButton()) pushTestButton().disabled = busy || !identityAuthorized || !pushSubscription;
  document.querySelectorAll('[data-push-pref]').forEach(input => {
    input.disabled = busy || !identityAuthorized || !pushSubscription;
    input.closest('.push-pref-row')?.classList.toggle('is-disabled', input.disabled);
  });
}

function pushHubIcon(type) {
  if (type === 'account') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0v4.6L4 16v1h16v-1l-2-2.4V9Zm-8.3 10a2.5 2.5 0 0 0 4.6 0H9.7Z"/></svg>';
}

function pushShowHubView(name = 'home') {
  const modal = pushModal();
  if (!modal) return;
  modal.querySelectorAll('[data-account-view]').forEach(view => {
    view.hidden = view.dataset.accountView !== name;
  });
  const title = document.getElementById('pushModalTitle');
  const subtitle = modal.querySelector('.modal-header small');
  if (title) title.textContent = name === 'account' ? '帳號設定' : name === 'notifications' ? '通知設定' : '帳號與通知';
  if (subtitle) subtitle.textContent = name === 'account'
    ? 'Google 帳號與授權狀態'
    : name === 'notifications'
      ? '網站推播、LINE 與通知項目'
      : '選擇要調整的項目';
  modal.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'instant' });
}

function pushEnsureHubLayout() {
  const modal = pushModal();
  const body = modal?.querySelector('.modal-body');
  if (!modal || !body || body.dataset.accountHubReady === '1') return;

  const accountStatus = document.getElementById('accountStatusTitle')?.closest('.push-status-box');
  const accountActions = document.getElementById('accountAuthActionButton')?.closest('.push-actions');
  const webStatus = document.getElementById('pushStatusTitle')?.closest('.push-status-box');
  const webActions = document.getElementById('pushToggleButton')?.closest('.push-actions');
  const lineStatus = document.getElementById('lineStatusText')?.closest('.push-status-box');
  const lineActions = document.getElementById('lineTestButton')?.closest('.push-actions');
  const preferences = body.querySelector('.push-preferences');
  const help = body.querySelector('.push-help');
  if (!accountStatus || !accountActions || !webStatus || !webActions || !lineStatus || !lineActions || !preferences) return;

  const home = document.createElement('section');
  home.className = 'account-hub-view';
  home.dataset.accountView = 'home';
  home.innerHTML = `
    <div class="account-hub-profile">
      <span class="account-hub-profile-icon">${pushHubIcon('account')}</span>
      <div><strong>PTCG 個人設定</strong><small>帳號與通知集中管理</small></div>
    </div>
    <div class="account-hub-menu">
      <button class="account-menu-row" type="button" data-account-target="account">
        <span class="account-menu-icon account">${pushHubIcon('account')}</span>
        <span class="account-menu-copy"><strong>帳號設定</strong><small id="accountMenuStatus">Google 帳號、登入與登出</small></span>
        <span class="account-menu-chevron" aria-hidden="true">›</span>
      </button>
      <button class="account-menu-row" type="button" data-account-target="notifications">
        <span class="account-menu-icon notification">${pushHubIcon('notification')}</span>
        <span class="account-menu-copy"><strong>通知設定</strong><small id="notificationMenuStatus">網站推播、LINE 與通知項目</small></span>
        <span class="account-menu-chevron" aria-hidden="true">›</span>
      </button>
    </div>`;

  const accountView = document.createElement('section');
  accountView.className = 'account-detail-view';
  accountView.dataset.accountView = 'account';
  accountView.hidden = true;
  accountView.innerHTML = '<button class="account-back-row" type="button" data-account-back>‹ <span>帳號與通知</span></button><div class="account-detail-label">帳號</div>';
  accountView.append(accountStatus, accountActions);

  const notificationView = document.createElement('section');
  notificationView.className = 'account-detail-view';
  notificationView.dataset.accountView = 'notifications';
  notificationView.hidden = true;
  notificationView.innerHTML = '<button class="account-back-row" type="button" data-account-back>‹ <span>帳號與通知</span></button><div class="account-detail-label">網站推播</div>';
  notificationView.append(webStatus, webActions);
  const lineLabel = document.createElement('div');
  lineLabel.className = 'account-detail-label';
  lineLabel.textContent = 'LINE';
  notificationView.append(lineLabel, lineStatus, lineActions, preferences);
  if (help) notificationView.append(help);

  body.replaceChildren(home, accountView, notificationView);
  body.dataset.accountHubReady = '1';

  body.querySelectorAll('[data-account-target]').forEach(button => {
    button.addEventListener('click', () => pushShowHubView(button.dataset.accountTarget));
  });
  body.querySelectorAll('[data-account-back]').forEach(button => {
    button.addEventListener('click', () => pushShowHubView('home'));
  });

  const accountTitle = document.getElementById('accountStatusTitle');
  const accountMenuStatus = document.getElementById('accountMenuStatus');
  if (accountTitle && accountMenuStatus) {
    const sync = () => { accountMenuStatus.textContent = accountTitle.textContent || 'Google 帳號、登入與登出'; };
    new MutationObserver(sync).observe(accountTitle, { childList: true, subtree: true, characterData: true });
    sync();
  }
  const notificationTitle = pushStatusTitle();
  const notificationMenuStatus = document.getElementById('notificationMenuStatus');
  if (notificationTitle && notificationMenuStatus) {
    const sync = () => { notificationMenuStatus.textContent = notificationTitle.textContent || '網站推播、LINE 與通知項目'; };
    new MutationObserver(sync).observe(notificationTitle, { childList: true, subtree: true, characterData: true });
    sync();
  }
  pushShowHubView('home');
}

function pushBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function pushRegisterServiceWorker() {
  if (!pushSupportsWebPush()) throw new Error('此裝置不支援網站推播');
  if (!pushRegistration) {
    pushRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
  }
  return pushRegistration;
}

async function pushFetchPublicKey() {
  const response = await fetch(`${PUSH_FUNCTION_URL}?action=public-key`, { cache: 'no-store' });
  if (!response.ok) throw new Error('無法取得推播金鑰');
  const data = await response.json();
  if (!data?.publicKey) throw new Error('推播金鑰不存在');
  return data.publicKey;
}

async function pushGetCurrentSubscription() {
  try {
    const registration = await pushRegisterServiceWorker();
    pushSubscription = await registration.pushManager.getSubscription();
  } catch (error) {
    console.warn('推播狀態讀取失敗', error);
    pushSubscription = null;
  }
  return pushSubscription;
}

function pushSubscriptionRow(subscription) {
  const json = subscription.toJSON();
  return {
    user_id: identitySession.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth
  };
}

async function pushSaveSubscription(subscription) {
  if (!identityClient || !identitySession || !identityAuthorized) throw new Error('請先以授權帳號登入');
  const row = pushSubscriptionRow(subscription);
  if (!row.endpoint || !row.p256dh || !row.auth) throw new Error('推播訂閱資料不完整');

  const prefs = {};
  for (const [id, field] of Object.entries(PUSH_PREF_FIELDS)) {
    const input = document.getElementById(id);
    prefs[field] = input ? Boolean(input.checked) : field !== 'notify_results';
  }

  const { error } = await identityClient
    .from('push_subscriptions')
    .upsert({ ...row, ...prefs }, { onConflict: 'endpoint' });
  if (error) throw error;
}

async function pushLoadPreferences() {
  if (!identityClient || !identitySession || !pushSubscription) return;
  const { data, error } = await identityClient
    .from('push_subscriptions')
    .select('notify_ranking,notify_great,notify_ultra,notify_premier,notify_master,notify_results')
    .eq('endpoint', pushSubscription.endpoint)
    .maybeSingle();
  if (error) {
    console.warn('推播偏好讀取失敗', error);
    return;
  }
  if (!data) return;
  for (const [id, field] of Object.entries(PUSH_PREF_FIELDS)) {
    const input = document.getElementById(id);
    if (input && typeof data[field] === 'boolean') input.checked = data[field];
  }
}

async function pushEnable() {
  if (!identityAuthorized || !identitySession) throw new Error('請先用你的授權帳號登入');
  if (pushIsIOS() && !pushIsStandalone()) throw new Error('iPhone 請從已加入主畫面的網站開啟後再啟用通知');
  if (!pushSupportsWebPush()) throw new Error('此 iPhone / 瀏覽器版本不支援網站推播');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? '通知權限已被關閉，請到 iPhone 設定中重新允許' : '尚未允許通知');

  const registration = await pushRegisterServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await pushFetchPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: pushBase64ToUint8Array(publicKey)
    });
  }
  pushSubscription = subscription;
  await pushSaveSubscription(subscription);
  await pushLoadPreferences();
}

async function pushDisable() {
  if (!pushSubscription) return;
  const endpoint = pushSubscription.endpoint;
  try {
    if (identityClient && identitySession) {
      await identityClient.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } finally {
    await pushSubscription.unsubscribe();
    pushSubscription = null;
  }
}

async function pushSendTest() {
  if (!identitySession?.access_token) throw new Error('登入狀態已失效，請重新登入');
  if (!pushSubscription) throw new Error('請先開啟通知');
  const response = await fetch(PUSH_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${identitySession.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'test' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '測試推播發送失敗');
  if (!data.sent) throw new Error('伺服器沒有找到可用的推播訂閱');
}

async function pushSavePreferences() {
  if (!pushSubscription || !identityClient || !identitySession) return;
  const changes = {};
  for (const [id, field] of Object.entries(PUSH_PREF_FIELDS)) {
    const input = document.getElementById(id);
    if (input) changes[field] = Boolean(input.checked);
  }
  const { error } = await identityClient
    .from('push_subscriptions')
    .update(changes)
    .eq('endpoint', pushSubscription.endpoint);
  if (error) throw error;
}

async function pushRefreshStatus() {
  const allowed = Boolean(identitySession && identityAuthorized);
  if (!allowed) {
    pushSubscription = null;
    pushSetMessage('網站推播', identitySession ? '目前登入的帳號沒有通知設定權限。' : '請先在帳號設定登入授權 Google 帳號。');
    if (pushToggleButton()) pushToggleButton().textContent = '開啟通知';
    pushSetBusy(false);
    return;
  }

  if (!pushSupportsWebPush()) {
    pushSetMessage('此裝置不支援推播', '目前的瀏覽器無法使用網站通知。');
    pushSetBusy(false);
    return;
  }

  await pushGetCurrentSubscription();
  if (pushSubscription) await pushLoadPreferences();

  const enabled = Boolean(pushSubscription && Notification.permission === 'granted');

  if (enabled) {
    pushSetMessage('通知已開啟', '有新的官方排名或你勾選的聯盟賽事時，會推播到這支 iPhone。');
    if (pushToggleButton()) pushToggleButton().textContent = '關閉通知';
  } else if (Notification.permission === 'denied') {
    pushSetMessage('通知權限已關閉', '請到 iPhone「設定 → 通知」找到此網站並重新允許。');
    if (pushToggleButton()) pushToggleButton().textContent = '重新檢查';
  } else if (pushIsIOS() && !pushIsStandalone()) {
    pushSetMessage('請從主畫面開啟', 'iPhone 的網站推播需要先加入主畫面，再從主畫面圖示開啟。');
    if (pushToggleButton()) pushToggleButton().textContent = '開啟通知';
  } else {
    pushSetMessage('尚未開啟通知', '進入通知設定後即可開啟 iPhone 網站推播。');
    if (pushToggleButton()) pushToggleButton().textContent = '開啟通知';
  }

  pushSetBusy(false);
}

function pushOpenModal() {
  const modal = pushModal();
  if (!modal) return;
  pushEnsureHubLayout();
  pushShowHubView('home');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  pushRefreshStatus();
}

function pushCloseModal() {
  const modal = pushModal();
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  pushShowHubView('home');
}

async function pushHandleToggle() {
  if (pushBusy || !identityAuthorized) return;
  pushSetBusy(true);
  try {
    await pushGetCurrentSubscription();
    if (pushSubscription && Notification.permission === 'granted') {
      await pushDisable();
      pushSetMessage('通知已關閉', '這支 iPhone 不會再收到 PTCG 網站推播。');
    } else if (Notification.permission === 'denied') {
      await pushRefreshStatus();
      return;
    } else {
      await pushEnable();
      pushSetMessage('通知已開啟', '已完成訂閱，可以按「發送測試通知」確認。');
    }
  } catch (error) {
    console.error('通知設定失敗', error);
    pushSetMessage('通知設定失敗', error?.message || String(error));
  } finally {
    await pushRefreshStatus();
  }
}

async function pushHandleTest() {
  if (pushBusy || !identityAuthorized) return;
  pushSetBusy(true);
  pushSetMessage('正在發送測試通知', '請稍候幾秒。');
  try {
    await pushSendTest();
    pushSetMessage('測試推播已送出', '如果設定正常，這支 iPhone 應該會收到「PTCG 推播測試」。');
  } catch (error) {
    console.error('測試推播失敗', error);
    pushSetMessage('測試推播失敗', error?.message || String(error));
  } finally {
    pushSetBusy(false);
  }
}

function initPushUI() {
  const modal = pushModal();
  if (!modal) return;
  pushEnsureHubLayout();
  if (modal.dataset.pushUiReady === '1') {
    pushRefreshStatus();
    return;
  }
  modal.dataset.pushUiReady = '1';
  pushToggleButton()?.addEventListener('click', pushHandleToggle);
  pushTestButton()?.addEventListener('click', pushHandleTest);
  document.querySelectorAll('[data-close-push-modal]').forEach(item => item.addEventListener('click', pushCloseModal));
  document.querySelectorAll('[data-push-pref]').forEach(input => {
    input.addEventListener('change', async () => {
      try {
        await pushSavePreferences();
        pushSetMessage('通知偏好已更新', '之後只會收到你目前勾選的通知類型。');
      } catch (error) {
        console.error('通知偏好儲存失敗', error);
        pushSetMessage('通知偏好儲存失敗', error?.message || String(error));
      }
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pushModal()?.classList.contains('open')) pushCloseModal();
  });
  pushRefreshStatus();
}

window.openAccountNotificationModal = pushOpenModal;
window.showAccountHubView = pushShowHubView;
window.updatePushUI = () => { pushEnsureHubLayout(); pushRefreshStatus(); };
document.addEventListener('DOMContentLoaded', initPushUI);
