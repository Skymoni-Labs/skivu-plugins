"""Check local SDK examples and bounded, commit-pinned external JSON packages.

Downloaded plugin code is treated as data and never executed.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.request import Request, urlopen
from build_web_plugin import build,validate_package,require,MAX_PACKAGE,relative,manifest

ROOT=Path(__file__).resolve().parents[1]
def download(url):
    with urlopen(Request(url,headers={'User-Agent':'Skivu-catalog-validator/1.0'}),timeout=30) as response:
        require(response.geturl()==url,'Package redirect is not permitted')
        raw=response.read(MAX_PACKAGE+1)
    require(len(raw)<=MAX_PACKAGE,'External package exceeds size limit')
    return raw

def validate_entry(e,packages,loader=download):
    require(isinstance(e,dict) and set(e)=={'manifest','url','sha256','bytes'},'Invalid catalog entry')
    manifest(e['manifest'])
    require(isinstance(e['sha256'],str) and re.fullmatch(r'[a-f0-9]{64}',e['sha256']),'Invalid catalog digest')
    require(type(e['bytes']) is int and 0<e['bytes']<=MAX_PACKAGE,'Invalid catalog size')
    require(isinstance(e['url'],str),'Invalid package URL')
    m=re.fullmatch(r'https://raw\.githubusercontent\.com/([A-Za-z0-9_-]+)/([A-Za-z0-9_.-]+)/([a-f0-9]{40})/(.+)',e['url'])
    require(m and relative(m[4]) and m[4].endswith('.json'),'Catalog must pin a full commit and safe JSON path')
    ident=e['manifest']['id']
    if ident in packages:
        p,raw=packages[ident]
        require(m.group(1,2)==('skyjjgw','skivu-plugins') and m[4]==f'apps/{ident}/package.skivu.json','Local package URL mismatch')
        pinned=subprocess.check_output(['git','-C',str(ROOT),'show',f'{m[3]}:{m[4]}'])
        require(pinned==raw,'Pinned Web package differs')
    else:
        require(m.group(1,2)!=('skyjjgw','skivu-plugins'),'Missing local SDK package')
        raw=loader(e['url']);p=validate_package(raw)
        repo=f'https://github.com/{m[1]}/{m[2]}'
        require(p['manifest']['source']==repo or p['manifest']['source'].startswith(repo+'/tree/'+m[3]+'/'),'External source must identify its package repository')
    require(p['manifest']==e['manifest'] and len(raw)==e['bytes'] and hashlib.sha256(raw).hexdigest()==e['sha256'],'Catalog/package mismatch')

def validate():
    packages={}
    for path in sorted((ROOT/'apps').glob('*/package.skivu.json')):
        raw=path.read_bytes();p=validate_package(raw);ident=p['manifest']['id'];require(path.parent.name==ident,'Directory/ID mismatch');packages[ident]=(p,raw)
        provenance=json.loads(path.with_name('provenance.json').read_bytes())
        require(provenance['license']==p['manifest']['license'],'License provenance mismatch')
        preferred=(ROOT/provenance['sourceDirectory']).resolve();require(preferred.is_relative_to(ROOT) and preferred.is_dir(),'Missing editable source')
        require(build(preferred)==raw,'Preferred editable source differs from built package')
        for item in provenance['files']:
            file=(preferred/item['path']).resolve();require(file.is_relative_to(preferred) and hashlib.sha256(file.read_bytes()).hexdigest()==item['sha256'],'Editable source digest mismatch')
    count=0
    for name in ['apps.json','apps-v2.json']:
        path=ROOT/'catalog'/name;entries=[]
        if path.exists():
            c=json.loads(path.read_bytes());require(set(c)=={'schemaVersion','protocolVersion','packages'} and c['schemaVersion']==1 and c['protocolVersion']=='3.0' and isinstance(c['packages'],list) and len(c['packages'])<=5000,'Invalid Web catalog');entries=c['packages']
        seen=set()
        for e in entries:
            require(set(e)=={'manifest','url','sha256','bytes'},'Invalid catalog entry')
            ident=e['manifest']['id'];require(ident not in seen,'Duplicate Web plugin ID');seen.add(ident)
            validate_entry(e,packages)
        count+=len(entries)
    return len(packages),count

if __name__=='__main__':
    print('Web packages/listed:',validate())
