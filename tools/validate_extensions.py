"""Validate extension packages without importing or executing their content."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 768 * 1024
KEYS = {'schemaVersion', 'id', 'name', 'version', 'author', 'license', 'description', 'kind', 'minHostVersion', 'permissions', 'source'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def plain_path(value):
    return isinstance(value, str) and bool(value) and not re.search(r'[\\:\x00]', value) and not any(part in ('', '.', '..') for part in value.split('/'))


def metadata(value):
    require(isinstance(value, dict) and set(value) == KEYS and value['schemaVersion'] == 1, 'Invalid extension metadata keys')
    for key, limit in [('id', 120), ('name', 100), ('author', 150), ('license', 150), ('description', 800)]:
        require(isinstance(value[key], str) and value[key].strip() and len(value[key]) <= limit and '\x00' not in value[key], f'Invalid {key}')
    require(re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)+', value['id']), 'Invalid ID')
    for key in ('version', 'minHostVersion'):
        require(isinstance(value[key], str) and len(value[key]) < 30 and re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value[key]), 'Invalid version')
    require(value['kind'] in ('skill', 'mcp-http'), 'Unsupported extension kind')
    require(value['permissions'] == (['prompt'] if value['kind'] == 'skill' else ['network']), 'Invalid permissions')
    source = value['source']
    require(isinstance(source, dict) and set(source) == {'repository', 'commit', 'path'}, 'Missing provenance')
    require(re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', source['repository']) and re.fullmatch(r'[a-f0-9]{40}', source['commit']), 'Source must use a pinned GitHub commit')
    require(source['path'] == '.' or plain_path(source['path']), 'Invalid source path')


def package(path):
    raw = path.read_bytes()
    require(len(raw) <= MAX_BYTES, 'Extension is too large')
    value = json.loads(raw)
    require(set(value) == {'metadata', 'payload'}, 'Invalid extension package keys')
    metadata(value['metadata'])
    payload = value['payload']
    require(isinstance(payload, dict), 'Invalid payload')
    require(isinstance(payload.get('licenseText'), str) and payload['licenseText'].strip(), 'Missing license text')
    allowed = {'licenseText', 'notices', 'requirements'} | ({'instruction', 'references'} if value['metadata']['kind'] == 'skill' else {'endpoint', 'setup'})
    require(set(payload) <= allowed, 'Executable or unknown payload field')
    if value['metadata']['kind'] == 'skill':
        require(isinstance(payload.get('instruction'), str) and 0 < len(payload['instruction']) <= 256 * 1024 and '\x00' not in payload['instruction'], 'Missing instruction')
        refs = payload.get('references', {})
        require(isinstance(refs, dict) and len(refs) <= 100 and all(plain_path(k) and isinstance(v, str) and '\x00' not in v for k, v in refs.items()), 'Invalid references')
    else:
        require(isinstance(payload.get('setup'), str) and payload['setup'].strip(), 'Missing setup instructions')
        if payload.get('endpoint'):
            uri = urlparse(payload['endpoint'])
            require(uri.scheme == 'https' and uri.hostname and not uri.username and not uri.fragment and not any(re.search(r'token|secret|key|password', key, re.I) for key in parse_qs(uri.query)), 'Invalid endpoint')
    return value, raw


def validate():
    catalog = ROOT / 'catalog/extensions.json'
    entries = []
    if catalog.exists():
        data = json.loads(catalog.read_bytes())
        require(set(data) == {'schemaVersion', 'protocolVersion', 'plugins'} and data['schemaVersion'] == 1 and data['protocolVersion'] == '2.0', 'Invalid extension catalog')
        require(isinstance(data['plugins'], list) and len(data['plugins']) <= 5000, 'Invalid plugin list')
        entries = data['plugins']
    seen = set()
    for entry in entries:
        value = {k: v for k, v in entry.items() if k != 'package'}
        metadata(value)
        require(value['id'] not in seen, 'Duplicate extension ID')
        seen.add(value['id'])
        spec = entry['package']
        pattern = r'https://raw\.githubusercontent\.com/skyjjgw/skivu-plugins/([a-f0-9]{40})/extensions/' + re.escape(value['id']) + r'/package\.json'
        match = re.fullmatch(pattern, spec.get('url', ''))
        require(set(spec) == {'url', 'sha256', 'bytes'} and match, 'Invalid immutable URL')
        require(re.fullmatch(r'[a-f0-9]{64}', spec['sha256']) and type(spec['bytes']) is int and 0 < spec['bytes'] <= MAX_BYTES, 'Invalid digest/size')
        package_path = ROOT / 'extensions' / value['id'] / 'package.json'
        parsed, raw = package(package_path)
        require(parsed['metadata'] == value and hashlib.sha256(raw).hexdigest() == spec['sha256'] and len(raw) == spec['bytes'], 'Catalog differs from local package')
        pinned = subprocess.check_output(['git', '-C', str(ROOT), 'show', f"{match[1]}:extensions/{value['id']}/package.json"])
        require(pinned == raw, 'Pinned commit differs from local package')
    packages = list((ROOT / 'extensions').glob('*/package.json'))
    for path in packages:
        value, _ = package(path)
        require(path.parent.name == value['metadata']['id'], 'Package directory and ID differ')
        provenance = json.loads(path.with_name('provenance.json').read_bytes())
        require(provenance['upstream'] == value['metadata']['source'] and provenance['license'] == value['metadata']['license'], 'Provenance differs')
        original = path.parent / 'source' / 'SKILL.md'
        if value['metadata']['kind'] == 'skill':
            require(original.read_text(encoding='utf-8') == value['payload']['instruction'], 'Editable source instruction differs')
            for relative, text in value['payload'].get('references', {}).items():
                require((path.parent / 'source' / relative).read_text(encoding='utf-8') == text, 'Editable reference differs')
    return len(packages), len(entries)


if __name__ == '__main__':
    try:
        packages, entries = validate()
        print(f'Valid extension packages: {packages}; catalog entries: {entries}')
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f'Extension validation failed: {error}', file=sys.stderr)
        raise SystemExit(1)
