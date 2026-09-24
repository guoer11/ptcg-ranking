const IDENTITY_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const IDENTITY_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
const IDENTITY_REDIRECT_URL = 'https://guoer11.github.io/ptcg-ranking/';

let identitySession = null;
let identityAuthorized = false;
let identityClient = null;
let pairingNavRequestId = 0;
let identityLoadRequestId = 0;

const IDENTITY_ACCOUNT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2C5.91 13 3 14.79 3 17v2h10.1a5.9 5.9 0 0 1-.1-1c0-1.96.95-3.7 2.42-4.79A11.2 11.2 0 0 0 9.5 13Zm9.25-2.5a1.25 1.25 0 0 0-2.5 0v.55A3.75 3.75 0 0 0 14 14.5V17l-1 1v.75h7.5V18l-1-1v-2.5a3.75 3.75 0 0 0-2.25-3.45v-.55Zm-1.25 10.25a1.25 1.25 0 0 0 1.2-1h-2.4a1.25 1.25 0 0 0 1.2 1Z"/></svg>';

function currentIdentityUserId() {
  return String(identitySession?.user?.id || '');
}

function pairingNavLink() {
  return document.querySelector('.site-nav a[href="pairing.html"]');
}

function hidePairingNav() {
  const link = pairingNavLink();
  if (link) link.hidden = true;
}

function invalidatePairingNavAccess() {
  pairingNavRequestId += 1;
  hidePairingNav();
}

async function refreshPairingNavAccess() {
  const link = pairingNavLink();
  if (!link) return;

  const requestId = ++pairingNavRequestId;
  const userId = currentIdentityUserId();
  link.hidden = true;
  if (!userId || !identityClient) return;

  try {
    const { data, error } = await identityClient.rpc('can_use_pairing');
    if (requestId !== pairingNavRequestId || currentIdentityUserId() !== userId) return;
    if (error) throw error;
    link.hidden = data !== true;
  } catch (error) {
    if (requestId !== pairingNavRequestId || currentIdentityUserId() !== userId) return;
    console.warn('即時配對權限確認失敗', error);
    link.hidden = true;
  }
}

hidePairingNav();

function clearPrivateIdentities() {
  identityData = { updated_at: null, count: 0, players: {} };
  identityAuthorized = false;
}

function identityAuthButton() {
  return document.getElementById('identityAuthButton');
}

function accountAuthActionButton() {
  return document.getElementById('accountAuthActionButton');
}

function ensureCombinedAccountPanel() {
  document.getElementById('pushNotificationButton')?.remove();
  const button = identityAuthButton();
  if (button) {
    button.innerHTML = IDENTITY_ACCOUNT_ICON;
    button.setAttribute('aria-label', '帳號與通知設定');
    button.title = '帳號與通知設定';
  }

  const modal = document.getElementById('pushModal');
  if (!modal) return;
  const modalTitle = document.getElementById('pushModalTitle');
  if (modalTitle) modalTitle.textContent = '帳號與通知';
  const modalSubtitle = modal.querySelector('.modal-header small');
  if (modalSubtitle) modalSubtitle.textContent = '登入、登出與通知設定集中在這裡';

  const body = modal.querySelector('.modal-body');
  if (!body || document.getElementById('accountAuthActionButton')) return;
  const accountBlock = document.createElement('div');
  accountBlock.innerHTML = `
    <div class="push-status-box">
      <strong id="accountStatusTitle">帳號</strong>
      <span id="accountStatusText">正在檢查登入狀態。</span>
    </div>
    <div class="push-actions">
      <button id="accountAuthActionButton" class="primary-btn" type="button">Google 登入</button>
    </div>`;
  while (accountBlock.firstChild) body.insertBefore(accountBlock.firstChild, body.firstChild);
}

function openAccountModal() {
  const modal = document.getElementById('pushModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  if (typeof window.updatePushUI === 'function') window.updatePushUI();
  if (typeof window.updateLineUI === 'function') window.updateLineUI();
}

function updateAccountPanel(message = '') {
  const title = document.getElementById('accountStatusTitle');
  const text = document.getElementById('accountStatusText');
  const action = accountAuthActionButton();
  if (!title || !text || !action) return;

  if (!identitySession) {
    title.textContent = '尚未登入';
    text.textContent = message || '登入 Google 帳號後，可使用授權功能與通知設定。';
    action.textContent = 'Google 登入';
    action.disabled = false;
    return;
  }

  title.textContent = identityAuthorized ? '已登入授權帳號' : '已登入';
  text.textContent = message || (identityAuthorized
    ? '帳號已驗證，可使用私人姓名、即時配對與通知設定。'
    : '此 Google 帳號目前沒有進階功能權限。');
  action.textContent = '登出';
  action.disabled = false;
}

function updateIdentityTextUI() {
  const lookupDescription = document.getElementById('playerLookupDescription');
  const lookupInput = document.getElementById('playerIdInput');
  const lookupHint = document.getElementById('playerLookupHint');
  const noticeText = document.getElementById('versionNoticeText');

  if (identityAuthorized) {
    if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / 真實姓名 / PTCG ID / 地區';
    if (lookupDescription) lookupDescription.textContent = '輸入真實姓名、暱稱或 PTCG ID。';
    if (lookupInput) lookupInput.placeholder = '姓名 / 暱稱 / PTCG ID';
    if (lookupHint) lookupHint.textContent = '真實姓名搜尋已啟用；若有同名玩家會先列出候選結果。';
    if (noticeText) noticeText.textContent = '排名、積分、暱稱與 PTCG ID 維持公開；真實姓名僅由目前授權帳號讀取。';
    return;
  }

  if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / PTCG ID / 地區';
  if (lookupDescription) lookupDescription.textContent = '輸入暱稱或 PTCG ID。';
  if (lookupInput) lookupInput.placeholder = '暱稱 / PTCG ID';
  if (lookupHint) lookupHint.textContent = '若有多筆相符玩家會先列出候選結果。';
  if (noticeText) noticeText.textContent = '排名、積分、暱稱與 PTCG ID 維持公開。';
}

function refreshPushAuthUI() {
  if (typeof window.updatePushUI === 'function') window.updatePushUI();
  if (typeof window.updateLineUI === 'function') window.updateLineUI();
}

function updateIdentityAuthUI(message = '') {
  const button = identityAuthButton();
  if (!button) return;

  button.classList.toggle('is-signed-in', Boolean(identitySession));
  button.classList.toggle('is-authorized', Boolean(identitySession && identityAuthorized));
  button.setAttribute('aria-label', '帳號與通知設定');
  button.title = identitySession ? '帳號與通知設定（已登入）' : '帳號與通知設定';

  updateAccountPanel(message);
  updateIdentityTextUI();
  refreshPushAuthUI();
  refreshPairingNavAccess();
}

async function loadPrivateIdentities() {
  const requestId = ++identityLoadRequestId;
  const userId = currentIdentityUserId();
  clearPrivateIdentities();

  if (!userId || !identityClient) {
    updateIdentityAuthUI();
    await refreshPairingNavAccess();
    renderRanking();
    return;
  }

  updateIdentityAuthUI('正在確認登入資料…');
  const players = {};
  const pageSize = 1000;
  let from = 0;

  try {
    while (true) {
      const { data, error } = await identityClient
        .from('player_identities')
        .select('player_id, real_name')
        .order('player_id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (requestId !== identityLoadRequestId || currentIdentityUserId() !== userId) return;
      if (error) throw error;
      for (const row of data || []) {
        if (!row.player_id || !row.real_name) continue;
        players[String(row.player_id).toLowerCase()] = { real_name: row.real_name };
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    if (requestId !== identityLoadRequestId || currentIdentityUserId() !== userId) return;
    const count = Object.keys(players).length;
    identityData = { updated_at: new Date().toISOString(), count, players };
    identityAuthorized = count > 0;
    updateIdentityAuthUI();
  } catch (error) {
    if (requestId !== identityLoadRequestId || currentIdentityUserId() !== userId) return;
    console.error('私人資料讀取失敗', error);
    clearPrivateIdentities();
    updateIdentityAuthUI('登入資料讀取失敗，請稍後再試。');
  }

  if (requestId !== identityLoadRequestId || currentIdentityUserId() !== userId) return;
  await refreshPairingNavAccess();
  renderRanking();
}

async function handleAccountAuthAction() {
  const action = accountAuthActionButton();
  if (!action || !identityClient) return;
  action.disabled = true;

  try {
    if (!identitySession) {
      const { error } = await identityClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: IDENTITY_REDIRECT_URL }
      });
      if (error) throw error;
      return;
    }

    invalidatePairingNavAccess();
    identityLoadRequestId += 1;
    await identityClient.auth.signOut();
    identitySession = null;
    clearPrivateIdentities();
    updateIdentityAuthUI();
    await refreshPairingNavAccess();
    renderRanking();
  } catch (error) {
    console.error(identitySession ? '登出失敗' : 'Google 登入失敗', error);
    updateAccountPanel(identitySession ? '登出失敗，請稍後再試。' : 'Google 登入失敗，請稍後再試。');
  } finally {
    action.disabled = false;
  }
}

async function startIdentityAuth() {
  ensureCombinedAccountPanel();
  const button = identityAuthButton();
  if (!button) return;

  button.addEventListener('click', openAccountModal);
  accountAuthActionButton()?.addEventListener('click', handleAccountAuthAction);

  if (!window.supabase?.createClient) {
    button.disabled = true;
    button.title = '帳號功能暫時無法使用';
    updateAccountPanel('Google 登入暫時無法使用。');
    return;
  }

  identityClient = window.supabase.createClient(IDENTITY_SUPABASE_URL, IDENTITY_SUPABASE_KEY);

  const { data } = await identityClient.auth.getSession();
  identitySession = data?.session || null;
  await loadPrivateIdentities();

  identityClient.auth.onAuthStateChange((event, session) => {
    // Do not await Supabase queries inside the auth callback. Supabase holds an
    // internal auth lock while this callback runs; querying here can leave the
    // authorized UI stuck after Google sign-in/token refresh.
    invalidatePairingNavAccess();
    identityLoadRequestId += 1;
    identitySession = session || null;

    if (event === 'SIGNED_OUT' || !session) {
      clearPrivateIdentities();
      updateIdentityAuthUI();
      renderRanking();
      setTimeout(() => refreshPairingNavAccess(), 0);
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      setTimeout(() => loadPrivateIdentities(), 0);
    }
  });
}

document.addEventListener('DOMContentLoaded', startIdentityAuth);
