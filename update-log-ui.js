(() => {
  'use strict';

  if (window.__updateLogUiLoaded) return;
  window.__updateLogUiLoaded = true;

  const SOURCES = [
    'data/update_log_ranking.json',
    'data/update_log_tournaments.json'
  ];

  const $ = id => document.getElementById(id);

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatTime(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return value || '—';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  function typeLabel(type) {
    return type === 'ranking' ? '排行榜' : '賽事';
  }

  function render(entries) {
    const host = $('updateLogCard');
    if (!host) return;

    if (!entries.length) {
      host.innerHTML = '<div class="update-log-empty">目前還沒有更新紀錄。</div>';
      return;
    }

    host.innerHTML = `
      <div class="update-log-note">只保留最近 5 筆。這裡會記錄資料實際變動；是否發 LINE／網站推播仍依原本通知規則判斷。</div>
      <div class="update-log-list">
        ${entries.map(entry => {
          const details = Array.isArray(entry.details) ? entry.details.filter(Boolean) : [];
          return `
            <article class="update-log-item ${esc(entry.type || '')}">
              <header>
                <span class="update-log-type">${esc(typeLabel(entry.type))}</span>
                <time>${esc(formatTime(entry.updated_at))}</time>
              </header>
              <strong>${esc(entry.summary || entry.title || '資料更新')}</strong>
              ${details.length ? `<ul>${details.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
              <small>${entry.notified ? '符合通知條件' : '未達通知條件'}</small>
            </article>`;
        }).join('')}
      </div>`;
  }

  async function load() {
    const host = $('updateLogCard');
    if (!host) return;
    host.innerHTML = '<div class="update-log-empty">正在讀取最近更新紀錄…</div>';

    try {
      const payloads = await Promise.all(SOURCES.map(async source => {
        const response = await fetch(`${source}?v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return { entries: [] };
        return response.json();
      }));
      const entries = payloads
        .flatMap(payload => Array.isArray(payload?.entries) ? payload.entries : [])
        .sort((a, b) => Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''))
        .slice(0, 5);
      render(entries);
    } catch (error) {
      console.warn('更新紀錄讀取失敗', error);
      host.innerHTML = '<div class="update-log-empty">更新紀錄讀取失敗，請稍後再試。</div>';
    }
  }

  document.addEventListener('update-log-opened', load);
  document.addEventListener('account-update-log-view-ready', load);
})();