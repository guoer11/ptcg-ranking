"""Ensure completed Supabase archives populate trial LP without an official-page re-fetch."""
import json
import sys
import unittest
from unittest import mock
from urllib.parse import urlencode
import sync_preliminary as sync


def archive_source(count=77, status="completed_last_round", round_no=7):
    return {
        "event_id": "66990", "tid": "5865462",
        "source_status": status, "expected_rounds": round_no,
        "source_url": sync.ranking_url("5865462", round_no=round_no),
        "standings": [[f"tw{i:08d}", i] for i in range(1, count+1)]
    }


def official_event(results=None):
    return {"event_id": "66990", "title": "2026-27 高級球 孩童組",
            "date": "2026-11-21", "league": "Ultra", "group": "Junior",
            "season": "2026-27", "results": results or []}


class ClosedSession:
    def __init__(self):
        self.headers = {}
    def get(self, *args, **kwargs):
        raise AssertionError("Must use saved Supabase archive, not closed official site")


class ArchivedStandingsTests(unittest.TestCase):
    def test_rejects_provisional_or_corrupt_ranking(self):
        event = official_event()
        candidate = archive_source()
        self.assertEqual(len(sync.verify_archived_standings(candidate, event, "5865462")), 77)
        tests = []
        candidate = archive_source(); candidate["source_status"] = "interim"; tests.append(candidate)
        candidate = archive_source(); candidate["expected_rounds"] = 8; tests.append(candidate)
        candidate = archive_source(); candidate["standings"][-1][1] = 76; tests.append(candidate)
        candidate = archive_source(); candidate["standings"][8][0] = candidate["standings"][7][0]; tests.append(candidate)
        candidate = archive_source(); candidate["source_url"] = sync.ranking_url("5870000", round_no=7); tests.append(candidate)
        candidate = archive_source(); candidate["standings"] = candidate["standings"][:8]; tests.append(candidate)
        for bad in tests:
            with self.subTest(bad=bad.get("source_status"),count=len(bad["standings"])):
                with self.assertRaises(ValueError):
                    sync.verify_archived_standings(bad, event, "5865462")

    def do_sync(self, event, old=None):
        archive = archive_source()
        current_sources = {"version":1,"sources":[]}
        saved = {"version":1,"events":old or {}}
        writes={}
        def load(path, fallback=None):
            if path == sync.SOURCES:
                return current_sources
            if path == sync.TOURNAMENTS:
                return {"events":[event]}
            if path == sync.OUTPUT:
                return saved
            raise AssertionError(f"unexpected file {path}")
        def store(path, value):
            writes[path] = value
        argv=["sync_preliminary.py","--auto-sources-json",json.dumps([archive])]
        with mock.patch.object(sync,"read_json",side_effect=load), \
             mock.patch.object(sync,"save_json",side_effect=store), \
             mock.patch.object(sync.requests,"Session",ClosedSession), \
             mock.patch.object(sys,"argv",argv):
            sync.sync()
        return writes

    def test_completes_trial_from_archived_77_players_offline(self):
        data = self.do_sync(official_event())
        event = data[sync.OUTPUT]["events"]["66990"]
        self.assertEqual(event["tid"],"5865462")
        self.assertEqual(event["participants"],77)
        self.assertEqual(len(event["standings"]),77)
        self.assertEqual(event["standings"][0]["status"],"pending-final")
        self.assertIsNone(event["standings"][0]["points"])
        self.assertEqual(event["standings"][8]["points"],20)
        self.assertEqual(event["standings"][16]["points"],15)
        self.assertEqual(event["standings"][32]["points"],0)
        self.assertEqual(event["standings"][76]["points"],0)
        self.assertEqual(len(data[sync.SOURCES]["sources"]),1)
        self.assertEqual(data[sync.SOURCES]["sources"][0]["event_id"],"66990")

    def test_idempotency_of_confirmed_archive(self):
        first=self.do_sync(official_event())
        second=self.do_sync(official_event(),first[sync.OUTPUT]["events"])
        self.assertNotIn(sync.OUTPUT,second,"identical archive must not produce a new commit")

    def test_official_results_always_win(self):
        result=[{"player_id":"tw00000009","rank":9,"points":20}]
        data=self.do_sync(official_event(results=result))
        self.assertNotIn(sync.OUTPUT,data,"official event results override every trial row")
        self.assertNotIn(sync.SOURCES,data,"official event must not create trial mapping")

    def test_no_cross_group(self):
        entry=archive_source()
        with self.assertRaises(ValueError):
            sync.verify_archived_standings(entry,{**official_event(),"group":"Master"},"5865462")

    def test_formal_final_url_supported(self):
        entry=archive_source(status="official_final")
        entry["source_url"]=sync.ranking_url("5865462")
        self.assertEqual(len(sync.verify_archived_standings(entry,official_event(),"5865462")),77)


if __name__ == "__main__":
    unittest.main()
