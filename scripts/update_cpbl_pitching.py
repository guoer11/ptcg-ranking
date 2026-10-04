from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

YEAR = 2026
BASE = "https://www.cpbl.com.tw"
RECORD_URL = (
    f"{BASE}/stats/recordall?year={YEAR}&kindCode=A&position=02&sortby=01"
)
OUT = Path("data/cpbl_pitching_2026.json")
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
        }
    )
    return s


def clean_html(value: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", value or ""))


def as_num(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("%", "")
    if not text or text in {"-", "—", "null", "None"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def as_int(value):
    v = as_num(value)
    return int(v) if v is not None else None


def ip_outs(value):
    if value is None:
        return None
    text = str(value).strip()
    m = re.fullmatch(r"(\d+)(?:\.([012]))?", text)
    if not m:
        return None
    return int(m.group(1)) * 3 + int(m.group(2) or 0)


def main():
    session = new_session()
    r = session.get(RECORD_URL, timeout=45)
    r.raise_for_status()
    html = r.text

    headers = [clean_html(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", html, re.S)]
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    if not headers or not rows:
        raise RuntimeError("CPBL pitching table structure was not found")

    aliases = {
        "ERA": "防禦率",
        "G": "出賽數",
        "GS": "先發",
        "GF": "救援",
        "W": "勝場",
        "L": "敗場",
        "SV": "救援成功",
        "HLD": "中繼成功",
        "BF": "打席",
        "PITCHES": "投球數",
        "IP": "投球局數",
        "H": "被安打",
        "HR": "被全壘打",
        "R": "失分",
        "ER": "自責分",
        "BB": "四壞",
        "HBP": "死球",
        "K": "奪三振",
        "WHIP": "每局被上壘率",
        "BAA": "被打擊率",
        "K9": "K9值",
        "BB9": "B9值",
        "H9": "H9值",
        "Kpct": "K%",
        "BBpct": "BB%",
        "FIP": "FIP",
        "ERAplus": "ERA+",
    }
    idx = {k: headers.index(v) if v in headers else None for k, v in aliases.items()}
    required = ("ERA", "G", "GS", "W", "L", "IP", "K", "WHIP")
    missing = [k for k in required if idx[k] is None]
    if missing:
        raise RuntimeError(f"Missing expected CPBL pitching columns: {missing}; headers={headers}")

    out = {}
    for tr in rows:
        team_m = re.search(r"TeamNo=([A-Z]{3})", tr, re.I)
        name_m = re.search(r'/team/person[^>]*>\s*([^<]+?)\s*<', tr, re.S | re.I)
        if not team_m or not name_m:
            continue
        team = TEAM_CODES.get(team_m.group(1).upper())
        player = clean_html(name_m.group(1))
        if not team or not player:
            continue

        cells = [clean_html(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) < 10:
            continue
        numeric = cells[1:]

        def get(key):
            i = idx[key]
            return numeric[i] if i is not None and i < len(numeric) else None

        ip_text = get("IP")
        row = {
            "team": team,
            "player": player,
            "ERA": as_num(get("ERA")),
            "G": as_int(get("G")),
            "GS": as_int(get("GS")),
            "GF": as_int(get("GF")),
            "W": as_int(get("W")),
            "L": as_int(get("L")),
            "SV": as_int(get("SV")),
            "HLD": as_int(get("HLD")),
            "BF": as_int(get("BF")),
            "PITCHES": as_int(get("PITCHES")),
            "IP": ip_text,
            "IP_outs": ip_outs(ip_text),
            "H": as_int(get("H")),
            "HR": as_int(get("HR")),
            "R": as_int(get("R")),
            "ER": as_int(get("ER")),
            "BB": as_int(get("BB")),
            "HBP": as_int(get("HBP")),
            "K": as_int(get("K")),
            "WHIP": as_num(get("WHIP")),
            "BAA": as_num(get("BAA")),
            "K9": as_num(get("K9")),
            "BB9": as_num(get("BB9")),
            "H9": as_num(get("H9")),
            "Kpct": as_num(get("Kpct")),
            "BBpct": as_num(get("BBpct")),
            "FIP": as_num(get("FIP")),
            "ERAplus": as_num(get("ERAplus")),
        }
        out[f"{team}|{player}"] = row

    if len(out) < 60:
        raise RuntimeError(f"CPBL pitching page returned only {len(out)} usable pitchers")

    payload = {
        "year": YEAR,
        "source": RECORD_URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(out),
        "pitchers": out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(out)} CPBL pitchers to {OUT}")


if __name__ == "__main__":
    main()
