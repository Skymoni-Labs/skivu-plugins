"""Build an editable Web plugin into a deterministic .skivu.json package.

This tool reads files only. It never imports or executes plugin code.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse

MAX_PACKAGE=32*1024*1024
MIME_TYPES={'.html':'text/html','.htm':'text/html','.css':'text/css',
            '.js':'application/javascript','.mjs':'application/javascript',
            '.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml',
            '.txt':'text/plain','.md':'text/markdown','.png':'image/png',
            '.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
            '.ico':'image/vnd.microsoft.icon','.woff':'font/woff','.woff2':'font/woff2',
            '.ttf':'font/ttf','.otf':'font/otf','.mp3':'audio/mpeg','.wav':'audio/wav',
            '.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm','.pdf':'application/pdf'}
PERMISSIONS={'storage','files','secrets','network','network.local','characters.read','characters.write','chat.read','chat.write','ai.generate','prompt','clipboard','external.open','chat.tools'}
MANIFEST_KEYS={'schemaVersion','apiVersion','id','name','version','minHostVersion','author','description','license','source','entry','permissions','networkDomains','contributes'}

def require(value,message):
    if not value: raise ValueError(message)

def relative(value):
    return isinstance(value,str) and 0<len(value)<=240 and not re.search(r'[\\:\x00-\x1f]',value) and all(p not in ('','.','..') for p in value.split('/'))

def tool_schema(value,depth=0):
    require(depth<=6 and isinstance(value,dict) and set(value)<={'type','properties','required','additionalProperties','items','enum','maxLength','maxItems','description'},'Invalid tool schema')
    require(value.get('type') in ('object','array','string','number','integer','boolean'),'Invalid tool parameter type')
    if 'description' in value:require(isinstance(value['description'],str) and len(value['description'])<=1000,'Invalid parameter description')
    if 'enum' in value:require(isinstance(value['enum'],list) and 0<len(value['enum'])<=64 and all(not isinstance(v,(dict,list)) for v in value['enum']),'Invalid parameter enum')
    for key,limit in [('maxLength',12000),('maxItems',100)]:
        if key in value:require(type(value[key]) is int and 1<=value[key]<=limit,'Invalid parameter limit')
    if value['type']=='object':
        props=value.get('properties');required=value.get('required')
        require(isinstance(props,dict) and len(props)<=30 and isinstance(required,list) and all(isinstance(k,str) and k in props for k in required) and type(value.get('additionalProperties')) is bool,'Invalid object parameters')
        for key,nested in props.items():
            require(re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{0,79}',key),'Invalid parameter name');tool_schema(nested,depth+1)
    if value['type']=='array':tool_schema(value.get('items'),depth+1)

def companion(raw,permissions,minimum):
    require(isinstance(raw,dict) and set(raw)=={'title','entry','tools'} and isinstance(raw['title'],str) and 0<len(raw['title'])<=80 and relative(raw['entry']) and raw['entry'].endswith('.html'),'Invalid companion')
    require('chat.tools' in permissions and tuple(map(int,minimum.split('.')))>=(0,2,41),'Companion requires chat.tools and host 0.2.41')
    require(isinstance(raw['tools'],list) and 0<len(raw['tools'])<=20,'Invalid companion tools');ids=set()
    for tool in raw['tools']:
        require(isinstance(tool,dict) and set(tool)=={'id','description','effect','parameters'} and isinstance(tool['id'],str) and re.fullmatch(r'[a-z][a-z0-9_]{0,59}',tool['id']) and tool['id'] not in ids and isinstance(tool['description'],str) and 0<len(tool['description'])<=1200 and tool['effect'] in ('read','write','external'),'Invalid companion tool')
        ids.add(tool['id']);tool_schema(tool['parameters']);require(tool['parameters']['type']=='object','Tool arguments must be object')

def manifest(raw):
    require(isinstance(raw,dict) and set(raw)==MANIFEST_KEYS and raw['schemaVersion']==1 and raw['apiVersion']=='1.0','Unsupported manifest/API')
    for key,limit in [('id',120),('name',100),('description',1000),('author',150),('license',150),('source',1000),('entry',240)]:
        require(isinstance(raw[key],str) and raw[key].strip() and len(raw[key])<=limit and '\0' not in raw[key],f'Invalid {key}')
    require(re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)+',raw['id']),'Invalid plugin ID')
    for key in ('version','minHostVersion'):
        require(isinstance(raw[key],str) and len(raw[key])<=30 and re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)',raw[key]) and all(int(p)<=2147483647 for p in raw[key].split('.')),'Invalid version')
    u=urlparse(raw['source']);require(u.scheme=='https' and u.hostname and not u.username and not u.fragment,'Invalid source URL')
    require(relative(raw['entry']) and raw['entry'].endswith('.html'),'Entry must be a relative HTML file')
    permissions=raw['permissions'];domains=raw['networkDomains']
    require(isinstance(permissions,list) and len(permissions)==len(set(permissions)) and set(permissions)<=PERMISSIONS,'Unsupported/duplicate permission')
    require(isinstance(domains,list) and len(domains)<=100 and len(domains)==len(set(domains)) and all(isinstance(d,str) and len(d)<=253 and (d=='*' or re.fullmatch(r'(\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',d)) for d in domains),'Invalid network domains')
    require(not domains or 'network' in permissions,'Missing network permission')
    require('network.local' not in permissions or 'network' in permissions,'Local network also needs network permission')
    c=raw['contributes'];require(isinstance(c,dict) and set(c)<={'launcher','chatActions','chatSurface','roleCompanion'} and isinstance(c.get('launcher'),bool) and isinstance(c.get('chatActions'),list) and len(c['chatActions'])<=20 and ('chatSurface' not in c or isinstance(c['chatSurface'],bool)),'Invalid contribution')
    if 'roleCompanion' in c:companion(c['roleCompanion'],permissions,raw['minHostVersion'])
    ids=set()
    for a in c['chatActions']:
        require(isinstance(a,dict) and set(a)=={'id','title'} and isinstance(a['id'],str) and re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,79}',a['id']) and a['id'] not in ids and isinstance(a['title'],str) and 0<len(a['title'])<=80,'Invalid action')
        ids.add(a['id'])
    return raw

def validate_package(raw):
    require(len(raw)<=MAX_PACKAGE,'Package exceeds 32 MiB')
    p=json.loads(raw);require(isinstance(p,dict) and set(p)=={'manifest','files','licenseText','notices'},'Invalid package keys')
    m=manifest(p['manifest']);require(isinstance(p['licenseText'],str) and p['licenseText'].strip() and len(p['licenseText'])<=256*1024 and isinstance(p['notices'],str) and len(p['notices'])<=256*1024,'Missing license/notices')
    require(isinstance(p['files'],dict) and len(p['files'])<=512 and m['entry'] in p['files'],'Invalid/missing resources')
    total=0
    for name,f in p['files'].items():
        require(relative(name) and name!='skivu-sdk.js' and isinstance(f,dict) and set(f)=={'mime','base64'} and isinstance(f['mime'],str) and re.fullmatch(r'[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+',f['mime']),'Invalid resource')
        data=base64.b64decode(f['base64'],validate=True);total+=len(data);require(len(data)<=8*1024*1024 and total<=24*1024*1024,'Resources exceed limits')
    require(p['files'][m['entry']]['mime']=='text/html','Entry MIME must be text/html')
    if 'roleCompanion' in m['contributes']:require(p['files'].get(m['contributes']['roleCompanion']['entry'],{}).get('mime')=='text/html','Missing companion entry')
    return p

def build(directory):
    root=Path(directory).resolve();m=manifest(json.loads((root/'manifest.json').read_text(encoding='utf-8')))
    license=(root/'LICENSE').read_text(encoding='utf-8')
    notices=(root/'NOTICE').read_text(encoding='utf-8') if (root/'NOTICE').exists() else f"Copyright {m['author']}\nSource: {m['source']}\nLicense: {m['license']}\n"
    files={};total=0
    # WindowsPath compares case-insensitively, unlike PosixPath. Resource order
    # is serialized into the signed/digested package, so compare POSIX strings.
    for path in sorted(root.rglob('*'),key=lambda p:p.relative_to(root).as_posix()):
        rel=path.relative_to(root).as_posix()
        require(not path.is_symlink(),'Symlinks are not supported')
        if not path.is_file() or rel in ('manifest.json','LICENSE','NOTICE') or any(p in ('.git','node_modules','dist','__pycache__') for p in path.relative_to(root).parts):continue
        size=path.stat().st_size;total+=size
        require(size<=8*1024*1024 and total<=24*1024*1024 and len(files)<512,'Resources exceed limits')
        # The Windows registry and host /etc/mime.types are not build inputs.
        mime=MIME_TYPES.get(path.suffix.lower(),'application/octet-stream')
        files[rel]={'mime':mime,'base64':base64.b64encode(path.read_bytes()).decode('ascii')}
    value={'manifest':m,'files':files,'licenseText':license,'notices':notices}
    raw=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8');validate_package(raw);return raw

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory',nargs='?');parser.add_argument('--output');parser.add_argument('--check');args=parser.parse_args()
    if args.check:
        raw=Path(args.check).read_bytes();validate_package(raw)
    else:
        if not args.directory or not args.output:parser.error('directory and --output are required')
        raw=build(args.directory);target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    print(json.dumps({'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}))
