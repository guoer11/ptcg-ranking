const LINE_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-line';

const lineStatusText = () => document.getElementById('lineStatusText');
const lineTestButton = () => document.getElementById('lineTestButton');

function lineSetStatus(text) {
  if (lineStatusText()) lineStatusText().textContent = text;
}

function lineSetBusy(busy) {
  if (lineTestButton()) lineTestButton().disabled = busy;
}

async function lineRequest(action) {
  if (!identitySession?.access_token) throw new Error('請先以授權帳號登入');
  const response = await fetch(LINE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${identitySession.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'LINE 通知服務回應失敗');
  return data;
}

async function lineRefreshStatus() {
  if (!identityAuthorized || !identitySession) {
    lineSetStatus('請先以授權帳號登入。');
    lineSetBusy(true);
    return;
  }
  lineSetBusy(true);
  try {
    const data = await lineRequest('status');
    if (data.configured) {
      lineSetStatus('LINE 通知已連線。官方排行榜或新增聯盟賽事有變動時會傳送給你。');
      lineSetBusy(false);
    } else {
      lineSetStatus('LINE Secret 尚未設定完整。');
    }
  } catch (error) {
    console.error('LINE 狀態讀取失敗', error);
    lineSetStatus(error?.message || String(error));
  }
}

async function lineHandleTest() {
  if (!identityAuthorized || !identitySession) {
    lineSetStatus('請先以授權帳號登入。');
    return;
  }
  lineSetBusy(true);
  lineSetStatus('正在發送 LINE 測試通知…');
  try {
    await lineRequest('test');
    lineSetStatus('LINE 測試通知已送出，請查看你的 LINE。');
  } catch (error) {
    console.error('LINE 測試通知失敗', error);
    lineSetStatus(`LINE 測試失敗：${error?.message || String(error)}`);
  } finally {
    lineSetBusy(false);
  }
}

function initLineUI() {
  lineTestButton()?.addEventListener('click', lineHandleTest);
  document.getElementById('pushNotificationButton')?.addEventListener('click', () => {
    setTimeout(lineRefreshStatus, 50);
  });
  lineRefreshStatus();
}

window.updateLineUI = lineRefreshStatus;
document.addEventListener('DOMContentLoaded', initLineUI);
