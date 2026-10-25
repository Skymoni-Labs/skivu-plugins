// SPDX-License-Identifier: GPL-3.0-only
// Independent presentation-data helpers. No reference renderer is executed.
// Static semantic evidence: index.html:655,903,936-966,1073-1102,1181-1184;
// collections.js:8-18; social.js:13-15; ledger.js:13-19 in restored 1.5.2.

const option = (value, label) => ({value, label});
const rows = value => Array.isArray(value) ? [...value] : [];
const text = value => value == null ? '' : String(value);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const flightFinished = item => ['已到达', '已取消'].includes(record(item).status);
const deliveryFinished = new Set(['已送达', '已完成', '订单已完成', '交易完成', '交易成功', '已收货', '已取消', '订单已取消', '已关闭', '交易关闭', '已退款', '退款成功']);
export const deliverySteps = Object.freeze(['已下单', '商家已接单', '骑手配送中', '已送达']);

/** Unknown status remains active and has no invented stage or completion. */
export function deliveryState(item) {
  const status = text(record(item).status).trim(), index = deliverySteps.indexOf(status);
  return {status, finished: deliveryFinished.has(status), step_index: index < 0 ? null : index};
}
function podcastState(item) {
  const row = record(item), progress = Number(row.progress ?? 0);
  if (Number.isFinite(progress) && progress >= 1 || ['已听', '已听完', '已完成', '听完', 'completed'].includes(row.status)) return 'done';
  if (Number.isFinite(progress) && progress > 0 || ['在听', '收听中'].includes(row.status)) return 'listening';
  return 'unheard';
}
function privateTags(item) {
  return Array.isArray(record(item).tags) ? record(item).tags.map(String) : [];
}
function uniqueOptions(values, prefix) {
  return [...new Set(values.map(text).filter(value => value !== ''))].map(value => option(prefix + value, value));
}

/** Prefix data-derived filters so an album or tag named "all" stays usable. */
export function collectionOptions(path, allItems = []) {
  const base = [option('all', '全部')], items = rows(allItems);
  if (path === 'flight.flights') return [...base, option('trips', '行程'), option('history', '历史')];
  if (path === 'meituan.orders') return [...base, option('active', '进行中'), option('history', '历史')];
  if (path === 'xiaoyuzhou.episodes') return [...base, option('unheard', '未听'), option('listening', '在听'), option('done', '已听')];
  if (['xiachufang.recipes', 'xianyu.items', 'weibo.posts'].includes(path)) return [...base, option('favorites', '收藏')];
  if (path === 'douban.items') return [...base, ...['电影', '电视剧', '图书', '音乐'].map(value => option(`category:${value}`, value))];
  if (path === 'photos') return [...base, ...uniqueOptions(items.map(item => record(item).album), 'album:')];
  if (['pornhub.history', 'pornhub.favorites'].includes(path)) return [...base, ...uniqueOptions(items.flatMap(privateTags), 'tag:')];
  return base;
}

function matchesFilter(path, item, filter) {
  const row = record(item);
  if (filter === 'all') return true;
  if (path === 'flight.flights') return filter === 'history' ? flightFinished(item) : filter === 'trips' ? !flightFinished(item) : true;
  if (path === 'meituan.orders') return filter === 'history' ? deliveryState(item).finished : filter === 'active' ? !deliveryState(item).finished : true;
  if (path === 'xiaoyuzhou.episodes') return ['unheard', 'listening', 'done'].includes(filter) ? podcastState(item) === filter : true;
  if (['xiachufang.recipes', 'xianyu.items', 'weibo.posts'].includes(path) && filter === 'favorites') return !!row.favorite;
  if (path === 'douban.items' && filter.startsWith('category:')) return text(row.category) === filter.slice('category:'.length);
  if (path === 'photos' && filter.startsWith('album:')) return text(row.album) === filter.slice('album:'.length);
  if (['pornhub.history', 'pornhub.favorites'].includes(path) && filter.startsWith('tag:')) return privateTags(item).includes(filter.slice('tag:'.length));
  return true;
}
function searchText(path, item) {
  if (typeof item === 'string') return item;
  const row = record(item);
  if (path.startsWith('xiaoyuzhou.')) return [row.title, row.name, row.podcast, row.host, row.note, row.description].filter(Boolean).join(' ');
  if (path.startsWith('pornhub.')) return [row.title, row.note, row.text, ...privateTags(item)].filter(Boolean).join(' ');
  try { return JSON.stringify(item) ?? ''; } catch { return ''; }
}
function compareKnown(first, second, descending = false) {
  const a = text(first), b = text(second);
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return descending ? b.localeCompare(a) : a.localeCompare(b);
}
function flightSort(first, second, filter) {
  const a = record(first), b = record(second);
  if (filter === 'history') return compareKnown(a.date, b.date, true);
  if (filter === 'all' && flightFinished(first) !== flightFinished(second)) return flightFinished(first) ? 1 : -1;
  if (filter === 'all' && flightFinished(first)) return compareKnown(a.date, b.date, true);
  return compareKnown(a.date, b.date) || compareKnown(record(a.from).time, record(b.from).time);
}

/** Pure list selection: never mutates input or rewrites missing record fields. */
export function selectRecords(path, items = [], {filter = 'all', query = ''} = {}) {
  filter = typeof filter === 'string' && filter ? filter : 'all';
  // The original album/tag renderers reset a stale selection when its value
  // no longer exists after an edit, deletion or collection switch.
  if (!collectionOptions(path, items).some(option => option.value === filter)) filter = 'all';
  const needle = text(query).trim().toLocaleLowerCase();
  const selected = rows(items).filter(item => matchesFilter(path, item, filter) && (!needle || searchText(path, item).toLocaleLowerCase().includes(needle)));
  // Stable sort preserves stored order for ties and for unsorted collections.
  if (path === 'memos') selected.sort((a, b) => Number(!!record(b).pinned) - Number(!!record(a).pinned) || compareKnown(record(a).time, record(b).time, true));
  else if (path === 'wechat.chats') selected.sort((a, b) => Number(!!record(b).pinned) - Number(!!record(a).pinned));
  else if (path === 'flight.flights') selected.sort((a, b) => flightSort(a, b, filter));
  else if (path === 'meituan.orders') selected.sort((a, b) => Number(deliveryState(a).finished) - Number(deliveryState(b).finished));
  else if (path === 'ledger.entries') selected.sort((a, b) => compareKnown(validDate(record(a).date), validDate(record(b).date), true));
  return selected;
}

const maxInteger = BigInt(Number.MAX_SAFE_INTEGER);
function safeInteger(value) { return value >= -maxInteger && value <= maxInteger ? Number(value) : null; }
function finite(value, {fallback} = {}) {
  if (value == null || value === '') return fallback ?? null;
  if (!['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
// Decimal rational arithmetic avoids binary price × quantity accumulation and
// handles legitimate fractional quantities without inventing whole units.
function decimal(value) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  let units = BigInt(whole + fraction), scale = fraction.length - Number(exponent);
  if (scale < 0) { units *= 10n ** BigInt(-scale); scale = 0; }
  return {units, scale};
}
function addDecimal(sum, next) {
  const scale = Math.max(sum.scale, next.scale);
  return {units: sum.units * 10n ** BigInt(scale - sum.scale) + next.units * 10n ** BigInt(scale - next.scale), scale};
}
function roundedCents(value) {
  const denominator = 10n ** BigInt(value.scale);
  return safeInteger((value.units * 100n + denominator / 2n) / denominator);
}

/** Null totals mean incomplete/unsafe input, rather than an invented zero. */
export function cartSummary(items = []) {
  const all = rows(items); let amount = {units: 0n, scale: 0}, quantity = {units: 0n, scale: 0};
  let valid = 0, invalid = 0, quantitiesComplete = true;
  for (const item of all) {
    const row = record(item), price = finite(row.price), qty = finite(row.qty, {fallback: 1});
    if (qty === null) quantitiesComplete = false;
    else quantity = addDecimal(quantity, decimal(qty));
    if (price === null || qty === null) { invalid++; continue; }
    const left = decimal(price), right = decimal(qty);
    amount = addDecimal(amount, {units: left.units * right.units, scale: left.scale + right.scale}); valid++;
  }
  const quantityNumber = quantitiesComplete ? Number(`${quantity.units}e-${quantity.scale}`) : null;
  const safeQuantity = quantityNumber !== null && Number.isFinite(quantityNumber) && quantityNumber <= Number.MAX_SAFE_INTEGER ? quantityNumber : null;
  const total = invalid ? null : roundedCents(amount);
  return {total_cents: total, quantity: safeQuantity, count: all.length, valid_count: valid, invalid_count: invalid,
    complete: invalid === 0 && total !== null && safeQuantity !== null};
}

function ledgerCents(item) {
  const row = record(item), amount = finite(row.amount);
  if (amount === null || amount < .01 || amount > 1000000000) return null;
  const scaled = amount * 100, result = Math.round(scaled);
  if (!Number.isSafeInteger(result) || Math.abs(scaled - result) > .00001) return null;
  if (row.amount_cents !== undefined && (!Number.isSafeInteger(row.amount_cents) || row.amount_cents !== result)) return null;
  return result;
}
function entryTotals(entries) {
  let income = 0n, expense = 0n, invalid = 0;
  for (const item of entries) {
    const row = record(item), value = ledgerCents(item);
    if (value === null || !['income', 'expense'].includes(row.type)) { invalid++; continue; }
    if (row.type === 'income') income += BigInt(value); else expense += BigInt(value);
  }
  const incomeNumber = invalid ? null : safeInteger(income), expenseNumber = invalid ? null : safeInteger(expense);
  const balance = invalid ? null : safeInteger(income - expense);
  return {income_cents: incomeNumber, expense_cents: expenseNumber, balance_cents: balance, invalid_count: invalid,
    complete: invalid === 0 && incomeNumber !== null && expenseNumber !== null && balance !== null};
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

/** Month totals/category stats precede the type filter, as in the final ledger
 * renderer. The type filter controls only records/day groups. Missing dates
 * stay visible under all months, or are returned as unassigned_records. */
export function ledgerSummary(entries = [], {month = 'all', type = 'all'} = {}) {
  const input = rows(entries), hasMonth = typeof month === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month);
  const unassigned = input.filter(item => !validDate(record(item).date));
  const monthly = input.filter(item => !hasMonth || validDate(record(item).date).slice(0, 7) === month);
  const all = selectRecords('ledger.entries', monthly);
  const filtered = ['income', 'expense'].includes(type) ? all.filter(item => record(item).type === type) : all;
  const categoryGroups = new Map(), dayGroups = new Map();
  for (const item of all) {
    const row = record(item);
    if (row.type !== 'expense') continue;
    const category = text(row.category) || '未分类';
    if (!categoryGroups.has(category)) categoryGroups.set(category, []);
    categoryGroups.get(category).push(item);
  }
  for (const item of filtered) {
    const date = validDate(record(item).date);
    if (!dayGroups.has(date)) dayGroups.set(date, []);
    dayGroups.get(date).push(item);
  }
  const categories = [...categoryGroups].map(([name, records]) => {
    const total = entryTotals(records); return {name, cents: total.expense_cents, count: records.length, complete: total.complete};
  }).sort((a, b) => a.cents === null ? b.cents === null ? 0 : 1 : b.cents === null ? -1 : b.cents - a.cents);
  const days = [...dayGroups].map(([date, records]) => ({date, records: [...records], ...entryTotals(records)}));
  return {month: hasMonth ? month : 'all', type: ['income', 'expense'].includes(type) ? type : 'all',
    ...entryTotals(all), count: all.length, filtered_count: filtered.length, categories, days, records: [...filtered],
    unassigned_records: hasMonth ? [...unassigned] : [], input_count: input.length};
}
