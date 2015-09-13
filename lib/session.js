var util = require('util');
var _ = require('lodash');

var showSql = process.argv.indexOf('--show-sql') >= 0;

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
        data[modelDef.autoIncrementColumnName] = id;
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
  where = where ? _.pick(where, modelDef.columnNames) : _.pick(data, tableDef.primaryKeys.columns);
  var index = 0;
  var sql = util.format('UPDATE %s SET %s WHERE %s' + agent.separator,
                        agent.quote(tableDef.tableName),
                        columns.map(function(c, n) { 
                          return util.format('%s=%s', agent.quote(c), agent.placehold(index++));
                        }).join(', '),
                        _.map(where, function(v, c) {
                          values.push(v);
                          return util.format('%s=%s', agent.quote(c), agent.placehold(index++));
                        }).join(', '));
  return this.query(sql, values);
};

Session.prototype.delete = function(modelName, where) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  where = _.pick(where, modelDef.columnNames);
  var columns = _.keys(where);
  var values = _.values(where);
  var sql = util.format('DELETE FROM %s WHERE %s', 
                       agent.quote(tableDef.tableName),
                       columns.map(function(c, n) {
                         return util.format('%s=%s', agent.quote(c), agent.placehold(n));
                       }));
  return this.query(sql, values);
};

Session.prototype.select = function(modelName, options) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  var field = "*";
  if (options.field) {
    if (_.isArray(options.field))
      field = _.intersection(options.field, modelDef.columnNames).map(agent.quote).join(', ');
    else
      field = agent.quote(options.field);
  }
  var sql = [util.format('SELECT %s FROM %s', field, agent.quote(tableDef.tableName))];
  var values = [];
  if (options.where) {
    sql.push('WHERE');
    _.forOwn(_.pick(options.where, modelDef.columnNames), function(v, k) {
      var s = '=';
      if (_.isArray(v)) {
        s = v[0];
        v = v[1];
      }
      values.push(v);
      sql.push(util.format("%s %s %s", agent.quote(k), s, agent.placehold(values.length - 1)));
    });
  }
  if (options.order) {
    sql.push('ORDER BY');
    if (_.isArray(options.order))
      sql.push(options.order.map(agent.quote)).join(', ');
    else if (_.isObject(options.order))
      sql.push(_.map(options.order, function(sorting, column) {
        return util.format('%s %s', agent.quote(column), !sorting || sorting.toUpperCase() === 'DESC' ? 'DESC' : 'ASC');
      }).join(', '));
    else
      sql.push(agent.quote(options.order));
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

  return this.query(script, values);
};

Session.prototype.selectOne = function(modelName, options) {
  return this.select(modelName, options).then(function(rows) {
    return rows[0];
  });
};

Session.prototype.scalar = function(modelName, options) {
  return this.select(modelName, options).then(function(rows) {
    if (!rows || rows.length == 0)
      return;
    return _.values(rows[0])[0];
  });
};

Session.prototype.find = function(modelName, where) {
  return this.selectOne(modelName, {where: where});
};

module.exports = Session;
