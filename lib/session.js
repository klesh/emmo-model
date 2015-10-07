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
                        this.where(modelDef, where, values));
  return this.query(sql, values).then(scalar);
};

Session.prototype.delete = function(modelName, where) {
  var self = this, modelDef = this.definition[modelName], tableDef = this.normalized[modelName], agent = this.agent;
  where = _.pick(where, modelDef.columnNames);
  var values = [];
  
  var sql = util.format('DELETE FROM %s WHERE %s', 
                       agent.quote(tableDef.tableName),
                       this.where(modelDef, where, values));
  return this.query(sql, values).then(scalar);
};

Session.prototype.where = function(modelDef, where, values) {
  var agent = this.agent;
  return _.map(_.pick(where, modelDef.columnNames), function(v, k) {
    var s = '=', l = agent.quote(k), r = '';
    if (_.isArray(v)) {
      s = v[0];
      
      if (s == 'in') {
        r = util.format('(%s)', _.map(v[1], function(ve) {
          values.push(ve);
          return agent.placehold(values.length - 1);
        }));
      } else {
        v = v[1];
      }
    }
    if (!r) {
      values.push(v);
      r = agent.placehold(values.length - 1);
    }
    return util.format("%s %s %s", l, s, r);
  }).join(' AND ');
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
    sql.push(this.where(modelDef, options.where, values));
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

  return this.query(script, values).then(function(rows) {
    var Model = self.em.models[modelName];
    return rows.map(function(row) {
      return new Model(row);
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
  return this.select(modelName, options).then(scalar);
};

Session.prototype.find = function(modelName, where) {
  return this.selectOne(modelName, {where: where});
};


function scalar(rows) {
  if (!rows || rows.length === 0)
    return;
  return _.values(rows[0])[0];
}

module.exports = Session;
