from __future__ import annotations

import csv
import io
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from scrapling.fetchers import StealthySession

YEAR = 2026
PITCHING = Path("data/cpbl_pitching_2026.json")
OUT = Path("data/cpbl_pitch_repertoires_2026.json")
WIKI_BASE = "https://twbsball.dils.tku.edu.tw/wiki/index.php?title="
TRACKING_CSV = (
    "https://raw.githubusercontent.com/lin-junyou/cpbl-savant-py-app/"
    "master/data/csv/rankings_pitch_tracking.csv"
)

# Order matters: longer/specific names must be checked before generic words.
PITCH_PATTERNS = [
    ("FF", ("四縫線快速球", "四縫線速球", "四縫線", "4-seam", "4 seam", "four-seam", "fourseam")),
    ("SI", ("二縫線快速球", "二縫線速球", "二縫線", "伸卡球", "伸卡", "沉球", "sinker", "2-seam", "two-seam")),
    ("CT", ("卡特球", "卡特", "切球", "cutter")),
    ("SW", ("sweeper", "Sweeper", "橫掃球", "橫掃滑球")),
    ("SV", ("滑曲球", "slurve", "Slurve")),
    ("SL", ("高速滑球", "縱向滑球", "滑球", "slider", "Slider")),
    ("KC", ("彈指曲球", "指節曲球", "knuckle curve", "knucklecurve")),
    ("CU", ("12-6曲球", "12-6曲", "曲球", "curveball", "curve")),
    ("FS", ("指叉變速球", "快速指叉球", "指叉球", "指叉", "SFF", "split-finger", "splitter", "forkball", "fork")),
    ("PA", ("掌心球", "palmball", "palm ball")),
    ("CH", ("圈指變速球", "圈指變速", "變速球", "變速", "changeup", "change-up")),
    ("SC", ("螺旋球", "screwball")),
    ("KN", ("蝴蝶球", "knuckleball", "knuckle ball")),
]
GENERIC_FASTBALL = ("快速球", "速球", "直球", "fastball")
FASTBALL_FAMILY = {"FB", "FF", "SI", "CT"}

STOP_LABELS = (
    "出生地點", "所屬族裔", "最高學歷", "職棒選秀", "經紀公司", "簽約金額",
    "推定年薪", "親屬關係", "婚姻狀況", "外文姓名", "原文姓名", "姓名變更",
    "職棒月薪", "職棒簽約", "教練資格", "經歷", "個人年表",
)


def load_tracking() -> dict[str, dict[str, float | int]]:
    """Actual 2026 CPBL TrackMan broad categories (fastball/breakingball)."""
    r = requests.get(TRACKING_CSV, timeout=45, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    rows = csv.DictReader(io.StringIO(r.text.lstrip("\ufeff")))
    out: dict[str, dict[str, float | int]] = {}
    for row in rows:
        if row.get("year") != str(YEAR) or row.get("game_kind") != "A":
            continue
        name = (row.get("player_name") or "").strip()
        if not name:
            continue
        rec = out.setdefault(name, {"fastball": 0, "breakingball": 0, "fastball_kph": 0.0, "breakingball_kph": 0.0})
        typ = (row.get("pitch_type") or "").strip().lower()
        if typ not in ("fastball", "breakingball"):
            continue
        try:
            pitches = int(float(row.get("pitches") or 0))
            kph = float(row.get("kph") or 0)
        except ValueError:
            pitches, kph = 0, 0.0
        rec[typ] = max(int(rec.get(typ, 0)), pitches)
        rec[f"{typ}_kph"] = max(float(rec.get(f"{typ}_kph", 0.0)), kph)
    return out


def clean_text(s: str) -> str:
    return re.sub(r"[\u200b\u200c\u200d\ufeff]", "", s or "").strip()


def extract_repertoire_field(text: str) -> str | None:
    text = clean_text(text)
    idx = text.find("擅長球路")
    if idx < 0:
        # Some pages use a different but equivalent label.
        for label in ("拿手球路", "主要球路"):
            idx = text.find(label)
            if idx >= 0:
                break
    if idx < 0:
        return None

    segment = text[idx : idx + 1200]
    # Drop the label itself.
    segment = re.sub(r"^(?:擅長球路|拿手球路|主要球路)\s*[：:]?\s*", "", segment)
    lines = [clean_text(x) for x in segment.splitlines()]
    kept: list[str] = []
    for line in lines:
        if not line or line in {"、", "，", ",", "/", "／"}:
            if kept and line:
                kept.append(line)
            continue
        compact = re.sub(r"\s+", "", line)
        if any(compact.startswith(label) and ("：" in compact or ":" in compact or compact == label) for label in STOP_LABELS):
            break
        if compact in {"[編輯]", "編輯", "[", "]"}:
            if kept:
                break
            continue
        kept.append(line)
        if len(" ".join(kept)) > 500:
            break
    raw = " ".join(kept)
    raw = re.sub(r"\s*([、，,/／])\s*", r"\1", raw)
    raw = re.sub(r"\s+", " ", raw).strip(" 、，,/／")
    return raw or None


def map_pitch_codes(raw: str | None) -> list[str]:
    if not raw:
        return []
    found: list[tuple[int, int, str]] = []
    claimed_spans: list[tuple[int, int]] = []

    # Specific terms first. Avoid mapping "變速" inside "指叉變速球" twice.
    for order, (code, terms) in enumerate(PITCH_PATTERNS):
        best = None
        for term in terms:
            pos = raw.lower().find(term.lower())
            if pos >= 0 and (best is None or pos < best[0] or (pos == best[0] and len(term) > best[1])):
                best = (pos, len(term))
        if best is None:
            continue
        pos, length = best
        if code == "CH" and any(a <= pos < b for a, b in claimed_spans):
            continue
        if code == "CU" and ("彈指曲球" in raw or "指節曲球" in raw) and pos >= raw.find("曲球"):
            # KC already represents that exact phrase. A separate 曲球 later will still be found
            # only if the page explicitly lists another curve; rare enough to avoid duplication.
            if not re.search(r"(?:彈指曲球|指節曲球).*(?:、|，|/|／).*曲球", raw):
                continue
        found.append((pos, order, code))
        claimed_spans.append((pos, pos + length))

    # Generic fastball only when the field itself explicitly says it and no specific fastball type was found.
    codes = [c for _, _, c in sorted(found)]
    if not FASTBALL_FAMILY.intersection(codes):
        pos_candidates = [raw.lower().find(t.lower()) for t in GENERIC_FASTBALL]
        pos_candidates = [p for p in pos_candidates if p >= 0]
        if pos_candidates:
            found.append((min(pos_candidates), -1, "FB"))

    result: list[str] = []
    for _, _, code in sorted(found):
        if code not in result:
            result.append(code)
    return result


def fetch_page_text(session: StealthySession, name: str) -> tuple[str | None, str, str | None]:
    url = WIKI_BASE + quote(name, safe="")
    try:
        page = session.fetch(url, timeout=60000, network_idle=True)
        title = page.css("title::text").get() or ""
        content = page.css("#mw-content-text")
        text = content[0].get_all_text(separator="\n") if content else page.get_all_text(separator="\n")
        if "頁面不存在" in text or "There is currently no text in this page" in text:
            return None, url, title
        return text, url, title
    except Exception as exc:
        print(f"WARN {name}: {type(exc).__name__}: {exc}", flush=True)
        return None, url, None


def main() -> None:
    src = json.loads(PITCHING.read_text(encoding="utf-8"))
    pitchers = src.get("pitchers", {})
    tracking = load_tracking()
    result: dict[str, dict] = {}
    verified = partial = unresolved = 0

    print(f"Pitchers to inspect: {len(pitchers)}", flush=True)
    with StealthySession(headless=True, solve_cloudflare=True, timeout=60000) as session:
        for idx, (key, p) in enumerate(pitchers.items(), 1):
            name = (p.get("player") or key.split("|", 1)[-1]).strip()
            team = (p.get("team") or key.split("|", 1)[0]).strip()
            text, url, title = fetch_page_text(session, name)
            raw = extract_repertoire_field(text) if text else None
            codes = map_pitch_codes(raw)

            tr = tracking.get(name, {})
            fast_count = int(tr.get("fastball", 0) or 0)
            breaking_count = int(tr.get("breakingball", 0) or 0)
            # CPBL's public 2026 TrackMan endpoint only labels broad fastball/breakingball.
            # Add a generic FB only if there is actual 2026 fastball evidence and the wiki
            # does not already identify a more specific fastball-family pitch.
            trackman_fastball_added = False
            if fast_count >= 5 and not FASTBALL_FAMILY.intersection(codes):
                codes.insert(0, "FB")
                trackman_fastball_added = True

            wiki_specific = [c for c in codes if not (c == "FB" and trackman_fastball_added)]
            if raw and wiki_specific:
                source_type = "verified"
                verified += 1
            elif raw or codes:
                source_type = "partial"
                partial += 1
            else:
                source_type = "unverified"
                unresolved += 1

            result[key] = {
                "team": team,
                "player": name,
                "pitches": codes,
                "source_type": source_type,
                "source_label": "台灣棒球維基館" if raw else ("2026 CPBL TrackMan" if codes else None),
                "source_url": url if raw else None,
                "wiki_title": title,
                "repertoire_text": raw,
                "trackman_2026": {
                    "fastball_pitches": fast_count,
                    "breakingball_pitches": breaking_count,
                    "fastball_avg_kph": round(float(tr.get("fastball_kph", 0) or 0), 1) or None,
                    "breakingball_avg_kph": round(float(tr.get("breakingball_kph", 0) or 0), 1) or None,
                },
            }
            print(f"[{idx:03}/{len(pitchers)}] {name}: {source_type} {codes} {raw or ''}", flush=True)
            # Be polite to the community wiki while reusing one browser/session.
            time.sleep(0.18)

    payload = {
        "year": YEAR,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(result),
        "verified_count": verified,
        "partial_count": partial,
        "unresolved_count": unresolved,
        "source_note": (
            "Detailed pitch names are parsed from the public Taiwan Baseball Wiki '擅長球路' field. "
            "2026 CPBL TrackMan public data is used only to verify broad fastball presence; CPBL does not "
            "publicly expose detailed slider/curve/changeup/etc labels in that API."
        ),
        "repertoires": result,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(result)} repertoires: verified={verified}, partial={partial}, unresolved={unresolved}")


if __name__ == "__main__":
    main()
