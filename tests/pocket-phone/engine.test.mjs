// SPDX-License-Identifier: GPL-3.0-only
// Tests only our independently authored business engine, never the package runtime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PocketPhoneStore, PocketPhoneError, PHONE_ARCHIVE_LIMIT, PHONE_STORAGE_KEY, PHONE_BACKUP_KEY, PHONE_DAMAGED_KEY} from '../../plugins/pocket-phone/engine.js';
import {phoneModules, phoneCollections, pocketPhoneToolNames, phoneExamples, phoneWriteTools} from '../../plugins/pocket-phone/collections.js';
import {canonicalJson} from '../../plugins/pocket-phone/json-state.js';

const copy = value => value === undefined ? undefined : structuredClone(value);
class MemoryStorage {
  constructor() { this.data = new Map(); this.writes = []; this.failKey = null; this.returnFalse = false; this.beforeSet = null; }
  async get(key) { return this.data.has(key) ? copy(this.data.get(key)) : null; }
  async set(key, value) {
    if (this.beforeSet) await this.beforeSet(key, value);
    if (key === this.failKey) throw new Error('Injected write failure');
    if (this.returnFalse) return false;
    this.data.set(key, copy(value)); this.writes.push(key); return true;
  }
}
async function ready(storage = new MemoryStorage()) { const store = new PocketPhoneStore({storage}); await store.restore(); return {store, storage}; }
const call = (store, suffix, args = {}, role = 'role-a', extra = {}) => store.invoke(`character_phone_${suffix}`, args, {roleId: role, caller: '测试角色', ...extra});
const errorCode = code => error => error instanceof PocketPhoneError && error.code === code;
function sample(path) {
  const record = Object.fromEntries(phoneCollections[path].requiredFields.map(field => [field, '记录']));
  if ('date' in record) record.date = '2026-10-25';
  if ('items' in record) record.items = [{name: '餐食', qty: 1, price: 10}];
  if ('from' in record) record.from = {city: '城市甲', code: 'AAA', time: '08:00'};
  if ('to' in record) record.to = {city: '城市乙', code: 'BBB', time: '10:00'};
  if (path === 'sun.location') Object.assign(record, {city: '上海', latitude: 31.2, longitude: 121.5, timezone: 'Asia/Shanghai'});
  if (path === 'ledger.entries') Object.assign(record, {type: 'expense', amount: .1});
  return record;
}
const localAction = title => ({tool: 'character_phone_write_memo', arguments: {record_json: {title}}});

test('immutable interface has 21 modules, 42 collections and all 31 official tools', () => {
  assert.equal(phoneModules.length, 21); assert.equal(Object.keys(phoneCollections).length, 42);
  assert.equal(new Set(pocketPhoneToolNames).size, 31);
  assert.deepEqual(new Set(phoneModules.flatMap(module => module.collections)), new Set(Object.keys(phoneCollections)));
  assert.throws(() => phoneCollections.memos.fields.push('oops'), TypeError);
  assert.equal(phoneCollections['sun.location'].module, 'calendar');
});

test('fresh restore does not write; lifecycle belongs to generic host', async () => {
  const {store, storage} = await ready();
  assert.equal(storage.writes.length, 0); assert.equal('installed' in store, false); assert.equal('enabled' in store, false);
  assert.equal(store.snapshot('role-a').revision, 0);
  assert.equal(store.busy, false);
  assert.throws(() => new PocketPhoneStore(), TypeError);
});

test('every collection supports write, read and delete with strict paths', async () => {
  const {store} = await ready();
  for (const spec of Object.values(phoneCollections)) {
    const result = await store.invoke('upsert', {path: spec.key, record: sample(spec.key)}, {roleId: 'role-a'});
    const read = await call(store, 'read', {module: spec.key});
    assert.equal(spec.singleton ? read.data.id : read.records[0].id, result.record.id, spec.key);
    assert.equal(read.write_tool_name, spec.defaultWriteTool);
    assert.equal(read.fields, spec.fields.join(' '));
    await call(store, 'delete_record', {module: spec.key, id: result.record.id});
    const empty = await call(store, 'read', {module: spec.key});
    assert.equal(spec.singleton ? empty.data : empty.total, spec.singleton ? null : 0, spec.key);
  }
});

test('all official tools and two legacy aliases execute via their mapped collections', async () => {
  const {store} = await ready(), covered = new Set();
  for (const spec of Object.values(phoneCollections)) {
    if (spec.key === 'wechat.chats' || covered.has(spec.defaultWriteTool)) continue;
    covered.add(spec.defaultWriteTool);
    const result = await store.invoke(`character_phone_core.${spec.defaultWriteTool}`, {collection: spec.key, record_json: JSON.stringify(sample(spec.key))}, {roleId: 'role-a'});
    assert.equal(result.success, true, spec.defaultWriteTool);
  }
  await call(store, 'write_podcast', {record_json: {title: '播客别名'}}); covered.add('character_phone_write_podcast');
  await call(store, 'write_recipe', {record_json: {title: '菜谱别名'}}); covered.add('character_phone_write_recipe');
  await call(store, 'set_profile', {profile_json: {name: '机主'}}); covered.add('character_phone_set_profile');
  await call(store, 'write_chat', {chat_id: 'friend', chat_json: {name: '朋友'}, message_json: {id: 'msg', text: '你好'}}); covered.add('character_phone_write_chat');
  await call(store, 'set_contact', {chat_id: 'friend', profile_json: {remark: '同学'}}); covered.add('character_phone_set_contact');
  const read = await call(store, 'read', {module: 'memos'}); covered.add('character_phone_read');
  await call(store, 'delete_record', {module: 'memos', id: read.records[0].id}); covered.add('character_phone_delete_record');
  store.musicHandler = async action => action === 'music_search' ? {results: []} : {track: {title: '歌曲', artist: '歌手', songId: '100', provider: 'netease', duration: 200}, url: 'https://example.com/music.mp3'};
  await call(store, 'search_music', {keywords: '歌曲'}); covered.add('character_phone_search_music');
  await call(store, 'play_music', {song_id: '100'}); covered.add('character_phone_play_music');
  assert.deepEqual(covered, new Set(pocketPhoneToolNames));
  assert.equal(store.snapshot('role-a').music.nowPlaying.playing, true);
});

test('30 concurrent writes serialize, copy queued arguments, and notify only durable state', async () => {
  const {store, storage} = await ready(); let notifications = 0; const observed = [];
  const unsubscribe = store.subscribe(() => {
    notifications++;
    observed.push([store.snapshot('role-a').revision, storage.data.get(PHONE_STORAGE_KEY)?.roles['role-a'].revision ?? 0]);
  });
  const args = {record_json: {id: 'queued', title: '原始参数'}};
  const first = call(store, 'write_memo', args); args.record_json.title = '入队后篡改';
  await Promise.all([first, ...Array.from({length: 29}, (_, index) => call(store, 'write_memo', {record_json: {id: `memo_${index}`, title: `条目${index}`}}))]);
  assert.equal(store.snapshot('role-a').revision, 30); assert.equal(store.snapshot('role-a').memos.length, 30);
  assert.equal(store.snapshot('role-a').memos.find(m => m.id === 'queued').title, '原始参数');
  assert.equal(notifications, 30); assert.equal(store.busy, false);
  assert.ok(observed.every(([visible, durable]) => visible === durable));
  unsubscribe(); await call(store, 'read'); assert.equal(notifications, 30);
});

test('role isolation covers profile, IDs, exports and defensive copies', async () => {
  const {store} = await ready();
  await call(store, 'set_profile', {profile_json: {name: '角色甲'}});
  await call(store, 'write_memo', {record_json: {id: 'same-id', title: '甲记录'}});
  await call(store, 'write_memo', {record_json: {id: 'same-id', title: '乙记录'}}, 'role-b');
  assert.equal(store.snapshot('role-a').owner.name, '角色甲');
  assert.equal(store.snapshot('role-b').memos[0].title, '乙记录');
  assert.ok(!store.exportArchive('role-a').includes('乙记录'));
  const snapshot = store.snapshot('role-a'); snapshot.memos.length = 0; snapshot.owner.name = '篡改';
  assert.equal(store.snapshot('role-a').memos.length, 1); assert.equal(store.snapshot('role-a').owner.name, '角色甲');
  const read = await call(store, 'read', {module: 'memos'}); read.records[0].title = '篡改';
  assert.equal(store.snapshot('role-a').memos[0].title, '甲记录');
});

test('overview never leaks private content or counts without explicit private module', async () => {
  const {store} = await ready(); await call(store, 'write_pornhub', {record_json: {title: '私密标记', tags: ['隐私']}});
  const overview = JSON.stringify(await call(store, 'read'));
  assert.ok(!overview.includes('私密标记')); assert.ok(!overview.includes('pornhub')); assert.ok(!overview.includes('隐私'));
  assert.ok(JSON.stringify(await call(store, 'read', {module: 'pornhub'})).includes('私密标记'));
  assert.equal((await call(store, 'read', {module: 'pornhub.history'})).total, 1);
});

test('save failure and false acknowledgements do not publish optimistic records', async () => {
  const {store, storage} = await ready(); await call(store, 'write_memo', {record_json: {title: '持久记录'}});
  const original = store.exportArchive('role-a');
  storage.failKey = PHONE_STORAGE_KEY;
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '失败记录'}}), /Injected write failure/);
  assert.equal(store.exportArchive('role-a'), original); assert.match(store.error, /Injected/); assert.equal(store.busy, false);
  storage.failKey = null; storage.returnFalse = true;
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '未确认'}}), errorCode('storage_failed'));
  assert.equal(store.exportArchive('role-a'), original);
  storage.returnFalse = false; await call(store, 'write_memo', {record_json: {title: '恢复'}});
  assert.equal(store.error, null);
});

test('failure to back up blocks primary overwrite', async () => {
  const {store, storage} = await ready(); await call(store, 'write_memo', {record_json: {title: '原记录'}});
  const primary = copy(storage.data.get(PHONE_STORAGE_KEY)); storage.failKey = PHONE_BACKUP_KEY;
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '新记录'}}));
  assert.deepEqual(storage.data.get(PHONE_STORAGE_KEY), primary);
});

test('revision conflicts prevent stale edits and bulk transactions commit one revision', async () => {
  const {store, storage} = await ready();
  await call(store, 'write_memo', {record_json: {title: '一次'}, expected_revision: 0});
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '过时'}, expected_revision: 0}), errorCode('revision_conflict'));
  await assert.rejects(store.invokeBatch([localAction('批次')], {roleId: 'role-a', expectedRevision: 0}), errorCode('revision_conflict'));
  const before = storage.writes.filter(key => key === PHONE_STORAGE_KEY).length;
  const receipts = await store.invokeBatch([localAction('二'), localAction('三')], {roleId: 'role-a', expectedRevision: 1});
  assert.deepEqual(receipts.map(item => item.revision), [2, 2]);
  assert.equal(store.snapshot('role-a').revision, 2); assert.equal(store.snapshot('role-a').memos.length, 3);
  assert.equal(storage.writes.filter(key => key === PHONE_STORAGE_KEY).length, before + 1);
});

test('invalid later batch action, unknown keys, and network actions roll back everything', async () => {
  const {store, storage} = await ready();
  for (const invalid of [
    {tool: 'character_phone_write_event', arguments: {record_json: {title: '缺日期'}}},
    {tool: 'delete_everything', arguments: {}},
    {tool: 'character_phone_play_music', arguments: {song_id: '100'}},
    {tool: 'character_phone_write_memo', arguments: {record_json: {title: '三'}}, unknown: true},
  ]) {
    await assert.rejects(store.invokeBatch([localAction('不应保存'), invalid], {roleId: 'role-a'}));
    assert.equal(store.snapshot('role-a').revision, 0); assert.equal(store.snapshot('role-a').memos.length, 0);
    assert.equal(storage.writes.length, 0);
  }
});

test('mayCommit checks before queue execution, after validation, and after backup wait', async () => {
  const {store, storage} = await ready();
  await assert.rejects(store.invokeBatch([localAction('取消')], {roleId: 'role-a', mayCommit: () => false}), errorCode('cancelled'));
  let checks = 0;
  await assert.rejects(store.invokeBatch([localAction('稍后取消')], {roleId: 'role-a', mayCommit: () => ++checks === 1}), errorCode('cancelled'));
  assert.equal(storage.writes.length, 0);
  await call(store, 'write_memo', {record_json: {title: '原记录'}});
  const original = store.exportArchive('role-a'); let allowed = true;
  storage.beforeSet = async key => { if (key === PHONE_BACKUP_KEY) allowed = false; };
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '备份时取消'}}, 'role-a', {mayCommit: () => allowed}), errorCode('cancelled'));
  assert.equal(store.exportArchive('role-a'), original); assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles['role-a'].revision, 1);
});

test('schema1 original import and export preserve IDs, metadata and legacy media', async () => {
  const {store} = await ready();
  const original = {schema: 1, revision: 7, owner: {name: '旧机主'}, memos: [{id: 'old', title: '旧备忘'}], photos: [{id: 'photo', caption: '旧照片', src: `/api/media/${'a'.repeat(32)}.png`}]};
  await store.importArchive('role-a', JSON.stringify(original));
  const imported = JSON.parse(store.exportArchive('role-a'));
  assert.equal(imported.schema, 1); assert.equal(imported.revision, 7); assert.equal(imported.owner.name, '旧机主');
  assert.equal(imported.photos[0].src, original.photos[0].src); assert.equal(imported.memos[0].id, 'old');
  assert.equal(store.snapshot('role-b').memos.length, 0);
  const second = await ready(); await second.store.importArchive('role-a', store.exportArchive('role-a'));
  assert.deepEqual(second.store.snapshot('role-a'), imported);
});

test('invalid imports cannot reset or partially replace an existing phone', async () => {
  const {store, storage} = await ready(); await call(store, 'write_memo', {record_json: {title: '不可丢失'}});
  const original = store.exportArchive('role-a'), writes = storage.writes.length;
  const invalid = ['{broken', {schema: 2}, {schema: 1, memos: null}, {schema: 1, owner: null}, {schema: 1, wechat: {me: null}}, {schema: 1, music: []}, {schema: 1, unknown: []}, {schema: 1, memos: [{id: 'x', title: '一'}, {id: 'x', title: '二'}]}, {schema: 1, sun: {location: {id: 'sun', city: '上海', latitude: 0, longitude: 0, timezone: 'Asia/NoSuchPlace'}}}];
  for (const value of invalid) {
    await assert.rejects(store.importArchive('role-a', typeof value === 'string' ? value : JSON.stringify(value)));
    assert.equal(store.exportArchive('role-a'), original); assert.equal(storage.writes.length, writes);
  }
});

test('corrupt primary blocks all mutation; explicit backup recovery retains damaged evidence', async () => {
  const {store, storage} = await ready(); await call(store, 'write_memo', {record_json: {title: '备份记录'}});
  const good = copy(storage.data.get(PHONE_STORAGE_KEY)); storage.data.set(PHONE_BACKUP_KEY, good); storage.data.set(PHONE_STORAGE_KEY, '{damaged');
  const restored = new PocketPhoneStore({storage});
  await assert.rejects(restored.restore(), errorCode('archive_corrupt'));
  const writes = storage.writes.length;
  await assert.rejects(call(restored, 'write_memo', {record_json: {title: '危险重置'}}), errorCode('archive_corrupt'));
  assert.equal(storage.data.get(PHONE_STORAGE_KEY), '{damaged'); assert.equal(storage.writes.length, writes);
  await restored.recoverBackup();
  assert.deepEqual(storage.data.get(PHONE_BACKUP_KEY), good); assert.equal(storage.data.get(PHONE_DAMAGED_KEY), '{damaged');
  assert.equal(restored.snapshot('role-a').memos[0].title, '备份记录');
  storage.data.set(PHONE_BACKUP_KEY, '{bad backup');
  await assert.rejects(restored.recoverBackup(), errorCode('backup_corrupt'));
  assert.deepEqual(storage.data.get(PHONE_STORAGE_KEY), good);
});

test('missing primary with existing backup requires explicit recovery', async () => {
  const {store, storage} = await ready(); await call(store, 'write_memo', {record_json: {title: '幸存记录'}});
  storage.data.set(PHONE_BACKUP_KEY, storage.data.get(PHONE_STORAGE_KEY)); storage.data.delete(PHONE_STORAGE_KEY);
  const restored = new PocketPhoneStore({storage});
  await assert.rejects(restored.restore(), errorCode('archive_corrupt')); assert.equal(storage.data.has(PHONE_STORAGE_KEY), false);
  await restored.recoverBackup(); assert.equal(restored.snapshot('role-a').memos[0].title, '幸存记录');
});

test('external storage changes are detected before backup or primary mutation', async () => {
  const {store, storage} = await ready(); await call(store, 'write_memo', {record_json: {title: '原记录'}});
  const external = copy(storage.data.get(PHONE_STORAGE_KEY)); external.roles['role-a'].revision++; external.roles['role-a'].memos[0].title = '另一页面';
  storage.data.set(PHONE_STORAGE_KEY, external); const writes = storage.writes.length;
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '过时页面'}}), errorCode('storage_conflict'));
  assert.equal(storage.writes.length, writes); assert.deepEqual(storage.data.get(PHONE_STORAGE_KEY), external);
});

function reorderedJson(value, reverse) {
  if (Array.isArray(value)) return value.map(item => reorderedJson(item, reverse));
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort(); if (reverse) keys.reverse();
  return Object.fromEntries(keys.map(key => [key, reorderedJson(value[key], reverse)]));
}
class ReorderedStorage extends MemoryStorage {
  constructor() { super(); this.roundTrips = 0; }
  async get(key) { return reorderedJson(await super.get(key), ++this.roundTrips % 2 === 0); }
  async set(key, value) { return super.set(key, reorderedJson(value, ++this.roundTrips % 2 === 0)); }
}

test('canonical JSON ignores recursive object key order while preserving arrays and values', () => {
  const value = {z: [{b: 2, a: '甲\n"'}, null, false], a: {n: .1, empty: '', zero: 0}};
  const original = copy(value);
  assert.equal(canonicalJson(value), canonicalJson(reorderedJson(value, true)));
  assert.deepEqual(value, original);
  assert.notEqual(canonicalJson(value), canonicalJson({...value, z: [...value.z].reverse()}));
  assert.notEqual(canonicalJson({value: 1}), canonicalJson({value: '1'}));
  assert.notEqual(canonicalJson({value: null}), canonicalJson({}));
  for (const invalid of [undefined, NaN, Infinity, new Date(), [undefined], Array(1), {value: undefined}]) assert.throws(() => canonicalJson(invalid), TypeError);
  const getter = {}; Object.defineProperty(getter, 'value', {enumerable: true, get() { assert.fail('getter must not run'); }});
  assert.throws(() => canonicalJson(getter), TypeError);
  const cycle = {}; cycle.self = cycle; assert.throws(() => canonicalJson(cycle), TypeError);
});

test('host key reordering permits continuous music saves, import, restore and backup recovery', async () => {
  const {store, storage} = await ready(new ReorderedStorage());
  await call(store, 'write_memo', {record_json: {id: 'memo', title: '原记录'}});
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {id: 'song', songId: '100', title: '测试歌曲', duration: 16, playing: true, position: 0}});
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {id: 'song', playing: false, position: 5}});
  await store.importArchive('role-b', store.exportArchive('role-a'));
  await call(store, 'write_memo', {record_json: {id: 'memo', title: '恢复前的修改'}});
  const backup = canonicalJson(await storage.get(PHONE_BACKUP_KEY));
  await store.recoverBackup();
  assert.equal(canonicalJson(await storage.get(PHONE_STORAGE_KEY)), backup);
  assert.equal(store.snapshot('role-a').memos[0].title, '原记录');
  await call(store, 'write_memo', {record_json: {id: 'after-recovery', title: '恢复后继续保存'}});
  const reloaded = new PocketPhoneStore({storage}); await reloaded.restore();
  await call(reloaded, 'write_memo', {record_json: {id: 'after-reload', title: '重开后继续保存'}}, 'role-b');
  assert.equal(reloaded.snapshot('role-a').music.nowPlaying.position, 5);
  assert.equal(reloaded.snapshot('role-a').music.nowPlaying.playing, false);
  assert.equal(reloaded.snapshot('role-b').music.nowPlaying.position, 5);
  assert.equal(reloaded.error, null);
});

test('canonical state comparison still rejects another store instance that committed new values', async () => {
  const {store, storage} = await ready(new ReorderedStorage());
  await call(store, 'write_memo', {record_json: {id: 'memo', title: '原记录'}});
  const other = new PocketPhoneStore({storage}); await other.restore();
  await call(other, 'write_memo', {record_json: {id: 'memo', title: '另一实例的新内容'}});
  const external = canonicalJson(await storage.get(PHONE_STORAGE_KEY)), writes = storage.writes.length;
  await assert.rejects(call(store, 'write_memo', {record_json: {id: 'memo', title: '过时覆盖'}}), errorCode('storage_conflict'));
  assert.equal(storage.writes.length, writes);
  assert.equal(canonicalJson(await storage.get(PHONE_STORAGE_KEY)), external);
});

test('value changes and array reordering conflict even when the revision is unchanged', async () => {
  for (const mutate of [
    phone => { phone.owner.name = '外部修改'; },
    phone => { phone.memos.reverse(); },
  ]) {
    const {store, storage} = await ready(new ReorderedStorage());
    await call(store, 'write_memo', {record_json: {id: 'first', title: '一'}});
    await call(store, 'write_memo', {record_json: {id: 'second', title: '二'}});
    const external = await storage.get(PHONE_STORAGE_KEY), revision = external.roles['role-a'].revision;
    mutate(external.roles['role-a']); storage.data.set(PHONE_STORAGE_KEY, reorderedJson(external, true));
    const writes = storage.writes.length;
    await assert.rejects(call(store, 'write_memo', {record_json: {title: '过时写入'}}), errorCode('storage_conflict'));
    assert.equal(storage.writes.length, writes);
    assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles['role-a'].revision, revision);
    assert.equal(canonicalJson(await storage.get(PHONE_STORAGE_KEY)), canonicalJson(external));
  }
});

test('all five chat message types deduplicate; conflicting IDs and contact misuse are rejected', async () => {
  const {store, storage} = await ready();
  const messages = [{id: 'text', text: '文字', from: 'them'}, {id: 'voice', type: 'voice', duration: 3}, {id: 'image', type: 'image', text: '图片说明'}, {id: 'transfer', type: 'transfer', amount: 12.5}, {id: 'system', type: 'system', text: '提示'}];
  for (const message of messages) {
    const args = {chat_id: 'friend', message_json: message}; await call(store, 'write_chat', args);
    const writes = storage.writes.length, revision = store.snapshot('role-a').revision;
    assert.equal((await call(store, 'write_chat', args)).duplicate, true);
    assert.equal(store.snapshot('role-a').revision, revision); assert.equal(storage.writes.length, writes);
  }
  await call(store, 'set_contact', {chat_id: 'friend', profile_json: {name: '朋友', remark: '备注', relation: '同学'}});
  const chat = store.snapshot('role-a').wechat.chats[0]; assert.equal(chat.messages.length, 5); assert.equal(chat.unread, 1); assert.equal(chat.remark, '备注');
  await assert.rejects(call(store, 'write_chat', {chat_id: 'friend', message_json: {id: 'text', text: '替换'}}), errorCode('id_conflict'));
  for (const bad of [{type: 'voice', duration: 0}, {type: 'image'}, {type: 'system', text: ''}, {type: 'payment'}, {text: '无效', from: 'unknown'}, {type: 'transfer', amount: -1}]) await assert.rejects(call(store, 'write_chat', {chat_id: 'friend', message_json: bad}));
  await assert.rejects(call(store, 'set_contact', {chat_id: 'friend', profile_json: {messages: []}}));
});

test('ledger cents are exact and summaries include all matches despite pagination', async () => {
  const {store} = await ready();
  for (const record of [{title: '收入一', type: 'income', amount: .1}, {title: '收入二', type: 'income', amount: .2}, {title: '支出', type: 'expense', amount: .05}])
    await call(store, 'write_ledger', {record_json: {...record, date: '2026-10-25'}});
  const result = await call(store, 'read', {module: 'ledger.entries', limit: 1});
  assert.deepEqual(result.summary, {income_cents: 30, expense_cents: 5, balance_cents: 25, count: 3, currency: 'CNY'});
  assert.equal((await call(store, 'read', {module: 'ledger.entries', query: '收入', limit: 1})).summary.balance_cents, 30);
  const first = store.snapshot('role-a').ledger.entries[0]; await call(store, 'write_ledger', {record_json: {id: first.id, amount: .15}});
  assert.equal(store.snapshot('role-a').ledger.entries[0].amount_cents, 15);
  const portable = JSON.parse(store.exportArchive('role-a'));
  assert.equal('amount_cents' in portable.ledger.entries[0], false);
  const restored = await ready(); await restored.store.importArchive('role-a', JSON.stringify(portable));
  assert.equal(restored.store.snapshot('role-a').ledger.entries[0].amount_cents, 15);
  for (const amount of [0, -.1, .001, NaN, Infinity, 1000000001]) await assert.rejects(call(store, 'write_ledger', {record_json: {title: '无效', type: 'expense', amount, date: '2026-10-25'}}));
  await assert.rejects(call(store, 'write_ledger', {record_json: {title: '不一致', type: 'expense', amount: .1, amount_cents: 20, date: '2026-10-25'}}));
});

test('music identity, comment propagation and switching never overwrite another song ID', async () => {
  const {store} = await ready();
  await call(store, 'write_music', {record_json: {id: 'track', title: '歌一', artist: '歌手', comment: '手记'}});
  await assert.rejects(call(store, 'write_music', {record_json: {id: 'track', title: '歌二'}}), errorCode('id_conflict'));
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {id: 'track', title: '歌一', artist: '歌手', playing: true}});
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {comment: '同步笔记'}});
  assert.equal(store.snapshot('role-a').music.playlist[0].comment, '同步笔记');
  await assert.rejects(call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {artist: '作者二'}}), errorCode('stale_music'));
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {id: 'track', title: '歌二', artist: '作者二'}});
  assert.notEqual(store.snapshot('role-a').music.nowPlaying.id, 'track'); assert.equal(store.snapshot('role-a').music.nowPlaying.comment, '');
  assert.equal(store.snapshot('role-a').music.playlist[0].title, '歌一');
});

test('music delegate handles standard and service tracks, errors, and cancellation after awaiting', async () => {
  const {store} = await ready();
  await assert.rejects(call(store, 'search_music', {keywords: '歌'}), errorCode('music_unconfigured'));
  store.musicHandler = async action => action === 'music_search' ? {results: [{songId: '10'}]} : {track: {id: 10, title: '歌', artists: [{name: '甲'}, '乙'], durationMs: 123000, album: '专辑', cover: 'https://example.com/cover.jpg'}, url: 'https://example.com/audio.mp3'};
  const search = await call(store, 'search_music', {keywords: '歌'}); assert.equal(search.results[0].songId, '10'); assert.equal(store.snapshot('role-a').revision, 0);
  await call(store, 'play_music', {song_id: '10'});
  const current = store.snapshot('role-a').music.nowPlaying;
  assert.equal(current.songId, '10'); assert.equal(current.artist, '甲 / 乙'); assert.equal(current.duration, 123); assert.equal(current.id, 'ncm_10');
  await call(store, 'play_music', {song_id: '10'}); assert.equal(store.snapshot('role-a').music.playlist.length, 1);
  const before = store.exportArchive('role-a'); let allowed = true;
  store.musicHandler = async () => { allowed = false; return {track: {songId: '11', title: '新歌', artist: '丙'}}; };
  await assert.rejects(call(store, 'play_music', {song_id: '11'}, 'role-a', {mayCommit: () => allowed}), errorCode('cancelled'));
  assert.equal(store.exportArchive('role-a'), before);
  store.musicHandler = async () => ({success: false, error: '服务失败'});
  await assert.rejects(call(store, 'play_music', {song_id: '11'}), errorCode('music_unavailable'));
});

test('real music selection reuses an imported song ID and preserves notes across switching', async () => {
  const {store} = await ready();
  await call(store, 'write_music', {record_json: {id: 'legacy-song', title: '旧歌', artist: '旧作者', songId: '100', comment: '不能丢失的手记'}});
  store.musicHandler = async (_action, args) => ({track: {songId: args.song_id, title: args.song_id === '100' ? '旧歌' : '新歌', artist: args.song_id === '100' ? '旧作者' : '新作者'}, url: 'https://example.com/track.mp3'});
  await call(store, 'play_music', {song_id: '100'});
  assert.equal(store.snapshot('role-a').music.nowPlaying.id, 'legacy-song');
  assert.equal(store.snapshot('role-a').music.nowPlaying.comment, '不能丢失的手记');
  await call(store, 'play_music', {song_id: '101'}); await call(store, 'play_music', {song_id: '100'});
  assert.equal(store.snapshot('role-a').music.playlist.length, 2);
  assert.equal(store.snapshot('role-a').music.nowPlaying.comment, '不能丢失的手记');
  assert.equal(store.snapshot('role-a').music.playlist.find(song => song.songId === '100').comment, '不能丢失的手记');
});

test('media references, optimistic image conflict, and missing records preserve IDs', async () => {
  const {store} = await ready(), uri = `skivu-phone-image:${'f'.repeat(64)}`;
  await call(store, 'write_photo', {record_json: {id: 'photo', caption: '照片', src: uri}});
  await assert.rejects(store.invoke('image_apply', {path: 'photos', id: 'photo', expected_image: 'old', value: 'https://example.com/new.png'}, {roleId: 'role-a'}), errorCode('image_conflict'));
  await store.invoke('image_apply', {path: 'photos', id: 'photo', expected_image: uri, value: 'https://example.com/new.png'}, {roleId: 'role-a'});
  assert.equal(store.snapshot('role-a').photos[0].id, 'photo');
  await assert.rejects(store.invoke('image_apply', {path: 'photos', id: 'missing', expected_image: '', value: uri}, {roleId: 'role-a'}), errorCode('record_missing'));
  for (const src of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:password@example.com/image.png']) await assert.rejects(call(store, 'write_photo', {record_json: {caption: '无效', src}}));
});

test('all known scalar, date, array, nested and sun location validations reject invalid writes', async () => {
  const {store, storage} = await ready();
  const bad = [
    ['events', {title: '日程', date: '2026-02-30'}], ['books', {title: '书', progress: 1.1}],
    ['photos', {caption: '照片', tint: ['red', '#abc']}], ['map.current', {name: '地点', x: 101}],
    ['music.playlist', {title: '歌', duration: -1}],
    ['wechat.moments', {text: '动态', comments: [{name: '甲'}]}],
    ['meituan.orders', {shop: '餐厅', items: [{name: '面', qty: 0, price: 1}]}],
    ['flight.flights', {no: 'AA', date: '2026-10-25', from: {city: '甲'}, to: {city: '乙'}}],
    ['xiachufang.recipes', {title: '饭', ingredients: [{name: ''}]}], ['douban.items', {title: '电影', rating: 6}],
    ['sun.location', {city: '上海', latitude: 100, longitude: 10, timezone: 'Asia/Shanghai'}],
    ['sun.location', {city: '上海', latitude: 0, longitude: 0, timezone: 'Asia/NoSuchPlace'}],
    ['memos', {title: '备忘', pinned: 'yes'}], ['xiachufang.recipes', {title: '饭', steps: [1]}], ['memos', {title: '备忘', unknown: true}],
  ];
  for (const [path, record] of bad) await assert.rejects(store.invoke('upsert', {path, record}, {roleId: 'role-a'}), undefined, path);
  assert.equal(storage.writes.length, 0);
});

test('unknown tools, actions, prototype keys and hostile object shapes cannot reach storage', async () => {
  const {store, storage} = await ready();
  for (const tool of ['read', 'transact', '__proto__', 'constructor', 'character_phone_core.delete_all']) await assert.rejects(store.invoke(tool, {}, {roleId: 'role-a'}));
  for (const path of ['constructor', '__proto__', 'owner.__proto__', '../../archive', 'memos.constructor']) await assert.rejects(store.invoke('upsert', {path, record: {title: '攻击'}}, {roleId: 'role-a'}));
  await assert.rejects(call(store, 'write_memo', {action: 'delete_all', record_json: {title: '未知action'}}));
  for (const id of ['', '__proto__', 'constructor', 'prototype']) await assert.rejects(call(store, 'write_memo', {record_json: {title: '攻击'}}, id));
  await assert.rejects(call(store, 'write_memo', {record_json: '{"title":"攻击","__proto__":{"polluted":true}}'}));
  const values = [Object.create({title: '继承'}), {title: '未定义', extra: undefined}, {title: '日期', extra: new Date()}];
  const getter = {title: '访问器'}; Object.defineProperty(getter, 'extra', {enumerable: true, get() { throw new Error('getter must not run'); }}); values.push(getter);
  const array = []; array.constructor = 'overridden'; values.push({title: '数组', extra: array});
  for (const record of values) await assert.rejects(call(store, 'write_memo', {record_json: record}));
  assert.equal({}.polluted, undefined); assert.equal(storage.writes.length, 0);
});

test('six MiB archive bound uses UTF-8 bytes and failed growth preserves earlier records', async () => {
  const {store, storage} = await ready();
  const large = '字'.repeat(750000);
  await call(store, 'write_memo', {record_json: {title: '一', content: large}});
  await call(store, 'write_memo', {record_json: {title: '二', content: large}});
  const before = copy(storage.data.get(PHONE_STORAGE_KEY));
  await assert.rejects(call(store, 'write_memo', {record_json: {title: '三', content: large}}), errorCode('archive_too_large'));
  assert.equal(store.snapshot('role-a').memos.length, 2); assert.deepEqual(storage.data.get(PHONE_STORAGE_KEY), before);
  assert.ok(new TextEncoder().encode(JSON.stringify(before)).byteLength < PHONE_ARCHIVE_LIMIT);
  await assert.rejects(store.importArchive('role-b', ' '.repeat(PHONE_ARCHIVE_LIMIT + 1)), errorCode('archive_too_large'));
});

test('original read metadata preserves field, module, write-tool and schema-version types', async () => {
  const {store} = await ready();
  const overview = await call(store, 'read');
  assert.ok(overview.modules.every(path => typeof path === 'string'));
  assert.ok(overview.apps.every(app => typeof app.id === 'string' && Array.isArray(app.collections)));
  assert.equal(overview.tool_schema_version, '1.5.2'); assert.match(overview.guidance, /模拟/);
  assert.deepEqual(overview.write_tools, phoneWriteTools);
  assert.equal('music.nowPlaying' in overview.counts, false);
  for (const [path, spec] of Object.entries(phoneCollections)) {
    const result = await call(store, 'read', {module: path});
    assert.equal(result.fields, spec.fields.join(' '), path);
    assert.deepEqual(result.field_names, spec.fields, path);
    assert.deepEqual(result.example, phoneExamples[path], path);
    assert.equal(result.tool_schema_version, '1.5.2');
    if (Object.hasOwn(phoneWriteTools, path.split('.')[0])) assert.deepEqual(result.write_tool, phoneWriteTools[path.split('.')[0]], path);
    else assert.equal('write_tool' in result, false);
    await store.invoke('upsert', {path, record: result.example}, {roleId: 'examples'});
  }
  assert.equal(overview.write_tools.xiaoyuzhou.compatible_tool, 'character_phone_core.character_phone_write_podcast');
});

test('all 23 write-tool default collections match the original wrapper, including empty collection fallback', async () => {
  const {store} = await ready();
  const defaults = {
    memo: 'memos', event: 'events', browser: 'browser.tabs', taobao: 'taobao.cart', youtube: 'youtube.history', pornhub: 'pornhub.history',
    book: 'books', photo: 'photos', music: 'music.playlist', map: 'map.places', moment: 'wechat.moments', flight: 'flight.flights',
    bilibili: 'bilibili.history', instagram: 'instagram.posts', meituan: 'meituan.orders', podcast: 'xiaoyuzhou.episodes', recipe: 'xiachufang.recipes',
    xiaoyuzhou: 'xiaoyuzhou.episodes', xiachufang: 'xiachufang.recipes', douban: 'douban.items', xianyu: 'xianyu.items', weibo: 'weibo.posts', ledger: 'ledger.entries',
  };
  for (const [suffix, path] of Object.entries(defaults)) {
    assert.equal((await call(store, `write_${suffix}`, {record_json: sample(path)})).path, path, suffix);
    assert.equal((await call(store, `write_${suffix}`, {collection: '', record_json: sample(path)})).path, path, `${suffix}: empty default`);
  }
});

test('initial defaults, first caller backfill, profile routing and owner placeholders retain original semantics', async () => {
  const {store} = await ready();
  const fresh = store.snapshot('role-a');
  assert.equal(fresh.owner.battery, 78); assert.equal(fresh.wechat.me.color, '#9fb6da');
  for (const target of ['wechat', 'bilibili', 'instagram']) assert.equal(target === 'wechat' ? fresh.wechat.me.name : fresh[target].profile.name, '{{owner}}');
  await store.invoke('character_phone_read', {}, {roleId: 'role-a', caller: '只读不能写机主'});
  assert.equal(store.snapshot('role-a').owner.name, '');
  await store.invoke('character_phone_write_memo', {record_json: {title: '首次记录'}}, {roleId: 'role-a', caller: ' 第一位机主 '});
  assert.equal(store.snapshot('role-a').owner.name, '第一位机主');
  await store.invoke('character_phone_write_memo', {record_json: {title: '第二次记录'}}, {roleId: 'role-a', caller: '其他调用者'});
  assert.equal(store.snapshot('role-a').owner.name, '第一位机主');
  await call(store, 'set_profile', {target: '', profile_json: {avatar: 'https://example.com/owner.png'}});
  assert.equal(store.snapshot('role-a').wechat.me.avatar, 'https://example.com/owner.png');
  assert.equal(store.snapshot('role-a').wechat.me.name, '{{owner}}');
  await call(store, 'set_profile', {target: 'wechat', profile_json: {cover: 'https://example.com/cover.png', name: '独立昵称'}});
  assert.equal(store.snapshot('role-a').wechat.cover, 'https://example.com/cover.png'); assert.equal('cover' in store.snapshot('role-a').wechat.me, false);
  assert.equal(store.snapshot('role-a').owner.name, '第一位机主'); assert.equal(store.snapshot('role-a').wechat.me.name, '独立昵称');
  await call(store, 'set_profile', {profile_json: {}}, 'empty-profile');
  assert.equal(store.snapshot('empty-profile').owner.name, '测试角色');
});

test('set_contact returns original chat_id and profile without messages while preserving modern record receipt', async () => {
  const {store} = await ready();
  await call(store, 'write_chat', {chat_id: 'friend', message_json: {id: 'first', text: '消息'}});
  const result = await call(store, 'set_contact', {chat_id: 'friend', profile_json: {remark: '备注', relation: '朋友'}});
  assert.equal(result.chat_id, 'friend'); assert.equal(result.profile.remark, '备注'); assert.equal(result.profile.relation, '朋友');
  assert.equal('messages' in result.profile, false); assert.equal(result.record.messages.length, 1); assert.equal(result.created, false);
});

test('duplicate message retries may keep or update contact info without duplicating unread messages', async () => {
  const {store, storage} = await ready();
  const args = {chat_id: 'friend', chat_json: {name: '朋友'}, message_json: {id: 'same', text: '一次消息', from: 'them', time: ''}};
  await call(store, 'write_chat', args); const revision = store.snapshot('role-a').revision, writes = storage.writes.length;
  const duplicate = await call(store, 'write_chat', args);
  assert.equal(duplicate.duplicate, true); assert.equal(store.snapshot('role-a').revision, revision); assert.equal(storage.writes.length, writes);
  const updated = await call(store, 'write_chat', {...args, chat_json: {remark: '新备注'}});
  assert.equal(updated.duplicate, true); assert.equal(updated.contact_updated, true); assert.equal(updated.revision, revision + 1);
  assert.equal(store.snapshot('role-a').wechat.chats[0].messages.length, 1); assert.equal(store.snapshot('role-a').wechat.chats[0].unread, 1);
  const receipts = await store.invokeBatch([{tool: 'character_phone_write_chat', arguments: {...args, chat_json: {relation: '同事'}}}], {roleId: 'role-a', expectedRevision: revision + 1});
  assert.equal(receipts[0].contact_updated, true); assert.equal(receipts[0].revision, revision + 2);
  assert.equal(store.snapshot('role-a').wechat.chats[0].remark, '新备注');
});

test('empty optional chat fields use original defaults and mark_read is an internal atomic operation', async () => {
  const {store} = await ready();
  const result = await call(store, 'write_chat', {chat_id: '', message_json: {id: '', from: '', type: '', text: '默认消息', time: ''}});
  const chat = store.snapshot('role-a').wechat.chats[0];
  assert.equal(chat.name, '新聊天'); assert.equal(chat.avatar, ''); assert.equal(chat.color, '#9fb6da');
  assert.equal(result.message.from, 'me'); assert.equal(result.message.type, 'text'); assert.match(result.message.time, /^\d{2}:\d{2}$/);
  await call(store, 'write_chat', {chat_id: chat.id, message_json: {id: 'incoming', text: '未读消息', from: 'them'}});
  const revision = store.snapshot('role-a').revision;
  const receipt = await store.invoke('mark_read', {chat_id: chat.id, expected_revision: revision}, {roleId: 'role-a'});
  assert.equal(receipt.chat_id, chat.id); assert.equal(receipt.revision, revision + 1); assert.equal(store.snapshot('role-a').wechat.chats[0].unread, 0);
  assert.equal(pocketPhoneToolNames.includes('mark_read'), false);
  await assert.rejects(store.invoke('mark_read', {chat_id: chat.id, expected_revision: revision}, {roleId: 'role-a'}), errorCode('revision_conflict'));
  await assert.rejects(store.invoke('mark_read', {chat_id: 'missing'}, {roleId: 'role-a'}), errorCode('record_missing'));
});

test('singleton replacement, title-only song selection and incomplete duration match accepted original state', async () => {
  const {store} = await ready();
  await call(store, 'write_map', {collection: 'map.current', record_json: {id: 'place-a', name: '甲地', x: 10}});
  await call(store, 'write_map', {collection: 'map.current', record_json: {id: 'place-b', name: '乙地'}});
  assert.equal(store.snapshot('role-a').map.current.id, 'place-b'); assert.equal(store.snapshot('role-a').map.current.x, 10);
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {id: 'song-a', title: '甲曲', artist: '甲作者', songId: '10', comment: '旧手记'}});
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {title: '乙曲'}});
  const selected = store.snapshot('role-a').music.nowPlaying;
  assert.equal(selected.title, '乙曲'); assert.equal('artist' in selected, false); assert.equal('songId' in selected, false); assert.equal(selected.comment, ''); assert.equal(selected.provider, 'local');
  await call(store, 'write_music', {record_json: {title: '时长尚未同步', duration: 0, position: 25}});
  assert.equal(store.snapshot('role-a').music.playlist[0].position, 25);
});

test('original flight endpoint extension fields survive import, edits and export', async () => {
  const {store} = await ready();
  const flight = {id: 'flight', no: 'XX1', date: '2026-10-25', from: {city: '甲地', code: 'AAA', time: '08:00', terminal: 'T1', coordinates: [1, 2]}, to: {city: '乙地', code: 'BBB', time: '10:00', airport: {label: '航站'}}};
  await store.importArchive('role-a', JSON.stringify({schema: 1, flight: {flights: [flight]}}));
  await call(store, 'write_flight', {record_json: {id: 'flight', note: '保留扩展'}});
  assert.deepEqual(store.snapshot('role-a').flight.flights[0].from.coordinates, [1, 2]);
  assert.deepEqual(JSON.parse(store.exportArchive('role-a')).flight.flights[0].to.airport, {label: '航站'});
});

test('explicit legacy import may omit schema without weakening internal archive corruption checks', async () => {
  const {store, storage} = await ready();
  await store.importArchive('role-a', JSON.stringify({owner: {name: '旧格式机主'}, memos: [{id: 'memo', title: '旧格式记录'}]}));
  assert.equal(store.snapshot('role-a').schema, 1); assert.equal(store.snapshot('role-a').owner.name, '旧格式机主');
  await assert.rejects(store.importArchive('role-a', '{}'), errorCode('unsupported_schema'));
  const damaged = copy(storage.data.get(PHONE_STORAGE_KEY)); delete damaged.roles['role-a'].schema; storage.data.set(PHONE_STORAGE_KEY, damaged);
  const reload = new PocketPhoneStore({storage}); await assert.rejects(reload.restore(), errorCode('archive_corrupt'));
});

test('safe JSON-valued fields accepted by the original runtime survive import and unrelated edits', async () => {
  const {store} = await ready();
  const legacy = {schema: 1,
    books: [{id: 'book', title: '旧书', quotes: [{text: '结构化摘录'}, 3]}],
    pornhub: {history: [{id: 'private', title: '私密记录', tags: [1, {label: '分类'}]}]},
    wechat: {moments: [{id: 'moment', text: '旧动态', likes: [{name: '甲'}, 2]}], chats: [{id: 'friend', name: '朋友', messages: [{id: 'voice', type: 'voice', duration: 3, from: 'me', text: 123, name: {label: '显示信息'}, tint: 'legacy-decoration', time: 12345, avatar: null}]}]},
    instagram: {posts: [{id: 'post', caption: '帖子', likes: -2, tint: ['#12345', '#1234567']}]},
    bilibili: {profile: {fans: -1, likes: 1e20}},
    music: {playlist: [{id: 'track', title: '歌曲', artist: {label: '旧作者数据'}, comment: {text: '结构化手记'}, duration: 0, position: 20}]},
  };
  await store.importArchive('role-a', JSON.stringify(legacy));
  await call(store, 'write_book', {record_json: {id: 'book', note: '保留旧字段'}});
  await call(store, 'write_music', {record_json: {id: 'track', playing: false}});
  const exported = JSON.parse(store.exportArchive('role-a'));
  assert.deepEqual(exported.books[0].quotes, legacy.books[0].quotes);
  assert.deepEqual(exported.pornhub.history[0].tags, legacy.pornhub.history[0].tags);
  assert.deepEqual(exported.wechat.moments[0].likes, legacy.wechat.moments[0].likes);
  assert.deepEqual(exported.wechat.chats[0].messages, legacy.wechat.chats[0].messages);
  assert.equal(exported.instagram.posts[0].likes, -2); assert.deepEqual(exported.instagram.posts[0].tint, legacy.instagram.posts[0].tint);
  assert.deepEqual(exported.music.playlist[0].artist, legacy.music.playlist[0].artist); assert.deepEqual(exported.music.playlist[0].comment, legacy.music.playlist[0].comment);
  assert.equal(exported.bilibili.profile.likes, 1e20);
  const all = await call(store, 'read', {module: 'books', record_id: '', query: ''}); assert.equal(all.total, 1);
});

test('real selection preserves a nowPlaying-only comment and the delegated or existing song ID', async () => {
  const {store} = await ready();
  await call(store, 'write_music', {collection: 'music.nowPlaying', record_json: {id: 'current-only', title: '当前曲目', artist: '作者', songId: '200', comment: '仅在播放页的手记'}});
  store.musicHandler = async (_action, args) => ({track: {id: `ncm_${args.song_id}`, songId: args.song_id, title: args.song_id === '200' ? '当前曲目' : '另一曲目', artist: '作者'}, url: 'https://example.com/song.mp3'});
  await call(store, 'play_music', {song_id: '200'});
  assert.equal(store.snapshot('role-a').music.nowPlaying.comment, '仅在播放页的手记');
  assert.equal(store.snapshot('role-a').music.playlist[0].comment, '仅在播放页的手记');
  assert.equal(store.snapshot('role-a').music.playlist[0].id, 'current-only');
  await call(store, 'play_music', {song_id: '201'});
  assert.equal(store.snapshot('role-a').music.nowPlaying.id, 'ncm_201');
  const reply = await call(store, 'read', {module: 'music.nowPlaying'}); assert.equal(reply.data.id, 'ncm_201');
});
