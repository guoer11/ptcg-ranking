'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
for(const page of ['index.html','tournaments.html','pairing.html','history.html']){
  const html=read(page),nav=html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0];
  assert(nav,page+' retains original navigation');
  assert.match(html,/body class="site-bottom-nav-page"/);
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/site-nav\.css\?v=\d+\.\d+\.\d+/);
  assert.equal((nav.match(/<a\b/g)||[]).length,4,'one shared nav, no duplicate links');
  assert.equal((nav.match(/class="site-mobile-glyph"/g)||[]).length,4);
  assert.equal((nav.match(/class="site-mobile-label"/g)||[]).length,4);
  assert.match(nav,/<a\b[^>]*href="pairing\.html"[^>]*\bhidden\b/);
  assert.match(nav,/<a\b[^>]*href="history\.html"[^>]*\bhidden\b/);
  assert.equal((nav.match(/aria-current="page"/g)||[]).length,1);
  if(page==='index.html')assert.equal((nav.match(/id="identityAuthButton"/g)||[]).length,1);
  else assert.match(html,/site-account-ui\.js\?v=\d+\.\d+\.\d+/);
}
const css=read('site-nav.css'),account=read('site-account-ui.js');
assert.match(css,/\.site-nav \.site-mobile-label \{ display:none; \}/,'desktop keeps original labels');
assert.match(css,/@media \(max-width: 720px\)/);
assert.match(css,/padding-bottom: calc\(102px \+ env\(safe-area-inset-bottom/);
assert.match(css,/position:fixed/);
const navRule=css.match(/\.site-bottom-nav-page \.site-nav\s*\{([^}]+)\}/)?.[1];
assert(navRule,'mobile nav rule required');
assert.match(navRule,/bottom:env\(safe-area-inset-bottom, 0px\);/,'nav touches safe-area edge without extra gap');

const footerSurface=css.match(/body\.site-bottom-nav-page::after\s*\{([^}]+)\}/)?.[1];
assert(footerSurface,'opaque full-width footer surface is required');
for(const rule of [/position:fixed/,/z-index:89/,/left:0/,/right:0/,/bottom:0/,/height:calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\)/,/background:#f4f7fb/])
  assert.match(footerSurface,rule,'footer must cover the screen bottom and safe area');
assert.match(css,/body\.site-bottom-nav-page\.modal-open::after \{ display:none; \}/);

assert.match(css,/\.site-bottom-nav-page \.site-nav > a\[hidden\] \{ display:none !important;/);
assert.match(css,/#identityAuthButton::after \{ content:"我的"/);
assert.match(css,/modal-open \.site-nav \{ visibility:hidden; \}/);
assert.match(account,/siteAccountEnsureControls/);
assert.match(account,/button\.addEventListener\('click', siteAccountOpenPanel\)/);
assert.match(account,/can_use_pairing/);
assert.match(account,/link\.hidden = !allowed/);
console.log('PASS: mobile fixed nav, safe area, unique links, unchanged private gating and account action');
