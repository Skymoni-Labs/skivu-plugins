// SPDX-License-Identifier: GPL-3.0-only
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PocketPhoneStore, PHONE_STORAGE_KEY, PHONE_BACKUP_KEY} from '../../plugins/pocket-phone/engine.js';
import {ScopedPocketPhoneStore, SHARED_POCKET_PHONE_ROLE_ID} from '../../plugins/pocket-phone/scoped-store.js';

class Storage {
  constructor() { this.data = new Map(); this.writes = []; this.beforeGet = null; this.beforeSet = null; }
  async get(key) { if (this.beforeGet) await this.beforeGet(key); return structuredClone(this.data.get(key) ?? null); }
  async set(key, value) { if (this.beforeSet) await this.beforeSet(key, value); this.data.set(key, structuredClone(value)); this.writes.push(key); return true; }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
async function fixture() {
  const storage = new Storage(), delegate = new PocketPhoneStore({storage});
  let mode = 'role';
  const phone = new ScopedPocketPhoneStore(delegate, {getMode: () => mode});
  await phone.restore();
  return {storage, delegate, phone, setMode: value => { mode = value; }};
}
const memo = (phone, title, roleId = 'role-a', extra = {}) => phone.invoke('character_phone_write_memo', {record_json: {title}}, {roleId, ...extra});
const isCancelled = error => error?.code === 'cancelled';

test('role is the default scope and retains the existing role archive unchanged', async () => {
  const storage = new Storage(), delegate = new PocketPhoneStore({storage});
  await delegate.restore(); await memo(delegate, '旧角色数据');
  const prior = structuredClone(storage.data.get(PHONE_STORAGE_KEY)), writes = storage.writes.length;
  const phone = new ScopedPocketPhoneStore(delegate);
  assert.equal(phone.scopeKey, 'role'); assert.equal(phone.snapshot('role-a').memos[0].title, '旧角色数据');
  assert.equal(phone.snapshot('role-b').memos.length, 0);
  assert.deepEqual(storage.data.get(PHONE_STORAGE_KEY), prior); assert.equal(storage.writes.length, writes);
});

test('shared scope maps different real roles to one fixed phone without moving role data', async () => {
  const {phone, delegate, setMode, storage} = await fixture();
  await memo(phone, '甲角色私有', 'role-a'); await memo(phone, '乙角色私有', 'role-b');
  const roleA = phone.exportArchive('role-a'), roleB = phone.exportArchive('role-b');
  setMode('shared'); assert.equal(phone.scopeKey, 'shared'); assert.equal(phone.snapshot('role-a').memos.length, 0);
  assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles[SHARED_POCKET_PHONE_ROLE_ID], undefined);
  await memo(phone, '共享条目', 'role-a'); assert.equal(phone.snapshot('role-b').memos[0].title, '共享条目');
  await memo(phone, '共享第二条', 'role-b'); assert.equal(phone.snapshot('role-a').memos.length, 2);
  assert.equal(delegate.snapshot(SHARED_POCKET_PHONE_ROLE_ID).memos.length, 2);
  setMode('role'); assert.equal(phone.exportArchive('role-a'), roleA); assert.equal(phone.exportArchive('role-b'), roleB);
});

test('shared import/export and explicit role archive copy target only the selected scope', async () => {
  const {phone, setMode, delegate} = await fixture();
  await memo(phone, '供明确复制的记录'); const original = phone.exportArchive('role-a');
  setMode('shared'); await phone.importArchive('role-b', original);
  assert.equal(phone.snapshot('role-c').memos[0].title, '供明确复制的记录');
  assert.deepEqual(JSON.parse(phone.exportArchive('role-c')).memos, JSON.parse(original).memos);
  assert.equal(delegate.snapshot('role-b').memos.length, 0);
  setMode('role'); assert.equal(phone.exportArchive('role-a'), original); assert.equal(phone.snapshot('role-b').memos.length, 0);
});

test('shared batches retain atomic revision semantics across real roles', async () => {
  const {phone, setMode} = await fixture(); setMode('shared');
  const receipts = await phone.invokeBatch([
    {tool: 'character_phone_write_memo', arguments: {record_json: {title: '一'}}},
    {tool: 'character_phone_write_memo', arguments: {record_json: {title: '二'}}},
  ], {roleId: 'role-a', expectedRevision: 0});
  assert.deepEqual(receipts.map(row => row.revision), [1, 1]); assert.equal(phone.snapshot('role-b').memos.length, 2);
  await assert.rejects(phone.invokeBatch([{tool: 'character_phone_write_memo', arguments: {record_json: {title: '过时'}}}], {roleId: 'role-b', expectedRevision: 0}), error => error?.code === 'revision_conflict');
});

test('scope switch while queued cancels old-mode invocations and does not retarget them', async () => {
  const {phone, setMode, storage, delegate} = await fixture();
  const entered = deferred(), release = deferred();
  phone.musicHandler = async () => { entered.resolve(); await release.promise; return {track: {songId: '1', title: '晚到歌曲', artist: '作者'}, url: 'https://example.com/a.mp3'}; };
  const first = phone.invoke('character_phone_play_music', {song_id: '1'}, {roleId: 'role-a'});
  await entered.promise; const queued = memo(phone, '排队旧范围');
  const rejectedFirst = assert.rejects(first, isCancelled), rejectedQueued = assert.rejects(queued, isCancelled);
  setMode('shared'); release.resolve(); await Promise.all([rejectedFirst, rejectedQueued]);
  assert.equal(storage.writes.length, 0); assert.equal(delegate.snapshot('role-a').memos.length, 0); assert.equal(phone.snapshot('role-b').memos.length, 0);
  await memo(phone, '新范围记录', 'role-b'); assert.equal(phone.snapshot('role-a').memos[0].title, '新范围记录');
});

test('the caller mayCommit is combined with mode checks before validation and after awaiting storage', async () => {
  const {phone, storage} = await fixture();
  await assert.rejects(memo(phone, '调用方取消', 'role-a', {mayCommit: () => false}), isCancelled); assert.equal(storage.writes.length, 0);
  await memo(phone, '原记录'); const before = phone.exportArchive('role-a'); let allowed = true;
  storage.beforeSet = async key => { if (key === PHONE_BACKUP_KEY) allowed = false; };
  await assert.rejects(memo(phone, '备份后取消', 'role-a', {mayCommit: () => allowed}), isCancelled);
  assert.equal(phone.exportArchive('role-a'), before); assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles['role-a'].memos.length, 1);
});

test('import without an engine mayCommit hook is cancelled at the storage adapter before primary set', async () => {
  const {phone, setMode, storage, delegate} = await fixture();
  await memo(phone, '不可覆盖'); const before = phone.exportArchive('role-a');
  const entered = deferred(), release = deferred();
  storage.beforeSet = async key => { if (key === PHONE_BACKUP_KEY) { entered.resolve(); await release.promise; } };
  const importing = phone.importArchive('role-a', JSON.stringify({schema: 1, memos: [{id: 'replacement', title: '迟到导入'}]}));
  const rejected = assert.rejects(importing, isCancelled); await entered.promise; setMode('shared'); release.resolve(); await rejected;
  assert.equal(delegate.exportArchive('role-a'), before); assert.equal(phone.snapshot('role-b').memos.length, 0);
  assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles['role-a'].memos[0].title, '不可覆盖');
  assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles[SHARED_POCKET_PHONE_ROLE_ID], undefined);
});

test('import captures mode before facade queueing and supports a caller cancellation guard', async () => {
  const {phone, setMode, storage} = await fixture();
  const entered = deferred(), release = deferred();
  phone.musicHandler = async () => { entered.resolve(); await release.promise; return {track: {songId: '1', title: '曲', artist: '作者'}}; };
  const waiting = phone.invoke('character_phone_play_music', {song_id: '1'}, {roleId: 'role-a'}); await entered.promise;
  const importing = phone.importArchive('role-b', JSON.stringify({schema: 1, owner: {name: '迟到机主'}}));
  const rejectedWaiting = assert.rejects(waiting, isCancelled), rejectedImport = assert.rejects(importing, isCancelled);
  setMode('shared'); release.resolve(); await Promise.all([rejectedWaiting, rejectedImport]);
  assert.equal(storage.writes.length, 0); assert.equal(phone.snapshot('role-a').owner.name, '');
  await assert.rejects(phone.importArchive('role-a', '{"schema":1}', {mayCommit: () => false}), isCancelled);
});

test('only this delegate adapter is guarded; independent journal storage is never blocked', async () => {
  const {phone, setMode, storage, delegate} = await fixture(); const originalGet = storage.get, originalSet = storage.set;
  await memo(phone, '原记录');
  const entered = deferred(), release = deferred();
  storage.beforeSet = async key => { if (key === PHONE_BACKUP_KEY) { entered.resolve(); await release.promise; } };
  const importing = phone.importArchive('role-a', '{"schema":1,"owner":{"name":"晚到"}}'); const rejected = assert.rejects(importing, isCancelled);
  await entered.promise; setMode('shared');
  await storage.set('conversation.journal.independent', {text: '不受手机模式guard影响'});
  release.resolve(); await rejected;
  assert.deepEqual(await storage.get('conversation.journal.independent'), {text: '不受手机模式guard影响'});
  assert.equal(storage.get, originalGet); assert.equal(storage.set, originalSet); assert.notEqual(delegate.storage, storage);
});

test('restore, subscriptions, music delegate, error and busy remain delegated and queue inputs are copied', async () => {
  const {phone, delegate} = await fixture(); assert.equal(await phone.restore(), phone);
  let notifications = 0; const unsubscribe = phone.subscribe(() => notifications++);
  const handler = async () => ({results: []}); phone.musicHandler = handler; assert.equal(delegate.musicHandler, handler); assert.equal(phone.musicHandler, handler);
  phone.error = '示例错误'; assert.equal(delegate.error, '示例错误'); assert.equal(phone.busy, delegate.busy);
  const args = {record_json: {title: '原入队参数'}}; const pending = phone.invoke('character_phone_write_memo', args, {roleId: 'role-a'}); args.record_json.title = '入队后修改'; await pending;
  assert.equal(phone.snapshot('role-a').memos[0].title, '原入队参数'); assert.ok(notifications > 0);
  const count = notifications; unsubscribe(); await memo(phone, '后续'); assert.equal(notifications, count);
});

test('scope queue does not launder invalid JSON prototypes, accessors, holes or non-finite values', async () => {
  const {phone, storage} = await fixture();
  const inherited = Object.create({title: '继承'}); inherited.title = '自有标题';
  const getter = {title: '访问器'}; Object.defineProperty(getter, 'content', {enumerable: true, get() { throw new Error('getter must not run'); }});
  for (const record of [inherited, getter, {title: '非有限', content: NaN}, {title: '空项', content: Array(1)}, JSON.parse('{"title":"非法键","__proto__":{"bad":true}}')]) {
    await assert.rejects(phone.invoke('character_phone_write_memo', {record_json: record}, {roleId: 'role-a'}));
  }
  assert.equal(storage.writes.length, 0);
});

test('recoverBackup captures scope and can be cancelled before restoring primary', async () => {
  const {phone, storage, setMode} = await fixture(); await memo(phone, '第一代'); await memo(phone, '第二代');
  const before = phone.exportArchive('role-a'), entered = deferred(), release = deferred();
  storage.beforeGet = async key => { if (key === PHONE_BACKUP_KEY) { entered.resolve(); await release.promise; } };
  const recovering = phone.recoverBackup(); const rejected = assert.rejects(recovering, isCancelled); await entered.promise;
  setMode('shared'); release.resolve(); await rejected;
  assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles['role-a'].memos.length, 2);
  setMode('role'); assert.equal(phone.exportArchive('role-a'), before);
  storage.beforeGet = null; assert.equal(await phone.recoverBackup(), phone); assert.equal(phone.snapshot('role-a').memos.length, 1);
});

test('a validated batch cannot publish partial role data after a mode switch during backup', async () => {
  const {phone, storage, setMode, delegate} = await fixture(); await memo(phone, '原记录');
  const entered = deferred(), release = deferred(), before = phone.exportArchive('role-a');
  storage.beforeSet = async key => { if (key === PHONE_BACKUP_KEY) { entered.resolve(); await release.promise; } };
  const updating = phone.invokeBatch([
    {tool: 'character_phone_write_memo', arguments: {record_json: {title: '不应保存一'}}},
    {tool: 'character_phone_write_memo', arguments: {record_json: {title: '不应保存二'}}},
  ], {roleId: 'role-a', expectedRevision: 1});
  const rejected = assert.rejects(updating, isCancelled); await entered.promise; setMode('shared'); release.resolve(); await rejected;
  assert.equal(delegate.exportArchive('role-a'), before); assert.equal(phone.snapshot('role-b').memos.length, 0);
});

test('an atomic set already sent to the host cannot be revoked, but never changes its captured destination', async () => {
  const {phone, storage, setMode, delegate} = await fixture();
  const entered = deferred(), release = deferred();
  storage.beforeSet = async key => { if (key === PHONE_STORAGE_KEY) { entered.resolve(); await release.promise; } };
  const writing = memo(phone, '已发送的原子写', 'role-a');
  await entered.promise; setMode('shared'); release.resolve(); await writing;
  assert.equal(delegate.snapshot('role-a').memos[0].title, '已发送的原子写');
  assert.equal(phone.snapshot('role-b').memos.length, 0);
  assert.equal(storage.data.get(PHONE_STORAGE_KEY).roles[SHARED_POCKET_PHONE_ROLE_ID], undefined);
});
