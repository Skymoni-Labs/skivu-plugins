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
    def role_package(self):
        p=json.loads(web.build(ROOT/'templates/web-plugin'));m=p['manifest'];m['minHostVersion']='0.2.41';m['permissions'].append('chat.tools');m['contributes']['roleCompanion']={'title':'Role item','entry':'runtime.html','tools':[{'id':'read_note','description':'Read own role note','effect':'read','parameters':{'type':'object','properties':{},'required':[],'additionalProperties':False}}]};p['files']['runtime.html']=p['files']['index.html'];return p
    def test_role_companion_uses_generic_package_entry(self):
        p=self.role_package();self.assertEqual(web.validate_package(json.dumps(p).encode())['manifest']['contributes']['roleCompanion']['entry'],'runtime.html')
    def test_role_companion_requires_explicit_permission_new_host_and_real_resource(self):
        for change in ('permission','version','entry'):
            with self.subTest(change=change):
                p=self.role_package()
                if change=='permission':p['manifest']['permissions'].remove('chat.tools')
                if change=='version':p['manifest']['minHostVersion']='0.2.40'
                if change=='entry':del p['files']['runtime.html']
                with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())
    def test_role_schema_rejects_unknown_keywords_and_unbounded_objects(self):
        for field in ('additionalProperties','properties','required'):
            p=self.role_package();del p['manifest']['contributes']['roleCompanion']['tools'][0]['parameters'][field]
            with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())
        p=self.role_package();p['manifest']['contributes']['roleCompanion']['tools'][0]['parameters']['pattern']='.*'
        with self.assertRaises(ValueError):web.validate_package(json.dumps(p).encode())
    def test_resource_order_and_mimes_do_not_depend_on_platform(self):
        with tempfile.TemporaryDirectory() as temporary:
            target=Path(temporary)
            for name in ('manifest.json','LICENSE','index.html'):
                (target/name).write_bytes((ROOT/'templates/web-plugin'/name).read_bytes())
            for name in ('Zulu.txt','alpha.txt','README.md','data.unknown'):
                (target/name).write_text('public test fixture',encoding='utf-8')
            package=web.validate_package(web.build(target))
            self.assertEqual(list(package['files']),sorted(package['files']))
            self.assertEqual(package['files']['README.md']['mime'],'text/markdown')
            self.assertEqual(package['files']['Zulu.txt']['mime'],'text/plain')
            self.assertEqual(package['files']['data.unknown']['mime'],'application/octet-stream')
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
