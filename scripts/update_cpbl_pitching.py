from __future__ import annotations

import csv
import io
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

YEAR = 2026
SOURCE_URL = (
    "https://raw.githubusercontent.com/lin-junyou/cpbl-savant-py-app/"
    "master/data/csv/game_pitchers.csv"
)
OUT = Path("data/cpbl_pitching_2026.json")
FIRST_TEAM_NAMES = {
    "中信兄弟",
    "統一7-ELEVEn獅",
    "樂天桃猿",
    "味全龍",
    "富邦悍將",
    "台鋼雄鷹",
}


def num(value, default=0.0):
    try:
        if value is None or str(value).strip() == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def integer(value, default=0):
    return int(num(value, default))


def ip_text(outs: int) -> str:
    return f"{outs // 3}.{outs % 3}"


def ratio(numerator: float, denominator: float, digits=2):
    if denominator <= 0:
        return None
    return round(numerator / denominator, digits)


def main():
    r = requests.get(
        SOURCE_URL,
        timeout=45,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "text/csv,*/*"},
    )
    r.raise_for_status()
    reader = csv.DictReader(io.StringIO(r.text.lstrip("\ufeff")))

    agg = defaultdict(
        lambda: {
            "team": "",
            "player": "",
            "games": set(),
            "G": 0,
            "GS": 0,
            "GF": 0,
            "BF": 0,
            "PITCHES": 0,
            "IP_outs": 0,
            "H": 0,
            "HR": 0,
            "R": 0,
            "ER": 0,
            "BB": 0,
            "HBP": 0,
            "K": 0,
            "SV_events": 0,
            "HLD_events": 0,
            "W": 0,
            "L": 0,
            "SV_total": 0,
        }
    )

    for row in reader:
        if row.get("kind_code") != "A":
            continue
        date = row.get("date", "")
        if not date.startswith(str(YEAR)):
            continue
        team = (row.get("team_name") or "").strip()
        player = (row.get("pitcher_name") or "").strip()
        if team not in FIRST_TEAM_NAMES or not player:
            continue

        key = f"{team}|{player}"
        a = agg[key]
        a["team"] = team
        a["player"] = player
        game_id = row.get("game_id") or row.get("game_sno") or ""
        a["games"].add(game_id)
        role = (row.get("role_type") or "").strip()
        if role == "先發":
            a["GS"] += 1
        if role == "最後一任":
            a["GF"] += 1
        a["BF"] += integer(row.get("plate_appearances"))
        a["PITCHES"] += integer(row.get("pitch_cnt"))
        a["IP_outs"] += integer(row.get("inning_pitched_cnt")) * 3 + integer(row.get("inning_pitched_div3_cnt"))
        a["H"] += integer(row.get("hitting_cnt"))
        a["HR"] += integer(row.get("home_run_cnt"))
        a["R"] += integer(row.get("run_cnt"))
        a["ER"] += integer(row.get("earned_run_cnt"))
        a["BB"] += integer(row.get("bases_onballs_cnt"))
        a["HBP"] += integer(row.get("hit_bypitch_cnt"))
        a["K"] += integer(row.get("strike_out_cnt"))
        a["SV_events"] += integer(row.get("is_save_ok"))
        a["HLD_events"] += integer(row.get("relief_point_cnt"))
        a["W"] = max(a["W"], integer(row.get("total_w")))
        a["L"] = max(a["L"], integer(row.get("total_l")))
        a["SV_total"] = max(a["SV_total"], integer(row.get("total_s")))

    pitchers = {}
    for key, a in agg.items():
        outs = a["IP_outs"]
        innings = outs / 3 if outs else 0
        g = len(a["games"])
        era = ratio(a["ER"] * 9, innings, 2)
        whip = ratio(a["H"] + a["BB"], innings, 2)
        k9 = ratio(a["K"] * 9, innings, 2)
        bb9 = ratio(a["BB"] * 9, innings, 2)
        h9 = ratio(a["H"] * 9, innings, 2)
        baa_den = max(1, a["BF"] - a["BB"] - a["HBP"])
        baa = round(a["H"] / baa_den, 3)
        pitchers[key] = {
            "team": a["team"],
            "player": a["player"],
            "ERA": era,
            "G": g,
            "GS": a["GS"],
            "GF": a["GF"],
            "W": a["W"],
            "L": a["L"],
            "SV": max(a["SV_total"], a["SV_events"]),
            "HLD": a["HLD_events"],
            "BF": a["BF"],
            "PITCHES": a["PITCHES"],
            "IP": ip_text(outs),
            "IP_outs": outs,
            "H": a["H"],
            "HR": a["HR"],
            "R": a["R"],
            "ER": a["ER"],
            "BB": a["BB"],
            "HBP": a["HBP"],
            "K": a["K"],
            "WHIP": whip,
            "BAA": baa,
            "K9": k9,
            "BB9": bb9,
            "H9": h9,
            "Kpct": ratio(a["K"] * 100, a["BF"], 2),
            "BBpct": ratio(a["BB"] * 100, a["BF"], 2),
            "FIP": None,
            "ERAplus": None,
        }

    if len(pitchers) < 60:
        raise RuntimeError(f"Pitching source returned only {len(pitchers)} usable first-team pitchers")

    payload = {
        "year": YEAR,
        "source": SOURCE_URL,
        "source_note": "Aggregated from 2026 CPBL game pitcher data collected from the public CPBL advanced-data APIs.",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(pitchers),
        "pitchers": pitchers,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(pitchers)} CPBL first-team pitchers to {OUT}")


if __name__ == "__main__":
    main()
