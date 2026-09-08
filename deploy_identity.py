#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT = "ptcg-player-identity-v1"
SECRET_ENV = "PLAYER_IDENTITY_PRIVATE_KEY"


def unb64(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))


def decrypt_for_deploy(encrypted_path: Path, output_path: Path) -> None:
    private_key_pem = os.environ.get(SECRET_ENV, "")
    if not private_key_pem.strip():
        raise RuntimeError(f"Missing required Actions secret: {SECRET_ENV}")

    payload = json.loads(encrypted_path.read_text(encoding="utf-8"))
    if payload.get("format") != FORMAT:
        raise ValueError(f"Unsupported format: {payload.get('format')}")

    private_key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"),
        password=None,
    )
    data_key = private_key.decrypt(
        unb64(payload["wrapped_key"]),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    plaintext = AESGCM(data_key).decrypt(
        unb64(payload["nonce"]),
        unb64(payload["ciphertext"]),
        unb64(payload["aad"]),
    )

    expected = payload.get("plaintext_sha256")
    actual = hashlib.sha256(plaintext).hexdigest()
    if expected and actual != expected:
        raise ValueError("SHA-256 verification failed")

    data = json.loads(plaintext.decode("utf-8"))
    players = data.get("players") or {}
    count = int(data.get("count") or 0)
    if count <= 0 or not players:
        raise ValueError("Decrypted identity database is empty")
    if not any((value or {}).get("real_name") for value in players.values()):
        raise ValueError("Decrypted identity database contains no real names")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(plaintext)
    print(f"Deployment identity database ready: {count} players")


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: deploy_identity.py <encrypted.json> <output.json>")
        return 2
    decrypt_for_deploy(Path(sys.argv[1]), Path(sys.argv[2]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
