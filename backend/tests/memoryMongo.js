/**
 * In-memory stand-in for MongoDB used by automated tests.
 * Patches compiled Mongoose models so Jest can run without a mongod binary.
 * Production code always uses a real MongoDB connection.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { ObjectId } = mongoose.Types;

const collections = new Map();
const uniqueIndexes = new Map();
const modelMeta = new Map();

function idString(value) {
  if (value == null) return '';
  if (value._id && !value.toHexString) return String(value._id);
  return String(value);
}

function clone(value) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value);
  if (value instanceof ObjectId) return new ObjectId(String(value));
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$')) continue;
      out[k] = clone(v);
    }
    return out;
  }
  return value;
}

function same(a, b) {
  if (a == null && b == null) return true;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return idString(a) === idString(b);
}

function cmpValue(value) {
  if (value instanceof Date) return value.getTime();
  if (value instanceof ObjectId) return String(value);
  return value;
}

function isOperatorObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !(value instanceof ObjectId) &&
    !Array.isArray(value) &&
    Object.keys(value).some((key) => key.startsWith('$'))
  );
}

function match(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return expected.some((sub) => match(doc, sub));
    }
    if (key === '$and') {
      return expected.every((sub) => match(doc, sub));
    }
    const actual = doc[key];
    if (isOperatorObject(expected)) {
      if (expected.$ne !== undefined && same(actual, expected.$ne)) return false;
      if (expected.$in && !expected.$in.some((item) => same(actual, item))) return false;
      if (expected.$gte !== undefined && !(cmpValue(actual) >= cmpValue(expected.$gte))) return false;
      if (expected.$gt !== undefined && !(cmpValue(actual) > cmpValue(expected.$gt))) return false;
      if (expected.$lte !== undefined && !(cmpValue(actual) <= cmpValue(expected.$lte))) return false;
      if (expected.$lt !== undefined && !(cmpValue(actual) < cmpValue(expected.$lt))) return false;
      return true;
    }
    return same(actual, expected);
  });
}

function duplicateError(fields) {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  err.keyPattern = fields;
  err.keyValue = fields;
  return err;
}

function ensureUnique(name, doc, excludeId) {
  const indexes = uniqueIndexes.get(name) || [];
  const rows = collections.get(name) || [];
  for (const fields of indexes) {
    const conflict = rows.find((row) => {
      if (excludeId && idString(row._id) === idString(excludeId)) return false;
      return fields.every((field) => same(row[field], doc[field]));
    });
    if (conflict) {
      const key = {};
      fields.forEach((field) => {
        key[field] = doc[field];
      });
      throw duplicateError(key);
    }
  }
}

function applyUpdate(doc, update = {}) {
  const next = clone(doc);
  const hasOps = Object.keys(update).some((key) => key.startsWith('$'));
  if (!hasOps) {
    Object.assign(next, clone(update));
    return next;
  }
  if (update.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) {
      next[key] = (Number(next[key]) || 0) + Number(amount);
    }
  }
  if (update.$set) {
    Object.assign(next, clone(update.$set));
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) {
      delete next[key];
    }
  }
  return next;
}

function equalityFromFilter(filter = {}) {
  const out = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('$') || isOperatorObject(value)) continue;
    out[key] = clone(value);
  }
  return out;
}

function sortDocs(docs, sort) {
  if (!sort) return docs;
  const entries = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of entries) {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (cmpValue(av) < cmpValue(bv)) return dir < 0 ? 1 : -1;
      if (cmpValue(av) > cmpValue(bv)) return dir < 0 ? -1 : 1;
    }
    return 0;
  });
}

function project(doc, select, { hidePassword }) {
  const copy = clone(doc);
  if (hidePassword && !(typeof select === 'string' && select.includes('+password'))) {
    delete copy.password;
  }
  if (typeof select === 'string' && select && !select.startsWith('+')) {
    const fields = select.split(/\s+/).filter(Boolean);
    if (fields.length) {
      const picked = { _id: copy._id };
      fields.forEach((field) => {
        picked[field] = copy[field];
      });
      return picked;
    }
  }
  return copy;
}

function lookup(field, value) {
  if (field === 'itemId') {
    return (collections.get('items') || []).find((row) => same(row._id, value)) || null;
  }
  if (field === 'achievementId') {
    return (collections.get('achievements') || []).find((row) => same(row._id, value)) || null;
  }
  return value;
}

function wrap(name, doc, options = {}) {
  const meta = modelMeta.get(name) || {};
  const data = project(doc, options.select, { hidePassword: Boolean(meta.hidePassword) });

  const persist = async (current) => {
    const rows = collections.get(name);
    const snapshot = clone(current);
    if (meta.hashPassword && snapshot.password && !String(snapshot.password).startsWith('$2')) {
      snapshot.password = await bcrypt.hash(snapshot.password, 4);
      current.password = snapshot.password;
    }
    snapshot.updatedAt = new Date();
    current.updatedAt = snapshot.updatedAt;
    ensureUnique(name, snapshot, snapshot._id);
    const idx = rows.findIndex((row) => same(row._id, snapshot._id));
    if (idx === -1) rows.push(snapshot);
    else rows[idx] = snapshot;
    return current;
  };

  const instance = { ...data };

  Object.defineProperties(instance, {
    save: {
      enumerable: false,
      value: async function save() {
        return persist(this);
      }
    },
    deleteOne: {
      enumerable: false,
      value: async function deleteOne() {
        const rows = collections.get(name);
        collections.set(
          name,
          rows.filter((row) => !same(row._id, this._id))
        );
      }
    },
    toObject: {
      enumerable: false,
      value: function toObject() {
        return clone(this);
      }
    },
    toJSON: {
      enumerable: false,
      value: function toJSON() {
        const obj = clone(this);
        delete obj.password;
        return obj;
      }
    },
    populate: {
      enumerable: false,
      value: async function populate(field) {
        this[field] = clone(lookup(field, this[field]));
        return this;
      }
    },
    matchPassword: {
      enumerable: false,
      value: async function matchPassword(entered) {
        const stored = (collections.get(name) || []).find((row) => same(row._id, this._id));
        if (!stored || !stored.password) return false;
        return bcrypt.compare(entered, stored.password);
      }
    }
  });

  return instance;
}

class Query {
  constructor(name, filter = {}, options = {}) {
    this.name = name;
    this.filter = filter;
    this.options = options;
    this._sort = null;
    this._skip = 0;
    this._limit = Infinity;
    this._lean = false;
    this._populate = [];
    this._select = null;
    this._one = Boolean(options.one);
  }

  sort(spec) {
    this._sort = spec;
    return this;
  }

  skip(count) {
    this._skip = count || 0;
    return this;
  }

  limit(count) {
    this._limit = count;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  select(spec) {
    this._select = spec;
    return this;
  }

  populate(field) {
    this._populate.push(field);
    return this;
  }

  async exec() {
    const meta = modelMeta.get(this.name) || {};
    let rows = (collections.get(this.name) || []).filter((row) => match(row, this.filter));
    rows = sortDocs(rows, this._sort);
    rows = rows.slice(this._skip, this._skip + (Number.isFinite(this._limit) ? this._limit : rows.length));

    const mapped = rows.map((row) => {
      let doc = project(row, this._select, { hidePassword: Boolean(meta.hidePassword) });
      this._populate.forEach((field) => {
        doc[field] = clone(lookup(field, doc[field]));
      });
      if (this._lean) return doc;
      return wrap(this.name, { ...row, ...doc }, { select: this._select });
    });

    if (this._one) return mapped[0] || null;
    return mapped;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

async function createDoc(name, raw) {
  const meta = modelMeta.get(name) || {};
  const now = new Date();
  const doc = {
    ...clone(raw),
    _id: raw._id || new ObjectId(),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now
  };

  if (meta.defaults) {
    for (const [key, value] of Object.entries(meta.defaults)) {
      if (doc[key] === undefined) doc[key] = typeof value === 'function' ? value() : value;
    }
  }

  if (meta.hashPassword && doc.password && !String(doc.password).startsWith('$2')) {
    doc.password = await bcrypt.hash(doc.password, 4);
  }

  ensureUnique(name, doc);
  collections.get(name).push(doc);
  return wrap(name, doc, { select: meta.hashPassword ? '+password' : undefined });
}

async function findOneAndUpdate(name, filter, update, options = {}) {
  const rows = collections.get(name);
  const current = rows.find((row) => match(row, filter));
  if (!current) {
    if (!options.upsert) return null;
    const created = {
      ...equalityFromFilter(filter),
      ...(update.$setOnInsert ? clone(update.$setOnInsert) : {}),
      _id: new ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const next = applyUpdate(created, update);
    ensureUnique(name, next);
    rows.push(next);
    return wrap(name, next);
  }
  const next = applyUpdate(current, update);
  ensureUnique(name, next, current._id);
  const idx = rows.findIndex((row) => same(row._id, current._id));
  rows[idx] = next;
  return wrap(name, options.new === false ? current : next);
}

function patchModel(Model, name, meta = {}) {
  modelMeta.set(name, meta);
  if (!collections.has(name)) collections.set(name, []);
  uniqueIndexes.set(name, meta.unique || []);

  Model.create = async (payload) => {
    if (Array.isArray(payload)) {
      const docs = [];
      for (const item of payload) docs.push(await createDoc(name, item));
      return docs;
    }
    return createDoc(name, payload);
  };

  Model.find = (filter = {}) => new Query(name, filter);
  Model.findOne = (filter = {}) => new Query(name, filter, { one: true });
  Model.findById = (id) => new Query(name, { _id: id }, { one: true });
  Model.countDocuments = async (filter = {}) =>
    (collections.get(name) || []).filter((row) => match(row, filter)).length;
  Model.findOneAndUpdate = (filter, update, options) => findOneAndUpdate(name, filter, update, options);
  Model.findByIdAndUpdate = (id, update, options) =>
    findOneAndUpdate(name, { _id: id }, update, options);
  Model.updateOne = async (filter, update, options = {}) => {
    const result = await findOneAndUpdate(name, filter, update, { ...options, new: true });
    return { acknowledged: true, modifiedCount: result ? 1 : 0, upsertedCount: result ? 1 : 0 };
  };
  Model.deleteOne = async (filter) => {
    const rows = collections.get(name) || [];
    const next = rows.filter((row) => !match(row, filter));
    const deletedCount = rows.length - next.length;
    collections.set(name, next);
    return { deletedCount };
  };
  Model.deleteMany = async (filter = {}) => {
    const rows = collections.get(name) || [];
    const next = rows.filter((row) => !match(row, filter));
    const deletedCount = rows.length - next.length;
    collections.set(name, next);
    return { deletedCount };
  };
  Model.createIndexes = async () => undefined;
}

function installMemoryMongo() {
  collections.clear();
  ['users', 'quests', 'questcompletions', 'items', 'inventories', 'achievements', 'userachievements', 'tokenblacklists'].forEach(
    (name) => collections.set(name, [])
  );

  const User = require('../src/models/User');
  const Quest = require('../src/models/Quest');
  const QuestCompletion = require('../src/models/QuestCompletion');
  const Item = require('../src/models/Item');
  const Inventory = require('../src/models/Inventory');
  const Achievement = require('../src/models/Achievement');
  const UserAchievement = require('../src/models/UserAchievement');
  const TokenBlacklist = require('../src/models/TokenBlacklist');

  patchModel(User, 'users', {
    hidePassword: true,
    hashPassword: true,
    unique: [['email']],
    defaults: {
      level: 1,
      xp: 0,
      gold: 0,
      streak: 0,
      longestStreak: 0,
      totalQuestsCompleted: 0,
      totalGoldEarned: 0,
      lastActiveDate: null
    }
  });
  patchModel(Quest, 'quests');
  patchModel(QuestCompletion, 'questcompletions', {
    unique: [['userId', 'questId', 'periodKey']]
  });
  patchModel(Item, 'items', { unique: [['name']] });
  patchModel(Inventory, 'inventories', { unique: [['userId', 'itemId']] });
  patchModel(Achievement, 'achievements', { unique: [['key']] });
  patchModel(UserAchievement, 'userachievements', { unique: [['userId', 'achievementId']] });
  patchModel(TokenBlacklist, 'tokenblacklists', { unique: [['token']] });

  mongoose.connect = async () => mongoose.connection;
  mongoose.disconnect = async () => undefined;
  mongoose.connection.close = async () => undefined;
}

function resetMemoryMongo(preserve = []) {
  for (const [name] of collections) {
    if (preserve.includes(name)) continue;
    collections.set(name, []);
  }
}

module.exports = {
  installMemoryMongo,
  resetMemoryMongo,
  collections
};
