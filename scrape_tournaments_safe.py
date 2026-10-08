#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""以官方會場地址校正賽事地區後執行既有賽事抓取。

官方活動頁在成績公布後會出現玩家的「地區」欄位；舊抓取器若掃描整頁文字，
可能把玩家所在地誤當成比賽會場地區。本包裝層只信任官方活動地址來判定 region。
"""

from __future__ import annotations

import scrape_tournaments as base


REGION_ALIASES = (
    (("臺北市", "台北市"), "臺北市"),
    (("新北市",), "新北市"),
    (("桃園市",), "桃園市"),
    (("臺中市", "台中市"), "臺中市"),
    (("臺南市", "台南市"), "臺南市"),
    (("高雄市",), "高雄市"),
    (("新竹縣",), "新竹縣"),
    (("苗栗縣",), "苗栗縣"),
    (("彰化縣",), "彰化縣"),
    (("南投縣",), "南投縣"),
    (("雲林縣",), "雲林縣"),
    (("嘉義縣",), "嘉義縣"),
    (("屏東縣",), "屏東縣"),
    (("宜蘭縣",), "宜蘭縣"),
    (("花蓮縣",), "花蓮縣"),
    (("臺東縣", "台東縣"), "臺東縣"),
    (("澎湖縣",), "澎湖縣"),
    (("金門縣",), "金門縣"),
    (("連江縣",), "連江縣"),
    (("基隆市",), "基隆市"),
    (("新竹市",), "新竹市"),
    (("嘉義市",), "嘉義市"),
)


def region_from_address(address: str | None) -> str:
    text = base.clean(address)
    if not text:
        return ""
    for aliases, canonical in REGION_ALIASES:
        if any(alias in text for alias in aliases):
            return canonical
    return ""


_original_parse_event_detail = base.parse_event_detail


def parse_event_detail(session, seed, old=None):
    item = _original_parse_event_detail(session, seed, old)
    region = region_from_address(item.get("address"))
    if region:
        item["region"] = region
    return item


# 讓既有 main() 在每一筆詳情解析時使用安全版地區判定。
base.parse_event_detail = parse_event_detail


if __name__ == "__main__":
    raise SystemExit(base.main())
