#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""PTCG 台灣官方排名抓取器。

使用環境變數 POKEMON_EMAIL / POKEMON_PASSWORD 登入官方訓練家網站，
抓取 Master / Senior / Junior 排名頁，解析後輸出 data/ranking.json。
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://asia.pokemon-card.com"
LOGIN_URL = f"{BASE_URL}/tw/login/"
GROUPS = ("Master", "Senior", "Junior")
DATA_FILE = Path("data/ranking.json")
HISTORY_DIR = Path("data/history")
TAIPEI = ZoneInfo("Asia/Taipei")


def clean_text(node) -> str:
    return " ".join(node.stripped_strings).strip()


def number(text: str):
    match = re.search(r"-?\d[\d,]*", text or "")
    return int(match.group(0).replace(",", "")) if match else None


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


def login(session: requests.Session, email: str, password: str) -> None:
    page = session.get(LOGIN_URL, timeout=30)
    page.raise_for_status()
    soup = BeautifulSoup(page.text, "html.parser")

    form = soup.find("form", method=lambda v: v and v.lower() == "post") or soup.find("form")
    payload = {}
    action = LOGIN_URL

    if form:
        action = urljoin(LOGIN_URL, form.get("action") or LOGIN_URL)
        for inp in form.find_all("input"):
            name = inp.get("name")
            if name and (inp.get("type") or "").lower() == "hidden":
                payload[name] = inp.get("value", "")

    payload["email"] = email
    payload["password"] = password
    payload.setdefault("redirectTo", "")

    result = session.post(
        action,
        data=payload,
        headers={"Referer": LOGIN_URL},
        timeout=30,
        allow_redirects=True,
    )
    result.raise_for_status()

    if "/tw/login" in result.url:
        raise RuntimeError("登入失敗：登入後仍停留在 /tw/login/。請確認 GitHub Secrets 帳密。")

    print(f"登入成功：{result.url}")


def row_cells(row) -> list[str]:
    direct = []
    for child in row.find_all(recursive=False):
        text = clean_text(child)
        if text:
            direct.append(text)
    if len(direct) >= 4:
        return direct[:4]

    # 官方結構若日後多包一層，使用常見文字節點當備援。
    fallback = []
    for child in row.find_all(["h4", "p", "span"], recursive=True):
        text = clean_text(child)
        if text and text not in fallback:
            fallback.append(text)
    return fallback[:4]


def parse_rows(soup: BeautifulSoup) -> list[dict]:
    table = soup.select_one(".rankingTable")
    if not table:
        raise RuntimeError("找不到 .rankingTable，官方頁面結構可能已更改。")

    headers = [clean_text(x) for x in table.select(".tableHeader h4")]
    if headers and headers[:4] != ["排名", "用戶名", "區域", "得分"]:
        print(f"警告：官方表頭與預期不同：{headers}")

    players = []
    for row in table.select(".tableRow:not(.tableHeader)"):
        cells = row_cells(row)
        if len(cells) < 4:
            print(f"略過無法解析的資料列：{clean_text(row)}")
            continue

        rank_text, name, region, points_text = cells[:4]
        link = row.find("a", href=True)
        player_url = urljoin(BASE_URL, link["href"]) if link else None
        player_id = None
        if player_url:
            match = re.search(r"/tw/users/([^/]+)/?", player_url)
            if match:
                player_id = match.group(1)

        players.append(
            {
                "rank": number(rank_text),
                "name": name,
                "player_id": player_id,
                "region": region,
                "points": number(points_text),
                "player_url": player_url,
            }
        )

    return players


def pagination_links(soup: BeautifulSoup, group: str, current_url: str) -> list[str]:
    found = []
    expected_path = f"/tw/mypage/ranking/{group}/"
    for a in soup.select(".myPaginationBlock a[href]"):
        url = urljoin(current_url, a.get("href"))
        parsed = urlparse(url)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            continue
        if not parsed.path.startswith(expected_path):
            continue
        found.append(url)
    return found


def fetch_group(session: requests.Session, group: str) -> list[dict]:
    first = f"{BASE_URL}/tw/mypage/ranking/{group}/"
    queue = [first]
    seen = set()
    rows = []

    while queue and len(seen) < 100:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        response = session.get(url, timeout=30, allow_redirects=True)
        response.raise_for_status()
        if "/tw/login" in response.url:
            raise RuntimeError(f"{group} 排名頁被導回登入頁，Session 已失效。")

        soup = BeautifulSoup(response.text, "html.parser")
        page_rows = parse_rows(soup)
        rows.extend(page_rows)
        for link in pagination_links(soup, group, response.url):
            if link not in seen and link not in queue:
                queue.append(link)

    # 排除重複資料列。
    unique = []
    keys = set()
    for item in rows:
        key = item.get("player_id") or (item.get("rank"), item.get("name"), item.get("points"))
        if key in keys:
            continue
        keys.add(key)
        unique.append(item)

    unique.sort(key=lambda x: (x.get("rank") is None, x.get("rank") or 999999))
    print(f"{group}: {len(unique)} 位玩家 / {len(seen)} 頁")
    return unique


def load_existing() -> dict:
    if not DATA_FILE.exists():
        return {}
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_if_changed(groups: dict) -> bool:
    old = load_existing()
    old_groups = old.get("groups", {})
    if old_groups == groups:
        print("排名資料無變更，不改寫檔案。")
        return False

    now = datetime.now(TAIPEI)
    payload = {
        "season": "2026-27",
        "updated_at": now.isoformat(timespec="seconds"),
        "source": "https://asia.pokemon-card.com/tw/mypage/ranking/",
        "groups": groups,
    }

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    history_file = HISTORY_DIR / f"{now.date().isoformat()}.json"
    history_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"排名已更新：{payload['updated_at']}")
    return True


def main() -> int:
    email = os.getenv("POKEMON_EMAIL", "").strip()
    password = os.getenv("POKEMON_PASSWORD", "")
    if not email or not password:
        print("缺少 POKEMON_EMAIL / POKEMON_PASSWORD 環境變數。", file=sys.stderr)
        return 2

    session = make_session()
    login(session, email, password)

    groups = {}
    for group in GROUPS:
        groups[group] = fetch_group(session, group)

    save_if_changed(groups)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
