from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

YEAR = 2026
BASE = "https://www.cpbl.com.tw"
RECORD_URL = (
    f"{BASE}/stats/recordall?year={YEAR}&kindCode=A"
    "&gameType=01&position=01&orderField=00&online=1"
)
API_URL = (
    "https://stats.cpbl.com.tw/api/proxy/v1/leaderboards/pr-table"
    f"?year={YEAR}&searchType=batter&gameKind=A"
)
FALLBACK_CSV_URL = (
    "https://raw.githubusercontent.com/Lily09-project/CPBL-baseball/main/"
    "data/processed/batters_scored.csv"
)
OUT = Path("data/cpbl_batting_2026.json")
TEAM_CODES = {
    "ACN": "中信兄弟",
    "ADD": "統一7-ELEVEn獅",
    "AJL": "樂天桃猿",
    "AAA": "味全龍",
    "AEO": "富邦悍將",
    "AKP": "台鋼雄鷹",
}
TEAM_NAMES = set(TEAM_CODES.values())


def new_session():
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        }
    )
    return s


def as_num(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    value = str(value).strip().replace(",", "")
    if not value or value in {"-", "—", "null", "None"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def as_int(value):
    v = as_num(value)
    return int(v) if v is not None else None


def pick(obj, *names):
    for name in names:
        if isinstance(obj, dict) and name in obj and obj[name] not in (None, ""):
            return obj[name]
    return None


def unwrap_api(payload):
    data = payload.get("Data", payload.get("data", payload)) if isinstance(payload, dict) else payload
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("Leaderboard", "leaderboard", "Rows", "rows", "Items", "items", "Records", "records"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def normalize_api_row(x):
    player_obj = x.get("Player") or x.get("player") or {}
    team_obj = x.get("Team") or x.get("team") or {}
    player = pick(player_obj, "Name", "name") or pick(x, "PlayerName", "playerName", "Name", "name")
    team = pick(team_obj, "Name", "name") or pick(x, "TeamName", "teamName")
    if team not in TEAM_NAMES or not player:
        return None

    avg = as_num(pick(x, "Ba", "BA", "ba", "Avg", "AVG", "avg"))
    obp = as_num(pick(x, "Obp", "OBP", "obp"))
    slg = as_num(pick(x, "Slg", "SLG", "slg"))
    ops = as_num(pick(x, "Ops", "OPS", "ops"))
    if ops is None and obp is not None and slg is not None:
        ops = round(obp + slg, 3)

    return {
        "team": team,
        "player": str(player).strip(),
        "AVG": avg,
        "G": as_int(pick(x, "G", "Games", "games")),
        "PA": as_int(pick(x, "Pa", "PA", "pa")),
        "AB": as_int(pick(x, "Ab", "AB", "ab")),
        "R": as_int(pick(x, "R", "Runs", "runs")),
        "RBI": as_int(pick(x, "Rbi", "RBI", "rbi")),
        "H": as_int(pick(x, "H", "Hits", "hits")),
        "1B": as_int(pick(x, "B1", "1B", "Singles", "singles")),
        "2B": as_int(pick(x, "B2", "2B", "Doubles", "doubles")),
        "3B": as_int(pick(x, "B3", "3B", "Triples", "triples")),
        "HR": as_int(pick(x, "Hr", "HR", "HomeRuns", "homeRuns", "home_runs")),
        "BB": as_int(pick(x, "Bb", "BB", "Walks", "walks")),
        "HBP": as_int(pick(x, "Hbp", "HBP", "hbp")),
        "K": as_int(pick(x, "So", "SO", "K", "Strikeouts", "strikeouts")),
        "SB": as_int(pick(x, "Sb", "SB", "StolenBases", "stolenBases")),
        "OBP": obp,
        "SLG": slg,
        "OPS": ops,
        "OPSplus": as_int(pick(x, "OpsPlus", "OPSplus", "OPS+", "opsPlus")),
    }


def fetch_from_api(session):
    r = session.get(API_URL, timeout=40)
    r.raise_for_status()
    rows = unwrap_api(r.json())
    out = [normalize_api_row(x) for x in rows]
    out = [x for x in out if x]
    if len(out) < 60:
        raise RuntimeError(f"CPBL API returned only {len(out)} usable batting rows")
    return out, API_URL


def fetch_from_record_html(session):
    r = session.get(RECORD_URL, timeout=40)
    r.raise_for_status()
    html = r.text

    headers = [
        re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", h))
        for h in re.findall(r"<th[^>]*>(.*?)</th>", html, re.S)
    ]
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    if not headers or not rows:
        raise RuntimeError("CPBL batting HTML table structure was not found")

    aliases = {
        "AVG": "打擊率",
        "G": "出賽數",
        "PA": "打席",
        "AB": "打數",
        "R": "得分",
        "RBI": "打點",
        "H": "安打",
        "1B": "一安",
        "2B": "二安",
        "3B": "三安",
        "HR": "全壘打",
        "BB": "四壞",
        "HBP": "死球",
        "K": "被三振",
        "SB": "盜壘",
        "OBP": "上壘率",
        "SLG": "長打率",
        "OPS": "整體攻擊指數",
        "OPSplus": "OPS+",
    }
    idx = {k: headers.index(v) if v in headers else None for k, v in aliases.items()}
    if any(idx[k] is None for k in ("AVG", "PA", "H", "OBP", "SLG", "OPS")):
        raise RuntimeError(f"Missing expected CPBL HTML columns: {idx}")

    out = []
    for tr in rows:
        team_m = re.search(r"TeamNo=([A-Z]{3})", tr)
        name_m = re.search(r'/team/person[^>]*>\s*([^<]+?)\s*<', tr)
        if not team_m or not name_m:
            continue
        team = TEAM_CODES.get(team_m.group(1))
        if not team:
            continue
        cells = [re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", c)) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if not cells:
            continue

        # First cell is normally the sticky player/team cell. Numeric table columns follow it.
        numeric = cells[1:]

        def get(key):
            i = idx[key]
            return numeric[i] if i is not None and i < len(numeric) else None

        obp, slg = as_num(get("OBP")), as_num(get("SLG"))
        ops = as_num(get("OPS"))
        if ops is None and obp is not None and slg is not None:
            ops = round(obp + slg, 3)
        out.append(
            {
                "team": team,
                "player": name_m.group(1).strip(),
                "AVG": as_num(get("AVG")),
                "G": as_int(get("G")),
                "PA": as_int(get("PA")),
                "AB": as_int(get("AB")),
                "R": as_int(get("R")),
                "RBI": as_int(get("RBI")),
                "H": as_int(get("H")),
                "1B": as_int(get("1B")),
                "2B": as_int(get("2B")),
                "3B": as_int(get("3B")),
                "HR": as_int(get("HR")),
                "BB": as_int(get("BB")),
                "HBP": as_int(get("HBP")),
                "K": as_int(get("K")),
                "SB": as_int(get("SB")),
                "OBP": obp,
                "SLG": slg,
                "OPS": ops,
                "OPSplus": as_int(get("OPSplus")),
            }
        )

    if len(out) < 60:
        raise RuntimeError(f"CPBL HTML returned only {len(out)} usable batting rows")
    return out, RECORD_URL


def fetch_from_fallback_csv(session):
    r = session.get(FALLBACK_CSV_URL, timeout=40)
    r.raise_for_status()
    text = r.text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    out = []
    for row in reader:
        if str(row.get("season", "")) != str(YEAR):
            continue
        team = row.get("team")
        player = row.get("player_name")
        if team not in TEAM_NAMES or not player:
            continue
        out.append(
            {
                "team": team,
                "player": player.strip(),
                "AVG": as_num(row.get("batting_average")),
                "G": None,
                "PA": as_int(row.get("pa")),
                "AB": as_int(row.get("ab")),
                "R": None,
                "RBI": None,
                "H": as_int(row.get("hits")),
                "1B": None,
                "2B": as_int(row.get("doubles")),
                "3B": as_int(row.get("triples")),
                "HR": as_int(row.get("home_runs")),
                "BB": as_int(row.get("walks")),
                "HBP": None,
                "K": as_int(row.get("strikeouts")),
                "SB": as_int(row.get("stolen_bases")),
                "OBP": as_num(row.get("obp")),
                "SLG": as_num(row.get("slg")),
                "OPS": as_num(row.get("ops")),
                "OPSplus": None,
            }
        )
    if len(out) < 60:
        raise RuntimeError(f"Fallback CSV returned only {len(out)} batting rows")
    return out, FALLBACK_CSV_URL


def main():
    session = new_session()
    errors = []
    rows = None
    source = None
    for loader in (fetch_from_api, fetch_from_record_html, fetch_from_fallback_csv):
        try:
            rows, source = loader(session)
            print(f"Loaded {len(rows)} rows from {source}")
            break
        except Exception as exc:
            errors.append(f"{loader.__name__}: {exc}")
            print(errors[-1])

    if not rows:
        raise RuntimeError("All CPBL batting sources failed: " + " | ".join(errors))

    players = {f'{r["team"]}|{r["player"]}': r for r in rows}
    payload = {
        "year": YEAR,
        "source": source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(players),
        "players": players,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} CPBL batting records to {OUT}")


if __name__ == "__main__":
    main()
