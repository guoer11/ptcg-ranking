'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('history-center.js','utf8');
const elements=new Map();
const notices=[];
const listeners={};
const links=[{hidden:true},{hidden:true}];
const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});
  return elements.get(id);
};
const document={
  getElementById:element,
  querySelectorAll:()=>links,
  addEventListener:(name,callback)=>{listeners[name]=callback;},
  dispatchEvent:event=>{if(event.type==='pairing:auth-ready')notices.push(event.detail);}
};
let authChange=null,role='admin';
const owner={user:{id:'authorized-owner'},access_token:'initial'};
const client={
  auth:{
    getSession:async()=>({data:{session:owner}}),
    onAuthStateChange:callback=>{authChange=callback;}
  },
  rpc:async()=>({data:role,error:null})
};
const window={supabase:{createClient:()=>client}};
class CustomEvent{
  constructor(type,options){this.type=type;this.detail=options?.detail;}
}
vm.runInNewContext(source,{window,document,CustomEvent,setTimeout,console});
const delay=()=>new Promise(resolve=>setTimeout(resolve,15));
(async()=>{
  assert.equal(typeof listeners.DOMContentLoaded,'function');
  await listeners.DOMContentLoaded();
  await delay();
  assert.equal(element('historyProtectedMain').hidden,false);
  assert.equal(notices.length,1);
  assert.equal(notices[0].allowed,true);
  assert.equal(typeof authChange,'function');

  // Chrome tab focus may cause Supabase to report SIGNED_IN/TOKEN_REFRESHED
  // for the same user. Neither should tear down the private page.
  authChange('TOKEN_REFRESHED',{user:{id:'authorized-owner'},access_token:'refreshed'});
  assert.equal(element('historyProtectedMain').hidden,false);
  await delay();
  assert.equal(element('historyProtectedMain').hidden,false);
  assert.equal(notices.length,1);

  authChange('SIGNED_IN',{user:{id:'authorized-owner'},access_token:'revalidated'});
  await delay();
  assert.equal(element('historyProtectedMain').hidden,false);
  assert.equal(notices.length,1);

  role='guest';authChange('TOKEN_REFRESHED',{user:{id:'authorized-owner'},access_token:'guest'});await delay();
  assert.equal(element('historyProtectedMain').hidden,false);assert.equal(notices.at(-1).role,'guest');assert.equal(notices.length,2);
  // An actual sign-out must still revoke access immediately.
  authChange('SIGNED_OUT',null);
  assert.equal(element('historyProtectedMain').hidden,true);
  assert.equal(notices.length,3);
  assert.equal(notices.at(-1).allowed,false);
  console.log('PASS: same-account auth refresh preserves history; sign-out revokes private page');
})().catch(err=>{console.error(err);process.exitCode=1;});
