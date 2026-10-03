from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

YEAR = 2026
URL = f"https://cpbl.com.tw/stats/recordall?kindcode=A&position=01&year={YEAR}&sortby=11"
OUT = Path("data/cpbl_batting_2026.json")
TEAMS = [
    "中信兄弟",
    "統一7-ELEVEn獅",
    "樂天桃猿",
    "味全龍",
    "富邦悍將",
    "台鋼雄鷹",
]


def num(s: str):
    s = s.strip().replace(",", "")
    if not s or s in {"-", "—"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def integer(s: str):
    v = num(s)
    return int(v) if v is not None else None


def extract_rows(page):
    rows = page.locator("table tbody tr")
    found = []
    for i in range(rows.count()):
        row = rows.nth(i)
        cells = row.locator("td")
        if cells.count() < 27:
            continue
        vals = [cells.nth(j).inner_text().strip() for j in range(cells.count())]
        player_cell = vals[1]
        team = next((t for t in TEAMS if player_cell.startswith(t)), None)
        if not team:
            continue
        player = player_cell[len(team):].strip()
        if not player:
            continue
        found.append({
            "team": team,
            "player": player,
            "AVG": num(vals[2]),
            "G": integer(vals[3]),
            "PA": integer(vals[4]),
            "AB": integer(vals[5]),
            "R": integer(vals[6]),
            "RBI": integer(vals[7]),
            "H": integer(vals[8]),
            "1B": integer(vals[9]),
            "2B": integer(vals[10]),
            "3B": integer(vals[11]),
            "HR": integer(vals[12]),
            "BB": integer(vals[15]),
            "HBP": integer(vals[17]),
            "K": integer(vals[18]),
            "SB": integer(vals[22]),
            "OBP": num(vals[24]),
            "SLG": num(vals[25]),
            "OPS": num(vals[26]),
            "OPSplus": integer(vals[29]) if len(vals) > 29 else None,
        })
    return found


def main():
    all_rows = []
    seen = set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1200}, locale="zh-TW")
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_selector("table", timeout=90000)

        for _ in range(20):
            page.wait_for_timeout(800)
            rows = extract_rows(page)
            for row in rows:
                key = (row["team"], row["player"])
                if key not in seen:
                    seen.add(key)
                    all_rows.append(row)

            next_candidates = page.locator("a,button").filter(has_text="下一頁")
            if next_candidates.count() == 0:
                break
            nxt = next_candidates.last
            disabled = nxt.get_attribute("disabled") is not None or "disabled" in (nxt.get_attribute("class") or "").lower()
            if disabled:
                break
            before = rows[0]["player"] if rows else ""
            try:
                nxt.click(timeout=5000)
                page.wait_for_timeout(900)
                after_rows = extract_rows(page)
                after = after_rows[0]["player"] if after_rows else ""
                if not after or after == before:
                    break
            except Exception:
                break
        browser.close()

    if len(all_rows) < 60:
        raise RuntimeError(f"Only scraped {len(all_rows)} batting rows; refusing to overwrite data.")

    players = {f'{r["team"]}|{r["player"]}': r for r in all_rows}
    payload = {
        "year": YEAR,
        "source": URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(players),
        "players": players,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} players to {OUT}")


if __name__ == "__main__":
    main()
