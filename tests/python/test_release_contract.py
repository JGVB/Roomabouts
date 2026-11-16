import json
import re
import runpy
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "custom_components" / "radar_map_manager"
WWW = COMPONENT / "www"
WORKFLOWS = ROOT / ".github" / "workflows"

RELATIVE_IMPORT = re.compile(
    r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(?P<quote>['\"])(?P<specifier>\.[^'\"]+)(?P=quote)"
)
ACTION_USE = re.compile(r"(?m)^\s*(?:-\s*)?uses:\s*(?P<action>[^#\s]+)")
PINNED_ACTION = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")

NODE_VERSION = "24.22.3"
NPM_VERSION = "11.19.1"
PLAYWRIGHT_VERSION = "1.65.1"
PLAYWRIGHT_PACKAGES = {
    "node_modules/@playwright/test": {
        "resolved": "https://registry.npmjs.org/@playwright/test/-/test-1.65.1.tgz",
        "integrity": "sha512-y+NCIRm2LvY4slUVWvGh1nujJ8RF/hEisIsq2mtUPgdQC4L701bq5hZGMhrpeXjACvwvO9tj5dJqhvM6TP9lbw==",
    },
    "node_modules/playwright": {
        "resolved": "https://registry.npmjs.org/playwright/-/playwright-1.65.1.tgz",
        "integrity": "sha512-vJ1FuoOrNwOKHUIVEvSt3jT1L+wjjDpwhwIstKtfvTh8XIG4FG4bIFuvNdMxi81LGfAhUgUZleVFaOLY4RIUUw==",
    },
    "node_modules/playwright-core": {
        "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.65.1.tgz",
        "integrity": "sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==",
    },
}
PACKAGE_SCRIPTS = {
    "browser:install": "playwright install --only-shell chromium",
    "browser:install:ci": "playwright install --with-deps --only-shell chromium",
    "test:browser": "playwright test",
    "test:browser:update": "playwright test --update-snapshots",
}
RELEASE_DENIED_PARTS = {
    ".playwright",
    "blob-report",
    "goldens",
    "node_modules",
    "playwright-report",
    "screenshots",
    "snapshots",
    "test-results",
    "tests",
    "traces",
    "videos",
}
RELEASE_DENIED_NAMES = {
    ".node-version",
    "package-lock.json",
    "package.json",
    "playwright.config.js",
    "playwright.config.ts",
}
RELEASE_DENIED_SUFFIXES = {
    ".dll",
    ".dylib",
    ".exe",
    ".har",
    ".jpeg",
    ".jpg",
    ".mp4",
    ".node",
    ".png",
    ".so",
    ".tar",
    ".tgz",
    ".trace",
    ".webm",
    ".webp",
    ".zip",
}


class ReleaseContractTests(unittest.TestCase):
    def test_all_json_files_are_valid(self):
        json_files = sorted(
            path for path in ROOT.rglob("*.json")
            if "node_modules" not in path.parts
            and "test-results" not in path.parts
            and "playwright-report" not in path.parts
        )
        self.assertGreater(len(json_files), 0)

        for path in json_files:
            with self.subTest(path=path.relative_to(ROOT)):
                with path.open(encoding="utf-8") as handle:
                    json.load(handle)

    def test_browser_toolchain_lock_and_scripts_are_frozen(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))

        self.assertEqual((ROOT / ".node-version").read_text(encoding="utf-8"), f"{NODE_VERSION}\n")
        self.assertTrue(package["private"])
        self.assertEqual(package["packageManager"], f"npm@{NPM_VERSION}")
        self.assertEqual(package["engines"], {"node": NODE_VERSION})
        self.assertEqual(package["devDependencies"], {"@playwright/test": PLAYWRIGHT_VERSION})
        self.assertEqual(package["scripts"], PACKAGE_SCRIPTS)
        self.assertNotIn("npx", "\n".join(package["scripts"].values()))

        self.assertEqual(lock["lockfileVersion"], 3)
        packages = lock["packages"]
        self.assertEqual(set(packages), {"", *PLAYWRIGHT_PACKAGES})
        self.assertEqual(packages[""]["devDependencies"], package["devDependencies"])
        self.assertEqual(packages[""]["engines"], package["engines"])
        for key, expected in PLAYWRIGHT_PACKAGES.items():
            with self.subTest(package=key):
                entry = packages[key]
                self.assertEqual(entry["version"], PLAYWRIGHT_VERSION)
                self.assertEqual(entry["resolved"], expected["resolved"])
                self.assertEqual(entry["integrity"], expected["integrity"])
                self.assertTrue(entry["dev"])
                self.assertEqual(entry["license"], "Apache-2.0")
                self.assertNotIn("hasInstallScript", entry)
                self.assertNotIn("scripts", entry)
                self.assertNotIn("optionalDependencies", entry)
                self.assertNotIn("link", entry)

        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        for ignored in ("node_modules/", "test-results/", "playwright-report/", "blob-report/"):
            self.assertIn(ignored, gitignore)

    def test_browser_ci_supply_chain_boundary_is_explicit(self):
        quality = (WORKFLOWS / "quality.yml").read_text(encoding="utf-8")
        verifier = runpy.run_path(str(ROOT / "tests" / "browser" / "verify_toolchain.py"))

        self.assertIn(
            "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
            quality,
        )
        self.assertIn(
            "actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f",
            quality,
        )
        for required in (
            "test \"$(node --version)\" = 'v24.22.3'",
            "test \"$(npm --version)\" = '11.19.1'",
            "node-version-file: .node-version",
            "package-manager-cache: false",
            "npm ci --ignore-scripts --no-audit --no-fund",
            "npm audit --package-lock-only --audit-level=high",
            "npm audit signatures",
            "npm run browser:install:ci",
            "npm run test:browser",
            "python3 tests/browser/verify_toolchain.py packages",
            "python3 tests/browser/verify_toolchain.py browsers",
            "ffmpeg-buildconf.txt",
            "ffmpeg-license.txt",
            "apt-before.tsv",
            "apt-after.tsv",
            "apt-added.tsv",
            "Complete installed package inventory",
            'cat "$evidence/apt-after.tsv"',
            "font-render.tsv",
            "cat /etc/os-release",
            "tee -a \"$GITHUB_STEP_SUMMARY\"",
            "retention-days: 7",
            "include-hidden-files: false",
            "if-no-files-found: error",
            "overwrite: false",
            "PLAYWRIGHT_BROWSERS_PATH",
            "npm_config_cache",
            'echo "npm_config_cache=$RUNNER_TEMP/roomabouts-npm-cache"',
            'echo "npm_config_userconfig=$RUNNER_TEMP/roomabouts-empty.npmrc"',
            'echo "PLAYWRIGHT_BROWSERS_PATH=$RUNNER_TEMP/roomabouts-playwright-browsers"',
            '>> "$GITHUB_ENV"',
        ):
            with self.subTest(required=required):
                self.assertIn(required, quality)
        for forbidden_job_env in (
            "npm_config_cache: ${{ runner.temp }}",
            "npm_config_userconfig: ${{ runner.temp }}",
            "PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}",
        ):
            self.assertNotIn(forbidden_job_env, quality)
        self.assertNotRegex(quality, r"(?m)^\s*-?\s*run:\s*npx\b")
        raw_browser_install_commands = [
            line.strip()
            for line in quality.splitlines()
            if re.search(r"(?:^|/)playwright\s+install(?:\s|$)", line)
            and "install --list" not in line
        ]
        self.assertEqual(raw_browser_install_commands, [])
        self.assertEqual(
            quality.count("./node_modules/.bin/playwright install --list"),
            1,
        )
        self.assertEqual(quality.count("npm run browser:install:ci"), 1)
        self.assertEqual(quality.count("npm ci --ignore-scripts --no-audit --no-fund"), 1)
        self.assertEqual(
            quality.count(
                "actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f"
            ),
            1,
        )

        self.assertEqual(verifier["PLAYWRIGHT_VERSION"], PLAYWRIGHT_VERSION)
        self.assertEqual(
            set(verifier["EXPECTED_PACKAGE_PATHS"]),
            {"@playwright/test", "playwright", "playwright-core"},
        )
        self.assertEqual(
            verifier["EXPECTED_BROWSER_DIRECTORIES"],
            {"chromium_headless_shell-1255", "ffmpeg-1013"},
        )
        if (ROOT / "node_modules").is_dir():
            verifier["verify_packages"]()

    def test_browser_runtime_is_loopback_only_and_bounded(self):
        config = (ROOT / "playwright.config.js").read_text(encoding="utf-8")
        browser_tests = ROOT / "tests" / "browser"
        fixture = (browser_tests / "roomabouts-test.js").read_text(encoding="utf-8")
        smoke = (browser_tests / "phase3-toolchain.spec.js").read_text(encoding="utf-8")
        specs = sorted(browser_tests.rglob("*.spec.js"))

        for required in (
            "http://127.0.0.1:4173",
            "fullyParallel: false",
            "workers: 1",
            "retries: process.env.CI ? 1 : 0",
            "timeout: 30_000",
            "globalTimeout: 5 * 60_000",
            "locale: 'en-US'",
            "timezoneId: 'UTC'",
            "colorScheme: 'light'",
            "reducedMotion: 'no-preference'",
            "deviceScaleFactor: 1",
            "serviceWorkers: 'block'",
            "server: 'http://127.0.0.1:1'",
            "bypass: '127.0.0.1,localhost'",
            "video: 'off'",
            "trace: 'off'",
            "screenshot: 'off'",
            "--bind 127.0.0.1",
            "reuseExistingServer: false",
        ):
            with self.subTest(required=required):
                self.assertIn(required, config)

        self.assertGreater(len(specs), 0)
        self.assertIn("from '@playwright/test'", fixture)
        self.assertIn("context.route('**/*'", fixture)
        self.assertIn("route.abort('blockedbyclient')", fixture)
        self.assertIn("{ auto: true }", fixture)
        self.assertIn("expect(attemptedExternalRequests).toEqual([])", fixture)
        for spec in specs:
            with self.subTest(spec=spec.relative_to(ROOT)):
                source = spec.read_text(encoding="utf-8")
                self.assertNotIn("@playwright/test", source)
                self.assertRegex(
                    source,
                    r"(?m)^import\s+\{[^}]*\btest\b[^}]*\}\s+from\s+['\"][^'\"]*roomabouts-test\.js['\"];",
                )
        self.assertIn("externalRequests", smoke)
        self.assertIn("expect(roomaboutsNetworkBoundary).toEqual([])", smoke)

    def test_release_payload_excludes_browser_toolchain_and_test_artifacts(self):
        violations = []
        for path in sorted(COMPONENT.rglob("*")):
            relative = path.relative_to(COMPONENT)
            lowered_parts = tuple(part.lower() for part in relative.parts)
            if "__pycache__" in lowered_parts or path.suffix.lower() in {".pyc", ".pyo"}:
                continue

            name = path.name.lower()
            if path.is_symlink():
                violations.append(f"symlink:{relative}")
            if RELEASE_DENIED_PARTS.intersection(lowered_parts):
                violations.append(f"tooling-directory:{relative}")
            if name in RELEASE_DENIED_NAMES:
                violations.append(f"tooling-file:{relative}")
            if path.is_file() and path.suffix.lower() in RELEASE_DENIED_SUFFIXES:
                violations.append(f"artifact-or-binary:{relative}")
            if any(token in name for token in ("chrome-headless", "chromium", "ffmpeg", "playwright")):
                violations.append(f"browser-tooling:{relative}")

        self.assertEqual(violations, [])

    def test_release_contains_required_files(self):
        required = (
            "__init__.py",
            "binary_sensor.py",
            "config_flow.py",
            "const.py",
            "coordinator.py",
            "fusion_engine.py",
            "manifest.json",
            "number.py",
            "processor.py",
            "sensor.py",
            "services.yaml",
            "translations/en.json",
            "translations/zh-Hans.json",
            "www/radar-editor.js",
            "www/radar-map-card.js",
            "www/radar-math.js",
            "www/radar-renderer.js",
            "www/radar-ui.js",
            "www/roomabouts-presentation.js",
            "www/roomabouts-theme.js",
            "www/roomabouts-trails.js",
        )

        for relative_path in required:
            with self.subTest(path=relative_path):
                self.assertTrue((COMPONENT / relative_path).is_file())

    def test_relative_javascript_imports_resolve_and_share_manifest_version(self):
        manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
        version = manifest["version"]
        self.assertRegex(version, r"^\d+\.\d+\.\d+$")
        self.assertEqual(version, "1.5.0")
        self.assertEqual(len(tuple(WWW.glob("*.js"))), 8)
        imports_found = 0

        for source in sorted(WWW.glob("*.js")):
            text = source.read_text(encoding="utf-8")
            for match in RELATIVE_IMPORT.finditer(text):
                imports_found += 1
                specifier = match.group("specifier")
                import_path, separator, query = specifier.partition("?")
                resolved = (source.parent / import_path).resolve()
                with self.subTest(source=source.name, specifier=specifier):
                    self.assertTrue(resolved.is_relative_to(WWW.resolve()))
                    self.assertTrue(resolved.is_file())
                    self.assertEqual(separator, "?", "relative modules need a cache version")
                    self.assertEqual(query, f"v={version}")

        self.assertGreater(imports_found, 0)

    def test_actions_are_fully_pinned_and_permissions_are_explicit(self):
        workflow_files = sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")])
        self.assertGreater(len(workflow_files), 0)

        for workflow in workflow_files:
            text = workflow.read_text(encoding="utf-8")
            with self.subTest(workflow=workflow.name):
                self.assertRegex(text, r"(?m)^permissions:\n  contents: read(?:\n|$)")
                self.assertIn("runs-on: ubuntu-24.04", text)
                self.assertNotIn("runs-on: ubuntu-latest", text)
                actions = [match.group("action") for match in ACTION_USE.finditer(text)]
                self.assertGreater(len(actions), 0)
                for action in actions:
                    self.assertRegex(action, PINNED_ACTION)

                writes = re.findall(r"(?m)^\s+[a-z-]+:\s*write\s*$", text)
                if workflow.name == "release.yml":
                    self.assertEqual(writes, ["      contents: write"])
                    self.assertRegex(text, r"(?m)^    permissions:\n      contents: write$")
                else:
                    self.assertEqual(writes, [])

        validate = (WORKFLOWS / "validate.yml").read_text(encoding="utf-8")
        self.assertRegex(validate, r"(?m)^\s+comment:\s+false$")

    def test_compatibility_identifiers_and_release_archive_are_stable(self):
        manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
        hacs = json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))
        constants = (COMPONENT / "const.py").read_text(encoding="utf-8")
        setup = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
        card = (WWW / "radar-map-card.js").read_text(encoding="utf-8")
        release = (WORKFLOWS / "release.yml").read_text(encoding="utf-8")

        self.assertEqual(manifest["domain"], "radar_map_manager")
        self.assertEqual(hacs["filename"], "radar_map_manager.zip")
        self.assertIn('DOMAIN = "radar_map_manager"', constants)
        self.assertIn('WEB_URL = "/radar_map_manager/radar-map-card.js"', constants)
        self.assertRegex(
            setup,
            r"StaticPathConfig\(\s*['\"]/radar_map_manager['\"]",
        )
        self.assertIn('"manifest.json"', setup)
        self.assertNotIn("getmtime", setup)
        self.assertIn('customElements.define(\'radar-map-card\'', card)
        self.assertIn("cd custom_components/radar_map_manager", release)
        self.assertIn("zip -r ../../radar_map_manager.zip .", release)
        self.assertIn("files: radar_map_manager.zip", release)


if __name__ == "__main__":
    unittest.main()
