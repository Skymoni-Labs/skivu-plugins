import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketPhoneServices, PocketPhoneServiceError } from '../../plugins/pocket-phone/services.js';
import { PocketPhoneHost } from '../../plugins/pocket-phone/host.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = Uint8Array.from(atob(PNG), c => c.charCodeAt(0));

function fixture() {
  const storage = new Map(), secrets = new Map(), requests = [];
  let handler = async () => ({ status: 200, body: { code: 200 } });
  const host = {
    storageGet: async key => storage.get(key) ?? null,
    storageSet: async (key, value) => { storage.set(key, structuredClone(value)); },
    storageRemove: async key => { storage.delete(key); },
    secretGet: async key => secrets.get(key) ?? null,
    secretSet: async (key, value) => { secrets.set(key, value); },
    secretRemove: async key => { secrets.delete(key); },
    request: async options => { requests.push(options); return handler(options); },
  };
  return { host, storage, secrets, requests, service: new PocketPhoneServices(host), setHandler: next => { handler = next; } };
}

const rejectsCode = (operation, code) => assert.rejects(operation, error => {
  assert.ok(error instanceof PocketPhoneServiceError);
  assert.equal(error.code, code);
  assert.ok(!error.message.includes('SECRET'));
  return true;
});

const configureImage = service => service.saveImageConfig({ baseUrl: 'https://images.example/v1', model: 'image-model', apiKey: 'IMAGE_SECRET' });

test('config uses separate plugin secret and public stores and restores without requests', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example/', cookie: 'MUSIC_SECRET' });
  await configureImage(f.service);
  assert.deepEqual(f.service.publicMusicConfig(), { baseUrl: 'https://music.example', hasCookie: true });
  assert.deepEqual(f.service.publicImageConfig(), { baseUrl: 'https://images.example/v1', model: 'image-model', size: '1024x1024', style: '', hasApiKey: true });
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('SECRET'));
  assert.ok([...f.secrets.keys()].every(key => key.startsWith('pocket-phone.')));
  const restored = new PocketPhoneServices(f.host);
  await restored.restore();
  assert.deepEqual(restored.publicMusicConfig(), f.service.publicMusicConfig());
  assert.deepEqual(restored.publicImageConfig(), f.service.publicImageConfig());
  assert.equal(f.requests.length, 0);
});

test('blank secrets retain current address credential and address changes clear it', async () => {
  const { service, secrets } = fixture();
  await service.saveMusicConfig({ baseUrl: 'https://music.example', cookie: 'MUSIC_SECRET' });
  await service.saveMusicConfig({ baseUrl: 'https://music.example/', cookie: ' ' });
  assert.equal(service.publicMusicConfig().hasCookie, true);
  await service.saveMusicConfig({ baseUrl: 'https://other.example' });
  assert.equal(service.publicMusicConfig().hasCookie, false);
  await configureImage(service);
  await service.saveImageConfig({ baseUrl: 'https://images.example/v1', model: 'image-model', apiKey: '' });
  assert.equal(service.publicImageConfig().hasApiKey, true);
  await service.saveImageConfig({ baseUrl: 'https://new.example/v1', model: 'image-model' });
  assert.equal(service.publicImageConfig().hasApiKey, false);
  assert.equal(secrets.size, 0);
});

test('clear flags and full clears affect their own service only', async () => {
  const { service, storage, secrets } = fixture();
  await service.saveMusicConfig({ baseUrl: 'https://music.example', cookie: 'MUSIC_SECRET' });
  await configureImage(service);
  await service.saveMusicConfig({ baseUrl: 'https://music.example', clearCookie: true });
  assert.equal(service.publicMusicConfig().hasCookie, false);
  assert.equal(service.publicImageConfig().hasApiKey, true);
  await service.clearMusicConfig();
  assert.equal(service.publicImageConfig().hasApiKey, true);
  await service.saveImageConfig({ baseUrl: 'https://images.example/v1', model: 'image-model', clearApiKey: true });
  assert.equal(service.publicImageConfig().hasApiKey, false);
  await service.clearImageConfig();
  assert.equal(secrets.size, 0);
  assert.equal(storage.size, 0);
});

test('restoration fails closed when stored credential belongs to another address', async () => {
  const f = fixture();
  await configureImage(f.service);
  const key = [...f.storage.keys()].find(k => k.includes('image'));
  f.storage.set(key, { ...f.storage.get(key), baseUrl: 'https://different.example/v1' });
  const restored = new PocketPhoneServices(f.host);
  await restored.restore();
  assert.equal(restored.publicImageConfig().hasApiKey, false);
});

test('secure storage failures do not fall back to public storage', async () => {
  const f = fixture();
  f.host.secretSet = async () => { throw new Error('SECRET backend details'); };
  await rejectsCode(() => configureImage(f.service), 'storage_error');
  assert.equal(f.storage.size, 0);
  assert.equal(f.service.publicImageConfig().hasApiKey, false);
});

for (const address of ['http://localhost:3000', 'http://127.0.0.1:3000/api']) {
  test('local music is restored and routed only through an authorized host proxy', async () => {
    const f = fixture();
    await f.service.saveMusicConfig({ baseUrl: address, cookie: 'MUSIC_SECRET' });
    assert.equal(f.requests.length, 0);
    const restored = new PocketPhoneServices(f.host);
    await restored.restore();
    assert.deepEqual(restored.publicMusicConfig(), { baseUrl: address, hasCookie: true });
    let granted = false;
    f.setHandler(async options => {
      assert.equal(options.url, `${address}/login/status`);
      // The business port forwards to SDK network.request, which owns the
      // manifest + actual user grant check. No service-side flag replaces it.
      if (!granted) throw { code: 'PERMISSION_REQUIRED', message: 'SECRET host details' };
      assert.equal(JSON.parse(options.body).cookie, 'MUSIC_SECRET');
      return { status: 200, body: { data: { code: 200, profile: { userId: 42 } } } };
    });
    await rejectsCode(() => restored.music('music_status'), 'local_permission_required');
    assert.equal(f.requests.length, 1);
    granted = true;
    assert.equal((await restored.music('music_status')).authenticated, true);
    assert.equal(f.requests.length, 2);
    granted = false;
    await rejectsCode(() => restored.music('music_status'), 'local_permission_required');
    assert.equal(f.requests.length, 3);
  });
}

test('local permission rejection never attempts the music fallback endpoint', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'http://127.0.0.1:3000', cookie: 'MUSIC_SECRET' });
  f.setHandler(async () => { throw { code: 'PERMISSION_DENIED', message: 'SECRET denied' }; });
  await rejectsCode(() => f.service.music('music_search', { query: 'Song' }), 'local_permission_required');
  assert.equal(f.requests.length, 1);
});

for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
  test('local audio only returns same-origin HTTP URLs without extra HEAD or media requests', async () => {
    const f = fixture();
    await f.service.saveMusicConfig({ baseUrl: `${origin}/api`, cookie: 'MUSIC_SECRET' });
    f.setHandler(async options => {
      assert.equal(options.method, 'POST');
      if (options.url.endsWith('/song/detail')) return { status: 200, body: { code: 200, songs: [{ id: 42, name: 'Local WAV' }] } };
      return { status: 200, body: { code: 200, data: [{ id: 42, url: `${origin}/audio/tone.wav?token=opaque` }] } };
    });
    const source = await f.service.music('music_source', { song_id: 42 });
    assert.equal(source.url, `${origin}/audio/tone.wav?token=opaque`);
    assert.equal(f.requests.length, 1);
    const played = await f.service.music('music_play', { songId: 42 });
    assert.equal(played.url, source.url);
    assert.equal(played.track.title, 'Local WAV');
    assert.equal(f.requests.length, 3);
    assert.ok(f.requests.every(request => request.method === 'POST'));
  });
}

for (const audioUrl of ['http://localhost:3001/audio.wav', 'http://127.0.0.1:3000/audio.wav',
  'http://2130706433:3000/audio.wav', 'http://0x7f000001:3000/audio.wav',
  'http://127.1:3000/audio.wav', 'http://localhost.:3000/audio.wav',
  'http://a.localhost:3000/audio.wav', 'http://[::1]:3000/audio.wav',
  'http://192.168.1.1:3000/audio.wav', 'http://user:SECRET@localhost:3000/audio.wav',
  'http://localhost:3000/audio.wav#SECRET']) {
  test('local music rejects different audio origins, spelling aliases or unsafe options', async () => {
    const f = fixture();
    await f.service.saveMusicConfig({ baseUrl: 'http://localhost:3000/api' });
    f.setHandler(async () => ({ status: 200, body: { code: 200, data: [{ url: audioUrl }] } }));
    await rejectsCode(() => f.service.music('music_source', { songId: 42 }), 'music_unavailable');
    assert.equal(f.requests.length, 1);
  });
}

test('HTTPS music configuration cannot authorize any HTTP audio origin', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example' });
  for (const url of ['http://music.example/audio.wav', 'http://localhost:3000/audio.wav', 'http://127.0.0.1:3000/audio.wav']) {
    f.setHandler(async () => ({ status: 200, body: { code: 200, data: [{ url }] } }));
    await rejectsCode(() => f.service.music('music_source', { songId: 42 }), 'music_unavailable');
  }
});

for (const alias of ['2130706433', '0x7f000001', '127.1']) {
  test('loopback aliases remain forbidden even when canonical origin would match 127.0.0.1', async () => {
    const f = fixture();
    await f.service.saveMusicConfig({ baseUrl: 'http://127.0.0.1:3000' });
    f.setHandler(async () => ({ status: 200, body: { code: 200, data: [{ url: `http://${alias}:3000/audio.wav` }] } }));
    await rejectsCode(() => f.service.music('music_source', { songId: 42 }), 'music_unavailable');
  });
}

test('actual local audio GET goes through adapter network.request and rechecks SDK grant', async () => {
  const calls = [];
  const audioBytes = Uint8Array.from([82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69]);
  const storage = new Map(), secrets = new Map();
  let localGranted = true;
  const sdk = {
    on: () => () => {},
    async call(method, params) {
      calls.push({ method, params });
      if (method === 'secrets.set') { secrets.set(params.key, params.value); return true; }
      if (method === 'secrets.remove') { secrets.delete(params.key); return true; }
      if (method === 'storage.set') { storage.set(params.key, params.value); return true; }
      assert.equal(method, 'network.request');
      if (!localGranted) throw { code: 'PERMISSION_DENIED', message: 'SECRET permission details' };
      if (params.method === 'POST') return { status: 200, headers: {}, body: JSON.stringify({ code: 200, data: [{ id: 42, url: 'http://localhost:3000/tone.wav' }] }) };
      assert.equal(params.method, 'GET');
      assert.equal(params.url, 'http://localhost:3000/tone.wav');
      assert.equal(params.responseType, 'base64');
      assert.deepEqual(params.headers, {});
      return { status: 200, headers: { 'content-type': 'audio/wav' }, base64: btoa(String.fromCharCode(...audioBytes)) };
    },
  };
  const host = new PocketPhoneHost(sdk);
  const service = new PocketPhoneServices(host);
  await service.saveMusicConfig({ baseUrl: 'http://localhost:3000', cookie: 'MUSIC_SECRET' });
  const source = await service.music('music_source', { songId: 42 });
  assert.equal(calls.filter(c => c.method === 'network.request').length, 1);
  // Mirror loadMusic: the returned source is only a URL until the actual
  // bytes are obtained from this SDK-controlled GET. No direct audio URL load.
  const response = await host.request({ url: source.url, responseType: 'bytes', maxBytes: 8 * 1024 * 1024 });
  assert.deepEqual(response.bytes, audioBytes);
  assert.equal(calls.filter(c => c.method === 'network.request').length, 2);
  localGranted = false;
  await assert.rejects(() => host.request({ url: source.url, responseType: 'bytes' }), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('SECRET'));
  assert.equal(calls.filter(c => c.method === 'https.request').length, 0);
});

test('changing local backend clears credentials, including port and path changes', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'http://localhost:3000', cookie: 'MUSIC_SECRET' });
  await f.service.saveMusicConfig({ baseUrl: 'http://localhost:3000/', cookie: '' });
  assert.equal(f.service.publicMusicConfig().hasCookie, true);
  await f.service.saveMusicConfig({ baseUrl: 'http://localhost:3001' });
  assert.equal(f.service.publicMusicConfig().hasCookie, false);
  await f.service.saveMusicConfig({ baseUrl: 'http://localhost:3001', cookie: 'MUSIC_SECRET' });
  await f.service.saveMusicConfig({ baseUrl: 'http://localhost:3001/other' });
  assert.equal(f.service.publicMusicConfig().hasCookie, false);
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example' });
  assert.equal(f.service.publicMusicConfig().hasCookie, false);
});

for (const address of ['http://192.168.1.1:3000', 'http://10.0.0.1', 'http://127.0.0.2',
  'http://[::1]:3000', 'http://2130706433:3000', 'http://0x7f000001:3000',
  'http://127.1:3000', 'http://localhost.:3000', 'http://a.localhost:3000',
  'http://localhost:0', 'http://user:SECRET@localhost:3000',
  'http://localhost:3000?cookie=SECRET', 'http://localhost:3000#SECRET']) {
  test('local music does not widen arbitrary LAN, aliases or unsafe URL options', async () => {
    const f = fixture();
    await rejectsCode(() => f.service.saveMusicConfig({ baseUrl: address }), 'invalid_base_url');
    assert.equal(f.requests.length, 0);
  });
}

test('local music support never enables HTTP or private image generation/download', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'http://127.0.0.1:3000' });
  for (const address of ['http://127.0.0.1:3000/v1', 'http://localhost:3000/v1', 'https://127.0.0.1/v1']) {
    await rejectsCode(() => f.service.saveImageConfig({ baseUrl: address, model: 'image-model', apiKey: 'IMAGE_SECRET' }), 'invalid_base_url');
  }
  assert.equal(f.requests.length, 0);
  await configureImage(f.service);
  f.setHandler(async () => ({ status: 200, body: { data: [{ url: 'http://localhost:3000/private.png' }] } }));
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'unsafe_image_url');
  assert.equal(f.requests.length, 1);
});

for (const url of ['http://music.example', 'https://user:SECRET@music.example',
  'https://music.example?key=SECRET', 'https://music.example#SECRET', 'https://music.example/path\nSECRET',
  'file:///tmp/SECRET', 'https://localhost', 'https://127.0.0.1', 'https://0x7f000001',
  'https://2130706433', 'https://10.0.0.1', 'https://172.16.1.1', 'https://169.254.169.254',
  'https://192.168.0.1', 'https://100.64.0.1', 'https://[::1]', 'https://[::ffff:127.0.0.1]',
  'https://[fc00::1]', 'https://[2001:db8::1]', 'https://host.internal']) {
  test(`unsafe base URL rejected: ${url.split(':')[0]}`, async () => {
    const f = fixture();
    await rejectsCode(() => f.service.saveMusicConfig({ baseUrl: url }), 'invalid_base_url');
    assert.equal(f.requests.length, 0);
    assert.equal(f.storage.size, 0);
  });
}

test('unconfigured status is local and public config is a defensive copy', async () => {
  const f = fixture();
  const config = f.service.publicMusicConfig();
  config.baseUrl = 'https://evil.example';
  assert.deepEqual(await f.service.music('music_status'), { configured: false, authenticated: false });
  assert.equal(f.requests.length, 0);
});

test('music search fallback uses POST JSON and original track shape in seconds', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example/api', cookie: 'MUSIC_SECRET' });
  f.setHandler(async request => {
    assert.equal(request.method, 'POST');
    assert.equal(request.responseType, 'json');
    assert.equal(request.maxBytes, 8 * 1024 * 1024);
    assert.equal(request.timeoutMs, 30000);
    assert.equal(JSON.parse(request.body).cookie, 'MUSIC_SECRET');
    assert.equal(JSON.parse(request.body).limit, 50);
    if (request.url.endsWith('/cloudsearch')) return { status: 404, body: 'SECRET upstream' };
    return { status: 200, body: { code: 200, result: { songCount: 1, songs: [
      { id: 42, name: 'Song', ar: [{ name: 'Artist' }], al: { picUrl: 'https://cdn.example/a.jpg' }, dt: 12345, cookie: 'SECRET' },
    ] } } };
  });
  const result = await f.service.music('music_search', { keywords: 'Song', limit: 999 });
  assert.deepEqual(result, { total: 1, tracks: [{ id: 'ncm_42', songId: '42', title: 'Song', artist: 'Artist', cover: 'https://cdn.example/a.jpg', duration: 12.345, provider: 'netease' }] });
  assert.deepEqual(f.requests.map(r => new URL(r.url).pathname), ['/api/cloudsearch', '/api/search']);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('music play accepts ncm_ ids and song_id and uses URL API fallback', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example' });
  f.setHandler(async request => {
    const path = new URL(request.url).pathname;
    if (path === '/song/url/v1') return { status: 200, body: { code: 404 } };
    if (path === '/song/url') {
      assert.equal(JSON.parse(request.body).id, '42');
      return { status: 200, body: { code: 200, data: [{ id: 42, url: 'https://audio.example/song.mp3' }] } };
    }
    assert.equal(JSON.parse(request.body).ids, '42');
    return { status: 200, body: { code: 200, songs: [{ id: 42, name: 'Song' }] } };
  });
  const played = await f.service.music('music_play', { id: 'ncm_42' });
  assert.equal(played.track.songId, '42');
  assert.equal(played.track.provider, 'netease');
  assert.equal(played.url, 'https://audio.example/song.mp3');
  const source = await f.service.music('music_source', { song_id: 42 });
  assert.equal(source.available, true);
  assert.equal(source.id, 'ncm_42');
});

test('adapter HTTP_STATUS exceptions preserve endpoint fallback without exposing details', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example' });
  f.setHandler(async request => {
    if (request.url.endsWith('/cloudsearch')) throw { code: 'HTTP_STATUS', status: 404, message: 'SECRET response' };
    return { status: 200, body: '{"code":200,"result":{"songs":[],"songCount":0}}' };
  });
  assert.deepEqual(await f.service.music('music_search', { query: 'Song' }), { tracks: [], total: 0 });
  assert.equal(f.requests.length, 2);
});

test('music status only returns whitelisted profile fields', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example' });
  f.setHandler(async () => ({ status: 200, body: { data: { code: 200, profile: { userId: 7, nickname: 'User', cookie: 'SECRET' }, cookie: 'SECRET' } } }));
  assert.deepEqual(await f.service.music('music_status'), { configured: true, authenticated: true, profile: { userId: '7', nickname: 'User', avatarUrl: '' } });
});

test('private or HTTP song URLs are not handed to player', async () => {
  const f = fixture();
  await f.service.saveMusicConfig({ baseUrl: 'https://music.example' });
  for (const url of ['http://audio.example/song', 'https://127.0.0.1/song', 'https://host.local/song']) {
    f.setHandler(async () => ({ status: 200, body: { code: 200, data: [{ url }] } }));
    await rejectsCode(() => f.service.music('music_source', { songId: 42 }), 'music_unavailable');
  }
});

test('generation sends one explicit text-only n=1 operation with appended style', async () => {
  const f = fixture();
  await f.service.saveImageConfig({ baseUrl: 'https://images.example/v1', model: 'image-model', apiKey: 'IMAGE_SECRET', style: '柔和水彩' });
  f.setHandler(async request => {
    assert.equal(request.url, 'https://images.example/v1/images/generations');
    assert.equal(request.headers.Authorization, 'Bearer IMAGE_SECRET');
    assert.deepEqual(JSON.parse(request.body), { model: 'image-model', prompt: 'A cloud\n\n视觉风格：柔和水彩', n: 1, size: '1024x1024' });
    return { status: 200, body: { data: [{ b64_json: PNG }] } };
  });
  const result = await f.service.generateImage({ prompt: 'A cloud' });
  assert.deepEqual(result.bytes, png);
  assert.equal(result.mime, 'image/png');
  assert.equal(f.requests.length, 1);
});

test('same concurrent generation deduplicates; later explicit request remains fresh', async () => {
  const f = fixture();
  await configureImage(f.service);
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  f.setHandler(() => pending);
  const first = f.service.generateImage({ prompt: 'Cloud' });
  const second = f.service.generateImage({ prompt: ' Cloud ' });
  assert.equal(first, second);
  resolve({ status: 200, body: { data: [{ b64_json: PNG }] } });
  await Promise.all([first, second]);
  assert.equal(f.requests.length, 1);
  await f.service.generateImage({ prompt: 'Cloud' });
  assert.equal(f.requests.length, 2);
});

test('download passes through host proxy without any secret and accepts wrapper base64', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async request => {
    if (request.method === 'POST') return { status: 200, body: { data: [{ url: 'https://cdn.example/image?signature=opaque' }] } };
    assert.equal(request.responseType, 'bytes');
    assert.equal(request.maxBytes, 5 * 1024 * 1024);
    assert.deepEqual(request.headers, { Accept: 'image/*' });
    assert.equal(request.body, undefined);
    return { status: 200, bytes: PNG };
  });
  assert.deepEqual(await f.service.generateImage({ prompt: 'Cloud' }), { bytes: png, mime: 'image/png' });
  assert.equal(f.requests.length, 2);
});

test('download accepts Uint8Array response body and validates bytes rather than content-type', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async request => request.method === 'POST'
    ? { status: 200, body: { data: [{ url: 'https://cdn.example/image' }] } }
    : { status: 200, body: png, headers: { 'content-type': 'text/plain' } });
  assert.equal((await f.service.generateImage({ prompt: 'Cloud' })).mime, 'image/png');
});

for (const url of ['http://cdn.example/image', 'https://127.0.0.1/image', 'https://user:SECRET@cdn.example/image', 'https://[::1]/image', 'file:///tmp/image']) {
  test('unsafe returned image URL never reaches host proxy', async () => {
    const f = fixture();
    await configureImage(f.service);
    f.setHandler(async () => ({ status: 200, body: { data: [{ url }] } }));
    await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'unsafe_image_url');
    assert.equal(f.requests.length, 1);
  });
}

test('redirects are rejected without fallback or forwarding authorization', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async () => ({ status: 307, headers: { location: 'https://evil.example' }, body: 'SECRET' }));
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'redirect_rejected');
  assert.equal(f.requests.length, 1);
});

test('host safety rejection is sanitized and not bypassed with fetch', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async () => { throw new Error('SECRET: DNS resolves to private 10.0.0.1'); });
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'network_error');
  assert.equal(f.requests.length, 1);
});

test('host timeout is sanitized as timeout', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async () => { throw { code: 'request_timeout', message: 'SECRET timeout upstream' }; });
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'timeout');
});

test('8 MiB response limit applies to parsed host objects and content-length', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async () => ({ status: 200, headers: { 'content-length': String(8 * 1024 * 1024 + 1) }, body: {} }));
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'response_too_large');
  f.setHandler(async () => ({ status: 200, body: { data: 'x'.repeat(8 * 1024 * 1024) } }));
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'response_too_large');
});

test('5 MiB image cap applies after host proxy regardless of claimed size', async () => {
  const f = fixture();
  await configureImage(f.service);
  f.setHandler(async request => request.method === 'POST'
    ? { status: 200, body: { data: [{ url: 'https://cdn.example/image' }] } }
    : { status: 200, bytes: new Uint8Array(5 * 1024 * 1024 + 1) });
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'image_too_large');
});

for (const b64_json of ['%%%invalid%%%', btoa('<svg>not a bitmap</svg>'), btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10))]) {
  test('invalid image or magic-only truncation is rejected', async () => {
    const f = fixture();
    await configureImage(f.service);
    f.setHandler(async () => ({ status: 200, body: { data: [{ b64_json }] } }));
    await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud' }), 'invalid_image');
  });
}

test('invalid prompt and dimensions do not generate requests', async () => {
  const f = fixture();
  await configureImage(f.service);
  await rejectsCode(() => f.service.generateImage({ prompt: ' ' }), 'invalid_prompt');
  await rejectsCode(() => f.service.generateImage({ prompt: 'Cloud', size: '99999x99999' }), 'invalid_size');
  assert.equal(f.requests.length, 0);
});
