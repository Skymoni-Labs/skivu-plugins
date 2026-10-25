// SPDX-License-Identifier: GPL-3.0-only
// Independent presentation of the published pocket-phone data interfaces.
// No reference HTML, CSS, SVG, or executable implementation is included.
import {deliveryState,deliverySteps} from './view-state.js';

export const appNames = {
  memos:'备忘录',calendar:'日历',browser:'浏览器',taobao:'淘宝',youtube:'YouTube',
  pornhub:'私密空间',books:'书架',photos:'相册',music:'音乐',map:'地图',wechat:'微信',
  flight:'航旅纵横',bilibili:'哔哩哔哩',instagram:'Instagram',meituan:'美团外卖',
  xiaoyuzhou:'小宇宙',xiachufang:'下厨房',douban:'豆瓣',xianyu:'闲鱼',weibo:'微博',ledger:'账本',
};
export const appCaptions = {
  memos:'留住转瞬即逝的念头',calendar:'把日子一页页翻过',browser:'这些地方，曾经路过',
  taobao:'心动好物与模拟订单',youtube:'收藏一些值得回看的片段',pornhub:'只留在这部手机的记录',
  books:'书页里另一个世界',photos:'生活值得被记住',music:'把今天交给一首歌',map:'走过的路，想去的地方',
  wechat:'与你有关的日常',flight:'下一站，出发',bilibili:'生活里的小小放映室',instagram:'从自己的视角看世界',
  meituan:'今天也要好好吃饭',xiaoyuzhou:'在声音里停留片刻',xiachufang:'一餐一饭，认真生活',
  douban:'读过、看过、喜欢过',xianyu:'让好物继续旅行',weibo:'记下一点此刻的心情',ledger:'每一笔都算数',
};
export function ownerText(value,state) {
  return String(value??'').replaceAll('{{owner}}',state.owner?.name||'我');
}
export function recordHeading(row,state={}) {
  return ownerText(row.remark||row.title||row.name||row.caption||row.no||row.shop||row.text||'未命名',state);
}
export function progressRatio(row) {
  const value=Number(row.progress);
  if(Number.isFinite(value))return Math.max(0,Math.min(1,value));
  return row.duration>0?Math.max(0,Math.min(1,Number(row.position||0)/row.duration)):0;
}
export function displayDuration(value) {
  if(typeof value==='string')return value;
  if(!Number.isFinite(value))return '';
  const seconds=Math.max(0,Math.floor(value));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
export function calendarCells(year,month) {
  const first=new Date(year,month,1),offset=(first.getDay()+6)%7;
  return Array.from({length:42},(_,i)=>{
    const d=new Date(year,month,1-offset+i);
    return {date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,day:d.getDate(),current:d.getMonth()===month};
  });
}

export function collectionView(options) {
  const {moduleId,path,items,state,el,button,picture,open,onAdd,calendar,onCalendar,
    play,player,profile,toggleFavorite}=options;
  const text=v=>ownerText(v,state);
  const box=(className,...children)=>el('div',{class:className},...children);
  const tag=v=>v?el('span',{class:'tag',text:text(v)}):null;
  const small=v=>v?el('small',{text:text(v)}):null;
  const title=row=>recordHeading(row,state);
  const art=(row,cls='cover')=>{
    if(moduleId==='books'){const jacket=box(`${cls} book-jacket`,el('strong',{text:title(row)}),small(row.author));if(/^#[a-f0-9]{3,8}$/i.test(row.color||''))jacket.style.backgroundColor=row.color;return jacket;}
    const firstImage=row.images?.[0],reference=(moduleId==='music'?row.cover:row.src||row.cover||row.thumb||row.photo||row.image||row.avatar)||(typeof firstImage==='string'?firstImage:firstImage?.src),node=picture(reference,cls);
    if(!reference&&row.emoji)node.append(el('span',{text:row.emoji}));
    if(!reference&&Array.isArray(row.tint)&&row.tint.length===2&&row.tint.every(c=>/^#[a-f0-9]{3,8}$/i.test(c)))node.style.backgroundImage=`linear-gradient(135deg,${row.tint[0]},${row.tint[1]})`;
    return node;
  };
  const body=(row,subtitle)=>box('card-copy',el('h3',{text:title(row)}),subtitle?el('p',{text:text(subtitle)}):null);
  const card=(row,cls,...children)=>{const b=button('',()=>open(row),`record ${cls||''}`);b.dataset.recordId=String(row.id||'');b.append(...children.filter(Boolean));return b;};
  const empty=()=>box('empty',el('p',{text:'这里还没有记录'}),button('记下第一件小事',onAdd));
  const heading=(label,count=items.length)=>box('section-heading',el('span',{text:label}),count===''?null:small(`${count} 项`));
  const root=el('div',{class:`collection-view view-${moduleId}`,'data-layout':moduleId});
  const grid=cls=>{const node=box(cls);root.append(node);return node;};
  const stars=rating=>el('span',{class:'stars',text:'★'.repeat(Math.round(Math.max(0,Math.min(5,Number(rating)||0))))+'☆'.repeat(5-Math.round(Math.max(0,Math.min(5,Number(rating)||0))))});
  const bar=ratio=>box('reading-bar',el('span',{style:{width:`${ratio*100}%`}}));
  const list=render=>{if(!items.length)root.append(empty());else for(const row of items)root.append(render(row));};
  if(moduleId==='bilibili'){const me=state.bilibili?.profile||{};root.append(box('social-profile',picture(me.avatar,'profile-avatar'),box('',el('h2',{text:text(me.name||state.owner?.name||'我')}),small(me.sign),small(`LV ${me.level??0} · 粉丝 ${me.fans??0} · 关注 ${me.following??0} · 获赞 ${me.likes??0}`)),button('编辑资料',()=>profile('bilibili'),'subtle')));}

  if(moduleId==='calendar'&&path==='events'){
    const year=calendar.year,month=calendar.month,selected=calendar.date;
    const monthEvents=state.events||[];
    const navigate=delta=>onCalendar({year,month:month+delta});
    root.append(box('calendar-month',button('‹',()=>navigate(-1),'icon'),el('strong',{text:`${year} 年 ${month+1} 月`}),button('›',()=>navigate(1),'icon')));
    const days=grid('calendar-grid');for(const name of ['一','二','三','四','五','六','日'])days.append(el('small',{text:name}));
    for(const cell of calendarCells(year,month)){
      const marked=monthEvents.some(e=>String(e.date||'').slice(0,10)===cell.date);
      const b=button(String(cell.day),()=>onCalendar({date:cell.date}),`calendar-day ${cell.current?'':'muted'} ${cell.date===selected?'selected':''}`);
      b.dataset.date=cell.date;b.setAttribute('aria-label',cell.date);b.setAttribute('aria-pressed',cell.date===selected?'true':'false');
      if(marked)b.append(el('i',{'aria-label':'有日程'}));days.append(b);
    }
    root.append(heading(selected,monthEvents.filter(e=>e.date?.startsWith(selected)).length));
    const selectedItems=items.filter(e=>e.date?.startsWith(selected));
    for(const row of selectedItems)root.append(card(row,'event-card',box('event-time',small(row.time||'全天')),body(row,row.location||row.note),tag(row.type)));
    if(!selectedItems.length)root.append(box('day-empty',small('这一天还没有安排'),button('添加日程',onAdd)));
    if(items.length){root.append(heading('所有日程'));for(const row of items)root.append(card(row,'event-card',box('event-time',small(row.date),el('strong',{text:row.time||'全天'})),body(row,row.location||row.note)));}
  }else if(moduleId==='calendar'){
    list(row=>card(row,'location-card',box('sun-art','☀'),body(row,[row.city,row.timezone].filter(Boolean).join(' · ')),small(`${row.latitude}, ${row.longitude}`)));
  }else if(moduleId==='memos'){
    root.append(heading('我的笔记'));const target=grid('notes-grid');
    for(const row of items)target.append(card(row,'note-card',row.pinned?tag('置顶'):null,el('h3',{text:title(row)}),el('p',{text:text(row.content||'')}),small(row.date||row.time||'未标注时间')));
    if(!items.length)target.append(empty());
  }else if(moduleId==='books'){
    const target=grid('book-shelf');
    for(const row of items)target.append(card(row,'book-card',art(row,'book-cover'),body(row,row.author),bar(progressRatio(row)),small(`已读 ${Math.round(progressRatio(row)*100)}%`)));
    if(!items.length)target.append(empty());
  }else if(moduleId==='photos'){
    const albums=[...new Set(items.map(r=>r.album).filter(Boolean))];
    if(albums.length)root.append(box('album-names',...albums.map(a=>tag(a))));
    const target=grid('photo-wall');for(const row of items)target.append(card(row,'photo-tile',art(row,'photo-art'),body(row,row.date||row.album)));if(!items.length)target.append(empty());
  }else if(moduleId==='map'){
    const map=box('city-map',box('map-water'),box('map-road road-one'),box('map-road road-two'),small('角色的地点示意 · 不读取真实位置'));
    const pins=[...(state.map?.current?[state.map.current]:[]),...(state.map?.places||[])];
    const pinGroups=new Map();for(const row of pins){const key=`${row.x??50}:${row.y??50}`;if(!pinGroups.has(key))pinGroups.set(key,[]);pinGroups.get(key).push(row);}
    for(const group of pinGroups.values())for(const [index,row]of group.entries()){const pin=button('⌖',()=>open(row,row===state.map?.current?'map.current':'map.places'),'map-pin');pin.style.left=`${Math.max(8,Math.min(92,Number.isFinite(row.x)?row.x:50))}%`;pin.style.top=`${Math.max(8,Math.min(88,Number.isFinite(row.y)?row.y:50))}%`;if(group.length>1){const column=index%5,rowIndex=Math.floor(index/5),columns=Math.min(5,group.length);pin.style.marginLeft=`${(column-(columns-1)/2)*34}px`;pin.style.marginTop=`${rowIndex*34}px`;}pin.setAttribute('aria-label',title(row));map.append(pin);}root.append(map);
    list(row=>card(row,'place-card',box('place-symbol','⌖'),body(row,row.address||row.note),tag(path==='map.current'?'当前位置':'收藏地点')));
  }else if(moduleId==='browser'){
    root.append(box('browser-address',el('span',{text:'◎'}),el('span',{text:path==='browser.tabs'?'打开过的网页':path==='browser.history'?'浏览历史':'搜索足迹'})));
    const target=grid(path==='browser.tabs'?'browser-tiles':'browser-timeline');
    for(const row of items)target.append(card(row,'browser-record',box('favicon',title(row).slice(0,1)),body(row,row.url||row.time||row.text||row.content),small(row.date)));
    if(!items.length)target.append(empty());
  }else if(moduleId==='youtube'||moduleId==='bilibili'||moduleId==='pornhub'){
    if(path.endsWith('subscriptions')||path.endsWith('following')){
      list(row=>card(row,'creator-card',art(row,'round-avatar'),body(row,row.bio||row.sign||row.channel),tag('已关注')));
    }else{
      const target=grid(moduleId==='bilibili'?'video-grid':'video-list');
      for(const row of items){const image=box('video-art',art(row,'video-cover'),el('span',{class:'play-symbol',text:'▷'}),el('span',{class:'video-duration',text:displayDuration(row.duration)}));
        target.append(card(row,'video-card',image,body(row,[row.channel||row.up||row.author,row.views?`${row.views} 次播放`:null,row.danmaku?`${row.danmaku} 弹幕`:null].filter(Boolean).join(' · ')),row.progress?bar(progressRatio(row)):null,tag(row.category)));}
      if(!items.length)target.append(empty());
    }
  }else if(moduleId==='taobao'||moduleId==='xianyu'){
    const target=grid(moduleId==='xianyu'&&!path.endsWith('orders')?'goods-grid':'order-list');
    for(const row of items)target.append(card(row,'goods-card',art(row,'goods-art'),body(row,[row.shop||row.seller,row.spec||row.condition].filter(Boolean).join(' · ')),box('goods-bottom',el('strong',{class:'price',text:`¥${Number(row.price||0).toFixed(2)}`}),small(row.qty?`× ${row.qty}`:row.wants?`${row.wants} 人想要`:''),tag(row.status))));
    if(!items.length)target.append(empty());
  }else if(moduleId==='flight'){
    list(row=>card(row,'boarding-pass',box('pass-top',el('strong',{text:row.airline||'我的行程'}),tag(row.status)),box('flight-route',box('',small(row.from?.city),el('strong',{text:row.from?.code||'—'}),small(row.from?.time)),box('flight-line','✈',small(row.no)),box('',small(row.to?.city),el('strong',{text:row.to?.code||'—'}),small(row.to?.time))),box('pass-bottom',small(row.date),small(row.cabin),small(row.seat?`座位 ${row.seat}`:''),small(row.gate?`登机口 ${row.gate}`:''))));
  }else if(moduleId==='meituan'){
    list(row=>{
      const index=deliveryState(row).step_index;const steps=box('delivery-steps',...deliverySteps.map((name,i)=>el('span',{class:index!==null&&i<=index?'done':'',text:name})));
      return card(row,'delivery-card',box('delivery-head',box('meal-icon','♨'),body(row,row.address),tag(row.status)),...(row.items||[]).map(item=>box('meal-item',el('span',{text:item.name||''}),small(`× ${item.qty??1}`),small(`¥${Number(item.price||0).toFixed(2)}`))),steps,box('delivery-total',small(row.eta?`预计 ${row.eta}`:''),el('strong',{text:`合计 ¥${Number(row.total||0).toFixed(2)}`})));
    });
  }else if(moduleId==='wechat'&&path==='wechat.chats'){
    list(row=>{const last=row.messages?.at(-1);const brief=last?.type==='transfer'?'[模拟转账]':last?.type==='image'?'[图片]':last?.type==='voice'?'[语音说明]':last?.text;
      return card(row,'chat-row',art(row,'round-avatar'),body(row,brief||row.bio||'还没有模拟消息'),box('chat-meta',small(last?.time||row.time),row.unread?el('span',{class:'unread',text:String(row.unread)}):null));});
  }else if(moduleId==='wechat'||moduleId==='instagram'||moduleId==='weibo'){
    const key=moduleId==='wechat'?'me':moduleId==='instagram'?'profile':null;
    const me=key?state[moduleId]?.[key]:null;
    if(moduleId==='wechat'&&state.wechat?.cover)root.append(picture(state.wechat.cover,'moments-cover'));
    if(me)root.append(box('social-profile',picture(me.avatar,'profile-avatar'),box('',el('h2',{text:text(me.name||state.owner?.name||'我')}),small(me.bio||me.sign||''),moduleId==='instagram'?small(`粉丝 ${me.followers??0} · 关注 ${me.following??0}`):null),button('编辑资料',()=>profile(moduleId),'subtle')));
    if(path.endsWith('hot'))list(row=>card(row,'topic-card',el('span',{class:'topic-rank',text:String(items.indexOf(row)+1)}),body(row,row.tag||row.category),small(row.heat?`${row.heat} 热度`:'')));
    else if(path.endsWith('highlights')){const target=grid('highlights');for(const row of items)target.append(card(row,'highlight-card',art(row,'round-avatar'),body(row)));if(!items.length)target.append(empty());}
    else list(row=>{
      const media=(row.images||[]).map(image=>picture(typeof image==='string'?image:image.src,'social-photo'));
      if(!media.length&&(row.image||row.src))media.push(art(row,'social-photo'));
      const likes=Array.isArray(row.likes)?row.likes.length:Number(row.likes||0);
      return card(row,'social-card',box('post-author',picture(row.avatar||me?.avatar,'round-avatar'),body({name:row.name||row.author||me?.name||state.owner?.name||'我'},row.time||row.date)),el('p',{class:'post-text',text:text(row.text||row.content||row.caption||row.title||'')}),media.length?box(`post-photos ${media.length===1?'single':''}`,...media):null,small(row.location),box('post-counts',small(`♡ ${likes}`),small(`评论 ${row.comments?.length||0}`),small(row.reposts?`转发 ${row.reposts}`:'')));
    });
  }else if(moduleId==='xiaoyuzhou'){
    list(row=>card(row,'podcast-card',art(row,'podcast-cover'),body(row,[row.podcast||row.host,row.date].filter(Boolean).join(' · ')),bar(progressRatio(row)),box('podcast-meta',small(displayDuration(row.duration)),small(row.position?`听到 ${displayDuration(row.position)}`:''),tag(row.favorite?'已收藏':row.status))));
  }else if(moduleId==='xiachufang'){
    const target=grid('recipe-grid');for(const row of items)target.append(card(row,'recipe-card',art(row,'recipe-cover'),body(row,row.description||row.note),box('recipe-meta',small(row.minutes?`${row.minutes} 分钟`:''),small(row.servings?`${row.servings} 人份`:''),row.rating?stars(row.rating):tag(row.favorite?'已收藏':''))));if(!items.length)target.append(empty());
  }else if(moduleId==='douban'){
    list(row=>card(row,'review-card',art(row,'book-cover'),body(row,[row.creator,row.year,row.category].filter(Boolean).join(' · ')),box('review-rating',stars(row.rating),tag(row.status)),el('p',{class:'review-text',text:text(row.comment||row.content||row.note||'')})));
  }else if(moduleId==='music'){
    const current=state.music?.nowPlaying;
    if(current){root.append(box('music-hero',art(current,'album-cover'),el('h2',{text:title(current)}),el('p',{text:current.artist||''}),current.comment?el('blockquote',{text:current.comment}):null));}
    else root.append(box('music-hero empty-player',el('span',{text:'♫'}),el('p',{text:'挑一首歌，留住今天的心情'})));
    root.append(box('player-controls',button('⏮',()=>player(-1),'icon'),button('播放 / 暂停',()=>player(0),'primary'),button('⏭',()=>player(1),'icon')));
    root.append(heading(path==='music.nowPlaying'?'正在听':'我的歌单'));
    list(row=>{const r=card(row,'track-row',art(row,'track-cover'),body(row,[row.artist,row.comment].filter(Boolean).join(' · ')),small(displayDuration(row.duration)));if(row.songId){const b=button('播放',event=>{event?.stopPropagation();play(String(row.songId));},'track-play');r.append(b);}return r;});
  }else if(moduleId==='ledger'){
    let previousDate=null;list(row=>{if(row.date!==previousDate){previousDate=row.date;root.append(heading(row.date||'未标注日期',''));}return card(row,'ledger-entry',box('ledger-icon',row.type==='income'?'+':'−'),body(row,[row.category,row.account,row.note].filter(Boolean).join(' · ')));});
  }else{
    list(row=>card(row,'',art(row,'thumbnail'),body(row,[row.date,row.note,row.content].filter(Boolean).join(' · ')),tag(row.type)));
  }
  return root;
}

export function recordStory({moduleId,row,state,el,picture,button,toggleFavorite}) {
  const root=el('div',{class:`record-story story-${moduleId}`});
  const p=value=>value?el('p',{text:ownerText(value,state)}):null;
  const add=(...nodes)=>root.append(...nodes.filter(Boolean));
  if(moduleId==='memos')add(p(row.time||row.date),p(row.content));
  if(moduleId==='calendar')add(p([row.date,row.time].filter(Boolean).join(' · ')),p(row.location),p(row.title),p(row.note));
  if(moduleId==='browser')add(p(row.url),p(row.summary),p(row.content||row.text));
  if(['youtube','bilibili','pornhub'].includes(moduleId))add(el('div',{class:'story-video'},picture(row.thumb||row.cover,'video-cover'),el('span',{text:`▷ ${displayDuration(row.duration)}`})),p(row.channel||row.up),p(row.note));
  if(moduleId==='photos')add(picture(row.src,'lightbox-image'),p(row.caption),p(row.date||row.album));
  if(moduleId==='books')add(p(row.author),...(row.quotes||[]).map(q=>el('blockquote',{text:typeof q==='object'?q.text||q.quote||JSON.stringify(q):String(q)})),p(row.note));
  if(['taobao','xianyu'].includes(moduleId)){const pictures=row.images||[];if(pictures.length)add(el('div',{class:'detail-images'},pictures.map(image=>picture(typeof image==='string'?image:image.src,'detail-image'))));add(el('h2',{class:'price',text:`¥${Number(row.price||0).toFixed(2)}`}),p(row.shop||row.seller),p([row.status,row.spec||row.condition].filter(Boolean).join(' · ')),p(row.description||row.note));}
  if(['wechat','instagram','weibo'].includes(moduleId)){add(p(row.text||row.caption||row.content));if(row.src)add(picture(row.src,'detail-image'));if(row.images?.length)add(el('div',{class:'post-photos'},row.images.map(image=>picture(typeof image==='string'?image:image.src,'social-photo'))));add(p(row.time),p(row.location||row.source));}
  if(moduleId==='music')add(p(row.artist),p(row.album),p(row.comment));
  if(moduleId==='ledger')add(el('h2',{class:row.type==='income'?'income':'expense',text:`${row.type==='income'?'+':'−'} ¥${Number(row.amount||0).toFixed(2)}`}),p([row.date,row.category,row.account].filter(Boolean).join(' · ')),p(row.note));
  if(moduleId==='xiachufang'){
    add(picture(row.cover||row.photo,'recipe-hero'),p(row.description||row.note));
    if(row.ingredients?.length){const table=el('table',{class:'ingredients-table'});for(const ingredient of row.ingredients)table.append(el('tr',{},el('td',{text:ingredient.name}),el('td',{text:ingredient.amount||''})));add(el('h3',{text:'食材'}),table);}
    if(row.steps?.length)add(el('h3',{text:'做法'}),el('ol',{class:'recipe-steps'},row.steps.map(step=>el('li',{text:step}))));
  }
  if(['books','xiaoyuzhou'].includes(moduleId)&&Number.isFinite(Number(row.progress)))add(el('p',{text:`进度 ${Math.round(progressRatio(row)*100)}%`}));
  if(moduleId==='xiaoyuzhou')add(p(row.podcast||row.host),p(row.note),p(row.status));
  if(moduleId==='xiachufang'&&toggleFavorite){const favorite=button(row.favorite?'★ 已收藏':'☆ 收藏',async()=>{try{favorite.disabled=true;const value=await toggleFavorite(row);favorite.textContent=value?'★ 已收藏':'☆ 收藏';}finally{favorite.disabled=false;}},'favorite-toggle');add(favorite);}
  if(moduleId==='douban')add(p(row.comment),p(row.content||row.note));
  if(moduleId==='meituan')add(p(row.status),p(row.rider?`配送员：${row.rider}`:''),p(row.address));
  if(moduleId==='flight')add(el('div',{class:'flight-detail-route',text:`${row.from?.city||''}  ✈  ${row.to?.city||''}`}),p([row.date,row.no,row.cabin].filter(Boolean).join(' · ')),p(row.passenger?`乘客：${row.passenger}`:''),p(row.booking?`预订：${row.booking}`:''));
  return root;
}
