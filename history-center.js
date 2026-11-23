// Use exactly the same Supabase account policy as the private pairing page.
const PAIRING_SUPABASE_URL='https://ceobnyikrudlxasyjukg.supabase.co';
const PAIRING_SUPABASE_KEY='sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz';
let pairingClient=null,pairingSession=null,pairingAuthorized=false;
let historyAuthRequest=0;
function historyDisplayAuth(allowed,message=''){
  pairingAuthorized=Boolean(allowed);
  const main=document.getElementById('historyProtectedMain');
  const denied=document.getElementById('historyAccessDenied');
  if(main)main.hidden=!pairingAuthorized;
  if(denied)denied.hidden=pairingAuthorized;
  const deniedText=document.getElementById('historyAccessDeniedText');
  if(deniedText&&!pairingAuthorized)deniedText.textContent=message||'請回玩家排行登入唯一授權的 Google 帳號。';
  document.querySelectorAll('.site-nav a[href="pairing.html"],.site-nav a[href="history.html"]')
    .forEach(a=>{a.hidden=!pairingAuthorized;});
  document.dispatchEvent(new CustomEvent('pairing:auth-ready',{detail:{allowed:pairingAuthorized}}));
}
async function historyVerifyAuth(){
  const generation=++historyAuthRequest,uid=pairingSession?.user?.id;
  historyDisplayAuth(false,'正在確認帳號授權…');
  if(!uid||!pairingClient){historyDisplayAuth(false,'請先回玩家排行登入授權 Google 帳號。');return;}
  try{
    const {data,error}=await pairingClient.rpc('can_use_pairing');
    if(error)throw error;
    if(generation!==historyAuthRequest||pairingSession?.user?.id!==uid)return;
    historyDisplayAuth(data===true,'此帳號未獲授權查看歷史賽事。');
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
    pairingSession=session||null;
    ++historyAuthRequest;
    historyDisplayAuth(false,'正在確認登入權限…');
    setTimeout(historyVerifyAuth,0);
  });
}
document.addEventListener('DOMContentLoaded',historyInitAuth,{once:true});
