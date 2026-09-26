(() => {
  'use strict';

  const SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';

  let client = null;
  let session = null;
  let catalog = [];
  let authBound = false;
  let busy = false;

  const $ = id => document.getElementById(id);

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function ensureStyle() {
    if (document.querySelector('link[data-deck-settings-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'deck-settings-ui.css?v=0.18.0-r1';
    link.dataset.deckSettingsStyle = 'true';
    document.head.appendChild(link);
  }

  function card() {
    return $('deckSettingsCard');
  }

  function ensureCard() {
    const host = card();
    if (!host) return null;
    if (host.dataset.deckSettingsReady === '1') return host;

    host.className = 'deck-settings-card';
    host.innerHTML = `
      <div class="deck-settings-intro">
        <strong>牌組清單</strong>
        <span>先把常見的牌組名稱建好，比賽時「牌組偵察」就能直接用下拉選單快速紀錄。</span>
      </div>
      <div class="deck-settings-add">
        <input id="deckSettingsName" class="search-input" type="text" maxlength="40" placeholder="例如：多龍、忍蛙、索羅亞克" autocomplete="off" />
        <button id="deckSettingsAdd" class="primary-btn" type="button">新增</button>
      </div>
      <div id="deckSettingsMessage" class="deck-settings-message">正在讀取牌組清單…</div>
      <div id="deckSettingsList" class="deck-settings-list"></div>`;
    host.dataset.deckSettingsReady = '1';

    $('deckSettingsAdd')?.addEventListener('click', addDeck);
    $('deckSettingsName')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addDeck();
    });
    return host;
  }

  function setMessage(text = '', type = '') {
    const el = $('deckSettingsMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `deck-settings-message${type ? ` ${type}` : ''}`;
  }

  function setBusy(next) {
    busy = Boolean(next);
    const input = $('deckSettingsName');
    const add = $('deckSettingsAdd');
    if (input) input.disabled = busy || !session;
    if (add) add.disabled = busy || !session;
    document.querySelectorAll('[data-deck-settings-delete]').forEach(button => {
      button.disabled = busy || !session;
    });
  }

  function render() {
    const list = $('deckSettingsList');
    if (!list) return;

    if (!session) {
      list.innerHTML = '<div class="deck-settings-empty">請先到「個人資料」登入 Google 帳號。</div>';
      setMessage('登入後即可管理自己的牌組清單。');
      setBusy(false);
      return;
    }

    if (!catalog.length) {
      list.innerHTML = '<div class="deck-settings-empty">尚未新增牌組。先建立幾個比賽常見的牌組名稱。</div>';
      setMessage('新增後會直接出現在牌組偵察的下拉選單。');
      setBusy(false);
      return;
    }

    list.innerHTML = catalog.map(item => `
      <div class="deck-settings-row">
        <span>${escapeHtml(item.name)}</span>
        <button type="button" data-deck-settings-delete="${item.id}" aria-label="刪除 ${escapeHtml(item.name)}">刪除</button>
      </div>`).join('');

    list.querySelectorAll('[data-deck-settings-delete]').forEach(button => {
      button.addEventListener('click', () => deleteDeck(Number(button.dataset.deckSettingsDelete)));
    });
    setMessage(`已建立 ${catalog.length} 個牌組選項。`, 'success');
    setBusy(false);
  }

  async function loadCatalog() {
    if (!client || !session) {
      catalog = [];
      render();
      return;
    }
    setMessage('正在讀取牌組清單…');
    const { data, error } = await client
      .from('pairing_deck_catalog')
      .select('id,name,sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    catalog = data || [];
    render();
  }

  async function addDeck() {
    if (busy) return;
    const input = $('deckSettingsName');
    const name = String(input?.value || '').trim();
    if (!session) return setMessage('請先登入 Google 帳號。', 'error');
    if (!name) return setMessage('請輸入牌組名稱。', 'error');
    if (catalog.some(item => item.name.toLowerCase() === name.toLowerCase())) {
      return setMessage('這個牌組名稱已經存在。', 'error');
    }

    setBusy(true);
    setMessage('正在新增…');
    const { error } = await client.from('pairing_deck_catalog').insert({
      user_id: session.user.id,
      name,
      sort_order: catalog.length
    });
    if (error) {
      setBusy(false);
      return setMessage(`新增失敗：${error.message}`, 'error');
    }

    if (input) input.value = '';
    await loadCatalog();
    document.dispatchEvent(new CustomEvent('deck-catalog-updated'));
    setMessage(`已新增「${name}」。`, 'success');
  }

  async function deleteDeck(id) {
    if (busy || !session) return;
    const item = catalog.find(entry => Number(entry.id) === Number(id));
    if (!item) return;
    if (!confirm(`刪除牌組「${item.name}」？已經記錄過的玩家牌組不會被刪除。`)) return;

    setBusy(true);
    setMessage('正在刪除…');
    const { error } = await client.from('pairing_deck_catalog').delete().eq('id', id);
    if (error) {
      setBusy(false);
      return setMessage(`刪除失敗：${error.message}`, 'error');
    }

    await loadCatalog();
    document.dispatchEvent(new CustomEvent('deck-catalog-updated'));
    setMessage(`已刪除「${item.name}」。`, 'success');
  }

  async function refreshSession() {
    if (!client || !ensureCard()) return;
    const { data } = await client.auth.getSession();
    session = data?.session || null;
    setBusy(false);
    try {
      await loadCatalog();
    } catch (error) {
      console.warn('牌組設定讀取失敗', error);
      catalog = [];
      render();
      setMessage('牌組清單讀取失敗，請稍後再試。', 'error');
    }
  }

  async function init() {
    ensureStyle();
    if (!ensureCard() || !window.supabase?.createClient) return false;

    if (!client) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    if (!authBound) {
      authBound = true;
      client.auth.onAuthStateChange(() => setTimeout(refreshSession, 0));
    }
    await refreshSession();
    return true;
  }

  function boot() {
    ensureStyle();
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (await init() || tries > 100) clearInterval(timer);
    }, 60);
    init();
  }

  document.addEventListener('account-deck-view-ready', () => init());
  document.addEventListener('account-hub-ready', () => init());
  document.addEventListener('deck-settings-opened', () => refreshSession());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();