import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketPhoneConversation, PocketPhoneConversationError, CONVERSATION_JOURNAL_KEY, parseConversationPlan,
  sanitizeConversationData } from '../../plugins/pocket-phone/conversation.js';
import { PocketPhoneStore } from '../../plugins/pocket-phone/engine.js';
import { pocketPhoneToolNames } from '../../plugins/pocket-phone/collections.js';
import { PocketPhoneHostError } from '../../plugins/pocket-phone/host.js';

const action = (tool, args) => ({ tool, arguments: args });
const memo = title => action('character_phone_write_memo', { record_json: JSON.stringify({ title }) });
const plan = (actions = [], reply = '已完成。') => ({ text: JSON.stringify({ reply, actions, done: actions.length === 0 }),
  usage: { input: 10, output: 5, cached: 2 } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

async function fixture(replies = [plan()], overrides = {}) {
  const stored = new Map(), writes = [], listeners = new Map(), calls = [], messages = [];
  const phone = new PocketPhoneStore({ storage: {
    async get(key) { return stored.has(key) ? structuredClone(stored.get(key)) : null; },
    async set(key, value) { stored.set(key, structuredClone(value)); writes.push(key); return true; },
  } }); await phone.restore();
  let context = { roleId: 'role-a', roleName: '甲', chatId: 'chat-a' }, aiIndex = 0;
  const host = {
    async storageGet(key) { return stored.has(key) ? structuredClone(stored.get(key)) : null; },
    async storageSet(key, value) { stored.set(key, structuredClone(value)); return true; },
    async context() { return { ...context }; },
    subscribeContext(fn) { return on('context', fn); }, onSuspend(fn) { return on('suspend', fn); },
    async chatRead(params) { calls.push({ method: 'chat.read', params }); return messages.filter(value => value.id.startsWith(`${context.chatId}:`)).slice(-params.limit).map(value => ({ ...value })); },
    async chatAppend(params) {
      calls.push({ method: 'chat.append', params });
      const result = { id: `${context.chatId}:${messages.length}` }; messages.push({ ...params, id: result.id }); return result;
    },
    async aiGenerate(params) {
      calls.push({ method: 'ai.generate', params });
      const value = replies[aiIndex++]; if (value === undefined) throw new Error('Unexpected model round');
      return typeof value === 'function' ? value(params) : value;
    }, ...overrides,
  };
  function on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return () => listeners.get(event).delete(fn); }
  const conversation = new PocketPhoneConversation({ host, phone });
  return { phone, host, conversation, stored, writes, calls, messages,
    emit(event, detail) { for (const fn of listeners.get(event) ?? []) fn(detail); },
    change(value, emit = true) { context = { ...context, ...value }; if (emit) this.emit('context', context); },
    context: () => ({ ...context }) };
}

test('strict parser covers all 31 compatibility names and rejects unknown scope/fields before dispatch', () => {
  for (const name of pocketPhoneToolNames) {
    let args = { record_json: '{}' };
    if (name === 'character_phone_read') args = {};
    if (name === 'character_phone_set_profile') args = { profile_json: '{}' };
    if (name === 'character_phone_set_contact') args = { chat_id: 'a', profile_json: '{}' };
    if (name === 'character_phone_delete_record') args = { module: 'memos', id: 'a' };
    if (name === 'character_phone_write_chat') args = { message_json: '{"text":"a"}' };
    if (name === 'character_phone_search_music') args = { keywords: 'song' };
    if (name === 'character_phone_play_music') args = { song_id: '12' };
    const parsed = parseConversationPlan(plan([action(`character_phone_core.${name}`, args)]).text);
    assert.equal(parsed.actions[0].tool, name);
  }
  for (const value of [
    { reply: 'x', actions: [], done: false }, { reply: '', actions: [], done: true },
    { reply: 'x', actions: [memo('a')], done: true },
    { reply: 'x', actions: Array.from({ length: 6 }, () => memo('a')), done: false },
    { reply: 'x', actions: [action('chat.append', {})], done: false },
    { reply: 'x', actions: [action('character_phone_read', { roleId: 'b' })], done: false },
    { reply: 'x', actions: [action('character_phone_write_memo', { record_json: '[]' })], done: false },
    { reply: 'x', actions: [], done: true, extra: 1 },
  ]) assert.throws(() => parseConversationPlan(JSON.stringify(value)), PocketPhoneConversationError);
});

test('read result returns to the next confirmed model round; write/final append are real and scoped', async () => {
  const f = await fixture([
    plan([action('character_phone_read', { module: 'memos', limit: 3 })]),
    params => { assert.match(JSON.stringify(params.context), /tool_result/);
      assert.deepEqual(JSON.parse(params.context.at(-1).content).tool_result.result.records, []);
      return plan([memo('角色真正写下的记录')]); }, plan([], '我已经写好了。'),
  ]);
  const result = await f.conversation.send({ text: '看看手机，再写一条备忘录' });
  assert.equal(result.status, 'complete'); assert.equal(result.rounds, 3); assert.equal(result.tools, 2);
  assert.equal(f.phone.snapshot('role-a').memos[0].title, '角色真正写下的记录');
  assert.equal(f.phone.snapshot('role-b').memos.length, 0);
  assert.deepEqual(f.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.userMessageId, 'chat-a:0'); assert.equal(result.assistantMessageId, 'chat-a:1');
  assert.equal(f.messages[1].text, '我已经写好了。'); assert.deepEqual(result.usage, { input: 30, output: 15, cached: 6 });
  assert.equal((await f.conversation.history()).length, 2); f.conversation.dispose();
});

test('user append refusal prevents model calls and permits a fresh send without phantom pending state', async () => {
  const f = await fixture([plan()], { async chatAppend() { throw new PocketPhoneHostError('CANCELLED', '用户拒绝'); } });
  await assert.rejects(f.conversation.send({ text: '你好' }), error => error.code === 'CANCELLED');
  assert.equal(f.conversation.pending, null); assert.equal(f.calls.length, 0); f.conversation.dispose();
});

test('assistant append refusal resumes only the pending append, without resending user or tools/model', async () => {
  const f = await fixture([plan([memo('仅创建一次')]), plan([], '完成。')]);
  const append = f.host.chatAppend.bind(f.host); let denied = false;
  f.host.chatAppend = async params => { if (params.role === 'assistant' && !denied) {
    denied = true; throw new PocketPhoneHostError('CANCELLED', '拒绝本次写入'); } return append(params); };
  const first = await f.conversation.send({ text: '写一条' });
  assert.equal(first.status, 'paused'); assert.equal(first.canContinue, true);
  assert.equal(f.messages.length, 1); assert.equal(f.phone.snapshot('role-a').memos.length, 1);
  const result = await f.conversation.resume({ turnId: first.turnId });
  assert.equal(result.status, 'complete'); assert.equal(f.messages.length, 2);
  assert.equal(f.calls.filter(call => call.method === 'ai.generate').length, 2);
  assert.equal(f.phone.snapshot('role-a').memos.length, 1); f.conversation.dispose();
});

test('cancelled late model output is dropped, and resume never duplicates the saved user message', async () => {
  const wait = deferred(), started = deferred();
  const f = await fixture([() => { started.resolve(); return wait.promise; }, plan([], '重新继续的答复')]);
  const pending = f.conversation.send({ text: '你好' }); await started.promise;
  await assert.rejects(f.conversation.send({ text: '重复' }), error => error.code === 'BUSY');
  f.conversation.cancel(); wait.resolve(plan([memo('迟到不得执行')]));
  const paused = await pending;
  assert.equal(paused.status, 'paused'); assert.equal(paused.canContinue, true);
  assert.equal(f.phone.snapshot('role-a').memos.length, 0);
  await assert.rejects(f.conversation.send({ text: '你好' }), error => error.code === 'PENDING_TURN');
  assert.equal((await f.conversation.resume()).status, 'complete');
  assert.deepEqual(f.messages.map(message => message.role), ['user', 'assistant']); f.conversation.dispose();
});

test('same-context notification from chat.append does not cancel; an actual switch or suspend does', async () => {
  const f = await fixture([plan()]); const append = f.host.chatAppend.bind(f.host);
  f.host.chatAppend = async params => { const value = await append(params); f.emit('context', f.context()); return value; };
  assert.equal((await f.conversation.send({ text: '正常' })).status, 'complete'); f.conversation.dispose();
  for (const suspend of [false, true]) {
    const wait = deferred(), started = deferred(); const g = await fixture([() => { started.resolve(); return wait.promise; }]);
    const pending = g.conversation.send({ text: '开始' }); await started.promise;
    if (suspend) g.emit('suspend'); else g.change({ roleId: 'role-b', chatId: 'chat-b' });
    wait.resolve(plan([memo('不能写入')])); const result = await pending;
    assert.equal(result.status, 'paused'); assert.equal(g.phone.snapshot('role-a').memos.length, 0);
    assert.equal(g.messages.length, 1); g.conversation.dispose();
  }
});

test('tool successes survive later failures, and the final host reply contains authoritative partial receipts', async () => {
  const f = await fixture([plan([memo('已成功'), action('character_phone_write_event', {
    record_json: '{"title":"失败","date":"not-a-date"}',
  })]), params => { assert.match(JSON.stringify(params.context), /success\\?":false/); return plan([], '我处理过了。'); }]);
  const result = await f.conversation.send({ text: '做两件事' });
  assert.equal(result.status, 'complete'); assert.deepEqual(result.results.map(value => value.success), [true, false]);
  assert.equal(f.phone.snapshot('role-a').memos.length, 1); assert.equal(f.phone.snapshot('role-a').events.length, 0);
  assert.match(f.messages[1].text, /1项成功，1项失败/); assert.match(f.messages[1].text, /没有全局回滚/); f.conversation.dispose();
});

test('music search and play work through the engine handler; URL/credentials never enter model feedback', async () => {
  const f = await fixture([
    plan([action('character_phone_search_music', { keywords: '轻音乐' })]),
    params => { const raw = JSON.stringify(params.context); assert.match(raw, /12345/);
      assert.doesNotMatch(raw, /secret-audio|secret-image|COOKIE_SECRET|TOKEN_SECRET/);
      return plan([action('character_phone_play_music', { song_id: '12345' })]); },
    params => { assert.doesNotMatch(JSON.stringify(params), /secret-audio|secret-image|COOKIE_SECRET|TOKEN_SECRET/); return plan([], '已选好这首歌。'); },
  ]);
  const music = [];
  f.phone.musicHandler = async (name, args) => { music.push(name); return name === 'music_search'
    ? { tracks: [{ songId: '12345', title: '云', cover: 'https://secret-image.example/a' }], cookie: 'COOKIE_SECRET' }
    : { track: { songId: args.song_id, title: '云', artist: '乐手', provider: 'netease' },
      url: 'https://secret-audio.example/song', access_token: 'TOKEN_SECRET' }; };
  const result = await f.conversation.send({ text: '搜一首轻音乐再选中' });
  assert.equal(result.status, 'complete'); assert.deepEqual(music, ['music_search', 'music_play']);
  assert.equal(f.phone.snapshot('role-a').music.nowPlaying.songId, '12345');
  assert.doesNotMatch(JSON.stringify(result), /secret-audio|secret-image|COOKIE_SECRET|TOKEN_SECRET/); f.conversation.dispose();
});

test('private read/write/delete are denied by default and private snapshot content is not prompted', async () => {
  const f = await fixture([plan([
    action('character_phone_write_pornhub', { record_json: '{"title":"private"}' }),
    action('character_phone_read', { module: 'pornhub' }),
    action('character_phone_delete_record', { module: 'pornhub.history', id: 'old' }),
  ]), params => { assert.doesNotMatch(params.instruction, /PRIVATE_UNIQUE_MARKER/); return plan([], '没有处理私密内容。'); }]);
  await f.phone.invoke('character_phone_write_pornhub', { record_json: '{"id":"old","title":"PRIVATE_UNIQUE_MARKER"}' }, { roleId: 'role-a' });
  const result = await f.conversation.send({ text: '不要处理私密' });
  assert.deepEqual(result.results.map(value => value.error?.code), ['PRIVATE_DENIED', 'PRIVATE_DENIED', 'PRIVATE_DENIED']);
  assert.equal(f.phone.snapshot('role-a').pornhub.history.length, 1); f.conversation.dispose();
});

test('concurrent revision pauses old writes and explicit resume replans without overwriting the edit', async () => {
  const wait = deferred(), started = deferred();
  const f = await fixture([() => { started.resolve(); return wait.promise; }, plan([], '看到更新了，保留你的记录。')]);
  const pending = f.conversation.send({ text: '写一条' }); await started.promise;
  await f.phone.invoke('character_phone_write_memo', { record_json: '{"title":"用户新编辑"}' }, { roleId: 'role-a' });
  wait.resolve(plan([memo('陈旧计划')])); const paused = await pending;
  assert.equal(paused.error.code, 'revision_conflict'); assert.equal(paused.canContinue, true);
  assert.equal(f.phone.snapshot('role-a').memos.length, 1);
  assert.equal((await f.conversation.resume()).status, 'complete');
  assert.equal(f.phone.snapshot('role-a').memos[0].title, '用户新编辑'); f.conversation.dispose();
});

test('12 total tools still permit a final model round, and six-round limit cannot loop forever', async () => {
  const read = () => action('character_phone_read', { module: 'memos' });
  const f = await fixture([plan(Array.from({ length: 5 }, read)), plan(Array.from({ length: 5 }, read)),
    plan(Array.from({ length: 2 }, read)), plan([], '读取完成。')]);
  const result = await f.conversation.send({ text: '检查记录' });
  assert.equal(result.status, 'complete'); assert.equal(result.tools, 12); assert.equal(result.rounds, 4); f.conversation.dispose();
  const g = await fixture(Array.from({ length: 6 }, () => plan([read()])));
  const stopped = await g.conversation.send({ text: '检查记录' });
  assert.equal(stopped.status, 'paused'); assert.equal(stopped.error.code, 'ROUND_LIMIT');
  assert.equal(stopped.rounds, 6); assert.equal(stopped.canContinue, false); g.conversation.dispose();
});

test('uncertain chat append is never retried automatically and blocks duplicate send until explicit discard', async () => {
  const f = await fixture([plan()]);
  f.host.chatAppend = async params => { f.messages.push({ ...params, id: 'chat-a:0' }); throw new PocketPhoneHostError('CLOSED', 'bridge closed after save'); };
  const result = await f.conversation.send({ text: '可能已保存' });
  assert.equal(result.status, 'review-required'); assert.equal(result.canContinue, false);
  await assert.rejects(f.conversation.resume(), error => error.code === 'NOT_RESUMABLE');
  await assert.rejects(f.conversation.send({ text: '可能已保存' }), error => error.code === 'PENDING_TURN');
  assert.equal(f.messages.length, 1); assert.equal((await f.conversation.discard()).canContinue, false); f.conversation.dispose();
});

test('cancelling an in-flight music operation uses mayCommit and retains earlier acknowledged writes', async () => {
  const wait = deferred(), started = deferred();
  const f = await fixture([plan([memo('先完成'), action('character_phone_play_music', { song_id: '1' })])]);
  f.phone.musicHandler = async () => { started.resolve(); return wait.promise; };
  const pending = f.conversation.send({ text: '记一条再选歌' }); await started.promise;
  f.conversation.cancel(); wait.resolve({ track: { songId: '1', title: '迟到歌曲', artist: '乐手', provider: 'netease' }, url: 'https://audio.example/1' });
  const result = await pending;
  assert.equal(result.status, 'paused'); assert.equal(result.partial, true);
  assert.equal(f.phone.snapshot('role-a').memos.length, 1); assert.equal(f.phone.snapshot('role-a').music.nowPlaying, null);
  assert.match(result.summary, /未回滚/); f.conversation.dispose();
});

test('automatic JSON strings and uncommon credential key spellings are sanitized recursively', () => {
  const result = sanitizeConversationData({ access_token: 'SECRET_A', refresh_token: 'SECRET_B',
    profile_json: '{"api_key":"SECRET_C","src":"https://image.example/a","songId":"5"}',
    note: 'Bearer SECRET_D https://internal.example/private', record: { songId: '5', title: '保留' } });
  assert.doesNotMatch(JSON.stringify(result), /SECRET_|internal.example|image.example/);
  assert.match(JSON.stringify(result), /songId/);
});

test('a persisted tool write with a lost host acknowledgement is marked uncertain and is never auto-repeated', async () => {
  const f = await fixture([plan([memo('可能已写入')])]);
  const invoke = f.phone.invoke.bind(f.phone);
  f.phone.invoke = async (...args) => { await invoke(...args); throw new PocketPhoneHostError('TIMEOUT', 'ack lost'); };
  const result = await f.conversation.send({ text: '写一条' });
  assert.equal(result.status, 'review-required'); assert.equal(result.canContinue, false);
  assert.equal(result.results[0].uncertain, true); assert.equal(f.phone.snapshot('role-a').memos.length, 1);
  assert.equal(f.messages.length, 1); assert.match(result.summary, /没有回滚/);
  await assert.rejects(f.conversation.resume(), error => error.code === 'NOT_RESUMABLE'); f.conversation.dispose();
});

async function reopen(f, host = f.host) {
  const phone = new PocketPhoneStore({ storage: { get: key => host.storageGet(key), set: (key, value) => host.storageSet(key, value) } });
  await phone.restore();
  const conversation = new PocketPhoneConversation({ host, phone });
  const pending = await conversation.restore(); return { phone, conversation, pending };
}

// Android's JSON bridge may rebuild objects in a different property order on
// each trip. Array order and all actual JSON values must remain meaningful.
function reorderJsonKeys(value, descending = false) {
  if (Array.isArray(value)) return value.map(entry => reorderJsonKeys(entry, descending));
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort(); if (descending) keys.reverse();
  return Object.fromEntries(keys.map(key => [key, reorderJsonKeys(value[key], descending)]));
}
function useReorderedHostStorage(f) {
  f.host.storageGet = async key => f.stored.has(key) ? reorderJsonKeys(f.stored.get(key)) : null;
  f.host.storageSet = async (key, value) => { f.stored.set(key, reorderJsonKeys(value, true)); return true; };
}

test('recursive host key reordering permits all three read/write/final rounds and refresh recovery', async () => {
  const f = await fixture([
    plan([action('character_phone_read', { module: 'memos', limit: 3 })]),
    plan([memo('第一条'), memo('第二条')]), plan([], '两条都已记录。'),
  ]);
  useReorderedHostStorage(f);
  const result = await f.conversation.send({ text: '先读，再按顺序写两条' });
  assert.equal(result.status, 'complete'); assert.equal(result.rounds, 3);
  assert.deepEqual(result.results.map(value => value.tool), [
    'character_phone_read', 'character_phone_write_memo', 'character_phone_write_memo',
  ]);
  assert.deepEqual(f.phone.snapshot('role-a').memos.map(value => value.title), ['第二条', '第一条']);
  assert.deepEqual(f.messages.map(value => value.role), ['user', 'assistant']);
  const stored = await f.host.storageGet(CONVERSATION_JOURNAL_KEY);
  assert.equal(stored.turns[0].assistantMessageId, result.assistantMessageId);
  assert.deepEqual(stored.turns[0].results.map(value => value.callId), result.results.map(value => value.callId));
  f.conversation.dispose(); const recovered = await reopen(f);
  assert.equal(recovered.pending.length, 0);
  assert.deepEqual(recovered.phone.snapshot('role-a').memos.map(value => value.title), ['第二条', '第一条']);
  // Restoring is read-only, and a subsequent send must accept the same saved
  // journal despite its reordered properties without repeating previous work.
  f.host.aiGenerate = async () => plan([], '刷新后正常。');
  assert.equal((await recovered.conversation.send({ text: '刷新后继续聊天' })).status, 'complete');
  assert.deepEqual(f.messages.map(value => value.role), ['user', 'assistant', 'user', 'assistant']);
  recovered.conversation.dispose();
});

test('reordered host objects still reject a real journal change from another controller', async () => {
  const denied = () => { throw new PocketPhoneHostError('USER_CANCELLED', '暂停'); };
  const f = await fixture([denied, denied]); useReorderedHostStorage(f);
  const first = await f.conversation.send({ text: '本页已保存用户消息' });
  assert.equal(first.status, 'paused');
  const second = new PocketPhoneConversation({ host: f.host, phone: f.phone });
  await second.restore();
  f.change({ roleId: 'role-b', roleName: '乙', chatId: 'chat-b' });
  const other = await second.send({ text: '另一页修改真实值' });
  assert.equal(other.status, 'paused');
  f.change({ roleId: 'role-a', roleName: '甲', chatId: 'chat-a' });
  await assert.rejects(f.conversation.discard({ turnId: first.turnId }), error => error.code === 'JOURNAL_CONFLICT');
  assert.equal(f.messages.length, 2);
  assert.ok((await f.host.storageGet(CONVERSATION_JOURNAL_KEY)).turns.some(turn => turn.id === other.turnId));
  f.conversation.dispose(); second.dispose();
});

test('durable pending restore keeps acknowledged user/tool facts and resumes without duplicate sends or tools', async () => {
  const f = await fixture([plan([memo('重开也只一条')]), () => { throw new PocketPhoneHostError('USER_CANCELLED', '暂不生成'); }, plan([], '继续完成')]);
  const first = await f.conversation.send({ text: '写一条再回复' });
  assert.equal(first.canContinue, true); assert.equal(first.results.length, 1);
  f.conversation.dispose(); const resumed = await reopen(f);
  assert.equal(resumed.pending.length, 1); assert.equal(resumed.pending[0].userMessageId, first.userMessageId);
  assert.equal(resumed.pending[0].results[0].success, true);
  const result = await resumed.conversation.resume({ turnId: first.turnId });
  assert.equal(result.status, 'complete'); assert.equal(resumed.phone.snapshot('role-a').memos.length, 1);
  assert.deepEqual(f.messages.map(value => value.role), ['user', 'assistant']);
  resumed.conversation.dispose(); const after = await reopen(f);
  assert.equal(after.pending.length, 0); after.conversation.dispose();
});

test('a crash between append intent and acknowledgement restores review-required and never automatically re-appends', async () => {
  const waiting = deferred(), started = deferred(); const f = await fixture([plan()]);
  const liveWrite = f.host.storageSet;
  f.host.chatAppend = async params => { f.messages.push({ ...params, id: 'chat-a:0' }); started.resolve(); return waiting.promise; };
  const old = f.conversation.send({ text: '已保存但没有回执' }); await started.promise;
  assert.equal(f.stored.get(CONVERSATION_JOURNAL_KEY).turns[0].intent.kind, 'append');
  f.conversation.dispose(); const freshHost = { ...f.host, storageSet: liveWrite };
  f.host.storageSet = async () => { throw new PocketPhoneHostError('CLOSED', 'old bridge closed'); };
  const recovered = await reopen(f, freshHost);
  assert.equal(recovered.pending[0].status, 'review-required'); assert.equal(recovered.pending[0].canContinue, false);
  assert.equal(f.messages.length, 1); assert.equal(f.calls.filter(value => value.method === 'ai.generate').length, 0);
  await assert.rejects(recovered.conversation.send({ text: '已保存但没有回执' }), error => error.code === 'PENDING_TURN');
  waiting.reject(new PocketPhoneHostError('CLOSED', 'closed')); await old; recovered.conversation.dispose();
});

test('a crash with an unacknowledged tool intent restores uncertainty without rerunning the actual persisted write', async () => {
  const waiting = deferred(), started = deferred(); const f = await fixture([plan([memo('工具可能已执行')])]);
  const invoke = f.phone.invoke.bind(f.phone), liveWrite = f.host.storageSet;
  f.phone.invoke = async (...args) => { const value = await invoke(...args); started.resolve(); return waiting.promise.then(() => value); };
  const old = f.conversation.send({ text: '写一条' }); await started.promise;
  assert.equal(f.stored.get(CONVERSATION_JOURNAL_KEY).turns[0].intent.kind, 'tool');
  f.conversation.dispose(); const freshHost = { ...f.host, storageSet: liveWrite };
  f.host.storageSet = async () => { throw new PocketPhoneHostError('CLOSED', 'old bridge closed'); };
  const recovered = await reopen(f, freshHost);
  assert.equal(recovered.phone.snapshot('role-a').memos.length, 1);
  assert.equal(recovered.pending[0].status, 'review-required'); assert.equal(recovered.pending[0].canContinue, false);
  await assert.rejects(recovered.conversation.resume(), error => error.code === 'NOT_RESUMABLE');
  assert.equal(f.calls.filter(value => value.method === 'ai.generate').length, 1);
  waiting.resolve(); await old; recovered.conversation.dispose();
});

test('journal failure before user append blocks every following side effect', async () => {
  const f = await fixture([plan()]);
  f.host.storageSet = async () => { throw new PocketPhoneHostError('HOST_FAILED', 'storage unavailable'); };
  await assert.rejects(f.conversation.send({ text: '不能发送' }));
  assert.equal(f.messages.length, 0); assert.equal(f.calls.length, 0); f.conversation.dispose();
});

test('journal failure before a tool prevents execution and an explicit repaired resume executes it once', async () => {
  const f = await fixture([plan([memo('修复后执行一次')]), plan([], '完成')]);
  const save = f.host.storageSet.bind(f.host); let blockTool = true;
  f.host.storageSet = async (key, value) => {
    if (blockTool && key === CONVERSATION_JOURNAL_KEY && value.turns.some(turn => turn.intent?.kind === 'tool')) {
      throw new PocketPhoneHostError('HOST_FAILED', 'not persisted');
    }
    return save(key, value);
  };
  const paused = await f.conversation.send({ text: '写一条' });
  assert.equal(paused.status, 'paused'); assert.equal(f.phone.snapshot('role-a').memos.length, 0);
  assert.equal(paused.tools, 0); assert.equal(paused.canContinue, true);
  blockTool = false; const result = await f.conversation.resume();
  assert.equal(result.status, 'complete'); assert.equal(f.phone.snapshot('role-a').memos.length, 1);
  assert.equal(f.messages.filter(message => message.role === 'user').length, 1); f.conversation.dispose();
});

test('pending journals for separate roles/chats survive other sends and remain independently resumable', async () => {
  const denied = () => { throw new PocketPhoneHostError('USER_CANCELLED', '暂不生成'); };
  const f = await fixture([denied, denied, plan([], '甲的回复')]);
  const a = await f.conversation.send({ text: '甲的消息' });
  f.change({ roleId: 'role-b', roleName: '乙', chatId: 'chat-b' });
  const b = await f.conversation.send({ text: '乙的消息' });
  assert.equal(f.stored.get(CONVERSATION_JOURNAL_KEY).turns.filter(value => value.status !== 'complete').length, 2);
  f.conversation.dispose(); f.change({ roleId: 'role-a', roleName: '甲', chatId: 'chat-a' });
  const recovered = await reopen(f);
  assert.equal(recovered.pending.length, 2);
  assert.equal(recovered.conversation.pendingFor({ roleId: 'role-a', chatId: 'chat-a' }).turnId, a.turnId);
  assert.equal(recovered.conversation.pendingFor({ roleId: 'role-b', chatId: 'chat-b' }).turnId, b.turnId);
  assert.equal((await recovered.conversation.resume({ turnId: a.turnId })).status, 'complete');
  assert.ok(f.stored.get(CONVERSATION_JOURNAL_KEY).turns.some(turn => turn.id === b.turnId && turn.status !== 'complete'));
  recovered.conversation.dispose();
});

test('corrupt journal is preserved and blocks new side effects rather than silently resetting', async () => {
  const f = await fixture([plan()]); f.stored.set(CONVERSATION_JOURNAL_KEY, { format: 'wrong', version: 1, turns: [] });
  await assert.rejects(f.conversation.restore(), error => error.code === 'JOURNAL_CORRUPT');
  await assert.rejects(f.conversation.send({ text: '不应发送' }), error => error.code === 'JOURNAL_CORRUPT');
  assert.equal(f.messages.length, 0); assert.deepEqual(f.stored.get(CONVERSATION_JOURNAL_KEY), { format: 'wrong', version: 1, turns: [] });
  f.conversation.dispose();
});

test('a stale second controller detects an existing journal change before appending another user message', async () => {
  const f = await fixture([() => { throw new PocketPhoneHostError('USER_CANCELLED', '暂停'); }]);
  await f.conversation.restore();
  const second = new PocketPhoneConversation({ host: f.host, phone: f.phone });
  const saved = await second.send({ text: '另一页面已保存的消息' });
  assert.equal(saved.status, 'paused');
  await assert.rejects(f.conversation.send({ text: '过时页面不应覆盖回执' }), error => error.code === 'JOURNAL_CONFLICT');
  assert.equal(f.messages.length, 1);
  assert.ok(f.stored.get(CONVERSATION_JOURNAL_KEY).turns.some(turn => turn.id === saved.turnId));
  f.conversation.dispose(); second.dispose();
});

test('scope changes discard late plans and block resume even when role/shared revisions are identical', async () => {
  const wait = deferred(), started = deferred();
  const f = await fixture([() => { started.resolve(); return wait.promise; }, plan([memo('切回后写入')]), plan([], '已完成')]);
  const sharedValues = new Map();
  const shared = new PocketPhoneStore({ storage: {
    async get(key) { return sharedValues.get(key) ?? null; },
    async set(key, value) { sharedValues.set(key, structuredClone(value)); return true; },
  } }); await shared.restore();
  let mode = 'role';
  f.conversation.phone = {
    get scopeKey() { return mode; },
    snapshot(id) { return (mode === 'role' ? f.phone : shared).snapshot(id); },
    invoke(...args) { return (mode === 'role' ? f.phone : shared).invoke(...args); },
  };
  const pending = f.conversation.send({ text: '写一条' }); await started.promise;
  assert.equal(f.phone.snapshot('role-a').revision, shared.snapshot('role-a').revision);
  mode = 'shared'; wait.resolve(plan([memo('过时计划不可写')])) ;
  const paused = await pending;
  assert.equal(paused.error.code, 'SCOPE_CHANGED'); assert.equal(paused.scopeKey, 'role');
  assert.equal(f.phone.snapshot('role-a').memos.length, 0); assert.equal(shared.snapshot('role-a').memos.length, 0);
  const blocked = await f.conversation.resume(); assert.equal(blocked.error.code, 'SCOPE_CHANGED');
  assert.equal(f.calls.filter(value => value.method === 'ai.generate').length, 1);
  mode = 'role'; const result = await f.conversation.resume();
  assert.equal(result.status, 'complete'); assert.equal(f.phone.snapshot('role-a').memos.length, 1);
  assert.equal(shared.snapshot('role-a').memos.length, 0);
  assert.equal(f.stored.get(CONVERSATION_JOURNAL_KEY).turns.find(turn => turn.id === result.turnId).scopeKey, 'role');
  f.conversation.dispose();
});

test('legacy journals default to role scope and cached final append waits for that original mode', async () => {
  const f = await fixture([plan([], '待写入宿主的最终答复')]);
  const append = f.host.chatAppend.bind(f.host); let deny = true;
  f.host.chatAppend = async params => { if (params.role === 'assistant' && deny) {
    deny = false; throw new PocketPhoneHostError('USER_CANCELLED', '暂停写入'); } return append(params); };
  const first = await f.conversation.send({ text: '你好' }); assert.equal(first.canContinue, true);
  const legacy = f.stored.get(CONVERSATION_JOURNAL_KEY); for (const turn of legacy.turns) delete turn.scopeKey;
  f.stored.set(CONVERSATION_JOURNAL_KEY, legacy); f.conversation.dispose();
  const recovered = await reopen(f); assert.equal(recovered.pending[0].scopeKey, 'role');
  let mode = 'shared'; Object.defineProperty(recovered.phone, 'scopeKey', { get: () => mode });
  const blocked = await recovered.conversation.resume(); assert.equal(blocked.error.code, 'SCOPE_CHANGED');
  assert.equal(f.messages.length, 1); assert.equal(f.calls.filter(value => value.method === 'ai.generate').length, 1);
  mode = 'role'; assert.equal((await recovered.conversation.resume()).status, 'complete');
  assert.equal(f.messages.length, 2); assert.equal(f.calls.filter(value => value.method === 'ai.generate').length, 1);
  recovered.conversation.dispose();
});
