#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch public TCG Meister standings without changing official Pokémon Asia results."""
import argparse
import json
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
SOURCES = ROOT / "data" / "preliminary_sources.json"
OUTPUT = ROOT / "data" / "preliminary_results.json"
TOURNAMENTS = ROOT / "data" / "tournaments.json"
BASE = "https://tcg.sfc-jpn.jp/tourround.asp"
ID_RE = re.compile(r"\btw\d{6,12}\b", re.I)
PAGE_RE = re.compile(r"\bPage=(\d+)", re.I)
RANK_RE = re.compile(r"^\d+$")
USER_AGENT = "Mozilla/5.0 (compatible; PTCG-Ranking-Standings/2.4; +https://guoer11.github.io/ptcg-ranking/)"


def read_json(path, fallback=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else fallback


def save_json(path, payload):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def ranking_url(tid, page=1):
    query = urlencode({"tid": tid, "kno": 9999999, "Page": page, "Sort": "Number", "Order": "", "znt": 1})
    return f"{BASE}?{query}"


def get_page(session, tid, page):
    url = ranking_url(tid, page)
    response = session.get(url, timeout=(10, 25), allow_redirects=True)
    response.raise_for_status()
    if response.url.split("?")[0].lower() != BASE:
        raise ValueError(f"Unexpected official redirect: {response.url}")
    if len(response.content) > 2_000_000:
        raise ValueError("Official ranking page is too large")
    if re.search(r"shift[_-]?jis|windows-31j|cp932", response.headers.get("content-type", ""), re.I):
        response.encoding = "shift_jis"
    elif re.search(rb"charset\s*=\s*['\"]?(?:shift[_-]?jis|windows-31j|cp932)", response.content[:3000], re.I):
        response.encoding = "shift_jis"
    else:
        response.encoding = "utf-8"
    return response.text


def parse_standings(raw):
    soup = BeautifulSoup(raw, "html.parser")
    rows = []
    has_rank_header = False
    for tr in soup.select("tr"):
        cells = [cell.get_text(" ", strip=True).replace("\xa0", " ").strip() for cell in tr.find_all(["td", "th"], recursive=False)]
        if any(re.sub(r"\s+", "", c).lower() == "rank" for c in cells):
            has_rank_header = True
        if not cells or not RANK_RE.fullmatch(cells[0]):
            continue
        match = None
        for cell in cells[1:]:
            match = ID_RE.search(cell)
            if match:
                break
        if match:
            rows.append({"player_id": match.group(0).lower(), "rank": int(cells[0])})
    return rows, has_rank_header


def fetch_standings(session, tid):
    first = get_page(session, tid, 1)
    raw_pages = [first]
    page_links = [int(m) for m in PAGE_RE.findall(first)]
    total_pages = max([1] + page_links)
    if total_pages > 100:
        raise ValueError("Official ranking has more than 100 pages")
    for page in range(2, total_pages + 1):
        raw_pages.append(get_page(session, tid, page))
    rows = []
    for raw in raw_pages:
        entries, header = parse_standings(raw)
        if not header:
            raise ValueError("Official ranking header not found; not a published ranking")
        if not entries:
            raise ValueError("Official ranking page has no players")
        if max([1] + [int(n) for n in PAGE_RE.findall(raw)]) > total_pages:
            raise ValueError("Official page count changed while fetching")
        rows.extend(entries)
    ids = [row["player_id"] for row in rows]
    ranks = [row["rank"] for row in rows]
    if len(rows) < 9 or len(set(ids)) != len(ids) or len(set(ranks)) != len(ranks):
        raise ValueError("Incomplete or duplicate official ranking")
    # This site publishes unique sequential ranks. Fail closed rather than using a partial field size.
    if sorted(ranks) != list(range(1, len(rows) + 1)):
        raise ValueError("Ranking is not contiguous; participant count is unverified")
    return sorted(rows, key=lambda r: r["rank"])


def lp_score(league, participants, rank):
    if league == "Ultra":
        if not (1 <= participants <= 1024 and 1 <= rank <= participants):
            return None
        bands = [(1, 1, 100), (2, 2, 75), (3, 4, 50), (5, 8, 25), (9, 16, 20)]
        if participants >= 65:
            bands.append((17, 32, 15))
        if participants >= 129:
            bands.append((33, 64, 10))
        if participants >= 257:
            bands.append((65, 128, 8))
        if participants >= 513:
            bands.append((129, 256, 6))
    elif league == "Premier":
        if not (1 <= participants and 1 <= rank <= participants):
            return None
        bands = [(1, 1, 150), (2, 2, 100), (3, 4, 75), (5, 8, 50),
                 (9, 16, 25), (17, 32, 15), (33, 64, 10), (65, 128, 5)]
    else:
        return None
    return next((value for start, end, value in bands if start <= rank <= end), 0)


def sync():
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", help="Optional official event ID to register after a live pairing event")
    parser.add_argument("--tid", help="TCG Meister tournament ID for the official event")
    args = parser.parse_args()
    if bool(args.event_id) != bool(args.tid):
        parser.error("--event-id and --tid must be provided together")
    config = read_json(SOURCES, {"version": 1, "sources": []})
    events = {str(event["event_id"]): event for event in read_json(TOURNAMENTS)["events"]}
    if args.event_id:
        if not (args.event_id.isdigit() and re.fullmatch(r"\d{1,12}", args.tid)):
            parser.error("Invalid official event ID or TID")
        event = events.get(args.event_id)
        if not event or event["league"] not in ("Ultra", "Premier") or event.get("group") != "Junior":
            parser.error("Event must be a known official Junior Ultra/Premier competition")
        match = next((row for row in config["sources"] if row["event_id"] == args.event_id), None)
        if match:
            match["tid"] = args.tid
        else:
            config["sources"].append({"event_id": args.event_id, "tid": args.tid,
                                     "league": event["league"], "group": event["group"],
                                     "ranking_type": "preliminary" if event["league"] == "Ultra" else "final"})
    old = read_json(OUTPUT, {"version": 1, "updated_at": None, "events": {}})
    new_events = dict(old.get("events", {}))
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html",
                            "Cache-Control": "no-cache"})
    changed = False
    attempted = 0
    for source in config["sources"]:
        event_id = str(source["event_id"])
        event = events.get(event_id)
        tid = str(source.get("tid") or "").strip()
        if not tid:
            continue
        if not event or event.get("league") != source["league"] or event.get("group") != source["group"]:
            raise ValueError(f"Event {event_id} does not match the mapped league/group")
        if event.get("results"):
            print(f"Event {event_id}: Pokémon Asia official result already exists; retained as priority")
            continue
        attempted += 1
        standings = fetch_standings(session, tid)
        participants = len(standings)
        ranking_type = source["ranking_type"]
        if ranking_type not in ("preliminary", "final"):
            raise ValueError("Invalid ranking_type")
        if event["league"] == "Ultra" and ranking_type != "preliminary":
            raise ValueError("Ultra top 8 requires separate final validation")
        if event["league"] == "Premier" and ranking_type != "final":
            raise ValueError("Premier requires confirmed final standings")
        for row in standings:
            if ranking_type == "preliminary" and row["rank"] <= 8:
                row["points"] = None
                row["status"] = "pending-final"
            else:
                row["points"] = lp_score(event["league"], participants, row["rank"])
                row["status"] = "estimated" if row["points"] is not None else "unverified"
        current = {"event_id": event_id, "tid": tid, "league": event["league"],
                   "group": event["group"], "date": event["date"],
                   "ranking_type": ranking_type, "participants": participants,
                   "source_url": ranking_url(tid), "standings": standings}
        if new_events.get(event_id) != current:
            new_events[event_id] = current
            changed = True
        print(f"Event {event_id}: {participants} official ranking rows, top8 pending={ranking_type == 'preliminary'}")
    if not attempted and not args.event_id:
        print("No pending official preliminary sources; nothing to fetch")
    if changed:
        save_json(OUTPUT, {"version": 1,
                           "updated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
                           "events": new_events})
    if args.event_id:
        save_json(SOURCES, config)
    print(f"Changes: {changed}; sources registered: {len(config['sources'])}")


if __name__ == "__main__":
    sync()
