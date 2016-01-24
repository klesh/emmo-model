var _ = require('lodash');
var util = require('util');
var Promise2 = require('bluebird');
var Expression = require('./expression.js');

var showSql = process.argv.indexOf('--show-sql') >= 0;
var showValues = process.argv.indexOf('--show-values') >= 0;

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
  this.agent = em.agent;
  this.definition = em.definition;
  this.normalized = em.normalized;
  this.database = database;
}

/**
 * Make sure the connection is open and hold!
 *
 * @private
 */
Session.prototype.open = function() {
  if (this.connection)
    return Promise.resolve(this.connection);

  if (!this.connecting) {
    var self = this;
    var connectionString = util.format(this.em.connectionString, this.database);
    this.connecting = this.agent.connect(connectionString)
                                .spread(function(connection, release) {
                                  self.connection = connection;
                                  self.release = release;
                                  return self.connection;
                                })
                                .error(function(err) {
                                  err.EM_ERROR_CODE = 'connection';
                                  return Promise2.reject(err);
                                });
  }
  return this.connecting;
};

/**
 * Make sure the connection is released properly.
 *
 * @private
 */
Session.prototype.close = function() {
  if (this.release) {
    this.release();
    delete this.connection;
    delete this.release;
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
  var self = this;
  return this.open().then(function(connection) {
    if (showSql) console.log(sqlScript);
    if (showValues) console.log(JSON.stringify(sqlParams, null, 2));
    return self.agent.query(connection, sqlScript, sqlParams).then(self.agent.result).catch(function(err) {
      return Promise2.reject(new Error(err.message + ' sql:' + sqlScript));
    });
  });
};

/**
 * Insert a new row into database
 *
 * @param {string}    modelName
 * @param {object}    data
 * @returns {Promise<object>} the inserted id will be added to data instance.
 */
Session.prototype.insert = function(modelName, data) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var updatable = _.pick(data, modelDef.updatableColumnNames);
  var columns = _.keys(updatable);
  var values = _.values(updatable);
  var sql = util.format('INSERT INTO %s (%s) VALUES (%s)' + agent.separator,
                        agent.quote(tableDef.tableName),
                        columns.map(agent.quote).join(', '), 
                        _.range(values.length).map(agent.placehold).join(', '));

  return this.query(sql, values).then(function(rows) {
    if (modelDef.autoIncrementColumnName) {
      return agent.returnId(self.connection).then(function(id) {
        data[modelDef.autoIncrementColumnName] = id * 1;
        return data;
      });
    }
  });
};


// to create a values hodler
Session.prototype.values = function() {
  var self = this;
  var values = [];
  values.add = function(value) {
    var ph = self.agent.placehold(values.length);
    values.push(value);
    return ph;
  };
  return values;
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
 * // JSON only accept keys as string, when you need to compare over functions,
 * // use this pair to do so:  `_: [ KEY, VALUE ]`
 * { _: [ em.count(), em.gt(5) ] }
 *   =>  COUNT(*) > 5
 *
 * // add mathematical operations
 * { "age": em.o("id").plus(10).subtract(1) }
 *   => "age" = "id" + 10 - 1
 *
 * @typedef Where
 * @type {object|array}
 */

/**
 * @private
 */
Session.prototype.where = function(modelDef, where, values, group) {
  var agent = this.agent, self = this, names = modelDef.columnNames;


  function process(value, right) {
    if (_.isArray(value)) {
      return '(' + _.map(value, process).join(' OR ') + ')';
    } else if (_.isPlainObject(value)) {
      return '(' + _.map(value, function(v, k) {
        var leftPart, rightPart;
        if (k === '_') {
          leftPart = process(v[0]);
          v = v[1];
        } else {
          leftPart = agent.quote(k);
        }
        if (_.isArray(v)) { // deal with IN operator
          rightPart = ' IN (';
          for (var i = 0, j = v.length; i < j; i++) {
            if (i > 0) rightPart += ', ';
            rightPart += process(v[i]);
          }
          rightPart += ')';
        } else {
          rightPart = process(v, true);
        }
        return leftPart + rightPart;
      }).join(' AND ') + ')';
    } else if (value instanceof Expression) {
      var t = value.isOperator || !right ? '' : '=';
      t += value.evaluate(process);
      return t;
    }
    
    var p = values.add(value);
    return right ? '=' + p : p;
  }

  if (_.isEmpty(where)) return '';
  var sql = process(where);
  if (group) return sql;
  if (sql) return ' WHERE ' + sql;
  return '';
};

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
 * @param {string}               modelName
 * @param {object}               data
 * @param {Where|array|string}  [where]     perform a batch update against rows match conditions
 *                                           <p>omitted: treated as normal row updating by primary key</p>
 *                                           <p>array: update rows whose has same values for that array of keys of data</p>
 *                                           <p>string: as an one element array</p>
 *                                           <p>Where: @see Where</p>
 * @returns {Promise<number>}                affectedRows
 */
Session.prototype.update = function(modelName, data, where) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var updatable = _.pick(data, modelDef.updatableColumnNames);
  var columns = _.keys(updatable);
  //var values = _.values(updatable);

  if (where) {
    if (_.isString(where)) where = [where];

    if (_.isPlainObject(where)) {
      where = _.pick(where, modelDef.columnNames);
      if (_.isEmpty(where))
        throw new Error('where condition came up empty, please make sure specified columns exists in Model');

    } else if (_.every(where, _.isString)) {
      var length = where.length;
      where = _.pick(data, where);
      if (length != _.size(where))
        throw new Error("where condition didn't match, please make sure specified columns exists in Model");
    }
  } else {
    where = _.pick(data, modelDef.primaryKeys);
  }

  var values = this.values();
  var sql = 'UPDATE ' + agent.quote(tableDef.tableName) + ' SET ';
  sql += columns.map(function(c) {
    var setSql = agent.quote(c) + '=';
    var value = updatable[c];
    if (value instanceof Expression) {
      setSql += value.evaluate(values.add);
    } else {
      setSql += values.add(value);
    }
    return setSql;
  }).join(', ');

  sql += this.where(modelDef, where, values);
  sql += agent.separator;
  return this.query(sql, values).then(function(rows) { return rows.affectedRows; });
};

/**
 * Update a row or Insert one if affectedRows equals 0
 *
 * @param {string}        modelName
 * @param {object}        data
 * @param {Where}         [where]
 */
Session.prototype.upsert = function(modelName, data, where) {
  var self = this;
  return self.update(modelName, data, where).tap(function(ar) {
    if (ar === 0)
      return self.insert(modelName, data);
  });
};

/**
 * Delete rows
 *
 * @param {string}        modelName
 * @param {Where}         [where]
 */
Session.prototype.delete = function(modelName, where) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var sql = "DELETE FROM " + agent.quote(tableDef.tableName);
  var values = this.values();
  sql += this.where(modelDef, where, values);
  return this.query(sql, values).then(function(rows) { return rows.affectedRows; });
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
 * @property {Where}                    where
 * @property {string|object|array}      orderby
 * @property {string}                   groupby
 * @property {string}                   having
 */

/**
 * select rows from table
 *
 * @param {string}        modelName
 * @param {SelectOption}  [options]
 * @return {Promise<Model[]>}
 */
Session.prototype.all = function(modelName, options) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var field = "*";
  options = options || {};
  var values = this.values();

  function quoteField(f) {
    if (_.isString(f)) return agent.quote(f);
    if (f instanceof Expression) return f.evaluate(quoteField);
    return f;
  }

  function quoteSelect(o) {
    if (_.isPlainObject(o)) {
      return _.map(o, function(f, alias) {
        return quoteField(f) + ' AS ' + quoteField(alias);
      }).join(', ');
    }
    if (_.isArray(o)) {
      return _.map(o, function(f) {
        return quoteField(f);
      }).join(', ');
    }
    return quoteField(o);
  }

  if (options.field) {
    field = quoteSelect(options.field);
  }

  var sql = util.format('SELECT %s FROM %s', field, agent.quote(tableDef.tableName));
  sql += this.where(modelDef, options.where, values);

  if (options.groupby) {
    sql += ' GROUP BY ' + this.quoteField(options.groupby);
    
    if (options.having) {
      sql += ' HAVING ' + this.where(modelDef, options.having, values, true);
    }
  }

  if (options.order) {
    sql += ' ORDER BY ';
    
    if (_.isArray(options.order))
      sql += _.map(options.order, function(f) { return self.quoteField(f); }).join(', ');
    else if (_.isObject(options.order))
      sql += _.map(options.order, function(s, c) { 
        var t = self.quoteField(c);
        if (s === false || (_.isString(s) && s.toLowerCase() === 'desc'))
          t += ' DESC';
        return t;
      }).join(', ');
    else
      sql += this.quoteField(options.order);
  }

  if (options.offset) {
    sql = agent.offset(sql, values.add(options.offset));
  }
  if (options.limit) {
    sql = agent.limit(sql, values.add(options.limit));
  }

  return this.query(sql, values).then(function(rows) {
    var Model = self.em.models[modelName];
    return Promise2.map(rows, function(row) {
      var model = new Model(row);
      return model.fix().thenReturn(model);
    });
  });
};

/**
 * same as all but return first row of the result.
 */
Session.prototype.one = function(modelName) {
  return this.all.apply(this, arguments).then(function(models) {
    return models[0];
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
 * @param {string}           modelName
 * @param {Where|...any}     where       you can pass primary key values directly
 * @return {Promise<Model>}
 */
Session.prototype.find = function(modelName, where) {
  if (!_.isObject(where)) {
    if (arguments.length < 2)
      throw new Error('where parameter is required');
    
    var num = arguments.length - 1;
    var pks = this.definition[modelName].primaryKeys;
    if (pks.length != num)
      throw new Error(modelName + ' has ' + pks.length + ' column(s) as PRIMARKY, but got ' + num);

    var tmp = {};
    for (var i = 1, j = arguments.length; i < j; i++) {
      var pkn = pks[i - 1];
      var pkv = arguments[i];
      tmp[pkn] = pkv;
    }
    where = tmp;
  }
  return this.all(modelName, {where: where}).then(_.first);
};

/**
 * return the value of first cell of the query result.
 *
 * @param {string}        modelName
 * @param {SelectOptions} options
 * @returns {Promise<any>}
 */
Session.prototype.scalar = function(modelName, options) {
  return this.all(modelName, options).then(function(rows) {
    if (!rows || rows.length === 0)
      return;
    return _.values(rows[0])[0];
  });
};

/**
 * count
 *
 * @param {string}        modelName
 * @param {Where}         [where]
 * @returns {Promise<number>}
 */
Session.prototype.count = function(modelName, where) {
  return this.scalar(modelName, { field: this.em.count(), where: where }).then(function(c) {
    return c * 1;
  });
};

/**
 * convert options's page/size to offset/limit for you
 *
 * @param {string}          modelName
 * @param {SelectOptions}   options     accept extra settings page and size and convert to offset/limit
 */
Session.prototype.paginate = function(modelName, options) {
  var page = options.page * 1 || 1;
  if (page < 1) page = 1;
  var size = options.size * 1 || 20;
  if (size < 1) size = 20;

  options.offset = (page - 1) * size;
  options.limit = size;
  return this.all(modelName, options);
};

module.exports = Session;
