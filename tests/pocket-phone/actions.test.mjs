import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketPhoneActions, PocketPhoneActionError, parsePhonePlan,
  buildPhonePrompt } from '../../plugins/pocket-phone/actions.js';
import { PocketPhoneHost } from '../../plugins/pocket-phone/host.js';
import { PocketPhoneStore, PHONE_STORAGE_KEY } from '../../plugins/pocket-phone/engine.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function memo(title) { return { tool: 'character_phone_write_memo', arguments: {
  record_json: JSON.stringify({ title, content: '正文' }),
} }; }
function plan(actions) { return JSON.stringify({ summary: '模型可能声称已完成', actions }); }

async function fixture(generate = () => ({ text: plan([memo('新记录')]), usage: { output: 7 } })) {
  const values = new Map(), writes = [];
  const phone = new PocketPhoneStore({ storage: {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); writes.push(key); return true; },
  } });
  await phone.restore();
  let context = { roleId: 'role-a', roleName: '甲', chatId: 'chat-a', action: 'update' };
  const listeners = new Map(), calls = [];
  const sdk = {
    async call(method, params) {
      calls.push({ method, params });
      if (method === 'context.get') return { ...context };
      if (method === 'ai.generate') return generate(params);
      throw new Error('unexpected method');
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn); return () => listeners.get(event).delete(fn);
    },
  };
  const host = new PocketPhoneHost(sdk);
  const actions = new PocketPhoneActions({ phone, host });
  return { phone, actions, values, writes, calls,
    change(value, emit = true) { context = { ...context, ...value }; if (emit) this.emit('context.changed', context); },
    emit(event, value = {}) { for (const fn of listeners.get(event) ?? []) fn(value); },
  };
}

test('parser accepts compatibility prefix and rejects whole plans with disallowed fields or tools', () => {
  const valid = memo('合法'); valid.tool = `character_phone_core.${valid.tool}`;
  assert.equal(parsePhonePlan(plan([valid])).actions[0].tool, 'character_phone_write_memo');
  for (const raw of [
    plan([memo('一'), { tool: 'chat.append', arguments: { text: 'no' } }]),
    plan([{ tool: 'character_phone_search_music', arguments: { keywords: 'no' } }]),
    plan([{ tool: 'character_phone_write_memo', arguments: { record_json: '{}', roleId: 'other' } }]),
    plan([{ tool: 'character_phone_write_memo', arguments: { record_json: '[]' } }]),
    plan([{ tool: 'character_phone_read', arguments: { limit: 101 } }]),
    plan(Array.from({ length: 6 }, (_, i) => memo(String(i)))),
    '```json\n' + plan([]) + '\n```', '{"summary":"x","actions":[],"extra":true}',
    plan([memo('x'.repeat(33000))]),
  ]) assert.throws(() => parsePhonePlan(raw), PocketPhoneActionError);
});

test('prompt uses real collection schemas and excludes private data/images without explicit opt in', () => {
  const snapshot = { revision: 0, owner: { avatar: 'DO_NOT_SEND_IMAGE' },
    memos: [{ title: 'PUBLIC_RECORD' }], pornhub: { history: [{ title: 'PRIVATE_RECORD' }] } };
  const prompt = buildPhonePrompt('不要处理私密模块', snapshot);
  assert.match(prompt, /PUBLIC_RECORD/); assert.doesNotMatch(prompt, /PRIVATE_RECORD|DO_NOT_SEND_IMAGE/);
  assert.match(prompt, /ledger.entries/);
  assert.match(buildPhonePrompt('整理私密', snapshot, { allowPrivate: true }), /PRIVATE_RECORD/);
});

test('explicit task goes through one opaque model call and atomically writes captured role', async () => {
  const f = await fixture(() => ({ text: plan([memo('一'), memo('二')]), usage: { input: 9, output: 7 } }));
  const states = []; const off = f.actions.subscribe(state => states.push(state));
  const receipt = await f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写两条备忘录' });
  assert.equal(receipt.applied, 2); assert.equal(receipt.summary, '已完成 2 项小手机操作。');
  assert.deepEqual(receipt.usage, { input: 9, output: 7 });
  assert.equal(f.phone.snapshot('role-a').memos.length, 2);
  assert.equal(f.phone.snapshot('role-b').memos.length, 0);
  assert.equal(f.writes.filter(key => key === PHONE_STORAGE_KEY).length, 1);
  assert.equal(f.calls.filter(call => call.method === 'ai.generate').length, 1);
  assert.deepEqual(f.calls.find(call => call.method === 'ai.generate').params.context, []);
  assert.equal(states[0].busy, true); assert.equal(states.at(-1).busy, false);
  assert.ok(f.calls.every(call => ['context.get', 'ai.generate'].includes(call.method)));
  off(); f.actions.dispose();
});

test('last invalid record rolls back all planned changes before storage', async () => {
  const f = await fixture(() => ({ text: plan([memo('本来合法'), {
    tool: 'character_phone_write_event', arguments: { record_json: '{"title":"错误日期","date":"wrong"}' },
  }]) }));
  await assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写两个记录' }));
  assert.equal(f.phone.snapshot('role-a').memos.length, 0); assert.equal(f.writes.length, 0);
  f.actions.dispose();
});

test('cancel, suspend, context switch and deleted role all discard late model results', async () => {
  for (const kind of ['cancel', 'suspend', 'context', 'deleted']) {
    const pending = deferred(), started = deferred();
    const f = await fixture(() => { started.resolve(); return pending.promise; });
    let exists = true; f.actions.roleExists = () => exists;
    const result = assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写一条' }),
      error => error.code === 'CANCELLED');
    await started.promise;
    if (kind === 'cancel') f.actions.cancel();
    if (kind === 'suspend') f.emit('host.suspend');
    if (kind === 'context') f.change({ roleId: 'role-b', chatId: 'chat-b' });
    if (kind === 'deleted') exists = false;
    pending.resolve({ text: plan([memo('不得采用')]) });
    await result;
    assert.equal(f.phone.snapshot('role-a').memos.length, 0);
    assert.equal(f.phone.snapshot('role-b').memos.length, 0);
    assert.equal(f.actions.busy, false); f.actions.dispose();
  }
});

test('a missed context event is detected before commit; mismatched initial role never requests AI', async () => {
  const pending = deferred(), started = deferred();
  const f = await fixture(() => { started.resolve(); return pending.promise; });
  const result = assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写一条' }),
    error => error.code === 'CONTEXT_CHANGED');
  await started.promise; f.change({ chatId: 'other-chat' }, false);
  pending.resolve({ text: plan([memo('不得采用')]) });
  await result; assert.equal(f.writes.length, 0);
  await assert.rejects(f.actions.run({ roleId: 'role-b', caller: '乙', instruction: '写一条' }),
    error => error.code === 'CONTEXT_CHANGED');
  assert.equal(f.calls.filter(call => call.method === 'ai.generate').length, 1);
  f.actions.dispose();
});

test('revision conflict preserves a user edit completed while the model was generating', async () => {
  const pending = deferred(), started = deferred();
  const f = await fixture(() => { started.resolve(); return pending.promise; });
  const result = assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写一条' }),
    error => error.code === 'revision_conflict');
  await started.promise;
  await f.phone.invoke('character_phone_write_memo', { record_json: '{"title":"用户刚刚编辑"}' }, { roleId: 'role-a' });
  pending.resolve({ text: plan([memo('陈旧结果')]) });
  await result;
  assert.equal(f.phone.snapshot('role-a').memos.length, 1);
  assert.equal(f.phone.snapshot('role-a').memos[0].title, '用户刚刚编辑');
  f.actions.dispose();
});

test('private tools need an explicit boolean grant and malformed JSON never changes data', async () => {
  for (const text of ['{"summary":"unfinished","actions":[', plan([
    { tool: 'character_phone_read', arguments: { module: 'pornhub' } },
  ])]) {
    const f = await fixture(() => ({ text }));
    await assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '不要处理私密' }));
    assert.equal(f.writes.length, 0); f.actions.dispose();
  }
  const f = await fixture(() => ({ text: plan([
    { tool: 'character_phone_read', arguments: { module: 'pornhub' } },
  ]) }));
  const receipt = await f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '读私密', allowPrivate: true });
  assert.equal(receipt.applied, 1); assert.equal(f.writes.length, 0); f.actions.dispose();
});

test('mayCommit checks epoch again after an action has queued; arbitrary errors stay sanitized', async () => {
  const queued = deferred(), release = deferred();
  const f = await fixture();
  f.actions.phone = { snapshot: id => f.phone.snapshot(id), async invokeBatch(actions, options) {
    queued.resolve(); await release.promise;
    if (!options.mayCommit()) throw new PocketPhoneActionError('CANCELLED', 'cancelled');
    throw new Error('SECRET https://internal.invalid/token=SECRET');
  } };
  const result = assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写一条' }),
    error => error.code === 'CANCELLED');
  await queued.promise; f.actions.cancel(); release.resolve(); await result;
  f.actions.phone.invokeBatch = async () => { throw new Error('SECRET https://internal.invalid/token=SECRET'); };
  await assert.rejects(f.actions.run({ roleId: 'role-a', caller: '甲', instruction: '写一条' }),
    error => error.code === 'TASK_FAILED' && !error.message.includes('SECRET'));
  assert.doesNotMatch(f.actions.error, /SECRET|internal/); f.actions.dispose();
});
