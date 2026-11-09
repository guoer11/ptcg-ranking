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
  const badgeUrl = 'assets/wcs-2027-badge.svg?v=2.8.0-r6';
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
