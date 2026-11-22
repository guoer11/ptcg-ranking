"""Regression: TCG Meister End of Round 7 interim result for confirmed 77-person UBL."""
import unittest
from urllib.parse import parse_qs, urlparse
import sync_preliminary as sync

class FakeResponse:
    def __init__(self, url, html):
        self.url=url
        self.headers={"content-type":"text/html; charset=utf-8"}
        self.content=html.encode("utf-8")
        self.encoding="utf-8"
    def raise_for_status(self):
        return None
    @property
    def text(self):
        return self.content.decode(self.encoding)

class FakeSession:
    def __init__(self, round_no=7):
        self.round_no=round_no
        self.requested=[]
    def get(self,url,**kwargs):
        self.requested.append(url)
        parsed=parse_qs(urlparse(url).query)
        no=int(parsed["kno"][0])
        if no==9999999:
            return FakeResponse(url,"<html><body>Final not available</body></html>")
        # All 77 sequential ranks in one mock page; one known closed round.
        heading=f"End of Round {self.round_no} interim result"
        rows="".join(f"<tr><td>{i}</td><td>tw{i:08d}</td></tr>" for i in range(1,78))
        return FakeResponse(url,f"<html><body><h2>{heading}</h2><table><tr><th>Rank</th><th>ID</th></tr>{rows}</table></body></html>")

class RankingFallbackTests(unittest.TestCase):
    def test_confirmed_seventh_round(self):
        sess=FakeSession()
        rows,url=sync.fetch_configured_standings(sess,"5865462",{"confirmed_last_round":7})
        self.assertEqual(len(rows),77)
        self.assertEqual(rows[0]["player_id"],"tw00000001")
        self.assertEqual(rows[-1]["rank"],77)
        self.assertIn("kno=7",url)
        self.assertIn("kno=9999999",sess.requested[0])
        self.assertIn("kno=7",sess.requested[-1])
    def test_without_confirmation_does_not_accept_interim(self):
        with self.assertRaises(ValueError):
            sync.fetch_configured_standings(FakeSession(),"5865462",{})
    def test_wrong_round_heading_rejected(self):
        with self.assertRaises(ValueError):
            sync.fetch_configured_standings(FakeSession(round_no=6),"5865462",{"confirmed_last_round":7})
    def test_invalid_round_is_rejected(self):
        with self.assertRaises(ValueError):
            sync.ranking_url("5865462",round_no=41)
    def test_lp_bands_for_77(self):
        self.assertEqual([(r,sync.lp_score("Ultra",77,r)) for r in [9,17,33,65]],
                         [(9,20),(17,15),(33,10),(65,0)])

if __name__=="__main__":
    unittest.main()
