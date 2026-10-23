import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import validate


class PackageValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / "package"
        shutil.copytree(validate.ROOT / "examples/writing-assistant", self.package)

    def change(self, **values):
        path = self.package / "plugin.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data.update(values)
        path.write_text(json.dumps(data), encoding="utf-8")

    def test_repository_and_example_are_valid(self):
        self.assertEqual(validate.validate_repository(), 2)
        self.assertEqual(validate.validate_package(self.package)["kind"], "prompt-pack")

    def test_entry_cannot_escape_package_or_use_windows_paths(self):
        for value in ("../outside.md", "/outside.md", "C:/outside.md", "prompts\\system.md", "prompts/../LICENSE"):
            with self.subTest(value=value):
                self.change(entry=value)
                with self.assertRaises(ValueError):
                    validate.validate_package(self.package)

    def test_missing_entry_and_license_are_rejected(self):
        self.change(entry="prompts/missing.md")
        with self.assertRaises(ValueError):
            validate.validate_package(self.package)
        self.change(entry="prompts/system.md")
        (self.package / "LICENSE").unlink()
        with self.assertRaises(ValueError):
            validate.validate_package(self.package)

    def test_unsupported_permissions_and_code_kind_are_rejected(self):
        for values in ({"permissions": ["network"]}, {"kind": "javascript"}, {"unexpected": True}):
            with self.subTest(values=values):
                original = (self.package / "plugin.json").read_text(encoding="utf-8")
                self.change(**values)
                with self.assertRaises(ValueError):
                    validate.validate_package(self.package)
                (self.package / "plugin.json").write_text(original, encoding="utf-8")

    def test_binary_empty_and_oversize_entries_are_rejected(self):
        entry = self.package / "prompts/system.md"
        for raw in (b"\xff", b"\x00", b"  ", b"x" * (validate.MAX_ENTRY_BYTES + 1)):
            with self.subTest(size=len(raw)):
                entry.write_bytes(raw)
                with self.assertRaises(ValueError):
                    validate.validate_package(self.package)

    def test_duplicate_json_fields_are_rejected(self):
        path = self.package / "plugin.json"
        path.write_text('{"id":"one", "id":"two"}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            validate.validate_package(self.package)


class CatalogValidationTests(unittest.TestCase):
    def setUp(self):
        self.data = {"schemaVersion": 1, "protocolVersion": "0.1-draft", "runtimeReady": False, "plugins": []}
        self.entry = {
            "id": "author.example", "name": "Example", "version": "0.1.0",
            "author": "Author", "license": "GPL-3.0-only", "permissions": [], "status": "preview",
            "source": {"repository": "https://github.com/author/example", "commit": "a" * 40, "packagePath": "."}
        }

    def test_preview_entry_is_allowed(self):
        self.data["plugins"] = [self.entry]
        validate.validate_catalog(self.data)

    def test_duplicate_plugin_id_is_rejected(self):
        self.data["plugins"] = [self.entry, copy.deepcopy(self.entry)]
        with self.assertRaisesRegex(ValueError, "Duplicate plugin ID"):
            validate.validate_catalog(self.data)

    def test_unpinned_source_and_unsafe_paths_are_rejected(self):
        for key, value in (("commit", "main"), ("packagePath", "../private"), ("repository", "http://example.com/repo")):
            with self.subTest(key=key):
                entry = copy.deepcopy(self.entry)
                entry["source"][key] = value
                self.data["plugins"] = [entry]
                with self.assertRaises(ValueError):
                    validate.validate_catalog(self.data)

    def test_runtime_cannot_be_enabled_by_catalog(self):
        self.data["runtimeReady"] = True
        with self.assertRaises(ValueError):
            validate.validate_catalog(self.data)


if __name__ == "__main__":
    unittest.main()
