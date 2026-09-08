#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT = "ptcg-player-identity-v1"
AAD = FORMAT.encode("utf-8")
PUBLIC_KEY_FILE = Path("privacy/player_identity_public.pem")


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def encrypt(plain_path: Path, encrypted_path: Path, redacted_path: Path) -> None:
    plain_bytes = plain_path.read_bytes()
    payload = json.loads(plain_bytes.decode("utf-8"))

    public_key = serialization.load_pem_public_key(PUBLIC_KEY_FILE.read_bytes())
    data_key = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    ciphertext = AESGCM(data_key).encrypt(nonce, plain_bytes, AAD)
    wrapped_key = public_key.encrypt(
        data_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    encrypted_payload = {
        "format": FORMAT,
        "cipher": "AES-256-GCM",
        "key_wrap": "RSA-OAEP-SHA256",
        "aad": b64(AAD),
        "nonce": b64(nonce),
        "wrapped_key": b64(wrapped_key),
        "ciphertext": b64(ciphertext),
        "plaintext_sha256": hashlib.sha256(plain_bytes).hexdigest(),
        "updated_at": payload.get("updated_at"),
        "count": payload.get("count", 0),
    }
    encrypted_path.parent.mkdir(parents=True, exist_ok=True)
    encrypted_path.write_text(
        json.dumps(encrypted_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    redacted_payload = {
        "updated_at": payload.get("updated_at"),
        "count": payload.get("count", 0),
        "players": {},
        "encrypted": True,
        "encrypted_file": encrypted_path.name,
        "note": "玩家真實姓名資料已加密保存；公開檔案不包含姓名明文。",
    }
    redacted_path.write_text(
        json.dumps(redacted_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"姓名資料已加密：{payload.get('count', 0)} 位")
    print(f"- encrypted: {encrypted_path}")
    print(f"- redacted:  {redacted_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Encrypt PTCG player identity data before committing it to GitHub.")
    parser.add_argument("plain", type=Path)
    parser.add_argument("encrypted", type=Path)
    parser.add_argument("redacted", type=Path)
    args = parser.parse_args()
    encrypt(args.plain, args.encrypted, args.redacted)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
