import hashlib
import json
import os
from pathlib import Path

import requests

SUPABASE_URL = "https://ceobnyikrudlxasyjukg.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6uVBALI1T3lMZoFEUiLK4g__R7gv0fz"
SYNC_RPC = f"{SUPABASE_URL}/rest/v1/rpc/sync_player_identities"


def build_sync_token(private_key: str) -> str:
    normalized = private_key.strip().replace("\r\n", "\n")
    material = f"ptcg-ranking-identity-sync-v1\n{normalized}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def main() -> None:
    private_key = os.environ.get("PLAYER_IDENTITY_PRIVATE_KEY", "")
    if not private_key.strip():
        raise RuntimeError("PLAYER_IDENTITY_PRIVATE_KEY is required")

    source = Path("data/player_identity.json")
    payload = json.loads(source.read_text(encoding="utf-8"))
    players = payload.get("players")
    if not isinstance(players, dict) or not players:
        raise RuntimeError("Plain-text identity payload is empty; refusing to sync")

    sync_token = build_sync_token(private_key)
    response = requests.post(
        SYNC_RPC,
        headers={
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
        },
        json={"payload": payload, "sync_token": sync_token},
        timeout=60,
    )
    response.raise_for_status()

    synced_count = response.json()
    expected = len(players)
    if int(synced_count) != expected:
        raise RuntimeError(
            f"Supabase identity count mismatch: expected {expected}, got {synced_count}"
        )
    print(f"Supabase private identity database synced: {synced_count} players")


if __name__ == "__main__":
    main()
