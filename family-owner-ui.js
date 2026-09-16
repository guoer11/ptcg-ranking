const FAMILY_OWNER_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const FAMILY_OWNER_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
const FAMILY_OWNER_FUNCTION_URL = `${FAMILY_OWNER_SUPABASE_URL}/functions/v1/ptcg-family-push`;

let familyOwnerClient = null;
let familyOwnerSession = null;
let familyOwnerAuthorized = false;
let familyOwnerBusy = false;
let familyOwnerAuthBound = false;

function familyOwnerEnsureStyle() {
  if (document.querySelector('link[data-family-owner-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'family-owner-ui.css?v=0.13.1-r1';
  link.dataset.familyOwnerStyle = 'true';
  document.head.appendChild(link);
}

function familyOwnerCard() {
  return document.querySelector('[data-account-view="family"] #familyNotificationCard');
}

function familyOwnerEnsureCard() {
  const card = familyOwnerCard();
  if (!card) return null;
  if (card.dataset.familyOwnerReady === '1') return card;

  card.className = 'account-family-manager family-owner-card';
  card.innerHTML = `
    <div class="family-owner-head">
      <div>
        <strong>家庭通知裝置</strong>
        <span>家人的 iPhone 只接收 Round 配對與最終排名網站推播，不需要 Google 登入，也不增加 LINE 官方帳號訊息量。</span>
      </div>
      <span id="familyDeviceCount" class="family-owner-count">0 台</span>
    </div>
    <div class="family-owner-form">
      <label for="familyDeviceLabel">裝置名稱</label>
      <input id="familyDeviceLabel" class="search-input" type="text" value="家庭 iPhone" maxlength="40" autocomplete="off" />
      <div class="family-owner-actions">
        <button id="familyCreateInviteButton" class="primary-btn" type="button">產生邀請連結</button>
        <button id="familyShareInviteButton" class="secondary-btn" type="button">分享邀請</button>
        <button id="familyCopyInviteButton" class="secondary-btn" type="button">複製連結</button>
      </div>
      <small class="family-owner-tip">可產生一次性邀請連結，家庭裝置只會收到配對與最終排名網站推播。</small>
    </div>
    <div id="familyInvitePanel" class="family-owner-invite" hidden>
      <input id="familyInviteUrl" class="search-input" type="text" readonly aria-label="家庭通知邀請連結" />
      <small id="familyInviteExpiry">邀請連結成功綁定後即失效。</small>
    </div>
    <div id="familyNotificationMessage" class="family-owner-message">正在確認家庭通知權限…</div>
    <div class="family-owner-devices">
      <div class="family-owner-devices-head"><strong>已綁定裝置</strong><span>只收配對通知</span></div>
      <div id="familyDeviceList"><div class="family-owner-empty">讀取中…</div></div>
    </div>`;
  card.dataset.familyOwnerReady = '1';

  document.getElementById('familyCreateInviteButton')?.addEventListener('click', createFamilyInvite);
  document.getElementById('familyCopyInviteButton')?.addEventListener('click', copyFamilyInvite);
  document.getElementById('familyShareInviteButton')?.addEventListener('click', shareFamilyInvite);
  return card;
}

function familyOwnerMessage(text, type = '') {
  const el = document.getElementById('familyNotificationMessage');
  if (!el) return;
  el.textContent = text || '';
  el.className = `family-owner-message${type ? ` ${type}` : ''}`;
}

function familyOwnerSetBusy(busy) {
  familyOwnerBusy = busy;
  ['familyCreateInviteButton', 'familyShareInviteButton', 'familyCopyInviteButton'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy || !familyOwnerAuthorized;
  });
  document.querySelectorAll('[data-family-remove]').forEach(button => { button.disabled = busy || !familyOwnerAuthorized; });
}

async function familyOwnerRequest(action, extra = {}) {
  if (!familyOwnerSession?.access_token) throw new Error('請先以授權帳號登入');
  const response = await fetch(FAMILY_OWNER_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${familyOwnerSession.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '家庭通知服務回應失敗');
  return data;
}

function familyOwnerFormatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function familyOwnerEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderFamilyDevices(devices = []) {
  const list = document.getElementById('familyDeviceList');
  const count = document.getElementById('familyDeviceCount');
  const homeStatus = document.getElementById('accountAppFamilyStatus');
  if (count) count.textContent = `${devices.length} 台`;
  if (homeStatus) homeStatus.textContent = devices.length ? `已綁定 ${devices.length} 台裝置` : '尚未綁定家庭裝置';
  if (!list) return;

  if (!devices.length) {
    list.innerHTML = '<div class="family-owner-empty">目前尚未綁定家庭通知裝置。</div>';
    return;
  }

  list.innerHTML = devices.map(device => `
    <div class="family-owner-device">
      <div>
        <strong>${familyOwnerEscape(device.device_label || '家庭裝置')}</strong>
        <small>綁定：${familyOwnerEscape(familyOwnerFormatDate(device.created_at))}</small>
      </div>
      <button class="secondary-btn family-owner-remove" type="button" data-family-remove="${familyOwnerEscape(device.id)}">移除</button>
    </div>`).join('');

  list.querySelectorAll('[data-family-remove]').forEach(button => {
    button.addEventListener('click', async () => {
      if (familyOwnerBusy || !familyOwnerAuthorized) return;
      const id = Number(button.dataset.familyRemove);
      if (!Number.isInteger(id)) return;
      familyOwnerSetBusy(true);
      familyOwnerMessage('正在移除家庭通知裝置…');
      try {
        const data = await familyOwnerRequest('remove-device', { device_id: id });
        renderFamilyDevices(data.devices || []);
        familyOwnerMessage('已移除家庭通知裝置。', 'success');
      } catch (error) {
        familyOwnerMessage(error?.message || String(error), 'error');
      } finally {
        familyOwnerSetBusy(false);
      }
    });
  });
}

async function refreshFamilyDevices() {
  if (!familyOwnerAuthorized) return;
  try {
    const data = await familyOwnerRequest('list-devices');
    renderFamilyDevices(data.devices || []);
  } catch (error) {
    console.warn('家庭通知裝置讀取失敗', error);
    familyOwnerMessage('家庭通知裝置讀取失敗。', 'error');
  }
}

async function createFamilyInvite() {
  if (familyOwnerBusy || !familyOwnerAuthorized) return;
  const labelInput = document.getElementById('familyDeviceLabel');
  const label = String(labelInput?.value || '家庭 iPhone').trim() || '家庭 iPhone';
  familyOwnerSetBusy(true);
  familyOwnerMessage('正在產生一次性邀請連結…');
  try {
    const data = await familyOwnerRequest('create-invite', { device_label: label });
    const panel = document.getElementById('familyInvitePanel');
    const input = document.getElementById('familyInviteUrl');
    const expiry = document.getElementById('familyInviteExpiry');
    if (input) input.value = data.invite_url || '';
    if (expiry) expiry.textContent = `有效到 ${familyOwnerFormatDate(data.expires_at)}，成功綁定後即失效。`;
    if (panel) panel.hidden = false;
    familyOwnerMessage('邀請連結已產生。傳給家人後，請在對方 iPhone 完成加入主畫面與通知授權。', 'success');
  } catch (error) {
    familyOwnerMessage(error?.message || String(error), 'error');
  } finally {
    familyOwnerSetBusy(false);
  }
}

async function copyFamilyInvite() {
  const input = document.getElementById('familyInviteUrl');
  const value = input?.value || '';
  if (!value) {
    familyOwnerMessage('請先產生邀請連結。');
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    familyOwnerMessage('邀請連結已複製。', 'success');
  } catch (_) {
    input.focus();
    input.select();
    document.execCommand('copy');
    familyOwnerMessage('邀請連結已複製。', 'success');
  }
}

async function shareFamilyInvite() {
  const input = document.getElementById('familyInviteUrl');
  const url = input?.value || '';
  if (!url) {
    familyOwnerMessage('請先產生邀請連結。');
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'PTCG 家庭配對通知',
        text: '請用這個一次性連結，在你的 iPhone 開啟家庭配對通知。',
        url
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyFamilyInvite();
}

async function refreshFamilyOwnerAuth() {
  if (!familyOwnerClient || !familyOwnerEnsureCard()) return;
  const { data } = await familyOwnerClient.auth.getSession();
  familyOwnerSession = data?.session || null;
  familyOwnerAuthorized = false;
  familyOwnerSetBusy(false);

  if (!familyOwnerSession) {
    renderFamilyDevices([]);
    familyOwnerMessage('請先到「個人資料」以授權 Google 帳號登入。');
    return;
  }

  try {
    const { data: allowed, error } = await familyOwnerClient.rpc('can_use_pairing');
    if (error) throw error;
    familyOwnerAuthorized = allowed === true;
    familyOwnerSetBusy(false);
    if (!familyOwnerAuthorized) {
      renderFamilyDevices([]);
      familyOwnerMessage('目前帳號沒有家庭通知管理權限。', 'error');
      return;
    }
    familyOwnerMessage('可產生一次性邀請連結，家庭裝置只會收到配對與最終排名網站推播。');
    await refreshFamilyDevices();
  } catch (error) {
    console.warn('家庭通知權限確認失敗', error);
    familyOwnerAuthorized = false;
    familyOwnerSetBusy(false);
    familyOwnerMessage('家庭通知權限確認失敗。', 'error');
  }
}

async function initFamilyOwnerUI() {
  familyOwnerEnsureStyle();
  if (!familyOwnerEnsureCard() || !window.supabase?.createClient) return false;

  if (!familyOwnerClient) familyOwnerClient = window.supabase.createClient(FAMILY_OWNER_SUPABASE_URL, FAMILY_OWNER_SUPABASE_KEY);
  if (!familyOwnerAuthBound) {
    familyOwnerAuthBound = true;
    familyOwnerClient.auth.onAuthStateChange(() => setTimeout(refreshFamilyOwnerAuth, 0));
  }
  await refreshFamilyOwnerAuth();
  return true;
}

function familyOwnerBoot() {
  familyOwnerEnsureStyle();
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    if (await initFamilyOwnerUI() || tries > 100) clearInterval(timer);
  }, 60);
  initFamilyOwnerUI();
}

document.addEventListener('account-family-view-ready', () => initFamilyOwnerUI());
document.addEventListener('account-family-opened', () => refreshFamilyOwnerAuth());
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', familyOwnerBoot, { once: true });
else familyOwnerBoot();
