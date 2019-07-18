const identity = exports.identity = (i) => i;

const isNumber = exports.isNumber = (target) => {
  return !isNaN(target);
}

const isString = exports.isString = (target) => {
  return typeof(target) === 'string'
}

const isObject = exports.isObject = (target) => {
  return target !== null && typeof(target) === 'object';
}

const isDate = exports.isDate = (target) => {
  return target instanceof Date;
}

const isMatch =  exports.isMatch = (target, source) => {
  for (const key in source) {
    if (!deepEqual(target[key], source[key]))
      return false;
  }
  return true;
}

const isEmpty = exports.isEmpty = (target) => {
  return size(target) === 0;
}


const union = exports.union = (a, b) => {
  const set = new Set();
  a.forEach(i => set.add(i));
  b.forEach(i => set.add(i));
  return Array.from(set);
}

const intersection = exports.intersection = (a, b) => {
  a = new Set(a);
  b = new Set(b);
  c = new Set();
  for (const i of a) {
    if (b.has(i))
      c.add(i);
  }
  return Array.from(c);
}

const deepEqual = exports.deepEqual = (a, b) => {
  if (typeof(a) === 'object' && typeof(b) === 'object' && a !== null && b !== null) {
    const keys = union(Object.keys(a), Object.keys(b));
    for (const key of keys) {
      if (deepEqual(a[key], b[key]) === false)
        return false;
    }
  }
  return a == b;
}


const findKey = exports.findKey = (object, predicate) => {
  for (const k in object) {
    if (isMatch(object[k], predicate)) {
      return k;
    }
  }
}

const size = exports.size = (target) => {
  if (target === null || target === undefined || target === '')
    return 0;
  if (isNumber(target.length))
    return target.length;
  if (isNumber(target.size))
    return target.size;
  if (typeof(target) === 'object')
    return Object.getOwnPropertyNames(target).length;
}


const omit = exports.omit = (source, omittingKeys) => {
  const target = {};
  for (const key in source) {
    if (omittingKeys.includes(key)) continue;
    target[key] = source;
  }
  return target;
}


const clone = exports.clone = (source) => {
  if (Array.isArray(source))
    return [...source];
  if (isObject(source))
    return {...source};
  return source;
}

const each = exports.each = (source, cb) => {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (cb(source[key], key) === false)
        return false;
    }
  }
  return true;
}


const pick = exports.pick = (source, keys) => {
  const target = {};
  for (const key of keys) {
    if (source.hasOwnProperty(key))
      target[key] = source[key];
  }
  return target;
}

const merge = exports.merge = (target, ...sources) => {
  for (const source of sources) {
    for (const key in source) {
      if (isObject(target[key]) && isObject(source[key])) {
        merge(target[key], source[key]);
      } else {
        target[key] = source[key]
      }
    }
  }
  return target;
}
