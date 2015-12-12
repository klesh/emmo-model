var util = require('util');
var _ = require('lodash');
var Promise2 = require('bluebird');
var Expression = require('./expression.js');

var showSql = process.argv.indexOf('--show-sql') >= 0;
var showValues = process.argv.indexOf('--show-values') >= 0;

function Session(em, database) {
  this.em = em;
  this.agent = em.agent;
  this.definition = em.definition;
  this.normalized = em.normalized;
  this.database = database;
}

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
                                });
  }
  return this.connecting;
};

Session.prototype.close = function() {
  if (this.release) {
    this.release();
    delete this.connection;
    delete this.release;
  }
};

Session.prototype.query = function(sqlScript, sqlParams) {
  var self = this;
  return this.open().then(function(connection) {
    if (showSql) console.log(sqlScript);
    if (showValues) console.log(JSON.stringify(sqlParams, null, 2));
    return self.agent.query(connection, sqlScript, sqlParams).then(self.agent.result);
  });
};

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

Session.prototype.update = function(modelName, data, where) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var updatable = _.pick(data, modelDef.updatableColumnNames);
  var columns = _.keys(updatable);
  var values = _.values(updatable);

  if (_.isArray(where) || _.isString(where)) {
    where = _.pick(data, where);
  } else if (_.isPlainObject(where)) {
    where = _.pick(where, modelDef.columnNames);
  } else {
    where = _.pick(data, modelDef.primaryKeys);
  }

  var index = 0;
  var sql = util.format('UPDATE %s SET %s',
                        agent.quote(tableDef.tableName),
                        columns.map(function(c, n) { 
                          return util.format('%s=%s', agent.quote(c), agent.placehold(index++));
                        }).join(', '));
  if (!_.isEmpty(where)) {
    sql += ' WHERE ' + this.where(modelDef, where, values);
  }
  sql += agent.separator;
  return this.query(sql, values).then(function(rows) { return rows.affectedRows; });
};

Session.prototype.upsert = function(modelName, data, where) {
  var self = this;
  return self.update(modelName, data, where).then(function(ar) {
    if (ar === 0)
      return self.insert(modelName, data);
  });
};

Session.prototype.delete = function(modelName, where) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  where = _.pick(where, modelDef.columnNames);
  var values = [];
  
  var sql = util.format('DELETE FROM %s WHERE %s', 
                       agent.quote(tableDef.tableName),
                       this.where(modelDef, where, values));
  return this.query(sql, values).then(function(rows) { return rows.affectedRows; });
};

Session.prototype.where = function(modelDef, where, values) {
  var agent = this.agent, self = this;
  function doPair(v, k) {
    var s = '=', l = modelDef.columnNames.indexOf(k) >= 0 ? self.quoteField(k) : k, r = '';
    if (_.isArray(v)) {
      if (v.length != 2) { 
        // deal with multiple condition to same field. 
        // { where: { issueDate: [ ['>', start], 'OR', ['<', end]  ] } }
        return _.map(v, function(e) {
          if (_.isArray(e))
            return doPair(e, k);
          return e;
        }).join(' ');
      }

      s = v[0];
      
      s = s.toUpperCase();
      if (s === 'IN' || s === 'NOT IN') {
        // { where: { id: [ 'in', ids ] } }
        if (!_.isArray(v[1]) || v[1].length === 1) {
          s = s === 'IN' ? '=' : '<>';
          v = _.isArray(v[1]) ? v[1][0] : v[1];
        } else {
          r = util.format('(%s)', _.map(v[1], function(ve) {
            values.push(ve);
            return agent.placehold(values.length - 1);
          }));
        }
      } else if (v[1] instanceof Expression) {
        r = v[1].expr;
      } else {
        if (s === '!=') s = '<>';
        v = v[1];
      }
    }
    if (v === null) {
      s = s === '=' ? 'IS' : 'IS NOT';
      r = 'NULL';
    }
    if (!r) {
      values.push(v);
      r = agent.placehold(values.length - 1);
    }
    return util.format("%s %s %s", l, s, r);
  }
  return _.map(where, doPair).join(' AND ');
};

Session.prototype.quoteField = function(f) {
  if (_.isString(f)) return this.agent.quote(f);
  if (f instanceof Expression) return f.expr;
  return f;
};

Session.prototype.quoteSelect = function(o) {
  var self = this;
  if (_.isPlainObject(o)) {
    return _.map(o, function(f, alias) {
      return self.quoteField(f) + ' AS ' + self.quoteField(alias);
    }).join(', ');
  }
  if (_.isArray(o)) {
    return _.map(o, function(f) {
      return self.quoteField(f);
    }).join(', ');
  }
  return self.quoteField(o);
};

Session.prototype.select = function(modelName, options) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var field = "*";
  options = options || {};
  var values = [];

  if (options.field) {
    field = this.quoteSelect(options.field);
  }
  var sql = [util.format('SELECT %s FROM %s', field, agent.quote(tableDef.tableName))];
  if (options.where) {
    var where = this.where(modelDef, options.where, values);
    if (where) {
      sql.push('WHERE');
      sql.push(where);
    }
  }
  if (options.groupby) {
    sql.push(util.format('GROUP BY %s', this.quoteField(options.groupby)));
    if (options.having) {
      sql.push(util.format('HAVING %s', this.where(modelDef, options.having, values)));
    }
  }
  if (options.order) {
    sql.push('ORDER BY');
    if (_.isArray(options.order))
      sql.push(options.order.map(function(f) {
        return self.quoteField(f);
      })).join(', ');
    else if (_.isObject(options.order))
      sql.push(_.map(options.order, function(sorting, column) {
        return util.format('%s %s', self.quoteField(column), 
                           _.isString(sorting) ? sorting.toUpperCase() : (!sorting ? 'DESC' : 'ASC'));
      }).join(', '));
    else
      sql.push(this.quoteField(options.order));
  }

  var script = sql.join(' ');
  if (options.offset) {
    values.push(options.offset);
    script = agent.offset(script, values.length - 1);
  }
  if (options.limit) {
    values.push(options.limit);
    script = agent.limit(script, values.length - 1);
  }

  return this.query(script, values).then(function(rows) {
    var Model = self.em.models[modelName];
    return Promise2.map(rows, function(row) {
      var model = new Model(row);
      return model.fix().thenReturn(model);
    });
  });
};

Session.prototype.selectOne = function(modelName, options) {
  var self = this;
  return this.select(modelName, options).then(function(rows) {
    if (rows.length < 1)
      return null;
    return new self.em.models[modelName](rows[0]);
  });
};

Session.prototype.scalar = function(modelName, options) {
  return this.select(modelName, options).then(function(rows) {
    if (!rows || rows.length === 0)
      return;
    return _.values(rows[0])[0];
  });
};

Session.prototype.find = function(modelName, where) {
  if (where === undefined) throw new Error('where condition can not be undefined');
  if (!_.isObject(where)) {
    var pks = this.definition[modelName].primaryKeys;
    if (pks && pks.length === 1) {
      var pkv = where;
      where = {};
      where[pks[0]] = pkv;
    } else {
      throw new Error('%s need to have one and only one column as primary key for find by id function', modelName);
    }
  }
  return this.selectOne(modelName, {where: where});
};

Session.prototype.tryFillOrder = function(modelName, options, isDesc) {
  if (!options || options.order) return;
  var pks = this.definition[modelName].primaryKeys;
  if (pks && pks.length == 1) {
    options.order = {};
    options.order[pks[0]] = isDesc ? 'DESC' : 'ASC';
  }
};

Session.prototype.all = function(modelName, options) {
  this.tryFillOrder(modelName, options);
  return this.select(modelName, options);
};

Session.prototype.one = function(modelName, options) {
  return this.selectOne(modelName, options);
};

Session.prototype.paginate = function(modelName, options) {
  var page = options.page * 1 || 1;
  if (page < 1) page = 1;
  var size = options.size * 1 || 20;
  if (size < 1) size = 20;

  options.offset = (page - 1) * size;
  options.limit = size;
  this.tryFillOrder(modelName, options, true);
  return this.select(modelName, options);
};

module.exports = Session;
