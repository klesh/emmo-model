"use strict";
/* jshint node: true */
var _ = require('lodash');
var util = require('util');
var P = require('bluebird');
var Expression = require('./expression.js');
var Builder = require('./builder.js');

var debug = require('debug')('emmo-model:session');

/**
 * Session represent a active connection to a specific database
 * <p>All your operation over database happen here</p>
 * <p>pass following flags to observe sql and params</p>
 * <pre>
 * $ node bin/www --show-sql --shoq-values
 * </pre>
 *
 * @constructor
 */
function Session(em, database) {
  this.em = em;
  this.database = database;
}

/**
 * Make sure the connection is open and hold!
 *
 * @private
 */
Session.prototype.open = function() {
  var self = this, em = self.em, agent = em.agent;

  if (self.connection)
    return P.resolve(self.connection);

  if (!self.connecting) {
    var connectionString = util.format(em.config.connectionString, self.database);
    self.connecting = agent.connect(connectionString).spread(function(connection, release) {
      self.connection = connection;
      self.release = release;
      return self.connection;
    }).error(function(err) {
      var error = new Error('Connect to database fail, please check your connectionString and make sure Server is running.' + err.message);
      error.code = 'E_CONNECTION_FAIL';
      return P.reject(error);
    });
  }
  return self.connecting;
};

/**
 * Make sure the connection is released properly.
 *
 * @private
 */
Session.prototype.close = function() {
  var self = this;
  if (self.release) {
    self.release();
    delete self.connection;
    delete self.release;
  }
};

/**
 * @typedef Result
 * @type {array}
 * @property {number} affectedRows
 */
/**
 * Simple as its name, run query and return result as an Array(with a extra affectedRows property).
 *
 * @param {string} sqlScript   sql statement
 * @param {array}  sqlParams
 * @returns {Promise<Result>}
 */
Session.prototype.query = function(sqlScript, sqlParams) {
  var self = this, em = self.em, agent = em.agent;
  return self.open().then(function(connection) {
    var start = new Date();
    return agent.query(connection, sqlScript, sqlParams).then(agent.result).catch(function(err) {
      return P.reject(new Error(err.message + '\n sql:' + sqlScript));
    }).finally(() => {
      debug('script: ', sqlScript);
      debug('params: ', sqlParams);
      debug('elapse: ', new Date() - start);
    });
  });
};

/**
 * Insert a new row into database
 *
 * @param {string}    entityName
 * @param {object}    data          data should be well formated
 * @returns {Promise<object>} the inserted id will be added to data instance.
 */
Session.prototype.insert = function(entityName, data, options) {
  var b = new Builder(this.em, entityName).insert(data, options);

  var self = this;
  return this.query(b.sql, b.values).then(function(result) {
    if (b.entity.autoIncrementName) {
      return b.agent.getInsertId(result, b, this).then(function(id) {
        data[b.entity.autoIncrementName] = id * 1;
      });
    }
  }).then(function() {
    return data;
  });
};

/**
 * @example
 *
 * // for AND operator:
 * { age: 20, rank: 100, remark: null }
 *   => "age" = 20 AND "rank" = 100 AND "remark" IS NULL
 *
 * // for OR operator:
 * [ { age: 20 }, { rank: 100, remark: null } ]
 *   => "age" = 20 OR ( "rank" = 100 AND "remark" IS NULL )
 *
 * // for IN operator:
 * { age: 20, rank: [ 20, 30, 40 ] }
 *   => "age" = 20 AND "rank" IN (20, 30, 40)
 *
 * // for like (startsWith, endsWith, contains)
 * [ { age: 20, rank: em.gt(50) }, { firstName: em.startsWith("John") } ]
 *   => ("age" = 20 AND "rank" > 50) OR "firstName" LIKE "John%"
 *
 * // add mathematical operations
 * { "age": em.o("id").plus(10).subtract(1), "name": em.o("firstName").concate(' ').concate("lastName") }
 *   => "age" = "id" + 10 - 1
 *
 * // since JSON only accept string as key, PSEUDO KEYs are introduced, starts with _ or $:
 *
 *  { _COUNT: [ em.count(), em.gt(5) ] } // like HAVING clause
 *   =>  COUNT(*) > 5
 *
 *  { $AGEID: [ { age: 20 }, { id: em.gt(20) } ], departmentId: 1 } // OR inside AND
 *   => ("age" = 20 OR "id" > 20) AND ("departmentId" = 1)
 *
 * @typedef Condition
 * @type {object|array}
 */

/**
 * Update a row
 *
 * @example
 *
 * // normally:
 * update('User', { id: 1, age: 23 })
 *
 * // batch
 * update('User', { rank: 100 }, { id: [ 'in', [1,2,3] ] } )
 * update('User', { age: 90, remark: 'old' }, 'age');
 *
 * // incremental
 * update('User', { age: em.o('age').plus(10) })
 *
 * @param {string}                    entityName
 * @param {object}                    data
 * @param {Condition|array|string}    [where]     perform a batch update against rows match conditions
 *                                                <p>omitted: treated as normal row updating by primary key</p>
 *                                                <p>array: update rows whose has same values for that array of keys of data</p>
 *                                                <p>string: as an one element array</p>
 *                                                <p>Where: @see Where</p>
 * @returns {Promise<number>}                affectedRows
 */
Session.prototype.update = function(entityName, data, where) {
  var b = new Builder(this.em, entityName);

  if (where) {
    if (_.isString(where))
      where = [where];

    if (_.isArray(where) && _.every(where, _.isString)) {
      var length = where.length;
      where = _.pick(data, where);
      if (length != _.size(where))
        throw new Error("where condition didn't match, please make sure keys are matched to entity.");
    }
  } else {
    where = _.pick(data, b.entity.primaryKeyNames);
  }

  b.update(data, where);

  if (!b.sql) // nothing to update
    return P.resolve();

  return this.query(b.sql, b.values).then(function(rows) { return rows.affectedRows; });
};

/**
 * Update a row or Insert one if affectedRows equals 0
 *
 * @param {string}        entityName
 * @param {object}        data
 * @param {Condition}     [where]
 */
Session.prototype.upsert = function(entityName, data, where) {
  var self = this;
  var entity = this.em.entities[entityName];

  if (!entity)
    throw new Error(entityName + ' NOT FOUND');

  if (entity.autoIncrementName && !where && !data[entity.autoIncrementName])
    return self.insert(entityName, data);

  return self.update(entityName, data, where).tap(function(ar) {
    if (ar === 0)
      return self.insert(entityName, data);
  });
};

/**
 * Delete rows
 *
 * @param {string}        entityName
 * @param {Condition}     [where]
 */
Session.prototype.delete = function(entityName, where) {
  var b = new Builder(this.em, entityName).delete(where);
  return this.query(b.sql, b.values).then(function(rows) { return rows.affectedRows; });
};

/**
 * @example
 *
 *  // single field:
 *  { field: 'nick', where: { id: 1 } }
 *  { field: em.count(), where { id: em.gt(20) } }
 *
 *  // multiple fields:
 *  { field: [ 'nick', 'firstName' ], where: { id: 1 } }
 *
 *  // alias, assume in db we have a user's age is 22
 *  { field: { aged: em.o('age').plus(30) } }
 *    => {aged: 52}
 *
 *  // order by single field ASC
 *  { field: 'name', order: 'id' }
 *
 *  // order by multiple field ASC
 *  { field: 'name', order: [ 'name', 'id' ] }
 *
 *  // join, select users by department title
 *  { field: '*', join: 'Department', where: { departmentId: em.o('Department.id'), title: 'Office' } }
 *
 *  // order by desc:
 *  { field: 'name', order: { id: 'DESC' } }
 *  { field: 'name', order: { id: false } }
 *
 *  // groupby and having:
 *  ```
 *  {
 *    field: 'deparmentId',
 *    groupby: 'deparmentId',
 *    having: {
 *      _: [ em.count, em.gt(4) ]
 *    }
 *  }
 *  ```
 *
 * @typedef SelectOptions
 * @type {object}
 * @property {string|Expression|array}  field
 * @property {string}                   join
 * @property {Condition}                where
 * @property {string|object|array}      orderby
 * @property {string}                   groupby
 * @property {string}                   having
 */

/**
 * select rows from table
 *
 * @param {string}        entityName
 * @param {SelectOptions}  [options]
 * @return {Promise<Model[]>}
 */
Session.prototype.all = function(entityName, options) {
  var b = new Builder(this.em, entityName).select(options);

  return this.query(b.sql, b.values).then(function(rows) {
    var Model = b.em.models[entityName];
    return P.map(rows, function(row) {
      return new Model(row);
    });
  });
};

/**
 * same as all but return first row of the result.
 */
Session.prototype.one = function(entityName, options) {
  options = options || {};
  options.limit = 1;
  return this.all(entityName, options).then(function(models) {
    return models[0];
  });
};

/**
 * same as all but return first cells as array.
 */
Session.prototype.array = function(entityName, options) {
  return this.all(entityName, options).then(function(models) {
    return models.map(function(model) {
      for (var k in model)
        return model[k];
    });
  });
};

/**
 * find row from table
 *
 * @example
 * User.find(1)
 * UserRole.find(1, 2)
 * User.find({ age: 20, id: 2 })
 *
 * @param {string}                entityName
 * @param {Condition|...any}      where       you can pass primary key values directly
 * @return {Promise<Model>}
 */
Session.prototype.find = function(entityName, where) {
  if (_.isNumber(where) || _.isString(where) || _.isDate(where)) {
    where = [ where ];
  }

  if (_.isArray(where)) {
    var entity = this.em.entities[entityName];
    var pks = entity.primaryKeyNames;
    if (pks.length != where.length)
      throw new Error(entityName + ' has ' + pks.length + ' column(s) as PRIMARKY, but got ' + where.length);

    var tmp = {};
    for (var i = 0, j = where.length; i < j; i++) {
      var pkn = pks[i];
      var pkv = where[i];
      tmp[pkn] = pkv;
    }
    where = tmp;
  }
  return this.all(entityName, {where: where}).then(_.first);
};

/**
 * return the value of first cell of the query result.
 *
 * @param {string}        entityName
 * @param {SelectOptions} options
 * @returns {Promise<any>}
 */
Session.prototype.scalar = function(entityName, options) {
  return this.all(entityName, options).then(function(rows) {
    if (rows && rows.length > 0) {
      for (var k in rows[0])
        return rows[0][k];
    }
  });
};

Session.prototype.begin = function() {
  this.hasTransaction = true;
  return this.query('BEGIN');
};

Session.prototype.commit = function() {
  this.hasTransaction = false;
  return this.query('COMMIT');
};

Session.prototype.rollback = function() {
  this.hasTransaction = false;
  return this.query('ROLLBACK');
};

/**
 * count
 *
 * @param {string}        entityName
 * @param {Condition}     [where]
 * @returns {Promise<number>}
 */
Session.prototype.count = function(entityName, where) {
  return this.scalar(entityName, { field: this.em.count(), where: where }).then(function(c) {
    return c * 1;
  });
};

/**
 * convert options's page/size to offset/limit for you
 *
 * @param {string}          entityName
 * @param {SelectOptions}   options     accept extra settings page and size and convert to offset/limit
 */
Session.prototype.paginate = function(entityName, options) {
  var page = options.page * 1 || 1;
  if (page < 1) page = 1;
  var size = options.size * 1 || 20;
  if (size < 1) size = 20;

  options.offset = (page - 1) * size;
  options.limit = size;
  return this.all(entityName, options);
};

/**
 * Check if data different from database, return true when row exists and different
 *
 * @param {string}            entityName
 * @param {object}            data
 * @param {Condition|array}   array: pick those keys from data as Condition
 * @return {Promise<boolean>}
 */
Session.prototype.expired = function(entityName, data, condition) {
  var entity = this.em.entities[entityName];

  var keys = _.intersection(_.keys(data), entity.updatableNames);
  if (keys.length === 0)
    return P.resolve(false);


  if (_.isArray(condition))
    condition = _.pick(data, condition);
  else if (condition === undefined)
    condition = _.pick(data, entity.primaryKeyNames);
  else if (!_.isObject(condition))
    throw new Error('Unknow type of conditon');

  return this.one(entityName, { field: keys, where: condition }).then(function(model) {
    if (!model)
      return false;

    var changed = [];
    for (var i = 0, j = keys.length; i < j; i++) {
      var key = keys[i];
      if (!_.isEqual(data[key], model[key]))
        changed.push(key);
    }
    if (changed.length)
      return changed;

    return false;
  });
};

/**
 * update row data with timestamp if data is different from database
 * note that you need to provide primary key values in data object
 *
 * @example
 * // assume we have a updatedAt column for User
 * User.refresh({ id: 10, firstName: 'new name' });
 *
 * // or you have a different columnName(modifiedAt):
 * User.refresh({ firstName: 'new guy' }, { id: 10, siteId: 1 })
 *
 * // or just compare only certain properties, this would not update:
 * User.refresh({ id: 10, remark: 'new remark' }, [ 'firstName', 'lastName', 'age' ] )
 *
 *
 * @param {string}              entityName
 * @param {object}              data
 * @param {Condition|array}     [condition]
 * @param {string}              [property]     updatedAt
 * @returns {Promise}
 */
Session.prototype.refresh = function(entityName, data, condition, property) {
  var self = this;
  return this.expired(entityName, data, condition).tap(function(expired) {
    if (!expired)
      return false;

    data[property || 'updatedAt'] = new Date();
    return self.update(entityName, data, condition);
  });
};

module.exports = Session;
