import json
import re
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


class ReleaseContractTests(unittest.TestCase):
    def test_all_json_files_are_valid(self):
        json_files = sorted(ROOT.rglob("*.json"))
        self.assertGreater(len(json_files), 0)

        for path in json_files:
            with self.subTest(path=path.relative_to(ROOT)):
                with path.open(encoding="utf-8") as handle:
                    json.load(handle)

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
        )

        for relative_path in required:
            with self.subTest(path=relative_path):
                self.assertTrue((COMPONENT / relative_path).is_file())

    def test_relative_javascript_imports_resolve_and_share_manifest_version(self):
        manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
        version = manifest["version"]
        self.assertRegex(version, r"^\d+\.\d+\.\d+$")
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
        self.assertIn('StaticPathConfig("/radar_map_manager"', setup)
        self.assertIn('customElements.define(\'radar-map-card\'', card)
        self.assertIn("cd custom_components/radar_map_manager", release)
        self.assertIn("zip -r ../../radar_map_manager.zip .", release)
        self.assertIn("files: radar_map_manager.zip", release)


if __name__ == "__main__":
    unittest.main()
