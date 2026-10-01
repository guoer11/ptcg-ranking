(() => {
  'use strict';

  if (window.__updateLogUiLoaded) return;
  window.__updateLogUiLoaded = true;

  const SOURCES = {
    ranking: 'data/update_log_ranking.json',
    tournaments: 'data/update_log_tournaments.json'
  };
  let cache = { ranking: [], tournaments: [] };

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

  function renderList() {
    const list = $('updateLogList');
    if (!list) return;
    const entries = Object.entries(cache)
      .flatMap(([type, rows]) => rows.map(entry => ({ ...entry, type })))
      .sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))
      .slice(0, 5);

    if (!entries.length) {
      list.innerHTML = '<div class="update-log-empty">目前還沒有更新紀錄。</div>';
      return;
    }

    list.innerHTML = entries.map(entry => {
      const details = Array.isArray(entry.details) ? entry.details.filter(Boolean) : [];
      return `
        <article class="update-log-item ${esc(entry.type)}">
          <header>
            <div class="update-log-meta"><span class="update-log-type">${entry.type === 'ranking' ? '排行榜' : '賽事'}</span><time>${esc(formatTime(entry.updated_at))}</time></div>
            <span class="update-log-notify ${entry.notified ? 'is-notified' : ''}">${entry.notified ? '符合通知條件' : '未達通知條件'}</span>
          </header>
          <strong>${esc(entry.summary || entry.title || '資料更新')}</strong>
          <div class="update-log-source"><span>觸發來源</span><b>${esc(entry.trigger_source || '舊紀錄（未記錄來源）')}</b></div>
          ${details.length ? `<div class="update-log-detail-title">更新細節</div><ul>${details.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="update-log-no-detail">本次只有更新檢查時間／內部狀態，沒有可見資料差異。</p>'}
        </article>`;
    }).join('');
  }

  function renderShell() {
    const host = $('updateLogCard');
    if (!host) return;
    host.innerHTML = `
      <div class="update-log-note">排行榜與賽事更新<strong>合計顯示最新 5 筆</strong>，依更新時間由新到舊排列。</div>
      <div id="updateLogList" class="update-log-list"></div>`;
    renderList();
  }

  async function load() {
    const host = $('updateLogCard');
    if (!host) return;
    host.innerHTML = '<div class="update-log-empty">正在讀取最近更新紀錄…</div>';

    try {
      const [ranking, tournaments] = await Promise.all(
        Object.entries(SOURCES).map(async ([type, source]) => {
          const response = await fetch(`${source}?v=${Date.now()}`, { cache: 'no-store' });
          const payload = response.ok ? await response.json() : { entries: [] };
          return [type, Array.isArray(payload?.entries) ? payload.entries.slice(0, 5) : []];
        })
      );
      cache = Object.fromEntries([ranking, tournaments]);
      renderShell();
    } catch (error) {
      console.warn('更新紀錄讀取失敗', error);
      host.innerHTML = '<div class="update-log-empty">更新紀錄讀取失敗，請稍後再試。</div>';
    }
  }

  document.addEventListener('update-log-opened', load);
  document.addEventListener('account-update-log-view-ready', load);
})();