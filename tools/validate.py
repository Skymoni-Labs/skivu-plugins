"""Validate draft metadata and local text resources; never execute package content."""
from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import sys

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
MAX_ENTRY_BYTES = 256 * 1024


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path: Path, limit=64 * 1024):
    raw = path.read_bytes()
    if len(raw) > limit:
        raise ValueError(f"JSON file too large: {path.name}")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object,
                      parse_constant=lambda value: invalid_constant(value))


def invalid_constant(value):
    raise ValueError(f"Invalid JSON constant: {value}")


def check_schema(data, name):
    schema = read_json(ROOT / "schemas" / name)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(data), key=lambda e: str(list(e.path)))
    if errors:
        first = errors[0]
        location = ".".join(map(str, first.path)) or "root"
        raise ValueError(f"{location}: {first.message}")


def safe_relative(value: str, allow_dot=False):
    if allow_dot and value == ".":
        return PurePosixPath(".")
    parts = value.split("/")
    if (not value or any(c in value for c in ("\\", ":", "\x00"))
            or any(part in ("", ".", "..") for part in parts)
            or PurePosixPath(value).is_absolute()):
        raise ValueError("Expected a plain relative path within the package")
    return PurePosixPath(value)


def local_file(package: Path, value: str):
    relative = safe_relative(value)
    candidate = package
    for part in relative.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError("Symbolic links are not accepted in package resources")
    if not candidate.resolve().is_relative_to(package.resolve()):
        raise ValueError("Resource escapes the package")
    if not candidate.is_file():
        raise ValueError(f"Missing local resource: {value}")
    return candidate


def validate_package(package: Path):
    if package.is_symlink():
        raise ValueError("Package directory cannot be a symbolic link")
    manifest = read_json(local_file(package, "plugin.json"))
    check_schema(manifest, "plugin.schema.json")
    entry = local_file(package, manifest["entry"])
    if entry.suffix.lower() not in (".md", ".txt"):
        raise ValueError("Entry must be a Markdown or text file")
    if entry.stat().st_size > MAX_ENTRY_BYTES:
        raise ValueError("Text entry exceeds 256 KiB")
    text = entry.read_text(encoding="utf-8")
    if not text.strip() or "\x00" in text:
        raise ValueError("Text entry must be nonempty UTF-8 without NUL bytes")
    for required in ("README.md", "LICENSE"):
        resource = local_file(package, required)
        if resource.stat().st_size > MAX_ENTRY_BYTES:
            raise ValueError(f"{required} exceeds 256 KiB")
        if not resource.read_text(encoding="utf-8").strip():
            raise ValueError(f"{required} cannot be empty")
    return manifest


def validate_catalog(data):
    check_schema(data, "catalog.schema.json")
    seen = set()
    for plugin in data["plugins"]:
        if plugin["id"] in seen:
            raise ValueError(f"Duplicate plugin ID: {plugin['id']}")
        seen.add(plugin["id"])
        safe_relative(plugin["source"]["packagePath"], allow_dot=True)


def validate_repository():
    validate_catalog(read_json(ROOT / "catalog/index.json", limit=1024 * 1024))
    ids = set()
    count = 0
    for parent in ("templates", "examples"):
        for manifest_path in sorted((ROOT / parent).rglob("plugin.json")):
            manifest = validate_package(manifest_path.parent)
            if manifest["id"] in ids:
                raise ValueError(f"Duplicate local plugin ID: {manifest['id']}")
            ids.add(manifest["id"])
            count += 1
    if not count:
        raise ValueError("No local examples or templates found")
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, help="Validate one local package")
    args = parser.parse_args()
    try:
        if args.package is not None:
            manifest = validate_package(args.package)
            print(f"Valid draft package: {manifest['id']} {manifest['version']}")
        else:
            count = validate_repository()
            print(f"Valid preview catalog and {count} local packages; runtime not enabled")
    except (ValueError, OSError) as error:
        print(f"Validation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
