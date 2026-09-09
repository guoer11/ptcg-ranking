#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import requests

PUSH_URL = "https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-push"
SITE_ROOT = "/ptcg-ranking/"
LEAGUE_LABELS = {
    "Great": "超級球",
    "Ultra": "高級球",
    "Premier": "紀念球",
    "Master": "大師球",
}
GROUP_LABELS = {"Junior": "孩童組", "Senior": "少年組", "Master": "大師組"}


def build_sync_token(private_key: str) -> str:
    normalized = private_key.strip().replace("\r\n", "\n")
    material = f"ptcg-ranking-identity-sync-v1\n{normalized}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def load_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_head_json(path: str) -> dict | None:
    result = subprocess.run(
        ["git", "show", f"HEAD:{path}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return json.loads(result.stdout)


def send(sync_token: str, *, category: str, title: str, body: str, url: str, tag: str) -> None:
    response = requests.post(
        PUSH_URL,
        headers={
            "x-sync-token": sync_token,
            "Content-Type": "application/json",
        },
        json={
            "action": "broadcast",
            "category": category,
            "title": title,
            "body": body,
            "url": url,
            "tag": tag,
        },
        timeout=45,
    )
    response.raise_for_status()
    data = response.json()
    print(
        f"Push {category}: subscribers={data.get('subscribers', 0)}, "
        f"sent={data.get('sent', 0)}, removed={data.get('removed', 0)}"
    )
    if data.get("failures"):
        print("Push failures:", data["failures"])


def notify_ranking(sync_token: str) -> None:
    path = "data/ranking.json"
    current = load_json(path)
    previous = load_head_json(path) or {"groups": {}}
    current_groups = current.get("groups") or {}
    previous_groups = previous.get("groups") or {}

    changed = []
    for group in ("Junior", "Senior", "Master"):
        if (current_groups.get(group) or []) != (previous_groups.get(group) or []):
            changed.append(group)

    if not changed:
        print("Ranking push: no ranking changes.")
        return

    old_count = sum(len(previous_groups.get(group) or []) for group in ("Junior", "Senior", "Master"))
    new_count = sum(len(current_groups.get(group) or []) for group in ("Junior", "Senior", "Master"))
    if new_count == 0:
        print("Ranking push: ranking is still empty; skip notification.")
        return

    labels = "、".join(GROUP_LABELS[group] for group in changed)
    if old_count == 0:
        title = "2026-27 官方排行榜已公布"
        body = f"{labels}已有正式排名資料，可以到網站查看。"
        tag = "ptcg-ranking-published"
    else:
        title = "PTCG 官方排行榜已更新"
        body = f"{labels}排名／積分有新的變動。"
        tag = "ptcg-ranking-updated"

    send(
        sync_token,
        category="ranking",
        title=title,
        body=body,
        url=SITE_ROOT,
        tag=tag,
    )


def normalize_grouped_title(title: str) -> str:
    text = title or ""
    text = re.sub(r"\s*[（(](孩童組|少年組|大師組)[）)]\s*$", "", text)
    text = re.sub(r"\s+TCG\s+Category\s+(Junior|Senior|Master)\s+Division\s*$", "", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def physical_event_key(event: dict) -> tuple:
    group = event.get("group") or "Open"
    if group == "Open":
        return (event.get("event_id"),)
    return (
        event.get("league"),
        event.get("date"),
        normalize_grouped_title(event.get("title") or ""),
    )


def format_md(date_value: str | None) -> str:
    match = re.match(r"^\d{4}-(\d{2})-(\d{2})", str(date_value or ""))
    return f"{int(match.group(1))}/{int(match.group(2))}" if match else "日期未定"


def notify_tournaments(sync_token: str) -> None:
    path = "data/tournaments.json"
    current = load_json(path)
    previous = load_head_json(path) or {"events": []}
    old_events = {str(item.get("event_id")): item for item in previous.get("events", []) if item.get("event_id")}
    current_events = {str(item.get("event_id")): item for item in current.get("events", []) if item.get("event_id")}

    new_events = [event for event_id, event in current_events.items() if event_id not in old_events]
    if new_events:
        by_league: dict[str, list[dict]] = {}
        for event in new_events:
            league = event.get("league")
            if league in LEAGUE_LABELS:
                by_league.setdefault(league, []).append(event)

        for league, events in by_league.items():
            physical = {}
            for event in events:
                physical.setdefault(physical_event_key(event), event)
            items = list(physical.values())
            dates = []
            for event in sorted(items, key=lambda item: str(item.get("date") or "")):
                label = format_md(event.get("date"))
                if label not in dates:
                    dates.append(label)
            date_text = "、".join(dates[:4])
            if len(dates) > 4:
                date_text += "…"
            count = len(items)
            send(
                sync_token,
                category=f"tournament:{league}",
                title=f"新增 {LEAGUE_LABELS[league]}賽事",
                body=f"官方新增 {count} 場{LEAGUE_LABELS[league]}賽事" + (f"：{date_text}" if date_text else "。"),
                url=f"{SITE_ROOT}tournaments.html",
                tag=f"ptcg-tournament-{league.lower()}",
            )
    else:
        print("Tournament push: no new events.")

    result_updates = []
    for event_id, event in current_events.items():
        old = old_events.get(event_id)
        if not old:
            continue
        old_count = len(old.get("results") or [])
        new_count = len(event.get("results") or [])
        if old_count == 0 and new_count > 0:
            result_updates.append(event)

    if result_updates:
        send(
            sync_token,
            category="results",
            title="官方賽事成績已公布",
            body=f"有 {len(result_updates)} 筆活動新增官方成績，可以到賽事資訊查看。",
            url=f"{SITE_ROOT}tournaments.html",
            tag="ptcg-tournament-results",
        )


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"ranking", "tournaments"}:
        print("Usage: python send_push_update.py ranking|tournaments")
        return 2

    private_key = os.environ.get("PLAYER_IDENTITY_PRIVATE_KEY", "")
    if not private_key.strip():
        raise RuntimeError("PLAYER_IDENTITY_PRIVATE_KEY is required for push authentication")
    sync_token = build_sync_token(private_key)

    if sys.argv[1] == "ranking":
        notify_ranking(sync_token)
    else:
        notify_tournaments(sync_token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
