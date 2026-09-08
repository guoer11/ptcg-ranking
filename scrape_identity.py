#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

SOURCES_FILE = Path("data/player_identity_sources.json")
OUTPUT_FILE = Path("data/player_identity.json")
TAIPEI = ZoneInfo("Asia/Taipei")
PTCG_ID_RE = re.compile(r"\btw\d{6,12}\b", re.I)

BLOCK_WORDS = {
    "順位", "排名", "氏名", "姓名", "名前", "選手名", "プレイヤー名", "player",
    "勝", "敗", "分", "round", "table", "卓", "対戦", "pt", "point", "points",
}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7",
    })
    return s


def candidate_score(text: str) -> int:
    t = clean(text)
    if not t or len(t) > 40:
        return -999
    low = t.lower()
    if PTCG_ID_RE.search(t):
        return -999
    if re.fullmatch(r"[\d\s\-+./:]+", t):
        return -999
    if any(word.lower() == low for word in BLOCK_WORDS):
        return -999
    if any(word.lower() in low for word in ["http", "round", "table", "point", "順位", "排名"]):
        return -50

    score = 0
    if 2 <= len(t) <= 20:
        score += 4
    if re.search(r"[\u3400-\u9fff\u3040-\u30ff]", t):
        score += 5
    if re.search(r"[A-Za-z]", t):
        score += 1
    if re.search(r"\d", t):
        score -= 2
    return score


def choose_name(cell_texts: list[str], player_id: str) -> str | None:
    candidates = []
    for text in cell_texts:
        t = clean(PTCG_ID_RE.sub("", text))
        if not t:
            continue
        score = candidate_score(t)
        if score > 0:
            candidates.append((score, t))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], len(x[1])))
    return candidates[0][1]


def extract_pairs(html: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}

    # 優先解析表格列，避免跨列誤配。
    for row in soup.find_all("tr"):
        cells = [clean(c.get_text(" ", strip=True)) for c in row.find_all(["td", "th"], recursive=True)]
        row_text = " | ".join(cells)
        ids = PTCG_ID_RE.findall(row_text)
        if not ids:
            continue
        for pid in ids:
            pid = pid.lower()
            name = choose_name(cells, pid)
            if name:
                found.setdefault(pid, name)

    # 備援：部分舊 ASP 頁面不用 table，逐區塊找 ID 與鄰近文字。
    if not found:
        for node in soup.find_all(["div", "li", "p", "span"]):
            text = clean(node.get_text(" ", strip=True))
            ids = PTCG_ID_RE.findall(text)
            if not ids:
                continue
            chunks = [clean(x) for x in re.split(r"[|｜\t]", text) if clean(x)]
            for pid in ids:
                pid = pid.lower()
                name = choose_name(chunks, pid)
                if name:
                    found.setdefault(pid, name)

    return sorted(found.items())


def main() -> int:
    config = load_json(SOURCES_FILE, {"sources": []})
    existing = load_json(OUTPUT_FILE, {"players": {}})
    players = dict(existing.get("players") or {})
    diagnostics = []
    s = session()

    for src in config.get("sources", []):
        url = src.get("url")
        name = src.get("name") or url
        diag = {"source": name, "url": url, "status": "pending", "pairs": 0}
        try:
            r = s.get(url, timeout=30)
            r.raise_for_status()
            if not r.encoding or r.encoding.lower() in {"iso-8859-1", "ascii"}:
                r.encoding = r.apparent_encoding
            pairs = extract_pairs(r.text)
            diag["status"] = "ok"
            diag["pairs"] = len(pairs)

            for pid, real_name in pairs:
                current = dict(players.get(pid) or {})
                current["real_name"] = real_name
                sources = list(current.get("sources") or [])
                source_entry = {"name": name, "url": url}
                if source_entry not in sources:
                    sources.append(source_entry)
                current["sources"] = sources
                players[pid] = current
        except Exception as exc:
            diag["status"] = "error"
            diag["error"] = f"{type(exc).__name__}: {exc}"
        diagnostics.append(diag)

    payload = {
        "updated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "count": len(players),
        "players": dict(sorted(players.items())),
        "diagnostics": diagnostics,
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"姓名資料庫：{len(players)} 位")
    for d in diagnostics:
        print(f"- {d['source']}: {d['status']} / {d.get('pairs', 0)} 對")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
