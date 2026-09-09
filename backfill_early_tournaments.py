#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""補回 2026-27 賽季一開始因官方搜尋預設日期而漏掉的超級球賽事。

目前確認 2026/09/05-09/06 的官方活動 ID 為 66338-66349。
第一次執行會匯入；之後主 scraper 已會因「保留舊資料」機制持續檢查這些活動與成績。
"""

from __future__ import annotations

import json
from datetime import datetime

from scrape_tournaments import (
    BASE_URL,
    CSP_LEAGUES,
    DATA_FILE,
    SEASON,
    SEASON_END,
    SEASON_START,
    TAIPEI,
    load_existing,
    make_session,
    parse_event_detail,
)

BACKFILL_EVENT_IDS = tuple(str(event_id) for event_id in range(66338, 66350))


def comparable(data: dict) -> dict:
    clone = json.loads(json.dumps(data, ensure_ascii=False))
    clone.pop("updated_at", None)
    for item in clone.get("events", []):
        item.pop("checked_at", None)
    return clone


def main() -> int:
    payload = load_existing()
    old_payload = json.loads(json.dumps(payload, ensure_ascii=False))
    events_by_id = {
        str(item.get("event_id")): item
        for item in payload.get("events", [])
        if item.get("event_id")
    }

    session = make_session()
    imported = 0

    for event_id in BACKFILL_EVENT_IDS:
        old = events_by_id.get(event_id)
        seed = {
            "event_id": event_id,
            "url": f"{BASE_URL}/tw/event-search/{event_id}/",
            "search_text": "2026-27 Taiwan Great Ball League Season 1",
            "league": "Great",
            "group": "Open",
        }
        try:
            item = parse_event_detail(session, seed, old)
        except Exception as exc:
            print(f"警告：補抓活動 {event_id} 失敗：{exc}")
            continue

        if item.get("season") != SEASON or item.get("league") not in CSP_LEAGUES.values():
            continue
        if item.get("date") and not (SEASON_START <= item["date"] <= SEASON_END):
            continue
        if item.get("date") not in {"2026-09-05", "2026-09-06"}:
            print(f"警告：活動 {event_id} 日期為 {item.get('date')}，不屬於 9/5-9/6，略過。")
            continue

        if old is None:
            imported += 1
        events_by_id[event_id] = item

    events = list(events_by_id.values())
    events.sort(
        key=lambda item: (
            item.get("date") or "9999-99-99",
            item.get("league") or "",
            item.get("group") or "",
            int(item.get("event_id") or 0),
        )
    )

    payload["season"] = SEASON
    payload["updated_at"] = datetime.now(TAIPEI).isoformat(timespec="seconds")
    payload.setdefault("source", "https://asia.pokemon-card.com/tw/event-search/list/")
    payload.setdefault(
        "authority_note",
        "本資料供賽事整理與積分核算輔助；正式積分與排名以 Pokémon Asia 官方排行榜為準。",
    )
    payload.setdefault("schedule", ["00:05", "12:05"])
    payload["events"] = events

    if comparable(old_payload) == comparable(payload):
        print("9/5-9/6 超級球賽事已完整存在，無實質變更。")
        return 0

    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已補回 {imported} 場 9/5-9/6 超級球賽事；目前共 {len(events)} 場。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
