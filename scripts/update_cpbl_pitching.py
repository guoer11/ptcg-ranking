from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

YEAR = 2026
URL = f"https://cpbl.com.tw/Stats/RecordAll?kindcode=A&position=02&sortby=01&year={YEAR}"
OUT = Path("data/cpbl_pitching_2026.json")
TEAMS = ["中信兄弟", "統一7-ELEVEn獅", "樂天桃猿", "味全龍", "富邦悍將", "台鋼雄鷹"]

ALIASES = {
    "ERA": ["防禦率"],
    "G": ["出賽數"],
    "GS": ["先發"],
    "IP": ["投球局數"],
    "H": ["被安打"],
    "HR": ["被全壘打"],
    "BB": ["四壞"],
    "SO": ["奪三振"],
    "WHIP": ["每局被上壘率"],
    "BAA": ["被打擊率"],
    "K9": ["K9值"],
    "BB9": ["B9值"],
    "FIP": ["FIP"],
    "ERAplus": ["ERA+"],
}


def n(value):
    if value is None:
        return None
    s = str(value).strip().replace(",", "")
    if not s or s in {"-", "—"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main():
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9",
    })
    r = sess.get(URL, timeout=45)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    best_table = None
    headers = []
    for table in soup.find_all("table"):
        hs = [re.sub(r"\s+", "", th.get_text(" ", strip=True)) for th in table.find_all("th")]
        if "防禦率" in hs and "投球局數" in hs and "奪三振" in hs:
            best_table, headers = table, hs
            break
    if best_table is None:
        raise RuntimeError("CPBL pitching table not found")

    def idx(key):
        for a in ALIASES[key]:
            if a in headers:
                return headers.index(a)
        return None

    indexes = {k: idx(k) for k in ALIASES}
    players = {}
    for tr in best_table.find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        vals = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip() for td in tds]
        first = vals[0]
        team = next((t for t in TEAMS if t in first), None)
        if not team:
            continue
        cell = tds[0]
        person = cell.find("a", href=re.compile(r"/team/person", re.I))
        player = person.get_text(" ", strip=True) if person else first.replace(team, " ")
        player = re.sub(r"^\s*\d+\s*", "", player).strip()
        if not player:
            continue

        def get(key):
            i = indexes[key]
            return vals[i] if i is not None and i < len(vals) else None

        rec = {
            "team": team,
            "player": player,
            "ERA": n(get("ERA")),
            "G": n(get("G")),
            "GS": n(get("GS")),
            "IP": get("IP"),
            "H": n(get("H")),
            "HR": n(get("HR")),
            "BB": n(get("BB")),
            "SO": n(get("SO")),
            "WHIP": n(get("WHIP")),
            "BAA": n(get("BAA")),
            "K9": n(get("K9")),
            "BB9": n(get("BB9")),
            "FIP": n(get("FIP")),
            "ERAplus": n(get("ERAplus")),
        }
        players[f"{team}|{player}"] = rec

    if len(players) < 50:
        raise RuntimeError(f"Only {len(players)} pitching rows parsed")

    payload = {
        "year": YEAR,
        "source": URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(players),
        "players": players,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} pitching records")


if __name__ == "__main__":
    main()
