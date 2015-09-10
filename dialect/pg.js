var _ = require('lodash');
var base = require('./base.js');
var pg = require('pg');
var Promise = require('bluebird');
var util = require('util');

Promise.promisifyAll(pg);

_.extend(module.exports, base, {
  defaults: {
    database: 'postgres'
  },
  connect: function(connectionString, database) {
    return pg.connectAsync(util.format(connectionString, database || this.defaults.database));
  },
  query: function(connection, sqlScript, sqlParams) {
    return connection.queryAsync(sqlScript, sqlParams);
  },
  quote: function(name) {
    return '"' + name + '"';
  },
  columnType: function(columnDef) {
    if (columnDef.autoIncrement)
      return columnDef.type == 'int' ? 'serial' : 'bigserial';

    return base.columnType(columnDef);
  }
});
