/* v0.13.1：帳號與通知首頁改為日系 App 分組設定風格。 */
(() => {
  const ICONS = {
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z"/></svg>',
    family: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.8-.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM2.8 19v-1.2c0-3 2.4-5.4 5.4-5.4s5.4 2.4 5.4 5.4V19H2.8Zm11.7 0v-1.1c0-1.8-.7-3.4-1.8-4.6.9-.7 2-1.1 3.3-1.1 2.9 0 5.2 2.3 5.2 5.2V19h-6.7Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0v4.6L4 16v1h16v-1l-2-2.4V9Zm-8.3 10a2.5 2.5 0 0 0 4.6 0H9.7Z"/></svg>',
    line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.7 2 11.2c0 4 3.5 7.3 8.2 8 .3.1.8.2.9.5.1.2.1.6 0 1l-.2 1.2c0 .3-.2 1.3 1.1.7 1.3-.5 6.8-4 9.3-6.9.5-.7.7-1.4.7-2.2C22 8.9 17.5 3 12 3Z"/></svg>',
    deck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h11a2 2 0 0 1 2 2v12h-2V5H6V3Zm-2 4h11a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V7Zm2 2v10h9V9H6Zm2 2h5v2H8v-2Zm0 4h5v2H8v-2Z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.7 2h2.6l.5 2a8.2 8.2 0 0 1 1.8.8l1.8-1 1.8 1.8-1 1.8c.3.6.6 1.2.8 1.8l2 .5v2.6l-2 .5a8.2 8.2 0 0 1-.8 1.8l1 1.8-1.8 1.8-1.8-1a8.2 8.2 0 0 1-1.8.8l-.5 2h-2.6l-.5-2a8.2 8.2 0 0 1-1.8-.8l-1.8 1-1.8-1.8 1-1.8a8.2 8.2 0 0 1-.8-1.8l-2-.5V9.7l2-.5c.2-.6.5-1.2.8-1.8l-1-1.8 1.8-1.8 1.8 1a8.2 8.2 0 0 1 1.8-.8l.5-2ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>'
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
          <span class="account-app-group-icon deck">${ICONS.deck}</span>
          <strong>牌組設定</strong>
        </div>
        <div class="account-app-list">
          ${row(ICONS.deck, 'deck', '牌組清單', '管理牌組偵察下拉選單', 'deck')}
        </div>
      </section>
      <section class="account-app-group account-app-group-notify">
        <div class="account-app-group-head">
          <span class="account-app-group-icon notify">${ICONS.bell}</span>
          <strong>通知設定</strong>
          <span id="accountAppNotifyBadge" class="account-app-status">未開啟</span>
        </div>
        <div class="account-app-list">
          ${row(ICONS.bell, 'web', '網站推播通知', '推播狀態與接收項目', 'web')}
          ${row(ICONS.line, 'line', 'LINE 通知', '綁定狀態 · 測試發送', 'line')}
        </div>
      </section>`;

    home.querySelector('[data-app-target="account"] small').id = 'accountAppProfileStatus';
    home.querySelector('[data-app-target="family"] small').id = 'accountAppFamilyStatus';
    home.querySelector('[data-app-target="deck"] small').id = 'accountAppDeckStatus';
    home.querySelector('[data-app-target="web"] small').id = 'accountAppWebStatus';
    home.querySelector('[data-app-target="line"] small').id = 'accountAppLineStatus';

    home.querySelectorAll('[data-app-target]').forEach(button => {
      button.addEventListener('click', () => {
        window.showAccountHubView?.(button.dataset.appTarget);
        if (button.dataset.appTarget === 'deck') document.dispatchEvent(new CustomEvent('deck-settings-opened'));
      });
    });

    setViewHeading('home');

    const watchTargets = [document.getElementById('pushStatusTitle'), document.getElementById('lineStatusText'), document.getElementById('accountStatusTitle')].filter(Boolean);
    const observer = new MutationObserver(syncStatus);
    watchTargets.forEach(target => observer.observe(target, { childList: true, subtree: true, characterData: true }));
    syncStatus();
    home.dataset.appStyleReady = '1';
    document.dispatchEvent(new CustomEvent('account-hub-ready'));
    return true;
  }

  function ensureStyle() {
    if (document.querySelector('link[data-account-app-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'account-hub-v2.css?v=0.18.0-r3';
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
