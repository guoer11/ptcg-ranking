/* v0.13.1：帳號與通知首頁改為日系 App 分組設定風格。 */
(() => {
  const ICONS = {
    account: '<svg class="cute-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.1"/><path d="M6.5 19c.5-3.2 2.5-5 5.5-5s5 1.8 5.5 5"/><path d="M18.4 5.4l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2Z" class="cute-spark"/></svg>',
    family: '<svg class="cute-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.2" cy="8.4" r="2.7"/><circle cx="16.2" cy="8.9" r="2.2"/><path d="M3.8 19c.3-3.1 2-4.8 4.4-4.8s4.1 1.7 4.4 4.8"/><path d="M13.2 18.8c.3-2.4 1.5-3.7 3.3-3.7 1.7 0 3 1.2 3.4 3.4"/><path d="M12 12.6s-1.9-1-1.9-2.3c0-.8.6-1.4 1.4-1.4.5 0 .9.2 1.2.7.3-.5.7-.7 1.2-.7.8 0 1.4.6 1.4 1.4 0 1.3-1.9 2.3-1.9 2.3L12 13.4l-1.4-.8Z" class="cute-heart"/></svg>',
    bell: '<svg class="cute-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.1 15.8h9.8l-1.2-1.7V10a3.7 3.7 0 0 0-7.4 0v4.1l-1.2 1.7Z"/><path d="M10 18.1c.4 1.2 1.1 1.8 2 1.8s1.6-.6 2-1.8"/><path d="M17.7 5.4l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4.4-.9Z" class="cute-spark"/></svg>',
    notifySettings: '<img class="account-q-icon" src="assets/q-icons/notification-settings.webp?v=0.19.1-r2" alt="" aria-hidden="true" />',
    web: '<img class="account-q-icon" src="assets/q-icons/web-push.webp?v=0.19.1-r2" alt="" aria-hidden="true" />',
    line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.7 2 11.2c0 4 3.5 7.3 8.2 8 .3.1.8.2.9.5.1.2.1.6 0 1l-.2 1.2c0 .3-.2 1.3 1.1.7 1.3-.5 6.8-4 9.3-6.9.5-.7.7-1.4.7-2.2C22 8.9 17.5 3 12 3Z"/></svg>',
    deckGroup: '<img class="account-q-icon" src="assets/q-icons/deck-settings.webp?v=0.19.1-r2" alt="" aria-hidden="true" />',
    deckList: '<img class="account-q-icon" src="assets/q-icons/deck-list.webp?v=0.19.1-r2" alt="" aria-hidden="true" />',
    updateGroup: '<img class="account-q-icon" src="assets/q-icons/data-update.webp?v=0.19.1-r2" alt="" aria-hidden="true" />',
    updateLog: '<img class="account-q-icon" src="assets/q-icons/update-log.webp?v=0.19.1-r2" alt="" aria-hidden="true" />',
    gear: '<svg class="cute-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.8 4.2h4.4l.5 1.8c.5.2 1 .4 1.4.8l1.7-.7 2.1 3.6-1.4 1.1c.1.6.1 1.1 0 1.7l1.4 1.1-2.1 3.6-1.7-.7c-.4.3-.9.6-1.4.8l-.5 1.8H9.8l-.5-1.8c-.5-.2-1-.4-1.4-.8l-1.7.7-2.1-3.6 1.4-1.1a7 7 0 0 1 0-1.7L4.1 9.7l2.1-3.6 1.7.7c.4-.3.9-.6 1.4-.8l.5-1.8Z"/><circle cx="12" cy="11.7" r="2.4" class="cute-hole"/></svg>'
  };

  function row(icon, tone, title, subtitle, target) {
    return `<button class="account-app-row" type="button" data-app-target="${target}">
      <span class="account-app-row-icon ${tone}">${icon}</span>
      <span class="account-app-row-copy"><strong>${title}</strong><small>${subtitle}</small></span>
      <span class="account-app-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  function syncStatus() {
    const badge = document.getElementById('accountAppNotifyBadge');
    const webCopy = document.getElementById('accountAppWebStatus');
    const lineCopy = document.getElementById('accountAppLineStatus');
    const accountCopy = document.getElementById('accountAppProfileStatus');
    const pushTitle = document.getElementById('pushStatusTitle');
    const lineText = document.getElementById('lineStatusText');
    const accountTitle = document.getElementById('accountStatusTitle');

    const webEnabled = /已開啟|已啟用/.test(pushTitle?.textContent || '');
    if (badge) {
      badge.textContent = webEnabled ? '● 已開啟' : '未開啟';
      badge.classList.toggle('is-on', webEnabled);
    }
    if (webCopy) webCopy.textContent = webEnabled ? '已開啟 · 對戰表、最終排名、重要消息' : (pushTitle?.textContent || '推播狀態與接收項目');
    if (lineCopy) lineCopy.textContent = lineText?.textContent || '綁定狀態 · 測試發送';
    if (accountCopy) accountCopy.textContent = accountTitle?.textContent || 'Google 帳號 · 登入 / 登出';
  }

  function addFamilyView(body) {
    if (body.querySelector('[data-account-view="family"]')) return;
    const view = document.createElement('section');
    view.className = 'account-detail-view';
    view.dataset.accountView = 'family';
    view.hidden = true;
    view.innerHTML = `
      <button class="account-back-row" type="button" data-account-back>‹ <span>帳號與通知</span></button>
      <div id="familyNotificationCard" class="account-family-manager">
        <div class="family-owner-empty">家庭通知裝置載入中…</div>
      </div>`;
    body.appendChild(view);
    view.querySelector('[data-account-back]')?.addEventListener('click', () => window.showAccountHubView?.('home'));
    document.dispatchEvent(new CustomEvent('account-family-view-ready'));
  }

  function addDeckView(body) {
    if (body.querySelector('[data-account-view="deck"]')) return;
    const view = document.createElement('section');
    view.className = 'account-detail-view';
    view.dataset.accountView = 'deck';
    view.hidden = true;
    view.innerHTML = `
      <button class="account-back-row" type="button" data-account-back>‹ <span>帳號與通知</span></button>
      <div id="deckSettingsCard"><div class="deck-settings-empty">牌組設定載入中…</div></div>`;
    body.appendChild(view);
    view.querySelector('[data-account-back]')?.addEventListener('click', () => window.showAccountHubView?.('home'));
    document.dispatchEvent(new CustomEvent('account-deck-view-ready'));
  }

  function addUpdateLogView(body) {
    if (body.querySelector('[data-account-view="updates"]')) return;
    const view = document.createElement('section');
    view.className = 'account-detail-view';
    view.dataset.accountView = 'updates';
    view.hidden = true;
    view.innerHTML = `
      <button class="account-back-row" type="button" data-account-back>‹ <span>帳號與通知</span></button>
      <div id="updateLogCard"><div class="update-log-empty">更新紀錄載入中…</div></div>`;
    body.appendChild(view);
    view.querySelector('[data-account-back]')?.addEventListener('click', () => window.showAccountHubView?.('home'));
    document.dispatchEvent(new CustomEvent('account-update-log-view-ready'));
  }

  function splitNotificationViews(body) {
    const notifications = body.querySelector('[data-account-view="notifications"]');
    if (!notifications || body.querySelector('[data-account-view="line"]')) return;

    const back = notifications.querySelector('[data-account-back]');
    const labels = [...notifications.querySelectorAll('.account-detail-label')];
    const webStatus = document.getElementById('pushStatusTitle')?.closest('.push-status-box');
    const webActions = document.getElementById('pushToggleButton')?.closest('.push-actions');
    const lineStatus = document.getElementById('lineStatusText')?.closest('.push-status-box');
    const lineActions = document.getElementById('lineTestButton')?.closest('.push-actions');
    const prefs = notifications.querySelector('.push-preferences');
    const help = notifications.querySelector('.push-help');

    notifications.dataset.accountView = 'web';
    if (back) back.querySelector('span').textContent = '帳號與通知';
    labels.forEach(label => label.remove());
    if (webStatus) notifications.appendChild(webStatus);
    if (webActions) notifications.appendChild(webActions);
    if (prefs) notifications.appendChild(prefs);
    if (help) notifications.appendChild(help);

    const lineView = document.createElement('section');
    lineView.className = 'account-detail-view';
    lineView.dataset.accountView = 'line';
    lineView.hidden = true;
    lineView.innerHTML = '<button class="account-back-row" type="button" data-account-back>‹ <span>帳號與通知</span></button>';
    if (lineStatus) lineView.appendChild(lineStatus);
    if (lineActions) lineView.appendChild(lineActions);
    body.appendChild(lineView);
    lineView.querySelector('[data-account-back]')?.addEventListener('click', () => window.showAccountHubView?.('home'));
  }

  function setViewHeading(name) {
    const modal = document.getElementById('pushModal');
    const title = document.getElementById('pushModalTitle');
    const subtitle = modal?.querySelector('.modal-header small');
    const headings = {
      home: ['帳號與通知', '個人資料、家庭共享與通知設定'],
      account: ['個人資料', 'Google 帳號與登入狀態'],
      family: ['管理家庭通知裝置', '邀請、分享與移除家人的通知裝置'],
      deck: ['牌組設定', '管理牌組偵察的下拉選單'],
      updates: ['最近更新紀錄', '排行榜與賽事各保留最近 5 筆資料變動'],
      web: ['網站推播通知', '推播狀態與接收項目'],
      line: ['LINE 通知', '連線狀態與測試發送']
    };
    const [heading, copy] = headings[name] || headings.home;
    if (title) title.textContent = heading;
    if (subtitle) subtitle.textContent = copy;
    window.ensureSiteVersionBadge?.(modal);
  }

  function enhance() {
    const modal = document.getElementById('pushModal');
    const body = modal?.querySelector('.modal-body');
    const home = body?.querySelector('[data-account-view="home"]');
    if (!modal || !body || !home || home.dataset.appStyleReady === '1') return false;

    splitNotificationViews(body);
    addFamilyView(body);
    addDeckView(body);
    addUpdateLogView(body);

    if (!window.__accountAppShowWrapped && typeof window.showAccountHubView === 'function') {
      const originalShow = window.showAccountHubView;
      window.showAccountHubView = name => { originalShow(name); setViewHeading(name); };
      window.__accountAppShowWrapped = true;
    }

    home.className = 'account-hub-view account-app-home';
    home.innerHTML = `
      <section class="account-app-group account-app-group-account">
        <div class="account-app-group-head">
          <span class="account-app-group-icon account">${ICONS.gear}</span>
          <strong>帳號設定</strong>
        </div>
        <div class="account-app-list">
          ${row(ICONS.account, 'account', '個人資料', 'Google 帳號 · 登入 / 登出', 'account')}
          ${row(ICONS.family, 'family', '家庭共享', '管理家庭通知裝置', 'family')}
        </div>
      </section>
      <section class="account-app-group account-app-group-deck">
        <div class="account-app-group-head">
          <span class="account-app-group-icon deck">${ICONS.deckGroup}</span>
          <strong>牌組設定</strong>
        </div>
        <div class="account-app-list">
          ${row(ICONS.deckList, 'deck', '牌組清單', '管理牌組偵察下拉選單', 'deck')}
        </div>
      </section>
      <section class="account-app-group account-app-group-update">
        <div class="account-app-group-head">
          <span class="account-app-group-icon update">${ICONS.updateGroup}</span>
          <strong>資料更新</strong>
        </div>
        <div class="account-app-list">
          ${row(ICONS.updateLog, 'update', '最近更新紀錄', '排行榜 5 筆 · 賽事 5 筆', 'updates')}
        </div>
      </section>
      <section class="account-app-group account-app-group-notify">
        <div class="account-app-group-head">
          <span class="account-app-group-icon notify">${ICONS.notifySettings}</span>
          <strong>通知設定</strong>
          <span id="accountAppNotifyBadge" class="account-app-status">未開啟</span>
        </div>
        <div class="account-app-list">
          ${row(ICONS.web, 'web', '網站推播通知', '推播狀態與接收項目', 'web')}
          ${row(ICONS.line, 'line', 'LINE 通知', '綁定狀態 · 測試發送', 'line')}
        </div>
      </section>`;

    home.querySelector('[data-app-target="account"] small').id = 'accountAppProfileStatus';
    home.querySelector('[data-app-target="family"] small').id = 'accountAppFamilyStatus';
    home.querySelector('[data-app-target="deck"] small').id = 'accountAppDeckStatus';
    home.querySelector('[data-app-target="updates"] small').id = 'accountAppUpdateStatus';
    home.querySelector('[data-app-target="web"] small').id = 'accountAppWebStatus';
    home.querySelector('[data-app-target="line"] small').id = 'accountAppLineStatus';

    home.querySelectorAll('[data-app-target]').forEach(button => {
      button.addEventListener('click', () => {
        window.showAccountHubView?.(button.dataset.appTarget);
        if (button.dataset.appTarget === 'deck') document.dispatchEvent(new CustomEvent('deck-settings-opened'));
        if (button.dataset.appTarget === 'updates') document.dispatchEvent(new CustomEvent('update-log-opened'));
      });
    });

    setViewHeading('home');

    const watchTargets = [document.getElementById('pushStatusTitle'), document.getElementById('lineStatusText'), document.getElementById('accountStatusTitle')].filter(Boolean);
    const observer = new MutationObserver(syncStatus);
    watchTargets.forEach(target => observer.observe(target, { childList: true, subtree: true, characterData: true }));
    syncStatus();
    home.dataset.appStyleReady = '1';
    ensureDeckSettingsScript();
    ensureUpdateLogScript();
    document.dispatchEvent(new CustomEvent('account-hub-ready'));
    return true;
  }

  function ensureDeckSettingsScript() {
    if ([...document.scripts].some(script => script.src.includes('deck-settings-ui.js'))) return;
    const script = document.createElement('script');
    script.src = 'deck-settings-ui.js?v=0.18.0-r1';
    script.defer = true;
    document.body.appendChild(script);
  }

  function ensureUpdateLogScript() {
    if ([...document.scripts].some(script => script.src.includes('update-log-ui.js'))) return;
    const script = document.createElement('script');
    script.src = 'update-log-ui.js?v=0.19.0-r3';
    script.defer = true;
    document.body.appendChild(script);
  }

  function ensureStyle() {
    if (document.querySelector('link[data-account-app-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'account-hub-v2.css?v=0.19.1-r2';
    link.dataset.accountAppStyle = 'true';
    document.head.appendChild(link);
  }

  function boot() {
    ensureStyle();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (enhance() || tries > 80) clearInterval(timer);
    }, 50);
    enhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
