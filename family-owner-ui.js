const FAMILY_OWNER_SUPABASE_URL = 'https://ceobnyikrudlxasyjukg.supabase.co';
const FAMILY_OWNER_SUPABASE_KEY = 'sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
const FAMILY_OWNER_FUNCTION_URL = `${FAMILY_OWNER_SUPABASE_URL}/functions/v1/ptcg-family-push`;

let familyOwnerClient = null;
let familyOwnerSession = null;
let familyOwnerAuthorized = false;
let familyOwnerBusy = false;
let familyOwnerAuthBound = false;
let familyOwnerPlayers = [];
function familyFilterHTML(mode='all',ids=[]) {
  const options=[...new Map([...familyOwnerPlayers,...ids.map(id=>({id,name:familyOwnerPlayers.find(p=>p.id===id)?.name||''}))].map(p=>[p.id,p])).values()];
  return `<fieldset class="family-filter"><legend>接收玩家</legend><label><input type="radio" data-filter-mode value="all" ${mode==='all'?'checked':''}> 全部追蹤玩家</label><label><input type="radio" data-filter-mode value="custom" ${mode==='custom'?'checked':''}> 指定追蹤玩家</label><div data-filter-options ${mode==='custom'?'':'hidden'}>${options.map(p=>`<label><input type="checkbox" data-filter-id value="${familyOwnerEscape(p.id)}" ${ids.includes(p.id)?'checked':''}> ${familyOwnerEscape(p.name?p.name+' · '+p.id:p.id)}</label>`).join('')}<label>其他 PTCG ID（以空格或逗號分隔）<input class="search-input" data-extra-ids placeholder="tw12345678"></label></div></fieldset>`;
}
function familyBindFilter(root) {
  if(!root)return;
  const radios=[...root.querySelectorAll('[data-filter-mode]')];
  radios.forEach(r=>r.addEventListener('change',()=>{radios.forEach(x=>{if(x!==r)x.checked=false});root.querySelector('[data-filter-options]').hidden=r.value!=='custom';}));
}
function familyReadFilter(root){
  const mode=root?.querySelector('[data-filter-mode]:checked')?.value||'all';
  const ids=[...new Set([...Array.from(root?.querySelectorAll('[data-filter-id]:checked')||[],x=>x.value),...(root?.querySelector('[data-extra-ids]')?.value||'').toLowerCase().split(/[\s,，、]+/).filter(Boolean)])];
  if(mode==='custom'&&(ids.length<1||ids.length>5||ids.some(id=>!/^tw\d{1,16}$/.test(id))))throw Error('請選擇 1 至 5 位有效玩家');
  return {player_filter_mode:mode,allowed_player_ids:mode==='custom'?ids:[]};
}
function familyRenderInviteFilter(){
  const root=document.getElementById('familyInviteFilter');if(!root)return;
  const old=root.querySelector('[data-filter-mode]:checked')?.value||'all';
  const ids=Array.from(root.querySelectorAll('[data-filter-id]:checked'),x=>x.value);
  root.innerHTML=familyFilterHTML(old,ids);familyBindFilter(root);
}
function familyFilterLabel(d){
  return d.player_filter_mode==='custom'?(d.allowed_player_ids||[]).map(id=>{const p=familyOwnerPlayers.find(p=>p.id===id);return p?.name?p.name+' · '+id:id;}).join('、'):'全部追蹤玩家';
}
function familyPlatform(d){return ({ios:'iPhone / iPad',android:'Android',other:'其他',unknown:'未辨識'})[d.device_platform]||'未辨識';}

function familyOwnerEnsureStyle() {
  if (document.querySelector('link[data-family-owner-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'family-owner-ui.css?v=2.19.0';
  link.dataset.familyOwnerStyle = 'true';
  document.head.appendChild(link);
}

function familyOwnerCard() {
  return document.querySelector('[data-account-view="family"] #familyNotificationCard');
}

function familyOwnerEnsureCard() {
  const card = familyOwnerCard();
  if (!card) return null;
  if (card.dataset.familyOwnerReady === '1') return card;

  card.className = 'account-family-manager family-owner-card';
  card.innerHTML = `
    <div class="family-owner-head">
      <div>
        <strong>家庭通知裝置</strong>
        <span>家人的手機 只接收 Round 配對與最終排名網站推播，不需要 Google 登入，也不增加 LINE 官方帳號訊息量。</span>
      </div>
      <span id="familyDeviceCount" class="family-owner-count">0 台</span>
    </div>
    <div class="family-owner-form">
      <label for="familyDeviceLabel">裝置名稱</label>
      <input id="familyDeviceLabel" class="search-input" type="text" value="家庭裝置" maxlength="40" autocomplete="off" />
      <div id="familyInviteFilter"></div>
      <div class="family-owner-actions">
        <button id="familyCreateInviteButton" class="primary-btn" type="button">產生邀請連結</button>
        <button id="familyShareInviteButton" class="secondary-btn" type="button">分享邀請</button>
        <button id="familyCopyInviteButton" class="secondary-btn" type="button">複製連結</button>
      </div>
      <small class="family-owner-tip">可產生一次性邀請連結，家庭裝置只會收到配對與最終排名網站推播。</small>
    </div>
    <div id="familyInvitePanel" class="family-owner-invite" hidden>
      <input id="familyInviteUrl" class="search-input" type="text" readonly aria-label="家庭通知邀請連結" />
      <small id="familyInviteExpiry">邀請連結成功綁定後即失效。</small>
    </div>
    <div id="familyNotificationMessage" class="family-owner-message">正在確認家庭通知權限…</div>
    <div class="family-owner-devices">
      <div class="family-owner-devices-head"><strong>已綁定裝置</strong><span>只收配對通知</span></div>
      <div id="familyDeviceList"><div class="family-owner-empty">讀取中…</div></div>
    </div>`;
  card.dataset.familyOwnerReady = '1';
  familyRenderInviteFilter();

  document.getElementById('familyCreateInviteButton')?.addEventListener('click', createFamilyInvite);
  document.getElementById('familyCopyInviteButton')?.addEventListener('click', copyFamilyInvite);
  document.getElementById('familyShareInviteButton')?.addEventListener('click', shareFamilyInvite);
  return card;
}

function familyOwnerMessage(text, type = '') {
  const el = document.getElementById('familyNotificationMessage');
  if (!el) return;
  el.textContent = text || '';
  el.className = `family-owner-message${type ? ` ${type}` : ''}`;
}

function familyOwnerSetBusy(busy) {
  familyOwnerBusy = busy;
  ['familyCreateInviteButton', 'familyShareInviteButton', 'familyCopyInviteButton'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy || !familyOwnerAuthorized;
  });
  document.querySelectorAll('[data-family-remove],[data-family-edit],[data-family-save]').forEach(button => { button.disabled = busy || !familyOwnerAuthorized; });
}

async function familyOwnerRequest(action, extra = {}) {
  if (!familyOwnerSession?.access_token) throw new Error('請先以授權帳號登入');
  const response = await fetch(FAMILY_OWNER_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${familyOwnerSession.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || '家庭通知服務回應失敗');
  return data;
}

function familyOwnerFormatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function familyOwnerEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderFamilyDevices(devices = []) {
  const list = document.getElementById('familyDeviceList');
  const count = document.getElementById('familyDeviceCount');
  const homeStatus = document.getElementById('accountAppFamilyStatus');
  if (count) count.textContent = `${devices.length} 台`;
  if (homeStatus) homeStatus.textContent = devices.length ? `已綁定 ${devices.length} 台裝置` : '尚未綁定家庭裝置';
  if (!list) return;

  if (!devices.length) {
    list.innerHTML = '<div class="family-owner-empty">目前尚未綁定家庭通知裝置。</div>';
    return;
  }

  list.innerHTML = devices.map(device => `
    <div class="family-owner-device">
      <div>
        <strong>${familyOwnerEscape(device.device_label || '家庭裝置')}</strong>
        <small>${familyOwnerEscape(familyPlatform(device))} · ${device.active?'已啟用':'已失效'}</small><small>接收：${familyOwnerEscape(familyFilterLabel(device))}</small><small>綁定：${familyOwnerEscape(familyOwnerFormatDate(device.created_at))}</small>
      </div>
      <div><button class="secondary-btn" type="button" data-family-edit="${familyOwnerEscape(device.id)}">修改設定</button><button class="secondary-btn family-owner-remove" type="button" data-family-remove="${familyOwnerEscape(device.id)}">移除</button></div>
    </div><div data-family-editor="${familyOwnerEscape(device.id)}" hidden></div>`).join('');

  list.querySelectorAll('[data-family-edit]').forEach(button=>button.addEventListener('click',()=>{
    if(!familyOwnerAuthorized||familyOwnerBusy)return;
    const d=devices.find(x=>String(x.id)===button.dataset.familyEdit);
    if(!d)return;
    const panel=list.querySelector('[data-family-editor="'+d.id+'"]');
    if(!panel.hidden){panel.hidden=true;return;}
    panel.hidden=false;
    panel.innerHTML=`<div class="family-owner-form"><label>裝置名稱<input class="search-input" data-edit-label maxlength="40" value="${familyOwnerEscape(d.device_label)}"></label>${familyFilterHTML(d.player_filter_mode,d.allowed_player_ids||[])}<button class="primary-btn" data-family-save type="button">儲存</button><button class="secondary-btn" data-family-cancel type="button">取消</button></div>`;
    familyBindFilter(panel);
    panel.querySelector('[data-family-cancel]').onclick=()=>panel.hidden=true;
    panel.querySelector('[data-family-save]').onclick=async()=>{
      if(familyOwnerBusy||!familyOwnerAuthorized)return;
      try{
        const device_label=panel.querySelector('[data-edit-label]').value.trim();
        if(!device_label)throw Error('請輸入裝置名稱');
        const settings=familyReadFilter(panel);
        familyOwnerSetBusy(true);
        const data=await familyOwnerRequest('update-device',{device_id:d.id,device_label,...settings});
        if(data.players)familyOwnerPlayers=data.players;
        renderFamilyDevices(data.devices||[]);familyOwnerMessage('已儲存裝置設定，後續通知立即適用。','success');
      }catch(e){familyOwnerMessage(e.message,'error');}finally{familyOwnerSetBusy(false);}
    };
  }));
  list.querySelectorAll('[data-family-remove]').forEach(button => {
    button.addEventListener('click', async () => {
      if (familyOwnerBusy || !familyOwnerAuthorized) return;
      const id = Number(button.dataset.familyRemove);
      if (!Number.isInteger(id)) return;
      familyOwnerSetBusy(true);
      familyOwnerMessage('正在移除家庭通知裝置…');
      try {
        const data = await familyOwnerRequest('remove-device', { device_id: id });
        renderFamilyDevices(data.devices || []);
        familyOwnerMessage('已移除家庭通知裝置。', 'success');
      } catch (error) {
        familyOwnerMessage(error?.message || String(error), 'error');
      } finally {
        familyOwnerSetBusy(false);
      }
    });
  });
}

async function refreshFamilyDevices() {
  if (!familyOwnerAuthorized) return;
  try {
    const data = await familyOwnerRequest('list-devices');
    if(data.players)familyOwnerPlayers=data.players;
    familyRenderInviteFilter();
    renderFamilyDevices(data.devices || []);
  } catch (error) {
    console.warn('家庭通知裝置讀取失敗', error);
    familyOwnerMessage('家庭通知裝置讀取失敗。', 'error');
  }
}

async function createFamilyInvite() {
  if (familyOwnerBusy || !familyOwnerAuthorized) return;
  const labelInput = document.getElementById('familyDeviceLabel');
  const label = String(labelInput?.value || '家庭裝置').trim() || '家庭裝置';
  familyOwnerSetBusy(true);
  familyOwnerMessage('正在產生一次性邀請連結…');
  try {
    const data = await familyOwnerRequest('create-invite', { device_label: label, ...familyReadFilter(document.getElementById('familyInviteFilter')) });
    const panel = document.getElementById('familyInvitePanel');
    const input = document.getElementById('familyInviteUrl');
    const expiry = document.getElementById('familyInviteExpiry');
    if (input) input.value = data.invite_url || '';
    if (expiry) expiry.textContent = `有效到 ${familyOwnerFormatDate(data.expires_at)}，成功綁定後即失效。`;
    if (panel) panel.hidden = false;
    familyOwnerMessage('邀請連結已產生。傳給家人後，請在對方手機完成通知授權（iPhone 需加入主畫面）。', 'success');
  } catch (error) {
    familyOwnerMessage(error?.message || String(error), 'error');
  } finally {
    familyOwnerSetBusy(false);
  }
}

async function copyFamilyInvite() {
  const input = document.getElementById('familyInviteUrl');
  const value = input?.value || '';
  if (!value) {
    familyOwnerMessage('請先產生邀請連結。');
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    familyOwnerMessage('邀請連結已複製。', 'success');
  } catch (_) {
    input.focus();
    input.select();
    document.execCommand('copy');
    familyOwnerMessage('邀請連結已複製。', 'success');
  }
}

async function shareFamilyInvite() {
  const input = document.getElementById('familyInviteUrl');
  const url = input?.value || '';
  if (!url) {
    familyOwnerMessage('請先產生邀請連結。');
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'PTCG 家庭配對通知',
        text: '請用這個一次性連結，在你的手機 開啟家庭配對通知。',
        url
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyFamilyInvite();
}

async function refreshFamilyOwnerAuth() {
  if (!familyOwnerClient || !familyOwnerEnsureCard()) return;
  const { data } = await familyOwnerClient.auth.getSession();
  familyOwnerSession = data?.session || null;
  familyOwnerAuthorized = false;
  familyOwnerSetBusy(false);

  if (!familyOwnerSession) {
    renderFamilyDevices([]);
    familyOwnerMessage('請先到「個人資料」以授權 Google 帳號登入。');
    return;
  }

  try {
    const { data: allowed, error } = await familyOwnerClient.rpc('pairing_access_role');
    if (error) throw error;
    familyOwnerAuthorized = ['admin','guest'].includes(allowed);
    if(allowed==='guest')familyOwnerPlayers=[];
    familyOwnerSetBusy(false);
    if (!familyOwnerAuthorized) {
      renderFamilyDevices([]);
      familyOwnerMessage('目前帳號沒有家庭通知管理權限。', 'error');
      return;
    }
    familyOwnerMessage('可產生一次性邀請連結，家庭裝置只會收到配對與最終排名網站推播。');
    await refreshFamilyDevices();
  } catch (error) {
    console.warn('家庭通知權限確認失敗', error);
    familyOwnerAuthorized = false;
    familyOwnerSetBusy(false);
    familyOwnerMessage('家庭通知權限確認失敗。', 'error');
  }
}

async function initFamilyOwnerUI() {
  familyOwnerEnsureStyle();
  if (!familyOwnerEnsureCard() || !window.supabase?.createClient) return false;

  if (!familyOwnerClient) familyOwnerClient = window.supabase.createClient(FAMILY_OWNER_SUPABASE_URL, FAMILY_OWNER_SUPABASE_KEY);
  if (!familyOwnerAuthBound) {
    familyOwnerAuthBound = true;
    familyOwnerClient.auth.onAuthStateChange(() => setTimeout(refreshFamilyOwnerAuth, 0));
  }
  await refreshFamilyOwnerAuth();
  return true;
}

function familyOwnerBoot() {
  familyOwnerEnsureStyle();
  if(document.getElementById('familyDeviceTest'))return;
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    if (await initFamilyOwnerUI() || tries > 100) clearInterval(timer);
  }, 60);
  initFamilyOwnerUI();
}

document.addEventListener('account-family-view-ready', () => initFamilyOwnerUI());
document.addEventListener('account-family-opened', () => refreshFamilyOwnerAuth());
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', familyOwnerBoot, { once: true });
else familyOwnerBoot();

async function initFamilyDeviceTest(){
  const root=document.getElementById('familyDeviceTest');if(!root||!window.supabase?.createClient)return;
  const select=root.querySelector('select'), msg=root.querySelector('[role=status]'), button=root.querySelector('[data-send-test]');
  const client=(typeof identityClient!=='undefined'&&identityClient)||(typeof pairingClient!=='undefined'&&pairingClient)||window.supabase.createClient(FAMILY_OWNER_SUPABASE_URL,FAMILY_OWNER_SUPABASE_KEY);
  async function call(action,extra={}){
    const {data}=await client.auth.getSession();
    if(!data?.session?.access_token)throw Error('請先登入授權帳號');
    const response=await fetch(FAMILY_OWNER_FUNCTION_URL,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'家庭通知服務失敗');return result;
  }
  let devices=[];
  async function load(){
    button.disabled=true;
    try{
      const data=await call('list-devices');devices=(data.devices||[]).filter(d=>d.active);
      if(data.players)familyOwnerPlayers=data.players;
      select.replaceChildren(new Option('請選擇家庭裝置',''));
      devices.forEach(d=>select.add(new Option(d.device_label+' · '+familyFilterLabel(d),String(d.id))));
      if(devices.length)select.add(new Option('全部家庭裝置','all'));
      msg.textContent=devices.length?'僅發送家庭推播，不會發送 LINE。':'目前沒有可測試的裝置。';
      button.disabled=!select.value;
    }catch(e){select.replaceChildren(new Option('無法讀取裝置',''));msg.textContent=e.message;}
  }
  root.closest('details')?.addEventListener('toggle',()=>{if(root.closest('details').open)load();});
  root.querySelector('[data-refresh-devices]').onclick=load;
  select.onchange=()=>button.disabled=!select.value;
  button.onclick=async()=>{
    if(!select.value)return;
    button.disabled=true;msg.textContent='正在發送測試推播…';
    try{const data=await call('test-device',{device_id:select.value});msg.textContent=data.results.map(r=>r.device_label+'：'+(r.sent?'推播服務已接受（請確認手機）':'發送失敗'+(r.status?' ('+r.status+')':''))).join('；');}
    catch(e){msg.textContent=e.message;}
    finally{button.disabled=!select.value;}
  };
  if(root.closest('details')?.open)load();
}
document.addEventListener('DOMContentLoaded',initFamilyDeviceTest);
