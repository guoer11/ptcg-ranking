#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""確保每次排名抓取成功後都有一筆可見的例行檢查紀錄。

update_log.py 會在 ranking.json 有內容差異時產生詳細紀錄；若官方排名完全沒有
變動，ranking.json 不會形成 worktree diff，因此舊邏輯不會留下任何紀錄。
此腳本只在 update_log.py 沒有產生紀錄時補上一筆「官方排名無變動」。
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
LOG_FILE = Path("data/update_log_ranking.json")
MAX_ENTRIES = 5


def log_changed() -> bool:
    result = subprocess.run(["git", "diff", "--quiet", "--", LOG_FILE.as_posix()])
    return result.returncode != 0


def trigger_source() -> str:
    event_name = os.getenv("GITHUB_EVENT_NAME", "").strip()
    if event_name == "schedule":
        return "GitHub 備援排程"
    if event_name == "push":
        return "程式更新觸發"
    if event_name == "workflow_dispatch":
        now = datetime.now(TAIPEI)
        minute_of_day = now.hour * 60 + now.minute
        if 0 <= minute_of_day - 5 <= 20:
            return "主排程（Supabase）"
        return "手動／主動觸發"
    return event_name or "未知來源"


def main() -> int:
    # update_log.py 已經產生有效紀錄時，不再補第二筆。
    if log_changed():
        print("ranking: 已有本次更新紀錄，不新增例行檢查紀錄。")
        return 0

    try:
        payload = json.loads(LOG_FILE.read_text(encoding="utf-8"))
    except Exception:
        payload = {"max_entries": MAX_ENTRIES, "entries": []}

    now = datetime.now(TAIPEI).replace(microsecond=0)
    updated_at = now.isoformat()
    entry = {
        "id": f"ranking-{updated_at}",
        "type": "ranking",
        "title": "排行榜資料更新",
        "updated_at": updated_at,
        "summary": "例行檢查完成；官方排名無變動",
        "details": [],
        "notified": False,
        "trigger_source": trigger_source(),
    }

    entries = payload.get("entries") or []
    entries = [item for item in entries if item.get("id") != entry["id"]]
    entries.insert(0, entry)
    LOG_FILE.write_text(
        json.dumps({"max_entries": MAX_ENTRIES, "entries": entries[:MAX_ENTRIES]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("ranking: 已新增例行檢查紀錄：官方排名無變動")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
