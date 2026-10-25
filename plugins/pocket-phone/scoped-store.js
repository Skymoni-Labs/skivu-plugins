// SPDX-License-Identifier: GPL-3.0-only
// Scope adapter around the independent engine. It never migrates role data.
import {PocketPhoneError} from './engine.js';

export const SHARED_POCKET_PHONE_ROLE_ID = 'skivu-shared-pocket-phone';

function cancelled(message) { throw new PocketPhoneError('cancelled', message); }

// Preserve non-JSON shapes for the engine to reject, instead of laundering
// prototypes, accessors, NaN, undefined or sparse arrays through stringify.
// Ordinary JSON arguments are snapshotted before entering the facade queue.
function queuedCopy(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) Object.setPrototypeOf(result, Object.getPrototypeOf(value));
  seen.set(value, result);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) descriptor.value = queuedCopy(descriptor.value, seen);
    Object.defineProperty(result, key, descriptor);
  }
  return result;
}

/**
 * All writes must be issued through this facade. A per-delegate adapter checks
 * mode immediately before each storage.set, including import/recover, whose
 * engine methods have no mayCommit argument. The host's original storage port
 * and independent conversation journals are untouched.
 *
 * A set already sent to the host cannot be revoked. This is the same atomic
 * commit boundary as engine mayCommit: switching scope can cancel work before
 * a primary set is sent, but cannot undo a host write already in progress.
 */
export class ScopedPocketPhoneStore {
  constructor(delegate, {getMode = () => 'role'} = {}) {
    if (!delegate || typeof delegate.snapshot !== 'function' || typeof getMode !== 'function' ||
        !delegate.storage || typeof delegate.storage.get !== 'function' || typeof delegate.storage.set !== 'function') {
      throw new TypeError('ScopedPocketPhoneStore requires a phone store with JSON storage and getMode');
    }
    this._delegate = delegate; this._getMode = getMode;
    this._tail = Promise.resolve(); this._activeGuard = null;
    const storage = delegate.storage;
    // Replace only this engine's adapter object, never mutate the host port.
    delegate.storage = {
      get: (...args) => storage.get(...args),
      set: async (...args) => {
        this._activeGuard?.();
        return storage.set(...args);
      },
    };
  }

  get scopeKey() { return this._getMode() === 'shared' ? 'shared' : 'role'; }
  get error() { return this._delegate.error; }
  set error(value) { this._delegate.error = value; }
  get busy() { return this._delegate.busy; }
  get musicHandler() { return this._delegate.musicHandler; }
  set musicHandler(handler) { this._delegate.musicHandler = handler; }

  _id(id, mode) { return mode === 'shared' ? SHARED_POCKET_PHONE_ROLE_ID : id; }
  _guard(mode, mayCommit) {
    if (mayCommit !== undefined && typeof mayCommit !== 'function') throw new PocketPhoneError('invalid_arguments', 'mayCommit必须是函数');
    return () => {
      if (this.scopeKey !== mode) cancelled('手机范围已切换，本次操作已取消。');
      if (mayCommit && mayCommit() !== true) cancelled('操作已取消。');
      return true;
    };
  }
  _write(mode, mayCommit, operation) {
    let guard;
    try { guard = this._guard(mode, mayCommit); } catch (error) { return Promise.reject(error); }
    const result = this._tail.then(async () => {
      guard(); this._activeGuard = guard;
      try {
        const value = await operation(guard);
        return value === this._delegate ? this : value;
      } finally { this._activeGuard = null; }
    });
    this._tail = result.catch(() => {});
    return result;
  }

  async restore() { await this._delegate.restore(); return this; }
  subscribe(listener) { return this._delegate.subscribe(listener); }
  snapshot(roleId) { const mode = this.scopeKey; return this._delegate.snapshot(this._id(roleId, mode)); }
  exportArchive(roleId) { const mode = this.scopeKey; return this._delegate.exportArchive(this._id(roleId, mode)); }

  invoke(tool, args = {}, options = {}) {
    let mode, input, captured;
    try { mode = this.scopeKey; input = queuedCopy(args); captured = {...options}; }
    catch (error) { return Promise.reject(error); }
    return this._write(mode, captured.mayCommit, guard => this._delegate.invoke(tool, input,
      {...captured, roleId: this._id(captured.roleId, mode), mayCommit: guard}));
  }
  invokeBatch(actions, options = {}) {
    let mode, inputs, captured;
    try { mode = this.scopeKey; inputs = queuedCopy(actions); captured = {...options}; }
    catch (error) { return Promise.reject(error); }
    return this._write(mode, captured.mayCommit, guard => this._delegate.invokeBatch(inputs,
      {...captured, roleId: this._id(captured.roleId, mode), mayCommit: guard}));
  }
  importArchive(roleId, jsonString, {mayCommit} = {}) {
    const mode = this.scopeKey;
    return this._write(mode, mayCommit, () => this._delegate.importArchive(this._id(roleId, mode), jsonString));
  }
  recoverBackup({mayCommit} = {}) {
    const mode = this.scopeKey;
    return this._write(mode, mayCommit, () => this._delegate.recoverBackup());
  }
}
