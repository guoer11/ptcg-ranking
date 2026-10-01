export const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const idOf = value => /\btw\d+\b/i.exec(clean(value))?.[0].toLowerCase() || '';
const numberOf = value => /^\d+(?:\.\d+)?$/.test(clean(value)) ? Number(clean(value)) : null;
const byeText = value => /^(?:bye|不戦勝|輪空)$/i.test(clean(value));

export function parseRoundRows(rows, round) {
  const entries = [];
  for (const cells of rows) {
    if (cells.length < 3 || !/^\d+$/.test(clean(cells[0]))) continue;
    const at = cells.findIndex(cell => idOf(cell));
    if (at < 1) continue;
    const id = idOf(cells[at]);
    const tail = cells.slice(at + 1).map(clean);
    const opponent = tail.map(idOf).find(Boolean) || '';
    const scoreCell = tail.find(text => numberOf(text) !== null);
    const score = round === 1 ? 0 : numberOf(scoreCell);
    if (score === null) throw new Error(`Round ${round} 的 ${id} 缺少積分，暫時無法估算。`);
    const names = tail.filter(text => text && !idOf(text) && numberOf(text) === null && !byeText(text));
    entries.push({id, table:clean(cells[0]), score, opponent, name:opponent ? '' : names[0] || '', opponentName:opponent ? '' : names[1] || '', explicitBye:tail.some(byeText)});
  }
  const unique = new Map();
  for (const entry of entries) {
    const prior = unique.get(entry.id);
    if (prior && (prior.score !== entry.score || prior.table !== entry.table)) throw new Error('配對資料正在變動，請稍後重新讀取。');
    unique.set(entry.id, entry);
  }
  const all = [...unique.values()];
  // Legacy tables identify the opponent by a reciprocal name on the same table.
  for (const entry of all) {
    if (!entry.opponent && entry.name && entry.opponentName) {
      const matches=all.filter(other => other.id !== entry.id && other.table === entry.table && other.name === entry.opponentName && other.opponentName === entry.name);
      if(matches.length===1)entry.opponent=matches[0].id;
    }
  }
  return all;
}

export function buildSnapshot(entries, round) {
  const index = new Map(entries.map((entry,i)=>[entry.id,i]));
  const players = entries.map(entry=>({id:entry.id,score:entry.score,active:true,games:round-1,opponents:[],byes:0,wins:[]}));
  const pairs=[], pending=[], paired=new Set();
  for(const entry of entries) {
    if(paired.has(entry.id))continue;
    const a=index.get(entry.id);
    if(!entry.opponent) {
      const kind=entry.explicitBye?'bye':'unknown';
      pairs.push([a,null]);pending.push({index:a,id:entry.id,kind,table:entry.table});paired.add(entry.id);continue;
    }
    const b=index.get(entry.opponent), other=entries[b];
    if(b===undefined || entry.opponent===entry.id || !other || other.opponent!==entry.id || other.table!==entry.table) {
      throw new Error(`第 ${entry.table} 桌的雙方配對未能對上，請稍後重新讀取。`);
    }
    if(paired.has(other.id))throw new Error('同一位玩家有多筆配對，請稍後重新讀取。');
    pairs.push([a,b]);paired.add(entry.id);paired.add(other.id);
  }
  return {round,completed:round-1,listed:players.length,knownParticipants:players.length,players,pairs,pending};
}

export function parseStandings(rows) {
  const result=[];
  for(const cells of rows) {
    if(!/^\d+$/.test(clean(cells[0])))continue;
    const at=cells.findIndex(cell=>idOf(cell));
    if(at<1)continue;
    const score=numberOf(cells[at+1]);
    if(score===null)continue;
    result.push({id:idOf(cells[at]),rank:Number(cells[0]),score});
  }
  const ids=new Set(result.map(p=>p.id)),ranks=new Set(result.map(p=>p.rank));
  if(ids.size!==result.length || ranks.size!==result.length)throw new Error('最終排名有重複資料，請重新讀取。');
  return result.sort((a,b)=>a.rank-b.rank);
}
