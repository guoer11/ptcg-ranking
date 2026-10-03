from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

YEAR = 2026
BASE = "https://www.cpbl.com.tw"
URL = (
    f"{BASE}/stats/recordall?year={YEAR}&kindCode=A"
    "&gameType=01&position=01&orderField=00&online=1"
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


def new_session():
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            "X-Requested-With": "XMLHttpRequest",
        }
    )
    return s


def as_num(value: str):
    value = value.strip().replace(",", "")
    if not value or value in {"-", "—"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def as_int(value: str):
    v = as_num(value)
    return int(v) if v is not None else None


def fetch_batting_table():
    s = new_session()
    html = s.get(URL, timeout=40).text

    headers = [
        re.sub(r"\s+", "", h)
        for h in re.findall(
            r'<th class="num[^"]*"(?:\s+data-sortby="\d*")?[^>]*>\s*([^<\n]+?)\s*<',
            html,
        )
    ]
    rows = re.findall(r'<td class="sticky">(.*?)</td>(.*?)</tr>', html, re.S)
    if not headers or not rows:
        raise RuntimeError("CPBL batting table structure was not found")

    def idx(name: str):
        try:
            return headers.index(name)
        except ValueError:
            return None

    columns = {
        "AVG": idx("打擊率"),
        "G": idx("出賽數"),
        "PA": idx("打席"),
        "AB": idx("打數"),
        "R": idx("得分"),
        "RBI": idx("打點"),
        "H": idx("安打"),
        "1B": idx("一安"),
        "2B": idx("二安"),
        "3B": idx("三安"),
        "HR": idx("全壘打"),
        "BB": idx("四壞"),
        "HBP": idx("死球"),
        "K": idx("被三振"),
        "SB": idx("盜壘"),
        "OBP": idx("上壘率"),
        "SLG": idx("長打率"),
        "OPS": idx("整體攻擊指數"),
        "OPSplus": idx("OPS+"),
    }
    required = ["AVG", "PA", "H", "OBP", "SLG", "OPS"]
    if any(columns[k] is None for k in required):
        raise RuntimeError(f"Missing expected CPBL columns: {columns}")

    out = []
    for sticky, rest in rows:
        team_m = re.search(r"TeamNo=([A-Z]{3})", sticky)
        name_m = re.search(r'/team/person[^>]*>\s*([^<]+?)\s*<', sticky)
        vals = [
            re.sub(r"<[^>]+>", "", v).strip()
            for v in re.findall(r'<td class="num[^"]*">\s*(.*?)\s*</td>', rest, re.S)
        ]
        if not team_m or not name_m:
            continue
        team = TEAM_CODES.get(team_m.group(1))
        if not team:
            continue
        player = name_m.group(1).strip()

        def get(key):
            i = columns[key]
            return vals[i] if i is not None and i < len(vals) else ""

        out.append(
            {
                "team": team,
                "player": player,
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
                "OBP": as_num(get("OBP")),
                "SLG": as_num(get("SLG")),
                "OPS": as_num(get("OPS")),
                "OPSplus": as_int(get("OPSplus")),
            }
        )
    return out


def main():
    rows = fetch_batting_table()
    if len(rows) < 60:
        raise RuntimeError(f"Only scraped {len(rows)} batting rows; refusing to overwrite data")

    players = {f'{r["team"]}|{r["player"]}': r for r in rows}
    payload = {
        "year": YEAR,
        "source": URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(players),
        "players": players,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} CPBL batting records to {OUT}")


if __name__ == "__main__":
    main()
