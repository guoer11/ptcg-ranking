# PTCG 台灣即時排名

第一版（v0.1）功能：

- Master / Senior / Junior 三組排行榜介面
- 搜尋玩家名稱、PTCG ID、地區
- 空榜狀態顯示（新賽季尚未有排名也可正常運作）
- PTCG ID 官方玩家頁快速查詢
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

到：

`Settings → Pages`

在 **Build and deployment** 選：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

儲存後網站通常會是：

`https://guoer11.github.io/ptcg-ranking/`

## 資料來源

Pokémon Asia 官方訓練家網站：

`https://asia.pokemon-card.com/tw/mypage/ranking/`

本專案為非官方資料整理工具。
