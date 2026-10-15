#!/usr/bin/env python3
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
