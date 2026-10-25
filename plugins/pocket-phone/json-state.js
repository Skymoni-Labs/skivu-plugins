// SPDX-License-Identifier: GPL-3.0-only
// Independently authored JSON state comparison for host storage round trips.

/**
 * Canonical text for validated JSON data. Object insertion order is irrelevant;
 * array order and all JSON values remain significant. This is not a hash and
 * never changes the input. Unsupported data is rejected rather than omitted.
 */
export function canonicalJson(value) {
  const ancestors = new Set();
  function encode(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (!item || typeof item !== 'object') throw new TypeError('State must contain only JSON values');
    if (ancestors.has(item)) throw new TypeError('JSON state cannot contain cycles');
    const array = Array.isArray(item);
    if (!(array ? Object.getPrototypeOf(item) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(item)))) {
      throw new TypeError('State must contain only JSON arrays and objects');
    }
    const keys = Reflect.ownKeys(item).filter(key => !array || key !== 'length');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
          (array && (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) {
        throw new TypeError('State fields must be ordinary JSON data');
      }
    }
    ancestors.add(item);
    try {
      if (array) {
        const parts = [];
        for (let index = 0; index < item.length; index++) {
          if (!Object.hasOwn(item, index)) throw new TypeError('JSON arrays cannot contain empty items');
          parts.push(encode(item[index]));
        }
        return `[${parts.join(',')}]`;
      }
      return `{${keys.sort().map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    } finally { ancestors.delete(item); }
  }
  return encode(value);
}
