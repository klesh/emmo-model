var _ = require('lodash');
var base = require('./base.js');
var pg = require('pg');
var Promise = require('bluebird');
var util = require('util');

Promise.promisifyAll(pg);

_.extend(module.exports, base, {
  defaultDatabase: 'postgres',
  // return a promise connection instance
  connect: function(connectionString, database) {
    return pg.connectAsync(util.format(connectionString, database || this.defaults.database));
  },
  // return a promise query instance
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
