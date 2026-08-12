const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof Map) &&
  !(value instanceof RegExp) &&
  (value.constructor === Object || value.constructor === undefined);

/**
 * Flattens nested objects into dotted Mongo paths.
 * Arrays, Dates and Maps are treated as leaves — replaced wholesale rather
 * than merged element by element, which is what `$set` on a subdocument needs.
 *
 * @param {object} source
 * @param {{ prefix?: string, stopAt?: Set<string> }} options
 *        `stopAt` paths are emitted as whole values instead of being descended into.
 */
export function flatten(source, { prefix = '', stopAt = new Set() } = {}) {
  const output = {};

  for (const [key, value] of Object.entries(source ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value === undefined) continue;

    if (stopAt.has(path) || !isPlainObject(value)) {
      output[path] = value;
      continue;
    }

    const nested = flatten(value, { prefix: path, stopAt });
    if (Object.keys(nested).length === 0) {
      output[path] = value;
      continue;
    }
    Object.assign(output, nested);
  }

  return output;
}

/** Reads a dotted path out of an object. */
export function getPath(source, path) {
  return String(path)
    .split('.')
    .reduce((accumulator, key) => (accumulator === null || accumulator === undefined ? undefined : accumulator[key]), source);
}

/** Writes a dotted path into an object, creating intermediate objects. */
export function setPath(target, path, value) {
  const keys = String(path).split('.');
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!isPlainObject(cursor[keys[i]])) cursor[keys[i]] = {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  return target;
}

/** Treats null, undefined, '', [] and {} as "no value present". */
export function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Map) return value.size === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * Recursively copies values from `source` into `target` **only where target
 * has no value**. Used when two catalog rows describe the same product: the
 * better row wins every populated field, but never loses information the
 * weaker row happened to carry.
 */
export function fillMissing(target, source) {
  if (!isPlainObject(source)) return target;
  const output = isPlainObject(target) ? { ...target } : {};

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = output[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      output[key] = fillMissing(targetValue, sourceValue);
      continue;
    }
    if (isEmptyValue(targetValue) && !isEmptyValue(sourceValue)) {
      output[key] = sourceValue;
    }
  }

  return output;
}

/** Removes keys whose path is covered by `blocked` (exact match or prefix). */
export function omitPaths(flatObject, blocked = []) {
  if (blocked.length === 0) return flatObject;
  const output = {};
  for (const [path, value] of Object.entries(flatObject)) {
    const isBlocked = blocked.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
    if (!isBlocked) output[path] = value;
  }
  return output;
}

export default { flatten, getPath, setPath, omitPaths };
