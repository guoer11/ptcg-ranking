(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const role=()=>typeof pairingAccessRole!=='undefined'&&location.pathname.endsWith('pairing.html')?pairingAccessRole:(typeof identityAccessRole!=='undefined'?identityAccessRole:'none');
  const client=()=>typeof identityClient!=='undefined'?identityClient:null;
  const session=()=>typeof identitySession!=='undefined'?identitySession:null;
  let generation=0,busy=false;
  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
  function setMessage(text,error=false){const node=byId('pairingGuestMessage');if(node){node.textContent=text;node.className='pairing-scout-message'+(error?' error':'');}}
  function applyRole(){
    const guest=role()==='guest';
    document.querySelectorAll('[data-app-target="line"],[data-app-target="deck"],.push-preferences').forEach(node=>{if(guest){if(!node.hidden)node.dataset.guestHidden='1';node.hidden=true;}else if(node.dataset.guestHidden==='1'){delete node.dataset.guestHidden;node.hidden=false;}});
    document.querySelectorAll('.pairing-history-moved').forEach(node=>node.hidden=role()!=='admin');
    document.querySelectorAll('.site-nav a[href="history.html"]').forEach(link=>{if(role()!=='admin')link.hidden=true;});
    const copy=document.querySelector('.status-card small:last-child');
    if(copy&&location.pathname.endsWith('pairing.html'))copy.textContent=guest?'網站推播 + 家庭裝置':'LINE + 網站推播';
    const section=byId('pairingGuestAdmin');
    if(section){section.hidden=role()!=='admin';if(section.hidden){generation++;byId('pairingGuestList')?.replaceChildren();}}
  }
  function ensure(){
    const host=document.querySelector('[data-account-view="account"]');
    if(!host)return;
    if(!byId('pairingGuestAdmin')){
      const section=el('section','','push-status-box');section.id='pairingGuestAdmin';section.hidden=true;
      section.innerHTML='<strong>即時配對授權管理</strong><small>只授權即時配對與共用牌組，私人資料與 LINE 不開放。停用不會刪除已貢獻的牌組。</small><label>家長名稱<input id="pairingGuestName" class="search-input" maxlength="80" placeholder="方便辨識"></label><label>Google 帳號<input id="pairingGuestEmail" class="search-input" type="email" maxlength="254" autocomplete="off" placeholder="example@gmail.com"></label><div class="push-actions"><button id="pairingGuestAdd" class="primary-btn" type="button">新增授權</button><button id="pairingGuestRefresh" class="secondary-btn" type="button">重新讀取</button></div><p id="pairingGuestMessage" role="status" aria-live="polite"></p><div id="pairingGuestList"></div>';
      host.append(section);
      byId('pairingGuestAdd').onclick=async()=>{
        if(busy||role()!=='admin'||!session())return;
        const name=byId('pairingGuestName').value.trim(),email=byId('pairingGuestEmail').value.trim().toLowerCase();
        if(!name||!validEmail(email))return setMessage('請輸入家長名稱及有效的 Google 電子郵件。',true);
        busy=true;
        try{
          const {error}=await client().from('pairing_guest_grants').insert({email,display_name:name,active:true});
          if(error)throw error;
          byId('pairingGuestName').value='';byId('pairingGuestEmail').value='';await refresh();
          setMessage('授權已新增，家長可用該 Google 帳號登入。');
        }catch(error){setMessage(error?.code==='23505'?'此帳號已在清單中，可直接恢復授權。':error?.message||'新增失敗',true);}
        finally{busy=false;}
      };
      byId('pairingGuestRefresh').onclick=refresh;
    }
    applyRole();
  }
  async function refresh(){
    ensure();
    if(role()!=='admin'||!client()||!session()||!byId('pairingGuestList'))return;
    const version=++generation,uid=session().user.id;
    try{
      const {data,error}=await client().from('pairing_guest_grants').select('email,display_name,active,created_at').order('created_at');
      if(error)throw error;
      if(version!==generation||role()!=='admin'||session()?.user.id!==uid)return;
      const list=byId('pairingGuestList');list.replaceChildren();
      if(!data?.length){list.append(el('small','尚未授權任何家長；原有功能不受影響。'));return;}
      for(const row of data){
        const card=el('div','','family-owner-device');
        const text=el('div');text.append(el('strong',row.display_name),el('small',row.email),el('small',row.active?'已啟用':'已停用'));
        const button=el('button',row.active?'停用授權':'恢復授權','secondary-btn');button.type='button';
        button.onclick=async()=>{
          if(role()!=='admin'||busy)return;
          if(row.active&&!confirm('停用後將停止此家長的配對追蹤及家庭通知，已登記牌組會保留。確定停用？'))return;
          busy=true;button.disabled=true;
          try{
            const {error}=await client().from('pairing_guest_grants').update({active:!row.active}).eq('email',row.email);
            if(error)throw error;
            await refresh();setMessage(row.active?'已停用授權。':'已恢復授權；請家長重新開始追蹤及確認裝置設定。');
          }catch(error){setMessage(error?.message||'更新失敗',true);}
          finally{busy=false;button.disabled=false;}
        };
        card.append(text,button);list.append(card);
      }
    }catch(error){if(version===generation)setMessage(error?.message||'授權清單讀取失敗',true);}
  }
  document.addEventListener('account-hub-ready',()=>{ensure();if(role()==='admin')void refresh();});
  document.addEventListener('pairing:role-changed',()=>{ensure();applyRole();if(role()==='admin')void refresh();});
  document.addEventListener('pairing:auth-ready',applyRole);
  document.addEventListener('DOMContentLoaded',()=>{ensure();applyRole();});
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-app-target="account"],[data-account-target="account"]')&&role()==='admin')void refresh();});
})();
