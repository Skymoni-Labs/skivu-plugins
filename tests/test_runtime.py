import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import validate


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        raw = (validate.ROOT / "plugins/qq/plugin.json").read_bytes()
        self.entry = json.loads(raw)
        self.entry["package"] = {"url": "https://raw.githubusercontent.com/skyjjgw/skivu-plugins/" + "a" * 40 + "/plugins/qq/plugin.json", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
        self.catalog = {"schemaVersion": 2, "protocolVersion": "1.0", "runtimeReady": True, "plugins": [self.entry]}

    def test_valid_data_preset_and_catalog(self):
        validate.validate_catalog(self.catalog)
        self.assertEqual(validate.validate_package(validate.ROOT / "plugins/qq")["mode"], "qq")

    def test_executable_extra_permissions_and_unknown_fields_rejected(self):
        for changes in ({"script": "x.js"}, {"permissions": ["network"]}, {"renderer": "script"}, {"mode": "wechat"}, {"id": "unknown.plugin"}):
            data = copy.deepcopy(self.catalog)
            data["plugins"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate.validate_catalog(data)

    def test_unpinned_source_hash_size_and_duplicates_rejected(self):
        for changes in ({"url": "https://evil.test/plugin.json"}, {"url": self.entry["package"]["url"].replace("a" * 40, "main")}, {"sha256": "bad"}, {"bytes": 999999}):
            data = copy.deepcopy(self.catalog)
            data["plugins"][0]["package"].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate.validate_catalog(data)
        self.catalog["plugins"].append(self.entry)
        with self.assertRaises(ValueError):
            validate.validate_catalog(self.catalog)
