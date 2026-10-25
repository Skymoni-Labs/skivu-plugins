/* SPDX-License-Identifier: GPL-3.0-only. Independent Skivu plugin application. */
import {PocketPhoneStore} from './engine.js';
import {phoneModules,phoneCollections} from './collections.js';
import {PocketPhoneHost} from './host.js';
import {PocketPhoneActions} from './actions.js';
import {PocketPhoneServices} from './services.js';
import {appNames,appCaptions,collectionView,recordStory,ownerText,recordHeading} from './views.js';
import {PocketPhoneConversation} from './conversation.js';
import {collectionOptions,selectRecords,cartSummary,ledgerSummary as summarizeLedger} from './view-state.js';
import {ScopedPocketPhoneStore} from './scoped-store.js';

const $=id=>document.getElementById(id);
function el(tag,attrs={},...children){const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){
  if(key==='text')node.textContent=value;else if(key==='class')node.className=value;
  else if(key==='style'){for(const [property,v]of Object.entries(value))node.style.setProperty(property.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v);}else if(key.startsWith('on'))node[key]=value;
  else if(value!==undefined&&value!==null&&value!==false){if(['value','checked','selected','disabled','hidden'].includes(key))node[key]=value;else node.setAttribute(key==='htmlFor'?'for':key,value===true?'':String(value));}
}for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));return node;}
const button=(text,action,cls='')=>el('button',{type:'button',text,class:cls,onclick:action});
const host=new PocketPhoneHost();
let phoneScope='role';
const phone=new ScopedPocketPhoneStore(new PocketPhoneStore({storage:{get:key=>host.storageGet(key),set:(key,value)=>host.storageSet(key,value)}}),{getMode:()=>phoneScope});
const services=new PocketPhoneServices(host);
const actions=new PocketPhoneActions({phone,host});
const conversation=new PocketPhoneConversation({phone,host});
const musicSources=new Map();
phone.musicHandler=async(action,args)=>{const result=await services.music(action,args);if(action==='music_play'&&result.url&&result.track?.songId)musicSources.set(String(result.track.songId),result.url);return result;};
let ctx={},moduleId=null,path=null,query='',limit=20,epoch=0,suspended=false,working=0;
let month=new Date().toISOString().slice(0,7),moneyType='all',audio=null,audioUrl=null;
let homePage=0;
let collectionFilter='all',ledgerMode='details';
let audioTrack=null,musicRequest=0,loadingMusicId=null;
let observedMusicState=null;
let viewMode='phone',conversationMessages=[],conversationDraft='',conversationStatus=null,allowPrivateConversation=false,contextRequest=0;
let conversationProblem=null;
const calendar={year:new Date().getFullYear(),month:new Date().getMonth(),date:date()};
const cache=new Map(),blobUrls=new Set();
const mediaQueue=[];let activeMedia=0;
function mediaJob(task){return new Promise((resolve,reject)=>{mediaQueue.push({task,resolve,reject});pumpMedia();});}
function pumpMedia(){while(activeMedia<3&&mediaQueue.length){const entry=mediaQueue.shift();activeMedia++;Promise.resolve().then(entry.task).then(entry.resolve,entry.reject).finally(()=>{activeMedia--;pumpMedia();});}}
const symbols={memos:'✎',calendar:'▦',browser:'◎',taobao:'♧',youtube:'▷',pornhub:'◇',books:'▤',photos:'▧',music:'♫',map:'⌖',wechat:'☏',flight:'✈',bilibili:'▣',instagram:'◉',meituan:'♨',xiaoyuzhou:'◌',xiachufang:'♧',douban:'◫',xianyu:'↻',weibo:'☷',ledger:'¥'};
const labels={title:'标题',name:'名字',content:'内容',text:'文字',time:'时间',date:'日期',note:'手记',summary:'摘要',url:'链接',src:'图片地址',avatar:'头像',cover:'封面',thumb:'缩略图',caption:'说明',artist:'歌手',author:'作者',channel:'频道',podcast:'播客',host:'主播',duration:'时长（秒）',progress:'进度（0—1）',position:'播放位置（秒）',comment:'评价',songId:'歌曲 ID',provider:'来源',price:'价格',originalPrice:'原价',qty:'数量',shop:'店铺',spec:'规格',emoji:'表情',status:'状态',album:'相册',tint:'配色',color:'颜色',quotes:'摘录',address:'地址',x:'横坐标（0—100）',y:'纵坐标（0—100）',remark:'备注名',relation:'关系',bio:'简介',members:'群成员',images:'配图',likes:'点赞',comments:'评论',location:'地点',airline:'航空公司',no:'航班号',cabin:'舱位',from:'出发',to:'到达',seat:'座位',gate:'登机口',terminal:'航站楼',booking:'预订信息',passenger:'乘客',boarding:'登机时间',up:'创作者',views:'播放量',danmaku:'弹幕数',sign:'签名',rider:'配送员',eta:'预计送达',items:'餐食明细',total:'总计',description:'描述',servings:'份数',minutes:'用时（分钟）',ingredients:'食材',steps:'步骤',tags:'标签',recipe_id:'关联菜谱',photo:'照片',rating:'评分',city:'城市',latitude:'纬度',longitude:'经度',timezone:'时区',category:'类别',creator:'创作者',year:'年份',subject:'作品',seller:'卖家',condition:'成色',wants:'想要人数',image:'图片',source:'来源',reposts:'转发数',heat:'热度',tag:'标签',amount:'金额（元）',account:'账户',type:'收支类型',pinned:'置顶',favorite:'收藏',liked:'已点赞',playing:'正在播放',muted:'免打扰',group:'群聊',unread:'未读数'};
const numeric=new Set('progress position price originalPrice qty x y unread total servings minutes rating latitude longitude wants reposts heat amount'.split(' '));
function numericField(spec,key){return key==='duration'?(spec.key.startsWith('music.')||spec.key==='xiaoyuzhou.episodes'):key==='likes'?spec.key!=='wechat.moments':numeric.has(key);}
const boolean=new Set('pinned favorite liked playing muted group'.split(' '));
const pictures=new Set('src avatar cover thumb photo image'.split(' '));
const arrays=new Set('tags quotes ingredients steps images members comments items tint'.split(' '));
const imagePattern=/^skivu-phone-image:([a-f0-9]{64})$/;
const MAX_FILE=8*1024*1024,MAX_IMAGE=5*1024*1024;
function snapshot(){return phone.snapshot(ctx.roleId||'local');}
function at(value,key){for(const part of key.split('.'))value=value&&typeof value==='object'?value[part]:null;return value;}
function rows(key,state=snapshot()){const value=at(state,key);return Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];}
function title(row){return recordHeading(row,snapshot());}
function date(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function capture(){if(!ctx.roleId)throw new Error('请先在 Skivu 选择一个角色。');return{roleId:ctx.roleId,caller:ctx.roleName||'',epoch};}
function valid(c){return !suspended&&c.epoch===epoch&&c.roleId===ctx.roleId;}
function check(c){if(!valid(c))throw new Error('角色或页面已切换，本次结果未写入。');}
function toast(text){$('toast').textContent=String(text);$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
async function job(task){working++;$('progress').hidden=false;try{return await task();}catch(e){toast(e?.message||'操作未完成，请重试。');return null;}finally{working--;$('progress').hidden=working===0;}}
function dialog(titleText){const content=el('div'),footer=el('footer'),error=el('p',{role:'alert',hidden:true}),dialog=el('dialog'),close=button('×',()=>dialog.close(),'icon');
  close.setAttribute('aria-label','关闭');const form=el('form',{},el('header',{},el('h2',{text:titleText}),close),content,error,footer);
  form.onsubmit=e=>e.preventDefault();dialog.append(form);document.body.append(dialog);dialog.onclose=()=>{dialog.remove();if(!suspended)render();};dialog.showModal();
  return{dialog,content,footer,error,form,close:()=>dialog.close(),fail:e=>{error.textContent=e.message||String(e);error.hidden=false;}};
}
async function confirm(titleText,message){return new Promise(resolve=>{const d=dialog(titleText);d.content.append(el('p',{text:message}));let settled=false;
  const finish=v=>{if(!settled){settled=true;resolve(v);}d.close();};d.footer.append(button('取消',()=>finish(false)),button('确认',()=>finish(true),'primary'));d.dialog.addEventListener('close',()=>finish(false),{once:true});});}
function inputField(container,name,label,value='',options={}){const id=`f-${Math.random().toString(36).slice(2)}`;
  const input=el(options.multiline?'textarea':'input',{id,name,value:String(value??''),type:options.type||'text',...options});
  container.append(el('label',{htmlFor:id,text:label}),input);return input;}
function problem(message){$('problem').hidden=!message;$('problem').textContent=message||'';}
function imageType(bytes){if(bytes.length<8||bytes.length>MAX_IMAGE)throw new Error('图片需小于 5 MB。');
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';
  const head=new TextDecoder('ascii').decode(bytes.slice(0,12));if(head.startsWith('GIF8'))return'image/gif';if(head.startsWith('RIFF')&&head.slice(8,12)==='WEBP')return'image/webp';throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片。');}
async function imageId(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function saveImage(bytes){imageType(bytes);const id=await imageId(bytes);await host.writeFile(`images/${id}`,bytes);const ref=`skivu-phone-image:${id}`;cache.delete(ref);return ref;}
function blob(bytes,mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime}));blobUrls.add(url);return url;}
async function mediaSource(reference){if(!reference)return null;if(cache.has(reference))return cache.get(reference);
  const requestedEpoch=epoch;const promise=mediaJob(async()=>{if(suspended||requestedEpoch!==epoch)throw new Error('图片加载已取消。');const local=imagePattern.exec(reference);let bytes;
    if(local){bytes=await host.readFile(`images/${local[1]}`);if(await imageId(bytes)!==local[1])throw new Error('图片文件校验失败。');}
    else if(reference.startsWith('data:image/')){if(reference.length>MAX_IMAGE*4/3+128)throw new Error('图片过大。');const encoded=reference.split(',')[1];bytes=Uint8Array.from(atob(encoded||''),c=>c.charCodeAt(0));}
    else{const uri=new URL(reference);if(uri.protocol!=='https:'||uri.username||uri.password)throw new Error('图片地址不受支持。');const r=await host.request({url:uri.href,responseType:'bytes',maxBytes:MAX_IMAGE});if(r.status!==200)throw new Error('图片暂不可用。');bytes=r.bytes;}
    if(suspended||requestedEpoch!==epoch)throw new Error('图片加载已取消。');return blob(bytes,imageType(bytes));});cache.set(reference,promise);promise.catch(()=>{if(cache.get(reference)===promise)cache.delete(reference);});return promise;}
function picture(reference,cls='thumbnail'){const box=el('div',{class:`picture ${cls}`});if(!reference)return box;
  const captured=epoch;mediaSource(String(reference)).then(src=>{if(src&&captured===epoch&&box.isConnected){const img=el('img',{src,alt:'配图',loading:'lazy'});img.onerror=()=>img.remove();box.append(img);}}).catch(()=>{box.title=String(reference).startsWith('/api/media/')?'原版图片尚未迁入':'图片暂不可用';});return box;}
function stopMedia(){if(audio){for(const name of ['onpause','onplay','onplaying','onseeked','onended','onloadedmetadata','onerror'])audio[name]=null;audio.pause();audio.removeAttribute('src');audio.load();audio=null;}audioTrack=null;if(audioUrl){URL.revokeObjectURL(audioUrl);blobUrls.delete(audioUrl);audioUrl=null;}}
function stopContext(){epoch++;musicRequest++;actions.cancel();conversation.cancel();stopMedia();observedMusicState=null;conversationMessages=[];conversationDraft='';conversationStatus=null;allowPrivateConversation=false;for(const d of document.querySelectorAll('dialog'))d.close();for(const u of blobUrls)URL.revokeObjectURL(u);blobUrls.clear();cache.clear();musicSources.clear();}
async function chooseImage(){const c=capture(),file=await host.pickFile();if(!file)return null;check(c);return saveImage(file.bytes);}
async function chooseAvatar(){const c=capture(),file=await host.pickFile();if(!file)return null;check(c);imageType(file.bytes);
  const url=blob(file.bytes,imageType(file.bytes)),image=new Image();image.src=url;await image.decode();check(c);
  if(image.width*image.height>32000000)throw new Error('请使用 3200 万像素以内的头像图片。');
  return new Promise(resolve=>{const d=dialog('裁切头像'),canvas=el('canvas',{width:512,height:512,class:'avatar-crop'}),controls=el('div',{class:'crop-controls'});let settled=false;
    const zoom=inputField(controls,'zoom','缩放',1,{type:'range',min:1,max:3,step:.02}),horizontal=inputField(controls,'horizontal','左右移动',0,{type:'range',min:-50,max:50,step:1}),vertical=inputField(controls,'vertical','上下移动',0,{type:'range',min:-50,max:50,step:1});
    const draw=()=>{const size=Math.min(image.width,image.height)/Number(zoom.value),left=(image.width-size)/2+(image.width-size)*Number(horizontal.value)/100,top=(image.height-size)/2+(image.height-size)*Number(vertical.value)/100;canvas.getContext('2d').drawImage(image,left,top,size,size,0,0,512,512);};for(const field of [zoom,horizontal,vertical])field.oninput=draw;draw();d.content.append(canvas,controls);
    d.footer.append(button('取消',d.close),button('采用头像',()=>job(async()=>{check(c);const result=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!result)throw new Error('头像裁切未完成。');const ref=await saveImage(new Uint8Array(await result.arrayBuffer()));check(c);settled=true;resolve(ref);d.close();}),'primary'));
    d.dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);blobUrls.delete(url);if(!settled)resolve(null);},{once:true});});
}
function chooseAlbum(accept){const c=capture(),d=dialog('从相册或本机图片选择'),grid=el('div',{class:'photo-wall'}),known=new Set();d.content.append(grid);
  function add(ref,caption){if(!ref||known.has(ref))return;known.add(ref);const b=button('',()=>{try{check(c);accept(ref);d.close();}catch(e){d.fail(e);}},'record photo-tile');b.append(picture(ref,'photo-art'),el('small',{text:caption||'本机图片'}));grid.append(b);}
  for(const row of rows('photos'))add(row.src,row.caption||row.album);
  job(async()=>{const names=await host.list();check(c);for(const name of names.filter(n=>/^images\/[a-f0-9]{64}$/.test(n)).slice(-60))add(`skivu-phone-image:${name.slice(7)}`);if(!known.size)grid.append(el('p',{text:'还没有本机图片，可先选择文件或生成配图。'}));});
  d.footer.append(button('关闭',d.close));
}

function render(){
  $('owner').textContent=ctx.roleName?`${ctx.roleName}的小手机`:'角色小手机';$('role-label').textContent=viewMode==='conversation'?'真实角色对话 · 手机工具联动':phoneScope==='shared'?'共享机主 · 所有角色共用这部手机':'按角色保存 · 记录一份日常';$('back').hidden=!moduleId&&viewMode!=='conversation';
  $('role-task').disabled=!ctx.roleId;$('role-task').textContent=actions.busy?'■':'✦';
  if(!ctx.roleId){$('screen').replaceChildren(el('div',{class:'empty'},el('h1',{text:'先选择一位角色'}),el('p',{text:'回到 Skivu 选择角色，再打开这部小手机。'})));return;}
  $('screen').classList.toggle('home-screen',!moduleId&&viewMode==='phone');$('screen').classList.toggle('conversation-screen',viewMode==='conversation');
  $('conversation').setAttribute('aria-label',viewMode==='conversation'?'打开小手机':'角色对话');$('conversation').textContent=viewMode==='conversation'?'▦':'☏';
  if(viewMode==='conversation')renderConversation();else if(!moduleId)renderHome();else renderApp();
}
function sunLabel(location){if(!location||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude))return['设置日出地点','离线计算日出与日落'];
  try{const times=globalThis.SunCalc.getTimes(new Date(),location.latitude,location.longitude);const options={hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:location.timezone||'Asia/Shanghai'};const format=new Intl.DateTimeFormat('zh-CN',options);
    const rise=Number.isFinite(+times.sunrise)?format.format(times.sunrise):'—',set=Number.isFinite(+times.sunset)?format.format(times.sunset):'—';return[`${rise} / ${set}`,`${location.city||'所选位置'} · 日出 / 日落`];}catch{return['位置待检查','请检查坐标和时区'];}}
function sunCountdown(location){const fallback=sunLabel(location);if(!location||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude))return fallback;try{const now=new Date(),events=[];for(let offset=0;offset<3;offset++){const times=globalThis.SunCalc.getTimes(new Date(+now+offset*86400000),location.latitude,location.longitude);for(const [key,label]of [['sunrise','日出'],['sunset','日落']])if(Number.isFinite(+times[key])&&+times[key]>+now)events.push({time:+times[key],label});}events.sort((a,b)=>a.time-b.time);if(!events.length)return['—',`${location.city||'所选地点'} · 近期无日出日落`];const minutes=Math.ceil((events[0].time-+now)/60000);return[`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,`${location.city||'所选地点'} · 距${events[0].label}`];}catch{return fallback;}}
function renderHome(){const state=snapshot(),owner=state.owner||{},now=new Date(),sun=sunCountdown(at(state,'sun.location'));
  const event=(state.events||[]).filter(r=>r.date===date(now)).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')))[0];
  const playing=state.music?.nowPlaying;
  const header=el('div',{class:'clock'},el('small',{class:'clock-kicker',text:owner.name||ctx.roleName||'我的日常'}),el('strong',{text:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`}),el('span',{text:new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(now)}),el('p',{text:owner.motto||'把平凡的一天，悄悄收藏。'}));
  const widgets=el('div',{class:'widgets'},
    el('button',{class:'widget agenda-widget',onclick:()=>openApp('calendar')},el('small',{text:'TODAY'}),el('strong',{text:String(now.getDate())}),el('p',{text:event?.title||'今天没有安排'})),
    el('button',{class:'widget music-widget',onclick:()=>openApp('music')},el('small',{text:'NOW PLAYING'}),el('strong',{text:playing?.title||'—'}),el('p',{text:playing?.artist||'给今天选一首歌'})),
    el('button',{class:'widget sun-widget',onclick:()=>openApp('calendar','sun.location')},el('div',{},el('small',{text:'晨昏之间'}),el('p',{text:sun[1]})),el('strong',{text:sun[0]})));
  const first=['memos','calendar','taobao','youtube','pornhub','books','photos','map'];
  const second=phoneModules.map(a=>a.id).filter(id=>!first.includes(id)&&!['browser','music'].includes(id));
  const pages=el('div',{class:'home-pages'}),track=el('div',{class:'home-track'}),dots=el('nav',{class:'page-dots','aria-label':'桌面分页'});
  function icon(id,shortcut=false){const name=appNames[id],b=button('',()=>openApp(id),'app');if(shortcut)b.dataset.shortcut=id;else b.dataset.app=id;b.setAttribute('aria-label',name);b.append(el('span',{class:`symbol symbol-${id}`,text:symbols[id]||'◈'}),el('span',{text:name}));return b;}
  for(const [index,ids]of [first,second].entries()){track.append(el('div',{class:'apps home-page','data-home-page':String(index)},ids.map(id=>icon(id))));const dot=button('',()=>select(index));dot.setAttribute('aria-label',`第 ${index+1} 页`);dot.dataset.homeDot=String(index);dots.append(dot);}
  function select(index){homePage=index;track.style.transform=`translateX(-${index*100}%)`;for(const dot of dots.children)dot.setAttribute('aria-pressed',String(Number(dot.dataset.homeDot)===index));}
  let start=0;pages.onpointerdown=e=>{start=e.clientX;};pages.onpointerup=e=>{const delta=e.clientX-start;if(Math.abs(delta)>45)select(delta<0?1:0);};pages.append(track);select(homePage);
  const dock=el('nav',{class:'home-dock','aria-label':'常用应用'},icon('browser'),icon('wechat',true),icon('photos',true),icon('music'));
  header.querySelector('.clock-kicker').onclick=()=>profileEditor();header.querySelector('.clock-kicker').setAttribute('role','button');header.querySelector('.clock-kicker').tabIndex=0;header.querySelector('.clock-kicker').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();profileEditor();}};
  $('screen').replaceChildren(header,widgets,pages,dots,dock);
  $('screen').style.backgroundImage='';if(owner.wallpaper){const captured=epoch;mediaSource(owner.wallpaper).then(src=>{if(captured===epoch&&!moduleId)$('screen').style.backgroundImage=`linear-gradient(#f6f1f5d9,#edf3f9e6),url("${src}")`;}).catch(()=>{});}
}
function openApp(id,collection){viewMode='phone';moduleId=id;const spec=phoneModules.find(m=>m.id===id);path=collection||spec.collections[0];query='';collectionFilter='all';limit=20;render();$('screen').scrollTop=0;}
function renderApp(){const app=phoneModules.find(m=>m.id===moduleId),spec=phoneCollections[path];if(!app||!spec){moduleId=null;render();return;}
  $('screen').classList.remove('home-screen');$('screen').dataset.module=moduleId;
  $('screen').style.backgroundImage='';const head=el('div',{class:'page-title'},el('div',{class:'app-heading'},el('h1',{text:appNames[app.id]||app.title}),el('small',{text:appCaptions[app.id]||''})),
    ...(app.id==='music'?[button('⌕',searchMusic,'icon')]:[]),button('+',()=>editRecord(spec),'icon'));
  const tabs=el('nav',{class:'tabs','aria-label':'记录分类'},app.collections.map(key=>{const b=button(phoneCollections[key].title,()=>{path=key;query='';collectionFilter='all';limit=20;renderApp();});b.setAttribute('aria-pressed',String(key===path));return b;}));
  const search=el('input',{class:'app-search',type:'search',value:query,placeholder:'搜索这份记录','aria-label':'搜索记录',oninput:e=>{query=e.target.value;limit=20;fillRecords();}});
  const options=collectionOptions(path,rows(path)),filters=el('nav',{class:'record-filters','aria-label':'内容筛选'});
  for(const option of options){const b=button(option.label,()=>{collectionFilter=option.value;limit=20;renderApp();});b.dataset.filter=option.value;b.setAttribute('aria-pressed',String(collectionFilter===option.value));filters.append(b);}
  const list=el('section',{id:'records'});$('screen').replaceChildren(head,...(app.collections.length>1?[tabs]:[]),search,...(options.length>1?[filters]:[]),...(app.id==='ledger'?[ledgerSummary()]:[]),...(app.id==='music'&&audio?[audio]:[]),list);fillRecords();
}
function fillRecords(){const container=$('records');if(!container||viewMode!=='phone')return;const spec=phoneCollections[path];let items=selectRecords(path,rows(path),{filter:collectionFilter,query});
  if(moduleId==='ledger'){const summary=summarizeLedger(rows(path),{month,type:moneyType});items=selectRecords(path,summary.records,{query});if(ledgerMode==='stats'){container.replaceChildren(ledgerStats(summary));return;}}
  container.className='';container.replaceChildren(collectionView({moduleId,path,items:items.slice(0,limit),state:snapshot(),el,button,picture,calendar,
    onCalendar:next=>{if(next.month!==undefined){const d=new Date(next.year,next.month,1);calendar.year=d.getFullYear();calendar.month=d.getMonth();}if(next.date)calendar.date=next.date;fillRecords();},
    open:(row,recordPath)=>{const target=recordPath?phoneCollections[recordPath]:spec;return target.key==='wechat.chats'?chatDetail(row):recordDetail(target,row);},onAdd:()=>editRecord(spec),play:playMusic,player:controlMusic,profile:profileEditor,
    toggleFavorite:row=>toggleFavorite(spec,row)}));
  if(moduleId==='ledger')for(const node of container.querySelectorAll('.record')){const row=items.find(r=>String(r.id)===node.dataset.recordId);if(row)node.append(el('span',{class:`amount ${row.type==='income'?'income':'expense'}`,text:`${row.type==='income'?'+':'−'}¥${Number(row.amount||0).toFixed(2)}`}));}
  if(path==='taobao.cart'){const total=cartSummary(items);container.append(el('div',{class:'cart-total'},el('span',{text:`共 ${total.quantity??'—'} 件`}),el('strong',{text:total.complete?`合计 ¥${(total.total_cents/100).toFixed(2)}`:'合计暂不可用'})));}
  if(items.length>limit)container.append(button(`再看 ${Math.min(20,items.length-limit)} 条`,()=>{limit+=20;fillRecords();},'more'));
}
function ledgerSummary(){const summary=summarizeLedger(rows('ledger.entries'),{month,type:moneyType});
  const change=n=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+n);month=date(d).slice(0,7);renderApp();};
  const select=el('select',{'aria-label':'收支筛选',value:moneyType,onchange:e=>{moneyType=e.target.value;fillRecords();}},[['all','全部'],['income','收入'],['expense','支出']].map(([value,text])=>el('option',{value,text,selected:moneyType===value})));
  const modes=el('div',{class:'record-filters'},[['details','明细'],['stats','统计']].map(([mode,name])=>{const b=button(name,()=>{ledgerMode=mode;renderApp();});b.setAttribute('aria-pressed',String(ledgerMode===mode));return b;}));
  return el('section',{class:'ledger-summary'},el('div',{class:'month'},button('‹',()=>change(-1),'icon'),el('strong',{text:month}),button('›',()=>change(1),'icon'),select),
    el('div',{class:'totals'},[['收入',summary.income_cents],['支出',summary.expense_cents],['结余',summary.balance_cents]].map(([label,value])=>el('div',{},label,el('strong',{text:value===null?'—':`¥${(value/100).toFixed(2)}`})))),modes);
}
function ledgerStats(summary){const section=el('section',{class:'ledger-statistics'}),total=summary.expense_cents||0;let previous=0;
  const segments=summary.categories.filter(c=>c.cents!==null&&c.cents>0).map((category,i)=>{const end=previous+category.cents/Math.max(1,total)*100,color=`hsl(${210+i*43} 32% 72%)`,piece=`${color} ${previous}% ${end}%`;previous=end;return{...category,color,piece};});
  section.append(el('div',{class:'ledger-donut',style:{background:segments.length?`conic-gradient(${segments.map(s=>s.piece).join(',')})`:'#dce4ef'}},el('div',{},el('small',{text:'本月支出'}),el('strong',{text:`¥${(total/100).toFixed(2)}`}))));
  for(const category of segments)section.append(el('div',{class:'category-stat'},el('span',{class:'category-dot',style:{background:category.color}}),el('span',{text:category.name}),el('strong',{text:`¥${(category.cents/100).toFixed(2)}`}),el('small',{text:`${Math.round(category.cents/Math.max(1,total)*100)}%`})));
  if(!segments.length)section.append(el('p',{class:'empty',text:'这个月还没有支出记录'}));return section;
}
function detailField(key,value){if(value==null||value==='')return null;if(pictures.has(key))return picture(value,'detail-image');
  if(key==='images'&&Array.isArray(value))return el('div',{class:'detail-images'},value.map(v=>picture(typeof v==='string'?v:v.src,'thumbnail')));
  let text=typeof value==='boolean'?(value?'是':'否'):typeof value==='object'?Array.isArray(value)?value.map(v=>typeof v==='object'?Object.entries(v).map(([k,x])=>`${labels[k]||k}：${x}`).join(' · '):String(v)).join('\n'):Object.entries(value).map(([k,v])=>`${labels[k]||k}：${v}`).join('\n'):String(value);
  return el('dl',{class:'detail-field'},el('dt',{text:labels[key]||key}),el('dd',{text}));}
async function toggleFavorite(spec,row){const c=capture();await phone.invoke('upsert',{path:spec.key,record:{id:row.id,favorite:!row.favorite},expected_revision:snapshot().revision},{...c,mayCommit:()=>valid(c)});row.favorite=!row.favorite;return row.favorite;}
function recordDetail(spec,row){const d=dialog(title(row));d.content.append(recordStory({moduleId:spec.module,row,state:snapshot(),el,picture,button,toggleFavorite:spec.fields.includes('favorite')?item=>job(()=>toggleFavorite(spec,item)):null}));
  if(spec.fields.includes('progress')){const c=capture(),range=inputField(d.content,'reading-progress','阅读 / 收听进度',Number(row.progress||0),{type:'range',min:0,max:1,step:.01}),value=el('small',{text:`${Math.round(Number(row.progress||0)*100)}%`});range.oninput=()=>{value.textContent=`${Math.round(Number(range.value)*100)}%`;};d.content.append(value,button('保存进度',()=>job(async()=>{check(c);await phone.invoke('upsert',{path:spec.key,record:{id:row.id,progress:Number(range.value)},expected_revision:snapshot().revision},{...c,mayCommit:()=>valid(c)});toast('进度已保存');})));}
  if(spec.fields.includes('comments'))socialActions(d,spec,row);
  if(spec.key==='xianyu.items')d.content.append(button(row.favorite?'已收藏':'收藏这件好物',event=>job(async()=>{const favorite=await toggleFavorite(spec,row);event.target.textContent=favorite?'已收藏':'收藏这件好物';})));
  const fields=el('details',{class:'all-fields'},el('summary',{text:'查看全部记录字段'}));for(const key of spec.fields){const field=detailField(key,row[key]);if(field)fields.append(field);}d.content.append(fields);
  if(spec.module==='map'){const map=el('div',{class:'map'},el('small',{text:'地点示意，不进行定位'}),el('span',{class:'pin',text:'⌖',style:{left:`${Math.max(5,Math.min(95,Number.isFinite(row.x)?row.x:50))}%`,top:`${Math.max(5,Math.min(95,Number.isFinite(row.y)?row.y:50))}%`}}));d.content.append(map);}
  d.footer.append(button('编辑',()=>{d.close();editRecord(spec,row);},'primary'));
  if(spec.module==='photos'){const photos=rows(spec.key),index=photos.findIndex(r=>r.id===row.id);for(const [label,delta]of [['上一张',-1],['下一张',1]]){const target=photos[index+delta];if(target)d.footer.prepend(button(label,()=>{d.close();recordDetail(spec,target);}));}}
  if(spec.module==='music'&&row.songId)d.footer.append(button('播放',()=>{d.close();playMusic(String(row.songId));}));
  d.footer.append(button('删除',async()=>{const c=capture();if(!await confirm('删除这条记录？','只影响当前角色的小手机。'))return;await job(async()=>{check(c);await phone.invoke('character_phone_delete_record',{module:spec.key,id:row.id,expected_revision:snapshot().revision},{...c,mayCommit:()=>valid(c)});d.close();});},'danger'));
}

function editRecord(spec,previous=null){const c=capture(),d=dialog(`${previous?'编辑':'新增'}${spec.title}`),inputs={};let revision=snapshot().revision;
  if(spec.key==='sun.location'){const select=el('select',{'aria-label':'常用城市'},el('option',{value:'',text:'选择常用城市，或手动填写坐标'}),cityPresets.map((v,i)=>el('option',{value:String(i),text:v[0]})));
    select.onchange=()=>{if(select.value==='')return;const [city,latitude,longitude,timezone]=cityPresets[Number(select.value)];for(const [k,v]of Object.entries({city,latitude,longitude,timezone}))inputs[k].value=v;};d.content.append(select);}
  for(const key of spec.fields){const value=previous?.[key],name=key==='duration'&&!numericField(spec,key)?'时长':labels[key]||key,label=`${name}${spec.requiredFields.includes(key)?' *':''}`;
    if(boolean.has(key)){const input=el('input',{type:'checkbox',name:key,checked:!!value});d.content.append(el('label',{class:'check'},input,name));inputs[key]=input;continue;}
    if(key==='type'&&spec.module==='ledger'){const select=el('select',{name:key},el('option',{value:'expense',text:'支出',selected:value!=='income'}),el('option',{value:'income',text:'收入',selected:value==='income'}));d.content.append(el('label',{text:label}),select);inputs[key]=select;continue;}
    if((key==='from'||key==='to')&&spec.module==='flight'){const group={};d.content.append(el('h3',{text:name}));for(const [sub,text]of [['city','城市'],['code','机场代码'],['time','时间'],['airport','机场']]){const original=value?.[sub],initial=original&&typeof original==='object'?JSON.stringify(original):original||'',input=inputField(d.content,`${key}.${sub}`,text,initial);if(original&&typeof original==='object'){input._phoneOriginal=structuredClone(original);input._phoneInitial=String(initial);}group[sub]=input;}inputs[key]=group;continue;}
    const isArray=arrays.has(key)||(key==='likes'&&spec.key==='wechat.moments');
    let initial=value==null?key==='date'?(spec.key==='events'?calendar.date:date()):key==='timezone'?'Asia/Shanghai':'':typeof value==='object'?JSON.stringify(value,null,2):String(value);
    const isNumeric=numericField(spec,key);
    const field=inputField(d.content,key,label,initial,{multiline:isArray||['content','text','note','description'].includes(key),type:isNumeric?'number':key==='date'?'date':'text'});if(isNumeric)field.step='any';inputs[key]=field;
    if(previous&&Object.hasOwn(previous,key)){field._phoneOriginal=structuredClone(previous[key]);field._phoneInitial=field.value;}
    if(isArray)d.content.append(el('p',{class:'field-hint',text:['tags','quotes','ingredients','steps'].includes(key)?'每行填写一项，也可保留已有详细格式。':'详细内容使用 JSON 数组；配图也可每行填写一个图片地址。'}));
    if(pictures.has(key))d.content.append(el('div',{class:'field-tools'},button('选择图片',()=>job(async()=>{const ref=await chooseImage();if(ref)field.value=ref;})),button('从相册选择',()=>chooseAlbum(ref=>{field.value=ref;})),button('生成配图',()=>generatePicture(ref=>{field.value=ref;}))));
    if(key==='images'){const append=ref=>{try{const images=field.value.trim()?JSON.parse(field.value):[];if(!Array.isArray(images)||images.length>=9)throw new Error('配图最多九张。');images.push({src:ref});field.value=JSON.stringify(images,null,2);}catch(e){d.fail(e);}};
      d.content.append(el('div',{class:'field-tools'},button('添加图片',()=>job(async()=>{const ref=await chooseImage();if(ref)append(ref);})),button('从相册选择',()=>chooseAlbum(append)),button('生成配图',()=>generatePicture(append))));}
  }
  const save=button('保存',async()=>{save.disabled=true;d.error.hidden=true;try{check(c);const record={...(previous?.id?{id:previous.id}:{})};
      for(const key of spec.fields){const field=inputs[key];if(boolean.has(key)){record[key]=field.checked;continue;}
        if((key==='from'||key==='to')&&spec.module==='flight'){record[key]={...(previous?.[key]||{})};for(const [sub,input]of Object.entries(field)){const raw=input.value.trim();record[key][sub]=input._phoneOriginal!==undefined?(raw===input._phoneInitial?input._phoneOriginal:/^[\[{]/.test(raw)?JSON.parse(raw):raw):raw;}continue;}
        if(previous&&Object.hasOwn(field,'_phoneOriginal')&&field.value===field._phoneInitial){record[key]=field._phoneOriginal;continue;}
        const raw=field.value.trim();if(!raw){if(previous&&Object.hasOwn(previous,key))record[key]=arrays.has(key)?[]:'';continue;}
        if(numericField(spec,key)){const n=Number(raw);if(!Number.isFinite(n))throw new Error(`${labels[key]}需为数值。`);record[key]=n;}
        else if(arrays.has(key)||(key==='likes'&&spec.key==='wechat.moments')){
          if(raw.startsWith('['))record[key]=JSON.parse(raw);else if(key==='ingredients')record[key]=raw.split('\n').map(v=>v.trim()).filter(Boolean).map(line=>{const [name,...amount]=line.split('/');return{name:name.trim(),...(amount.length?{amount:amount.join('/').trim()}:{})};});else if(['tags','quotes','steps'].includes(key))record[key]=raw.split('\n').map(v=>v.trim()).filter(Boolean);
          else if(key==='images')record[key]=raw.split('\n').map(v=>v.trim()).filter(Boolean).map(src=>({src}));else throw new Error(`${labels[key]}请填写有效数组。`);
        }else record[key]=raw;
      }
      const args=spec.key==='wechat.chats'?{path:spec.key,record,expected_revision:revision}:{collection:spec.key,record_json:JSON.stringify(record),expected_revision:revision};
      await phone.invoke(spec.key==='wechat.chats'?'upsert':spec.defaultWriteTool,args,{...c,mayCommit:()=>valid(c)});d.close();toast('已保存');
    }catch(e){d.fail(e);if(e.code==='revision_conflict'&&!d.footer.querySelector('[data-retry]')){const retry=button('保留输入并重试',async()=>{if(!valid(c))return;if(previous?.id&&!rows(spec.key,phone.snapshot(c.roleId)).some(v=>v.id===previous.id)){d.fail(new Error('原记录已删除，不能恢复为旧记录。'));return;}
          if(await confirm('采用当前版本并保留输入？','再次保存会把当前表单填写的字段应用到最新记录。可先取消并查看最新记录。')){revision=phone.snapshot(c.roleId).revision;d.error.hidden=true;retry.remove();}});retry.dataset.retry='true';d.footer.prepend(retry);}}
    finally{save.disabled=false;}},'primary');d.footer.append(button('取消',d.close),save);
}
function profileEditor(target='owner'){if(!['owner','wechat','bilibili','instagram'].includes(target))target='owner';const c=capture(),state=snapshot(),owner=target==='owner'?state.owner||{}:target==='wechat'?state.wechat?.me||{}:state[target]?.profile||{},d=dialog(target==='owner'?'机主与壁纸':`${appNames[target]}资料`);const fields={};
  const specs=target==='owner'?[['name','机主名字'],['motto','桌面签名'],['avatar','头像图片地址'],['wallpaper','壁纸图片地址']]:target==='wechat'?[['name','昵称'],['avatar','头像图片地址'],['color','头像配色'],['cover','朋友圈封面']]:target==='bilibili'?[['name','昵称'],['sign','签名'],['avatar','头像图片地址'],['level','等级'],['fans','粉丝'],['following','关注'],['likes','获赞']]:[['name','昵称'],['username','用户名'],['bio','简介'],['avatar','头像图片地址'],['followers','粉丝'],['following','关注']];
  for(const [key,label]of specs)fields[key]=inputField(d.content,key,label,target==='wechat'&&key==='cover'?state.wechat.cover||'':owner[key]??'');
  d.content.append(el('div',{class:'field-tools'},button('选择并裁切头像',()=>job(async()=>{const ref=await chooseAvatar();if(ref)fields.avatar.value=ref;})),button('从相册选择头像',()=>chooseAlbum(ref=>{fields.avatar.value=ref;}))));
  if(target==='owner')d.content.append(el('div',{class:'field-tools'},button('选择壁纸',()=>job(async()=>{const ref=await chooseImage();if(ref)fields.wallpaper.value=ref;})),button('默认背景',()=>{fields.wallpaper.value='';})));
  if(target==='wechat')d.content.append(el('div',{class:'field-tools'},button('选择朋友圈封面',()=>job(async()=>{const ref=await chooseImage();if(ref)fields.cover.value=ref;})),button('从相册选择封面',()=>chooseAlbum(ref=>{fields.cover.value=ref;}))));
  d.footer.append(button('取消',d.close),button('保存',()=>job(async()=>{check(c);await phone.invoke('character_phone_set_profile',{target,profile_json:JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value.trim()]))),expected_revision:state.revision},{...c,mayCommit:()=>valid(c)});d.close();}),'primary'));
}
function chatDetail(initial){const c=capture(),d=dialog(title(initial)),messages=el('div'),input=el('textarea',{name:'message',placeholder:'记下这条模拟消息'}),from=el('select',{},el('option',{value:'me',text:'机主'}),el('option',{value:'them',text:'对方'})),type=el('select',{},['text','image','voice','transfer','system'].map((value,i)=>el('option',{value,text:['文字','图片','语音说明','转账记录','系统记录'][i]}))),duration=el('input',{type:'number',value:5,min:1,max:600,hidden:true,'aria-label':'语音时长（秒）'});
  d.dialog.classList.add('phone-chat');job(async()=>{check(c);if(initial.unread)await phone.invoke('mark_read',{chat_id:initial.id,expected_revision:snapshot().revision},{...c,mayCommit:()=>valid(c)});});
  const member=el('select',{'aria-label':'群聊成员',hidden:!initial.members?.length},(initial.members||[]).map(item=>el('option',{value:item.name,text:item.name})));
  type.onchange=()=>{duration.hidden=type.value!=='voice';};
  const renderMessages=()=>{const chat=rows('wechat.chats',phone.snapshot(c.roleId)).find(v=>v.id===initial.id);messages.replaceChildren();if(!chat){messages.append(el('p',{text:'此聊天已被删除。'}));return;}
    for(const row of chat.messages||[]){const bubble=el('div',{class:`message ${row.from==='me'?'me':''}`});if(row.name&&chat.group)bubble.append(el('small',{class:'sender-name',text:row.name}));if(row.type!=='text')bubble.append(el('strong',{text:({image:'图片',voice:'语音说明',transfer:'模拟转账',system:'系统记录'})[row.type]||row.type}));
      if(row.type==='image')bubble.append(picture(row.src,'detail-image'));if(row.type==='transfer')bubble.append(el('div',{class:'amount',text:`¥${Number(row.amount||0).toFixed(2)}`}));if(row.type==='voice')bubble.append(el('div',{text:`${Number(row.duration)||0} 秒`}));bubble.append(el('div',{text:row.text||''}),el('small',{text:row.time||''}));
      const named=(chat.members||[]).find(m=>m.name===row.name),avatar=row.avatar||(row.from==='me'?snapshot().wechat?.me?.avatar:named?.avatar||chat.avatar),line=el('div',{class:`message-line ${row.from==='me'?'from-me':''} ${row.type==='system'?'system-line':''}`});if(row.type!=='system')line.append(picture(avatar,'chat-avatar'));line.append(bubble);messages.append(line);}};
  renderMessages();const unsub=phone.subscribe(renderMessages);d.dialog.addEventListener('close',unsub,{once:true});
  d.content.append(messages,el('div',{class:'toolbar-row'},from,type,duration),member,el('div',{class:'field-tools'},button('选择消息图片',()=>job(async()=>{const ref=await chooseImage();if(ref){type.value='image';input.value=ref;}})),button('从相册选择消息图片',()=>chooseAlbum(ref=>{type.value='image';input.value=ref;}))),el('div',{class:'composer'},input,button('写入',async()=>{try{check(c);const raw=input.value.trim(),message={from:from.value,type:type.value,time:new Date().toISOString()};if(from.value==='them'&&member.value){const sender=(rows('wechat.chats').find(r=>r.id===initial.id)?.members||[]).find(m=>m.name===member.value);if(sender)Object.assign(message,{name:sender.name,...(sender.avatar?{avatar:sender.avatar}:{}),...(sender.color?{color:sender.color}:{})});}if(type.value==='image')message.src=raw;else if(type.value==='transfer'){message.amount=Number(raw);message.text='模拟转账';}else{message.text=raw;if(type.value==='voice')message.duration=Number(duration.value);}
    await phone.invoke('character_phone_write_chat',{chat_id:initial.id,message_json:JSON.stringify(message),expected_revision:phone.snapshot(c.roleId).revision},{...c,mayCommit:()=>valid(c)});input.value='';}catch(e){d.fail(e);}},'primary')));
  d.footer.append(button('联系人资料',()=>contactEditor(initial)),button('编辑聊天',()=>{d.close();editRecord(phoneCollections['wechat.chats'],initial);}),button('关闭',d.close));
}
function contactEditor(row){const c=capture(),state=snapshot(),d=dialog('联系人资料'),fields={};let revision=state.revision;for(const key of ['name','remark','relation','bio','avatar'])fields[key]=inputField(d.content,key,labels[key],row[key]||'');
  d.content.append(el('div',{class:'field-tools'},button('选择并裁切头像',()=>job(async()=>{const ref=await chooseAvatar();if(ref)fields.avatar.value=ref;})),button('从相册选择头像',()=>chooseAlbum(ref=>{fields.avatar.value=ref;}))));
  if(row.group||row.members?.length){const memberList=el('div');d.content.append(el('h3',{text:'群成员'}),memberList);const refresh=()=>{const chat=rows('wechat.chats').find(r=>r.id===row.id);if(chat&&Object.keys(fields).every(key=>String(chat[key]??'')===String(row[key]??'')))revision=snapshot().revision;memberList.replaceChildren();for(const [index,member]of (chat?.members||[]).entries())memberList.append(button(member.name,()=>groupMemberEditor(chat,index),'member-chip'));memberList.append(button('添加群成员',()=>groupMemberEditor(chat||row,-1)));};refresh();const off=phone.subscribe(refresh);d.dialog.addEventListener('close',off,{once:true});}
  d.footer.append(button('取消',d.close),button('保存',async()=>{try{check(c);await phone.invoke('character_phone_set_contact',{chat_id:row.id,profile_json:JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim()]))),expected_revision:revision},{...c,mayCommit:()=>valid(c)});d.close();}catch(e){d.fail(e);if(e.code==='revision_conflict'&&!d.footer.querySelector('[data-retry]')){const retry=button('保留输入并重试',async()=>{if(!rows('wechat.chats').some(r=>r.id===row.id)){d.fail(new Error('联系人已被删除。'));return;}if(await confirm('采用最新版本并保留输入？','保存将把当前资料字段应用到最新联系人，群成员和聊天消息保持最新。')){revision=snapshot().revision;retry.remove();}});retry.dataset.retry='true';d.footer.prepend(retry);}}},'primary'));
}
function groupMemberEditor(chat,index){const c=capture(),revision=snapshot().revision,currentChat=rows('wechat.chats').find(r=>r.id===chat.id),original=currentChat?.members?.[index]||{},d=dialog(index<0?'添加群成员':'群成员资料'),fields={};for(const key of ['name','avatar','color'])fields[key]=inputField(d.content,key,labels[key],original[key]||'');
  d.content.append(el('div',{class:'field-tools'},button('裁切头像',()=>job(async()=>{const ref=await chooseAvatar();if(ref)fields.avatar.value=ref;})),button('从相册选择',()=>chooseAlbum(ref=>{fields.avatar.value=ref;}))));
  d.footer.append(button('取消',d.close),button('保存',()=>job(async()=>{check(c);const current=rows('wechat.chats').find(r=>r.id===chat.id);if(!current)throw new Error('聊天已被删除。');const members=structuredClone(current.members||[]),member=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]));if(index<0)members.push(member);else members[index]={...members[index],...member};await phone.invoke('character_phone_set_contact',{chat_id:chat.id,profile_json:JSON.stringify({members}),expected_revision:revision},{...c,mayCommit:()=>valid(c)});d.close();}),'primary'));
}
function socialActions(d,spec,initial){const c=capture(),section=el('section',{class:'social-actions'}),comments=el('div',{class:'post-comments'}),controls=el('div',{class:'toolbar-row'}),input=el('textarea',{name:'social-comment',placeholder:'写一条模拟评论'});d.content.append(section);section.append(controls,comments,input);
  function current(){return rows(spec.key).find(r=>r.id===initial.id);}
  async function update(changes){check(c);const row=current();if(!row)throw new Error('这条记录已被删除。');await phone.invoke('upsert',{path:spec.key,record:{id:row.id,...changes},expected_revision:snapshot().revision},{...c,mayCommit:()=>valid(c)});refresh();}
  function refresh(){const row=current();comments.replaceChildren();if(!row)return;for(const comment of row.comments||[])comments.append(el('div',{class:'post-comment'},el('strong',{text:ownerText(comment.name,snapshot())}),el('span',{text:comment.text})));controls.replaceChildren();
    if(spec.fields.includes('likes')){const count=Array.isArray(row.likes)?row.likes.length:Number(row.likes||0),name=snapshot().owner?.name||ctx.roleName||'我';controls.append(button(`♡ ${count}`,()=>job(async()=>{if(Array.isArray(row.likes)){const liked=row.likes.includes(name);await update({likes:liked?row.likes.filter(v=>v!==name):[...row.likes,name]});}else{const liked=spec.fields.includes('liked')?row.liked:false;await update({likes:Math.max(0,count+(liked?-1:1)),...(spec.fields.includes('liked')?{liked:!liked}:{})});}})));}
    if(spec.fields.includes('favorite'))controls.append(button(row.favorite?'★ 已收藏':'☆ 收藏',()=>job(()=>update({favorite:!row.favorite}))));}
  refresh();section.append(button('发表评论',()=>job(async()=>{const row=current(),text=input.value.trim();if(!row||!text)return;await update({comments:[...(row.comments||[]),{name:snapshot().owner?.name||ctx.roleName||'我',text}]});input.value='';}),'primary'));
}

function settings(){const d=dialog('小手机设置'),list=el('div',{class:'settings-buttons'});
  for(const [label,fn]of [['机主与壁纸',profileEditor],['手机存储模式',scopeSettings],['连接网易云',()=>connection(false)],['配置生图服务',()=>connection(true)],['导出手机备份',exportBackup],['单独导出记录与图片',exportSeparate],['导入原版或 Skivu 存档',importBackup],['导入原版图片文件',importMedia],['恢复上一份备份',recover],['关于与来源',about]])list.append(button(label,()=>{d.close();fn();}));d.content.append(list);}
function scopeSettings(){const c=capture(),d=dialog('手机存储模式'),select=el('select',{name:'phone-scope'},el('option',{value:'role',text:'按角色分别保存',selected:phoneScope==='role'}),el('option',{value:'shared',text:'原版共享机主：所有角色共用一部手机',selected:phoneScope==='shared'})),copy=el('input',{type:'checkbox',name:'copy-phone',checked:false});
  d.content.append(select,el('p',{text:'切换模式会保留各空间已有记录，不会自动合并。共享机主模式下，所有角色看到并修改同一部手机。'}),el('label',{class:'check'},copy,'把当前手机复制到目标空间（覆盖目标手机）'));
  d.footer.append(button('取消',d.close),button('应用',()=>job(async()=>{check(c);const target=select.value;if(target===phoneScope){d.close();return;}const contents=copy.checked?phone.exportArchive(c.roleId):null;if(contents&&!await confirm('覆盖目标空间的手机？','当前手机会复制到目标空间，目标空间旧记录由事务备份保留；其他空间保持不变。'))return;check(c);await host.storageSet('pocket-phone.preferences.v1',{mode:target});const sameRole=ctx.roleId===c.roleId;stopContext();phoneScope=target;moduleId=null;render();if(contents&&sameRole){const next=capture();await phone.importArchive(next.roleId,contents,{mayCommit:()=>valid(next)});}toast(contents&&!sameRole?'存储模式已切换；角色已变化，未复制记录。':'存储模式已切换');}),'primary'));
}
function connection(image){const c=capture(),config=image?services.publicImageConfig():services.publicMusicConfig(),d=dialog(image?'生图服务':'网易云连接'),fields={};
  fields.baseUrl=inputField(d.content,'baseUrl',image?'HTTPS 服务地址':'HTTPS 或本机 HTTP 服务地址',config.baseUrl||'');if(image){fields.model=inputField(d.content,'model','模型',config.model||'');fields.size=inputField(d.content,'size','默认尺寸',config.size||'1024x1024');fields.style=inputField(d.content,'style','默认画风',config.style||'');}
  const credential=inputField(d.content,'credential',image?'API 密钥':'Cookie（可选）','',{type:'password',autocomplete:'off'});
  d.content.append(el('p',{class:'field-hint',text:`${(image?config.hasApiKey:config.hasCookie)?'凭据已保存。':''}留空保留；更换地址会清除旧凭据。仅用于你配置的服务。`}));
  d.footer.append(button('清除连接',async()=>{if(!await confirm('清除连接？','会删除该服务保存的凭据，小手机记录保持不变。'))return;try{if(image)await services.clearImageConfig();else await services.clearMusicConfig();d.close();toast('连接已清除');}catch(e){d.fail(e);}},'danger'),button('取消',d.close),button('保存',async()=>{try{check(c);const values=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim()]));if(image)await services.saveImageConfig({...values,apiKey:credential.value});else await services.saveMusicConfig({...values,cookie:credential.value});credential.value='';d.close();toast('连接已保存');}catch(e){d.fail(e);}},'primary'));
  if(!image)d.footer.prepend(button('测试连接',()=>job(async()=>{const result=await services.music('music_status',{});toast(result.authenticated?'连接成功，账号已登录':'连接成功，可搜索音乐');})));
}
function generatePicture(accept){const c=capture(),d=dialog('生成配图'),prompt=inputField(d.content,'prompt','画面描述','',{multiline:true});
  d.content.prepend(el('p',{text:'只发送这里的描述和默认画风，可能消耗你配置服务的额度。生成后可预览，采用后仍需保存记录。'}));const generate=button('生成',async()=>{generate.disabled=true;d.error.hidden=true;try{const result=await services.generateImage({prompt:prompt.value});check(c);const url=blob(result.bytes,result.mime),preview=el('img',{class:'preview',src:url,alt:'生成图片预览'});d.content.append(preview);d.footer.replaceChildren(button('放弃',d.close),button('采用',()=>job(async()=>{check(c);const ref=await saveImage(result.bytes);accept(ref);d.close();}),'primary'));}catch(e){d.fail(e);}finally{generate.disabled=false;}},'primary');d.footer.append(button('取消',d.close),generate);
}
function roleTask(){if(actions.busy){actions.cancel();toast('任务已取消');return;}const c=capture(),d=dialog(`让${ctx.roleName||'角色'}更新小手机`),input=inputField(d.content,'instruction','本次想记录什么','',{multiline:true});
  d.content.prepend(el('p',{text:'使用当前模型连接完成一次任务。发送本次要求和当前角色的非私密记录摘要，一次最多写入五件事。宿主会确认本次模型调用。'}));d.footer.append(button('取消',d.close),button('开始更新',()=>{const instruction=input.value;d.close();job(async()=>{check(c);const receipt=await actions.run({roleId:c.roleId,caller:c.caller,instruction});check(c);toast(`${receipt.summary} · 已保存 ${receipt.applied} 项`);});},'primary'));
}
function searchMusic(){const c=capture(),d=dialog('搜索网易云'),input=inputField(d.content,'keywords','歌曲或歌手'),results=el('div');d.content.append(results);const search=button('搜索',async()=>{search.disabled=true;try{const value=await services.music('music_search',{keywords:input.value});check(c);results.replaceChildren();for(const track of value.tracks||[])results.append(button('',()=>{d.close();playMusic(String(track.songId));},'record'));let i=0;for(const track of value.tracks||[])results.children[i++].append(el('div',{},el('h3',{text:track.title}),el('p',{text:track.artist||''})));}catch(e){d.fail(e);}finally{search.disabled=false;}},'primary');d.footer.append(button('关闭',d.close),search);}
async function loadMusic(url,songId,c,request){const response=await host.request({url,responseType:'bytes',maxBytes:MAX_FILE,timeoutMs:60000});check(c);if(request!==musicRequest||String(snapshot().music?.nowPlaying?.songId)!==String(songId))return;if(response.status!==200)throw new Error('音频暂时无法载入。');const resumePosition=Number(snapshot().music?.nowPlaying?.position||0);stopMedia();audioTrack=String(songId);audioUrl=blob(response.bytes,response.headers?.['content-type']||'audio/mpeg');audio=el('audio',{controls:true,src:audioUrl,preload:'metadata'});
  const element=audio;let initializing=true,progressWrites=Promise.resolve();
  // Native pause/seek events can arrive together. Read position and revision
  // when each preceding save has settled, so the final seek is not discarded.
  function persist(){progressWrites=progressWrites.then(async()=>{
    if(initializing||!valid(c)||element!==audio||!Number.isFinite(element.currentTime))return;
    const current=snapshot().music?.nowPlaying;if(String(current?.songId)!==String(songId))return;
    const record={id:current.id,position:element.currentTime,playing:!element.paused};
    if(Number.isFinite(element.duration)&&element.duration>0)record.duration=element.duration;
    await phone.invoke('character_phone_write_music',{collection:'music.nowPlaying',record_json:JSON.stringify(record),expected_revision:snapshot().revision},{...c,mayCommit:()=>valid(c)&&element===audio});
  }).catch(e=>{if(valid(c)&&e.code!=='revision_conflict')toast('播放进度未保存，可稍后重试。');});return progressWrites;}
  element.onloadedmetadata=()=>{if(!valid(c)||element!==audio)return;if(resumePosition>0&&resumePosition<element.duration)element.currentTime=resumePosition;initializing=false;};element.onpause=persist;element.onplaying=()=>{initializing=false;persist();};element.onseeked=persist;element.onended=()=>{persist();if(valid(c))controlMusic(1);};element.onerror=()=>{if(valid(c)&&element===audio)toast('这段音频无法解码，请尝试其他歌曲或检查音乐服务。');};
  if(moduleId==='music')renderApp();try{await element.play();}catch{toast('音频已载入，打开音乐后点击播放。');}}
async function playMusic(songId){const c=capture(),request=++musicRequest;loadingMusicId=String(songId);await job(async()=>{try{const result=await phone.invoke('character_phone_play_music',{song_id:songId},{...c,mayCommit:()=>valid(c)&&request===musicRequest});check(c);if(!result.url){toast('歌曲已选择，未返回播放地址。');return;}await loadMusic(result.url,songId,c,request);}finally{if(request===musicRequest)loadingMusicId=null;}});}
async function resumeMusic(current){const c=capture(),request=++musicRequest,songId=String(current.songId);loadingMusicId=songId;await job(async()=>{try{let url=current.src||musicSources.get(songId);if(!url)url=(await services.music('music_source',{song_id:songId})).url;check(c);await loadMusic(url,songId,c,request);}finally{if(request===musicRequest)loadingMusicId=null;}});}
function controlMusic(direction){if(direction===0&&audio){if(audio.paused)audio.play().catch(()=>toast('请点击音频控件播放。'));else audio.pause();return;}const state=snapshot(),tracks=(state.music?.playlist||[]).filter(r=>r.songId),current=state.music?.nowPlaying;
  if(direction===0&&current?.songId){resumeMusic(current);return;}if(!tracks.length){searchMusic();return;}const index=tracks.findIndex(t=>String(t.songId)===String(current?.songId));const target=tracks[(Math.max(0,index)+direction+tracks.length)%tracks.length];playMusic(String(target.songId));}

async function exportBackup(){const c=capture();await job(async()=>{const state=JSON.parse(phone.exportArchive(c.roleId)),refs=new Set();function walk(v){if(typeof v==='string'&&imagePattern.test(v))refs.add(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);}walk(state);
  const media={};let estimated=new TextEncoder().encode(JSON.stringify(state)).length;for(const ref of refs){const bytes=await host.readFile(`images/${imagePattern.exec(ref)[1]}`);estimated+=Math.ceil(bytes.length/3)*4;if(estimated>MAX_FILE-2048)throw new Error('记录与图片合计超过 8 MB，请先分别导出记录和图片。');let text='';for(const byte of bytes)text+=String.fromCharCode(byte);media[ref]=btoa(text);}
  const bytes=new TextEncoder().encode(JSON.stringify({format:'skivu-pocket-phone-backup',version:1,phone:state,media}));check(c);if(await host.saveFile({name:`skivu-phone-${date()}.json`,mime:'application/json',bytes}))toast('手机备份已导出');});}
async function exportSeparate(){const c=capture();await job(async()=>{const state=JSON.parse(phone.exportArchive(c.roleId)),refs=new Set();const walk=v=>{if(typeof v==='string'&&imagePattern.test(v))refs.add(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(state);
  if(!await host.saveFile({name:`skivu-phone-records-${date()}.json`,mime:'application/json',bytes:new TextEncoder().encode(JSON.stringify(state))}))return;
  if(refs.size&&!await confirm('继续分别导出本机图片？',`共 ${refs.size} 张，每张选择一次保存位置。之后可通过“导入原版图片文件”恢复图片。`))return;
  for(const ref of refs){check(c);const id=imagePattern.exec(ref)[1],bytes=await host.readFile(`images/${id}`);if(!bytes)throw new Error('未找到一张关联图片。');if(!await host.saveFile({name:`skivu-image-${id}.${imageType(bytes).split('/')[1]}`,mime:imageType(bytes),bytes}))break;}toast('所选备份已导出');});}
async function importBackup(){const c=capture();await job(async()=>{const file=await host.pickFile();if(!file)return;check(c);const raw=new TextDecoder('utf-8',{fatal:true}).decode(file.bytes),value=JSON.parse(raw);let state=value;const media=[];
  if(value?.format==='skivu-pocket-phone-backup'){if(value.version!==1||!value.phone||typeof value.media!=='object'||Array.isArray(value.media))throw new Error('备份格式不受支持。');state=value.phone;
    for(const [ref,data]of Object.entries(value.media)){const match=imagePattern.exec(ref);if(!match||typeof data!=='string'||data.length>MAX_IMAGE*4/3+16)throw new Error('备份图片索引无效。');const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));imageType(bytes);if(await imageId(bytes)!==match[1])throw new Error('备份图片校验失败。');media.push(bytes);}}
  if(!await confirm(`导入到${phoneScope==='shared'?'共享机主':c.caller||'当前角色'}的小手机？`,phoneScope==='shared'?'替换共享手机，所有角色将看到导入内容；保留上一份备份。':'替换当前角色的小手机记录，保留上一份备份；其他角色不受影响。'))return;check(c);for(const bytes of media)await saveImage(bytes);check(c);await phone.importArchive(c.roleId,JSON.stringify(state),{mayCommit:()=>valid(c)});toast('手机记录已导入');});}
async function importMedia(){const c=capture();await job(async()=>{const file=await host.pickFile();if(!file)return;check(c);const ref=await saveImage(file.bytes);toast('图片已保存，可在记录编辑时选择或填写图片地址。');
  const old=/^([a-f0-9]{32})\.(png|jpg|webp|gif)$/i.exec(file.name||'');if(old&&await confirm('关联原版图片？','把当前角色存档中同名的 /api/media/ 图片地址关联到这张本机图片。')){
    check(c);const state=phone.snapshot(c.roleId),needle=`/api/media/${file.name}`;function replace(v){if(v===needle)return ref;if(Array.isArray(v))return v.map(replace);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)]));return v;}
    await phone.importArchive(c.roleId,JSON.stringify(replace(state)),{mayCommit:()=>{check(c);if(phone.snapshot(c.roleId).revision!==state.revision)throw new Error('手机已有新记录，本次未覆盖。请重新选择图片进行关联。');return true;}});toast('原版图片已关联');}
});}
async function recover(){if(await confirm('恢复上一份插件备份？','会恢复所有角色的小手机记录。建议先导出需要保留的最新记录。'))await job(async()=>{await phone.recoverBackup();problem(null);toast('已恢复上一份备份');});}
function about(){const d=dialog('关于角色小手机');d.content.append(el('p',{text:'Skivu 独立插件 1.1.0。参考 TA 的小手机 1.5.2 的功能规格，界面、存档与 SDK 适配独立实现。'}),el('p',{text:'原作者：LilyWithZYoutfear。原包未声明整体代码复用许可，本包未搬入其界面与业务代码。晨昏使用保留 BSD-2-Clause 许可的 SunCalc 1.9.0。'}),el('p',{text:'手机记录保存在本插件空间，可选择按角色分开或共用一部手机。音乐、生图使用你提供的服务与凭据，实际外联均经宿主代理；不会读取 App 的模型密钥或账号令牌。'}));d.footer.append(button('关闭',d.close));}

async function reloadConversation(){const c=capture();return job(async()=>{const messages=await conversation.history({limit:60});check(c);conversationMessages=messages;if(viewMode==='conversation')render();});}
function openConversation(){if(!ctx.chatId){toast('请先在 Skivu 选择一条已有的角色聊天。');return;}viewMode='conversation';moduleId=null;render();reloadConversation();}
function renderConversation(){
  $('screen').style.backgroundImage='';$('screen').classList.remove('home-screen');
  const page=el('section',{class:'conversation-page','aria-label':'真实角色对话'}),head=el('div',{class:'conversation-toolbar'},el('strong',{text:ctx.roleName||'角色对话'}),button('刷新记录',reloadConversation),button('打开小手机',()=>{viewMode='phone';moduleId=null;render();}));
  const list=el('div',{class:'conversation-list'});for(const message of conversationMessages)list.append(el('article',{class:`real-message ${message.role==='user'?'user':''}`},el('small',{text:message.role==='user'?'我':ctx.roleName||'角色'}),el('div',{text:message.text})));
  if(conversationProblem){page.append(head,el('p',{class:'conversation-status',text:conversationProblem}),button('重新读取任务日志',()=>job(async()=>{await conversation.restore();conversationProblem=null;await reloadConversation();render();})));$('screen').replaceChildren(page);return;}
  if(!conversationMessages.length)list.append(el('div',{class:'empty'},el('p',{text:'从一句问候开始，也可以请角色先查看再更新小手机。'})));
  const pending=conversation.pendingFor({roleId:ctx.roleId,chatId:ctx.chatId});
  if(pending&&pending.roleId===ctx.roleId&&pending.chatId===ctx.chatId){
    if(pending.results?.length)list.append(el('details',{class:'tool-receipt'},el('summary',{text:`本轮工具回执 · ${pending.results.filter(r=>r.success).length}/${pending.results.length} 项成功`}),pending.results.map(result=>el('div',{text:`${result.success?'✓':'×'} ${result.tool}${result.error?.message?' · '+result.error.message:''}`}))));
    list.append(el('p',{class:'conversation-status',text:conversation.busy?`正在处理 · 第 ${pending.rounds} 轮 · ${pending.stage}`:[pending.summary,pending.error?.message].filter(Boolean).join('\n')}));
  }else if(conversationStatus)list.append(el('p',{class:'conversation-status',text:conversationStatus.summary||''}));
  const composer=el('div',{class:'conversation-composer'}),input=el('textarea',{name:'real-message',placeholder:'和角色聊聊，或请 TA 使用小手机…',value:conversationDraft,maxlength:4000,disabled:conversation.busy,oninput:e=>{conversationDraft=e.target.value;}}),controls=el('div',{class:'conversation-actions'});
  const privacy=el('input',{type:'checkbox',checked:allowPrivateConversation,disabled:conversation.busy,onchange:e=>{allowPrivateConversation=e.target.checked;}});
  controls.append(el('label',{},privacy,'本轮允许私密模块'));
  async function finish(operation){await job(async()=>{const c=capture(),receipt=await operation();check(c);conversationStatus=receipt;conversationDraft='';await reloadConversation();if(viewMode==='conversation')render();});}
  if(conversation.busy)controls.append(button('停止后续步骤',()=>conversation.cancel(),'danger'));
  else if(pending&&pending.roleId===ctx.roleId&&pending.chatId===ctx.chatId){
    if(pending.canContinue)controls.append(button('继续这轮',()=>finish(()=>conversation.resume({turnId:pending.turnId})),'primary'));
    controls.append(button('放弃后续步骤',async()=>{if(await confirm('放弃本轮后续步骤？','已经保存的聊天和小手机操作会保留。放弃后可以发送新消息；不确定的聊天写入应先刷新记录核对。'))await job(async()=>{await conversation.discard({turnId:pending.turnId});conversationStatus=null;render();});},'danger'));
  }else controls.append(button('发送',()=>{const text=conversationDraft;if(!text.trim())return;finish(()=>conversation.send({text,allowPrivate:allowPrivateConversation}));},'primary'));
  composer.append(el('p',{class:'conversation-note',text:'消息保存到当前 Skivu 聊天。每轮模型调用和写入聊天均由宿主确认；已完成的手机操作会保留。'}),input,controls);page.append(head,list,composer);$('screen').replaceChildren(page);list.scrollTop=list.scrollHeight;
}

const cityPresets=[['北京',39.9042,116.4074,'Asia/Shanghai'],['上海',31.2304,121.4737,'Asia/Shanghai'],['广州',23.1291,113.2644,'Asia/Shanghai'],['深圳',22.5431,114.0579,'Asia/Shanghai'],['杭州',30.2741,120.1551,'Asia/Shanghai'],['成都',30.5728,104.0668,'Asia/Shanghai'],['重庆',29.563,106.5516,'Asia/Shanghai'],['武汉',30.5928,114.3055,'Asia/Shanghai'],['南京',32.0603,118.7969,'Asia/Shanghai'],['西安',34.3416,108.9398,'Asia/Shanghai'],['福州',26.0745,119.2965,'Asia/Shanghai'],['厦门',24.4798,118.0894,'Asia/Shanghai'],['苏州',31.2989,120.5853,'Asia/Shanghai'],['长沙',28.2282,112.9388,'Asia/Shanghai'],['郑州',34.7466,113.6254,'Asia/Shanghai'],['青岛',36.0671,120.3826,'Asia/Shanghai'],['济南',36.6512,117.1201,'Asia/Shanghai'],['昆明',25.0389,102.7183,'Asia/Shanghai'],['大理',25.6065,100.2676,'Asia/Shanghai'],['丽江',26.855,100.2278,'Asia/Shanghai'],['拉萨',29.652,91.1721,'Asia/Shanghai'],['三亚',18.2528,109.5119,'Asia/Shanghai'],['海口',20.044,110.1999,'Asia/Shanghai'],['哈尔滨',45.8038,126.535,'Asia/Shanghai'],['沈阳',41.8057,123.4315,'Asia/Shanghai'],['大连',38.914,121.6147,'Asia/Shanghai'],['香港',22.3193,114.1694,'Asia/Hong_Kong'],['台北',25.033,121.5654,'Asia/Taipei'],['东京',35.6762,139.6503,'Asia/Tokyo'],['首尔',37.5665,126.978,'Asia/Seoul'],['新加坡',1.3521,103.8198,'Asia/Singapore'],['伦敦',51.5074,-0.1278,'Europe/London']];
$('back').onclick=()=>{viewMode='phone';moduleId=null;render();};$('settings').onclick=settings;$('role-task').onclick=roleTask;$('conversation').onclick=()=>{if(viewMode==='conversation'){viewMode='phone';render();}else openConversation();};
phone.subscribe(()=>{const current=snapshot().music?.nowPlaying,songId=String(current?.songId||'');
  const changedPlaying=observedMusicState?.songId===songId&&observedMusicState?.playing!==current?.playing,changedPosition=observedMusicState?.songId===songId&&observedMusicState?.position!==current?.position;observedMusicState={songId,playing:current?.playing,position:current?.position};
  if(loadingMusicId&&songId!==loadingMusicId){musicRequest++;loadingMusicId=null;}
  if(audio&&(!current||!songId||songId!==audioTrack))stopMedia();
  if(audio&&songId===audioTrack){if(changedPlaying&&current.playing===false&&!audio.paused)audio.pause();else if(changedPlaying&&current.playing===true&&audio.paused)audio.play().catch(()=>{});if(changedPosition&&audio.readyState>0&&Number.isFinite(current.position)&&Math.abs(current.position-audio.currentTime)>1.5)audio.currentTime=current.position;}
  if(!document.querySelector('dialog[open]'))render();else if($('records'))fillRecords();
  if(current?.playing&&songId&&audioTrack!==songId&&!loadingMusicId&&musicSources.has(songId)){const c=capture(),request=++musicRequest;loadingMusicId=songId;job(async()=>{try{await loadMusic(musicSources.get(songId),songId,c,request);}finally{if(request===musicRequest)loadingMusicId=null;}});}});
actions.subscribe(()=>{$('role-task').disabled=!ctx.roleId;$('role-task').textContent=actions.busy?'■':'✦';});
conversation.subscribe(()=>{if(viewMode==='conversation'&&!suspended&&!document.querySelector('dialog[open]'))render();});
host.subscribeContext(async detail=>{const request=++contextRequest;const announced=detail&&typeof detail==='object'&&Object.hasOwn(detail,'roleId')&&Object.hasOwn(detail,'chatId');
  if(announced&&(detail.roleId!==ctx.roleId||detail.chatId!==ctx.chatId)){stopContext();ctx={...ctx,...detail};moduleId=null;}
  try{const next=await host.context();if(request!==contextRequest||suspended)return;const changed=next.roleId!==ctx.roleId||next.chatId!==ctx.chatId;if(changed){stopContext();moduleId=null;}ctx=next;render();if(viewMode==='conversation'&&ctx.chatId)reloadConversation();}catch{if(request===contextRequest&&!suspended)problem('角色上下文暂不可用，请重新打开小手机。');}});
host.onSuspend(()=>{suspended=true;stopContext();});
setInterval(()=>{if(viewMode==='phone'&&!moduleId&&!document.querySelector('dialog[open]')&&!suspended)render();},60000);
try{await host.info();ctx=await host.context();const preferences=await host.storageGet('pocket-phone.preferences.v1');phoneScope=preferences?.mode==='shared'?'shared':'role';await phone.restore();try{await conversation.restore();}catch(e){conversationProblem=e.message||'对话任务日志暂不可用';toast('对话任务日志暂不可用，手机记录仍可使用。');}try{await services.restore();}catch{toast('音乐或生图连接暂未读入，可在设置中重新配置。');}render();if(ctx.action==='update-phone')roleTask();if(ctx.action==='chat-phone')openConversation();}
catch(e){problem(e.message||'小手机存档暂不可用。');render();}
