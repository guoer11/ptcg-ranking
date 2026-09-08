# PTCG 台灣即時排名

目前版本：**v0.2**

## v0.2 新增

- 排行榜玩家列新增「放大鏡」詳細資料按鈕
- 玩家詳細資料 Modal 視窗
- 顯示玩家本季積分、PTCG ID、組別、地區
- Top 8 高積分賽事區塊
- 所有賽事紀錄表格介面
- 空榜期間在孩童組提供 `Yule / tw64474352` 示範列
- PTCG ID 查詢若本站已有詳細資料會直接開啟 Modal
- 尚未建立本站詳細資料的玩家，會提供官方玩家頁連結

> 目前新賽季尚未有正式排行榜資料，因此 v0.2 的 Yule 詳細資料為介面預覽。Top 8 摘要依已確認畫面建立，賽事表暫時只列出已確認的部分紀錄；正式自動抓取玩家公開賽事功能會在後續接上。

## v0.1 基礎功能

- Master / Senior / Junior 三組排行榜介面
- 搜尋玩家名稱、PTCG ID、地區
- 空榜狀態顯示（新賽季尚未有排名也可正常運作）
- Python 自動登入 Pokémon Asia 訓練家網站
- 自動解析官方排行榜 HTML
- GitHub Actions 每 3 小時檢查一次排名
- 排名有變更才更新 `data/ranking.json`
- 每日歷史快照保留於 `data/history/`

## GitHub Secrets

自動更新前，請到：

`Settings → Secrets and variables → Actions → New repository secret`

建立：

- `POKEMON_EMAIL`
- `POKEMON_PASSWORD`

帳密不會寫進程式碼。

## 手動測試 GitHub Actions

Secrets 設好後：

`Actions → Update PTCG ranking → Run workflow`

目前新賽季若官方仍是空榜，Workflow 成功但 `ranking.json` 沒變更是正常狀況。

## GitHub Pages

網站：

`https://guoer11.github.io/ptcg-ranking/`

## 資料來源

Pokémon Asia 官方訓練家網站：

`https://asia.pokemon-card.com/tw/mypage/ranking/`

本專案為非官方資料整理工具。
