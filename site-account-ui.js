const SITE_ACCOUNT_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const SITE_ACCOUNT_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';

let identitySession = null;
let identityAuthorized = false;
let identityClient = null;
let siteAccountAuthGeneration = 0;

const SITE_ACCOUNT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2C5.91 13 3 14.79 3 17v2h10.1a5.9 5.9 0 0 1-.1-1c0-1.96.95-3.7 2.42-4.79A11.2 11.2 0 0 0 9.5 13Zm9.25-2.5a1.25 1.25 0 0 0-2.5 0v.55A3.75 3.75 0 0 0 14 14.5V17l-1 1v.75h7.5V18l-1-1v-2.5a3.75 3.75 0 0 0-2.25-3.45v-.55Zm-1.25 10.25a1.25 1.25 0 0 0 1.2-1h-2.4a1.25 1.25 0 0 0 1.2 1Z"/></svg>';

function siteAccountEnsureStylesheet(href, marker) {
  if (document.querySelector(`link[data-site-account-style="${marker}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.siteAccountStyle = marker;
  document.head.appendChild(link);
}

function siteAccountEnsureControls() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  let actions = nav.querySelector('.site-nav-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'site-nav-actions';
    nav.appendChild(actions);
  }
  document.getElementById('pushNotificationButton')?.remove();
  let button = document.getElementById('identityAuthButton');
  if (!button) {
    button = document.createElement('button');
    button.id = 'identityAuthButton';
    button.className = 'identity-auth-icon';
    button.type = 'button';
    actions.appendChild(button);
  }
  button.setAttribute('aria-label', '帳號與通知設定');
  button.title = '帳號與通知設定';
  button.innerHTML = SITE_ACCOUNT_ICON;
}

function siteAccountEnsurePushModal() {
  if (document.getElementById('pushModal')) return;
  const modal = document.createElement('div');
  modal.id = 'pushModal';
  modal.className = 'modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-push-modal></div>
    <section class="modal-card push-modal-card" role="dialog" aria-modal="true" aria-labelledby="pushModalTitle">
      <header class="modal-header">
        <div><h2 id="pushModalTitle">帳號與通知</h2><small>選擇要調整的項目</small></div>
        <button class="modal-close" type="button" aria-label="關閉" data-close-push-modal>×</button>
      </header>
      <div class="modal-body">
        <div class="push-status-box"><strong id="accountStatusTitle">帳號</strong><span id="accountStatusText">正在檢查登入狀態。</span></div>
        <div class="push-actions"><button id="accountAuthActionButton" class="primary-btn" type="button">Google 登入</button></div>
        <div class="push-status-box"><strong id="pushStatusTitle">網站推播</strong><span id="pushStatusText">正在檢查通知狀態。</span></div>
        <div class="push-actions"><button id="pushToggleButton" class="primary-btn" type="button">開啟通知</button><button id="pushTestButton" class="secondary-btn" type="button" disabled>發送網站測試通知</button></div>
        <div class="push-status-box"><strong>LINE 通知</strong><span id="lineStatusText">正在檢查 LINE 連線。</span><span id="lineUsageText">LINE 官方用量：讀取中…</span></div>
        <div class="push-actions"><button id="lineTestButton" class="secondary-btn" type="button" disabled>發送 LINE 測試通知</button></div>
        <section class="push-preferences" aria-label="網站推播項目">
          <h3>網站推播項目</h3>
          <label class="push-pref-row"><span>官方排行榜公布 / 更新</span><input id="pushPrefRanking" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增超級球賽事</span><input id="pushPrefGreat" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增高級球賽事</span><input id="pushPrefUltra" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增紀念球賽事</span><input id="pushPrefPremier" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增大師球賽事</span><input id="pushPrefMaster" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>官方賽事成績公布</span><input id="pushPrefResults" data-push-pref type="checkbox" /></label>
        </section>
        <p class="push-help">網站推播與 LINE 狀態都集中在這個視窗。即時配對監控會在配對公布後另外通知；iPhone 網站推播需從「加入主畫面」後的網站圖示開啟。</p>
      </div>
    </section>`;
  const footer = document.querySelector('footer.footer');
  if (footer) footer.before(modal);
  else document.body.appendChild(modal);
}

function siteAccountAuthButton() { return document.getElementById('identityAuthButton'); }
function siteAccountActionButton() { return document.getElementById('accountAuthActionButton'); }

function siteAccountOpenPanel() {
  if (typeof window.openAccountNotificationModal === 'function') window.openAccountNotificationModal();
  else {
    const modal = document.getElementById('pushModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  if (typeof window.updatePushUI === 'function') window.updatePushUI();
  if (typeof window.updateLineUI === 'function') window.updateLineUI();
}

function siteAccountSyncPanel(message = '') {
  const title = document.getElementById('accountStatusTitle');
  const text = document.getElementById('accountStatusText');
  const action = siteAccountActionButton();
  if (!title || !text || !action) return;
  if (!identitySession) {
    title.textContent = '尚未登入';
    text.textContent = message || '登入 Google 帳號後，可使用授權功能與通知設定。';
    action.textContent = 'Google 登入';
    action.disabled = false;
    return;
  }
  title.textContent = identityAuthorized ? '已登入授權帳號' : '已登入';
  text.textContent = message || (identityAuthorized ? '帳號已驗證，可使用即時配對與通知設定。' : '此 Google 帳號目前沒有進階功能權限。');
  action.textContent = '登出';
  action.disabled = false;
}

function siteAccountSyncUI(message = '') {
  const button = siteAccountAuthButton();
  if (button) {
    button.classList.toggle('is-signed-in', Boolean(identitySession));
    button.classList.toggle('is-authorized', Boolean(identitySession && identityAuthorized));
    button.setAttribute('aria-label', '帳號與通知設定');
    button.title = identitySession ? '帳號與通知設定（已登入）' : '帳號與通知設定';
  }
  siteAccountSyncPanel(message);
  if (typeof window.updatePushUI === 'function') window.updatePushUI();
  if (typeof window.updateLineUI === 'function') window.updateLineUI();
}

function siteAccountExistingClient() {
  try { if (typeof pairingClient !== 'undefined' && pairingClient) return pairingClient; } catch (_) {}
  try { if (typeof tournamentPairingClient !== 'undefined' && tournamentPairingClient) return tournamentPairingClient; } catch (_) {}
  return null;
}

async function siteAccountEnsureSupabase() {
  if (window.supabase?.createClient) return;
  const existing = [...document.scripts].find(script => /@supabase\/supabase-js/i.test(script.src));
  if (!existing) throw new Error('Supabase SDK 尚未載入');
  await new Promise((resolve, reject) => {
    if (window.supabase?.createClient) return resolve();
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', () => reject(new Error('Supabase SDK 載入失敗')), { once: true });
  });
}

async function siteAccountRefreshAuthorization() {
  const generation = ++siteAccountAuthGeneration;
  const userId = identitySession?.user?.id || '';
  identityAuthorized = false;
  siteAccountSyncUI(identitySession ? '正在確認帳號權限…' : '');
  if (!identitySession || !identityClient) return;
  try {
    const { data, error } = await identityClient.rpc('can_use_pairing');
    if (error) throw error;
    if (generation !== siteAccountAuthGeneration || identitySession?.user?.id !== userId) return;
    identityAuthorized = data === true;
    siteAccountSyncUI();
  } catch (error) {
    if (generation !== siteAccountAuthGeneration || identitySession?.user?.id !== userId) return;
    console.warn('共用帳號權限確認失敗', error);
    identityAuthorized = false;
    siteAccountSyncUI('登入權限確認失敗，請稍後再試。');
  }
}

async function siteAccountHandleAuthAction() {
  const action = siteAccountActionButton();
  if (!action || !identityClient) return;
  action.disabled = true;
  try {
    if (identitySession) await identityClient.auth.signOut();
    else {
      const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      const { error } = await identityClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
    }
  } catch (error) {
    console.error(identitySession ? '登出失敗' : 'Google 登入失敗', error);
    siteAccountSyncPanel(identitySession ? '登出失敗，請稍後再試。' : 'Google 登入失敗，請稍後再試。');
  } finally { action.disabled = false; }
}

async function siteAccountInitAuth() {
  const button = siteAccountAuthButton();
  if (!button) return;
  button.addEventListener('click', siteAccountOpenPanel);
  siteAccountActionButton()?.addEventListener('click', siteAccountHandleAuthAction);
  try { await siteAccountEnsureSupabase(); }
  catch (error) {
    console.warn(error);
    button.disabled = true;
    button.title = '帳號功能暫時無法使用';
    siteAccountSyncPanel('Google 登入暫時無法使用。');
    return;
  }
  identityClient = siteAccountExistingClient() || window.supabase.createClient(SITE_ACCOUNT_SUPABASE_URL, SITE_ACCOUNT_SUPABASE_KEY);
  const { data } = await identityClient.auth.getSession();
  identitySession = data?.session || null;
  await siteAccountRefreshAuthorization();
  identityClient.auth.onAuthStateChange((_event, session) => {
    identitySession = session || null;
    identityAuthorized = false;
    ++siteAccountAuthGeneration;
    siteAccountSyncUI();
    setTimeout(siteAccountRefreshAuthorization, 0);
  });
}

function siteAccountLoadScript(src, initName) {
  if ([...document.scripts].some(script => script.src.includes(src.split('?')[0]))) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = false;
  script.addEventListener('load', () => {
    if (document.readyState !== 'loading' && initName && typeof window[initName] === 'function') window[initName]();
  }, { once: true });
  document.body.appendChild(script);
}

function siteAccountInit() {
  siteAccountEnsureStylesheet('site-nav.css?v=0.13.1-r1', 'nav');
  siteAccountEnsureStylesheet('auth-ui.css?v=0.13.1-r1', 'auth');
  siteAccountEnsureStylesheet('push-ui.css?v=0.13.1-r1', 'push');
  siteAccountEnsureControls();
  siteAccountEnsurePushModal();
  siteAccountInitAuth();
}

siteAccountLoadScript('push-ui.js?v=0.18.0-r2', 'initPushUI');
siteAccountLoadScript('line-ui.js?v=0.13.1-r1', 'initLineUI');
siteAccountLoadScript('account-hub-v2.js?v=0.18.0-r3', '');
siteAccountLoadScript('family-owner-ui.js?v=0.13.1-r1', '');
document.addEventListener('DOMContentLoaded', siteAccountInit);
