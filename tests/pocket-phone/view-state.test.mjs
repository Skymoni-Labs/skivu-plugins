// SPDX-License-Identifier: GPL-3.0-only
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectionOptions, selectRecords, cartSummary, ledgerSummary, deliveryState, deliverySteps} from '../../plugins/pocket-phone/view-state.js';

const ids = items => items.map(item => item?.id);
const optionValues = (path, items) => collectionOptions(path, items).map(option => option.value);

test('memo pin/time and chat pin sorting are stable and leave source records intact', () => {
  const items = Object.freeze([{id: 'old', time: '2026-01-01'}, {id: 'pin-old', pinned: true, time: '2025-01-01'}, {id: 'missing'}, {id: 'new', time: '2026-10-25'}, {id: 'pin-new', pinned: true, time: '2026-01-01'}].map(Object.freeze));
  assert.deepEqual(ids(selectRecords('memos', items)), ['pin-new', 'pin-old', 'new', 'old', 'missing']);
  assert.deepEqual(ids(selectRecords('wechat.chats', items)), ['pin-old', 'pin-new', 'old', 'missing', 'new']);
  assert.deepEqual(ids(items), ['old', 'pin-old', 'missing', 'new', 'pin-new']);
});

test('all filter preserves records with missing fields and unsupported filters do not silently drop data', () => {
  const items = [{id: 'missing'}, {}, null, 'old search'];
  for (const path of ['memos', 'wechat.chats', 'flight.flights', 'meituan.orders', 'xiaoyuzhou.episodes', 'photos', 'douban.items', 'events', 'unknown']) {
    assert.equal(selectRecords(path, items).length, items.length, path);
    assert.equal(selectRecords(path, items, {filter: 'unsupported'}).length, items.length, path);
  }
  const events = [{id: 'later', date: '2026-10-25'}, {id: 'earlier', date: '2025-01-01'}];
  assert.deepEqual(selectRecords('events', events), events);
});

test('flight status determines trips/history without using today or guessing terminal aliases', () => {
  const items = [
    {id: 'done-old', status: '已到达', date: '2020-01-01'}, {id: 'past-active', status: '计划', date: '2010-01-01', from: {time: '10:00'}},
    {id: 'done-new', status: '已取消', date: '2030-01-01'}, {id: 'early', date: '2026-10-25', from: {time: '08:00'}},
    {id: 'late', status: '延误', date: '2026-10-25', from: {time: '12:00'}}, {id: 'unknown', status: '已完成'}, {id: 'missing'},
  ];
  assert.deepEqual(ids(selectRecords('flight.flights', items, {filter: 'trips'})), ['past-active', 'early', 'late', 'unknown', 'missing']);
  assert.deepEqual(ids(selectRecords('flight.flights', items, {filter: 'history'})), ['done-new', 'done-old']);
  assert.deepEqual(ids(selectRecords('flight.flights', items)), ['past-active', 'early', 'late', 'unknown', 'missing', 'done-new', 'done-old']);
});

test('delivery final-state set and four steps match static evidence; unknown status is active', () => {
  assert.deepEqual(deliverySteps, ['已下单', '商家已接单', '骑手配送中', '已送达']);
  for (const [index, status] of deliverySteps.entries()) assert.equal(deliveryState({status}).step_index, index);
  const finished = ['已送达', '已完成', '订单已完成', '交易完成', '交易成功', '已收货', '已取消', '订单已取消', '已关闭', '交易关闭', '已退款', '退款成功'];
  for (const status of finished) assert.equal(deliveryState({status: ` ${status} `}).finished, true, status);
  for (const status of [undefined, '', '配送', '配送异常', '待确认', '完成']) {
    assert.equal(deliveryState({status}).finished, false); assert.equal(deliveryState({status}).step_index, null);
  }
  const items = [{id: 'done', status: '已送达'}, {id: 'unknown', status: '新状态'}, {id: 'active', status: '骑手配送中'}, {id: 'cancel', status: '已取消'}, {id: 'missing'}];
  assert.deepEqual(ids(selectRecords('meituan.orders', items)), ['unknown', 'active', 'missing', 'done', 'cancel']);
  assert.deepEqual(ids(selectRecords('meituan.orders', items, {filter: 'active'})), ['unknown', 'active', 'missing']);
  assert.deepEqual(ids(selectRecords('meituan.orders', items, {filter: 'history'})), ['done', 'cancel']);
});

test('final podcast renderer progress/status rules preserve precedence and introduce no favorite schema', () => {
  const items = [{id: 'missing'}, {id: 'unheard', progress: 0}, {id: 'progress', progress: .1}, {id: 'status', status: '在听'}, {id: 'done-progress', progress: 1}, {id: 'done-status', status: 'completed'}, {id: 'done-precedence', progress: .2, status: '已听完'}];
  assert.deepEqual(ids(selectRecords('xiaoyuzhou.episodes', items, {filter: 'unheard'})), ['missing', 'unheard']);
  assert.deepEqual(ids(selectRecords('xiaoyuzhou.episodes', items, {filter: 'listening'})), ['progress', 'status']);
  assert.deepEqual(ids(selectRecords('xiaoyuzhou.episodes', items, {filter: 'done'})), ['done-progress', 'done-status', 'done-precedence']);
  assert.deepEqual(optionValues('xiaoyuzhou.episodes', items), ['all', 'unheard', 'listening', 'done']);
  assert.deepEqual(optionValues('xiaoyuzhou.subscriptions', items), ['all']);
});

test('favorite filters apply only to actual recipe, market and social fields', () => {
  const items = [{id: 'yes', favorite: true}, {id: 'no', favorite: false}, {id: 'missing'}];
  for (const path of ['xiachufang.recipes', 'xianyu.items', 'weibo.posts']) {
    assert.deepEqual(optionValues(path, items), ['all', 'favorites']);
    assert.deepEqual(ids(selectRecords(path, items, {filter: 'favorites'})), ['yes']);
  }
  for (const path of ['xiachufang.cooking', 'xianyu.orders', 'weibo.hot', 'xiaoyuzhou.episodes']) assert.ok(!optionValues(path, items).includes('favorites'));
});

test('dynamic album/tag names cannot collide with all, prefixes or Unicode labels', () => {
  const photos = [{id: 'plain', album: 'all'}, {id: 'prefix', album: 'album:all'}, {id: 'unicode', album: '旅途 🏞'}, {id: 'missing'}, {id: 'repeat', album: 'all'}];
  assert.deepEqual(optionValues('photos', photos), ['all', 'album:all', 'album:album:all', 'album:旅途 🏞']);
  assert.deepEqual(ids(selectRecords('photos', photos, {filter: 'album:all'})), ['plain', 'repeat']);
  assert.deepEqual(ids(selectRecords('photos', photos, {filter: 'album:album:all'})), ['prefix']);
  const privateRows = [{id: 'a', tags: ['all', 'tag:all', '中文']}, {id: 'b', tags: ['all', 2]}, {id: 'none'}];
  assert.deepEqual(optionValues('pornhub.history', privateRows), ['all', 'tag:all', 'tag:tag:all', 'tag:中文', 'tag:2']);
  assert.deepEqual(ids(selectRecords('pornhub.history', privateRows, {filter: 'tag:all'})), ['a', 'b']);
  assert.deepEqual(ids(selectRecords('pornhub.history', privateRows, {filter: 'tag:2'})), ['b']);
  assert.deepEqual(optionValues('pornhub.searches', privateRows), ['all']);
});

test('douban classification is explicit and absent category survives all view', () => {
  const items = [{id: 'movie', category: '电影'}, {id: 'book', category: '图书'}, {id: 'unknown'}];
  assert.deepEqual(optionValues('douban.items', items), ['all', 'category:电影', 'category:电视剧', 'category:图书', 'category:音乐']);
  assert.deepEqual(ids(selectRecords('douban.items', items, {filter: 'category:电影'})), ['movie']);
  assert.deepEqual(ids(selectRecords('douban.items', items)), ['movie', 'book', 'unknown']);
  assert.deepEqual(optionValues('douban.reviews', items), ['all']);
});

test('album/tag selections reset to all after the selected data value disappears', () => {
  const photos = [{id: 'new', album: '新的相册'}, {id: 'missing'}];
  assert.deepEqual(ids(selectRecords('photos', photos, {filter: 'album:已删除相册'})), ['new', 'missing']);
  const privateItems = [{id: 'new', tags: ['新的标签']}, {id: 'missing'}];
  assert.deepEqual(ids(selectRecords('pornhub.history', privateItems, {filter: 'tag:已删除标签'})), ['new', 'missing']);
});

test('queries trim and match actual podcast/private display fields while generic search reads stored JSON', () => {
  const podcasts = [{id: 'id-only', title: '别的节目'}, {id: 'host', host: 'Alice'}, {id: 'note', note: 'ALICE 的讨论'}];
  assert.deepEqual(ids(selectRecords('xiaoyuzhou.episodes', podcasts, {query: ' alice '})), ['host', 'note']);
  assert.deepEqual(selectRecords('xiaoyuzhou.episodes', podcasts, {query: 'id-only'}), []);
  assert.equal(selectRecords('pornhub.searches', ['Quiet Night', {text: 'Quiet Day'}, {title: 'Other'}], {query: 'quiet'}).length, 2);
  assert.equal(selectRecords('memos', [{title: '记录', content: '需要搜索的内容'}], {query: '搜索'}).length, 1);
});

test('cart totals use exact decimal price × quantity and preserve explicit zero/fractional quantities', () => {
  assert.deepEqual(cartSummary([{price: .1, qty: 3}, {price: .2, qty: 1}]), {total_cents: 50, quantity: 4, count: 2, valid_count: 2, invalid_count: 0, complete: true});
  assert.equal(cartSummary([{price: .1}, {price: .2}]).total_cents, 30);
  assert.equal(cartSummary([{price: .001, qty: 1000}]).total_cents, 100);
  assert.equal(cartSummary([{price: 2.5, qty: .5}]).total_cents, 125);
  assert.equal(cartSummary([{price: 10, qty: 0}]).total_cents, 0);
  assert.equal(cartSummary([{price: .005}, {price: .005}]).total_cents, 1);
  assert.equal(cartSummary([{price: '1e-2', qty: '3'}]).total_cents, 3);
  assert.deepEqual(cartSummary([]), {total_cents: 0, quantity: 0, count: 0, valid_count: 0, invalid_count: 0, complete: true});
});

test('invalid cart money or arithmetic overflow is never represented as a fabricated zero', () => {
  for (const item of [{}, {price: NaN}, {price: Infinity}, {price: -1}, {price: 'not money'}, {price: 1, qty: -1}, {price: 1, qty: Infinity}]) {
    const result = cartSummary([item]); assert.equal(result.complete, false); assert.equal(result.total_cents, null); assert.equal(result.invalid_count, 1);
  }
  const overflow = cartSummary([{price: 1e300, qty: 1e300}]); assert.equal(overflow.complete, false); assert.equal(overflow.total_cents, null); assert.equal(overflow.quantity, null);
});

test('ledger month totals and expense categories precede type filtering; day groups only include selected type', () => {
  const entries = [
    {id: 'income', title: '收入', type: 'income', amount: .3, date: '2026-10-02'},
    {id: 'food', type: 'expense', amount: .1, date: '2026-10-01', category: '餐食'},
    {id: 'food2', type: 'expense', amount: .05, date: '2026-10-02', category: '餐食'},
    {id: 'other', type: 'expense', amount: .02, date: '2026-10-02'},
    {id: 'last', type: 'income', amount: 100, date: '2026-09-30'},
  ];
  const summary = ledgerSummary(entries, {month: '2026-10', type: 'income'});
  assert.equal(summary.income_cents, 30); assert.equal(summary.expense_cents, 17); assert.equal(summary.balance_cents, 13);
  assert.equal(summary.count, 4); assert.equal(summary.filtered_count, 1); assert.equal(summary.complete, true);
  assert.deepEqual(summary.categories, [{name: '餐食', cents: 15, count: 2, complete: true}, {name: '未分类', cents: 2, count: 1, complete: true}]);
  assert.deepEqual(ids(summary.records), ['income']); assert.equal(summary.days[0].date, '2026-10-02'); assert.equal(summary.days[0].income_cents, 30);
  assert.equal(summary.days[0].expense_cents, 0);
  const all = ledgerSummary(entries, {month: '2026-10'});
  assert.deepEqual(all.days.map(day => day.date), ['2026-10-02', '2026-10-01']);
  assert.deepEqual(ids(all.days[0].records), ['income', 'food2', 'other']);
});

test('ledger missing date is retained for all months and explicitly exposed instead of being lost from a selected month', () => {
  const entries = [{id: 'dated', type: 'income', amount: 1, date: '2026-10-25'}, {id: 'missing', type: 'expense', amount: .1}, {id: 'invalid-date', type: 'expense', amount: .2, date: '2026-10-99'}];
  const all = ledgerSummary(entries); assert.equal(all.count, 3); assert.equal(all.records.length, 3);
  assert.equal(all.days.at(-1).date, ''); assert.deepEqual(ids(all.days.at(-1).records), ['missing', 'invalid-date']);
  const monthly = ledgerSummary(entries, {month: '2026-10'}); assert.equal(monthly.count, 1); assert.deepEqual(ids(monthly.unassigned_records), ['missing', 'invalid-date']);
  assert.equal(monthly.income_cents, 100); assert.equal(monthly.expense_cents, 0);
});

test('ledger invalid amount/type/cached cents is flagged; category names never touch object prototypes', () => {
  for (const entry of [{type: 'expense', amount: NaN}, {type: 'expense', amount: 0}, {type: 'expense', amount: .001}, {type: 'expense', amount: 1, amount_cents: 1}, {type: 'unknown', amount: 1}]) {
    const summary = ledgerSummary([{...entry, date: '2026-10-25'}]); assert.equal(summary.complete, false); assert.equal(summary.invalid_count, 1);
    assert.equal(summary.balance_cents, null); assert.equal(summary.records.length, 1);
  }
  const safe = ledgerSummary([{type: 'expense', amount: 1, date: '2026-10-25', category: '__proto__'}, {type: 'expense', amount: 2, date: '2026-10-25', category: 'constructor'}]);
  assert.deepEqual(safe.categories.map(item => item.name), ['constructor', '__proto__']); assert.equal(safe.expense_cents, 300);
  assert.equal({}.polluted, undefined);
});
