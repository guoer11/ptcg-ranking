#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""從 Pokémon Asia 官方活動頁補抓每場賽事的報名受理期間。

輸出獨立的 data/tournament_registration.json，避免干擾既有賽事主資料。
前端會優先依官方報名起訖時間決定賽事卡片是否可前往官方頁；
若官方頁暫時無法解析報名期間，才退回賽前 7 天關閉的備援規則。
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

from scrape_tournaments import DATA_FILE, REQUEST_DELAY, TAIPEI, clean, make_session, value_after_label

REGISTRATION_FILE = Path("data/tournament_registration.json")


def parse_registration_period(text: str | None) -> tuple[str | None, str | None]:
    """解析官方常見的 08.24.2026 - 08.31.2026 12:00 等格式。"""
    source = clean(text)
    matches: list[tuple[int, int, int, str | None]] = []

    numeric = re.compile(
        r"(?:(?P<year1>20\d{2})[./-](?P<month1>\d{1,2})[./-](?P<day1>\d{1,2})|"
        r"(?P<month2>\d{1,2})[./-](?P<day2>\d{1,2})[./-](?P<year2>20\d{2}))"
        r"(?:\s+(?P<time>\d{1,2}:\d{2}))?"
    )
    for match in numeric.finditer(source):
        matches.append(
            (
                int(match.group("year1") or match.group("year2")),
                int(match.group("month1") or match.group("month2")),
                int(match.group("day1") or match.group("day2")),
                match.group("time"),
            )
        )

    if len(matches) < 2:
        chinese = re.compile(
            r"(?P<year>20\d{2})年\s*(?P<month>\d{1,2})月\s*(?P<day>\d{1,2})日"
            r"(?:\s*(?P<time>\d{1,2}:\d{2}))?"
        )
        matches = [
            (
                int(match.group("year")),
                int(match.group("month")),
                int(match.group("day")),
                match.group("time"),
            )
            for match in chinese.finditer(source)
        ]

    if len(matches) < 2:
        return None, None

    def as_iso(item: tuple[int, int, int, str | None], *, is_end: bool) -> str:
        year, month, day, clock = item
        if clock:
            hour, minute = (int(part) for part in clock.split(":", 1))
            second = 0
        elif is_end:
            # 若官方只有截止日期沒有時間，視為該日結束前仍有效。
            hour, minute, second = 23, 59, 59
        else:
            hour, minute, second = 0, 0, 0
        return datetime(year, month, day, hour, minute, second, tzinfo=TAIPEI).isoformat(timespec="seconds")

    return as_iso(matches[0], is_end=False), as_iso(matches[1], is_end=True)


def extract_registration_text(soup: BeautifulSoup) -> str:
    raw = value_after_label(soup, "報名受理期間")
    if raw:
        return raw

    # 官方版型若不是表格 / dt-dd，從整頁文字中抓標籤後的一小段作備援。
    page_text = clean(soup.get_text(" ", strip=True))
    marker = "報名受理期間"
    if marker not in page_text:
        return ""
    return page_text.split(marker, 1)[1][:180].strip()


def load_json(path: Path, fallback: dict) -> dict:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def main() -> int:
    tournament_payload = load_json(DATA_FILE, {"events": []})
    old_payload = load_json(REGISTRATION_FILE, {"updated_at": None, "events": {}})
    old_events = old_payload.get("events", {}) if isinstance(old_payload.get("events"), dict) else {}

    session = make_session()
    today = datetime.now(TAIPEI).date().isoformat()
    enriched: dict[str, dict] = {}
    parsed_count = 0

    events = tournament_payload.get("events", [])
    for index, event in enumerate(events):
        event_id = str(event.get("event_id") or "").strip()
        url = str(event.get("url") or "").strip()
        event_date = str(event.get("date") or "")[:10]
        old = old_events.get(event_id) if event_id else None
        if not event_id or not url:
            continue

        # 已過期且以前已成功抓到的活動不重複請求；未來活動仍會重查，
        # 以便官方若延長或調整報名期間能自動更新。
        if old and event_date and event_date < today:
            enriched[event_id] = old
            parsed_count += 1
            continue

        try:
            response = session.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            raw = extract_registration_text(soup)
            start_at, end_at = parse_registration_period(raw)
            if start_at and end_at:
                enriched[event_id] = {
                    "registration_start_at": start_at,
                    "registration_end_at": end_at,
                    "registration_period": clean(raw),
                }
                parsed_count += 1
            elif old:
                enriched[event_id] = old
                parsed_count += 1
            else:
                print(f"警告：活動 {event_id} 找不到可解析的報名受理期間。")
        except Exception as exc:
            print(f"警告：活動 {event_id} 報名期間抓取失敗：{exc}")
            if old:
                enriched[event_id] = old
                parsed_count += 1

        if index < len(events) - 1:
            time.sleep(REQUEST_DELAY)

    comparable_old = old_events
    if comparable_old == enriched and REGISTRATION_FILE.exists():
        print(f"報名期間無實質變更；已保存 {parsed_count} 場官方報名資訊。")
        return 0

    payload = {
        "updated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "source": "https://asia.pokemon-card.com/tw/event-search/list/",
        "events": enriched,
    }
    REGISTRATION_FILE.parent.mkdir(parents=True, exist_ok=True)
    REGISTRATION_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"官方報名期間已更新：{parsed_count}/{len(events)} 場成功保存。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
