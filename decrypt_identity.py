#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT = "ptcg-player-identity-v1"


def unb64(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))


def decrypt(encrypted_path: Path, private_key_path: Path, output_path: Path) -> None:
    payload = json.loads(encrypted_path.read_text(encoding="utf-8"))
    if payload.get("format") != FORMAT:
        raise ValueError(f"Unsupported format: {payload.get('format')}")

    private_key = serialization.load_pem_private_key(
        private_key_path.read_bytes(),
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
    aad = unb64(payload["aad"])
    plaintext = AESGCM(data_key).decrypt(
        unb64(payload["nonce"]),
        unb64(payload["ciphertext"]),
        aad,
    )

    expected = payload.get("plaintext_sha256")
    actual = hashlib.sha256(plaintext).hexdigest()
    if expected and actual != expected:
        raise ValueError("SHA-256 verification failed")

    output_path.write_bytes(plaintext)
    print(f"已解密至：{output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Decrypt the private PTCG player identity database locally.")
    parser.add_argument("encrypted", type=Path)
    parser.add_argument("private_key", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    decrypt(args.encrypted, args.private_key, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
