(() => {
'use strict';
const root=typeof window==='undefined'?globalThis:window;
const escape=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const id=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,'');
function build(exact,pairs){
 const counts=new Map(),counted=new Set(),known=new Map(),blocked=new Set(exact.filter(r=>r.conflict).map(r=>id(r.player_id)));
 let ambiguousPairs=0,conflictingPairs=0;
 const add=deck=>{if(deck)counts.set(deck,(counts.get(deck)||0)+1);};
 for(const r of exact){const p=id(r.player_id);if(!p||r.conflict||blocked.has(p)||!r.deck_name||counted.has(p))continue;known.set(p,r.deck_name);counted.add(p);add(r.deck_name);}
 for(const r of [...pairs].sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')))){
  const a=id(r.player_a_id),b=id(r.player_b_id),ak=known.get(a),bk=known.get(b),decks=[r.deck_a,r.deck_b];
  if(r.conflict||blocked.has(a)||blocked.has(b)||(ak&&!decks.includes(ak))||(bk&&!decks.includes(bk))||(ak&&bk&&[ak,bk].sort().join('||')!==[...decks].sort().join('||'))){conflictingPairs++;continue;}
  if(!a||!b||a===b||decks.some(d=>!d)||ak&&bk)continue;
  if(ak&&!bk&&!counted.has(b)){const d=decks[0]===decks[1]?decks[0]:decks.find(x=>x!==ak);if(d){add(d);counted.add(b);continue;}}
  if(bk&&!ak&&!counted.has(a)){const d=decks[0]===decks[1]?decks[0]:decks.find(x=>x!==bk);if(d){add(d);counted.add(a);continue;}}
  if(!ak&&!bk&&!counted.has(a)&&!counted.has(b)){decks.forEach(add);counted.add(a);counted.add(b);ambiguousPairs++;}
 }
 const sorted=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-Hant'));
 return {sorted,total:sorted.reduce((sum,r)=>sum+r[1],0),ambiguousPairs,conflictingPairs,blockedPlayers:blocked.size};
}
function titleFor(tid,meta={}){
 const raw=String(meta.title||'').trim(), date=raw.match(/(?:20\d{2}[/-])?(\d{1,2})[/-](\d{1,2})/);
 const group=raw.match(/孩童組|少年組|大師組|Junior|Senior|Master/i);
 const league=/UBL|高級球/i.test(raw)?'高級球':/MBL|大師球/i.test(raw)?'大師球':/PBL|精靈球/i.test(raw)?'精靈球':/紀念球/.test(raw)?'紀念球':'';
 const groupName=group?({junior:'孩童組',senior:'少年組',master:'大師組'}[group[0].toLowerCase()]||group[0]):'';
 const name=date&&league&&groupName?Number(date[1])+'/'+Number(date[2])+' '+league+groupName:raw||'賽事 TID '+tid;
 const count=Number(meta.player_count);
 return {name,title:name+'（比賽人數'+(Number.isInteger(count)&&count>0?count+'人':'待確認')+'）'};
}
async function metadata(client,tid){try{const {data,error}=await client.rpc('pairing_distribution_event',{p_tid:String(tid)});if(error)throw error;return data||{};}catch(e){console.warn('牌組分布賽事資料讀取失敗',e);return {};}}
function noteFor(d){return [d.blockedPlayers?d.blockedPlayers+' 位玩家牌組衝突，暫不計入':'',d.ambiguousPairs?'含 '+d.ambiguousPairs+' 桌未辨識':'',d.conflictingPairs?d.conflictingPairs+' 桌牌組紀錄有衝突，已排除推估':''].filter(Boolean).join('；');}
// A reported roster smaller than the recorded count is not a usable denominator.
function coverage(d,meta={}){
 const recorded=d.total,reported=Number(meta.player_count);
 const known=Number.isSafeInteger(reported)&&reported>0&&reported>=recorded;
 const mismatch=Number.isSafeInteger(reported)&&reported>0&&reported<recorded;
 const total=known?reported:recorded;
 const missing=known?reported-recorded:null;
 const rate=known?recorded/reported:null;
 return {recorded,known,total,missing,rate,rows:known?[...d.sorted,['未紀錄牌組',missing]]:d.sorted,
  note:mismatch?'封存參賽人數少於已紀錄人數，暫以實際紀錄人數計算佔比，完成率待確認。':!known?'比賽總人數尚未確認，暫以實際紀錄人數計算佔比。':''};
}
const percent=v=>(v*100).toFixed(1)+'%';
function render(box,d,tid,meta={}){
 if(!box)return;
 const v=coverage(d,meta);
 if(!v.total){box.innerHTML='<div class="pairing-scout-stats-empty">'+escape(noteFor(d)||'這場比賽還沒有牌組紀錄。')+'<p>比賽總人數及牌組紀錄完成率待確認。</p></div>';return;}
 const t=titleFor(tid,meta),note=[noteFor(d),v.note].filter(Boolean).join('；');
 const completion=v.known?'<section class="deck-distribution-coverage"><div class="deck-distribution-coverage-heading"><strong>牌組紀錄完成率</strong><strong class="deck-distribution-rate">'+percent(v.rate)+'</strong></div><div class="deck-distribution-progress" role="progressbar" aria-label="牌組紀錄完成率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(v.rate*100).toFixed(1)+'"><span style="width:'+v.rate*100+'%"></span></div><p>已紀錄 '+v.recorded+' 人 / 參賽 '+v.total+' 人</p></section>':'<section class="deck-distribution-coverage"><div class="deck-distribution-coverage-heading"><strong>牌組紀錄完成率</strong><strong>待確認</strong></div><p>已紀錄 '+v.recorded+' 人 / 參賽人數待確認</p></section>';
 box.innerHTML='<div class="deck-distribution-toolbar"><strong>牌組分布</strong><button class="secondary-btn" type="button" data-distribution-export>匯出 Excel</button></div><div class="deck-distribution-scroll"><table class="deck-distribution-table"><colgroup><col style="width:44%"><col style="width:20%"><col style="width:36%"></colgroup><thead><tr><th colspan="3" class="deck-distribution-title">'+escape(t.title)+'</th></tr><tr><th scope="col">牌組名稱</th><th scope="col">數量</th><th scope="col">佔比（百分比）</th></tr></thead><tbody>'+v.rows.map(([name,n],i)=>'<tr'+(v.known&&i===v.rows.length-1?' class="deck-distribution-unrecorded"':'')+'><td>'+escape(name)+'</td><td>'+n+'</td><td>'+percent(n/v.total)+'</td></tr>').join('')+'</tbody><tfoot><tr><th scope="row">'+(v.known?'合計':'合計（實際紀錄人數）')+'</th><td>'+v.total+'</td><td>100.0%</td></tr></tfoot></table></div>'+completion+(note?'<p class="deck-distribution-note">'+escape(note)+'</p>':'');
 box.querySelector('[data-distribution-export]').addEventListener('click',()=>download(d,tid,meta));
}
// Small, dependency-free OOXML writer. ZIP STORE avoids external CDN and works offline.
const enc=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function zip(files){
 const chunks=[],central=[];let offset=0,centralLen=0;
 for(const [name,content] of Object.entries(files)){
  const n=enc.encode(name),b=enc.encode(content),sum=crc(b),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);h.set(n,30);
  const c=new Uint8Array(46+n.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,sum,true);w.setUint32(20,b.length,true);w.setUint32(24,b.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);c.set(n,46);
  chunks.push(h,b);central.push(c);centralLen+=c.length;offset+=h.length+b.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,centralLen,true);v.setUint32(16,offset,true);
 const out=new Uint8Array(offset+centralLen+22);let pos=0;for(const b of [...chunks,...central,end]){out.set(b,pos);pos+=b.length;}return out;
}
const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel='http://schemas.openxmlformats.org/package/2006/relationships';
const od='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function workbook(d,tid,meta={}){
 const v=coverage(d,meta),title=titleFor(tid,meta).title,end=v.rows.length+3;
 const knownSum=d.sorted.length?'SUM(B3:B'+(d.sorted.length+2)+')':'0';
 const s=(ref,value,style)=>'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+escape(value)+'</t></is></c>';
 const n=(ref,value,style,formula='')=>'<c r="'+ref+'" s="'+style+'">'+(formula?'<f>'+escape(formula)+'</f>':'')+'<v>'+value+'</v></c>';
 const row=(i,cells,height=23)=>'<row r="'+i+'" ht="'+height+'" customHeight="1">'+cells+'</row>';
 const rows=[row(1,s('A1',title,1)+s('B1','',1)+s('C1','',1),34),row(2,s('A2','牌組名稱',2)+s('B2','數量',2)+s('C2','佔比（百分比）',2),26)];
 v.rows.forEach(([name,count],i)=>{const r=i+3,k=i%2?5:3,isMissing=v.known&&i===v.rows.length-1;rows.push(row(r,s('A'+r,name,k)+n('B'+r,count,k+1,isMissing?'MAX(0,'+v.total+'-'+knownSum+')':'')+n('C'+r,v.total?count/v.total:0,(i%2?8:7),'IFERROR(B'+r+'/$B
 rows.push(row(end,s('A'+end,v.known?'合計':'合計（實際紀錄人數）',9)+n('B'+end,v.total,9,v.rows.length?'SUM(B3:B'+(end-1)+')':'0')+n('C'+end,v.total?1:0,10,v.rows.length?'SUM(C3:C'+(end-1)+')':'0'),27));
 const completionRow=end+1;
 rows.push(row(completionRow,s('A'+completionRow,'牌組紀錄完成率',9)+n('B'+completionRow,v.recorded,9,knownSum)+(v.known?n('C'+completionRow,v.rate,10,'IFERROR(B'+completionRow+'/B'+end+',0)'):s('C'+completionRow,'待確認',9)),27));
 const note=[noteFor(d),v.note].filter(Boolean).join('；');if(note)rows.push(row(end+2,s('A'+(end+2),note,3),36));
 const fonts='<fonts count="3"><font><sz val="12"/><name val="Microsoft JhengHei"/><color rgb="FF173650"/></font><font><b/><sz val="16"/><name val="Microsoft JhengHei"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="12"/><name val="Microsoft JhengHei"/><color rgb="FF173650"/></font></fonts>';
 const fills='<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+['173650','DCE8F2','EEF4FA'].map(x=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+x+'"/><bgColor indexed="64"/></patternFill></fill>').join('')+'</fills>';
 const xf=(font,fill,num=0,align='left')=>'<xf numFmtId="'+num+'" fontId="'+font+'" fillId="'+fill+'" borderId="0" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment horizontal="'+align+'" vertical="center" wrapText="1"/></xf>';
 const styles=xml+'<styleSheet xmlns="'+ns+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>'+fonts+fills+'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11">'+[xf(0,0),xf(1,2,0,'center'),xf(2,3,0,'center'),xf(0,0,0,'center'),xf(0,0,0,'center'),xf(0,4,0,'center'),xf(0,4,0,'center'),xf(0,0,164,'center'),xf(0,4,164,'center'),xf(2,3,0,'center'),xf(2,3,164,'center')].join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
 // Percent styles: white 7, tinted 8.
 const sheet=xml+'<worksheet xmlns="'+ns+'"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="23" customWidth="1"/></cols><sheetData>'+rows.join('')+'</sheetData><mergeCells count="'+(note?2:1)+'"><mergeCell ref="A1:C1"/>'+(note?'<mergeCell ref="A'+(end+2)+':C'+(end+2)+'"/>':'')+'</mergeCells>'+(v.known?'<conditionalFormatting sqref="C'+completionRow+'"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="num" val="0"/><cfvo type="num" val="1"/><color rgb="FF26976B"/></dataBar></cfRule></conditionalFormatting>':'')+'</worksheet>';
 return zip({'[Content_Types].xml':xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':xml+'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+od+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':xml+'<workbook xmlns="'+ns+'" xmlns:r="'+od+'"><sheets><sheet name="牌組分布" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
 'xl/_rels/workbook.xml.rels':xml+'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+od+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+od+'/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':styles,'xl/worksheets/sheet1.xml':sheet});
}
function download(d,tid,meta){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([workbook(d,tid,meta)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.href=url;a.download=titleFor(tid,meta).name.replace(/[\\/:*?"<>|]/g,'-')+'_牌組分布.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
root.PTCGDistribution={build,titleFor,metadata,coverage,render,workbook};
})();
+end+',0)')));});
 rows.push(row(end,s('A'+end,'合計（實際紀錄人數）',9)+n('B'+end,d.total,9,'SUM(B3:B'+(end-1)+')')+n('C'+end,d.total?1:0,10,'SUM(C3:C'+(end-1)+')'),27));
 const note=noteFor(d);if(note)rows.push(row(end+1,s('A'+(end+1),note,3)));
 const fonts='<fonts count="3"><font><sz val="12"/><name val="Microsoft JhengHei"/><color rgb="FF173650"/></font><font><b/><sz val="16"/><name val="Microsoft JhengHei"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="12"/><name val="Microsoft JhengHei"/><color rgb="FF173650"/></font></fonts>';
 const fills='<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+['173650','DCE8F2','EEF4FA'].map(x=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+x+'"/><bgColor indexed="64"/></patternFill></fill>').join('')+'</fills>';
 const xf=(font,fill,num=0,align='left')=>'<xf numFmtId="'+num+'" fontId="'+font+'" fillId="'+fill+'" borderId="0" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment horizontal="'+align+'" vertical="center" wrapText="1"/></xf>';
 const styles=xml+'<styleSheet xmlns="'+ns+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>'+fonts+fills+'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11">'+[xf(0,0),xf(1,2,0,'center'),xf(2,3,0,'center'),xf(0,0,0,'center'),xf(0,0,0,'center'),xf(0,4,0,'center'),xf(0,4,0,'center'),xf(0,0,164,'center'),xf(0,4,164,'center'),xf(2,3,0,'center'),xf(2,3,164,'center')].join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
 // Percent styles: white 7, tinted 8.
 const sheet=xml+'<worksheet xmlns="'+ns+'"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="23" customWidth="1"/></cols><sheetData>'+rows.join('')+'</sheetData><mergeCells count="'+(note?2:1)+'"><mergeCell ref="A1:C1"/>'+(note?'<mergeCell ref="A'+(end+1)+':C'+(end+1)+'"/>':'')+'</mergeCells></worksheet>';
 return zip({'[Content_Types].xml':xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':xml+'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+od+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':xml+'<workbook xmlns="'+ns+'" xmlns:r="'+od+'"><sheets><sheet name="牌組分布" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
 'xl/_rels/workbook.xml.rels':xml+'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+od+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+od+'/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':styles,'xl/worksheets/sheet1.xml':sheet});
}
function download(d,tid,meta){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([workbook(d,tid,meta)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.href=url;a.download=titleFor(tid,meta).name.replace(/[\\/:*?"<>|]/g,'-')+'_牌組分布.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
root.PTCGDistribution={build,titleFor,metadata,render,workbook};
})();
