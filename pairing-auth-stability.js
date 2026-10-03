(() => {
  'use strict';

  if (window.__pairingAuthStabilityLoaded) return;
  window.__pairingAuthStabilityLoaded = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let checkGeneration = 0;
  let retryTimer = 0;
  let lastAuthorizedUserId = '';
  let lastAuthorizedAt = 0;

  function scheduleRetry(delay = 1200) {
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      if (typeof refreshPairingAuthorization === 'function') refreshPairingAuthorization();
    }, delay);
  }

  function setAuthCopy(text) {
    try {
      const el = typeof authCopy === 'function' ? authCopy() : document.getElementById('pairingAuthCopy');
      if (el) el.textContent = text;
    } catch (_) {}
  }

  async function recoverSession() {
    if (!pairingClient?.auth) return null;
    for (const delay of [0, 250, 900]) {
      if (delay) await sleep(delay);
      try {
        const { data, error } = await pairingClient.auth.getSession();
        if (!error && data?.session) return data.session;
      } catch (_) {}
    }
    return null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof initPairingAuth !== 'function' || typeof renderPairingAccess !== 'function') return;

    refreshPairingAuthorization = async function refreshPairingAuthorizationStable() {
      const generation = ++checkGeneration;
      let session = pairingSession;

      if (!session && lastAuthorizedUserId && Date.now() - lastAuthorizedAt < 8000) {
        renderPairingAccess(true);
        setAuthCopy('登入狀態重新確認中…');
        const recovered = await recoverSession();
        if (generation !== checkGeneration) return;
        if (recovered) {
          pairingSession = recovered;
          session = recovered;
        } else {
          scheduleRetry(1000);
          return;
        }
      }

      if (!session || !pairingClient) {
        renderPairingAccess(false, '請先回玩家排行登入你的授權 Google 帳號，再使用即時配對。');
        setAuthCopy('目前尚未登入授權帳號。');
        document.dispatchEvent(new CustomEvent('pairing:auth-ready', { detail: { allowed: false } }));
        return;
      }

      const userId = session.user?.id || '';
      try {
        const { data, error } = await pairingClient.rpc('can_use_pairing');
        if (error) throw error;
        if (generation !== checkGeneration || pairingSession?.user?.id !== userId) return;

        if (data === true) {
          lastAuthorizedUserId = userId;
          lastAuthorizedAt = Date.now();
          renderPairingAccess(true);
          setAuthCopy('已確認授權登入，可使用姓名對照、LINE 與網站推播。');
          await refreshWatchStatus();
          document.dispatchEvent(new CustomEvent('pairing:auth-ready', { detail: { allowed: true } }));
          return;
        }

        lastAuthorizedUserId = '';
        lastAuthorizedAt = 0;
        renderPairingAccess(false, '目前登入的帳號沒有即時配對使用權限。此功能只開放指定的授權帳號。');
        setAuthCopy('目前帳號未授權使用即時配對。');
        document.dispatchEvent(new CustomEvent('pairing:auth-ready', { detail: { allowed: false } }));
      } catch (error) {
        console.warn('即時配對權限確認暫時失敗', error);
        if (generation !== checkGeneration) return;

        if (lastAuthorizedUserId === userId) {
          renderPairingAccess(true);
          setAuthCopy('登入驗證暫時中斷，正在自動重試…');
          scheduleRetry();
          return;
        }

        renderPairingAccess(false, '登入權限驗證暫時失敗，系統正在重新確認，請稍後再試。');
        setAuthCopy('登入權限驗證暫時失敗，正在重試…');
        scheduleRetry();
      }
    };

    initPairingAuth = async function initPairingAuthStable() {
      if (!window.supabase?.createClient) {
        renderPairingAccess(false, '登入服務載入失敗，暫時無法使用即時配對。');
        return;
      }

      pairingClient = window.supabase.createClient(PAIRING_SUPABASE_URL, PAIRING_SUPABASE_KEY);
      try {
        const { data } = await pairingClient.auth.getSession();
        pairingSession = data?.session || null;
      } catch (_) {
        pairingSession = null;
      }
      await refreshPairingAuthorization();

      pairingClient.auth.onAuthStateChange((event, session) => {
        // Do not call Supabase RPCs inside the auth callback itself. On iOS/Safari,
        // token refreshes can overlap across tabs/PWA windows and briefly emit a null session.
        window.setTimeout(async () => {
          if (session) {
            pairingSession = session;
            await refreshPairingAuthorization();
            return;
          }

          if (event === 'SIGNED_OUT' && lastAuthorizedUserId) {
            renderPairingAccess(true);
            setAuthCopy('登入狀態重新確認中…');
            const recovered = await recoverSession();
            if (recovered) {
              pairingSession = recovered;
              await refreshPairingAuthorization();
              return;
            }
          }

          pairingSession = null;
          lastAuthorizedUserId = '';
          lastAuthorizedAt = 0;
          await refreshPairingAuthorization();
        }, 0);
      });
    };
  }, { once: true });
})();
