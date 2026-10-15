#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import re
import subprocess
from pathlib import Path


def read(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str | Path, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


SYNC_SCRIPT = r'''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

OUTPUT = Path("data/season_2025_26.json")
API = "https://ptcg.bcb.idv.tw/TE/SearchPlayers"
SOURCE_PAGE = "https://ptcg.bcb.idv.tw/TE"
TAIPEI = ZoneInfo("Asia/Taipei")
PID_RE = re.compile(r"tw\d{6,12}", re.I)


def clean(value):
    return str(value or "").strip()


def fetch_rows():
    url = API + "?" + urlencode({"keyword": "tw"})
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Referer": SOURCE_PAGE,
    })
    with urlopen(req, timeout=60) as response:
        payload = json.load(response)
    if payload.get("success") is not True:
        raise RuntimeError("IvanPTCG SearchPlayers API 回傳失敗")
    return payload.get("players") or []


def normalize_number(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def main():
    players = {}
    for row in fetch_rows():
        pid = clean(row.get("twpid")).lower()
        if not PID_RE.fullmatch(pid):
            continue
        league = clean(row.get("league202526"))
        rank = normalize_number(row.get("rank202526"))
        points = normalize_number(row.get("pt202526"))
        worlds = bool(row.get("hasWcs2026"))
        if not league and rank is None and points is None and not worlds:
            continue
        players[pid] = {
            "league": league,
            "rank": rank,
            "points": points,
            "worlds_2026": worlds,
        }

    players = dict(sorted(players.items()))
    counts = {
        "total": len(players),
        "worlds_2026": sum(1 for value in players.values() if value.get("worlds_2026")),
    }
    comparable = {
        "season": "2025-26",
        "source": "IvanPTCG /TE/SearchPlayers",
        "source_url": SOURCE_PAGE,
        "counts": counts,
        "players": players,
    }

    old = {}
    if OUTPUT.exists():
        try:
            old = json.loads(OUTPUT.read_text(encoding="utf-8"))
        except Exception:
            old = {}
    old_comparable = {key: old.get(key) for key in comparable}
    if old_comparable == comparable:
        print(f"2025-26 歷史資料無變動：{len(players)} 位，WCS 2026 {counts['worlds_2026']} 位")
        return 0

    payload = {
        **comparable,
        "updated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"2025-26 歷史資料更新：{len(players)} 位，WCS 2026 {counts['worlds_2026']} 位")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''

JS_EXTENSION = r'''

// v2.1.0: IvanPTCG 2025-26 history + WCS 2026 badges.
let priorSeasonHistoryData = { season: '2025-26', players: {} };
let priorSeasonHistoryPromise = null;

function priorSeasonFor(playerId) {
  if (!playerId) return null;
  return priorSeasonHistoryData?.players?.[String(playerId).trim().toLowerCase()] || null;
}

function worldsIconHtml(label = '2025-2026 世界賽選手') {
  return `<span class="wcs-player-icon" title="${esc(label)}" aria-label="${esc(label)}" role="img">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M3.5 12h17M12 3c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21M12 3C9.5 5.4 8.2 8.4 8.2 12S9.5 18.6 12 21"></path>
    </svg>
  </span>`;
}

playerNameHtml = function playerNameHtmlV210(row) {
  const identity = identityFor(row.player_id);
  const realName = identity?.real_name;
  const displayName = String(row.name || row.player_id || '—');
  const nameLength = Array.from(displayName).length;
  const sizeClass = nameLength >= 13 ? ' player-name-xlong' : (nameLength >= 8 ? ' player-name-long' : '');
  const history = priorSeasonFor(row.player_id);
  return `
    <div class="player-name-line">
      <strong class="player-name${sizeClass}">${esc(displayName)}</strong>
      ${history?.worlds_2026 ? worldsIconHtml() : ''}
    </div>
    ${realName ? `<div class="player-real-name">${esc(realName)}</div>` : ''}
    ${row.player_id ? `<div class="hint row-id">${esc(row.player_id)}</div>` : ''}`;
};

function priorSeasonDetailHtml(playerId) {
  const history = priorSeasonFor(playerId);
  if (!history) return '';
  const rank = Number(history.rank);
  const points = Number(history.points);
  const rankText = Number.isFinite(rank) && rank > 0 ? `第 ${rank} 名` : '—';
  const pointsText = Number.isFinite(points) ? `${points} pt` : '—';
  return `
    <section class="prior-season-card">
      <div class="prior-season-head">
        <div><span>2025-2026 賽季</span><strong>上季成績</strong></div>
        ${history.worlds_2026 ? `<div class="prior-worlds-label">${worldsIconHtml()}<span>2025-2026 世界賽選手</span></div>` : ''}
      </div>
      <div class="prior-season-grid">
        <article><strong>${esc(history.league || '—')}</strong><span>組別</span></article>
        <article><strong>${esc(rankText)}</strong><span>最終排名</span></article>
        <article><strong>${esc(pointsText)}</strong><span>積分</span></article>
      </div>
      <small class="prior-season-source">歷史資料來源：IvanPTCG 公開排名資料</small>
    </section>`;
}

function injectPriorSeasonDetail(playerId) {
  if (!modalBody || !playerId) return;
  modalBody.querySelector('.prior-season-card')?.remove();
  const html = priorSeasonDetailHtml(playerId);
  if (!html) return;
  const trend = modalBody.querySelector('.ranking-trend-card');
  if (trend) {
    trend.insertAdjacentHTML('afterend', html);
    return;
  }
  const stats = modalBody.querySelector('.player-stat-grid');
  if (stats) stats.insertAdjacentHTML('afterend', html);
  else modalBody.insertAdjacentHTML('afterbegin', html);
}

async function loadPriorSeasonHistory() {
  try {
    const response = await fetch(`data/season_2025_26.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return priorSeasonHistoryData;
    const data = await response.json();
    if (data?.players && typeof data.players === 'object') priorSeasonHistoryData = data;
  } catch (error) {
    console.warn('2025-26 歷史排名資料載入失敗', error);
  }
  return priorSeasonHistoryData;
}

function ensurePriorSeasonHistory() {
  if (!priorSeasonHistoryPromise) priorSeasonHistoryPromise = loadPriorSeasonHistory();
  return priorSeasonHistoryPromise;
}

const baseOpenPlayerModalV210 = openPlayerModal;
openPlayerModal = async function openPlayerModalV210(playerId) {
  await Promise.all([baseOpenPlayerModalV210(playerId), ensurePriorSeasonHistory()]);
  injectPriorSeasonDetail(playerId);
};

const baseOpenDemoPlayerModalV210 = openDemoPlayerModal;
openDemoPlayerModal = function openDemoPlayerModalV210(demoKey) {
  baseOpenDemoPlayerModalV210(demoKey);
  const row = DEMO_ROWS.find(item => item.demo_key === demoKey);
  if (row) ensurePriorSeasonHistory().then(() => injectPriorSeasonDetail(row.player_id));
};

ensurePriorSeasonHistory().then(() => {
  if (Object.values(rankingData?.groups || {}).some(rows => rows?.length)) renderRanking();
});
'''

CSS_EXTENSION = r'''

/* v2.1.0: previous season card + WCS icon */
.player-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.wcs-player-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #c9d7ea;
  border-radius: 6px;
  background: #fff;
  color: #315b91;
  box-shadow: 0 1px 2px rgba(23, 35, 58, 0.08);
  vertical-align: middle;
}

.wcs-player-icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.prior-season-card {
  margin: 0 0 22px;
  border: 1px solid #dce4ef;
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
}

.prior-season-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 15px 17px;
  background: #f8fafc;
  border-bottom: 1px solid #e5eaf1;
}

.prior-season-head > div:first-child span,
.prior-season-head > div:first-child strong {
  display: block;
}

.prior-season-head > div:first-child span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.prior-season-head > div:first-child strong {
  margin-top: 2px;
  font-size: 18px;
}

.prior-worlds-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border-radius: 999px;
  background: #fff7df;
  color: #8a5a00;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.prior-worlds-label .wcs-player-icon {
  width: 18px;
  height: 18px;
  flex-basis: 18px;
  border-color: #efd28a;
  color: #8a5a00;
  box-shadow: none;
}

.prior-worlds-label .wcs-player-icon svg {
  width: 12px;
  height: 12px;
}

.prior-season-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 17px 10px;
}

.prior-season-grid article {
  min-width: 0;
  padding: 12px 10px;
  border: 1px solid #e5eaf1;
  border-radius: 14px;
  background: #fbfcfe;
  text-align: center;
}

.prior-season-grid strong,
.prior-season-grid span {
  display: block;
}

.prior-season-grid strong {
  color: #17233a;
  font-size: 16px;
  line-height: 1.25;
}

.prior-season-grid span {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
}

.prior-season-source {
  display: block;
  padding: 0 17px 14px;
  color: var(--muted);
  font-size: 11px;
}

@media (max-width: 620px) {
  .wcs-player-icon {
    width: 18px;
    height: 18px;
    flex-basis: 18px;
  }
  .wcs-player-icon svg {
    width: 12px;
    height: 12px;
  }
  .prior-season-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .prior-season-grid {
    gap: 7px;
    padding: 12px 12px 9px;
  }
  .prior-season-grid article {
    padding: 10px 6px;
  }
  .prior-season-grid strong {
    font-size: 14px;
  }
  .prior-season-source {
    padding: 0 12px 12px;
  }
}
'''


def main() -> int:
    write("sync_ivan_history.py", SYNC_SCRIPT)

    js = read("ranking-season-ui.js")
    if "// v2.1.0: IvanPTCG 2025-26 history + WCS 2026 badges." not in js:
        write("ranking-season-ui.js", js + JS_EXTENSION)

    css = read("ranking-season-ui.css")
    if "/* v2.1.0: previous season card + WCS icon */" not in css:
        write("ranking-season-ui.css", css + CSS_EXTENSION)

    version = read("site-version.js")
    version, count = re.subn(r"const SITE_VERSION = 'v[^']+';", "const SITE_VERSION = 'v2.1.0';", version, count=1)
    if count != 1:
        raise RuntimeError("site-version.js version replacement failed")
    write("site-version.js", version)

    index = read("index.html")
    index = re.sub(r'ranking-season-ui\.css\?v=[^"\\]+', 'ranking-season-ui.css?v=2.1.0-r1', index)
    index = re.sub(r'site-version\.js\?v=[^"\\]+', 'site-version.js?v=2.1.0-r1', index)
    index = re.sub(r'ranking-season-ui\.js\?v=[^"\\]+', 'ranking-season-ui.js?v=2.1.0-r1', index)
    write("index.html", index)

    workflow = read(".github/workflows/update-ranking.yml")
    if '      - "sync_ivan_history.py"\n' not in workflow:
        anchor = '      - "merge_te_identity.py"\n'
        if anchor not in workflow:
            raise RuntimeError("update-ranking path anchor not found")
        workflow = workflow.replace(anchor, anchor + '      - "sync_ivan_history.py"\n', 1)
    if '      - name: Sync 2025-26 Ivan history\n' not in workflow:
        anchor = '      - name: Fetch official ranking\n'
        if anchor not in workflow:
            raise RuntimeError("update-ranking step anchor not found")
        workflow = workflow.replace(anchor, '      - name: Sync 2025-26 Ivan history\n        run: python sync_ivan_history.py\n\n' + anchor, 1)
    write(".github/workflows/update-ranking.yml", workflow)

    deploy = read(".github/workflows/deploy-pages.yml")
    if 'data/season_2025_26.json' not in deploy:
        anchor = '          cp data/ranking_history.json _site/data/ranking_history.json\n'
        if anchor not in deploy:
            raise RuntimeError("deploy workflow anchor not found")
        block = '''          cp data/ranking_history.json _site/data/ranking_history.json
          if [ -f data/season_2025_26.json ]; then
            cp data/season_2025_26.json _site/data/season_2025_26.json
          else
            printf '%s\\n' '{"season":"2025-26","updated_at":null,"players":{}}' > _site/data/season_2025_26.json
          fi
'''
        deploy = deploy.replace(anchor, block, 1)
    write(".github/workflows/deploy-pages.yml", deploy)

    subprocess.run(["python", "sync_ivan_history.py"], check=True)
    subprocess.run(["git", "diff", "--check"], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
