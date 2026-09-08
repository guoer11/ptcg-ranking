#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import html as html_lib
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

SOURCES_FILE = Path("data/player_identity_sources.json")
OUTPUT_FILE = Path("data/player_identity.json")
TAIPEI = ZoneInfo("Asia/Taipei")
PTCG_ID_RE = re.compile(r"\btw\d{6,12}\b", re.I)
MAX_PAGES_PER_SOURCE = 30

BLOCK_WORDS = {
    "順位", "排名", "氏名", "姓名", "名前", "選手名", "プレイヤー名", "player",
    "勝", "敗", "分", "round", "table", "卓", "対戦", "pt", "point", "points",
}
PAGER_LABELS = {"prevpage", "nextpage", "previous", "next", "前へ", "次へ", "上一頁", "下一頁"}


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


def best_name(texts: list[str]) -> str | None:
    candidates = []
    for text in texts:
        t = clean(PTCG_ID_RE.sub("", text))
        if not t:
            continue
        score = candidate_score(t)
        if score > 0:
            candidates.append((score, len(t), t))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], x[1]))
    return candidates[0][2]


def extract_pairs(html: str) -> tuple[list[tuple[str, str]], dict]:
    soup = BeautifulSoup(html, "html.parser")
    raw_pairs: list[tuple[str, str]] = []
    rows_with_ids = 0

    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"], recursive=False)
        if not cells:
            cells = row.find_all(["td", "th"], recursive=True)
        texts = [clean(c.get_text(" ", strip=True)) for c in cells]
        if not any(PTCG_ID_RE.search(t) for t in texts):
            continue
        rows_with_ids += 1

        for idx, text in enumerate(texts):
            ids = PTCG_ID_RE.findall(text)
            if not ids:
                continue
            same_cell_name = best_name([text])
            neighbors = []
            if idx > 0:
                neighbors.append(texts[idx - 1])
            if idx + 1 < len(texts):
                neighbors.append(texts[idx + 1])
            name = same_cell_name or best_name(neighbors)
            if name:
                raw_pairs.extend((pid.lower(), name) for pid in ids)

    name_to_ids: dict[str, set[str]] = {}
    for pid, name in raw_pairs:
        name_to_ids.setdefault(name, set()).add(pid)
    suspicious = {name for name, ids in name_to_ids.items() if len(ids) > 3}

    found: dict[str, str] = {}
    for pid, name in raw_pairs:
        if name not in suspicious:
            found.setdefault(pid, name)

    return sorted(found.items()), {
        "rows_with_ids": rows_with_ids,
        "accepted_pairs": len(found),
        "suspicious_names_dropped": sorted(suspicious),
    }


def same_ranking_source(candidate_url: str, source_url: str) -> bool:
    c = urlparse(candidate_url)
    s = urlparse(source_url)
    if c.netloc and c.netloc != s.netloc:
        return False
    if not c.path.lower().endswith("tourround.asp"):
        return False

    cq = parse_qs(c.query)
    sq = parse_qs(s.query)
    for key in ("tid", "kno", "znt"):
        if sq.get(key) and cq.get(key) != sq.get(key):
            return False
    return True


def discover_pagination_links(html: str, current_url: str, source_url: str) -> list[str]:
    """TCG Meister builds its pager inside JavaScript strings, so parse both DOM anchors and raw script URLs."""
    candidates: list[str] = []
    soup = BeautifulSoup(html, "html.parser")

    for a in soup.find_all("a", href=True):
        label = clean(a.get_text(" ", strip=True)).lower()
        href = a["href"]
        if label.isdigit() or label in PAGER_LABELS or "page=" in href.lower():
            candidates.append(urljoin(current_url, href))

    # Example embedded in JS:
    # /tourround.asp?tid=2217685&kno=9999999&Page=2&Sort=Table&Order=&znt=1
    for raw in re.findall(r"(/tourround\.asp\?[^\"'<>\s\\]+)", html, flags=re.I):
        candidates.append(urljoin(current_url, html_lib.unescape(raw)))

    unique = []
    seen = set()
    for link in candidates:
        if link in seen:
            continue
        if "page=" not in link.lower():
            continue
        if same_ranking_source(link, source_url):
            seen.add(link)
            unique.append(link)
    return unique


def fetch_source_pages(s: requests.Session, source_url: str) -> tuple[dict[str, str], dict]:
    queue = [source_url]
    seen: set[str] = set()
    all_pairs: dict[str, str] = {}
    page_stats = []

    while queue and len(seen) < MAX_PAGES_PER_SOURCE:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        r = s.get(url, timeout=30)
        r.raise_for_status()
        if not r.encoding or r.encoding.lower() in {"iso-8859-1", "ascii"}:
            r.encoding = r.apparent_encoding

        pairs, meta = extract_pairs(r.text)
        conflicts = []
        for pid, real_name in pairs:
            if pid in all_pairs and all_pairs[pid] != real_name:
                conflicts.append({"player_id": pid, "old": all_pairs[pid], "new": real_name})
                continue
            all_pairs.setdefault(pid, real_name)

        page_stats.append({
            "url": url,
            "pairs": len(pairs),
            "rows_with_ids": meta.get("rows_with_ids", 0),
            "conflicts": conflicts,
        })

        for link in discover_pagination_links(r.text, url, source_url):
            if link not in seen and link not in queue:
                queue.append(link)

    name_to_ids: dict[str, set[str]] = {}
    for pid, name in all_pairs.items():
        name_to_ids.setdefault(name, set()).add(pid)
    suspicious = {name for name, ids in name_to_ids.items() if len(ids) > 3}
    if suspicious:
        all_pairs = {pid: name for pid, name in all_pairs.items() if name not in suspicious}

    return all_pairs, {
        "pages": len(seen),
        "page_urls": sorted(seen),
        "page_stats": page_stats,
        "accepted_pairs": len(all_pairs),
        "suspicious_names_dropped": sorted(suspicious),
        "pagination_truncated": bool(queue),
    }


def main() -> int:
    config = load_json(SOURCES_FILE, {"sources": []})
    players: dict[str, dict] = {}
    diagnostics = []
    s = session()

    for src in config.get("sources", []):
        url = src.get("url")
        source_name = src.get("name") or url
        expected_count = src.get("expected_count")
        diag = {
            "source": source_name,
            "url": url,
            "status": "pending",
            "pairs": 0,
            "expected_count": expected_count,
        }
        try:
            source_pairs, meta = fetch_source_pages(s, url)
            diag.update(meta)
            diag["status"] = "ok"
            diag["pairs"] = len(source_pairs)
            if expected_count is not None:
                diag["count_match"] = len(source_pairs) == int(expected_count)

            for pid, real_name in sorted(source_pairs.items()):
                current = dict(players.get(pid) or {})
                if not current.get("real_name"):
                    current["real_name"] = real_name
                elif current.get("real_name") != real_name:
                    aliases = list(current.get("name_conflicts") or [])
                    conflict = {"name": real_name, "source": source_name}
                    if conflict not in aliases:
                        aliases.append(conflict)
                    current["name_conflicts"] = aliases

                sources = list(current.get("sources") or [])
                entry = {"name": source_name, "url": url}
                if entry not in sources:
                    sources.append(entry)
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
        expected = d.get("expected_count")
        expected_text = f" / expected={expected}" if expected is not None else ""
        match_text = " / MATCH" if d.get("count_match") is True else (" / MISMATCH" if d.get("count_match") is False else "")
        print(
            f"- {d['source']}: {d['status']} / {d.get('pairs', 0)} 對 / "
            f"pages={d.get('pages', 0)}{expected_text}{match_text}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
