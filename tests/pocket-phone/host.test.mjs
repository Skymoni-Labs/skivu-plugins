import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketPhoneHost, PocketPhoneHostError, MAX_HOST_BYTES,
  encodeBase64, decodeBase64 } from '../../plugins/pocket-phone/host.js';

test('chat ports preserve only text messages and require a confirmed saved id', async () => {
  const sdk=mockSdk(method=>method==='chat.read'?[{id:'chat:1',role:'assistant',text:'你好',internal:'not exposed'}]:{id:'chat:2'});
  const host=new PocketPhoneHost(sdk);
  assert.deepEqual(await host.chatRead({limit:25}),[{id:'chat:1',role:'assistant',text:'你好'}]);
  assert.deepEqual(await host.chatAppend({role:'user',text:'今天怎么样'}),{id:'chat:2'});
  assert.deepEqual(sdk.calls,[{method:'chat.read',params:{limit:25}},{method:'chat.append',params:{role:'user',text:'今天怎么样'}}]);
  await assert.rejects(new PocketPhoneHost(mockSdk(()=>true)).chatAppend({role:'assistant',text:'未确认'}),e=>e.code==='INVALID_RESPONSE');
});

test('chat and local network errors remain explicit without leaking raw host text', async () => {
  const host=new PocketPhoneHost(mockSdk(()=>{throw Object.assign(new Error('private-url secret'),{code:'USER_DENIED'});}));
  await assert.rejects(host.chatAppend({role:'user',text:'测试'}),e=>e.code==='USER_CANCELLED'&&!e.message.includes('secret'));
  const denied=new PocketPhoneHost(mockSdk(()=>{throw Object.assign(new Error('private-data'),{code:'PERMISSION_DENIED'});}));
  await assert.rejects(denied.chatRead(),e=>e.code==='PERMISSION_DENIED');
});

test('chat shape and scope parameters reject invalid input before any bridge call', async () => {
  const sdk=mockSdk(),host=new PocketPhoneHost(sdk);
  for(const limit of [0,101,1.5])await assert.rejects(host.chatRead({limit}));
  for(const message of [{role:'system',text:'x'},{role:'user',text:''},{role:'assistant',text:'x'.repeat(30001)}])await assert.rejects(host.chatAppend(message));
  assert.equal(sdk.calls.length,0);
  for(const invalid of [[{role:'system',text:'x'}],[{role:'assistant',content:'wrong field'}],{}])await assert.rejects(new PocketPhoneHost(mockSdk(()=>invalid)).chatRead(),e=>e.code==='INVALID_RESPONSE');
});

function mockSdk(reply = () => true) {
  const calls = [], listeners = new Map();
  return { calls, apiVersion: '1.0',
    async call(method, params) { calls.push({ method, params }); return reply(method, params); },
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => listeners.get(event).delete(callback);
    },
    emit(event, value) { for (const callback of listeners.get(event) ?? []) callback(value); },
  };
}

test('thin port uses only declared SDK methods and forwards lifecycle subscriptions', async () => {
  const sdk = mockSdk(method => method === 'context.get'
    ? { roleId: 'a', roleName: '甲', chatId: 'c', action: 'open', secret: 'never-forward' }
    : method === 'characters.list' ? [{ id: 'a', name: '甲' }] : true);
  const host = new PocketPhoneHost(sdk);
  assert.deepEqual(await host.context(), { roleId: 'a', roleName: '甲', chatId: 'c', action: 'open' });
  assert.deepEqual(await host.characters(), [{ id: 'a', name: '甲' }]);
  await host.characters('a'); await host.info();
  await host.storageGet('phone'); await host.storageSet('phone', { revision: 1 });
  await host.storageRemove('phone');
  await host.secretGet('cookie'); await host.secretSet('cookie', 'my-plugin-secret'); await host.secretRemove('cookie');
  let context = 0, suspended = 0;
  const off = host.subscribeContext(() => context++), stop = host.onSuspend(() => suspended++);
  sdk.emit('context.changed', {}); sdk.emit('host.suspend', {}); off(); stop();
  sdk.emit('context.changed', {});
  assert.equal(context, 1); assert.equal(suspended, 1);
  assert.deepEqual(sdk.calls.map(call => call.method), ['context.get', 'characters.list', 'characters.get',
    'host.info', 'storage.get', 'storage.set', 'storage.remove', 'secrets.get', 'secrets.set', 'secrets.remove']);
});

test('network requests go through https.request and preserve private plugin auth without logging it', async () => {
  const sdk = mockSdk(() => ({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' }));
  const host = new PocketPhoneHost(sdk);
  const reply = await host.request({ url: 'https://api.example/custom', method: 'POST',
    headers: { Authorization: 'Bearer own-key', Cookie: 'own-cookie' }, body: '{}', responseType: 'json' });
  assert.equal(reply.body, '{"ok":true}');
  assert.deepEqual(sdk.calls[0], { method: 'https.request', params: {
    url: 'https://api.example/custom', method: 'POST',
    headers: { Authorization: 'Bearer own-key', Cookie: 'own-cookie' }, body: '{}',
  } });
});

test('non-success HTTP and raw host exceptions never expose body, internal URL or secrets', async () => {
  for (const status of [302, 401, 404, 500]) {
    const host = new PocketPhoneHost(mockSdk(() => ({ status, headers: {}, body: 'own-key http://internal/private' })));
    await assert.rejects(host.request({ url: 'https://api.example' }), error =>
      error instanceof PocketPhoneHostError && error.status === status &&
      !error.message.includes('own-key') && !error.message.includes('internal'));
  }
  const host = new PocketPhoneHost(mockSdk(() => {
    const failure = new Error('Bearer SECRET https://inside.example/key=SECRET'); failure.code = 'NOT_FOUND'; throw failure;
  }));
  await assert.rejects(host.secretGet('cookie'), error => error.code === 'NOT_FOUND' && !error.message.includes('SECRET'));
});

test('binary transfers round trip the full 8 MiB without argument-spread stack overflow', async () => {
  const bytes = new Uint8Array(MAX_HOST_BYTES);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const encoded = encodeBase64(bytes);
  assert.deepEqual(decodeBase64(encoded), bytes);
  const sdk = mockSdk((method, params) => method === 'https.request'
    ? { status: 200, headers: {}, base64: encoded } : method === 'fs.read'
      ? { base64: params.path === 'empty.bin' ? '' : encoded } : true);
  const host = new PocketPhoneHost(sdk);
  assert.deepEqual((await host.request({ url: 'https://images.example/file', responseType: 'bytes' })).bytes, bytes);
  assert.equal(sdk.calls[0].params.responseType, 'base64');
  await host.writeFile('images/test', bytes);
  assert.deepEqual(await host.readFile('images/test'), bytes);
  assert.deepEqual(await host.readFile('empty.bin'), new Uint8Array());
  assert.throws(() => encodeBase64(new Uint8Array(MAX_HOST_BYTES + 1)), /8 MiB/);
});

test('file paths cannot escape the plugin workspace; picker/save have explicit byte caps', async () => {
  const sdk = mockSdk(method => method === 'files.pick'
    ? { name: 'phone.json', mime: 'application/json', base64: 'e30=' }
    : method === 'fs.list' ? ['images/a', 'phone.json'] : true);
  const host = new PocketPhoneHost(sdk);
  for (const value of ['../secret', '/etc/passwd', 'C:/secret', 'a\\b', 'a/../b', '%2e%2e/secret', 'a//b']) {
    await assert.rejects(host.readFile(value), /相对路径/);
  }
  assert.equal(sdk.calls.length, 0);
  assert.deepEqual(await host.pickFile(), { name: 'phone.json', mime: 'application/json', bytes: new Uint8Array([123, 125]) });
  assert.deepEqual(await host.list(), ['images/a', 'phone.json']);
  assert.equal(await host.saveFile({ name: 'phone.json', mime: 'application/json', bytes: new Uint8Array([123, 125]) }), true);
  await host.remove('images/a');
  await assert.rejects(host.saveFile({ name: '../escape', bytes: new Uint8Array() }), /文件名/);
});

test('invalid statuses, response caps, timeouts and malformed binary are rejected', async () => {
  for (const response of [{ status: '200', body: '' }, { status: 200, body: '12345' },
    { status: 200, base64: 'not base64' }]) {
    const host = new PocketPhoneHost(mockSdk(() => response));
    await assert.rejects(host.request({ url: 'https://api.example', responseType: response.base64 ? 'bytes' : 'text', maxBytes: 4 }));
  }
  const host = new PocketPhoneHost(mockSdk(() => new Promise(() => {})));
  await assert.rejects(host.request({ url: 'https://api.example', timeoutMs: 2 }), error => error.code === 'TIMEOUT');
  assert.throws(() => decodeBase64('a==='), /无效/);
});

test('ai.generate remains opaque and does not read chat, model configuration or credentials', async () => {
  const sdk = mockSdk(() => ({ text: '{"actions":[]}', usage: { input: 2, output: 3, cached: null, apiKey: 'never-forward' }, modelConfig: 'never-forward' }));
  const host = new PocketPhoneHost(sdk);
  const result = await host.aiGenerate({ roleId: 'a', instruction: 'task',
    context: [{ role: 'user', content: 'provided plugin data' }], maxOutput: 4096 });
  assert.deepEqual(result, { text: '{"actions":[]}', usage: { input: 2, output: 3, cached: null } });
  assert.equal(sdk.calls.length, 1); assert.equal(sdk.calls[0].method, 'ai.generate');
  await assert.rejects(host.aiGenerate({ roleId: 'a', instruction: 'task', context: { private: true } }));
  assert.equal(sdk.calls.length, 1);
});

test('model publication errors preserve the required actionable message', async () => {
  const host = new PocketPhoneHost(mockSdk(() => { const e = new Error('raw'); e.code = 'model_not_available'; throw e; }));
  await assert.rejects(host.aiGenerate({ roleId: 'a', instruction: 'task' }), error =>
    error.code === 'model_not_available' && error.message === '模型未开放或已下架，请更新模型列表并切换到当前可用模型');
});
