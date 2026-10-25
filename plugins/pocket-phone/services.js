/* SPDX-License-Identifier: GPL-3.0-only
 * Independently implemented Skivu pocket-phone media services.
 * All I/O goes through the injected plugin host port. The host must enforce
 * DNS/connection policy, network.local grants, redirects and byte caps.
 * JavaScript URL checks cannot pin DNS in a WebView. The timeout below only
 * stops waiting; cancelling an in-flight operation remains SDK responsibility.
 */

const JSON_LIMIT = 8 * 1024 * 1024;
const IMAGE_LIMIT = 5 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const MUSIC_CONFIG = 'pocket-phone.music.config.v1';
const IMAGE_CONFIG = 'pocket-phone.image.config.v1';
const MUSIC_SECRET = 'pocket-phone.music.cookie.v1';
const IMAGE_SECRET = 'pocket-phone.image.key.v1';
const SIZES = new Set(['auto', '256x256', '512x512', '1024x1024',
  '1024x1536', '1536x1024', '1024x1792', '1792x1024']);

export class PocketPhoneServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PocketPhoneServiceError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new PocketPhoneServiceError(code, message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 500) => typeof value === 'string' || typeof value === 'number'
  ? String(value).slice(0, max) : '';
const integer = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;

function publicAddress(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host.endsWith('.') || host.includes('%') || host.includes('\\') ||
      /(^|\.)(localhost|local|internal|lan|home|test)$/.test(host)) return false;
  if (host.includes(':')) {
    // Fail closed for mapped, local, documentation and transition IPv6 ranges.
    const [a, b] = host.split(':').map(value => parseInt(value || '0', 16));
    return !host.includes('.') && a >= 0x2000 && a <= 0x3fff &&
      a !== 0x2002 && !(a === 0x2001 && (b < 0x0200 || b === 0x0db8));
  }
  if (/^[0-9.]+$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b, c] = parts;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 2, 168].includes(b)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  return host.includes('.') && /^[a-z0-9.-]+$/.test(host);
}

function safeUrl(value, { base = false, allowLocalMusic = false } = {}) {
  if (typeof value !== 'string' || value.length > (base ? 2048 : 8192) ||
      /[\x00-\x20\x7f\\]/.test(value.trim())) {
    fail('invalid_url', '请填写有效的公开 HTTPS 服务地址。');
  }
  let url;
  try { url = new URL(value.trim()); } catch { fail('invalid_url', '请填写有效的公开 HTTPS 服务地址。'); }
  // This opt-in is internal to the music API path. It is not a network grant:
  // host.request must use the SDK's network.local permission check each time.
  // Match the original spelling too, so numeric/hex loopback aliases cannot
  // widen the two explicit supported hostnames.
  const localMusic = allowLocalMusic && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
    /^http:\/\/(localhost|127\.0\.0\.1)(?::[0-9]{1,5})?(?:\/|$)/i.test(value.trim());
  if ((!localMusic && (url.protocol !== 'https:' || !publicAddress(url.hostname))) ||
      url.username || url.password || url.port === '0' ||
      value.includes('#') || (base && value.includes('?'))) {
    fail('unsafe_address', '服务地址必须是无账号信息的公开 HTTPS 地址。');
  }
  if (base) url.pathname = url.pathname.replace(/\/+$/, '');
  return base ? url.href.replace(/\/+$/, '') : url.href;
}

function publicUrl(value) {
  try { return safeUrl(value); } catch { return ''; }
}

function localMusicAudioUrl(value, configuredBase) {
  try {
    const base = new URL(configuredBase);
    if (base.protocol !== 'http:') return '';
    const candidate = safeUrl(value, { allowLocalMusic: true });
    const audio = new URL(candidate);
    // Origin includes scheme, exact canonical hostname and effective port.
    // localhost and 127.0.0.1 remain different origins despite both loopback.
    return audio.protocol === 'http:' && audio.origin === base.origin ? candidate : '';
  } catch { return ''; }
}

function baseUrl(value, { allowLocalMusic = false } = {}) {
  try { return safeUrl(value, { base: true, allowLocalMusic }); } catch {
    fail('invalid_base_url', allowLocalMusic
      ? '请填写不含账号、查询参数或片段的 HTTPS 公网或 HTTP 本机音乐地址。'
      : '请填写不含账号、查询参数或片段的公开 HTTPS 服务地址。');
  }
}

function secretValue(value, code) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 16384 || /[\r\n]/.test(value)) {
    fail(code, '凭据格式无效，请重新检查。');
  }
  return value.trim();
}

function imageSize(value) {
  if (!SIZES.has(value)) fail('invalid_size', '不支持的生图尺寸。');
  return value;
}

function songId(args) {
  const value = text(args.song_id ?? args.songId ?? args.id, 30).replace(/^ncm_/, '');
  if (!/^\d{1,20}$/.test(value)) fail('invalid_song', '请提供有效歌曲 ID。');
  return value;
}

function track(song, fallbackId = '') {
  const source = object(song);
  const id = text(source.id ?? fallbackId, 30).replace(/^ncm_/, '');
  const artists = Array.isArray(source.ar ?? source.artists) ? source.ar ?? source.artists : [];
  const album = object(source.al ?? source.album);
  const duration = Number(source.dt ?? source.duration ?? 0);
  return {
    id: `ncm_${id}`, songId: id, title: text(source.name, 500) || `歌曲 ${id}`,
    artist: artists.slice(0, 20).map(item => text(object(item).name, 200)).filter(Boolean).join(' / '),
    cover: publicUrl(album.picUrl),
    duration: Number.isFinite(duration) ? Math.max(0, Math.min(duration / 1000, 86400)) : 0,
    provider: 'netease',
  };
}

function decodeBase64(encoded, maxBytes = IMAGE_LIMIT) {
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(maxBytes / 3) * 4 + 8) {
    fail('image_too_large', '生成图片超过 5 MiB 限制。');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    fail('invalid_image', '服务返回的图片编码无效。');
  }
  try {
    const decoded = atob(encoded);
    if (decoded.length > maxBytes) fail('image_too_large', '生成图片超过 5 MiB 限制。');
    return Uint8Array.from(decoded, c => c.charCodeAt(0));
  } catch (error) {
    if (error instanceof PocketPhoneServiceError) throw error;
    fail('invalid_image', '服务返回的图片编码无效。');
  }
}

function asBytes(value, maxBytes = IMAGE_LIMIT) {
  let bytes;
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else if (typeof value === 'string') bytes = decodeBase64(value, maxBytes);
  else if (Array.isArray(value) && value.length <= maxBytes && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) bytes = Uint8Array.from(value);
  else fail('invalid_image', '宿主未返回有效的图片字节。');
  if (bytes.byteLength > maxBytes) fail('image_too_large', '生成图片超过 5 MiB 限制。');
  return bytes;
}

function validatedImage(bytes) {
  if (!bytes.length || bytes.length > IMAGE_LIMIT) fail('image_too_large', '生成图片超过 5 MiB 限制。');
  const starts = list => list.every((n, i) => bytes[i] === n);
  let mime = '';
  let width = 0, height = 0;
  if (bytes.length >= 45 && starts([137, 80, 78, 71, 13, 10, 26, 10])) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
      fail('invalid_image', '服务返回的图片内容损坏。');
    }
    width = view.getUint32(16); height = view.getUint32(20);
    let position = 8, hasData = false, hasEnd = false;
    while (position + 12 <= bytes.length) {
      const count = view.getUint32(position);
      if (count > bytes.length - position - 12) break;
      const kind = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
      if (kind === 'IDAT') hasData = true;
      if (kind === 'IEND') { hasEnd = count === 0 && position + 12 === bytes.length; break; }
      position += count + 12;
    }
    if (!hasData || !hasEnd) fail('invalid_image', '服务返回的图片内容损坏。');
    mime = 'image/png';
  } else if (bytes.length >= 10 && starts([255, 216, 255]) &&
      bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) {
    mime = 'image/jpeg';
  } else if (bytes.length >= 14 && starts([71, 73, 70, 56]) &&
      [55, 57].includes(bytes[4]) && bytes[5] === 97 && bytes[bytes.length - 1] === 59) {
    width = bytes[6] | (bytes[7] << 8); height = bytes[8] | (bytes[9] << 8);
    mime = 'image/gif';
  } else if (bytes.length >= 20 && starts([82, 73, 70, 70]) &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
    if (length !== bytes.length - 8) fail('invalid_image', '服务返回的图片内容损坏。');
    mime = 'image/webp';
  }
  if (!mime || ((mime === 'image/png' || mime === 'image/gif') &&
      (!width || !height || width > 8192 || height > 8192 || width * height > 16000000))) {
    fail('invalid_image', '仅接受有效且尺寸合理的 PNG、JPEG、WebP 或 GIF 图片。');
  }
  return { bytes, mime };
}

export class PocketPhoneServices {
  constructor(host) {
    this.host = host;
    this._music = { baseUrl: '' };
    this._image = { baseUrl: '', model: '', size: '1024x1024', style: '' };
    this._cookie = '';
    this._apiKey = '';
    this._generation = 0;
    this._pending = new Map();
    this._saveQueue = Promise.resolve();
  }

  async restore() {
    try {
      const [musicRaw, imageRaw, musicSecret, imageSecret] = await Promise.all([
        this.host.storageGet(MUSIC_CONFIG), this.host.storageGet(IMAGE_CONFIG),
        this.host.secretGet(MUSIC_SECRET), this.host.secretGet(IMAGE_SECRET),
      ]);
      const stored = value => typeof value === 'string' ? JSON.parse(value) : value;
      const music = object(stored(musicRaw));
      const picture = object(stored(imageRaw));
      const nextMusic = { baseUrl: music.baseUrl ? baseUrl(music.baseUrl, { allowLocalMusic: true }) : '' };
      const nextImage = picture.baseUrl ? {
        baseUrl: baseUrl(picture.baseUrl), model: text(picture.model, 200),
        size: imageSize(picture.size || '1024x1024'), style: text(picture.style, 2000),
      } : { baseUrl: '', model: '', size: '1024x1024', style: '' };
      const boundSecret = (raw, address) => {
        if (!raw || !address) return '';
        const data = object(stored(raw));
        return data.baseUrl === address ? secretValue(data.value, 'invalid_credential') : '';
      };
      const cookie = boundSecret(musicSecret, nextMusic.baseUrl);
      const apiKey = boundSecret(imageSecret, nextImage.baseUrl);
      this._music = nextMusic; this._image = nextImage;
      this._cookie = cookie; this._apiKey = apiKey; this._generation++;
    } catch {
      fail('storage_error', '小手机服务配置读取失败，请检查插件存储。');
    }
  }

  publicMusicConfig() { return { ...this._music, hasCookie: Boolean(this._cookie) }; }
  publicImageConfig() { return { ...this._image, hasApiKey: Boolean(this._apiKey) }; }

  _serialize(action) {
    const result = this._saveQueue.then(action);
    this._saveQueue = result.catch(() => {});
    return result;
  }

  async _persist(configKey, secretKey, config, credential) {
    try {
      if (credential) await this.host.secretSet(secretKey, JSON.stringify({ baseUrl: config.baseUrl, value: credential }));
      else await this.host.secretRemove(secretKey);
      // Public plugin storage never receives a cookie, bearer key or secret object.
      await this.host.storageSet(configKey, { ...config });
    } catch {
      fail('storage_error', '服务配置未保存，请检查插件安全存储。');
    }
  }

  saveMusicConfig({ baseUrl: address, cookie, clearCookie = false }) {
    return this._serialize(async () => {
      const canonical = baseUrl(address, { allowLocalMusic: true });
      const supplied = secretValue(cookie, 'invalid_cookie');
      const nextCookie = clearCookie ? '' : supplied || (canonical === this._music.baseUrl ? this._cookie : '');
      const config = { baseUrl: canonical };
      await this._persist(MUSIC_CONFIG, MUSIC_SECRET, config, nextCookie);
      this._music = config; this._cookie = nextCookie;
    });
  }

  saveImageConfig({ baseUrl: address, model, apiKey, size = '1024x1024', style = '', clearApiKey = false }) {
    return this._serialize(async () => {
      const canonical = baseUrl(address);
      if (typeof model !== 'string' || !model.trim() || model.length > 200 || /[\r\n]/.test(model) ||
          typeof style !== 'string' || style.length > 2000) fail('invalid_config', '请检查生图模型与风格设置。');
      const supplied = secretValue(apiKey, 'invalid_key');
      const nextKey = clearApiKey ? '' : supplied || (canonical === this._image.baseUrl ? this._apiKey : '');
      const config = { baseUrl: canonical, model: model.trim(), size: imageSize(size), style: style.trim() };
      await this._persist(IMAGE_CONFIG, IMAGE_SECRET, config, nextKey);
      this._image = config; this._apiKey = nextKey; this._generation++;
    });
  }

  clearMusicConfig() {
    return this._serialize(async () => {
      try { await this.host.secretRemove(MUSIC_SECRET); await this.host.storageRemove(MUSIC_CONFIG); }
      catch { fail('storage_error', '音乐服务配置清除失败，请重试。'); }
      this._music = { baseUrl: '' }; this._cookie = '';
    });
  }

  clearImageConfig() {
    return this._serialize(async () => {
      try { await this.host.secretRemove(IMAGE_SECRET); await this.host.storageRemove(IMAGE_CONFIG); }
      catch { fail('storage_error', '生图服务配置清除失败，请重试。'); }
      this._image = { baseUrl: '', model: '', size: '1024x1024', style: '' };
      this._apiKey = ''; this._generation++;
    });
  }

  async _request(url, { method = 'POST', body, headers = {}, responseType = 'json', maxBytes = JSON_LIMIT, allowLocalMusic = false } = {}) {
    const address = safeUrl(url, { allowLocalMusic });
    const localMusic = address.startsWith('http:');
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PocketPhoneServiceError('timeout', '服务请求超时，请稍后重试。')), TIMEOUT_MS + 1000);
      });
      const response = object(await Promise.race([
        this.host.request({ url: address, method, headers, body, responseType, maxBytes, timeoutMs: TIMEOUT_MS }), timeout,
      ]));
      const status = Number(response.status);
      if (status >= 300 && status < 400) fail('redirect_rejected', '服务发生重定向，请配置最终 HTTPS 地址。');
      if (!Number.isInteger(status) || status < 200 || status >= 300) fail('http_error', '远程服务请求失败，请检查配置或稍后重试。');
      const responseHeaders = object(response.headers);
      const length = Number(responseHeaders['content-length'] ?? responseHeaders['Content-Length'] ?? 0);
      if (Number.isFinite(length) && length > maxBytes) fail('response_too_large', '服务响应超过大小限制。');
      if (responseType === 'bytes') return asBytes(response.bytes ?? response.body, maxBytes);
      const raw = response.body;
      const encoded = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).length > maxBytes) {
        fail('response_too_large', '服务响应超过大小限制。');
      }
      let result;
      try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch { fail('invalid_response', '服务返回的数据格式无效。'); }
      if (!result || typeof result !== 'object' || Array.isArray(result)) fail('invalid_response', '服务返回的数据格式无效。');
      return result;
    } catch (error) {
      if (error instanceof PocketPhoneServiceError) throw error;
      if (localMusic && ['PERMISSION_REQUIRED', 'PERMISSION_DENIED'].includes(error?.code)) {
        fail('local_permission_required', '连接本机音乐服务需要在 Skivu 中授予 network.local 权限。');
      }
      if (error?.code === 'HTTP_STATUS') {
        if (Number(error.status) >= 300 && Number(error.status) < 400) {
          fail('redirect_rejected', '服务发生重定向，请配置最终 HTTPS 地址。');
        }
        fail('http_error', '远程服务请求失败，请检查配置或稍后重试。');
      }
      if (error?.code === 'timeout' || error?.code === 'request_timeout') {
        fail('timeout', '服务请求超时，请稍后重试。');
      }
      // Never surface the host exception, server body, URL, cookie or bearer key.
      fail('network_error', '无法安全连接远程服务，请检查网络与配置。');
    } finally { clearTimeout(timer); }
  }

  async _musicPost(config, cookie, path, params) {
    const result = await this._request(`${config.baseUrl}/${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, ...(cookie ? { cookie } : {}) }),
      allowLocalMusic: true,
    });
    const code = integer(result.code ?? object(result.data).code);
    if (code != null && code !== 200) fail('upstream_error', '音乐服务未能完成请求，请检查服务和登录状态。');
    return result;
  }

  async _musicFallback(config, cookie, primary, fallback, params) {
    try { return await this._musicPost(config, cookie, primary, params); }
    catch (error) {
      if (!(error instanceof PocketPhoneServiceError) || !['http_error', 'upstream_error'].includes(error.code)) throw error;
      return this._musicPost(config, cookie, fallback, params);
    }
  }

  async music(action, args = {}) {
    const config = { ...this._music }, cookie = this._cookie;
    const params = object(args);
    if (action === 'music_status' && !config.baseUrl) return { configured: false, authenticated: false };
    if (!config.baseUrl) fail('music_not_configured', '请先配置音乐服务地址。');
    if (action === 'music_status') {
      const result = await this._musicPost(config, cookie, 'login/status', {});
      const profile = object(object(result.data).profile ?? result.profile);
      return {
        configured: true, authenticated: profile.userId != null,
        ...(profile.userId != null ? { profile: {
          userId: text(profile.userId, 30), nickname: text(profile.nickname, 200), avatarUrl: publicUrl(profile.avatarUrl),
        } } : {}),
      };
    }
    if (action === 'music_search') {
      const keywords = text(params.keywords ?? params.query ?? params.keyword, 200).trim();
      if (!keywords) fail('invalid_query', '请输入音乐搜索关键词。');
      const limit = Math.max(1, Math.min(integer(params.limit) || 20, 50));
      const result = await this._musicFallback(config, cookie, 'cloudsearch', 'search', { keywords, limit, type: 1 });
      const data = object(result.result);
      const songs = Array.isArray(data.songs) ? data.songs.slice(0, 50) : [];
      return { tracks: songs.map(song => track(song)), total: integer(data.songCount) ?? songs.length };
    }
    if (action === 'music_play' || action === 'music_source') {
      const id = songId(params);
      const result = await this._musicFallback(config, cookie, 'song/url/v1', 'song/url', { id, level: 'standard', br: 128000 });
      const rows = Array.isArray(result.data) ? result.data : [];
      const row = object(rows.find(item => text(object(item).id, 30) === id) ?? rows[0]);
      const url = publicUrl(row.url) || localMusicAudioUrl(row.url, config.baseUrl);
      if (!url) fail('music_unavailable', '该歌曲暂时无法播放，可能需要登录或版权授权。');
      // Returning a source does not download or authorize that media. The UI
      // downloads it with host.request (HTTP -> SDK network.request) to a blob;
      // the SDK rechecks network.local, DNS and redirects for the actual GET.
      if (action === 'music_source') return { id: `ncm_${id}`, songId: id, url, available: true };
      const details = await this._musicPost(config, cookie, 'song/detail', { ids: id });
      const songs = Array.isArray(details.songs) ? details.songs : [];
      const selected = songs.find(item => text(object(item).id, 30) === id) ?? songs[0];
      return { track: track(selected, id), url };
    }
    fail('unsupported_action', '不支持的音乐操作。');
  }

  generateImage({ prompt, size } = {}) {
    const config = { ...this._image }, apiKey = this._apiKey;
    if (!config.baseUrl || !config.model || !apiKey) return Promise.reject(new PocketPhoneServiceError('image_not_configured', '请先单独配置生图服务与密钥。'));
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) return Promise.reject(new PocketPhoneServiceError('invalid_prompt', '请输入不超过 12000 字的图片描述。'));
    let selectedSize;
    try { selectedSize = imageSize(size ?? config.size); } catch (error) { return Promise.reject(error); }
    const key = JSON.stringify([this._generation, config, prompt.trim(), selectedSize]);
    if (this._pending.has(key)) return this._pending.get(key);
    const operation = this._generate(config, apiKey, prompt.trim(), selectedSize);
    this._pending.set(key, operation);
    operation.then(() => this._pending.delete(key), () => this._pending.delete(key));
    return operation;
  }

  async _generate(config, apiKey, prompt, size) {
    const result = await this._request(`${config.baseUrl}/images/generations`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: config.model, prompt: config.style ? `${prompt}\n\n视觉风格：${config.style}` : prompt, n: 1, size }),
    });
    if (!Array.isArray(result.data) || !result.data.length) fail('invalid_image_response', '生图服务未返回可用图片。');
    const item = object(result.data[0]);
    let bytes;
    if (typeof item.b64_json === 'string' && item.b64_json) bytes = decodeBase64(item.b64_json);
    else {
      const url = publicUrl(item.url);
      if (!url) fail('unsafe_image_url', '服务返回的图片地址不符合安全要求。');
      // Never forward generation credentials or music cookies to a CDN.
      bytes = await this._request(url, { method: 'GET', responseType: 'bytes', maxBytes: IMAGE_LIMIT, headers: { Accept: 'image/*' } });
    }
    return validatedImage(bytes);
  }
}
