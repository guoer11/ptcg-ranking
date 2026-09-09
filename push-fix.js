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
