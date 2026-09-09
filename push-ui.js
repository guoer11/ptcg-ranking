const PUSH_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-push';

let pushRegistration = null;
let pushSubscription = null;
let pushBusy = false;

const pushButton = () => document.getElementById('pushNotificationButton');
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
  if (pushToggleButton()) pushToggleButton().disabled = busy;
  if (pushTestButton()) pushTestButton().disabled = busy || !pushSubscription;
  document.querySelectorAll('[data-push-pref]').forEach(input => {
    input.disabled = busy || !pushSubscription;
    input.closest('.push-pref-row')?.classList.toggle('is-disabled', input.disabled);
  });
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
  const button = pushButton();
  if (!button) return;
  const allowed = Boolean(identitySession && identityAuthorized);
  button.hidden = !allowed;
  if (!allowed) {
    pushSubscription = null;
    return;
  }

  if (!pushSupportsWebPush()) {
    button.classList.remove('is-enabled');
    pushSetMessage('此裝置不支援推播', '目前的瀏覽器無法使用網站通知。');
    return;
  }

  await pushGetCurrentSubscription();
  if (pushSubscription) await pushLoadPreferences();

  const enabled = Boolean(pushSubscription && Notification.permission === 'granted');
  button.classList.toggle('is-enabled', enabled);
  button.title = enabled ? '通知已開啟' : '通知設定';
  button.setAttribute('aria-label', enabled ? '通知已開啟，點此設定' : '通知設定');

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
    pushSetMessage('尚未開啟通知', '按下「開啟通知」後，iPhone 會詢問是否允許推播。');
    if (pushToggleButton()) pushToggleButton().textContent = '開啟通知';
  }

  pushSetBusy(false);
}

function pushOpenModal() {
  const modal = pushModal();
  if (!modal || !identityAuthorized) return;
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
}

async function pushHandleToggle() {
  if (pushBusy) return;
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
  if (pushBusy) return;
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
  pushButton()?.addEventListener('click', pushOpenModal);
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

window.updatePushUI = () => { pushRefreshStatus(); };
document.addEventListener('DOMContentLoaded', initPushUI);
