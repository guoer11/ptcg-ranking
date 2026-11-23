#!/usr/bin/env python3
"""Publish owner-verified knockout results only after checking the archived prelim 8.

Official Pokémon Asia event results still always override these trial scores.
"""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
PRELIM = BASE / "data/preliminary_results.json"
EVENTS = BASE / "data/tournaments.json"
OUTPUT = BASE / "data/knockout_results.json"


def build_knockout(payload, official, preliminary, existing):
    event_id = str(payload.get("event_id") or "")
    tid = str(payload.get("tid") or "")
    if not (event_id.isdecimal() and tid.isdecimal()
            and len(event_id) <= 12 and len(tid) <= 12):
        raise ValueError("Invalid event ID or TID")
    event = next((x for x in official["events"] if str(x["event_id"]) == event_id), None)
    source = preliminary.get("events", {}).get(event_id)
    if not event or event.get("group") != "Junior" or event.get("league") != "Ultra":
        raise ValueError("Not a registered Junior Ultra event")
    if not source or source.get("tid") != tid or source.get("date") != event.get("date"):
        raise ValueError("Preliminary standings are not linked to this official event")
    if len(source.get("standings") or []) < 9:
        raise ValueError("Missing complete preliminary standings")
    ranks = {p["player_id"]: p["rank"] for p in source["standings"]
             if isinstance(p.get("rank"), int) and 1 <= p["rank"] <= 8}
    if len(ranks) != 8 or set(ranks.values()) != set(range(1,9)):
        raise ValueError("The eight qualifying players could not be verified")
    results = payload.get("results")
    if not isinstance(results, list) or len(results) != 8:
        raise ValueError("The knockout result must contain eight players")
    valid_points = {1: 100, 2: 75, 3: 50, 5: 25}
    valid_finishes = {1: "冠軍", 2: "亞軍", 3: "四強", 5: "八強"}
    seen = set()
    for r in results:
        if not isinstance(r, dict):
            raise ValueError("Invalid knockout player")
        pid = str(r.get("player_id") or "").lower()
        rank = r.get("final_rank")
        if (pid not in ranks or pid in seen
                or r.get("preliminary_rank") != ranks[pid] or type(rank) is not int
                or r.get("points") != valid_points.get(rank)
                or r.get("finish") != valid_finishes.get(rank)):
            raise ValueError("The saved knockout result conflicts with standings")
        seen.add(pid)
    if seen != set(ranks) or sorted(r["final_rank"] for r in results) != [1,2,3,3,5,5,5,5]:
        raise ValueError("Incorrect Top 8 podium counts")
    source_url = str(payload.get("source_url") or "")
    if not source_url.startswith("https://tcg.sfc-jpn.jp/tourround.asp?tid=" + tid + "&"):
        raise ValueError("Unverified official ranking URL")
    row = {
        "event_id": event_id, "date": event["date"], "league": "Ultra", "group": "Junior",
        "source_type": "owner_entered_knockout", "source_url": source_url,
        "verification": "Authorized owner-entered final Top 8 placements; validated against the archived official preliminary Top 8. Pokémon Asia official results take priority.",
        "results": sorted(results, key=lambda r: (r["final_rank"], r["preliminary_rank"]))
    }
    # Preserve historical data even if an official event has results. The
    # front-end ignores it for trial when Pokémon Asia has final scores.
    old = existing.get("events", {}).get(event_id)
    if old == row:
        return existing, False
    update = dict(existing)
    update["events"] = dict(existing.get("events") or {})
    update["events"][event_id] = row
    update["updated_at"] = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    return update, True


def main():
    payload = json.loads(os.environ["KNOCKOUT_PAYLOAD"])
    official = json.loads(EVENTS.read_text(encoding="utf-8"))
    preliminary = json.loads(PRELIM.read_text(encoding="utf-8"))
    existing = json.loads(OUTPUT.read_text(encoding="utf-8"))
    updated, changed = build_knockout(payload, official, preliminary, existing)
    if changed:
        tmp = OUTPUT.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, OUTPUT)
    print("Knockout published:", changed, "event:", payload.get("event_id"),
          "official override:", any(x.get("results") for x in official["events"]
            if str(x.get("event_id")) == str(payload.get("event_id"))))


if __name__ == "__main__":
    main()
