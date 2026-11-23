import unittest
import sync_knockout as mod

def data():
    prelim={"events":{"66990":{"tid":"5865462","date":"2026-11-21","standings":[
        {"player_id":f"tw{i:08d}","rank":i} for i in range(1,78)]}}}
    official={"events":[{"event_id":"66990","date":"2026-11-21","league":"Ultra","group":"Junior","results":[]}]}
    podium=[(1,100,"冠軍"),(2,75,"亞軍"),(3,50,"四強"),(3,50,"四強"),(5,25,"八強"),(5,25,"八強"),(5,25,"八強"),(5,25,"八強")]
    payload={"tid":"5865462","event_id":"66990","source_url":"https://tcg.sfc-jpn.jp/tourround.asp?tid=5865462&kno=7&znt=1",
      "results":[{"player_id":f"tw{i:08d}","preliminary_rank":i,"final_rank":r,"points":p,"finish":f}
      for i,(r,p,f) in enumerate(podium,1)]}
    return payload,official,prelim,{"version":1,"events":{}}

class KnockoutTests(unittest.TestCase):
    def test_save_and_idempotent(self):
        payload,official,prelim,old=data()
        new,changed=mod.build_knockout(payload,official,prelim,old)
        self.assertTrue(changed)
        self.assertEqual(sum(x["points"] for x in new["events"]["66990"]["results"]),375)
        self.assertEqual(new["events"]["66990"]["source_type"],"owner_entered_knockout")
        self.assertEqual(old["events"],{})
        same,changed=mod.build_knockout(payload,official,prelim,new)
        self.assertFalse(changed)
        self.assertEqual(new,same)
    def test_corrupt_rank_data_rejected(self):
        for change in ["duplicate","outsider","points","wrong_prelim","missing_semi"]:
            with self.subTest(change=change):
                p,o,a,e=data()
                if change=="duplicate":p["results"][1]["player_id"]=p["results"][0]["player_id"]
                if change=="outsider":p["results"][7]["player_id"]="tw99999999"
                if change=="points":p["results"][0]["points"]=20
                if change=="wrong_prelim":p["results"][0]["preliminary_rank"]=2
                if change=="missing_semi":p["results"][3]["final_rank"]=5
                with self.assertRaises(ValueError):mod.build_knockout(p,o,a,e)
    def test_unmatched_group_rejected(self):
        p,o,a,e=data()
        o["events"][0]["group"]="Master"
        with self.assertRaises(ValueError):mod.build_knockout(p,o,a,e)
    def test_historical_data_survives_official_publication(self):
        p,o,a,e=data()
        o["events"][0]["results"]=[{"player_id":"tw00000001","points":100}]
        new,changed=mod.build_knockout(p,o,a,e)
        self.assertTrue(changed)
        self.assertEqual(new["events"]["66990"]["source_type"],"owner_entered_knockout")

if __name__=="__main__":
    unittest.main()
