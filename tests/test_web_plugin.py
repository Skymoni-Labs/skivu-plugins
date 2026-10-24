import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('web_plugin',ROOT/'tools/build_web_plugin.py')
web=importlib.util.module_from_spec(spec);spec.loader.exec_module(web)

class WebPluginTests(unittest.TestCase):
    def test_template_build_is_deterministic_and_resources_remain_editable(self):
        a=web.build(ROOT/'templates/web-plugin');b=web.build(ROOT/'templates/web-plugin');self.assertEqual(a,b)
        p=web.validate_package(a);self.assertEqual(base64.b64decode(p['files']['app.js']['base64']),(ROOT/'templates/web-plugin/app.js').read_bytes())
        self.assertTrue(p['manifest']['contributes']['chatSurface'])
    def test_bad_permissions_and_paths_fail_before_packaging(self):
        p=json.loads(web.build(ROOT/'templates/web-plugin'));p['manifest']['permissions'].append('server.config')
        with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())
        p=json.loads(web.build(ROOT/'templates/web-plugin'));p['files']['../private.json']=p['files']['app.js']
        with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())
    def test_host_sdk_cannot_be_replaced_and_missing_entry_fails(self):
        p=json.loads(web.build(ROOT/'templates/web-plugin'));p['files']['skivu-sdk.js']=p['files']['app.js']
        with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())
        p['files']={}
        with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())

if __name__=='__main__':unittest.main()
