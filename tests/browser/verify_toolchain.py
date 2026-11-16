"""Fail closed when the installed browser-test toolchain drifts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAYWRIGHT_VERSION = "1.65.1"
EXPECTED_PACKAGE_PATHS = {
    "@playwright/test": ROOT / "node_modules" / "@playwright" / "test" / "package.json",
    "playwright": ROOT / "node_modules" / "playwright" / "package.json",
    "playwright-core": ROOT / "node_modules" / "playwright-core" / "package.json",
}
EXPECTED_TOP_LEVEL_NODE_MODULES = {
    ".bin",
    ".package-lock.json",
    "@playwright",
    "playwright",
    "playwright-core",
}
EXPECTED_BROWSER_DIRECTORIES = {
    "chromium_headless_shell-1255",
    "ffmpeg-1013",
}


def _read_json(path: Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _one_file(root: Path, predicate, label: str) -> Path:
    matches = sorted(path for path in root.rglob("*") if path.is_file() and predicate(path))
    if len(matches) != 1:
        raise SystemExit(f"expected exactly one {label}, found {len(matches)}")
    return matches[0]


def verify_packages() -> dict[str, object]:
    node_modules = ROOT / "node_modules"
    actual_top_level = {path.name for path in node_modules.iterdir()}
    if actual_top_level != EXPECTED_TOP_LEVEL_NODE_MODULES:
        raise SystemExit(f"unexpected node_modules entries: {sorted(actual_top_level)}")
    scoped = {path.name for path in (node_modules / "@playwright").iterdir()}
    if scoped != {"test"}:
        raise SystemExit(f"unexpected @playwright entries: {sorted(scoped)}")

    manifests = {}
    for name, path in EXPECTED_PACKAGE_PATHS.items():
        manifest = _read_json(path)
        if manifest.get("version") != PLAYWRIGHT_VERSION:
            raise SystemExit(f"{name} version drifted")
        if manifest.get("license") != "Apache-2.0":
            raise SystemExit(f"{name} license drifted")
        if manifest.get("scripts") not in (None, {}):
            raise SystemExit(f"{name} gained package scripts")
        manifests[name] = {
            "version": manifest["version"],
            "scripts": manifest.get("scripts", {}),
        }

    registry = _read_json(node_modules / "playwright-core" / "browsers.json")["browsers"]
    by_name = {entry["name"]: entry for entry in registry}
    shell = by_name.get("chromium-headless-shell", {})
    ffmpeg = by_name.get("ffmpeg", {})
    if shell.get("revision") != "1255" or shell.get("browserVersion") != "159.0.8154.6":
        raise SystemExit("Chromium headless-shell registry identity drifted")
    if ffmpeg.get("revision") != "1013":
        raise SystemExit("FFmpeg registry identity drifted")

    return {
        "packages": manifests,
        "chromiumHeadlessShell": {
            "browserVersion": shell["browserVersion"],
            "revision": shell["revision"],
        },
        "ffmpeg": {"revision": ffmpeg["revision"]},
    }


def verify_browsers() -> dict[str, object]:
    raw_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "")
    if not raw_path:
        raise SystemExit("PLAYWRIGHT_BROWSERS_PATH is required")
    browser_root = Path(raw_path).resolve()
    if browser_root == ROOT or ROOT in browser_root.parents:
        raise SystemExit("browser payload must remain outside the repository")

    entries = {path.name: path for path in browser_root.iterdir()}
    allowed_entries = EXPECTED_BROWSER_DIRECTORIES | {".links"}
    unexpected = set(entries) - allowed_entries
    actual = {
        name for name in EXPECTED_BROWSER_DIRECTORIES
        if name in entries and entries[name].is_dir()
    }
    if unexpected or actual != EXPECTED_BROWSER_DIRECTORIES:
        raise SystemExit(
            "browser payload boundary drifted: "
            f"payloads={sorted(actual)}, unexpected={sorted(unexpected)}"
        )

    shell_root = browser_root / "chromium_headless_shell-1255"
    ffmpeg_root = browser_root / "ffmpeg-1013"
    shell = _one_file(shell_root, lambda path: path.name == "chrome-headless-shell", "headless shell")
    shell_notice = _one_file(
        shell_root,
        lambda path: path.name == "LICENSE.headless_shell",
        "headless-shell license",
    )
    ffmpeg = _one_file(
        ffmpeg_root,
        lambda path: path.name in {"ffmpeg", "ffmpeg-linux", "ffmpeg-mac"},
        "FFmpeg executable",
    )
    ffmpeg_notice = _one_file(
        ffmpeg_root,
        lambda path: path.name.startswith(("COPYING", "LICENSE")),
        "FFmpeg notice",
    )

    return {
        "browserRoot": str(browser_root),
        "payloadDirectories": sorted(actual),
        "chromiumHeadlessShell": {
            "executable": str(shell.relative_to(browser_root)),
            "sha256": _sha256(shell),
            "notice": str(shell_notice.relative_to(browser_root)),
            "noticeSha256": _sha256(shell_notice),
        },
        "ffmpeg": {
            "executable": str(ffmpeg.relative_to(browser_root)),
            "sha256": _sha256(ffmpeg),
            "notice": str(ffmpeg_notice.relative_to(browser_root)),
            "noticeSha256": _sha256(ffmpeg_notice),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("packages", "browsers"))
    args = parser.parse_args()
    result = verify_packages() if args.mode == "packages" else verify_browsers()
    print(json.dumps(result, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
