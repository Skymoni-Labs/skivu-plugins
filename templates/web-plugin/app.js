/* SPDX-License-Identifier: GPL-3.0-only */
const $=id=>document.getElementById(id);let count=0;
const output=value=>{$('output').textContent=typeof value==='string'?value:JSON.stringify(value,null,2);};
async function run(button,task){button.disabled=true;try{await task();}catch(e){output(`${e.code||'ERROR'}: ${e.message}`);}finally{button.disabled=false;}}
function render(){$('count').textContent=String(count);}
$('increment').onclick=()=>run($('increment'),async()=>{const next=count+1;await Skivu.call('storage.set',{key:'counter',value:next});count=next;render();$('save-state').textContent='已保存，关闭重开仍会保留。';output('存档已提交到本插件的独立空间。');});
$('context').onclick=()=>run($('context'),async()=>output(await Skivu.call('context.get')));
$('capabilities').onclick=()=>run($('capabilities'),async()=>output(await Skivu.call('host.info')));
$('export').onclick=()=>run($('export'),async()=>{const bytes=new TextEncoder().encode(JSON.stringify({schema:'plugin-lab-v1',count}));let data='';for(const b of bytes)data+=String.fromCharCode(b);output(await Skivu.call('files.save',{name:'plugin-lab-backup.json',mime:'application/json',base64:btoa(data)})?'已导出存档。':'已取消导出。');});
$('import').onclick=()=>run($('import'),async()=>{const f=await Skivu.call('files.pick');if(!f)return;const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))));if(value.schema!=='plugin-lab-v1'||!Number.isSafeInteger(value.count)||value.count<0)throw new Error('存档格式不正确。');await Skivu.call('storage.set',{key:'counter',value:value.count});count=value.count;render();output(`已从 ${f.name} 恢复。`);});
Skivu.on('context.changed',output);
try{count=(await Skivu.call('storage.get',{key:'counter'}))??0;render();$('save-state').textContent='存档已载入。';output(await Skivu.call('context.get'));console.log('Plugin Lab SDK ready',Skivu.apiVersion);}catch(e){output(`${e.code}: ${e.message}`);}
