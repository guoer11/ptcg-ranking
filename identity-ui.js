// v0.3.2: real-name wording is shown only after authorized Google login.

function demoTable() {
  const rows = DEMO_ROWS.map(row => {
    const realName = identityFor(row.player_id)?.real_name || '';
    return `
      <tr>
        <td><span class="rank-badge">${row.rank}</span></td>
        <td>
          <strong>${esc(row.name)}</strong>
          ${realName ? `<div class="player-real-name">${esc(realName)}</div>` : ''}
          <div class="hint row-id">${esc(row.player_id)}</div>
        </td>
        <td>${esc(row.points)} pt</td>
        <td>${esc(GROUP_LABELS[activeGroup])}</td>
        <td>${esc(row.region)}</td>
        <td class="detail-col">${detailButton(row.player_id, '開啟示範玩家詳細資料', row.demo_key)}</td>
      </tr>`;
  }).join('');

  const identityNote = identityAuthorized
    ? '已登入授權帳號，可顯示真實姓名；'
    : '';

  return `
    <div class="demo-box">
      <div class="demo-label">v0.3.2：3 筆示範資料</div>
      <p>目前官方新賽季仍是空榜。玩家暱稱與 PTCG ID 可公開查看；${identityNote}排名與積分僅用來示範介面。</p>
      <div class="table-scroll">
        <table class="ranking-table">
          <thead><tr><th>排名</th><th>玩家</th><th>得分</th><th>組別</th><th>地區</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function openDemoPlayerModal(demoKey) {
  const row = DEMO_ROWS.find(x => x.demo_key === demoKey);
  if (!row) return;
  const demoTop8 = [
    [50, 25, 25, 25, 25, 20, 20, 15],
    [25, 25, 25, 20, 20, 20, 15, 10],
    [25, 25, 20, 20, 15, 15, 10, 10]
  ];
  const base = demoTop8[row.rank - 1] || demoTop8[2];
  const identityNote = identityAuthorized
    ? '真實姓名由目前授權帳號的私人資料載入；'
    : '';
  const data = {
    demo: true,
    name: row.name,
    real_name: identityFor(row.player_id)?.real_name || '',
    player_id: row.player_id,
    official_points: row.points,
    group: activeGroup,
    region: row.region,
    top8: { points: base, total: base.reduce((a, b) => a + b, 0) },
    total_events: 10,
    events_note: `此視窗為 v0.3.2 介面示範。玩家暱稱與 PTCG ID 為真實對照；${identityNote}排名、積分與下列賽事內容為模擬資料。`,
    events: [
      { name: '示範高級球聯盟賽', date: '2026-08-30', location: '示範店家 A', points: base[0] },
      { name: '示範 Great Ball League', date: '2026-08-16', location: '示範店家 B', points: base[1] },
      { name: '示範高級球聯盟賽', date: '2026-08-02', location: '示範店家 C', points: base[2] }
    ]
  };
  openModalShell();
  renderPlayerDetail(data);
}
