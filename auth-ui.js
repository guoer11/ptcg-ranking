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

function identityAuthButton() {
  return document.getElementById('identityAuthButton');
}

function updateIdentityAuthUI(message = '') {
  const button = identityAuthButton();
  if (!button) return;

  button.classList.toggle('is-signed-in', Boolean(identitySession));
  button.classList.toggle('is-authorized', Boolean(identitySession && identityAuthorized));

  if (!identitySession) {
    button.setAttribute('aria-label', 'Google 登入');
    button.title = message || 'Google 登入';
    if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / PTCG ID / 地區（登入後可搜尋真實姓名）';
    return;
  }

  if (identityAuthorized) {
    button.setAttribute('aria-label', '已登入，點此登出');
    button.title = message || '已登入，點此登出';
    if (searchInput) searchInput.placeholder = '搜尋玩家名稱 / 真實姓名 / PTCG ID / 地區';
  } else {
    button.setAttribute('aria-label', '已登入但沒有姓名檢視權限，點此登出');
    button.title = message || '已登入但沒有姓名檢視權限，點此登出';
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

  updateIdentityAuthUI('正在讀取姓名資料…');
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
    updateIdentityAuthUI(identityAuthorized ? '已登入，點此登出' : '此 Google 帳號未被授權查看姓名，點此登出');
  } catch (error) {
    console.error('私人姓名資料讀取失敗', error);
    clearPrivateIdentities();
    updateIdentityAuthUI('姓名資料讀取失敗，點此登出');
  }

  renderRanking();
}

async function startIdentityAuth() {
  const button = identityAuthButton();
  if (!button) return;

  if (!window.supabase?.createClient) {
    button.disabled = true;
    button.setAttribute('aria-label', 'Google 登入暫時無法使用');
    button.title = 'Google 登入暫時無法使用';
    return;
  }

  identityClient = window.supabase.createClient(IDENTITY_SUPABASE_URL, IDENTITY_SUPABASE_KEY);

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.classList.add('is-busy');

    try {
      if (!identitySession) {
        const { error } = await identityClient.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: IDENTITY_REDIRECT_URL }
        });
        if (error) throw error;
        return;
      }

      await identityClient.auth.signOut();
      identitySession = null;
      clearPrivateIdentities();
      updateIdentityAuthUI();
      renderRanking();
    } catch (error) {
      console.error(identitySession ? '登出失敗' : 'Google 登入失敗', error);
      updateIdentityAuthUI(identitySession ? '登出失敗，請稍後再試' : 'Google 登入失敗，請稍後再試');
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
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
