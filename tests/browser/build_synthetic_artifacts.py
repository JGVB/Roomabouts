"""Copy only synthetic PNG browser evidence and write its SHA-256 manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    source = args.source.resolve()
    destination = args.destination.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise SystemExit(f"destination must be empty: {destination}")
    destination.mkdir(parents=True, exist_ok=True)

    manifest = []
    if source.is_dir():
        for index, path in enumerate(sorted(source.rglob("*.png"))):
            if path.is_symlink() or not path.is_file():
                continue
            output_name = f"browser-{index:03d}-{path.name}"
            output = destination / output_name
            shutil.copyfile(path, output)
            manifest.append({
                "file": output_name,
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            })

    manifest_path = destination / "sha256-manifest.json"
    manifest_path.write_text(
        json.dumps({"synthetic": True, "files": manifest}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
