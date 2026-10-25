// SPDX-License-Identifier: GPL-3.0-only
// Independently authored Skivu phone engine, ported from our Dart prototype.
// Tool and schema names retain the observed 1.5.2 compatibility interface.
// No reference package runtime, styles, SVG, or presentation text is included.
import {phoneModules, phoneCollections, pocketPhoneToolNames, phoneExamples, phoneWriteTools} from './collections.js';
import {canonicalJson} from './json-state.js';

export const PHONE_ARCHIVE_LIMIT = 6 * 1024 * 1024;
export const PHONE_STORAGE_KEY = 'pocket-phone.archive.v1';
export const PHONE_BACKUP_KEY = `${PHONE_STORAGE_KEY}.backup`;
export const PHONE_DAMAGED_KEY = `${PHONE_STORAGE_KEY}.damaged`;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.hasOwn(value, key);
const now = () => new Date().toISOString();
const byteLength = text => new TextEncoder().encode(text).byteLength;

export class PocketPhoneError extends Error {
  constructor(code, message) { super(message); this.name = 'PocketPhoneError'; this.code = code; }
}
const fail = (message, code = 'invalid_arguments') => { throw new PocketPhoneError(code, message); };

function object(value, label = '数据') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label}需要JSON对象`);
  return value;
}

// Validate before copying: JSON.stringify alone silently loses non-finite
// numbers, undefined properties and unsupported object types.
function clean(value, depth = 0) {
  if (depth > 16) fail('数据嵌套层数过多');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('数字必须是有限值'); return; }
  if (typeof value === 'string') { if (value.length > 800000) fail('单个文字或图片字段过大'); return; }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail('数组原型不受支持');
    if (value.length > 10000) fail('单个数组最多10000项');
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      if (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key)) fail('数组包含非JSON属性');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) fail('数组项必须是普通JSON数据');
    }
    for (let index = 0; index < value.length; index++) {
      if (!own(value, index)) fail('数组不能包含空项');
      clean(value[index], depth + 1);
    }
    return;
  }
  object(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || forbiddenKeys.has(key)) fail('数据包含禁止的属性名称');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) fail('数据属性必须是普通JSON字段');
    clean(descriptor.value, depth + 1);
  }
}

function clone(value) { clean(value); return JSON.parse(JSON.stringify(value)); }
function argumentObject(value, label) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { fail(`${label}不是有效JSON`); }
  }
  object(value, label); clean(value); return clone(value);
}
function parseRaw(raw) {
  if (typeof raw === 'string') {
    if (byteLength(raw) > PHONE_ARCHIVE_LIMIT) fail('存档超过6MiB', 'archive_too_large');
    try { raw = JSON.parse(raw); } catch { fail('存档JSON无法读取', 'archive_corrupt'); }
  }
  object(raw, '插件存档'); clean(raw);
  if (byteLength(JSON.stringify(raw)) > PHONE_ARCHIVE_LIMIT) fail('存档超过6MiB', 'archive_too_large');
  return raw;
}
// Native SDK JSON round trips may reorder object keys. Compare data rather
// than insertion order while keeping array order and changed values material.
function rawText(raw) { return raw === null ? null : canonicalJson(parseRaw(raw)); }
function roleId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 ||
      value.includes('\0') || forbiddenKeys.has(value)) fail('需要有效角色ID');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,90}$/.test(value)) fail('记录ID格式无效');
  return value;
}
let idSerial = 0;
function newId(prefix) {
  const words = new Uint32Array(3);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(words);
  else { words[0] = Math.floor(Math.random() * 2 ** 32); words[1] = Math.floor(Math.random() * 2 ** 32); }
  return `${prefix}_${Date.now().toString(36)}_${(++idSerial).toString(36)}_${Array.from(words, v => v.toString(16).padStart(8, '0')).join('')}`;
}
function get(data, path) {
  let value = data;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !own(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
function set(data, path, value) {
  const parts = path.split('.');
  let parent = data;
  for (const key of parts.slice(0, -1)) parent = parent[key];
  parent[parts.at(-1)] = value;
}
function seed() {
  const timestamp = now();
  const data = {schema: 1, revision: 0,
    owner: {name: '', avatar: '', wallpaper: '', wallpaper_dim: .15, kicker: '', motto: '', battery: 78},
    wechat: {me: {name: '{{owner}}', avatar: '', color: '#9fb6da'}, cover: ''},
    bilibili: {profile: {name: '{{owner}}', avatar: '', sign: '', level: 0, fans: 0, following: 0, likes: 0}},
    instagram: {profile: {name: '{{owner}}', avatar: '', username: '', bio: '', followers: 0, following: 0}},
    created_at: timestamp, updated_at: timestamp};
  for (const spec of Object.values(phoneCollections)) {
    const [root, sub] = spec.key.split('.');
    if (sub && !own(data, root)) data[root] = {};
    set(data, spec.key, spec.singleton ? null : []);
  }
  return data;
}
function emptyArchive() { return {format: 'skivu-pocket-phone', version: 1, roles: {}}; }
function checkRevision(phone, expected) {
  if (expected !== undefined && (!Number.isSafeInteger(expected) || expected !== phone.revision))
    fail('内容已有更新，请刷新后重试。当前编辑内容可以保留。', 'revision_conflict');
}
function checkMayCommit(mayCommit) {
  if (mayCommit !== undefined && typeof mayCommit !== 'function') fail('mayCommit必须是函数');
  if (mayCommit && mayCommit() !== true) fail('操作已取消', 'cancelled');
}
function toolName(value) {
  if (typeof value !== 'string') fail('工具名称需要文字', 'unknown_tool');
  const name = value.startsWith('character_phone_core.') ? value.slice('character_phone_core.'.length) : value;
  if (!pocketPhoneToolNames.includes(name) && !['upsert', 'image_apply', 'mark_read'].includes(name)) fail('未知小手机工具', 'unknown_tool');
  return name;
}
function finish(phone, caller) {
  if (!Number.isSafeInteger(phone.revision + 1)) fail('存档版本号达到上限');
  phone.revision++; phone.updated_at = now();
  if (!phone.owner.name && typeof caller === 'string' && caller.trim()) phone.owner.name = caller.trim().slice(0, 80);
}

/** Host SDK supplies isolated JSON storage; lifecycle stays with the host. */
export class PocketPhoneStore {
  constructor({storage} = {}) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function')
      throw new TypeError('PocketPhoneStore requires JSON storage.get/set');
    this.storage = storage; this.error = null; this.musicHandler = null;
    this._archive = emptyArchive(); this._loaded = false; this._persistedText = null;
    this._tail = Promise.resolve(); this._listeners = new Set(); this._pending = 0;
  }
  get busy() { return this._pending > 0; }
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this._listeners.add(listener); return () => this._listeners.delete(listener);
  }
  _notify() {
    for (const listener of this._listeners) {
      try { Promise.resolve(listener(this)).catch(() => {}); } catch { /* One view cannot block another. */ }
    }
  }
  _serial(operation) {
    this._pending++;
    const result = this._tail.then(async () => {
      try { return await operation(); }
      catch (error) { this.error = String(error?.message ?? error); throw error; }
      finally { this._pending--; this._notify(); }
    });
    this._tail = result.catch(() => {});
    return result;
  }
  async _load() {
    if (this._loaded) return;
    const raw = await this.storage.get(PHONE_STORAGE_KEY);
    if (raw === null) {
      if (await this.storage.get(PHONE_BACKUP_KEY) !== null) fail('主存档缺失，请恢复已有备份。', 'archive_corrupt');
    } else {
      try { this._archive = decodeArchive(parseRaw(raw)); this._persistedText = rawText(raw); }
      catch (error) {
        if (error?.code === 'archive_too_large') throw error;
        fail('小手机存档损坏，原始数据已保留。请恢复备份或导出排查。', 'archive_corrupt');
      }
    }
    this._loaded = true; this.error = null;
  }
  restore() { return this._serial(async () => { await this._load(); return this; }); }
  snapshot(id) { roleId(id); return clone(own(this._archive.roles, id) ? this._archive.roles[id] : seed()); }
  exportArchive(id) {
    const phone = this.snapshot(id);
    // Integer cents are an internal derived index. The portable schema-1 file
    // keeps the original amount field so reference consumers can still edit it.
    for (const entry of phone.ledger.entries) delete entry.amount_cents;
    return JSON.stringify(phone, null, 2);
  }
  async _write(key, value) {
    if (await this.storage.set(key, clone(value)) !== true) fail('宿主未确认保存成功', 'storage_failed');
  }
  async _commit(next, {recover = false, mayCommit} = {}) {
    clean(next);
    const text = canonicalJson(next);
    if (byteLength(text) > PHONE_ARCHIVE_LIMIT) fail('所有角色的手机存档合计不能超过6MiB，请先导出整理。', 'archive_too_large');
    checkMayCommit(mayCommit);
    const previous = await this.storage.get(PHONE_STORAGE_KEY);
    if (!recover && rawText(previous) !== this._persistedText) fail('另一页面修改了存档，请重新打开后再编辑。', 'storage_conflict');
    if (previous !== null) {
      if (recover) await this._write(PHONE_DAMAGED_KEY, previous);
      else await this._write(PHONE_BACKUP_KEY, parseRaw(previous));
    }
    checkMayCommit(mayCommit);
    await this._write(PHONE_STORAGE_KEY, next);
    this._archive = next; this._persistedText = text; this._loaded = true; this.error = null;
  }
  importArchive(id, text) {
    return this._serial(async () => {
      await this._load(); roleId(id);
      if (typeof text !== 'string') fail('导入需要JSON文字');
      if (byteLength(text) > PHONE_ARCHIVE_LIMIT) fail('导入存档超过6MiB', 'archive_too_large');
      let raw; try { raw = JSON.parse(text); } catch { fail('导入JSON无法读取'); }
      const phone = normalizePhone(raw, {allowLegacySchema: true}), next = clone(this._archive);
      phone.revision = Math.max(phone.revision, (next.roles[id]?.revision ?? -1) + 1);
      if (!Number.isSafeInteger(phone.revision)) fail('存档版本号达到上限');
      next.roles[id] = phone; await this._commit(next); return this.snapshot(id);
    });
  }
  recoverBackup() {
    return this._serial(async () => {
      const raw = await this.storage.get(PHONE_BACKUP_KEY);
      if (raw === null) fail('没有可恢复的备份', 'backup_missing');
      let next;
      try { next = decodeArchive(parseRaw(raw)); } catch { fail('备份也损坏了，原始数据已保留。', 'backup_corrupt'); }
      await this._commit(next, {recover: true}); return this;
    });
  }
  invoke(tool, args = {}, {roleId: id, caller, mayCommit} = {}) {
    // Copy before queuing so caller edits cannot change an accepted operation.
    let input; try { input = argumentObject(args, 'arguments'); tool = toolName(tool); roleId(id); validateArguments(tool, input); } catch (error) { return Promise.reject(error); }
    return this._serial(async () => {
      await this._load(); checkMayCommit(mayCommit);
      const next = clone(this._archive), phone = own(next.roles, id) ? next.roles[id] : seed();
      checkRevision(phone, input.expected_revision);
      if (tool === 'character_phone_read') return read(phone, input);
      let result;
      if (tool === 'character_phone_search_music' || tool === 'character_phone_play_music') {
        if (typeof this.musicHandler !== 'function') fail('请先配置音乐服务', 'music_unconfigured');
        const action = tool.endsWith('search_music') ? 'music_search' : 'music_play';
        if (action === 'music_search') textField(input.keywords, 'keywords');
        else if (!/^\d+$/.test(String(input.song_id))) fail('song_id需要数字歌曲ID');
        const reply = argumentObject(await this.musicHandler(action, clone(input)), 'music result');
        checkMayCommit(mayCommit);
        if (reply.success === false) fail(String(reply.error || '音乐服务暂不可用'), 'music_unavailable');
        if (action === 'music_search') return {...reply, success: true, revision: phone.revision};
        const track = musicTrack(reply.track ?? reply.record);
        if (typeof reply.url === 'string') track.src = reply.url;
        const matchingPlaylist = phone.music.playlist.find(record => sameSong(record, track));
        const matchingCurrent = sameSong(phone.music.nowPlaying, track) ? phone.music.nowPlaying : null;
        const existingSong = matchingPlaylist ?? matchingCurrent;
        if (existingSong) track.id = existingSong.id;
        if (track.comment == null) track.comment = [matchingPlaylist, matchingCurrent].find(record => record && own(record, 'comment'))?.comment ?? '';
        const stored = upsert(phone, 'music.playlist', {...track, playing: false}).record;
        result = {...reply, ...upsert(phone, 'music.nowPlaying', {...stored, comment: stored.comment ?? '', position: 0, playing: true})};
      } else {
        result = apply(phone, tool, input, caller);
        if (result.duplicate && !result.contact_updated) return {...result, success: true, revision: phone.revision};
      }
      finish(phone, caller); next.roles[id] = phone;
      await this._commit(next, {mayCommit});
      return {...clone(result), success: true, revision: phone.revision};
    });
  }
  invokeBatch(actions, {roleId: id, caller, expectedRevision, mayCommit} = {}) {
    let inputs;
    try {
      roleId(id); clean(actions);
      if (!Array.isArray(actions) || actions.length < 1 || actions.length > 50) fail('每批操作需要1至50项');
      inputs = clone(actions);
    } catch (error) { return Promise.reject(error); }
    return this._serial(async () => {
      await this._load(); checkMayCommit(mayCommit);
      const next = clone(this._archive), phone = own(next.roles, id) ? next.roles[id] : seed();
      checkRevision(phone, expectedRevision);
      const receipts = []; let changed = false;
      for (const item of inputs) {
        object(item, 'action');
        if (Object.keys(item).some(key => !['tool', 'arguments', 'args'].includes(key))) fail('批次包含未知action字段');
        const tool = toolName(item.tool);
        if (tool.endsWith('search_music') || tool.endsWith('play_music')) fail('联网音乐操作不能加入本地事务');
        const args = argumentObject(item.arguments ?? item.args, 'arguments');
        validateArguments(tool, args);
        checkRevision(phone, args.expected_revision);
        const result = tool === 'character_phone_read' ? read(phone, args) : apply(phone, tool, args, caller);
        if (tool !== 'character_phone_read' && (!result.duplicate || result.contact_updated)) changed = true;
        receipts.push(result);
      }
      checkMayCommit(mayCommit);
      if (changed) { finish(phone, caller); next.roles[id] = phone; await this._commit(next, {mayCommit}); }
      return receipts.map(result => ({...clone(result), success: true, revision: phone.revision}));
    });
  }
}

function textField(value, field, {empty = false} = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim())) fail(`${field}需要文字`);
}
function numberField(value, field, min = 0, max = 10000000000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${field}超出有效数值范围`);
}
function media(value, field) {
  if (typeof value !== 'string') fail(`${field}需要图片地址`);
  if (!value || /^skivu-phone-image:[0-9a-f]{64}$/.test(value) ||
      /^\/api\/media\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)$/.test(value) ||
      /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) return;
  let url; try { url = new URL(value); } catch { fail(`${field}图片地址无效`); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) fail(`${field}图片地址不受支持`);
}
function dateField(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('date需要YYYY-MM-DD日期');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('date不是有效日期');
}
function cents(value) {
  numberField(value, 'amount', .01, 1000000000);
  const scaled = value * 100, rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > .00001) fail('金额最多保留两位小数');
  return rounded;
}
function knownKeys(value, fields, label) {
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail(`${label}不支持字段${key}`);
}
function validateMessage(message) {
  object(message, 'message'); clean(message);
  knownKeys(message, ['id', 'from', 'name', 'color', 'avatar', 'type', 'text', 'time', 'duration', 'src', 'tint', 'amount', 'accepted'], '消息');
  if (own(message, 'id')) identifier(message.id);
  if (!['me', 'them'].includes(message.from ?? 'me')) fail('消息from需要me或them');
  const type = message.type ?? 'text';
  if (!['text', 'voice', 'image', 'transfer', 'system'].includes(type)) fail('不支持的消息类型');
  if (type === 'text' || type === 'system') textField(message.text, 'text');
  if (type === 'voice') numberField(message.duration, 'duration', 1, 600);
  if (type === 'image') {
    if (!message.src && !message.text) fail('图片消息需要图片或文字描述');
    if (message.src) media(message.src, 'src');
  }
  if (type === 'transfer') numberField(message.amount, 'amount', 0, 1000000000);
  if (message.avatar) media(message.avatar, 'avatar');
  if (own(message, 'accepted') && typeof message.accepted !== 'boolean') fail('accepted需要布尔值');
  // Optional decoration/payload fields were JSON-valued in existing archives.
  // Mandatory text/system bodies and media addresses remain validated above.
}
function validateTint(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'string' || !/^#[a-f0-9]{3,8}$/i.test(v))) fail('tint需要两个颜色值');
}
function validateRecord(path, record, {importing = false} = {}) {
  if (!own(phoneCollections, path)) fail('未知集合路径');
  const spec = phoneCollections[path]; object(record, 'record'); clean(record);
  knownKeys(record, [...spec.fields, 'id', 'created_at', 'updated_at', ...(path === 'ledger.entries' ? ['amount_cents'] : []), ...(path === 'wechat.chats' ? ['messages'] : [])], path);
  if (own(record, 'id')) identifier(record.id);
  for (const key of spec.requiredFields) {
    if (key === 'from' || key === 'to') {
      object(record[key], key);
      for (const part of ['city', 'code', 'time']) textField(record[key][part], `${key}.${part}`);
    } else if (key === 'items') {
      if (!Array.isArray(record.items) || !record.items.length) fail('items需要至少一项');
    } else if (!['amount', 'latitude', 'longitude'].includes(key)) textField(record[key], key);
  }
  for (const key of ['created_at', 'updated_at', 'remark', 'relation', 'bio']) if (own(record, key)) textField(record[key], key, {empty: true});
  for (const key of ['src', 'thumb', 'avatar', 'cover', 'photo', 'image']) if (own(record, key)) media(record[key], key);
  if (own(record, 'progress')) numberField(record.progress, 'progress', 0, 1);
  for (const key of ['x', 'y']) if (own(record, key)) numberField(record[key], key, 0, 100);
  for (const key of ['price', 'total', 'qty', 'position', 'unread', 'originalPrice', 'wants', 'heat', 'reposts']) if (own(record, key)) numberField(record[key], key);
  for (const key of ['playing', 'pinned', 'muted', 'group', 'favorite', 'liked']) if (own(record, key) && typeof record[key] !== 'boolean') fail(`${key}需要布尔值`);
  if (own(record, 'date')) dateField(record.date);
  const numericLikes = ['instagram.posts', 'douban.reviews', 'weibo.posts'].includes(path);
  for (const key of ['quotes', 'tags', 'likes', 'comments', 'images', 'items', 'tint', 'ingredients', 'steps', 'members', 'messages']) {
    if (!own(record, key)) continue;
    if (key === 'likes' && numericLikes) {
      if (typeof record[key] !== 'number') fail('likes需要数字');
    }
    else if (!Array.isArray(record[key])) fail(`${key}需要数组`);
    else if (key !== 'messages' && record[key].length > 1000) fail(`${key}最多1000项`);
  }
  if (path === 'xiachufang.recipes' && own(record, 'steps') && record.steps.some(v => typeof v !== 'string')) fail('steps需要文字数组');
  if (own(record, 'tint')) validateTint(record.tint);
  for (const image of record.images ?? []) {
    if (typeof image === 'string' && importing) { media(image, 'images'); continue; }
    object(image, 'images');
    if (own(image, 'src')) media(image.src, 'images.src');
  }
  for (const comment of record.comments ?? []) {
    object(comment, 'comments'); textField(comment.name, 'comments.name'); textField(comment.text, 'comments.text');
  }
  for (const member of record.members ?? []) {
    object(member, 'members'); textField(member.name, 'members.name');
    if (own(member, 'avatar')) media(member.avatar, 'members.avatar');
  }
  for (const item of record.items ?? []) {
    object(item, 'items'); textField(item.name, 'items.name');
    numberField(item.qty, 'items.qty', 1, 10000); numberField(item.price, 'items.price');
  }
  if (path.startsWith('music.') || path === 'xiaoyuzhou.episodes') if (own(record, 'duration')) numberField(record.duration, 'duration', 0, 86400);
  if (own(record, 'songId') && !/^\d+$/.test(String(record.songId))) fail('songId需要数字歌曲ID');
  if (own(record, 'provider') && !['local', 'netease'].includes(record.provider)) fail('未知音乐provider');
  if (path === 'xiachufang.recipes') {
    for (const ingredient of record.ingredients ?? []) {
      object(ingredient, 'ingredients'); textField(ingredient.name, 'ingredients.name');
      if (own(ingredient, 'amount')) textField(ingredient.amount, 'ingredients.amount', {empty: true});
    }
    if (own(record, 'minutes')) numberField(record.minutes, 'minutes', 0, 10000);
    if (own(record, 'servings')) numberField(record.servings, 'servings', 1, 1000);
  }
  if (path === 'sun.location') {
    numberField(record.latitude, 'latitude', -90, 90); numberField(record.longitude, 'longitude', -180, 180);
    textField(record.timezone, 'timezone');
    try { new Intl.DateTimeFormat('en', {timeZone: record.timezone}); } catch { fail('timezone需要有效IANA时区'); }
  }
  if (path.startsWith('douban.') && own(record, 'rating')) numberField(record.rating, 'rating', 0, 5);
  if (path === 'douban.items' && own(record, 'category') && !['电影', '电视剧', '图书', '音乐'].includes(record.category)) fail('不支持的影音阅读分类');
  if (path === 'ledger.entries') {
    if (!['income', 'expense'].includes(record.type)) fail('type需要income或expense');
    const value = cents(record.amount);
    if (own(record, 'amount_cents') && (!Number.isSafeInteger(record.amount_cents) || record.amount_cents !== value)) fail('金额与整数分不一致');
    record.amount_cents = value; record.amount = value / 100;
    for (const key of ['category', 'account', 'note']) if (own(record, key)) textField(record[key], key, {empty: true});
  }
  if (path === 'wechat.chats' && own(record, 'messages')) {
    const seen = new Set();
    for (const message of record.messages) {
      validateMessage(message); identifier(message.id);
      if (seen.has(message.id)) fail('聊天存档包含重复消息ID');
      seen.add(message.id);
    }
  }
}
const profileFields = Object.freeze({
  owner: ['name', 'avatar', 'wallpaper', 'wallpaper_dim', 'kicker', 'motto', 'battery'],
  wechat: ['name', 'avatar', 'color', 'cover'],
  bilibili: ['name', 'avatar', 'sign', 'level', 'fans', 'following', 'likes'],
  instagram: ['name', 'avatar', 'username', 'bio', 'followers', 'following'],
});
function validateProfile(target, profile) {
  if (!own(profileFields, target)) fail('不支持的资料对象');
  object(profile, 'profile'); clean(profile); knownKeys(profile, profileFields[target], '资料');
  for (const [key, value] of Object.entries(profile)) {
    if (['avatar', 'wallpaper', 'cover'].includes(key)) media(value, key);
    else if (key === 'wallpaper_dim') numberField(value, key, 0, .8);
    else if (key === 'battery') numberField(value, key, 0, 100);
    else if (['level', 'fans', 'following', 'likes', 'followers'].includes(key)) {
      if (typeof value !== 'string' && typeof value !== 'number') fail(`${key}需要文字或数字`);
    } else textField(value, key, {empty: true});
  }
}
function normalizePhone(source, {allowLegacySchema = false} = {}) {
  object(source, '手机存档'); clean(source);
  if (source.schema !== 1) {
    const hasLegacyData = Object.keys(source).some(key => !['revision', 'created_at', 'updated_at'].includes(key) && own(seed(), key));
    if (!allowLegacySchema || own(source, 'schema') || !hasLegacyData) fail('仅支持schema 1手机存档', 'unsupported_schema');
  }
  if (own(source, 'revision') && (!Number.isSafeInteger(source.revision) || source.revision < 0)) fail('存档revision无效');
  const phone = seed(); knownKeys(source, Object.keys(phone), '存档');
  for (const key of ['revision', 'created_at', 'updated_at']) if (own(source, key)) {
    if (key !== 'revision') textField(source[key], key);
    phone[key] = source[key];
  }
  for (const [root, value] of Object.entries(source)) {
    if (root === 'owner') { validateProfile('owner', value); Object.assign(phone.owner, clone(value)); }
    else if (phone[root] && typeof phone[root] === 'object' && !Array.isArray(phone[root])) {
      object(value, root); knownKeys(value, Object.keys(phone[root]), root);
    }
  }
  for (const target of ['wechat', 'bilibili', 'instagram']) {
    const key = target === 'wechat' ? 'me' : 'profile';
    if (source[target] && own(source[target], key)) {
      validateProfile(target, source[target][key]); Object.assign(phone[target][key], clone(source[target][key]));
    }
  }
  if (source.wechat && own(source.wechat, 'cover')) { media(source.wechat.cover, 'wechat.cover'); phone.wechat.cover = source.wechat.cover; }
  for (const spec of Object.values(phoneCollections)) {
    const [root, child] = spec.key.split('.'), parent = child ? source[root] : source, key = child ?? root;
    if (!parent || !own(parent, key)) continue;
    const value = parent[key];
    if (value === null && spec.singleton) { set(phone, spec.key, null); continue; }
    if (spec.singleton) { const record = clone(object(value, spec.key)); validateRecord(spec.key, record, {importing: true}); identifier(record.id); set(phone, spec.key, record); }
    else {
      if (!Array.isArray(value)) fail(`${spec.key}需要数组`);
      const seen = new Set(), records = [];
      for (const item of value) {
        const record = clone(object(item, spec.key)); validateRecord(spec.key, record, {importing: true}); identifier(record.id);
        if (seen.has(record.id)) fail(`${spec.key}中出现重复ID`);
        seen.add(record.id); records.push(record);
      }
      set(phone, spec.key, records);
    }
  }
  return phone;
}
function decodeArchive(source) {
  object(source, '插件存档'); clean(source);
  knownKeys(source, ['format', 'version', 'roles'], '插件存档');
  if (source.format !== 'skivu-pocket-phone' || source.version !== 1) fail('插件存档格式无效');
  object(source.roles, 'roles');
  const archive = emptyArchive();
  for (const [id, phone] of Object.entries(source.roles)) { roleId(id); archive.roles[id] = normalizePhone(phone); }
  return archive;
}

function validateArguments(tool, args) {
  const groups = {
    character_phone_read: ['module', 'record_id', 'chat_id', 'query', 'offset', 'limit'],
    character_phone_set_profile: ['target', 'profile_json', 'profile'],
    character_phone_write_chat: ['chat_id', 'chat_json', 'chat', 'message_json', 'message'],
    character_phone_set_contact: ['chat_id', 'profile_json', 'profile'],
    character_phone_delete_record: ['module', 'path', 'id'],
    character_phone_search_music: ['keywords'], character_phone_play_music: ['song_id'],
    upsert: ['path', 'collection', 'record', 'record_json'],
    image_apply: ['path', 'id', 'field', 'value', 'expected_image'], mark_read: ['chat_id'],
  };
  const allowed = own(groups, tool) ? groups[tool] : ['collection', 'record_json', 'record'];
  knownKeys(args, [...allowed, 'expected_revision'], '工具参数');
}
function profile(phone, args, caller) {
  const target = args.target === '' ? 'owner' : args.target ?? 'owner';
  const input = argumentObject(args.profile_json ?? args.profile, 'profile_json');
  if (target === 'owner' && !Object.keys(input).length && typeof caller === 'string' && caller.trim()) input.name = caller.trim().slice(0, 80);
  validateProfile(target, input);
  const path = target === 'owner' ? 'owner' : target === 'wechat' ? 'wechat.me' : `${target}.profile`;
  if (target === 'wechat' && own(input, 'cover')) { phone.wechat.cover = input.cover; delete input.cover; }
  Object.assign(get(phone, path), input);
  if (target === 'owner' && own(input, 'avatar')) phone.wechat.me.avatar = input.avatar;
  return {target, profile: clone(get(phone, path))};
}
function sameSong(first, second) {
  if (!first || !second) return false;
  if (first.songId !== undefined && second.songId !== undefined)
    return String(first.songId) === String(second.songId) &&
      (!first.title || !second.title || first.title === second.title) &&
      (!first.artist || !second.artist || first.artist === second.artist);
  return typeof first.title === 'string' && typeof first.artist === 'string' && typeof second.title === 'string' && typeof second.artist === 'string' &&
    !!first.title.trim() && !!first.artist.trim() && first.title.trim() === second.title?.trim() && first.artist.trim() === second.artist?.trim();
}
function songChanged(first, next) {
  return !!first && ['songId', 'title', 'artist', 'id'].some(key => own(next, key) &&
    (key === 'songId' ? String(next[key]) !== String(first[key] || '') : next[key] !== first[key]));
}
function musicTrack(value) {
  const track = argumentObject(value, 'track');
  if (!Object.keys(track).length) fail('音乐服务没有返回歌曲', 'music_unavailable');
  const record = {};
  for (const field of phoneCollections['music.playlist'].fields) if (own(track, field)) record[field] = track[field];
  const externalId = track.songId ?? track.id;
  if (externalId !== undefined && /^\d+$/.test(String(externalId))) {
    record.songId = String(externalId); record.provider ??= 'netease';
    record.id = typeof track.id === 'string' && !/^\d+$/.test(track.id) ? identifier(track.id) : `ncm_${externalId}`;
  } else if (track.id !== undefined) record.id = track.id;
  if (!own(record, 'artist') && Array.isArray(track.artists)) record.artist = track.artists.map(v => typeof v === 'string' ? v : object(v, 'artist').name ?? '').filter(Boolean).join(' / ');
  if (!own(record, 'duration') && typeof track.durationMs === 'number') record.duration = track.durationMs / 1000;
  return record;
}
function upsert(phone, path, input) {
  if (!own(phoneCollections, path)) fail('未知记录集合');
  const spec = phoneCollections[path]; object(input, 'record'); clean(input);
  if (own(input, 'messages')) fail('请使用聊天工具写入消息');
  if (own(input, 'id') && input.id !== '' && input.id !== null) identifier(input.id);
  const collection = get(phone, path), index = !spec.singleton && input.id ? collection.findIndex(v => v.id === input.id) : -1;
  let existing = spec.singleton ? collection : index < 0 ? null : collection[index];
  const update = clone(input);
  if (update.id === '' || update.id === null) delete update.id;
  if (path === 'music.playlist' && songChanged(existing, update)) fail('该ID已用于另一首歌曲，请给新歌曲使用新ID。', 'id_conflict');
  if (path === 'music.nowPlaying' && songChanged(existing, update)) {
    if (!update.title) fail('切换歌曲需要提供title，不能把旧歌曲信息写入新歌。', 'stale_music');
    if (update.id === existing?.id) delete update.id;
    existing = null; update.comment ??= '';
    if (!own(update, 'songId')) update.provider = 'local';
  }
  const timestamp = now(), record = {...existing, ...update};
  record.id ??= newId('rec'); record.created_at = existing?.created_at ?? timestamp; record.updated_at = timestamp;
  if (path === 'ledger.entries' && own(update, 'amount') && !own(update, 'amount_cents')) delete record.amount_cents;
  if (path === 'wechat.chats') record.messages = existing?.messages ?? [];
  validateRecord(path, record);
  if (spec.singleton) set(phone, path, record);
  else if (index >= 0) collection[index] = record;
  else collection.unshift(record);
  if (path.startsWith('music.') && own(update, 'comment')) {
    const peers = path === 'music.nowPlaying' ? phone.music.playlist : [phone.music.nowPlaying];
    for (const peer of peers) if (sameSong(peer, record)) { peer.comment = record.comment; peer.updated_at = timestamp; }
  }
  return {path, record: clone(record), created: !existing};
}
function chat(phone, args) {
  const id = args.chat_id == null || args.chat_id === '' ? newId('chat') : identifier(args.chat_id);
  const chats = phone.wechat.chats, index = chats.findIndex(c => c.id === id), existing = index < 0 ? null : chats[index];
  const info = argumentObject(args.chat_json ?? args.chat, 'chat_json');
  if (own(info, 'id') || own(info, 'messages')) fail('请通过chat_id指定聊天，消息需单独写入。');
  const message = argumentObject(args.message_json ?? args.message, 'message_json');
  if (message.id == null || message.id === '') message.id = newId('msg');
  if (message.from == null || message.from === '') message.from = 'me';
  if (message.type == null || message.type === '') message.type = 'text';
  if (message.time == null || message.time === '') delete message.time;
  validateMessage(message);
  const previous = existing?.messages?.find(m => m.id === message.id);
  if (previous) {
    for (const key of Object.keys(message)) if (JSON.stringify(previous[key]) !== JSON.stringify(message[key])) fail('该消息ID已存在且内容不同', 'id_conflict');
    if (Object.keys(info).length) {
      const updated = {...existing, ...info};
      validateRecord('wechat.chats', updated);
      if (Object.keys(info).some(key => JSON.stringify(info[key]) !== JSON.stringify(existing[key]))) {
        updated.updated_at = now(); chats[index] = updated;
        return {chat_id: id, message: clone(previous), duplicate: true, contact_updated: true, chat: clone(updated)};
      }
    }
    return {chat_id: id, message: clone(previous), duplicate: true};
  }
  const record = {avatar: '', color: '#9fb6da', ...existing, id, name: info.name ?? existing?.name ?? '新聊天', unread: existing?.unread ?? 0, ...info};
  record.messages = existing?.messages ?? []; validateRecord('wechat.chats', record);
  const clock = new Date();
  if (message.time === undefined || message.time === '') message.time = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
  record.messages.push(message); record.time = message.time; record.updated_at = now(); record.created_at ??= record.updated_at;
  if (message.from === 'them') record.unread++;
  if (index < 0) chats.unshift(record); else chats[index] = record;
  return {chat_id: id, message: clone(message), chat: clone(record)};
}
function imageApply(phone, args) {
  const path = args.path; let field, target;
  if (path === 'owner') {
    field = args.field;
    if (!['avatar', 'wallpaper'].includes(field)) fail('资料图片字段无效');
    target = phone.owner;
  } else if (path === 'wechat') { field = 'cover'; target = phone.wechat; }
  else if (['instagram.profile', 'bilibili.profile', 'wechat.me'].includes(path)) { field = 'avatar'; target = get(phone, path); }
  else {
    const fields = {photos: 'src', 'instagram.posts': 'src', 'instagram.highlights': 'src', 'xiachufang.recipes': 'cover', 'xiachufang.cooking': 'photo', 'wechat.moments': 'images', 'bilibili.posts': 'thumb', 'xianyu.items': 'images'};
    if (!own(fields, path)) fail('此位置不能应用图片');
    field = fields[path]; identifier(args.id); target = get(phone, path).find(record => record.id === args.id);
    if (!target) fail('记录已删除', 'record_missing');
  }
  if (!own(args, 'expected_image') || JSON.stringify(target[field] ?? (field === 'images' ? [] : '')) !== JSON.stringify(args.expected_image)) fail('原图片已更新，请重新打开后编辑。', 'image_conflict');
  if (field === 'images') {
    if (!Array.isArray(args.value) || args.value.length > 9) fail('图片需要不超过9项的数组');
    for (const image of args.value) media(object(image, 'image').src, 'images.src');
  } else media(args.value, field);
  target[field] = clone(args.value);
  if (target.updated_at !== undefined) target.updated_at = now();
  return {path, ...(args.id !== undefined ? {id: args.id} : {}), image: clone(args.value)};
}
function apply(phone, tool, args, caller) {
  if (tool === 'character_phone_set_profile') return profile(phone, args, caller);
  if (tool === 'character_phone_write_chat') return chat(phone, args);
  if (tool === 'character_phone_set_contact') {
    const id = identifier(args.chat_id), existing = phone.wechat.chats.find(record => record.id === id);
    if (!existing) fail('联系人不存在', 'record_missing');
    const update = argumentObject(args.profile_json ?? args.profile, 'profile_json');
    if (own(update, 'id') || own(update, 'messages')) fail('联系人资料不能修改ID或消息');
    const result = upsert(phone, 'wechat.chats', {id, ...update});
    const contact = clone(result.record); delete contact.messages;
    return {...result, chat_id: id, profile: contact};
  }
  if (tool === 'character_phone_delete_record') {
    const path = args.module ?? args.path;
    if (typeof path !== 'string' || !own(phoneCollections, path)) fail('删除需要合法集合路径');
    const spec = phoneCollections[path], id = identifier(args.id), value = get(phone, path);
    if (spec.singleton) { if (!value || value.id !== id) fail('记录不存在', 'record_missing'); set(phone, path, null); }
    else { const index = value.findIndex(v => v.id === id); if (index < 0) fail('记录不存在', 'record_missing'); value.splice(index, 1); }
    return {path, deleted: id};
  }
  if (tool === 'image_apply') return imageApply(phone, args);
  if (tool === 'mark_read') {
    const id = identifier(args.chat_id), record = phone.wechat.chats.find(v => v.id === id);
    if (!record) fail('聊天不存在', 'record_missing'); record.unread = 0; return {chat_id: id};
  }
  if (tool === 'upsert') {
    const path = args.path ?? args.collection;
    if (typeof path !== 'string' || !own(phoneCollections, path)) fail('需要合法集合路径');
    return upsert(phone, path, argumentObject(args.record ?? args.record_json, 'record'));
  }
  const canonical = ({character_phone_write_podcast: 'character_phone_write_xiaoyuzhou', character_phone_write_recipe: 'character_phone_write_xiachufang'})[tool] ?? tool;
  const specs = Object.values(phoneCollections).filter(spec => spec.defaultWriteTool === canonical);
  if (!specs.length) fail('该工具不能写入记录', 'unknown_tool');
  const path = args.collection === '' ? specs[0].key : args.collection ?? specs[0].key;
  if (typeof path !== 'string' || !specs.some(spec => spec.key === path)) fail('此工具不支持指定集合');
  return upsert(phone, path, argumentObject(args.record_json ?? args.record, 'record_json'));
}
function filteredRecords(input, args) {
  let records = input;
  if (args.record_id !== undefined && args.record_id !== null && args.record_id !== '') { identifier(args.record_id); records = records.filter(record => record.id === args.record_id); }
  if (args.query !== undefined && args.query !== null && args.query !== '') {
    textField(args.query, 'query'); const query = args.query.toLowerCase();
    records = records.filter(record => JSON.stringify(record).toLowerCase().includes(query));
  }
  return records;
}
function page(input, args, revision, extra = {}) {
  const offset = args.offset ?? 0, limit = args.limit ?? 20;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('分页需要整数offset和1至100的limit');
  const records = filteredRecords(input, args);
  return {...clone(extra), success: true, revision, total: records.length, offset, records: clone(records.slice(offset, offset + limit))};
}
function ledgerSummary(entries) {
  let income = 0, expense = 0;
  for (const entry of entries) {
    const value = entry.amount_cents ?? cents(entry.amount);
    if (entry.type === 'income') income += value; else expense += value;
  }
  if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) fail('账本汇总超过安全数值范围');
  return {income_cents: income, expense_cents: expense, balance_cents: income - expense, count: entries.length, currency: 'CNY'};
}
function readContent(phone, args) {
  const path = args.module ?? '';
  if (typeof path !== 'string') fail('module需要文字');
  if (!path) return {success: true, schema: 1, revision: phone.revision, owner: clone(phone.owner),
    counts: Object.fromEntries(Object.values(phoneCollections).filter(spec => !spec.singleton && !spec.key.startsWith('pornhub.')).map(spec => [spec.key, get(phone, spec.key).length])),
    modules: Object.keys(phoneCollections).filter(path => !path.startsWith('pornhub.')),
    apps: clone(phoneModules.filter(module => module.id !== 'pornhub')), simulation: true,
    guidance: '这里保存角色的模拟手机记录。读取集合后再写入；记录不代表真实消息、交易或出行。私密记录需明确指定模块读取。'};
  if (path === 'owner') return {success: true, revision: phone.revision, data: clone(phone.owner)};
  if (path === 'wechat.messages') {
    const id = identifier(args.chat_id), record = phone.wechat.chats.find(chat => chat.id === id);
    if (!record) fail('聊天不存在', 'record_missing');
    return page(record.messages ?? [], args, phone.revision, {chat_id: id});
  }
  if (own(phoneCollections, path)) {
    const spec = phoneCollections[path], value = get(phone, path);
    const extra = {path, fields: spec.fields.join(' '), field_names: [...spec.fields], required_fields: [...spec.requiredFields], write_tool_name: spec.defaultWriteTool, example: clone(phoneExamples[path])};
    if (spec.singleton) return {...extra, success: true, revision: phone.revision, data: clone(value)};
    const result = page(value, args, phone.revision, extra);
    if (path === 'ledger.entries') result.summary = ledgerSummary(filteredRecords(value, args));
    return result;
  }
  const module = phoneModules.find(item => item.id === path);
  if (module || own(phone, path) && phone[path] && !Array.isArray(phone[path]) && typeof phone[path] === 'object') {
    const value = path === 'calendar' ? {events: phone.events, sun: phone.sun} : phone[path];
    if (!value) fail('模块不存在');
    return {success: true, revision: phone.revision, data: clone(value), paths: clone(module?.collections ?? Object.keys(phoneCollections).filter(key => key.startsWith(`${path}.`))), ...(path === 'ledger' ? {summary: ledgerSummary(phone.ledger.entries)} : {})};
  }
  fail('模块路径无效');
}

function read(phone, args) {
  const result = readContent(phone, args), root = String(args.module || '').split('.')[0];
  result.tool_schema_version = '1.5.2';
  if (!args.module) result.write_tools = clone(phoneWriteTools);
  else if (own(phoneWriteTools, root)) result.write_tool = clone(phoneWriteTools[root]);
  return result;
}
