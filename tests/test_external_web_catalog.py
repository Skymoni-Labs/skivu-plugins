"""Catalog-only entries retain immutable URLs and byte/manifest verification."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_web_plugin import build
from validate_web_plugins import validate_entry

class ExternalCatalogTests(unittest.TestCase):
    def setUp(self):
        package=json.loads(build(ROOT/'templates/web-plugin'))
        package['manifest']['source']='https://github.com/example/independent-plugin'
        self.raw=json.dumps(package,ensure_ascii=False).encode()
        self.entry={'manifest':package['manifest'],'url':'https://raw.githubusercontent.com/example/independent-plugin/'+'a'*40+'/packages/plugin.skivu.json','sha256':hashlib.sha256(self.raw).hexdigest(),'bytes':len(self.raw)}

    def check(self,entry):
        calls=[]
        validate_entry(entry,{},lambda url:calls.append(url) or self.raw)
        self.assertEqual(calls,[entry['url']])

    def test_external_repository_needs_no_local_source_or_bundle(self):
        self.check(self.entry)

    def test_mutable_commits_hosts_and_paths_are_rejected_before_fetch(self):
        for url in [self.entry['url'].replace('a'*40,'main'),self.entry['url'].replace('https:','http:'),self.entry['url'].replace('raw.githubusercontent.com','example.com'),self.entry['url'].replace('/packages/','/../')]:
            entry=copy.deepcopy(self.entry);entry['url']=url
            with self.assertRaises(ValueError):
                validate_entry(entry,{},lambda _:self.fail('Invalid URL was fetched'))

    def test_tampered_manifest_digest_size_and_source_are_rejected(self):
        for key,value in [('sha256','0'*64),('bytes',len(self.raw)+1),('bytes',True)]:
            entry=copy.deepcopy(self.entry);entry[key]=value
            with self.assertRaises(ValueError):self.check(entry)
        entry=copy.deepcopy(self.entry);entry['manifest']['name']='Changed'
        with self.assertRaises(ValueError):self.check(entry)
        entry=copy.deepcopy(self.entry);entry['url']=entry['url'].replace('/example/','/other/')
        with self.assertRaises(ValueError):self.check(entry)

if __name__=='__main__':unittest.main()
