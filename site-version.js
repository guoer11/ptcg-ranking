(() => {
  const SITE_VERSION = 'v2.1.2';
  window.PTCG_SITE_VERSION = SITE_VERSION;

  function ensureStyle() {
    if (document.getElementById('ptcgSiteVersionStyle')) return;
    const style = document.createElement('style');
    style.id = 'ptcgSiteVersionStyle';
    style.textContent = `
      .account-app-version-badge {
        flex: 0 0 auto;
        margin-left: auto;
        padding: 5px 9px;
        border-radius: 999px;
        background: #eef3f8;
        color: #667085;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
      }

      /* v2.1.2：姓名、暱稱、WCS 圖示固定同一行。 */
      .player-name-line.player-name-combined {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 0;
        min-width: 0;
        line-height: 1.25;
        white-space: nowrap;
      }
      .player-name-primary {
        white-space: nowrap;
        word-break: keep-all;
        overflow-wrap: normal;
        font-weight: 800;
      }
      .player-nickname {
        white-space: nowrap;
        word-break: keep-all;
        overflow-wrap: normal;
        color: var(--muted);
        font-size: 13px;
        font-weight: 500;
      }
      .wcs-inline-icon {
        display: inline-flex;
        flex: 0 0 auto;
        align-self: center;
        margin-left: 6px;
      }
      .wcs-inline-icon .wcs-player-icon {
        width: 24px;
        height: 28px;
        flex-basis: 24px;
      }

      @media (max-width: 620px) {
        .account-app-version-badge { padding: 5px 8px; font-size: 10px; }
        .player-name-line.player-name-combined { flex-wrap: nowrap; }
        .player-name-combined.player-combined-long .player-name-primary { font-size: 13px; }
        .player-name-combined.player-combined-long .player-nickname { font-size: 11px; }
        .player-name-combined.player-combined-xlong .player-name-primary { font-size: 12px; }
        .player-name-combined.player-combined-xlong .player-nickname { font-size: 10px; }
        .player-nickname { font-size: 12px; }
        .wcs-inline-icon { margin-left: 4px; }
        .wcs-inline-icon .wcs-player-icon {
          width: 20px;
          height: 23px;
          flex-basis: 20px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  window.ensureSiteVersionBadge = function ensureSiteVersionBadge(modal = document.getElementById('pushModal')) {
    if (!modal) return;
    ensureStyle();
    let badge = modal.querySelector('.account-app-version-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'account-app-version-badge';
      const close = modal.querySelector('.modal-header .modal-close');
      if (close) close.before(badge);
      else modal.querySelector('.modal-header')?.appendChild(badge);
    }
    badge.textContent = SITE_VERSION;
    badge.title = `目前版本 ${SITE_VERSION}`;
  };

  function installCompactRankingNames() {
    if (typeof playerNameHtml !== 'function' || typeof identityFor !== 'function') return;

    playerNameHtml = function playerNameHtmlV212(row) {
      const identity = identityFor(row.player_id);
      const realName = String(identity?.real_name || '').trim();
      const nickname = String(row.name || '').trim();
      const playerId = String(row.player_id || '').trim();
      const fallbackName = nickname || playerId || '—';
      const primaryName = realName || fallbackName;
      const hasNickname = Boolean(
        realName
        && nickname
        && nickname !== realName
        && nickname.toLowerCase() !== playerId.toLowerCase()
      );
      const combinedLength = Array.from(primaryName).length + (hasNickname ? Array.from(nickname).length + 2 : 0);
      const combinedClass = combinedLength >= 18
        ? ' player-combined-xlong'
        : (combinedLength >= 13 ? ' player-combined-long' : '');
      const history = typeof priorSeasonFor === 'function' ? priorSeasonFor(row.player_id) : null;
      const worldsIcon = history?.worlds_2026 && typeof worldsIconHtml === 'function'
        ? `<span class="wcs-inline-icon">${worldsIconHtml()}</span>`
        : '';

      return `
        <div class="player-name-line player-name-combined${combinedClass}">
          <strong class="player-name-primary">${esc(primaryName)}</strong>${hasNickname ? `<span class="player-nickname">(${esc(nickname)})</span>` : ''}${worldsIcon}
        </div>
        ${playerId ? `<div class="hint row-id">${esc(playerId)}</div>` : ''}`;
    };

    if (
      typeof renderRanking === 'function'
      && typeof rankingData !== 'undefined'
      && Object.values(rankingData?.groups || {}).some(rows => rows?.length)
    ) {
      renderRanking();
    }
  }

  ensureStyle();
  document.addEventListener('DOMContentLoaded', installCompactRankingNames, { once: true });
})();