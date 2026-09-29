#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""產生網站最近更新紀錄。

排行榜與賽事各自維護最近 5 筆，避免兩個 GitHub Actions 同時執行時互相衝突。
紀錄會保留足夠細節，讓右上角「最近更新紀錄」可以查到實際改了哪些玩家／賽事。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
MAX_PER_SOURCE = 5
MAX_DETAIL_LINES = 20
RANKING_FILE = Path("data/ranking.json")
TOURNAMENT_FILE = Path("data/tournaments.json")
REGISTRATION_FILE = Path("data/tournament_registration.json")
RANKING_LOG = Path("data/update_log_ranking.json")
TOURNAMENT_LOG = Path("data/update_log_tournaments.json")
GROUPS = ("Master", "Senior", "Junior")
LEAGUE_LABELS = {"Great": "超級球", "Ultra": "高級球", "Premier": "紀念球", "Master": "大師球"}
FIELD_LABELS = {
    "title": "名稱",
    "date": "日期",
    "time": "時間",
    "venue": "店家／場地",
    "region": "地區",
    "address": "地址",
    "capacity": "人數",
    "league": "賽事類型",
    "group": "組別",
}


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


def shown(value) -> str:
    if value is None or value == "":
        return "—"
    return str(value)


def trigger_source(kind: str) -> str:
    """將 GitHub Actions 事件轉成容易看懂的觸發來源。"""
    event_name = os.getenv("GITHUB_EVENT_NAME", "").strip()

    if event_name == "schedule":
        return "GitHub 備援排程"
    if event_name == "push":
        return "程式更新觸發"
    if event_name == "workflow_dispatch":
        # Supabase 主排程是透過 workflow_dispatch 呼叫 GitHub Actions。
        # 若未來人工手動執行，也會是同一事件，因此用執行時間輔助判斷。
        now = datetime.now(TAIPEI)
        minute_of_day = now.hour * 60 + now.minute
        expected = [5] if kind == "ranking" else [1, 12 * 60 + 1, 17 * 60 + 1]
        if any(0 <= minute_of_day - target <= 20 for target in expected):
            return "主排程（Supabase）"
        return "手動／主動觸發"
    return event_name or "未知來源"


def ranking_entry() -> dict | None:
    if not changed_in_worktree(RANKING_FILE):
        return None

    old = git_json(RANKING_FILE, {})
    new = read_json(RANKING_FILE, {})
    old_groups = old.get("groups") or {}
    new_groups = new.get("groups") or {}

    total_rank = total_points = total_entered = total_left = total_name = total_region = 0
    group_summaries: list[str] = []
    player_changes: list[str] = []

    for group in GROUPS:
        old_map = {player_key(item): item for item in (old_groups.get(group) or [])}
        new_map = {player_key(item): item for item in (new_groups.get(group) or [])}
        rank = points = entered = left = names = regions = 0

        for key, item in new_map.items():
            before = old_map.get(key)
            player_id = item.get("player_id") or before.get("player_id") if before else item.get("player_id")
            player_id = player_id or key
            latest_name = item.get("name") or "—"

            if before is None:
                entered += 1
                player_changes.append(
                    f"{group}｜{player_id}｜{latest_name}｜進榜：第 {shown(item.get('rank'))} 名 / {shown(item.get('points'))} pt"
                )
                continue

            changes: list[str] = []
            if before.get("rank") != item.get("rank"):
                rank += 1
                changes.append(f"名次 {shown(before.get('rank'))} → {shown(item.get('rank'))}")
            if before.get("points") != item.get("points"):
                points += 1
                changes.append(f"積分 {shown(before.get('points'))} → {shown(item.get('points'))}")
            if before.get("name") != item.get("name"):
                names += 1
                changes.append(f"暱稱 {shown(before.get('name'))} → {shown(item.get('name'))}")
            if before.get("region") != item.get("region"):
                regions += 1
                changes.append(f"地區 {shown(before.get('region'))} → {shown(item.get('region'))}")

            if changes:
                player_changes.append(f"{group}｜{player_id}｜" + "；".join(changes))

        for key, item in old_map.items():
            if key not in new_map:
                left += 1
                player_id = item.get("player_id") or key
                player_changes.append(
                    f"{group}｜{player_id}｜{item.get('name') or '—'}｜離榜：原第 {shown(item.get('rank'))} 名 / {shown(item.get('points'))} pt"
                )

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
            group_summaries.append(f"{group}：" + "、".join(bits))

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

    details = (group_summaries + player_changes)[:MAX_DETAIL_LINES]
    if len(group_summaries) + len(player_changes) > MAX_DETAIL_LINES:
        details.append(f"其餘 {len(group_summaries) + len(player_changes) - MAX_DETAIL_LINES} 筆細節省略")

    updated_at = new.get("updated_at") or datetime.now(TAIPEI).isoformat(timespec="seconds")
    return {
        "id": f"ranking-{updated_at}",
        "type": "ranking",
        "title": "排行榜資料更新",
        "updated_at": updated_at,
        "summary": summary,
        "details": details,
        "notified": bool(effective),
    }


def registration_events(payload: dict) -> dict:
    events = payload.get("events") if isinstance(payload, dict) else {}
    return events if isinstance(events, dict) else {}


def event_label(item: dict) -> str:
    if not item:
        return "未知賽事"
    event_id = item.get("event_id") or "—"
    date = item.get("date") or "—"
    venue = item.get("venue") or item.get("title") or "未命名"
    region = item.get("region") or ""
    return f"#{event_id}｜{date}｜{venue}" + (f"｜{region}" if region else "")


def registration_label(item: dict) -> str:
    if not item:
        return "—"
    return item.get("registration_period") or (
        f"{shown(item.get('registration_start_at'))} ～ {shown(item.get('registration_end_at'))}"
    )


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
    detail_changes: list[tuple[dict, list[str]]] = []
    status_changes: list[tuple[dict, object, object]] = []

    visible_keys = tuple(FIELD_LABELS)

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
            status_changes.append((item, old_status, new_status))

        if not (before.get("results") or []) and (item.get("results") or []):
            results.append(item)

        changed_fields = []
        for key in visible_keys:
            if before.get(key) != item.get(key):
                changed_fields.append(
                    f"{FIELD_LABELS[key]} {shown(before.get(key))} → {shown(item.get(key))}"
                )
        if changed_fields:
            detail_changes.append((item, changed_fields))

    for event_id, item in old_map.items():
        if event_id not in new_map:
            removed.append(item)

    registration_changes: list[tuple[str, dict, dict]] = []
    for event_id in sorted(set(old_registration) | set(new_registration)):
        before = old_registration.get(event_id) or {}
        after = new_registration.get(event_id) or {}
        if before != after:
            registration_changes.append((event_id, before, after))

    bits = []
    if added:
        bits.append(f"新增 {len(added)} 場")
    if restored:
        bits.append(f"恢復上架 {len(restored)} 場")
    if results:
        bits.append(f"新增成績 {len(results)} 場")
    if removed:
        bits.append(f"移除 {len(removed)} 場")
    if detail_changes:
        bits.append(f"資料修正 {len(detail_changes)} 場")
    if status_changes:
        bits.append(f"狀態變更 {len(status_changes)} 場")
    if registration_changes:
        bits.append(f"報名期間更新 {len(registration_changes)} 場")

    summary = "；".join(bits) if bits else "例行檢查完成；賽事可見內容無變動"
    details: list[str] = []

    for item in added:
        league = LEAGUE_LABELS.get(item.get("league"), item.get("league") or "其他")
        details.append(
            f"新增｜{event_label(item)}｜{league}｜{shown(item.get('capacity'))} 人"
        )

    for item in restored:
        details.append(f"恢復上架｜{event_label(item)}")

    for item in results:
        details.append(f"新增官方成績｜{event_label(item)}｜{len(item.get('results') or [])} 筆")

    for item in removed:
        details.append(f"移除｜{event_label(item)}")

    for item, old_status, new_status in status_changes:
        details.append(f"狀態｜{event_label(item)}｜{shown(old_status)} → {shown(new_status)}")

    for item, changes in detail_changes:
        details.append(f"資料修正｜{event_label(item)}｜" + "；".join(changes))

    for event_id, before, after in registration_changes:
        item = new_map.get(event_id) or old_map.get(event_id) or {"event_id": event_id}
        details.append(
            f"報名期間｜{event_label(item)}｜{registration_label(before)} → {registration_label(after)}"
        )

    if len(details) > MAX_DETAIL_LINES:
        omitted = len(details) - MAX_DETAIL_LINES
        details = details[:MAX_DETAIL_LINES] + [f"其餘 {omitted} 筆細節省略"]

    updated_at = new.get("updated_at") or datetime.now(TAIPEI).isoformat(timespec="seconds")
    return {
        "id": f"tournaments-{updated_at}",
        "type": "tournaments",
        "title": "賽事資訊更新",
        "updated_at": updated_at,
        "summary": summary,
        "details": details,
        "notified": bool(added or results),
    }


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"ranking", "tournaments"}:
        print("用法：python update_log.py ranking|tournaments", file=sys.stderr)
        return 2

    kind = sys.argv[1]
    entry = ranking_entry() if kind == "ranking" else tournament_entry()
    if entry:
        entry["trigger_source"] = trigger_source(kind)
    if not entry:
        print(f"{kind}: 沒有對應資料變更，不新增更新紀錄。")
        return 0

    path = RANKING_LOG if kind == "ranking" else TOURNAMENT_LOG
    write_log(path, entry)
    print(f"{kind}: 已新增更新紀錄：{entry['summary']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
