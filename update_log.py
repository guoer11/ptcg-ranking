#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""產生網站最近更新紀錄。

排名與賽事各自維護獨立 JSON，避免兩個 GitHub Actions 同時執行時互相衝突。
前端再合併兩份紀錄，只顯示最近 5 筆。
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
MAX_PER_SOURCE = 5
RANKING_FILE = Path("data/ranking.json")
TOURNAMENT_FILE = Path("data/tournaments.json")
REGISTRATION_FILE = Path("data/tournament_registration.json")
RANKING_LOG = Path("data/update_log_ranking.json")
TOURNAMENT_LOG = Path("data/update_log_tournaments.json")
GROUPS = ("Master", "Senior", "Junior")
LEAGUE_LABELS = {"Great": "超級球", "Ultra": "高級球", "Premier": "紀念球", "Master": "大師球"}


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def git_json(path: Path, fallback):
    try:
        result = subprocess.run(
            ["git", "show", f"HEAD:{path.as_posix()}"],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return json.loads(result.stdout)
    except Exception:
        return fallback


def write_log(path: Path, entry: dict) -> None:
    current = read_json(path, {"max_entries": MAX_PER_SOURCE, "entries": []})
    entries = [item for item in (current.get("entries") or []) if item.get("id") != entry.get("id")]
    entries.insert(0, entry)
    path.write_text(
        json.dumps({"max_entries": MAX_PER_SOURCE, "entries": entries[:MAX_PER_SOURCE]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def changed_in_worktree(path: Path) -> bool:
    result = subprocess.run(["git", "diff", "--quiet", "--", path.as_posix()])
    return result.returncode != 0


def player_key(item: dict) -> str:
    return str(item.get("player_id") or item.get("name") or "").lower()


def ranking_entry() -> dict | None:
    if not changed_in_worktree(RANKING_FILE):
        return None

    old = git_json(RANKING_FILE, {})
    new = read_json(RANKING_FILE, {})
    old_groups = old.get("groups") or {}
    new_groups = new.get("groups") or {}

    total_rank = total_points = total_entered = total_left = total_name = total_region = 0
    details: list[str] = []
    examples: list[str] = []

    for group in GROUPS:
        old_map = {player_key(item): item for item in (old_groups.get(group) or [])}
        new_map = {player_key(item): item for item in (new_groups.get(group) or [])}
        rank = points = entered = left = names = regions = 0

        for key, item in new_map.items():
            before = old_map.get(key)
            if before is None:
                entered += 1
                if len(examples) < 4:
                    examples.append(f"{group} 進榜：{item.get('name') or item.get('player_id') or key}")
                continue
            if before.get("rank") != item.get("rank"):
                rank += 1
            if before.get("points") != item.get("points"):
                points += 1
            if before.get("name") != item.get("name"):
                names += 1
                if len(examples) < 4:
                    examples.append(f"{group} 暱稱：{before.get('name') or '—'} → {item.get('name') or '—'}")
            if before.get("region") != item.get("region"):
                regions += 1

        for key, item in old_map.items():
            if key not in new_map:
                left += 1
                if len(examples) < 4:
                    examples.append(f"{group} 離榜：{item.get('name') or item.get('player_id') or key}")

        total_rank += rank
        total_points += points
        total_entered += entered
        total_left += left
        total_name += names
        total_region += regions

        bits = []
        if rank:
            bits.append(f"名次 {rank}")
        if points:
            bits.append(f"積分 {points}")
        if entered:
            bits.append(f"進榜 {entered}")
        if left:
            bits.append(f"離榜 {left}")
        if names:
            bits.append(f"暱稱 {names}")
        if regions:
            bits.append(f"地區 {regions}")
        if bits:
            details.append(f"{group}：" + "、".join(bits))

    effective = total_rank + total_points + total_entered + total_left
    if effective:
        summary = (
            f"有效排名變動：名次 {total_rank}、積分 {total_points}、"
            f"進榜 {total_entered}、離榜 {total_left}"
        )
    elif total_name or total_region:
        summary = f"無排名／積分變動；暱稱 {total_name}、地區 {total_region} 筆異動"
    else:
        summary = "排行榜資料內容無可見變動"

    updated_at = new.get("updated_at") or datetime.now(TAIPEI).isoformat(timespec="seconds")
    return {
        "id": f"ranking-{updated_at}",
        "type": "ranking",
        "title": "排行榜資料更新",
        "updated_at": updated_at,
        "summary": summary,
        "details": (details + examples)[:7],
        "notified": bool(effective),
    }


def registration_events(payload: dict) -> dict:
    events = payload.get("events") if isinstance(payload, dict) else {}
    return events if isinstance(events, dict) else {}


def tournament_entry() -> dict | None:
    if not changed_in_worktree(TOURNAMENT_FILE) and not changed_in_worktree(REGISTRATION_FILE):
        return None

    old = git_json(TOURNAMENT_FILE, {})
    new = read_json(TOURNAMENT_FILE, {})
    old_registration = registration_events(git_json(REGISTRATION_FILE, {}))
    new_registration = registration_events(read_json(REGISTRATION_FILE, {}))

    old_map = {str(item.get("event_id")): item for item in (old.get("events") or []) if item.get("event_id")}
    new_map = {str(item.get("event_id")): item for item in (new.get("events") or []) if item.get("event_id")}

    added: list[dict] = []
    removed: list[dict] = []
    restored: list[dict] = []
    results: list[dict] = []
    detail_changed: list[dict] = []
    status_changed: list[dict] = []

    visible_keys = ("title", "date", "time", "venue", "region", "address", "capacity", "league", "group")

    for event_id, item in new_map.items():
        before = old_map.get(event_id)
        if before is None:
            added.append(item)
            continue
        old_status = before.get("official_status")
        new_status = item.get("official_status")
        if old_status in ("removed", "unavailable") and new_status == "active":
            restored.append(item)
        elif old_status != new_status:
            status_changed.append(item)
        if not (before.get("results") or []) and (item.get("results") or []):
            results.append(item)
        if any(before.get(key) != item.get(key) for key in visible_keys):
            detail_changed.append(item)

    for event_id, item in old_map.items():
        if event_id not in new_map:
            removed.append(item)

    registration_changed = 0
    for event_id in set(old_registration) | set(new_registration):
        if old_registration.get(event_id) != new_registration.get(event_id):
            registration_changed += 1

    bits = []
    if added:
        bits.append(f"新增 {len(added)} 場")
    if restored:
        bits.append(f"恢復上架 {len(restored)} 場")
    if results:
        bits.append(f"新增成績 {len(results)} 場")
    if removed:
        bits.append(f"移除 {len(removed)} 場")
    if detail_changed:
        bits.append(f"資料修正 {len(detail_changed)} 場")
    if status_changed and not restored:
        bits.append(f"狀態變更 {len(status_changed)} 場")
    if registration_changed:
        bits.append(f"報名期間更新 {registration_changed} 場")

    summary = "；".join(bits) if bits else "例行檢查完成；賽事可見內容無變動"
    details: list[str] = []

    if added:
        league_counts: dict[str, int] = {}
        for item in added:
            label = LEAGUE_LABELS.get(item.get("league"), item.get("league") or "其他")
            league_counts[label] = league_counts.get(label, 0) + 1
        details.append("新增賽事：" + "、".join(f"{key} {value}" for key, value in league_counts.items()))

    if restored:
        names = [f"{item.get('date') or '—'} {item.get('venue') or item.get('title') or '未命名'}" for item in restored[:3]]
        details.append("恢復上架：" + "、".join(names) + (f" 等 {len(restored)} 場" if len(restored) > 3 else ""))

    if results:
        names = [item.get("venue") or item.get("title") or "未命名" for item in results[:3]]
        details.append("新增官方成績：" + "、".join(names) + (f" 等 {len(results)} 場" if len(results) > 3 else ""))

    if detail_changed:
        names = [item.get("venue") or item.get("title") or "未命名" for item in detail_changed[:3]]
        details.append("資料修正：" + "、".join(names) + (f" 等 {len(detail_changed)} 場" if len(detail_changed) > 3 else ""))

    if registration_changed:
        details.append(f"官方報名期間資料異動：{registration_changed} 場")

    updated_at = new.get("updated_at") or datetime.now(TAIPEI).isoformat(timespec="seconds")
    return {
        "id": f"tournaments-{updated_at}",
        "type": "tournaments",
        "title": "賽事資訊更新",
        "updated_at": updated_at,
        "summary": summary,
        "details": details[:7],
        "notified": bool(added or results),
    }


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"ranking", "tournaments"}:
        print("用法：python update_log.py ranking|tournaments", file=sys.stderr)
        return 2

    kind = sys.argv[1]
    entry = ranking_entry() if kind == "ranking" else tournament_entry()
    if not entry:
        print(f"{kind}: 沒有對應資料變更，不新增更新紀錄。")
        return 0

    path = RANKING_LOG if kind == "ranking" else TOURNAMENT_LOG
    write_log(path, entry)
    print(f"{kind}: 已新增更新紀錄：{entry['summary']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
