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

      /* v2.1.2：排行榜姓名改為「真實姓名(暱稱)」，長名稱整段換行不拆字。 */
      .player-name-line.player-name-combined {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0;
        row-gap: 2px;
        min-width: 0;
        line-height: 1.25;
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

      /* v2.1.2 同功能微調：WCS 圖示移到得分上方，避免姓名區斷行。 */
      .ranking-points-stack {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        vertical-align: middle;
      }
      .ranking-points-stack .wcs-player-icon {
        margin: 0;
        width: 24px;
        height: 28px;
        flex: 0 0 28px;
      }
      .ranking-points-value {
        display: inline-block;
        white-space: nowrap;
        font-weight: 800;
      }

      @media (max-width: 620px) {
        .account-app-version-badge { padding: 5px 8px; font-size: 10px; }
        .player-name-primary.player-primary-long { font-size: 14px; }
        .player-name-primary.player-primary-xlong { font-size: 13px; }
        .player-nickname { font-size: 12px; }
        .player-nickname.player-nickname-long { font-size: 11px; }
        .ranking-points-stack .wcs-player-icon {
          width: 22px;
          height: 26px;
          flex-basis: 26px;
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
      const primaryLength = Array.from(primaryName).length;
      const primaryClass = primaryLength >= 10
        ? ' player-primary-xlong'
        : (primaryLength >= 7 ? ' player-primary-long' : '');
      const nicknameClass = Array.from(nickname).length >= 12 ? ' player-nickname-long' : '';
      const hasNickname = Boolean(
        realName
        && nickname
        && nickname !== realName
        && nickname.toLowerCase() !== playerId.toLowerCase()
      );

      return `
        <div class="player-name-line player-name-combined">
          <strong class="player-name-primary${primaryClass}">${esc(primaryName)}</strong>${hasNickname ? `<span class="player-nickname${nicknameClass}">(${esc(nickname)})</span>` : ''}
        </div>
        ${playerId ? `<div class="hint row-id">${esc(playerId)}</div>` : ''}`;
    };

    function decorateRankingWorldsBadges() {
      if (
        typeof filteredRows !== 'function'
        || typeof priorSeasonFor !== 'function'
        || typeof worldsIconHtml !== 'function'
      ) return;

      const rows = filteredRows();
      const tableRows = Array.from(document.querySelectorAll(
        '#rankingContainer .ranking-table tbody tr:not(.world-cut-line)'
      ));

      tableRows.forEach((tableRow, index) => {
        const row = rows[index];
        const pointsCell = tableRow.children[2];
        if (!row || !pointsCell) return;

        const pointsText = `${esc(row.points ?? '—')} pt`;
        const history = priorSeasonFor(row.player_id);
        if (history?.worlds_2026) {
          pointsCell.innerHTML = `
            <div class="ranking-points-stack">
              ${worldsIconHtml()}
              <strong class="ranking-points-value">${pointsText}</strong>
            </div>`;
        } else {
          pointsCell.innerHTML = `<strong class="ranking-points-value">${pointsText}</strong>`;
        }
      });
    }

    if (typeof renderRanking === 'function') {
      const baseRenderRankingV212 = renderRanking;
      renderRanking = function renderRankingV212(...args) {
        const result = baseRenderRankingV212.apply(this, args);
        decorateRankingWorldsBadges();
        return result;
      };
    }

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