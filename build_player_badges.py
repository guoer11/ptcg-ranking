#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TOURNAMENTS_PATH = ROOT / "data" / "tournaments.json"
PRIOR_SEASON_PATH = ROOT / "data" / "season_2025_26.json"
WCS_2027_INVITES_PATH = ROOT / "data" / "wcs_2027_invites.json"
OUTPUT_PATH = ROOT / "data" / "player_badges.json"
CURRENT_SEASON = "2026-27"
GREAT_WINDOW_DAYS = 60
TZ = ZoneInfo("Asia/Taipei")

LEAGUE_KEYS = {
    "Great": "great",
    "Ultra": "ultra",
    "Premier": "premier",
}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def normalize_player_id(value: object) -> str:
    return str(value or "").strip().lower()


def normalize_rank(value: object) -> int | None:
    try:
        rank = int(value)
    except (TypeError, ValueError):
        return None
    return rank if rank in (1, 2) else None


def add_finish(players: dict, player_id: str, league_key: str, rank: int, event: dict) -> None:
    player = players.setdefault(player_id, {})
    badge = player.setdefault(
        league_key,
        {
            "best_rank": rank,
            "champion_count": 0,
            "runner_up_count": 0,
            "latest_date": event.get("date") or "",
        },
    )
    badge["best_rank"] = min(int(badge.get("best_rank") or rank), rank)
    if rank == 1:
        badge["champion_count"] = int(badge.get("champion_count") or 0) + 1
    elif rank == 2:
        badge["runner_up_count"] = int(badge.get("runner_up_count") or 0) + 1
    event_date = str(event.get("date") or "")
    if event_date > str(badge.get("latest_date") or ""):
        badge["latest_date"] = event_date


def main() -> None:
    tournaments = load_json(TOURNAMENTS_PATH)
    prior_season = load_json(PRIOR_SEASON_PATH)
    now = datetime.now(TZ)
    today = now.date()
    great_cutoff = today - timedelta(days=GREAT_WINDOW_DAYS - 1)

    players: dict[str, dict] = {}

    for player_id, info in (prior_season.get("players") or {}).items():
        pid = normalize_player_id(player_id)
        if not pid or not isinstance(info, dict):
            continue
        if info.get("worlds_2026"):
            players.setdefault(pid, {})["wcs_2026"] = True

    current_season = str(tournaments.get("season") or CURRENT_SEASON)
    for event in tournaments.get("events") or []:
        if not isinstance(event, dict):
            continue
        event_season = str(event.get("season") or current_season)
        if event_season != CURRENT_SEASON:
            continue
        league = str(event.get("league") or "")
        league_key = LEAGUE_KEYS.get(league)
        if not league_key:
            continue

        event_date_text = str(event.get("date") or "")
        if league == "Great":
            try:
                event_date = datetime.strptime(event_date_text, "%Y-%m-%d").date()
            except ValueError:
                continue
            if event_date < great_cutoff or event_date > today:
                continue

        for result in event.get("results") or []:
            if not isinstance(result, dict):
                continue
            rank = normalize_rank(result.get("rank"))
            pid = normalize_player_id(result.get("player_id"))
            if not rank or not pid.startswith("tw"):
                continue
            add_finish(players, pid, league_key, rank, event)

    # 紀念球 2026/11/8 淘汰賽已由對戰表確認的冠亞軍。
    # 官方 tournaments.json 尚未公布 results 時先以邀請資格資料補足；
    # 官方實績匯入後以同日期、同組別的正式賽事結果為準，避免重複計算。
    if WCS_2027_INVITES_PATH.exists():
        invites = load_json(WCS_2027_INVITES_PATH)
        for player_id, info in (invites.get("players") or {}).items():
            if not isinstance(info, dict):
                continue
            pid = normalize_player_id(player_id)
            rank = normalize_rank(info.get("rank"))
            group = str(info.get("group") or "")
            if not pid.startswith("tw") or rank is None or not group:
                continue
            finalized = any(
                str(event.get("date") or "") == "2026-11-08"
                and event.get("league") == "Premier"
                and event.get("group") == group
                and any(
                    normalize_player_id(result.get("player_id")) == pid
                    and normalize_rank(result.get("rank")) == rank
                    for result in (event.get("results") or [])
                    if isinstance(result, dict)
                )
                for event in (tournaments.get("events") or [])
                if isinstance(event, dict)
            )
            if not finalized:
                add_finish(players, pid, "premier", rank, {"date": "2026-11-08"})

    output = {
        "season": CURRENT_SEASON,
        "generated_at": now.isoformat(timespec="seconds"),
        "great_window_days": GREAT_WINDOW_DAYS,
        "great_cutoff": great_cutoff.isoformat(),
        "players": dict(sorted(players.items())),
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"player badges: {len(players)} players, Great cutoff {great_cutoff.isoformat()}, "
        f"written to {OUTPUT_PATH.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
