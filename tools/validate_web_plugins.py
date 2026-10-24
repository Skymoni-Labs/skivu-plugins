"""Check Web packages, editable source and immutable catalog history."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from build_web_plugin import build,validate_package,require

ROOT=Path(__file__).resolve().parents[1]
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
    path=ROOT/'catalog/apps.json';entries=[]
    if path.exists():
        c=json.loads(path.read_bytes());require(set(c)=={'schemaVersion','protocolVersion','packages'} and c['schemaVersion']==1 and c['protocolVersion']=='3.0' and isinstance(c['packages'],list) and len(c['packages'])<=5000,'Invalid Web catalog');entries=c['packages']
    seen=set()
    for e in entries:
        require(set(e)=={'manifest','url','sha256','bytes'},'Invalid catalog entry')
        ident=e['manifest']['id'];require(ident not in seen,'Duplicate Web plugin ID');seen.add(ident)
        require(ident in packages,'Missing catalog package');p,raw=packages[ident]
        require(p['manifest']==e['manifest'] and len(raw)==e['bytes'] and hashlib.sha256(raw).hexdigest()==e['sha256'],'Catalog/package mismatch')
        m=re.fullmatch(r'https://raw\.githubusercontent\.com/skyjjgw/skivu-plugins/([a-f0-9]{40})/apps/'+re.escape(ident)+r'/package\.skivu\.json',e['url']);require(m,'Official catalog must pin a full commit')
        pinned=subprocess.check_output(['git','-C',str(ROOT),'show',f'{m[1]}:apps/{ident}/package.skivu.json']);require(pinned==raw,'Pinned Web package differs')
    return len(packages),len(entries)

if __name__=='__main__':
    print('Web packages/listed:',validate())
