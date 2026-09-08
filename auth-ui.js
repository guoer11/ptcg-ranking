const IDENTITY_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const IDENTITY_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
const IDENTITY_REDIRECT_URL = 'https://guoer11.github.io/ptcg-ranking/';

let identitySession = null;
let identityAuthorized = false;
let identityClient = null;

function clearPrivateIdentities() {
  identityData = { updated_at: null, count: 0, players: {} };
  identityAuthorized = false;
}

function identityAuthElements() {
  return {
    state: document.getElementById('identityAuthState'),
    detail: document.getElementById('identityAuthDetail'),
    login: document.getElementById('identityLoginButton'),
    logout: document.getElementById('identityLogoutButton')
  };
}

function updateIdentityAuthUI(message = '') {
  const el = identityAuthElements();
  if (!el.state) return;

  if (!identitySession) {
    el.state.textContent = '真實姓名：登入後顯示';
    el.detail.textContent = message || '使用與比賽紀錄站相同的 Google 帳號';
    el.login.hidden = false;
    el.logout.hidden = true;
    if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / PTCG ID / 地區（登入後可搜尋真實姓名）';
    return;
  }

  el.login.hidden = true;
  el.logout.hidden = false;
  if (identityAuthorized) {
    el.state.textContent = '真實姓名：已解鎖';
    el.detail.textContent = message || `私人姓名資料 ${identityData.count || 0} 位`; 
    if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / 真實姓名 / PTCG ID / 地區';
  } else {
    el.state.textContent = '已登入，但沒有姓名檢視權限';
    el.detail.textContent = message || '排行榜仍可正常使用';
    if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / PTCG ID / 地區';
  }
}

async function loadPrivateIdentities() {
  clearPrivateIdentities();
  if (!identitySession || !identityClient) {
    updateIdentityAuthUI();
    renderRanking();
    return;
  }

  updateIdentityAuthUI('正在讀取私人姓名資料…');
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

      if (error) throw error;
      for (const row of data || []) {
        if (!row.player_id || !row.real_name) continue;
        players[String(row.player_id).toLowerCase()] = { real_name: row.real_name };
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const count = Object.keys(players).length;
    identityData = { updated_at: new Date().toISOString(), count, players };
    identityAuthorized = count > 0;
    updateIdentityAuthUI(identityAuthorized ? `私人姓名資料 ${count} 位` : '此 Google 帳號未被授權查看姓名');
  } catch (error) {
    console.error('私人姓名資料讀取失敗', error);
    clearPrivateIdentities();
    updateIdentityAuthUI('姓名資料讀取失敗，請稍後再試');
  }

  renderRanking();
}

async function startIdentityAuth() {
  const el = identityAuthElements();
  if (!window.supabase?.createClient || !el.state) {
    if (el.state) {
      el.state.textContent = '真實姓名登入暫時無法使用';
      el.detail.textContent = 'Supabase 元件載入失敗';
    }
    return;
  }

  identityClient = window.supabase.createClient(IDENTITY_SUPABASE_URL, IDENTITY_SUPABASE_KEY);

  el.login.addEventListener('click', async () => {
    el.login.disabled = true;
    try {
      const { error } = await identityClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: IDENTITY_REDIRECT_URL }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Google 登入失敗', error);
      updateIdentityAuthUI('Google 登入失敗，請稍後再試');
      el.login.disabled = false;
    }
  });

  el.logout.addEventListener('click', async () => {
    el.logout.disabled = true;
    try {
      await identityClient.auth.signOut();
    } finally {
      identitySession = null;
      clearPrivateIdentities();
      updateIdentityAuthUI();
      renderRanking();
      el.logout.disabled = false;
    }
  });

  const { data } = await identityClient.auth.getSession();
  identitySession = data?.session || null;
  await loadPrivateIdentities();

  identityClient.auth.onAuthStateChange(async (event, session) => {
    identitySession = session || null;
    if (event === 'SIGNED_OUT' || !session) {
      clearPrivateIdentities();
      updateIdentityAuthUI();
      renderRanking();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      await loadPrivateIdentities();
    }
  });
}

document.addEventListener('DOMContentLoaded', startIdentityAuth);
