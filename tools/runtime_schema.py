"""Data-only presenter package constraints shared by repository validation."""
PRESET = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object", "additionalProperties": False,
    "required": ["schemaVersion", "kind", "renderer", "id", "name", "version", "author", "license", "description", "repository", "mode", "minHostVersion", "permissions"],
    "properties": {
        "schemaVersion": {"const": 1}, "kind": {"const": "ui-preset"},
        "renderer": {"const": "skivu.social-ui.v1"},
        "id": {"enum": ["skivu.qq", "skivu.wechat"]},
        "name": {"type": "string", "minLength": 1, "maxLength": 60},
        "version": {"type": "string", "pattern": r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$", "maxLength": 29},
        "minHostVersion": {"type": "string", "pattern": r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$", "maxLength": 29},
        "author": {"type": "string", "minLength": 1, "maxLength": 100},
        "license": {"const": "GPL-3.0-only"},
        "description": {"type": "string", "minLength": 1, "maxLength": 300},
        "repository": {"const": "https://github.com/skyjjgw/skivu-plugins"},
        "mode": {"enum": ["qq", "wechat"]}, "permissions": {"type": "array", "maxItems": 0},
    },
    "allOf": [{"if": {"properties": {"id": {"const": "skivu.qq"}}}, "then": {"properties": {"mode": {"const": "qq"}}}, "else": {"properties": {"mode": {"const": "wechat"}}}}],
}
