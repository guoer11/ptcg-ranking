(() => {
  'use strict';

  const SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';

  let client = null;
  let session = null;
  let catalog = [];
  let authBound = false;
  let busy = false;
  let admin = false;
  let editing = null;

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
    link.href = 'deck-settings-ui.css?v=3.4.0';
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
    if (input) input.disabled = busy || !session || !admin;
    if (add) add.disabled = busy || !session || !admin;
    document.querySelectorAll('[data-deck-settings-rule],[data-deck-settings-delete],[data-deck-settings-edit],[data-deck-settings-save],[data-deck-settings-cancel],#deckSettingsRenameName').forEach(button => {
      button.disabled = busy || !session || !admin;
    });
  }

  function render() {
    const list = $('deckSettingsList');
    if (!list) return;

    if (!session || !admin) {
      list.innerHTML = session?'<div class="deck-settings-empty">牌組設定僅限管理者使用。</div>':'<div class="deck-settings-empty">請先到「個人資料」登入 Google 帳號。</div>';
      setMessage(session?'僅管理者可管理共用牌組清單。':'登入後即可管理共用牌組清單。');
      setBusy(false);
      return;
    }

    if (!catalog.length) {
      list.innerHTML = '<div class="deck-settings-empty">尚未新增牌組。先建立幾個比賽常見的牌組名稱。</div>';
      setMessage('新增後會直接出現在牌組偵察的下拉選單。');
      setBusy(false);
      return;
    }

    list.innerHTML = catalog.map(item => Number(item.id)===editing?`
      <div class="deck-settings-row deck-settings-row-editing">
        <input id="deckSettingsRenameName" class="search-input" maxlength="40" value="${escapeHtml(item.name)}" aria-label="修改牌組名稱" autocomplete="off">
        <div class="deck-settings-row-actions"><button type="button" data-deck-settings-save="${item.id}">儲存</button><button type="button" data-deck-settings-cancel>取消</button></div>
      </div>`:`
      <div class="deck-settings-row">
        <span>${escapeHtml(item.name)}</span>
        <div class="deck-settings-row-actions"><button type="button" data-deck-settings-rule="${item.id}" aria-label="官方牌組辨識規則 ${escapeHtml(item.name)}">辨識規則</button><button type="button" data-deck-settings-edit="${item.id}" aria-label="修改 ${escapeHtml(item.name)}">修改</button><button type="button" data-deck-settings-delete="${item.id}" aria-label="刪除 ${escapeHtml(item.name)}">刪除</button></div>
      </div>`).join('');

    list.querySelectorAll('[data-deck-settings-rule]').forEach(button=>button.addEventListener('click',()=>{if(busy||!admin||!session)return;const item=catalog.find(x=>String(x.id)===button.dataset.deckSettingsRule);if(item)void window.PTCGOfficialDecks?.openRules(client,item);}));
    list.querySelectorAll('[data-deck-settings-delete]').forEach(button => {
      button.addEventListener('click', () => deleteDeck(Number(button.dataset.deckSettingsDelete)));
    });
    list.querySelectorAll('[data-deck-settings-edit]').forEach(button=>button.addEventListener('click',()=>{if(busy||!admin)return;editing=Number(button.dataset.deckSettingsEdit);render();const input=$('deckSettingsRenameName');input?.focus();input?.select();}));
    list.querySelector('[data-deck-settings-save]')?.addEventListener('click',renameDeck);
    list.querySelector('[data-deck-settings-cancel]')?.addEventListener('click',()=>{editing=null;render();});
    $('deckSettingsRenameName')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void renameDeck();}else if(event.key==='Escape'){editing=null;render();}});
    setMessage(`已建立 ${catalog.length} 個牌組選項。`, 'success');
    setBusy(false);
  }

  async function loadCatalog() {
    if (!client || !session || !admin) {
      catalog = [];
      render();
      return;
    }
    setMessage('正在讀取牌組清單…');
    const { data, error } = await client
      .from('pairing_deck_catalog')
      .select('id,name,sort_order')
      .eq('user_id',session.user.id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    catalog = data || [];
    render();
  }

  async function renameDeck(){
    if(busy||!admin||!session)return;
    const item=catalog.find(row=>Number(row.id)===editing);
    const name=String($('deckSettingsRenameName')?.value||'').trim();
    if(!item)return;
    if(!name||Array.from(name).length>40)return setMessage('請輸入 1 至 40 字的牌組名稱。','error');
    if(name===item.name){editing=null;render();return;}
    if(catalog.some(row=>Number(row.id)!==editing&&row.name.toLowerCase()===name.toLowerCase()))return setMessage('這個牌組名稱已經存在。','error');
    if(!confirm(`將「${item.name}」修改為「${name}」？已記錄的共用及歷史牌組也會一併更名。`))return;
    setBusy(true);setMessage('正在修改牌組名稱…');
    try{
      const {data,error}=await client.rpc('rename_pairing_deck',{p_id:item.id,p_expected_name:item.name,p_new_name:name});
      if(error)throw error;
      editing=null;await loadCatalog();
      document.dispatchEvent(new CustomEvent('deck-catalog-updated'));
      setMessage(`已修改為「${name}」，同步更新 ${data?.scouts||0} 筆玩家牌組、${data?.pairs||0} 筆雙牌組紀錄。`,'success');
    }catch(error){setMessage(`修改失敗：${error?.message||error}`,'error');}
    finally{setBusy(false);}
  }

  async function addDeck() {
    if (busy || !admin) return;
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
    if (busy || !session || !admin) return;
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
    admin=false;editing=null;
    setBusy(false);
    try {
      if(session){const access=await client.rpc('pairing_access_role');if(access.error)throw access.error;admin=access.data==='admin';}
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

    if (!client) client = (typeof identityClient!=='undefined'&&identityClient)||(typeof pairingClient!=='undefined'&&pairingClient)||null;
    if(!client)return false;
    if (!authBound) {
      authBound = true;
      client.auth.onAuthStateChange(() => setTimeout(()=>{if(!document.querySelector('[data-account-view="deck"]')?.hidden)void refreshSession();}, 0));
    }
    if(!document.querySelector('[data-account-view="deck"]')?.hidden)await refreshSession();
    return true;
  }

  function boot() {
    ensureStyle();
    let tries = 0;
    let pending=false;
    const timer = setInterval(async () => {
      if(pending)return;pending=true;tries += 1;
      try{if(await init()||tries>100)clearInterval(timer);}finally{pending=false;}
    }, 150);
  }

  document.addEventListener('account-deck-view-ready', () => init());
  document.addEventListener('account-hub-ready', () => init());
  document.addEventListener('deck-settings-opened', () => init());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();