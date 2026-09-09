#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""抓取 Pokémon Asia 台灣聯盟賽事與已公開活動結果。

用途：
- 自動發現 2026-27 Great / Ultra / Premier / Master Ball League 活動。
- 比賽結束後持續檢查官方活動頁，若出現公開成績則一併保存。
- 輸出 data/tournaments.json，供賽事資訊頁與後續積分核算使用。

注意：本站計算僅供整理；官方排行榜仍是最終依據。
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://asia.pokemon-card.com"
SEARCH_URL = f"{BASE_URL}/tw/event-search/search/"
DATA_FILE = Path("data/tournaments.json")
TAIPEI = ZoneInfo("Asia/Taipei")
SEASON = "2026-27"
SEASON_START = "2026-09-01"
SEASON_END = "2027-07-31"

# 官方搜尋頁的聯盟篩選目前可由 csps[] 使用。先掃最可能的 5~8，
# 若四種聯盟沒有都找到，再用 1~12 補掃；避免每天大量無意義請求。
PRIMARY_CSP_IDS = (5, 6, 7, 8)
FALLBACK_CSP_IDS = tuple(i for i in range(1, 13) if i not in PRIMARY_CSP_IDS)
MAX_PAGES_PER_CSP = 8
REQUEST_DELAY = 0.12

LEAGUE_KEYWORDS = {
    "Great": "Great Ball League",
    "Ultra": "Ultra Ball League",
    "Premier": "Premier Ball League",
    "Master": "Master Ball League",
}

GROUP_KEYWORDS = {
    "Junior": ("Junior", "孩童組"),
    "Senior": ("Senior", "少年組"),
    "Master": ("Masters", "Master Division", "大師組"),
    "Open": ("Open", "全年齡組"),
}


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/151.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        }
    )
    return session


def clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def classify_league(text: str) -> str | None:
    lowered = text.lower()
    for league, keyword in LEAGUE_KEYWORDS.items():
        if keyword.lower() in lowered:
            return league
    return None


def classify_group(text: str) -> str:
    lowered = text.lower()
    for group, keywords in GROUP_KEYWORDS.items():
        if any(keyword.lower() in lowered for keyword in keywords):
            return group
    return "Open"


def event_id_from_href(href: str) -> str | None:
    match = re.search(r"/tw/event-search/(\d+)/?$", urlparse(href).path)
    return match.group(1) if match else None


def search_page(session: requests.Session, csp_id: int, page_no: int) -> BeautifulSoup:
    params = {"csps[]": str(csp_id), "keyword": "", "pageNo": str(page_no)}
    response = session.get(SEARCH_URL, params=params, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def discover_for_csp(session: requests.Session, csp_id: int) -> dict[str, dict]:
    found: dict[str, dict] = {}
    seen_page_ids: set[tuple[str, ...]] = set()

    for page_no in range(1, MAX_PAGES_PER_CSP + 1):
        soup = search_page(session, csp_id, page_no)
        page_items: dict[str, dict] = {}

        for anchor in soup.find_all("a", href=True):
            href = urljoin(BASE_URL, anchor.get("href"))
            event_id = event_id_from_href(href)
            if not event_id:
                continue
            text = clean(anchor.get_text(" ", strip=True))
            league = classify_league(text)
            if not league or SEASON not in text:
                continue
            page_items[event_id] = {
                "event_id": event_id,
                "url": href,
                "search_text": text,
                "league": league,
                "group": classify_group(text),
            }

        signature = tuple(sorted(page_items))
        if not signature or signature in seen_page_ids:
            break
        seen_page_ids.add(signature)
        found.update(page_items)
        time.sleep(REQUEST_DELAY)

    return found


def discover_events(session: requests.Session) -> dict[str, dict]:
    found: dict[str, dict] = {}

    for csp_id in PRIMARY_CSP_IDS:
        try:
            found.update(discover_for_csp(session, csp_id))
        except Exception as exc:
            print(f"警告：csps[]={csp_id} 搜尋失敗：{exc}")

    discovered_leagues = {item.get("league") for item in found.values()}
    missing = set(LEAGUE_KEYWORDS) - discovered_leagues
    if missing:
        print(f"主要篩選尚缺 {sorted(missing)}，啟用補充搜尋。")
        for csp_id in FALLBACK_CSP_IDS:
            try:
                found.update(discover_for_csp(session, csp_id))
            except Exception as exc:
                print(f"警告：csps[]={csp_id} 補充搜尋失敗：{exc}")
            discovered_leagues = {item.get("league") for item in found.values()}
            if set(LEAGUE_KEYWORDS).issubset(discovered_leagues):
                break

    print(f"發現 {len(found)} 個 {SEASON} 聯盟賽事候選。")
    return found


def value_after_label(soup: BeautifulSoup, label: str) -> str | None:
    # 優先讀真正的資料表列，避免先命中頁首導覽的「會場 / 報名」。
    for row in soup.find_all("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) < 2:
            continue
        if clean(cells[0].get_text(" ", strip=True)) != label:
            continue
        value = clean(cells[1].get_text(" ", strip=True))
        if value and value != label:
            return value

    # dt/dd 結構。
    for term in soup.find_all("dt"):
        if clean(term.get_text(" ", strip=True)) != label:
            continue
        sibling = term.find_next_sibling("dd")
        if sibling:
            value = clean(sibling.get_text(" ", strip=True))
            if value:
                return value

    # 最後備援：逐一檢查所有同名文字節點，而不是只取第一個導覽連結。
    rejected = {"活動概要", "會場", "報名", "事前報名", "主辦方情報", "基本情報"}
    for node in soup.find_all(string=lambda value: value and clean(value) == label):
        parent = node.parent
        if not parent:
            continue
        if parent.name in {"th", "td", "dt"}:
            sibling = parent.find_next_sibling()
            if sibling:
                value = clean(sibling.get_text(" ", strip=True))
                if value and value not in rejected and value != label:
                    return value
        for candidate in parent.find_all_next(limit=10):
            value = clean(candidate.get_text(" ", strip=True))
            if not value or value == label or value in rejected:
                continue
            if len(value) <= 160:
                return value
    return None


def parse_event_datetime(text: str) -> tuple[str | None, str | None]:
    match = re.search(
        r"(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})",
        text,
    )
    if not match:
        return None, None
    year, month, day, start, end = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}", f"{start}-{end}"


def number(text: str | None) -> int | None:
    match = re.search(r"-?\d[\d,]*", text or "")
    return int(match.group(0).replace(",", "")) if match else None


def parse_result_table(soup: BeautifulSoup) -> list[dict]:
    results: list[dict] = []

    for table in soup.find_all("table"):
        headers = [clean(cell.get_text(" ", strip=True)) for cell in table.find_all(["th", "td"], limit=12)]
        header_text = " ".join(headers)
        if "排名" not in header_text or not any(token in header_text for token in ("用戶名", "玩家", "PTCG")):
            continue

        head_cells = table.find("tr")
        header_names = [clean(cell.get_text(" ", strip=True)) for cell in head_cells.find_all(["th", "td"]) ] if head_cells else []

        def column_index(*needles: str) -> int | None:
            for index, header in enumerate(header_names):
                if any(needle in header for needle in needles):
                    return index
            return None

        rank_i = column_index("排名")
        point_i = column_index("得分", "點數", "積分")
        name_i = column_index("用戶名", "玩家")
        id_i = column_index("PTCG")
        region_i = column_index("區域", "地區")

        for row in table.find_all("tr")[1:]:
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.find_all(["td", "th"])]
            if not cells:
                continue
            joined = " ".join(cells)
            player_id_match = re.search(r"\btw\d+\b", joined, flags=re.I)
            if not player_id_match:
                continue

            player_id = player_id_match.group(0).lower()
            rank = number(cells[rank_i]) if rank_i is not None and rank_i < len(cells) else number(cells[0])
            points = number(cells[point_i]) if point_i is not None and point_i < len(cells) else None
            if points is None:
                point_match = re.search(r"(\d[\d,]*)\s*pt", joined, flags=re.I)
                points = int(point_match.group(1).replace(",", "")) if point_match else None
            name = cells[name_i] if name_i is not None and name_i < len(cells) else ""
            region = cells[region_i] if region_i is not None and region_i < len(cells) else ""

            # 若沒有明確姓名欄，找 PTCG ID 前一格當備援。
            if not name and id_i is not None and id_i > 0 and id_i - 1 < len(cells):
                name = cells[id_i - 1]

            results.append(
                {
                    "rank": rank,
                    "points": points,
                    "name": name,
                    "player_id": player_id,
                    "region": region,
                }
            )

        if results:
            break

    # 部分官方結果使用 div 模擬表格，沒有 <table>；再做一層備援。
    if not results:
        for row in soup.select(".tableRow"):
            text = clean(row.get_text(" ", strip=True))
            id_match = re.search(r"\btw\d+\b", text, flags=re.I)
            point_match = re.search(r"(\d[\d,]*)\s*pt", text, flags=re.I)
            if not id_match or not point_match:
                continue
            cells = [clean(child.get_text(" ", strip=True)) for child in row.find_all(recursive=False)]
            results.append(
                {
                    "rank": number(cells[0] if cells else text),
                    "points": int(point_match.group(1).replace(",", "")),
                    "name": cells[1] if len(cells) > 1 else "",
                    "player_id": id_match.group(0).lower(),
                    "region": cells[3] if len(cells) > 3 else "",
                }
            )

    unique: list[dict] = []
    seen: set[str] = set()
    for item in results:
        key = item.get("player_id") or f"{item.get('rank')}:{item.get('name')}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    unique.sort(key=lambda item: (item.get("rank") is None, item.get("rank") or 999999))
    return unique


def parse_event_detail(session: requests.Session, seed: dict, old: dict | None = None) -> dict:
    response = session.get(seed["url"], timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    page_text = clean(soup.get_text(" ", strip=True))

    title_node = soup.find("h1")
    title = clean(title_node.get_text(" ", strip=True)) if title_node else seed.get("search_text", "")
    league = classify_league(title) or seed.get("league")
    group = classify_group(f"{title} {seed.get('search_text', '')}")
    date, event_time = parse_event_datetime(page_text)

    venue = value_after_label(soup, "會場")
    address = value_after_label(soup, "地址")
    capacity = number(value_after_label(soup, "人數限制"))
    region = ""
    for token in ("臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣", "基隆市", "新竹市", "嘉義市"):
        if token in page_text:
            region = token
            break

    results = parse_result_table(soup)
    checked_at = datetime.now(TAIPEI).isoformat(timespec="seconds")
    old = old or {}

    item = {
        "event_id": seed["event_id"],
        "season": SEASON,
        "league": league,
        "group": group,
        "title": title,
        "date": date or old.get("date"),
        "time": event_time or old.get("time"),
        "venue": venue or old.get("venue") or "",
        "region": region or old.get("region") or "",
        "address": address or old.get("address") or "",
        "capacity": capacity if capacity is not None else old.get("capacity"),
        "url": seed["url"],
        "results": results if results else old.get("results", []),
        "result_count": len(results if results else old.get("results", [])),
        "discovered_at": old.get("discovered_at") or checked_at,
        "checked_at": checked_at,
    }
    return item


def load_existing() -> dict:
    if not DATA_FILE.exists():
        return {"season": SEASON, "updated_at": None, "events": []}
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"season": SEASON, "updated_at": None, "events": []}


def main() -> int:
    session = make_session()
    old_payload = load_existing()
    old_events = {str(item.get("event_id")): item for item in old_payload.get("events", []) if item.get("event_id")}

    discovered = discover_events(session)
    # 舊資料保留，避免官方搜尋頁暫時異常時整批消失。
    for event_id, old in old_events.items():
        if event_id not in discovered:
            discovered[event_id] = {
                "event_id": event_id,
                "url": old.get("url") or f"{BASE_URL}/tw/event-search/{event_id}/",
                "search_text": old.get("title", ""),
                "league": old.get("league"),
                "group": old.get("group", "Open"),
            }

    events: list[dict] = []
    for index, (event_id, seed) in enumerate(sorted(discovered.items(), key=lambda pair: int(pair[0]))):
        old = old_events.get(event_id)
        try:
            item = parse_event_detail(session, seed, old)
        except Exception as exc:
            print(f"警告：活動 {event_id} 詳情抓取失敗：{exc}")
            if old:
                item = old
            else:
                continue
        if item.get("season") != SEASON or item.get("league") not in LEAGUE_KEYWORDS:
            continue
        if item.get("date") and not (SEASON_START <= item["date"] <= SEASON_END):
            continue
        events.append(item)
        if index < len(discovered) - 1:
            time.sleep(REQUEST_DELAY)

    events.sort(key=lambda item: (item.get("date") or "9999-99-99", item.get("league") or "", item.get("group") or "", int(item.get("event_id") or 0)))
    now = datetime.now(TAIPEI).isoformat(timespec="seconds")
    payload = {
        "season": SEASON,
        "updated_at": now,
        "source": "https://asia.pokemon-card.com/tw/event-search/list/",
        "authority_note": "本資料供賽事整理與積分核算輔助；正式積分與排名以 Pokémon Asia 官方排行榜為準。",
        "schedule": ["00:05", "12:05"],
        "events": events,
    }

    # updated_at/checked_at 不應造成每次都 commit。先比較實質內容。
    def comparable(data: dict) -> dict:
        clone = json.loads(json.dumps(data, ensure_ascii=False))
        clone.pop("updated_at", None)
        for item in clone.get("events", []):
            item.pop("checked_at", None)
        return clone

    if comparable(old_payload) == comparable(payload):
        print("賽事資料無實質變更，不改寫檔案。")
        return 0

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"賽事資料已更新：{len(events)} 場；{sum(len(item.get('results', [])) for item in events)} 筆成績。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())