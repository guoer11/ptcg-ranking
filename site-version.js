(() => {
  const SITE_VERSION = 'v2.2.2';
  window.PTCG_SITE_VERSION = SITE_VERSION;

  function ensurePlayerBadgeAssets() {
    if (!document.getElementById('ptcgPlayerBadgesCss')) {
      const link = document.createElement('link');
      link.id = 'ptcgPlayerBadgesCss';
      link.rel = 'stylesheet';
      link.href = 'player-badges.css?v=2.2.0-r4';
      document.head.appendChild(link);
    }
    if (!document.getElementById('ptcgPlayerBadgesJs')) {
      const script = document.createElement('script');
      script.id = 'ptcgPlayerBadgesJs';
      script.src = 'player-badges.js?v=2.2.0-r4';
      script.defer = true;
      document.head.appendChild(script);
    }
  }

  function ensurePairingV222Hotfix() {
    if (!/\/pairing\.html$/i.test(window.location.pathname)) return;
    if (document.getElementById('ptcgPairingV222Hotfix')) return;
    const script = document.createElement('script');
    script.id = 'ptcgPairingV222Hotfix';
    script.src = 'pairing-hotfix-v2.2.2.js?v=2.2.2-r1';
    script.defer = true;
    document.head.appendChild(script);
  }

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

      /* 姓名維持正常大小；WCS 初始圖示由既有資料產生，再由玩家標記列統一整理。 */
      .player-name-line.player-name-combined {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0;
        row-gap: 2px;
        min-width: 0;
        max-width: 100%;
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
        font-size: inherit;
        font-weight: 500;
      }
      .player-id-line {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        margin-top: 4px;
      }
      .player-id-line .row-id {
        margin: 0;
        white-space: nowrap;
      }
      .player-id-line .wcs-id-icon {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
      }
      .player-id-line .wcs-id-icon .wcs-player-icon {
        width: 20px;
        height: 23px;
        flex: 0 0 20px;
        margin: 0;
      }

      @media (max-width: 620px) {
        .account-app-version-badge { padding: 5px 8px; font-size: 10px; }
        .ranking-table td:nth-child(2) {
          min-width: 0;
          overflow: hidden;
        }
        .player-name-line.player-name-combined {
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }
        .player-name-primary {
          font-size: inherit;
          max-width: 100%;
        }
        .player-name-primary.player-primary-mobile-wrap {
          display: block;
          flex: 0 0 100%;
          width: 100%;
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          font-size: 13px;
          line-height: 1.18;
        }
        .player-nickname.player-nickname-latin {
          font-size: 11px;
          line-height: 1.15;
        }
        .player-nickname.player-nickname-latin.player-nickname-long {
          font-size: 10px;
          letter-spacing: -0.15px;
        }
        .player-nickname.player-nickname-mobile-block {
          display: block;
          flex: 0 0 100%;
          width: 100%;
          max-width: 100%;
          margin-top: 1px;
          font-size: 11px;
          line-height: 1.18;
          letter-spacing: -0.1px;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .player-id-line {
          gap: 5px;
          margin-top: 3px;
          max-width: 100%;
          overflow: hidden;
        }
        .player-id-line .wcs-id-icon .wcs-player-icon {
          width: 19px;
          height: 22px;
          flex-basis: 19px;
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
      const nicknameIsLatin = /[A-Za-z]/.test(nickname);
      const nicknameLength = Array.from(nickname).length;
      const primaryLength = Array.from(primaryName).length;
      const primaryClass = !realName && primaryLength >= 8 ? ' player-primary-mobile-wrap' : '';
      const nicknameClass = nicknameIsLatin
        ? ` player-nickname-latin${nicknameLength >= 13 ? ' player-nickname-long' : ''}`
        : (nicknameLength >= 8 ? ' player-nickname-mobile-block' : '');
      const history = typeof priorSeasonFor === 'function' ? priorSeasonFor(row.player_id) : null;
      const worldsIcon = history?.worlds_2026 && typeof worldsIconHtml === 'function'
        ? `<span class="wcs-id-icon">${worldsIconHtml()}</span>`
        : '';

      return `
        <div class="player-name-line player-name-combined">
          <strong class="player-name-primary${primaryClass}">${esc(primaryName)}</strong>${hasNickname ? `<span class="player-nickname${nicknameClass}">(${esc(nickname)})</span>` : ''}
        </div>
        ${playerId ? `<div class="player-id-line"><span class="hint row-id">${esc(playerId)}</span>${worldsIcon}</div>` : ''}`;
    };

    if (
      typeof renderRanking === 'function'
      && typeof rankingData !== 'undefined'
      && Object.values(rankingData?.groups || {}).some(rows => rows?.length)
    ) {
      renderRanking();
    }
  }

  ensurePlayerBadgeAssets();
  ensurePairingV222Hotfix();
  ensureStyle();
  document.addEventListener('DOMContentLoaded', installCompactRankingNames, { once: true });
})();