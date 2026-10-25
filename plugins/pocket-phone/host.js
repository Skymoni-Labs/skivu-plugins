// SPDX-License-Identifier: GPL-3.0-only
export const MAX_HOST_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const safeCodes = new Set(['CLOSED', 'NOT_FOUND', 'BUSY', 'TIMEOUT',
  'PERMISSION_DENIED', 'PERMISSION_REQUIRED', 'CANCELLED', 'USER_CANCELLED',
  'LIMIT_EXCEEDED', 'INVALID_ARGUMENT', 'NETWORK_DENIED', 'model_not_available']);

export class PocketPhoneHostError extends Error {
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = 'PocketPhoneHostError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function fail(message, code = 'INVALID_ARGUMENT') {
  throw new PocketPhoneHostError(code, message);
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value, max, label, { empty = false } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) ||
      value.length > max || value.includes('\0')) fail(`${label}格式不正确。`);
  return value;
}
function within(bytes, label = '文件') {
  if (bytes.byteLength > MAX_HOST_BYTES) fail(`${label}超过 8 MiB。`, 'LIMIT_EXCEEDED');
  return bytes;
}
function asBytes(value) {
  if (value instanceof Uint8Array) return within(value);
  if (value instanceof ArrayBuffer) return within(new Uint8Array(value));
  fail('文件内容需要 Uint8Array。');
}
export function encodeBase64(value) {
  const bytes = asBytes(value);
  // Each part is divisible by three, so no padding appears between parts.
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 3 * 8192) {
    const part = bytes.subarray(offset, offset + 3 * 8192);
    let binary = '';
    for (let i = 0; i < part.length; i++) binary += String.fromCharCode(part[i]);
    parts.push(btoa(binary));
  }
  return parts.join('');
}
export function decodeBase64(value) {
  const padding = typeof value === 'string' && value.endsWith('==') ? 2
    : typeof value === 'string' && value.endsWith('=') ? 1 : 0;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_HOST_BYTES / 3) * 4 ||
      value.length % 4 !== 0 ||
      /[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding))) {
    fail('宿主返回了无效或过大的文件。', 'INVALID_RESPONSE');
  }
  let binary;
  try { binary = atob(value); } catch { fail('宿主返回了无效文件。', 'INVALID_RESPONSE'); }
  const bytes = within(new Uint8Array(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function path(value) {
  text(value, 240, '插件文件路径');
  if (/[\\:\x00-\x1f\x7f]/.test(value) || value.startsWith('/') ||
      value.split('/').some(part => !part || part === '.' || part === '..') ||
      /%2e|%2f|%5c/i.test(value)) fail('文件路径必须是插件工作区内的相对路径。');
  return value;
}
function key(value) { return text(value, 160, '存储键'); }
function fileName(value) {
  text(value, 160, '文件名');
  if (value.includes('/') || value.includes('\\') || value === '.' || value === '..') fail('文件名格式不正确。');
  return value;
}
function headers(value = {}) {
  if (!object(value) || Object.keys(value).length > 100) fail('请求头格式不正确。');
  for (const [name, content] of Object.entries(value)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        typeof content !== 'string' || /[\r\n\0]/.test(content) || content.length > 16384) {
      fail('请求头格式不正确。');
    }
  }
  return { ...value };
}

/** Permission checks and network address policy remain in the official SDK.
 * No transport fallback, host credentials or console logging. Chat access
 * uses the explicitly granted official methods below. */
export class PocketPhoneHost {
  constructor(sdk = globalThis.Skivu) {
    if (!sdk || typeof sdk.call !== 'function' || typeof sdk.on !== 'function') {
      fail('请从支持开放插件 SDK 1.0 的 Skivu 中打开。', 'SDK_UNAVAILABLE');
    }
    this.sdk = sdk;
  }
  async _call(method, params = {}) {
    try { return await this.sdk.call(method, params); }
    catch (failure) {
      // A third-party backend may echo URL queries, cookies, or response text.
      // Preserve only known machine-readable codes, never its raw message.
      const code = failure?.code === 'USER_DENIED' ? 'USER_CANCELLED' : safeCodes.has(failure?.code) ? failure.code : 'HOST_FAILED';
      const message = code === 'model_not_available'
        ? '模型未开放或已下架，请更新模型列表并切换到当前可用模型'
        : code === 'CLOSED' ? '插件已暂停或关闭。'
        : code === 'NOT_FOUND' ? '角色或文件已不存在。'
        : code === 'PERMISSION_DENIED' || code === 'PERMISSION_REQUIRED'
          ? '宿主未授予本次操作所需权限。'
        : code === 'CANCELLED' || code === 'USER_CANCELLED' ? '用户已取消本次操作。'
        : '宿主操作未完成，请检查授权或稍后重试。';
      throw new PocketPhoneHostError(code, message);
    }
  }
  async info() { return this._call('host.info'); }
  async context() {
    const value = await this._call('context.get');
    if (!object(value)) fail('宿主上下文格式不正确。', 'INVALID_RESPONSE');
    return { roleId: value.roleId ?? null, roleName: value.roleName ?? '',
      chatId: value.chatId ?? null, action: value.action ?? null };
  }
  async characters(roleId) {
    return roleId === undefined ? this._call('characters.list')
      : this._call('characters.get', { roleId: text(roleId, 160, '角色标识') });
  }
  subscribeContext(fn) { return this.sdk.on('context.changed', fn); }
  onPause(fn) { return this.sdk.on('host.pause', fn); }
  onSuspend(fn) { return this.sdk.on('host.suspend', fn); }
  async storageGet(name) { return this._call('storage.get', { key: key(name) }); }
  async storageSet(name, value) {
    let raw;
    try { raw = JSON.stringify(value); } catch { fail('存档必须是有效 JSON。'); }
    if (raw === undefined || encoder.encode(raw).length > 10 * 1024 * 1024) fail('单个存档超过限制。', 'LIMIT_EXCEEDED');
    const saved = await this._call('storage.set', { key: key(name), value });
    if (saved !== true) fail('宿主未确认存档保存。', 'INVALID_RESPONSE');
    return true;
  }
  async storageRemove(name) { return this._call('storage.remove', { key: key(name) }); }
  async secretGet(name) { return this._call('secrets.get', { key: key(name) }); }
  async secretSet(name, value) {
    return this._call('secrets.set', { key: key(name), value: text(value, 16384, '密钥', { empty: true }) });
  }
  async secretRemove(name) { return this._call('secrets.remove', { key: key(name) }); }

  async request(options) {
    if (!object(options) || Object.keys(options).some(name =>
      !['url', 'method', 'headers', 'body', 'bodyBase64', 'bodyBytes', 'responseType', 'maxBytes', 'timeoutMs'].includes(name))) fail('网络请求参数不正确。');
    const maxBytes = options.maxBytes ?? MAX_HOST_BYTES;
    const timeoutMs = options.timeoutMs ?? 40000;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_HOST_BYTES ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000) fail('请求限制参数无效。');
    let url;
    try { url = new URL(text(options.url, 4096, '服务地址')); }
    catch { fail('服务地址格式不正确。'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) fail('服务地址格式不正确。');
    const method = options.method ?? 'GET';
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) fail('不支持此请求方法。');
    const modes = ['body', 'bodyBase64', 'bodyBytes'].filter(name => options[name] !== undefined);
    if (modes.length > 1) fail('请求体只能指定一种格式。');
    const params = { url: url.href, method, headers: headers(options.headers) };
    if (options.body !== undefined) {
      if (typeof options.body !== 'string') fail('请求体需要文字。');
      within(encoder.encode(options.body), '请求体');
      params.body = options.body;
    }
    if (options.bodyBase64 !== undefined) params.bodyBase64 = encodeBase64(decodeBase64(options.bodyBase64));
    if (options.bodyBytes !== undefined) params.bodyBase64 = encodeBase64(options.bodyBytes);
    const binary = options.responseType === 'base64' || options.responseType === 'bytes';
    if (options.responseType !== undefined && !['text', 'json', 'base64', 'bytes'].includes(options.responseType)) fail('响应类型不受支持。');
    if (binary) params.responseType = 'base64';
    let timer, reply;
    try {
      // The SDK owns its request lifecycle. This stops waiting and discards a
      // late result; it does not claim to abort the underlying host transport.
      reply = await Promise.race([this._call(url.protocol === 'http:' ? 'network.request' : 'https.request', params), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PocketPhoneHostError('TIMEOUT', '服务请求超时。')), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
    if (!object(reply) || !Number.isInteger(reply.status) || reply.status < 100 || reply.status > 599) fail('宿主返回了无效 HTTP 状态。', 'INVALID_RESPONSE');
    if (reply.status < 200 || reply.status >= 300) {
      throw new PocketPhoneHostError('HTTP_STATUS', `服务返回 HTTP ${reply.status}。`, { status: reply.status });
    }
    if (reply.body !== undefined && typeof reply.body !== 'string') fail('宿主返回了无效响应。', 'INVALID_RESPONSE');
    const body = reply.body ?? '';
    within(encoder.encode(body), '响应');
    if (encoder.encode(body).length > maxBytes) fail('响应超过本次大小限制。', 'LIMIT_EXCEEDED');
    const result = { status: reply.status, headers: headers(reply.headers), body, mime: typeof reply.mime === 'string' ? reply.mime : '' };
    if (reply.base64 !== undefined) result.bytes = decodeBase64(reply.base64);
    if (result.bytes?.length > maxBytes) fail('响应超过本次大小限制。', 'LIMIT_EXCEEDED');
    if (binary && !result.bytes) fail('宿主未返回二进制响应。', 'INVALID_RESPONSE');
    return result;
  }

  async readFile(name) {
    const value = await this._call('fs.read', { path: path(name) });
    if (value === null) return null;
    if (!object(value)) fail('宿主文件格式不正确。', 'INVALID_RESPONSE');
    return decodeBase64(value.base64);
  }
  async writeFile(name, bytes) {
    const saved = await this._call('fs.write', { path: path(name), base64: encodeBase64(bytes) });
    if (saved !== true) fail('宿主未确认文件保存。', 'INVALID_RESPONSE');
    return true;
  }
  async list() {
    const names = await this._call('fs.list');
    if (!Array.isArray(names)) fail('宿主文件列表格式不正确。', 'INVALID_RESPONSE');
    return names.map(path);
  }
  async remove(name) { return this._call('fs.remove', { path: path(name) }); }
  async pickFile() {
    const value = await this._call('files.pick');
    if (value === null) return null;
    if (!object(value)) fail('宿主文件格式不正确。', 'INVALID_RESPONSE');
    return { name: fileName(value.name), mime: text(value.mime, 150, '文件类型'), bytes: decodeBase64(value.base64) };
  }
  async saveFile({ name, mime = 'application/octet-stream', bytes }) {
    const saved = await this._call('files.save', { name: fileName(name), mime: text(mime, 150, '文件类型'), base64: encodeBase64(bytes) });
    if (typeof saved !== 'boolean') fail('宿主未确认文件导出。', 'INVALID_RESPONSE');
    return saved;
  }

  async aiGenerate({ roleId, instruction, context = [], maxOutput = 2048 }) {
    text(roleId, 160, '角色标识');
    text(instruction, 60000, '任务');
    if (!Number.isInteger(maxOutput) || maxOutput < 16 || maxOutput > 4096 ||
        !Array.isArray(context) || context.length > 50 ||
        context.some(message => !object(message) || Object.keys(message).length !== 2 ||
          !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') ||
        encoder.encode(JSON.stringify(context)).length > 65536) fail('模型任务参数超出范围。');
    const value = await this._call('ai.generate', { roleId, instruction, context, maxOutput });
    if (!object(value) || typeof value.text !== 'string') fail('宿主未返回有效模型文字。', 'INVALID_RESPONSE');
    const usage = object(value.usage) ? Object.fromEntries(['input', 'output', 'cached']
      .filter(name => value.usage[name] === null ||
        Number.isSafeInteger(value.usage[name]) && value.usage[name] >= 0)
      .map(name => [name, value.usage[name]])) : null;
    return { text: value.text, usage };
  }

  async chatRead({ limit = 50 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('消息数须为 1 到 100。');
    const messages = await this._call('chat.read', { limit });
    if (!Array.isArray(messages) || messages.length > limit || messages.some(message =>
      !object(message) || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string')) {
      fail('宿主聊天记录格式不正确。', 'INVALID_RESPONSE');
    }
    return messages.map(message => ({ id: String(message.id ?? ''), role: message.role, text: message.text }));
  }

  async chatAppend({ role, text: content }) {
    if (!['user', 'assistant'].includes(role)) fail('聊天消息角色不正确。');
    text(content, 30000, '聊天内容');
    const receipt = await this._call('chat.append', { role, text: content });
    if (!object(receipt) || typeof receipt.id !== 'string' || !receipt.id) fail('宿主未确认聊天消息保存。', 'INVALID_RESPONSE');
    return { id: receipt.id };
  }
}
