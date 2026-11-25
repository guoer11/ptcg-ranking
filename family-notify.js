const FAMILY_NOTIFY_FUNCTION_URL = 'https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-family-push';
const FAMILY_INVITE_STORAGE_KEY = 'ptcgFamilyInviteToken';
const FAMILY_LINKED_STORAGE_KEY = 'ptcgFamilyPushLinked';
const FAMILY_MATCH_STORAGE_KEY = 'ptcgFamilyLatestMatch';
const FAMILY_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
const FAMILY_PREF_KEY='ptcgFamilyDevicePreferencesV250';
let familyPrefs=null;
try{familyPrefs=JSON.parse(localStorage.getItem(FAMILY_PREF_KEY)||'null');}catch(_){}
function familyAllowedPlayer(id){
  if(familyPrefs?.revoked)return false;
  if(familyPrefs?.player_filter_mode!=='custom')return true;
  return (familyPrefs.allowed_player_ids||[]).includes(String(id||'').match(/tw\d{1,16}\b/i)?.[0]?.toLowerCase());
}
function familyFilterSummary(data){
  if(!data)return null;
  if(Array.isArray(data.players)){
    const players=data.players.filter(p=>familyAllowedPlayer(p.player_id));
    if(!players.length)return null;
    if(players.length===1){const p=players[0];return {...data,...p,players:undefined,rank:p.rank||'',player_id:p.player_id};}
    return {...data,players};
  }
  return familyAllowedPlayer(data.player_id||data.player)?data:null;
}
function familySetPreferences(device,players){
  const previous=familyPrefs;
  familyPrefs=device;
  try{localStorage.setItem(FAMILY_PREF_KEY,JSON.stringify(device));}catch(_){}
  const info=document.getElementById('familyDevicePreferences');
  if(info){
    info.hidden=false;
    document.getElementById('familyDeviceName').textContent=device.device_label||'家庭裝置';
    document.getElementById('familyDevicePlayers').textContent=device.player_filter_mode==='all'?'全部追蹤玩家':(players||[]).map(p=>p.name?p.name+' · '+p.id:p.id).join('、')||(device.allowed_player_ids||[]).join('、');
    document.getElementById('familyDeviceStatus').textContent='通知設定由家庭管理者統一管理。';
  }
  const changed=JSON.stringify([previous?.player_filter_mode,previous?.allowed_player_ids])!==JSON.stringify([device.player_filter_mode,device.allowed_player_ids]);
  if(changed){
    localStorage.removeItem('ptcgFamilyRoundContextV230');localStorage.removeItem('ptcgFamilyRoundHistoryV230');
    const current=familySummaryFromParams(new URLSearchParams(window.location.search));
    const filtered=familyFilterSummary(current||familyLoadStoredSummary());
    if(filtered)familyStoreSummary(filtered);else localStorage.removeItem(FAMILY_MATCH_STORAGE_KEY);
    if(current&&device.player_filter_mode==='custom'){
      // Remove old unfiltered notification query data; retain only the allowed summary locally.
      history.replaceState(null,'',window.location.pathname);
    }
    familyRenderMatchSummary();
    document.dispatchEvent(new CustomEvent('ptcg-family-preferences-updated'));
  }
}
let familyStatusRequest=null;
async function familyRefreshDeviceStatus(){
  if(familyStatusRequest)return familyStatusRequest;
  familyStatusRequest=(async()=>{
    if(!familyPushSupported())return;
    const info=document.getElementById('familyDevicePreferences');
    try{
      const registration=await navigator.serviceWorker.getRegistration('./');
      const sub=await registration?.pushManager.getSubscription();
      if(!sub)throw Error('找不到推播訂閱，請管理者重新邀請');
      const payload=sub.toJSON();
      const data=await familyFunctionRequest('device-status',{endpoint:payload.endpoint,auth:payload.keys?.auth});
      familySetPreferences(data.device,data.players);
    }catch(e){
      if(info){info.hidden=false;document.getElementById('familyDeviceStatus').textContent=e.message||'無法讀取最新裝置設定';}
      if(/未綁定|已移除|未授權|找不到推播訂閱/.test(e.message)){
        familyPrefs={revoked:true};localStorage.setItem(FAMILY_PREF_KEY,JSON.stringify(familyPrefs));
        for(const k of [FAMILY_LINKED_STORAGE_KEY,FAMILY_MATCH_STORAGE_KEY,'ptcgFamilyRoundContextV230','ptcgFamilyRoundHistoryV230'])localStorage.removeItem(k);
        familySetState('家庭通知未啟用','請管理者重新產生邀請連結。','error');
        document.getElementById('familyMatchSummary').hidden=true;
        document.getElementById('familyRoundQuery').hidden=true;
        const b=familyNotifyButton();if(b){b.disabled=true;b.textContent='請重新綁定';}
        document.dispatchEvent(new CustomEvent('ptcg-family-preferences-updated'));
      }
    }
  })().finally(()=>{familyStatusRequest=null;});
  return familyStatusRequest;
}

const familyNotifyCard = () => document.querySelector('.family-notify-card');
const familyNotifyTitle = () => document.getElementById('familyNotifyTitle');
const familyNotifyStatus = () => document.getElementById('familyNotifyStatus');
const familyNotifyButton = () => document.getElementById('familyNotifyEnableButton');
const familyNotifyHint = () => document.getElementById('familyNotifyHint');

function familyEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function familyBadgeAttr(value){
  const id=String(value||'').match(/tw\d{1,16}\b/i)?.[0]?.toLowerCase();
  return id?' data-family-badge-id="'+familyEscape(id)+'"':'';
}
function familySummaryFromParams(params) {
  const type = params.get('type') || '';
  if (type !== 'round' && type !== 'final') return null;
  if(params.has('players')){
    try{
      const encoded=params.get('players');
      if(!encoded||encoded.length>12000)return null;
      const bytes=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const players=JSON.parse(new TextDecoder().decode(bytes));
      if(!Array.isArray(players)||players.length<2||players.length>5||players.some(c=>!c||!/^tw\d{1,16}$/.test(c.player_id))||new Set(players.map(c=>c.player_id)).size!==players.length)return null;
      return {type,round:params.get('round')||'—',players,official:params.get('official')||'',saved_at:new Date().toISOString()};
    }catch(_){return null;}
  }

  if (type === 'final') {
    return {
      type: 'final',
      player: params.get('player') || '—',
      rank: params.get('rank') || '—',
      official: params.get('official') || '',
      saved_at: new Date().toISOString()
    };
  }

  return {
    type: 'round',
    round: params.get('round') || '—',
    player: params.get('player') || '—',
    player_id: params.get('player_id') || '',
    opponent_id: params.get('opponent_id') || '',
    table: params.get('table') || '—',
    opponent: params.get('opponent') || '—',
    deck: params.get('deck') || '',
    possible_deck: params.get('possible_deck') || '',
    previous_deck: params.get('previous_deck') || '',
    ttl_score: params.get('ttl_score') || '',
    official: params.get('official') || '',
    saved_at: new Date().toISOString()
  };
}

function familyLoadStoredSummary() {
  try {
    const raw = localStorage.getItem(FAMILY_MATCH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || (value.type !== 'round' && value.type !== 'final')) return null;

    const savedAt = Date.parse(value.saved_at || '');
    if (!Number.isFinite(savedAt) || Date.now() - savedAt >= FAMILY_MATCH_TTL_MS) {
      localStorage.removeItem(FAMILY_MATCH_STORAGE_KEY);
      return null;
    }
    return value;
  } catch (_) {
    localStorage.removeItem(FAMILY_MATCH_STORAGE_KEY);
    return null;
  }
}

function familyStoreSummary(summary) {
  try {
    localStorage.setItem(FAMILY_MATCH_STORAGE_KEY, JSON.stringify(summary));
  } catch (_) {}
}

function familyRenderMatchSummary() {
  const params = new URLSearchParams(window.location.search);
  const querySummary = familyFilterSummary(familySummaryFromParams(params));
  if (querySummary) familyStoreSummary(querySummary);
  const data = querySummary || familyFilterSummary(familyLoadStoredSummary());
  if (!data) {const summary=document.getElementById('familyMatchSummary');if(summary)summary.hidden=true;return false;}

  const summary = document.getElementById('familyMatchSummary');
  const title = document.getElementById('familyMatchTitle');
  const badge = document.getElementById('familyMatchBadge');
  const eyebrow = document.getElementById('familyMatchEyebrow');
  const grid = document.getElementById('familyMatchGrid');
  const officialLink = document.getElementById('familyOfficialLink');
  if (!summary || !title || !badge || !eyebrow || !grid || !officialLink) return false;

  const player = data.player || '—';
  const official = data.official || '';

  if(Array.isArray(data.players)&&data.players.length>1){
    eyebrow.textContent=data.type==='final'?'多位玩家成績':'多位玩家配對';
    title.textContent=data.type==='final'?'最終排名':'Round '+data.round;
    badge.textContent=data.players.length+' 位玩家';
    const cell=(label,value,id='')=>'<div'+familyBadgeAttr(id)+'><span>'+familyEscape(label)+'</span><strong>'+familyEscape(value||'—')+'</strong></div>';
    grid.innerHTML=data.players.map(c=>{
      const deckLabel=c.deck?'已記錄牌組':c.possible_deck?'可能牌組':c.previous_deck?'上次比賽牌組':'對手牌組';
      const detail=c.final?cell('最終排名','第 '+c.rank+' 名'):c.waiting?cell('狀態',data.type==='final'?'等待最終排名':'本輪尚未找到配對'):cell('桌號',c.table)+cell('TtlScore',c.ttl_score)+cell('對手',c.opponent,c.opponent_id||c.opponent)+cell(deckLabel,c.deck||c.possible_deck||c.previous_deck||'尚未記錄');
      return '<article class="family-match-wide family-multi-player"><div class="family-multi-name"'+familyBadgeAttr(c.player_id)+'><h3>'+familyEscape(c.player)+'</h3></div><div class="family-multi-grid">'+detail+'</div></article>';
    }).join('');
    officialLink.textContent=data.type==='final'?'開啟官方排名':'開啟官方配對';
    const roundPanel=document.getElementById('familyRoundQuery');if(roundPanel)roundPanel.hidden=true;
    if(official&&/^https:\/\/tcg\.sfc-jpn\.jp\//i.test(official)){officialLink.href=official;officialLink.hidden=false;}else officialLink.hidden=true;
    summary.hidden=false;return true;
  }

  if (data.type === 'final') {
    const rank = data.rank || '—';
    eyebrow.textContent = querySummary ? '比賽完成' : '最近結果';
    title.textContent = '最終排名';
    badge.textContent = 'Final rank';
    grid.innerHTML = `
      <article${familyBadgeAttr(data.player_id||player)}><span>玩家</span><strong>${familyEscape(player)}</strong></article>
      <article><span>最終排名</span><strong>第 ${familyEscape(rank)} 名</strong></article>`;
    officialLink.textContent = '開啟官方排名';
  } else {
    const round = data.round || '—';
    const table = data.table || '—';
    const opponent = data.opponent || '—';
    const deck = data.deck || '';
    const possibleDeck = data.possible_deck || '';
    const previousDeck = data.previous_deck || '';
    const ttlScore = data.ttl_score || '讀取中…';
    const deckLabel = deck ? '已記錄牌組' : (possibleDeck ? '可能牌組' : (previousDeck ? '上次比賽牌組' : '對手牌組'));
    const deckValue = deck || possibleDeck || previousDeck || '查詢中…';

    eyebrow.textContent = querySummary ? '最新配對' : '最近一次配對';
    title.textContent = `Round ${round}`;
    badge.textContent = `Round ${round}`;
    grid.innerHTML = `
      <article class="family-match-wide family-table-card"><span>桌號</span><strong>${familyEscape(table)}</strong></article>
      <article class="family-player-card"${familyBadgeAttr(data.player_id||player)}><span>玩家</span><strong>${familyEscape(player)}</strong></article>
      <article class="family-score-card"><span>TtlScore</span><strong>${familyEscape(ttlScore)}</strong></article>
      <article class="family-opponent-card"${familyBadgeAttr(data.opponent_id||opponent)}><span>對手</span><strong>${familyEscape(opponent)}</strong></article>
      <article class="family-deck-card"><span>${familyEscape(deckLabel)}</span><strong>${familyEscape(deckValue)}</strong></article>
      <article class="family-match-wide family-source-card"><span>來源</span><strong>TCG マイスター</strong></article>`;
    officialLink.textContent = '開啟官方配對';
  }

  if (official && /^https:\/\/tcg\.sfc-jpn\.jp\//i.test(official)) {
    officialLink.href = official;
    officialLink.hidden = false;
  } else {
    officialLink.hidden = true;
  }

  summary.hidden = false;
  return true;
}

async function familyHandleServiceWorkerMessage(event) {
  const message = event?.data || {};
  if (message.type !== 'ptcg-family-update' || !message.url) return;

  try {
    const target = new URL(message.url, window.location.origin);
    if (target.origin !== window.location.origin || !/\/family-notify\.html$/i.test(target.pathname)) return;

    history.replaceState(null, '', `${target.pathname}${target.search}${target.hash}`);
    const linked = localStorage.getItem(FAMILY_LINKED_STORAGE_KEY) === '1';
    if(linked)await familyRefreshDeviceStatus();
    const rendered = familyRenderMatchSummary();
    if (!rendered) return;

    if (linked && !familyPrefs?.revoked) {
      familySetState('家庭通知已啟用', '收到新的配對通知，畫面已自動更新，不需要重新開啟 App。', 'success');
    }
  } catch (_) {}
}

function familyIsIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}

function familyIsStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function familyPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function familySetState(title, status, type = '') {
  if (familyNotifyTitle()) familyNotifyTitle().textContent = title;
  if (familyNotifyStatus()) familyNotifyStatus().textContent = status;
  familyNotifyCard()?.classList.toggle('is-success', type === 'success');
  familyNotifyCard()?.classList.toggle('is-error', type === 'error');
}

function familySetBusy(busy) {
  const button = familyNotifyButton();
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? '正在設定…' : '開啟配對通知';
}

function familyBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function familyFunctionRequest(action, extra = {}) {
  const response = await fetch(FAMILY_NOTIFY_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '家庭通知服務回應失敗');
  return data;
}

async function familyGetSubscription() {
  const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) return subscription;

  const keyData = await familyFunctionRequest('public-key');
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: familyBase64ToUint8Array(keyData.publicKey)
  });
  return subscription;
}

async function enableFamilyPush() {
  if (!familyPushSupported()) throw new Error('這個瀏覽器目前不支援網站推播');
  if (familyIsIOS() && !familyIsStandalone()) throw new Error('iPhone 請先加入主畫面，再從主畫面圖示重新開啟');

  const token = localStorage.getItem(FAMILY_INVITE_STORAGE_KEY) || '';
  if (!token) throw new Error('找不到有效邀請資料，請請家人重新產生邀請連結');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? '通知權限已被拒絕，請到手機或瀏覽器設定重新允許' : '尚未允許通知');
  }

  const subscription = await familyGetSubscription();
  const payload = subscription.toJSON();
  const data = await familyFunctionRequest('subscribe', { token, subscription: payload, device_platform:familyIsIOS()?'ios':/Android/i.test(navigator.userAgent)?'android':'other' });

  localStorage.setItem(FAMILY_LINKED_STORAGE_KEY, '1');
  localStorage.removeItem(FAMILY_INVITE_STORAGE_KEY);
  history.replaceState(null,'',window.location.pathname);
  await familyRefreshDeviceStatus();
  if(familyPrefs?.revoked)throw Error('裝置綁定驗證失敗，請重新邀請');
  familySetState('家庭通知已啟用', data.confirmation_sent
    ? '設定完成。剛剛已送出一則確認推播；之後 Round 配對與最終排名都會通知這支裝置。'
    : '設定完成。之後 Round 配對與最終排名都會通知這支裝置。', 'success');
  if (familyNotifyButton()) {
    familyNotifyButton().disabled = true;
    familyNotifyButton().textContent = '已開啟通知';
  }
  if (familyNotifyHint()) familyNotifyHint().textContent = '不需要 Google 登入；這支裝置只接收配對與最終排名網站推播。';
}

async function handleFamilyEnable() {
  familySetBusy(true);
  familySetState('正在設定通知', '請稍候，正在向這支裝置 建立網站推播訂閱。');
  try {
    await enableFamilyPush();
  } catch (error) {
    familySetState('設定失敗', error?.message || String(error), 'error');
    familySetBusy(false);
  }
}

async function initFamilyNotify() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', familyHandleServiceWorkerMessage);
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      registration.update().catch(() => {});
    } catch (error) {
      console.warn('家庭通知 Service Worker 更新失敗', error);
    }
  }

  const params = new URLSearchParams(window.location.search);
  if(!familyIsIOS()){
    const steps=document.querySelectorAll('#familyNotifySteps article');
    if(steps[0])steps[0].querySelector('div').innerHTML='<b>開啟 Chrome</b><span>Android 可直接使用 Chrome，亦可選擇加入主畫面。</span>';
    if(steps[1])steps[1].querySelector('div').innerHTML='<b>開啟配對通知</b><span>按下方按鈕並允許網站通知。</span>';
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&localStorage.getItem(FAMILY_LINKED_STORAGE_KEY)==='1')familyRefreshDeviceStatus();});
  window.addEventListener('pageshow',()=>{if(localStorage.getItem(FAMILY_LINKED_STORAGE_KEY)==='1')familyRefreshDeviceStatus();});
  const queryToken = params.get('token');
  if (queryToken) localStorage.setItem(FAMILY_INVITE_STORAGE_KEY, queryToken);

  const alreadyLinked = localStorage.getItem(FAMILY_LINKED_STORAGE_KEY) === '1' && !queryToken;
  if(alreadyLinked)await familyRefreshDeviceStatus();
  if(alreadyLinked&&familyPrefs?.revoked)return;
  const hasMatchSummary = familyRenderMatchSummary();
  const token = localStorage.getItem(FAMILY_INVITE_STORAGE_KEY) || '';
  const button = familyNotifyButton();
  button?.addEventListener('click', handleFamilyEnable);

  if (alreadyLinked) {
    familySetState('家庭通知已啟用', hasMatchSummary
      ? '這支裝置已完成綁定；上方會保留最近一次配對或最終排名資訊 24 小時。'
      : '這支裝置已完成綁定，Round 配對與最終排名公布時會收到網站推播。', 'success');
    if (button) {
      button.disabled = true;
      button.textContent = '已開啟通知';
    }
    if (familyNotifyHint()) familyNotifyHint().textContent = '若日後不想接收通知，可直接從手機通知設定關閉。';
    return;
  }

  if (hasMatchSummary && !token) {
    familySetState('配對資訊', '上方可查看最近一次通知的配對資料；資料會保留 24 小時。若這支裝置尚未綁定，請重新使用家庭邀請連結設定。');
    if (button) button.disabled = true;
    return;
  }

  if (!token) {
    familySetState('邀請連結無效', '找不到邀請資料，請請家人從即時配對頁重新產生一次性邀請連結。', 'error');
    if (button) button.disabled = true;
    return;
  }

  if (!familyPushSupported()) {
    familySetState('此裝置不支援推播', 'iPhone 請使用 Safari 並加入主畫面；Android 請使用支援通知的 Chrome。', 'error');
    if (button) button.disabled = true;
    return;
  }

  if (familyIsIOS() && !familyIsStandalone()) {
    familySetState('先加入主畫面', '邀請資料已保留。請按 Safari 分享 →「加入主畫面」，再從主畫面新圖示重新開啟。');
    if (button) {
      button.disabled = true;
      button.textContent = '請先加入主畫面';
    }
    if (familyNotifyHint()) familyNotifyHint().textContent = '不要先關掉這個頁面；加入主畫面後再從新圖示開啟即可繼續。';
    return;
  }

  familySetState('可以開啟通知了', '按下「開啟配對通知」，再允許手機通知權限。');
  if (button) button.disabled = false;
}

document.addEventListener('DOMContentLoaded', initFamilyNotify);
