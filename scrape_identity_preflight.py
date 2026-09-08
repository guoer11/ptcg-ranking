#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from scrape_identity import (
    discover_pagination_links,
    extract_pairs,
    session as make_session,
)

SOURCES_FILE = Path("data/player_identity_sources.json")
OUTPUT_FILE = Path("data/player_identity.json")
TAIPEI = ZoneInfo("Asia/Taipei")
MAX_PREFLIGHT_PAGES = 100


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def fetch_with_preflight(src: dict) -> tuple[dict[str, str], dict]:
    source_url = src["url"]
    preflight_url = src["preflight_url"]
    s = make_session()

    pre = s.get(preflight_url, timeout=30)
    pre.raise_for_status()

    queue = [source_url]
    seen: set[str] = set()
    all_pairs: dict[str, str] = {}
    page_stats = []

    while queue and len(seen) < MAX_PREFLIGHT_PAGES:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        r = s.get(url, timeout=30)
        r.raise_for_status()
        if not r.encoding or r.encoding.lower() in {"iso-8859-1", "ascii"}:
            r.encoding = r.apparent_encoding

        pairs, meta = extract_pairs(r.text)
        for pid, real_name in pairs:
            all_pairs.setdefault(pid, real_name)

        page_stats.append({
            "url": url,
            "pairs": len(pairs),
            "rows_with_ids": meta.get("rows_with_ids", 0),
        })

        for link in discover_pagination_links(r.text, url, source_url):
            if link not in seen and link not in queue:
                queue.append(link)

    return all_pairs, {
        "pages": len(seen),
        "page_urls": sorted(seen),
        "page_stats": page_stats,
        "accepted_pairs": len(all_pairs),
        "pagination_truncated": bool(queue),
        "preflight_url": preflight_url,
    }


def merge_source(payload: dict, src: dict, source_pairs: dict[str, str], meta: dict) -> None:
    source_name = src.get("name") or src["url"]
    source_url = src["url"]
    expected_count = src.get("expected_count")
    players = payload.setdefault("players", {})

    for pid, real_name in sorted(source_pairs.items()):
        current = dict(players.get(pid) or {})
        if not current.get("real_name"):
            current["real_name"] = real_name
        elif current.get("real_name") != real_name:
            conflicts = list(current.get("name_conflicts") or [])
            conflict = {"name": real_name, "source": source_name}
            if conflict not in conflicts:
                conflicts.append(conflict)
            current["name_conflicts"] = conflicts

        sources = list(current.get("sources") or [])
        entry = {"name": source_name, "url": source_url}
        if entry not in sources:
            sources.append(entry)
        current["sources"] = sources
        players[pid] = current

    diagnostics = [
        d for d in (payload.get("diagnostics") or [])
        if d.get("source") != source_name
    ]
    diag = {
        "source": source_name,
        "url": source_url,
        "status": "ok",
        "pairs": len(source_pairs),
        "expected_count": expected_count,
        **meta,
    }
    if expected_count is not None:
        diag["count_match"] = len(source_pairs) == int(expected_count)
    diagnostics.append(diag)
    payload["diagnostics"] = diagnostics


def main() -> int:
    config = load_json(SOURCES_FILE, {"sources": []})
    payload = load_json(OUTPUT_FILE, {
        "updated_at": None,
        "count": 0,
        "players": {},
        "diagnostics": [],
    })

    processed = 0
    for src in config.get("sources", []):
        if not src.get("preflight_url"):
            continue
        source_name = src.get("name") or src.get("url")
        try:
            source_pairs, meta = fetch_with_preflight(src)
            merge_source(payload, src, source_pairs, meta)
            expected = src.get("expected_count")
            match = ""
            if expected is not None:
                match = " / MATCH" if len(source_pairs) == int(expected) else " / MISMATCH"
            print(
                f"- {source_name}: ok / {len(source_pairs)} 對 / "
                f"pages={meta.get('pages', 0)}"
                + (f" / expected={expected}" if expected is not None else "")
                + match
            )
            processed += 1
        except Exception as exc:
            print(f"- {source_name}: error / {type(exc).__name__}: {exc}")

    if processed:
        payload["count"] = len(payload.get("players") or {})
        payload["updated_at"] = datetime.now(TAIPEI).isoformat(timespec="seconds")
        OUTPUT_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Preflight 姓名來源處理完成；姓名資料庫共 {payload['count']} 位。")
    else:
        print("沒有需要 preflight 的姓名來源。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
