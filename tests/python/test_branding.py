import hashlib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "custom_components" / "radar_map_manager"


class BrandingTests(unittest.TestCase):
    def test_display_names_use_roomabouts_without_renaming_identifiers(self):
        sensor = (COMPONENT / "sensor.py").read_text(encoding="utf-8")
        binary_sensor = (COMPONENT / "binary_sensor.py").read_text(encoding="utf-8")
        processor = (COMPONENT / "processor.py").read_text(encoding="utf-8")
        coordinator = (COMPONENT / "coordinator.py").read_text(encoding="utf-8")

        self.assertIn('f"Roomabouts {map_str} {config[\'zone_name\']} Count"', sensor)
        self.assertIn('f"Roomabouts {map_str} {config[\'name\']} Occupancy"', binary_sensor)
        self.assertIn('f"Roomabouts {map_group} Fall Alert"', binary_sensor)
        self.assertIn('f"Roomabouts {map_id} Master"', processor)
        self.assertIn('self.name = "Roomabouts Coordinator"', coordinator)

        combined = "\n".join((sensor, binary_sensor, processor, coordinator))
        self.assertNotIn('f"RMM {', combined)
        self.assertNotIn("RadarMapManager Coordinator", combined)

    def test_logs_and_console_use_roomabouts_prefix(self):
        sources = [
            *COMPONENT.glob("*.py"),
            *(COMPONENT / "www").glob("*.js"),
        ]
        combined = "\n".join(path.read_text(encoding="utf-8") for path in sources)

        self.assertNotIn('"RMM:', combined)
        self.assertNotIn("'RMM:", combined)
        self.assertNotIn("[RMM]", combined)

    def test_inherited_rmm_bitmap_branding_is_not_shipped(self):
        possible_assets = (
            ROOT / "icon.png",
            ROOT / "logo.png",
            COMPONENT / "brand" / "icon.png",
            COMPONENT / "brand" / "logo.png",
        )
        inherited_hashes = {
            "d8c15763e93414ac55f6aca859cb4c65b2fb77e070bae12f905d60ba976eb01f",
            "71f590cb80c2e34f1ca9dd492cf9a5c963982c84a470b38b80cc0e537033dcb8",
        }

        for asset in possible_assets:
            with self.subTest(asset=asset.relative_to(ROOT)):
                if asset.exists():
                    digest = hashlib.sha256(asset.read_bytes()).hexdigest()
                    self.assertNotIn(digest, inherited_hashes)


if __name__ == "__main__":
    unittest.main()
