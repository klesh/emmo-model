var _ = require('lodash');
var base = require('./base.js');
var pg = require('pg');
var Promise = require('bluebird');
var util = require('util');

Promise.promisifyAll(pg);

_.extend(module.exports, base, {
  defaultDatabase: 'postgres',
  quote: function(name) {
    return '"' + name + '"';
  },
  columnType: function(columnDef) {
    if (columnDef.autoIncrement)
      return columnDef.type == 'int' ? 'serial' : 'bigserial';

    return base.columnType(columnDef);
  },
  // return a promise connection instance
  connect: function(connectionString, database) {
    return pg.connectAsync(util.format(connectionString, database || defaultDatabase));
  },
  // return a promise query instance
  query: function(connection, sqlScript, sqlParams) {
    return connection.queryAsync(sqlScript, sqlParams);
  },
  "select": function(tableDef, options) {
    
  },
  "insert": function(tableDef, data) {
    var self = this;
    var columns = _.intersection(_.keys(tableDef.columns), _.keys(data));
    return util.format('INSERT INTO %s (%s) VALUES (%s)' + this.separator,
                      this.quote(tableDef.tableName),
                      columns.map(function(c){ return self.quote(c); }), 
                      this.placeholds(columns));
  },
  "update": function(tableDef, data) {
    var self = this;
    var columns = _.intersection(_.keys(tableDef.columns), _.keys(data));
    return util.format('UPDATE %s SET %s WHERE %s' + this.separator,
                      this.quote(tableDef.tableName),
                      columns.map(function(c, n) { 
                        return util.format('%s=%s', self.quote(c), self.placehold(c, n));
                      }).join(', '),
                      tableDef.primaryKeys.columns.map(function(p, n) {
                        return util.format('%s=%s', self.quote(p), self.placehold(p, n+columns.length));
                      }).join(', '));
  },
  "delete": function(tableDef, data) {
    var self = this;
    return util.format('DELETE FROM %s WHERE %s',
                      this.quote(tableDef.tableName),
                      this.where(tableDef, data, tableDef.primaryKeys.columns));
  },
  "where": function(tableDef, data, where, params) {
    index = index || 0;
    var self = this;
    if (_.isArray(where)) where = _.pick(data, where);
    return where.map(function(v, k) { 
      self.addParam(params, v, k);
      return util.format('%s=%s', self.quote(k), self.placehold(k, params.length - 1)); 
    }).join(', ');
  }
});
