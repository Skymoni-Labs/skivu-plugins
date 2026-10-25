// SPDX-License-Identifier: GPL-3.0-only
// Skivu independent implementation. Field and tool names are compatibility
// interfaces derived from the 1.5.2 specification and our Dart prototype.
// No reference package JavaScript, styles, SVG or presentation text is copied.

function freeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === "object") freeze(item);
  return Object.freeze(value);
}

export const phoneModules = freeze([
  {
    "id": "memos",
    "title": "备忘录",
    "collections": [
      "memos"
    ]
  },
  {
    "id": "calendar",
    "title": "日历与日出",
    "collections": [
      "events",
      "sun.location"
    ]
  },
  {
    "id": "browser",
    "title": "浏览足迹",
    "collections": [
      "browser.tabs",
      "browser.history",
      "browser.searches"
    ]
  },
  {
    "id": "taobao",
    "title": "购物记录",
    "collections": [
      "taobao.cart",
      "taobao.orders",
      "taobao.favorites"
    ]
  },
  {
    "id": "youtube",
    "title": "视频收藏",
    "collections": [
      "youtube.history",
      "youtube.watchLater",
      "youtube.subscriptions"
    ]
  },
  {
    "id": "pornhub",
    "title": "私密空间",
    "collections": [
      "pornhub.history",
      "pornhub.favorites",
      "pornhub.searches"
    ]
  },
  {
    "id": "books",
    "title": "书架",
    "collections": [
      "books"
    ]
  },
  {
    "id": "photos",
    "title": "相册",
    "collections": [
      "photos"
    ]
  },
  {
    "id": "music",
    "title": "音乐",
    "collections": [
      "music.playlist",
      "music.nowPlaying"
    ]
  },
  {
    "id": "map",
    "title": "地点",
    "collections": [
      "map.places",
      "map.current"
    ]
  },
  {
    "id": "wechat",
    "title": "聊天与动态",
    "collections": [
      "wechat.chats",
      "wechat.moments"
    ]
  },
  {
    "id": "flight",
    "title": "行程",
    "collections": [
      "flight.flights"
    ]
  },
  {
    "id": "bilibili",
    "title": "视频手记",
    "collections": [
      "bilibili.history",
      "bilibili.favorites",
      "bilibili.posts",
      "bilibili.following"
    ]
  },
  {
    "id": "instagram",
    "title": "影像动态",
    "collections": [
      "instagram.posts",
      "instagram.highlights"
    ]
  },
  {
    "id": "meituan",
    "title": "餐食记录",
    "collections": [
      "meituan.orders"
    ]
  },
  {
    "id": "xiaoyuzhou",
    "title": "播客",
    "collections": [
      "xiaoyuzhou.episodes",
      "xiaoyuzhou.subscriptions"
    ]
  },
  {
    "id": "xiachufang",
    "title": "厨房",
    "collections": [
      "xiachufang.recipes",
      "xiachufang.cooking"
    ]
  },
  {
    "id": "douban",
    "title": "影音阅读",
    "collections": [
      "douban.items",
      "douban.reviews"
    ]
  },
  {
    "id": "xianyu",
    "title": "闲置物品",
    "collections": [
      "xianyu.items",
      "xianyu.orders"
    ]
  },
  {
    "id": "weibo",
    "title": "随想与话题",
    "collections": [
      "weibo.posts",
      "weibo.hot"
    ]
  },
  {
    "id": "ledger",
    "title": "账本",
    "collections": [
      "ledger.entries"
    ]
  }
]);

export const phoneCollections = freeze({
  "memos": {
    "key": "memos",
    "title": "备忘录",
    "module": "memos",
    "fields": [
      "title",
      "content",
      "time",
      "pinned"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_memo",
    "singleton": false
  },
  "events": {
    "key": "events",
    "title": "日程",
    "module": "calendar",
    "fields": [
      "date",
      "time",
      "title",
      "note"
    ],
    "requiredFields": [
      "title",
      "date"
    ],
    "defaultWriteTool": "character_phone_write_event",
    "singleton": false
  },
  "browser.tabs": {
    "key": "browser.tabs",
    "title": "标签页",
    "module": "browser",
    "fields": [
      "title",
      "url",
      "summary",
      "content",
      "time"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_browser",
    "singleton": false
  },
  "browser.history": {
    "key": "browser.history",
    "title": "浏览历史",
    "module": "browser",
    "fields": [
      "title",
      "url",
      "summary",
      "content",
      "time"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_browser",
    "singleton": false
  },
  "browser.searches": {
    "key": "browser.searches",
    "title": "搜索记录",
    "module": "browser",
    "fields": [
      "text",
      "time"
    ],
    "requiredFields": [
      "text"
    ],
    "defaultWriteTool": "character_phone_write_browser",
    "singleton": false
  },
  "taobao.cart": {
    "key": "taobao.cart",
    "title": "购物车",
    "module": "taobao",
    "fields": [
      "title",
      "price",
      "spec",
      "shop",
      "emoji",
      "qty",
      "time",
      "note"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_taobao",
    "singleton": false
  },
  "taobao.orders": {
    "key": "taobao.orders",
    "title": "购物订单",
    "module": "taobao",
    "fields": [
      "title",
      "price",
      "spec",
      "shop",
      "emoji",
      "qty",
      "time",
      "note",
      "status"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_taobao",
    "singleton": false
  },
  "taobao.favorites": {
    "key": "taobao.favorites",
    "title": "收藏商品",
    "module": "taobao",
    "fields": [
      "title",
      "price",
      "spec",
      "shop",
      "emoji",
      "qty",
      "time",
      "note"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_taobao",
    "singleton": false
  },
  "youtube.history": {
    "key": "youtube.history",
    "title": "观看记录",
    "module": "youtube",
    "fields": [
      "title",
      "channel",
      "duration",
      "progress",
      "time",
      "thumb",
      "note",
      "url"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_youtube",
    "singleton": false
  },
  "youtube.watchLater": {
    "key": "youtube.watchLater",
    "title": "稍后观看",
    "module": "youtube",
    "fields": [
      "title",
      "channel",
      "duration",
      "progress",
      "time",
      "thumb",
      "note",
      "url"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_youtube",
    "singleton": false
  },
  "youtube.subscriptions": {
    "key": "youtube.subscriptions",
    "title": "频道订阅",
    "module": "youtube",
    "fields": [
      "name",
      "avatar",
      "url"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_youtube",
    "singleton": false
  },
  "pornhub.history": {
    "key": "pornhub.history",
    "title": "私密记录",
    "module": "pornhub",
    "fields": [
      "title",
      "duration",
      "progress",
      "time",
      "tags",
      "thumb",
      "note",
      "url"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_pornhub",
    "singleton": false
  },
  "pornhub.favorites": {
    "key": "pornhub.favorites",
    "title": "私密收藏",
    "module": "pornhub",
    "fields": [
      "title",
      "duration",
      "progress",
      "time",
      "tags",
      "thumb",
      "note",
      "url"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_pornhub",
    "singleton": false
  },
  "pornhub.searches": {
    "key": "pornhub.searches",
    "title": "私密搜索",
    "module": "pornhub",
    "fields": [
      "text",
      "time"
    ],
    "requiredFields": [
      "text"
    ],
    "defaultWriteTool": "character_phone_write_pornhub",
    "singleton": false
  },
  "books": {
    "key": "books",
    "title": "书籍",
    "module": "books",
    "fields": [
      "title",
      "author",
      "progress",
      "color",
      "status",
      "quotes",
      "note"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_book",
    "singleton": false
  },
  "photos": {
    "key": "photos",
    "title": "照片",
    "module": "photos",
    "fields": [
      "src",
      "caption",
      "time",
      "album",
      "tint",
      "note"
    ],
    "requiredFields": [
      "caption"
    ],
    "defaultWriteTool": "character_phone_write_photo",
    "singleton": false
  },
  "music.playlist": {
    "key": "music.playlist",
    "title": "歌单",
    "module": "music",
    "fields": [
      "title",
      "artist",
      "duration",
      "position",
      "playing",
      "comment",
      "cover",
      "src",
      "provider",
      "songId"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_music",
    "singleton": false
  },
  "music.nowPlaying": {
    "key": "music.nowPlaying",
    "title": "正在听",
    "module": "music",
    "fields": [
      "title",
      "artist",
      "duration",
      "position",
      "playing",
      "comment",
      "cover",
      "src",
      "provider",
      "songId"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_music",
    "singleton": true
  },
  "map.places": {
    "key": "map.places",
    "title": "地点收藏",
    "module": "map",
    "fields": [
      "name",
      "address",
      "x",
      "y",
      "note",
      "time"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_map",
    "singleton": false
  },
  "map.current": {
    "key": "map.current",
    "title": "当前地点",
    "module": "map",
    "fields": [
      "name",
      "address",
      "x",
      "y",
      "note",
      "time"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_map",
    "singleton": true
  },
  "wechat.chats": {
    "key": "wechat.chats",
    "title": "联系人与聊天",
    "module": "wechat",
    "fields": [
      "name",
      "avatar",
      "remark",
      "relation",
      "bio",
      "color",
      "pinned",
      "unread",
      "time",
      "muted",
      "group",
      "members"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_chat",
    "singleton": false
  },
  "wechat.moments": {
    "key": "wechat.moments",
    "title": "朋友圈",
    "module": "wechat",
    "fields": [
      "name",
      "color",
      "avatar",
      "text",
      "images",
      "time",
      "location",
      "likes",
      "comments"
    ],
    "requiredFields": [
      "text"
    ],
    "defaultWriteTool": "character_phone_write_moment",
    "singleton": false
  },
  "flight.flights": {
    "key": "flight.flights",
    "title": "航班",
    "module": "flight",
    "fields": [
      "airline",
      "no",
      "date",
      "cabin",
      "from",
      "to",
      "status",
      "seat",
      "gate",
      "terminal",
      "booking",
      "note",
      "passenger",
      "boarding"
    ],
    "requiredFields": [
      "no",
      "date",
      "from",
      "to"
    ],
    "defaultWriteTool": "character_phone_write_flight",
    "singleton": false
  },
  "bilibili.history": {
    "key": "bilibili.history",
    "title": "观看手记",
    "module": "bilibili",
    "fields": [
      "title",
      "up",
      "duration",
      "views",
      "danmaku",
      "time",
      "thumb",
      "note",
      "url",
      "progress"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_bilibili",
    "singleton": false
  },
  "bilibili.favorites": {
    "key": "bilibili.favorites",
    "title": "视频收藏",
    "module": "bilibili",
    "fields": [
      "title",
      "up",
      "duration",
      "views",
      "danmaku",
      "time",
      "thumb",
      "note",
      "url",
      "progress"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_bilibili",
    "singleton": false
  },
  "bilibili.posts": {
    "key": "bilibili.posts",
    "title": "投稿记录",
    "module": "bilibili",
    "fields": [
      "title",
      "up",
      "duration",
      "views",
      "danmaku",
      "time",
      "thumb",
      "note",
      "url",
      "progress"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_bilibili",
    "singleton": false
  },
  "bilibili.following": {
    "key": "bilibili.following",
    "title": "关注",
    "module": "bilibili",
    "fields": [
      "name",
      "sign",
      "avatar"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_bilibili",
    "singleton": false
  },
  "instagram.posts": {
    "key": "instagram.posts",
    "title": "影像帖子",
    "module": "instagram",
    "fields": [
      "src",
      "tint",
      "caption",
      "time",
      "location",
      "likes",
      "comments"
    ],
    "requiredFields": [
      "caption"
    ],
    "defaultWriteTool": "character_phone_write_instagram",
    "singleton": false
  },
  "instagram.highlights": {
    "key": "instagram.highlights",
    "title": "影像精选",
    "module": "instagram",
    "fields": [
      "name",
      "src",
      "tint"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_instagram",
    "singleton": false
  },
  "meituan.orders": {
    "key": "meituan.orders",
    "title": "餐食订单",
    "module": "meituan",
    "fields": [
      "shop",
      "emoji",
      "status",
      "eta",
      "time",
      "rider",
      "items",
      "total",
      "note"
    ],
    "requiredFields": [
      "shop",
      "items"
    ],
    "defaultWriteTool": "character_phone_write_meituan",
    "singleton": false
  },
  "xiaoyuzhou.episodes": {
    "key": "xiaoyuzhou.episodes",
    "title": "播客单集",
    "module": "xiaoyuzhou",
    "fields": [
      "title",
      "podcast",
      "host",
      "duration",
      "progress",
      "cover",
      "url",
      "note",
      "time",
      "status"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_xiaoyuzhou",
    "singleton": false
  },
  "xiaoyuzhou.subscriptions": {
    "key": "xiaoyuzhou.subscriptions",
    "title": "播客订阅",
    "module": "xiaoyuzhou",
    "fields": [
      "name",
      "host",
      "cover",
      "description",
      "url"
    ],
    "requiredFields": [
      "name"
    ],
    "defaultWriteTool": "character_phone_write_xiaoyuzhou",
    "singleton": false
  },
  "xiachufang.recipes": {
    "key": "xiachufang.recipes",
    "title": "菜谱",
    "module": "xiachufang",
    "fields": [
      "title",
      "cover",
      "servings",
      "minutes",
      "ingredients",
      "steps",
      "tags",
      "note",
      "url",
      "favorite"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_xiachufang",
    "singleton": false
  },
  "xiachufang.cooking": {
    "key": "xiachufang.cooking",
    "title": "下厨日记",
    "module": "xiachufang",
    "fields": [
      "title",
      "recipe_id",
      "time",
      "photo",
      "note",
      "rating"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_xiachufang",
    "singleton": false
  },
  "sun.location": {
    "key": "sun.location",
    "title": "日出地点",
    "module": "calendar",
    "fields": [
      "city",
      "latitude",
      "longitude",
      "timezone"
    ],
    "requiredFields": [
      "city",
      "latitude",
      "longitude",
      "timezone"
    ],
    "defaultWriteTool": "character_phone_set_sun_location",
    "singleton": true
  },
  "douban.items": {
    "key": "douban.items",
    "title": "影音书目",
    "module": "douban",
    "fields": [
      "title",
      "category",
      "creator",
      "year",
      "cover",
      "rating",
      "status",
      "note",
      "time"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_douban",
    "singleton": false
  },
  "douban.reviews": {
    "key": "douban.reviews",
    "title": "评论",
    "module": "douban",
    "fields": [
      "title",
      "subject",
      "category",
      "rating",
      "text",
      "author",
      "avatar",
      "time",
      "likes"
    ],
    "requiredFields": [
      "title",
      "text"
    ],
    "defaultWriteTool": "character_phone_write_douban",
    "singleton": false
  },
  "xianyu.items": {
    "key": "xianyu.items",
    "title": "闲置物品",
    "module": "xianyu",
    "fields": [
      "title",
      "price",
      "originalPrice",
      "images",
      "seller",
      "avatar",
      "location",
      "condition",
      "description",
      "status",
      "favorite",
      "wants",
      "time"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_xianyu",
    "singleton": false
  },
  "xianyu.orders": {
    "key": "xianyu.orders",
    "title": "闲置订单",
    "module": "xianyu",
    "fields": [
      "title",
      "price",
      "image",
      "seller",
      "status",
      "note",
      "time"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_xianyu",
    "singleton": false
  },
  "weibo.posts": {
    "key": "weibo.posts",
    "title": "随想",
    "module": "weibo",
    "fields": [
      "author",
      "avatar",
      "text",
      "images",
      "time",
      "source",
      "likes",
      "comments",
      "reposts",
      "liked",
      "favorite"
    ],
    "requiredFields": [
      "text"
    ],
    "defaultWriteTool": "character_phone_write_weibo",
    "singleton": false
  },
  "weibo.hot": {
    "key": "weibo.hot",
    "title": "话题",
    "module": "weibo",
    "fields": [
      "title",
      "heat",
      "tag",
      "note",
      "time"
    ],
    "requiredFields": [
      "title"
    ],
    "defaultWriteTool": "character_phone_write_weibo",
    "singleton": false
  },
  "ledger.entries": {
    "key": "ledger.entries",
    "title": "收支记录",
    "module": "ledger",
    "fields": [
      "title",
      "type",
      "amount",
      "category",
      "date",
      "account",
      "note"
    ],
    "requiredFields": [
      "title",
      "type",
      "amount",
      "date"
    ],
    "defaultWriteTool": "character_phone_write_ledger",
    "singleton": false
  }
});

export const pocketPhoneToolNames = freeze([
  "character_phone_set_profile",
  "character_phone_read",
  "character_phone_write_memo",
  "character_phone_write_event",
  "character_phone_write_browser",
  "character_phone_write_taobao",
  "character_phone_write_youtube",
  "character_phone_write_pornhub",
  "character_phone_write_book",
  "character_phone_write_photo",
  "character_phone_write_music",
  "character_phone_write_map",
  "character_phone_write_moment",
  "character_phone_write_flight",
  "character_phone_write_bilibili",
  "character_phone_write_instagram",
  "character_phone_write_meituan",
  "character_phone_write_chat",
  "character_phone_delete_record",
  "character_phone_set_contact",
  "character_phone_set_sun_location",
  "character_phone_write_podcast",
  "character_phone_write_recipe",
  "character_phone_search_music",
  "character_phone_play_music",
  "character_phone_write_xiaoyuzhou",
  "character_phone_write_xiachufang",
  "character_phone_write_douban",
  "character_phone_write_xianyu",
  "character_phone_write_weibo",
  "character_phone_write_ledger"
]);

// Fresh examples explain the compatibility schema; they are authored here,
// rather than copied from the reference package's narrative sample records.
function exampleFor(spec) {
  const sample = {};
  for (const field of spec.requiredFields) sample[field] = field === 'name' ? '示例联系人' : field === 'text' ? '一条记录' : '示例条目';
  if ('date' in sample) sample.date = '2026-01-01';
  if ('items' in sample) sample.items = [{name: '示例餐食', qty: 1, price: 10}];
  if ('from' in sample) sample.from = {city: '甲地', code: 'AAA', time: '09:00', airport: '甲地机场'};
  if ('to' in sample) sample.to = {city: '乙地', code: 'BBB', time: '11:00', airport: '乙地机场'};
  if (spec.key === 'memos') sample.content = '写下需要记住的内容。';
  if (spec.key === 'books') Object.assign(sample, {author: '示例作者', progress: 0, quotes: []});
  if (spec.key.startsWith('music.')) Object.assign(sample, {artist: '示例作者', duration: 180, position: 0, playing: false, provider: 'local'});
  if (spec.key === 'photos') Object.assign(sample, {src: '', album: '照片'});
  if (spec.key === 'wechat.moments') Object.assign(sample, {name: '{{owner}}', images: [], likes: [], comments: []});
  if (spec.key === 'instagram.posts') Object.assign(sample, {src: '', likes: 0, comments: []});
  if (spec.key === 'xiachufang.recipes') Object.assign(sample, {servings: 1, minutes: 20, ingredients: [{name: '示例食材', amount: '适量'}], steps: ['准备食材', '完成烹调']});
  if (spec.key === 'sun.location') Object.assign(sample, {city: '北京', latitude: 39.9042, longitude: 116.4074, timezone: 'Asia/Shanghai'});
  if (spec.key === 'ledger.entries') Object.assign(sample, {type: 'expense', amount: 1, category: '其他', date: '2026-01-01'});
  return sample;
}
export const phoneExamples = freeze(Object.fromEntries(Object.values(phoneCollections).map(spec => [spec.key, exampleFor(spec)])));

const originalToolRoots = ['xiaoyuzhou', 'xiachufang', 'douban', 'xianyu', 'weibo', 'ledger'];
export const phoneWriteTools = freeze(Object.fromEntries(originalToolRoots.map(root => {
  const descriptor = {
    tool: `character_phone_core.character_phone_write_${root}`,
    collections: Object.keys(phoneCollections).filter(path => path.startsWith(`${root}.`)),
    parameters: root === 'ledger' ? 'record_json: JSON object string' : 'collection: full path; record_json: JSON object string',
  };
  if (root === 'xiaoyuzhou') descriptor.compatible_tool = 'character_phone_core.character_phone_write_podcast';
  if (root === 'xiachufang') descriptor.compatible_tool = 'character_phone_core.character_phone_write_recipe';
  return [root, descriptor];
})));
