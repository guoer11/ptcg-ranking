function installPwaIconMetadata() {
  try {
    let touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!touchIcon) {
      touchIcon = document.createElement('link');
      touchIcon.rel = 'apple-touch-icon';
      touchIcon.setAttribute('sizes', '180x180');
      document.head.appendChild(touchIcon);
    }
    touchIcon.href = './apple-touch-icon.png?v=0.6-r2';

    let appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appTitle) {
      appTitle = document.createElement('meta');
      appTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appTitle);
    }
    appTitle.content = 'PTCG排名';

    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.href = './manifest.webmanifest?v=0.6-r2';
  } catch (error) {
    console.warn('PWA 圖示設定失敗', error);
  }
}

installPwaIconMetadata();

async function repairStalePushSubscription() {
  try {
    if (!identityClient || !identitySession || !identityAuthorized) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const { data, error } = await identityClient
      .from('push_subscriptions')
      .select('endpoint')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle();

    if (error) throw error;
    if (data) return;

    await subscription.unsubscribe();
    console.info('已清除舊版推播訂閱，請重新開啟通知。');
  } catch (error) {
    console.warn('推播訂閱修復檢查失敗', error);
  }
}

const originalUpdatePushUI = window.updatePushUI;
window.updatePushUI = async () => {
  await repairStalePushSubscription();
  if (typeof originalUpdatePushUI === 'function') originalUpdatePushUI();
};
