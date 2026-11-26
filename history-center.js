// Use exactly the same Supabase account policy as the private pairing page.
const PAIRING_SUPABASE_URL='https://ceobnyikrudlxasyjukg.supabase.co';
const PAIRING_SUPABASE_KEY='sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
let pairingClient=null,pairingSession=null,pairingAuthorized=false;
let pairingAccessRole='none';
let historyAuthRequest=0;
let historyLastNotifiedUser='';
function historyDisplayAuth(allowed,message='',role='none'){
  pairingAuthorized=Boolean(allowed);
  pairingAccessRole=pairingAuthorized?role:'none';
  const admin=pairingAccessRole==='admin';
  document.querySelectorAll('[data-history-admin-only]').forEach(el=>{el.hidden=!admin;});
  const main=document.getElementById('historyProtectedMain');
  const denied=document.getElementById('historyAccessDenied');
  if(main){main.hidden=!pairingAuthorized;if(main.dataset)main.dataset.historyRole=pairingAccessRole;}
  if(denied)denied.hidden=pairingAuthorized;
  const deniedText=document.getElementById('historyAccessDeniedText');
  if(deniedText&&!pairingAuthorized)deniedText.textContent=message||'請回玩家排行登入授權的 Google 帳號。';
  document.querySelectorAll('.site-nav a[href="pairing.html"],.site-nav a[href="history.html"]')
    .forEach(a=>{a.hidden=!pairingAuthorized;});
  // Only notify feature modules when account authorization actually changes.
  // Background token refresh/SIGNED_IN events must not erase the open event,
  // round selection, or unsaved knockout picks.
  const notifiedUser=pairingAuthorized?String(pairingSession?.user?.id||'')+':'+pairingAccessRole:'';
  if(notifiedUser!==historyLastNotifiedUser){
    historyLastNotifiedUser=notifiedUser;
    document.dispatchEvent(new CustomEvent('pairing:role-changed',{detail:{role:pairingAccessRole}}));
    document.dispatchEvent(new CustomEvent('pairing:auth-ready',{detail:{allowed:pairingAuthorized,role:pairingAccessRole}}));
  }
}
async function historyVerifyAuth(){
  const generation=++historyAuthRequest,uid=pairingSession?.user?.id;
  // Revalidate permissions without unmounting an already authorized page.
  if(!uid||!pairingClient){historyDisplayAuth(false,'請先回玩家排行登入授權 Google 帳號。');return;}
  try{
    const {data,error}=await pairingClient.rpc('pairing_access_role');
    if(error)throw error;
    if(generation!==historyAuthRequest||pairingSession?.user?.id!==uid)return;
    historyDisplayAuth(['admin','guest'].includes(data),'此帳號未獲授權查看歷史賽事。',data);
  }catch(e){
    if(generation===historyAuthRequest)historyDisplayAuth(false,'權限驗證失敗，請稍後重新整理。');
  }
}
async function historyInitAuth(){
  if(!window.supabase?.createClient){historyDisplayAuth(false,'登入服務未載入，請重新整理。');return;}
  pairingClient=window.supabase.createClient(PAIRING_SUPABASE_URL,PAIRING_SUPABASE_KEY);
  const {data}=await pairingClient.auth.getSession();
  pairingSession=data?.session||null;
  await historyVerifyAuth();
  pairingClient.auth.onAuthStateChange((_event,session)=>{
    const previousUser=pairingSession?.user?.id||'';
    const nextUser=session?.user?.id||'';
    pairingSession=session||null;
    ++historyAuthRequest;
    if(previousUser!==nextUser){
      // Only a different account or a real sign-out should reset private UI.
      historyDisplayAuth(false,nextUser?'正在確認登入權限…':'請先回玩家排行登入授權 Google 帳號。');
    }
    if(nextUser)setTimeout(historyVerifyAuth,0);
  });
}
document.addEventListener('DOMContentLoaded',historyInitAuth,{once:true});
