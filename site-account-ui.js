const SITE_ACCOUNT_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const SITE_ACCOUNT_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';

let identitySession = null;
let identityAuthorized = false;
let identityClient = null;
let siteAccountAuthGeneration = 0;

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

  if (!document.getElementById('pushNotificationButton')) {
    const button = document.createElement('button');
    button.id = 'pushNotificationButton';
    button.className = 'push-notification-icon';
    button.type = 'button';
    button.setAttribute('aria-label', '通知設定');
    button.title = '通知設定';
    button.hidden = true;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5-6.71V3a2 2 0 0 0-4 0v1.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" /></svg>';
    actions.appendChild(button);
  }

  if (!document.getElementById('identityAuthButton')) {
    const button = document.createElement('button');
    button.id = 'identityAuthButton';
    button.className = 'identity-auth-icon';
    button.type = 'button';
    button.setAttribute('aria-label', 'Google 登入');
    button.title = 'Google 登入';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" /></svg>';
    actions.appendChild(button);
  }
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
        <div>
          <h2 id="pushModalTitle">通知設定</h2>
          <small>僅你的授權帳號可設定</small>
        </div>
        <button class="modal-close" type="button" aria-label="關閉" data-close-push-modal>×</button>
      </header>
      <div class="modal-body">
        <div class="push-status-box">
          <strong id="pushStatusTitle">網站推播</strong>
          <span id="pushStatusText">正在檢查通知狀態。</span>
        </div>
        <div class="push-actions">
          <button id="pushToggleButton" class="primary-btn" type="button">開啟通知</button>
          <button id="pushTestButton" class="secondary-btn" type="button" disabled>發送網站測試通知</button>
        </div>
        <div class="push-status-box">
          <strong>LINE 通知</strong>
          <span id="lineStatusText">正在檢查 LINE 連線。</span>
          <span id="lineUsageText">LINE 官方用量：讀取中…</span>
        </div>
        <div class="push-actions">
          <button id="lineTestButton" class="secondary-btn" type="button" disabled>發送 LINE 測試通知</button>
        </div>
        <section class="push-preferences" aria-label="網站推播項目">
          <h3>網站推播項目</h3>
          <label class="push-pref-row"><span>官方排行榜公布 / 更新</span><input id="pushPrefRanking" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增超級球賽事</span><input id="pushPrefGreat" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增高級球賽事</span><input id="pushPrefUltra" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增紀念球賽事</span><input id="pushPrefPremier" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>新增大師球賽事</span><input id="pushPrefMaster" data-push-pref type="checkbox" checked /></label>
          <label class="push-pref-row"><span>官方賽事成績公布</span><input id="pushPrefResults" data-push-pref type="checkbox" /></label>
        </section>
        <p class="push-help">LINE 目前會通知官方排行榜公布／更新與新增聯盟賽事；即時配對監控會在配對公布後另外通知。LINE 用量直接向 LINE 官方 API 查詢，不由網站自行累計。iPhone 網站推播需從「加入主畫面」後的網站圖示開啟。</p>
      </div>
    </section>`;
  const footer = document.querySelector('footer.footer');
  if (footer) footer.before(modal);
  else document.body.appendChild(modal);
}

function siteAccountAuthButton() {
  return document.getElementById('identityAuthButton');
}

function siteAccountSyncUI(message = '') {
  const button = siteAccountAuthButton();
  if (button) {
    button.classList.toggle('is-signed-in', Boolean(identitySession));
    button.classList.toggle('is-authorized', Boolean(identitySession && identityAuthorized));
    button.setAttribute('aria-label', identitySession ? '已登入，點此登出' : 'Google 登入');
    button.title = message || (identitySession ? '已登入，點此登出' : 'Google 登入');
  }

  const pushButton = document.getElementById('pushNotificationButton');
  if (pushButton) pushButton.hidden = !(identitySession && identityAuthorized);

  if (typeof window.updatePushUI === 'function') window.updatePushUI();
  if (typeof window.updateLineUI === 'function') window.updateLineUI();
}

function siteAccountExistingClient() {
  try {
    if (typeof pairingClient !== 'undefined' && pairingClient) return pairingClient;
  } catch (_) {}
  try {
    if (typeof tournamentPairingClient !== 'undefined' && tournamentPairingClient) return tournamentPairingClient;
  } catch (_) {}
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
  siteAccountSyncUI(identitySession ? '正在確認帳號權限…' : 'Google 登入');
  if (!identitySession || !identityClient) return;

  try {
    const { data, error } = await identityClient.rpc('can_use_pairing');
    if (error) throw error;
    if (generation !== siteAccountAuthGeneration || identitySession?.user?.id !== userId) return;
    identityAuthorized = data === true;
    siteAccountSyncUI(identityAuthorized ? '已登入授權帳號，點此登出' : '已登入，點此登出');
  } catch (error) {
    if (generation !== siteAccountAuthGeneration || identitySession?.user?.id !== userId) return;
    console.warn('共用帳號權限確認失敗', error);
    identityAuthorized = false;
    siteAccountSyncUI('登入權限確認失敗，點此登出');
  }
}

async function siteAccountInitAuth() {
  const button = siteAccountAuthButton();
  if (!button) return;

  try {
    await siteAccountEnsureSupabase();
  } catch (error) {
    console.warn(error);
    button.disabled = true;
    button.title = 'Google 登入暫時無法使用';
    return;
  }

  identityClient = siteAccountExistingClient() || window.supabase.createClient(SITE_ACCOUNT_SUPABASE_URL, SITE_ACCOUNT_SUPABASE_KEY);

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.classList.add('is-busy');
    try {
      if (identitySession) {
        await identityClient.auth.signOut();
      } else {
        const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
        const { error } = await identityClient.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo }
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error(identitySession ? '登出失敗' : 'Google 登入失敗', error);
      siteAccountSyncUI(identitySession ? '登出失敗，請稍後再試' : 'Google 登入失敗，請稍後再試');
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
    }
  });

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
    if (document.readyState !== 'loading' && typeof window[initName] === 'function') window[initName]();
  }, { once: true });
  document.body.appendChild(script);
}

function siteAccountInit() {
  siteAccountEnsureStylesheet('site-nav.css?v=0.12.0-r1', 'nav');
  siteAccountEnsureStylesheet('auth-ui.css?v=0.12.0-r1', 'auth');
  siteAccountEnsureStylesheet('push-ui.css?v=0.12.0-r1', 'push');
  siteAccountEnsureControls();
  siteAccountEnsurePushModal();
  siteAccountInitAuth();
}

siteAccountLoadScript('push-ui.js?v=0.12.0-r1', 'initPushUI');
siteAccountLoadScript('line-ui.js?v=0.12.0-r1', 'initLineUI');
document.addEventListener('DOMContentLoaded', siteAccountInit);
