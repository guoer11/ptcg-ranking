(() => {
  'use strict';
  // Completely separate from player-badges.js. Never update or remove existing badge rows.
  if (window.__wcs2027StandaloneReady) return;
  window.__wcs2027StandaloneReady = true;
  const invitees = {
    'tw35477925': { name: '李育帆', place: '冠軍' },
    'tw18638755': { name: '劉仕晟', place: '亞軍' },
    'tw59096586': { name: '吳明峰', place: '四強' },
    'tw42912360': { name: '謝秉辰', place: '四強' },
    'tw65322738': { name: '許雲翔', place: '冠軍' },
    'tw03103631': { name: '顏紹同', place: '亞軍' },
    'tw81124094': { name: '李宥緯', place: '四強' },
    'tw13175197': { name: '陳永恩', place: '四強' },
    'tw46877625': { name: '陳鉑岳', place: '冠軍' },
    'tw25007020': { name: '許辰銨', place: '亞軍' },
    'tw75543412': { name: '吳季東', place: '四強' },
    'tw63041398': { name: '楊子霆', place: '四強' }
  };
  const badgeUrl = 'data:image/png;base64,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';
  const normalize = value => (String(value || '').match(/tw\d+/i)?.[0] || '').toLowerCase();
  let scheduled = false;

  function badge() {
    const node = document.createElement('span');
    node.className = 'wcs2027-independent-icon';
    node.title = 'WCS 2027 邀請資格';
    node.setAttribute('aria-label', 'WCS 2027 邀請資格');
    const image = document.createElement('img');
    image.src = badgeUrl;
    image.alt = 'WCS 2027';
    image.width = 28;
    image.height = 28;
    image.addEventListener('error', () => {
      if (image.isConnected) image.replaceWith(Object.assign(document.createElement('span'), { textContent: '🏆27' }));
    }, { once: true });
    node.append(image);
    return node;
  }

  function decorateRanking() {
    const root = document.getElementById('rankingContainer');
    if (!root) return;
    root.querySelectorAll('.ranking-table tbody tr').forEach(row => {
      const cell = row.querySelector('td:nth-child(2)');
      if (!cell) return;
      const id = normalize(cell.querySelector('.row-id')?.textContent);
      const existing = cell.querySelector('.wcs2027-independent-icon');
      if (!invitees[id]) {
        existing?.remove();
        return;
      }
      if (existing) return;
      // Place outside .player-badge-row so the original badge script cannot overwrite it.
      const anchor = cell.querySelector('.player-id-line') || cell.querySelector('.row-id')?.parentElement || cell;
      const mark = badge();
      if (anchor === cell) cell.append(mark);
      else anchor.insertAdjacentElement('afterend', mark);
    });
  }

  function decorateModal() {
    const modal = document.getElementById('playerModal');
    const body = document.getElementById('playerModalBody');
    if (!modal?.classList.contains('open') || !body || body.querySelector('.modal-loading')) return;
    const id = normalize(body.querySelector('.player-id-value')?.textContent || document.getElementById('playerModalTitle')?.textContent);
    const info = invitees[id];
    const old = body.querySelector('.wcs2027-independent-detail');
    if (!info) { old?.remove(); return; }
    if (old?.dataset.playerId === id) return;
    old?.remove();
    const box = document.createElement('section');
    box.className = 'wcs2027-independent-detail';
    box.dataset.playerId = id;
    const heading = document.createElement('div');
    heading.className = 'wcs2027-independent-detail-heading';
    heading.append(badge(), Object.assign(document.createElement('strong'), { textContent: 'WCS 2027 邀請資格' }));
    const desc = document.createElement('div');
    desc.textContent = '2026–27 紀念球聯盟賽 · ' + info.place + ' · ' + info.name;
    const note = document.createElement('small');
    note.textContent = id + ' · 已取得邀請資格，不代表確認出席';
    box.append(heading, desc, note);
    const anchor = body.querySelector('.player-stat-grid') || body.firstElementChild;
    if (anchor) anchor.insertAdjacentElement('beforebegin', box);
    else body.prepend(box);
  }

  function render() {
    scheduled = false;
    decorateRanking();
    decorateModal();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(render);
  }
  function start() {
    const ranking = document.getElementById('rankingContainer');
    const modalBody = document.getElementById('playerModalBody');
    // Observe only child additions. Our own nodes are stable, so this settles after one refresh.
    if (ranking) new MutationObserver(schedule).observe(ranking, { childList: true, subtree: true });
    if (modalBody) new MutationObserver(schedule).observe(modalBody, { childList: true, subtree: true });
    const modal = document.getElementById('playerModal');
    if (modal) new MutationObserver(schedule).observe(modal, { attributes: true, attributeFilter: ['class'] });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
