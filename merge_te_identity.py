#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

OUTPUT_FILE = Path("data/player_identity.json")
TAIPEI = ZoneInfo("Asia/Taipei")
TE_PAGE_URL = "https://ptcg.bcb.idv.tw/TE"
TE_SEARCH_URL = "https://ptcg.bcb.idv.tw/TE/SearchPlayers"
TE_SOURCE_NAME = "IvanPTCG 台灣賽事玩家搜尋"
PTCG_ID_RE = re.compile(r"tw\d{6,12}", re.I)


def clean(text: object) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def load_payload() -> dict:
    try:
        payload = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"無法讀取既有姓名資料：{exc}") from exc
    if not isinstance(payload.get("players"), dict):
        raise RuntimeError("既有姓名資料格式不正確")
    return payload


def fetch_te_players() -> tuple[dict[str, str], dict]:
    response = requests.get(
        TE_SEARCH_URL,
        params={"keyword": "tw"},
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
            "Accept": "application/json,text/plain,*/*",
            "Referer": TE_PAGE_URL,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("success") is not True:
        raise RuntimeError("TE 搜尋玩家 API 回傳失敗")

    rows = data.get("players") or []
    found: dict[str, str] = {}
    placeholder_count = 0
    invalid_count = 0

    for row in rows:
        pid = clean(row.get("twpid")).lower()
        real_name = clean(row.get("cName"))
        if not PTCG_ID_RE.fullmatch(pid) or not real_name:
            invalid_count += 1
            continue
        # TE 內部分 cName 只是把 PTCG ID 原樣放回，這不是可用的真實姓名。
        if PTCG_ID_RE.fullmatch(real_name) or real_name.lower() == pid:
            placeholder_count += 1
            continue
        found.setdefault(pid, real_name)

    return found, {
        "raw_rows": len(rows),
        "accepted_pairs": len(found),
        "placeholder_names_dropped": placeholder_count,
        "invalid_rows_dropped": invalid_count,
    }


def main() -> int:
    payload = load_payload()
    players = payload["players"]
    te_pairs, meta = fetch_te_players()

    added = 0
    filled_blank = 0
    same = 0
    conflicts = 0

    for pid, real_name in sorted(te_pairs.items()):
        existed = pid in players
        current = dict(players.get(pid) or {})
        existing_name = clean(current.get("real_name"))

        if not existing_name:
            current["real_name"] = real_name
            if existed:
                filled_blank += 1
            else:
                added += 1
        elif existing_name == real_name:
            same += 1
        else:
            conflicts += 1
            name_conflicts = list(current.get("name_conflicts") or [])
            conflict = {"name": real_name, "source": TE_SOURCE_NAME}
            if conflict not in name_conflicts:
                name_conflicts.append(conflict)
            current["name_conflicts"] = name_conflicts

        sources = list(current.get("sources") or [])
        source_entry = {"name": TE_SOURCE_NAME, "url": TE_PAGE_URL}
        if source_entry not in sources:
            sources.append(source_entry)
        current["sources"] = sources
        players[pid] = current

    diagnostics = [
        d for d in (payload.get("diagnostics") or [])
        if d.get("source") != TE_SOURCE_NAME
    ]
    diagnostics.append({
        "source": TE_SOURCE_NAME,
        "url": TE_PAGE_URL,
        "status": "ok",
        "pairs": len(te_pairs),
        "added_new_ids": added,
        "filled_blank_names": filled_blank,
        "same_names": same,
        "name_conflicts_kept_existing": conflicts,
        **meta,
    })

    payload["diagnostics"] = diagnostics
    payload["count"] = len(players)
    payload["updated_at"] = datetime.now(TAIPEI).isoformat(timespec="seconds")
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        "TE 姓名合併完成："
        f"可用 {len(te_pairs)} 筆；新增 {added}；補空白 {filled_blank}；"
        f"既有相同 {same}；衝突保留原值 {conflicts}；"
        f"合併後共 {len(players)} 位。"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
